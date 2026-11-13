/**
 * Lista da playlist: renderização com marcadores de tema, contagens, copiar nomes, animação de
 * reordenação e arrastar/soltar de músicas e de marcadores. Movido verbatim do núcleo
 * (`controllerAppCore.js`); o que o núcleo ainda possui entra por `registrarDependenciasPlaylistLista`.
 */
import { TEMA_PADRAO_ABERTURA } from '../modules/chavesArmazenamentoLocal.js';
import { ajustarCorpoSeletoresDoCulto } from './cultoDoDia.js';
import { appAlert, appConfirm } from './appDialog.js';
import { atualizarEstadoAdicionadasListaLocal } from './bibliotecaMusicas.js';
import { atualizarUiExpandSecaoTema, definirSecaoTemaPlaylistRecolhida, filtrarPlaylistRemovendoTemaComMarcadores, marcarAberturaRemovidaPeloUsuario, normalizarTemaPlaylist, playlistPossuiMarcadoresTema, reordenarMarcadoresTemaNaPlaylist, secaoTemaPlaylistRecolhida } from './playlistTemas.js';
import { ehMarcadorTemaPlaylist } from '../modules/playlistVersaoMusica.js';
import { htmlLinhaPlaylistModoAtual, renderSeletorMinistranteCulto, temaDoBlocoNaPlaylist } from './ministrantesTons.js';
import { playlistItemDestacadoNaUi, playlistItemFoiTransmitido, podarTransmitidasDoCultoAtual } from './playlistTransmitidas.js';
import { estadoPainel } from './estadoPainel.js';
import { ehModoSlidesOperador } from './modosUi.js';
import { encerrarProjecaoDoControlador } from './projecaoMusica.js';
import { garantirMusicaAtivaVisivelNaPlaylist, ligarBotoesESeletoresLinhaPlaylist, sufixoRotuloVersaoPlaylist } from './playlistLinhaUi.js';
import { getPlaylist, playlistItemMesmaVersaoQueAtiva, savePlaylists } from './playlistServidor.js';
import { getTemaSelecionadoAtual, renderSeletorTemasPlaylist, setTemaSelecionadoAtual } from './temasPlaylistUi.js';

/**
 * Classe da linha de música conforme onde ela vai ser anexada.
 *
 * A linha nasceu como cartão isolado e passou a ser uma linha dentro do cartão da
 * secção — mas continua a poder ser usada solta (uma busca, uma lista sem temas), e aí
 * o desenho de linha não se sustenta: sem cartão à volta, os divisores separam o nada.
 * Quem monta a lista já sabe qual é o caso — se está a anexar à raiz, é solta — e é essa
 * a única informação de que a variante precisa.
 *
 * @param {HTMLElement} parent onde a linha vai ser anexada
 * @param {HTMLElement} raiz raiz da lista (`#playlist-list`)
 * @param {boolean} ativa
 */
function classeLinhaPlaylist(parent, raiz, ativa) {
  const variante = parent === raiz ? ' playlist-row--card' : '';
  return 'playlist-row' + variante + (ativa ? ' ativo' : '');
}

/** Ordem da playlist respeitando marcadores de tema (cabeçalhos mesmo sem música). */
function renderPlaylistItensComMarcadores(el, pl) {
  let i = 0;
  let songNum = 0;
  let songAppendParent = el;

  const appendSongRow = (item, idxPl) => {
    songNum++;
    const row = document.createElement('div');
    row.dataset.plIdx = String(idxPl);
    row.className = classeLinhaPlaylist(
      songAppendParent,
      el,
      playlistItemDestacadoNaUi(item)
    );
    const rotuloVersao = sufixoRotuloVersaoPlaylist(item);
    row.innerHTML = htmlLinhaPlaylistModoAtual(item, songNum, rotuloVersao);
    if (playlistItemFoiTransmitido(item)) row.classList.add('playlist-row--transmitida');
    ligarBotoesESeletoresLinhaPlaylist(row, item, idxPl);
    songAppendParent.appendChild(row);
  };

  if (pl.length && !ehMarcadorTemaPlaylist(pl[0])) {
    let j = 0;
    while (j < pl.length && !ehMarcadorTemaPlaylist(pl[j])) j++;
    const rotulo = normalizarTemaPlaylist(pl[0]?.tema) || 'Sem tema';
    songAppendParent = anexarCabecalhoTemaPlaylist(el, rotulo, null);
    for (let k = 0; k < j; k++) appendSongRow(pl[k], k);
    i = j;
  }

  while (i < pl.length) {
    const it = pl[i];
    if (ehMarcadorTemaPlaylist(it)) {
      songAppendParent = anexarCabecalhoTemaPlaylist(
        el,
        normalizarTemaPlaylist(it.tema) || 'Sem tema',
        i
      );
      i++;
      continue;
    }
    appendSongRow(it, i);
    i++;
  }
}

