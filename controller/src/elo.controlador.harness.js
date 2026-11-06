'use strict';

/**
 * Harness (NÃO é teste): um «Controlador 3001» de verdade, em PROCESSO PRÓPRIO, para o teste
 * `elo.doisProcessos.test.js`. Usa a fiação REAL do Controlador: `eloControlador` (chaves,
 * assinatura, pareamento por HTTP), o salto REAL `proxyProjecaoJson` e o observador s→c.
 * Variável de ambiente: BASE_SERVIDOR (ex.: http://127.0.0.1:5510), HARNESS_DIR.
 */

const http = require('http');
const path = require('path');
const express = require('express');
const { autenticacaoHttp, elo: eloCore } = require('@lyra/projection-core');
const { criarEloControlador } = require('./eloControlador');
const { proxyJsonToProjection } = require('./lib/proxyProjecaoJson');

const BASE = process.env.BASE_SERVIDOR;
const eventos = [];
const ctl = criarEloControlador({
  caminho: path.join(process.env.HARNESS_DIR, 'elo-controlador.json'),
  nomePc: 'PC do Louvor (teste)',
  obterBase: () => new URL(BASE),
  registrar: (e) => { eventos.push(e); console.log(`EVT ${JSON.stringify(e)}`); },
});

const auth = autenticacaoHttp.criarAutenticacaoHttp({
  modo: 'registrar', contexto: 'controlador-3001', verificar: () => null, registrarDecisao: () => {}, eloDisponivel: true,
});
const app = express();
app.use(auth.middleware);
app.use(express.json({ limit: '5mb', verify: eloCore.capturarCorpoElo }));
app.use(ctl.elo.observador('controlador-3001'));

/** O salto 3001→5510 REAL (módulo de produção) com a assinatura do elo. */
app.put('/api/display-config', async (req, res) => {
  try {
    const base = new URL(BASE);
    const pr = await proxyJsonToProjection('PUT', '/api/display-config', req.body, {}, {
      base, assinar: (info) => ctl.assinarParaServidor({ base, ...info }),
    });
    res.status(pr.status).send(pr.body.toString('utf8'));
  } catch (e) {
    res.status(502).json({ erro: e.message });
  }
});
app.get('/api/apresentacao/midia/:id', (_req, res) => res.json({ ok: true }));

app.post('/__parear', async (_req, res) => {
  const r = await ctl.parear({ aoCodigo: (c) => console.log(`CODIGO ${c}`), timeoutMs: 20000 });
  res.json(r);
});
/** Verificação delegada: 1ª chamada devolve o que há (null), espera a atualização em segundo plano, 2ª chamada. */
app.post('/__verificar', async (req, res) => {
  const primeira = ctl.verificarDelegado(req.body);
  await new Promise((r) => setTimeout(r, 300));
  res.json({ primeira, segunda: ctl.verificarDelegado(req.body) });
});
app.post('/__cancelar', async (_req, res) => {
  await ctl.cancelarPareamento();
  res.json({ ok: true });
});
app.post('/__assinar', (req, res) => {
  const { metodo, caminho, corpo } = req.body;
  res.json({ via: ctl.assinarParaServidor({ base: BASE, metodo, caminho, corpo }) });
});
app.get('/__eventos', (_q, r) => r.json(eventos));
app.get('/__chaves', (_q, r) => r.json(ctl.chaves()));

const server = http.createServer(app);
server.listen(0, '127.0.0.1', () => console.log(`PORTA ${server.address().port}`));
