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
  aplicarEscolhasVersao,
  versoesDistintasPorConteudo,
  versoesRowsRigorosamenteIdenticas,
  variantesDeTermoBusca,
  pontuacaoTitulo,
  construirItemPlaylist,
  inserirMusicaNoBlocoTema,
  garantirTemaNoItemExistente,
} = require('./syncInvbPlaylist');

const norm = (t) => normalizarChaveComparacao(t);

/** Banco falso: o `SELECT ... WHERE id = ?` e a lista de versões da família. */
function dbFalso(linhas) {
  return {
    prepare: () => ({
      get: (id) => linhas.get(Number(id)) || null,
      all: (rootId) =>
        [...linhas.values()]
          .filter((r) => Number(r.id) === Number(rootId) || Number(r.root_id) === Number(rootId))
          .sort((a, b) => Number(a.id) - Number(b.id)),
    }),
  };
}

/** Linha de versão do SQLite (estrofes chegam como texto JSON). */
function versao(id, rootId, estrofes, extra = {}) {
  return {
    id,
    root_id: rootId,
    parent_id: id === rootId ? null : rootId,
    titulo: 'Galileu',
    artista: 'Artista',
    estrofes: JSON.stringify(estrofes),
    is_immutable: id === rootId ? 1 : 0,
    rotulo: id === rootId ? null : 'Cópia',
    origem_importacao: ORIGEM_LYRA_ONLINE,
    ...extra,
  };
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
  /* Como no banco real: cadastrar cria o Original + a Cópia padrão idêntica. */
  const linhas = new Map([
    [10, versao(10, 10, ['linha'])],
    [110, versao(110, 10, ['linha'])],
    [11, versao(11, 11, ['linha'], { titulo: 'Ceia Santa' })],
    [111, versao(111, 11, ['linha'], { titulo: 'Ceia Santa' })],
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
  /* Original + Cópia rigorosamente idênticas → entra a Cópia, sem perguntar. */
  assert.equal(linhaGalileu.versaoLocalId, '110');
  assert.deepEqual(r.pendentesVersao, []);
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

/* ---------------------------------------------------------------------------
 * Escolha da versão no «Sinc. Lyra DB».
 *
 * Só há importação automática no caso exato «Original + uma Cópia rigorosamente
 * idêntica» — e aí entra a Cópia. Qualquer outra combinação vai para
 * `pendentesVersao` e quem escolhe é o utilizador, no painel.
 * ------------------------------------------------------------------------ */

test('comparação de versões: caractere por caractere, sem trim', () => {
  assert.equal(
    versoesRowsRigorosamenteIdenticas(versao(1, 1, ['Ai de mim']), versao(2, 1, ['Ai de mim'])),
    true
  );
  assert.equal(
    versoesRowsRigorosamenteIdenticas(versao(1, 1, ['Ai de mim']), versao(2, 1, ['Ai de mim '])),
    false
  );
  assert.equal(
    versoesRowsRigorosamenteIdenticas(versao(1, 1, ['A']), versao(2, 1, ['A', ''])),
    false
  );
  /* Título e artista também contam; rótulo e id não. */
  assert.equal(
    versoesRowsRigorosamenteIdenticas(versao(1, 1, ['A']), versao(2, 1, ['A'], { titulo: 'Outra' })),
    false
  );
  /* Conteúdo desconhecido nunca é idêntico a nada. */
  assert.equal(versoesRowsRigorosamenteIdenticas({ id: 1 }, { id: 2 }), false);
});

const ids = (lista) => lista.map((v) => Number(v.id));

test('deduplicação: um representante por conteúdo, e a Cópia representa a Original', () => {
  /* 1. Original + Cópia idênticas → sobra a Cópia. */
  assert.deepEqual(
    ids(versoesDistintasPorConteudo([versao(10, 10, ['A']), versao(11, 10, ['A'])], 10)),
    [11]
  );

  /* 1b. Quantidade de cópias não provoca pergunta: todas iguais → sobra a Cópia. */
  assert.deepEqual(
    ids(
      versoesDistintasPorConteudo(
        [versao(10, 10, ['A']), versao(11, 10, ['A']), versao(12, 10, ['A']), versao(13, 10, ['A'])],
        10
      )
    ),
    [11]
  );

  /* 2. Original = Cópia, mais uma cópia diferente → Cópia + a diferente (sem Original). */
  assert.deepEqual(
    ids(
      versoesDistintasPorConteudo(
        [versao(10, 10, ['A']), versao(11, 10, ['A']), versao(12, 10, ['B'])],
        10
      )
    ),
    [11, 12]
  );

  /* 3. Original ≠ Cópia → as duas, porque são conteúdos diferentes. */
  assert.deepEqual(
    ids(versoesDistintasPorConteudo([versao(10, 10, ['A']), versao(11, 10, ['B'])], 10)),
    [10, 11]
  );

  /* 4. Vários conteúdos diferentes → um de cada, a Cópia no lugar da Original. */
  assert.deepEqual(
    ids(
      versoesDistintasPorConteudo(
        [versao(10, 10, ['A']), versao(11, 10, ['A']), versao(12, 10, ['B']), versao(13, 10, ['C'])],
        10
      )
    ),
    [11, 12, 13]
  );

  /* Cópias iguais entre si mas diferentes da Original agrupam-se na primeira. */
  assert.deepEqual(
    ids(
      versoesDistintasPorConteudo(
        [versao(10, 10, ['A']), versao(11, 10, ['B']), versao(12, 10, ['B'])],
        10
      )
    ),
    [10, 11]
  );

  /* Só a Original → fica a Original. */
  assert.deepEqual(ids(versoesDistintasPorConteudo([versao(10, 10, ['A'])], 10)), [10]);

  /* Conteúdo ilegível nunca é agrupado. */
  assert.deepEqual(
    ids(versoesDistintasPorConteudo([{ id: 10, root_id: 10 }, { id: 11, root_id: 10 }], 10)),
    [10, 11]
  );
});

/** Culto de um item só, com a música já na biblioteca (Original do Lyra). */
async function sincronizarGalileuComVersoes(linhas) {
  responderBusca = (q) =>
    norm('Galileu').includes(norm(q)) || norm(q).includes(norm('Galileu'))
      ? { sucesso: true, resultados: [{ slug: 'galileu', titulo: 'Galileu' }] }
      : { sucesso: false, resultados: [] };
  responderImport = () => ({ ok: false, duplicado: true, existente: { id: 10, root_id: 10 } });
  const playlistsJson = {};
  const culto = {
    cultoId: 'culto_2026-09-20_manha',
    tipo: 'domingo_manha',
    itens: [{ nome: 'Galileu', tema: 'ABERTURA' }],
  };
  const r = await sincronizarCulto({ culto, db: dbFalso(linhas), playlistsJson, paths: {} });
  return { r, playlistsJson, pl: playlistsJson['culto_2026-09-20_manha'] };
}

test('Cópia com alterações: não entra nada, a escolha fica pendente', async () => {
  const linhas = new Map([
    [10, versao(10, 10, ['linha'])],
    [110, versao(110, 10, ['linha editada'])],
  ]);
  const { r, pl } = await sincronizarGalileuComVersoes(linhas);

  assert.equal(r.adicionadas, 0);
  assert.deepEqual(r.naoEncontradas, []);
  assert.deepEqual(resumo(pl), []);
  assert.equal(r.pendentesVersao.length, 1);
  const p = r.pendentesVersao[0];
  assert.equal(p.rootId, 10);
  assert.equal(p.tema, 'ABERTURA');
  assert.equal(p.cultoId, 'culto_2026-09-20_manha');
  assert.deepEqual(p.opcoes.map((o) => o.id), [10, 110]);
  assert.deepEqual(p.opcoes.map((o) => o.ehOriginal), [true, false]);
});

test('várias cópias, todas idênticas: entra a Cópia, sem perguntar', async () => {
  const linhas = new Map([
    [10, versao(10, 10, ['linha'])],
    [110, versao(110, 10, ['linha'])],
    [120, versao(120, 10, ['linha'], { rotulo: 'Cópia personalizada' })],
    [130, versao(130, 10, ['linha'], { rotulo: 'Cópia 2' })],
  ]);
  const { r, pl } = await sincronizarGalileuComVersoes(linhas);

  assert.equal(r.adicionadas, 1);
  assert.deepEqual(r.pendentesVersao, []);
  assert.deepEqual(resumo(pl), ['#ABERTURA', 'Galileu']);
  assert.equal(pl[1].versaoLocalId, '110');
});

test('Original = Cópia + uma cópia diferente: pergunta sem mostrar a Original', async () => {
  const linhas = new Map([
    [10, versao(10, 10, ['linha'])],
    [110, versao(110, 10, ['linha'])],
    [120, versao(120, 10, ['linha!'], { rotulo: 'Cópia personalizada' })],
  ]);
  const { r, pl } = await sincronizarGalileuComVersoes(linhas);

  assert.equal(r.adicionadas, 0);
  assert.deepEqual(resumo(pl), []);
  assert.equal(r.pendentesVersao.length, 1);
  assert.deepEqual(r.pendentesVersao[0].opcoes.map((o) => o.id), [110, 120]);
  assert.deepEqual(r.pendentesVersao[0].opcoes.map((o) => o.ehOriginal), [false, false]);
  assert.equal(r.pendentesVersao[0].opcoes[1].rotulo, 'Cópia personalizada');
});

test('vários conteúdos diferentes: uma opção por conteúdo, a Cópia no lugar da Original', async () => {
  const linhas = new Map([
    [10, versao(10, 10, ['linha'])],
    [110, versao(110, 10, ['linha'])],
    [120, versao(120, 10, ['linha 2'], { rotulo: 'Cópia 2' })],
    [130, versao(130, 10, ['linha 3'], { rotulo: 'Cópia 3' })],
  ]);
  const { r } = await sincronizarGalileuComVersoes(linhas);

  assert.equal(r.adicionadas, 0);
  assert.equal(r.pendentesVersao.length, 1);
  assert.deepEqual(r.pendentesVersao[0].opcoes.map((o) => o.id), [110, 120, 130]);
});

test('música já na playlist com versão escolhida: o sync não desfaz o vínculo', async () => {
  const linhas = new Map([
    [10, versao(10, 10, ['linha'])],
    [110, versao(110, 10, ['linha editada'])],
  ]);
  responderBusca = () => ({ sucesso: true, resultados: [{ slug: 'galileu', titulo: 'Galileu' }] });
  responderImport = () => ({ ok: false, duplicado: true, existente: { id: 10, root_id: 10 } });
  const playlistsJson = {};
  const cultoId = 'culto_2026-09-20_manha';
  playlistsJson[cultoId] = [
    { tipo: 'marcador_tema', tema: 'ABERTURA' },
    { id: 10, titulo: 'Galileu', tema: 'ABERTURA', versaoLocalId: '110', versaoRotulo: 'Cópia' },
  ];
  const culto = {
    cultoId,
    tipo: 'domingo_manha',
    itens: [{ nome: 'Galileu', tema: 'ABERTURA' }],
  };
  const r = await sincronizarCulto({ culto, db: dbFalso(linhas), playlistsJson, paths: {} });

  assert.equal(r.adicionadas, 0);
  assert.deepEqual(r.pendentesVersao, []);
  assert.equal(playlistsJson[cultoId][1].versaoLocalId, '110');
});

test('aplicarEscolhasVersao põe na playlist exatamente a versão escolhida', () => {
  const linhas = new Map([
    [10, versao(10, 10, ['linha'])],
    [110, versao(110, 10, ['linha editada'], { rotulo: 'Editada' })],
  ]);
  const db = dbFalso(linhas);

  const plCopia = {};
  assert.deepEqual(
    aplicarEscolhasVersao({
      db,
      playlistsJson: plCopia,
      escolhas: [{ cultoId: 'c1', rootId: 10, versaoId: 110, tema: 'ABERTURA' }],
    }),
    { adicionadas: 1 }
  );
  assert.deepEqual(resumo(plCopia.c1), ['#ABERTURA', 'Galileu']);
  assert.equal(plCopia.c1[1].id, 10);
  assert.equal(plCopia.c1[1].versaoLocalId, '110');
  assert.equal(plCopia.c1[1].versaoRotulo, 'Editada');

  /* Escolhendo a Original, a linha não aponta para versão nenhuma. */
  const plOriginal = {};
  aplicarEscolhasVersao({
    db,
    playlistsJson: plOriginal,
    escolhas: [{ cultoId: 'c1', rootId: 10, versaoId: 10, tema: 'ABERTURA' }],
  });
  assert.equal(plOriginal.c1[1].versaoLocalId, undefined);

  /* Versão de outra família é recusada. */
  const plOutra = {};
  assert.deepEqual(
    aplicarEscolhasVersao({
      db,
      playlistsJson: plOutra,
      escolhas: [{ cultoId: 'c1', rootId: 10, versaoId: 999, tema: 'ABERTURA' }],
    }),
    { adicionadas: 0 }
  );
  assert.deepEqual(plOutra, {});
});

test('só a Original na família: nada a escolher, entra a Original como antes', async () => {
  const linhas = new Map([[10, versao(10, 10, ['linha'])]]);
  const { r, pl } = await sincronizarGalileuComVersoes(linhas);

  assert.equal(r.adicionadas, 1);
  assert.deepEqual(r.pendentesVersao, []);
  assert.deepEqual(resumo(pl), ['#ABERTURA', 'Galileu']);
  assert.equal(pl[1].versaoLocalId, undefined);
});
