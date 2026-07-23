/**
 * Notas por slide do controlador (modo Slide): só no painel, localStorage, nunca na projeção.
 */

import { LS_NOTAS_SLIDE_CTRL, SVG_NOTA_LAPIS } from './chavesArmazenamentoLocal.js';

/** @type {Record<string, Record<string, string>>} */
let cacheNotas = null;

/** @type {{ obterMusicaId: () => number|null, obterVersaoLocalId: () => string|null, obterEstrofeAtiva: () => number, obterNumSlides: () => number, ehModoSlides: () => boolean } | null} */
let ctx = null;

function chaveArmazenamentoMusica(idMusica, versaoLocalId) {
  const id = Number(idMusica);
  if (!Number.isFinite(id)) return '';
  const v = versaoLocalId && String(versaoLocalId).trim() ? String(versaoLocalId).trim() : '';
  return `${id}|${v}`;
}

function carregarCacheNotas() {
  if (cacheNotas) return cacheNotas;
  try {
    const raw = localStorage.getItem(LS_NOTAS_SLIDE_CTRL);
    cacheNotas = raw ? JSON.parse(raw) : {};
    if (!cacheNotas || typeof cacheNotas !== 'object') cacheNotas = {};
  } catch (_) {
    cacheNotas = {};
  }
  return cacheNotas;
}

function persistirCacheNotas() {
  try {
    localStorage.setItem(LS_NOTAS_SLIDE_CTRL, JSON.stringify(cacheNotas || {}));
  } catch (_) {
  // intencional — erro ignorado
}
}

function obterMapaNotasMusica(chaveMusica) {
  if (!chaveMusica) return {};
  const all = carregarCacheNotas();
  const map = all[chaveMusica];
  return map && typeof map === 'object' ? map : {};
}

function normalizarNumeroSlide(val, maxSlides) {
  const n = Math.floor(Number(val));
  if (!Number.isFinite(n) || n < 1) return null;
  if (maxSlides > 0 && n > maxSlides) return null;
  return n;
}

function obterNotaTexto(chaveMusica, numeroSlide) {
  const map = obterMapaNotasMusica(chaveMusica);
  const t = map[String(numeroSlide)];
  return t != null ? String(t).trim() : '';
}

function definirNotaTexto(chaveMusica, numeroSlide, texto) {
  const all = carregarCacheNotas();
  const t = String(texto ?? '').trim();
  if (!t) {
    const map = { ...obterMapaNotasMusica(chaveMusica) };
    delete map[String(numeroSlide)];
    if (Object.keys(map).length) all[chaveMusica] = map;
    else delete all[chaveMusica];
  } else {
    all[chaveMusica] = { ...obterMapaNotasMusica(chaveMusica), [String(numeroSlide)]: t };
  }
  cacheNotas = all;
  persistirCacheNotas();
}

function fecharPopupNota() {
  const bd = document.getElementById('slide-nota-backdrop');
  if (!bd) return;
  bd.hidden = true;
  bd.setAttribute('aria-hidden', 'true');
}

function abrirPopupNota() {
  const bd = document.getElementById('slide-nota-backdrop');
  const inpNum = document.getElementById('slide-nota-num');
  const inpTxt = document.getElementById('slide-nota-texto');
  if (!bd || !inpNum || !inpTxt || !ctx) return;

  const id = ctx.obterMusicaId();
  const versao = ctx.obterVersaoLocalId();
  const nSlides = ctx.obterNumSlides();
  if (id == null || nSlides < 1) {
    return;
  }

  const chave = chaveArmazenamentoMusica(id, versao);
  const ativo = ctx.obterEstrofeAtiva();
  let numPadrao = 1;
  if (ativo >= 0 && ativo < nSlides) numPadrao = ativo + 1;

  inpNum.min = '1';
  inpNum.max = String(nSlides);
  inpNum.value = String(numPadrao);

  const existente = obterNotaTexto(chave, numPadrao);
  inpTxt.value = existente;

  const syncTextoParaNumero = () => {
    const num = normalizarNumeroSlide(inpNum.value, nSlides);
    if (!num) {
      inpTxt.value = '';
      return;
    }
    inpTxt.value = obterNotaTexto(chave, num);
  };
  inpNum.oninput = syncTextoParaNumero;
  inpNum.onchange = syncTextoParaNumero;

  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
  inpNum.focus();
  inpNum.select();
}

