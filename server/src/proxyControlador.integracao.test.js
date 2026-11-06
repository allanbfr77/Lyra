'use strict';

/**
 * E1.3 Fase B — os proxies 5510 → 3001 na prática.
 *
 * Um "controlador" falso (a 3001) registra TUDO o que recebe. Os proxies reais ficam atrás
 * das proteções reais (E1.2 Host/Origin e E1.3 autenticação). O que se prova aqui:
 *   - escritas e a importação de mídia NÃO chegam ao controlador (em nenhum modo);
 *   - leitura (GET/HEAD), Range, If-Range e streaming de mídia continuam funcionando;
 *   - aborto do cliente fecha a conexão com o controlador;
 *   - cabeçalhos do navegador não atravessam; a credencial do dispositivo sim;
 *   - as proteções E1.1/E1.2 não foram enfraquecidas.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { acessoRede, autenticacaoHttp, controleAcesso } = require('@lyra/projection-core');

/* ─────────────────────── controlador falso (a 3001) ─────────────────────── */

const TAMANHO_MIDIA = 5 * 1024 * 1024;
const MIDIA = Buffer.alloc(TAMANHO_MIDIA);
for (let i = 0; i < MIDIA.length; i += 1) MIDIA[i] = (i * 31 + 7) % 251;
const ETAG = '"midia-v1"';

const hits = [];
let upstreamFechou = false;

function lerRange(cab, total) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(cab || ''));
  if (!m) return null;
  let ini = m[1] === '' ? null : Number(m[1]);
  let fim = m[2] === '' ? null : Number(m[2]);
  if (ini === null && fim === null) return null;
  if (ini === null) {
    ini = Math.max(0, total - fim);
    fim = total - 1;
  } else if (fim === null || fim >= total) {
    fim = total - 1;
  }
  return ini <= fim && ini < total ? [ini, fim] : null;
}

function criarControladorFalso() {
  const srv = http.createServer((req, res) => {
    hits.push({ method: req.method, url: req.url, headers: { ...req.headers } });
    const caminho = req.url.split('?')[0];

    if (caminho === '/api/apresentacao/midia/lento') {
      upstreamFechou = false;
      res.on('close', () => {
        upstreamFechou = true;
      });
      res.writeHead(200, { 'Content-Type': 'video/mp4' });
      const timer = setInterval(() => {
        if (res.destroyed || res.writableEnded) return clearInterval(timer);
        res.write(Buffer.alloc(8192, 1));
        return undefined;
      }, 10);
      res.on('close', () => clearInterval(timer));
      return undefined;
    }

    if (caminho === '/api/apresentacao/midia/grande') {
      const comum = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', ETag: ETAG };
      const ifRange = req.headers['if-range'];
      const range = !ifRange || ifRange === ETAG ? lerRange(req.headers.range, TAMANHO_MIDIA) : null;
      if (range) {
        const [ini, fim] = range;
        res.writeHead(206, {
          ...comum,
          'Content-Range': `bytes ${ini}-${fim}/${TAMANHO_MIDIA}`,
          'Content-Length': fim - ini + 1,
        });
        if (req.method === 'HEAD') return res.end();
        return res.end(MIDIA.subarray(ini, fim + 1));
      }
      res.writeHead(200, { ...comum, 'Content-Length': TAMANHO_MIDIA });
      if (req.method === 'HEAD') return res.end();
      return res.end(MIDIA);
    }

    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true, metodo: req.method, url: req.url }));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

/* ─────────────────────────── ambiente do teste ─────────────────────────── */

let controlador;
let attachProxyMusica;
let attachProxyBiblia;
let attachProxyApresentacao;

