/**
 * Geometria da grelha de slides do painel (zoom, colunas, auto-fit, digest).
 *
 * Extraído do AppCore (secção D) sem mudar o critério visual: o 1.º frame pinta
 * com a fonte CSS e o fit corre depois, em lotes. `renderSlidesStrip` continua
 * no núcleo — só chama daqui digest, colunas e encaixe.
 */

import { LS_SLIDES_CHIP_ZOOM, LS_SLIDES_POR_LINHA } from './chavesArmazenamentoLocal.js';
import {
  deltaScrollGrelhaSlidesAntecipado,
  indiceChipAntecipacao,
} from './scrollGrelhaSlides.js';
import { escapeHtml } from '../painel/textoHtmlSeguro.js';
import {
  calcularFontePxSnippetGrelhaSlide,
  criarMedidorLarguraProporcionalCanvas,
} from '../painel/tipografiaPainelPreview.js';

export const SLIDES_CHIP_ZOOM_MIN_PCT = 50;
export const SLIDES_CHIP_ZOOM_MAX_PCT = 150;
export const SLIDES_CHIP_ZOOM_PASSO_PCT = 5;
export const SLIDES_POR_LINHA_OPCOES = [7, 5, 3];
export const SLIDES_POR_LINHA_PADRAO = 7;

const GRELHA_FIT_LOTE = 4;
const GRELHA_FIT_MARGEM_PERTO_PX = 120;

export function zoomPercentualSlides(z) {
  const pct = Math.round(Number(z) * 100);
  return Number.isFinite(pct) ? pct : 100;
}

export function clampSlidesChipZoom(z) {
  const alinhado = Math.round(zoomPercentualSlides(z) / SLIDES_CHIP_ZOOM_PASSO_PCT) * SLIDES_CHIP_ZOOM_PASSO_PCT;
  const limitado = Math.min(SLIDES_CHIP_ZOOM_MAX_PCT, Math.max(SLIDES_CHIP_ZOOM_MIN_PCT, alinhado));
  return limitado / 100;
}

export function normalizarSlidesPorLinha(n) {
  const v = parseInt(n, 10);
  return SLIDES_POR_LINHA_OPCOES.includes(v) ? v : SLIDES_POR_LINHA_PADRAO;
}

/** Digest rápido das estrofes — se mudar, a faixa de slides precisa ser reconstruída. */
export function digestEstrofesParaStripFaixa(arr) {
  if (!arr || !arr.length) return '0';
  let h = 2166136261;
  for (let i = 0; i < arr.length; i++) {
    const s = String(arr[i] ?? '');
    h ^= s.length;
    for (let j = 0; j < s.length; j++) {
      h = Math.imul(h ^ s.charCodeAt(j), 16777619);
    }
  }
  return `${arr.length}:${h >>> 0}`;
}

export function textoSlideMaiusculo(texto) {
  return (texto || '').toUpperCase();
}

/** HTML para o cartão da faixa — cada linha da letra permanece uma linha visual. */
export function textoSlideSnippetHtmlParaChip(estrofe) {
  const raw = textoSlideMaiusculo(estrofe || '');
  const lines = raw.split(/\r\n|\r|\n/);
  return lines
    .map((line) => {
      const empty = line === '';
      const cls = empty ? 'slide-snippet-line slide-snippet-line--empty' : 'slide-snippet-line';
      const inner = empty ? '\u00a0' : escapeHtml(line);
      return `<span class="${cls}">${inner}</span>`;
    })
    .join('');
}

/**
 * @param {object} d
 * @param {() => boolean} d.ehModoSlidesOperador
 * @param {() => { id?: *, estrofes?: string[], titulo?: string } | null} d.getMusicaAtiva
 * @param {() => number} d.getEstrofeAtiva
 * @param {() => boolean} d.getFaixaHabilitada
 * @param {() => boolean} d.getProjecaoEmitida
 */
