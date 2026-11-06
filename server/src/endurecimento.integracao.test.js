'use strict';

/**
 * Entrega 2 (Servidor 5510) — guardas POR ROTA com Express, allowlist e elo REAIS.
 *
 * Prova: `POST /api/sync/banco` e as DevTools passam a exigir quem é; o corpo grande só é lido
 * para quem se identificou; escritas têm teto de taxa; e NADA mais mudou — a autenticação geral
 * segue em `registrar` e as demais rotas (comandos, display-config…) continuam sem bloqueio.
 * Para simular «outro PC» num teste local, o cabeçalho `x-test-ip` troca o IP visto pelo servidor.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const {
  autenticacaoHttp, controleAcesso, elo: eloCore, guardasRotas, politicaRotas,
} = require('@lyra/projection-core');

const FONTE = fs.readFileSync(path.join(__dirname, 'httpServer.js'), 'utf8');
const SEGREDO = 'SEGREDO-ENDURECIMENTO-9876543210';
const REMOTO = '192.168.0.50';

function chamar(porta, metodo, caminho, corpo, cab = {}) {
  return new Promise((resolve, reject) => {
    const payload = corpo === undefined ? null : Buffer.isBuffer(corpo) ? corpo : Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
    const rq = http.request({
      host: '127.0.0.1', port: porta, path: caminho, method: metodo, agent: false, // sem keep-alive: o IP simulado vale por requisição
      headers: { ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}), ...cab },
    }, (rs) => {
      let t = '';
      rs.on('data', (d) => { t += d; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (_) { /* não é JSON */ } resolve({ status: rs.statusCode, json: j, texto: t, headers: rs.headers }); });
    });
    rq.on('error', (e) => (e.code === 'ECONNRESET' || e.code === 'EPIPE' ? resolve({ status: 'reset', json: null, texto: '', headers: {} }) : reject(e)));
    if (payload) rq.write(payload);
    rq.end();
  });
}
const cred = (id, secret = SEGREDO) => ({ 'X-Lyra-Device': id, 'X-Lyra-Secret': secret });
const remoto = (cab = {}) => ({ 'x-test-ip': REMOTO, ...cab });

