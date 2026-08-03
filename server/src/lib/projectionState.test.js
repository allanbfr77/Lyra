'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { createProjectionState, CAMPOS_PORTA, CAMPOS_ESTADO, CAMPOS_JANELAS } = require('./projectionState');

function ctxFalso() {
  return {
    estadoAtual: { tipo: 'musica', titulo: 'Hino' },
    estadoMinistrante: { atual: 'linha um' },
    estadoPublicoOverride: null,
    ministranteApresentacaoOverride: null,
    projecaoLiveAtiva: false,
    displayConfig: { publico: {}, ministrante: {}, clock: {} },
    displayConfigBiblia: null,
    modoVisualProjecaoAtivo: null,
    windowsDisplay: [],
    windowControl: null,
    // fora da porta de propósito (transporte / app-shell):
    io: { emit: () => {} },
    controladorSocketId: 'abc',
    minimizeToTrayEnabled: true,
  };
}

test('expõe exactamente os campos dos baldes A e B', () => {
  const porta = createProjectionState(ctxFalso());
  assert.deepStrictEqual(Object.keys(porta).sort(), [...CAMPOS_PORTA].sort());
  assert.deepStrictEqual([...CAMPOS_ESTADO, ...CAMPOS_JANELAS], CAMPOS_PORTA);
});

test('não expõe transporte nem preferências do app-shell', () => {
  const porta = createProjectionState(ctxFalso());
  for (const campo of ['io', 'controladorSocketId', 'minimizeToTrayEnabled', 'tray', 'acesso']) {
    assert.strictEqual(porta[campo], undefined, `porta não deve expor ${campo}`);
  }
});

test('leitura devolve a MESMA referência do ctx (não uma cópia)', () => {
  const ctx = ctxFalso();
  const porta = createProjectionState(ctx);
  assert.strictEqual(porta.estadoAtual, ctx.estadoAtual);
  assert.strictEqual(porta.displayConfig, ctx.displayConfig);
  assert.strictEqual(porta.windowControl, ctx.windowControl);
});

test('o registo de janelas NÃO passa pela porta (saiu no sub-passo 3b)', () => {
  const ctx = ctxFalso();
  const porta = createProjectionState(ctx);
  assert.ok(!CAMPOS_PORTA.includes('windowsDisplay'), 'windowsDisplay não é campo da porta');
  assert.strictEqual(porta.windowsDisplay, undefined);
  /* `undefined` é a resposta certa: código antigo que tente `state.windowsDisplay.filter`
     rebenta alto, em vez de operar sobre uma lista vazia em silêncio. */
});

test('escrita na porta escreve no ctx (o motor também muta o estado)', () => {
  const ctx = ctxFalso();
  const porta = createProjectionState(ctx);

  const novo = { tipo: 'biblia', titulo: 'João 3' };
  porta.estadoAtual = novo;
  assert.strictEqual(ctx.estadoAtual, novo);

  porta.projecaoLiveAtiva = true;
  assert.strictEqual(ctx.projecaoLiveAtiva, true);

  porta.estadoPublicoOverride = null;
  assert.strictEqual(ctx.estadoPublicoOverride, null);

  const janelaControle = { id: 'wc' };
  porta.windowControl = janelaControle;
  assert.strictEqual(ctx.windowControl, janelaControle);
});

test('mudança feita fora, no ctx, aparece na porta (sem cache)', () => {
  const ctx = ctxFalso();
  const porta = createProjectionState(ctx);
  ctx.modoVisualProjecaoAtivo = 'biblia';
  assert.strictEqual(porta.modoVisualProjecaoAtivo, 'biblia');
});

test('a porta é estruturalmente compatível com o ctx nos helpers que a recebem', () => {
  // displayConfigModo.inferirForcarModoJanelas lê estadoAtual/modoVisualProjecaoAtivo/displayConfigBiblia
  const displayConfigModo = require('./displayConfigModo');
  const ctx = ctxFalso();
  const porta = createProjectionState(ctx);
  assert.strictEqual(
    displayConfigModo.inferirForcarModoJanelas(porta),
    displayConfigModo.inferirForcarModoJanelas(ctx)
  );

  ctx.estadoAtual = { tipo: 'biblia' };
  assert.strictEqual(
    displayConfigModo.inferirForcarModoJanelas(porta),
    displayConfigModo.inferirForcarModoJanelas(ctx)
  );
  assert.strictEqual(displayConfigModo.inferirForcarModoJanelas(porta), 'biblia');
});

test('escrita feita por um helper através da porta chega ao ctx', () => {
  const displayConfigModo = require('./displayConfigModo');
  const ctx = ctxFalso();
  const porta = createProjectionState(ctx);
  displayConfigModo.aplicarPatchNoModo(porta, { publico: { fontSize: 64 } }, 'slides');
  assert.strictEqual(ctx.displayConfig.publico.fontSize, 64);
});

test('rejeita fonte inválida', () => {
  assert.throws(() => createProjectionState(null), TypeError);
  assert.throws(() => createProjectionState('ctx'), TypeError);
});
