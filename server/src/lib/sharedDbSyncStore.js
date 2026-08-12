'use strict';

const fs = require('fs');

const SYNC_SCHEMA_VERSION = 3;

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

/**
 * Preserva `versaoLocalId` numérico (cópia no SQLite). Remove só IDs legados `c_*`
 * de localStorage, que não existem na outra máquina.
 */
function sanitizePlaylistValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePlaylistValue(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'versaoLocalId') {
      const vid = raw != null ? String(raw).trim() : '';
      if (!vid || vid.startsWith('c_')) continue;
      const n = Number(vid);
      if (!Number.isFinite(n) || n <= 0) continue;
      out[key] = String(Math.trunc(n));
      continue;
    }
    const next = sanitizePlaylistValue(raw);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

/**
 * Normaliza músicas do snapshot preservando originais e cópias/versões
 * (`parent_id`, `root_id`, `is_immutable`, `rotulo`). Snapshots antigos sem
 * lineage continuam sendo tratados como originais.
 */
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
    const hasId = Number.isFinite(idNum) && idNum > 0;
    const id = hasId ? Math.trunc(idNum) : null;
    if (hasId && ids.has(id)) continue;

    const parentRaw = raw.parent_id;
    const parentNum = parentRaw == null || parentRaw === '' ? null : Number(parentRaw);
    const parent_id =
      parentNum != null && Number.isFinite(parentNum) && parentNum > 0 ? Math.trunc(parentNum) : null;

    if (parent_id != null && !hasId) continue;

    let is_immutable;
    if (parent_id != null) {
      is_immutable = 0;
    } else if (raw.is_immutable != null && raw.is_immutable !== '') {
      is_immutable = Number(raw.is_immutable) === 1 ? 1 : 0;
    } else {
      is_immutable = 1;
    }

    const rootRaw = raw.root_id;
    const rootNum = rootRaw == null || rootRaw === '' ? null : Number(rootRaw);
    let root_id =
      rootNum != null && Number.isFinite(rootNum) && rootNum > 0 ? Math.trunc(rootNum) : null;
    if (root_id == null) {
      if (parent_id == null && hasId) root_id = id;
      else if (parent_id != null) root_id = parent_id;
    }

    const rotulo = raw.rotulo != null ? String(raw.rotulo).trim().slice(0, 40) : '';

    const item = {
      titulo,
      artista,
      estrofes,
      parent_id,
      root_id,
      is_immutable,
      rotulo,
    };
    if (hasId) {
      ids.add(id);
      item.id = id;
      if (parent_id == null) item.root_id = id;
    }
    out.push(item);
  }

  out.sort((a, b) => {
    const aOrig = a.parent_id == null ? 0 : 1;
    const bOrig = b.parent_id == null ? 0 : 1;
    if (aOrig !== bOrig) return aOrig - bOrig;
    const aId = Number.isFinite(a.id) ? a.id : Number.MAX_SAFE_INTEGER;
    const bId = Number.isFinite(b.id) ? b.id : Number.MAX_SAFE_INTEGER;
    return aId - bId;
  });
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

const TONS_SYNC_VALIDOS = new Set([
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm',
  'ORIG.',
]);

function normalizeMinistrantes(ministrantes) {
  if (!Array.isArray(ministrantes)) return [];
  const out = [];
  const ids = new Set();
  const nomes = new Set();
  for (const raw of ministrantes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const idNum = Number(raw.id);
    const id = Number.isFinite(idNum) && idNum > 0 ? Math.trunc(idNum) : null;
    const nome = String(raw.nome || '').trim();
    if (!id || !nome || ids.has(id)) continue;
    const nomeKey = nome.toLocaleLowerCase('pt-BR');
    if (nomeKey === 'todos' || nomeKey === 'todas' || nomes.has(nomeKey)) continue;
    ids.add(id);
    nomes.add(nomeKey);
    out.push({ id, nome: nome.slice(0, 80) });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

function normalizeTomMemoria(itens) {
  if (!Array.isArray(itens)) return [];
  const out = [];
  const chaves = new Set();
  for (const raw of itens) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const ministranteId = Number(raw.ministranteId ?? raw.ministrante_id);
    const musicaId = Number(raw.musicaId ?? raw.musica_id);
    if (!Number.isFinite(ministranteId) || ministranteId <= 0) continue;
    if (!Number.isFinite(musicaId) || musicaId <= 0) continue;
    const bancoFonte = raw.bancoFonte === 'catalog' || raw.banco_fonte === 'catalog' || raw.fonte === 'catalog'
      ? 'catalog'
      : 'user';
    let tom = String(raw.tom || '').trim();
    if (/^orig\.?$/i.test(tom)) tom = 'ORIG.';
    if (!TONS_SYNC_VALIDOS.has(tom)) continue;
    const mid = Math.trunc(ministranteId);
    const uid = Math.trunc(musicaId);
    const chave = `${mid}|${uid}|${bancoFonte}`;
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    out.push({ ministranteId: mid, musicaId: uid, bancoFonte, tom });
  }
  out.sort((a, b) => {
    if (a.ministranteId !== b.ministranteId) return a.ministranteId - b.ministranteId;
    if (a.musicaId !== b.musicaId) return a.musicaId - b.musicaId;
    return a.bancoFonte.localeCompare(b.bancoFonte);
  });
  return out;
}

function normalizeTomPadrao(itens) {
  if (!Array.isArray(itens)) return [];
  const out = [];
  const chaves = new Set();
  for (const raw of itens) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const musicaId = Number(raw.musicaId ?? raw.musica_id);
    if (!Number.isFinite(musicaId) || musicaId <= 0) continue;
    const bancoFonte =
      raw.bancoFonte === 'catalog' || raw.banco_fonte === 'catalog' || raw.fonte === 'catalog'
        ? 'catalog'
        : 'user';
    let tom = String(raw.tom || '').trim();
    if (/^orig\.?$/i.test(tom)) tom = 'ORIG.';
    if (!TONS_SYNC_VALIDOS.has(tom)) continue;
    const uid = Math.trunc(musicaId);
    const chave = `${uid}|${bancoFonte}`;
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    out.push({ musicaId: uid, bancoFonte, tom });
  }
  out.sort((a, b) => {
    if (a.musicaId !== b.musicaId) return a.musicaId - b.musicaId;
    return a.bancoFonte.localeCompare(b.bancoFonte);
  });
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
  const out = {
    schemaVersion: SYNC_SCHEMA_VERSION,
    updatedAt: toIsoOrEmpty(src.updatedAt) || toIsoOrEmpty(opts.fallbackUpdatedAt) || '',
    musicas: normalizeMusicas(src.musicas),
    playlists: normalizePlaylists(src.playlists),
    cultosManuais: normalizeCultosManuais(src.cultosManuais),
    temasPorCulto: normalizeTemasPorCulto(src.temasPorCulto),
    aberturaRemovidaPorCulto: normalizeAberturaRemovidaPorCulto(src.aberturaRemovidaPorCulto),
  };
  if (Array.isArray(src.ministrantes)) {
    out.ministrantes = normalizeMinistrantes(src.ministrantes);
    out.tomMemoria = normalizeTomMemoria(src.tomMemoria);
    out.tomPadrao = normalizeTomPadrao(src.tomPadrao);
  }
  return out;
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
  normalizeMusicas,
  normalizePlaylists,
  normalizeMinistrantes,
  normalizeTomMemoria,
  normalizeTomPadrao,
  sanitizePlaylistValue,
  saveSharedDbSnapshot,
};
