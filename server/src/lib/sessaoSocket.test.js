'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sessaoControlador } = require('@lyra/projection-core');
const { criarEmissorSessao } = require('./sessaoSocket');

function montar() {
  const r = { t: 1_000_000 };
  const sessoes = sessaoControlador.criarSessoesControlador({ agora: () => r.t, validadeMs: 600000 });
  const timers = [];
  const emissor = criarEmissorSessao({ sessoes, agora: () => r.t, agendar: (fn, ms) => { const t = { fn, ms, cancelado: false }; timers.push(t); return t; }, cancelar: (t) => { t.cancelado = true; } });
  const socket = (id, autorizado = true, deviceId = 'dev-1') => {
    const emitidos = [];
    return { id, data: { autorizado, device: deviceId ? { deviceId } : null }, emit: (e, d) => emitidos.push([e, d]), emitidos };
  };
  return { r, sessoes, emissor, timers, socket };
}

test('socket autorizado recebe o token pelo próprio socket e ele valida com o mesmo dispositivo', () => {
  const m = montar();
  const s = m.socket('S1');
  assert.equal(m.emissor.emitir(s), true);
  assert.equal(s.emitidos[0][0], 'sessao_controlador');
  const { token, expiraEm } = s.emitidos[0][1];
  assert.equal(expiraEm, 1_600_000);
  assert.deepEqual(m.sessoes.validar({ token, deviceId: 'dev-1' }), { ok: true, socketId: 'S1', deviceId: 'dev-1' });
});

test('socket não autorizado ou sem dispositivo NÃO recebe token (nada é emitido)', () => {
  const m = montar();
  for (const s of [m.socket('A', false), m.socket('B', true, null), { id: 'C', data: {}, emit() { throw new Error('não deveria emitir'); } }]) {
    assert.equal(m.emissor.emitir(s), false);
  }
  assert.equal(m.sessoes.tamanho(), 0);
});

test('renova a 70% da validade: o token novo vale e o anterior deixa de valer', () => {
  const m = montar();
  const s = m.socket('S1');
  m.emissor.emitir(s);
  assert.equal(m.timers[0].ms, 420000, '70% de 600000');
  const antigo = s.emitidos[0][1].token;
  m.r.t += 420000;
  m.timers[0].fn();
  const novo = s.emitidos[1][1].token;
  assert.notEqual(novo, antigo);
  assert.equal(m.sessoes.validar({ token: antigo, deviceId: 'dev-1' }).ok, false);
  assert.equal(m.sessoes.validar({ token: novo, deviceId: 'dev-1' }).ok, true);
  assert.equal(m.timers[0].cancelado, true, 'o timer anterior foi cancelado');
  assert.equal(m.emissor.pendentes(), 1);
});

test('desconexão: revoga o token, cancela a renovação e outros sockets seguem valendo', () => {
  const m = montar();
  const a = m.socket('S1');
  const b = m.socket('S2');
  m.emissor.emitir(a);
  m.emissor.emitir(b);
  m.emissor.encerrar('S1');
  assert.equal(m.sessoes.validar({ token: a.emitidos[0][1].token, deviceId: 'dev-1' }).ok, false);
  assert.equal(m.sessoes.validar({ token: b.emitidos[0][1].token, deviceId: 'dev-1' }).ok, true);
  assert.equal(m.emissor.pendentes(), 1);
  m.emissor.encerrar('S1'); // idempotente
});

test('erro ao emitir é registrado e não propaga', () => {
  const erros = [];
  const sessoes = { emitir: () => { throw new Error('x'); }, revogarSocket: () => { throw new Error('y'); } };
  const e = criarEmissorSessao({ sessoes, logError: (c) => erros.push(c) });
  assert.equal(e.emitir({ id: 'S', data: { autorizado: true, device: { deviceId: 'd' } }, emit() {} }), false);
  assert.doesNotThrow(() => e.encerrar('S'));
  assert.deepEqual(erros, ['sessao-controlador', 'sessao-controlador-revogar']);
});
