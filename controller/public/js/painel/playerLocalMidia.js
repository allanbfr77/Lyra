/**
 * Mídias: motor de áudio/vídeo local (previa/controle) e reprodução no servidor — play, pausa, volume,
 * seek, mudo, loop e relógio da interface. Movido verbatim do núcleo (`controllerAppCore.js`); o que o
 * núcleo ainda possui entra por `registrarDependenciasPlayerLocalMidia`.
 */
import { fmtTempoAudio } from '../modules/midiaApresentacao.js';
import { aguardarMetadadosVideo, reescreverUrlVideoParaTelas, restaurarItemVideoApresentacao, videoProjetadoAtivoNoPlayer } from './videoApresentacao.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasPlayerLocalMidia(d) {
  dep = d || {};
}
const armarGuardaVisualRetomadaAudio = (...a) => dep.armarGuardaVisualRetomadaAudio(...a);
const enviarComandoAudioProjeccao = (...a) => dep.enviarComandoAudioProjeccao(...a);
const hostProjecao = (...a) => dep.hostProjecao(...a);
const limparGuardaVisualRetomadaAudio = (...a) => dep.limparGuardaVisualRetomadaAudio(...a);
const salvarEstadoModoApresentacaoNoStorage = (...a) => dep.salvarEstadoModoApresentacaoNoStorage(...a);
const aoTerminarVideoPlaylist = (...a) => dep.aoTerminarVideoPlaylist(...a);
const atualizarPlaylistUiAoVivoSeMudou = (...a) => dep.atualizarPlaylistUiAoVivoSeMudou(...a);
const playlistControlaReproducaoAtual = (...a) => dep.playlistControlaReproducaoAtual(...a);

let audioLocalMotorPronto = false;

function obterElementoAudioLocal() {
  return document.getElementById('lyra-audio-local');
}

export function obterElementoVideoLocal() {
  return document.getElementById('lyra-video-local');
}

/** Vídeo local só para barra de progresso — áudio exclusivo no telão de projeção. */
export function prepararElementoVideoLocalControle(el) {
  if (!el) return;
  el.muted = true;
  el.playsInline = true;
}

/** Reproduz o elemento de preview local (sempre mudo) em sincronia com o telão. */
export function reproduzirElementoPreviewLocal(t) {
  const el = obterElementoVideoLocal();
  if (!el || !el.src) return;
  el.muted = true;
  if (Number.isFinite(t)) {
    try {
      el.currentTime = Math.max(0, Number(t));
    } catch (_) {
  // intencional — erro ignorado
}
  }
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function pausarElementoPreviewLocal() {
  const el = obterElementoVideoLocal();
  if (el && !el.paused) {
    try {
      el.pause();
    } catch (_) {
  // intencional — erro ignorado
}
  }
}

/** Elemento-slot atualmente rastreado pelo overlay de preview (ou null). */
let _previewAlvoAtual = null;

/** Retorna o slot alvo do preview ao vivo (card 5 ou playlist) — só quando reproduzindo. */
function alvoPreviewVideoAtual() {
  const id = dep.getApresentacaoMidiaProjetadaId();
  if (!id || dep.getAudioStateRemoto().mediaKind !== 'video' || !dep.getAudioStateRemoto().playing) return null;
  const card5 = dep.getApresentacaoCards()?.[dep.getAPRESENTACAO_IDX_CARD5()];
  if (card5 && card5.id === id) return document.getElementById('ap-card5-video-live-slot');
  if ((dep.getApresentacaoVideoPlaylist() || []).some((x) => x && x.id === id)) {
    return document.getElementById('ap-playlist-preview');
  }
  return null;
}

/** Ajusta as coordenadas do overlay para cobrir exatamente o slot alvo atual. */
export function posicionarOverlayPreview() {
  const overlay = document.getElementById('lyra-video-overlay');
  if (!overlay) return;
  const alvo = _previewAlvoAtual;
  if (!alvo || !alvo.isConnected) {
    overlay.classList.remove('ativo');
    overlay.style.left = '-99999px';
    overlay.style.top = '-99999px';
    return;
  }
  const r = alvo.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) {
    overlay.classList.remove('ativo');
    overlay.style.left = '-99999px';
    overlay.style.top = '-99999px';
    return;
  }
  overlay.style.left = `${Math.round(r.left)}px`;
  overlay.style.top = `${Math.round(r.top)}px`;
  overlay.style.width = `${Math.round(r.width)}px`;
  overlay.style.height = `${Math.round(r.height)}px`;
  overlay.classList.add('ativo');
}

