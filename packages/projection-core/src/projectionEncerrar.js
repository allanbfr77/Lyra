'use strict';

const projectionPayloads = require('./projectionPayloads');

const MODO_SLIDES = 'slides';
const MODO_BIBLIA = 'biblia';
const MODO_APRESENTACAO = 'apresentacao';
const MODO_TUDO = 'tudo';

function normalizarModoEncerrar(modo) {
  const m = String(modo || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (m === 'slides' || m === 'slide') return MODO_SLIDES;
  if (m === 'biblia') return MODO_BIBLIA;
  if (m === 'apresentacao') return MODO_APRESENTACAO;
  if (m === 'tudo' || m === 'all' || m === 'completo') return MODO_TUDO;
  return null;
}

function estadoOciosoMinistrante() {
  return { titulo: '', atual: '', proximo: '', telaLimpa: true };
}

function limparOverridePublicoBibliaSomenteMinistrante(ctx) {
  const ov = ctx.estadoPublicoOverride;
  if (!ov || typeof ov !== 'object') return;
  if (ov.tipo === 'biblia') {
    ctx.estadoPublicoOverride = null;
    return;
  }
  if (ov.tipo === null && ov.telaLimpa && !ov.apresentacao) {
    ctx.estadoPublicoOverride = null;
  }
}

/**
 * Encerra apenas a camada de apresentação (override público + ministrante).
 * @param {object} ctx
 */
function encerrarCamadaApresentacao(ctx) {
  ctx.estadoPublicoOverride = null;
  ctx.ministranteApresentacaoOverride = null;
  /* A contagem regressiva vive nesta camada — o override é o que a desenha. Deixar o
     estado interno para trás faria um `exibir_contagem` seguinte, vindo sem duração
     (só «mudei a cor»), ressuscitar uma contagem que o operador já tinha encerrado. */
  ctx.contagem = null;
}

/**
 * Encerra só um canal da camada de apresentação (público ou ministrante).
 * Permite mídia num monitor e aviso noutro ao mesmo tempo.
 * @param {object} ctx
 * @param {'publico'|'ministrante'|'ambos'|'live'|string} alvo
 */
function encerrarCamadaApresentacaoAlvo(ctx, alvo) {
  const a = String(alvo || 'ambos').toLowerCase();
  if (a === 'publico' || a === 'live') {
    ctx.estadoPublicoOverride = null;
    if (a === 'live') ctx.projecaoLiveAtiva = false;
    return;
  }
  if (a === 'ministrante') {
    ctx.ministranteApresentacaoOverride = null;
    return;
  }
  encerrarCamadaApresentacao(ctx);
}

/**
 * Encerra projeção de slides/música em `estadoAtual` sem tocar Bíblia nem apresentação.
 * @param {object} ctx
 */
function encerrarCamadaSlides(ctx) {
  if (ctx.estadoAtual?.tipo === 'biblia') return;
  ctx.estadoAtual = projectionPayloads.estadoPublicoOcioso();
}

/**
 * Encerra projeção de Bíblia em `estadoAtual` sem tocar slides nem apresentação.
 * @param {object} ctx
 */
function encerrarCamadaBiblia(ctx) {
  if (ctx.estadoAtual?.tipo !== 'biblia') return;
  ctx.estadoAtual = projectionPayloads.estadoPublicoOcioso();
  limparOverridePublicoBibliaSomenteMinistrante(ctx);
  if (ctx.ministranteApresentacaoOverride?.modo === 'biblia') {
    ctx.ministranteApresentacaoOverride = null;
  }
}

/**
 * Encerra todas as camadas de projeção.
 * @param {object} ctx
 */
function encerrarTodasCamadas(ctx) {
  encerrarCamadaApresentacao(ctx);
  ctx.estadoAtual = projectionPayloads.estadoPublicoOcioso();
  ctx.estadoMinistrante = estadoOciosoMinistrante();
}

/**
 * Infere o modo a encerrar quando ESC é pressionado numa janela física.
 * @param {object} ctx
 * @param {'publico'|'ministrante'|string} [canal]
 * @param {{ apresentacaoDominaPublico?: boolean, apresentacaoDominaMinistrante?: boolean }} [canais]
 */
function inferirModoEncerrarPorCanalJanela(ctx, canal, canais = {}) {
  const ch = String(canal || '').toLowerCase();

  if (ch === 'ministrante') {
    if (ctx.ministranteApresentacaoOverride) return MODO_APRESENTACAO;
    if (ctx.estadoAtual?.tipo === 'biblia') return MODO_BIBLIA;
    if (ctx.estadoAtual?.tipo === 'musica') return MODO_SLIDES;
    return MODO_SLIDES;
  }

  if (
    canais.apresentacaoDominaPublico &&
    ctx.estadoPublicoOverride &&
    (ctx.estadoPublicoOverride.tipo === 'apresentacao' ||
      ctx.estadoPublicoOverride.tipo === 'aviso' ||
      ctx.estadoPublicoOverride.tipo === 'contagem' ||
      ctx.estadoPublicoOverride.apresentacao)
  ) {
    return MODO_APRESENTACAO;
  }

  const pub = projectionPayloads.payloadPublicoAtual(
    ctx.estadoAtual,
    ctx.estadoPublicoOverride,
    { apresentacaoDominaPublico: !!canais.apresentacaoDominaPublico }
  );
  if (pub?.tipo === 'apresentacao' || pub?.tipo === 'aviso' || pub?.tipo === 'contagem') {
    return MODO_APRESENTACAO;
  }
  if (ctx.estadoAtual?.tipo === 'biblia') return MODO_BIBLIA;
  if (
    ctx.estadoAtual?.tipo === 'musica' ||
    pub?.blackout ||
    pub?.slidePretoFinal ||
    (pub?.linhas && pub.linhas.length)
  ) {
    return MODO_SLIDES;
  }

  if (ctx.modoVisualProjecaoAtivo === 'biblia') return MODO_BIBLIA;
  return MODO_SLIDES;
}

/**
 * @param {object} ctx
 * @param {string} [modo]
 * @param {{ apresentacaoDominaPublico?: boolean, apresentacaoDominaMinistrante?: boolean }} [canais]
 */
function aplicarEncerrarProjecaoModo(ctx, modo, canais = {}) {
  const m = normalizarModoEncerrar(modo) || MODO_TUDO;

  if (m === MODO_APRESENTACAO) encerrarCamadaApresentacao(ctx);
  else if (m === MODO_SLIDES) encerrarCamadaSlides(ctx);
  else if (m === MODO_BIBLIA) encerrarCamadaBiblia(ctx);
  else encerrarTodasCamadas(ctx);

  return m;
}

module.exports = {
  MODO_SLIDES,
  MODO_BIBLIA,
  MODO_APRESENTACAO,
  MODO_TUDO,
  normalizarModoEncerrar,
  estadoOciosoMinistrante,
  encerrarCamadaApresentacao,
  encerrarCamadaApresentacaoAlvo,
  encerrarCamadaSlides,
  encerrarCamadaBiblia,
  encerrarTodasCamadas,
  inferirModoEncerrarPorCanalJanela,
  aplicarEncerrarProjecaoModo,
};
