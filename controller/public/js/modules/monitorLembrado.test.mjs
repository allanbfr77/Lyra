/**
 * O que se está a proteger: «monitor lembrado ≠ projeção ativa». A memória só é aplicada à
 * entrada no modo, só é escrita por clique do operador, sobrevive à renumeração dos ecrãs,
 * e não desaparece porque a TV estava desligada num domingo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

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
  SEM_EXIBICAO,
  lerMonitorLembrado,
  lembrarMonitorLigado,
  definirLembrarMonitor,
  registrarEscolhaMonitor,
  rotaLembradaParaEntrada,
} = await import('./monitorLembrado.js');

const DELL = { index: 0, id: 1, primary: true, fingerprint: 'DELL|1920x1080|@1|ext', nome: 'DELL' };
const LG = { index: 1, id: 2, primary: false, fingerprint: 'LG TV|1920x1080|@1|ext', nome: 'LG TV' };
const EPSON = { index: 2, id: 3, primary: false, fingerprint: 'EPSON|1280x720|@1|ext', nome: 'EPSON' };
const LISTA = [DELL, LG, EPSON];

const M2 = LG.index;
const M3 = EPSON.index;
const HOST = 'local';

function limpar() {
  dados.clear();
}

test('sem preferência guardada não há nada a repor', () => {
  limpar();
  assert.equal(lembrarMonitorLigado(HOST, 'biblia'), false);
  assert.equal(rotaLembradaParaEntrada(HOST, 'biblia', LISTA).aplicar, false);
});

test('checkbox desligado: escolher monitor não grava nada', () => {
  limpar();
  registrarEscolhaMonitor(HOST, 'biblia', { publicoIndex: M2, ministranteIndex: -1 }, LISTA);
  assert.equal(rotaLembradaParaEntrada(HOST, 'biblia', LISTA).aplicar, false);
});

test('ligar o checkbox captura o que já está no seletor', () => {
  /* O operador tem o M2 escolhido e marca a caixa — pedir-lhe para reescolher «a sério»
     seria pedir duas vezes a mesma coisa. */
  limpar();
  definirLembrarMonitor(HOST, 'biblia', true, { publicoIndex: M2, ministranteIndex: -1 }, LISTA);
  const r = rotaLembradaParaEntrada(HOST, 'biblia', LISTA);
  assert.equal(r.aplicar, true);
  assert.deepEqual(r.rota, { publicoIndex: M2, ministranteIndex: SEM_EXIBICAO, live: false });
});

test('com o checkbox ligado, cada escolha do operador substitui a memória', () => {
  limpar();
  definirLembrarMonitor(HOST, 'biblia', true, { publicoIndex: M2, ministranteIndex: -1 }, LISTA);
  registrarEscolhaMonitor(HOST, 'biblia', { publicoIndex: -1, ministranteIndex: M3 }, LISTA);
  assert.deepEqual(rotaLembradaParaEntrada(HOST, 'biblia', LISTA).rota, {
    publicoIndex: SEM_EXIBICAO,
    ministranteIndex: M3,
    live: false,
  });
});

test('«Ambos» é lembrado nos dois canais', () => {
  limpar();
  definirLembrarMonitor(HOST, 'apresentacao', true, { publicoIndex: M2, ministranteIndex: M3 }, LISTA);
  assert.deepEqual(rotaLembradaParaEntrada(HOST, 'apresentacao', LISTA).rota, {
    publicoIndex: M2,
    ministranteIndex: M3,
    live: false,
  });
});

test('«Live — OBS» é lembrado como live, e não como índices', () => {
  limpar();
  definirLembrarMonitor(HOST, 'biblia', true, { publicoIndex: -1, ministranteIndex: -1, live: true }, LISTA);
  const r = rotaLembradaParaEntrada(HOST, 'biblia', LISTA);
  assert.deepEqual(r.rota, { publicoIndex: SEM_EXIBICAO, ministranteIndex: SEM_EXIBICAO, live: true });
  assert.deepEqual(r.faltou, []);
});

test('desligar o checkbox para de aplicar mas não apaga a escolha', () => {
  /* Um clique acidental na caixa não pode custar a configuração. */
  limpar();
  definirLembrarMonitor(HOST, 'biblia', true, { publicoIndex: M2, ministranteIndex: -1 }, LISTA);
  definirLembrarMonitor(HOST, 'biblia', false, { publicoIndex: -1, ministranteIndex: -1 }, LISTA);
  assert.equal(rotaLembradaParaEntrada(HOST, 'biblia', LISTA).aplicar, false);

  definirLembrarMonitor(HOST, 'biblia', true, { publicoIndex: -1, ministranteIndex: -1 }, LISTA);
  /* Religar com o seletor vazio não deve ressuscitar o M2: ligar captura o que está à
     frente do operador, e o que está à frente é «Não exibir». */
  assert.equal(rotaLembradaParaEntrada(HOST, 'biblia', LISTA).aplicar, false);
});

