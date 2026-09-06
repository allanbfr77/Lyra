/**
 * Fonte da busca de letras no painel (seletor HLYRCS / online / sites).
 *
 * Extraído do AppCore (secção C/F) sem mudar o critério: `lyra-songbank`
 * vira `lyra-online`; qualquer outro valor cai em `banco-local`. Debounce,
 * abort HTTP e o POST de importação continuam no núcleo.
 */

export const FONTE_LETRAS_BANCO_LOCAL = 'banco-local';
export const FONTE_LETRAS_LYRA_ONLINE = 'lyra-online';
export const FONTE_LETRAS_CIFRACLUB = 'cifraclub';
export const FONTE_LETRAS_LETRAS_MUS = 'letras-mus-br';

export const BANCO_FONTE_OPCOES = Object.freeze([
  Object.freeze({ value: FONTE_LETRAS_BANCO_LOCAL, label: 'HLYRCS' }),
  Object.freeze({ value: FONTE_LETRAS_LYRA_ONLINE, label: 'BANCO ONLINE DO LYRA' }),
  Object.freeze({ value: FONTE_LETRAS_CIFRACLUB, label: 'CIFRA CLUB' }),
  Object.freeze({ value: FONTE_LETRAS_LETRAS_MUS, label: 'LETRAS.MUS.BR' }),
]);

/** Fonte da busca: `banco-local`, `cifraclub`, `letras-mus-br` ou `lyra-online`. */
export function normalizarFonteLetrasSite(val) {
  const s = String(val || '').trim();
  if (s === FONTE_LETRAS_LETRAS_MUS) return FONTE_LETRAS_LETRAS_MUS;
  if (s === FONTE_LETRAS_CIFRACLUB) return FONTE_LETRAS_CIFRACLUB;
  if (s === FONTE_LETRAS_LYRA_ONLINE || s === 'lyra-songbank') return FONTE_LETRAS_LYRA_ONLINE;
  return FONTE_LETRAS_BANCO_LOCAL;
}
