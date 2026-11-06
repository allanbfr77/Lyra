'use strict';

/**
 * E1.3 Fase A — Express real + allowlist real (`controleAcesso`) + proteção de rede da E1.2.
 *
 * Prova, na prática, que o modo `registrar`:
 *  - identifica credencial ausente / inválida / pendente / desconhecida / revogada;
 *  - NÃO bloqueia nada (todas as requisições seguem e executam o handler);
 *  - NÃO toca na allowlist (nem inscreve, nem grava) — o arquivo fica byte a byte igual;
 *  - nunca registra o secret;
 *  - convive com a E1.2 (Host/Origin continuam recusando) e com o modo `desligado`.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { acessoRede, controleAcesso, autenticacaoHttp } = require('@lyra/projection-core');

const SEGREDO_VALIDO = 'SEGREDO-VALIDO-NAO-VAZAR-1111';
const SEGREDO_ERRADO = 'SEGREDO-ERRADO-NAO-VAZAR-2222';

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

/** Sobe um servidor com a pilha real: rede (E1.2) → autenticação HTTP → rotas. */
async function comPilha({ modo = 'registrar', modoAllowlist = null, preparar } = {}, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-auth-http-'));
  const allowlistPath = () => path.join(dir, 'allow.json');
  if (modoAllowlist) fs.writeFileSync(allowlistPath(), JSON.stringify({ modo: modoAllowlist, devices: {} }));
  const notificados = [];
  const acesso = controleAcesso.criarControleAcesso({ opcoes: { inscricaoAutomatica: true },
    allowlistPath,
    emitParaSocket: () => {},
    notificar: (evt) => notificados.push(evt),
  });
  if (preparar) preparar(acesso);

  const eventos = [];
  const logs = [];
  const execucoes = { total: 0 };
  const protecao = acessoRede.criarProtecaoRede({ env: {}, hostnameMaquina: 'pc-da-igreja', enderecosMaquina: ['192.168.1.10'] });
  const auth = autenticacaoHttp.criarAutenticacaoHttp({
    modo,
    contexto: 'servidor-5510',
    verificar: (a) => acesso.verificarCredencial(a),
    registrar: (e) => { eventos.push(e); logs.push(JSON.stringify(e)); },
  });

  const app = express();
  app.use(protecao.middleware);
  app.use(auth.middleware);
  app.use(express.json());
  const conta = (res) => { execucoes.total += 1; res.json({ ok: true }); };
  app.get('/api/identity', (_q, res) => conta(res));
  app.get('/api/musicas', (_q, res) => conta(res));
  app.put('/api/musicas/:id', (_q, res) => conta(res));
  app.post('/api/sync/banco/local', (_q, res) => conta(res));
  app.post('/api/comando/audio_play', (_q, res) => conta(res));
  app.put('/api/display-routing', (_q, res) => conta(res));

  const servidor = http.createServer(app);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  try {
    await fn({ porta: servidor.address().port, eventos, logs, execucoes, acesso, auth, allowlistPath, notificados });
  } finally {
    await new Promise((r) => servidor.close(r));
  }
}

const lerArquivo = (f) => { try { return fs.readFileSync(f(), 'utf8'); } catch (_) { return null; } };

const cred = (id, secret) => ({ 'X-Lyra-Device': id, 'X-Lyra-Secret': secret });

