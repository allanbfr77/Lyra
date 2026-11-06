'use strict';

/**
 * E1.2 — fiação: os quatro pontos de entrada de rede do Lyra (API do controlador na 3001,
 * API + Socket.IO do servidor na 5510, overlay do OBS na 5001 e o modo "projetar nesta
 * máquina" do controlador) precisam instalar a proteção de Host/Origin ANTES de qualquer
 * rota, arquivo estático ou leitor de corpo, e não podem voltar a declarar CORS `*`.
 *
 * Os servidores sobem portas fixas e dependem do Electron, então o teste lê o código-fonte.
 * É deliberadamente simples: falha se alguém reintroduzir um CORS curinga ou instalar a
 * proteção depois das rotas.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const ARQUIVOS = {
  controlador: 'controller/src/httpControllerServer.js',
  servidor: 'server/src/httpServer.js',
  projecaoLocal: 'controller/src/projecaoLocal.js',
};

/** Posição da primeira ocorrência (ou -1). */
const pos = (src, re) => src.search(re);

test('nenhum servidor declara CORS curinga (Access-Control-Allow-Origin * ou cors origin *)', () => {
  const achados = [];
  for (const [nome, rel] of Object.entries(ARQUIVOS)) {
    const src = ler(rel);
    if (/Access-Control-Allow-Origin['"`]\s*,\s*['"`]\*['"`]/.test(src)) achados.push(`${nome}: header Access-Control-Allow-Origin *`);
    if (/origin\s*:\s*['"`]\*['"`]/.test(src)) achados.push(`${nome}: socket.io cors origin *`);
  }
  assert.deepStrictEqual(achados, []);
});

test('todos usam a proteção de rede do Core', () => {
  for (const [nome, rel] of Object.entries(ARQUIVOS)) {
    const src = ler(rel);
    assert.match(src, /criarProtecaoRede\s*\(/, `${nome} deve criar a proteção`);
    assert.match(src, /\.middleware\b/, `${nome} deve instalar o middleware`);
  }
});

test('controlador (3001): a proteção entra antes do leitor de JSON, dos arquivos estáticos e das rotas', () => {
  const src = ler(ARQUIVOS.controlador);
  const protecao = pos(src, /expressApp\.use\(\s*protecaoRede\.middleware\s*\)/);
  assert.ok(protecao > 0, 'expressApp.use(protecaoRede.middleware) não encontrado');
  for (const re of [/expressApp\.use\(\s*express\.json/, /express\.static\(/, /registrarRotasVosk\(/, /registrarRotasMusicas\(/]) {
    const p = pos(src, re);
    assert.ok(p > protecao, `${re} deve vir DEPOIS da proteção`);
  }
});

test('servidor (5510): Socket.IO com allowRequest/cors do Core, origem opaca sem credencial, e a proteção antes das rotas', () => {
  const src = ler(ARQUIVOS.servidor);
  assert.match(src, /allowRequest\s*:\s*protecaoRede\.allowRequest/);
  assert.match(src, /cors\s*:\s*protecaoRede\.corsSocketIo\(\)/);
  assert.match(src, /origemOpacaDoRequest\(\s*socket\.request\s*\)/);
  const protecao = pos(src, /expressApp\.use\(\s*protecaoRede\.middleware\s*\)/);
  assert.ok(protecao > 0);
  for (const re of [/attachProxyMusicaAoControlador\(expressApp/, /expressApp\.use\((?:express\.json|guardas\.selecionarJson)/, /expressApp\.get\('\/api\/identity'/]) {
    assert.ok(pos(src, re) > protecao, `${re} deve vir DEPOIS da proteção`);
  }
});

test('servidor (5001, OBS): o overlay também passa pela proteção, antes das rotas /obs', () => {
  const src = ler(ARQUIVOS.servidor);
  const protecaoObs = pos(src, /obsApp\.use\(\s*protecaoRede\.middleware\s*\)/);
  assert.ok(protecaoObs > 0, 'obsApp.use(protecaoRede.middleware) não encontrado');
  assert.ok(pos(src, /obsApp\.get\('\/obs'/) > protecaoObs);
});

test('janela de Histórico: carregada pelo servidor local (loadURL), nunca por file://', () => {
  const src = ler('controller/src/historicoWindow.js');
  /* Por file:// o Electron não manda Origin e marca a requisição como cross-site, e a proteção
     recusaria o DELETE e o POST da janela. Pelo servidor local ela é same-origin, como o painel. */
  assert.doesNotMatch(src, /\.loadFile\s*\(/);
  assert.match(src, /\{\s*HTTP_CONTROLLER_PORT\s*\}\s*=\s*require\('\.\/httpControllerServer'\)/);
  assert.match(src, /\.loadURL\(\s*`http:\/\/127\.0\.0\.1:\$\{HTTP_CONTROLLER_PORT\}\/historico\.html`\s*\)/);
  /* Continua isolada: sem Node na página, com isolamento de contexto e sandbox. */
  assert.match(src, /nodeIntegration:\s*false/);
  assert.match(src, /contextIsolation:\s*true/);
  assert.match(src, /sandbox:\s*true/);
});

test('o Histórico é servido pela pasta estática do controlador (rota disponível)', () => {
  assert.ok(fs.existsSync(path.join(RAIZ, 'controller/public/historico.html')));
  const srv = ler(ARQUIVOS.controlador);
  assert.match(srv, /express\.static\(publicDir\)/);
  assert.match(srv, /const publicDir = path\.join\(__dirname, '\.\.\/public'\)/);
});

test('projeção local (controlador): API, Socket.IO e OBS protegidos antes das rotas', () => {
  const src = ler(ARQUIVOS.projecaoLocal);
  assert.match(src, /allowRequest\s*:\s*protecaoRede\.allowRequest/);
  assert.match(src, /cors\s*:\s*protecaoRede\.corsSocketIo\(\)/);
  assert.match(src, /origemOpacaDoRequest\(\s*socket\.request\s*\)/);
  const api = pos(src, /apiApp\.use\(\s*protecaoRede\.middleware\s*\)/);
  assert.ok(api > 0, 'apiApp.use(protecaoRede.middleware) não encontrado');
  /* A chamada (com ponto e vírgula), não a declaração `function montarRotasApi(apiApp) {`. */
  assert.ok(pos(src, /montarRotasApi\(apiApp\);/) > api);
  const obs = pos(src, /obsApp\.use\(\s*protecaoRede\.middleware\s*\)/);
  assert.ok(obs > 0, 'obsApp.use(protecaoRede.middleware) não encontrado');
  assert.ok(pos(src, /obsApp\.get\('\/obs'/) > obs);
});
