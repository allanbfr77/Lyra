'use strict';

/**
 * API pública para o webhook do Supabase (Tom Louvores → Lyra).
 *
 * Deploy (Render/etc.):
 *   cd services/invb-webhook-api && npm install && npm start
 * Env:
 *   PORT=10000
 *   LYRA_INVB_WEBHOOK_SECRET=senha-forte
 *   INVB_SUPABASE_URL=... (opcional)
 *   INVB_SUPABASE_ANON_KEY=... (opcional)
 *
 * No Supabase, aponte o trigger para:
 *   POST https://SEU-HOST/api/invb/musicas-webhook
 *   Header: x-lyra-webhook-secret: <mesma senha>
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  payloadImportFromMusicaRows,
  payloadImportFromWebhookBody,
  fetchMusicasFromSupabase,
  fetchHistoricoFromSupabase,
  itemImportFromMusicaRow,
} = require('../../controller/src/lib/invbTonsFromSupabase');

const PORT = Number(process.env.PORT || 10000);
const SECRET = String(process.env.LYRA_INVB_WEBHOOK_SECRET || '').trim();
const DATA_DIR = process.env.INVB_SYNC_DATA_DIR
  ? String(process.env.INVB_SYNC_DATA_DIR)
  : path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'tons-store.json');

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (!raw || typeof raw !== 'object') throw new Error('store inválido');
    return {
      updatedAt: String(raw.updatedAt || ''),
      byId: raw.byId && typeof raw.byId === 'object' ? raw.byId : {},
      lastEventAt: String(raw.lastEventAt || ''),
      lastEventType: String(raw.lastEventType || ''),
    };
  } catch (_) {
    return { updatedAt: '', byId: {}, lastEventAt: '', lastEventType: '' };
  }
}

function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function rowsFromStore(store) {
  return Object.values(store.byId || {}).filter((r) => r && typeof r === 'object');
}

function authWebhook(req, res, next) {
  if (!SECRET) {
    /* Sem secret configurado: aceita (útil em teste). Em produção defina LYRA_INVB_WEBHOOK_SECRET. */
    return next();
  }
  const got = String(req.get('x-lyra-webhook-secret') || req.query.secret || '').trim();
  if (got !== SECRET) {
    return res.status(401).json({ ok: false, erro: 'secret inválido' });
  }
  return next();
}

async function ensureStoreHydrated(store) {
  if (Object.keys(store.byId).length) return store;
  const rows = await fetchMusicasFromSupabase();
  const byId = {};
  for (const row of rows) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    byId[id] = row;
  }
  store.byId = byId;
  store.updatedAt = new Date().toISOString();
  saveStore(store);
  return store;
}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'invb-webhook-api' });
});

/**
 * Webhook Supabase (INSERT/UPDATE em musicas).
 */
app.post('/api/invb/musicas-webhook', authWebhook, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const store = loadStore();
    const tipo = String(body.type || '').toUpperCase();
    const record = body.record && typeof body.record === 'object' ? body.record : null;
    const old = body.old_record && typeof body.old_record === 'object' ? body.old_record : null;
    const id = String((record && record.id) || (old && old.id) || '').trim();

    if (tipo === 'DELETE' && id) {
      delete store.byId[id];
    } else if (record && id) {
      store.byId[id] = record;
    }

    store.updatedAt = new Date().toISOString();
    store.lastEventAt = store.updatedAt;
    store.lastEventType = tipo || 'UNKNOWN';
    saveStore(store);

    const historico = await fetchHistoricoFromSupabase().catch(() => []);
    const payload = payloadImportFromWebhookBody(body, historico);
    res.json({
      ok: true,
      updatedAt: store.updatedAt,
      itensNoEvento: Array.isArray(payload.itens) ? payload.itens.length : 0,
      totalNoStore: Object.keys(store.byId).length,
      preview: payload.itens && payload.itens[0] ? payload.itens[0] : null,
    });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message || String(e) });
  }
});

/**
 * Controladores Lyra puxam o snapshot normalizado de tons.
 * Query: ?since=ISO — se nada mudou, 204.
 */
app.get('/api/invb/tons-sync', async (req, res) => {
  try {
    let store = loadStore();
    store = await ensureStoreHydrated(store);
    const since = String(req.query.since || '').trim();
    if (since && store.updatedAt && Date.parse(store.updatedAt) <= Date.parse(since)) {
      return res.status(204).end();
    }
    const historico = await fetchHistoricoFromSupabase().catch(() => []);
    const payload = payloadImportFromMusicaRows(rowsFromStore(store), historico);
    res.json({
      ok: true,
      updatedAt: store.updatedAt,
      lastEventAt: store.lastEventAt,
      lastEventType: store.lastEventType,
      totalMusicas: Object.keys(store.byId).length,
      ...payload,
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({ ok: false, erro: e.message || String(e) });
  }
});

/**
 * Força re-hidratar do Supabase (útil após deploy com disco vazio).
 */
app.post('/api/invb/tons-refresh', authWebhook, async (req, res) => {
  try {
    const rows = await fetchMusicasFromSupabase();
    const byId = {};
    for (const row of rows) {
      const id = String(row.id || '').trim();
      if (!id) continue;
      byId[id] = row;
    }
    const store = {
      updatedAt: new Date().toISOString(),
      byId,
      lastEventAt: new Date().toISOString(),
      lastEventType: 'REFRESH',
    };
    saveStore(store);
    const comTom = rows.filter((r) => itemImportFromMusicaRow(r)).length;
    res.json({ ok: true, updatedAt: store.updatedAt, total: rows.length, comTom });
  } catch (e) {
    res.status(e.statusCode || 500).json({ ok: false, erro: e.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[invb-webhook-api] http://0.0.0.0:${PORT}`);
  if (!SECRET) {
    console.warn('[invb-webhook-api] LYRA_INVB_WEBHOOK_SECRET não definido — webhook aberto.');
  }
});
