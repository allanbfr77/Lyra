'use strict';

/**
 * E1.3 Fase B (W) — fiação (leitura de código-fonte; o app sobe portas fixas e Electron).
 *
 *  - a credencial nasce em memória no processo principal ANTES dos servidores e das janelas;
 *  - só o painel e o Histórico são registrados; nada de projeção/telão;
 *  - os verificadores da 3001 e da 5510 local a conferem; os três servidores seguem em `registrar`;
 *  - o segredo não chega ao renderer/preload, a disco, a log nem ao Socket.IO;
 *  - DevTools: desligadas em produção, item de menu condicionado.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
/** Código sem comentários (a documentação cita de propósito o que o código NÃO faz). */
const codigo = (rel) => ler(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('main.js: a credencial é criada em whenReady, antes dos servidores, da projeção local e das janelas', () => {
  const src = ler('controller/src/main.js');
  const iIniciar = src.indexOf('credencialInternaPainel.iniciar(');
  assert.ok(iIniciar > 0, 'inicia a integração');
  for (const depois of ['iniciarServidorController(ctx, paths)', 'ctx.projecaoLocal = criarProjecaoLocal(', 'mainWindow.criarJanela(ctx)']) {
    assert.ok(iIniciar < src.indexOf(depois), `a credencial vem antes de ${depois}`);
  }
  assert.match(src, /credencialInterna:\s*ctx\.credencialInterna/, 'a projeção local recebe a credencial para conferir');
  assert.match(src, /session:\s*session\.defaultSession/);
});

test('a 3001 e a 5510 local conferem a credencial interna; os três servidores continuam em registrar', () => {
  const s3001 = ler('controller/src/httpControllerServer.js');
  assert.match(s3001, /credencialInternaCore\.criarVerificadorHttp\(\{[\s\S]*?interna:\s*ctx\.credencialInterna/);
  const local = ler('controller/src/projecaoLocal.js');
  assert.match(local, /credencialInternaCore\.criarVerificadorHttp\(\{[\s\S]*?interna:\s*credencialInterna/);
  for (const rel of ['server/src/httpServer.js', 'controller/src/httpControllerServer.js', 'controller/src/projecaoLocal.js']) {
    const src = ler(rel);
    assert.match(src, /modo\s*:\s*['"]registrar['"]/, rel);
    assert.doesNotMatch(src, /modo\s*:\s*['"]impor['"]/, `${rel} não pode ligar «impor»`);
  }
});

test('o Servidor (processo separado) não conhece a credencial interna', () => {
  for (const rel of ['server/src/httpServer.js', 'server/src/main.js', 'server/src/lib/controleAcesso.js']) {
    assert.doesNotMatch(ler(rel), /credencialInterna|painel-local-/, rel);
  }
  assert.doesNotMatch(ler('packages/projection-core/src/controleAcesso.js'), /credencialInterna|painel-local-/, 'o núcleo da allowlist não foi tocado');
});

test('Socket.IO da projeção local passa pela guarda que recusa o id interno (sem inscrever por TOFU)', () => {
  const local = ler('controller/src/projecaoLocal.js');
  assert.match(local, /credencialInternaCore\.protegerSocket\(/);
  assert.ok(
    local.indexOf('protegerSocket(') < local.indexOf('acesso.autenticar('),
    'a guarda envolve o autenticar, não o substitui'
  );
});

test('o salto 3001→5510 só leva a credencial interna ao motor local deste processo', () => {
  const src = ler('controller/src/httpControllerServer.js');
  assert.match(src, /credenciaisParaSalto\(req,\s*\{[\s\S]*?interna:\s*ctx\.credencialInterna[\s\S]*?destinoEhMotorLocal:\s*destinoEhMotorLocal\(ctx,\s*base\)/);
  assert.match(src, /estaActiva[\s\S]*?porta === '5510'/);
});

test('só o painel e o Histórico são registrados (nunca telão, projeção ou janela filha)', () => {
  const principal = ler('controller/src/mainWindow.js');
  assert.match(principal, /autorizarJanela\(win,\s*\{\s*papel:\s*'painel',\s*pagina:\s*'\/controller\.html'\s*\}\)/);
  assert.match(principal, /webPreferencesAutorizada\(/);
  const hist = ler('controller/src/historicoWindow.js');
  assert.match(hist, /autorizarJanela\(janela,\s*\{\s*papel:\s*'historico',\s*pagina:\s*'\/historico\.html'\s*\}\)/);
  assert.match(hist, /webPreferencesAutorizada\(/);
  assert.ok(hist.indexOf('autorizarJanela(') < hist.indexOf('janela.loadURL('), 'registrada antes de carregar');
  for (const rel of ['controller/src/projecaoLocal.js', 'packages/projection-core/src/projectionEngine.js', 'server/src/controlWindow.js']) {
    assert.doesNotMatch(ler(rel), /autorizarJanela|credencialInternaPainel/, `${rel} não registra janelas`);
  }
});

test('o segredo nunca vai ao renderer: sem IPC, sem preload, sem contextBridge', () => {
  for (const rel of ['controller/src/preload.js', 'controller/src/preloadHistorico.js']) {
    assert.doesNotMatch(ler(rel), /credencial|x-lyra|painel-local|internal|interna/i, rel);
  }
  for (const rel of ['controller/src/credencialInternaPainel.js', 'packages/projection-core/src/credencialInterna.js']) {
    const src = codigo(rel);
    assert.doesNotMatch(src, /ipcMain|ipcRenderer|contextBridge|executeJavaScript|localStorage/, rel);
    assert.doesNotMatch(src, /writeFile|appendFile|createWriteStream|process\.env/, `${rel}: nada em disco nem no ambiente`);
    assert.doesNotMatch(src, /console\.(log|info|warn|error|debug)/, `${rel}: nenhum log direto`);
  }
  const main = ler('controller/src/main.js');
  assert.doesNotMatch(main, /ctx\.credencialInterna\.(secret|segredo)/);
});

test('o único log da integração é uma mensagem fixa, sem dados da credencial', () => {
  const src = ler('controller/src/credencialInternaPainel.js');
  const chamadas = src.match(/aviso\([^)]*\)/g) || [];
  assert.ok(chamadas.length >= 1);
  for (const c of chamadas) assert.match(c, /^aviso\('[^'$`]*'\)$/, `log dinâmico: ${c}`);
});

test('DevTools: item de menu só fora de produção e webPreferences.devTools vem da integração', () => {
  const src = ler('controller/src/mainWindow.js');
  assert.match(src, /credencialInternaPainel\.devToolsLiberadas\(\)\s*\?\s*\[/);
  assert.match(src, /label: 'Abrir console do controlador'/);
  const janela = ler('controller/src/janelaSegura.js');
  assert.match(janela, /app\.isPackaged === false/);
});
