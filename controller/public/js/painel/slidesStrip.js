/**
 * Faixa de slides: renderização da grelha, menu de contexto, edição rápida do slide e exclusão. Movido
 * verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasSlidesStrip`.
 */
import { SVG_MENU_EDITAR } from './playlistMenus.js';
import { atualizarEstadoBtnProximaMusicaPlaylist } from './playlistTransmitidas.js';
import { atualizarNotaSlideControladorUI } from '../modules/notasSlideControlador.js';
import { criarMenuFlutuante } from '../modules/menuFlutuante.js';
import { digestEstrofesParaStripFaixa, textoSlideSnippetHtmlParaChip } from '../modules/slidesGrelha.js';
import { persistirMusicaAtivaNoServidor, renderEstrofesEditor } from './editorEstrofes.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { ajustarEncaixeGrelhaSlidesModoSlides, atualizarSomenteAtivoFaixaSlides, podeAtualizarSomenteAtivoFaixaSlides } from './slidesGrelhaPainel.js';
import { atualizarPreviewOperador, atualizarSlidesInstrucoes, definirControlosZoomFaixaSlidesInertes, definirNomeMusicaBarraSlides, definirVazioDaFaixaSlidesVisivel } from './previewProjecao.js';
import { ehModoApresentacaoOperador, ehModoBibliaOperador, ehModoSlidesOperador } from './modosUi.js';
import { emitirEstrofeAoServidor, exibirEstrofe, projetarPorDuploCliqueCentral } from './projecaoMusica.js';
import { marcacaoEstrofeEditor } from './toolbarEdicaoHome.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasSlidesStrip(d) {
  dep = d || {};
}
const aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice = (...a) => dep.aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(...a);

