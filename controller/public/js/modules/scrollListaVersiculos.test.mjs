import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLGA_TOPO_LISTA_VERSICULOS as TOPO,
  FOLGA_FUNDO_LISTA_VERSICULOS as FUNDO,
  deltaScrollListaVersiculos,
} from './scrollListaVersiculos.js';

const H = 80;
const GAP = 6;
const STRIDE = H + GAP;
const VP_H = 360;

function rect(top, height = H) {
  return { top, bottom: top + height, height };
}

function viewport(height = VP_H) {
  return { top: 0, bottom: height, height };
}

function delta(foco, seguintes, vp = viewport()) {
  return deltaScrollListaVersiculos({ viewport: vp, foco, seguintes });
}

function apos(r, d) {
  return { top: r.top - d, bottom: r.bottom - d, height: r.height };
}

test('focado e os dois seguintes já visíveis: não rola', () => {
  const foco = rect(40);
  const s1 = rect(40 + STRIDE);
  const s2 = rect(40 + 2 * STRIDE);
  assert.equal(delta(foco, [s1, s2]), 0);
});

test('focado no fundo com o seguinte cortado: desce até o seguinte caber', () => {
  const foco = rect(VP_H - H - 4);
  const s1 = rect(foco.bottom + GAP);
  const d = delta(foco, [s1]);
  assert.ok(d > 0, 'precisa descer');

  const innerTop = TOPO;
  const innerBottom = VP_H - FUNDO;
  const f = apos(foco, d);
  const n = apos(s1, d);
  assert.ok(f.top >= innerTop - 0.5, 'focado não corta no topo');
  assert.ok(f.bottom <= innerBottom + 0.5, 'focado não cola no fundo');
  assert.ok(n.bottom <= innerBottom + 0.5, 'seguinte fica inteiro visível');
});

test('cabe o segundo seguinte: puxa os dois, não só o imediato', () => {
  const foco = rect(VP_H - H - 10);
  const s1 = rect(foco.bottom + GAP);
  const s2 = rect(s1.bottom + GAP);
  const soUm = delta(foco, [s1]);
  const comDois = delta(foco, [s1, s2]);
  assert.ok(comDois > soUm, 'dois seguintes pedem mais scroll que um');

  const innerBottom = VP_H - FUNDO;
  const n2 = apos(s2, comDois);
  assert.ok(n2.bottom <= innerBottom + 0.5, 'o segundo seguinte cabe');
});

test('dois seguintes não cabem: exige só o imediato e não empurra o focado para fora', () => {
  const vp = viewport(200);
  const foco = rect(90);
  const s1 = rect(90 + STRIDE);
  const s2 = rect(90 + 2 * STRIDE);
  const d = delta(foco, [s1, s2], vp);
  const innerTop = TOPO;
  const innerBottom = vp.height - FUNDO;
  const f = apos(foco, d);
  const n1 = apos(s1, d);
  const n2 = apos(s2, d);
  assert.ok(d > 0, 'precisa descer pelo imediato');
  assert.ok(f.top >= innerTop - 0.5);
  assert.ok(n1.bottom <= innerBottom + 0.5, 'o imediato fica visível');
  assert.ok(n2.bottom > innerBottom, 'o segundo não é exigido se não cabe');
});

test('voltar: focado cortado no topo sobe e não desce por causa do seguinte', () => {
  const foco = rect(-30);
  const s1 = rect(-30 + STRIDE);
  const d = delta(foco, [s1]);
  assert.ok(d < 0);
  const f = apos(foco, d);
  assert.ok(f.top >= TOPO - 0.5);
});

test('último versículo cortado no fundo: só o nearest do focado', () => {
  const foco = rect(VP_H - 40);
  const d = delta(foco, []);
  assert.equal(d, foco.bottom - (VP_H - FUNDO));
});

test('versículo mais alto que o viewport: alinha ao topo', () => {
  const foco = rect(40, 400);
  const d = delta(foco, [rect(450)]);
  assert.equal(d, 40 - TOPO);
});
