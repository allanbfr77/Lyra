'use strict';

const http = require('http');
const {
  avaliarRequisicaoProxy,
  cabecalhosParaControlador,
  responderRecusa,
} = require('./politicaProxyControlador');

const CTL_HOST_DEFAULT = process.env.CONTROLLER_HTTP_HOST || '127.0.0.1';
const CTL_PORT = Number(process.env.CONTROLLER_HTTP_PORT || 3001);

const IGNORE_DOWNSTREAM_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'content-length',
]);

/** Prefixos que este proxy intercepta (a política decide o que de fato atravessa). */
const PREFIXOS_APRESENTACAO = ['/api/apresentacao/video', '/api/apresentacao/midia'];

/**
 * Proxy HTTP SOMENTE LEITURA para `/api/apresentacao/video/<id>` e
 * `/api/apresentacao/midia/<id>` → controlador (:3001). Os telões (PC servidor) não alcançam
 * `127.0.0.1:3001` do controlador noutro PC; passam a pedir a mídia em `:5510` e o servidor
 * reencaminha (GET/HEAD, com Range/If-Range para o <video>/<audio> poder avançar).
 *
 * `/midia` é o caminho novo, o das mídias importadas por cópia de ficheiro — áudio
 * incluído. `/video` fica porque os vídeos gravados por versões anteriores continuam a
 * responder por lá.
 *
 * E1.3 Fase B: o proxy NÃO encaminha escrita. Em especial `POST /api/apresentacao/midia/importar`
 * (importa por caminho de arquivo da máquina do controlador) e `PUT /video/<id>` (grava arquivo)
 * não passam por aqui: a 3001 aceitaria a importação por vir "da própria máquina".
 *
 * @param {import('express').Express} expressApp
 * @param {(ctx: string, err: unknown) => void} logError
 * @param {() => string} [getCtlHost] IP LAN do controlador ligado (socket)
 */
/** `X-Lyra-Via` (elo s→c, Entrega 1) para esta chamada ao 3001, ou null sem pareamento. Nunca lança. */
function viaDoElo(assinar, metodo, caminho) {
  if (typeof assinar !== 'function') return null;
  try { return assinar({ metodo, caminho }) || null; } catch (_) { return null; }
}

function attachProxyApresentacaoVideoAoControlador(expressApp, logError, getCtlHost, assinar = null) {
  expressApp.use((req, res, next) => {
    const ou = typeof req.originalUrl === 'string' ? req.originalUrl.split('?', 2)[0] : '';
    if (!PREFIXOS_APRESENTACAO.some((prefixo) => ou.startsWith(prefixo))) return next();

    const aval = avaliarRequisicaoProxy(req, 'apresentacao');
    if (!aval.ok) return responderRecusa(res, aval);

    let host = CTL_HOST_DEFAULT;
    try {
      const h = typeof getCtlHost === 'function' ? String(getCtlHost() || '').trim() : '';
      if (h) host = h;
    } catch (_) {
      // intencional — usa default
    }
    // IPv6 com zona / forma `::ffff:x.x.x.x` já normalizada no registro do socket
    if (host.startsWith('::ffff:')) host = host.slice(7);

    const outgoing = http.request(
      {
        hostname: host,
        port: CTL_PORT,
        path: aval.caminho,
        method: req.method,
        headers: cabecalhosParaControlador(req.headers, `${host}:${CTL_PORT}`, viaDoElo(assinar, req.method, aval.caminho)),
        /* GET/HEAD de vídeo pode demorar (Range + ficheiros grandes). */
        timeout: 0,
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
    // Telão/leitor que pula no vídeo cancela o pedido: o controlador para de ler o arquivo.
    res.on('close', () => {
      if (!res.writableEnded) outgoing.destroy();
    });

    outgoing.end();
    return undefined;
  });
}

module.exports = {
  attachProxyApresentacaoVideoAoControlador,
  CTL_HOST_DEFAULT,
  CTL_PORT,
};
