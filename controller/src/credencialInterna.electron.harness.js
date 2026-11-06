'use strict';

/**
 * Harness da integração REAL com o Electron (E1.3 Fase B — arquitetura W).
 *
 * Não é um teste: é o programa que o teste `credencialInterna.electron.test.js` executa dentro
 * do Electron (`electron <este arquivo>`). Usa o módulo REAL (`credencialInternaPainel`), janelas
 * reais, `session.webRequest` real e servidores HTTP/Express reais com a autenticação HTTP em
 * modo `impor` — em portas de teste (43001 = «3001», 45510 = «5510») e allowlist temporária.
 * Nenhum dado nem servidor de produção é tocado; o `userData` é um diretório temporário.
 *
 * Resultado: JSON em `process.env.LYRA_HARNESS_OUT` (lista de cenários) e código de saída.
 */

const { app, BrowserWindow, net, session } = require('electron');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-cred-electron-'));
app.setPath('userData', path.join(TMP, 'ud'));
const OUT = process.env.LYRA_HARNESS_OUT || path.join(TMP, 'resultado.json');

const { controleAcesso, autenticacaoHttp, credencialInterna, provaPropriedade } = require('@lyra/projection-core');
const { spawn } = require('child_process');
const { criarIntegracao } = require('./credencialInternaPainel');

const P_API = 43001;
const P_PROJ = 45510;
const P_OUTRA = 43999;
const ORIGEM = `http://127.0.0.1:${P_API}`;
const CONFIG = { origemPainel: ORIGEM, portas: [String(P_API), String(P_PROJ)], portaMotorLocal: String(P_PROJ) };
const RH = { 'X-Lyra-Device': 'renderer-dev', 'X-Lyra-Secret': 'renderer-secret', 'X-Lyra-App': '9.9.9' };

