/**
 * Pré-visualização «ao vivo» (telão / ministrante): espelho do estado do servidor, relógio ocioso,
 * instruções de projeção, prévia da música e emissão do estado do ministrante. Movido verbatim do núcleo
 * (`controllerAppCore.js`); o que o núcleo ainda possui entra por `registrarDependenciasPreviewProjecao`.
 */
import { aplicarClasseLinhas, limparEstiloPreviewSlide } from './tipografiaPainelPreview.js';
import { aplicarCorComentarioMinistranteNoPainel, lerCurrentCfgCtrl } from './configExibicao.js';
import { aplicarPreviewMinistranteNoElemento, filtrarLinhasParaPublico, textoMinistranteDeElementoPreview } from '../modules/comentariosSlide.js';
import { escapeHtml } from './textoHtmlSeguro.js';
import { rotuloTipoMidiaApresentacao, svgIconeTipoMidiaApresentacao } from '../modules/midiaApresentacao.js';
import { textoSlideMaiusculo } from '../modules/slidesGrelha.js';
import { aplicarPreviewTituloMusicaAbertura, limparPreviewTituloMusicaAbertura, primeirasLinhasEstrofeMinistrante, tituloAberturaM3MusicaAtiva } from './tituloAberturaPreview.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { aplicarPreviewPainelOcultoNoDom } from './previewOculto.js';
import { apresentacaoOcupandoCanalMinistrante, atualizarPreviewMonitorMinistranteSlides, atualizarPreviewMonitorPublicoSlides, atualizarPreviewsMonitoresVirtuaisModoSlides, classificarSaidaMonitorMinistranteSlides, obterRotaSlidesParaUi, syncRoteamentoTelasModoSlidesNaUi } from './canaisProjecao.js';
import { ehModoApresentacaoOperador, ehModoBibliaOperador, ehModoSlidesOperador } from './modosUi.js';
import { musicaEstadoCombinaComAtiva } from './projecaoMusica.js';

const previewMinistranteHelpers = {
  escapeHtml,
  maiusculo: textoSlideMaiusculo,
  aplicarClasseLinhas,
  limparEstiloPreviewSlide,
  /* Lida a cada render da prévia. Cai na última cor aplicada (não no padrão) para que uma
     config ainda por chegar nunca produza um frame com a cor errada. */
  get commentColor() {
    try {
      return aplicarCorComentarioMinistranteNoPainel(lerCurrentCfgCtrl()?.ministrante?.commentColor);
    } catch (_) {
      return estadoPainel.corComentarioMinistrantePainel;
    }
  },
};

/** Há algo efetivamente enviado às telas de projeção (servidor ligado). */
export function hayProjecaoAtivaNoServidor() {
  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.projecaoLive && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length) return true;
  if (e.blackout) return true;
  if (e.tipo === 'apresentacao' && e.apresentacao && String(e.apresentacao.src || '').trim()) return true;
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) return true;
  if (e.projecaoMinistranteApresentacao) return true;
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) return true;
  if (e.tipo === 'musica' && e.slidePretoFinal) return true;
  if (e.tipo === 'musica' && !e.telaLimpa && e.linhas && e.linhas.length) return true;
  return false;
}

/**
 * Para os cartões quando não há uma «saída nas telas» em curso de música/bíblia que deva espelhar sempre o servidor:
 * exige música selecionada alinhada + flag local de emissão (evita mostrar letra só ao navegar na playlist sem projetar).
 */
function hayProjecaoAtivaNoServidorParaPreviews() {
  if (!hayProjecaoAtivaNoServidor()) return false;
  const e = estadoPainel.estadoServidor;
  if (!e) return false;
  if (e.blackout) return true;
  if (e.projecaoMinistranteApresentacao && e.tipo !== 'apresentacao' && e.tipo !== 'aviso') return true;
  if (e.tipo === 'biblia') return true;
  if (e.tipo === 'musica') {
    if (!estadoPainel.musicaAtiva) return true;
    if (!musicaEstadoCombinaComAtiva(e)) return false;
    /* Só espelhar letra de música nos cartões quando este painel já «armou» projeção (duplo clique, setas, próxima música…). */
    if (!estadoPainel.projecaoMusicaEmitidaNoServidor) return false;
    return true;
  }
  return false;
}

/**
 * Não espelhar letras de música nos cartões de preview até este painel estar no fluxo de projeção
 * (faixa de slides visível). Evita mostrar letra quando o servidor ainda guarda o estado anterior.
 */
function previewMusicaEsperandoDockParaEspelharLetra() {
  const e = estadoPainel.estadoServidor;
  if (!e || e.tipo !== 'musica') return false;
  if (estadoPainel.musicaAtiva && !musicaEstadoCombinaComAtiva(e)) return false;
  if (e.blackout || e.slidePretoFinal || e.telaLimpa) return false;
  if (!e.linhas || !e.linhas.length) return false;
  return !estadoPainel.slidesDockVisivel && !ehModoSlidesOperador();
}

/**
 * Clique na playlist/banco só prepara musicaAtiva na faixa — até um novo emit deste painel,
 * os cartões Telão/TV não espelham o servidor (nem a música anterior nas telas físicas).
 */
