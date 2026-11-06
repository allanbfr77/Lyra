'use strict';

/**
 * E1.3 Fase B — fiação (leitura de código-fonte; os servidores sobem portas fixas e Electron).
 *
 *  - os três proxies 5510→3001 usam a política (só GET/HEAD, caminho validado, cabeçalhos filtrados)
 *    e não repassam corpo nem `req.headers` inteiro;
 *  - a 3001 repassa a credencial do cliente no salto 3001→5510;
 *  - os três servidores continuam em `registrar` e nenhum lê o modo do ambiente;
 *  - as rotas críticas ainda estão atrás da autenticação (declarada antes delas);
 *  - nenhum cliente manda credencial para fora (checagem estática dos wrappers).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const PROXIES = [
  'server/src/lib/proxyMusicaAoControlador.js',
  'server/src/lib/proxyBibliaAoControlador.js',
  'server/src/lib/proxyApresentacaoVideoAoControlador.js',
];

test('os proxies usam a política: sem req.pipe(outgoing) e sem ...req.headers', () => {
  for (const rel of PROXIES) {
    const src = ler(rel);
    assert.match(src, /politicaProxyControlador/, `${rel} deve usar a política`);
    assert.match(src, /avaliarRequisicaoProxy\s*\(/, rel);
    assert.match(src, /cabecalhosParaControlador\s*\(/, rel);
    assert.doesNotMatch(src, /req\.pipe\s*\(\s*outgoing/, `${rel} não pode encaminhar corpo de escrita`);
    assert.doesNotMatch(src, /\.\.\.req\.headers/, `${rel} não pode copiar todos os cabeçalhos`);
  }
});

test('os proxies recusam antes de abrir conexão com o controlador (http.request só depois da avaliação)', () => {
  for (const rel of PROXIES) {
    const src = ler(rel);
    assert.ok(src.indexOf('avaliarRequisicaoProxy(') < src.indexOf('http.request('), `${rel}: avaliar antes de conectar`);
  }
});

test('3001: o salto para a 5510 passa a credencial do cliente (módulo próprio, sem autenticação interna)', () => {
  const src = ler('controller/src/httpControllerServer.js');
  assert.match(src, /proxyProjecaoJson/);
  assert.match(src, /credenciaisDoRequest\s*\(\s*req\s*\)/);
  assert.doesNotMatch(src, /x-lyra-via|LYRA_INTERNAL|internalSecret/i, 'sem autenticação interna improvisada');
  const mod = ler('controller/src/lib/proxyProjecaoJson.js');
  assert.doesNotMatch(mod, /process\.env/, 'o módulo não lê segredos do ambiente');
  assert.doesNotMatch(mod, /console\.(log|warn|error|info)/, 'o módulo não registra nada (nem credenciais)');
});

test('os três servidores continuam em registrar e não leem o modo do ambiente', () => {
  for (const rel of ['server/src/httpServer.js', 'controller/src/httpControllerServer.js', 'controller/src/projecaoLocal.js']) {
    const src = ler(rel);
    assert.match(src, /modo\s*:\s*['"]registrar['"]/, rel);
    assert.doesNotMatch(src, /modo\s*:\s*['"]impor['"]/, rel);
    assert.doesNotMatch(src, /process\.env\.[A-Z_]*(AUTH|IMPOR|ENFORCE)[A-Z_]*/, rel);
  }
});

test('rotas críticas do Servidor (5510) estão declaradas DEPOIS da autenticação HTTP', () => {
  const src = ler('server/src/httpServer.js');
  const auth = src.search(/expressApp\.use\(\s*autenticacaoHttp\.middleware\s*\)/);
  assert.ok(auth > 0);
  for (const re of [/['"]\/api\/comando\//, /['"]\/api\/sync\/banco['"]/, /['"]\/api\/display-config['"]/, /['"]\/api\/display-routing['"]/]) {
    const i = src.search(re);
    assert.ok(i > auth, `${re} deve vir depois da autenticação`);
  }
});

test('os wrappers de cliente só falam credencial com servidores do Lyra (nunca hosts externos fixos)', () => {
  for (const rel of ['controller/public/js/lyraFetch.js', 'mobile/src/lyraFetchCore.js']) {
    const src = ler(rel);
    assert.doesNotMatch(src, /invbotafogo|onrender|supabase|googleapis/i, rel);
    assert.doesNotMatch(src, /[?&](secret|deviceId)=/i, rel);
  }
});
