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

function fakeWin() {
  const win = {
    destruida: false,
    visivel: true,
    sends: [],
    webContents: { send: (canal, payload) => win.sends.push({ canal, payload }), on: () => {}, once: () => {} },
    isDestroyed: () => win.destruida,
    isVisible: () => win.visivel,
    on: () => {}, once: () => {},
    close: () => { win.destruida = true; },
    setBackgroundColor: () => {}, setFullScreen: () => {}, setAlwaysOnTop: () => {},
    moveTop: () => {}, show: () => {}, hide: () => { win.visivel = false; },
    setVisibleOnAllWorkspaces: () => {}, setMenuBarVisibility: () => {}, setBounds: () => {},
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
    windowsDisplay: [],
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
    BrowserWindow: function () { return fakeWin(); },
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
    BrowserWindow: function () { return fakeWin(); }, app: fakeApp, WINDOW_TITLE: 't',
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
  const { ctx, api } = montar({ haOperadorConectado: () => { chamadas += 1; return true; } });
  ctx.windowsDisplay = [{ role: 'publico', index: 0, win: fakeWin() }];
  api.garantirTelasAbertasParaProjecao();
  assert.ok(chamadas > 0, 'haOperadorConectado devia ter sido consultado');
});

test('o predicado é consultado a cada decisão, não memorizado na construção', () => {
  let chamadas = 0;
  const { ctx, api } = montar({ haOperadorConectado: () => { chamadas += 1; return true; } });
  ctx.windowsDisplay = [{ role: 'publico', index: 0, win: fakeWin() }];
  api.garantirTelasAbertasParaProjecao();
  const apos1 = chamadas;
  api.garantirTelasAbertasParaProjecao();
  assert.ok(chamadas > apos1, 'a resposta do host não pode ficar presa na construção da api');
});
