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
const { ligarTratadorMudancaDisplays } = projectionCore.displayChangePolicy;
const { createWindowsApi } = require('./windows');
const { createTrayApi } = require('./tray');
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

/* O Servidor é um componente neutro: sem versão de produto no título nem na UI. */
const WINDOW_TITLE = 'Lyra — Servidor';

const windowsApi = createWindowsApi(ctx, paths, {
  logError,
  screen,
  BrowserWindow,
  app,
  WINDOW_TITLE,
  /* Tradução evento-do-motor → transporte. É o Server que conhece Socket.io, não o motor.
     Lazy de propósito: `ctx.io` só existe depois de `iniciarServidor`. */
  onProjecaoEncerrada: ({ estadoPublico, estadoBibliaObs }) => {
    if (!ctx.io) return;
    ctx.io.emit('estado', estadoPublico);
    /* ESC na Bíblia (ou Contagem por cima dela) tem de actualizar o Browser Source
       `/obs/biblia` — esse overlay só ouve `estado_biblia_obs`, não `estado`. */
    if (estadoBibliaObs) ctx.io.emit('estado_biblia_obs', estadoBibliaObs);
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
 *
 * `display-metrics-changed` com só `workArea` é ignorado: é o loop do projetor
 * (ver `displayChangePolicy`).
 */
function aoReorganizarJanelasPorDisplay(etapa) {
  try {
    windowsApi.garantirTelasAbertasParaProjecao();
  } catch (e) {
    logError(`display-change-garantir-telas-${etapa}`, e);
  }
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

/**
 * Encerra sem relaunch — o Controlador instala o companion e volta a abrir o Servidor.
 *
 * Importante: `app.exit()` não emite `before-quit`/`will-quit` e no Windows deixa
 * processos `--type=renderer` órfãos (`Lyra Servidor.exe`). O companion trata qualquer
 * processo com esse nome como bloqueio do NSIS. Por isso fechamos janelas e usamos
 * `app.quit()`; `app.exit` fica só como rede de segurança.
 */
function encerrarServidorParaAtualizacao() {
  setTimeout(() => {
    try {
      try {
        windowsApi.fecharTodasJanelasProjecao();
      } catch (_) {
        // intencional
      }
      try {
        const w = windowsApi.getJanelaControle();
        if (w && !w.isDestroyed()) w.destroy();
      } catch (_) {
        // intencional
      }
      try {
        trayApi.destroyTray();
      } catch (_) {
        // intencional
      }
      app.quit();
      setTimeout(() => {
        try {
          app.exit(0);
        } catch (_) {
          process.exit(0);
        }
      }, 2500);
    } catch (_) {
      try {
        app.exit(0);
      } catch (_) {
        process.exit(0);
      }
    }
  }, 100);
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
    encerrarParaAtualizacao: encerrarServidorParaAtualizacao,
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
  ligarTratadorMudancaDisplays(screen, {
    aoListaMonitores: broadcastMonitoresParaJanelaControle,
    aoReorganizarJanelas: aoReorganizarJanelasPorDisplay,
  });
  windowsApi.criarJanelaControle();
  trayApi.refreshMenusAndTray();
});

app.on('before-quit', () => {
  try { windowsApi.fecharTodasJanelasProjecao(); } catch (_) {
  // intencional — erro ignorado
}
  trayApi.destroyTray();
});

app.on('window-all-closed', () => app.quit());
