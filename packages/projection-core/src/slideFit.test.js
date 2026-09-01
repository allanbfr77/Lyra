'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FONTE_MIN_VH,
  MARGEM_PX,
  calcularOrcamentosSlides,
  encolherFonteAteCaber,
} = require('./slideFit');

test('só o slide atual recebe toda a altura restante', () => {
  const r = calcularOrcamentosSlides({
    restantePx: 800,
    alturaAtualPx: 200,
    alturaProximoPx: 0,
    atualTemConteudo: true,
    proximoTemConteudo: false,
  });
  assert.equal(r.budgetAtualPx, 800);
  assert.equal(r.budgetProximoPx, 0);
});

test('os dois cabem: cada um fica com a sua altura natural', () => {
  const r = calcularOrcamentosSlides({
    restantePx: 800,
    alturaAtualPx: 120,
    alturaProximoPx: 90,
    atualTemConteudo: true,
    proximoTemConteudo: true,
  });
  assert.equal(r.budgetAtualPx, 120);
  assert.equal(r.budgetProximoPx, 90);
});

test('atual curto e próximo longo: o espaço sobra para o próximo', () => {
  const r = calcularOrcamentosSlides({
    restantePx: 800,
    alturaAtualPx: 100,
    alturaProximoPx: 900,
    atualTemConteudo: true,
    proximoTemConteudo: true,
  });
  assert.equal(r.budgetAtualPx, 100);
  assert.equal(r.budgetProximoPx, 700);
});

test('os dois longos partilham a área em partes iguais', () => {
  const r = calcularOrcamentosSlides({
    restantePx: 800,
    alturaAtualPx: 600,
    alturaProximoPx: 600,
    atualTemConteudo: true,
    proximoTemConteudo: true,
  });
  assert.equal(r.budgetAtualPx, 400);
  assert.equal(r.budgetProximoPx, 400);
});

test('já cabe no teto: não encolhe', () => {
  const vh = encolherFonteAteCaber({
    fonteMaxVh: 7,
    cabe: () => true,
  });
  assert.equal(vh, 7);
});

test('encolhe só o necessário até caber', () => {
  const vh = encolherFonteAteCaber({
    fonteMaxVh: 8,
    fonteMinVh: 2.1,
    cabe: (v) => v <= 5.2,
  });
  assert.ok(vh <= 5.2 + 0.05, `esperava ≤ 5.25, veio ${vh}`);
  assert.ok(vh >= 5.0, `não devia encolher além do necessário: ${vh}`);
});

test('nem no mínimo cabe: devolve o piso', () => {
  const vh = encolherFonteAteCaber({
    fonteMaxVh: 7,
    cabe: () => false,
  });
  assert.equal(vh, FONTE_MIN_VH);
});

test('margem de segurança está definida em pixéis', () => {
  assert.equal(MARGEM_PX, 2);
});
