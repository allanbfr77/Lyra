'use strict';

const fs = require('fs');

function parseDisplayRouteIndex(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = typeof v === 'number' && Number.isFinite(v) ? v : parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n >= -1) return n;
  return fallback;
}

function normalizarRotaDisplay(obj) {
  return {
    publicoIndex: parseDisplayRouteIndex(obj?.publicoIndex, -1),
    ministranteIndex: parseDisplayRouteIndex(obj?.ministranteIndex, -1),
  };
}

function normalizarRoteamentoDual(data) {
  if (!data || typeof data !== 'object') {
    return {
      version: 2,
      slides: { publicoIndex: -1, ministranteIndex: -1 },
      apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    };
  }
  if (data.version === 2 && data.slides && data.apresentacao) {
    return {
      version: 2,
      slides: normalizarRotaDisplay(data.slides),
      apresentacao: normalizarRotaDisplay(data.apresentacao),
    };
  }
  const legacy = normalizarRotaDisplay(data);
  return {
    version: 2,
    slides: { ...legacy },
    apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
  };
}

function indicesJanelasProjecaoDeRoteamentoDual(dual) {
  const d = normalizarRoteamentoDual(dual);
  const s = d.slides;
  const a = d.apresentacao;
  return {
    publicoIndex: a.publicoIndex >= 0 ? a.publicoIndex : s.publicoIndex,
    ministranteIndex: a.ministranteIndex >= 0 ? a.ministranteIndex : s.ministranteIndex,
  };
}

/**
 * @param {() => string} displayRoutingPathFn
 */
function loadDisplayRouting(displayRoutingPathFn) {
  try {
    const raw = fs.readFileSync(displayRoutingPathFn(), 'utf8');
    const data = JSON.parse(raw);
    return normalizarRoteamentoDual(data);
  } catch (_) {
  // intencional — erro ignorado
}
  return normalizarRoteamentoDual(null);
}

/**
 * @param {() => string} displayRoutingPathFn
 * @param {object} body
 */
function saveDisplayRouting(displayRoutingPathFn, body) {
  const atual = loadDisplayRouting(displayRoutingPathFn);
  const b = body && typeof body === 'object' ? body : {};
  let next;
  if (b.version === 2 && b.slides && b.apresentacao) {
    next = normalizarRoteamentoDual(b);
  } else if (b.publicoIndex !== undefined || b.ministranteIndex !== undefined) {
    next = {
      version: 2,
      slides: normalizarRotaDisplay(b),
      apresentacao: { ...atual.apresentacao },
    };
  } else {
    next = atual;
  }
  fs.writeFileSync(displayRoutingPathFn(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = {
  parseDisplayRouteIndex,
  normalizarRotaDisplay,
  normalizarRoteamentoDual,
  indicesJanelasProjecaoDeRoteamentoDual,
  loadDisplayRouting,
  saveDisplayRouting,
};
