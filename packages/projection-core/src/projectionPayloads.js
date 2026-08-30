'use strict';

const comentariosSlide = require('./comentariosSlide');
const contagemRegressiva = require('./contagemRegressiva');

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

/**
 * Converte o estado interno da contagem no que a tela precisa de saber.
 *
 * Este carimbo vive aqui, e não no aplicador, porque o aplicador corre uma vez por
 * comando e este payload é reconstruído a cada emissão — inclusive na que o host faz
 * quando um telão novo se liga, minutos depois de a contagem ter começado. Carimbar no
 * comando congelaria o `restanteMs` no instante do comando, e quem chegasse tarde
 * receberia o tempo que faltava quando a contagem foi criada.
 *
 * O `alvoEm` do estado interno não atravessa a fronteira: é um instante no relógio do
 * host, e o cliente não tem como o interpretar. Sai daqui como duração.
 *
 * Serve os dois canais. O telão marca a contagem em `tipo`, o monitor do ministrante em
 * `modo` — nomes diferentes por herança, mesma necessidade: quando a contagem vai aos dois
 * ecrãs, carimbar só um deixaria o outro a mostrar o tempo que faltava no instante do
 * comando.
 *
 * @param {object|null} payload Já clonado — a função escreve nele.
 * @param {number} agora
 */
function carimbarContagemNoPayload(payload, agora) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.tipo !== 'contagem' && payload.modo !== 'contagem') return payload;
  const vivo = contagemRegressiva.payloadContagem(payload.contagem, agora);
  if (vivo) payload.contagem = vivo;
  return payload;
}

/**
 * @param {object} baseEstado
 * @param {object | null} estadoPublicoOverride
 * @param {{ agora?: number }} [opts] `agora` injectável para teste; por omissão, o relógio.
 */
function payloadPublicoAtual(baseEstado, estadoPublicoOverride, opts = {}) {
  const agora = Number.isFinite(opts && opts.agora) ? opts.agora : Date.now();
  let base = clonePayloadSafe(baseEstado);
  base = filtrarEstadoMusicaParaPublico(base);
  if (!estadoPublicoOverride) return carimbarContagemNoPayload(base, agora);
  const over = clonePayloadSafe(estadoPublicoOverride);
  const overFiltrado = filtrarEstadoMusicaParaPublico(over);
  if (base && typeof base === 'object') {
    overFiltrado.blackout = !!base.blackout;
  }
  return carimbarContagemNoPayload(overFiltrado, agora);
}

/**
 * Versículo no ar **apenas no canal do ministrante**.
 *
 * O evento `estado` transporta o payload do canal PÚBLICO. Com o alvo «ministrante»
 * (M3), `exibir_versiculo` põe `estadoPublicoOverride = estadoPublicoOcioso()` — uma tela
 * limpa no canal que não é alvo, para ele não continuar a mostrar o que lá estava. O
 * versículo fica só em `estadoAtual` e chega ao M3 pelo snapshot do ministrante, sem
 * passar por esta difusão.
 *
 * Resultado: o controlador recebia `{ tipo: null, telaLimpa: true }` — indistinguível de
 * «nada projetado». Concluía que a Bíblia tinha sido encerrada, apagava o marcador verde
 * e `bibliaParteProjetadaChave`, e com isso o ESC deixava de encontrar projeção para
 * encerrar. No M2 nada disto acontecia, porque aí não há override e o versículo viaja no
 * próprio payload.
 *
 * Esta bandeira é o que falta dizer ao controlador: «o público está limpo de propósito, e
 * há versículo no ar noutro canal».
 *
 * A forma do override é a mesma que `projectionEncerrar.limparOverridePublicoBibliaSomenteMinistrante`
 * já reconhece — tipo nulo, tela limpa, sem apresentação. Uma camada COM conteúdo (mídia,
 * aviso, contagem) não conta: aí o controlador já sabe que tem algo por cima.
 *
 * @param {object|null} estadoAtual
 * @param {object|null} estadoPublicoOverride
 * @returns {boolean}
 */
function bibliaAtivaSomenteNoMinistrante(estadoAtual, estadoPublicoOverride) {
  const base = estadoAtual;
  if (!base || typeof base !== 'object') return false;
  if (base.tipo !== 'biblia' || base.telaLimpa) return false;
  const temTexto =
    Array.isArray(base.linhas) &&
    base.linhas.some((l) => String(l == null ? '' : l).trim().length > 0);
  if (!temTexto) return false;

  const ov = estadoPublicoOverride;
  /* Sem override o versículo já vai no payload público — o controlador vê-o lá. */
  if (!ov || typeof ov !== 'object') return false;
  return ov.tipo == null && !!ov.telaLimpa && !ov.apresentacao;
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
    out.projecaoBibliaMinistrante = bibliaAtivaSomenteNoMinistrante(
      estadoAtual,
      estadoPublicoOverride
    );
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
      return payloadMinistranteMusicaFromEstrofes(
        ex.estrofes,
        ex.estrofeIndex,
        titulo,
        tom,
        ex.tituloAbertura
      );
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
      titulo: aberturaMusica
        ? String(ex.tituloAbertura || '').trim() || formatarTituloAberturaComTom(titulo, tom)
        : titulo,
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

/** Título do 1.º slide do M3: «♪ Título | Tom» se houver tom; senão «♪ Título». */
function formatarTituloAberturaComTom(tituloMusica, tomMusica) {
  const tit = String(tituloMusica || '').trim();
  const tom = String(tomMusica || '').trim();
  if (!tit) return tom || '';
  const corpo = tom ? `${tit} | ${tom}` : tit;
  return `♪ ${corpo}`;
}

/**
 * Payload M3 (ministrante) a partir das estrofes.
 * Slide 1: título (+ tom, se houver) no topo (aberturaMusica) + slide atual + só 2 linhas do próximo.
 * A partir do 2.º: atual + próximo completo.
 */
function payloadMinistranteMusicaFromEstrofes(
  estrofes,
  idxEstrofe,
  tituloMusica,
  tomMusica,
  tituloAberturaCliente
) {
  const n = Array.isArray(estrofes) ? estrofes.length : 0;
  const idx = Number(idxEstrofe);
  if (!Number.isFinite(idx) || idx < 0 || idx > n) {
    return { titulo: '', atual: '', proximo: '', telaLimpa: true, aberturaMusica: false };
  }
  const tituloBase = tituloMusica || '';
  const tituloAberturaFmt = String(tituloAberturaCliente || '').trim();
  const titulo =
    idx === 0
      ? tituloAberturaFmt || formatarTituloAberturaComTom(tituloBase, tomMusica)
      : tituloBase;
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
      return payloadMinistranteMusicaFromEstrofes(estrofes, ex.estrofeIndex, ex.titulo, ex.tom, ex.tituloAbertura);
    }
  } catch (e) {
    logError('snapshotMinistranteAtual', e);
  }
  return estadoMinistranteFromEstadoAtual(estadoAtual);
}

module.exports = {
  clonePayloadSafe,
  carimbarContagemNoPayload,
  payloadPublicoAtual,
  bibliaAtivaSomenteNoMinistrante,
  estadoPublicoParaSocketsOuApi,
  estadoPublicoOcioso,
  linhasProximoParaMusica,
  estadoMinistranteFromEstadoAtual,
  primeirasLinhasEstrofeMinistrante,
  formatarTituloAberturaComTom,
  payloadMinistranteMusicaFromEstrofes,
  snapshotMinistranteAtual,
};
