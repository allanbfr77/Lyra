/**
 * Editor de estrofes da música ativa: cartões de slide, caixa de letras, alturas dos textareas,
 * persistência da música no servidor e criação de nova versão. Movido verbatim do núcleo
 * (`controllerAppCore.js`); o que o núcleo ainda possui entra por `registrarDependenciasEditorEstrofes`.
 */
import { ERRO_ROTULO_DUPLICADO_API, renderMusicaVersoesBar } from './versoesMusica.js';
import { appAlert, appConfirm, appPrompt } from './appDialog.js';
import { carregarMusicas, refreshListaBanco } from './bibliotecaMusicas.js';
import { digestEstrofesParaStripFaixa } from '../modules/slidesGrelha.js';
import { ehVersaoLocalLegada } from '../modules/copiasLocaisLetra.js';
import { aplicarLayoutModoLetraCompleta, atualizarToolbarModoLetraCompleta, confirmarProsseguirDescartandoEdicaoPendente, edicaoEstrofesSujaVsSnapshot, entrarModoLetraCompletaCentral, guiasEstrofesLetraCompleta, limparFlagsModoEdicaoMusica, sincronizarEstrofesDesdeTextareaLetraCompleta, splitTextoLetraCompletaEmEstrofes } from './letraCompleta.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { abrirSlideQuickEditModal, renderSlidesStrip } from './slidesStrip.js';
import { atualizarBotoesSalvarCancelarBarraPadrao, atualizarToolbarCaixaLetrasEdicao, atualizarToolbarModoEdicao, marcacaoEstrofeEditor, metadadosMusicaSujosNaHome } from './toolbarEdicaoHome.js';
import { atualizarCopiaLocal, carregarVersoesMusicaServidor, obterRootIdMusicaAtiva, versaoAtivaParaCompararPlaylist } from './copiasLocaisPainel.js';
import { atualizarPreviewOperador, atualizarSlidesInstrucoes } from './previewProjecao.js';
import { ehModoSlidesOperador } from './modosUi.js';
import { emitirEstrofeAoServidor, exibirEstrofe, projetarPorDuploCliqueCentral } from './projecaoMusica.js';
import { getControllerApiBase } from './servidorAlvo.js';
import { renderPlaylist } from './playlistLista.js';
import { repontarVersaoNaPlaylistDoCulto } from './playlistServidor.js';
import { aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice, aplicarSplitsEstrofesDosTextareasAntesDePersistir, splitTextoEmEstrofesPorLinhaVaziaStrict } from './splitEstrofes.js';

/**
 * Após separar estrofes no evento `input`, o `blur` do textarea antigo ainda tinha o texto com `\n\n`
 * e chamava de novo `aplicarSeparacao…`, duplicando slides — ignoramos esse blur pelo índice.
 */
let ignorarBlurSeparacaoEstrofeIdx = null;

/** Por linha: 1.ª letra maiúscula, restante minúsculas (preserva espaços à esquerda). */
function textoEstrofeCaixaSentenca(texto) {
  return String(texto ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => {
      const m = line.match(/^(\s*)(.*)$/);
      if (!m) return line;
      const corpo = m[2];
      if (!corpo) return line;
      return m[1] + corpo.charAt(0).toLocaleUpperCase('pt-BR') + corpo.slice(1).toLocaleLowerCase('pt-BR');
    })
    .join('\n');
}

function textoEstrofeCaixaMaiuscula(texto) {
  return String(texto ?? '').toLocaleUpperCase('pt-BR');
}

function aplicarCaixaLetrasAoTexto(texto) {
  return estadoPainel.caixaLetrasEdicaoMaiuscula
    ? textoEstrofeCaixaMaiuscula(texto)
    : textoEstrofeCaixaSentenca(texto);
}

/** true se o texto já está todo em maiúsculas (e tem letras com caixa). */
function textoEstaTodoEmMaiusculas(texto) {
  const s = String(texto ?? '');
  if (!s) return false;
  if (s !== textoEstrofeCaixaMaiuscula(s)) return false;
  return s !== s.toLocaleLowerCase('pt-BR');
}

function obterTextosEstrofesEmEdicao() {
  if (estadoPainel.modoLetraCompletaCentral) {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (ta) return [ta.value];
  }
  if (estadoPainel.modoEdicaoEstrofes) {
    const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
    if (tas.length) return tas.map((ta) => ta.value);
  }
  return Array.isArray(estadoPainel.musicaAtiva?.estrofes)
    ? estadoPainel.musicaAtiva.estrofes.map((s) => String(s ?? ''))
    : [];
}

function estrofesEmEdicaoEstaoEmMaiusculas() {
  return textoEstaTodoEmMaiusculas(obterTextosEstrofesEmEdicao().join('\n'));
}

/** Alinha o botão aA ao que a letra já tem (evita 1.º clique no-op em letras MAIÚSCULAS). */
export function sincronizarFlagCaixaLetrasComTextoAtual() {
  estadoPainel.caixaLetrasEdicaoMaiuscula = estrofesEmEdicaoEstaoEmMaiusculas();
}

function aplicarValorTextareaPreservandoSelecao(ta, novo) {
  if (!ta || ta.value === novo) return false;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  ta.value = novo;
  try {
    ta.setSelectionRange(start, end);
  } catch (_) {
    /* ignore */
  }
  return true;
}

