/**
 * Mídias: playlist de vídeos — avanço automático, ordem, atraso, interface — e controles do áudio
 * selecionado no servidor. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda
 * possui entra por `registrarDependenciasPlaylistVideoApresentacao`.
 */
import { appConfirm } from './appDialog.js';
import { escapeHtml } from './textoHtmlSeguro.js';
import { fmtTempoAudio } from '../modules/midiaApresentacao.js';
import { aguardarMetadadosVideo, obterItemVideoProjetadoNoPlayer, projetarItemApresentacao, restaurarItemVideoApresentacao, videoProjetadoAtivoNoPlayer } from './videoApresentacao.js';
import { atualizarPreviewVideoAoVivo, atualizarUiPlayerAudioRemoto, emitirEstadoVideoParaServidor, iniciarRelogioUiVideo, obterElementoVideoLocal, pararAudioServidorPlayback, pausarAudioLocalApresentacao, pausarAudioServidorPlayback, prepararElementoVideoLocalControle, reproduzirElementoPreviewLocal, set_videoUiClockBase, set_videoUiClockT0, tocarAudioServidorApresentacao } from './playerLocalMidia.js';
import { criarItemApresentacaoDeArquivo, renderListaAudiosApresentacao } from './bibliotecaMidiasApresentacao.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasPlaylistVideoApresentacao(d) {
  dep = d || {};
}
const atualizarFeedbackProjecaoApresentacaoUi = (...a) => dep.atualizarFeedbackProjecaoApresentacaoUi(...a);
const atualizarRodapeAudioApresentacao = (...a) => dep.atualizarRodapeAudioApresentacao(...a);
const encerrarModoApresentacaoNoTelao = (...a) => dep.encerrarModoApresentacaoNoTelao(...a);
const salvarEstadoModoApresentacaoNoStorage = (...a) => dep.salvarEstadoModoApresentacaoNoStorage(...a);
const renderGridApresentacao = (...a) => dep.renderGridApresentacao(...a);

/* ═══════════════════════════════════════════════════════════════════════════
   Playlist de vídeos (modo Mídias)
   Camada de orquestração por cima do motor de vídeo único já existente.
   Reutiliza: projetarItemApresentacao, prepararPlayerVideoAposProjetar,
   iniciarRelogioUiVideo, pausarAudioLocalApresentacao, encerrarModoApresentacaoNoTelao.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PLAYLIST_ATRASOS_PERMITIDOS = [0, 1, 2, 3, 5];

function playlistItemAtual() {
  if (dep.getPlaylistVideoIndice() < 0) return null;
  return dep.getApresentacaoVideoPlaylist()[dep.getPlaylistVideoIndice()] || null;
}

function playlistItemAtualId() {
  const it = playlistItemAtual();
  return it ? it.id : null;
}

/** true somente quando a playlist está ativa E o vídeo projetado é o item atual dela. */
export function playlistControlaReproducaoAtual() {
  return (
    dep.getPlaylistVideoAtiva() &&
    dep.getPlaylistVideoIndice() >= 0 &&
    !!dep.getApresentacaoMidiaProjetadaId() &&
    dep.getApresentacaoMidiaProjetadaId() === playlistItemAtualId()
  );
}

export function cancelarAvancoAutoPlaylist() {
  if (_playlistAutoTimer) {
    clearTimeout(_playlistAutoTimer);
    _playlistAutoTimer = null;
  }
}

/** Inicia a reprodução do vídeo já projetado no telão, a partir de fromTime. */
function iniciarPlaybackVideoProjetado(fromTime = 0) {
  const dur = Math.max(0, Number(dep.getAudioStateRemoto().duration) || 0);
  let t = Math.max(0, Number(fromTime) || 0);
  if (dur > 0 && t >= dur - 0.05) t = 0;
  dep.getAudioStateRemoto().mediaKind = 'video';
  dep.getAudioStateRemoto().playing = true;
  dep.getAudioStateRemoto().currentTime = t;
  set_videoUiClockBase(t);
  set_videoUiClockT0(performance.now());
  emitirEstadoVideoParaServidor({ playing: true, syncTime: true, currentTime: t });
  iniciarRelogioUiVideo();
  reproduzirElementoPreviewLocal(t);
  atualizarUiPlayerAudioRemoto();
  renderGridApresentacao();
}

