'use strict';

const http = require('http');
const {
  avaliarRequisicaoProxy,
  cabecalhosParaControlador,
  responderRecusa,
} = require('./politicaProxyControlador');

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
 * Proxy HTTP SOMENTE LEITURA para `/api/musicas*` em direção à API SQLite do Electron
 * (`localhost:3001`).
 *
 * E1.3 Fase B: só GET/HEAD atravessam. Escrita (POST/PUT/DELETE/PATCH…) é recusada aqui com
 * 405 — antes ela era encaminhada com o corpo e chegava à 3001 vinda da própria máquina, o
 * que dava a qualquer aparelho da rede o poder de alterar a biblioteca. Quem escreve fala
 * direto com a 3001 (que é protegida por Host/Origin e autenticação), nunca por aqui.
 *
 * @param {import('express').Express} expressApp
 * @param {(ctx: string, err: unknown) => void} logError
 */
/** `X-Lyra-Via` (elo s→c, Entrega 1) para esta chamada ao 3001, ou null sem pareamento. Nunca lança. */
function viaDoElo(assinar, metodo, caminho) {
  if (typeof assinar !== 'function') return null;
  try { return assinar({ metodo, caminho }) || null; } catch (_) { return null; }
}

function attachProxyMusicaAoControlador(expressApp, logError, assinar = null) {
  expressApp.use((req, res, next) => {
    const ou = typeof req.originalUrl === 'string' ? req.originalUrl.split('?', 2)[0] : '';
    if (!ou.startsWith('/api/musicas')) return next();

    const aval = avaliarRequisicaoProxy(req, 'musicas');
    if (!aval.ok) return responderRecusa(res, aval);

    const outgoing = http.request(
      {
        hostname: CTL_HOST,
        port: CTL_PORT,
        path: aval.caminho,
        method: req.method,
        headers: cabecalhosParaControlador(req.headers, `${CTL_HOST}:${CTL_PORT}`, viaDoElo(assinar, req.method, aval.caminho)),
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
    // Cliente que desiste (aba fechada, seek de mídia) não pode deixar o controlador transmitindo.
    res.on('close', () => {
      if (!res.writableEnded) outgoing.destroy();
    });

    outgoing.end();
    return undefined;
  });
}

module.exports = { attachProxyMusicaAoControlador, CTL_HOST, CTL_PORT };
