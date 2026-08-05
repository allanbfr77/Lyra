/**
 * O que se está a proteger aqui: a promessa de que o telão volta ao mesmo equipamento
 * físico depois de o Windows renumerar os monitores — e de que, quando o equipamento
 * não está lá, o programa admite isso em vez de projetar num ecrã ao calhas.
 */

import test from 'node:test';
import assert from 'node:assert';

/** Stub de `localStorage` — o módulo real é do browser. */
function instalarLocalStorage() {
  const dados = new Map();
  globalThis.localStorage = {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
    clear: () => dados.clear(),
  };
  return dados;
}

const dados = instalarLocalStorage();
const {
  casarMonitorSalvo,
  chaveHostMonitores,
  identidadeDoMonitor,
  identidadesDaRota,
  guardarIdentidadesRota,
  restaurarRotaPorIdentidade,
} = await import('./identidadeMonitores.js');

const DELL = { index: 0, id: 1, primary: true, fingerprint: 'DELL|1920x1080|@1|ext', nome: 'DELL' };
const LG = { index: 1, id: 2, primary: false, fingerprint: 'LG TV|1920x1080|@1|ext', nome: 'LG TV' };
const EPSON = { index: 2, id: 3, primary: false, fingerprint: 'EPSON|1280x720|@1|ext', nome: 'EPSON' };
const LISTA = [DELL, LG, EPSON];

test('casa por impressão digital mesmo com o id do Electron trocado', () => {
  const salvo = { fingerprint: LG.fingerprint, id: 999, nome: 'LG TV' };
  const r = casarMonitorSalvo(salvo, LISTA);
  assert.strictEqual(r.via, 'fingerprint');
  assert.strictEqual(r.monitor.index, 1);
});

test('cai para o id quando a impressão digital já não corresponde', () => {
  /* Cenário real: actualização de driver muda o nome EDID do painel. */
  const salvo = { fingerprint: 'LG TV ANTIGO|1920x1080|@1|ext', id: 3, nome: 'LG TV' };
  const r = casarMonitorSalvo(salvo, LISTA);
  assert.strictEqual(r.via, 'id');
  assert.strictEqual(r.monitor.index, 2);
});

test('devolve null quando nada corresponde — o programa pede nova seleção', () => {
  const salvo = { fingerprint: 'PROJETOR SUMIDO|1024x768|@1|ext', id: 42, nome: 'Projetor Epson' };
  assert.strictEqual(casarMonitorSalvo(salvo, LISTA), null);
});

test('nunca casa com o monitor do operador, mesmo que a identidade bata certo', () => {
  const salvo = { fingerprint: DELL.fingerprint, id: DELL.id, nome: 'DELL' };
  assert.strictEqual(
    casarMonitorSalvo(salvo, LISTA),
    null,
    'o principal é do operador e está fora de qualquer rota de projeção'
  );
});

test('identidadeDoMonitor rejeita entradas sem nada que sirva para reconhecer', () => {
  assert.strictEqual(identidadeDoMonitor(null), null);
  assert.strictEqual(identidadeDoMonitor({ index: 1 }), null);
  assert.ok(identidadeDoMonitor({ fingerprint: 'x' }));
  assert.ok(identidadeDoMonitor({ id: 5 }));
});

test('chaveHostMonitores separa projeção local de servidor remoto', () => {
  assert.strictEqual(chaveHostMonitores('127.0.0.1'), 'local');
  assert.strictEqual(chaveHostMonitores(''), 'local');
  assert.strictEqual(chaveHostMonitores('192.168.0.42'), '192.168.0.42');
  assert.strictEqual(chaveHostMonitores('192.168.0.42'), chaveHostMonitores('192.168.0.42'));
});

test('restaura a rota depois de o Windows renumerar os monitores', () => {
  dados.clear();
  guardarIdentidadesRota('local', 'slides', identidadesDaRota({ publicoIndex: 1, ministranteIndex: 2 }, LISTA));

  /* Sessão seguinte: a TV foi ligada primeiro e o Windows deu-lhe outra posição. */
  const listaNova = [
    { ...LG, index: 0 },
    { ...DELL, index: 1 },
    { ...EPSON, index: 2 },
  ];
  const { rota, houveSalvo, faltou } = restaurarRotaPorIdentidade('local', 'slides', listaNova);
  assert.strictEqual(houveSalvo, true);
  assert.deepStrictEqual(faltou, []);
  assert.strictEqual(rota.publicoIndex, 0, 'telão devia seguir a LG TV, não o índice antigo');
  assert.strictEqual(rota.ministranteIndex, 2);
});

test('monitor configurado que desapareceu é reportado e o canal fica desativado', () => {
  dados.clear();
  guardarIdentidadesRota('local', 'slides', identidadesDaRota({ publicoIndex: 1, ministranteIndex: 2 }, LISTA));

  const semEpson = [DELL, LG];
  const { rota, faltou } = restaurarRotaPorIdentidade('local', 'slides', semEpson);
  assert.strictEqual(rota.publicoIndex, 1);
  assert.strictEqual(rota.ministranteIndex, -1);
  assert.deepStrictEqual(faltou, ['EPSON']);
});

test('sem configuração guardada, quem chama sabe que é a primeira execução', () => {
  dados.clear();
  const { houveSalvo } = restaurarRotaPorIdentidade('local', 'slides', LISTA);
  assert.strictEqual(houveSalvo, false);
});

test('configuração de hosts diferentes não se mistura', () => {
  dados.clear();
  guardarIdentidadesRota('local', 'slides', identidadesDaRota({ publicoIndex: 1, ministranteIndex: -1 }, LISTA));
  guardarIdentidadesRota(
    '192.168.0.42',
    'slides',
    identidadesDaRota({ publicoIndex: 2, ministranteIndex: -1 }, LISTA)
  );
  assert.strictEqual(restaurarRotaPorIdentidade('local', 'slides', LISTA).rota.publicoIndex, 1);
  assert.strictEqual(restaurarRotaPorIdentidade('192.168.0.42', 'slides', LISTA).rota.publicoIndex, 2);
});

test('desligar um canal é gravado como escolha, não como ausência de configuração', () => {
  dados.clear();
  guardarIdentidadesRota('local', 'slides', identidadesDaRota({ publicoIndex: 1, ministranteIndex: 2 }, LISTA));
  guardarIdentidadesRota('local', 'slides', identidadesDaRota({ publicoIndex: 1, ministranteIndex: -1 }, LISTA));
  const { rota } = restaurarRotaPorIdentidade('local', 'slides', LISTA);
  assert.strictEqual(rota.ministranteIndex, -1, 'o ministrante não devia ressuscitar do estado anterior');
});

test('localStorage corrompido equivale a «sem configuração», não a crash', () => {
  dados.clear();
  globalThis.localStorage.setItem('lyra_identidade_monitores_v1', '{isto não é json');
  const { houveSalvo } = restaurarRotaPorIdentidade('local', 'slides', LISTA);
  assert.strictEqual(houveSalvo, false);
});
