'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarPedirAprovacaoPareamento } = require('./dialogoPareamento');

const pedido = { pairingId: 'p1', nome: 'PC do Louvor', ip: '192.168.0.20', codigo: '123-456' };
function montar(respostaDialogo) {
  const chamadas = [];
  const dialog = { showMessageBox: async (...a) => { chamadas.push(a); if (respostaDialogo instanceof Error) throw respostaDialogo; return respostaDialogo; } };
  const decisoes = [];
  const pareamento = { aprovar: (id) => decisoes.push(['aprovar', id]), negar: (id) => decisoes.push(['negar', id]) };
  return { pedir: criarPedirAprovacaoPareamento({ dialog }), chamadas, decisoes, pareamento };
}

test('«Aprovar» (botão 1) aprova; mostra nome, IP e o código de confirmação; padrão e Esc são «Negar»', async () => {
  const m = montar({ response: 1 });
  await m.pedir(pedido, m.pareamento);
  assert.deepEqual(m.decisoes, [['aprovar', 'p1']]);
  const o = m.chamadas[0][0];
  assert.deepEqual({ b: o.buttons, d: o.defaultId, c: o.cancelId }, { b: ['Negar', 'Aprovar'], d: 0, c: 0 });
  assert.match(o.message, /PC do Louvor/);
  assert.match(o.message, /192\.168\.0\.20/);
  assert.match(o.detail, /123-456/);
});

test('«Negar», fechar o diálogo ou erro do diálogo NEGAM (nunca aprovam por omissão)', async () => {
  for (const resp of [{ response: 0 }, undefined, null, {}, new Error('falhou')]) {
    const m = montar(resp);
    await m.pedir(pedido, m.pareamento);
    assert.deepEqual(m.decisoes, [['negar', 'p1']], String(resp));
  }
});

test('erro ao decidir (pedido já expirado) não propaga', async () => {
  const m = montar({ response: 1 });
  m.pareamento.aprovar = () => { throw new Error('expirado'); };
  await assert.doesNotReject(() => m.pedir(pedido, m.pareamento));
});
