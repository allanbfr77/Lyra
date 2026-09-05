'use strict';

const displayRoutingMod = require('./displayRouting');
const displayIndicesMod = require('./displayIndices');
const displayConfigLib = require('./displayConfig');
const projectionPayloads = require('./projectionPayloads');
const projectionEncerrar = require('./projectionEncerrar');
const displayConfigModo = require('./displayConfigModo');
const { getOrderedDisplays } = require('./monitorsList');
const { createWindowRegistry } = require('./windowRegistry');
const { criarDiagnosticoNulo } = require('./janelasDiagnostico');
/* Lazy no ESC: evita ciclo de carga com commandApplier (que recebe o engine injectado). */
function estadoBibliaParaObsEsc(state) {
  return require('./commandApplier').estadoBibliaParaObs(state);
}

const { indicesJanelasProjecaoDeRoteamentoDual } = displayRoutingMod;

/** Fundo nativo Electron — independente de CSS/config; evita flash do desktop. */
const PRETO_NATIVO_PROJECAO = '#000000';

/**
 * Pinta o documento de preto e espera dois quadros do compositor.
 *
 * `ready-to-show` no Windows dispara com o primeiro HWND ainda branco — o DWM só
 * cacheia o quadro preto depois da primeira composição real. Sem este JS + 2 rAF
 * antes do `showInactive()`, o projetor vê um clarão só na primeira sessão
 * (primeiro `ShowWindow`) e na primeira janela nova da sessão (ex.: primeira
 * entrada no modo Bíblia, que cria/reposiciona o telão).
 */
const JS_FORCAR_QUADRO_PRETO = `(() => {
  try {
    const d = document;
    if (d.documentElement) {
      d.documentElement.style.background = '#000000';
      d.documentElement.style.colorScheme = 'dark';
    }
    if (d.body) {
      d.body.style.background = '#000000';
      d.body.style.backgroundColor = '#000000';
      d.body.classList.add('idle-sem-projecao');
    }
    const tela = d.getElementById && d.getElementById('tela');
    if (tela) {
      tela.style.background = '#000000';
      tela.style.backgroundColor = '#000000';
    }
  } catch (e) {}
  return new Promise((resolve) => {
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 16);
    raf(() => raf(() => resolve(true)));
  });
})()`;

/**
 * Nível mais alto do Electron no Windows — acima de outros programas de projeção
 * que também usam always-on-top / fullscreen (EasyWorship, ProPresenter, etc.).
 * @see https://www.electronjs.org/docs/latest/api/browser-window#winsetalwaysontopflag-level
 */
const NIVEL_TOPO_PROJECAO = 'screen-saver';

/**
 * Espera dois quadros do compositor **sem pintar nada**.
 *
 * O objectivo do JS antes do `ShowWindow` nunca foi o preto em si — foi provar que o
 * renderer está vivo e a compor. Nas telas de conteúdo o preto é bem-vindo (o tema volta
 * quando chega conteúdo). No chão e no relógio era dano colateral: ver `ROLES_PINTAR_PRETO`.
 */
const JS_AGUARDAR_QUADRO = `(() => {
  return new Promise((resolve) => {
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 16);
    raf(() => raf(() => resolve(true)));
  });
})()`;

/** Roles que devem cobrir o outro software de projeção (relógio fica atrás de propósito). */
const ROLES_TOPO_ABSOLUTO = new Set(['publico', 'ministrante', 'escudo']);

/**
 * Roles cujo renderer desenha conteúdo — e só esses levam o quadro preto à força.
 *
 * `JS_FORCAR_QUADRO_PRETO` escreve `background` INLINE no `body`. Nas telas de conteúdo é o
 * que se quer: o renderer repinta o fundo do tema quando chega conteúdo. No relógio, não:
 * `display-clock.html` aplica o fundo configurado pela MESMA propriedade
 * (`document.body.style.background`), e o inline do motor apagava-o. Como a config do
 * relógio é entregue por `additionalArguments` e depois deduplicada por `__lyraClockCfgHash`,
 * ela nunca era reenviada — o fundo ficava preto para sempre. Com o padrão de fábrica
 * (`clock.bgColor: '#f5f2ea'`, `textColor: '#1c1816'`) isso dá um relógio quase preto sobre
 * preto: um M3 que parece apagado quando devia estar a mostrar as horas.
 *
 * O chão está fora pelo motivo oposto: a página dele já é preta e não tem script nenhum.
 */
const ROLES_PINTAR_PRETO = new Set(['publico', 'ministrante', 'escudo']);

/**
 * Marca o papel na própria janela.
 *
 * O registo já sabe o papel de cada uma, mas quem precisa dele aqui são funções que recebem
 * o `win` e não a entrada — `aplicarTopoAbsolutoProjecao`, `revelarJanelaProjecaoQuandoPreta`
 * e o diário de bordo. Mesma razão de `__lyraOcultoParaRelogio` e `__lyraSemExibicao`
 * viverem no `win`.
 *
 * @param {import('electron').BrowserWindow} win
 * @param {'publico'|'ministrante'|'escudo'|'relogio'|'fundo'} papel
 * @param {number} indice monitor no momento da criação (só para o diário; a verdade é o registo)
 */
function marcarPapelDaJanela(win, papel, indice) {
  if (!win || win.isDestroyed()) return win;
  try {
    win.__lyraRole = papel;
    win.__lyraIndex = indice;
  } catch (_) {
    // intencional — erro ignorado
  }
  return win;
}

/** Papel da janela, ou `null` quando a marca não existe. */
function papelDaJanela(win) {
  try {
    return win && !win.isDestroyed() ? win.__lyraRole || null : null;
  } catch (_) {
    return null;
  }
}

/** Monitor anotado na criação da janela. */
function indiceDaJanela(win) {
  try {
    return win && !win.isDestroyed() ? win.__lyraIndex : undefined;
  } catch (_) {
    return undefined;
  }
}

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
const PAGINA_FUNDO = 'data:text/html;charset=utf-8,%3Chtml%20style%3D%22background%3A%23000%3Bcolor-scheme%3Adark%22%3E%3Cbody%20style%3D%22margin%3A0%3Bbackground%3A%23000%22%3E%3C%2Fbody%3E%3C%2Fhtml%3E';

/**
 * Roles que renderizam conteúdo e por isso recebem `display_config` do telão.
 * O escudo é preto por definição; o relógio tem a sua própria fonte de config.
 * Ver `aplicarDisplayConfigNasJanelas`.
 */
const ROLES_COM_CONTEUDO = new Set(['publico', 'ministrante']);

/**
 * Intervalo do reclaim global — outro TOPMOST no M2 sobe a z-order sem tirar foco do M3.
 *
 * O ciclo só faz `moveTop()`. Reemitir `setAlwaysOnTop('screen-saver')` a cada tick era
 * `SetWindowPos` permanente numa superfície a cobrir o projetor — HDMI a renegociar e o
 * PC a «piscar». O `blur` é que reafirma o nível, quando outro app realmente subiu.
 */
const INTERVALO_RECLAIM_TOPO_MS = 2000;

/** Folga em px ao comparar bounds — DPI e `getBounds` em ecrã secundário oscilam 1 px. */
const TOLERANCIA_BOUNDS_PX = 2;

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
 * Tecto do adiamento de um `show` — ver `mostrarJanelaProjecaoQuandoPronta`.
 * Passado isto, a janela é revelada pelo caminho protegido mesmo sem `ready-to-show`.
 */
