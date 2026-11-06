'use strict';

/**
 * E1.3 Fase B — política dos proxies 5510 → 3001.
 *
 * Os proxies existem para as telas e leitores que só alcançam a 5510: ler músicas, Bíblia e
 * mídia da apresentação do controlador. NUNCA para escrever. Uma escrita encaminhada chega à
 * 3001 vinda da própria máquina (o servidor), e a guarda "só da própria máquina" da 3001 a
 * aceita — o que dava a qualquer aparelho da rede o poder de importar mídia, apagar música…
 *
 * Regra: só GET e HEAD, só nos caminhos que realmente precisam de proxy, com o caminho
 * validado (sem `..`, `//`, `%2e`, `%2f`, `%5c`, `%00`) e com os cabeçalhos filtrados.
 */

const test = require('node:test');
const assert = require('node:assert');
const {
  pertenceAFamilia,
  avaliarRequisicaoProxy,
  cabecalhosParaControlador,
  FAMILIAS,
} = require('./politicaProxyControlador');

const req = (method, originalUrl) => ({ method, originalUrl });

test('as três famílias de proxy', () => {
  assert.deepStrictEqual([...FAMILIAS].sort(), ['apresentacao', 'biblia', 'musicas']);
});

/* ───────────────────────── a quem o proxy se aplica ───────────────────────── */

test('pertenceAFamilia: prefixo com fronteira de segmento (nada de /api/musicasXYZ)', () => {
  for (const u of ['/api/musicas', '/api/musicas/1', '/api/musicas?x=1', '/api/musicas/1/versoes?fonte=catalog']) {
    assert.strictEqual(pertenceAFamilia(u, 'musicas'), true, u);
  }
  for (const u of ['/api/musicasX', '/api/musica', '/api/musicas-extra/1', '/api', '/API/musicas', '/x/api/musicas']) {
    assert.strictEqual(pertenceAFamilia(u, 'musicas'), false, u);
  }
  assert.strictEqual(pertenceAFamilia('/api/biblia/traducoes', 'biblia'), true);
  assert.strictEqual(pertenceAFamilia('/api/bibliaX', 'biblia'), false);
  for (const u of ['/api/apresentacao/video/a', '/api/apresentacao/midia/a', '/api/apresentacao/midia/importar', '/api/apresentacao/video']) {
    assert.strictEqual(pertenceAFamilia(u, 'apresentacao'), true, u);
  }
  for (const u of ['/api/apresentacao/state', '/api/apresentacao/videoX/a', '/api/apresentacao']) {
    assert.strictEqual(pertenceAFamilia(u, 'apresentacao'), false, u);
  }
});

/* ───────────────────────────── métodos ───────────────────────────── */

test('GET e HEAD são encaminhados', () => {
  for (const m of ['GET', 'HEAD', 'get']) {
    const r = avaliarRequisicaoProxy(req(m, '/api/musicas/12?fonte=catalog'), 'musicas');
    assert.strictEqual(r.ok, true, m);
    assert.strictEqual(r.caminho, '/api/musicas/12?fonte=catalog');
  }
});

test('qualquer outro método é recusado com 405 e Allow: GET, HEAD', () => {
  for (const familia of ['musicas', 'biblia', 'apresentacao']) {
    const url = familia === 'apresentacao' ? '/api/apresentacao/midia/abc' : `/api/${familia}/1`;
    for (const m of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'TRACE', 'CONNECT', 'PROPFIND', 'MKCOL', 'post', 'Put', '', undefined]) {
      const r = avaliarRequisicaoProxy(req(m, url), familia);
      assert.strictEqual(r.ok, false, `${familia} ${m}`);
      assert.strictEqual(r.status, 405, `${familia} ${m}`);
      assert.strictEqual(r.allow, 'GET, HEAD');
    }
  }
});

/* ───────────────────────────── caminhos ───────────────────────────── */

const CAMINHOS_MALFORMADOS = [
  '/api/musicas/../apresentacao/midia/importar',
  '/api/musicas/./1',
  '/api/musicas//1',
  '//api/musicas/1',
  '/api/musicas/%2e%2e/x',
  '/api/musicas/%2E%2E/x',
  '/api/musicas/%2e/x',
  '/api/musicas%2f..%2fx',
  '/api/musicas/..%2fapresentacao%2fmidia%2fimportar',
  '/api/musicas/%2F1',
  '/api/musicas/1%5cx',
  '/api/musicas/1%5Cx',
  '/api/musicas/1\\x',
  '/api/musicas/1%00',
  '/api/musicas/1\u0000x',
  '/api/musicas/1\r\nX-Injetado: 1',
  '/api/musicas/1%zz',
  '/api/musicas/1%',
  `/api/musicas/${'a'.repeat(3000)}`,
];

test('caminho com ponto-ponto, barras duplas, %2e/%2f/%5c/%00, controle ou excessivamente longo → 400', () => {
  for (const u of CAMINHOS_MALFORMADOS) {
    const r = avaliarRequisicaoProxy(req('GET', u), 'musicas');
    assert.strictEqual(r.ok, false, JSON.stringify(u.slice(0, 60)));
    assert.strictEqual(r.status, 400, JSON.stringify(u.slice(0, 60)));
  }
});

