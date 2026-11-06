'use strict';

/**
 * Pareamento do elo interprocessos (Entrega 1).
 *
 * Como duas instalações (Controlador e Servidor, no mesmo PC ou em PCs diferentes) passam a
 * compartilhar uma chave SEM que ela trafegue — e sem TLS na LAN:
 *
 *   1. O Controlador gera um par X25519 efêmero e envia só a chave PÚBLICA (`solicitar`).
 *   2. O Servidor gera o dele, responde com a chave pública, calcula o segredo compartilhado
 *      (ECDH) e deriva um CÓDIGO de 6 dígitos (SAS) do segredo + transcrição inteira.
 *   3. O Controlador calcula o mesmo segredo e o mesmo código. Os DOIS operadores veem o código
 *      (Servidor: pedido de aprovação; Controlador: aviso) e o comparam. Um atacante no meio
 *      (que troca as chaves públicas) produz códigos DIFERENTES nos dois lados.
 *   4. O operador do SERVIDOR aprova (ou nega). Só então o Servidor deriva e guarda a chave
 *      (HKDF) e passa a responder `aprovado` com um MAC de confirmação (prova de que conhece o
 *      segredo; sem enviar a chave).
 *   5. O Controlador confere o MAC e deriva a MESMA chave. MAC errado → nada é guardado.
 *
 * Passivamente (LAN com sniffer) nada útil trafega: chaves públicas, ids e um MAC.
 * Este módulo é PURO (sem rede e sem disco além do armazém injetado).
 */

const crypto = require('crypto');

const RE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const TTL_PADRAO_MS = 120000;
const MAX_PENDENTES_PADRAO = 3;
const COOLDOWN_IP_PADRAO_MS = 5000;
const MAX_NOME = 60;

/* ───────────────────────── primitivas ───────────────────────── */

/** Par X25519 efêmero: `publica` = SPKI DER em base64url; `privada` = KeyObject. */
function gerarParDeChaves() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  return { publica: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'), privada: privateKey };
}

function importarPublica(b64) {
  if (typeof b64 !== 'string' || b64.length < 40 || b64.length > 120 || !/^[A-Za-z0-9_-]+$/.test(b64)) return null;
  try {
    const k = crypto.createPublicKey({ key: Buffer.from(b64, 'base64url'), format: 'der', type: 'spki' });
    return k.asymmetricKeyType === 'x25519' ? k : null;
  } catch (_) {
    return null;
  }
}

/** Segredo compartilhado (32 bytes). Lança se a chave pública for inválida. */
function acordo(privada, publicaOutra) {
  const pub = importarPublica(publicaOutra);
  if (!pub) throw new Error('chave pública inválida');
  return crypto.diffieHellman({ privateKey: privada, publicKey: pub });
}

const hkdf = (segredo, sal, info) => Buffer.from(crypto.hkdfSync('sha256', segredo, sal, info, 32));

function transcricao({ pairingId, idControlador, idServidor, pubC, pubS }) {
  return crypto.createHash('sha256').update(['lyra-pareamento-v1', pairingId, idControlador, idServidor, pubC, pubS].join('\n')).digest();
}

/** Chave de longo prazo do elo. */
function derivarChave({ segredo, ...t }) {
  return hkdf(segredo, transcricao(t), 'lyra-elo-chave-v1');
}

/** Código de 6 dígitos («123-456») para os dois operadores compararem. */
function codigoSas({ segredo, ...t }) {
  const n = hkdf(segredo, transcricao(t), 'lyra-elo-sas-v1').readUInt32BE(0) % 1000000;
  const s = String(n).padStart(6, '0');
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

/** Prova de que o Servidor conhece o segredo e aprovou (não revela a chave). */
function macConfirmacao({ segredo, kid, ...t }) {
  return crypto.createHmac('sha256', hkdf(segredo, transcricao(t), 'lyra-elo-confirmacao-v1')).update(`aprovado\n${kid}`).digest('base64url');
}

function igual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function nomeSeguro(n) {
  // eslint-disable-next-line no-control-regex
  return String(n === undefined || n === null ? '' : n).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOME);
}

/* ───────────────────────── Servidor ───────────────────────── */

/**
 * @param {object} p
 * @param {ReturnType<import('./eloChaves').criarArmazemChaves>} p.armazem
 * @param {(pedido: {pairingId: string, nome: string, ip: string, codigo: string, expiraEm: number}) => void} [p.aoSolicitar]
 *        avisa o operador (diálogo/UI); falhar aqui NUNCA impede o pedido
 * @param {() => number} [p.agora]
 */
