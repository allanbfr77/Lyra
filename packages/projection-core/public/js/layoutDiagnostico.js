'use strict';

/**
 * Instrumentação temporária de layout (Bíblia + relógio).
 *
 * Não altera o auto-fit nem a quebra de linha: só mede a geometria real da janela
 * e do texto, antes e depois do cálculo, para comparar o PC de desenvolvimento
 * com o executável instalado (DPI, zoom, viewport, overflow).
 */

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

function geometriaJanelaRenderer() {
  const vv = typeof window !== 'undefined' && window.visualViewport ? window.visualViewport : null;
  return {
    innerWidth: Number(window.innerWidth) || 0,
    innerHeight: Number(window.innerHeight) || 0,
    visualViewportWidth: vv && Number.isFinite(vv.width) ? vv.width : null,
    visualViewportHeight: vv && Number.isFinite(vv.height) ? vv.height : null,
    visualViewportScale: vv && Number.isFinite(vv.scale) ? vv.scale : null,
    devicePixelRatio: Number(window.devicePixelRatio) || 1,
    screenWidth: window.screen ? window.screen.width : null,
    screenHeight: window.screen ? window.screen.height : null,
    zoomFactor: zoomFactorDestaJanela(),
  };
}

/**
 * Bounds nativos da BrowserWindow. No renderer só existem via IPC; se o invoke
 * falhar, o processo principal ainda anexa os mesmos campos no ficheiro de log.
 */
function obterGeometriaNativa() {
  try {
    const { ipcRenderer } = require('electron');
    if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
      return ipcRenderer.invoke('lyra-janela-geometria');
    }
  } catch (_) {
    // intencional
  }
  return Promise.resolve({
    windowBounds: null,
    contentBounds: null,
    contentSize: null,
    windowsScaleFactor: null,
  });
}

function snapshotElementoTexto(el) {
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    rectWidth: r.width,
    rectHeight: r.height,
    clientWidth: el.clientWidth,
    clientHeight: el.clientHeight,
    scrollWidth: el.scrollWidth,
    scrollHeight: el.scrollHeight,
    computedWidth: cs.width,
    computedHeight: cs.height,
    fontSize: cs.fontSize,
    lineHeight: cs.lineHeight,
    whiteSpace: cs.whiteSpace,
    overflowWrap: cs.overflowWrap,
    wordBreak: cs.wordBreak,
    overflow: cs.overflow,
    overflowX: cs.overflowX,
    paddingLeft: cs.paddingLeft,
    paddingRight: cs.paddingRight,
    boxSizing: cs.boxSizing,
    maxWidth: cs.maxWidth,
    minWidth: cs.minWidth,
  };
}

function snapshotContainerTexto(el) {
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    rectWidth: r.width,
    rectHeight: r.height,
    clientWidth: el.clientWidth,
    clientHeight: el.clientHeight,
    scrollWidth: el.scrollWidth,
    scrollHeight: el.scrollHeight,
    computedWidth: cs.width,
    computedHeight: cs.height,
    paddingLeft: cs.paddingLeft,
    paddingRight: cs.paddingRight,
    whiteSpace: cs.whiteSpace,
    overflow: cs.overflow,
    overflowX: cs.overflowX,
    boxSizing: cs.boxSizing,
    maxWidth: cs.maxWidth,
    minWidth: cs.minWidth,
  };
}

function montarPayloadLayout(opts) {
  const elTexto = opts && opts.elTexto;
  const elContainer = opts && opts.elContainer;
  if (elTexto) void elTexto.offsetWidth;
  return {
    momento: opts && opts.momento ? String(opts.momento) : '',
    ...geometriaJanelaRenderer(),
    windowBounds: opts && opts.windowBounds != null ? opts.windowBounds : null,
    contentBounds: opts && opts.contentBounds != null ? opts.contentBounds : null,
    contentSize: opts && opts.contentSize != null ? opts.contentSize : null,
    windowsScaleFactor: opts && opts.windowsScaleFactor != null ? opts.windowsScaleFactor : null,
    elementoTexto: snapshotElementoTexto(elTexto),
    containerTexto: snapshotContainerTexto(elContainer),
    quebraLinhaAtiva: !!(opts && opts.quebraLinhaAtiva),
    ...(opts && opts.extra && typeof opts.extra === 'object' ? opts.extra : {}),
  };
}