/** Gera a lista numerada só com o NOME das músicas da playlist atual (sem autor/tags). */
function gerarTextoNomesMusicasPlaylist() {
  if (!estadoPainel.cultoId) return '';
  const pl = getPlaylist(estadoPainel.cultoId) || [];
  const linhas = [];
  for (const it of pl) {
    if (ehMarcadorTemaPlaylist(it)) continue;
    const nome = String(it?.titulo ?? '').trim();
    if (!nome) continue;
    linhas.push(`${linhas.length + 1}. ${nome}`);
  }
  return linhas.join('\n');
}

const PLAYLIST_COPIAR_ICONE_COPY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const PLAYLIST_COPIAR_ICONE_CHECK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
let playlistCopiarFeedbackTimer = null;

/** Copia a lista de músicas para a área de transferência e dá micro-feedback (ícone → check). */
export async function copiarNomesMusicasPlaylist() {
  const btn = document.getElementById('playlist-copiar-nomes-btn');
  const texto = gerarTextoNomesMusicasPlaylist();
  if (!texto) {
    appAlert('Nenhuma música na playlist para copiar.');
    return;
  }
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
      ok = true;
    }
  } catch (_) {
    // fallback abaixo
  }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {
      ok = false;
    }
  }
  if (!ok) {
    appAlert('Não foi possível copiar a lista de músicas.');
    return;
  }
  if (btn) {
    clearTimeout(playlistCopiarFeedbackTimer);
    btn.innerHTML = PLAYLIST_COPIAR_ICONE_CHECK;
    btn.classList.add('copiado');
    btn.title = 'Copiado!';
    playlistCopiarFeedbackTimer = setTimeout(() => {
      btn.innerHTML = PLAYLIST_COPIAR_ICONE_COPY;
      btn.classList.remove('copiado');
      btn.title = 'Copiar lista numerada das músicas (só o nome)';
      playlistCopiarFeedbackTimer = null;
    }, 1500);
  }
}

/**
 * Desenha a playlist do culto e, a seguir, sincroniza a biblioteca à esquerda.
 *
 * A biblioteca esmaece as músicas que já estão neste culto; esse estado só pode
 * mudar quando a playlist muda, e todas as alterações passam por aqui. Fica um
 * invólucro (e não uma chamada no fim de `renderPlaylistPainel`) porque essa
 * função tem vários `return` pelo meio — no culto vazio, no culto por escolher —
 * e a sincronização tem de acontecer também nesses caminhos.
 */
export function renderPlaylist() {
  renderPlaylistPainel();
  atualizarEstadoAdicionadasListaLocal();
}

function renderPlaylistPainel() {
  renderPlaylistPainelCorpo();
  atualizarContagensPlaylist();
}

function textoContagemMusicas(n) {
  return `${n} ${n === 1 ? 'música' : 'músicas'}`;
}

/**
 * Contagens da lista já desenhada: por bloco («4 músicas») e na barra («6 músicas · 3 momentos»).
 * Lê o DOM, não o array: é o que está na tela, e roda a cada `renderPlaylistPainel`.
 */
function atualizarContagensPlaylist() {
  const lista = document.getElementById('playlist-list');
  const total = document.getElementById('playlist-lista-contagem');
  if (!lista) return;
  const secoes = lista.querySelectorAll('.playlist-tema-section');
  secoes.forEach((sec) => {
    const n = sec.querySelectorAll('.playlist-tema-section-body .playlist-row').length;
    const c = sec.querySelector('.playlist-tema-head-count');
    if (c) c.textContent = textoContagemMusicas(n);
    /* Bloco expandido sem músicas: uma linha discreta, para o corpo não parecer defeito. */
    const corpo = sec.querySelector('.playlist-tema-section-body');
    if (corpo && n === 0 && !corpo.querySelector('.playlist-tema-vazio')) {
      const vazio = document.createElement('div');
      vazio.className = 'playlist-tema-vazio';
      vazio.textContent = 'Nenhuma música neste momento';
      corpo.appendChild(vazio);
    }
  });
  if (!total) return;
  if (!estadoPainel.cultoId) {
    total.textContent = '';
    return;
  }
  const musicas = lista.querySelectorAll('.playlist-row').length;
  const momentos = secoes.length;
  total.textContent =
    `${textoContagemMusicas(musicas)} · ${momentos} ${momentos === 1 ? 'momento' : 'momentos'}`;
}