/** Projeta e reproduz o item i da playlist, reutilizando o motor de vídeo único. */
async function reproduzirItemPlaylist(i) {
  if (!dep.getApresentacaoVideoPlaylist().length) return;
  const idx = Math.max(0, Math.min(dep.getApresentacaoVideoPlaylist().length - 1, Math.round(Number(i) || 0)));
  const item = dep.getApresentacaoVideoPlaylist()[idx];
  if (!item) return;
  cancelarAvancoAutoPlaylist();
  dep.setPlaylistVideoIndice(idx);
  dep.setPlaylistVideoAtiva(true);
  renderListaPlaylistApresentacao();
  const it = await restaurarItemVideoApresentacao(item);
  if (!it?.src) {
    dep.setPlaylistVideoAtiva(false);
    renderListaPlaylistApresentacao();
    alert('Não foi possível carregar o vídeo da playlist. Adicione o arquivo novamente.');
    return;
  }
  dep.getApresentacaoVideoPlaylist()[idx] = { ...item, ...it };
  if (Number(item.duracao) > 0) dep.getApresentacaoVideoPlaylist()[idx].duracao = Number(item.duracao);
  dep.set_playlistProjetando(true);
  try {
    await projetarItemApresentacao(dep.getApresentacaoVideoPlaylist()[idx]);
  } finally {
    dep.set_playlistProjetando(false);
  }
  if (dep.getApresentacaoMidiaProjetadaId() !== dep.getApresentacaoVideoPlaylist()[idx].id) {
    dep.setPlaylistVideoAtiva(false);
    renderListaPlaylistApresentacao();
    return;
  }
  iniciarPlaybackVideoProjetado(0);
  renderListaPlaylistApresentacao();
  /* Reforço: o telão pode montar o <video> logo após receber a projeção;
     reenvia o play para evitar que o primeiro comando chegue antes do elemento. */
  setTimeout(() => {
    if (playlistControlaReproducaoAtual() && dep.getAudioStateRemoto().playing) {
      emitirEstadoVideoParaServidor({
        playing: true,
        syncTime: true,
        currentTime: Number(dep.getAudioStateRemoto().currentTime) || 0,
      });
    }
  }, 350);
}

/** Chamado quando um vídeo da playlist termina (a partir do relógio da UI). */
export function aoTerminarVideoPlaylist() {
  const total = dep.getApresentacaoVideoPlaylist().length;
  const proximo = dep.getPlaylistVideoIndice() + 1;
  if (proximo >= total) {
    dep.setPlaylistVideoAtiva(false);
    cancelarAvancoAutoPlaylist();
    renderListaPlaylistApresentacao();
    return;
  }
  dep.setPlaylistVideoIndice(proximo);
  renderListaPlaylistApresentacao();
  if (dep.getPlaylistVideoModo() === 'auto') {
    const atrasoMs = Math.max(0, Number(dep.getPlaylistVideoAtrasoAuto()) || 0) * 1000;
    cancelarAvancoAutoPlaylist();
    _playlistAutoTimer = setTimeout(() => {
      _playlistAutoTimer = null;
      void reproduzirItemPlaylist(dep.getPlaylistVideoIndice());
    }, atrasoMs);
  }
}

export function playlistAlternarModo(force) {
  const semArgumento = force === undefined || force === null;
  const prox = semArgumento
    ? dep.getPlaylistVideoModo() === 'auto'
      ? 'manual'
      : 'auto'
    : force === 'auto'
      ? 'auto'
      : 'manual';
  dep.setPlaylistVideoModo(prox);
  if (prox === 'manual') cancelarAvancoAutoPlaylist();
  salvarEstadoModoApresentacaoNoStorage();
  atualizarControlesPlaylistUi();
}

