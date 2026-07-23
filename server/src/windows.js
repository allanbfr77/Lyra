'use strict';

const path = require('path');
const displayRoutingMod = require('./lib/displayRouting');
const displayIndicesMod = require('./lib/displayIndices');
const displayConfigLib = require('./lib/displayConfig');
const projectionPayloads = require('./lib/projectionPayloads');
const projectionEncerrar = require('./lib/projectionEncerrar');
const displayConfigModo = require('./lib/displayConfigModo');
const { getOrderedDisplays } = require('./lib/monitorsList');
const { caminhoIconeApp } = require('./lib/iconPath');

const { indicesJanelasProjecaoDeRoteamentoDual } = displayRoutingMod;

/** Fundo nativo Electron — independente de CSS/config; evita flash do desktop. */
const PRETO_NATIVO_PROJECAO = '#000000';

/**
 * Opções comuns das janelas de projeção (telão / ministrante).
 * @param {object} display Entrada de `getOrderedDisplays(screen)`.
 * @param {string} title
 * @param {{ zoomFactor?: number }} [extra]
 */
function opcoesBrowserWindowProjecao(display, title, extra = {}) {
  const d = display;
  const webPrefs = {
    nodeIntegration: true,
    contextIsolation: false,
    backgroundThrottling: false,
    ...(extra.webPreferences || {}),
  };
  return {
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
    icon: caminhoIconeApp(),
    show: true,
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title,
    backgroundColor: PRETO_NATIVO_PROJECAO,
    webPreferences: webPrefs,
  };
}

/**
 * Janela de controle + telas de projeção (público / ministrante) e push de estado.
 * @param {object} ctx Estado mutável (`serverContext.js`).
 * @param {object} paths Objeto retornado por `createUserPaths(userData)`.
 * @param {{ logError: Function, screen: object, BrowserWindow: object, app: object, WINDOW_TITLE: string }} deps
 */
