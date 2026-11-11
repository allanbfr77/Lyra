/**
 * Playlist: músicas já transmitidas (check verde por culto), última música projetada, seleção na
 * interface e botão «próxima música». Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo
 * ainda possui entra por `registrarDependenciasPlaylistTransmitidas`.
 */
import { ehMarcadorTemaPlaylist } from '../modules/playlistVersaoMusica.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { ehModoSlidesOperador } from './modosUi.js';
import { encerrarProjecaoDoControlador } from './projecaoMusica.js';
import { getPlaylist, indiceProximaMusicaNaPlaylist, playlistItemMesmaVersaoQueAtiva, playlistItemMesmaVersaoQueSelecaoUi } from './playlistServidor.js';
import { renderPlaylist } from './playlistLista.js';

/* ── Músicas já transmitidas da playlist (check verde ao lado do número) ──
   Uma música ganha o check quando o operador passa para OUTRA música (ver `atualizarChecksAoProjetar`).
   Guardado por culto no localStorage, para sobreviver a recarregar o painel. */
const LS_PLAYLIST_TRANSMITIDAS = 'lyra_playlist_transmitidas_v1';
let playlistTransmitidas = null;

function carregarPlaylistTransmitidas() {
  if (playlistTransmitidas) return playlistTransmitidas;
  playlistTransmitidas = new Set();
  try {
    const arr = JSON.parse(localStorage.getItem(LS_PLAYLIST_TRANSMITIDAS) || '[]');
    if (Array.isArray(arr)) arr.forEach((k) => playlistTransmitidas.add(String(k)));
  } catch (_) {
    // intencional — sem localStorage a marcação vale só nesta sessão
  }
  return playlistTransmitidas;
}

function chaveTransmitidaPlaylist(it) {
  return `${estadoPainel.cultoId}|${Number(it?.id)}|${it?.versaoLocalId ?? ''}|${it?.bancoFonte ?? ''}`;
}

export function playlistItemFoiTransmitido(it) {
  return !!it && !ehMarcadorTemaPlaylist(it) && carregarPlaylistTransmitidas().has(chaveTransmitidaPlaylist(it));
}

function salvarPlaylistTransmitidas() {
  try {
    localStorage.setItem(LS_PLAYLIST_TRANSMITIDAS, JSON.stringify([...carregarPlaylistTransmitidas()]));
  } catch (_) {
    // intencional — erro ignorado
  }
}

/**
 * Tira as marcações de músicas que já não estão na playlist deste culto. É o que impede
 * uma música excluída e adicionada de novo de herdar o check de antes.
 */
export function podarTransmitidasDoCultoAtual(pl) {
  if (!estadoPainel.cultoId) return;
  const set = carregarPlaylistTransmitidas();
  const prefixo = `${estadoPainel.cultoId}|`;
  const validas = new Set((Array.isArray(pl) ? pl : []).filter((it) => it && !ehMarcadorTemaPlaylist(it)).map(chaveTransmitidaPlaylist));
  let mudou = false;
  for (const k of [...set]) {
    if (k.startsWith(prefixo) && !validas.has(k)) {
      set.delete(k);
      mudou = true;
    }
  }
  if (mudou) salvarPlaylistTransmitidas();
}

/** «Resetar» do modo Slides: apaga os checks de todas as músicas da playlist deste culto. */
export function limparChecksTransmitidosDoCulto() {
  if (!estadoPainel.cultoId) return;
  const set = carregarPlaylistTransmitidas();
  const prefixo = `${estadoPainel.cultoId}|`;
  let mudou = false;
  for (const k of [...set]) {
    if (k.startsWith(prefixo)) {
      set.delete(k);
      mudou = true;
    }
  }
  if (!mudou) return;
  salvarPlaylistTransmitidas();
  renderPlaylist();
}

const LS_PLAYLIST_ULTIMA_PROJETADA = 'lyra_playlist_ultima_projetada_v1';
let ultimaChaveProjetada = null;

/**
 * O check de uma música só acende quando o operador PASSA para outra: ao projetar a 2, a 1
 * ganha o check (ela terminou); a 2 só ganha o seu quando a 3 for projetada, e assim por
 * diante. Chamado a cada envio de slide às telas.
 */
