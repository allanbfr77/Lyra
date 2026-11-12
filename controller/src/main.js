'use strict';

require('./lib/loadEnv').loadLocalEnv();

const { app, BrowserWindow, dialog, ipcMain, screen, session, shell, systemPreferences } = require('electron');
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
const {
  abrirBancoPrincipal,
  prepararBibliasSqlite,
  abrirBibliaTraducao,
  abrirCatalogoOffline,
  criarEstruturaBanco,
  BIBLIA_TRADUCOES_SUPORTADAS,
} = require('./db');
const { criarSplash } = require('./splash/splashWindow');
const { criarOrquestrador, BootInterrompido } = require('./splash/bootProgress');
const { iniciarServidorController } = require('./httpControllerServer');
const historicoWindow = require('./historicoWindow');
const mainWindow = require('./mainWindow');
const credencialInternaPainel = require('./credencialInternaPainel');
const { createUpdaterApi } = require('./updater');
const { createServerCompanionUpdateApi } = require('./serverCompanionUpdate');
const { caminhoIconeDock } = require('./lib/iconPath');
const { criarProjecaoLocal } = require('./projecaoLocal');
const { criarDiagnosticoJanelas } = require('@lyra/projection-core');
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
  /* Splash: mostrada antes de qualquer trabalho do boot. Se não carregar em 3 s vem null e o
     boot segue sem ela — a splash nunca é o motivo de o Lyra não abrir. */
  ctx.splash = await criarSplash({
    app,
    BrowserWindow,
    ipcMain,
    ctx,
    log: (msg) => console.warn(msg),
  });
  const boot = criarOrquestrador({
    splash: ctx.splash,
    log: (msg) => console.warn(msg),
  });
  try {
    await executarBoot(boot);
  } catch (e) {
    /* Erro crítico já mostrado na splash (com «Reiniciar o Lyra» / «Sair»): o boot para aqui. */
    if (e instanceof BootInterrompido) {
      console.error('[Lyra] boot interrompido:', e.causa);
      return;
    }
    throw e;
  }
});

