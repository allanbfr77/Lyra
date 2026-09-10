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
 * Opções do seletor único de ministrante do culto (1 culto = 1 ministrante).
 * @param {{ id: number, nome: string }[]} lista
 * @param {number|null} selecionadoId
 */
export function htmlOpcoesMinistranteCulto(lista, selecionadoId) {
  const sel = normalizarMinistranteIdPlaylist(selecionadoId);
  const opts = [`<option value="">—</option>`];
  for (const m of lista) {
    const id = Number(m.id);
    if (!Number.isFinite(id)) continue;
    const selected = sel === id ? ' selected' : '';
    const nome = String(m.nome || '').toLocaleUpperCase('pt-BR');
    opts.push(`<option value="${id}"${selected}>${escapeAttr(nome)}</option>`);
  }
  return opts.join('');
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

/*
 * Ícones da linha: a alça de arrasto e o kebab.
 *
 * Desenho Tabler (`ti-grip-vertical`, `ti-dots-vertical`), como o resto do painel: pontos
 * cheios em `currentColor`, para a cor vir de quem os hospeda — a alça acende no hover
 * da linha, o kebab passa a dourado quando o menu dele está aberto.
 */
const SVG_GRIP_ARRASTAR =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
  '<circle cx="9" cy="5" r="1.35"/><circle cx="9" cy="12" r="1.35"/><circle cx="9" cy="19" r="1.35"/>' +
  '<circle cx="15" cy="5" r="1.35"/><circle cx="15" cy="12" r="1.35"/><circle cx="15" cy="19" r="1.35"/>' +
  '</svg>';

const SVG_KEBAB_LINHA =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
  '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>' +
  '</svg>';

/**
 * Alça de arrasto da linha.
 *
 * Sai daqui apenas o markup; quem lhe liga o `draggable` e os eventos é
 * `configurarDragReordenarLinhaPlaylist`, no painel — e é lá que está explicado porque
 * o gesto nasce na alça e não na linha inteira.
 *
 * `aria-hidden`: reordenar por arrasto não é uma operação que um leitor de ecrã possa
 * executar, e anunciar um controlo que não se consegue usar é pior do que não o anunciar.
 * A mesma reordenação continua ao alcance pelo menu de cada tema.
 */
function htmlGripArrastarPlaylist() {
  return (
    '<span class="pl-grip" aria-hidden="true" ' +
    'title="Arrastar para reordenar esta música na playlist">' +
    SVG_GRIP_ARRASTAR +
    '</span>'
  );
}

/**
 * Kebab da linha — abre «Resetar» (limpa tons e ministrante de toda a playlist) e
 * «Excluir» (tira esta música) num menu ancorado ao próprio ícone.
 *
 * Substitui os quatro botões que aqui viviam (repor, subir, descer, remover): as setas
 * saíram com a reordenação por arrasto, e as duas ações que restaram não justificam uma
 * fileira permanente de ícones numa lista que se lê muito mais vezes do que se edita.
 *
 * O botão está sempre no DOM, mesmo invisível: é a coluna dele que impede o seletor de
 * tom de mudar de sítio entre o repouso e o hover (ver `.pl-btn-kebab` no CSS).
 */
function htmlBotaoKebabPlaylist() {
  return (
    '<button class="pl-btn-kebab" type="button" aria-haspopup="menu" aria-expanded="false" ' +
    'title="Ações desta música" aria-label="Ações desta música">' +
    SVG_KEBAB_LINHA +
    '</button>'
  );
}

/**
 * Pastilha com o número da música na playlist.
 *
 * O número era texto corrido colado ao título («1. Grande é o Senhor»): lia-se como
 * parte do nome, competia com ele pelas reticências e desalinhava-se de linha para
 * linha assim que a lista passava dos nove. Numa pastilha, a coluna de números fica
 * direita e o título começa todo no mesmo sítio.
 *
 * É deliberadamente uma função à parte da que numera os slides (`.estrofe-num-big`,
 * no editor da coluna central): são duas contagens sem relação nenhuma — uma conta
 * músicas do culto, a outra estrofes de uma música — e partilhar código aqui só criava
 * um ponto onde mexer numa mexia na outra. O que se aproveitou foi o desenho, e mesmo
 * esse redimensionado: a playlist tem menos largura para dar, e a pastilha dos slides
 * (24px, corpo 13) aqui roubava o título.
 *
 * @param {number} n posição da música na playlist
 */
function htmlNumeroMusicaPlaylist(n) {
  /* Sem `aria-hidden`: o número dizia a posição da música a quem ouve a lista, e era
     isso que o antigo «1. » fazia. Mudou a caixa à volta, não a informação. */
  return `<span class="pl-num-badge">${Number(n)}</span>`;
}

/** Legenda de artista nas listas: campo vazio vira «Sem artista». */
export function rotuloArtistaLista(artista) {
  const t = String(artista || '').trim();
  return t || 'Sem artista';
}

/**
 * Linha da playlist no modo Home: alça · número + título/artista · tom · kebab.
 *
 * As quatro colunas têm largura fixa nas pontas (`--pl-col-grip-w`, `--pl-col-btns-w`),
 * o que mantém a coluna do tom no mesmo x em todas as linhas e em todos os estados.
 *
 * @param {object} item
 * @param {number} songNum
 * @param {string} rotuloVersaoHtml já escapado / sufixo pronto
 * @param {(s: string) => string} escapeHtml
 */
export function htmlCorpoLinhaPlaylistComTom(item, songNum, rotuloVersaoHtml, escapeHtml) {
  const artista = rotuloArtistaLista(item?.artista);
  const titulo = String(item?.titulo || '');
  return `
      <div class="playlist-row-cols">
        ${htmlGripArrastarPlaylist()}
        <div class="pl-col pl-col-meta">
          ${htmlNumeroMusicaPlaylist(songNum)}
          <div class="pl-col-titulo tit" data-dica="${escapeAttr(titulo)}">${escapeHtml(titulo)}${rotuloVersaoHtml}</div>
          <div class="pl-col-artista" data-dica="${escapeAttr(artista)}">${escapeHtml(artista)}</div>
        </div>
        <div class="pl-col pl-col-tom">${htmlSelectTom(item?.tom)}</div>
        <div class="playlist-btns">${htmlBotaoKebabPlaylist()}</div>
      </div>`;
}

/**
 * Linha compacta da playlist (modo Slide): alça + título + artista + kebab.
 * O tom fica exclusivo do modo Home; o ministrante é único e vive no topo da playlist.
 */
export function htmlCorpoLinhaPlaylistSimples(item, songNum, rotuloVersaoHtml, escapeHtml) {
  const artista = rotuloArtistaLista(item?.artista);
  const titulo = String(item?.titulo || '');
  return `
      <div class="pl-linha-simples">
        ${htmlGripArrastarPlaylist()}
        ${htmlNumeroMusicaPlaylist(songNum)}
        <div class="pl-linha-simples-txt">
          <div class="tit" data-dica="${escapeAttr(titulo)}">${escapeHtml(titulo)}${rotuloVersaoHtml}</div>
          <div class="mini" data-dica="${escapeAttr(artista)}">${escapeHtml(artista)}</div>
        </div>
      </div>
      <div class="playlist-btns">${htmlBotaoKebabPlaylist()}</div>`;
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
