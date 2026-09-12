'use strict';

const test = require('node:test');
const assert = require('node:assert');

/*
 * A rota destrutura o banco e o cliente do Lyra online no `require`, por isso os
 * duplos de teste entram no `require.cache` ANTES de a rota ser carregada.
 */
const dbMusicasReal = require('../db/musicas');
const { normalizarChaveComparacao, ORIGEM_LYRA_ONLINE } = dbMusicasReal;

let responderImport = () => ({ ok: false });
require.cache[require.resolve('../db/musicas')].exports = {
  ...dbMusicasReal,
  importarMusicaUsuarioNoDb: (...args) => responderImport(...args),
};

const songbankReal = require('../lib/lyraSongbank');
let responderBusca = () => ({ sucesso: false, resultados: [] });
require.cache[require.resolve('../lib/lyraSongbank')].exports = {
  ...songbankReal,
  buscarMusicas: async ({ q }) => responderBusca(q),
  extrairLetraParaPreviewOuImport: async (slug) => ({
    titulo: String(slug || '').replace(/-/g, ' '),
    artista: 'Artista',
    estrofes: ['linha'],
  }),
};

const {
  sincronizarCulto,
  variantesDeTermoBusca,
  pontuacaoTitulo,
  construirItemPlaylist,
  inserirMusicaNoBlocoTema,
  garantirTemaNoItemExistente,
} = require('./syncInvbPlaylist');

const norm = (t) => normalizarChaveComparacao(t);

/** Banco falso: só o `SELECT * FROM musicas WHERE id = ?` que a rota usa. */
function dbFalso(linhas) {
  return { prepare: () => ({ get: (id) => linhas.get(Number(id)) || null }) };
}

function resumo(pl) {
  return pl.map((it) => (it.tipo === 'marcador_tema' ? `#${it.tema}` : it.titulo));
}

test('busca tenta o nome do site e variantes mais curtas', () => {
  const v = variantesDeTermoBusca('Ousado Amor (Reckless Love)');
  assert.equal(v[0], 'Ousado Amor (Reckless Love)');
  assert.ok(v.includes('Ousado Amor'));
  assert.ok(v.includes('Reckless Love'));

  assert.ok(variantesDeTermoBusca('Nada Além do Sangue - Ao Vivo').includes('Nada Além do Sangue'));
});

test('pontuação aceita o título certo e recusa o alheio', () => {
  assert.equal(pontuacaoTitulo(norm('Galileu'), norm('Galileu')), 1);
  assert.ok(pontuacaoTitulo(norm('Ousado Amor (Reckless Love)'), norm('Ousado Amor')) >= 0.8);
  assert.ok(
    pontuacaoTitulo(norm('Tu És o Deus de Toda a Terra'), norm('Deus de Toda a Terra')) >= 0.8
  );
  /* Antes bastava ser o 1.º resultado da busca — agora um título sem relação não passa. */
  assert.ok(pontuacaoTitulo(norm('Galileu'), norm('Maravilhosa Graça')) < 0.6);
});

test('música entra no fim do bloco do seu tema, não no fim da playlist', () => {
  const pl = [
    { tipo: 'marcador_tema', tema: 'ABERTURA' },
    { id: 1, titulo: 'A', tema: 'ABERTURA' },
    { tipo: 'marcador_tema', tema: 'OFERTÓRIO' },
    { id: 2, titulo: 'B', tema: 'OFERTÓRIO' },
  ];
  inserirMusicaNoBlocoTema(pl, 'ABERTURA', { id: 3, titulo: 'C', tema: 'ABERTURA' });
  assert.deepEqual(resumo(pl), ['#ABERTURA', 'A', 'C', '#OFERTÓRIO', 'B']);
});

test('tema novo cria o marcador no fim, como antes', () => {
  const pl = [{ tipo: 'marcador_tema', tema: 'ABERTURA' }, { id: 1, titulo: 'A' }];
  inserirMusicaNoBlocoTema(pl, 'CEIA', { id: 2, titulo: 'B' });
  assert.deepEqual(pl[2], { tipo: 'marcador_tema', tema: 'CEIA' });
  assert.equal(pl[3].titulo, 'B');
});

