/**
 * Seletores de roteamento de telas no cabeçalho: rótulos de monitor, menus de rota, render do roteamento,
 * estilo das rotas desativadas e aplicação da rota do modo atual. Movido verbatim do núcleo
 * (`controllerAppCore.js`); o que o núcleo ainda possui entra por `registrarDependenciasRoteamentoTelasUi`.
 */
import { aplicarPreviewPainelOcultoNoDom } from './previewOculto.js';
import { atualizarIndicadorProjecaoLiveUi, listaMonitoresParaProjecao, marcarRotaLiveNoDom, modoRoteamentoAtual, modoUsaSeletorMonitorUnificado, normalizarRota, registrarEscolhaMonitorDoOperador, rotaLiveSelecionadaNaUi, rotaSemMonitorRepetido, salvarRotasPorModoNoStorage, sanitizarIndiceMonitorProjecao, sanitizarRotaProjecao } from './rotasMonitores.js';
import { bibliaProjecaoAtivaNoCanalMinistrante, bibliaProjecaoAtivaNoCanalPublico, canalMinistranteOcupadoPorOutroModoNoSlides, canalPublicoOcupadoPorOutroModoNoSlides, obterRotaSlidesParaUi } from './canaisProjecao.js';
import { opcoesRoteamentoUnificadoModoApresentacao, opcoesSeletorCabecalhoDoModoAtual, reemitirConteudoAposMudancaDeRotaUnificada } from './conteudoUnificadoAviso.js';
import { registrarEscolhaSeletorUnificado } from '../modules/ordemNaoExibirUnificado.js';
import { salvarRoteamentoTelasNoServidor } from './roteamentoTelas.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasRoteamentoTelasUi(d) {
  dep = d || {};
}
const ehModoSlidesOperador = (...a) => dep.ehModoSlidesOperador(...a);
const fecharOutrosSeletoresDropdown = (...a) => dep.fecharOutrosSeletoresDropdown(...a);

/**
 * Rótulo do monitor no seletor.
 *
 * Prefere o nome que o sistema dá ao painel («LG TV», «EPSON PJ») em vez de `Monitor 2`:
 * o operador reconhece o equipamento, não a numeração do Windows — que aliás muda.
 * Quando o driver não expõe nome, cai para a numeração, que é melhor que nada.
 */
export function montarLabelMonitor(m) {
  const base = m && m.label ? String(m.label) : `Monitor ${Number(m?.index || 0) + 1}`;
  return m && m.primary ? `${base} (principal — sem projeção)` : base;
}

/** Tooltip com a posição e a resolução — desempata dois painéis com o mesmo nome. */
export function montarTitleMonitor(m) {
  if (!m) return '';
  const partes = [];
  if (m.nome && m.rotuloPosicional) partes.push(m.rotuloPosicional);
  const w = Number(m?.size?.width || m?.bounds?.width || 0);
  const h = Number(m?.size?.height || m?.bounds?.height || 0);
  if (w && h) partes.push(`${w}×${h}`);
  return partes.join(' · ');
}

/**
 * Aviso no cabeçalho quando não há nenhum monitor de projeção.
 *
 * O ecrã principal é do operador e não conta. Com pelo menos um monitor externo,
 * o aviso não aparece — mesmo que o que estava guardado tenha mudado de nome.
 * Sem lista ainda (servidor a responder), não mostra nem esconde: evitar o pisca.
 */
export function avisarMonitoresConfiguradosEmFalta() {
  const el = document.getElementById('hdr-monitores-aviso');
  if (!el) return;
  if (!Array.isArray(dep.getMonitoresServidorCache()) || !dep.getMonitoresServidorCache().length) return;
  if (contarMonitoresDeProjecao() > 0) {
    el.classList.add('oculto');
    el.textContent = '';
    el.removeAttribute('title');
    return;
  }
  el.classList.remove('oculto');
  el.textContent = '⚠ Monitor não encontrado';
  el.title = 'Nenhum monitor de projeção foi encontrado. Ligue um monitor externo e escolha onde projetar.';
}