/** Força MAIÚSCULAS no textarea preservando o cursor (só no modo aA activo). */
function forcarMaiusculasNoTextareaSeAtivo(ta) {
  if (!estadoPainel.caixaLetrasEdicaoMaiuscula || !ta) return;
  aplicarValorTextareaPreservandoSelecao(ta, textoEstrofeCaixaMaiuscula(ta.value));
}

/**
 * Aplica a caixa actual nos textareas já montados — sem reconstruir os cartões.
 * Faixa e prévias já mostram maiúsculas; um rebuild só fazia os slides tremerem.
 */
function aplicarCaixaLetrasNasEstrofesEmEdicao() {
  if (!estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes)) return;
  let alterou = false;
  if (estadoPainel.modoLetraCompletaCentral) {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (ta) {
      const novo = aplicarCaixaLetrasAoTexto(ta.value);
      if (aplicarValorTextareaPreservandoSelecao(ta, novo)) alterou = true;
      const novas = splitTextoLetraCompletaEmEstrofes(ta.value);
      if (
        novas.length !== estadoPainel.musicaAtiva.estrofes.length ||
        novas.some((s, i) => s !== estadoPainel.musicaAtiva.estrofes[i])
      ) {
        estadoPainel.musicaAtiva.estrofes = novas;
        alterou = true;
      }
      if (typeof guiasEstrofesLetraCompleta?.agendar === 'function') {
        guiasEstrofesLetraCompleta.agendar();
      }
    }
  } else if (estadoPainel.modoEdicaoEstrofes) {
    const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
    if (tas.length === estadoPainel.musicaAtiva.estrofes.length) {
      tas.forEach((ta) => {
        const idx = parseInt(ta.dataset.i, 10);
        const novo = aplicarCaixaLetrasAoTexto(ta.value);
        if (Number.isFinite(idx) && estadoPainel.musicaAtiva.estrofes[idx] != null && estadoPainel.musicaAtiva.estrofes[idx] !== novo) {
          estadoPainel.musicaAtiva.estrofes[idx] = novo;
          alterou = true;
        }
        if (aplicarValorTextareaPreservandoSelecao(ta, novo)) {
          alterou = true;
          aplicarAlturaCardEstrofe(ta.closest('.estrofe-slide-edit'));
        }
      });
    } else {
      const novas = estadoPainel.musicaAtiva.estrofes.map((s) => aplicarCaixaLetrasAoTexto(s));
      alterou = novas.some((s, i) => s !== estadoPainel.musicaAtiva.estrofes[i]);
      estadoPainel.musicaAtiva.estrofes = novas;
      renderEstrofesEditor();
    }
  }
  if (!alterou) return;
  const grid = document.getElementById('slides-grid');
  if (grid && estadoPainel.musicaAtiva.estrofes) {
    grid.dataset.stripDigest = digestEstrofesParaStripFaixa(estadoPainel.musicaAtiva.estrofes);
  }
  if (estadoPainel.projecaoMusicaEmitidaNoServidor && projecao.pronta() && estadoPainel.estrofeAtiva >= 0) {
    emitirEstrofeAoServidor(estadoPainel.estrofeAtiva);
  }
}

export function alternarCaixaLetrasEdicao() {
  if (!estadoPainel.musicaAtiva || (!estadoPainel.modoEdicaoEstrofes && !estadoPainel.modoLetraCompletaCentral)) return;
  if (estadoPainel.modoEdicaoEstrofes && !estadoPainel.modoLetraCompletaCentral) {
    /* Sincroniza textareas abertos antes de transformar. */
    document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta').forEach((ta) => {
      const idx = parseInt(ta.dataset.i, 10);
      if (Number.isFinite(idx) && estadoPainel.musicaAtiva.estrofes[idx] != null) {
        estadoPainel.musicaAtiva.estrofes[idx] = ta.value;
      }
    });
  }
  /* Converte para o oposto do que o texto já é — o flag arrancava em false,
     então o 1.º clique só re-renderizava letras que já estavam em MAIÚSCULAS. */
  estadoPainel.caixaLetrasEdicaoMaiuscula = !estrofesEmEdicaoEstaoEmMaiusculas();
  aplicarCaixaLetrasNasEstrofesEmEdicao();
  atualizarToolbarCaixaLetrasEdicao();
}

export function configurarCamposMetadadosMusicaHome() {
  const atualizar = () => atualizarToolbarModoEdicao();
  document.getElementById('edit-titulo')?.addEventListener('input', atualizar);
  document.getElementById('edit-artista')?.addEventListener('input', atualizar);
  const taFull = document.getElementById('centro-letra-completa-ta');
  if (taFull && taFull.dataset.caixaLetrasLigada !== '1') {
    taFull.dataset.caixaLetrasLigada = '1';
    taFull.addEventListener('input', () => {
      if (!estadoPainel.modoLetraCompletaCentral) return;
      forcarMaiusculasNoTextareaSeAtivo(taFull);
      if (typeof guiasEstrofesLetraCompleta?.agendar === 'function') {
        guiasEstrofesLetraCompleta.agendar();
      }
      atualizarToolbarModoLetraCompleta();
      /* «Salvar alterações» da barra padrão precisa saber, a cada tecla, se o
         conteúdo já diverge do snapshot — não só quando o modo abre/fecha. */
      atualizarBotoesSalvarCancelarBarraPadrao();
    });
  }
  const btnCaixa = document.getElementById('btn-caixa-letras-edicao');
  if (btnCaixa && btnCaixa.dataset.caixaLetrasCfg !== '1') {
    btnCaixa.dataset.caixaLetrasCfg = '1';
    /* Evita blur do textarea no mousedown (rebuild dos cartões roubava o 1.º clique). */
    btnCaixa.addEventListener('mousedown', (e) => e.preventDefault());
  }
}