function renderPlaylistPainelCorpo() {
  const el = document.getElementById('playlist-list');
  el.innerHTML = '';
  renderSeletorTemasPlaylist();
  renderSeletorMinistranteCulto();
  /* Os dois seletores acabaram de receber texto novo (um nome de ministrante, um tema):
     o corpo que servia ao anterior pode não servir a este. */
  ajustarCorpoSeletoresDoCulto();
  if (!estadoPainel.cultoId) {
    el.innerHTML = '<div class="placeholder-msg" style="margin:16px">🗓️ Selecione primeiro o <strong>dia do culto</strong> para ver ou montar a playlist.</div>';
    return;
  }
  const pl = getPlaylist(estadoPainel.cultoId);
  podarTransmitidasDoCultoAtual(pl);
  if (!pl.length) {
    el.innerHTML = ehModoSlidesOperador()
      ? '<div class="placeholder-msg" style="margin:16px">📝 Nenhuma música neste culto.<br>Abra <strong>TELA INICIAL</strong> (topo) e, no <strong>banco de músicas à esquerda</strong>, toque em <strong>+</strong> em cada música para incluir na playlist.</div>'
      : '<div class="placeholder-msg" style="margin:16px">📝 Nenhuma música neste culto.<br>No banco de músicas <strong>à esquerda</strong>, toque em <strong>+</strong> na linha da música para adicionar ao culto.</div>';
    return;
  }

  if (playlistPossuiMarcadoresTema(pl)) {
    renderPlaylistItensComMarcadores(el, pl);
    garantirMusicaAtivaVisivelNaPlaylist();
    return;
  }

  /* Ordem linear = ordem real do array (subir/descer reflecte-se na lista).
     Secções por tema consecutivo, com seta para recolher/expandir. */
  let nLista = 0;
  let lastTemaChave = '\u0000';
  let songAppendParent = el;
  for (let idx = 0; idx < pl.length; idx++) {
    const item = pl[idx];
    if (ehMarcadorTemaPlaylist(item)) continue;
    nLista++;
    const temaNorm = normalizarTemaPlaylist(item?.tema) || '';
    const temaChave = temaNorm || '__SEM_TEMA__';
    if (temaChave !== lastTemaChave) {
      lastTemaChave = temaChave;
      const rotuloCab = temaNorm || 'Sem tema';
      songAppendParent = anexarCabecalhoTemaPlaylist(el, rotuloCab, null);
    }
    const row = document.createElement('div');
    row.dataset.plIdx = String(idx);
    const rotuloVersao = sufixoRotuloVersaoPlaylist(item);
    row.className = classeLinhaPlaylist(
      songAppendParent,
      el,
      playlistItemDestacadoNaUi(item)
    );
    row.innerHTML = htmlLinhaPlaylistModoAtual(item, nLista, rotuloVersao);
    if (playlistItemFoiTransmitido(item)) row.classList.add('playlist-row--transmitida');
    ligarBotoesESeletoresLinhaPlaylist(row, item, idx);
    songAppendParent.appendChild(row);
  }
  garantirMusicaAtivaVisivelNaPlaylist();
}

const PLAYLIST_MOVE_FLASH_MS = 640;