function createWindowsApi(ctx, paths, deps) {
  const { logError, screen, BrowserWindow, app, WINDOW_TITLE } = deps;

  function obterDisplaysOrdenados() {
    return getOrderedDisplays(screen);
  }

  /** Evita sincronizações concorrentes de monitores (janelas duplicadas / órfãs). */
  let syncTelasEmAndamento = false;
  let syncTelasReagendar = false;
  /** @type {Array<() => void>} */
  const syncTelasCallbacksPendentes = [];

  function estadoOciosoPublico() {
    return projectionPayloads.estadoPublicoOcioso();
  }

  function estadoOciosoMinistrante() {
    return projectionEncerrar.estadoOciosoMinistrante();
  }

  function loadDisplayRouting() {
    return displayRoutingMod.loadDisplayRouting(paths.displayRoutingPath);
  }

  function loadDisplayIndices() {
    return displayIndicesMod.loadDisplayIndices(paths.displaySettingsPath);
  }

  function getJanelaControle() {
    return ctx.windowControl && !ctx.windowControl.isDestroyed() ? ctx.windowControl : null;
  }

  function atualizarDisplays(estado) {
    const payload = projectionPayloads.clonePayloadSafe(estado);
    const payloadPublico = projectionPayloads.payloadPublicoAtual(payload, ctx.estadoPublicoOverride);
    const payloadPublicoJanelas = ctx.projecaoLiveAtiva ? estadoOciosoPublico() : payloadPublico;

    const telasPublicas = ctx.windowsDisplay.filter((entry) => entry?.role === 'publico');
    telasPublicas.forEach((entry) => {
      const win = entry.win;
      if (!win || win.isDestroyed()) return;
      try { win.webContents.send('atualizar', payloadPublicoJanelas); } catch (_) {
  // intencional — erro ignorado
}
    });

    if (ctx.windowControl && !ctx.windowControl.isDestroyed()) {
      ctx.windowControl.webContents.send('estado_atualizado', payload);
    }
  }

  function atualizarDisplayMinistrante(estado) {
    let payload;
    if (ctx.projecaoLiveAtiva) {
      payload = estadoOciosoMinistrante();
    } else if (ctx.ministranteApresentacaoOverride) {
      try {
        payload = JSON.parse(JSON.stringify(ctx.ministranteApresentacaoOverride));
      } catch (_) {
        payload = ctx.ministranteApresentacaoOverride;
      }
    } else {
      try {
        payload = JSON.parse(JSON.stringify(estado));
      } catch (_) {
        payload = estado;
      }
      const tipoAtual = ctx.estadoAtual?.tipo;
      let modoMin = 'texto';
      if (tipoAtual === 'biblia') modoMin = 'biblia';
      else if (tipoAtual === 'musica') modoMin = 'musica';
      payload = {
        modo: modoMin,
        titulo: payload.titulo || '',
        atual: payload.atual || '',
        proximo: payload.proximo || '',
        projecaoAtiva: hayProjecaoAtivaMinistrante(),
        telaLimpa: !!payload.telaLimpa,
      };
    }

    ctx.windowsDisplay
      .filter((entry) => entry?.role === 'ministrante')
      .forEach((entry) => {
        const win = entry.win;
        if (!win || win.isDestroyed()) return;
        try { win.webContents.send('atualizar_ministrante', payload); } catch (_) {
  // intencional — erro ignorado
}
      });
  }

  function estadoPublicoParaSocketsOuApi() {
    const out = projectionPayloads.estadoPublicoParaSocketsOuApi(
      ctx.estadoAtual,
      ctx.estadoPublicoOverride,
      ctx.ministranteApresentacaoOverride
    );
    if (out && typeof out === 'object') out.projecaoLive = !!ctx.projecaoLiveAtiva;
    return out;
  }

  function snapshotMinistranteAtual() {
    return projectionPayloads.snapshotMinistranteAtual(ctx.estadoAtual, logError);
  }

  function controladorAtivo() {
    return !!ctx.controladorSocketId;
  }

  function hayProjecaoAtivaPublica() {
    if (ctx.projecaoLiveAtiva) return false;
    const st = projectionPayloads.payloadPublicoAtual(ctx.estadoAtual, ctx.estadoPublicoOverride);
    if (!st || typeof st !== 'object') return false;
    if (st.blackout || st.slidePretoFinal) return true;
    if (st.telaLimpa) return false;
    if (st.tipo === 'apresentacao') {
      return !!(st.apresentacao && String(st.apresentacao.src || '').trim());
    }
    if (st.tipo === 'aviso') {
      return Array.isArray(st.linhas) && st.linhas.length > 0;
    }
    return Array.isArray(st.linhas) && st.linhas.length > 0;
  }

  function hayProjecaoAtivaMinistrante() {
    if (ctx.projecaoLiveAtiva) return false;
    const snap = snapshotMinistranteAtual();
    if (!snap || typeof snap !== 'object') return false;
    if (snap.telaLimpa) return false;
    return !!(String(snap.atual || '').trim() || String(snap.proximo || '').trim());
  }

  function aplicarPretoInativoNasJanelasAbertas() {
    const pubOcioso = estadoOciosoPublico();
    const minOcioso = estadoOciosoMinistrante();
    ctx.projecaoLiveAtiva = false;
    ctx.estadoPublicoOverride = null;
    ctx.ministranteApresentacaoOverride = null;
    ctx.estadoAtual = pubOcioso;
    ctx.estadoMinistrante = minOcioso;
    atualizarDisplays(pubOcioso);
    atualizarDisplayMinistrante(minOcioso);
    ctx.windowsDisplay
      .filter((entry) => entry?.role === 'escudo' && entry?.win && !entry.win.isDestroyed())
      .forEach((entry) => {
        try { entry.win.webContents.send('atualizar', pubOcioso); } catch (_) {
  // intencional — erro ignorado
}
      });
  }

  function fecharTodasJanelasProjecao() {
    ctx.windowsDisplay.forEach((entry) => {
      if (entry?.win && !entry.win.isDestroyed()) {
        try { entry.win.close(); } catch (_) {
  // intencional — erro ignorado
}
      }
    });
    ctx.windowsDisplay = [];
  }

  function encerrarProjecaoPorEsc(canal) {
    const canais = {
      apresentacaoDominaPublico: true,
      apresentacaoDominaMinistrante: !!ctx.ministranteApresentacaoOverride,
    };
    const modo = projectionEncerrar.inferirModoEncerrarPorCanalJanela(ctx, canal, canais);
    if (modo !== projectionEncerrar.MODO_SLIDES) return;

    projectionEncerrar.encerrarCamadaSlides(ctx);
    ctx.estadoMinistrante = snapshotMinistranteAtual();
    atualizarDisplays(ctx.estadoAtual);
    atualizarDisplayMinistrante(ctx.estadoMinistrante);

    if (ctx.windowControl && !ctx.windowControl.isDestroyed()) {
      ctx.windowControl.webContents.send('telas_projecao_encerradas_esc');
    }

    if (ctx.io) ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
  }

  /** Garante fullscreen e fundo nativo assim que a janela existe. */
  function finalizarJanelaProjecaoNativa(win, opts = {}) {
    if (!win || win.isDestroyed()) return;
    const backgroundColor = opts.backgroundColor || PRETO_NATIVO_PROJECAO;
    try { win.setBackgroundColor(backgroundColor); } catch (_) {
  // intencional — erro ignorado
}
    try { win.setAlwaysOnTop(true); } catch (_) {
  // intencional — erro ignorado
}
    try { win.setFullScreen(true); } catch (_) {
  // intencional — erro ignorado
}
    try { if (!win.isVisible()) win.show(); } catch (_) {
  // intencional — erro ignorado
}
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      try { win.setFullScreen(true); } catch (_) {
  // intencional — erro ignorado
}
      try { win.show(); } catch (_) {
  // intencional — erro ignorado
}
    });
  }

  function finalizarJanelaRelogioNativa(win) {
    if (!win || win.isDestroyed()) return;
    try { win.setBackgroundColor(PRETO_NATIVO_PROJECAO); } catch (_) {
  // intencional — erro ignorado
}
    try { win.setAlwaysOnTop(false); } catch (_) {
  // intencional — erro ignorado
}
    try { win.setFullScreen(true); } catch (_) {
  // intencional — erro ignorado
}
    try { if (!win.isVisible()) win.show(); } catch (_) {
  // intencional — erro ignorado
}
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      try { win.setFullScreen(true); } catch (_) {
  // intencional — erro ignorado
}
      try { win.show(); } catch (_) {
  // intencional — erro ignorado
}
    });
  }

  function enviarBootstrapJanelaPublica(win) {
    const forcarModo = displayConfigModo.inferirForcarModoJanelas(ctx);
    const cfg = displayConfigModo.resolverConfigParaJanelas(ctx, { forcarModo });
    const payload = hayProjecaoAtivaPublica()
      ? projectionPayloads.payloadPublicoAtual(ctx.estadoAtual, ctx.estadoPublicoOverride)
      : estadoOciosoPublico();
    try {
      win.webContents.send('display_config', cfg);
      win.webContents.send('atualizar', payload);
    } catch (_) {
  // intencional — erro ignorado
}
  }

  function enviarBootstrapJanelaMinistrante(win) {
    const forcarModo = displayConfigModo.inferirForcarModoJanelas(ctx);
    const cfg = displayConfigModo.resolverConfigParaJanelas(ctx, { forcarModo });
    const payload = hayProjecaoAtivaMinistrante()
      ? snapshotMinistranteAtual()
      : estadoOciosoMinistrante();
    try {
      win.webContents.send('display_config', cfg);
      win.webContents.send('atualizar_ministrante', payload);
    } catch (_) {
  // intencional — erro ignorado
}
  }

  function resolverClockConfigPersistida() {
    return {
      ...(displayConfigLib.DEFAULT_DISPLAY_CONFIG.clock || {}),
      ...(((ctx.displayConfig || {}).clock) || {}),
    };
  }

  function enviarDisplayConfigParaJanelasRelogio(targetWin = null) {
    const cfg = { clock: resolverClockConfigPersistida() };
    const entradas = targetWin
      ? [{ win: targetWin }]
      : ctx.windowsDisplay.filter((entry) => entry?.role === 'relogio');
    entradas.forEach((entry) => {
      const win = entry?.win;
      if (!win || win.isDestroyed()) return;
      try { win.webContents.send('display_config', cfg); } catch (_) {
  // intencional — erro ignorado
}
    });
  }

  function indicesMonitoresRelogioDesejados() {
    const ck = resolverClockConfigPersistida();
    if (ck.showClock === false) return [];
    const alvo = String(ck.monitorRelogio || 'ministrante').toLowerCase();
    const displays = obterDisplaysOrdenados();
    const fixos = loadDisplayIndices().filter((i) => i >= 0 && i < displays.length);
    const publicoIndex = fixos[0] != null ? fixos[0] : displays.length > 1 ? 1 : 0;
    const ministranteIndex = fixos[1] != null ? fixos[1] : publicoIndex;
    const desejados = new Set();
    if ((alvo === 'publico' || alvo === 'ambos') && publicoIndex >= 0) desejados.add(publicoIndex);
    if ((alvo === 'ministrante' || alvo === 'ambos') && ministranteIndex >= 0) desejados.add(ministranteIndex);
    return Array.from(desejados);
  }

  function podeAbrirJanelaSecundaria() {
    return obterDisplaysOrdenados().length > 1;
  }

  function abrirJanelaRelogio(displayIndex, label) {
    const displays = obterDisplaysOrdenados();
    if (!podeAbrirJanelaSecundaria()) return null;
    if (!displays[displayIndex]) return null;
    const d = displays[displayIndex];
    const win = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      show: false,
      fullscreen: true,
      frame: false,
      alwaysOnTop: false,
      skipTaskbar: true,
      title: label,
      backgroundColor: PRETO_NATIVO_PROJECAO,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
        zoomFactor: d.scaleFactor || 1,
      },
    });
    finalizarJanelaRelogioNativa(win);
    win.loadFile(path.join(__dirname, '../public/display-clock.html'));
    win.setMenuBarVisibility(false);
    win.webContents.on('did-finish-load', () => {
      enviarDisplayConfigParaJanelasRelogio(win);
    });
    return win;
  }

  function sincronizarJanelasRelogio() {
    const desejados = new Set(indicesMonitoresRelogioDesejados());
    const displays = obterDisplaysOrdenados();
    const restantes = [];

    ctx.windowsDisplay.forEach((entry) => {
      if (entry?.role !== 'relogio') {
        restantes.push(entry);
        return;
      }
      const win = entry?.win;
      if (!win || win.isDestroyed()) return;
      if (!desejados.has(entry.index) || !displays[entry.index]) {
        try { win.close(); } catch (_) {
  // intencional — erro ignorado
}
        return;
      }
      const d = displays[entry.index];
      try {
        if (win.isFullScreen()) win.setFullScreen(false);
        win.setBounds({
          x: d.bounds.x,
          y: d.bounds.y,
          width: d.bounds.width,
          height: d.bounds.height,
        });
        win.setAlwaysOnTop(false);
        win.setFullScreen(true);
        if (!win.isVisible()) win.show();
      } catch (_) {
  // intencional — erro ignorado
}
      enviarDisplayConfigParaJanelasRelogio(win);
      restantes.push(entry);
      desejados.delete(entry.index);
    });

    ctx.windowsDisplay = restantes;

    desejados.forEach((displayIndex) => {
      const win = abrirJanelaRelogio(displayIndex, `Relógio (Monitor ${displayIndex + 1})`);
      if (!win) return;
      ctx.windowsDisplay.push({ role: 'relogio', index: displayIndex, win });
    });
  }

  function abrirJanelaTela(displayIndex, label) {
    const displays = obterDisplaysOrdenados();
    if (!podeAbrirJanelaSecundaria()) return null;
    if (!displays[displayIndex]) return null;
    const d = displays[displayIndex];

    const win = new BrowserWindow(
      {
        ...opcoesBrowserWindowProjecao(d, label, {
          webPreferences: { zoomFactor: d.scaleFactor || 1 },
        }),
        show: false,
        transparent: true,
        backgroundColor: '#00000000',
      }
    );
    finalizarJanelaProjecaoNativa(win, { backgroundColor: '#00000000' });

    win.loadFile(path.join(__dirname, '../public/display.html'));
    win.setMenuBarVisibility(false);

    win.webContents.on('did-finish-load', () => {
      enviarBootstrapJanelaPublica(win);
    });

    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault();
        encerrarProjecaoPorEsc('publico');
      }
    });

    return win;
  }

  /** Janela preta nativa sem canal de projeção (não recebe slide/bíblia/apresentação). */
  function abrirJanelaEscudoPreto(displayIndex, label) {
    const displays = obterDisplaysOrdenados();
    if (!podeAbrirJanelaSecundaria()) return null;
    if (!displays[displayIndex]) return null;
    const d = displays[displayIndex];

    const win = new BrowserWindow(
      opcoesBrowserWindowProjecao(d, label, {
        webPreferences: { zoomFactor: d.scaleFactor || 1 },
      })
    );
    finalizarJanelaProjecaoNativa(win);

    win.loadFile(path.join(__dirname, '../public/display.html'));
    win.setMenuBarVisibility(false);

    win.webContents.on('did-finish-load', () => {
      try {
        const forcarModo = displayConfigModo.inferirForcarModoJanelas(ctx);
        const cfg = displayConfigModo.resolverConfigParaJanelas(ctx, { forcarModo });
        win.webContents.send('display_config', cfg);
        win.webContents.send('atualizar', estadoOciosoPublico());
      } catch (_) {
  // intencional — erro ignorado
}
    });

    return win;
  }

  function abrirJanelaMinistrante(displayIndex, label) {
    const displays = obterDisplaysOrdenados();
    if (!podeAbrirJanelaSecundaria()) return null;
    if (!displays[displayIndex]) return null;

    const d = displays[displayIndex];

    const win = new BrowserWindow({
      ...opcoesBrowserWindowProjecao(d, label),
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
    });
    finalizarJanelaProjecaoNativa(win, { backgroundColor: '#00000000' });

    win.loadFile(path.join(__dirname, '../public/display-operator.html'));
    win.setMenuBarVisibility(false);

    win.webContents.on('did-finish-load', () => {
      enviarBootstrapJanelaMinistrante(win);
    });

    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault();
        encerrarProjecaoPorEsc('ministrante');
      }
    });
    return win;
  }

  /** Resolve índices de monitor com fallbacks (mesma lógica de abrirTelasConfiguradas). */
  function resolverIndicesEfetivosProjecao(routingDual) {
    const displays = obterDisplaysOrdenados();
    const merged = indicesJanelasProjecaoDeRoteamentoDual(routingDual);
    let publicoIndex = merged.publicoIndex;
    let ministranteIndex = merged.ministranteIndex;
    const fallback = loadDisplayIndices().filter((i) => i < displays.length);

    if (publicoIndex !== -1 && !(publicoIndex < displays.length)) {
      publicoIndex = fallback[0] != null ? fallback[0] : displays.length > 1 ? 1 : 0;
    }
    if (ministranteIndex !== -1 && !(ministranteIndex < displays.length)) {
      const fallback2 = fallback[1] != null ? fallback[1] : publicoIndex;
      ministranteIndex = fallback2;
    }

    return { publicoIndex, ministranteIndex, displays };
  }

  function resolverIndiceJanelaPersistenteMinistrante(routingDual) {
    const { ministranteIndex, displays } = resolverIndicesEfetivosProjecao(routingDual);
    if (ministranteIndex >= 0) return ministranteIndex;
    if (!controladorAtivo()) return -1;
    const fixos = loadDisplayIndices().filter((i) => i >= 0 && i < displays.length);
    return fixos[1] != null ? fixos[1] : -1;
  }

  /**
   * Monitores de projeção que devem ter janela preta nativa (escudo) sem receber conteúdo de slide/bíblia.
   * Ex.: Bíblia só no M2 → escudo no M3; não altera índices de roteamento público/ministrante.
   */
  function indicesMonitoresEscudoPreto(routingDual) {
    const { publicoIndex, displays } = resolverIndicesEfetivosProjecao(routingDual);
    const ministranteIndex = resolverIndiceJanelaPersistenteMinistrante(routingDual);
    const emUso = new Set();
    if (publicoIndex >= 0) emUso.add(publicoIndex);
    if (ministranteIndex >= 0) emUso.add(ministranteIndex);
    indicesMonitoresRelogioDesejados().forEach((idx) => {
      if (idx >= 0 && idx < displays.length) emUso.add(idx);
    });
    const paineis = loadDisplayIndices().filter((i) => i >= 0 && i < displays.length);
    return paineis.filter((i) => !emUso.has(i));
  }

  /**
   * Troca de monitor: mantém a janela antiga até a nova estar visível no destino.
   */
  function substituirJanelaNoMonitor(entrada, displayIndex, criarFn, labelFn) {
    if (!entrada?.win || entrada.win.isDestroyed()) return null;
    const antiga = entrada.win;
    const novoWin = criarFn(displayIndex, labelFn(displayIndex));
    if (!novoWin) return null;

    let trocou = false;
    const aplicarTroca = () => {
      if (trocou || novoWin.isDestroyed()) return;
      if (!novoWin.isVisible()) return;
      trocou = true;
      entrada.index = displayIndex;
      entrada.win = novoWin;
      if (antiga && !antiga.isDestroyed()) {
        try { antiga.close(); } catch (_) {
  // intencional — erro ignorado
}
      }
    };

    novoWin.once('ready-to-show', aplicarTroca);
    novoWin.webContents.once('did-finish-load', () => {
      try {
        if (!novoWin.isVisible()) novoWin.show();
        finalizarJanelaProjecaoNativa(novoWin);
      } catch (_) {
  // intencional — erro ignorado
}
      aplicarTroca();
    });

    return novoWin;
  }

  function obterEntradasPorRole(role) {
    return ctx.windowsDisplay.filter(
      (e) => e?.role === role && e?.win && !e.win.isDestroyed()
    );
  }

  function fecharJanelasPorRole(role) {
    const restantes = [];
    ctx.windowsDisplay.forEach((entry) => {
      if (entry?.role === role && entry?.win && !entry.win.isDestroyed()) {
        try { entry.win.close(); } catch (_) {
  // intencional — erro ignorado
}
      } else {
        restantes.push(entry);
      }
    });
    ctx.windowsDisplay = restantes;
  }

  /** Aguarda janela preta visível antes de abrir a seguinte (evita M2 sem fullscreen no Windows). */
  function aguardarJanelaProjecaoVisivel(win, cb) {
    if (!win || win.isDestroyed()) {
      if (typeof cb === 'function') cb();
      return;
    }
    if (win.isVisible()) {
      if (typeof cb === 'function') cb();
      return;
    }
    let concluiu = false;
    const finalizar = () => {
      if (concluiu || win.isDestroyed()) return;
      if (!win.isVisible()) return;
      concluiu = true;
      if (typeof cb === 'function') cb();
    };
    win.once('ready-to-show', finalizar);
    win.webContents.once('did-finish-load', () => {
      try {
        if (!win.isVisible()) win.show();
        finalizarJanelaProjecaoNativa(win);
      } catch (_) {
  // intencional — erro ignorado
}
      finalizar();
    });
  }

  function sincronizarJanelaRole(role, displayIndex, abrirFn, labelFn, next) {
    const entradas = obterEntradasPorRole(role);

    if (displayIndex < 0) {
      // Ocultar em vez de fechar — mantém entrada para reusar sem recriar (evita flash)
      entradas.forEach((entry) => {
        if (entry?.win && !entry.win.isDestroyed()) {
          try {
            if (role === 'ministrante') {
              entry.win.webContents.send('atualizar_ministrante', estadoOciosoMinistrante());
            } else {
              entry.win.webContents.send('atualizar', estadoOciosoPublico());
            }
          } catch (_) {
  // intencional — erro ignorado
}
          try {
            // hide() direto — não tocar no fullscreen enquanto visível (evita flash do desktop)
            entry.win.hide();
          } catch (_) {
  // intencional — erro ignorado
}
        }
      });
      if (typeof next === 'function') next();
      return;
    }

    const principal = entradas[0] || null;
    entradas.slice(1).forEach((extra) => {
      if (extra?.win && !extra.win.isDestroyed()) {
        try { extra.win.close(); } catch (_) {
  // intencional — erro ignorado
}
      }
    });
    if (entradas.length > 1) {
      ctx.windowsDisplay = ctx.windowsDisplay.filter(
        (e) => !(e?.role === role && e !== principal)
      );
    }

    if (principal) {
      if (!principal.win.isVisible()) {
        // Janela estava oculta — reposicionar e mostrar sem recriar
        // Sequência: sair do fullscreen (oculta = sem flash) → setBounds → show → fullscreen
        const displays = obterDisplaysOrdenados();
        const d = displays[displayIndex];
        if (d && !principal.win.isDestroyed()) {
          try {
            if (principal.win.isFullScreen()) principal.win.setFullScreen(false);
            principal.win.setBounds({
              x: d.bounds.x,
              y: d.bounds.y,
              width: d.bounds.width,
              height: d.bounds.height,
            });
            principal.win.show();
            principal.win.setFullScreen(true);
            principal.win.setAlwaysOnTop(true);
            principal.index = displayIndex;
          } catch (_) {
  // intencional — erro ignorado
}
        }
      } else if (principal.index !== displayIndex) {
        substituirJanelaNoMonitor(principal, displayIndex, abrirFn, labelFn);
      }
      if (typeof next === 'function') next();
      return;
    }

    const win = abrirFn(displayIndex, labelFn(displayIndex));
    if (win) {
      ctx.windowsDisplay.push({ role, index: displayIndex, win });
      aguardarJanelaProjecaoVisivel(win, next);
      return;
    }
    if (typeof next === 'function') next();
  }

  function sincronizarJanelasEscudo(indicesDesejados, next) {
    const desejados = new Set(indicesDesejados);
    const restantes = [];
    ctx.windowsDisplay.forEach((entry) => {
      if (entry?.role === 'escudo') {
        if (entry?.win && !entry.win.isDestroyed()) {
          restantes.push(entry);
          if (!desejados.has(entry.index)) {
            // hide() direto — não tocar no fullscreen enquanto visível (evita flash do desktop)
            try { entry.win.hide(); } catch (_) {
  // intencional — erro ignorado
}
          } else if (!entry.win.isVisible()) {
            // Escudo estava oculto — reposicionar e mostrar no mesmo monitor
            // Sequência: sair do fullscreen (oculto = sem flash) → setBounds → show → fullscreen
            const displays = obterDisplaysOrdenados();
            const d = displays[entry.index];
            try {
              if (entry.win.isFullScreen()) entry.win.setFullScreen(false);
              if (d) {
                entry.win.setBounds({
                  x: d.bounds.x,
                  y: d.bounds.y,
                  width: d.bounds.width,
                  height: d.bounds.height,
                });
              }
              entry.win.show();
              entry.win.setFullScreen(true);
              entry.win.setAlwaysOnTop(true);
            } catch (_) {
  // intencional — erro ignorado
}
          }
        }
        // sem janela válida: descarta (não empurra para restantes)
      } else {
        restantes.push(entry);
      }
    });
    ctx.windowsDisplay = restantes;

    // Inclui ocultos: janela já existe, não precisa criar nova
    const abertos = new Set(
      ctx.windowsDisplay
        .filter((e) => e?.role === 'escudo' && e?.win && !e.win.isDestroyed())
        .map((e) => e.index)
    );
    const pendentes = indicesDesejados.filter((i) => !abertos.has(i));

    if (!pendentes.length) {
      if (typeof next === 'function') next();
      return;
    }

    let faltam = pendentes.length;
    const umTerminou = () => {
      faltam -= 1;
      if (faltam <= 0 && typeof next === 'function') next();
    };

    pendentes.forEach((displayIndex) => {
      const win = abrirJanelaEscudoPreto(displayIndex, `Escudo (Monitor ${displayIndex + 1})`);
      if (win) {
        ctx.windowsDisplay.push({ role: 'escudo', index: displayIndex, win });
        aguardarJanelaProjecaoVisivel(win, umTerminou);
      } else {
        umTerminou();
      }
    });
  }

  function finalizarSincronizacaoTelas(onComplete) {
    syncTelasEmAndamento = false;
    if (typeof onComplete === 'function') {
      try { onComplete(); } catch (e) {
        logError('sync-telas-oncomplete', e);
      }
    }
    if (syncTelasReagendar) {
      syncTelasReagendar = false;
      const callbacks = syncTelasCallbacksPendentes.splice(0);
      sincronizarTelasComRota(loadDisplayRouting(), () => {
        callbacks.forEach((cb) => {
          try { cb(); } catch (e) {
            logError('sync-telas-callback-pendente', e);
          }
        });
      });
    }
  }

  /**
   * Alinha janelas de projeção à rota sem destruir/recriar — troca de monitor imperceptível.
   * @param {object} routingDual
   * @param {() => void} [onComplete]
   */
  function sincronizarTelasComRota(routingDual, onComplete) {
    if (syncTelasEmAndamento) {
      syncTelasReagendar = true;
      if (typeof onComplete === 'function') syncTelasCallbacksPendentes.push(onComplete);
      return;
    }

    syncTelasEmAndamento = true;
    const { publicoIndex } = resolverIndicesEfetivosProjecao(routingDual);
    const ministranteIndex = resolverIndiceJanelaPersistenteMinistrante(routingDual);
    const escudos = indicesMonitoresEscudoPreto(routingDual);

    if (publicoIndex < 0 && ministranteIndex < 0 && escudos.length === 0) {
      fecharJanelasPorRole('relogio');
      if (controladorAtivo()) {
        aplicarPretoInativoNasJanelasAbertas();
      } else {
        fecharTodasJanelasProjecao();
      }
      finalizarSincronizacaoTelas(onComplete);
      return;
    }

    sincronizarJanelaRole(
      'publico',
      publicoIndex,
      abrirJanelaTela,
      (i) => `Telão (Monitor ${i + 1})`,
      () => {
        sincronizarJanelaRole(
          'ministrante',
          ministranteIndex,
          abrirJanelaMinistrante,
          (i) => `Ministrante (Monitor ${i + 1})`,
          () => {
            sincronizarJanelasEscudo(escudos, () => {
              sincronizarJanelasRelogio(routingDual);
              finalizarSincronizacaoTelas(onComplete);
            });
          }
        );
      }
    );
  }

  function abrirTelasConfiguradas() {
    const routingDual = loadDisplayRouting();
    sincronizarTelasComRota(routingDual);
    const { publicoIndex, ministranteIndex } = resolverIndicesEfetivosProjecao(routingDual);
    const sPublico = publicoIndex >= 0 ? `monitor ${publicoIndex + 1}` : 'desativado';
    const sMin = ministranteIndex >= 0 ? `monitor ${ministranteIndex + 1}` : 'desativado';
    return `Público: ${sPublico} · Ministrante: ${sMin}`;
  }

  function telasAbertasCorrespondemRota(routingDualOuLegado) {
    const routingDual = routingDualOuLegado?.version === 2
      ? routingDualOuLegado
      : displayRoutingMod.normalizarRoteamentoDual(routingDualOuLegado);
    const { publicoIndex: pub } = resolverIndicesEfetivosProjecao(routingDual);
    const min = resolverIndiceJanelaPersistenteMinistrante(routingDual);
    // Apenas janelas visíveis — ocultas não contam para evitar resync espúrio
    const pubWins = ctx.windowsDisplay.filter((e) => e?.role === 'publico' && e?.win && !e.win.isDestroyed() && e.win.isVisible());
    const minWins = ctx.windowsDisplay.filter((e) => e?.role === 'ministrante' && e?.win && !e.win.isDestroyed() && e.win.isVisible());

    if (pub < 0 && min < 0) {
      if (controladorAtivo()) {
        return pubWins.length + minWins.length > 0;
      }
      return pubWins.length === 0 && minWins.length === 0;
    }

    if (pub < 0) {
      if (pubWins.length !== 0) return false;
    } else if (pubWins.length !== 1 || pubWins[0].index !== pub) {
      return false;
    }
    if (min < 0) {
      if (minWins.length !== 0) return false;
    } else if (minWins.length !== 1 || minWins[0].index !== min) {
      return false;
    }

    const escudoIndices = indicesMonitoresEscudoPreto(routingDual);
    const escudoWins = ctx.windowsDisplay.filter(
      (e) => e?.role === 'escudo' && e?.win && !e.win.isDestroyed() && e.win.isVisible()
    );
    for (const idx of escudoIndices) {
      if (escudoWins.filter((e) => e.index === idx).length !== 1) return false;
    }
    for (const entry of escudoWins) {
      if (!escudoIndices.includes(entry.index)) return false;
    }

    return true;
  }

  function garantirTelasAbertasParaProjecao() {
    const routingDual = loadDisplayRouting();
    const { publicoIndex: pub } = resolverIndicesEfetivosProjecao(routingDual);
    const min = resolverIndiceJanelaPersistenteMinistrante(routingDual);

    const escudos = indicesMonitoresEscudoPreto(routingDual);
    if (pub < 0 && min < 0 && escudos.length === 0) {
      fecharJanelasPorRole('relogio');
      if (controladorAtivo()) {
        aplicarPretoInativoNasJanelasAbertas();
        return;
      }
      fecharTodasJanelasProjecao();
      return;
    }
    if (telasAbertasCorrespondemRota(routingDual)) {
      if (!hayProjecaoAtivaPublica() && obterEntradasPorRole('publico').length) {
        atualizarDisplays(estadoOciosoPublico());
      }
      if (!hayProjecaoAtivaMinistrante() && obterEntradasPorRole('ministrante').length) {
        atualizarDisplayMinistrante(estadoOciosoMinistrante());
      }
      const pubOcioso = estadoOciosoPublico();
      ctx.windowsDisplay
        .filter((entry) => entry?.role === 'escudo' && entry?.win && !entry.win.isDestroyed())
        .forEach((entry) => {
          try { entry.win.webContents.send('atualizar', pubOcioso); } catch (_) {
  // intencional — erro ignorado
}
        });
      sincronizarJanelasRelogio(routingDual);
      return;
    }
    sincronizarTelasComRota(routingDual, () => {
      try {
        const forcarModo = displayConfigModo.inferirForcarModoJanelas(ctx);
        displayConfigModo.enviarDisplayConfigParaJanelas(ctx, { forcarModo });
        sincronizarJanelasRelogio(routingDual);
        if (!hayProjecaoAtivaPublica()) atualizarDisplays(estadoOciosoPublico());
        else atualizarDisplays(ctx.estadoAtual);
        if (!hayProjecaoAtivaMinistrante()) atualizarDisplayMinistrante(estadoOciosoMinistrante());
        else atualizarDisplayMinistrante(ctx.estadoMinistrante);
      } catch (e) {
        logError('garantir-telas-abertas', e);
      }
    });
  }

  function criarJanelaControle() {
    ctx.windowControl = new BrowserWindow({
      width: 400,
      height: 550,
      resizable: false,
      title: WINDOW_TITLE,
      icon: caminhoIconeApp(),
      backgroundColor: '#111111',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });

    ctx.windowControl.loadFile(path.join(__dirname, '../public/control.html'));

    ctx.windowControl.on('page-title-updated', (event) => {
      event.preventDefault();
      ctx.windowControl?.setTitle(WINDOW_TITLE);
    });

    ctx.windowControl.webContents.on('did-finish-load', () => {
      ctx.windowControl?.setTitle(WINDOW_TITLE);
    });

    ctx.windowControl.on('minimize', (e) => {
      if (!ctx.minimizeToTrayEnabled) return;
      e.preventDefault();
      ctx.windowControl.setSkipTaskbar(true);
      ctx.windowControl.hide();
    });

    ctx.windowControl.on('show', () => {
      if (!ctx.windowControl || ctx.windowControl.isDestroyed()) return;
      ctx.windowControl.setSkipTaskbar(false);
    });

    ctx.windowControl.on('closed', () => app.quit());
  }

  function showMainWindow() {
    if (!ctx.windowControl || ctx.windowControl.isDestroyed()) return;
    ctx.windowControl.setSkipTaskbar(false);
    if (ctx.windowControl.isMinimized()) ctx.windowControl.restore();
    ctx.windowControl.show();
    ctx.windowControl.focus();
  }

  function recarregarJanelaControle() {
    const win = getJanelaControle();
    if (!win) return false;
    try {
      win.webContents.reloadIgnoringCache();
      return true;
    } catch (e) {
      logError('recarregar-janela-controle', e);
      return false;
    }
  }

  function openMainDevTools() {
    if (!ctx.windowControl || ctx.windowControl.isDestroyed()) return;
    showMainWindow();
    try { ctx.windowControl.webContents.openDevTools({ mode: 'detach' }); } catch (_) {
  // intencional — erro ignorado
}
  }

  function openDisplayDevToolsPorRole(role = null) {
    const possuiJanelaAlvo = role
      ? ctx.windowsDisplay.some((e) => e?.role === role && e?.win && !e.win.isDestroyed())
      : ctx.windowsDisplay.length > 0;

    if (!possuiJanelaAlvo) {
      try { garantirTelasAbertasParaProjecao(); } catch (_) {
  // intencional — erro ignorado
}
      setTimeout(() => abrirDevToolsPorRole(role), 1000);
      return 0;
    }
    return abrirDevToolsPorRole(role);
  }

  function abrirDevToolsPorRole(role) {
    let n = 0;
    ctx.windowsDisplay.forEach((entry) => {
      if (role && entry?.role !== role) return;
      const win = entry?.win;
      if (!win || win.isDestroyed()) return;
      try {
        win.webContents.openDevTools({ mode: 'detach' });
        n += 1;
      } catch (_) {
  // intencional — erro ignorado
}
    });
    return n;
  }

  function openDisplayDevTools() {
    return openDisplayDevToolsPorRole();
  }

  function openPublicDevTools() {
    return openDisplayDevToolsPorRole('publico');
  }

  function openMinistranteDevTools() {
    return openDisplayDevToolsPorRole('ministrante');
  }

  function enviarComandoAudioParaControle(channel, payload = {}) {
    if (!ctx.windowControl || ctx.windowControl.isDestroyed()) return;
    try {
      ctx.windowControl.webContents.send(channel, payload);
    } catch (_) {
  // intencional — erro ignorado
}
  }

  /** Sincroniza vídeo do card 5 nas janelas de projeção (público e ministrante). */
  function enviarSyncVideoApresentacaoParaDisplays(payload = {}) {
    const data = payload && typeof payload === 'object' ? payload : {};
    ctx.windowsDisplay.forEach((entry) => {
      const win = entry?.win;
      if (!win || win.isDestroyed()) return;
      try {
        win.webContents.send('apresentacao_video_sync', data);
      } catch (_) {
  // intencional — erro ignorado
}
    });
  }

  return {
    getJanelaControle,
    atualizarDisplays,
    atualizarDisplayMinistrante,
    estadoPublicoParaSocketsOuApi,
    snapshotMinistranteAtual,
    encerrarProjecaoPorEsc,
    fecharTodasJanelasProjecao,
    abrirTelasConfiguradas,
    garantirTelasAbertasParaProjecao,
    sincronizarJanelasRelogio,
    criarJanelaControle,
    showMainWindow,
    recarregarJanelaControle,
    openMainDevTools,
    openDisplayDevTools,
    openPublicDevTools,
    openMinistranteDevTools,
    enviarComandoAudioParaControle,
    enviarSyncVideoApresentacaoParaDisplays,
    loadDisplayRouting,
  };
}

module.exports = { createWindowsApi };
