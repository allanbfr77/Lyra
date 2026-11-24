import test from 'node:test';
import assert from 'node:assert/strict';
import { rotaCanalPartilhadoBibliaMidia } from './canalPartilhadoBibliaMidia.js';

const M2 = 1;
const M3 = 2;
const NADA = { publicoIndex: -1, ministranteIndex: -1, live: false };
const IGREJA = { publicoIndex: M2, ministranteIndex: -1, live: false };
const MINISTRANTE = { publicoIndex: -1, ministranteIndex: M3, live: false };
const AMBOS = { publicoIndex: M2, ministranteIndex: M3, live: false };
const LIVE = { publicoIndex: -1, ministranteIndex: -1, live: true };

test('mídia na Igreja + Bíblia no Ministrante: os dois monitores abertos', () => {
  assert.deepEqual(rotaCanalPartilhadoBibliaMidia(IGREJA, MINISTRANTE), AMBOS);
});

test('mídia no Ministrante + Bíblia na Igreja: os dois monitores abertos', () => {
  assert.deepEqual(rotaCanalPartilhadoBibliaMidia(MINISTRANTE, IGREJA), AMBOS);
});

test('mesmo canal: a rota é a mesma (o servidor decide quem aparece)', () => {
  assert.deepEqual(rotaCanalPartilhadoBibliaMidia(IGREJA, IGREJA), IGREJA);
});

test('sem mídia escolhida: vale a rota da Bíblia', () => {
  assert.deepEqual(rotaCanalPartilhadoBibliaMidia(NADA, MINISTRANTE), MINISTRANTE);
});

test('Bíblia em «Não exibir»: vale a rota da mídia', () => {
  assert.deepEqual(rotaCanalPartilhadoBibliaMidia(IGREJA, NADA), IGREJA);
});

test('Bíblia no Live não abre janela: fica a rota da mídia', () => {
  assert.deepEqual(rotaCanalPartilhadoBibliaMidia(IGREJA, LIVE), IGREJA);
});

test('mídia no Live não ocupa monitor: fica a rota da Bíblia', () => {
  assert.deepEqual(rotaCanalPartilhadoBibliaMidia(LIVE, MINISTRANTE), MINISTRANTE);
});
