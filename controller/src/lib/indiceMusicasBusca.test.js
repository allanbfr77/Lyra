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

/** Markup Next.js recente: letra em divs (sem &lt;p&gt;), acordes em &lt;b data-chord-name&gt;. */
const CIFRA_NEXTJS_DIVS = `<!doctype html><html><head>
<meta property="og:title" content="Sou Casa / A Casa é Sua - Casa Worship / Elizeu Alves - Cifra Club"/>
<meta name="description" content="Cifras, tablaturas, videoaulas e muito mais no Cifra Club"/>
</head><body>
<div data-chord-content="true"><div class="kvMV">[Intro] <b data-chord-name="F">F</b> <b data-chord-name="C9">C9</b></div>
<div class="kvMV"><b data-chord-name="F">F</b>
Tens liberdade aqui

Espírito de Deus

Espírito de Deus
</div>
<div class="kvMV"><b data-chord-name="C9">C9</b>
Tens liberdade aqui

Espírito Santo

Espírito Santo
</div></div></body></html>`;

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

test('CifraClub Next.js (divs sem p): extrai letra e ignora [Intro]/acordes', () => {
  const estrofes = cifra.estrofesDePaginaCifraClub(CIFRA_NEXTJS_DIVS);
  assert.equal(estrofes.length, 2);
  assert.match(estrofes[0], /Tens liberdade aqui/);
  assert.match(estrofes[1], /Espírito Santo/);
  assert.ok(!estrofes.some((e) => /^\[Intro\]/.test(e)));
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

test('REGRESSÃO: muitas estrofes de 1 linha respeitam linhas por slide', () => {
  // Cifra Next.js (divs) devolve um verso por estrofe; sem acumular, 8 versos
  // viravam 8 slides com "4 linhas" selecionado.
  const umaPorLinha = [
    'Você é bem-vindo aqui',
    'A casa é sua, pode entrar',
    'Me esvazio de mim',
    'Me esvazio de mim',
    'Sopra o Teu vento aqui',
    'Toma o Teu trono, vem reinar',
    'Nós queremos Te ouvir',
    'Nós queremos Te ouvir',
  ];
  const slides4 = cifra.normalizarEstrofesComMaxLinhas(umaPorLinha, 4);
  assert.equal(slides4.length, 2, '8 linhas / 4 = 2 slides');
  assert.equal(slides4[0].split('\n').length, 4);
  assert.equal(slides4[1].split('\n').length, 4);

  const slides2 = cifra.normalizarEstrofesComMaxLinhas(umaPorLinha, 2);
  assert.equal(slides2.length, 4, '8 linhas / 2 = 4 slides');
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

test('slugsAlternativosDoTitulo cobre títulos compostos com barra', () => {
  const slugs = cifra.slugsAlternativosDoTitulo('Sou Casa / A Casa é Sua', 'sou-casa');
  assert.ok(slugs.includes('a-casa-e-sua'));
  assert.ok(slugs.includes('sou-casa-a-casa-e-sua'));
  assert.ok(!slugs.includes('sou-casa'));
});

test('slugsLetrasParaTentar inclui variantes do título', () => {
  const slugs = cifra.slugsLetrasParaTentar(
    '<a href="/casa-worship/outra/">x</a>',
    'casa-worship',
    'sou-casa',
    'Sou Casa / A Casa é Sua'
  );
  assert.equal(slugs[0], 'sou-casa');
  assert.ok(slugs.includes('a-casa-e-sua'));
});

test('fallback via índice acha letra quando o slug do Cifra não existe no Letras', async () => {
  const original = global.fetch;
  // Título simples (sem "/") → sem variantes de slug; o índice aponta outro artista/slug.
  const semLetra = `<!doctype html><html><head>
<meta name="description" content="Cifras, tablaturas, videoaulas e muito mais no Cifra Club"/>
</head><body><h1 class="t1">Sou Casa</h1><h2 class="t3">Casa Worship</h2>
</body></html>`;
  const letrasOk = `<!doctype html><html><body><div class="lyric-original">
<p>Eu sou casa<br/>Tu és o lar</p>
<p>A casa é Sua<br/>Pra sempre</p>
</div><script>"track_name":"A Casa é Sua","artist_name":"Elizeu Alves"</script></body></html>`;
  const indiceJson = JSON.stringify({
    response: {
      docs: [
        {
          t: '2',
          dns: 'elizeu-alves',
          url: 'a-casa-e-sua',
          txt: 'Sou Casa / A Casa é Sua',
          art: 'Elizeu Alves',
        },
      ],
    },
  });

  try {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('cifraclub.com.br')) {
        return { ok: true, status: 200, text: async () => semLetra };
      }
      if (u.includes('solr.sscdn.co')) {
        return { ok: true, status: 200, text: async () => indiceJson };
      }
      if (u.includes('letras.mus.br/elizeu-alves/a-casa-e-sua')) {
        return { ok: true, status: 200, text: async () => letrasOk };
      }
      if (u.includes('letras.mus.br')) {
        return { ok: false, status: 404, text: async () => '' };
      }
      return { ok: false, status: 500, text: async () => '' };
    };

    const r = await cifra.extrairLetraCifraClubParaPreviewOuImport(
      '/casa-worship/sou-casa/',
      { maxLinhasPorSlide: 4 }
    );
    assert.equal(r.erro, undefined);
    assert.equal(r.parcial, false);
    assert.ok(r.estrofes.length >= 1);
    assert.match(r.estrofes.join('\n'), /Eu sou casa/);
    assert.match(r.artista, /Elizeu/i);
  } finally {
    global.fetch = original;
  }
});

test('Letras.mus.br: path 404 cai no fallback e acha URL alternativa', async () => {
  const letrasMus = require('./letrasMusBr');
  const original = global.fetch;
  const letrasOk = `<!doctype html><html><body><div class="lyric-original">
<p>Tens liberdade aqui<br/>Espírito de Deus</p>
</div><script>"track_name":"Sou Casa","artist_name":"Elizeu Alves"</script></body></html>`;
  const indiceJson = JSON.stringify({
    response: {
      docs: [
        {
          t: '2',
          dns: 'casa-worship-elizeu-alves',
          url: 'sou-casa-a-casa-e-sua',
          txt: 'Sou Casa / A Casa é Sua',
          art: 'Casa Worship / Elizeu Alves',
        },
        {
          t: '2',
          dns: 'elizeu-alves',
          url: 'sou-casa',
          txt: 'Sou Casa',
          art: 'Elizeu Alves',
        },
      ],
    },
  });

  try {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('solr.sscdn.co')) {
        return { ok: true, status: 200, text: async () => indiceJson };
      }
      if (/letras\.mus\.br\/elizeu-alves\/sou-casa\/?$/i.test(u)) {
        return { ok: true, status: 200, text: async () => letrasOk };
      }
      if (u.includes('letras.mus.br')) {
        return { ok: false, status: 404, text: async () => '' };
      }
      return { ok: false, status: 500, text: async () => '' };
    };

    const r = await letrasMus.extrairLetraLetrasMusParaPreviewOuImport(
      '/casa-worship-elizeu-alves/sou-casa-a-casa-e-sua/',
      { maxLinhasPorSlide: 4 }
    );
    assert.equal(r.erro, undefined);
    assert.match(r.estrofes.join('\n'), /Tens liberdade/);
    assert.equal(r.path, '/elizeu-alves/sou-casa/');
  } finally {
    global.fetch = original;
  }
});

