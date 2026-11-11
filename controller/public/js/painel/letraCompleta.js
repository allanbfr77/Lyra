/**
 * Modo «letra completa» da coluna central: texto corrido da música, guias de estrofe, detecção de
 * edição pendente e alternância com a grade de slides. Movido verbatim do núcleo
 * (`controllerAppCore.js`); o que o núcleo ainda possui entra por `registrarDependenciasLetraCompleta`.
 */
import { appAlert, appConfirm } from './appDialog.js';
import { estadoPainel, projecao } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasLetraCompleta(d) {
  dep = d || {};
}
const atualizarPreviewOperador = (...a) => dep.atualizarPreviewOperador(...a);
const atualizarToolbarModoEdicao = (...a) => dep.atualizarToolbarModoEdicao(...a);
const ehModoSlidesOperador = (...a) => dep.ehModoSlidesOperador(...a);
const marcacaoEstrofeEditor = (...a) => dep.marcacaoEstrofeEditor(...a);
const metadadosMusicaSujosNaHome = (...a) => dep.metadadosMusicaSujosNaHome(...a);
const montarPayloadExibirMusica = (...a) => dep.montarPayloadExibirMusica(...a);
const renderSlidesStrip = (...a) => dep.renderSlidesStrip(...a);
const splitTextoEmEstrofesPorLinhaVaziaStrict = (...a) => dep.splitTextoEmEstrofesPorLinhaVaziaStrict(...a);
const aplicarLayoutModoComparativo = (...a) => dep.aplicarLayoutModoComparativo(...a);
const comparativoSujoVsSnapshot = (...a) => dep.comparativoSujoVsSnapshot(...a);
const persistirMusicaAtivaNoServidor = (...a) => dep.persistirMusicaAtivaNoServidor(...a);
const renderEstrofesEditor = (...a) => dep.renderEstrofesEditor(...a);
const sairModoComparativoParaTrocarModo = (...a) => dep.sairModoComparativoParaTrocarModo(...a);
const sincronizarFlagCaixaLetrasComTextoAtual = (...a) => dep.sincronizarFlagCaixaLetrasComTextoAtual(...a);

function juntarEstrofesParaLetraCompleta() {
  if (!estadoPainel.musicaAtiva?.estrofes) return '';
  return estadoPainel.musicaAtiva.estrofes
    .map((s) => String(s ?? '').replace(/\r\n/g, '\n').replace(/\s+$/, ''))
    .join('\n\n');
}

/** Converte o texto do painel «letra completa» de volta em estrofes (mesma regra de linhas vazias do resto do sistema). */
export function splitTextoLetraCompletaEmEstrofes(texto) {
  return splitTextoEmEstrofesPorLinhaVaziaStrict(texto);
}

/**
 * Divisórias entre estrofes no modo «letra completa».
 *
 * Um `<textarea>` desenha apenas texto puro, portanto as linhas não podem ser filhas dele.
 * A alternativa seria trocá-lo por blocos `contenteditable`, o que sacrificaria o histórico
 * de desfazer nativo, o IME e a colagem sanitizada. Em vez disso desenha-se numa camada por
 * baixo, e o textarea — que continua a ser a única fonte de verdade — fica transparente.
 *
 * Para saber onde cai cada linha em branco (que pode estar deslocada por quebras suaves de
 * linhas longas), o texto é reproduzido num espelho invisível que copia as métricas
 * tipográficas do textarea em tempo de execução, via `getComputedStyle`. Copiar em vez de
 * duplicar valores no CSS evita que as guias se desalinhem se a tipografia do painel mudar.
 *
 * Nada aqui lê ou escreve `musicaAtiva`: é estritamente decorativo.
 */