function criarServicoPareamentoServidor({
  armazem, aoSolicitar = () => {}, agora = Date.now, ttlMs = TTL_PADRAO_MS, maxPendentes = MAX_PENDENTES_PADRAO, cooldownPorIpMs = COOLDOWN_IP_PADRAO_MS, gracaRotacaoMs = 60000,
}) {
  /** pairingId -> registro */
  const pedidos = new Map();
  /** ip -> último pedido (ms) */
  const ultimoPorIp = new Map();

  function expirar() {
    const t = agora();
    for (const [id, p] of pedidos) {
      if (p.estado === 'pendente' && t >= p.expiraEm) { p.estado = 'expirado'; p.privada = null; p.segredo = null; }
      if (t >= p.expiraEm + ttlMs * 2) pedidos.delete(id);
    }
    for (const [ip, ate] of ultimoPorIp) if (t - ate > Math.max(cooldownPorIpMs, 60000)) ultimoPorIp.delete(ip);
  }

  const pendentes = () => [...pedidos.values()].filter((p) => p.estado === 'pendente');

  function solicitar({ idControlador, nome, ip, publica }) {
    expirar();
    if (!RE_ID.test(String(idControlador)) || !importarPublica(publica)) return { ok: false, motivo: 'invalido' };
    const t = agora();
    const chaveIp = String(ip || '');
    if (cooldownPorIpMs > 0 && ultimoPorIp.has(chaveIp) && t - ultimoPorIp.get(chaveIp) < cooldownPorIpMs) return { ok: false, motivo: 'muito-rapido' };
    if (pendentes().length >= maxPendentes) return { ok: false, motivo: 'ocupado' };
    ultimoPorIp.set(chaveIp, t);

    const par = gerarParDeChaves();
    const idServidor = armazem.idLocal();
    const pairingId = crypto.randomBytes(16).toString('base64url');
    const segredo = acordo(par.privada, publica);
    const ctx = { pairingId, idControlador, idServidor, pubC: publica, pubS: par.publica };
    const reg = {
      pairingId, idControlador, idServidor, pubC: publica, pubS: par.publica, nome: nomeSeguro(nome), ip: chaveIp,
      codigo: codigoSas({ segredo, ...ctx }), segredo, privada: par.privada, estado: 'pendente', criadoEm: t, expiraEm: t + ttlMs,
      tokenCancelamento: crypto.randomBytes(16).toString('base64url'), kid: null, confirmacao: null,
    };
    pedidos.set(pairingId, reg);
    try {
      aoSolicitar({ pairingId, nome: reg.nome, ip: reg.ip, codigo: reg.codigo, expiraEm: reg.expiraEm });
    } catch (_) {
      /* a UI falhou: o pedido continua válido e pode ser decidido por outro caminho */
    }
    return { ok: true, pairingId, idServidor, publicaServidor: reg.pubS, tokenCancelamento: reg.tokenCancelamento, expiraEm: reg.expiraEm };
  }

  function consultar(pairingId) {
    expirar();
    const p = pedidos.get(String(pairingId));
    if (!p) return { estado: 'desconhecido' };
    if (p.estado === 'aprovado') return { estado: 'aprovado', kid: p.kid, confirmacao: p.confirmacao };
    return { estado: p.estado };
  }

  function decidir(pairingId, aprovar) {
    expirar();
    const p = pedidos.get(String(pairingId));
    if (!p || p.estado !== 'pendente') return false;
    if (!aprovar) {
      p.estado = 'negado'; p.privada = null; p.segredo = null;
      return true;
    }
    const kid = crypto.randomBytes(12).toString('base64url');
    const ctx = { pairingId: p.pairingId, idControlador: p.idControlador, idServidor: p.idServidor, pubC: p.pubC, pubS: p.pubS };
    const chave = derivarChave({ segredo: p.segredo, ...ctx });
    // Rotação = parear de novo: se este controlador já tem chave ativa, a antiga vale só pela graça.
    const velha = armazem.ativaDoPapel('servidor', { origem: p.idControlador });
    if (velha) armazem.rotacionar(velha.kid, { kid, chave }, { gracaMs: gracaRotacaoMs });
    else armazem.adicionar({ kid, chave, origem: p.idControlador, destino: p.idServidor, papel: 'servidor' });
    p.confirmacao = macConfirmacao({ segredo: p.segredo, kid, ...ctx });
    p.kid = kid;
    p.estado = 'aprovado'; p.privada = null; p.segredo = null;
    return true;
  }

  function cancelar(pairingId, token) {
    expirar();
    const p = pedidos.get(String(pairingId));
    if (!p || p.estado !== 'pendente' || !igual(p.tokenCancelamento, token)) return false;
    p.estado = 'cancelado'; p.privada = null; p.segredo = null;
    return true;
  }

  return Object.freeze({
    solicitar,
    consultar,
    aprovar: (id) => decidir(id, true),
    negar: (id) => decidir(id, false),
    cancelar,
    listarPendentes: () => { expirar(); return pendentes().map((p) => ({ pairingId: p.pairingId, nome: p.nome, ip: p.ip, codigo: p.codigo, expiraEm: p.expiraEm })); },
  });
}