test('item da playlist leva o tema (o painel lê o tema da própria linha)', () => {
  const root = { id: 7, root_id: 7, titulo: 'Galileu', artista: 'Fernandinho' };
  const item = construirItemPlaylist(root, 'culto_2026-09-13_manha', root, 'ofertório');
  assert.equal(item.id, 7);
  assert.equal(item.tema, 'OFERTÓRIO');
  assert.equal(item.cultoId, 'culto_2026-09-13_manha');
  assert.equal(item.versaoLocalId, undefined);

  const copia = { id: 9, titulo: 'Galileu', artista: 'Fernandinho', rotulo: 'Cópia/Importada' };
  const itemCopia = construirItemPlaylist(root, 'culto_2026-09-13_manha', copia, 'ABERTURA');
  assert.equal(itemCopia.id, 7);
  assert.equal(itemCopia.versaoLocalId, '9');
});

test('linha antiga sem tema herda o tema do bloco onde está', () => {
  const pl = [
    { tipo: 'marcador_tema', tema: 'ABERTURA' },
    { id: 1, titulo: 'A' },
    { tipo: 'marcador_tema', tema: 'CEIA' },
    { id: 2, titulo: 'B' },
  ];
  assert.equal(garantirTemaNoItemExistente(pl, 3, 'ABERTURA'), true);
  assert.equal(pl[3].tema, 'CEIA');
  assert.equal(garantirTemaNoItemExistente(pl, 3, 'ABERTURA'), false);
});

test('música encontrada vai para a playlist do culto (e não só para a biblioteca)', async () => {
  responderBusca = (q) => {
    const catalogo = [
      { slug: 'galileu', titulo: 'Galileu' },
      { slug: 'ceia-santa', titulo: 'Ceia Santa' },
    ];
    const alvo = norm(q);
    const achados = catalogo.filter((c) => norm(c.titulo).includes(alvo) || alvo.includes(norm(c.titulo)));
    return { sucesso: achados.length > 0, resultados: achados };
  };
  const linhas = new Map([
    [10, { id: 10, root_id: 10, titulo: 'Galileu', artista: 'Artista', origem_importacao: ORIGEM_LYRA_ONLINE }],
    [11, { id: 11, root_id: 11, titulo: 'Ceia Santa', artista: 'Artista', origem_importacao: ORIGEM_LYRA_ONLINE }],
  ]);
  let proximo = 10;
  responderImport = () => ({ ok: true, id: proximo, rootId: proximo++ });

  const playlistsJson = {};
  const culto = {
    cultoId: 'culto_2026-09-13_manha',
    tipo: 'domingo_manha',
    itens: [
      { nome: 'Galileu', tema: 'ABERTURA' },
      { nome: 'Ceia Santa', tema: 'CEIA' },
    ],
  };

  const r = await sincronizarCulto({ culto, db: dbFalso(linhas), playlistsJson, paths: {} });

  assert.equal(r.adicionadas, 2);
  assert.deepEqual(r.naoEncontradas, []);
  assert.deepEqual(resumo(playlistsJson['culto_2026-09-13_manha']), [
    '#ABERTURA',
    'Galileu',
    '#CEIA',
    'Ceia Santa',
  ]);
  const linhaGalileu = playlistsJson['culto_2026-09-13_manha'][1];
  assert.equal(linhaGalileu.id, 10);
  assert.equal(linhaGalileu.tema, 'ABERTURA');
  assert.equal(linhaGalileu.cultoId, 'culto_2026-09-13_manha');
});

test('título sem relação não é importado nem entra na playlist', async () => {
  responderBusca = () => ({ sucesso: true, resultados: [{ slug: 'outra-musica', titulo: 'Outra Música' }] });
  let importou = 0;
  responderImport = () => {
    importou++;
    return { ok: true, id: 20, rootId: 20 };
  };
  const playlistsJson = {};
  const culto = {
    cultoId: 'culto_2026-09-16_quarta',
    tipo: 'quarta',
    itens: [{ nome: 'Galileu', tema: 'ABERTURA' }],
  };

  const r = await sincronizarCulto({ culto, db: dbFalso(new Map()), playlistsJson, paths: {} });

  assert.equal(importou, 0);
  assert.equal(r.adicionadas, 0);
  assert.deepEqual(r.naoEncontradas, [{ nome: 'Galileu', tipo: 'quarta' }]);
  assert.deepEqual(playlistsJson['culto_2026-09-16_quarta'], []);
});
