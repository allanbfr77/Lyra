import test from 'node:test';
import assert from 'node:assert/strict';
import { rotaSemMonitorRepetido, SEM_EXIBICAO } from './saidasMonitorExclusivas.js';

/*
 * Convenção Lyra dos índices: 0 = monitor principal (do operador, nunca projeta),
 * 1 = Monitor 2 (público/telão), 2 = Monitor 3 (ministrante/retorno).
 */
const M2 = 1;
const M3 = 2;

test('sem conflito, a rota passa intacta', () => {
  const r = rotaSemMonitorRepetido({ publicoIndex: M2, ministranteIndex: M3 });
  assert.deepEqual(r, { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('escolher no Ministrante um monitor que estava no Público tira-o do Público', () => {
  /* O caso do enunciado: M2 no Público, operador escolhe M2 no Ministrante. */
  const r = rotaSemMonitorRepetido({ publicoIndex: M2, ministranteIndex: M2 }, 'ministrante');
  assert.deepEqual(r, { publicoIndex: SEM_EXIBICAO, ministranteIndex: M2, live: false });
});

test('e no sentido inverso', () => {
  const r = rotaSemMonitorRepetido({ publicoIndex: M3, ministranteIndex: M3 }, 'publico');
  assert.deepEqual(r, { publicoIndex: M3, ministranteIndex: SEM_EXIBICAO, live: false });
});

test('rota antiga com o mesmo monitor nas duas saídas: o Público prevalece', () => {
  const r = rotaSemMonitorRepetido({ publicoIndex: M2, ministranteIndex: M2 });
  assert.deepEqual(r, { publicoIndex: M2, ministranteIndex: SEM_EXIBICAO, live: false });
});

test('«Não exibir» nas duas saídas não é conflito', () => {
  const r = rotaSemMonitorRepetido({ publicoIndex: -1, ministranteIndex: -1 }, 'ministrante');
  assert.deepEqual(r, { publicoIndex: -1, ministranteIndex: -1, live: false });
});

test('Live — OBS não usa monitor: nada a arbitrar', () => {
  const r = rotaSemMonitorRepetido({ publicoIndex: M2, ministranteIndex: M2, live: true });
  assert.deepEqual(r, { publicoIndex: -1, ministranteIndex: -1, live: true });
});

test('valores inválidos caem em «Não exibir» em vez de propagarem NaN', () => {
  const r = rotaSemMonitorRepetido({ publicoIndex: 'x', ministranteIndex: undefined });
  assert.deepEqual(r, { publicoIndex: -1, ministranteIndex: -1, live: false });
});

test('devolve sempre um objecto novo — guardar o resultado não partilha referência', () => {
  const entrada = { publicoIndex: M2, ministranteIndex: M3, live: false };
  const saida = rotaSemMonitorRepetido(entrada);
  assert.notStrictEqual(saida, entrada);
});
