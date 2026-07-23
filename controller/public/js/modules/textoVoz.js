/**
 * Normalização de texto compartilhada pelos módulos de reconhecimento de voz
 * (`reconhecimentoVozBiblia.js` e `reconhecimentoVozSlides.js`).
 */

/** Minúsculas, sem acentos e sem pontuação; espaços colapsados. */
export function normalizarTextoVoz(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
