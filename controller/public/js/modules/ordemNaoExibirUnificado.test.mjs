import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registrarEscolhaSeletorUnificado,
  ordemNaoExibirDoSeletorUnificado,
  temOrdemNaoExibir,
  limparOrdemNaoExibirUnificado,
  OPCAO_NAO_EXIBIR,
  SEM_EXIBICAO,
} from './ordemNaoExibirUnificado.js';

/*
 * Convenção Lyra dos índices: 0 = monitor principal (do operador, nunca projeta),
 * 1 = Monitor 2 (público/telão), 2 = Monitor 3 (ministrante/retorno).
 */
const M2 = 1;
const M3 = 2;

const APAGADA = { publicoIndex: SEM_EXIBICAO, ministranteIndex: SEM_EXIBICAO };
const NENHUM = { publico: false, ministrante: false };

test.beforeEach(() => limparOrdemNaoExibirUnificado());

test('sem clique nenhum não há ordem — o −1 do arranque não vale por uma', () => {
  /*
   * A armadilha que este módulo existe para não cair: Bíblia e Mídias nascem em −1/−1 a
   * cada arranque e voltam a −1/−1 ao encerrar. Deduzir a ordem do −1 poria um lençol
   * preto no telão só por o operador ter aberto o Modo Bíblia com uma música no ar.
   */
  assert.equal(temOrdemNaoExibir('biblia'), false);
  assert.deepEqual(ordemNaoExibirDoSeletorUnificado('biblia', APAGADA), NENHUM);
});

test('clicar «Não exibir» na Bíblia apaga os dois canais', () => {
  registrarEscolhaSeletorUnificado('biblia', OPCAO_NAO_EXIBIR);
  assert.deepEqual(ordemNaoExibirDoSeletorUnificado('biblia', APAGADA), {
    publico: true,
    ministrante: true,
  });
});

test('clicar «Não exibir» nas Mídias apaga os dois canais', () => {
  registrarEscolhaSeletorUnificado('apresentacao', OPCAO_NAO_EXIBIR);
  assert.deepEqual(ordemNaoExibirDoSeletorUnificado('apresentacao', APAGADA), {
    publico: true,
    ministrante: true,
  });
});

test('escolher um monitor a seguir retira a ordem', () => {
  registrarEscolhaSeletorUnificado('apresentacao', OPCAO_NAO_EXIBIR);
  registrarEscolhaSeletorUnificado('apresentacao', 'ambos');
  assert.equal(temOrdemNaoExibir('apresentacao'), false);
  assert.deepEqual(
    ordemNaoExibirDoSeletorUnificado('apresentacao', { publicoIndex: M2, ministranteIndex: M3 }),
    NENHUM
  );
});

test('«Live — OBS» não é apagar o monitor: é mandar a saída para outro sítio', () => {
  registrarEscolhaSeletorUnificado('biblia', 'live');
  assert.equal(temOrdemNaoExibir('biblia'), false);
  /* E mesmo com ordem registada, uma rota live não gera apagamento. */
  registrarEscolhaSeletorUnificado('biblia', OPCAO_NAO_EXIBIR);
  assert.deepEqual(
    ordemNaoExibirDoSeletorUnificado('biblia', { ...APAGADA, live: true }),
    NENHUM
  );
});

test('canal que ainda sai com monitor não é apagado — o aviso do card 6 continua no ar', () => {
  /*
   * O canal `apresentacao` é partilhado com o aviso do card 6. Se a fusão lhe devolveu um
   * monitor, há conteúdo para mostrar e nada a apagar. Mesma guarda do modo Slides.
   */
  registrarEscolhaSeletorUnificado('apresentacao', OPCAO_NAO_EXIBIR);
  assert.deepEqual(
    ordemNaoExibirDoSeletorUnificado('apresentacao', { publicoIndex: M2, ministranteIndex: -1 }),
    { publico: false, ministrante: true }
  );
});

test('a ordem é por modo: «Não exibir» na Bíblia não apaga as Mídias', () => {
  registrarEscolhaSeletorUnificado('biblia', OPCAO_NAO_EXIBIR);
  assert.deepEqual(ordemNaoExibirDoSeletorUnificado('apresentacao', APAGADA), NENHUM);
});

test('modos sem seletor unificado não são governados por aqui', () => {
  /* O Slides tem dois seletores e registo próprio (`reposicaoRotaSlides`). */
  registrarEscolhaSeletorUnificado('slides', OPCAO_NAO_EXIBIR);
  assert.equal(temOrdemNaoExibir('slides'), false);
  assert.deepEqual(ordemNaoExibirDoSeletorUnificado('slides', APAGADA), NENHUM);
});

test('o DOCS usa o mesmo seletor e a mesma ordem', () => {
  registrarEscolhaSeletorUnificado('docs', OPCAO_NAO_EXIBIR);
  assert.deepEqual(ordemNaoExibirDoSeletorUnificado('docs', APAGADA), {
    publico: true,
    ministrante: true,
  });
});

test('valores inválidos caem em «Não exibir» em vez de propagarem NaN', () => {
  registrarEscolhaSeletorUnificado('biblia', OPCAO_NAO_EXIBIR);
  assert.deepEqual(
    ordemNaoExibirDoSeletorUnificado('biblia', { publicoIndex: 'x', ministranteIndex: null }),
    { publico: true, ministrante: true }
  );
});