/**
 * Atualiza o preview de vídeo ao vivo (mudo) via OVERLAY fixo — o elemento de vídeo
 * nunca é movido no DOM (evita o quadro preto do Chromium ao reposicionar mídia).
 * Apenas o overlay acompanha as coordenadas do slot alvo (card 5 ou playlist).
 */
export function atualizarPreviewVideoAoVivo() {
  const overlay = document.getElementById('lyra-video-overlay');
  const el = obterElementoVideoLocal();
  const slotPlaylist = document.getElementById('ap-playlist-preview');
  if (!overlay || !el) return;
  const alvo = alvoPreviewVideoAtual();
  _previewAlvoAtual = alvo;
  /* Reserva o espaço do slot da playlist só quando ele é o alvo. */
  if (slotPlaylist) {
    if (alvo === slotPlaylist) {
      slotPlaylist.classList.add('reservado');
      slotPlaylist.hidden = false;
    } else {
      slotPlaylist.classList.remove('reservado');
      slotPlaylist.hidden = true;
    }
  }
  if (alvo) {
    el.muted = true;
    if (el.src && el.paused && dep.getAudioStateRemoto().playing) {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    posicionarOverlayPreview();
  } else {
    overlay.classList.remove('ativo');
    overlay.style.left = '-99999px';
    overlay.style.top = '-99999px';
  }
}

function obterElementoPlayerAtivo() {
  return dep.getAudioStateRemoto().mediaKind === 'video' ? obterElementoVideoLocal() : obterElementoAudioLocal();
}

function pararElementoMidia(el) {
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  try {
    el.load();
  } catch (_) {
  // intencional — erro ignorado
}
}

/** Telão é a única instância em reprodução — evita dupla decodificação e sync contínuo. */
function videoPlaybackUsaTelaoComoFonte() {
  return videoProjetadoAtivoNoPlayer();
}

let _videoUiClockRaf = null;
let _videoUiClockBase = 0;
let _videoUiClockT0 = 0;

function pararRelogioUiVideo() {
  if (_videoUiClockRaf) {
    cancelAnimationFrame(_videoUiClockRaf);
    _videoUiClockRaf = null;
  }
}

export function iniciarRelogioUiVideo() {
  pararRelogioUiVideo();
  const dur = Math.max(0, Number(dep.getAudioStateRemoto().duration) || 0);
  /* O relógio mostra segundos. Refazer textos, ícones e barra a cada quadro era pagar 60
     atualizações de DOM — com um `getBoundingClientRect` dentro, ou seja, um cálculo de
     layout forçado — para mudar um dígito uma vez por segundo. */
  let ultimoSegundoUi = -1;
  const tick = () => {
    if (!videoProjetadoAtivoNoPlayer() || !dep.getAudioStateRemoto().playing) {
      pararRelogioUiVideo();
      return;
    }
    const elapsed = (performance.now() - _videoUiClockT0) / 1000;
    let t = _videoUiClockBase + elapsed;
    if (dur > 0 && t >= dur) {
      if (playlistControlaReproducaoAtual()) {
        dep.getAudioStateRemoto().playing = false;
        dep.getAudioStateRemoto().currentTime = dur;
        atualizarUiPlayerAudioRemoto();
        emitirEstadoVideoParaServidor({ playing: false, syncTime: true, currentTime: dur });
        pararRelogioUiVideo();
        aoTerminarVideoPlaylist();
        return;
      }
      if (dep.getAudioLoopAtivo()) {
        _videoUiClockBase = 0;
        _videoUiClockT0 = performance.now();
        dep.getAudioStateRemoto().playing = true;
        dep.getAudioStateRemoto().currentTime = 0;
        atualizarUiPlayerAudioRemoto();
        emitirEstadoVideoParaServidor({ playing: true, syncTime: true, currentTime: 0 });
        reproduzirElementoPreviewLocal(0);
        _videoUiClockRaf = requestAnimationFrame(tick);
        return;
      }
      t = dur;
      dep.getAudioStateRemoto().playing = false;
      dep.getAudioStateRemoto().currentTime = t;
      atualizarUiPlayerAudioRemoto();
      emitirEstadoVideoParaServidor({ playing: false, syncTime: true, currentTime: t });
      pararRelogioUiVideo();
      return;
    }
    dep.getAudioStateRemoto().currentTime = t;
    const segundo = Math.floor(t);
    if (segundo !== ultimoSegundoUi) {
      ultimoSegundoUi = segundo;
      atualizarUiPlayerAudioRemoto();
    } else if (_previewAlvoAtual) {
      /* O overlay do preview continua a acompanhar o layout a cada quadro — é para isso
         que este laço existe. O resto da UI não precisa. */
      posicionarOverlayPreview();
    }
    _videoUiClockRaf = requestAnimationFrame(tick);
  };
  _videoUiClockRaf = requestAnimationFrame(tick);
}

export function emitirEstadoVideoParaServidor(opts = {}) {
  if (!videoProjetadoAtivoNoPlayer()) {
    return;
  }
  const syncTime = opts.syncTime === true;
  const el = obterElementoVideoLocal();
  const payload = {
    playing:
      opts.playing != null
        ? !!opts.playing
        : el && !videoPlaybackUsaTelaoComoFonte()
          ? !el.paused && !el.ended
          : !!dep.getAudioStateRemoto().playing,
    volume: Math.max(0, Math.min(1, Number(dep.getAudioStateRemoto().volume) || 1)),
  };
  if (syncTime) {
    payload.syncTime = true;
    payload.currentTime =
      Number(opts.currentTime ?? (el && !videoPlaybackUsaTelaoComoFonte() ? el.currentTime : dep.getAudioStateRemoto().currentTime)) || 0;
  }
  if (dep.getProjecao().enviar('apresentacao_video_state', payload)) return;
  const ip = hostProjecao();
  if (!ip) {
    return;
  }
  fetch(`http://${ip}:5510/api/comando/apresentacao_video_state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function sincronizarEstadoPlayerLocalDesdeElemento() {
  if (dep.getAudioStateRemoto().mediaKind === 'video' && videoPlaybackUsaTelaoComoFonte()) {
    atualizarUiPlayerAudioRemoto();
    return;
  }
  const el = obterElementoPlayerAtivo();
  if (!el) return;
  dep.setAudioStateRemoto({
    ...dep.getAudioStateRemoto(),
    playing: !el.paused && !el.ended,
    currentTime: Number(el.currentTime) || 0,
    duration: Number.isFinite(el.duration) ? Number(el.duration) : 0,
    volume:
      dep.getAudioStateRemoto().mediaKind === 'video'
        ? dep.getAudioStateRemoto().volume
        : Number.isFinite(el.volume)
          ? el.volume
          : dep.getAudioStateRemoto().volume,
  });
  atualizarUiPlayerAudioRemoto();
}

function ligarEventosElementoPlayer(el) {
  if (!el || el.dataset.lyraPlayerBound === '1') return;
  el.dataset.lyraPlayerBound = '1';
  el.addEventListener('timeupdate', sincronizarEstadoPlayerLocalDesdeElemento);
  el.addEventListener('loadedmetadata', sincronizarEstadoPlayerLocalDesdeElemento);
}

function configurarMotorAudioLocalApresentacao() {
  if (audioLocalMotorPronto) return;
  const audioEl = obterElementoAudioLocal();
  const videoEl = obterElementoVideoLocal();
  if (!audioEl && !videoEl) return;
  audioLocalMotorPronto = true;
  const vol = Math.max(0, Math.min(1, Number(dep.getAudioStateRemoto().volume) || 1));
  if (audioEl) audioEl.volume = vol;
  if (videoEl) prepararElementoVideoLocalControle(videoEl);
  ligarEventosElementoPlayer(audioEl);
  ligarEventosElementoPlayer(videoEl);
}

export async function prepararPlayerVideoAposProjetar(item) {
  const it = await restaurarItemVideoApresentacao(item);
  if (!it?.src) return;
  configurarMotorAudioLocalApresentacao();
  pararElementoMidia(obterElementoAudioLocal());
  dep.setApresentacaoAudioAtualId(null);
  const el = obterElementoVideoLocal();
  if (!el) return;
  dep.getAudioStateRemoto().mediaKind = 'video';
  dep.getAudioStateRemoto().name = it.name || 'Vídeo';
  dep.getAudioStateRemoto().playing = false;
  dep.getAudioStateRemoto().currentTime = 0;
  try {
    prepararElementoVideoLocalControle(el);
    el.preload = 'metadata';
    el.src = it.src;
    el.pause();
    await aguardarMetadadosVideo(el, 6000);
    if (Number.isFinite(el.duration) && el.duration > 0) {
      dep.getAudioStateRemoto().duration = Number(el.duration);
    }
    try {
      el.currentTime = 0;
    } catch (_) {
  // intencional — erro ignorado
}
    atualizarUiPlayerAudioRemoto();
    emitirEstadoVideoParaServidor({ playing: false, syncTime: true, currentTime: 0 });
  } catch (e) {
    console.warn('[Lyra] player vídeo', e);
  }
}

export function pausarAudioLocalApresentacao() {
  if (videoProjetadoAtivoNoPlayer()) {
    pararRelogioUiVideo();
    pausarElementoPreviewLocal();
    dep.setAudioStateRemoto({
      ...dep.getAudioStateRemoto(),
      mediaKind: 'video',
      playing: false,
    });
    atualizarUiPlayerAudioRemoto();
    emitirEstadoVideoParaServidor({
      playing: false,
      syncTime: true,
      currentTime: Number(dep.getAudioStateRemoto().currentTime) || 0,
    });
    return;
  }
  const el = obterElementoPlayerAtivo();
  if (el) el.pause();
  dep.setAudioStateRemoto({ ...dep.getAudioStateRemoto(), playing: false });
  atualizarUiPlayerAudioRemoto();
}

export function pararAudioLocalApresentacao() {
  const eraVideo = videoProjetadoAtivoNoPlayer();
  pararRelogioUiVideo();
  dep.setAudioLoopReinicioPendente(false);
  pararElementoMidia(obterElementoAudioLocal());
  pararElementoMidia(obterElementoVideoLocal());
  dep.setAudioStateRemoto({
    ...dep.getAudioStateRemoto(),
    playing: false,
    currentTime: 0,
    duration: 0,
    name: '',
    mediaKind: '',
  });
  atualizarUiPlayerAudioRemoto();
  if (eraVideo) {
    const payload = {
      playing: false,
      syncTime: true,
      currentTime: 0,
      volume: Math.max(0, Math.min(1, Number(dep.getAudioStateRemoto().volume) || 1)),
    };
    if (!dep.getProjecao().enviar('apresentacao_video_state', payload)) {
      const ip = hostProjecao();
      if (ip) {
        fetch(`http://${ip}:5510/api/comando/apresentacao_video_state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
      }
    }
  }
}

