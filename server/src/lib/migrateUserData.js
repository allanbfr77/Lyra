'use strict';

const fs = require('fs');
const path = require('path');

const LEGACY_USER_DATA_DIR_NAMES = [
  'INVB Lyrics Server',
  'INVB Lyrics Controller',
  'Lyra Servidor',
  'Lyra Controlador',
  'invblyrics-server',
  'invblyrics-controller',
  'lyra-server',
  'lyra-controller',
];

const PREF_FILES = [
  'display-screens.json',
  'display-routing.json',
  'server-app-preferences.json',
  'display-config.json',
];

/**
 * Copia preferências do servidor de pastas `userData` de instalações antigas.
 * @param {string} userDataRoot
 */
function migrateServerUserData(userDataRoot) {
  const appDataRoot = path.dirname(userDataRoot);
  const currentDirName = path.basename(userDataRoot);

  for (const dirName of LEGACY_USER_DATA_DIR_NAMES) {
    if (dirName === currentDirName) continue;
    const legacyRoot = path.join(appDataRoot, dirName);
    if (!fs.existsSync(legacyRoot)) continue;

    for (const file of PREF_FILES) {
      const src = path.join(legacyRoot, file);
      const dest = path.join(userDataRoot, file);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        try {
          fs.copyFileSync(src, dest);
        } catch (_) {
  // intencional — erro ignorado
}
      }
    }
  }
}

module.exports = { migrateServerUserData };
