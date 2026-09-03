'use strict';

const http = require('http');

const CTL_HOST_DEFAULT = process.env.CONTROLLER_HTTP_HOST || '127.0.0.1';
const CTL_PORT = Number(process.env.CONTROLLER_HTTP_PORT || 3001);

const IGNORE_DOWNSTREAM_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'content-length',
]);

/** Prefixos que este proxy encaminha ao controlador. */
const PREFIXOS_APRESENTACAO = ['/api/apresentacao/video', '/api/apresentacao/midia'];

/**
 * Proxy HTTP para `/api/apresentacao/video*` e `/api/apresentacao/midia*` → controlador
 * (:3001). Os telões (PC servidor) não alcançam `127.0.0.1:3001` do controlador noutro
 * PC; passam a pedir a mídia em `:5510` e o servidor reencaminha.
 *
 * `/midia` é o caminho novo, o das mídias importadas por cópia de ficheiro — áudio
 * incluído. `/video` fica porque os vídeos gravados por versões anteriores continuam a
 * responder por lá.
 *
 * @param {import('express').Express} expressApp
 * @param {(ctx: string, err: unknown) => void} logError
 * @param {() => string} [getCtlHost] IP LAN do controlador ligado (socket)
 */
function attachProxyApresentacaoVideoAoControlador(expressApp, logError, getCtlHost) {
  expressApp.use((req, res, next) => {
    const ou = typeof req.originalUrl === 'string' ? req.originalUrl.split('?', 2)[0] : '';
    if (!PREFIXOS_APRESENTACAO.some((prefixo) => ou.startsWith(prefixo))) return next();

    const pathRaw = typeof req.originalUrl === 'string' ? req.originalUrl : req.url || '/';
    let host = CTL_HOST_DEFAULT;
    try {
      const h = typeof getCtlHost === 'function' ? String(getCtlHost() || '').trim() : '';
      if (h) host = h;
    } catch (_) {
      // intencional — usa default
    }
    // IPv6 com zona / forma `::ffff:x.x.x.x` já normalizada no registro do socket
    if (host.startsWith('::ffff:')) host = host.slice(7);

    const isStream = req.method === 'GET' || req.method === 'HEAD';
    const outgoing = http.request(
      {
        hostname: host,
        port: CTL_PORT,
        path: pathRaw,
        method: req.method,
        headers: { ...req.headers, host: `${host}:${CTL_PORT}` },
        /* GET/HEAD de vídeo pode demorar (Range + ficheiros grandes). */
        timeout: isStream ? 0 : 120000,
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
      outgoing.destroy(new Error('timeout proxy vídeo apresentação'));
    });

    outgoing.on('error', (e) => {
      logError('proxyApresentacaoVideoAoControlador', e);
      if (!res.headersSent) {
        res.status(502).json({
          erro: `Controlador de vídeo (${host}:${CTL_PORT}) não alcançável. Lance o programa controlador.`,
        });
      }
    });

    req.on('error', (e) => {
      outgoing.destroy(e);
    });

    if (isStream) {
      outgoing.end();
    } else {
      req.pipe(outgoing);
    }
  });
}

module.exports = {
  attachProxyApresentacaoVideoAoControlador,
  CTL_HOST_DEFAULT,
  CTL_PORT,
};
