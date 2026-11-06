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
 *  2. `Origin` — só páginas do próprio Lyra, e nas portas do Lyra (3001 painel, 5510
 *     servidor, 5001 overlay do OBS). Uma página é aceita se for
 *       a) de loopback/localhost (o painel, em qualquer máquina), ou
 *       b) DESTA máquina: o nome dela ou um dos endereços IP das suas placas de rede, ou
 *       c) do MESMO host que a requisição está a usar (cabeçalho Host): o overlay do OBS
 *          servido pelo próprio Lyra, por NAT, VPN ou nome cadastrado, ou
 *       d) uma origem cadastrada em `LYRA_ORIGENS_PERMITIDAS` (esquema://host:porta exatos).
 *     Qualquer outra — incluindo IP privado, nome de máquina ou `.local` de TERCEIROS — é
 *     recusada: uma página servida por outro aparelho da rede não pode usar as APIs do
 *     operador só por estar na mesma rede. Origin externo nunca recebe cabeçalhos CORS.
 *
 * Origin ausente x Origin null (não confundir)
 * --------------------------------------------
 *  - AUSENTE: celular, processos Node, proxies do servidor — e as janelas `file://` do
 *    Electron, que (observado no Electron 29) não mandam Origin em fetch/XHR. Continuam
 *    atendidas; escrita marcada `Sec-Fetch-Site: cross-site` sem Origin é recusada.
 *  - `null`: iframes isolados e páginas `data:` de sites comuns. Nenhuma janela do Lyra a
 *    envia. É RECUSADA, em HTTP e no Socket.IO.
 *  - `file://`: o WebSocket das telas de projeção. Só vale no Socket.IO, como VISUALIZADOR:
 *    nunca ganha credencial, comando nem auto-inscrição (TOFU).
 *
 * Módulo puro (sem Express nem Socket.IO): devolve funções que os servidores plugam.
 */

const net = require('net');
const os = require('os');

/** Portas das páginas do Lyra que chamam as APIs: painel, servidor e overlay do OBS. */
const PORTAS_ORIGEM_PADRAO = Object.freeze([3001, 5510, 5001]);

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const METODOS_CORS = 'GET, PUT, POST, DELETE, OPTIONS';
const MAX_RECUSAS_REGISTRADAS = 200;
/** Por quanto tempo a lista de endereços das placas de rede é reaproveitada. */
const VALIDADE_ENDERECOS_MS = 10000;

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

/** localhost, 127.0.0.0/8, ::1 e IPv4 mapeado de loopback. */
function ehLoopback(host) {
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (net.isIPv4(host)) return host.startsWith('127.');
  if (!net.isIPv6(host)) return false;
  const v = host.toLowerCase();
  if (v === '::1') return true;
  const pontuado = /^::ffff:(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.exec(v);
  if (pontuado) return pontuado[1] === '127';
  const hex = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(v);
  if (hex) return (parseInt(hex[1], 16) >> 8) === 127;
  return false;
}

/** Endereços IP de todas as placas de rede desta máquina (sem a zona `%if` do IPv6). */
function enderecosDasPlacas() {
  const lista = [];
  try {
    for (const interfaces of Object.values(os.networkInterfaces())) {
      for (const i of interfaces || []) {
        if (i && i.address) lista.push(String(i.address).split('%')[0].toLowerCase());
      }
    }
  } catch (_) {
    /* sem a lista, só loopback e o nome da máquina valem */
  }
  return lista;
}

/**
 * @param {object} [opcoes]
 * @param {NodeJS.ProcessEnv} [opcoes.env]
 * @param {string} [opcoes.hostnameMaquina] nome desta máquina (padrão: `os.hostname()`)
 * @param {string[]} [opcoes.enderecosMaquina] IPs desta máquina (padrão: as placas de rede reais)
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

  const enderecosFixos = Array.isArray(opcoes.enderecosMaquina)
    ? new Set(opcoes.enderecosMaquina.map((e) => String(e).split('%')[0].toLowerCase()))
    : null;
  let cacheEnderecos = { quando: 0, conjunto: new Set() };

  /** Nomes e IPs desta máquina. As placas mudam (DHCP, VPN): a lista real é relida de vez em quando. */
  function hostPertenceAEstaMaquina(host) {
    if (host === nomeMaquina || host === `${nomeMaquina}.local`) return true;
    if (enderecosFixos) return enderecosFixos.has(host);
    const agora = Date.now();
    if (agora - cacheEnderecos.quando > VALIDADE_ENDERECOS_MS) {
      cacheEnderecos = { quando: agora, conjunto: new Set(enderecosDasPlacas()) };
    }
    return cacheEnderecos.conjunto.has(host);
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

  /** Nome de host aceito como destino (cabeçalho Host). */
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

  /**
   * @param {string|string[]|undefined} bruta valor do cabeçalho Origin
   * @param {{ hostHeader?: string }} [contexto] cabeçalho Host da MESMA requisição
   * @returns {{ tipo: 'ausente'|'permitida'|'opaca'|'negada', origin?: string, motivo?: string }}
   */
  function classificarOrigin(bruta, contexto = {}) {
    if (bruta === undefined) return { tipo: 'ausente' };
    if (typeof bruta !== 'string') return { tipo: 'negada', motivo: 'Origin repetido ou inválido' };
    if (bruta !== bruta.trim() || !bruta) return { tipo: 'negada', motivo: 'Origin vazio ou malformado' };
    if (bruta === 'null') return { tipo: 'negada', motivo: 'Origin null não é aceita' };
    if (bruta === 'file://') return { tipo: 'opaca', origin: bruta };

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
    // (d) cadastrada explicitamente: vale como está (esquema, host e porta exatos).
    if (origensExtras.has(url.origin)) return { tipo: 'permitida', origin: url.origin };

    const host = semPontoFinal(url.hostname.replace(/^\[|\]$/g, '').toLowerCase());
    const alvo = separarHostPorta(contexto && contexto.hostHeader);
    /* (c) só vale se o próprio Host da requisição for aceitável: sem isso, um domínio de DNS
       rebinding (Host e Origin iguais, os dois "evil.example") passaria nesta regra. */
    const doMesmoHost = !!alvo && alvo.host === host && classificarHost(contexto.hostHeader).ok;
    if (!(ehLoopback(host) || hostPertenceAEstaMaquina(host) || doMesmoHost)) { // (a) (b)
      return { tipo: 'negada', motivo: 'Origin de host que não é desta máquina nem da requisição' };
    }
    const porta = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (!PORTAS_ORIGEM_PADRAO.includes(porta)) {
      return { tipo: 'negada', motivo: 'Origin em porta que não é do Lyra' };
    }
    return { tipo: 'permitida', origin: url.origin };
  }

  /** `Origin: file://` — as telas de projeção (WebSocket). Só vale no Socket.IO, como visualizador. */
  function origemOpacaDoRequest(req) {
    const origem = req && req.headers ? req.headers.origin : undefined;
    return origem === 'file://';
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

  function aplicarCors(res, origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', METODOS_CORS);
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
    const origem = classificarOrigin(req.headers.origin, { hostHeader: req.headers.host });

    if (origem.tipo === 'negada') return recusar(req, res, 'origin', origem.motivo);
    if (origem.tipo === 'opaca') {
      return recusar(req, res, 'origin-opaca', 'Origin file:// só é aceita no Socket.IO');
    }

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

    aplicarCors(res, origem.origin);
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
    const origem = classificarOrigin(req.headers.origin, { hostHeader: req.headers.host });
    if (origem.tipo === 'negada') {
      registrarRecusa({ tipo: 'origin', motivo: origem.motivo, metodo: req.method, caminho: caminhoDe(req), host: req.headers.host, origin: req.headers.origin });
      return callback('Origem não autorizada', false);
    }
    return callback(null, true);
  }

  /**
   * Opção `cors` do Socket.IO (por requisição, para enxergar o Host): só origens permitidas
   * recebem cabeçalhos CORS. `file://` e ausente não precisam deles; as demais são recusadas
   * antes, no `allowRequest`.
   */
  function corsSocketIo() {
    return (req, callback) => {
      const origem = classificarOrigin(req.headers.origin, { hostHeader: req.headers.host });
      callback(null, { origin: origem.tipo === 'permitida' });
    };
  }

  return {
    classificarHost,
    classificarOrigin,
    origemOpacaDoRequest,
    middleware,
    allowRequest,
    corsSocketIo,
  };
}

module.exports = { criarProtecaoRede, PORTAS_ORIGEM_PADRAO };
