'use strict';

/**
 * Entrega 1 — elo interprocessos (`X-Lyra-Via`): assinatura HMAC com timestamp, nonce e amarração
 * a origem, destino, direção, método, caminho (com query) e corpo.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const elo = require('./eloInterprocessos');

const CHAVE = crypto.randomBytes(32);
const OUTRA = crypto.randomBytes(32);
const KID = 'kid-teste-1';
const T0 = 1_700_000_000_000;

function registro(extra = {}) {
  return { chave: CHAVE, origem: 'ctl-A', destino: 'srv-B', estado: 'ativa', expiraEm: null, ...extra };
}
function montar({ chaves = { [KID]: registro() }, agora = () => T0, toleranciaMs } = {}) {
  const verificador = elo.criarVerificadorElo({ obterChave: (kid) => chaves[kid] || null, agora, ...(toleranciaMs ? { toleranciaMs } : {}) });
  return { verificador, chaves };
}
function assinar(extra = {}) {
  return elo.assinar({
    kid: KID, chave: CHAVE, direcao: 'c→s', origem: 'ctl-A', destino: 'srv-B',
    metodo: 'PUT', caminho: '/api/display-config?x=1', corpo: Buffer.from('{"a":1}'), agora: () => T0, ...extra,
  });
}
const ver = (verificador, valor, extra = {}) => verificador.verificar({
  valor, direcaoEsperada: 'c→s', metodo: 'PUT', caminho: '/api/display-config?x=1', corpo: Buffer.from('{"a":1}'), ...extra,
});

test('assinatura válida é aceita e devolve kid, origem e destino', () => {
  const { verificador } = montar();
  const r = ver(verificador, assinar());
  assert.deepEqual({ ok: r.ok, kid: r.kid, origem: r.origem, destino: r.destino }, { ok: true, kid: KID, origem: 'ctl-A', destino: 'srv-B' });
});

test('assinatura adulterada, chave errada e kid desconhecido são recusados', () => {
  const { verificador } = montar();
  const bom = assinar();
  const adulterada = bom.replace(/sig=.{4}/, 'sig=AAAA');
  assert.equal(ver(verificador, adulterada).motivo, 'assinatura');
  assert.equal(ver(verificador, assinar({ chave: OUTRA })).motivo, 'assinatura');
  assert.equal(ver(verificador, assinar({ kid: 'desconhecido' })).motivo, 'chave-desconhecida');
});

test('repetida (replay) é recusada; a primeira vez vale, a segunda não', () => {
  const { verificador } = montar();
  const v = assinar();
  assert.equal(ver(verificador, v).ok, true);
  assert.equal(ver(verificador, v).motivo, 'repetida');
  assert.equal(ver(verificador, assinar()).ok, true, 'nonce novo, mesma requisição: aceita');
});

test('expirada (timestamp antigo) e relógio adiantado (futuro) fora da tolerância', () => {
  const { verificador } = montar({ agora: () => T0 + 60_000, toleranciaMs: 30_000 });
  assert.equal(ver(verificador, assinar()).motivo, 'expirada');
  const { verificador: v2 } = montar({ agora: () => T0 - 60_000, toleranciaMs: 30_000 });
  assert.equal(ver(v2, assinar()).motivo, 'relogio');
  const { verificador: v3 } = montar({ agora: () => T0 + 29_000, toleranciaMs: 30_000 });
  assert.equal(ver(v3, assinar()).ok, true, 'dentro da tolerância');
});

test('direção incorreta, rota trocada, método trocado, query trocada e corpo alterado', () => {
  const { verificador } = montar();
  assert.equal(ver(verificador, assinar({ direcao: 's→c' })).motivo, 'direcao');
  assert.equal(ver(verificador, assinar({ caminho: '/api/display-routing' })).motivo, 'assinatura');
  assert.equal(ver(verificador, assinar({ metodo: 'POST' })).motivo, 'assinatura');
  assert.equal(ver(verificador, assinar({ caminho: '/api/display-config?x=2' })).motivo, 'assinatura');
  assert.equal(ver(verificador, assinar({ corpo: Buffer.from('{"a":2}') })).motivo, 'assinatura');
  assert.equal(ver(verificador, assinar({ corpo: Buffer.alloc(0) })).motivo, 'assinatura');
});

test('origem/destino fazem parte da assinatura: outro par de ids não valida', () => {
  const { verificador } = montar();
  assert.equal(ver(verificador, assinar({ origem: 'ctl-X' })).motivo, 'assinatura');
  assert.equal(ver(verificador, assinar({ destino: 'srv-Z' })).motivo, 'assinatura');
});

test('assinar para um sentido e verificar no outro falha mesmo com a mesma chave (s→c ≠ c→s)', () => {
  const { verificador } = montar();
  const v = assinar({ direcao: 's→c' });
  assert.equal(verificador.verificar({ valor: v, direcaoEsperada: 's→c', metodo: 'PUT', caminho: '/api/display-config?x=1', corpo: Buffer.from('{"a":1}') }).ok, true);
  assert.equal(ver(verificador, assinar({ direcao: 's→c' })).motivo, 'direcao');
});

test('chave revogada e chave expirada são recusadas; chave substituída vale até expirar', () => {
  assert.equal(ver(montar({ chaves: { [KID]: registro({ estado: 'revogada' }) } }).verificador, assinar()).motivo, 'chave-revogada');
  assert.equal(ver(montar({ chaves: { [KID]: registro({ estado: 'substituida', expiraEm: T0 - 1 }) } }).verificador, assinar()).motivo, 'chave-expirada');
  assert.equal(ver(montar({ chaves: { [KID]: registro({ estado: 'substituida', expiraEm: T0 + 60_000 }) } }).verificador, assinar()).ok, true);
});

test('cabeçalho ausente, malformado, de versão desconhecida ou gigante não derruba', () => {
  const { verificador } = montar();
  for (const [valor, motivo] of [
    [undefined, 'ausente'], ['', 'ausente'], ['lixo', 'malformado'], [`v2;${assinar().slice(3)}`, 'versao'],
    [`${assinar()};extra=${'x'.repeat(2000)}`, 'malformado'], [123, 'ausente'], [['a', 'b'], 'ausente'],
  ]) assert.equal(ver(verificador, valor).motivo, motivo, String(valor).slice(0, 30));
});

test('o verificador não grava nonce de assinaturas inválidas (sem inflar a memória com lixo)', () => {
  const { verificador } = montar();
  for (let i = 0; i < 50; i += 1) ver(verificador, assinar({ chave: OUTRA }));
  assert.equal(verificador.tamanhoCacheNonces(), 0);
  ver(verificador, assinar());
  assert.equal(verificador.tamanhoCacheNonces(), 1);
});

test('o cache de nonces tem teto e descarta os mais antigos', () => {
  const verificador = elo.criarVerificadorElo({ obterChave: () => registro(), agora: () => T0, maxNonces: 5 });
  for (let i = 0; i < 20; i += 1) verificador.verificar({ valor: assinar(), direcaoEsperada: 'c→s', metodo: 'PUT', caminho: '/api/display-config?x=1', corpo: Buffer.from('{"a":1}') });
  assert.ok(verificador.tamanhoCacheNonces() <= 5);
});

test('o valor assinado nunca contém a chave nem o corpo', () => {
  const v = assinar({ corpo: Buffer.from('SEGREDO-NO-CORPO') });
  assert.equal(v.includes(CHAVE.toString('base64')), false);
  assert.equal(v.includes('SEGREDO-NO-CORPO'), false);
  assert.ok(v.length < 400);
});

test('hashCorpo aceita Buffer, string e vazio de forma consistente', () => {
  assert.equal(elo.hashCorpo(Buffer.from('abc')), elo.hashCorpo('abc'));
  assert.equal(elo.hashCorpo(undefined), elo.hashCorpo(Buffer.alloc(0)));
  assert.equal(elo.hashCorpo(null), elo.hashCorpo(''));
});
