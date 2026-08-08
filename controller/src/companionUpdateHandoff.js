'use strict';

/**
 * Handoff pós-download do companion: corre fora do processo do Controlador.
 *
 * Sequência: esperar Controlador/Server ausentes → NSIS → iniciar Server →
 * aguardar identity na 5510 → iniciar Controlador.
 *
 * Crítico no Windows/Electron:
 * - o helper NÃO pode ficar no Job Object do Controlador (senão morre no app.exit);
 * - ao relançar Server/Controlador, NÃO herdar ELECTRON_RUN_AS_NODE=1.
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { caminhoExeServidorInstalado } = require('./lib/serverInstallPaths');

const CONTROLLER_INSTALL_DIR_NAME = 'lyra-controller';
const CONTROLLER_EXE_NAME = 'Lyra Controlador.exe';
const DEFAULT_SERVER_PORT = 5510;
const DEFAULT_HANDOFF_WAIT_MS = 120000;
const DEFAULT_IDENTITY_WAIT_MS = 120000;
const POLL_MS = 400;

let activeLogFile = null;

function companionUpdateApi() {
  return require('./serverCompanionUpdate');
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStage(stage, detail = '') {
  const extra = detail ? ` ${detail}` : '';
  const line = `[${new Date().toISOString()}] ${stage}${extra}\n`;
  if (activeLogFile) {
    try {
      fs.appendFileSync(activeLogFile, line, 'utf8');
    } catch (_) {
      // intencional
    }
  }
  try {
    console.error(line.trim());
  } catch (_) {
    // intencional
  }
}

/** Env limpo para relançar apps Electron (sem modo node). */
function envParaAppElectron() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  return env;
}

function caminhoExeControladorInstalado(localAppData = process.env.LOCALAPPDATA) {
  const base = String(localAppData || '').trim();
  if (!base) return '';
  return path.join(base, 'Programs', CONTROLLER_INSTALL_DIR_NAME, CONTROLLER_EXE_NAME);
}

function caminhoRelaunchFlag(userDataPath) {
  return path.join(String(userDataPath || ''), 'companion-relaunch.json');
}

