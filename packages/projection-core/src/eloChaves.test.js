'use strict';

/** Entrega 1 — armazém de chaves do elo: persistência atômica, rotação, revogação e sigilo. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarArmazemChaves } = require('./eloChaves');

const arq = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-elo-')), 'elo.json');
const K = () => crypto.randomBytes(32);

test('idLocal é gerado uma vez, é estável e persiste entre instâncias', () => {
  const caminho = arq();
  const a = criarArmazemChaves({ caminho });
  const id = a.idLocal();
  assert.match(id, /^[A-Za-z0-9_-]{16,}$/);
  assert.equal(a.idLocal(), id);
  assert.equal(criarArmazemChaves({ caminho }).idLocal(), id);
});

test('adicionar/obter: devolve a chave como Buffer e persiste; o arquivo não vira legível por engano', () => {
  const caminho = arq();
  const a = criarArmazemChaves({ caminho });
  const chave = K();
  a.adicionar({ kid: 'k1', chave, origem: 'ctl', destino: 'srv', papel: 'servidor', base: 'http://192.168.0.5:5510' });
  const r = a.obter('k1');
  assert.ok(Buffer.isBuffer(r.chave) && r.chave.equals(chave));
  assert.deepEqual({ o: r.origem, d: r.destino, e: r.estado, p: r.papel }, { o: 'ctl', d: 'srv', e: 'ativa', p: 'servidor' });
  assert.ok(criarArmazemChaves({ caminho }).obter('k1').chave.equals(chave), 'sobrevive a reinício');
  assert.equal(a.obter('inexistente'), null);
});

test('listar NUNCA devolve a chave', () => {
  const a = criarArmazemChaves({ caminho: arq() });
  const chave = K();
  a.adicionar({ kid: 'k1', chave, origem: 'ctl', destino: 'srv', papel: 'servidor' });
  const txt = JSON.stringify(a.listar());
  assert.equal(txt.includes(chave.toString('base64')), false);
  assert.equal(txt.includes(chave.toString('hex')), false);
  assert.equal(a.listar().length, 1);
  assert.equal('chave' in a.listar()[0], false);
});

test('revogar: a chave deixa de valer; revogar inexistente devolve false; persiste', () => {
  const caminho = arq();
  const a = criarArmazemChaves({ caminho });
  a.adicionar({ kid: 'k1', chave: K(), origem: 'ctl', destino: 'srv', papel: 'servidor' });
  assert.equal(a.revogar('k1'), true);
  assert.equal(a.obter('k1').estado, 'revogada');
  assert.equal(a.revogar('nada'), false);
  assert.equal(criarArmazemChaves({ caminho }).obter('k1').estado, 'revogada');
});

test('rotacionar: nova chave ativa; a antiga vira «substituida» e expira após a graça', () => {
  let t = 1_000_000;
  const a = criarArmazemChaves({ caminho: arq(), agora: () => t });
  a.adicionar({ kid: 'velha', chave: K(), origem: 'ctl', destino: 'srv', papel: 'servidor' });
  const r = a.rotacionar('velha', { kid: 'nova', chave: K() }, { gracaMs: 60_000 });
  assert.equal(r, true);
  assert.equal(a.obter('nova').estado, 'ativa');
  assert.deepEqual({ e: a.obter('velha').estado, x: a.obter('velha').expiraEm, s: a.obter('velha').substituidaPor }, { e: 'substituida', x: 1_060_000, s: 'nova' });
  assert.equal(a.obter('nova').origem, 'ctl', 'a nova herda o par origem/destino');
  assert.equal(a.rotacionar('inexistente', { kid: 'x', chave: K() }), false);
  assert.equal(a.rotacionar('velha', { kid: 'nova2', chave: K() }), false, 'só rotaciona chave ativa');
});

test('ativaPara(base): devolve a chave ativa mais recente daquele destino; ignora revogadas e substituídas', () => {
  let t = 1;
  const a = criarArmazemChaves({ caminho: arq(), agora: () => t++ });
  a.adicionar({ kid: 'k1', chave: K(), origem: 'ctl', destino: 'srv', papel: 'controlador', base: 'http://10.0.0.5:5510' });
  a.adicionar({ kid: 'k2', chave: K(), origem: 'ctl', destino: 'srv', papel: 'controlador', base: 'http://10.0.0.5:5510' });
  a.adicionar({ kid: 'k3', chave: K(), origem: 'ctl', destino: 'outro', papel: 'controlador', base: 'http://10.0.0.9:5510' });
  assert.equal(a.ativaPara('http://10.0.0.5:5510').kid, 'k2');
  a.revogar('k2');
  assert.equal(a.ativaPara('http://10.0.0.5:5510').kid, 'k1');
  assert.equal(a.ativaPara('http://10.0.0.9:5510').kid, 'k3');
  assert.equal(a.ativaPara('http://10.0.0.77:5510'), null);
});

test('ativa mais recente para um papel (servidor): usado para assinar s→c', () => {
  let t = 1;
  const a = criarArmazemChaves({ caminho: arq(), agora: () => t++ });
  a.adicionar({ kid: 'k1', chave: K(), origem: 'ctl-1', destino: 'srv', papel: 'servidor' });
  a.adicionar({ kid: 'k2', chave: K(), origem: 'ctl-2', destino: 'srv', papel: 'servidor' });
  assert.equal(a.ativaDoPapel('servidor').kid, 'k2');
  assert.equal(a.ativaDoPapel('servidor', { origem: 'ctl-1' }).kid, 'k1');
  assert.equal(a.ativaDoPapel('controlador'), null);
});

test('kid duplicado é recusado e dados inválidos lançam', () => {
  const a = criarArmazemChaves({ caminho: arq() });
  a.adicionar({ kid: 'k1', chave: K(), origem: 'ctl', destino: 'srv', papel: 'servidor' });
  assert.throws(() => a.adicionar({ kid: 'k1', chave: K(), origem: 'ctl', destino: 'srv', papel: 'servidor' }));
  assert.throws(() => a.adicionar({ kid: 'k2', chave: Buffer.alloc(4), origem: 'ctl', destino: 'srv', papel: 'servidor' }));
  assert.throws(() => a.adicionar({ kid: 'ruim kid', chave: K(), origem: 'ctl', destino: 'srv', papel: 'servidor' }));
  assert.throws(() => a.adicionar({ kid: 'k3', chave: K(), origem: 'ctl', destino: 'srv', papel: 'x' }));
});

test('arquivo corrompido ou ausente: começa vazio sem lançar; escrita é atômica (sem .tmp sobrando)', () => {
  const caminho = arq();
  fs.writeFileSync(caminho, '{isso não é json');
  const a = criarArmazemChaves({ caminho });
  assert.equal(a.listar().length, 0);
  a.adicionar({ kid: 'k1', chave: K(), origem: 'ctl', destino: 'srv', papel: 'servidor' });
  assert.equal(fs.existsSync(`${caminho}.tmp`), false);
  assert.equal(JSON.parse(fs.readFileSync(caminho, 'utf8')).versao, 1);
});

test('sem caminho: opera só em memória', () => {
  const a = criarArmazemChaves({ caminho: null });
  a.adicionar({ kid: 'k1', chave: K(), origem: 'ctl', destino: 'srv', papel: 'servidor' });
  assert.equal(a.obter('k1').estado, 'ativa');
});