function suprimirEspelhoPreviewsPorNavegacaoPlaylist() {
  /* Em qualquer modo, ao "engatilhar" música na playlist sem emitir ao servidor,
     manter nos previews o que já está projetado até um novo emit (duplo clique/setas). */
  return false;
}

/** Aplica no DOM o estado da saída “telão” (público). */
export function aplicarPreviewTelaoNoDom(estado) {
  const prevTitulo = document.getElementById('pv-live-titulo');
  const prevLetras = document.getElementById('pv-live-letras');

  if (estado && estado.previewImagemNoTelao) {
    prevTitulo.textContent = '';
    const linhaTxt = 'IMAGEM NO TELÃO';
    prevLetras.innerHTML = `<span class="pv-live-ap-meta">${svgIconeTipoMidiaApresentacao('image')}<span class="pv-live-ap-meta-txt">${escapeHtml(linhaTxt)}</span></span>`;
    prevLetras.classList.remove('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (!estado || estado.semProjecao) {
    prevTitulo.textContent = '';
    prevLetras.textContent = '';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.blackout) {
    prevTitulo.textContent = '';
    prevLetras.textContent = 'Tela preta (F10)';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.tipo === 'aviso' && Array.isArray(estado.linhas) && estado.linhas.length) {
    prevTitulo.textContent = '';
    prevLetras.textContent = estado.linhas.join('\n');
    prevLetras.classList.remove('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.tipo === 'apresentacao' && estado.apresentacao && String(estado.apresentacao.src || '').trim()) {
    const ap = estado.apresentacao;
    const label =
      [ap.title, ap.name].map((x) => String(x || '').trim()).find(Boolean) ||
      String(estado.titulo || '').trim() ||
      'Apresentação';
    prevTitulo.textContent = ehModoSlidesOperador() ? '' : label.toUpperCase();
    const kind = String(ap.kind || '').toLowerCase();
    const tipoRotulo = rotuloTipoMidiaApresentacao(kind);
    const linhaTxt = `${tipoRotulo} no telão`;
    prevLetras.innerHTML = `<span class="pv-live-ap-meta">${svgIconeTipoMidiaApresentacao(kind)}<span class="pv-live-ap-meta-txt">${escapeHtml(linhaTxt)}</span></span>`;
    prevLetras.classList.remove('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.slidePretoFinal) {
    prevTitulo.textContent = '';
    prevLetras.textContent = '';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.telaLimpa || !estado.linhas || !estado.linhas.length) {
    prevTitulo.textContent = '';
    if (ehModoSlidesOperador()) {
      prevLetras.textContent = '';
      prevLetras.classList.add('vazio');
      limparEstiloPreviewSlide(prevLetras);
      return;
    }
    prevLetras.textContent = 'Tela limpa';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  const tituloTelaoDesejado = ehModoSlidesOperador() ? '' : (estado.titulo || '').toUpperCase();
  const linhasPub = filtrarLinhasParaPublico(estado.linhas);
  const textoPub = linhasPub.join('\n');
  const textoDom = textoSlideMaiusculo(textoPub);
  const previewTelaoJaAlinhado =
    prevTitulo.textContent === tituloTelaoDesejado &&
    prevLetras.textContent === textoDom &&
    !prevLetras.classList.contains('vazio') &&
    prevLetras.dataset.previewFonteTexto === textoPub;
  if (previewTelaoJaAlinhado) return;
  prevTitulo.textContent = tituloTelaoDesejado;
  prevLetras.textContent = textoDom;
  prevLetras.classList.remove('vazio');
  aplicarClasseLinhas(prevLetras, textoPub);
}

/**
 * Letra nos cartões TELÃO/TV do modo slide: só com projeção real já emitida.
 * Seleção na faixa/playlist (1 clique) não preenche as prévias dos monitores.
 * Home (modo completo) usa só `#playlist-preview-card`. Badges de mídia ficam
 * de fora — tratados nos early-returns de `atualizarPreviewOperador` / telão.
 */
export function podeEspelharLetraNosPreviewsModoSlide() {
  if (!ehModoSlidesOperador()) return false;
  if (!estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes) || !estadoPainel.musicaAtiva.estrofes.length) {
    return false;
  }
  if (estadoPainel.estrofeAtiva < 0) return false;
  return !!estadoPainel.projecaoMusicaEmitidaNoServidor;
}

/**
 * Estado local do slide selecionado no painel (modo slide).
 * Não deve alimentar as prévias TELÃO/TV — essas espelham só a projeção real.
 * Mantido para usos pontuais que precisem do conteúdo da seleção local.
 */
function estadoPreviewTelaoLocalModoSlides() {
  if (!podeEspelharLetraNosPreviewsModoSlide()) {
    return { semProjecao: true };
  }
  const idxPreto = estadoPainel.musicaAtiva.estrofes.length;
  if (estadoPainel.estrofeAtiva === idxPreto) return { tipo: 'musica', slidePretoFinal: true };
  const cur = String(estadoPainel.musicaAtiva.estrofes[estadoPainel.estrofeAtiva] ?? '');
  return { tipo: 'musica', titulo: estadoPainel.musicaAtiva.titulo || '', telaLimpa: false, linhas: cur.split('\n') };
}

/** Telão no painel: espelha o servidor com as regras de `suprimirEspelhoPreviewsPorNavegacaoPlaylist`. */
export function atualizarPreviewTelaoPublico() {
  /* Modo Slides: M2 é monitor virtual independente (não misturar com a TV). */
  if (ehModoSlidesOperador()) {
    atualizarPreviewMonitorPublicoSlides();
    return;
  }
  const e = estadoPainel.estadoServidor;
  if (!hayProjecaoAtivaNoServidor() || !e) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  if (suprimirEspelhoPreviewsPorNavegacaoPlaylist()) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  if (e.blackout) {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'apresentacao') {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'musica') {
    const telasMostramMusica =
      e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length);
    if (telasMostramMusica) {
      aplicarPreviewTelaoNoDom(e);
      return;
    }
  }
  if (!hayProjecaoAtivaNoServidorParaPreviews()) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  if (previewMusicaEsperandoDockParaEspelharLetra()) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  aplicarPreviewTelaoNoDom(estadoPainel.estadoServidor);
}

/**
 * Cartão TV quando o painel não está alinhado com a projeção (ex.: letra comandada só pelo mobile).
 * Usa o mesmo estado que o servidor manda no socket (`linhas` + `linhasProximo` + `proximoSlidePreto`),
 * para o cartão «próximo» coincidir com a TV física e com o fluxo do controlador.
 */
export function preencherPreviewOperadorSomenteEstadoServidorMusica() {
  const e = estadoPainel.estadoServidor;
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (!e || e.tipo !== 'musica') return;
  if (e.slidePretoFinal) {
    limparPreviewTituloMusicaAbertura();
    opA.innerHTML = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    opP.innerHTML = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
    return;
  }
  const idx = Number.isFinite(Number(e.estrofeIndex)) ? Number(e.estrofeIndex) : -1;
  const tituloMusica =
    (estadoPainel.musicaAtiva && musicaEstadoCombinaComAtiva(e) && estadoPainel.musicaAtiva.titulo) || e.titulo || '';
  const abertura = idx === 0;
  aplicarPreviewTituloMusicaAbertura(
    estadoPainel.musicaAtiva && musicaEstadoCombinaComAtiva(e)
      ? tituloAberturaM3MusicaAtiva(tituloMusica)
      : tituloMusica,
    abertura
  );

  let curRaw = '';
  let proxRaw = '';
  if (estadoPainel.musicaAtiva && musicaEstadoCombinaComAtiva(e) && Array.isArray(estadoPainel.musicaAtiva.estrofes)) {
    if (idx >= 0 && idx < estadoPainel.musicaAtiva.estrofes.length) curRaw = String(estadoPainel.musicaAtiva.estrofes[idx] ?? '');
    if (e.proximoSlidePreto) proxRaw = '';
    else if (idx >= 0 && idx < estadoPainel.musicaAtiva.estrofes.length - 1) {
      const nxt = String(estadoPainel.musicaAtiva.estrofes[idx + 1] ?? '');
      proxRaw = abertura ? primeirasLinhasEstrofeMinistrante(nxt, 2) : nxt;
    }
  } else {
    curRaw = (e.linhas || []).join('\n');
    if (e.proximoSlidePreto) proxRaw = '';
    else if (Array.isArray(e.linhasProximo) && e.linhasProximo.length) {
      const nxt = e.linhasProximo.join('\n');
      proxRaw = abertura ? primeirasLinhasEstrofeMinistrante(nxt, 2) : nxt;
    }
  }

  opA.className = 'op-slide-text';
  aplicarPreviewMinistranteNoElemento(opA, curRaw, previewMinistranteHelpers);

  opP.className = 'op-slide-text';
  if (proxRaw.trim()) {
    aplicarPreviewMinistranteNoElemento(opP, proxRaw, previewMinistranteHelpers);
  } else {
    opP.innerHTML = '';
    opP.classList.add('vazio');
    limparEstiloPreviewSlide(opP);
  }
}

/** Pré-visualização TV/ministrante só a partir da música e estrofe escolhidas no painel (sem depender do socket). */
export function preencherPreviewOperadorSomenteMusicaLocal() {
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');

  if (!estadoPainel.musicaAtiva || !estadoPainel.musicaAtiva.estrofes || estadoPainel.musicaAtiva.estrofes.length === 0) {
    limparPreviewTituloMusicaAbertura();
    opA.textContent = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    opP.textContent = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
    return;
  }

  const nEst = estadoPainel.musicaAtiva.estrofes.length;
  const idxPreto = nEst;

  if (estadoPainel.estrofeAtiva < 0) {
    limparPreviewTituloMusicaAbertura();
    opA.innerHTML = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    const p0 = estadoPainel.musicaAtiva.estrofes[0];
    opP.className = 'op-slide-text';
    if (p0) {
      aplicarPreviewMinistranteNoElemento(opP, p0, previewMinistranteHelpers);
    } else {
      opP.innerHTML = '';
      opP.classList.add('vazio');
      limparEstiloPreviewSlide(opP);
    }
    return;
  }

  if (estadoPainel.estrofeAtiva === idxPreto) {
    limparPreviewTituloMusicaAbertura();
    opA.innerHTML = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    opP.innerHTML = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
    return;
  }

  const abertura = estadoPainel.estrofeAtiva === 0;
  aplicarPreviewTituloMusicaAbertura(tituloAberturaM3MusicaAtiva(estadoPainel.musicaAtiva.titulo || ''), abertura);

  const cur = estadoPainel.musicaAtiva.estrofes[estadoPainel.estrofeAtiva];
  const proximoEhPreto = estadoPainel.estrofeAtiva === nEst - 1;
  const nxtFull = proximoEhPreto ? null : estadoPainel.musicaAtiva.estrofes[estadoPainel.estrofeAtiva + 1];
  const nxt = nxtFull
    ? abertura
      ? primeirasLinhasEstrofeMinistrante(nxtFull, 2)
      : nxtFull
    : null;

  opA.className = 'op-slide-text';
  if (cur) {
    aplicarPreviewMinistranteNoElemento(opA, cur, previewMinistranteHelpers);
  } else {
    opA.innerHTML = '';
    opA.classList.add('vazio');
    limparEstiloPreviewSlide(opA);
  }

  opP.className = 'op-slide-text';
  if (proximoEhPreto) {
    opP.innerHTML = '';
    opP.classList.add('vazio');
    limparEstiloPreviewSlide(opP);
  } else if (nxt) {
    aplicarPreviewMinistranteNoElemento(opP, nxt, previewMinistranteHelpers);
  } else {
    opP.innerHTML = '';
    opP.classList.add('vazio');
    limparEstiloPreviewSlide(opP);
  }
}

/** Limpa título/letra da prévia TV (modo Slides ocioso). */
export function limparConteudoPreviewOperadorSlides() {
  limparPreviewTituloMusicaAbertura();
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (opA) {
    opA.textContent = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
  }
  if (opP) {
    opP.textContent = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
  }
}

/**
 * Seleção local alinhada com o índice projetado no servidor (modo Slides).
 * Se o operador clicou noutro chip sem projetar, a prévia deve continuar no servidor.
 */
export function selecaoLocalAlinhadaComProjecaoMusicaServidor() {
  const e = estadoPainel.estadoServidor;
  if (!e || e.tipo !== 'musica' || !estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes)) return false;
  if (!musicaEstadoCombinaComAtiva(e)) return false;
  const idxPreto = estadoPainel.musicaAtiva.estrofes.length;
  if (e.slidePretoFinal) return estadoPainel.estrofeAtiva === idxPreto;
  const idxSrv = Number(e.estrofeIndex);
  return Number.isFinite(idxSrv) && estadoPainel.estrofeAtiva === idxSrv;
}

let previewRelogioOciosoTimer = null;

/** Config de relógio usada pelo M3 real (`currentCfgCtrl.clock`). */
function obterCfgClockPreviewSlides() {
  const cfg =
    typeof window.getCurrentCfgCtrl === 'function' ? window.getCurrentCfgCtrl() : lerCurrentCfgCtrl();
  return (cfg && cfg.clock) || {};
}

/** Igual a `deveRevelarRelogioMinistrante` em `display-operator.html`. */
export function deveRevelarRelogioPreviewMinistrante() {
  return obterCfgClockPreviewSlides().showClock !== false;
}

/** `vh` do M3 escalado à altura da capa da prévia (mesma proporção visual). */
function pxVhPreviewRelogio(vh, capa) {
  const h = (capa && capa.clientHeight) || 80;
  return Math.max(6, (Number(vh) || 0) * (h / 100));
}

function corRelogioPreviewOp(clk) {
  return clk.textColor || '#ffffff';
}

function aplicarFundoRelogioPreviewOp(capa, clk) {
  if (!capa) return;
  if (clk.bgType === 'gradient') {
    capa.style.background = clk.bgGradient || '#000000';
  } else if (clk.bgType === 'image' && clk.bgImage) {
    capa.style.background = `url('${clk.bgImage}') center/cover no-repeat`;
  } else {
    capa.style.background = clk.bgColor || '#000000';
  }
}

function desenharRelogioAnalogicoPreviewOp(canvas, now, cor) {
  if (!canvas) return;
  const ctxCv = canvas.getContext('2d');
  if (!ctxCv) return;
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const r = W / 2 - 14;
  ctxCv.clearRect(0, 0, W, H);
  ctxCv.beginPath();
  ctxCv.arc(cx, cy, r, 0, 2 * Math.PI);
  ctxCv.strokeStyle = cor;
  ctxCv.globalAlpha = 0.28;
  ctxCv.lineWidth = 2;
  ctxCv.stroke();
  ctxCv.globalAlpha = 1;
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * 2 * Math.PI - Math.PI / 2;
    const maior = i % 3 === 0;
    const inner = maior ? r - 22 : r - 10;
    ctxCv.beginPath();
    ctxCv.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
    ctxCv.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    ctxCv.strokeStyle = cor;
    ctxCv.globalAlpha = maior ? 0.85 : 0.38;
    ctxCv.lineWidth = maior ? 3 : 1.5;
    ctxCv.stroke();
    ctxCv.globalAlpha = 1;
  }
  const sec = now.getSeconds();
  const min = now.getMinutes() + sec / 60;
  const hr = (now.getHours() % 12) + min / 60;
  const desenharMao = (frac, len, largura, alpha) => {
    const ang = frac * 2 * Math.PI - Math.PI / 2;
    ctxCv.beginPath();
    ctxCv.moveTo(cx, cy);
    ctxCv.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
    ctxCv.strokeStyle = cor;
    ctxCv.globalAlpha = alpha;
    ctxCv.lineWidth = largura;
    ctxCv.lineCap = 'round';
    ctxCv.stroke();
    ctxCv.globalAlpha = 1;
  };
  desenharMao(hr / 12, r * 0.52, 9, 0.95);
  desenharMao(min / 60, r * 0.73, 5.5, 0.88);
  desenharMao(sec / 60, r * 0.82, 2, 0.65);
  ctxCv.beginPath();
  ctxCv.arc(cx, cy, 7, 0, 2 * Math.PI);
  ctxCv.fillStyle = cor;
  ctxCv.globalAlpha = 0.9;
  ctxCv.fill();
  ctxCv.globalAlpha = 1;
}

