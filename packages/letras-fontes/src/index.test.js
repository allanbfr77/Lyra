'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  foldAccents,
  decodeHtmlEntidades,
  slugParaTituloExibicao,
  parseCaminhoLetraCifraClub,
  parseCaminhoLetraLetrasMusBr,
  estrofesDePaginaCifraClub,
  estrofesDePaginaLetrasMusHtml,
  estrofesDeTextoLetrasMetaEOg,
  linhasComoBlocoUnico,
  resultadoDoIndiceCombina,
  normalizarFonteLetras,
  slugsLetrasParaTentar,
} = require('./index.js');

describe('foldAccents e decodeHtmlEntidades', () => {
  it('remove acentos', () => {
    assert.equal(foldAccents('Galileu'), 'galileu');
    assert.equal(foldAccents('oração'), 'oracao');
  });

  it('decodifica entidades nomeadas e numéricas', () => {
    assert.equal(decodeHtmlEntidades('a &amp; b'), 'a & b');
    assert.equal(decodeHtmlEntidades('caf&#233;'), 'café');
    assert.equal(decodeHtmlEntidades('caf&#xE9;'), 'café');
  });
});

describe('slug e caminhos', () => {
  it('capitaliza o slug por hífen', () => {
    assert.equal(slugParaTituloExibicao('oceans-where-feet-may-fail'), 'Oceans Where Feet May Fail');
  });

  it('parseCaminhoLetraCifraClub normaliza /letra/ e rejeita blog', () => {
    assert.equal(
      parseCaminhoLetraCifraClub('https://www.cifraclub.com.br/fernandinho/galileu/letra/'),
      '/fernandinho/galileu/'
    );
    assert.equal(parseCaminhoLetraCifraClub('https://www.cifraclub.com.br/blog/foo/'), null);
  });

  it('parseCaminhoLetraLetrasMusBr rejeita /busca/', () => {
    assert.equal(
      parseCaminhoLetraLetrasMusBr('https://www.letras.mus.br/fernandinho/galileu/'),
      '/fernandinho/galileu/'
    );
    assert.equal(parseCaminhoLetraLetrasMusBr('https://www.letras.mus.br/busca/x/'), null);
  });
});

describe('HTML das páginas', () => {
  it('lê div.letra legado', () => {
    const html = '<div class="letra"><p>Linha um<br>Linha dois</p></div>';
    assert.deepEqual(estrofesDePaginaCifraClub(html), ['Linha um\nLinha dois']);
  });

  it('lê data-chord-content do Next.js', () => {
    const html =
      '<article data-chord-container="true"><div data-chord-content="true"><p>A<br/>B</p><p>C</p></div></article>';
    assert.deepEqual(estrofesDePaginaCifraClub(html), ['A\nB', 'C']);
  });

  it('lê lyric-original do Letras', () => {
    const html = '<div class="lyric-original"><p>Um<br/>Dois</p></div>';
    assert.deepEqual(estrofesDePaginaLetrasMusHtml(html), ['Um\nDois']);
  });

  it('og:description vira um bloco, não um slide por linha', () => {
    const html = '<meta property="og:description" content="Um / Dois / Tres">';
    assert.deepEqual(estrofesDeTextoLetrasMetaEOg(html), ['Um\nDois\nTres']);
    assert.deepEqual(linhasComoBlocoUnico('Um / Dois'), ['Um\nDois']);
  });
});

describe('índice', () => {
  it('normalizarFonteLetras aceita alias', () => {
    assert.equal(normalizarFonteLetras('letrasmusbr'), 'letras-mus-br');
    assert.equal(normalizarFonteLetras('cifraclub'), 'cifraclub');
  });

  it('termo misturando título e artista não é descartado', () => {
    const row = { titulo: 'Galileu', artista: 'Fernandinho' };
    assert.equal(
      resultadoDoIndiceCombina(row, 'fernandinho galileu', { titulo: true, artista: true }),
      true
    );
  });

  it('slugsLetrasParaTentar prioriza variação do slug vista no HTML', () => {
    const html = '<a href="/fernandinho/galileu-2/">x</a>';
    assert.deepEqual(slugsLetrasParaTentar(html, 'fernandinho', 'galileu'), ['galileu-2']);
    assert.deepEqual(slugsLetrasParaTentar('', 'fernandinho', 'galileu'), ['galileu']);
  });
});