export function entrarModoEdicao() {
  if (!estadoPainel.musicaAtiva) return;
  if (estadoPainel.modoLetraCompletaCentral) {
    sincronizarEstrofesDesdeTextareaLetraCompleta();
    estadoPainel.snapshotLetraCompleta = null;
    estadoPainel.modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
  }
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (et) estadoPainel.musicaAtiva.titulo = et.value;
  if (ea) estadoPainel.musicaAtiva.artista = ea.value;
  estadoPainel.snapshotEdicaoEstrofes = {
    titulo: estadoPainel.musicaAtiva.titulo,
    artista: estadoPainel.musicaAtiva.artista || '',
    estrofes: estadoPainel.musicaAtiva.estrofes.map((s) => String(s ?? '')),
    estrofeAtiva: estadoPainel.estrofeAtiva,
  };
  estadoPainel.modoEdicaoEstrofes = true;
  sincronizarFlagCaixaLetrasComTextoAtual();
  renderEstrofesEditor();
}

export async function sairModoEdicao() {
  if (edicaoEstrofesSujaVsSnapshot()) {
    const ok = await appConfirm(
      'Há alterações não gravadas. Descartar e sair do modo edição? Use «Salvar alterações» para gravar no banco.',
      'Encerrar edição'
    );
    if (!ok) return;
  }
  if (estadoPainel.snapshotEdicaoEstrofes && estadoPainel.musicaAtiva && estadoPainel.modoEdicaoEstrofes) {
    estadoPainel.musicaAtiva.titulo = estadoPainel.snapshotEdicaoEstrofes.titulo;
    estadoPainel.musicaAtiva.artista = estadoPainel.snapshotEdicaoEstrofes.artista;
    estadoPainel.musicaAtiva.estrofes = estadoPainel.snapshotEdicaoEstrofes.estrofes.map((s) => String(s));
    estadoPainel.estrofeAtiva = estadoPainel.snapshotEdicaoEstrofes.estrofeAtiva;
    const n = estadoPainel.musicaAtiva.estrofes.length;
    const idxPreto = n;
    if (estadoPainel.estrofeAtiva > idxPreto) estadoPainel.estrofeAtiva = idxPreto;
    if (estadoPainel.estrofeAtiva < -1) estadoPainel.estrofeAtiva = -1;
  }
  estadoPainel.snapshotEdicaoEstrofes = null;
  estadoPainel.modoEdicaoEstrofes = false;
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();
}

/**
 * Altura mínima da área de texto de um slide, medida a partir da fonte actual do elemento.
 * Home: 4 linhas (+ o respiro inferior que mantém a alça de redimensionar dentro do cartão);
 * layout antigo: 5 linhas, como sempre.
 */
function alturaMinimaTextoEstrofePx(el) {
  const home = document.body.classList.contains('home-layout-v2');
  const linhas = home ? 4 : 5;
  if (!el) return linhas * 13 * 1.55;
  const cs = getComputedStyle(el);
  const fs = parseFloat(cs.fontSize) || 13;
  const lhRaw = cs.lineHeight;
  let lhPx;
  if (!lhRaw || lhRaw === 'normal') {
    lhPx = fs * 1.55;
  } else if (lhRaw.endsWith('px')) {
    lhPx = parseFloat(lhRaw);
  } else {
    const ratio = parseFloat(lhRaw);
    lhPx = Number.isFinite(ratio) ? ratio * fs : fs * 1.55;
  }
  const respiro = home ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 0;
  return linhas * lhPx + respiro;
}

/** Guarda o tamanho que o usuário arrastou na alça, para respeitá-lo até o conteúdo exigir mais. */
function observarRedimensionamentoManualTextareaEstrofe(ta) {
  if (ta.dataset.alturaManualLigada === '1') return;
  ta.dataset.alturaManualLigada = '1';
  ta.addEventListener('pointerup', () => {
    const h = ta.offsetHeight;
    if (Math.abs(h - (ta._alturaAuto || 0)) > 2) ta._alturaManual = h;
  });
}

/**
 * Auto-grow em lote: primeiro todas as escritas (`height:auto`), depois todas as leituras
 * (`scrollHeight`), depois as escritas finais — um único reflow, mesmo com muitos slides.
 * Overflow escondido (sem barra interna) e altura nunca menor que o conteúdo.
 */
