'use strict';

/** Entrega 1 — token de sessão do controlador: ligado ao socket, curto, revogado ao desconectar. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarSessoesControlador } = require('./sessaoControlador');

function novo(extra = {}) {
  const r = { t: 1_000_000 };
  const s = criarSessoesControlador({ agora: () => r.t, validadeMs: 600000, ...extra });
  return { s, r };
}

test('emitir devolve token opaco e expiração; validar com o dispositivo certo resolve o socket', () => {
  const { s } = novo();
  const e = s.emitir({ socketId: 'S1', deviceId: 'dev-1' });
  assert.match(e.token, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(e.expiraEm, 1_600_000);
  const v = s.validar({ token: e.token, deviceId: 'dev-1' });
  assert.deepEqual({ ok: v.ok, socketId: v.socketId }, { ok: true, socketId: 'S1' });
});

test('o token NÃO substitui o dispositivo: deviceId diferente, ausente ou vazio é recusado', () => {
  const { s } = novo();
  const e = s.emitir({ socketId: 'S1', deviceId: 'dev-1' });
  assert.equal(s.validar({ token: e.token, deviceId: 'dev-2' }).motivo, 'dispositivo-diferente');
  assert.equal(s.validar({ token: e.token }).motivo, 'dispositivo-diferente');
  assert.equal(s.validar({ token: e.token, deviceId: '' }).motivo, 'dispositivo-diferente');
});

test('token ausente, desconhecido, malformado ou de outro tipo', () => {
  const { s } = novo();
  for (const token of [undefined, null, '', 'abc', 'x'.repeat(500), 123, {}, ['a']]) {
    assert.ok(['ausente', 'desconhecido'].includes(s.validar({ token, deviceId: 'dev-1' }).motivo), String(token).slice(0, 10));
  }
});

test('expira: depois da validade o token é recusado e removido', () => {
  const { s, r } = novo();
  const e = s.emitir({ socketId: 'S1', deviceId: 'dev-1' });
  r.t += 600_001;
  assert.equal(s.validar({ token: e.token, deviceId: 'dev-1' }).motivo, 'expirado');
  assert.equal(s.validar({ token: e.token, deviceId: 'dev-1' }).motivo, 'desconhecido');
  assert.equal(s.tamanho(), 0);
});

test('desconexão do socket revoga o token; perda de autorização do dispositivo revoga todos os dele', () => {
  const { s } = novo();
  const a = s.emitir({ socketId: 'S1', deviceId: 'dev-1' });
  const b = s.emitir({ socketId: 'S2', deviceId: 'dev-1' });
  const c = s.emitir({ socketId: 'S3', deviceId: 'dev-2' });
  assert.equal(s.revogarSocket('S1'), 1);
  assert.equal(s.validar({ token: a.token, deviceId: 'dev-1' }).motivo, 'desconhecido');
  assert.equal(s.validar({ token: b.token, deviceId: 'dev-1' }).ok, true);
  assert.equal(s.revogarDispositivo('dev-1'), 1);
  assert.equal(s.validar({ token: b.token, deviceId: 'dev-1' }).ok, false);
  assert.equal(s.validar({ token: c.token, deviceId: 'dev-2' }).ok, true, 'outro dispositivo não é afetado');
});

test('reemitir para o mesmo socket invalida o token anterior (um token por socket)', () => {
  const { s } = novo();
  const a = s.emitir({ socketId: 'S1', deviceId: 'dev-1' });
  const b = s.emitir({ socketId: 'S1', deviceId: 'dev-1' });
  assert.notEqual(a.token, b.token);
  assert.equal(s.validar({ token: a.token, deviceId: 'dev-1' }).ok, false);
  assert.equal(s.validar({ token: b.token, deviceId: 'dev-1' }).ok, true);
  assert.equal(s.tamanho(), 1);
});

test('tokens são distintos entre si e o armazenamento interno não guarda o token em claro', () => {
  const { s } = novo();
  const tokens = new Set();
  for (let i = 0; i < 50; i += 1) tokens.add(s.emitir({ socketId: `S${i}`, deviceId: 'dev-1' }).token);
  assert.equal(tokens.size, 50);
  const e = s.emitir({ socketId: 'SX', deviceId: 'dev-1' });
  assert.equal(JSON.stringify(s._diagnostico()).includes(e.token), false);
});

test('há teto de sessões: acima dele as mais antigas caem', () => {
  const { s } = novo({ maxSessoes: 3 });
  const t = [];
  for (let i = 0; i < 5; i += 1) t.push(s.emitir({ socketId: `S${i}`, deviceId: 'd' }).token);
  assert.equal(s.tamanho(), 3);
  assert.equal(s.validar({ token: t[0], deviceId: 'd' }).ok, false);
  assert.equal(s.validar({ token: t[4], deviceId: 'd' }).ok, true);
});

test('emitir sem socketId ou deviceId lança (nunca emite token anônimo)', () => {
  const { s } = novo();
  assert.throws(() => s.emitir({ socketId: '', deviceId: 'd' }));
  assert.throws(() => s.emitir({ socketId: 'S', deviceId: '' }));
  assert.throws(() => s.emitir());
});

/* ───────────────────────── resolverBastao: token → socket exato ───────────────────────── */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarControleAcesso } = require('./controleAcesso');
const { resolverBastao } = require('./sessaoControlador');