function salvarPopupNota() {
  if (!ctx) {
    fecharPopupNota();
    return;
  }
  const id = ctx.obterMusicaId();
  const versao = ctx.obterVersaoLocalId();
  const nSlides = ctx.obterNumSlides();
  const inpNum = document.getElementById('slide-nota-num');
  const inpTxt = document.getElementById('slide-nota-texto');
  if (id == null || !inpNum || !inpTxt || nSlides < 1) {
    fecharPopupNota();
    return;
  }

  const num = normalizarNumeroSlide(inpNum.value, nSlides);
  if (!num) {
    fecharPopupNota();
    return;
  }

  const chave = chaveArmazenamentoMusica(id, versao);
  definirNotaTexto(chave, num, inpTxt.value);
  fecharPopupNota();
  atualizarNotaSlideControladorUI();
}

/** Atualiza barra de nota (modo Slide): botão + texto do slide ativo. */
export function atualizarNotaSlideControladorUI() {
  const bar = document.getElementById('slide-nota-bar');
  const btn = document.getElementById('btn-slide-nota');
  const exib = document.getElementById('slide-nota-exibicao');
  if (!bar || !btn || !exib || !ctx) return;

  const emSlides = ctx.ehModoSlides();
  const id = ctx.obterMusicaId();
  const nSlides = ctx.obterNumSlides();
  const ativo = ctx.obterEstrofeAtiva();
  const temMusica = id != null && nSlides > 0;

  bar.hidden = !emSlides || !temMusica;
  if (!emSlides || !temMusica) {
    exib.hidden = true;
    exib.textContent = '';
    btn.disabled = true;
    return;
  }

  btn.disabled = false;
  if (!btn.querySelector('svg')) btn.innerHTML = SVG_NOTA_LAPIS;

  const idxValido = ativo >= 0 && ativo < nSlides;
  if (!idxValido) {
    exib.hidden = true;
    exib.textContent = '';
    return;
  }

  const chave = chaveArmazenamentoMusica(id, ctx.obterVersaoLocalId());
  const texto = obterNotaTexto(chave, ativo + 1);
  if (!texto) {
    exib.hidden = true;
    exib.textContent = '';
    return;
  }

  exib.hidden = false;
  exib.textContent = texto;
  exib.setAttribute('title', `Nota do slide ${ativo + 1}`);
}

/**
 * @param {{ obterMusicaId: () => number|null, obterVersaoLocalId: () => string|null, obterEstrofeAtiva: () => number, obterNumSlides: () => number, ehModoSlides: () => boolean }} opcoes
 */
export function configurarNotasSlideControlador(opcoes) {
  ctx = opcoes;
  carregarCacheNotas();

  const btn = document.getElementById('btn-slide-nota');
  const bd = document.getElementById('slide-nota-backdrop');
  const cancel = document.getElementById('slide-nota-cancel');
  const salvar = document.getElementById('slide-nota-salvar');

  btn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    abrirPopupNota();
  });

  cancel?.addEventListener('click', (ev) => {
    ev.preventDefault();
    fecharPopupNota();
  });

  salvar?.addEventListener('click', (ev) => {
    ev.preventDefault();
    salvarPopupNota();
  });

  /**
   * Só fecha ao clicar «no escuro»: pointerdown + pointerup no próprio backdrop.
   * Sem isto, arrastar seleção do textarea para fora termina no backdrop — o navegador
   * sintetiza click no backdrop e fecha o popup inadvertidamente.
   */
  let slideNotaBackdropPointerDown = false;
  bd?.addEventListener('pointerdown', (ev) => {
    slideNotaBackdropPointerDown = ev.target === bd;
  });
  bd?.addEventListener('pointerup', (ev) => {
    if (slideNotaBackdropPointerDown && ev.target === bd) fecharPopupNota();
    slideNotaBackdropPointerDown = false;
  });
  bd?.addEventListener('pointercancel', () => {
    slideNotaBackdropPointerDown = false;
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const el = document.getElementById('slide-nota-backdrop');
    if (el && !el.hidden) fecharPopupNota();
  });

  atualizarNotaSlideControladorUI();
}
