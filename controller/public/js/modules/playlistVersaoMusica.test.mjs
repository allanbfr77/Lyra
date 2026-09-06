import test from 'node:test';
import assert from 'node:assert/strict';
import {
  versaoLocalIdTrimado,
  idFetchMusicaPlaylist,
  idMusicaParaPreVoo,
  fonteBancoNormalizada,
  fonteBancoItemPlaylist,
  ehMarcadorTemaPlaylist,
  versaoLocalIdParaComparar,
  itemPlaylistMesmaMusicaEVersao,
  playlistJaContemMesmaMusicaEVersao,
  playlistItemMesmaVersaoQueRaiz,
} from './playlistVersaoMusica.js';

test('versaoLocalIdTrimado: vazio vira string vazia; 0 sobrevive', () => {
  assert.equal(versaoLocalIdTrimado(null), '');
  assert.equal(versaoLocalIdTrimado(undefined), '');
  assert.equal(versaoLocalIdTrimado('  '), '');
  assert.equal(versaoLocalIdTrimado('  42  '), '42');
  assert.equal(versaoLocalIdTrimado(0), '0');
});

test('idFetchMusicaPlaylist: numérico usa a versão; c_* e vazio usam o root', () => {
  assert.equal(idFetchMusicaPlaylist({ id: 10, versaoLocalId: '42' }), '42');
  assert.equal(idFetchMusicaPlaylist({ id: 10, versaoLocalId: 'c_abc' }), 10);
  assert.equal(idFetchMusicaPlaylist({ id: 10, versaoLocalId: '' }), 10);
  assert.equal(idFetchMusicaPlaylist({ id: 10 }), 10);
});

test('idMusicaParaPreVoo devolve número; c_* e lixo caem no root', () => {
  assert.equal(idMusicaParaPreVoo({ id: 10, versaoLocalId: '42' }), 42);
  assert.equal(idMusicaParaPreVoo({ id: 10, versaoLocalId: 'c_abc' }), 10);
  assert.equal(idMusicaParaPreVoo({ id: 10, versaoLocalId: 'xyz' }), 10);
  assert.equal(idMusicaParaPreVoo({ id: 'x' }), null);
  assert.equal(idMusicaParaPreVoo({ id: 10, versaoLocalId: 0 }), 10);
});

test('fonteBanco: só catalog é catalog; o resto é user', () => {
  assert.equal(fonteBancoNormalizada('catalog'), 'catalog');
  assert.equal(fonteBancoNormalizada('user'), 'user');
  assert.equal(fonteBancoNormalizada(undefined), 'user');
  assert.equal(fonteBancoItemPlaylist({ bancoFonte: 'catalog' }), 'catalog');
  assert.equal(fonteBancoItemPlaylist({}), 'user');
});

test('ehMarcadorTemaPlaylist e versaoLocalIdParaComparar sem trim', () => {
  assert.equal(ehMarcadorTemaPlaylist({ tipo: 'marcador_tema' }), true);
  assert.equal(ehMarcadorTemaPlaylist({ id: 1 }), false);
  assert.equal(versaoLocalIdParaComparar(null), '');
  assert.equal(versaoLocalIdParaComparar(0), '');
  assert.equal(versaoLocalIdParaComparar('  42  '), '  42  ');
});

test('playlistJaContemMesmaMusicaEVersao ignora marcador e distingue versão/fonte', () => {
  const pl = [
    { tipo: 'marcador_tema', tema: 'ABERTURA' },
    { id: 10, versaoLocalId: '42', bancoFonte: 'user' },
  ];
  assert.equal(playlistJaContemMesmaMusicaEVersao(pl, 10, '42', 'user'), true);
  assert.equal(playlistJaContemMesmaMusicaEVersao(pl, 10, '43', 'user'), false);
  assert.equal(playlistJaContemMesmaMusicaEVersao(pl, 10, '42', 'catalog'), false);
  assert.equal(itemPlaylistMesmaMusicaEVersao(pl[0], 10, '42', 'user'), false);
});

test('playlistItemMesmaVersaoQueRaiz: null na raiz falha; NaN na seleção falha', () => {
  const it = { id: 10, versaoLocalId: '', bancoFonte: 'user' };
  assert.equal(playlistItemMesmaVersaoQueRaiz(it, 10, '', 'user'), true);
  assert.equal(playlistItemMesmaVersaoQueRaiz(it, null, '', 'user'), false);
  assert.equal(playlistItemMesmaVersaoQueRaiz(it, Number('x'), '', 'user'), false);
});
