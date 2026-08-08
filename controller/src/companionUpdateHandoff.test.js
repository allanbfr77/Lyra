'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  escreverHandoff,
  lerHandoff,
  escreverRelaunchFlag,
  consumirRelaunchFlag,
  executarHandoff,
  portaTcpLivre,
} from './companionUpdateHandoff.js';

test('relaunch flag escreve, lê e consome uma vez', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-relaunch-'));
  escreverRelaunchFlag(dir, { ip: '127.0.0.1' });
  const a = consumirRelaunchFlag(dir);
  assert.equal(a.ip, '127.0.0.1');
  assert.equal(consumirRelaunchFlag(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('handoff JSON roundtrip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-handoff-'));
  const f = path.join(dir, 'h.json');
  escreverHandoff(f, { setupPath: 'x', buildId: 'b1', controllerPid: 42 });
  const h = lerHandoff(f);
  assert.equal(h.buildId, 'b1');
  assert.equal(h.controllerPid, 42);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('executarHandoff: ordem wait → install → server → identity → controller', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-handoff-run-'));
  const setup = path.join(dir, 'Lyra-Servidor-Setup.exe');
  fs.writeFileSync(setup, 'setup');
  const steps = [];
  let controllerStarted = false;

  const r = await executarHandoff(
    {
      setupPath: setup,
      buildId: 'build-h1',
      controllerPid: 0,
      waitMs: 5000,
      forceAfterMs: 50,
    },
    {
      listarServidorImpl: () => {
        steps.push('list-server');
        return [];
      },
      portaLivreImpl: async () => true,
      correrInstaladorImpl: async () => {
        steps.push('install');
      },
      servidorAindaNaPortaImpl: async () => false,
      iniciarServidorImpl: () => {
        steps.push('start-server');
      },
      aguardarIdentityImpl: async () => {
        steps.push('wait-identity');
        return { ok: true, identity: { role: 'server', buildId: 'build-h1' } };
      },
      iniciarControladorImpl: () => {
        steps.push('start-controller');
        controllerStarted = true;
      },
    }
  );

  assert.equal(r.ok, true);
  assert.equal(r.buildId, 'build-h1');
  assert.equal(controllerStarted, true);
  assert.ok(steps.indexOf('install') < steps.indexOf('start-server'));
  assert.ok(steps.indexOf('start-server') < steps.indexOf('wait-identity'));
  assert.ok(steps.indexOf('wait-identity') < steps.indexOf('start-controller'));
  assert.equal(fs.existsSync(setup), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('portaTcpLivre distingue livre vs ocupada', async () => {
  const livre = await portaTcpLivre(0);
  assert.equal(livre, true);
});
