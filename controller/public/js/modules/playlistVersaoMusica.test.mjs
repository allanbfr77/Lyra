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
  playlistItemMesmaRaizIgnorandoVersao,
  localizarItemMesmaRaizNaPlaylist,
  decidirAcaoAdicionarVersaoAtivaNaPlaylist,
  substituirVersaoItemPlaylist,
  ACAO_ADICIONAR_PLAYLIST,
  ACAO_JA_PRESENTE_PLAYLIST,
  ACAO_CONFIRMAR_TROCA_VERSAO_PLAYLIST,
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

test('todas as versões idênticas à Original → sobra só a primeira Cópia (não pergunta)', () => {
  const c = conteudo(['A', 'B']);
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original', conteudo: c },
    opcao('2', conteudo(['A', 'B'])),
    opcao('3', conteudo(['A', 'B'])),
  ]);
  assert.deepEqual(distintas.map((o) => o.value), ['2']);
});

test('cópia idêntica ocupa o lugar da Original; a editada continua na lista', () => {
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original', conteudo: conteudo(['A']) },
    opcao('2', conteudo(['A'])),
    opcao('3', conteudo(['A', 'B'])),
  ]);
  assert.deepEqual(distintas.map((o) => o.value), ['2', '3']);
});

test('vale para qualquer quantidade: 5 cópias iguais + 1 editada → 2 opções', () => {
  const iguais = ['2', '3', '4', '5', '6'].map((v) => opcao(v, conteudo(['A'])));
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original', conteudo: conteudo(['A']) },
    ...iguais,
    opcao('7', conteudo(['A', 'C'])),
  ]);
  assert.deepEqual(distintas.map((o) => o.value), ['2', '7']);
});

test('Original sem cópia idêntica continua na lista, na mesma posição', () => {
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original', conteudo: conteudo(['A']) },
    opcao('2', conteudo(['A', 'B'])),
  ]);
  assert.deepEqual(distintas.map((o) => o.value), ['__ORIGINAL__', '2']);
});

test('cópias iguais entre si (e diferentes da Original) continuam pela primeira', () => {
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original', conteudo: conteudo(['A']) },
    opcao('2', conteudo(['B'])),
    opcao('3', conteudo(['B'])),
  ]);
  assert.deepEqual(distintas.map((o) => o.value), ['__ORIGINAL__', '2']);
});

test('Original sem conteúdo conhecido nunca é substituída', () => {
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original' },
    opcao('2', conteudo(['A'])),
    opcao('3', conteudo(['A'])),
  ]);
  assert.deepEqual(distintas.map((o) => o.value), ['__ORIGINAL__', '2']);
});

test('sem conteúdo conhecido nada é descartado (mantém o comportamento antigo)', () => {
  const distintas = opcoesVersaoDistintasPorConteudo([
    { value: '__ORIGINAL__', label: 'Original' },
    { value: 'c_1', label: 'Cópia (LOCAL)' },
  ]);
  assert.equal(distintas.length, 2);
  assert.deepEqual(opcoesVersaoDistintasPorConteudo(null), []);
});

test('playlistItemMesmaRaizIgnorandoVersao: ignora marcador, raiz e fonte importam, versão não', () => {
  const it = { id: 10, versaoLocalId: '42', bancoFonte: 'user' };
  assert.equal(playlistItemMesmaRaizIgnorandoVersao(it, 10, 'user'), true);
  assert.equal(playlistItemMesmaRaizIgnorandoVersao(it, 11, 'user'), false);
  assert.equal(playlistItemMesmaRaizIgnorandoVersao(it, 10, 'catalog'), false);
  assert.equal(playlistItemMesmaRaizIgnorandoVersao({ tipo: 'marcador_tema' }, 10, 'user'), false);
});

test('localizarItemMesmaRaizNaPlaylist acha a entrada independente da versão', () => {
  const pl = [
    { tipo: 'marcador_tema', tema: 'ABERTURA' },
    { id: 5, versaoLocalId: null, bancoFonte: 'user' },
    { id: 10, versaoLocalId: 'c_1', bancoFonte: 'user' },
  ];
  assert.equal(localizarItemMesmaRaizNaPlaylist(pl, 10, 'user'), pl[2]);
  assert.equal(localizarItemMesmaRaizNaPlaylist(pl, 99, 'user'), null);
});

