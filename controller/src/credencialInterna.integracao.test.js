'use strict';

/**
 * E1.3 Fase B — credencial interna (arquitetura W) com Express, Socket.IO e allowlist REAIS.
 *
 * O modo `impor` só existe aqui, em servidores efêmeros em 127.0.0.1 (porta 0), com allowlist
 * temporária e sem dados reais. Nenhum servidor de produção é tocado.
 *
 * O que se prova:
 *  - a credencial interna passa nas rotas críticas (GET, HEAD, POST, PUT, DELETE) no contexto local;
 *  - dispositivo desconhecido, secret inválido, proxy e Host fora de loopback continuam recusados;
 *  - a allowlist (arquivo e memória) não muda por causa dela;
 *  - o Socket.IO não a aceita nem a inscreve por TOFU, e o TOFU de dispositivos reais segue igual;
 *  - o salto 3001→5510 nunca a repassa.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { controleAcesso, autenticacaoHttp, credencialInterna } = require('@lyra/projection-core');
const proxyProjecaoJson = require('./lib/proxyProjecaoJson');

const SEG_OK = 'SEGREDO-AUTORIZADO-NAO-VAZAR-1';

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

const CRITICAS = [
  ['POST', '/api/comando/slide'],
  ['PUT', '/api/display-config'],
  ['PUT', '/api/display-routing'],
  ['DELETE', '/api/musicas/1'],
  ['POST', '/api/playlists'],
  ['GET', '/api/musicas'],
  ['HEAD', '/api/musicas'],
];

async function comPilha(fn, { modoAllowlist = 'tofu', modoHttp = 'impor' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-cred-int-'));
  const allowlistPath = () => path.join(dir, 'allow.json');
  const acesso = controleAcesso.criarControleAcesso({ opcoes: { inscricaoAutomatica: true }, allowlistPath, emitParaSocket: () => {}, broadcast: () => {}, notificar: () => {} });
  acesso.autenticar({ deviceId: 'dev-ok-0001', secret: SEG_OK });
  if (modoAllowlist === 'locked') acesso.travar();
  const interna = credencialInterna.criarCredencialInterna();
  const h = interna.aplicarAosCabecalhos({});
  const credInterna = { 'X-Lyra-Device': h['X-Lyra-Device'], 'X-Lyra-Secret': h['X-Lyra-Secret'] };

  const exec = [];
  const eventos = [];
  const auth = autenticacaoHttp.criarAutenticacaoHttp({
    modo: modoHttp,
    contexto: 'local-5510',
    verificar: credencialInterna.criarVerificadorHttp({ interna, verificarBase: (a) => acesso.verificarCredencial(a) }),
    registrar: (e) => eventos.push(JSON.stringify(e)),
  });
  const app = express();
  app.use(auth.middleware);
  app.use(express.json());
  const roda = (nome) => (_q, res) => { exec.push(nome); res.json({ ok: true }); };
  app.post('/api/comando/:acao', roda('comando'));
  app.put('/api/display-config', roda('display-config'));
  app.put('/api/display-routing', roda('display-routing'));
  app.delete('/api/musicas/:id', roda('delete'));
  app.post('/api/playlists', roda('playlists'));
  app.get('/api/musicas', roda('musicas'));

  const srv = http.createServer(app);
  const io = new Server(srv);
  const conectados = [];
  io.use((socket, next) => {
    const autenticar = credencialInterna.protegerSocket({ interna, autenticar: (a) => acesso.autenticar(a) });
    const r = autenticar(socket.handshake.auth || {});
    socket.data.autorizado = !!r.ok;
    socket.data.motivo = r.motivo || null;
    next();
  });
  io.on('connection', (s) => conectados.push({ autorizado: s.data.autorizado, motivo: s.data.motivo }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const antes = () => (fs.existsSync(allowlistPath()) ? fs.readFileSync(allowlistPath(), 'utf8') : '');
  const inicial = antes();
  try {
    await fn({
      porta: srv.address().port, exec, eventos, interna, credInterna, acesso, conectados,
      allowlistInalterada: () => antes() === inicial,
      ids: () => acesso.listarDispositivos().map((d) => d.deviceId).sort(),
    });
  } finally {
    io.close();
    await new Promise((r) => srv.close(() => r()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Handshake Socket.IO v4 por long-polling, com `auth`, sem cliente externo. */
