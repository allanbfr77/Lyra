const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electron = require('electron');

test('Home v2 no Electron: renderer real, serviços simulados e perfil isolado', { timeout: 90000 }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-home-ui-'));
  const env = { ...process.env, LYRA_HOME_TEST_OUT: out };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [path.join(__dirname, 'homeLayout.electron.harness.cjs')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const timeout = setTimeout(() => child.kill(), 80000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  clearTimeout(timeout);
  assert.equal(code, 0, log.slice(-5000));
  const result = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'));
  console.log(`Artefatos Electron: ${out}`);
  assert.equal(result.complete, true, JSON.stringify(result));
  assert.ok(result.checks.length >= 15);
  assert.deepEqual(result.failures, []);
});