function aplicarAlturasTextareasEstrofes(tas) {
  const lista = tas.filter((ta) => ta && ta.classList.contains('estrofe-slide-ta'));
  if (!lista.length) return;
  const minH = alturaMinimaTextoEstrofePx(lista[0]);
  lista.forEach((ta) => {
    observarRedimensionamentoManualTextareaEstrofe(ta);
    ta.style.maxHeight = 'none';
    ta.style.minHeight = minH + 'px';
    ta.style.overflow = 'hidden';
    ta.style.height = 'auto';
  });
  const alturas = lista.map((ta) => Math.max(minH, ta.scrollHeight, ta._alturaManual || 0));
  lista.forEach((ta, i) => {
    ta.style.height = alturas[i] + 'px';
    ta._alturaAuto = alturas[i];
  });
  // Os cartões crescerem pode fazer a grade ganhar barra de rolagem e estreitar as colunas:
  // as quebras de linha mudam. Confere (um reflow) e corrige o que ainda estiver cortado.
  for (let passo = 0; passo < 3; passo++) {
    const faltam = lista.filter((ta) => ta.scrollHeight > ta.clientHeight + 1);
    if (!faltam.length) break;
    faltam.forEach((ta) => {
      ta.style.height = 'auto';
    });
    const novas = faltam.map((ta) => Math.max(minH, ta.scrollHeight, ta._alturaManual || 0));
    faltam.forEach((ta, i) => {
      ta.style.height = novas[i] + 'px';
      ta._alturaAuto = novas[i];
    });
  }
}

/**
 * Modo edição: altura mínima fixa de linhas; cresce e encolhe com o conteúdo.
 * Modo exibição: só CSS — `.estrofe-slide-view-body` em fluxo, sem altura fixa em JS.
 */
function aplicarAlturaTextareaEstrofe(ta) {
  if (!ta || !ta.classList.contains('estrofe-slide-ta')) return;
  aplicarAlturasTextareasEstrofes([ta]);
  // Segunda passagem após o layout/fontes assentarem (quebras de linha podem mudar a altura).
  requestAnimationFrame(() => requestAnimationFrame(() => aplicarAlturasTextareasEstrofes([ta])));
}

function aplicarAlturaCardEstrofe(cardEl) {
  if (!cardEl) return;
  const ta = cardEl.querySelector('.estrofe-slide-ta');
  if (ta) aplicarAlturaTextareaEstrofe(ta);
}

/**
 * Texto do slide no modo exibição: a 1.ª linha lógica vai num <span> para ganhar peso 600
 * (`::first-line` pegaria só a 1.ª linha visual quando o texto quebra). O texto em si —
 * `textContent`, quebras de linha, contagem de linhas — fica exatamente o mesmo.
 */
function definirTextoCorpoSlide(body, txt) {
  const t = String(txt ?? '');
  body.textContent = '';
  const i = t.indexOf('\n');
  const primeira = document.createElement('span');
  primeira.className = 'estrofe-primeira-linha';
  primeira.textContent = i < 0 ? t : t.slice(0, i);
  body.appendChild(primeira);
  if (i >= 0) body.appendChild(document.createTextNode(t.slice(i)));
}

export function reaplicarAlturasEstrofesEditor() {
  const wrap = document.getElementById('estrofes-slide-editor');
  if (!wrap || !estadoPainel.musicaAtiva || !estadoPainel.musicaAtiva.estrofes) return;
  aplicarAlturasTextareasEstrofes([...wrap.querySelectorAll('textarea.estrofe-slide-ta')]);
}

/* O scrollHeight muda quando a fonte do slide (Poppins) termina de carregar: recalcula as alturas. */


/**
 * Actualiza o texto dos cartões já montados, sem os destruir.
 * Devolve false quando a grelha não bate (contagem ou estrutura) e precisa de rebuild.
 */
export function atualizarEstrofesEditorInPlace() {
  const wrap = document.getElementById('estrofes-slide-editor');
  if (!wrap || !estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes)) return false;
  const cards = [...wrap.querySelectorAll('.estrofe-slide-edit')];
  const n = estadoPainel.musicaAtiva.estrofes.length;
  if (cards.length !== n) return false;
  if (estadoPainel.modoEdicaoEstrofes) {
    for (let i = 0; i < n; i++) {
      const ta = cards[i].querySelector('.estrofe-slide-ta');
      if (!ta) return false;
      const txt = String(estadoPainel.musicaAtiva.estrofes[i] ?? '');
      if (ta.value !== txt) {
        ta.value = txt;
        aplicarAlturaCardEstrofe(cards[i]);
      }
      cards[i].classList.toggle('ativa', estadoPainel.estrofeAtiva === i);
    }
    return true;
  }
  for (let i = 0; i < n; i++) {
    const body = cards[i].querySelector('.estrofe-slide-view-body');
    if (!body) return false;
    const txt = String(estadoPainel.musicaAtiva.estrofes[i] ?? '');
    if (body.textContent !== txt) definirTextoCorpoSlide(body, txt);
    cards[i].classList.toggle('ativa', estadoPainel.estrofeAtiva === i);
  }
  return true;
}

function reorderEstrofesIndices(from, to) {
  if (!estadoPainel.musicaAtiva || !estadoPainel.modoEdicaoEstrofes) return;
  const arr = estadoPainel.musicaAtiva.estrofes;
  const n = arr.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;

  const snapAtiva =
    estadoPainel.estrofeAtiva >= 0 && estadoPainel.estrofeAtiva < n ? arr[estadoPainel.estrofeAtiva] : null;

  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);

  if (snapAtiva !== null) {
    const idx = arr.indexOf(snapAtiva);
    estadoPainel.estrofeAtiva = idx >= 0 ? idx : Math.max(0, Math.min(estadoPainel.estrofeAtiva, arr.length - 1));
  }

  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();
}

