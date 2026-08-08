/**
 * E2E real: Ferramentas › Encerrar Server
 * Uso: node tools/e2e-encerrar-server.js
 */
'use strict';

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { networkInterfaces } = require('os');

const ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');
const CTRL_DIR = path.join(ROOT, 'controller');
const CDP_PORT = 9344;
const LAN = (() => {
  const nets = networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) return n.address;
    }
  }
  return '127.0.0.1';
})();

const LOG = {
  serverOut: path.join(__dirname, '_encerrar-server-out.txt'),
  serverErr: path.join(__dirname, '_encerrar-server-err.txt'),
  ctrlOut: path.join(__dirname, '_encerrar-ctrl-out.txt'),
  ctrlErr: path.join(__dirname, '_encerrar-ctrl-err.txt'),
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function killLyra() {
  try {
    execSync(
      'powershell -NoProfile -Command "' +
        "Get-CimInstance Win32_Process | Where-Object { " +
        "$_.Name -match 'electron|Lyra' -or " +
        "($_.CommandLine -and ($_.CommandLine -match 'Lyra\\\\\\\\(server|controller)|electron\\\\\\\\cli|lyra-server|lyra-controller')) " +
        '} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; ' +
        'Start-Sleep -Seconds 1; ' +
        "Get-NetTCPConnection -LocalPort 5510,3001,5001 -ErrorAction SilentlyContinue | " +
        'ForEach-Object { if ($_.OwningProcess) { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"',
      { stdio: 'ignore' }
    );
  } catch (_) {}
}

async function waitFor(fn, label, attempts = 60, delay = 400) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const v = await fn();
      if (v) return v;
      last = v;
    } catch (e) {
      last = e.message || e;
    }
    await sleep(delay);
  }
  throw new Error(`timeout ${label}: ${last}`);
}

async function fetchText(url, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    return { ok: r.ok, status: r.status, text: await r.text() };
  } finally {
    clearTimeout(t);
  }
}

async function cdpCall(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = Math.floor(Math.random() * 1e9);
    const t = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      reject(new Error('CDP timeout ' + method));
    }, 30000);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ id, method, params })));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id !== id) return;
      clearTimeout(t);
      try { ws.close(); } catch (_) {}
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    });
    ws.addEventListener('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function pageWsUrl() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && /controller/.test(t.url))
    || list.find((t) => t.type === 'page');
  if (!page) throw new Error('página CDP não encontrada');
  return page.webSocketDebuggerUrl;
}

async function evalInPage(expression) {
  const wsUrl = await pageWsUrl();
  const r = await cdpCall(wsUrl, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}

function spawnLogged(cmd, args, cwd, outFile, errFile, opts = {}) {
  fs.writeFileSync(outFile, '');
  fs.writeFileSync(errFile, '');
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: !!opts.shell,
  });
  child.stdout.on('data', (b) => {
    fs.appendFileSync(outFile, b);
    process.stdout.write(`[${path.basename(cwd)}] ${b}`);
  });
  child.stderr.on('data', (b) => {
    fs.appendFileSync(errFile, b);
    process.stdout.write(`[${path.basename(cwd)}:err] ${b}`);
  });
  return child;
}

function serverAlive() {
  return fetchText('http://127.0.0.1:5510/api/identity', 1200)
    .then((r) => r.ok && /"role"\s*:\s*"server"/.test(r.text))
    .catch(() => false);
}

function readTail(file, n = 40) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-n).join('\n');
  } catch (_) {
    return '';
  }
}

async function startServer() {
  // Garantir porta livre
  for (let i = 0; i < 15; i++) {
    if (!(await serverAlive())) break;
    killLyra();
    await sleep(800);
  }
  const child = spawnLogged(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['start'],
    SERVER_DIR,
    LOG.serverOut,
    LOG.serverErr,
    { shell: true }
  );
  await waitFor(async () => ((await serverAlive()) ? true : null), 'Server identity');
  // Confirmar que NÃO ficou EADDRINUSE no log
  await sleep(800);
  const err = readTail(LOG.serverErr, 20) + readTail(LOG.serverOut, 20);
  if (/EADDRINUSE/.test(err)) throw new Error('Server subiu com EADDRINUSE — porta ainda ocupada');
  return child;
}

async function startController() {
  const electronCli = path.join(CTRL_DIR, 'node_modules', 'electron', 'cli.js');
  const child = spawnLogged(
    process.execPath,
    [electronCli, '.', `--remote-debugging-port=${CDP_PORT}`],
    CTRL_DIR,
    LOG.ctrlOut,
    LOG.ctrlErr
  );
  await waitFor(async () => {
    try {
      const r = await fetchText(`http://127.0.0.1:${CDP_PORT}/json/list`);
      return r.ok ? true : null;
    } catch (_) {
      return null;
    }
  }, 'CDP');
  await waitFor(async () => {
    try {
      const r = await fetchText('http://127.0.0.1:3001/controller.html');
      return r.ok ? true : null;
    } catch (_) {
      return null;
    }
  }, 'controller HTTP');
  await sleep(3000);
  // garantir JS novo com encerrarServidorRemotoViaMenu no window
  const has = await evalInPage(`typeof window.encerrarServidorRemotoViaMenu`);
  if (has !== 'function') {
    await evalInPage(`location.reload(); true`);
    await sleep(4000);
  }
  return child;
}

