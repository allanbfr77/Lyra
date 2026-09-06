'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FONT_SIZE_VH_SLIDES_MAX,
  fontSizeVhPublico,
  lineHeightCssPublico,
  normalizarFontSizeVhPublicoParaForm,
  normalizarLineHeightParaForm,
} = require('./escalaTipografiaPublico');

test('espaçamento 1.00 é line-height 1, não 2 (regressão do limiar 1.05)', () => {
  assert.equal(lineHeightCssPublico({ lineSpacing: 1 }), '1');
  assert.equal(lineHeightCssPublico({ lineSpacing: 1.0 }), '1');
  assert.equal(normalizarLineHeightParaForm(1), 1);
  assert.equal(normalizarLineHeightParaForm(1.0), 1);
});

test('espaçamento 1.35 e 2.00 aplicam-se tal qual', () => {
  assert.equal(lineHeightCssPublico({ lineSpacing: 1.35 }), '1.35');
  assert.equal(lineHeightCssPublico({ lineSpacing: 2 }), '2');
  assert.ok(Number(lineHeightCssPublico({ lineSpacing: 2 })) < 2.3);
});

test('legado abaixo de 1 continua a ser incremento', () => {
  assert.equal(lineHeightCssPublico({ lineSpacing: 0.5 }), '1.5');
  assert.equal(normalizarLineHeightParaForm(0.35), 1.35);
});

test('fonte do telão: 0–12; 13 e 14 caem em 12', () => {
  assert.equal(fontSizeVhPublico({ fontSize: 0 }), 0);
  assert.equal(fontSizeVhPublico({ fontSize: 6 }), 6);
  assert.equal(fontSizeVhPublico({ fontSize: 12 }), 12);
  assert.equal(fontSizeVhPublico({ fontSize: 13 }), FONT_SIZE_VH_SLIDES_MAX);
  assert.equal(fontSizeVhPublico({ fontSize: 14 }), FONT_SIZE_VH_SLIDES_MAX);
  assert.equal(normalizarFontSizeVhPublicoParaForm(13), 12);
  assert.equal(normalizarFontSizeVhPublicoParaForm(14), 12);
  assert.equal(normalizarFontSizeVhPublicoParaForm(0), 0);
});

test('aviso pode pedir teto acima de 12 via fontSizeMaxVh', () => {
  assert.equal(fontSizeVhPublico({ fontSize: 30, fontSizeMaxVh: 40 }), 30);
});
