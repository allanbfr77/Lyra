'use strict';

/**
 * E1.2 — Host, Origin e CORS na prática: Express + Socket.IO reais, requisições com
 * cabeçalhos escolhidos à mão (o `fetch` do Node não deixa forjar `Host`/`Origin`).
 *
 * Cada cenário imita um cliente do Lyra ou uma página externa tentando usar a API local.
 * A primeira seção documenta o comportamento ANTERIOR (CORS `*`, sem validar Host) com uma
 * réplica do bloco que existia nos servidores; o resto exercita a proteção nova.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const { acessoRede, controleAcesso } = require('@lyra/projection-core');

const NOME_MAQUINA = 'pc-da-igreja';

/* ───────────────────────────── utilitários ───────────────────────────── */

function requisitar(porta, { method = 'GET', caminho = '/', headers = {}, corpo } = {}) {
  return new Promise((resolve, reject) => {
    const dados = corpo === undefined ? null : Buffer.from(JSON.stringify(corpo));
    const req = http.request(
      {
        host: '127.0.0.1',
        port: porta,
        method,
        path: caminho,
        headers: {
          ...(dados ? { 'content-type': 'application/json', 'content-length': dados.length } : {}),
          ...headers,
        },
      },
      (res) => {
        const partes = [];
        res.on('data', (c) => partes.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            texto: Buffer.concat(partes).toString('utf8'),
          })
        );
      }
    );
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

async function escutar(servidor) {
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  return servidor.address().port;
}

/** App com rotas que contam quantas vezes o handler foi realmente executado. */
function montarApp(usar) {
  const execucoes = { total: 0 };
  const app = express();
  usar(app);
  const conta = (res, corpo = { ok: true }) => {
    execucoes.total += 1;
    res.json(corpo);
  };
  app.get('/estatico.txt', (_req, res) => {
    execucoes.total += 1;
    res.type('text/plain').send('arquivo estatico');
  });
  app.get('/api/musicas', (_req, res) => conta(res, [{ id: 1 }]));
  app.post('/api/musicas', express.json(), (_req, res) => conta(res));
  app.delete('/api/musicas/:id', (_req, res) => conta(res));
  app.get('/api/display-config', (_req, res) => conta(res, { cfg: 1 }));
  app.put('/api/display-config', express.json(), (_req, res) => conta(res));
  app.get('/api/monitores', (_req, res) => conta(res, []));
  /* Rota "só da própria máquina", como `soDestaMaquina` do controlador: confia no IP. */
  app.post('/api/apresentacao/midia/importar', express.json(), (req, res) => {
    const addr = String(req.socket.remoteAddress || '');
    const local = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    if (!local) return res.status(403).json({ ok: false });
    return conta(res);
  });
  return { app, execucoes };
}

async function comServidor(usar, fn) {
  const { app, execucoes } = montarApp(usar);
  const servidor = http.createServer(app);
  const porta = await escutar(servidor);
  try {
    await fn({ porta, execucoes });
  } finally {
    await new Promise((r) => servidor.close(r));
  }
}

function novaProtecao(env = {}) {
  return acessoRede.criarProtecaoRede({ env, hostnameMaquina: NOME_MAQUINA });
}

/* ─────────────── Comportamento anterior (réplica do bloco antigo) ─────────────── */

function blocoCorsAnterior(app) {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

test('ANTERIOR: página externa usava a API (CORS *), passava no preflight e Host de DNS rebinding valia', async () => {
  await comServidor(blocoCorsAnterior, async ({ porta, execucoes }) => {
    const pagina = 'https://evil.example';
    const pre = await requisitar(porta, {
      method: 'OPTIONS',
      caminho: '/api/musicas',
      headers: { Origin: pagina, 'Access-Control-Request-Method': 'DELETE' },
    });
    assert.strictEqual(pre.status, 204);
    assert.strictEqual(pre.headers['access-control-allow-origin'], '*');

    const apagar = await requisitar(porta, {
      method: 'DELETE',
      caminho: '/api/musicas/1',
      headers: { Origin: pagina },
    });
    assert.strictEqual(apagar.status, 200);
    assert.strictEqual(execucoes.total, 1, 'o handler destrutivo executou para uma página externa');

    const rebind = await requisitar(porta, {
      caminho: '/api/musicas',
      headers: { Host: 'rebind.attacker.com:3001' },
    });
    assert.strictEqual(rebind.status, 200, 'Host de um domínio qualquer era aceito');
  });
});

/* ───────────────────────────── Host ───────────────────────────── */

test('Host autorizado é atendido (incl. arquivo estático)', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    for (const host of [`127.0.0.1:${porta}`, `localhost:${porta}`, `192.168.1.10:${porta}`, `${NOME_MAQUINA}:${porta}`]) {
      const r = await requisitar(porta, { caminho: '/estatico.txt', headers: { Host: host } });
      assert.strictEqual(r.status, 200, host);
    }
  });
});

