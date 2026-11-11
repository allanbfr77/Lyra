/**
 * Modal de pré-visualização de letras: catálogo online/offline, linhas por slide, seleção e cópia. Movido
 * verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasPreviewLetras`.
 */
import { escapeHtml } from './textoHtmlSeguro.js';
import { importarLetrasDoCatalogoParaBanco, importarLetrasParaBanco, limparBuscaLetras } from './bibliotecaMusicas.js';
import { normalizarFonteLetrasSite } from '../modules/fonteLetrasSite.js';
import {  } from './estadoPainel.js';
import { getControllerApiBase } from './servidorAlvo.js';
import { selecionarMusicaDoBanco } from './projecaoMusica.js';

let letrasPreviewPathPendente = '';
let letrasPreviewCatalogIdPendente = null;
let letrasPreviewUserIdPendente = null;
let letrasPreviewOfflineOrigem = 'catalog';
let letrasPreviewFontePendente = 'cifraclub';
let letrasPreviewMaxLinhasPorSlide = 4;
let letrasPreviewReqSeq = 0;
/** Estrofes exibidas no modal — usadas para montar o clipboard com linhas em branco entre trechos. */
let letrasPreviewPartesAtuais = [];

function fontePreviewUsaEstruturaDoBanco() {
  return letrasPreviewFontePendente === 'lyra-online' || letrasPreviewFontePendente === 'banco-local';
}

function configurarSelectLinhasPreviewLetras() {
  const sel = document.getElementById('letras-preview-max-linhas');
  if (!sel) return;
  const usaBanco = fontePreviewUsaEstruturaDoBanco();
  const optBanco = sel.querySelector('option[value="banco"]');
  const opt4 = sel.querySelector('option[value="4"]');
  if (optBanco) {
    optBanco.hidden = !usaBanco;
    optBanco.disabled = !usaBanco;
  }
  if (opt4) opt4.textContent = usaBanco ? '4 linhas' : '4 linhas (padrão)';
  sel.value = usaBanco ? 'banco' : '4';
}

function lerMaxLinhasPreviewLetras() {
  const raw = String(document.getElementById('letras-preview-max-linhas')?.value || '').trim();
  if (raw === 'banco') return 'banco';
  const n = parseInt(raw, 10);
  if (n === 2 || n === 3 || n === 4) return n;
  return fontePreviewUsaEstruturaDoBanco() ? 'banco' : 4;
}

function rotuloModoLinhasPreview(valor) {
  return valor === 'banco' ? 'padrão do banco' : `${valor} linha(s)/slide`;
}

function modalPreviewLetrasEstaAberto() {
  const bd = document.getElementById('letras-preview-backdrop');
  return !!bd && !bd.hidden;
}

/** Enquanto o modal está aberto, bloqueia seleção no resto da página. */
export function definirIsolamentoSelecaoPreviewLetras(ativo) {
  document.documentElement.classList.toggle('letras-preview-aberto', !!ativo);
}

/** Ctrl+A no modal: só os blocos de letra (`.letras-preview-pre`), não a interface atrás. */
function selecionarTodoTextoPreviewLetras() {
  const scroll = document.getElementById('letras-preview-scroll');
  if (!scroll) return;
  const blocos = scroll.querySelectorAll('.letras-preview-pre');
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  if (!blocos.length) {
    const msg = scroll.querySelector('.placeholder-msg');
    if (!msg) return;
    const range = document.createRange();
    range.selectNodeContents(msg);
    sel.addRange(range);
    return;
  }
  const range = document.createRange();
  range.setStart(blocos[0], 0);
  const ultimo = blocos[blocos.length - 1];
  range.setEnd(ultimo, ultimo.childNodes.length);
  sel.addRange(range);
}

function selecaoPreviewLetrasIntersectaNo(sel, node) {
  if (!sel?.rangeCount) return false;
  const r = sel.getRangeAt(0);
  const nr = document.createRange();
  nr.selectNodeContents(node);
  return r.compareBoundaryPoints(Range.END_TO_START, nr) > 0 && r.compareBoundaryPoints(Range.START_TO_END, nr) < 0;
}

