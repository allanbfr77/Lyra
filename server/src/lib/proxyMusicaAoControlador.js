'use strict';

const http = require('http');

const CTL_HOST = process.env.CONTROLLER_HTTP_HOST || '127.0.0.1';
const CTL_PORT = Number(process.env.CONTROLLER_HTTP_PORT || 3001);

const IGNORE_DOWNSTREAM_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'content-length',
]);

/**
 * Proxy HTTP para `/api/musicas*` em direção à API SQLite do Electron (`localhost:3001`).
 * Deve ficar registado antes de `express.json()` para poder reencaminhar o corpo PUT/POST.
 *
 * @param {import('express').Express} expressApp
 * @param {(ctx: string, err: unknown) => void} logError
 */
function attachProxyMusicaAoControlador(expressApp, logError) {
  expressApp.use((req, res, next) => {
    const ou = typeof req.originalUrl === 'string' ? req.originalUrl.split('?', 2)[0] : '';
    if (!ou.startsWith('/api/musicas')) return next();

    const pathRaw = typeof req.originalUrl === 'string' ? req.originalUrl : req.url || '/';

    const outgoing = http.request(
      {
        hostname: CTL_HOST,
        port: CTL_PORT,
        path: pathRaw,
        method: req.method,
        headers: { ...req.headers, host: `${CTL_HOST}:${CTL_PORT}` },
        timeout: 60000,
      },
      (inc) => {
        res.status(inc.statusCode || 502);
        for (const [k, v] of Object.entries(inc.headers || {})) {
          if (!k || IGNORE_DOWNSTREAM_HEADERS.has(k.toLowerCase())) continue;
          if (typeof v !== 'undefined') res.setHeader(k, v);
        }
        inc.pipe(res);
      }
    );

    outgoing.on('timeout', () => {
      outgoing.destroy(new Error('timeout proxy controlador'));
    });

    outgoing.on('error', (e) => {
      logError('proxyMusicaAoControlador', e);
      if (!res.headersSent) {
        res.status(502).json({
          erro: `Controlador de músicas (${CTL_HOST}:${CTL_PORT}) não alcançável. Lance o programa controlador.`,
        });
      }
    });

    req.on('error', (e) => {
      outgoing.destroy(e);
    });

    if (req.method === 'GET' || req.method === 'HEAD') {
      outgoing.end();
    } else {
      req.pipe(outgoing);
    }
  });
}

module.exports = { attachProxyMusicaAoControlador, CTL_HOST, CTL_PORT };
