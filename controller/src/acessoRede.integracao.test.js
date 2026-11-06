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
/* `ws` não é dependência direta do controlador: numa instalação limpa (npm ci, como na CI)
   ele só existe aninhado no `engine.io`. Usa-se exatamente o que o Socket.IO usa. */
const WebSocket = require(require.resolve('ws', { paths: [path.dirname(require.resolve('engine.io'))] }));
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
  /* As três rotas que a janela de Histórico usa (listar, apagar um, limpar tudo). */
  app.get('/api/historico', (_req, res) => conta(res, []));
  app.delete('/api/historico/:id', (_req, res) => conta(res));
  app.post('/api/historico/limpar', express.json(), (_req, res) => conta(res));
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

/** IP desta máquina nos testes (determinístico: não depende da placa de rede de quem roda). */
const IP_DA_MAQUINA = '192.168.1.10';
/** Um terceiro: outro PC da mesma rede (nunca é esta máquina). */
const IP_DE_TERCEIRO = '192.168.1.77';

function novaProtecao(env = {}) {
  return acessoRede.criarProtecaoRede({ env, hostnameMaquina: NOME_MAQUINA, enderecosMaquina: [IP_DA_MAQUINA] });
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

/* ───────── Origin "null" e "file://" — e o que o Electron REALMENTE envia ─────────
 *
 * Observado no Electron 29.4.6: janelas file:// NÃO mandam Origin em fetch/XHR (só
 * Sec-Fetch-Site: cross-site); só o WebSocket manda "Origin: file://". "Origin: null" vem de
 * iframes isolados e páginas data: de sites comuns — nunca de uma janela do Lyra. */

test('Origin null é recusada em HTTP, em TODOS os caminhos e métodos (inclusive os dois GET das telas)', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    for (const [method, caminho] of [
      ['GET', '/api/display-config'],
      ['GET', '/api/monitores'],
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
    assert.strictEqual(execucoes.total, 0, 'nenhum handler pode executar para Origin null');
  });
});

test('Origin file:// também é recusada em HTTP (só vale no Socket.IO, como visualizador)', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    for (const [method, caminho] of [
      ['GET', '/api/display-config'],
      ['GET', '/api/monitores'],
      ['GET', '/api/musicas'],
      ['POST', '/api/musicas'],
      ['DELETE', '/api/musicas/1'],
    ]) {
      const r = await requisitar(porta, {
        method,
        caminho,
        headers: { Origin: 'file://' },
        corpo: method === 'POST' ? { a: 1 } : undefined,
      });
      assert.strictEqual(r.status, 403, `${method} ${caminho} com Origin file://`);
      assert.strictEqual(r.headers['access-control-allow-origin'], undefined);
    }
    assert.strictEqual(execucoes.total, 0);
  });
});

test('preflight com Origin null ou file:// é recusado em qualquer caminho', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    for (const origin of ['null', 'file://']) {
      for (const caminho of ['/api/monitores', '/api/display-config', '/api/musicas']) {
        const r = await requisitar(porta, {
          method: 'OPTIONS',
          caminho,
          headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
        });
        assert.strictEqual(r.status, 403, `${origin} ${caminho}`);
        assert.strictEqual(r.headers['access-control-allow-origin'], undefined);
      }
    }
  });
});

test('Origin AUSENTE não é Origin null: janelas file:// do Electron (sem Origin) leem as telas como antes', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    const eletron = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'cors', 'User-Agent': 'Mozilla/5.0 Chrome/122 Electron/29.4.6' };
    const cfg = await requisitar(porta, { caminho: '/api/display-config', headers: { ...eletron, Host: `localhost:${porta}` } });
    assert.strictEqual(cfg.status, 200);
    const mon = await requisitar(porta, { caminho: '/api/monitores', headers: { ...eletron, Host: `127.0.0.1:${porta}` } });
    assert.strictEqual(mon.status, 200);
  });
});

