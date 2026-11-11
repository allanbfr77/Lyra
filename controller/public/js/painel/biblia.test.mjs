import test from 'node:test';
import assert from 'node:assert/strict';
import './_stubDom.mjs';

/* O módulo cria o reconhecimento de voz da Bíblia ao ser importado, e este consulta `window`. */
globalThis.window = globalThis.window || {};
const {
  LIVROS,
  BIBLIA_GRUPOS,
  bibliaGrupoPorIndiceLivro,
  bibliaGrupoPorLivro,
  bibliaCorTextoGrupo,
  bibliaNormalizarCampoReferencia,
  bibliaLivroNomeDb,
  bibliaGradienteCss,
  bibliaMesclarGradienteSalvo,
  bibliaSanitizarCamada,
  bibliaCacheChaveCapitulo,
  bnpLivroPorSiglaExata,
  bibliaHaParteProjetada,
  bibliaZerarParteProjetada,
  bibliaZerarVersiculoSelecionado,
  getBibliaCfgExibicao,
  getBibliaCfgMinistrante,
} = await import('./biblia.js');

test('LIVROS: 66 livros, 39 do Antigo e 27 do Novo Testamento, de Gênesis a Apocalipse', () => {
  assert.equal(LIVROS.length, 66);
  assert.equal(LIVROS.filter((l) => !l.nt).length, 39);
  assert.equal(LIVROS.filter((l) => l.nt).length, 27);
  assert.equal(LIVROS[0].nome, 'Gênesis');
  assert.equal(LIVROS[65].nome, 'Apocalipse');
  assert.equal(new Set(LIVROS.map((l) => l.nome)).size, 66, 'nomes únicos');
});

test('BIBLIA_GRUPOS cobrem os 66 livros em ordem crescente', () => {
  const fins = BIBLIA_GRUPOS.map((g) => g.fim);
  assert.deepEqual([...fins].sort((a, b) => a - b), fins);
  assert.equal(fins[fins.length - 1], 65);
  assert.equal(new Set(BIBLIA_GRUPOS.map((g) => g.id)).size, BIBLIA_GRUPOS.length);
});

test('bibliaGrupoPorIndiceLivro: limites dos grupos e índices fora da faixa', () => {
  assert.equal(bibliaGrupoPorIndiceLivro(0).id, 'pent');
  assert.equal(bibliaGrupoPorIndiceLivro(4).id, 'pent');
  assert.equal(bibliaGrupoPorIndiceLivro(5).id, 'hist');
  assert.equal(bibliaGrupoPorIndiceLivro(65).id, 'apoc');
  assert.equal(bibliaGrupoPorIndiceLivro(-3).id, 'pent');
  assert.equal(bibliaGrupoPorIndiceLivro(999).id, 'apoc');
});

test('bibliaGrupoPorLivro: acha pelo nome e cai no primeiro grupo se desconhecido', () => {
  assert.equal(bibliaGrupoPorLivro({ nome: 'Apocalipse' }).id, 'apoc');
  assert.equal(bibliaGrupoPorLivro({ nome: 'Gênesis' }).id, 'pent');
  assert.equal(bibliaGrupoPorLivro({ nome: 'Livro inexistente' }).id, 'pent');
});

test('bibliaCorTextoGrupo: texto claro ou escuro conforme o grupo', () => {
  assert.equal(bibliaCorTextoGrupo({ textoClaro: true }), '#ffffff');
  assert.equal(bibliaCorTextoGrupo({ textoClaro: false }), '#1a1a1a');
  assert.equal(bibliaCorTextoGrupo({}), '#1a1a1a');
});

test('bibliaNormalizarCampoReferencia: vazio, null/undefined textuais e números', () => {
  for (const v of [null, undefined, '', '   ', 'null', ' NULL ', 'undefined']) {
    assert.equal(bibliaNormalizarCampoReferencia(v), '', String(v));
  }
  assert.equal(bibliaNormalizarCampoReferencia(' 3 '), '3');
  assert.equal(bibliaNormalizarCampoReferencia(5), '5');
  assert.equal(bibliaNormalizarCampoReferencia('Gênesis'), 'Gênesis');
});

