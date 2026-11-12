'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TOTAL_UNIDADES,
  GRUPOS,
  UNIDADE_GRUPO,
  BootInterrompido,
  descreverErro,
  criarOrquestrador,
} = require('./bootProgress');

function splashFalsa() {
  const eventos = [];
  return {
    eventos,
    progresso: (d) => eventos.push(['progress', d]),
    aviso: (d) => eventos.push(['warn', d]),
    erro: (d) => eventos.push(['error', d]),
  };
}

test('as 11 unidades mapeiam nos 9 grupos, contíguos e sem repetição', () => {
  assert.equal(TOTAL_UNIDADES, 11);
  assert.equal(Object.keys(UNIDADE_GRUPO).length, 11);
  assert.equal(Object.keys(GRUPOS).length, 9);
  assert.deepEqual(
    Object.entries(UNIDADE_GRUPO).map(([, g]) => g),
    [1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9]
  );
  const gs = Object.values(UNIDADE_GRUPO);
  assert.ok(gs.every((g, i) => i === 0 || g >= gs[i - 1]), 'grupos nunca voltam atrás');
});

test('emite o progresso e cede a thread ANTES de rodar a unidade', async () => {
  const splash = splashFalsa();
  const ordem = [];
  const orq = criarOrquestrador({
    splash,
    ceder: async () => ordem.push('ceder'),
  });
  await orq.unidade(4, { critica: true }, async () => {
    ordem.push(`rodou:${splash.eventos.length}`);
  });
  assert.deepEqual(ordem, ['ceder', 'rodou:1']);
  assert.equal(splash.eventos[0][1].unit, 4);
  assert.equal(splash.eventos[0][1].label, 'Banco de dados');
  assert.equal(splash.eventos[0][1].detail, 'abrindo lyra.db');
  assert.equal(splash.eventos[0][1].value, undefined); // sem progresso mensurável: indeterminado
});

test('só envia value/max quando a unidade tem contagem real', async () => {
  const splash = splashFalsa();
  const orq = criarOrquestrador({ splash, ceder: async () => {} });
  await orq.unidade(5, { critica: false }, async ({ progresso }) => {
    await progresso({ value: 2, max: 6, detail: '2 de 6 traduções' });
  });
  const [, inicio] = splash.eventos[0];
  const [, contagem] = splash.eventos[1];
  assert.equal('value' in inicio, false);
  assert.deepEqual([contagem.value, contagem.max, contagem.detail], [2, 6, '2 de 6 traduções']);
});

test('unidade secundária que falha vira aviso e o boot segue', async () => {
  const splash = splashFalsa();
  const orq = criarOrquestrador({ splash, ceder: async () => {} });
  await orq.unidade(9, { critica: false }, async () => {
    throw new Error('5510 ocupada');
  });
  const aviso = splash.eventos.find(([t]) => t === 'warn');
  assert.equal(aviso[1].group, 8);
  assert.match(aviso[1].message, /5510/);
});

test('unidade crítica que falha mostra o erro e interrompe o boot', async () => {
  const splash = splashFalsa();
  const orq = criarOrquestrador({ splash, ceder: async () => {} });
  const causa = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
  await assert.rejects(
    orq.unidade(8, { critica: true }, async () => {
      throw causa;
    }),
    (e) => e instanceof BootInterrompido && e.causa === causa
  );
  const erro = splash.eventos.find(([t]) => t === 'error')[1];
  assert.equal(erro.group, 7);
  assert.equal(erro.code, 'EADDRINUSE');
  assert.match(erro.message, /porta 3001 já está em uso/);
});

test('sem splash, erro crítico propaga como antes e nada é reportado', async () => {
  const orq = criarOrquestrador({ splash: null, ceder: async () => {} });
  const falha = new Error('banco corrompido');
  await assert.rejects(orq.unidade(4, { critica: true }, async () => { throw falha; }), (e) => e === falha);
  await orq.unidade(2, { critica: false }, async () => { throw new Error('x'); }); // não lança
});

test('descreverErro: mensagens por unidade crítica', () => {
  assert.match(descreverErro(4, new Error('x')).message, /banco de dados/);
  assert.match(descreverErro(3, new Error('x')).message, /migrar/);
});