test('Host não autorizado (DNS rebinding) é recusado em GET, POST e arquivos estáticos, sem executar o handler', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    const hosts = ['rebind.attacker.com:3001', 'evil.example', 'localhost.evil.example', '127.0.0.1@evil.example'];
    for (const host of hosts) {
      for (const [method, caminho] of [
        ['GET', '/estatico.txt'],
        ['GET', '/api/musicas'],
        ['POST', '/api/musicas'],
        ['DELETE', '/api/musicas/1'],
      ]) {
        const r = await requisitar(porta, {
          method,
          caminho,
          headers: { Host: host },
          corpo: method === 'POST' ? { a: 1 } : undefined,
        });
        assert.strictEqual(r.status, 403, `${method} ${caminho} com Host ${host}`);
        assert.strictEqual(r.headers['access-control-allow-origin'], undefined);
        assert.ok(!r.texto.includes('arquivo estatico'));
      }
    }
    assert.strictEqual(execucoes.total, 0);
  });
});

test('Host com nome cadastrado em LYRA_HOSTS_PERMITIDOS é atendido', async () => {
  const p = novaProtecao({ LYRA_HOSTS_PERMITIDOS: 'tunel.ngrok-free.app' });
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    const ok = await requisitar(porta, { caminho: '/api/musicas', headers: { Host: 'tunel.ngrok-free.app' } });
    assert.strictEqual(ok.status, 200);
    const nao = await requisitar(porta, { caminho: '/api/musicas', headers: { Host: 'outro.ngrok-free.app' } });
    assert.strictEqual(nao.status, 403);
  });
});

/* ───────────────────────────── Origin + CORS ───────────────────────────── */

test('Origin autorizado: recebe o PRÓPRIO origin em Access-Control-Allow-Origin (nunca *) e Vary: Origin', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    for (const origin of ['http://127.0.0.1:3001', 'http://192.168.1.10:5001', 'http://localhost:3001']) {
      const r = await requisitar(porta, { caminho: '/api/musicas', headers: { Origin: origin } });
      assert.strictEqual(r.status, 200, origin);
      assert.strictEqual(r.headers['access-control-allow-origin'], origin);
      assert.match(String(r.headers.vary), /Origin/i);
    }
  });
});

test('Origin externo: bloqueado em todos os métodos, sem cabeçalhos CORS, e o handler não executa', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    for (const origin of [
      'https://evil.example',
      'http://203.0.113.5:3001',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'chrome-extension://abcdefghijklmnop',
    ]) {
      for (const [method, caminho] of [
        ['GET', '/api/musicas'],
        ['POST', '/api/musicas'],
        ['PUT', '/api/display-config'],
        ['DELETE', '/api/musicas/1'],
      ]) {
        const r = await requisitar(porta, {
          method,
          caminho,
          headers: { Origin: origin },
          corpo: method === 'POST' || method === 'PUT' ? { a: 1 } : undefined,
        });
        assert.strictEqual(r.status, 403, `${method} ${caminho} Origin ${origin}`);
        assert.strictEqual(r.headers['access-control-allow-origin'], undefined);
        assert.strictEqual(r.headers['access-control-allow-methods'], undefined);
      }
    }
    assert.strictEqual(execucoes.total, 0);
  });
});