export function preferenciaMovimentoReduzido() {
  try {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/** Aplica uma classe de realce reiniciando a animação mesmo em cliques seguidos. */
function realcarLinhaPlaylist(el, classe) {
  if (!el) return;
  el.classList.remove(classe);
  void el.offsetWidth; /* reinicia a animação: sem isto, dois cliques rápidos não piscam */
  el.classList.add(classe);
  setTimeout(() => el.classList.remove(classe), PLAYLIST_MOVE_FLASH_MS);
}

/**
 * Move uma música para outro sítio da playlist (arrasto).
 *
 * Substitui as setas ↑↓ que viviam em cada linha. Elas resolviam bem «uma posição acima»
 * e mal tudo o resto: pôr a última música em terceiro lugar eram seis cliques, cada um
 * com um render pelo meio. O arrasto diz o destino de uma vez.
 *
 * `pos` é o lado da linha de destino por onde a música entra — «antes» é a metade de
 * cima, «depois» a de baixo (ver `posicaoDropMusicaPlaylist`).
 *
 * A etiqueta de tema acompanha o bloco onde a música cai: é o que faz a fronteira entre
 * temas ser atravessável pelo mesmo gesto, sem um comando próprio para «mudar de tema».
 *
 * @param {string} cid culto
 * @param {number} fromIdx índice na playlist da música arrastada
 * @param {number} toIdx índice da linha sobre a qual se largou
 * @param {'antes'|'depois'} pos
 * @returns {number|null} índice final da música, ou `null` se nada mudou
 */
export function reordenarMusicaNaPlaylist(cid, fromIdx, toIdx, pos) {
  const pl = getPlaylist(cid);
  if (!Array.isArray(pl)) return null;
  const item = pl[fromIdx];
  const alvo = pl[toIdx];
  if (!item || ehMarcadorTemaPlaylist(item)) return null;
  if (!alvo || ehMarcadorTemaPlaylist(alvo)) return null;

  /* O destino é medido na lista COM a música ainda lá dentro; tirá-la primeiro encurta
     tudo o que vem depois dela em um, e é essa a correção do `fromIdx < destino`. */
  let destino = pos === 'depois' ? toIdx + 1 : toIdx;
  if (fromIdx < destino) destino--;
  if (destino === fromIdx) return null;

  pl.splice(fromIdx, 1);
  pl.splice(destino, 0, item);
  item.tema = temaDoBlocoDeDestinoNaPlaylist(pl, destino);
  return destino;
}

/**
 * Tema que a música passa a ter depois de largada em `idx`.
 *
 * Com marcadores, quem manda é o cabeçalho acima dela — o mesmo critério que a lista usa
 * para a desenhar. Sem marcadores não há cabeçalho: o bloco é a etiqueta das músicas
 * seguidas, por isso a etiqueta vem do vizinho de cima e, à falta dele (largada no topo),
 * do de baixo.
 */
function temaDoBlocoDeDestinoNaPlaylist(pl, idx) {
  if (playlistPossuiMarcadoresTema(pl)) return temaDoBlocoNaPlaylist(pl, idx);
  const acima = pl[idx - 1];
  const abaixo = pl[idx + 1];
  const vizinho =
    acima && !ehMarcadorTemaPlaylist(acima)
      ? acima
      : abaixo && !ehMarcadorTemaPlaylist(abaixo)
        ? abaixo
        : null;
  return normalizarTemaPlaylist((vizinho || pl[idx])?.tema) || '';
}

/**
 * Bloco de tema sem nenhuma música.
 *
 * Um bloco vai do marcador até ao marcador seguinte (ou ao fim da lista), por isso basta
 * olhar para o elemento logo a seguir: se for outro marcador — ou se não houver nada —,
 * o tema está vazio e a lista desenha-o só com o cabeçalho.
 */
function blocoTemaPlaylistVazio(pl, markerIdx) {
  if (!Array.isArray(pl)) return false;
  if (!ehMarcadorTemaPlaylist(pl[markerIdx])) return false;
  const seguinte = pl[markerIdx + 1];
  return !seguinte || ehMarcadorTemaPlaylist(seguinte);
}

/**
 * Move uma música para um tema que ainda não tem nenhuma (arrasto largado no cartão).
 *
 * `reordenarMusicaNaPlaylist` mede o destino a partir de uma linha de música, e num bloco
 * vazio não existe nenhuma — era por isso que o gesto morria a meio. Aqui o destino vem
 * do marcador: a música entra logo a seguir ao cabeçalho, que é o único sítio que o bloco
 * tem. A etiqueta de tema segue a mesma regra do arrasto entre blocos com músicas.
 *
 * @param {string} cid culto
 * @param {number} fromIdx índice na playlist da música arrastada
 * @param {number} markerIdx índice do marcador do tema de destino
 * @returns {number|null} índice final da música, ou `null` se nada mudou
 */
function moverMusicaParaTemaVazioNaPlaylist(cid, fromIdx, markerIdx) {
  const pl = getPlaylist(cid);
  if (!Array.isArray(pl)) return null;
  const item = pl[fromIdx];
  if (!item || ehMarcadorTemaPlaylist(item)) return null;
  if (!blocoTemaPlaylistVazio(pl, markerIdx)) return null;

  /* O destino é medido na lista COM a música ainda lá dentro; tirá-la primeiro encurta
     tudo o que vem depois dela em um — a mesma correcção do arrasto entre linhas. */
  let destino = markerIdx + 1;
  if (fromIdx < destino) destino--;
  if (destino === fromIdx) return null;

  pl.splice(fromIdx, 1);
  pl.splice(destino, 0, item);
  item.tema = temaDoBlocoDeDestinoNaPlaylist(pl, destino);
  return destino;
}

/**
 * Move uma música para o FIM de um bloco de tema (arrasto largado sobre o bloco recolhido).
 *
 * Com o bloco recolhido as linhas não existem na tela, logo não há linha-alvo: o destino vem
 * do marcador — a música entra depois da última do bloco. Mesma correção de índice do arrasto
 * entre linhas (o destino é medido com a música ainda na lista) e mesma regra de etiqueta.
 *
 * @returns {number|null} índice final da música, ou `null` se nada mudou
 */
function moverMusicaParaFimDoBlocoTemaNaPlaylist(cid, fromIdx, markerIdx) {
  const pl = getPlaylist(cid);
  if (!Array.isArray(pl)) return null;
  const item = pl[fromIdx];
  if (!item || ehMarcadorTemaPlaylist(item)) return null;
  if (!ehMarcadorTemaPlaylist(pl[markerIdx])) return null;

  let fim = markerIdx + 1;
  while (fim < pl.length && !ehMarcadorTemaPlaylist(pl[fim])) fim++;
  let destino = fim;
  if (fromIdx < destino) destino--;
  if (destino === fromIdx) return null;

  pl.splice(fromIdx, 1);
  pl.splice(destino, 0, item);
  item.tema = temaDoBlocoDeDestinoNaPlaylist(pl, destino);
  return destino;
}

const MIME_MUSICA_PLAYLIST = 'application/x-lyra-pl-musica-idx';

/**
 * Índice da música em arrasto. Como no arrasto de blocos de tema, o `dataTransfer` só
 * devolve os dados no `drop` (no `dragover` há apenas os tipos), por isso o índice fica
 * aqui para o feedback visual saber qual linha está a viajar.
 */
let arrastandoMusicaPlaylistIdx = null;

function limparIndicadoresDropMusicaPlaylist() {
  document
    .querySelectorAll('.playlist-row--drop-antes, .playlist-row--drop-depois')
    .forEach((el) => {
      el.classList.remove('playlist-row--drop-antes', 'playlist-row--drop-depois');
    });
  /* O realce do bloco vazio pertence ao mesmo gesto que os traços das linhas: sai com
     eles, senão ficava aceso depois de o cursor seguir para a linha de outro tema. */
  document
    .querySelectorAll('.playlist-tema-section--drop-dentro')
    .forEach((el) => el.classList.remove('playlist-tema-section--drop-dentro'));
}

/** Metade de cima da linha = entrar antes dela; metade de baixo = entrar depois. */
function posicaoDropMusicaPlaylist(row, clientY) {
  const r = row.getBoundingClientRect();
  if (!r.height) return 'antes';
  return clientY - r.top < r.height / 2 ? 'antes' : 'depois';
}

/**
 * Liga o arrasto de uma linha da playlist.
 *
 * O `draggable` vive na alça (`.pl-grip`) e não na linha, pela mesma razão que no
 * cabeçalho de tema: a linha inteira já responde ao clique (selecciona a música) e ao
 * duplo clique (projecta), e um gesto de arrasto nascido em qualquer ponto dela colidiria
 * com os dois. Marcando só a alça, é o browser que decide quando o gesto começa.
 *
 * A linha INTEIRA continua a ser zona de largada — a alça é estreita de mais para ser
 * alvo, e o gesto tem de perdoar imprecisão.
 */
export function configurarDragReordenarLinhaPlaylist(row, idxPl) {
  const grip = row.querySelector('.pl-grip');
  if (!grip) return;
  grip.draggable = true;

  /* A alça não selecciona nem projecta a música: o gesto que ela serve é outro. */
  grip.addEventListener('mousedown', (ev) => ev.stopPropagation());
  grip.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  });

  grip.addEventListener('dragstart', (ev) => {
    arrastandoMusicaPlaylistIdx = idxPl;
    ev.dataTransfer.setData(MIME_MUSICA_PLAYLIST, String(idxPl));
    ev.dataTransfer.effectAllowed = 'move';
    /* O que viaja é a música, não a alça: o fantasma é a linha toda, agarrada no ponto
       onde o rato caiu. Antes de a esmaecer, senão é a versão apagada que fica sob o
       cursor. */
    try {
      const r = row.getBoundingClientRect();
      ev.dataTransfer.setDragImage(row, ev.clientX - r.left, ev.clientY - r.top);
    } catch (_) {
      // intencional — sem imagem própria o arraste continua a funcionar
    }
    row.classList.add('playlist-row--arrastando');
    document.getElementById('playlist-list')?.classList.add('playlist-list--reordenando-musica');
  });

  grip.addEventListener('dragend', () => {
    arrastandoMusicaPlaylistIdx = null;
    row.classList.remove('playlist-row--arrastando');
    document
      .getElementById('playlist-list')
      ?.classList.remove('playlist-list--reordenando-musica');
    limparIndicadoresDropMusicaPlaylist();
  });

  row.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    /* Sem isto a secção do tema por baixo também trataria o evento e as duas leituras do
       destino disputavam o mesmo traço. */
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    if (arrastandoMusicaPlaylistIdx === idxPl) {
      limparIndicadoresDropMusicaPlaylist();
      return;
    }
    const cls =
      posicaoDropMusicaPlaylist(row, ev.clientY) === 'depois'
        ? 'playlist-row--drop-depois'
        : 'playlist-row--drop-antes';
    /* Sem o atalho, cada `dragover` reescrevia a classe e o traço piscava. */
    if (row.classList.contains(cls)) return;
    limparIndicadoresDropMusicaPlaylist();
    row.classList.add(cls);
  });

  row.addEventListener('dragleave', (ev) => {
    /* Passar por um filho dispara `dragleave` na linha; só limpa ao sair de facto. */
    if (ev.relatedTarget instanceof Node && row.contains(ev.relatedTarget)) return;
    row.classList.remove('playlist-row--drop-antes', 'playlist-row--drop-depois');
  });

  row.addEventListener('drop', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const pos = posicaoDropMusicaPlaylist(row, ev.clientY);
    limparIndicadoresDropMusicaPlaylist();
    const fromIdx = Number(ev.dataTransfer.getData(MIME_MUSICA_PLAYLIST));
    arrastandoMusicaPlaylistIdx = null;
    if (!Number.isFinite(fromIdx) || !estadoPainel.cultoId) return;
    const destino = reordenarMusicaNaPlaylist(estadoPainel.cultoId, fromIdx, idxPl, pos);
    if (destino == null) return;
    savePlaylists();
    renderPlaylist();
    /* Sem deslize (FLIP) aqui: o utilizador acabou de ver a música ir para onde a levou.
       O realce responde à única pergunta que sobra — «foi esta que mudou de sítio?». */
    realcarLinhaPlaylist(
      document.querySelector(`#playlist-list .playlist-row[data-pl-idx="${destino}"]`),
      'playlist-row--flash-move'
    );
  });
}

