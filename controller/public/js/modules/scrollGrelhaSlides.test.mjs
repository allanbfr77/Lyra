import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLGA_TOPO_GRELHA_SLIDES as TOPO,
  FOLGA_FUNDO_GRELHA_SLIDES as FUNDO,
  deltaScrollGrelhaSlidesAntecipado,
  indiceChipAntecipacao,
  pxVisiveisNoInner,
} from './scrollGrelhaSlides.js';

/** Grelha do exemplo: 5 por linha, ~3,5 linhas visíveis, 31 slides. */
const CHIP = 100;
const GAP = 10;
const STRIDE = CHIP + GAP;
const VP_H = 350;

function rect(top, height = CHIP) {
  return { top, bottom: top + height, height };
}

function viewport() {
  return { top: 0, bottom: VP_H, height: VP_H };
}

function delta(chip, lookahead) {
  return deltaScrollGrelhaSlidesAntecipado({
    viewport: viewport(),
    chip,
    lookahead,
  });
}

function apos(rect0, d) {
  return { top: rect0.top - d, bottom: rect0.bottom - d, height: rect0.height };
}

test('índice de antecipação: mesma coluna na linha seguinte', () => {
  assert.equal(indiceChipAntecipacao(15, 5, 31), 20);
  assert.equal(indiceChipAntecipacao(0, 5, 31), 5);
  assert.equal(indiceChipAntecipacao(25, 5, 31), 30);
});

test('índice de antecipação: última linha incompleta usa o último chip', () => {
  assert.equal(indiceChipAntecipacao(28, 5, 31), 30);
  assert.equal(indiceChipAntecipacao(30, 5, 31), -1);
});

test('slides 1–15 visíveis com a linha 16–20 já a espreitar: não rola', () => {
  const slide15 = rect(2 * STRIDE);
  const slide20 = rect(3 * STRIDE);
  assert.equal(delta(slide15, slide20), 0);
  const innerBottom = VP_H - FUNDO;
  assert.ok(pxVisiveisNoInner(slide20, TOPO, innerBottom) > 0);
});

test('15→16: além de mostrar 16–20, puxa a linha 21–25 (não a deixa escondida)', () => {
  const slide16 = rect(3 * STRIDE);
  const slide21 = rect(4 * STRIDE);
  const d = delta(slide16, slide21);
  assert.ok(d > 0, 'precisa descer');

  const innerTop = TOPO;
  const innerBottom = VP_H - FUNDO;
  const actual = apos(slide16, d);
  const prox = apos(slide21, d);

  assert.ok(actual.top >= innerTop - 0.5, 'slide actual não corta no topo');
  assert.ok(actual.bottom <= innerBottom + 0.5, 'slide actual não corta no fundo');
  assert.ok(
    pxVisiveisNoInner(prox, innerTop, innerBottom) >= CHIP - 1,
    'linha seguinte fica inteira visível quando cabe'
  );
});

test('nearest antigo esconderia 21–25; o delta extra é maior que o mínimo do actual', () => {
  const slide16 = rect(3 * STRIDE);
  const slide21 = rect(4 * STRIDE);
  const nearest = deltaScrollGrelhaSlidesAntecipado({
    viewport: viewport(),
    chip: slide16,
    lookahead: null,
  });
  const comLookahead = delta(slide16, slide21);
  assert.ok(nearest > 0);
  assert.ok(comLookahead > nearest);
});

test('actual já visível mas linha seguinte oculta: puxa a antecipação', () => {
  const slide16 = rect(80);
  const slide21 = rect(VP_H + 20);
  const d = delta(slide16, slide21);
  assert.ok(d > 0);
  const prox = apos(slide21, d);
  assert.ok(pxVisiveisNoInner(prox, TOPO, VP_H - FUNDO) > 0);
});

test('voltar: chip cortado no topo sobe o mínimo e não desce por causa do lookahead', () => {
  const slide5 = rect(-40);
  const slide10 = rect(70);
  const d = delta(slide5, slide10);
  assert.ok(d < 0);
  const actual = apos(slide5, d);
  assert.ok(actual.top >= TOPO - 0.5);
});

test('chip mais alto que o viewport: alinha ao topo, sem lookahead', () => {
  const chip = rect(40, 400);
  const d = deltaScrollGrelhaSlidesAntecipado({
    viewport: viewport(),
    chip,
    lookahead: rect(450),
  });
  assert.equal(d, 40 - TOPO);
});

test('última linha (sem lookahead): só o nearest do actual', () => {
  const slide31 = rect(3 * STRIDE);
  const d = delta(slide31, null);
  const innerBottom = VP_H - FUNDO;
  assert.equal(d, slide31.bottom - innerBottom);
});

test('viewport pequeno: actual prevalece; lookahead só o que couber abaixo', () => {
  const vp = { top: 0, bottom: 130, height: 130 };
  const chip = rect(10);
  const look = rect(120);
  const d = deltaScrollGrelhaSlidesAntecipado({ viewport: vp, chip, lookahead: look });
  const actual = apos(chip, d);
  assert.ok(actual.top >= TOPO - 0.5);
  assert.ok(actual.bottom <= vp.bottom - FUNDO + 0.5);
});

test('lookahead na mesma linha é ignorado', () => {
  const slide16 = rect(3 * STRIDE);
  const slide17 = rect(3 * STRIDE);
  const nearest = deltaScrollGrelhaSlidesAntecipado({
    viewport: viewport(),
    chip: slide16,
    lookahead: null,
  });
  assert.equal(delta(slide16, slide17), nearest);
});
