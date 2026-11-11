/**
 * Mídias da apresentação: publicação e leitura de vídeo/arquivos (HTTP :3001), miniaturas, restauração
 * dos itens e projeção de itens da apresentação. Movido verbatim do núcleo (`controllerAppCore.js`); o que
 * o núcleo ainda possui entra por `registrarDependenciasVideoApresentacao`.
 */
import { obterThumbVideoApresentacao, reescreverUrlVideoParaTelas as reescreverUrlVideoParaTelasPuro, urlMidiaApresentacaoHttpPorId as urlMidiaApresentacaoHttpPorIdPuro } from '../modules/midiaApresentacao.js';
import { APRESENTACAO_IDX_CARD5, estadoPainel } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasVideoApresentacao(d) {
  dep = d || {};
}
const atualizarFeedbackProjecaoApresentacaoUi = (...a) => dep.atualizarFeedbackProjecaoApresentacaoUi(...a);
const atualizarRodapeAudioApresentacao = (...a) => dep.atualizarRodapeAudioApresentacao(...a);
const emModoProjecaoLocal = (...a) => dep.emModoProjecaoLocal(...a);
const emitirApresentacao = (...a) => dep.emitirApresentacao(...a);
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const getServidorIp = (...a) => dep.getServidorIp(...a);
const getServidorProjeccaoIp = (...a) => dep.getServidorProjeccaoIp(...a);
const mensagemAlvoInvalidoApresentacao = (...a) => dep.mensagemAlvoInvalidoApresentacao(...a);
const monitoresApresentacaoCobremAlvo = (...a) => dep.monitoresApresentacaoCobremAlvo(...a);
const normalizarItemApresentacao = (...a) => dep.normalizarItemApresentacao(...a);
const obterAlvoProjecaoModoApresentacao = (...a) => dep.obterAlvoProjecaoModoApresentacao(...a);
const reidratarRotaApresentacaoDoSeletor = (...a) => dep.reidratarRotaApresentacaoDoSeletor(...a);
const salvarEstadoModoApresentacaoNoStorage = (...a) => dep.salvarEstadoModoApresentacaoNoStorage(...a);
const atualizarUiPlayerAudioRemoto = (...a) => dep.atualizarUiPlayerAudioRemoto(...a);
const cancelarAvancoAutoPlaylist = (...a) => dep.cancelarAvancoAutoPlaylist(...a);
const obterElementoVideoLocal = (...a) => dep.obterElementoVideoLocal(...a);
const prepararPlayerVideoAposProjetar = (...a) => dep.prepararPlayerVideoAposProjetar(...a);
const renderGridApresentacao = (...a) => dep.renderGridApresentacao(...a);
const tocarAudioServidorApresentacao = (...a) => dep.tocarAudioServidorApresentacao(...a);

/** Publica vídeo local no HTTP :3001 e devolve URL (evita Base64 enorme no POST ao servidor). */
async function publicarVideoApresentacaoHttp(item) {
  if (!item?.id) return String(item?.src || '').trim();
  const src = String(item.src || '').trim();
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  if (!/^data:/i.test(src)) return src;
  try {
    const r = await fetch(
      `${getControllerApiBase()}/api/apresentacao/video/${encodeURIComponent(item.id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: src, mime: item.mime || 'video/mp4' }),
      }
    );
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) return String(j.url);
  } catch (e) {
    console.warn('[Lyra] publicar vídeo HTTP', e);
  }
  return src;
}

export async function garantirVideoSrcHttp(item) {
  if (!item || item.kind !== 'video') return item;
  const url = await publicarVideoApresentacaoHttp(item);
  if (url && url !== item.src) {
    item.src = url;
  }
  return item;
}

/** URL da mídia importada (áudio ou vídeo). O servidor acha o ficheiro pelo id. */
export function urlMidiaApresentacaoHttpPorId(id) {
  return urlMidiaApresentacaoHttpPorIdPuro(id, getControllerApiBase());
}

/**
 * Manda o controlador copiar o ficheiro para a pasta do aplicativo — sem Base64.
 *
 * O caminho antigo lia o ficheiro inteiro no painel, transformava-o numa string Base64,
 * embrulhava-a em JSON e mandava-a por HTTP. Um MP3 de 7 MB custava ~92 ms e ~47 MB de
 * heap; um vídeo de 100 MB, 1,4 s e 667 MB. Aqui só viaja o caminho, e quem copia é o
 * processo principal, com uma cópia de sistema operativo.
 *
 * Devolve `true` e preenche `item.src` quando correu bem. O chamador decide o que fazer
 * com o `false` — hoje, voltar ao caminho antigo, que continua a funcionar.
 */
export async function importarMidiaApresentacaoPorCaminho(item) {
  const id = String(item?.id || '').trim();
  const filePath = String(item?.filePath || '').trim();
  if (!id || !filePath) return false;
  try {
    const r = await fetch(`${getControllerApiBase()}/api/apresentacao/midia/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, filePath, mime: item.mime || '' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok || !j.url) {
      console.warn('[Lyra] importar mídia por caminho falhou:', j.erro || `HTTP ${r.status}`);
      return false;
    }
    item.src = String(j.url);
    if (j.mime) item.mime = String(j.mime);
    return true;
  } catch (e) {
    console.warn('[Lyra] importar mídia por caminho falhou:', e);
    return false;
  }
}

