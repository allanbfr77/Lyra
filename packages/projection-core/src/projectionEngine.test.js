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
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1.5 },
  { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1.5 },
];

/** Setup real de igreja: ecrã do operador (principal) + telão + retorno do ministrante. */
const DISPLAYS_TRES = [
  ...DISPLAYS,
  { id: 3, bounds: { x: 3840, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 }, scaleFactor: 1.25 },
];

function janelaFalsa(opts = {}) {
  const win = {
    destruida: false,
    visivel: true,
    fullscreen: !!opts.fullscreen,
    criadaFullscreen: !!opts.fullscreen,
    setFullScreenCalls: [],
    bounds: { x: opts.x ?? 0, y: opts.y ?? 0, width: opts.width ?? 1920, height: opts.height ?? 1080 },
    sends: [],
    paginas: [],
    opcoesCriacao: opts,
    webContents: {
      send: (canal, payload) => win.sends.push({ canal, payload }),
      on: () => {},
      once: () => {},
      executeJavaScript: () => Promise.resolve(true),
      ipc: { on: () => {} },
    },
    isDestroyed: () => win.destruida,
    isVisible: () => win.visivel,
    isFullScreen: () => win.fullscreen,
    getBounds: () => ({ ...win.bounds }),
    on: () => {}, once: () => {},
    close: () => { win.destruida = true; },
    setBackgroundColor: () => {}, setAlwaysOnTop: () => {}, moveTop: () => {},
    setFullScreen: (b) => { win.fullscreen = !!b; win.setFullScreenCalls.push(!!b); },
    setBounds: (b) => { win.bounds = { ...win.bounds, ...b }; },
    show: () => { win.visivel = true; win.focouAoMostrar = true; },
    /* O motor tem de usar SEMPRE esta: `show()` do Electron mostra e foca, e uma janela de
       projeção a tomar o foco tira o teclado ao painel do operador. `focouAoMostrar` fica
       aqui para o teste abaixo poder afirmar que o caminho focante nunca é tomado. */
    showInactive: () => { win.visivel = true; win.mostrouSemFoco = true; },
    hide: () => { win.visivel = false; },
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
  engine.abrirTelasConfiguradas();

  const abertas = engine.janelasDeProjecao();
  assert.ok(abertas.length > 0, 'devia ter aberto a janela permanente de saída');
  const paginas = abertas.flatMap((e) => e.win.paginas);
  assert.ok(
    paginas.filter(Boolean).every((p) => String(p).startsWith('/core/paginas/') || String(p).startsWith('data:')),
    `motor devia usar só o resolvedor do host; carregou: ${paginas}`
  );
});

test('renderiza o estado do armazém nas janelas', () => {
  const { state, engine } = montar();
  engine.abrirTelasConfiguradas();
  engine.atualizarDisplays(state.estadoAtual);
  // não lança e o registo continua coerente
  assert.ok(Array.isArray(engine.janelasDeProjecao()));
});

test('Esc na Bíblia encerra a camada e avisa o host', () => {
  const { state, eventos, engine } = montar();
  state.estadoAtual = {
    tipo: 'biblia',
    titulo: 'João 3:16',
    linhas: ['Porque Deus amou o mundo'],
    telaLimpa: false,
    blackout: false,
    slidePretoFinal: false,
  };

  engine.encerrarProjecaoPorEsc('publico');

  assert.strictEqual(eventos.length, 1);
  assert.strictEqual(eventos[0].modo, 'biblia');
  assert.ok(eventos[0].estadoBibliaObs);
  assert.strictEqual(eventos[0].estadoBibliaObs.tipo, null, 'OBS de Bíblia fica limpo');
  assert.strictEqual(state.estadoAtual.telaLimpa, true);
  assert.notEqual(state.estadoAtual.tipo, 'biblia');
});

test('Esc na Contagem (camada apresentação) encerra e avisa o host', () => {
  const { state, eventos, engine } = montar();
  state.estadoPublicoOverride = { tipo: 'contagem', contagem: { restanteMs: 60_000 } };
  state.contagem = { restanteMs: 60_000, rodando: true };

  engine.encerrarProjecaoPorEsc('publico');

  assert.strictEqual(eventos.length, 1);
  assert.strictEqual(eventos[0].modo, 'apresentacao');
  assert.equal(state.estadoPublicoOverride, null);
  assert.equal(state.contagem, null);
});

test('Esc em slides continua a avisar o host', () => {
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
  a.engine.abrirTelasConfiguradas();
  assert.ok(a.engine.janelasDeProjecao().length > 0);
  assert.strictEqual(b.engine.janelasDeProjecao().length, 0);
});

test('janela de projeção nunca toma o foco do teclado ao ser mostrada', () => {
  /*
   * Regressão do teclado do Modo Slides. `show()` do Electron mostra E foca; uma janela de
   * projeção a focar-se tira o foco do SO ao painel do operador, e o listener de setas vive
   * no `document` do painel — sem foco, nenhum `keydown` chega e só um clique devolve o
   * controlo. O motor tem de revelar as suas janelas por `showInactive()`, sempre.
   *
   * A janela falsa distingue os dois caminhos: `show()` marca `focouAoMostrar`,
   * `showInactive()` marca `mostrouSemFoco`. O teste exige as duas coisas — que o caminho
   * focante nunca corra, e que o outro tenha corrido de facto (senão passaria por vazio).
   */
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-foco-teclado-'));
  const routingPath = path.join(dir, 'routing.json');
  const settingsPath = path.join(dir, 'settings.json');
  const escreverRota = (publicoIndex, ministranteIndex) =>
    fs.writeFileSync(
      routingPath,
      JSON.stringify({
        version: 2,
        slides: { publicoIndex, ministranteIndex },
        apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
      })
    );
  escreverRota(1, 2);
  fs.writeFileSync(settingsPath, JSON.stringify({ indices: [1, 2] }));

  const engine = createProjectionEngine(
    {
      displayRoutingPath: () => routingPath,
      displaySettingsPath: () => settingsPath,
    },
    {
      logError: () => {},
      screen: {
        getAllDisplays: () => DISPLAYS_TRES,
        getPrimaryDisplay: () => DISPLAYS_TRES[0],
        on: () => {},
      },
      BrowserWindow: function (opts) { return janelaFalsa(opts); },
      state: armazemDeProjecao(),
      onProjecaoEncerrada: () => {},
      haOperadorConectado: () => true,
      resolverPaginaProjecao: (nome) => `/core/paginas/${nome}`,
      caminhoIconeApp: () => '/core/icone.ico',
    }
  );

  engine.abrirTelasConfiguradas();
  /* Telão desativado e reactivado: é o caminho que reexibe uma janela já existente —
     o mesmo do relógio de ocioso a devolver o conteúdo ao monitor. */
  escreverRota(-1, 2);
  engine.garantirTelasAbertasParaProjecao();
  escreverRota(1, 2);
  engine.garantirTelasAbertasParaProjecao();
  /* E a troca de monitor pelo seletor. */
  escreverRota(2, 1);
  engine.garantirTelasAbertasParaProjecao();

  const abertas = engine.janelasDeProjecao();
  assert.ok(abertas.length > 0, 'o cenário tem de abrir janelas');
  const focadas = abertas.filter((e) => e.win.focouAoMostrar).map((e) => e.role);
  assert.deepStrictEqual(
    focadas,
    [],
    `janela de projeção roubou o foco ao painel: ${focadas.join(', ')}`
  );
  assert.ok(
    abertas.some((e) => e.win.mostrouSemFoco),
    'nenhuma janela chegou a ser mostrada — o teste não provaria nada'
  );
});

/**
 * Janela falsa com ciclo de vida real: nasce oculta, emite eventos, e o
 * `executeJavaScript` resolve já — o motor só pode mostrar DEPOIS disto.
 */
