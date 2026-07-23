'use strict';

const http = require('http');

const { CTL_HOST, CTL_PORT } = require('./proxyMusicaAoControlador');

function getJson(pathname) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: CTL_HOST,
        port: CTL_PORT,
        path: pathname,
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeout: 8000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            resolve(null);
            return;
          }
          try {
            const txt = Buffer.concat(chunks).toString('utf8');
            resolve(JSON.parse(txt));
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

/**
 * Carrega música do controlador local (SQLite) quando o cliente só manda `{ musicaId, estrofeIndex }`.
 * Tenta primeiro banco utilizador, depois catálogo.
 *
 * @param {number} idNum
 */
async function fetchMusicaByIdParaProjecao(idNum) {
  if (!Number.isFinite(idNum) || idNum <= 0) return null;

  let m = await getJson(`/api/musicas/${idNum}`);
  if (m && Array.isArray(m.estrofes) && m.estrofes.length) return m;

  m = await getJson(`/api/musicas/${idNum}?fonte=catalog`);
  if (m && Array.isArray(m.estrofes) && m.estrofes.length) return m;

  return null;
}

module.exports = { fetchMusicaByIdParaProjecao };
