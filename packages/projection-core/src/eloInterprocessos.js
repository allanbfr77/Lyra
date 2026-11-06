'use strict';

/**
 * Elo interprocessos do Lyra (`X-Lyra-Via`) — Entrega 1 de segurança.
 *
 * Prova que uma requisição HTTP entre o Controlador (3001) e o Servidor (5510) foi feita pelo
 * outro processo PAREADO, e não por qualquer cliente: assinatura HMAC-SHA256 que amarra
 *   versão · direção (c→s | s→c) · origem · destino · método · caminho COM query · hash do corpo ·
 *   timestamp · nonce · kid
 * Alterar qualquer um desses campos invalida a assinatura; reutilizá-la em outra rota, outro
 * sentido ou outro corpo falha; repeti-la (mesmo nonce) falha (replay); fora da janela de tempo
 * falha. A chave nunca viaja, nunca é registrada e não está no código: nasce do pareamento
 * (`eloPareamento.js`) e mora no armazém de chaves (`eloChaves.js`).
 *
 * Formato do cabeçalho (ASCII, < 512 bytes):
 *   v1;kid=<id>;ts=<ms>;n=<nonce>;d=<c2s|s2c>;sig=<base64url>
 *
 * Este módulo é PURO (sem rede, sem disco): quem chama fornece a chave, o relógio e o corpo.
 */

const crypto = require('crypto');

const VERSAO = 'v1';
const NOME_CABECALHO = 'X-Lyra-Via';
const MAX_CABECALHO = 512;
const TOLERANCIA_PADRAO_MS = 30000;
const MAX_NONCES_PADRAO = 20000;

const DIRECAO_PARA_TOKEN = Object.freeze({ 'c→s': 'c2s', 's→c': 's2c', c2s: 'c2s', s2c: 's2c' });
const TOKEN_PARA_DIRECAO = Object.freeze({ c2s: 'c→s', s2c: 's→c' });

const RE_KID = /^[A-Za-z0-9_-]{1,64}$/;
const RE_NONCE = /^[A-Za-z0-9_-]{16,64}$/;
const RE_TS = /^\d{10,16}$/;
const RE_SIG = /^[A-Za-z0-9_-]{43}$/;

