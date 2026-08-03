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
const { createControlWindowApi } = require('./controlWindow');
const { createProjectionState } = require('./lib/projectionState');
const { createWindowRegistry } = require('./lib/windowRegistry');

const { indicesJanelasProjecaoDeRoteamentoDual } = displayRoutingMod;

/** Fundo nativo Electron — independente de CSS/config; evita flash do desktop. */
const PRETO_NATIVO_PROJECAO = '#000000';

/**
 * Nível mais alto do Electron no Windows — acima de outros programas de projeção
 * que também usam always-on-top / fullscreen (EasyWorship, ProPresenter, etc.).
 * @see https://www.electronjs.org/docs/latest/api/browser-window#winsetalwaysontopflag-level
 */
const NIVEL_TOPO_PROJECAO = 'screen-saver';

/** Roles que devem cobrir o outro software de projeção (relógio fica atrás de propósito). */
const ROLES_TOPO_ABSOLUTO = new Set(['publico', 'ministrante', 'escudo']);

/** Intervalo do reclaim global — outro TOPMOST no M2 sobe a z-order sem tirar foco do M3. */
const INTERVALO_RECLAIM_TOPO_MS = 800;

/**
 * Mantém a janela de projeção acima de qualquer outro app topmost.
 * O construtor só aceita `alwaysOnTop: true` (nível padrão); o nível alto
 * precisa de `setAlwaysOnTop(true, 'screen-saver')` + `moveTop()`.
 * @param {import('electron').BrowserWindow} win
 */
function aplicarTopoAbsolutoProjecao(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setAlwaysOnTop(true, NIVEL_TOPO_PROJECAO);
  } catch (_) {
    try {
      win.setAlwaysOnTop(true);
    } catch (__) {
      // intencional — erro ignorado
    }
  }
  try {
    win.moveTop();
  } catch (_) {
    // intencional — erro ignorado
  }
}

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
 *
 * O motor de projeção lê e escreve o estado SÓ pela porta `state`
 * (`lib/projectionState.js`) — nunca pelo `ctx` directamente. Ver
 * docs/architecture/windows-extraction-plan.md §4, sub-passo 1.
 *
 * O motor não acede mais ao `ctx`: fala com a porta de estado (`state`) e com o host
 * (`onProjecaoEncerrada`, `haOperadorConectado`). O `ctx` só continua no parâmetro porque
 * a janela de controle do Server — que não é motor — é criada aqui e sai no sub-passo 4.
 *
 * @param {object} ctx Estado mutável (`serverContext.js`) — usado só pela janela de controle.
 * @param {object} paths Objeto retornado por `createUserPaths(userData)`.
 * @param {{
 *   logError: Function, screen: object, BrowserWindow: object, app: object, WINDOW_TITLE: string,
 *   onProjecaoEncerrada: (ev: { canal: string|null, estadoPublico: object }) => void,
 *   haOperadorConectado: () => boolean,
 *   state?: object
 * }} deps
 *   `onProjecaoEncerrada` — o motor avisa que a projeção terminou por Esc; o host propaga
 *   (no Server, `io.emit('estado', …)`). O motor não conhece transporte.
 *   `haOperadorConectado` — ver `controladorAtivo()` abaixo.
 *   `state` — permite injectar outra porta de estado (o Core, mais à frente); omitido, a
 *   porta é criada sobre o próprio `ctx`.
 */
