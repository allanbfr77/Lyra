'use strict';

/**
 * E1.1 — segurança de `POST /api/tom-memoria/sync-invb` e `POST /api/tom-memoria/webhook-invb`.
 *
 * Cada teste descreve um risco real dessas rotas (SSRF por `cloudUrl`, URL de sync sem
 * validação, webhook aberto sem segredo) e, ao lado, o comportamento que NÃO pode mudar
 * (sync direto com o Supabase e sync por uma URL de nuvem válida).
 *
 * Nada aqui toca a rede nem o banco: o `fetch` global é trocado por um duplo que só
 * responde pelo Supabase e pelo host de nuvem de teste; a importação no banco é um duplo
 * registrado no `require.cache` ANTES de a rota ser carregada (ela destrutura no require).
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');

const dbReal = require('../db');
const importacoes = [];
require.cache[require.resolve('../db')].exports = {
  ...dbReal,
  importarTonsMemoriaDeArquivo: (payload) => {
    importacoes.push(payload);
    const n = Array.isArray(payload && payload.itens) ? payload.itens.length : 0;
    return { aplicados: n, pendentes: 0, ministrantesCriados: 0 };
  },
};

const aplicarPlaylistsPath = require.resolve('../lib/aplicarTonsImportPlaylists');
require(aplicarPlaylistsPath);
require.cache[aplicarPlaylistsPath].exports = {
  aplicarTonsImportNasPlaylists: () => ({ atualizadas: 0 }),
};

const { registrarRotasMinistrantes } = require('./ministrantes');

const fetchReal = globalThis.fetch;

const LINHAS_MUSICAS = [
  { id: 1, nome: 'Galileu', tom: 'G', ministrante: 'Cris', observacoes: '' },
  { id: 2, nome: 'Grande é o Senhor', tom: 'D', ministrante: 'Daniela', observacoes: '' },
];

/** Registro de toda tentativa de `fetch`, para provar o que foi (ou não) chamado. */
let tentativas = [];

function ehSupabase(host) {
  return host.endsWith('supabase.co');
}

/**
 * Substitui o `fetch` global.
 *  - Supabase: devolve linhas fixas (e histórico vazio).
 *  - `cloud`: host de nuvem de teste, atendido por `cloud.responder(url, init)`.
 *  - 127.0.0.1: passa para o `fetch` real (é o servidor "atacante" local do teste).
 *  - qualquer outro destino: não sai da máquina — rejeita, mas fica registrado.
 */
function instalarFetchFalso({ cloud } = {}) {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    let host = '';
    try {
      host = new URL(u).hostname;
    } catch (_) {
      host = '';
    }
    tentativas.push({ url: u, host, init });
    if (ehSupabase(host)) {
      const json = u.includes('/historico_louvores') ? [] : LINHAS_MUSICAS;
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (cloud && host === cloud.host) return cloud.responder(u, init);
    if (host === '127.0.0.1') return fetchReal(url, init);
    throw new Error(`destino bloqueado no teste: ${host || u}`);
  };
}

function tentativasForaDoSupabase() {
  return tentativas.filter((t) => !ehSupabase(t.host));
}

/** Servidor local que faz o papel do alvo/atacante: guarda o que recebe. */
async function subirAlvo() {
  const recebidas = [];
  const server = http.createServer((req, res) => {
    recebidas.push(`${req.method} ${req.url}`);
    res.statusCode = 500;
    res.end('SEGREDO-INTERNO-DO-ALVO');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    recebidas,
    fechar: () => new Promise((r) => server.close(r)),
  };
}

async function subirApp() {
  const app = express();
  app.use(express.json());
  registrarRotasMinistrantes(app, {
    paths: { playlistsJsonPath: 'nao-usado-nos-testes.json' },
    marcarBancoCompartilhadoAlterado: () => {},
  });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    fechar: () => new Promise((r) => server.close(r)),
  };
}