function urlVideoApresentacaoHttpPorId(id) {
  const vid = String(id || '').trim();
  if (!vid) return '';
  return `${getControllerApiBase()}/api/apresentacao/video/${encodeURIComponent(vid)}`;
}

/**
 * Telões no PC do servidor remoto não alcançam `127.0.0.1:3001` do controlador —
 * reescreve para o proxy `:5510` do servidor (que encaminha ao controlador).
 * No modo local os telões são desta máquina: `:3001` já serve o vídeo e `:5510`
 * não tem proxy — manter a URL original.
 */
export function reescreverUrlVideoParaTelas(url) {
  const ip =
    (typeof getServidorProjeccaoIp === 'function'
      ? String(getServidorProjeccaoIp() || '').trim()
      : '') ||
    (typeof getServidorIp === 'function' ? String(getServidorIp() || '').trim() : '');
  return reescreverUrlVideoParaTelasPuro(url, {
    local: typeof emModoProjecaoLocal === 'function' && emModoProjecaoLocal(),
    ip,
  });
}

async function videoHttpDisponivel(url) {
  const u = String(url || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) return false;
  try {
    const r = await fetch(u, { method: 'HEAD' });
    return r.ok;
  } catch (_) {
    return false;
  }
}

async function lerVideoComoDataUrlDoCaminho(filePath) {
  const fp = String(filePath || '').trim();
  if (!fp) return '';
  try {
    const url = /^file:/i.test(fp) ? fp : `file:///${fp.replace(/\\/g, '/')}`;
    const r = await fetch(url);
    if (!r.ok) return '';
    const blob = await r.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(blob);
    });
  } catch (_) {
    return '';
  }
}

async function republicarVideoDoCaminhoArquivo(item) {
  if (!item?.id || !item.filePath) return item;
  /* A cópia por caminho primeiro: é o caminho novo, e não carrega o ficheiro em memória. */
  const copia = { ...item };
  if (await importarMidiaApresentacaoPorCaminho(copia)) return copia;
  /* Falhou (ficheiro movido, disco cheio): o caminho antigo ainda serve de rede. */
  const data = await lerVideoComoDataUrlDoCaminho(item.filePath);
  if (!data) return item;
  return garantirVideoSrcHttp({ ...item, src: data });
}

export function aguardarMetadadosVideo(el, timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!el) return resolve();
    if (Number.isFinite(el.duration) && el.duration > 0) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('loadedmetadata', finish);
      el.removeEventListener('error', finish);
      resolve();
    };
    el.addEventListener('loadedmetadata', finish, { once: true });
    el.addEventListener('error', finish, { once: true });
    setTimeout(finish, timeoutMs);
    try {
      el.load();
    } catch (_) {
      finish();
    }
  });
}

