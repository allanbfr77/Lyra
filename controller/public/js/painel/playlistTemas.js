/**
 * Playlists por culto: carga/persistência, temas e marcadores de tema, ministrante padrão por culto e
 * marcador de abertura. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda
 * possui entra por `registrarDependenciasPlaylistTemas`.
 */
import { LS_PLAYLISTS, LS_PLAYLISTS_LEGACY, LS_PLAYLIST_ABERTURA_REMOVIDA, LS_PLAYLIST_MINISTRANTE_PADRAO, LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS, LS_PLAYLIST_TEMAS, LS_PLAYLIST_TEMA_SEL, PLAYLIST_TIPO_MARCADOR_TEMA, SVG_PLAYLIST_SECAO_EXPANDIR, SVG_PLAYLIST_SECAO_RECOLHER, TEMA_PADRAO_ABERTURA } from '../modules/chavesArmazenamentoLocal.js';
import { appAlert } from './appDialog.js';
import { buscarTomMemoria, normalizarMinistranteIdPlaylist, normalizarMinistrantePadraoPorCulto, normalizarTomPlaylist } from '../modules/playlistMinistranteTom.js';
import { ehMarcadorTemaPlaylist, fonteBancoItemPlaylist } from '../modules/playlistVersaoMusica.js';
import { estadoPainel } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasPlaylistTemas(d) {
  dep = d || {};
}
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const getPlaylist = (...a) => dep.getPlaylist(...a);
const getTemaSelecionadoAtual = (...a) => dep.getTemaSelecionadoAtual(...a);
const marcarBancoCompartilhadoAlterado = (...a) => dep.marcarBancoCompartilhadoAlterado(...a);
const savePlaylists = (...a) => dep.savePlaylists(...a);
const setTemaSelecionadoAtual = (...a) => dep.setTemaSelecionadoAtual(...a);

export function loadPlaylists() {
  try {
    let raw = localStorage.getItem(LS_PLAYLISTS);
    if (!raw && localStorage.getItem(LS_PLAYLISTS_LEGACY)) {
      raw = localStorage.getItem(LS_PLAYLISTS_LEGACY);
      localStorage.setItem(LS_PLAYLISTS, raw);
      localStorage.removeItem(LS_PLAYLISTS_LEGACY);
    }
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === 'object' && p ? p : {};
  } catch (_) { return {}; }
}

export function normalizarTemaPlaylist(v) {
  return String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40)
    .toLocaleUpperCase('pt-BR');
}

export function normalizarListaTemas(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  arr.forEach((t) => {
    const n = normalizarTemaPlaylist(t);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  });
  return out;
}

/**
 * Remove marcadores do tema e todas as músicas desse bloco (ordem dos marcadores na playlist).
 * O cabeçalho visual segue o marcador anterior; muitas linhas podem ter `tema` vazio ou desactualizado.
 */
export function filtrarPlaylistRemovendoTemaComMarcadores(pl, tNorm) {
  const t = normalizarTemaPlaylist(tNorm);
  if (!t || !Array.isArray(pl)) return pl ? pl.slice() : [];
  const out = [];
  const len = pl.length;
  let i = 0;

  if (len && !ehMarcadorTemaPlaylist(pl[0])) {
    let j = 0;
    while (j < len && !ehMarcadorTemaPlaylist(pl[j])) j++;
    const temaPrefixo = normalizarTemaPlaylist(pl[0]?.tema);
    for (let k = 0; k < j; k++) {
      const it = pl[k];
      const ti = normalizarTemaPlaylist(it?.tema);
      if (temaPrefixo === t || ti === t) continue;
      out.push(it);
    }
    i = j;
  }

  let ignorarAteProximoMarcador = false;
  while (i < len) {
    const it = pl[i];
    if (ehMarcadorTemaPlaylist(it)) {
      const mt = normalizarTemaPlaylist(it.tema);
      if (mt === t) {
        ignorarAteProximoMarcador = true;
        i++;
        continue;
      }
      ignorarAteProximoMarcador = false;
      out.push(it);
      i++;
      continue;
    }
    if (ignorarAteProximoMarcador) {
      i++;
      continue;
    }
    if (normalizarTemaPlaylist(it?.tema) === t) {
      i++;
      continue;
    }
    out.push(it);
    i++;
  }
  return out;
}