function createWindowsApi(ctx, paths, deps) {
  const { logError, screen, BrowserWindow, app, WINDOW_TITLE } = deps;

  /* Obrigatórios de propósito: um default silencioso aqui é uma regressão silenciosa
     (deixar de avisar os controladores, ou fechar telas que deviam ficar pretas). */
  const { onProjecaoEncerrada, haOperadorConectado } = deps;
  if (typeof onProjecaoEncerrada !== 'function') {
    throw new TypeError('createWindowsApi: deps.onProjecaoEncerrada é obrigatório');
  }
  if (typeof haOperadorConectado !== 'function') {
    throw new TypeError('createWindowsApi: deps.haOperadorConectado é obrigatório');
  }

  /** Porta de estado do motor. Encaminha para o `ctx` enquanto o motor viver no Server. */
  const state = deps.state || createProjectionState(ctx);

  /* Registo das janelas de projeção — privado ao motor desde o sub-passo 3b. Nada fora
     daqui o manipula; quem precisa de lêr usa `janelasDeProjecao()`. */
  const registro = createWindowRegistry();

  const controlWindowApi = createControlWindowApi(ctx, { logError, BrowserWindow, app, WINDOW_TITLE });

  function obterDisplaysOrdenados() {
    return getOrderedDisplays(screen);
  }

  /** Evita sincronizações concorrentes de monitores (janelas duplicadas / órfãs). */
  let syncTelasEmAndamento = false;
  let syncTelasReagendar = false;
  /** @type {Array<() => void>} */
  const syncTelasCallbacksPendentes = [];
  /** @type {ReturnType<typeof setInterval> | null} */
  let topoAbsolutoIntervalId = null;

  /**
   * Reafirma topo em TODAS as janelas de projeção visíveis.
   * Necessário em multi-monitor: o concorrente pode cobrir só o M2 sem gerar blur no M3.
   */
  function reafirmarTopoTodasJanelasProjecao() {
    for (const entry of registro.todas()) {
      if (!ROLES_TOPO_ABSOLUTO.has(entry?.role)) continue;
      const win = entry?.win;
      if (!win || win.isDestroyed() || !win.isVisible()) continue;
      aplicarTopoAbsolutoProjecao(win);
    }
  }

  function haJanelaProjecaoVisivelNoTopo() {
    return registro.todas().some((entry) => {
      if (!ROLES_TOPO_ABSOLUTO.has(entry?.role)) return false;
      const win = entry?.win;
      return !!(win && !win.isDestroyed() && win.isVisible());
    });
  }

  /** Mantém loop de reclaim enquanto houver telão/ministrante/escudo visível. */
  function atualizarLoopTopoAbsolutoProjecao() {
    if (haJanelaProjecaoVisivelNoTopo()) {
      if (!topoAbsolutoIntervalId) {
        topoAbsolutoIntervalId = setInterval(() => {
          try {
            reafirmarTopoTodasJanelasProjecao();
          } catch (_) {
            // intencional — erro ignorado
          }
          if (!haJanelaProjecaoVisivelNoTopo()) {
            atualizarLoopTopoAbsolutoProjecao();
          }
        }, INTERVALO_RECLAIM_TOPO_MS);
        if (typeof topoAbsolutoIntervalId.unref === 'function') {
          topoAbsolutoIntervalId.unref();
        }
      }
      return;
    }
    if (topoAbsolutoIntervalId) {
      clearInterval(topoAbsolutoIntervalId);
      topoAbsolutoIntervalId = null;
    }
  }

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

  function atualizarDisplays(estado) {
    const payload = projectionPayloads.clonePayloadSafe(estado);
    const payloadPublico = projectionPayloads.payloadPublicoAtual(payload, state.estadoPublicoOverride);
    const payloadPublicoJanelas = state.projecaoLiveAtiva ? estadoOciosoPublico() : payloadPublico;

    const telasPublicas = registro.porRole('publico');
    telasPublicas.forEach((entry) => {
      const win = entry.win;
      if (!win || win.isDestroyed()) return;
      try { win.webContents.send('atualizar', payloadPublicoJanelas); } catch (_) {
  // intencional — erro ignorado
}
    });

    ajustarVisibilidadeProjecaoParaRelogio('publico', !hayProjecaoAtivaPublica());

    if (state.windowControl && !state.windowControl.isDestroyed()) {
      state.windowControl.webContents.send('estado_atualizado', payload);
    }
  }

  function atualizarDisplayMinistrante(estado) {
    let payload;
    if (state.projecaoLiveAtiva) {
      payload = estadoOciosoMinistrante();
    } else if (state.ministranteApresentacaoOverride) {
      try {
        payload = JSON.parse(JSON.stringify(state.ministranteApresentacaoOverride));
      } catch (_) {
        payload = state.ministranteApresentacaoOverride;
      }
    } else {
      try {
        payload = JSON.parse(JSON.stringify(estado));
      } catch (_) {
        payload = estado;
      }
      const tipoAtual = state.estadoAtual?.tipo;
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

    registro.todas()
      .filter((entry) => entry?.role === 'ministrante')
      .forEach((entry) => {
        const win = entry.win;
        if (!win || win.isDestroyed()) return;
        try { win.webContents.send('atualizar_ministrante', payload); } catch (_) {
  // intencional — erro ignorado
}
      });

    ajustarVisibilidadeProjecaoParaRelogio('ministrante', !hayProjecaoAtivaMinistrante());
  }

  function estadoPublicoParaSocketsOuApi() {
    const out = projectionPayloads.estadoPublicoParaSocketsOuApi(
      state.estadoAtual,
      state.estadoPublicoOverride,
      state.ministranteApresentacaoOverride
    );
    if (out && typeof out === 'object') out.projecaoLive = !!state.projecaoLiveAtiva;
    return out;
  }

  function snapshotMinistranteAtual() {
    return projectionPayloads.snapshotMinistranteAtual(state.estadoAtual, logError);
  }

  /**
   * "Há um operador ligado?" — NÃO é uma pergunta sobre rede.
   *
   * Decide, quando não há rota de monitores configurada, se o motor mantém as janelas
   * abertas em preto (operador presente, vai projetar já) ou fecha tudo (ninguém a
   * operar). No Server a resposta vem do socket do controlador; no modo local o próprio
   * Controller é o operador e responde sempre `true`.
   */
  function controladorAtivo() {
    return !!haOperadorConectado();
  }

  function hayProjecaoAtivaPublica() {
    if (state.projecaoLiveAtiva) return false;
    const st = projectionPayloads.payloadPublicoAtual(state.estadoAtual, state.estadoPublicoOverride);
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
    if (state.projecaoLiveAtiva) return false;
    if (state.ministranteApresentacaoOverride) {
      const ov = state.ministranteApresentacaoOverride;
      if (ov && typeof ov === 'object') {
        if (ov.telaLimpa) return false;
        if (ov.modo === 'apresentacao') {
          return !!(ov.apresentacao && String(ov.apresentacao.src || '').trim());
        }
        if (ov.modo === 'aviso') {
          return Array.isArray(ov.linhas) && ov.linhas.length > 0;
        }
        return !!(String(ov.atual || '').trim() || String(ov.proximo || '').trim());
      }
    }
    const snap = snapshotMinistranteAtual();
    if (!snap || typeof snap !== 'object') return false;
    if (snap.telaLimpa) return false;
    return !!(String(snap.atual || '').trim() || String(snap.proximo || '').trim());
  }

  /** Relógio ocioso deixa de usar janela transparente — esconde a projeção por cima. */
  function deveRevelarRelogioNoRole(role) {
    try {
      const forcarModo = displayConfigModo.inferirForcarModoJanelas(state);
      const cfg = displayConfigModo.resolverConfigParaJanelas(state, { forcarModo });
      const clk = (cfg && cfg.clock) || {};
      if (clk.showClock === false) return false;
      const alvo = String(clk.monitorRelogio || 'ministrante').toLowerCase();
      if (role === 'publico') return alvo === 'publico' || alvo === 'ambos';
      if (role === 'ministrante') return alvo === 'ministrante' || alvo === 'ambos';
    } catch (_) {
      // intencional — erro ignorado
    }
    return false;
  }

  function ajustarVisibilidadeProjecaoParaRelogio(role, ocioso) {
    const revelar = !!ocioso && deveRevelarRelogioNoRole(role);
    registro.todas()
      .filter((entry) => entry?.role === role)
      .forEach((entry) => {
        const win = entry?.win;
        if (!win || win.isDestroyed()) return;
        if (revelar) {
          if (win.isVisible()) {
            try {
              win.hide();
            } catch (_) {
              // intencional — erro ignorado
            }
            entry.ocultoParaRelogio = true;
          }
          return;
        }
        if (!entry.ocultoParaRelogio) return;
        entry.ocultoParaRelogio = false;
        try {
          if (!win.isVisible()) {
            win.show();
            win.setFullScreen(true);
            aplicarTopoAbsolutoProjecao(win);
          }
        } catch (_) {
          // intencional — erro ignorado
        }
      });
    reafirmarTopoTodasJanelasProjecao();
    atualizarLoopTopoAbsolutoProjecao();
  }

  function aplicarPretoInativoNasJanelasAbertas() {
    const pubOcioso = estadoOciosoPublico();
    const minOcioso = estadoOciosoMinistrante();
    state.projecaoLiveAtiva = false;
    state.estadoPublicoOverride = null;
    state.ministranteApresentacaoOverride = null;
    state.estadoAtual = pubOcioso;
    state.estadoMinistrante = minOcioso;
    atualizarDisplays(pubOcioso);
    atualizarDisplayMinistrante(minOcioso);
    registro.todas()
      .filter((entry) => entry?.role === 'escudo' && entry?.win && !entry.win.isDestroyed())
      .forEach((entry) => {
        try { entry.win.webContents.send('atualizar', pubOcioso); } catch (_) {
  // intencional — erro ignorado
}
      });
  }

  function fecharTodasJanelasProjecao() {
    registro.todas().forEach((entry) => {
      if (entry?.win && !entry.win.isDestroyed()) {
        try { entry.win.close(); } catch (_) {
  // intencional — erro ignorado
}
      }
    });
    registro.limpar();
    atualizarLoopTopoAbsolutoProjecao();
  }

  function encerrarProjecaoPorEsc(canal) {
    const canais = {
      apresentacaoDominaPublico: true,
      apresentacaoDominaMinistrante: !!state.ministranteApresentacaoOverride,
    };
    const modo = projectionEncerrar.inferirModoEncerrarPorCanalJanela(state, canal, canais);
    if (modo !== projectionEncerrar.MODO_SLIDES) return;

    projectionEncerrar.encerrarCamadaSlides(state);
    state.estadoMinistrante = snapshotMinistranteAtual();
    atualizarDisplays(state.estadoAtual);
    atualizarDisplayMinistrante(state.estadoMinistrante);

    if (state.windowControl && !state.windowControl.isDestroyed()) {
      state.windowControl.webContents.send('telas_projecao_encerradas_esc');
    }

    /* O motor não conhece Socket.io: avisa o host, que decide como propagar
       (no Server, `io.emit('estado', …)`; no modo local, nada). */
    onProjecaoEncerrada({ canal: canal ?? null, estadoPublico: estadoPublicoParaSocketsOuApi() });
  }

  /** Garante fullscreen, topo absoluto e fundo nativo assim que a janela existe. */
  function finalizarJanelaProjecaoNativa(win, opts = {}) {
    if (!win || win.isDestroyed()) return;
    const backgroundColor = opts.backgroundColor || PRETO_NATIVO_PROJECAO;
    try { win.setBackgroundColor(backgroundColor); } catch (_) {
  // intencional — erro ignorado
}
    aplicarTopoAbsolutoProjecao(win);
    try { win.setFullScreen(true); } catch (_) {
  // intencional — erro ignorado
}
    try { if (!win.isVisible()) win.show(); } catch (_) {
  // intencional — erro ignorado
}
    // Outro software topmost pode cobrir só um monitor; reclaim global (M2+M3).
    if (!win.__lyraTopoAbsolutoBlurBound) {
      win.__lyraTopoAbsolutoBlurBound = true;
      win.on('blur', () => {
        if (win.isDestroyed()) return;
        reafirmarTopoTodasJanelasProjecao();
        atualizarLoopTopoAbsolutoProjecao();
      });
    }
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      try { win.setFullScreen(true); } catch (_) {
  // intencional — erro ignorado
}
      aplicarTopoAbsolutoProjecao(win);
      try { win.show(); } catch (_) {
  // intencional — erro ignorado
}
      atualizarLoopTopoAbsolutoProjecao();
    });
    atualizarLoopTopoAbsolutoProjecao();
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
    const forcarModo = displayConfigModo.inferirForcarModoJanelas(state);
    const cfg = displayConfigModo.resolverConfigParaJanelas(state, { forcarModo });
    const payload = hayProjecaoAtivaPublica()
      ? projectionPayloads.payloadPublicoAtual(state.estadoAtual, state.estadoPublicoOverride)
      : estadoOciosoPublico();
    try {
      win.webContents.send('display_config', cfg);
      win.webContents.send('atualizar', payload);
    } catch (_) {
  // intencional — erro ignorado
}
  }

  function enviarBootstrapJanelaMinistrante(win) {
    const forcarModo = displayConfigModo.inferirForcarModoJanelas(state);
    const cfg = displayConfigModo.resolverConfigParaJanelas(state, { forcarModo });
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
      ...(((state.displayConfig || {}).clock) || {}),
    };
  }

  /**
   * Único caminho para escrever `display_config` nas janelas de projeção.
   *
   * Antes do sub-passo 3a o `httpServer.js` e o `ipcHandlers.js` chamavam
   * `displayConfigModo.enviarDisplayConfigParaJanelas(ctx, …)` directamente, alcançando
   * `ctx.windowsDisplay` por fora do motor — um segundo escritor nas janelas. Com o
   * registo a caminho de ser interno ao motor (3b), esse caminho passaria a não encontrar
   * janela nenhuma e falharia em SILÊNCIO (um `forEach` sobre lista vazia não dá erro).
   *
   * @param {{ forcarModo?: 'slides'|'biblia' }} [opts]
   * @returns {object} a config efectivamente enviada
   */
  function aplicarDisplayConfigNasJanelas(opts = {}) {
    return displayConfigModo.enviarDisplayConfigParaJanelas(state, {
      ...opts,
      janelas: registro.todas(),
    });
  }

  /** Leitura do registo para diagnóstico e testes. Cópia — ninguém escreve por aqui. */
  function janelasDeProjecao() {
    return registro.todas();
  }

  function enviarDisplayConfigParaJanelasRelogio(targetWin = null) {
    const cfg = { clock: resolverClockConfigPersistida() };
    const entradas = targetWin
      ? [{ win: targetWin }]
      : registro.todas().filter((entry) => entry?.role === 'relogio');
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

  /**
   * A janela já cobre exactamente este monitor?
   *
   * Conservador de propósito: se `getBounds()` não estiver disponível ou lançar, devolve
   * `false` — ou seja, reposiciona. Melhor um pisca do que uma janela no monitor errado.
   */
  function boundsIguais(win, bounds) {
    try {
      const b = win.getBounds();
      return (
        !!b &&
        b.x === bounds.x &&
        b.y === bounds.y &&
        b.width === bounds.width &&
        b.height === bounds.height
      );
    } catch (_) {
      return false;
    }
  }

  function sincronizarJanelasRelogio() {
    const desejados = new Set(indicesMonitoresRelogioDesejados());
    const displays = obterDisplaysOrdenados();
    const restantes = [];

    registro.todas().forEach((entry) => {
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
        /* O ciclo sair-do-fullscreen → reposicionar → voltar existe para quando o monitor
           muda de posição/resolução. Aplicá-lo incondicionalmente pisca a barra de tarefas
           do Windows: esta função roda a cada `preview_display_config`, ou seja, a cada tick
           do arrasto de um slider no controlador — e sair do fullscreen revela a barra.
           Como a janela de relógio é `alwaysOnTop(false)` de propósito (fica atrás da
           projeção), o pisca fica visível sempre que o relógio é a janela visível no
           monitor, como no modo Bíblia. */
        if (!boundsIguais(win, d.bounds)) {
          if (win.isFullScreen()) win.setFullScreen(false);
          win.setBounds({
            x: d.bounds.x,
            y: d.bounds.y,
            width: d.bounds.width,
            height: d.bounds.height,
          });
          win.setFullScreen(true);
        }
        win.setAlwaysOnTop(false);
        if (!win.isVisible()) win.show();
      } catch (_) {
  // intencional — erro ignorado
}
      enviarDisplayConfigParaJanelasRelogio(win);
      restantes.push(entry);
      desejados.delete(entry.index);
    });

    registro.substituirPor(restantes);

    desejados.forEach((displayIndex) => {
      const win = abrirJanelaRelogio(displayIndex, `Relógio (Monitor ${displayIndex + 1})`);
      if (!win) return;
      registro.adicionar({ role: 'relogio', index: displayIndex, win });
    });
  }

  function abrirJanelaTela(displayIndex, label) {
    const displays = obterDisplaysOrdenados();
    if (!podeAbrirJanelaSecundaria()) return null;
    if (!displays[displayIndex]) return null;
    const d = displays[displayIndex];

    /* Janela opaca: transparent:true + <video> no Windows deixa o quadro preto em
       monitores físicos (DirectComposition). Relógio ocioso revela-se escondendo esta janela. */
    const win = new BrowserWindow(
      {
        ...opcoesBrowserWindowProjecao(d, label, {
          webPreferences: { zoomFactor: d.scaleFactor || 1 },
        }),
        show: false,
        transparent: false,
        backgroundColor: PRETO_NATIVO_PROJECAO,
      }
    );
    finalizarJanelaProjecaoNativa(win, { backgroundColor: PRETO_NATIVO_PROJECAO });

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
        const forcarModo = displayConfigModo.inferirForcarModoJanelas(state);
        const cfg = displayConfigModo.resolverConfigParaJanelas(state, { forcarModo });
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

    /* Opaca — mesmo motivo do telão público (vídeo preto com transparent:true). */
    const win = new BrowserWindow({
      ...opcoesBrowserWindowProjecao(d, label),
      show: false,
      transparent: false,
      backgroundColor: PRETO_NATIVO_PROJECAO,
    });
    finalizarJanelaProjecaoNativa(win, { backgroundColor: PRETO_NATIVO_PROJECAO });

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
    return registro.todas().filter(
      (e) => e?.role === role && e?.win && !e.win.isDestroyed()
    );
  }

  function fecharJanelasPorRole(role) {
    const restantes = [];
    registro.todas().forEach((entry) => {
      if (entry?.role === role && entry?.win && !entry.win.isDestroyed()) {
        try { entry.win.close(); } catch (_) {
  // intencional — erro ignorado
}
      } else {
        restantes.push(entry);
      }
    });
    registro.substituirPor(restantes);
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
      registro.remover((e) => e?.role === role && e !== principal);
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
            aplicarTopoAbsolutoProjecao(principal.win);
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
      registro.adicionar({ role, index: displayIndex, win });
      aguardarJanelaProjecaoVisivel(win, next);
      return;
    }
    if (typeof next === 'function') next();
  }

  function sincronizarJanelasEscudo(indicesDesejados, next) {
    const desejados = new Set(indicesDesejados);
    const restantes = [];
    registro.todas().forEach((entry) => {
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
              aplicarTopoAbsolutoProjecao(entry.win);
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
    registro.substituirPor(restantes);

    // Inclui ocultos: janela já existe, não precisa criar nova
    const abertos = new Set(
      registro.todas()
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
        registro.adicionar({ role: 'escudo', index: displayIndex, win });
        aguardarJanelaProjecaoVisivel(win, umTerminou);
      } else {
        umTerminou();
      }
    });
  }

  function finalizarSincronizacaoTelas(onComplete) {
    syncTelasEmAndamento = false;
    reafirmarTopoTodasJanelasProjecao();
    atualizarLoopTopoAbsolutoProjecao();
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
    const pubWins = registro.todas().filter((e) => e?.role === 'publico' && e?.win && !e.win.isDestroyed() && e.win.isVisible());
    const minWins = registro.todas().filter((e) => e?.role === 'ministrante' && e?.win && !e.win.isDestroyed() && e.win.isVisible());

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
    const escudoWins = registro.todas().filter(
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
      registro.todas()
        .filter((entry) => entry?.role === 'escudo' && entry?.win && !entry.win.isDestroyed())
        .forEach((entry) => {
          try { entry.win.webContents.send('atualizar', pubOcioso); } catch (_) {
  // intencional — erro ignorado
}
        });
      sincronizarJanelasRelogio(routingDual);
      reafirmarTopoTodasJanelasProjecao();
      atualizarLoopTopoAbsolutoProjecao();
      return;
    }
    sincronizarTelasComRota(routingDual, () => {
      try {
        const forcarModo = displayConfigModo.inferirForcarModoJanelas(state);
        aplicarDisplayConfigNasJanelas({ forcarModo });
        sincronizarJanelasRelogio(routingDual);
        if (!hayProjecaoAtivaPublica()) atualizarDisplays(estadoOciosoPublico());
        else atualizarDisplays(state.estadoAtual);
        if (!hayProjecaoAtivaMinistrante()) atualizarDisplayMinistrante(estadoOciosoMinistrante());
        else atualizarDisplayMinistrante(state.estadoMinistrante);
      } catch (e) {
        logError('garantir-telas-abertas', e);
      }
    });
  }

  function openDisplayDevToolsPorRole(role = null) {
    const possuiJanelaAlvo = role
      ? registro.todas().some((e) => e?.role === role && e?.win && !e.win.isDestroyed())
      : registro.tamanho() > 0;

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
    registro.todas().forEach((entry) => {
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
    if (!state.windowControl || state.windowControl.isDestroyed()) return;
    try {
      state.windowControl.webContents.send(channel, payload);
    } catch (_) {
  // intencional — erro ignorado
}
  }

  /** Sincroniza vídeo do card 5 nas janelas de projeção (público e ministrante). */
  function enviarSyncVideoApresentacaoParaDisplays(payload = {}) {
    const data = payload && typeof payload === 'object' ? payload : {};
    registro.todas().forEach((entry) => {
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
    getJanelaControle: controlWindowApi.getJanelaControle,
    atualizarDisplays,
    atualizarDisplayMinistrante,
    estadoPublicoParaSocketsOuApi,
    snapshotMinistranteAtual,
    encerrarProjecaoPorEsc,
    fecharTodasJanelasProjecao,
    abrirTelasConfiguradas,
    garantirTelasAbertasParaProjecao,
    sincronizarJanelasRelogio,
    criarJanelaControle: controlWindowApi.criarJanelaControle,
    showMainWindow: controlWindowApi.showMainWindow,
    recarregarJanelaControle: controlWindowApi.recarregarJanelaControle,
    openMainDevTools: controlWindowApi.openMainDevTools,
    aplicarDisplayConfigNasJanelas,
    janelasDeProjecao,
    openDisplayDevTools,
    openPublicDevTools,
    openMinistranteDevTools,
    enviarComandoAudioParaControle,
    enviarSyncVideoApresentacaoParaDisplays,
    loadDisplayRouting,
  };
}

module.exports = { createWindowsApi };
