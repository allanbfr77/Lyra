'use strict';

/**
 * E1.3 Fase B — regras adicionais da autenticação HTTP (unidade).
 *
 *  - o webhook da INVB tem segredo próprio e NÃO pode depender de credencial de dispositivo;
 *  - no modo `impor`, rotas "loopback-estrito" não aceitam requisição proxificada nem vinda de
 *    fora da máquina (a guarda por IP da rota é a ÚNICA defesa delas: se o IP não for o da
 *    máquina, ou se a requisição veio por um proxy, a rota não pode confiar no IP);
 *  - no modo `registrar` nada disso bloqueia.
 */

const test = require('node:test');
const assert = require('node:assert');
const { criarAutenticacaoHttp, classificarRota } = require('./autenticacaoHttp');

function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    corpo: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    end(c) { this.corpo = String(c || ''); this.terminou = true; },
  };
  return res;
}

function executar(auth, { method = 'GET', url = '/', ip = '127.0.0.1', headers = {} } = {}) {
  const req = { method, originalUrl: url, url, headers, socket: { remoteAddress: ip } };
  const res = fakeRes();
  let seguiu = false;
  auth.middleware(req, res, () => { seguiu = true; });
  return { seguiu, res };
}

const semCredencial = () => ({ ok: false, classe: 'ausente' });

/* ───────────────────────── classificação ───────────────────────── */

test('webhook da INVB é pública (segredo próprio), em qualquer variação de caminho', () => {
  for (const u of [
    '/api/tom-memoria/webhook-invb',
    '/api/tom-memoria/webhook-invb?x=1',
    '/API/Tom-Memoria/Webhook-INVB',
    '/api/tom-memoria/webhook-invb/',
    '/api/tom-memoria/%77ebhook-invb',
  ]) {
    assert.strictEqual(classificarRota('POST', u), 'publica', u);
  }
});

test('só o webhook exato é público: o resto de /api/tom-memoria e caminhos vizinhos continuam protegidos', () => {
  assert.notStrictEqual(classificarRota('POST', '/api/tom-memoria/outra'), 'publica');
  assert.notStrictEqual(classificarRota('POST', '/api/tom-memoria/webhook-invb/extra'), 'publica');
  assert.notStrictEqual(classificarRota('PUT', '/api/tom-memoria/webhook-invb-x'), 'publica');
  assert.notStrictEqual(classificarRota('POST', '/api/tom-memoria/../sync/banco/local'), 'publica');
});

test('rotas críticas nunca são classificadas como públicas, seja qual for o método e o enfeite do caminho', () => {
  const criticas = [
    ['POST', '/api/sync/banco/local'],
    ['POST', '/api/sync/banco'],
    ['POST', '/api/sync/banco/pedido'],
    ['POST', '/api/comando/audio_play'],
    ['POST', '/api/comando/slide'],
    ['PUT', '/api/display-config'],
    ['PUT', '/api/display-routing'],
    ['POST', '/api/open-server-devtools'],
    ['DELETE', '/api/musicas/1'],
    ['POST', '/api/playlists'],
  ];
  const enfeites = [(p) => p, (p) => `${p}?x=1`, (p) => p.toUpperCase(), (p) => `${p}/`, (p) => p.replace('/api/', '/api//'), (p) => p.replace('/api/', '/api/./')];
  for (const [m, p] of criticas) {
    for (const e of enfeites) {
      const pol = classificarRota(m, e(p));
      assert.notStrictEqual(pol, 'publica', `${m} ${e(p)}`);
    }
  }
  assert.strictEqual(classificarRota('POST', '/api/comando/audio_play'), 'comando');
});

/* ───────────────────────── loopback-estrito em `impor` ───────────────────────── */

const LOOPBACK = [
  ['POST', '/api/apresentacao/midia/importar'],
  ['POST', '/api/sync/banco/pedido/aceitar'],
  ['POST', '/api/sync/banco/pedido/recusar'],
  ['GET', '/api/sync/banco/pedido'],
  ['GET', '/api/controladores'],
  ['POST', '/api/internal/algo'],
  ['POST', '/api/docs/converter-pdf'],
];

