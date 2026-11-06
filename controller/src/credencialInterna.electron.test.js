'use strict';

/**
 * E1.3 Fase B (W) — integração com o Electron REAL.
 *
 * Executa `credencialInterna.electron.harness.js` dentro do binário do Electron do controlador
 * (portas 43001/45510, `userData` temporário, autenticação HTTP em `impor` só aqui) e confere
 * cada cenário que ele reporta. Sem o binário do Electron (o CI instala o controlador com
 * `--ignore-scripts`, então não há `electron.exe`), o teste é PULADO — a cobertura de lógica
 * continua nos testes sem Electron.
 *
 * Execução ASSÍNCRONA com controle do processo:
 *   - o resultado só vale se for JSON válido, `completo: true`, com EXATAMENTE os 42 cenários
 *     esperados, todos aprovados, e sem «problemas» de infraestrutura;
 *   - se o Electron não encerrar sozinho depois de gravar o resultado completo, a árvore de
 *     processos é encerrada à força e o teste só passa se TUDO acima for comprovado, com um
 *     diagnóstico visível do encerramento forçado;
 *   - sem resultado completo (travamento no meio, vigia do harness, crash), o teste falha
 *     informando o último cenário alcançado.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

/** Os 42 cenários do harness (id = primeira palavra do nome). Remover/renomear um deve falhar o teste. */
const CENARIOS_ESPERADOS = [
  'P1', 'P2', 'P3', 'P4', 'P5', 'H1', 'H2', 'R1', 'R2', 'R3', 'R4', 'T1', 'T2', 'T3', 'T4',
  'D1', 'D2', 'D3', 'D4', 'D5', 'F1', 'S1', 'M1', 'X1', 'X2', 'X3', 'V1', 'V2', 'V3', 'V4',
  'Q1', 'Q2', 'Q2b', 'Q2c', 'Q3', 'Q3b', 'Q3c', 'Q4', 'Q5', 'Q5b', 'Z1', 'Z2',
];

/**
 * Prazo (ms) para o Electron sair sozinho DEPOIS de gravar o resultado completo. Isolado, sai em
 * ~1 s; com todos os núcleos saturados foram MEDIDOS de 6 s a ~16 s (encerramento de janelas e
 * processos auxiliares), por isso 40 s. Um travamento real continua detectado e registrado como
 * encerramento forçado.
 */
const GRACA_SAIDA_MS = 40000;
/** Prazo total do processo. O vigia do harness corta em 140 s; este é o último recurso externo. */
const LIMITE_TOTAL_MS = 165000;

function binarioElectron() {
  try {
    const caminho = require('electron'); // dentro do Node, o pacote devolve o caminho do executável
    return typeof caminho === 'string' && fs.existsSync(caminho) ? caminho : null;
  } catch (_) {
    return null;
  }
}

const electron = binarioElectron();

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function processoVivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** Encerra o processo e TODA a sua árvore. Devolve true se o processo raiz não existe mais. */
async function matarArvore(filho) {
  if (!filho.pid) return true;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(filho.pid), '/T', '/F'], { windowsHide: true });
  } else {
    try { process.kill(-filho.pid, 'SIGKILL'); } catch (_) { try { filho.kill('SIGKILL'); } catch (__) { /* ignora */ } }
  }
  for (let i = 0; i < 40 && processoVivo(filho.pid); i += 1) await esperar(100);
  return !processoVivo(filho.pid);
}

/** Lê o resultado: objeto só se for JSON válido; `null` se não existe ou está inválido/incompleto no disco. */
function lerResultado(arquivo) {
  try {
    const obj = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return obj && typeof obj === 'object' && Array.isArray(obj.resultados) ? obj : null;
  } catch (_) {
    return null;
  }
}

const idDe = (cenario) => String(cenario).split(' ')[0];

