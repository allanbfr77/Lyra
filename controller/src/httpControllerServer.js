'use strict';

const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const express = require('express');
const { getDb } = require('./db');
const {
  loadSharedSyncMeta,
  saveSharedSyncMeta,
} = require('./lib/sharedSyncMetaStore');
const { SERVER_URL } = require('./lib/projectionServerUrl');
const { registrarRotasMusicas } = require('./rotas/musicas');
const { registrarRotasPlaylists } = require('./rotas/playlists');
const { registrarRotasMinistrantes } = require('./rotas/ministrantes');
const { registrarRotasHistorico } = require('./rotas/historico');
const { registrarRotasApresentacao } = require('./rotas/apresentacao');
const { registrarRotasSyncBanco } = require('./rotas/syncBanco');
const { registrarRotasBiblia } = require('./rotas/biblia');
const { registrarRotasVosk } = require('./rotas/vosk');
const { registrarRotasLetras } = require('./rotas/letras');

const HTTP_CONTROLLER_PORT = 3001;

function projectionBaseUrl() {
  try {
    return new URL(SERVER_URL);
  } catch (_) {
    return new URL('http://127.0.0.1:5510');
  }
}

/**
 * Encaminha JSON ao servidor de projeção (5510) quando o controlador não tem socket ligado.
 */
function proxyJsonToProjection(method, pathname, jsonBody) {
  const base = projectionBaseUrl();
  const bodyBuf = jsonBody != null ? Buffer.from(JSON.stringify(jsonBody), 'utf8') : Buffer.alloc(0);
  const port = base.port ? Number(base.port) : base.protocol === 'https:' ? 443 : 80;
  const opts = {
    hostname: base.hostname,
    port,
    path: pathname,
    method,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': bodyBuf.length,
    },
  };
  const lib = base.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({ status: res.statusCode || 500, headers: res.headers, body: raw });
      });
    });
    req.on('error', reject);
    if (bodyBuf.length) req.write(bodyBuf);
    req.end();
  });
}

/**
 * API HTTP local do controlador: monta o Express e regista as rotas por domínio.
 * @param {object} ctx Estado mutável (`controllerContext.js`).
 * @param {object} paths Caminhos (`createUserPaths`).
 */
