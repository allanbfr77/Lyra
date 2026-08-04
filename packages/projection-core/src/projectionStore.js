'use strict';

const projectionPayloads = require('./projectionPayloads');
const displayConfigLib = require('./displayConfig');

/**
 * Armazém de estado da projeção — a outra ponta da porta de estado.
 *
 * O Servidor serve essa porta com `createProjectionState(ctx)`, um encaminhamento para o
 * `serverContext`. Isso resolvia o problema de então: tirar o `ctx` de dentro do motor
 * sem mexer no Servidor. Mas deixava o estado a viver no `ctx` — e o Controlador não tem
 * `serverContext` nenhum, nem faz sentido inventar-lhe um só para projetar.
 *
 * Este módulo é o dono do estado quando não há Servidor: mesmos campos, mesma superfície,
 * sem hospedeiro. É o que fecha a promessa que a porta de estado abriu.
 *
 * ## Porque é um objecto simples e não uma classe com métodos
 *
 * Os módulos de projeção que já existem — `projectionEncerrar`, `displayConfigModo` —
 * recebem o estado e escrevem nele por atribuição directa (`ctx.estadoAtual = ...`). Um
 * armazém com `setEstadoAtual()` obrigaria a reescrever todos eles. O formato é imposto
 * pelo código que já funciona, não escolhido do zero.
 */

/**
 * Estado inicial de uma projeção que ainda não começou: tudo limpo, nada nas telas.
 *
 * @param {{ displayConfig?: object, displayConfigBiblia?: object }} [inicial]
 *   Config já lida do disco pelo host. Sem ela, arranca nos valores por omissão — que é
 *   o que acontece na primeira execução, antes de existir ficheiro de config.
 */
function criarArmazemDeProjecao(inicial = {}) {
  return {
    /** O que está projetado agora (música, versículo, ou nada). */
    estadoAtual: projectionPayloads.estadoPublicoOcioso(),

    /** Texto da tela do ministrante (atual / próximo). */
    estadoMinistrante: { titulo: '', atual: '', proximo: '', telaLimpa: true },

    /**
     * Camada que cobre o telão por cima do `estadoAtual` — apresentação, aviso, ou uma
     * tela limpa forçada quando o versículo vai só ao ministrante. `null` = nada por cima.
     */
    estadoPublicoOverride: null,

    /** O mesmo, para o canal do ministrante. */
    ministranteApresentacaoOverride: null,

    /** Projeção destinada ao canal «live» (OBS) em vez do telão físico. */
    projecaoLiveAtiva: false,

    /** Config visual dos slides (tipografia, fundo, relógio) por canal. */
    displayConfig:
      inicial.displayConfig ||
      displayConfigLib.mergeDisplayConfigLayers(displayConfigLib.DEFAULT_DISPLAY_CONFIG, {}),

    /**
     * Config visual do modo Bíblia, guardada à parte.
     *
     * São dois conjuntos e não um: entrar no modo Bíblia não pode comer o tema dos
     * slides, e sair dele tem de repor exactamente o que estava.
     */
    displayConfigBiblia: inicial.displayConfigBiblia || { publico: {}, ministrante: {}, clock: {} },

    /** Qual das duas configs está em vigor nas janelas neste momento. */
    modoVisualProjecaoAtivo: 'slides',

    /**
     * Janela de controle do host.
     *
     * O motor ainda a notifica directamente (`estado_atualizado`,
     * `telas_projecao_encerradas_esc`). No Servidor é a janela do Server; no Controlador
     * é o próprio painel. Fica aqui porque a porta de estado a inclui — não porque seja
     * estado de projeção.
     */
    windowControl: null,
  };
}

module.exports = { criarArmazemDeProjecao };