async function gerarThumbnailVideoApresentacao(src) {
  const url = String(src || '').trim();
  if (!url) return '';
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    let settled = false;
    const finish = (dataUrl) => {
      if (settled) return;
      settled = true;
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch (_) {
  // intencional — erro ignorado
}
      resolve(dataUrl || '');
    };
    const LARGURA_THUMB_PX = 320;
    const capturar = () => {
      try {
        const w = v.videoWidth || 0;
        const h = v.videoHeight || 0;
        if (w < 2 || h < 2) return finish('');
        /* A miniatura é pintada num cartão de poucos centímetros. Guardá-la na resolução
           nativa do vídeo dava 200 a 500 KB de Base64 por item — no estado, no
           localStorage e em cada sincronização — para desenhar 160 pixels. */
        const escala = Math.min(1, LARGURA_THUMB_PX / w);
        const cw = Math.max(2, Math.round(w * escala));
        const ch = Math.max(2, Math.round(h * escala));
        const c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        c.getContext('2d').drawImage(v, 0, 0, cw, ch);
        finish(c.toDataURL('image/jpeg', 0.82));
      } catch (_) {
        finish('');
      }
    };
    v.addEventListener('loadeddata', () => {
      try {
        const dur = Number(v.duration);
        const alvo = Number.isFinite(dur) && dur > 0.2 ? Math.min(dur * 0.1, Math.max(0.05, dur - 0.05)) : 0.5;
        v.currentTime = alvo;
      } catch (_) {
        capturar();
      }
    }, { once: true });
    v.addEventListener('seeked', capturar, { once: true });
    v.addEventListener('error', () => finish(''), { once: true });
    setTimeout(() => finish(''), 15000);
    v.src = url;
  });
}

export async function garantirThumbnailVideoItem(item) {
  if (!item || item.kind !== 'video') return item;
  if (videoProjetadoAtivoNoPlayer() && estadoPainel.audioStateRemoto.playing) return item;
  if (obterThumbVideoApresentacao(item)) return item;
  const srcThumb = /^https?:\/\//i.test(item.src) ? item.src : await resolverSrcProjecaoApresentacao(item);
  if (!srcThumb) return item;
  const thumb = await gerarThumbnailVideoApresentacao(srcThumb);
  if (thumb) item.thumb = thumb;
  return item;
}

export async function restaurarItemVideoApresentacao(item) {
  if (!item || item.kind !== 'video') return null;
  const id = String(item.id || '').trim();
  let src = String(item.src || '').trim();
  const filePath = String(item.filePath || '').trim();

  if (!src && id) src = urlVideoApresentacaoHttpPorId(id);

  if (/^https?:\/\//i.test(src)) {
    item.src = src;
    if (await videoHttpDisponivel(src)) {
      return garantirThumbnailVideoItem(item);
    }
  }

  if (/^data:/i.test(src)) {
    const it = await garantirVideoSrcHttp(item);
    return garantirThumbnailVideoItem(it);
  }

  if (filePath) {
    const it = await republicarVideoDoCaminhoArquivo({ ...item, src: '' });
    if (it?.src && /^https?:\/\//i.test(it.src)) {
      return garantirThumbnailVideoItem(it);
    }
  }

  return null;
}

export async function restaurarVideosModoApresentacao() {
  const v5 = estadoPainel.apresentacaoCards[APRESENTACAO_IDX_CARD5];
  if (v5?.kind === 'video') {
    const it = await restaurarItemVideoApresentacao(v5);
    if (it) {
      estadoPainel.apresentacaoCards[APRESENTACAO_IDX_CARD5] = it;
      const bibIdx = estadoPainel.apresentacaoBiblioteca.findIndex((x) => x && x.id === it.id);
      if (bibIdx >= 0) estadoPainel.apresentacaoBiblioteca[bibIdx] = it;
      salvarEstadoModoApresentacaoNoStorage();
    }
  }
  for (let i = 0; i < estadoPainel.apresentacaoVideoPlaylist.length; i += 1) {
    const it0 = estadoPainel.apresentacaoVideoPlaylist[i];
    if (it0?.kind !== 'video') continue;
    const it = await restaurarItemVideoApresentacao(it0);
    if (it) estadoPainel.apresentacaoVideoPlaylist[i] = { ...it0, ...it };
  }
  if (videoProjetadoAtivoNoPlayer()) {
    const proj = obterItemVideoProjetadoNoPlayer();
    if (proj) {
      const it = await restaurarItemVideoApresentacao(proj);
      if (it) {
        /*
         * Só armar o player quando ele ainda não está armado com este vídeo.
         *
         * `prepararPlayerVideoAposProjetar` existe para o instante logo a seguir a
         * projetar: põe o vídeo no primeiro quadro, em pausa, pronto a arrancar. Correr
         * outra vez sobre um vídeo que já está no ar fazia exactamente isso — e como ela
         * emite o estado para o servidor, o telão voltava ao início junto com o painel.
         *
         * Bastava o operador ir à Bíblia, aos Slides ou aos Ajustes e voltar a Mídias
         * para o vídeo recomeçar. E um vídeo pausado de propósito a meio saltava para o
         * zero pelo mesmo caminho. Entrar no modo para ver o que está a passar não pode
         * interromper o que está a passar.
         *
         * Continua a armar quando é preciso: painel recarregado (elemento sem `src`) ou
         * outro vídeo no card.
         */
        const el = obterElementoVideoLocal();
        const armadoComEste =
          !!(el && it.src && (el.getAttribute('src') || el.src || '') === it.src);
        if (armadoComEste) atualizarUiPlayerAudioRemoto();
        else await prepararPlayerVideoAposProjetar(it);
      }
    }
  }
}

