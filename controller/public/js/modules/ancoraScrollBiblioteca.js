/**
 * =============================================================================
 * Lyra — Âncora de navegação da Biblioteca de músicas
 * =============================================================================
 *
 * ## O que resolve
 *
 * Excluir uma música reconstrói o DOM da Biblioteca inteiro (`renderizarListaLocal`),
 * e uma lista recém-nascida começa no topo. Quem estava na região do «N» a limpar
 * duplicados era devolvido ao «A» a cada exclusão e tinha de rolar de novo até lá —
 * uma vez por música.
 *
 * ## A ideia: ancorar numa música, não num número de pixels
 *
 * Guardar só o `scrollTop` não serve: a lista encurtou uma linha (e, às vezes, um
 * cabeçalho de letra inteiro), logo o mesmo número de pixels já aponta para outro
 * ponto da lista. O que o operador reconhece como «onde eu estava» é a música que
 * estava no topo da área visível — então é ela a âncora, e o que se guarda é a sua
 * chave mais a distância dela ao topo visível. Depois do render, procura-se essa
 * música e devolve-se-lhe a mesma distância: a lista aparece onde estava, com a
 * linha excluída a menos.
 *
 * ## Quando a âncora é a própria música excluída
 *
 * Aí não há linha para reencontrar, e por isso a captura guarda também a ordem em que
 * as chaves estavam na lista. Procura-se a seguinte que sobreviveu — a que subiu para
 * o lugar da que saiu, que é exactamente o que se espera ver. Se a excluída era a
 * última (a região toda foi num lote, ou era o fim da lista), procura-se para trás:
 * fica-se na vizinhança, e não no topo. Só quando a lista nova não tem nenhuma das
 * músicas de antes é que se cai no `scrollTop` guardado, limitado ao novo tamanho.
 *
 * Módulo puro de propósito: fala em números e chaves, nunca em elementos. Quem mede
 * e quem rola é o `controllerAppCore.js`; aqui vive a decisão, que é o que se testa.
 */

/**
 * Folga para decidir «esta linha está visível».
 *
 * Arredondamento de subpixel faz a linha do topo medir `bottom` a fracções de zero;
 * sem folga, ora era ela a âncora, ora a seguinte, para a mesma posição visual.
 */
export const TOLERANCIA_LINHA_VISIVEL_BIBLIOTECA = 1;

/**
 * Âncora a partir das linhas à mostra — as que o filtro não esconde, na ordem da
 * lista — medidas em relação ao topo visível dela (`rect.top - rectDaLista.top`):
 * negativo é acima da dobra, zero é no topo.
 *
 * @param {{
 *   scrollTop: number,
 *   linhas: Array<{ chave: string, top: number, bottom: number }>,
 * }} opts
 * @returns {{ chave: string, indice: number, deslocamento: number, scrollTop: number, chaves: string[] } | null}
 */
export function capturarAncoraScrollBiblioteca({ scrollTop, linhas }) {
  const lista = (Array.isArray(linhas) ? linhas : []).filter(
    (l) => l && l.chave && Number.isFinite(l.top) && Number.isFinite(l.bottom)
  );
  if (!lista.length) return null;

  const anterior = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  const chaves = lista.map((l) => l.chave);

  /* Primeira linha que a área visível ainda mostra, mesmo em parte: é a que o
     operador tem debaixo do olho e a única que ele reconhece ao voltar. */
  let indice = lista.findIndex((l) => l.bottom > TOLERANCIA_LINHA_VISIVEL_BIBLIOTECA);
  /* Lista rolada para além de tudo (não acontece a rolar, acontece a encurtar):
     a última serve de âncora — o fundo é o que estava à vista. */
  if (indice === -1) indice = lista.length - 1;

  return {
    chave: lista[indice].chave,
    indice,
    deslocamento: lista[indice].top,
    scrollTop: anterior,
    chaves,
  };
}

/**
 * Chave a reencontrar depois do render: a da âncora se sobreviveu, senão a seguinte
 * mais próxima, senão a anterior mais próxima. `null` quando nenhuma sobrou.
 *
 * @param {{
 *   ancora: { chave: string, indice: number, chaves: string[] } | null,
 *   existeChave: (chave: string) => boolean,
 * }} opts
 * @returns {string | null}
 */
export function escolherChaveRestauroBiblioteca({ ancora, existeChave }) {
  if (!ancora || typeof existeChave !== 'function') return null;
  const chaves = Array.isArray(ancora.chaves) ? ancora.chaves : [];
  if (!chaves.length) return existeChave(ancora.chave) ? ancora.chave : null;

  const i = Number.isInteger(ancora.indice) ? ancora.indice : 0;
  for (let j = i; j < chaves.length; j++) {
    if (existeChave(chaves[j])) return chaves[j];
  }
  for (let j = i - 1; j >= 0; j--) {
    if (existeChave(chaves[j])) return chaves[j];
  }
  return null;
}

/**
 * Mantém o `scrollTop` dentro do que a lista nova permite.
 *
 * @param {number} valor
 * @param {number} scrollMaximo `scrollHeight - clientHeight`
 * @returns {number}
 */
export function clamparScrollTopBiblioteca(valor, scrollMaximo) {
  const max = Number.isFinite(scrollMaximo) && scrollMaximo > 0 ? scrollMaximo : 0;
  const v = Number.isFinite(valor) ? valor : 0;
  if (v < 0) return 0;
  if (v > max) return max;
  return v;
}

/**
 * `scrollTop` que põe a linha reencontrada à mesma distância do topo visível que a
 * âncora tinha. `topoLinha` vem medido como na captura (relativo ao topo visível).
 *
 * @param {{
 *   scrollTop: number,
 *   topoLinha: number,
 *   deslocamento: number,
 *   scrollMaximo: number,
 * }} opts
 * @returns {number}
 */
export function scrollTopParaAncoraBiblioteca({ scrollTop, topoLinha, deslocamento, scrollMaximo }) {
  const atual = Number.isFinite(scrollTop) ? scrollTop : 0;
  const topo = Number.isFinite(topoLinha) ? topoLinha : 0;
  const alvo = Number.isFinite(deslocamento) ? deslocamento : 0;
  return clamparScrollTopBiblioteca(atual + (topo - alvo), scrollMaximo);
}