async function conectarRemoto() {
  return evalInPage(`(async () => {
    localStorage.setItem('lyra_ip', ${JSON.stringify(LAN)});
    localStorage.setItem('lyra_ip_lembrar', '1');
    const input = document.getElementById('ip-input');
    if (input) input.value = ${JSON.stringify(LAN)};
    if (typeof conectar !== 'function') throw new Error('conectar() indisponível no window');
    await conectar();
    for (let i = 0; i < 50; i++) {
      const badge = document.getElementById('status-conn-badge')?.className || '';
      if (badge.includes('status-seg--remoto')) {
        return { ok: true, badge };
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return {
      ok: false,
      badge: document.getElementById('status-conn-badge')?.className || '',
    };
  })()`);
}

async function snap() {
  return evalInPage(`({
    badge: document.getElementById('status-conn-badge')?.className || '',
    remoto: (document.getElementById('status-conn-badge')?.className || '').includes('status-seg--remoto'),
    local: (document.getElementById('status-conn-badge')?.className || '').includes('status-seg--local'),
    conectando: (document.getElementById('status-conn-badge')?.className || '').includes('status-seg--conectando'),
    bodySocket: document.body.classList.contains('socket-conectado'),
    hasEncerrarFn: typeof window.encerrarServidorRemotoViaMenu,
  })`);
}

async function confirmarDialog() {
  for (let i = 0; i < 20; i++) {
    const clicked = await evalInPage(`(() => {
      const ov = document.getElementById('app-dialog-overlay');
      const ok = document.getElementById('app-dialog-ok');
      const aberto = !!(ov && (ov.classList.contains('aberto') || ov.hidden === false));
      if (aberto && ok) { ok.click(); return true; }
      return false;
    })()`);
    if (clicked) return true;
    await sleep(200);
  }
  return false;
}

async function encerrarViaMenuReal() {
  const has = await evalInPage(`typeof window.encerrarServidorRemotoViaMenu`);
  if (has !== 'function') throw new Error('encerrarServidorRemotoViaMenu não está no window');

  // Dispara sem await no CDP (diálogo bloqueia); confirmamos em paralelo
  await evalInPage(`(() => { window.__encerrarDone = null; window.__encerrarErr = null;
    Promise.resolve(window.encerrarServidorRemotoViaMenu())
      .then((v) => { window.__encerrarDone = v === undefined ? 'ok' : v; })
      .catch((e) => { window.__encerrarErr = String(e && e.message || e); });
    return true;
  })()`);

  const confirmed = await confirmarDialog();
  if (!confirmed) throw new Error('diálogo de confirmação não apareceu/não foi confirmado');

  for (let i = 0; i < 30; i++) {
    const st = await evalInPage(`({ done: window.__encerrarDone, err: window.__encerrarErr })`);
    if (st.err) throw new Error(st.err);
    if (st.done != null) return { confirmed: true, done: st.done };
    await sleep(200);
  }
  return { confirmed: true, done: 'timeout-waiting-promise' };
}

function pass(msg) {
  console.log(`  PASS  ${msg}`);
}
function fail(msg, detail) {
  const d = detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '';
  console.error(`  FAIL  ${msg}${d}`);
  throw new Error(msg + d);
}

async function esperarServerMorto(ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (!(await serverAlive())) return true;
    await sleep(200);
  }
  return false;
}

async function esperarModoLocal(ms = 12000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < ms) {
    last = await snap();
    if (last.local && !last.remoto) return last;
    await sleep(300);
  }
  return last;
}

async function installIoClient() {
  const dir = path.join(__dirname, '_e2e_nm');
  const mod = path.join(dir, 'node_modules', 'socket.io-client');
  if (!fs.existsSync(mod)) {
    fs.mkdirSync(dir, { recursive: true });
    execSync(`npm install socket.io-client@4.7.4 --prefix "${dir}" --no-save --silent`, {
      stdio: 'ignore',
      shell: true,
    });
  }
  return require(mod);
}

async function testePrincipal(label) {
  console.log(`\n===== ${label} =====`);
  killLyra();
  await sleep(2500);

  await startServer();
  pass('1) Server iniciado');

  await startController();
  pass('2) Controlador iniciado');

  const conn = await conectarRemoto();
  if (!conn?.ok) fail('3) conectar remoto', conn);
  pass('3) Controlador conectado ao Server (badge remoto)');

  const antes = await snap();
  if (!antes.remoto) fail('4) ligação remota', antes);
  pass('4) Ligação remota a funcionar');

  const r = await encerrarViaMenuReal();
  pass(`5-6) Menu Encerrar Server + confirmação (${JSON.stringify(r)})`);

  if (!(await esperarServerMorto())) {
    fail('7-8) Server não encerrou', readTail(LOG.serverOut, 40));
  }
  pass('7-8) Server fechou (identity down — processo Electron fora do ar)');

  const depois = await esperarModoLocal();
  if (!depois?.local || depois.remoto) fail('9) Controlador não voltou ao local', depois);
  pass('9) Controlador no modo local');

  // Observar badge: não deve ir a «conectando»/remoto sozinho
  let tentouReconnect = false;
  for (let i = 0; i < 12; i++) {
    await sleep(500);
    const s = await snap();
    if (s.remoto || s.conectando) {
      tentouReconnect = true;
      break;
    }
  }
  if (tentouReconnect) fail('10) tentou reconectar automaticamente');
  if (await serverAlive()) fail('10c) Server voltou sozinho');
  pass('10) Sem reconexão automática / Server continua encerrado');
}