const TIMEOUT_REVELACAO_ADIADA_MS = 4000;

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
 * Marca (ou desmarca) uma janela como **em «Não exibir»**.
 *
 * «Não exibir» é uma instrução de conteúdo, não de hardware: o monitor continua ligado, a
 * janela continua a existir no sítio dela e continua visível — apenas preta, sem conteúdo
 * daquele modo. Antes desta marca, um canal roteado para «Não exibir» levava `hide()`, e
 * cada ida e volta entre modos era um esconder/mostrar a mais no projetor: exactamente o
 * churn que faz o Windows renegociar a saída de vídeo.
 *
 * A marca vive no `win` — e não só na entrada do registo — porque quem a consulta são
 * funções que recebem o `win` (`telasAbertasCorrespondemRota`, os `show()` do ciclo de
 * vida). É distinta de `ocultoParaRelogio`: aquela é «escondida para revelar o relógio»,
 * esta é «visível mas sem nada para mostrar».
 *
 * @param {import('electron').BrowserWindow} win
 * @param {boolean} sem
 */
function marcarSemExibicao(win, sem) {
  if (!win || win.isDestroyed()) return;
  try {
    win.__lyraSemExibicao = !!sem;
  } catch (_) {
    // intencional — erro ignorado
  }
}

/**
 * A janela está preta por «Não exibir» (e não por estar a mostrar conteúdo)?
 * @param {import('electron').BrowserWindow} win
 */
