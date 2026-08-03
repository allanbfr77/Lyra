'use strict';

const displayConfigLib = require('./displayConfig');

/**
 * Transformações PURAS de configuração de exibição (sem `ctx`, sem Electron).
 * Parte do Projection Core — ver docs/architecture/projection-core.md.
 * A camada dependente de estado/janelas vive em ../lib/displayConfigModo.js.
 */

const MODO_CFG_SLIDES = 'slides';
const MODO_CFG_BIBLIA = 'biblia';

/** Campos exclusivos do overlay Bíblia — não devem permanecer no telão em modo Slides. */
const CHAVES_REF_BIBLIA = ['refMostrar', 'refFontSize', 'refColor'];

function clonarCfg(cfg) {
  try {
    return JSON.parse(JSON.stringify(cfg));
  } catch (_) {
    return cfg;
  }
}

/**
 * Limpa apenas campos de fundo (imagem órfã) — preserva referência e tipografia da Bíblia.
 * @param {object} layer
 */
function sanitizarCamadaFundoBasico(layer) {
  if (!layer || typeof layer !== 'object') return layer;
  const out = { ...layer };
  if (out.bgType !== 'image') {
    out.bgImage = '';
    if (!out.bgType) out.bgType = 'solid';
  }
  return out;
}

/**
 * Garante que fundo de imagem da Bíblia não «grude» quando o modo activo é Slides.
 * Remove campos exclusivos do overlay Bíblia.
 * @param {object} layer
 */
function sanitizarCamadaFundoSlides(layer) {
  const out = sanitizarCamadaFundoBasico(layer);
  for (const k of CHAVES_REF_BIBLIA) delete out[k];
  return out;
}

/**
 * Config enviada às janelas em modo Slides: só `displayConfig`, fundo explícito.
 * @param {object} cfg
 */
function sanitizarConfigSlidesParaJanelas(cfg) {
  const base = clonarCfg(cfg || displayConfigLib.DEFAULT_DISPLAY_CONFIG);
  return {
    ...base,
    publico: sanitizarCamadaFundoSlides(base.publico || {}),
    ministrante: sanitizarCamadaFundoSlides(base.ministrante || {}),
  };
}

/**
 * Remove metadados de roteamento do payload antes do merge.
 * @param {object} cfg
 */
function extrairPatchDisplayConfig(cfg) {
  const o = cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? { ...cfg } : {};
  const modoConfig = o.modoConfig === MODO_CFG_BIBLIA ? MODO_CFG_BIBLIA : MODO_CFG_SLIDES;
  const forcarModo =
    o.forcarModo === MODO_CFG_BIBLIA
      ? MODO_CFG_BIBLIA
      : o.forcarModo === MODO_CFG_SLIDES
        ? MODO_CFG_SLIDES
        : null;
  delete o.modoConfig;
  delete o.forcarModo;
  delete o._modoConfig;
  return { modoConfig, forcarModo, patch: o };
}

/** Patch de Slides: nunca aceitar campos exclusivos da Bíblia no armazenamento de slides. */
function sanitizarPatchSlides(patch) {
  const p = clonarCfg(patch || {});
  for (const chave of ['publico', 'ministrante']) {
    const layer = p[chave];
    if (!layer || typeof layer !== 'object') continue;
    for (const k of CHAVES_REF_BIBLIA) delete layer[k];
    if (layer.bgType !== 'image') layer.bgImage = '';
  }
  return p;
}

/**
 * Cor sólida de fundo do telão para `backgroundColor` da BrowserWindow (evita flash na abertura).
 * @param {object} cfg
 */
function corBackgroundJanelaPublica(cfg) {
  const pb = (cfg && cfg.publico) || {};
  if (pb.bgType === 'image') return '#000000';
  if (pb.bgType === 'gradient') {
    const m = String(pb.bgGradient || '').match(/#[0-9a-fA-F]{3,8}/);
    return m ? m[0] : '#000000';
  }
  return pb.bgColor || '#000000';
}

/**
 * Mescla camada de display preservando bgImage quando o patch não traz imagem
 * (evita apagar fundo ao actualizar só tipografia/cores no modo Bíblia).
 * @param {object} [atual]
 * @param {object} [patch]
 */
function mesclarCamadaDisplay(atual, patch) {
  if (!patch || typeof patch !== 'object') return atual || {};
  const base = atual && typeof atual === 'object' ? { ...atual } : {};
  const camada = { ...patch };
  const bgType = camada.bgType != null ? camada.bgType : base.bgType || 'solid';
  const merged = { ...base, ...camada, bgType };
  merged.bgColor = camada.bgColor != null ? camada.bgColor : base.bgColor;
  merged.bgGradient = camada.bgGradient != null ? camada.bgGradient : base.bgGradient;
  if (bgType === 'image') {
    const imgPatch = camada.bgImage;
    const imgBase = base.bgImage;
    if (imgPatch != null && String(imgPatch).length > 0) {
      merged.bgImage = String(imgPatch);
    } else if (imgBase != null && String(imgBase).length > 0) {
      merged.bgImage = String(imgBase);
    } else {
      merged.bgImage = '';
    }
  } else {
    merged.bgImage = '';
  }
  return merged;
}

module.exports = {
  MODO_CFG_SLIDES,
  MODO_CFG_BIBLIA,
  CHAVES_REF_BIBLIA,
  clonarCfg,
  sanitizarCamadaFundoBasico,
  sanitizarCamadaFundoSlides,
  sanitizarConfigSlidesParaJanelas,
  extrairPatchDisplayConfig,
  sanitizarPatchSlides,
  corBackgroundJanelaPublica,
  mesclarCamadaDisplay,
};
