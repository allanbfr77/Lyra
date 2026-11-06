'use strict';

/**
 * E1.3 Fase B — salto 3001 → 5510 (`PUT /api/display-config`).
 *
 * Quando a 3001 repassa a chamada ao Servidor, ela deve levar a credencial que o CLIENTE
 * mandou (nada de autenticação interna improvisada), só para servidores do Lyra (rede
 * privada/loopback), nunca para hosts externos, e sem cookies/Origin/Authorization.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { proxyJsonToProjection, credenciaisDoRequest, cabecalhosParaProjecao } = require('./proxyProjecaoJson');

function servidorFalso() {
  const recebidos = [];
  const srv = http.createServer((req, res) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => {
      recebidos.push({ method: req.method, url: req.url, headers: req.headers, corpo: Buffer.concat(partes).toString() });
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":true}');
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, recebidos, base: new URL(`http://127.0.0.1:${srv.address().port}`) })));
}

test('credenciaisDoRequest lê só os cabeçalhos X-Lyra-*, saneados e limitados', () => {
  const c = credenciaisDoRequest({ headers: { 'x-lyra-device': ' dev-1 ', 'x-lyra-secret': 'seg', 'x-lyra-app': '1.2.3', cookie: 'a=b', authorization: 'Bearer x' } });
  assert.deepStrictEqual(c, { deviceId: 'dev-1', secret: 'seg', app: '1.2.3' });
  assert.deepStrictEqual(credenciaisDoRequest({ headers: {} }), { deviceId: '', secret: '', app: '' });
  assert.deepStrictEqual(credenciaisDoRequest({}), { deviceId: '', secret: '', app: '' });
  assert.strictEqual(credenciaisDoRequest({ headers: { 'x-lyra-device': 'a'.repeat(1000), 'x-lyra-secret': 's' } }).deviceId.length, 256);
  assert.strictEqual(credenciaisDoRequest({ headers: { 'x-lyra-device': 'a\r\nX: 1', 'x-lyra-secret': 's' } }).deviceId, '');
});

test('o salto leva a credencial do cliente ao Servidor (rede privada/loopback)', async () => {
  const { srv, recebidos, base } = await servidorFalso();
  try {
    const r = await proxyJsonToProjection('PUT', '/api/display-config', { a: 1 }, { deviceId: 'dev-1', secret: 'seg-1', app: '1.0.0' }, { base });
    assert.strictEqual(r.status, 200);
    const h = recebidos[0].headers;
    assert.strictEqual(recebidos[0].method, 'PUT');
    assert.strictEqual(recebidos[0].corpo, '{"a":1}');
    assert.strictEqual(h['x-lyra-device'], 'dev-1');
    assert.strictEqual(h['x-lyra-secret'], 'seg-1');
    assert.strictEqual(h['x-lyra-app'], '1.0.0');
    assert.strictEqual(h['content-type'], 'application/json');
    assert.strictEqual(h['x-lyra-proxy'], undefined, 'não é o proxy 5510→3001; não se marca como tal');
    assert.ok(!recebidos[0].url.includes('seg-1'), 'credencial nunca na URL');
  } finally { srv.close(); }
});

test('sem credencial do cliente, nada é inventado: o salto vai sem X-Lyra-*', async () => {
  const { srv, recebidos, base } = await servidorFalso();
  try {
    await proxyJsonToProjection('PUT', '/api/display-config', {}, undefined, { base });
    await proxyJsonToProjection('PUT', '/api/display-config', {}, { deviceId: 'so-id', secret: '', app: '' }, { base });
    for (const rec of recebidos) {
      assert.strictEqual(rec.headers['x-lyra-device'], undefined);
      assert.strictEqual(rec.headers['x-lyra-secret'], undefined);
    }
  } finally { srv.close(); }
});

test('cabecalhosParaProjecao: credencial só para destinos do Lyra; hosts externos nunca recebem', () => {
  const cred = { deviceId: 'dev-1', secret: 'seg', app: '1' };
  for (const alvo of ['http://127.0.0.1:5510', 'http://localhost:5510', 'http://192.168.1.10:5510', 'http://10.0.0.5:5510', 'http://172.16.3.4:5510', 'http://[::1]:5510', 'http://meu-pc:5510', 'http://pc-igreja.local:5510']) {
    const h = cabecalhosParaProjecao(cred, new URL(alvo), 2);
    assert.strictEqual(h['X-Lyra-Device'], 'dev-1', alvo);
    assert.strictEqual(h['X-Lyra-Secret'], 'seg', alvo);
  }
  for (const alvo of ['https://exemplo.com', 'http://8.8.8.8:5510', 'https://lyra.onrender.com', 'http://172.32.0.1:5510', 'http://192.169.1.1:5510', 'http://exemplo.com.br:5510']) {
    const h = cabecalhosParaProjecao(cred, new URL(alvo), 2);
    assert.strictEqual(h['X-Lyra-Device'], undefined, alvo);
    assert.strictEqual(h['X-Lyra-Secret'], undefined, alvo);
    assert.strictEqual(h['X-Lyra-App'], undefined, alvo);
  }
});

test('o salto nunca encaminha Cookie/Origin/Authorization (só o que cabecalhosParaProjecao monta)', () => {
  const h = cabecalhosParaProjecao({ deviceId: 'd', secret: 's', app: '' }, new URL('http://127.0.0.1:5510'), 10);
  const nomes = Object.keys(h).map((k) => k.toLowerCase()).sort();
  assert.deepStrictEqual(nomes, ['content-length', 'content-type', 'x-lyra-device', 'x-lyra-secret']);
});