export function playlistDefinirAtraso(seg) {
  let v = Math.round(Number(seg) || 0);
  if (!PLAYLIST_ATRASOS_PERMITIDOS.includes(v)) v = 0;
  dep.setPlaylistVideoAtrasoAuto(v);
  salvarEstadoModoApresentacaoNoStorage();
  atualizarControlesPlaylistUi();
}

/** Lê a duração de um arquivo de vídeo sem carregar tudo (metadata via objectURL). */
function probeDuracaoArquivoVideo(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      const limpar = () => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
  // intencional — erro ignorado
}
      };
      v.onloadedmetadata = () => {
        const d = Number(v.duration);
        limpar();
        resolve(Number.isFinite(d) ? d : 0);
      };
      v.onerror = () => {
        limpar();
        resolve(0);
      };
      setTimeout(() => resolve(0), 12000);
      v.src = url;
    } catch (_) {
      resolve(0);
    }
  });
}

export function playlistAdicionarVideos(files) {
  Array.from(files || []).forEach((file) => {
    const mime = String(file.type || '');
    const nome = String(file.name || 'vídeo');
    if (!/^video\//i.test(mime) && !/\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(nome)) return;
    criarItemApresentacaoDeArquivo(file, (item) => {
      if (item.kind !== 'video') return;
      dep.getApresentacaoVideoPlaylist().push(item);
      renderListaPlaylistApresentacao();
      salvarEstadoModoApresentacaoNoStorage();
      void probeDuracaoArquivoVideo(file).then((d) => {
        if (d > 0) {
          const alvo = dep.getApresentacaoVideoPlaylist().find((x) => x && x.id === item.id);
          if (alvo) {
            alvo.duracao = d;
            renderListaPlaylistApresentacao();
            salvarEstadoModoApresentacaoNoStorage();
          }
        }
      });
    });
  });
}

function playlistRemover(id) {
  const idx = dep.getApresentacaoVideoPlaylist().findIndex((x) => x && x.id === id);
  if (idx < 0) return;
  const eraItemProjetado = dep.getAudioStateRemoto().mediaKind === 'video' && dep.getApresentacaoMidiaProjetadaId() === id;
  dep.getApresentacaoVideoPlaylist().splice(idx, 1);
  if (eraItemProjetado) {
    cancelarAvancoAutoPlaylist();
    dep.setPlaylistVideoAtiva(false);
    void encerrarModoApresentacaoNoTelao();
  }
  if (idx < dep.getPlaylistVideoIndice()) {
    dep.setPlaylistVideoIndice(dep.getPlaylistVideoIndice() - (1));
  } else if (idx === dep.getPlaylistVideoIndice()) {
    if (dep.getPlaylistVideoIndice() >= dep.getApresentacaoVideoPlaylist().length) {
      dep.setPlaylistVideoIndice(dep.getApresentacaoVideoPlaylist().length - 1);
    }
  }
  if (!dep.getApresentacaoVideoPlaylist().length) dep.setPlaylistVideoIndice(-1);
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

export async function playlistLimpar() {
  if (!dep.getApresentacaoVideoPlaylist().length) return;
  const ok = await appConfirm('Limpar toda a playlist de vídeos?', 'Modo mídias');
  if (!ok) return;
  cancelarAvancoAutoPlaylist();
  const eraVideo = dep.getPlaylistVideoAtiva() && dep.getAudioStateRemoto().mediaKind === 'video' && videoProjetadoAtivoNoPlayer();
  dep.setApresentacaoVideoPlaylist([]);
  dep.setPlaylistVideoIndice(-1);
  dep.setPlaylistVideoAtiva(false);
  if (eraVideo) void encerrarModoApresentacaoNoTelao();
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

function playlistMover(id, dir) {
  const idx = dep.getApresentacaoVideoPlaylist().findIndex((x) => x && x.id === id);
  if (idx < 0) return;
  const alvo = idx + (dir === 'up' ? -1 : 1);
  if (alvo < 0 || alvo >= dep.getApresentacaoVideoPlaylist().length) return;
  const arr = dep.getApresentacaoVideoPlaylist();
  const tmp = arr[idx];
  arr[idx] = arr[alvo];
  arr[alvo] = tmp;
  if (dep.getPlaylistVideoIndice() === idx) dep.setPlaylistVideoIndice(alvo);
  else if (dep.getPlaylistVideoIndice() === alvo) dep.setPlaylistVideoIndice(idx);
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

/** Reordena por arrastar-e-soltar: move fromId para a posição de toId. */
function playlistReordenarArrastando(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const atualId = playlistItemAtualId();
  const from = dep.getApresentacaoVideoPlaylist().findIndex((x) => x && x.id === fromId);
  if (from < 0) return;
  const [movido] = dep.getApresentacaoVideoPlaylist().splice(from, 1);
  let to = dep.getApresentacaoVideoPlaylist().findIndex((x) => x && x.id === toId);
  if (to < 0) to = dep.getApresentacaoVideoPlaylist().length;
  dep.getApresentacaoVideoPlaylist().splice(to, 0, movido);
  if (atualId) {
    const ni = dep.getApresentacaoVideoPlaylist().findIndex((x) => x && x.id === atualId);
    if (ni >= 0) dep.setPlaylistVideoIndice(ni);
  }
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

/** Atualiza botões de transporte, modo e intervalo (estado, não a lista inteira). */
function atualizarControlesPlaylistUi() {
  const auto = dep.getPlaylistVideoModo() === 'auto';
  const modoBtn = document.getElementById('ap-playlist-modo');
  if (modoBtn) {
    modoBtn.classList.toggle('ap-switch--on', auto);
    modoBtn.setAttribute('aria-checked', auto ? 'true' : 'false');
    modoBtn.title = auto
      ? 'Avanço automático ativado — clique para Manual'
      : 'Avanço manual — clique para Automático';
  }
  const atrasoSel = document.getElementById('ap-playlist-atraso');
  if (atrasoSel) {
    atrasoSel.value = String(dep.getPlaylistVideoAtrasoAuto());
    atrasoSel.disabled = !auto;
  }
  const clearBtn = document.getElementById('ap-playlist-clear');
  if (clearBtn) clearBtn.disabled = !dep.getApresentacaoVideoPlaylist().length;
  dep.set_playlistUiTocandoCache(playlistControlaReproducaoAtual() && !!dep.getAudioStateRemoto().playing);
}

/** Sincroniza só o destaque da linha ativa da playlist em transições (chamado a cada tick). */
export function atualizarPlaylistUiAoVivoSeMudou() {
  const list = document.getElementById('apresentacao-playlist-list');
  if (!list) return;
  const tocando = playlistControlaReproducaoAtual() && !!dep.getAudioStateRemoto().playing;
  if (dep.get_playlistUiTocandoCache() === tocando) return;
  dep.set_playlistUiTocandoCache(tocando);
  if (list && dep.getPlaylistVideoIndice() >= 0) {
    const row = list.querySelectorAll('.ap-playlist-item')[dep.getPlaylistVideoIndice()];
    if (row) {
      row.classList.toggle('is-playing', tocando);
      row.classList.toggle('is-current', !tocando);
      const badge = row.querySelector('.ap-playlist-badge');
      const meta = row.querySelector('.ap-menu-item-meta');
      if (badge) badge.textContent = tocando ? '▶' : String(dep.getPlaylistVideoIndice() + 1).padStart(2, '0');
      if (meta) {
        const it = dep.getApresentacaoVideoPlaylist()[dep.getPlaylistVideoIndice()];
        const durTxt = it && Number(it.duracao) > 0 ? ` · ${fmtTempoAudio(it.duracao)}` : '';
        meta.textContent = (tocando ? 'Tocando agora' : 'Pausado') + durTxt;
      }
    }
  }
}

export function renderListaPlaylistApresentacao() {
  const list = document.getElementById('apresentacao-playlist-list');
  if (!list) return;
  list.innerHTML = '';
  if (!dep.getApresentacaoVideoPlaylist().length) {
    list.innerHTML =
      '<div class="placeholder-msg" style="margin:4px 0 0;">Nenhum vídeo na playlist. Use “Adicionar”.</div>';
    atualizarControlesPlaylistUi();
    return;
  }
  const projetadoEhAtual = !!dep.getApresentacaoMidiaProjetadaId() && dep.getApresentacaoMidiaProjetadaId() === playlistItemAtualId();
  dep.getApresentacaoVideoPlaylist().forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'ap-menu-item ap-playlist-item';
    row.setAttribute('draggable', 'true');
    row.dataset.id = item.id;

    let statusTxt = 'Na fila';
    let statusCls = '';
    if (i === dep.getPlaylistVideoIndice()) {
      if (projetadoEhAtual && dep.getAudioStateRemoto().playing) {
        statusTxt = 'Tocando agora';
        statusCls = 'is-playing';
      } else if (projetadoEhAtual) {
        statusTxt = 'Pausado';
        statusCls = 'is-current';
      } else {
        statusTxt = 'Selecionado';
        statusCls = 'is-current';
      }
    } else if (i === dep.getPlaylistVideoIndice() + 1) {
      statusTxt = 'Próximo';
      statusCls = 'is-next';
    }
    if (statusCls) row.classList.add(statusCls);

    const durTxt = Number(item.duracao) > 0 ? ` · ${fmtTempoAudio(item.duracao)}` : '';
    const badge = statusCls === 'is-playing' ? '▶' : String(i + 1).padStart(2, '0');
    row.innerHTML = `
      <div class="ap-playlist-badge" aria-hidden="true">${escapeHtml(badge)}</div>
      <div class="ap-menu-item-main">
        <div class="ap-menu-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <span class="ap-menu-item-meta">${escapeHtml(statusTxt)}${durTxt}</span>
      </div>
      <div class="ap-menu-item-actions">
        <button type="button" class="ap-menu-action mv-up" title="Mover para cima" aria-label="Mover para cima">↑</button>
        <button type="button" class="ap-menu-action mv-down" title="Mover para baixo" aria-label="Mover para baixo">↓</button>
        <button type="button" class="ap-menu-action delete" title="Remover da playlist" aria-label="Remover da playlist">✕</button>
      </div>
    `;

    row.addEventListener('dblclick', () => {
      void reproduzirItemPlaylist(i);
    });
    row.querySelector('.mv-up')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playlistMover(item.id, 'up');
    });
    row.querySelector('.mv-down')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playlistMover(item.id, 'down');
    });
    row.querySelector('.delete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await appConfirm(`Remover "${item.name}" da playlist?`, 'Modo mídias');
      if (ok) playlistRemover(item.id);
    });

    row.addEventListener('dragstart', (e) => {
      playlistArrastandoId = item.id;
      row.classList.add('arrastando');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
      } catch (_) {
  // intencional — erro ignorado
}
    });
    row.addEventListener('dragend', () => {
      playlistArrastandoId = null;
      row.classList.remove('arrastando');
      list.querySelectorAll('.ap-playlist-item').forEach((r) => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('drag-over');
      try {
        e.dataTransfer.dropEffect = 'move';
      } catch (_) {
  // intencional — erro ignorado
}
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const fromId = playlistArrastandoId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      playlistReordenarArrastando(fromId, item.id);
    });

    list.appendChild(row);
  });
  atualizarControlesPlaylistUi();
  atualizarPreviewVideoAoVivo();
}

