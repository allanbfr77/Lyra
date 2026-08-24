/**
 * Ministrante (pessoa) e tom por música na playlist do culto.
 * Memória persistente: ministrante + música → tom (API / SQLite).
 * Não confundir com o monitor M3 (`displayConfig.ministrante`).
 */

export const TONS_MUSICAIS = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'Cb',
  'Cm', 'C#m', 'Dbm', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gbm', 'Gm', 'G#m', 'Abm', 'Am', 'A#m', 'Bbm', 'Bm',
  'ORIG.',
];

const TONS_SET = new Set(TONS_MUSICAIS);

/** @type {{ id: number, nome: string }[]} */
let cacheMinistrantes = [];

export function obterCacheMinistrantes() {
  return cacheMinistrantes.slice();
}

export function normalizarTomPlaylist(tom) {
  let t = String(tom ?? '').trim();
  if (/^orig\.?$/i.test(t)) t = 'ORIG.';
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
 * Seta circular anti-horária — «repor tudo ao estado inicial».
 *
 * Traço e não preenchimento, `currentColor` e 14 px: é assim que os ícones do painel são
 * desenhados, e um ícone que destoasse dos vizinhos chamaria mais atenção do que a ação
 * merece — ela é rara, e é destrutiva.
 */
const SVG_LIMPAR_MESTRE =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';

/**
 * @param {object} item
 * @param {number} songNum
 * @param {string} rotuloVersaoHtml já escapado / sufixo pronto
 * @param {(s: string) => string} escapeHtml
 * @param {{ mostrarLimparMestre?: boolean }} [opts]
 */
export function htmlCorpoLinhaPlaylistComMinistranteTom(item, songNum, rotuloVersaoHtml, escapeHtml, opts = {}) {
  const artista = String(item?.artista || '').trim();
  const titulo = String(item?.titulo || '');
  const lista = obterCacheMinistrantes();
  /*
   * Seta circular, no lugar do antigo `∅`.
   *
   * O conjunto vazio dizia bem o que faz a quem já sabe o que faz, e nada a quem não sabe —
   * e este botão aparece uma vez só, na primeira linha, onde ninguém o procura.
   *
   * Como a seta também se lê como «desfazer», o que a desambigua é o `title`: diz que
   * apaga, diz em quantas músicas, e diz que não há como voltar atrás. É o texto que o
   * ícone não consegue carregar sozinho.
   */
  const btnLimparMestre = opts.mostrarLimparMestre
    ? `<button class="btn sm pl-btn-limpar-mestre-min-tom" type="button" title="Apagar o ministrante e o tom de TODAS as músicas desta playlist (não é possível desfazer)" aria-label="Apagar ministrante e tom de todas as músicas da playlist">${SVG_LIMPAR_MESTRE}</button>`
    : '';
  return `
      <div class="playlist-row-cols">
        <div class="pl-col pl-col-meta">
          <div class="pl-col-titulo tit" title="${escapeAttr(titulo)}">${songNum}. ${escapeHtml(titulo)}${rotuloVersaoHtml}</div>
          <div class="pl-col-artista"${artista ? ` title="${escapeAttr(artista)}"` : ''}>${artista ? escapeHtml(artista) : '—'}</div>
        </div>
        <div class="pl-col pl-col-ministrante">${htmlSelectMinistrante(lista, item?.ministranteId)}</div>
        <div class="pl-col pl-col-tom">${htmlSelectTom(item?.tom)}</div>
        <div class="playlist-btns">
          ${btnLimparMestre}
          <button class="btn sm pl-btn-subir" type="button" title="Subir">↑</button>
          <button class="btn sm pl-btn-descer" type="button" title="Descer">↓</button>
          <button class="btn sm danger pl-btn-remover" type="button" title="Remover">✕</button>
        </div>
      </div>`;
}

/**
 * Linha compacta da playlist (modo Slide): só título + artista + botões.
 * Ministrante/Tom ficam exclusivos do modo Home.
 */
export function htmlCorpoLinhaPlaylistSimples(item, songNum, rotuloVersaoHtml, escapeHtml) {
  const artista = String(item?.artista || '').trim();
  const titulo = String(item?.titulo || '');
  return `
      <div class="tit" title="${escapeAttr(titulo)}">${songNum}. ${escapeHtml(titulo)}${rotuloVersaoHtml}</div>
      ${artista ? `<div class="mini" title="${escapeAttr(artista)}">${escapeHtml(artista)}</div>` : ''}
      <div class="playlist-btns">
        <button class="btn sm pl-btn-subir" type="button" title="Subir">↑</button>
        <button class="btn sm pl-btn-descer" type="button" title="Descer">↓</button>
        <button class="btn sm danger pl-btn-remover" type="button" title="Remover">✕</button>
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
 * Garante ministrante pelo nome (cria se ainda não existir). Usado no import do código C.
 * @param {string} apiBase
 * @param {string} nomeRaw
 * @returns {Promise<{ id: number, nome: string }|null>}
 */
export async function garantirMinistrantePorNomeNoServidor(apiBase, nomeRaw) {
  const nome = String(nomeRaw || '').trim();
  if (!nome) return null;
  await carregarMinistrantesDoServidor(apiBase);
  const nomeKey = nome.toLocaleLowerCase('pt-BR');
  const existente = cacheMinistrantes.find(
    (m) => String(m.nome || '').toLocaleLowerCase('pt-BR') === nomeKey
  );
  if (existente) return { id: Number(existente.id), nome: String(existente.nome || nome) };
  try {
    const criado = await criarMinistranteNoServidor(apiBase, nome);
    return { id: Number(criado.id), nome: String(criado.nome || nome) };
  } catch (_) {
    await carregarMinistrantesDoServidor(apiBase);
    const deNovo = cacheMinistrantes.find(
      (m) => String(m.nome || '').toLocaleLowerCase('pt-BR') === nomeKey
    );
    return deNovo ? { id: Number(deNovo.id), nome: String(deNovo.nome || nome) } : null;
  }
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
export async function buscarTomMemoria(apiBase, ministranteId, musicaId, fonte, titulo) {
  const q = new URLSearchParams({
    ministranteId: String(ministranteId),
    musicaId: String(musicaId),
    fonte: fonte === 'catalog' ? 'catalog' : 'user',
  });
  const t = String(titulo || '').trim();
  if (t) q.set('titulo', t);
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

/**
 * Mapa culto → ministranteId (padrão da playlist para músicas novas).
 * @param {object} map
 */
export function normalizarMinistrantePadraoPorCulto(map) {
  const src = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  const out = {};
  for (const [cultoId, val] of Object.entries(src)) {
    const cid = String(cultoId || '').trim();
    const mid = normalizarMinistranteIdPlaylist(val);
    if (cid && mid) out[cid] = mid;
  }
  return out;
}

/**
 * Remove referências ao ministrante excluído do cadastro.
 * @param {Record<string, number>} ministrantePadraoPorCulto
 * @param {number} ministranteId
 * @returns {boolean}
 */
export function limparMinistrantePadraoPorCulto(ministrantePadraoPorCulto, ministranteId) {
  const id = Number(ministranteId);
  if (!Number.isFinite(id) || !ministrantePadraoPorCulto || typeof ministrantePadraoPorCulto !== 'object') {
    return false;
  }
  let mudou = false;
  for (const [cid, val] of Object.entries(ministrantePadraoPorCulto)) {
    if (Number(val) === id) {
      delete ministrantePadraoPorCulto[cid];
      mudou = true;
    }
  }
  return mudou;
}
