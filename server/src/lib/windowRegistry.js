'use strict';

/**
 * Registo das janelas de projeção — sub-passo 3b da extração do `windows.js`
 * (ver docs/architecture/windows-extraction-plan.md §4).
 *
 * Antes, o motor manipulava `ctx.windowsDisplay` directamente em 28 sítios: `push`,
 * reatribuição do array inteiro, `filter`, `forEach`, `some`, `length`. O array vivia no
 * `serverContext`, o que significava que qualquer parte do Server podia mexer nele.
 *
 * Agora o array é **privado deste módulo** e o motor é o seu único dono. Quando o motor
 * for para o `core/` (sub-passo 4), o registo vai junto sem mudar uma linha de quem o usa.
 *
 * Cada entrada é `{ role, index, win, ...extras }`, onde `role` é
 * `'publico' | 'ministrante' | 'escudo' | 'relogio'` e `win` é uma `BrowserWindow`.
 * As entradas são guardadas por referência de propósito: o motor anota estado nelas
 * (ex.: `entry.ocultoParaRelogio`) e essa anotação tem de persistir.
 */

function createWindowRegistry() {
  /** @type {Array<{ role: string, index: number, win: object }>} */
  let entradas = [];

  return {
    /**
     * Todas as entradas, na ordem de inserção.
     * Devolve uma cópia do ARRAY (o motor não pode reordenar o registo por fora), mas as
     * entradas são as mesmas referências — anotações feitas nelas continuam a valer.
     */
    todas() {
      return entradas.slice();
    },

    /** Entradas de um papel. */
    porRole(role) {
      return entradas.filter((entry) => entry?.role === role);
    },

    /** Entradas de um papel cuja janela ainda existe. */
    vivasPorRole(role) {
      return entradas.filter((entry) => entry?.role === role && entry?.win && !entry.win.isDestroyed());
    },

    /** Quantas entradas há no registo. */
    tamanho() {
      return entradas.length;
    },

    /** Regista uma janela recém-aberta. */
    adicionar(entrada) {
      entradas.push(entrada);
      return entrada;
    },

    /** Substitui o registo inteiro (usado nas resincronizações que reconstroem a lista). */
    substituirPor(lista) {
      entradas = Array.isArray(lista) ? lista.slice() : [];
    },

    /** Remove as entradas que satisfazem o predicado. */
    remover(predicado) {
      entradas = entradas.filter((entry) => !predicado(entry));
    },

    /** Esvazia o registo. Não fecha janelas — quem fecha é o motor. */
    limpar() {
      entradas = [];
    },
  };
}

module.exports = { createWindowRegistry };