function chaveArmazenamentoSecaoTemaPlaylist(cid, rotuloCabecalho) {
  const n = normalizarTemaPlaylist(rotuloCabecalho);
  const tag = n ? n : '__SEM_TEMA__';
  return `${String(cid || '')}|||${tag}`;
}

export function carregarMapaSecoesTemaPlaylistRecolhidas() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}

export function secaoTemaPlaylistRecolhida(cid, rotuloCabecalho) {
  const k = chaveArmazenamentoSecaoTemaPlaylist(cid, rotuloCabecalho);
  return !!carregarMapaSecoesTemaPlaylistRecolhidas()[k];
}

export function definirSecaoTemaPlaylistRecolhida(cid, rotuloCabecalho, recolhido) {
  const m = { ...carregarMapaSecoesTemaPlaylistRecolhidas() };
  const k = chaveArmazenamentoSecaoTemaPlaylist(cid, rotuloCabecalho);
  if (recolhido) m[k] = true;
  else delete m[k];
  try {
    localStorage.setItem(LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS, JSON.stringify(m));
  } catch (_) {
  // intencional — erro ignorado
}
}

export function atualizarUiExpandSecaoTema(btn, recolhido) {
  if (recolhido) {
    btn.innerHTML = SVG_PLAYLIST_SECAO_EXPANDIR;
    btn.title = 'Expandir músicas deste tema';
    btn.setAttribute('aria-expanded', 'false');
  } else {
    btn.innerHTML = SVG_PLAYLIST_SECAO_RECOLHER;
    btn.title = 'Recolher músicas deste tema';
    btn.setAttribute('aria-expanded', 'true');
  }
}

export function playlistPossuiMarcadoresTema(pl) {
  return Array.isArray(pl) && pl.some(ehMarcadorTemaPlaylist);
}

export function obterUltimoMarcadorTema(pl) {
  if (!Array.isArray(pl)) return '';
  for (let i = pl.length - 1; i >= 0; i--) {
    if (ehMarcadorTemaPlaylist(pl[i])) return normalizarTemaPlaylist(pl[i].tema);
  }
  return '';
}

/** Lista os temas distintos (por marcador) presentes na playlist, na ordem em que aparecem. */
export function listarMarcadoresTemaPlaylist(pl) {
  if (!Array.isArray(pl)) return [];
  const seen = new Set();
  const out = [];
  for (const it of pl) {
    if (!ehMarcadorTemaPlaylist(it)) continue;
    const t = normalizarTemaPlaylist(it.tema);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Insere `item` no fim do bloco do tema escolhido (posição correta na playlist plana),
 * já que os blocos são delimitados por marcadores. Se o tema não for encontrado, faz push.
 * Usa a última ocorrência do marcador, caso haja marcadores repetidos com o mesmo nome.
 */
export function inserirMusicaNoBlocoTema(pl, tema, item) {
  if (!Array.isArray(pl)) return;
  const alvo = normalizarTemaPlaylist(tema);
  let markerIdx = -1;
  for (let i = 0; i < pl.length; i++) {
    if (ehMarcadorTemaPlaylist(pl[i]) && normalizarTemaPlaylist(pl[i].tema) === alvo) {
      markerIdx = i;
    }
  }
  if (markerIdx < 0) {
    pl.push(item);
    return;
  }
  let fimBloco = markerIdx + 1;
  while (fimBloco < pl.length && !ehMarcadorTemaPlaylist(pl[fimBloco])) fimBloco++;
  pl.splice(fimBloco, 0, item);
}

export function loadTemaSelecionadoPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_TEMA_SEL);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
}