/**
 * Tick da prévia ociosa — espelho de `tickRelogioOp` (display-operator).
 * Usa a mesma `clock` de Ajustes que o M3 real.
 */
function tickPreviewRelogioOciosoMinistrante() {
  const capa = document.getElementById('op-preview-relogio');
  const elHora = document.getElementById('op-preview-relogio-hora');
  const elData = document.getElementById('op-preview-relogio-data');
  const elVerso = document.getElementById('op-preview-relogio-verso');
  const elAnalogWrap = document.getElementById('op-preview-relogio-analog-wrap');
  const elAnalog = document.getElementById('op-preview-relogio-analog');
  if (!capa || !elHora || capa.hidden) return;

  const clk = obterCfgClockPreviewSlides();
  const now = new Date();
  const fmt = String(clk.format || 'HH:MM');
  const lowerFmt = fmt.toLowerCase();
  const color = corRelogioPreviewOp(clk);
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const analogico = lowerFmt === 'analog';

  elHora.style.display = analogico || lowerFmt === 'none' ? 'none' : '';
  if (elAnalogWrap) elAnalogWrap.hidden = !analogico;
  if (lowerFmt === 'hh:mm:ss') elHora.textContent = `${h}:${m}:${s}`;
  else if (lowerFmt !== 'none' && !analogico) elHora.textContent = `${h}:${m}`;
  else elHora.textContent = '';
  elHora.style.color = color;
  elHora.style.fontSize = `${pxVhPreviewRelogio(Math.max(7, Number(clk.fontSize || 13)), capa)}px`;

  if (analogico) desenharRelogioAnalogicoPreviewOp(elAnalog, now, color);

  if (elData) {
    if (clk.showDate !== false) {
      elData.textContent = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      });
      elData.style.display = '';
      elData.style.color = clk.dateColor || color;
      elData.style.fontSize = `${pxVhPreviewRelogio(Math.max(0.8, Number(clk.dateFontSize || 2.4)), capa)}px`;
    } else {
      elData.textContent = '';
      elData.style.display = 'none';
    }
  }

  if (elVerso) {
    const verseTxt = clk.showVerse && clk.verse ? String(clk.verse) : '';
    if (verseTxt) {
      elVerso.textContent = verseTxt;
      elVerso.style.display = '';
      elVerso.style.color = clk.verseColor || color;
      elVerso.style.fontSize = `${pxVhPreviewRelogio(Math.max(0.8, Number(clk.verseFontSize || 2.4)), capa)}px`;
    } else {
      elVerso.textContent = '';
      elVerso.style.display = 'none';
    }
  }

  aplicarFundoRelogioPreviewOp(capa, clk);
}

