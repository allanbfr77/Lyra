'use strict';

const displayRoutingMod = require('./displayRouting');
const displayIndicesMod = require('./displayIndices');
const displayConfigLib = require('./displayConfig');
const projectionPayloads = require('./projectionPayloads');
const projectionEncerrar = require('./projectionEncerrar');
const displayConfigModo = require('./displayConfigModo');
const { getOrderedDisplays } = require('./monitorsList');
const { createWindowRegistry } = require('./windowRegistry');
/* Lazy no ESC: evita ciclo de carga com commandApplier (que recebe o engine injectado). */
function estadoBibliaParaObsEsc(state) {
  return require('./commandApplier').estadoBibliaParaObs(state);
}

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

/**
 * **Camada de fundo permanente.**
 *
 * Uma janela preta por monitor gerido, aberta uma vez e nunca fechada enquanto o motor
 * vive. Não tem conteúdo, não recebe estado, não recebe `display_config`, não entra na
 * rota. A sua única função é garantir que, por baixo de tudo o que o motor faz, o que
 * existe é preto — e nunca a área de trabalho do Windows.
 *
 * Existe porque a cadeia de sincronização é sequencial: a etapa que descobre um monitor
 * (esconder o telão, fechar o relógio, mover uma janela) corre antes da etapa que o volta a
 * cobrir, e entre as duas há um carregamento de página inteiro. Sem chão, esse intervalo é
 * desktop à vista. Nenhuma correção pontual das etapas resolve isso — só ter chão.
 *
 * Fica na banda normal (`alwaysOnTop(false)`), abaixo do relógio e muito abaixo das janelas
 * de projeção, que são topmost. É isso que evita que ganhe disputas de z-order com elas.
 */
const ROLE_FUNDO = 'fundo';

/** Página do fundo: preto, sem script, sem integração. Não há nada a carregar mal. */
const PAGINA_FUNDO = 'data:text/html;charset=utf-8,%3Cbody%20style%3D%22margin%3A0%3Bbackground%3A%23000%22%3E%3C%2Fbody%3E';

/**
 * Roles que renderizam conteúdo e por isso recebem `display_config` do telão.
 * O escudo é preto por definição; o relógio tem a sua própria fonte de config.
 * Ver `aplicarDisplayConfigNasJanelas`.
 */
const ROLES_COM_CONTEUDO = new Set(['publico', 'ministrante']);

/**
 * Intervalo do reclaim global — outro TOPMOST no M2 sobe a z-order sem tirar foco do M3.
 *
 * Era 800 ms. O `blur` já dispara reclaim imediato; este ciclo é a rede para o caso de
 * alguém subir sem tirar o foco a ninguém. A 800 ms era `SetWindowPos` em todas as janelas
 * de projeção mais de uma vez por segundo, para sempre — churn de z-order permanente em
 * superfícies fullscreen. Aos 2 s o pior caso passa a ~2 s para recuperar o topo, contra
 * uma máquina que deixa de mexer nas janelas o tempo todo.
 */
const INTERVALO_RECLAIM_TOPO_MS = 2000;

/** Prefixo do argumento que leva a config do relógio ao renderer. Ver `bootstrapArgvRelogio`. */
const PREFIXO_ARGV_RELOGIO = '--lyra-clock-cfg=';

/** Tecto conservador para o argumento; a linha de comando do Windows ronda os 32 KB. */
const LIMITE_ARGV_RELOGIO = 8192;

/**
 * Quanto tempo uma troca de monitor pode ficar pendente antes de ser largada.
 * Ver `substituirJanelaNoMonitor` — sem este tecto, uma janela que nunca fique visível
 * prendia o papel à janela antiga para sempre.
 */
const TIMEOUT_TROCA_JANELA_MS = 5000;

/**
 * Marca (ou desmarca) uma janela como **ocultada de propósito** para revelar o relógio.
 *
 * A marca vive no `win`, e não só na entrada do registo, porque quem precisa de a
 * consultar são os `show()` do ciclo de vida da janela — `finalizarJanelaProjecaoNativa`
 * e `aguardarJanelaProjecaoVisivel` — e esses recebem o `win`, não a entrada.
 *
 * @param {import('electron').BrowserWindow} win
 * @param {boolean} oculto
 */
function marcarOcultoParaRelogio(win, oculto) {
  if (!win || win.isDestroyed()) return;
  try {
    win.__lyraOcultoParaRelogio = !!oculto;
  } catch (_) {
    // intencional — erro ignorado
  }
}

/**
 * A janela foi escondida de propósito, para o relógio aparecer por baixo?
 *
 * Existe porque havia **três** `show()` no ciclo de vida da janela que a mostravam sem
 * perguntar se alguém a tinha escondido por uma razão. No arranque isso era uma corrida
 * perdida: a cadeia de sincronização escondia a janela do ministrante no `onComplete`, e
 * logo a seguir o `did-finish-load` — ou o `ready-to-show` que ainda não tinha chegado —
 * voltava a mostrá-la, tapando o relógio. O sintoma era o M3 preto no arranque e o
 * relógio a aparecer só depois de trocar de modo, que era quando a janela já tinha
 * passado do ciclo de carregamento e o `hide()` finalmente pegava.
 *
 * @param {import('electron').BrowserWindow} win
 */
function ocultoParaRelogio(win) {
  try {
    return !!(win && !win.isDestroyed() && win.__lyraOcultoParaRelogio);
  } catch (_) {
    return false;
  }
}

/**
 * Aplica o nível de topo de uma janela **só quando ele muda**.
 *
 * No Windows, `setAlwaysOnTop` é um `SetWindowPos(HWND_TOPMOST|HWND_NOTOPMOST, …)` real:
 * reinsere a janela na z-order e força recomposição do DWM. Numa janela fullscreen isso é
 * visível como um flicker. O caso que doía era o relógio: `sincronizarJanelasRelogio` roda
 * a cada `preview_display_config` — ou seja, a cada tick do arrasto de um slider — e
 * chamava `setAlwaysOnTop(false)` sempre, mesmo estando já em `false` desde a criação.
 *
 * O nível efectivo fica anotado no `win` (e não numa entrada do registo) porque quem
 * precisa dele são funções que recebem o `win`, não a entrada.
 *
 * @param {import('electron').BrowserWindow} win
 * @param {string|false} nivel `false` desliga; string é o nível do Electron.
 * @param {{ forcar?: boolean }} [opts] `forcar` reemite mesmo sem mudança — é o que o
 *   *reclaim* precisa quando outro app topmost sobe por cima (ver `INTERVALO_RECLAIM_TOPO_MS`).
 * @returns {boolean} houve chamada nativa
 */
function definirNivelTopo(win, nivel, opts = {}) {
  if (!win || win.isDestroyed()) return false;
  let anterior;
  try {
    anterior = win.__lyraNivelTopo;
  } catch (_) {
    anterior = undefined;
  }
  if (!opts.forcar && anterior === nivel) return false;
  try {
    if (nivel === false) win.setAlwaysOnTop(false);
    else win.setAlwaysOnTop(true, nivel);
  } catch (_) {
    try {
      win.setAlwaysOnTop(nivel !== false);
    } catch (__) {
      // intencional — erro ignorado
    }
  }
  try {
    win.__lyraNivelTopo = nivel;
  } catch (_) {
    // intencional — erro ignorado
  }
  return true;
}

