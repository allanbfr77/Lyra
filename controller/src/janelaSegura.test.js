'use strict';

/**
 * E1.3 Fase B (W) — guardas das janelas autorizadas: DevTools, navegação e window.open.
 * Lógica pura + janelas falsas; o comportamento no Electron real está em
 * `credencialInterna.electron.test.js`.
 */

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const {
  devToolsPermitido,
  ehAtalhoDevTools,
  navegacaoPermitida,
  instalarGuardas,
  opcoesWebPreferences,
} = require('./janelaSegura');

const ORIGEM = 'http://127.0.0.1:3001';

function janelaFalsa() {
  const wc = new EventEmitter();
  wc.closeDevTools = () => { wc.fechouDevTools = (wc.fechouDevTools || 0) + 1; };
  wc.setWindowOpenHandler = (fn) => { wc.handlerAbrir = fn; };
  wc.isDestroyed = () => false;
  const win = new EventEmitter();
  win.webContents = wc;
  return win;
}

test('DevTools só em desenvolvimento: empacotado (produção) nunca permite', () => {
  assert.strictEqual(devToolsPermitido({ isPackaged: true }), false);
  assert.strictEqual(devToolsPermitido({ isPackaged: false }), true);
  assert.strictEqual(devToolsPermitido(null), false, 'na dúvida, bloqueia');
  assert.strictEqual(devToolsPermitido({}), false, 'sem a informação, bloqueia');
});

test('opcoesWebPreferences desliga devTools em produção e preserva o resto', () => {
  const base = { preload: 'p.js', sandbox: true, contextIsolation: true, nodeIntegration: false };
  const prod = opcoesWebPreferences(base, false);
  assert.strictEqual(prod.devTools, false);
  assert.deepStrictEqual({ ...prod, devTools: undefined }, { ...base, devTools: undefined });
  assert.strictEqual(opcoesWebPreferences(base, true).devTools, true);
  assert.ok(!('devTools' in base), 'não muta a entrada');
});

test('atalhos de DevTools: F12, Ctrl+Shift+I/J/C, Ctrl+Alt+I e Cmd+Alt+I', () => {
  const k = (key, mods = {}) => ({ type: 'keyDown', key, control: false, shift: false, alt: false, meta: false, ...mods });
  assert.ok(ehAtalhoDevTools(k('F12')));
  assert.ok(ehAtalhoDevTools(k('I', { control: true, shift: true })));
  assert.ok(ehAtalhoDevTools(k('i', { control: true, shift: true })));
  assert.ok(ehAtalhoDevTools(k('J', { control: true, shift: true })));
  assert.ok(ehAtalhoDevTools(k('C', { control: true, shift: true })));
  assert.ok(ehAtalhoDevTools(k('I', { meta: true, alt: true })));
  assert.ok(ehAtalhoDevTools(k('I', { control: true, alt: true })));
  // atalhos legítimos do painel não podem ser tocados
  for (const legit of [k('F9'), k('H', { control: true }), k('V', { control: true, shift: true }), k('I', { control: true }), k('R', { control: true }), k('F5'), k('C', { control: true })]) {
    assert.ok(!ehAtalhoDevTools(legit), `${legit.key} ${JSON.stringify(legit)}`);
  }
  assert.ok(!ehAtalhoDevTools(null));
  assert.ok(!ehAtalhoDevTools({}));
});

test('navegação: só a página exata da própria janela (recarregar/âncora/query), nada mais', () => {
  const cfg = { origem: ORIGEM, pagina: '/controller.html' };
  assert.ok(navegacaoPermitida(`${ORIGEM}/controller.html`, cfg));
  assert.ok(navegacaoPermitida(`${ORIGEM}/controller.html?x=1#y`, cfg));
  for (const url of [
    `${ORIGEM}/historico.html`,
    `${ORIGEM}/tela.html`,
    `${ORIGEM}/controller.html/../tela.html`,
    'http://127.0.0.1:5510/controller.html',
    'http://localhost:3001/controller.html',
    'https://example.com/',
    'file:///C:/x.html',
    'javascript:alert(1)',
    'about:blank',
    'lixo',
    '',
  ]) {
    assert.ok(!navegacaoPermitida(url, cfg), url);
  }
});

test('guardas: will-navigate (e will-redirect) fora da página exata é cancelado; a própria página passa', () => {
  const win = janelaFalsa();
  instalarGuardas(win, { origem: ORIGEM, pagina: '/historico.html', devToolsPermitido: true, abrirExterno: () => {} });
  const tenta = (evento, url) => {
    let cancelado = false;
    win.webContents.emit(evento, { preventDefault: () => { cancelado = true; } }, url);
    return cancelado;
  };
  assert.strictEqual(tenta('will-navigate', `${ORIGEM}/historico.html`), false);
  assert.strictEqual(tenta('will-navigate', `${ORIGEM}/controller.html`), true);
  assert.strictEqual(tenta('will-navigate', 'https://example.com/'), true);
  assert.strictEqual(tenta('will-redirect', 'http://127.0.0.1:5510/'), true);
});

test('guardas: window.open é sempre negado; só http(s) vai ao navegador do sistema', () => {
  const win = janelaFalsa();
  const abertos = [];
  instalarGuardas(win, { origem: ORIGEM, pagina: '/controller.html', devToolsPermitido: true, abrirExterno: (u) => abertos.push(u) });
  assert.deepStrictEqual(win.webContents.handlerAbrir({ url: `${ORIGEM}/child.html` }), { action: 'deny' });
  assert.deepStrictEqual(win.webContents.handlerAbrir({ url: 'https://example.com/a' }), { action: 'deny' });
  assert.deepStrictEqual(win.webContents.handlerAbrir({ url: 'file:///C:/Windows/System32/calc.exe' }), { action: 'deny' });
  assert.deepStrictEqual(win.webContents.handlerAbrir({ url: 'javascript:alert(1)' }), { action: 'deny' });
  assert.deepStrictEqual(abertos, ['https://example.com/a']);
});

test('guardas em produção: atalhos de DevTools são engolidos e DevTools abertas são fechadas', () => {
  const win = janelaFalsa();
  instalarGuardas(win, { origem: ORIGEM, pagina: '/controller.html', devToolsPermitido: false, abrirExterno: () => {} });
  let evitado = 0;
  const ev = { preventDefault: () => { evitado += 1; } };
  win.webContents.emit('before-input-event', ev, { type: 'keyDown', key: 'F12', control: false, shift: false, alt: false, meta: false });
  win.webContents.emit('before-input-event', ev, { type: 'keyDown', key: 'I', control: true, shift: true, alt: false, meta: false });
  win.webContents.emit('before-input-event', ev, { type: 'keyDown', key: 'F9', control: false, shift: false, alt: false, meta: false });
  assert.strictEqual(evitado, 2, 'F9 (Verificar antes de começar) não pode ser engolido');
  win.webContents.emit('devtools-opened');
  assert.strictEqual(win.webContents.fechouDevTools, 1);
});

test('guardas em desenvolvimento: DevTools continuam disponíveis', () => {
  const win = janelaFalsa();
  instalarGuardas(win, { origem: ORIGEM, pagina: '/controller.html', devToolsPermitido: true, abrirExterno: () => {} });
  let evitado = 0;
  win.webContents.emit('before-input-event', { preventDefault: () => { evitado += 1; } }, { type: 'keyDown', key: 'F12', control: false, shift: false, alt: false, meta: false });
  win.webContents.emit('devtools-opened');
  assert.strictEqual(evitado, 0);
  assert.strictEqual(win.webContents.fechouDevTools, undefined);
});
