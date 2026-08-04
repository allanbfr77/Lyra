'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { criarArmazemDeProjecao } = require('./projectionStore');
const { criarAplicadorDeComandos } = require('./commandApplier');
const { CAMPOS_PORTA } = require('../../../server/src/lib/projectionState');
const projectionEncerrar = require('./projectionEncerrar');

test('o armazém cobre exatamente os campos da porta de estado', () => {
  // Se a porta ganhar um campo e o armazém não, o modo local partiria com `undefined`
  // num sítio onde o Servidor tem valor — e só se notaria em produção.
  assert.deepEqual(Object.keys(criarArmazemDeProjecao()).sort(), [...CAMPOS_PORTA].sort());
});

test('arranca com as telas limpas', () => {
  const store = criarArmazemDeProjecao();
  assert.equal(store.estadoAtual.tipo, null);
  assert.equal(store.estadoAtual.telaLimpa, true);
  assert.equal(store.estadoPublicoOverride, null);
  assert.equal(store.ministranteApresentacaoOverride, null);
  assert.equal(store.projecaoLiveAtiva, false);
});

test('as duas configs nascem separadas', () => {
  // Entrar no modo Bíblia não pode comer o tema dos slides.
  const store = criarArmazemDeProjecao();
  assert.notEqual(store.displayConfig, store.displayConfigBiblia);
  assert.equal(store.modoVisualProjecaoAtivo, 'slides');
});

test('aceita config já lida do disco pelo host', () => {
  const doDisco = { publico: { fontSize: 64 }, ministrante: {}, clock: {} };
  const store = criarArmazemDeProjecao({ displayConfig: doDisco });
  assert.equal(store.displayConfig, doDisco);
});

test('cada armazém é independente', () => {
  const a = criarArmazemDeProjecao();
  const b = criarArmazemDeProjecao();
  a.estadoAtual.blackout = true;
  assert.equal(b.estadoAtual.blackout, false);
});

test('os módulos de projeção escrevem no armazém como escrevem no ctx', () => {
  const store = criarArmazemDeProjecao();
  store.estadoAtual = { ...store.estadoAtual, tipo: 'musica', telaLimpa: false };
  store.estadoPublicoOverride = { tipo: 'apresentacao' };

  projectionEncerrar.encerrarTodasCamadas(store);

  assert.equal(store.estadoAtual.tipo, null);
  assert.equal(store.estadoPublicoOverride, null);
});

test('o aplicador opera sobre o armazém sem qualquer ctx', () => {
  // É este o teste que importa: a mesma regra que o Servidor corre, correndo em cima de
  // estado que não pertence a Servidor nenhum.
  const store = criarArmazemDeProjecao();
  const chamadas = [];
  const engine = {
    render: () => ({ estadoPublico: { ok: true } }),
    atualizarDisplays: () => chamadas.push('atualizarDisplays'),
    atualizarDisplayMinistrante: () => chamadas.push('atualizarDisplayMinistrante'),
    aplicarDisplayConfigNasJanelas: () => chamadas.push('config'),
    estadoPublicoParaSocketsOuApi: () => ({ ok: true }),
    garantirTelasAbertasParaProjecao: () => chamadas.push('garantirTelas'),
  };

  const aplicador = criarAplicadorDeComandos({ state: store, engine });
  const { eventos, aplicado } = aplicador.aplicar('exibir_musica', {
    estrofes: ['Primeira', 'Segunda'],
    estrofeIndex: 0,
    titulo: 'Santo',
  });

  assert.equal(aplicado, true);
  assert.equal(store.estadoAtual.tipo, 'musica');
  assert.deepEqual(store.estadoAtual.linhas, ['Primeira']);
  assert.deepEqual(
    eventos.map((e) => e.nome),
    ['estado', 'estado_biblia_obs']
  );
});
