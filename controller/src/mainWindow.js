'use strict';

const { BrowserWindow, ipcMain, dialog, Menu, app, session } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const vozSlidesModelo = require('./lib/vozSlidesModeloMain');
const { HTTP_CONTROLLER_PORT } = require('./httpControllerServer');
const { SERVER_URL } = require('./serverLink');
const { caminhoIconeApp } = require('./lib/iconPath');
const SERVER_LOCAL_BASE_URL = 'http://127.0.0.1:5510/';
const ZOOM_BASE_LARGURA = 1920;
const ZOOM_BASE_ALTURA = 1080;
const ZOOM_MINIMO = 0.5;
const ZOOM_MAXIMO = 1;

function getJanelaPrincipal(ctx) {
  return ctx.windowMain && !ctx.windowMain.isDestroyed() ? ctx.windowMain : null;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limitarNumero(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function calcularZoomFactorJanela(win) {
  if (!win || win.isDestroyed()) return 1;
  let bounds = null;
  try {
    bounds = typeof win.getContentBounds === 'function' ? win.getContentBounds() : win.getBounds();
  } catch (_) {
    return 1;
  }
  const largura = Number(bounds?.width || 0);
  const altura = Number(bounds?.height || 0);
  if (!(largura > 0) || !(altura > 0)) return 1;
  const zoomBruto = Math.min(largura / ZOOM_BASE_LARGURA, altura / ZOOM_BASE_ALTURA);
  return limitarNumero(zoomBruto, ZOOM_MINIMO, ZOOM_MAXIMO);
}

function aplicarZoomAutomaticoJanela(win) {
  const wc = win?.webContents;
  if (!win || win.isDestroyed() || !wc || wc.isDestroyed()) return;
  const zoomFactor = calcularZoomFactorJanela(win);
  try {
    wc.setZoomFactor(zoomFactor);
  } catch (_) {
  // intencional — erro ignorado
}
}

function anexarZoomAutomaticoJanela(win) {
  if (!win || win.isDestroyed()) return;
  let timerZoom = null;
  const agendarAplicacao = () => {
    if (!win || win.isDestroyed()) return;
    try {
      if (timerZoom) clearTimeout(timerZoom);
    } catch (_) {
  // intencional — erro ignorado
}
    timerZoom = setTimeout(() => {
      timerZoom = null;
      aplicarZoomAutomaticoJanela(win);
    }, 16);
  };
  win.webContents.on('did-finish-load', agendarAplicacao);
  win.on('resize', agendarAplicacao);
}

function enviarComandoMenuAoRenderer(ctx, command, payload = {}) {
  const w = getJanelaPrincipal(ctx);
  if (!w) return;
  try {
    w.webContents.send('lyra-menu-command', { command, ...payload });
  } catch (_) {
  // intencional — erro ignorado
}
}

function setUpdateStatusTitle(ctx, status) {
  const w = getJanelaPrincipal(ctx);
  if (!w) return;
  const base = `Lyra — Controlador v${app.getVersion()}`;
  if (!status) {
    w.setTitle(base);
    return;
  }
  w.setTitle(`${base} — ${status}`);
}

function postOpenDisplayDevtoolsHttp(apiPath = 'api/open-display-devtools') {
  const base = SERVER_URL.endsWith('/') ? SERVER_URL : `${SERVER_URL}/`;
  const url = new URL(apiPath, base);
  const lib = url.protocol === 'https:' ? https : http;
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Length': 0 },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let body = {};
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          } catch (_) {
  // intencional — erro ignorado
}
          if (res.statusCode >= 200 && res.statusCode < 300 && body.ok !== false) {
            resolve(body);
            return;
          }
          reject(new Error(body.erro || `HTTP ${res.statusCode || 500}`));
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function requestJson(urlValue, { method = 'GET', body = null, timeoutMs = 4000 } = {}) {
  const url = urlValue instanceof URL ? urlValue : new URL(String(urlValue));
  const lib = url.protocol === 'https:' ? https : http;
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  const payload = body === null || body === undefined ? null : Buffer.from(JSON.stringify(body));

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': payload.length,
            }
          : undefined,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch (_) {
  // intencional — resposta pode não ser JSON
}
          resolve({
            statusCode: Number(res.statusCode || 0),
            body: data,
            text,
          });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Tempo esgotado ao contactar o servidor local.'));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestJsonServidorLocal(apiPath, opts = {}) {
  return requestJson(new URL(apiPath, SERVER_LOCAL_BASE_URL), opts);
}

async function limparCacheElectron(ctx) {
  const ses = getJanelaPrincipal(ctx)?.webContents?.session || session.defaultSession;
  if (!ses) {
    throw new Error('Não foi possível obter a sessão atual do Electron.');
  }

  await ses.clearCache();
  await ses.clearStorageData({
    storages: ['cookies', 'serviceworkers', 'cachestorage', 'shadercache'],
  });

  return {
    ok: true,
    message: 'Cache e dados temporários da sessão limpos com sucesso.',
  };
}

function emitirStatusReinicioServidor(ctx, stage, message) {
  const w = getJanelaPrincipal(ctx);
  if (!w) return;
  try {
    w.webContents.send('lyra-server-restart-status', { stage, message: String(message || '') });
  } catch (_) {
  // intencional — erro ignorado
}
}

async function aguardarServidorLocalPronto(timeoutMs = 30000) {
  const inicio = Date.now();
  let ultimoErro = '';

  while (Date.now() - inicio < timeoutMs) {
    try {
      const resposta = await requestJsonServidorLocal('api/estado', { timeoutMs: 2500 });
      if (resposta.statusCode >= 200 && resposta.statusCode < 300) {
        return true;
      }
      ultimoErro = resposta.text || `HTTP ${resposta.statusCode}`;
    } catch (err) {
      ultimoErro = err?.message || String(err);
    }
    await esperar(700);
  }

  throw new Error(
    ultimoErro
      ? `O servidor não voltou a responder a tempo.\n\n${ultimoErro}`
      : 'O servidor não voltou a responder a tempo.'
  );
}

async function reiniciarServidorLocal(ctx) {
  if (ctx.serverRestartInProgress) {
    throw new Error('Já existe um reinício do servidor em andamento.');
  }

  ctx.serverRestartInProgress = true;
  try {
    emitirStatusReinicioServidor(ctx, 'starting', 'Solicitando reinicialização do servidor local...');
    let resposta;
    try {
      resposta = await requestJsonServidorLocal('api/internal/restart', {
        method: 'POST',
        body: { origem: 'controller-menu' },
        timeoutMs: 4500,
      });
    } catch (err) {
      throw new Error(
        'Não foi possível contactar o servidor local do Lyra na porta 5510.\n\n' +
          String(err?.message || err)
      );
    }

    if (resposta.statusCode < 200 || resposta.statusCode >= 300 || resposta.body?.ok === false) {
      throw new Error(
        String(resposta.body?.erro || resposta.text || `HTTP ${resposta.statusCode || 500}`)
      );
    }

    emitirStatusReinicioServidor(ctx, 'restarting', 'Reiniciando servidor...');
    await esperar(650);
    emitirStatusReinicioServidor(ctx, 'waiting', 'Aguardando o servidor ficar pronto...');
    await aguardarServidorLocalPronto();
    emitirStatusReinicioServidor(ctx, 'ready', 'Servidor pronto para uso.');

    return {
      ok: true,
      message: 'Servidor local reiniciado com sucesso.',
    };
  } finally {
    ctx.serverRestartInProgress = false;
  }
}

async function abrirConsoleProjecaoServidor(
  ctx,
  {
    socketEvent = 'open_display_devtools',
    httpPath = 'api/open-display-devtools',
    titulo = 'Console do telão',
  } = {}
) {
  const w = getJanelaPrincipal(ctx);
  let janelas = null;
  let via = 'http';

  const link = ctx.serverLink;
  if (link && link.enviarParaServer(socketEvent)) {
    via = 'socket';
  }

  try {
    const body = await postOpenDisplayDevtoolsHttp(httpPath);
    janelas = typeof body.janelas === 'number' ? body.janelas : null;
  } catch (e) {
    if (via === 'socket') {
      return { ok: true, via };
    }
    await dialog.showMessageBox(w || undefined, {
      type: 'warning',
      title: titulo,
      message: 'Não foi possível contactar o servidor de projeção.',
      detail:
        'Certifique-se de que o Lyra — Servidor está em execução (porta 5510).\n\n' +
        (e?.message || String(e)),
      buttons: ['OK'],
    });
    return { ok: false, erro: e?.message || String(e) };
  }

  if (janelas === 0) {
    await dialog.showMessageBox(w || undefined, {
      type: 'info',
      title: titulo,
      message: 'Nenhuma janela de projeção encontrada.',
      detail:
        'Configure os monitores em Configurações e abra a projeção (slide ou bíblia) antes de abrir o console.',
      buttons: ['OK'],
    });
    return { ok: true, janelas: 0 };
  }

  return { ok: true, via, janelas };
}

/**
 * Abre DevTools das janelas de projeção no processo do servidor (5510).
 * Usa socket do main; se falhar, tenta HTTP em localhost.
 */
async function abrirConsoleTelaoServidor(ctx) {
  return abrirConsoleProjecaoServidor(ctx, {
    socketEvent: 'open_display_devtools',
    httpPath: 'api/open-display-devtools',
    titulo: 'Console do telão',
  });
}

async function abrirConsolePublicoServidor(ctx) {
  return abrirConsoleProjecaoServidor(ctx, {
    socketEvent: 'open_public_devtools',
    httpPath: 'api/open-public-devtools',
    titulo: 'Console do público (M2)',
  });
}

async function abrirConsoleMinistranteServidor(ctx) {
  return abrirConsoleProjecaoServidor(ctx, {
    socketEvent: 'open_ministrante_devtools',
    httpPath: 'api/open-ministrante-devtools',
    titulo: 'Console do ministrante (M3)',
  });
}

function anexarMenuContextoEdicao(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.on('context-menu', (_event, params) => {
    const { editFlags } = params;
    const items = [];
    if (params.isEditable) {
      items.push(
        { role: 'undo', label: 'Desfazer', enabled: editFlags.canUndo },
        { role: 'redo', label: 'Refazer', enabled: editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar', enabled: editFlags.canCut },
        { role: 'copy', label: 'Copiar', enabled: editFlags.canCopy },
        { role: 'paste', label: 'Colar', enabled: editFlags.canPaste },
        { role: 'delete', label: 'Excluir', enabled: editFlags.canDelete },
        { type: 'separator' },
        { role: 'selectAll', label: 'Selecionar tudo', enabled: editFlags.canSelectAll },
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      items.push({ role: 'copy', label: 'Copiar' });
    }
    if (!items.length) return;
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

function criarMenuAplicativo(ctx, updaterApi) {
  // Nota: o menu "Editar" foi removido da barra de propósito. Os atalhos de edição
  // (desfazer/refazer, recortar/copiar/colar, selecionar tudo) continuam funcionando
  // dentro dos campos de texto — quem os trata é o Chromium/Electron, não este menu —
  // e o app ainda oferece o menu de contexto de edição pelo botão direito.
  // (No Windows, `visible: false` em item de topo não oculta de forma confiável;
  // por isso removemos do template em vez de apenas escondê-lo.)
  const template = [
    {
      label: 'Ferramentas',
      submenu: [
        {
          label: 'Abrir console do controlador',
          click: () => {
            const w = getJanelaPrincipal(ctx);
            if (!w) return;
            try {
              w.webContents.openDevTools({ mode: 'detach' });
            } catch (_) {
  // intencional — erro ignorado
}
          },
        },
        {
          label: 'Abrir console do público (M2)',
          click: () => {
            abrirConsolePublicoServidor(ctx).catch(() => {});
          },
        },
        {
          label: 'Abrir console do ministrante (M3)',
          click: () => {
            abrirConsoleMinistranteServidor(ctx).catch(() => {});
          },
        },
        { type: 'separator' },
        {
          label: 'Limpar cache',
          click: () => enviarComandoMenuAoRenderer(ctx, 'tools-clear-cache'),
        },
        {
          label: 'Reiniciar servidor',
          click: () => enviarComandoMenuAoRenderer(ctx, 'tools-restart-local-server'),
        },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Verificar atualizações…',
          click: () => updaterApi?.solicitarVerificacaoAtualizacaoManual?.(),
        },
        { type: 'separator' },
        {
          label: 'Documentação / Manual do usuário',
          click: () => enviarComandoMenuAoRenderer(ctx, 'help-open-manual'),
        },
        {
          label: 'Atalhos de teclado',
          click: () => enviarComandoMenuAoRenderer(ctx, 'help-open-shortcuts'),
        },
      ],
    },
    {
      // Item solto na barra (fora do menu Ajuda).
      label: 'Sobre',
      click: () => enviarComandoMenuAoRenderer(ctx, 'help-open-about'),
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function nudgeRepinturaJanelaWin32(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    win.setBounds({ x: b.x, y: b.y, width: b.width + 1, height: b.height });
    setTimeout(() => {
      if (!win.isDestroyed()) win.setBounds(b);
    }, 50);
  } catch (_) {
  // intencional — erro ignorado
}
}

function anexarRepinturaJanelaController(win) {
  if (!win) return;
  const disparar = () => {
    try {
      if (!win.isDestroyed()) win.webContents.send('controller-repaint-request');
    } catch (_) {
  // intencional — erro ignorado
}
    nudgeRepinturaJanelaWin32(win);
  };
  win.on('focus', disparar);
  win.on('show', disparar);
  win.on('restore', disparar);
}

/** Abre o controlador ocupando a área útil do monitor (tela cheia operacional). */
function aplicarTelaCheiaAoControlador(win) {
  if (!win || win.isDestroyed()) return;
  try {
    if (!win.isMaximized()) win.maximize();
  } catch (_) {
    // intencional — erro ignorado
  }
}

function obterOpcoesBrowserWindowPrincipal() {
  const WINDOW_TITLE = `Lyra — Controlador v${app.getVersion()}`;
  return {
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: WINDOW_TITLE,
    icon: caminhoIconeApp(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
    backgroundColor: '#f5f3ee',
  };
}

function rodarScriptAposSubstituicaoRecarregar(ctx, win, snap) {
  if (!win || win.isDestroyed()) return;
  const wc = win.webContents;
  try {
    wc.executeJavaScript(
      "(function(){try{var o=document.getElementById('app-dialog-overlay');if(o){o.classList.remove('aberto');o.hidden=true;}if(typeof bootOverlaysEAppDialogCtrl==='function')bootOverlaysEAppDialogCtrl();requestAnimationFrame(function(){requestAnimationFrame(function(){if(typeof forcarRepinturaCompositorLyra==='function')forcarRepinturaCompositorLyra();});});}catch(e){}})();"
    ).catch(() => {});
    nudgeRepinturaJanelaWin32(win);
  } catch (_) {
  // intencional — erro ignorado
}
  setTimeout(() => {
    try {
      if (!win.isDestroyed()) {
        nudgeRepinturaJanelaWin32(win);
        win.show();
        aplicarTelaCheiaAoControlador(win);
        win.focus();
      }
    } finally {
      ctx.suprimirQuitWindowAllClosedRecarregar = false;
      ctx.controllerRecarregarEmCurso = false;
      if (ctx.controllerRecarregarPendente) {
        ctx.controllerRecarregarPendente = false;
        setImmediate(() => solicitarRecargaSubstituindoJanelaPrincipal(ctx));
      }
    }
  }, 120);
}

function solicitarRecargaSubstituindoJanelaPrincipal(ctx) {
  if (!ctx.windowMain || ctx.windowMain.isDestroyed()) return;
  if (ctx.controllerRecarregarEmCurso) {
    ctx.controllerRecarregarPendente = true;
    return;
  }
  ctx.controllerRecarregarEmCurso = true;
  ctx.suprimirQuitWindowAllClosedRecarregar = true;
  ctx.substituirJanelaAposFecharPorRecarregar = true;
  ctx.snapshotRecarregarJanelaBounds = {
    bounds: ctx.windowMain.getBounds(),
    maximized: ctx.windowMain.isMaximized(),
  };
  ctx.windowMain.close();
}

function anexarLifecycleJanelaPrincipal(ctx) {
  const win = ctx.windowMain;
  anexarRepinturaJanelaController(win);
  anexarZoomAutomaticoJanela(win);
  anexarMenuContextoEdicao(win);
  win.setMenuBarVisibility(true);
  const WINDOW_TITLE = `Lyra — Controlador v${app.getVersion()}`;
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win?.setTitle(WINDOW_TITLE);
  });
  win.webContents.on('did-finish-load', () => {
    win?.setTitle(WINDOW_TITLE);
  });
  win.on('closed', () => {
    if (ctx.substituirJanelaAposFecharPorRecarregar) {
      ctx.substituirJanelaAposFecharPorRecarregar = false;
      const snap = ctx.snapshotRecarregarJanelaBounds;
      ctx.snapshotRecarregarJanelaBounds = null;
      ctx.windowMain = null;
      setImmediate(() => {
        let nova;
        try {
          nova = new BrowserWindow({ ...obterOpcoesBrowserWindowPrincipal(), show: false });
          if (snap?.bounds) {
            try {
              nova.setBounds(snap.bounds);
            } catch (_) {
  // intencional — erro ignorado
}
          }
          ctx.windowMain = nova;
          anexarLifecycleJanelaPrincipal(ctx);
        } catch (err) {
          console.error('[controller-recarregar] falha ao criar nova janela', err);
          ctx.suprimirQuitWindowAllClosedRecarregar = false;
          ctx.controllerRecarregarEmCurso = false;
          app.quit();
          return;
        }
        const wc = nova.webContents;
        const failT = setTimeout(() => {
          ctx.suprimirQuitWindowAllClosedRecarregar = false;
          ctx.controllerRecarregarEmCurso = false;
          try {
            if (nova && !nova.isDestroyed()) nova.close();
          } catch (_) {
  // intencional — erro ignorado
}
          app.quit();
        }, 15000);
        wc.once('did-finish-load', () => {
          try {
            clearTimeout(failT);
          } catch (_) {
  // intencional — erro ignorado
}
          rodarScriptAposSubstituicaoRecarregar(ctx, nova, snap);
        });
        try {
          nova.loadURL(`http://127.0.0.1:${HTTP_CONTROLLER_PORT}/controller.html`);
        } catch (err) {
          try {
            clearTimeout(failT);
          } catch (_) {
  // intencional — erro ignorado
}
          console.error('[controller-recarregar] loadFile', err);
          ctx.suprimirQuitWindowAllClosedRecarregar = false;
          ctx.controllerRecarregarEmCurso = false;
          try {
            if (nova && !nova.isDestroyed()) nova.close();
          } catch (_) {
  // intencional — erro ignorado
}
          app.quit();
        }
      });
      return;
    }
    ctx.suprimirQuitWindowAllClosedRecarregar = false;
    ctx.windowMain = null;
    app.quit();
  });
}

function repinturaRendererControlador(wc) {
  if (!wc || wc.isDestroyed()) return;
  try {
    wc.executeJavaScript(
      "(function(){try{if(typeof forcarRepinturaCompositorLyra==='function')forcarRepinturaCompositorLyra();}catch(e){}})();"
    ).catch(() => {});
  } catch (_) {
  // intencional — erro ignorado
}
}

function criarJanela(ctx) {
  ctx.windowMain = new BrowserWindow({ ...obterOpcoesBrowserWindowPrincipal(), show: false });
  anexarLifecycleJanelaPrincipal(ctx);

  let janelaMostrada = false;
  const win = ctx.windowMain;
  const wc = win.webContents;

  const revelar = () => {
    if (janelaMostrada || !win || win.isDestroyed()) return;
    janelaMostrada = true;
    try {
      win.show();
    } catch (_) {
  // intencional — erro ignorado
}
    aplicarTelaCheiaAoControlador(win);
    try {
      win.focus();
    } catch (_) {
  // intencional — erro ignorado
}
    nudgeRepinturaJanelaWin32(win);
    repinturaRendererControlador(wc);
    if (process.platform === 'win32') {
      setTimeout(() => {
        if (!win.isDestroyed()) {
          nudgeRepinturaJanelaWin32(win);
          repinturaRendererControlador(wc);
        }
      }, 120);
    }
  };

  if (process.platform === 'win32') {
    let readyToShowOk = false;
    let didFinishOk = false;
    const agendarRevelarSeWinPronto = () => {
      if (!readyToShowOk || !didFinishOk || janelaMostrada) return;
      setTimeout(revelar, 56);
    };
    win.once('ready-to-show', () => {
      readyToShowOk = true;
      agendarRevelarSeWinPronto();
    });
    wc.once('did-finish-load', () => {
      didFinishOk = true;
      agendarRevelarSeWinPronto();
      setTimeout(() => {
        if (!janelaMostrada && win && !win.isDestroyed()) revelar();
      }, 900);
    });
  } else {
    win.once('ready-to-show', revelar);
    wc.once('did-finish-load', () => {
      setTimeout(() => {
        if (!janelaMostrada && win && !win.isDestroyed()) revelar();
      }, 1200);
    });
  }

  win.loadURL(`http://127.0.0.1:${HTTP_CONTROLLER_PORT}/controller.html`);
}

function registerMainWindowIpc(ctx, updaterApi) {
  ipcMain.removeHandler('update-download-now');
  ipcMain.removeHandler('update-install-now');
  ipcMain.removeHandler('voz-slides-url-modelo');
  ipcMain.removeHandler('lyra-clear-cache');
  ipcMain.removeHandler('lyra-restart-local-server');
  ipcMain.removeHandler('lyra-app-version');
  ipcMain.removeAllListeners('controller-recarregar');

  ipcMain.on('controller-recarregar', () => solicitarRecargaSubstituindoJanelaPrincipal(ctx));

  ipcMain.handle('voz-slides-url-modelo', async () => {
    try {
      return await vozSlidesModelo.obterUrlModeloVozSlides();
    } catch (err) {
      return { ok: false, erro: err?.message || String(err) };
    }
  });

  ipcMain.handle('update-download-now', () => updaterApi?.baixarAtualizacaoDisponivel?.() || false);
  ipcMain.handle('update-install-now', () => updaterApi?.instalarAtualizacaoAgora?.() || false);

  ipcMain.handle('lyra-open-display-devtools', () => abrirConsoleTelaoServidor(ctx));
  ipcMain.handle('lyra-clear-cache', () => limparCacheElectron(ctx));
  ipcMain.handle('lyra-restart-local-server', () => reiniciarServidorLocal(ctx));
  ipcMain.handle('lyra-app-version', () => app.getVersion());
}

module.exports = {
  criarJanela,
  criarMenuAplicativo,
  abrirConsoleTelaoServidor,
  registerMainWindowIpc,
  setUpdateStatusTitle,
  getJanelaPrincipal,
};