test('a query string pode ter qualquer texto: nunca decide o roteamento', () => {
  for (const q of ['?/../apresentacao/midia/importar', '?x=%2e%2e%2f', '?_method=POST', '?a=b&c=/api/docs/converter-pdf']) {
    const r = avaliarRequisicaoProxy(req('GET', `/api/musicas/1${q}`), 'musicas');
    assert.strictEqual(r.ok, true, q);
    assert.strictEqual(r.caminho, `/api/musicas/1${q}`);
  }
});

test('Bíblia: livros com acento (percent-encoding legítimo) continuam passando', () => {
  const r = avaliarRequisicaoProxy(req('GET', '/api/biblia/ARC/G%C3%AAnesis/1'), 'biblia');
  assert.strictEqual(r.ok, true);
});

test('apresentação: só GET/HEAD de /video|midia/<id>; a importação NUNCA é encaminhada', () => {
  for (const u of ['/api/apresentacao/midia/abc-123', '/api/apresentacao/video/12.mp4', '/api/apresentacao/video/a%20b', '/api/apresentacao/midia/ap_1730000000000']) {
    assert.strictEqual(avaliarRequisicaoProxy(req('GET', u), 'apresentacao').ok, true, u);
  }
  for (const u of [
    '/api/apresentacao/video',
    '/api/apresentacao/midia/',
    '/api/apresentacao/midia/importar',
    '/api/apresentacao/midia/IMPORTAR',
    '/api/apresentacao/midia/importar?x=1',
    '/api/apresentacao/midia/%69mportar',
    '/api/apresentacao/midia/%49mportar',
    '/api/apresentacao/midia/a/b',
    '/api/apresentacao/video/importar',
  ]) {
    const r = avaliarRequisicaoProxy(req('GET', u), 'apresentacao');
    assert.strictEqual(r.ok, false, u);
    assert.ok([400, 404].includes(r.status), `${u} → ${r.status}`);
  }
  const post = avaliarRequisicaoProxy(req('POST', '/api/apresentacao/midia/importar'), 'apresentacao');
  assert.strictEqual(post.ok, false);
  assert.strictEqual(post.status, 405);
});

/* ───────────────────────────── cabeçalhos ───────────────────────────── */

test('cabeçalhos: só o necessário para ler (e para mídia) segue ao controlador', () => {
  const entrada = {
    host: '192.168.1.10:5510',
    accept: 'video/*',
    'accept-language': 'pt-BR',
    'accept-encoding': 'identity',
    range: 'bytes=0-99',
    'if-range': '"abc"',
    'if-none-match': '"abc"',
    'if-modified-since': 'Wed, 21 Oct 2026 07:28:00 GMT',
    'user-agent': 'Lyra/1',
    'cache-control': 'no-cache',
    'x-lyra-device': 'dev-1',
    'x-lyra-secret': 'seg-1',
    'x-lyra-app': '1.0.0',
    // não devem ir:
    origin: 'http://192.168.1.10:5001',
    referer: 'http://192.168.1.10:5001/obs',
    cookie: 'a=b',
    authorization: 'Bearer x',
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'cors',
    'x-forwarded-for': '1.2.3.4',
    'x-forwarded-host': 'evil.example',
    forwarded: 'for=1.2.3.4',
    'x-real-ip': '1.2.3.4',
    'x-lyra-proxy': '0',
    connection: 'keep-alive, X-Segredo',
    'transfer-encoding': 'chunked',
    'content-length': '5',
    'content-type': 'application/json',
    expect: '100-continue',
    upgrade: 'websocket',
    te: 'trailers',
    'proxy-authorization': 'x',
  };
  const saida = cabecalhosParaControlador(entrada, '127.0.0.1:3001');
  assert.strictEqual(saida.host, '127.0.0.1:3001');
  assert.strictEqual(saida['x-lyra-proxy'], '1', 'a marca é sempre do proxy, nunca do cliente');
  for (const k of ['accept', 'accept-language', 'accept-encoding', 'range', 'if-range', 'if-none-match', 'if-modified-since', 'user-agent', 'cache-control', 'x-lyra-device', 'x-lyra-secret', 'x-lyra-app']) {
    assert.strictEqual(saida[k], entrada[k], k);
  }
  for (const k of ['origin', 'referer', 'cookie', 'authorization', 'sec-fetch-site', 'sec-fetch-mode', 'x-forwarded-for', 'x-forwarded-host', 'forwarded', 'x-real-ip', 'connection', 'transfer-encoding', 'content-length', 'content-type', 'expect', 'upgrade', 'te', 'proxy-authorization']) {
    assert.strictEqual(saida[k], undefined, `${k} não pode ser encaminhado`);
  }
});

test('cabeçalhos repetidos (array) não passam como array e valores com quebra de linha são descartados', () => {
  const saida = cabecalhosParaControlador(
    { range: ['bytes=0-1', 'bytes=2-3'], accept: 'a\r\nX-Injetado: 1', 'user-agent': 'ok' },
    '127.0.0.1:3001'
  );
  assert.strictEqual(saida.range, 'bytes=0-1');
  assert.strictEqual(saida.accept, undefined);
  assert.strictEqual(saida['user-agent'], 'ok');
});