export function saveTemaSelecionadoPorCulto() {
  try {
    localStorage.setItem(LS_PLAYLIST_TEMA_SEL, JSON.stringify(estadoPainel.temaSelecionadoPorCulto || {}));
  } catch (_) {
  // intencional — erro ignorado
}
}

export function migrarTemasParaGlobal() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_TEMAS);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return;
    // Se já tem __global__, não faz nada
    if (Array.isArray(p['__global__']) && p['__global__'].length) return;
    // Junta todos os temas de todos os cultos em __global__
    const todos = [];
    const seen = new Set();
    Object.values(p).forEach((arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((t) => {
        const n = normalizarTemaPlaylist(t);
        if (n && !seen.has(n)) { seen.add(n); todos.push(n); }
      });
    });
    if (!todos.length) return;
    p['__global__'] = ordenarTemasLista(todos);
    localStorage.setItem(LS_PLAYLIST_TEMAS, JSON.stringify(p));
  } catch (_) {
  // intencional — erro ignorado
}
}

export function loadTemasPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_TEMAS);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return {};
    const out = {};
    Object.keys(p).forEach((cid) => {
      out[cid] = normalizarListaTemas(p[cid]);
    });
    return out;
  } catch (_) {
    return {};
  }
}

export function saveTemasPorCulto() {
  try {
    localStorage.setItem(LS_PLAYLIST_TEMAS, JSON.stringify(estadoPainel.temasPorCulto || {}));
  } catch (_) {
  // intencional — erro ignorado
}
  marcarBancoCompartilhadoAlterado();
}

export function getTemasDoCultoAtual() {
  if (!Array.isArray(estadoPainel.temasPorCulto['__global__'])) estadoPainel.temasPorCulto['__global__'] = [];
  estadoPainel.temasPorCulto['__global__'] = normalizarListaTemas(estadoPainel.temasPorCulto['__global__']);
  return estadoPainel.temasPorCulto['__global__'];
}

export function garantirTemaNoCatalogoAtual(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t) return;
  const lista = getTemasDoCultoAtual();
  if (lista.includes(t)) return;
  lista.push(t);
  estadoPainel.temasPorCulto['__global__'] = normalizarListaTemas(lista);
  saveTemasPorCulto();
}

/** Mantém a ordem do array e coloca ABERTURA sempre em primeiro. */
export function ordenarTemasLista(arr) {
  const lista = normalizarListaTemas(arr || []);
  const resto = lista.filter((t) => t !== TEMA_PADRAO_ABERTURA);
  if (lista.includes(TEMA_PADRAO_ABERTURA)) return [TEMA_PADRAO_ABERTURA, ...resto];
  return resto;
}

let aberturaRemovidaPorCulto = {};

/** Ministrante padrão por culto — herdado por músicas novas na playlist. */
let ministrantePadraoPorCulto = {};

/** Há pelo menos uma música (não marcador de tema) na playlist do culto. */
function cultoTemMusicaNaPlaylist(cid) {
  const id = String(cid || '').trim();
  if (!id) return false;
  const pl = estadoPainel.playlists[id];
  if (!Array.isArray(pl)) return false;
  return pl.some((it) => it && !ehMarcadorTemaPlaylist(it));
}

/**
 * Mapa só com cultos que têm música — é o que pode sobreviver a reload/sair.
 * Sem música na playlist, a seleção do ministrante é só da sessão actual.
 */
export function mapaMinistrantePadraoPersistivel() {
  const src = normalizarMinistrantePadraoPorCulto(ministrantePadraoPorCulto);
  const out = {};
  for (const [cid, mid] of Object.entries(src)) {
    if (cultoTemMusicaNaPlaylist(cid)) out[cid] = mid;
  }
  return out;
}

