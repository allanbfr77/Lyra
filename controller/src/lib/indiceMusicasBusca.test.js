'use strict';

/**
 * Testes do índice de busca de músicas (sem rede).
 *
 * `extrairResultadosDoIndice` é testado com corpos de resposta fixos, incluindo a
 * resposta real do índice para "galileu" — a busca que falhava em campo.
 *
 * Rodar: npm test (na raiz)
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  extrairResultadosDoIndice,
  resultadoDoIndiceCombina,
  normalizarFonteLetras,
  buscarNoIndiceDeMusicas,
} = require('./indiceMusicasBusca');

const cifra = require('./cifraLetras');

/** Resposta real do índice para q=galileu, reduzida aos campos que usamos. */
const REAL_GALILEU = JSON.stringify({
  response: {
    numFound: 57,
    docs: [
      { t: '2', art: 'Fernandinho', dns: 'fernandinho', txt: 'Galileu', full_txt: 'Galileu Fernandinho', url: 'galileu' },
      { t: '2', art: 'Marcos Antônio', dns: 'marcos-antonio', txt: 'Galileu', full_txt: 'Galileu Marcos Antônio', url: 'galileu' },
      { t: '2', art: 'Padre Zezinho', dns: 'padre-zezinho', txt: 'Um Certo Galileu', full_txt: 'Um Certo Galileu Padre Zezinho', url: 'um-certo-galileu' },
      { t: '2', art: 'Colo de Deus', dns: 'comunidade-catolica-colo-de-deus', txt: 'Morada / Galileu', full_txt: 'Morada / Galileu Colo de Deus', url: 'morada-galileu' },
      // Doc de artista: deve ser descartado (só músicas interessam)
      { t: '1', art: 'Os Galileus', dns: 'os-galileus', txt: 'Os Galileus', full_txt: 'Os Galileus' },
    ],
  },
});

const FILTRO_PADRAO = { titulo: true, artista: true, letra: false };

test('extrai músicas e descarta docs de artista (t=1)', () => {
  const rows = extrairResultadosDoIndice(REAL_GALILEU, {
    texto: 'galileu',
    filtros: FILTRO_PADRAO,
    fonte: 'cifraclub',
  });

  assert.equal(rows.length, 4);
  assert.ok(!rows.some((r) => r.path.includes('os-galileus')), 'artista não deveria virar resultado');
});

test('monta o path no formato /artista/musica/ e usa título e artista reais', () => {
  const rows = extrairResultadosDoIndice(REAL_GALILEU, {
    texto: 'galileu',
    filtros: FILTRO_PADRAO,
    fonte: 'cifraclub',
  });

  assert.equal(rows[0].path, '/fernandinho/galileu/');
  assert.equal(rows[0].titulo, 'Galileu');
  assert.equal(rows[0].artista, 'Fernandinho');
  assert.equal(rows[0].fonte, 'cifraclub');
});

test('preserva a ordem de relevância do índice', () => {
  const rows = extrairResultadosDoIndice(REAL_GALILEU, {
    texto: 'galileu',
    filtros: FILTRO_PADRAO,
    fonte: 'cifraclub',
  });

  assert.deepEqual(
    rows.map((r) => r.artista),
    ['Fernandinho', 'Marcos Antônio', 'Padre Zezinho', 'Colo de Deus']
  );
});