function escreverRelaunchFlag(userDataPath, { ip = '127.0.0.1' } = {}) {
  const ficheiro = caminhoRelaunchFlag(userDataPath);
  fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
  fs.writeFileSync(
    ficheiro,
    `${JSON.stringify({ ip: String(ip || '127.0.0.1').trim() || '127.0.0.1', at: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );
  return ficheiro;
}

function consumirRelaunchFlag(userDataPath) {
  const ficheiro = caminhoRelaunchFlag(userDataPath);
  try {
    if (!fs.existsSync(ficheiro)) return null;
    const data = JSON.parse(fs.readFileSync(ficheiro, 'utf8'));
    try { fs.unlinkSync(ficheiro); } catch (_) { /* intencional */ }
    const ip = String(data?.ip || '').trim();
    return ip ? { ip } : null;
  } catch (_) {
    try { fs.unlinkSync(ficheiro); } catch (__) { /* intencional */ }
    return null;
  }
}

function escreverHandoff(ficheiro, payload) {
  fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
  fs.writeFileSync(ficheiro, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return ficheiro;
}

function lerHandoff(ficheiro) {
  return JSON.parse(fs.readFileSync(ficheiro, 'utf8'));
}

function listarProcessosLyraControlador({ spawnSyncImpl = spawnSync } = {}) {
  const ps = [
    "Get-CimInstance Win32_Process -Filter \"Name = 'Lyra Controlador.exe'\" |",
    'Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress',
  ].join(' ');
  const r = spawnSyncImpl(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 }
  );
  if (r.error || (r.status !== 0 && r.status != null)) return [];
  const raw = String(r.stdout || '').trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((row) => ({
      pid: Number(row.ProcessId || row.processId || 0),
      executablePath: String(row.ExecutablePath || row.executablePath || ''),
    }))
    .filter((p) => Number.isFinite(p.pid) && p.pid > 0);
}

function forcarEncerrarProcessosLyraControlador({
  listarImpl = listarProcessosLyraControlador,
  spawnSyncImpl = spawnSync,
  excludePids = [],
} = {}) {
  const skip = new Set([process.pid, ...excludePids].map(Number));
  const processos = listarImpl({ spawnSyncImpl });
  for (const p of processos) {
    if (skip.has(p.pid)) continue;
    try {
      if (process.platform === 'win32') {
        /* Sem /T: não matar a árvore (o handoff pode ter sido filho). */
        spawnSyncImpl(
          'taskkill',
          ['/PID', String(p.pid), '/F'],
          { encoding: 'utf8', windowsHide: true, timeout: 15000 }
        );
      } else {
        try { process.kill(p.pid, 'SIGTERM'); } catch (_) { /* intencional */ }
      }
    } catch (_) {
      // intencional
    }
  }
}

function portaTcpLivre(porta, hostname = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(porta, hostname);
  });
}

function pidVivo(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

async function aguardarProcessosAusentesEPortaLivre({
  timeoutMs = DEFAULT_HANDOFF_WAIT_MS,
  forcarAposMs = 15000,
  porta = DEFAULT_SERVER_PORT,
  controllerPid = 0,
  listarServidorImpl,
  forcarServidorImpl,
  forcarPidImpl,
  portaLivreImpl = portaTcpLivre,
  localAppData,
} = {}) {
  const api = companionUpdateApi();
  const listarServidor = listarServidorImpl || api.listarProcessosLyraServidor;
  const forcarServidor = forcarServidorImpl || api.forcarEncerrarProcessosLyraServidor;
  const forcarPid = forcarPidImpl || ((pid) => {
    if (!pid || pid === process.pid) return;
    try {
      if (process.platform === 'win32') {
        spawnSync(
          'taskkill',
          ['/PID', String(pid), '/F'],
          { encoding: 'utf8', windowsHide: true, timeout: 15000 }
        );
      } else {
        try { process.kill(pid, 'SIGTERM'); } catch (_) { /* intencional */ }
      }
    } catch (_) {
      // intencional
    }
  });

  const inicio = Date.now();
  let forcou = false;
  let loggedCtrl = false;
  let loggedServer = false;
  let loggedPort = false;

  while (Date.now() - inicio < timeoutMs) {
    const servers = listarServidor({ localAppData }) || [];
    const ctrlVivo = pidVivo(controllerPid);
    const livre = await portaLivreImpl(porta);

    if (!ctrlVivo && !loggedCtrl) {
      loggedCtrl = true;
      logStage('CONTROLADOR_EXITED', `pid=${controllerPid || 'n/a'}`);
    }
    if (servers.length === 0 && !loggedServer) {
      loggedServer = true;
      logStage('SERVER_EXITED');
    }
    if (livre && !loggedPort) {
      loggedPort = true;
      logStage('PORT_5510_FREE');
    }

    if (servers.length === 0 && !ctrlVivo && livre) {
      return { ok: true };
    }
    if (!forcou && Date.now() - inicio >= forcarAposMs) {
      forcou = true;
      logStage('FORCE_KILL', `após ${forcarAposMs}ms`);
      try { forcarServidor({ localAppData }); } catch (_) { /* intencional */ }
      if (ctrlVivo) {
        try { forcarPid(controllerPid); } catch (_) { /* intencional */ }
      }
    }
    await esperar(POLL_MS);
  }
  return {
    ok: false,
    erro: 'Timeout a aguardar Controlador/Servidor encerrarem e a porta 5510 libertar-se.',
  };
}

function iniciarControladorInstalado({
  spawnImpl = spawn,
  existsSyncImpl = fs.existsSync,
  localAppData,
  controllerExe,
  controllerArgs = [],
  cwd,
} = {}) {
  const exe = String(controllerExe || caminhoExeControladorInstalado(localAppData) || '').trim();
  if (!exe || !existsSyncImpl(exe)) {
    throw new Error(
      `Não foi possível localizar o executável do Lyra Controlador após a atualização (${exe || 'vazio'}).`
    );
  }
  const child = spawnImpl(exe, Array.isArray(controllerArgs) ? controllerArgs : [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    cwd: cwd || path.dirname(exe),
    env: envParaAppElectron(),
  });
  if (child && typeof child.unref === 'function') child.unref();
  return exe;
}

function iniciarServidorSemRunAsNode({ localAppData, spawnImpl = spawn } = {}) {
  const api = companionUpdateApi();
  const exe = api.caminhoExeServidorInstalado(localAppData);
  if (!exe || !fs.existsSync(exe)) {
    throw new Error(
      `Não foi possível localizar o executável do Lyra Servidor após a instalação (${exe || 'vazio'}).`
    );
  }
  /*
   * windowsHide DEVE ser false: o Servidor é uma app Electron com janela de controlo.
   * Com true, a 5510 sobe mas o utilizador não vê a UI — exatamente o sintoma do teste UI.
   */
  const child = spawnImpl(exe, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    cwd: path.dirname(exe),
    env: envParaAppElectron(),
  });
  if (child && typeof child.unref === 'function') child.unref();
  logStage('SERVER_SPAWNED', `exe=${exe} pid=${child?.pid || '?'}`);
  return exe;
}

/**
 * Corpo do handoff (já fora do Controlador).
 * @param {object} handoff
 */
async function executarHandoff(handoff, deps = {}) {
  const api = companionUpdateApi();
  const setupPath = String(handoff.setupPath || '').trim();
  const buildId = String(handoff.buildId || '').trim();
  const localAppData = handoff.localAppData || process.env.LOCALAPPDATA;
  if (!setupPath || !fs.existsSync(setupPath)) {
    throw new Error(`Instalador companion ausente no handoff: ${setupPath}`);
  }
  if (!buildId) throw new Error('Handoff sem buildId.');

  logStage('HANDOFF_STARTED', `buildId=${buildId} setup=${setupPath}`);

  const pronto = await aguardarProcessosAusentesEPortaLivre({
    timeoutMs: Number(handoff.waitMs) || DEFAULT_HANDOFF_WAIT_MS,
    forcarAposMs: Number(handoff.forceAfterMs) || 15000,
    controllerPid: Number(handoff.controllerPid) || 0,
    localAppData,
    listarServidorImpl: deps.listarServidorImpl,
    forcarServidorImpl: deps.forcarServidorImpl,
    forcarPidImpl: deps.forcarPidImpl,
    portaLivreImpl: deps.portaLivreImpl,
  });
  if (!pronto.ok) throw new Error(pronto.erro);

  logStage('INSTALLER_STARTED', setupPath);
  let exitCode = 0;
  if (typeof deps.correrInstaladorImpl === 'function') {
    exitCode = await deps.correrInstaladorImpl(setupPath);
  } else {
    exitCode = await api.correrInstaladorSilencioso(setupPath);
  }
  logStage('INSTALLER_FINISHED');
  logStage('INSTALLER_EXIT_CODE', String(exitCode ?? 0));

  /* NSIS (runAfterFinish) pode arrancar o Servidor sozinho ao terminar — dar-lhe um instante
     antes de decidirmos spawnar nós (evita duas instâncias). */
  await esperar(1500);

  const jaNoAr = typeof deps.servidorAindaNaPortaImpl === 'function'
    ? await deps.servidorAindaNaPortaImpl()
    : await api.servidorAindaNaPorta(DEFAULT_SERVER_PORT);
  if (!jaNoAr) {
    logStage('SERVER_STARTING');
    if (typeof deps.iniciarServidorImpl === 'function') {
      deps.iniciarServidorImpl();
    } else {
      iniciarServidorSemRunAsNode({ localAppData });
    }
  } else {
    logStage('SERVER_STARTING', 'já respondia na 5510 — skip spawn');
  }

  const identity = typeof deps.aguardarIdentityImpl === 'function'
    ? await deps.aguardarIdentityImpl('http://127.0.0.1:5510/', buildId)
    : await api.aguardarIdentityServer('http://127.0.0.1:5510/', buildId, {
        timeoutMs: Number(handoff.identityWaitMs) || DEFAULT_IDENTITY_WAIT_MS,
      });
  if (!identity?.ok) {
    throw new Error(
      'O Servidor não ficou disponível na porta 5510 após a instalação do companion.'
    );
  }
  if (identity.identity?.role !== 'server') {
    throw new Error(`Identity inesperada após install: role=${identity.identity?.role}`);
  }
  if (String(identity.identity.buildId || '').trim() !== buildId) {
    throw new Error(
      `buildId pós-install="${identity.identity.buildId}" (esperado "${buildId}").`
    );
  }
  logStage('SERVER_READY', `buildId=${identity.identity.buildId}`);

  logStage('CONTROLLER_STARTING', String(handoff.controllerExe || ''));
  if (typeof deps.iniciarControladorImpl === 'function') {
    deps.iniciarControladorImpl();
  } else {
    iniciarControladorInstalado({
      localAppData,
      controllerExe: handoff.controllerExe,
      controllerArgs: handoff.controllerArgs,
      cwd: handoff.controllerCwd,
    });
  }

  try { fs.unlinkSync(setupPath); } catch (_) { /* intencional */ }
  try {
    if (handoff.handoffPath) fs.unlinkSync(handoff.handoffPath);
  } catch (_) { /* intencional */ }

  logStage('HANDOFF_COMPLETED', `buildId=${buildId}`);
  return { ok: true, buildId, identity: identity.identity };
}

/**
 * Lança o helper fora do Job Object do Electron, sem janela CMD.
 *
 * `cmd /c start /b` cria processo independente (sobrevive ao app.exit) e `/b`
 * evita a janela de consola. O Controlador DEVE esperar `HANDOFF_PROCESS_BOOT`
 * no log antes de sair — senão o Job Object mata o launcher a meio do arranque
 * (falha observada na UI: só SPAWN_VBS_START, sem helper).
 */
function spawnHandoffDetached({
  handoffPath,
  electronExecPath = process.execPath,
  spawnImpl = spawn,
  modulePath = __filename,
} = {}) {
  const dir = path.dirname(handoffPath);
  fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, 'lyra-companion-handoff.log');
  const batFile = path.join(dir, 'lyra-companion-handoff.cmd');

  const exe = String(electronExecPath);
  const mod = String(modulePath);
  const handoff = String(handoffPath);

  /* Log limpo para esta corrida — evita confundir marcadores antigos. */
  try { fs.writeFileSync(logFile, '', 'utf8'); } catch (_) { /* intencional */ }

  const bat = [
    '@echo off',
    'setlocal',
    'set ELECTRON_RUN_AS_NODE=1',
    `echo [%date% %time%] SPAWN_CMD_START>> "${logFile}"`,
    `"${exe}" "${mod}" --handoff "${handoff}"`,
    `set EC=%ERRORLEVEL%`,
    `echo [%date% %time%] SPAWN_CMD_EXIT %EC%>> "${logFile}"`,
    'exit /b %EC%',
    '',
  ].join('\r\n');
  fs.writeFileSync(batFile, bat, 'utf8');

  /*
   * start /b "" bat — sem nova janela; processo separado do Job Object do Electron.
   * NÃO usar spawn detached no Windows para o launcher (falha silenciosa em PS/wscript).
   */
  const child = spawnImpl(
    process.env.ComSpec || 'cmd.exe',
    ['/c', 'start', '/b', '', batFile],
    {
      windowsHide: true,
      stdio: 'ignore',
      cwd: dir,
      env: process.env,
    }
  );
  return child;
}

/**
 * Espera o helper escrever um marcador no log (prova de que já está vivo).
 * Obrigatório antes de app.exit() no Controlador.
 */
async function aguardarMarcadorNoLog(logFile, marcador, {
  timeoutMs = 20000,
  intervaloMs = 100,
} = {}) {
  const inicio = Date.now();
  const alvo = String(marcador || '');
  while (Date.now() - inicio < timeoutMs) {
    try {
      if (fs.existsSync(logFile)) {
        const txt = fs.readFileSync(logFile, 'utf8');
        if (txt.includes(alvo)) return { ok: true };
      }
    } catch (_) {
      // intencional
    }
    await esperar(intervaloMs);
  }
  return { ok: false, erro: `Timeout à espera de "${alvo}" em ${logFile}` };
}

async function runFromCli(argv = process.argv) {
  const idx = argv.indexOf('--handoff');
  const ficheiro = idx >= 0 ? argv[idx + 1] : argv[2];
  if (!ficheiro) {
    console.error('[companion-handoff] uso: --handoff <path.json>');
    process.exit(2);
  }
  activeLogFile = path.join(path.dirname(ficheiro), 'lyra-companion-handoff.log');
  try {
    logStage('HANDOFF_PROCESS_BOOT', ficheiro);
    const handoff = lerHandoff(ficheiro);
    handoff.handoffPath = ficheiro;
    const r = await executarHandoff(handoff);
    logStage('HANDOFF_PROCESS_OK', `buildId=${r.buildId}`);
    process.exit(0);
  } catch (err) {
    logStage('HANDOFF_PROCESS_ERROR', String(err?.stack || err?.message || err));
    process.exit(1);
  }
}

if (require.main === module) {
  void runFromCli();
}

module.exports = {
  CONTROLLER_INSTALL_DIR_NAME,
  CONTROLLER_EXE_NAME,
  caminhoExeControladorInstalado,
  caminhoExeServidorInstalado,
  caminhoRelaunchFlag,
  escreverRelaunchFlag,
  consumirRelaunchFlag,
  escreverHandoff,
  lerHandoff,
  listarProcessosLyraControlador,
  forcarEncerrarProcessosLyraControlador,
  portaTcpLivre,
  aguardarProcessosAusentesEPortaLivre,
  iniciarControladorInstalado,
  iniciarServidorSemRunAsNode,
  envParaAppElectron,
  executarHandoff,
  spawnHandoffDetached,
  aguardarMarcadorNoLog,
  runFromCli,
  logStage,
  DEFAULT_HANDOFF_WAIT_MS,
  DEFAULT_IDENTITY_WAIT_MS,
  DEFAULT_SERVER_PORT,
};