test('preflight (OPTIONS): origem autorizada recebe 204 com métodos e cabeçalho Content-Type; externa recebe 403 sem CORS', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    const ok = await requisitar(porta, {
      method: 'OPTIONS',
      caminho: '/api/musicas',
      headers: {
        Origin: 'http://127.0.0.1:3001',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assert.strictEqual(ok.status, 204);
    assert.strictEqual(ok.headers['access-control-allow-origin'], 'http://127.0.0.1:3001');
    assert.match(ok.headers['access-control-allow-methods'], /POST/);
    assert.match(ok.headers['access-control-allow-methods'], /DELETE/);
    assert.match(String(ok.headers['access-control-allow-headers']), /content-type/i);
    assert.ok(ok.headers['access-control-max-age']);

    const externo = await requisitar(porta, {
      method: 'OPTIONS',
      caminho: '/api/musicas',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'DELETE' },
    });
    assert.strictEqual(externo.status, 403);
    assert.strictEqual(externo.headers['access-control-allow-origin'], undefined);
    assert.strictEqual(externo.headers['access-control-allow-methods'], undefined);
  });
});

test('Origin ausente (mobile, processos Node, proxy do servidor): atendido, sem cabeçalhos CORS', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    const get = await requisitar(porta, { caminho: '/api/musicas', headers: { Host: `192.168.1.10:${porta}` } });
    assert.strictEqual(get.status, 200);
    assert.strictEqual(get.headers['access-control-allow-origin'], undefined);
    const post = await requisitar(porta, { method: 'POST', caminho: '/api/musicas', corpo: { a: 1 } });
    assert.strictEqual(post.status, 200);
    const opcoes = await requisitar(porta, { method: 'OPTIONS', caminho: '/api/musicas' });
    assert.strictEqual(opcoes.status, 204);
    assert.strictEqual(execucoes.total, 2);
  });
});

test('Origin ausente + Sec-Fetch-Site: cross-site: escrita é recusada (navegador de outro site), leitura segue', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    const escrita = await requisitar(porta, {
      method: 'POST',
      caminho: '/api/musicas',
      headers: { 'Sec-Fetch-Site': 'cross-site' },
      corpo: { a: 1 },
    });
    assert.strictEqual(escrita.status, 403);
    assert.strictEqual(execucoes.total, 0);
    const leitura = await requisitar(porta, { caminho: '/api/musicas', headers: { 'Sec-Fetch-Site': 'cross-site' } });
    assert.strictEqual(leitura.status, 200);
    const mesmoSite = await requisitar(porta, {
      method: 'POST',
      caminho: '/api/musicas',
      headers: { 'Sec-Fetch-Site': 'same-origin' },
      corpo: { a: 1 },
    });
    assert.strictEqual(mesmoSite.status, 200);
  });
});

/* ───────────────── Origin "null"/"file://" (telas de projeção) ───────────────── */

test('Origin null/file://: só os GET que as telas usam; o resto é recusado', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    for (const origin of ['null', 'file://']) {
      const cfg = await requisitar(porta, { caminho: '/api/display-config', headers: { Origin: origin } });
      assert.strictEqual(cfg.status, 200, origin);
      assert.strictEqual(cfg.headers['access-control-allow-origin'], origin === 'null' ? 'null' : 'file://');
      const mon = await requisitar(porta, { caminho: '/api/monitores', headers: { Origin: origin } });
      assert.strictEqual(mon.status, 200, origin);
    }
    const antes = execucoes.total;
    for (const [method, caminho] of [
      ['GET', '/api/musicas'],
      ['GET', '/estatico.txt'],
      ['PUT', '/api/display-config'],
      ['POST', '/api/musicas'],
      ['DELETE', '/api/musicas/1'],
      ['POST', '/api/apresentacao/midia/importar'],
    ]) {
      const r = await requisitar(porta, {
        method,
        caminho,
        headers: { Origin: 'null' },
        corpo: method === 'GET' || method === 'DELETE' ? undefined : { a: 1 },
      });
      assert.strictEqual(r.status, 403, `${method} ${caminho} com Origin null`);
      assert.strictEqual(r.headers['access-control-allow-origin'], undefined);
    }
    assert.strictEqual(execucoes.total, antes, 'nenhum handler extra pode executar');
  });
});

test('preflight com Origin null: só nos caminhos de leitura das telas', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    const ok = await requisitar(porta, {
      method: 'OPTIONS',
      caminho: '/api/monitores',
      headers: { Origin: 'null', 'Access-Control-Request-Method': 'GET' },
    });
    assert.strictEqual(ok.status, 204);
    assert.strictEqual(ok.headers['access-control-allow-origin'], 'null');
    const nao = await requisitar(porta, {
      method: 'OPTIONS',
      caminho: '/api/musicas',
      headers: { Origin: 'null', 'Access-Control-Request-Method': 'DELETE' },
    });
    assert.strictEqual(nao.status, 403);
  });
});