export function renderSlidesStrip() {
  const dock = document.getElementById('slides-dock');
  const grid = document.getElementById('slides-grid');
  const nomeEl = document.getElementById('slides-musica-nome');
  if (grid) grid.dataset.slidesCols = String(dep.getSlidesGrelha().getSlidesPorLinha());

  try {
  if (ehModoApresentacaoOperador()) {
    dock.classList.add('oculto');
    document.body.classList.remove('slides-rail-aberto');
    return;
  }

  const semMusicaCarregada = !estadoPainel.musicaAtiva || !estadoPainel.musicaAtiva.estrofes;

  /*
   * Esconder a faixa inteira só se vale para fora do modo slides.
   *
   * Antes, `!musicaAtiva` bastava para esconder — e como este ramo corre primeiro, ao
   * abrir o modo slides o painel aparecia sem barra nenhuma: duas prévias pretas a
   * flutuar no meio do ecrã, sem nada a dizer que falta escolher uma música. O ramo
   * seguinte, que mostra a barra vazia, nunca era alcançado.
   */
  if ((ehModoBibliaOperador() || semMusicaCarregada) && !ehModoSlidesOperador()) {
    dock.classList.add('oculto');
    grid.innerHTML = '';
    grid.style.zoom = '';
    delete grid.dataset.stripMusicaId;
    delete grid.dataset.stripEstrofeCount;
    delete grid.dataset.stripDigest;
    delete grid.dataset.stripProjecao;
    atualizarSlidesInstrucoes();
    document.body.classList.remove('slides-rail-aberto');
    return;
  }

  /**
   * Modo slides ocioso: barra à vista, grelha vazia.
   *
   * Dois caminhos chegam aqui — abrir o modo sem música nenhuma carregada, e música
   * vinda só do banco (modo completo), que não preenche a faixa ao alternar de modo.
   * Assim que a playlist arma uma música, o comportamento volta a ser o de sempre.
   */
  if (ehModoSlidesOperador() && (semMusicaCarregada || !estadoPainel.faixaSlidesHabilitadaPorPlaylistNoModoSlides)) {
    dock.classList.toggle('oculto', false);
    if (nomeEl) definirNomeMusicaBarraSlides(nomeEl, '');
    grid.innerHTML = '';
    grid.style.zoom = '';
    delete grid.dataset.stripMusicaId;
    delete grid.dataset.stripEstrofeCount;
    delete grid.dataset.stripDigest;
    delete grid.dataset.stripProjecao;
    document.body.classList.remove('slides-rail-aberto');
    const btnNx = document.getElementById('btn-proxima-musica-playlist');
    if (btnNx) btnNx.disabled = true;
    definirControlosZoomFaixaSlidesInertes(true);
    definirVazioDaFaixaSlidesVisivel(true);
    atualizarSlidesInstrucoes();
    queueMicrotask(() => ajustarEncaixeGrelhaSlidesModoSlides());
    return;
  }

  /* Home + letra completa: a faixa não é o destino. Não montar chips. */
  if (estadoPainel.modoLetraCompletaCentral && !ehModoSlidesOperador()) {
    dock.classList.add('oculto');
    document.body.classList.remove('slides-rail-aberto');
    atualizarSlidesInstrucoes();
    return;
  }

  definirControlosZoomFaixaSlidesInertes(false);
  definirVazioDaFaixaSlidesVisivel(false);

  if (podeAtualizarSomenteAtivoFaixaSlides()) {
    if (nomeEl) definirNomeMusicaBarraSlides(nomeEl, estadoPainel.musicaAtiva.titulo || '');
    atualizarSomenteAtivoFaixaSlides();
    dock.classList.toggle('oculto', !ehModoSlidesOperador());
    document.body.classList.toggle(
      'slides-rail-aberto',
      ehModoSlidesOperador() && !!estadoPainel.musicaAtiva && !estadoPainel.slidesRailUserRecolhido
    );
    atualizarEstadoBtnProximaMusicaPlaylist();
    atualizarSlidesInstrucoes();
    return;
  }

  if (nomeEl) definirNomeMusicaBarraSlides(nomeEl, estadoPainel.musicaAtiva.titulo || '');

  /* 1º frame com a fonte CSS; o auto-fit dos snippets corre depois, em lotes. */
  if (grid.style.visibility === 'hidden') grid.style.visibility = '';
  grid.innerHTML = '';
  const nEst = estadoPainel.musicaAtiva.estrofes.length;
  const idxSlidePreto = nEst;

  estadoPainel.musicaAtiva.estrofes.forEach((estrofe, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'slide-chip' + (estadoPainel.estrofeAtiva === i ? ' ativo' : '');
    chip.dataset.i = String(i);
    chip.setAttribute('aria-current', estadoPainel.estrofeAtiva === i ? 'true' : 'false');
    chip.innerHTML = `
      <span class="slide-num">${i + 1}</span>
      <span class="slide-snippet">${textoSlideSnippetHtmlParaChip(estrofe)}</span>
    `;
    chip.onclick = (ev) => {
      ev.preventDefault();
      /* Sem projeção: 1 clique só seleciona. Com projeção ativa: 1 clique troca o slide no ar.
         Nos dois casos a grelha rola como rolaria com as setas. */
      if (estadoPainel.projecaoMusicaEmitidaNoServidor) {
        projetarPorDuploCliqueCentral(i, { rolarComoNasSetas: true });
        return;
      }
      exibirEstrofe(i);
    };
    /* Duplo clique só para iniciar a projeção — com ela já no ar, o clique único basta. */
    if (!estadoPainel.projecaoMusicaEmitidaNoServidor) {
      chip.addEventListener('dblclick', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        projetarPorDuploCliqueCentral(i);
      });
    }
    chip.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      abrirMenuContextoSlideStrip(ev.clientX, ev.clientY, i);
    });
    grid.appendChild(chip);
  });

  const chipPreto = document.createElement('button');
  chipPreto.type = 'button';
  chipPreto.className = 'slide-chip slide-chip--preto' + (estadoPainel.estrofeAtiva === idxSlidePreto ? ' ativo' : '');
  chipPreto.dataset.i = String(idxSlidePreto);
  chipPreto.innerHTML = '';
  chipPreto.setAttribute('aria-label', 'Slide preto');
  chipPreto.setAttribute('aria-current', estadoPainel.estrofeAtiva === idxSlidePreto ? 'true' : 'false');
  chipPreto.onclick = (ev) => {
    ev.preventDefault();
    if (estadoPainel.projecaoMusicaEmitidaNoServidor) {
      projetarPorDuploCliqueCentral(idxSlidePreto, { rolarComoNasSetas: true });
      return;
    }
    exibirEstrofe(idxSlidePreto);
  };
  if (!estadoPainel.projecaoMusicaEmitidaNoServidor) {
    chipPreto.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      projetarPorDuploCliqueCentral(idxSlidePreto);
    });
  }
  grid.appendChild(chipPreto);

  /** Faixa inferior de slides existe apenas no modo slides. */
  dock.classList.toggle('oculto', !ehModoSlidesOperador());
  document.body.classList.toggle(
    'slides-rail-aberto',
    ehModoSlidesOperador() && !!estadoPainel.musicaAtiva && !estadoPainel.slidesRailUserRecolhido
  );

  const btnNx = document.getElementById('btn-proxima-musica-playlist');
  if (btnNx) {
    atualizarEstadoBtnProximaMusicaPlaylist();
  }

  atualizarSlidesInstrucoes();
  grid.dataset.stripMusicaId = String(estadoPainel.musicaAtiva.id ?? '');
  grid.dataset.stripEstrofeCount = String(nEst);
  grid.dataset.stripDigest = digestEstrofesParaStripFaixa(estadoPainel.musicaAtiva.estrofes);
  grid.dataset.stripProjecao = estadoPainel.projecaoMusicaEmitidaNoServidor ? '1' : '0';
  queueMicrotask(() => ajustarEncaixeGrelhaSlidesModoSlides());
  } finally {
    try {
      atualizarNotaSlideControladorUI();
    } catch (_) {
  // intencional — erro ignorado
}
  }
}