test('termo que mistura título e artista não é descartado', () => {
  // Regressão: o filtro antigo casava contra os SLUGS da URL, então
  // "fernandinho galileu" não casava com o slug `galileu` nem com `fernandinho`
  // isoladamente, e o acerto do índice era jogado fora.
  const rows = extrairResultadosDoIndice(REAL_GALILEU, {
    texto: 'fernandinho galileu',
    filtros: FILTRO_PADRAO,
    fonte: 'cifraclub',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, '/fernandinho/galileu/');
});

test('busca só por artista filtra pelo nome do artista', () => {
  const rows = extrairResultadosDoIndice(REAL_GALILEU, {
    texto: 'padre zezinho',
    filtros: { titulo: false, artista: true, letra: false },
    fonte: 'cifraclub',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].artista, 'Padre Zezinho');
});

test('casamento é insensível a acento', () => {
  const rows = extrairResultadosDoIndice(REAL_GALILEU, {
    texto: 'marcos antonio',
    filtros: FILTRO_PADRAO,
    fonte: 'cifraclub',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].artista, 'Marcos Antônio');
});

test('remove paths duplicados', () => {
  const corpo = JSON.stringify({
    response: {
      docs: [
        { t: '2', art: 'Fernandinho', dns: 'fernandinho', txt: 'Galileu', url: 'galileu' },
        { t: '2', art: 'Fernandinho', dns: 'fernandinho', txt: 'Galileu', url: 'galileu' },
      ],
    },
  });

  const rows = extrairResultadosDoIndice(corpo, { texto: 'galileu', filtros: FILTRO_PADRAO });
  assert.equal(rows.length, 1);
});

test('resposta sem docs devolve lista vazia, sem lançar', () => {
  const rows = extrairResultadosDoIndice(JSON.stringify({ response: { docs: [] } }), {
    texto: 'zzznaoexiste',
    filtros: FILTRO_PADRAO,
  });
  assert.deepEqual(rows, []);
});

test('corpo HTML de captcha é classificado como bloqueio, não como lista vazia', () => {
  // Portal cativo de Wi-Fi ou muro de bot: status 200, corpo HTML.
  // Sem esta checagem viraria "nenhum resultado" silencioso.
  assert.throws(
    () => extrairResultadosDoIndice('<html><body>Please complete this CAPTCHA</body></html>', {
      texto: 'galileu',
      filtros: FILTRO_PADRAO,
    }),
    (e) => e.motivo === 'bloqueado'
  );
});

test('corpo não-JSON sem cara de bloqueio é erro de protocolo', () => {
  assert.throws(
    () => extrairResultadosDoIndice('nao é json', { texto: 'x', filtros: FILTRO_PADRAO }),
    (e) => e.motivo === 'http'
  );
});

test('normalizarFonteLetras aceita as duas grafias de letras.mus.br', () => {
  assert.equal(normalizarFonteLetras('letras-mus-br'), 'letras-mus-br');
  assert.equal(normalizarFonteLetras('letrasmusbr'), 'letras-mus-br');
  assert.equal(normalizarFonteLetras('cifraclub'), 'cifraclub');
  assert.equal(normalizarFonteLetras(''), 'cifraclub');
  assert.equal(normalizarFonteLetras(undefined), 'cifraclub');
});

test('resultadoDoIndiceCombina aceita tudo quando o termo é vazio', () => {
  assert.equal(resultadoDoIndiceCombina({ titulo: 'X', artista: 'Y' }, '', {}), true);
});

test('busca com termo vazio não faz requisição', async () => {
  const original = global.fetch;
  let chamou = false;
  global.fetch = () => {
    chamou = true;
    throw new Error('não deveria ter sido chamado');
  };
  try {
    assert.deepEqual(await buscarNoIndiceDeMusicas({ texto: '   ' }), []);
    assert.equal(chamou, false);
  } finally {
    global.fetch = original;
  }
});

test('HTTP 403 vira erro com motivo "bloqueado"', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 403, text: async () => 'blocked' });
  try {
    await assert.rejects(
      buscarNoIndiceDeMusicas({ texto: 'galileu', filtros: FILTRO_PADRAO }),
      (e) => e.motivo === 'bloqueado' && e.status === 403
    );
  } finally {
    global.fetch = original;
  }
});

test('busca bem-sucedida atravessa fetch e parsing', async () => {
  const original = global.fetch;
  let urlChamada = '';
  global.fetch = async (url) => {
    urlChamada = String(url);
    return { ok: true, status: 200, text: async () => REAL_GALILEU };
  };
  try {
    const rows = await buscarNoIndiceDeMusicas({
      texto: 'galileu',
      filtros: FILTRO_PADRAO,
      fonte: 'letras-mus-br',
    });
    assert.equal(rows.length, 4);
    assert.equal(rows[0].fonte, 'letras-mus-br');
    assert.match(urlChamada, /solr\.sscdn\.co\/cifraclub\/h\/\?q=galileu/);
  } finally {
    global.fetch = original;
  }
});

// ============================================================================
// Extração de letra — regressão da truncagem para 4 linhas
//
// Fixtures reproduzem a estrutura REAL das páginas, conferida no HTML salvo de
// "Galileu" (Fernandinho):
//   CifraClub (Next.js): <article data-chord-container><div data-chord-content>
//                        <div class="kvMV"><p class="_0TPj">linha<br/>linha</p>
//   Letras.mus.br:       <div class="lyric-original"><p>linha<br/>linha</p>
//
// As classes do CifraClub (`XjgwI`, `kvMV`, `_0TPj`) são hashes de build e mudam
// a cada deploy — por isso a extração se ancora nos `data-*`, que são semânticos.
// ============================================================================

const CIFRA_NEXTJS = `<!doctype html><html><head>
<meta name="description" content="Deixou Sua glória / Foi por amor, foi por amor / E o Seu sangue derramou / Que grande amor"/>
</head><body><h1 class="t1">Galileu</h1><h2 class="t3">Fernandinho</h2>
<article data-chord-container="true" class="XjgwI"><div class="_5QAC o89fH"><div data-chord-content="true" data-chord-select="true"><div class="kvMV">
<p class="_0TPj">Deixou Sua glória<br/>Foi por amor, foi por amor<br/>E o Seu sangue derramou<br/>Que grande amor</p>
<p class="_0TPj">Naquela via dolorosa se entregou<br/>Eu não mereço, mas Sua graça me alcançou</p>
<p class="_0TPj">Eu me rendo ao Seu amor<br/>Eu me rendo ao Seu amor<br/>Eu me rendo ao Seu amor<br/>Eu me rendo, eu me rendo</p>
</div></div></div></article></body></html>`;

const LETRAS_PAGINA = `<!doctype html><html><head>
<meta property="og:description" content="Deixou Sua glória / Foi por amor, foi por amor / E o Seu sangue derramou / Que grande amor">
</head><body><div class="lyric-original">
<p>Deixou Sua glória<br/>Foi por amor, foi por amor<br/>E o Seu sangue derramou<br/>Que grande amor</p>
<p>Naquela via dolorosa se entregou<br/>Eu não mereço, mas Sua graça me alcançou</p>
</div></body></html>`;

