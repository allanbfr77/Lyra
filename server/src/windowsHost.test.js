'use strict';

/**
 * Contrato entre o motor de projeção (`windows.js`) e o host — sub-passo 2.
 *
 * Cobre o que o fingerprint não afirma, só grava: que o motor avisa o host em vez de
 * emitir na rede, e que a decisão "manter telas pretas vs fechar tudo" vem do host.
 *
 * `lib/iconPath.js` faz `require('electron')` no topo, por isso o módulo é stubado antes
 * de carregar o alvo (mesmo motivo do `tools/fingerprint-windows.js`).
 */

const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fakeApp = { quit: () => {}, isPackaged: false, getVersion: () => '0.0.0-test' };

const _load = Module._load;
Module._load = function (pedido, pai, isMain) {
  if (pedido === 'electron') return { app: fakeApp, screen: {}, BrowserWindow: function () {}, ipcMain: {} };
  return _load.apply(this, [pedido, pai, isMain]);
};

const { createWindowsApi } = require('./windows');

/**
 * Duplo de `BrowserWindow`.
 *
 * Respeita `show: false` e dispara `ready-to-show` / `did-finish-load` no `loadFile`, como
 * o Electron. Antes reportava-se sempre visível, e por isso os testes eram cegos ao
 * `show()` prematuro: `finalizarJanelaProjecaoNativa` mostrava a janela **antes** do
 * `loadFile`, e nenhum teste o via porque `isVisible()` já devolvia `true`.
 *
 * Os handlers registados depois do `loadFile` disparam na hora — é o que mantém a cadeia
 * de sincronização a correr de forma síncrona no teste, sem um pump manual.
 */
/**
 * Predicado sobre o título: quando devolve `true`, `loadFile` NÃO dispara os eventos de
 * carregamento e o teste chama `win.__concluirCarregamento()` quando quiser.
 *
 * É um predicado, e não um interruptor global, de propósito: adiar TUDO trava a cadeia de
 * sincronização no escudo e o motor nunca é reentrado — o cenário a testar deixa de
 * acontecer e o teste passa por vacuidade. Adiando só o telão, a cadeia completa-se com a
 * troca de monitor ainda pendente, que é a janela de tempo real onde as órfãs nasciam.
 */
let DIFERIR_CARREGAMENTO = () => false;

function fakeWin(opts = {}) {
  const handlersWin = new Map();
  const handlersWc = new Map();
  let carregou = false;

  const registar = (mapa) => (ev, fn) => {
    if (carregou && (ev === 'ready-to-show' || ev === 'did-finish-load')) {
      fn();
      return;
    }
    if (!mapa.has(ev)) mapa.set(ev, []);
    mapa.get(ev).push(fn);
  };
  const disparar = (mapa, ev) => {
    const fns = mapa.get(ev) || [];
    mapa.set(ev, []);
    fns.forEach((fn) => fn());
  };

  const win = {
    destruida: false,
    visivel: opts.show !== false,
    fullscreen: !!opts.fullscreen,
    bounds: { x: opts.x ?? 0, y: opts.y ?? 0, width: opts.width ?? 1920, height: opts.height ?? 1080 },
    sends: [],
    /** Chamadas que mexem na janela nativa — é o churn que pisca a barra de tarefas. */
    nativas: [],
    titulo: opts.title,
    /** `show` do construtor: tem de ser `false` em toda a janela de projeção. */
    criadaVisivel: opts.show !== false,
    webContents: {
      send: (canal, payload) => win.sends.push({ canal, payload }),
      on: registar(handlersWc),
      once: registar(handlersWc),
    },
    isDestroyed: () => win.destruida,
    isVisible: () => win.visivel,
    isFullScreen: () => win.fullscreen,
    getBounds: () => ({ ...win.bounds }),
    on: registar(handlersWin),
    once: registar(handlersWin),
    close: () => { win.destruida = true; },
    setBackgroundColor: () => {},
    setFullScreen: (b) => { win.fullscreen = !!b; win.nativas.push(`setFullScreen(${!!b})`); },
    setBounds: (b) => { win.bounds = { ...win.bounds, ...b }; win.nativas.push('setBounds'); },
    /* Registadas desde a etapa 1 do plano anti-flash. Antes eram no-ops silenciosas, e o
       teste «não mexe na janela nativa» (abaixo) passava às cegas por cima de um
       `setAlwaysOnTop(false)` incondicional que corria a cada tick de slider. */
    setAlwaysOnTop: (...args) => { win.nativas.push(`setAlwaysOnTop(${args.join(',')})`); },
    moveTop: () => { win.nativas.push('moveTop'); },
    show: () => { win.visivel = true; win.nativas.push('show'); },
    hide: () => { win.visivel = false; win.nativas.push('hide'); },
    setVisibleOnAllWorkspaces: () => {}, setMenuBarVisibility: () => {},
    setSkipTaskbar: () => {}, setIgnoreMouseEvents: () => {},
    loadFile: () => {
      win.nativas.push('loadFile');
      if (DIFERIR_CARREGAMENTO(String(opts.title || ''))) return;
      win.__concluirCarregamento();
    },
    /* Mesmo contrato do `loadFile`: a janela de fundo carrega uma data-URL, e sem isto os
       testes viam-na como uma janela que nunca carregou nada. */
    loadURL: () => {
      win.nativas.push('loadFile');
      if (DIFERIR_CARREGAMENTO(String(opts.title || ''))) return;
      win.__concluirCarregamento();
    },
    __concluirCarregamento: () => {
      if (carregou) return;
      carregou = true;
      disparar(handlersWin, 'ready-to-show');
      disparar(handlersWc, 'did-finish-load');
    },
  };
  return win;
}

