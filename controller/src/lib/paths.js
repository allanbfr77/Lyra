'use strict';

const path = require('path');

/**
 * Pasta da Bíblia (arquivos .sqlite) — asset estático de propriedade do controller.
 * Dev: `controller/data/biblia`. Instalador: `resources/biblia` (via extraResources).
 * Não depende do server em nenhum momento.
 */
function bibliaDataDirProjeto() {
  if (appElectronEmpacotado() && typeof process.resourcesPath === 'string' && process.resourcesPath) {
    return path.join(process.resourcesPath, 'biblia');
  }
  return path.resolve(__dirname, '../../data/biblia');
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

    /*
     * Ficheiros da projeção no modo «projetar nesta máquina».
     *
     * Mesmos nomes que o Servidor usa, mas sob o `userData` do Controlador — são dois
     * aplicativos distintos e cada um guarda a sua configuração de telas. Partilhar
     * ficheiro entre eles criaria a corrida que o modo local existe para evitar.
     */
    displaySettingsPath: () => path.join(userDataRoot, 'display-screens.json'),
    displayRoutingPath: () => path.join(userDataRoot, 'display-routing.json'),
    displayConfigPath: () => path.join(userDataRoot, 'display-config.json'),
  };
}

module.exports = {
  createUserPaths,
  catalogDataDirProjeto,
  catalogBundledDbPath,
  catalogLetrasDirProjeto,
};