async function postar(base, caminho, corpo, headers = {}) {
  const res = await fetchReal(`${base}${caminho}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(corpo),
  });
  const texto = await res.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch (_) {
    json = null;
  }
  return { status: res.status, json, texto };
}

const ENV_CHAVES = [
  'INVB_SUPABASE_ANON_KEY',
  'INVB_SUPABASE_URL',
  'INVB_TONS_SYNC_URL',
  'INVB_TONS_SYNC_HOSTS',
  'LYRA_INVB_WEBHOOK_SECRET',
];
let envSalvo = {};

function prepararAmbiente(extra = {}) {
  envSalvo = {};
  for (const k of ENV_CHAVES) {
    envSalvo[k] = process.env[k];
    delete process.env[k];
  }
  process.env.INVB_SUPABASE_ANON_KEY = 'chave-de-teste';
  Object.assign(process.env, extra);
  tentativas = [];
  importacoes.length = 0;
}

function restaurarAmbiente() {
  for (const k of ENV_CHAVES) {
    if (envSalvo[k] === undefined) delete process.env[k];
    else process.env[k] = envSalvo[k];
  }
  globalThis.fetch = fetchReal;
}

async function comApp(fn, { cloud, env } = {}) {
  prepararAmbiente(env);
  instalarFetchFalso({ cloud });
  const app = await subirApp();
  try {
    await fn(app);
  } finally {
    await app.fechar();
    restaurarAmbiente();
  }
}

/* ─────────────────────────── SSRF por `cloudUrl` ─────────────────────────── */

test('SSRF: cloudUrl enviado pelo cliente não faz o controlador buscar essa URL', async () => {
  const alvo = await subirAlvo();
  try {
    await comApp(async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', {
        fonte: 'cloud',
        cloudUrl: alvo.base,
      });
      assert.deepStrictEqual(alvo.recebidas, [], 'o alvo não pode receber nenhuma requisição');
      assert.deepStrictEqual(tentativasForaDoSupabase(), []);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.origem, 'supabase');
    });
  } finally {
    await alvo.fechar();
  }
});

test('SSRF: o truque do "#" não vira leitura de URL arbitrária nem eco do corpo da resposta', async () => {
  const alvo = await subirAlvo();
  try {
    await comApp(async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', {
        fonte: 'cloud',
        cloudUrl: `${alvo.base}/admin/segredo#`,
      });
      assert.deepStrictEqual(alvo.recebidas, []);
      assert.ok(!r.texto.includes('SEGREDO-INTERNO-DO-ALVO'), 'o corpo do alvo não pode vazar na resposta');
    });
  } finally {
    await alvo.fechar();
  }
});

/* ───────────────── INVB_TONS_SYNC_URL: HTTPS e host permitido ───────────────── */

const URLS_INVALIDAS = [
  ['http (sem TLS)', 'http://invb-webhook-api.onrender.com'],
  ['host fora da lista', 'https://evil.example'],
  ['IP literal', 'https://127.0.0.1'],
  ['porta não padrão', 'https://invb-webhook-api.onrender.com:8443'],
  ['credenciais na URL', 'https://usuario:senha@invb-webhook-api.onrender.com'],
  ['query na URL', 'https://invb-webhook-api.onrender.com/api?x=1'],
  ['fragmento na URL', 'https://invb-webhook-api.onrender.com/#frag'],
  ['sufixo parecido (evilonrender.com)', 'https://evilonrender.com'],
  ['permitido só como prefixo', 'https://onrender.com.evil.example'],
  ['domínio raiz sem subdomínio', 'https://onrender.com'],
  ['URL malformada', 'isto-nao-e-uma-url'],
  /* Hosts exatos: subdomínios que NÃO foram cadastrados são recusados. */
  ['outro serviço do onrender.com', 'https://outro-servico.onrender.com'],
  ['serviço de compartilhamento (outro host)', 'https://invb-share-api.onrender.com'],
  ['subdomínio do domínio da igreja não cadastrado', 'https://tons.invbotafogo.com.br'],
  ['site da igreja não cadastrado', 'https://louvores.invbotafogo.com.br'],
  ['domínio raiz da igreja', 'https://invbotafogo.com.br'],
  ['subdomínio profundo do onrender.com', 'https://a.b.onrender.com'],
  ['subdomínio do host autorizado', 'https://x.invb-webhook-api.onrender.com'],
  ['host autorizado como prefixo de outro domínio', 'https://invb-webhook-api.onrender.com.evil.example'],
  ['host autorizado com ponto final', 'https://invb-webhook-api.onrender.com.'],
];