/**
 * Liga/desliga a capa do relógio na prévia TV.
 * Com `showClock === false` a capa fica oculta → fundo preto do cartão (= M3 real).
 */
export function definirPreviewRelogioOciosoMinistrante(visivel) {
  const capa = document.getElementById('op-preview-relogio');
  if (!capa) return;
  if (visivel) {
    capa.hidden = false;
    capa.setAttribute('aria-hidden', 'false');
    tickPreviewRelogioOciosoMinistrante();
    if (!previewRelogioOciosoTimer) {
      previewRelogioOciosoTimer = setInterval(tickPreviewRelogioOciosoMinistrante, 1000);
    }
  } else {
    capa.hidden = true;
    capa.setAttribute('aria-hidden', 'true');
    capa.style.background = '';
    if (previewRelogioOciosoTimer) {
      clearInterval(previewRelogioOciosoTimer);
      previewRelogioOciosoTimer = null;
    }
  }
}

/**
 * Estado ocioso / saída do M3 na prévia — delega ao classificador do monitor virtual.
 */
export function sincronizarPreviewOciosoMinistranteSlides() {
  if (!ehModoSlidesOperador()) {
    definirPreviewRelogioOciosoMinistrante(false);
    return;
  }
  atualizarPreviewMonitorMinistranteSlides();
}

