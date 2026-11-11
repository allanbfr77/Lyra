/**
 * Canais de projeção: ocupação do canal público/ministrante por Mídias e Bíblia, classificação da saída
 * por monitor e prévias dos monitores virtuais no modo Slides. Movido verbatim do núcleo
 * (`controllerAppCore.js`); o que o núcleo ainda possui entra por `registrarDependenciasCanaisProjecao`.
 */
import { aplicarPreviewTelaoNoDom, definirPreviewRelogioOciosoMinistrante, deveRevelarRelogioPreviewMinistrante, limparConteudoPreviewOperadorSlides, podeEspelharLetraNosPreviewsModoSlide, preencherPreviewOperadorSomenteEstadoServidorMusica, preencherPreviewOperadorSomenteMusicaLocal, selecaoLocalAlinhadaComProjecaoMusicaServidor } from './previewProjecao.js';
import { escapeHtml } from './textoHtmlSeguro.js';
import { limparEstiloPreviewSlide } from './tipografiaPainelPreview.js';
import { limparPreviewTituloMusicaAbertura } from './tituloAberturaPreview.js';
import { musicaEstadoCombinaComAtiva } from './projecaoMusica.js';
import { precisaReporRotaSlides, rotaSlidesReposta } from '../modules/reposicaoRotaSlides.js';
import { rotuloTipoMidiaApresentacao, svgIconeTipoMidiaApresentacao } from '../modules/midiaApresentacao.js';
import { normalizarRota, salvarRotasPorModoNoStorage, sanitizarRotaProjecao } from './rotasMonitores.js';
import { rotaSlidesAoEntrarNoModo } from './conteudoUnificadoAviso.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { atualizarEstiloRotasDesativadas, renderRoteamentoTelas } from './roteamentoTelasUi.js';
import { ehModoSlidesOperador } from './modosUi.js';

function apresentacaoOcupandoCanalPublico() {
  return normalizarRota(estadoPainel.rotasPorModo.apresentacao).publicoIndex >= 0;
}

export function apresentacaoOcupandoCanalMinistrante() {
  return normalizarRota(estadoPainel.rotasPorModo.apresentacao).ministranteIndex >= 0;
}

/** Projeção activa do modo Apresentação no canal público (rota apresentação + estado no telão). */
export function apresentacaoProjecaoAtivaNoCanalPublico() {
  const ap = normalizarRota(estadoPainel.rotasPorModo.apresentacao);
  if (ap.live || ap.publicoIndex < 0) return false;
  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  if (e.tipo === 'apresentacao' && e.apresentacao && String(e.apresentacao.src || '').trim()) {
    return true;
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) return true;
  return false;
}

/** Projeção activa do modo Apresentação no canal ministrante. */
function apresentacaoProjecaoAtivaNoCanalMinistrante() {
  const ap = normalizarRota(estadoPainel.rotasPorModo.apresentacao);
  if (ap.live || ap.ministranteIndex < 0) return false;
  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  /* Apenas M3: telão no socket pode ficar «limpo» com projecaoMinistranteApresentacao. */
  if (e.projecaoMinistranteApresentacao) return true;
  if (e.tipo === 'biblia' || e.tipo === 'musica') return false;
  if (
    ap.publicoIndex < 0 &&
    e.tipo === 'apresentacao' &&
    e.apresentacao &&
    String(e.apresentacao.src || '').trim()
  ) {
    return true;
  }
  return false;
}

/**
 * Versículo no ar no canal público.
 *
 * Gémeo de `apresentacaoProjecaoAtivaNoCanalPublico` para o outro inquilino do canal
 * partilhado. A rota diz QUAL canal a Bíblia pediu (o seletor dela), o estado do servidor
 * diz se há mesmo versículo no ar — as duas coisas, como no lado das Mídias.
 *
 * Não se funde com aquele: o classificador das prévias usa-o para escolher o rótulo da
 * badge, e «Imagem no Telão» não é «Versículo no Telão».
 */
export function bibliaProjecaoAtivaNoCanalPublico() {
  const b = normalizarRota(estadoPainel.rotasPorModo.biblia);
  if (b.live || b.publicoIndex < 0) return false;
  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  return !!(e.tipo === 'biblia' && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length);
}