export function renderEstrofesEditor() {
  const wrap = document.getElementById('estrofes-slide-editor');

  if (!estadoPainel.musicaAtiva) {
    estadoPainel.modoEdicaoEstrofes = false;
    estadoPainel.snapshotEdicaoEstrofes = null;
    estadoPainel.modoLetraCompletaCentral = false;
    wrap.classList.remove('estrofes-modo-edicao');
    wrap.classList.add('estrofes-slide-editor--vazio');
    atualizarToolbarModoEdicao();
    wrap.innerHTML =
      '<div class="placeholder-msg placeholder-msg--escolha-musica">Escolha uma música na playlist (à direita) ou na biblioteca (à esquerda).</div>';
    atualizarSlidesInstrucoes();
    document.getElementById('edit-titulo').value = '';
    document.getElementById('edit-artista').value = '';
    aplicarLayoutModoLetraCompleta();
    return;
  }

  document.getElementById('edit-titulo').value = estadoPainel.musicaAtiva.titulo;
  document.getElementById('edit-artista').value = estadoPainel.musicaAtiva.artista || '';

  wrap.classList.remove('estrofes-slide-editor--vazio');
  wrap.classList.toggle('estrofes-modo-edicao', estadoPainel.modoEdicaoEstrofes);

  atualizarToolbarModoEdicao();

  wrap.innerHTML = '';
  estadoPainel.musicaAtiva.estrofes.forEach((txt, i) => {
    let centralSlideTapTimer = null;
    const div = document.createElement('div');
    div.className = 'estrofe-slide-edit' + (estadoPainel.estrofeAtiva === i ? ' ativa' : '');
    if (estadoPainel.modoEdicaoEstrofes) {
      div.title = ehModoSlidesOperador()
        ? 'Edição · arrastar ⋮⋮ para reordenar · duplo clique fora do texto para projetar'
        : 'Edição · arrastar ⋮⋮ para reordenar';
    } else if (ehModoSlidesOperador()) {
      div.title = 'Duplo clique para projetar nas telas';
    } else {
      div.title = 'Clique para selecionar · Botão ✎ ou clique direito: edição rápida';
    }

    if (estadoPainel.modoEdicaoEstrofes) {
      div.innerHTML = `
        <div class="estrofe-slide-toolbar">
          <div class="estrofe-slide-toolbar-left">
            <span class="estrofe-drag-handle" draggable="true" data-drag-from="${i}" title="Arrastar para reordenar">⋮⋮</span>
            <span class="estrofe-num-big">${i + 1}</span>
          </div>
          <button type="button" class="btn sm danger btn-del-estrofe" data-i="${i}" title="Remover estrofe">✕</button>
        </div>
        <textarea class="estrofe-slide-ta" data-i="${i}" spellcheck="false"></textarea>
      `;
      div.querySelector('textarea').value = txt;
      const taEst = div.querySelector('textarea');
      taEst.addEventListener('focus', () => aplicarAlturaCardEstrofe(div));
      taEst.addEventListener('input', (e) => {
        forcarMaiusculasNoTextareaSeAtivo(e.target);
        /* «Salvar alterações» da barra padrão precisa saber, a cada tecla, se o
           conteúdo já diverge do snapshot — não só quando o modo abre/fecha. */
        atualizarBotoesSalvarCancelarBarraPadrao();
        const idx = parseInt(e.target.dataset.i, 10);
        const val = e.target.value;
        const parts = splitTextoEmEstrofesPorLinhaVaziaStrict(val);
        if (parts.length > 1) {
          ignorarBlurSeparacaoEstrofeIdx = idx;
          aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idx, val, {
            emitSocket: true,
            posCaretAposSplit: idx + parts.length - 1,
          });
          setTimeout(() => {
            if (ignorarBlurSeparacaoEstrofeIdx === idx) ignorarBlurSeparacaoEstrofeIdx = null;
          }, 0);
          return;
        }
        estadoPainel.musicaAtiva.estrofes[idx] = val;
        aplicarAlturaCardEstrofe(div);
        renderSlidesStrip();
        atualizarPreviewOperador();
      });
      taEst.addEventListener('blur', (e) => {
        const t = e.target;
        if (!t.isConnected) return;
        const idxBlur = parseInt(t.dataset.i, 10);
        if (ignorarBlurSeparacaoEstrofeIdx === idxBlur) {
          ignorarBlurSeparacaoEstrofeIdx = null;
          return;
        }
        aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idxBlur, t.value, { emitSocket: true });
      });
      div.querySelector('.btn-del-estrofe').addEventListener('click', (e) => {
        e.stopPropagation();
        removerEstrofeEditor(parseInt(e.currentTarget.dataset.i, 10));
      });

      const handle = div.querySelector('.estrofe-drag-handle');
      handle.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', String(i));
        e.dataTransfer.effectAllowed = 'move';
        div.classList.add('dragging-reorder');
      });
      handle.addEventListener('dragend', () => {
        div.classList.remove('dragging-reorder');
        wrap.querySelectorAll('.estrofe-slide-edit').forEach((el) =>
          el.classList.remove('drag-over-reorder'));
      });
      div.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        div.classList.add('drag-over-reorder');
      });
      div.addEventListener('dragleave', () => div.classList.remove('drag-over-reorder'));
      div.addEventListener('drop', (e) => {
        e.preventDefault();
        div.classList.remove('drag-over-reorder');
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const to = i;
        if (!Number.isFinite(from)) return;
        reorderEstrofesIndices(from, to);
      });
    } else {
      const quickBtn = !ehModoSlidesOperador()
        ? `<button type="button" class="btn sm btn-estrofe-quick" data-i="${i}" title="Edição rápida">✎</button>`
        : '';
      div.innerHTML = `
        <div class="estrofe-slide-toolbar">
          <div class="estrofe-slide-toolbar-left">
            <span class="estrofe-num-big">${i + 1}</span>
          </div>
          ${quickBtn}
        </div>
      `;
      const body = document.createElement('div');
      body.className = 'estrofe-slide-view-body';
      definirTextoCorpoSlide(body, txt);
      div.appendChild(body);

      if (!ehModoSlidesOperador()) {
        div.querySelector('.btn-estrofe-quick')?.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          abrirSlideQuickEditModal(i);
        });
        div.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          abrirSlideQuickEditModal(i);
        });
      }

      div.addEventListener('click', (e) => {
        if (ehModoSlidesOperador()) return;
        if (e.target.closest('.btn-del-estrofe')) return;
        if (e.target.closest('.btn-estrofe-quick')) return;
        clearTimeout(centralSlideTapTimer);
        centralSlideTapTimer = setTimeout(() => {
          centralSlideTapTimer = null;
          if (estadoPainel.projecaoMusicaEmitidaNoServidor) {
            projetarPorDuploCliqueCentral(i);
            return;
          }
          exibirEstrofe(i);
          renderSlidesStrip();
          atualizarPreviewOperador();
          renderEstrofesEditor();
          marcacaoEstrofeEditor();
        }, 280);
      });
    }

    div.addEventListener('dblclick', (e) => {
      if (estadoPainel.modoEdicaoEstrofes && e.target.closest('textarea')) return;
      if (e.target.closest('.btn-del-estrofe')) return;
      if (e.target.closest('.btn-estrofe-quick')) return;
      e.preventDefault();
      clearTimeout(centralSlideTapTimer);
      centralSlideTapTimer = null;
      if (ehModoSlidesOperador()) {
        projetarPorDuploCliqueCentral(i);
      }
    });

    wrap.appendChild(div);
  });

  estadoPainel.homeLayout?.decorateCards();
  queueMicrotask(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => reaplicarAlturasEstrofesEditor()));
  });

  atualizarSlidesInstrucoes();
  aplicarLayoutModoLetraCompleta({ preencherTextarea: false });
}

