'use strict';

const test = require('node:test');
const assert = require('node:assert');

const dbMusicasReal = require('../db/musicas');
const { ORIGEM_LYRA_ONLINE } = dbMusicasReal;

const chamadasImport = [];
let responderImport = () => ({ ok: false });
require.cache[require.resolve('../db/musicas')].exports = {
  ...dbMusicasReal,
  importarMusicaUsuarioNoDb: (...args) => {
    chamadasImport.push(args);
    return responderImport(...args);
  },
};

const songbankReal = require('../lib/lyraSongbank');
const buscas = [];
let resultadosBusca = [];
require.cache[require.resolve('../lib/lyraSongbank')].exports = {
  ...songbankReal,
  buscarMusicas: async ({ q }) => {
    buscas.push(q);
    return { sucesso: true, resultados: resultadosBusca };
  },
  extrairLetraParaPreviewOuImport: async (slug) => ({ titulo: slug, artista: 'A', estrofes: ['x'] }),
};

const { sincronizarCulto, ehMedley, limparVinculosDeMedleys } = require('./syncInvbPlaylist');

const MEDLEY = 'Reacende a Chama / Vitorioso És / Deus de Obras Completas / A Deus Seja Glória';

function dbFalso(linhas) {
  return {
    prepare: () => ({
      get: (id) => linhas.get(Number(id)) || null,
      all: (rootId) => [...linhas.values()].filter((r) => Number(r.id) === Number(rootId) || Number(r.root_id) === Number(rootId)),
    }),
  };
}
const linha = (id, titulo) => ({
  id, root_id: id, parent_id: null, titulo, artista: '', estrofes: JSON.stringify(['']), origem_importacao: 'manual',
});

test('medley: pela marca da API ou pelo « / » com espaços; «24/7» não é medley', () => {
  assert.equal(ehMedley({ medley: true }, 'Qualquer'), true);
  assert.equal(ehMedley({}, MEDLEY), true);
  assert.equal(ehMedley({}, '24/7'), false);
  assert.equal(ehMedley({}, 'Galileu'), false);
});

test('medley: importa a música do banco com o título cheio IDÊNTICO', async () => {
  buscas.length = 0;
  chamadasImport.length = 0;
  responderImport = () => ({ ok: true, rootId: 60, id: 60 });
  resultadosBusca = [
    { slug: 'reacende-a-chama', titulo: 'Reacende a Chama' },
    { slug: 'medley-reacende', titulo: MEDLEY },
  ];
  const db = dbFalso(new Map([[60, { ...linha(60, MEDLEY), origem_importacao: ORIGEM_LYRA_ONLINE }]]));
  const playlists = {};
  const r = await sincronizarCulto({
    culto: { cultoId: 'c1', tipo: 'quarta', itens: [{ nome: MEDLEY, medley: true, tema: 'ABERTURA', fonteApi: true }] },
    db, playlistsJson: playlists, paths: {},
  });
  assert.equal(r.adicionadas, 1);
  assert.equal(r.naoEncontradas.length, 0);
  assert.equal(buscas[0], MEDLEY, 'procura pelo título cheio');
  assert.equal(chamadasImport.length, 1, 'uma música só, nunca as partes');
  assert.equal(chamadasImport[0][0], 'medley-reacende');
  const itens = playlists.c1.filter((i) => i.tipo !== 'marcador_tema');
  assert.equal(itens.length, 1);
  assert.equal(itens[0].id, 60);
});

test('medley: título parecido mas não idêntico (espaço, maiúscula, barra) não importa nada e avisa', async () => {
  for (const titulo of [
    'Reacende a Chama /  Vitorioso És / Deus de Obras Completas / A Deus Seja Glória',
    'Reacende a chama / Vitorioso És / Deus de Obras Completas / A Deus Seja Glória',
    'Reacende a Chama Vitorioso És Deus de Obras Completas A Deus Seja Glória',
    'Reacende a Chama',
  ]) {
    chamadasImport.length = 0;
    resultadosBusca = [{ slug: 'x', titulo }];
    const playlists = {};
    const r = await sincronizarCulto({
      culto: { cultoId: 'c1', tipo: 'quarta', itens: [{ nome: MEDLEY, tema: 'ABERTURA' }] },
      db: dbFalso(new Map()), playlistsJson: playlists, paths: {},
    });
    assert.equal(r.adicionadas, 0, titulo);
    assert.deepEqual(r.naoEncontradas.map((n) => n.nome), [MEDLEY]);
    assert.equal(chamadasImport.length, 0, 'não cria entrada nenhuma');
    assert.equal(playlists.c1.filter((i) => i.tipo !== 'marcador_tema').length, 0);
  }
});

