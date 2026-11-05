'use strict';

/**
 * Proteção de rede dos servidores do Lyra (E1.2): validação de `Host` e `Origin`.
 *
 * O problema que isto resolve
 * ---------------------------
 * Os servidores escutam em 0.0.0.0 e antes respondiam `Access-Control-Allow-Origin: *` a
 * qualquer um, sem olhar o `Host`. Resultado: QUALQUER página aberta num navegador da rede —
 * ou no próprio PC do operador — podia chamar a API (inclusive as rotas "só da própria
 * máquina", porque o navegador conecta de 127.0.0.1) e abrir WebSockets (que não sofrem
 * CORS). Duas defesas, aplicadas a todos os servidores:
 *
 *  1. `Host` — só IP literal, `localhost`, nomes sem ponto (nome de máquina), `*.local`,
 *     o nome desta máquina e o que estiver em `LYRA_HOSTS_PERMITIDOS`. Um domínio qualquer
 *     (o que o DNS rebinding precisa usar) é recusado.
 *  2. `Origin` — só as páginas do próprio Lyra: hosts locais/rede privada nas portas
 *     3001 (painel), 5510 (servidor) e 5001 (overlay do OBS), mais `LYRA_ORIGENS_PERMITIDAS`.
 *     Origin externo é recusado e nunca recebe cabeçalhos CORS.
 *
 * Clientes sem `Origin` (celular, processos Node, proxies do servidor) continuam passando:
 * não são navegadores, e um navegador sempre manda `Origin` em requisição de outro site que
 * escreve. As telas de projeção são carregadas por `file://` e mandam `Origin: null` — essa
 * origem "opaca" também é a de iframes isolados de qualquer página, então só vale para os
 * dois GET de leitura que as telas usam e, no Socket.IO, só como VISUALIZADOR (nunca ganha
 * credencial nem se auto-inscreve).
 *
 * Módulo puro (sem Express nem Socket.IO): devolve funções que os servidores plugam.
 */

const net = require('net');
const os = require('os');

/** Portas das páginas do Lyra que chamam as APIs: painel, servidor e overlay do OBS. */
const PORTAS_ORIGEM_PADRAO = Object.freeze([3001, 5510, 5001]);

/** Únicos caminhos que uma origem opaca (file://, null) pode ler — o que as telas usam. */
const CAMINHOS_ORIGEM_OPACA = Object.freeze(['/api/display-config', '/api/monitores']);

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const METODOS_CORS = 'GET, PUT, POST, DELETE, OPTIONS';
const MAX_RECUSAS_REGISTRADAS = 200;

