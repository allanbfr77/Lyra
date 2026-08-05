'use strict';

/**
 * A lista de monitores é o contrato entre o motor e a UI de escolha de telas.
 * O que estes testes protegem é a promessa nova: cada entrada consegue ser reconhecida
 * numa execução futura sem depender da numeração do Windows.
 */

const test = require('node:test');
const assert = require('node:assert');

const { buildMonitorsList, nomeRealDoDisplay } = require('./monitorsList');

function display(over = {}) {
  return {
    id: 1,
    label: '',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 1,
    internal: false,
    ...over,
  };
}

function screenFalso(displays, primaryIndex = 0) {
  return {
    getAllDisplays: () => displays,
    getPrimaryDisplay: () => displays[primaryIndex],
  };
}

test('usa o nome do sistema como rótulo quando existe', () => {
  const lista = buildMonitorsList(
    screenFalso([
      display({ id: 1, label: 'DELL U2412M' }),
      display({ id: 2, label: 'LG TV', bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }),
    ])
  );
  assert.strictEqual(lista[0].label, 'DELL U2412M');
  assert.strictEqual(lista[1].label, 'LG TV');
});

test('cai para «Monitor N» quando o driver não expõe nome', () => {
  const lista = buildMonitorsList(
    screenFalso([
      display({ id: 1, label: '' }),
      display({ id: 2, label: 'Unknown display', bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }),
    ])
  );
  assert.strictEqual(lista[0].label, 'Monitor 1');
  assert.strictEqual(lista[1].label, 'Monitor 2', '«Unknown display» não é um nome real');
  assert.strictEqual(lista[0].nome, '');
});

test('nomeRealDoDisplay ignora espaços e variantes de «unknown»', () => {
  assert.strictEqual(nomeRealDoDisplay({ label: '  LG TV  ' }), 'LG TV');
  assert.strictEqual(nomeRealDoDisplay({ label: 'Unknown Display 2' }), '');
  assert.strictEqual(nomeRealDoDisplay({}), '');
});

test('a impressão digital ignora a posição no desktop', () => {
  const antes = buildMonitorsList(
    screenFalso([
      display({ id: 1, label: 'DELL' }),
      display({ id: 2, label: 'LG TV', bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }),
    ])
  );
  /* Mesmo hardware, arranjo invertido nas definições de vídeo do Windows — é o cenário
     que partia a configuração quando ela era guardada por índice. */
  const depois = buildMonitorsList(
    screenFalso(
      [
        display({ id: 2, label: 'LG TV', bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        display({ id: 1, label: 'DELL', bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }),
      ],
      1
    )
  );
  const fpLgAntes = antes.find((m) => m.nome === 'LG TV').fingerprint;
  const fpLgDepois = depois.find((m) => m.nome === 'LG TV').fingerprint;
  assert.strictEqual(fpLgAntes, fpLgDepois);
  assert.notStrictEqual(
    antes.find((m) => m.nome === 'LG TV').index,
    depois.find((m) => m.nome === 'LG TV').index,
    'o índice mudou — é justamente por isso que existe a impressão digital'
  );
});

test('a impressão digital distingue painéis do mesmo modelo em resoluções diferentes', () => {
  const lista = buildMonitorsList(
    screenFalso([
      display({ id: 1, label: 'EPSON PJ', size: { width: 1920, height: 1080 } }),
      display({
        id: 2,
        label: 'EPSON PJ',
        bounds: { x: 1920, y: 0, width: 1280, height: 720 },
        size: { width: 1280, height: 720 },
      }),
    ])
  );
  assert.notStrictEqual(lista[0].fingerprint, lista[1].fingerprint);
});

test('monitores indistinguíveis recebem sufixo em vez de colidirem', () => {
  const lista = buildMonitorsList(
    screenFalso([
      display({ id: 1, label: 'LG TV' }),
      display({ id: 2, label: 'LG TV', bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }),
      display({ id: 3, label: 'LG TV', bounds: { x: 3840, y: 0, width: 1920, height: 1080 } }),
    ])
  );
  const fps = new Set(lista.map((m) => m.fingerprint));
  assert.strictEqual(fps.size, 3, 'três painéis iguais têm de continuar distinguíveis');
});

test('marca o principal e mantém o id do Electron para fallback', () => {
  const lista = buildMonitorsList(
    screenFalso(
      [
        display({ id: 7, label: 'DELL' }),
        display({ id: 9, label: 'LG TV', bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }),
      ],
      1
    )
  );
  assert.strictEqual(lista[0].primary, false);
  assert.strictEqual(lista[1].primary, true);
  assert.deepStrictEqual(
    lista.map((m) => m.id),
    [7, 9]
  );
});