test('registrar: requisições sem credencial, inválidas, desconhecidas e pendentes TODAS seguem e são registradas', async () => {
  await comPilha({
    modoAllowlist: 'locked',
    preparar: (ac) => {
      ac.autenticar({ deviceId: 'dev-ok-0001', secret: SEGREDO_VALIDO });
      ac.aprovarDispositivo('dev-ok-0001');
      ac.autenticar({ deviceId: 'dev-pend-0002', secret: SEGREDO_VALIDO }); // fica pendente (locked)
    },
  }, async ({ porta, eventos, execucoes }) => {
    const alvo = { method: 'PUT', caminho: '/api/musicas/7', corpo: { a: 1 } };
    const casos = [
      ['sem credencial', {}, 'ausente'],
      ['secret inválido', cred('dev-ok-0001', SEGREDO_ERRADO), 'secret-invalido'],
      ['pendente', cred('dev-pend-0002', SEGREDO_VALIDO), 'pendente'],
      ['desconhecido', cred('dev-novo-0003', SEGREDO_VALIDO), 'desconhecido'],
    ];
    for (const [nome, headers] of casos) {
      const r = await requisitar(porta, { ...alvo, headers });
      assert.strictEqual(r.status, 200, `${nome} deve seguir (Fase A não bloqueia)`);
    }
    assert.strictEqual(execucoes.total, casos.length, 'os handlers executaram');
    assert.deepStrictEqual(eventos.map((e) => e.classe).sort(), ['ausente', 'desconhecido', 'pendente', 'secret-invalido']);
    assert.ok(eventos.every((e) => e.politica === 'escrita' && e.seriaRecusada === true));
  });
});

test('registrar: dispositivo autorizado segue e NÃO gera registro', async () => {
  await comPilha({ preparar: (ac) => ac.autenticar({ deviceId: 'dev-ok-0001', secret: SEGREDO_VALIDO }) }, async ({ porta, eventos }) => {
    const r = await requisitar(porta, { method: 'POST', caminho: '/api/comando/audio_play', headers: cred('dev-ok-0001', SEGREDO_VALIDO), corpo: {} });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(eventos.length, 0);
  });
});

test('registrar: dispositivo revogado nesta sessão é identificado e a requisição segue', async () => {
  await comPilha({
    preparar: (ac) => { ac.autenticar({ deviceId: 'dev-rev-0004', secret: SEGREDO_VALIDO }); ac.revogarDispositivo('dev-rev-0004'); },
  }, async ({ porta, eventos }) => {
    const r = await requisitar(porta, { caminho: '/api/musicas', headers: cred('dev-rev-0004', SEGREDO_VALIDO) });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(eventos[0].classe, 'revogado');
    assert.strictEqual(eventos[0].politica, 'leitura');
  });
});

test('NENHUMA requisição HTTP altera a allowlist nem inscreve dispositivo (modos tofu e locked)', async () => {
  for (const modoAllowlist of [null, 'locked']) {
    await comPilha({
      modoAllowlist,
      preparar: (ac) => ac.autenticar({ deviceId: 'dev-ok-0001', secret: SEGREDO_VALIDO }),
    }, async ({ porta, acesso, allowlistPath, notificados }) => {
      const antes = lerArquivo(allowlistPath);
      const inscritosAntes = JSON.stringify(acesso.listarDispositivos());
      const notificadosAntes = notificados.length;
      for (let i = 0; i < 12; i++) {
        await requisitar(porta, { method: 'POST', caminho: '/api/sync/banco/local', headers: cred(`estranho-${i}-xxxxxxxx`, SEGREDO_ERRADO), corpo: {} });
        await requisitar(porta, { caminho: '/api/musicas', headers: cred('dev-ok-0001', SEGREDO_ERRADO) });
        await requisitar(porta, { caminho: '/api/musicas' });
      }
      assert.strictEqual(lerArquivo(allowlistPath), antes, `allowlist (modo ${modoAllowlist || 'tofu'}) foi alterada por HTTP`);
      assert.strictEqual(JSON.stringify(acesso.listarDispositivos()), inscritosAntes);
      assert.strictEqual(notificados.length, notificadosAntes, 'HTTP não pode disparar notificações de acesso');
    });
  }
});

