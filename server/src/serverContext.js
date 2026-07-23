'use strict';

/**
 * Estado mutável compartilhado entre o processo principal, HTTP/Socket, janelas e IPC.
 * Evita um único arquivo gigante com dezenas de `let` no topo.
 */
module.exports = {
  minimizeToTrayEnabled: false,
  tray: null,
  windowControl: null,
  /** Atualização baixada e pronta para `quitAndInstall`. */
  updateReady: false,
  verificacaoManualAtualizacao: false,
  checkingManual: false,

  windowsDisplay: [],
  io: null,
  audioOwnerSocketId: null,
  /** Socket.IO id do painel controlador (evento `registrar_controlador`). */
  controladorSocketId: null,
  /** Todos os controladores atualmente ligados ao servidor. */
  controladorSockets: new Map(),
  /** Último snapshot de playlists enviado pelo controlador (`controlador_playlists`). */
  ultimasPlaylistsControlador: null,

  /** Preenchido em `main.js` após `loadDisplayConfig` (modo Slides / padrão). */
  displayConfig: null,
  /** Overlay de exibição exclusivo do modo Bíblia (não grava no ficheiro de slides). */
  displayConfigBiblia: null,
  /** Último modo visual enviado pelo controlador (`preview_display_config` / `set_display_config`). */
  modoVisualProjecaoAtivo: null,

  estadoAtual: {
    tipo: null,
    titulo: '',
    linhas: [],
    linhasProximo: [],
    proximoSlidePreto: false,
    estrofeIndex: 0,
    totalEstrofes: 0,
    telaLimpa: true,
    blackout: false,
    slidePretoFinal: false,
  },
  estadoMinistrante: {
    titulo: '',
    atual: '',
    proximo: '',
    telaLimpa: true,
  },
  projecaoLiveAtiva: false,
  estadoPublicoOverride: null,
  ministranteApresentacaoOverride: null,
};