/**
 * Liga a largada de músicas no cartão de um tema vazio.
 *
 * A zona de largada de uma música é sempre a linha de outra música — e um bloco vazio não
 * desenha nenhuma. O cartão do tema via o arrasto passar por cima e não o recebia, por
 * isso um tema sem músicas nunca chegava a ser destino. Aqui o alvo é o cartão inteiro,
 * que é tudo o que esse bloco tem.
 *
 * Só se liga em blocos vazios: onde já há músicas, quem manda continua a ser a linha
 * (metade de cima entra antes, metade de baixo entra depois), e um alvo por cima dela
 * roubaria essa leitura. As linhas travam a propagação no `dragover` e no `drop`, por
 * isso mesmo nesse caso nunca haveria disputa — mas o mais claro é nem existir.
 */
function configurarDropMusicaEmTemaVazioPlaylist(secao, markerPlIdx) {
  secao.classList.add('playlist-tema-section--vazia');

  secao.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    /* Sem o atalho, cada `dragover` reescrevia a classe e o realce piscava. */
    if (secao.classList.contains('playlist-tema-section--drop-dentro')) return;
    limparIndicadoresDropMusicaPlaylist();
    secao.classList.add('playlist-tema-section--drop-dentro');
  });

  secao.addEventListener('dragleave', (ev) => {
    /* Passar por um filho dispara `dragleave` na secção; só limpa ao sair de facto. */
    if (ev.relatedTarget instanceof Node && secao.contains(ev.relatedTarget)) return;
    secao.classList.remove('playlist-tema-section--drop-dentro');
  });

  secao.addEventListener('drop', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    limparIndicadoresDropMusicaPlaylist();
    const fromIdx = Number(ev.dataTransfer.getData(MIME_MUSICA_PLAYLIST));
    arrastandoMusicaPlaylistIdx = null;
    if (!Number.isFinite(fromIdx) || !estadoPainel.cultoId) return;
    const destino = moverMusicaParaTemaVazioNaPlaylist(estadoPainel.cultoId, fromIdx, markerPlIdx);
    if (destino == null) return;
    savePlaylists();
    renderPlaylist();
    /* Mesmo critério do arrasto entre linhas: sem deslize, só o realce a responder
       «foi esta que mudou de sítio?». */
    realcarLinhaPlaylist(
      document.querySelector(`#playlist-list .playlist-row[data-pl-idx="${destino}"]`),
      'playlist-row--flash-move'
    );
  });
}