function mundo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-sess-'));
  const acesso = criarControleAcesso({ allowlistPath: () => path.join(dir, 'a.json'), emitParaSocket() {}, broadcast() {}, notificar() {} });
  acesso.autenticar({ deviceId: 'pc-1', secret: 's' });
  acesso.autenticar({ deviceId: 'pc-2', secret: 's' });
  acesso.registrarControlador('A', { deviceId: 'pc-1', nome: 'PC1 janela 1' }); // primário
  acesso.registrarControlador('B', { deviceId: 'pc-1', nome: 'PC1 janela 2' }); // mesmo dispositivo, secundário
  acesso.registrarControlador('C', { deviceId: 'pc-2', nome: 'PC2' });
  const r = { t: 1_000_000 };
  const sessoes = criarSessoesControlador({ agora: () => r.t });
  return { acesso, sessoes, r };
}

test('resolverBastao: SEM token, dois sockets do mesmo dispositivo continuam ambíguos', () => {
  const { acesso, sessoes } = mundo();
  const r = resolverBastao({ acesso, sessoes, deviceId: 'pc-1', autorizado: true });
  assert.deepEqual({ m: r.motivo, a: r.ambigua }, { m: 'ambiguo', a: true });
});

test('resolverBastao: COM token, a ambiguidade acaba — primário ok, secundário somente-leitura (exato)', () => {
  const { acesso, sessoes } = mundo();
  const tA = sessoes.emitir({ socketId: 'A', deviceId: 'pc-1' }).token;
  const tB = sessoes.emitir({ socketId: 'B', deviceId: 'pc-1' }).token;
  const a = resolverBastao({ acesso, sessoes, deviceId: 'pc-1', autorizado: true, sessao: tA });
  const b = resolverBastao({ acesso, sessoes, deviceId: 'pc-1', autorizado: true, sessao: tB });
  assert.deepEqual({ p: a.permitido, m: a.motivo, amb: a.ambigua, i: a.identificadoPor }, { p: true, m: 'ok', amb: false, i: 'token-sessao' });
  assert.deepEqual({ p: b.permitido, m: b.motivo, amb: b.ambigua, i: b.identificadoPor }, { p: false, m: 'somente-leitura', amb: false, i: 'token-sessao' });
});

test('resolverBastao: o token de OUTRO dispositivo, expirado ou revogado cai no caminho por dispositivo e registra por quê', () => {
  const { acesso, sessoes, r } = mundo();
  const tC = sessoes.emitir({ socketId: 'C', deviceId: 'pc-2' }).token;
  const x = resolverBastao({ acesso, sessoes, deviceId: 'pc-1', autorizado: true, sessao: tC });
  assert.deepEqual({ m: x.motivo, s: x.sessaoInvalida }, { m: 'ambiguo', s: 'dispositivo-diferente' });
  const tB = sessoes.emitir({ socketId: 'B', deviceId: 'pc-1' }).token;
  sessoes.revogarSocket('B'); // desconectou
  assert.equal(resolverBastao({ acesso, sessoes, deviceId: 'pc-1', autorizado: true, sessao: tB }).sessaoInvalida, 'desconhecido');
  const tA = sessoes.emitir({ socketId: 'A', deviceId: 'pc-1' }).token;
  r.t += 700_000;
  assert.equal(resolverBastao({ acesso, sessoes, deviceId: 'pc-1', autorizado: true, sessao: tA }).sessaoInvalida, 'expirado');
});

test('resolverBastao: o token NÃO autoriza — dispositivo não autorizado continua nao-autorizado', () => {
  const { acesso, sessoes } = mundo();
  const tA = sessoes.emitir({ socketId: 'A', deviceId: 'pc-1' }).token;
  const r = resolverBastao({ acesso, sessoes, deviceId: 'pc-1', autorizado: false, sessao: tA });
  assert.deepEqual({ p: r.permitido, m: r.motivo }, { p: false, m: 'nao-autorizado' });
});

test('resolverBastao: socket que deixou de estar registrado não vale, mesmo com token ainda válido', () => {
  const { acesso, sessoes } = mundo();
  const tB = sessoes.emitir({ socketId: 'B', deviceId: 'pc-1' }).token;
  acesso.removerControlador('B');
  const r = resolverBastao({ acesso, sessoes, deviceId: 'pc-1', autorizado: true, sessao: tB });
  assert.equal(r.sessaoInvalida, 'socket-nao-registrado');
  assert.equal(r.identificadoPor, undefined);
});