const DISPLAYS = [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 } },
  { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 } },
];

/** Setup real de igreja: ecrã do operador (principal) + telão + retorno do ministrante. */
const DISPLAYS_TRES = [
  ...DISPLAYS,
  { id: 3, bounds: { x: 3840, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 } },
];

const paths = {
  displayRoutingPath: () => '/tmp/lyra-test-nao-existe-routing.json',
  displaySettingsPath: () => '/tmp/lyra-test-nao-existe-settings.json',
  displayConfigPath: () => '/tmp/lyra-test-nao-existe-config.json',
  errorLogPath: () => '/tmp/lyra-test-erros.log',
};

/**
 * Paths com um ficheiro de roteamento REAL — sem ele o motor resolve tudo para -1 e não
 * abre janela de conteúdo nenhuma, o que torna impossível testar quem recebe `display_config`.
 * @param {{ publicoIndex: number, ministranteIndex: number }} slides
 */
function pathsComRota(slides) {
  const ficheiro = path.join(
    os.tmpdir(),
    `lyra-test-routing-${process.pid}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(
    ficheiro,
    JSON.stringify({ version: 2, slides, apresentacao: { publicoIndex: -1, ministranteIndex: -1 } }),
    'utf8'
  );
  test.after(() => { try { fs.unlinkSync(ficheiro); } catch (_) { /* já removido */ } });
  const p = { ...paths, displayRoutingPath: () => ficheiro };
  /** Reescreve a rota — permite testar a transição «papel desactivado → reactivado». */
  p.escreverRota = (novos) => fs.writeFileSync(
    ficheiro,
    JSON.stringify({ version: 2, slides: novos, apresentacao: { publicoIndex: -1, ministranteIndex: -1 } }),
    'utf8'
  );
  return p;
}

/** Índice da primeira chamada nativa que casa com o prefixo; -1 se não houver. */
function primeiroIndice(nativas, prefixo) {
  return nativas.findIndex((n) => String(n).startsWith(prefixo));
}

function montar(over = {}) {
  const ctx = {
    // sem `windowsDisplay`: desde o sub-passo 3b o registo é privado ao motor
    windowControl: null,
    displayConfig: { publico: {}, ministrante: {}, clock: { showClock: false } },
    displayConfigBiblia: null,
    modoVisualProjecaoAtivo: null,
    estadoAtual: { tipo: 'musica', titulo: 'Hino', linhas: ['linha um'], telaLimpa: false },
    estadoMinistrante: { titulo: 'Hino', atual: 'linha um', proximo: '', telaLimpa: false },
    projecaoLiveAtiva: false,
    estadoPublicoOverride: null,
    ministranteApresentacaoOverride: null,
  };
  const eventos = [];
  /** Toda a janela criada, inclusive as que o motor deixe de registar — é aí que se vêem órfãs. */
  const criadas = [];
  const deps = {
    logError: () => {},
    screen: { getAllDisplays: () => DISPLAYS, getPrimaryDisplay: () => DISPLAYS[0], on: () => {} },
    BrowserWindow: function (opts) { const w = fakeWin(opts); criadas.push(w); return w; },
    app: fakeApp,
    WINDOW_TITLE: 'Lyra — Test',
    onProjecaoEncerrada: (ev) => eventos.push(ev),
    haOperadorConectado: () => true,
    resolverPaginaProjecao: (nome) => `/fake/public/${nome}`,
    caminhoIconeApp: () => '/fake/icone.ico',
    ...over,
  };
  delete deps.paths;
  return { ctx, eventos, criadas, api: createWindowsApi(ctx, over.paths || paths, deps) };
}

test('deps obrigatórios: falha alto em vez de degradar em silêncio', () => {
  const base = {
    logError: () => {}, screen: { getAllDisplays: () => DISPLAYS, on: () => {} },
    BrowserWindow: function (opts) { return fakeWin(opts); }, app: fakeApp, WINDOW_TITLE: 't',
    onProjecaoEncerrada: () => {}, haOperadorConectado: () => true,
    resolverPaginaProjecao: (nome) => `/fake/public/${nome}`, caminhoIconeApp: () => '/fake/icone.ico',
  };
  assert.throws(
    () => createWindowsApi({}, paths, { ...base, onProjecaoEncerrada: undefined }),
    /onProjecaoEncerrada/
  );
  assert.throws(
    () => createWindowsApi({}, paths, { ...base, haOperadorConectado: undefined }),
    /haOperadorConectado/
  );
  assert.throws(
    () => createWindowsApi({}, paths, { ...base, resolverPaginaProjecao: undefined }),
    /resolverPaginaProjecao/
  );
  assert.throws(
    () => createWindowsApi({}, paths, { ...base, caminhoIconeApp: undefined }),
    /caminhoIconeApp/
  );
});

test('o motor carrega a página que o host resolveu, não um caminho próprio', () => {
  /* O motor usava `__dirname` + '../public/', o que o prendia à pasta do Server. Agora
     pergunta ao host. Guarda contra alguém repor um caminho relativo no motor — o que
     partiria assim que ele mudasse de pasta (sub-passo 4b). */
  const pedidas = [];
  const { ctx, api } = montar({ resolverPaginaProjecao: (nome) => { pedidas.push(nome); return `/host/${nome}`; } });
  ctx.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  api.sincronizarJanelasRelogio();

  assert.ok(pedidas.includes('display-clock.html'), `host devia ter resolvido a página do relógio; pediu: ${pedidas}`);
});

test('encerrar por Esc avisa o host (e o motor não toca em transporte)', () => {
  const { ctx, eventos, api } = montar();
  api.encerrarProjecaoPorEsc('publico');

  assert.strictEqual(eventos.length, 1, 'host deve receber exactamente um aviso');
  assert.strictEqual(eventos[0].canal, 'publico');
  assert.ok(eventos[0].estadoPublico && typeof eventos[0].estadoPublico === 'object');
  // o payload do evento é o mesmo que o Server emitia antes directamente
  assert.deepStrictEqual(eventos[0].estadoPublico, api.estadoPublicoParaSocketsOuApi());
  // e o estado foi realmente encerrado
  assert.strictEqual(ctx.estadoAtual.telaLimpa, true);
});

test('Esc num modo que não é slides não avisa o host', () => {
  // Override de apresentação: `inferirModoEncerrarPorCanalJanela` sai antes de encerrar.
  const { ctx, eventos, api } = montar();
  ctx.ministranteApresentacaoOverride = { modo: 'apresentacao', apresentacao: { src: '/tmp/a.png' } };
  api.encerrarProjecaoPorEsc('ministrante');
  assert.strictEqual(eventos.length, 0, 'sem encerramento, sem aviso ao host');
});

/* Nota: o RESULTADO da decisão (fechar tudo vs manter em preto) depende do roteamento de
   monitores e da sequência assíncrona de abertura — território do fingerprint, que compara
   o comportamento inteiro byte-a-byte. Aqui garante-se só o contrato: que a pergunta é
   feita ao host, e feita de novo a cada decisão. */

test('o motor pergunta ao host se há operador ligado', () => {
  let chamadas = 0;
  const { api } = montar({ haOperadorConectado: () => { chamadas += 1; return true; } });
  api.garantirTelasAbertasParaProjecao();
  assert.ok(chamadas > 0, 'haOperadorConectado devia ter sido consultado');
});

test('aplicarDisplayConfigNasJanelas escreve nas janelas de conteúdo e na de controle', () => {
  const { ctx, api } = montar({ paths: pathsComRota({ publicoIndex: 1, ministranteIndex: 1 }) });
  const ctrl = fakeWin();
  ctx.windowControl = ctrl;
  // As janelas vêm do registo interno do motor — abre-se pelo motor, não injetando no ctx.
  ctx.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  api.garantirTelasAbertasParaProjecao();
  const abertas = api.janelasDeProjecao();
  const conteudo = abertas.filter((e) => e.role === 'publico' || e.role === 'ministrante');
  assert.ok(conteudo.length > 0, 'cenário precisa de pelo menos uma janela de conteúdo');

  const cfg = api.aplicarDisplayConfigNasJanelas({ forcarModo: 'slides' });

  assert.ok(cfg && typeof cfg === 'object', 'devolve a config enviada');
  assert.ok(
    conteudo.every((e) => e.win.sends.some((s) => s.canal === 'display_config')),
    'todas as janelas de conteúdo receberam'
  );
  assert.ok(ctrl.sends.some((s) => s.canal === 'display_config'), 'janela de controle recebeu');
});

test('a config do telão NÃO chega ao relógio nem ao escudo', () => {
  /*
   * Regressão do «relógio a piscar»: o registo era passado inteiro a
   * `enviarDisplayConfigParaJanelas`, por isso o relógio recebia a config do telão (com a
   * sua própria chave `clock`, vinda do modo Bíblia) e, no frame seguinte, a config de
   * relógio persistida que `sincronizarJanelasRelogio` envia. Duas configs diferentes na
   * mesma janela = repintura visível. O escudo é tela preta e não deve pintar fundo nenhum.
   */
  const { ctx, api } = montar({ paths: pathsComRota({ publicoIndex: 1, ministranteIndex: 1 }) });
  ctx.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  api.garantirTelasAbertasParaProjecao();

  const outras = api.janelasDeProjecao().filter((e) => e.role === 'relogio' || e.role === 'escudo');
  assert.ok(outras.length > 0, 'cenário precisa de pelo menos um relógio ou escudo');
  outras.forEach((e) => { e.win.sends.length = 0; });

  api.aplicarDisplayConfigNasJanelas({ forcarModo: 'biblia' });

  outras.forEach((e) => {
    assert.deepStrictEqual(
      e.win.sends.filter((s) => s.canal === 'display_config'),
      [],
      `janela de papel «${e.role}» não devia receber a config do telão`
    );
  });
});

test('nenhuma janela de projeção nasce visível', () => {
  /*
   * Regressão: `abrirJanelaTela`/`abrirJanelaMinistrante` passavam `show: false`, mas a
   * linha seguinte chamava `finalizarJanelaProjecaoNativa`, que fazia `show()` ANTES do
   * `loadFile` — o `show: false` não valia nada. O escudo nem sequer o pedia (`show: true`).
   * Resultado: rectângulo preto vazio no monitor até o conteúdo pintar.
   */
  const { ctx, api } = montar({ paths: pathsComRota({ publicoIndex: 1, ministranteIndex: 1 }) });
  ctx.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  api.garantirTelasAbertasParaProjecao();

  const abertas = api.janelasDeProjecao();
  assert.ok(abertas.length > 0, 'cenário precisa de janelas abertas');
  verificarNasceramOcultas(abertas);
});

test('nenhuma janela de projeção nasce visível — com escudo (3 monitores)', () => {
  /* O escudo é o caso que faltava: `opcoesBrowserWindowProjecao` dava-lhe `show: true` e o
     telão/ministrante mascaravam-no porque sobrepõem `show: false` no seu próprio spread.
     Com três ecrãs, o M3 fica sem canal e ganha escudo. */
  const { ctx, api } = montar({
    paths: pathsComRota({ publicoIndex: 1, ministranteIndex: 1 }),
    screen: { getAllDisplays: () => DISPLAYS_TRES, getPrimaryDisplay: () => DISPLAYS_TRES[0], on: () => {} },
  });
  ctx.displayConfig.clock = { showClock: false };
  api.garantirTelasAbertasParaProjecao();

  const abertas = api.janelasDeProjecao();
  assert.ok(
    abertas.some((e) => e.role === 'escudo'),
    `cenário precisa de escudo; papéis abertos: ${abertas.map((e) => e.role)}`
  );
  verificarNasceramOcultas(abertas);
});

/** Invariante partilhado: nasce oculta e só se mostra depois de carregar a página. */
function verificarNasceramOcultas(abertas) {
  abertas.forEach((e) => {
    assert.strictEqual(
      e.win.criadaVisivel, false,
      `janela de papel «${e.role}» nasceu visível`
    );
    const iLoad = primeiroIndice(e.win.nativas, 'loadFile');
    const iShow = primeiroIndice(e.win.nativas, 'show');
    assert.ok(iLoad >= 0, `janela de papel «${e.role}» devia ter carregado uma página`);
    assert.ok(
      iShow === -1 || iShow > iLoad,
      `janela de papel «${e.role}» foi mostrada antes de carregar a página: ${e.win.nativas}`
    );
  });
}

test('reexibir janela oculta: sem sair do fullscreen e com show() por último', () => {
  /*
   * A sequência antiga era `setFullScreen(false)` → `setBounds` → `show()` →
   * `setFullScreen(true)`: a janela aparecia um instante como janela normal antes de entrar
   * em fullscreen, e essa transição de modo tem frames próprios no Windows — o «lampejo
   * branco». Com os bounds já certos não deve haver `setFullScreen(false)` nenhum, e o
   * `show()` tem de ser o último passo.
   */
  const rota = pathsComRota({ publicoIndex: 1, ministranteIndex: 1 });
  const { ctx, api } = montar({ paths: rota });
  ctx.displayConfig.clock = { showClock: false };
  api.garantirTelasAbertasParaProjecao();

  const pub = api.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.ok(pub, 'cenário precisa da janela do público');

  // Desactiva o público: a janela é ocultada, não fechada.
  rota.escreverRota({ publicoIndex: -1, ministranteIndex: 1 });
  api.garantirTelasAbertasParaProjecao();
  assert.strictEqual(pub.win.isVisible(), false, 'devia ter sido ocultada');

  pub.win.nativas.length = 0;

  // Reactiva no MESMO monitor: os bounds já estão certos.
  rota.escreverRota({ publicoIndex: 1, ministranteIndex: 1 });
  api.garantirTelasAbertasParaProjecao();

  assert.ok(pub.win.isVisible(), 'devia ter voltado a aparecer');
  assert.strictEqual(
    primeiroIndice(pub.win.nativas, 'setFullScreen(false)'), -1,
    `não devia sair do fullscreen com os bounds já certos: ${pub.win.nativas}`
  );
  const iShow = primeiroIndice(pub.win.nativas, 'show');
  assert.ok(iShow >= 0, `devia ter chamado show(): ${pub.win.nativas}`);
  /* Depois do `show()` só podem vir reafirmações de topo (`setAlwaysOnTop`/`moveTop`), que
     são o reclaim e não mexem em geometria. Um `setBounds` ou `setFullScreen` a seguir
     significa que a janela mudou de forma **já visível** — é isso que pisca. */
  const geometriaDepoisDoShow = pub.win.nativas
    .slice(iShow + 1)
    .filter((n) => String(n).startsWith('setBounds') || String(n).startsWith('setFullScreen'));
  assert.deepStrictEqual(
    geometriaDepoisDoShow, [],
    `nada de geometria depois do show(): ${pub.win.nativas}`
  );
});

test('todo monitor gerido tem chão preto, em qualquer transição de rota', () => {
  /*
   * O invariante da camada de fundo (etapa 4).
   *
   * A cadeia de sincronização é sequencial: a etapa que descobre um monitor — esconder o
   * telão, fechar o relógio, mover uma janela — corre antes da que o volta a cobrir, com um
   * carregamento de página inteiro no meio. Sem chão, esse intervalo é área de trabalho do
   * Windows à vista, e foi o que o operador relatou ao desactivar o Público.
   *
   * O que se afirma aqui é o chão, não a ausência de buracos por cima dele: em qualquer
   * ponto de qualquer transição, todo o monitor gerido tem uma janela de fundo viva e
   * visível. O que estiver a acontecer nas camadas de cima passa a ser preto sobre preto.
   */
  const rota = pathsComRota({ publicoIndex: 1, ministranteIndex: 2 });
  const { ctx, api } = montar({
    paths: rota,
    screen: { getAllDisplays: () => DISPLAYS_TRES, getPrimaryDisplay: () => DISPLAYS_TRES[0], on: () => {} },
  });
  ctx.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };

  const conferirChao = (etiqueta) => {
    const fundos = api.janelasDeProjecao().filter(
      (e) => e.role === 'fundo' && e.win && !e.win.isDestroyed() && e.win.isVisible()
    );
    const cobertos = new Set(fundos.map((e) => e.index));
    // Monitor 1 (índice 0) é o do operador: não é gerido e não leva chão.
    [1, 2].forEach((idx) => {
      assert.ok(
        cobertos.has(idx),
        `${etiqueta}: monitor ${idx} sem chão preto (cobertos: ${[...cobertos]})`
      );
    });
    fundos.forEach((e) => {
      assert.strictEqual(
        e.win.isFullScreen(), true,
        `${etiqueta}: chão do monitor ${e.index} não está em tela cheia`
      );
    });
  };

  const transicoes = [
    { publicoIndex: 1, ministranteIndex: 2 },
    { publicoIndex: -1, ministranteIndex: 2 },   // desactivar o Público
    { publicoIndex: 2, ministranteIndex: -1 },   // trocar de monitor e desactivar o outro
    { publicoIndex: 1, ministranteIndex: -1 },
    { publicoIndex: -1, ministranteIndex: -1 },  // tudo desactivado
    { publicoIndex: 1, ministranteIndex: 2 },    // voltar ao início
  ];

  transicoes.forEach((slides) => {
    rota.escreverRota(slides);
    api.garantirTelasAbertasParaProjecao();
    conferirChao(`rota ${JSON.stringify(slides)}`);
  });
});

test('o chão nunca recebe estado nem configuração', () => {
  /* É chão: uma janela preta sem página de projeção. Se receber `display_config` pinta o
     fundo do telão; se receber `atualizar` pinta conteúdo. Nem um nem outro. */
  const { ctx, api } = montar({
    paths: pathsComRota({ publicoIndex: 1, ministranteIndex: 2 }),
    screen: { getAllDisplays: () => DISPLAYS_TRES, getPrimaryDisplay: () => DISPLAYS_TRES[0], on: () => {} },
  });
  ctx.displayConfig.clock = { showClock: false };
  api.garantirTelasAbertasParaProjecao();
  api.aplicarDisplayConfigNasJanelas({ forcarModo: 'slides' });
  api.render({ estado: { tipo: 'musica', titulo: 'Hino', linhas: ['uma linha'], telaLimpa: false } });

  const fundos = api.janelasDeProjecao().filter((e) => e.role === 'fundo');
  assert.ok(fundos.length > 0, 'cenário precisa de janelas de fundo');
  fundos.forEach((e) => {
    assert.deepStrictEqual(e.win.sends, [], `chão do monitor ${e.index} recebeu mensagens`);
  });
});

test('nunca duas janelas de topo absoluto no mesmo monitor', () => {
  /*
   * O bug das «duas telas a brigar», relatado com Público em M3 e Ministrante desactivado.
   *
   * Com o ministrante desactivado o motor mantém na mesma uma janela preta persistente, no
   * índice de recurso de `loadDisplayIndices()` — que é cego à rota. Movido o público para
   * esse mesmo monitor, ficavam lá DUAS janelas fullscreen always-on-top, ambas em papéis
   * de topo absoluto e ambas a levar `moveTop()` a cada ciclo do reclaim: cada uma tapava a
   * outra, e o monitor piscava a cada troca de slide.
   *
   * O invariante é mais geral que o caso: seja qual for a rota, dois papéis de topo
   * absoluto nunca podem ocupar o mesmo ecrã.
   */
  const rotas = [
    { publicoIndex: 2, ministranteIndex: -1 },
    { publicoIndex: 1, ministranteIndex: -1 },
    { publicoIndex: 2, ministranteIndex: 1 },
    { publicoIndex: -1, ministranteIndex: 2 },
    { publicoIndex: 1, ministranteIndex: 2 },
  ];
  const TOPO_ABSOLUTO = new Set(['publico', 'ministrante', 'escudo']);

  rotas.forEach((slides) => {
    const { ctx, api } = montar({
      paths: pathsComRota(slides),
      screen: { getAllDisplays: () => DISPLAYS_TRES, getPrimaryDisplay: () => DISPLAYS_TRES[0], on: () => {} },
    });
    ctx.displayConfig.clock = { showClock: false };
    api.garantirTelasAbertasParaProjecao();

    const porMonitor = new Map();
    api.janelasDeProjecao()
      .filter((e) => TOPO_ABSOLUTO.has(e.role) && e.win && !e.win.isDestroyed() && e.win.isVisible())
      .forEach((e) => {
        if (!porMonitor.has(e.index)) porMonitor.set(e.index, []);
        porMonitor.get(e.index).push(e.role);
      });

    porMonitor.forEach((papeis, idx) => {
      assert.strictEqual(
        papeis.length, 1,
        `rota ${JSON.stringify(slides)}: monitor ${idx} com ${papeis.length} janelas de topo (${papeis})`
      );
    });
  });
});

test('troca de monitor pendente não gera janelas órfãs', () => {
  /*
   * O bug das «duas telas a brigar».
   *
   * `substituirJanelaNoMonitor` cria a janela no monitor novo e só troca — e fecha a antiga
   * — quando a nova fica visível. Até lá, `entrada.index` continua a apontar ao monitor
   * antigo, por isso `telasAbertasCorrespondemRota` dá a rota por incumprida. Como
   * `sincronizarJanelaRole` chamava `next()` sem esperar, `syncTelasEmAndamento` já estava
   * em `false` e a chamada seguinte de `garantirTelasAbertasParaProjecao` — uma por
   * estrofe — abria OUTRA janela no destino.
   *
   * A primeira ficava viva, visível, fullscreen e always-on-top, mas fora do registo: nunca
   * mais recebia conteúdo nem era fechada. Duas janelas topmost no mesmo monitor, ambas a
   * fazer `moveTop()` no reclaim — o monitor a piscar entre o slide actual e um slide velho.
   */
  const rota = pathsComRota({ publicoIndex: 1, ministranteIndex: -1 });
  const { ctx, api, criadas } = montar({
    paths: rota,
    screen: { getAllDisplays: () => DISPLAYS_TRES, getPrimaryDisplay: () => DISPLAYS_TRES[0], on: () => {} },
  });
  ctx.displayConfig.clock = { showClock: false };
  api.garantirTelasAbertasParaProjecao();

  /* Só o telão: a janela persistente do ministrante também nasce no monitor de recurso e é
     legítima — o que não pode haver é mais do que um telão. */
  const teloesNoDestino = () => criadas.filter(
    (w) => !w.isDestroyed()
      && w.getBounds().x === DISPLAYS_TRES[2].bounds.x
      && String(w.titulo || '').startsWith('Telão')
  );

  DIFERIR_CARREGAMENTO = (titulo) => titulo.startsWith('Telão');
  try {
    // Operador move o público de M2 para M3; a janela nova ainda está a carregar.
    rota.escreverRota({ publicoIndex: 2, ministranteIndex: -1 });
    api.garantirTelasAbertasParaProjecao();

    // Trocar de slide algumas vezes enquanto a troca está pendente.
    api.garantirTelasAbertasParaProjecao();
    api.garantirTelasAbertasParaProjecao();
    api.garantirTelasAbertasParaProjecao();

    assert.strictEqual(
      teloesNoDestino().length, 1,
      `só devia existir UM telão no monitor de destino; existem ${teloesNoDestino().length}`
    );
  } finally {
    DIFERIR_CARREGAMENTO = () => false;
  }

  // Concluído o carregamento, continua a haver exactamente uma — e é a registada.
  criadas.forEach((w) => w.__concluirCarregamento());
  assert.strictEqual(teloesNoDestino().length, 1, 'nenhum telão órfão pode sobreviver à troca');
  const pub = api.janelasDeProjecao().find((e) => e.role === 'publico');
  assert.ok(pub && !pub.win.isDestroyed(), 'a janela registada tem de estar viva');
  assert.strictEqual(pub.index, 2, 'o registo tem de apontar ao monitor novo');
});

test('relógio não recebe display_config repetida quando a config não mudou', () => {
  /*
   * `sincronizarJanelasRelogio` roda a cada tick de arrasto de slider e a cada
   * estrofe/versículo. Reenviar bytes idênticos faz o renderer reescrever cor, quatro
   * `fontSize` e o fundo do `body`, e chamar `tick()` — repintura por nada.
   */
  const { ctx, api } = montar();
  ctx.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  api.sincronizarJanelasRelogio();

  const relogios = api.janelasDeProjecao().filter((e) => e.role === 'relogio');
  assert.ok(relogios.length > 0, 'cenário precisa de janela de relógio');
  relogios.forEach((e) => { e.win.sends.length = 0; });

  api.sincronizarJanelasRelogio();
  api.sincronizarJanelasRelogio();
  relogios.forEach((e) => {
    assert.deepStrictEqual(
      e.win.sends.filter((s) => s.canal === 'display_config'),
      [],
      'config igual não devia ser reenviada'
    );
  });

  // O contrapeso: mudar a config de verdade tem de voltar a enviar.
  ctx.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante', fontSize: 21 };
  api.sincronizarJanelasRelogio();
  relogios.forEach((e) => {
    assert.ok(
      e.win.sends.some((s) => s.canal === 'display_config'),
      'config nova tem de chegar'
    );
  });
});

test('resincronizar o relógio com a janela já no lugar não mexe na janela nativa', () => {
  /* Regressão: `sincronizarJanelasRelogio` roda a cada `preview_display_config`, ou seja
     a cada tick do arrasto de um slider. Fazer sair/entrar de fullscreen a cada tick pisca
     a barra de tarefas do Windows — visível sempre que o relógio é a janela da frente no
     monitor (modo Bíblia). Sem bounds novos, não deve haver chamada nativa nenhuma. */
  const { ctx, api } = montar();
  ctx.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  api.sincronizarJanelasRelogio();

  const relogios = api.janelasDeProjecao().filter((e) => e.role === 'relogio');
  assert.ok(relogios.length > 0, 'o cenário precisa de pelo menos uma janela de relógio aberta');
  relogios.forEach((e) => { e.win.nativas.length = 0; });

  api.sincronizarJanelasRelogio();
  api.sincronizarJanelasRelogio();

  relogios.forEach((e) => {
    assert.deepStrictEqual(
      e.win.nativas, [],
      `janela de relógio do monitor ${e.index} sofreu churn nativo: ${e.win.nativas.join(', ')}`
    );
  });
});

test('relógio num monitor que mudou de posição é reposicionado', () => {
  // O contrapeso do teste acima: a guarda não pode impedir o reposicionamento legítimo.
  const { ctx, api } = montar();
  ctx.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  api.sincronizarJanelasRelogio();
  const relogio = api.janelasDeProjecao().find((e) => e.role === 'relogio');
  assert.ok(relogio, 'cenário precisa de janela de relógio');

  relogio.win.nativas.length = 0;
  relogio.win.bounds = { x: -5000, y: -5000, width: 800, height: 600 };
  api.sincronizarJanelasRelogio();

  assert.ok(relogio.win.nativas.includes('setBounds'), 'devia reposicionar');
  assert.deepStrictEqual(relogio.win.getBounds(), DISPLAYS[relogio.index].bounds);
});

test('o predicado é consultado a cada decisão, não memorizado na construção', () => {
  let chamadas = 0;
  const { api } = montar({ haOperadorConectado: () => { chamadas += 1; return true; } });
  api.garantirTelasAbertasParaProjecao();
  const apos1 = chamadas;
  api.garantirTelasAbertasParaProjecao();
  assert.ok(chamadas > apos1, 'a resposta do host não pode ficar presa na construção da api');
});
