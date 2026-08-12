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
