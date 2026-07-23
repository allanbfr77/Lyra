'use strict';

const fs = require('fs');

const SYNC_SCHEMA_VERSION = 1;

function toIsoOrEmpty(value) {
  const txt = String(value || '').trim();
  if (!txt) return '';
  const ms = Date.parse(txt);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function compareUpdatedAt(a, b) {
  const ta = Date.parse(String(a || ''));
  const tb = Date.parse(String(b || ''));
  const va = Number.isFinite(ta) ? ta : 0;
  const vb = Number.isFinite(tb) ? tb : 0;
  return va === vb ? 0 : va > vb ? 1 : -1;
}

function cloneJsonSafe(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sanitizePlaylistValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePlaylistValue(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'versaoLocalId') continue;
    const next = sanitizePlaylistValue(raw);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

function normalizeMusicas(musicas) {
  if (!Array.isArray(musicas)) return [];
  const out = [];
  const ids = new Set();
  for (const raw of musicas) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const titulo = String(raw.titulo || '').trim();
    const artista = String(raw.artista || '').trim();
    const estrofes = Array.isArray(raw.estrofes)
      ? raw.estrofes.map((s) => String(s ?? '')).filter((s) => s.trim())
      : [];
    if (!titulo || !estrofes.length) continue;
    const idNum = Number(raw.id);
    const item = { titulo, artista, estrofes };
    if (Number.isFinite(idNum) && idNum > 0) {
      const id = Math.trunc(idNum);
      if (ids.has(id)) continue;
      ids.add(id);
      item.id = id;
    }
    out.push(item);
  }
  return out;
}

function normalizePlaylists(playlists) {
  const src = playlists && typeof playlists === 'object' && !Array.isArray(playlists) ? playlists : {};
  const out = {};
  for (const [cultoId, listaRaw] of Object.entries(src)) {
    const id = String(cultoId || '').trim();
    if (!id || !Array.isArray(listaRaw)) continue;
    out[id] = sanitizePlaylistValue(cloneJsonSafe(listaRaw));
  }
  return out;
}

function normalizeCultosManuais(cultosManuais) {
  if (!Array.isArray(cultosManuais)) return [];
  return cultosManuais
    .map((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const id = String(raw.id || '').trim();
      const label = String(raw.label || '').trim();
      if (!id || !label) return null;
      return { id, label };
    })
    .filter(Boolean);
}

function normalizeTemasPorCulto(temasPorCulto) {
  const src =
    temasPorCulto && typeof temasPorCulto === 'object' && !Array.isArray(temasPorCulto)
      ? temasPorCulto
      : {};
  const out = {};
  for (const [cultoId, lista] of Object.entries(src)) {
    const id = String(cultoId || '').trim();
    if (!id || !Array.isArray(lista)) continue;
    out[id] = lista
      .map((tema) => String(tema || '').trim())
      .filter(Boolean);
  }
  return out;
}

function normalizeAberturaRemovidaPorCulto(aberturaRemovidaPorCulto) {
  const src =
    aberturaRemovidaPorCulto &&
    typeof aberturaRemovidaPorCulto === 'object' &&
    !Array.isArray(aberturaRemovidaPorCulto)
      ? aberturaRemovidaPorCulto
      : {};
  const out = {};
  for (const [cultoId, flag] of Object.entries(src)) {
    const id = String(cultoId || '').trim();
    if (!id || !flag) continue;
    out[id] = true;
  }
  return out;
}

function normalizeSharedDbSnapshot(snapshot, opts = {}) {
  const src = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    updatedAt: toIsoOrEmpty(src.updatedAt) || toIsoOrEmpty(opts.fallbackUpdatedAt) || '',
    musicas: normalizeMusicas(src.musicas),
    playlists: normalizePlaylists(src.playlists),
    cultosManuais: normalizeCultosManuais(src.cultosManuais),
    temasPorCulto: normalizeTemasPorCulto(src.temasPorCulto),
    aberturaRemovidaPorCulto: normalizeAberturaRemovidaPorCulto(src.aberturaRemovidaPorCulto),
  };
}

function loadSharedDbSnapshot(sharedDbSyncPathFn) {
  try {
    const raw = fs.readFileSync(sharedDbSyncPathFn(), 'utf8');
    return normalizeSharedDbSnapshot(JSON.parse(raw));
  } catch (_) {
    return normalizeSharedDbSnapshot({});
  }
}

function saveSharedDbSnapshot(sharedDbSyncPathFn, snapshot, opts = {}) {
  const current = loadSharedDbSnapshot(sharedDbSyncPathFn);
  const normalized = normalizeSharedDbSnapshot(snapshot, {
    fallbackUpdatedAt: opts.fallbackUpdatedAt || new Date().toISOString(),
  });

  if (opts.respectUpdatedAt !== false && compareUpdatedAt(normalized.updatedAt, current.updatedAt) < 0) {
    return { saved: false, snapshot: current };
  }

  fs.writeFileSync(sharedDbSyncPathFn(), JSON.stringify(normalized, null, 2), 'utf8');
  return { saved: true, snapshot: normalized };
}

module.exports = {
  SYNC_SCHEMA_VERSION,
  compareUpdatedAt,
  loadSharedDbSnapshot,
  normalizeSharedDbSnapshot,
  saveSharedDbSnapshot,
};
