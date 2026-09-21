/**
 * «Não exibir» do seletor unificado — Bíblia, Mídias e DOCS.
 *
 * ## O que este módulo resolve
 *
 * O «Não exibir» destes modos tinha um significado só: «este canal não reivindica
 * monitor». Bastava para libertar o ecrã, e não chegava para apagar o que já lá estava —
 * a fusão do motor (`apresentacao >= 0 ? apresentacao : slides`) deixava o índice do
 * Slides passar por baixo e o versículo ou a mídia continuavam acesos no telão enquanto a
 * prévia do painel, que olha para a rota do modo, já mostrava preto. E nas Mídias o
 * painel tapava o buraco pelo lado errado: escolher «Não exibir» **encerrava a mídia** —
 * vídeo e áudio paravam, o conteúdo era destruído, e voltar a exibir exigia projetar de
 * novo.
 *
 * A mecânica correcta já existia no modo Slides: uma **ordem explícita** que o motor
 * transporta em `semExibicaoOrdenada` e que o renderer cumpre com um lençol preto por
 * cima do conteúdo — a projeção continua activa, o vídeo continua a tocar, e levantar o
 * lençol revela o que já estava lá. Este módulo é o que falta para os modos do seletor
 * unificado entrarem nessa mesma mecânica: saber **quando a ordem existe**.
 *
 * ## Porque a ordem tem de ser registada, e não deduzida da rota
 *
 * `-1/-1` não distingue «o operador mandou apagar» de «ainda não há destino escolhido», e
 * estes modos nascem em `-1/-1` a cada arranque (são rotas de sessão) e voltam a `-1/-1`
 * ao encerrar a projeção ou ao sair do modo. Deduzir a ordem do `-1` poria um lençol
 * preto sobre o telão só por o operador ter aberto o Modo Bíblia com uma música no ar.
 *
 * Por isso a ordem nasce **do clique** no seletor, e só dele — a mesma regra e a mesma
 * razão de `reposicaoRotaSlides.js` para o modo Slides. Caminhos automáticos (encerrar,
 * sair do modo, sanitização, conflito entre modos) escrevem `-1` sem marcar, e aí o `-1`
 * continua a significar exactamente o que sempre significou.
 *
 * ## Porque não é o mesmo registo do Slides
 *
 * A mecânica é partilhada — campo, motor e lençol são os mesmos. O que difere é só a
 * leitura do gesto: o Slides tem dois seletores independentes (Público e Ministrante) e
 * precisa de saber qual deles o operador mexeu; aqui há **um** seletor com opções
 * fechadas (`Não exibir`, `Live — OBS`, `Público`, `Ministrante`, `Ambos`), e uma delas é
 * a ordem inteira. Juntar os dois registos obrigaria o do Slides a saber de opções que
 * não existem no seletor dele.
 *
 * Memória pura: morre no reload / reabertura, como a do Slides.
 */

'use strict';

/** Valor de «Não exibir»: o monitor continua ligado, apenas não recebe conteúdo. */
export const SEM_EXIBICAO = -1;

/** Chave da opção «Não exibir» no seletor unificado (ver `opcoesRoteamentoUnificadoModoApresentacao`). */
export const OPCAO_NAO_EXIBIR = 'des';

/** Modos que usam o seletor unificado do cabeçalho. */
const MODOS_UNIFICADOS = ['biblia', 'apresentacao', 'docs'];

/** @type {Record<string, boolean>} */
let ordemPorModo = Object.create(null);

function ehModoUnificado(modo) {
  return MODOS_UNIFICADOS.includes(String(modo || ''));
}

/** Nova sessão / testes: apaga as ordens registadas. */
export function limparOrdemNaoExibirUnificado() {
  ordemPorModo = Object.create(null);
}

/**
 * Regista o que o operador acabou de escolher no seletor unificado.
 *
 * Só o caminho do clique deve chamar isto. Escolher qualquer destino (monitor ou
 * «Live — OBS») retira a ordem — é o operador a dizer que quer ver outra vez.
 *
 * @param {string} modo modo de roteamento em vigor (`modoRoteamentoAtual()`)
 * @param {string} opcao chave da opção clicada (`des`, `live`, `pub`, `min`, `ambos`)
 */
export function registrarEscolhaSeletorUnificado(modo, opcao) {
  if (!ehModoUnificado(modo)) return;
  ordemPorModo[String(modo)] = String(opcao || '') === OPCAO_NAO_EXIBIR;
}

/**
 * Há ordem de «Não exibir» registada neste modo?
 * @param {string} modo
 * @returns {boolean}
 */
export function temOrdemNaoExibir(modo) {
  return !!ordemPorModo[String(modo || '')];
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
 * Canais que saem apagados por ordem do operador, neste modo, neste envio.
 *
 * Duas condições, e as duas têm de valer:
 *
 * 1. **a ordem existe** — o operador clicou «Não exibir» no seletor deste modo;
 * 2. **o canal sai mesmo a −1** — se algum ajuste lhe devolveu um monitor (o aviso do
 *    card 6, por exemplo, que partilha o canal `apresentacao`), há conteúdo para mostrar
 *    e nada a apagar. Mesma guarda do modo Slides, pela mesma razão.
 *
 * «Live — OBS» fica de fora: não é apagar o monitor, é mandar a saída para outro sítio.
 *
 * @param {string} modo modo de roteamento em vigor
 * @param {object} rotaEnviada rota tal como vai no pacote para o servidor
 * @returns {{publico: boolean, ministrante: boolean}}
 */
export function ordemNaoExibirDoSeletorUnificado(modo, rotaEnviada) {
  const NENHUM = { publico: false, ministrante: false };
  if (!ehModoUnificado(modo)) return NENHUM;
  if (!temOrdemNaoExibir(modo)) return NENHUM;
  const enviada = normalizar(rotaEnviada);
  if (enviada.live) return NENHUM;
  return {
    publico: enviada.publicoIndex < 0,
    ministrante: enviada.ministranteIndex < 0,
  };
}
