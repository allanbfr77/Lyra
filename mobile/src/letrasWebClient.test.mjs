/**
 * Teste de fumaça da busca/extração de letras. `fetch` é stubado — não faz rede real.
 *
 * Rodar: npm test  (em mobile/)
 *
 * Cobre os defeitos reais encontrados em campo:
 * - hop do controlador na LAN bloqueando a busca em 4G/5G
 * - Yahoo e /busca/?q= mortos, substituídos pelo índice JSON da Studio Sol
 * - bloqueio anti-bot chegando à UI como "nenhum resultado"
 * - timeout do controlador virando falso "sem resposta da Internet"
 */
import assert from 'node:assert';
import { buscarLetrasNaWeb, extrairLetraParaPreviewOuImport } from './letrasWebClient.js';

const HOST_LAN = '192.168.1.10';

/** Resposta do índice da Studio Sol: duas músicas (t=2) e um artista (t=1, ignorado). */
const INDICE_OK = JSON.stringify({
  response: {
    numFound: 3,
    docs: [
      {
        t: '2',
        art: 'Hillsong UNITED',
        dns: 'hillsong-united',
        txt: 'Oceans (Where Feet May Fail)',
        full_txt: 'Oceans (Where Feet May Fail) Hillsong UNITED',
        url: 'oceans-where-feet-may-fail',
      },
      {
        t: '2',
        art: 'Hillsong Em Portugues',
        dns: 'hillsong-brasil',
        txt: 'Oceans',
        full_txt: 'Oceans Hillsong Em Portugues',
        url: 'oceans',
      },
      { t: '1', art: 'Hillsong', dns: 'hillsong', txt: 'Hillsong', full_txt: 'Hillsong' },
    ],
  },
});

const INDICE_VAZIO = JSON.stringify({ response: { numFound: 0, docs: [] } });

const CAPTCHA_HTML =
  '<html><head><title>Verificacao</title></head><body>Please complete this CAPTCHA. Unusual traffic detected.</body></html>';

// Precisa passar da checagem de sanidade do app (html.length > 200), daí o padding.
const CIFRA_PAGINA = `<html><head><title>Oceans - Hillsong United</title>${'<!-- padding -->'.repeat(20)}</head>
<body><h1 class="t1">Oceans</h1><h2 class="t3">Hillsong United</h2>
<div class="letra"><p>Linha um da musica<br>Linha dois da musica</p></div></body></html>`;

const PAGINA_SEM_LETRA = `<html><body>${'<!-- vazio -->'.repeat(30)}</body></html>`;

let chamadas = [];

/** Instala um fetch falso. `rotas` mapeia substring de URL -> handler. */
function instalarFetch(rotas) {
  chamadas = [];
  globalThis.fetch = (url, init = {}) => {
    chamadas.push(String(url));
    const chave = Object.keys(rotas).find((k) => String(url).includes(k));
    const handler = chave ? rotas[chave] : null;

    if (!handler) {
      return Promise.resolve({ ok: false, status: 404, text: async () => '', json: async () => ({}) });
    }

    return new Promise((resolve, reject) => {
      const r = handler();
      if (r.pendura) {
        // Simula SYN descartado sem RST: só o abort resolve.
        if (init.signal) {
          if (init.signal.aborted) {
            return reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          }
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          );
        }
        return;
      }
      setTimeout(() => resolve(r.res), r.atraso || 0);
    });
  };
}

const resOk = (texto, atraso = 0) => ({
  res: {
    ok: true,
    status: 200,
    text: async () => texto,
    json: async () => JSON.parse(texto),
  },
  atraso,
});
const resJson = (obj, atraso = 0) => resOk(JSON.stringify(obj), atraso);
const resStatus = (status) => ({
  res: { ok: false, status, text: async () => 'blocked', json: async () => ({}) },
});
const pendurado = () => ({ pendura: true });

const buscaPadrao = (extra) => ({
  q: 'oceans',
  titulo: true,
  artista: true,
  letra: false,
  fonte: 'cifraclub',
  hostControlador: '',
  ...extra,
});

const testes = [];
const teste = (nome, fn) => testes.push([nome, fn]);

// ============================================================ corrida de hops

teste('4G — host LAN pendurado NAO atrasa a busca', async () => {
  instalarFetch({ '192.168.1.10': pendurado, 'solr.sscdn.co': () => resOk(INDICE_OK) });

  const t0 = Date.now();
  const r = await buscarLetrasNaWeb(buscaPadrao({ hostControlador: HOST_LAN }));
  const ms = Date.now() - t0;

  assert.ok(r.resultados.length > 0, 'deveria trazer resultados do índice');
  assert.equal(r.via, 'indice');
  assert.ok(ms < 2000, `deveria responder rápido, levou ${ms}ms`);
  assert.ok(
    chamadas.some((u) => u.includes('192.168.1.10')),
    'o hop do controlador deve ter sido tentado, em paralelo'
  );
  return `${ms}ms, via=${r.via}, ${r.resultados.length} resultados`;
});

