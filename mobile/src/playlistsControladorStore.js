/**
 * Store global das playlists vindas do painel controlador (Socket.IO).
 *
 * Não usa React state — é um módulo singleton que mantém o snapshot
 * das playlists em memória e notifica subscribers registrados.
 * Isso permite que múltiplos componentes leiam o estado sem depender
 * da árvore de contexto do React.
 *
 * Fonte preferencial: evento `playlists_do_controlador` (estado ao vivo do painel).
 * Fallback: `GET /api/playlists` no controlador (porta 3001) se o socket não sincronizar.
 */

import { urlApiControlador } from './lyraEndpoints';

/** Snapshot atual das playlists indexadas por cultoId. Ex.: { "culto_2026-05-04_manha": [...] } */
let playlistsSnapshot = {};

/** `true` após pelo menos um `playlists_do_controlador` desde a última desligação/reset. */
let syncRecebidoDoControlador = false;

/** Conjunto de funções que serão chamadas sempre que as playlists forem atualizadas. */
const listeners = new Set();

/** Handler para solicitar retransmissão das playlists ao servidor — injetado pelo socket. */
let solicitarHandler = () => {};

// --- Configuração do handler de solicitação ---

/**
 * Registra a função que solicita ao servidor a retransmissão das playlists.
 * Deve ser chamado pelo hook `useSocket` ao estabelecer conexão.
 *
 * @param {() => void} fn - Função que emite o evento `solicitar_playlists_controlador`
 */
export function setSolicitarPlaylistsHandler(fn) {
  solicitarHandler = typeof fn === 'function' ? fn : () => {};
}

/**
 * Dispara a solicitação de playlists ao controlador via socket.
 * Seguro chamar mesmo sem conexão (o handler não faz nada se não há socket).
 */
export function solicitarPlaylistsDoControlador() {
  try {
    solicitarHandler();
  } catch (_) {}
}

/**
 * Fallback REST quando o painel não responde via Socket.IO.
 * Usa o JSON persistido no controlador (`GET /api/playlists`).
 *
 * @param {string} ip
 * @returns {Promise<boolean>} true se carregou e aplicou snapshot
 */
export async function carregarPlaylistsDoControladorHttp(ip) {
  const base = urlApiControlador(ip);
  if (!base) return false;
  try {
    const res = await fetch(`${base}/api/playlists`);
    if (!res.ok) return false;
    const pl = await res.json();
    if (!pl || typeof pl !== 'object' || Array.isArray(pl)) return false;
    setPlaylistsDoControlador(pl);
    return true;
  } catch (_) {
    return false;
  }
}

// --- Atualização e reset do snapshot ---

/**
 * Atualiza o snapshot de playlists e notifica todos os subscribers.
 * Chamado pelo hook `useSocket` quando o evento `playlists_do_controlador` chega.
 *
 * @param {object} pl - Objeto de playlists indexado por cultoId
 */
export function setPlaylistsDoControlador(pl) {
  // Garante que apenas objetos simples (não arrays) são aceitos
  playlistsSnapshot = pl && typeof pl === 'object' && !Array.isArray(pl) ? { ...pl } : {};
  syncRecebidoDoControlador = true;

  // Notifica todos os componentes inscritos
  listeners.forEach((fn) => {
    try {
      fn(playlistsSnapshot);
    } catch (_) {}
  });
}

/**
 * Volta ao estado inicial — sem playlists e sem sync registrado.
 * Chamado ao desconectar do servidor ou ao iniciar nova sessão.
 * Não conta como «sync do controlador» — `houveSyncPlaylistsDoControlador` retornará false.
 */
export function resetPlaylistsDoControlador() {
  playlistsSnapshot = {};
  syncRecebidoDoControlador = false;

  // Notifica subscribers para que atualizem suas UIs
  listeners.forEach((fn) => {
    try {
      fn(playlistsSnapshot);
    } catch (_) {}
  });
}

// --- Consultas de estado ---

/**
 * Indica se pelo menos um evento `playlists_do_controlador` foi recebido
 * desde a última conexão (ou reset).
 *
 * @returns {boolean}
 */
export function houveSyncPlaylistsDoControlador() {
  return syncRecebidoDoControlador;
}

// --- Sistema de subscribers ---

/**
 * Subscreve atualizações vindas do socket para um componente React ou outro módulo.
 * Retorna a função de cancelamento (uso típico: retornar em `useEffect`/`useFocusEffect`).
 *
 * @param {(playlists: object) => void} onChange - Callback chamado com o novo snapshot
 * @param {{ emitInitial?: boolean }} [opts={}]
 *   - `emitInitial: false` → não dispara imediatamente com o snapshot atual,
 *     aguarda o próximo push do servidor (útil na lista Cultos para mostrar spinner)
 * @returns {() => void} Função para cancelar a inscrição
 */
export function subscribePlaylistsDoControlador(onChange, opts = {}) {
  listeners.add(onChange);

  // Por padrão, dispara imediatamente com o estado atual para evitar tela em branco
  if (opts.emitInitial !== false) {
    try {
      onChange(playlistsSnapshot);
    } catch (_) {}
  }

  // Retorna função de cleanup para uso em useEffect/useFocusEffect
  return () => listeners.delete(onChange);
}

/**
 * Retorna o snapshot atual das playlists de forma síncrona.
 * Útil quando o componente precisa do valor antes do primeiro render.
 *
 * @returns {object} Snapshot atual das playlists
 */
export function getPlaylistsDoControladorSnapshot() {
  return playlistsSnapshot;
}