/**
 * Versículo no ar no canal do ministrante.
 *
 * Dois caminhos porque o servidor tem dois: com alvo «ministrante» o canal público leva
 * override de tela limpa e o que sobra é a bandeira `projecaoBibliaMinistrante`; com alvo
 * «ambos» não há override nenhum e o versículo viaja no próprio payload público.
 */
export function bibliaProjecaoAtivaNoCanalMinistrante() {
  const b = normalizarRota(estadoPainel.rotasPorModo.biblia);
  if (b.live || b.ministranteIndex < 0) return false;
  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  if (e.projecaoBibliaMinistrante) return true;
  return !!(e.tipo === 'biblia' && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length);
}

/**
 * O canal público está ocupado por outro modo do canal partilhado — Mídias ou Bíblia?
 *
 * Uma noção só, para o seletor do Slides e para as prévias: o monitor está emprestado,
 * seja a uma imagem ou a um versículo. Quem precisa de saber QUAL dos dois (o rótulo da
 * badge) continua a perguntar aos predicados de cada modo.
 */
export function canalPublicoOcupadoPorOutroModoNoSlides() {
  return apresentacaoProjecaoAtivaNoCanalPublico() || bibliaProjecaoAtivaNoCanalPublico();
}

/** Igual, para o canal do ministrante. */
export function canalMinistranteOcupadoPorOutroModoNoSlides() {
  return apresentacaoProjecaoAtivaNoCanalMinistrante() || bibliaProjecaoAtivaNoCanalMinistrante();
}

/**
 * Telão com mídia do modo Apresentação activa (ignora Bíblia, Slides e fundo estático).
 * Usado pelo preview do modo Slide — não confundir bgImage da Bíblia com projeção.
 */
export function estadoServidorEhProjecaoApresentacaoAtivaNoTelao() {
  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.tipo === 'biblia' || e.tipo === 'musica') return false;
  if (e.telaLimpa || e.blackout || e.slidePretoFinal) return false;
  if (e.tipo === 'apresentacao') {
    return !!(e.apresentacao && String(e.apresentacao.src || '').trim());
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) return true;
  return false;
}

/** Preview Slide (público): informe de mídia da Apresentação activa no telão público. */
function slidePreviewDeveMostrarInformeMidiaApresentacaoNoPublico() {
  if (!ehModoSlidesOperador()) return false;
  return apresentacaoProjecaoAtivaNoCanalPublico();
}

/**
 * Mídia/aviso activos no canal ministrante (M3), para a prévia do modo Slides.
 * Usa o flag do socket (`projecaoMinistranteApresentacao`) e não só a rota local —
 * a rota pode ficar desactualizada ao projetar pelo Mídias noutro momento.
 * Exclui override de tela limpa da Bíblia e contagem (não são badge de mídia).
 */
function midiaApresentacaoAtivaNoCanalMinistranteParaPreviewSlides() {
  if (!ehModoSlidesOperador()) return false;
  if (apresentacaoProjecaoAtivaNoCanalMinistrante()) return true;
  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  if (e.tipo === 'biblia' || e.tipo === 'contagem') return false;
  return !!e.projecaoMinistranteApresentacao;
}

/** Preview Slide (ministrante): informe de mídia da Apresentação activa na TV ministrante. */
function slidePreviewDeveMostrarInformeMidiaApresentacaoNoMinistrante() {
  if (!ehModoSlidesOperador()) return false;
  return midiaApresentacaoAtivaNoCanalMinistranteParaPreviewSlides();
}

/**
 * Há projeção real no canal ministrante (M3) para a prévia do modo Slides.
 * Independente do M2: mídia só no telão não conta; slides no M3 contam mesmo com
 * Mídias no M2 (o `estado` do socket pode continuar `tipo: 'apresentacao'`).
 */
function hayProjecaoAtivaNoCanalMinistranteParaPreviewSlides() {
  if (!ehModoSlidesOperador()) return false;
  if (midiaApresentacaoAtivaNoCanalMinistranteParaPreviewSlides()) return true;
  if (obterRotaSlidesParaUi().ministranteIndex < 0) return false;

  /* Letra já emitida neste painel: M3 tem conteúdo mesmo com override de Mídias no público. */
  if (estadoPainel.projecaoMusicaEmitidaNoServidor && estadoPainel.musicaAtiva && Number(estadoPainel.estrofeAtiva) >= 0) {
    return true;
  }

  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout) return true;
  if (e.tipo === 'musica') {
    if (e.slidePretoFinal) return true;
    return !!(!e.telaLimpa && e.linhas && e.linhas.length);
  }
  if (
    e.tipo === 'biblia' &&
    (!e.telaLimpa || e.projecaoSomenteMinistrante || e.projecaoBibliaMinistrante)
  ) {
    return !!(e.linhas && e.linhas.length) || !!e.projecaoBibliaMinistrante;
  }
  return false;
}

