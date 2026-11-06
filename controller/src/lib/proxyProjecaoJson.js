'use strict';

/**
 * Salto 3001 → 5510 do `PUT /api/display-config[/preview]` (E1.3 Fase B).
 *
 * Quando o Controlador repassa a chamada ao Servidor, leva a credencial que o PRÓPRIO CLIENTE
 * mandou (`X-Lyra-Device` / `X-Lyra-Secret` / `X-Lyra-App`): não há autenticação interna
 * improvisada, e quem não tem credencial continua sem ela. A credencial só vai para servidores
 * do Lyra (loopback, rede privada, nomes locais); nunca para um host público. Este módulo não
 * registra nada em log e não lê o ambiente.
 */

const http = require('http');
const https = require('https');

const MAX_CREDENCIAL = 256;
const MAX_VERSAO_APP = 24;

function cabecalho(req, nome) {
  const v = req && req.headers ? req.headers[nome] : undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s.trim() : '';
}

function limpo(valor, max) {
  // eslint-disable-next-line no-control-regex
  if (!valor || /[\u0000-\u001f\u007f]/.test(valor)) return '';
  return valor.slice(0, max);
}

/** Credencial do cliente da requisição (strings vazias se ausente ou suspeita). */
function credenciaisDoRequest(req) {
  return {
    deviceId: limpo(cabecalho(req, 'x-lyra-device'), MAX_CREDENCIAL),
    secret: limpo(cabecalho(req, 'x-lyra-secret'), MAX_CREDENCIAL),
    app: limpo(cabecalho(req, 'x-lyra-app'), MAX_VERSAO_APP),
  };
}

/** Destino que pode receber credencial do Lyra: loopback, rede privada, `.local` ou nome simples. */
function ehServidorDoLyra(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (h === 'localhost' || h === '::1' || h.endsWith('.localhost')) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (h.includes(':')) return /^(fc|fd|fe80)/.test(h); // IPv6 ULA / link-local
  if (h.endsWith('.local')) return true;
  return !h.includes('.'); // nome de uma etiqueta só (ex.: PC da rede local)
}

/**
 * @param {{deviceId?: string, secret?: string, app?: string}|undefined} cred
 * @param {URL} base destino (servidor de projeção)
 * @param {number} tamanhoCorpo
 */
function cabecalhosParaProjecao(cred, base, tamanhoCorpo) {
  const h = {
    'Content-Type': 'application/json',
    'Content-Length': tamanhoCorpo,
  };
  if (cred && cred.deviceId && cred.secret && ehServidorDoLyra(base && base.hostname)) {
    h['X-Lyra-Device'] = cred.deviceId;
    h['X-Lyra-Secret'] = cred.secret;
    if (cred.app) h['X-Lyra-App'] = cred.app;
  }
  return h;
}

/**
 * Encaminha JSON ao servidor de projeção (5510) quando o controlador não tem socket ligado.
 * @param {string} method
 * @param {string} pathname
 * @param {object|null} jsonBody
 * @param {{deviceId?: string, secret?: string, app?: string}} [cred] credencial do cliente
 * @param {{ base: URL }} opcoes destino (a 3001 passa o `SERVER_URL` configurado)
 */
function proxyJsonToProjection(method, pathname, jsonBody, cred, opcoes) {
  const base = opcoes.base;
  const bodyBuf = jsonBody !== null && jsonBody !== undefined ? Buffer.from(JSON.stringify(jsonBody), 'utf8') : Buffer.alloc(0);
  const port = base.port ? Number(base.port) : base.protocol === 'https:' ? 443 : 80;
  const lib = base.protocol === 'https:' ? https : http;
  const opts = {
    hostname: base.hostname.replace(/^\[|\]$/g, ''),
    port,
    path: pathname,
    method,
    headers: cabecalhosParaProjecao(cred, base, bodyBuf.length),
  };
  return new Promise((resolve, reject) => {
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode || 500, headers: res.headers, body: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
    if (bodyBuf.length) req.write(bodyBuf);
    req.end();
  });
}

module.exports = { proxyJsonToProjection, credenciaisDoRequest, cabecalhosParaProjecao, ehServidorDoLyra };
