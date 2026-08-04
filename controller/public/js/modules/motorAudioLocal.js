'use strict';

/**
 * Motor de áudio/vídeo do modo apresentação, para quando a projeção corre nesta máquina.
 *
 * ## Porque isto existe
 *
 * Alguém tem de ter os elementos `<audio>`/`<video>` que efectivamente tocam. No modo
 * remoto é a janela de controle do Servidor: o motor de projeção manda-lhe `audio_play`
 * por IPC e ela toca. Sem Servidor não há essa janela — os comandos chegavam ao motor e
 * morriam lá, sem erro nenhum, e o som simplesmente não saía.
 *
 * No modo local o painel assume esse papel. É o mesmo motor da `control.html`, com os
 * mesmos eventos e o mesmo formato de estado, porque quem consome do outro lado — o
 * player do painel, o celular — não deve notar diferença.
 *
 * ## Não confundir com o `lyra-audio-local`
 *
 * O painel já tem um `<audio>`/`<video>` para a barra de progresso, sem som. Este motor
 * usa elementos próprios, tal como o Servidor tem os dele. São dois papéis diferentes na
 * mesma janela: um mostra o progresso, o outro toca.
 */

/**
 * @param {{
 *   aoReceberComando: (cb: (comando: string, dados: any) => void) => (() => void),
 *   publicarEstado: (estado: object) => void
 * }} ponte
 */
export function criarMotorAudioLocal(ponte) {
  const elAudio = document.getElementById('lyra-audio-engine');
  const elVideo = document.getElementById('lyra-video-engine');
  let nomeAtual = '';
  let tipoAtual = '';
  let cancelarPonte = null;

  function elementoActivo() {
    return tipoAtual === 'video' ? elVideo : elAudio;
  }

  function pararElemento(el) {
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    try {
      el.load();
    } catch (_) {
      // intencional — alguns estados do elemento recusam `load()` e não há o que fazer
    }
  }

  function pararTudo() {
    pararElemento(elAudio);
    pararElemento(elVideo);
    nomeAtual = '';
    tipoAtual = '';
  }

  function publicarEstado() {
    const el = elementoActivo() || elAudio;
    if (!el) return;
    ponte.publicarEstado({
      name: nomeAtual,
      mediaKind: tipoAtual || (el === elVideo ? 'video' : 'audio'),
      playing: !!el.src && !el.paused && !el.ended,
      currentTime: Number(el.currentTime) || 0,
      duration: Number.isFinite(el.duration) ? Number(el.duration) : 0,
      volume: Number.isFinite(el.volume) ? el.volume : 1,
    });
  }

  function ligarEventos(el) {
    if (!el || el.dataset.lyraMotorBound === '1') return;
    el.dataset.lyraMotorBound = '1';
    /* `timeupdate` é o que alimenta a barra de progresso do painel e do celular; os
       restantes existem para que play/pause/fim se reflictam sem esperar pelo próximo
       tick. */
    for (const evento of ['timeupdate', 'loadedmetadata', 'play', 'pause']) {
      el.addEventListener(evento, publicarEstado);
    }
    el.addEventListener('ended', () => {
      if (el === elementoActivo()) {
        nomeAtual = '';
        tipoAtual = '';
      }
      publicarEstado();
    });
  }

  const COMANDOS = {
    audio_play(dados) {
      const src = String(dados?.src || '').trim();
      if (!src) return;
      const tipo = dados?.mediaKind === 'video' ? 'video' : 'audio';
      const el = tipo === 'video' ? elVideo : elAudio;
      if (!el) return;

      pararTudo();
      tipoAtual = tipo;
      nomeAtual = String(dados?.name || (tipo === 'video' ? 'Vídeo' : 'audio'));

      const v = Number(dados?.volume);
      const vol = Number.isFinite(v)
        ? Math.max(0, Math.min(1, v))
        : Math.max(0, Math.min(1, Number(el.volume) || 1));
      if (elAudio) elAudio.volume = vol;
      if (elVideo) elVideo.volume = vol;
      el.src = src;

      /* Vídeo com `autoplay: false` fica armado no início, à espera do play do operador —
         é assim que o telão mostra o primeiro frame sem começar a tocar. */
      if (tipo === 'video' && dados?.autoplay === false) {
        el.pause();
        try {
          el.currentTime = 0;
        } catch (_) {
          // intencional — sem metadados ainda, o tempo fica onde está
        }
        publicarEstado();
        return;
      }

      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(publicarEstado);
      publicarEstado();
    },

    audio_pause() {
      const el = elementoActivo();
      if (el) el.pause();
      publicarEstado();
    },

    audio_stop() {
      pararTudo();
      publicarEstado();
    },

    audio_volume(dados) {
      const v = Number(dados?.volume);
      if (!Number.isFinite(v)) return;
      const vol = Math.max(0, Math.min(1, v));
      if (elAudio) elAudio.volume = vol;
      if (elVideo) elVideo.volume = vol;
      publicarEstado();
    },

    audio_seek(dados) {
      const t = Number(dados?.time);
      if (!Number.isFinite(t)) return;
      const el = elementoActivo();
      if (el) el.currentTime = Math.max(0, t);
      publicarEstado();
    },
  };

  /** Começa a atender comandos. Idempotente. */
  function ligar() {
    if (cancelarPonte) return;
    ligarEventos(elAudio);
    ligarEventos(elVideo);
    cancelarPonte = ponte.aoReceberComando((comando, dados) => {
      const fn = COMANDOS[comando];
      if (fn) fn(dados);
    });
  }

  /** Para o que estiver a tocar e larga a ponte. */
  function desligar() {
    if (cancelarPonte) {
      cancelarPonte();
      cancelarPonte = null;
    }
    pararTudo();
  }

  return { ligar, desligar, comandos: Object.keys(COMANDOS) };
}