test('o socket continua sendo quem inscreve: depois de 100 requisições HTTP o TOFU ainda inscreve no handshake', async () => {
  await comPilha({}, async ({ porta, acesso }) => {
    for (let i = 0; i < 20; i++) await requisitar(porta, { caminho: '/api/musicas', headers: cred('dev-tofu-0005', SEGREDO_VALIDO) });
    assert.deepStrictEqual(acesso.listarDispositivos(), [], 'HTTP não inscreveu');
    assert.strictEqual(acesso.autenticar({ deviceId: 'dev-tofu-0005', secret: SEGREDO_VALIDO }).ok, true);
    assert.strictEqual(acesso.listarDispositivos().length, 1);
  });
});

test('NENHUM secret nem deviceId completo aparece nos registros', async () => {
  await comPilha({ preparar: (ac) => ac.autenticar({ deviceId: 'dev-ok-0001', secret: SEGREDO_VALIDO }) }, async ({ porta, logs, auth }) => {
    await requisitar(porta, { method: 'PUT', caminho: '/api/musicas/1', headers: cred('dev-ok-0001', SEGREDO_ERRADO), corpo: {} });
    await requisitar(porta, { method: 'PUT', caminho: '/api/musicas/2', headers: cred('dev-desc-0006-comprido', SEGREDO_VALIDO), corpo: {} });
    const tudo = logs.join('\n') + JSON.stringify(auth.resumo());
    assert.ok(logs.length >= 2);
    for (const proibido of [SEGREDO_VALIDO, SEGREDO_ERRADO, 'dev-ok-0001', 'dev-desc-0006-comprido']) {
      assert.ok(!tudo.includes(proibido), `"${proibido}" vazou no registro`);
    }
    assert.ok(tudo.includes('dev-ok-0…') || tudo.includes('dev-ok-0'), 'o deviceId truncado deve aparecer');
  });
});

test('modo desligado preserva o comportamento anterior: nada registrado, tudo segue', async () => {
  await comPilha({ modo: 'desligado' }, async ({ porta, eventos, execucoes }) => {
    for (const [method, caminho] of [['GET', '/api/musicas'], ['PUT', '/api/musicas/1'], ['POST', '/api/sync/banco/local'], ['POST', '/api/comando/audio_play']]) {
      const r = await requisitar(porta, { method, caminho, corpo: method === 'GET' ? undefined : {} });
      assert.strictEqual(r.status, 200, `${method} ${caminho}`);
    }
    assert.strictEqual(execucoes.total, 4);
    assert.strictEqual(eventos.length, 0);
  });
});

test('rotas públicas (identidade, preflight) não geram registro', async () => {
  await comPilha({}, async ({ porta, eventos }) => {
    assert.strictEqual((await requisitar(porta, { caminho: '/api/identity' })).status, 200);
    const pre = await requisitar(porta, {
      method: 'OPTIONS', caminho: '/api/musicas',
      headers: { Origin: 'http://127.0.0.1:3001', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'x-lyra-device,x-lyra-secret' },
    });
    assert.strictEqual(pre.status, 204);
    assert.strictEqual(eventos.length, 0);
  });
});

test('E1.2 preservada: Host de rebinding e Origin externa continuam recusados ANTES da autenticação (nem registro há)', async () => {
  await comPilha({ preparar: (ac) => ac.autenticar({ deviceId: 'dev-ok-0001', secret: SEGREDO_VALIDO }) }, async ({ porta, eventos, execucoes }) => {
    const rebind = await requisitar(porta, { caminho: '/api/musicas', headers: { Host: 'rebind.attacker.com:3001', ...cred('dev-ok-0001', SEGREDO_VALIDO) } });
    assert.strictEqual(rebind.status, 403);
    const externa = await requisitar(porta, { method: 'PUT', caminho: '/api/musicas/1', headers: { Origin: 'https://evil.example', ...cred('dev-ok-0001', SEGREDO_VALIDO) }, corpo: {} });
    assert.strictEqual(externa.status, 403);
    assert.strictEqual(externa.headers['access-control-allow-origin'], undefined);
    assert.strictEqual(execucoes.total, 0);
    assert.strictEqual(eventos.length, 0);
  });
});
