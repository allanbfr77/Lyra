'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mapearPlaylist, normalizarTema } = require('./lyraPlaylistsApi');

test('tipos reais do site viram o id de culto do painel', () => {
  const base = { data: '2026-11-11', ministrante: 'X', itens: [{ nome: 'Galileu', slug: 'galileu', tom: 'G', tema: 'ABERTURA' }] };
  assert.equal(mapearPlaylist({ ...base, tipo: 'quarta' }).cultoId, 'culto_2026-11-11_quarta');
  assert.equal(mapearPlaylist({ ...base, tipo: 'domingo_manha', data: '2026-11-15' }).cultoId, 'culto_2026-11-15_manha');
  assert.equal(mapearPlaylist({ ...base, tipo: 'domingo_noite', data: '2026-11-15' }).cultoId, 'culto_2026-11-15_noite');
  /* `extra` não nomeia um turno: cai no dia da semana da data (quarta, aqui). */
  assert.equal(mapearPlaylist({ ...base, tipo: 'extra' }).cultoId, 'culto_2026-11-11_quarta');
});

test('slug nulo, tom «Orig.» e tema desconhecido são aceitos', () => {
  const c = mapearPlaylist({
    tipo: 'quarta',
    data: '2026-11-11',
    itens: [{ nome: 'A', slug: null, tom: 'Orig.', tema: 'qualquer' }],
  });
  assert.equal(c.itens[0].slug, undefined);
  assert.equal(c.itens[0].tom, 'Orig.');
  assert.equal(c.itens[0].tema, 'ABERTURA');
});

test('playlist sem data válida ou sem itens é ignorada', () => {
  assert.equal(mapearPlaylist({ tipo: 'quarta', data: 'x', itens: [{ nome: 'A' }] }), null);
  assert.equal(mapearPlaylist({ tipo: 'quarta', data: '2026-11-11', itens: [] }), null);
});

test('temas do site são reconhecidos sem diferenciar caixa', () => {
  assert.equal(normalizarTema('ofertório'), 'OFERTÓRIO');
  assert.equal(normalizarTema('Pós-Palavra'), 'PÓS-PALAVRA');
  assert.equal(normalizarTema('CEIA'), 'CEIA');
});