function preencherPreviewInformeMidiaApresentacaoSlide(el) {
  if (!el) return;
  const e = estadoPainel.estadoServidor;
  const ap = e && e.apresentacao ? e.apresentacao : {};
  const kind = String(ap.kind || 'image').toLowerCase();
  const tipoRotulo = rotuloTipoMidiaApresentacao(kind);
  preencherPreviewBadgeInformativoSlides(el, {
    kind,
    label: `${tipoRotulo} no Telão`,
  });
}

/**
 * Badge informativo na prévia do modo Slides (conteúdo de outro modo no monitor).
 * @param {HTMLElement|null} el
 * @param {{ kind?: string, label: string }} badge
 */
function preencherPreviewBadgeInformativoSlides(el, badge) {
  if (!el) return;
  const kind = String(badge?.kind || 'image').toLowerCase();
  const label = String(badge?.label || 'Projeção no telão').trim();
  const iconKinds = new Set(['image', 'video', 'audio', 'pdf', 'iframe', 'aviso']);
  const icon = svgIconeTipoMidiaApresentacao(iconKinds.has(kind) ? kind : 'iframe');
  el.innerHTML = `<span class="pv-live-ap-meta">${icon}<span class="pv-live-ap-meta-txt">${escapeHtml(label)}</span></span>`;
  /* O selo substitui o conteúdo: o texto cru e o cache da letra do ministrante deixam de valer. */
  delete el.dataset.previewMinistranteRaw;
  el.__lyraHtmlPreviewMinistrante = '';
  el.__lyraNoPreviewMinistrante = null;
  const clsBase = el.classList.contains('op-slide-text') ? 'op-slide-text' : 'pv-live-letras';
  el.className = clsBase;
  el.classList.remove('vazio');
  limparEstiloPreviewSlide(el);
}

/**
 * Classifica a saída real do M2 (público) para a prévia virtual do modo Slides.
 * Independente do M3 e da aba aberta — só o estado de saída deste monitor.
 * @returns {{ mode: 'idle'|'blackout'|'slides'|'badge', badge?: {kind:string,label:string}, estadoSlides?: object }}
 */
export function classificarSaidaMonitorPublicoSlides() {
  const r = obterRotaSlidesParaUi();
  /*
   * «Não exibir» neste canal NÃO significa monitor apagado quando é o Mídias que o
   * ocupa. A ocupação já não se escreve na rota do Slides, mas o operador pode ter
   * apagado o canal à mão com a mídia no ar — e aí a badge, que existe precisamente para
   * dizer «outro modo está neste monitor», continua a ser a leitura certa.
   * `apresentacaoProjecaoAtivaNoCanalPublico` já exige rota do Mídias neste canal e mídia
   * mesmo no ar, por isso o caso «canal desligado à mão, sem nada a projetar» continua
   * ocioso como antes.
   */
  if (r.publicoIndex < 0 && !canalPublicoOcupadoPorOutroModoNoSlides()) return { mode: 'idle' };

  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return { mode: 'idle' };
  if (e.blackout) return { mode: 'blackout' };

  /* Outros modos no M2 → só badge (não reproduzir o conteúdo visual). */
  if (apresentacaoProjecaoAtivaNoCanalPublico()) {
    if (e.tipo === 'aviso') {
      return { mode: 'badge', badge: { kind: 'aviso', label: 'Aviso no Telão' } };
    }
    const kind = String((e.apresentacao && e.apresentacao.kind) || 'image').toLowerCase();
    return {
      mode: 'badge',
      badge: { kind, label: `${rotuloTipoMidiaApresentacao(kind)} no Telão` },
    };
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) {
    return { mode: 'badge', badge: { kind: 'aviso', label: 'Aviso no Telão' } };
  }
  if (e.tipo === 'contagem' && e.contagem) {
    return { mode: 'badge', badge: { kind: 'contagem', label: 'Cronômetro no Telão' } };
  }
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) {
    return { mode: 'badge', badge: { kind: 'biblia', label: 'Versículo no Telão' } };
  }

  /* Modo Slides (música) no M2 → cópia visual da projeção. */
  if (e.tipo === 'musica') {
    if (e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length)) {
      return { mode: 'slides', estadoSlides: e };
    }
  }

  return { mode: 'idle' };
}