/* ───────────────────── Cabeçalhos manipulados / página externa ───────────────────── */

test('cabeçalhos "de proxy" não enganam a validação (X-Forwarded-*, X-Original-*)', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    const host = await requisitar(porta, {
      caminho: '/api/musicas',
      headers: { Host: 'evil.example', 'X-Forwarded-Host': '127.0.0.1', 'X-Original-Host': 'localhost' },
    });
    assert.strictEqual(host.status, 403);
    const origin = await requisitar(porta, {
      caminho: '/api/musicas',
      headers: { Origin: 'https://evil.example', 'X-Origin': 'http://127.0.0.1:3001', 'X-Forwarded-Origin': 'http://127.0.0.1:3001' },
    });
    assert.strictEqual(origin.status, 403);
    assert.strictEqual(execucoes.total, 0);
  });
});

test('Origin repetido ou com lixo é recusado', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    const duplicado = await requisitar(porta, {
      caminho: '/api/musicas',
      headers: { Origin: ['http://127.0.0.1:3001', 'https://evil.example'] },
    });
    assert.strictEqual(duplicado.status, 403);
    for (const origin of ['http://127.0.0.1:3001/', 'http://127.0.0.1:3001/x', 'http://u:p@127.0.0.1:3001', 'HTTP://127.0.0.1:3001/']) {
      const r = await requisitar(porta, { caminho: '/api/musicas', headers: { Origin: origin } });
      assert.strictEqual(r.status, 403, origin);
    }
  });
});

test('página externa não consegue usar rota "só da própria máquina" mesmo chegando por 127.0.0.1', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    /* O navegador do PC do operador conecta de 127.0.0.1: o IP de origem passa na checagem
       da rota. Quem barra é o Origin (ou o Host, no caso de rebinding). */
    const origemExterna = await requisitar(porta, {
      method: 'POST',
      caminho: '/api/apresentacao/midia/importar',
      headers: { Origin: 'https://evil.example' },
      corpo: { id: 'x', filePath: 'C:/Users/ALAN/Documents/segredo.mp3' },
    });
    assert.strictEqual(origemExterna.status, 403);
    const rebinding = await requisitar(porta, {
      method: 'POST',
      caminho: '/api/apresentacao/midia/importar',
      headers: { Origin: `http://rebind.attacker.com:${porta}`, Host: `rebind.attacker.com:${porta}` },
      corpo: { id: 'x', filePath: 'C:/Users/ALAN/Documents/segredo.mp3' },
    });
    assert.strictEqual(rebinding.status, 403);
    assert.strictEqual(execucoes.total, 0);
    const painel = await requisitar(porta, {
      method: 'POST',
      caminho: '/api/apresentacao/midia/importar',
      headers: { Origin: 'http://127.0.0.1:3001' },
      corpo: { id: 'x', filePath: 'C:/musicas/louvor.mp3' },
    });
    assert.strictEqual(painel.status, 200, 'o painel legítimo continua usando a rota');
  });
});

/* ───────────────────── Clientes legítimos do Lyra (compatibilidade) ───────────────────── */