export function fecharMenusRoteamentoTelas() {
  document.querySelectorAll('.route-dd').forEach((wrap) => {
    wrap.classList.remove('route-dd-open');
    const menu = wrap.querySelector('.route-dd-menu');
    const btn = wrap.querySelector('.route-dd-btn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

/**
 * Duplo clique projeta — não seleciona a palavra debaixo do cursor.
 *
 * O duplo clique é o gesto de projetar em quase todo o painel: versículo na Bíblia, chip
 * na faixa, cartão de estrofe, linha da playlist e do banco, cartão de mídia. Mas o
 * navegador também trata duplo clique como «selecionar palavra», e as duas coisas
 * aconteciam ao mesmo tempo: o operador projetava e ficava com um pedaço de texto
 * realçado a azul por cima do conteúdo, à vista durante o culto.
 *
 * A correção vai no `mousedown` e não no `dblclick`: quando o segundo clique chega, a
 * seleção já foi feita: limpá-la depois é um pisca visível. `preventDefault()` no clique
 * que a iniciaria impede-a de existir — e não cancela o evento `dblclick`, que continua a
 * disparar normalmente.
 *
 * Um listener só, em vez de remendar cada `dblclick`: os sítios com este gesto são muitos
 * e crescem, e um esquecido é um bug que só aparece em palco.
 *
 * Campos de texto ficam de fora: lá o duplo clique é mesmo para selecionar. Arrastar para
 * selecionar continua a funcionar em todo o lado — só o duplo clique deixa de o fazer.
 */
export function impedirSelecaoDeTextoNoDuploClique() {
  const CAMPOS_DE_TEXTO = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  document.addEventListener(
    'mousedown',
    (ev) => {
      /* `detail` conta os cliques da sequência: 1 é clique simples e não selecciona nada. */
      if (ev.detail < 2 || ev.button !== 0) return;
      if (ev.target?.closest?.(CAMPOS_DE_TEXTO)) return;
      ev.preventDefault();
    },
    true
  );
}

export function setupMenusRoteamentoTelas() {
  document.querySelectorAll('.route-dd').forEach((wrap) => {
    const btn = wrap.querySelector('.route-dd-btn');
    const menu = wrap.querySelector('.route-dd-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const abrir = !wrap.classList.contains('route-dd-open');
      fecharOutrosSeletoresDropdown(wrap);
      if (abrir) {
        wrap.classList.add('route-dd-open');
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      } else {
        wrap.classList.remove('route-dd-open');
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.addEventListener('click', fecharMenusRoteamentoTelas);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenusRoteamentoTelas();
  });
}

/** -1 = desativado; rejeita valores não numéricos (ex.: string vinda do JSON sem reparse). */
export function indiceRoteamentoMonitorNaUi(val) {
  if (val === '' || val === null || val === undefined) return -1;
  const n = typeof val === 'number' && Number.isFinite(val) ? val : parseInt(String(val).trim(), 10);
  if (!Number.isFinite(n) || n < -1) return -1;
  return n;
}

/** Texto do botão quando a rota do modo apresentação não coincide com um dos quatro presets. */
export function rotuloRotaApresentacaoForaDoPreset(r, lista) {
  if (r && r.live) return 'Live — OBS';
  const pub = indiceRoteamentoMonitorNaUi(r?.publicoIndex);
  const min = indiceRoteamentoMonitorNaUi(r?.ministranteIndex);
  if (pub < 0 && min < 0) return 'Não exibir';
  if (pub >= 0 && min < 0) return `Público — Monitor ${pub + 1}`;
  if (pub < 0 && min >= 0) return `Ministrante — Monitor ${min + 1}`;
  return 'Ambos';
}

export function renderRoteamentoTelas(monitores, routing) {
  fecharMenusRoteamentoTelas();
  const hidPub = document.getElementById('route-publico');
  const hidMin = document.getElementById('route-ministrante');
  const menuPub = document.getElementById('route-publico-menu');
  const menuMin = document.getElementById('route-ministrante-menu');
  const dispPub = document.getElementById('route-publico-display');
  const dispMin = document.getElementById('route-ministrante-display');
  const lblPub = document.getElementById('route-publico-label');
  if (!hidPub || !hidMin || !menuPub || !menuMin || !dispPub || !dispMin) return;

  const modoR = modoRoteamentoAtual();
  if (lblPub) lblPub.textContent = modoUsaSeletorMonitorUnificado() ? 'Monitor' : 'Público';

  const items = [{ value: '-1', label: 'Não exibir' }];
  const lista = Array.isArray(monitores) ? monitores : [];
  lista.forEach((m) => {
    if (m && m.primary) return;
    items.push({ value: String(m.index), label: montarLabelMonitor(m), title: montarTitleMonitor(m) });
  });

  /**
   * Tira este monitor da outra saída — ver `rotaSemMonitorRepetido`.
   *
   * Mexe no DOM da outra coluna (valor, rótulo e `aria-selected`) porque a troca tem de
   * ser visível no mesmo instante do clique: o operador escolhe o M2 no Ministrante e vê o
   * Público passar a «Não exibir» sem ter de reabrir o menu. O `salvarRoteamento…` que
   * corre logo a seguir lê os dois campos, por isso as duas saídas vão coerentes.
   *
   * @param {HTMLElement} outroMenu
   * @param {HTMLInputElement} outroHid
   * @param {HTMLElement} outroDisp
   * @param {string} valorEscolhido
   */
  function libertarMonitorDaOutraSaida(outroMenu, outroHid, outroDisp, valorEscolhido) {
    if (!outroMenu || !outroHid || !outroDisp) return;
    if (valorEscolhido === '-1') return;
    if (outroHid.value !== valorEscolhido) return;
    outroHid.value = '-1';
    outroDisp.textContent = 'Não exibir';
    outroMenu.querySelectorAll('.route-dd-item').forEach((ib) => {
      ib.setAttribute('aria-selected', ib.dataset.value === '-1' ? 'true' : 'false');
    });
  }

  function preencherMenu(menuEl, hidEl, dispEl, valorSelecionado, outros = null) {
    menuEl.innerHTML = '';
    const vSel = String(valorSelecionado);
    items.forEach(({ value, label, title }) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'route-dd-item';
      b.dataset.value = value;
      b.textContent = label;
      if (title) b.title = title;
      b.setAttribute('aria-selected', String(value) === vSel ? 'true' : 'false');
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        hidEl.value = value;
        dispEl.textContent = label;
        menuEl.querySelectorAll('.route-dd-item').forEach((ib) => {
          ib.setAttribute('aria-selected', ib.dataset.value === String(value) ? 'true' : 'false');
        });
        if (outros) {
          libertarMonitorDaOutraSaida(outros.menu, outros.hid, outros.disp, String(value));
        }
        fecharMenusRoteamentoTelas();
        atualizarEstiloRotasDesativadas();
        /* Qual das duas saídas o operador mexeu. Só ela conta como «Não exibir» à mão —
           ver `sincronizarNaoExibirManualSlidesDaEscolha`. */
        salvarRoteamentoTelasNoServidor({
          canalEscolhido: hidEl === hidMin ? 'ministrante' : 'publico',
        });
      });
      li.appendChild(b);
      menuEl.appendChild(li);
    });
  }

  if (modoUsaSeletorMonitorUnificado()) {
    menuMin.innerHTML = '';
    if (!lista.length) {
      hidPub.value = '-1';
      hidMin.value = '-1';
      dispPub.textContent = 'Não exibir';
      dispMin.textContent = 'Não exibir';
      const op0 = opcoesRoteamentoUnificadoModoApresentacao(
        lista,
        opcoesSeletorCabecalhoDoModoAtual()
      );
      menuPub.innerHTML = '';
      op0.forEach((o) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'presentation');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'route-dd-item';
        b.dataset.apOp = o.key;
        b.textContent = o.label;
        b.setAttribute('aria-selected', o.key === 'des' ? 'true' : 'false');
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          hidPub.value = String(o.pub);
          hidMin.value = String(o.min);
          marcarRotaLiveNoDom(!!o.live);
          dispPub.textContent = o.label;
          menuPub.querySelectorAll('.route-dd-item').forEach((ib) => {
            ib.setAttribute('aria-selected', ib.dataset.apOp === o.key ? 'true' : 'false');
          });
          fecharMenusRoteamentoTelas();
          atualizarEstiloRotasDesativadas();
          salvarRoteamentoTelasNoServidor();
          atualizarIndicadorProjecaoLiveUi();
        });
        li.appendChild(b);
        menuPub.appendChild(li);
      });
      marcarRotaLiveNoDom(false);
      atualizarEstiloRotasDesativadas();
      aplicarPreviewPainelOcultoNoDom();
      atualizarIndicadorProjecaoLiveUi();
      return;
    }

    const rLive = !!(routing && routing.live);
    let pub = rLive ? -1 : indiceRoteamentoMonitorNaUi(routing?.publicoIndex);
    let min = rLive ? -1 : indiceRoteamentoMonitorNaUi(routing?.ministranteIndex);
    pub = sanitizarIndiceMonitorProjecao(pub, lista);
    min = sanitizarIndiceMonitorProjecao(min, lista);
    marcarRotaLiveNoDom(rLive);

    const opcoes = opcoesRoteamentoUnificadoModoApresentacao(
      lista,
      opcoesSeletorCabecalhoDoModoAtual()
    );
    const combina = (o) => !!o.live === rLive && (o.live || (o.pub === pub && o.min === min));
    const preset = opcoes.find(combina);
    const rotuloBtn = preset
      ? preset.label
      : rotuloRotaApresentacaoForaDoPreset(
          { publicoIndex: pub, ministranteIndex: min, live: rLive },
          lista
        );
    hidPub.value = String(pub);
    hidMin.value = String(min);
    dispPub.textContent = rotuloBtn;
    const rotMin = items.find((x) => x.value === String(min));
    dispMin.textContent = rotMin ? rotMin.label : 'Não exibir';

    menuPub.innerHTML = '';
    opcoes.forEach((o) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'route-dd-item';
      b.dataset.apOp = o.key;
      b.textContent = o.label;
      b.setAttribute('aria-selected', combina(o) ? 'true' : 'false');
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        hidPub.value = String(o.pub);
        hidMin.value = String(o.min);
        marcarRotaLiveNoDom(!!o.live);
        dispPub.textContent = o.label;
        menuPub.querySelectorAll('.route-dd-item').forEach((ib) => {
          ib.setAttribute('aria-selected', ib.dataset.apOp === o.key ? 'true' : 'false');
        });
        fecharMenusRoteamentoTelas();
        atualizarEstiloRotasDesativadas();
        /* O reenvio tem de esperar pelo PUT: as janelas do canal novo só existem depois de
           o servidor sincronizar a rota, e conteúdo enviado antes disso cai no vazio. */
        /* Antes do PUT, e a partir do DOM que o clique acabou de escrever: é este o único
           sítio onde se sabe que foi o operador a escolher. */
        registrarEscolhaMonitorDoOperador();
        /* E é também o único sítio onde se sabe que o «Não exibir» é ORDEM do operador, e
           não o −1 que um caminho automático deixou. Ver `modules/ordemNaoExibirUnificado.js`. */
        registrarEscolhaSeletorUnificado(modoRoteamentoAtual(), o.key);
        salvarRoteamentoTelasNoServidor()
          .then(() => reemitirConteudoAposMudancaDeRotaUnificada())
          .catch(() => {
            // intencional — falha de rede já é reportada por quem faz o PUT
          });
        atualizarIndicadorProjecaoLiveUi();
      });
      li.appendChild(b);
      menuPub.appendChild(li);
    });
    atualizarEstiloRotasDesativadas();
    aplicarPreviewPainelOcultoNoDom();
    atualizarIndicadorProjecaoLiveUi();
    return;
  }

  if (!lista.length) {
    hidPub.value = '-1';
    hidMin.value = '-1';
    dispPub.textContent = 'Não exibir';
    dispMin.textContent = 'Não exibir';
    preencherMenu(menuPub, hidPub, dispPub, '-1');
    preencherMenu(menuMin, hidMin, dispMin, '-1');
    atualizarEstiloRotasDesativadas();
    aplicarPreviewPainelOcultoNoDom();
    return;
  }

  let pub = indiceRoteamentoMonitorNaUi(routing?.publicoIndex);
  let min = indiceRoteamentoMonitorNaUi(routing?.ministranteIndex);
  pub = sanitizarIndiceMonitorProjecao(pub, lista);
  min = sanitizarIndiceMonitorProjecao(min, lista);
  /* Rota gravada antes desta regra podia ter o mesmo monitor nas duas saídas. Mostrar isso
     tal e qual deixaria o operador a olhar para uma configuração que o motor não consegue
     cumprir. Resolve-se aqui, com o Público a prevalecer. */
  ({ publicoIndex: pub, ministranteIndex: min } = rotaSemMonitorRepetido(
    { publicoIndex: pub, ministranteIndex: min },
    'publico'
  ));

  const pubStr = String(pub);
  const minStr = String(min);
  const rotPub = items.find((x) => x.value === pubStr);
  const rotMin = items.find((x) => x.value === minStr);
  hidPub.value = pubStr;
  hidMin.value = minStr;
  dispPub.textContent = rotPub ? rotPub.label : 'Não exibir';
  dispMin.textContent = rotMin ? rotMin.label : 'Não exibir';

  preencherMenu(menuPub, hidPub, dispPub, pubStr, {
    menu: menuMin,
    hid: hidMin,
    disp: dispMin,
  });
  preencherMenu(menuMin, hidMin, dispMin, minStr, {
    menu: menuPub,
    hid: hidPub,
    disp: dispPub,
  });
  atualizarEstiloRotasDesativadas();
  aplicarPreviewPainelOcultoNoDom();
}

