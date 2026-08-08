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
  /** Informa o main se há ligação Socket.IO ao Servidor remoto (habilita menu Encerrar Server). */
  informarEstadoRemoto: (ligado) => {
    ipcRenderer.send('lyra-remoto-estado', { ligado: !!ligado });
  },

  /**
   * Ponte para o motor de projeção que corre neste mesmo aplicativo.
   *
   * `enviar` e `aoReceber` são os dois verbos que a porta de projeção do painel espera de
   * um transporte (ver `public/js/modules/projecaoPorta.js`), no mesmo vocabulário dos
   * eventos de socket — porque o OBS e o celular continuam a falá-lo pela porta 5510.
   *
   * O canal de retorno é um só, com `(evento, dados)`; quem separa por evento é o
   * transporte, do lado do painel. Assim há um listener de IPC em vez de um por evento.
   */
  projecaoLocal: {
    ligar: () => ipcRenderer.invoke('projecao-local-ligar'),
    desligar: () => ipcRenderer.invoke('projecao-local-desligar'),
    estado: () => ipcRenderer.invoke('projecao-local-estado'),
    enviar: (evento, dados) => ipcRenderer.invoke('projecao-local-comando', { evento, dados }),
    aoReceber: (cb) => {
      const handler = (_ev, payload) => cb(payload?.evento, payload?.dados);
      ipcRenderer.on('projecao-local-evento', handler);
      return () => ipcRenderer.removeListener('projecao-local-evento', handler);
    },

    /**
     * Motor de áudio: no modo local é o painel que toca.
     *
     * Os canais são os mesmos que o motor de projeção usa para falar com a janela de
     * controle do Servidor (`audio_play`, `audio_pause`, …) — o motor não sabe, nem
     * precisa de saber, que do outro lado agora está o painel.
     */
    audio: {
      aoReceberComando: (cb) => {
        const canais = ['audio_play', 'audio_pause', 'audio_stop', 'audio_volume', 'audio_seek'];
        const registados = canais.map((canal) => {
          const handler = (_ev, dados) => cb(canal, dados);
          ipcRenderer.on(canal, handler);
          return () => ipcRenderer.removeListener(canal, handler);
        });
        return () => registados.forEach((cancelar) => cancelar());
      },
      publicarEstado: (estado) => ipcRenderer.send('projecao-local-audio-state', estado),
    },
  },

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

  /**
   * Outro Controlador da rede quer sincronizar o banco com este PC.
   *
   * O snapshot NÃO vem por aqui — fica guardado no processo principal até a pessoa
   * responder. O que chega é só o suficiente para perguntar: quem, quando, de quando é.
   *
   * @param {Function} cb - (payload: { origem: string, recebidoEm: string, updatedAt: string }) => void
   * @returns {Function} cleanup
   */
  onPedidoSyncBanco: (cb) => {
    const handler = (_ev, payload) => cb(payload);
    ipcRenderer.on('shared-banco-pedido', handler);
    return () => ipcRenderer.removeListener('shared-banco-pedido', handler);
  },

  /** Nome desta máquina, para o outro PC saber quem está a pedir a sincronização. */
  nomeDestePc: () => {
    try {
      return require('os').hostname();
    } catch (_) {
      return '';
    }
  },

  /** Reconhecimento de voz offline (Vosk WASM) — URL do modelo pt-BR. */
  vozSlides: {
    obterUrlModelo: () => ipcRenderer.invoke('voz-slides-url-modelo'),
  },

  baixarAtualizacao: () => ipcRenderer.invoke('update-download-now'),
  instalarAtualizacaoAgora: () => ipcRenderer.invoke('update-install-now'),

  verificarCompanionServidor: (opts) => ipcRenderer.invoke('lyra-companion-check', opts || {}),
  instalarCompanionServidor: () => ipcRenderer.invoke('lyra-companion-install'),

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

  onCompanionUpdateAvailable: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('companion-update-available', handler);
    return () => ipcRenderer.removeListener('companion-update-available', handler);
  },
  onCompanionUpdateProgress: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('companion-update-progress', handler);
    return () => ipcRenderer.removeListener('companion-update-progress', handler);
  },
  onCompanionUpdateDone: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('companion-update-done', handler);
    return () => ipcRenderer.removeListener('companion-update-done', handler);
  },
  onCompanionUpdateError: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('companion-update-error', handler);
    return () => ipcRenderer.removeListener('companion-update-error', handler);
  },
  onCompanionUpdateRemoteInfo: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('companion-update-remote-info', handler);
    return () => ipcRenderer.removeListener('companion-update-remote-info', handler);
  },
});
