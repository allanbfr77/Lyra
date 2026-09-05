'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { attachPublicProjectionRender } = require('./publicProjectionRender');

/**
 * DOM mínimo para perguntar: com o telão ocioso, o fundo decorativo do modo
 * (creme `#f5f2ea`, imagem, gradiente) chega ao CSS? Não pode — é o clarão no M2.
 */
function elementoFalso() {
  const classes = new Set();
  return {
    textContent: '',
    hidden: false,
    style: {
      _props: {},
      background: '',
      justifyContent: '',
      alignItems: '',
      setProperty(k, v) {
        this._props[k] = v;
      },
    },
    classList: {
      add: (c) => classes.add(c),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    _classes: classes,
  };
}

function contextoFalso(estadoInicial) {
  const ctx = {
    elTela: elementoFalso(),
    elTitulo: elementoFalso(),
    elLetras: elementoFalso(),
    elRefBiblica: elementoFalso(),
    elApresentacaoMedia: Object.assign(elementoFalso(), {
      querySelector: () => null,
      innerHTML: '',
    }),
    elClockOverlay: elementoFalso(),
    elContagemBox: elementoFalso(),
    elContagemMsgTopo: elementoFalso(),
    elContagemDigitos: elementoFalso(),
    elContagemMsgRodape: elementoFalso(),
    document: {
      body: elementoFalso(),
      documentElement: elementoFalso(),
      createElement: () => Object.assign(elementoFalso(), { appendChild() {} }),
    },
    displayConfig: { publico: {}, ministrante: {}, clock: {} },
    estadoAtual: estadoInicial || { telaLimpa: true },
    renderizarLinhas() {},
    aplicarFontSize() {},
    pararRelogio() {},
    performance: { now: () => 0 },
  };
  attachPublicProjectionRender(ctx);
  return ctx;
}

function fundoCss(ctx) {
  return ctx.document.documentElement.style._props['--bg-projecao'];
}

test('telão ocioso: display_config com fundo creme não pinta o CSS', () => {
  const ctx = contextoFalso({ telaLimpa: true, linhas: [] });
  ctx.aplicarConfig({
    publico: { bgType: 'solid', bgColor: '#f5f2ea' },
  });

  assert.equal(fundoCss(ctx), '#000000');
  assert.equal(ctx.document.body.style.background, '#000000');
  assert.equal(ctx.elTela.style.background, '#000000');
  assert.equal(ctx.document.body._classes.has('idle-sem-projecao'), true);
});

test('telão ocioso: imagem ou gradiente do modo também ficam de fora', () => {
  const ctx = contextoFalso({ tipo: 'biblia', telaLimpa: true, linhas: [] });
  ctx.aplicarConfig({
    publico: {
      bgType: 'image',
      bgColor: '#f5f2ea',
      bgImage: 'data:image/png;base64,xxxx',
      bgGradient: 'linear-gradient(135deg, #f5f2ea 0%, #e9e2d4 100%)',
    },
  });

  assert.equal(fundoCss(ctx), '#000000');
  assert.equal(ctx.document.body._classes.has('idle-sem-projecao'), true);
});

test('com estrofe projectada o fundo decorativo aplica-se', () => {
  const ctx = contextoFalso({
    tipo: 'musica',
    telaLimpa: false,
    linhas: ['Aleluia'],
  });
  ctx.aplicarConfig({
    publico: { bgType: 'solid', bgColor: '#112233' },
  });

  assert.equal(fundoCss(ctx), '#112233');
  assert.equal(ctx.document.body._classes.has('idle-sem-projecao'), false);
});

test('exibir conteúdo depois do ocioso pinta o fundo guardado, não o creme do preview', () => {
  const ctx = contextoFalso({ telaLimpa: true, linhas: [] });
  ctx.aplicarConfig({
    publico: { bgType: 'solid', bgColor: '#f5f2ea' },
  });
  assert.equal(fundoCss(ctx), '#000000');

  ctx.exibir({ tipo: 'musica', telaLimpa: false, linhas: ['Primeira estrofe'] });
  assert.equal(fundoCss(ctx), '#f5f2ea');
  assert.equal(ctx.document.body._classes.has('idle-sem-projecao'), false);
});
