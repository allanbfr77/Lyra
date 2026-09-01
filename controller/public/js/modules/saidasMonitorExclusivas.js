/**
 * Regra «um monitor, uma saída» dos seletores de projeção.
 *
 * Público e Ministrante são duas janelas fullscreen. Apontá-las ao mesmo ecrã põe uma por
 * cima da outra, e o que fica à vista passa a depender da ordem por que o motor as
 * sincroniza — o operador escolhe o M2 nas duas saídas e vê ora a estrofe do telão, ora a
 * do retorno, sem nada na interface a explicar porquê.
 *
 * Em vez de tentar arbitrar isso no motor, o seletor deixa de o permitir: escolher um
 * monitor numa das saídas tira-o da outra.
 *
 * Módulo próprio, e não uma função no painel, porque é uma regra de dados — dá para a ler
 * e testar sem DOM, sem Electron e sem monitores.
 */

/** Valor de «Não exibir»: o monitor continua ligado, apenas não recebe conteúdo. */
export const SEM_EXIBICAO = -1;

/**
 * Devolve a rota sem o mesmo monitor nas duas saídas.
 *
 * `canalQuePrevalece` é a saída que o operador acabou de mexer — é ela que fica com o
 * monitor, e a outra passa a «Não exibir». Sem clique a decidir (uma rota gravada antes
 * desta regra existir), o Público prevalece: é a saída principal, e é a que se nota logo
 * se ficar vazia.
 *
 * Não toca em nada quando não há conflito, e devolve sempre um objecto novo — quem chama
 * pode guardá-lo sem se preocupar com partilha de referência.
 *
 * @param {{ publicoIndex: number, ministranteIndex: number, live?: boolean }} rota
 * @param {'publico'|'ministrante'} [canalQuePrevalece]
 * @returns {{ publicoIndex: number, ministranteIndex: number, live: boolean }}
 */
export function rotaSemMonitorRepetido(rota, canalQuePrevalece = 'publico') {
  const live = !!(rota && rota.live);
  const pub = Number.isFinite(rota?.publicoIndex) ? rota.publicoIndex : SEM_EXIBICAO;
  const min = Number.isFinite(rota?.ministranteIndex) ? rota.ministranteIndex : SEM_EXIBICAO;

  /* Live — OBS não usa monitor nenhum: não há conflito possível. */
  if (live) return { publicoIndex: SEM_EXIBICAO, ministranteIndex: SEM_EXIBICAO, live: true };
  /* «Não exibir» nas duas saídas é o estado normal de quem ainda não escolheu — e -1 === -1
     não é um conflito de monitor. */
  if (pub < 0 || pub !== min) return { publicoIndex: pub, ministranteIndex: min, live: false };

  return canalQuePrevalece === 'ministrante'
    ? { publicoIndex: SEM_EXIBICAO, ministranteIndex: min, live: false }
    : { publicoIndex: pub, ministranteIndex: SEM_EXIBICAO, live: false };
}
