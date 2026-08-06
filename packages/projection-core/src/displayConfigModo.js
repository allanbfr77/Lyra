'use strict';

const displayConfigLib = require('./displayConfig');
const transforms = require('./displayConfigTransforms');

/**
 * Camada do modo de exibição dependente de estado (`ctx`) e Electron (envio às janelas).
 *
 * As transformações PURAS de config foram extraídas para ../core/displayConfigTransforms
 * (refatoração do Projection Core — ver docs/architecture/projection-core.md). Este módulo
 * reexporta essas funções puras para preservar a API pública histórica.
 */

const {
  MODO_CFG_SLIDES,
  MODO_CFG_BIBLIA,
  CHAVES_REF_BIBLIA,
  clonarCfg,
  sanitizarCamadaFundoBasico,
  sanitizarConfigSlidesParaJanelas,
  extrairPatchDisplayConfig,
  sanitizarPatchSlides,
  corBackgroundJanelaPublica,
  mesclarCamadaDisplay,
} = transforms;

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
  /* `commentColor` é exclusivo dos Slides (linhas `//`) — o overlay Bíblia não o configura.
     Herdar o default aqui reescrevia a cor escolhida pelo utilizador na janela ministrante
     assim que qualquer config de Bíblia era enviada, e o comentário voltava ao azul de
     fábrica até à próxima config de Slides. Mantém-se a cor da camada de Slides. */
  const corComentarioSlides = (slide.ministrante || {}).commentColor;
  if (corComentarioSlides != null) ministrante.commentColor = corComentarioSlides;

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
 * @param {{
 *   forcarModo?: 'slides'|'biblia', io?: object, windowControl?: object,
 *   janelas?: Array<{ win: object }>
 * }} [opts]
 *   `janelas` — registo de janelas de projeção, fornecido pelo motor (sub-passo 3b), que é
 *   o seu dono. Sem ele cai no `ctx.windowsDisplay` histórico.
 */
function enviarDisplayConfigParaJanelas(ctx, opts = {}) {
  const cfg = resolverConfigParaJanelas(ctx, opts);
  const janelas = opts.janelas ?? ctx.windowsDisplay;
  /* Loud de propósito: sem registo, o `forEach` correria sobre uma lista vazia e a config
     simplesmente não chegaria às telas — sem erro, sem log, sem sintoma até alguém reparar
     que a fonte parou de mudar. É a falha silenciosa que o sub-passo 3a existiu para evitar. */
  if (!Array.isArray(janelas)) {
    throw new TypeError(
      'enviarDisplayConfigParaJanelas: sem registo de janelas — passe `opts.janelas` ' +
        '(use windowsApi.aplicarDisplayConfigNasJanelas)'
    );
  }
  janelas.forEach((entry) => {
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
 *
 * A parte de ESTADO (patch + persistência) é feita aqui; a ENTREGA às janelas é delegada
 * a `opts.enviar`, que deve ser `windowsApi.aplicarDisplayConfigNasJanelas` — o motor é o
 * dono das janelas de projeção e o único que deve escrever nelas (sub-passo 3a).
 *
 * Sem `opts.enviar` cai no caminho histórico (alcançar `ctx.windowsDisplay` daqui), que
 * deixa de funcionar assim que o registo de janelas se tornar interno ao motor (3b).
 *
 * @param {object} ctx
 * @param {object} cfg
 * @param {{
 *   persistirSlides?: boolean,
 *   displayConfigPath?: () => string,
 *   enviar?: (opts: { forcarModo?: 'slides'|'biblia' }) => object
 * }} [opts]
 */
function processarDisplayConfigDoControlador(ctx, cfg, opts = {}) {
  const { modoConfig, forcarModo, patch } = extrairPatchDisplayConfig(cfg);
  ctx.modoVisualProjecaoAtivo = forcarModo || modoConfig || MODO_CFG_SLIDES;
  aplicarPatchNoModo(ctx, patch, modoConfig);
  if (modoConfig === MODO_CFG_SLIDES && opts.persistirSlides && opts.displayConfigPath) {
    displayConfigLib.saveDisplayConfig(opts.displayConfigPath, ctx.displayConfig);
  }
  const enviar = opts.enviar || ((o) => enviarDisplayConfigParaJanelas(ctx, o));
  return enviar({ forcarModo: forcarModo || modoConfig });
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
