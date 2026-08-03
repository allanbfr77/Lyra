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

const fakeApp = { quit: () => {}, isPackaged: false, getVersion: () => '0.0.0-test' };

const _load = Module._load;
Module._load = function (pedido, pai, isMain) {
  if (pedido === 'electron') return { app: fakeApp, screen: {}, BrowserWindow: function () {}, ipcMain: {} };
  return _load.apply(this, [pedido, pai, isMain]);
};

const { createWindowsApi } = require('./windows');

function fakeWin(opts = {}) {
  const win = {
    destruida: false,
    visivel: true,
    fullscreen: !!opts.fullscreen,
    bounds: { x: opts.x ?? 0, y: opts.y ?? 0, width: opts.width ?? 1920, height: opts.height ?? 1080 },
    sends: [],
    /** Chamadas que mexem na janela nativa — é o churn que pisca a barra de tarefas. */
    nativas: [],
    webContents: { send: (canal, payload) => win.sends.push({ canal, payload }), on: () => {}, once: () => {} },
    isDestroyed: () => win.destruida,
    isVisible: () => win.visivel,
    isFullScreen: () => win.fullscreen,
    getBounds: () => ({ ...win.bounds }),
    on: () => {}, once: () => {},
    close: () => { win.destruida = true; },
    setBackgroundColor: () => {},
    setFullScreen: (b) => { win.fullscreen = !!b; win.nativas.push(`setFullScreen(${!!b})`); },
    setBounds: (b) => { win.bounds = { ...win.bounds, ...b }; win.nativas.push('setBounds'); },
    setAlwaysOnTop: () => {},
    moveTop: () => {}, show: () => {}, hide: () => { win.visivel = false; },
    setVisibleOnAllWorkspaces: () => {}, setMenuBarVisibility: () => {},
    setSkipTaskbar: () => {}, setIgnoreMouseEvents: () => {}, loadFile: () => {}, loadURL: () => {},
  };
  return win;
}

const DISPLAYS = [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 } },
  { id: 2, bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 } },
];

const paths = {
  displayRoutingPath: () => '/tmp/lyra-test-nao-existe-routing.json',
  displaySettingsPath: () => '/tmp/lyra-test-nao-existe-settings.json',
  displayConfigPath: () => '/tmp/lyra-test-nao-existe-config.json',
  errorLogPath: () => '/tmp/lyra-test-erros.log',
};

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
  const deps = {
    logError: () => {},
    screen: { getAllDisplays: () => DISPLAYS, getPrimaryDisplay: () => DISPLAYS[0], on: () => {} },
    BrowserWindow: function (opts) { return fakeWin(opts); },
    app: fakeApp,
    WINDOW_TITLE: 'Lyra — Test',
    onProjecaoEncerrada: (ev) => eventos.push(ev),
    haOperadorConectado: () => true,
    ...over,
  };
  return { ctx, eventos, api: createWindowsApi(ctx, paths, deps) };
}

test('deps obrigatórios: falha alto em vez de degradar em silêncio', () => {
  const base = {
    logError: () => {}, screen: { getAllDisplays: () => DISPLAYS, on: () => {} },
    BrowserWindow: function (opts) { return fakeWin(opts); }, app: fakeApp, WINDOW_TITLE: 't',
    onProjecaoEncerrada: () => {}, haOperadorConectado: () => true,
  };
  assert.throws(
    () => createWindowsApi({}, paths, { ...base, onProjecaoEncerrada: undefined }),
    /onProjecaoEncerrada/
  );
  assert.throws(
    () => createWindowsApi({}, paths, { ...base, haOperadorConectado: undefined }),
    /haOperadorConectado/
  );
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

test('aplicarDisplayConfigNasJanelas escreve nas janelas de projeção e na de controle', () => {
  const { ctx, api } = montar();
  const ctrl = fakeWin();
  ctx.windowControl = ctrl;
  // As janelas vêm do registo interno do motor — abre-se pelo motor, não injetando no ctx.
  ctx.displayConfig.clock = { showClock: true, monitorRelogio: 'ministrante' };
  api.sincronizarJanelasRelogio();
  const abertas = api.janelasDeProjecao();
  assert.ok(abertas.length > 0, 'cenário precisa de pelo menos uma janela no registo');

  const cfg = api.aplicarDisplayConfigNasJanelas({ forcarModo: 'slides' });

  assert.ok(cfg && typeof cfg === 'object', 'devolve a config enviada');
  assert.ok(
    abertas.every((e) => e.win.sends.some((s) => s.canal === 'display_config')),
    'todas as janelas do registo receberam'
  );
  assert.ok(ctrl.sends.some((s) => s.canal === 'display_config'), 'janela de controle recebeu');
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
