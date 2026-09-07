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
  assinaturaConteudoVersao,
  versoesConteudoRigorosamenteIdentico,
  opcoesVersaoDistintasPorConteudo,
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

const conteudo = (estrofes, extra = {}) => ({
  titulo: 'Musica',
  artista: 'Autor',
  estrofes,
  ...extra,
});
const opcao = (value, c) => ({ value, label: value, conteudo: c });

test('assinaturaConteudoVersao ignora rótulo/id/data e devolve null sem estrofes', () => {
  const a = conteudo(['A', 'B'], { id: 1, rotulo: 'Original', criado_em: '2020' });
  const b = conteudo(['A', 'B'], { id: 9, rotulo: 'Cópia', criado_em: '2026' });
  assert.equal(assinaturaConteudoVersao(a), assinaturaConteudoVersao(b));
  assert.equal(assinaturaConteudoVersao(null), null);
  assert.equal(assinaturaConteudoVersao({ titulo: 'x', artista: '' }), null);
});

test('rigorosamente idêntico: uma vírgula, um espaço ou o título já é diferença', () => {
  assert.equal(versoesConteudoRigorosamenteIdentico(conteudo(['Ai de mim']), conteudo(['Ai de mim'])), true);
  assert.equal(versoesConteudoRigorosamenteIdentico(conteudo(['Ai de mim']), conteudo(['Ai, de mim'])), false);
  assert.equal(versoesConteudoRigorosamenteIdentico(conteudo(['Ai de mim']), conteudo(['Ai de mim '])), false);
  assert.equal(versoesConteudoRigorosamenteIdentico(conteudo(['A']), conteudo(['A', ''])), false);
  assert.equal(
    versoesConteudoRigorosamenteIdentico(conteudo(['A']), conteudo(['A'], { titulo: 'Outra' })),
    false
  );
  // Conteúdo desconhecido nunca é idêntico a nada.
  assert.equal(versoesConteudoRigorosamenteIdentico(undefined, undefined), false);
});

test('todas as versões idênticas à Original → sobra só a Original (não pergunta)', () => {
  const c = conteudo(['A', 'B']);
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original', conteudo: c },
    opcao('2', conteudo(['A', 'B'])),
    opcao('3', conteudo(['A', 'B'])),
  ]);
  assert.deepEqual(distintas.map((o) => o.value), ['__ORIGINAL__']);
});

test('cópia idêntica some; versão com diferença fica (Original + a editada)', () => {
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original', conteudo: conteudo(['A']) },
    opcao('2', conteudo(['A'])),
    opcao('3', conteudo(['A', 'B'])),
  ]);
  assert.deepEqual(distintas.map((o) => o.value), ['__ORIGINAL__', '3']);
});

test('vale para qualquer quantidade: 5 cópias iguais + 1 editada → 2 opções', () => {
  const iguais = ['2', '3', '4', '5', '6'].map((v) => opcao(v, conteudo(['A'])));
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original', conteudo: conteudo(['A']) },
    ...iguais,
    opcao('7', conteudo(['A', 'C'])),
  ]);
  assert.deepEqual(distintas.map((o) => o.value), ['__ORIGINAL__', '7']);
});

test('sem conteúdo conhecido nada é descartado (mantém o comportamento antigo)', () => {
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original' },
    { value: 'c_1', label: 'Cópia (LOCAL)' },
  ]);
  assert.equal(distintas.length, 2);
  assert.deepEqual(opcoesVersaoDistintasPorConteudo(null), []);
});