test('Bíblia e Mídias têm memórias independentes', () => {
  limpar();
  definirLembrarMonitor(HOST, 'biblia', true, { publicoIndex: M2, ministranteIndex: -1 }, LISTA);
  definirLembrarMonitor(HOST, 'apresentacao', true, { publicoIndex: -1, ministranteIndex: M3 }, LISTA);
  assert.deepEqual(rotaLembradaParaEntrada(HOST, 'biblia', LISTA).rota.publicoIndex, M2);
  assert.deepEqual(rotaLembradaParaEntrada(HOST, 'apresentacao', LISTA).rota.ministranteIndex, M3);
});

test('os dois modos podem lembrar o MESMO monitor sem se atrapalharem', () => {
  /* Nunca são aplicados ao mesmo tempo: a reposição acontece à entrada de um modo de cada vez. */
  limpar();
  definirLembrarMonitor(HOST, 'biblia', true, { publicoIndex: M2, ministranteIndex: -1 }, LISTA);
  definirLembrarMonitor(HOST, 'apresentacao', true, { publicoIndex: M2, ministranteIndex: -1 }, LISTA);
  assert.equal(rotaLembradaParaEntrada(HOST, 'biblia', LISTA).rota.publicoIndex, M2);
  assert.equal(rotaLembradaParaEntrada(HOST, 'apresentacao', LISTA).rota.publicoIndex, M2);
});

test('hosts diferentes não partilham memória', () => {
  /* Projetar nesta máquina e comandar um PC servidor são hardwares distintos. */
  limpar();
  definirLembrarMonitor('local', 'biblia', true, { publicoIndex: M2, ministranteIndex: -1 }, LISTA);
  assert.equal(rotaLembradaParaEntrada('192.168.0.9', 'biblia', LISTA).aplicar, false);
  assert.equal(rotaLembradaParaEntrada('local', 'biblia', LISTA).aplicar, true);
});

test('sobrevive à renumeração dos monitores do Windows', () => {
  /* O M2 passou a ser o índice 2 e o EPSON o índice 1 — a identidade é que manda. */
  limpar();
  definirLembrarMonitor(HOST, 'biblia', true, { publicoIndex: M2, ministranteIndex: -1 }, LISTA);
  const RENUMERADA = [
    DELL,
    { ...EPSON, index: 1 },
    { ...LG, index: 2 },
  ];
  assert.equal(rotaLembradaParaEntrada(HOST, 'biblia', RENUMERADA).rota.publicoIndex, 2);
});

test('monitor lembrado ausente: avisa pelo nome, cai para «Não exibir» e NÃO se apaga', () => {
  /* A TV desligada hoje não pode custar a preferência para sempre. */
  limpar();
  definirLembrarMonitor(HOST, 'biblia', true, { publicoIndex: M2, ministranteIndex: -1 }, LISTA);
  const semTv = [DELL, EPSON];
  const r = rotaLembradaParaEntrada(HOST, 'biblia', semTv);
  assert.equal(r.aplicar, true);
  assert.equal(r.rota.publicoIndex, SEM_EXIBICAO);
  assert.deepEqual(r.faltou, ['LG TV']);

  /* Com a TV de volta, a escolha continua lá. */
  assert.equal(rotaLembradaParaEntrada(HOST, 'biblia', LISTA).rota.publicoIndex, M2);
});

test('o monitor do operador nunca é lembrado como destino', () => {
  limpar();
  definirLembrarMonitor(HOST, 'biblia', true, { publicoIndex: DELL.index, ministranteIndex: -1 }, LISTA);
  assert.equal(rotaLembradaParaEntrada(HOST, 'biblia', LISTA).rota.publicoIndex, SEM_EXIBICAO);
});

test('modos sem memória são ignorados em silêncio', () => {
  limpar();
  definirLembrarMonitor(HOST, 'slides', true, { publicoIndex: M2, ministranteIndex: M3 }, LISTA);
  assert.equal(lembrarMonitorLigado(HOST, 'slides'), false);
  assert.equal(rotaLembradaParaEntrada(HOST, 'slides', LISTA).aplicar, false);
});

test('armazenamento corrompido equivale a «sem preferência», não a crash', () => {
  limpar();
  globalThis.localStorage.setItem('lyra_monitor_lembrado_v1', '{nao é json');
  assert.deepEqual(lerMonitorLembrado(HOST, 'biblia'), {
    ligado: false, live: false, publico: null, ministrante: null,
  });
  assert.equal(rotaLembradaParaEntrada(HOST, 'biblia', LISTA).aplicar, false);
});
