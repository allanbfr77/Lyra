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
      contagem: { publicoIndex: -1, ministranteIndex: -1 },
    };
  }
  if (data.version === 2 && data.slides && data.apresentacao) {
    return {
      version: 2,
      slides: normalizarRotaDisplay(data.slides),
      apresentacao: normalizarRotaDisplay(data.apresentacao),
      /* Pin exclusivo do Contador — independente de slides/Bíblia/Mídias. */
      contagem: normalizarRotaDisplay(data.contagem),
    };
  }
  const legacy = normalizarRotaDisplay(data);
  return {
    version: 2,
    slides: { ...legacy },
    apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    contagem: { publicoIndex: -1, ministranteIndex: -1 },
  };
}

/**
 * Índices efectivos das janelas de projeção.
 *
 * Com pin de Contagem activo, o Contador fica no seu monitor e a Bíblia/Mídias no
 * delas — sem um comer o outro. Sem pin, mantém-se a regra antiga (apresentação
 * substitui o slide no mesmo canal).
 */
function indicesJanelasProjecaoDeRoteamentoDual(dual) {
  const d = normalizarRoteamentoDual(dual);
  const s = d.slides;
  const a = d.apresentacao;
  const c = d.contagem;

  if (c.publicoIndex >= 0 || c.ministranteIndex >= 0) {
    let publicoIndex = c.publicoIndex >= 0 ? c.publicoIndex : s.publicoIndex;
    let ministranteIndex = c.ministranteIndex >= 0 ? c.ministranteIndex : -1;

    /* Bíblia/Mídias noutro monitor físico: manter essa janela aberta. Se a Contagem
       não reclamou o canal do ministrante («só telão»), usa-o para o outro modo. */
    if (c.ministranteIndex < 0) {
      const outroPub = a.publicoIndex;
      const outroMin = a.ministranteIndex;
      if (outroPub >= 0 && outroPub !== publicoIndex) {
        ministranteIndex = outroPub;
      } else if (outroMin >= 0 && outroMin !== publicoIndex) {
        ministranteIndex = outroMin;
      } else if (
        ministranteIndex < 0 &&
        s.ministranteIndex >= 0 &&
        s.ministranteIndex !== publicoIndex
      ) {
        ministranteIndex = s.ministranteIndex;
      }
    }

    /* Sem pin no público da Contagem mas com pin no ministrante (raro): público segue
       a regra clássica, ministrante fica com a Contagem. */
    if (c.publicoIndex < 0) {
      publicoIndex = a.publicoIndex >= 0 ? a.publicoIndex : s.publicoIndex;
      ministranteIndex = c.ministranteIndex;
    }

    return { publicoIndex, ministranteIndex };
  }

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
    /* PUT sem `contagem` não apaga o pin — senão mudar a Bíblia derrubava o Contador. */
    if (!b.contagem) next.contagem = { ...atual.contagem };
  } else if (b.publicoIndex !== undefined || b.ministranteIndex !== undefined) {
    next = {
      version: 2,
      slides: normalizarRotaDisplay(b),
      apresentacao: { ...atual.apresentacao },
      contagem: { ...atual.contagem },
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
