'use strict';

/**
 * E1.3 Fase B (W) — prova de PROPRIEDADE da porta 5510.
 *
 * Loopback, `localhost`, porta 5510 e «mesmo computador» NÃO provam que quem responde é o motor
 * local deste processo. A prova é: abrir uma conexão a 127.0.0.1:<porta> e ver o NOSSO objeto
 * `http.Server` receber essa mesma conexão (mesma porta de origem). Outro processo — um Servidor
 * separado, ou alguém que ocupe o endereço específico — não faz o nosso servidor emitir nada.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');

const { criarProvaPropriedade } = require('./provaPropriedade');

function escutar(servidor, porta, host) {
  return new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(porta, host, () => {
      servidor.removeListener('error', reject);
      resolve(servidor.address().port);
    });
  });
}
const fechar = (s) => new Promise((r) => (s && s.listening ? s.close(() => r()) : r()));

test('servidor próprio escutando na porta → comprovado', async () => {
  const s = http.createServer();
  const porta = await escutar(s, 0, '0.0.0.0');
  try {
    const p = criarProvaPropriedade({ obterServidor: () => s, porta });
    assert.equal(await p.provar(), true);
  } finally { await fechar(s); }
});

test('sem servidor, servidor parado ou fechado → não comprovado', async () => {
  const p0 = criarProvaPropriedade({ obterServidor: () => null, porta: 5510 });
  assert.equal(await p0.provar(), false);
  const s = http.createServer();
  const p1 = criarProvaPropriedade({ obterServidor: () => s, porta: 5510 });
  assert.equal(await p1.provar(), false, 'nunca escutou');
  const porta = await escutar(s, 0, '0.0.0.0');
  const p2 = criarProvaPropriedade({ obterServidor: () => s, porta, ttlMs: 0 });
  assert.equal(await p2.provar(), true);
  await fechar(s);
  assert.equal(await p2.provar(), false, 'depois de fechar');
});

test('o nosso servidor escuta em OUTRA porta → não comprovado para a porta pedida', async () => {
  const s = http.createServer();
  const outra = await escutar(s, 0, '0.0.0.0');
  try {
    const p = criarProvaPropriedade({ obterServidor: () => s, porta: outra === 65000 ? 64999 : outra + 1 });
    assert.equal(await p.provar(), false);
  } finally { await fechar(s); }
});

test('outro processo/servidor separado ocupando a porta: o nosso servidor não vê a conexão → não comprovado', async () => {
  // «Servidor separado»: um servidor que NÃO é o objeto que o processo possui, na porta de teste.
  const separado = http.createServer();
  const porta = await escutar(separado, 0, '127.0.0.1');
  // O processo acredita ter um servidor (nunca recebeu a conexão): escuta noutra porta.
  const nosso = http.createServer();
  await escutar(nosso, 0, '0.0.0.0');
  try {
    // Mesmo "dizendo" a porta do separado, a conexão não passa pelo nosso objeto.
    nosso.address = () => ({ address: '0.0.0.0', family: 'IPv4', port: porta });
    const p = criarProvaPropriedade({ obterServidor: () => nosso, porta, timeoutMs: 250 });
    assert.equal(await p.provar(), false);
  } finally { await fechar(separado); await fechar(nosso); }
});

test('endereço específico ocupado por outro dono enquanto o nosso escuta em 0.0.0.0 (caso do Windows)', async (t) => {
  const nosso = http.createServer();
  const porta = await escutar(nosso, 0, '0.0.0.0');
  const intruso = http.createServer();
  try {
    try {
      await escutar(intruso, porta, '127.0.0.1');
    } catch (e) {
      t.skip(`o SO não permite o bind específico (${e.code}); o cenário só existe onde o SO permite`);
      return;
    }
    const p = criarProvaPropriedade({ obterServidor: () => nosso, porta, timeoutMs: 250 });
    assert.equal(await p.provar(), false, '127.0.0.1:porta agora pertence ao intruso');
  } finally { await fechar(intruso); await fechar(nosso); }
});

test('reinício do motor: novo objeto servidor na mesma porta é re-provado (o cache não atravessa servidores)', async () => {
  let atual = http.createServer();
  const porta = await escutar(atual, 0, '0.0.0.0');
  const p = criarProvaPropriedade({ obterServidor: () => atual, porta, ttlMs: 60000 });
  assert.equal(await p.provar(), true);
  await fechar(atual);
  // nenhum motor ativo: mesmo com cache de 60 s, o servidor sumiu
  const antigo = atual;
  atual = null;
  assert.equal(await p.provar(), false);
  // novo motor na mesma porta
  atual = http.createServer();
  await escutar(atual, porta, '0.0.0.0');
  assert.notEqual(atual, antigo);
  assert.equal(await p.provar(), true);
  await fechar(atual);
});

test('cache curto: não sonda a cada chamada; invalidar() força nova sonda', async () => {
  const s = http.createServer();
  const porta = await escutar(s, 0, '0.0.0.0');
  let conexoes = 0;
  s.on('connection', () => { conexoes += 1; });
  let agora = 1000;
  const p = criarProvaPropriedade({ obterServidor: () => s, porta, ttlMs: 1000, agora: () => agora });
  try {
    await p.provar(); await p.provar(); await p.provar();
    assert.equal(conexoes, 1);
    agora += 1500;
    await p.provar();
    assert.equal(conexoes, 2);
    p.invalidar();
    await p.provar();
    assert.equal(conexoes, 3);
  } finally { await fechar(s); }
});

test('chamadas simultâneas compartilham a mesma sonda e a sonda não deixa conexões abertas', async () => {
  const s = http.createServer();
  const porta = await escutar(s, 0, '0.0.0.0');
  let conexoes = 0;
  s.on('connection', () => { conexoes += 1; });
  const p = criarProvaPropriedade({ obterServidor: () => s, porta, ttlMs: 0 });
  try {
    const r = await Promise.all([p.provar(), p.provar(), p.provar()]);
    assert.deepEqual(r, [true, true, true]);
    assert.equal(conexoes, 1);
    await new Promise((res) => setTimeout(res, 100));
    const abertas = await new Promise((res) => s.getConnections((e, n) => res(n)));
    assert.equal(abertas, 0);
  } finally { await fechar(s); }
});

test('erro inesperado na sonda → não comprovado (falha fechada)', async () => {
  const s = http.createServer();
  const porta = await escutar(s, 0, '0.0.0.0');
  try {
    const p = criarProvaPropriedade({ obterServidor: () => s, porta, conectar: () => { throw new Error('boom'); } });
    assert.equal(await p.provar(), false);
    const p2 = criarProvaPropriedade({ obterServidor: () => { throw new Error('boom'); }, porta });
    assert.equal(await p2.provar(), false);
  } finally { await fechar(s); }
});

void net;
