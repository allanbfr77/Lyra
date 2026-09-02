'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { resolverTomDoMapa } = require('./aplicarTonsImportPlaylists');

test('resolverTomDoMapa usa tom específico antes de Todos', () => {
  const byMin = new Map([
    ['todos', 'B'],
    ['cris', 'G'],
  ]);
  assert.strictEqual(resolverTomDoMapa(byMin, 'Cris'), 'G');
  assert.strictEqual(resolverTomDoMapa(byMin, 'Daniela'), 'B');
  assert.strictEqual(resolverTomDoMapa(byMin, ''), 'B');
});

test('resolverTomDoMapa sem Todos e sem nome devolve vazio', () => {
  const byMin = new Map([['cris', 'A']]);
  assert.strictEqual(resolverTomDoMapa(byMin, 'Daniela'), '');
});

test('mapaTonsPorTitulo separa ministrantes agrupados na mesma chave', () => {
  const { mapaTonsPorTitulo } = require('./aplicarTonsImportPlaylists');
  const mapa = mapaTonsPorTitulo([
    {
      titulo: 'A Ele a Glória',
      tons: { 'Raphaela, Cris': 'E', Daniela: 'C' },
    },
  ]);
  const byMin = mapa.get('a ele a gloria');
  assert.ok(byMin);
  assert.strictEqual(byMin.get('raphaela'), 'E');
  assert.strictEqual(byMin.get('cris'), 'E');
  assert.strictEqual(byMin.get('daniela'), 'C');
  assert.strictEqual(byMin.has('raphaela, cris'), false);
});
