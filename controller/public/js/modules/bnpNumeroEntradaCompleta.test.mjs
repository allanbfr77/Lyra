import test from 'node:test';
import assert from 'node:assert/strict';
import { bnpNumeroEntradaCompleta } from './bnpNumeroEntradaCompleta.js';

test('max 150: prefixo "1" aguarda mais dígitos', () => {
  assert.equal(bnpNumeroEntradaCompleta('1', 150), false);
  assert.equal(bnpNumeroEntradaCompleta('10', 150), false);
  assert.equal(bnpNumeroEntradaCompleta('15', 150), false);
});

test('max 150: prefixo "2"–"9" aguarda mais dígitos (ex.: 20, 30)', () => {
  assert.equal(bnpNumeroEntradaCompleta('2', 150), false);
  assert.equal(bnpNumeroEntradaCompleta('20', 150), true);
  assert.equal(bnpNumeroEntradaCompleta('3', 150), false);
  assert.equal(bnpNumeroEntradaCompleta('30', 150), true);
});

test('max 150: confirma quando não há extensão válida', () => {
  assert.equal(bnpNumeroEntradaCompleta('16', 150), true);
  assert.equal(bnpNumeroEntradaCompleta('150', 150), true);
});

test('livros curtos confirmam cedo quando não há ambiguidade', () => {
  assert.equal(bnpNumeroEntradaCompleta('1', 9), true);
  assert.equal(bnpNumeroEntradaCompleta('9', 9), true);
  assert.equal(bnpNumeroEntradaCompleta('1', 12), false);
  assert.equal(bnpNumeroEntradaCompleta('12', 12), true);
});

test('entrada inválida', () => {
  assert.equal(bnpNumeroEntradaCompleta('', 150), false);
  assert.equal(bnpNumeroEntradaCompleta('abc', 150), false);
  assert.equal(bnpNumeroEntradaCompleta('0', 150), false);
  assert.equal(bnpNumeroEntradaCompleta('200', 150), false);
});
