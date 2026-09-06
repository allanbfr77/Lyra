/**
 * Fonte da busca de letras no painel (seletor, placeholder e POST de importar).
 *
 * Extraído do AppCore (secção C/F) sem unificar os dois critérios:
 * na busca, `lyra-songbank` vira `lyra-online` e o resto cai em `banco-local`;
 * no importar, `banco-local` e `lyra-songbank` viram `cifraclub`. Debounce,
 * abort HTTP e o fetch continuam no núcleo.
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

export function placeholderBuscaLetrasPorFonte(fonte) {
  if (fonte === FONTE_LETRAS_LETRAS_MUS) return 'Buscar em letras.mus.br…';
  if (fonte === FONTE_LETRAS_BANCO_LOCAL) return 'Buscar no banco offline…';
  if (fonte === FONTE_LETRAS_LYRA_ONLINE) return 'Buscar no banco online do Lyra…';
  return 'Buscar em cifraclub.com.br…';
}

/**
 * Fonte no body de POST /api/letras/importar.
 * Não usa `normalizarFonteLetrasSite`: banco local e aliases antigos vão para Cifra Club.
 */
export function fonteEnvioImportarLetras(fonte) {
  return fonte === FONTE_LETRAS_LETRAS_MUS
    ? FONTE_LETRAS_LETRAS_MUS
    : fonte === FONTE_LETRAS_LYRA_ONLINE
      ? FONTE_LETRAS_LYRA_ONLINE
      : FONTE_LETRAS_CIFRACLUB;
}
