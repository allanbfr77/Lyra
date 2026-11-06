'use strict';

/**
 * Entrega 2 (motor local 5510 do Controlador) — display-config, preview e display-routing passam
 * a exigir quem é: a credencial INTERNA do painel (só neste contexto local) ou um dispositivo
 * AUTORIZADO (o mobile). Express, allowlist e verificador reais; «outro PC» simulado por IP.
 * A leitura dessas rotas (telões) e todo o resto seguem como antes; `registrar` continua geral.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const {
  autenticacaoHttp, controleAcesso, credencialInterna, guardasRotas,
} = require('@lyra/projection-core');

const FONTE = fs.readFileSync(path.join(__dirname, 'projecaoLocal.js'), 'utf8');
const SEG = 'SEGREDO-LOCAL-ENDURECIMENTO-123456';
const REMOTO = '192.168.0.77';

function chamar(porta, metodo, caminho, corpo, cab = {}) {
  return new Promise((resolve, reject) => {
    const payload = corpo === undefined ? null : Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
    const rq = http.request({
      host: '127.0.0.1', port: porta, path: caminho, method: metodo, agent: false,
      headers: { ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}), ...cab },
    }, (rs) => {
      let t = '';
      rs.on('data', (d) => { t += d; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (_) { /* não é JSON */ } resolve({ status: rs.statusCode, json: j, texto: t }); });
    });
    rq.on('error', (e) => (e.code === 'ECONNRESET' || e.code === 'EPIPE' ? resolve({ status: 'reset', json: null, texto: '' }) : reject(e)));
    if (payload) rq.write(payload);
    rq.end();
  });
}
const cred = (id, secret = SEG) => ({ 'X-Lyra-Device': id, 'X-Lyra-Secret': secret });
const remoto = (cab = {}) => ({ 'x-test-ip': REMOTO, ...cab });