export function novaEstrofe() {
  if (!estadoPainel.musicaAtiva || !estadoPainel.modoEdicaoEstrofes || estadoPainel.modoLetraCompletaCentral) return;
  const n = estadoPainel.musicaAtiva.estrofes.length;
  let insertAt;
  if (estadoPainel.estrofeAtiva < 0) insertAt = 0;
  else if (estadoPainel.estrofeAtiva >= n) insertAt = n;
  else insertAt = estadoPainel.estrofeAtiva + 1;
  estadoPainel.musicaAtiva.estrofes.splice(insertAt, 0, '');
  exibirEstrofe(insertAt);
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
}

function removerEstrofeEditor(index) {
  if (!estadoPainel.modoEdicaoEstrofes) return;
  if (!estadoPainel.musicaAtiva || estadoPainel.musicaAtiva.estrofes.length <= 1) {
    alert('É necessário pelo menos uma estrofe.');
    return;
  }
  estadoPainel.musicaAtiva.estrofes.splice(index, 1);
  if (estadoPainel.estrofeAtiva === index) estadoPainel.estrofeAtiva = Math.max(0, index - 1);
  else if (estadoPainel.estrofeAtiva > index) estadoPainel.estrofeAtiva = estadoPainel.estrofeAtiva - 1;

  if (estadoPainel.estrofeAtiva >= estadoPainel.musicaAtiva.estrofes.length) {
    estadoPainel.estrofeAtiva = estadoPainel.musicaAtiva.estrofes.length - 1;
  }

  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
}

