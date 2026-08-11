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
    const tom = ex.tom || '';
    if (ex.slidePretoFinal) {
      return {
        titulo,
        atual: '',
        proximo: '',
        telaLimpa: false,
        slidePretoFinal: true,
        aberturaMusica: false,
      };
    }
    if (Array.isArray(ex.estrofes) && ex.estrofes.length) {
      return payloadMinistranteMusicaFromEstrofes(ex.estrofes, ex.estrofeIndex, titulo, tom);
    }
    /* Fallback sem estrofes: no 1.º slide, só 2 linhas do próximo. */
    let atual = Array.isArray(ex.linhas) ? ex.linhas.join('\n') : '';
    let proximo = '';
    if (!ex.proximoSlidePreto && Array.isArray(ex.linhasProximo) && ex.linhasProximo.length) {
      proximo = primeirasLinhasEstrofeMinistrante(ex.linhasProximo.join('\n'), 2);
    }
    const aberturaMusica = Number(ex.estrofeIndex) === 0;
    if (!aberturaMusica && Array.isArray(ex.linhasProximo)) {
      proximo = ex.proximoSlidePreto ? '' : ex.linhasProximo.join('\n');
    }
    return {
      titulo: aberturaMusica ? formatarTituloAberturaComTom(titulo, tom) : titulo,
      atual,
      proximo,
      telaLimpa: false,
      slidePretoFinal: false,
      aberturaMusica,
    };
  }
  return { titulo: '', atual: '', proximo: '', telaLimpa: true };
}

/** Primeiras N linhas de uma estrofe (para prévia do próximo no slide 1 do M3). */
function primeirasLinhasEstrofeMinistrante(texto, n = 2) {
  const max = Math.max(0, Number(n) || 0);
  const lines = String(texto ?? '').split(/\r\n|\r|\n/);
  if (lines.length <= max) return String(texto ?? '');
  return lines.slice(0, max).join('\n');
}

/** Título do 1.º slide do M3: «[ Título / Tom ]» se houver tom; senão só o título. */
function formatarTituloAberturaComTom(tituloMusica, tomMusica) {
  const tit = String(tituloMusica || '').trim();
  const tom = String(tomMusica || '').trim();
  if (!tit) return tom ? `[ ${tom} ]` : '';
  if (!tom) return tit;
  return `[ ${tit} / ${tom} ]`;
}

/**
 * Payload M3 (ministrante) a partir das estrofes.
 * Slide 1: título (+ tom, se houver) no topo (aberturaMusica) + slide atual + só 2 linhas do próximo.
 * A partir do 2.º: atual + próximo completo.
 */
function payloadMinistranteMusicaFromEstrofes(estrofes, idxEstrofe, tituloMusica, tomMusica) {
  const n = Array.isArray(estrofes) ? estrofes.length : 0;
  const idx = Number(idxEstrofe);
  if (!Number.isFinite(idx) || idx < 0 || idx > n) {
    return { titulo: '', atual: '', proximo: '', telaLimpa: true, aberturaMusica: false };
  }
  const tituloBase = tituloMusica || '';
  const titulo =
    idx === 0 ? formatarTituloAberturaComTom(tituloBase, tomMusica) : tituloBase;
  if (idx === n) {
    return {
      titulo: tituloBase,
      atual: '',
      proximo: '',
      telaLimpa: false,
      slidePretoFinal: true,
      aberturaMusica: false,
    };
  }
  const atualStr = estrofes[idx] != null ? String(estrofes[idx]) : '';
  let proximoStr = '';
  if (idx < n - 1) {
    const nxt = estrofes[idx + 1];
    const nxtStr = nxt != null ? String(nxt) : '';
    /* No 1.º slide: só as 2 primeiras linhas do próximo (não o slide inteiro). */
    proximoStr = idx === 0 ? primeirasLinhasEstrofeMinistrante(nxtStr, 2) : nxtStr;
  }
  return {
    titulo,
    atual: atualStr,
    proximo: proximoStr,
    telaLimpa: false,
    aberturaMusica: idx === 0,
  };
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
      return payloadMinistranteMusicaFromEstrofes(estrofes, ex.estrofeIndex, ex.titulo, ex.tom);
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
  primeirasLinhasEstrofeMinistrante,
  formatarTituloAberturaComTom,
  payloadMinistranteMusicaFromEstrofes,
  snapshotMinistranteAtual,
};
