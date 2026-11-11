/**
 * Culto do dia: cultos manuais, calendário de cultos, seletor de culto e migração das playlists
 * antigas. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasCultoDoDia`.
 */
import { LS_CULTOS_MANUAIS, LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS } from '../modules/chavesArmazenamentoLocal.js';
import { appAlert, appConfirm } from './appDialog.js';
import { cultoIdPertenceAoMes, dataReferenciaCalendarioCultos, gerarCultosDoMes, gerarCultosParaDataManual, parseLabelCulto } from '../modules/cultosCalendario.js';
import { ordenarCultosPorData, resolverProximoCultoPorHorarioBrasilia } from '../modules/proximoCulto.js';
import { carregarMapaSecoesTemaPlaylistRecolhidas, garantirAberturaNoCatalogoCulto, garantirMarcadorAberturaNaPlaylist, getAberturaRemovidaPorCulto, getMinistrantePadraoPorCulto, saveAberturaRemovidaPorCulto, saveMinistrantePadraoPorCulto, saveTemaSelecionadoPorCulto, saveTemasPorCulto } from './playlistTemas.js';
import { estadoPainel } from './estadoPainel.js';
import { fecharOutrosSeletoresDropdown } from './temasPlaylistUi.js';
import { marcarBancoCompartilhadoAlterado } from './sincronizacaoBanco.js';
import { savePlaylists } from './playlistServidor.js';
import { initCultoSelect, onCultoChange } from './cultoSeletor.js';

export function loadCultosManuais() {
  try {
    const raw = localStorage.getItem(LS_CULTOS_MANUAIS);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return ordenarCultosPorData(
      p
        .filter((c) => c && c.id && c.label)
        .map((c) => ({ id: String(c.id), label: String(c.label) }))
    );
  } catch (_) {
    return [];
  }
}

export function saveCultosManuais() {
  try {
    localStorage.setItem(LS_CULTOS_MANUAIS, JSON.stringify(estadoPainel.cultosManuaisCache || []));
  } catch (_) {
  // intencional — erro ignorado
}
  marcarBancoCompartilhadoAlterado();
}

export function idsCultosJaNaLista() {
  const s = new Set();
  gerarCultosDoMes(dataReferenciaCalendarioCultos(new Date())).forEach((c) => s.add(c.id));
  (estadoPainel.cultosManuaisCache || []).forEach((c) => s.add(c.id));
  return s;
}

/**
 * Cultos automáticos do mês + manuais desse mesmo mês/ano (sem duplicar id).
 * Cultos extras de outros meses permanecem persistidos, mas não entram na lista.
 */
export function listarCultosDisponiveis(dataRef = dataReferenciaCalendarioCultos(new Date())) {
  const ref = dataRef instanceof Date ? dataRef : new Date();
  const auto = gerarCultosDoMes(ref);
  const idsAuto = new Set(auto.map((c) => c.id));
  const manual = (estadoPainel.cultosManuaisCache || []).filter(
    (c) => !idsAuto.has(c.id) && cultoIdPertenceAoMes(c.id, ref)
  );
  return ordenarCultosPorData([...auto, ...manual]);
}

export function cultoIdEhManual(cid) {
  return (estadoPainel.cultosManuaisCache || []).some((c) => c.id === cid);
}

function limparSecoesTemaRecolhidasDoCulto(cid) {
  const m = carregarMapaSecoesTemaPlaylistRecolhidas();
  const pref = `${String(cid)}|||`;
  let mudou = false;
  Object.keys(m).forEach((k) => {
    if (k.startsWith(pref)) {
      delete m[k];
      mudou = true;
    }
  });
  if (mudou) {
    try {
      localStorage.setItem(LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS, JSON.stringify(m));
    } catch (_) {
  // intencional — erro ignorado
}
  }
}