export function criarSlidesGrelha(d) {
  let slidesChipZoomLevel = 1;
  let slidesPorLinha = SLIDES_POR_LINHA_PADRAO;
  let grelhaFitGeracao = 0;
  let slidesGridViewportFitTimer = null;

  function applySlidesChipZoomLevel(z) {
    slidesChipZoomLevel = clampSlidesChipZoom(z);
    const dock = document.getElementById('slides-dock');
    if (dock) dock.style.setProperty('--slide-chip-zoom', String(slidesChipZoomLevel));
    localStorage.setItem(LS_SLIDES_CHIP_ZOOM, String(slidesChipZoomLevel));
    const lab = document.getElementById('slides-zoom-val');
    if (lab) lab.textContent = `${Math.round(slidesChipZoomLevel * 100)}%`;
    queueMicrotask(() => ajustarEncaixeGrelhaSlidesModoSlides());
  }

  function slideChipSnippetBaseFontPx() {
    const dock = document.getElementById('slides-dock');
    let base = 14;
    if (dock) {
      const raw = getComputedStyle(dock).getPropertyValue('--slide-chip-snippet-px').trim();
      const n = parseFloat(raw, 10);
      if (Number.isFinite(n) && n > 0) base = n;
    }
    return base * slidesChipZoomLevel;
  }

  function podeAtualizarSomenteAtivoFaixaSlides() {
    if (!d.ehModoSlidesOperador() || !d.getFaixaHabilitada()) return false;
    const musicaAtiva = d.getMusicaAtiva();
    if (!musicaAtiva || !musicaAtiva.estrofes || !musicaAtiva.estrofes.length) return false;
    const grid = document.getElementById('slides-grid');
    if (!grid || !grid.dataset.stripMusicaId) return false;
    const n = musicaAtiva.estrofes.length;
    if (String(musicaAtiva.id ?? '') !== grid.dataset.stripMusicaId) return false;
    if (String(n) !== grid.dataset.stripEstrofeCount) return false;
    if (digestEstrofesParaStripFaixa(musicaAtiva.estrofes) !== grid.dataset.stripDigest) return false;
    /*
     * `stripProjecao` NÃO entra nesta conta. O duplo clique só muda o flag de
     * projeção + o chip activo: se isso forçasse rebuild, a grelha ia ao chão
     * (`innerHTML = ''`), o auto-fit da fonte corria outra vez e os cartões
     * tremiam / mudavam de tamanho. O fundo dourado do chip projectado actualiza-se
     * no sítio, em `atualizarSomenteAtivoFaixaSlides`.
     */
    const chips = grid.querySelectorAll('.slide-chip:not(.slide-chip--preto)');
    if (chips.length !== n) return false;
    if (!grid.querySelector('.slide-chip--preto')) return false;
    return true;
  }

  function atualizarSomenteAtivoFaixaSlides() {
    const grid = document.getElementById('slides-grid');
    const musicaAtiva = d.getMusicaAtiva();
    if (!grid || !musicaAtiva || !musicaAtiva.estrofes) return;
    const n = musicaAtiva.estrofes.length;
    const estrofeAtiva = d.getEstrofeAtiva();
    grid.dataset.stripProjecao = d.getProjecaoEmitida() ? '1' : '0';
    grid.querySelectorAll('.slide-chip:not(.slide-chip--preto)').forEach((chip, i) => {
      const ativo = estrofeAtiva === i;
      chip.classList.toggle('ativo', ativo);
      chip.setAttribute('aria-current', ativo ? 'true' : 'false');
    });
    const preto = grid.querySelector('.slide-chip--preto');
    if (preto) {
      const ativoPreto = estrofeAtiva === n;
      preto.classList.toggle('ativo', ativoPreto);
      preto.setAttribute('aria-current', ativoPreto ? 'true' : 'false');
    }
  }

  function obterChipEstrofeNaGrelha(idx) {
    const grid = document.getElementById('slides-grid');
    if (!grid || !Number.isFinite(idx) || idx < 0) return null;
    const porData = grid.querySelector(`.slide-chip[data-i="${idx}"]`);
    if (porData) return porData;
    const chips = grid.querySelectorAll('.slide-chip');
    return chips[idx] || null;
  }

  function obterScrollportGrelhaSlides() {
    const viewport = document.getElementById('slides-grid-viewport');
    if (d.ehModoSlidesOperador() && viewport) return viewport;
    return document.getElementById('slides-grid');
  }

  function colunasVisiveisGrelhaSlides() {
    return d.ehModoSlidesOperador() ? slidesPorLinha : 7;
  }

  function obterChipAntecipacaoNaGrelha(idx) {
    const grid = document.getElementById('slides-grid');
    if (!grid) return null;
    const chips = grid.querySelectorAll('.slide-chip');
    const alvo = indiceChipAntecipacao(idx, colunasVisiveisGrelhaSlides(), chips.length);
    if (alvo < 0) return null;
    return obterChipEstrofeNaGrelha(alvo);
  }

  function revelarChipEstrofeFocado(idx, { suave = true } = {}) {
    if (typeof document !== 'undefined' && document.hidden) return;
    const chip = obterChipEstrofeNaGrelha(idx);
    const porta = obterScrollportGrelhaSlides();
    if (!chip || !porta) return;
    void chip.offsetWidth;

    const vr = porta.getBoundingClientRect();
    const cr = chip.getBoundingClientRect();
    if (!(vr.height > 8) || !(cr.height > 0)) return;

    const chipProx = obterChipAntecipacaoNaGrelha(idx);
    const lr = chipProx && chipProx !== chip ? chipProx.getBoundingClientRect() : null;
    const delta = deltaScrollGrelhaSlidesAntecipado({
      viewport: { top: vr.top, bottom: vr.bottom, height: vr.height },
      chip: { top: cr.top, bottom: cr.bottom, height: cr.height },
      lookahead: lr ? { top: lr.top, bottom: lr.bottom, height: lr.height } : null,
    });
    if (Math.abs(delta) < 1) return;

    const maxScroll = Math.max(0, porta.scrollHeight - porta.clientHeight);
    const alvo = Math.max(0, Math.min(maxScroll, porta.scrollTop + delta));
    if (Math.abs(alvo - porta.scrollTop) < 1) return;

    let behavior = 'auto';
    if (suave) {
      try {
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) behavior = 'smooth';
      } catch (_) {}
    }
    porta.scrollTo({ top: alvo, behavior });
  }

  function revelarGradeSlides() {
    const grid = document.getElementById('slides-grid');
    if (grid && grid.style.visibility === 'hidden') grid.style.visibility = '';
  }

  function agendarLoteGrelhaFit(fn, { idle = false, timeout = 48 } = {}) {
    if (idle && typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => fn(), { timeout });
      return;
    }
    requestAnimationFrame(() => fn());
  }

  function ordenarChipsGrelhaPorVisibilidade(chips, viewport) {
    const lista = [...chips];
    if (!viewport || !lista.length) return { fila: lista, nVisiveis: lista.length };
    const vr = viewport.getBoundingClientRect();
    const scored = lista.map((chip) => {
      const r = chip.getBoundingClientRect();
      const visivel =
        r.bottom > vr.top && r.top < vr.bottom && r.right > vr.left && r.left < vr.right;
      const perto =
        r.bottom > vr.top - GRELHA_FIT_MARGEM_PERTO_PX &&
        r.top < vr.bottom + GRELHA_FIT_MARGEM_PERTO_PX;
      const prioridade = visivel ? 0 : perto ? 1 : 2;
      return { chip, prioridade, top: r.top };
    });
    scored.sort((a, b) => a.prioridade - b.prioridade || a.top - b.top);
    const nVisiveis = scored.reduce((n, s) => n + (s.prioridade === 0 ? 1 : 0), 0);
    return { fila: scored.map((s) => s.chip), nVisiveis };
  }

  function razaoLineHeightSnippetSlide(cs) {
    const varLh = parseFloat(cs.getPropertyValue('--slide-chip-snippet-lh'));
    if (Number.isFinite(varLh) && varLh >= 0.5 && varLh <= 4) return varLh;
    const lhPx = parseFloat(cs.lineHeight);
    const fsPx = parseFloat(cs.fontSize);
    if (Number.isFinite(lhPx) && Number.isFinite(fsPx) && fsPx > 0) {
      const r = lhPx / fsPx;
      if (r >= 0.5 && r <= 4) return r;
    }
    return 1.42;
  }

  function slideChipNumAlturaFallbackPx() {
    const dock = document.getElementById('slides-dock');
    let base = 22;
    if (dock) {
      const raw = parseFloat(getComputedStyle(dock).getPropertyValue('--slide-chip-num-px'));
      if (Number.isFinite(raw) && raw > 0) base = raw;
    }
    return base * slidesChipZoomLevel;
  }

  function lerGeometriaChipGrelha(chip) {
    const snippet = chip.querySelector('.slide-snippet');
    if (!snippet) return null;
    const cs = getComputedStyle(snippet);
    const cChip = getComputedStyle(chip);
    const z = slidesChipZoomLevel;
    const padX = parseFloat(cChip.paddingLeft) + parseFloat(cChip.paddingRight);
    const padY = parseFloat(cChip.paddingTop) + parseFloat(cChip.paddingBottom);
    const snPadX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) || 0;
    const availW = Math.max(12, chip.clientWidth - padX - snPadX - 2);
    const numEl = chip.querySelector('.slide-num');
    let numH = numEl ? numEl.getBoundingClientRect().height : 0;
    if (!Number.isFinite(numH) || numH <= 0) numH = slideChipNumAlturaFallbackPx();
    const innerH = Math.max(0, chip.clientHeight - padY);
    const availH = Math.max(24, innerH - numH - 6 * z - 1);
    const lh = razaoLineHeightSnippetSlide(cs);
    const gapLinhas = parseFloat(cs.rowGap || cs.gap) || 3 * z;
    const fsAtual = parseFloat(cs.fontSize) || 0;
    const lsPx = parseFloat(cs.letterSpacing);
    const lsEm = Number.isFinite(lsPx) && fsAtual > 0 ? lsPx / fsAtual : 0.035;
    return {
      availW,
      availH,
      lh,
      gapLinhas,
      lsEm,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      textTransform: cs.textTransform,
    };
  }

  function aplicarFonteNumChipGrelha(chip, geo, medidor) {
    const snippet = chip.querySelector('.slide-snippet');
    if (!snippet) return;
    const lineEls = [...snippet.querySelectorAll('.slide-snippet-line')];
    if (!lineEls.length) return;
    const textos = lineEls
      .filter((el) => !el.classList.contains('slide-snippet-line--empty'))
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);
    if (!textos.length) return;

    const chave = [
      textos.join('\u001f'),
      geo.availW.toFixed(1),
      geo.availH.toFixed(1),
      String(lineEls.length),
      String(geo.lh),
      String(geo.gapLinhas),
      geo.lsEm.toFixed(4),
      geo.fontFamily,
      geo.fontWeight,
    ].join('|');

    if (snippet.dataset.fitChave === chave && snippet.dataset.fitPx) return;

    const medirLarguraMaxPx = (fontPx) => medidor.medirLarguraMaxPx(fontPx, textos);
    const px = calcularFontePxSnippetGrelhaSlide({
      textos,
      availW: geo.availW,
      availH: geo.availH,
      nLinhasBloco: lineEls.length,
      lineHeight: geo.lh,
      lineGapPx: geo.gapLinhas,
      minPx: 6,
      maxPx: geo.availH,
      medirLarguraMaxPx,
    });

    const pxStr = `${px}px`;
    if (snippet.style.fontSize !== pxStr) {
      snippet.style.setProperty('font-size', pxStr, 'important');
    }
    snippet.dataset.fitChave = chave;
    snippet.dataset.fitPx = pxStr;
  }

  function iniciarJobAjusteFonteGrelhaIncremental(gen, viewport) {
    if (gen !== grelhaFitGeracao) return;
    const grid = document.getElementById('slides-grid');
    const chips = grid
      ? grid.querySelectorAll('.slide-chip:not(.slide-chip--preto)')
      : [];
    const amostra = chips[0];
    if (!amostra) return;

    const geo = lerGeometriaChipGrelha(amostra);
    if (!geo) return;

    const { fila, nVisiveis } = ordenarChipsGrelhaPorVisibilidade(chips, viewport);
    const medidor = criarMedidorLarguraProporcionalCanvas({
      fontFamily: geo.fontFamily,
      fontWeight: geo.fontWeight,
      fontStyle: geo.fontStyle,
      letterSpacingEm: geo.lsEm,
      textTransform: geo.textTransform || 'uppercase',
    });

    const processar = (idx) => {
      if (gen !== grelhaFitGeracao) return;
      const fim = Math.min(idx + GRELHA_FIT_LOTE, fila.length);
      for (let i = idx; i < fim; i++) {
        aplicarFonteNumChipGrelha(fila[i], geo, medidor);
      }
      if (fim >= fila.length) return;
      const visiveisFeitos = fim >= nVisiveis;
      agendarLoteGrelhaFit(() => processar(fim), { idle: visiveisFeitos, timeout: 64 });
    };

    processar(0);
  }

  function ajustarFonteSnippetsNosSlideChips(tentativa = 0) {
    revelarGradeSlides();
    grelhaFitGeracao += 1;
    if (!d.ehModoSlidesOperador()) return;
    const grid = document.getElementById('slides-grid');
    if (!grid) return;
    const chips = grid.querySelectorAll('.slide-chip:not(.slide-chip--preto)');
    if (!chips.length) return;

    const amostra = chips[0];
    if (amostra && amostra.clientWidth < 48 && tentativa < 5) {
      requestAnimationFrame(() => ajustarFonteSnippetsNosSlideChips(tentativa + 1));
      return;
    }

    const gen = grelhaFitGeracao;
    const viewport = document.getElementById('slides-grid-viewport');
    agendarLoteGrelhaFit(() => {
      if (gen !== grelhaFitGeracao) return;
      iniciarJobAjusteFonteGrelhaIncremental(gen, viewport);
    }, { idle: true, timeout: 48 });
  }

  function ajustarEncaixeGrelhaSlidesModoSlides() {
    const grid = document.getElementById('slides-grid');
    const viewport = document.getElementById('slides-grid-viewport');
    if (grid) grid.style.zoom = '';
    revelarGradeSlides();
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!d.ehModoSlidesOperador() || !viewport || !grid) return;
    const dock = document.getElementById('slides-dock');
    if (!dock || dock.classList.contains('oculto')) return;
    requestAnimationFrame(() => {
      grid.style.zoom = '';
      ajustarFonteSnippetsNosSlideChips();
    });
  }

  function setupSlidesGridViewportFitObserver() {
    const vp = document.getElementById('slides-grid-viewport');
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (document.hidden) return;
      clearTimeout(slidesGridViewportFitTimer);
      slidesGridViewportFitTimer = setTimeout(() => ajustarEncaixeGrelhaSlidesModoSlides(), 80);
    });
    ro.observe(vp);
  }

  function initSlidesChipZoomFromStorage() {
    const raw = parseFloat(localStorage.getItem(LS_SLIDES_CHIP_ZOOM), 10);
    applySlidesChipZoomLevel(Number.isFinite(raw) ? raw : 1);
  }

  function setupSlidesChipZoomButtons() {
    const menos = document.getElementById('slides-zoom-menos');
    const mais = document.getElementById('slides-zoom-mais');
    if (!menos || !mais) return;
    menos.addEventListener('click', () => {
      applySlidesChipZoomLevel((zoomPercentualSlides(slidesChipZoomLevel) - SLIDES_CHIP_ZOOM_PASSO_PCT) / 100);
    });
    mais.addEventListener('click', () => {
      applySlidesChipZoomLevel((zoomPercentualSlides(slidesChipZoomLevel) + SLIDES_CHIP_ZOOM_PASSO_PCT) / 100);
    });
  }

  function atualizarBotoesSlidesPorLinha() {
    document.querySelectorAll('.slides-dock-cols-btn').forEach((btn) => {
      const ativo = normalizarSlidesPorLinha(btn.dataset.cols) === slidesPorLinha;
      btn.classList.toggle('ativo', ativo);
      btn.setAttribute('aria-checked', ativo ? 'true' : 'false');
    });
  }

  function applySlidesPorLinha(n) {
    const next = normalizarSlidesPorLinha(n);
    const mudou = next !== slidesPorLinha;
    slidesPorLinha = next;
    const grid = document.getElementById('slides-grid');
    if (grid) grid.dataset.slidesCols = String(slidesPorLinha);
    try {
      localStorage.setItem(LS_SLIDES_POR_LINHA, String(slidesPorLinha));
    } catch (_) {}
    atualizarBotoesSlidesPorLinha();
    if (mudou) {
      queueMicrotask(() => {
        ajustarEncaixeGrelhaSlidesModoSlides();
        requestAnimationFrame(() => revelarChipEstrofeFocado(d.getEstrofeAtiva(), { suave: false }));
      });
    }
  }

  function initSlidesPorLinhaFromStorage() {
    let raw = null;
    try {
      raw = localStorage.getItem(LS_SLIDES_POR_LINHA);
    } catch (_) {}
    applySlidesPorLinha(raw);
  }

  function setupSlidesPorLinhaButtons() {
    document.querySelectorAll('.slides-dock-cols-btn').forEach((btn) => {
      btn.addEventListener('click', () => applySlidesPorLinha(btn.dataset.cols));
    });
  }

  return {
    applySlidesChipZoomLevel,
    slideChipSnippetBaseFontPx,
    podeAtualizarSomenteAtivoFaixaSlides,
    atualizarSomenteAtivoFaixaSlides,
    obterChipEstrofeNaGrelha,
    obterScrollportGrelhaSlides,
    colunasVisiveisGrelhaSlides,
    obterChipAntecipacaoNaGrelha,
    revelarChipEstrofeFocado,
    revelarGradeSlides,
    ajustarFonteSnippetsNosSlideChips,
    ajustarEncaixeGrelhaSlidesModoSlides,
    setupSlidesGridViewportFitObserver,
    initSlidesChipZoomFromStorage,
    setupSlidesChipZoomButtons,
    applySlidesPorLinha,
    initSlidesPorLinhaFromStorage,
    setupSlidesPorLinhaButtons,
    atualizarBotoesSlidesPorLinha,
    getSlidesPorLinha: () => slidesPorLinha,
    getSlidesChipZoomLevel: () => slidesChipZoomLevel,
  };
}
