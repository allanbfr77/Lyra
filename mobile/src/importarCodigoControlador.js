/**
 * Importa playlist de um código na nuvem direto no controlador (banco + playlist do culto).
 * Mesma lógica do importarPlaylist() no painel do controlador.
 */

import { urlApiControlador } from './lyraEndpoints';
import { obterPlaylistDaNuvem, filtrarMusicasComLetra } from './lyraShare';

/**
 * @param {string} ip
 * @param {string} cultoId
 * @param {string|null} cultoLabel
 * @param {number} rootId
 * @param {string} titulo
 * @param {string} artista
 * @param {{ copyImportada?: boolean, versaoId?: number }} opts
 */
async function adicionarMusicaNaPlaylistCulto(ip, cultoId, cultoLabel, rootId, titulo, artista, opts = {}) {
  const base = urlApiControlador(ip);
  const body = {
    cultoId: String(cultoId).trim(),
    cultoLabel: cultoLabel || '',
    id: rootId,
    titulo,
    artista: artista || '',
  };
  if (opts.copyImportada && opts.versaoId != null) {
    body.versaoLocalId = String(opts.versaoId);
    body.versaoRotulo = 'CÓPIA/IMPORTADA';
  }
  const res = await fetch(`${base}/api/playlists/adicionar-musica`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.erro || `HTTP ${res.status}`);
  }
}

/**
 * @param {Array<{ titulo: string, artista: string }>} arr
 * @param {string} titulo
 * @param {string} artista
 */
function registrarMusicaProcessada(arr, titulo, artista) {
  arr.push({ titulo: String(titulo || '').trim(), artista: String(artista || '').trim() });
}

/**
 * @param {string} ip
 * @param {string} codigo
 * @param {{ id: string, label: string }} culto
 * @returns {Promise<{
 *   importadas: number,
 *   copiasImportadas: number,
 *   falhas: number,
 *   cancelado: boolean,
 *   musicasProcessadas: Array<{ titulo: string, artista: string }>
 * }>}
 */
export async function importarCodigoNoControlador(ip, codigo, culto) {
  const ipTrim = String(ip || '').trim();
  if (!ipTrim) throw new Error('IP do controlador não disponível.');
  const cultoId = String(culto?.id || '').trim();
  if (!cultoId) throw new Error('Selecione um culto.');

  const data = await obterPlaylistDaNuvem(codigo);
  const musicas = filtrarMusicasComLetra(data.musicas);
  if (!musicas.length) throw new Error('Código inválido — sem músicas.');

  const base = urlApiControlador(ipTrim);
  const cultoLabel = culto.label || null;
  let importadas = 0;
  let copiasImportadas = 0;
  let falhas = 0;
  const musicasProcessadas = [];
  const erros = [];

  for (const m of musicas) {
    try {
      const resPost = await fetch(`${base}/api/musicas/importar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: m.titulo,
          artista: m.artista || '',
          estrofes: m.estrofes,
        }),
      });
      if (!resPost.ok) {
        const err = await resPost.json().catch(() => ({}));
        falhas += 1;
        erros.push(`${m.titulo || '?'}: ${err.erro || `HTTP ${resPost.status}`}`);
        continue;
      }
      const nova = await resPost.json();
      const rootId = nova.copyImportada ? Number(nova.rootId) : Number(nova.id);
      if (!Number.isFinite(rootId) || rootId <= 0) {
        falhas += 1;
        erros.push(`${m.titulo || '?'}: resposta inválida do controlador`);
        continue;
      }
      await adicionarMusicaNaPlaylistCulto(
        ipTrim,
        cultoId,
        cultoLabel,
        rootId,
        m.titulo,
        m.artista || '',
        nova.copyImportada ? { copyImportada: true, versaoId: nova.id } : {}
      );
      importadas += 1;
      if (nova.copyImportada) copiasImportadas += 1;
      registrarMusicaProcessada(musicasProcessadas, m.titulo, m.artista);
    } catch (e) {
      falhas += 1;
      erros.push(`${m.titulo || '?'}: ${e?.message || 'falha'}`);
    }
  }

  if (importadas === 0) {
    throw new Error(
      erros.length
        ? `Nenhuma música importada. ${erros.slice(0, 3).join(' · ')}`
        : 'Nenhuma música importada no controlador.'
    );
  }

  return { importadas, copiasImportadas, falhas, cancelado: false, musicasProcessadas };
}
