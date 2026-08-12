'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  itemImportFromMusicaRow,
  payloadImportFromWebhookBody,
  payloadImportFromMusicaRows,
  resolverMinistranteNoCadastro,
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
  assert.strictEqual(item.tons.Todos, undefined);
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
  assert.strictEqual(payload.itens[0].tons.Todos, 'B');
});

test('itemImportFromMusicaRow preserva Todos como tom padrão', () => {
  const item = itemImportFromMusicaRow({
    nome: 'Te amo',
    tom: JSON.stringify([
      { tom: 'B', min: 'Todos' },
      { tom: 'G', min: 'Cris' },
    ]),
    ministrante: 'Todos, Cris',
    observacoes: '',
  });
  assert.ok(item);
  assert.strictEqual(item.tons.Todos, 'B');
  assert.strictEqual(item.tons.Cris, 'G');
});

test('payloadImportFromMusicaRows ignora sem tom válido', () => {
  const payload = payloadImportFromMusicaRows([
    { nome: 'Sem tom', tom: 'X', ministrante: 'Cris' },
    { nome: 'Com tom', tom: '[{"tom":"C","min":"Cris"}]', ministrante: 'Cris' },
  ]);
  assert.strictEqual(payload.itens.length, 1);
  assert.strictEqual(payload.itens[0].tons.Cris, 'C');
  assert.strictEqual(payload.itens[0].tons.Todos, 'C');
});

test('resolverMinistranteNoCadastro casa nome do site com o cadastro', () => {
  const cadastrados = [
    { id: 1, nome: 'Cris' },
    { id: 2, nome: 'Daniela' },
    { id: 3, nome: 'Pr. Humberto' },
  ];
  assert.strictEqual(resolverMinistranteNoCadastro('Cris', cadastrados).id, 1);
  assert.strictEqual(resolverMinistranteNoCadastro('daniela', cadastrados).id, 2);
  assert.strictEqual(resolverMinistranteNoCadastro('Humberto', cadastrados).id, 3);
  assert.strictEqual(resolverMinistranteNoCadastro('Todos', cadastrados), null);
});

test('um único tom no site vira Todos automaticamente', () => {
  const item = itemImportFromMusicaRow({
    nome: 'Tu És / Águas Purificadoras',
    tom: JSON.stringify([{ tom: 'B', min: 'Raphaela' }]),
    ministrante: 'Raphaela',
  });
  assert.ok(item);
  assert.strictEqual(item.tons.Raphaela, 'B');
  assert.strictEqual(item.tons.Todos, 'B');
});

test('campo ministrante TODOS no site vira tom padrão', () => {
  const item = itemImportFromMusicaRow({
    nome: 'Tu És / Águas Purificadoras',
    tom: 'B',
    ministrante: 'TODOS',
  });
  assert.ok(item);
  assert.strictEqual(item.tons.Todos, 'B');
});

test('itemImportFromMusicaRow aceita Orig. como ORIG.', () => {
  const item = itemImportFromMusicaRow({
    nome: 'Canção original',
    tom: 'Orig.',
    ministrante: 'Cris',
  });
  assert.ok(item);
  assert.strictEqual(item.tons.Cris, 'ORIG.');
});
