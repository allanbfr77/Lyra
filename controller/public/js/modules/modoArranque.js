/**
 * Decisão de arranque do Controlador: projetar nesta máquina ou ir a um Servidor?
 *
 * Vive fora do `controllerAppCore.js` por ser a única parte do bootstrap que se pode
 * decidir sem DOM, sem Electron e sem rede — é uma leitura de preferência e nada mais.
 * Separá-la torna-a testável; deixá-la lá dentro tornava-a verificável só a olho, abrindo
 * o app com o `localStorage` num estado ou noutro.
 *
 * ## O padrão inverteu
 *
 * Durante muito tempo o Controlador procurava um Servidor ao abrir, e projetar nesta
 * máquina era o desvio, pedido à mão em Ferramentas. O caso comum, porém, é um PC só — o
 * que tem os monitores — e nele essa procura era por uma máquina que não existe. Hoje o
 * padrão é o inverso: projeta-se aqui, e ir ao Servidor é a escolha declarada.
 *
 * ## A preferência tem três estados, e os três importam
 *
 * | valor      | significa                                  | arranque |
 * |------------|--------------------------------------------|----------|
 * | ausente    | nunca decidiu                              | local    |
 * | `'1'`      | escolheu o modo local                      | local    |
 * | `'0'`      | escolheu o Servidor remoto, em Ajustes     | remoto   |
 *
 * Ausente e `'1'` levam ao mesmo sítio. Distingui-los não é supérfluo: é o que permite a
 * uma migração futura saber se houve escolha ou se o valor é apenas o padrão a passar.
 *
 * Quem grava `'0'` é só `conectar()`. Desmarcar «Projetar nesta máquina» no menu derruba o
 * motor na sessão e não escreve nada — parar de projetar agora não é o mesmo que declarar
 * que este PC opera contra um Servidor da rede.
 */

/** Valor que marca a escolha deliberada pelo Servidor remoto. */
export const PREF_SERVIDOR_REMOTO = '0';

/** Valor que marca a escolha deliberada pelo modo local. */
export const PREF_PROJETAR_LOCAL = '1';

/**
 * Em que modo o painel deve arrancar.
 *
 * @param {object} entrada
 * @param {string|null|undefined} entrada.preferencia Valor cru de `LS_PROJETAR_LOCAL`;
 *   `null`/`undefined` quando a chave não existe ou o `localStorage` não pôde ser lido.
 * @param {boolean} entrada.temPonte Há ponte para o motor em processo? Fora do Electron
 *   não há, e aí o modo local não é sequer possível.
 * @returns {'local'|'remoto'}
 */
export function decidirModoDeArranque({ preferencia, temPonte } = {}) {
  /* Sem ponte não há motor a subir: o painel está num browser, e a única projeção
     alcançável é a de um Servidor. A preferência não tem como se sobrepor a isso. */
  if (!temPonte) return 'remoto';
  return preferencia === PREF_SERVIDOR_REMOTO ? 'remoto' : 'local';
}
