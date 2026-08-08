'use strict';

/**
 * Decisão de envio do Modo Bíblia — quem recebe o versículo, e se o envio acontece.
 *
 * ## Porque isto saiu do `controllerAppCore.js`
 *
 * A decisão vivia espalhada por três passos dentro de `bibliaProjetarVersiculo()`:
 * ler o alvo da rota, sincronizar a rota com o que está na UI, e verificar se os
 * monitores cobrem o alvo. Estavam por esta ordem — e a ordem estava errada.
 *
 * `bibliaSincronizarRotaComServidorSeMudou()` reescreve a rota a partir do DOM. Lendo o
 * alvo ANTES dela, a primeira projeção de uma sessão comparava o alvo da rota antiga com
 * a cobertura da rota nova. Quando o operador escolhia «Live — OBS» sem ter projetado
 * fisicamente primeiro, o alvo lido era o herdado da entrada no modo («Desativado») e a
 * cobertura já era `live`: a verificação falhava, a função devolvia sem enviar nada e o
 * OBS ficava mudo. Projetar primeiro num monitor «arranjava» o problema por acidente —
 * era o único caminho em que as duas leituras já coincidiam.
 *
 * Um bug de sequência não se corrige com um teste sobre funções puras: é preciso
 * capturar a sequência. Por isso `resolverEnvioBiblia()` recebe o «sincronizar» e o
 * «ler» como funções e é ela que garante a ordem — e é sobre ela que o teste afirma.
 *
 * ## O OBS não é um monitor
 *
 * O overlay (`/obs/biblia`, `/obs/slides`) é um cliente Socket.IO da 5510. Não precisa de
 * janela, de monitor externo, nem de projeção física a decorrer. Logo, nada relacionado
 * com telas pode fazer o comando não sair. A única razão legítima para não enviar é o
 * operador ter escolhido «Desativado» — uma escolha explícita de não projetar.
 */

/** Difundir a todos: alvo que não toca em janela física nenhuma, só no overlay. */
export const ALVO_LIVE = 'live';
export const ALVO_DESATIVADO = 'desativado';

/**
 * @typedef {object} RotaProjecao
 * @property {number} publicoIndex Índice do monitor público, ou -1.
 * @property {number} ministranteIndex Índice do monitor do ministrante, ou -1.
 * @property {boolean} live Destino «Live — OBS».
 */

/**
 * @param {any} obj
 * @returns {RotaProjecao}
 */
export function normalizarRotaEnvio(obj) {
  const live = !!(obj && obj.live);
  const pub = parseInt(obj?.publicoIndex, 10);
  const min = parseInt(obj?.ministranteIndex, 10);
  return {
    publicoIndex: live ? -1 : Number.isFinite(pub) ? pub : -1,
    ministranteIndex: live ? -1 : Number.isFinite(min) ? min : -1,
    live,
  };
}

/**
 * Destino da projeção tal como o cabeçalho «Monitor» o apresenta.
 *
 * @param {any} rota
 * @returns {'desativado'|'publico'|'ministrante'|'ambos'|'live'}
 */
export function alvoDeRota(rota) {
  const r = normalizarRotaEnvio(rota);
  if (r.live) return ALVO_LIVE;
  const pub = r.publicoIndex >= 0;
  const min = r.ministranteIndex >= 0;
  if (!pub && !min) return ALVO_DESATIVADO;
  if (pub && min) return 'ambos';
  if (pub) return 'publico';
  return 'ministrante';
}

/**
 * A rota tem, de facto, as saídas físicas que o alvo pede?
 *
 * @param {any} rota
 * @param {string} alvo
 * @returns {boolean}
 */
export function rotaCobreAlvo(rota, alvo) {
  if (alvo === ALVO_DESATIVADO) return false;
  const r = normalizarRotaEnvio(rota);
  if (alvo === ALVO_LIVE) return r.live;
  const pub = r.publicoIndex >= 0;
  const min = r.ministranteIndex >= 0;
  if (alvo === 'publico') return pub;
  if (alvo === 'ministrante') return min;
  return pub && min;
}

/**
 * Alvo a gravar no payload, garantidamente entregável ao OBS.
 *
 * Lendo alvo e cobertura da MESMA rota, a divergência é impossível por construção — o
 * `live` de reserva só existe para que uma futura regressão se manifeste como projeção
 * física em falta, nunca como overlay mudo.
 *
 * @param {any} rota
 * @returns {string|null} `null` quando o operador escolheu «Desativado».
 */
export function alvoEnvioParaModoBiblia(rota) {
  const alvo = alvoDeRota(rota);
  if (alvo === ALVO_DESATIVADO) return null;
  return rotaCobreAlvo(rota, alvo) ? alvo : ALVO_LIVE;
}

/**
 * Sequência completa da decisão: sincronizar primeiro, ler depois.
 *
 * @param {object} deps
 * @param {(() => any)} deps.lerRota Lê a rota do Modo Bíblia já vigente.
 * @param {(() => Promise<void>|void)} [deps.sincronizarRota]
 *   Alinha a rota com o que está seleccionado na UI. Omitir só em navegação rápida
 *   (versículo seguinte/anterior), onde a rota já foi sincronizada na primeira projeção.
 * @returns {Promise<{enviar: boolean, alvo: string, alvoEnvio: string|null}>}
 */
export async function resolverEnvioBiblia(deps = {}) {
  const { lerRota, sincronizarRota } = deps;
  if (typeof sincronizarRota === 'function') {
    await sincronizarRota();
  }
  const rota = typeof lerRota === 'function' ? lerRota() : null;
  const alvo = alvoDeRota(rota);
  const alvoEnvio = alvoEnvioParaModoBiblia(rota);
  return { enviar: alvoEnvio !== null, alvo, alvoEnvio };
}
