import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ehVersaoLocalLegada,
  ehVersaoServidorId,
  parseCopiasLocaisMapBruto,
  copiasOrdenadasPorRotulo,
  encontrarCopiaNaLista,
  aplicarCamposCopiaLocal,
  criarMapaCopiasLocais,
} from './copiasLocaisLetra.js';

test('ehVersaoLocalLegada só aceita prefixo c_ após trim', () => {
  assert.equal(ehVersaoLocalLegada('c_abc123'), true);
  assert.equal(ehVersaoLocalLegada('  c_x'), true);
  assert.equal(ehVersaoLocalLegada('C_abc'), false);
  assert.equal(ehVersaoLocalLegada('42'), false);
  assert.equal(ehVersaoLocalLegada(''), false);
  assert.equal(ehVersaoLocalLegada(null), false);
});

test('ehVersaoServidorId: numérico finito, nunca c_*', () => {
  assert.equal(ehVersaoServidorId('42'), true);
  assert.equal(ehVersaoServidorId(7), true);
  assert.equal(ehVersaoServidorId('0'), true);
  assert.equal(ehVersaoServidorId('c_1'), false);
  assert.equal(ehVersaoServidorId(''), false);
  assert.equal(ehVersaoServidorId(null), false);
  assert.equal(ehVersaoServidorId('abc'), false);
});

test('parseCopiasLocaisMapBruto: JSON inválido ou vazio vira objeto', () => {
  assert.deepEqual(parseCopiasLocaisMapBruto(''), {});
  assert.deepEqual(parseCopiasLocaisMapBruto(null), {});
  assert.deepEqual(parseCopiasLocaisMapBruto('{'), {});
  assert.deepEqual(parseCopiasLocaisMapBruto('null'), {});
  assert.deepEqual(parseCopiasLocaisMapBruto('{"10":[]}'), { 10: [] });
});

test('copiasOrdenadasPorRotulo e encontrarCopiaNaLista', () => {
  const lista = [
    { id: 'c_b', rotulo: 'Beta' },
    { id: 'c_a', rotulo: 'alfa' },
  ];
  assert.deepEqual(
    copiasOrdenadasPorRotulo(lista).map((c) => c.id),
    ['c_a', 'c_b']
  );
  assert.equal(encontrarCopiaNaLista(lista, 'c_b').rotulo, 'Beta');
  assert.equal(encontrarCopiaNaLista(lista, ''), null);
  assert.equal(encontrarCopiaNaLista(lista, null), null);
});

test('aplicarCamposCopiaLocal: rótulo vazio falha; título já escrito fica', () => {
  const c = { id: 'c_1', titulo: 'Antes', rotulo: 'v1' };
  const falha = aplicarCamposCopiaLocal(c, { titulo: '  Novo  ', rotulo: '   ' });
  assert.equal(falha.ok, false);
  assert.match(falha.erro, /nome para a versão/);
  assert.equal(c.titulo, 'Novo');
  assert.equal(c.rotulo, 'v1');

  const ok = aplicarCamposCopiaLocal(c, {
    rotulo: '  nome bem comprido que passa dos quarenta caracteres  ',
    estrofes: ['a', null],
  });
  assert.equal(ok.ok, true);
  assert.equal(c.rotulo.length, 40);
  assert.deepEqual(c.estrofes, ['a', '']);
});

test('criarMapaCopiasLocais lê, atualiza e remove sem vazar para outras músicas', () => {
  const store = {
    k: JSON.stringify({
      10: [{ id: 'c_keep', rotulo: 'Zeta', titulo: 'A' }],
      11: [{ id: 'c_gone', rotulo: 'X' }],
    }),
  };
  const mapa = criarMapaCopiasLocais({
    chave: 'k',
    getItem: (k) => store[k],
    setItem: (k, v) => {
      store[k] = v;
    },
  });

  assert.equal(mapa.encontrar(10, 'c_keep').titulo, 'A');
  assert.deepEqual(
    mapa.getCopiasParaMusica(10).map((c) => c.id),
    ['c_keep']
  );

  const up = mapa.atualizarCampos(10, 'c_keep', { titulo: 'B', rotulo: 'Alfa' });
  assert.equal(up.ok, true);
  assert.equal(up.copia.titulo, 'B');
  assert.equal(JSON.parse(store.k)[10][0].rotulo, 'Alfa');

  assert.equal(mapa.remover(10, 'nao-existe'), false);
  assert.equal(mapa.remover(11, 'c_gone'), true);
  assert.deepEqual(JSON.parse(store.k)[11], []);

  mapa.removerTodas(10);
  assert.equal(JSON.parse(store.k)[10], undefined);
});