const resultados = [];
const logs = [];
/** Problemas de INFRAESTRUTURA do harness (servidor/filho que não encerrou etc.): o teste falha se houver algum. */
const problemas = [];
let ultimoCenario = null;
const rec = (cenario, ok, evidencia) => {
  resultados.push({ cenario, ok: !!ok, evidencia: evidencia === undefined ? '' : String(evidencia) });
  ultimoCenario = cenario;
  const l = `${ok ? 'OK  ' : 'FALHA'} | ${cenario} | ${evidencia === undefined ? '' : evidencia}`;
  logs.push(l);
  console.log(l);
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let marcador = 0;
const novoMarcador = () => `m${++marcador}`;

/**
 * Espera ATIVA: reavalia `fn` a cada `passoMs` até devolver algo verdadeiro ou estourar `timeoutMs`.
 * Devolve o valor, ou `null` no estouro (o cenário então registra a falha com a sua evidência: nada
 * é escondido). O custo do limite só é pago quando a condição NÃO ocorre; no caminho normal a espera
 * termina na primeira vez em que a condição vale.
 */
async function aguardarAte(fn, { timeoutMs = 5000, passoMs = 25 } = {}) {
  const fim = Date.now() + timeoutMs;
  for (;;) {
    let v = null;
    try { v = fn(); } catch (_) { v = null; }
    if (v) return v;
    if (Date.now() >= fim) return null;
    await esperar(passoMs);
  }
}

/* ───────────────────────── resultado atômico, vigia e filhos ───────────────────────── */

/** Grava `OUT` por arquivo temporário + rename: o teste nunca lê um JSON pela metade. */
function gravarResultado(completo, extra) {
  const corpo = JSON.stringify({ electron: process.versions.electron, completo, ultimoCenario, problemas, resultados, ...(extra || {}) }, null, 1);
  const tmp = `${OUT}.tmp`;
  fs.writeFileSync(tmp, corpo);
  fs.renameSync(tmp, OUT);
}

/** Processos filhos (Servidor «separado» simulado) ainda vivos: todos são mortos na saída. */
const filhos = new Set();
function matarFilhos() {
  for (const f of filhos) { try { f.kill(); } catch (_) { /* ignora */ } }
}

/**
 * Mata o filho e ESPERA ele sumir (a porta só fica livre depois). Dois sinais, o que vier primeiro:
 * o evento `exit` ou o PID não existir mais no SO (sob CPU saturada o evento chega atrasado).
 * Limitado; `false` se não saiu no prazo.
 */
function encerrarFilho(f, timeoutMs = 15000) {
  const vivo = () => { try { process.kill(f.pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  return new Promise((resolve) => {
    if (f.exitCode !== null || f.signalCode !== null) return resolve(true);
    let fim = false;
    const concluir = (ok) => { if (fim) return; fim = true; clearTimeout(t); clearInterval(i); resolve(ok); };
    const t = setTimeout(() => concluir(false), timeoutMs);
    const i = setInterval(() => { if (!vivo()) concluir(true); }, 50);
    f.once('exit', () => concluir(true));
    try { f.kill(); } catch (_) { /* ignora */ }
  });
}

/**
 * Vigia global: o harness inteiro leva ~11 s isolado e no máximo ~70 s sob carga total de CPU
 * (medido, todos os núcleos saturados); 140 s dá o dobro de folga. Se estourar, grava o que existe (com o último
 * cenário alcançado) e sai com código 2 — o travamento deixa de ser anônimo.
 */
const LIMITE_HARNESS_MS = 140000;
let encerrando = false;
function sairForcado(codigo, motivo) {
  if (encerrando) return;
  encerrando = true;
  problemas.push(motivo);
  console.log(`\nHARNESS INTERROMPIDO: ${motivo} | último cenário: ${ultimoCenario}`);
  try { gravarResultado(false); } catch (_) { /* ignora */ }
  matarFilhos();
  setTimeout(() => process.exit(codigo), 2000);
  try { app.exit(codigo); } catch (_) { process.exit(codigo); }
}
setTimeout(() => sairForcado(2, `vigia global: harness passou de ${LIMITE_HARNESS_MS} ms`), LIMITE_HARNESS_MS);
process.on('uncaughtException', (e) => sairForcado(3, `exceção não tratada: ${e && e.stack ? e.stack : e}`));
process.on('unhandledRejection', (e) => sairForcado(3, `rejeição não tratada: ${e && e.stack ? e.stack : e}`));

/* ───────────────────────── servidores reais em portas de teste ───────────────────────── */

const WAV = Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=', 'base64');

function paginaHtml() {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>harness</body></html>';
}

function criarServidor({ porta, contexto, interna, acesso, host = '127.0.0.1', comAuth = true }) {
  const recs = [];
  const eventosAuth = [];
  const auth = autenticacaoHttp.criarAutenticacaoHttp({
    modo: 'impor',
    contexto,
    verificar: credencialInterna.criarVerificadorHttp({ interna, verificarBase: (a) => acesso.verificarCredencial(a) }),
    registrar: (e) => eventosAuth.push(JSON.stringify(e)),
  });
  const exec = [];
  const app2 = express();
  app2.use((req, res, next) => {
    recs.push({
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v])),
    });
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-lyra-app, x-lyra-device, x-lyra-secret');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });
  if (comAuth) app2.use(auth.middleware);
  app2.use(express.json());
  for (const p of ['/controller.html', '/historico.html', '/tela.html', '/child.html', '/frame.html', '/outro.html']) {
    app2.get(p, (_q, res) => res.type('html').send(paginaHtml()));
  }
  app2.get('/redir', (req, res) => res.redirect(302, String(req.query.to)));
  app2.get('/api/apresentacao/video/:id', (_q, res) => res.type('audio/wav').send(WAV)); // pública (mídia)
  app2.all(/^\/api\//, (req, res) => {
    exec.push(`${req.method} ${req.path}`);
    res.json({ ok: true });
  });
  const server = http.createServer(app2);
  server.on('upgrade', (req, sock) => {
    recs.push({ method: 'UPGRADE', url: req.url, headers: { ...req.headers } });
    sock.destroy();
  });
  /* Sockets rastreados: o Chromium abre conexões de pré-conexão que nunca enviam requisição e que
     seguram `server.close()` para sempre. Ao encerrar, todas são destruídas. */
  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  /** Fecha o servidor e as conexões, com limite. `false` (e um problema registrado) se não fechou. */
  const encerrar = (timeoutMs = 5000) => new Promise((resolve) => {
    if (!server.listening) return resolve(true);
    let fim = false;
    const t = setTimeout(() => {
      if (fim) return;
      fim = true;
      problemas.push(`servidor :${porta} (${host}) não fechou em ${timeoutMs} ms (sockets restantes=${sockets.size})`);
      resolve(false);
    }, timeoutMs);
    server.close(() => { if (!fim) { fim = true; clearTimeout(t); resolve(true); } });
    try { server.closeIdleConnections(); } catch (_) { /* ignora */ }
    try { server.closeAllConnections(); } catch (_) { /* ignora */ }
    for (const s of sockets) { try { s.destroy(); } catch (_) { /* ignora */ } }
  });
  return new Promise((resolve) => server.listen(porta, host, () => resolve({ server, recs, eventosAuth, exec, porta, host, encerrar })));
}

/* ───────────────────────── utilidades de página ───────────────────────── */

function criarJanela(url, webPreferences) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, ...(webPreferences || {}) },
  });
  win.webContents.on('console-message', (_e, _l, msg) => logs.push(`[renderer:${win.webContents.id}] ${msg}`));
  return new Promise((resolve) => {
    win.webContents.once('did-finish-load', () => resolve(win));
    win.loadURL(url);
  });
}

async function fetchNaPagina(alvo, url, { method = 'GET', headers = {}, body } = {}) {
  const js = `(async()=>{try{const r=await fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:${JSON.stringify(headers)}${body ? `,body:${JSON.stringify(body)}` : ''}});return r.status}catch(e){return 'ERRO:'+e.message}})()`;
  return alvo.executeJavaScript(js);
}

