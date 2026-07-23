/**
 * preload.js — Bridge IPC entre o processo Renderer e o Main do Electron.
 *
 * Este arquivo é executado no contexto isolado do preload (contextIsolation: true).
 * Ele usa contextBridge para expor seletivamente funções seguras ao mundo da página,
 * sem vazar o objeto completo do ipcRenderer para o renderer.
 *
 * Todas as funções ficam acessíveis via `window.lyraElectron` no renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expõe a API segura do Electron para o renderer sob o namespace `lyraElectron`
contextBridge.exposeInMainWorld('lyraElectron', {

  /**
   * Solicita ao processo main que recarregue a janela do controller.
   * Envia o evento IPC 'controller-recarregar' sem aguardar resposta.
   */
  reloadController: () => {
    ipcRenderer.send('controller-recarregar');
  },

  /**
   * Registra um callback para o evento de abertura do DevTools da janela de display.
   * Retorna uma função de cleanup que remove o listener ao ser chamada.
   *
   * @param {Function} cb - Callback executado quando o evento é recebido.
   * @returns {Function} Função para remover o listener registrado.
   */
  /** Abre DevTools do telão via processo main (socket/HTTP → servidor 5510). */
  abrirConsoleTelao: () => ipcRenderer.invoke('lyra-open-display-devtools'),
  limparCacheElectron: () => ipcRenderer.invoke('lyra-clear-cache'),
  reiniciarServidorLocal: () => ipcRenderer.invoke('lyra-restart-local-server'),
  obterVersaoApp: () => ipcRenderer.invoke('lyra-app-version'),

  onMenuCommand: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('lyra-menu-command', handler);
    return () => ipcRenderer.removeListener('lyra-menu-command', handler);
  },

  onStatusReinicioServidor: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('lyra-server-restart-status', handler);
    return () => ipcRenderer.removeListener('lyra-server-restart-status', handler);
  },

  onOpenDisplayDevtoolsRequest: (cb) => {
    ipcRenderer.on('open-display-devtools-request', cb);
    // Retorna função de cleanup para evitar memory leaks
    return () => ipcRenderer.removeListener('open-display-devtools-request', cb);
  },

  /**
   * Registra um callback para o evento de repintura do controller.
   * Útil para forçar re-render da interface após mudanças no processo main.
   * Retorna uma função de cleanup que remove o listener ao ser chamada.
   *
   * @param {Function} cb - Callback executado quando o evento é recebido.
   * @returns {Function} Função para remover o listener registrado.
   */
  onControllerRepaintRequest: (cb) => {
    ipcRenderer.on('controller-repaint-request', cb);
    // Retorna função de cleanup para evitar memory leaks
    return () => ipcRenderer.removeListener('controller-repaint-request', cb);
  },

  /**
   * Músicas sincronizadas do telemóvel (HTTP :3001) — atualiza playlists no painel.
   *
   * @param {Function} cb - (payload: { musicas: Array }) => void
   * @returns {Function} cleanup
   */
  onMusicasSincronizadas: (cb) => {
    ipcRenderer.on('musicas-sincronizadas', (_ev, payload) => cb(payload));
    return () => ipcRenderer.removeAllListeners('musicas-sincronizadas');
  },

  onBancoCompartilhadoAlterado: (cb) => {
    const handler = (_ev, payload) => cb(payload);
    ipcRenderer.on('shared-banco-alterado', handler);
    return () => ipcRenderer.removeListener('shared-banco-alterado', handler);
  },

  onBancoCompartilhadoAplicado: (cb) => {
    const handler = (_ev, payload) => cb(payload);
    ipcRenderer.on('shared-banco-aplicado', handler);
    return () => ipcRenderer.removeListener('shared-banco-aplicado', handler);
  },

  /** Reconhecimento de voz offline (Vosk WASM) — URL do modelo pt-BR. */
  vozSlides: {
    obterUrlModelo: () => ipcRenderer.invoke('voz-slides-url-modelo'),
  },

  baixarAtualizacao: () => ipcRenderer.invoke('update-download-now'),
  instalarAtualizacaoAgora: () => ipcRenderer.invoke('update-install-now'),

  onAtualizacaoDisponivel: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },

  onDownloadAtualizacaoIniciado: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('update-download-started', handler);
    return () => ipcRenderer.removeListener('update-download-started', handler);
  },

  onProgressoDownloadAtualizacao: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('update-download-progress', handler);
    return () => ipcRenderer.removeListener('update-download-progress', handler);
  },

  onAtualizacaoPronta: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },

  onErroAtualizacao: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  },
});