test('decidirAcaoAdicionarVersaoAtivaNaPlaylist: música nova → adicionar', () => {
  const pl = [{ id: 5, versaoLocalId: null, bancoFonte: 'user' }];
  const d = decidirAcaoAdicionarVersaoAtivaNaPlaylist(pl, 10, null, 'user');
  assert.equal(d.acao, ACAO_ADICIONAR_PLAYLIST);
  assert.equal(d.item, null);
});

test('decidirAcaoAdicionarVersaoAtivaNaPlaylist: mesma música e mesma versão → já presente', () => {
  const pl = [{ id: 10, versaoLocalId: '42', bancoFonte: 'user' }];
  const d = decidirAcaoAdicionarVersaoAtivaNaPlaylist(pl, 10, '42', 'user');
  assert.equal(d.acao, ACAO_JA_PRESENTE_PLAYLIST);
  assert.equal(d.item, pl[0]);
});

test('decidirAcaoAdicionarVersaoAtivaNaPlaylist: mesma música, versão diferente → confirmar troca', () => {
  const pl = [{ id: 10, versaoLocalId: null, bancoFonte: 'user' }]; // cópia-original (ORIGINAL) na playlist
  const d = decidirAcaoAdicionarVersaoAtivaNaPlaylist(pl, 10, '42', 'user'); // selecionando a Editada (versão 42)
  assert.equal(d.acao, ACAO_CONFIRMAR_TROCA_VERSAO_PLAYLIST);
  assert.equal(d.item, pl[0]);
});

test('decidirAcaoAdicionarVersaoAtivaNaPlaylist: compara música + versão, não só o nome', () => {
  // Mesma raiz, fontes diferentes (catalog vs user) não são a mesma entrada.
  const pl = [{ id: 10, versaoLocalId: '42', bancoFonte: 'catalog' }];
  const d = decidirAcaoAdicionarVersaoAtivaNaPlaylist(pl, 10, '42', 'user');
  assert.equal(d.acao, ACAO_ADICIONAR_PLAYLIST);
});

test('substituirVersaoItemPlaylist troca a versão no lugar, sem criar entrada nova, e zera o rótulo', () => {
  const pl = [
    { id: 1, titulo: 'Antes', versaoLocalId: null, bancoFonte: 'user', tema: 'ABERTURA', tom: 'D' },
    { id: 10, titulo: 'Música A', versaoLocalId: null, bancoFonte: 'user', tema: 'ABERTURA', tom: 'G', versaoRotulo: '' },
  ];
  const ok = substituirVersaoItemPlaylist(pl[1], '42');
  assert.equal(ok, true);
  assert.equal(pl.length, 2);
  assert.equal(pl[1].versaoLocalId, '42');
  assert.equal(pl[1].versaoRotulo, '');
  // Posição e demais dados da entrada (tema, tom, etc.) continuam intactos.
  assert.equal(pl[1].tema, 'ABERTURA');
  assert.equal(pl[1].tom, 'G');
  assert.equal(pl[0].id, 1);
});

test('substituirVersaoItemPlaylist: sem item, não faz nada e devolve false', () => {
  assert.equal(substituirVersaoItemPlaylist(null, '42'), false);
});

test('regressão: troca de versão nunca cai para ORIGINAL quando a versão selecionada é um fork do servidor', () => {
  // Cenário relatado: playlist tem «Música A — CÓPIA» (cópia local c_1); no HOME o
  // usuário selecionou a versão «TESTE», um fork do SERVIDOR com id próprio (57).
  const pl = [{ id: 10, titulo: 'Música A', versaoLocalId: 'c_1', bancoFonte: 'user' }];
  const versaoSelecionadaNoHome = '57'; // id do fork «TESTE» no servidor — NUNCA null/''.
  const d = decidirAcaoAdicionarVersaoAtivaNaPlaylist(pl, 10, versaoSelecionadaNoHome, 'user');
  assert.equal(d.acao, ACAO_CONFIRMAR_TROCA_VERSAO_PLAYLIST);
  substituirVersaoItemPlaylist(d.item, versaoSelecionadaNoHome);
  // NUNCA null (o que a UI leria como ORIGINAL) — tem de ser exatamente «57» (TESTE).
  assert.equal(pl[0].versaoLocalId, '57');
  assert.notEqual(pl[0].versaoLocalId, null);
});
