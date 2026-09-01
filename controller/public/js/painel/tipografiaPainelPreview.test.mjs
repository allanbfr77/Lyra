import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularFontePxPreview,
  calcularFontePxSnippetGrelhaSlide,
  criarMedidorLarguraProporcionalCanvas,
  escalarLarguraFonte,
  REF_MEDICAO_SNIPPET_PX,
} from './tipografiaPainelPreview.js';

test('calcularFontePxPreview respeita limites mínimo e máximo', () => {
  const px = calcularFontePxPreview('ABCDEF', 400, 200);
  assert.ok(px >= 8 && px <= 22);
});

test('calcularFontePxPreview reduz com linha mais longa na mesma caixa', () => {
  const curta = calcularFontePxPreview('AB', 120, 80);
  const longa = calcularFontePxPreview('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 120, 80);
  assert.ok(longa < curta);
});

test('calcularFontePxSnippetGrelhaSlide começa grande e só encolhe para caber', () => {
  const textos = ['LINHA CURTA', 'OUTRA'];
  const medidas = [];
  const px = calcularFontePxSnippetGrelhaSlide({
    textos,
    availW: 200,
    availH: 100,
    nLinhasBloco: 2,
    lineHeight: 1.42,
    lineGapPx: 3,
    medirLarguraMaxPx: (fontPx) => {
      medidas.push(fontPx);
      return fontPx * 4.2;
    },
    medirAlturaBlocoPx: (fontPx) => fontPx * 3,
  });
  assert.ok(px > 15);
  assert.ok(medidas[0] > px || medidas.length === 0);
});

/**
 * Regressão do Modo Slides: `getComputedStyle().lineHeight` devolve px. Passar esse px
 * como razão esmagava o teto por altura e todos os cartões caíam no mínimo (~6px).
 */
test('calcularFontePxSnippetGrelhaSlide ignora line-height em px (regressão do texto minúsculo)', () => {
  const comum = {
    textos: ['ALELUIA'],
    availW: 185,
    availH: 124,
    nLinhasBloco: 1,
    lineGapPx: 3,
    minPx: 6,
    medirLarguraMaxPx: (px) => 'ALELUIA'.length * 0.6 * px,
  };
  const razao = calcularFontePxSnippetGrelhaSlide({ ...comum, lineHeight: 1.42 });
  const px = calcularFontePxSnippetGrelhaSlide({ ...comum, lineHeight: 18.93 });
  assert.ok(razao > 30);
  assert.equal(px, razao);
});

test('calcularFontePxSnippetGrelhaSlide preenche a altura quando a largura não limita', () => {
  const px = calcularFontePxSnippetGrelhaSlide({
    textos: ['A', 'B', 'C', 'D'],
    availW: 400,
    availH: 124,
    nLinhasBloco: 4,
    lineHeight: 1.42,
    lineGapPx: 3,
    medirLarguraMaxPx: (fontPx) => fontPx * 0.6,
  });
  const alturaUsada = 4 * 1.42 * px + 3 * 3;
  assert.ok(alturaUsada > 124 * 0.97 && alturaUsada <= 125);
});

test('calcularFontePxSnippetGrelhaSlide só encolhe quando a linha excede a largura', () => {
  const base = {
    availW: 185,
    availH: 124,
    lineHeight: 1.42,
    lineGapPx: 3,
    medirLarguraMaxPx: null,
  };
  const curto = calcularFontePxSnippetGrelhaSlide({
    ...base,
    textos: ['PAZ'],
    nLinhasBloco: 1,
    medirLarguraMaxPx: (px) => 3 * 0.6 * px,
  });
  const longo = calcularFontePxSnippetGrelhaSlide({
    ...base,
    textos: ['ESTA LINHA É BEM MAIS COMPRIDA'],
    nLinhasBloco: 1,
    medirLarguraMaxPx: (px) => 30 * 0.6 * px,
  });
  assert.ok(curto > longo);
  assert.ok(longo * 30 * 0.6 <= 185 + 0.5);
});

test('escalarLarguraFonte é proporcional ao font-size', () => {
  assert.equal(escalarLarguraFonte(200, 50, 100), 100);
  assert.equal(escalarLarguraFonte(200, 25, 100), 50);
  assert.equal(REF_MEDICAO_SNIPPET_PX, 100);
});

test('criarMedidorLarguraProporcionalCanvas mede uma vez e escala na bissecção', () => {
  const m = criarMedidorLarguraProporcionalCanvas({ letterSpacingEm: 0 });
  const a = m.medirLarguraMaxPx(100, ['ABC', 'AB']);
  const b = m.medirLarguraMaxPx(50, ['ABC', 'AB']);
  assert.ok(a > 0);
  assert.equal(Math.round((a / b) * 100) / 100, 2);
  /* Duas linhas distintas, uma medição real cada — a 2.ª chamada só escala o cache. */
  assert.equal(m.medidasReais(), 2);
  m.medirLarguraMaxPx(12.5, ['ABC']);
  assert.equal(m.medidasReais(), 2);
});
