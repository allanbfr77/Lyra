'use strict';

const path = require('path');

const MINIMO_VISIVEL_MS = 1400;
const TIMEOUT_CARREGAR_MS = 3000;
const FADE_MS = 340;

/**
 * Cria a janela da splash. Resolve com a API da splash, ou com null se ela não carregar em 3 s
 * (a splash nunca pode ser o motivo de o Lyra não abrir).
 */
function criarSplash({ app, BrowserWindow, ipcMain, ctx, log = () => {}, agora = Date.now }) {
  return new Promise((resolve) => {
    let win;
    try {
      win = new BrowserWindow({
        width: 520,
        height: 320,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: !app.isPackaged,
        },
      });
    } catch (e) {
      log(`[splash] falha ao criar janela: ${e && e.message}`);
      resolve(null);
      return;
    }

    const wc = win.webContents;
    /* Sem rede e sem navegação: a splash só desenha. */
    wc.on('will-navigate', (e) => e.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));

    let resolvido = false;
    let visivelDesde = 0;
    let fechada = false;
    let comErro = false;

    const enviar = (canal, dados) => {
      if (!win || win.isDestroyed()) return;
      try {
        wc.send(canal, dados);
      } catch (_) {
        // intencional — a splash não pode derrubar o boot
      }
    };

    const delegadoDoSplash = (event) => !win.isDestroyed() && event.sender === wc;
    const aoReiniciar = (event) => {
      if (!delegadoDoSplash(event)) return;
      app.relaunch();
      app.exit(0);
    };
    const aoSair = (event) => {
      if (!delegadoDoSplash(event)) return;
      app.exit(1);
    };
    ipcMain.removeAllListeners('splash:relaunch');
    ipcMain.removeAllListeners('splash:quit');
    ipcMain.on('splash:relaunch', aoReiniciar);
    ipcMain.on('splash:quit', aoSair);

    const api = {
      ativa: () => !fechada && !win.isDestroyed(),
      progresso: (d) => enviar('splash:progress', d),
      aviso: (d) => enviar('splash:warn', d),
      erro: (d) => {
        comErro = true;
        enviar('splash:error', d);
      },
      emErro: () => comErro,
      /** Tempo mínimo restante → splash:done → fade-out. Não vale para o caminho de erro. */
      async finalizar() {
        if (!api.ativa() || comErro) return;
        const restante = Math.max(0, MINIMO_VISIVEL_MS - (agora() - visivelDesde));
        if (restante) await new Promise((r) => setTimeout(r, restante));
        enviar('splash:done');
        await new Promise((r) => setTimeout(r, FADE_MS));
      },
      /** Destrói a janela (não só esconde). Chamar DEPOIS de mainWindow.show(). */
      fechar() {
        if (fechada) return;
        fechada = true;
        ipcMain.removeListener('splash:relaunch', aoReiniciar);
        ipcMain.removeListener('splash:quit', aoSair);
        if (win.isDestroyed()) return;
        /* Guarda do window-all-closed: a mesma flag do controller-recarregar. */
        const anterior = ctx.suprimirQuitWindowAllClosedRecarregar;
        ctx.suprimirQuitWindowAllClosedRecarregar = true;
        win.once('closed', () => {
          ctx.suprimirQuitWindowAllClosedRecarregar = anterior;
        });
        win.close();
      },
    };

    const desistir = (motivo) => {
      if (resolvido) return;
      resolvido = true;
      log(`[splash] sem splash: ${motivo}`);
      api.fechar();
      resolve(null);
    };

    const timer = setTimeout(() => desistir('não carregou em 3 s'), TIMEOUT_CARREGAR_MS);

    wc.once('did-fail-load', () => {
      clearTimeout(timer);
      desistir('did-fail-load');
    });
    /* dom-ready, não did-finish-load: CSS e imagens já são inline, então o DOM pronto basta e a
       splash cobre o intervalo mais cedo. Mostrar só depois disso evita o flash branco. */
    wc.once('dom-ready', () => {
      if (resolvido) return;
      clearTimeout(timer);
      resolvido = true;
      win.show();
      visivelDesde = agora();
      resolve(api);
    });

    win.loadFile(path.join(__dirname, 'splash.html'), { query: { v: app.getVersion() } }).catch(() => {
      clearTimeout(timer);
      desistir('loadFile rejeitou');
    });
  });
}

module.exports = { criarSplash, MINIMO_VISIVEL_MS, TIMEOUT_CARREGAR_MS, FADE_MS };