test.before(async () => {
  controlador = await criarControladorFalso();
  /* Os proxies leem host e porta do controlador no `require`: o env vem ANTES. */
  process.env.CONTROLLER_HTTP_HOST = '127.0.0.1';
  process.env.CONTROLLER_HTTP_PORT = String(controlador.address().port);
  ({ attachProxyMusicaAoControlador: attachProxyMusica } = require('./lib/proxyMusicaAoControlador'));
  ({ attachProxyBibliaAoControlador: attachProxyBiblia } = require('./lib/proxyBibliaAoControlador'));
  ({ attachProxyApresentacaoVideoAoControlador: attachProxyApresentacao } = require('./lib/proxyApresentacaoVideoAoControlador'));
});

test.after(async () => {
  await new Promise((r) => controlador.close(r));
});

test.beforeEach(() => {
  hits.length = 0;
});

function novoControleAcesso() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-proxy-'));
  return controleAcesso.criarControleAcesso({
    allowlistPath: () => path.join(dir, 'allow.json'),
    emitParaSocket: () => {},
    broadcast: () => {},
    notificar: () => {},
  });
}

/**
 * Monta o 5510 de teste: E1.2 → (E1.3 opcional) → proxies reais → 404, como no servidor.
 * @param {{ modo?: 'registrar'|'impor'|'desligado', acesso?: object }} [opcoes]
 */
async function comProxies(opcoes, fn) {
  const { modo = 'registrar', acesso = novoControleAcesso() } = opcoes || {};
  const protecao = acessoRede.criarProtecaoRede({ env: {}, hostnameMaquina: 'pc', enderecosMaquina: ['127.0.0.1'] });
  const auth = autenticacaoHttp.criarAutenticacaoHttp({
    modo,
    contexto: 'servidor-5510',
    verificar: (a) => acesso.verificarCredencial(a),
  });
  const app = express();
  app.use(protecao.middleware);
  app.use(auth.middleware);
  const erros = [];
  const logError = (ctx, e) => erros.push([ctx, String(e && e.message)]);
  attachProxyMusica(app, logError);
  attachProxyBiblia(app, logError);
  attachProxyApresentacao(app, logError, () => '127.0.0.1');
  app.use((_req, res) => res.status(404).json({ ok: false, erro: 'sem rota na 5510' }));
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    await fn({ porta: srv.address().port, acesso, erros });
  } finally {
    srv.closeAllConnections?.();
    await new Promise((r) => srv.close(r));
  }
}

function requisitar(porta, { method = 'GET', caminho = '/', headers = {}, corpo } = {}) {
  return new Promise((resolve, reject) => {
    const dados = corpo === undefined ? null : Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
    const req = http.request(
      {
        host: '127.0.0.1',
        port: porta,
        method,
        path: caminho,
        headers: { ...(dados ? { 'content-length': dados.length } : {}), ...headers },
      },
      (res) => {
        const partes = [];
        res.on('data', (c) => partes.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes) }));
      }
    );
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

const PROXIADOS_LEITURA = [
  '/api/musicas',
  '/api/musicas/12',
  '/api/musicas/buscar?q=galileu&titulo=1',
  '/api/biblia/traducoes',
  '/api/biblia/ARC/G%C3%AAnesis/1',
  '/api/apresentacao/midia/abc',
  '/api/apresentacao/video/abc',
];

/* ───────────────────── escrita NÃO atravessa o proxy ───────────────────── */

test('escrita (POST/PUT/DELETE/PATCH e métodos exóticos) em qualquer família: 405 e o controlador NÃO recebe nada', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    const alvos = ['/api/musicas/1', '/api/musicas', '/api/biblia/ARC/Genesis/1', '/api/apresentacao/video/abc', '/api/apresentacao/midia/abc'];
    for (const caminho of alvos) {
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
        const r = await requisitar(porta, { method, caminho, headers: { 'content-type': 'application/json' }, corpo: { x: 'y'.repeat(2048) } });
        assert.strictEqual(r.status, 405, `${method} ${caminho}`);
        assert.match(String(r.headers.allow), /GET, HEAD/);
      }
      for (const method of ['PROPFIND', 'MKCOL', 'LOCK', 'PURGE']) {
        const r = await requisitar(porta, { method, caminho });
        assert.ok([400, 404, 405].includes(r.status), `${method} ${caminho} → ${r.status}`);
      }
    }
    assert.deepStrictEqual(hits, [], 'nada pode ter chegado ao controlador');
  });
});