/**
 * Largada de música sobre um bloco RECOLHIDO que já tem músicas.
 *
 * O bloco recolhido só mostra o cabeçalho, e a zona de largada de uma música é sempre outra
 * linha — que ali está oculta. A música cai no fim do bloco, e o bloco expande para o
 * operador ver onde ela foi parar. Só age enquanto recolhido: expandido, quem manda são as
 * linhas (este alvo nem responde), e bloco vazio já tem o seu próprio alvo.
 */
function configurarDropMusicaEmSecaoRecolhidaPlaylist(secao, markerPlIdx, rotuloTema) {
  const recolhida = () => secao.classList.contains('playlist-tema-section--colapsada');

  secao.addEventListener('dragover', (ev) => {
    if (!recolhida() || !ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    if (secao.classList.contains('playlist-tema-section--drop-dentro')) return;
    limparIndicadoresDropMusicaPlaylist();
    secao.classList.add('playlist-tema-section--drop-dentro');
  });

  secao.addEventListener('dragleave', (ev) => {
    if (ev.relatedTarget instanceof Node && secao.contains(ev.relatedTarget)) return;
    secao.classList.remove('playlist-tema-section--drop-dentro');
  });

  secao.addEventListener('drop', (ev) => {
    if (!recolhida() || !ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    limparIndicadoresDropMusicaPlaylist();
    const fromIdx = Number(ev.dataTransfer.getData(MIME_MUSICA_PLAYLIST));
    arrastandoMusicaPlaylistIdx = null;
    if (!Number.isFinite(fromIdx) || !estadoPainel.cultoId) return;
    const destino = moverMusicaParaFimDoBlocoTemaNaPlaylist(estadoPainel.cultoId, fromIdx, markerPlIdx);
    if (destino === null) return;
    definirSecaoTemaPlaylistRecolhida(String(estadoPainel.cultoId), rotuloTema, false);
    savePlaylists();
    renderPlaylist();
    realcarLinhaPlaylist(
      document.querySelector(`#playlist-list .playlist-row[data-pl-idx="${destino}"]`),
      'playlist-row--flash-move'
    );
  });
}

export function removePlItem(idx) {
  getPlaylist(estadoPainel.cultoId).splice(idx, 1);
  savePlaylists();
  renderPlaylist();
}

/** Cabeçalho de tema com seta expandir/recolher e corpo onde entram as linhas da playlist. Devolve o elemento onde anexar as músicas. */
function anexarCabecalhoTemaPlaylist(elRoot, rotulo, idxMarcador) {
  const texto = rotulo || 'Sem tema';
  const cid = String(estadoPainel.cultoId || '');

  const wrap = document.createElement('div');
  wrap.className = 'playlist-tema-section';

  const row = document.createElement('div');
  row.className = 'playlist-tema-head-row';

  const btnExpand = document.createElement('button');
  btnExpand.type = 'button';
  btnExpand.className = 'btn sm playlist-tema-toggle-expand';
  btnExpand.setAttribute('aria-label', 'Expandir ou recolher músicas deste tema');

  const lab = document.createElement('div');
  lab.className = 'playlist-tema-head-label';
  lab.textContent = texto;
  lab.dataset.dica = texto;

  /* Contagem de músicas do bloco («4 músicas»); preenchida por `atualizarContagensPlaylist`
     depois que as linhas são anexadas. */
  const contagem = document.createElement('span');
  contagem.className = 'playlist-tema-head-count';

  row.appendChild(btnExpand);
  row.appendChild(lab);
  row.appendChild(contagem);

  if (idxMarcador != null && idxMarcador !== undefined) {
    // O ✕ vive numa zona própria no canto direito: é o hover dela — e não o do card
    // inteiro — que revela o botão, e é ela que separa a área de excluir da de arrastar.
    const zonaDel = document.createElement('div');
    zonaDel.className = 'playlist-tema-head-zona-del';

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'btn sm danger playlist-tema-head-del';
    btnDel.textContent = '✕';
    btnDel.title = 'Excluir este tema e todas as músicas deste bloco na playlist';
    btnDel.onclick = (e) => {
      e.stopPropagation();
      solicitarRemoverMarcadorTemaPlaylist(idxMarcador);
    };

    zonaDel.appendChild(btnDel);
    row.appendChild(zonaDel);
  }

  const body = document.createElement('div');
  body.className = 'playlist-tema-section-body';

  wrap.appendChild(row);
  wrap.appendChild(body);
  elRoot.appendChild(wrap);

  const inicioRecolhido = secaoTemaPlaylistRecolhida(cid, texto);
  if (inicioRecolhido) wrap.classList.add('playlist-tema-section--colapsada');
  atualizarUiExpandSecaoTema(btnExpand, inicioRecolhido);

  btnExpand.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    wrap.classList.toggle('playlist-tema-section--colapsada');
    const rec = wrap.classList.contains('playlist-tema-section--colapsada');
    definirSecaoTemaPlaylistRecolhida(cid, texto, rec);
    atualizarUiExpandSecaoTema(btnExpand, rec);
  };

  if (idxMarcador != null && idxMarcador !== undefined && estadoPainel.cultoId && playlistPossuiMarcadoresTema(getPlaylist(estadoPainel.cultoId))) {
    configurarDragReordenarCabecalhoTemaPlaylist(row, wrap, idxMarcador);
    /* Sem músicas, o cartão não tem nenhuma linha que sirva de destino: passa ele
       próprio a receber o arrasto (ver a função). */
    if (blocoTemaPlaylistVazio(getPlaylist(estadoPainel.cultoId), idxMarcador)) {
      configurarDropMusicaEmTemaVazioPlaylist(wrap, idxMarcador);
    } else {
      configurarDropMusicaEmSecaoRecolhidaPlaylist(wrap, idxMarcador, texto);
    }
  }

  return body;
}

const MIME_MARCADOR_TEMA_PLAYLIST = 'application/x-lyra-pl-marcador-idx';

/**
 * Índice do marcador em arrasto. O `dataTransfer` só devolve os dados no `drop`
 * (no `dragover` só há os tipos), por isso o índice fica aqui para o feedback
 * visual poder saber qual bloco está a ser movido.
 */
let arrastandoMarcadorTemaPlaylistIdx = null;

function limparIndicadoresDropTemaPlaylist() {
  document
    .querySelectorAll('.playlist-tema-section--drop-antes, .playlist-tema-section--drop-depois')
    .forEach((el) => {
      el.classList.remove('playlist-tema-section--drop-antes', 'playlist-tema-section--drop-depois');
    });
}

/** Metade de cima da secção = cair antes dela; metade de baixo = cair depois. */
function posicaoDropTemaPlaylist(secao, clientY) {
  const r = secao.getBoundingClientRect();
  if (!r.height) return 'antes';
  return clientY - r.top < r.height / 2 ? 'antes' : 'depois';
}

/**
 * Arrastar o cabeçalho move o bloco inteiro (marcador + músicas). A secção completa
 * é zona de largada — não só o cabeçalho — para o gesto perdoar imprecisão.
 */
function configurarDragReordenarCabecalhoTemaPlaylist(row, secao, markerPlIdx) {
  row.dataset.plMarcadorIdx = String(markerPlIdx);
  secao.dataset.plMarcadorIdx = String(markerPlIdx);

  /*
   * O `draggable` vive no rótulo, e não no card: os cantos do card pertencem ao expandir/
   * recolher e ao excluir, e o gesto só deve nascer na faixa do meio.
   *
   * Deixá-lo no card e recusar o gesto quando `ev.target` não estivesse dentro do rótulo
   * não funciona: no `dragstart`, o `target` é sempre o próprio elemento que tem
   * `draggable` — nunca o filho onde o rato caiu. A condição dava sempre falso, o arraste
   * morria num `preventDefault()`, e nenhum tema se conseguia reordenar. Marcar só o
   * rótulo deixa a decisão ao browser, que é quem a sabe tomar. É também o que já se faz
   * no editor de estrofes, onde o `draggable` está na alça e não na linha.
   */
  const zonaArraste = row.querySelector('.playlist-tema-head-label');
  if (!zonaArraste) return;
  zonaArraste.draggable = true;
  zonaArraste.title = 'Arrastar para reordenar este tema na playlist';

  zonaArraste.addEventListener('dragstart', (ev) => {
    arrastandoMarcadorTemaPlaylistIdx = markerPlIdx;
    ev.dataTransfer.setData(MIME_MARCADOR_TEMA_PLAYLIST, String(markerPlIdx));
    ev.dataTransfer.effectAllowed = 'move';
    /* O que viaja é o bloco inteiro, por isso o fantasma é o card e não a faixa do
       rótulo. Antes de esmaecer o card, senão é a versão apagada que fica sob o rato. */
    try {
      const r = row.getBoundingClientRect();
      ev.dataTransfer.setDragImage(row, ev.clientX - r.left, ev.clientY - r.top);
    } catch (_) {
      // intencional — sem imagem própria o arraste continua a funcionar
    }
    row.classList.add('playlist-tema-head-row--dragging');
    secao.classList.add('playlist-tema-section--arrastando');
    document.getElementById('playlist-list')?.classList.add('playlist-list--reordenando-tema');
  });

  zonaArraste.addEventListener('dragend', () => {
    arrastandoMarcadorTemaPlaylistIdx = null;
    row.classList.remove('playlist-tema-head-row--dragging');
    secao.classList.remove('playlist-tema-section--arrastando');
    document.getElementById('playlist-list')?.classList.remove('playlist-list--reordenando-tema');
    limparIndicadoresDropTemaPlaylist();
  });

  secao.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MARCADOR_TEMA_PLAYLIST)) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    /* Sobre o próprio bloco arrastado não há destino a mostrar. */
    if (arrastandoMarcadorTemaPlaylistIdx === markerPlIdx) {
      limparIndicadoresDropTemaPlaylist();
      return;
    }
    const pos = posicaoDropTemaPlaylist(secao, ev.clientY);
    const cls =
      pos === 'depois' ? 'playlist-tema-section--drop-depois' : 'playlist-tema-section--drop-antes';
    /* Sem o atalho, cada `dragover` reescrevia a classe e o traço piscava. */
    if (secao.classList.contains(cls)) return;
    limparIndicadoresDropTemaPlaylist();
    secao.classList.add(cls);
  });

  secao.addEventListener('dragleave', (ev) => {
    /* Passar por um filho dispara `dragleave` na secção; só limpa ao sair de facto. */
    if (ev.relatedTarget instanceof Node && secao.contains(ev.relatedTarget)) return;
    secao.classList.remove('playlist-tema-section--drop-antes', 'playlist-tema-section--drop-depois');
  });

  secao.addEventListener('drop', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MARCADOR_TEMA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const pos = posicaoDropTemaPlaylist(secao, ev.clientY);
    limparIndicadoresDropTemaPlaylist();
    const fromIdx = Number(ev.dataTransfer.getData(MIME_MARCADOR_TEMA_PLAYLIST));
    const toIdx = Number(secao.dataset.plMarcadorIdx);
    arrastandoMarcadorTemaPlaylistIdx = null;
    if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx)) return;
    if (!reordenarMarcadoresTemaNaPlaylist(estadoPainel.cultoId, fromIdx, toIdx, pos)) return;
    renderSeletorTemasPlaylist();
    renderPlaylist();
  });
}