/**
 * Classifica a saída real do M3 (ministrante) para a prévia virtual do modo Slides.
 * Independente do M2 — flags/rota/emissão local só para inferir este canal.
 * @returns {{ mode: 'idle'|'blackout'|'slides'|'badge', clock?: boolean, badge?: {kind:string,label:string} }}
 */
export function classificarSaidaMonitorMinistranteSlides() {
  const r = obterRotaSlidesParaUi();
  /* Mesma razão do canal público: com o Mídias a ocupar o monitor do ministrante, o −1
     da rota do Slides é a cedência do canal, não um monitor apagado. Ver
     `classificarSaidaMonitorPublicoSlides`. */
  if (r.ministranteIndex < 0 && !canalMinistranteOcupadoPorOutroModoNoSlides()) {
    return { mode: 'idle', clock: false };
  }

  const e = estadoPainel.estadoServidor;
  if (!projecao.pronta()) return { mode: 'idle', clock: true };
  if (e && e.blackout) return { mode: 'blackout' };

  /* Mídia/aviso do Mídias no M3. */
  if (midiaApresentacaoAtivaNoCanalMinistranteParaPreviewSlides()) {
    if (e && e.tipo === 'aviso') {
      return { mode: 'badge', badge: { kind: 'aviso', label: 'Aviso no Telão' } };
    }
    const kind = String((e && e.apresentacao && e.apresentacao.kind) || 'image').toLowerCase();
    return {
      mode: 'badge',
      badge: { kind, label: `${rotuloTipoMidiaApresentacao(kind)} no Telão` },
    };
  }

  /* Contagem no M3 (override). */
  if (e && e.projecaoMinistranteApresentacao && e.tipo === 'contagem' && e.contagem) {
    return { mode: 'badge', badge: { kind: 'contagem', label: 'Cronômetro no Telão' } };
  }

  /* Bíblia no M3. */
  if (e && e.projecaoBibliaMinistrante) {
    return { mode: 'badge', badge: { kind: 'biblia', label: 'Versículo no Telão' } };
  }
  if (e && e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) {
    /* Bíblia só no público: override limpa o M3 → ocioso, não badge. */
    if (e.projecaoMinistranteApresentacao && !e.projecaoBibliaMinistrante) {
      return { mode: 'idle', clock: true };
    }
    return { mode: 'badge', badge: { kind: 'biblia', label: 'Versículo no Telão' } };
  }

  /* Slides (música) no M3 — mesmo com Mídias ainda no M2 (tipo do socket pode ser apresentação). */
  if (estadoPainel.projecaoMusicaEmitidaNoServidor && estadoPainel.musicaAtiva && Number(estadoPainel.estrofeAtiva) >= 0) {
    return { mode: 'slides' };
  }
  if (e && e.tipo === 'musica' && (e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length))) {
    return { mode: 'slides' };
  }

  return { mode: 'idle', clock: true };
}

/** Prévia virtual do M2 no modo Slides — só este monitor. */
export function atualizarPreviewMonitorPublicoSlides() {
  const cls = classificarSaidaMonitorPublicoSlides();
  if (cls.mode === 'badge' && cls.badge) {
    const prevTitulo = document.getElementById('pv-live-titulo');
    const prevLetras = document.getElementById('pv-live-letras');
    if (prevTitulo) prevTitulo.textContent = '';
    preencherPreviewBadgeInformativoSlides(prevLetras, cls.badge);
    return;
  }
  if (cls.mode === 'blackout') {
    aplicarPreviewTelaoNoDom({ blackout: true });
    return;
  }
  if (cls.mode === 'slides' && cls.estadoSlides) {
    aplicarPreviewTelaoNoDom(cls.estadoSlides);
    return;
  }
  aplicarPreviewTelaoNoDom({ semProjecao: true });
}

