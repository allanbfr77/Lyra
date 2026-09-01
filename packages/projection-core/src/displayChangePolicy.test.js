'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  metricasRelevantesParaJanelas,
  ligarTratadorMudancaDisplays,
} = require('./displayChangePolicy');

describe('metricasRelevantesParaJanelas', () => {
  it('workArea sozinha não reorganiza janelas — é o loop do projetor', () => {
    assert.equal(metricasRelevantesParaJanelas(['workArea']), false);
  });

  it('bounds, escala ou rotação justificam reorganizar', () => {
    assert.equal(metricasRelevantesParaJanelas(['bounds']), true);
    assert.equal(metricasRelevantesParaJanelas(['scaleFactor']), true);
    assert.equal(metricasRelevantesParaJanelas(['rotation']), true);
    assert.equal(metricasRelevantesParaJanelas(['workArea', 'bounds']), true);
  });

  it('lista omitida trata-se como relevante (não ignorar um resize real)', () => {
    assert.equal(metricasRelevantesParaJanelas(undefined), true);
    assert.equal(metricasRelevantesParaJanelas([]), true);
  });
});

function ecranFalso() {
  const handlers = new Map();
  return {
    handlers,
    on(evento, fn) {
      if (!handlers.has(evento)) handlers.set(evento, []);
      handlers.get(evento).push(fn);
    },
    removeListener(evento, fn) {
      const lista = handlers.get(evento) || [];
      handlers.set(evento, lista.filter((f) => f !== fn));
    },
    emitir(evento, ...args) {
      for (const fn of handlers.get(evento) || []) fn(...args);
    },
  };
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('ligarTratadorMudancaDisplays', () => {
  it('workArea sozinha não chama reorganização nem atualiza a lista', async () => {
    const screen = ecranFalso();
    const lista = [];
    const etapas = [];
    const desligar = ligarTratadorMudancaDisplays(screen, {
      aoListaMonitores: () => lista.push('lista'),
      aoReorganizarJanelas: (e) => etapas.push(e),
    }, { debounceMetricasMs: 0, debouncePlugMs: 0, atrasoRevalidarMs: 30 });

    screen.emitir('display-metrics-changed', {}, { id: 2 }, ['workArea']);
    await esperar(20);

    assert.deepEqual(lista, []);
    assert.deepEqual(etapas, []);
    desligar();
  });

  it('bounds dispara um único sync depois do debounce, sem segunda passagem', async () => {
    const screen = ecranFalso();
    const etapas = [];
    const desligar = ligarTratadorMudancaDisplays(screen, {
      aoReorganizarJanelas: (e) => etapas.push(e),
    }, { debounceMetricasMs: 15, debouncePlugMs: 0, atrasoRevalidarMs: 80 });

    screen.emitir('display-metrics-changed', {}, { id: 2 }, ['bounds']);
    screen.emitir('display-metrics-changed', {}, { id: 2 }, ['bounds']);
    await esperar(40);

    assert.deepEqual(etapas, ['metrics']);
    desligar();
  });

  it('passagens de arranque cobrem o projetor que ainda não estava enumerado', async () => {
    /*
     * A primeira varredura do host corre no `whenReady()`. Se o projetor ainda não estiver
     * enumerado nesse instante, `podeAbrirJanelaSecundaria()` devolve falso e nenhuma
     * janela é aberta — o seletor mostra «M2 (Público)» e a projeção não usa o monitor.
     * Estas passagens são a rede para esse caso.
     */
    const screen = ecranFalso();
    const etapas = [];
    const desligar = ligarTratadorMudancaDisplays(screen, {
      aoReorganizarJanelas: (e) => etapas.push(e),
    }, { atrasosArranqueMs: [10, 25] });

    await esperar(60);

    assert.deepEqual(etapas, ['arranque-1', 'arranque-2']);
    desligar();
  });

  it('um evento de ecrã real cancela as passagens de arranque, sem duplicar varreduras', async () => {
    const screen = ecranFalso();
    const etapas = [];
    const desligar = ligarTratadorMudancaDisplays(screen, {
      aoReorganizarJanelas: (e) => etapas.push(e),
    }, { atrasosArranqueMs: [40, 80], debouncePlugMs: 0, atrasoRevalidarMs: 10 });

    screen.emitir('display-added');
    await esperar(100);

    assert.deepEqual(etapas, ['plug-imediato', 'plug-revalidacao']);
    desligar();
  });

  it('desligar cancela as passagens de arranque pendentes', async () => {
    const screen = ecranFalso();
    const etapas = [];
    const desligar = ligarTratadorMudancaDisplays(screen, {
      aoReorganizarJanelas: (e) => etapas.push(e),
    }, { atrasosArranqueMs: [30] });

    desligar();
    await esperar(60);

    assert.deepEqual(etapas, []);
  });

  it('plug coalescido: uma passagem imediata e uma revalidação, não uma por evento', async () => {
    const screen = ecranFalso();
    const etapas = [];
    const desligar = ligarTratadorMudancaDisplays(screen, {
      aoReorganizarJanelas: (e) => etapas.push(e),
    }, { debounceMetricasMs: 0, debouncePlugMs: 15, atrasoRevalidarMs: 50 });

    screen.emitir('display-removed');
    screen.emitir('display-added');
    await esperar(80);

    assert.deepEqual(etapas, ['plug-imediato', 'plug-revalidacao']);
    desligar();
  });
});
