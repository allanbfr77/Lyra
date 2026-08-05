/**
 * Processo principal Electron — **Lyra — Servidor**.
 * Orquestra janelas, bandeja, IPC, HTTP/Socket e persistência em `userData`.
 *
 * A lógica está modularizada em `server/src/lib/*`, `windows.js`, `httpServer.js`, etc.
 */
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog } = require('electron');

/** Windows: evita oclusão nativa que deixa janelas sem repaint (tela preta). */
if (process.platform === 'win32') {
  try {
    /* CalculateNativeWinOcclusion: repaint de janelas. DirectCompositionVideoOverlays:
       evita o overlay de vídeo da GPU que deixa o vídeo preto em monitor físico secundário. */
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,DirectCompositionVideoOverlays');
    app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    /* Desativa o caminho de overlay de vídeo por DirectComposition (causa raiz do vídeo
       preto em telão físico). Mantém a aceleração de hardware para decodificação. */
    app.commandLine.appendSwitch('disable-direct-composition-video-overlays');
    /* Fallback: decode em software — overlays HW ainda falham em alguns GPUs/monitores
       mesmo com DirectCompositionVideoOverlays desligado (janela fullscreen secundária). */
    app.commandLine.appendSwitch('disable-accelerated-video-decode');
  } catch (_) {
  // intencional — erro ignorado
}
}

const ctx = require('./serverContext');
const { createUserPaths } = require('./lib/paths');
const { migrateServerUserData } = require('./lib/migrateUserData');
const { createLogger } = require('./lib/logger');
const displayConfigLib = require('./lib/displayConfig');
const displayConfigModo = require('./lib/displayConfigModo');
const { buildMonitorsList } = require('./lib/monitorsList');
const serverPrefs = require('./lib/serverPrefs');
const projectionCore = require('@lyra/projection-core');
const { createWindowsApi } = require('./windows');
const { createTrayApi } = require('./tray');
const { createUpdaterApi } = require('./updater');
const path = require('path');
const { caminhoIconeDock, caminhoIconeApp } = require('./lib/iconPath');
const { iniciarServidor } = require('./httpServer');
const { registerIpcHandlers } = require('./ipcHandlers');

const paths = createUserPaths(app.getPath('userData'));
const logError = createLogger(paths.errorLogPath);

ctx.displayConfig = displayConfigModo.sanitizarConfigSlidesParaJanelas(
  displayConfigLib.loadDisplayConfig(paths.displayConfigPath)
);
ctx.minimizeToTrayEnabled = serverPrefs.loadServerPrefs(paths.serverPrefsPath).minimizeToTray;

const APP_VERSION = app.getVersion();
const WINDOW_TITLE = `Lyra — Servidor v${APP_VERSION}`;

const windowsApi = createWindowsApi(ctx, paths, {
  logError,
  screen,
  BrowserWindow,
  app,
  WINDOW_TITLE,
  /* Tradução evento-do-motor → transporte. É o Server que conhece Socket.io, não o motor.
     Lazy de propósito: `ctx.io` só existe depois de `iniciarServidor`. */
  onProjecaoEncerrada: ({ estadoPublico }) => {
    if (ctx.io) ctx.io.emit('estado', estadoPublico);
  },
  /* No Server, "operador ligado" = há um painel controlador com socket registrado. */
  haOperadorConectado: () => !!ctx.controladorSocketId,
  /* As páginas do renderer viajam com o Core desde que ele virou pacote — o Servidor já
     não é dono delas. Continua injectável para um host poder servir as suas. */
  resolverPaginaProjecao: projectionCore.paginaProjecao,
  caminhoIconeApp,
});

const trayApi = createTrayApi(ctx, paths, {
  app,
  Menu,
  Tray,
  nativeImage,
  showMainWindow: windowsApi.showMainWindow,
});

function setUpdateStatusTitle(status) {
  const w = windowsApi.getJanelaControle();
  if (!w) return;
  if (!status) {
    w.setTitle(WINDOW_TITLE);
    return;
  }
  w.setTitle(`${WINDOW_TITLE} — ${status}`);
}

const { configurarAtualizacaoAutomatica } = createUpdaterApi(ctx, {
  app,
  dialog,
  logError,
  getJanelaControle: windowsApi.getJanelaControle,
  setUpdateStatusTitle,
});

registerIpcHandlers(ctx, paths, { ipcMain, logError, windowsApi, screen });

function broadcastMonitoresParaJanelaControle() {
  const w = windowsApi.getJanelaControle();
  if (!w || w.isDestroyed()) return;
  try {
    w.webContents.send('monitores_updated', buildMonitorsList(screen));
  } catch (_) {
  // intencional — erro ignorado
}
}

/**
 * Segunda passagem, atrasada, a seguir a uma mudança de monitores.
 *
 * `display-removed` chega antes de o Windows acabar de arrumar as janelas que estavam no
 * monitor que saiu. Na primeira passagem elas ainda parecem estar no sítio certo; só a
 * seguir é que o SO as arrasta para o ecrã principal — o do operador — e mais nenhum
 * evento é emitido. Sem esta repetição, a janela ficava lá para sempre.
 *
 * A verificação é idempotente: com tudo no sítio não toca em janela nenhuma.
 */
const ATRASO_REVALIDAR_MONITORES_MS = 1200;

function aoMudarDisplaysDoSistema() {
  broadcastMonitoresParaJanelaControle();
  const garantir = (etapa) => {
    try {
      windowsApi.garantirTelasAbertasParaProjecao();
    } catch (e) {
      logError(`display-change-garantir-telas-${etapa}`, e);
    }
  };
  garantir('imediato');
  setTimeout(() => garantir('revalidacao'), ATRASO_REVALIDAR_MONITORES_MS);
}

function agendarReinicioServidorElectron() {
  setTimeout(() => {
    try {
      app.relaunch();
    } catch (_) {
  // intencional — erro ignorado
}
    app.exit(0);
  }, 180);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock?.setIcon) {
    app.dock.setIcon(caminhoIconeDock());
  }
  migrateServerUserData(app.getPath('userData'));
  ctx.minimizeToTrayEnabled = serverPrefs.loadServerPrefs(paths.serverPrefsPath).minimizeToTray;
  iniciarServidor(ctx, paths, {
    screen,
    logError,
    windowsApi,
    reiniciarApp: agendarReinicioServidorElectron,
    /* Sem a porta principal o Servidor não serve para nada — e continuar de pé a mostrar
       «ONLINE» seria pior do que fechar. Avisa em português e sai. */
    aoPerderPorta: ({ mensagem }) => {
      try {
        dialog.showErrorBox('Lyra — Servidor', mensagem);
      } catch (e) {
        logError('aviso-porta-ocupada', e);
      }
      app.quit();
    },
  });
  try {
    windowsApi.garantirTelasAbertasParaProjecao();
  } catch (e) {
    logError('startup-garantir-telas', e);
  }
  screen.on('display-added', aoMudarDisplaysDoSistema);
  screen.on('display-removed', aoMudarDisplaysDoSistema);
  /** Atualiza resoluções / escala mesmo sem cabo novo (ex.: “Estender só depois”). */
  screen.on('display-metrics-changed', aoMudarDisplaysDoSistema);
  windowsApi.criarJanelaControle();
  trayApi.refreshMenusAndTray();
  configurarAtualizacaoAutomatica();
});

app.on('before-quit', () => {
  try { windowsApi.fecharTodasJanelasProjecao(); } catch (_) {
  // intencional — erro ignorado
}
  trayApi.destroyTray();
});

app.on('window-all-closed', () => app.quit());
