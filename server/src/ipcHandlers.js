'use strict';

const { autoUpdater } = require('electron-updater');
const displayConfigModo = require('./lib/displayConfigModo');
const { getPreferredLocalIPv4 } = require('./lib/localIp');
const { buildMonitorsList } = require('./lib/monitorsList');

/**
 * Registra handlers `ipcMain` usados pela janela de controle e utilitários.
 * @param {{ ipcMain: object, logError: Function, windowsApi: object, screen?: import('electron').Screen }} deps
 */
function registerIpcHandlers(ctx, paths, deps) {
  const { ipcMain, logError, windowsApi, screen } = deps;

  ipcMain.on('comando_display', (_, estado) => {
    const payload = { ...estado, blackout: estado.blackout === true };
    if (ctx.windowControl && !ctx.windowControl.isDestroyed()) {
      ctx.windowControl.webContents.send('estado_atualizado', payload);
    }
  });

  ipcMain.on('reload_control_window', () => {
    windowsApi.recarregarJanelaControle();
  });

  ipcMain.on('display_escape_encerrar', () => windowsApi.encerrarProjecaoPorEsc());

  ipcMain.on('audio_state_update', (_e, payload) => {
    if (!ctx.io) return;
    ctx.io.emit('audio_state', payload && typeof payload === 'object' ? payload : {});
  });

  ipcMain.handle('update-install-now', () => {
    if (!ctx.updateReady) return false;
    setImmediate(() => autoUpdater.quitAndInstall());
    return true;
  });

  ipcMain.handle('get_ip', () => getPreferredLocalIPv4());

  ipcMain.handle('get_monitores', () => {
    if (!screen) return [];
    try {
      return buildMonitorsList(screen);
    } catch (e) {
      logError('get_monitores-ipc', e);
      return [];
    }
  });

  ipcMain.handle('get_display_config', () => {
    const forcarModo = displayConfigModo.inferirForcarModoJanelas(ctx);
    return displayConfigModo.resolverConfigParaJanelas(ctx, { forcarModo });
  });

  ipcMain.handle('set_display_config', (_, cfg) => {
    try {
      if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
        return ctx.displayConfig;
      }
      const enviada = displayConfigModo.processarDisplayConfigDoControlador(ctx, cfg, {
        persistirSlides: true,
        displayConfigPath: paths.displayConfigPath,
        enviar: windowsApi.aplicarDisplayConfigNasJanelas,
      });
      try { windowsApi.sincronizarJanelasRelogio(); } catch (err) {
        logError('sincronizar-janelas-relogio', err);
      }
      return enviada;
    } catch (e) {
      logError('set_display_config', e);
      return ctx.displayConfig;
    }
  });
}

module.exports = { registerIpcHandlers };
