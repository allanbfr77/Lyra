'use strict';

/**
 * Mede o viewport DESTA janela de projeção — nunca o de outro monitor.
 *
 * `window.innerWidth` / `clientWidth` são do renderer desta BrowserWindow. O M2 e o M3
 * são processos/janelas separados: o 800×600 do projetor não entra no cálculo da TV.
 */

function zoomFactorDestaJanela() {
  try {
    const electron = require('electron');
    const zf = electron.webFrame && electron.webFrame.getZoomFactor;
    if (typeof zf === 'function') return Number(zf.call(electron.webFrame)) || 1;
  } catch (_) {
    // intencional — fora do Electron (preview web)
  }
  return 1;
}

/**
 * @param {{ elArea?: HTMLElement }} [opts]
 * @returns {object}
 */
function medirViewportJanela(opts = {}) {
  const elArea = opts.elArea || null;
  const vv = typeof window !== 'undefined' && window.visualViewport ? window.visualViewport : null;
  const innerWidth = Number(window.innerWidth) || 0;
  const innerHeight = Number(window.innerHeight) || 0;
  const visualWidth = vv && Number.isFinite(vv.width) ? vv.width : innerWidth;
  const visualHeight = vv && Number.isFinite(vv.height) ? vv.height : innerHeight;
  const areaWidth = elArea && elArea.clientWidth > 12 ? elArea.clientWidth : visualWidth;
  const areaHeight = elArea && elArea.clientHeight > 12 ? elArea.clientHeight : visualHeight;
  return {
    innerWidth,
    innerHeight,
    visualWidth,
    visualHeight,
    areaWidth,
    areaHeight,
    devicePixelRatio: Number(window.devicePixelRatio) || 1,
    zoomFactor: zoomFactorDestaJanela(),
    /* Só diagnóstico. O layout NÃO usa `window.screen` — em alguns setups o Chromium
       reporta o ecrã principal, não o desta janela. */
    screenWidth: window.screen ? window.screen.width : null,
    screenHeight: window.screen ? window.screen.height : null,
  };
}

/**
 * Envia o recorte desta janela ao processo principal (ficheiro de log) e à consola.
 * @param {string} papel `publico` | `ministrante` | `relogio`
 * @param {{ elArea?: HTMLElement }} [opts]
 */
function reportarViewportJanela(papel, opts = {}) {
  const info = {
    papel: String(papel || ''),
    ...medirViewportJanela(opts),
    em: new Date().toISOString(),
  };
  try {
    const { ipcRenderer } = require('electron');
    if (ipcRenderer && typeof ipcRenderer.send === 'function') {
      ipcRenderer.send('lyra-viewport-janela', info);
    }
  } catch (_) {
    // intencional
  }
  try {
    console.log('[Lyra viewport]', info);
  } catch (_) {
    // intencional
  }
  return info;
}

module.exports = {
  medirViewportJanela,
  reportarViewportJanela,
};
