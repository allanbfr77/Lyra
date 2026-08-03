'use strict';

/**
 * Porta de estado da projeção — sub-passo 1 da extração do `windows.js`
 * (ver docs/architecture/windows-extraction-plan.md §4).
 *
 * O motor de projeção não deve conhecer o formato do `serverContext`. Esta porta é a
 * ÚNICA superfície pela qual ele lê e escreve o estado da projeção.
 *
 * Hoje ela é um encaminhamento puro para o `ctx` (mesma leitura, mesma escrita, mesmas
 * referências — zero mudança de comportamento). Quando o motor for para o `core/`, a
 * mesma superfície passa a ser servida por um armazém próprio do Core, e nada mais no
 * motor precisa mudar. É a "porta instalada antes de mudar a casa".
 *
 * IMPORTANTE: os campos são acessores (get/set) e não cópias. Escrever
 * `state.estadoAtual = x` escreve no `ctx` real, exatamente como antes.
 */

/**
 * Estado da projeção propriamente dito (balde B do plano).
 * Vai virar estado interno do Core.
 */
const CAMPOS_ESTADO = [
  'estadoAtual',
  'estadoMinistrante',
  'estadoPublicoOverride',
  'ministranteApresentacaoOverride',
  'projecaoLiveAtiva',
  'displayConfig',
  'displayConfigBiblia',
  'modoVisualProjecaoAtivo',
];

/**
 * Registro de janelas (balde A do plano).
 *
 * `windowsDisplay` **saiu daqui no sub-passo 3b**: o registo das janelas de projeção é
 * agora privado ao motor (`lib/windowRegistry.js`). Se algum código antigo ainda tentar
 * `state.windowsDisplay`, obtém `undefined` e rebenta — que é o que se quer, por oposição
 * a operar sobre uma lista vazia em silêncio.
 *
 * `windowControl` é a janela do Server, não do motor — está aqui só porque o motor
 * ainda a notifica directamente (`estado_atualizado`, `telas_projecao_encerradas_esc`).
 * Sai da porta no sub-passo 4, quando essas notificações virarem eventos.
 */
const CAMPOS_JANELAS = ['windowControl'];

const CAMPOS_PORTA = [...CAMPOS_ESTADO, ...CAMPOS_JANELAS];

/**
 * Cria a porta de estado sobre uma fonte mutável (o `serverContext`).
 *
 * @param {object} fonte objecto com os campos de `CAMPOS_PORTA` (o `ctx` do Server)
 * @returns {object} porta com acessores que encaminham leitura e escrita para `fonte`
 */
function createProjectionState(fonte) {
  if (!fonte || typeof fonte !== 'object') {
    throw new TypeError('createProjectionState: fonte de estado inválida');
  }
  const porta = {};
  for (const campo of CAMPOS_PORTA) {
    Object.defineProperty(porta, campo, {
      enumerable: true,
      configurable: false,
      get() {
        return fonte[campo];
      },
      set(valor) {
        fonte[campo] = valor;
      },
    });
  }
  return porta;
}

module.exports = {
  createProjectionState,
  CAMPOS_ESTADO,
  CAMPOS_JANELAS,
  CAMPOS_PORTA,
};
