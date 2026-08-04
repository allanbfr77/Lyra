'use strict';

const path = require('path');

/**
 * Superfície pública do Projection Core.
 *
 * Um único ponto de entrada em vez de caminhos internos: quem consome escreve
 * `require('@lyra/projection-core')`, não `.../src/displayConfig`. Assim a organização
 * interna do pacote pode mudar sem tocar nos consumidores.
 */

/**
 * Caminho absoluto de uma página do renderer de projeção, **dentro deste pacote**.
 *
 * O motor recebe isto por `deps.resolverPaginaProjecao` — continua injectável, para um
 * host poder servir páginas próprias. Mas o default certo mora aqui: as páginas são do
 * Core, e antes do empacotamento viviam em `server/public/`, o que obrigava o Controlador
 * a carregar HTML de dentro do pacote do Servidor.
 *
 * @param {string} nome `display.html` | `display-operator.html` | `display-clock.html`
 */
function paginaProjecao(nome) {
  return path.join(__dirname, '..', 'public', nome);
}

module.exports = {
  // motor
  createProjectionEngine: require('./projectionEngine').createProjectionEngine,
  createWindowRegistry: require('./windowRegistry').createWindowRegistry,
  paginaProjecao,

  // tradutor comando → motor (o miolo dos handlers de socket do Servidor)
  criarAplicadorDeComandos: require('./commandApplier').criarAplicadorDeComandos,
  estadoBibliaParaObs: require('./commandApplier').estadoBibliaParaObs,
  ALCANCE_TODOS: require('./commandApplier').ALCANCE_TODOS,
  ALCANCE_OUTROS: require('./commandApplier').ALCANCE_OUTROS,

  // módulos de projeção (também usados directamente pelo Servidor)
  comentariosSlide: require('./comentariosSlide'),
  displayConfig: require('./displayConfig'),
  displayConfigModo: require('./displayConfigModo'),
  displayConfigTransforms: require('./displayConfigTransforms'),
  displayIndices: require('./displayIndices'),
  displayRouting: require('./displayRouting'),
  monitorsList: require('./monitorsList'),
  projectionEncerrar: require('./projectionEncerrar'),
  projectionPayloads: require('./projectionPayloads'),
};
