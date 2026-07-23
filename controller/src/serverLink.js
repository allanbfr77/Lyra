'use strict';

const { io: SocketIOClient } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5510';

/**
 * Socket.IO cliente → servidor de projeção (porta 5510).
 * @param {object} ctx `controllerContext`
 */
function createServerLink(ctx) {
  function conectarServer() {
    if (ctx.serverSocket && ctx.serverSocket.connected) return;

    console.log('[Controller] Conectando ao servidor em', SERVER_URL);

    ctx.serverSocket = SocketIOClient(SERVER_URL, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    ctx.serverSocket.on('connect', () => {
      console.log('[Controller] Conectado ao servidor');
      ctx.serverConnected = true;
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('server-status', { connected: true });
      }
    });

    ctx.serverSocket.on('disconnect', () => {
      console.log('[Controller] Desconectado do servidor');
      ctx.serverConnected = false;
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('server-status', { connected: false });
      }
    });

    ctx.serverSocket.on('connect_error', (err) => {
      console.error('[Controller] Erro de conexão:', err.message);
      ctx.serverConnected = false;
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('server-status', { connected: false, error: err.message });
      }
    });

    ctx.serverSocket.on('estado', (estado) => {
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('server-estado', estado);
      }
    });

    ctx.serverSocket.on('display_config', (config) => {
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('server-display-config', config);
      }
    });

    ctx.serverSocket.on('audio_state', (audioState) => {
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('server-audio-state', audioState);
      }
    });
  }

  function desconectarServer() {
    if (ctx.serverSocket) {
      ctx.serverSocket.disconnect();
      ctx.serverSocket = null;
    }
    ctx.serverConnected = false;
  }

  function enviarParaServer(evento, dados) {
    if (!ctx.serverSocket || !ctx.serverSocket.connected) {
      console.warn('[Controller] Servidor não conectado, comando ignorado:', evento);
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('server-comando-falhou', { evento, erro: 'Servidor não conectado' });
      }
      return false;
    }
    ctx.serverSocket.emit(evento, dados);
    return true;
  }

  return { conectarServer, desconectarServer, enviarParaServer, SERVER_URL };
}

module.exports = { createServerLink, SERVER_URL };