let _playerVideoToggleLock = false;

export async function tocarAudioAtualSelecionado() {
  const itemVideo = obterItemVideoProjetadoNoPlayer();
  if (itemVideo) {
    if (_playerVideoToggleLock) return;
    _playerVideoToggleLock = true;
    const querPausar = !!dep.getAudioStateRemoto().playing;
    let liberarLockNoFinally = true;
    try {
      dep.getAudioStateRemoto().mediaKind = 'video';
      dep.getAudioStateRemoto().name = itemVideo.name || 'Vídeo';

      if (querPausar) {
        pausarAudioLocalApresentacao();
        renderGridApresentacao();
        liberarLockNoFinally = false;
        setTimeout(() => {
          _playerVideoToggleLock = false;
        }, 0);
        return;
      }

      const item = await restaurarItemVideoApresentacao(itemVideo);
      if (!item?.src) {
        alert('Não foi possível carregar o vídeo. Selecione o arquivo novamente no card 5.');
        return;
      }
      const el = obterElementoVideoLocal();
      if (el && (!Number.isFinite(dep.getAudioStateRemoto().duration) || dep.getAudioStateRemoto().duration <= 0)) {
        if (!el.src || el.src !== item.src) {
          prepararElementoVideoLocalControle(el);
          el.preload = 'metadata';
          el.src = item.src;
          await aguardarMetadadosVideo(el, 6000);
        }
        if (Number.isFinite(el.duration) && el.duration > 0) {
          dep.getAudioStateRemoto().duration = Number(el.duration);
        }
      }
      const t = Number(dep.getAudioStateRemoto().currentTime) || 0;
      dep.getAudioStateRemoto().playing = true;
      set_videoUiClockBase(t);
      set_videoUiClockT0(performance.now());
      emitirEstadoVideoParaServidor({ playing: true, syncTime: true, currentTime: t });
      iniciarRelogioUiVideo();
      reproduzirElementoPreviewLocal(t);
      atualizarUiPlayerAudioRemoto();
      renderGridApresentacao();
    } finally {
      if (liberarLockNoFinally) _playerVideoToggleLock = false;
    }
    return;
  }
  if (!dep.getApresentacaoAudioAtualId()) return;
  const item = dep.getApresentacaoAudios().find((x) => x.id === dep.getApresentacaoAudioAtualId());
  if (!item) return;
  if (dep.getAudioStateRemoto().playing && dep.getAudioStateRemoto().mediaKind === 'audio' && dep.getApresentacaoAudioAtualId() === item.id) {
    pausarAudioServidor();
  } else {
    const deveRetomarMesmoAudio = dep.getAudioStateRemoto().mediaKind === 'audio' && dep.getApresentacaoAudioAtualId() === item.id;
    if (deveRetomarMesmoAudio) {
      const dur = Math.max(0, Number(dep.getAudioStateRemoto().duration) || 0);
      const atual = Math.max(0, Number(dep.getAudioStateRemoto().currentTime) || 0);
      const startTime = dur > 0 && atual >= Math.max(0, dur - 0.35) ? 0 : atual;
      const ok = await tocarAudioServidorApresentacao(item, { startTime });
      if (ok) atualizarRodapeAudioApresentacao(item);
    } else {
      await projetarItemApresentacao(item);
    }
  }
  renderListaAudiosApresentacao();
}

function pausarAudioServidor() {
  pausarAudioServidorPlayback();
}

export function pararAudioServidor() {
  const eraVideo = dep.getAudioStateRemoto().mediaKind === 'video' && videoProjetadoAtivoNoPlayer();
  pararAudioServidorPlayback();
  dep.setApresentacaoAudioAtualId(null);
  salvarEstadoModoApresentacaoNoStorage();
  renderListaAudiosApresentacao();
  if (eraVideo) {
    void encerrarModoApresentacaoNoTelao();
    renderGridApresentacao();
    return;
  }
  if (!dep.getApresentacaoMidiaProjetadaId()) {
    atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'Reprodução parada.' });
  } else {
    renderGridApresentacao();
  }
}

/** Timeout do avanço automático entre vídeos. */
let _playlistAutoTimer = null;

/** Id do item sendo arrastado (reordenar por drag-and-drop). */
let playlistArrastandoId = null;