function criterioQueLimitou(cabeH, cabeV) {
  if (!cabeH && !cabeV) return 'ambos';
  if (!cabeH) return 'largura';
  if (!cabeV) return 'altura';
  return 'nenhum';
}

function overflowHorizontal(el) {
  if (!el) return false;
  const w = el.clientWidth;
  return w > 8 && el.scrollWidth > w + 1;
}

function largurasDeRects(rects) {
  const out = [];
  if (!rects) return out;
  for (let i = 0; i < rects.length; i++) {
    const w = Number(rects[i] && rects[i].width);
    if (Number.isFinite(w) && w > 0) out.push(w);
  }
  return out;
}

function rectsDeConteudo(el) {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getClientRects();
  } catch (_) {
    return [];
  }
}

/**
 * Só diagnóstico: resume as linhas pintadas. Não alimenta o auto-fit.
 */
function resumirMedicaoLinhas(opts) {
  const caixa = (opts && opts.caixa) || {};
  const estilos = (opts && opts.estilos) || {};
  const largurasLinhas = Array.isArray(opts && opts.largurasLinhas) ? opts.largurasLinhas.slice() : [];
  const padL = parseFloat(estilos.paddingLeft) || 0;
  const padR = parseFloat(estilos.paddingRight) || 0;
  const clientWidth = Number(caixa.clientWidth) || 0;
  const clientHeight = Number(caixa.clientHeight) || 0;
  const scrollWidth = Number(caixa.scrollWidth) || 0;
  const scrollHeight = Number(caixa.scrollHeight) || 0;
  const larguraUtilCaixa = Math.max(0, clientWidth - padL - padR);
  const maiorLarguraLinha = largurasLinhas.reduce((m, w) => (w > m ? w : m), 0);
  return {
    quantidadeLinhas: largurasLinhas.length,
    largurasLinhas,
    maiorLarguraLinha,
    larguraUtilCaixa,
    clientWidth,
    clientHeight,
    scrollWidth,
    scrollHeight,
    diferencaScrollVsMaiorLinha: scrollWidth - maiorLarguraLinha,
    maiorLinhaUltrapassaLarguraUtil: maiorLarguraLinha > larguraUtilCaixa + 1,
  };
}

/**
 * Mede cada linha visual do versículo (Range.getClientRects).
 * Só leitura — não altera estilo, fonte nem layout.
 */
function medirLinhasRenderizadas(el) {
  if (!el) return null;
  void el.offsetWidth;
  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const caixa = {
    rectWidth: r.width,
    rectHeight: r.height,
    clientWidth: el.clientWidth,
    clientHeight: el.clientHeight,
    scrollWidth: el.scrollWidth,
    scrollHeight: el.scrollHeight,
  };
  const estilos = {
    fontSize: cs.fontSize,
    lineHeight: cs.lineHeight,
    whiteSpace: cs.whiteSpace,
    overflowWrap: cs.overflowWrap,
    wordBreak: cs.wordBreak,
    paddingLeft: cs.paddingLeft,
    paddingRight: cs.paddingRight,
  };

  const filhos = el.querySelectorAll ? Array.from(el.querySelectorAll('.linha-texto')) : [];
  const alvos = filhos.length > 0 ? filhos : [el];
  const largurasLinhas = [];
  const blocosLogicos = [];

  alvos.forEach((alvo, indiceLogico) => {
    const larguras = largurasDeRects(rectsDeConteudo(alvo));
    const usadas = larguras.length > 0 ? larguras : [alvo.getBoundingClientRect().width];
    usadas.forEach((w) => largurasLinhas.push(w));
    blocosLogicos.push({
      indiceLogico,
      quantidadeLinhasVisuais: usadas.length,
      largurasLinhasVisuais: usadas,
      clientWidth: alvo.clientWidth,
      scrollWidth: alvo.scrollWidth,
    });
  });

  return {
    ...resumirMedicaoLinhas({ caixa, estilos, largurasLinhas }),
    caixa,
    estilos,
    blocosLogicos,
  };
}