/**
 * Prévia flutuante da Home: só o estado da música/slides da coluna central (estrofeAtiva).
 * Tamanho da fonte por texto (linha mais longa + linhas) · sem quebra automática (`white-space: pre`).
 * Independente do socket · não altera projeção.
 */
export function atualizarPreviewPlaylistCentral() {
  estadoPainel.homeLayout?.updatePreview(estadoPainel.estrofeAtiva, estadoPainel.musicaAtiva?.estrofes?.length || 0);
  if (document.body.classList.contains('app-mod-slides')) return;
  const tit = document.getElementById('pl-pv-titulo');
  const slideEl = document.getElementById('pl-pv-slide');
  if (!tit || !slideEl) return;

  const limpar = () => {
    tit.textContent = '';
    tit.classList.add('vazio');
    slideEl.textContent = '';
    slideEl.className = 'pl-slide-text vazio';
    limparEstiloPreviewSlide(slideEl);
  };

  if (ehModoBibliaOperador() || !estadoPainel.musicaAtiva || !estadoPainel.musicaAtiva.estrofes || estadoPainel.musicaAtiva.estrofes.length === 0) {
    limpar();
    return;
  }

  tit.classList.remove('vazio');
  tit.textContent = (estadoPainel.musicaAtiva.titulo || '').toUpperCase();

  const nEst = estadoPainel.musicaAtiva.estrofes.length;
  const idxPreto = nEst;

  if (estadoPainel.estrofeAtiva < 0 || estadoPainel.estrofeAtiva === idxPreto) {
    slideEl.textContent = '';
    slideEl.className = 'pl-slide-text vazio';
    limparEstiloPreviewSlide(slideEl);
    return;
  }

  const cur = estadoPainel.musicaAtiva.estrofes[estadoPainel.estrofeAtiva];
  slideEl.textContent = cur ? textoSlideMaiusculo(cur) : '';
  slideEl.className = 'pl-slide-text';
  if (cur) {
    slideEl.classList.remove('vazio');
    aplicarClasseLinhas(slideEl, cur);
  } else {
    slideEl.classList.add('vazio');
    limparEstiloPreviewSlide(slideEl);
  }
}

