'use strict';

const comentariosSlide = require('./comentariosSlide');

function clonePayloadSafe(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (_) {
    return obj;
  }
}

/**
 * @param {object} baseEstado
 * @param {object | null} estadoPublicoOverride
 */
function filtrarEstadoMusicaParaPublico(estado) {
  if (!estado || estado.tipo !== 'musica' || typeof estado !== 'object') return estado;
  const out = { ...estado };
  if (Array.isArray(out.linhas)) {
    out.linhas = comentariosSlide.filtrarLinhasParaPublico(out.linhas);
  }
  if (Array.isArray(out.linhasProximo)) {
    out.linhasProximo = comentariosSlide.filtrarLinhasParaPublico(out.linhasProximo);
  }
  return out;
}

function payloadPublicoAtual(baseEstado, estadoPublicoOverride) {
  let base = clonePayloadSafe(baseEstado);
  base = filtrarEstadoMusicaParaPublico(base);
  if (!estadoPublicoOverride) return base;
  const over = clonePayloadSafe(estadoPublicoOverride);
  const overFiltrado = filtrarEstadoMusicaParaPublico(over);
  if (base && typeof base === 'object') {
    overFiltrado.blackout = !!base.blackout;
  }
  return overFiltrado;
}

/**
 * @param {object} estadoAtual
 * @param {object | null} estadoPublicoOverride
 * @param {object | null} ministranteApresentacaoOverride
 */
function estadoPublicoParaSocketsOuApi(estadoAtual, estadoPublicoOverride, ministranteApresentacaoOverride) {
  const out = payloadPublicoAtual(estadoAtual, estadoPublicoOverride);
  if (out && typeof out === 'object') {
    out.projecaoMinistranteApresentacao = !!ministranteApresentacaoOverride;
  }
  return out;
}

function linhasProximoParaMusica(estrofes, idxEstrofe) {
  const n = Array.isArray(estrofes) ? estrofes.length : 0;
  const out = { linhasProximo: [], proximoSlidePreto: false };
  if (n === 0 || idxEstrofe < 0 || idxEstrofe > n) return out;
  if (idxEstrofe === n) return out;
  if (idxEstrofe === n - 1) {
    out.proximoSlidePreto = true;
    return out;
  }
  const prox = estrofes[idxEstrofe + 1];
  if (prox != null && prox !== '') {
    out.linhasProximo = comentariosSlide.filtrarLinhasParaPublico(String(prox).split('\n'));
  }
  return out;
}

function estadoMinistranteFromEstadoAtual(ex) {
  if (!ex || ex.telaLimpa) {
    return { titulo: '', atual: '', proximo: '', telaLimpa: true };
  }
  if (ex.tipo === 'biblia') {
    const atual = Array.isArray(ex.linhas) ? ex.linhas.join('\n') : '';
    return { titulo: ex.titulo || '', atual, proximo: '', telaLimpa: false };
  }
  if (ex.tipo === 'musica') {
    const titulo = ex.titulo || '';
    let atual = '';
    if (ex.slidePretoFinal) atual = '';
    else if (Array.isArray(ex.linhas)) atual = ex.linhas.join('\n');
    let proximo = '';
    if (ex.proximoSlidePreto) proximo = '';
    else if (Array.isArray(ex.linhasProximo)) proximo = ex.linhasProximo.join('\n');
    return { titulo, atual, proximo, telaLimpa: false };
  }
  return { titulo: '', atual: '', proximo: '', telaLimpa: true };
}

function payloadMinistranteMusicaFromEstrofes(estrofes, idxEstrofe, tituloMusica) {
  const n = Array.isArray(estrofes) ? estrofes.length : 0;
  const idx = Number(idxEstrofe);
  if (!Number.isFinite(idx) || idx < 0 || idx > n) {
    return { titulo: '', atual: '', proximo: '', telaLimpa: true };
  }
  if (idx === n) {
    return { titulo: tituloMusica || '', atual: '', proximo: '', telaLimpa: false };
  }
  const atualStr = estrofes[idx] != null ? String(estrofes[idx]) : '';
  let proximoStr = '';
  if (idx < n - 1) {
    const nxt = estrofes[idx + 1];
    proximoStr = nxt != null ? String(nxt) : '';
  }
  return { titulo: tituloMusica || '', atual: atualStr, proximo: proximoStr, telaLimpa: false };
}

/**
 * @param {object} estadoAtual
 * @param {(ctx: string, err: unknown) => void} logError
 */
function estadoPublicoOcioso() {
  return {
    tipo: null,
    titulo: '',
    linhas: [],
    linhasProximo: [],
    proximoSlidePreto: false,
    estrofeIndex: 0,
    totalEstrofes: 0,
    telaLimpa: true,
    blackout: false,
    slidePretoFinal: false,
  };
}

function snapshotMinistranteAtual(estadoAtual, logError) {
  try {
    const ex = estadoAtual;
    if (!ex || ex.telaLimpa) {
      return { titulo: '', atual: '', proximo: '', telaLimpa: true };
    }
    if (ex.tipo === 'biblia') {
      return estadoMinistranteFromEstadoAtual(ex);
    }
    if (ex.tipo === 'musica') {
      const estrofes = ex.estrofes || [];
      return payloadMinistranteMusicaFromEstrofes(estrofes, ex.estrofeIndex, ex.titulo);
    }
  } catch (e) {
    logError('snapshotMinistranteAtual', e);
  }
  return estadoMinistranteFromEstadoAtual(estadoAtual);
}

module.exports = {
  clonePayloadSafe,
  payloadPublicoAtual,
  estadoPublicoParaSocketsOuApi,
  estadoPublicoOcioso,
  linhasProximoParaMusica,
  estadoMinistranteFromEstadoAtual,
  payloadMinistranteMusicaFromEstrofes,
  snapshotMinistranteAtual,
};