async function handshakeSocketIo(porta, auth) {
  const base = `/socket.io/?EIO=4&transport=polling`;
  const abrir = await requisitar(porta, { caminho: base });
  const sid = JSON.parse(abrir.texto.slice(1)).sid;
  const dados = Buffer.from(`40${JSON.stringify(auth)}`);
  await new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: porta, method: 'POST', path: `${base}&sid=${sid}`, headers: { 'content-type': 'text/plain;charset=UTF-8', 'content-length': dados.length } },
      (res) => { res.resume(); res.on('end', resolve); }
    );
    req.on('error', reject);
    req.end(dados);
  });
  const resp = await requisitar(porta, { caminho: `${base}&sid=${sid}` });
  return resp.texto;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── HTTP em impor ───────────────────────── */

test('impor: a credencial interna executa as rotas críticas (GET, HEAD, POST, PUT, DELETE) no contexto local', async () => {
  await comPilha(async ({ porta, credInterna, exec }) => {
    for (const [m, p] of CRITICAS) {
      const r = await requisitar(porta, { method: m, caminho: p, headers: credInterna, corpo: m === 'GET' || m === 'HEAD' ? undefined : { x: 1 } });
      assert.strictEqual(r.status, 200, `${m} ${p}`);
    }
    assert.strictEqual(exec.length, CRITICAS.length, 'todos os handlers executaram (HEAD usa o handler do GET)');
  });
});

test('impor: dispositivo desconhecido e credencial inválida continuam recusados (o handler não executa)', async () => {
  await comPilha(async ({ porta, credInterna, exec, eventos }) => {
    const casos = [
      ['sem credencial', {}],
      ['dispositivo desconhecido', { 'X-Lyra-Device': 'dev-ninguem-9', 'X-Lyra-Secret': 'qualquer' }],
      ['id interno com secret errado', { 'X-Lyra-Device': credInterna['X-Lyra-Device'], 'X-Lyra-Secret': 'errado' }],
      ['secret interno com id errado', { 'X-Lyra-Device': 'dev-ninguem-9', 'X-Lyra-Secret': credInterna['X-Lyra-Secret'] }],
    ];
    for (const [m, p] of CRITICAS) {
      for (const [nome, headers] of casos) {
        const r = await requisitar(porta, { method: m, caminho: p, headers, corpo: m === 'GET' || m === 'HEAD' ? undefined : { x: 1 } });
        assert.strictEqual(r.status, 401, `${m} ${p} — ${nome}`);
        assert.doesNotMatch(r.texto, new RegExp(credInterna['X-Lyra-Secret']));
      }
    }
    assert.deepStrictEqual(exec, []);
    assert.ok(!eventos.join('\n').includes(credInterna['X-Lyra-Secret']), 'o registro nunca contém o segredo interno');
  });
});

test('impor: proxy do Lyra e Host fora de loopback não transformam a interna em autorização', async () => {
  await comPilha(async ({ porta, credInterna, exec }) => {
    const proxy = await requisitar(porta, { method: 'POST', caminho: '/api/comando/slide', headers: { ...credInterna, 'X-Lyra-Proxy': '1' }, corpo: { x: 1 } });
    assert.strictEqual(proxy.status, 401);
    const hostLan = await requisitar(porta, { method: 'POST', caminho: '/api/comando/slide', headers: { ...credInterna, Host: '192.168.0.10:5510' }, corpo: { x: 1 } });
    assert.strictEqual(hostLan.status, 401);
    const hostExterno = await requisitar(porta, { method: 'PUT', caminho: '/api/display-config', headers: { ...credInterna, Host: 'evil.test:3001' }, corpo: { x: 1 } });
    assert.strictEqual(hostExterno.status, 401);
    assert.deepStrictEqual(exec, []);
  });
});

