'use strict';

/**
 * Escala de tipografia do telão (Ajustes → Slides → Telão).
 *
 * O slider de espaçamento grava line-height CSS (1.00–2.40). Valores abaixo de 1
 * são o formato antigo (incremento: line-height = 1 + valor). O limiar antigo
 * era 1.05 — por isso 1.00 era lido como legado e virava 2.00 no ecrã.
 */

const FONT_SIZE_VH_SLIDES_MIN = 0;
const FONT_SIZE_VH_SLIDES_MAX = 12;

/**
 * Tamanho em vh do telão. Teto 12 nos slides; aviso pode pedir mais via `fontSizeMaxVh`.
 * Valores antigos 13–14 (e o slider 2–40) caem no teto dos slides.
 *
 * @param {{ fontSize?: number, fontSizeMaxVh?: number } | null | undefined} pb
 */
function fontSizeVhPublico(pb) {
  const maxPedido = Number(pb && pb.fontSizeMaxVh);
  const teto =
    Number.isFinite(maxPedido) && maxPedido >= 2.2 ? maxPedido : FONT_SIZE_VH_SLIDES_MAX;
  const v = Number(pb && pb.fontSize);
  if (!Number.isFinite(v)) return 5.5;
  if (v >= FONT_SIZE_VH_SLIDES_MIN && v <= teto) return v;
  if (teto <= FONT_SIZE_VH_SLIDES_MAX && v > teto && v <= 40) return teto;
  return Math.min(teto, Math.max(FONT_SIZE_VH_SLIDES_MIN, v));
}

/**
 * Line-height CSS do telão (string). 1.00 é 1.00 — não 2.00.
 *
 * @param {{ lineSpacing?: number } | null | undefined} pb
 */
function lineHeightCssPublico(pb) {
  const raw = Number(pb && pb.lineSpacing);
  if (!Number.isFinite(raw)) return '1.35';
  if (raw >= 1 && raw <= 2.401) return String(Math.min(2.4, Math.max(1, raw)));
  if (raw >= -0.501 && raw < 1) return String(Math.min(2.8, Math.max(0.55, 1 + raw)));
  return String(Math.min(2.4, Math.max(1, raw)));
}

/**
 * Converte `fontSize` guardado para o slider (0–12, passo 1).
 *
 * @param {unknown} valor
 */
function normalizarFontSizeVhPublicoParaForm(valor) {
  const v = Number(valor);
  if (!Number.isFinite(v)) return 6;
  if (v >= FONT_SIZE_VH_SLIDES_MIN && v <= FONT_SIZE_VH_SLIDES_MAX) return Math.round(v);
  if (v > FONT_SIZE_VH_SLIDES_MAX && v <= 40) return FONT_SIZE_VH_SLIDES_MAX;
  return Math.min(
    FONT_SIZE_VH_SLIDES_MAX,
    Math.max(FONT_SIZE_VH_SLIDES_MIN, Math.round(v))
  );
}

/**
 * Line-height para o slider (1.00–2.40). Legado: −0.5 até abaixo de 1 → 1 + valor.
 *
 * @param {unknown} raw
 */
function normalizarLineHeightParaForm(raw) {
  const v = Number(raw);
  if (!Number.isFinite(v)) return 1.35;
  if (v >= 1 && v <= 2.401) return Math.min(2.4, Math.max(1, v));
  if (v >= -0.501 && v < 1) return Math.min(2.8, Math.max(0.55, 1 + v));
  return Math.min(2.4, Math.max(1, v));
}

module.exports = {
  FONT_SIZE_VH_SLIDES_MIN,
  FONT_SIZE_VH_SLIDES_MAX,
  fontSizeVhPublico,
  lineHeightCssPublico,
  normalizarFontSizeVhPublicoParaForm,
  normalizarLineHeightParaForm,
};