/** Destaque vermelho quando a rota está em «Não exibir» (sem telão/TV externos — só pré-visualizações). */
export function atualizarEstiloRotasDesativadas() {
  const wrapPub = document.getElementById('route-publico-dd');
  const wrapMin = document.getElementById('route-ministrante-dd');
  const hidPub = document.getElementById('route-publico');
  const hidMin = document.getElementById('route-ministrante');
  const btnPub = document.getElementById('route-publico-btn');
  const btnMin = document.getElementById('route-ministrante-btn');
  const modoUnificado = modoUsaSeletorMonitorUnificado();
  /* Monitor emprestado ao canal partilhado — Mídias ou Bíblia: o seletor do Slides
     mostra-o apagado em vez de deixar mudá-lo por baixo da projeção no ar. */
  const bloqPubAp = ehModoSlidesOperador() && canalPublicoOcupadoPorOutroModoNoSlides();
  const bloqMinAp = ehModoSlidesOperador() && canalMinistranteOcupadoPorOutroModoNoSlides();
  if (wrapPub && hidPub && hidMin) {
    const des = modoUnificado
      ? hidPub.value === '-1' && hidMin.value === '-1' && !rotaLiveSelecionadaNaUi()
      : hidPub.value === '-1';
    wrapPub.classList.toggle('route-dd--rota-desativada', des);
    wrapPub.classList.toggle('route-dd--rota-live', modoUnificado && rotaLiveSelecionadaNaUi());
    wrapPub.classList.toggle('route-dd--bloqueado-apresentacao', bloqPubAp);
    if (btnPub) {
      btnPub.disabled = bloqPubAp;
      btnPub.title = bloqPubAp
        ? rotuloBloqueioMonitorOcupado()
        : des
          ? modoUnificado
            ? 'Não exibir: nenhum monitor externo disponível para este modo.'
            : 'Não exibir: o monitor continua ligado, mas não recebe conteúdo deste modo — só a pré-visualização deste painel.'
          : modoUnificado
            ? 'Onde projetar (público, ministrante ou ambos).'
            : 'Escolher monitor do telão / público';
    }
  }
  if (wrapMin && hidMin) {
    /* Com um só monitor de projeção não há segunda saída para dar ao ministrante: o
       seletor fica desativado em vez de oferecer uma escolha que colidiria com o telão. */
    const semSegundaSaida = !modoUnificado && contarMonitoresDeProjecao() <= 1;
    if (semSegundaSaida && hidMin.value !== '-1') hidMin.value = '-1';
    const des = hidMin.value === '-1';
    wrapMin.classList.toggle('route-dd--rota-desativada', des && !semSegundaSaida);
    wrapMin.classList.toggle('route-dd--sem-monitor', semSegundaSaida);
    wrapMin.classList.toggle('route-dd--bloqueado-apresentacao', bloqMinAp);
    const dispMin = document.getElementById('route-ministrante-display');
    if (semSegundaSaida && dispMin) dispMin.textContent = 'Nenhum';
    if (btnMin) {
      btnMin.disabled = bloqMinAp || semSegundaSaida;
      btnMin.title = semSegundaSaida
        ? 'Só há um monitor de projeção disponível — ele está reservado ao telão. Ligue um segundo monitor para usar o retorno do ministrante.'
        : bloqMinAp
          ? rotuloBloqueioMonitorOcupado()
          : des
            ? 'Não exibir: o monitor continua ligado, mas não recebe conteúdo deste modo — só a pré-visualização deste painel.'
            : 'Escolher monitor do ministrante / retorno';
    }
  }
}

