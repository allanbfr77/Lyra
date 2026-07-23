/**
 * Compartilhar playlists via nuvem (mesma API do controlador).
 */

import { fetchComTimeout } from './fetchComTimeout';

/** Mesmo endpoint usado pelo controlador (controllerAppCore.js). */
export const CLOUD_SHARE_URL = 'https://invb-share-api.onrender.com';

const SHARE_TIMEOUT_MS = 55000;

/**
 * @param {Array<{ titulo?: string, artista?: string, estrofes?: string[] }>} musicas
 */
export function prepararMusicasParaNuvem(musicas) {
  return (Array.isArray(musicas) ? musicas : [])
    .map((m) => ({
      titulo: String(m.titulo || '').trim(),
      artista: String(m.artista || '').trim(),
      estrofes: (Array.isArray(m.estrofes) ? m.estrofes : [])
        .map((s) => String(s || ''))
        .filter((s) => s.trim()),
    }))
    .filter((m) => m.titulo && m.estrofes.length);
}

/**
 * @param {Array<{ titulo?: string, artista?: string, estrofes?: string[] }>} musicas
 */
export function filtrarMusicasComLetra(musicas) {
  return (Array.isArray(musicas) ? musicas : []).filter(
    (m) =>
      m.titulo &&
      Array.isArray(m.estrofes) &&
      m.estrofes.some((s) => String(s || '').trim())
  );
}

/**
 * Publica músicas na nuvem e devolve código + validade.
 *
 * @param {{ cultoId?: string, cultoNome?: string, musicas: Array<{ titulo: string, artista: string, estrofes: string[] }> }} params
 */
export async function publicarPlaylistNaNuvem({ cultoId = '', cultoNome = '', musicas }) {
  const cid = String(cultoId || '').trim();
  if (!cid) throw new Error('Selecione um culto antes de compartilhar.');

  const lista = prepararMusicasParaNuvem(musicas);
  if (!lista.length) {
    throw new Error('Nenhuma música com letra para compartilhar.');
  }

  const body = JSON.stringify({
    cultoId: cid,
    cultoNome: String(cultoNome || '').trim(),
    musicas: lista,
  });

  let res;
  try {
    res = await fetchComTimeout(
      `${CLOUD_SHARE_URL}/share`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
      SHARE_TIMEOUT_MS
    );
  } catch (e) {
    if (e?.message?.includes('Tempo esgotado')) {
      throw new Error(
        'O servidor de compartilhamento demorou demais (pode estar acordando). Tente de novo em alguns segundos.'
      );
    }
    throw new Error(e?.message || 'Sem ligação à internet para gerar o código.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.erro || data.message || `Não foi possível gerar o código (${res.status}).`);
  }
  if (!data.codigo) {
    throw new Error('Resposta inválida do servidor de compartilhamento.');
  }
  return data;
}

/**
 * @param {string} codigo
 */
export async function obterPlaylistDaNuvem(codigo) {
  const codigoNorm = String(codigo || '').trim().toUpperCase();
  if (!codigoNorm) throw new Error('Código vazio');
  const res = await fetchComTimeout(
    `${CLOUD_SHARE_URL}/share/${encodeURIComponent(codigoNorm)}`,
    {},
    SHARE_TIMEOUT_MS
  );
  if (res.status === 404) {
    const err = new Error('Código não encontrado ou expirado.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}
