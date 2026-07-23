'use strict';

const path = require('path');

function bibliaDataDirProjeto() {
  if (!process.defaultApp && typeof process.resourcesPath === 'string' && process.resourcesPath) {
    return path.join(process.resourcesPath, 'server', 'data');
  }
  return path.resolve(__dirname, '../../../server/data');
}

function bibliaSqlitePathProjeto(traducao) {
  return path.join(bibliaDataDirProjeto(), `${String(traducao || '').trim().toUpperCase()}.sqlite`);
}

function appElectronEmpacotado() {
  try {
    const { app } = require('electron');
    return !!app.isPackaged;
  } catch (_) {
    return false;
  }
}

/** Pasta do catálogo offline empacotado (`data/catalog` no dev, `resources/catalog` no instalador). */
function catalogDataDirProjeto() {
  const projectDir = path.resolve(__dirname, '../../../data/catalog');
  if (appElectronEmpacotado() && typeof process.resourcesPath === 'string' && process.resourcesPath) {
    return path.join(process.resourcesPath, 'catalog');
  }
  return projectDir;
}

function catalogBundledDbPath() {
  return path.join(catalogDataDirProjeto(), 'catalog.db');
}

function catalogLetrasDirProjeto() {
  return path.join(catalogDataDirProjeto(), 'letras');
}

/**
 * @param {string} userDataRoot `app.getPath('userData')`
 */
function createUserPaths(userDataRoot) {
  return {
    dbPathNew: () => path.join(userDataRoot, 'lyra.db'),
    dbPathLegacyInvb: () => path.join(userDataRoot, 'invblyrics.db'),
    dbPathLegacy: () => path.join(userDataRoot, 'churchdisplay.db'),
    /** Cópia opcional em userData (legado); preferir `catalogBundledDbPath`. */
    catalogPath: () => path.join(userDataRoot, 'catalog.db'),
    catalogBundledDbPath: () => catalogBundledDbPath(),
    catalogLetrasDirProjeto: () => catalogLetrasDirProjeto(),
    playlistsJsonPath: () => path.join(userDataRoot, 'lyra_playlists.json'),
    playlistsJsonPathLegacy: () => path.join(userDataRoot, 'invblyrics_playlists.json'),
    sharedSyncMetaPath: () => path.join(userDataRoot, 'lyra_shared_sync_meta.json'),
    bibliaDataDir: () => bibliaDataDirProjeto(),
    bibliaSqlitePath: (traducao) => bibliaSqlitePathProjeto(traducao),
    /** Vídeos do card 5 (modo apresentação) persistidos em disco. */
    apresentacaoVideosDir: () => path.join(userDataRoot, 'apresentacao-videos'),
  };
}

module.exports = {
  createUserPaths,
  catalogDataDirProjeto,
  catalogBundledDbPath,
  catalogLetrasDirProjeto,
};
