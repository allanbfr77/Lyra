import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEM_EXIBICAO,
  precisaReporRotaSlides,
  rotaSlidesReposta,
  limparNaoExibirManualSlides,
  sincronizarNaoExibirManualSlidesDaEscolha,
  obterNaoExibirManualSlides,
} from './reposicaoRotaSlides.js';

/*
 * Convenção Lyra dos índices: 0 = monitor principal (do operador, nunca projeta),
 * 1 = Monitor 2 (público/telão), 2 = Monitor 3 (ministrante/retorno).
 */
const M2 = 1;
const M3 = 2;
const OFF = SEM_EXIBICAO;

/** Origem sem mídia nenhuma a ocupar ecrã: telão no M2, retorno no M3. */
const PADRAO_LIVRE = { publicoIndex: M2, ministranteIndex: M3 };

test.beforeEach(() => {
  limparNaoExibirManualSlides();
});

test('as duas saídas configuradas: não se toca em nada', () => {
  const e = { publicoIndex: M2, ministranteIndex: M3 };
  assert.equal(precisaReporRotaSlides(e), false);
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('M2 e M3 trocados de propósito continuam trocados', () => {
  /* Configuração deliberada do operador não é «desconfigurado» — só o -1 automático é. */
  const e = { publicoIndex: M3, ministranteIndex: M2 };
  assert.equal(precisaReporRotaSlides(e), false);
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: M3, ministranteIndex: M2, live: false });
});

test('as duas desligadas automaticamente voltam ao padrão', () => {
  const e = { publicoIndex: OFF, ministranteIndex: OFF };
  assert.equal(precisaReporRotaSlides(e), true);
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('só o público desligado automaticamente: volta o M2, o M3 fica como estava', () => {
  const e = { publicoIndex: OFF, ministranteIndex: M3 };
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('só o ministrante desligado automaticamente: volta o M3, o M2 fica como estava', () => {
  const e = { publicoIndex: M2, ministranteIndex: OFF };
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('«Não exibir» MANUAL no público sobrevive à reposição nesta sessão', () => {
  sincronizarNaoExibirManualSlidesDaEscolha({ publicoIndex: OFF, ministranteIndex: M3 });
  const e = { publicoIndex: OFF, ministranteIndex: M3 };
  assert.equal(precisaReporRotaSlides(e), false);
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: OFF, ministranteIndex: M3, live: false });
});

test('«Não exibir» MANUAL nas duas saídas não é reposto nesta sessão', () => {
  sincronizarNaoExibirManualSlidesDaEscolha({ publicoIndex: OFF, ministranteIndex: OFF });
  const e = { publicoIndex: OFF, ministranteIndex: OFF };
  assert.equal(precisaReporRotaSlides(e), false);
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: OFF, ministranteIndex: OFF, live: false });
});

test('escolher monitor outra vez limpa a marca manual daquele canal', () => {
  sincronizarNaoExibirManualSlidesDaEscolha({ publicoIndex: OFF, ministranteIndex: M3 });
  sincronizarNaoExibirManualSlidesDaEscolha({ publicoIndex: M2, ministranteIndex: M3 });
  assert.deepEqual(obterNaoExibirManualSlides(), { publico: false, ministrante: false });
  const e = { publicoIndex: OFF, ministranteIndex: OFF };
  assert.equal(precisaReporRotaSlides(e), true);
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('desativação automática NÃO marca manual — reposição continua a funcionar', () => {
  /* Mídias tomou o M2: slides.publico = -1 sem clique no seletor do Slides. */
  const e = { publicoIndex: OFF, ministranteIndex: M3 };
  assert.deepEqual(obterNaoExibirManualSlides(), { publico: false, ministrante: false });
  assert.equal(precisaReporRotaSlides(e), true);
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('limpar a marca (nova sessão) volta a permitir reposição', () => {
  sincronizarNaoExibirManualSlidesDaEscolha({ publicoIndex: OFF, ministranteIndex: OFF });
  limparNaoExibirManualSlides();
  const e = { publicoIndex: OFF, ministranteIndex: OFF };
  assert.equal(precisaReporRotaSlides(e), true);
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('REGRESSÃO — mídia no M2: repor o público NÃO pode desligar o ministrante', () => {
  /*
   * O bug relatado em teste. Com a mídia a projetar no M2, o padrão chega aqui já desviado
   * pelo `ajustarSlidesSemConflitoComApresentacao` — e o desvio manda o público para o M3,
   * que é onde o ministrante está. Antes, resolver essa colisão pela regra «um monitor, uma
   * saída» dava o M3 ao público e desligava o ministrante, que ninguém tinha tocado.
   *
   * O certo: o ministrante mantém o M3 e o público fica em «Não exibir» — com o Mídias no
   * M2 e o retorno no M3, não sobrou ecrã nenhum para o telão.
   */
  const entrada = { publicoIndex: OFF, ministranteIndex: M3 };
  const padraoDesviado = { publicoIndex: M3, ministranteIndex: M3 };
  assert.deepEqual(rotaSlidesReposta(entrada, padraoDesviado), {
    publicoIndex: OFF,
    ministranteIndex: M3,
    live: false,
  });
});

test('o padrão nunca põe as duas saídas no mesmo monitor', () => {
  const padraoColidido = { publicoIndex: M3, ministranteIndex: M3 };
  const r = rotaSlidesReposta({ publicoIndex: OFF, ministranteIndex: OFF }, padraoColidido);
  assert.notEqual(r.publicoIndex, r.ministranteIndex);
  assert.deepEqual(r, { publicoIndex: M3, ministranteIndex: OFF, live: false });
});

test('padrão sem monitor nenhum deixa a rota como está', () => {
  /* Um único ecrã ligado: não há o que repor, e inventar índice abriria janela no ecrã do operador. */
  const e = { publicoIndex: OFF, ministranteIndex: OFF };
  assert.deepEqual(rotaSlidesReposta(e, { publicoIndex: OFF, ministranteIndex: OFF }), {
    publicoIndex: OFF,
    ministranteIndex: OFF,
    live: false,
  });
});

test('«Live — OBS» não é reposto nem convertido em índices', () => {
  const e = { publicoIndex: OFF, ministranteIndex: OFF, live: true };
  assert.equal(precisaReporRotaSlides(e), false);
  assert.deepEqual(rotaSlidesReposta(e, PADRAO_LIVRE), { publicoIndex: OFF, ministranteIndex: OFF, live: true });
});

test('entradas corrompidas equivalem a «Não exibir», sem propagar NaN', () => {
  const r = rotaSlidesReposta({ publicoIndex: 'x', ministranteIndex: null }, PADRAO_LIVRE);
  assert.deepEqual(r, { publicoIndex: M2, ministranteIndex: M3, live: false });
  assert.deepEqual(rotaSlidesReposta(null, PADRAO_LIVRE), { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('devolve objecto novo, sem partilhar referência com a entrada', () => {
  const e = { publicoIndex: M2, ministranteIndex: M3, live: false };
  assert.notEqual(rotaSlidesReposta(e, PADRAO_LIVRE), e);
});
