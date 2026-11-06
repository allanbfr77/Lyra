'use strict';

/**
 * Rotas do pareamento do elo interprocessos no Servidor (Entrega 1).
 *
 * Públicas (aberta à LAN de propósito — o Controlador de outro PC ainda não tem credencial): o
 * pedido de pareamento, a consulta do resultado e o cancelamento. A proteção NÃO é a rede: é a
 * APROVAÇÃO do operador do Servidor + o código de confirmação (SAS) conferido pelos dois lados +
 * limite de pedidos pendentes e por IP + validade curta. Nenhuma chave trafega.
 *
 * Administrativas (só desta máquina): ver pendentes e chaves (sem as chaves), aprovar, negar,
 * revogar. Mesma guarda por IP de loopback das rotas `/api/controladores/*`.
 */

function ipDe(req) {
  const b = String((req && req.socket && req.socket.remoteAddress) || '');
  return b.startsWith('::ffff:') ? b.slice(7) : b;
}

const STATUS_POR_MOTIVO = { invalido: 400, 'muito-rapido': 429, ocupado: 429 };

/**
 * @param {import('express').Express} expressApp
 * @param {{ pareamento: object, armazem: object, sessoes?: object, requisicaoVemDaMaquinaLocal: (req: object) => boolean, logError?: Function }} deps
 */
function registrarRotasElo(expressApp, { pareamento, armazem, requisicaoVemDaMaquinaLocal, verificarElo = null, acesso = null, logError = () => {} }) {
  expressApp.post('/api/elo/parear', (req, res) => {
    try {
      const corpo = req.body && typeof req.body === 'object' ? req.body : {};
      const r = pareamento.solicitar({ idControlador: corpo.idControlador, nome: corpo.nome, publica: corpo.publica, ip: ipDe(req) });
      if (!r.ok) return res.status(STATUS_POR_MOTIVO[r.motivo] || 400).json({ ok: false, motivo: r.motivo });
      return res.json(r);
    } catch (e) {
      logError('elo-parear', e);
      return res.status(500).json({ ok: false, motivo: 'erro' });
    }
  });

  expressApp.get('/api/elo/parear/:id', (req, res) => {
    res.json(pareamento.consultar(req.params.id));
  });

  expressApp.post('/api/elo/parear/:id/cancelar', (req, res) => {
    const token = req.body && typeof req.body === 'object' ? req.body.token : '';
    res.json({ ok: pareamento.cancelar(req.params.id, token) });
  });

  /**
   * Verificação DELEGADA de dispositivo (Entrega 1): o Controlador (3001) de outro PC não tem a allowlist e
   * pergunta aqui se uma credencial de dispositivo vale. Rota NOVA, então já nasce protegida: exige o elo
   * (c→s) válido — sem ele seria um oráculo de credenciais aberto à LAN. Só leitura: usa a verificação PURA
   * (não inscreve, não grava, não notifica).
   */
  expressApp.post('/api/elo/verificar-dispositivo', (req, res) => {
    if (typeof verificarElo !== 'function' || !acesso) return res.status(404).json({ ok: false });
    const v = verificarElo(req, 'c→s');
    if (!v || v.ok !== true) return res.status(401).json({ ok: false, motivo: `elo-${(v && v.motivo) || 'invalido'}` });
    const corpo = req.body && typeof req.body === 'object' ? req.body : {};
    const r = acesso.verificarCredencial({ deviceId: corpo.deviceId, secret: corpo.secret });
    return res.json({ ok: r.ok === true, classe: String(r.classe || 'desconhecido') });
  });

  expressApp.get('/api/elo/pareamentos', (req, res) => {
    if (!requisicaoVemDaMaquinaLocal(req)) return res.status(403).json({ ok: false, erro: 'Gestão disponível apenas localmente.' });
    return res.json({ ok: true, pendentes: pareamento.listarPendentes(), chaves: armazem.listar() });
  });

  expressApp.post('/api/elo/pareamentos/:id/aprovar', (req, res) => {
    if (!requisicaoVemDaMaquinaLocal(req)) return res.status(403).json({ ok: false });
    return res.json({ ok: pareamento.aprovar(req.params.id) });
  });

  expressApp.post('/api/elo/pareamentos/:id/negar', (req, res) => {
    if (!requisicaoVemDaMaquinaLocal(req)) return res.status(403).json({ ok: false });
    return res.json({ ok: pareamento.negar(req.params.id) });
  });

  expressApp.post('/api/elo/chaves/revogar', (req, res) => {
    if (!requisicaoVemDaMaquinaLocal(req)) return res.status(403).json({ ok: false });
    const kid = String((req.body && req.body.kid) || '').trim();
    return res.json({ ok: armazem.revogar(kid) });
  });
}

module.exports = { registrarRotasElo };
