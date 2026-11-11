import test from 'node:test';
import assert from 'node:assert/strict';
import './_stubDom.mjs';
import { estadoPainel } from './estadoPainel.js';
import {
  formatarContagemPainel,
  normalizarAlvoContagemPainel,
  fundoCssPreviewContagem,
  rotaContagemParaServidor,
  iniciarContagemRegressivaPainel,
} from './contagemRegressiva.js';
import { clonarCfgContagemPadrao, formatarContagem } from '../modules/contagemPainel.js';

test('normalizarAlvoContagemPainel: só «ambos» sai de «publico»', () => {
  assert.equal(normalizarAlvoContagemPainel('ambos'), 'ambos');
  assert.equal(normalizarAlvoContagemPainel('AMBOS'), 'ambos');
  for (const v of ['publico', '', null, undefined, 'x', 3]) assert.equal(normalizarAlvoContagemPainel(v), 'publico', String(v));
});

test('fundoCssPreviewContagem: cor, gradiente e imagem (com aspas escapadas)', () => {
  assert.equal(fundoCssPreviewContagem({ bgType: 'solid', bgColor: '#123456' }), '#123456');
  assert.equal(fundoCssPreviewContagem({ bgType: 'solid' }), '#000000');
  assert.equal(fundoCssPreviewContagem({ bgType: 'gradient', bgGradient: 'linear-gradient(red, blue)' }), 'linear-gradient(red, blue)');
  assert.equal(fundoCssPreviewContagem({ bgType: 'gradient' }), '#000000');
  assert.equal(
    fundoCssPreviewContagem({ bgType: 'image', bgImage: "a'b.png" }),
    "url('a%27b.png') center/cover no-repeat"
  );
  assert.equal(fundoCssPreviewContagem({ bgType: 'image', bgImage: '', bgColor: '#fff' }), '#fff');
});

test('formatarContagemPainel usa a mesma regra do módulo puro com a configuração inicial', () => {
  const cfg = clonarCfgContagemPadrao();
  for (const ms of [0, 999, 1000, 59_000, 60_000, 3_599_000, 3_600_000, 5 * 60_000]) {
    assert.equal(formatarContagemPainel(ms), formatarContagem(ms, cfg), String(ms));
  }
});

function registrar(rotas, monitores = []) {
  estadoPainel.rotasPorModo = rotas;
  estadoPainel.monitoresServidorCache = monitores;
}

test('rotaContagemParaServidor: parada, o pin fica livre para não roubar monitores dos outros modos', () => {
  registrar({ contagem: { publicoIndex: 2, ministranteIndex: -1 } });
  assert.deepEqual(rotaContagemParaServidor(), { publicoIndex: -1, ministranteIndex: -1 });
});

test('a inicialização é uma função exportada (antes era auto-invocada no núcleo)', () => {
  assert.equal(typeof iniciarContagemRegressivaPainel, 'function');
});
