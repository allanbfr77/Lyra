/**
 * Consultas HTTP ao banco de músicas do controlador (porta 3001).
 */

import { urlApiControlador } from './lyraEndpoints';
import { fetchComTimeout } from './fetchComTimeout';
import { chaveTituloArtista } from './localMusicStore';

const CONTROLADOR_TIMEOUT_MS = 4000;

function normTituloArtista(titulo, artista) {
  return {
    t: String(titulo || '').trim().toLowerCase(),
    a: String(artista || '').trim().toLowerCase(),
  };
}

function mesmoTituloArtista(a, titulo, artista) {
  const { t, a: ar } = normTituloArtista(titulo, artista);
  return (
    String(a.titulo || '').trim().toLowerCase() === t &&
    String(a.artista || '').trim().toLowerCase() === ar
  );
}

/**
 * Busca no banco do usuário (ignora catálogo pré-carregado).
 *
 * @param {string} ip
 * @param {string} titulo
 * @param {string} artista
 */
/**
 * Chaves título|artista das músicas do banco do usuário no controlador (uma requisição).
 *
 * @param {string} ip
 * @returns {Promise<Set<string>>}
 */
export async function listarChavesMusicasUsuarioNoControlador(ip) {
  const base = urlApiControlador(ip);
  if (!base) return new Set();

  try {
    const res = await fetchComTimeout(`${base}/api/musicas`, {}, CONTROLADOR_TIMEOUT_MS);
    if (!res.ok) return new Set();
    const lista = await res.json();
    const chaves = new Set();
    for (const m of Array.isArray(lista) ? lista : []) {
      if (m.fonte && m.fonte !== 'user') continue;
      chaves.add(chaveTituloArtista(m.titulo, m.artista));
    }
    return chaves;
  } catch {
    return new Set();
  }
}

export async function buscarMusicaUsuarioNoControlador(ip, titulo, artista) {
  const base = urlApiControlador(ip);
  if (!base) return null;

  try {
    const res = await fetchComTimeout(
      `${base}/api/musicas/buscar?q=${encodeURIComponent(String(titulo || '').trim())}&titulo=1&artista=0&letra=0`,
      {},
      CONTROLADOR_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const lista = await res.json();
    const { t, a } = normTituloArtista(titulo, artista);
    return (
      lista.find(
        (m) =>
          (!m.fonte || m.fonte === 'user') &&
          String(m.titulo || '').trim().toLowerCase() === t &&
          String(m.artista || '').trim().toLowerCase() === a
      ) || null
    );
  } catch {
    return null;
  }
}

/**
 * Confirma se a música existe no banco do usuário no PC.
 * Se `serverId` estiver definido mas a música foi apagada no controlador, retorna null.
 *
 * @param {string} ip
 * @param {string} titulo
 * @param {string} artista
 * @param {number|null|undefined} serverId
 */
export async function musicaUsuarioExisteNoControlador(ip, titulo, artista, serverId = null) {
  const base = urlApiControlador(ip);
  if (!base) return null;

  const idNum = serverId != null ? parseInt(serverId, 10) : NaN;
  if (Number.isFinite(idNum)) {
    try {
      const res = await fetchComTimeout(`${base}/api/musicas/${idNum}`, {}, CONTROLADOR_TIMEOUT_MS);
      if (!res.ok) return null;
      const data = await res.json();
      if (!mesmoTituloArtista(data, titulo, artista)) return null;
      return { id: idNum, titulo: data.titulo, artista: data.artista || '', fonte: 'user' };
    } catch {
      return null;
    }
  }

  return buscarMusicaUsuarioNoControlador(ip, titulo, artista);
}

/** @deprecated Use buscarMusicaUsuarioNoControlador */
export async function buscarMusicaNoControladorPorTituloArtista(ip, titulo, artista) {
  return buscarMusicaUsuarioNoControlador(ip, titulo, artista);
}