let slideQuickEditIndex = null;

const menuContextoSlideStrip = criarMenuFlutuante({
  id: 'slides-strip-context-menu',
  rotuloAria: 'Ações do slide',
});

function fecharMenuContextoSlideStrip() {
  menuContextoSlideStrip.fechar();
}

function abrirMenuContextoSlideStrip(clientX, clientY, slideIndex) {
  if (!(slideIndex >= 0)) return;
  menuContextoSlideStrip.abrirNoPonto(clientX, clientY, {
    itens: [
      {
        rotulo: 'Edição rápida deste slide…',
        svg: SVG_MENU_EDITAR,
        aoEscolher: () => abrirSlideQuickEditModal(slideIndex),
      },
    ],
  });
}

export function fecharSlideQuickEditModal() {
  const bd = document.getElementById('slide-quick-edit-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
    bd.classList.remove('slide-quick-edit--arrastavel');
  }
  slideQuickEditIndex = null;
  const projRow = document.getElementById('slide-quick-edit-proj-row');
  if (projRow) projRow.hidden = true;
  resetarPosicaoDialogQuickEdit();
}

/** Limpa posição fixa do diálogo (volta ao centro do flex no próximo abrir). */
function resetarPosicaoDialogQuickEdit() {
  const dialog = document.querySelector('#slide-quick-edit-backdrop .slide-quick-edit-dialog');
  if (!dialog) return;
  dialog.style.position = '';
  dialog.style.left = '';
  dialog.style.top = '';
  dialog.style.width = '';
  dialog.style.margin = '';
  dialog.style.maxWidth = '';
}

/**
 * Índice 0-based do slide no telão (ou `estrofes.length` = tela preta).
 * Independente do slide aberto no modal de edição rápida.
 */
function indiceEstrofeProjetadaNoTelao() {
  if (!estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes)) return null;
  if (!estadoPainel.projecaoMusicaEmitidaNoServidor) return null;
  const e = estadoPainel.estadoServidor;
  if (!e || e.tipo !== 'musica') return null;
  if (e.musicaId != null && estadoPainel.musicaAtiva.id != null && Number(e.musicaId) !== Number(estadoPainel.musicaAtiva.id)) {
    return null;
  }
  if (e.slidePretoFinal) return estadoPainel.musicaAtiva.estrofes.length;
  const idx = Number(e.estrofeIndex);
  return Number.isFinite(idx) ? idx : null;
}

/** Atualiza o rodapé «Slide projetado» / PRÓXIMO SLIDE do modal de edição rápida (só modo Slide). */
function atualizarUiProjecaoQuickEdit() {
  const row = document.getElementById('slide-quick-edit-proj-row');
  const status = document.getElementById('slide-quick-edit-proj-status');
  const btn = document.getElementById('slide-quick-edit-next-proj');
  if (!row || !status || !btn) return;
  const emSlide = ehModoSlidesOperador();
  row.hidden = !emSlide;
  if (!emSlide) return;
  const nEst = estadoPainel.musicaAtiva?.estrofes?.length ?? 0;
  const idx = indiceEstrofeProjetadaNoTelao();
  if (idx == null || nEst <= 0) {
    status.textContent = 'Slide projetado: —';
    btn.disabled = true;
    return;
  }
  const idxMaxPreto = nEst;
  if (idx >= idxMaxPreto) {
    status.textContent = 'Slide projetado: tela preta';
    btn.disabled = true;
    return;
  }
  status.textContent = `Slide projetado: ${idx + 1}`;
  btn.disabled = false;
}

