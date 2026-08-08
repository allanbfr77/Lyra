import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(here, '..');

test('17) UI do Server não exibe versão de produto', () => {
  const html = fs.readFileSync(path.join(serverRoot, 'public', 'control.html'), 'utf8');
  assert.match(html, /logo-sub">Lyra - Servidor</);
  assert.doesNotMatch(html, /Servidor v\d/);
  assert.doesNotMatch(html, /v1\.\d+\.\d+/);
});

test('Server package.json não tem electron-updater nem publish versionado', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.0.0');
  assert.equal(pkg.dependencies?.['electron-updater'], undefined);
  assert.equal(pkg.scripts?.['publish:win'], undefined);
  assert.equal(pkg.build?.publish, undefined);
  assert.equal(pkg.build?.win?.artifactName, 'Lyra-Servidor-Setup.${ext}');
});

test('não existe updater.js no Server', () => {
  assert.equal(fs.existsSync(path.join(here, 'updater.js')), false);
});

test('lerBuildIdServidor lê resources/server-build.json', () => {
  const { lerBuildIdServidor } = require('./lib/serverBuildInfo.js');
  const id = lerBuildIdServidor();
  assert.ok(typeof id === 'string');
  assert.ok(id.length > 0);
});

test('main.js e ipcHandlers não referenciam electron-updater', () => {
  const main = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
  const ipc = fs.readFileSync(path.join(here, 'ipcHandlers.js'), 'utf8');
  assert.doesNotMatch(main, /electron-updater|createUpdaterApi|autoUpdater/);
  assert.doesNotMatch(ipc, /electron-updater|autoUpdater|update-install-now/);
});