test('CifraClub Next.js: extrai a letra completa via data-chord-content', () => {
  const estrofes = cifra.estrofesDePaginaCifraClub(CIFRA_NEXTJS);

  assert.equal(estrofes.length, 3, 'deveria achar as 3 estrofes');
  assert.equal(estrofes[0].split('\n').length, 4, 'a 1a estrofe tem 4 linhas');
  assert.match(estrofes[2], /Eu me rendo, eu me rendo/);
});

test('REGRESSÃO: não cai na meta description quando o HTML tem a letra', () => {
  // O bug: a meta description traz só as 4 primeiras linhas. Como vinha
  // não-vazia, a cadeia parava nela e o resultado era uma música de 4 linhas.
  const doHtml = cifra.estrofesDePaginaCifraClub(CIFRA_NEXTJS);
  const daMeta = cifra.estrofesFallbackMetaDescricaoCifra(CIFRA_NEXTJS);

  const linhasHtml = doHtml.join('\n').split('\n').length;
  const linhasMeta = daMeta.join('\n').split('\n').length;

  assert.equal(linhasMeta, 4, 'a meta description tem só o começo');
  assert.ok(linhasHtml > linhasMeta, `HTML (${linhasHtml}) deve render mais que meta (${linhasMeta})`);
});

test('REGRESSÃO: meta description devolve UM bloco, não uma estrofe por linha', () => {
  // Antes devolvia 4 estrofes de 1 linha, e cada uma virava um slide —
  // o seletor "linhas por slide" não tinha efeito nenhum.
  const daMeta = cifra.estrofesFallbackMetaDescricaoCifra(CIFRA_NEXTJS);
  assert.equal(daMeta.length, 1, 'deve ser um bloco só');
  assert.equal(daMeta[0].split('\n').length, 4);

  assert.equal(cifra.normalizarEstrofesComMaxLinhas(daMeta, 4).length, 1, 'max=4 -> 1 slide');
  assert.equal(cifra.normalizarEstrofesComMaxLinhas(daMeta, 2).length, 2, 'max=2 -> 2 slides');
});

test('Letras.mus.br: extrai via lyric-original e prefere a página à og:description', () => {
  const estrofes = cifra.estrofesDePaginaLetrasMusHtml(LETRAS_PAGINA);
  assert.equal(estrofes.length, 2);
  assert.equal(estrofes[0].split('\n').length, 4);
});

test('extração ignora classes hasheadas e usa só os data-*', () => {
  // Simula um deploy do CifraClub que trocou todos os hashes de classe.
  const outroDeploy = CIFRA_NEXTJS
    .replace(/XjgwI/g, 'aB9zZ')
    .replace(/kvMV/g, 'qq11W')
    .replace(/_0TPj/g, '_9ZZq')
    .replace(/_5QAC o89fH/g, 'zzz yyy');

  const estrofes = cifra.estrofesDePaginaCifraClub(outroDeploy);
  assert.equal(estrofes.length, 3, 'troca de hash de classe não pode quebrar a extração');
});

test('extrairHtmlInternoPorAtributo respeita aninhamento', () => {
  const html = '<div data-alvo="1"><div>interno</div>fim</div><div>fora</div>';
  assert.equal(cifra.extrairHtmlInternoPorAtributo(html, 'data-alvo'), '<div>interno</div>fim');
});

test('extrairHtmlInternoPorAtributo devolve null quando o atributo não existe', () => {
  assert.equal(cifra.extrairHtmlInternoPorAtributo('<div class="x">a</div>', 'data-alvo'), null);
});

test('extração completa marca parcial=false; só-meta marca parcial=true', async () => {
  const original = global.fetch;
  try {
    // Caso bom: CifraClub entrega a letra
    global.fetch = async () => ({ ok: true, status: 200, text: async () => CIFRA_NEXTJS });
    const bom = await cifra.extrairLetraCifraClubParaPreviewOuImport('/fernandinho/galileu/', {
      maxLinhasPorSlide: 4,
    });
    assert.equal(bom.parcial, false);
    assert.ok(bom.estrofes.length >= 3);

    // Caso degradado: sem os containers e sem Letras.mus.br -> sobra a meta
    const semLetra = CIFRA_NEXTJS.replace(/data-chord-content/g, 'data-x1').replace(
      /data-chord-container/g,
      'data-x2'
    );
    global.fetch = async (url) =>
      String(url).includes('cifraclub.com.br')
        ? { ok: true, status: 200, text: async () => semLetra }
        : { ok: false, status: 503, text: async () => '' };

    const degradado = await cifra.extrairLetraCifraClubParaPreviewOuImport('/fernandinho/galileu/', {
      maxLinhasPorSlide: 4,
    });
    assert.equal(degradado.parcial, true, 'precisa avisar que a letra está incompleta');
    assert.equal(degradado.estrofes.length, 1);
  } finally {
    global.fetch = original;
  }
});
