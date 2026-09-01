/**
 * publicProjectionUtils.js — Utilitários de renderização para a projeção pública.
 *
 * Módulo responsável pelas operações de baixo nível que suportam a renderização
 * do slide na tela de projeção:
 *  - Sanitização de HTML (escape)
 *  - Validação de números
 *  - Cálculo da área útil do container
 *  - Renderização de linhas de texto como spans estilizados
 *  - Tamanho em vh (1–14 nos slides; aviso até 40 via `fontSizeMaxVh`) e line-height (1–2.4) alinhados ao painel Ministrante
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
   * Teto por omissão: 14 (slides / bíblia). O aviso pode pedir até 40 via
   * `pb.fontSizeMaxVh` — sem isso, valores acima de 14 cairiam no ramo legado 2–40 e
   * seriam remapeados, e o seletor «aumentava» sem o texto crescer.
   */
  function fontSizeVhPublico(pb) {
    const maxPedido = Number(pb && pb.fontSizeMaxVh);
    const teto = Number.isFinite(maxPedido) && maxPedido >= 2.2 ? maxPedido : 14;
    const v = Number(pb && pb.fontSize);
    if (!Number.isFinite(v)) return 5.5;
    if (v >= 1 && v <= teto) return v;
    /* JSON antigo 2–40 → só quando o valor está claramente fora do slider novo. */
    if (teto <= 14 && v > teto && v <= 40) return teto;
    return Math.min(teto, Math.max(1, v));
  }

  /** Line-height CSS absoluto (1–2.4), igual ministrante; legado: incremento −0.5…1 → 1+valor. */
  function lineHeightCssPublico(pb) {
    const raw = Number(pb && pb.lineSpacing);
    if (!Number.isFinite(raw)) return '1.35';
    if (raw >= 1.05 && raw <= 2.401) return String(Math.min(2.4, Math.max(1, raw)));
    if (raw >= -0.501 && raw < 1.05) return String(Math.min(2.8, Math.max(0.55, 1 + raw)));
    return String(Math.min(2.4, Math.max(1, raw)));
  }

  function zoomFactorDestaJanela() {
    try {
      const electron = require('electron');
      const zf = electron.webFrame && electron.webFrame.getZoomFactor;
      if (typeof zf === 'function') return Number(zf.call(electron.webFrame)) || 1;
    } catch (_) {
      // intencional — fora do Electron
    }
    return 1;
  }

  function snapshotCaixa(el) {
    if (!el) return null;
    const cs = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      id: el.id || '',
      className: String(el.className || ''),
      rectWidth: r.width,
      rectHeight: r.height,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      offsetWidth: el.offsetWidth,
      offsetHeight: el.offsetHeight,
      width: cs.width,
      height: cs.height,
      maxWidth: cs.maxWidth,
      minWidth: cs.minWidth,
      padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      borderLeftWidth: cs.borderLeftWidth,
      borderRightWidth: cs.borderRightWidth,
      overflow: cs.overflow,
      overflowX: cs.overflowX,
      transform: cs.transform,
      zoom: cs.zoom,
      boxSizing: cs.boxSizing,
      display: cs.display,
      flex: cs.flex,
      flexShrink: cs.flexShrink,
      alignSelf: cs.alignSelf,
      whiteSpace: cs.whiteSpace,
      overflowWrap: cs.overflowWrap,
      wordBreak: cs.wordBreak,
      fontSize: cs.fontSize,
    };
  }

  function cadeiaPais(el) {
    const out = [];
    let n = el;
    let guarda = 0;
    while (n && guarda < 8) {
      out.push(snapshotCaixa(n));
      if (n === ctx.document.documentElement) break;
      n = n.parentElement;
      guarda += 1;
    }
    return out;
  }

  function enviarDiagnosticoAutoFitPublico(payload) {
    const info = {
      papel: 'publico',
      tipo: 'autofit-publico',
      ...payload,
      em: new Date().toISOString(),
    };
    try {
      const { ipcRenderer } = require('electron');
      if (ipcRenderer && typeof ipcRenderer.send === 'function') {
        ipcRenderer.send('lyra-viewport-janela', info);
      }
    } catch (_) {
      // intencional
    }
    try {
      console.log('[Lyra autofit M2]', info);
    } catch (_) {
      // intencional
    }
  }

  function coletarDiagnosticoAutoFitPublico(extra) {
    const elLetras = getElLetras();
    const elTela = ctx.elTela;
    const vv = window.visualViewport;
    let zoomCssTela = null;
    let zoomCssLetras = null;
    try {
      zoomCssTela = elTela ? window.getComputedStyle(elTela).zoom : null;
      zoomCssLetras = elLetras ? window.getComputedStyle(elLetras).zoom : null;
    } catch (_) {
      // intencional
    }
    const linha0 = elLetras && elLetras.querySelector('.linha-texto');
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualViewportWidth: vv && vv.width,
      visualViewportHeight: vv && vv.height,
      visualViewportScale: vv && vv.scale,
      devicePixelRatio: window.devicePixelRatio,
      zoomFactor: zoomFactorDestaJanela(),
      tela: snapshotCaixa(elTela),
      letras: snapshotCaixa(elLetras),
      primeiraLinha: snapshotCaixa(linha0),
      telaTransform: elTela ? window.getComputedStyle(elTela).transform : null,
      letrasTransform: elLetras ? window.getComputedStyle(elLetras).transform : null,
      telaZoom: zoomCssTela,
      letrasZoom: zoomCssLetras,
      paisDeLetras: cadeiaPais(elLetras),
      ...(extra && typeof extra === 'object' ? extra : {}),
    };
  }

  function paddingHorizontalPx(el) {
    if (!el) return 0;
    const cs = window.getComputedStyle(el);
    return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  }

  function larguraConteudoPx(el) {
    if (!el || !(el.clientWidth > 12)) return 0;
    return Math.max(8, el.clientWidth - paddingHorizontalPx(el));
  }

  function larguraJanelaPx() {
    const vv = window.visualViewport && window.visualViewport.width;
    const w = Number.isFinite(vv) && vv > 12 ? vv : window.innerWidth;
    return Number.isFinite(w) && w > 12 ? w : 0;
  }

  /**
   * Tecto de largura desta janela: o menor entre o `.letras`, o `.tela` e o viewport.
   * Não usar só o getBoundingClientRect do texto — com `white-space:pre` o flex
   * infla essa caixa até à linha inteira e o autoajuste «acha» que já cabe.
   */
  function larguraLimiteMedicaoPx() {
    if (typeof ctx.larguraUtilLetrasPx === 'function') {
      try {
        const w = ctx.larguraUtilLetrasPx();
        if (Number.isFinite(w) && w > 12) return w;
      } catch (_) {}
    }
    const el = getElLetras();
    const elTela = ctx.elTela;
    if (el) void el.offsetWidth;
    const candidatos = [larguraConteudoPx(el), larguraConteudoPx(elTela), larguraJanelaPx()]
      .filter((w) => Number.isFinite(w) && w > 12);
    if (candidatos.length) return Math.max(8, Math.floor(Math.min(...candidatos)));
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
    /* `anywhere` encosta o último glifo à borda; `break-word` só parte se a palavra não couber. */
    elLetras.style.overflowWrap = wrap ? 'break-word' : 'normal';
    elLetras.style.wordBreak = 'normal';
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
   * Altura útil do contentor do `.letras` (`.tela` menos padding).
   * O próprio `.letras` cresce com o texto, por isso `clientHeight` dele não é o tecto.
   */
  function alturaUtilContentorPx(el) {
    const parent = el && el.parentElement;
    if (!parent) return window.innerHeight;
    const cs = window.getComputedStyle(parent);
    const pad =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    return Math.max(8, parent.clientHeight - pad);
  }

  /**
   * Cabe na caixa PINTADA desta janela. Sem piso de fonte: ou cabe, ou ainda transborda.
   */
  function letrasCabemNaCaixaPublico(el) {
    if (!el) return true;
    void el.offsetWidth;
    const w = el.clientWidth;
    if (w > 8 && el.scrollWidth > w + 1) return false;
    const maxH = alturaUtilContentorPx(el);
    if (maxH > 8 && el.scrollHeight > maxH + 1) return false;
    return true;
  }

  function letrasCabemNaLarguraDaJanela(el) {
    return letrasCabemNaCaixaPublico(el);
  }

  /**
   * Encolhe só o necessário, proporcional ao overflow real.
   * O 0,15 vh é só guarda de loop (fonte 0) — não é um tamanho «válido» se ainda cortar.
   */
  function encolherFonteAteLetrasCaberem(el, fonteMaxVh) {
    let vh = fonteMaxVh;
    el.style.fontSize = `${vh}vh`;
    if (letrasCabemNaCaixaPublico(el)) return vh;

    const pisoLoop = 0.15;
    for (let i = 0; i < 28; i++) {
      void el.offsetWidth;
      const cw = el.clientWidth;
      const sw = el.scrollWidth;
      const sh = el.scrollHeight;
      const maxH = alturaUtilContentorPx(el);
      let factor = 1;
      if (cw > 8 && sw > cw + 1) factor = Math.min(factor, cw / sw);
      if (maxH > 8 && sh > maxH + 1) factor = Math.min(factor, maxH / sh);
      if (factor >= 0.999) break;
      vh = vh * factor * 0.992;
      if (vh < pisoLoop) vh = pisoLoop;
      el.style.fontSize = `${vh}vh`;
      if (letrasCabemNaCaixaPublico(el)) break;
      if (vh <= pisoLoop) break;
    }
    return fonteVhAplicada(el, vh);
  }

  /**
   * Aplica `font-size` em vh (teto dos Ajustes) e, se o conteúdo transbordar,
   * reduz proporcionalmente até `scrollWidth <= clientWidth` e a altura caber
   * no `.tela`. Sem piso rígido de 2 vh: o tamanho sai da área × o texto.
   *
   * Slides curtos: já cabem no teto → não encolhem.
   * Aviso (`exactFontSize`): o valor de Ajustes aplica-se tal qual.
   */
  function aplicarFontSize(cfg) {
    const elLetras = getElLetras();
    if (!elLetras) return;

    const pb = cfg.publico || {};
    const baseVh = fontSizeVhPublico(pb);
    elLetras.style.fontSize = `${baseVh}vh`;
    void elLetras.offsetWidth;

    const wrap = pb.wrapLongLines === true;
    const autoFit = wrap ? pb.autoFitLongLines === true : true;
    const diagnostico = {
      wrapLongLines: wrap,
      autoFitLongLines: pb.autoFitLongLines === true,
      autoFitLarguraActivo: autoFit,
      exactFontSize: pb.exactFontSize === true,
      vhInicial: baseVh,
      candidatosPx: {
        letrasConteudoPx: larguraConteudoPx(elLetras),
        telaConteudoPx: larguraConteudoPx(ctx.elTela),
        janelaPx: larguraJanelaPx(),
        larguraUtilLetrasPx:
          typeof ctx.larguraUtilLetrasPx === 'function' ? ctx.larguraUtilLetrasPx() : null,
        limiteUsadoPx: larguraLimiteMedicaoPx(),
      },
      letrasCabiamAntes: letrasCabemNaCaixaPublico(elLetras),
      maiorLinhaNaBasePx: elLetras.scrollWidth,
      antes: coletarDiagnosticoAutoFitPublico({}),
    };

    if (pb.exactFontSize === true) {
      enviarDiagnosticoAutoFitPublico({
        ...diagnostico,
        motivo: 'exactFontSize — autoajuste não correu',
      });
      return;
    }

    const vhFinal = encolherFonteAteLetrasCaberem(elLetras, baseVh);

    diagnostico.maiorLinhaQuandoParouPx = elLetras.scrollWidth;
    diagnostico.vhAposMedidor = vhFinal;
    diagnostico.vhFinal = fonteVhAplicada(elLetras, vhFinal);
    diagnostico.letrasCabiamDepois = letrasCabemNaCaixaPublico(elLetras);
    diagnostico.depois = coletarDiagnosticoAutoFitPublico({});
    enviarDiagnosticoAutoFitPublico(diagnostico);
  }

  function fonteVhAplicada(el, fallback) {
    const v = parseFloat(el && el.style.fontSize);
    return Number.isFinite(v) && v > 0 ? v : fallback;
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

    elLetras.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
    elLetras.style.overflowWrap = wrap ? 'break-word' : 'normal';
    elLetras.style.wordBreak = 'normal';
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
