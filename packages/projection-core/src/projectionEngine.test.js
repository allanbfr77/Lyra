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

/* ------------------------------------------------------------------ render() */

/** Tudo o que saiu para as janelas, achatado e comparável. */
function sends(engine) {
  return engine.janelasDeProjecao().flatMap((e) =>
    e.win.sends.map((s) => ({ role: e.role, index: e.index, canal: s.canal, payload: s.payload }))
  );
}

function limparSends(engine) {
  engine.janelasDeProjecao().forEach((e) => { e.win.sends.length = 0; });
}

test('render() é equivalente à sequência manual que substitui', () => {
  /* Esta é a afirmação central do sub-passo 5: a fachada não é um caminho novo, é o
     mesmo caminho com um nome. Se divergir, os 8 call sites migrados mudam de
     comportamento sem ninguém reparar. */
  const manual = montar();
  manual.engine.sincronizarJanelasRelogio();
  manual.engine.abrirTelasConfiguradas();
  limparSends(manual.engine);

  manual.engine.atualizarDisplays(manual.state.estadoAtual);
  manual.state.estadoMinistrante = manual.engine.snapshotMinistranteAtual();
  manual.engine.atualizarDisplayMinistrante(manual.state.estadoMinistrante);
  const publicoManual = manual.engine.estadoPublicoParaSocketsOuApi();

  const viaRender = montar();
  viaRender.engine.sincronizarJanelasRelogio();
  viaRender.engine.abrirTelasConfiguradas();
  limparSends(viaRender.engine);

  const saida = viaRender.engine.render({ estado: viaRender.state.estadoAtual });

  assert.deepStrictEqual(sends(viaRender.engine), sends(manual.engine), 'mesmos envios às janelas');
  assert.deepStrictEqual(saida.estadoPublico, publicoManual, 'mesmo estado público devolvido');
  assert.deepStrictEqual(saida.estadoMinistrante, manual.state.estadoMinistrante);
  assert.deepStrictEqual(viaRender.state.estadoMinistrante, manual.state.estadoMinistrante,
    'render escreve o ministrante na porta, como o bloco antigo fazia');
});

test('render() sem estado re-renderiza o que já está na porta', () => {
  const { state, engine } = montar();
  const antes = state.estadoAtual;
  const saida = engine.render();
  assert.strictEqual(state.estadoAtual, antes, 'não mexe no estado quando não recebe estado');
  assert.ok(saida.estadoPublico && typeof saida.estadoPublico === 'object');
});

test('render() com estado escreve na porta antes de renderizar', () => {
  const { state, engine } = montar();
  const novo = { tipo: 'biblia', titulo: 'João 3', linhas: ['Porque Deus amou'], telaLimpa: false };
  engine.render({ estado: novo });
  assert.strictEqual(state.estadoAtual, novo);
});

test('render() não emite nada — devolve, e o host propaga', () => {
  const { eventos, engine } = montar();
  engine.render({ estado: { tipo: 'musica', linhas: ['a'], telaLimpa: false } });
  assert.strictEqual(eventos.length, 0, 'render não é encerramento; nada de eventos ao host');
});

test('reforcarMinistrante repete o push do ministrante (workaround de timing)', async () => {
  const { engine } = montar();
  engine.sincronizarJanelasRelogio();
  engine.abrirTelasConfiguradas();

  limparSends(engine);
  engine.render({ estado: { tipo: 'musica', linhas: ['a'], telaLimpa: false } });
  const semReforco = sends(engine).filter((s) => s.canal === 'atualizar_ministrante').length;

  limparSends(engine);
  engine.render({ estado: { tipo: 'musica', linhas: ['a'], telaLimpa: false }, reforcarMinistrante: true });
  await new Promise((r) => setTimeout(r, 220));
  const comReforco = sends(engine).filter((s) => s.canal === 'atualizar_ministrante').length;

  assert.strictEqual(comReforco, semReforco * 3, 'push imediato + setImmediate + setTimeout(160)');
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

test('slide preto final: ministrante fica activo (tela preta) e não revela o relógio', () => {
  /* Regressão: sem letra no M3 o motor tratava como ocioso e escondia a janela de
     projeção, revelando o relógio enquanto o M2 ficava preto. */
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-slide-preto-'));
  const routingPath = path.join(dir, 'routing.json');
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(
    routingPath,
    JSON.stringify({
      version: 2,
      slides: { publicoIndex: 1, ministranteIndex: 0 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    })
  );
  fs.writeFileSync(settingsPath, JSON.stringify({ indices: [0, 1] }));

  const state = armazemDeProjecao();
  state.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  const engine = createProjectionEngine(
    {
      displayRoutingPath: () => routingPath,
      displaySettingsPath: () => settingsPath,
    },
    {
      logError: () => {},
      screen: { getAllDisplays: () => DISPLAYS, getPrimaryDisplay: () => DISPLAYS[0], on: () => {} },
      BrowserWindow: function (opts) { return janelaFalsa(opts); },
      state,
      onProjecaoEncerrada: () => {},
      haOperadorConectado: () => true,
      resolverPaginaProjecao: (nome) => `/core/paginas/${nome}`,
      caminhoIconeApp: () => '/core/icone.ico',
    }
  );

  engine.sincronizarJanelasRelogio();
  engine.abrirTelasConfiguradas();

  const estrofes = ['A', 'B', 'C'];
  limparSends(engine);
  engine.render({
    estado: {
      tipo: 'musica',
      titulo: '',
      linhas: [],
      linhasProximo: [],
      estrofeIndex: estrofes.length,
      totalEstrofes: estrofes.length + 1,
      telaLimpa: false,
      blackout: false,
      slidePretoFinal: true,
      estrofes,
    },
  });

  const snap = engine.snapshotMinistranteAtual();
  assert.strictEqual(snap.slidePretoFinal, true);
  assert.strictEqual(String(snap.atual || ''), '');
  assert.strictEqual(String(snap.proximo || ''), '');

  const ministrantes = engine.janelasDeProjecao().filter((e) => e.role === 'ministrante');
  assert.ok(ministrantes.length > 0, 'precisa de janela ministrante');
  ministrantes.forEach((e) => {
    assert.notStrictEqual(
      e.ocultoParaRelogio,
      true,
      'slide preto não pode esconder o ministrante para revelar o relógio'
    );
    assert.ok(e.win.isVisible(), 'janela ministrante permanece visível (tela preta)');
  });

  const enviosMin = sends(engine).filter((s) => s.canal === 'atualizar_ministrante');
  assert.ok(enviosMin.length > 0, 'ministrante recebeu actualização');
  const ultimo = enviosMin[enviosMin.length - 1].payload;
  assert.strictEqual(ultimo.slidePretoFinal, true);
  assert.strictEqual(ultimo.projecaoAtiva, true);
  assert.strictEqual(String(ultimo.atual || ''), '');
  assert.strictEqual(String(ultimo.proximo || ''), '');
});
