'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const displayRoutingMod = require('./lib/displayRouting');
const displayConfigModo = require('./lib/displayConfigModo');
const projectionPayloads = require('./lib/projectionPayloads');
const comentariosSlide = require('./lib/comentariosSlide');
const projectionEncerrar = require('./lib/projectionEncerrar');
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

/** Porta da API + WebSocket; `0.0.0.0` para acesso na rede local. */
const HTTP_API_PORT = 5510;
/** Servidor HTTP só em loopback para overlay do OBS Studio (`/obs`). */
const HTTP_OBS_PORT = 5001;

/**
 * Express + Socket.io + servidor mínimo para OBS.
 * @param {object} ctx `serverContext`
 * @param {object} paths `createUserPaths`
 * @param {{ screen: object, logError: Function, windowsApi: object, reiniciarApp?: Function }} deps
 */
function iniciarServidor(ctx, paths, deps) {
  const { screen, logError, windowsApi, reiniciarApp } = deps;
  const {
    estadoPublicoParaSocketsOuApi,
    snapshotMinistranteAtual,
    garantirTelasAbertasParaProjecao,
    atualizarDisplays,
    atualizarDisplayMinistrante,
    fecharTodasJanelasProjecao,
    openDisplayDevTools,
    openPublicDevTools,
    openMinistranteDevTools,
    enviarComandoAudioParaControle,
    enviarSyncVideoApresentacaoParaDisplays,
    sincronizarJanelasRelogio,
  } = windowsApi;

  /**
   * Constrói o override público telão (`estadoPublicoOverride`) compatível com
   * `server/public/js/publicProjectionRender.js` (`tipo` + `linhas` / `apresentacao`).
   */
  function estadoPublicoOverrideDePayloadApresentacao(payload) {
    const pl = payload && typeof payload === 'object' ? payload : {};
    const base = projectionPayloads.clonePayloadSafe(ctx.estadoAtual) || {};
    const kind = String(pl.kind || '').toLowerCase();

    /** Preserva blackout do slide actual; modo apresentação não usa slide preto / tela vazia como «sem conteúdo». */
    const comum = {
      ...base,
      blackout: !!base.blackout,
      slidePretoFinal: false,
      telaLimpa: false,
    };

    if (kind === 'aviso') {
      const texto = String(pl.texto || '');
      return {
        ...comum,
        tipo: 'aviso',
        linhas: texto ? texto.split(/\r\n|\r|\n/) : [''],
        avisoConfig:
          pl.avisoConfig && typeof pl.avisoConfig === 'object' ? pl.avisoConfig : undefined,
      };
    }

    const src = String(pl.src || '').trim();
    if (!src) return null;

    const kindMidia =
      kind === 'video' ? 'video' : kind === 'iframe' || kind === 'pdf' ? 'iframe' : 'image';

    return {
      ...comum,
      tipo: 'apresentacao',
      linhas: [],
      apresentacao: {
        kind: kindMidia,
        src,
        title: String(pl.title || pl.name || 'Apresentação'),
      },
    };
  }

  /**
   * Payload para `display-operator.html` (`modo` + dados).
   */
  function ministranteOverrideDePayloadApresentacao(payload) {
    const pl = payload && typeof payload === 'object' ? payload : {};
    const kind = String(pl.kind || '').toLowerCase();

    if (kind === 'aviso') {
      const texto = String(pl.texto || '');
      return {
        modo: 'aviso',
        telaLimpa: false,
        linhas: texto ? texto.split(/\r\n|\r|\n/) : [''],
        avisoConfig:
          pl.avisoConfig && typeof pl.avisoConfig === 'object' ? pl.avisoConfig : undefined,
      };
    }

    const src = String(pl.src || '').trim();
    if (!src) return null;

    const kindMidia =
      kind === 'video' ? 'video' : kind === 'iframe' || kind === 'pdf' ? 'iframe' : 'image';

    return {
      modo: 'apresentacao',
      telaLimpa: false,
      apresentacao: {
        kind: kindMidia,
        src,
        title: String(pl.title || pl.name || 'Apresentação'),
      },
    };
  }

  function normalizarCampoReferenciaBiblica(valor) {
    if (valor == null) return '';
    const texto = String(valor).trim();
    if (!texto) return '';
    const lower = texto.toLowerCase();
    return lower === 'null' || lower === 'undefined' ? '' : texto;
  }

  function montarTituloBiblico(payload) {
    const livro = normalizarCampoReferenciaBiblica(payload?.livro);
    const capitulo = normalizarCampoReferenciaBiblica(payload?.capitulo);
    const versiculo = normalizarCampoReferenciaBiblica(payload?.versiculo);
    if (!livro || !capitulo || !versiculo) return '';
    return `${livro} ${capitulo}:${versiculo}`;
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

  function aplicarExibirApresentacao(payload) {
    const pl = payload && typeof payload === 'object' ? { ...payload } : {};
    /* Controladores antigos enviavam http://127.0.0.1:3001/... — inacessível nos telões. */
    const srcBruto = String(pl.src || '').trim();
    if (
      String(pl.kind || '').toLowerCase() === 'video' &&
      /^https?:\/\/(127\.0\.0\.1|localhost):3001\/api\/apresentacao\/video\//i.test(srcBruto)
    ) {
      const lan = getPreferredLocalIPv4();
      const host = lan && lan !== 'localhost' ? lan : '127.0.0.1';
      pl.src = srcBruto.replace(
        /^https?:\/\/(127\.0\.0\.1|localhost):3001/i,
        `http://${host}:${HTTP_API_PORT}`
      );
    }
    const alvo = String(pl.alvoProjecao || 'ambos').toLowerCase();
    ctx.projecaoLiveAtiva = alvo === 'live';

    const pubOv = estadoPublicoOverrideDePayloadApresentacao(pl);
    const minOv = ministranteOverrideDePayloadApresentacao(pl);

    ctx.estadoPublicoOverride =
      (alvo === 'publico' || alvo === 'ambos' || alvo === 'live') && pubOv != null ? pubOv : null;
    ctx.ministranteApresentacaoOverride =
      (alvo === 'ministrante' || alvo === 'ambos') && minOv != null ? minOv : null;

    garantirTelasAbertasParaProjecao();
    atualizarDisplays(ctx.estadoAtual);
    ctx.estadoMinistrante = snapshotMinistranteAtual();
    atualizarDisplayMinistrante(ctx.estadoMinistrante);
    ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
  }

  function aplicarEncerrarApresentacaoPublicoServidor() {
    ctx.projecaoLiveAtiva = false;
    ctx.estadoPublicoOverride = null;
    ctx.ministranteApresentacaoOverride = null;
    garantirTelasAbertasParaProjecao();
    atualizarDisplays(ctx.estadoAtual);
    ctx.estadoMinistrante = snapshotMinistranteAtual();
    atualizarDisplayMinistrante(ctx.estadoMinistrante);
    if (ctx.io) ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
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

  /** Fallback quando o controlador não tem socket ligado — mesmo payload do evento Socket `exibir_apresentacao`. */
  expressApp.post('/api/comando/exibir_apresentacao', (req, res) => {
    try {
      aplicarExibirApresentacao(req.body || {});
      res.json({ ok: true });
    } catch (e) {
      logError('post-exibir-apresentacao', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/comando/encerrar_apresentacao_publico', (_req, res) => {
    try {
      aplicarEncerrarApresentacaoPublicoServidor();
      res.json({ ok: true });
    } catch (e) {
      logError('post-encerrar_apresentacao_publico', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  /** Fallback HTTP — mesmo comportamento dos eventos Socket `audio_*` (modo apresentação). */
  expressApp.post('/api/comando/audio_play', (req, res) => {
    try {
      const src = String(req.body?.src || '').trim();
      if (!src) return res.status(400).json({ ok: false, erro: 'src obrigatório' });
      enviarComandoAudioParaControle('audio_play', {
        src,
        name: String(req.body?.name || 'audio'),
        mediaKind: req.body?.mediaKind === 'video' ? 'video' : 'audio',
        autoplay: req.body?.autoplay !== false,
        volume: req.body?.volume,
      });
      res.json({ ok: true });
    } catch (e) {
      logError('post-audio_play', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/comando/audio_pause', (_req, res) => {
    try {
      enviarComandoAudioParaControle('audio_pause', {});
      res.json({ ok: true });
    } catch (e) {
      logError('post-audio_pause', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/comando/audio_stop', (_req, res) => {
    try {
      enviarComandoAudioParaControle('audio_stop', {});
      res.json({ ok: true });
    } catch (e) {
      logError('post-audio_stop', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/comando/audio_volume', (req, res) => {
    try {
      const v = Number(req.body?.volume);
      if (!Number.isFinite(v)) return res.status(400).json({ ok: false, erro: 'volume inválido' });
      enviarComandoAudioParaControle('audio_volume', { volume: Math.max(0, Math.min(1, v)) });
      res.json({ ok: true });
    } catch (e) {
      logError('post-audio_volume', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/comando/audio_seek', (req, res) => {
    try {
      const t = Number(req.body?.time);
      if (!Number.isFinite(t)) return res.status(400).json({ ok: false, erro: 'time inválido' });
      enviarComandoAudioParaControle('audio_seek', { time: Math.max(0, t) });
      res.json({ ok: true });
    } catch (e) {
      logError('post-audio_seek', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/comando/apresentacao_video_state', (req, res) => {
    try {
      const playing = !!req.body?.playing;
      const currentTime = Number(req.body?.currentTime);
      const volume = Number(req.body?.volume);
      const payload = { playing };
      if (req.body?.syncTime === true) {
        payload.syncTime = true;
        if (Number.isFinite(currentTime)) payload.currentTime = Math.max(0, currentTime);
      }
      if (Number.isFinite(volume)) payload.volume = Math.max(0, Math.min(1, volume));
      enviarSyncVideoApresentacaoParaDisplays(payload);
      res.json({ ok: true });
    } catch (e) {
      logError('post-apresentacao_video_state', e);
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

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

    // "Forçar assumir controle" (breaker manual). Idealmente atrás de confirmação humana
    // — no PC do servidor ou via fluxo aprovado. Não depende do heartbeat.
    socket.on('forcar_assumir_controle', () => {
      ctx.acesso.forcarAssumir(socket.id);
    });

    socket.on('solicitar_sincronizacao_banco', (payload = {}) => {
      try {
        const origem = ctx.controladorSockets.get(socket.id);
        if (!origem) return;
        const atualizadoEm = String(payload?.updatedAt || '').trim();
        for (const [socketId] of ctx.controladorSockets.entries()) {
          if (socketId === socket.id) continue;
          ctx.io.to(socketId).emit('pedido_sincronizacao_banco', {
            origem: labelControlador(origem),
            updatedAt: atualizadoEm,
          });
        }
      } catch (e) {
        logError('solicitar_sincronizacao_banco-ws', e);
      }
    });

    socket.on('get_estado', () => {
      socket.emit('estado', estadoPublicoParaSocketsOuApi());
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

    socket.on('preview_display_config', (cfg) => {
      if (!comandoAutorizado(socket)) return;
      try {
        if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) return;
        displayConfigModo.processarDisplayConfigDoControlador(ctx, cfg, { persistirSlides: false });
        try { sincronizarJanelasRelogio(); } catch (err) {
          logError('sincronizar-janelas-relogio', err);
        }
      } catch (e) {
        logError('preview_display_config-ws', e);
      }
    });

    socket.on('set_display_config', (cfg, ack) => {
      const reply = (obj) => { try { if (typeof ack === 'function') ack(obj); } catch (_) {
  // intencional — erro ignorado
} };
      if (!comandoAutorizado(socket, ack)) return;
      try {
        if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
          reply({ ok: false, erro: 'corpo deve ser um objeto de configuração' });
          return;
        }
        const { modoConfig, forcarModo } = displayConfigModo.extrairPatchDisplayConfig(cfg);
        displayConfigModo.processarDisplayConfigDoControlador(ctx, cfg, {
          persistirSlides: modoConfig !== displayConfigModo.MODO_CFG_BIBLIA,
          displayConfigPath: paths.displayConfigPath,
        });
        try { sincronizarJanelasRelogio(); } catch (err) {
          logError('sincronizar-janelas-relogio', err);
        }
        const modoEnvio =
          forcarModo === displayConfigModo.MODO_CFG_BIBLIA
            ? displayConfigModo.MODO_CFG_BIBLIA
            : forcarModo === displayConfigModo.MODO_CFG_SLIDES
              ? displayConfigModo.MODO_CFG_SLIDES
              : modoConfig;
        socket.broadcast.emit(
          'display_config',
          displayConfigModo.resolverConfigParaJanelas(ctx, { forcarModo: modoEnvio })
        );
        reply({ ok: true });
      } catch (e) {
        logError('set_display_config-ws', e);
        reply({ ok: false, erro: e.message || String(e) });
      }
    });

    socket.on('exibir_apresentacao', (payload) => {
      if (!comandoAutorizado(socket)) return;
      try {
        aplicarExibirApresentacao(payload);
      } catch (e) {
        logError('exibir_apresentacao-ws', e);
      }
    });

    socket.on('encerrar_apresentacao_publico', () => {
      if (!comandoAutorizado(socket)) return;
      try {
        aplicarEncerrarApresentacaoPublicoServidor();
      } catch (e) {
        logError('encerrar_apresentacao_publico-ws', e);
      }
    });

    socket.on('exibir_musica', async (payload = {}) => {
      if (!comandoAutorizado(socket)) return;
      try {
        const musicaIdNum = Number(payload.musicaId);
        let estrofes = Array.isArray(payload.estrofes)
          ? payload.estrofes.map((s) => String(s ?? ''))
          : [];
        let tituloExibir = String(payload.titulo || '').trim();

        if (estrofes.length === 0 && Number.isFinite(musicaIdNum) && musicaIdNum > 0) {
          const fetched = await fetchMusicaByIdParaProjecao(musicaIdNum);
          if (fetched && Array.isArray(fetched.estrofes)) {
            estrofes = fetched.estrofes.map((s) => String(s ?? ''));
            if (!tituloExibir) tituloExibir = String(fetched.titulo || '').trim();
          }
        }

        if (!Array.isArray(estrofes) || estrofes.length === 0) return;
        const idx = Number(payload.estrofeIndex);
        const n = estrofes.length;

        if (!Number.isFinite(idx) || idx < 0 || idx > n) return;

        const proxMeta = projectionPayloads.linhasProximoParaMusica(estrofes, idx);

        const musicaIdEstado =
          Number.isFinite(musicaIdNum) && musicaIdNum > 0 ? Math.trunc(musicaIdNum) : null;

        if (idx === n) {
          ctx.estadoAtual = {
            tipo: 'musica',
            musicaId: musicaIdEstado,
            titulo: '',
            linhas: [],
            linhasProximo: proxMeta.linhasProximo,
            proximoSlidePreto: proxMeta.proximoSlidePreto,
            estrofeIndex: idx,
            totalEstrofes: n + 1,
            telaLimpa: false,
            blackout: false,
            slidePretoFinal: true,
            estrofes: estrofes,
          };
        } else {
          const estrofe = estrofes[idx];
          if (!estrofe) return;
          ctx.estadoAtual = {
            tipo: 'musica',
            musicaId: musicaIdEstado,
            titulo: tituloExibir,
            linhas: comentariosSlide.filtrarLinhasParaPublico(String(estrofe).split('\n')),
            linhasProximo: proxMeta.linhasProximo,
            proximoSlidePreto: proxMeta.proximoSlidePreto,
            estrofeIndex: idx,
            totalEstrofes: n + 1,
            telaLimpa: false,
            blackout: false,
            slidePretoFinal: false,
            estrofes: estrofes,
          };
        }

        ctx.projecaoLiveAtiva = false;

        garantirTelasAbertasParaProjecao();
        displayConfigModo.enviarDisplayConfigParaJanelas(ctx, {
          forcarModo: 'slides',
        });
        atualizarDisplays(ctx.estadoAtual);
        ctx.estadoMinistrante = snapshotMinistranteAtual();
        atualizarDisplayMinistrante(ctx.estadoMinistrante);

        setImmediate(() => {
          ctx.estadoMinistrante = snapshotMinistranteAtual();
          atualizarDisplayMinistrante(ctx.estadoMinistrante);
        });
        setTimeout(() => {
          ctx.estadoMinistrante = snapshotMinistranteAtual();
          atualizarDisplayMinistrante(ctx.estadoMinistrante);
        }, 160);

        ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
      } catch (e) {
        logError('exibir_musica-ws', e);
      }
    });

    socket.on('exibir_versiculo', (payload = {}) => {
      if (!comandoAutorizado(socket)) return;
      const texto = payload.texto != null ? String(payload.texto) : '';
      const alvo = String(payload.alvoProjecao || 'ambos').toLowerCase();
      ctx.projecaoLiveAtiva = alvo === 'live';
      const livro = normalizarCampoReferenciaBiblica(payload?.livro);
      const capitulo = normalizarCampoReferenciaBiblica(payload?.capitulo);
      const versiculo = normalizarCampoReferenciaBiblica(payload?.versiculo);
      const titulo = montarTituloBiblico(payload);

      ctx.estadoAtual = {
        tipo: 'biblia',
        titulo,
        livro,
        capitulo,
        versiculo,
        linhas: [texto],
        linhasProximo: [],
        proximoSlidePreto: false,
        estrofeIndex: 0,
        totalEstrofes: 1,
        telaLimpa: false,
        blackout: false,
        slidePretoFinal: false,
      };

      if (alvo === 'publico' || alvo === 'ambos' || alvo === 'live') {
        ctx.estadoPublicoOverride = null;
      } else {
        ctx.estadoPublicoOverride = {
          tipo: null,
          titulo: '',
          linhas: [],
          linhasProximo: [],
          proximoSlidePreto: false,
          estrofeIndex: 0,
          totalEstrofes: 0,
          telaLimpa: true,
          blackout: false,
          slidePretoFinal: false,
        };
      }

      if (alvo === 'ministrante' || alvo === 'ambos') {
        ctx.ministranteApresentacaoOverride = null;
      } else {
        ctx.ministranteApresentacaoOverride = {
          modo: 'biblia',
          titulo: '',
          atual: '',
          proximo: '',
          telaLimpa: true,
        };
      }

      garantirTelasAbertasParaProjecao();
      /* Fundo/tipografia da Bíblia já estão nas janelas (preview_display_config ao entrar no modo).
         Reenviar display_config a cada versículo (bgImage em base64) causava atraso na navegação. */
      const reenviarConfig =
        payload.reenviarDisplayConfig === true || payload.somenteTexto !== true;
      if (reenviarConfig) {
        displayConfigModo.enviarDisplayConfigParaJanelas(ctx, {
          forcarModo: 'biblia',
        });
      }
      atualizarDisplays(ctx.estadoAtual);
      ctx.estadoMinistrante = snapshotMinistranteAtual();
      atualizarDisplayMinistrante(ctx.estadoMinistrante);

      setImmediate(() => {
        ctx.estadoMinistrante = snapshotMinistranteAtual();
        atualizarDisplayMinistrante(ctx.estadoMinistrante);
      });
      setTimeout(() => {
        ctx.estadoMinistrante = snapshotMinistranteAtual();
        atualizarDisplayMinistrante(ctx.estadoMinistrante);
      }, 160);

      ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
    });

    socket.on('limpar_tela', () => {
      if (!comandoAutorizado(socket)) return;
      ctx.projecaoLiveAtiva = false;
      projectionEncerrar.encerrarCamadaSlides(ctx);
      atualizarDisplays(ctx.estadoAtual);
      ctx.estadoMinistrante = snapshotMinistranteAtual();
      atualizarDisplayMinistrante(ctx.estadoMinistrante);
      displayConfigModo.enviarDisplayConfigParaJanelas(ctx, {
        forcarModo: 'slides',
      });
      ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
    });

    socket.on('encerrar_projecao_biblia', () => {
      if (!comandoAutorizado(socket)) return;
      ctx.projecaoLiveAtiva = false;
      projectionEncerrar.encerrarCamadaBiblia(ctx);
      atualizarDisplays(ctx.estadoAtual);
      ctx.estadoMinistrante = snapshotMinistranteAtual();
      atualizarDisplayMinistrante(ctx.estadoMinistrante);
      displayConfigModo.enviarDisplayConfigParaJanelas(ctx, { forcarModo: 'biblia' });
      ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
    });

    socket.on('encerrar_projecao', () => {
      if (!comandoAutorizado(socket)) return;
      ctx.projecaoLiveAtiva = false;
      ctx.estadoPublicoOverride = null;
      ctx.ministranteApresentacaoOverride = null;
      ctx.estadoAtual = {
        tipo: null,
        titulo: '',
        linhas: [],
        linhasProximo: [],
        proximoSlidePreto: false,
        estrofeIndex: 0,
        totalEstrofes: 0,
        telaLimpa: true,
        blackout: false,
        slidePretoFinal: false,
      };
      ctx.estadoMinistrante = { titulo: '', atual: '', proximo: '', telaLimpa: true };
      atualizarDisplays(ctx.estadoAtual);
      atualizarDisplayMinistrante(ctx.estadoMinistrante);
      displayConfigModo.enviarDisplayConfigParaJanelas(ctx, {
        forcarModo: 'slides',
      });
      ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
    });

    socket.on('toggle_blackout', () => {
      if (!comandoAutorizado(socket)) return;
      const next = ctx.estadoAtual.blackout !== true;
      ctx.estadoAtual = { ...ctx.estadoAtual, blackout: next };
      atualizarDisplays(ctx.estadoAtual);
      ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
    });

    socket.on('exibir_ministrante', (incoming = {}) => {
      if (!comandoAutorizado(socket)) return;
      if (ctx.ministranteApresentacaoOverride) return;
      const pl = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
      const snapshot = snapshotMinistranteAtual();
      /** Controlador envia strings do painel; clientes legacy sem corpo ficam só com o snapshot derivado da projeção. */
      const usouCliente =
        'titulo' in pl || 'atual' in pl || 'proximo' in pl || 'telaLimpa' in pl;
      if (usouCliente) {
        ctx.estadoMinistrante = {
          titulo: pl.titulo != null ? String(pl.titulo) : snapshot.titulo || '',
          atual: pl.atual != null ? String(pl.atual) : snapshot.atual || '',
          proximo: pl.proximo != null ? String(pl.proximo) : snapshot.proximo || '',
          projecaoAtiva: typeof pl.projecaoAtiva === 'boolean' ? pl.projecaoAtiva : undefined,
          telaLimpa: typeof pl.telaLimpa === 'boolean' ? pl.telaLimpa : !!snapshot.telaLimpa,
        };
      } else {
        ctx.estadoMinistrante = snapshot;
      }
      atualizarDisplayMinistrante(ctx.estadoMinistrante);
    });

    socket.on('audio_play', (payload) => {
      if (!comandoAutorizado(socket)) return;
      const src = String(payload?.src || '').trim();
      if (!src) return;
      ctx.audioOwnerSocketId = socket.id;
      enviarComandoAudioParaControle('audio_play', {
        src,
        name: String(payload?.name || 'audio'),
        mediaKind: payload?.mediaKind === 'video' ? 'video' : 'audio',
        autoplay: payload?.autoplay !== false,
        volume: payload?.volume,
      });
    });

    socket.on('audio_pause', () => {
      if (!comandoAutorizado(socket)) return;
      enviarComandoAudioParaControle('audio_pause', {});
    });

    socket.on('audio_volume', (payload) => {
      if (!comandoAutorizado(socket)) return;
      const v = Number(payload?.volume);
      if (!Number.isFinite(v)) return;
      enviarComandoAudioParaControle('audio_volume', { volume: Math.max(0, Math.min(1, v)) });
    });

    socket.on('audio_seek', (payload) => {
      if (!comandoAutorizado(socket)) return;
      const t = Number(payload?.time);
      if (!Number.isFinite(t)) return;
      enviarComandoAudioParaControle('audio_seek', { time: Math.max(0, t) });
    });

    socket.on('audio_stop', () => {
      if (!comandoAutorizado(socket)) return;
      enviarComandoAudioParaControle('audio_stop', {});
      ctx.audioOwnerSocketId = null;
    });

    socket.on('apresentacao_video_state', (payload) => {
      if (!comandoAutorizado(socket)) return;
      try {
        const pl = payload && typeof payload === 'object' ? payload : {};
        const sync = { playing: !!pl.playing };
        const vol = Number(pl.volume);
        if (pl.syncTime === true) {
          sync.syncTime = true;
          const ct = Number(pl.currentTime);
          if (Number.isFinite(ct)) sync.currentTime = Math.max(0, ct);
        }
        if (Number.isFinite(vol)) sync.volume = Math.max(0, Math.min(1, vol));
        enviarSyncVideoApresentacaoParaDisplays(sync);
      } catch (e) {
        logError('apresentacao_video_state-ws', e);
      }
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

  const obsApp = express();
  obsApp.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });
  obsApp.get('/obs', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/obs.html'));
  });
  /** Fonte dedicada só para conteúdo de Bíblia — Browser Source separada no OBS. */
  obsApp.get('/obs/biblia', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/obs-biblia.html'));
  });
  /** Fonte dedicada só para slides/letra de música (e avisos) — Browser Source separada no OBS. */
  obsApp.get('/obs/slides', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/obs-slides.html'));
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
