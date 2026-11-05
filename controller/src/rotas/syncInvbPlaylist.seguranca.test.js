'use strict';

/**
 * E1.1 — a rota de depuração `GET /api/sync-invb-playlist/debug` (marcada no código como
 * "DEBUG TEMPORÁRIO — remover") não pode existir: ela consultava a tabela `cultos` do
 * Supabase com a chave embutida e devolvia o conteúdo para qualquer cliente da rede.
 *
 * As demais rotas de sync de playlist continuam registradas — o segundo teste garante
 * que a remoção não levou nada junto.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');

const { registrarRotasSyncInvbPlaylist } = require('./syncInvbPlaylist');

const fetchReal = globalThis.fetch;

async function comApp(fn) {
  const salvo = process.env.INVB_SUPABASE_ANON_KEY;
  process.env.INVB_SUPABASE_ANON_KEY = 'chave-de-teste';
  const chamadasSupabase = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (new URL(u).hostname.endsWith('supabase.co')) {
      chamadasSupabase.push(u);
      return new Response(
        JSON.stringify([{ tipo: 'domingo', louvores: 'LOUVOR-CONFIDENCIAL-DO-CULTO' }]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return fetchReal(url, init);
  };
  const app = express();
  app.use(express.json());
  const avisoOriginal = console.warn;
  console.warn = () => {};
  try {
    registrarRotasSyncInvbPlaylist(app, {
      db: {},
      marcarBancoCompartilhadoAlterado: () => {},
      notificarBancoCompartilhadoAlterado: () => {},
      paths: { playlistsJsonPath: 'nao-usado-nos-testes.json' },
    });
  } finally {
    console.warn = avisoOriginal;
  }
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ base, chamadasSupabase });
  } finally {
    await new Promise((r) => server.close(r));
    globalThis.fetch = fetchReal;
    if (salvo === undefined) delete process.env.INVB_SUPABASE_ANON_KEY;
    else process.env.INVB_SUPABASE_ANON_KEY = salvo;
  }
}

test('GET /api/sync-invb-playlist/debug não existe mais e não consulta o Supabase', async () => {
  await comApp(async ({ base, chamadasSupabase }) => {
    const res = await fetchReal(`${base}/api/sync-invb-playlist/debug`);
    const texto = await res.text();
    assert.strictEqual(res.status, 404);
    assert.ok(!texto.includes('LOUVOR-CONFIDENCIAL-DO-CULTO'));
    assert.ok(!texto.includes('louvores_preview'));
    assert.deepStrictEqual(chamadasSupabase, []);
  });
});

test('compatibilidade: as rotas reais de sync de playlist continuam registradas', async () => {
  await comApp(async ({ base }) => {
    // Corpo inválido: a rota existe e responde por si (não é o 404 do Express).
    const aplicar = await fetchReal(`${base}/api/sync-invb-playlist/aplicar-versoes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ escolhas: [] }),
    });
    assert.notStrictEqual(aplicar.status, 404);
    const sync = await fetchReal(`${base}/api/sync-invb-playlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.notStrictEqual(sync.status, 404);
  });
});