for (const [descricao, url] of URLS_INVALIDAS) {
  test(`INVB_TONS_SYNC_URL inválida é recusada sem nenhum fetch: ${descricao}`, async () => {
    await comApp(
      async (app) => {
        const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
        assert.deepStrictEqual(tentativasForaDoSupabase(), [], 'nenhum fetch pode sair para a URL inválida');
        assert.ok(r.status >= 400, `esperava erro, veio ${r.status}`);
        assert.match(String(r.json && r.json.erro), /INVB_TONS_SYNC_URL/);
        assert.deepStrictEqual(importacoes, []);
      },
      { env: { INVB_TONS_SYNC_URL: url } }
    );
  });
}

test('INVB_TONS_SYNC_URL apontando para 127.0.0.1 (alvo local) é recusada e o alvo não é chamado', async () => {
  const alvo = await subirAlvo();
  try {
    await comApp(
      async (app) => {
        const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
        assert.deepStrictEqual(alvo.recebidas, []);
        assert.ok(r.status >= 400);
      },
      { env: { INVB_TONS_SYNC_URL: alvo.base } }
    );
  } finally {
    await alvo.fechar();
  }
});

/* ─────────── Comportamento que precisa continuar igual (compatibilidade) ─────────── */

test('compatibilidade: sync direto com o Supabase (como o painel faz hoje) continua funcionando', async () => {
  await comApp(async (app) => {
    const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'supabase' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.origem, 'supabase');
    assert.strictEqual(importacoes.length, 1);
    const titulos = importacoes[0].itens.map((i) => i.titulo).sort();
    assert.deepStrictEqual(titulos, ['Galileu', 'Grande é o Senhor']);
    assert.strictEqual(r.json.aplicados, 2);
    const musicas = tentativas.find((t) => t.url.includes('/rest/v1/musicas'));
    assert.ok(musicas, 'a tabela musicas deve ser consultada');
    assert.strictEqual(musicas.init.headers.apikey, 'chave-de-teste');
    assert.strictEqual(tentativasForaDoSupabase().length, 0);
  });
});

test('compatibilidade: sem corpo e sem URL de nuvem o sync usa o Supabase', async () => {
  await comApp(async (app) => {
    const r = await postar(app.base, '/api/tom-memoria/sync-invb', {});
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.origem, 'supabase');
  });
});

test('compatibilidade: com INVB_TONS_SYNC_URL definida, pedir fonte "supabase" continua indo ao Supabase', async () => {
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'supabase' });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.origem, 'supabase');
      assert.strictEqual(tentativasForaDoSupabase().length, 0);
    },
    { env: { INVB_TONS_SYNC_URL: 'https://invb-webhook-api.onrender.com' } }
  );
});

function nuvemDeTeste(host, estado = {}) {
  return {
    host,
    responder: (url, init) => {
      estado.url = url;
      estado.init = init;
      if (estado.semMudanca) return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify({
          ok: true,
          updatedAt: '2026-01-02T00:00:00.000Z',
          itens: [{ titulo: 'Galileu', artista: '', tons: { Cris: 'G' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    },
  };
}

test('compatibilidade: URL de nuvem válida (HTTPS + host *.onrender.com) é usada como antes', async () => {
  const estado = {};
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', {
        fonte: 'cloud',
        since: '2026-01-01T00:00:00.000Z',
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.origem, 'cloud');
      assert.strictEqual(r.json.updatedAt, '2026-01-02T00:00:00.000Z');
      assert.strictEqual(
        estado.url,
        'https://invb-webhook-api.onrender.com/api/invb/tons-sync?since=2026-01-01T00%3A00%3A00.000Z'
      );
      assert.strictEqual(importacoes.length, 1);
    },
    {
      env: { INVB_TONS_SYNC_URL: 'https://invb-webhook-api.onrender.com/' },
      cloud: nuvemDeTeste('invb-webhook-api.onrender.com', estado),
    }
  );
});

test('compatibilidade: 204 da nuvem continua significando "sem mudança"', async () => {
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud', since: 'x' });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.semMudanca, true);
      assert.deepStrictEqual(importacoes, []);
    },
    {
      env: { INVB_TONS_SYNC_URL: 'https://invb-webhook-api.onrender.com' },
      cloud: nuvemDeTeste('invb-webhook-api.onrender.com', { semMudanca: true }),
    }
  );
});

