'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Ponte da janela «Histórico e relatórios».
 *
 * Preload próprio, e não o do painel: aquele expõe dezenas de canais de projeção que esta
 * janela não tem nada que alcançar. Uma janela que só lê relatórios não precisa de poder
 * mexer no telão, e a superfície mais pequena é a que não se engana.
 *
 * Os dados do histórico não passam por aqui — a janela vai buscá-los por HTTP à API do
 * controlador, como o painel faz. A ponte serve só o que o `fetch` não alcança: gravar um
 * ficheiro, pedir uma confirmação nativa e fechar a janela.
 */
contextBridge.exposeInMainWorld('lyraHistorico', {
  /**
   * @param {{vista: string, periodo: string, linhas: object[]}} pedido
   * @returns {Promise<{caminho?: string, cancelado?: boolean, erro?: string}>}
   */
  exportarCsv: (pedido) => ipcRenderer.invoke('historico:exportar-csv', pedido),

  /**
   * Confirmação nativa.
   *
   * `confirm()` do browser não serve: numa janela sem barra, o diálogo do Chromium aparece
   * colado ao topo e sem o ícone da aplicação — parece um alerta de página web, e o que se
   * está a perguntar é se se apagam anos de histórico.
   *
   * @param {{titulo: string, mensagem: string, detalhe?: string, confirmar?: string,
   *          perigo?: boolean}} opts
   * @returns {Promise<boolean>}
   */
  confirmar: (opts) => ipcRenderer.invoke('historico:confirmar', opts),

  fechar: () => ipcRenderer.send('historico:fechar'),
});
