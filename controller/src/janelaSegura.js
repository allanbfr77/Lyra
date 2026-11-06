'use strict';

/**
 * Guardas das janelas que recebem a credencial interna (E1.3 Fase B, arquitetura W).
 *
 * Só o painel (`/controller.html`) e o Histórico (`/historico.html`) são autorizados. Estas
 * guardas impedem que uma delas "vire" outra coisa e herde a credencial:
 *
 *  - `will-navigate` / `will-redirect`: a janela só pode ficar na SUA página exata;
 *  - `setWindowOpenHandler`: nenhuma janela filha (ela teria outro `webContents`, que a política
 *    não autoriza de qualquer forma); só `http(s)` vai ao navegador do sistema;
 *  - DevTools: em produção ficam desligadas (`webPreferences.devTools: false`), com atalhos e menu
 *    bloqueados e, por garantia, fechadas se abrirem. A limitação é conhecida: as DevTools da
 *    janela autorizada mostram o cabeçalho injetado. Isto NÃO protege contra quem tem acesso
 *    administrativo ou físico à máquina (pode anexar um depurador ao processo).
 *
 * Sem dependência do Electron: recebe a janela e as funções por parâmetro (testável em Node).
 */

/**
 * @param {{isPackaged?: boolean}|null} app
 * @returns {boolean} DevTools permitidas? Só em desenvolvimento (app não empacotado).
 */
function devToolsPermitido(app) {
  return !!app && app.isPackaged === false;
}

/** Cópia de `webPreferences` com `devTools` definido. Não muta a entrada. */
function opcoesWebPreferences(base, permitido) {
  return { ...base, devTools: !!permitido };
}

/** Atalhos que abrem as DevTools (Windows/Linux/macOS). Outros atalhos do painel ficam intactos. */
function ehAtalhoDevTools(input) {
  if (!input || typeof input !== 'object') return false;
  const key = String(input.key || '').toLowerCase();
  if (key === 'f12') return true;
  if ((input.control || input.meta) && input.shift && (key === 'i' || key === 'j' || key === 'c')) return true;
  if ((input.control || input.meta) && input.alt && key === 'i') return true;
  return false;
}

/**
 * @param {string} urlAlvo
 * @param {{origem: string, pagina: string}} cfg
 */
function navegacaoPermitida(urlAlvo, cfg) {
  let u;
  try {
    u = new URL(String(urlAlvo));
  } catch (_) {
    return false;
  }
  return u.origin === cfg.origem && u.pathname === cfg.pagina;
}

/** `http(s)` para fora da máquina — o único tipo de link que sai para o navegador do sistema. */
function ehHttpExterno(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  } catch (_) {
    return false;
  }
}

/**
 * @param {object} win BrowserWindow (ou equivalente)
 * @param {object} cfg
 * @param {string} cfg.origem origem do painel (ex.: http://127.0.0.1:3001)
 * @param {string} cfg.pagina caminho exato da página desta janela
 * @param {boolean} cfg.devToolsPermitido
 * @param {(url: string) => void} [cfg.abrirExterno] abre `http(s)` no navegador do sistema
 */
function instalarGuardas(win, cfg) {
  const wc = win.webContents;
  const abrirExterno = typeof cfg.abrirExterno === 'function' ? cfg.abrirExterno : () => {};

  const barrarNavegacao = (evento, url) => {
    if (!navegacaoPermitida(url, cfg)) evento.preventDefault();
  };
  wc.on('will-navigate', barrarNavegacao);
  wc.on('will-redirect', barrarNavegacao);

  wc.setWindowOpenHandler(({ url }) => {
    if (ehHttpExterno(url)) {
      try {
        abrirExterno(String(url));
      } catch (_) {
        /* sem navegador externo: apenas nega */
      }
    }
    return { action: 'deny' };
  });

  if (!cfg.devToolsPermitido) {
    wc.on('before-input-event', (evento, input) => {
      if (ehAtalhoDevTools(input)) evento.preventDefault();
    });
    wc.on('devtools-opened', () => {
      try {
        wc.closeDevTools();
      } catch (_) {
        /* janela já destruída */
      }
    });
  }
}

module.exports = {
  devToolsPermitido,
  opcoesWebPreferences,
  ehAtalhoDevTools,
  navegacaoPermitida,
  instalarGuardas,
};