export const guiasEstrofesLetraCompleta = (() => {
  /**
   * Propriedades que afetam a disposição do texto e têm de ser idênticas no espelho.
   * As larguras de borda ficam de fora de propósito: a camada `.centro-letra-completa-guias`
   * já tem uma borda transparente da mesma espessura, e o filho posicionado em absoluto
   * ancora no interior dela — copiá-las aqui contaria o desvio duas vezes.
   */
  const PROPS_METRICA = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent', 'textTransform',
    'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ];

  let espelho = null;
  let desloca = null;
  let agendado = false;
  /* Recuos e colunas laterais (número do slide / contador) vêm das variáveis --lc-* do textarea
     em home.css (grade 44px | 1fr | 72px), para CSS e JS nunca divergirem. */
  /** Estrofes da última renderização: corridas de linhas não vazias (índices de linha do textarea). */
  let estrofesRuns = [];

  function elementos() {
    const ta = document.getElementById('centro-letra-completa-ta');
    const guias = document.getElementById('centro-letra-completa-guias');
    if (!ta || !guias) return null;
    if (!desloca || desloca.parentNode !== guias) {
      guias.innerHTML = '';
      desloca = document.createElement('div');
      desloca.className = 'centro-letra-completa-guias-desloca';
      espelho = document.createElement('div');
      espelho.className = 'centro-letra-completa-espelho';
      desloca.appendChild(espelho);
      guias.appendChild(desloca);
    }
    return { ta, guias };
  }

  /**
   * Índices das linhas em branco que separam de facto duas estrofes.
   * Espelha `splitTextoEmEstrofesPorLinhaVaziaStrict`: uma corrida de vazias é
   * um único corte. A guia vai na ÚLTIMA vazia da corrida — assim um Enter no
   * fim do slide (ainda no mesmo bloco) empurra a linha para baixo, em vez de
   * a deixar colada à última frase. Dois Enters no fim (duas vazias) marcam
   * slide novo; um Enter pendurado não.
   * @param {string[]} linhas
   * @returns {number[]}
   */
  function indicesLinhasSeparadoras(linhas) {
    const idx = [];
    let viuConteudo = false;
    let inicioCorrida = -1;
    for (let i = 0; i < linhas.length; i++) {
      if (linhas[i] === '') {
        if (viuConteudo && inicioCorrida === -1) inicioCorrida = i;
        continue;
      }
      if (inicioCorrida !== -1) idx.push(i - 1);
      inicioCorrida = -1;
      viuConteudo = true;
    }
    if (inicioCorrida !== -1 && linhas.length - inicioCorrida >= 2) {
      idx.push(linhas.length - 1);
    }
    return idx;
  }

  function desenhar() {
    agendado = false;
    const els = elementos();
    if (!els) return;
    const { ta, guias } = els;
    if (!estadoPainel.modoLetraCompletaCentral || guias.offsetParent === null) {
      if (espelho) espelho.textContent = '';
      if (desloca) {
        desloca.querySelectorAll('.centro-letra-completa-guia, [data-estrofe]').forEach((n) => n.remove());
      }
      return;
    }

    const cs = getComputedStyle(ta);
    PROPS_METRICA.forEach((p) => {
      espelho.style[p] = cs[p];
    });
    /* O fluxo contínuo com <span> vazio não gerava caixa de linha: o offsetTop
       ficava preso e as guias não acompanhavam o Enter. Cada linha do textarea
       vira um bloco — linhas longas continuam a quebrar com as mesmas métricas. */
    espelho.style.whiteSpace = 'pre-wrap';
    espelho.style.overflowWrap = 'break-word';
    espelho.style.wordBreak = 'normal';
    /* `clientWidth` já exclui a barra de deslocamento — a largura útil bate certo. */
    espelho.style.width = `${ta.clientWidth}px`;
    espelho.style.border = '0';
    desloca.style.width = `${ta.clientWidth}px`;

    const linhas = String(ta.value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');
    const separadoras = indicesLinhasSeparadoras(linhas);
    const alvo = new Set(separadoras);

    desloca.querySelectorAll('.centro-letra-completa-guia, [data-estrofe]').forEach((n) => n.remove());
    espelho.textContent = '';
    const marcas = [];
    linhas.forEach((linha, i) => {
      const row = document.createElement('div');
      row.className = 'centro-letra-completa-espelho-linha';
      /* NBSP na linha vazia: sem caractere o bloco colapsa e o offset mente. */
      row.textContent = linha === '' ? '\u00a0' : linha;
      espelho.appendChild(row);
      if (alvo.has(i)) {
        row.dataset.i = String(i);
        marcas.push(row);
      }
    });

    const alturaLinha = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    /* Linhas de largura total: recuos e larguras laterais lidos das variáveis CSS do textarea. */
    const larg = ta.clientWidth;
    const px = (nome, padrao) => {
      const v = parseFloat(cs.getPropertyValue(nome));
      return Number.isFinite(v) ? v : padrao;
    };
    const insEsq = px('--lc-ins-e', 20);
    const insDir = px('--lc-ins-d', 24);
    const alturaTotal = espelho.offsetHeight;

    /* Estrofes = corridas de linhas não vazias (a mesma regra de splitTextoEmEstrofesPorLinhaVaziaStrict). */
    estrofesRuns = [];
    let ini = -1;
    linhas.forEach((l, i) => {
      if (l === '') {
        if (ini !== -1) {
          estrofesRuns.push({ ini, fim: i - 1 });
          ini = -1;
        }
      } else if (ini === -1) ini = i;
    });
    if (ini !== -1) estrofesRuns.push({ ini, fim: linhas.length - 1 });

    /* Todas as leituras de layout do espelho primeiro, depois as escritas no DOM visual. */
    const geo = estrofesRuns.map((r) => {
      const primeira = espelho.children[r.ini];
      const ultima = espelho.children[r.fim];
      if (!primeira || !ultima) return null;
      return { topo: primeira.offsetTop };
    });
    /* Y de cada divisor (meio da linha em branco que separa), indexado pela estrofe que vem antes dele. */
    const divisorApos = [];
    const reguas = marcas.map((marca) => {
      const h = marca.offsetHeight || alturaLinha;
      const i = Number(marca.dataset.i);
      const apos = estrofesRuns.filter((r) => r.fim < i).length - 1;
      const y = Math.round(marca.offsetTop + h / 2);
      divisorApos[apos] = y;
      return { apos, y };
    });
    const frag = document.createDocumentFragment();
    geo.forEach((g, k) => {
      if (!g) return;
      /* O destaque ocupa a altura inteira da linha da estrofe: de divisor a divisor. */
      const yTopo = k === 0 ? 0 : divisorApos[k - 1] ?? g.topo - 16;
      const yBase = divisorApos[k] ?? alturaTotal;
      const fundo = document.createElement('div');
      fundo.className = 'centro-letra-completa-estrofe-fundo';
      fundo.dataset.estrofe = String(k);
      fundo.style.cssText = `top:${yTopo}px;height:${Math.max(0, yBase - yTopo)}px;left:0;width:${larg}px`;
      const num = document.createElement('span');
      num.className = 'centro-letra-completa-estrofe-num';
      num.dataset.estrofe = String(k);
      num.textContent = String(k + 1);
      num.style.cssText = `top:${Math.round(g.topo + 2)}px;left:${insEsq}px`;
      const cont = document.createElement('span');
      cont.className = 'centro-letra-completa-estrofe-cont';
      cont.dataset.estrofe = String(k);
      cont.textContent = `${estrofesRuns[k].fim - estrofesRuns[k].ini + 1} linhas`;
      cont.style.cssText = `top:${g.topo}px;height:${alturaLinha}px;right:${insDir}px`;
      frag.append(fundo, num, cont);
    });
    reguas.forEach(({ apos, y }) => {
      const regua = document.createElement('div');
      regua.className = 'centro-letra-completa-guia';
      regua.dataset.apos = String(apos);
      regua.style.top = `${y}px`;
      regua.style.left = '0';
      regua.style.width = `${larg}px`;
      regua.style.right = 'auto';
      frag.appendChild(regua);
    });
    desloca.appendChild(frag);

    desloca.style.transform = `translateY(${-ta.scrollTop}px)`;
    atualizarAtiva();
  }

  /** Estrofe que contém o cursor (só com o textarea em foco): destaque dourado, sem tocar no texto. */
  function atualizarAtiva() {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (!ta || !desloca) return;
    let ativa = -1;
    if (document.activeElement === ta && estrofesRuns.length) {
      const pos = ta.selectionStart ?? 0;
      let linha = 0;
      const v = ta.value;
      for (let p = v.indexOf(String.fromCharCode(10)); p !== -1 && p < pos; p = v.indexOf(String.fromCharCode(10), p + 1)) linha++;
      ativa = estrofesRuns.findIndex((r) => linha >= r.ini && linha <= r.fim);
    }
    desloca.querySelectorAll('[data-estrofe]').forEach((el) => {
      el.classList.toggle('ativa', Number(el.dataset.estrofe) === ativa);
    });
    /* O divisor logo abaixo da estrofe ativa some, para não duplicar linhas com o destaque. */
    desloca.querySelectorAll('.centro-letra-completa-guia').forEach((g) => {
      g.classList.toggle('oculta', Number(g.dataset.apos) === ativa);
    });
  }

  function sincronizarDeslocamento() {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (!ta || !desloca) return;
    desloca.style.transform = `translateY(${-ta.scrollTop}px)`;
  }

  /** Recalcula na próxima pintura (agrupa rajadas de `input`). */
  function agendar() {
    if (agendado) return;
    agendado = true;
    const pintar = () => {
      desenhar();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        pintar();
        /* O Enter pode mostrar a barra de deslocamento só no frame seguinte. */
        requestAnimationFrame(pintar);
      });
    } else setTimeout(pintar, 0);
  }

  function ligar() {
    const els = elementos();
    if (!els) return;
    const { ta } = els;
    if (ta.dataset.guiasLigadas === '1') {
      agendar();
      return;
    }
    ta.dataset.guiasLigadas = '1';
    ta.addEventListener('input', agendar);
    ta.addEventListener('keyup', agendar);
    ta.addEventListener('paste', agendar);
    ta.addEventListener('cut', agendar);
    ta.addEventListener('scroll', sincronizarDeslocamento, { passive: true });
    ta.addEventListener('focus', atualizarAtiva);
    ta.addEventListener('blur', atualizarAtiva);
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === ta) atualizarAtiva();
    });
    /* A métrica muda quando a fonte (Poppins) termina de carregar: remede tudo. */
    if (document.fonts) {
      document.fonts.addEventListener('loadingdone', agendar);
      document.fonts.ready.then(agendar);
    }
    window.addEventListener('resize', agendar);
    if (typeof ResizeObserver === 'function') {
      /* Recalcula se a caixa mudar de tamanho (redimensionar a janela / o painel). */
      new ResizeObserver(agendar).observe(ta);
    }
    agendar();
  }

  return { ligar, agendar };
})();

