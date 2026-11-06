'use strict';

/**
 * Integração Electron da credencial interna do painel (E1.3 Fase B — arquitetura W).
 *
 * Liga as peças puras de `@lyra/projection-core` (`credencialInterna`) ao Electron:
 *
 *  1. `criarIntegracao` gera a credencial (só na memória do processo principal) e instala UM
 *     `session.webRequest.onBeforeSendHeaders` que a injeta conforme `decidirInjecao`. Qualquer
 *     erro na decisão vira «não injetar»: a falha nunca amplia o alcance da credencial.
 *  2. `autorizarJanela` registra o `webContents` de uma janela (painel ou Histórico), instala as
 *     guardas de navegação/`window.open`/DevTools e remove o registro quando a janela fecha ou é
 *     substituída.
 *
 * Telões, janelas de projeção, janelas abertas por `window.open` e qualquer outro renderer NÃO
 * são registrados e, portanto, nunca recebem a credencial.
 *
 * O segredo não é exportado: quem precisa conferi-lo (os verificadores HTTP da 3001 e da 5510
 * local, no mesmo processo) recebe o objeto `interna` e só tem `conferir`/`ehDeviceInterno`.
 */

const {
  criarCredencialInterna,
  criarRegistroJanelas,
  decidirInjecao,
  CONFIG_PADRAO,
} = require('@lyra/projection-core').credencialInterna;
const janelaSegura = require('./janelaSegura');

/**
 * @param {object} deps
 * @param {{webRequest: {onBeforeSendHeaders: Function}}} deps.session
 * @param {{isPackaged?: boolean}} deps.app
 * @param {{openExternal?: (url: string) => Promise<void>}} [deps.shell]
 * @param {() => Promise<boolean>} [deps.provarMotorLocal] prova de que o dono da porta do motor local (5510)
 *        é o servidor que ESTE processo iniciou. Ausente → a 5510 nunca recebe a credencial.
 * @param {object} [deps.config] sobrescreve origem/portas/hosts (testes usam portas isoladas)
 * @param {(msg: string) => void} [deps.log] recebe SÓ mensagens sem segredo
 */
function criarIntegracao({ session, app, shell, config, log, provarMotorLocal }) {
  const cfg = { ...CONFIG_PADRAO, ...(config || {}) };
  const interna = criarCredencialInterna();
  const registro = criarRegistroJanelas();
  const devToolsLiberadas = janelaSegura.devToolsPermitido(app);
  const aviso = typeof log === 'function' ? log : () => {};

  session.webRequest.onBeforeSendHeaders({ urls: ['http://*/*'] }, (detalhes, callback) => {
    const original = detalhes.requestHeaders;
    let decisao = '';
    try {
      decisao = decidirInjecao(detalhes, { ...cfg, registro });
    } catch (_) {
      aviso('[Lyra][credencial-interna] falha ao decidir a injeção; requisição segue sem credencial interna');
    }
    if (decisao === 'injetar') {
      callback({ requestHeaders: interna.aplicarAosCabecalhos(original) });
      return;
    }
    if (decisao === 'verificar-motor-local') {
      /* 5510: injeta só se o dono da porta é o motor local DESTE processo (falha fechada). Sem a
         prova, os cabeçalhos do renderer seguem intactos, como se esta integração não existisse. */
      Promise.resolve()
        .then(() => (typeof provarMotorLocal === 'function' ? provarMotorLocal() : false))
        .then((ok) => ok === true)
        .catch(() => false)
        .then((ok) => callback({ requestHeaders: ok ? interna.aplicarAosCabecalhos(original) : original }));
      return;
    }
    callback({ requestHeaders: original });
  });

  function abrirExterno(url) {
    if (shell && typeof shell.openExternal === 'function') {
      Promise.resolve(shell.openExternal(url)).catch(() => {});
    }
  }

  /**
   * @param {object} win BrowserWindow
   * @param {{papel: string, pagina: '/controller.html'|'/historico.html'}} p
   * @returns {number} id do webContents autorizado
   */
  function autorizarJanela(win, { papel, pagina }) {
    const id = registro.autorizar(win, { papel, pagina });
    janelaSegura.instalarGuardas(win, {
      origem: cfg.origemPainel,
      pagina,
      devToolsPermitido: devToolsLiberadas,
      abrirExterno,
    });
    return id;
  }

  return {
    interna,
    registro,
    autorizarJanela,
    devToolsPermitido: devToolsLiberadas,
    webPreferences: (base) => janelaSegura.opcoesWebPreferences(base, devToolsLiberadas),
  };
}

/* Instância do app (uma por processo principal). */
let instancia = null;

/** Chamada uma vez em `app.whenReady()`, antes de subir servidores e criar janelas. */
function iniciar(deps) {
  if (!instancia) instancia = criarIntegracao(deps);
  return instancia;
}

/** @returns {ReturnType<typeof criarIntegracao>|null} */
function obter() {
  return instancia;
}

/**
 * DevTools liberadas nas janelas autorizadas? Antes de `iniciar` (ou fora do app) é `false`:
 * na dúvida, bloqueia.
 */
function devToolsLiberadas() {
  return instancia ? instancia.devToolsPermitido : false;
}

/** `webPreferences` da janela autorizada, com `devTools` conforme o ambiente. */
function webPreferencesAutorizada(base) {
  return janelaSegura.opcoesWebPreferences(base, devToolsLiberadas());
}

/** Autoriza a janela se a integração já foi iniciada; do contrário não faz nada. */
function autorizarJanela(win, opcoes) {
  return instancia ? instancia.autorizarJanela(win, opcoes) : null;
}

module.exports = {
  criarIntegracao,
  iniciar,
  obter,
  autorizarJanela,
  devToolsLiberadas,
  webPreferencesAutorizada,
};