test('impor: dispositivo real autorizado segue funcionando (a interna não o substitui)', async () => {
  await comPilha(async ({ porta, exec }) => {
    const r = await requisitar(porta, { method: 'POST', caminho: '/api/comando/slide', headers: { 'X-Lyra-Device': 'dev-ok-0001', 'X-Lyra-Secret': SEG_OK }, corpo: { x: 1 } });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(exec, ['comando']);
  });
});

test('registrar: o modo de produção continua sem recusar nada, com a interna ou sem ela', async () => {
  await comPilha(async ({ porta, credInterna, exec }) => {
    const a = await requisitar(porta, { method: 'POST', caminho: '/api/comando/slide', corpo: { x: 1 } });
    const b = await requisitar(porta, { method: 'POST', caminho: '/api/comando/slide', headers: credInterna, corpo: { x: 1 } });
    assert.strictEqual(a.status, 200);
    assert.strictEqual(b.status, 200);
    assert.strictEqual(exec.length, 2);
  }, { modoHttp: 'registrar' });
});

/* ───────────────────────── allowlist intocada ───────────────────────── */

test('a allowlist (arquivo e memória) não muda com nenhuma requisição interna, aceita ou recusada', async () => {
  await comPilha(async ({ porta, credInterna, allowlistInalterada, ids, interna }) => {
    const antes = ids();
    for (const [m, p] of CRITICAS) {
      await requisitar(porta, { method: m, caminho: p, headers: credInterna, corpo: m === 'GET' || m === 'HEAD' ? undefined : { x: 1 } });
      await requisitar(porta, { method: m, caminho: p, headers: { ...credInterna, 'X-Lyra-Proxy': '1' }, corpo: m === 'GET' || m === 'HEAD' ? undefined : { x: 1 } });
    }
    assert.deepStrictEqual(ids(), antes);
    assert.ok(allowlistInalterada(), 'arquivo da allowlist idêntico');
    assert.ok(!ids().includes(interna.deviceId));
  });
});

/* ───────────────────────── Socket.IO ───────────────────────── */

test('Socket.IO: o par interno não é aceito nem inscrito por TOFU, mesmo com a allowlist em TOFU', async () => {
  await comPilha(async ({ porta, credInterna, conectados, ids, interna, allowlistInalterada }) => {
    const antes = ids();
    const resp = await handshakeSocketIo(porta, { deviceId: credInterna['X-Lyra-Device'], secret: credInterna['X-Lyra-Secret'], nome: 'x' });
    await esperar(150);
    assert.match(resp, /^40/, 'o socket conecta (visualizador), como qualquer cliente sem credencial válida');
    assert.strictEqual(conectados.length, 1);
    assert.strictEqual(conectados[0].autorizado, false, 'sem direito de escrita');
    assert.strictEqual(conectados[0].motivo, 'credencial-interna-recusada');
    assert.deepStrictEqual(ids(), antes, 'não foi inscrito');
    assert.ok(!ids().includes(interna.deviceId));
    assert.ok(allowlistInalterada());
  });
});

test('Socket.IO: o TOFU de dispositivos reais continua igual (a guarda só recusa o id interno)', async () => {
  await comPilha(async ({ porta, conectados, ids }) => {
    await handshakeSocketIo(porta, { deviceId: 'cel-novo-0001', secret: 'SEG-CEL', nome: 'celular' });
    await esperar(150);
    assert.strictEqual(conectados.at(-1).autorizado, true, 'TOFU inscreveu e autorizou');
    assert.ok(ids().includes('cel-novo-0001'));
  });
});

/* ───────────────────────── salto 3001 → 5510 ───────────────────────── */