export function atualizarTextoPainelLetraCompleta() {
  const ta = document.getElementById('centro-letra-completa-ta');
  if (!ta || !estadoPainel.musicaAtiva?.estrofes) return;
  if (!estadoPainel.modoLetraCompletaCentral) return;
  const novo = juntarEstrofesParaLetraCompleta();
  if (ta.value === novo) return;
  ta.value = novo;
  guiasEstrofesLetraCompleta.agendar();
}

/**
 * @param {{ preencherTextarea?: boolean }} opts — Se true, preenche o textarea a partir de `musicaAtiva.estrofes` (ex.: ao abrir o modo). Se false, só ajusta visibilidade (não apaga o que o utilizador está a editar).
 */
export function aplicarLayoutModoLetraCompleta(opts = {}) {
  const preencherTextarea = opts.preencherTextarea === true;
  const ed = document.getElementById('estrofes-slide-editor');
  const full = document.getElementById('centro-letra-completa-wrap');
  if (!ed || !full) return;
  if (!estadoPainel.musicaAtiva) {
    estadoPainel.modoLetraCompletaCentral = false;
    estadoPainel.snapshotLetraCompleta = null;
    full.hidden = true;
    ed.style.display = '';
    /* Sem música não há o que comparar — o painel comparativo também sai. */
    if (estadoPainel.modoComparativoCentral) {
      estadoPainel.modoComparativoCentral = false;
      estadoPainel.comparativoLados = null;
      estadoPainel.snapshotComparativo = null;
      aplicarLayoutModoComparativo();
    }
    return;
  }
  const on = estadoPainel.modoLetraCompletaCentral;
  full.hidden = !on;
  ed.style.display = on ? 'none' : '';
  if (on && preencherTextarea) atualizarTextoPainelLetraCompleta();
  /* As guias só medem com o painel visível — (re)calcular sempre que ele alterna. */
  if (on) guiasEstrofesLetraCompleta.ligar();
  else guiasEstrofesLetraCompleta.agendar();
  /* O MODO COMPARATIVO tem painel próprio e manda no layout enquanto estiver
     activo — nem os cartões por slide nem a letra completa podem reaparecer. */
  if (estadoPainel.modoComparativoCentral) {
    ed.style.display = 'none';
    full.hidden = true;
  }
}

