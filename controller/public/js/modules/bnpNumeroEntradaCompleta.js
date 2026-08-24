'use strict';

/**
 * Indica se a entrada numérica da busca rápida (capítulo/versículo) já pode avançar
 * automaticamente para a etapa seguinte.
 *
 * Espera até o prefixo deixar de poder crescer para outro número válido — ex.: com
 * max=150, "2" ainda pode virar 20, mas "16" não (160 já excede o máximo).
 *
 * @param {string} str Texto digitado
 * @param {number} max Valor máximo válido (total de capítulos ou versículos)
 * @returns {boolean}
 */
export function bnpNumeroEntradaCompleta(str, max) {
  const t = String(str || '').trim();
  if (!/^\d+$/.test(t)) return false;
  const n = parseInt(t, 10);
  if (n < 1 || n > max) return false;
  const maxLen = String(max).length;
  if (t.length >= maxLen) return true;
  return n * 10 > max;
}
