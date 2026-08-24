'use strict';

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const displayRoutingMod = require('./lib/displayRouting');
const displayConfigModo = require('./lib/displayConfigModo');
/* `projectionEncerrar` saiu daqui: encerrar camadas é regra de projeção e passou a ser
   chamada pelo aplicador, dentro do Core. */
const { buildMonitorsList } = require('./lib/monitorsList');
const { fetchMusicaByIdParaProjecao } = require('./lib/fetchMusicaFromControladorHttp');
const { attachProxyMusicaAoControlador } = require('./lib/proxyMusicaAoControlador');
const { attachProxyBibliaAoControlador } = require('./lib/proxyBibliaAoControlador');
const {
  attachProxyApresentacaoVideoAoControlador,
} = require('./lib/proxyApresentacaoVideoAoControlador');
const { loadSharedDbSnapshot, saveSharedDbSnapshot } = require('./lib/sharedDbSyncStore');
const { getPreferredLocalIPv4 } = require('./lib/localIp');
const { criarControleAcesso } = require('./lib/controleAcesso');
const {
  criarAplicadorDeComandos,
  estadoBibliaParaObs: derivarEstadoBibliaParaObs,
  ALCANCE_OUTROS,
  paginaObs,
} = require('@lyra/projection-core');
const { createProjectionState } = require('./lib/projectionState');
const { lerBuildIdServidor } = require('./lib/serverBuildInfo');

/** Porta da API + WebSocket; `0.0.0.0` para acesso na rede local. */
const HTTP_API_PORT = 5510;
/** Servidor HTTP só em loopback para overlay do OBS Studio (`/obs`). */
const HTTP_OBS_PORT = 5001;

/**
 * Express + Socket.io + servidor mínimo para OBS.
 * @param {object} ctx `serverContext`
 * @param {object} paths `createUserPaths`
 * @param {{ screen: object, logError: Function, windowsApi: object, reiniciarApp?: Function, encerrarParaAtualizacao?: Function }} deps
 */
