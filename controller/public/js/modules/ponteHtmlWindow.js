/**
 * Expõe funções no `window` para atributos HTML (`onclick="…"`, `onchange="…"`).
 * ES modules não publicam escopo global; o painel ainda usa muitos handlers inline.
 *
 * @param {Record<string, unknown>} map Nome → função (só funções são atribuídas)
 */
export function exporCallbacksParaAtributosHtml(map) {
  for (const [nome, fn] of Object.entries(map)) {
    if (typeof fn === 'function') window[nome] = fn;
  }
}