test('a importação de mídia NUNCA é encaminhada (era a brecha: a 3001 a aceitava por vir da própria máquina)', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    const corpoImportar = { id: 'x', filePath: 'C:/Users/ALAN/Documents/segredo.mp3' };
    for (const method of ['POST', 'PUT', 'GET', 'HEAD', 'DELETE']) {
      const r = await requisitar(porta, {
        method,
        caminho: '/api/apresentacao/midia/importar',
        headers: { 'content-type': 'application/json' },
        corpo: method === 'GET' || method === 'HEAD' ? undefined : corpoImportar,
      });
      assert.ok([400, 404, 405].includes(r.status), `${method} → ${r.status}`);
    }
    assert.deepStrictEqual(hits, []);
  });
});

const VARIACOES_DE_CAMINHO = [
  '/api/apresentacao/midia/importar?x=1',
  '/api/apresentacao/midia/importar/',
  '/api/apresentacao/midia//importar',
  '/api/apresentacao/midia/./importar',
  '/api/apresentacao/midia/../midia/importar',
  '/api/apresentacao/video/../midia/importar',
  '/api/apresentacao/midia/%69mportar',
  '/api/apresentacao/midia/%49MPORTAR',
  '/api/apresentacao/midia/importar%00',
  '/api/apresentacao/midia/importar;x=1',
  '/api/apresentacao/midia/%2e%2e/midia/importar',
  '/api/apresentacao/midia/..%2fmidia%2fimportar',
  '/api/musicas/../apresentacao/midia/importar',
  '/api/musicas/..%2fapresentacao%2fmidia%2fimportar',
  '/api/musicas/%2e%2e/apresentacao/midia/importar',
  '/api/musicas%2f..%2fapresentacao%2fmidia%2fimportar',
  '/api/biblia/../docs/converter-pdf',
  '/api/biblia/..%2fdocs%2fconverter-pdf',
  '/api/musicas/..\\apresentacao\\midia\\importar',
  '//api/musicas/1',
  '/api//musicas/1',
  '/api/./musicas/1',
  '/API/APRESENTACAO/MIDIA/IMPORTAR',
  '/Api/Musicas/1',
  '/api/musicasx/1',
  '/api/apresentacao/midiax/importar',
];

test('variações de caminho (dot-segments, %2e/%2f, //, maiúsculas, ;, nulo) não furam: nenhuma chega ao controlador como escrita', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    for (const caminho of VARIACOES_DE_CAMINHO) {
      for (const method of ['POST', 'PUT', 'DELETE', 'GET']) {
        const r = await requisitar(porta, {
          method,
          caminho,
          headers: { 'content-type': 'application/json' },
          corpo: method === 'GET' ? undefined : { id: 'x', filePath: 'C:/x.mp3' },
        });
        assert.ok([400, 404, 405].includes(r.status), `${method} ${caminho} → ${r.status}`);
      }
    }
    /* Se alguma GET passou ao controlador, não pode ser de um caminho que ele trate como escrita. */
    for (const h of hits) {
      assert.strictEqual(h.method, 'GET');
      assert.ok(!/importar|converter-pdf|\.\./i.test(h.url.split('?')[0]), `GET suspeito chegou: ${h.url}`);
    }
  });
});

