/**
 * Rolagem da lista de versículos com contexto futuro.
 *
 * `scrollIntoView({ block: 'nearest' })` só garantia o card focado visível.
 * No fim da área isso colava o destaque na borda e cortava o versículo seguinte
 * — o operador tinha de rolar à mão para ver o que vinha a seguir.
 *
 * A regra: o focado continua obrigatoriamente visível, e abaixo dele fica pelo
 * menos 1 versículo seguinte (2 se os dois couberem com o focado). Assim o
 * destaque nunca fica colado no fundo durante a navegação ao vivo.
 */

export const FOLGA_TOPO_LISTA_VERSICULOS = 8;
export const FOLGA_FUNDO_LISTA_VERSICULOS = 12;

/**
 * Delta de `scrollTop` (positivo desce) para o versículo focado + contexto.
 *
 * Coordenadas no mesmo referencial de `getBoundingClientRect()`. O delta
 * aplica-se depois com `scrollTop + delta`.
 *
 * @param {{
 *   viewport: { top: number, bottom: number, height: number },
 *   foco: { top: number, bottom: number, height: number },
 *   seguintes?: Array<{ top: number, bottom: number, height: number }>,
 *   folgaTopo?: number,
 *   folgaFundo?: number,
 * }} opts
 * @returns {number}
 */
export function deltaScrollListaVersiculos({
  viewport,
  foco,
  seguintes = [],
  folgaTopo = FOLGA_TOPO_LISTA_VERSICULOS,
  folgaFundo = FOLGA_FUNDO_LISTA_VERSICULOS,
}) {
  if (!viewport || !foco) return 0;
  if (!(viewport.height > 8) || !(foco.height > 0)) return 0;

  const innerTop = viewport.top + folgaTopo;
  const innerBottom = viewport.bottom - folgaFundo;
  const innerH = innerBottom - innerTop;
  if (!(innerH > 0)) return 0;

  /* Versículo maior que a área: alinha ao topo; o resto fica para o operador. */
  if (foco.height > innerH) return foco.top - innerTop;

  /* Limites para o focado não sair da área interior. */
  const maxDelta = foco.top - innerTop;
  const minDelta = foco.bottom - innerBottom;

  let delta = 0;
  if (foco.top < innerTop) delta = foco.top - innerTop;
  else if (foco.bottom > innerBottom) delta = foco.bottom - innerBottom;

  const abaixo = (Array.isArray(seguintes) ? seguintes : []).filter(
    (s) => s && s.height > 0 && s.bottom > foco.bottom + 2
  );

  if (abaixo.length) {
    const primeiro = abaixo[0];
    const segundo = abaixo[1] || null;
    /* 2 se o focado + os dois seguintes couberem; senão pelo menos o imediato. */
    let alvoBottom = primeiro.bottom;
    if (segundo && segundo.bottom - foco.top <= innerH) {
      alvoBottom = segundo.bottom;
    }
    const deltaContexto = alvoBottom - innerBottom;
    if (deltaContexto > delta) delta = deltaContexto;
  }

  if (delta > maxDelta) delta = maxDelta;
  if (delta < minDelta) delta = minDelta;
  return delta;
}
