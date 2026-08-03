'use strict';

const path = require('path');
const { caminhoIconeApp } = require('./lib/iconPath');

/**
 * Janela de controle do próprio Server (app-shell local) e seus utilitários.
 *
 * Separado do motor de projeção (`windows.js`) no sub-passo 0 da extração do Projection Core
 * — ver docs/architecture/windows-extraction-plan.md. NÃO é parte do Core: é UI do Server.
 * O motor apenas emitirá eventos; quem cria/mostra/recarrega esta janela é este módulo.
 *
 * @param {object} ctx  serverContext (usa `ctx.windowControl`, `ctx.minimizeToTrayEnabled`).
 * @param {{ logError: Function, BrowserWindow: object, app: object, WINDOW_TITLE: string }} deps
 */
function createControlWindowApi(ctx, deps) {
  const { logError, BrowserWindow, app, WINDOW_TITLE } = deps;

  function getJanelaControle() {
    return ctx.windowControl && !ctx.windowControl.isDestroyed() ? ctx.windowControl : null;
  }

  function criarJanelaControle() {
    ctx.windowControl = new BrowserWindow({
      width: 400,
      height: 550,
      resizable: false,
      title: WINDOW_TITLE,
      icon: caminhoIconeApp(),
      backgroundColor: '#111111',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });

    ctx.windowControl.loadFile(path.join(__dirname, '../public/control.html'));

    ctx.windowControl.on('page-title-updated', (event) => {
      event.preventDefault();
      ctx.windowControl?.setTitle(WINDOW_TITLE);
    });

    ctx.windowControl.webContents.on('did-finish-load', () => {
      ctx.windowControl?.setTitle(WINDOW_TITLE);
    });

    ctx.windowControl.on('minimize', (e) => {
      if (!ctx.minimizeToTrayEnabled) return;
      e.preventDefault();
      ctx.windowControl.setSkipTaskbar(true);
      ctx.windowControl.hide();
    });

    ctx.windowControl.on('show', () => {
      if (!ctx.windowControl || ctx.windowControl.isDestroyed()) return;
      ctx.windowControl.setSkipTaskbar(false);
    });

    ctx.windowControl.on('closed', () => app.quit());
  }

  function showMainWindow() {
    if (!ctx.windowControl || ctx.windowControl.isDestroyed()) return;
    ctx.windowControl.setSkipTaskbar(false);
    if (ctx.windowControl.isMinimized()) ctx.windowControl.restore();
    ctx.windowControl.show();
    ctx.windowControl.focus();
  }

  function recarregarJanelaControle() {
    const win = getJanelaControle();
    if (!win) return false;
    try {
      win.webContents.reloadIgnoringCache();
      return true;
    } catch (e) {
      logError('recarregar-janela-controle', e);
      return false;
    }
  }

  function openMainDevTools() {
    if (!ctx.windowControl || ctx.windowControl.isDestroyed()) return;
    showMainWindow();
    try { ctx.windowControl.webContents.openDevTools({ mode: 'detach' }); } catch (_) {
  // intencional — erro ignorado
}
  }

  return {
    getJanelaControle,
    criarJanelaControle,
    showMainWindow,
    recarregarJanelaControle,
    openMainDevTools,
  };
}

module.exports = { createControlWindowApi };