test('janela file:// do Electron não escreve na API (sem Origin + cross-site): recusada por desenho', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    const eletron = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'cors' };
    for (const [method, caminho] of [['POST', '/api/historico/limpar'], ['DELETE', '/api/historico/1'], ['PUT', '/api/display-config']]) {
      const r = await requisitar(porta, { method, caminho, headers: eletron, corpo: method === 'DELETE' ? undefined : { a: 1 } });
      assert.strictEqual(r.status, 403, `${method} ${caminho}`);
    }
    assert.strictEqual(execucoes.total, 0);
  });
});

/* ───────── Janela de Histórico (ajuste A): carregada pelo servidor local ───────── */

test('janela de Histórico via http://127.0.0.1:3001 (cabeçalhos observados no Electron): GET, POST e DELETE funcionam', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    const mesmaOrigem = { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors', 'User-Agent': 'Mozilla/5.0 Chrome/122 Electron/29.4.6', Host: `127.0.0.1:${porta}` };
    /* O Electron manda Origin só em POST/DELETE (GET same-origin vai sem Origin). */
    const origem = { Origin: 'http://127.0.0.1:3001' };
    const lista = await requisitar(porta, { caminho: '/api/historico?periodo=hoje', headers: mesmaOrigem });
    assert.strictEqual(lista.status, 200, 'GET listagem');
    const limpar = await requisitar(porta, { method: 'POST', caminho: '/api/historico/limpar', headers: { ...mesmaOrigem, ...origem }, corpo: { confirmar: true } });
    assert.strictEqual(limpar.status, 200, 'POST (limpeza)');
    const apagar = await requisitar(porta, { method: 'DELETE', caminho: '/api/historico/1', headers: { ...mesmaOrigem, ...origem } });
    assert.strictEqual(apagar.status, 200, 'DELETE (exclusão individual)');
    assert.strictEqual(execucoes.total, 3);
  });
});

test('historico.html é servido pelo servidor local (static) e a CSP permite a API da 3001', async () => {
  const p = novaProtecao();
  const publico = path.join(__dirname, '..', 'public');
  await comServidor(
    (app) => {
      app.use(p.middleware);
      app.use(express.static(publico));
    },
    async ({ porta }) => {
      const r = await requisitar(porta, { caminho: '/historico.html', headers: { Host: `127.0.0.1:${porta}`, 'Sec-Fetch-Site': 'none' } });
      assert.strictEqual(r.status, 200);
      assert.match(r.texto, /Histórico e relatórios/);
      assert.match(r.texto, /connect-src http:\/\/127\.0\.0\.1:3001/);
      const rebinding = await requisitar(porta, { caminho: '/historico.html', headers: { Host: 'rebind.attacker.com' } });
      assert.strictEqual(rebinding.status, 403);
    }
  );
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

/* ───────── Origens de terceiros, da própria máquina e cadastradas (ajuste C) ───────── */

test('IP privado de TERCEIROS (outro PC da rede) é bloqueado em HTTP, mesmo nas portas do Lyra', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    const origens = [
      `http://${IP_DE_TERCEIRO}:5001`,
      `http://${IP_DE_TERCEIRO}:3001`,
      'http://10.0.0.7:5510',
      'http://maquina-do-atacante:5001',
      'http://atacante.local:5001',
    ];
    for (const origin of origens) {
      for (const host of [`127.0.0.1:${porta}`, `${IP_DA_MAQUINA}:${porta}`]) {
        const get = await requisitar(porta, { caminho: '/api/musicas', headers: { Origin: origin, Host: host } });
        assert.strictEqual(get.status, 403, `GET Origin ${origin} Host ${host}`);
        assert.strictEqual(get.headers['access-control-allow-origin'], undefined);
        const post = await requisitar(porta, { method: 'POST', caminho: '/api/apresentacao/midia/importar', headers: { Origin: origin, Host: host }, corpo: { id: 'x', filePath: 'C:/segredo.mp3' } });
        assert.strictEqual(post.status, 403, `POST rota só-local, Origin ${origin}`);
        const pre = await requisitar(porta, { method: 'OPTIONS', caminho: '/api/musicas', headers: { Origin: origin, Host: host, 'Access-Control-Request-Method': 'DELETE' } });
        assert.strictEqual(pre.status, 403);
      }
    }
    assert.strictEqual(execucoes.total, 0);
  });
});