export function loadMinistrantePadraoPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_MINISTRANTE_PADRAO);
    if (!raw) return {};
    return normalizarMinistrantePadraoPorCulto(JSON.parse(raw));
  } catch (_) {
    return {};
  }
}

export function persistirMinistrantePadraoNoLocalStorage() {
  try {
    localStorage.setItem(LS_PLAYLIST_MINISTRANTE_PADRAO, JSON.stringify(mapaMinistrantePadraoPersistivel()));
  } catch (_) {
    // intencional — erro ignorado
  }
}

export function saveMinistrantePadraoPorCulto() {
  persistirMinistrantePadraoNoLocalStorage();
  marcarBancoCompartilhadoAlterado();
}

export function setMinistrantePadraoCulto(cid, ministranteId) {
  const id = String(cid || '').trim();
  if (!id) return;
  const mid = normalizarMinistranteIdPlaylist(ministranteId);
  if (mid) ministrantePadraoPorCulto[id] = mid;
  else delete ministrantePadraoPorCulto[id];
  saveMinistrantePadraoPorCulto();
}

/**
 * No arranque/reload: descarta selecções gravadas de cultos sem músicas.
 * A UI fica limpa; só permanece o que ainda tem playlist com música.
 */
export function podarMinistrantePadraoSemMusicasNaPlaylist() {
  let mudou = false;
  for (const cid of Object.keys(ministrantePadraoPorCulto || {})) {
    if (!cultoTemMusicaNaPlaylist(cid)) {
      delete ministrantePadraoPorCulto[cid];
      mudou = true;
    }
  }
  if (mudou) saveMinistrantePadraoPorCulto();
  return mudou;
}

/**
 * Ministrante padrão do culto. Se ainda não estiver gravado, infere quando todas as
 * músicas existentes partilham o mesmo ministrante (playlists já configuradas antes
 * desta funcionalidade).
 */
export function getMinistrantePadraoCulto(cid) {
  const id = String(cid || '').trim();
  if (!id) return null;
  const stored = normalizarMinistranteIdPlaylist(ministrantePadraoPorCulto[id]);
  if (stored) return stored;
  const pl = estadoPainel.playlists[id];
  if (!Array.isArray(pl)) return null;
  let unico = null;
  for (const it of pl) {
    if (!it || ehMarcadorTemaPlaylist(it)) continue;
    const mid = normalizarMinistranteIdPlaylist(it.ministranteId);
    if (!mid) return null;
    if (unico == null) unico = mid;
    else if (unico !== mid) return null;
  }
  if (unico) {
    ministrantePadraoPorCulto[id] = unico;
    saveMinistrantePadraoPorCulto();
  }
  return unico;
}

/** Ministrante + tom para uma música recém-adicionada à playlist. */
export async function camposMinistranteTomParaNovaMusicaNaPlaylist(cid, meta) {
  const fromMeta = normalizarMinistranteIdPlaylist(meta?.ministranteId);
  if (fromMeta) {
    return {
      ministranteId: fromMeta,
      tom: normalizarTomPlaylist(meta?.tom),
    };
  }
  const padrao = getMinistrantePadraoCulto(cid);
  if (!padrao) return { ministranteId: null, tom: '' };
  let tom = '';
  try {
    tom =
      (await buscarTomMemoria(
        getControllerApiBase(),
        padrao,
        Number(meta?.id),
        fonteBancoItemPlaylist(meta),
        meta?.titulo
      )) || '';
  } catch (_) {
    // intencional — memória indisponível; ministrante sem tom
  }
  return { ministranteId: padrao, tom: normalizarTomPlaylist(tom) };
}

export function loadAberturaRemovidaPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_ABERTURA_REMOVIDA);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
}

export function saveAberturaRemovidaPorCulto() {
  try {
    localStorage.setItem(LS_PLAYLIST_ABERTURA_REMOVIDA, JSON.stringify(aberturaRemovidaPorCulto || {}));
  } catch (_) {
  // intencional — erro ignorado
}
  marcarBancoCompartilhadoAlterado();
}

