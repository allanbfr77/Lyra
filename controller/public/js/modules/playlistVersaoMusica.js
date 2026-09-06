/**
 * Versão da música num item de playlist (id de fetch, pré-voo, fonte e igualdade).
 *
 * Extraído do AppCore sem unificar os dois ids: o share manda a string do
 * `versaoLocalId` numérico; o pré-voo manda número e trata `c_*` como o root.
 * A igualdade de item NÃO faz trim (diferente de `versaoLocalIdTrimado`).
 * Marcador de tema nunca conta como música. O fetch e o DOM ficam no núcleo.
 */

import { PLAYLIST_TIPO_MARCADOR_TEMA } from './chavesArmazenamentoLocal.js';
import { ehVersaoLocalLegada, ehVersaoServidorId } from './copiasLocaisLetra.js';

export function ehMarcadorTemaPlaylist(it) {
  return !!(it && it.tipo === PLAYLIST_TIPO_MARCADOR_TEMA);
}

/** Comparação de versão na playlist: sem trim; `0` é falsy e conta como vazio. */
export function versaoLocalIdParaComparar(versaoId) {
  return versaoId ? String(versaoId) : '';
}

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

export function itemPlaylistMesmaMusicaEVersao(it, idMusica, versaoLocalId, bancoFonte) {
  if (!it || ehMarcadorTemaPlaylist(it)) return false;
  if (Number(it.id) !== Number(idMusica)) return false;
  return (
    versaoLocalIdParaComparar(it.versaoLocalId) === versaoLocalIdParaComparar(versaoLocalId) &&
    fonteBancoItemPlaylist(it) === fonteBancoNormalizada(bancoFonte)
  );
}

export function playlistJaContemMesmaMusicaEVersao(pl, idMusica, versaoLocalId, bancoFonte) {
  return pl.some((x) => itemPlaylistMesmaMusicaEVersao(x, idMusica, versaoLocalId, bancoFonte));
}

/**
 * Mesmo root + mesma versão + mesma fonte.
 * `raizId` entra cru: `null` falha (`Number.isFinite(null)` é falso), como no AppCore.
 */
export function playlistItemMesmaVersaoQueRaiz(it, raizId, versaoLocalId, bancoFonte) {
  if (!it || ehMarcadorTemaPlaylist(it)) return false;
  const itRoot = Number(it.id);
  if (!Number.isFinite(raizId) || !Number.isFinite(itRoot) || itRoot !== raizId) return false;
  return (
    versaoLocalIdParaComparar(versaoLocalId) === versaoLocalIdParaComparar(it.versaoLocalId) &&
    fonteBancoItemPlaylist(it) === fonteBancoNormalizada(bancoFonte)
  );
}
