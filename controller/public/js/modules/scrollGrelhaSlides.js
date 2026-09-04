/**
 * Rolagem da grelha de slides com visão antecipada.
 *
 * A regra antiga era «nearest»: só deslocava o mínimo para o chip actual caber.
 * Isso deixava a linha seguinte completamente escondida até o operador chegar nela.
 *
 * Agora o slide actual continua obrigatoriamente visível, e a linha seguinte entra
 * na conta — de preferência inteira, senão ao menos um peek — sempre que houver
 * espaço abaixo sem empurrar o actual para fora do topo.
 */

export const FOLGA_TOPO_GRELHA_SLIDES = 8;
export const FOLGA_FUNDO_GRELHA_SLIDES = 14;
/** Fração da linha seguinte a revelar quando a linha inteira não cabe. */
export const PEEK_RATIO_GRELHA_SLIDES = 0.5;

/**
 * Índice do chip da linha seguinte (mesma coluna), ou o último se a linha
 * seguinte estiver incompleta. `-1` se não há conteúdo abaixo.
 *
 * @param {number} idx
 * @param {number} cols
 * @param {number} total
 */
export function indiceChipAntecipacao(idx, cols, total) {
  const i = Number(idx);
  const col = Math.max(1, Number(cols) || 1);
  const n = Number(total);
  if (!Number.isFinite(i) || i < 0 || !Number.isFinite(n) || n <= 0) return -1;
  const prox = i + col;
  if (prox < n) return prox;
  return n - 1 > i ? n - 1 : -1;
}

/**
 * Quantos pixels de `rect` ficam dentro de `[innerTop, innerBottom]`.
 * Negativo ou zero = nada visível nessa faixa.
 *
 * @param {{ top: number, bottom: number }} rect
 * @param {number} innerTop
 * @param {number} innerBottom
 */
export function pxVisiveisNoInner(rect, innerTop, innerBottom) {
  if (!rect) return 0;
  return Math.min(rect.bottom, innerBottom) - Math.max(rect.top, innerTop);
}

/**
 * Delta de `scrollTop` (positivo desce) para manter o chip actual visível e
 * puxar a linha seguinte para o viewport enquanto couber.
 *
 * Coordenadas no mesmo referencial de `getBoundingClientRect()` (o delta aplica-se
 * depois com `scrollTop + delta`). Rects do lookahead na mesma linha que o actual
 * são ignorados.
 *
 * @param {{
 *   viewport: { top: number, bottom: number, height: number },
 *   chip: { top: number, bottom: number, height: number },
 *   lookahead?: { top: number, bottom: number, height: number } | null,
 *   folgaTopo?: number,
 *   folgaFundo?: number,
 *   peekRatio?: number,
 * }} opts
 * @returns {number}
 */
export function deltaScrollGrelhaSlidesAntecipado({
  viewport,
  chip,
  lookahead = null,
  folgaTopo = FOLGA_TOPO_GRELHA_SLIDES,
  folgaFundo = FOLGA_FUNDO_GRELHA_SLIDES,
  peekRatio = PEEK_RATIO_GRELHA_SLIDES,
}) {
  if (!viewport || !chip) return 0;
  if (!(viewport.height > 8) || !(chip.height > 0)) return 0;

  const innerTop = viewport.top + folgaTopo;
  const innerBottom = viewport.bottom - folgaFundo;
  const innerH = innerBottom - innerTop;
  if (!(innerH > 0)) return 0;

  if (chip.height > innerH) return chip.top - innerTop;

  const maxDelta = chip.top - innerTop;
  const minDelta = chip.bottom - innerBottom;

  let delta = 0;
  if (chip.top < innerTop) delta = chip.top - innerTop;
  else if (chip.bottom > innerBottom) delta = chip.bottom - innerBottom;

  const lookaheadAbaixo =
    lookahead &&
    lookahead.height > 0 &&
    lookahead.bottom > chip.bottom + 2;

  if (lookaheadAbaixo) {
    const visLook = pxVisiveisNoInner(lookahead, innerTop, innerBottom);
    if (visLook < 1) {
      const deltaCheio = lookahead.bottom - innerBottom;
      const peekPx = lookahead.height * peekRatio;
      const deltaPeek = lookahead.top + peekPx - innerBottom;
      const alvo = deltaCheio <= maxDelta + 0.5 ? deltaCheio : deltaPeek;
      delta = Math.max(delta, alvo);
    }
  }

  if (delta > maxDelta) delta = maxDelta;
  if (delta < minDelta) delta = minDelta;
  return delta;
}
