'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  itemImportFromMusicaRow,
  payloadImportFromWebhookBody,
  payloadImportFromMusicaRows,
} = require('./invbTonsFromSupabase');

test('itemImportFromMusicaRow lê JSON de tons do site', () => {
  const item = itemImportFromMusicaRow({
    nome: 'Quero você',
    tom: JSON.stringify([
      { tom: 'G', min: 'Cris' },
      { tom: 'A', min: 'Daniela' },
    ]),
    ministrante: 'Cris, Daniela',
    observacoes: '',
  });
  assert.ok(item);
  assert.strictEqual(item.titulo, 'Quero você');
  assert.strictEqual(item.tons.Cris, 'G');
  assert.strictEqual(item.tons.Daniela, 'A');
});

test('payloadImportFromWebhookBody usa record do trigger', () => {
  const payload = payloadImportFromWebhookBody({
    type: 'UPDATE',
    table: 'musicas',
    record: {
      id: 'abc',
      nome: 'O Fogo Arderá',
      tom: '[{"tom":"B","min":"Raphaela"}]',
      ministrante: 'Raphaela',
    },
  });
  assert.strictEqual(payload.itens.length, 1);
  assert.strictEqual(payload.itens[0].tons.Raphaela, 'B');
});

test('payloadImportFromMusicaRows ignora sem tom válido', () => {
  const payload = payloadImportFromMusicaRows([
    { nome: 'Sem tom', tom: 'Orig.', ministrante: 'Cris' },
    { nome: 'Com tom', tom: '[{"tom":"C","min":"cris medeiros"}]', ministrante: 'Cris' },
  ]);
  assert.strictEqual(payload.itens.length, 1);
  assert.strictEqual(payload.itens[0].tons.Cris, 'C');
});