async function iniciarServidorController(ctx, paths) {
  const db = getDb();
  const expressApp = express();

  expressApp.use(express.json({ limit: '800mb' }));

  const publicDir = path.join(__dirname, '../public');
  expressApp.use(express.static(publicDir));
  expressApp.use(
    '/vendor/vosk-browser',
    express.static(path.join(__dirname, '../node_modules/vosk-browser/dist'))
  );

  registrarRotasVosk(expressApp);

  expressApp.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  /* --- Marca «o banco compartilhado mudou» ---------------------------------- */

  const META_ALTERACAO_COALESCE_MS = 250;
  let metaAlteracaoPendente = '';
  let metaAlteracaoTimer = null;

  function gravarMarcaBancoCompartilhado() {
    metaAlteracaoTimer = null;
    const updatedAt = metaAlteracaoPendente;
    metaAlteracaoPendente = '';
    if (!updatedAt) return;
    try {
      const atual = loadSharedSyncMeta(paths.sharedSyncMetaPath);
      saveSharedSyncMeta(paths.sharedSyncMetaPath, { ...atual, updatedAt });
    } catch (e) {
      console.warn('[Lyra] marca de sincronização não gravada:', e && e.message);
    }
  }

  /**
   * «O banco mudou» — sem pagar uma escrita de ficheiro por música.
   *
   * `touchSharedSyncMeta` faz uma leitura e um `fs.writeFileSync` síncronos, e no caminho
   * da importação isso corria uma vez por música: 10 músicas, 10 ciclos de disco dentro
   * do processo principal — o mesmo que desenha a projeção.
   *
   * O `updatedAt` continua a sair na hora, porque é dele que dependem quem escuta e o
   * comparador de sincronização; só a gravação é adiada e coalescida, de modo que
   * marcações seguidas rendam um ficheiro escrito. O valor gravado é exactamente o que
   * foi anunciado — ficheiro e ouvintes nunca discordam.
   */
  function marcarBancoCompartilhadoAlterado() {
    const updatedAt = new Date().toISOString();
    metaAlteracaoPendente = updatedAt;
    if (!metaAlteracaoTimer) {
      metaAlteracaoTimer = setTimeout(gravarMarcaBancoCompartilhado, META_ALTERACAO_COALESCE_MS);
    }
    return updatedAt;
  }

  function notificarBancoCompartilhadoAlterado(updatedAt) {
    try {
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('shared-banco-alterado', {
          updatedAt: String(updatedAt || ''),
        });
      }
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  function notificarMusicasSincronizadasNoPainel(musicasOk) {
    if (!musicasOk?.length) return;
    try {
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('musicas-sincronizadas', { musicas: musicasOk });
      }
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  function notificarBancoCompartilhadoAplicado(snapshot) {
    try {
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('shared-banco-aplicado', {
          snapshot,
        });
      }
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  /**
   * Toca a campainha no painel. Devolve se havia painel para atender — é isso que diz a
   * quem enviou se há alguém em frente ao ecrã do outro lado, ou se o banco vai ficar à
   * espera de ninguém.
   */
  function notificarPedidoSyncBanco(pedido) {
    try {
      if (!ctx.windowMain || ctx.windowMain.isDestroyed()) return false;
      ctx.windowMain.webContents.send('shared-banco-pedido', {
        origem: pedido.origem,
        recebidoEm: pedido.recebidoEm,
        updatedAt: pedido.snapshot?.updatedAt || '',
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Aceitar um pedido escreve no banco desta máquina; quem decide é quem está sentado à
   * frente dela. Da rede vem o pedido, nunca a decisão.
   */
  function soDestaMaquina(req, res, next) {
    const addr = String(req?.socket?.remoteAddress || '');
    const local = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    if (!local) return res.status(403).json({ ok: false, erro: 'apenas da própria máquina' });
    next();
  }

  registrarRotasApresentacao(expressApp, {
    paths,
    soDestaMaquina,
    porta: HTTP_CONTROLLER_PORT,
  });

  registrarRotasPlaylists(expressApp, {
    paths,
    notificarMusicasSincronizadasNoPainel,
  });

  registrarRotasHistorico(expressApp);

  registrarRotasMinistrantes(expressApp, {
    paths,
    marcarBancoCompartilhadoAlterado,
  });

  registrarRotasSyncBanco(expressApp, {
    paths,
    soDestaMaquina,
    notificarBancoCompartilhadoAplicado,
    notificarPedidoSyncBanco,
  });

  registrarRotasMusicas(expressApp, {
    db,
    marcarBancoCompartilhadoAlterado,
    notificarBancoCompartilhadoAlterado,
    notificarMusicasSincronizadasNoPainel,
  });

  registrarRotasBiblia(expressApp);

  registrarRotasLetras(expressApp, {
    db,
    marcarBancoCompartilhadoAlterado,
    notificarBancoCompartilhadoAlterado,
  });

  async function proxyDisplay(req, res, pathname) {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const pr = await proxyJsonToProjection('PUT', pathname, body);
      res.status(pr.status);
      const ct = pr.headers['content-type'];
      if (ct) res.setHeader('Content-Type', ct);
      res.send(pr.body.length ? pr.body.toString('utf8') : '');
    } catch (e) {
      console.error('[Controller HTTP] proxy display-config', e);
      res
        .status(502)
        .json({ erro: 'Falha ao contactar servidor de projeção (5510). ' + (e.message || String(e)) });
    }
  }

  expressApp.put('/api/display-config', (req, res) => proxyDisplay(req, res, '/api/display-config'));
  expressApp.put('/api/display-config/preview', (req, res) => proxyDisplay(req, res, '/api/display-config/preview'));

  const server = http.createServer(expressApp);
  ctx.controllerServer = server;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(HTTP_CONTROLLER_PORT, '0.0.0.0', () => {
      console.log('[Controller HTTP] escuta em 0.0.0.0:' + HTTP_CONTROLLER_PORT);
      resolve();
    });
  });

  return { server, expressApp };
}

module.exports = { iniciarServidorController, HTTP_CONTROLLER_PORT };
