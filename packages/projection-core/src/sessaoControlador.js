'use strict';

/**
 * Token de sessão do controlador (Entrega 1).
 *
 * O bastão de escrita pertence a um SOCKET, mas uma requisição HTTP só traz credencial de
 * DISPOSITIVO — e o mesmo dispositivo pode ter vários sockets (duas janelas do mesmo PC). Este
 * token resolve a ambiguidade: o Servidor o emite pelo próprio socket autenticado, o cliente o
 * devolve no cabeçalho `X-Lyra-Session` das chamadas HTTP, e o Servidor descobre EXATAMENTE de
 * qual socket a chamada veio.
 *
 * Regras:
 *  - ligado a UM socket e a UM dispositivo; só vale junto com a credencial do mesmo dispositivo
 *    (não é uma credencial: não autentica ninguém sozinho);
 *  - validade curta (o Servidor reemite antes de expirar) e revogado na desconexão ou quando o
 *    dispositivo perde a autorização;
 *  - guardado só em memória, por HASH (um despejo de memória/log não entrega o token);
 *  - nunca em log, nunca em evento.
 */

const crypto = require('crypto');

const VALIDADE_PADRAO_MS = 10 * 60 * 1000;
const MAX_SESSOES_PADRAO = 500;
const RE_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

const hash = (token) => crypto.createHash('sha256').update(token).digest('base64url');

/**
 * @param {object} [p]
 * @param {() => number} [p.agora]
 * @param {number} [p.validadeMs]
 * @param {number} [p.maxSessoes]
 */
function criarSessoesControlador({ agora = Date.now, validadeMs = VALIDADE_PADRAO_MS, maxSessoes = MAX_SESSOES_PADRAO } = {}) {
  /** hash -> {socketId, deviceId, expiraEm} (em ordem de emissão) */
  const porHash = new Map();
  /** socketId -> hash */
  const porSocket = new Map();

  function remover(h) {
    const s = porHash.get(h);
    if (!s) return false;
    porHash.delete(h);
    if (porSocket.get(s.socketId) === h) porSocket.delete(s.socketId);
    return true;
  }

  function emitir({ socketId, deviceId } = {}) {
    const sid = String(socketId || '');
    const did = String(deviceId || '').trim();
    if (!sid || !did) throw new Error('socketId e deviceId são obrigatórios');
    if (porSocket.has(sid)) remover(porSocket.get(sid)); // um token por socket
    const token = crypto.randomBytes(32).toString('base64url');
    const h = hash(token);
    const expiraEm = agora() + validadeMs;
    porHash.set(h, { socketId: sid, deviceId: did, expiraEm });
    porSocket.set(sid, h);
    while (porHash.size > maxSessoes) remover(porHash.keys().next().value);
    return { token, expiraEm };
  }

  /** @returns {{ok: boolean, motivo?: string, socketId?: string, deviceId?: string}} */
  function validar({ token, deviceId } = {}) {
    if (typeof token !== 'string' || token === '') return { ok: false, motivo: 'ausente' };
    if (!RE_TOKEN.test(token)) return { ok: false, motivo: 'desconhecido' };
    const h = hash(token);
    const s = porHash.get(h);
    if (!s) return { ok: false, motivo: 'desconhecido' };
    if (s.expiraEm <= agora()) { remover(h); return { ok: false, motivo: 'expirado' }; }
    // O token só vale com a credencial do MESMO dispositivo; não substitui a autenticação.
    if (!deviceId || String(deviceId).trim() !== s.deviceId) return { ok: false, motivo: 'dispositivo-diferente' };
    return { ok: true, socketId: s.socketId, deviceId: s.deviceId };
  }

  function revogarSocket(socketId) {
    const h = porSocket.get(String(socketId));
    return h && remover(h) ? 1 : 0;
  }

  function revogarDispositivo(deviceId) {
    let n = 0;
    for (const [h, s] of [...porHash]) if (s.deviceId === String(deviceId)) { remover(h); n += 1; }
    return n;
  }

  return Object.freeze({
    emitir, validar, revogarSocket, revogarDispositivo, tamanho: () => porHash.size,
    /** Só para testes: o que está guardado (sem o token em claro). */
    _diagnostico: () => [...porHash.entries()].map(([h, s]) => ({ h, ...s })),
  });
}

/**
 * Decisão do bastão para uma chamada HTTP: com token válido do MESMO dispositivo, descobre o socket
 * exato (sem ambiguidade); sem token ou com token inválido, cai no caminho por dispositivo e diz por quê.
 * O token nunca autoriza: `autorizado` vem da credencial do dispositivo.
 */
function resolverBastao({ acesso, sessoes, deviceId, autorizado, sessao }) {
  if (sessao) {
    const v = sessoes.validar({ token: sessao, deviceId });
    if (v.ok && autorizado === true && acesso.estaRegistrado(v.socketId)) {
      return { ...acesso.avaliarEscrita({ socketId: v.socketId, autorizado: true }), identificadoPor: 'token-sessao' };
    }
    return { ...acesso.avaliarEscrita({ deviceId, autorizado }), sessaoInvalida: v.ok ? 'socket-nao-registrado' : v.motivo };
  }
  return acesso.avaliarEscrita({ deviceId, autorizado });
}

module.exports = { criarSessoesControlador, resolverBastao, VALIDADE_PADRAO_MS };
