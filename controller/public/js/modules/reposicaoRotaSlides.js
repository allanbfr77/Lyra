/**
 * Reposição da rota do modo Slides à entrada no modo.
 *
 * ## A regra
 *
 * «Não exibir» no modo Slides vale só DENTRO da sessão do modo. O operador pode desligar
 * uma saída e trabalhar assim; ao sair e voltar — ou ao reabrir o programa — os monitores
 * voltam. É o modo rápido: quem entra nele a meio do culto não pode encontrar «Não exibir»
 * à sua espera.
 *
 * É por canal, e não só quando as duas saídas estão vazias, porque uma saída sozinha
 * desligada é quase sempre rasto de outro modo. Quando o Mídias toma o M2, a regra de
 * exclusão tira o M2 daqui — e nada o devolvia quando a mídia era encerrada. Repor à
 * entrada é o que fecha esse ciclo.
 *
 * ## A armadilha que este módulo existe para não repetir
 *
 * `ajustarSlidesSemConflitoComApresentacao()` desvia o público do ecrã que a mídia está a
 * usar chamando `outroIndiceMonitor()` — que devolve «outro qualquer», sem olhar para o
 * ministrante. Com o Mídias no M2 e dois ecrãs de projeção, o «outro» é o M3: o padrão
 * chega aqui com público e ministrante no MESMO monitor.
 *
 * Resolver essa colisão pela regra «um monitor, uma saída» (`saidasMonitorExclusivas`)
 * dava-a por resolvida pelo lado errado — o público ficava com o M3 e o ministrante, que
 * ninguém tinha tocado, era desligado. Era um bug reportado em teste.
 *
 * Por isso a assimetria abaixo é deliberada: **a saída que já tem monitor manda**. A que
 * está a ser reposta só aceita o padrão se ele não for o ecrã da outra; caso contrário fica
 * em «Não exibir» — que é a resposta certa e não um fracasso. Com o Mídias no M2 e o
 * ministrante no M3, não sobrou ecrã nenhum para o telão, e dizê-lo é melhor do que
 * inventar um.
 */

/** Valor de «Não exibir»: o monitor continua ligado, apenas não recebe conteúdo. */
export const SEM_EXIBICAO = -1;

/**
 * @param {any} obj
 * @returns {{publicoIndex: number, ministranteIndex: number, live: boolean}}
 */
function normalizar(obj) {
  const live = !!(obj && obj.live);
  const pub = parseInt(obj?.publicoIndex, 10);
  const min = parseInt(obj?.ministranteIndex, 10);
  return {
    publicoIndex: live ? SEM_EXIBICAO : Number.isFinite(pub) ? pub : SEM_EXIBICAO,
    ministranteIndex: live ? SEM_EXIBICAO : Number.isFinite(min) ? min : SEM_EXIBICAO,
    live,
  };
}

/**
 * Há alguma saída desligada para repor?
 * @param {object} entrada rota guardada do modo Slides
 */
export function precisaReporRotaSlides(entrada) {
  const e = normalizar(entrada);
  /* «Live — OBS» não é uma saída por monitor: não há nada a repor, e escrever índices por
     cima apagaria a escolha. O seletor do modo Slides nem sequer oferece Live — a guarda
     está aqui para o caso de uma rota antiga trazer a marca. */
  if (e.live) return false;
  return e.publicoIndex < 0 || e.ministranteIndex < 0;
}

/**
 * Rota do modo Slides depois da reposição.
 *
 * @param {object} entrada Rota guardada (o que o operador deixou).
 * @param {object} padrao Rota de origem já ajustada ao que as Mídias ocupam — em
 *   `controllerAppCore.js` é o resultado de `rotaSlidesAoEntrarNoModo()`.
 * @returns {{publicoIndex: number, ministranteIndex: number, live: boolean}}
 */
export function rotaSlidesReposta(entrada, padrao) {
  const e = normalizar(entrada);
  if (e.live) return e;
  const p = normalizar(padrao);

  /* Ordem importa: o ministrante decide-se contra o público JÁ resolvido, senão os dois
     podiam aceitar o mesmo monitor por não verem a decisão um do outro. */
  const publicoIndex =
    e.publicoIndex >= 0 || p.publicoIndex < 0 || p.publicoIndex === e.ministranteIndex
      ? e.publicoIndex
      : p.publicoIndex;

  const ministranteIndex =
    e.ministranteIndex >= 0 || p.ministranteIndex < 0 || p.ministranteIndex === publicoIndex
      ? e.ministranteIndex
      : p.ministranteIndex;

  return { publicoIndex, ministranteIndex, live: false };
}