async function pilha(fn, { desligadas = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-local-endur-'));
  const acesso = controleAcesso.criarControleAcesso({
    allowlistPath: () => path.join(dir, 'a.json'), revogadosPath: () => path.join(dir, 'r.json'), emitParaSocket() {}, broadcast() {}, notificar() {},
  });
  acesso.abrirJanelaInscricao();
  acesso.autenticar({ deviceId: 'mobile-ok-0001', secret: SEG });
  acesso.autenticar({ deviceId: 'mobile-rev-0001', secret: SEG });
  acesso.revogarDispositivo('mobile-rev-0001');
  acesso.fecharJanelaInscricao();
  acesso.autenticar({ deviceId: 'mobile-pend-0001', secret: SEG });

  const interna = credencialInterna.criarCredencialInterna();
  const h = interna.aplicarAosCabecalhos({});
  const credInterna = { 'X-Lyra-Device': h['X-Lyra-Device'], 'X-Lyra-Secret': h['X-Lyra-Secret'] };
  const verificar = credencialInterna.criarVerificadorHttp({ interna, verificarBase: (a) => acesso.verificarCredencial(a) });
  const guardas = guardasRotas.criarGuardasRotas({ verificar, desligadas });
  const exigirCredencial = guardas.exigirCredencial();
  const auth = autenticacaoHttp.criarAutenticacaoHttp({ modo: 'registrar', contexto: 'local-5510', verificar, registrar: () => {}, registrarDecisao: () => {} });
  const exec = [];
  const roda = (nome) => (_q, res) => { exec.push(nome); res.json({ ok: true }); };
  const app = express();
  app.use((req, _res, next) => {
    const ip = req.headers['x-test-ip'];
    if (ip) Object.defineProperty(req.socket, 'remoteAddress', { value: ip, configurable: true });
    next();
  });
  app.use(auth.middleware);
  app.use(guardas.limitarTaxa());
  app.use(guardas.selecionarJson({ pequeno: express.json({ limit: '1mb' }), grande: express.json({ limit: '200mb' }) }));
  app.use(guardas.tratarErroCorpo);
  app.put('/api/display-routing', exigirCredencial, roda('routing'));
  app.put('/api/display-config', exigirCredencial, roda('config'));
  app.put('/api/display-config/preview', exigirCredencial, roda('preview'));
  app.get('/api/display-config', roda('ler-config'));
  app.get('/api/display-routing', roda('ler-routing'));
  app.get('/api/monitores', roda('monitores'));
  app.post('/api/comando/audio_play', roda('comando'));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn({ porta: server.address().port, exec, credInterna });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

const ROTAS = [['PUT', '/api/display-routing'], ['PUT', '/api/display-config'], ['PUT', '/api/display-config/preview']];

test('painel local (credencial INTERNA, da própria máquina) e mobile (dispositivo autorizado, de outro IP) continuam funcionando', async () => {
  await pilha(async ({ porta, exec, credInterna }) => {
    for (const [m, c] of ROTAS) {
      assert.equal((await chamar(porta, m, c, { a: 1 }, credInterna)).status, 200, `painel ${c}`);
      assert.equal((await chamar(porta, m, c, { a: 1 }, remoto(cred('mobile-ok-0001')))).status, 200, `mobile ${c}`);
    }
    assert.equal(exec.length, 6);
  });
});

test('sem credencial, inválida, desconhecida, pendente ou revogada: recusa e o handler NÃO executa (vale também para a própria máquina)', async () => {
  await pilha(async ({ porta, exec }) => {
    const casos = [
      ['sem credencial (outro IP)', remoto(), 401, 'ausente'],
      ['sem credencial (própria máquina)', {}, 401, 'ausente'],
      ['segredo errado', remoto(cred('mobile-ok-0001', 'errado')), 401, 'secret-invalido'],
      ['desconhecido', remoto(cred('ninguem')), 401, 'desconhecido'],
      ['pendente', remoto(cred('mobile-pend-0001')), 403, 'pendente'],
      ['revogado', remoto(cred('mobile-rev-0001')), 401, 'revogado'],
    ];
    for (const [m, c] of ROTAS) {
      for (const [nome, cab, status, motivo] of casos) {
        const r = await chamar(porta, m, c, { a: 1 }, cab);
        assert.deepEqual({ s: r.status, m: r.json.motivo }, { s: status, m: motivo }, `${c} ${nome}`);
      }
    }
    assert.deepEqual(exec, []);
  });
});

test('a credencial INTERNA só vale no contexto local: de outro IP, ou repassada por proxy, é recusada', async () => {
  await pilha(async ({ porta, exec, credInterna }) => {
    assert.equal((await chamar(porta, 'PUT', '/api/display-config', { a: 1 }, remoto(credInterna))).status, 401);
    assert.equal((await chamar(porta, 'PUT', '/api/display-config', { a: 1 }, { ...credInterna, 'x-lyra-proxy': '1' })).status, 401);
    assert.deepEqual(exec, []);
  });
});

test('a LEITURA continua aberta (telões file://, OBS) e os comandos continuam como antes: nada além das 3 rotas mudou', async () => {
  await pilha(async ({ porta, exec }) => {
    for (const c of ['/api/display-config', '/api/display-routing', '/api/monitores']) assert.equal((await chamar(porta, 'GET', c, undefined, remoto())).status, 200, c);
    assert.equal((await chamar(porta, 'POST', '/api/comando/audio_play', { src: 'a' }, remoto())).status, 200);
    assert.deepEqual(exec, ['ler-config', 'ler-routing', 'monitores', 'comando']);
  });
});

test('corpo grande: painel local e dispositivo autorizado passam; estranho sem credencial vira 413', async () => {
  await pilha(async ({ porta, credInterna }) => {
    const grande = JSON.stringify({ lixo: 'x'.repeat(3 * 1024 * 1024) });
    assert.equal((await chamar(porta, 'PUT', '/api/display-config', grande, credInterna)).status, 200);
    assert.equal((await chamar(porta, 'PUT', '/api/display-config', grande, remoto(cred('mobile-ok-0001')))).status, 200);
    const r = await chamar(porta, 'PUT', '/api/display-config', grande, remoto());
    assert.equal(r.status === 413 || r.status === 'reset', true, `status ${r.status}`);
  });
});

test('chave de desligamento: guardas desligadas = comportamento de antes (um mobile antigo sem credencial continua funcionando)', async () => {
  await pilha(async ({ porta, exec }) => {
    for (const [m, c] of ROTAS) assert.equal((await chamar(porta, m, c, { a: 1 }, remoto())).status, 200, c);
    assert.equal(exec.length, 3);
  }, { desligadas: true });
});

/* ───────────────────────── fiação em projecaoLocal.js ───────────────────────── */

test('fiação: o motor local usa a guarda nas 3 rotas, escolhe o parser pelo risco e segue em «registrar»', () => {
  assert.match(FONTE, /apiApp\.put\('\/api\/display-routing',\s*exigirCredencial,/);
  assert.match(FONTE, /apiApp\.put\('\/api\/display-config',\s*exigirCredencial,/);
  assert.match(FONTE, /apiApp\.put\('\/api\/display-config\/preview',\s*exigirCredencial,/);
  assert.match(FONTE, /guardas\.selecionarJson\(\{/);
  assert.doesNotMatch(FONTE, /apiApp\.use\(express\.json\(/);
  assert.match(FONTE, /modo:\s*'registrar'/);
  assert.doesNotMatch(FONTE, /modo:\s*'impor'/);
  assert.doesNotMatch(FONTE, /apiApp\.(get|post|put)\('\/api\/comando\/[^']*',[^)]*exigirCredencial/, 'os comandos seguem só-loopback, sem a guarda nova');
});

test('fiação: o verificador da guarda é o MESMO da autenticação HTTP (interna do painel + allowlist deste processo)', () => {
  const i = FONTE.indexOf('const guardas = guardasRotasCore.criarGuardasRotas');
  assert.ok(i > 0);
  assert.match(FONTE.slice(i, i + 500), /credencialInternaCore\.criarVerificadorHttp\(\{[\s\S]*interna:\s*credencialInterna[\s\S]*acesso\.verificarCredencial\(auth\)/);
});

test('fiação: revogados persistentes, janela de inscrição, diálogo e rotas de gestão estão ligados no motor local', () => {
  assert.match(FONTE, /revogadosPath:\s*paths\.revogadosPath/);
  assert.match(FONTE, /inscricaoAutomatica:\s*process\.env\.LYRA_TOFU_LEGADO === '1'/);
  assert.match(FONTE, /evt === 'dispositivo_pendente'[\s\S]*dialogos\.aoPendente/);
  for (const r of ["'/api/controladores/janela'", "'/api/controladores/janela/abrir'", "'/api/controladores/janela/fechar'", "'/api/controladores/readmitir'"]) {
    assert.match(FONTE, new RegExp(`apiApp\\.(get|post)\\(${r.replace(/\//g, '\\/')},\\s*soLocal,`), r);
  }
  assert.match(FONTE, /dialogosDispositivos:\s*\(\) => \(activa \? dialogos : null\)/);
});

test('fiação: o controlador liga o diálogo (dialog do Electron) e o menu só aparece com o motor local ativo', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.match(main, /dialog:\s*require\('electron'\)\.dialog/);
  const menu = fs.readFileSync(path.join(__dirname, 'mainWindow.js'), 'utf8');
  for (const rot of ['Abrir inscrição de dispositivos (5 min)', 'Fechar inscrição de dispositivos', 'Aprovar dispositivos pendentes…']) {
    const i = menu.indexOf(rot);
    assert.ok(i > 0, rot);
    assert.match(menu.slice(i, i + 140), /visible:\s*!!ctx\.projecaoLocal\?\.estaActiva\(\)/, rot);
  }
});