function excluirCultoManualPorId(cid) {
  if (!cid || !cultoIdEhManual(cid)) return;
  estadoPainel.cultosManuaisCache = (estadoPainel.cultosManuaisCache || []).filter((c) => c.id !== cid);
  saveCultosManuais();
  delete estadoPainel.playlists[cid];
  delete estadoPainel.temasPorCulto[cid];
  delete estadoPainel.temaSelecionadoPorCulto[cid];
  delete getAberturaRemovidaPorCulto()[cid];
  delete getMinistrantePadraoPorCulto()[cid];
  limparSecoesTemaRecolhidasDoCulto(cid);
  savePlaylists();
  saveTemasPorCulto();
  saveTemaSelecionadoPorCulto();
  saveAberturaRemovidaPorCulto();
  saveMinistrantePadraoPorCulto();
  if (estadoPainel.cultoId === cid) {
    estadoPainel.cultoId = '';
  }
  initCultoSelect();
  onCultoChange();
}

export async function solicitarExcluirCultoManual(ev, cid) {
  ev.preventDefault();
  ev.stopPropagation();
  const item = (estadoPainel.cultosManuaisCache || []).find((c) => c.id === cid);
  const ok = await appConfirm(
    `Excluir o culto «${item?.label || cid}» e toda a playlist (temas e músicas)?`,
    'Excluir culto'
  );
  if (!ok) return;
  excluirCultoManualPorId(cid);
}

function adicionarCultosManuaisNaData(dt) {
  const novos = gerarCultosParaDataManual(dt);
  const existentes = idsCultosJaNaLista();
  const aInserir = novos.filter((c) => !existentes.has(c.id));
  if (!aInserir.length) {
    appAlert('Já existe culto para esta data na lista.', 'Adicionar culto');
    return;
  }
  estadoPainel.cultosManuaisCache = ordenarCultosPorData([...(estadoPainel.cultosManuaisCache || []), ...aInserir]);
  saveCultosManuais();
  let playlistMudou = false;
  aInserir.forEach((c) => {
    garantirAberturaNoCatalogoCulto(c.id);
    if (garantirMarcadorAberturaNaPlaylist(c.id)) playlistMudou = true;
  });
  if (playlistMudou) savePlaylists();
  estadoPainel.cultoId = aInserir[0].id;
  initCultoSelect();
  setCultoSelecionadoNaUi(estadoPainel.cultoId);
  onCultoChange();
  fecharModalCalendarioCulto();
}

let cultoCalMesRef = new Date();
let cultoCalDiaSelecionado = null;

const CULTO_CAL_MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function renderGradeCalendarioCulto() {
  const tit = document.getElementById('culto-cal-mes-ano');
  const grid = document.getElementById('culto-cal-grid');
  const btnOk = document.getElementById('culto-cal-confirmar');
  if (!tit || !grid) return;
  const y = cultoCalMesRef.getFullYear();
  const m0 = cultoCalMesRef.getMonth();
  tit.textContent = `${CULTO_CAL_MESES_PT[m0]} ${y}`;
  grid.innerHTML = '';
  const first = new Date(y, m0, 1);
  const startPad = first.getDay();
  const lastD = new Date(y, m0 + 1, 0).getDate();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (let i = 0; i < startPad; i++) {
    const cell = document.createElement('span');
    cell.className = 'culto-cal-cell culto-cal-cell--vazio';
    grid.appendChild(cell);
  }
  for (let d = 1; d <= lastD; d++) {
    const dt = new Date(y, m0, d);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'culto-cal-cell';
    cell.textContent = String(d);
    const isoSel =
      cultoCalDiaSelecionado &&
      cultoCalDiaSelecionado.getFullYear() === y &&
      cultoCalDiaSelecionado.getMonth() === m0 &&
      cultoCalDiaSelecionado.getDate() === d;
    if (isoSel) cell.classList.add('culto-cal-cell--sel');
    if (dt.getTime() === hoje.getTime()) cell.classList.add('culto-cal-cell--hoje');
    cell.addEventListener('click', () => {
      cultoCalDiaSelecionado = new Date(y, m0, d);
      renderGradeCalendarioCulto();
    });
    grid.appendChild(cell);
  }
  if (btnOk) btnOk.disabled = !cultoCalDiaSelecionado;
}

