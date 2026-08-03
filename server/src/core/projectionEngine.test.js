'use strict';

/**
 * O ponto do sub-passo 4b: o motor funciona **sem host nenhum**.
 *
 * Nenhum `ctx`, nenhum `serverContext`, nenhum Socket.io, nenhum `require('electron')` —
 * nem sequer o stub de módulo que `windowsHost.test.js` precisa de instalar (esse é para
 * a janela de controle do Server, que não é motor). Se algum destes testes passar a
 * precisar de um `ctx` ou de stubar `electron`, o Core voltou a acoplar-se ao Server.
 *
 * É este ficheiro que representa o modo local: o Controller vai instanciar o motor
 * exactamente assim, com um armazém próprio no lugar do `state`.
 */

const test = require('node:test');
const assert = require('node:assert');

const { createProjectionEngine } = require('./projectionEngine');

const DISPLAYS = [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 } },
  { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 } },
];

function janelaFalsa(opts = {}) {
  const win = {
    destruida: false,
    visivel: true,
    fullscreen: !!opts.fullscreen,
    bounds: { x: opts.x ?? 0, y: opts.y ?? 0, width: opts.width ?? 1920, height: opts.height ?? 1080 },
    sends: [],
    paginas: [],
    webContents: { send: (canal, payload) => win.sends.push({ canal, payload }), on: () => {}, once: () => {} },
    isDestroyed: () => win.destruida,
    isVisible: () => win.visivel,
    isFullScreen: () => win.fullscreen,
    getBounds: () => ({ ...win.bounds }),
    on: () => {}, once: () => {},
    close: () => { win.destruida = true; },
    setBackgroundColor: () => {}, setAlwaysOnTop: () => {}, moveTop: () => {},
    setFullScreen: (b) => { win.fullscreen = !!b; },
    setBounds: (b) => { win.bounds = { ...win.bounds, ...b }; },
    show: () => { win.visivel = true; }, hide: () => { win.visivel = false; },
    setVisibleOnAllWorkspaces: () => {}, setMenuBarVisibility: () => {},
    setSkipTaskbar: () => {}, setIgnoreMouseEvents: () => {},
    loadFile: (f) => win.paginas.push(f), loadURL: () => {},
  };
  return win;
}

/** Armazém simples — é o papel que o Controller vai desempenhar no modo local. */
function armazemDeProjecao() {
  return {
    windowControl: null,
    displayConfig: { publico: {}, ministrante: {}, clock: { showClock: true, monitorRelogio: 'ministrante' } },
    displayConfigBiblia: null,
    modoVisualProjecaoAtivo: null,
    estadoAtual: { tipo: 'musica', titulo: 'Hino', linhas: ['linha um'], telaLimpa: false },
    estadoMinistrante: { titulo: 'Hino', atual: 'linha um', proximo: '', telaLimpa: false },
    projecaoLiveAtiva: false,
    estadoPublicoOverride: null,
    ministranteApresentacaoOverride: null,
  };
}

function montar(over = {}) {
  const state = armazemDeProjecao();
  const eventos = [];
  const paths = {
    displayRoutingPath: () => '/tmp/lyra-core-test-routing.json',
    displaySettingsPath: () => '/tmp/lyra-core-test-settings.json',
  };
  const engine = createProjectionEngine(paths, {
    logError: () => {},
    screen: { getAllDisplays: () => DISPLAYS, getPrimaryDisplay: () => DISPLAYS[0], on: () => {} },
    BrowserWindow: function (opts) { return janelaFalsa(opts); },
    state,
    onProjecaoEncerrada: (ev) => eventos.push(ev),
    haOperadorConectado: () => true,
    resolverPaginaProjecao: (nome) => `/core/paginas/${nome}`,
    caminhoIconeApp: () => '/core/icone.ico',
    ...over,
  });
  return { state, eventos, engine };
}

test('instancia sem ctx, sem transporte e sem require de electron', () => {
  const { engine } = montar();
  assert.strictEqual(typeof engine.atualizarDisplays, 'function');
  assert.strictEqual(typeof engine.garantirTelasAbertasParaProjecao, 'function');
  assert.strictEqual(typeof engine.encerrarProjecaoPorEsc, 'function');
  // a API do motor não expõe nada da janela de controle do Server
  for (const k of ['criarJanelaControle', 'getJanelaControle', 'showMainWindow', 'openMainDevTools']) {
    assert.strictEqual(engine[k], undefined, `${k} é do Server, não do motor`);
  }
});

test('deps.state é obrigatório — sem armazém não há motor', () => {
  assert.throws(() => montar({ state: undefined }), /deps\.state/);
});

test('abre as janelas e carrega as páginas que o host resolveu', () => {
  const { engine } = montar();
  engine.sincronizarJanelasRelogio();

  const abertas = engine.janelasDeProjecao();
  assert.ok(abertas.length > 0, 'devia ter aberto pelo menos a janela de relógio');
  const paginas = abertas.flatMap((e) => e.win.paginas);
  assert.ok(
    paginas.every((p) => String(p).startsWith('/core/paginas/')),
    `motor devia usar só o resolvedor do host; carregou: ${paginas}`
  );
});

test('renderiza o estado do armazém nas janelas', () => {
  const { state, engine } = montar();
  engine.sincronizarJanelasRelogio();
  engine.atualizarDisplays(state.estadoAtual);
  // não lança e o registo continua coerente
  assert.ok(Array.isArray(engine.janelasDeProjecao()));
});

test('encerrar por Esc avisa o host em vez de falar com a rede', () => {
  const { state, eventos, engine } = montar();
  engine.encerrarProjecaoPorEsc('publico');
  assert.strictEqual(eventos.length, 1);
  assert.strictEqual(eventos[0].canal, 'publico');
  assert.strictEqual(state.estadoAtual.telaLimpa, true, 'o motor escreveu no armazém pela porta');
});

test('dois motores no mesmo processo não partilham estado', () => {
  /* O modo local pode acabar com um motor no Controller enquanto um Server corre noutro
     processo; e os testes acima já dependem de instâncias independentes. */
  const a = montar();
  const b = montar();
  a.engine.sincronizarJanelasRelogio();
  assert.ok(a.engine.janelasDeProjecao().length > 0);
  assert.strictEqual(b.engine.janelasDeProjecao().length, 0);
});
