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

/**
 * Caminho absoluto de uma página de overlay do OBS, dentro deste pacote.
 *
 * Viveram em `server/public/` enquanto o OBS era assunto do Servidor. Deixaram de ser: no
 * modo local é o Controlador que hospeda a porta 5510 e serve estas páginas. Mesma
 * mudança que as `display*.html` fizeram no sub-passo 4a, e pelo mesmo motivo — um host
 * não deve ir buscar HTML ao pacote do outro.
 *
 * @param {'obs.html'|'obs-biblia.html'|'obs-slides.html'} nome
 */
function paginaObs(nome) {
  return path.join(__dirname, '..', 'public', nome);
}

module.exports = {
  // motor
  createProjectionEngine: require('./projectionEngine').createProjectionEngine,
  createWindowRegistry: require('./windowRegistry').createWindowRegistry,
  paginaProjecao,
  paginaObs,

  // estado da projeção sem hospedeiro (o Controlador não tem serverContext)
  criarArmazemDeProjecao: require('./projectionStore').criarArmazemDeProjecao,

  // tradutor comando → motor (o miolo dos handlers de socket do Servidor)
  criarAplicadorDeComandos: require('./commandApplier').criarAplicadorDeComandos,
  estadoBibliaParaObs: require('./commandApplier').estadoBibliaParaObs,
  alvosDaDifusao: require('./commandApplier').alvosDaDifusao,
  ALCANCE_TODOS: require('./commandApplier').ALCANCE_TODOS,
  ALCANCE_OUTROS: require('./commandApplier').ALCANCE_OUTROS,

  // módulos de projeção (também usados directamente pelo Servidor)
  comentariosSlide: require('./comentariosSlide'),
  /* Regra da contagem regressiva: pura, sem relógio nem DOM. O renderer das telas usa-a
     para formatar os dígitos; o aplicador, para mexer no tempo. */
  contagemRegressiva: require('./contagemRegressiva'),
  displayConfig: require('./displayConfig'),
  displayConfigModo: require('./displayConfigModo'),
  displayConfigTransforms: require('./displayConfigTransforms'),
  displayIndices: require('./displayIndices'),
  displayRouting: require('./displayRouting'),
  localIp: require('./localIp'),
  /* Guarda de acesso à porta 5510. Vive aqui porque os dois hosts a servem, e o celular
     tem de se autenticar da mesma maneira nos dois modos. */
  controleAcesso: require('./controleAcesso'),
  monitorsList: require('./monitorsList'),
  projectionEncerrar: require('./projectionEncerrar'),
  projectionPayloads: require('./projectionPayloads'),
};
