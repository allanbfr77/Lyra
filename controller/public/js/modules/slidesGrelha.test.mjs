import test from 'node:test';
import assert from 'node:assert/strict';
import {
  zoomPercentualSlides,
  clampSlidesChipZoom,
  normalizarSlidesPorLinha,
  digestEstrofesParaStripFaixa,
  textoSlideMaiusculo,
  SLIDES_POR_LINHA_PADRAO,
} from './slidesGrelha.js';

test('zoomPercentualSlides arredonda para percentagem inteira', () => {
  assert.equal(zoomPercentualSlides(1), 100);
  assert.equal(zoomPercentualSlides(0.5), 50);
  assert.equal(zoomPercentualSlides(1.5), 150);
  assert.equal(zoomPercentualSlides(Number.NaN), 100);
});

test('clampSlidesChipZoom alinha a passos de 5% e limita 50–150', () => {
  assert.equal(clampSlidesChipZoom(1), 1);
  assert.equal(clampSlidesChipZoom(0.52), 0.5);
  assert.equal(clampSlidesChipZoom(0.53), 0.55);
  assert.equal(clampSlidesChipZoom(0.1), 0.5);
  assert.equal(clampSlidesChipZoom(3), 1.5);
});

test('normalizarSlidesPorLinha só aceita 7, 5 ou 3', () => {
  assert.equal(normalizarSlidesPorLinha(7), 7);
  assert.equal(normalizarSlidesPorLinha(5), 5);
  assert.equal(normalizarSlidesPorLinha(3), 3);
  assert.equal(normalizarSlidesPorLinha(4), SLIDES_POR_LINHA_PADRAO);
  assert.equal(normalizarSlidesPorLinha('x'), SLIDES_POR_LINHA_PADRAO);
});

test('digestEstrofesParaStripFaixa muda se o texto ou o número de estrofes mudar', () => {
  const a = digestEstrofesParaStripFaixa(['A', 'B']);
  const b = digestEstrofesParaStripFaixa(['A', 'B']);
  const c = digestEstrofesParaStripFaixa(['A', 'C']);
  const d = digestEstrofesParaStripFaixa(['A', 'B', '']);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.equal(digestEstrofesParaStripFaixa([]), '0');
  assert.equal(digestEstrofesParaStripFaixa(null), '0');
});

test('textoSlideMaiusculo cobre null e acentos', () => {
  assert.equal(textoSlideMaiusculo('graça'), 'GRAÇA');
  assert.equal(textoSlideMaiusculo(''), '');
  assert.equal(textoSlideMaiusculo(null), '');
});
