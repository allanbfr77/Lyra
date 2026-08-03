'use strict';

/**
 * Sub-passo 3a: a entrega de `display_config` às janelas de projeção passa pelo motor.
 *
 * O risco que estes testes guardam é de FALHA SILENCIOSA: se um chamador esquecer o sink
 * e o registo de janelas já tiver saído do `ctx` (3b), o caminho histórico percorre uma
 * lista vazia e não lança nada — a config simplesmente deixa de chegar às telas.
 */

const test = require('node:test');
const assert = require('node:assert');

const displayConfigModo = require('./displayConfigModo');

function janelaFalsa(role) {
  const win = {
    role,
    sends: [],
    isDestroyed: () => false,
    webContents: { send: (canal, payload) => win.sends.push({ canal, payload }) },
  };
  return win;
}

function ctxFalso() {
  const pub = janelaFalsa('publico');
  const ctrl = janelaFalsa('controle');
  return {
    ctx: {
      displayConfig: { publico: {}, ministrante: {}, clock: {} },
      displayConfigBiblia: null,
      modoVisualProjecaoAtivo: null,
      estadoAtual: { tipo: 'musica' },
      windowsDisplay: [{ role: 'publico', index: 1, win: pub }],
      windowControl: ctrl,
    },
    pub,
    ctrl,
  };
}

test('com sink, a entrega vai pelo motor e o caminho histórico não é usado', () => {
  const { ctx, pub } = ctxFalso();
  const chamadas = [];
  const cfgEnviada = { marcador: 'veio-do-motor' };

  const retorno = displayConfigModo.processarDisplayConfigDoControlador(
    ctx,
    { publico: { fontSize: 50 } },
    { persistirSlides: false, enviar: (o) => { chamadas.push(o); return cfgEnviada; } }
  );

  assert.strictEqual(chamadas.length, 1, 'o sink deve ser chamado exactamente uma vez');
  assert.ok('forcarModo' in chamadas[0], 'o sink recebe o modo a forçar');
  assert.strictEqual(retorno, cfgEnviada, 'o retorno é o do sink');
  assert.strictEqual(pub.sends.length, 0, 'displayConfigModo não deve escrever nas janelas por conta própria');
});

test('o patch de estado acontece igual, com ou sem sink', () => {
  const comSink = ctxFalso();
  displayConfigModo.processarDisplayConfigDoControlador(
    comSink.ctx, { publico: { fontSize: 77 } }, { persistirSlides: false, enviar: () => ({}) }
  );

  const semSink = ctxFalso();
  displayConfigModo.processarDisplayConfigDoControlador(
    semSink.ctx, { publico: { fontSize: 77 } }, { persistirSlides: false }
  );

  assert.strictEqual(comSink.ctx.displayConfig.publico.fontSize, 77);
  assert.deepStrictEqual(comSink.ctx.displayConfig, semSink.ctx.displayConfig);
  assert.strictEqual(comSink.ctx.modoVisualProjecaoAtivo, semSink.ctx.modoVisualProjecaoAtivo);
});

test('sem sink cai no caminho histórico (compatibilidade preservada)', () => {
  const { ctx, pub, ctrl } = ctxFalso();
  displayConfigModo.processarDisplayConfigDoControlador(
    ctx, { publico: { fontSize: 33 } }, { persistirSlides: false }
  );
  assert.ok(pub.sends.some((s) => s.canal === 'display_config'), 'janela de projeção recebe pelo caminho antigo');
  assert.ok(ctrl.sends.some((s) => s.canal === 'display_config'), 'janela de controle também recebe');
});

test('lista vazia é legítima e não lança (pode não haver telas abertas)', () => {
  const ctx = {
    displayConfig: { publico: {}, ministrante: {}, clock: {} },
    displayConfigBiblia: null,
    estadoAtual: { tipo: 'musica' },
    windowsDisplay: [],
    windowControl: null,
  };
  assert.doesNotThrow(() => displayConfigModo.enviarDisplayConfigParaJanelas(ctx, {}));
});

test('AUSÊNCIA de registo lança — a falha silenciosa virou ruidosa (3b)', () => {
  /* Antes do 3b, `ctx.windowsDisplay || []` transformava "não sei onde estão as janelas"
     em "não há janelas": a config não chegava às telas e nada avisava. Agora distingue-se
     lista vazia (legítimo) de registo ausente (bug de ligação). */
  const ctx = {
    displayConfig: { publico: {}, ministrante: {}, clock: {} },
    displayConfigBiblia: null,
    estadoAtual: { tipo: 'musica' },
    windowControl: null,
    // sem windowsDisplay e sem opts.janelas
  };
  assert.throws(
    () => displayConfigModo.enviarDisplayConfigParaJanelas(ctx, {}),
    /sem registo de janelas/
  );
});

test('opts.janelas tem precedência sobre o ctx', () => {
  const { ctx } = ctxFalso();
  const doMotor = janelaFalsa('publico');
  displayConfigModo.enviarDisplayConfigParaJanelas(ctx, { janelas: [{ win: doMotor }] });

  assert.ok(doMotor.sends.some((s) => s.canal === 'display_config'), 'janela do registo recebeu');
  assert.strictEqual(
    ctx.windowsDisplay[0].win.sends.length, 0,
    'a lista do ctx foi ignorada quando o motor forneceu a sua'
  );
});
