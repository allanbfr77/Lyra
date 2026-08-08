'use strict';

/**
 * E2E do handoff companion (ordem real):
 * Server :5510 → download local → handoff → quit Server+Controller PID mock →
 * NSIS (artefacto em server/dist) → Server identity → «iniciar Controlador» (flag).
 *
 * Não encerra o processo Node do teste; simula o PID do Controlador como já ausente.
 *
 * Uso: node tools/e2e-companion-handoff.js
 * Pré-req: Server a responder em :5510 com buildId ≠ manifesto; server/dist actualizado.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'server', 'dist');
const setupPath = path.join(distDir, 'Lyra-Servidor-Setup.exe');
const ymlPath = path.join(distDir, 'server-latest.yml');

const {
  parseServerLatestYml,
  decidirCompanionUpdate,
  createServerCompanionUpdateApi,
} = require(path.join(root, 'controller', 'src', 'serverCompanionUpdate.js'));

function falhar(msg) {
  console.error(`[e2e-handoff] FALHA: ${msg}`);
  process.exit(1);
}
function ok(msg) {
  console.log(`[e2e-handoff] OK: ${msg}`);
}

function requestJson(url, { method = 'GET', body, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: `${u.pathname}${u.search}`,
        method,
        timeout: timeoutMs,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
          : undefined,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch (_) {
            parsed = null;
          }
          resolve({ statusCode: res.statusCode || 0, body: parsed, text });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${method} ${url}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function servirDist(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent((req.url || '/').split('?')[0].replace(/^\//, ''));
      const file = path.join(dir, name);
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function main() {
  if (!fs.existsSync(setupPath)) falhar(`setup ausente: ${setupPath}`);
  if (!fs.existsSync(ymlPath)) falhar(`yml ausente: ${ymlPath}`);
  const manifesto = parseServerLatestYml(fs.readFileSync(ymlPath, 'utf8'));
  if (!manifesto.buildId || !manifesto.sha512) falhar('manifesto incompleto');
  ok(`manifesto buildId=${manifesto.buildId}`);

  let identityAntes;
  try {
    identityAntes = (await requestJson('http://127.0.0.1:5510/api/identity')).body;
  } catch (e) {
    falhar(`Server não responde em :5510: ${e.message}`);
  }
  if (identityAntes?.role !== 'server') falhar(`identity inválida: ${JSON.stringify(identityAntes)}`);
  ok(`identity antes: ${JSON.stringify(identityAntes)}`);

  const decisao = decidirCompanionUpdate({
    identity: identityAntes,
    manifesto,
    alvoEhLocal: true,
  });
  if (decisao.acao !== 'local-update') {
    falhar(`esperado local-update (Server desatualizado). got=${JSON.stringify(decisao)}`);
  }

  const { server: staticServer, baseUrl } = await servirDist(distDir);
  process.env.LYRA_COMPANION_RELEASES_BASE = baseUrl;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-e2e-handoff-'));
  const events = [];
  let handoffPath = '';
  let quitCtrl = 0;

  const ctx = {
    companionManifest: manifesto,
    companionUpdateAvailable: true,
    companionUpdateInfo: { buildId: manifesto.buildId },
    companionInstallInProgress: false,
    companionHandoffPending: false,
  };

  const electronPath =
    process.env.LYRA_ELECTRON_PATH ||
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'lyra-controller', 'Lyra Controlador.exe');
  if (!fs.existsSync(electronPath)) falhar(`Controlador instalado ausente: ${electronPath}`);

  const api = createServerCompanionUpdateApi(ctx, {
    app: {
      isPackaged: true,
      getPath: (n) => (n === 'temp' || n === 'userData' ? tmp : tmp),
    },
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    getJanelaPrincipal: () => ({
      isDestroyed: () => false,
      webContents: { send: (c, p) => events.push({ canal: c, payload: p }) },
    }),
    setUpdateStatusTitle: () => {},
    modoHandoff: true,
    userDataPath: tmp,
    controllerExe: electronPath,
    controllerArgs: [],
    controllerCwd: path.dirname(electronPath),
    quitControllerImpl: () => {
      quitCtrl += 1;
    },
    spawnHandoffImpl: (opts) => {
      handoffPath = opts.handoffPath;
      const logFile = path.join(path.dirname(opts.handoffPath), 'lyra-companion-handoff.log');
      fs.writeFileSync(logFile, 'HANDOFF_PROCESS_BOOT\n', 'utf8');
    },
    desligarProjecaoLocalImpl: async () => {},
  });

  console.log('[e2e-handoff] fase 1: download + handoff (sem app.exit real)…');
  const r1 = await api.instalarCompanionLocal();
  if (!r1?.handoff) falhar(`esperado handoff: ${JSON.stringify(r1)}`);
  if (quitCtrl !== 1) falhar(`quitController chamado ${quitCtrl} vezes`);
  if (!handoffPath || !fs.existsSync(handoffPath)) falhar('handoff.json ausente');
  ok('fase 1: handoff preparado e Controlador «encerrado»');

  const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
  /* Simula Controlador já fechado; o helper real sobe via breakaway. */
  handoff.controllerPid = 0;
  fs.writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

  const { spawnHandoffDetached } = require(path.join(root, 'controller', 'src', 'companionUpdateHandoff.js'));
  const modulePath = path.join(root, 'controller', 'src', 'companionUpdateHandoff.js');
  const logFile = path.join(path.dirname(handoffPath), 'lyra-companion-handoff.log');
  try { fs.unlinkSync(logFile); } catch (_) { /* intencional */ }

  console.log('[e2e-handoff] fase 2: spawn breakaway real (cmd start)…');
  spawnHandoffDetached({
    handoffPath,
    electronExecPath: electronPath,
    modulePath,
  });

  const deadline = Date.now() + 180000;
  let logTxt = '';
  while (Date.now() < deadline) {
    try { logTxt = fs.readFileSync(logFile, 'utf8'); } catch (_) { logTxt = ''; }
    if (logTxt.includes('HANDOFF_COMPLETED')) break;
    if (logTxt.includes('HANDOFF_PROCESS_ERROR')) {
      falhar(`handoff erro:\n${logTxt}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!logTxt.includes('HANDOFF_COMPLETED')) {
    falhar(`timeout à espera de HANDOFF_COMPLETED. log:\n${logTxt}`);
  }
  const required = [
    'HANDOFF_STARTED',
    'INSTALLER_STARTED',
    'INSTALLER_FINISHED',
    'INSTALLER_EXIT_CODE',
    'SERVER_READY',
    'CONTROLLER_STARTING',
    'HANDOFF_COMPLETED',
  ];
  for (const stage of required) {
    if (!logTxt.includes(stage)) falhar(`etapa em falta no log: ${stage}\n${logTxt}`);
  }
  ok('fase 2: log completo com todas as etapas');
  console.log('[e2e-handoff] --- log ---\n' + logTxt.trim() + '\n---');

  /* Não iniciar Controlador de novo no teste se o handoff já o fez — só validar Server. */
  const idDepois = (await requestJson('http://127.0.0.1:5510/api/identity')).body;
  if (idDepois?.role !== 'server') falhar(`role pós: ${JSON.stringify(idDepois)}`);
  if (String(idDepois.buildId) !== manifesto.buildId) {
    falhar(`buildId pós ${idDepois.buildId} != ${manifesto.buildId}`);
  }
  ok(`identity depois: ${JSON.stringify(idDepois)}`);

  /* Confirma que o Controlador GUI foi de facto lançado. */
  await new Promise((r) => setTimeout(r, 2500));
  const { spawnSync } = require('child_process');
  const ps = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "(Get-CimInstance Win32_Process -Filter \"Name = 'Lyra Controlador.exe'\").Count",
    ],
    { encoding: 'utf8', windowsHide: true }
  );
  const ctrlCount = Number(String(ps.stdout || '').trim());
  if (!Number.isFinite(ctrlCount) || ctrlCount < 1) {
    falhar(`Controlador não ficou a correr após CONTROLLER_STARTING (count=${ps.stdout})`);
  }
  ok(`Controlador a correr (${ctrlCount} processo(s))`);

  const relaunch = path.join(tmp, 'companion-relaunch.json');
  if (!fs.existsSync(relaunch)) falhar('flag companion-relaunch.json ausente');
  ok('flag de reconnect one-shot gravada');

  staticServer.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* intencional */ }
  console.log('[e2e-handoff] PASSOU — ordem Server→5510→Controlador respeitada (spawn real).');
}

main().catch((err) => {
  console.error('[e2e-handoff] ERRO', err);
  process.exit(1);
});