test('truques na query string e no método (override, _method) não transformam leitura em escrita', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    const truques = [
      { method: 'POST', caminho: '/api/musicas/1?_method=GET' },
      { method: 'POST', caminho: '/api/musicas/1', headers: { 'x-http-method-override': 'GET' } },
      { method: 'POST', caminho: '/api/musicas/1', headers: { 'x-method-override': 'GET', 'x-http-method': 'GET' } },
      { method: 'PUT', caminho: '/api/biblia/traducoes?method=GET' },
      { method: 'POST', caminho: '/api/apresentacao/midia/abc?/api/apresentacao/midia/importar' },
    ];
    for (const t of truques) {
      const r = await requisitar(porta, { ...t, corpo: '{"a":1}' });
      assert.strictEqual(r.status, 405, `${t.method} ${t.caminho}`);
    }
    assert.deepStrictEqual(hits, []);
    /* Já uma GET com texto estranho na query atravessa como GET, com a query intacta. */
    const get = await requisitar(porta, { caminho: '/api/musicas/1?/../apresentacao/midia/importar&_method=POST' });
    assert.strictEqual(get.status, 200);
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].method, 'GET');
    assert.strictEqual(hits[0].url, '/api/musicas/1?/../apresentacao/midia/importar&_method=POST');
  });
});

/* ───────────────────── leitura (GET/HEAD) continua funcionando ───────────────────── */

test('GET e HEAD autorizados continuam sendo encaminhados, com método e caminho preservados', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    for (const caminho of PROXIADOS_LEITURA) {
      const g = await requisitar(porta, { caminho });
      assert.strictEqual(g.status, 200, caminho);
      assert.strictEqual(JSON.parse(g.corpo.toString()).url, caminho);
      const h = await requisitar(porta, { method: 'HEAD', caminho });
      assert.strictEqual(h.status, 200, `HEAD ${caminho}`);
      assert.strictEqual(h.corpo.length, 0);
    }
    assert.strictEqual(hits.length, PROXIADOS_LEITURA.length * 2);
    assert.deepStrictEqual([...new Set(hits.map((h) => h.method))].sort(), ['GET', 'HEAD']);
  });
});

/* ───────────────────── mídia: Range, If-Range, streaming ───────────────────── */

test('mídia: GET completo atravessa íntegro (5 MiB, mesmo hash) com Accept-Ranges e ETag', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    const r = await requisitar(porta, { caminho: '/api/apresentacao/midia/grande' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.corpo.length, TAMANHO_MIDIA);
    assert.strictEqual(
      crypto.createHash('sha256').update(r.corpo).digest('hex'),
      crypto.createHash('sha256').update(MIDIA).digest('hex')
    );
    assert.strictEqual(r.headers['accept-ranges'], 'bytes');
    assert.strictEqual(r.headers.etag, ETAG);
    assert.strictEqual(r.headers['content-type'], 'video/mp4');
  });
});

test('mídia: Range devolve 206 com os bytes certos (início, meio, final e sufixo)', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    const casos = [
      ['bytes=0-99', 0, 99],
      ['bytes=1000000-1000999', 1000000, 1000999],
      [`bytes=${TAMANHO_MIDIA - 10}-`, TAMANHO_MIDIA - 10, TAMANHO_MIDIA - 1],
      ['bytes=-50', TAMANHO_MIDIA - 50, TAMANHO_MIDIA - 1],
    ];
    for (const [range, ini, fim] of casos) {
      for (const caminho of ['/api/apresentacao/midia/grande']) {
        const r = await requisitar(porta, { caminho, headers: { Range: range } });
        assert.strictEqual(r.status, 206, range);
        assert.strictEqual(r.headers['content-range'], `bytes ${ini}-${fim}/${TAMANHO_MIDIA}`);
        assert.ok(r.corpo.equals(MIDIA.subarray(ini, fim + 1)), `bytes de ${range}`);
      }
    }
    const head = await requisitar(porta, { method: 'HEAD', caminho: '/api/apresentacao/midia/grande', headers: { Range: 'bytes=0-9' } });
    assert.strictEqual(head.status, 206);
    assert.strictEqual(head.corpo.length, 0);
  });
});

