'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { sufixoCultoDoTipo, cultoIdDoSite, temaDoItem } = require('./invbPlaylistFetch');

/*
 * O id do culto tem de sair exactamente como o painel o gera
 * (`controller/public/js/modules/cultosCalendario.js`): domingo é `manha`/`noite`,
 * quarta é `quarta`. Com o `tipo` do site cru («domingo_manha») a playlist era
 * gravada num culto que o seletor nunca mostra.
 */
test('sufixo do culto: turno do domingo', () => {
  assert.equal(sufixoCultoDoTipo('domingo_manha', '2026-09-13'), 'manha');
  assert.equal(sufixoCultoDoTipo('domingo_noite', '2026-09-13'), 'noite');
  assert.equal(sufixoCultoDoTipo('Domingo Manhã', '2026-09-13'), 'manha');
  assert.equal(sufixoCultoDoTipo('manha', '2026-09-13'), 'manha');
});

test('sufixo do culto: quarta e outros dias', () => {
  assert.equal(sufixoCultoDoTipo('quarta', '2026-09-16'), 'quarta');
  assert.equal(sufixoCultoDoTipo('Quarta-feira', '2026-09-16'), 'quarta');
  assert.equal(sufixoCultoDoTipo('sabado', '2026-09-19'), 'sabado');
});

test('tipo desconhecido cai no dia da semana da data', () => {
  assert.equal(sufixoCultoDoTipo('culto_especial', '2026-09-16'), 'quarta');
  assert.equal(sufixoCultoDoTipo('culto_especial', '2026-09-13'), 'manha');
  assert.equal(sufixoCultoDoTipo('domingo', '2026-09-13'), 'manha');
});

test('id do culto no formato do painel', () => {
  assert.equal(cultoIdDoSite('domingo_manha', '2026-09-13'), 'culto_2026-09-13_manha');
  assert.equal(cultoIdDoSite('domingo_noite', '2026-09-13'), 'culto_2026-09-13_noite');
  assert.equal(cultoIdDoSite('quarta', '2026-09-16'), 'culto_2026-09-16_quarta');
  assert.equal(cultoIdDoSite('quarta', null), 'culto_sem_data_quarta');
});

test('tema vem das flags de seção do site', () => {
  assert.equal(temaDoItem({ nome: 'X' }), 'ABERTURA');
  assert.equal(temaDoItem({ nome: 'X', ofertorio: true }), 'OFERTÓRIO');
  assert.equal(temaDoItem({ nome: 'X', pos: true }), 'PÓS-PALAVRA');
  assert.equal(temaDoItem({ nome: 'X', ceia: true }), 'CEIA');
});
