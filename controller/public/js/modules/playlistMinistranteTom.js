/**
 * Ministrante (pessoa) e tom por música na playlist do culto.
 * Memória persistente: ministrante + música → tom (API / SQLite).
 * Não confundir com o monitor M3 (`displayConfig.ministrante`).
 */

export const TONS_MUSICAIS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm',
];

const TONS_SET = new Set(TONS_MUSICAIS);

/** @type {{ id: number, nome: string }[]} */
let cacheMinistrantes = [];

export function obterCacheMinistrantes() {
  return cacheMinistrantes.slice();
}

export function normalizarTomPlaylist(tom) {
  const t = String(tom ?? '').trim();
  return TONS_SET.has(t) ? t : '';
}

export function normalizarMinistranteIdPlaylist(valor) {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Campos de playlist: ministrante + tom (por culto).
 * @param {object} it
 */
export function normalizarCamposMinistranteTomItem(it) {
  if (!it || typeof it !== 'object') return it;
  return {
    ...it,
    ministranteId: normalizarMinistranteIdPlaylist(it.ministranteId),
    tom: normalizarTomPlaylist(it.tom),
  };
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {{ id: number, nome: string }[]} lista
 * @param {number|null} selecionadoId
 */
export function htmlSelectMinistrante(lista, selecionadoId) {
  const sel = normalizarMinistranteIdPlaylist(selecionadoId);
  const opts = [`<option value="">—</option>`];
  for (const m of lista) {
    const id = Number(m.id);
    if (!Number.isFinite(id)) continue;
    const selected = sel === id ? ' selected' : '';
    const nome = String(m.nome || '').toLocaleUpperCase('pt-BR');
    opts.push(`<option value="${id}"${selected}>${escapeAttr(nome)}</option>`);
  }
  return `<select class="pl-sel pl-sel-ministrante" title="Ministrante" aria-label="Ministrante">${opts.join('')}</select>`;
}

/**
 * @param {string} tomAtual
 */
export function htmlSelectTom(tomAtual) {
  const tom = normalizarTomPlaylist(tomAtual);
  const opts = [`<option value="">—</option>`];
  for (const t of TONS_MUSICAIS) {
    const selected = tom === t ? ' selected' : '';
    opts.push(`<option value="${escapeAttr(t)}"${selected}>${escapeAttr(t)}</option>`);
  }
  return `<select class="pl-sel pl-sel-tom" title="Tom" aria-label="Tom">${opts.join('')}</select>`;
}

/**
 * @param {object} item
 * @param {number} songNum
 * @param {string} rotuloVersaoHtml já escapado / sufixo pronto
 * @param {(s: string) => string} escapeHtml
 */
export function htmlCorpoLinhaPlaylistComMinistranteTom(item, songNum, rotuloVersaoHtml, escapeHtml) {
  const artista = String(item?.artista || '').trim();
  const titulo = String(item?.titulo || '');
  const lista = obterCacheMinistrantes();
  return `
      <div class="playlist-row-cols">
        <div class="pl-col pl-col-meta">
          <div class="pl-col-titulo tit" title="${escapeAttr(titulo)}">${songNum}. ${escapeHtml(titulo)}${rotuloVersaoHtml}</div>
          <div class="pl-col-artista"${artista ? ` title="${escapeAttr(artista)}"` : ''}>${artista ? escapeHtml(artista) : '—'}</div>
        </div>
        <div class="pl-col pl-col-ministrante">${htmlSelectMinistrante(lista, item?.ministranteId)}</div>
        <div class="pl-col pl-col-tom">${htmlSelectTom(item?.tom)}</div>
        <div class="playlist-btns">
          <button class="btn sm" type="button" title="Subir">↑</button>
          <button class="btn sm" type="button" title="Descer">↓</button>
          <button class="btn sm danger" type="button" title="Remover">✕</button>
        </div>
      </div>`;
}

/**
 * @param {string} apiBase
 */
export async function carregarMinistrantesDoServidor(apiBase) {
  const res = await fetch(`${apiBase}/api/ministrantes`);
  if (!res.ok) throw new Error('Falha ao carregar ministrantes.');
  const data = await res.json();
  cacheMinistrantes = Array.isArray(data)
    ? data
        .map((r) => ({ id: Number(r.id), nome: String(r.nome || '').trim() }))
        .filter((r) => Number.isFinite(r.id) && r.nome)
    : [];
  return obterCacheMinistrantes();
}

/**
 * @param {string} apiBase
 * @param {string} nome
 */
export async function criarMinistranteNoServidor(apiBase, nome) {
  const res = await fetch(`${apiBase}/api/ministrantes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Falha ao criar ministrante.');
  await carregarMinistrantesDoServidor(apiBase);
  return data;
}

/**
 * @param {string} apiBase
 * @param {number} id
 * @param {string} nome
 */
export async function renomearMinistranteNoServidor(apiBase, id, nome) {
  const res = await fetch(`${apiBase}/api/ministrantes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Falha ao renomear ministrante.');
  await carregarMinistrantesDoServidor(apiBase);
  return data;
}

/**
 * @param {string} apiBase
 * @param {number} id
 */
export async function excluirMinistranteNoServidor(apiBase, id) {
  const res = await fetch(`${apiBase}/api/ministrantes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Falha ao excluir ministrante.');
  await carregarMinistrantesDoServidor(apiBase);
  return data;
}

/**
 * @param {string} apiBase
 * @param {number} ministranteId
 * @param {number} musicaId
 * @param {string} fonte
 */
export async function buscarTomMemoria(apiBase, ministranteId, musicaId, fonte) {
  const q = new URLSearchParams({
    ministranteId: String(ministranteId),
    musicaId: String(musicaId),
    fonte: fonte === 'catalog' ? 'catalog' : 'user',
  });
  const res = await fetch(`${apiBase}/api/tom-memoria?${q}`);
  if (!res.ok) return '';
  const data = await res.json().catch(() => ({}));
  return normalizarTomPlaylist(data.tom);
}

/**
 * @param {string} apiBase
 * @param {number} ministranteId
 * @param {number} musicaId
 * @param {string} fonte
 * @param {string} tom
 */
export async function gravarTomMemoria(apiBase, ministranteId, musicaId, fonte, tom) {
  const res = await fetch(`${apiBase}/api/tom-memoria`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ministranteId,
      musicaId,
      fonte: fonte === 'catalog' ? 'catalog' : 'user',
      tom: normalizarTomPlaylist(tom),
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.erro || 'Falha ao gravar memória de tom.');
  }
  return res.json();
}

/**
 * Limpa ministranteId nas playlists após exclusão do cadastro.
 * @param {Record<string, any[]>} playlists
 * @param {number} ministranteId
 * @returns {boolean} se algo mudou
 */
export function limparMinistranteDasPlaylists(playlists, ministranteId) {
  const id = Number(ministranteId);
  if (!Number.isFinite(id) || !playlists || typeof playlists !== 'object') return false;
  let mudou = false;
  Object.keys(playlists).forEach((cid) => {
    const pl = playlists[cid];
    if (!Array.isArray(pl)) return;
    pl.forEach((it) => {
      if (!it || it.tipo === 'marcador_tema') return;
      if (Number(it.ministranteId) === id) {
        it.ministranteId = null;
        mudou = true;
      }
    });
  });
  return mudou;
}
