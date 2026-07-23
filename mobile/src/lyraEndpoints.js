/**
 * Endereços do Lyra na rede local.
 *
 * - API (músicas, bíblia, playlists): controlador Electron, porta 3001
 * - Projeção (Socket.IO, telas): servidor de telas, porta 5510 (mesmo PC na prática)
 */

export const PORTA_API_CONTROLADOR = 3001;
export const PORTA_PROJECAO = 5510;

/**
 * @param {string} valor
 * @returns {string}
 */
export function normalizarHost(valor) {
  let s = String(valor || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/\/.*$/, '');
  s = s.replace(/:\d+$/, '');
  return s.trim();
}

/**
 * @param {string} host
 * @returns {string}
 */
export function urlApiControlador(host) {
  const h = normalizarHost(host);
  return h ? `http://${h}:${PORTA_API_CONTROLADOR}` : '';
}

/**
 * @param {string} host
 * @returns {string}
 */
export function urlSocketProjecao(host) {
  const h = normalizarHost(host);
  return h ? `http://${h}:${PORTA_PROJECAO}` : '';
}

/** REST do servidor de telas (roteamento M2/M3, estado). */
export function urlApiProjecao(host) {
  return urlSocketProjecao(host);
}
