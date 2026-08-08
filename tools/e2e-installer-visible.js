'use strict';

/**
 * Valida que o NSIS do companion abre a janela padrão (sem /S) durante o handoff.
 * Não altera a lógica de handoff — só observa a UI do instalador.
 *
 * Uso (pré-req: Server em :5510 com buildId ≠ server/dist/server-latest.yml):
 *   node tools/e2e-installer-visible.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const {
  escreverHandoff,
  spawnHandoffDetached,
} = require(path.join(root, 'controller', 'src', 'companionUpdateHandoff.js'));
const { parseServerLatestYml } = require(path.join(
  root,
  'controller',
  'src',
  'serverCompanionUpdate.js'
));

function falhar(msg) {
  console.error(`[e2e-visible] FALHA: ${msg}`);
  process.exit(1);
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', timeout: 5000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

function installerWindowVisible() {
  const ps = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'Lyra-Servidor-Setup' -and $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'Instala' }).Count`,
    ],
    { encoding: 'utf8', windowsHide: true }
  );
  return Number(String(ps.stdout || '').trim()) > 0;
}

async function main() {
  const ymlPath = path.join(root, 'server', 'dist', 'server-latest.yml');
  const setupPath = path.join(root, 'server', 'dist', 'Lyra-Servidor-Setup.exe');
  if (!fs.existsSync(setupPath) || !fs.existsSync(ymlPath)) falhar('server/dist incompleto');

  const manifesto = parseServerLatestYml(fs.readFileSync(ymlPath, 'utf8'));
  const identity = await requestJson('http://127.0.0.1:5510/api/identity');
  if (identity?.role !== 'server') falhar(`identity: ${JSON.stringify(identity)}`);
  if (String(identity.buildId) === String(manifesto.buildId)) {
    falhar(
      `Server já está no buildId do manifesto (${manifesto.buildId}). ` +
        'Ajuste resources/server-build.json do Server instalado para um id antigo e reinicie.'
    );
  }

  const electronPath = path.join(
    process.env.LOCALAPPDATA || '',
    'Programs',
    'lyra-controller',
    'Lyra Controlador.exe'
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-e2e-visible-'));
  const handoffPath = path.join(dir, 'handoff.json');
  const logFile = path.join(dir, 'lyra-companion-handoff.log');

  /* Copia o setup para a pasta do handoff (como o fluxo real). */
  const setupCopy = path.join(dir, 'Lyra-Servidor-Setup.exe');
  fs.copyFileSync(setupPath, setupCopy);

  escreverHandoff(handoffPath, {
    setupPath: setupCopy,
    buildId: manifesto.buildId,
    localAppData: process.env.LOCALAPPDATA,
    controllerPid: 0,
    controllerExe: electronPath,
    controllerArgs: [],
    controllerCwd: path.dirname(electronPath),
    waitMs: 120000,
    forceAfterMs: 15000,
  });

  console.log('[e2e-visible] a pedir quit-for-update…');
  try {
    await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 5510,
          path: '/api/internal/quit-for-update',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': 2 },
          timeout: 5000,
        },
        (res) => {
          res.resume();
          res.on('end', resolve);
        }
      );
      req.on('error', reject);
      req.write('{}');
      req.end();
    });
  } catch (_) {
    /* handoff força se necessário */
  }

  const modulePath = path.join(root, 'controller', 'src', 'companionUpdateHandoff.js');
  spawnHandoffDetached({
    handoffPath,
    electronExecPath: electronPath,
    modulePath,
  });

  let sawInstallerUi = false;
  const deadline = Date.now() + 180000;
  let logTxt = '';
  while (Date.now() < deadline) {
    if (!sawInstallerUi && installerWindowVisible()) {
      sawInstallerUi = true;
      console.log('[e2e-visible] OK: janela «Instalação do Lyra Servidor» visível');
    }
    try {
      logTxt = fs.readFileSync(logFile, 'utf8');
    } catch (_) {
      logTxt = '';
    }
    if (logTxt.includes('HANDOFF_COMPLETED')) break;
    if (logTxt.includes('HANDOFF_PROCESS_ERROR')) falhar(`erro:\n${logTxt}`);
    await new Promise((r) => setTimeout(r, 300));
  }

  if (!logTxt.includes('HANDOFF_COMPLETED')) falhar(`timeout. log:\n${logTxt}`);
  if (!sawInstallerUi) falhar('handoff ok mas a janela do instalador NÃO foi detectada');

  console.log('[e2e-visible] --- log ---\n' + logTxt.trim() + '\n---');
  console.log('[e2e-visible] PASSOU — instalação visível + handoff completo.');
}

main().catch((e) => falhar(String(e?.stack || e)));