function listaDoAmbiente(valor) {
  return String(valor || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function semPontoFinal(host) {
  return host.endsWith('.') ? host.slice(0, -1) : host;
}

const REGEX_HOSTNAME = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*$/;

/**
 * Separa `host[:porta]` de um cabeçalho Host, validando o formato.
 * @returns {{ host: string, porta: string } | null} `null` se malformado.
 */
function separarHostPorta(valor) {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  if (!v || v.length > 255) return null;
  let host;
  let porta = '';
  if (v.startsWith('[')) {
    const fim = v.indexOf(']');
    if (fim < 0) return null;
    host = v.slice(1, fim);
    const resto = v.slice(fim + 1);
    if (resto) {
      if (!/^:\d{1,5}$/.test(resto)) return null;
      porta = resto.slice(1);
    }
    if (!net.isIPv6(host)) return null;
  } else {
    const i = v.lastIndexOf(':');
    if (i >= 0) {
      host = v.slice(0, i);
      porta = v.slice(i + 1);
      if (!/^\d{1,5}$/.test(porta)) return null;
    } else {
      host = v;
    }
    if (host.includes(':')) return null;
  }
  if (porta && (Number(porta) < 1 || Number(porta) > 65535)) return null;
  host = semPontoFinal(host.toLowerCase());
  if (!host) return null;
  if (!net.isIP(host)) {
    if (!REGEX_HOSTNAME.test(host)) return null;
    if (host.split('.').some((rotulo) => rotulo.length > 63)) return null;
  }
  return { host, porta };
}

function ipv4Octetos(ip) {
  return ip.split('.').map(Number);
}

/** Loopback, redes privadas (RFC 1918), link-local e CGNAT (VPNs tipo Tailscale). */
function ehIpv4Local(ip) {
  const [a, b] = ipv4Octetos(ip);
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** ::1, link-local (fe80::/10), ULA (fc00::/7) e IPv4 mapeado de endereço local. */
function ehIpv6Local(ip) {
  const v = ip.toLowerCase();
  if (v === '::1') return true;
  const mapeadoPontuado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v);
  if (mapeadoPontuado) return ehIpv4Local(mapeadoPontuado[1]);
  const mapeadoHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (mapeadoHex) {
    const alto = parseInt(mapeadoHex[1], 16);
    const baixo = parseInt(mapeadoHex[2], 16);
    return ehIpv4Local(`${alto >> 8}.${alto & 255}.${baixo >> 8}.${baixo & 255}`);
  }
  const primeiro = v.split(':')[0];
  if (!primeiro) return false;
  const n = parseInt(primeiro, 16);
  if (!Number.isFinite(n)) return false;
  return (n >= 0xfe80 && n <= 0xfebf) || (n >= 0xfc00 && n <= 0xfdff);
}

/**
 * @param {object} [opcoes]
 * @param {NodeJS.ProcessEnv} [opcoes.env]
 * @param {string} [opcoes.hostnameMaquina] nome desta máquina (padrão: `os.hostname()`)
 * @param {(info: object) => void} [opcoes.registrar] chamado UMA vez por tipo de recusa distinta
 */
function criarProtecaoRede(opcoes = {}) {
  const env = opcoes.env || process.env;
  const registrar = typeof opcoes.registrar === 'function' ? opcoes.registrar : null;
  const nomeMaquina = semPontoFinal(String(opcoes.hostnameMaquina ?? os.hostname()).toLowerCase());

  const hostsExtras = new Set(listaDoAmbiente(env.LYRA_HOSTS_PERMITIDOS).map((h) => semPontoFinal(h.toLowerCase())));
  const origensExtras = new Set();
  for (const bruta of listaDoAmbiente(env.LYRA_ORIGENS_PERMITIDAS)) {
    try {
      const u = new URL(bruta);
      if (u.protocol === 'http:' || u.protocol === 'https:') origensExtras.add(u.origin);
    } catch (_) {
      /* entrada inválida: ignorada (nunca amplia a lista) */
    }
  }

  const recusasVistas = new Set();
  function registrarRecusa(info) {
    if (!registrar) return;
    const chave = `${info.tipo}|${info.motivo}|${info.host || ''}|${info.origin || ''}`;
    if (recusasVistas.has(chave) || recusasVistas.size >= MAX_RECUSAS_REGISTRADAS) return;
    recusasVistas.add(chave);
    try {
      registrar(info);
    } catch (_) {
      /* o registro nunca pode derrubar a requisição */
    }
  }

  /** Nome de host aceito como destino (cabeçalho Host) ou como origem de página do Lyra. */
  function nomeLocalAceito(host) {
    if (hostsExtras.has(host)) return true;
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (!host.includes('.')) return true; // nome de máquina (NetBIOS): um atacante não registra um
    if (host.endsWith('.local')) return true; // mDNS: reservado, não existe no DNS público
    return host === nomeMaquina || host === `${nomeMaquina}.local`;
  }

  /**
   * @returns {{ ok: true, host: string } | { ok: false, motivo: string }}
   */
  function classificarHost(hostHeader) {
    const h = separarHostPorta(hostHeader);
    if (!h) return { ok: false, motivo: 'Host ausente ou malformado' };
    // IP literal (qualquer um): não há DNS para sequestrar. O Origin é que filtra páginas.
    if (net.isIP(h.host)) return { ok: true, host: h.host };
    if (nomeLocalAceito(h.host)) return { ok: true, host: h.host };
    return { ok: false, motivo: 'Host não autorizado' };
  }

  function hostDeOrigemAceito(host) {
    const v4 = net.isIPv4(host);
    if (v4) return ehIpv4Local(host);
    if (net.isIPv6(host)) return ehIpv6Local(host);
    return nomeLocalAceito(host);
  }

  /**
   * @param {string|string[]|undefined} bruta valor do cabeçalho Origin
   * @returns {{ tipo: 'ausente'|'permitida'|'opaca'|'negada', origin?: string, motivo?: string }}
   */
  function classificarOrigin(bruta) {
    if (bruta === undefined) return { tipo: 'ausente' };
    if (typeof bruta !== 'string') return { tipo: 'negada', motivo: 'Origin repetido ou inválido' };
    if (bruta !== bruta.trim() || !bruta) return { tipo: 'negada', motivo: 'Origin vazio ou malformado' };
    if (bruta === 'null' || bruta === 'file://') return { tipo: 'opaca', origin: bruta };

    let url;
    try {
      url = new URL(bruta);
    } catch (_) {
      return { tipo: 'negada', motivo: 'Origin malformado' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { tipo: 'negada', motivo: 'Origin com esquema não permitido' };
    }
    if (url.username || url.password || url.origin !== bruta.toLowerCase()) {
      return { tipo: 'negada', motivo: 'Origin malformado' };
    }
    if (origensExtras.has(url.origin)) return { tipo: 'permitida', origin: url.origin };

    const host = semPontoFinal(url.hostname.replace(/^\[|\]$/g, '').toLowerCase());
    if (!hostDeOrigemAceito(host)) return { tipo: 'negada', motivo: 'Origin de host não local' };
    const porta = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (!PORTAS_ORIGEM_PADRAO.includes(porta)) {
      return { tipo: 'negada', motivo: 'Origin em porta que não é do Lyra' };
    }
    return { tipo: 'permitida', origin: url.origin };
  }

  function origemOpacaPermitida(metodo, caminho) {
    return METODOS_SEGUROS.has(String(metodo || '').toUpperCase()) && CAMINHOS_ORIGEM_OPACA.includes(caminho);
  }

  function origemOpacaDoRequest(req) {
    const origem = req && req.headers ? req.headers.origin : undefined;
    return origem === 'null' || origem === 'file://';
  }

  function caminhoDe(req) {
    if (typeof req.path === 'string') return req.path;
    try {
      return new URL(req.url || '/', 'http://x').pathname;
    } catch (_) {
      return '/';
    }
  }

  function recusar(req, res, tipo, motivo, extra = {}) {
    registrarRecusa({
      tipo,
      motivo,
      metodo: req.method,
      caminho: caminhoDe(req),
      host: req.headers.host,
      origin: req.headers.origin,
      ...extra,
    });
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, erro: `Requisição recusada: ${motivo}.` }));
  }

  function aplicarCors(res, origin, metodos) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', metodos);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    const vary = res.getHeader('Vary');
    res.setHeader('Vary', vary ? `${vary}, Origin` : 'Origin');
  }

  /** Middleware Express: instale ANTES de qualquer rota, arquivo estático ou leitor de corpo. */
  function middleware(req, res, next) {
    const host = classificarHost(req.headers.host);
    if (!host.ok) return recusar(req, res, 'host', host.motivo);

    const metodo = String(req.method || 'GET').toUpperCase();
    const origem = classificarOrigin(req.headers.origin);

    if (origem.tipo === 'negada') return recusar(req, res, 'origin', origem.motivo);

    if (origem.tipo === 'ausente') {
      if (!METODOS_SEGUROS.has(metodo) && String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
        return recusar(req, res, 'sec-fetch-site', 'escrita iniciada por outro site');
      }
      if (metodo === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
      }
      return next();
    }

    if (origem.tipo === 'opaca') {
      if (!origemOpacaPermitida(metodo, caminhoDe(req))) {
        return recusar(req, res, 'origin-opaca', 'origem opaca só pode ler a configuração das telas');
      }
      aplicarCors(res, origem.origin, 'GET, OPTIONS');
    } else {
      aplicarCors(res, origem.origin, METODOS_CORS);
    }
    if (metodo === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }
    return next();
  }

  /** `allowRequest` do Socket.IO/Engine.IO: vale para polling e para o upgrade de WebSocket. */
  function allowRequest(req, callback) {
    const host = classificarHost(req.headers.host);
    if (!host.ok) {
      registrarRecusa({ tipo: 'host', motivo: host.motivo, metodo: req.method, caminho: caminhoDe(req), host: req.headers.host, origin: req.headers.origin });
      return callback('Host não autorizado', false);
    }
    const origem = classificarOrigin(req.headers.origin);
    if (origem.tipo === 'negada') {
      registrarRecusa({ tipo: 'origin', motivo: origem.motivo, metodo: req.method, caminho: caminhoDe(req), host: req.headers.host, origin: req.headers.origin });
      return callback('Origem não autorizada', false);
    }
    return callback(null, true);
  }

  /** Opção `cors` do Socket.IO: só as origens do Lyra recebem cabeçalhos CORS. */
  function corsSocketIo() {
    return {
      origin: (origin, callback) => callback(null, classificarOrigin(origin).tipo !== 'negada'),
    };
  }

  return {
    classificarHost,
    classificarOrigin,
    origemOpacaPermitida,
    origemOpacaDoRequest,
    middleware,
    allowRequest,
    corsSocketIo,
  };
}

module.exports = { criarProtecaoRede, PORTAS_ORIGEM_PADRAO, CAMINHOS_ORIGEM_OPACA };
