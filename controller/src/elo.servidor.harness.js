'use strict';

/**
 * Harness (NÃO é teste): um «Servidor 5510» de verdade, em PROCESSO PRÓPRIO, para o teste
 * `elo.doisProcessos.test.js`. Usa os módulos e a fiação REAIS do Servidor (autenticação HTTP,
 * controleAcesso, elo, pareamento, rotas do elo, observador); só o Electron fica de fora.
 * Escuta em 127.0.0.1:0 e imprime `PORTA <n>`; eventos saem em linhas `EVT {...}` / `POL {...}`.
 */

const http = require('http');
const path = require('path');
const express = require('express');
const {
  autenticacaoHttp, controleAcesso, elo: eloCore, eloPareamento, sessaoControlador, politicaRotas,
} = require('@lyra/projection-core');
const { registrarRotasElo } = require('../../server/src/lib/rotasElo');

const DIR = process.env.HARNESS_DIR;
const COM_ELO = process.env.SEM_ELO !== '1';
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const requisicaoVemDaMaquinaLocal = (req) => LOCAL.has(String((req && req.socket && req.socket.remoteAddress) || ''));
const eventos = [];

const acesso = controleAcesso.criarControleAcesso({
  allowlistPath: () => path.join(DIR, 'allow.json'), emitParaSocket() {}, broadcast() {}, notificar() {},
});
acesso.autenticar({ deviceId: 'pc-1-harness', secret: 'seg-1' });
acesso.registrarControlador('S1', { deviceId: 'pc-1-harness', nome: 'PC1' });
const sessoes = sessaoControlador.criarSessoesControlador();

const elo = eloCore.criarElo({
  papel: 'servidor', caminho: path.join(DIR, 'elo-servidor.json'), avaliarRota: politicaRotas.avaliarRota,
  registrar: (e) => { eventos.push(e); console.log(`EVT ${JSON.stringify(e)}`); },
});
const pareamento = eloPareamento.criarServicoPareamentoServidor({
  armazem: elo.armazem, cooldownPorIpMs: 0,
  aoSolicitar: (p) => console.log(`PEDIDO ${JSON.stringify({ pairingId: p.pairingId, codigo: p.codigo, nome: p.nome })}`),
});

const auth = autenticacaoHttp.criarAutenticacaoHttp({
  modo: 'registrar', contexto: 'servidor-5510', verificar: (a) => acesso.verificarCredencial(a),
  registrarDecisao: (e) => console.log(`POL ${JSON.stringify(e)}`),
  avaliarBastao: (a) => sessaoControlador.resolverBastao({ acesso, sessoes, ...a }),
  eloDisponivel: COM_ELO,
});

const app = express();
app.use(auth.middleware);
app.use(express.json({ limit: '5mb', verify: eloCore.capturarCorpoElo }));
if (COM_ELO) {
  app.use(elo.observador('servidor-5510'));
  registrarRotasElo(app, {
    pareamento, armazem: elo.armazem, requisicaoVemDaMaquinaLocal, logError: (c, e) => console.log(`ERRO ${c} ${e && e.message}`),
    verificarElo: (req, dir) => elo.verificarRequisicao(req, dir), acesso,
  });
}
app.get('/api/identity', (_req, res) => res.json(COM_ELO ? { role: 'server', capacidades: elo.capacidades() } : { role: 'server' }));
const ultimos = [];
app.put('/api/display-config', (req, res) => {
  ultimos.push({ via: req.headers['x-lyra-via'] || null, device: req.headers['x-lyra-device'] || null });
  res.json({ ok: true });
});
app.post('/api/internal/restart', (req, res) => {
  if (!requisicaoVemDaMaquinaLocal(req)) return res.status(403).json({ ok: false });
  return res.status(202).json({ ok: true, restarting: false });
});
app.get('/__eventos', (_q, r) => r.json(eventos));
app.get('/__ultimos', (_q, r) => r.json(ultimos));
app.get('/__chaves', (_q, r) => r.json(elo.armazem.listar()));
/** O «proxy do Servidor» chamando o 3001 assinado (s→c), com a MESMA fábrica do elo. */
app.post('/__chamar-controlador', (req, res) => {
  const { porta, caminho } = req.body;
  const via = elo.assinarSaida({ metodo: 'GET', caminho });
  const rq = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: 'GET', headers: via ? { 'X-Lyra-Via': via } : {} }, (rs) => {
    rs.resume();
    rs.on('end', () => res.json({ status: rs.statusCode, assinou: !!via }));
  });
  rq.on('error', (e) => res.status(502).json({ erro: e.message }));
  rq.end();
});

const server = http.createServer(app);
server.listen(0, '127.0.0.1', () => console.log(`PORTA ${server.address().port}`));