test('salto 3001→5510: a credencial interna nunca é repassada; a de um dispositivo comum segue como antes', () => {
  const interna = credencialInterna.criarCredencialInterna();
  const h = interna.aplicarAosCabecalhos({});
  const reqInterna = { headers: { 'x-lyra-device': h['X-Lyra-Device'], 'x-lyra-secret': h['X-Lyra-Secret'], 'x-lyra-app': '1.0.0' } };
  const cred = proxyProjecaoJson.credenciaisDoRequest(reqInterna, { interna });
  assert.deepStrictEqual(cred, { deviceId: '', secret: '', app: '' });
  const base = new URL('http://192.168.0.10:5510');
  const cab = proxyProjecaoJson.cabecalhosParaProjecao(cred, base, 2);
  assert.ok(!JSON.stringify(cab).includes(h['X-Lyra-Secret']));
  assert.ok(!('X-Lyra-Device' in cab) && !('X-Lyra-Secret' in cab));

  const reqComum = { headers: { 'x-lyra-device': 'cel-1', 'x-lyra-secret': 'seg-cel', 'x-lyra-app': '2.0.0' } };
  assert.deepStrictEqual(proxyProjecaoJson.credenciaisDoRequest(reqComum, { interna }), { deviceId: 'cel-1', secret: 'seg-cel', app: '2.0.0' });
  assert.deepStrictEqual(proxyProjecaoJson.credenciaisDoRequest(reqComum), { deviceId: 'cel-1', secret: 'seg-cel', app: '2.0.0' });
});

test('salto 3001→5510: a interna só segue ao motor local DESTE processo (ativo, loopback, 5510), validada e sem proxy', () => {
  const interna = credencialInterna.criarCredencialInterna();
  const h = interna.aplicarAosCabecalhos({});
  const mk = (extra = {}, device = h['X-Lyra-Device'], secret = h['X-Lyra-Secret']) => ({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3001', 'x-lyra-device': device, 'x-lyra-secret': secret, 'x-lyra-app': '1.0.0', ...extra },
  });
  const local = new URL('http://localhost:5510');
  const ok = { interna, base: local, destinoEhMotorLocal: true };

  // destino é o motor local → segue, e o cabeçalho final sai com o par interno
  const c = proxyProjecaoJson.credenciaisParaSalto(mk(), ok);
  assert.deepStrictEqual(c, { deviceId: h['X-Lyra-Device'], secret: h['X-Lyra-Secret'], app: '1.0.0' });
  const cab = proxyProjecaoJson.cabecalhosParaProjecao(c, local, 2);
  assert.strictEqual(cab['X-Lyra-Secret'], h['X-Lyra-Secret']);

  const vazio = { deviceId: '', secret: '', app: '' };
  // Servidor remoto / outro PC / motor local inativo → nunca
  assert.deepStrictEqual(proxyProjecaoJson.credenciaisParaSalto(mk(), { ...ok, destinoEhMotorLocal: false }), vazio);
  assert.deepStrictEqual(proxyProjecaoJson.credenciaisParaSalto(mk(), { interna, base: new URL('http://192.168.0.10:5510'), destinoEhMotorLocal: false }), vazio);
  // segredo errado, requisição proxificada ou vinda de fora da máquina → nunca
  assert.deepStrictEqual(proxyProjecaoJson.credenciaisParaSalto(mk({}, h['X-Lyra-Device'], 'errado'), ok), vazio);
  assert.deepStrictEqual(proxyProjecaoJson.credenciaisParaSalto(mk({ 'x-lyra-proxy': '1' }), ok), vazio);
  const deFora = mk();
  deFora.socket.remoteAddress = '192.168.0.20';
  assert.deepStrictEqual(proxyProjecaoJson.credenciaisParaSalto(deFora, ok), vazio);
  // sem credencial interna configurada, o par "interno" é só um dispositivo desconhecido qualquer
  assert.deepStrictEqual(
    proxyProjecaoJson.credenciaisParaSalto(mk({}, 'cel-1', 'seg'), { interna: null, base: new URL('http://192.168.0.10:5510'), destinoEhMotorLocal: false }),
    { deviceId: 'cel-1', secret: 'seg', app: '1.0.0' }
  );
  // dispositivo comum: como antes (credencial do cliente, qualquer destino do Lyra)
  assert.deepStrictEqual(proxyProjecaoJson.credenciaisParaSalto(mk({}, 'cel-1', 'seg'), { ...ok, destinoEhMotorLocal: false }), { deviceId: 'cel-1', secret: 'seg', app: '1.0.0' });
});