const achar = (srv, marca, metodo) => srv.recs.filter((r) => r.url.includes(marca) && (!metodo || r.method === metodo)).pop() || null;

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const acesso = controleAcesso.criarControleAcesso({ opcoes: { inscricaoAutomatica: true },
    allowlistPath: () => path.join(TMP, 'allow.json'),
    emitParaSocket: () => {},
    broadcast: () => {},
    notificar: () => {},
  });
  acesso.autenticar({ deviceId: 'dev-real-0001', secret: 'SEG-REAL' }); // um dispositivo comum autorizado
  acesso.travar();
  const allowAntes = fs.readFileSync(path.join(TMP, 'allow.json'), 'utf8');

  /* O «motor local» deste processo: o servidor HTTP que ELE possui (como `servidorApi` da projeção local). */
  let servidorMotor = null;
  const prova = provaPropriedade.criarProvaPropriedade({ obterServidor: () => servidorMotor, porta: P_PROJ, ttlMs: 0, timeoutMs: 400 });

  /* Integração REAL, em desenvolvimento (DevTools liberadas) na sessão padrão. */
  const integ = criarIntegracao({ session: session.defaultSession, app: { isPackaged: false }, config: CONFIG, shell: { openExternal: async () => {} }, provarMotorLocal: () => prova.provar() });
  const interna = integ.interna;
  const hInterna = interna.aplicarAosCabecalhos({});
  const SECRET = hInterna['X-Lyra-Secret'];
  const DEVICE = hInterna['X-Lyra-Device'];

  const api = await criarServidor({ porta: P_API, contexto: 'controlador-3001', interna, acesso });
  const proj = await criarServidor({ porta: P_PROJ, contexto: 'local-5510', interna, acesso });
  servidorMotor = proj.server;
  const outra = await criarServidor({ porta: P_OUTRA, contexto: 'outra', interna, acesso, comAuth: false });
  const alt = await criarServidor({ porta: P_API, contexto: 'alt', interna, acesso, host: '127.0.0.2', comAuth: false });

  /* Cabeçalhos FINAIS (depois da injeção) de tudo que sai pela sessão padrão. */
  const finais = [];
  session.defaultSession.webRequest.onSendHeaders({ urls: ['<all_urls>'] }, (d) => {
    const h = Object.fromEntries(Object.entries(d.requestHeaders).map(([k, v]) => [k.toLowerCase(), v]));
    finais.push({ url: d.url, tipo: d.resourceType, metodo: d.method, wc: d.webContentsId, comSecret: h['x-lyra-secret'] === SECRET, comDevice: h['x-lyra-device'] === DEVICE });
  });

  const wcCriadas = new Map();
  app.on('web-contents-created', (_e, wc) => wcCriadas.set(wc.id, wc.getType()));

  /* ====== janelas ====== */
  let painel = await criarJanela(`${ORIGEM}/controller.html`);
  const idPainel = integ.autorizarJanela(painel, { papel: 'painel', pagina: '/controller.html' });
  // O painel real registra a janela ANTES de carregar; aqui basta registrar antes de qualquer fetch.
  const historico = await criarJanela(`${ORIGEM}/historico.html`);
  const idHist = integ.autorizarJanela(historico, { papel: 'historico', pagina: '/historico.html' });
  const telao = await criarJanela(`${ORIGEM}/tela.html`);
  const janelaOutra = await criarJanela(`http://127.0.0.1:${P_OUTRA}/outro.html`);

  /* ====== Painel principal em `impor`: aceito sem o renderer mandar nada ====== */
  {
    const casos = [
      ['GET', `${ORIGEM}/api/musicas`, undefined],
      ['HEAD', `${ORIGEM}/api/musicas`, undefined],
      ['POST', `${ORIGEM}/api/comando/slide`, '{"x":1}'],
      ['PUT', `${ORIGEM}/api/display-config`, '{"x":1}'],
      ['DELETE', `${ORIGEM}/api/musicas/1`, undefined],
      ['GET', `http://127.0.0.1:${P_PROJ}/api/monitores`, undefined],
      ['PUT', `http://127.0.0.1:${P_PROJ}/api/display-routing`, '{"x":1}'],
      ['GET', `http://localhost:${P_API}/api/musicas`, undefined],
    ];
    let ok = true;
    const ev = [];
    for (const [metodo, url, body] of casos) {
      const m = novoMarcador();
      const st = await fetchNaPagina(painel.webContents, `${url}?${m}`, { method: metodo, headers: body ? { 'Content-Type': 'application/json' } : {}, body });
      ev.push(`${metodo}:${st}`);
      if (st !== 200) ok = false;
    }
    rec('P1 painel em «impor»: GET/HEAD/POST/PUT/DELETE nas duas portas (e por localhost) passam SEM credencial do renderer', ok, ev.join(' '));
  }
  {
    const m = novoMarcador();
    await fetchNaPagina(painel.webContents, `${ORIGEM}/api/musicas?${m}`, { headers: RH });
    const r = achar(api, m);
    rec('P2 cabeçalhos X-Lyra-* do renderer são SUBSTITUÍDOS pelos internos, sem duplicar; X-Lyra-App é preservado',
      r && r.headers['x-lyra-device'] === DEVICE && r.headers['x-lyra-secret'] === SECRET && r.headers['x-lyra-app'] === '9.9.9', r && `device=${r.headers['x-lyra-device']}`);
  }
  {
    const m = novoMarcador();
    const st = await fetchNaPagina(painel.webContents, `http://127.0.0.1:${P_PROJ}/api/display-routing?${m}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
    const pre = achar(proj, m, 'OPTIONS');
    const put = achar(proj, m, 'PUT');
    rec('P3 CORS/preflight cross-origin (43001→45510): o OPTIONS NÃO leva o segredo; o PUT real leva e passa',
      st === 200 && !!pre && pre.headers['x-lyra-secret'] === undefined && !!put && put.headers['x-lyra-secret'] === SECRET, `status=${st} preflight=${!!pre}`);
  }
  {
    const m = novoMarcador();
    const xhr = await painel.webContents.executeJavaScript(`new Promise(res=>{const x=new XMLHttpRequest();x.open('GET','${ORIGEM}/api/musicas?${m}');x.onloadend=()=>res(x.status);x.send()})`);
    const m2 = novoMarcador();
    await painel.webContents.executeJavaScript(`navigator.sendBeacon('${ORIGEM}/api/beacon?${m2}', new Blob(['{}'],{type:'application/json'}))`);
    // sendBeacon é assíncrono: espera ativa (limitada) pelo servidor registrar o ping.
    const ping = await aguardarAte(() => achar(api, m2), { timeoutMs: 5000 });
    rec('P4 XMLHttpRequest e sendBeacon (ping) também recebem a credencial interna', xhr === 200 && !!ping && ping.headers['x-lyra-secret'] === SECRET, `xhr=${xhr} ping=${ping ? 'chegou' : 'NAO chegou em 5 s'}`);
  }
  {
    const m = novoMarcador();
    const st = await painel.webContents.executeJavaScript(`new Promise(res=>{const a=document.createElement('audio');a.oncanplaythrough=a.onloadeddata=()=>res('carregou');a.onerror=()=>res('erro');a.src='${ORIGEM}/api/apresentacao/video/teste?${m}';a.load();setTimeout(()=>res('timeout'),4000)})`);
    const r = achar(api, m);
    rec('P5 mídia (<audio>/<video>) segue pública, sem credencial injetada e sem erro', !!r && r.headers['x-lyra-secret'] === undefined && st !== 'erro', `estado=${st} acessou=${!!r}`);
  }

  /* ====== Histórico ====== */
  {
    const m = novoMarcador();
    const st = await fetchNaPagina(historico.webContents, `${ORIGEM}/api/historico?${m}`);
    const st2 = await fetchNaPagina(historico.webContents, `${ORIGEM}/api/historico/limpar?${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    rec('H1 Histórico (janela registrada) em «impor»: leitura e escrita passam', st === 200 && st2 === 200, `get=${st} post=${st2}`);
    const m2 = novoMarcador();
    const cruzada = await fetchNaPagina(historico.webContents, `http://127.0.0.1:${P_PROJ}/api/monitores?${m2}`);
    rec('H2 Histórico também alcança a 5510 local (portas permitidas)', cruzada === 200, `status=${cruzada}`);
  }

  /* ====== Janela substituída / reload ====== */
  {
    const antes = painel.webContents.id;
    painel.webContents.reload();
    await new Promise((r) => painel.webContents.once('did-finish-load', r));
    const st = await fetchNaPagina(painel.webContents, `${ORIGEM}/api/musicas?${novoMarcador()}`);
    rec('R1 após reload (mesmo webContents) continua autorizado', st === 200 && painel.webContents.id === antes, `status=${st}`);

    painel.close();
    await aguardarAte(() => !integ.registro.tem(antes), { timeoutMs: 5000 });
    const removida = !integ.registro.tem(antes);
    painel = await criarJanela(`${ORIGEM}/controller.html`);
    const idNovo = integ.autorizarJanela(painel, { papel: 'painel', pagina: '/controller.html' });
    const st2 = await fetchNaPagina(painel.webContents, `${ORIGEM}/api/musicas?${novoMarcador()}`);
    rec('R2 janela substituída: id antigo removido do registro, id novo autorizado e funcionando', removida && idNovo !== antes && st2 === 200 && !integ.registro.tem(antes), `antigo=${antes} novo=${idNovo} status=${st2}`);
    void idPainel;

    const intrusa = await criarJanela(`${ORIGEM}/controller.html`);
    const st3 = await fetchNaPagina(intrusa.webContents, `${ORIGEM}/api/musicas?${novoMarcador()}`, { headers: RH });
    rec('R3 janela com a MESMA URL do painel, mas não registrada, é recusada em «impor» (URL sozinha não basta)', st3 === 401, `status=${st3}`);
    intrusa.destroy();

    historico.close();
    await aguardarAte(() => !integ.registro.tem(idHist), { timeoutMs: 5000 });
    rec('R4 fechar o Histórico remove o registro e não afeta o painel',
      !integ.registro.tem(idHist) && (await fetchNaPagina(painel.webContents, `${ORIGEM}/api/musicas?${novoMarcador()}`)) === 200, `registrado=${integ.registro.tem(idHist)}`);
  }

  /* ====== Telão, janelas de outra origem, filhas ====== */
  {
    const semCred = await fetchNaPagina(telao.webContents, `${ORIGEM}/api/musicas?${novoMarcador()}`);
    const falsa = await fetchNaPagina(telao.webContents, `${ORIGEM}/api/comando/slide?${novoMarcador()}`, { method: 'POST', headers: { ...RH, 'Content-Type': 'application/json' }, body: '{}' });
    const m = novoMarcador();
    await fetchNaPagina(telao.webContents, `${ORIGEM}/api/musicas?${m}`, { headers: RH });
    const r = achar(api, m);
    rec('T1 telão (mesma origem, não registrado): NÃO recebe a credencial; dispositivo desconhecido é recusado em «impor» (401)',
      semCred === 401 && falsa === 401 && !!r && r.headers['x-lyra-secret'] === 'renderer-secret', `sem=${semCred} falsa=${falsa}`);
    const stOutra = await fetchNaPagina(janelaOutra.webContents, `${ORIGEM}/api/musicas?${novoMarcador()}`, { headers: RH });
    rec('T2 janela de outra origem: sem credencial interna (401)', stOutra === 401, `status=${stOutra}`);
  }
  {
    const antes = new Set(wcCriadas.keys());
    const retorno = await painel.webContents.executeJavaScript(`(()=>{const w=window.open('${ORIGEM}/child.html');return w===null?'nulo':'janela'})()`);
    // Ausência de efeito (nenhuma janela filha): janela de observação fixa; o retorno nulo de window.open já é síncrono.
    await esperar(800);
    const novas = [...wcCriadas.keys()].filter((id) => !antes.has(id));
    rec('T3 window.open a partir do painel é NEGADO (nenhuma janela filha herda a credencial)', retorno === 'nulo' && novas.length === 0, `retorno=${retorno} novas=${novas.length}`);
  }
  {
    await painel.webContents.executeJavaScript(`location.href='${ORIGEM}/tela.html'; 1`);
    // Ausência de efeito (navegação barrada): janela de observação fixa.
    await esperar(800);
    const url = painel.webContents.getURL();
    rec('T4 will-navigate: o painel não consegue navegar para outra página (/tela.html) e herdar a credencial', url.endsWith('/controller.html'), url);
  }

  /* ====== Destinos não permitidos ====== */
  {
    const m = novoMarcador();
    await fetchNaPagina(painel.webContents, `http://127.0.0.1:${P_OUTRA}/api/musicas?${m}`, { headers: { 'X-Lyra-App': '1' } });
    const r = achar(outra, m);
    rec('D1 porta não autorizada (43999): chega SEM credencial', !!r && r.headers['x-lyra-secret'] === undefined && r.headers['x-lyra-device'] === undefined, r ? 'sem segredo' : 'não chegou');
    const m2 = novoMarcador();
    await fetchNaPagina(painel.webContents, `http://127.0.0.2:${P_API}/api/musicas?${m2}`, { headers: { 'X-Lyra-App': '1' } });
    const r2 = achar(alt, m2);
    rec('D2 outro IP de loopback (127.0.0.2): SEM credencial', !!r2 && r2.headers['x-lyra-secret'] === undefined, r2 ? 'sem segredo' : 'não chegou');
    const m3 = novoMarcador();
    await Promise.race([fetchNaPagina(painel.webContents, `http://203.0.113.9:${P_API}/x?${m3}`), esperar(1500)]);
    await Promise.race([fetchNaPagina(painel.webContents, `http://nao-existe.invalid:${P_API}/x?${m3}`), esperar(1500)]);
    const externos = finais.filter((f) => f.url.includes('203.0.113.9') || f.url.includes('nao-existe.invalid'));
    rec('D3 host externo (203.0.113.9 e domínio .invalid): nenhuma requisição saiu com a credencial interna', externos.length >= 1 && externos.every((f) => !f.comSecret && !f.comDevice), `requisições=${externos.length}`);
    const m4 = novoMarcador();
    await fetchNaPagina(painel.webContents, `${ORIGEM}/redir?to=${encodeURIComponent(`http://127.0.0.2:${P_API}/depois?${m4}`)}&${m4}`);
    const salto2 = achar(alt, m4);
    rec('D4 redirect permitido→127.0.0.2: o segundo salto NÃO leva a credencial', !!salto2 && salto2.headers['x-lyra-secret'] === undefined, salto2 ? 'sem segredo' : 'não chegou');
    const todas = finais.filter((f) => f.comSecret || f.comDevice);
    rec('D5 em TODO o teste, a credencial só saiu para 127.0.0.1/localhost nas portas permitidas, via XHR/fetch/ping, de webContents registrados',
      todas.every((f) => /^http:\/\/(127\.0\.0\.1|localhost):(43001|45510)\//.test(f.url) && ['xhr', 'ping'].includes(f.tipo) && f.metodo !== 'OPTIONS'), `saídas com credencial=${todas.length}`);
  }

  /* ====== Iframes ====== */
  {
    await painel.webContents.executeJavaScript(`new Promise(r=>{const f=document.createElement('iframe');f.src='http://127.0.0.1:${P_OUTRA}/frame.html';f.onload=()=>r(1);document.body.appendChild(f)})`);
    const filho = painel.webContents.mainFrame.frames.find((f) => f.url.includes(`:${P_OUTRA}`));
    let st = 'sem frame';
    if (filho) st = await filho.executeJavaScript(`fetch('${ORIGEM}/api/musicas?${novoMarcador()}').then(r=>r.status).catch(e=>'ERRO')`);
    await painel.webContents.executeJavaScript(`new Promise(r=>{const f=document.createElement('iframe');f.src='${ORIGEM}/controller.html';f.onload=()=>r(1);document.body.appendChild(f)})`);
    const mesmo = painel.webContents.mainFrame.frames.find((f) => f.url === `${ORIGEM}/controller.html`);
    let st2 = 'sem frame';
    if (mesmo) st2 = await mesmo.executeJavaScript(`fetch('${ORIGEM}/api/musicas?${novoMarcador()}').then(r=>r.status).catch(e=>'ERRO')`);
    rec('F1 iframe (cross-origin e da mesma página) DENTRO do painel não recebe a credencial (401 em «impor»)', st === 401 && st2 === 401, `cross=${st} mesmo=${st2}`);
  }

  /* ====== Socket.IO / WebSocket ====== */
  {
    const m = novoMarcador();
    await painel.webContents.executeJavaScript(`new Promise(r=>{const w=new WebSocket('ws://127.0.0.1:${P_API}/socket.io/?${m}');w.onclose=()=>r(1);w.onerror=()=>r(0)})`);
    const up = await aguardarAte(() => achar(api, m, 'UPGRADE'), { timeoutMs: 5000 });
    rec('S1 handshake WebSocket do painel NÃO recebe a credencial interna (Socket.IO não a aceita)', !!up && up.headers['x-lyra-secret'] === undefined && up.headers['x-lyra-device'] === undefined, up ? 'upgrade sem segredo' : 'sem upgrade');
  }

  /* ====== Processo principal ====== */
  {
    const m = novoMarcador();
    let st = 'ERRO';
    try { st = (await net.fetch(`${ORIGEM}/api/musicas?${m}`)).status; } catch (_) { /* ignora */ }
    const m2 = novoMarcador();
    let st2 = 'ERRO';
    try { st2 = (await session.defaultSession.fetch(`${ORIGEM}/api/musicas?${m2}`)).status; } catch (_) { /* ignora */ }
    rec('M1 net.fetch / session.fetch do processo principal NÃO recebem a credencial (401 em «impor»)', st === 401 && st2 === 401, `net=${st} session=${st2}`);
  }

  /* ====== Segredo ausente no renderer, nos logs e no disco ====== */
  {
    const dump = await painel.webContents.executeJavaScript(`(()=>{const c=[];try{c.push(JSON.stringify(localStorage))}catch(e){}try{c.push(JSON.stringify(sessionStorage))}catch(e){}c.push(document.cookie);c.push(document.documentElement.outerHTML);c.push(Object.keys(window).join(','));c.push(JSON.stringify(performance.getEntriesByType('resource').map(e=>e.name)));return c.join('\\n')})()`);
    const resp = await painel.webContents.executeJavaScript(`fetch('${ORIGEM}/api/musicas').then(async r=>JSON.stringify([...r.headers.entries()])+await r.text())`);
    rec('X1 credencial AUSENTE no renderer (localStorage, cookies, DOM, window, resource timing) e nas respostas',
      !dump.includes(SECRET) && !dump.includes(DEVICE) && !resp.includes(SECRET) && !resp.includes(DEVICE), `bytes=${dump.length}`);
    const evAuth = [...api.eventosAuth, ...proj.eventosAuth].join('\n');
    rec('X2 o registro da autenticação HTTP (eventos) nunca contém o segredo', !evAuth.includes(SECRET), `eventos=${api.eventosAuth.length + proj.eventosAuth.length}`);
    rec('X3 a allowlist não mudou (conteúdo idêntico) e não contém o id interno',
      fs.readFileSync(path.join(TMP, 'allow.json'), 'utf8') === allowAntes && !fs.readFileSync(path.join(TMP, 'allow.json'), 'utf8').includes(DEVICE), '');
  }

  /* ====== DevTools ====== */
  {
    const sesProd = session.fromPartition('harness-producao');
    const prod = criarIntegracao({ session: sesProd, app: { isPackaged: true }, config: CONFIG, shell: { openExternal: async () => {} } });
    const wProd = new BrowserWindow({ show: false, webPreferences: prod.webPreferences({ partition: 'harness-producao', sandbox: true, contextIsolation: true, nodeIntegration: false }) });
    await new Promise((r) => { wProd.webContents.once('did-finish-load', r); wProd.loadURL(`${ORIGEM}/controller.html`); });
    prod.autorizarJanela(wProd, { papel: 'painel', pagina: '/controller.html' });
    try { wProd.webContents.openDevTools({ mode: 'detach' }); } catch (_) { /* esperado */ }
    // Ausência de efeito (devTools:false: nada abre): não existe evento positivo a aguardar; janela de observação curta e fixa.
    await esperar(500);
    rec('V1 produção: webPreferences.devTools=false — openDevTools() não abre', prod.devToolsPermitido === false && wProd.webContents.isDevToolsOpened() === false, `aberto=${wProd.webContents.isDevToolsOpened()}`);
    rec('V2 produção: guardas de atalho instaladas (before-input-event/devtools-opened)', wProd.webContents.listenerCount('before-input-event') >= 1 && wProd.webContents.listenerCount('devtools-opened') >= 1, '');
    const mProd = novoMarcador();
    await fetchNaPagina(wProd.webContents, `${ORIGEM}/api/musicas?${mProd}`);
    const rProd = achar(api, mProd);
    const hProd = prod.interna.aplicarAosCabecalhos({});
    rec('V3 produção: a janela autorizada (sem DevTools) continua recebendo a credencial (a da SUA integração, distinta da outra)',
      !!rProd && rProd.headers['x-lyra-secret'] === hProd['X-Lyra-Secret'] && hProd['X-Lyra-Secret'] !== SECRET, rProd ? 'injetada' : 'sem registro');
    wProd.destroy();

    const wDev = new BrowserWindow({ show: false, webPreferences: integ.webPreferences({ sandbox: true, contextIsolation: true, nodeIntegration: false }) });
    await new Promise((r) => { wDev.webContents.once('did-finish-load', r); wDev.loadURL(`${ORIGEM}/tela.html`); });
    try { wDev.webContents.openDevTools({ mode: 'detach' }); } catch (_) { /* ignora */ }
    // Abertura das DevTools é assíncrona e lenta sob carga: medido de ~2 s a ~16 s com todos os núcleos saturados; limite de 45 s (só consumidos se não abrir).
    const t0V4 = Date.now();
    const abriu = await aguardarAte(() => wDev.webContents.isDevToolsOpened(), { timeoutMs: 45000, passoMs: 50 });
    rec('V4 desenvolvimento: DevTools continuam disponíveis', integ.devToolsPermitido === true && abriu === true && wDev.webContents.isDevToolsOpened() === true, `aberto=${wDev.webContents.isDevToolsOpened()} em ${Date.now() - t0V4} ms`);
    try { wDev.webContents.closeDevTools(); } catch (_) { /* ignora */ }
    await aguardarAte(() => !wDev.webContents.isDevToolsOpened(), { timeoutMs: 5000 });
    wDev.destroy();
  }

  /* ====== 5510: só o motor local PRÓPRIO recebe; Servidor separado nunca ====== */
  {
    const URL5510 = `http://127.0.0.1:${P_PROJ}`;
    const orig = (r) => !!r && r.headers['x-lyra-device'] === 'renderer-dev' && r.headers['x-lyra-secret'] === 'renderer-secret' && r.headers['x-lyra-app'] === '9.9.9';

    const m0 = novoMarcador();
    await fetchNaPagina(painel.webContents, `${URL5510}/api/monitores?${m0}`, { headers: RH });
    rec('Q1 motor local ativo (propriedade comprovada): a 5510 recebe a credencial interna', !!achar(proj, m0) && achar(proj, m0).headers['x-lyra-secret'] === SECRET, '');

    servidorMotor = null; // motor local parado: o que responder em 5510 não é nosso
    const m1 = novoMarcador();
    const st1 = await fetchNaPagina(painel.webContents, `${URL5510}/api/monitores?${m1}`, { headers: RH });
    rec('Q2 motor local parado: a 5510 NÃO recebe a interna e os cabeçalhos originais do renderer são preservados', orig(achar(proj, m1)) && st1 === 401, `status=${st1}`);
    const m1b = novoMarcador();
    await fetchNaPagina(painel.webContents, `${URL5510}/api/monitores?${m1b}`);
    rec('Q2b sem cabeçalhos do renderer, nada é inventado (nenhuma credencial chega)', !!achar(proj, m1b) && achar(proj, m1b).headers['x-lyra-secret'] === undefined, '');
    servidorMotor = proj.server;
    const m1d = novoMarcador();
    await fetchNaPagina(painel.webContents, `http://localhost:${P_PROJ}/api/monitores?${m1d}`, { headers: RH });
    rec('Q2c «localhost»:5510 NUNCA recebe a interna, nem com o motor ativo (localhost não é comprovável)', orig(achar(proj, m1d)), '');

    /* Servidor separado de verdade: OUTRO PROCESSO do SO na mesma máquina e na mesma porta. */
    await proj.encerrar();
    const arq = path.join(TMP, 'separado.jsonl');
    const script = `const http=require('http'),fs=require('fs');http.createServer((q,s)=>{fs.appendFileSync(process.env.ARQ,JSON.stringify({url:q.url,h:q.headers})+'\\n');s.setHeader('Access-Control-Allow-Origin','*');s.setHeader('Access-Control-Allow-Headers','content-type, x-lyra-app, x-lyra-device, x-lyra-secret');s.setHeader('Access-Control-Allow-Methods','GET, PUT, OPTIONS');if(q.method==='OPTIONS'){s.statusCode=204;return s.end()}s.end('{}')}).listen(${P_PROJ},process.env.HOST,()=>console.log('pronto'))`;
    const abrirSeparado = (host) => new Promise((resolve, reject) => {
      const filho = spawn(process.execPath, ['-e', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ARQ: arq, HOST: host }, stdio: ['ignore', 'pipe', 'pipe'] });
      filhos.add(filho);
      filho.on('exit', () => filhos.delete(filho));
      let pronto = false;
      let falhou = false;
      const falhar = (motivo) => {
        if (pronto || falhou) return;
        falhou = true;
        clearTimeout(limite);
        try { filho.kill(); } catch (_) { /* ignora */ } // nenhum filho fica órfão num caminho de falha
        reject(new Error(motivo));
      };
      const limite = setTimeout(() => falhar('timeout'), 8000);
      filho.stdout.on('data', (d) => { if (String(d).includes('pronto') && !pronto && !falhou) { pronto = true; clearTimeout(limite); resolve(filho); } });
      filho.stderr.on('data', (d) => { if (!pronto && /EADDRINUSE|EACCES/.test(String(d))) falhar('bind'); });
      filho.on('exit', () => falhar('saiu'));
    });
    const lerSeparado = (marca) => {
      try {
        return fs.readFileSync(arq, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.url.includes(marca)).pop() || null;
      } catch (_) { return null; }
    };

    const sep = await abrirSeparado('127.0.0.1');
    const m2 = novoMarcador();
    await fetchNaPagina(painel.webContents, `${URL5510}/api/monitores?${m2}`, { headers: RH });
    const rs = lerSeparado(m2);
    rec('Q3 Servidor SEPARADO (outro processo, mesmo PC, mesma porta): NÃO recebe a interna; cabeçalhos originais preservados',
      !!rs && rs.h['x-lyra-device'] === 'renderer-dev' && rs.h['x-lyra-secret'] === 'renderer-secret' && rs.h['x-lyra-app'] === '9.9.9', rs ? 'chegou com os originais' : 'não chegou');
    const m2b = novoMarcador();
    await fetchNaPagina(painel.webContents, `${URL5510}/api/monitores?${m2b}`, { method: 'PUT', headers: { ...RH, 'Content-Type': 'application/json' }, body: '{}' });
    const rs2 = lerSeparado(m2b);
    rec('Q3b o mesmo vale para escrita cross-origin (PUT) no Servidor separado', !!rs2 && rs2.h['x-lyra-secret'] === 'renderer-secret', '');
    rec('Q3c o segredo interno jamais aparece no que o Servidor separado recebeu (arquivo inteiro)', !fs.readFileSync(arq, 'utf8').includes(SECRET), '');
    // Espera o `exit` do filho (a porta 45510 só fica livre depois dele), em vez de 500 ms fixos.
    const t0Q3 = Date.now();
    if (!(await encerrarFilho(sep))) problemas.push('Servidor separado (Q3) não encerrou em 15 s');
    console.log(`[diag] filho Q3 encerrou em ${Date.now() - t0Q3} ms`);

    /* Reinício do motor local: NOVO objeto servidor na mesma porta → re-provado */
    const proj2 = await criarServidor({ porta: P_PROJ, contexto: 'local-5510', interna, acesso, host: '0.0.0.0' });
    servidorMotor = proj2.server;
    const m3 = novoMarcador();
    await fetchNaPagina(painel.webContents, `${URL5510}/api/monitores?${m3}`, { headers: RH });
    rec('Q4 motor local reiniciado (novo servidor, mesma porta): volta a receber a interna', !!achar(proj2, m3) && achar(proj2, m3).headers['x-lyra-secret'] === SECRET, '');

    /* Outro processo no endereço específico 127.0.0.1:5510 enquanto o motor escuta em 0.0.0.0 */
    let intruso = null;
    try { intruso = await abrirSeparado('127.0.0.1'); } catch (_) { intruso = null; }
    if (!intruso) {
      // Cobertura obrigatória: sem o intruso, Q5 e Q5b NÃO foram exercitados. Isso é falha, não «ignorado».
      rec('Q5 OUTRO processo ocupando 127.0.0.1:5510 (motor em 0.0.0.0): a prova falha, ninguém recebe a interna e os originais são preservados', false, 'cenário NÃO executado: não foi possível abrir o intruso em 127.0.0.1:5510');
      rec('Q5b a prova de propriedade, feita por conexão nova, nega o motor enquanto o intruso ocupa 127.0.0.1:5510', false, 'cenário NÃO executado: sem intruso');
    } else {
      const m4 = novoMarcador();
      await fetchNaPagina(painel.webContents, `${URL5510}/api/monitores?${m4}`, { headers: RH });
      const ri = lerSeparado(m4);
      /* Com conexão keep-alive antiga a requisição ainda pode ir ao motor; em qualquer caminho a prova (conexão NOVA) cai no intruso e falha. */
      const noMotor = achar(proj2, m4);
      const originais = (ri && ri.h['x-lyra-secret'] === 'renderer-secret') || (noMotor && noMotor.headers['x-lyra-secret'] === 'renderer-secret');
      rec('Q5 OUTRO processo ocupando 127.0.0.1:5510 (motor em 0.0.0.0): a prova falha, ninguém recebe a interna e os originais são preservados',
        !!originais && !fs.readFileSync(arq, 'utf8').includes(SECRET) && !(noMotor && noMotor.headers['x-lyra-secret'] === SECRET), ri ? 'foi ao intruso, originais' : 'foi ao motor (keep-alive), originais');
      rec('Q5b a prova de propriedade, feita por conexão nova, nega o motor enquanto o intruso ocupa 127.0.0.1:5510', (await prova.provar()) === false, '');
      if (!(await encerrarFilho(intruso))) problemas.push('intruso (Q5) não encerrou em 15 s');
    }
    servidorMotor = null;
    await proj2.encerrar();
  }

  /* ====== Encerramento: logs e disco ====== */
  for (const w of BrowserWindow.getAllWindows()) w.destroy();
  // Observação (ausência de segredo nos logs/disco depois que tudo foi fechado): janela fixa, não evento.
  await esperar(1500);
  rec('Z1 credencial AUSENTE nos logs do renderer e do processo principal', !logs.join('\n').includes(SECRET), `linhas=${logs.length}`);
  const achados = [];
  let arquivos = 0;
  (function varrer(dir) {
    for (const nome of fs.readdirSync(dir)) {
      const p = path.join(dir, nome);
      let st;
      try { st = fs.statSync(p); } catch (_) { continue; }
      if (st.isDirectory()) { varrer(p); continue; }
      arquivos += 1;
      if (st.size > 64 * 1024 * 1024) continue;
      let b;
      try { b = fs.readFileSync(p); } catch (_) { continue; }
      if (b.includes(Buffer.from(SECRET))) achados.push(p);
    }
  })(TMP);
  rec('Z2 credencial NÃO persistida em disco (userData temporário inteiro varrido)', achados.length === 0, `arquivos=${arquivos} achados=${achados.length}`);

  /* Servidores restantes (api, outra, alt): fechados com limite; quem não fechar vira «problema». */
  for (const s of [api, outra, alt]) await s.encerrar();
  matarFilhos();

  if (encerrando) return; // o vigia já gravou o resultado parcial e está encerrando
  encerrando = true;
  console.log(`\nElectron ${process.versions.electron} | TOTAL ${resultados.length} | FALHAS ${resultados.filter((r) => !r.ok).length} | PROBLEMAS ${problemas.length}`);
  const falhou = resultados.some((r) => !r.ok) || problemas.length > 0;
  gravarResultado(true, { total: resultados.length });
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* ignora */ }
  // Cinto de segurança: se app.exit() não encerrar o processo, process.exit() encerra.
  setTimeout(() => process.exit(falhou ? 1 : 0), 3000);
  app.exit(falhou ? 1 : 0);
}).catch((e) => sairForcado(3, `exceção no harness: ${e && e.stack ? e.stack : e}`));
