'use strict';

const fs = require('fs');

/**
 * Configuração padrão de exibição (fallback se arquivo ausente ou inválido).
 */
const DEFAULT_DISPLAY_CONFIG = {
  posX: 'center',
  posY: 'center',
  publico: {
    bgType: 'solid',
    bgColor: '#000000',
    bgGradient: 'linear-gradient(135deg, #000000 0%, #161616 100%)',
    bgImage: '',
    fontFamily: 'CMG Sans, sans-serif',
    fontSize: 5.5,
    negrito: true,
    italico: false,
    maiusculo: true,
    textColor: '#ffffff',
    lineSpacing: 1.35,
    letterSpacing: 0,
    textAlign: 'center',
    wrapLongLines: false,
    autoFitLongLines: false,
  },
  ministrante: {
    bgType: 'solid',
    bgColor: '#000000',
    bgGradient: 'linear-gradient(135deg, #000000 0%, #161616 100%)',
    bgImage: '',
    textColorAtual: '#ffffff',
    textColorProximo: '#f3c15a',
    /** Cor das linhas `//` (comentário só no ministrante). Azul legado. */
    commentColor: '#00c8ff',
    /** Título da música no 1.º slide do M3 (`♪ Título | Tom`). */
    aberturaTituloColor: '#f3c15a',
    aberturaTituloFontSize: 7,
    fontSize: 4.1,
    fontSizeAtual: 4.1,
    fontSizeProximo: 4.1,
    lineSpacing: 1.35,
    wrapLongLines: true,
    autoFitLongLines: false,
  },
  clock: {
    format: 'HH:MM',
    fontSize: 13,
    dateFontSize: 2.4,
    verseFontSize: 2.4,
    showDate: true,
    showClock: true,
    /* Campo legado: o relógio vive só no M3. Mantém-se no JSON para não partir configs antigas. */
    monitorRelogio: 'ministrante',
    showVerse: false,
    verse: '',
    bgType: 'solid',
    bgColor: '#f5f2ea',
    bgGradient: 'linear-gradient(135deg, #1a1816 0%, #2c2420 100%)',
    bgImage: '',
    /** Cor do relógio (digital/analógico). Mantém `textColor` por compatibilidade. */
    textColor: '#1c1816',
    dateColor: '#1c1816',
    verseColor: '#1c1816',
  },
};

/**
 * Merge profundo de `publico`, `ministrante` e `clock`.
 * @param {object} base
 * @param {object} [overlay]
 */
function mergeDisplayConfigLayers(base, overlay) {
  const o = overlay && typeof overlay === 'object' && !Array.isArray(overlay) ? overlay : {};
  return {
    ...base,
    ...o,
    publico: { ...base.publico, ...(o.publico || {}) },
    ministrante: { ...base.ministrante, ...(o.ministrante || {}) },
    clock: {
      ...base.clock,
      ...(o.clock || {}),
      monitorRelogio: 'ministrante',
    },
  };
}

/**
 * @param {() => string} displayConfigPathFn
 */
function loadDisplayConfig(displayConfigPathFn) {
  try {
    const raw = fs.readFileSync(displayConfigPathFn(), 'utf8');
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      return mergeDisplayConfigLayers(DEFAULT_DISPLAY_CONFIG, {});
    }
    return mergeDisplayConfigLayers(DEFAULT_DISPLAY_CONFIG, d);
  } catch (_) {
  // intencional — erro ignorado
}
  return mergeDisplayConfigLayers(DEFAULT_DISPLAY_CONFIG, {});
}

/**
 * @param {() => string} displayConfigPathFn
 * @param {object} cfg
 */
function saveDisplayConfig(displayConfigPathFn, cfg) {
  try {
    fs.writeFileSync(displayConfigPathFn(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch (_) {
  // intencional — erro ignorado
}
}

module.exports = {
  DEFAULT_DISPLAY_CONFIG,
  mergeDisplayConfigLayers,
  loadDisplayConfig,
  saveDisplayConfig,
};
