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

/** Setup real de igreja: ecrã do operador (principal) + telão + retorno do ministrante. */
const DISPLAYS_TRES = [
  ...DISPLAYS,
  { id: 3, bounds: { x: 3840, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 } },
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
  a.engine.sincronizarJanelasRelogio();
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