test('Letras.mus.br: 404 sem página alternativa cai no CifraClub', async () => {
  const letrasMus = require('./letrasMusBr');
  const original = global.fetch;
  const cifraHtml = `<!doctype html><html><head>
<meta property="og:title" content="Medley a Casa É Sua / Yeshua - A Casa É Sua - Cifra Club"/>
<meta name="description" content="Cifras, tablaturas, videoaulas e muito mais no Cifra Club"/>
</head><body>
<div data-chord-content="true"><div class="x">
Você é bem-vindo aqui

A casa é sua, pode entrar
</div></div></body></html>`;
  const indiceJson = JSON.stringify({
    response: {
      docs: [
        {
          t: '2',
          dns: 'a-casa-e-sua',
          url: 'medley-a-casa-e-sua-yeshua',
          txt: 'Medley a Casa É Sua / Yeshua',
          art: 'A Casa É Sua',
        },
      ],
    },
  });

  try {
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('solr.sscdn.co')) {
        return { ok: true, status: 200, text: async () => indiceJson };
      }
      if (u.includes('cifraclub.com.br')) {
        return { ok: true, status: 200, text: async () => cifraHtml };
      }
      if (u.includes('letras.mus.br')) {
        return { ok: false, status: 404, text: async () => '' };
      }
      return { ok: false, status: 500, text: async () => '' };
    };

    const r = await letrasMus.extrairLetraLetrasMusParaPreviewOuImport(
      '/a-casa-e-sua/medley-a-casa-e-sua-yeshua/',
      { maxLinhasPorSlide: 4 }
    );
    assert.equal(r.erro, undefined);
    assert.equal(r.fonteFallback, 'cifraclub');
    assert.match(r.estrofes.join('\n'), /bem-vindo/);
    assert.match(r.titulo, /Medley/i);
  } finally {
    global.fetch = original;
  }
});