/** Grava o conteúdo do textarea de letra completa em `musicaAtiva.estrofes` e atualiza faixa/previews. */
export function sincronizarEstrofesDesdeTextareaLetraCompleta() {
  if (!estadoPainel.musicaAtiva) return;
  const ta = document.getElementById('centro-letra-completa-ta');
  if (!ta) return;
  const novas = splitTextoLetraCompletaEmEstrofes(ta.value);
  estadoPainel.musicaAtiva.estrofes = novas;
  const n = novas.length;
  const idxPreto = n;
  if (estadoPainel.estrofeAtiva > idxPreto) estadoPainel.estrofeAtiva = idxPreto;
  if (estadoPainel.estrofeAtiva < -1) estadoPainel.estrofeAtiva = -1;
  renderSlidesStrip();
  atualizarPreviewOperador();
  renderEstrofesEditor();
  marcacaoEstrofeEditor();
  if (
    estadoPainel.projecaoMusicaEmitidaNoServidor &&
    projecao.pronta() &&
    estadoPainel.estrofeAtiva >= 0 &&
    estadoPainel.estrofeAtiva < n
  ) {
    projecao.enviar('exibir_musica', montarPayloadExibirMusica(estadoPainel.estrofeAtiva));
  }
}

function normalizarEstrofesParaCmp(arr) {
  return (arr || []).map((s) => String(s ?? '').replace(/\r\n/g, '\n'));
}