function definirVolumeAudioLocalApresentacao(volume) {
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  const audioEl = obterElementoAudioLocal();
  const videoEl = obterElementoVideoLocal();
  if (audioEl) audioEl.volume = v;
  if (videoEl) prepararElementoVideoLocalControle(videoEl);
  dep.setAudioStateRemoto({ ...dep.getAudioStateRemoto(), volume: v });
  atualizarUiPlayerAudioRemoto();
  if (dep.getAudioStateRemoto().mediaKind === 'video') {
    const payloadVol = { playing: !!dep.getAudioStateRemoto().playing, volume: v };
    if (!dep.getProjecao().enviar('apresentacao_video_state', payloadVol)) {
      const ip = hostProjecao();
      if (ip) {
        fetch(`http://${ip}:5510/api/comando/apresentacao_video_state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadVol),
        }).catch(() => {});
      }
    }
  }
}

function seekAudioLocalApresentacao(time) {
  const t = Math.max(0, Number(time) || 0);
  if (dep.getAudioStateRemoto().mediaKind === 'video' && videoPlaybackUsaTelaoComoFonte()) {
    dep.getAudioStateRemoto().currentTime = t;
    if (dep.getAudioStateRemoto().playing) {
      _videoUiClockBase = t;
      _videoUiClockT0 = performance.now();
    }
    const el = obterElementoVideoLocal();
    if (el?.src) {
      try {
        el.currentTime = t;
      } catch (_) {
  // intencional — erro ignorado
}
    }
    atualizarUiPlayerAudioRemoto();
    emitirEstadoVideoParaServidor({
      playing: !!dep.getAudioStateRemoto().playing,
      syncTime: true,
      currentTime: t,
    });
    return;
  }
  const el = obterElementoPlayerAtivo();
  if (el) el.currentTime = t;
  sincronizarEstadoPlayerLocalDesdeElemento();
}

/** Reprodução de áudio no processo Servidor (saída padrão do Windows da máquina do servidor). */
export async function tocarAudioServidorApresentacao(item, opts = {}) {
  if (!item?.src) return false;
  const vol = Math.max(0, Math.min(1, Number(dep.getAudioStateRemoto().volume) || 1));
  const startTime = Math.max(0, Number(opts.startTime) || 0);
  if (startTime > 0 && item.id) {
    armarGuardaVisualRetomadaAudio(item.id, startTime);
  } else {
    limparGuardaVisualRetomadaAudio();
  }
  /* No modo dois PCs quem toca é a janela de controle do Servidor, na outra máquina:
     lá, `127.0.0.1:3001` é o próprio Servidor e não o controlador. A mesma reescrita que
     o vídeo já usava leva a URL para o proxy da 5510. */
  const ok = await enviarComandoAudioProjeccao('audio_play', {
    src: reescreverUrlVideoParaTelas(item.src),
    name: item.name || 'audio',
    mediaKind: 'audio',
    autoplay: opts.autoplay !== false,
    volume: vol,
  });
  if (!ok) {
    limparGuardaVisualRetomadaAudio();
  }
  if (ok) {
    if (startTime > 0) {
      await enviarComandoAudioProjeccao('audio_seek', { time: startTime });
    }
    dep.getAudioStateRemoto().mediaKind = 'audio';
    dep.getAudioStateRemoto().name = item.name || '';
    dep.getAudioStateRemoto().volume = vol;
    dep.getAudioStateRemoto().currentTime = startTime;
    if (opts.autoplay === false) {
      dep.getAudioStateRemoto().playing = false;
    }
    atualizarUiPlayerAudioRemoto();
  }
  return ok;
}

export function pausarAudioServidorPlayback() {
  if (dep.getAudioStateRemoto().mediaKind === 'video') {
    pausarAudioLocalApresentacao();
    return;
  }
  void enviarComandoAudioProjeccao('audio_pause', {});
  dep.setAudioLoopReinicioPendente(false);
  limparGuardaVisualRetomadaAudio();
  dep.setAudioStateRemoto({ ...dep.getAudioStateRemoto(), playing: false });
  atualizarUiPlayerAudioRemoto();
}

export function pararAudioServidorPlayback() {
  if (dep.getAudioStateRemoto().mediaKind === 'video') {
    pararAudioLocalApresentacao();
    return;
  }
  void enviarComandoAudioProjeccao('audio_stop', {});
  dep.setAudioLoopReinicioPendente(false);
  limparGuardaVisualRetomadaAudio();
  dep.setAudioStateRemoto({
    ...dep.getAudioStateRemoto(),
    playing: false,
    currentTime: 0,
    duration: 0,
    name: '',
    mediaKind: '',
  });
  atualizarUiPlayerAudioRemoto();
}

export function definirVolumeAudioServidor(volume) {
  if (dep.getAudioStateRemoto().mediaKind === 'video') {
    definirVolumeAudioLocalApresentacao(volume);
    return;
  }
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  void enviarComandoAudioProjeccao('audio_volume', { volume: v });
  dep.setAudioStateRemoto({ ...dep.getAudioStateRemoto(), volume: v });
  atualizarUiPlayerAudioRemoto();
}

/**
 * Botão único de mudo/desmudo do player.
 *
 * «Mudo» é volume 0 — mesmo canal que os botões −/+, então funciona para áudio e vídeo
 * sem caminho novo. Ao mutar, guarda o volume actual para o restaurar; se o volume já
 * estava a 0 (arrastado pelos −), desmutar volta a um nível audível.
 */
export function alternarMudoAudioApresentacao() {
  const volAtual = Math.max(0, Math.min(1, Number(dep.getAudioStateRemoto().volume) || 0));
  if (volAtual > 0) {
    audioVolAntesDeMutar = volAtual;
    definirVolumeAudioServidor(0);
  } else {
    const restaurar = audioVolAntesDeMutar > 0 ? audioVolAntesDeMutar : 1;
    definirVolumeAudioServidor(restaurar);
  }
}

function atualizarBotaoMudoPlayerAudio() {
  const btn = document.getElementById('ap-audio-mute');
  if (!btn) return;
  const mudo = Math.max(0, Math.min(1, Number(dep.getAudioStateRemoto().volume) || 0)) === 0;
  btn.classList.toggle('ap-ctrl-mute--on', mudo);
  btn.setAttribute('aria-pressed', mudo ? 'true' : 'false');
  btn.title = mudo ? 'Reativar som' : 'Mudo';
  btn.setAttribute('aria-label', mudo ? 'Reativar som' : 'Silenciar');
  /* Os atributos acima são idempotentes e baratos; o SVG é que não. */
  const iconeMudo = mudo ? 'mudo' : 'som';
  if (btn.dataset.lyraIcone === iconeMudo) return;
  btn.dataset.lyraIcone = iconeMudo;
  btn.innerHTML = mudo
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m16 9 5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a4 4 0 0 1 0 7M18 6a7 7 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
}

export function seekAudioServidor(time) {
  if (dep.getAudioStateRemoto().mediaKind === 'video') {
    seekAudioLocalApresentacao(time);
    return;
  }
  const t = Math.max(0, Number(time) || 0);
  limparGuardaVisualRetomadaAudio();
  void enviarComandoAudioProjeccao('audio_seek', { time: t });
  dep.setAudioStateRemoto({ ...dep.getAudioStateRemoto(), currentTime: t });
  atualizarUiPlayerAudioRemoto();
}

function renderPlayPauseIcon() {
  const btn = document.getElementById('ap-audio-play-pause');
  if (!btn) return;
  /* Dois estados, só. Reconstruir o SVG a cada `timeupdate` refazia o mesmo desenho ~4x
     por segundo — e 60x por segundo enquanto um vídeo corria, porque o relógio do vídeo
     passava por aqui a cada quadro. */
  const iconeAlvo = dep.getAudioStateRemoto().playing ? 'pause' : 'play';
  if (btn.dataset.lyraIcone === iconeAlvo) return;
  btn.dataset.lyraIcone = iconeAlvo;
  if (dep.getAudioStateRemoto().playing) {
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  } else {
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  }
}

function atualizarBotaoLoopPlayerAudio() {
  const btn = document.getElementById('ap-audio-loop');
  if (!btn) return;
  btn.classList.toggle('ap-ctrl--ativo', !!dep.getAudioLoopAtivo());
  btn.setAttribute('aria-pressed', dep.getAudioLoopAtivo() ? 'true' : 'false');
  btn.title = dep.getAudioLoopAtivo() ? 'Desativar repetir' : 'Ativar repetir';
  btn.setAttribute('aria-label', dep.getAudioLoopAtivo() ? 'Desativar repetir' : 'Ativar repetir');
}

export function alternarLoopPlayerApresentacao(force) {
  const proximoEstado = force == null ? !dep.getAudioLoopAtivo() : !!force;
  if (dep.getAudioLoopAtivo() === proximoEstado) {
    atualizarBotaoLoopPlayerAudio();
    return;
  }
  dep.setAudioLoopAtivo(proximoEstado);
  dep.setAudioLoopReinicioPendente(false);
  atualizarUiPlayerAudioRemoto();
  salvarEstadoModoApresentacaoNoStorage();
}

export function atualizarUiPlayerAudioRemoto() {
  const now = document.getElementById('ap-audio-now');
  const cur = document.getElementById('ap-audio-current');
  const dur = document.getElementById('ap-audio-duration');
  const seek = document.getElementById('ap-audio-seek');
  const volVal = document.getElementById('ap-audio-vol-val');
  const volFill = document.getElementById('ap-audio-vol-fill');
  if (now) {
    const tipo =
      dep.getAudioStateRemoto().mediaKind === 'video'
        ? 'Vídeo'
        : dep.getAudioStateRemoto().mediaKind === 'audio'
          ? 'Áudio'
          : '';
    now.textContent = dep.getAudioStateRemoto().name
      ? `${dep.getAudioStateRemoto().playing ? 'Tocando' : 'Pausado'}${tipo ? ` (${tipo})` : ''}: ${dep.getAudioStateRemoto().name}`
      : 'Nenhuma mídia no player';
    now.title = dep.getAudioStateRemoto().name ? String(dep.getAudioStateRemoto().name) : '';
  }
  if (cur) cur.textContent = fmtTempoAudio(dep.getAudioStateRemoto().currentTime);
  if (dur) dur.textContent = fmtTempoAudio(dep.getAudioStateRemoto().duration);
  let seekPct = 0;
  if (seek && !dep.getAudioSeekDragging()) {
    const d = Math.max(0, Number(dep.getAudioStateRemoto().duration) || 0);
    const c = Math.max(0, Number(dep.getAudioStateRemoto().currentTime) || 0);
    const val = d > 0 ? Math.round((c / d) * 1000) : 0;
    seek.value = String(Math.max(0, Math.min(1000, val)));
    seekPct = d > 0 ? Math.round((c / d) * 1000) / 10 : 0;
  } else if (seek) {
    const d = Math.max(0, Number(dep.getAudioStateRemoto().duration) || 0);
    const c = Math.max(0, Number(dep.getAudioStateRemoto().currentTime) || 0);
    seekPct = d > 0 ? Math.round((c / d) * 1000) / 10 : Number(seek.value) / 10;
  }
  if (seek) seek.style.setProperty('--seek-pct', `${seekPct}%`);
  const vPct = Math.round(Math.max(0, Math.min(1, Number(dep.getAudioStateRemoto().volume) || 0)) * 100);
  if (volVal) volVal.textContent = `${vPct}%`;
  if (volFill) volFill.style.width = `${vPct}%`;
  renderPlayPauseIcon();
  atualizarBotaoLoopPlayerAudio();
  atualizarBotaoMudoPlayerAudio();
  atualizarPlaylistUiAoVivoSeMudou();
  if (_previewAlvoAtual) posicionarOverlayPreview();
}

/** Volume guardado antes de mutar, para o botão de mudo restaurar ao desmutar. */
let audioVolAntesDeMutar = 1;

/* ─── Pontos de contato com o núcleo e com outros módulos (o estado acima é privado) ─── */

export function get_previewAlvoAtual() {
  return _previewAlvoAtual;
}

export function set_videoUiClockBase(valor) {
  _videoUiClockBase = valor;
}

export function set_videoUiClockT0(valor) {
  _videoUiClockT0 = valor;
}
