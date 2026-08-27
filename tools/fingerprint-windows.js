'use strict';
/**
 * Fingerprint comportamental do windows.js — sub-passo 1 (porta de estado).
 *
 * Não é um teste de unidade: é um gravador. Instancia o createWindowsApi com um
 * Electron falso e um ctx controlado, exercita as funções de topo, e serializa
 * TUDO que saiu: sends por canal, mutações no ctx, janelas criadas, retornos.
 *
 * Rodar antes e depois da refatoração; os dois JSON têm de ser byte-a-byte iguais.
 *
 * uso: node fingerprint-windows.js <caminho-do-windows.js> > saida.json
 */

const path = require('path');

const alvoArg = process.argv[2] || path.join(__dirname, '..', 'server', 'src', 'windows.js');
/** Resolve relativo ao cwd (e não ao módulo), para `node tools/fingerprint-windows.js server/src/windows.js` funcionar. */
const alvo = path.resolve(process.cwd(), alvoArg);

const log = [];
function rec(evento, dados) {
  log.push({ evento, ...dados });
}

/** Serialização estável: ordena chaves para o diff não acusar ordem. */
function estavel(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(estavel);
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = estavel(v[k]);
  return out;
}

// ---------------------------------------------------------------- Electron falso

let seqWin = 0;

function criarFakeWindow(opts) {
  const id = ++seqWin;
  const win = {
    __id: id,
    __opts: estavel(opts),
    bounds: {
      x: opts?.x ?? 0,
      y: opts?.y ?? 0,
      width: opts?.width ?? 1920,
      height: opts?.height ?? 1080,
    },
    destroyed: false,
    fullscreen: !!opts?.fullscreen,
    visivel: false,
    handlers: {},
    webContents: {
      send: (canal, payload) => rec('send', { win: id, canal, payload: estavel(payload) }),
      openDevTools: (o) => rec('openDevTools', { win: id, opts: estavel(o) }),
      on: (ev) => rec('wc.on', { win: id, ev }),
      once: (ev) => rec('wc.once', { win: id, ev }),
      setBackgroundThrottling: (b) => rec('setBackgroundThrottling', { win: id, b }),
    },
    isDestroyed: () => win.destroyed,
    isVisible: () => win.visivel,
    isMinimized: () => false,
    on: (ev, cb) => { win.handlers[ev] = cb; rec('win.on', { win: id, ev }); },
    once: (ev, cb) => { win.handlers[ev] = cb; rec('win.once', { win: id, ev }); },
    show: () => { win.visivel = true; rec('show', { win: id }); },
    showInactive: () => { win.visivel = true; rec('showInactive', { win: id }); },
    hide: () => { win.visivel = false; rec('hide', { win: id }); },
    close: () => { win.destroyed = true; rec('close', { win: id }); },
    focus: () => rec('focus', { win: id }),
    restore: () => rec('restore', { win: id }),
    setTitle: (t) => rec('setTitle', { win: id, t }),
    setSkipTaskbar: (b) => rec('setSkipTaskbar', { win: id, b }),
    setBackgroundColor: (c) => rec('setBackgroundColor', { win: id, c }),
    /* `fullscreen` precisa de estado real: o motor faz `if (win.isFullScreen())` dentro de
       um try/catch, e um método em falta virava TypeError engolido em silêncio — o bloco
       inteiro nunca corria e o harness ficava cego a ele. */
    setFullScreen: (b) => { win.fullscreen = !!b; rec('setFullScreen', { win: id, b }); },
    isFullScreen: () => !!win.fullscreen,
    setSimpleFullScreen: (b) => rec('setSimpleFullScreen', { win: id, b }),
    setAlwaysOnTop: (...a) => rec('setAlwaysOnTop', { win: id, a: estavel(a) }),
    setVisibleOnAllWorkspaces: (...a) => rec('setVisibleOnAllWorkspaces', { win: id, a: estavel(a) }),
    moveTop: () => rec('moveTop', { win: id }),
    setBounds: (b) => {
      win.bounds = { ...win.bounds, ...b };
      rec('setBounds', { win: id, b: estavel(b) });
    },
    setMenuBarVisibility: (b) => rec('setMenuBarVisibility', { win: id, b }),
    setIgnoreMouseEvents: (...a) => rec('setIgnoreMouseEvents', { win: id, a: estavel(a) }),
    loadFile: (f) => rec('loadFile', { win: id, f: path.basename(String(f)) }),
    loadURL: (u) => rec('loadURL', { win: id, u: String(u) }),
    /* Bounds REAIS da janela falsa (vindos das opções de criação e de setBounds).
       Devolver um valor fixo aqui escondia o caminho de "já está no lugar certo"
       e tornava o harness cego a churn de fullscreen desnecessário. */
    getBounds: () => ({ ...win.bounds }),
  };
  rec('novaJanela', { win: id, opts: win.__opts });
  return win;
}