export function estrofesArraysIguaisParaEdicao(a, b) {
  const aa = normalizarEstrofesParaCmp(a);
  const bb = normalizarEstrofesParaCmp(b);
  if (aa.length !== bb.length) return false;
  return aa.every((s, i) => s === bb[i]);
}

/** Estrofes atuais do editor por slides (textareas) ou de `musicaAtiva`. */
function obterEstrofesAtuaisDaEdicao() {
  if (!estadoPainel.musicaAtiva) return [];
  if (estadoPainel.modoEdicaoEstrofes) {
    const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
    if (tas.length) {
      const novas = [];
      for (const ta of tas) novas.push(...splitTextoEmEstrofesPorLinhaVaziaStrict(ta.value));
      return novas.length ? novas : [''];
    }
  }
  if (estadoPainel.modoLetraCompletaCentral) {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (ta) return splitTextoLetraCompletaEmEstrofes(ta.value);
  }
  return (estadoPainel.musicaAtiva.estrofes || []).map((s) => String(s ?? ''));
}

export function letraCompletaSujaVsSnapshot() {
  if (!estadoPainel.modoLetraCompletaCentral || !estadoPainel.snapshotLetraCompleta) return false;
  const ta = document.getElementById('centro-letra-completa-ta');
  if (!ta) return false;
  return !estrofesArraysIguaisParaEdicao(
    splitTextoLetraCompletaEmEstrofes(ta.value),
    estadoPainel.snapshotLetraCompleta.estrofes
  );
}

export function edicaoEstrofesSujaVsSnapshot() {
  if (!estadoPainel.modoEdicaoEstrofes || !estadoPainel.musicaAtiva || !estadoPainel.snapshotEdicaoEstrofes) return false;
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  const titulo = et ? et.value : String(estadoPainel.musicaAtiva.titulo || '');
  const artista = ea ? ea.value : String(estadoPainel.musicaAtiva.artista || '');
  if (titulo !== String(estadoPainel.snapshotEdicaoEstrofes.titulo || '')) return true;
  if (artista !== String(estadoPainel.snapshotEdicaoEstrofes.artista || '')) return true;
  return !estrofesArraysIguaisParaEdicao(obterEstrofesAtuaisDaEdicao(), estadoPainel.snapshotEdicaoEstrofes.estrofes);
}

export function temEdicaoMusicaNaoGravada() {
  if (metadadosMusicaSujosNaHome()) return true;
  if (edicaoEstrofesSujaVsSnapshot()) return true;
  if (letraCompletaSujaVsSnapshot()) return true;
  if (comparativoSujoVsSnapshot()) return true;
  return false;
}

export function limparFlagsModoEdicaoMusica() {
  estadoPainel.homeLayout?.closeMetadata();
  estadoPainel.snapshotEdicaoEstrofes = null;
  estadoPainel.modoEdicaoEstrofes = false;
  estadoPainel.snapshotLetraCompleta = null;
  estadoPainel.modoLetraCompletaCentral = false;
  estadoPainel.modoComparativoCentral = false;
  estadoPainel.comparativoLados = null;
  estadoPainel.snapshotComparativo = null;
  aplicarLayoutModoComparativo();
  aplicarLayoutModoLetraCompleta();
}