async function pilha(fn, { desligadas = false, taxa } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-endur-'));
  const acesso = controleAcesso.criarControleAcesso({
    allowlistPath: () => path.join(dir, 'a.json'), revogadosPath: () => path.join(dir, 'r.json'), emitParaSocket() {}, broadcast() {}, notificar() {},
  });
  acesso.abrirJanelaInscricao();
  acesso.autenticar({ deviceId: 'dev-ok-0001', secret: SEGREDO });
  acesso.autenticar({ deviceId: 'dev-rev-0001', secret: SEGREDO });
  acesso.revogarDispositivo('dev-rev-0001');
  acesso.fecharJanelaInscricao();
  acesso.autenticar({ deviceId: 'dev-pend-0001', secret: SEGREDO }); // janela fechada → pendente

  const srv = eloCore.criarElo({ papel: 'servidor', caminho: null, avaliarRota: politicaRotas.avaliarRota });
  const ctl = eloCore.criarElo({ papel: 'controlador', caminho: null, avaliarRota: politicaRotas.avaliarRota });
  const chave = crypto.randomBytes(32);
  const idC = ctl.armazem.idLocal();
  const idS = srv.armazem.idLocal();
  srv.armazem.adicionar({ kid: 'kid-e2', chave, origem: idC, destino: idS, papel: 'servidor' });
  ctl.armazem.adicionar({ kid: 'kid-e2', chave, origem: idC, destino: idS, papel: 'controlador', base: 'http://192.168.0.5:5510' });

  const guardasEventos = [];
  const guardas = guardasRotas.criarGuardasRotas({
    verificar: (a) => acesso.verificarCredencial(a), verificarElo: (req, d) => srv.verificarRequisicao(req, d),
    registrar: (e) => guardasEventos.push(e), desligadas, ...(taxa ? { taxa } : {}),
  });
  const exec = [];
  const auth = autenticacaoHttp.criarAutenticacaoHttp({
    modo: 'registrar', contexto: 'servidor-5510', verificar: (a) => acesso.verificarCredencial(a), registrar: () => {}, registrarDecisao: () => {}, eloDisponivel: true,
  });
  const app = express();
  app.use((req, _res, next) => { // simula outro PC
    const ip = req.headers['x-test-ip'];
    if (ip) Object.defineProperty(req.socket, 'remoteAddress', { value: ip, configurable: true });
    next();
  });
  app.use(auth.middleware);
  app.use(guardas.limitarTaxa());
  app.use(guardas.selecionarJson({
    pequeno: express.json({ limit: '1mb', verify: eloCore.capturarCorpoElo }),
    grande: express.json({ limit: '200mb', verify: eloCore.capturarCorpoElo }),
  }));
  app.use(guardas.tratarErroCorpo);
  app.use(srv.observador('servidor-5510'));
  const roda = (nome) => (_q, res) => { exec.push(nome); res.json({ ok: true }); };
  app.post('/api/sync/banco', guardas.exigirCredencial({ aceitaElo: true }), roda('sync'));
  app.post('/api/open-display-devtools', guardas.exigirLocalOuElo(), roda('devtools-display'));
  app.post('/api/open-public-devtools', guardas.exigirLocalOuElo(), roda('devtools-publico'));
  app.post('/api/open-ministrante-devtools', guardas.exigirLocalOuElo(), roda('devtools-ministrante'));
  app.post('/api/comando/:acao', roda('comando'));
  app.put('/api/display-config', roda('display-config'));
  app.put('/api/display-routing', roda('display-routing'));
  app.get('/api/estado', roda('estado'));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn({ porta: server.address().port, exec, guardasEventos, ctl, acesso });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

const BANCO = { versao: 1, musicas: [{ id: 1, titulo: 'Teste' }] };

test('POST /api/sync/banco: dispositivo AUTORIZADO sincroniza; ausente, inválido, desconhecido, pendente e revogado são recusados e o handler NÃO executa', async () => {
  await pilha(async ({ porta, exec }) => {
    assert.equal((await chamar(porta, 'POST', '/api/sync/banco', BANCO, remoto(cred('dev-ok-0001')))).status, 200);
    assert.deepEqual(exec, ['sync']);
    const casos = [
      ['sem credencial', {}, 401, 'ausente'],
      ['segredo errado', cred('dev-ok-0001', 'errado'), 401, 'secret-invalido'],
      ['desconhecido', cred('ninguem'), 401, 'desconhecido'],
      ['pendente', cred('dev-pend-0001'), 403, 'pendente'],
      ['revogado', cred('dev-rev-0001'), 401, 'revogado'],
    ];
    for (const [nome, cab, status, motivo] of casos) {
      const r = await chamar(porta, 'POST', '/api/sync/banco', BANCO, remoto(cab));
      assert.equal(r.status, status, nome);
      assert.equal(r.json.motivo, motivo, nome);
    }
    assert.deepEqual(exec, ['sync'], 'nenhuma recusa executou o handler');
  });
});

test('sync/banco com o ELO válido (Controlador pareado) passa sem credencial de dispositivo; replay e corpo adulterado não', async () => {
  await pilha(async ({ porta, exec, ctl }) => {
    const corpo = JSON.stringify(BANCO);
    const via = ctl.assinarSaida({ base: 'http://192.168.0.5:5510', metodo: 'POST', caminho: '/api/sync/banco', corpo });
    assert.equal((await chamar(porta, 'POST', '/api/sync/banco', corpo, remoto({ 'X-Lyra-Via': via }))).status, 200);
    assert.equal((await chamar(porta, 'POST', '/api/sync/banco', corpo, remoto({ 'X-Lyra-Via': via }))).status, 401, 'replay');
    const via2 = ctl.assinarSaida({ base: 'http://192.168.0.5:5510', metodo: 'POST', caminho: '/api/sync/banco', corpo });
    assert.equal((await chamar(porta, 'POST', '/api/sync/banco', JSON.stringify({ x: 1 }), remoto({ 'X-Lyra-Via': via2 }))).status, 401, 'corpo adulterado');
    assert.deepEqual(exec, ['sync']);
  });
});

test('corpo GRANDE: 3 MB passam com credencial verificada; sem credencial (outro PC) viram 413 em JSON e o handler não executa', async () => {
  await pilha(async ({ porta, exec }) => {
    const grande = JSON.stringify({ lixo: 'x'.repeat(3 * 1024 * 1024) });
    const ok = await chamar(porta, 'POST', '/api/sync/banco', grande, remoto(cred('dev-ok-0001')));
    assert.equal(ok.status, 200, 'o sync legítimo de banco grande continua funcionando');
    const semCred = await chamar(porta, 'POST', '/api/comando/audio_play', grande, remoto());
    assert.equal(semCred.status === 413 || semCred.status === 'reset', true, `status ${semCred.status}`);
    if (semCred.status === 413) assert.equal(semCred.json.motivo, 'corpo-grande-demais');
    const pendente = await chamar(porta, 'POST', '/api/comando/audio_play', grande, remoto(cred('dev-pend-0001')));
    assert.equal(pendente.status === 413 || pendente.status === 'reset', true, 'credencial NÃO verificada também fica no limite pequeno');
    assert.deepEqual(exec, ['sync'], 'só o sync legítimo executou');
    // corpo pequeno sem credencial continua passando (registrar não bloqueia): comportamento anterior
    assert.equal((await chamar(porta, 'POST', '/api/comando/audio_play', { src: 'a.mp3' }, remoto())).status, 200);
  });
});

test('corpo grande vindo da PRÓPRIA MÁQUINA (processo principal, painel local) continua aceito', async () => {
  await pilha(async ({ porta, exec }) => {
    const grande = JSON.stringify({ lixo: 'x'.repeat(3 * 1024 * 1024) });
    assert.equal((await chamar(porta, 'POST', '/api/comando/exibir_apresentacao', grande)).status, 200);
    assert.deepEqual(exec, ['comando']);
  });
});

test('DevTools HTTP: a própria máquina passa; outro PC é recusado (403); com o elo válido passa; loopback PROXIFICADO não', async () => {
  await pilha(async ({ porta, exec, ctl }) => {
    for (const rota of ['open-display-devtools', 'open-public-devtools', 'open-ministrante-devtools']) {
      assert.equal((await chamar(porta, 'POST', `/api/${rota}`)).status, 200, `${rota} local`);
      const r = await chamar(porta, 'POST', `/api/${rota}`, undefined, remoto());
      assert.deepEqual({ s: r.status, m: r.json.motivo }, { s: 403, m: 'somente-local' }, `${rota} remoto`);
    }
    assert.equal(exec.length, 3);
    const via = ctl.assinarSaida({ base: 'http://192.168.0.5:5510', metodo: 'POST', caminho: '/api/open-display-devtools', corpo: Buffer.alloc(0) });
    assert.equal((await chamar(porta, 'POST', '/api/open-display-devtools', undefined, remoto({ 'X-Lyra-Via': via }))).status, 200);
    assert.equal((await chamar(porta, 'POST', '/api/open-display-devtools', undefined, remoto({ 'X-Lyra-Via': via }))).status, 403, 'replay');
    assert.equal((await chamar(porta, 'POST', '/api/open-public-devtools', undefined, { 'x-lyra-proxy': '1' })).status, 403);
  });
});

test('escritas passam por um teto de taxa por IP (outro PC); leitura não conta; a própria máquina é isenta', async () => {
  await pilha(async ({ porta, exec }) => {
    for (let i = 0; i < 3; i += 1) assert.equal((await chamar(porta, 'POST', '/api/comando/audio_play', { src: 'a' }, remoto())).status, 200);
    const barrada = await chamar(porta, 'POST', '/api/comando/audio_play', { src: 'a' }, remoto());
    assert.deepEqual({ s: barrada.status, m: barrada.json.motivo }, { s: 429, m: 'muitas-requisicoes' });
    assert.ok(Number(barrada.headers['retry-after']) >= 1);
    assert.equal((await chamar(porta, 'GET', '/api/estado', undefined, remoto())).status, 200);
    assert.equal((await chamar(porta, 'POST', '/api/comando/audio_play', { src: 'a' })).status, 200, 'loopback isento');
    assert.equal(exec.filter((e) => e === 'comando').length, 4);
  }, { taxa: { janelaMs: 60_000, max: 3 } });
});

test('o resto NÃO mudou: comandos e display-config do Servidor seguem sem bloqueio mesmo sem credencial (registrar)', async () => {
  await pilha(async ({ porta, exec }) => {
    assert.equal((await chamar(porta, 'POST', '/api/comando/audio_play', { src: 'a' }, remoto())).status, 200);
    assert.equal((await chamar(porta, 'PUT', '/api/display-config', { a: 1 }, remoto())).status, 200);
    assert.equal((await chamar(porta, 'PUT', '/api/display-routing', { a: 1 }, remoto())).status, 200);
    assert.deepEqual(exec, ['comando', 'display-config', 'display-routing']);
  });
});

test('chave de desligamento: com as guardas desligadas tudo volta a ser como antes (sync e DevTools sem credencial)', async () => {
  await pilha(async ({ porta, exec }) => {
    assert.equal((await chamar(porta, 'POST', '/api/sync/banco', BANCO, remoto())).status, 200);
    assert.equal((await chamar(porta, 'POST', '/api/open-display-devtools', undefined, remoto())).status, 200);
    assert.equal((await chamar(porta, 'POST', '/api/comando/audio_play', JSON.stringify({ lixo: 'x'.repeat(2 * 1024 * 1024) }), remoto())).status, 200);
    assert.equal(exec.length, 3);
  }, { desligadas: true });
});

test('recusas viram eventos sem segredo; o segredo nunca aparece nas respostas', async () => {
  await pilha(async ({ porta, guardasEventos }) => {
    const r = await chamar(porta, 'POST', '/api/sync/banco', BANCO, remoto(cred('dev-ok-0001', 'errado')));
    await chamar(porta, 'POST', '/api/open-display-devtools', undefined, remoto());
    const tudo = JSON.stringify(guardasEventos) + r.texto;
    assert.equal(tudo.includes(SEGREDO) || tudo.includes('errado'), false);
    assert.ok(guardasEventos.some((e) => e.guarda === 'credencial') && guardasEventos.some((e) => e.guarda === 'local-ou-elo'));
  });
});

/* ───────────────────────── fiação em httpServer.js ───────────────────────── */

test('fiação: o Servidor usa as guardas nas rotas certas e CONTINUA em «registrar» (sem «impor» geral)', () => {
  assert.match(FONTE, /expressApp\.post\('\/api\/sync\/banco',\s*guardas\.exigirCredencial\(\{ aceitaElo: true \}\)/);
  for (const r of ['open-display-devtools', 'open-public-devtools', 'open-ministrante-devtools']) {
    assert.match(FONTE, new RegExp(`expressApp\\.post\\('/api/${r}',\\s*guardas\\.exigirLocalOuElo\\(\\)`), r);
  }
  assert.match(FONTE, /expressApp\.use\(guardas\.limitarTaxa\(\)\)/);
  assert.match(FONTE, /guardas\.selecionarJson\(\{/);
  assert.match(FONTE, /expressApp\.use\(guardas\.tratarErroCorpo\)/);
  assert.match(FONTE, /modo:\s*'registrar'/);
  assert.doesNotMatch(FONTE, /modo:\s*'impor'/);
  // as rotas que NÃO são do escopo desta entrega continuam sem guarda própria
  for (const r of ["'/api/display-config'", "'/api/display-routing'"]) {
    assert.doesNotMatch(FONTE, new RegExp(`expressApp\\.put\\(${r.replace(/\//g, '\\/')},\\s*guardas`), r);
  }
  assert.doesNotMatch(FONTE, /expressApp\.post\('\/api\/comando\/[^']*',\s*guardas/);
});

test('fiação: o JSON só é lido DEPOIS de decidir o tamanho (selecionarJson antes dos handlers; nenhum express.json global solto)', () => {
  assert.doesNotMatch(FONTE, /expressApp\.use\(express\.json\(/);
  assert.ok(FONTE.indexOf('guardas.selecionarJson') < FONTE.indexOf("expressApp.post('/api/sync/banco'"));
});

test('fiação: eventos de socket sensíveis passam por guardasSocket (DevTools, forçar bastão, sincronização)', () => {
  for (const ev of ['open_display_devtools', 'open_public_devtools', 'open_ministrante_devtools']) {
    const i = FONTE.indexOf(`socket.on('${ev}'`);
    assert.ok(i > 0, ev);
    assert.match(FONTE.slice(i, i + 260), /guardasSocket\.soAutorizado\(socket\)/, ev);
  }
  const f = FONTE.indexOf("socket.on('forcar_assumir_controle'");
  assert.match(FONTE.slice(f, f + 900), /soAutorizado\(socket\)[\s\S]*permitidoGlobal\('forcar_assumir_controle', 3000\)[\s\S]*marcarGlobal/);
  const s = FONTE.indexOf("socket.on('solicitar_sincronizacao_banco'");
  assert.match(FONTE.slice(s, s + 1200), /soAutorizado\(socket\)[\s\S]*consumirPorSocket\(socket, 'solicitar_sincronizacao_banco', 10000\)/);
});

test('fiação: revogados persistentes, janela de inscrição e diálogo do operador estão ligados no Servidor', () => {
  assert.match(FONTE, /revogadosPath:\s*paths\.revogadosPath/);
  assert.match(FONTE, /inscricaoAutomatica:\s*process\.env\.LYRA_TOFU_LEGADO === '1'/);
  assert.match(FONTE, /evt === 'dispositivo_pendente'[\s\S]*ctx\.dialogosDispositivos\.aoPendente/);
  assert.match(FONTE, /'\/api\/controladores\/janela\/abrir'/);
  assert.match(FONTE, /'\/api\/controladores\/readmitir'/);
});

test('fiação: bandeja/menu do Servidor oferecem abrir/fechar inscrição e aprovar pendentes; o main liga o dialog', () => {
  const tray = fs.readFileSync(path.join(__dirname, 'tray.js'), 'utf8');
  for (const rot of ['Abrir inscrição de dispositivos (5 min)', 'Fechar inscrição de dispositivos', 'Aprovar dispositivos pendentes…']) assert.ok(tray.includes(rot), rot);
  assert.match(tray, /ctx\.dialogosDispositivos/);
  assert.match(tray, /submenu: itensDispositivos\(\)/);
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.match(main, /iniciarServidor\(ctx, paths, \{[\s\S]*?\n\s+dialog,/);
});