function FakeBrowserWindow(opts) { return criarFakeWindow(opts); }
FakeBrowserWindow.getAllWindows = () => [];

const DISPLAYS = [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 } },
  { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 } },
  { id: 3, bounds: { x: 3840, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 } },
];

const fakeScreen = {
  getAllDisplays: () => DISPLAYS,
  getPrimaryDisplay: () => DISPLAYS[0],
  on: () => {},
};

const fakeApp = {
  quit: () => rec('app.quit', {}),
  getVersion: () => '0.0.0-fingerprint',
  isReady: () => true,
  isPackaged: false,
  getAppPath: () => '/tmp/fingerprint-app',
  getPath: () => '/tmp/fingerprint-userdata',
  whenReady: () => Promise.resolve(),
};

// ---------------------------------------------------------------- ctx controlado

function novoCtx() {
  return {
    minimizeToTrayEnabled: false,
    tray: null,
    windowControl: null,
    updateReady: false,
    windowsDisplay: [],
    io: { emit: (ev, payload) => rec('io.emit', { ev, payload: estavel(payload) }) },
    acesso: null,
    controladorSocketId: 'socket-fingerprint',
    controladorSockets: new Map(),
    displayConfig: {
      posX: 0,
      posY: 0,
      publico: { bgType: 'color', bgColor: '#000000', bgImage: '', fontSize: 48, fontFamily: 'Inter' },
      ministrante: { bgType: 'color', bgColor: '#101010', bgImage: '', fontSize: 32, fontFamily: 'Inter' },
      clock: { showClock: true, monitorRelogio: 'ministrante' },
    },
    displayConfigBiblia: null,
    modoVisualProjecaoAtivo: null,
    estadoAtual: {
      tipo: 'musica',
      titulo: 'Hino de Teste',
      linhas: ['linha um', 'linha dois'],
      linhasProximo: ['linha tres'],
      proximoSlidePreto: false,
      estrofeIndex: 0,
      totalEstrofes: 3,
      telaLimpa: false,
      blackout: false,
      slidePretoFinal: false,
    },
    estadoMinistrante: { titulo: 'Hino de Teste', atual: 'linha um', proximo: 'linha tres', telaLimpa: false },
    projecaoLiveAtiva: false,
    estadoPublicoOverride: null,
    ministranteApresentacaoOverride: null,
  };
}

const CAMPOS_CTX_OBSERVADOS = [
  'estadoAtual', 'estadoMinistrante', 'estadoPublicoOverride', 'ministranteApresentacaoOverride',
  'projecaoLiveAtiva', 'displayConfig', 'displayConfigBiblia', 'modoVisualProjecaoAtivo',
  'windowsDisplay', 'windowControl',
];

/**
 * Snapshot do estado observável sem os handles de janela (guarda só role/index/id).
 *
 * O registo de janelas não está no `ctx` desde o sub-passo 3b — é privado ao motor. Lê-se
 * por `api.janelasDeProjecao()`. Deixar de o gravar aqui tornaria o harness cego a todo o
 * comportamento de abertura/fecho de janelas.
 */