async function testeAuthMulti() {
  console.log('\n===== Autorização + multi-controlador =====');
  killLyra();
  await sleep(2500);
  await startServer();
  await startController();
  const conn = await conectarRemoto();
  if (!conn?.ok) fail('pré-conexão', conn);
  pass('Primário Electron conectado');

  const { io } = await installIoClient();

  // Não autorizado
  const ack1 = await new Promise((resolve) => {
    const s = io(`http://127.0.0.1:5510`, { auth: { deviceId: 'x', secret: 'y' }, transports: ['websocket'] });
    const t = setTimeout(() => { try { s.close(); } catch (_) {} resolve({ timeout: true }); }, 5000);
    s.on('connect', () => {
      s.emit('registrar_controlador', {});
      s.emit('encerrar_servidor', {}, (ack) => {
        clearTimeout(t);
        try { s.close(); } catch (_) {}
        resolve(ack || {});
      });
    });
    s.on('connect_error', (e) => { clearTimeout(t); resolve({ connect_error: e.message }); });
  });
  console.log('  ack não-auth:', ack1);
  if (ack1.ok === true) fail('não-autorizado encerrou');
  if (!(await serverAlive())) fail('Server morreu com não-autorizado');
  pass(`Não-autorizado recusado (${ack1.erro || ack1.connect_error || 'ok:false'})`);

  // Secundário aprovado (somente-leitura)
  let gotEvent = false;
  let disconnected = false;
  const secondAuth = {
    deviceId: '985f8358-3496-4bdb-adb2-c4655c3afa3d',
    secret: '61320b39-2600-4909-bb63-5324a1fc3cd2',
  };
  const sec = await new Promise((resolve) => {
    const s = io(`http://127.0.0.1:5510`, { auth: secondAuth, transports: ['websocket'] });
    const t = setTimeout(() => resolve({ timeout: true, socket: s }), 6000);
    s.on('servidor_a_encerrar', () => { gotEvent = true; });
    s.on('disconnect', () => { disconnected = true; });
    s.on('connect', () => {
      s.emit('registrar_controlador', { nomePc: 'e2e-sec' });
      setTimeout(() => {
        s.emit('encerrar_servidor', {}, (ack) => {
          clearTimeout(t);
          resolve({ ack: ack || {}, socket: s });
        });
      }, 500);
    });
    s.on('connect_error', (e) => { clearTimeout(t); resolve({ connect_error: e.message }); });
  });
  console.log('  ack secundário:', sec.ack || sec);
  if (sec.connect_error) {
    console.log('  WARN secundário auth:', sec.connect_error);
  } else if (sec.ack?.ok === true) {
    fail('secundário encerrou o Server', sec.ack);
  } else {
    pass(`Secundário recusado (${sec.ack?.erro || 'ok:false'})`);
  }
  if (!(await serverAlive())) fail('Server morreu no teste do secundário');
  pass('Server intacto após recusa');

  // Primário encerra de verdade
  await encerrarViaMenuReal();
  if (!(await esperarServerMorto())) fail('Server não caiu no multi-teste');
  pass('Primário encerrou o Server');

  await sleep(1000);
  if (gotEvent) pass('Secundário recebeu servidor_a_encerrar');
  else if (disconnected) pass('Secundário perdeu a ligação (disconnect) — aceitável');
  else console.log('  WARN: secundário sem evento explícito (verificar)');

  try { sec.socket?.close(); } catch (_) {}

  const local = await esperarModoLocal();
  if (!local?.local) fail('Electron não ficou local', local);
  pass('Primário Electron no modo local');
  let bad = false;
  for (let i = 0; i < 8; i++) {
    await sleep(500);
    const late = await snap();
    if (late.remoto || late.conectando) { bad = true; break; }
  }
  if (bad) fail('reconnect após multi');
  pass('Sem reconnect contínuo nos outros controladores / primário');
}

async function main() {
  console.log('LAN IP =', LAN);
  await testePrincipal('ROUND 1 — teste principal');
  await testeAuthMulti();
  await testePrincipal('ROUND 2 — após reinício completo');
  console.log('\n===== TODOS OS TESTES PASSARAM =====\n');
  killLyra();
}

main().catch((e) => {
  console.error('\nE2E FALHOU:', e.message || e);
  console.error('--- server log ---\n' + readTail(LOG.serverOut, 60));
  console.error('--- server err ---\n' + readTail(LOG.serverErr, 30));
  killLyra();
  process.exit(1);
});
