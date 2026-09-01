/**
 * Helpers de pré-visualização: medir caixas, calcular px de fonte e aplicar classes de linhas.
 */

/** Remove tamanho dinâmico aplicado por `aplicarClasseLinhas` (prévias vazias ou mensagens de estado). */
export function limparEstiloPreviewSlide(el) {
  if (!el) return;
  delete el.dataset.previewFonteTexto;
  /* Texto cru da prévia ministrante (com `//`) — cai junto, senão o M3 continuaria a
     receber o slide anterior depois de a prévia ser limpa. */
  delete el.dataset.previewMinistranteRaw;
  el.style.removeProperty('font-size');
  el.classList.remove('lines-1', 'lines-2', 'lines-3', 'lines-4', 'lines-many');
}

export function medirCaixaFontePreview(el) {
  const fallback = { w: 280, h: 180 };
  if (!el || !(el instanceof Element)) return fallback;
  try {
    if (el.id === 'pl-pv-slide') {
      const wrap = el.closest('.pl-preview-slide-wrap');
      const box = wrap || el.parentElement;
      if (box) {
        const r = box.getBoundingClientRect();
        if (r.width >= 40 && r.height >= 40) return { w: r.width - 8, h: r.height - 8 };
      }
    }
    if (el.id === 'pv-live-letras') {
      const body = el.closest('.preview-card-body');
      const tit = document.getElementById('pv-live-titulo');
      if (body) {
        const br = body.getBoundingClientRect();
        const titH = tit ? tit.getBoundingClientRect().height + 6 : 0;
        const h = Math.max(80, br.height - titH - 20);
        const w = Math.max(100, br.width - 24);
        if (br.width >= 40) return { w, h };
      }
    }
    if (el.classList.contains('op-slide-text')) {
      const stack = el.closest('.preview-operator-slides');
      if (stack) {
        const r = stack.getBoundingClientRect();
        const gap = 14; // igual ao gap do flex em .preview-operator-slides
        // Margem de segurança menor (−2 em vez de −6): dá mais altura útil a cada um dos
        // dois slides do ministrante, aproximando a fonte da do telão sem risco de sobrepor.
        const half = Math.max(48, (r.height - gap) / 2 - 2);
        const w = Math.max(100, r.width - 16);
        if (r.width >= 40 && r.height >= 40) return { w, h: half };
      }
    }
    const r = el.getBoundingClientRect();
    if (r.width >= 40 && r.height >= 40) return { w: r.width - 8, h: r.height - 8 };
  } catch (_) {
  // intencional — erro ignorado
}
  return fallback;
}

/**
 * Tamanho da fonte nas prévias: cabe na caixa usando a linha mais longa (caracteres) e o número de linhas.
 */
export function calcularFontePxPreview(texto, availW, availH) {
  const raw = String(texto ?? '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  const n = Math.max(1, lines.length);
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  const LH = 1.35;
  const CHAR_RATIO = 0.58;
  const padW = 0.92;
  const fromChars = (availW * padW) / (maxLen * CHAR_RATIO);
  const fromLines = availH / (n * LH);
  let px = Math.min(fromChars, fromLines);
  px = Math.max(8, Math.min(22, px));
  return px;
}

export function aplicarClasseLinhas(el, texto) {
  if (!el) return;
  el.classList.remove('lines-1', 'lines-2', 'lines-3', 'lines-4', 'lines-many');
  const raw = String(texto ?? '');
  const temConteudo = raw.split('\n').some((l) => l.length > 0);
  if (!temConteudo) {
    limparEstiloPreviewSlide(el);
    return;
  }
  el.dataset.previewFonteTexto = raw;
  const n = raw.split('\n').filter((l) => l.length > 0).length;
  if (n <= 1) el.classList.add('lines-1');
  else if (n === 2) el.classList.add('lines-2');
  else if (n === 3) el.classList.add('lines-3');
  else if (n === 4) el.classList.add('lines-4');
  else el.classList.add('lines-many');

  const aplicar = () => {
    const { w, h } = medirCaixaFontePreview(el);
    let px = calcularFontePxPreview(raw, w, h);
    // Equilíbrio dos previews do modo slide: o telão (1 slide, caixa cheia) ia ao teto (20px)
    // e ofuscava o ministrante (2 slides). Igualamos o teto dos dois num valor intermediário
    // (18px) para se «encontrarem no meio». Não afeta playlist central nem prévias da Bíblia.
    const ehPreviewSlideModo = el.id === 'pv-live-letras' || el.classList.contains('op-slide-text');
    if (ehPreviewSlideModo) px = Math.min(px, 18);
    el.style.fontSize = px.toFixed(2) + 'px';
  };
  aplicar();
  requestAnimationFrame(() => requestAnimationFrame(aplicar));
}

/** Re-calcula fontes em todos os nós marcados pela prévia dinâmica. */
export function reaplicarFontesPreviewPainel() {
  document.querySelectorAll('[data-preview-fonte-texto]').forEach((el) => {
    const t = el.dataset.previewFonteTexto;
    if (t != null && t !== '') aplicarClasseLinhas(el, t);
  });
}
