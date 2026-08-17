'use strict';

require('./lib/loadEnv').loadLocalEnv();

const { app, dialog, session, systemPreferences } = require('electron');
const Database = require('better-sqlite3');

/** Permite microfone no renderer (Web Speech API) — usa o dispositivo padrão do sistema (ex.: Boya V2). */
function configurarPermissoesMicrofone() {
  const ses = session.defaultSession;
  if (!ses) return;

  const permissaoAudio = (permission, details) => {
    if (permission === 'microphone' || permission === 'audioCapture') return true;
    if (permission === 'media') {
      const tipos = details?.mediaTypes;
      if (!tipos || !tipos.length || tipos.includes('audio')) return true;
    }
    return false;
  };

  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(permissaoAudio(permission, details));
  });

  ses.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    return permissaoAudio(permission, details);
  });

  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }
}

/**
 * Windows: com dois apps Electron (servidor + controlador), a oclusão nativa pode
 * marcar a janela como oculta e o conteúdo deixa de pintar (ecrã preto).
 * Em modo local as janelas de projeção são deste processo — DirectComposition /
 * decode acelerado deixam o vídeo preto no monitor físico (mesmo fix do Servidor).
 */
if (process.platform === 'win32') {
  try {
    app.commandLine.appendSwitch(
      'disable-features',
      'CalculateNativeWinOcclusion,DirectCompositionVideoOverlays'
    );
    app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    app.commandLine.appendSwitch('disable-direct-composition-video-overlays');
    app.commandLine.appendSwitch('disable-accelerated-video-decode');
  } catch (_) {
  // intencional — erro ignorado
}
}

const ctx = require('./controllerContext');
const { createUserPaths } = require('./lib/paths');
const { migrateUserDataFiles } = require('./lib/migrateUserData');
const { initControllerDatabase } = require('./db');
const { iniciarServidorController } = require('./httpControllerServer');
const mainWindow = require('./mainWindow');
const { createUpdaterApi } = require('./updater');
const { createServerCompanionUpdateApi } = require('./serverCompanionUpdate');
const { caminhoIconeDock } = require('./lib/iconPath');
const { criarProjecaoLocal } = require('./projecaoLocal');
const { buscarMusicaLocalParaProjecao } = require('./lib/musicaParaProjecao');

const updaterApi = createUpdaterApi(ctx, {
  app,
  dialog,
  getJanelaPrincipal: () => mainWindow.getJanelaPrincipal(ctx),
  setUpdateStatusTitle: (status) => mainWindow.setUpdateStatusTitle(ctx, status),
});

const companionApi = createServerCompanionUpdateApi(ctx, {
  app,
  dialog,
  getJanelaPrincipal: () => mainWindow.getJanelaPrincipal(ctx),
  setUpdateStatusTitle: (status) => mainWindow.setUpdateStatusTitle(ctx, status),
  desligarProjecaoLocalImpl: async () => {
    if (ctx.projecaoLocal?.estaActiva?.()) {
      await ctx.projecaoLocal.desligar();
    }
  },
  userDataPath: undefined, /* preenchido em whenReady */
  quitControllerImpl: () => {
    try {
      app.exit(0);
    } catch (_) {
      process.exit(0);
    }
  },
});

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock?.setIcon) {
    app.dock.setIcon(caminhoIconeDock());
  }
  configurarPermissoesMicrofone();
  const userData = app.getPath('userData');
  const paths = createUserPaths(userData);
  migrateUserDataFiles(paths, userData);
  initControllerDatabase(paths, Database);
  await iniciarServidorController(ctx, paths);

  /*
   * Motor de projeção embutido. Criar não é ligar: só arranca depois que o operador
   * escolhe «projetar nesta máquina», e é o `listen` na 5510 que decide se pode.
   */
  ctx.projecaoLocal = criarProjecaoLocal({
    paths,
    logError: (rotulo, erro) => console.error(`[projecao-local] ${rotulo}`, erro),
    buscarMusicaPorId: buscarMusicaLocalParaProjecao,
    /* O painel é o cliente que está no mesmo processo — recebe por IPC, não por socket. */
    aoEmitirParaPainel: (evento, dados) => {
      const win = mainWindow.getJanelaPrincipal(ctx);
      if (win && !win.isDestroyed()) {
        win.webContents.send('projecao-local-evento', { evento, dados });
      }
    },
    /* E é também quem toca o áudio, no lugar da janela de controle do Servidor. */
    obterJanelaPainel: () => mainWindow.getJanelaPrincipal(ctx),
  });

  mainWindow.registerMainWindowIpc(ctx, updaterApi, companionApi);
  mainWindow.criarJanela(ctx);
  mainWindow.criarMenuAplicativo(ctx, updaterApi, companionApi);
  if (app.isPackaged) {
    updaterApi.configurarAtualizacaoAutomatica();
    companionApi.configurarVerificacaoCompanion();
  }
});

app.on('window-all-closed', () => {
  if (ctx.suprimirQuitWindowAllClosedRecarregar) return;
  app.quit();
});