test('host autorizado em maiúsculas e com barra final é aceito (nome de host não diferencia caixa)', async () => {
  const estado = {};
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.origem, 'cloud');
      assert.ok(estado.url.startsWith('https://invb-webhook-api.onrender.com/api/invb/tons-sync'));
    },
    {
      env: { INVB_TONS_SYNC_URL: 'https://INVB-WEBHOOK-API.ONRENDER.COM/' },
      cloud: nuvemDeTeste('invb-webhook-api.onrender.com', estado),
    }
  );
});

test('subdomínio do domínio da igreja não cadastrado é recusado, mesmo servindo a API', async () => {
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
      assert.ok(r.status >= 400);
      assert.match(String(r.json.erro), /INVB_TONS_SYNC_URL/);
      assert.deepStrictEqual(tentativasForaDoSupabase(), []);
    },
    {
      env: { INVB_TONS_SYNC_URL: 'https://tons.invbotafogo.com.br' },
      cloud: nuvemDeTeste('tons.invbotafogo.com.br', {}),
    }
  );
});

test('INVB_TONS_SYNC_HOSTS cadastra hosts exatos (aceita só eles, sem subdomínios nem curingas) e continua exigindo HTTPS', async () => {
  const estado = {};
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.origem, 'cloud');
    },
    {
      env: { INVB_TONS_SYNC_URL: 'https://tons.exemplo.org', INVB_TONS_SYNC_HOSTS: 'tons.exemplo.org' },
      cloud: nuvemDeTeste('tons.exemplo.org', estado),
    }
  );
  /* Lista com vários hosts, espaços e caixa diferente: o segundo cadastrado também vale. */
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.origem, 'cloud');
    },
    {
      env: {
        INVB_TONS_SYNC_URL: 'https://segundo.exemplo.org',
        INVB_TONS_SYNC_HOSTS: ' Tons.Exemplo.org ,  segundo.exemplo.org ',
      },
      cloud: nuvemDeTeste('segundo.exemplo.org', {}),
    }
  );
  /* Subdomínio de um host cadastrado NÃO é autorizado. */
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
      assert.ok(r.status >= 400);
      assert.deepStrictEqual(tentativasForaDoSupabase(), []);
    },
    {
      env: { INVB_TONS_SYNC_URL: 'https://x.tons.exemplo.org', INVB_TONS_SYNC_HOSTS: 'tons.exemplo.org' },
    }
  );
  /* Curinga na lista não vira "qualquer subdomínio". */
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
      assert.ok(r.status >= 400);
      assert.deepStrictEqual(tentativasForaDoSupabase(), []);
    },
    {
      env: { INVB_TONS_SYNC_URL: 'https://x.exemplo.org', INVB_TONS_SYNC_HOSTS: '*.exemplo.org' },
    }
  );
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
      assert.ok(r.status >= 400);
      assert.deepStrictEqual(tentativasForaDoSupabase(), []);
    },
    {
      env: { INVB_TONS_SYNC_URL: 'http://tons.exemplo.org', INVB_TONS_SYNC_HOSTS: 'tons.exemplo.org' },
    }
  );
});

test('o fetch para a nuvem não segue redirecionamentos (evita sair do host validado)', async () => {
  const estado = {};
  await comApp(
    async (app) => {
      await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
      assert.ok(estado.init, 'a nuvem deveria ter sido consultada');
      assert.strictEqual(estado.init.redirect, 'error');
    },
    {
      env: { INVB_TONS_SYNC_URL: 'https://invb-webhook-api.onrender.com' },
      cloud: nuvemDeTeste('invb-webhook-api.onrender.com', estado),
    }
  );
});

test('erro da nuvem não devolve o corpo da resposta remota ao cliente', async () => {
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/sync-invb', { fonte: 'cloud' });
      assert.ok(r.status >= 400);
      assert.ok(!r.texto.includes('CORPO-DE-ERRO-REMOTO'));
      assert.match(String(r.json.erro), /503/);
    },
    {
      env: { INVB_TONS_SYNC_URL: 'https://invb-webhook-api.onrender.com' },
      cloud: {
        host: 'invb-webhook-api.onrender.com',
        responder: () => new Response('CORPO-DE-ERRO-REMOTO', { status: 503 }),
      },
    }
  );
});

/* ─────────────────────────── Webhook local ─────────────────────────── */