test('mídia: If-Range é encaminhado — validador certo mantém o 206, errado devolve o arquivo inteiro (200)', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    const certo = await requisitar(porta, { caminho: '/api/apresentacao/midia/grande', headers: { Range: 'bytes=0-9', 'If-Range': ETAG } });
    assert.strictEqual(certo.status, 206);
    const errado = await requisitar(porta, { caminho: '/api/apresentacao/midia/grande', headers: { Range: 'bytes=0-9', 'If-Range': '"outro"' } });
    assert.strictEqual(errado.status, 200);
    assert.strictEqual(errado.corpo.length, TAMANHO_MIDIA);
    assert.strictEqual(hits[0].headers['if-range'], ETAG);
    assert.strictEqual(hits[0].headers.range, 'bytes=0-9');
  });
});

test('mídia: se o cliente abandona o streaming, a conexão com o controlador é encerrada', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: porta, path: '/api/apresentacao/midia/lento' }, (res) => {
        res.once('data', () => {
          res.destroy();
          req.destroy();
          resolve();
        });
      });
      req.on('error', () => {});
      req.setTimeout(5000, () => reject(new Error('sem dados do streaming')));
      req.end();
    });
    const limite = Date.now() + 4000;
    while (!upstreamFechou && Date.now() < limite) await new Promise((r) => setTimeout(r, 25));
    assert.strictEqual(upstreamFechou, true, 'o controlador continuou transmitindo para um cliente que já saiu');
  });
});

/* ───────────────────────────── cabeçalhos ───────────────────────────── */

test('cabeçalhos: o que é do navegador não atravessa; Range, validadores e credencial do dispositivo atravessam', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    await requisitar(porta, {
      caminho: '/api/musicas/1',
      headers: {
        Origin: 'http://127.0.0.1:5001',
        Referer: 'http://127.0.0.1:5001/obs',
        Cookie: 'sessao=1',
        Authorization: 'Bearer x',
        'X-Forwarded-For': '9.9.9.9',
        'X-Forwarded-Host': 'evil.example',
        'X-Real-IP': '9.9.9.9',
        'X-Lyra-Proxy': '0',
        'Sec-Fetch-Site': 'same-site',
        Range: 'bytes=0-9',
        'If-None-Match': '"e"',
        'X-Lyra-Device': 'dispositivo-1',
        'X-Lyra-Secret': 'segredo-1',
        'X-Lyra-App': '1.2.3',
        'User-Agent': 'LyraTeste/1',
      },
    });
    assert.strictEqual(hits.length, 1);
    const h = hits[0].headers;
    assert.strictEqual(h['x-lyra-proxy'], '1');
    assert.strictEqual(h.host, `127.0.0.1:${controlador.address().port}`);
    for (const k of ['origin', 'referer', 'cookie', 'authorization', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'sec-fetch-site']) {
      assert.strictEqual(h[k], undefined, `${k} não podia atravessar`);
    }
    assert.strictEqual(h.range, 'bytes=0-9');
    assert.strictEqual(h['if-none-match'], '"e"');
    assert.strictEqual(h['x-lyra-device'], 'dispositivo-1');
    assert.strictEqual(h['x-lyra-secret'], 'segredo-1');
    assert.strictEqual(h['x-lyra-app'], '1.2.3');
    assert.strictEqual(h['user-agent'], 'LyraTeste/1');
  });
});

/* ───────────────── convivência com a autenticação (E1.3) ───────────────── */

test('modo registrar (o de produção): leitura sem credencial continua passando pelo proxy', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    const r = await requisitar(porta, { caminho: '/api/musicas/1' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(hits.length, 1);
  });
});

