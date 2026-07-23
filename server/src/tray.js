'use strict';

const serverPrefs = require('./lib/serverPrefs');
const { caminhoIconeApp } = require('./lib/iconPath');

/**
 * Bandeja do sistema e menu da aplicação (minimizar para bandeja).
 */
function createTrayApi(ctx, paths, deps) {
  const { app, Menu, Tray, nativeImage, showMainWindow } = deps;

  function getTrayIcon() {
    const icon = nativeImage.createFromPath(caminhoIconeApp());
    if (!icon.isEmpty()) return icon;
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    return nativeImage.createFromDataURL(dataUrl);
  }

  function destroyTray() {
    if (ctx.tray) {
      ctx.tray.destroy();
      ctx.tray = null;
    }
  }

  function buildTrayMenu() {
    return Menu.buildFromTemplate([
      { label: 'Mostrar janela', click: () => showMainWindow() },
      { type: 'separator' },
      {
        id: 'tray-opt-minimize-band',
        label: 'Minimizar para a bandeja',
        type: 'checkbox',
        checked: ctx.minimizeToTrayEnabled,
        click: (item) => setMinimizeToTray(item.checked),
      },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ]);
  }

  function buildAppMenu() {
    const template = [
      {
        label: 'Janela',
        submenu: [
          { label: 'Mostrar janela', click: () => showMainWindow() },
          { type: 'separator' },
          {
            id: 'app-opt-minimize-band',
            label: 'Minimizar para a bandeja',
            type: 'checkbox',
            checked: ctx.minimizeToTrayEnabled,
            click: (item) => setMinimizeToTray(item.checked),
          },
          { type: 'separator' },
          { role: 'quit', label: 'Sair' },
        ],
      },
    ];
    return Menu.buildFromTemplate(template);
  }

  function refreshMenusAndTray() {
    if (ctx.minimizeToTrayEnabled) {
      if (!ctx.tray) {
        ctx.tray = new Tray(getTrayIcon());
        ctx.tray.setToolTip('Lyra — Janela');
        ctx.tray.on('double-click', () => showMainWindow());
      }
      ctx.tray.setContextMenu(buildTrayMenu());
    } else {
      destroyTray();
    }
    Menu.setApplicationMenu(buildAppMenu());
  }

  function setMinimizeToTray(enabled) {
    ctx.minimizeToTrayEnabled = !!enabled;
    serverPrefs.saveServerPrefs(paths.serverPrefsPath, { minimizeToTray: ctx.minimizeToTrayEnabled });
    refreshMenusAndTray();
  }

  return { destroyTray, refreshMenusAndTray, setMinimizeToTray };
}

module.exports = { createTrayApi };