async function executarBoot(boot) {
  let paths;
  let userData;

  /* Unidade 1 — permissões, credencial interna, caminhos do usuário e diário de telas. */
  await boot.unidade(1, { critica: true }, async ({ avisar }) => {
    if (process.platform === 'darwin' && app.dock?.setIcon) {
      app.dock.setIcon(caminhoIconeDock());
    }
    try {
      configurarPermissoesMicrofone();
    } catch (e) {
      avisar('Permissão de microfone indisponível', e?.message);
    }

    /*
     * Credencial interna do painel (E1.3 Fase B, arquitetura W). Gerada AQUI, só em memória, a cada
     * execução, e injetada nos cabeçalhos HTTP pelo processo principal — o renderer nunca a recebe.
     * Precisa existir antes dos servidores (os verificadores da 3001 e da 5510 local a conferem) e
     * antes das janelas (que são registradas ao nascer).
     */
    ctx.credencialInterna = credencialInternaPainel.iniciar({
      session: session.defaultSession,
      app,
      shell,
      log: (msg) => console.warn(msg),
      /* Ligação tardia: a projeção local só existe depois; sem ela (ou parada) a 5510 não recebe nada. */
      provarMotorLocal: () =>
        ctx.projecaoLocal && typeof ctx.projecaoLocal.provarPropriedade === 'function'
          ? ctx.projecaoLocal.provarPropriedade()
          : Promise.resolve(false),
    }).interna;
    userData = app.getPath('userData');
    paths = createUserPaths(userData);

    /*
     * Diário de bordo das telas, aberto ANTES de tudo o que possa mexer numa janela.
     *
     * Começa aqui, no `whenReady()`, e não quando a projeção liga — de propósito. O
     * intervalo entre estes dois instantes é exactamente o que ainda não sabemos medir: é
     * nele que M2 e M3 mostram a área de trabalho, porque no modo «projetar nesta máquina»
     * o motor só arranca depois de o painel carregar e pedir. Sem carimbo nos dois extremos
     * não há como dizer quanto tempo isso dura na máquina do operador — e é esse número que
     * decide se vale a pena mudar a ordem de arranque.
     */
    ctx.diagnosticoTelas = criarDiagnosticoJanelas({
      caminhoArquivo: paths.diagnosticoTelasPath,
      rotulo: `Controlador ${app.getVersion()}`,
    });
    ctx.diagnosticoTelas.registar('app-pronto', { plataforma: process.platform });
  });

  /* Unidade 2 — lista de monitores (secundária: sem ela o resto do arranque segue na mesma). */
  await boot.unidade(2, { critica: false }, async () => {
    const telas = screen.getAllDisplays();
    ctx.diagnosticoTelas.registar('monitores', {
      momento: 'app-pronto',
      total: telas.length,
      caixas: telas.map((d) => `${d.bounds.width}x${d.bounds.height}+${d.bounds.x}+${d.bounds.y}`),
    });
  });

  /* Unidade 3 — migração dos arquivos de dados do usuário (crítica: migração pela metade arrisca dados). */
  await boot.unidade(3, { critica: true }, async () => {
    migrateUserDataFiles(paths, userData);
  });

  /* Unidade 4 — banco principal. */
  await boot.unidade(4, { critica: true }, async () => {
    abrirBancoPrincipal(paths, Database);
  });

  /* Unidade 5 — Bíblias SQLite: única etapa com contagem real (n de 6). Falha por tradução não é fatal. */
  await boot.unidade(5, { critica: false }, async ({ progresso, avisar }) => {
    prepararBibliasSqlite();
    const total = BIBLIA_TRADUCOES_SUPORTADAS.length;
    for (let i = 0; i < total; i += 1) {
      const traducao = BIBLIA_TRADUCOES_SUPORTADAS[i];
      await progresso({ value: i, max: total, detail: `${i} de ${total} traduções` });
      if (abrirBibliaTraducao(paths, Database, traducao) === 'erro') {
        avisar(`Bíblia ${traducao} indisponível`, 'arquivo ilegível');
      }
    }
  });

  /* Unidade 6 — catálogo offline (o fallback já existe em db.js: sem ele o app segue). */
  await boot.unidade(6, { critica: false }, async ({ avisar }) => {
    const estado = abrirCatalogoOffline(paths, Database);
    if (estado === 'ausente') avisar('Catálogo offline ausente');
    else if (estado === 'erro') avisar('Catálogo offline ilegível');
  });

  /* Unidade 7 — tabelas e migrações. */
  await boot.unidade(7, { critica: true }, async () => {
    criarEstruturaBanco(paths);
  });

  /* Unidade 8 — servidor HTTP interno (3001). */
  await boot.unidade(8, { critica: true }, async () => {
    await iniciarServidorController(ctx, paths);
  });

  /* Unidade 9 — projeção local. Secundária: o fallback já existe e não muda, só passa a reportar. */
  await boot.unidade(9, { critica: false }, async ({ avisar }) => {
    /*
     * Motor de projeção embutido. Criar não é ligar: só arranca depois que o operador
     * escolhe «projetar nesta máquina», e é o `listen` na 5510 que decide se pode.
     */
    ctx.projecaoLocal = criarProjecaoLocal({
      paths,
      credencialInterna: ctx.credencialInterna,
      diagnostico: ctx.diagnosticoTelas,
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
      /* Entrega 2: diálogos nativos do operador para inscrever/aprovar dispositivos. */
      dialog: require('electron').dialog,
    });

    /*
     * Vestir M2 e M3 ANTES da UI do operador.
     *
     * Sem isto o painel nascia primeiro e só depois pedia a projeção local — e nesse
     * intervalo os monitores de saída mostravam o desktop. `ligar()` é idempotente: o
     * renderer volta a chamá-lo ao carregar e só aponta o transporte.
     */
    try {
      const r = await ctx.projecaoLocal.ligar();
      ctx.diagnosticoTelas.registar('projecao-arranque', {
        ok: !!r?.ok,
        erro: r?.erro || null,
      });
      if (!r?.ok) avisar('Projeção local não iniciou', r?.erro || undefined);
    } catch (e) {
      ctx.diagnosticoTelas.registar('projecao-arranque', {
        ok: false,
        erro: e?.message || String(e),
      });
      avisar('Projeção local não iniciou', e?.message || String(e));
    }
  });

  /* Unidade 10 — IPCs, janela principal (oculta) e menu. */
  await boot.unidade(10, { critica: true }, async () => {
    /* Antes de criar a janela principal: o menu já pode abrir o histórico, e um clique
       rápido não pode encontrar os handlers por registar. */
    historicoWindow.registarIpcHistorico(() => mainWindow.getJanelaPrincipal(ctx));

    mainWindow.registerMainWindowIpc(ctx, updaterApi, companionApi);
    mainWindow.criarJanela(ctx);
    ctx.diagnosticoTelas.registar('painel-criado');
    mainWindow.criarMenuAplicativo(ctx, updaterApi, companionApi);
  });

  /* Unidade 11 — carregamento da interface. É um evento (did-finish-load), não uma contagem:
     fica indeterminada até `revelar` (mainWindow.js) fechar a splash. */
  await boot.progresso(11);

  if (app.isPackaged) {
    updaterApi.configurarAtualizacaoAutomatica();
    companionApi.configurarVerificacaoCompanion();
  }
}

app.on('before-quit', () => {
  try {
    if (ctx.projecaoLocal?.estaActiva?.()) {
      void ctx.projecaoLocal.desligar();
    }
  } catch (_) {
    // intencional — o encerramento não pode falhar por causa das telas
  }
});

app.on('window-all-closed', () => {
  if (ctx.suprimirQuitWindowAllClosedRecarregar) return;
  app.quit();
});
