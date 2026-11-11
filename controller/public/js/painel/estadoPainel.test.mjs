import test from 'node:test';
import assert from 'node:assert/strict';

const { estadoPainel, projecao, APRESENTACAO_IDX_CARD4, APRESENTACAO_IDX_CARD5 } = await import('./estadoPainel.js');

test('estadoPainel: valores iniciais do estado compartilhado', () => {
  assert.equal(estadoPainel.musicaAtiva, null);
  assert.equal(estadoPainel.estrofeAtiva, -1);
  assert.equal(estadoPainel.musicaBancoFonte, 'user');
  assert.equal(estadoPainel.cultoId, '');
  assert.deepEqual(estadoPainel.playlists, {});
  assert.deepEqual(estadoPainel.todasMusicas, []);
  assert.equal(estadoPainel.estadoServidor, null);
  assert.equal(estadoPainel.modoEdicaoEstrofes, false);
  assert.equal(estadoPainel.modoLetraCompletaCentral, false);
  assert.equal(estadoPainel.modoComparativoCentral, false);
  assert.equal(estadoPainel.projecaoMusicaEmitidaNoServidor, false);
  assert.equal(estadoPainel.apresentacaoCards.length, 6);
  assert.ok(estadoPainel.apresentacaoCards.every((c) => c === null));
  assert.equal(estadoPainel.apresentacaoCard4Imagens.length, 4);
  assert.deepEqual(estadoPainel.versoesMusicaServidorCache, { rootId: null, versoes: [] });
  assert.equal(estadoPainel.rotasPorModo.completo.publicoIndex, -1);
});

test('estadoPainel: cada chave existe uma vez e não há funções (sem lógica no módulo)', () => {
  const chaves = Object.keys(estadoPainel);
  assert.equal(new Set(chaves).size, chaves.length);
  assert.ok(chaves.length >= 60, `esperava ao menos 60 variáveis compartilhadas, achei ${chaves.length}`);
  for (const k of chaves) assert.notEqual(typeof estadoPainel[k], 'function', `${k} não deve ser função`);
});

test('estadoPainel: a porta de projeção nasce sem transporte e os índices dos cards são estáveis', () => {
  assert.equal(typeof projecao.enviar, 'function');
  assert.equal(projecao.pronta(), false);
  assert.equal(projecao.ligada(), false);
  assert.equal(APRESENTACAO_IDX_CARD4, 3);
  assert.equal(APRESENTACAO_IDX_CARD5, 4);
});

test('estadoPainel: o objeto é compartilhado — atribuir por um importador é visto pelos demais', async () => {
  const outro = (await import('./estadoPainel.js')).estadoPainel;
  estadoPainel.cultoId = 'teste';
  assert.equal(outro.cultoId, 'teste');
  estadoPainel.cultoId = '';
});
