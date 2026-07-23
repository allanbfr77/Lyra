/**
 * publicDisplayConfig.js — Gerenciamento das configurações visuais do display público.
 *
 * Este módulo é injetado via `attachPublicDisplayConfig(ctx)` e estende o contexto
 * recebido com funções para leitura, aplicação e persistência das configurações
 * de estilo do slide público (fonte, cor, espaçamento, alinhamento, etc.).
 *
 * Tamanho da fonte e espaçamento entre linhas seguem a mesma convenção do painel
 * Ministrante (vh 2.2–9 e line-height 1.0–2.4).
 *
 * @param {Object} ctx - Contexto compartilhado da aplicação (document, helpers, estado).
 */
function attachPublicDisplayConfig(ctx) {

  function getCfgRoot() {
    if (typeof ctx.getCurrentCfgCtrl === 'function') return ctx.getCurrentCfgCtrl();
    return ctx.currentCfgCtrl || {};
  }

  function setCfgRoot(next) {
    if (typeof ctx.setCurrentCfgCtrl === 'function') ctx.setCurrentCfgCtrl(next);
    else ctx.currentCfgCtrl = next;
  }

  function lerSelect(id, padrao) {
    return ctx.document.getElementById(id)?.value ?? padrao;
  }

  /**
   * Converte `fontSize` guardado para o novo intervalo em vh (2.2–9), igual ministrante.
   * Arruma JSON antigo onde o slider era 2–40 (vh proporcional maior).
   */
  function normalizarFontSizeVhPublicoParaForm(valor) {
    const v = Number(valor);
    if (!Number.isFinite(v)) return 5.5;
    if (v >= 2.2 && v <= 9) return v;
    if (v >= 2 && v <= 40) return 2.2 + ((v - 2) * (9 - 2.2)) / (40 - 2);
    return Math.min(9, Math.max(2.2, v));
  }

  /**
   * `line-spacing` novo: mesmo que ministrante (LINE-HEIGHT direto entre 1 e 2.4).
   * Legado: valores −0.5 … 1.0 significavam line-height = 1 + valor.
   */
  function normalizarLineHeightParaForm(raw) {
    const v = Number(raw);
    if (!Number.isFinite(v)) return 1.35;
    if (v >= 1.05 && v <= 2.401) return Math.min(2.4, Math.max(1, v));
    if (v >= -0.501 && v < 1.05) return Math.min(2.8, Math.max(0.55, 1 + v));
    return Math.min(2.4, Math.max(1, v));
  }

  function onPublicoSlideCfgChange() {
    const root = getCfgRoot();
    if (!root.publico) root.publico = {};

    root.publico.textColor = lerSelect('cfg-publico-text-color-ctrl', '#ffffff');
    root.publico.fontFamily = lerSelect('cfg-publico-fontfamily-ctrl', 'CMG Sans, sans-serif');
    root.publico.fontSize = ctx.lerNumeroInput('cfg-publico-fontsize-ctrl', root.publico.fontSize ?? 5.5);
    root.publico.negrito = !!ctx.document.getElementById('cfg-publico-negrito-ctrl')?.checked;
    root.publico.italico = !!ctx.document.getElementById('cfg-publico-italico-ctrl')?.checked;
    root.publico.maiusculo = !!ctx.document.getElementById('cfg-publico-maiusculo-ctrl')?.checked;
    root.publico.lineSpacing = ctx.lerNumeroInput('cfg-publico-linespacing-ctrl', root.publico.lineSpacing ?? 1.35);
    root.publico.letterSpacing = parseFloat(lerSelect('cfg-publico-letterspacing-ctrl', '0'));
    root.publico.textAlign = lerSelect('cfg-publico-textalign-ctrl', 'center');
    root.publico.wrapLongLines = !!ctx.document.getElementById('cfg-publico-wrap-ctrl')?.checked;
    root.publico.autoFitLongLines = !!ctx.document.getElementById('cfg-publico-autofit-ctrl')?.checked;

    ctx.setSpanText('cfg-publico-fontsize-val-ctrl', String(root.publico.fontSize));
    ctx.setSpanText('cfg-publico-linespacing-val-ctrl', String(root.publico.lineSpacing));
    ctx.setSpanText('cfg-publico-letterspacing-val-ctrl', String(root.publico.letterSpacing));

    try {
      if (typeof ctx.atualizarDependenciaAutoFitPublico === 'function') {
        ctx.atualizarDependenciaAutoFitPublico();
      }
    } catch (_) {
  // intencional — erro ignorado
}

    ctx.aplicarWrapImediato(root.publico);
    setCfgRoot(root);
    ctx.debounceSalvarCfg();
  }

  /**
   * Compat: antes existia slider separado; agora um único range chama `onPublicoSlideCfgChange`.
   */
  function onPublicoSlideCfgRangeInput() {
    onPublicoSlideCfgChange();
  }

  function aplicarPublicoCfgForm(pb = {}) {
    ctx.setSelVal('cfg-publico-bg-type-ctrl', pb.bgType || 'solid');
    ctx.setInputVal('cfg-publico-bg-color-ctrl', pb.bgColor || '#000000');
    ctx.setInputVal('cfg-publico-bg-gradient-ctrl', pb.bgGradient || '');

    ctx.setInputVal('cfg-publico-text-color-ctrl', pb.textColor || '#ffffff');
    ctx.setSelVal('cfg-publico-fontfamily-ctrl', pb.fontFamily || 'CMG Sans, sans-serif');

    const fs = normalizarFontSizeVhPublicoParaForm(pb.fontSize ?? 5.5);
    ctx.setInputVal('cfg-publico-fontsize-ctrl', fs);
    ctx.setSpanText('cfg-publico-fontsize-val-ctrl', String(fs));

    ctx.setChkVal('cfg-publico-negrito-ctrl', pb.negrito !== false);
    ctx.setChkVal('cfg-publico-italico-ctrl', pb.italico === true);
    ctx.setChkVal('cfg-publico-maiusculo-ctrl', pb.maiusculo !== false);

    const lh = normalizarLineHeightParaForm(pb.lineSpacing ?? 1.35);
    ctx.setInputVal('cfg-publico-linespacing-ctrl', lh);
    ctx.setSpanText('cfg-publico-linespacing-val-ctrl', String(lh));

    ctx.setSelVal('cfg-publico-letterspacing-ctrl', String(pb.letterSpacing ?? 0));
    ctx.setSpanText('cfg-publico-letterspacing-val-ctrl', String(pb.letterSpacing ?? 0));

    ctx.setSelVal('cfg-publico-textalign-ctrl', pb.textAlign || 'center');
    ctx.setChkVal('cfg-publico-wrap-ctrl', pb.wrapLongLines === true);
    ctx.setChkVal('cfg-publico-autofit-ctrl', pb.autoFitLongLines === true);

    try {
      if (typeof ctx.atualizarDependenciaAutoFitPublico === 'function') {
        ctx.atualizarDependenciaAutoFitPublico();
      }
    } catch (_) {
  // intencional — erro ignorado
}
  }

  ctx.onPublicoSlideCfgChange = onPublicoSlideCfgChange;
  ctx.onPublicoSlideCfgRangeInput = onPublicoSlideCfgRangeInput;
  ctx.aplicarPublicoCfgForm = aplicarPublicoCfgForm;
}

if (typeof window !== 'undefined') {
  window.attachPublicDisplayConfig = attachPublicDisplayConfig;
}