function estaSemExibicao(win) {
  try {
    return !!(win && !win.isDestroyed() && win.__lyraSemExibicao);
  } catch (_) {
    return false;
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
  /*
   * Ponto de estrangulamento: o chão e o relógio NUNCA sobem à banda topmost.
   *
   * A regra já existia em `ROLES_TOPO_ABSOLUTO`, mas só o ciclo de reclaim a aplicava.
   * `revelarJanelaProjecaoQuandoPreta` chamava esta função em TODAS as janelas que revelava
   * — incluindo as duas que nascem com `definirNivelTopo(win, false)` explícito. O chão
   * ficava topmost para o resto da sessão (nada o rebaixa depois) e o relógio era rebaixado
   * no `sincronizarJanelasRelogio` seguinte: o relógio acabava DEBAIXO do chão preto, e o M3
   * em repouso mostrava preto em vez das horas. O `moveTop()` que o motor faz no relógio
   * antes de esconder o ministrante não resolvia — `moveTop` ordena dentro da banda, não
   * atravessa a fronteira topmost.
   *
   * A guarda vive aqui, e não em cada chamador, porque é isso que impede a próxima chamada
   * esquecida. Janela sem papel marcado passa, para não mudar caminhos não previstos.
   */
  const papel = papelDaJanela(win);
  if (papel && !ROLES_TOPO_ABSOLUTO.has(papel)) return;
  definirNivelTopo(win, NIVEL_TOPO_PROJECAO, opts);
  try {
    win.moveTop();
  } catch (_) {
    // intencional — erro ignorado
  }
}

/**
 * Mostra uma janela de projeção **sem lhe dar o foco do teclado**.
 *
 * `show()` no Electron mostra E foca. Numa janela de projeção isso tira o teclado ao
 * painel do operador: as setas do Modo Slides deixam de chegar ao renderer — o listener
 * está no `document` do painel, e um painel sem foco do SO não recebe `keydown` nenhum —
 * e só um clique devolve o controlo. Era o que acontecia a cada nascimento de janela, a
 * cada troca de monitor e a cada volta do relógio de ocioso ao conteúdo.
 *
 * Nenhuma destas janelas é interface: o `focusable: false` do chão (`abrirJanelaFundo`)
 * já dizia o mesmo por outras palavras, mas só ali.
 *
 * E `focusable: false` NÃO serve para as restantes: o ESC que encerra a projeção a partir
 * da janela física vive num `before-input-event`, que só dispara na janela focada — torná-la
 * não-focável matava esse atalho. Com `showInactive()` a janela continua focável se o
 * operador clicar nela; deixa apenas de tomar o foco sozinha.
 *
 * O ramo `show()` é recuo para uma versão de Electron sem `showInactive` — nunca pior do
 * que o comportamento actual.
 *
 * @param {import('electron').BrowserWindow} win
 */
/**
 * A janela já recebeu `ready-to-show`?
 *
 * Isso NÃO basta para a mostrar: no Windows o primeiro quadro do compositor ainda
 * sai branco. Quem revela é `revelarJanelaProjecaoQuandoPreta` (bootstrap + JS preto
 * + 2 rAF). A marca só diz que o Chromium já tem um quadro — a cadeia de sincronização
 * usa-a para não mostrar cedo demais.
 *
 * A marca é posta em `finalizarJanelaProjecaoNativa`, que corre logo a seguir ao
 * `new BrowserWindow` de todas as janelas de projeção; por isso o ouvinte está sempre
 * registado antes de o evento poder disparar.
 */
function jaPintouPrimeiroQuadro(win) {
  return !!(win && !win.isDestroyed() && win.__lyraPrimeiroQuadro);
}

function mostrarJanelaProjecaoSemFoco(win) {
  if (!win || win.isDestroyed()) return;
  if (typeof win.showInactive === 'function') {
    win.showInactive();
    return;
  }
  win.show();
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
    /* Nasce oculta: só se mostra depois do quadro preto composto — ver
       `revelarJanelaProjecaoQuandoPreta`. `ready-to-show` sozinho ainda é branco no 1.º HWND. */
    show: false,
    /* Win11: sem Mica/Acrylic por baixo do canvas — o material do DWM é claro. */
    ...(process.platform === 'win32' ? { backgroundMaterial: 'none' } : {}),
    /*
     * Sem fullscreen exclusivo. No Windows `fullscreen: true` / `setFullScreen(true)`
     * entra em modo DXGI e o projetor (M2) trata isso como perda de sinal — handshake
     * HDMI em loop, PC a «piscar», seletores certos mas janela instável. Holyrics cobre
     * o ecrã com uma janela sem moldura do tamanho do monitor; é o mesmo modelo aqui.
     */
    fullscreen: false,
    fullscreenable: false,
    frame: false,
    thickFrame: false,
    resizable: false,
    maximizable: false,
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

  /**
   * Diário de bordo das janelas — ver `janelasDiagnostico.js` para o que entra e o que não.
   *
   * Opcional de propósito: um host que não o injecte (os testes, um arranque sem `userData`)
   * recebe o diário nulo e o motor não muda de comportamento. É por isso que não há uma
   * única guarda `if (diario)` no corpo do motor.
   */
  const diario = deps.diagnostico || criarDiagnosticoNulo();

  /**
   * Chamadas do caminho rápido de `garantirTelasAbertasParaProjecao` desde a última linha.
   *
   * Essa função corre a cada estrofe e a cada versículo. Uma linha por chamada afogaria o
   * diário num culto normal, e o caminho rápido não faz nada de interessante — por isso só
   * conta, e o número viaja na próxima linha que interessa.
   */
  let garantirRapidas = 0;

  /** Instantâneo barato do estado nativo de uma janela. Nunca lança. */
  function instantaneoJanela(win) {
    if (!win || win.isDestroyed()) return { vivo: false };
    const linha = {};
    try { linha.vis = !!win.isVisible(); } catch (_) { /* intencional */ }
    try { linha.b = win.getBounds(); } catch (_) { /* intencional */ }
    linha.quadro = !!win.__lyraPrimeiroQuadro;
    linha.topo = win.__lyraNivelTopo === undefined ? null : String(win.__lyraNivelTopo);
    return linha;
  }

  /** Uma linha do diário sobre uma janela. */
  function diag(evento, win, extra) {
    try {
      diario.registar(evento, {
        papel: papelDaJanela(win),
        indice: indiceDaJanela(win),
        ...instantaneoJanela(win),
        ...(extra || {}),
      });
    } catch (_) {
      // intencional — o diário nunca pode derrubar a projeção
    }
  }

  /** Linha do diário que não é sobre uma janela (rota, sincronização, monitores). */
  function diagGeral(evento, dados) {
    try {
      diario.registar(evento, dados || {});
    } catch (_) {
      // intencional — erro ignorado
    }
  }

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
   *
   * Só `moveTop()` — sem reemitir `setAlwaysOnTop`. Ver `INTERVALO_RECLAIM_TOPO_MS`.
   */
  function reafirmarTopoTodasJanelasProjecao() {
    for (const entry of registro.todas()) {
      if (!ROLES_TOPO_ABSOLUTO.has(entry?.role)) continue;
      const win = entry?.win;
      if (!win || win.isDestroyed() || !win.isVisible()) continue;
      try {
        win.moveTop();
      } catch (_) {
        // intencional — erro ignorado
      }
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
      /*
       * A janela em «Não exibir» recebe o payload ocioso — nunca o conteúdo.
       *
       * É aqui que «Não exibir» se cumpre de facto. Enquanto a janela era escondida, o
       * conteúdo continuava a ser-lhe enviado e ninguém dava por isso: estava fora de
       * vista. Agora que ela fica visível a preto no monitor, mandar-lhe o conteúdo
       * mostrava-o — exactamente o que o operador pediu para não acontecer.
       */
      const paraEstaJanela = estaSemExibicao(win) ? estadoOciosoPublico() : payloadPublicoJanelas;
      try { win.webContents.send('atualizar', paraEstaJanela); } catch (_) {
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
        /* Ver o gémeo em `atualizarDisplays`: «Não exibir» só é real se o conteúdo não
           chegar à janela. */
        const paraEstaJanela = estaSemExibicao(win) ? estadoOciosoMinistrante() : payload;
        try { win.webContents.send('atualizar_ministrante', paraEstaJanela); } catch (_) {
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
            esconderJanelaProjecao(win, 'revelar-relogio');
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
            if (mostrarJanelaProjecaoQuandoPronta(win, 'relogio-para-conteudo')) {
              aplicarTopoAbsolutoProjecao(win);
            }
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
  /**
   * Marca (ou desmarca) os canais que a rota deixou em «Não exibir».
   *
   * É a única forma de o resto do motor distinguir «esta janela está preta porque o
   * operador mandou não exibir neste modo» de «esta janela está preta porque ainda não
   * chegou conteúdo». A janela não é fechada nem escondida: o monitor continua ocupado e
   * estável, que é o ponto de «Não exibir» ser uma instrução de conteúdo e não de hardware.
   *
   * @param {{ publico?: boolean, ministrante?: boolean }} canais
   */
  function marcarCanaisSemExibicao(canais = {}) {
    const porRole = { publico: !!canais.publico, ministrante: !!canais.ministrante };
    registro.todas().forEach((entry) => {
      if (!(entry?.role in porRole)) return;
      if (!entry?.win || entry.win.isDestroyed()) return;
      const sem = porRole[entry.role];
      entry.semExibicao = sem;
      marcarSemExibicao(entry.win, sem);
    });
  }

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
        diag('fechar', entry.win, { motivo: 'fechar-todas' });
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
   * Cada janela de projeção reporta o viewport que o SEU renderer está a ver.
   * Serve para confirmar, no PC do utilizador, que o M3 mede 1360×768 e o M2 mede
   * 800×600 — sem cruzar dimensões. Grava no log de erros do host (`viewport-janela`).
   */
  function geometriaNativaDaJanela(win) {
    let windowBounds = null;
    let contentBounds = null;
    let contentSize = null;
    let windowsScaleFactor = null;
    try {
      windowBounds = win.getBounds();
    } catch (_) {
      // intencional
    }
    try {
      contentBounds = typeof win.getContentBounds === 'function' ? win.getContentBounds() : null;
    } catch (_) {
      // intencional
    }
    try {
      contentSize = typeof win.getContentSize === 'function' ? win.getContentSize() : null;
    } catch (_) {
      // intencional
    }
    try {
      if (screen && typeof screen.getDisplayMatching === 'function' && windowBounds) {
        const d = screen.getDisplayMatching(windowBounds);
        if (d && Number.isFinite(d.scaleFactor)) windowsScaleFactor = d.scaleFactor;
      }
    } catch (_) {
      // intencional
    }
    return { windowBounds, contentBounds, contentSize, windowsScaleFactor };
  }

  function contextoLogViewport(info) {
    const tipo = info && info.tipoDiagnostico;
    if (typeof tipo === 'string' && tipo.trim()) {
      return tipo.replace(/^\[/, '').replace(/\]$/, '');
    }
    return 'viewport-janela';
  }

  function anexarDiagnosticoViewport(win) {
    const wc = win && win.webContents;
    if (!wc) return;
    const ipc = wc.ipc;
    if (!ipc || typeof ipc.on !== 'function') return;
    if (win.__lyraViewportIpcBound) return;
    win.__lyraViewportIpcBound = true;
    if (typeof ipc.handle === 'function') {
      try {
        ipc.handle('lyra-janela-geometria', () => geometriaNativaDaJanela(win));
      } catch (_) {
        // intencional — canal já registado nesta janela
      }
    }
    ipc.on('lyra-viewport-janela', (_event, info) => {
      const geo = geometriaNativaDaJanela(win);
      const linha = {
        ...(info && typeof info === 'object' ? info : {}),
        windowBounds: geo.windowBounds,
        contentBounds: geo.contentBounds,
        contentSize: geo.contentSize,
        windowsScaleFactor: geo.windowsScaleFactor,
        boundsJanela: geo.windowBounds,
        contentBoundsJanela: geo.contentBounds,
      };
      try {
        logError(contextoLogViewport(info), JSON.stringify(linha));
      } catch (_) {
        try {
          console.log('[Lyra viewport]', linha);
        } catch (__) {
          // intencional
        }
      }
    });
  }

  /**
   * Único caminho que revela uma janela de projeção pela primeira vez.
   *
   * Espera o compositor pintar preto (JS + 2 rAF) e só então `showInactive()`.
   * Idempotente: a segunda chamada não volta a mostrar.
   */
  function revelarJanelaProjecaoQuandoPreta(win) {
    if (!win || win.isDestroyed() || win.__lyraRevelada || win.__lyraRevelando) return;
    if (ocultoParaRelogio(win)) {
      win.__lyraPrimeiroQuadro = true;
      return;
    }
    win.__lyraRevelando = true;
    const papel = papelDaJanela(win);
    /* Só as telas de conteúdo levam o preto à força — ver `ROLES_PINTAR_PRETO`. */
    const script = ROLES_PINTAR_PRETO.has(papel) ? JS_FORCAR_QUADRO_PRETO : JS_AGUARDAR_QUADRO;
    diag('revelar-inicio', win, { preto: ROLES_PINTAR_PRETO.has(papel) });

    const acabar = () => {
      if (!win || win.isDestroyed() || win.__lyraRevelada) return;
      win.__lyraRevelada = true;
      win.__lyraRevelando = false;
      win.__lyraPrimeiroQuadro = true;
      if (ocultoParaRelogio(win)) {
        diag('revelar-suprimido', win, { motivo: 'oculto-para-relogio' });
        return;
      }
      aplicarTopoAbsolutoProjecao(win);
      try { mostrarJanelaProjecaoSemFoco(win); } catch (_) {
        // intencional — erro ignorado
      }
      diag('revelar-fim', win);
      atualizarLoopTopoAbsolutoProjecao();
    };

    const wc = win.webContents;
    if (!wc || typeof wc.executeJavaScript !== 'function') {
      acabar();
      return;
    }
    let p;
    try {
      p = wc.executeJavaScript(script, true);
    } catch (_) {
      acabar();
      return;
    }
    Promise.resolve(p).then(acabar).catch(acabar);
  }

  /**
   * Revela só quando o Chromium tem um quadro (`ready-to-show`) E o bootstrap
   * ocioso já foi enviado. Qualquer um dos dois sozinho ainda pode ser branco.
   */
  function tentarRevelarJanelaProjecao(win) {
    if (!win || win.isDestroyed() || win.__lyraRevelada) return;
    if (ocultoParaRelogio(win)) {
      win.__lyraPrimeiroQuadro = true;
      return;
    }
    if (!win.__lyraPrimeiroQuadro || !win.__lyraBootstrapOk) return;
    revelarJanelaProjecaoQuandoPreta(win);
  }

  function marcarBootstrapPronto(win) {
    if (!win || win.isDestroyed()) return;
    /* Só a primeira vez: há três sítios a registar `did-finish-load` na mesma janela e o
       diário ficava com a mesma linha repetida meia dúzia de vezes por carregamento. */
    if (!win.__lyraBootstrapOk) diag('bootstrap', win);
    win.__lyraBootstrapOk = true;
    tentarRevelarJanelaProjecao(win);
  }

  /**
   * Esconde uma janela de projeção, registando que ela JÁ TEM quadro composto.
   *
   * Uma janela que esteve visível pintou, por definição — foi para o ecrã. Sem esta marca,
   * uma janela que o próprio motor escondeu (para revelar o relógio, para saltar de monitor,
   * para tirar um escudo da rota) voltaria a ser tratada como «nunca pintou» por
   * `mostrarJanelaProjecaoQuandoPronta`, e a guarda adiaria um `show` que é seguro — o
   * conteúdo dela já está composto, só não está à vista.
   *
   * `ready-to-show` continua a ser a outra fonte da marca. Esta cobre o resto do ciclo:
   * janelas que o motor esconde e volta a mostrar durante o culto inteiro.
   *
   * @returns {boolean} escondeu agora
   */
  function esconderJanelaProjecao(win, motivo, extra) {
    if (!win || win.isDestroyed() || !win.isVisible()) return false;
    win.__lyraPrimeiroQuadro = true;
    try {
      win.hide();
    } catch (_) {
      return false;
    }
    diag('esconder', win, { motivo, ...(extra || {}) });
    return true;
  }

  /**
   * Mostra uma janela que JÁ EXISTE e está oculta — nunca antes do primeiro quadro.
   *
   * `jaPintouPrimeiroQuadro()` estava escrita e documentada («a cadeia de sincronização usa-a
   * para não mostrar cedo demais») e não era chamada em sítio nenhum. Havia quatro
   * `showInactive()` a mostrar janelas sem perguntar se o compositor já tinha pintado:
   * `sincronizarJanelasRelogio`, `sincronizarJanelaRole`, `sincronizarJanelasEscudo` e
   * `moverJanelaRoleEntreMonitores`. Um `ShowWindow` num HWND sem quadro composto é, no
   * Windows, exactamente o clarão branco que o comentário de `JS_FORCAR_QUADRO_PRETO`
   * descreve — e chega-se lá sempre que uma segunda sincronização apanha uma janela que a
   * primeira ainda está a carregar, que é o que acontece a cada troca de aba.
   *
   * Sem quadro, em vez de mostrar, entrega a janela ao caminho de revelação: ele mostra-a
   * quando o quadro chegar. Entretanto o monitor fica com o chão preto — preto a mais nunca
   * foi o defeito.
   *
   * @param {import('electron').BrowserWindow} win
   * @param {string} origem quem pediu; vai para o diário
   * @returns {boolean} a janela ficou visível agora
   */
  function mostrarJanelaProjecaoQuandoPronta(win, origem) {
    if (!win || win.isDestroyed()) return false;
    if (win.isVisible()) return true;
    if (!jaPintouPrimeiroQuadro(win)) {
      diag('mostrar-adiado', win, { origem });
      agendarRevelacaoTardia(win, origem);
      tentarRevelarJanelaProjecao(win);
      return !!win.isVisible();
    }
    diag('mostrar', win, { origem });
    mostrarJanelaProjecaoSemFoco(win);
    return !!win.isVisible();
  }

  /**
   * Rede de segurança do adiamento acima.
   *
   * Se `ready-to-show` nunca chegar — driver a engasgar, renderer preso numa fonte — a
   * janela ficaria oculta para sempre e o monitor mostraria só o chão preto. A meio de um
   * culto isso é pior do que um clarão. Passado o tecto, revela-se pelo caminho protegido:
   * `revelarJanelaProjecaoQuandoPreta` não depende de `ready-to-show`, e o JS + 2 rAF que
   * ela corre já provam, por si, que o renderer está vivo e a compor. A rede não
   * reintroduz o quadro branco.
   */
  function agendarRevelacaoTardia(win, origem) {
    if (!win || win.isDestroyed() || win.__lyraRevelacaoTardia) return;
    try {
      const t = setTimeout(() => {
        win.__lyraRevelacaoTardia = null;
        if (win.isDestroyed() || win.isVisible() || win.__lyraRevelada) return;
        diag('revelar-tardio', win, { origem, espera: TIMEOUT_REVELACAO_ADIADA_MS });
        revelarJanelaProjecaoQuandoPreta(win);
      }, TIMEOUT_REVELACAO_ADIADA_MS);
      if (typeof t.unref === 'function') t.unref();
      win.__lyraRevelacaoTardia = t;
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  function ouvirPrimeiroQuadroParaRevelar(win) {
    if (!win || win.isDestroyed() || win.__lyraReadyToShowBound) return;
    win.__lyraReadyToShowBound = true;
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      win.__lyraPrimeiroQuadro = true;
      diag('ready-to-show', win);
      tentarRevelarJanelaProjecao(win);
    });
  }

  /**
   * Garante topo absoluto e fundo nativo assim que a janela existe.
   *
   * **Não mostra a janela** e **não entra em fullscreen exclusivo** — ver
   * `opcoesBrowserWindowProjecao`. Quem mostra é `revelarJanelaProjecaoQuandoPreta`.
   */
  function finalizarJanelaProjecaoNativa(win, opts = {}) {
    if (!win || win.isDestroyed()) return;
    const backgroundColor = opts.backgroundColor || PRETO_NATIVO_PROJECAO;
    try { win.setBackgroundColor(backgroundColor); } catch (_) {
  // intencional — erro ignorado
}
    aplicarTopoAbsolutoProjecao(win);
    // Outro software topmost pode cobrir só um monitor; reclaim global (M2+M3).
    if (!win.__lyraTopoAbsolutoBlurBound) {
      win.__lyraTopoAbsolutoBlurBound = true;
      win.on('blur', () => {
        if (win.isDestroyed()) return;
        /* Sem `forcar`: o primeiro blur da sessão (diálogo da Bíblia, painel a
           recuperar o teclado) reemitia `setAlwaysOnTop` → `SetWindowPos` no HWND
           do projetor. O DWM ainda não tinha o quadro preto em cache — clarão
           branco só nessa primeira vez. `moveTop()` basta para reclamar a banda. */
        aplicarTopoAbsolutoProjecao(win);
        reafirmarTopoTodasJanelasProjecao();
        atualizarLoopTopoAbsolutoProjecao();
      });
    }
    ouvirPrimeiroQuadroParaRevelar(win);
    atualizarLoopTopoAbsolutoProjecao();
    anexarDiagnosticoViewport(win);
  }

  function finalizarJanelaRelogioNativa(win) {
    if (!win || win.isDestroyed()) return;
    try { win.setBackgroundColor(PRETO_NATIVO_PROJECAO); } catch (_) {
  // intencional — erro ignorado
}
    /* Relógio fica ATRÁS da projeção de propósito. Passa pela guarda para o nível ficar
       anotado — assim as resincronizações seguintes não reemitem o `SetWindowPos`. */
    definirNivelTopo(win, false);
    /* Sem `show()` aqui de propósito — a janela ainda não carregou nada. Ver
       `finalizarJanelaProjecaoNativa`. Quem mostra é `revelarJanelaProjecaoQuandoPreta`. */
    ouvirPrimeiroQuadroParaRevelar(win);
    anexarDiagnosticoViewport(win);
  }

  function enviarBootstrapJanelaPublica(win) {
    const forcarModo = displayConfigModo.inferirForcarModoJanelas(state);
    const cfg = displayConfigModo.resolverConfigParaJanelas(state, { forcarModo });
    /* Mesma razão do gémeo do ministrante: uma janela já marcada não estreia com conteúdo. */
    const payload = hayProjecaoAtivaPublica() && !estaSemExibicao(win)
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
    /* Janela nascida já em «Não exibir» (a persistente do ministrante é o caso comum) não
       pode estrear com conteúdo: o `did-finish-load` chega depois da cadeia ter marcado. */
    const payload = hayProjecaoAtivaMinistrante() && !estaSemExibicao(win)
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

  /**
   * Monitores que devem ter janela de relógio.
   *
   * **Derivado da rota, não de `loadDisplayIndices()`.** A versão anterior lia o ficheiro
   * de índices legado, que por omissão devolve `[1, 2]`. Com dois monitores (operador +
   * projetor) o índice 2 caía no filtro `i < displays.length`, sobrava `[1]`, e a linha
   * `ministranteIndex = fixos[1] ?? publicoIndex` colapsava o ministrante **no monitor do
   * público** — o projetor. Com os valores por omissão (`showClock: true`,
   * `monitorRelogio: 'ministrante'`) nascia então uma janela de relógio no M2, por baixo
   * do telão, que nunca chegava a ser revelada: `deveRevelarRelogioNoRole('publico')` é
   * falso quando o alvo é o ministrante. Uma janela invisível a mais a cobrir o projetor
   * e a disputar z-order com o telão a cada `moveTop()` do reclaim.
   *
   * Com a rota, num setup de dois monitores sem ministrante configurado o relógio
   * simplesmente não abre — que é o que já se via em ecrã.
   *
   * O relógio no monitor do público continua a existir quando é isso que a configuração
   * pede (`monitorRelogio: 'publico'` ou `'ambos'`): aí é intencional, e o telão esconde-se
   * para o revelar.
   *
   * @param {object} [routingDual] rota já carregada; omitida, lê-se do disco
   */
  function indicesMonitoresRelogioDesejados(routingDual) {
    const ck = resolverClockConfigPersistida();
    if (ck.showClock === false) return [];
    const alvo = String(ck.monitorRelogio || 'ministrante').toLowerCase();
    const displays = obterDisplaysOrdenados();
    const rota = routingDual || loadDisplayRouting();

    /* A rota manda quando diz alguma coisa. O ficheiro de índices legado continua a ser o
       recurso da primeira abertura, quando ainda não há nada roteado — tirá-lo deixava o
       relógio sem monitor nenhum em instalação nova. */
    const efetivos = resolverIndicesEfetivosProjecao(rota);
    const fixos = loadDisplayIndices()
      .filter((i) => i >= 0 && i < displays.length)
      .map((i) => indiceProjecaoSeguro(i, displays))
      .filter((i) => i >= 0);

    const publicoRoteado = efetivos.publicoIndex >= 0;
    const publicoIndex = publicoRoteado
      ? efetivos.publicoIndex
      : (fixos[0] != null ? fixos[0] : primeiroIndiceDeProjecao(displays));

    let ministranteIndex = resolverIndiceJanelaPersistenteMinistrante(rota);
    if (ministranteIndex < 0) {
      if (fixos[1] != null) ministranteIndex = fixos[1];
      /* Cair no monitor do público só é aceitável quando lá NÃO há telão — nesse caso o
         relógio é a única coisa naquele ecrã e é isso que se quer ver em repouso. Com o
         público roteado, um relógio ali nasceria por baixo de uma janela que nunca o
         revela (`deveRevelarRelogioNoRole('publico')` é falso quando o alvo é o
         ministrante): invisível para sempre, e mais uma superfície a cobrir o projetor e
         a disputar z-order com o telão a cada `moveTop()` do reclaim. Era o que a linha
         `ministranteIndex = fixos[1] ?? publicoIndex` fazia com dois monitores. */
      else if (!publicoRoteado) ministranteIndex = publicoIndex;
    }

    const desejados = new Set();
    if ((alvo === 'publico' || alvo === 'ambos') && publicoIndex >= 0) desejados.add(publicoIndex);
    if (
      (alvo === 'ministrante' || alvo === 'ambos') &&
      ministranteIndex >= 0 &&
      (!publicoRoteado || ministranteIndex !== efetivos.publicoIndex)
    ) {
      desejados.add(ministranteIndex);
    }
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
      fullscreen: false,
      fullscreenable: false,
      frame: false,
      thickFrame: false,
      resizable: false,
      alwaysOnTop: false,
      skipTaskbar: true,
      title: label,
      backgroundColor: PRETO_NATIVO_PROJECAO,
      ...(process.platform === 'win32' ? { backgroundMaterial: 'none' } : {}),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
        /* Sem `zoomFactor: scaleFactor`. A janela já nasce em DIP (`bounds`); aplicar o
           factor de escala outra vez duplicava o zoom em TVs 4K/42" com DPI ≠ 100%.
           O versículo encolhia no slider e voltava ao tamanho anterior no `setBounds`. */
        ...(bootstrap ? { additionalArguments: [bootstrap.arg] } : {}),
      },
    });
    marcarPapelDaJanela(win, 'relogio', displayIndex);
    diag('abrir', win, { pagina: 'display-clock.html', bootstrapArgv: !!bootstrap });
    finalizarJanelaRelogioNativa(win);
    /* Config completa entregue antes do primeiro paint: o `did-finish-load` abaixo vai
       deduplicar e não reenviar. Incompleta (bgImage cortada), fica sem assinatura para
       o envio por IPC acontecer. */
    if (bootstrap?.completo) win.__lyraClockCfgHash = bootstrap.assinatura;
    win.loadFile(resolverPaginaProjecao('display-clock.html'));
    win.setMenuBarVisibility(false);
    win.webContents.on('did-finish-load', () => {
      enviarDisplayConfigParaJanelasRelogio(win);
      marcarBootstrapPronto(win);
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
      fullscreen: false,
      fullscreenable: false,
      frame: false,
      thickFrame: false,
      resizable: false,
      alwaysOnTop: false,
      skipTaskbar: true,
      /* Nunca recebe foco: é chão, não é interface. Sem isto podia roubar o teclado ao
         painel do operador ao ser criada. */
      focusable: false,
      title: `Fundo (Monitor ${displayIndex + 1})`,
      backgroundColor: PRETO_NATIVO_PROJECAO,
      ...(process.platform === 'win32' ? { backgroundMaterial: 'none' } : {}),
      webPreferences: { backgroundThrottling: false },
    });
    marcarPapelDaJanela(win, ROLE_FUNDO, displayIndex);
    diag('abrir', win, { pagina: 'data:preto' });
    definirNivelTopo(win, false);
    /* Fundo não tem bootstrap IPC — o HTML já é preto. Só falta o quadro composto. */
    win.__lyraBootstrapOk = true;
    ouvirPrimeiroQuadroParaRevelar(win);
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
    indicesMonitoresRelogioDesejados(routingDual).forEach(juntar);
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
        diag('fechar', win, { motivo: 'monitor-fora-da-gestao' });
        try { win.close(); } catch (_) {
  // intencional — erro ignorado
}
        return;
      }
      const d = displays[entry.index];
      /* Só quando o monitor mudou mesmo de sítio/resolução. O fundo é a última coisa que
         se quer a mexer: ele é que está a tapar o buraco. */
      cobrirBoundsDoDisplay(win, d.bounds);
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
   * Folga de `TOLERANCIA_BOUNDS_PX` porque o Windows reporta 1 px de diferença em DPI
   * / ecrã secundário; sem isso o motor «corrigia» para sempre e o projetor piscava.
   */
  function boundsIguais(win, bounds) {
    try {
      const b = win.getBounds();
      if (!b) return false;
      const t = TOLERANCIA_BOUNDS_PX;
      return (
        Math.abs(b.x - bounds.x) <= t &&
        Math.abs(b.y - bounds.y) <= t &&
        Math.abs(b.width - bounds.width) <= t &&
        Math.abs(b.height - bounds.height) <= t
      );
    } catch (_) {
      return false;
    }
  }

  /**
   * Assenta a janela no rectângulo do monitor **sem** entrar em fullscreen exclusivo.
   * Sem mudança de bounds não há chamada nativa nenhuma.
   *
   * @returns {boolean} houve `setBounds`
   */
  function cobrirBoundsDoDisplay(win, bounds) {
    if (!win || win.isDestroyed() || !bounds) return false;
    if (boundsIguais(win, bounds)) return false;
    try {
      let de = null;
      try { de = win.getBounds(); } catch (_) { /* intencional */ }
      win.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
      diag('mover', win, { de });
      return true;
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
   * Ordem: `setBounds` (só se mudou) → topo. O `show()` fica de fora de propósito.
   * Sem fullscreen exclusivo — ver `opcoesBrowserWindowProjecao`.
   *
   * @param {import('electron').BrowserWindow} win janela OCULTA
   * @param {object} d entrada de `getOrderedDisplays`
   */
  function assentarJanelaOcultaNoDisplay(win, d) {
    if (!win || win.isDestroyed() || !d) return;
    try {
      cobrirBoundsDoDisplay(win, d.bounds);
      aplicarTopoAbsolutoProjecao(win);
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  /**
   * Traz uma janela visível de volta para cima do monitor a que pertence.
   *
   * Sem sair/entrar de fullscreen: a janela já cobre o ecrã por bounds. Só `setBounds`.
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
      cobrirBoundsDoDisplay(win, d.bounds);
      aplicarTopoAbsolutoProjecao(win);
      entry.index = displayIndex;
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  /**
   * @param {object} [routingDual] rota já carregada — evita reler o ficheiro por tick de
   *   slider, já que esta função corre a cada `preview_display_config`.
   */
  function sincronizarJanelasRelogio(routingDual) {
    const desejados = new Set(indicesMonitoresRelogioDesejados(routingDual));
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
        diag('fechar', win, { motivo: 'monitor-sem-relogio' });
        try { win.close(); } catch (_) {
  // intencional — erro ignorado
}
        return;
      }
      const d = displays[entry.index];
      try {
        /* Só reposiciona quando o monitor mudou de sítio/resolução. Sem fullscreen
           exclusivo não há handshake HDMI a cada tick de slider. */
        cobrirBoundsDoDisplay(win, d.bounds);
        /* Guardado: sem isto era um `SetWindowPos(HWND_NOTOPMOST)` por tick de slider,
           numa janela que já está em `false` desde `finalizarJanelaRelogioNativa`. */
        if (definirNivelTopo(win, false)) {
          /* Se isto disparar, alguém promoveu o relógio à banda topmost — era o defeito
             que `aplicarTopoAbsolutoProjecao` passou a impedir. Fica registado para o caso
             de reaparecer por outro caminho. */
          diag('topo-rebaixado', win, { origem: 'sincronizarJanelasRelogio' });
        }
        if (!win.isVisible()) mostrarJanelaProjecaoQuandoPronta(win, 'sincronizarJanelasRelogio');
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
          /* Sem `zoomFactor: scaleFactor` — a janela já nasce em DIP (`d.bounds`).
             Aplicar a escala outra vez duplicava o zoom (ver relógio / M3). */
        }),
        show: false,
        transparent: false,
        backgroundColor: PRETO_NATIVO_PROJECAO,
      }
    );
    marcarPapelDaJanela(win, 'publico', displayIndex);
    diag('abrir', win, { pagina: 'display.html' });
    finalizarJanelaProjecaoNativa(win, { backgroundColor: PRETO_NATIVO_PROJECAO });

    win.loadFile(resolverPaginaProjecao('display.html'));
    win.setMenuBarVisibility(false);

    win.webContents.on('did-finish-load', () => {
      enviarBootstrapJanelaPublica(win);
      marcarBootstrapPronto(win);
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
        /* Sem `zoomFactor: scaleFactor` — mesma regra do telão e do relógio. */
      })
    );
    marcarPapelDaJanela(win, 'escudo', displayIndex);
    diag('abrir', win, { pagina: 'display.html' });
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
      marcarBootstrapPronto(win);
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
    marcarPapelDaJanela(win, 'ministrante', displayIndex);
    diag('abrir', win, { pagina: 'display-operator.html' });
    finalizarJanelaProjecaoNativa(win, { backgroundColor: PRETO_NATIVO_PROJECAO });

    win.loadFile(resolverPaginaProjecao('display-operator.html'));
    win.setMenuBarVisibility(false);

    win.webContents.on('did-finish-load', () => {
      enviarBootstrapJanelaMinistrante(win);
      marcarBootstrapPronto(win);
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
    const publicoPedido = publicoIndex;
    const ministrantePedido = ministranteIndex;
    publicoIndex = indiceProjecaoSeguro(publicoIndex, displays);
    ministranteIndex = indiceProjecaoSeguro(ministranteIndex, displays);

    /*
     * A guarda anulou um índice que a rota pedia — não é o mesmo que o operador ter
     * desligado a projeção, e quem confunde as duas coisas desmonta as janelas por engano.
     *
     * O caso real: ao ligar um projetor, o Windows promove-o a monitor principal por
     * instantes enquanto reconfigura o arranjo. Nesse intervalo `indiceProjecaoSeguro`
     * devolve -1 para o índice do público (é «o monitor do operador»), a rota parece
     * vazia, e o motor fecha/apaga as telas. No evento seguinte o projetor já não é
     * principal e elas reabrem: o abre-fecha-abre que se via no M2.
     *
     * Quem lê este campo trata o estado como transitório e espera o próximo evento de
     * ecrã, em vez de desmontar. Nada é aberto enquanto ele estiver `true` — a guarda
     * continua a impedir projeção no ecrã do operador; o que muda é só não destruir o
     * que já está no ar.
     */
    const suprimidoPelaGuarda =
      (publicoPedido >= 0 && publicoIndex < 0) ||
      (ministrantePedido >= 0 && ministranteIndex < 0);

    return { publicoIndex, ministranteIndex, displays, suprimidoPelaGuarda };
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
    indicesMonitoresRelogioDesejados(routingDual).forEach((idx) => {
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
        diag('fechar', antiga, { motivo: 'substituida-na-troca', para: displayIndex });
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

    novoWin.once('show', aplicarTroca);
    novoWin.once('ready-to-show', aplicarTroca);
    novoWin.webContents.once('did-finish-load', () => {
      try {
        /* Fullscreen exclusivo NÃO — ver `opcoesBrowserWindowProjecao`. Só topo.
           Quem mostra é `revelarJanelaProjecaoQuandoPreta` — mostrar aqui ainda
           revela o primeiro HWND branco. */
        finalizarJanelaProjecaoNativa(novoWin);
        marcarBootstrapPronto(novoWin);
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
        diag('fechar', entry.win, { motivo: 'papel-desativado' });
        try { entry.win.close(); } catch (_) {
  // intencional — erro ignorado
}
      } else {
        restantes.push(entry);
      }
    });
    registro.substituirPor(restantes);
  }

  /** Aguarda janela visível no monitor antes de abrir a seguinte. */
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
    win.once('show', finalizar);
    win.once('ready-to-show', finalizar);
    win.webContents.once('did-finish-load', () => {
      try {
        /* Topo primeiro; quem mostra é `revelarJanelaProjecaoQuandoPreta`.
           O `show()` respeita quem escondeu a janela de propósito: na primeira passagem a
           marca está limpa e nada muda; é no disparo tardio, já depois de a cadeia ter
           escondido a janela, que ela evita a regressão. */
        finalizarJanelaProjecaoNativa(win);
        marcarBootstrapPronto(win);
      } catch (_) {
  // intencional — erro ignorado
}
      finalizar();
    });
  }

  /**
   * Move uma janela já existente para outro monitor sem a destruir.
   *
   * Ordem: ocultar → assentar nos bounds → mostrar. O fundo preto
   * cobre o desktop durante o salto; `substituirJanelaNoMonitor` ficava a carregar HTML
   * de novo e piscava em branco.
   *
   * Não se trocam janelas entre público e ministrante: cada papel carrega uma página
   * diferente (`display.html` vs `display-operator.html`). Trocar as BrowserWindow no
   * registo deixava a Contagem no M3 a falar com a página do operador — tela preta.
   *
   * @returns {boolean} true se a janela ficou no destino
   */
  function moverJanelaRoleEntreMonitores(entrada, displayIndex, opts = {}) {
    const displays = obterDisplaysOrdenados();
    const d = displays[displayIndex];
    const win = entrada?.win;
    if (!d || !win || win.isDestroyed()) return false;
    const mostrar = opts.mostrar !== false;
    try {
      cancelarTrocaPendente(entrada);
      esconderJanelaProjecao(win, 'mover-de-monitor', { para: displayIndex });
      entrada.ocultoParaRelogio = false;
      marcarOcultoParaRelogio(win, false);
      assentarJanelaOcultaNoDisplay(win, d);
      entrada.index = displayIndex;
      if (mostrar) mostrarJanelaProjecaoQuandoPronta(win, 'moverJanelaRoleEntreMonitores');
      return true;
    } catch (_) {
      return false;
    }
  }

  function sincronizarJanelaRole(role, displayIndex, abrirFn, labelFn, next) {
    const entradas = obterEntradasPorRole(role);

    if (displayIndex < 0) {
      /*
       * «Não exibir»: a janela FICA, no monitor dela, visível e preta.
       *
       * Não se fecha (perdia-se o HTML já carregado) e — desde a correcção do projetor —
       * também não se esconde. Esconder revelava o chão preto por baixo: visualmente igual,
       * mas cada troca de modo custava um esconder/mostrar no monitor, e é esse vaivém que
       * põe o Windows a renegociar a saída de vídeo. O payload ocioso já pinta preto; a
       * marca `semExibicao` é o que diz ao resto do motor que esta janela está preta por
       * instrução, e não por ainda não ter conteúdo.
       */
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
          entry.semExibicao = true;
          marcarSemExibicao(entry.win, true);
          /* Continua a defender o sítio dela: sem isto uma janela preta deixada para trás
             podia ficar onde o Windows a atirasse depois de um monitor sair. */
          try {
            if (
              entry.win.isVisible() &&
              !janelaCobreODisplay(entry, entry.index, obterDisplaysOrdenados())
            ) {
              reposicionarJanelaNoMonitor(entry, entry.index);
            }
          } catch (_) {
  // intencional — erro ignorado
}
        }
      });
      if (typeof next === 'function') next();
      return;
    }

    /* A rota voltou a querer conteúdo neste canal — a marca de «Não exibir» sai antes de
       qualquer decisão sobre mostrar/mover, senão as guardas abaixo tratavam a janela
       como preta por instrução e nunca lhe devolviam o conteúdo. */
    entradas.forEach((entry) => {
      entry.semExibicao = false;
      marcarSemExibicao(entry?.win, false);
    });

    const principal = entradas[0] || null;
    entradas.slice(1).forEach((extra) => {
      if (extra?.win && !extra.win.isDestroyed()) {
        diag('fechar', extra.win, { motivo: 'duplicada-no-papel' });
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
            mostrarJanelaProjecaoQuandoPronta(principal.win, 'sincronizarJanelaRole');
            principal.index = displayIndex;
          } catch (_) {
  // intencional — erro ignorado
}
        }
      } else if (principal.index !== displayIndex) {
        const idxOrigem = principal.index;
        /* Destino ocupado por outro papel: estacionar o ocupante no monitor de origem
           (oculto) e só depois trazer a janela deste papel — mantém o HTML certo em
           cada role (Contagem no M3 precisa de `display.html`, não da página do operador). */
        const ocupante = registro.todas().find(
          (e) =>
            e &&
            e !== principal &&
            (e.role === 'publico' || e.role === 'ministrante') &&
            e.win &&
            !e.win.isDestroyed() &&
            e.index === displayIndex
        );
        if (ocupante) {
          moverJanelaRoleEntreMonitores(ocupante, idxOrigem, { mostrar: false });
        }
        if (moverJanelaRoleEntreMonitores(principal, displayIndex)) {
          if (typeof next === 'function') next();
          return;
        }
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
            // hide() direto — não mexer nos bounds enquanto visível (evita flash do desktop)
            esconderJanelaProjecao(entry.win, 'escudo-fora-da-rota');
          } else if (
            entry.win.isVisible() &&
            !janelaCobreODisplay(entry, entry.index, obterDisplaysOrdenados())
          ) {
            /* Escudo arrastado pelo Windows depois de um monitor sair. Um rectângulo preto
               fullscreen por cima do painel é tão incapacitante como a letra do hino. */
            reposicionarJanelaNoMonitor(entry, entry.index);
          } else if (!entry.win.isVisible()) {
            // Escudo estava oculto — reposicionar e mostrar no mesmo monitor
            const displays = obterDisplaysOrdenados();
            const d = displays[entry.index];
            try {
              /* Mesma razão do `sincronizarJanelaRole`: mostrar de propósito revoga a
                 ocultação anterior, e as duas marcas têm de acompanhar. */
              entry.ocultoParaRelogio = false;
              marcarOcultoParaRelogio(entry.win, false);
              assentarJanelaOcultaNoDisplay(entry.win, d);
              mostrarJanelaProjecaoQuandoPronta(entry.win, 'sincronizarJanelasEscudo');
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
    diagGeral('sync-fim', { janelas: registro.tamanho(), reagendar: !!syncTelasReagendar });
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
      /* Reentrância: a cadeia anterior ainda não acabou. É o sinal de que dois pedidos
         chegaram quase juntos — troca de aba em cima de um comando, por exemplo. */
      diagGeral('sync-adiado', { pendentes: syncTelasCallbacksPendentes.length });
      syncTelasReagendar = true;
      if (typeof onComplete === 'function') syncTelasCallbacksPendentes.push(onComplete);
      return;
    }

    syncTelasEmAndamento = true;

    /* PRIMEIRO passo, sempre: o chão tem de existir antes de qualquer etapa que possa
       descobrir um monitor — esconder o telão, fechar o relógio, mover uma janela. */
    sincronizarJanelasFundo(routingDual);

    const {
      publicoIndex,
      ministranteIndex: ministranteConteudo,
      suprimidoPelaGuarda,
    } = resolverIndicesEfetivosProjecao(routingDual);
    const ministranteIndex = resolverIndiceJanelaPersistenteMinistrante(routingDual);
    const escudos = indicesMonitoresEscudoPreto(routingDual);

    diagGeral('sync-inicio', {
      pub: publicoIndex,
      min: ministranteIndex,
      minConteudo: ministranteConteudo,
      escudos,
      monitores: obterDisplaysOrdenados().length,
      suprimido: !!suprimidoPelaGuarda,
      janelas: registro.tamanho(),
      rapidas: garantirRapidas,
    });
    garantirRapidas = 0;

    if (publicoIndex < 0 && ministranteIndex < 0 && escudos.length === 0) {
      /* Ver o ramo gémeo em `garantirTelasAbertasParaProjecao`: supressão pela guarda é
         estado transitório do arranjo de ecrãs, não ordem de desmontar. */
      if (suprimidoPelaGuarda) {
        finalizarSincronizacaoTelas(onComplete);
        return;
      }
      fecharJanelasPorRole('relogio');
      if (controladorAtivo()) {
        /* O chão fica: há operador, e o que ele vê nos monitores tem de continuar preto. */
        marcarCanaisSemExibicao({ publico: true, ministrante: true });
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
              /*
               * Última etapa antes do `onComplete`, e tem de ser aqui.
               *
               * `sincronizarJanelaRole` limpa a marca sempre que o índice é >= 0 — e o do
               * ministrante é >= 0 mesmo em «Não exibir», porque a janela persistente vive
               * no monitor de recurso. Repor a marca no fim da cadeia é o que impede o
               * `onComplete` (que chama `atualizarDisplayMinistrante`) de lhe mandar a
               * estrofe. Era este o buraco entre a prévia e o monitor físico.
               */
              marcarCanaisSemExibicao({
                publico: publicoIndex < 0,
                ministrante: ministranteConteudo < 0,
              });
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
    const { publicoIndex: pub, ministranteIndex: minConteudo } =
      resolverIndicesEfetivosProjecao(routingDual);
    /*
     * Duas perguntas diferentes sobre o ministrante, e confundi-las era o defeito:
     *
     * - `min` — ONDE a janela vive. Com a rota em «Não exibir», o motor mantém na mesma uma
     *   janela no monitor de recurso, para activar o ministrante mais tarde não custar uma
     *   janela a nascer à vista (ver `resolverIndiceJanelaPersistenteMinistrante`).
     * - `minConteudo` — SE essa janela leva conteúdo. Vem da rota, e é -1 em «Não exibir».
     *
     * Como só existia `min`, um «Não exibir» no ministrante virava o índice de recurso e a
     * janela persistente passava a ser tratada como canal activo: a prévia do painel
     * escondia o ministrante (ela olha para a rota) e o monitor físico continuava a mostrar
     * a estrofe. Painel e telão a discordar, que é exactamente o que o operador via.
     */
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
     * mostrava a janela do ministrante e a escondia logo a seguir — o monitor a piscar.
     */
    const cumpreRota = (e) =>
      e?.win && !e.win.isDestroyed() && (e.win.isVisible() || ocultoParaRelogio(e.win));

    /*
     * A marca de «Não exibir» está como a rota pede?
     *
     * É um teste de ESTADO, não de posição: uma janela no sítio certo mas com a marca
     * errada mostra o que não devia (ou está preta quando já devia ter voltado). Nos dois
     * casos há trabalho a fazer, e é o resync que o faz. Sem isto, ligar «Não exibir»
     * deixava a rota por cumprida (a janela continua visível, no mesmo índice) e a marca
     * nunca chegava a ser aplicada.
     */
    const marcaCoerente = (e, semExibicaoDesejada) =>
      estaSemExibicao(e?.win) === !!semExibicaoDesejada;

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
      /* «Não exibir»: as janelas ficam onde estão — exige-se só que estejam pretas. */
      if (pubWins.some((e) => !estaSemExibicao(e.win))) return false;
    } else if (
      pubWins.length !== 1 ||
      !noIndicePedido(pubWins[0], pub) ||
      !marcaCoerente(pubWins[0], false) ||
      (!trocaEmCursoPara(pubWins[0], pub) && !janelaCobreODisplay(pubWins[0], pub, displaysAgora))
    ) {
      return false;
    }
    if (min < 0) {
      if (minWins.some((e) => !estaSemExibicao(e.win))) return false;
    } else if (
      minWins.length !== 1 ||
      !noIndicePedido(minWins[0], min) ||
      /* A janela persistente fica no sítio dela, mas preta enquanto a rota disser
         «Não exibir». É este teste que faz o telão do ministrante seguir o painel. */
      !marcaCoerente(minWins[0], minConteudo < 0) ||
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

    const {
      publicoIndex: pub,
      ministranteIndex: minConteudo,
      suprimidoPelaGuarda,
    } = resolverIndicesEfetivosProjecao(routingDual);
    /* `min` é onde a janela do ministrante vive; `minConteudo` é se ela leva conteúdo.
       Ver `telasAbertasCorrespondemRota`. */
    const min = resolverIndiceJanelaPersistenteMinistrante(routingDual);

    const escudos = indicesMonitoresEscudoPreto(routingDual);
    if (pub < 0 && min < 0 && escudos.length === 0) {
      /* Rota vazia porque o Windows chamou principal ao projetor durante o handshake, e
         não porque o operador desligou a projeção. Manter o que está no ar e esperar o
         próximo evento de ecrã. Ver `suprimidoPelaGuarda`. */
      if (suprimidoPelaGuarda) return;
      fecharJanelasPorRole('relogio');
      if (controladorAtivo()) {
        /* «Não exibir» nos dois canais: as janelas ficam onde estão, pretas. O monitor
           continua ocupado e não há nada a redetectar. */
        marcarCanaisSemExibicao({ publico: true, ministrante: true });
        aplicarPretoInativoNasJanelasAbertas();
        return;
      }
      fecharTodasJanelasProjecao();
      return;
    }
    if (telasAbertasCorrespondemRota(routingDual)) {
      /* Caminho rápido: só conta. Ver `garantirRapidas`. */
      garantirRapidas += 1;
      /* Antes de qualquer envio: as janelas que a rota deixou em «Não exibir» têm de estar
         marcadas, senão os `atualizar*` logo abaixo mandam-lhes conteúdo. */
      marcarCanaisSemExibicao({ publico: pub < 0, ministrante: minConteudo < 0 });
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
    diagGeral('garantir-resync', { pub, min, minConteudo, escudos: escudos.length });
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