function cultoUsuarioRemoveuAbertura(cid) {
  return !!aberturaRemovidaPorCulto[String(cid || '')];
}

export function marcarAberturaRemovidaPeloUsuario(cid) {
  const id = String(cid || '');
  if (!id) return;
  aberturaRemovidaPorCulto[id] = true;
  saveAberturaRemovidaPorCulto();
}

export function desmarcarAberturaRemovidaPeloUsuario(cid) {
  const id = String(cid || '');
  if (!id) return;
  delete aberturaRemovidaPorCulto[id];
  saveAberturaRemovidaPorCulto();
}

function playlistTemMarcadorAbertura(pl) {
  return (pl || []).some(
    (it) => ehMarcadorTemaPlaylist(it) && normalizarTemaPlaylist(it.tema) === TEMA_PADRAO_ABERTURA
  );
}

function playlistParaBlocosComMarcadores(pl) {
  const blocos = [];
  let i = 0;
  if (pl.length && !ehMarcadorTemaPlaylist(pl[0])) {
    let j = 0;
    while (j < pl.length && !ehMarcadorTemaPlaylist(pl[j])) j++;
    blocos.push({
      tema: normalizarTemaPlaylist(pl[0]?.tema) || '',
      itens: pl.slice(0, j),
      markerPlIdx: null,
    });
    i = j;
  }
  while (i < pl.length) {
    if (ehMarcadorTemaPlaylist(pl[i])) {
      const markerPlIdx = i;
      const tema = normalizarTemaPlaylist(pl[i].tema);
      let j = i + 1;
      while (j < pl.length && !ehMarcadorTemaPlaylist(pl[j])) j++;
      blocos.push({ tema, itens: pl.slice(i, j), markerPlIdx });
      i = j;
    } else {
      i++;
    }
  }
  return blocos;
}

function blocosComMarcadoresParaPlaylist(blocos) {
  return blocos.flatMap((b) => b.itens);
}

export function garantirAberturaNoCatalogoCulto(cid) {
  garantirTemaNoCatalogoAtual(TEMA_PADRAO_ABERTURA);
  if (!cid) return;
  if (!Array.isArray(estadoPainel.temasPorCulto[cid])) estadoPainel.temasPorCulto[cid] = [];
  const lista = normalizarListaTemas(estadoPainel.temasPorCulto[cid]);
  if (!lista.includes(TEMA_PADRAO_ABERTURA)) {
    estadoPainel.temasPorCulto[cid] = [TEMA_PADRAO_ABERTURA, ...lista];
    saveTemasPorCulto();
  } else {
    const ordenada = ordenarTemasLista(lista);
    if (ordenada.join('\u0001') !== lista.join('\u0001')) {
      estadoPainel.temasPorCulto[cid] = ordenada;
      saveTemasPorCulto();
    }
  }
}

export function garantirMarcadorAberturaNaPlaylist(cid) {
  if (!cid || cultoUsuarioRemoveuAbertura(cid)) return false;
  const pl = getPlaylist(cid);
  if (playlistTemMarcadorAbertura(pl)) return false;
  garantirAberturaNoCatalogoCulto(cid);
  pl.unshift({ tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema: TEMA_PADRAO_ABERTURA });
  estadoPainel.playlists[cid] = pl;
  return true;
}

function sincronizarOrdemTemasCatalogoComPlaylist(cid) {
  if (!cid) return;
  const pl = getPlaylist(cid);
  const ordem = [];
  const seen = new Set();
  playlistParaBlocosComMarcadores(pl).forEach((b) => {
    const t = b.tema;
    if (t && !seen.has(t)) {
      seen.add(t);
      ordem.push(t);
    }
  });
  (pl || []).forEach((it) => {
    if (ehMarcadorTemaPlaylist(it)) return;
    const t = normalizarTemaPlaylist(it?.tema);
    if (t && !seen.has(t)) {
      seen.add(t);
      ordem.push(t);
    }
  });
  const extras = (estadoPainel.temasPorCulto[cid] || []).filter((t) => t && !seen.has(t));
  estadoPainel.temasPorCulto[cid] = ordenarTemasLista(normalizarListaTemas([...ordem, ...extras]));
  saveTemasPorCulto();
}

