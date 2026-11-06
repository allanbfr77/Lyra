'use strict';

/**
 * Autenticação das APIs HTTP do Lyra (E1.3).
 *
 * O problema
 * ----------
 * Só o Socket.IO exige credencial (`deviceId` + `secret`, conferidos na allowlist). As rotas
 * HTTP das portas 3001 e 5510 não exigem nada: a E1.2 barra navegadores de terceiros
 * (Host/Origin), mas um cliente que não é navegador — curl, script, qualquer aparelho da LAN —
 * passa e comanda tudo.
 *
 * O que este módulo faz NA FASE A
 * -------------------------------
 * NADA É BLOQUEADO. O middleware lê `X-Lyra-Device` / `X-Lyra-Secret`, pergunta ao
 * verificador PURO (`controleAcesso.verificarCredencial`: não inscreve, não grava, não
 * notifica) e REGISTRA o que seria recusado quando a autenticação for obrigatória. Com o
 * registro de um culto real dá para saber, antes de impor, quais clientes (painel, celular,
 * versões antigas do app) ainda não mandam credencial.
 *
 * Modos
 * -----
 *  - `desligado`: não faz nada (comportamento idêntico ao anterior à E1.3).
 *  - `registrar`: avalia e registra; sempre deixa a requisição seguir. É o único usado.
 *  - `impor`: recusa (401 sem/ com credencial inválida; 403 pendente). Existe e é testado,
 *    mas NENHUM servidor o liga nesta fase.
 *
 * Políticas de rota (ver `classificarRota`)
 * -----------------------------------------
 *  publica · leitura · escrita · comando · loopback-estrito
 *
 * Segurança do registro: o `secret` nunca é registrado; o `deviceId` sai truncado; o caminho
 * não inclui a query string e é limitado; eventos iguais são deduplicados e há um teto.
 *
 * Fora do escopo desta fase (de propósito): HMAC `X-Lyra-Via` entre 5510 e 3001, write-lock
 * por dispositivo nos comandos, qualquer mudança em TOFU ou no Socket.IO.
 */

const path = require('path');

const MODOS = new Set(['desligado', 'registrar', 'impor']);
const MAX_REGISTROS_PADRAO = 500;
const MAX_CAMINHO_REGISTRADO = 120;
const MAX_CREDENCIAL = 256;
const MAX_VERSAO_APP = 24;

/**
 * Política por contexto (C1): carregada sob demanda e protegida. Se o módulo (ou o manifesto que
 * ele lê) falhar ao carregar, só o REGISTRO de decisões fica indisponível; a autenticação não é afetada.
 */
let politicaCarregada;
function carregarPolitica() {
  if (politicaCarregada === undefined) {
    try {
      politicaCarregada = require('./politicaRotas');
    } catch (_) {
      politicaCarregada = null;
    }
  }
  return politicaCarregada;
}

/* ───────────────────────── classificação de rotas ───────────────────────── */

/**
 * Normaliza o caminho para classificar: sem query, decodificado, com `.`/`..`/`//` resolvidos
 * e em minúsculas (o Express casa rotas sem diferenciar maiúsculas). Assim uma rota crítica
 * não é rebaixada por um caminho "enfeitado".
 */
