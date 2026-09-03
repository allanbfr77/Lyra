'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { criterioQueLimitou, resumirMedicaoLinhas } = require('./layoutDiagnostico');

test('criterioQueLimitou: nenhum quando cabe nos dois eixos', () => {
  assert.equal(criterioQueLimitou(true, true), 'nenhum');
});

test('criterioQueLimitou: largura quando só transborda na horizontal', () => {
  assert.equal(criterioQueLimitou(false, true), 'largura');
});

test('criterioQueLimitou: altura quando só transborda na vertical', () => {
  assert.equal(criterioQueLimitou(true, false), 'altura');
});

test('criterioQueLimitou: ambos quando transborda nos dois eixos', () => {
  assert.equal(criterioQueLimitou(false, false), 'ambos');
});

test('resumirMedicaoLinhas: maior linha, largura útil e diferença para scrollWidth', () => {
  const r = resumirMedicaoLinhas({
    caixa: { clientWidth: 1257, clientHeight: 400, scrollWidth: 1257, scrollHeight: 400 },
    estilos: { paddingLeft: '50px', paddingRight: '50px' },
    largurasLinhas: [1100, 1180, 900],
  });
  assert.equal(r.quantidadeLinhas, 3);
  assert.equal(r.maiorLarguraLinha, 1180);
  assert.equal(r.larguraUtilCaixa, 1157);
  assert.equal(r.diferencaScrollVsMaiorLinha, 77);
  assert.equal(r.maiorLinhaUltrapassaLarguraUtil, true);
});

test('resumirMedicaoLinhas: linhas curtas não ultrapassam a largura útil', () => {
  const r = resumirMedicaoLinhas({
    caixa: { clientWidth: 800, clientHeight: 200, scrollWidth: 800, scrollHeight: 80 },
    estilos: { paddingLeft: '0px', paddingRight: '0px' },
    largurasLinhas: [320, 410],
  });
  assert.equal(r.maiorLarguraLinha, 410);
  assert.equal(r.larguraUtilCaixa, 800);
  assert.equal(r.maiorLinhaUltrapassaLarguraUtil, false);
  assert.equal(r.diferencaScrollVsMaiorLinha, 390);
});
