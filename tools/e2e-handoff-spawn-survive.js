'use strict';

/**
 * Prova que o spawn breakaway sobrevive ao «pai» e grava etapas no log.
 * Uso: node tools/e2e-handoff-spawn-survive.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const {
  escreverHandoff,
  spawnHandoffDetached,
} = require('../controller/src/companionUpdateHandoff');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-handoff-survive-'));
const handoffPath = path.join(dir, 'handoff.json');
const logFile = path.join(dir, 'lyra-companion-handoff.log');

/* Handoff mínimo que falha cedo (setup ausente) — mas deve REGISTAR HANDOFF_STARTED. */
escreverHandoff(handoffPath, {
  setupPath: path.join(dir, 'missing-setup.exe'),
  buildId: 'survive-test',
  controllerPid: 0,
  waitMs: 2000,
  forceAfterMs: 500,
});

const electronPath = process.env.LYRA_ELECTRON_PATH
  || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'lyra-controller', 'Lyra Controlador.exe');

if (!fs.existsSync(electronPath)) {
  console.error('Controlador instalado ausente:', electronPath);
  process.exit(2);
}

const modulePath = path.join(__dirname, '..', 'controller', 'src', 'companionUpdateHandoff.js');
console.log('[survive] a spawnar handoff breakaway…');
spawnHandoffDetached({
  handoffPath,
  electronExecPath: electronPath,
  modulePath,
});

/* Simula morte do pai após spawn. */
setTimeout(() => {
  console.log('[survive] pai a sair (handoff deve continuar)…');
  /* Espera o helper escrever no log. */
  const deadline = Date.now() + 15000;
  const iv = setInterval(() => {
    let txt = '';
    try { txt = fs.readFileSync(logFile, 'utf8'); } catch (_) { txt = ''; }
    if (
      txt.includes('HANDOFF_STARTED') ||
      txt.includes('HANDOFF_PROCESS_BOOT') ||
      txt.includes('SPAWN_VBS_START') ||
      txt.includes('SPAWN_CMD_START')
    ) {
      clearInterval(iv);
      console.log('[survive] LOG:\n' + txt);
      if (
        txt.includes('HANDOFF_PROCESS_BOOT') ||
        txt.includes('HANDOFF_STARTED') ||
        txt.includes('SPAWN_CMD_START')
      ) {
        console.log('[survive] PASSOU — helper sobreviveu e escreveu no log.');
        process.exit(0);
      }
    }
    if (Date.now() > deadline) {
      clearInterval(iv);
      console.error('[survive] FALHA — log incompleto:\n' + txt);
      process.exit(1);
    }
  }, 300);
}, 800);
