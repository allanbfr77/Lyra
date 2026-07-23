'use strict';

const fs = require('fs');

function toIsoOrEmpty(value) {
  const txt = String(value || '').trim();
  if (!txt) return '';
  const ms = Date.parse(txt);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
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

function normalizeSharedSyncMeta(input, opts = {}) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    updatedAt: toIsoOrEmpty(src.updatedAt) || toIsoOrEmpty(opts.fallbackUpdatedAt) || '',
    cultosManuais: normalizeCultosManuais(src.cultosManuais),
    temasPorCulto: normalizeTemasPorCulto(src.temasPorCulto),
    aberturaRemovidaPorCulto: normalizeAberturaRemovidaPorCulto(src.aberturaRemovidaPorCulto),
  };
}

function loadSharedSyncMeta(sharedSyncMetaPathFn) {
  try {
    const raw = fs.readFileSync(sharedSyncMetaPathFn(), 'utf8');
    return normalizeSharedSyncMeta(JSON.parse(raw));
  } catch (_) {
    return normalizeSharedSyncMeta({});
  }
}

function saveSharedSyncMeta(sharedSyncMetaPathFn, input, opts = {}) {
  const next = normalizeSharedSyncMeta(input, opts);
  fs.writeFileSync(sharedSyncMetaPathFn(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function touchSharedSyncMeta(sharedSyncMetaPathFn, patch = {}) {
  const atual = loadSharedSyncMeta(sharedSyncMetaPathFn);
  return saveSharedSyncMeta(
    sharedSyncMetaPathFn,
    {
      ...atual,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
    { fallbackUpdatedAt: new Date().toISOString() }
  );
}

module.exports = {
  loadSharedSyncMeta,
  normalizeSharedSyncMeta,
  saveSharedSyncMeta,
  touchSharedSyncMeta,
};
