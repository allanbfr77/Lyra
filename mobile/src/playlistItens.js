/**
 * Itens de playlist do controlador — músicas vs marcadores de tema (ex.: ABERTURA).
 * Alinhado a `PLAYLIST_TIPO_MARCADOR_TEMA` do painel web (`controllerAppCore.js`).
 */

export const PLAYLIST_TIPO_MARCADOR_TEMA = 'marcador_tema';
export const TEMA_PADRAO_ABERTURA = 'ABERTURA';

/**
 * @param {unknown} it
 * @returns {boolean}
 */
export function ehMarcadorTemaPlaylist(it) {
  return !!(it && typeof it === 'object' && it.tipo === PLAYLIST_TIPO_MARCADOR_TEMA);
}

/**
 * @param {unknown} it
 * @returns {boolean}
 */
export function ehMusicaPlaylist(it) {
  if (!it || typeof it !== 'object' || ehMarcadorTemaPlaylist(it)) return false;
  const id = Number(it.id);
  return Number.isFinite(id) && id > 0;
}

/**
 * Versão local legada só existe no painel do PC (`c_…`); o mobile não consegue carregá-la.
 *
 * @param {unknown} versaoId
 * @returns {boolean}
 */
export function ehVersaoLocalLegadaPlaylist(versaoId) {
  return !!(versaoId && String(versaoId).trim().startsWith('c_'));
}

/**
 * ID numérico de versão no SQLite do controlador (não é cópia `c_` do painel).
 *
 * @param {unknown} versaoId
 * @returns {boolean}
 */
export function ehVersaoServidorPlaylist(versaoId) {
  if (versaoId == null || versaoId === '') return false;
  if (ehVersaoLocalLegadaPlaylist(versaoId)) return false;
  return Number.isFinite(Number(versaoId)) && Number(versaoId) > 0;
}

/**
 * ID a usar em GET `/api/musicas/:id` e em `exibir_musica`.
 * Se a playlist aponta para uma cópia/versão no servidor (`versaoLocalId`), usa esse ID;
 * senão usa o `id` (root / original).
 *
 * @param {unknown} it
 * @returns {number|null}
 */
export function idEfetivoMusicaPlaylist(it) {
  if (!it || typeof it !== 'object') return null;
  if (ehVersaoServidorPlaylist(it.versaoLocalId)) {
    return Math.trunc(Number(it.versaoLocalId));
  }
  const id = Number(it.id);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

/**
 * @param {unknown} it
 * @returns {'user'|'catalog'}
 */
export function fonteBancoPlaylist(it) {
  return it && typeof it === 'object' && it.bancoFonte === 'catalog' ? 'catalog' : 'user';
}

/**
 * @param {unknown} it
 * @returns {string}
 */
export function rotuloVersaoPlaylist(it) {
  if (!it || typeof it !== 'object') return '';
  return String(it.versaoRotulo || '').trim();
}

/**
 * Params de rota Expo para abrir estrofes/edição a partir de um item de playlist.
 *
 * @param {object} it
 * @param {string} ip
 * @returns {Record<string, string>}
 */
export function paramsRotaMusicaPlaylist(it, ip) {
  const efetivo = idEfetivoMusicaPlaylist(it);
  return {
    ip: String(ip || ''),
    musicaId: efetivo != null ? String(efetivo) : String(it?.id ?? ''),
    musicaTitulo: String(it?.titulo || ''),
    musicaFonte: fonteBancoPlaylist(it),
    versaoRotulo: rotuloVersaoPlaylist(it),
    playlistRootId: it?.id != null ? String(it.id) : '',
    playlistVersaoLocalId: it?.versaoLocalId != null ? String(it.versaoLocalId) : '',
  };
}

/**
 * @param {unknown} tema
 * @returns {string}
 */
export function normalizarTemaPlaylist(tema) {
  return String(tema || '').trim();
}

/**
 * Agrupa a playlist em blocos por tema (como no controlador).
 *
 * @param {unknown[]} pl
 * @returns {{ tema: string, musicas: object[] }[]}
 */
export function playlistParaBlocos(pl) {
  const lista = Array.isArray(pl) ? pl : [];
  const blocos = [];

  let i = 0;
  if (lista.length && !ehMarcadorTemaPlaylist(lista[0])) {
    let j = 0;
    while (j < lista.length && !ehMarcadorTemaPlaylist(lista[j])) j++;
    const musicas = lista.slice(0, j).filter(ehMusicaPlaylist);
    const tema = normalizarTemaPlaylist(lista[0]?.tema);
    if (musicas.length || tema) {
      blocos.push({ tema, musicas });
    }
    i = j;
  }

  while (i < lista.length) {
    const it = lista[i];
    if (ehMarcadorTemaPlaylist(it)) {
      const tema = normalizarTemaPlaylist(it.tema);
      let j = i + 1;
      while (j < lista.length && !ehMarcadorTemaPlaylist(lista[j])) j++;
      blocos.push({ tema, musicas: lista.slice(i + 1, j).filter(ehMusicaPlaylist) });
      i = j;
    } else {
      i++;
    }
  }

  return blocos;
}

/**
 * @param {unknown[]} pl
 * @returns {object[]}
 */
export function filtrarMusicasPlaylist(pl) {
  return (Array.isArray(pl) ? pl : []).filter(ehMusicaPlaylist);
}

/**
 * @param {unknown[]} pl
 * @returns {number}
 */
export function contarMusicasNaPlaylist(pl) {
  return filtrarMusicasPlaylist(pl).length;
}

/**
 * Culto entra na lista só se tiver pelo menos uma música (marcador ABERTURA sozinho não conta).
 *
 * @param {unknown[]} pl
 * @returns {boolean}
 */
export function playlistTemMusicas(pl) {
  return contarMusicasNaPlaylist(pl) > 0;
}