test('impor: loopback-estrito proxificada (x-lyra-proxy: 1) é recusada com 403 e não segue', () => {
  const auth = criarAutenticacaoHttp({ modo: 'impor', verificar: semCredencial });
  for (const [method, url] of LOOPBACK) {
    const r = executar(auth, { method, url, ip: '127.0.0.1', headers: { 'x-lyra-proxy': '1' } });
    assert.strictEqual(r.seguiu, false, `${method} ${url}`);
    assert.strictEqual(r.res.statusCode, 403, `${method} ${url}`);
    assert.ok(r.res.terminou);
  }
});

test('impor: loopback-estrito vinda de fora da máquina é recusada com 403', () => {
  const auth = criarAutenticacaoHttp({ modo: 'impor', verificar: semCredencial });
  for (const ip of ['192.168.1.50', '10.0.0.2', '8.8.8.8', '::ffff:192.168.1.50', 'fe80::1', '']) {
    const r = executar(auth, { method: 'POST', url: '/api/apresentacao/midia/importar', ip });
    assert.strictEqual(r.seguiu, false, ip);
    assert.strictEqual(r.res.statusCode, 403, ip);
  }
});

test('impor: loopback-estrito direta da própria máquina segue (a guarda da rota decide)', () => {
  const auth = criarAutenticacaoHttp({ modo: 'impor', verificar: semCredencial });
  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    for (const [method, url] of LOOPBACK) {
      assert.strictEqual(executar(auth, { method, url, ip }).seguiu, true, `${ip} ${method} ${url}`);
    }
  }
});

test('impor: credencial válida NÃO libera loopback-estrito proxificada (credencial não substitui a guarda local)', () => {
  const auth = criarAutenticacaoHttp({ modo: 'impor', verificar: () => ({ ok: true, classe: 'autorizado' }) });
  const r = executar(auth, {
    method: 'POST',
    url: '/api/apresentacao/midia/importar',
    headers: { 'x-lyra-proxy': '1', 'x-lyra-device': 'dev-1', 'x-lyra-secret': 'seg' },
  });
  assert.strictEqual(r.seguiu, false);
  assert.strictEqual(r.res.statusCode, 403);
});

test('registrar: loopback-estrito proxificada ou de fora segue (só registra) — nada bloqueia em produção', () => {
  const eventos = [];
  const auth = criarAutenticacaoHttp({ modo: 'registrar', verificar: semCredencial, registrar: (e) => eventos.push(e) });
  assert.strictEqual(executar(auth, { method: 'POST', url: '/api/apresentacao/midia/importar', headers: { 'x-lyra-proxy': '1' } }).seguiu, true);
  assert.strictEqual(executar(auth, { method: 'POST', url: '/api/apresentacao/midia/importar', ip: '192.168.1.50' }).seguiu, true);
  assert.deepStrictEqual(eventos.map((e) => e.classe).sort(), ['nao-loopback', 'proxificada-em-rota-local']);
});

test('desligado: nada é feito', () => {
  const auth = criarAutenticacaoHttp({ modo: 'desligado', verificar: semCredencial });
  assert.strictEqual(executar(auth, { method: 'POST', url: '/api/apresentacao/midia/importar', ip: '8.8.8.8', headers: { 'x-lyra-proxy': '1' } }).seguiu, true);
});

test('impor: o corpo da recusa não vaza segredo nem a credencial recebida', () => {
  const auth = criarAutenticacaoHttp({ modo: 'impor', verificar: () => ({ ok: false, classe: 'secret-invalido' }) });
  const r = executar(auth, {
    method: 'POST',
    url: '/api/comando/audio_play',
    headers: { 'x-lyra-device': 'dispositivo-secreto-123', 'x-lyra-secret': 'SEGREDO-NAO-VAZAR' },
  });
  assert.strictEqual(r.res.statusCode, 401);
  assert.doesNotMatch(r.res.corpo, /SEGREDO-NAO-VAZAR|dispositivo-secreto-123/);
});