async function resolverSrcProjecaoApresentacao(item) {
  if (!item?.src) return '';
  if (item.kind === 'video') {
    return publicarVideoApresentacaoHttp(item);
  }
  return String(item.src).trim();
}

export async function projetarItemApresentacao(item) {
  if (!item || !item.src) return;
  /** Qualquer projeção fora da orquestração da playlist a desativa (vídeo único, áudio, cards). */
  if (!estadoPainel._playlistProjetando) {
    estadoPainel.playlistVideoAtiva = false;
    cancelarAvancoAutoPlaylist();
  }
  if (item.kind === 'audio') {
    estadoPainel.apresentacaoMidiaProjetadaId = null;
    const ok = await tocarAudioServidorApresentacao(item);
    if (!ok) {
      alert('Não foi possível reproduzir o áudio no servidor. Verifique a ligação.');
      atualizarFeedbackProjecaoApresentacaoUi();
      return;
    }
    estadoPainel.apresentacaoAudioAtualId = item.id || null;
    atualizarRodapeAudioApresentacao(item);
    return;
  }
  await reidratarRotaApresentacaoDoSeletor();
  const alvoProjecao = obterAlvoProjecaoModoApresentacao();
  if (!monitoresApresentacaoCobremAlvo(alvoProjecao)) {
    alert(mensagemAlvoInvalidoApresentacao(alvoProjecao));
    return;
  }
  const srcLocal = await resolverSrcProjecaoApresentacao(item);
  if (!srcLocal) {
    alert('Não foi possível preparar o ficheiro para projeção.');
    return;
  }
  if (item.kind === 'video' && /^https?:\/\//i.test(srcLocal)) {
    item.src = srcLocal;
    const noCard = estadoPainel.apresentacaoCards?.[APRESENTACAO_IDX_CARD5];
    if (noCard?.id === item.id) estadoPainel.apresentacaoCards[APRESENTACAO_IDX_CARD5] = item;
    const noBib = estadoPainel.apresentacaoBiblioteca.findIndex((x) => x && x.id === item.id);
    if (noBib >= 0) estadoPainel.apresentacaoBiblioteca[noBib] = item;
    salvarEstadoModoApresentacaoNoStorage();
  }
  const srcProj = item.kind === 'video' ? reescreverUrlVideoParaTelas(srcLocal) : srcLocal;
  const payloadAp = {
    kind: item.kind,
    src: srcProj,
    mime: item.mime || '',
    name: item.name || '',
    title: item.name || 'Apresentação',
    alvoProjecao,
  };
  const ok = await emitirApresentacao(payloadAp);
  if (!ok) {
    atualizarFeedbackProjecaoApresentacaoUi();
    return;
  }
  estadoPainel.apresentacaoMidiaProjetadaId = item.id || null;
  if (item.kind === 'video') {
    await prepararPlayerVideoAposProjetar(item);
  }
  renderGridApresentacao();
  atualizarFeedbackProjecaoApresentacaoUi();
}

export function obterItemVideoProjetadoNoPlayer() {
  if (!estadoPainel.apresentacaoMidiaProjetadaId) return null;
  const id = estadoPainel.apresentacaoMidiaProjetadaId;
  const raw =
    (estadoPainel.apresentacaoCards || []).find((x) => x && x.id === id) ||
    (estadoPainel.apresentacaoBiblioteca || []).find((x) => x && x.id === id) ||
    (estadoPainel.apresentacaoVideoPlaylist || []).find((x) => x && x.id === id) ||
    null;
  const it = normalizarItemApresentacao(raw);
  return it && it.kind === 'video' ? it : null;
}

export function videoProjetadoAtivoNoPlayer() {
  return !!obterItemVideoProjetadoNoPlayer();
}
