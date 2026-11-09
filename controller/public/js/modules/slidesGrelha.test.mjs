import test from 'node:test';
import assert from 'node:assert/strict';
import {
  zoomPercentualSlides,
  zoomPorColunasSlides,
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

test('zoomPorColunasSlides: 3 por linha = 100%, vai de 150% (2) a 50% (6)', () => {
  assert.equal(zoomPercentualSlides(zoomPorColunasSlides(2)), 150);
  assert.equal(zoomPercentualSlides(zoomPorColunasSlides(3)), 100);
  assert.equal(zoomPercentualSlides(zoomPorColunasSlides(4)), 75);
  assert.equal(zoomPercentualSlides(zoomPorColunasSlides(5)), 60);
  assert.equal(zoomPercentualSlides(zoomPorColunasSlides(6)), 50);
});

test('normalizarSlidesPorLinha aceita de 2 a 6', () => {
  assert.equal(normalizarSlidesPorLinha(7), SLIDES_POR_LINHA_PADRAO);
  assert.equal(normalizarSlidesPorLinha(1), SLIDES_POR_LINHA_PADRAO);
  assert.equal(normalizarSlidesPorLinha(2), 2);
  assert.equal(normalizarSlidesPorLinha(6), 6);
  assert.equal(normalizarSlidesPorLinha(5), 5);
  assert.equal(normalizarSlidesPorLinha(3), 3);
  assert.equal(normalizarSlidesPorLinha(4), 4);
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