/** Recorta o trecho de um `<pre>` que cai dentro da seleção actual. */
function textoPrePreviewLetrasNaSelecao(pre, sel) {
  const selRange = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(pre);
  const range = document.createRange();
  range.selectNodeContents(pre);
  if (selRange.compareBoundaryPoints(Range.START_TO_START, preRange) > 0) {
    range.setStart(selRange.startContainer, selRange.startOffset);
  }
  if (selRange.compareBoundaryPoints(Range.END_TO_END, preRange) < 0) {
    range.setEnd(selRange.endContainer, selRange.endOffset);
  }
  return range.toString();
}

function selecaoPreviewLetrasDentroDoScroll(scroll, sel) {
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const anc = range.commonAncestorContainer;
  const el = anc.nodeType === Node.TEXT_NODE ? anc.parentElement : anc;
  return !!el && scroll.contains(el);
}

/**
 * Ao copiar vários trechos, o espaço visual entre blocos é só CSS — o clipboard
 * vinha sem linha em branco. Junta cada `.letras-preview-pre` com `\n\n`.
 * @returns {string|null} texto formatado ou `null` para deixar o navegador copiar
 */
function textoCopiaPreviewLetrasComEspacosEntreTrechos(scroll) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return null;
  if (!selecaoPreviewLetrasDentroDoScroll(scroll, sel)) return null;

  const pres = [...scroll.querySelectorAll('.letras-preview-pre')];
  if (pres.length < 2) return null;

  const intersecting = pres.filter((pre) => selecaoPreviewLetrasIntersectaNo(sel, pre));
  if (intersecting.length < 2) return null;

  const selRange = sel.getRangeAt(0);
  if (
    intersecting.length === pres.length &&
    letrasPreviewPartesAtuais.length === pres.length &&
    pres.every((pre) => {
      const preRange = document.createRange();
      preRange.selectNodeContents(pre);
      return (
        selRange.compareBoundaryPoints(Range.START_TO_START, preRange) <= 0 &&
        selRange.compareBoundaryPoints(Range.END_TO_END, preRange) >= 0
      );
    })
  ) {
    return letrasPreviewPartesAtuais.join('\n\n');
  }

  const partes = intersecting.map((pre) => {
    const preRange = document.createRange();
    preRange.selectNodeContents(pre);
    const inteiro =
      selRange.compareBoundaryPoints(Range.START_TO_START, preRange) <= 0 &&
      selRange.compareBoundaryPoints(Range.END_TO_END, preRange) >= 0;
    return inteiro ? pre.textContent || '' : textoPrePreviewLetrasNaSelecao(pre, sel);
  });
  return partes.join('\n\n');
}

function tratarCopiaPreviewLetras(e) {
  if (!modalPreviewLetrasEstaAberto()) return;
  const scroll = document.getElementById('letras-preview-scroll');
  if (!scroll) return;
  const texto = textoCopiaPreviewLetrasComEspacosEntreTrechos(scroll);
  if (texto === null) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', texto);
}