function abrirModalCalendarioCulto() {
  const bd = document.getElementById('culto-calendario-backdrop');
  if (!bd) return;
  cultoCalMesRef = new Date();
  cultoCalMesRef.setDate(1);
  cultoCalDiaSelecionado = null;
  renderGradeCalendarioCulto();
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
}

function fecharModalCalendarioCulto() {
  const bd = document.getElementById('culto-calendario-backdrop');
  if (!bd) return;
  bd.hidden = true;
  bd.setAttribute('aria-hidden', 'true');
}

export function setupAdicionarCultoManual() {
  document.getElementById('btn-adicionar-culto')?.addEventListener('click', () => abrirModalCalendarioCulto());
  document.getElementById('culto-cal-cancel')?.addEventListener('click', () => fecharModalCalendarioCulto());
  document.getElementById('culto-cal-confirmar')?.addEventListener('click', () => {
    if (!cultoCalDiaSelecionado) return;
    adicionarCultosManuaisNaData(cultoCalDiaSelecionado);
  });
  document.getElementById('culto-cal-prev')?.addEventListener('click', () => {
    cultoCalMesRef = new Date(cultoCalMesRef.getFullYear(), cultoCalMesRef.getMonth() - 1, 1);
    renderGradeCalendarioCulto();
  });
  document.getElementById('culto-cal-next')?.addEventListener('click', () => {
    cultoCalMesRef = new Date(cultoCalMesRef.getFullYear(), cultoCalMesRef.getMonth() + 1, 1);
    renderGradeCalendarioCulto();
  });
  const bd = document.getElementById('culto-calendario-backdrop');
  bd?.addEventListener('click', (e) => {
    if (e.target === bd) fecharModalCalendarioCulto();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bd && !bd.hidden) fecharModalCalendarioCulto();
  });
}

export function fecharCultoDropdown() {
  const wrap = document.getElementById('culto-dd');
  const btn = document.getElementById('culto-dd-btn');
  const menu = document.getElementById('culto-dd-menu');
  if (!wrap || !btn || !menu) return;
  wrap.classList.remove('open');
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

/** Seleciona automaticamente o próximo culto com base na data/hora de Brasília. */
export function resolverCultoInicialPorAgenda() {
  return resolverProximoCultoPorHorarioBrasilia({ listarCultosDisponiveis });
}

/**
 * Encolhe o texto dos três seletores do topo da playlist até caberem todos inteiros.
 *
 * São o dia do culto, o ministrante e o tema. Partilham uma medida por duas razões: estão
 * empilhados no mesmo cabeçalho e leem-se como uma coisa só — três corpos diferentes ali
 * seriam lidos como três níveis de importância que não existem — e porque o que cada um
 * mostra muda de comprimento a toda a hora, e um corpo por seletor faria a coluna trocar
 * de tipografia a cada escolha.
 *
 * Por isso o laço desce enquanto QUALQUER um deles transbordar e aplica o resultado aos
 * três: quem manda é o mais apertado, que é quase sempre o ministrante — a caixa mais
 * estreita das três e a que tem o texto mais longo («Selecione o ministrante...»).
 *
 * O ponto de partida é o corpo que o CSS lhes dá, e não um número escrito aqui: o valor
 * vive na folha, ao pé do resto do desenho do seletor.
 *
 * `scrollWidth > clientWidth` é o mesmo critério com que o browser decide pôr as
 * reticências — o laço pára exactamente quando elas deixariam de aparecer. Caixa de
 * largura zero é seletor ainda por desenhar ou escondido (o ministrante no modo slides):
 * fica de fora da conta, senão um elemento invisível encolhia os outros dois.
 */
const SELETORES_CULTO_TEXTO_IDS = Object.freeze([
  'culto-dd-desc',
  'culto-ministrante-dd-label',
]);
const SELETOR_CULTO_CORPO_MIN_PX = 11;

export function ajustarCorpoSeletoresDoCulto() {
  const els = SELETORES_CULTO_TEXTO_IDS
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!els.length) return;

  els.forEach((el) => { el.style.fontSize = ''; });
  const base = parseFloat(getComputedStyle(els[0]).fontSize);
  if (!Number.isFinite(base)) return;

  const medidos = els.filter((el) => el.clientWidth > 0);
  if (!medidos.length) return;

  const transborda = () => medidos.some((el) => el.scrollWidth > el.clientWidth);
  let px = base;
  while (px > SELETOR_CULTO_CORPO_MIN_PX && transborda()) {
    px -= 0.5;
    els.forEach((el) => { el.style.fontSize = px + 'px'; });
  }
}

