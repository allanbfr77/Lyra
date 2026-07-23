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
    errorLogPath: () => path.join(userDataRoot, 'error.log'),
  };
}

module.exports = { createUserPaths };
