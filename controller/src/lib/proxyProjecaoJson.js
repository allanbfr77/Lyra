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
const { contextoLocal } = require('@lyra/projection-core').credencialInterna;

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

/**
 * Credencial do cliente da requisição (strings vazias se ausente ou suspeita).
 *
 * A credencial INTERNA do painel (arquitetura W, injetada pelo processo principal) vale só nesta
 * máquina e nunca sai dela: o salto 3001→5510 pode ir a um Servidor em outro PC, e repassá-la
 * entregaria o segredo e transformaria o proxy numa fonte de autorização. Se o `deviceId` for o
 * interno, nada é repassado.
 *
 * @param {object} req
 * @param {{interna?: {ehDeviceInterno: (id: string) => boolean}|null}} [opcoes]
 */
function credenciaisDoRequest(req, opcoes) {
  const cred = {
    deviceId: limpo(cabecalho(req, 'x-lyra-device'), MAX_CREDENCIAL),
    secret: limpo(cabecalho(req, 'x-lyra-secret'), MAX_CREDENCIAL),
    app: limpo(cabecalho(req, 'x-lyra-app'), MAX_VERSAO_APP),
  };
  const interna = opcoes && opcoes.interna;
  if (interna && cred.deviceId && interna.ehDeviceInterno(cred.deviceId)) {
    return { deviceId: '', secret: '', app: '' };
  }
  return cred;
}

/**
 * Credencial a levar no salto 3001→5510.
 *
 * - Dispositivo comum: a que o cliente mandou (como na Fase B).
 * - Credencial INTERNA do painel: só segue se o destino é o motor de projeção LOCAL deste mesmo
 *   processo (`destinoEhMotorLocal`: ativo, loopback, porta 5510 — decidido por quem chama), se
 *   ela confere de verdade e se a requisição é do contexto local (loopback, sem marca de proxy).
 *   Em qualquer outro caso nada é repassado: o proxy não entrega o segredo a outro PC nem a outro
 *   processo, e não vira fonte de autorização para outros dispositivos.
 *
 * @param {object} req
 * @param {{interna?: object|null, base?: URL, destinoEhMotorLocal?: boolean}} [opcoes]
 */
function credenciaisParaSalto(req, opcoes) {
  const o = opcoes || {};
  const bruta = credenciaisDoRequest(req);
  const interna = o.interna;
  if (!interna || !bruta.deviceId || !interna.ehDeviceInterno(bruta.deviceId)) return bruta;
  if (o.destinoEhMotorLocal === true && interna.conferir(bruta) && contextoLocal(req)) return bruta;
  return { deviceId: '', secret: '', app: '' };
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

module.exports = {
  proxyJsonToProjection,
  credenciaisDoRequest,
  credenciaisParaSalto,
  cabecalhosParaProjecao,
  ehServidorDoLyra,
};