test('modo impor: leitura sem credencial/inválida/desconhecida/pendente é barrada ANTES do proxy (controlador não recebe nada)', async () => {
  const acesso = novoControleAcesso();
  assert.strictEqual(acesso.autenticar({ deviceId: 'aprovado-1', secret: 'segredo-aprovado' }).ok, true); // TOFU no handshake
  acesso.travar();
  assert.strictEqual(acesso.autenticar({ deviceId: 'pendente-1', secret: 'segredo-pendente' }).ok, false);
  await comProxies({ modo: 'impor', acesso }, async ({ porta }) => {
    const casos = [
      ['sem credencial', {}, 401],
      ['secret inválido', { 'X-Lyra-Device': 'aprovado-1', 'X-Lyra-Secret': 'errado' }, 401],
      ['dispositivo desconhecido', { 'X-Lyra-Device': 'ninguem', 'X-Lyra-Secret': 'qualquer' }, 401],
      ['dispositivo pendente', { 'X-Lyra-Device': 'pendente-1', 'X-Lyra-Secret': 'segredo-pendente' }, 403],
    ];
    for (const [nome, headers, esperado] of casos) {
      for (const caminho of ['/api/musicas/1', '/api/biblia/traducoes']) {
        const r = await requisitar(porta, { caminho, headers });
        assert.strictEqual(r.status, esperado, `${nome} ${caminho}`);
      }
    }
    assert.deepStrictEqual(hits, [], 'nenhuma requisição não autorizada pode ter chegado ao controlador');
    const ok = await requisitar(porta, { caminho: '/api/musicas/1', headers: { 'X-Lyra-Device': 'aprovado-1', 'X-Lyra-Secret': 'segredo-aprovado' } });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(hits.length, 1);
  });
});

test('modo impor: dispositivo AUTORIZADO também não escreve pelo proxy (a regra de método independe de credencial)', async () => {
  const acesso = novoControleAcesso();
  assert.strictEqual(acesso.autenticar({ deviceId: 'aprovado-1', secret: 'segredo-aprovado' }).ok, true);
  await comProxies({ modo: 'impor', acesso }, async ({ porta }) => {
    const cred = { 'X-Lyra-Device': 'aprovado-1', 'X-Lyra-Secret': 'segredo-aprovado', 'content-type': 'application/json' };
    for (const [method, caminho] of [
      ['POST', '/api/apresentacao/midia/importar'],
      ['PUT', '/api/musicas/1'],
      ['DELETE', '/api/musicas/1'],
      ['POST', '/api/musicas/importar'],
    ]) {
      const r = await requisitar(porta, { method, caminho, headers: cred, corpo: { a: 1 } });
      assert.strictEqual(r.status, 405, `${method} ${caminho}`);
    }
    assert.deepStrictEqual(hits, []);
  });
});

test('modo impor: mídia pública (<video> não manda cabeçalhos) continua tocando pelo proxy, com Range', async () => {
  await comProxies({ modo: 'impor' }, async ({ porta }) => {
    const r = await requisitar(porta, { caminho: '/api/apresentacao/midia/grande', headers: { Range: 'bytes=0-1023' } });
    assert.strictEqual(r.status, 206);
    assert.strictEqual(r.corpo.length, 1024);
    const v = await requisitar(porta, { caminho: '/api/apresentacao/video/abc' });
    assert.strictEqual(v.status, 200);
  });
});

/* ───────────────────── E1.1 e E1.2 não foram enfraquecidas ───────────────────── */

test('E1.2: Host de DNS rebinding e Origin externa continuam recusados antes do proxy', async () => {
  await comProxies({ modo: 'registrar' }, async ({ porta }) => {
    for (const caminho of PROXIADOS_LEITURA) {
      const rebinding = await requisitar(porta, { caminho, headers: { Host: 'rebind.attacker.com' } });
      assert.strictEqual(rebinding.status, 403, caminho);
      const externa = await requisitar(porta, { caminho, headers: { Origin: 'https://evil.example' } });
      assert.strictEqual(externa.status, 403, caminho);
      const nula = await requisitar(porta, { caminho, headers: { Origin: 'null' } });
      assert.strictEqual(nula.status, 403, caminho);
    }
    assert.deepStrictEqual(hits, []);
  });
});
