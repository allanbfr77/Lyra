'use strict';

const displayConfigLib = require('./displayConfig');

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
 * Config efetiva do modo Bíblia: overlay `displayConfigBiblia` sobre defaults neutros.
 * Nunca funde com `displayConfig` (Slides) — evita herdar fundo/imagem do outro modo.
 * @param {object} ctx
 */
function resolverConfigBibliaParaJanelas(ctx) {
  const def = displayConfigLib.DEFAULT_DISPLAY_CONFIG;
  const bib = ctx.displayConfigBiblia || {};
  const slide = ctx.displayConfig || def;

  const publico = sanitizarCamadaFundoBasico({
    ...def.publico,
    ...(bib.publico || {}),
  });
  const ministrante = sanitizarCamadaFundoBasico({
    ...def.ministrante,
    ...(bib.ministrante || {}),
  });

  return clonarCfg({
    posX: bib.publico?.posX ?? def.posX,
    posY: bib.publico?.posY ?? def.posY,
    publico,
    ministrante,
    clock: { ...(slide.clock || def.clock), ...(bib.clock || {}) },
  });
}

/**
 * Config efetiva do modo Slides: apenas `displayConfig` persistido.
 * @param {object} ctx
 */
function resolverConfigSlidesParaJanelas(ctx) {
  return sanitizarConfigSlidesParaJanelas(
    ctx.displayConfig || displayConfigLib.DEFAULT_DISPLAY_CONFIG
  );
}

/**
 * Config efetiva para as janelas conforme o tipo de projeção activo.
 * @param {object} ctx
 * @param {{ forcarModo?: 'slides'|'biblia' }} [opts]
 */
function resolverConfigParaJanelas(ctx, opts = {}) {
  const forcar = opts.forcarModo || inferirForcarModoJanelas(ctx);
  if (forcar === MODO_CFG_BIBLIA) {
    return resolverConfigBibliaParaJanelas(ctx);
  }
  return resolverConfigSlidesParaJanelas(ctx);
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
 * Modo visual activo para novas janelas / IPC inicial (Bíblia vs Slides).
 * @param {object} ctx
 * @returns {'slides'|'biblia'}
 */
function inferirForcarModoJanelas(ctx) {
  if (ctx.estadoAtual?.tipo === 'biblia') return MODO_CFG_BIBLIA;
  if (ctx.modoVisualProjecaoAtivo === MODO_CFG_BIBLIA && ctx.displayConfigBiblia) {
    return MODO_CFG_BIBLIA;
  }
  return MODO_CFG_SLIDES;
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

/**
 * Grava patch em `displayConfig` (slides) ou `displayConfigBiblia` (overlay).
 * @param {object} ctx
 * @param {object} patch
 * @param {'slides'|'biblia'} modo
 */
function aplicarPatchNoModo(ctx, patch, modo) {
  if (modo === MODO_CFG_BIBLIA) {
    const base = ctx.displayConfigBiblia || { publico: {}, ministrante: {}, clock: {} };
    const patchBiblia = clonarCfg(patch || {});
    ctx.displayConfigBiblia = {
      ...base,
      ...patchBiblia,
      publico:
        patchBiblia.publico !== undefined
          ? mesclarCamadaDisplay(base.publico, patchBiblia.publico)
          : { ...(base.publico || {}) },
      ministrante:
        patchBiblia.ministrante !== undefined
          ? mesclarCamadaDisplay(base.ministrante, patchBiblia.ministrante)
          : { ...(base.ministrante || {}) },
    };
    return;
  }
  const patchSlides = sanitizarPatchSlides(patch);
  const baseAtual =
    ctx.displayConfig || displayConfigLib.mergeDisplayConfigLayers(displayConfigLib.DEFAULT_DISPLAY_CONFIG, {});
  ctx.displayConfig = displayConfigLib.mergeDisplayConfigLayers(baseAtual, patchSlides);
  const pb = ctx.displayConfig.publico || {};
  const mn = ctx.displayConfig.ministrante || {};
  if (pb.bgType !== 'image') ctx.displayConfig.publico = { ...pb, bgImage: '' };
  if (mn.bgType !== 'image') ctx.displayConfig.ministrante = { ...mn, bgImage: '' };
}

/**
 * @param {object} ctx
 * @param {{ forcarModo?: 'slides'|'biblia', io?: object, windowControl?: object }} [opts]
 */
function enviarDisplayConfigParaJanelas(ctx, opts = {}) {
  const cfg = resolverConfigParaJanelas(ctx, opts);
  (ctx.windowsDisplay || []).forEach((entry) => {
    const win = entry?.win;
    if (!win || win.isDestroyed()) return;
    try {
      win.webContents.send('display_config', cfg);
    } catch (_) {
  // intencional — erro ignorado
}
  });
  const wc = opts.windowControl ?? ctx.windowControl;
  if (wc && !wc.isDestroyed()) {
    try {
      wc.webContents.send('display_config', cfg);
    } catch (_) {
  // intencional — erro ignorado
}
  }
  /** Não emitir `display_config` no Socket.IO: o controlador não deve receber config mesclada das janelas. */
  return cfg;
}

/**
 * Preview ou gravação vinda do controlador.
 * @param {object} ctx
 * @param {object} cfg
 * @param {{ persistirSlides?: boolean, displayConfigPath?: () => string }} [opts]
 */
function processarDisplayConfigDoControlador(ctx, cfg, opts = {}) {
  const { modoConfig, forcarModo, patch } = extrairPatchDisplayConfig(cfg);
  ctx.modoVisualProjecaoAtivo = forcarModo || modoConfig || MODO_CFG_SLIDES;
  aplicarPatchNoModo(ctx, patch, modoConfig);
  if (modoConfig === MODO_CFG_SLIDES && opts.persistirSlides && opts.displayConfigPath) {
    displayConfigLib.saveDisplayConfig(opts.displayConfigPath, ctx.displayConfig);
  }
  return enviarDisplayConfigParaJanelas(ctx, {
    forcarModo: forcarModo || modoConfig,
  });
}

module.exports = {
  MODO_CFG_SLIDES,
  MODO_CFG_BIBLIA,
  CHAVES_REF_BIBLIA,
  mesclarCamadaDisplay,
  extrairPatchDisplayConfig,
  aplicarPatchNoModo,
  sanitizarConfigSlidesParaJanelas,
  resolverConfigParaJanelas,
  resolverConfigSlidesParaJanelas,
  resolverConfigBibliaParaJanelas,
  inferirForcarModoJanelas,
  corBackgroundJanelaPublica,
  enviarDisplayConfigParaJanelas,
  processarDisplayConfigDoControlador,
};