/**
 * Move o bloco do tema `fromMarkerIdx` para antes ou depois do bloco `toMarkerIdx`.
 *
 * `posicao` é obrigatória para o resultado ser previsível: com um único índice de
 * destino, arrastar para baixo e para cima davam semânticas diferentes (o `splice`
 * de inserção acontece já com os índices deslocados pela remoção). Aqui o destino é
 * calculado na lista original e só depois compensado em -1 quando o bloco removido
 * estava antes dele.
 *
 * @returns {boolean} `true` se a ordem mudou de facto.
 */
export function reordenarMarcadoresTemaNaPlaylist(cid, fromMarkerIdx, toMarkerIdx, posicao = 'antes') {
  const from = Number(fromMarkerIdx);
  const to = Number(toMarkerIdx);
  if (!cid || !Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  const pl = getPlaylist(cid);
  const blocos = playlistParaBlocosComMarcadores(pl);
  const fromB = blocos.findIndex((b) => b.markerPlIdx === from);
  const toB = blocos.findIndex((b) => b.markerPlIdx === to);
  if (fromB < 0 || toB < 0 || blocos[fromB].markerPlIdx == null) return false;

  let alvo = posicao === 'depois' ? toB + 1 : toB;
  /* O bloco inicial sem marcador (músicas antes do 1.º tema) tem de continuar em
     primeiro: sem marcador próprio, as suas músicas seriam absorvidas pelo tema acima. */
  if (blocos[0] && blocos[0].markerPlIdx == null && alvo === 0) alvo = 1;
  if (fromB < alvo) alvo -= 1;
  if (alvo === fromB) return false;

  const reord = [...blocos];
  const [bloco] = reord.splice(fromB, 1);
  reord.splice(alvo, 0, bloco);
  estadoPainel.playlists[cid] = blocosComMarcadoresParaPlaylist(reord);
  sincronizarOrdemTemasCatalogoComPlaylist(cid);
  savePlaylists();
  return true;
}

export function renomearTemaNoCulto(velho, novo) {
  const v = normalizarTemaPlaylist(velho);
  const n = normalizarTemaPlaylist(novo);
  if (!v || !n) return false;
  if (v === n) return true;
  const lista = ordenarTemasLista(getTemasDoCultoAtual());
  if (!lista.includes(v)) return false;
  if (lista.includes(n)) {
    appAlert('Já existe um tema com esse nome.');
    return false;
  }
  estadoPainel.temasPorCulto['__global__'] = normalizarListaTemas(lista.map((t) => (t === v ? n : t)));
  saveTemasPorCulto();
  // Atualiza todas as playlists
  Object.keys(estadoPainel.playlists).forEach((cid) => {
    const pl = getPlaylist(cid);
    pl.forEach((it) => {
      if (normalizarTemaPlaylist(it.tema) === v) it.tema = n;
    });
  });
  if (getTemaSelecionadoAtual() === v) setTemaSelecionadoAtual(n);
  savePlaylists();
  return true;
}

/* ─── Pontos de contato com o núcleo e com outros módulos (o estado acima é privado) ─── */

export function getAberturaRemovidaPorCulto() {
  return aberturaRemovidaPorCulto;
}

export function setAberturaRemovidaPorCulto(valor) {
  aberturaRemovidaPorCulto = valor;
}

export function getMinistrantePadraoPorCulto() {
  return ministrantePadraoPorCulto;
}

export function setMinistrantePadraoPorCulto(valor) {
  ministrantePadraoPorCulto = valor;
}
