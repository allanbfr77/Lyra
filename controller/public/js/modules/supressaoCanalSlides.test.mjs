import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEM_EXIBICAO,
  bibliaReclamaCanalPartilhado,
  rotaSlidesParaEnvioComBiblia,
} from './supressaoCanalSlides.js';

/*
 * Convenção Lyra dos índices: 0 = monitor principal (do operador, nunca projeta),
 * 1 = Monitor 2 (público/telão), 2 = Monitor 3 (ministrante/retorno).
 */
const M2 = 1;
const M3 = 2;

const DESATIVADO = { publicoIndex: SEM_EXIBICAO, ministranteIndex: SEM_EXIBICAO, live: false };
const SLIDES_M2_M3 = { publicoIndex: M2, ministranteIndex: M3 };

test('Bíblia no M2: o pacote do Slides vai a «Não exibir» nos dois canais', () => {
  /*
   * O M3 tem de ficar preto. Deixar `ministranteIndex: M3` passar faria o motor abrir lá
   * uma janela de ministrante com o conteúdo do Slides, em vez do escudo preto.
   */
  const enviar = rotaSlidesParaEnvioComBiblia({ publicoIndex: M2, ministranteIndex: -1 }, SLIDES_M2_M3);
  assert.deepEqual(enviar, DESATIVADO);
});

test('Bíblia em «Live — OBS» também suprime o Slides', () => {
  /* Não ocupa monitor, mas é projeção a decorrer: a música não pode subir ao telão. */
  const enviar = rotaSlidesParaEnvioComBiblia({ publicoIndex: -1, ministranteIndex: -1, live: true }, SLIDES_M2_M3);
  assert.deepEqual(enviar, DESATIVADO);
});

test('Bíblia em «Não exibir»: o Slides segue intacto', () => {
  /*
   * Sem destino escolhido não há nada a proteger. Suprimir aqui apagaria o telão do
   * operador sem ele ter pedido — era este o defeito da versão anterior, que zerava o
   * Slides em todos os casos porque as condições `>= 0` e `< 0` cobriam tudo.
   */
  const enviar = rotaSlidesParaEnvioComBiblia({ publicoIndex: -1, ministranteIndex: -1 }, SLIDES_M2_M3);
  assert.deepEqual(enviar, { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('a configuração do Slides não é alterada — o objecto de entrada fica intacto', () => {
  /*
   * O ponto do módulo: silenciar não pode custar a anotação de qual monitor é do Slides.
   * `rotasPorModo.slides` continua a valer M2/M3 e é isso que `persistirIdentidadesDosModos`
   * grava.
   */
  const guardada = { publicoIndex: M2, ministranteIndex: M3, live: false };
  rotaSlidesParaEnvioComBiblia({ publicoIndex: M2, ministranteIndex: -1 }, guardada);
  assert.deepEqual(guardada, { publicoIndex: M2, ministranteIndex: M3, live: false });
});

test('devolve sempre objecto novo, sem partilhar referência', () => {
  const guardada = { publicoIndex: M2, ministranteIndex: M3, live: false };
  const enviar = rotaSlidesParaEnvioComBiblia({ publicoIndex: -1, ministranteIndex: -1 }, guardada);
  assert.notEqual(enviar, guardada);
});

test('Bíblia só no ministrante também reclama o canal', () => {
  const enviar = rotaSlidesParaEnvioComBiblia({ publicoIndex: -1, ministranteIndex: M3 }, SLIDES_M2_M3);
  assert.deepEqual(enviar, DESATIVADO);
});

test('rota corrompida ou em falta equivale a «Não exibir»', () => {
  assert.equal(bibliaReclamaCanalPartilhado(null), false);
  assert.equal(bibliaReclamaCanalPartilhado({}), false);
  assert.equal(bibliaReclamaCanalPartilhado({ publicoIndex: 'x', ministranteIndex: 'y' }), false);
  assert.deepEqual(rotaSlidesParaEnvioComBiblia(null, SLIDES_M2_M3), {
    publicoIndex: M2,
    ministranteIndex: M3,
    live: false,
  });
});

test('Slides já em «Não exibir» permanece assim, com ou sem Bíblia no ar', () => {
  assert.deepEqual(rotaSlidesParaEnvioComBiblia({ publicoIndex: M2, ministranteIndex: -1 }, DESATIVADO), DESATIVADO);
  assert.deepEqual(rotaSlidesParaEnvioComBiblia(DESATIVADO, DESATIVADO), DESATIVADO);
});