teste('LAN — controlador responde primeiro e vence a corrida', async () => {
  instalarFetch({
    '192.168.1.10': () =>
      resJson({
        sucesso: true,
        resultados: [{ path: '/hillsong-united/oceans/', titulo: 'Oceans', artista: 'Hillsong United' }],
      }),
    'solr.sscdn.co': () => resOk(INDICE_OK, 300),
  });

  const r = await buscarLetrasNaWeb(buscaPadrao({ hostControlador: HOST_LAN }));

  assert.equal(r.via, 'controlador');
  assert.equal(r.resultados.length, 1);
  return `via=${r.via}`;
});

teste('LAN — controlador vazio nao mata a busca; o indice assume', async () => {
  instalarFetch({
    '192.168.1.10': () => resJson({ sucesso: false, erro: 'Nenhum resultado', resultados: [] }),
    'solr.sscdn.co': () => resOk(INDICE_OK, 50),
  });

  const r = await buscarLetrasNaWeb(buscaPadrao({ hostControlador: HOST_LAN }));

  assert.equal(r.via, 'indice');
  assert.ok(r.resultados.length > 0);
  return `via=${r.via}, ${r.resultados.length} resultados`;
});

// ============================================================ parsing do indice

teste('indice — monta o path correto e ignora docs de artista (t=1)', async () => {
  instalarFetch({ 'solr.sscdn.co': () => resOk(INDICE_OK) });

  const r = await buscarLetrasNaWeb(buscaPadrao());

  assert.equal(r.resultados.length, 2, 'o doc t=1 (artista) deve ser descartado');
  assert.equal(r.resultados[0].path, '/hillsong-united/oceans-where-feet-may-fail/');
  assert.equal(r.resultados[0].titulo, 'Oceans (Where Feet May Fail)');
  assert.equal(r.resultados[0].artista, 'Hillsong UNITED');
  return r.resultados[0].path;
});

teste('indice — termo que mistura titulo e artista nao e descartado', async () => {
  // Regressao: o filtro antigo casava contra os SLUGS, então "hillsong oceans"
  // não casava nem com o slug do título nem com o do artista, e o app dizia
  // "nenhum resultado" apesar de o índice ter acertado.
  instalarFetch({ 'solr.sscdn.co': () => resOk(INDICE_OK) });

  const r = await buscarLetrasNaWeb(buscaPadrao({ q: 'hillsong oceans' }));

  assert.ok(r.resultados.length > 0, 'deveria manter os acertos do índice');
  return `${r.resultados.length} resultados para "hillsong oceans"`;
});

teste('letras-mus-br usa o mesmo indice e marca a fonte', async () => {
  instalarFetch({ 'solr.sscdn.co': () => resOk(INDICE_OK) });

  const r = await buscarLetrasNaWeb(buscaPadrao({ fonte: 'letras-mus-br' }));

  assert.ok(r.resultados.length > 0);
  assert.equal(r.resultados[0].fonte, 'letras-mus-br');
  return `fonte=${r.resultados[0].fonte}`;
});

// ============================================================ classificacao de erro

teste('403 no indice e classificado como bloqueio', async () => {
  instalarFetch({ 'solr.sscdn.co': () => resStatus(403) });

  const r = await buscarLetrasNaWeb(buscaPadrao());

  assert.equal(r.resultados.length, 0);
  assert.equal(r.bloqueado, true);
  return r.diagnostico;
});

teste('HTTP 200 com captcha em vez de JSON e classificado como bloqueio', async () => {
  // Portal cativo de Wi-Fi ou muro de bot: status 200, corpo HTML.
  instalarFetch({ 'solr.sscdn.co': () => resOk(CAPTCHA_HTML) });

  const r = await buscarLetrasNaWeb(buscaPadrao());

  assert.equal(r.resultados.length, 0);
  assert.equal(r.bloqueado, true, 'nao deveria virar "nenhum resultado" silencioso');
  return r.diagnostico;
});

teste('busca sem correspondencia NAO e reportada como bloqueio nem falta de rede', async () => {
  instalarFetch({ 'solr.sscdn.co': () => resOk(INDICE_VAZIO) });

  const r = await buscarLetrasNaWeb(buscaPadrao({ q: 'zzzzznaoexiste' }));

  assert.equal(r.resultados.length, 0);
  assert.equal(r.bloqueado, false);
  assert.equal(r.semRede, false);
  return 'classificado como "nenhum resultado"';
});

teste('falha real de rede no indice SIM e reportada como sem Internet', async () => {
  instalarFetch({
    'solr.sscdn.co': () => {
      throw new Error('Network request failed');
    },
  });

  const r = await buscarLetrasNaWeb(buscaPadrao());

  assert.equal(r.semRede, true);
  return r.diagnostico;
});

