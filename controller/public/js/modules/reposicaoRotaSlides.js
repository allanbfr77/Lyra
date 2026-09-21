/**
 * Reposição da rota do modo Slides à entrada no modo.
 *
 * ## A regra (sessão do programa)
 *
 * Enquanto o programa está aberto, a escolha MANUAL do operador no seletor do Slides
 * mantém-se ao navegar entre ecrãs — inclusive «Não exibir». Só o clique no seletor do
 * modo Slides conta como escolha manual.
 *
 * Se outro modo (ex.: Mídias) desliga temporariamente um canal do Slides por conflito,
 * isso NÃO é escolha manual. À entrada no Slides — ou quando o outro modo liberta o
 * monitor — esse canal é reposto no padrão (M2/M3), desde que o operador não o tenha
 * desligado à mão nesta sessão.
 *
 * ## Nova sessão (recarregar / reabrir)
 *
 * O estado manual vive só em memória. Ao recarregar ou reabrir o programa começa limpo:
 * não há «Não exibir» herdado, e o painel volta a detectar monitores e a aplicar o
 * padrão Público=M2 / Ministrante=M3.
 *
 * ## A armadilha que este módulo existe para não repetir
 *
 * Houve um tempo em que o padrão chegava aqui já desviado do ecrã da mídia, por um ajuste
 * que escolhia «outro qualquer» sem olhar para o ministrante: com o Mídias no M2 e dois
 * ecrãs, o «outro» era o M3, e o padrão chegava com público e ministrante no MESMO
 * monitor. Esse desvio acabou — a ocupação vive agora só no pacote para o servidor, ver
 * `supressaoCanalSlides.js` —, mas um padrão em colisão pode chegar por outras vias e a
 * assimetria abaixo continua a ser a resposta.
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
 * «Não exibir» escolhido à mão no seletor do Slides nesta sessão do programa.
 * Memória pura: morre no reload / reabertura. Nunca localStorage.
 * @type {{publico: boolean, ministrante: boolean}}
 */
let naoExibirManualSlides = { publico: false, ministrante: false };

/**
 * @returns {{publico: boolean, ministrante: boolean}}
 */
export function obterNaoExibirManualSlides() {
  return { publico: !!naoExibirManualSlides.publico, ministrante: !!naoExibirManualSlides.ministrante };
}

/** Nova sessão / testes: limpa a marca de «Não exibir» manual. */
export function limparNaoExibirManualSlides() {
  naoExibirManualSlides = { publico: false, ministrante: false };
}

/**
 * Regista a escolha que o operador acabou de fazer no seletor do modo Slides.
 *
 * Só o caminho do clique deve chamar isto. Caminhos automáticos (conflito com Mídias,
 * sanitização, etc.) escrevem −1 sem marcar — senão a desativação temporária virava
 * «Não exibir» manual e a reposição parava de funcionar.
 *
 * `canaisTocados` é o que fecha a última porta por onde isso ainda acontecia: a rota vem
 * do DOM inteiro, com as DUAS saídas, mas um clique só fala de uma. O −1 que o outro
 * seletor exibia — lá deixado por um caminho automático qualquer — era lido como escolha
 * à mão e nunca mais era reposto,
 * até recarregar o programa (esta marca só vive em memória). Omitido, reavalia os dois,
 * como antes.
 *
 * @param {object} rota rota lida da UI no instante do clique (antes de ajustes automáticos)
 * @param {{publico?: boolean, ministrante?: boolean}} [canaisTocados] Canais que o clique
 *   mexeu; os restantes conservam a marca que já tinham.
 */
export function sincronizarNaoExibirManualSlidesDaEscolha(rota, canaisTocados = null) {
  const r = normalizar(rota);
  const tocaPublico = !canaisTocados || !!canaisTocados.publico;
  const tocaMinistrante = !canaisTocados || !!canaisTocados.ministrante;
  naoExibirManualSlides = {
    publico: tocaPublico ? r.publicoIndex < 0 : !!naoExibirManualSlides.publico,
    ministrante: tocaMinistrante ? r.ministranteIndex < 0 : !!naoExibirManualSlides.ministrante,
  };
}

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
 * Há alguma saída desligada AUTOMATICAMENTE para repor?
 * Canais com «Não exibir» manual nesta sessão ficam intocados.
 * @param {object} entrada rota guardada do modo Slides
 * @param {{publico?: boolean, ministrante?: boolean}} [manual]
 */
export function precisaReporRotaSlides(entrada, manual = obterNaoExibirManualSlides()) {
  const e = normalizar(entrada);
  /* «Live — OBS» não é uma saída por monitor: não há nada a repor, e escrever índices por
     cima apagaria a escolha. O seletor do modo Slides nem sequer oferece Live — a guarda
     está aqui para o caso de uma rota antiga trazer a marca. */
  if (e.live) return false;
  const m = {
    publico: !!(manual && manual.publico),
    ministrante: !!(manual && manual.ministrante),
  };
  return (e.publicoIndex < 0 && !m.publico) || (e.ministranteIndex < 0 && !m.ministrante);
}

/**
 * Rota do modo Slides depois da reposição.
 *
 * @param {object} entrada Rota guardada (o que o operador deixou).
 * @param {object} padrao Rota de origem já ajustada ao que as Mídias ocupam — em
 *   `controllerAppCore.js` é o resultado de `rotaSlidesAoEntrarNoModo()`.
 * @param {{publico?: boolean, ministrante?: boolean}} [manual]
 * @returns {{publicoIndex: number, ministranteIndex: number, live: boolean}}
 */
export function rotaSlidesReposta(entrada, padrao, manual = obterNaoExibirManualSlides()) {
  const e = normalizar(entrada);
  if (e.live) return e;
  const p = normalizar(padrao);
  const m = {
    publico: !!(manual && manual.publico),
    ministrante: !!(manual && manual.ministrante),
  };

  /* Ordem importa: o ministrante decide-se contra o público JÁ resolvido, senão os dois
     podiam aceitar o mesmo monitor por não verem a decisão um do outro. */
  const publicoIndex =
    e.publicoIndex >= 0 ||
    m.publico ||
    p.publicoIndex < 0 ||
    p.publicoIndex === e.ministranteIndex
      ? e.publicoIndex
      : p.publicoIndex;

  const ministranteIndex =
    e.ministranteIndex >= 0 ||
    m.ministrante ||
    p.ministranteIndex < 0 ||
    p.ministranteIndex === publicoIndex
      ? e.ministranteIndex
      : p.ministranteIndex;

  return { publicoIndex, ministranteIndex, live: false };
}