export function setCultoSelecionadoNaUi(value) {
  const hid = document.getElementById('culto-sel');
  const dataEl = document.getElementById('culto-dd-data');
  const descEl = document.getElementById('culto-dd-desc');
  const menu = document.getElementById('culto-dd-menu');
  if (!hid || !dataEl || !descEl) return;
  const v = String(value || '');
  hid.value = v;
  const item = estadoPainel.cultosDoMesCache.find((c) => c.id === v);
  if (!item) {
    dataEl.textContent = '--/--';
    descEl.textContent = 'Selecione o dia do culto...';
  } else {
    const p = parseLabelCulto(item.label);
    dataEl.textContent = p.data;
    descEl.textContent = p.desc;
  }
  ajustarCorpoSeletoresDoCulto();
  if (menu) {
    menu.querySelectorAll('.culto-dd-item').forEach((b) => {
      b.setAttribute('aria-selected', b.dataset.value === v ? 'true' : 'false');
    });
  }
}

export function setupCultoDropdown() {
  const wrap = document.getElementById('culto-dd');
  const btn = document.getElementById('culto-dd-btn');
  const menu = document.getElementById('culto-dd-menu');
  if (!wrap || !btn || !menu) return;
  /* A coluna da direita estica e encolhe com a janela: o corpo que cabia numa largura
     pode não caber noutra, e vice-versa — por isso a medida repete-se a cada redimensão. */
  window.addEventListener('resize', ajustarCorpoSeletoresDoCulto);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = menu.hidden;
    fecharOutrosSeletoresDropdown(wrap);
    if (abrir) {
      wrap.classList.add('open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    } else {
      fecharCultoDropdown();
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) fecharCultoDropdown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharCultoDropdown();
  });
}

/** Migra playlists dos ids fixos antigos para o 1.º culto equivalente do mês atual. */
export function migrarPlaylistsCultosAntigos() {
  const cultos = gerarCultosDoMes(dataReferenciaCalendarioCultos(new Date()));
  if (!cultos.length) return;
  const primeiro = (pred) => cultos.find(pred);
  const mapLegado = [
    ['quarta', () => primeiro((c) => c.id.endsWith('_quarta'))],
    ['domingo_manha', () => primeiro((c) => c.id.endsWith('_manha'))],
    ['domingo_noite', () => primeiro((c) => c.id.endsWith('_noite'))],
  ];
  let mudou = false;
  mapLegado.forEach(([oldKey, finder]) => {
    const arr = estadoPainel.playlists[oldKey];
    if (!Array.isArray(arr) || arr.length === 0) return;
    const target = finder();
    if (!target) return;
    if (!Array.isArray(estadoPainel.playlists[target.id])) estadoPainel.playlists[target.id] = [];
    const mesclado = [...arr];
    mesclado.forEach((item) => {
      const dup = estadoPainel.playlists[target.id].some((x) => Number(x.id) === Number(item.id));
      if (!dup) estadoPainel.playlists[target.id].push(item);
    });
    delete estadoPainel.playlists[oldKey];
    mudou = true;
  });
  if (mudou) savePlaylists();
}