test('origem da PRÓPRIA máquina (IP ou nome dela) é aceita, mesmo com outro Host', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    for (const origin of [
      `http://${IP_DA_MAQUINA}:5001`,
      `http://${IP_DA_MAQUINA}:3001`,
      `http://${NOME_MAQUINA}:5001`,
      `http://${NOME_MAQUINA.toUpperCase()}:5001`,
      `http://${NOME_MAQUINA}.local:5510`,
      'http://127.0.0.1:5001',
      'http://localhost:5001',
    ]) {
      const r = await requisitar(porta, { caminho: '/api/musicas', headers: { Origin: origin, Host: `127.0.0.1:${porta}` } });
      assert.strictEqual(r.status, 200, origin);
      assert.strictEqual(r.headers['access-control-allow-origin'], origin.replace(/^(https?:\/\/)([^:/]+)/i, (_m, e, h) => e + h.toLowerCase()));
    }
  });
});

test('origem com o MESMO host da requisição é aceita (OBS servido pelo Lyra por NAT/VPN/nome cadastrado)', async () => {
  const p = novaProtecao({ LYRA_HOSTS_PERMITIDOS: 'lyra.igreja.org.br' });
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    const casos = [
      ['http://172.20.0.5:5001', `172.20.0.5:${porta}`],
      ['http://lyra.igreja.org.br:5001', `lyra.igreja.org.br:${porta}`],
    ];
    for (const [origin, host] of casos) {
      const r = await requisitar(porta, { caminho: '/api/musicas', headers: { Origin: origin, Host: host } });
      assert.strictEqual(r.status, 200, origin);
    }
    /* O mesmo nome como origem, mas a requisição indo para OUTRO host: não vale. */
    const outro = await requisitar(porta, { caminho: '/api/musicas', headers: { Origin: 'http://lyra.igreja.org.br:5001', Host: `127.0.0.1:${porta}` } });
    assert.strictEqual(outro.status, 403);
  });
});

