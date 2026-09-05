'use strict';

const { BrowserWindow, ipcMain, dialog, Menu, app, session, shell } = require('electron');
const path = require('path');
/* Só para o pré-voo verificar ficheiros de mídia — ver `lyra-verificar-arquivos`. */
const fsPreVoo = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const vozSlidesModelo = require('./lib/vozSlidesModeloMain');
const { HTTP_CONTROLLER_PORT } = require('./httpControllerServer');
const { SERVER_URL } = require('./lib/projectionServerUrl');
const { caminhoIconeApp } = require('./lib/iconPath');
const historicoWindow = require('./historicoWindow');
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

/**
 * Abre DevTools das janelas de projeção no host da 5510 (Servidor remoto nesta
 * máquina, ou motor local do Controlador). Só HTTP — o cliente Socket.IO do
 * processo principal foi removido (ver projection-core.md §12.8).
 */
async function abrirConsoleProjecaoServidor(
  ctx,
  {
    httpPath = 'api/open-display-devtools',
    titulo = 'Console do telão',
  } = {}
) {
  const w = getJanelaPrincipal(ctx);
  let janelas = null;

  try {
    const body = await postOpenDisplayDevtoolsHttp(httpPath);
    janelas = typeof body.janelas === 'number' ? body.janelas : null;
  } catch (e) {
    await dialog.showMessageBox(w || undefined, {
      type: 'warning',
      title: titulo,
      message: 'Não foi possível contactar o servidor de projeção.',
      detail:
        'Certifique-se de que a projeção está activa nesta máquina ' +
        '(modo local ou app Servidor na porta 5510).\n\n' +
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
    return { ok: true, janelas: 0, via: 'http' };
  }

  return { ok: true, via: 'http', janelas };
}

/** Abre DevTools das janelas de projeção no host da 5510 (HTTP em localhost). */
async function abrirConsoleTelaoServidor(ctx) {
  return abrirConsoleProjecaoServidor(ctx, {
    httpPath: 'api/open-display-devtools',
    titulo: 'Console do telão',
  });
}

async function abrirConsolePublicoServidor(ctx) {
  return abrirConsoleProjecaoServidor(ctx, {
    httpPath: 'api/open-public-devtools',
    titulo: 'Console do público (M2)',
  });
}

async function abrirConsoleMinistranteServidor(ctx) {
  return abrirConsoleProjecaoServidor(ctx, {
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

function criarMenuAplicativo(ctx, updaterApi, companionApi) {
  depsDoMenu = { updaterApi, companionApi };
  // Nota: o menu "Editar" foi removido da barra de propósito. Os atalhos de edição
  // (desfazer/refazer, recortar/copiar/colar, selecionar tudo) continuam funcionando
  // dentro dos campos de texto — quem os trata é o Chromium/Electron, não este menu —
  // e o app ainda oferece o menu de contexto de edição pelo botão direito.
  // (No Windows, `visible: false` em item de topo não oculta de forma confiável;
  // por isso removemos do template em vez de apenas escondê-lo.)
  const template = [
    /*
     * «Culto» — as ferramentas de quem prepara e presta contas de um culto.
     *
     * Menu próprio, e não mais itens em «Janelas»: ali vivem os consoles de diagnóstico, e
     * um «Verificar antes de começar» ao lado de «Abrir console do controlador» lê-se como
     * ferramenta de depuração. Estas duas não são para depurar coisa nenhuma — são para o
     * operador usar todos os domingos.
     *
     * A ordem é a do próprio culto: primeiro verifica-se, depois consulta-se o que passou.
     */
    {
      label: 'Culto',
      submenu: [
        {
          label: 'Verificar antes de começar…',
          /* F9, e não `Ctrl+Shift+V`: esse é o «colar sem formatação» do Chromium, e um
             acelerador de menu tem prioridade sobre ele — passaria a roubar a colagem em
             todos os campos de letra do painel. F9 está livre e alcança-se com uma tecla,
             que é o que serve a quem está com pressa antes de começar. */
          accelerator: 'F9',
          click: () => enviarComandoMenuAoRenderer(ctx, 'culto-prevoo'),
        },
        { type: 'separator' },
        {
          label: 'Histórico e relatórios…',
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            historicoWindow.abrirJanelaHistorico(getJanelaPrincipal(ctx));
          },
        },
      ],
    },
    {
      label: 'Janelas',
      submenu: [
        {
          /*
           * Mesma acção do botão «Recarregar» no Modo Home: recarrega o painel (HTML/CSS/JS)
           * com encerramento de projeção antes. Alterações em main.js exigem reiniciar o app.
           */
          label: 'Recarregar',
          click: () => enviarComandoMenuAoRenderer(ctx, 'tools-recarregar-painel'),
        },
        { type: 'separator' },
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
          /*
           * O diário de bordo das telas (`lyra-telas.log`).
           *
           * Revela o ficheiro no Explorador em vez de o abrir numa janela, porque o que o
           * operador precisa de fazer com ele é anexá-lo a uma mensagem — não lê-lo aqui. E
           * fica neste menu, ao lado dos consoles, porque é a mesma família de ferramenta:
           * o que se usa quando alguma coisa correu mal numa tela.
           */
          label: 'Abrir diagnóstico de telas…',
          enabled: !!ctx.diagnosticoTelas?.caminho(),
          click: () => {
            const caminho = ctx.diagnosticoTelas?.caminho();
            if (!caminho) return;
            try {
              shell.showItemInFolder(caminho);
            } catch (_) {
  // intencional — erro ignorado
}
          },
        },
      ],
    },
    {
      label: 'Conexão',
      submenu: [
        {
          /*
           * Caixa de seleção, e não item simples: sem a marca visível não havia como saber
           * se o modo estava ligado — nem onde desligá-lo. O operador ficava a adivinhar,
           * e cada teste do modo local partia de um estado incerto.
           *
           * Continua a ser uma caixa de seleção agora que este é o modo *padrão*, e por uma
           * razão que não mudou: o que ela mostra é o facto (o motor está de pé?), e o facto
           * pode divergir da intenção — o arranque cai no caminho remoto quando a 5510 está
           * ocupada. Uma marca que viesse da intenção declarada mentiria exactamente aí.
           *
           * O comando vai ao renderer, e não directamente ao `ctx.projecaoLocal`, porque
           * ligar o modo local não é só subir o motor: é também trocar o transporte da
           * porta de projeção do painel. Quem sabe fazer as duas coisas na ordem certa é
           * o renderer.
           */
          label: 'Projetar nesta máquina',
          type: 'checkbox',
          checked: !!ctx.projecaoLocal?.estaActiva(),
          click: () => enviarComandoMenuAoRenderer(ctx, 'tools-projetar-nesta-maquina'),
        },
        {
          /*
           * O caminho para o cenário de dois PCs, que deixou de ser automático.
           *
           * Não faz a ligação: abre Ajustes › Conexão, que é onde o IP se escreve e onde o
           * botão «Conectar» já vive. Duplicar aqui a acção pediria um IP que o menu não
           * tem como recolher — e criaria um segundo sítio a fazer a mesma coisa.
           *
           * As reticências no rótulo seguem a convenção: isto abre um painel, não executa.
           */
          label: 'Conectar a servidor remoto…',
          click: () => enviarComandoMenuAoRenderer(ctx, 'tools-conectar-servidor-remoto'),
        },
      ],
    },
    {
      label: 'Servidor',
      submenu: [
        {
          label: 'Limpar cache',
          click: () => enviarComandoMenuAoRenderer(ctx, 'tools-clear-cache'),
        },
        {
          /*
           * Some no modo local, porque ali não há o que reiniciar.
           *
           * `reiniciarServidorLocal` faz `POST api/internal/restart` contra a 5510, e essa
           * rota é do app Servidor — o host local não a serve (ver as rotas em
           * `projecaoLocal.js`). Com o modo local a ser o padrão, deixar o item à vista
           * dava, no arranque normal, um erro a dizer que não se conseguiu contactar o
           * servidor na 5510: enganoso duas vezes, porque a porta responde e quem responde
           * é este mesmo processo.
           *
           * Como o `checked` do item acima, deriva do facto e não de uma preferência; o
           * menu é reconstruído por `actualizarMenuAplicativo` na troca de modo.
           */
          label: 'Reiniciar servidor',
          visible: !ctx.projecaoLocal?.estaActiva(),
          click: () => enviarComandoMenuAoRenderer(ctx, 'tools-restart-local-server'),
        },
        { type: 'separator' },
        {
          /*
           * Só faz sentido com ligação Socket.IO ao app Servidor (cenário de dois PCs).
           * O estado `ligadoAoServidorRemoto` vem do renderer via IPC — o main não tem o
           * socket. Desligado/oculto no modo local e quando não há Servidor remoto.
           */
          label: 'Encerrar Server',
          enabled: !!ctx.ligadoAoServidorRemoto,
          click: () => enviarComandoMenuAoRenderer(ctx, 'tools-encerrar-servidor'),
        },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Verificar atualizações…',
          click: () => {
            void (async () => {
              await updaterApi?.solicitarVerificacaoAtualizacaoManual?.();
              await companionApi?.verificarCompanion?.({ manual: true });
            })();
          },
        },
        {
          label: 'Documentação / Manual do usuário',
          click: () => enviarComandoMenuAoRenderer(ctx, 'help-open-manual'),
        },
        {
          label: 'Atalhos de teclado',
          click: () => enviarComandoMenuAoRenderer(ctx, 'help-open-shortcuts'),
        },
        { type: 'separator' },
        {
          label: 'Sobre',
          click: () => enviarComandoMenuAoRenderer(ctx, 'help-open-about'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Deps do menu, guardadas para o poder reconstruir quando o modo local liga ou desliga.
 *
 * O Electron não deixa mudar `checked` de um item já instalado sem guardar a referência;
 * reconstruir o menu inteiro é mais simples e acontece raramente — só na troca de modo.
 */
let depsDoMenu = null;

/** Redesenha a barra de menu para a marca de «Projetar nesta máquina» acompanhar o estado. */
function actualizarMenuAplicativo(ctx) {
  if (!depsDoMenu) return;
  try {
    criarMenuAplicativo(ctx, depsDoMenu.updaterApi, depsDoMenu.companionApi);
  } catch (e) {
    console.error('[menu] falha ao actualizar', e);
  }
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

function registerMainWindowIpc(ctx, updaterApi, companionApi) {
  ipcMain.removeHandler('update-download-now');
  ipcMain.removeHandler('update-install-now');
  ipcMain.removeHandler('voz-slides-url-modelo');
  ipcMain.removeHandler('lyra-clear-cache');
  ipcMain.removeHandler('lyra-restart-local-server');
  ipcMain.removeHandler('lyra-app-version');
  ipcMain.removeHandler('lyra-companion-check');
  ipcMain.removeHandler('lyra-companion-install');
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

  ipcMain.handle('lyra-companion-check', (_e, opts) =>
    companionApi?.verificarCompanion?.(opts || {}) || { acao: 'noop' }
  );
  ipcMain.handle('lyra-companion-install', () => companionApi?.instalarCompanionLocal?.());
  ipcMain.removeHandler('lyra-companion-consume-relaunch');
  ipcMain.handle('lyra-companion-consume-relaunch', () => {
    try {
      const { consumirRelaunchFlag } = require('./companionUpdateHandoff');
      return consumirRelaunchFlag(app.getPath('userData'));
    } catch (_) {
      return null;
    }
  });

  ipcMain.handle('lyra-open-display-devtools', () => abrirConsoleTelaoServidor(ctx));
  ipcMain.handle('lyra-clear-cache', () => limparCacheElectron(ctx));
  ipcMain.handle('lyra-restart-local-server', () => reiniciarServidorLocal(ctx));
  ipcMain.handle('lyra-app-version', () => app.getVersion());

  /*
   * Pré-voo: os ficheiros de mídia ainda estão onde estavam?
   *
   * Devolve só um booleano por caminho, e nunca lista uma pasta nem lê conteúdo. O painel
   * já conhece estes caminhos — foi ele que os guardou quando o operador adicionou os
   * vídeos —, por isso não há aqui informação nova a escapar; o que não pode acontecer é
   * esta ponte virar um `fs` genérico ao alcance da página.
   *
   * O tecto de 200 caminhos é um travão, não um limite de uso: nenhum culto tem tantos
   * vídeos, e um pedido com mil entradas só pode ser engano ou abuso.
   */
  ipcMain.handle('lyra-verificar-arquivos', (_ev, caminhos) => {
    const lista = Array.isArray(caminhos) ? caminhos.slice(0, 200) : [];
    return lista.map((c) => {
      const caminho = String(c || '').trim();
      if (!caminho) return { caminho, existe: false };
      try {
        /* `isFile`, e não só `existsSync`: uma pasta com o nome do vídeo passaria no teste
           de existência e falharia na projeção, que é exactamente o que queremos apanhar. */
        return { caminho, existe: fsPreVoo.statSync(caminho).isFile() };
      } catch (_) {
        return { caminho, existe: false };
      }
    });
  });

  ipcMain.removeAllListeners('lyra-remoto-estado');
  ipcMain.on('lyra-remoto-estado', (_ev, payload) => {
    const ligado = !!payload?.ligado;
    if (ctx.ligadoAoServidorRemoto === ligado) return;
    ctx.ligadoAoServidorRemoto = ligado;
    actualizarMenuAplicativo(ctx);
  });

  registarIpcProjecaoLocal(ctx);
}

/**
 * IPC do modo «projetar nesta máquina».
 *
 * `ctx.projecaoLocal` é montado no `main.js`; aqui só se liga o painel a ele. Os três
 * verbos de controlo (ligar/desligar/estado) e o canal de comandos são o equivalente
 * exacto do que o painel faria por socket contra o Servidor — de propósito, para que a
 * porta de projeção do renderer não precise de saber em que modo está.
 *
 * @param {object} ctx
 */
function registarIpcProjecaoLocal(ctx) {
  for (const canal of [
    'projecao-local-ligar',
    'projecao-local-desligar',
    'projecao-local-estado',
    'projecao-local-comando',
  ]) {
    ipcMain.removeHandler(canal);
  }

  ipcMain.handle('projecao-local-ligar', async () => {
    if (!ctx.projecaoLocal) return { ok: false, erro: 'projeção local indisponível' };
    const r = await ctx.projecaoLocal.ligar();
    actualizarMenuAplicativo(ctx);
    return r;
  });

  ipcMain.handle('projecao-local-desligar', async () => {
    if (!ctx.projecaoLocal) return { ok: true };
    const r = await ctx.projecaoLocal.desligar();
    actualizarMenuAplicativo(ctx);
    return r;
  });

  ipcMain.handle('projecao-local-estado', () => {
    const { getPreferredLocalIPv4, listLocalIPv4 } = require('@lyra/projection-core').localIp;
    return {
      disponivel: !!ctx.projecaoLocal,
      activa: !!ctx.projecaoLocal?.estaActiva(),
      inicial: ctx.projecaoLocal?.estadoParaClienteNovo?.() || null,
      lanIp: getPreferredLocalIPv4(),
      lanIps: listLocalIPv4(),
    };
  });

  ipcMain.handle('projecao-local-comando', async (_ev, payload) => {
    if (!ctx.projecaoLocal) return { ok: false, erro: 'projeção local indisponível' };
    return ctx.projecaoLocal.receberComando(payload?.evento, payload?.dados, null);
  });

  /* Contraparte do `audio_state_update` do Servidor: quem toca informa o estado, e ele
     segue para o painel e para a rede. */
  ipcMain.removeAllListeners('projecao-local-audio-state');
  ipcMain.on('projecao-local-audio-state', (_ev, estado) => {
    ctx.projecaoLocal?.publicarEstadoAudio(estado);
  });
}

module.exports = {
  criarJanela,
  criarMenuAplicativo,
  actualizarMenuAplicativo,
  abrirConsoleTelaoServidor,
  registerMainWindowIpc,
  setUpdateStatusTitle,
  getJanelaPrincipal,
};