teste('REGRESSAO — timeout do controlador nao pode virar "sem resposta da Internet"', async () => {
  // O IP da LAN é inalcançável por definição em dados móveis: o timeout dele é
  // esperado e não diz nada sobre a Internet do aparelho.
  instalarFetch({ '192.168.1.10': pendurado, 'solr.sscdn.co': () => resOk(INDICE_VAZIO) });

  const r = await buscarLetrasNaWeb(buscaPadrao({ hostControlador: HOST_LAN }));

  assert.equal(r.resultados.length, 0);
  assert.equal(r.semRede, false, 'o hop da LAN nao deve gerar erro de Internet');
  assert.equal(r.bloqueado, false);
  return 'classificado como "nenhum resultado"';
});

teste('timeout do hop do indice dispara e nao pendura para sempre', async () => {
  instalarFetch({ 'solr.sscdn.co': pendurado });

  const t0 = Date.now();
  const r = await buscarLetrasNaWeb(buscaPadrao());
  const ms = Date.now() - t0;

  assert.equal(r.resultados.length, 0);
  assert.equal(r.semRede, true);
  assert.ok(ms >= 14500 && ms < 17000, `deveria abortar perto de 15s, levou ${ms}ms`);
  return `abortou em ${ms}ms`;
});

// ============================================================ previa / importacao

teste('previa — controlador pendurado nao atrasa a extracao direta', async () => {
  instalarFetch({ '192.168.1.10': pendurado, 'cifraclub.com.br': () => resOk(CIFRA_PAGINA) });

  const t0 = Date.now();
  const r = await extrairLetraParaPreviewOuImport('/hillsong-united/oceans/', {
    hostControlador: HOST_LAN,
    fonte: 'cifraclub',
  });
  const ms = Date.now() - t0;

  assert.ok(!r.erro, `nao deveria dar erro: ${r.erro}`);
  assert.ok(r.estrofes.length > 0);
  assert.equal(r.via, 'web');
  assert.ok(ms < 2000, `levou ${ms}ms`);
  return `${ms}ms, ${r.estrofes.length} slide(s)`;
});

teste('previa — CifraClub 403 no celular, controlador entrega a letra', async () => {
  instalarFetch({
    '192.168.1.10': () =>
      resJson(
        {
          titulo: 'Oceans',
          artista: 'Hillsong United',
          estrofes: ['Linha um', 'Linha dois'],
          path: '/hillsong-united/oceans/',
        },
        200
      ),
    'cifraclub.com.br': () => resStatus(403),
    'letras.mus.br': () => resStatus(403),
  });

  const r = await extrairLetraParaPreviewOuImport('/hillsong-united/oceans/', {
    hostControlador: HOST_LAN,
    fonte: 'cifraclub',
  });

  assert.ok(!r.erro, `nao deveria dar erro: ${r.erro}`);
  assert.equal(r.via, 'controlador');
  return `via=${r.via}, titulo=${r.titulo}`;
});

teste('previa — tudo bloqueado produz mensagem de bloqueio, nao generica', async () => {
  instalarFetch({
    'cifraclub.com.br': () => resStatus(403),
    'letras.mus.br': () => resStatus(403),
  });

  const r = await extrairLetraParaPreviewOuImport('/hillsong-united/oceans/', { fonte: 'cifraclub' });

  assert.ok(r.erro);
  assert.match(r.erro, /403/);
  return r.erro.slice(0, 60);
});

teste('REGRESSAO — previa: timeout do controlador nao vira erro de Internet', async () => {
  instalarFetch({
    '192.168.1.10': pendurado,
    'cifraclub.com.br': () => resOk(PAGINA_SEM_LETRA),
    'letras.mus.br': () => resOk(PAGINA_SEM_LETRA),
  });

  const r = await extrairLetraParaPreviewOuImport('/hillsong-united/oceans/', {
    hostControlador: HOST_LAN,
    fonte: 'cifraclub',
  });

  assert.ok(r.erro);
  assert.doesNotMatch(r.erro, /Sem resposta da Internet/, `mensagem enganosa: ${r.erro}`);
  return r.erro.slice(0, 60);
});

teste('previa — fonte letras-mus-br extrai da og:description', async () => {
  const pagina = `<html><head>${'<!-- pad -->'.repeat(30)}
<meta property="og:description" content="Verso um / Verso dois / Verso tres">
</head><body><p>x</p></body></html>`;
  instalarFetch({ 'letras.mus.br': () => resOk(pagina) });

  const r = await extrairLetraParaPreviewOuImport('/hillsong-united/oceans/', {
    fonte: 'letras-mus-br',
  });

  assert.ok(!r.erro, `nao deveria dar erro: ${r.erro}`);
  assert.ok(r.estrofes.length > 0);
  return `${r.estrofes.length} slide(s)`;
});

// ============================================================ runner

let falhas = 0;
for (const [nome, fn] of testes) {
  try {
    const detalhe = await fn();
    console.log(`  OK   ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
  } catch (e) {
    falhas += 1;
    console.log(`  FALHA ${nome}\n        ${e.message}`);
  }
}
console.log(`\n${testes.length - falhas}/${testes.length} passaram`);
process.exit(falhas ? 1 : 0);