/** Texto do seletor bloqueado: nomeia o modo que está a ocupar o monitor. */
function rotuloBloqueioMonitorOcupado() {
  const ehBiblia =
    bibliaProjecaoAtivaNoCanalPublico() || bibliaProjecaoAtivaNoCanalMinistrante();
  const modoQueOcupa = ehBiblia ? 'a Bíblia' : 'a Apresentação';
  return `Bloqueado: ${modoQueOcupa} está a projetar neste monitor — encerre essa projeção para alterar.`;
}

/** Quantos monitores restam para projeção depois de reservar o principal ao operador. */
function contarMonitoresDeProjecao() {
  return listaMonitoresParaProjecao(dep.getMonitoresServidorCache()).length;
}

export function rotaSelecionadaNaUi() {
  const selPublico = document.getElementById('route-publico');
  const selMin = document.getElementById('route-ministrante');
  if (!selPublico || !selMin) return null;
  const live = rotaLiveSelecionadaNaUi();
  const publicoIndex = parseInt(selPublico.value, 10);
  const ministranteIndex = parseInt(selMin.value, 10);
  if (!Number.isFinite(publicoIndex) || !Number.isFinite(ministranteIndex)) return null;
  return { publicoIndex: live ? -1 : publicoIndex, ministranteIndex: live ? -1 : ministranteIndex, live };
}

export async function aplicarRotaDoModoAtualNaUiEServidor(opts = {}) {
  const sincronizarServidor = opts.sincronizarServidor !== false;
  const modo = modoRoteamentoAtual();

  const rotaAjustada =
    modo === 'slides'
      ? obterRotaSlidesParaUi()
      : sanitizarRotaProjecao(normalizarRota(dep.getRotasPorModo()[modo]), dep.getMonitoresServidorCache());
  salvarRotasPorModoNoStorage();
  renderRoteamentoTelas(dep.getMonitoresServidorCache(), rotaAjustada);
  if (sincronizarServidor) {
    await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
  }
}
