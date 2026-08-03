'use strict';

const { createControlWindowApi } = require('./controlWindow');
const { createProjectionState } = require('./lib/projectionState');
const { createProjectionEngine } = require('@lyra/projection-core');

/**
 * Adaptador do Server sobre o Projection Core.
 *
 * Junta duas coisas que estavam misturadas no mesmo ficheiro até o sub-passo 4b:
 *
 * - a **janela de controle do Server** (`controlWindow.js`) — a UI local do Server, que
 *   precisa do `ctx`, do `app` e do `WINDOW_TITLE`, e que **não é motor de projeção**;
 * - o **motor de projeção** (`core/projectionEngine.js`) — que não conhece nada disso.
 *
 * A API pública devolvida é exactamente a de antes, para os chamadores existentes
 * (`main.js`, `httpServer.js`, `ipcHandlers.js`, `tray.js`) não notarem a mudança.
 *
 * O `ctx` **não é repassado ao motor**: é convertido na porta de estado
 * (`lib/projectionState.js`). É por aqui que, no modo local, o Controller passará o
 * armazém do próprio Core em vez de um `ctx`.
 *
 * @param {object} ctx Estado mutável (`serverContext.js`).
 * @param {object} paths Objeto retornado por `createUserPaths(userData)`.
 * @param {{
 *   logError: Function, screen: object, BrowserWindow: object, app: object, WINDOW_TITLE: string,
 *   onProjecaoEncerrada: Function, haOperadorConectado: Function,
 *   resolverPaginaProjecao: Function, caminhoIconeApp: Function,
 *   state?: object
 * }} deps
 */
function createWindowsApi(ctx, paths, deps) {
  const { logError, screen, BrowserWindow, app, WINDOW_TITLE } = deps;

  const controlWindowApi = createControlWindowApi(ctx, {
    logError,
    BrowserWindow,
    app,
    WINDOW_TITLE,
  });

  const engine = createProjectionEngine(paths, {
    logError,
    screen,
    BrowserWindow,
    /* O motor nunca vê o `ctx`. A porta encaminha leitura e escrita para ele enquanto o
       Core viver dentro do Server. */
    state: deps.state || createProjectionState(ctx),
    onProjecaoEncerrada: deps.onProjecaoEncerrada,
    haOperadorConectado: deps.haOperadorConectado,
    resolverPaginaProjecao: deps.resolverPaginaProjecao,
    caminhoIconeApp: deps.caminhoIconeApp,
  });

  return {
    ...engine,
    getJanelaControle: controlWindowApi.getJanelaControle,
    criarJanelaControle: controlWindowApi.criarJanelaControle,
    showMainWindow: controlWindowApi.showMainWindow,
    recarregarJanelaControle: controlWindowApi.recarregarJanelaControle,
    openMainDevTools: controlWindowApi.openMainDevTools,
  };
}

module.exports = { createWindowsApi };