export async function persistirMusicaAtivaNoServidor() {
  if (!estadoPainel.musicaAtiva) {
    alert('Nenhuma música selecionada.');
    return false;
  }

  if (estadoPainel.musicaBancoFonte === 'catalog') {
    alert('Música do catálogo: não é possível gravar no banco local.');
    return false;
  }

  const idNum = Number(estadoPainel.musicaAtiva.id);
  if (!Number.isFinite(idNum)) {
    alert('ID da música inválido.');
    return false;
  }

  const titulo = document.getElementById('edit-titulo').value.trim();
  if (!titulo) {
    alert('Informe o título da música.');
    return false;
  }

  aplicarSplitsEstrofesDosTextareasAntesDePersistir();

  estadoPainel.musicaAtiva.titulo = titulo;
  estadoPainel.musicaAtiva.artista = document.getElementById('edit-artista').value.trim();

  const estrofesPayload = (estadoPainel.musicaAtiva.estrofes || []).map((s) =>
    typeof s === 'string' ? s : String(s ?? '')
  );
  const versaoLocalIdAtiva =
    estadoPainel.musicaVersaoLocalId && String(estadoPainel.musicaVersaoLocalId).trim() ? String(estadoPainel.musicaVersaoLocalId) : null;
  const idPersistencia = Number(estadoPainel.musicaAtiva.id);
  /* Capturado antes de gravar: se o servidor bifurcar, é por aqui que se acha a entrada da playlist a repontar. */
  const rootAntesDeGravar = obterRootIdMusicaAtiva();
  const versaoPlaylistAntesDeGravar = versaoAtivaParaCompararPlaylist();
  const cultoDaEdicao = estadoPainel.cultoId;

  const api = getControllerApiBase();

  async function aplicarMusicaRecarregada(idAlvo, forked) {
    await carregarMusicas();
    const res2 = await fetch(`${api}/api/musicas/${idAlvo}`);
    if (!res2.ok) throw new Error('Não foi possível recarregar a música.');
    estadoPainel.musicaAtiva = await res2.json();
    estadoPainel.musicaBancoFonte = 'user';
    estadoPainel.musicaVersaoLocalId = null;
    estadoPainel.musicaRootId = Number(estadoPainel.musicaAtiva.root_id ?? estadoPainel.musicaAtiva.id);
    document.getElementById('edit-titulo').value = estadoPainel.musicaAtiva.titulo;
    document.getElementById('edit-artista').value = estadoPainel.musicaAtiva.artista || '';
    estadoPainel.snapshotEdicaoEstrofes = null;
    estadoPainel.modoEdicaoEstrofes = false;
    estadoPainel.snapshotLetraCompleta = null;
    estadoPainel.modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
    refreshListaBanco();
    renderPlaylist();
    await carregarVersoesMusicaServidor(estadoPainel.musicaRootId);
    renderMusicaVersoesBar();
    renderEstrofesEditor();
    renderSlidesStrip();
    atualizarPreviewOperador();
    atualizarToolbarModoEdicao();
    if (forked && !ehModoSlidesOperador()) {
      await appAlert(
        'As alterações foram gravadas numa nova cópia. O original no servidor foi preservado.',
        'Cópia criada'
      );
    }
  }

  if (versaoLocalIdAtiva && ehVersaoLocalLegada(versaoLocalIdAtiva)) {
    const rootLegado = obterRootIdMusicaAtiva() ?? idNum;
    const up = atualizarCopiaLocal(rootLegado, versaoLocalIdAtiva, {
      titulo,
      artista: estadoPainel.musicaAtiva.artista,
      estrofes: estrofesPayload,
    });
    if (!up.ok) {
      alert(up.erro || 'Não foi possível atualizar a cópia.');
      return false;
    }
    await carregarVersoesMusicaServidor(obterRootIdMusicaAtiva() ?? idNum);
    renderMusicaVersoesBar();
    return true;
  }

  try {
    const bodyJson = JSON.stringify({
      titulo,
      artista: estadoPainel.musicaAtiva.artista,
      estrofes: estrofesPayload,
    });
    let res = await fetch(`${api}/api/musicas/${idPersistencia}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: bodyJson,
    });

    if (res.status === 404) {
      res = await fetch(`${api}/api/musicas/${idPersistencia}/salvar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyJson,
      });
    }

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      let msg = '';
      try {
        msg = JSON.parse(raw).erro || '';
      } catch (_) {
        msg = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
      }
      alert(
        msg ||
          `Não foi possível salvar (HTTP ${res.status}). Verifique se o aplicativo Controlador está em execução (API local na porta 3001).`
      );
      return false;
    }

    const data = await res.json().catch(() => ({}));
    const forked = !!data.forked;
    const idAlvo = forked && data.id != null ? Number(data.id) : idPersistencia;
    estadoPainel.musicaVersaoLocalId = null;
    await aplicarMusicaRecarregada(idAlvo, forked);
    /**
     * Fork = a edição virou uma versão nova; a playlist do dia continuaria a apontar
     * para o original imutável e recarregaria a letra antiga ao reentrar no modo slides.
     */
    if (forked) {
      const rootFork = Number(data.rootId ?? estadoPainel.musicaRootId ?? rootAntesDeGravar);
      const repontou = repontarVersaoNaPlaylistDoCulto(
        cultoDaEdicao,
        rootFork,
        versaoPlaylistAntesDeGravar,
        idAlvo,
        estadoPainel.musicaAtiva?.rotulo || ''
      );
      if (repontou) renderPlaylist();
    }
    return true;
  } catch (e) {
    alert(e.message || 'Erro ao salvar no banco local do controlador.');
    return false;
  }
}