test('bibliaLivroNomeDb: objeto com dbNome, nome conhecido, desconhecido e vazio', () => {
  assert.equal(bibliaLivroNomeDb({ dbNome: 'Genesis', nome: 'Gênesis' }), 'Genesis');
  assert.equal(bibliaLivroNomeDb({ nome: 'Êxodo' }), 'Êxodo');
  assert.equal(bibliaLivroNomeDb('Gênesis').length > 0, true);
  assert.equal(bibliaLivroNomeDb('  Qualquer  '), 'Qualquer');
  assert.equal(bibliaLivroNomeDb(''), '');
  assert.equal(bibliaLivroNomeDb(null), '');
});

test('bnpLivroPorSiglaExata: só devolve quando a sigla identifica um único livro', () => {
  assert.equal(bnpLivroPorSiglaExata('Gn').nome, 'Gênesis');
  assert.equal(bnpLivroPorSiglaExata(' gn ').nome, 'Gênesis');
  assert.equal(bnpLivroPorSiglaExata(''), null);
  assert.equal(bnpLivroPorSiglaExata('zzzz'), null);
  const contagem = new Map();
  for (const l of LIVROS) contagem.set(l.sigla.toLowerCase(), (contagem.get(l.sigla.toLowerCase()) || 0) + 1);
  for (const l of LIVROS) {
    const esperado = contagem.get(l.sigla.toLowerCase()) === 1 ? l : null;
    assert.equal(bnpLivroPorSiglaExata(l.sigla), esperado, l.sigla);
  }
});

test('bibliaGradienteCss: usa as cores da camada ou os padrões', () => {
  assert.equal(bibliaGradienteCss({}), 'linear-gradient(135deg, #000000 0%, #161616 100%)');
  assert.equal(
    bibliaGradienteCss({ bgGradientFrom: '#111111', bgGradientTo: '#222222' }),
    'linear-gradient(135deg, #111111 0%, #222222 100%)'
  );
});

test('bibliaMesclarGradienteSalvo: preserva, extrai do CSS salvo ou cai no padrão', () => {
  const padrao = { bgGradientFrom: '#aaaaaa', bgGradientTo: '#bbbbbb' };
  const completa = { bgGradientFrom: '#1', bgGradientTo: '#2' };
  bibliaMesclarGradienteSalvo(completa, padrao);
  assert.deepEqual(completa, { bgGradientFrom: '#1', bgGradientTo: '#2' });
  const css = { bgGradient: 'linear-gradient(135deg, #123456 0%, #abcdef 100%)' };
  bibliaMesclarGradienteSalvo(css, padrao);
  assert.equal(css.bgGradientFrom, '#123456');
  assert.equal(css.bgGradientTo, '#abcdef');
  const vazia = {};
  bibliaMesclarGradienteSalvo(vazia, padrao);
  assert.equal(vazia.bgGradientFrom, '#aaaaaa');
  assert.equal(vazia.bgGradientTo, '#bbbbbb');
});

test('bibliaSanitizarCamada: só imagem guarda bgImage e o gradiente vira CSS', () => {
  assert.equal(bibliaSanitizarCamada({ bgType: 'solid', bgImage: 'x.png' }).bgImage, '');
  assert.equal(bibliaSanitizarCamada({ bgType: 'image', bgImage: 'x.png' }).bgImage, 'x.png');
  const g = bibliaSanitizarCamada({ bgType: 'gradient', bgGradientFrom: '#101010', bgGradientTo: '#202020', bgImage: 'x' });
  assert.equal(g.bgGradient, 'linear-gradient(135deg, #101010 0%, #202020 100%)');
  assert.equal(g.bgImage, '');
  const original = { bgType: 'solid', bgImage: 'x.png' };
  bibliaSanitizarCamada(original);
  assert.equal(original.bgImage, 'x.png', 'não altera a entrada');
});

test('bibliaCacheChaveCapitulo', () => {
  assert.equal(bibliaCacheChaveCapitulo('ARA', 'Gênesis', 3), 'ARA|Gênesis|3');
});

test('estado exposto ao núcleo: nada projetado e aparência padrão legível', () => {
  assert.equal(bibliaHaParteProjetada(), false);
  assert.doesNotThrow(() => bibliaZerarParteProjetada());
  assert.doesNotThrow(() => bibliaZerarVersiculoSelecionado());
  assert.equal(bibliaHaParteProjetada(), false);
  const pub = getBibliaCfgExibicao();
  const min = getBibliaCfgMinistrante();
  assert.equal(typeof pub.fontSize, 'number');
  assert.equal(typeof min.fontSize, 'number');
  assert.notEqual(pub, min);
});