const EVENTO_WEBHOOK = {
  type: 'INSERT',
  record: { id: 7, nome: 'Galileu', tom: 'G', ministrante: 'Cris', observacoes: '' },
};

test('webhook sem LYRA_INVB_WEBHOOK_SECRET configurado falha fechado (503) e não importa nada', async () => {
  await comApp(async (app) => {
    const r = await postar(app.base, '/api/tom-memoria/webhook-invb', EVENTO_WEBHOOK);
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.json.ok, false);
    assert.match(String(r.json.erro), /LYRA_INVB_WEBHOOK_SECRET/);
    assert.deepStrictEqual(importacoes, []);
  });
});

test('webhook sem LYRA_INVB_WEBHOOK_SECRET recusa até quando o cliente manda um segredo vazio', async () => {
  await comApp(async (app) => {
    const r = await postar(app.base, '/api/tom-memoria/webhook-invb', EVENTO_WEBHOOK, {
      'x-lyra-webhook-secret': '',
    });
    assert.strictEqual(r.status, 503);
    assert.deepStrictEqual(importacoes, []);
  });
});

test('webhook com segredo configurado: ausente ou errado → 401 e nada é importado', async () => {
  await comApp(
    async (app) => {
      const ausente = await postar(app.base, '/api/tom-memoria/webhook-invb', EVENTO_WEBHOOK);
      assert.strictEqual(ausente.status, 401);
      const errado = await postar(app.base, '/api/tom-memoria/webhook-invb', EVENTO_WEBHOOK, {
        'x-lyra-webhook-secret': 'segredo-errado',
      });
      assert.strictEqual(errado.status, 401);
      assert.deepStrictEqual(importacoes, []);
    },
    { env: { LYRA_INVB_WEBHOOK_SECRET: 'segredo-correto' } }
  );
});

test('webhook: segredos de tamanhos diferentes e prefixos do segredo real são recusados sem erro 500', async () => {
  await comApp(
    async (app) => {
      const tentativasDeSegredo = [
        'x',
        'segredo-corret',
        'segredo-correto-e-mais-longo',
        'SEGREDO-CORRETO',
        'é'.repeat(200),
      ];
      for (const s of tentativasDeSegredo) {
        const r = await postar(app.base, '/api/tom-memoria/webhook-invb', EVENTO_WEBHOOK, {
          'x-lyra-webhook-secret': s,
        });
        assert.ok(r.status === 401 || r.status === 400, `"${s.slice(0, 20)}" → ${r.status}`);
      }
      assert.deepStrictEqual(importacoes, []);
    },
    { env: { LYRA_INVB_WEBHOOK_SECRET: 'segredo-correto' } }
  );
});

test('webhook: segredo só vale no cabeçalho (não na query string)', async () => {
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/webhook-invb?secret=segredo-correto', EVENTO_WEBHOOK);
      assert.strictEqual(r.status, 401);
      assert.deepStrictEqual(importacoes, []);
    },
    { env: { LYRA_INVB_WEBHOOK_SECRET: 'segredo-correto' } }
  );
});

test('compatibilidade: webhook com o segredo correto continua importando o evento', async () => {
  await comApp(
    async (app) => {
      const r = await postar(app.base, '/api/tom-memoria/webhook-invb', EVENTO_WEBHOOK, {
        'x-lyra-webhook-secret': 'segredo-correto',
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ok, true);
      assert.strictEqual(importacoes.length, 1);
      assert.strictEqual(importacoes[0].origem, 'webhook');
      assert.strictEqual(importacoes[0].itens[0].titulo, 'Galileu');
    },
    { env: { LYRA_INVB_WEBHOOK_SECRET: 'segredo-correto' } }
  );
});

test('compatibilidade: evento sem par tom/ministrante válido continua sendo ignorado (200)', async () => {
  await comApp(
    async (app) => {
      const r = await postar(
        app.base,
        '/api/tom-memoria/webhook-invb',
        { type: 'INSERT', record: { id: 9, nome: 'Sem tom' } },
        { 'x-lyra-webhook-secret': 'segredo-correto' }
      );
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.ignorado, true);
      assert.deepStrictEqual(importacoes, []);
    },
    { env: { LYRA_INVB_WEBHOOK_SECRET: 'segredo-correto' } }
  );
});