function anexarGeometriaNativa(payload, geo) {
  const g = geo && typeof geo === 'object' ? geo : {};
  return {
    ...payload,
    windowBounds: g.windowBounds != null ? g.windowBounds : payload.windowBounds,
    contentBounds: g.contentBounds != null ? g.contentBounds : payload.contentBounds,
    contentSize: g.contentSize != null ? g.contentSize : payload.contentSize,
    windowsScaleFactor:
      g.windowsScaleFactor != null ? g.windowsScaleFactor : payload.windowsScaleFactor,
  };
}

function caminhoFicheiroDiagnostico() {
  try {
    const path = require('path');
    const os = require('os');
    return path.join(os.tmpdir(), 'lyra-layout-diagnostico.log');
  } catch (_) {
    return null;
  }
}

function gravarFicheiroDiagnostico(prefixo, payload) {
  try {
    const fs = require('fs');
    const dest = caminhoFicheiroDiagnostico();
    if (!dest) return;
    const linha = `${new Date().toISOString()} ${prefixo} ${JSON.stringify(payload)}\n`;
    fs.appendFileSync(dest, linha, 'utf8');
  } catch (_) {
    // intencional — consola e IPC continuam a funcionar
  }
}

function enviarIpcDiagnostico(prefixo, payload) {
  try {
    const { ipcRenderer } = require('electron');
    if (ipcRenderer && typeof ipcRenderer.send === 'function') {
      ipcRenderer.send('lyra-viewport-janela', {
        tipoDiagnostico: prefixo,
        ...payload,
        em: new Date().toISOString(),
      });
    }
  } catch (_) {
    // intencional
  }
}

function emitirLog(prefixo, payload) {
  const comFicheiro = {
    ...payload,
    ficheiroDiagnostico: caminhoFicheiroDiagnostico(),
  };
  try {
    console.log(prefixo, comFicheiro);
  } catch (_) {
    // intencional
  }
  gravarFicheiroDiagnostico(prefixo, comFicheiro);
  enviarIpcDiagnostico(prefixo, comFicheiro);
}

/**
 * Captura o DOM agora (síncrono — tem de ser antes/depois do auto-fit)
 * e emite um único bloco quando os bounds nativos chegarem.
 */
function capturarPayloadLayout(opts) {
  return montarPayloadLayout(opts);
}

function emitirBlocosComGeometriaNativa(entradas) {
  const lista = Array.isArray(entradas) ? entradas : [];
  obterGeometriaNativa()
    .then((geo) => {
      lista.forEach((item) => {
        if (!item || !item.prefixo) return;
        emitirLog(item.prefixo, anexarGeometriaNativa(item.payload || {}, geo));
      });
    })
    .catch(() => {
      lista.forEach((item) => {
        if (!item || !item.prefixo) return;
        emitirLog(item.prefixo, item.payload || {});
      });
    });
}

module.exports = {
  zoomFactorDestaJanela,
  geometriaJanelaRenderer,
  obterGeometriaNativa,
  snapshotElementoTexto,
  snapshotContainerTexto,
  montarPayloadLayout,
  capturarPayloadLayout,
  criterioQueLimitou,
  overflowHorizontal,
  resumirMedicaoLinhas,
  medirLinhasRenderizadas,
  emitirBlocosComGeometriaNativa,
};