/** SHA-256 hexadecimal do corpo (Buffer, string ou vazio). */
function hashCorpo(corpo) {
  const buf = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo === undefined || corpo === null ? '' : String(corpo), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Texto canônico assinado. Campos separados por LF; nenhum campo pode conter LF. */
function canonico({ kid, direcao, origem, destino, metodo, caminho, corpoHash, ts, nonce }) {
  return [
    `lyra-elo-${VERSAO}`, direcao, String(origem), String(destino),
    String(metodo).toUpperCase(), String(caminho), corpoHash, String(ts), nonce, kid,
  ].join('\n');
}

function hmac(chave, texto) {
  return crypto.createHmac('sha256', chave).update(texto).digest('base64url');
}

/**
 * @param {object} p
 * @param {string} p.kid
 * @param {Buffer} p.chave
 * @param {'c→s'|'s→c'} p.direcao
 * @param {string} p.origem id do processo que assina
 * @param {string} p.destino id do processo que verifica
 * @param {string} p.metodo
 * @param {string} p.caminho caminho + query exatamente como vai na linha de requisição
 * @param {Buffer|string} [p.corpo]
 * @param {() => number} [p.agora]
 * @returns {string} valor do cabeçalho `X-Lyra-Via`
 */
function assinar({ kid, chave, direcao, origem, destino, metodo, caminho, corpo, agora = Date.now }) {
  const d = DIRECAO_PARA_TOKEN[direcao];
  if (!d) throw new Error('direção inválida');
  if (!RE_KID.test(String(kid))) throw new Error('kid inválido');
  if (!Buffer.isBuffer(chave) || chave.length < 16) throw new Error('chave inválida');
  const ts = String(Math.trunc(agora()));
  const nonce = crypto.randomBytes(18).toString('base64url');
  const sig = hmac(chave, canonico({
    kid, direcao: d, origem, destino, metodo, caminho, corpoHash: hashCorpo(corpo), ts, nonce,
  }));
  return `${VERSAO};kid=${kid};ts=${ts};n=${nonce};d=${d};sig=${sig}`;
}

function analisar(valor) {
  if (valor === undefined || valor === null || typeof valor !== 'string' || valor.trim() === '') return { motivo: 'ausente' };
  if (valor.length > MAX_CABECALHO) return { motivo: 'malformado' };
  const partes = valor.trim().split(';');
  const versao = partes.shift();
  if (!/^v\d{1,3}$/.test(versao)) return { motivo: 'malformado' };
  if (versao !== VERSAO) return { motivo: 'versao' };
  const campos = {};
  for (const p of partes) {
    const i = p.indexOf('=');
    if (i <= 0) return { motivo: 'malformado' };
    const k = p.slice(0, i);
    if (Object.prototype.hasOwnProperty.call(campos, k)) return { motivo: 'malformado' };
    campos[k] = p.slice(i + 1);
  }
  const chaves = Object.keys(campos).sort().join(',');
  if (chaves !== 'd,kid,n,sig,ts') return { motivo: 'malformado' };
  if (!RE_KID.test(campos.kid) || !RE_NONCE.test(campos.n) || !RE_TS.test(campos.ts) || !RE_SIG.test(campos.sig) || !TOKEN_PARA_DIRECAO[campos.d]) {
    return { motivo: 'malformado' };
  }
  return { campos };
}

/**
 * @param {object} p
 * @param {(kid: string) => ({chave: Buffer, origem: string, destino: string, estado: string, expiraEm?: (number|null)}|null)} p.obterChave
 * @param {() => number} [p.agora]
 * @param {number} [p.toleranciaMs=30000] janela de tempo aceita (passado e futuro)
 * @param {number} [p.maxNonces=20000] teto do cache anti-replay
 */
function criarVerificadorElo({ obterChave, agora = Date.now, toleranciaMs = TOLERANCIA_PADRAO_MS, maxNonces = MAX_NONCES_PADRAO }) {
  /** `${kid}:${nonce}` -> expira em (ms). Só entram assinaturas JÁ VÁLIDAS. */
  const nonces = new Map();

  function podar(t) {
    for (const [k, ate] of nonces) {
      if (ate <= t) nonces.delete(k);
      else break; // inseridos em ordem crescente de expiração aproximada
    }
    while (nonces.size > maxNonces) nonces.delete(nonces.keys().next().value);
  }

  /**
   * @param {{valor: any, direcaoEsperada: 'c→s'|'s→c', metodo: string, caminho: string, corpo?: (Buffer|string)}} p
   * @returns {{ok: boolean, motivo?: string, kid?: string, origem?: string, destino?: string}}
   */
  function verificar({ valor, direcaoEsperada, metodo, caminho, corpo }) {
    const a = analisar(valor);
    if (!a.campos) return { ok: false, motivo: a.motivo };
    const c = a.campos;
    const kid = c.kid;

    let reg = null;
    try { reg = obterChave(kid); } catch (_) { reg = null; }
    if (!reg || !Buffer.isBuffer(reg.chave)) return { ok: false, motivo: 'chave-desconhecida', kid };
    const t = agora();
    if (reg.estado === 'revogada') return { ok: false, motivo: 'chave-revogada', kid };
    if (reg.expiraEm !== null && reg.expiraEm !== undefined && reg.expiraEm <= t) return { ok: false, motivo: 'chave-expirada', kid };

    const ts = Number(c.ts);
    if (ts < t - toleranciaMs) return { ok: false, motivo: 'expirada', kid };
    if (ts > t + toleranciaMs) return { ok: false, motivo: 'relogio', kid };

    const esperada = hmac(reg.chave, canonico({
      kid, direcao: c.d, origem: reg.origem, destino: reg.destino, metodo, caminho, corpoHash: hashCorpo(corpo), ts: c.ts, nonce: c.n,
    }));
    const bufA = Buffer.from(esperada);
    const bufB = Buffer.from(c.sig);
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) return { ok: false, motivo: 'assinatura', kid };

    const dirEsperada = DIRECAO_PARA_TOKEN[direcaoEsperada];
    if (!dirEsperada || c.d !== dirEsperada) return { ok: false, motivo: 'direcao', kid };

    podar(t);
    const chaveNonce = `${kid}:${c.n}`;
    if (nonces.has(chaveNonce)) return { ok: false, motivo: 'repetida', kid };
    // Fica guardado até a assinatura sair da janela aceita: depois disso ela já é «expirada».
    nonces.set(chaveNonce, Math.max(ts, t) + toleranciaMs + 1000);
    podar(t);
    return { ok: true, kid, origem: reg.origem, destino: reg.destino };
  }

  return Object.freeze({ verificar, tamanhoCacheNonces: () => nonces.size });
}

module.exports = {
  VERSAO, NOME_CABECALHO, TOLERANCIA_PADRAO_MS, MAX_CABECALHO, hashCorpo, assinar, criarVerificadorElo,
};