test('LYRA_ORIGENS_PERMITIDAS: a origem cadastrada funciona (inclusive de terceiros); as demais continuam bloqueadas', async () => {
  const p = novaProtecao({ LYRA_ORIGENS_PERMITIDAS: `http://${IP_DE_TERCEIRO}:8081, http://localhost:8081` });
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    const cadastrada = await requisitar(porta, { caminho: '/api/musicas', headers: { Origin: `http://${IP_DE_TERCEIRO}:8081`, Host: `127.0.0.1:${porta}` } });
    assert.strictEqual(cadastrada.status, 200);
    assert.strictEqual(cadastrada.headers['access-control-allow-origin'], `http://${IP_DE_TERCEIRO}:8081`);
    const dev = await requisitar(porta, { method: 'POST', caminho: '/api/musicas', headers: { Origin: 'http://localhost:8081' }, corpo: { a: 1 } });
    assert.strictEqual(dev.status, 200);
    const outraPorta = await requisitar(porta, { caminho: '/api/musicas', headers: { Origin: `http://${IP_DE_TERCEIRO}:5001` } });
    assert.strictEqual(outraPorta.status, 403);
    const outroHost = await requisitar(porta, { caminho: '/api/musicas', headers: { Origin: 'http://192.168.1.78:8081' } });
    assert.strictEqual(outroHost.status, 403);
    assert.strictEqual(execucoes.total, 2);
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
      ['OBS no próprio servidor (origem loopback)', { Origin: 'http://127.0.0.1:5001', Host: `127.0.0.1:${porta}` }, 'GET', '/api/musicas'],
      ['OBS no próprio servidor (origem pelo IP do servidor)', { Origin: `http://${ip}:5001`, Host: `127.0.0.1:${porta}` }, 'GET', '/api/musicas'],
      ['tela de projeção em file:// lendo a config (Electron: sem Origin, cross-site)', { 'Sec-Fetch-Site': 'cross-site', Host: `localhost:${porta}` }, 'GET', '/api/display-config'],
      ['janela de controle do servidor (file://, sem Origin) lendo monitores', { 'Sec-Fetch-Site': 'cross-site', Host: `127.0.0.1:${porta}` }, 'GET', '/api/monitores'],
      ['janela de Histórico (loadURL, POST com Origin do painel)', { Origin: 'http://127.0.0.1:3001', 'Sec-Fetch-Site': 'same-origin', Host: `127.0.0.1:${porta}` }, 'POST', '/api/historico/limpar'],
      ['janela de Histórico (loadURL, DELETE com Origin do painel)', { Origin: 'http://127.0.0.1:3001', 'Sec-Fetch-Site': 'same-origin', Host: `127.0.0.1:${porta}` }, 'DELETE', '/api/historico/1'],
    ];
    for (const [nome, headers, method, caminho] of clientes) {
      const r = await requisitar(porta, {
        method,
        caminho,
        headers,
        corpo: method === 'GET' || method === 'DELETE' ? undefined : { ok: 1 },
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
  const acesso = controleAcesso.criarControleAcesso({ opcoes: { inscricaoAutomatica: true },
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

test('Socket.IO: tela em file:// (Origin file://) conecta só como VISUALIZADOR e não se auto-inscreve (TOFU)', async () => {
  await comSocketIo(async ({ porta, conexoes, lerAllowlist }) => {
    const r = await conectarWs(porta, {
      headers: { Origin: 'file://' },
      auth: { deviceId: 'atacante-file', secret: 'x'.repeat(12) },
    });
    assert.strictEqual(r.aberto, true);
    assert.strictEqual(conexoes.length, 1);
    assert.strictEqual(conexoes[0].autorizado, false);
    assert.strictEqual(conexoes[0].motivo, 'origem-opaca');
    assert.deepStrictEqual(Object.keys(lerAllowlist().devices || {}), [], 'nenhum dispositivo pode ser inscrito por file://');
  });
});

test('Socket.IO: Origin null é recusada (WebSocket e polling), com ou sem credenciais', async () => {
  await comSocketIo(async ({ porta, conexoes, lerAllowlist }) => {
    const recusado = (r) => r.aberto === false && [400, 403].includes(r.status);
    const ws = await conectarWs(porta, { headers: { Origin: 'null' }, auth: { deviceId: 'atacante-null', secret: 'x'.repeat(12) } });
    assert.ok(recusado(ws), JSON.stringify(ws));
    const polling = await requisitar(porta, { caminho: '/socket.io/?EIO=4&transport=polling', headers: { Origin: 'null' } });
    assert.strictEqual(polling.status, 403);
    assert.strictEqual(polling.headers['access-control-allow-origin'], undefined);
    assert.strictEqual(conexoes.length, 0);
    assert.deepStrictEqual(Object.keys(lerAllowlist().devices || {}), []);
  });
});

test('Socket.IO: página de IP privado de TERCEIROS é recusada; a da própria máquina e o OBS conectam', async () => {
  await comSocketIo(async ({ porta, conexoes }) => {
    const recusado = (r) => r.aberto === false && [400, 403].includes(r.status);
    const terceiro = await conectarWs(porta, { headers: { Origin: `http://${IP_DE_TERCEIRO}:5001` } });
    assert.ok(recusado(terceiro), JSON.stringify(terceiro));
    const terceiroPolling = await requisitar(porta, { caminho: '/socket.io/?EIO=4&transport=polling', headers: { Origin: `http://${IP_DE_TERCEIRO}:3001` } });
    assert.strictEqual(terceiroPolling.status, 403);
    assert.strictEqual(conexoes.length, 0);
    const propria = await conectarWs(porta, { headers: { Origin: `http://${IP_DA_MAQUINA}:5001` } });
    assert.strictEqual(propria.aberto, true);
    const obsMesmoHost = await conectarWs(porta, { headers: { Origin: `http://${NOME_MAQUINA}:5001`, Host: `${NOME_MAQUINA}:${porta}` } });
    assert.strictEqual(obsMesmoHost.aberto, true);
    const polling = await requisitar(porta, { caminho: '/socket.io/?EIO=4&transport=polling', headers: { Origin: `http://${IP_DA_MAQUINA}:5001` } });
    assert.strictEqual(polling.status, 200);
    assert.strictEqual(polling.headers['access-control-allow-origin'], `http://${IP_DA_MAQUINA}:5001`);
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
    assert.strictEqual(nulo.status, 403);
    assert.strictEqual(nulo.headers['access-control-allow-origin'], undefined);
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

/* ─────────────── E1.3 Fase A: CORS com os cabeçalhos de credencial ─────────────── */

const CABECALHOS_LYRA = 'content-type,x-lyra-device,x-lyra-secret,x-lyra-app';

test('E1.3 CORS: preflight do painel aceita X-Lyra-Device/Secret/App e o método PATCH, sem "*"', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const pre = await requisitar(porta, {
        method: 'OPTIONS',
        caminho: '/api/musicas/1/rotulo',
        headers: {
          Origin: 'http://127.0.0.1:3001',
          'Access-Control-Request-Method': metodo,
          'Access-Control-Request-Headers': CABECALHOS_LYRA,
        },
      });
      assert.strictEqual(pre.status, 204, metodo);
      assert.strictEqual(pre.headers['access-control-allow-origin'], 'http://127.0.0.1:3001');
      assert.notStrictEqual(pre.headers['access-control-allow-origin'], '*');
      const permitidos = String(pre.headers['access-control-allow-headers']).toLowerCase().split(',').map((s) => s.trim());
      for (const h of CABECALHOS_LYRA.split(',')) assert.ok(permitidos.includes(h), `${h} deveria ser permitido`);
      assert.ok(String(pre.headers['access-control-allow-methods']).split(',').map((s) => s.trim()).includes(metodo), metodo);
    }
  });
});

test('E1.3 CORS: os novos cabeçalhos não abrem a API para origem externa, null, file:// nem Host de rebinding', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    const casos = [
      ['site externo', { Origin: 'https://evil.example' }],
      ['IP de terceiro na LAN', { Origin: `http://${IP_DE_TERCEIRO}:5510` }],
      ['Origin null', { Origin: 'null' }],
      ['file:// (só vale no Socket.IO)', { Origin: 'file://' }],
      ['Host de DNS rebinding', { Origin: 'http://127.0.0.1:3001', Host: 'rebind.attacker.com:3001' }],
    ];
    for (const [nome, extra] of casos) {
      const pre = await requisitar(porta, {
        method: 'OPTIONS',
        caminho: '/api/musicas',
        headers: { 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': CABECALHOS_LYRA, ...extra },
      });
      assert.strictEqual(pre.status, 403, nome);
      assert.strictEqual(pre.headers['access-control-allow-origin'], undefined, nome);
      assert.strictEqual(pre.headers['access-control-allow-headers'], undefined, nome);

      const real = await requisitar(porta, {
        method: 'PUT',
        caminho: '/api/display-config',
        headers: { 'X-Lyra-Device': 'd', 'X-Lyra-Secret': 's', ...extra },
        corpo: { a: 1 },
      });
      assert.strictEqual(real.status, 403, `${nome} (requisição real)`);
    }
    assert.strictEqual(execucoes.total, 0, 'nenhum handler executou');
  });
});

test('E1.3 CORS: requisição real do painel com os cabeçalhos passa e a resposta nunca usa "*"', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta }) => {
    const r = await requisitar(porta, {
      method: 'PUT',
      caminho: '/api/display-config',
      headers: { Origin: 'http://127.0.0.1:3001', 'X-Lyra-Device': 'd', 'X-Lyra-Secret': 's', 'X-Lyra-App': '1.3.0', 'Sec-Fetch-Site': 'same-site' },
      corpo: { a: 1 },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers['access-control-allow-origin'], 'http://127.0.0.1:3001');
  });
});

test('E1.3 CORS: escrita cross-site sem Origin continua recusada mesmo com credenciais', async () => {
  const p = novaProtecao();
  await comServidor((app) => app.use(p.middleware), async ({ porta, execucoes }) => {
    const r = await requisitar(porta, {
      method: 'POST',
      caminho: '/api/musicas',
      headers: { 'Sec-Fetch-Site': 'cross-site', 'X-Lyra-Device': 'd', 'X-Lyra-Secret': 's' },
      corpo: { a: 1 },
    });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(execucoes.total, 0);
  });
});
