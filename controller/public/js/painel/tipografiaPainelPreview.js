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
  delete el.dataset.previewFontePx;
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

/**
 * Fonte nos chips da grelha (modo slides) — «encher a área útil».
 *
 * O teto é a maior fonte que a altura útil do cartão comporta (já descontado o
 * espaço reservado ao número do slide). Se nesse teto a linha mais larga couber,
 * é esse o tamanho — slides curtos ou com poucas linhas ficam grandes. Só quando
 * o conteúdo excede a caixa é que se procura, por bissecção, o maior tamanho que
 * ainda cabe em largura E altura.
 *
 * @param {object} opts
 * @param {string[]} opts.textos Linhas não vazias do slide
 * @param {number} opts.availW Largura útil (px)
 * @param {number} opts.availH Altura útil (px), já sem o número do slide
 * @param {number} opts.nLinhasBloco Total de linhas visuais (inclui vazias)
 * @param {number} [opts.lineHeight] RAZÃO de line-height (ex.: 1.42) — nunca px
 * @param {number} [opts.lineGapPx] Espaço entre linhas (px)
 * @param {number} [opts.minPx] Piso absoluto
 * @param {number} [opts.maxPx] Teto absoluto de segurança
 * @param {number} [opts.precisaoPx] Precisão da bissecção
 * @param {(fontPx: number) => number} opts.medirLarguraMaxPx
 * @param {(fontPx: number) => number} [opts.medirAlturaBlocoPx]
 */
export function calcularFontePxSnippetGrelhaSlide(opts) {
  const {
    textos,
    availW,
    availH,
    nLinhasBloco,
    lineHeight = 1.42,
    lineGapPx = 3,
    minPx = 6,
    maxPx = 400,
    precisaoPx = 0.2,
    medirLarguraMaxPx,
    medirAlturaBlocoPx,
  } = opts;

  if (!textos?.length || availW < 12 || availH < 12) return minPx;
  if (typeof medirLarguraMaxPx !== 'function') return minPx;

  const n = Math.max(1, Number(nLinhasBloco) || textos.length);

  /*
    `getComputedStyle(el).lineHeight` devolve o valor USADO em px (ex.: "18.93px"),
    não a razão 1.42. Se esse px entrasse aqui como razão, o teto por altura ficava
    ~13× menor e todos os chips caíam no mínimo — era a causa do texto minúsculo.
    Por isso só se aceita uma razão plausível; qualquer outra coisa cai no padrão.
  */
  const lh = Number.isFinite(lineHeight) && lineHeight >= 0.5 && lineHeight <= 4
    ? lineHeight
    : 1.42;
  const gap = Number.isFinite(lineGapPx) && lineGapPx >= 0 ? lineGapPx : 0;

  const alturaBloco = (px) => (
    typeof medirAlturaBlocoPx === 'function'
      ? medirAlturaBlocoPx(px)
      : n * lh * px + Math.max(0, n - 1) * gap
  );

  const cabe = (px) => medirLarguraMaxPx(px) <= availW + 0.5 && alturaBloco(px) <= availH + 1;

  /* Teto = altura útil inteira repartida pelas linhas. Não há razão para ir além. */
  const tetoAltura = (availH - Math.max(0, n - 1) * gap) / (n * lh);
  const hiInicial = Math.min(maxPx, Math.max(minPx, tetoAltura));
  if (hiInicial <= minPx) return minPx;

  /* Caso comum (poucas linhas / texto curto): já cabe no máximo — nada a encolher. */
  if (cabe(hiInicial)) return hiInicial;

  /* Nem no piso cabe (linha larguíssima): fica no piso e o CSS corta o excesso. */
  if (!cabe(minPx)) return minPx;

  let lo = minPx;
  let hi = hiInicial;
  while (hi - lo > precisaoPx) {
    const mid = (lo + hi) / 2;
    if (cabe(mid)) lo = mid;
    else hi = mid;
  }
  return Math.max(minPx, lo);
}

function classeLinhasParaContagem(n) {
  if (n <= 1) return 'lines-1';
  if (n === 2) return 'lines-2';
  if (n === 3) return 'lines-3';
  if (n === 4) return 'lines-4';
  return 'lines-many';
}

function aplicarClasseLinhasNoElemento(el, lineClass) {
  el.classList.remove('lines-1', 'lines-2', 'lines-3', 'lines-4', 'lines-many');
  el.classList.add(lineClass);
}

let reaplicarFontesQuandoVisivel = false;
let listenerVisibilidadePreviewRegistado = false;

function garantirListenerVisibilidadePreview() {
  if (listenerVisibilidadePreviewRegistado || typeof document === 'undefined') return;
  listenerVisibilidadePreviewRegistado = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !reaplicarFontesQuandoVisivel) return;
    reaplicarFontesQuandoVisivel = false;
    reaplicarFontesPreviewPainel();
  });
}

export function aplicarClasseLinhas(el, texto) {
  if (!el) return;
  garantirListenerVisibilidadePreview();
  const raw = String(texto ?? '');
  const temConteudo = raw.split('\n').some((l) => l.length > 0);
  if (!temConteudo) {
    limparEstiloPreviewSlide(el);
    return;
  }
  const n = raw.split('\n').filter((l) => l.length > 0).length;
  const lineClass = classeLinhasParaContagem(n);
  const textoIgual = el.dataset.previewFonteTexto === raw;
  const classeIgual = el.classList.contains(lineClass);

  el.dataset.previewFonteTexto = raw;
  if (!classeIgual) aplicarClasseLinhasNoElemento(el, lineClass);

  const aplicarFonte = () => {
    const { w, h } = medirCaixaFontePreview(el);
    /* Janela minimizada/oculta: medições instáveis (0×0 ou subpixels) provocam
       «tremida» sem mudança real de conteúdo — adia até voltar a ficar visível. */
    if (w < 40 || h < 40 || (typeof document !== 'undefined' && document.hidden)) {
      reaplicarFontesQuandoVisivel = true;
      return;
    }
    let px = calcularFontePxPreview(raw, w, h);
    // Equilíbrio dos previews do modo slide: o telão (1 slide, caixa cheia) ia ao teto (20px)
    // e ofuscava o ministrante (2 slides). Igualamos o teto dos dois num valor intermediário
    // (18px) para se «encontrarem no meio». Não afeta playlist central nem prévias da Bíblia.
    const ehPreviewSlideModo = el.id === 'pv-live-letras' || el.classList.contains('op-slide-text');
    if (ehPreviewSlideModo) px = Math.min(px, 18);
    const pxStr = px.toFixed(2) + 'px';
    if (textoIgual && classeIgual && el.dataset.previewFontePx === pxStr) return;
    if (el.style.fontSize === pxStr && el.dataset.previewFontePx === pxStr) return;
    el.style.fontSize = pxStr;
    el.dataset.previewFontePx = pxStr;
  };

  aplicarFonte();
  /* Segundo frame só quando ainda não há fonte estável — evita repintura dupla em conteúdo
     que já está dimensionado e estável. */
  if (!textoIgual || !el.dataset.previewFontePx) {
    requestAnimationFrame(() => requestAnimationFrame(aplicarFonte));
  }
}

/** Re-calcula fontes em todos os nós marcados pela prévia dinâmica. */
export function reaplicarFontesPreviewPainel() {
  if (typeof document !== 'undefined' && document.hidden) {
    reaplicarFontesQuandoVisivel = true;
    return;
  }
  document.querySelectorAll('[data-preview-fonte-texto]').forEach((el) => {
    const t = el.dataset.previewFonteTexto;
    if (t != null && t !== '') aplicarClasseLinhas(el, t);
  });
}