/**
 * Se houver edições só em memória, pede confirmação antes de trocar de música/contexto.
 * @param {string} [mensagem]
 * @param {string} [titulo]
 * @param {{ manterLetraCompleta?: boolean }} [opts] — Clique na Biblioteca/Playlist no
 *   Home: não sai da letra corrida (evita montar a grade só para a esconder de novo).
 * @returns {Promise<boolean>} true para prosseguir (descartando ou sem sujo).
 */
export async function confirmarProsseguirDescartandoEdicaoPendente(mensagem, titulo, opts) {
  const manterLetra = !!(opts && opts.manterLetraCompleta);
  if (!temEdicaoMusicaNaoGravada()) {
    if (estadoPainel.modoEdicaoEstrofes || estadoPainel.modoLetraCompletaCentral || estadoPainel.modoComparativoCentral) {
      if (manterLetra && estadoPainel.modoLetraCompletaCentral && !estadoPainel.modoEdicaoEstrofes && !estadoPainel.modoComparativoCentral) {
        estadoPainel.snapshotLetraCompleta = null;
        return true;
      }
      limparFlagsModoEdicaoMusica();
    }
    return true;
  }
  const ok = await appConfirm(
    mensagem || 'Há alterações não gravadas nesta sessão. Descartar e continuar?',
    titulo || 'Alterações não gravadas'
  );
  if (!ok) return false;
  if (manterLetra) {
    estadoPainel.snapshotEdicaoEstrofes = null;
    estadoPainel.modoEdicaoEstrofes = false;
    estadoPainel.snapshotLetraCompleta = null;
    estadoPainel.modoComparativoCentral = false;
    estadoPainel.comparativoLados = null;
    estadoPainel.snapshotComparativo = null;
    aplicarLayoutModoComparativo();
    aplicarLayoutModoLetraCompleta();
  } else {
    limparFlagsModoEdicaoMusica();
  }
  return true;
}

/** Entra no modo letra completa (o mesmo do botão da barra). Salvar/cancelar continua a sair para a grade.
 *  Se já estiver neste modo, só atualiza o texto da música atual. */
export function entrarModoLetraCompletaCentral() {
  if (!estadoPainel.musicaAtiva) return;
  estadoPainel.modoLetraCompletaCentral = true;
  estadoPainel.letraCompletaEditando = false; // abre sempre em visualização
  aplicarLayoutModoLetraCompleta({ preencherTextarea: true });
  /* Snapshot do texto já no painel — o ida-e-volta juntar/partir não conta como sujo. */
  const ta = document.getElementById('centro-letra-completa-ta');
  estadoPainel.snapshotLetraCompleta = {
    estrofes: ta
      ? splitTextoLetraCompletaEmEstrofes(ta.value)
      : estadoPainel.musicaAtiva.estrofes.map((s) => String(s ?? '')),
    estrofeAtiva: estadoPainel.estrofeAtiva,
  };
  sincronizarFlagCaixaLetrasComTextoAtual();
  atualizarToolbarModoEdicao();
}

export async function alternarModoLetraCompletaCentral() {
  if (!estadoPainel.musicaAtiva) return;
  if (estadoPainel.modoLetraCompletaCentral) {
    const suja = letraCompletaSujaVsSnapshot() || metadadosMusicaSujosNaHome();
    // Captura titulo/artista dos inputs ANTES da sincronizacao: renderEstrofesEditor()
    // (chamado dentro da sync) sobrescreve os inputs com musicaAtiva.titulo/artista,
    // apagando as edicoes do usuario antes de persistirMusicaAtivaNoServidor() le-las.
    const _etLC = document.getElementById('edit-titulo');
    const _eaLC = document.getElementById('edit-artista');
    if (_etLC) estadoPainel.musicaAtiva.titulo = _etLC.value;
    if (_eaLC) estadoPainel.musicaAtiva.artista = _eaLC.value;
    sincronizarEstrofesDesdeTextareaLetraCompleta();
    if (suja) {
      if (estadoPainel.musicaBancoFonte === 'catalog') {
        await appAlert(
          'Música do catálogo: as alterações ficam só nesta sessão. Importe para o seu banco para gravar de forma permanente.',
          'Catálogo'
        );
      } else {
        const ok = await persistirMusicaAtivaNoServidor();
        if (!ok) return;
        // Persistência já recarrega a música e limpa os modos; reforça layout.
        limparFlagsModoEdicaoMusica();
        // Na Home, gravar volta à visualização da letra completa (não à grade).
        if (estadoPainel.homeLayout?.isHome() && estadoPainel.musicaAtiva) entrarModoLetraCompletaCentral();
        atualizarToolbarModoEdicao();
        return;
      }
    }
    if (estadoPainel.homeLayout?.isHome()) {
      // Sem alteração (ou catálogo): sai da edição e continua na visualização.
      estadoPainel.letraCompletaEditando = false;
      atualizarToolbarModoEdicao();
      return;
    }
    sairDoModoLetraCompletaParaGrade();
    return;
  }
  entrarModoLetraCompletaCentral();
}

