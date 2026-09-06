/**
 * Versão da música num item de playlist (id de fetch, pré-voo e fonte do banco).
 *
 * Extraído do AppCore sem unificar os dois ids: o share manda a string do
 * `versaoLocalId` numérico; o pré-voo manda número e trata `c_*` como o root.
 * `c_*` não existe no servidor. O fetch e o clique no telão ficam no núcleo.
 */

import { ehVersaoLocalLegada, ehVersaoServidorId } from './copiasLocaisLetra.js';

export function versaoLocalIdTrimado(versaoId) {
  return versaoId != null && String(versaoId).trim() ? String(versaoId).trim() : '';
}

/** Id no GET /api/musicas do código de partilha: cópia SQLite ou o `id` do item. */
export function idFetchMusicaPlaylist(it) {
  const vid = versaoLocalIdTrimado(it?.versaoLocalId);
  if (vid && ehVersaoServidorId(vid)) return vid;
  return it?.id;
}

/**
 * Qual id pedir ao servidor no pré-voo — o mesmo critério do clique.
 * Se divergir, o pré-voo acusa «música apagada» as que abrem sem problema.
 * Cópias `c_*` pedem o original (não têm id no SQLite).
 */
export function idMusicaParaPreVoo(item) {
  const vid = item?.versaoLocalId ? String(item.versaoLocalId).trim() : '';
  if (vid && !ehVersaoLocalLegada(vid)) {
    const n = Number(vid);
    if (Number.isFinite(n)) return n;
  }
  const raiz = Number(item?.id);
  return Number.isFinite(raiz) ? raiz : null;
}

export function fonteBancoNormalizada(bancoFonte) {
  return bancoFonte === 'catalog' ? 'catalog' : 'user';
}

export function fonteBancoItemPlaylist(it) {
  return fonteBancoNormalizada(it?.bancoFonte);
}
