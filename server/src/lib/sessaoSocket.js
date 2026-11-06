'use strict';

/**
 * Emissão e renovação do token de sessão do controlador pelo socket (Entrega 1).
 *
 * O token é emitido SÓ para socket autorizado, pelo próprio socket (evento `sessao_controlador`),
 * reemitido a 70% da validade (o cliente não precisa pedir) e revogado na desconexão. Clientes que
 * não conhecem o evento simplesmente o ignoram: nada muda para eles.
 */

/**
 * @param {object} p
 * @param {{emitir: Function, revogarSocket: Function}} p.sessoes
 * @param {Function} [p.logError]
 * @param {() => number} [p.agora]
 * @param {(fn: Function, ms: number) => any} [p.agendar]
 * @param {(t: any) => void} [p.cancelar]
 */
function criarEmissorSessao({ sessoes, logError = () => {}, agora = Date.now, agendar = setTimeout, cancelar = clearTimeout }) {
  /** socketId -> timer da próxima renovação */
  const renovacoes = new Map();

  function parar(socketId) {
    const t = renovacoes.get(socketId);
    if (t) cancelar(t);
    renovacoes.delete(socketId);
  }

  function emitir(socket) {
    try {
      const deviceId = socket.data && socket.data.device && socket.data.device.deviceId;
      if (!deviceId || socket.data.autorizado !== true) return false;
      const { token, expiraEm } = sessoes.emitir({ socketId: socket.id, deviceId });
      socket.emit('sessao_controlador', { token, expiraEm });
      parar(socket.id);
      const t = agendar(() => emitir(socket), Math.max(1000, Math.floor((expiraEm - agora()) * 0.7)));
      if (t && typeof t.unref === 'function') t.unref();
      renovacoes.set(socket.id, t);
      return true;
    } catch (e) {
      logError('sessao-controlador', e);
      return false;
    }
  }

  /** Desconexão: para a renovação e revoga o token do socket. */
  function encerrar(socketId) {
    parar(socketId);
    try { sessoes.revogarSocket(socketId); } catch (e) { logError('sessao-controlador-revogar', e); }
  }

  return Object.freeze({ emitir, encerrar, pendentes: () => renovacoes.size });
}

module.exports = { criarEmissorSessao };
