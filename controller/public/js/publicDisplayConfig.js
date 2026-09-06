/**
 * publicDisplayConfig.js — Gerenciamento das configurações visuais do display público.
 *
 * Este módulo é injetado via `attachPublicDisplayConfig(ctx)` e estende o contexto
 * recebido com funções para leitura, aplicação e persistência das configurações
 * de estilo do slide público (fonte, cor, espaçamento, alinhamento, etc.).
 *
 * Tamanho da fonte do telão: vh 0–12. Espaçamento: line-height 1.00–2.40.
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
   * Converte `fontSize` guardado para o slider do telão (0–12).
   * 13 e 14 (e o slider antigo 2–40) passam a 12.
   */
  function normalizarFontSizeVhPublicoParaForm(valor) {
    const v = Number(valor);
    if (!Number.isFinite(v)) return 6;
    if (v >= 0 && v <= 12) return Math.round(v);
    if (v > 12 && v <= 40) return 12;
    return Math.min(12, Math.max(0, Math.round(v)));
  }

  /**
   * Line-height directo (1.00–2.40). Legado: só valores abaixo de 1 (1 + valor).
   * 1.00 já não soma 1 — era isso que fazia 1.00 parecer 2.00 no telão.
   */
  function normalizarLineHeightParaForm(raw) {
    const v = Number(raw);
    if (!Number.isFinite(v)) return 1.35;
    if (v >= 1 && v <= 2.401) return Math.min(2.4, Math.max(1, v));
    if (v >= -0.501 && v < 1) return Math.min(2.8, Math.max(0.55, 1 + v));
    return Math.min(2.4, Math.max(1, v));
  }

  function lerChk(id) {
    if (typeof ctx.getChkVal === 'function') return !!ctx.getChkVal(id);
    const el = ctx.document.getElementById(id);
    if (!el) return false;
    if (el.classList?.contains('cfg-switch') || el.getAttribute('role') === 'switch') {
      return el.getAttribute('aria-checked') === 'true';
    }
    return !!el.checked;
  }

  function onPublicoSlideCfgChange() {
    const root = getCfgRoot();
    if (!root.publico) root.publico = {};

    root.publico.textColor = lerSelect('cfg-publico-text-color-ctrl', '#ffffff');
    root.publico.fontFamily = lerSelect('cfg-publico-fontfamily-ctrl', 'CMG Sans, sans-serif');
    root.publico.fontSize = normalizarFontSizeVhPublicoParaForm(
      ctx.lerNumeroInput('cfg-publico-fontsize-ctrl', root.publico.fontSize ?? 5.5)
    );
    root.publico.negrito = lerChk('cfg-publico-negrito-ctrl');
    root.publico.italico = lerChk('cfg-publico-italico-ctrl');
    root.publico.maiusculo = lerChk('cfg-publico-maiusculo-ctrl');
    root.publico.lineSpacing = normalizarLineHeightParaForm(
      ctx.lerNumeroInput('cfg-publico-linespacing-ctrl', root.publico.lineSpacing ?? 1.35)
    );
    root.publico.letterSpacing = parseFloat(lerSelect('cfg-publico-letterspacing-ctrl', '0'));
    root.publico.textAlign = lerSelect('cfg-publico-textalign-ctrl', 'center');
    root.publico.wrapLongLines = lerChk('cfg-publico-wrap-ctrl');
    root.publico.autoFitLongLines = lerChk('cfg-publico-autofit-ctrl');

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
