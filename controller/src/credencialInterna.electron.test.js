'use strict';

/**
 * E1.3 Fase B (W) — integração com o Electron REAL.
 *
 * Executa `credencialInterna.electron.harness.js` dentro do binário do Electron do controlador
 * (portas 43001/45510, `userData` temporário, autenticação HTTP em `impor` só aqui) e confere
 * cada cenário que ele reporta. Sem o binário do Electron (o CI instala o controlador com
 * `--ignore-scripts`, então não há `electron.exe`), o teste é PULADO — a cobertura de lógica
 * continua nos testes sem Electron.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function binarioElectron() {
  try {
    const caminho = require('electron'); // dentro do Node, o pacote devolve o caminho do executável
    return typeof caminho === 'string' && fs.existsSync(caminho) ? caminho : null;
  } catch (_) {
    return null;
  }
}

const electron = binarioElectron();

test('Electron real: injeção, escopo por janela/URL/host/porta, guardas e DevTools (harness)',
  { skip: electron ? false : 'binário do Electron indisponível neste ambiente', timeout: 180000 },
  () => {
    const saida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-harness-out-')), 'resultado.json');
    const env = { ...process.env, LYRA_HARNESS_OUT: saida, ELECTRON_ENABLE_LOGGING: '0' };
    delete env.ELECTRON_RUN_AS_NODE;
    const r = spawnSync(electron, [path.join(__dirname, 'credencialInterna.electron.harness.js')], {
      env, encoding: 'utf8', timeout: 170000, windowsHide: true,
    });
    assert.ok(fs.existsSync(saida), `o harness não gerou resultado.\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    const { resultados } = JSON.parse(fs.readFileSync(saida, 'utf8'));
    const falhas = resultados.filter((x) => !x.ok);
    assert.ok(resultados.length >= 30, `cenários executados: ${resultados.length}`);
    assert.deepStrictEqual(falhas, [], `cenários com falha:\n${falhas.map((f) => `${f.cenario} | ${f.evidencia}`).join('\n')}`);
    assert.strictEqual(r.status, 0);
  });