function normalizarCaminho(bruto) {
  let p = String(bruto || '/');
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  const h = p.indexOf('#');
  if (h >= 0) p = p.slice(0, h);
  try {
    p = decodeURIComponent(p);
  } catch (_) {
    /* percent-encoding inválido: classifica como veio */
  }
  p = p.replace(/\\/g, '/');
  p = path.posix.normalize(`/${p}`).toLowerCase();
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

const ROTAS_LOOPBACK_ESTRITO = [
  /^\/api\/controladores(\/|$)/,
  /^\/api\/internal(\/|$)/,
  /^\/api\/docs(\/|$)/,
  /^\/api\/apresentacao\/midia\/importar$/,
  /^\/api\/sync\/banco\/pedido\/(aceitar|recusar)$/,
];

/**
 * @param {string} metodo
 * @param {string} caminho caminho (com ou sem query)
 * @returns {'publica'|'leitura'|'escrita'|'comando'|'loopback-estrito'}
 */
function classificarRota(metodo, caminho) {
  const m = String(metodo || 'GET').toUpperCase();
  const p = normalizarCaminho(caminho);
  const leituraSegura = m === 'GET' || m === 'HEAD';

  if (p !== '/api' && !p.startsWith('/api/')) return 'publica'; // páginas, estáticos, /obs, /socket.io, /vosk-model
  if (m === 'OPTIONS') return 'publica'; // preflight não carrega credencial

  if (ROTAS_LOOPBACK_ESTRITO.some((r) => r.test(p))) return 'loopback-estrito';
  if (leituraSegura && p === '/api/sync/banco/pedido') return 'loopback-estrito';

  if (p === '/api/identity' && leituraSegura) return 'publica'; // usada antes do handshake
  // Webhook da INVB: quem chama é o servidor da INVB, que não tem credencial de dispositivo. Tem
  // segredo próprio (fail-closed, comparação em tempo constante — E1.1). Só este caminho exato.
  if (m === 'POST' && p === '/api/tom-memoria/webhook-invb') return 'publica';
  if (p.startsWith('/api/comando/')) return 'comando';
  // Mídia da apresentação: <video>/<audio> não enviam cabeçalhos customizados. Fica pública
  // por ora — risco residual registrado no relatório da E1.3.
  if (leituraSegura && /^\/api\/apresentacao\/(video|midia)\//.test(p)) return 'publica';

  return leituraSegura ? 'leitura' : 'escrita';
}

/* ───────────────────────── utilitários ───────────────────────── */

function ipDoRequest(req) {
  const bruto = String((req && req.socket && req.socket.remoteAddress) || '').trim();
  return bruto.startsWith('::ffff:') ? bruto.slice(7) : bruto;
}

function ehLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1';
}

function cabecalho(req, nome) {
  const v = req && req.headers ? req.headers[nome] : undefined;
  if (Array.isArray(v)) return String(v[0] || '');
  return typeof v === 'string' ? v : '';
}

function deviceTruncado(deviceId) {
  const id = String(deviceId || '');
  if (!id) return '';
  return `${id.slice(0, 8)}…`;
}

function versaoSaneada(valor) {
  return String(valor || '').replace(/[^\w.-]/g, '').slice(0, MAX_VERSAO_APP);
}

function caminhoParaRegistro(req) {
  let p = typeof req.path === 'string' && req.path ? req.path : String(req.originalUrl || req.url || '/');
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  return p.length > MAX_CAMINHO_REGISTRADO ? `${p.slice(0, MAX_CAMINHO_REGISTRADO)}…` : p;
}

/** Troca ids no caminho por `:id` para a deduplicação não ser furada por /api/musicas/1, /2, … */
function caminhoParaChave(p) {
  return normalizarCaminho(p)
    .split('/')
    .map((seg) => (/^\d+$/.test(seg) || seg.length > 24 || /^[0-9a-f-]{16,}$/.test(seg) ? ':id' : seg))
    .join('/');
}

/* ───────────────────────── fábrica ───────────────────────── */

/**
 * @param {object} [opcoes]
 * @param {'desligado'|'registrar'|'impor'} [opcoes.modo] inválido → 'registrar'
 * @param {string} [opcoes.contexto] 'servidor-5510' | 'controlador-3001' | 'local-5510'
 * @param {(auth: {deviceId: string, secret: string}) => ({ok: boolean, classe: string}|null|undefined)} [opcoes.verificar]
 *        Verificador puro. Pode devolver null/undefined (ainda indisponível → "nao-verificavel").
 * @param {(evento: object) => void} [opcoes.registrar] recebe cada evento novo (deduplicado)
 * @param {(evento: object) => void} [opcoes.registrarDecisao] (C1) recebe as decisões de POLÍTICA por
 *        contexto: classe, credencial esperada, motivo de uma recusa futura. Só observa; nunca bloqueia.
 * @param {number} [opcoes.maxRegistros]
 */
function criarAutenticacaoHttp(opcoes = {}) {
  const modo = MODOS.has(opcoes.modo) ? opcoes.modo : 'registrar';
  const contexto = String(opcoes.contexto || 'desconhecido');
  const verificar = typeof opcoes.verificar === 'function' ? opcoes.verificar : null;
  const registrarFn = typeof opcoes.registrar === 'function' ? opcoes.registrar : null;
  const maxRegistros = Number.isFinite(opcoes.maxRegistros) ? opcoes.maxRegistros : MAX_REGISTROS_PADRAO;

  /** chave -> { total, evento } — alimenta o resumo e a deduplicação. */
  const vistos = new Map();

  /* ── C1: registro das decisões de política (somente observação) ── */
  const registrarDecisaoFn = typeof opcoes.registrarDecisao === 'function' ? opcoes.registrarDecisao : null;
  const politica = registrarDecisaoFn ? carregarPolitica() : null;
  /** chave -> resumo de TODAS as decisões (inclusive as que não geram evento). */
  const decisoes = new Map();
  /** chaves de decisão «interessantes» já enviadas a `registrarDecisao`. */
  const decisoesEmitidas = new Set();

  function tipoApresentado(c) {
    if (c.ok === null) return 'nao-verificavel';
    if (c.classe === 'ausente') return 'ausente';
    if (c.classe === 'interna') return 'interna';
    if (c.ok === true) return 'dispositivo-autorizado';
    return `dispositivo-${c.classe}`;
  }

  /** O que a CLASSE ATUAL (a que `impor` usaria hoje) faria; informativo, não decide nada. */
  function recusariaPelaClasseAtual(classeAtual, c, proxificada, loopback) {
    if (classeAtual === 'publica') return false;
    if (classeAtual === 'loopback-estrito') return proxificada || !loopback;
    return c.ok !== true;
  }

  function observarPolitica(req) {
    const metodo = String(req.method || 'GET').toUpperCase();
    const d = politica.avaliarRota(contexto, metodo, req.originalUrl || req.url || req.path);
    if (d.origem === 'contexto-desconhecido') return;
    const c = avaliarCredencial(req);
    const proxificada = cabecalho(req, 'x-lyra-proxy') === '1';
    const ip = ipDoRequest(req);
    const loopback = ehLoopback(ip);
    const tipo = tipoApresentado(c);
    const mot = politica.motivoRecusaFutura(d, { tipo, proxificada, loopback });
    const deviceId = deviceTruncado(c.deviceId);
    const caminho = caminhoParaRegistro(req);
    const chave = [d.id || `?${caminhoParaChave(caminho)}`, metodo, tipo, deviceId, proxificada ? 'p' : '', loopback ? 'l' : ''].join('|');

    const existente = decisoes.get(chave);
    if (existente) existente.total += 1;
    else if (decisoes.size < maxRegistros) {
      decisoes.set(chave, {
        total: 1, contexto, id: d.id, metodo, caminho, politica: d.politica, apresentada: tipo, deviceId,
        recusaria: mot.recusaria, proxificada, alcancavelPorProxy: !!d.alcancavelPorProxy,
      });
    }

    const interessante = !d.encontrada || mot.recusaria !== false || d.divergeDaClasseAtual === true || (d.proxy && d.proxy.atravessa === false);
    if (!interessante || decisoesEmitidas.has(chave) || decisoesEmitidas.size >= maxRegistros) return;
    decisoesEmitidas.add(chave);

    const evento = {
      evento: 'politica-http',
      modo,
      contexto,
      metodo,
      caminho,
      rota: { id: d.id, tipo: d.tipo, origem: d.origem, classe: d.classe, classeAtual: d.classeAtual, politica: d.politica },
      esperada: d.esperada || null,
      saida: d.saida || null,
      apresentada: { tipo, deviceId, appVersao: versaoSaneada(cabecalho(req, 'x-lyra-app')) },
      motivoFuturo: mot.motivo,
      recusariaEmImpor: mot.recusaria,
      credencialInexistente: mot.credencialInexistente,
      divergeDaClasseAtual: d.divergeDaClasseAtual === undefined ? null : d.divergeDaClasseAtual,
      seriaRecusadaPelaClasseAtual: recusariaPelaClasseAtual(d.classeAtual, c, proxificada, loopback),
      proxificada,
      alcancavelPorProxy: !!d.alcancavelPorProxy,
      ip,
      origemDaDecisao: d.encontrada ? `manifesto:${d.id}` : d.origem,
      ...(d.proxy ? { proxy: d.proxy } : {}),
    };
    try {
      registrarDecisaoFn(evento);
    } catch (_) {
      /* o registro nunca pode derrubar a requisição */
    }
  }

  function avaliarCredencial(req) {
    const deviceId = cabecalho(req, 'x-lyra-device').trim().slice(0, MAX_CREDENCIAL);
    const secret = cabecalho(req, 'x-lyra-secret').trim().slice(0, MAX_CREDENCIAL);
    if (!deviceId || !secret) return { deviceId, ok: false, classe: 'ausente' };
    let r = null;
    try {
      // `req` vai junto para o verificador poder restringir ao contexto local (credencial
      // interna do painel); os verificadores da allowlist ignoram o segundo argumento.
      r = verificar ? verificar({ deviceId, secret }, req) : null;
    } catch (_) {
      r = null;
    }
    if (!r || typeof r !== 'object') return { deviceId, ok: null, classe: 'nao-verificavel' };
    return { deviceId, ok: !!r.ok, classe: String(r.classe || (r.ok ? 'autorizado' : 'desconhecido')) };
  }

  function registrarEvento(evento, chaveExtra) {
    const chave = [
      contexto, evento.politica, evento.metodo, caminhoParaChave(evento.caminho),
      evento.classe, evento.deviceId, evento.ip, evento.proxificada ? 'p' : '',
      chaveExtra || '',
    ].join('|');
    const existente = vistos.get(chave);
    if (existente) {
      existente.total += 1;
      return;
    }
    if (vistos.size >= maxRegistros) return;
    vistos.set(chave, { total: 1, evento });
    if (!registrarFn) return;
    try {
      registrarFn(evento);
    } catch (_) {
      /* o registro nunca pode derrubar a requisição */
    }
  }

  function montarEvento(req, politica, extra) {
    const app = cabecalho(req, 'x-lyra-app');
    return {
      evento: 'http-auth',
      modo,
      contexto,
      politica,
      metodo: String(req.method || 'GET').toUpperCase(),
      caminho: caminhoParaRegistro(req),
      deviceId: '',
      classe: 'ausente',
      ip: ipDoRequest(req),
      temXLyraApp: !!app,
      appVersao: versaoSaneada(app),
      // Declarada pelo proxy 5510→3001; qualquer cliente pode forjá-la, então serve só de pista.
      proxificada: cabecalho(req, 'x-lyra-proxy') === '1',
      seriaRecusada: true,
      ...extra,
    };
  }

  function recusarImpor(res, classe) {
    const pendente = classe === 'pendente';
    res.statusCode = pendente ? 403 : 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: false,
      erro: pendente ? 'Dispositivo aguardando aprovação.' : 'Credencial do dispositivo ausente ou inválida.',
      motivo: classe,
    }));
  }

  function recusarLoopback(res) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, erro: 'Esta operação só é permitida a partir da própria máquina.', motivo: 'somente-local' }));
  }

  function middleware(req, res, next) {
    if (modo === 'desligado') return next();

    if (politica) {
      try {
        observarPolitica(req);
      } catch (_) {
        /* a observação de política nunca altera o fluxo da requisição */
      }
    }

    let decisao = { liberar: true };
    try {
      const politica = classificarRota(req.method, req.originalUrl || req.url || req.path);
      if (politica === 'publica') return next();

      if (politica === 'loopback-estrito') {
        const ip = ipDoRequest(req);
        const proxificada = cabecalho(req, 'x-lyra-proxy') === '1';
        // Estas rotas são decididas pela guarda da própria rota (IP de loopback). Uma requisição
        // proxificada chega da própria máquina (é o proxy 5510→3001), então a guarda por IP
        // não prova nada; e de fora da máquina a guarda não deveria nem ser alcançada. Em
        // `registrar` só se registra; em `impor` recusa-se (credencial não substitui a guarda:
        // estas rotas são da própria máquina, não de dispositivos remotos).
        const contorno = proxificada ? 'proxificada-em-rota-local' : !ehLoopback(ip) ? 'nao-loopback' : null;
        if (contorno) {
          registrarEvento(montarEvento(req, politica, { classe: contorno }));
          if (modo === 'impor') return recusarLoopback(res);
        }
        return next();
      }

      const c = avaliarCredencial(req);
      const aceita = c.ok === true;
      if (!aceita) {
        registrarEvento(
          montarEvento(req, politica, {
            deviceId: deviceTruncado(c.deviceId),
            classe: c.classe,
            seriaRecusada: c.ok === null ? null : true,
          })
        );
      }
      if (modo === 'impor' && c.ok !== true) decisao = { liberar: false, classe: c.classe };
    } catch (_) {
      /* falha interna do registro: a requisição segue como se o módulo não existisse */
      decisao = { liberar: true };
    }

    if (!decisao.liberar) return recusarImpor(res, decisao.classe);
    return next();
  }

  /** Contagem acumulada por evento distinto (inclui as repetições que a deduplicação omitiu). */
  function resumo() {
    return [...vistos.values()].map(({ total, evento }) => ({
      total,
      contexto: evento.contexto,
      politica: evento.politica,
      metodo: evento.metodo,
      caminho: evento.caminho,
      classe: evento.classe,
      deviceId: evento.deviceId,
      ip: evento.ip,
      temXLyraApp: evento.temXLyraApp,
      appVersao: evento.appVersao,
      proxificada: evento.proxificada,
    }));
  }

  /** Contagem de TODAS as decisões de política (inclusive as que não geraram evento). */
  function resumoPolitica() {
    return [...decisoes.values()].map((x) => ({ ...x }));
  }

  return { middleware, modo, resumo, resumoPolitica };
}

module.exports = { criarAutenticacaoHttp, classificarRota, normalizarCaminho, MODOS };
