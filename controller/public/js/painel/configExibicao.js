/**
 * Exibição (Ajustes): modal de configuração do telão, ministrante, relógio e avisos — abas, busca,
 * destinos, formulários, leitura/gravação no servidor e no armazenamento, aparência da prévia —,
 * além do tema escuro e da configuração dos slides.
 *
 * Extraído de controllerAppCore.js sem mudar o comportamento. O estado do modal (aba atual, config
 * corrente, sujo/salvo, temporizador) é privado deste módulo; o núcleo lê a config corrente por
 * `lerCurrentCfgCtrl()`. As instruções que antes corriam no carregamento do núcleo (config de slides
 * inicial, atalhos em `window`, tema escuro) agora estão em `iniciarConfigExibicao()`, chamada pelo
 * núcleo no mesmo ponto da ordem de inicialização. Dependências do núcleo (e as funções da Bíblia que
 * o formulário usa) entram por `registrarDependenciasConfigExibicao`.
 */
import { LS_DARK_CTRL, LS_SLIDE_CFG } from '../modules/chavesArmazenamentoLocal.js';
import { appConfirm } from './appDialog.js';
import { exporCallbacksParaAtributosHtml } from '../modules/ponteHtmlWindow.js';
import { inicializarSlidersComEdicao, sincronizarSliderComEdicao } from '../modules/sliderComEdicao.js';
import { normalizarCfgAvisoCard6 } from '../modules/midiaApresentacao.js';
import { normalizarCorComentarioMinistrante } from '../modules/comentariosSlide.js';
import { popularFormCfgContagem } from './contagemRegressiva.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado) e da Bíblia. O corpo abaixo é o original; estas ligações
 * são lidas a cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado depois.
 */
export function registrarDependenciasConfigExibicao(d) {
  dep = d || {};
}
const agendarAtualizacaoAvisoCard6AoVivo = (...a) => dep.agendarAtualizacaoAvisoCard6AoVivo(...a);
const algumCampoAvisoCard6EmEdicao = (...a) => dep.algumCampoAvisoCard6EmEdicao(...a);
const aplicarEstiloPreviewTituloAbertura = (...a) => dep.aplicarEstiloPreviewTituloAbertura(...a);
const atualizarUrlsObs = (...a) => dep.atualizarUrlsObs(...a);
const carregarEstadoModoApresentacaoDoServidor = (...a) => dep.carregarEstadoModoApresentacaoDoServidor(...a);
const controladorSomenteLeitura = (...a) => dep.controladorSomenteLeitura(...a);
const ehModoApresentacaoOperador = (...a) => dep.ehModoApresentacaoOperador(...a);
const ehModoBibliaOperador = (...a) => dep.ehModoBibliaOperador(...a);
const hostProjecao = (...a) => dep.hostProjecao(...a);
const renderGridApresentacao = (...a) => dep.renderGridApresentacao(...a);
const renderListaCfgMinistrantes = (...a) => dep.renderListaCfgMinistrantes(...a);
const salvarEstadoModoApresentacaoNoStorage = (...a) => dep.salvarEstadoModoApresentacaoNoStorage(...a);
const sincronizarPreviewOciosoMinistranteSlides = (...a) => dep.sincronizarPreviewOciosoMinistranteSlides(...a);
const sincronizarTicksSliderVh = (...a) => dep.sincronizarTicksSliderVh(...a);
const bibliaPayloadCfgExibicao = (...a) => dep.bibliaPayloadCfgExibicao(...a);
const bibliaPopularFormularioCfg = (...a) => dep.bibliaPopularFormularioCfg(...a);
const carregarBibliaCfgDoStorage = (...a) => dep.carregarBibliaCfgDoStorage(...a);
const lerBibliaCfgDoFormularioMinistrante = (...a) => dep.lerBibliaCfgDoFormularioMinistrante(...a);
const lerBibliaCfgDoFormularioPublico = (...a) => dep.lerBibliaCfgDoFormularioPublico(...a);
const salvarBibliaCfgNoStorage = (...a) => dep.salvarBibliaCfgNoStorage(...a);

function setPosAvisoCard6CtrlBtn(val) {
  const group = document.getElementById('cfg-card6-posy-ctrl-group');
  if (!group) return;
  group.querySelectorAll('.cfg-btn-pos').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.val === val);
  });
}

function sincronizarEstadoCorFundoAvisoCard6() {
  const cfg = normalizarCfgAvisoCard6(dep.getApresentacaoCard6AvisoCfg());
  const bgColor = document.getElementById('cfg-card6-bg-color-ctrl');
  if (!bgColor) return;
  bgColor.disabled = cfg.transparentBackground;
  bgColor.title = cfg.transparentBackground ? 'Desative o fundo transparente para escolher uma cor.' : '';
}

export function popularFormCfgAvisoCard6() {
  const cfg = normalizarCfgAvisoCard6(dep.getApresentacaoCard6AvisoCfg());
  setInputVal('cfg-card6-fontsize-ctrl', cfg.fontSize);
  setSpanText('cfg-card6-fontsize-val-ctrl', String(cfg.fontSize));
  setInputVal('cfg-card6-text-color-ctrl', cfg.textColor);
  setInputVal('cfg-card6-bg-color-ctrl', cfg.backgroundColor);
  setChkVal('cfg-card6-bg-transparent-ctrl', cfg.transparentBackground);
  setChkVal('cfg-card6-wrap-ctrl', cfg.wrapLongLines);
  setChkVal('cfg-card6-italic-ctrl', cfg.italic);
  setPosAvisoCard6CtrlBtn(cfg.verticalPosition);
  sincronizarEstadoCorFundoAvisoCard6();
}

function persistirCfgAvisoCard6(opts = {}) {
  salvarEstadoModoApresentacaoNoStorage();
  if (ehModoApresentacaoOperador()) renderGridApresentacao();
  if (opts.atualizarAoVivo !== false) agendarAtualizacaoAvisoCard6AoVivo();
}

function lerCfgAvisoCard6DoFormulario() {
  return normalizarCfgAvisoCard6({
    fontSize: lerNumeroInput('cfg-card6-fontsize-ctrl', dep.getApresentacaoCard6AvisoCfg()?.fontSize ?? 5.5),
    textColor: document.getElementById('cfg-card6-text-color-ctrl')?.value,
    backgroundColor: document.getElementById('cfg-card6-bg-color-ctrl')?.value,
    transparentBackground: getChkVal('cfg-card6-bg-transparent-ctrl'),
    wrapLongLines: getChkVal('cfg-card6-wrap-ctrl'),
    italic: getChkVal('cfg-card6-italic-ctrl'),
    verticalPosition: (document.querySelector('#cfg-card6-posy-ctrl-group .cfg-btn-pos.ativo')?.dataset.val || 'center'),
  });
}

export function onAvisoCard6CfgChange() {
  dep.setApresentacaoCard6AvisoCfg(lerCfgAvisoCard6DoFormulario());
  sincronizarEstadoCorFundoAvisoCard6();
  persistirCfgAvisoCard6();
}

export function setPosAvisoCard6Ctrl(val) {
  dep.setApresentacaoCard6AvisoCfg(
    normalizarCfgAvisoCard6({
      ...dep.getApresentacaoCard6AvisoCfg(),
      verticalPosition: val,
    })
  );
  popularFormCfgAvisoCard6();
  persistirCfgAvisoCard6();
}

/* O menu lateral é fixo: seis entradas, nenhuma escondida por modo.
   Telão/Ministrante deixaram de ser abas e passaram a ser destinos dentro
   de «Slides» e «Bíblia» — ver `mudarDestinoCfg`. */
export const CFG_ABAS_CTRL = ['geral', 'conexao', 'slides', 'biblia', 'relogio', 'avisos', 'contagem', 'ministrantes'];

export const CFG_DESTINOS_CTRL = {
  slides: ['telao', 'ministrante'],
  biblia: ['biblia-telao', 'biblia-ministrante', 'biblia-leitura'],
};

/* Os nomes antigos de aba continuam válidos como atalho para aba + destino,
   para que chamadas como `abrirCfgModal('biblia-telao')` não quebrem. */
export const CFG_ALIAS_ABA_CTRL = {
  telao: ['slides', 'telao'],
  ministrante: ['slides', 'ministrante'],
  'biblia-telao': ['biblia', 'biblia-telao'],
  'biblia-ministrante': ['biblia', 'biblia-ministrante'],
  'biblia-leitura': ['biblia', 'biblia-leitura'],
};

