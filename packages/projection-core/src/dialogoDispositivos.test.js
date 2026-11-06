'use strict';

/** Entrega 2 — diálogos do operador para inscrição/aprovação de dispositivos (dialog injetado). */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarControleAcesso } = require('./controleAcesso');
const { criarDialogosDispositivos } = require('./dialogoDispositivos');

function mundo(respostas = [], { relogio = { t: 1_000_000 }, cooldownMs } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-dlg-'));
  const acesso = criarControleAcesso({
    allowlistPath: () => path.join(dir, 'a.json'), revogadosPath: () => path.join(dir, 'r.json'), emitParaSocket() {}, broadcast() {}, notificar() {}, agora: () => relogio.t,
  });
  const chamadas = [];
  const dialog = {
    showMessageBox: async (...a) => {
      const o = a[a.length - 1];
      chamadas.push(o);
      const r = respostas.shift();
      return typeof r === 'function' ? r(o) : r || { response: 0 };
    },
  };
  const d = criarDialogosDispositivos({ acesso, dialog, agora: () => relogio.t, ...(cooldownMs ? { cooldownMs } : {}) });
  return { acesso, d, chamadas, relogio };
}
const pendente = (acesso, id, nome = `PC ${id}`) => acesso.autenticar({ deviceId: id, secret: 's', nome });

test('novo dispositivo pendente: o diálogo pergunta; «Autorizar» aprova, «Negar» (padrão) nega', async () => {
  const m = mundo([{ response: 1 }, { response: 0 }]);
  pendente(m.acesso, 'aaaaaaaa-1111');
  await m.d.aoPendente({ deviceId: 'aaaaaaaa-1111', nome: 'Celular da Ana' });
  assert.equal(m.acesso.autenticar({ deviceId: 'aaaaaaaa-1111', secret: 's' }).ok, true);
  const o = m.chamadas[0];
  assert.deepEqual({ b: o.buttons, d: o.defaultId, c: o.cancelId }, { b: ['Negar', 'Autorizar'], d: 0, c: 0 });
  assert.match(o.message, /Celular da Ana/);
  assert.match(o.detail, /aaaaaaaa/);

  pendente(m.acesso, 'bbbbbbbb-2222');
  await m.d.aoPendente({ deviceId: 'bbbbbbbb-2222', nome: 'Estranho' });
  assert.equal(m.acesso.listarPendentes().length, 0, 'negado: sai da lista');
  assert.equal(m.acesso.autenticar({ deviceId: 'bbbbbbbb-2222', secret: 's' }).ok, false);
});

test('fechar o diálogo, erro no diálogo ou resposta estranha NEGAM (nunca autorizam por omissão)', async () => {
  for (const resp of [undefined, null, {}, () => { throw new Error('x'); }]) {
    const m = mundo([resp]);
    pendente(m.acesso, 'cccccccc-3333');
    await m.d.aoPendente({ deviceId: 'cccccccc-3333', nome: 'X' });
    assert.equal(m.acesso.autenticar({ deviceId: 'cccccccc-3333', secret: 's' }).ok, false, String(resp));
  }
});

test('sem inundar: o mesmo dispositivo não gera outro diálogo enquanto o primeiro está aberto nem durante o cooldown', async () => {
  let liberar;
  const m = mundo([() => new Promise((r) => { liberar = r; })], { cooldownMs: 600_000 });
  pendente(m.acesso, 'dddddddd-4444');
  const p1 = m.d.aoPendente({ deviceId: 'dddddddd-4444', nome: 'X' });
  await m.d.aoPendente({ deviceId: 'dddddddd-4444', nome: 'X' }); // ignorado: já há um aberto
  liberar({ response: 0 });
  await p1;
  assert.equal(m.chamadas.length, 1);
  pendente(m.acesso, 'dddddddd-4444');
  await m.d.aoPendente({ deviceId: 'dddddddd-4444', nome: 'X' }); // negado há pouco: não pergunta de novo
  assert.equal(m.chamadas.length, 1);
  m.relogio.t += 600_001;
  m.chamadas.length = 0;
  const m2 = m; // passou o cooldown: pergunta de novo
  m2.chamadas.length = 0;
  await m.d.aoPendente({ deviceId: 'dddddddd-4444', nome: 'X' });
  assert.equal(m.chamadas.length, 1);
});

test('diálogos de vários dispositivos são mostrados um de cada vez (fila)', async () => {
  const ordem = [];
  let abertos = 0;
  let max = 0;
  const m = mundo([]);
  m.chamadas.length = 0;
  const dialog = { showMessageBox: async (o) => { abertos += 1; max = Math.max(max, abertos); ordem.push(o.message); await new Promise((r) => setTimeout(r, 5)); abertos -= 1; return { response: 0 }; } };
  const d = criarDialogosDispositivos({ acesso: m.acesso, dialog });
  for (const id of ['e1111111', 'e2222222', 'e3333333']) pendente(m.acesso, id);
  await Promise.all(['e1111111', 'e2222222', 'e3333333'].map((id) => d.aoPendente({ deviceId: id, nome: id })));
  assert.equal(max, 1);
  assert.equal(ordem.length, 3);
});

test('abrirJanela: informa a hora de fim; modo travado explica o motivo; fecharJanela fecha', async () => {
  const m = mundo([{ response: 0 }, { response: 0 }, { response: 0 }]);
  const r = await m.d.abrirJanela();
  assert.equal(r.aberta, true);
  assert.match(m.chamadas[0].message, /aberta/i);
  assert.match(m.chamadas[0].detail, /5 minutos|\d{2}:\d{2}/);
  assert.equal(m.acesso.getJanelaInscricao().aberta, true);
  assert.equal((await m.d.fecharJanela()).fechada, true);
  assert.equal(m.acesso.getJanelaInscricao().aberta, false);
  m.acesso.travar();
  const t = await m.d.abrirJanela();
  assert.equal(t.aberta, false);
  assert.match(m.chamadas[m.chamadas.length - 1].message, /travad/i);
});

test('aprovarPendentes: percorre os pendentes; sem pendentes só informa', async () => {
  const m = mundo([{ response: 0 }]);
  assert.equal((await m.d.aprovarPendentes()).total, 0);
  assert.match(m.chamadas[0].message, /Nenhum dispositivo/);
  const m2 = mundo([{ response: 1 }, { response: 0 }]);
  pendente(m2.acesso, 'f1111111');
  pendente(m2.acesso, 'f2222222');
  const r = await m2.d.aprovarPendentes();
  assert.deepEqual({ t: r.total, a: r.aprovados, n: r.negados }, { t: 2, a: 1, n: 1 });
});
