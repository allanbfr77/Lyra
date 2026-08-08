'use strict';

/**
 * Simula o Job Object do Electron: o pai é o Controlador empacotado
 * (ELECTRON_RUN_AS_NODE), spawna o handoff, espera HANDOFF_PROCESS_BOOT e sai.
 * O helper deve continuar e escrever HANDOFF_STARTED (mesmo sem setup).
 *
 * Uso: node tools/e2e-handoff-electron-job-exit.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const electronPath =
  process.env.LYRA_ELECTRON_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'lyra-controller', 'Lyra Controlador.exe');

if (!fs.existsSync(electronPath)) {
  console.error('[job-exit] Controlador instalado ausente:', electronPath);
  process.exit(2);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-handoff-job-'));
const handoffPath = path.join(dir, 'handoff.json');
const logFile = path.join(dir, 'lyra-companion-handoff.log');
const parentScript = path.join(dir, 'parent.js');
const useAsar = process.argv.includes('--asar');
const modulePath = useAsar
  ? path.join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      'lyra-controller',
      'resources',
      'app.asar',
      'src',
      'companionUpdateHandoff.js'
    )
  : path.join(root, 'controller', 'src', 'companionUpdateHandoff.js');

if (useAsar && !fs.existsSync(path.dirname(path.dirname(modulePath)))) {
  console.error('[job-exit] asar ausente para --asar');
  process.exit(2);
}

console.log('[job-exit] modulePath', modulePath);

fs.writeFileSync(
  handoffPath,
  `${JSON.stringify(
    {
      setupPath: path.join(dir, 'missing-setup.exe'),
      buildId: 'job-exit-test',
      controllerPid: 0,
      waitMs: 2000,
      forceAfterMs: 500,
    },
    null,
    2
  )}\n`,
  'utf8'
);

fs.writeFileSync(
  parentScript,
  `
'use strict';
const path = require('path');
const {
  spawnHandoffDetached,
  aguardarMarcadorNoLog,
} = require(${JSON.stringify(modulePath)});

const handoffPath = ${JSON.stringify(handoffPath)};
const logFile = ${JSON.stringify(logFile)};

(async () => {
  spawnHandoffDetached({
    handoffPath,
    electronExecPath: process.execPath,
    modulePath: ${JSON.stringify(modulePath)},
  });
  const boot = await aguardarMarcadorNoLog(logFile, 'HANDOFF_PROCESS_BOOT', { timeoutMs: 20000 });
  if (!boot.ok) {
    console.error('[parent] FAIL wait boot', boot.erro);
    process.exit(3);
  }
  console.log('[parent] BOOT ok — a sair (Job Object)');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(4);
});
`,
  'utf8'
);

console.log('[job-exit] dir', dir);
console.log('[job-exit] a lançar pai Electron…');

const parent = spawn(electronPath, [parentScript], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  windowsHide: true,
});

parent.on('exit', (code) => {
  console.log('[job-exit] pai saiu code=' + code);
  if (code !== 0 && code != null) {
    process.exit(code || 1);
  }

  let tries = 0;
  const iv = setInterval(() => {
    tries += 1;
    let txt = '';
    try {
      txt = fs.readFileSync(logFile, 'utf8');
    } catch (_) {
      /* intencional */
    }
    if (
      txt.includes('HANDOFF_STARTED') ||
      txt.includes('HANDOFF_PROCESS_ERROR') ||
      tries > 40
    ) {
      clearInterval(iv);
      console.log('[job-exit] LOG:\n' + txt);
      if (txt.includes('HANDOFF_STARTED') || txt.includes('HANDOFF_PROCESS_ERROR')) {
        console.log('[job-exit] PASSOU — helper sobreviveu ao exit do Electron empacotado.');
        process.exit(0);
      }
      console.error('[job-exit] FALHOU — helper não continuou após exit do pai.');
      process.exit(1);
    }
  }, 250);
});
