'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { attachPublicProjectionRender } = require('./publicProjectionRender');
const contagemLib = require('../../src/contagemRegressiva');

/**
 * DOM falso, do tamanho exacto do que o renderer toca.
 *
 * Um jsdom aqui seria mais fiel e muito mais lento, e nada do que este teste verifica
 * depende de layout: a pergunta é «que texto e que cor foram parar aos dígitos, dado o
 * tempo que passou» — não «onde é que a caixa ficou».
 */
function elementoFalso() {
  const classes = new Set();
  return {
    textContent: '',
    hidden: false,
    style: {
      _props: {},
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

/**
 * Contexto mínimo. O renderer chama `setInterval`/`clearInterval` do escopo global do
 * módulo (não de `ctx`), por isso o relógio é controlado substituindo-os — e restaurando
 * no fim, para um teste não contaminar o seguinte.
 */
function contextoFalso() {
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
    estadoAtual: {},
    renderizarLinhas() {},
    aplicarFontSize() {},
    pararRelogio() {},
    performance: { now: () => ctx._agora },
    _agora: 0,
  };
  attachPublicProjectionRender(ctx);
  return ctx;
}

/** Corre `fn` com `setInterval` falso; devolve o tick registado para o disparar à mão. */
function comIntervaloFalso(fn) {
  const setReal = global.setInterval;
  const clearReal = global.clearInterval;
  const ticks = new Map();
  let id = 0;
  global.setInterval = (cb) => {
    id += 1;
    ticks.set(id, cb);
    return id;
  };
  global.clearInterval = (i) => ticks.delete(i);
  try {
    return fn({
      correr: () => ticks.forEach((cb) => cb()),
      ativos: () => ticks.size,
    });
  } finally {
    global.setInterval = setReal;
    global.clearInterval = clearReal;
  }
}

function estadoContagem(extra = {}) {
  return {
    tipo: 'contagem',
    telaLimpa: false,
    blackout: false,
    slidePretoFinal: false,
    linhas: [],
    contagem: {
      rodando: true,
      restanteMs: 300_000,
      excedenteMs: 0,
      duracaoMs: 300_000,
      contagemConfig: contagemLib.normalizarCfgContagem({}),
      ...extra,
    },
  };
}

test('a contagem desenha os dígitos e revela a caixa', () => {
  comIntervaloFalso(() => {
    const ctx = contextoFalso();
    ctx.exibir(estadoContagem());

    assert.equal(ctx.elContagemBox.hidden, false);
    assert.equal(ctx.elContagemDigitos.textContent, '05:00');
    assert.equal(ctx.document.body._classes.has('modo-contagem-projecao'), true);
  });
});

test('os dígitos descem com o relógio local, sem o host falar outra vez', () => {
  comIntervaloFalso((tick) => {
    const ctx = contextoFalso();
    ctx.exibir(estadoContagem());

    ctx._agora = 61_000;
    tick.correr();

    assert.equal(ctx.elContagemDigitos.textContent, '03:59');
  });
});

test('pausada, a tela não conta e não agenda tick', () => {
  comIntervaloFalso((tick) => {
    const ctx = contextoFalso();
    ctx.exibir(estadoContagem({ rodando: false, restanteMs: 120_000 }));

    assert.equal(tick.ativos(), 0, 'contagem parada não precisa de tick');
    ctx._agora = 600_000;
    tick.correr();
    assert.equal(ctx.elContagemDigitos.textContent, '02:00');
  });
});

test('a cor muda na reta final e volta ao normal fora dela', () => {
  comIntervaloFalso((tick) => {
    const ctx = contextoFalso();
    const cfg = contagemLib.normalizarCfgContagem({
      alertaSegundos: 60,
      alertaColor: '#ff0000',
      textColor: '#ffffff',
    });
    ctx.exibir(estadoContagem({ restanteMs: 120_000, contagemConfig: cfg }));
    assert.equal(ctx.elContagemDigitos.style.color, '#ffffff');

    ctx._agora = 70_000;
    tick.correr();
    assert.equal(ctx.elContagemDigitos.style.color, '#ff0000');
  });
});

test('ao chegar a zero, o tick pára — não há mais nada a redesenhar', () => {
  comIntervaloFalso((tick) => {
    const ctx = contextoFalso();
    ctx.exibir(estadoContagem({ restanteMs: 5_000 }));
    assert.equal(tick.ativos(), 1);

    ctx._agora = 6_000;
    tick.correr();

    assert.equal(ctx.elContagemDigitos.textContent, '00:00');
    assert.equal(tick.ativos(), 0, 'em zero e sem contar para cima, o tick é desperdício');
  });
});

test('o texto final ocupa o lugar dos dígitos ao zerar', () => {
  comIntervaloFalso((tick) => {
    const ctx = contextoFalso();
    const cfg = contagemLib.normalizarCfgContagem({ textoFinal: 'COMEÇAMOS!' });
    ctx.exibir(estadoContagem({ restanteMs: 1_000, contagemConfig: cfg }));

    ctx._agora = 2_000;
    tick.correr();
    assert.equal(ctx.elContagemDigitos.textContent, 'COMEÇAMOS!');
  });
});

test('o modo «subir» continua a contar depois do zero, com sinal', () => {
  comIntervaloFalso((tick) => {
    const ctx = contextoFalso();
    const cfg = contagemLib.normalizarCfgContagem({ aoZerar: 'subir' });
    ctx.exibir(estadoContagem({ restanteMs: 10_000, contagemConfig: cfg }));

    ctx._agora = 52_000;
    tick.correr();

    assert.equal(ctx.elContagemDigitos.textContent, '+00:42');
    assert.equal(tick.ativos(), 1, 'a contar para cima, o tick tem de continuar');
  });
});

test('uma contagem que já chegou ao painel estourada continua o excedente daí', () => {
  /* O host manda `restanteMs: 0` e `excedenteMs: 30000` quando a tela liga depois do
     zero. Somar mal aqui faria o telão recomeçar o excedente do nada. */
  comIntervaloFalso((tick) => {
    const ctx = contextoFalso();
    const cfg = contagemLib.normalizarCfgContagem({ aoZerar: 'subir' });
    ctx.exibir(estadoContagem({ restanteMs: 0, excedenteMs: 30_000, contagemConfig: cfg }));
    assert.equal(ctx.elContagemDigitos.textContent, '+00:30');

    ctx._agora = 12_000;
    tick.correr();
    assert.equal(ctx.elContagemDigitos.textContent, '+00:42');
  });
});

test('sair da contagem apaga a caixa e mata o tick', () => {
  comIntervaloFalso((tick) => {
    const ctx = contextoFalso();
    ctx.exibir(estadoContagem());
    assert.equal(tick.ativos(), 1);

    ctx.exibir({ tipo: 'musica', telaLimpa: false, linhas: ['Santo'] });

    assert.equal(ctx.elContagemBox.hidden, true);
    assert.equal(ctx.elContagemDigitos.textContent, '');
    assert.equal(tick.ativos(), 0);
    assert.equal(ctx.document.body._classes.has('modo-contagem-projecao'), false);
  });
});

test('blackout apaga a contagem na tela sem a esquecer no host', () => {
  comIntervaloFalso((tick) => {
    const ctx = contextoFalso();
    ctx.exibir(estadoContagem());

    ctx.exibir({ ...estadoContagem(), blackout: true });

    assert.equal(ctx.elContagemBox.hidden, true);
    assert.equal(tick.ativos(), 0);
  });
});

test('mudar a config de Slides não reancora a contagem', () => {
  /* Regressão: `aplicarConfig` redesenhava a partir do estado guardado, cujo `restanteMs`
     é o do envio — os dígitos saltavam para trás quando o operador mexia num slider. */
  comIntervaloFalso((tick) => {
    const ctx = contextoFalso();
    ctx.exibir(estadoContagem());

    ctx._agora = 120_000;
    tick.correr();
    assert.equal(ctx.elContagemDigitos.textContent, '03:00');

    ctx.aplicarConfig({ publico: { fontSize: 9 } });
    tick.correr();

    assert.equal(ctx.elContagemDigitos.textContent, '03:00', 'o tempo não pode voltar atrás');
  });
});

test('o fundo da contagem é o dela, não o dos slides', () => {
  comIntervaloFalso(() => {
    const ctx = contextoFalso();
    const cfg = contagemLib.normalizarCfgContagem({ bgType: 'solid', bgColor: '#123456' });
    ctx.exibir(estadoContagem({ contagemConfig: cfg }));

    assert.equal(
      ctx.document.documentElement.style._props['--bg-contagem-projecao'],
      '#123456'
    );
  });
});

test('uma contagem sem dados não é tratada como contagem', () => {
  comIntervaloFalso(() => {
    const ctx = contextoFalso();
    ctx.exibir({ tipo: 'contagem', telaLimpa: false, linhas: [], contagem: null });

    assert.equal(ctx.elContagemBox.hidden, true);
    assert.equal(ctx.document.body._classes.has('modo-contagem-projecao'), false);
  });
});
