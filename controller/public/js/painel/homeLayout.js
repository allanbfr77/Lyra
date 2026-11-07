import { LS_HOME_PREVIEW } from '../modules/chavesArmazenamentoLocal.js';
import { limitarPreviaHome } from './homePreviewGeometry.js';

const $ = (id) => document.getElementById(id);
const icon = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${path}</svg>`;
const icons = {
  eye: icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  grid: icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  database: icon('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>'),
  globe: icon('<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>'),
};
function element(tag, className, parent) {
  const el = document.createElement(tag);
  el.className = className;
  parent?.append(el);
  return el;
}
function button(id, label, content, parent, action) {
  const b = element('button', 'btn home-control', parent);
  b.type = 'button'; b.id = id; b.title = label; b.setAttribute('aria-label', label);
  b.innerHTML = content;
  b.addEventListener('click', action);
  return b;
}

/** Composição apenas: move os nós originais, conservando IDs, listeners e valores. */
export function montarHomeLayout(actions) {
  const isHome = () => !['app-mod-slides', 'app-mod-biblia', 'app-mod-apresentacao', 'app-mod-docs']
    .some((c) => document.body.classList.contains(c));
  document.body.classList.add('home-layout-v2');
  const banco = $('banco-painel-conteudo');
  const search = element('div', 'home-search');
  banco.prepend(search);
  const tabs = element('div', 'home-search-tabs', search);
  tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Modo de busca');
  const local = button('home-busca-biblioteca', 'Buscar na biblioteca', `${icons.database}Biblioteca`, tabs, () => mode(false));
  const online = button('home-busca-online', 'Buscar em outras fontes, incluindo catálogo offline', `${icons.globe}Online`, tabs, () => mode(true));
  // Pílula única que desliza sob a opção ativa (puramente visual; o estado continua em aria-pressed).
  const pill = element('span', 'home-search-pill', tabs);
  pill.setAttribute('aria-hidden', 'true');
  function placePill() {
    const on = [local, online].find((b) => b.getAttribute('aria-pressed') === 'true');
    if (!on || !tabs.offsetWidth) return;
    pill.style.width = `${on.offsetWidth}px`;
    pill.style.transform = `translateX(${on.offsetLeft}px)`;
    pill.classList.add('pronta');
  }
  new ResizeObserver(placePill).observe(tabs);
  document.fonts?.ready.then(placePill);
  // Setas esquerda/direita alternam entre as duas opções (mesmo handler do clique).
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const alvo = e.key === 'ArrowLeft' ? local : online;
    e.preventDefault();
    if (alvo.getAttribute('aria-pressed') !== 'true') alvo.click();
    alvo.focus();
  });
  search.append($('banco-busca-local-wrap'), $('busca-letras-panel'), document.querySelector('.banco-filtros-checks'));
  $('busca').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); actions.filtrar(); }
  });
  $('busca-letras-q').setAttribute('aria-label', 'Buscar na fonte selecionada');
  // Mesma lupa do campo da Biblioteca, para os dois campos terem o mesmo aspecto.
  const lupa = document.querySelector('#banco-busca-local-wrap .bib-busca-lupa')?.cloneNode(true);
  if (lupa) document.querySelector('#busca-letras-panel .search-box-limpavel')?.prepend(lupa);
  const onlineInput = $('busca-letras-q');
  const syncPlaceholder = () => {
    // A fonte continua identificada no seletor; o agrupamento tem um rótulo estável.
    if (onlineInput.placeholder !== 'Buscar online...') onlineInput.placeholder = 'Buscar online...';
  };
  new MutationObserver(syncPlaceholder).observe(onlineInput, { attributes: true, attributeFilter: ['placeholder'] });
  syncPlaceholder();
  $('sidebar-title-internet').classList.add('sr-only');
  const empty = element('p', 'home-online-empty', $('banco-secao-internet'));
  empty.textContent = 'Digite o termo e pressione Enter para ver os resultados online.';
  const results = $('lista-internet');
  const syncEmpty = () => { empty.hidden = !!results.textContent.trim(); };
  new MutationObserver(syncEmpty).observe(results, { childList: true, subtree: true, characterData: true });
  syncEmpty();
  const footer = element('footer', 'home-library-footer banco-secao-sqlite', banco);
  footer.append($('banco-nova-manual-wrap'), $('bib-origem-legenda'));
  function mode(on) {
    banco.dataset.buscaModo = on ? 'online' : 'biblioteca';
    $('banco-secao-internet').hidden = !on;
    $('banco-secao-sqlite').hidden = on;
    $('banco-busca-local-wrap').hidden = on;
    $('busca-letras-panel').hidden = !on;
    local.setAttribute('aria-pressed', String(!on));
    online.setAttribute('aria-pressed', String(on));
    placePill();
    // Sem limpar, copiar termos, refazer requisições ou reconstruir resultados.
  }
  mode(false);

  const toolbar = document.querySelector('.centro-toolbar');
  toolbar.classList.add('home-toolbar-card');
  const heading = element('div', 'home-song-heading');
  toolbar.prepend(heading);
  const copy = element('div', 'home-song-copy', heading);
  const title = element('h1', 'home-song-title', copy);
  const subtitle = element('div', 'home-song-subtitle', copy);
  const artist = element('span', 'home-song-artist', subtitle);
  const artistInput = $('edit-artista');
  // Campos do modo edição, cada um com rótulo pequeno acima.
  const field = (label, extra) => {
    const f = element('label', `home-field ${extra}`.trim(), subtitle);
    element('span', 'home-field-label', f).textContent = label;
    return f;
  };
  field('Artista', 'home-field-artist').append(artistInput);
  const fieldTag = field('Nome da Versão', 'home-field-tag');
  const count = element('span', 'home-song-count', subtitle);
  // Nome da versão (cópia selecionada): editável no modo Editar, grava com Enter ou ao sair do campo.
  const versionInput = element('input', 'home-meta-input home-version-input', fieldTag);
  versionInput.type = 'text'; versionInput.id = 'home-nome-versao'; versionInput.autocomplete = 'off';
  versionInput.placeholder = 'Nome da versão'; versionInput.maxLength = 80;
  versionInput.setAttribute('aria-label', 'Nome da Versão');
  versionInput.title = 'Nome da versão — Enter ou sair do campo para renomear (Esc desfaz)';
  let versionName = '';
  let renaming = false;
  const commitVersion = async () => {
    if (renaming) return;
    const value = versionInput.value.trim();
    if (!value || value === versionName) { versionInput.value = versionName; return; }
    renaming = true;
    const ok = await actions.renomearVersao(value);
    renaming = false;
    if (!ok) versionInput.value = versionName;
  };
  versionInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commitVersion(); }
    else if (e.key === 'Escape') { versionInput.value = versionName; versionInput.blur(); }
  });
  versionInput.addEventListener('blur', commitVersion);
  const titleInput = $('edit-titulo');
  title.after(titleInput);
  for (const [input, label] of [[titleInput, 'Título da música'], [artistInput, 'Artista']]) {
    input.classList.add('home-meta-input');
    input.setAttribute('aria-label', label);
  }
  titleInput.classList.add('home-song-title-input');
  artistInput.classList.add('home-song-artist-input');
  // O botão «Editar tag» (renomear a versão) sai da vista; o handler continua no núcleo.
  $('btn-editar-nome-versao').classList.add('home-oculto');
  subtitle.append($('btn-editar-nome-versao'));
  // Título/artista não têm mais campo próprio: viram editáveis no próprio cabeçalho ao clicar em «Editar».
  const metadata = document.querySelector('.musica-toolbar-titulo-row');
  metadata.id = 'home-metadata-fields';
  metadata.hidden = true;
  let metaOn = false;
  const applyMeta = (on) => { metaOn = on; copy.classList.toggle('is-editing-meta', on); };
  const primary = element('div', 'home-song-actions', heading);
  primary.append($('btn-editar-letra'), $('btn-adicionar-playlist-home'));
  $('btn-adicionar-playlist-home').classList.add('primary');
  // Modo edição: Cancelar/Salvar ocupam o lugar de Editar/Adicionar e o aviso de alterações fica ao lado.
  const editBox = element('div', 'home-song-edit-actions', heading);
  editBox.hidden = true;
  const dirtyText = element('span', 'home-dirty', editBox);
  dirtyText.setAttribute('role', 'status'); dirtyText.hidden = true;
  editBox.append($('btn-cancelar-padrao'), $('btn-salvar-musica'));
  $('btn-cancelar-padrao').classList.add('home-ghost');
  $('btn-salvar-musica').classList.add('primary');
  const versionsRow = element('div', 'home-versions-row', toolbar);
  versionsRow.append($('musica-versoes-bar'));
  const tools = element('div', 'home-view-tools', versionsRow);
  // Um único grupo segmentado: Prévia | grade, letra completa, comparativo | aA.
  const views = element('div', 'home-view-segment', tools);
  views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'Visualização da música');
  const sep = () => element('span', 'home-view-sep', views).setAttribute('aria-hidden', 'true');
  const previewToggle = button('btn-toggle-playlist-preview', 'Mostrar prévia dos slides', `${icons.eye}<span>Prévia</span>`, views, () => setOpen(!open));
  previewToggle.setAttribute('aria-controls', 'playlist-preview-card');
  sep();
  const cards = button('home-ver-cartoes', 'Grade', icons.grid, views, () => actions.cartoes());
  cards.classList.add('home-icon-control');
  // Grade/slide, letra completa e comparativo; «Slide vazio» já existe como «Novo slide» na grade.
  views.append($('btn-modo-letra-completa'), $('btn-modo-comparativo'));
  sep();
  views.append($('btn-caixa-letras-edicao'));
  $('btn-modo-letra-completa').onclick = () => actions.letraCompleta();
  $('btn-nova-estrofe').classList.add('home-slide-vazio-oculto');
  tools.append($('btn-apagar-copia-versao'));
  for (const [id, label] of [['btn-modo-letra-completa', 'Lista (letra completa em um só texto)'], ['btn-modo-comparativo', 'Duas colunas (comparar versões)'], ['btn-apagar-copia-versao', 'Excluir versão']]) {
    const b = $(id);
    b.setAttribute('aria-label', label);
    b.title = label;
    b.classList.add('home-icon-control');
  }
  cards.title = 'Grade (cartões de slides)'; cards.setAttribute('aria-label', 'Grade (cartões de slides)');
  // O anel de foco é só para teclado: após clique/toque o botão não mantém contorno.
  document.addEventListener('pointerdown', () => { document.body.dataset.entrada = 'ponteiro'; }, true);
  document.addEventListener('keydown', () => { document.body.dataset.entrada = 'teclado'; }, true);
  const editActions = $('centro-toolbar-acoes');
  editActions.classList.add('home-edit-actions');
  toolbar.append(metadata, editActions);
  document.querySelector('.musica-toolbar-head-card').remove();
  // Enter/Espaço ativam os controles focados, sem virar atalhos do passador.
  for (const region of [heading, versionsRow, tabs, $('estrofes-slide-editor'), $('playlist-preview-card')]) {
    region?.addEventListener('keydown', (e) => {
      if (e.target.closest('button, summary') && ['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.stopPropagation();
    });
  }

  const preview = $('playlist-preview-card');
  preview.className = 'home-preview';
  preview.setAttribute('role', 'region'); preview.setAttribute('aria-label', 'Prévia dos slides');
  document.body.append(preview);
  const dragbar = preview.querySelector('.playlist-preview-head');
  dragbar.className = 'home-preview-heading';
  dragbar.querySelector('button')?.remove();
  const grip = button('home-preview-move', 'Mover prévia (use as setas do teclado)', '⠿', dragbar, () => {});
  dragbar.prepend(grip);
  const previewCount = element('span', 'home-preview-count', dragbar);
  button('home-preview-close', 'Fechar prévia', '×', dragbar, () => { setOpen(false); previewToggle.focus(); });
  const hint = preview.querySelector('.playlist-preview-hint');
  hint.textContent = 'Só visualização';
  const resize = button('home-preview-resize', 'Redimensionar prévia (use as setas do teclado)', '◢', preview, () => {});
  let saved = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_HOME_PREVIEW));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
  } catch (_) { /* preferência opcional */ }
  let open = saved.open === true;
  let geometry = saved;
  let positioned = typeof saved.x === 'number' && typeof saved.y === 'number';
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight, top: $('conn-bar').getBoundingClientRect().bottom + 8 });
  const persist = () => { try { localStorage.setItem(LS_HOME_PREVIEW, JSON.stringify({ ...geometry, open })); } catch (_) { /* sem armazenamento */ } };
  function place() {
    if (!positioned) {
      const r = document.querySelector('.panel-centro').getBoundingClientRect();
      geometry = { width: 380, x: r.left + Math.max(0, (r.width - 380) / 2) };
      positioned = true;
    }
    geometry = limitarPreviaHome(geometry, viewport());
    Object.assign(preview.style, { left: `${geometry.x}px`, top: `${geometry.y}px`, width: `${geometry.width}px`, height: `${geometry.height}px` });
    actions.renderPreview();
  }
  function visibility() {
    preview.hidden = !open || !isHome();
    previewToggle.setAttribute('aria-pressed', String(open));
    previewToggle.title = open ? 'Ocultar prévia dos slides' : 'Mostrar prévia dos slides';
    if (!preview.hidden) place();
  }
  function setOpen(value) { open = value; visibility(); persist(); }
  preview.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); previewToggle.focus(); }
  });
  function draggable(handle, resizing) {
    let drag = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target.closest('button') && e.target.closest('button') !== grip && !resizing)) return;
      drag = { id: e.pointerId, ...geometry, startX: e.clientX, startY: e.clientY };
      handle.setPointerCapture(e.pointerId); e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.startX; const dy = e.clientY - drag.startY;
      geometry = resizing ? { ...geometry, width: drag.width + Math.max(dx, dy * 16 / 9) }
        : { ...geometry, x: drag.x + dx, y: drag.y + dy };
      place();
    });
    const end = () => { if (drag) { drag = null; persist(); } };
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
  }
  draggable(dragbar, false); draggable(resize, true);
  function keys(e, resizing) {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!direction) return;
    e.preventDefault(); e.stopPropagation();
    const step = e.shiftKey ? 32 : 8;
    geometry = resizing ? { ...geometry, width: geometry.width + (direction[0] + direction[1]) * step }
      : { ...geometry, x: geometry.x + direction[0] * step, y: geometry.y + direction[1] * step };
    place(); persist();
  }
  grip.addEventListener('keydown', (e) => keys(e, false));
  resize.addEventListener('keydown', (e) => keys(e, true));
  window.addEventListener('resize', () => { if (open && isHome()) { place(); persist(); } });
  new MutationObserver(visibility).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  visibility();

  let songKey;
  return {
    isHome,
    metadataOpen: () => metaOn,
    closeMetadata() { applyMeta(false); },
    updateStrip(state) {
      // Só há modo de edição de fato com «Editar» (slides) ou texto alterado na letra completa/comparativo.
      const editingLetter = !!state.editingSlides || !!state.editingFull || (!!state.dirty && (!!state.full || !!state.comparison));
      // Título/artista ficam editáveis ao clicar em «Editar», na grade ou na letra completa.
      applyMeta(!!state.editingSlides || !!state.editingFull);
      versionName = state.versionName ?? '';
      copy.classList.toggle('has-version', state.versionName != null);
      if (document.activeElement !== versionInput) versionInput.value = versionName;
      heading.classList.toggle('is-editing', editingLetter);
      toolbar.classList.toggle('home-toolbar-editing', editingLetter);
      // Editar/Adicionar saem de cena enquanto edita (continuam no DOM e voltam ao sair).
      primary.hidden = editingLetter;
      editBox.hidden = !editingLetter;
      dirtyText.hidden = !state.dirty;
      dirtyText.textContent = state.dirty ? 'Alterações não salvas' : '';
    },
    update(state) {
      if (songKey !== state.key) { songKey = state.key; this.closeMetadata(); }
      title.textContent = state.title || 'Selecione uma música';
      title.title = state.title || '';
      artist.textContent = state.title ? (state.artist || 'Sem artista') : 'Biblioteca e playlist do culto';
      count.textContent = state.title ? `${state.slides} slides` : '';
      cards.disabled = !state.title;
      cards.setAttribute('aria-pressed', String(!state.full && !state.comparison));
      $('btn-editar-letra').classList.toggle('ativo', state.full);
      editActions.hidden = !state.editing;
      this.updateStrip(state);
      if (isHome()) {
        $('btn-nova-estrofe').disabled = !state.title;
        $('btn-editar-letra').disabled = !state.title;
      }
      actions.renderPreview();
    },
    updatePreview(index, total) { previewCount.textContent = index < 0 ? `Título · ${total} slides` : index >= total ? 'Tela preta' : `${index + 1} de ${total}`; },
    decorateCards() {
      const grid = $('estrofes-slide-editor');
      if (grid.classList.contains('estrofes-slide-editor--vazio')) return;
      grid.querySelectorAll('.estrofe-slide-edit').forEach((card, i) => {
        const label = card.querySelector('.home-slide-lines') || element('span', 'home-slide-lines', card.querySelector('.estrofe-slide-toolbar'));
        const text = card.querySelector('textarea')?.value ?? card.querySelector('.estrofe-slide-view-body')?.textContent ?? '';
        label.textContent = `${text.split(/\r?\n/).length} linhas`;
        const quick = card.querySelector('.btn-estrofe-quick');
        quick?.setAttribute('aria-label', `Editar slide ${i + 1}`);
      });
      const add = $('home-novo-slide') || button('home-novo-slide', 'Adicionar novo slide', '<span aria-hidden="true">＋</span><span>Novo slide</span>', grid, () => actions.novoSlide());
      add.classList.add('home-new-slide');
    },
  };
}

/** Agrupa os botões existentes: nenhuma cópia de versão/handler. */
let versoesMenuGlobaisLigados = false;
/** Um único par de listeners: fecha o menu ao clicar fora (a barra é recriada a cada render). */
function ligarFechamentoGlobalMenuVersoes() {
  if (versoesMenuGlobaisLigados) return;
  versoesMenuGlobaisLigados = true;
  document.addEventListener('pointerdown', (e) => {
    document.querySelectorAll('.home-other-versions[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  }, true);
}

export function organizarVersoesHome(bar) {
  if (!bar || bar.hidden) return;
  const chips = [...bar.querySelectorAll('.versao-chip')];
  if (!chips.length) return;
  ligarFechamentoGlobalMenuVersoes();
  const ramo = bar.querySelector('.versao-bar-label svg');
  const nova = bar.querySelector('.versao-nova-chip');
  const dropdown = element('details', 'home-other-versions');
  const summary = element('summary', 'btn', dropdown);
  summary.setAttribute('aria-label', 'Outras versões');
  summary.setAttribute('aria-haspopup', 'menu');
  summary.setAttribute('aria-expanded', 'false');
  const list = element('div', 'home-versions-menu', dropdown);
  list.setAttribute('role', 'menu'); list.setAttribute('aria-label', 'Outras versões');
  // Nomes como foram salvos (sem forçar caixa-alta) em todas as pílulas de versão da Home.
  chips.forEach((chip) => {
    const raw = chip.dataset.rotuloOriginal;
    const t = chip.querySelector('.versao-chip-txt');
    if (raw && t) t.textContent = raw;
  });
  const others = chips.slice(1);
  others.forEach((chip) => {
    list.append(chip);
    // Item de menu: só nome (como foi salvo) + ícone de versão; a ação continua sendo o clique original do chip.
    const name = chip.dataset.rotuloOriginal || chip.querySelector('.versao-chip-txt')?.textContent || '';
    const txt = chip.querySelector('.versao-chip-txt');
    if (txt) txt.textContent = name;
    chip.title = name;
    chip.setAttribute('role', 'menuitem');
    chip.removeAttribute('aria-pressed');
    const icon = chip.querySelector('svg');
    if (icon && ramo) icon.replaceWith(ramo.cloneNode(true));
    chip.addEventListener('click', () => {
      dropdown.open = false;
      bar.dataset.refocar = '1'; // a barra é recriada após a troca: devolve o foco ao botão do menu
      summary.focus();
    });
  });
  if (!others.length) {
    const vazio = element('div', 'home-versions-empty', list);
    vazio.setAttribute('role', 'presentation'); vazio.textContent = 'Nenhuma outra versão';
  }
  bar.insertBefore(dropdown, nova);
  const itens = () => [...list.querySelectorAll('[role="menuitem"]')];
  const focar = (i) => { const l = itens(); if (l.length) l[(i + l.length) % l.length].focus(); };
  dropdown.addEventListener('toggle', () => summary.setAttribute('aria-expanded', String(dropdown.open)));
  dropdown.addEventListener('keydown', (e) => {
    const l = itens(); const atual = l.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopPropagation(); dropdown.open = false; summary.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    if (!dropdown.open) dropdown.open = true;
    if (e.key === 'Home') focar(0);
    else if (e.key === 'End') focar(l.length - 1);
    else if (e.key === 'ArrowDown') focar(atual < 0 ? 0 : atual + 1);
    else focar(atual < 0 ? l.length - 1 : atual - 1);
  });
  atualizarVersoesHome(bar);
  if (bar.dataset.refocar) { delete bar.dataset.refocar; summary.focus({ preventScroll: true }); }
}

export function atualizarVersoesHome(bar) {
  const details = bar?.querySelector('.home-other-versions');
  if (!details) return;
  const chips = [...details.querySelectorAll('.versao-chip')];
  const active = chips.find((c) => c.classList.contains('versao-musica-ativa'));
  const summary = details.querySelector('summary');
  const ativoTxt = active?.textContent.trim();
  summary.textContent = `${ativoTxt || 'Outras versões'} (${chips.length})`;
  summary.classList.toggle('versao-musica-ativa', !!active);
  bar.querySelectorAll('.versao-chip:not([role="menuitem"])').forEach((c) => c.setAttribute('aria-pressed', String(c.classList.contains('versao-musica-ativa'))));
  details.querySelectorAll('[role="menuitem"]').forEach((c) => {
    if (c.classList.contains('versao-musica-ativa')) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
  });
}