function janelaFalsaRevelacao(opts = {}) {
  const ouvintesWin = new Map();
  const ouvintesWc = new Map();
  const adicionar = (mapa, ev, fn, once) => {
    if (!mapa.has(ev)) mapa.set(ev, []);
    mapa.get(ev).push({ fn, once });
  };
  const emitir = (mapa, ev, ...args) => {
    const lista = mapa.get(ev) || [];
    const ficar = [];
    for (const item of lista) {
      item.fn(...args);
      if (!item.once) ficar.push(item);
    }
    mapa.set(ev, ficar);
  };
  const win = {
    destruida: false,
    visivel: false,
    fullscreen: false,
    criadaFullscreen: false,
    setFullScreenCalls: [],
    setAlwaysOnTopCalls: [],
    jsExecs: [],
    bounds: { x: opts.x ?? 0, y: opts.y ?? 0, width: opts.width ?? 1920, height: opts.height ?? 1080 },
    sends: [],
    paginas: [],
    opcoesCriacao: opts,
    isDestroyed: () => win.destruida,
    isVisible: () => win.visivel,
    isFullScreen: () => win.fullscreen,
    getBounds: () => ({ ...win.bounds }),
    on: (ev, fn) => adicionar(ouvintesWin, ev, fn, false),
    once: (ev, fn) => adicionar(ouvintesWin, ev, fn, true),
    emit: (ev, ...args) => emitir(ouvintesWin, ev, ...args),
    close: () => { win.destruida = true; },
    setBackgroundColor: () => {},
    setAlwaysOnTop: (...args) => { win.setAlwaysOnTopCalls.push(args); },
    moveTop: () => {},
    setFullScreen: (b) => { win.fullscreen = !!b; win.setFullScreenCalls.push(!!b); },
    setBounds: (b) => { win.bounds = { ...win.bounds, ...b }; },
    show: () => { win.visivel = true; win.focouAoMostrar = true; win.emit('show'); },
    showInactive: () => { win.visivel = true; win.mostrouSemFoco = true; win.emit('show'); },
    hide: () => { win.visivel = false; },
    setVisibleOnAllWorkspaces: () => {},
    setMenuBarVisibility: () => {},
    setSkipTaskbar: () => {},
    setIgnoreMouseEvents: () => {},
    loadFile: (f) => win.paginas.push(f),
    loadURL: () => {},
  };
  win.webContents = {
    send: (canal, payload) => win.sends.push({ canal, payload }),
    on: (ev, fn) => adicionar(ouvintesWc, ev, fn, false),
    once: (ev, fn) => adicionar(ouvintesWc, ev, fn, true),
    emit: (ev, ...args) => emitir(ouvintesWc, ev, ...args),
    executeJavaScript: (js) => {
      win.jsExecs.push(js);
      return Promise.resolve(true);
    },
    ipc: { on: () => {} },
  };
  return win;
}