export function fecharModalPreviewLetras() {
  const bd = document.getElementById('letras-preview-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  definirIsolamentoSelecaoPreviewLetras(false);
  letrasPreviewPathPendente = '';
  letrasPreviewCatalogIdPendente = null;
  letrasPreviewUserIdPendente = null;
  letrasPreviewOfflineOrigem = 'catalog';
  letrasPreviewFontePendente = 'cifraclub';
  letrasPreviewPartesAtuais = [];
}

export async function abrirModalPreviewLetras(path, fonte) {
  letrasPreviewCatalogIdPendente = null;
  letrasPreviewUserIdPendente = null;
  letrasPreviewPathPendente = path || '';
  letrasPreviewFontePendente = normalizarFonteLetrasSite(fonte || 'cifraclub');
  const btnImp = document.getElementById('letras-preview-import');
  if (btnImp) btnImp.textContent = 'Importar esta versão';
  configurarSelectLinhasPreviewLetras();
  const bd = document.getElementById('letras-preview-backdrop');
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
  definirIsolamentoSelecaoPreviewLetras(true);
  await carregarPreviewLetrasNoModal();
}

export async function abrirModalPreviewLetrasOffline(id, origem) {
  const idNum = typeof id === 'number' ? id : parseInt(String(id), 10);
  if (!Number.isFinite(idNum)) return;
  const orig = origem === 'user' ? 'user' : 'catalog';
  letrasPreviewPathPendente = '';
  letrasPreviewCatalogIdPendente = orig === 'catalog' ? idNum : null;
  letrasPreviewUserIdPendente = orig === 'user' ? idNum : null;
  letrasPreviewOfflineOrigem = orig;
  letrasPreviewFontePendente = 'banco-local';
  configurarSelectLinhasPreviewLetras();
  const bd = document.getElementById('letras-preview-backdrop');
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
  definirIsolamentoSelecaoPreviewLetras(true);
  const btnImp = document.getElementById('letras-preview-import');
  if (btnImp) btnImp.textContent = orig === 'user' ? 'Usar esta música' : 'Importar para o banco';
  await carregarPreviewLetrasNoModal();
}

async function carregarPreviewLetrasNoModal() {
  const scroll = document.getElementById('letras-preview-scroll');
  const meta = document.getElementById('letras-preview-meta');
  const btnImp = document.getElementById('letras-preview-import');
  const path = letrasPreviewPathPendente;
  const catalogId = letrasPreviewCatalogIdPendente;
  const userId = letrasPreviewUserIdPendente;
  letrasPreviewMaxLinhasPorSlide = lerMaxLinhasPreviewLetras();
  const reqId = ++letrasPreviewReqSeq;
  scroll.innerHTML = '<div class="placeholder-msg">Carregando a letra…</div>';
  meta.textContent = '';
  if (btnImp) btnImp.disabled = true;
  try {
    let res;
    if (letrasPreviewFontePendente === 'banco-local' && (catalogId != null || userId != null)) {
      const origem = letrasPreviewOfflineOrigem === 'user' ? 'user' : 'catalog';
      const idPreview = origem === 'user' ? userId : catalogId;
      const paramLinhas = `&maxLinhas=${encodeURIComponent(String(letrasPreviewMaxLinhasPorSlide))}`;
      res = await fetch(
        `${getControllerApiBase()}/api/letras/preview-local?id=${encodeURIComponent(String(idPreview))}&origem=${origem}${paramLinhas}`
      );
    } else {
      res = await fetch(`${getControllerApiBase()}/api/letras/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          maxLinhasPorSlide: letrasPreviewMaxLinhasPorSlide,
          fonte: letrasPreviewFontePendente,
        }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (reqId !== letrasPreviewReqSeq) return;
    if (!res.ok) {
      scroll.innerHTML = `<div class="placeholder-msg">${escapeHtml(data.erro || `Erro HTTP ${res.status}`)}</div>`;
      return;
    }
    if (data.sucesso === false) {
      scroll.innerHTML = `<div class="placeholder-msg">${escapeHtml(data.erro || 'Falha ao carregar.')}</div>`;
      return;
    }
    if (btnImp) btnImp.disabled = false;
    const fonteLabel =
      letrasPreviewFontePendente === 'banco-local'
        ? letrasPreviewOfflineOrigem === 'user'
          ? 'Banco local (suas músicas)'
          : 'HLYRCS'
        : letrasPreviewFontePendente === 'letras-mus-br'
          ? 'Letras.mus.br'
          : letrasPreviewFontePendente === 'lyra-online'
            ? 'Banco online do Lyra'
            : 'Cifra Club';
    const metaLinhas = ` · ${rotuloModoLinhasPreview(letrasPreviewMaxLinhasPorSlide)}`;
    meta.innerHTML = `<strong>${escapeHtml(data.titulo || '')}</strong>${data.artista ? ` · ${escapeHtml(data.artista)}` : ''} · ${escapeHtml(fonteLabel)}${metaLinhas}`;
    const parts = Array.isArray(data.estrofes) ? data.estrofes : [];
    letrasPreviewPartesAtuais = parts.slice();

    // `parcial` = a letra veio de meta tag, que só traz o começo da música.
    // Sem este aviso, uma letra truncada em 4 linhas passava por completa.
    const avisoParcial = data.parcial
      ? `<div class="letras-preview-aviso">⚠ Só o início da letra foi encontrado (${parts.length} trecho${parts.length === 1 ? '' : 's'}). As fontes completas não responderam — confira antes de importar.</div>`
      : '';

    scroll.innerHTML =
      avisoParcial +
      parts
        .map((bloco, idx) => {
          const sep =
            idx > 0
              ? '<span class="letras-preview-sep" aria-hidden="true">\n\n</span>'
              : '';
          return (
            sep +
            `<div class="letras-preview-bloco"><span class="letras-preview-num">Trecho ${idx + 1}</span><pre class="letras-preview-pre">${escapeHtml(bloco)}</pre></div>`
          );
        })
        .join('');
  } catch (e) {
    if (reqId !== letrasPreviewReqSeq) return;
    scroll.innerHTML = `<div class="placeholder-msg">${escapeHtml(e.message || 'Falha ao carregar.')}</div>`;
  }
}

export function configurarModalPreviewLetras() {
  document.getElementById('letras-preview-cancel')?.addEventListener('click', () => fecharModalPreviewLetras());
  document.getElementById('letras-preview-import')?.addEventListener('click', async () => {
    const p = letrasPreviewPathPendente;
    const catalogId = letrasPreviewCatalogIdPendente;
    const userId = letrasPreviewUserIdPendente;
    const maxLinhasPorSlide = lerMaxLinhasPreviewLetras();
    const fontePend = letrasPreviewFontePendente;
    fecharModalPreviewLetras();
    if (userId != null && fontePend === 'banco-local') {
      // «Usar esta música»: nada é gravado, mas o resultado da busca já cumpriu
      // o seu papel — limpa igual aos demais para manter o painel consistente.
      await selecionarMusicaDoBanco(userId, {
        fonte: 'user',
        preferirCopia: true,
        origemUi: 'biblioteca',
        abrirEmLetraCompleta: true,
      });
      limparBuscaLetras();
    } else if (catalogId != null && fontePend === 'banco-local') {
      await importarLetrasDoCatalogoParaBanco(catalogId, maxLinhasPorSlide);
    } else if (p) {
      await importarLetrasParaBanco(p, maxLinhasPorSlide, fontePend);
    }
  });
  document.getElementById('letras-preview-max-linhas')?.addEventListener('change', () => {
    letrasPreviewMaxLinhasPorSlide = lerMaxLinhasPreviewLetras();
    if (
      letrasPreviewPathPendente ||
      letrasPreviewCatalogIdPendente != null ||
      letrasPreviewUserIdPendente != null
    ) {
      carregarPreviewLetrasNoModal();
    }
  });
  /**
   * Só fecha ao clicar «no escuro»: pointerdown + pointerup no próprio backdrop.
   * Sem isto, arrastar seleção da letra para fora termina no backdrop — o navegador
   * sintetiza click no backdrop e fecha o modal inadvertidamente.
   */
  let letrasPreviewBackdropPointerDown = false;
  const letrasPreviewBd = document.getElementById('letras-preview-backdrop');
  letrasPreviewBd?.addEventListener('pointerdown', (e) => {
    letrasPreviewBackdropPointerDown = e.target === letrasPreviewBd;
  });
  letrasPreviewBd?.addEventListener('pointerup', (e) => {
    if (letrasPreviewBackdropPointerDown && e.target === letrasPreviewBd) fecharModalPreviewLetras();
    letrasPreviewBackdropPointerDown = false;
  });
  letrasPreviewBd?.addEventListener('pointercancel', () => {
    letrasPreviewBackdropPointerDown = false;
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (!modalPreviewLetrasEstaAberto()) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      e.preventDefault();
      selecionarTodoTextoPreviewLetras();
    },
    true
  );
  /* O `copy` dispara no elemento focado (ex.: campo de busca atrás do modal), não no scroll. */
  document.addEventListener('copy', tratarCopiaPreviewLetras, true);
}