/** Transição partilhada de volta à grade de slides (destino de Salvar, Cancelar e Grade/Slide). */
function sairDoModoLetraCompletaParaGrade() {
  estadoPainel.snapshotLetraCompleta = null;
  estadoPainel.modoLetraCompletaCentral = false;
  aplicarLayoutModoLetraCompleta();
  renderEstrofesEditor();
  if (ehModoSlidesOperador()) renderSlidesStrip();
  atualizarToolbarModoEdicao();
}

/** Sai do modo letra completa sem aplicar o textarea — restaura o estado de quando entrou. */
export function cancelarModoLetraCompletaCentral() {
  if (!estadoPainel.modoLetraCompletaCentral) return;
  if (estadoPainel.snapshotLetraCompleta && estadoPainel.musicaAtiva) {
    estadoPainel.musicaAtiva.estrofes = estadoPainel.snapshotLetraCompleta.estrofes.map((s) => String(s));
    estadoPainel.estrofeAtiva = estadoPainel.snapshotLetraCompleta.estrofeAtiva;
    const n = estadoPainel.musicaAtiva.estrofes.length;
    const idxPreto = n;
    if (estadoPainel.estrofeAtiva > idxPreto) estadoPainel.estrofeAtiva = idxPreto;
    if (estadoPainel.estrofeAtiva < -1) estadoPainel.estrofeAtiva = -1;
    renderSlidesStrip();
    atualizarPreviewOperador();
    renderEstrofesEditor();
    marcacaoEstrofeEditor();
    if (
      estadoPainel.projecaoMusicaEmitidaNoServidor &&
      projecao.pronta() &&
      estadoPainel.estrofeAtiva >= 0 &&
      estadoPainel.estrofeAtiva < n
    ) {
      projecao.enviar('exibir_musica', montarPayloadExibirMusica(estadoPainel.estrofeAtiva));
    }
  }
  sairDoModoLetraCompletaParaGrade();
}

/**
 * «Cancelar» da barra padrão, quando clicado na Letra Completa: descarta o texto
 * digitado (volta ao snapshot de quando o modo abriu) mas PERMANECE na Letra
 * Completa — ao contrário de `cancelarModoLetraCompletaCentral`, não troca de
 * tela. Trocar de tela é responsabilidade só do botão «Grade/Slide»
 * (`irParaGradeSlidesDesdeLetraCompleta` / `alternarModoLetraCompletaOuVoltarGrade`);
 * «Cancelar» aqui é só desfazer a alteração pendente, no mesmo lugar.
 */
export function descartarEdicaoLetraCompletaSemSair() {
  if (!estadoPainel.modoLetraCompletaCentral || !estadoPainel.snapshotLetraCompleta || !estadoPainel.musicaAtiva) return;
  estadoPainel.musicaAtiva.estrofes = estadoPainel.snapshotLetraCompleta.estrofes.map((s) => String(s));
  estadoPainel.estrofeAtiva = estadoPainel.snapshotLetraCompleta.estrofeAtiva;
  const n = estadoPainel.musicaAtiva.estrofes.length;
  const idxPreto = n;
  if (estadoPainel.estrofeAtiva > idxPreto) estadoPainel.estrofeAtiva = idxPreto;
  if (estadoPainel.estrofeAtiva < -1) estadoPainel.estrofeAtiva = -1;
  atualizarTextoPainelLetraCompleta();
  guiasEstrofesLetraCompleta.agendar();
  renderSlidesStrip();
  atualizarPreviewOperador();
  if (
    estadoPainel.projecaoMusicaEmitidaNoServidor &&
    projecao.pronta() &&
    estadoPainel.estrofeAtiva >= 0 &&
    estadoPainel.estrofeAtiva < n
  ) {
    projecao.enviar('exibir_musica', montarPayloadExibirMusica(estadoPainel.estrofeAtiva));
  }
  /* Conteúdo já bate com o snapshot outra vez — Salvar/Cancelar voltam a ficar
     desabilitados, mas o modo (Letra Completa) continua o mesmo. */
  atualizarToolbarModoEdicao();
}

