/**
 * Supressão do canal Slides enquanto o Modo Bíblia manda no telão.
 *
 * ## O problema que isto resolve
 *
 * No servidor há três canais — `slides`, `apresentacao` e `contagem` — e a Bíblia não tem
 * canal próprio: ela viaja no `apresentacao`. O motor funde os dois com
 * `a.publicoIndex >= 0 ? a.publicoIndex : s.publicoIndex` (ver `displayRouting.js`), ou
 * seja, um canal da Bíblia em «Não exibir» deixa o índice do Slides passar por baixo.
 *
 * Com a Bíblia só no público (M2), o `ministranteIndex` do Slides escorregava para o M3 e
 * o motor abria lá uma janela de ministrante com o conteúdo do Slides — quando o M3 devia
 * estar preto. O escudo preto de `indicesMonitoresEscudoPreto()` («Bíblia só no M2 →
 * escudo no M3») só cobre monitores que ninguém reivindicou, e o índice do Slides a vazar
 * reivindicava-o.
 *
 * A neutralização, portanto, é necessária. Ao contrário do Modo Mídias — que roda ao mesmo
 * tempo que o Slides e por isso liberta apenas o monitor em conflito
 * (`desfazerConflitoSlidesComRotaApresentacao`) — o Modo Bíblia substitui a área de
 * trabalho do Slides: enquanto está aberto, nenhum canal do Slides pode reclamar monitor.
 *
 * ## Porque isto é uma função pura, e não uma escrita em `rotasPorModo`
 *
 * A versão anterior conseguia o mesmo efeito **zerando `rotasPorModo.slides`**. Funcionava
 * durante o culto e destruía a configuração do operador: logo a seguir corre
 * `persistirIdentidadesDosModos()`, que grava no `LS_IDENTIDADE_MONITORES` os `null` de um
 * Slides sem monitor — e `guardarIdentidadesRota` guarda `null` como «desativado
 * explícito», de propósito. No arranque seguinte `restaurarRotaPorIdentidade()` calculava
 * `houveSalvo === false`, devolvia a rota do servidor (também a −1), e o preenchimento
 * automático M2/M3 não corria porque `rotaFoiDefinidaPeloOperador('slides')` já era `true`.
 * Resultado: **escolher um monitor no Modo Bíblia uma única vez apagava para sempre o
 * telão configurado do Modo Slides.**
 *
 * Silenciar não pode custar a anotação de qual monitor era do Slides. Aqui a supressão é
 * calculada no momento de montar o pacote que vai para o servidor e não sobrevive a ele;
 * `rotasPorModo.slides` fica intacto, e sair do Modo Bíblia devolve o M2/M3 sozinho.
 *
 * Módulo próprio porque é uma regra de dados: lê-se e testa-se sem DOM, sem Electron e sem
 * monitores ligados.
 */

/** Valor de «Não exibir»: o monitor continua ligado, apenas não recebe conteúdo. */
export const SEM_EXIBICAO = -1;

/**
 * @typedef {object} RotaCanal
 * @property {number} publicoIndex Índice do monitor público, ou -1.
 * @property {number} ministranteIndex Índice do monitor do ministrante, ou -1.
 * @property {boolean} [live] Destino «Live — OBS» (não usa monitor nenhum).
 */

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
 * O Modo Bíblia está a reclamar o canal partilhado?
 *
 * «Live — OBS» conta: não ocupa monitor físico, mas é uma projeção de Bíblia a decorrer, e
 * deixar o índice do Slides passar por baixo poria a letra da música no telão enquanto o
 * versículo sai para o OBS.
 *
 * Bíblia em «Não exibir» (−1/−1, sem live) **não** conta: aí o operador não escolheu
 * destino nenhum e não há nada a proteger — suprimir o Slides ali seria apagar o telão sem
 * ninguém ter pedido.
 *
 * @param {RotaCanal} rotaBiblia
 * @returns {boolean}
 */
export function bibliaReclamaCanalPartilhado(rotaBiblia) {
  const b = normalizar(rotaBiblia);
  return b.live || b.publicoIndex >= 0 || b.ministranteIndex >= 0;
}

/**
 * Rota do Slides tal como deve seguir **no pacote para o servidor**, com o Modo Bíblia
 * aberto. Não é a configuração do operador e não deve ser gravada em lado nenhum.
 *
 * Devolve sempre um objecto novo — quem chama pode passá-lo ao `JSON.stringify` sem
 * partilhar referência com `rotasPorModo.slides`.
 *
 * @param {RotaCanal} rotaBiblia Rota do Modo Bíblia (o que o operador escolheu no seletor).
 * @param {RotaCanal} rotaSlides Configuração guardada do Modo Slides.
 * @returns {{publicoIndex: number, ministranteIndex: number, live: boolean}}
 */
export function rotaSlidesParaEnvioComBiblia(rotaBiblia, rotaSlides) {
  const s = normalizar(rotaSlides);
  if (!bibliaReclamaCanalPartilhado(rotaBiblia)) return s;
  return { publicoIndex: SEM_EXIBICAO, ministranteIndex: SEM_EXIBICAO, live: false };
}