/**
 * Avança só a projeção no telão. Não fecha o modal nem troca o slide em edição.
 */
function avancarProjecaoDoQuickEdit() {
  if (!ehModoSlidesOperador()) return;
  if (!estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes) || !estadoPainel.musicaAtiva.estrofes.length) return;
  if (!projecao.pronta() || !estadoPainel.projecaoMusicaEmitidaNoServidor) return;
  const idxMaxPreto = estadoPainel.musicaAtiva.estrofes.length;
  const base = indiceEstrofeProjetadaNoTelao();
  if (base == null || !Number.isFinite(base)) return;
  const prox = Math.min(idxMaxPreto, base + 1);
  if (prox === base) {
    atualizarUiProjecaoQuickEdit();
    return;
  }
  /* Só emite ao telão — sem `exibirEstrofe`, para não alterar seleção nem o texto do modal. */
  emitirEstrofeAoServidor(prox);
  atualizarUiProjecaoQuickEdit();
}

export function abrirSlideQuickEditModal(slideIndex) {
  if (!estadoPainel.musicaAtiva || slideIndex < 0 || slideIndex >= estadoPainel.musicaAtiva.estrofes.length) return;
  fecharMenuContextoSlideStrip();
  slideQuickEditIndex = slideIndex;
  document.getElementById('slide-quick-edit-num').textContent = String(slideIndex + 1);
  document.getElementById('slide-quick-edit-ta').value = estadoPainel.musicaAtiva.estrofes[slideIndex] ?? '';
  const bd = document.getElementById('slide-quick-edit-backdrop');
  resetarPosicaoDialogQuickEdit();
  bd.classList.toggle('slide-quick-edit--arrastavel', ehModoSlidesOperador());
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
  atualizarUiProjecaoQuickEdit();
  setTimeout(() => {
    const ta = document.getElementById('slide-quick-edit-ta');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, 50);
}

async function confirmarSlideQuickEdit() {
  const idx = slideQuickEditIndex;
  if (idx === null || !estadoPainel.musicaAtiva) return;
  const ta = document.getElementById('slide-quick-edit-ta');
  aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idx, ta.value, { emitSocket: true });
  fecharSlideQuickEditModal();
  await persistirMusicaAtivaNoServidor();
}

export function fecharSlideDeleteConfirmModal() {
  const delBd = document.getElementById('slide-delete-confirm-backdrop');
  if (delBd) {
    delBd.hidden = true;
    delBd.setAttribute('aria-hidden', 'true');
  }
}

function abrirSlideDeleteConfirmModal() {
  const idx = slideQuickEditIndex;
  if (idx === null || !estadoPainel.musicaAtiva) return;
  const nEl = document.getElementById('slide-delete-confirm-num');
  if (nEl) nEl.textContent = String(idx + 1);
  const delBd = document.getElementById('slide-delete-confirm-backdrop');
  if (!delBd) return;
  delBd.hidden = false;
  delBd.setAttribute('aria-hidden', 'false');
}

async function executarExclusaoSlideConfirmada() {
  const idx = slideQuickEditIndex;
  if (idx === null || !estadoPainel.musicaAtiva) return;
  if (estadoPainel.musicaAtiva.estrofes.length <= 1) {
    alert('É necessário pelo menos uma estrofe.');
    fecharSlideDeleteConfirmModal();
    return;
  }

  estadoPainel.musicaAtiva.estrofes.splice(idx, 1);
  if (estadoPainel.estrofeAtiva === idx) estadoPainel.estrofeAtiva = Math.max(0, idx - 1);
  else if (estadoPainel.estrofeAtiva > idx) estadoPainel.estrofeAtiva = estadoPainel.estrofeAtiva - 1;

  if (estadoPainel.estrofeAtiva >= estadoPainel.musicaAtiva.estrofes.length) {
    estadoPainel.estrofeAtiva = estadoPainel.musicaAtiva.estrofes.length - 1;
  }

  fecharSlideDeleteConfirmModal();
  fecharSlideQuickEditModal();
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();

  if (
    estadoPainel.projecaoMusicaEmitidaNoServidor &&
    projecao.pronta() &&
    estadoPainel.musicaAtiva &&
    estadoPainel.estrofeAtiva >= 0
  ) {
    emitirEstrofeAoServidor(estadoPainel.estrofeAtiva);
  }

  await persistirMusicaAtivaNoServidor();
}

