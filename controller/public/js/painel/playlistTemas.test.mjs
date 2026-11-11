import test from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
};

const {
  loadPlaylists,
  normalizarTemaPlaylist,
  normalizarListaTemas,
  filtrarPlaylistRemovendoTemaComMarcadores,
  playlistPossuiMarcadoresTema,
  obterUltimoMarcadorTema,
  listarMarcadoresTemaPlaylist,
  inserirMusicaNoBlocoTema,
} = await import('./playlistTemas.js');
const { LS_PLAYLISTS, LS_PLAYLISTS_LEGACY, PLAYLIST_TIPO_MARCADOR_TEMA } = await import('../modules/chavesArmazenamentoLocal.js');

const marcador = (tema) => ({ tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema });
const musica = (id, tema = '') => ({ id, titulo: `M${id}`, tema });

test('normalizarTemaPlaylist: apara, junta espaços, limita a 40 e põe em maiúsculas', () => {
  assert.equal(normalizarTemaPlaylist('  louvor   e   adoração '), 'LOUVOR E ADORAÇÃO');
  assert.equal(normalizarTemaPlaylist(null), '');
  assert.equal(normalizarTemaPlaylist('x'.repeat(60)).length, 40);
});

test('normalizarListaTemas: remove vazios e repetidos (já normalizados) mantendo a ordem', () => {
  assert.deepEqual(normalizarListaTemas([' louvor ', 'LOUVOR', '', 'adoração']), ['LOUVOR', 'ADORAÇÃO']);
  assert.deepEqual(normalizarListaTemas('não é lista'), []);
});

test('loadPlaylists: vazio, válido, JSON inválido e migração da chave antiga', () => {
  memoria.clear();
  assert.deepEqual(loadPlaylists(), {});
  memoria.set(LS_PLAYLISTS, JSON.stringify({ c1: [musica(1)] }));
  assert.deepEqual(loadPlaylists(), { c1: [musica(1)] });
  memoria.set(LS_PLAYLISTS, '{quebrado');
  assert.deepEqual(loadPlaylists(), {});
  memoria.clear();
  memoria.set(LS_PLAYLISTS_LEGACY, JSON.stringify({ velho: [musica(2)] }));
  assert.deepEqual(loadPlaylists(), { velho: [musica(2)] });
  assert.equal(memoria.has(LS_PLAYLISTS_LEGACY), false, 'a chave antiga é removida');
  assert.equal(memoria.has(LS_PLAYLISTS), true, 'e o conteúdo passa para a chave atual');
});

test('marcadores de tema: presença, último e lista distinta na ordem de aparição', () => {
  const pl = [marcador('a'), musica(1), marcador('b'), musica(2), marcador('a')];
  assert.equal(playlistPossuiMarcadoresTema(pl), true);
  assert.equal(playlistPossuiMarcadoresTema([musica(1)]), false);
  assert.equal(obterUltimoMarcadorTema(pl), 'A');
  assert.equal(obterUltimoMarcadorTema([musica(1)]), '');
  assert.deepEqual(listarMarcadoresTemaPlaylist(pl), ['A', 'B']);
});

test('filtrarPlaylistRemovendoTemaComMarcadores: tira o marcador e as músicas do bloco', () => {
  const pl = [marcador('A'), musica(1), musica(2), marcador('B'), musica(3)];
  const r = filtrarPlaylistRemovendoTemaComMarcadores(pl, 'a');
  assert.deepEqual(r.map((x) => x.id ?? x.tema), ['B', 3]);
  assert.equal(pl.length, 5, 'não altera a playlist original');
  assert.deepEqual(filtrarPlaylistRemovendoTemaComMarcadores(pl, ''), pl);
});

test('inserirMusicaNoBlocoTema: entra no fim do bloco do tema, antes do marcador seguinte', () => {
  const pl = [marcador('A'), musica(1), marcador('B'), musica(3)];
  inserirMusicaNoBlocoTema(pl, 'A', musica(9));
  assert.deepEqual(pl.map((x) => x.id ?? x.tema), ['A', 1, 9, 'B', 3]);
});