/** Prévia virtual do M3 no modo Slides — só este monitor. */
export function atualizarPreviewMonitorMinistranteSlides() {
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  const cls = classificarSaidaMonitorMinistranteSlides();

  if (cls.mode === 'badge' && cls.badge) {
    definirPreviewRelogioOciosoMinistrante(false);
    limparPreviewTituloMusicaAbertura();
    preencherPreviewBadgeInformativoSlides(opA, cls.badge);
    if (opP) {
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
    }
    return;
  }

  if (cls.mode === 'blackout') {
    definirPreviewRelogioOciosoMinistrante(false);
    limparConteudoPreviewOperadorSlides();
    if (opA) {
      opA.textContent = 'Tela preta (F10)';
      opA.className = 'op-slide-text vazio';
    }
    return;
  }

  if (cls.mode === 'slides') {
    definirPreviewRelogioOciosoMinistrante(false);
    const e = estadoPainel.estadoServidor;
    const servidorMostraMusica =
      e &&
      e.tipo === 'musica' &&
      !e.blackout &&
      (e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length));
    const alinhado =
      servidorMostraMusica &&
      estadoPainel.musicaAtiva &&
      musicaEstadoCombinaComAtiva(e) &&
      estadoPainel.projecaoMusicaEmitidaNoServidor;
    if (servidorMostraMusica && !alinhado) {
      preencherPreviewOperadorSomenteEstadoServidorMusica();
    } else if (
      alinhado &&
      !selecaoLocalAlinhadaComProjecaoMusicaServidor()
    ) {
      preencherPreviewOperadorSomenteEstadoServidorMusica();
    } else if (estadoPainel.projecaoMusicaEmitidaNoServidor || podeEspelharLetraNosPreviewsModoSlide()) {
      preencherPreviewOperadorSomenteMusicaLocal();
    } else if (servidorMostraMusica) {
      preencherPreviewOperadorSomenteEstadoServidorMusica();
    } else {
      limparConteudoPreviewOperadorSlides();
    }
    return;
  }

  /* Idle: estado padrão do M3 (relógio conforme Ajustes). */
  limparConteudoPreviewOperadorSlides();
  definirPreviewRelogioOciosoMinistrante(!!cls.clock && deveRevelarRelogioPreviewMinistrante());
}

/**
 * Orquestra as duas prévias-virtuais do modo Slides de forma independente.
 * MONITOR REAL → estado da saída → prévia correspondente (não a aba actual).
 */
export function atualizarPreviewsMonitoresVirtuaisModoSlides() {
  atualizarPreviewMonitorMinistranteSlides();
  atualizarPreviewMonitorPublicoSlides();
}

/** Apresentação no público e slides no público em monitores diferentes (convivência). */
function slidesCanalPublicoSeparadoDaApresentacao() {
  if (!ehModoSlidesOperador()) return false;
  const ap = normalizarRota(estadoPainel.rotasPorModo.apresentacao);
  const sl = normalizarRota(estadoPainel.rotasPorModo.slides);
  if (ap.live || sl.publicoIndex < 0) return false;
  if (ap.publicoIndex >= 0 && sl.publicoIndex !== ap.publicoIndex) return true;
  if (ap.ministranteIndex >= 0 && sl.publicoIndex !== ap.ministranteIndex) return true;
  return false;
}

/**
 * Rota do modo Slide para os seletores: estado real gravado em `rotasPorModo.slides`
 * (sem mascarar nem reatribuir monitores por conflito com Apresentação).
 */
export function obterRotaSlidesParaUi() {
  return sanitizarRotaProjecao(normalizarRota(estadoPainel.rotasPorModo.slides), estadoPainel.monitoresServidorCache);
}

/** Atualiza só a UI dos seletores Público/Ministrante no modo Slide. */
export function syncRoteamentoTelasModoSlidesNaUi() {
  if (!ehModoSlidesOperador()) return;
  renderRoteamentoTelas(estadoPainel.monitoresServidorCache, obterRotaSlidesParaUi());
  atualizarEstiloRotasDesativadas();
}

/**
 * Quando o Mídias (ou outro modo no canal partilhado) liberta monitores, repõe canais do
 * Slides que tinham sido desligados automaticamente — sem tocar em «Não exibir» manual.
 */
export function restaurarRotaSlidesAposLibertarMonitores() {
  if (!precisaReporRotaSlides(estadoPainel.rotasPorModo.slides)) return false;
  estadoPainel.rotasPorModo.slides = rotaSlidesReposta(estadoPainel.rotasPorModo.slides, rotaSlidesAoEntrarNoModo());
  salvarRotasPorModoNoStorage();
  if (ehModoSlidesOperador()) {
    syncRoteamentoTelasModoSlidesNaUi();
  }
  return true;
}