function excluirSlideEdicaoRapida() {
  const idx = slideQuickEditIndex;
  if (idx === null || !estadoPainel.musicaAtiva) return;
  if (estadoPainel.musicaAtiva.estrofes.length <= 1) {
    alert('É necessário pelo menos uma estrofe.');
    return;
  }
  abrirSlideDeleteConfirmModal();
}

export function setupSlidesStripContextMenuEEdicaoRapida() {
  const bd = document.getElementById('slide-quick-edit-backdrop');
  document.getElementById('slide-quick-edit-cancel')?.addEventListener('click', () => fecharSlideQuickEditModal());
  document.getElementById('slide-quick-edit-save')?.addEventListener('click', () => confirmarSlideQuickEdit());
  document.getElementById('slide-quick-edit-delete')?.addEventListener('click', () => excluirSlideEdicaoRapida());
  document.getElementById('slide-quick-edit-next-proj')?.addEventListener('click', () => avancarProjecaoDoQuickEdit());
  /**
   * Só fecha ao clicar «no escuro»: mousedown + mouseup no próprio backdrop.
   * Sem isto, arrastar seleção da textarea para fora termina no backdrop — o navegador
   * sintetiza click no backdrop e fecha o modal inadvertidamente.
   */
  let slideQuickBackdropPointerDown = false;
  bd?.addEventListener('pointerdown', (e) => {
    slideQuickBackdropPointerDown = e.target === bd;
  });
  bd?.addEventListener('pointerup', (e) => {
    if (slideQuickBackdropPointerDown && e.target === bd) fecharSlideQuickEditModal();
    slideQuickBackdropPointerDown = false;
  });
  bd?.addEventListener('pointercancel', () => {
    slideQuickBackdropPointerDown = false;
  });
  document.getElementById('slide-delete-confirm-cancel')?.addEventListener('click', () => fecharSlideDeleteConfirmModal());
  document.getElementById('slide-delete-confirm-excluir')?.addEventListener('click', () => executarExclusaoSlideConfirmada());
  configurarArrasteDialogQuickEdit();
}

/**
 * Arrastar o modal de edição rápida pelo título — só no modo Slide.
 * Textarea, botões e restante do conteúdo não iniciam o arraste.
 */
function configurarArrasteDialogQuickEdit() {
  const heading = document.getElementById('slide-quick-edit-heading');
  const dialog = document.querySelector('#slide-quick-edit-backdrop .slide-quick-edit-dialog');
  if (!heading || !dialog) return;

  let arrasto = null;

  function clampar(left, top) {
    const pad = 8;
    const w = dialog.offsetWidth;
    const h = dialog.offsetHeight;
    const maxL = Math.max(pad, window.innerWidth - w - pad);
    const maxT = Math.max(pad, window.innerHeight - h - pad);
    return {
      left: Math.min(Math.max(pad, left), maxL),
      top: Math.min(Math.max(pad, top), maxT),
    };
  }

  heading.addEventListener('pointerdown', (e) => {
    if (!ehModoSlidesOperador()) return;
    if (e.button != null && e.button !== 0) return;
    const bd = document.getElementById('slide-quick-edit-backdrop');
    if (!bd || bd.hidden || !bd.classList.contains('slide-quick-edit--arrastavel')) return;
    e.preventDefault();
    const rect = dialog.getBoundingClientRect();
    dialog.style.position = 'fixed';
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.width = `${rect.width}px`;
    dialog.style.maxWidth = 'none';
    dialog.style.margin = '0';
    arrasto = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    };
    try {
      heading.setPointerCapture(e.pointerId);
    } catch (_) {
      // intencional — captura opcional
    }
  });

  heading.addEventListener('pointermove', (e) => {
    if (!arrasto || e.pointerId !== arrasto.pointerId) return;
    const pos = clampar(
      arrasto.origLeft + (e.clientX - arrasto.startX),
      arrasto.origTop + (e.clientY - arrasto.startY)
    );
    dialog.style.left = `${pos.left}px`;
    dialog.style.top = `${pos.top}px`;
  });

  const encerrar = (e) => {
    if (!arrasto) return;
    if (e && e.pointerId != null && e.pointerId !== arrasto.pointerId) return;
    arrasto = null;
  };
  heading.addEventListener('pointerup', encerrar);
  heading.addEventListener('pointercancel', encerrar);
}
