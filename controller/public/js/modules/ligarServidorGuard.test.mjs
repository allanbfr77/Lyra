import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  deveAbortarLigacaoIpLocalSemServidor,
  executarTentativaLigacaoComGuard,
} from './ligarServidorGuard.js';

function efeitosVazios() {
  return {
    alertas: [],
    sockets: 0,
    badges: [],
    alertFn(msg) { this.alertas.push(msg); },
    iniciarSocket() { this.sockets += 1; },
    setBadge(estado) { this.badges.push(estado); },
  };
}

test('IP local sem Servidor: aborta em silêncio (sem alert, sem Socket.IO, sem badge)', async () => {
  for (const papel of ['controller-local', null, undefined, 'outro']) {
    const fx = efeitosVazios();
    const r = await executarTentativaLigacaoComGuard({
      ehLocal: true,
      consultarPapel: async () => papel,
      iniciarSocket: () => fx.iniciarSocket(),
      setBadge: (e) => fx.setBadge(e),
      alertFn: (m) => fx.alertFn(m),
    });
    assert.equal(r.abortado, true, `papel=${papel}`);
    assert.equal(r.motivo, 'ip-local-sem-servidor');
    assert.deepEqual(fx.alertas, [], 'nenhum alerta');
    assert.equal(fx.sockets, 0, 'Socket.IO não inicia');
    assert.deepEqual(fx.badges, [], 'badge não muda');
  }
});

test('auto-reconnect repetido no IP local sem Servidor continua silencioso', async () => {
  const fx = efeitosVazios();
  for (let i = 0; i < 5; i++) {
    await executarTentativaLigacaoComGuard({
      ehLocal: true,
      consultarPapel: async () => 'controller-local',
      iniciarSocket: () => fx.iniciarSocket(),
      setBadge: (e) => fx.setBadge(e),
      alertFn: (m) => fx.alertFn(m),
    });
  }
  assert.deepEqual(fx.alertas, []);
  assert.equal(fx.sockets, 0);
  assert.deepEqual(fx.badges, []);
});

test('IP de outro PC: ligação segue normalmente (mesmo sem prova de role server)', async () => {
  for (const papel of [null, 'controller-local', 'server']) {
    const fx = efeitosVazios();
    const r = await executarTentativaLigacaoComGuard({
      ehLocal: false,
      consultarPapel: async () => papel,
      iniciarSocket: () => fx.iniciarSocket(),
      setBadge: (e) => fx.setBadge(e),
      alertFn: (m) => fx.alertFn(m),
    });
    assert.equal(r.abortado, false, `papel remoto=${papel}`);
    assert.deepEqual(fx.alertas, []);
    assert.equal(fx.sockets, 1);
    assert.deepEqual(fx.badges, ['conectando']);
  }
});

test('IP local com Servidor ativo (role server): conexão permitida', async () => {
  const fx = efeitosVazios();
  const r = await executarTentativaLigacaoComGuard({
    ehLocal: true,
    consultarPapel: async () => 'server',
    iniciarSocket: () => fx.iniciarSocket(),
    setBadge: (e) => fx.setBadge(e),
    alertFn: (m) => fx.alertFn(m),
  });
  assert.equal(r.abortado, false);
  assert.deepEqual(fx.alertas, []);
  assert.equal(fx.sockets, 1);
  assert.deepEqual(fx.badges, ['conectando']);
});

test('matriz da decisão pura', () => {
  assert.equal(deveAbortarLigacaoIpLocalSemServidor(true, 'server'), false);
  assert.equal(deveAbortarLigacaoIpLocalSemServidor(true, 'controller-local'), true);
  assert.equal(deveAbortarLigacaoIpLocalSemServidor(true, null), true);
  assert.equal(deveAbortarLigacaoIpLocalSemServidor(false, null), false);
  assert.equal(deveAbortarLigacaoIpLocalSemServidor(false, 'controller-local'), false);
  assert.equal(deveAbortarLigacaoIpLocalSemServidor(false, 'server'), false);
});

test('Servidor real na 5510 responde role=server e o guard permite', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/identity') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ role: 'server' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/identity`, { cache: 'no-store' });
    assert.equal(r.ok, true);
    const papel = (await r.json())?.role || null;
    assert.equal(papel, 'server');

    const fx = efeitosVazios();
    const out = await executarTentativaLigacaoComGuard({
      ehLocal: true,
      consultarPapel: async () => papel,
      iniciarSocket: () => fx.iniciarSocket(),
      setBadge: (e) => fx.setBadge(e),
      alertFn: (m) => fx.alertFn(m),
    });
    assert.equal(out.abortado, false);
    assert.equal(fx.sockets, 1);
    assert.deepEqual(fx.alertas, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('host controller-local na 5510: guard aborta sem efeitos', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/identity') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ role: 'controller-local' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/identity`, { cache: 'no-store' });
    const papel = (await r.json())?.role || null;
    assert.equal(papel, 'controller-local');

    const fx = efeitosVazios();
    const out = await executarTentativaLigacaoComGuard({
      ehLocal: true,
      consultarPapel: async () => papel,
      iniciarSocket: () => fx.iniciarSocket(),
      setBadge: (e) => fx.setBadge(e),
      alertFn: (m) => fx.alertFn(m),
    });
    assert.equal(out.abortado, true);
    assert.equal(fx.sockets, 0);
    assert.deepEqual(fx.alertas, []);
    assert.deepEqual(fx.badges, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
