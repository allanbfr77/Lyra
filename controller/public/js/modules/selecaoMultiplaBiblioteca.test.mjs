/**
 * O que se está a proteger: o modo de seleção é OPCIONAL e não contamina o uso normal da
 * Biblioteca (fora do modo, marcar não faz nada), só a fonte `user` entra num lote, a
 * ordem do lote é a ordem em que o operador escolheu, e uma música que desaparece do
 * banco desaparece também do lote.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FONTE_SELECIONAVEL,
  criarEstadoSelecao,
  podeSelecionarFonte,
  chaveSelecao,
  idDaChaveSelecao,
  ativarSelecao,
  cancelarSelecao,
  alternarSelecao,
  estaSelecionada,
  totalSelecionadas,
  chavesSelecionadas,
  sincronizarSelecaoComLista,
  rotuloContagemSelecao,
  rotuloConfirmacaoExclusaoLote,
} from './selecaoMultiplaBiblioteca.js';

test('nasce desligado e vazio — a Biblioteca abre no modo normal', () => {
  const e = criarEstadoSelecao();
  assert.equal(e.ativo, false);
  assert.equal(totalSelecionadas(e), 0);
});

test('fora do modo, marcar não faz nada', () => {
  const e = criarEstadoSelecao();
  assert.equal(alternarSelecao(e, chaveSelecao(1, 'user')), false);
  assert.equal(totalSelecionadas(e), 0);
  assert.equal(estaSelecionada(e, chaveSelecao(1, 'user')), false);
});

test('só a fonte do banco local é selecionável', () => {
  assert.equal(podeSelecionarFonte(FONTE_SELECIONAVEL), true);
  assert.equal(podeSelecionarFonte('user'), true);
  assert.equal(podeSelecionarFonte('catalog'), false);
  assert.equal(podeSelecionarFonte(''), false);
  assert.equal(podeSelecionarFonte(undefined), false);
});

test('a chave separa o mesmo id em fontes diferentes', () => {
  assert.notEqual(chaveSelecao(7, 'user'), chaveSelecao(7, 'catalog'));
  assert.equal(idDaChaveSelecao(chaveSelecao(7, 'user')), 7);
  assert.equal(idDaChaveSelecao('user:abc'), null);
});

test('entrar pelo menu de contexto já marca a música clicada', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e, chaveSelecao(3, 'user'));
  assert.equal(e.ativo, true);
  assert.equal(totalSelecionadas(e), 1);
  assert.equal(estaSelecionada(e, chaveSelecao(3, 'user')), true);
});

test('entrar sem chave inicial abre o modo com o lote vazio', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e);
  assert.equal(e.ativo, true);
  assert.equal(totalSelecionadas(e), 0);
});

test('reativar com o modo já aberto não apaga o que estava marcado', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e, chaveSelecao(1, 'user'));
  alternarSelecao(e, chaveSelecao(2, 'user'));
  ativarSelecao(e, chaveSelecao(3, 'user'));
  assert.deepEqual(chavesSelecionadas(e), [
    chaveSelecao(1, 'user'),
    chaveSelecao(2, 'user'),
    chaveSelecao(3, 'user'),
  ]);
});

test('marcar e desmarcar individualmente', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e);
  assert.equal(alternarSelecao(e, chaveSelecao(1, 'user')), true);
  assert.equal(alternarSelecao(e, chaveSelecao(2, 'user')), true);
  assert.equal(totalSelecionadas(e), 2);
  assert.equal(alternarSelecao(e, chaveSelecao(1, 'user')), false);
  assert.equal(totalSelecionadas(e), 1);
  assert.equal(estaSelecionada(e, chaveSelecao(1, 'user')), false);
  assert.equal(estaSelecionada(e, chaveSelecao(2, 'user')), true);
});

test('o lote segue a ordem em que o operador escolheu, não a da lista', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e);
  alternarSelecao(e, chaveSelecao(9, 'user'));
  alternarSelecao(e, chaveSelecao(2, 'user'));
  alternarSelecao(e, chaveSelecao(5, 'user'));
  assert.deepEqual(chavesSelecionadas(e).map(idDaChaveSelecao), [9, 2, 5]);
});

test('desmarcar e voltar a marcar põe a música no fim da ordem', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e);
  alternarSelecao(e, chaveSelecao(1, 'user'));
  alternarSelecao(e, chaveSelecao(2, 'user'));
  alternarSelecao(e, chaveSelecao(1, 'user'));
  alternarSelecao(e, chaveSelecao(1, 'user'));
  assert.deepEqual(chavesSelecionadas(e).map(idDaChaveSelecao), [2, 1]);
});

test('cancelar sai do modo e esquece o lote', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e, chaveSelecao(1, 'user'));
  alternarSelecao(e, chaveSelecao(2, 'user'));
  assert.equal(cancelarSelecao(e), true);
  assert.equal(e.ativo, false);
  assert.equal(totalSelecionadas(e), 0);
});

test('cancelar já cancelado não reporta mudança', () => {
  const e = criarEstadoSelecao();
  assert.equal(cancelarSelecao(e), false);
});

test('entrar depois de cancelar começa de novo, sem herdar o lote anterior', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e, chaveSelecao(1, 'user'));
  alternarSelecao(e, chaveSelecao(2, 'user'));
  cancelarSelecao(e);
  ativarSelecao(e, chaveSelecao(8, 'user'));
  assert.deepEqual(chavesSelecionadas(e).map(idDaChaveSelecao), [8]);
});

test('músicas que saíram do banco saem do lote', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e);
  alternarSelecao(e, chaveSelecao(1, 'user'));
  alternarSelecao(e, chaveSelecao(2, 'user'));
  alternarSelecao(e, chaveSelecao(3, 'user'));
  const removidas = sincronizarSelecaoComLista(e, [chaveSelecao(1, 'user'), chaveSelecao(3, 'user')]);
  assert.equal(removidas, 1);
  assert.deepEqual(chavesSelecionadas(e).map(idDaChaveSelecao), [1, 3]);
});

test('sincronizar aceita Set e não mexe no que continua a existir', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e);
  alternarSelecao(e, chaveSelecao(4, 'user'));
  assert.equal(sincronizarSelecaoComLista(e, new Set([chaveSelecao(4, 'user')])), 0);
  assert.equal(totalSelecionadas(e), 1);
});

test('sincronizar com a lista vazia esvazia o lote', () => {
  const e = criarEstadoSelecao();
  ativarSelecao(e, chaveSelecao(1, 'user'));
  assert.equal(sincronizarSelecaoComLista(e, []), 1);
  assert.equal(totalSelecionadas(e), 0);
});

test('a contagem concorda com o número', () => {
  assert.equal(rotuloContagemSelecao(0), 'Nenhuma selecionada');
  assert.equal(rotuloContagemSelecao(1), '1 selecionada');
  assert.equal(rotuloContagemSelecao(3), '3 selecionadas');
});

test('a confirmação de exclusão diz quantas músicas vão embora', () => {
  assert.equal(rotuloConfirmacaoExclusaoLote(1), '1 música selecionada');
  assert.equal(rotuloConfirmacaoExclusaoLote(12), '12 músicas selecionadas');
});