export async function iniciarCriarNovaVersao() {
  if (!estadoPainel.musicaAtiva) return;
  if (estadoPainel.musicaBancoFonte === 'catalog') {
    await appAlert(
      'Música do catálogo somente leitura. Importe para o seu banco antes de criar uma versão editável.',
      'Catálogo'
    );
    return;
  }
  const idNum = Number(estadoPainel.musicaAtiva.id);
  if (!Number.isFinite(idNum)) return;

  if (
    !(await confirmarProsseguirDescartandoEdicaoPendente(
      'Você tem alterações não salvas. Descartar e criar uma nova versão a partir do texto gravado no servidor?',
      'Criar nova versão'
    ))
  ) {
    return;
  }

  /* Duas versões da mesma música não podem ter o mesmo nome: quando o servidor
     recusa por nome repetido, avisa e volta a pedir outro — sem gravar nada. */
  let sugestao = '';
  let avisoNomeRepetido = '';
  let payload = null;
  for (;;) {
    const nome = await appPrompt('Nome da nova versão:', {
      title: 'Nova versão',
      defaultValue: sugestao,
      emptyMsg: 'Digite um nome para a versão.',
      auxText: avisoNomeRepetido || undefined,
    });
    if (!nome) return;
    try {
      limparFlagsModoEdicaoMusica();

      const res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/criar-versao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotulo: nome }),
      });
      const resposta = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (resposta.codigo === ERRO_ROTULO_DUPLICADO_API) {
          await appAlert(resposta.erro, 'Nome de versão repetido');
          sugestao = nome;
          avisoNomeRepetido = resposta.erro;
          continue;
        }
        await appAlert(resposta.erro || `Não foi possível criar a versão (HTTP ${res.status}).`);
        return;
      }
      payload = resposta;
      break;
    } catch (e) {
      await appAlert(e?.message || 'Não foi possível criar a nova versão.');
      return;
    }
  }

  try {
    const nova = payload.musica;
    if (!nova || !Array.isArray(nova.estrofes)) throw new Error('Resposta inválida do servidor.');

    estadoPainel.musicaAtiva = nova;
    estadoPainel.musicaBancoFonte = 'user';
    estadoPainel.musicaVersaoLocalId = null;
    estadoPainel.musicaRootId = Number(nova.root_id ?? payload.rootId ?? idNum);
    const et = document.getElementById('edit-titulo');
    const ea = document.getElementById('edit-artista');
    if (et) et.value = estadoPainel.musicaAtiva.titulo || '';
    if (ea) ea.value = estadoPainel.musicaAtiva.artista || '';

    estadoPainel.estrofeAtiva = Math.min(
      Math.max(estadoPainel.estrofeAtiva < 0 ? 0 : estadoPainel.estrofeAtiva, 0),
      Math.max(0, estadoPainel.musicaAtiva.estrofes.length - 1)
    );
    estadoPainel.projecaoMusicaEmitidaNoServidor = false;
    estadoPainel.bloqueioSincronizarEstrofeDoServidor = true;
    await carregarMusicas();
    refreshListaBanco();
    renderPlaylist();
    await carregarVersoesMusicaServidor(estadoPainel.musicaRootId);
    renderEstrofesEditor();
    renderSlidesStrip();
    atualizarPreviewOperador();
    marcacaoEstrofeEditor();

    /* A cópia recém-criada abre na letra corrida, como uma música aberta do
       banco — não na grade de edição por slides. `entrarModoLetraCompletaCentral`
       já trata do layout, do snapshot e da barra de ações. */
    entrarModoLetraCompletaCentral();
  } catch (e) {
    appAlert(e?.message || 'Não foi possível criar a nova versão.');
  }
}

export async function salvarMusicaServidor() {
  if (!estadoPainel.musicaAtiva) return;
  const metadadosSujos = metadadosMusicaSujosNaHome();
  if (!estadoPainel.modoEdicaoEstrofes && !estadoPainel.modoLetraCompletaCentral && !metadadosSujos) return;
  if (estadoPainel.musicaBancoFonte === 'catalog') {
    await appAlert(
      'Música do catálogo somente leitura: não é possível usar Salvar alterações. Importe a letra para o seu banco ou escolha uma música gravada neste servidor.'
    );
    return;
  }
  if (estadoPainel.modoLetraCompletaCentral) sincronizarEstrofesDesdeTextareaLetraCompleta();
  if (estadoPainel.modoEdicaoEstrofes) aplicarSplitsEstrofesDosTextareasAntesDePersistir();

  const vid =
    estadoPainel.musicaVersaoLocalId && ehVersaoLocalLegada(estadoPainel.musicaVersaoLocalId)
      ? String(estadoPainel.musicaVersaoLocalId).trim()
      : null;
  const idNum = Number(estadoPainel.musicaAtiva.id);

  if (vid) {
    const titulo = document.getElementById('edit-titulo').value.trim();
    const artista = document.getElementById('edit-artista').value.trim();
    const estrofesPayload = (estadoPainel.musicaAtiva.estrofes || []).map((s) => String(s ?? ''));
    const rootLegado = obterRootIdMusicaAtiva() ?? idNum;
    const up = atualizarCopiaLocal(rootLegado, vid, { titulo, artista, estrofes: estrofesPayload });
    if (!up.ok) {
      await appAlert(up.erro || 'Não foi possível atualizar a cópia.');
      return;
    }
    await carregarVersoesMusicaServidor(obterRootIdMusicaAtiva() ?? idNum);
  } else {
    const ok = await persistirMusicaAtivaNoServidor();
    if (!ok) return;
    return;
  }

  limparFlagsModoEdicaoMusica();
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();
  atualizarToolbarModoEdicao();
  renderMusicaVersoesBar();
  refreshListaBanco();
  renderPlaylist();
}

/**
 * Instruções que corriam no carregamento do núcleo. Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarEditorEstrofes() {
  if (document.fonts) {
    document.fonts.addEventListener('loadingdone', () => reaplicarAlturasEstrofesEditor());
    document.fonts.ready.then(() => reaplicarAlturasEstrofesEditor());
  }
}