test('compatibilidade: cada cliente legítimo do Lyra continua sendo atendido', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    const ip = '192.168.1.10';
    const clientes = [
      ['painel → servidor (Origin do painel, Host do servidor)', { Origin: 'http://127.0.0.1:3001', Host: `${ip}:${porta}` }, 'GET', '/api/musicas'],
      ['painel → própria API', { Origin: 'http://127.0.0.1:3001', Host: `127.0.0.1:${porta}` }, 'POST', '/api/musicas'],
      ['painel de outro PC → esta API (Origin loopback do outro PC)', { Origin: 'http://127.0.0.1:3001', Host: `${ip}:${porta}` }, 'PUT', '/api/display-config'],
      ['painel aberto no navegador de outro PC', { Origin: `http://${ip}:3001`, Host: `${ip}:${porta}` }, 'GET', '/api/musicas'],
      ['OBS (overlay servido pela 5001)', { Origin: `http://${ip}:5001`, Host: `${ip}:${porta}` }, 'GET', '/api/musicas'],
      ['mobile (React Native, sem Origin)', { Host: `${ip}:${porta}` }, 'PUT', '/api/display-config'],
      ['mobile por nome da máquina', { Host: `${NOME_MAQUINA}:${porta}` }, 'GET', '/api/musicas'],
      ['mobile que envia Origin do servidor', { Origin: `http://${ip}:5510`, Host: `${ip}:${porta}` }, 'GET', '/api/musicas'],
      ['proxy do servidor → controlador (Node, sem Origin)', { Host: `${ip}:${porta}` }, 'GET', '/api/musicas'],
      ['tela de projeção em file:// lendo a config', { Origin: 'null', Host: `localhost:${porta}` }, 'GET', '/api/display-config'],
      ['janela de controle do servidor (file://) lendo monitores', { Origin: 'null', Host: `127.0.0.1:${porta}` }, 'GET', '/api/monitores'],
    ];
    for (const [nome, headers, method, caminho] of clientes) {
      const r = await requisitar(porta, {
        method,
        caminho,
        headers,
        corpo: method === 'GET' ? undefined : { ok: 1 },
      });
      assert.strictEqual(r.status, 200, nome);
    }
  });
});

/* ───────────────────────────── Socket.IO / WebSocket ───────────────────────────── */

async function comSocketIo(fn, { modoAllowlist } = {}) {
  const protecao = novaProtecao();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-rede-'));
  const allowlistPath = () => path.join(dir, 'allow.json');
  if (modoAllowlist) fs.writeFileSync(allowlistPath(), JSON.stringify({ modo: modoAllowlist, devices: {} }));
  const acesso = controleAcesso.criarControleAcesso({
    allowlistPath,
    emitParaSocket: () => {},
    broadcast: () => {},
    notificar: () => {},
  });
  const servidor = http.createServer((_req, res) => res.end('ok'));
  const io = new Server(servidor, { cors: protecao.corsSocketIo(), allowRequest: protecao.allowRequest });
  const conexoes = [];
  /* Mesma lógica do `io.use` dos servidores: origem opaca nunca ganha credencial. */
  io.use((socket, next) => {
    if (protecao.origemOpacaDoRequest(socket.request)) {
      socket.data.autorizado = false;
      socket.data.authMotivo = 'origem-opaca';
      return next();
    }
    const r = acesso.autenticar(socket.handshake.auth || {});
    socket.data.autorizado = !!r.ok;
    socket.data.authMotivo = r.motivo || null;
    return next();
  });
  io.on('connection', (socket) =>
    conexoes.push({ autorizado: socket.data.autorizado, motivo: socket.data.authMotivo })
  );
  const porta = await escutar(servidor);
  const lerAllowlist = () => {
    try {
      return JSON.parse(fs.readFileSync(allowlistPath(), 'utf8'));
    } catch (_) {
      return { devices: {} };
    }
  };
  try {
    await fn({ porta, conexoes, lerAllowlist });
  } finally {
    await new Promise((r) => io.close(r));
  }
}

/** Abre um WebSocket Engine.IO/Socket.IO "à mão" e tenta entrar no namespace. */
function conectarWs(porta, { headers = {}, auth } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${porta}/socket.io/?EIO=4&transport=websocket`, { headers });
    let resolvido = false;
    const fim = (r) => {
      if (resolvido) return;
      resolvido = true;
      try {
        ws.terminate();
      } catch (_) {
        /* já fechado */
      }
      resolve(r);
    };
    ws.on('unexpected-response', (_req, res) => fim({ aberto: false, status: res.statusCode }));
    ws.on('error', () => fim({ aberto: false, status: 0 }));
    ws.on('message', (m) => {
      const texto = String(m);
      if (texto.startsWith('0')) ws.send(`40${JSON.stringify(auth || {})}`);
      else if (texto.startsWith('40')) fim({ aberto: true, status: 101 });
      else if (texto.startsWith('44')) fim({ aberto: false, status: 44 });
    });
    setTimeout(() => fim({ aberto: false, status: -1 }), 4000);
  });
}

test('Socket.IO: página externa não abre WebSocket (Origin externo ou Host de rebinding)', async () => {
  await comSocketIo(async ({ porta, conexoes }) => {
    /* Engine.IO nega o upgrade de WebSocket com 400 (nas requisições de polling usa 403). */
    const recusado = (r) => r.aberto === false && [400, 403].includes(r.status);
    const externo = await conectarWs(porta, { headers: { Origin: 'https://evil.example' } });
    assert.ok(recusado(externo), JSON.stringify(externo));
    const rebinding = await conectarWs(porta, {
      headers: { Origin: `http://rebind.attacker.com:${porta}`, Host: `rebind.attacker.com:${porta}` },
    });
    assert.ok(recusado(rebinding), JSON.stringify(rebinding));
    const hostRuim = await conectarWs(porta, { headers: { Host: 'rebind.attacker.com' } });
    assert.ok(recusado(hostRuim), JSON.stringify(hostRuim));
    assert.strictEqual(conexoes.length, 0);
  });
});

