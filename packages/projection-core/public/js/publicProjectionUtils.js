/**
 * publicProjectionUtils.js — Utilitários de renderização para a projeção pública.
 *
 * Módulo responsável pelas operações de baixo nível que suportam a renderização
 * do slide na tela de projeção:
 *  - Sanitização de HTML (escape)
 *  - Validação de números
 *  - Cálculo da área útil do container
 *  - Renderização de linhas de texto como spans estilizados
 *  - Tamanho em vh (2.2–9 nos slides; aviso até 40 via `fontSizeMaxVh`) e line-height (1–2.4) alinhados ao painel Ministrante
 *  - Autoajuste horizontal (mesma regra que `display-operator.html`)
 *  - Aplicação imediata de wrap de texto
 *
 * Injetado via `attachPublicProjectionUtils(ctx)`, estendendo o contexto compartilhado
 * com todas as funções utilitárias necessárias para os módulos de renderização.
 *
 * @param {Object} ctx - Contexto compartilhado com referências ao DOM e helpers.
 */
function attachPublicProjectionUtils(ctx) {

  // ─── Helpers ─────────────────────────────────────────────────

  /**
   * Retorna a configuração de display atual do contexto.
   * Usa getter do contexto se disponível; caso contrário, acessa diretamente.
   *
   * @returns {Object} Objeto de configuração de display.
   */
  function getDisplayConfig() {
    if (typeof ctx.getDisplayConfig === 'function') return ctx.getDisplayConfig();
    return ctx.displayConfig || {};
  }

  /**
   * Retorna o elemento DOM responsável por exibir as letras na projeção.
   * Usa getter do contexto se disponível; caso contrário, acessa diretamente.
   *
   * @returns {HTMLElement} Elemento container das linhas de texto.
   */
  function getElLetras() {
    if (typeof ctx.getElLetras === 'function') return ctx.getElLetras();
    return ctx.elLetras;
  }

  /**
   * Escala vh do telão público.
   *
   * Teto por omissão: 9 (slides / bíblia). O aviso pode pedir até 40 via
   * `pb.fontSizeMaxVh` — sem isso, valores acima de 9 cairiam no ramo legado 2–40 e
   * seriam remapeados para ~3–5 vh, e o seletor «aumentava» sem o texto crescer.
   */
  function fontSizeVhPublico(pb) {
    const maxPedido = Number(pb && pb.fontSizeMaxVh);
    const teto = Number.isFinite(maxPedido) && maxPedido >= 2.2 ? maxPedido : 9;
    const v = Number(pb && pb.fontSize);
    if (!Number.isFinite(v)) return 5.5;
    if (v >= 2.2 && v <= teto) return v;
    /* JSON antigo 2–40 → vh 2.2–9. Só com o teto padrão: com teto > 9, 10–15 são vh reais. */
    if (teto <= 9 && v >= 2 && v <= 40) return 2.2 + ((v - 2) * (9 - 2.2)) / (40 - 2);
    return Math.min(teto, Math.max(2.2, v));
  }

  /** Line-height CSS absoluto (1–2.4), igual ministrante; legado: incremento −0.5…1 → 1+valor. */
  function lineHeightCssPublico(pb) {
    const raw = Number(pb && pb.lineSpacing);
    if (!Number.isFinite(raw)) return '1.35';
    if (raw >= 1.05 && raw <= 2.401) return String(Math.min(2.4, Math.max(1, raw)));
    if (raw >= -0.501 && raw < 1.05) return String(Math.min(2.8, Math.max(0.55, 1 + raw)));
    return String(Math.min(2.4, Math.max(1, raw)));
  }

  function larguraLimiteMedicaoPx() {
    if (typeof ctx.larguraUtilLetrasPx === 'function') {
      try {
        const w = ctx.larguraUtilLetrasPx();
        if (Number.isFinite(w) && w > 12) return w;
      } catch (_) {}
    }
    const el = getElLetras();
    if (el) {
      void el.offsetWidth;
      const r = el.getBoundingClientRect().width;
      if (Number.isFinite(r) && r > 12) return Math.max(8, Math.floor(r - 4));
    }
    return window.innerWidth * 0.9;
  }

  /**
   * Converte um valor para número positivo dentro de um intervalo seguro.
   * Retorna o valor padrão se o resultado não for um número finito ou estiver
   * fora dos limites definidos.
   *
   * @param {*}      valor   - Valor a ser convertido e validado.
   * @param {number} padrao  - Valor padrão retornado em caso de falha na validação.
   * @param {Object} [opts]  - Opções de intervalo.
   *   @param {number} [opts.min=0.1] - Valor mínimo permitido.
   *   @param {number} [opts.max]     - Valor máximo permitido (sem limite se omitido).
   * @returns {number} Número validado dentro dos limites, ou o padrão.
   */
  function numeroPositivoSeguro(valor, padrao, opts = {}) {
    const min = Number.isFinite(opts.min) ? opts.min : 0.1;
    const max = Number.isFinite(opts.max) ? opts.max : null;
    const n = Number(valor);
    if (!Number.isFinite(n)) return padrao;  // Rejeita NaN e Infinity
    if (n < min) return padrao;              // Rejeita valores abaixo do mínimo
    if (max !== null && n > max) return max; // Limita ao máximo se definido
    return n;
  }

  /**
   * Escapa caracteres especiais HTML em uma string para evitar injeção de HTML.
   * Converte: & < > " ' para suas respectivas entidades HTML.
   *
   * @param {*} str - Valor a ser escapado (convertido para string se necessário).
   * @returns {string} String com caracteres HTML escapados.
   */
  function escaparHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── Area util do container (descontando padding) ──────────────────

  /**
   * Calcula a área útil (largura e altura) do elemento pai do container de letras,
   * descontando os paddings CSS aplicados ao pai.
   *
   * Utilizado para determinar o espaço real disponível para o conteúdo do slide.
   *
   * @param {HTMLElement} elLetras - Elemento container das linhas de texto.
   * @returns {{ largura: number, altura: number }} Dimensões úteis em pixels.
   */
  function getAreaUtil(elLetras) {
    const parent = elLetras.parentElement;

    // Se não houver pai, usa as dimensões da janela como fallback
    if (!parent) return { largura: window.innerWidth, altura: window.innerHeight };

    const style = window.getComputedStyle(parent);
    const pl = parseFloat(style.paddingLeft) || 0;
    const pr = parseFloat(style.paddingRight) || 0;
    const pt = parseFloat(style.paddingTop) || 0;
    const pb = parseFloat(style.paddingBottom) || 0;

    return {
      largura: (parent.clientWidth || window.innerWidth) - pl - pr,
      altura: (parent.clientHeight || window.innerHeight) - pt - pb,
    };
  }

  // ─── Renderiza linhas como spans e aplica estilos base ───────────────

  /**
   * Renderiza um array de linhas de texto no elemento de letras da projeção.
   * Cada linha é criada como um `<span class="linha-texto">` com display block.
   *
   * Aplica todos os estilos visuais (fonte, cor, espaçamento, alinhamento, wrap)
   * diretamente no elemento container antes de injetar o HTML das linhas.
   *
   * @param {string[]} linhas - Array de strings a serem exibidas como linhas.
   * @param {Object}   cfg    - Configuração de display com sub-objeto `publico`.
   */
  function renderizarLinhas(linhas, cfg) {
    const elLetras = getElLetras();
    if (!elLetras) return;

    const pb = cfg.publico || {};

    /** Padrões do `displayConfig`: negrito e maiúsculas ativos se a chave vier ausente (JSON antigo). */
    const usarMaiusculas = pb.maiusculo !== false;
    const wrap = pb.wrapLongLines === true;
    const usarNegrito = pb.negrito !== false;
    const italico = pb.italico === true;
    const fontFamily = pb.fontFamily || 'CMG Sans, sans-serif';
    const textColor = pb.textColor || '#ffffff';
    const letterSpacing = numeroPositivoSeguro(pb.letterSpacing, 0, { min: -10, max: 30 });
    const lineHeightStr = lineHeightCssPublico(pb);

    // ── Aplica estilos CSS no container de letras ──────────────────
    elLetras.style.fontFamily = fontFamily;
    elLetras.style.fontWeight = usarNegrito ? 'bold' : 'normal';
    elLetras.style.fontStyle = italico ? 'italic' : 'normal';
    elLetras.style.color = textColor;
    elLetras.style.letterSpacing = `${letterSpacing}px`;
    elLetras.style.lineHeight = lineHeightStr;
    elLetras.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
    elLetras.style.overflowWrap = wrap ? 'anywhere' : 'normal';
    elLetras.style.wordBreak = wrap ? 'break-word' : 'normal';
    elLetras.style.textAlign = pb.textAlign || 'center';

    // ── Gera o HTML das linhas escapado e, opcionalmente, em maiúsculas ──
    elLetras.innerHTML = linhas
      .map((l) => {
        const texto = usarMaiusculas ? escaparHtml(l).toUpperCase() : escaparHtml(l);
        return `<span class="linha-texto" style="display:block">${texto}</span>`;
      })
      .join('');
  }

  // ─── Calcula e aplica o fontSize ideal ─────────────────────────────────
  // Tecnica igual ao Holyrics: vh como unidade base + medidor invisivel

  /**
   * Aplica `font-size` em vh (teto 9 nos slides; aviso pode ir a 40 via
   * `fontSizeMaxVh`) e, se o autoajuste estiver activo (mesma regra
   * que `display-operator.html`: sem wrap → sempre ajusta; com wrap → só se
   * `autoFitLongLines`), reduz até a linha caber na largura útil.
   *
   * Aviso (`exactFontSize`): o valor de Ajustes aplica-se tal qual — sem encolher.
   * Sem isto, com «quebra de linha» desligada o autoajuste travava por volta de
   * ~17 vh (largura da palavra) e o slider 17→40 não mudava nada no ecrã.
   */
  function aplicarFontSize(cfg) {
    const elLetras = getElLetras();
    if (!elLetras) return;

    const pb = cfg.publico || {};
    const baseVh = fontSizeVhPublico(pb);
    elLetras.style.fontSize = `${baseVh}vh`;

    if (pb.exactFontSize === true) return;

    const wrap = pb.wrapLongLines === true;
    const autoFit = wrap ? pb.autoFitLongLines === true : true;
    if (!autoFit) return;

    const usarMaiusculas = pb.maiusculo !== false;

    const linhas = [];
    elLetras.querySelectorAll('.linha-texto').forEach((span) => {
      const txt = span.textContent;
      if (txt) linhas.push(txt);
    });
    if (!linhas.length) return;

    const limite = larguraLimiteMedicaoPx();
    if (!Number.isFinite(limite) || limite <= 0) return;

    const medidor = document.createElement('span');
    medidor.style.position = 'fixed';
    medidor.style.left = '-99999px';
    medidor.style.top = '-99999px';
    medidor.style.visibility = 'hidden';
    medidor.style.whiteSpace = 'pre';
    medidor.style.fontFamily = pb.fontFamily || 'CMG Sans, sans-serif';
    medidor.style.fontWeight = pb.negrito !== false ? 'bold' : 'normal';
    medidor.style.fontStyle = pb.italico ? 'italic' : 'normal';
    medidor.style.letterSpacing = `${pb.letterSpacing != null ? pb.letterSpacing : 0}px`;
    medidor.style.textTransform = usarMaiusculas ? 'uppercase' : 'none';
    ctx.document.body.appendChild(medidor);

    let atual = baseVh;
    const minimo = 2.1;
    while (atual > minimo) {
      medidor.style.fontSize = `${atual}vh`;
      let maior = 0;
      for (const l of linhas) {
        const amostra = (l || ' ');
        medidor.textContent = usarMaiusculas ? amostra.toUpperCase() : amostra;
        maior = Math.max(maior, medidor.getBoundingClientRect().width);
      }
      if (maior <= limite) break;
      atual -= 0.2;
    }
    ctx.document.body.removeChild(medidor);
    elLetras.style.fontSize = `${Math.max(minimo, atual)}vh`;
  }

  // ─── Aplica wrap imediato (para o painel reagir rapido) ──────────────

  /**
   * Aplica as propriedades CSS de quebra de linha imediatamente no container
   * de letras, sem aguardar uma re-renderização completa.
   *
   * Usado para feedback visual instantâneo no painel do controller quando
   * o usuário alterna a opção de wrap.
   *
   * @param {Object} pb - Sub-objeto de configuração pública com `wrapLongLines`.
   */
  function aplicarWrapImediato(pb) {
    const elLetras = getElLetras();
    if (!elLetras) return;

    const wrap = pb.wrapLongLines === true;

    // Aplica ou remove as propriedades de quebra de linha
    elLetras.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
    elLetras.style.overflowWrap = wrap ? 'anywhere' : 'normal';
    elLetras.style.wordBreak = wrap ? 'break-word' : 'normal';
  }

  // ─── Exporta ─────────────────────────────────────────────────────

  // Disponibiliza todas as funções utilitárias no contexto compartilhado
  ctx.numeroPositivoSeguro = numeroPositivoSeguro;
  ctx.escaparHtml = escaparHtml;
  ctx.getAreaUtil = getAreaUtil;
  ctx.renderizarLinhas = renderizarLinhas;
  ctx.aplicarFontSize = aplicarFontSize;
  ctx.aplicarWrapImediato = aplicarWrapImediato;
}

module.exports = { attachPublicProjectionUtils };
