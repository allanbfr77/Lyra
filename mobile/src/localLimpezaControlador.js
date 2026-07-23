/**
 * Remove da biblioteca local músicas que já estão no controlador (ex.: importadas no PC).
 */

import {
  chaveTituloArtista,
  listarMusicasLocais,
  removerMusicasLocaisPorCorrespondencia,
} from './localMusicStore';
import { listarChavesMusicasUsuarioNoControlador } from './controladorMusicasClient';
import { filtrarMusicasPlaylist } from './playlistItens';

/**
 * @param {Record<string, unknown>} playlists
 * @returns {Array<{ titulo: string, artista: string }>}
 */
export function musicasDasPlaylistsControlador(playlists) {
  const out = [];
  if (!playlists || typeof playlists !== 'object') return out;
  for (const pl of Object.values(playlists)) {
    for (const m of filtrarMusicasPlaylist(pl)) {
      out.push({
        titulo: String(m.titulo || '').trim(),
        artista: String(m.artista || '').trim(),
      });
    }
  }
  return out;
}

/**
 * Após import no PC (ou sync de playlists), remove do celular o que já está no controlador.
 *
 * @param {string} ip
 * @param {Record<string, unknown>|null|undefined} playlists
 * @returns {Promise<number>}
 */
export async function limparBibliotecaLocalJaNoControlador(ip, playlists) {
  const ipTrim = String(ip || '').trim();
  if (!ipTrim) return 0;

  const chavesRemover = new Set();

  for (const m of musicasDasPlaylistsControlador(playlists || {})) {
    chavesRemover.add(chaveTituloArtista(m.titulo, m.artista));
  }

  const chavesBanco = await listarChavesMusicasUsuarioNoControlador(ipTrim);
  for (const ch of chavesBanco) chavesRemover.add(ch);

  if (!chavesRemover.size) return 0;

  const locais = await listarMusicasLocais();
  const paraRemover = locais
    .filter((m) => chavesRemover.has(chaveTituloArtista(m.titulo, m.artista)))
    .map((m) => ({ titulo: m.titulo, artista: m.artista || '' }));

  if (!paraRemover.length) return 0;
  return removerMusicasLocaisPorCorrespondencia(paraRemover);
}
