'use strict';

/**
 * E1.3 Fase B — bloqueio REAL das rotas críticas (Express real + allowlist real + E1.2).
 *
 * Cada rota crítica tem um handler que incrementa um contador. Provar o bloqueio é provar que
 * o contador NÃO andou — não que um middleware foi chamado. A mesma matriz roda em `impor`
 * (tudo recusado exceto dispositivo autorizado) e em `registrar` (o modo de produção: nada é
 * recusado, mas tudo é identificado).
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { acessoRede, controleAcesso, autenticacaoHttp } = require('@lyra/projection-core');

const SEG_OK = 'SEGREDO-AUTORIZADO-NAO-VAZAR-1';
const SEG_PEND = 'SEGREDO-PENDENTE-NAO-VAZAR-2';
const SEG_ERRADO = 'SEGREDO-ERRADO-NAO-VAZAR-3';

const ROTAS_CRITICAS = [
  ['POST', '/api/sync/banco/local'],
  ['POST', '/api/sync/banco'],
  ['POST', '/api/sync/banco/pedido'],
  ['POST', '/api/comando/audio_play'],
  ['POST', '/api/comando/slide'],
  ['PUT', '/api/display-config'],
  ['PUT', '/api/display-routing'],
  ['POST', '/api/open-server-devtools'],
  ['DELETE', '/api/musicas/1'],
  ['POST', '/api/playlists'],
];

function requisitar(porta, { method = 'GET', caminho = '/', headers = {}, corpo } = {}) {
  return new Promise((resolve, reject) => {
    const dados = corpo === undefined ? null : Buffer.from(JSON.stringify(corpo));
    const req = http.request(
      {
        host: '127.0.0.1', port: porta, method, path: caminho,
        headers: { ...(dados ? { 'content-type': 'application/json', 'content-length': dados.length } : {}), ...headers },
      },
      (res) => {
        const partes = [];
        res.on('data', (c) => partes.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, texto: Buffer.concat(partes).toString('utf8') }));
      }
    );
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

async function comPilha({ modo }, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-faseb-'));
  const allowlistPath = () => path.join(dir, 'allow.json');
  const acesso = controleAcesso.criarControleAcesso({ opcoes: { inscricaoAutomatica: true }, allowlistPath, emitParaSocket: () => {}, broadcast: () => {}, notificar: () => {} });
  // TOFU só pelo handshake do socket: aqui o teste faz o papel dele.
  assert.strictEqual(acesso.autenticar({ deviceId: 'dev-ok-0001', secret: SEG_OK }).ok, true);
  acesso.travar();
  assert.strictEqual(acesso.autenticar({ deviceId: 'dev-pend-0002', secret: SEG_PEND }).ok, false);
  const antes = fs.readFileSync(allowlistPath(), 'utf8');

  const eventos = [];
  const exec = [];
  const protecao = acessoRede.criarProtecaoRede({ env: {}, hostnameMaquina: 'pc', enderecosMaquina: ['127.0.0.1'] });
  const auth = autenticacaoHttp.criarAutenticacaoHttp({
    modo,
    contexto: 'servidor-5510',
    verificar: (a) => acesso.verificarCredencial(a),
    registrar: (e) => eventos.push(JSON.stringify(e)),
  });
  const app = express();
  app.use(protecao.middleware);
  app.use(auth.middleware);
  app.use(express.json());
  const roda = (nome) => (_q, res) => { exec.push(nome); res.json({ ok: true }); };
  app.post('/api/comando/:acao', roda('comando'));
  for (const [m, p] of ROTAS_CRITICAS.filter(([, p]) => !p.startsWith('/api/comando/'))) {
    app[m.toLowerCase()](p.replace(/\/\d+$/, '/:id'), roda(`${m} ${p}`));
  }
  app.post('/api/tom-memoria/webhook-invb', roda('webhook'));
  app.post('/api/apresentacao/midia/importar', roda('importar'));
  app.get('/api/musicas', roda('GET /api/musicas'));
  app.get('/api/identity', roda('identity'));
  app.get('/api/apresentacao/midia/:id', roda('midia'));

  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    await fn({ porta: srv.address().port, exec, eventos, depois: () => fs.readFileSync(allowlistPath(), 'utf8'), antes });
  } finally {
    await new Promise((r) => srv.close(r));
  }
}

const cred = (id, s) => ({ 'X-Lyra-Device': id, 'X-Lyra-Secret': s });

const CASOS_NEGADOS = [
  ['sem credencial', {}, 401],
  ['só o deviceId', { 'X-Lyra-Device': 'dev-ok-0001' }, 401],
  ['secret inválido', cred('dev-ok-0001', SEG_ERRADO), 401],
  ['dispositivo desconhecido', cred('dev-ninguem-9', SEG_OK), 401],
  ['dispositivo pendente', cred('dev-pend-0002', SEG_PEND), 403],
];

test('impor: TODA rota crítica recusa sem credencial / inválida / desconhecida / pendente e o handler NÃO executa', async () => {
  await comPilha({ modo: 'impor' }, async ({ porta, exec, eventos }) => {
    for (const [m, p] of ROTAS_CRITICAS) {
      for (const [nome, headers, esperado] of CASOS_NEGADOS) {
        const r = await requisitar(porta, { method: m, caminho: p, headers, corpo: { x: 1 } });
        assert.strictEqual(r.status, esperado, `${m} ${p} — ${nome}`);
        assert.doesNotMatch(r.texto, /NAO-VAZAR/);
      }
    }
    assert.deepStrictEqual(exec, [], 'nenhum handler crítico pode ter executado');
    assert.ok(!eventos.join('\n').match(/NAO-VAZAR/), 'registro sem segredo');
  });
});

test('impor: dispositivo AUTORIZADO executa todas as rotas críticas', async () => {
  await comPilha({ modo: 'impor' }, async ({ porta, exec }) => {
    for (const [m, p] of ROTAS_CRITICAS) {
      const r = await requisitar(porta, { method: m, caminho: p, headers: cred('dev-ok-0001', SEG_OK), corpo: { x: 1 } });
      assert.strictEqual(r.status, 200, `${m} ${p}`);
    }
    assert.strictEqual(exec.length, ROTAS_CRITICAS.length);
  });
});

test('impor: tentativas de contornar a classificação (caixa, //, ./, query, barra final) continuam bloqueadas', async () => {
  await comPilha({ modo: 'impor' }, async ({ porta, exec }) => {
    const variacoes = [
      ['POST', '/API/COMANDO/audio_play'],
      ['POST', '/api/comando/audio_play/'],
      ['POST', '/api/comando/audio_play?x=/api/identity'],
      ['POST', '/api//comando/audio_play'],
      ['POST', '/api/./comando/audio_play'],
      ['POST', '/api/comando/../comando/audio_play'],
      ['POST', '/api/%63omando/audio_play'],
      ['POST', '//api/comando/audio_play'],
      ['POST', '/API/SYNC/BANCO/LOCAL'],
      ['POST', '/api/sync/banco/local/'],
      ['POST', '/api/sync/banco/local?a=b'],
      ['POST', '/api/sync//banco/local'],
      ['POST', '/api/sync/banco/../banco/local'],
      ['PUT', '/api/display-config?x=%2Fapi%2Fidentity'],
    ];
    for (const [m, p] of variacoes) {
      const r = await requisitar(porta, { method: m, caminho: p, corpo: {} });
      assert.notStrictEqual(r.status, 200, `${m} ${p}`);
    }
    assert.deepStrictEqual(exec, [], 'nada executou sem credencial');
  });
});

test('impor: método diferente não rebaixa a rota (DELETE/PATCH/POST em caminho de escrita sem credencial = 401)', async () => {
  await comPilha({ modo: 'impor' }, async ({ porta, exec }) => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const r = await requisitar(porta, { method, caminho: '/api/comando/audio_play', corpo: {} });
      assert.strictEqual(r.status, 401, method);
    }
    assert.deepStrictEqual(exec, []);
  });
});

test('impor: loopback-estrito proxificada (mídia importar com x-lyra-proxy) é recusada e o handler não executa', async () => {
  await comPilha({ modo: 'impor' }, async ({ porta, exec }) => {
    const proxificada = await requisitar(porta, {
      method: 'POST', caminho: '/api/apresentacao/midia/importar',
      headers: { 'X-Lyra-Proxy': '1', ...cred('dev-ok-0001', SEG_OK) }, corpo: { id: 'x' },
    });
    assert.strictEqual(proxificada.status, 403);
    assert.deepStrictEqual(exec, []);
    const direta = await requisitar(porta, { method: 'POST', caminho: '/api/apresentacao/midia/importar', corpo: { id: 'x' } });
    assert.strictEqual(direta.status, 200, 'direta da própria máquina segue: a guarda da rota decide');
    assert.deepStrictEqual(exec, ['importar']);
  });
});

test('impor: rotas públicas continuam públicas (identity, mídia GET, webhook com segredo próprio)', async () => {
  await comPilha({ modo: 'impor' }, async ({ porta, exec }) => {
    assert.strictEqual((await requisitar(porta, { caminho: '/api/identity' })).status, 200);
    assert.strictEqual((await requisitar(porta, { caminho: '/api/apresentacao/midia/abc' })).status, 200);
    assert.strictEqual((await requisitar(porta, { method: 'POST', caminho: '/api/tom-memoria/webhook-invb', corpo: { a: 1 } })).status, 200);
    assert.deepStrictEqual(exec, ['identity', 'midia', 'webhook']);
    const leitura = await requisitar(porta, { caminho: '/api/musicas' });
    assert.strictEqual(leitura.status, 401, 'leitura de dados exige credencial em `impor`');
  });
});

test('registrar (produção): NADA é bloqueado — todas as rotas executam — mas as recusas futuras ficam registradas', async () => {
  await comPilha({ modo: 'registrar' }, async ({ porta, exec, eventos }) => {
    let total = 0;
    for (const [m, p] of ROTAS_CRITICAS) {
      for (const [nome, headers] of CASOS_NEGADOS) {
        const r = await requisitar(porta, { method: m, caminho: p, headers, corpo: { x: 1 } });
        assert.strictEqual(r.status, 200, `${m} ${p} — ${nome} deve seguir em registrar`);
        total += 1;
      }
    }
    assert.strictEqual(exec.length, total);
    assert.ok(eventos.length >= ROTAS_CRITICAS.length, 'tentativas registradas');
    assert.ok(!eventos.join('\n').match(/NAO-VAZAR/), 'registro sem segredo');
  });
});

test('nenhuma requisição HTTP altera a allowlist (sem TOFU/cadastro por HTTP), em impor e registrar', async () => {
  for (const modo of ['impor', 'registrar']) {
    await comPilha({ modo }, async ({ porta, antes, depois }) => {
      for (const [m, p] of ROTAS_CRITICAS) {
        await requisitar(porta, { method: m, caminho: p, headers: cred('dev-novo-7777', 'SEGREDO-NOVO'), corpo: {} });
        await requisitar(porta, { method: m, caminho: p, headers: cred('dev-pend-0002', SEG_PEND), corpo: {} });
      }
      assert.strictEqual(depois(), antes, `allowlist intacta em ${modo}`);
    });
  }
});

test('E1.2 convive: Host de rebinding e Origin externa seguem recusados antes da autenticação (mesmo com credencial válida)', async () => {
  await comPilha({ modo: 'impor' }, async ({ porta, exec }) => {
    const h = { ...cred('dev-ok-0001', SEG_OK) };
    const a = await requisitar(porta, { method: 'POST', caminho: '/api/comando/audio_play', headers: { ...h, Host: 'rebind.attacker.com' }, corpo: {} });
    assert.strictEqual(a.status, 403);
    const b = await requisitar(porta, { method: 'POST', caminho: '/api/comando/audio_play', headers: { ...h, Origin: 'https://evil.example' }, corpo: {} });
    assert.strictEqual(b.status, 403);
    assert.deepStrictEqual(exec, []);
  });
});
