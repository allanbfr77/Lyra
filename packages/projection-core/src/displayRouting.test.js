'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarRoteamentoDual,
  indicesJanelasProjecaoDeRoteamentoDual,
} = require('./displayRouting');

describe('displayRouting — pin do Contador', () => {
  it('sem pin de contagem, apresentação substitui o slide no mesmo canal', () => {
    const dual = normalizarRoteamentoDual({
      version: 2,
      slides: { publicoIndex: 2, ministranteIndex: 1 },
      apresentacao: { publicoIndex: 1, ministranteIndex: -1 },
    });
    assert.deepEqual(indicesJanelasProjecaoDeRoteamentoDual(dual), {
      publicoIndex: 1,
      ministranteIndex: 1,
    });
  });

  it('com Contagem no M3 e Bíblia no M2, mantém os dois monitores abertos', () => {
    const dual = normalizarRoteamentoDual({
      version: 2,
      slides: { publicoIndex: -1, ministranteIndex: -1 },
      apresentacao: { publicoIndex: 1, ministranteIndex: -1 },
      contagem: { publicoIndex: 2, ministranteIndex: -1 },
    });
    assert.deepEqual(indicesJanelasProjecaoDeRoteamentoDual(dual), {
      publicoIndex: 2,
      ministranteIndex: 1,
    });
  });

  it('Live na apresentação não tira o pin da Contagem do monitor físico', () => {
    const dual = normalizarRoteamentoDual({
      version: 2,
      slides: { publicoIndex: -1, ministranteIndex: -1 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
      contagem: { publicoIndex: 2, ministranteIndex: -1 },
    });
    assert.deepEqual(indicesJanelasProjecaoDeRoteamentoDual(dual), {
      publicoIndex: 2,
      ministranteIndex: -1,
    });
  });

  it('Contagem em «ambos» não cede o ministrante à Bíblia', () => {
    const dual = normalizarRoteamentoDual({
      version: 2,
      slides: { publicoIndex: -1, ministranteIndex: -1 },
      apresentacao: { publicoIndex: 1, ministranteIndex: -1 },
      contagem: { publicoIndex: 1, ministranteIndex: 2 },
    });
    assert.deepEqual(indicesJanelasProjecaoDeRoteamentoDual(dual), {
      publicoIndex: 1,
      ministranteIndex: 2,
    });
  });
});