test('Socket.IO: painel e OBS (origens legítimas) conectam; credencial válida autoriza', async () => {
  await comSocketIo(async ({ porta, conexoes }) => {
    const painel = await conectarWs(porta, {
      headers: { Origin: 'http://127.0.0.1:3001' },
      auth: { deviceId: 'painel-1', secret: 'segredo-1' },
    });
    assert.strictEqual(painel.aberto, true);
    const obs = await conectarWs(porta, { headers: { Origin: 'http://192.168.1.10:5001' } });
    assert.strictEqual(obs.aberto, true);
    assert.strictEqual(conexoes.length, 2);
    assert.strictEqual(conexoes[0].autorizado, true);
    assert.strictEqual(conexoes[1].autorizado, false);
  });
});

test('Socket.IO: cliente sem Origin (mobile) conecta e se autentica normalmente', async () => {
  await comSocketIo(async ({ porta, conexoes }) => {
    const r = await conectarWs(porta, { auth: { deviceId: 'celular-1', secret: 'segredo-c' } });
    assert.strictEqual(r.aberto, true);
    assert.strictEqual(conexoes[0].autorizado, true);
  });
});

test('Socket.IO: tela em file:// (Origin file:// ou null) conecta só como VISUALIZADOR e não se auto-inscreve (TOFU)', async () => {
  await comSocketIo(async ({ porta, conexoes, lerAllowlist }) => {
    for (const origin of ['file://', 'null']) {
      const r = await conectarWs(porta, {
        headers: { Origin: origin },
        auth: { deviceId: `atacante-${origin}`, secret: 'x'.repeat(12) },
      });
      assert.strictEqual(r.aberto, true, origin);
    }
    assert.strictEqual(conexoes.length, 2);
    for (const c of conexoes) {
      assert.strictEqual(c.autorizado, false);
      assert.strictEqual(c.motivo, 'origem-opaca');
    }
    assert.deepStrictEqual(Object.keys(lerAllowlist().devices || {}), [], 'nenhum dispositivo pode ser inscrito por origem opaca');
  });
});

test('Socket.IO (polling): handshake HTTP respeita Host/Origin e CORS', async () => {
  await comSocketIo(async ({ porta }) => {
    const url = '/socket.io/?EIO=4&transport=polling';
    const ok = await requisitar(porta, { caminho: url, headers: { Origin: 'http://127.0.0.1:3001' } });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.headers['access-control-allow-origin'], 'http://127.0.0.1:3001');
    const semOrigin = await requisitar(porta, { caminho: url });
    assert.strictEqual(semOrigin.status, 200);
    assert.strictEqual(semOrigin.headers['access-control-allow-origin'], undefined);
    const nulo = await requisitar(porta, { caminho: url, headers: { Origin: 'null' } });
    assert.strictEqual(nulo.status, 200);
    const externo = await requisitar(porta, { caminho: url, headers: { Origin: 'https://evil.example' } });
    assert.strictEqual(externo.status, 403);
    assert.strictEqual(externo.headers['access-control-allow-origin'], undefined);
    const rebinding = await requisitar(porta, { caminho: url, headers: { Host: 'rebind.attacker.com' } });
    assert.strictEqual(rebinding.status, 403);
    const preflight = await requisitar(porta, {
      method: 'OPTIONS',
      caminho: url,
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    assert.strictEqual(preflight.headers['access-control-allow-origin'], undefined);
  });
});
