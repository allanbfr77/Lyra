'use strict';

/**
 * Estado mutável compartilhado (janela, API HTTP do controlador, flags de updater e recarga).
 * A ligação ao Servidor remoto vive no renderer (`controllerAppCore.js`), não no main.
 */
module.exports = {
  windowMain: null,
  controllerServer: null,

  updateReady: false,
  updateInfo: null,
  updateDownloading: false,
  verificacaoManualAtualizacao: false,
  checkingManual: false,

  /* Companion update do Servidor (artefacto sem versão de produto). */
  companionManifest: null,
  companionUpdateAvailable: false,
  companionUpdateInfo: null,
  companionInstallInProgress: false,

  controllerRecarregarEmCurso: false,
  controllerRecarregarPendente: false,
  suprimirQuitWindowAllClosedRecarregar: false,
  substituirJanelaAposFecharPorRecarregar: false,
  snapshotRecarregarJanelaBounds: null,
};