function snapshotCtx(ctx) {
  const out = {};
  for (const c of CAMPOS_CTX_OBSERVADOS) {
    if (c === 'windowsDisplay') {
      const registo = typeof api !== 'undefined' && api.janelasDeProjecao ? api.janelasDeProjecao() : [];
      out[c] = registo.map((e) => ({
        role: e?.role, index: e?.index, win: e?.win?.__id ?? null, destruida: e?.win?.isDestroyed?.() ?? null,
      }));
    } else if (c === 'windowControl') {
      out[c] = ctx.windowControl ? ctx.windowControl.__id : null;
    } else {
      out[c] = estavel(ctx[c]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- roteiro

const paths = {
  displayRoutingPath: () => '/tmp/fingerprint-nao-existe-routing.json',
  displaySettingsPath: () => '/tmp/fingerprint-nao-existe-settings.json',
  displayConfigPath: () => '/tmp/fingerprint-nao-existe-config.json',
  errorLogPath: () => '/tmp/fingerprint-erros.log',
};

/* `lib/iconPath.js` faz require('electron') no topo — fora do Electron, `app` vem undefined
   e estoura em `app.isPackaged`. Stub do módulo antes de carregar o alvo. */
const Module = require('module');
const _load = Module._load;
Module._load = function (pedido, pai, isMain) {
  if (pedido === 'electron') {
    return { app: fakeApp, screen: fakeScreen, BrowserWindow: FakeBrowserWindow, ipcMain: { on: () => {}, handle: () => {} } };
  }
  return _load.apply(this, [pedido, pai, isMain]);
};

const ctx = novoCtx();
const { createWindowsApi } = require(alvo);

/* O harness faz o papel do host (main.js): traduz o evento do motor em io.emit e
   responde à pergunta "há operador ligado?". Antes do sub-passo 2 o próprio motor
   fazia as duas coisas lendo ctx.io/ctx.controladorSocketId — por isso o registo
   gravado tem de continuar idêntico. */
const depsHost = {
  onProjecaoEncerrada: ({ estadoPublico }) => {
    if (ctx.io) ctx.io.emit('estado', estadoPublico);
  },
  haOperadorConectado: () => !!ctx.controladorSocketId,
  /* O motor deixou de resolver as páginas do renderer por __dirname (sub-passo 4a); quem
     resolve é o host. Devolvemos um caminho (não só o nome) porque o registo de `loadFile`
     guarda o `basename` — assim o fingerprint continua a afirmar QUAL página foi carregada,
     que é o comportamento, sem depender de onde o motor mora. */
  resolverPaginaProjecao: (nome) => path.join('/fingerprint/public', nome),
  /* Sentinela de propósito: o caminho real do ícone é absoluto e específico da máquina —
     não devia estar num baseline comparável entre ambientes. */
  caminhoIconeApp: () => '<icone-app>',
};

const api = createWindowsApi(ctx, paths, {
  logError: (escopo, err) => rec('logError', { escopo, msg: String(err && err.message) }),
  screen: fakeScreen,
  BrowserWindow: FakeBrowserWindow,
  app: fakeApp,
  WINDOW_TITLE: 'Lyra — Fingerprint',
  ...depsHost,
});

rec('apiSurface', { chaves: Object.keys(api).sort(), tipos: Object.keys(api).sort().map((k) => typeof api[k]) });

function passo(nome, fn) {
  rec('--- passo ---', { nome });
  try {
    const r = fn();
    if (r !== undefined) rec('retorno', { nome, valor: estavel(r) });
  } catch (e) {
    rec('excecao', { nome, msg: String(e && e.message) });
  }
  rec('ctxApos', { nome, ctx: snapshotCtx(ctx) });
}

// 1. Leituras puras, ctx no estado inicial.
passo('estadoPublicoParaSocketsOuApi:inicial', () => api.estadoPublicoParaSocketsOuApi());
passo('snapshotMinistranteAtual:inicial', () => api.snapshotMinistranteAtual());

// 2. Render sem janelas abertas (exercita ajustarVisibilidade + windowControl nulo).
passo('atualizarDisplays:semJanelas', () => api.atualizarDisplays(ctx.estadoAtual));
passo('atualizarDisplayMinistrante:semJanelas', () => api.atualizarDisplayMinistrante(ctx.estadoMinistrante));

// 3. Janela de controle existe -> passa a receber estado_atualizado.
passo('criarJanelaControle', () => { api.criarJanelaControle(); });
passo('atualizarDisplays:comControle', () => api.atualizarDisplays(ctx.estadoAtual));

// 4. Abre as telas de projeção (caminho de sincronização de janelas).
passo('abrirTelasConfiguradas', () => api.abrirTelasConfiguradas());
passo('garantirTelasAbertasParaProjecao', () => api.garantirTelasAbertasParaProjecao());
passo('sincronizarJanelasRelogio', () => api.sincronizarJanelasRelogio());
/* Simula o arrasto de um slider no controlador: `preview_display_config` chama
   sincronizarJanelasRelogio a cada tick. Com as janelas já no monitor certo, estes
   ticks não devem produzir churn nativo (sair/entrar de fullscreen pisca a barra de
   tarefas do Windows). */
passo('sincronizarJanelasRelogio:tick2', () => api.sincronizarJanelasRelogio());
passo('sincronizarJanelasRelogio:tick3', () => api.sincronizarJanelasRelogio());

// 5. Modo Bíblia -> muda a config resolvida para as janelas (inferirForcarModoJanelas).
passo('trocarParaBiblia', () => {
  ctx.estadoAtual = { ...ctx.estadoAtual, tipo: 'biblia', titulo: 'João 3', linhas: ['Porque Deus amou'] };
  ctx.displayConfigBiblia = { publico: { bgType: 'color', bgColor: '#001020' }, ministrante: {}, clock: {} };
  ctx.modoVisualProjecaoAtivo = 'biblia';
});
passo('atualizarDisplays:biblia', () => api.atualizarDisplays(ctx.estadoAtual));
passo('atualizarDisplayMinistrante:biblia', () => api.atualizarDisplayMinistrante(ctx.estadoMinistrante));
passo('estadoPublicoParaSocketsOuApi:biblia', () => api.estadoPublicoParaSocketsOuApi());

// 6. Override de apresentação (balde B, campo mais referenciado).
passo('ligarOverrideApresentacao', () => {
  ctx.estadoPublicoOverride = { tipo: 'apresentacao', apresentacao: { src: '/tmp/slide.png' }, telaLimpa: false };
  ctx.ministranteApresentacaoOverride = { modo: 'apresentacao', apresentacao: { src: '/tmp/slide.png' }, telaLimpa: false };
});
passo('atualizarDisplays:override', () => api.atualizarDisplays(ctx.estadoAtual));
passo('atualizarDisplayMinistrante:override', () => api.atualizarDisplayMinistrante(ctx.estadoMinistrante));
passo('estadoPublicoParaSocketsOuApi:override', () => api.estadoPublicoParaSocketsOuApi());

// 7. Projeção live (curto-circuita hayProjecaoAtiva*).
passo('ligarProjecaoLive', () => { ctx.projecaoLiveAtiva = true; });
passo('atualizarDisplays:live', () => api.atualizarDisplays(ctx.estadoAtual));
passo('atualizarDisplayMinistrante:live', () => api.atualizarDisplayMinistrante(ctx.estadoMinistrante));
passo('desligarProjecaoLive', () => { ctx.projecaoLiveAtiva = false; });

// 8. Encerrar por Esc — o caminho que ESCREVE no ctx e emite no io.
//    Volta para 'musica' sem overrides: é a única combinação que cai em MODO_SLIDES
//    ESC encerra a camada activa (slides, bíblia ou apresentação/contagem).
passo('voltarParaSlidesPuro', () => {
  ctx.estadoAtual = { ...ctx.estadoAtual, tipo: 'musica', titulo: 'Hino de Teste', linhas: ['linha um'] };
  ctx.estadoPublicoOverride = null;
  ctx.ministranteApresentacaoOverride = null;
  ctx.modoVisualProjecaoAtivo = 'slides';
});
passo('encerrarProjecaoPorEsc:slides', () => api.encerrarProjecaoPorEsc('publico'));
passo('reporEstadoParaEsc', () => {
  ctx.estadoAtual = { ...ctx.estadoAtual, tipo: 'musica', titulo: 'Hino de Teste', linhas: ['linha um'], telaLimpa: false };
  ctx.estadoMinistrante = { titulo: 'Hino de Teste', atual: 'linha um', proximo: '', telaLimpa: false };
});
passo('encerrarProjecaoPorEsc:publico', () => api.encerrarProjecaoPorEsc('publico'));
passo('encerrarProjecaoPorEsc:ministrante', () => api.encerrarProjecaoPorEsc('ministrante'));
passo('encerrarProjecaoPorEsc:semCanal', () => api.encerrarProjecaoPorEsc());

// 9. DevTools por role (lê windowsDisplay).
passo('openDisplayDevTools', () => { api.openDisplayDevTools(); });
passo('openPublicDevTools', () => { api.openPublicDevTools(); });
passo('openMinistranteDevTools', () => { api.openMinistranteDevTools(); });

// 10. Pontes de payload.
passo('enviarComandoAudioParaControle', () => { api.enviarComandoAudioParaControle('audio_play', { id: 7 }); });
passo('enviarSyncVideoApresentacaoParaDisplays', () => { api.enviarSyncVideoApresentacaoParaDisplays({ t: 12.5 }); });

// 11. Fechar tudo.
passo('fecharTodasJanelasProjecao', () => { api.fecharTodasJanelasProjecao(); });
passo('atualizarDisplays:aposFechar', () => api.atualizarDisplays(ctx.estadoAtual));

// Timers assíncronos (sequência de abertura) podem ter agendado trabalho.
setTimeout(() => {
  rec('ctxFinal', { ctx: snapshotCtx(ctx) });
  process.stdout.write(JSON.stringify(log, null, 2) + '\n');
  process.exit(0);
}, 1200);