export function atualizarPreviewOperador() {
  try {
    /* Modo Slides: duas prévias = monitores virtuais independentes (M2 e M3). */
    if (ehModoSlidesOperador()) {
      atualizarPreviewsMonitoresVirtuaisModoSlides();
      const clsMin = classificarSaidaMonitorMinistranteSlides();
      /* Só reemitir ministrante quando a prévia espelha slides (não badge/outro modo). */
      if (clsMin.mode === 'slides' || clsMin.mode === 'idle') {
        emitirEstadoMinistranteAoServidor();
      }
      return;
    }

    const opA = document.getElementById('op-atual');
    const opP = document.getElementById('op-proximo');

    if (!hayProjecaoAtivaNoServidor()) {
      definirPreviewRelogioOciosoMinistrante(false);
      limparPreviewTituloMusicaAbertura();
      opA.textContent = '';
      opA.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    definirPreviewRelogioOciosoMinistrante(false);

    if (suprimirEspelhoPreviewsPorNavegacaoPlaylist()) {
      limparPreviewTituloMusicaAbertura();
      opA.textContent = '';
      opA.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    if (
      estadoPainel.estadoServidor &&
      estadoPainel.estadoServidor.tipo === 'biblia' &&
      (!estadoPainel.estadoServidor.telaLimpa || estadoPainel.estadoServidor.projecaoSomenteMinistrante)
    ) {
      limparPreviewTituloMusicaAbertura();
      const linhasBib = Array.isArray(estadoPainel.estadoServidor.linhas) ? estadoPainel.estadoServidor.linhas : [];
      const txtBib = linhasBib.map((s) => String(s ?? '')).join('\n').trim();
      opA.textContent = txtBib;
      opA.className = 'op-slide-text';
      if (txtBib) {
        opA.classList.remove('vazio');
        aplicarClasseLinhas(opA, txtBib);
      } else {
        opA.classList.add('vazio');
        limparEstiloPreviewSlide(opA);
      }
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      /* Ministrante já foi atualizado no servidor por exibir_versiculo — não reemitir vazio. */
      return;
    }

    const eMus = estadoPainel.estadoServidor;
    const servidorMostraMusicaProj =
      eMus &&
      eMus.tipo === 'musica' &&
      !eMus.blackout &&
      (eMus.slidePretoFinal || (!eMus.telaLimpa && eMus.linhas && eMus.linhas.length));

    const painelAlinhadoComProjecaoServidor =
      servidorMostraMusicaProj &&
      estadoPainel.musicaAtiva &&
      musicaEstadoCombinaComAtiva(eMus) &&
      estadoPainel.projecaoMusicaEmitidaNoServidor;

    if (servidorMostraMusicaProj && !painelAlinhadoComProjecaoServidor) {
      preencherPreviewOperadorSomenteEstadoServidorMusica();
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    const servidorMusicaAlinhado =
      estadoPainel.estadoServidor &&
      estadoPainel.estadoServidor.tipo === 'musica' &&
      hayProjecaoAtivaNoServidorParaPreviews();

    if (!servidorMusicaAlinhado) {
      /* Home: nunca preencher TELÃO/TV com letra — só a prévia da playlist (`pl-pv-*`). */
      const mostrarPreviewOpLocal = estadoPainel.projecaoMusicaEmitidaNoServidor;
      if (mostrarPreviewOpLocal) {
        preencherPreviewOperadorSomenteMusicaLocal();
      } else {
        limparPreviewTituloMusicaAbertura();
        opA.textContent = '';
        opA.className = 'op-slide-text vazio';
        limparEstiloPreviewSlide(opA);
        opP.textContent = '';
        opP.className = 'op-slide-text vazio';
        limparEstiloPreviewSlide(opP);
      }
      atualizarPreviewTelaoPublico();
      return;
    }

    if (previewMusicaEsperandoDockParaEspelharLetra()) {
      limparPreviewTituloMusicaAbertura();
      opA.textContent = '';
      opA.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    preencherPreviewOperadorSomenteMusicaLocal();
    atualizarPreviewTelaoPublico();
    emitirEstadoMinistranteAoServidor();
  } finally {
    atualizarPreviewPlaylistCentral();
    if (ehModoSlidesOperador() || ehModoApresentacaoOperador()) {
      try {
        aplicarPreviewPainelOcultoNoDom();
      } catch (_) {
  // intencional — erro ignorado
}
    }
    if (ehModoSlidesOperador()) {
      try {
        syncRoteamentoTelasModoSlidesNaUi();
      } catch (_) {
  // intencional — erro ignorado
}
    } else {
      definirPreviewRelogioOciosoMinistrante(false);
    }
  }
}

let lyraAssinaturaEmitMinistrante = null;

export function emitirEstadoMinistranteAoServidor() {
  if (apresentacaoOcupandoCanalMinistrante()) return;
  if (!projecao.pronta()) return;
  if (ehModoSlidesOperador() && obterRotaSlidesParaUi().ministranteIndex < 0) return;
  if (
    ehModoBibliaOperador() &&
    estadoPainel.estadoServidor &&
    estadoPainel.estadoServidor.tipo === 'biblia' &&
    !estadoPainel.estadoServidor.telaLimpa
  ) {
    return;
  }
  /*
   * Folhear a playlist ou clicar num chip só selecciona no painel. Se já há
   * conteúdo no ar e este painel NÃO o emitiu, o título/letra do M3 têm de
   * continuar os da projeção — senão Galileu fica no slide e o nome vira Deixa.
   * Quem arma `projecaoMusicaEmitidaNoServidor` (duplo clique, setas, próxima
   * música) é que pode voltar a mandar `exibir_ministrante`.
   */
  if (hayProjecaoAtivaNoServidor() && !estadoPainel.projecaoMusicaEmitidaNoServidor) return;
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (!opA || !opP) return;
  const atual = textoMinistranteDeElementoPreview(opA);
  const proximo = textoMinistranteDeElementoPreview(opP);
  /** Se ainda há saída ativa (inclui blackout/slide preto), não abrir relógio no ministrante. */
  const projecaoAtiva = hayProjecaoAtivaNoServidor();
  const slidePretoFinal = !!(estadoPainel.estadoServidor && estadoPainel.estadoServidor.slidePretoFinal);
  const telaLimpa = !atual && !proximo && !projecaoAtiva;
  const tituloMusica = tituloAberturaM3MusicaAtiva(estadoPainel.musicaAtiva?.titulo || '');
  const aberturaMusica =
    !slidePretoFinal &&
    !!estadoPainel.musicaAtiva &&
    estadoPainel.estrofeAtiva === 0 &&
    !!(tituloMusica || atual || proximo);
  const payload = {
    titulo: tituloMusica,
    atual: slidePretoFinal ? '' : atual,
    proximo: slidePretoFinal ? '' : proximo,
    aberturaMusica,
    projecaoAtiva,
    telaLimpa,
    slidePretoFinal,
  };
  let assinatura = null;
  try {
    assinatura = JSON.stringify(payload);
  } catch (_) {
  // intencional — erro ignorado
}
  if (assinatura !== null && assinatura === lyraAssinaturaEmitMinistrante) return;
  lyraAssinaturaEmitMinistrante = assinatura;
  projecao.enviar('exibir_ministrante', payload);
}

export function configurarObserverPreviewMinistrante() {
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (!opA || !opP) return;
  let timer = null;
  const agenda = () => {
    clearTimeout(timer);
    timer = setTimeout(() => emitirEstadoMinistranteAoServidor(), 40);
  };
  const obs = new MutationObserver(() => agenda());
  /* Só estrutura/texto — `attributes` disparava ao ajustar `font-size` nas prévias e
     reemitia `exibir_ministrante` sem mudança real de letra (ciclo de repintura). */
  obs.observe(opA, { childList: true, subtree: true, characterData: true });
  obs.observe(opP, { childList: true, subtree: true, characterData: true });
}

/**
 * As instruções vêm sempre como título + lista de ideias (uma por item), a partir de
 * uma única fonte de texto. No modo slides — onde vivem num balão que só abre ao pedido
 * — saem como lista, uma ideia por linha. Nos outros modos continuam em linha corrida
 * separada por «·», como sempre estiveram na faixa inferior.
 */
function renderInstrucoesProjecao(titulo, itens) {
  const dock = document.getElementById('slides-projecao-instrucoes');
  if (!dock) return;
  if (!itens || !itens.length) {
    dock.innerHTML = titulo || '';
    return;
  }
  if (ehModoSlidesOperador()) {
    const lis = itens.map((t) => `<li>${t}</li>`).join('');
    dock.innerHTML =
      (titulo ? `<div class="slides-instr-tit">${titulo}</div>` : '') +
      `<ul class="slides-instr-lista">${lis}</ul>`;
    return;
  }
  dock.innerHTML = [titulo, ...itens].filter(Boolean).join(' · ');
}

/** Texto da faixa central — também quando só a grelha de slides atualiza (ex.: edição em tempo real). */
export function atualizarSlidesInstrucoes() {
  const kb = (t) => `<kbd class="slides-dock-kbd">${t}</kbd>`;
  const atalhosProjecao = [
    `${kb('←')} ${kb('→')} navegam entre os slides`,
    `${kb('ESC')} limpa as telas e desmarca a música (fecha a faixa)`,
    `${kb('F10')} alterna o blackout`,
  ];
  if (ehModoBibliaOperador() && !ehModoSlidesOperador()) {
    renderInstrucoesProjecao('');
    return;
  }
  if (!estadoPainel.musicaAtiva || !estadoPainel.musicaAtiva.estrofes) {
    if (ehModoSlidesOperador()) {
      renderInstrucoesProjecao('<strong>Modo slides</strong>', [
        'Escolher uma música na playlist só a carrega — não projeta',
        '<strong>Duplo clique na música</strong> começa a projetar na 1.ª estrofe',
        'Na faixa, duplo clique no chip muda o slide',
      ]);
    } else {
      renderInstrucoesProjecao('<strong>Modo controlador</strong>', [
        'A playlist só prepara a música, sem enviar às telas',
        'Na coluna central, <strong>clique</strong> seleciona o slide',
        'Botão ✎ ou clique direito: edição rápida',
      ]);
    }
    return;
  }
  if (ehModoSlidesOperador() && !estadoPainel.faixaSlidesHabilitadaPorPlaylistNoModoSlides) {
    renderInstrucoesProjecao('<strong>Modo slides</strong>', [
      'Toque numa música <strong>na playlist à esquerda</strong> para mostrar os slides aqui',
      'Clique carrega; duplo clique projeta',
      'Música aberta só pelo banco (modo completo) não preenche esta faixa',
    ]);
    return;
  }
  const n = estadoPainel.musicaAtiva.estrofes.length;
  if (estadoPainel.modoEdicaoEstrofes) {
    renderInstrucoesProjecao(`<strong>Edição</strong> — ${n} slide(s)`, [
      '<strong>Linha vazia</strong> (Enter duplo, sem carácter no meio) cria outro slide na hora',
      'Linha com <strong>um espaço</strong> mantém tudo no mesmo slide',
      '<strong>Encerrar edição</strong> descarta as alterações',
      '<strong>Salvar</strong> grava e sai do modo edição',
      'Arrastar <strong>⋮⋮</strong> reordena os slides',
      'Último cartão = preto',
    ]);
  } else if (ehModoSlidesOperador()) {
    renderInstrucoesProjecao(
      `<strong>${n} slide(s)</strong>`,
      estadoPainel.projecaoMusicaEmitidaNoServidor
        ? [
            'Com projeção ativa, <strong>um clique</strong> num chip envia esse slide às telas',
            'Último chip = preto',
            ...atalhosProjecao,
          ]
        : [
            '<strong>Duplo clique na música na playlist</strong> inicia na 1.ª estrofe',
            'Na faixa, <strong>clique</strong> apenas seleciona',
            '<strong>Duplo clique</strong> no chip projeta',
            'Último chip = preto',
            ...atalhosProjecao,
          ]
    );
  } else {
    renderInstrucoesProjecao(`<strong>${n} estrofe(s)</strong>`, [
      'Coluna central: <strong>clique</strong> seleciona o slide',
      'Botão direito no chip abre a edição rápida',
      'Último chip = preto',
      '<strong>Próxima música</strong> carrega a seguinte da playlist',
      ...atalhosProjecao,
    ]);
  }
}

/**
 * Zoom da faixa: à vista, mas inerte enquanto não há slides para dimensionar.
 *
 * Esconder os botões seria mais limpo e pior: o operador deixaria de saber que o controlo
 * existe. Não exibir diz «existe, ainda não serve para nada» — que é a verdade do estado
 * ocioso. Fica no mesmo grupo que «Próxima música», que já seguia esta regra.
 *
 * @param {boolean} inertes
 */
export function definirControlosZoomFaixaSlidesInertes(inertes) {
  ['slides-zoom-menos', 'slides-zoom-mais'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!inertes;
  });
  const grupo = document.querySelector('.slides-dock-zoom-group');
  if (grupo) grupo.classList.toggle('slides-dock-zoom-group--inerte', !!inertes);
}

/**
 * Mensagem no vão da faixa quando ainda não há slides.
 *
 * Sem ela, o modo slides abre com uma área grande e vazia que parece falha de
 * carregamento. Diz só «playlist» de propósito: no modo slides, carregar do banco à
 * esquerda não arma a faixa — mandá-lo lá seria mandá-lo a lado nenhum.
 *
 * @param {boolean} mostrar
 */
export function definirVazioDaFaixaSlidesVisivel(mostrar) {
  const el = document.getElementById('slides-grid-vazio');
  if (el) el.hidden = !mostrar;
}

/** Nome na barra da faixa de slides — texto e dica saem sempre juntos daqui. */
export function definirNomeMusicaBarraSlides(el, titulo) {
  el.textContent = titulo;
  const artistaEl = document.getElementById('slides-musica-artista');
  if (artistaEl) artistaEl.textContent = titulo ? (estadoPainel.musicaAtiva?.artista || 'Sem artista') : '';
  if (titulo) el.dataset.dica = titulo;
  else delete el.dataset.dica;
}