/* ───────────────────────── Controlador ───────────────────────── */

/**
 * @param {object} p
 * @param {ReturnType<import('./eloChaves').criarArmazemChaves>} p.armazem
 * @param {string} p.idControlador
 * @param {string} p.nome nome mostrado ao operador do Servidor
 * @param {string} p.base origem do Servidor (ex.: `http://192.168.0.5:5510`), chave de busca da assinatura
 * @param {{solicitar: Function, consultar: Function, cancelar: Function}} p.transporte
 * @param {(codigo: string) => void} [p.aoCodigo] mostra o código ao operador do Controlador
 */
function criarClientePareamento({
  armazem, idControlador, nome, base, transporte, aoCodigo = () => {}, agora = Date.now, dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  intervaloMs = 1000, timeoutMs = 130000, gracaRotacaoMs = 60000,
}) {
  let cancelado = false;
  let ativo = null;

  async function parear() {
    const par = gerarParDeChaves();
    let s;
    try {
      s = await transporte.solicitar({ idControlador, nome: nomeSeguro(nome), publica: par.publica });
    } catch (e) {
      return { estado: 'erro', motivo: 'rede' };
    }
    if (!s || s.ok !== true) return { estado: 'recusado', motivo: (s && s.motivo) || 'desconhecido' };

    let segredo;
    try { segredo = acordo(par.privada, s.publicaServidor); } catch (_) { return { estado: 'erro', motivo: 'chave-servidor-invalida' }; }
    const ctx = { pairingId: s.pairingId, idControlador, idServidor: s.idServidor, pubC: par.publica, pubS: s.publicaServidor };
    ativo = { pairingId: s.pairingId, token: s.tokenCancelamento };
    const codigo = codigoSas({ segredo, ...ctx });
    try { aoCodigo(codigo); } catch (_) { /* aviso ao operador não pode quebrar o fluxo */ }

    const limite = agora() + timeoutMs;
    for (;;) {
      if (cancelado) return { estado: 'cancelado', codigo };
      let r;
      try { r = await transporte.consultar(s.pairingId); } catch (_) { r = null; }
      if (r && r.estado === 'aprovado') {
        const kid = String(r.kid || '');
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(kid) || !igual(macConfirmacao({ segredo, kid, ...ctx }), r.confirmacao || '')) {
          return { estado: 'confirmacao-invalida', codigo };
        }
        const chave = derivarChave({ segredo, ...ctx });
        const velha = armazem.ativaPara(base);
        if (velha) armazem.rotacionar(velha.kid, { kid, chave }, { gracaMs: gracaRotacaoMs });
        else armazem.adicionar({ kid, chave, origem: idControlador, destino: s.idServidor, papel: 'controlador', base });
        return { estado: 'aprovado', kid, codigo };
      }
      if (r && ['negado', 'cancelado', 'expirado', 'desconhecido'].includes(r.estado)) return { estado: r.estado, codigo };
      if (agora() >= limite) return { estado: 'expirado', codigo };
      await dormir(intervaloMs);
    }
  }

  async function cancelar() {
    cancelado = true;
    if (ativo) { try { await transporte.cancelar(ativo.pairingId, ativo.token); } catch (_) { /* ignora */ } }
  }

  return Object.freeze({ parear, cancelar });
}

module.exports = {
  gerarParDeChaves, acordo, derivarChave, codigoSas, macConfirmacao, criarServicoPareamentoServidor, criarClientePareamento,
};
