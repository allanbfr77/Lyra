'use strict';

const fs = require('fs');
const path = require('path');

/** Pastas antigas de `userData` no Windows/macOS (productName / nome legado). */
const LEGACY_USER_DATA_DIR_NAMES = [
  'INVB Lyrics Controller',
  'INVB Lyrics Server',
  'Lyra Controlador',
  'Lyra Servidor',
  'invblyrics-controller',
  'invblyrics-server',
  'lyra-controller',
  'lyra-server',
];

/**
 * Copia ficheiro de origem para destino se o destino ainda não existir.
 * @param {string} src
 * @param {string} dest
 */
function copyIfMissing(src, dest) {
  if (!src || !dest || fs.existsSync(dest) || !fs.existsSync(src)) return;
  try {
    fs.copyFileSync(src, dest);
  } catch (_) {
  // intencional — erro ignorado
}
}

/**
 * Migra BD e playlists dentro da pasta `userData` atual e de instalações antigas.
 * @param {ReturnType<import('./paths').createUserPaths>} paths
 * @param {string} userDataRoot `app.getPath('userData')`
 */
function migrateUserDataFiles(paths, userDataRoot) {
  const newDb = paths.dbPathNew();
  const legacyDbInvb = paths.dbPathLegacyInvb();
  const legacyDbChurch = paths.dbPathLegacy();

  if (!fs.existsSync(newDb)) {
    if (fs.existsSync(legacyDbInvb)) copyIfMissing(legacyDbInvb, newDb);
    else if (fs.existsSync(legacyDbChurch)) copyIfMissing(legacyDbChurch, newDb);
  }

  const newPlaylists = paths.playlistsJsonPath();
  const legacyPlaylists = paths.playlistsJsonPathLegacy();
  if (!fs.existsSync(newPlaylists)) {
    copyIfMissing(legacyPlaylists, newPlaylists);
  }

  const appDataRoot = path.dirname(userDataRoot);
  const currentDirName = path.basename(userDataRoot);
  for (const dirName of LEGACY_USER_DATA_DIR_NAMES) {
    if (dirName === currentDirName) continue;
    const legacyRoot = path.join(appDataRoot, dirName);
    if (!fs.existsSync(legacyRoot)) continue;

    copyIfMissing(path.join(legacyRoot, 'lyra.db'), newDb);
    copyIfMissing(path.join(legacyRoot, 'invblyrics.db'), newDb);
    copyIfMissing(path.join(legacyRoot, 'churchdisplay.db'), newDb);
    copyIfMissing(path.join(legacyRoot, 'lyra_playlists.json'), newPlaylists);
    copyIfMissing(path.join(legacyRoot, 'invblyrics_playlists.json'), newPlaylists);
    copyIfMissing(path.join(legacyRoot, 'catalog.db'), paths.catalogPath());
  }
}

module.exports = { migrateUserDataFiles };