const cfgDestinoAtualCtrl = { slides: 'telao', biblia: 'biblia-telao' };

export function resolverAbaCfgCtrl(aba) {
  if (CFG_ALIAS_ABA_CTRL[aba]) return CFG_ALIAS_ABA_CTRL[aba].slice();
  return [aba, null];
}

function abaCfgPadraoDoModo() {
  return ehModoBibliaOperador() ? 'biblia' : 'slides';
}


/* ── Busca de ajustes ──────────────────────────────────────────────
   Filtra as linhas onde elas já estão (nada é reconstruído, por isso
   nenhum id fica duplicado) e mostra todos os painéis ao mesmo tempo,
   cada um rotulado com o seu caminho. */
export function normalizarTermoCfg(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function realcarTermoCfg(el, termos) {
  const original = el.dataset.textoOriginal ?? el.textContent;
  el.dataset.textoOriginal = original;
  const plano = normalizarTermoCfg(original);
  const faixas = [];
  termos.forEach((t) => {
    let i = plano.indexOf(t);
    while (i !== -1) {
      faixas.push([i, i + t.length]);
      i = plano.indexOf(t, i + t.length);
    }
  });
  if (!faixas.length) {
    el.textContent = original;
    return;
  }
  faixas.sort((a, b) => a[0] - b[0]);
  el.textContent = '';
  let fim = 0;
  faixas.forEach(([a, b]) => {
    if (a < fim) return;
    if (a > fim) el.appendChild(document.createTextNode(original.slice(fim, a)));
    const marca = document.createElement('mark');
    marca.textContent = original.slice(a, b);
    el.appendChild(marca);
    fim = b;
  });
  if (fim < original.length) el.appendChild(document.createTextNode(original.slice(fim)));
}

function limparRealcesCfg() {
  document.querySelectorAll('#cfg-modal-body-ctrl .cfg-row-label[data-texto-original]').forEach((el) => {
    el.textContent = el.dataset.textoOriginal;
    delete el.dataset.textoOriginal;
  });
}

export function onCfgBuscaInput() {
  const input = document.getElementById('cfg-busca-ctrl');
  const corpo = document.getElementById('cfg-modal-body-ctrl');
  if (!input || !corpo) return;
  const bruto = input.value.trim();
  const limpar = document.getElementById('cfg-busca-limpar-ctrl');
  if (limpar) limpar.hidden = !bruto;
  if (!bruto) {
    limparCfgBusca({ manterAba: true });
    return;
  }

  const termos = normalizarTermoCfg(bruto).split(/\s+/).filter(Boolean);
  corpo.classList.add('buscando');
  limparRealcesCfg();

  let total = 0;
  const porAba = {};
  document.querySelectorAll('#cfg-modal-body-ctrl .cfg-row[data-busca]').forEach((row) => {
    const rotulo = row.querySelector('.cfg-row-label');
    const alvo = normalizarTermoCfg(`${row.dataset.busca} ${rotulo ? rotulo.textContent : ''}`);
    const bate = termos.every((t) => alvo.includes(t));
    row.hidden = !bate;
    if (!bate) return;
    total += 1;
    if (rotulo) realcarTermoCfg(rotulo, termos);
    const painel = row.closest('.cfg-panel-body');
    if (painel) {
      const id = painel.id.replace('cfg-panel-ctrl-', '');
      porAba[id] = (porAba[id] || 0) + 1;
    }
  });

  /* Cartões e blocos de destino sem nenhuma linha visível saem do caminho. */
  document.querySelectorAll('#cfg-modal-body-ctrl .cfg-card').forEach((card) => {
    card.hidden = !card.querySelector('.cfg-row[data-busca]:not([hidden])');
  });
  document.querySelectorAll('#cfg-modal-body-ctrl .cfg-destino-painel').forEach((p) => {
    p.hidden = !p.querySelector('.cfg-card:not([hidden])');
  });
  document.querySelectorAll('#cfg-modal-body-ctrl .cfg-panel-body').forEach((p) => {
    p.hidden = !p.querySelector('.cfg-card:not([hidden])');
  });

  CFG_ABAS_CTRL.forEach((a) => {
    const tab = document.getElementById(`cfg-tab-ctrl-${a}`);
    if (!tab) return;
    const n = porAba[a] || 0;
    const conta = tab.querySelector('.cfg-tab-conta');
    if (conta) {
      conta.textContent = String(n);
      conta.hidden = !n;
    }
    tab.classList.toggle('sem-resultado', !n);
    tab.classList.remove('ativo');
  });

  const cabecalho = document.getElementById('cfg-busca-cabecalho-ctrl');
  const titulo = document.getElementById('cfg-busca-titulo-ctrl');
  const vazio = document.getElementById('cfg-busca-vazio-ctrl');
  if (titulo) {
    titulo.textContent = `${total} resultado${total === 1 ? '' : 's'} para “${bruto}”`;
  }
  if (cabecalho) cabecalho.hidden = false;
  if (vazio) vazio.hidden = total > 0;
  corpo.scrollTop = 0;
}

export function limparCfgBusca(opts) {
  const corpo = document.getElementById('cfg-modal-body-ctrl');
  const input = document.getElementById('cfg-busca-ctrl');
  if (!corpo) return;
  const estavaBuscando = corpo.classList.contains('buscando');
  if (input && input.value) input.value = '';
  const limpar = document.getElementById('cfg-busca-limpar-ctrl');
  if (limpar) limpar.hidden = true;
  const cabecalho = document.getElementById('cfg-busca-cabecalho-ctrl');
  if (cabecalho) cabecalho.hidden = true;
  const vazio = document.getElementById('cfg-busca-vazio-ctrl');
  if (vazio) vazio.hidden = true;
  if (!estavaBuscando) return;
  corpo.classList.remove('buscando');
  limparRealcesCfg();
  document.querySelectorAll('#cfg-modal-body-ctrl .cfg-row[data-busca]').forEach((r) => { r.hidden = false; });
  document.querySelectorAll('#cfg-modal-body-ctrl .cfg-card').forEach((c) => { c.hidden = false; });
  document.querySelectorAll('#cfg-modal-body-ctrl .cfg-destino-painel').forEach((p) => { p.hidden = false; });
  document.querySelectorAll('#cfg-modal-body-ctrl .cfg-panel-body').forEach((p) => { p.hidden = false; });
  CFG_ABAS_CTRL.forEach((a) => {
    const tab = document.getElementById(`cfg-tab-ctrl-${a}`);
    if (!tab) return;
    const conta = tab.querySelector('.cfg-tab-conta');
    if (conta) conta.hidden = true;
    tab.classList.remove('sem-resultado');
    tab.classList.toggle('ativo', a === cfgAbaAtualCtrl);
  });
  if (!opts || !opts.manterAba) mudarAbaCfg(cfgAbaAtualCtrl);
  if (input) input.focus();
}

export function mudarDestinoCfg(aba, destino) {
  const lista = CFG_DESTINOS_CTRL[aba];
  if (!lista) return;
  const alvo = lista.includes(destino) ? destino : lista[0];
  cfgDestinoAtualCtrl[aba] = alvo;
  const painel = document.getElementById(`cfg-panel-ctrl-${aba}`);
  if (painel) {
    painel.querySelectorAll('.cfg-destino').forEach((b) => {
      const on = b.dataset.destino === alvo;
      b.classList.toggle('ativo', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  lista.forEach((d) => {
    const p = document.getElementById(`cfg-destino-${d}`);
    if (p) p.classList.toggle('ativo', d === alvo);
  });
}

export function setCfgSwitchState(el, ligado) {
  if (!el) return;
  const on = !!ligado;
  el.classList.toggle('cfg-switch--on', on);
  el.setAttribute('aria-checked', on ? 'true' : 'false');
}

export function sincronizarFormCfgGeral() {
  const temaEl = document.getElementById('cfg-geral-tema-ctrl');
  setCfgSwitchState(temaEl, document.documentElement.classList.contains('dark'));
  const vozDock = document.getElementById('btn-voz-slides-toggle');
  const vozEl = document.getElementById('cfg-geral-voz-ctrl');
  if (vozEl && vozDock) {
    const ativo =
      vozDock.getAttribute('aria-pressed') === 'true' ||
      vozDock.classList.contains('voz-mic--on') ||
      vozDock.classList.contains('voz-mic--ouvindo');
    setCfgSwitchState(vozEl, ativo);
  }
}

export function onCfgGeralTemaChange(ligado) {
  const isDark = document.documentElement.classList.contains('dark');
  if (ligado !== isDark) toggleDarkCtrl();
  sincronizarFormCfgGeral();
}

export function onCfgGeralVozChange(ligado) {
  const vozDock = document.getElementById('btn-voz-slides-toggle');
  const ativo =
    !!vozDock &&
    (vozDock.getAttribute('aria-pressed') === 'true' ||
      vozDock.classList.contains('voz-mic--on') ||
      vozDock.classList.contains('voz-mic--ouvindo'));
  if (ligado !== ativo && typeof window.alternarVozSlides === 'function') {
    window.alternarVozSlides();
  }
  // Estado visual do dock pode atualizar de forma assíncrona
  setTimeout(sincronizarFormCfgGeral, 0);
}

export function salvarSlideCfgNoStorage() {
  try {
    const cfg =
      typeof window.getCurrentCfgCtrl === 'function' ? window.getCurrentCfgCtrl() : currentCfgCtrl;
    if (cfg && typeof cfg === 'object') {
      localStorage.setItem(LS_SLIDE_CFG, JSON.stringify(cfg));
    }
  } catch (_) {
  // intencional — erro ignorado
}
}

function carregarSlideCfgDoStorage() {
  try {
    const raw = localStorage.getItem(LS_SLIDE_CFG);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

/** Mescla config Slides salva em `lyra_slide_cfg_v1` sobre o estado em memória (M2 público + M3 ministrante). */
export function mesclarSlideCfgNoEstado(salva) {
  if (!salva || typeof salva !== 'object') return;
  const s = sanitizarCfgSlidesLocal(salva);
  const base = currentCfgCtrl && typeof currentCfgCtrl === 'object' ? currentCfgCtrl : {};
  for (const k of ['posX', 'posY', 'fontSize', 'lineSpacing', 'autoFitLongLines']) {
    if (s[k] !== undefined) base[k] = s[k];
  }
  if (s.publico && typeof s.publico === 'object') {
    base.publico = { ...(base.publico || {}), ...s.publico };
  }
  if (s.ministrante && typeof s.ministrante === 'object') {
    base.ministrante = { ...(base.ministrante || {}), ...s.ministrante };
  }
  if (s.clock && typeof s.clock === 'object') {
    base.clock = { ...(base.clock || {}), ...s.clock };
  }
  currentCfgCtrl = base;
  if (typeof window.setCurrentCfgCtrl === 'function') window.setCurrentCfgCtrl(currentCfgCtrl);
  aplicarCorComentarioMinistranteNoPainel(
    currentCfgCtrl.ministrante && currentCfgCtrl.ministrante.commentColor
  );
}

/** Ao abrir o app: repõe `currentCfgCtrl` a partir do localStorage (antes de conectar ao servidor). */
function carregarSlideCfgInicialDoStorage() {
  const salva = carregarSlideCfgDoStorage();
  if (!salva) return;
  mesclarSlideCfgNoEstado(salva);
  try {
    cfgSnapshotSalvoCtrl = JSON.stringify(currentCfgCtrl || {});
    cfgDirtyCtrl = false;
  } catch (_) {
  // intencional — erro ignorado
}
}

export function sanitizarCfgSlidesLocal(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg;
  let c;
  try {
    c = JSON.parse(JSON.stringify(cfg));
  } catch (_) {
    return cfg;
  }
  for (const chave of ['publico', 'ministrante']) {
    const layer = c[chave];
    if (!layer || typeof layer !== 'object') continue;
    if (layer.bgType !== 'image') {
      layer.bgImage = '';
      if (!layer.bgType) layer.bgType = 'solid';
    }
    delete layer.refMostrar;
    delete layer.refFontSize;
    delete layer.refColor;
  }
  if (c.clock && typeof c.clock === 'object') {
    delete c.clock.showChurchName;
    delete c.clock.churchName;
    delete c.clock.churchFontSize;
  }
  return c;
}

/**
 * Vídeo do card 5 (único card de vídeo do modo Mídias) ainda projetado.
 * Navegar para Bíblia / Slides / Ajustes não pode mandar `preview_display_config`:
 * esse comando re-dispara `exibir` no telão, recria o `<video>` e interrompe a reprodução;
 * em cascata a rota de Mídias acabava a cair em «Não exibir».
 */
function hayVideoDoCard5EmProjecao() {
  const id = dep.getApresentacaoMidiaProjetadaId();
  if (!id) return false;
  const card = dep.getApresentacaoCards()?.[dep.getApresentacaoIdxCard5()];
  return !!(card && card.id === id && String(card.kind || '').toLowerCase() === 'video');
}

export function enviarPreviewDisplayConfig(cfg, opts = {}) {
  // Pull-by-role: um controlador somente-leitura NUNCA empurra config (nem no boot, nem ao
  // mexer no painel). O servidor já rejeitaria via guarda; aqui evitamos até o ruído do envio.
  if (controladorSomenteLeitura()) return;
  /* Só este caso: vídeo do card de vídeo no ar. Outras mídias e o resto dos modos
     continuam a empurrar o tema normalmente. */
  if (hayVideoDoCard5EmProjecao()) return;
  const modo = opts.modoConfig || 'slides';
  let corpo = cfg && typeof cfg === 'object' ? cfg : {};
  if (modo === 'biblia') {
    corpo = bibliaPayloadCfgExibicao();
  } else {
    corpo = sanitizarCfgSlidesLocal(corpo);
  }
  const payload = {
    ...corpo,
    modoConfig: modo,
    forcarModo: opts.forcarModo || modo,
  };
  if (dep.getProjecao().enviar('preview_display_config', payload)) return;
  const ip = hostProjecao();
  if (!ip) return;
  fetch(`http://${ip}:5510/api/display-config/preview`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export function slidesAplicarCfgArmazenada() {
  let cfg = carregarSlideCfgDoStorage();
  if (!cfg) {
    try {
      if (cfgSnapshotSalvoCtrl) cfg = JSON.parse(cfgSnapshotSalvoCtrl);
    } catch (_) {
  // intencional — erro ignorado
}
  }
  if (!cfg || typeof cfg !== 'object') {
    cfg = sanitizarCfgSlidesLocal(
      typeof window.getCurrentCfgCtrl === 'function' ? window.getCurrentCfgCtrl() : currentCfgCtrl
    );
  } else {
    mesclarSlideCfgNoEstado(cfg);
    cfg = sanitizarCfgSlidesLocal(
      typeof window.getCurrentCfgCtrl === 'function' ? window.getCurrentCfgCtrl() : currentCfgCtrl
    );
  }
  if (typeof window.setCurrentCfgCtrl === 'function') window.setCurrentCfgCtrl(cfg);
  try {
    popularFormCfg(cfg);
  } catch (_) {
  // intencional — erro ignorado
}
  enviarPreviewDisplayConfig(cfg, {
    modoConfig: 'slides',
    forcarModo: 'slides',
  });
}

let currentCfgCtrl = {
  fontSize: 5, lineSpacing: 1.7, autoFitLongLines: false, posX: 'center', posY: 'center',
  publico: {
    bgType: 'solid',
    bgColor: '#f5f2ea',
    bgGradient: 'linear-gradient(135deg, #f5f2ea 0%, #e9e2d4 100%)',
    bgImage: '',
    textColor: '#1c1816',
    fontSize: 5.5,
    lineSpacing: 1.35,
    fillScreen: false,
    wrapLongLines: true,
    autoFitLongLines: false,
  },
  ministrante: {
    bgType: 'solid',
    bgColor: '#000000',
    bgGradient: 'linear-gradient(135deg, #000000 0%, #161616 100%)',
    bgImage: '',
    textColorAtual: '#ffffff',
    textColorProximo: '#f3c15a',
    commentColor: '#00c8ff',
    aberturaTituloColor: '#f3c15a',
    aberturaTituloFontSize: 7,
    fontFamily: 'CMG Sans, sans-serif',
    negrito: true,
    italico: false,
    maiusculo: true,
    fontSize: 4.1,
    lineSpacing: 1.35,
    letterSpacing: 0,
    wrapLongLines: true,
    autoFitLongLines: false,
  },
  clock: {
    format: 'HH:MM', fontSize: 13, dateFontSize: 2.4, verseFontSize: 2.4, showClock: true, monitorRelogio: 'ministrante', showDate: true,
    showVerse: false, verse: '', bgType: 'solid', bgColor: '#f5f2ea',
    bgGradient: 'linear-gradient(135deg, #1a1816 0%, #2c2420 100%)',
    bgImage: '', textColor: '#1c1816', dateColor: '#1c1816', verseColor: '#1c1816'
  }
};
let cfgAbaAtualCtrl = 'slides';
let cfgSaveTimerCtrl = null;
let cfgDirtyCtrl = false;
let cfgSnapshotSalvoCtrl = '';
let preenchendoForm = false;


function syncColorSchemeCtrl() {
  try {
    document.documentElement.style.colorScheme = document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';
  } catch (_) {
  // intencional — erro ignorado
}
}

function atualizarIconeTemaCabecalho() {
  const el = document.getElementById('btn-dark-ctrl-letter');
  if (!el) return;
  const isDark = document.documentElement.classList.contains('dark');
  el.textContent = isDark ? '☀' : '☾';
}

export function toggleDarkCtrl() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  try { localStorage.setItem(LS_DARK_CTRL, isDark ? '1' : '0'); } catch (_) {
  // intencional — erro ignorado
}
  syncColorSchemeCtrl();
  atualizarIconeTemaCabecalho();
  sincronizarFormCfgGeral();
}

// --- SECÇÃO H — Tema escuro, modal de configuração de exibição, atalhos (ex.: Escape) ---
function loadDarkCtrl() {
  try {
    const saved = localStorage.getItem(LS_DARK_CTRL);
    if (saved === '1') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    atualizarIconeTemaCabecalho();
  } catch (_) {
  // intencional — erro ignorado
}
  syncColorSchemeCtrl();
}

export function abrirCfgModal(aba) {
  const statusEl = document.getElementById('cfg-status-ctrl');
  if (statusEl) statusEl.textContent = '';
  carregarBibliaCfgDoStorage();
  bibliaPopularFormularioCfg();
  popularFormCfgAvisoCard6();
  popularFormCfgContagem();
  sincronizarFormCfgGeral();
  aprimorarControlesVisuaisCfg();
  void carregarEstadoModoApresentacaoDoServidor().then(() => {
    if (!algumCampoAvisoCard6EmEdicao()) popularFormCfgAvisoCard6();
  });
  const abaEfetiva = aba || cfgAbaAtualCtrl || abaCfgPadraoDoModo();
  mudarAbaCfg(abaEfetiva);
  if (cfgAbaAtualCtrl !== 'conexao' && cfgAbaAtualCtrl !== 'geral' && !ehModoBibliaOperador()) {
    carregarCfgDoServidor();
  }
  atualizarUrlsObs();
  document.getElementById('cfg-modal-overlay-ctrl').classList.add('aberto');
}

export async function fecharCfgModal() {
  if (cfgDirtyCtrl) {
    const sair = await appConfirm('Existem alterações não salvas. Deseja sair sem salvar?');
    if (!sair) return;
    try {
      const cfgSalva = JSON.parse(cfgSnapshotSalvoCtrl || '{}');
      currentCfgCtrl = cfgSalva;
      aplicarPreviewCfgNoServidor();
    } catch (_) {
  // intencional — erro ignorado
}
    cfgDirtyCtrl = false;
  }
  document.getElementById('cfg-modal-overlay-ctrl').classList.remove('aberto');
}

export function mudarAbaCfg(aba) {
  const [pedida, destino] = resolverAbaCfgCtrl(aba);
  const alvo = CFG_ABAS_CTRL.includes(pedida) ? pedida : abaCfgPadraoDoModo();
  cfgAbaAtualCtrl = alvo;
  limparCfgBusca({ manterAba: true });
  if (alvo === 'geral') sincronizarFormCfgGeral();
  if (alvo === 'ministrantes') renderListaCfgMinistrantes().catch(() => {});
  CFG_ABAS_CTRL.forEach((a) => {
    const tab = document.getElementById('cfg-tab-ctrl-' + a);
    const panel = document.getElementById('cfg-panel-ctrl-' + a);
    if (tab) tab.classList.toggle('ativo', a === alvo);
    if (panel) panel.classList.toggle('ativo', a === alvo);
  });
  if (CFG_DESTINOS_CTRL[alvo]) {
    mudarDestinoCfg(alvo, destino || cfgDestinoAtualCtrl[alvo]);
  }
  const corpo = document.getElementById('cfg-modal-body-ctrl');
  if (corpo) corpo.scrollTop = 0;
}

async function carregarCfgDoServidor() {
  const ip = hostProjecao();
  if (!ip) return;
  const cfgLocal = carregarSlideCfgDoStorage();
  if (cfgLocal) {
    mesclarSlideCfgNoEstado(cfgLocal);
    const cfg = sanitizarCfgSlidesLocal(currentCfgCtrl);
    cfgSnapshotSalvoCtrl = JSON.stringify(cfg || {});
    cfgDirtyCtrl = false;
    popularFormCfg(cfg);
    if (!ehModoBibliaOperador()) {
      enviarPreviewDisplayConfig(cfg, { modoConfig: 'slides', forcarModo: 'slides' });
    }
    return;
  }
  try {
    /** Config do telão vive na API do app SERVIDOR (5510); :3001 aqui só é o BD local/proxy opcional — evitar GET inexistente. */
    const res = await fetch(`http://${ip}:5510/api/display-config`);
    if (!res.ok) return;
    const cfg = await res.json();
    currentCfgCtrl = cfg;
    cfgSnapshotSalvoCtrl = JSON.stringify(cfg || {});
    cfgDirtyCtrl = false;
    salvarSlideCfgNoStorage();
    popularFormCfg(cfg);
    if (!ehModoBibliaOperador()) {
      enviarPreviewDisplayConfig(cfg, { modoConfig: 'slides', forcarModo: 'slides' });
    }
  } catch (_) {
  // intencional — erro ignorado
}
}

export function popularFormCfg(cfg) {
  if (!cfg) return;
  preenchendoForm = true;
  try {
  const fs = document.getElementById('cfg-fontsize-ctrl');
  if (fs) { fs.value = cfg.fontSize || 5; document.getElementById('cfg-fontsize-val-ctrl').textContent = cfg.fontSize || 5; }
  const ls = document.getElementById('cfg-linespacing-ctrl');
  if (ls) { ls.value = cfg.lineSpacing || 1.7; document.getElementById('cfg-linespacing-val-ctrl').textContent = (cfg.lineSpacing || 1.7).toFixed(1); }
  setChkVal('cfg-autofit-long-lines-ctrl', cfg.autoFitLongLines === true);
  setPosCtrlBtn('posX', cfg.posX || 'center');
  setPosCtrlBtn('posY', cfg.posY || 'center');
  const ck = cfg.clock || {};
  const pb = cfg.publico || {};
  const mb = cfg.ministrante || {};
  aplicarPublicoCfgForm(pb);
  setSelVal('cfg-ministrante-bg-type-ctrl', mb.bgType || 'solid');
  setInputVal('cfg-ministrante-bg-color-ctrl', mb.bgColor || '#000000');
  setInputVal('cfg-ministrante-bg-gradient-ctrl', mb.bgGradient || '');
  setInputVal('cfg-ministrante-text-color-atual-ctrl', mb.textColorAtual || '#ffffff');
  setInputVal('cfg-ministrante-text-color-proximo-ctrl', mb.textColorProximo || '#f3c15a');
  const opACor = document.getElementById('op-atual');
  const opPCor = document.getElementById('op-proximo');
  if (opACor) opACor.style.color = mb.textColorAtual || '#ffffff';
  if (opPCor) opPCor.style.color = mb.textColorProximo || '#f3c15a';
  const corComentarioForm = normalizarCorComentarioMinistrante(
    mb.commentColor,
    dep.getCorComentarioMinistrantePainel()
  );
  setInputVal('cfg-ministrante-comment-color-ctrl', corComentarioForm);
  if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
  currentCfgCtrl.ministrante.commentColor = corComentarioForm;
  aplicarCorComentarioMinistranteNoPainel(corComentarioForm);
  const mbAberturaCor = String(mb.aberturaTituloColor || '').trim() || '#f3c15a';
  const mbAberturaFontRaw = Number(mb.aberturaTituloFontSize);
  const mbAberturaFont = Number.isFinite(mbAberturaFontRaw) ? mbAberturaFontRaw : 7;
  setInputVal('cfg-ministrante-abertura-titulo-color-ctrl', mbAberturaCor);
  setInputVal('cfg-ministrante-abertura-titulo-fontsize-ctrl', mbAberturaFont);
  setSpanText('cfg-ministrante-abertura-titulo-fontsize-val-ctrl', String(mbAberturaFont));
  currentCfgCtrl.ministrante.aberturaTituloColor = mbAberturaCor;
  currentCfgCtrl.ministrante.aberturaTituloFontSize = mbAberturaFont;
  aplicarEstiloPreviewTituloAbertura();
  const mbFontAtual = mb.fontSizeAtual ?? mb.fontSize ?? 4.1;
  const mbFontProximo = mb.fontSizeProximo ?? mb.fontSize ?? 4.1;
  setInputVal('cfg-ministrante-fontsize-atual-ctrl', mbFontAtual);
  setSpanText('cfg-ministrante-fontsize-atual-val-ctrl', String(mbFontAtual));
  setInputVal('cfg-ministrante-fontsize-proximo-ctrl', mbFontProximo);
  setSpanText('cfg-ministrante-fontsize-proximo-val-ctrl', String(mbFontProximo));
  setInputVal('cfg-ministrante-linespacing-ctrl', mb.lineSpacing || 1.35);
  setSpanText('cfg-ministrante-linespacing-val-ctrl', String(mb.lineSpacing || 1.35));
  const mbLetter = Number(mb.letterSpacing);
  const mbLetterOk = Number.isFinite(mbLetter) ? mbLetter : 0;
  setSelVal('cfg-ministrante-letterspacing-ctrl', String(mbLetterOk));
  setSpanText('cfg-ministrante-letterspacing-val-ctrl', String(mbLetterOk));
  if (opACor) opACor.style.letterSpacing = '';
  if (opPCor) opPCor.style.letterSpacing = '';
  setChkVal('cfg-ministrante-wrap-ctrl', mb.wrapLongLines !== false);
  setChkVal('cfg-ministrante-autofit-ctrl', mb.autoFitLongLines === true);
  /* Tipografia do M3. `maiusculo` ausente = LIGADO: o ministrante sempre saiu em caixa
     alta, logo uma config antiga (sem o campo) não pode virar minúsculas ao actualizar. */
  setSelVal('cfg-ministrante-fontfamily-ctrl', mb.fontFamily || 'CMG Sans, sans-serif');
  setChkVal('cfg-ministrante-negrito-ctrl', mb.negrito !== false);
  setChkVal('cfg-ministrante-italico-ctrl', mb.italico === true);
  setChkVal('cfg-ministrante-maiusculo-ctrl', mb.maiusculo !== false);
  aplicarTipografiaMinistranteNoPreview(mb);
  setSelVal('cfg-clock-format-ctrl', ck.format || 'HH:MM');
  setChkVal('cfg-clock-show-ctrl', ck.showClock !== false);
  setInputVal('cfg-clock-fontsize-ctrl', ck.fontSize || 13);
  setSpanText('cfg-clock-fontsize-val-ctrl', String(ck.fontSize || 13));
  setInputVal('cfg-clock-date-fontsize-ctrl', ck.dateFontSize || 2.4);
  setSpanText('cfg-clock-date-fontsize-val-ctrl', String(ck.dateFontSize || 2.4));
  setInputVal('cfg-clock-verse-fontsize-ctrl', ck.verseFontSize || 2.4);
  setSpanText('cfg-clock-verse-fontsize-val-ctrl', String(ck.verseFontSize || 2.4));
  setChkVal('cfg-clock-date-ctrl', ck.showDate !== false);
  setChkVal('cfg-clock-verse-ctrl', !!ck.showVerse);
  setInputVal('cfg-verse-ctrl', ck.verse || '');
  const clockTextColor = ck.textColor || '#1c1816';
  const clockDateColor = ck.dateColor || clockTextColor;
  const clockVerseColor = ck.verseColor || clockTextColor;
  setInputVal('cfg-clock-text-color-ctrl', clockTextColor);
  setSpanText('cfg-clock-text-color-val-ctrl', clockTextColor);
  setInputVal('cfg-clock-date-color-ctrl', clockDateColor);
  setSpanText('cfg-clock-date-color-val-ctrl', clockDateColor);
  setInputVal('cfg-clock-verse-color-ctrl', clockVerseColor);
  setSpanText('cfg-clock-verse-color-val-ctrl', clockVerseColor);
  setSelVal('cfg-clock-bg-type-ctrl', ck.bgType || 'solid');
  setInputVal('cfg-clock-bg-color-ctrl', ck.bgColor || '#f5f2ea');
  setSpanText('cfg-clock-bg-color-val-ctrl', ck.bgColor || '#f5f2ea');
  setInputVal('cfg-clock-gradient-ctrl', ck.bgGradient || '');
  onClockBgTypeCtrlChange();
  onPublicoBgTypeCtrlChange();
  onMinistranteBgTypeCtrlChange();
  atualizarVisibilidadeCamposRelogio();
  atualizarDependenciaAutoFitPublico();
  } finally {
    preenchendoForm = false;
    aprimorarControlesVisuaisCfg();
    try {
      sincronizarPreviewOciosoMinistranteSlides();
    } catch (_) {
      // intencional — erro ignorado
    }
  }
}

export function setSelVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function isCfgSwitchEl(el) {
  return !!(el && (el.classList.contains('cfg-switch') || el.getAttribute('role') === 'switch'));
}
export function getChkVal(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  if (isCfgSwitchEl(el)) return el.getAttribute('aria-checked') === 'true';
  return !!el.checked;
}
export function setChkVal(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  if (isCfgSwitchEl(el)) {
    setCfgSwitchState(el, !!v);
    return;
  }
  el.checked = !!v;
}
export function toggleCfgSwitch(el) {
  if (!el) return false;
  const next = el.getAttribute('aria-checked') !== 'true';
  setCfgSwitchState(el, next);
  return next;
}
export function setInputVal(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  /* Reescrever o valor no meio do arrasto do seletor nativo (Windows) trava a paleta. */
  if (el.type === 'color') {
    const atual = String(el.value || '').trim().toLowerCase();
    const novo = String(v ?? '').trim().toLowerCase();
    if (atual === novo) return;
  } else if (String(el.value) === String(v)) {
    if (el.dataset.sceMontado === '1') sincronizarSliderComEdicao(el);
    return;
  }
  el.value = v;
  if (el.dataset.sceMontado === '1') sincronizarSliderComEdicao(el);
}
export function setSpanText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
export function lerNumeroInput(id, fallback) {
  const el = document.getElementById(id);
  const raw = String(el?.value || '').trim().replace(',', '.');
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

/** Feedback imediato no painel de pré-visualização (mesmo critério que `publicProjectionUtils`). */
export function aplicarWrapImediato(pb) {
  const elLetrasEl = document.getElementById('pv-live-letras');
  if (!elLetrasEl) return;
  const wrap = pb?.wrapLongLines === true;
  elLetrasEl.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
  elLetrasEl.style.overflowWrap = wrap ? 'anywhere' : 'normal';
  elLetrasEl.style.wordBreak = wrap ? 'break-word' : 'normal';
}














function atualizarDependenciaAutoFitPublico() {
  const wrap = document.getElementById('cfg-publico-wrap-ctrl');
  const auto = document.getElementById('cfg-publico-autofit-ctrl');
  if (!wrap || !auto) return;
  const wrapOn = isCfgSwitchEl(wrap)
    ? wrap.getAttribute('aria-checked') === 'true'
    : !!wrap.checked;
  /** Igual ao telão físico (`publicProjectionUtils`): sem wrap o autoajuste está sempre ligado — reflete só com wrap opcional na UI */
  if (isCfgSwitchEl(auto)) {
    auto.disabled = !wrapOn;
    auto.setAttribute('aria-disabled', wrapOn ? 'false' : 'true');
    auto.style.opacity = wrapOn ? '' : '0.45';
    auto.style.pointerEvents = wrapOn ? '' : 'none';
  } else {
    auto.disabled = !wrapOn;
  }
  auto.title = wrapOn
    ? ''
    : 'Sem quebra automática da linha longa o telão sempre reduz a fonte até caber na horizontal.';
}



export function setPosCtrl(axis, val) {
  if (axis === 'posX') currentCfgCtrl.posX = val;
  else currentCfgCtrl.posY = val;
  setPosCtrlBtn(axis, val);
  debounceSalvarCfg();
}

function setPosCtrlBtn(axis, val) {
  const groupId = axis === 'posX' ? 'cfg-posx-ctrl-group' : 'cfg-posy-ctrl-group';
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.cfg-btn-pos').forEach(b => b.classList.toggle('ativo', b.dataset.val === val));
}

export function aplicarCfgRelogio() {
  const ck = currentCfgCtrl.clock || {};
  ck.format       = document.getElementById('cfg-clock-format-ctrl')?.value || 'HH:MM';
  ck.showClock    = (document.getElementById('cfg-clock-show-ctrl') ? getChkVal('cfg-clock-show-ctrl') : true);
  ck.monitorRelogio = 'ministrante';
  ck.fontSize     = lerNumeroInput('cfg-clock-fontsize-ctrl', ck.fontSize ?? 13);
  ck.dateFontSize = lerNumeroInput('cfg-clock-date-fontsize-ctrl', ck.dateFontSize ?? 2.4);
  ck.verseFontSize = lerNumeroInput('cfg-clock-verse-fontsize-ctrl', ck.verseFontSize ?? 2.4);
  ck.showDate     = (document.getElementById('cfg-clock-date-ctrl') ? getChkVal('cfg-clock-date-ctrl') : true);
  ck.showVerse    = (document.getElementById('cfg-clock-verse-ctrl') ? getChkVal('cfg-clock-verse-ctrl') : false);
  ck.verse        = document.getElementById('cfg-verse-ctrl')?.value || '';
  const tcEl = document.getElementById('cfg-clock-text-color-ctrl');
  if (tcEl) { ck.textColor = tcEl.value; setSpanText('cfg-clock-text-color-val-ctrl', tcEl.value); }
  const dcEl = document.getElementById('cfg-clock-date-color-ctrl');
  if (dcEl) { ck.dateColor = dcEl.value; setSpanText('cfg-clock-date-color-val-ctrl', dcEl.value); }
  const vcEl = document.getElementById('cfg-clock-verse-color-ctrl');
  if (vcEl) { ck.verseColor = vcEl.value; setSpanText('cfg-clock-verse-color-val-ctrl', vcEl.value); }
  const bgColEl = document.getElementById('cfg-clock-bg-color-ctrl');
  if (bgColEl) { ck.bgColor = bgColEl.value; setSpanText('cfg-clock-bg-color-val-ctrl', bgColEl.value); }
  ck.bgGradient   = document.getElementById('cfg-clock-gradient-ctrl')?.value || '';
  delete ck.showChurchName;
  delete ck.churchName;
  delete ck.churchFontSize;
  currentCfgCtrl.clock = ck;
  setSpanText('cfg-clock-fontsize-val-ctrl', String(ck.fontSize));
  setSpanText('cfg-clock-date-fontsize-val-ctrl', String(ck.dateFontSize));
  setSpanText('cfg-clock-verse-fontsize-val-ctrl', String(ck.verseFontSize));
  atualizarVisibilidadeCamposRelogio();
  atualizarPreviewFundoRelogioCtrl();
  debounceSalvarCfg();
  try {
    sincronizarPreviewOciosoMinistranteSlides();
  } catch (_) {
    // intencional — erro ignorado
  }
}

export function onClockFontSizeCtrlInput() {
  const val = lerNumeroInput('cfg-clock-fontsize-ctrl', currentCfgCtrl.clock?.fontSize ?? 13);
  if (!currentCfgCtrl.clock) currentCfgCtrl.clock = {};
  currentCfgCtrl.clock.fontSize = val;
  setSpanText('cfg-clock-fontsize-val-ctrl', String(val));
  debounceSalvarCfg();
  try {
    sincronizarPreviewOciosoMinistranteSlides();
  } catch (_) {
    // intencional — erro ignorado
  }
}

export function onClockDateFontSizeCtrlInput() {
  aplicarCfgRelogio();
}

export function onClockVerseFontSizeCtrlInput() {
  aplicarCfgRelogio();
}

function pintarCfgBgPreview(elId, { bgType, bgColor, bgGradient, bgImage }) {
  const prev = document.getElementById(elId);
  if (!prev) return;
  const tipo = bgType || 'solid';
  prev.style.backgroundImage = '';
  prev.style.backgroundColor = '';
  if (tipo === 'image' && bgImage) {
    prev.style.backgroundImage = `url(${bgImage})`;
    prev.style.backgroundColor = 'var(--surface2)';
  } else if (tipo === 'gradient' && bgGradient) {
    prev.style.backgroundImage = bgGradient;
  } else {
    prev.style.backgroundColor = bgColor || '#000000';
  }
}

function atualizarPreviewFundoPublicoCtrl() {
  const p = currentCfgCtrl?.publico || {};
  pintarCfgBgPreview('cfg-publico-bg-preview-ctrl', {
    bgType: p.bgType,
    bgColor: p.bgColor,
    bgGradient: p.bgGradient,
    bgImage: p.bgImage,
  });
}

function atualizarPreviewFundoMinistranteCtrl() {
  const m = currentCfgCtrl?.ministrante || {};
  pintarCfgBgPreview('cfg-ministrante-bg-preview-ctrl', {
    bgType: m.bgType,
    bgColor: m.bgColor,
    bgGradient: m.bgGradient,
    bgImage: m.bgImage,
  });
}

function atualizarPreviewFundoRelogioCtrl() {
  pintarCfgBgPreview('cfg-clock-bg-preview-ctrl', {
    bgType: document.getElementById('cfg-clock-bg-type-ctrl')?.value,
    bgColor: document.getElementById('cfg-clock-bg-color-ctrl')?.value,
    bgGradient: document.getElementById('cfg-clock-gradient-ctrl')?.value,
    bgImage: currentCfgCtrl?.clock?.bgImage || '',
  });
}

export function onPublicoBgTypeCtrlChange() {
  if (!currentCfgCtrl.publico) currentCfgCtrl.publico = {};
  const val = document.getElementById('cfg-publico-bg-type-ctrl')?.value || 'solid';
  currentCfgCtrl.publico.bgType = val;
  if (val !== 'image') currentCfgCtrl.publico.bgImage = '';
  const solid = document.getElementById('cfg-publico-bg-solid-ctrl');
  const grad = document.getElementById('cfg-publico-bg-gradient-wrap-ctrl');
  const img = document.getElementById('cfg-publico-bg-image-wrap-ctrl');
  if (solid) solid.style.display = val === 'solid' ? '' : 'none';
  if (grad) grad.style.display = val === 'gradient' ? '' : 'none';
  if (img) img.style.display = val === 'image' ? '' : 'none';
  atualizarPreviewFundoPublicoCtrl();
  debounceSalvarCfg();
}

export function onMinistranteBgTypeCtrlChange() {
  if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
  const val = document.getElementById('cfg-ministrante-bg-type-ctrl')?.value || 'solid';
  currentCfgCtrl.ministrante.bgType = val;
  if (val !== 'image') currentCfgCtrl.ministrante.bgImage = '';
  const solid = document.getElementById('cfg-ministrante-bg-solid-ctrl');
  const grad = document.getElementById('cfg-ministrante-bg-gradient-wrap-ctrl');
  const img = document.getElementById('cfg-ministrante-bg-image-wrap-ctrl');
  if (solid) solid.style.display = val === 'solid' ? '' : 'none';
  if (grad) grad.style.display = val === 'gradient' ? '' : 'none';
  if (img) img.style.display = val === 'image' ? '' : 'none';
  atualizarPreviewFundoMinistranteCtrl();
  debounceSalvarCfg();
}

export function onPublicoBgColorCtrlInput() {
  if (!currentCfgCtrl.publico) currentCfgCtrl.publico = {};
  currentCfgCtrl.publico.bgColor = document.getElementById('cfg-publico-bg-color-ctrl')?.value || '#f5f2ea';
  atualizarPreviewFundoPublicoCtrl();
  debounceSalvarCfg();
}

export function onPublicoBgGradientCtrlInput() {
  if (!currentCfgCtrl.publico) currentCfgCtrl.publico = {};
  currentCfgCtrl.publico.bgGradient = document.getElementById('cfg-publico-bg-gradient-ctrl')?.value || '';
  atualizarPreviewFundoPublicoCtrl();
  debounceSalvarCfg();
}

export function onMinistranteBgColorCtrlInput() {
  if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
  currentCfgCtrl.ministrante.bgColor = document.getElementById('cfg-ministrante-bg-color-ctrl')?.value || '#000000';
  atualizarPreviewFundoMinistranteCtrl();
  debounceSalvarCfg();
}

export function onMinistranteBgGradientCtrlInput() {
  if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
  currentCfgCtrl.ministrante.bgGradient = document.getElementById('cfg-ministrante-bg-gradient-ctrl')?.value || '';
  atualizarPreviewFundoMinistranteCtrl();
  debounceSalvarCfg();
}

export function onPublicoBgImageCtrlChange() {
  const file = document.getElementById('cfg-publico-bg-image-ctrl')?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (!currentCfgCtrl.publico) currentCfgCtrl.publico = {};
    currentCfgCtrl.publico.bgImage = e.target.result;
    atualizarPreviewFundoPublicoCtrl();
    debounceSalvarCfg();
  };
  reader.readAsDataURL(file);
}


/**
 * Regista a cor efectiva dos comentários. Não escreve custom property nenhuma: a cor entra
 * por `style` inline no render da prévia (ver nota em `css/controller.css`).
 */
export function aplicarCorComentarioMinistranteNoPainel(cor) {
  dep.setCorComentarioMinistrantePainel(
    normalizarCorComentarioMinistrante(cor, dep.getCorComentarioMinistrantePainel())
  );
  return dep.getCorComentarioMinistrantePainel();
}

/**
 * Espelha na prévia do painel a tipografia do M3 (família, negrito, itálico, maiúsculas).
 *
 * Vai por custom properties, não por `style` directo: o CSS só as lê em
 * `.op-slide-text:not(.vazio)`, de modo que a mensagem de estado («sem slide») continua na
 * fonte da interface. Inline, o negrito/caixa alta do M3 também a apanhariam.
 *
 * Defaults iguais aos do M3 real: negrito e maiúsculas ligados quando o campo não existe.
 */
function aplicarTipografiaMinistranteNoPreview(mn = {}) {
  const familia = String(mn.fontFamily || '').trim();
  const peso = mn.negrito !== false ? '600' : '400';
  const estilo = mn.italico === true ? 'italic' : 'normal';
  const caixa = mn.maiusculo !== false ? 'uppercase' : 'none';
  for (const id of ['op-atual', 'op-proximo']) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (familia) el.style.setProperty('--m3-font-familia', familia);
    else el.style.removeProperty('--m3-font-familia');
    el.style.setProperty('--m3-font-peso', peso);
    el.style.setProperty('--m3-font-estilo', estilo);
    el.style.setProperty('--m3-font-caixa', caixa);
  }
}

export function onMinistranteSlideCfgChange() {
  if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
  currentCfgCtrl.ministrante.textColorAtual =
    document.getElementById('cfg-ministrante-text-color-atual-ctrl')?.value || '#ffffff';
  currentCfgCtrl.ministrante.textColorProximo =
    document.getElementById('cfg-ministrante-text-color-proximo-ctrl')?.value || '#f3c15a';
  currentCfgCtrl.ministrante.commentColor = normalizarCorComentarioMinistrante(
    document.getElementById('cfg-ministrante-comment-color-ctrl')?.value,
    dep.getCorComentarioMinistrantePainel()
  );
  currentCfgCtrl.ministrante.aberturaTituloColor =
    document.getElementById('cfg-ministrante-abertura-titulo-color-ctrl')?.value || '#f3c15a';
  currentCfgCtrl.ministrante.aberturaTituloFontSize = lerNumeroInput(
    'cfg-ministrante-abertura-titulo-fontsize-ctrl',
    currentCfgCtrl.ministrante.aberturaTituloFontSize ?? 7
  );
  currentCfgCtrl.ministrante.fontSizeAtual = lerNumeroInput(
    'cfg-ministrante-fontsize-atual-ctrl',
    currentCfgCtrl.ministrante.fontSizeAtual ?? currentCfgCtrl.ministrante.fontSize ?? 4.1
  );
  currentCfgCtrl.ministrante.fontSizeProximo = lerNumeroInput(
    'cfg-ministrante-fontsize-proximo-ctrl',
    currentCfgCtrl.ministrante.fontSizeProximo ?? currentCfgCtrl.ministrante.fontSize ?? 4.1
  );
  currentCfgCtrl.ministrante.lineSpacing = lerNumeroInput(
    'cfg-ministrante-linespacing-ctrl',
    currentCfgCtrl.ministrante.lineSpacing ?? 1.35
  );
  {
    const rawLs = parseFloat(
      document.getElementById('cfg-ministrante-letterspacing-ctrl')?.value ?? '0'
    );
    const ls = Number.isFinite(rawLs) ? Math.min(30, Math.max(-10, rawLs)) : 0;
    currentCfgCtrl.ministrante.letterSpacing = ls;
    setSpanText('cfg-ministrante-letterspacing-val-ctrl', String(ls));
  }
  currentCfgCtrl.ministrante.fontFamily =
    document.getElementById('cfg-ministrante-fontfamily-ctrl')?.value || 'CMG Sans, sans-serif';
  currentCfgCtrl.ministrante.negrito = getChkVal('cfg-ministrante-negrito-ctrl');
  currentCfgCtrl.ministrante.italico = getChkVal('cfg-ministrante-italico-ctrl');
  currentCfgCtrl.ministrante.maiusculo = getChkVal('cfg-ministrante-maiusculo-ctrl');
  currentCfgCtrl.ministrante.wrapLongLines = getChkVal('cfg-ministrante-wrap-ctrl');
  currentCfgCtrl.ministrante.autoFitLongLines = getChkVal('cfg-ministrante-autofit-ctrl');
  setSpanText('cfg-ministrante-abertura-titulo-fontsize-val-ctrl', String(currentCfgCtrl.ministrante.aberturaTituloFontSize));
  setSpanText('cfg-ministrante-fontsize-atual-val-ctrl', String(currentCfgCtrl.ministrante.fontSizeAtual));
  setSpanText('cfg-ministrante-fontsize-proximo-val-ctrl', String(currentCfgCtrl.ministrante.fontSizeProximo));
  setSpanText('cfg-ministrante-linespacing-val-ctrl', String(currentCfgCtrl.ministrante.lineSpacing));
  aplicarCorComentarioMinistranteNoPainel(currentCfgCtrl.ministrante.commentColor);
  aplicarTipografiaMinistranteNoPreview(currentCfgCtrl.ministrante);
  aplicarEstiloPreviewTituloAbertura();
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (opA) {
    opA.style.color = currentCfgCtrl.ministrante.textColorAtual || '#ffffff';
    /* Prévia do painel não espelha letter-spacing — isso vai só ao M3 real. */
    opA.style.letterSpacing = '';
  }
  if (opP) {
    opP.style.color = currentCfgCtrl.ministrante.textColorProximo || '#f3c15a';
    opP.style.letterSpacing = '';
  }
  debounceSalvarCfg();
}

export function onMinistranteBgImageCtrlChange() {
  const file = document.getElementById('cfg-ministrante-bg-image-ctrl')?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
    currentCfgCtrl.ministrante.bgImage = e.target.result;
    atualizarPreviewFundoMinistranteCtrl();
    debounceSalvarCfg();
  };
  reader.readAsDataURL(file);
}

function atualizarVisibilidadeCamposRelogio() {
  const showVerse  = getChkVal('cfg-clock-verse-ctrl');
  const vg  = document.getElementById('cfg-verse-group-ctrl');
  if (vg)  vg.style.display  = showVerse  ? '' : 'none';
}

export function onClockBgTypeCtrlChange() {
  const val = document.getElementById('cfg-clock-bg-type-ctrl')?.value || 'solid';
  if (!currentCfgCtrl.clock) currentCfgCtrl.clock = {};
  currentCfgCtrl.clock.bgType = val;
  if (val !== 'image') currentCfgCtrl.clock.bgImage = '';
  const solid    = document.getElementById('cfg-bg-solid-ctrl');
  const gradient = document.getElementById('cfg-bg-gradient-ctrl');
  const image    = document.getElementById('cfg-bg-image-ctrl');
  if (solid)    solid.style.display    = val === 'solid'    ? '' : 'none';
  if (gradient) gradient.style.display = val === 'gradient' ? '' : 'none';
  if (image)    image.style.display    = val === 'image'    ? '' : 'none';
  atualizarPreviewFundoRelogioCtrl();
  debounceSalvarCfg();
}

export function onClockBgImageCtrlChange() {
  const file = document.getElementById('cfg-clock-image-ctrl')?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (currentCfgCtrl.clock) currentCfgCtrl.clock.bgImage = e.target.result;
    atualizarPreviewFundoRelogioCtrl();
    debounceSalvarCfg();
  };
  reader.readAsDataURL(file);
}

function aplicarPreviewCfgNoServidor() {
  if (ehModoBibliaOperador()) return;
  salvarSlideCfgNoStorage();
  enviarPreviewDisplayConfig(currentCfgCtrl, { modoConfig: 'slides', forcarModo: 'slides' });
  try {
    sincronizarPreviewOciosoMinistranteSlides();
  } catch (_) {
    // intencional — erro ignorado
  }
}

export function debounceSalvarCfg() {
  if (preenchendoForm) return;
  clearTimeout(cfgSaveTimerCtrl);
  cfgDirtyCtrl = JSON.stringify(currentCfgCtrl || {}) !== cfgSnapshotSalvoCtrl;
  cfgSaveTimerCtrl = setTimeout(() => {
    if (ehModoBibliaOperador()) {
      salvarSlideCfgNoStorage();
      enviarPreviewDisplayConfig({ clock: currentCfgCtrl?.clock || {} }, {
        modoConfig: 'slides',
        forcarModo: 'slides',
      });
      return;
    }
    aplicarPreviewCfgNoServidor();
  }, 120);
}

export async function salvarCfgNoServidor() {
  const ip = hostProjecao();
  const statusEl = document.getElementById('cfg-status-ctrl');
  if (!ip) { if (statusEl) statusEl.textContent = 'Sem IP configurado'; return; }

  if (ehModoBibliaOperador()) {
    lerBibliaCfgDoFormularioPublico();
    lerBibliaCfgDoFormularioMinistrante();
    salvarBibliaCfgNoStorage();
    const payloadBiblia = {
      ...bibliaPayloadCfgExibicao(),
      modoConfig: 'biblia',
      forcarModo: 'biblia',
    };
    if (dep.getProjecao().pronta()) {
      dep.getProjecao().enviar('set_display_config', { clock: currentCfgCtrl?.clock || {}, modoConfig: 'slides' });
      dep.getProjecao().enviar('set_display_config', payloadBiblia, (ack) => {
        if (statusEl) statusEl.textContent = ack?.ok ? 'Salvo ✓' : 'Erro ao salvar';
        if (ack?.ok) {
          cfgDirtyCtrl = false;
          salvarSlideCfgNoStorage();
          fecharCfgModal();
        }
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
      });
      return;
    }
    try {
      const res = await fetch(`http://${ip}:5510/api/display-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBiblia),
      });
      if (statusEl) statusEl.textContent = res.ok ? 'Salvo ✓' : 'Erro ao salvar';
      if (res.ok) {
        cfgDirtyCtrl = false;
        salvarSlideCfgNoStorage();
        fecharCfgModal();
      }
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    } catch (_) {
      if (statusEl) statusEl.textContent = 'Erro de rede';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    }
    return;
  }

  if (dep.getProjecao().pronta()) {
    const payloadSlides = {
      ...(currentCfgCtrl || {}),
      modoConfig: 'slides',
      forcarModo: 'slides',
    };
    dep.getProjecao().enviar('set_display_config', payloadSlides, (ack) => {
      if (statusEl) statusEl.textContent = ack?.ok ? 'Salvo ✓' : 'Erro ao salvar';
      if (ack?.ok) {
        cfgSnapshotSalvoCtrl = JSON.stringify(currentCfgCtrl || {});
        cfgDirtyCtrl = false;
        salvarSlideCfgNoStorage();
        fecharCfgModal();
      }
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    });
    return;
  }
  try {
    const res = await fetch(`http://${ip}:5510/api/display-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentCfgCtrl)
    });
    if (statusEl) statusEl.textContent = res.ok ? 'Salvo ✓' : 'Erro ao salvar';
    if (res.ok) {
      cfgSnapshotSalvoCtrl = JSON.stringify(currentCfgCtrl || {});
      cfgDirtyCtrl = false;
      salvarSlideCfgNoStorage();
      fecharCfgModal();
    }
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  } catch (_) {
    if (statusEl) statusEl.textContent = 'Erro de rede';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  }
}






/** Slider vh com pontinhos 0…max (atributo do input) + cores com código hex à direita. */
export function aprimorarControlesVisuaisCfg() {
  inicializarSlidersComEdicao(document.querySelector('.cfg-modal') || document);
  document.querySelectorAll('.cfg-modal .cfg-slider--vh').forEach((input) => {
    if (input.dataset.sceMontado === '1' || input.hasAttribute('data-sce-label')) return;
    if (input.dataset.cfgTicks === '1') {
      sincronizarTicksSliderVh(input);
      return;
    }
    const maxVh = Math.max(0, Math.round(Number(input.max) || 9));
    input.min = '0';
    input.max = String(maxVh);
    input.step = '1';
    const rounded = Math.max(0, Math.min(maxVh, Math.round(Number(input.value) || 0)));
    input.value = String(rounded);
    input.dataset.cfgTicks = '1';
    const wrap = document.createElement('div');
    wrap.className = 'cfg-size-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const ticks = document.createElement('div');
    ticks.className = 'cfg-size-ticks';
    ticks.setAttribute('aria-hidden', 'true');
    for (let i = 0; i <= maxVh; i += 1) {
      const d = document.createElement('span');
      d.className = 'cfg-size-tick';
      d.dataset.n = String(i);
      if (i === 0 || i === maxVh) d.setAttribute('data-label', String(i));
      ticks.appendChild(d);
    }
    wrap.appendChild(ticks);
    input.addEventListener('input', () => sincronizarTicksSliderVh(input));
    sincronizarTicksSliderVh(input);
  });

  document.querySelectorAll('.cfg-modal input[type=color]').forEach((input) => {
    /*
     * Windows + Electron: o diálogo nativo de cor dispara `input` a cada pixel.
     * Qualquer trabalho pesado aí (ler formulário, preview, IPC) trava a paleta.
     * No arrasto só atualizamos o hex; a aplicação vai no `change` (ao confirmar).
     */
    if (!input.dataset.lyraCorLigada) {
      input.dataset.lyraCorLigada = '1';
      const aplicarArrasto = input.oninput;
      if (typeof aplicarArrasto === 'function') {
        input.oninput = null;
        input.removeAttribute('oninput');
        input.addEventListener('change', (ev) => aplicarArrasto.call(input, ev));
      }
      input.addEventListener('input', () => {
        const hex = input.closest('.cfg-color-row')?.querySelector('.cfg-color-val');
        if (hex) hex.textContent = String(input.value || '#000000').toUpperCase();
      });
    }
    if (!input.closest('.cfg-color-row')) {
      const row = document.createElement('div');
      row.className = 'cfg-color-row';
      const val = document.createElement('span');
      val.className = 'cfg-color-val';
      input.parentNode.insertBefore(row, input);
      row.appendChild(input);
      row.appendChild(val);
    }
    const hex = input.closest('.cfg-color-row')?.querySelector('.cfg-color-val');
    if (hex) hex.textContent = String(input.value || '#000000').toUpperCase();
  });
}

/** Config corrente do modal (lida por quem precisa de fundo/tipografia/relógio no núcleo). */
export function lerCurrentCfgCtrl() {
  return currentCfgCtrl;
}

/**
 * Instruções que corriam no carregamento (config de slides inicial, atalhos em `window` usados por
 * outros scripts, tema escuro). Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarConfigExibicao() {
  carregarSlideCfgInicialDoStorage();
  window.setSpanText = setSpanText;
  window.setSelVal = setSelVal;
  window.setInputVal = setInputVal;
  window.setChkVal = setChkVal;
  window.getChkVal = getChkVal;
  window.toggleCfgSwitch = toggleCfgSwitch;
  window.lerNumeroInput = lerNumeroInput;
  window.debounceSalvarCfg = debounceSalvarCfg;
  window.aplicarWrapImediato = aplicarWrapImediato;
  window.getCurrentCfgCtrl = () => currentCfgCtrl;
  window.setCurrentCfgCtrl = (next) => { currentCfgCtrl = next || {}; };
  window.getElLetras = () => elLetras;
  try {
    if (typeof window.attachPublicDisplayConfig === 'function') {
      window.attachPublicDisplayConfig(window);
    }
    exporCallbacksParaAtributosHtml({
      onPublicoSlideCfgChange: window.onPublicoSlideCfgChange,
      onPublicoSlideCfgRangeInput: window.onPublicoSlideCfgRangeInput,
    });
  } catch (e) {
    console.error('[controller] attachPublicDisplayConfig', e);
  }
  try {
    window.atualizarDependenciaAutoFitPublico = atualizarDependenciaAutoFitPublico;
  } catch (_) {
    // intencional — erro ignorado
  }
  loadDarkCtrl();
  window.bibliaCfgExibicao = dep.getBibliaCfgExibicao();
  window.bibliaCfgMinistrante = dep.getBibliaCfgMinistrante();
}