function montarComRevelacao(over = {}) {
  const criadas = [];
  const state = armazemDeProjecao();
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-revelar-'));
  const routingPath = path.join(dir, 'routing.json');
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(
    routingPath,
    JSON.stringify({
      version: 2,
      slides: { publicoIndex: 1, ministranteIndex: 2 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    })
  );
  fs.writeFileSync(settingsPath, JSON.stringify({ indices: [1, 2] }));
  const engine = createProjectionEngine(
    {
      displayRoutingPath: () => routingPath,
      displaySettingsPath: () => settingsPath,
    },
    {
      logError: () => {},
      screen: {
        getAllDisplays: () => DISPLAYS_TRES,
        getPrimaryDisplay: () => DISPLAYS_TRES[0],
        on: () => {},
      },
      BrowserWindow: function (opts) {
        const w = janelaFalsaRevelacao(opts);
        criadas.push(w);
        return w;
      },
      state,
      onProjecaoEncerrada: () => {},
      haOperadorConectado: () => true,
      resolverPaginaProjecao: (nome) => `/core/paginas/${nome}`,
      caminhoIconeApp: () => '/core/icone.ico',
      ...over,
    }
  );
  return { engine, criadas, state };
}

async function bombearRevelacao(win) {
  win.emit('ready-to-show');
  win.webContents.emit('did-finish-load');
  await Promise.resolve();
  await Promise.resolve();
}

test('M2 cobre o monitor no instante em que a HWND existe — sem esperar o HTML', async () => {
  const { engine, criadas } = montarComRevelacao();
  engine.abrirTelasConfiguradas();
  const telao = criadas.find((w) => w.paginas.some((p) => String(p).includes('display.html')));
  assert.ok(telao, 'o arranque tem de criar o telão');
  assert.strictEqual(telao.visivel, true, 'fundo nativo preto já tapa o desktop');
  assert.ok(telao.mostrouSemFoco, 'revela sem roubar o teclado');
  assert.ok(!telao.focouAoMostrar, 'não usa show() focante');
  assert.strictEqual(
    telao.opcoesCriacao.backgroundColor,
    '#000000',
    'a HWND já nasce com fundo preto'
  );
});

test('blur da primeira Bíblia não reemite setAlwaysOnTop (SetWindowPos no projetor)', async () => {
  const { engine, criadas } = montarComRevelacao();
  engine.abrirTelasConfiguradas();
  const telao = criadas.find((w) => w.paginas.some((p) => String(p).includes('display.html')));
  await bombearRevelacao(telao);
  assert.ok(telao.visivel, 'precisa de já estar revelada para o blur importar');

  const antes = telao.setAlwaysOnTopCalls.length;
  assert.ok(antes > 0, 'o arranque anota o nível uma vez');
  telao.emit('blur');
  assert.strictEqual(
    telao.setAlwaysOnTopCalls.length,
    antes,
    'blur sem forcar não pode ser SetWindowPos — era o clarão da 1.ª Bíblia'
  );
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
  /* Três ecrãs: o índice 0 é o principal (operador) e está fora de qualquer rota —
     telão e ministrante vivem nos monitores 1 e 2. */
  fs.writeFileSync(
    routingPath,
    JSON.stringify({
      version: 2,
      slides: { publicoIndex: 1, ministranteIndex: 2 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    })
  );
  fs.writeFileSync(settingsPath, JSON.stringify({ indices: [1, 2] }));

  const state = armazemDeProjecao();
  state.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  const engine = createProjectionEngine(
    {
      displayRoutingPath: () => routingPath,
      displaySettingsPath: () => settingsPath,
    },
    {
      logError: () => {},
      screen: {
        getAllDisplays: () => DISPLAYS_TRES,
        getPrimaryDisplay: () => DISPLAYS_TRES[0],
        on: () => {},
      },
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

test('contagem no alvo «ambos»: M3 fica activo e não revela o relógio', () => {
  /* Sem ramo `modo === 'contagem'` em hayProjecaoAtivaMinistrante, o override só traz
     `contagem` (sem atual/próximo) e o motor escondia o M3 — o relógio tapava os dígitos. */
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-contagem-ambos-'));
  const routingPath = path.join(dir, 'routing.json');
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(
    routingPath,
    JSON.stringify({
      version: 2,
      slides: { publicoIndex: 1, ministranteIndex: 2 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    })
  );
  fs.writeFileSync(settingsPath, JSON.stringify({ indices: [1, 2] }));

  const state = armazemDeProjecao();
  state.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  state.ministranteApresentacaoOverride = {
    modo: 'contagem',
    telaLimpa: false,
    contagem: { restanteMs: 60_000, excedenteMs: 0, rodando: true, cfg: {} },
  };
  const engine = createProjectionEngine(
    {
      displayRoutingPath: () => routingPath,
      displaySettingsPath: () => settingsPath,
    },
    {
      logError: () => {},
      screen: {
        getAllDisplays: () => DISPLAYS_TRES,
        getPrimaryDisplay: () => DISPLAYS_TRES[0],
        on: () => {},
      },
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
  limparSends(engine);
  engine.render({ estado: state.estadoAtual });

  const ministrantes = engine.janelasDeProjecao().filter((e) => e.role === 'ministrante');
  assert.ok(ministrantes.length > 0, 'precisa de janela ministrante');
  ministrantes.forEach((e) => {
    assert.notStrictEqual(
      e.ocultoParaRelogio,
      true,
      'contagem em «ambos» não pode esconder o M3 para revelar o relógio'
    );
    assert.ok(e.win.isVisible(), 'janela ministrante permanece visível com a contagem');
  });

  const enviosMin = sends(engine).filter((s) => s.canal === 'atualizar_ministrante');
  assert.ok(enviosMin.length > 0, 'ministrante recebeu actualização');
  const ultimo = enviosMin[enviosMin.length - 1].payload;
  assert.strictEqual(ultimo.modo, 'contagem');
  assert.ok(ultimo.contagem, 'payload leva a contagem ao M3');
});

test('pin de Contagem move a janela público sem trocar HTML (evita tela preta no M3)', () => {
  /* Público e ministrante carregam páginas diferentes. Trocar as BrowserWindow no
     registo fazia a Contagem «só no M3» pintar na página do operador → tela preta.
     O pin deve levar a janela `publico` (display.html) ao monitor da Contagem. */
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-contagem-move-'));
  const routingPath = path.join(dir, 'routing.json');
  const settingsPath = path.join(dir, 'settings.json');
  const routingBase = {
    version: 2,
    slides: { publicoIndex: 1, ministranteIndex: 2 },
    apresentacao: { publicoIndex: 1, ministranteIndex: -1 },
    contagem: { publicoIndex: -1, ministranteIndex: -1 },
  };
  fs.writeFileSync(routingPath, JSON.stringify(routingBase));
  fs.writeFileSync(settingsPath, JSON.stringify({ indices: [1, 2] }));

  let janelasCriadas = 0;
  const state = armazemDeProjecao();
  state.displayConfig.clock = { showClock: false, monitorRelogio: 'ministrante' };
  const engine = createProjectionEngine(
    {
      displayRoutingPath: () => routingPath,
      displaySettingsPath: () => settingsPath,
    },
    {
      logError: () => {},
      screen: {
        getAllDisplays: () => DISPLAYS_TRES,
        getPrimaryDisplay: () => DISPLAYS_TRES[0],
        on: () => {},
      },
      BrowserWindow: function (opts) {
        janelasCriadas += 1;
        return janelaFalsa(opts);
      },
      state,
      onProjecaoEncerrada: () => {},
      haOperadorConectado: () => true,
      resolverPaginaProjecao: (nome) => `/core/paginas/${nome}`,
      caminhoIconeApp: () => '/core/icone.ico',
    }
  );

  engine.abrirTelasConfiguradas();
  const antes = engine.janelasDeProjecao().filter(
    (e) => e.role === 'publico' || e.role === 'ministrante'
  );
  const winPub = antes.find((e) => e.role === 'publico')?.win;
  const winMin = antes.find((e) => e.role === 'ministrante')?.win;
  assert.ok(winPub && winMin, 'precisa de público e ministrante abertos');
  assert.strictEqual(antes.find((e) => e.role === 'publico').index, 1);
  assert.strictEqual(antes.find((e) => e.role === 'ministrante').index, 2);
  const criadasAntesDoPin = janelasCriadas;

  /* Contagem no M3 + Bíblia no M2: público vai ao M3, ministrante fica no M2. */
  fs.writeFileSync(
    routingPath,
    JSON.stringify({
      ...routingBase,
      contagem: { publicoIndex: 2, ministranteIndex: -1 },
    })
  );
  engine.garantirTelasAbertasParaProjecao();

  const depois = engine.janelasDeProjecao().filter(
    (e) => e.role === 'publico' || e.role === 'ministrante'
  );
  const pub = depois.find((e) => e.role === 'publico');
  const min = depois.find((e) => e.role === 'ministrante');
  assert.ok(pub && min, 'ambos os papéis continuam no registo');
  assert.strictEqual(pub.index, 2, 'Contagem fica no M3');
  assert.strictEqual(min.index, 1, 'Bíblia/slides ficam no M2 como ministrante');
  assert.strictEqual(
    pub.win,
    winPub,
    'a Contagem no M3 usa a janela público (display.html), não a do operador'
  );
  assert.strictEqual(min.win, winMin, 'a janela ministrante continua a ser a mesma');
  assert.ok(!winPub.destruida && !winMin.destruida, 'nenhuma janela de conteúdo foi destruída');
  assert.strictEqual(
    janelasCriadas,
    criadasAntesDoPin,
    'pin de Contagem não pode abrir BrowserWindow novas (flash do load HTML)'
  );
});

/**
 * Guarda do monitor do operador.
 *
 * O painel de controlo vive no monitor principal. Uma janela de projeção fullscreen e
 * always-on-top aberta lá deixa o operador sem interface a meio do culto — e sem forma
 * óbvia de a fechar, porque a janela está por cima de tudo.
 *
 * O controlador já filtra o principal dos seletores, mas os índices podem chegar ao motor
 * por outros caminhos: ficheiro de roteamento de uma sessão antiga, `displayIndices` de
 * recurso, ou o próprio Windows a renumerar os ecrãs entre arranques. Estes testes
 * fixam a guarda no motor, que é o último sítio antes de a janela existir.
 */
function montarComTresEcrans(routing, indices, opts = {}) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-guarda-principal-'));
  const routingPath = path.join(dir, 'routing.json');
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(routingPath, JSON.stringify(routing));
  fs.writeFileSync(settingsPath, JSON.stringify({ indices }));

  const state = armazemDeProjecao();
  state.displayConfig.clock = { showClock: false, monitorRelogio: 'ministrante' };
  const engine = createProjectionEngine(
    { displayRoutingPath: () => routingPath, displaySettingsPath: () => settingsPath },
    {
      logError: () => {},
      screen: {
        getAllDisplays: () => DISPLAYS_TRES,
        getPrimaryDisplay: () => DISPLAYS_TRES[0],
        on: () => {},
      },
      BrowserWindow: function (opts) { return janelaFalsa(opts); },
      state,
      onProjecaoEncerrada: () => {},
      haOperadorConectado: () => opts.operadorConectado !== false,
      resolverPaginaProjecao: (nome) => `/core/paginas/${nome}`,
      caminhoIconeApp: () => '/core/icone.ico',
    }
  );
  return engine;
}

/** Alguma janela de projeção ficou por cima do ecrã do operador? */
function cobreOEcraDoOperador(engine) {
  const principal = DISPLAYS_TRES[0].bounds;
  return engine.janelasDeProjecao().some((e) => {
    const b = e?.win?.getBounds?.();
    return !!b && b.x === principal.x && b.y === principal.y;
  });
}

test('janelas de projeção não aplicam zoomFactor = scaleFactor (escala já está nos DIP)', () => {
  const engine = montarComTresEcrans(
    {
      version: 2,
      slides: { publicoIndex: 1, ministranteIndex: 2 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    },
    [1, 2]
  );
  engine.abrirTelasConfiguradas();
  engine.sincronizarJanelasRelogio();
  const comZoom = engine.janelasDeProjecao().filter((e) => {
    const z = e.win?.opcoesCriacao?.webPreferences?.zoomFactor;
    return z != null && z !== 1;
  });
  assert.deepStrictEqual(
    comZoom.map((e) => ({ role: e.role, zoom: e.win.opcoesCriacao.webPreferences.zoomFactor })),
    [],
    'zoomFactor=scaleFactor duplicava o zoom em TVs/projetores com DPI ≠ 100%'
  );
});

test('roteamento antigo a apontar ao monitor principal não abre janela lá', () => {
  const engine = montarComTresEcrans(
    {
      version: 2,
      slides: { publicoIndex: 0, ministranteIndex: 2 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    },
    [1, 2]
  );
  engine.abrirTelasConfiguradas();
  assert.strictEqual(cobreOEcraDoOperador(engine), false, 'o painel do operador ficaria coberto');
});

test('índices de recurso fora de alcance não caem no monitor do operador', () => {
  /* `publicoIndex: 9` já não existe (a TV foi desligada); o motor vai ao fallback. Antes
     da guarda, o fallback podia devolver o índice 0 — o ecrã do operador. */
  const engine = montarComTresEcrans(
    {
      version: 2,
      slides: { publicoIndex: 9, ministranteIndex: -1 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    },
    [0, 2]
  );
  engine.abrirTelasConfiguradas();
  assert.strictEqual(cobreOEcraDoOperador(engine), false);
});

test('escudo preto também respeita o monitor do operador', () => {
  const engine = montarComTresEcrans(
    {
      version: 2,
      slides: { publicoIndex: 1, ministranteIndex: -1 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    },
    [0, 1, 2]
  );
  engine.abrirTelasConfiguradas();
  assert.strictEqual(
    cobreOEcraDoOperador(engine),
    false,
    'um rectângulo preto por cima do painel é tão mau como a letra do hino'
  );
});

test('com um único monitor não se abre janela nenhuma por cima do painel', () => {
  /* Portátil sem segundo ecrã. O motor já recusava abrir janelas secundárias neste caso
     (`podeAbrirJanelaSecundaria`); o que este teste fixa é que a guarda do principal não
     mudou esse contrato — nem para menos, nem para mais. O operador continua a ver o
     painel e a projeção acontece só nas pré-visualizações. */
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-um-ecra-'));
  const routingPath = path.join(dir, 'routing.json');
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(
    routingPath,
    JSON.stringify({
      version: 2,
      slides: { publicoIndex: 0, ministranteIndex: -1 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    })
  );
  fs.writeFileSync(settingsPath, JSON.stringify({ indices: [0] }));

  const umEcra = [DISPLAYS_TRES[0]];
  const engine = createProjectionEngine(
    { displayRoutingPath: () => routingPath, displaySettingsPath: () => settingsPath },
    {
      logError: () => {},
      screen: { getAllDisplays: () => umEcra, getPrimaryDisplay: () => umEcra[0], on: () => {} },
      BrowserWindow: function (opts) { return janelaFalsa(opts); },
      state: armazemDeProjecao(),
      onProjecaoEncerrada: () => {},
      haOperadorConectado: () => true,
      resolverPaginaProjecao: (nome) => `/core/paginas/${nome}`,
      caminhoIconeApp: () => '/core/icone.ico',
    }
  );
  engine.abrirTelasConfiguradas();
  assert.deepStrictEqual(
    engine.janelasDeProjecao(),
    [],
    'sem segundo ecrã não há onde projetar sem tapar o painel do operador'
  );
});

/**
 * Monitor desligado a meio do culto.
 *
 * O Windows não destrói as janelas que estavam no monitor que saiu — arrasta-as para
 * outro ecrã, quase sempre o principal. O motor, que só comparava o `index` registado no
 * momento em que criou a janela, dava a rota por cumprida e deixava a letra do hino
 * fullscreen e always-on-top por cima do painel do operador.
 */
test('janela arrastada para o ecrã do operador é trazida de volta', () => {
  const engine = montarComTresEcrans(
    {
      version: 2,
      slides: { publicoIndex: 1, ministranteIndex: 2 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    },
    [1, 2]
  );
  engine.abrirTelasConfiguradas();

  const publico = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.ok(publico, 'precisa da janela de público para o cenário');

  // O SO move a janela órfã para o principal — o motor não é notificado disto.
  publico.win.setBounds({ ...DISPLAYS_TRES[0].bounds });
  assert.strictEqual(cobreOEcraDoOperador(engine), true, 'pré-condição do teste');

  engine.garantirTelasAbertasParaProjecao();

  assert.strictEqual(
    cobreOEcraDoOperador(engine),
    false,
    'o painel do operador tem de voltar a estar à vista'
  );
  assert.deepStrictEqual(
    publico.win.getBounds(),
    DISPLAYS_TRES[1].bounds,
    'a janela devia ter voltado para o monitor que a rota indica'
  );
});

test('escudo preto arrastado para o ecrã do operador também é recolocado', () => {
  /* Sem operador ligado não se abre janela de ministrante, o que deixa o monitor 1 para
     o escudo — é assim que se isola o caso do escudo à deriva. */
  const engine = montarComTresEcrans(
    {
      version: 2,
      slides: { publicoIndex: 2, ministranteIndex: -1 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    },
    [1, 2],
    { operadorConectado: false }
  );
  engine.abrirTelasConfiguradas();

  const escudo = engine.janelasDeProjecao().find((e) => e.role === 'escudo');
  assert.ok(escudo, 'precisa do escudo preto para o cenário');

  escudo.win.setBounds({ ...DISPLAYS_TRES[0].bounds });
  engine.garantirTelasAbertasParaProjecao();

  assert.strictEqual(cobreOEcraDoOperador(engine), false);
});

test('sem deriva nenhuma o motor não mexe nas janelas', () => {
  /* A verificação de posição roda a cada `garantirTelasAbertasParaProjecao` — ou seja, a
     cada versículo em modo Bíblia. Se disparasse um resync sem motivo, o monitor piscava
     a cada avanço de slide. */
  const engine = montarComTresEcrans(
    {
      version: 2,
      slides: { publicoIndex: 1, ministranteIndex: 2 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    },
    [1, 2]
  );
  engine.abrirTelasConfiguradas();
  const publico = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  const antes = { ...publico.win.getBounds(), fullscreen: publico.win.isFullScreen() };

  engine.garantirTelasAbertasParaProjecao();
  engine.garantirTelasAbertasParaProjecao();

  assert.deepStrictEqual(
    { ...publico.win.getBounds(), fullscreen: publico.win.isFullScreen() },
    antes,
    'janela no sítio certo não devia ser tocada'
  );
});

test('janelas de projeção não usam fullscreen exclusivo', () => {
  /* O modelo do Holyrics: janela sem moldura do tamanho do monitor. `fullscreen: true`
     no Windows entra em DXGI exclusivo, o projetor perde o sinal e o PC fica a piscar. */
  const engine = montarComTresEcrans(
    {
      version: 2,
      slides: { publicoIndex: 1, ministranteIndex: 2 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    },
    [1, 2]
  );
  engine.abrirTelasConfiguradas();
  const abertas = engine.janelasDeProjecao();
  assert.ok(abertas.length > 0);
  for (const e of abertas) {
    assert.strictEqual(
      e.win.criadaFullscreen,
      false,
      `papel ${e.role} nasceu em fullscreen exclusivo`
    );
    assert.deepStrictEqual(
      e.win.setFullScreenCalls,
      [],
      `papel ${e.role} chamou setFullScreen: ${e.win.setFullScreenCalls}`
    );
  }
});

test('oscilação de 1 px nos bounds não reposiciona o telão', () => {
  /* DPI e getBounds em ecrã secundário oscilam 1 px. Sem folga o motor «corrigia»
     para sempre — o mesmo loop do projetor, por outro caminho. */
  const engine = montarComTresEcrans(
    {
      version: 2,
      slides: { publicoIndex: 1, ministranteIndex: 2 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    },
    [1, 2]
  );
  engine.abrirTelasConfiguradas();
  const publico = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  const alvo = DISPLAYS_TRES[1].bounds;
  publico.win.setBounds({ ...alvo, x: alvo.x + 1 });
  const antes = { ...publico.win.getBounds() };
  engine.garantirTelasAbertasParaProjecao();
  assert.deepStrictEqual(publico.win.getBounds(), antes);
});

/**
 * ── A rota diz ONDE desenhar, não SE existe o que desenhar ────────────────────
 *
 * Regressão do defeito relatado: «Live — OBS» sem monitor físico não chegava ao overlay.
 *
 * «Live — OBS» é, no ficheiro de roteamento, uma rota sem monitor nenhum — não há tela
 * para onde apontar, então `publicoIndex` e `ministranteIndex` ficam a -1. Era exactamente
 * esse o ramo em que `garantirTelasAbertasParaProjecao()` apagava `estadoAtual`,
 * `projecaoLiveAtiva` e os overrides. Como o overlay do OBS deriva de `estadoAtual`, o
 * versículo era destruído entre ser gravado e ser difundido.
 *
 * O sintoma tinha a forma de uma dependência de sequência: projetar primeiro num monitor
 * punha um índice válido na rota, o ramo deixava de correr, e só então o OBS via conteúdo.
 */
function montarSemMonitorRoteado() {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-sem-monitor-'));
  const routingPath = path.join(dir, 'routing.json');
  const settingsPath = path.join(dir, 'settings.json');
  /* Nenhum monitor roteado — é isto que «Live — OBS» grava. */
  fs.writeFileSync(routingPath, JSON.stringify({
    version: 2,
    slides: { publicoIndex: -1, ministranteIndex: -1 },
    apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
  }));
  fs.writeFileSync(settingsPath, JSON.stringify({ indices: [] }));

  const state = armazemDeProjecao();
  state.displayConfig.clock = { showClock: false, monitorRelogio: 'ministrante' };
  /* Um versículo acabado de projetar em «Live — OBS». */
  state.estadoAtual = {
    tipo: 'biblia', titulo: 'João 3:16', livro: 'João', capitulo: '3', versiculo: '16',
    linhas: ['Porque Deus amou o mundo'], telaLimpa: false, blackout: false, slidePretoFinal: false,
  };
  state.projecaoLiveAtiva = true;
  state.estadoPublicoOverride = null;

  const engine = createProjectionEngine(
    { displayRoutingPath: () => routingPath, displaySettingsPath: () => settingsPath },
    {
      logError: () => {},
      screen: { getAllDisplays: () => [DISPLAYS[0]], getPrimaryDisplay: () => DISPLAYS[0], on: () => {} },
      BrowserWindow: function (opts) { return janelaFalsa(opts); },
      state,
      onProjecaoEncerrada: () => {},
      haOperadorConectado: () => true,
      resolverPaginaProjecao: (nome) => `/core/paginas/${nome}`,
      caminhoIconeApp: () => '/core/icone.ico',
    }
  );
  return { state, engine };
}

test('REGRESSÃO: rota sem monitor não apaga o versículo em projeção', () => {
  const { state, engine } = montarSemMonitorRoteado();

  engine.garantirTelasAbertasParaProjecao();

  assert.strictEqual(state.estadoAtual.tipo, 'biblia', 'o conteúdo tem de sobreviver à camada de janelas');
  assert.strictEqual(state.estadoAtual.telaLimpa, false);
  assert.deepStrictEqual(state.estadoAtual.linhas, ['Porque Deus amou o mundo']);
  assert.strictEqual(state.projecaoLiveAtiva, true, '«Live — OBS» não pode ser desligado pela rota');
});

test('REGRESSÃO: o estado sobrevive a chamadas repetidas (versículo após versículo)', () => {
  const { state, engine } = montarSemMonitorRoteado();
  for (let i = 0; i < 5; i++) engine.garantirTelasAbertasParaProjecao();
  assert.strictEqual(state.estadoAtual.tipo, 'biblia');
  assert.strictEqual(state.projecaoLiveAtiva, true);
});

test('sem monitor roteado as janelas que sobram continuam a receber o payload ocioso', () => {
  /* A contraparte: preservar o estado não pode acender uma tela que devia estar preta. */
  const { state, engine } = montarSemMonitorRoteado();
  engine.sincronizarJanelasRelogio();
  const antes = engine.janelasDeProjecao().flatMap((e) => e.win.sends.length);
  engine.garantirTelasAbertasParaProjecao();

  const conteudoEnviado = engine
    .janelasDeProjecao()
    .flatMap((e) => e.win.sends)
    .filter((s) => s.canal === 'atualizar')
    .map((s) => s.payload);
  assert.ok(
    conteudoEnviado.every((p) => !p || p.telaLimpa === true || (Array.isArray(p.linhas) && p.linhas.length === 0)),
    `nenhuma janela devia receber o versículo; recebeu: ${JSON.stringify(conteudoEnviado)}`
  );
  assert.ok(Array.isArray(antes));
  assert.strictEqual(state.estadoAtual.tipo, 'biblia');
});

/*
 * ---------------------------------------------------------------------------------------
 * Relógio e projetor: as duas regressões do M2 (Público).
 * ---------------------------------------------------------------------------------------
 */

/** Motor com N ecrãs e um monitor principal que se pode trocar a meio (como o Windows faz). */
function montarComEcransMutaveis(routing, indices, displays, opts = {}) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-m2-'));
  const routingPath = path.join(dir, 'routing.json');
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(routingPath, JSON.stringify(routing));
  fs.writeFileSync(settingsPath, JSON.stringify({ indices }));

  const ecra = { principal: opts.principal ?? 0 };
  const state = armazemDeProjecao();
  if (opts.clock) state.displayConfig.clock = opts.clock;
  const engine = createProjectionEngine(
    { displayRoutingPath: () => routingPath, displaySettingsPath: () => settingsPath },
    {
      logError: () => {},
      screen: {
        getAllDisplays: () => displays,
        getPrimaryDisplay: () => displays[ecra.principal],
        on: () => {},
      },
      BrowserWindow: function (o) { return janelaFalsa(o); },
      state,
      onProjecaoEncerrada: () => {},
      haOperadorConectado: () => opts.operadorConectado !== false,
      resolverPaginaProjecao: (nome) => `/core/paginas/${nome}`,
      caminhoIconeApp: () => '/core/icone.ico',
    }
  );
  /** Reescreve o ficheiro de rota, como faz um PUT /api/display-routing. */
  const definirRota = (r) => fs.writeFileSync(routingPath, JSON.stringify(r));
  return { engine, ecra, state, definirRota };
}

const ROTA_PUBLICO_NO_1 = {
  version: 2,
  slides: { publicoIndex: 1, ministranteIndex: -1 },
  apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
  contagem: { publicoIndex: -1, ministranteIndex: -1 },
};

test('relógio do ministrante não nasce no monitor do público (dois ecrãs, projetor no M2)', () => {
  /*
   * A regressão do projetor. Com dois monitores, `loadDisplayIndices()` devolve [1, 2], o
   * índice 2 cai no filtro e sobra [1]; a linha antiga `ministranteIndex = fixos[1] ??
   * publicoIndex` colapsava o ministrante no monitor do público. Nascia uma janela de
   * relógio por baixo do telão, no projetor, que nunca chegava a ser revelada — o alvo é o
   * ministrante e `deveRevelarRelogioNoRole('publico')` é falso. Ficava só a cobrir o M2 e
   * a disputar z-order com o telão a cada `moveTop()` do reclaim.
   */
  const { engine } = montarComEcransMutaveis(ROTA_PUBLICO_NO_1, [1, 2], DISPLAYS, {
    clock: { showClock: true, monitorRelogio: 'ministrante' },
  });
  engine.garantirTelasAbertasParaProjecao();

  const relogios = engine.janelasDeProjecao().filter((e) => e.role === 'relogio');
  assert.deepEqual(
    relogios.map((e) => e.index),
    [],
    'sem ministrante roteado e com o público no M2, não há monitor para o relógio'
  );
  assert.ok(
    engine.janelasDeProjecao().some((e) => e.role === 'publico' && e.index === 1),
    'o telão continua a abrir no M2'
  );
});

test('com operador ligado, rota vazia ainda veste o M2 permanente', () => {
  const rotaVazia = {
    version: 2,
    slides: { publicoIndex: -1, ministranteIndex: -1 },
    apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    contagem: { publicoIndex: -1, ministranteIndex: -1 },
  };
  const { engine } = montarComEcransMutaveis(rotaVazia, [1, 2], DISPLAYS, {
    clock: { showClock: true, monitorRelogio: 'ministrante' },
  });
  engine.garantirTelasAbertasParaProjecao();

  const pub = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.ok(pub, 'M2 permanente nasce mesmo sem rota gravada');
  assert.strictEqual(pub.index, 1);
  assert.strictEqual(pub.win.visivel, true);
  assert.strictEqual(pub.win.destruida, false);
  assert.strictEqual(
    engine.janelasDeProjecao().filter((e) => e.role === 'relogio').length,
    0,
    'sem janela à parte de relógio — o ocioso do M2 é preto interno'
  );
});

test('M2 ocioso não ganha janela de relógio mesmo com alvo «publico»', () => {
  const { engine } = montarComEcransMutaveis(ROTA_PUBLICO_NO_1, [1, 2], DISPLAYS, {
    clock: { showClock: true, monitorRelogio: 'publico' },
  });
  engine.garantirTelasAbertasParaProjecao();

  assert.ok(
    engine.janelasDeProjecao().some((e) => e.role === 'publico' && e.index === 1 && e.win.visivel),
    'M2 permanente e visível'
  );
  assert.strictEqual(
    engine.janelasDeProjecao().filter((e) => e.role === 'relogio').length,
    0,
    'M2 ocioso é preto interno — hide() para revelar relógio revelaria o desktop'
  );
});

test('projetor promovido a monitor principal não desmonta as telas', () => {
  /*
   * Ao ligar um projetor, o Windows promove-o a principal por instantes enquanto
   * reconfigura o arranjo. `indiceProjecaoSeguro` devolve -1 para o principal — é a guarda
   * que impede projetar por cima do painel do operador —, e nesse intervalo a rota parecia
   * vazia. O motor fechava/apagava as telas e reabria-as no evento seguinte: o
   * abre-fecha-abre que se via no M2.
   */
  const { engine, ecra } = montarComEcransMutaveis(ROTA_PUBLICO_NO_1, [1, 2], DISPLAYS, {
    clock: { showClock: false, monitorRelogio: 'ministrante' },
  });
  engine.garantirTelasAbertasParaProjecao();
  const publicoAntes = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.ok(publicoAntes, 'o telão devia estar aberto no M2');
  const enviosAntes = publicoAntes.win.sends.length;

  /* O Windows troca o principal para o projetor a meio do handshake. */
  ecra.principal = 1;
  engine.garantirTelasAbertasParaProjecao();

  const publicoDepois = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.ok(publicoDepois, 'a janela do telão não pode ser desmontada por um estado transitório');
  assert.strictEqual(publicoDepois.win, publicoAntes.win, 'e tem de ser a MESMA janela');
  assert.strictEqual(publicoDepois.win.destruida, false);
  /* O sintoma visível era este: o telão apagava-se durante o transitório. */
  assert.deepEqual(
    publicoDepois.win.sends.slice(enviosAntes),
    [],
    'o telão não pode receber payload de apagar por causa de um principal transitório'
  );

  /* De volta ao normal, nada a recriar. */
  ecra.principal = 0;
  engine.garantirTelasAbertasParaProjecao();
  assert.strictEqual(
    engine.janelasDeProjecao().find((e) => e.role === 'publico').win,
    publicoAntes.win
  );
});

test('projetor promovido a principal sem operador ligado também não fecha as janelas', () => {
  /* Sem operador, o ramo antigo chamava `fecharTodasJanelasProjecao()`: o transitório
     destruía mesmo as janelas, e a seguir era preciso recriá-las e recarregar as páginas. */
  const { engine, ecra } = montarComEcransMutaveis(ROTA_PUBLICO_NO_1, [1, 2], DISPLAYS, {
    clock: { showClock: false, monitorRelogio: 'ministrante' },
    operadorConectado: false,
  });
  engine.garantirTelasAbertasParaProjecao();
  const publicoAntes = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.ok(publicoAntes, 'o telão devia estar aberto no M2');

  ecra.principal = 1;
  engine.garantirTelasAbertasParaProjecao();

  assert.strictEqual(publicoAntes.win.destruida, false, 'a janela não pode ser fechada');
  assert.ok(
    engine.janelasDeProjecao().some((e) => e.role === 'publico' && e.win === publicoAntes.win),
    'e continua registada'
  );
});

test('rota realmente desligada continua a apagar as telas', () => {
  /* A guarda transitória não pode engolir o caso legítimo: «Desativado» nos dois canais
     tem de continuar a limpar o que está no ar. */
  const rotaDesligada = {
    version: 2,
    slides: { publicoIndex: -1, ministranteIndex: -1 },
    apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    contagem: { publicoIndex: -1, ministranteIndex: -1 },
  };
  const { engine } = montarComEcransMutaveis(rotaDesligada, [], DISPLAYS, {
    clock: { showClock: false, monitorRelogio: 'ministrante' },
    operadorConectado: false,
  });
  engine.garantirTelasAbertasParaProjecao();
  assert.strictEqual(
    engine.janelasDeProjecao().filter((e) => e.role === 'publico').length,
    0,
    'sem monitor roteado e sem operador, não fica telão nenhum aberto'
  );
});

/*
 * ---------------------------------------------------------------------------------------
 * «Não exibir» (antes «Desativado»): instrução de conteúdo, não de hardware.
 * ---------------------------------------------------------------------------------------
 */

const rota = (pub, min) => ({
  version: 2,
  slides: { publicoIndex: pub, ministranteIndex: min },
  apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
  contagem: { publicoIndex: -1, ministranteIndex: -1 },
});

const SEM_RELOGIO = { showClock: false, monitorRelogio: 'ministrante' };

test('«Não exibir» mantém a janela viva, visível e no monitor — não a esconde nem a fecha', () => {
  const { engine, definirRota } = montarComEcransMutaveis(rota(1, 2), [1, 2], DISPLAYS_TRES, {
    clock: SEM_RELOGIO,
  });
  engine.garantirTelasAbertasParaProjecao();
  const antes = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.ok(antes, 'o telão devia estar aberto no M2');
  assert.strictEqual(antes.win.visivel, true);

  /* O operador põe o Público em «Não exibir» neste modo. */
  definirRota(rota(-1, 2));
  engine.garantirTelasAbertasParaProjecao();

  const depois = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.ok(depois, 'a janela não pode ser fechada');
  assert.strictEqual(depois.win, antes.win, 'nem recriada');
  assert.strictEqual(depois.win.destruida, false);
  assert.strictEqual(depois.win.visivel, true, 'nem escondida — é isso que faz o projetor piscar');
  assert.strictEqual(depois.index, 1, 'continua no monitor dela');

  const ultimo = depois.win.sends.filter((s) => s.canal === 'atualizar').pop();
  assert.ok(ultimo, 'devia ter recebido payload');
  assert.ok(
    !ultimo.payload || ultimo.payload.telaLimpa === true ||
      (Array.isArray(ultimo.payload.linhas) && ultimo.payload.linhas.length === 0),
    `a janela devia ficar preta, recebeu: ${JSON.stringify(ultimo.payload)}`
  );
});

test('«Não exibir» é estável: chamadas repetidas não recriam nem remexem na janela', () => {
  /* Se a rota parecesse por cumprir com a janela em «Não exibir», cada estrofe e cada
     evento de ecrã disparavam um resync completo — o churn que renegocia o projetor. */
  const { engine, definirRota } = montarComEcransMutaveis(rota(1, 2), [1, 2], DISPLAYS_TRES, {
    clock: SEM_RELOGIO,
  });
  engine.garantirTelasAbertasParaProjecao();
  definirRota(rota(-1, 2));
  engine.garantirTelasAbertasParaProjecao();

  const win = engine.janelasDeProjecao().find((e) => e.role === 'publico').win;
  const boundsAntes = win.setBounds.length;
  const paginasAntes = win.paginas.length;
  for (let i = 0; i < 5; i += 1) engine.garantirTelasAbertasParaProjecao();

  const agora = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.strictEqual(agora.win, win, 'a mesma janela nas cinco passagens');
  assert.strictEqual(agora.win.paginas.length, paginasAntes, 'nenhuma página recarregada');
  assert.strictEqual(agora.win.visivel, true);
  assert.ok(boundsAntes >= 0);
});

test('voltar a escolher um monitor devolve o conteúdo à janela que estava em «Não exibir»', () => {
  const { engine, definirRota, state } = montarComEcransMutaveis(rota(1, 2), [1, 2], DISPLAYS_TRES, {
    clock: SEM_RELOGIO,
  });
  engine.garantirTelasAbertasParaProjecao();
  definirRota(rota(-1, 2));
  engine.garantirTelasAbertasParaProjecao();
  const win = engine.janelasDeProjecao().find((e) => e.role === 'publico').win;
  const enviosAntes = win.sends.length;

  definirRota(rota(1, 2));
  state.estadoAtual = { tipo: 'musica', titulo: 'Hino', linhas: ['volta'], telaLimpa: false };
  engine.garantirTelasAbertasParaProjecao();

  const conteudo = win.sends
    .slice(enviosAntes)
    .filter((s) => s.canal === 'atualizar')
    .map((s) => s.payload)
    .filter((p) => Array.isArray(p?.linhas) && p.linhas.length > 0);
  assert.ok(conteudo.length > 0, 'a janela tem de voltar a receber conteúdo, não ficar presa a preto');
  assert.strictEqual(engine.janelasDeProjecao().find((e) => e.role === 'publico').win, win);
});

test('«Não exibir» nos dois canais não fecha janela nenhuma com o operador ligado', () => {
  const { engine, definirRota } = montarComEcransMutaveis(rota(1, 2), [1, 2], DISPLAYS_TRES, {
    clock: SEM_RELOGIO,
  });
  engine.garantirTelasAbertasParaProjecao();
  const vivasAntes = engine
    .janelasDeProjecao()
    .filter((e) => e.role === 'publico' || e.role === 'ministrante')
    .map((e) => e.win);
  assert.ok(vivasAntes.length >= 1);

  definirRota(rota(-1, -1));
  engine.garantirTelasAbertasParaProjecao();

  for (const win of vivasAntes) {
    assert.strictEqual(win.destruida, false, 'nenhuma janela de projeção pode ser fechada');
  }
});

/*
 * ---------------------------------------------------------------------------------------
 * Ministrante em «Não exibir»: prévia e monitor físico têm de dizer o mesmo.
 * ---------------------------------------------------------------------------------------
 */

/** Estado com conteúdo real no canal do ministrante (snapshot vem das estrofes). */
function comConteudoNoMinistrante(state) {
  state.estadoAtual = {
    tipo: 'musica',
    titulo: 'Hino',
    telaLimpa: false,
    estrofes: ['primeira estrofe', 'segunda estrofe'],
    estrofeIndex: 0,
  };
  state.estadoMinistrante = { titulo: 'Hino', atual: 'primeira estrofe', proximo: '', telaLimpa: false };
}

/** Último payload que a janela do ministrante recebeu. */
function ultimoPayloadMinistrante(engine) {
  const entrada = engine.janelasDeProjecao().find((e) => e.role === 'ministrante');
  if (!entrada) return null;
  const s = entrada.win.sends.filter((x) => x.canal === 'atualizar_ministrante').pop();
  return s ? s.payload : null;
}

test('Ministrante em «Não exibir»: a janela persistente fica preta, não só a prévia', () => {
  /*
   * A regressão relatada: no Modo Slides, pôr o Ministrante em «Não exibir» escondia o
   * conteúdo na prévia do painel — que olha para a rota — e o monitor físico continuava a
   * mostrar a estrofe. A causa é `resolverIndiceJanelaPersistenteMinistrante`: com a rota a
   * -1 ele devolve o monitor de RECURSO, para a janela não ter de nascer à vista mais
   * tarde. Só que esse índice >= 0 fazia o resto do motor tratar o canal como activo.
   *
   * A janela persistente continua a existir — o ministrante não é removido de nada —, mas
   * marcada e preta.
   */
  const { engine, state, definirRota } = montarComEcransMutaveis(rota(1, 2), [1, 2], DISPLAYS_TRES, {
    clock: SEM_RELOGIO,
  });
  comConteudoNoMinistrante(state);
  engine.garantirTelasAbertasParaProjecao();
  engine.render({});
  const janelaAntes = engine.janelasDeProjecao().find((e) => e.role === 'ministrante');
  assert.ok(janelaAntes, 'o ministrante devia estar aberto no M3');
  assert.strictEqual(ultimoPayloadMinistrante(engine).projecaoAtiva, true, 'antes: com conteúdo');

  definirRota(rota(1, -1));
  engine.garantirTelasAbertasParaProjecao();
  engine.render({});

  const janelaDepois = engine.janelasDeProjecao().find((e) => e.role === 'ministrante');
  assert.ok(janelaDepois, 'a janela persistente do ministrante continua a existir');
  assert.strictEqual(janelaDepois.win, janelaAntes.win, 'e é a mesma — nada foi removido');
  assert.strictEqual(janelaDepois.win.destruida, false);
  assert.strictEqual(janelaDepois.semExibicao, true, 'marcada como «Não exibir»');

  const payload = ultimoPayloadMinistrante(engine);
  assert.strictEqual(payload.telaLimpa, true, 'o monitor físico tem de ficar preto');
  assert.strictEqual(String(payload.atual || ''), '', 'sem estrofe');
  assert.strictEqual(String(payload.titulo || ''), '', 'sem título');
});

test('Ministrante volta a exibir quando o operador escolhe o monitor de novo', () => {
  const { engine, state, definirRota } = montarComEcransMutaveis(rota(1, 2), [1, 2], DISPLAYS_TRES, {
    clock: SEM_RELOGIO,
  });
  comConteudoNoMinistrante(state);
  engine.garantirTelasAbertasParaProjecao();
  definirRota(rota(1, -1));
  engine.garantirTelasAbertasParaProjecao();
  engine.render({});
  assert.strictEqual(ultimoPayloadMinistrante(engine).telaLimpa, true);

  definirRota(rota(1, 2));
  engine.garantirTelasAbertasParaProjecao();
  engine.render({});

  const entrada = engine.janelasDeProjecao().find((e) => e.role === 'ministrante');
  assert.strictEqual(entrada.semExibicao, false, 'a marca tem de sair');
  assert.strictEqual(
    ultimoPayloadMinistrante(engine).projecaoAtiva,
    true,
    'o conteúdo tem de voltar — «Não exibir» esconde, não apaga'
  );
});

test('Ministrante em «Não exibir» é estável: nada recriado a cada passagem', () => {
  /* `garantirTelasAbertasParaProjecao` corre a cada estrofe. Se a marca certa não contasse
     como rota cumprida, era um resync completo por estrofe no monitor do ministrante. */
  const { engine, state, definirRota } = montarComEcransMutaveis(rota(1, 2), [1, 2], DISPLAYS_TRES, {
    clock: SEM_RELOGIO,
  });
  comConteudoNoMinistrante(state);
  engine.garantirTelasAbertasParaProjecao();
  definirRota(rota(1, -1));
  engine.garantirTelasAbertasParaProjecao();

  const win = engine.janelasDeProjecao().find((e) => e.role === 'ministrante').win;
  const paginas = win.paginas.length;
  for (let i = 0; i < 5; i += 1) {
    engine.garantirTelasAbertasParaProjecao();
    engine.render({});
  }

  const entrada = engine.janelasDeProjecao().find((e) => e.role === 'ministrante');
  assert.strictEqual(entrada.win, win, 'a mesma janela nas cinco passagens');
  assert.strictEqual(entrada.win.paginas.length, paginas, 'nenhuma página recarregada');
  assert.strictEqual(entrada.win.visivel, true, 'nem escondida');
  assert.strictEqual(ultimoPayloadMinistrante(engine).telaLimpa, true, 'e continua preta');
});

test('com três monitores, rota vazia veste M2 e M3 permanentes', () => {
  const rotaVazia = {
    version: 2,
    slides: { publicoIndex: -1, ministranteIndex: -1 },
    apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    contagem: { publicoIndex: -1, ministranteIndex: -1 },
  };
  const { engine } = montarComEcransMutaveis(rotaVazia, [1, 2], DISPLAYS_TRES, {
    clock: { showClock: true, monitorRelogio: 'ministrante' },
  });
  engine.garantirTelasAbertasParaProjecao();

  const pub = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  const min = engine.janelasDeProjecao().find((e) => e.role === 'ministrante');
  assert.ok(pub, 'M2 permanente');
  assert.ok(min, 'M3 permanente');
  assert.strictEqual(pub.index, 1);
  assert.strictEqual(min.index, 2);
  assert.ok(pub.win.visivel && min.win.visivel, 'ambas visíveis desde o arranque');
  assert.strictEqual(pub.win, engine.janelasDeProjecao().find((e) => e.role === 'publico').win);
  engine.garantirTelasAbertasParaProjecao();
  assert.strictEqual(
    engine.janelasDeProjecao().find((e) => e.role === 'publico').win,
    pub.win,
    'segunda passagem não recria o M2'
  );
  assert.strictEqual(
    engine.janelasDeProjecao().find((e) => e.role === 'ministrante').win,
    min.win,
    'segunda passagem não recria o M3'
  );
});

test('«Não exibir» no ministrante não afecta o telão do público', () => {
  const { engine, state, definirRota } = montarComEcransMutaveis(rota(1, 2), [1, 2], DISPLAYS_TRES, {
    clock: SEM_RELOGIO,
  });
  comConteudoNoMinistrante(state);
  engine.garantirTelasAbertasParaProjecao();
  definirRota(rota(1, -1));
  engine.garantirTelasAbertasParaProjecao();
  engine.render({});

  const pub = engine.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.ok(pub, 'o telão continua aberto');
  assert.strictEqual(pub.semExibicao, false, 'e sem a marca');
  assert.strictEqual(pub.index, 1);
  const ultimo = pub.win.sends.filter((s) => s.canal === 'atualizar').pop();
  assert.ok(ultimo, 'o telão continua a receber os seus payloads');
});

/* ═══════════════════════════════════════════════════════════════════════════════
 *  Fase 2 — as três contradições internas que a investigação comprovou.
 *  Cada teste falha na árvore anterior à correcção; é essa a razão de existirem.
 * ═══════════════════════════════════════════════════════════════════════════════ */

const tituloDaJanela = (w) => String(w?.opcoesCriacao?.title || '');
const ehChao = (w) => /^Fundo/.test(tituloDaJanela(w));
const ehTelao = (w) => /^Telão/.test(tituloDaJanela(w));
const ehRelogio = (w) => w.paginas.some((p) => String(p).includes('display-clock.html'));
const subiuATopmost = (w) =>
  w.setAlwaysOnTopCalls.some((args) => args[0] === true && args[1] === 'screen-saver');

/**
 * Arranque completo com todas as janelas reveladas.
 *
 * A cadeia de sincronização é sequencial — cada etapa espera a janela anterior ficar
 * visível — por isso não basta bombear uma: é preciso ir bombeando a próxima que aparecer.
 */
async function arrancarEBombear() {
  const { engine, criadas, state } = montarComRevelacao();
  engine.abrirTelasConfiguradas();
  for (let volta = 0; volta < 12; volta += 1) {
    const pendente = criadas.find((w) => !w.visivel && !w.destruida);
    if (!pendente) break;
    await bombearRevelacao(pendente);
  }
  return { engine, criadas, state };
}

test('M3 ocioso não esconde a janela — o relógio é conteúdo interno', async () => {
  const { engine, criadas, state } = await arrancarEBombear();
  const ministrante = criadas.find((w) =>
    w.paginas.some((p) => String(p).includes('display-operator.html'))
  );
  assert.ok(ministrante?.visivel, 'o M3 arranca visível');
  const winAntes = ministrante;

  state.ministranteApresentacaoOverride = { modo: 'texto', atual: '', proximo: '', telaLimpa: true };
  engine.atualizarDisplayMinistrante(state.estadoMinistrante);
  assert.strictEqual(ministrante.visivel, true, 'ocioso não pode hide() — revelaria o desktop');
  assert.strictEqual(ministrante, winAntes, 'é a mesma HWND');
  assert.strictEqual(criadas.filter(ehRelogio).length, 0, 'não nasce uma segunda janela de relógio');

  state.ministranteApresentacaoOverride = { modo: 'texto', atual: 'linha um', proximo: '' };
  engine.atualizarDisplayMinistrante(state.estadoMinistrante);
  assert.strictEqual(ministrante.visivel, true, 'conteúdo volta na mesma janela');
});

test('A1 — o chão nunca sobe à banda topmost', async () => {
  const { criadas } = await arrancarEBombear();
  const chaos = criadas.filter(ehChao);
  const telao = criadas.find(ehTelao);

  assert.ok(chaos.length, 'o cenário tem de criar chão preto');
  assert.ok(telao, 'e o telão');

  for (const w of chaos) {
    assert.ok(
      !subiuATopmost(w),
      `${tituloDaJanela(w)} subiu à banda topmost — taparia o conteúdo do M2/M3`
    );
  }
  assert.ok(
    subiuATopmost(telao),
    'o telão continua topmost: é ele que tem de cobrir outro software de projeção'
  );
});

test('não há janela à parte de relógio nos monitores de saída', async () => {
  const { criadas } = await arrancarEBombear();
  assert.strictEqual(
    criadas.filter(ehRelogio).length,
    0,
    'o relógio vive dentro do M3 — uma segunda HWND no mesmo monitor era o hide() que revelava o desktop'
  );
  const m3 = criadas.find((w) => w.paginas.some((p) => String(p).includes('display-operator.html')));
  assert.ok(m3?.visivel, 'M3 permanente e visível');
});

test('o diário de bordo regista o ciclo de vida e identifica o papel de cada janela', async () => {
  const linhas = [];
  const { engine, criadas } = montarComRevelacao({
    diagnostico: {
      registar: (evento, dados) => linhas.push({ evento, dados: dados || {} }),
      caminho: () => '/tmp/lyra-telas.log',
    },
  });
  engine.abrirTelasConfiguradas();
  const telao = criadas.find(ehTelao);
  await bombearRevelacao(telao);

  const eventos = linhas.map((l) => l.evento);
  for (const esperado of ['sync-inicio', 'abrir', 'revelar-nativo']) {
    assert.ok(eventos.includes(esperado), `o diário tem de registar \`${esperado}\``);
  }
  const abertura = linhas.find((l) => l.evento === 'abrir' && l.dados.papel === 'publico');
  assert.ok(abertura, 'a linha de abertura identifica o papel');
  assert.strictEqual(abertura.dados.indice, 1, 'e o monitor');
  assert.strictEqual(abertura.dados.pagina, 'display.html');
});

test('sem diário injectado o motor comporta-se exactamente na mesma', async () => {
  /* O diário é opcional por construção: é isso que mantém os testes — e um arranque sem
     `userData` — a exercitar o mesmo motor que corre em produção. */
  const { criadas } = await arrancarEBombear();
  assert.ok(criadas.find(ehTelao)?.visivel, 'telão no ar');
  assert.ok(
    criadas.find((w) => w.paginas.some((p) => String(p).includes('display-operator.html')))?.visivel,
    'M3 no ar'
  );
});