function iniciarServidor(ctx, paths, deps) {
  const { screen, logError, windowsApi, reiniciarApp, encerrarParaAtualizacao } = deps;
  const {
    estadoPublicoParaSocketsOuApi,
    garantirTelasAbertasParaProjecao,
    fecharTodasJanelasProjecao,
    openDisplayDevTools,
    openPublicDevTools,
    openMinistranteDevTools,
    enviarComandoAudioParaControle,
    sincronizarJanelasRelogio,
    aplicarDisplayConfigNasJanelas,
  } = windowsApi;

  /**
   * Porta de estado da projeção. O aplicador de comandos escreve por aqui, tal como o
   * motor — e não no `ctx` directamente. Hoje é encaminhamento puro; no Controlador em
   * modo local, a mesma superfície será servida por um armazém do próprio Core.
   */
  const projectionState = createProjectionState(ctx);

  /**
   * Tradutor comando→motor. Vive em `@lyra/projection-core`; o Servidor é o primeiro
   * consumidor e, por isso, o teste de regressão dele em produção.
   *
   * A migração dos handlers é por famílias: `aplicador.suporta(comando)` diz quais já
   * passam por aqui. Os restantes continuam com o corpo antigo neste ficheiro, até
   * serem movidos e verificados.
   */
  const aplicador = criarAplicadorDeComandos({
    state: projectionState,
    engine: windowsApi,
    /* O banco de músicas é do Controlador; o Servidor vai buscá-lo por HTTP. No modo
       local esta dependência aponta para o banco da própria máquina. */
    buscarMusicaPorId: fetchMusicaByIdParaProjecao,
    /* Onde a config de slides é gravada — caminho do perfil do utilizador, do host. */
    displayConfigPath: paths.displayConfigPath,
    logError,
    /* Controladores antigos enviavam `http://127.0.0.1:3001/...` — endereço inacessível a
       partir dos telões, que podem estar noutra máquina. */
    reescreverSrcMidia: (src, kind) => {
      if (kind !== 'video') return src;
      if (!/^https?:\/\/(127\.0\.0\.1|localhost):3001\/api\/apresentacao\/video\//i.test(src)) {
        return src;
      }
      const lan = getPreferredLocalIPv4();
      const host = lan && lan !== 'localhost' ? lan : '127.0.0.1';
      return src.replace(/^https?:\/\/(127\.0\.0\.1|localhost):3001/i, `http://${host}:${HTTP_API_PORT}`);
    },
  });

  /**
   * Traduz os eventos devolvidos pelo aplicador em difusão Socket.IO.
   *
   * É aqui — e só aqui — que projeção vira rede. `ALCANCE_OUTROS` existe porque
   * `set_display_config` sempre respondeu com `socket.broadcast.emit`, que exclui quem
   * enviou o comando.
   *
   * @param {object|null} origem socket que originou o comando (null → tudo a todos)
   * @param {Array<{nome: string, dados: any, alcance: string}>} eventos
   */
  function difundir(origem, eventos) {
    if (!ctx.io) return;
    for (const ev of eventos) {
      try {
        if (ev.alcance === ALCANCE_OUTROS && origem) origem.broadcast.emit(ev.nome, ev.dados);
        else ctx.io.emit(ev.nome, ev.dados);
      } catch (e) {
        logError(`difundir-${ev.nome}`, e);
      }
    }
  }

  /**
   * Executa um comando já migrado para o aplicador e difunde o resultado.
   *
   * Os handlers que usam isto ficam com três linhas: guarda, aplicar, difundir. O que
   * sobra em cada um é exactamente a parte que é do Servidor e não da projeção.
   *
   * @param {object} socket origem do comando
   * @param {string} comando
   * @param {any} [dados]
   */
  function aplicarEDifundir(socket, comando, dados) {
    try {
      const { eventos, aplicado } = aplicador.aplicar(comando, dados);
      difundir(socket, eventos);
      return aplicado;
    } catch (e) {
      logError(`${comando}-ws`, e);
      return false;
    }
  }

  /**
   * Variante para comandos cujo payload precisa de I/O antes de ser aplicado — hoje só
   * `exibir_musica`, quando o cliente manda `musicaId` sem as estrofes.
   *
   * @param {object} socket
   * @param {string} comando
   * @param {any} [dados]
   */
  async function prepararAplicarEDifundir(socket, comando, dados) {
    try {
      const prontos = await aplicador.preparar(comando, dados);
      const { eventos } = aplicador.aplicar(comando, prontos);
      difundir(socket, eventos);
    } catch (e) {
      logError(`${comando}-ws`, e);
    }
  }

  /** Estado do versículo em projeção para o overlay de Bíblia do OBS (`/obs/biblia`). */
  function estadoBibliaParaObs() {
    return derivarEstadoBibliaParaObs(projectionState);
  }

  function requisicaoVemDaMaquinaLocal(req) {
    const addr = String(req?.socket?.remoteAddress || '');
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  }

  function socketRemoteIp(socket) {
    const bruto =
      String(socket?.handshake?.address || socket?.conn?.remoteAddress || socket?.request?.socket?.remoteAddress || '')
        .trim();
    if (!bruto) return '';
    return bruto.startsWith('::ffff:') ? bruto.slice(7) : bruto;
  }

  function labelControlador(info) {
    if (!info || typeof info !== 'object') return 'desconhecido';
    const nome = String(info.nomePc || '').trim();
    const ip = String(info.ip || '').trim();
    if (nome && ip) return `${nome} / ${ip}`;
    if (nome) return nome;
    if (ip) return ip;
    return 'desconhecido';
  }

  const expressApp = express();
  const httpServer = http.createServer(expressApp);
  ctx.io = new Server(httpServer, {
    cors: { origin: '*' },
    /** Base64 grandes no Socket causavam queda silenciosa do transporte («desconectado» ao projetar). */
    maxHttpBufferSize: Math.max(Number(process.env.SOCKET_MAX_BUFFER_MB || 110), 110) * 1024 * 1024,
  });

  // --- Controle de acesso: write-lock de controlador primário ---
  // Fim do "último a conectar vence": o PRIMEIRO controlador registrado comanda; os demais
  // entram somente-leitura até receberem o bastão explicitamente (forcar_assumir_controle).
  ctx.acesso = criarControleAcesso({
    allowlistPath: paths.allowlistPath,
    emitParaSocket: (id, evt, dados) => {
      try { ctx.io.to(id).emit(evt, dados); } catch (_) {
        // intencional — socket pode ter saído
      }
    },
    broadcast: (evt, dados) => {
      try { ctx.io.emit(evt, dados); } catch (_) {
        // intencional
      }
    },
    notificar: (evt, dados) => {
      // Mantém o alvo de roteamento HTTP/proxy sempre apontando para o primário atual
      // (fetch de música/bíblia/vídeo e broadcast de playlists usam ctx.controladorSocketId).
      ctx.controladorSocketId = ctx.acesso.getPrimarioSocketId();
      if (!ctx.controladorSocketId) ctx.ultimasPlaylistsControlador = null;
      console.log(`[acesso] ${evt}`, dados || '');
      // Encaminha à janela de controle do servidor (UI: pendências, quem está no controle).
      try {
        const w = windowsApi.getJanelaControle && windowsApi.getJanelaControle();
        if (w && !w.isDestroyed()) w.webContents.send('acesso-evento', { evt, dados });
      } catch (_) {
        // intencional — janela pode não existir ainda
      }
    },
    logError,
    opcoes: { pingIntervaloMs: 4000, maxFalhasConsecutivas: 3 },
  });
  ctx.acesso.iniciarHeartbeat();

  // Autenticação no handshake (etapa 3): NÃO bloqueia a conexão — visualizadores (telão, OBS,
  // mobile só a ver) entram normalmente. Apenas marca se o socket está autorizado a ESCREVER.
  // A guarda comandoAutorizado usa socket.data.autorizado. Fecha o "qualquer um na rede projeta".
  ctx.io.use((socket, next) => {
    try {
      const r = ctx.acesso.autenticar(socket.handshake.auth || {});
      socket.data.autorizado = !!r.ok;
      socket.data.device = r.device || null;
      socket.data.authMotivo = r.motivo || null;
    } catch (e) {
      socket.data.autorizado = false;
      logError('auth-middleware', e);
    }
    next();
  });

  /**
   * Guarda de escrita para handlers de comando. Clientes que NÃO se registram como
   * controlador (mobile, OBS) seguem o comportamento atual ("isento por ora"). Um
   * controlador registrado só escreve se for o primário; senão o comando é recusado.
   * @param {object} socket
   * @param {Function} [ack] callback de resposta do evento (quando houver)
   * @returns {boolean} true se pode prosseguir; false → o handler deve retornar.
   */
  function comandoAutorizado(socket, ack) {
    // Porta 1 — autenticação: só dispositivos autorizados escrevem (fecha o "estranho na rede").
    // Vale para TODOS os clientes, inclusive não registrados como controlador (ex.: mobile).
    if (!socket.data || socket.data.autorizado !== true) {
      return recusarComando(socket, ack, 'nao-autorizado', null);
    }
    // Porta 2 — write-lock: entre controladores registrados, só o primário escreve.
    if (ctx.acesso.estaRegistrado(socket.id) && !ctx.acesso.podeEscrever(socket.id)) {
      return recusarComando(socket, ack, 'somente-leitura', ctx.acesso.papelDe(socket.id).donoAtual);
    }
    return true;
  }

  function recusarComando(socket, ack, erro, donoAtual) {
    if (typeof ack === 'function') ack({ ok: false, erro, donoAtual });
    else socket.emit('comando_recusado', { erro, donoAtual });
    return false;
  }

  expressApp.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  attachProxyMusicaAoControlador(expressApp, logError);
  attachProxyBibliaAoControlador(expressApp, logError);
  attachProxyApresentacaoVideoAoControlador(expressApp, logError, () => {
    const id = ctx.controladorSocketId;
    const info = id ? ctx.controladorSockets.get(id) : null;
    const ip = info && info.ip ? String(info.ip).trim() : '';
    return ip || process.env.CONTROLLER_HTTP_HOST || '127.0.0.1';
  });

  expressApp.use(express.json({ limit: '200mb' }));

  /* Identidade do host na 5510 — sem autenticação, usada pelo Controlador antes do
     handshake para distinguir este Servidor de um Controlador em modo local.
     `buildId` é identidade técnica do artefacto (companion update); não é versão de produto. */
  expressApp.get('/api/identity', (_req, res) => {
    const buildId = lerBuildIdServidor();
    const payload = { role: 'server' };
    if (buildId) payload.buildId = buildId;
    res.json(payload);
  });

  expressApp.get('/api/estado', (_req, res) => {
    res.json(estadoPublicoParaSocketsOuApi());
  });

  expressApp.get('/api/sync/banco', (_req, res) => {
    try {
      res.json(loadSharedDbSnapshot(paths.sharedDbSyncPath));
    } catch (e) {
      logError('get-sync-banco', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/sync/banco', (req, res) => {
    try {
      const result = saveSharedDbSnapshot(paths.sharedDbSyncPath, req.body || {}, {
        respectUpdatedAt: true,
        fallbackUpdatedAt: new Date().toISOString(),
      });
      res.json({ ok: true, saved: result.saved, snapshot: result.snapshot });
    } catch (e) {
      logError('post-sync-banco', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/internal/restart', (_req, res) => {
    if (!requisicaoVemDaMaquinaLocal(_req)) {
      return res.status(403).json({ ok: false, erro: 'Reinício disponível apenas localmente.' });
    }
    if (typeof reiniciarApp !== 'function') {
      return res.status(501).json({ ok: false, erro: 'Reinício não disponível nesta instância.' });
    }
    try {
      res.status(202).json({ ok: true, restarting: true });
      setTimeout(() => {
        try {
          reiniciarApp();
        } catch (e) {
          logError('post-internal-restart', e);
        }
      }, 120);
    } catch (e) {
      logError('post-internal-restart-response', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  /* Encerra o processo sem relaunch — usado pelo Controlador antes de instalar o companion. */
  expressApp.post('/api/internal/quit-for-update', (_req, res) => {
    if (!requisicaoVemDaMaquinaLocal(_req)) {
      return res.status(403).json({
        ok: false,
        erro: 'Encerramento para atualização só é permitido localmente.',
      });
    }
    if (typeof encerrarParaAtualizacao !== 'function') {
      return res.status(501).json({
        ok: false,
        erro: 'Encerramento para atualização não disponível nesta instância.',
      });
    }
    try {
      res.status(202).json({ ok: true, quitting: true });
      setTimeout(() => {
        try {
          encerrarParaAtualizacao();
        } catch (e) {
          logError('post-internal-quit-for-update', e);
        }
      }, 150);
    } catch (e) {
      logError('post-internal-quit-for-update-response', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  // --- Gestão da allowlist de controladores (só a máquina do servidor pode gerir) ---
  expressApp.get('/api/controladores', (req, res) => {
    if (!requisicaoVemDaMaquinaLocal(req)) {
      return res.status(403).json({ ok: false, erro: 'Gestão disponível apenas localmente.' });
    }
    res.json({ ok: true, modo: ctx.acesso.getModo(), dispositivos: ctx.acesso.listarDispositivos() });
  });

  expressApp.post('/api/controladores/aprovar', (req, res) => {
    if (!requisicaoVemDaMaquinaLocal(req)) return res.status(403).json({ ok: false });
    const deviceId = String(req.body?.deviceId || '').trim();
    res.json({ ok: ctx.acesso.aprovarDispositivo(deviceId) });
  });

  expressApp.post('/api/controladores/revogar', (req, res) => {
    if (!requisicaoVemDaMaquinaLocal(req)) return res.status(403).json({ ok: false });
    const deviceId = String(req.body?.deviceId || '').trim();
    res.json({ ok: ctx.acesso.revogarDispositivo(deviceId) });
  });

  expressApp.post('/api/controladores/travar', (req, res) => {
    if (!requisicaoVemDaMaquinaLocal(req)) return res.status(403).json({ ok: false });
    ctx.acesso.travar();
    res.json({ ok: true, modo: ctx.acesso.getModo() });
  });

  expressApp.post('/api/controladores/destravar', (req, res) => {
    if (!requisicaoVemDaMaquinaLocal(req)) return res.status(403).json({ ok: false });
    ctx.acesso.destravar();
    res.json({ ok: true, modo: ctx.acesso.getModo() });
  });

  /**
   * Fallback quando o controlador não tem socket ligado — mesmo payload do evento Socket
   * `exibir_apresentacao`, e agora também o mesmo caminho de código: o aplicador do Core.
   * Antes eram duas entradas para a mesma regra; a única diferença legítima entre elas é
   * o transporte, e o transporte é o que sobrou aqui.
   */
  expressApp.post('/api/comando/exibir_apresentacao', (req, res) => {
    try {
      difundir(null, aplicador.aplicar('exibir_apresentacao', req.body || {}).eventos);
      res.json({ ok: true });
    } catch (e) {
      logError('post-exibir-apresentacao', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  /**
   * Contagem regressiva por HTTP.
   *
   * É o caminho primário do painel, e não um fallback como nos outros comandos: a config
   * da contagem admite imagem de fundo em Base64, e o Socket.IO corta pacotes acima de
   * ~1 MB derrubando a ligação — o mesmo motivo pelo qual `exibir_apresentacao` já vinha
   * por aqui. O evento de socket continua registado para o celular e para o OBS.
   *
   * `aplicado === false` é payload recusado pela regra (pausar sem contagem no ar,
   * definir sem duração), não erro de servidor — daí o 400.
   */
  expressApp.post('/api/comando/exibir_contagem', (req, res) => {
    try {
      const { eventos, aplicado } = aplicador.aplicar('exibir_contagem', req.body || {});
      if (!aplicado) {
        return res.status(400).json({ ok: false, erro: 'contagem: comando sem efeito' });
      }
      difundir(null, eventos);
      res.json({ ok: true });
    } catch (e) {
      logError('post-exibir-contagem', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/comando/encerrar_contagem', (_req, res) => {
    try {
      difundir(null, aplicador.aplicar('encerrar_contagem').eventos);
      res.json({ ok: true });
    } catch (e) {
      logError('post-encerrar-contagem', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/comando/encerrar_apresentacao_publico', (req, res) => {
    try {
      difundir(null, aplicador.aplicar('encerrar_apresentacao_publico', req.body || {}).eventos);
      res.json({ ok: true });
    } catch (e) {
      logError('post-encerrar_apresentacao_publico', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  /**
   * Fallback HTTP dos comandos de áudio/vídeo — o caminho que o painel usa quando o
   * socket está em baixo. Mesmo aplicador dos eventos Socket: a normalização de payload
   * (clamp de volume, `syncTime` opt-in) existe uma vez só.
   *
   * `aplicado === false` significa payload recusado pela regra — daí o 400.
   */
  const rotaComandoAudio = (comando, erroPayload) => (req, res) => {
    try {
      const { aplicado } = aplicador.aplicar(comando, req.body || {});
      if (!aplicado) return res.status(400).json({ ok: false, erro: erroPayload });
      res.json({ ok: true });
    } catch (e) {
      logError(`post-${comando}`, e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  };

  expressApp.post('/api/comando/audio_play', rotaComandoAudio('audio_play', 'src obrigatório'));
  expressApp.post('/api/comando/audio_pause', rotaComandoAudio('audio_pause'));
  expressApp.post('/api/comando/audio_stop', rotaComandoAudio('audio_stop'));
  expressApp.post('/api/comando/audio_volume', rotaComandoAudio('audio_volume', 'volume inválido'));
  expressApp.post('/api/comando/audio_seek', rotaComandoAudio('audio_seek', 'time inválido'));
  expressApp.post(
    '/api/comando/apresentacao_video_state',
    rotaComandoAudio('apresentacao_video_state')
  );

  expressApp.get('/api/monitores', (_req, res) => {
    res.json(buildMonitorsList(screen));
  });

  expressApp.get('/api/display-routing', (_req, res) => {
    res.json(displayRoutingMod.loadDisplayRouting(paths.displayRoutingPath));
  });

  expressApp.put('/api/display-routing', (req, res) => {
    try {
      const routing = displayRoutingMod.saveDisplayRouting(paths.displayRoutingPath, req.body || {});
      garantirTelasAbertasParaProjecao();
      res.json({ ok: true, routing });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/display-config', (_req, res) => {
    res.json(ctx.displayConfig);
  });

  /**
   * As duas rotas de display-config abaixo NÃO passam pelo aplicador, de propósito.
   *
   * Parecem o gémeo HTTP de `set_display_config`, mas não são: o evento de socket difunde
   * `display_config` aos outros clientes e estas rotas não difundem nada. Encaminhá-las
   * para o mesmo comando acrescentaria um broadcast que nunca existiu. Além disso
   * respondem com a config aplicada no corpo, coisa que só interessa a um cliente HTTP.
   * A semelhança é de forma, não de comportamento.
   */
  expressApp.put('/api/display-config', (req, res) => {
    try {
      const cfg = req.body;
      if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
        return res.status(400).json({ erro: 'corpo deve ser um objeto de configuração' });
      }
      const { modoConfig } = displayConfigModo.extrairPatchDisplayConfig(cfg);
      displayConfigModo.processarDisplayConfigDoControlador(ctx, cfg, {
        persistirSlides: modoConfig !== displayConfigModo.MODO_CFG_BIBLIA,
        displayConfigPath: paths.displayConfigPath,
        enviar: aplicarDisplayConfigNasJanelas,
      });
      try { sincronizarJanelasRelogio(); } catch (e) {
        logError('sincronizar-janelas-relogio', e);
      }
      res.json({ ok: true, config: ctx.displayConfig });
    } catch (e) {
      logError('put-display-config', e);
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.put('/api/display-config/preview', (req, res) => {
    try {
      const cfg = req.body;
      if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
        return res.status(400).json({ erro: 'corpo deve ser um objeto de configuração' });
      }
      const { forcarModo } = displayConfigModo.extrairPatchDisplayConfig(cfg);
      const enviada = displayConfigModo.processarDisplayConfigDoControlador(ctx, cfg, {
        persistirSlides: false,
        enviar: aplicarDisplayConfigNasJanelas,
      });
      try { sincronizarJanelasRelogio(); } catch (e) {
        logError('sincronizar-janelas-relogio', e);
      }
      res.json({
        ok: true,
        config: enviada || displayConfigModo.resolverConfigParaJanelas(ctx, { forcarModo: forcarModo || 'slides' }),
      });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/open-display-devtools', (_req, res) => {
    try {
      const janelas = openDisplayDevTools();
      res.json({ ok: true, janelas });
    } catch (e) {
      logError('open-display-devtools-http', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/open-public-devtools', (_req, res) => {
    try {
      const janelas = openPublicDevTools();
      res.json({ ok: true, janelas });
    } catch (e) {
      logError('open-public-devtools-http', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/open-ministrante-devtools', async (_req, res) => {
    try {
      garantirTelasAbertasParaProjecao();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const janelas = openMinistranteDevTools();
      res.json({ ok: true, janelas });
    } catch (e) {
      logError('open-ministrante-devtools-http', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  ctx.io.on('connection', (socket) => {
    console.log(`[+] Cliente conectado: ${socket.id}`);

    socket.emit('estado', estadoPublicoParaSocketsOuApi());
    socket.emit('estado_biblia_obs', estadoBibliaParaObs());
    socket.emit('display_config', displayConfigModo.resolverConfigParaJanelas(ctx));

    socket.on('registrar_controlador', (payload = {}) => {
      const info = {
        socketId: socket.id,
        ip: socketRemoteIp(socket),
        nomePc: String(payload?.nomePc || '').trim(),
      };
      ctx.controladorSockets.set(socket.id, info);
      // Só um controlador AUTORIZADO entra no write-lock (pode virar primário). Um cliente
      // não autorizado (pendente/sem credencial) fica como visualizador — não comanda.
      if (socket.data && socket.data.autorizado === true) {
        // Write-lock: o PRIMEIRO registrado vira primário; um novo entra somente-leitura.
        // O notificar() do controleAcesso ressincroniza ctx.controladorSocketId com o primário.
        ctx.acesso.registrarControlador(socket.id, {
          deviceId: socket.data?.device?.deviceId || '',
          nome: info.nomePc,
          ip: info.ip,
        });
      } else {
        // Informa o cliente de que está em modo visualização (não autorizado a escrever).
        try {
          socket.emit('papel_controlador', { primario: false, podeEscrever: false, donoAtual: null, motivo: socket.data?.authMotivo || 'nao-autorizado' });
        } catch (_) {
          // intencional
        }
      }
      console.log(`[+] Controlador registrado: ${socket.id}`);
      // Informa ao controlador o IP de LAN deste servidor e a porta do OBS, para montar as
      // URLs de Browser Source (o OBS pode estar noutro PC — não serve `localhost`).
      try {
        socket.emit('server_info', {
          lanIp: getPreferredLocalIPv4(),
          obsPort: HTTP_OBS_PORT,
          apiPort: HTTP_API_PORT,
        });
      } catch (e) {
        logError('registrar_controlador-server-info', e);
      }
      try {
        garantirTelasAbertasParaProjecao();
      } catch (e) {
        logError('registrar_controlador-garantir-telas', e);
      }
    });

    // Heartbeat de aplicação: o controlador responde a cada ping para provar que está vivo.
    // Sem PONG por N ciclos consecutivos, o controleAcesso libera o bastão automaticamente.
    socket.on('pong_app', () => ctx.acesso.registrarPong(socket.id));

    /*
     * Encerramento remoto do processo Servidor, pedido por um Controlador autorizado.
     * Avisa todos os clientes e corta os sockets antes do quit — senão o disconnect só
     * chega no timeout de ping e o badge do Controlador fica preso em «Servidor».
     */
    socket.on('encerrar_servidor', (_payload, ack) => {
      if (!comandoAutorizado(socket, ack)) return;
      try {
        ctx.io.emit('servidor_a_encerrar', { motivo: 'comando-remoto' });
      } catch (_) {
        // intencional
      }
      if (typeof ack === 'function') {
        try { ack({ ok: true }); } catch (_) { /* intencional */ }
      }
      setTimeout(() => {
        try {
          try {
            for (const s of ctx.io.sockets.sockets.values()) {
              try { s.disconnect(true); } catch (_) { /* intencional */ }
            }
          } catch (_) {
            // intencional
          }
          try {
            ctx.io.close();
          } catch (_) {
            // intencional
          }
          if (typeof encerrarParaAtualizacao === 'function') {
            encerrarParaAtualizacao();
          } else {
            logError('encerrar-servidor-remoto', new Error('encerrarParaAtualizacao indisponível'));
          }
        } catch (e) {
          logError('encerrar-servidor-remoto', e);
        }
      }, 150);
    });

    // "Forçar assumir controle" (breaker manual). Idealmente atrás de confirmação humana
    // — no PC do servidor ou via fluxo aprovado. Não depende do heartbeat.
    socket.on('forcar_assumir_controle', () => {
      ctx.acesso.forcarAssumir(socket.id);
    });

    socket.on('solicitar_sincronizacao_banco', (payload = {}, ack) => {
      let notificados = 0;
      try {
        const origem = ctx.controladorSockets.get(socket.id);
        if (!origem) {
          if (typeof ack === 'function') ack({ notificados: 0 });
          return;
        }
        const atualizadoEm = String(payload?.updatedAt || '').trim();
        for (const [socketId] of ctx.controladorSockets.entries()) {
          if (socketId === socket.id) continue;
          ctx.io.to(socketId).emit('pedido_sincronizacao_banco', {
            origem: labelControlador(origem),
            updatedAt: atualizadoEm,
          });
          notificados++;
        }
      } catch (e) {
        logError('solicitar_sincronizacao_banco-ws', e);
      }
      // Ack opcional (clientes novos): informa quantos outros controladores foram notificados.
      if (typeof ack === 'function') ack({ notificados });
    });

    socket.on('get_estado', () => {
      socket.emit('estado', estadoPublicoParaSocketsOuApi());
      socket.emit('estado_biblia_obs', estadoBibliaParaObs());
      socket.emit('display_config', displayConfigModo.resolverConfigParaJanelas(ctx));
    });

    socket.on('open_display_devtools', () => {
      try { openDisplayDevTools(); } catch (e) { logError('open_display_devtools-ws', e); }
    });

    socket.on('open_public_devtools', () => {
      try { openPublicDevTools(); } catch (e) { logError('open_public_devtools-ws', e); }
    });

    socket.on('open_ministrante_devtools', () => {
      try { openMinistranteDevTools(); } catch (e) { logError('open_ministrante_devtools-ws', e); }
    });

    /* Família «config». O `set_display_config` é o único comando com ack: o aplicador
       lança em corpo inválido e o `reply` traduz isso na resposta ao cliente. */

    socket.on('preview_display_config', (cfg) => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'preview_display_config', cfg);
    });

    socket.on('set_display_config', (cfg, ack) => {
      const reply = (obj) => { try { if (typeof ack === 'function') ack(obj); } catch (_) {
        // intencional — cliente pode ter saído antes da resposta
      } };
      if (!comandoAutorizado(socket, ack)) return;
      try {
        difundir(socket, aplicador.aplicar('set_display_config', cfg).eventos);
        reply({ ok: true });
      } catch (e) {
        logError('set_display_config-ws', e);
        reply({ ok: false, erro: e.message || String(e) });
      }
    });

    socket.on('exibir_apresentacao', (payload) => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'exibir_apresentacao', payload);
    });

    socket.on('encerrar_apresentacao_publico', () => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'encerrar_apresentacao_publico');
    });

    socket.on('exibir_contagem', (payload = {}) => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'exibir_contagem', payload);
    });

    socket.on('encerrar_contagem', () => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'encerrar_contagem');
    });

    socket.on('exibir_musica', async (payload = {}) => {
      if (!comandoAutorizado(socket)) return;
      await prepararAplicarEDifundir(socket, 'exibir_musica', payload);
    });

    socket.on('exibir_versiculo', (payload = {}) => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'exibir_versiculo', payload);
    });

    /* Família «encerramento» — primeira migrada para o aplicador do Core. O que resta em
       cada handler é a guarda (Servidor) e a difusão (Servidor); a regra de projeção
       vive em `@lyra/projection-core/src/commandApplier.js`. */

    socket.on('limpar_tela', () => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'limpar_tela');
    });

    socket.on('encerrar_projecao_biblia', () => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'encerrar_projecao_biblia');
    });

    socket.on('encerrar_projecao', () => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'encerrar_projecao');
    });

    socket.on('toggle_blackout', () => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'toggle_blackout');
    });

    socket.on('exibir_ministrante', (incoming = {}) => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'exibir_ministrante', incoming);
    });

    /* Família «áudio/vídeo». Quem é o dono do áudio depende de haver sockets — é do
       Servidor, e fica aqui. O aplicador só diz se o comando foi aceite. */

    socket.on('audio_play', (payload) => {
      if (!comandoAutorizado(socket)) return;
      if (aplicarEDifundir(socket, 'audio_play', payload)) ctx.audioOwnerSocketId = socket.id;
    });

    socket.on('audio_pause', () => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'audio_pause');
    });

    socket.on('audio_volume', (payload) => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'audio_volume', payload);
    });

    socket.on('audio_seek', (payload) => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'audio_seek', payload);
    });

    socket.on('audio_stop', () => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'audio_stop');
      ctx.audioOwnerSocketId = null;
    });

    socket.on('apresentacao_video_state', (payload) => {
      if (!comandoAutorizado(socket)) return;
      aplicarEDifundir(socket, 'apresentacao_video_state', payload);
    });

    /** Mobile (ou outro cliente) pede playlists → reencaminha ao painel controlador. */
    socket.on('solicitar_playlists_controlador', () => {
      try {
        const ctrlId = ctx.controladorSocketId;
        if (ctrlId) {
          ctx.io.to(ctrlId).emit('solicitar_playlists_controlador');
          return;
        }
        const cache = ctx.ultimasPlaylistsControlador;
        if (cache && typeof cache === 'object' && !Array.isArray(cache)) {
          socket.emit('playlists_do_controlador', cache);
        }
      } catch (e) {
        logError('solicitar_playlists_controlador-ws', e);
      }
    });

    /** Controlador envia playlists → cache + broadcast para telemóveis (`playlists_do_controlador`). */
    socket.on('controlador_playlists', (payload) => {
      try {
        if (socket.id !== ctx.controladorSocketId) return;
        const pl =
          payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
        ctx.ultimasPlaylistsControlador = pl;
        socket.broadcast.emit('playlists_do_controlador', pl);
      } catch (e) {
        logError('controlador_playlists-ws', e);
      }
    });

    socket.on('disconnect', () => {
      if (ctx.audioOwnerSocketId && socket.id === ctx.audioOwnerSocketId) {
        enviarComandoAudioParaControle('audio_stop', {});
        ctx.audioOwnerSocketId = null;
      }
      const eraControlador = ctx.controladorSockets.has(socket.id);
      ctx.controladorSockets.delete(socket.id);
      if (eraControlador) {
        // Write-lock: remove do controle. Se era o primário, o bastão passa ao controlador
        // mais antigo ainda ligado (o notificar() ressincroniza ctx.controladorSocketId).
        ctx.acesso.removerControlador(socket.id);
        if (!ctx.acesso.getPrimarioSocketId()) {
          console.log('[!] Nenhum controlador no comando — fechando janelas');
          fecharTodasJanelasProjecao();
        }
      }
      console.log(`[-] Cliente desconectado: ${socket.id}`);
    });
  });

  httpServer.listen(HTTP_API_PORT, '0.0.0.0', () => {
    console.log(`[Lyra] Servidor rodando na porta ${HTTP_API_PORT}`);
  });

  /**
   * Falha ao tomar a porta principal.
   *
   * Antes isto não podia acontecer: só o Servidor punha alguém na 5510. Com o modo
   * «projetar nesta máquina» do Controlador passou a haver um segundo candidato, e sem
   * este tratamento o Electron mostrava o despejo cru de uma exceção não apanhada — e,
   * pior, a janela do Servidor abria a seguir anunciando ONLINE. Dizer que está no ar sem
   * ter a porta é a pior das saídas: o operador confia e descobre no meio do culto.
   */
  httpServer.on('error', (e) => {
    logError('http-server-listen', e);
    if (e && e.code === 'EADDRINUSE') {
      deps.aoPerderPorta?.({
        porta: HTTP_API_PORT,
        mensagem:
          `A porta ${HTTP_API_PORT} já está a ser usada por outro programa.\n\n` +
          'Isto acontece quando o Controlador está com «Projetar nesta máquina» ligado — ' +
          'nesse modo é ele que atende as telas.\n\n' +
          'Desligue essa opção no Controlador e abra o Servidor de novo.',
      });
      return;
    }
    deps.aoPerderPorta?.({
      porta: HTTP_API_PORT,
      mensagem: `Não foi possível iniciar o servidor na porta ${HTTP_API_PORT}.\n\n${e?.message || e}`,
    });
  });

  const obsApp = express();
  obsApp.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });
  /* As páginas de overlay vivem no Core desde que o OBS deixou de ser assunto exclusivo
     do Servidor — no modo local é o Controlador que as serve, da mesma origem. */
  obsApp.get('/obs', (_req, res) => {
    res.sendFile(paginaObs('obs.html'));
  });
  /** Fonte dedicada só para conteúdo de Bíblia — Browser Source separada no OBS. */
  obsApp.get('/obs/biblia', (_req, res) => {
    res.sendFile(paginaObs('obs-biblia.html'));
  });
  /** Fonte dedicada só para slides/letra de música (e avisos) — Browser Source separada no OBS. */
  obsApp.get('/obs/slides', (_req, res) => {
    res.sendFile(paginaObs('obs-slides.html'));
  });
  const obsServer = http.createServer(obsApp);
  // `0.0.0.0`: o OBS pode rodar noutro PC da rede local — precisa alcançar a porta pela LAN,
  // não só por loopback. As páginas /obs* resolvem o servidor pela `window.location.hostname`,
  // então funcionam ao serem abertas pelo IP da LAN deste servidor.
  obsServer.listen(HTTP_OBS_PORT, '0.0.0.0', () => {
    const lanIp = getPreferredLocalIPv4();
    console.log(`[Lyra] OBS endpoint: http://${lanIp}:${HTTP_OBS_PORT}/obs`);
    console.log(`[Lyra] OBS endpoint (Bíblia): http://${lanIp}:${HTTP_OBS_PORT}/obs/biblia`);
    console.log(`[Lyra] OBS endpoint (Slides): http://${lanIp}:${HTTP_OBS_PORT}/obs/slides`);
  });
  obsServer.on('error', (e) => logError('obs-server', e));
}

module.exports = { iniciarServidor, HTTP_API_PORT, HTTP_OBS_PORT };