test('medley achado no banco substitui a entrada vazia antiga; sem acerto ela fica', async () => {
  const antiga = () => [
    { tipo: 'marcador_tema', tema: 'ABERTURA' },
    { id: 50, titulo: MEDLEY, medley: true, tema: 'ABERTURA' },
  ];
  responderImport = () => ({ ok: true, rootId: 60, id: 60 });
  const db = dbFalso(new Map([[60, { ...linha(60, MEDLEY), origem_importacao: ORIGEM_LYRA_ONLINE }]]));

  resultadosBusca = [{ slug: 'medley-reacende', titulo: MEDLEY }];
  let playlists = { c1: antiga() };
  await sincronizarCulto({
    culto: { cultoId: 'c1', tipo: 'quarta', itens: [{ nome: MEDLEY, tema: 'ABERTURA' }] },
    db, playlistsJson: playlists, paths: {},
  });
  assert.deepEqual(playlists.c1.filter((i) => i.tipo !== 'marcador_tema').map((i) => i.id), [60]);

  resultadosBusca = [];
  playlists = { c1: antiga() };
  await sincronizarCulto({
    culto: { cultoId: 'c1', tipo: 'quarta', itens: [{ nome: MEDLEY, tema: 'ABERTURA' }] },
    db, playlistsJson: playlists, paths: {},
  });
  assert.deepEqual(playlists.c1.filter((i) => i.tipo !== 'marcador_tema').map((i) => i.id), [50]);
});

test('sem slug, vindo da API: título parcial NÃO vincula; título exato vincula', async () => {
  const db = dbFalso(new Map([[7, { ...linha(7, 'Galileu'), origem_importacao: ORIGEM_LYRA_ONLINE }]]));
  responderImport = () => ({ ok: true, rootId: 7, id: 7 });

  resultadosBusca = [{ slug: 'galileu-ao-vivo', titulo: 'Galileu Ao Vivo' }];
  let pl = {};
  let r = await sincronizarCulto({
    culto: { cultoId: 'c2', tipo: 'quarta', itens: [{ nome: 'Galileu', fonteApi: true, tema: 'ABERTURA' }] },
    db, playlistsJson: pl, paths: {},
  });
  assert.equal(r.adicionadas, 0, 'parcial não vincula');
  assert.equal(r.naoEncontradas.length, 1);

  resultadosBusca = [{ slug: 'galileu', titulo: 'Galileu' }];
  pl = {};
  r = await sincronizarCulto({
    culto: { cultoId: 'c2', tipo: 'quarta', itens: [{ nome: 'Galileu', fonteApi: true, tema: 'ABERTURA' }] },
    db, playlistsJson: pl, paths: {},
  });
  assert.equal(r.adicionadas, 1, 'exato vincula');
});

test('com slug preenchido o vínculo é direto, sem busca', async () => {
  buscas.length = 0;
  const db = dbFalso(new Map([[7, { ...linha(7, 'galileu'), origem_importacao: ORIGEM_LYRA_ONLINE }]]));
  responderImport = () => ({ ok: true, rootId: 7, id: 7 });
  const r = await sincronizarCulto({
    culto: { cultoId: 'c3', tipo: 'quarta', itens: [{ nome: 'Galileu', slug: 'galileu', fonteApi: true, tema: 'ABERTURA' }] },
    db, playlistsJson: {}, paths: {},
  });
  assert.equal(r.adicionadas, 1);
  assert.equal(buscas.length, 0);
});

test('limpeza: tira o vínculo antigo do 1.º trecho do medley, só no mesmo bloco e se não for item avulso', () => {
  const pl = [
    { tipo: 'marcador_tema', tema: 'ABERTURA' },
    { id: 1, titulo: 'Reacende a Chama', tema: 'ABERTURA' },
    { id: 2, titulo: 'Galileu', tema: 'ABERTURA' },
    { tipo: 'marcador_tema', tema: 'CEIA' },
    { id: 3, titulo: 'Reacende a Chama', tema: 'CEIA' },
  ];
  const itens = [{ nome: MEDLEY, tema: 'ABERTURA' }, { nome: 'Galileu', tema: 'ABERTURA' }];
  assert.equal(limparVinculosDeMedleys(pl, itens), 1);
  assert.deepEqual(pl.filter((i) => i.tipo !== 'marcador_tema').map((i) => i.id), [2, 3]);

  const plAvulso = [{ tipo: 'marcador_tema', tema: 'ABERTURA' }, { id: 1, titulo: 'Reacende a Chama', tema: 'ABERTURA' }];
  assert.equal(
    limparVinculosDeMedleys(plAvulso, [{ nome: MEDLEY, tema: 'ABERTURA' }, { nome: 'Reacende a Chama', tema: 'ABERTURA' }]),
    0
  );
});