async function solicitarRemoverMarcadorTemaPlaylist(idx) {
  if (!estadoPainel.cultoId) return;
  const plAntes = getPlaylist(estadoPainel.cultoId);
  if (!ehMarcadorTemaPlaylist(plAntes[idx])) return;
  const nome = normalizarTemaPlaylist(plAntes[idx].tema) || '';
  if (!nome) {
    const ok = await appConfirm(
      'Remover este separador (sem nome de tema)? As músicas deste trecho continuam na playlist.',
      'Remover separador'
    );
    if (!ok) return;
    const pl = getPlaylist(estadoPainel.cultoId);
    if (!ehMarcadorTemaPlaylist(pl[idx])) return;
    pl.splice(idx, 1);
    savePlaylists();
    renderSeletorTemasPlaylist();
    renderPlaylist();
    return;
  }
  const ok = await appConfirm(
    `Remover o tema «${nome}» da playlist? As músicas deste bloco serão removidas da playlist, mas o tema continuará disponível no menu.`,
    'Remover tema da playlist'
  );
  if (!ok) return;
  const pl = getPlaylist(estadoPainel.cultoId);
  const filtrado = playlistPossuiMarcadoresTema(pl)
    ? filtrarPlaylistRemovendoTemaComMarcadores(pl, nome)
    : pl.filter((it) => normalizarTemaPlaylist(it.tema) !== nome);
  estadoPainel.playlists[estadoPainel.cultoId] = filtrado;
  if (nome === TEMA_PADRAO_ABERTURA) marcarAberturaRemovidaPeloUsuario(estadoPainel.cultoId);
  if (getTemaSelecionadoAtual() === nome) setTemaSelecionadoAtual('');
  savePlaylists();
  const plDepois = getPlaylist(estadoPainel.cultoId);
  const aindaNaLista =
    !!estadoPainel.musicaAtiva &&
    plDepois.some((it) => !ehMarcadorTemaPlaylist(it) && playlistItemMesmaVersaoQueAtiva(it));
  if (estadoPainel.musicaAtiva && !aindaNaLista) encerrarProjecaoDoControlador({ limparMusica: true });
  renderSeletorTemasPlaylist();
  renderPlaylist();
}