/**
 * Mantém a janela de projeção acima de qualquer outro app topmost.
 * O construtor só aceita `alwaysOnTop: true` (nível padrão); o nível alto
 * precisa de `setAlwaysOnTop(true, 'screen-saver')` + `moveTop()`.
 *
 * `moveTop()` fica fora da guarda de propósito: é ele que reclama o topo dentro da banda
 * topmost, e ao contrário do `setAlwaysOnTop` não muda o ex-style da janela.
 *
 * @param {import('electron').BrowserWindow} win
 * @param {{ forcar?: boolean }} [opts] ver `definirNivelTopo`
 */
function aplicarTopoAbsolutoProjecao(win, opts = {}) {
  if (!win || win.isDestroyed()) return;
  definirNivelTopo(win, NIVEL_TOPO_PROJECAO, opts);
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
  const icon = extra.icon;
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
    icon,
    /* Nasce oculta: só se mostra depois de `ready-to-show`, já em fullscreen. Era `true`,
       e o escudo aparecia como janela vazia antes de ter carregado a página. */
    show: false,
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
 * **Motor de projeção do Projection Core.**
 *
 * Abre, sincroniza e renderiza as janelas físicas de projeção: telão (público),
 * ministrante, escudo preto e relógio. Contém os *quirks* de plataforma que só existem
 * porque foram descobertos por tentativa e erro (fullscreen + topo absoluto no Windows,
 * sequência de abertura para evitar tela preta/flash). **Extrair, nunca reescrever.**
 *
 * O que o motor NÃO conhece, por construção:
 * - `serverContext`/`ctx` — o estado entra pela porta `deps.state`;
 * - transporte (Socket.io, HTTP) — avisa o host por `deps.onProjecaoEncerrada`;
 * - Electron por `require` — `BrowserWindow` e `screen` são injectados;
 * - onde vivem as suas páginas e o seu ícone — o host resolve.
 *
 * É isso que permite o mesmo motor servir o Server (modo remoto) e, no futuro, o
 * Controller in-process (modo local). Ver docs/architecture/projection-core.md.
 *
 * @param {object} paths Objeto retornado por `createUserPaths(userData)` — usa
 *   `displayRoutingPath` e `displaySettingsPath`.
 * @param {{
 *   logError: Function,
 *   screen: object,
 *   BrowserWindow: object,
 *   state: object,
 *   onProjecaoEncerrada: (ev: { canal: string|null, estadoPublico: object }) => void,
 *   haOperadorConectado: () => boolean,
 *   resolverPaginaProjecao: (nome: string) => string,
 *   caminhoIconeApp: () => string
 * }} deps
 *   `state` — porta de estado da projeção (ver `lib/projectionState.js` no Server, que a
 *   serve a partir do `ctx`; no modo local será o armazém próprio do Core).
 *   `onProjecaoEncerrada` — o motor avisa que a projeção terminou por Esc; o host propaga
 *   (no Server, `io.emit('estado', …)`).
 *   `haOperadorConectado` — ver `controladorAtivo()` abaixo.
 *   `resolverPaginaProjecao` — caminho absoluto da página do renderer (`display.html`,
 *   `display-operator.html`, `display-clock.html`).
 *   `caminhoIconeApp` — ícone das janelas.
 */
function createProjectionEngine(paths, deps) {
  const { logError, screen, BrowserWindow, state } = deps;

  /* Obrigatórios de propósito: um default silencioso aqui é uma regressão silenciosa
     (deixar de avisar os controladores, ou fechar telas que deviam ficar pretas). */
  const { onProjecaoEncerrada, haOperadorConectado, resolverPaginaProjecao, caminhoIconeApp } = deps;
  if (typeof onProjecaoEncerrada !== 'function') {
    throw new TypeError('createProjectionEngine: deps.onProjecaoEncerrada é obrigatório');
  }
  if (typeof haOperadorConectado !== 'function') {
    throw new TypeError('createProjectionEngine: deps.haOperadorConectado é obrigatório');
  }
  if (typeof resolverPaginaProjecao !== 'function') {
    throw new TypeError('createProjectionEngine: deps.resolverPaginaProjecao é obrigatório');
  }
  if (typeof caminhoIconeApp !== 'function') {
    throw new TypeError('createProjectionEngine: deps.caminhoIconeApp é obrigatório');
  }

  if (!state || typeof state !== 'object') {
    throw new TypeError('createProjectionEngine: deps.state é obrigatório');
  }

  /* Registo das janelas de projeção — privado ao motor desde o sub-passo 3b. Nada fora
     daqui o manipula; quem precisa de lêr usa `janelasDeProjecao()`. */
  const registro = createWindowRegistry();

  function obterDisplaysOrdenados() {
    return getOrderedDisplays(screen);
  }

  /**
   * Índice, na ordem do desktop, do monitor principal do Windows.
   * @param {Array} displays
   * @returns {number} -1 quando não é possível determinar
   */
  function indiceMonitorPrincipal(displays) {
    try {
      const primaryId = screen.getPrimaryDisplay().id;
      return displays.findIndex((d) => d && d.id === primaryId);
    } catch (_) {
      // intencional — sem informação de principal, nenhuma guarda é aplicada
      return -1;
    }
  }

  /**
   * O monitor principal é o do operador: é lá que vive o painel de controlo.
   * Abrir projeção lá cobre o painel a meio do culto, e o operador fica cego.
   *
   * Os índices vindos do roteamento já são filtrados no controlador, mas os FALLBACKS
   * deste motor (`displays.length > 1 ? 1 : 0`, `loadDisplayIndices()`) são cegos à
   * identidade do monitor e podem cair no principal quando o arranjo de ecrãs muda.
   * Esta guarda é a última linha de defesa.
   *
   * Com um único monitor não há alternativa e o índice passa: é o cenário de teste
   * num portátil, onde projetar no próprio ecrã é o comportamento esperado.
   *
   * @param {number} idx
   * @param {Array} displays
   * @returns {number} `idx`, ou -1 se apontar ao monitor do operador
   */
  function indiceProjecaoSeguro(idx, displays) {
    if (!Number.isFinite(idx) || idx < 0) return -1;
    if (displays.length <= 1) return idx;
    const principal = indiceMonitorPrincipal(displays);
    if (principal >= 0 && idx === principal) return -1;
    return idx;
  }

  /** Primeiro monitor que não é o do operador — base dos fallbacks. */
  function primeiroIndiceDeProjecao(displays) {
    if (!displays.length) return -1;
    if (displays.length === 1) return 0;
    const principal = indiceMonitorPrincipal(displays);
    const i = displays.findIndex((_d, k) => k !== principal);
    return i >= 0 ? i : -1;
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
      /* Reclaim: reemitir mesmo sem mudança de nível é o ponto — um concorrente topmost
         pode ter subido por cima sem que nada no nosso lado tenha mudado. */
      aplicarTopoAbsolutoProjecao(win, { forcar: true });
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
    /* Live manda o telão ao preto para a transmissão ser o OBS — excepto com contagem
       no ar: a contagem é de sala e continua no monitor que o Contador escolheu, sem
       reagir ao destino Live/OBS da Bíblia. */
    const contagemNoPublico = !!(payloadPublico && payloadPublico.tipo === 'contagem');
    const payloadPublicoJanelas =
      state.projecaoLiveAtiva && !contagemNoPublico ? estadoOciosoPublico() : payloadPublico;

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
    const contagemNoMin =
      !!(state.ministranteApresentacaoOverride &&
        state.ministranteApresentacaoOverride.modo === 'contagem');
    if (state.projecaoLiveAtiva && !contagemNoMin) {
      payload = estadoOciosoMinistrante();
    } else if (state.ministranteApresentacaoOverride) {
      try {
        payload = JSON.parse(JSON.stringify(state.ministranteApresentacaoOverride));
      } catch (_) {
        payload = state.ministranteApresentacaoOverride;
      }
      /* Contagem no palco: o tempo é carimbado aqui, na emissão, e não quando o comando
         chegou. Sem isto, um monitor de ministrante ligado a meio da contagem receberia o
         tempo que faltava no início dela. Mesma razão do carimbo no telão. */
      payload = projectionPayloads.carimbarContagemNoPayload(payload, Date.now());
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
      const slidePreto =
        !!(payload.slidePretoFinal) || !!(state.estadoAtual && state.estadoAtual.slidePretoFinal);
      const blackoutAtivo =
        !!(payload.blackout) || !!(state.estadoAtual && state.estadoAtual.blackout);
      payload = {
        modo: modoMin,
        titulo: payload.titulo || '',
        atual: slidePreto || blackoutAtivo ? '' : payload.atual || '',
        proximo: slidePreto || blackoutAtivo ? '' : payload.proximo || '',
        aberturaMusica: !!(payload.aberturaMusica) && modoMin === 'musica' && !slidePreto && !blackoutAtivo,
        projecaoAtiva: hayProjecaoAtivaMinistrante(),
        telaLimpa: !!payload.telaLimpa,
        slidePretoFinal: slidePreto,
        blackout: blackoutAtivo,
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
    const st = projectionPayloads.payloadPublicoAtual(state.estadoAtual, state.estadoPublicoOverride);
    /* Live sem contagem: monitores físicos ficam ociosos. Com contagem no ar, o monitor
       do Contador continua activo — Live é só da Bíblia/OBS, não da contagem. */
    if (state.projecaoLiveAtiva) {
      return !!(st && st.tipo === 'contagem' && st.contagem);
    }
    if (!st || typeof st !== 'object') return false;
    if (st.blackout || st.slidePretoFinal) return true;
    if (st.telaLimpa) return false;
    if (st.tipo === 'apresentacao') {
      return !!(st.apresentacao && String(st.apresentacao.src || '').trim());
    }
    if (st.tipo === 'aviso') {
      return Array.isArray(st.linhas) && st.linhas.length > 0;
    }
    /* A contagem não tem `linhas` — os dígitos nascem no renderer a partir do tempo. Sem
       este ramo o motor concluiria «telão ocioso» e revelaria o relógio por cima dela. */
    if (st.tipo === 'contagem') return !!st.contagem;
    return Array.isArray(st.linhas) && st.linhas.length > 0;
  }

  function hayProjecaoAtivaMinistrante() {
    if (state.projecaoLiveAtiva) {
      const ov = state.ministranteApresentacaoOverride;
      return !!(ov && ov.modo === 'contagem' && ov.contagem);
    }
    /* Slide preto / blackout: projeção activa (tela preta vazia) — não revelar o relógio. */
    const stPub = state.estadoAtual;
    if (stPub && typeof stPub === 'object' && (stPub.blackout || stPub.slidePretoFinal)) {
      return true;
    }
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
        /* Contagem no palco (alvo «ambos»): não tem `atual`/`proximo`. Sem este ramo o
           motor acharia o M3 ocioso e esconderia a janela para revelar o relógio. */
        if (ov.modo === 'contagem') return !!ov.contagem;
        return !!(String(ov.atual || '').trim() || String(ov.proximo || '').trim());
      }
    }
    const snap = snapshotMinistranteAtual();
    if (!snap || typeof snap !== 'object') return false;
    if (snap.slidePretoFinal || snap.blackout) return true;
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

  /**
   * Existe mesmo uma janela de relógio viva a cobrir este monitor?
   *
   * A decisão de esconder a projeção para «revelar o relógio» vinha só da configuração,
   * nunca do registo. Com `showClock` ligado mas sem janela de relógio — porque a criação
   * falhou, ou porque a etapa que as cria ainda não correu — o `hide()` não revelava
   * relógio nenhum: revelava o que estivesse por baixo.
   */
  function haRelogioVivoNoMonitor(displayIndex) {
    return registro.todas().some(
      (e) => e?.role === 'relogio'
        && e.index === displayIndex
        && e.win
        && !e.win.isDestroyed()
    );
  }

  function ajustarVisibilidadeProjecaoParaRelogio(role, ocioso) {
    const revelarPelaConfig = !!ocioso && deveRevelarRelogioNoRole(role);
    registro.todas()
      .filter((entry) => entry?.role === role)
      .forEach((entry) => {
        const win = entry?.win;
        if (!win || win.isDestroyed()) return;
        const revelar = revelarPelaConfig && haRelogioVivoNoMonitor(entry.index);
        if (revelar) {
          /* O relógio partilha a banda normal com o chão preto. Sem o trazer à frente ao
             ser revelado, podia ficar por baixo dele e o monitor mostrava só preto. */
          registro.todas()
            .filter((e) => e?.role === 'relogio' && e.index === entry.index)
            .forEach((e) => { try { e.win.moveTop(); } catch (_) {
  // intencional — erro ignorado
} });
          if (win.isVisible()) {
            try {
              win.hide();
            } catch (_) {
              // intencional — erro ignorado
            }
            entry.ocultoParaRelogio = true;
            marcarOcultoParaRelogio(win, true);
          }
          return;
        }
        if (!entry.ocultoParaRelogio) return;
        entry.ocultoParaRelogio = false;
        marcarOcultoParaRelogio(win, false);
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

  /**
   * Pinta de preto as janelas que ficaram abertas quando a rota não tem monitor nenhum.
   *
   * ## Só janelas — o conteúdo não é dela
   *
   * Esta função já apagou o estado de projeção (`estadoAtual`, `projecaoLiveAtiva`,
   * os dois overrides) além de pintar as janelas. Era a origem da dependência entre o
   * OBS e a projeção física, e o caminho era este:
   *
   * ```
   * exibir_versiculo grava estadoAtual = { tipo: 'biblia', … }   ← conteúdo existe
   *   garantirTelasAbertasParaProjecao()
   *     rota sem monitor (pub < 0, min < 0, sem escudo) e operador ligado
   *       aplicarPretoInativoNasJanelasAbertas()
   *         state.estadoAtual = ocioso                            ← conteúdo destruído
   *   evBibliaObs() lê estadoAtual                                ← já vazio
   * ```
   *
   * O overlay do OBS deriva de `estadoAtual`, e «Live — OBS» é precisamente uma rota sem
   * monitor: `publicoIndex` e `ministranteIndex` ficam a -1 porque não há tela para onde
   * apontar. Ou seja, escolher OBS garantia o ramo que apagava o versículo antes de ele
   * ser difundido. E projetar primeiro num monitor «resolvia» porque aí a rota tinha um
   * índice válido, o ramo não corria, e o estado sobrevivia — que é exactamente a
   * sequência que o operador descobriu por tentativa.
   *
   * A rota diz **onde** desenhar. Não pode decidir **se existe** o que desenhar. Manter o
   * estado aqui não muda nada no que se vê: este ramo só corre quando não há monitor
   * roteado, e as janelas que sobrem recebem o payload ocioso logo abaixo, como sempre
   * receberam.
   */
  function aplicarPretoInativoNasJanelasAbertas() {
    const pubOcioso = estadoOciosoPublico();
    const minOcioso = estadoOciosoMinistrante();
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

  /**
   * ESC numa janela física: encerra a camada que essa janela está a mostrar.
   *
   * Antes só tratava Slides — Bíblia e Contagem/aviso eram detectadas por
   * `inferirModoEncerrarPorCanalJanela` e depois ignoradas (`return` cedo). O operador
   * carregava ESC no telão e nada acontecia. Agora aplica o modo inferido (slides,
   * bíblia ou apresentação/contagem) e avisa o host com estado + overlay OBS.
   *
   * @param {'publico'|'ministrante'|string} [canal]
   */
  function encerrarProjecaoPorEsc(canal) {
    const canais = {
      apresentacaoDominaPublico: true,
      apresentacaoDominaMinistrante: !!state.ministranteApresentacaoOverride,
    };
    const modo = projectionEncerrar.inferirModoEncerrarPorCanalJanela(state, canal, canais);

    if (modo === projectionEncerrar.MODO_BIBLIA || modo === projectionEncerrar.MODO_TUDO) {
      state.projecaoLiveAtiva = false;
    }

    projectionEncerrar.aplicarEncerrarProjecaoModo(state, modo, canais);
    state.estadoMinistrante = snapshotMinistranteAtual();
    atualizarDisplays(state.estadoAtual);
    atualizarDisplayMinistrante(state.estadoMinistrante);

    if (state.windowControl && !state.windowControl.isDestroyed()) {
      try {
        state.windowControl.webContents.send('telas_projecao_encerradas_esc', { modo });
      } catch (_) {
        // intencional — erro ignorado
      }
    }

    /* O motor não conhece Socket.io: avisa o host, que decide como propagar
       (no Server, `io.emit`; no modo local, difundir ao painel). */
    onProjecaoEncerrada({
      canal: canal ?? null,
      modo,
      estadoPublico: estadoPublicoParaSocketsOuApi(),
      estadoBibliaObs: estadoBibliaParaObsEsc(state),
    });
  }

  /**
   * Garante fullscreen, topo absoluto e fundo nativo assim que a janela existe.
   *
   * **Não mostra a janela.** Mostrava, e era uma linha antes do `loadFile`: o `show: false`
   * do construtor não valia nada e o monitor de destino ganhava um rectângulo preto vazio
   * até o conteúdo pintar. Quem mostra é o `ready-to-show` abaixo — depois do fullscreen
   * estar aplicado, que é a ordem que não pisca.
   */
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
      /* Este é o disparo que costumava chegar depois do `hide()` da cadeia de arranque e
         desfazê-lo. `setFullScreen` numa janela oculta revelaria-a; sair cedo é o correcto. */
      if (ocultoParaRelogio(win)) return;
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
    /* Relógio fica ATRÁS da projeção de propósito. Passa pela guarda para o nível ficar
       anotado — assim as resincronizações seguintes não reemitem o `SetWindowPos`. */
    definirNivelTopo(win, false);
    try { win.setFullScreen(true); } catch (_) {
  // intencional — erro ignorado
}
    /* Sem `show()` aqui de propósito — a janela ainda não carregou nada. Ver
       `finalizarJanelaProjecaoNativa`. Quem mostra é o `ready-to-show`. */
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
   * **Só escreve nas janelas que renderizam conteúdo** — `publico` e `ministrante`.
   *
   * O relógio e o escudo ficavam de fora por acidente e recebiam esta config porque o
   * registo era passado inteiro. Consequências, ambas visíveis:
   *
   * - **Relógio**: esta config carrega uma chave `clock:` própria (em modo Bíblia vem de
   *   `displayConfigBiblia.clock`), e logo a seguir todos os chamadores rodam
   *   `sincronizarJanelasRelogio()`, que envia a config de relógio *persistida* — outra.
   *   Duas configs diferentes na mesma janela, em frames consecutivos: o relógio piscava.
   *   Agora `enviarDisplayConfigParaJanelasRelogio` é o único escritor do relógio.
   * - **Escudo**: é uma tela preta sem canal de projeção; só ficava preta porque o payload
   *   ocioso lhe dava a classe `idle-sem-projecao`. Recebendo `display_config` ele podia
   *   pintar o fundo do telão (imagem/gradiente) por um frame.
   *
   * @param {{ forcarModo?: 'slides'|'biblia' }} [opts]
   * @returns {object} a config efectivamente enviada
   */
  function aplicarDisplayConfigNasJanelas(opts = {}) {
    return displayConfigModo.enviarDisplayConfigParaJanelas(state, {
      ...opts,
      janelas: registro.todas().filter((entry) => ROLES_COM_CONTEUDO.has(entry?.role)),
    });
  }

  /** Leitura do registo para diagnóstico e testes. Cópia — ninguém escreve por aqui. */
  function janelasDeProjecao() {
    return registro.todas();
  }

  /**
   * Serializa a config do relógio para comparação. `null` quando não é serializável —
   * nesse caso não há como deduplicar e o envio segue sempre.
   * @param {object} cfg
   */
  function assinaturaConfigRelogio(cfg) {
    try {
      return JSON.stringify(cfg);
    } catch (_) {
      return null;
    }
  }

  /**
   * Envia `display_config` ao relógio — **só quando a config mudou**.
   *
   * Esta função roda a cada `preview_display_config`, ou seja a cada tick do arrasto de um
   * slider no painel, e ainda a cada estrofe/versículo via `garantirTelasAbertasParaProjecao`.
   * O renderer do relógio reage a cada envio reescrevendo cor, quatro `fontSize`, o fundo do
   * `body` e chamando `tick()` (ver `display-clock.html`). Reenviar bytes idênticos era
   * repintar por nada — e é metade do «relógio a piscar».
   *
   * A assinatura vive no `win` porque é dela que depende o próximo envio àquela janela;
   * uma janela nova nasce sem assinatura e recebe sempre a primeira config.
   *
   * @param {object} [targetWin] janela específica; omitido, todas as de papel `relogio`
   */
  function enviarDisplayConfigParaJanelasRelogio(targetWin = null) {
    const cfg = { clock: resolverClockConfigPersistida() };
    const assinatura = assinaturaConfigRelogio(cfg);
    const entradas = targetWin
      ? [{ win: targetWin }]
      : registro.todas().filter((entry) => entry?.role === 'relogio');
    entradas.forEach((entry) => {
      const win = entry?.win;
      if (!win || win.isDestroyed()) return;
      if (assinatura !== null && win.__lyraClockCfgHash === assinatura) return;
      try {
        win.webContents.send('display_config', cfg);
        win.__lyraClockCfgHash = assinatura;
      } catch (_) {
  // intencional — erro ignorado
}
    });
  }

  function indicesMonitoresRelogioDesejados() {
    const ck = resolverClockConfigPersistida();
    if (ck.showClock === false) return [];
    const alvo = String(ck.monitorRelogio || 'ministrante').toLowerCase();
    const displays = obterDisplaysOrdenados();
    const fixos = loadDisplayIndices()
      .filter((i) => i >= 0 && i < displays.length)
      .map((i) => indiceProjecaoSeguro(i, displays))
      .filter((i) => i >= 0);
    const publicoIndex = fixos[0] != null ? fixos[0] : primeiroIndiceDeProjecao(displays);
    const ministranteIndex = fixos[1] != null ? fixos[1] : publicoIndex;
    const desejados = new Set();
    if ((alvo === 'publico' || alvo === 'ambos') && publicoIndex >= 0) desejados.add(publicoIndex);
    if ((alvo === 'ministrante' || alvo === 'ambos') && ministranteIndex >= 0) desejados.add(ministranteIndex);
    return Array.from(desejados);
  }

  function podeAbrirJanelaSecundaria() {
    return obterDisplaysOrdenados().length > 1;
  }

  /**
   * Config do relógio entregue na **linha de comando** da janela, para o renderer pintar
   * já com o fundo e a cor certos.
   *
   * Sem isto, `display-clock.html` aplicava a sua config embutida no parse do script e só
   * recebia a verdadeira no `did-finish-load` — a janela nascia com o tema padrão e
   * corrigia-se um ou dois frames depois. Invisível enquanto a janela vive; um flash a cada
   * recriação, que acontece sempre que o monitor do relógio muda.
   *
   * `bgImage` em base64 fica de fora quando o argumento passa de `LIMITE_ARGV_RELOGIO`: a
   * linha de comando do Windows tem tecto (~32 KB) e um fundo de imagem estoiraria-o. Nesse
   * caso vai só o essencial para o primeiro paint e a imagem chega por IPC como antes.
   */
  function bootstrapArgvRelogio() {
    try {
      const clock = resolverClockConfigPersistida();
      const assinatura = assinaturaConfigRelogio({ clock });
      const montar = (c) => `${PREFIXO_ARGV_RELOGIO}${encodeURIComponent(JSON.stringify({ clock: c }))}`;
      const completo = montar(clock);
      if (completo.length <= LIMITE_ARGV_RELOGIO) {
        return { arg: completo, assinatura, completo: true };
      }
      const semImagem = montar({ ...clock, bgImage: '' });
      if (semImagem.length <= LIMITE_ARGV_RELOGIO) {
        return { arg: semImagem, assinatura, completo: false };
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function abrirJanelaRelogio(displayIndex, label) {
    const displays = obterDisplaysOrdenados();
    if (!podeAbrirJanelaSecundaria()) return null;
    if (!displays[displayIndex]) return null;
    const d = displays[displayIndex];
    const bootstrap = bootstrapArgvRelogio();
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
        ...(bootstrap ? { additionalArguments: [bootstrap.arg] } : {}),
      },
    });
    finalizarJanelaRelogioNativa(win);
    /* Config completa entregue antes do primeiro paint: o `did-finish-load` abaixo vai
       deduplicar e não reenviar. Incompleta (bgImage cortada), fica sem assinatura para
       o envio por IPC acontecer. */
    if (bootstrap?.completo) win.__lyraClockCfgHash = bootstrap.assinatura;
    win.loadFile(resolverPaginaProjecao('display-clock.html'));
    win.setMenuBarVisibility(false);
    win.webContents.on('did-finish-load', () => {
      enviarDisplayConfigParaJanelasRelogio(win);
    });
    return win;
  }

  /** Janela preta permanente de um monitor — ver `ROLE_FUNDO`. */
  function abrirJanelaFundo(displayIndex) {
    const displays = obterDisplaysOrdenados();
    if (!podeAbrirJanelaSecundaria()) return null;
    const d = displays[displayIndex];
    if (!d) return null;
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
      /* Nunca recebe foco: é chão, não é interface. Sem isto podia roubar o teclado ao
         painel do operador ao ser criada. */
      focusable: false,
      title: `Fundo (Monitor ${displayIndex + 1})`,
      backgroundColor: PRETO_NATIVO_PROJECAO,
      webPreferences: { backgroundThrottling: false },
    });
    definirNivelTopo(win, false);
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      try { win.setFullScreen(true); } catch (_) {
  // intencional — erro ignorado
}
      try { win.show(); } catch (_) {
  // intencional — erro ignorado
}
    });
    win.loadURL(PAGINA_FUNDO);
    try { win.setMenuBarVisibility(false); } catch (_) {
  // intencional — erro ignorado
}
    return win;
  }

  /**
   * Monitores que o motor gere — a união de tudo onde ele alguma vez põe uma janela.
   *
   * É a fronteira da promessa «nunca mostrar o desktop»: só aqui é que o motor põe chão.
   * Um monitor fora desta lista é do utilizador e fica intocado.
   */
  function indicesMonitoresGeridos(routingDual) {
    const displays = obterDisplaysOrdenados();
    const set = new Set();
    const juntar = (i) => {
      if (!Number.isInteger(i) || i < 0 || i >= displays.length) return;
      if (indiceProjecaoSeguro(i, displays) < 0) return;
      set.add(i);
    };
    juntar(resolverIndicesEfetivosProjecao(routingDual).publicoIndex);
    juntar(resolverIndiceJanelaPersistenteMinistrante(routingDual));
    indicesMonitoresRelogioDesejados().forEach(juntar);
    loadDisplayIndices().forEach(juntar);
    return Array.from(set).sort((a, b) => a - b);
  }

  /**
   * Garante o chão preto nos monitores geridos.
   *
   * Barata quando nada mudou: sem monitores novos e com os bounds certos, não faz uma única
   * chamada nativa. Por isso pode correr no início de cada sincronização.
   */
  function sincronizarJanelasFundo(routingDual) {
    const desejados = new Set(indicesMonitoresGeridos(routingDual));
    const displays = obterDisplaysOrdenados();
    const restantes = [];

    registro.todas().forEach((entry) => {
      if (entry?.role !== ROLE_FUNDO) {
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
      /* Só quando o monitor mudou mesmo de sítio/resolução. O fundo é a última coisa que
         se quer a mexer: ele é que está a tapar o buraco. */
      if (!boundsIguais(win, d.bounds)) {
        try {
          if (win.isFullScreen()) win.setFullScreen(false);
          win.setBounds({
            x: d.bounds.x,
            y: d.bounds.y,
            width: d.bounds.width,
            height: d.bounds.height,
          });
          win.setFullScreen(true);
        } catch (_) {
  // intencional — erro ignorado
}
      }
      restantes.push(entry);
      desejados.delete(entry.index);
    });

    registro.substituirPor(restantes);

    desejados.forEach((displayIndex) => {
      const win = abrirJanelaFundo(displayIndex);
      if (!win) return;
      registro.adicionar({ role: ROLE_FUNDO, index: displayIndex, win });
    });
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

  /**
   * A janela desta entrada está mesmo em cima do monitor que lhe foi atribuído?
   *
   * O `entry.index` é o índice registado no momento em que a janela foi criada e não se
   * actualiza sozinho. Quando um monitor é desligado, o Windows não destrói as janelas
   * que estavam nele: move-as para outro ecrã — na prática, quase sempre o principal.
   * O motor continuava a ver `entry.index === 1` e a concluir que a rota estava cumprida,
   * enquanto a letra do hino já estava, fullscreen e always-on-top, por cima do painel do
   * operador. Comparar com a posição real é a única forma de detectar essa mudança.
   *
   * @param {object} entry entrada do registo de janelas
   * @param {number} displayIndex índice desejado
   * @param {Array} displays lista ordenada actual
   */
  function janelaCobreODisplay(entry, displayIndex, displays) {
    const d = displays[displayIndex];
    if (!d) return false;
    const win = entry?.win;
    if (!win || win.isDestroyed()) return false;
    /* Janela escondida de propósito (relógio à mostra) não tem posição a defender: quando
       voltar a aparecer passa pelo caminho que a reposiciona. */
    if (!win.isVisible()) return true;
    return boundsIguais(win, d.bounds);
  }

  /**
   * Assenta uma janela **oculta** em cima de um monitor, pronta a ser mostrada.
   *
   * Ordem canónica: `setBounds` → `setFullScreen(true)` → topo. O `show()` fica de fora
   * de propósito — é sempre o último passo, e é de quem chama.
   *
   * A ordem antiga era `setFullScreen(false)` → `setBounds` → `show()` → `setFullScreen(true)`:
   * a janela chegava a aparecer como janela normal antes de entrar em fullscreen, e essa
   * transição de modo tem frames próprios no Windows. Era o «lampejo branco» descrito em
   * `telasAbertasCorrespondemRota`.
   *
   * Sem mudança de bounds não há chamada nativa nenhuma — esta função roda em caminhos que
   * disparam a cada estrofe e a cada versículo.
   *
   * @param {import('electron').BrowserWindow} win janela OCULTA
   * @param {object} d entrada de `getOrderedDisplays`
   */
  function assentarJanelaOcultaNoDisplay(win, d) {
    if (!win || win.isDestroyed() || !d) return;
    try {
      if (!boundsIguais(win, d.bounds)) {
        /* Uma janela em fullscreen ignora `setBounds`; sair é obrigatório. Estando oculta,
           sair não custa nenhum frame visível. */
        if (win.isFullScreen()) win.setFullScreen(false);
        win.setBounds({
          x: d.bounds.x,
          y: d.bounds.y,
          width: d.bounds.width,
          height: d.bounds.height,
        });
      }
      if (!win.isFullScreen()) win.setFullScreen(true);
      aplicarTopoAbsolutoProjecao(win);
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  /**
   * Traz uma janela visível de volta para cima do monitor a que pertence.
   *
   * Sair do fullscreen antes de `setBounds` é obrigatório no Windows: uma janela em
   * fullscreen ignora o reposicionamento e fica onde está. A sequência pisca por um
   * instante — é o preço de a tirar de cima do painel do operador.
   *
   * @param {object} entry
   * @param {number} displayIndex
   */
  function reposicionarJanelaNoMonitor(entry, displayIndex) {
    const displays = obterDisplaysOrdenados();
    const d = displays[displayIndex];
    const win = entry?.win;
    if (!d || !win || win.isDestroyed()) return;
    try {
      if (win.isFullScreen()) win.setFullScreen(false);
      win.setBounds({
        x: d.bounds.x,
        y: d.bounds.y,
        width: d.bounds.width,
        height: d.bounds.height,
      });
      win.setFullScreen(true);
      aplicarTopoAbsolutoProjecao(win);
      entry.index = displayIndex;
    } catch (_) {
      // intencional — erro ignorado
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
        /* Guardado: sem isto era um `SetWindowPos(HWND_NOTOPMOST)` por tick de slider,
           numa janela que já está em `false` desde `finalizarJanelaRelogioNativa`. */
        definirNivelTopo(win, false);
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
        icon: caminhoIconeApp(),
          webPreferences: { zoomFactor: d.scaleFactor || 1 },
        }),
        show: false,
        transparent: false,
        backgroundColor: PRETO_NATIVO_PROJECAO,
      }
    );
    finalizarJanelaProjecaoNativa(win, { backgroundColor: PRETO_NATIVO_PROJECAO });

    win.loadFile(resolverPaginaProjecao('display.html'));
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
        icon: caminhoIconeApp(),
        webPreferences: { zoomFactor: d.scaleFactor || 1 },
      })
    );
    finalizarJanelaProjecaoNativa(win);

    win.loadFile(resolverPaginaProjecao('display.html'));
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
      ...opcoesBrowserWindowProjecao(d, label, { icon: caminhoIconeApp() }),
      show: false,
      transparent: false,
      backgroundColor: PRETO_NATIVO_PROJECAO,
    });
    finalizarJanelaProjecaoNativa(win, { backgroundColor: PRETO_NATIVO_PROJECAO });

    win.loadFile(resolverPaginaProjecao('display-operator.html'));
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
    const fallback = loadDisplayIndices()
      .filter((i) => i < displays.length)
      .map((i) => indiceProjecaoSeguro(i, displays))
      .filter((i) => i >= 0);

    if (publicoIndex !== -1 && !(publicoIndex < displays.length)) {
      publicoIndex = fallback[0] != null ? fallback[0] : primeiroIndiceDeProjecao(displays);
    }
    if (ministranteIndex !== -1 && !(ministranteIndex < displays.length)) {
      const fallback2 = fallback[1] != null ? fallback[1] : publicoIndex;
      ministranteIndex = fallback2;
    }

    /* Guarda final: qualquer caminho acima — roteamento gravado, ficheiro de índices ou
       fallback — pode apontar ao monitor do operador depois de o arranjo de ecrãs mudar. */
    publicoIndex = indiceProjecaoSeguro(publicoIndex, displays);
    ministranteIndex = indiceProjecaoSeguro(ministranteIndex, displays);

    return { publicoIndex, ministranteIndex, displays };
  }

  /**
   * Monitor da janela do ministrante, incluindo a **persistente**.
   *
   * Com o ministrante desactivado na rota, o motor mantém na mesma uma janela preta no
   * monitor de recurso, para que activá-lo mais tarde não custe uma janela nova a nascer à
   * vista. O índice de recurso vem de `loadDisplayIndices()`, que é cego à rota.
   *
   * E era cego a mais do que devia: com o público movido para esse mesmo monitor, o motor
   * abria **duas** janelas fullscreen always-on-top no mesmo ecrã — o telão e a persistente
   * do ministrante. Ambas nos papéis de topo absoluto, ambas a levar `moveTop()` a cada
   * ciclo do reclaim, cada uma a tapar a outra: o monitor a piscar sem parar. Se o monitor
   * já é do público, não há janela de recurso a abrir.
   */
  function resolverIndiceJanelaPersistenteMinistrante(routingDual) {
    const { publicoIndex, ministranteIndex, displays } = resolverIndicesEfetivosProjecao(routingDual);
    if (ministranteIndex >= 0) return ministranteIndex;
    if (!controladorAtivo()) return -1;
    const fixos = loadDisplayIndices().filter((i) => i >= 0 && i < displays.length);
    const recurso = fixos[1] != null ? indiceProjecaoSeguro(fixos[1], displays) : -1;
    if (recurso >= 0 && recurso === publicoIndex) return -1;
    return recurso;
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
    /* O escudo preto também é uma janela fullscreen: aplicar aqui a mesma guarda evita
       que um índice antigo tape o painel do operador com um rectângulo preto. */
    const paineis = loadDisplayIndices()
      .filter((i) => i >= 0 && i < displays.length)
      .map((i) => indiceProjecaoSeguro(i, displays))
      .filter((i) => i >= 0);
    return paineis.filter((i) => !emUso.has(i));
  }

  /**
   * Desiste de uma troca em curso e fecha a janela que estava a ser preparada.
   *
   * Corre sempre o `aoConcluir` da troca abandonada: é ele que destranca a cadeia de
   * sincronização. Deixá-lo por chamar deixaria as etapas seguintes — escudo e relógio —
   * à espera para sempre.
   */
  function cancelarTrocaPendente(entrada) {
    const pendente = entrada?.__trocaPendente;
    if (!pendente) return;
    entrada.__trocaPendente = null;
    if (pendente.temporizador) clearTimeout(pendente.temporizador);
    if (pendente.win && !pendente.win.isDestroyed()) {
      try { pendente.win.close(); } catch (_) {
  // intencional — erro ignorado
}
    }
    if (typeof pendente.aoConcluir === 'function') {
      try { pendente.aoConcluir(); } catch (_) {
  // intencional — erro ignorado
}
    }
  }

  /**
   * Troca de monitor: mantém a janela antiga até a nova estar visível no destino.
   *
   * **Idempotente por destino.** Chamar duas vezes com o mesmo `displayIndex` enquanto a
   * primeira troca ainda não concluiu devolve a janela já em preparação, em vez de abrir
   * outra.
   *
   * Sem esta guarda, o motor abria uma janela por chamada. Até a nova ficar visível,
   * `entrada.index` continua a apontar ao monitor antigo e `telasAbertasCorrespondemRota`
   * dá a rota por incumprida — por isso cada estrofe projetada reentrava aqui. As janelas
   * anteriores ficavam vivas, visíveis, fullscreen e always-on-top, mas fora do registo:
   * nunca mais recebiam conteúdo nem eram fechadas. Duas ou mais janelas topmost no mesmo
   * monitor, todas a fazer `moveTop()` no reclaim — o monitor a piscar entre o slide actual
   * e um slide velho, e a continuar a projetar num monitor de onde a rota já tinha saído.
   */
  function substituirJanelaNoMonitor(entrada, displayIndex, criarFn, labelFn, aoConcluir) {
    const concluir = () => {
      if (typeof aoConcluir === 'function') {
        try { aoConcluir(); } catch (_) {
  // intencional — erro ignorado
}
      }
    };
    if (!entrada?.win || entrada.win.isDestroyed()) {
      concluir();
      return null;
    }

    const pendente = entrada.__trocaPendente;
    if (pendente && pendente.win && !pendente.win.isDestroyed()) {
      if (pendente.alvo === displayIndex) {
        /* Já há uma troca a caminho deste destino. Não abrir outra — e não deixar este
           chamador pendurado: a cadeia dele segue já, a troca conclui-se sozinha. */
        concluir();
        return pendente.win;
      }
      /* Destino mudou a meio: a janela em preparação já não serve. */
      cancelarTrocaPendente(entrada);
    } else if (pendente) {
      cancelarTrocaPendente(entrada);
    }

    const antiga = entrada.win;
    const novoWin = criarFn(displayIndex, labelFn(displayIndex));
    if (!novoWin) {
      concluir();
      return null;
    }

    let trocou = false;
    const aplicarTroca = () => {
      if (trocou || novoWin.isDestroyed()) return;
      if (!novoWin.isVisible()) return;
      trocou = true;
      if (entrada.__trocaPendente?.win === novoWin) {
        if (entrada.__trocaPendente.temporizador) clearTimeout(entrada.__trocaPendente.temporizador);
        entrada.__trocaPendente = null;
      }
      entrada.index = displayIndex;
      entrada.win = novoWin;
      if (antiga && !antiga.isDestroyed()) {
        try { antiga.close(); } catch (_) {
  // intencional — erro ignorado
}
      }
      concluir();
    };

    /* Rede de segurança: se a janela nunca ficar visível (falha ao carregar, monitor que
       desaparece), a pendência é largada para que uma sincronização posterior possa tentar
       de novo. Sem isto, o papel ficaria preso à janela antiga para sempre. */
    let temporizador = null;
    try {
      temporizador = setTimeout(() => {
        if (trocou) return;
        cancelarTrocaPendente(entrada);
      }, TIMEOUT_TROCA_JANELA_MS);
      if (typeof temporizador.unref === 'function') temporizador.unref();
    } catch (_) {
      // intencional — erro ignorado
    }
    entrada.__trocaPendente = { alvo: displayIndex, win: novoWin, temporizador, aoConcluir: concluir };

    novoWin.once('ready-to-show', aplicarTroca);
    novoWin.webContents.once('did-finish-load', () => {
      try {
        /* Fullscreen e topo ANTES do `show()`: mostrar primeiro e entrar em fullscreen
           depois faz a janela aparecer um instante como janela normal. */
        finalizarJanelaProjecaoNativa(novoWin);
        if (!novoWin.isVisible()) novoWin.show();
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
      /* Uma janela escondida de propósito conta como assente: continuar à espera de a ver
         visível travaria a cadeia de sincronização a meio, e o `next()` nunca chegaria às
         janelas seguintes. */
      if (!win.isVisible() && !ocultoParaRelogio(win)) return;
      concluiu = true;
      if (typeof cb === 'function') cb();
    };
    win.once('ready-to-show', finalizar);
    win.webContents.once('did-finish-load', () => {
      try {
        /* Fullscreen e topo primeiro, `show()` depois — ver `assentarJanelaOcultaNoDisplay`.
           E o `show()` respeita quem escondeu a janela de propósito: na primeira passagem a
           marca está limpa e nada muda; é no disparo tardio, já depois de a cadeia ter
           escondido a janela, que ela evita a regressão. */
        finalizarJanelaProjecaoNativa(win);
        if (!win.isVisible() && !ocultoParaRelogio(win)) win.show();
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
            /* A rota voltou a querer esta janela visível, o que substitui qualquer
               ocultação anterior. Limpar as duas marcas juntas — deixá-las de pé faria
               um `finalizarJanelaProjecaoNativa` posterior recusar-se a mostrá-la. */
            principal.ocultoParaRelogio = false;
            marcarOcultoParaRelogio(principal.win, false);
            assentarJanelaOcultaNoDisplay(principal.win, d);
            principal.win.show();
            principal.index = displayIndex;
          } catch (_) {
  // intencional — erro ignorado
}
        }
      } else if (principal.index !== displayIndex) {
        /* Esperar pela troca antes de seguir: as etapas seguintes decidem escudo e relógio
           a partir de quem ocupa o quê, e corriam com o registo ainda a apontar ao monitor
           antigo. `substituirJanelaNoMonitor` garante que o callback corre sempre — na
           troca, na desistência e no timeout. */
        substituirJanelaNoMonitor(principal, displayIndex, abrirFn, labelFn, next);
        return;
      } else if (!janelaCobreODisplay(principal, displayIndex, obterDisplaysOrdenados())) {
        /* Índice certo, sítio errado: é o que sobra depois de um monitor ser desligado e
           o Windows arrastar a janela órfã para outro ecrã. Recolocar é suficiente —
           recriar a janela custaria um piscar e perderia o conteúdo já renderizado. */
        reposicionarJanelaNoMonitor(principal, displayIndex);
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
          } else if (
            entry.win.isVisible() &&
            !janelaCobreODisplay(entry, entry.index, obterDisplaysOrdenados())
          ) {
            /* Escudo arrastado pelo Windows depois de um monitor sair. Um rectângulo preto
               fullscreen por cima do painel é tão incapacitante como a letra do hino. */
            reposicionarJanelaNoMonitor(entry, entry.index);
          } else if (!entry.win.isVisible()) {
            // Escudo estava oculto — reposicionar e mostrar no mesmo monitor
            // Sequência: sair do fullscreen (oculto = sem flash) → setBounds → show → fullscreen
            const displays = obterDisplaysOrdenados();
            const d = displays[entry.index];
            try {
              /* Mesma razão do `sincronizarJanelaRole`: mostrar de propósito revoga a
                 ocultação anterior, e as duas marcas têm de acompanhar. */
              entry.ocultoParaRelogio = false;
              marcarOcultoParaRelogio(entry.win, false);
              assentarJanelaOcultaNoDisplay(entry.win, d);
              entry.win.show();
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

    /* PRIMEIRO passo, sempre: o chão tem de existir antes de qualquer etapa que possa
       descobrir um monitor — esconder o telão, fechar o relógio, mover uma janela. */
    sincronizarJanelasFundo(routingDual);

    const { publicoIndex } = resolverIndicesEfetivosProjecao(routingDual);
    const ministranteIndex = resolverIndiceJanelaPersistenteMinistrante(routingDual);
    const escudos = indicesMonitoresEscudoPreto(routingDual);

    if (publicoIndex < 0 && ministranteIndex < 0 && escudos.length === 0) {
      fecharJanelasPorRole('relogio');
      if (controladorAtivo()) {
        /* O chão fica: há operador, e o que ele vê nos monitores tem de continuar preto. */
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
    /*
     * Conta como presente a janela **visível** ou a **escondida de propósito** para o
     * relógio. As duas cumprem a rota; a segunda está apenas a deixar ver o que está por
     * baixo. Ocultas por outra razão — o papel foi desactivado, `displayIndex < 0` — é que
     * não contam, e era só isso que a regra original queria dizer.
     *
     * A distinção passou a importar quando o `hide()` do relógio começou a pegar: em modo
     * Bíblia a projectar só no público, cada versículo chama
     * `garantirTelasAbertasParaProjecao` (`commandApplier.js`), e com o ministrante oculto
     * a rota parecia desrespeitada. O resultado era um resync completo por versículo, que
     * mostrava a janela do ministrante e a escondia logo a seguir — o monitor a piscar, com
     * lampejo branco na sequência `setFullScreen(false)` → `setBounds` → `show`.
     */
    const cumpreRota = (e) =>
      e?.win && !e.win.isDestroyed() && (e.win.isVisible() || ocultoParaRelogio(e.win));

    /*
     * Uma troca de monitor em curso já vai dar no índice pedido — reiniciar a cadeia por
     * cima dela é o que abria janelas a mais. Ver `substituirJanelaNoMonitor`.
     */
    const noIndicePedido = (e, idx) =>
      e?.index === idx || e?.__trocaPendente?.alvo === idx;
    const trocaEmCursoPara = (e, idx) => e?.__trocaPendente?.alvo === idx;
    const pubWins = registro.todas().filter((e) => e?.role === 'publico' && cumpreRota(e));
    const minWins = registro.todas().filter((e) => e?.role === 'ministrante' && cumpreRota(e));

    if (pub < 0 && min < 0) {
      if (controladorAtivo()) {
        return pubWins.length + minWins.length > 0;
      }
      return pubWins.length === 0 && minWins.length === 0;
    }

    /* O índice registado não chega: ver `janelaCobreODisplay`. Sem a verificação de
       posição, desligar um monitor deixava a janela órfã onde o Windows a atirou — e o
       motor dava a rota por cumprida em vez de a corrigir. */
    const displaysAgora = obterDisplaysOrdenados();

    if (pub < 0) {
      if (pubWins.length !== 0) return false;
    } else if (
      pubWins.length !== 1 ||
      !noIndicePedido(pubWins[0], pub) ||
      (!trocaEmCursoPara(pubWins[0], pub) && !janelaCobreODisplay(pubWins[0], pub, displaysAgora))
    ) {
      return false;
    }
    if (min < 0) {
      if (minWins.length !== 0) return false;
    } else if (
      minWins.length !== 1 ||
      !noIndicePedido(minWins[0], min) ||
      (!trocaEmCursoPara(minWins[0], min) && !janelaCobreODisplay(minWins[0], min, displaysAgora))
    ) {
      return false;
    }

    const escudoIndices = indicesMonitoresEscudoPreto(routingDual);
    const escudoWins = registro.todas().filter((e) => e?.role === 'escudo' && cumpreRota(e));
    for (const idx of escudoIndices) {
      const noIndice = escudoWins.filter((e) => e.index === idx);
      if (noIndice.length !== 1) return false;
      if (!janelaCobreODisplay(noIndice[0], idx, displaysAgora)) return false;
    }
    for (const entry of escudoWins) {
      if (!escudoIndices.includes(entry.index)) return false;
    }

    return true;
  }

  /**
   * **Fachada de renderização do Core** (RFC §5.8, sub-passo 5).
   *
   * Substitui a sequência que se repetia **8 vezes** no `httpServer.js`:
   *
   * ```js
   * atualizarDisplays(ctx.estadoAtual);
   * ctx.estadoMinistrante = snapshotMinistranteAtual();
   * atualizarDisplayMinistrante(ctx.estadoMinistrante);
   * ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
   * ```
   *
   * O contrato foi desenhado a partir desses 8 sítios reais, não inventado. Duas coisas
   * ficaram **de fora de propósito**:
   *
   * - `garantirTelasAbertasParaProjecao()` — nem todos os sítios a chamam;
   * - `aplicarDisplayConfigNasJanelas()` — aparece **antes** do render em dois sítios e
   *   **depois** em outros dois. Absorvê-la aqui fixaria uma ordem e mudaria o
   *   comportamento de metade dos chamadores. Fica explícita, na ordem de cada um.
   *
   * O motor **não emite** o estado público: devolve-o, e o host propaga como souber
   * (no Server, `io.emit`; no modo local, nada).
   *
   * @param {{
   *   estado?: object,
   *   reforcarMinistrante?: boolean
   * }} [payload]
   *   `estado` — estado público desejado. Omitido, re-renderiza o que já está na porta.
   *   `reforcarMinistrante` — repete o push do ministrante num `setImmediate` e num
   *   `setTimeout(160)`. É um *workaround* de timing descoberto por tentativa e erro
   *   (a janela do ministrante perdia a primeira atualização em alguns casos); usado nos
   *   caminhos de música e de Bíblia. Movido verbatim — não racionalizar.
   * @returns {{ estadoPublico: object, estadoMinistrante: object }}
   */
  function render(payload = {}) {
    if (payload.estado !== undefined) {
      state.estadoAtual = payload.estado;
    }

    atualizarDisplays(state.estadoAtual);
    state.estadoMinistrante = snapshotMinistranteAtual();
    atualizarDisplayMinistrante(state.estadoMinistrante);

    if (payload.reforcarMinistrante) {
      const reforcar = () => {
        state.estadoMinistrante = snapshotMinistranteAtual();
        atualizarDisplayMinistrante(state.estadoMinistrante);
      };
      setImmediate(reforcar);
      setTimeout(reforcar, 160);
    }

    return {
      estadoPublico: estadoPublicoParaSocketsOuApi(),
      estadoMinistrante: state.estadoMinistrante,
    };
  }

  function garantirTelasAbertasParaProjecao() {
    const routingDual = loadDisplayRouting();

    /* Antes de decidir o que quer que seja: garantir o chão. É barato quando nada mudou
       (nenhuma chamada nativa) e é o que sustenta a promessa de nunca revelar o desktop,
       inclusive nos caminhos abaixo que devolvem cedo sem tocar em janela nenhuma. */
    try {
      sincronizarJanelasFundo(routingDual);
    } catch (e) {
      logError('sincronizar-janelas-fundo', e);
    }

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
    render,
    atualizarDisplays,
    atualizarDisplayMinistrante,
    estadoPublicoParaSocketsOuApi,
    snapshotMinistranteAtual,
    encerrarProjecaoPorEsc,
    fecharTodasJanelasProjecao,
    abrirTelasConfiguradas,
    garantirTelasAbertasParaProjecao,
    sincronizarJanelasRelogio,
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

module.exports = { createProjectionEngine };
