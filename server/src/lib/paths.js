'use strict';

const path = require('path');

/**
 * Caminhos de arquivos JSON e log sob `userData` do Electron.
 * @param {string} userDataRoot Retorno de `app.getPath('userData')`.
 */
function createUserPaths(userDataRoot) {
  return {
    displaySettingsPath: () => path.join(userDataRoot, 'display-screens.json'),
    displayRoutingPath: () => path.join(userDataRoot, 'display-routing.json'),
    serverPrefsPath: () => path.join(userDataRoot, 'server-app-preferences.json'),
    displayConfigPath: () => path.join(userDataRoot, 'display-config.json'),
    sharedDbSyncPath: () => path.join(userDataRoot, 'shared-db-sync.json'),
    /** Allowlist de controladores autorizados (deviceId + secret). Usada pelo controleAcesso. */
    allowlistPath: () => path.join(userDataRoot, 'controladores-allowlist.json'),
    errorLogPath: () => path.join(userDataRoot, 'error.log'),
    /* Diário de bordo das janelas de projeção. Mesmo nome que no Controlador: o motor é
       o mesmo e quem lê os dois ficheiros não devia ter de aprender dois formatos. */
    diagnosticoTelasPath: () => path.join(userDataRoot, 'lyra-telas.log'),
  };
}

module.exports = { createUserPaths };
