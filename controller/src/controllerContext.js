'use strict';

/**
 * Estado mutável compartilhado (janela, socket para o servidor, flags de updater e recarga).
 */
module.exports = {
  windowMain: null,
  serverSocket: null,
  serverConnected: false,
  controllerServer: null,

  updateReady: false,
  updateInfo: null,
  updateDownloading: false,
  verificacaoManualAtualizacao: false,
  checkingManual: false,

  controllerRecarregarEmCurso: false,
  controllerRecarregarPendente: false,
  suprimirQuitWindowAllClosedRecarregar: false,
  substituirJanelaAposFecharPorRecarregar: false,
  snapshotRecarregarJanelaBounds: null,
};