test('Electron real: injeção, escopo por janela/URL/host/porta, guardas e DevTools (harness)',
  { skip: electron ? false : 'binário do Electron indisponível neste ambiente', timeout: 200000 },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-harness-out-'));
    const saida = path.join(dir, 'resultado.json');
    const env = { ...process.env, LYRA_HARNESS_OUT: saida, ELECTRON_ENABLE_LOGGING: '0' };
    delete env.ELECTRON_RUN_AS_NODE;

    const filho = spawn(electron, [path.join(__dirname, 'credencialInterna.electron.harness.js')], {
      env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    const MAX = 200000;
    filho.stdout.on('data', (d) => { if (stdout.length < MAX) stdout += d; });
    filho.stderr.on('data', (d) => { if (stderr.length < MAX) stderr += d; });
    const saiu = new Promise((resolve) => filho.once('exit', (codigo, sinal) => resolve({ codigo, sinal })));
    let desfecho = null;
    saiu.then((d) => { desfecho = d; });

    const inicio = Date.now();
    let resultadoCompletoEm = null;
    let motivoForcado = null;
    for (;;) {
      if (desfecho) break;
      const agora = Date.now();
      if (agora - inicio > LIMITE_TOTAL_MS) { motivoForcado = `prazo total de ${LIMITE_TOTAL_MS} ms esgotado`; break; }
      if (resultadoCompletoEm === null) {
        const r = lerResultado(saida);
        if (r && r.completo === true) resultadoCompletoEm = agora;
      } else if (agora - resultadoCompletoEm > GRACA_SAIDA_MS) {
        motivoForcado = `o Electron não encerrou em ${GRACA_SAIDA_MS} ms depois de gravar o resultado completo`;
        break;
      }
      await esperar(200);
    }

    let arvoreEncerrada = true;
    if (!desfecho) {
      arvoreEncerrada = await matarArvore(filho);
      await Promise.race([saiu, esperar(3000)]);
    } else {
      // O processo raiz saiu; qualquer remanescente da árvore precisa ser comprovadamente inexistente.
      arvoreEncerrada = !processoVivo(filho.pid);
    }
    const forcado = motivoForcado !== null;
    const contexto = () => `\nstdout (final):\n${stdout.slice(-4000)}\nstderr (final):\n${stderr.slice(-2000)}`;

    try {
      const r = lerResultado(saida);
      assert.ok(r, `o harness não gerou um resultado válido (${motivoForcado || `saiu com ${JSON.stringify(desfecho)}`}).${contexto()}`);
      assert.strictEqual(r.completo, true,
        `resultado INCOMPLETO (${motivoForcado || 'o harness terminou antes do fim'}). Último cenário alcançado: ${r.ultimoCenario}. Problemas: ${JSON.stringify(r.problemas)}.${contexto()}`);

      const ids = r.resultados.map((x) => idDe(x.cenario));
      const duplicados = ids.filter((id, i) => ids.indexOf(id) !== i);
      const faltando = CENARIOS_ESPERADOS.filter((id) => !ids.includes(id));
      const extras = ids.filter((id) => !CENARIOS_ESPERADOS.includes(id));
      assert.deepStrictEqual({ faltando, extras, duplicados, total: ids.length },
        { faltando: [], extras: [], duplicados: [], total: CENARIOS_ESPERADOS.length },
        'os 42 cenários esperados precisam estar presentes, sem sobras nem repetições');

      const falhas = r.resultados.filter((x) => !x.ok);
      assert.deepStrictEqual(falhas, [], `cenários com falha:\n${falhas.map((f) => `${f.cenario} | ${f.evidencia}`).join('\n')}`);
      assert.deepStrictEqual(r.problemas, [], `problemas de infraestrutura no harness:\n${(r.problemas || []).join('\n')}`);

      if (forcado) {
        assert.ok(arvoreEncerrada, `a árvore de processos do Electron (pid ${filho.pid}) continua viva depois do encerramento forçado`);
        const aviso = `ENCERRAMENTO FORÇADO do Electron: ${motivoForcado}. Resultado completo e válido (${ids.length} cenários, 0 falhas); árvore de processos encerrada.`;
        t.diagnostic(aviso);
        process.stderr.write(`\n[credencialInterna.electron] ${aviso}\n`);
      } else {
        assert.ok(desfecho && desfecho.codigo === 0, `o Electron saiu com ${JSON.stringify(desfecho)} (esperado código 0).${contexto()}`);
        assert.ok(arvoreEncerrada, `processo ${filho.pid} ainda vivo depois do encerramento normal`);
      }
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignora */ }
    }
  });