/**
 * Atalho de navegação: volta à grade sem gravar.
 * Reutiliza o mesmo destino de Cancelar. Se a letra estiver suja, pede confirmação
 * (o Cancelar desta barra descarta em silêncio; o Cancelar do modo edição por
 * slides já avisa — o mesmo cuidado aplica-se aqui).
 */
export async function irParaGradeSlidesDesdeLetraCompleta() {
  if (!estadoPainel.modoLetraCompletaCentral) return;
  if (letraCompletaSujaVsSnapshot()) {
    const ok = await appConfirm(
      'Há alterações não gravadas. Descartar e voltar à grade de slides? Use «Salvar alterações» para gravar no banco.',
      'Voltar à grade'
    );
    if (!ok) return;
  }
  cancelarModoLetraCompletaCentral();
}

/**
 * Botão único de alternância Grade/Slide ⇄ Letra completa, do menu padrão.
 *
 * Puramente navegação — quem salva é sempre «Salvar alterações»
 * (`acionarSalvarAlteracoesBarraPadrao`), nunca este botão. Por isso, ao sair da
 * letra completa por aqui, reaproveita-se `irParaGradeSlidesDesdeLetraCompleta`
 * (o mesmo destino do antigo botão «Grade/Slide»: pergunta antes de descartar
 * se houver algo por gravar) e não `alternarModoLetraCompletaCentral` (que
 * gravava ao sair).
 */
export async function alternarModoLetraCompletaOuVoltarGrade() {
  if (!estadoPainel.musicaAtiva) return;
  if (!(await sairModoComparativoParaTrocarModo())) return;
  if (estadoPainel.modoLetraCompletaCentral) {
    await irParaGradeSlidesDesdeLetraCompleta();
  } else {
    entrarModoLetraCompletaCentral();
  }
}

export function atualizarToolbarModoLetraCompleta() {
  const btn = document.getElementById('btn-modo-letra-completa');
  /* Visualização = somente leitura. No layout antigo (sem Home) o texto continua editável direto. */
  const taLC = document.getElementById('centro-letra-completa-ta');
  if (taLC) taLC.readOnly = !!estadoPainel.homeLayout?.isHome() && !(estadoPainel.modoLetraCompletaCentral && estadoPainel.letraCompletaEditando);
  if (!btn) return;
  const m = !!estadoPainel.musicaAtiva;
  btn.style.display = m ? '' : 'none';
  btn.disabled = !m;
  /* Só o rótulo e o ícone mudam — não sobrescrever o botão inteiro (`textContent`
     apagaria o SVG). O texto reflete sempre o modo PARA ONDE o clique leva. */
  const txtModo = document.getElementById('txt-modo-letra-completa');
  const icoModo = document.getElementById('ico-modo-letra-completa');
  // Na Home o botão é só «Letra Completa» (a grade tem botão próprio): ícone fixo.
  const noHome = !!estadoPainel.homeLayout?.isHome();
  if (txtModo) txtModo.textContent = estadoPainel.modoLetraCompletaCentral && !noHome ? 'Grade/Slide' : 'Letra Completa';
  if (icoModo && !noHome) {
    icoModo.innerHTML = estadoPainel.modoLetraCompletaCentral
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/></svg>';
  }
  // Toggle explícito: inativo = outline neutro, ativo (= modo actualmente aberto) = preenchido.
  btn.setAttribute('aria-pressed', estadoPainel.modoLetraCompletaCentral ? 'true' : 'false');
  btn.classList.toggle('ativo', estadoPainel.modoLetraCompletaCentral);
  btn.title = estadoPainel.modoLetraCompletaCentral
    ? 'Volta aos cartões por slide sem gravar. Se houver alterações, pede confirmação.'
    : 'Editar ou copiar a letra inteira num só texto';
}
