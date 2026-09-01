'use strict';

/**
 * Dimensionamento de texto à área útil — o tamanho configurado é o TETO.
 *
 * Slides (ou o versículo do relógio) com pouco conteúdo ficam no tamanho pedido.
 * Só encolhe o que realmente transborda a caixa medida no ecrã.
 */

const FONTE_MIN_VH = 2.1;
const FONTE_MIN_VERSICULO_VH = 0.8;
const PRECISAO_VH = 0.05;
/** Folga contra subpixel e overscan ligeiro da TV. */
const MARGEM_PX = 2;

/**
 * Reparte a altura restante pelos dois painéis do ministrante.
 *
 * Quem já cabe na sua metade fica no tamanho natural; o espaço que sobra vai para o
 * painel que precisa. Os dois longos partilham a área em partes iguais.
 *
 * @param {{
 *   restantePx: number,
 *   alturaAtualPx: number,
 *   alturaProximoPx: number,
 *   atualTemConteudo: boolean,
 *   proximoTemConteudo: boolean,
 * }} opts
 * @returns {{ budgetAtualPx: number, budgetProximoPx: number }}
 */
function calcularOrcamentosSlides(opts) {
  const restante = Math.max(0, Number(opts?.restantePx) || 0);
  const atualOn = opts?.atualTemConteudo === true;
  const proxOn = opts?.proximoTemConteudo === true;
  const hA = atualOn ? Math.max(0, Number(opts?.alturaAtualPx) || 0) : 0;
  const hP = proxOn ? Math.max(0, Number(opts?.alturaProximoPx) || 0) : 0;

  if (!atualOn && !proxOn) return { budgetAtualPx: 0, budgetProximoPx: 0 };
  if (atualOn && !proxOn) return { budgetAtualPx: restante, budgetProximoPx: 0 };
  if (!atualOn && proxOn) return { budgetAtualPx: 0, budgetProximoPx: restante };

  if (hA + hP <= restante + MARGEM_PX) {
    return { budgetAtualPx: hA, budgetProximoPx: hP };
  }

  const metade = restante / 2;
  if (hA <= metade + MARGEM_PX && hP > metade) {
    return { budgetAtualPx: hA, budgetProximoPx: Math.max(0, restante - hA) };
  }
  if (hP <= metade + MARGEM_PX && hA > metade) {
    return { budgetAtualPx: Math.max(0, restante - hP), budgetProximoPx: hP };
  }
  return { budgetAtualPx: metade, budgetProximoPx: metade };
}

/**
 * Maior fonte (vh) que ainda cabe, nunca acima de `fonteMaxVh`.
 *
 * @param {{
 *   fonteMaxVh: number,
 *   fonteMinVh?: number,
 *   cabe: (vh: number) => boolean,
 * }} opts
 * @returns {number}
 */
function encolherFonteAteCaber(opts) {
  const min = Number(opts?.fonteMinVh);
  const minimo = Number.isFinite(min) && min > 0 ? min : FONTE_MIN_VH;
  const max = Number(opts?.fonteMaxVh);
  const cabe = opts?.cabe;
  if (!Number.isFinite(max)) return minimo;
  if (max <= minimo) return minimo;
  if (typeof cabe !== 'function') return max;
  if (cabe(max)) return max;
  if (!cabe(minimo)) return minimo;

  let lo = minimo;
  let hi = max;
  for (let i = 0; i < 20; i++) {
    if (hi - lo <= PRECISAO_VH) break;
    const mid = (lo + hi) / 2;
    if (cabe(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

module.exports = {
  FONTE_MIN_VH,
  FONTE_MIN_VERSICULO_VH,
  PRECISAO_VH,
  MARGEM_PX,
  calcularOrcamentosSlides,
  encolherFonteAteCaber,
};
