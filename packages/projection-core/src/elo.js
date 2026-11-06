'use strict';

/**
 * Elo interprocessos — fábrica por processo (Entrega 1).
 *
 *  papel `servidor`    : verifica c→s (entrada) e assina s→c (saída: proxies do Servidor ao 3001)
 *  papel `controlador` : verifica s→c (entrada) e assina c→s (saída: salto do 3001 e chamadas
 *                        internas do processo principal ao Servidor)
 *
 * O OBSERVADOR só registra: confere a assinatura das rotas que o manifesto marca com elo de
 * ENTRADA e registra `elo-http` (válido, ausente, repetida, direção…). Nunca recusa, nunca altera
 * a resposta, nunca falha a requisição. A recusa real é a Entrega 3.
 */

const { criarArmazemChaves } = require('./eloChaves');
const { assinar, criarVerificadorElo, NOME_CABECALHO } = require('./eloInterprocessos');

const MAX_REGISTROS = 500;
const MAX_CAMINHO = 120;

/**
 * Callback de `express.json({ verify })`: guarda os bytes do corpo SÓ quando a requisição traz o
 * cabeçalho do elo (a assinatura cobre o hash do corpo; o resto não paga o custo).
 */
function capturarCorpoElo(req, _res, buf) {
  if (req && req.headers && req.headers[NOME_CABECALHO.toLowerCase()]) req.rawBody = buf;
}

function ipDe(req) {
  const b = String((req && req.socket && req.socket.remoteAddress) || '');
  return b.startsWith('::ffff:') ? b.slice(7) : b;
}

/**
 * @param {object} p
 * @param {'servidor'|'controlador'} p.papel
 * @param {string|null} p.caminho arquivo do armazém de chaves (null = memória)
 * @param {(contexto: string, metodo: string, caminho: string) => object} p.avaliarRota
 * @param {(evento: object) => void} [p.registrar]
 * @param {() => number} [p.agora]
 */
function criarElo({ papel, caminho, avaliarRota, registrar = null, agora = Date.now }) {
  if (papel !== 'servidor' && papel !== 'controlador') throw new Error('papel inválido');
  const armazem = criarArmazemChaves({ caminho, agora });
  const verificador = criarVerificadorElo({
    obterChave: (kid) => { const r = armazem.obter(kid); return r && r.papel === papel ? r : null; },
    agora,
  });
  const direcaoSaida = papel === 'servidor' ? 's→c' : 'c→s';

  /** Valor do `X-Lyra-Via` para uma chamada de SAÍDA, ou `null` se não há pareamento ativo. */
  function assinarSaida({ base, metodo, caminho: alvo, corpo }) {
    const reg = papel === 'servidor' ? armazem.ativaDoPapel('servidor') : armazem.ativaPara(base);
    if (!reg) return null;
    return assinar({
      kid: reg.kid, chave: reg.chave, direcao: direcaoSaida, origem: reg.origem, destino: reg.destino, metodo, caminho: alvo, corpo, agora,
    });
  }

  /** chave -> {total, evento} */
  const vistos = new Map();

  function observar(contexto, req) {
    const metodo = String(req.method || 'GET').toUpperCase();
    const url = String(req.originalUrl || req.url || '/');
    const d = avaliarRota(contexto, metodo, url);
    const ip = d && d.esperada && d.esperada.interprocessos;
    if (!d || !d.encontrada || !ip || ip.esperada !== true) return;

    const valor = req.headers ? req.headers[NOME_CABECALHO.toLowerCase()] : undefined;
    let resultado = 'ausente';
    let kid = null;
    if (typeof valor === 'string' && valor !== '') {
      const r = verificador.verificar({ valor, direcaoEsperada: ip.direcao, metodo, caminho: url, corpo: req.rawBody });
      resultado = r.ok ? 'valido' : r.motivo;
      kid = r.kid || null;
      req.eloResultado = r; // o handler reaproveita: o nonce só pode ser consumido UMA vez
    } else if (valor !== undefined) {
      resultado = 'malformado';
      req.eloResultado = { ok: false, motivo: 'malformado' };
    } else {
      req.eloResultado = { ok: false, motivo: 'ausente' };
    }
    const chave = [contexto, d.id, resultado, kid || ''].join('|');
    const existente = vistos.get(chave);
    if (existente) { existente.total += 1; return; }
    if (vistos.size >= MAX_REGISTROS) return;
    const p = url.split('?')[0];
    const evento = {
      evento: 'elo-http', contexto, rota: d.id, metodo, caminho: p.length > MAX_CAMINHO ? `${p.slice(0, MAX_CAMINHO)}…` : p,
      direcao: ip.direcao, resultado, kid, ip: ipDe(req),
    };
    vistos.set(chave, { total: 1, evento });
    if (registrar) {
      try { registrar(evento); } catch (_) { /* o registro nunca derruba a requisição */ }
    }
  }

  /**
   * Para rotas NOVAS que se protegem sozinhas com o elo (ex.: verificação delegada de dispositivo).
   * Reaproveita o resultado do observador quando ele já conferiu a requisição; senão confere agora.
   * @returns {{ok: boolean, motivo?: string}}
   */
  function verificarRequisicao(req, direcaoEsperada) {
    if (req.eloResultado) return req.eloResultado;
    const valor = req.headers ? req.headers[NOME_CABECALHO.toLowerCase()] : undefined;
    return verificador.verificar({
      valor, direcaoEsperada, metodo: String(req.method || 'GET').toUpperCase(), caminho: String(req.originalUrl || req.url || '/'), corpo: req.rawBody,
    });
  }

  /** Middleware Express (depois do `express.json`): só observa. */
  function observador(contexto) {
    return (req, _res, next) => {
      try { observar(contexto, req); } catch (_) { /* observação nunca altera o fluxo */ }
      next();
    };
  }

  return Object.freeze({
    papel,
    armazem,
    verificador,
    assinarSaida,
    verificarRequisicao,
    observador,
    observadorResumo: () => [...vistos.values()].map(({ total, evento }) => ({ total, contexto: evento.contexto, rota: evento.rota, resultado: evento.resultado, kid: evento.kid })),
    /** Anunciadas em `GET /api/identity`: o outro lado decide o que usar sem adivinhar versão. */
    capacidades: () => ({ elo: 1, sessaoControlador: 1 }),
  });
}

module.exports = { criarElo, capturarCorpoElo };