export function atualizarChecksAoProjetar() {
  if (!estadoPainel.musicaAtiva || !estadoPainel.cultoId) return;
  const item = getPlaylist(estadoPainel.cultoId).find((it) => playlistItemMesmaVersaoQueAtiva(it));
  if (!item) return;
  const atual = chaveTransmitidaPlaylist(item);
  const musicas = getPlaylist(estadoPainel.cultoId).filter((it) => it && !ehMarcadorTemaPlaylist(it));
  const ehPrimeira = musicas.length > 0 && chaveTransmitidaPlaylist(musicas[0]) === atual;
  if (ultimaChaveProjetada == null) {
    try {
      ultimaChaveProjetada = localStorage.getItem(LS_PLAYLIST_ULTIMA_PROJETADA) || null;
    } catch (_) {
      // intencional — sem localStorage vale só nesta sessão
    }
  }
  const anterior = ultimaChaveProjetada;
  let mudou = false;
  if (ehPrimeira) {
    /* Projetar a música 1 começa uma passagem nova: os checks de ensaios anteriores somem,
       para o culto de verdade começar limpo. */
    const set = carregarPlaylistTransmitidas();
    for (const k of [...set]) {
      if (k.startsWith(`${estadoPainel.cultoId}|`)) {
        set.delete(k);
        mudou = true;
      }
    }
    if (mudou) salvarPlaylistTransmitidas();
  } else if (anterior && anterior !== atual && anterior.startsWith(`${estadoPainel.cultoId}|`)) {
    const set = carregarPlaylistTransmitidas();
    if (!set.has(anterior)) {
      set.add(anterior);
      salvarPlaylistTransmitidas();
      mudou = true;
    }
  }
  ultimaChaveProjetada = atual;
  try {
    localStorage.setItem(LS_PLAYLIST_ULTIMA_PROJETADA, atual);
  } catch (_) {
    // intencional — erro ignorado
  }
  if (mudou) renderPlaylist();
}

/**
 * A última música da playlist não tem «próxima» que a faça passar: o check dela acende
 * quando a projeção é encerrada (Encerrar/Esc/limpar tela) estando ela no ar.
 */
export function marcarUltimaMusicaAoEncerrar() {
  if (!estadoPainel.musicaAtiva || !estadoPainel.cultoId || !estadoPainel.projecaoMusicaEmitidaNoServidor) return;
  const musicas = getPlaylist(estadoPainel.cultoId).filter((it) => it && !ehMarcadorTemaPlaylist(it));
  const ultima = musicas[musicas.length - 1];
  if (!ultima || !playlistItemMesmaVersaoQueAtiva(ultima)) return;
  const set = carregarPlaylistTransmitidas();
  const k = chaveTransmitidaPlaylist(ultima);
  if (set.has(k)) return;
  set.add(k);
  salvarPlaylistTransmitidas();
  renderPlaylist();
}

/** Há música seguinte após a actualmente activa (para o botão «Próxima música»). */
function haProximaMusicaNaPlaylistAtiva() {
  if (!estadoPainel.musicaAtiva) return false;
  const pl = getPlaylist(estadoPainel.cultoId);
  const ix = pl.findIndex((it) => playlistItemMesmaVersaoQueAtiva(it));
  if (ix < 0) return false;
  return indiceProximaMusicaNaPlaylist(pl, ix) >= 0;
}

export function atualizarEstadoBtnProximaMusicaPlaylist() {
  const btnNx = document.getElementById('btn-proxima-musica-playlist');
  if (!btnNx) return;
  btnNx.disabled = !projecao.pronta() || !haProximaMusicaNaPlaylistAtiva();
}

/**
 * `musicaAtiva` sobrevive à saída do modo slides (a Home mantém a música no editor),
 * mas a faixa de slides é rearmada do zero ao reentrar. Sem esta distinção, a linha
 * ficava destacada com a grade vazia e o primeiro clique caía no ramo «desmarcar»,
 * exigindo um segundo clique para os slides voltarem.
 *
 * No modo slides, só há seleção enquanto a faixa está de facto preenchida.
 */
function playlistSelecaoVisivelNoModoAtual() {
  if (!estadoPainel.musicaAtiva) return false;
  if (!ehModoSlidesOperador()) return true;
  return estadoPainel.faixaSlidesHabilitadaPorPlaylistNoModoSlides;
}

/**
 * Destaque da linha na Playlist — independente da Biblioteca e do que está no centro.
 */
export function playlistItemDestacadoNaUi(it) {
  return playlistItemMesmaVersaoQueSelecaoUi(it);
}

/**
 * Clique na linha já carregada no centro e já marcada nesta coluna: segundo clique desmarca.
 * Só desmarca se a seleção visual da Playlist for desta linha — senão um clique
 * na Playlist após abrir a mesma música pela Biblioteca apagaria o centro.
 * Para lógica funcional (próxima música, deduplicação) usar
 * `playlistItemMesmaVersaoQueAtiva`, que ignora o estado da faixa.
 */
export function playlistItemSelecionadoNaUi(it) {
  return (
    playlistSelecaoVisivelNoModoAtual() &&
    playlistItemMesmaVersaoQueAtiva(it) &&
    playlistItemMesmaVersaoQueSelecaoUi(it)
  );
}

/** Segundo clique na mesma linha da playlist: desmarca (como ESC no modo slides). */
export function deselecionarMusicaAtivaAPartirDaPlaylist() {
  if (ehModoSlidesOperador()) estadoPainel.slidesRailUserRecolhido = true;
  encerrarProjecaoDoControlador({ limparMusica: true });
}
