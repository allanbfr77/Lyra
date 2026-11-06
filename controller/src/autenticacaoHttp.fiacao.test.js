'use strict';

/**
 * E1.3 Fase A — fiação: o middleware de autenticação HTTP precisa estar instalado, em modo
 * `registrar`, nos três modos de execução (Servidor 5510, Controlador 3001 e "projetar nesta
 * máquina"), logo DEPOIS da proteção de Host/Origin (E1.2) e ANTES dos proxies, do leitor de
 * JSON e das rotas. E nenhum deles pode ligar o modo `impor` nesta fase.
 *
 * Os servidores sobem portas fixas e dependem do Electron, então o teste lê o código-fonte.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const pos = (src, re) => src.search(re);

const ARQUIVOS = {
  servidor: 'server/src/httpServer.js',
  controlador: 'controller/src/httpControllerServer.js',
  projecaoLocal: 'controller/src/projecaoLocal.js',
};

const CONTEXTOS = {
  servidor: 'servidor-5510',
  controlador: 'controlador-3001',
  projecaoLocal: 'local-5510',
};

test('os três modos criam a autenticação HTTP do Core em modo "registrar" e com o contexto certo', () => {
  for (const [nome, rel] of Object.entries(ARQUIVOS)) {
    const src = ler(rel);
    assert.match(src, /criarAutenticacaoHttp\s*\(/, `${nome} deve criar a autenticação HTTP`);
    assert.match(src, /modo\s*:\s*['"]registrar['"]/, `${nome} deve usar o modo registrar`);
    assert.ok(src.includes(`'${CONTEXTOS[nome]}'`), `${nome} deve identificar o contexto ${CONTEXTOS[nome]}`);
  }
});

test('nenhum servidor liga o modo "impor" nem lê o modo do ambiente nesta fase', () => {
  for (const [nome, rel] of Object.entries(ARQUIVOS)) {
    const src = ler(rel);
    assert.doesNotMatch(src, /modo\s*:\s*['"]impor['"]/, `${nome} não pode impor`);
    assert.doesNotMatch(src, /LYRA_AUTH_HTTP|LYRA_HTTP_AUTH/i, `${nome} não pode ler o modo do ambiente`);
  }
});

test('servidor (5510): a autenticação entra depois da proteção de rede e antes dos proxies, do JSON e das rotas', () => {
  const src = ler(ARQUIVOS.servidor);
  const protecao = pos(src, /expressApp\.use\(\s*protecaoRede\.middleware\s*\)/);
  const auth = pos(src, /expressApp\.use\(\s*autenticacaoHttp\.middleware\s*\)/);
  assert.ok(protecao > 0 && auth > protecao, 'a autenticação deve vir depois da proteção de rede');
  for (const re of [/attachProxyMusicaAoControlador\(expressApp/, /expressApp\.use\(express\.json/, /expressApp\.get\('\/api\/identity'/]) {
    assert.ok(pos(src, re) > auth, `${re} deve vir DEPOIS da autenticação`);
  }
  assert.match(src, /ctx\.acesso\.verificarCredencial\s*\(/, 'o Servidor verifica na allowlist real');
});

test('controlador (3001): a autenticação entra depois da proteção de rede e antes do JSON, dos estáticos e das rotas', () => {
  const src = ler(ARQUIVOS.controlador);
  const protecao = pos(src, /expressApp\.use\(\s*protecaoRede\.middleware\s*\)/);
  const auth = pos(src, /expressApp\.use\(\s*autenticacaoHttp\.middleware\s*\)/);
  assert.ok(protecao > 0 && auth > protecao);
  for (const re of [/expressApp\.use\(\s*express\.json/, /express\.static\(/, /registrarRotasMusicas\(/, /registrarRotasSyncBanco\(/]) {
    assert.ok(pos(src, re) > auth, `${re} deve vir DEPOIS da autenticação`);
  }
});

test('projetar nesta máquina: a autenticação entra depois da proteção de rede e antes das rotas, e o verificador é exposto ao 3001', () => {
  const src = ler(ARQUIVOS.projecaoLocal);
  const protecao = pos(src, /apiApp\.use\(\s*protecaoRede\.middleware\s*\)/);
  const auth = pos(src, /apiApp\.use\(\s*autenticacaoHttp\.middleware\s*\)/);
  assert.ok(protecao > 0 && auth > protecao);
  assert.ok(src.lastIndexOf('montarRotasApi(apiApp);') > auth, 'as rotas são montadas depois da autenticação');
  assert.match(src, /verificarCredencial\s*:/, 'a projeção local expõe verificarCredencial para a 3001');
  assert.match(ler(ARQUIVOS.controlador), /projecaoLocal/, 'a 3001 usa o verificador da projeção local quando ativa');
});

test('o registro vai para o console/diário e nunca recebe o secret', () => {
  for (const [nome, rel] of Object.entries(ARQUIVOS)) {
    const src = ler(rel);
    const trecho = src.slice(pos(src, /criarAutenticacaoHttp\s*\(/));
    const bloco = trecho.slice(0, 900);
    assert.doesNotMatch(bloco, /\.secret|x-lyra-secret/i, `${nome}: o registro não pode tocar no secret`);
  }
});

test('os proxies 5510→3001 marcam a requisição como proxificada (pista para o registro) e removem a marca do cliente', () => {
  for (const arq of [
    'server/src/lib/proxyMusicaAoControlador.js',
    'server/src/lib/proxyBibliaAoControlador.js',
    'server/src/lib/proxyApresentacaoVideoAoControlador.js',
  ]) {
    const src = ler(arq);
    assert.match(src, /['"]x-lyra-proxy['"]\s*:\s*['"]1['"]/, `${arq} deve marcar x-lyra-proxy: 1`);
    const linha = src.split('\n').find((l) => l.includes('...req.headers'));
    assert.ok(linha, `${arq}: headers do proxy não encontrados`);
    // a marca vem DEPOIS do spread dos cabeçalhos do cliente, para o cliente não poder anulá-la
    assert.ok(linha.indexOf('...req.headers') < linha.indexOf('x-lyra-proxy'), `${arq}: a marca deve sobrepor o cabeçalho do cliente`);
  }
});

test('painel e Histórico carregam o wrapper de fetch ANTES de qualquer outro script que faça chamadas', () => {
  const painel = ler('controller/public/controller.html');
  const idx = painel.search(/<script\s+src=["']\.\/js\/lyraFetch\.js["']\s*><\/script>/);
  assert.ok(idx > 0, 'controller.html deve carregar ./js/lyraFetch.js');
  assert.ok(idx < painel.search(/<script\s+type=["']module["']\s+src=["']\.\/js\/controllerApp\.js["']/), 'antes de controllerApp.js');
  assert.ok(idx < painel.search(/<script\s+src=["']\.\/js\/publicDisplayConfig\.js["']/), 'antes de publicDisplayConfig.js');

  const hist = ler('controller/public/historico.html');
  const h = hist.search(/<script\s+src=["']\.\/js\/lyraFetch\.js["']\s*><\/script>/);
  assert.ok(h > 0, 'historico.html deve carregar ./js/lyraFetch.js');
  assert.ok(h < hist.search(/<script>\s*[\s\S]*?fetch\(/), 'antes do script inline que usa fetch');
});

test('o wrapper do painel não menciona hosts externos conhecidos nem envia credencial por URL/query', () => {
  const src = ler('controller/public/js/lyraFetch.js');
  assert.doesNotMatch(src, /invbotafogo|onrender|supabase|googleapis/i);
  assert.doesNotMatch(src, /[?&](secret|deviceId)=/i);
});

test('a CSP do Histórico permite carregar o wrapper (script da própria origem) e continua restrita', () => {
  const hist = ler('controller/public/historico.html');
  const csp = (hist.match(/Content-Security-Policy"\s*content="([^"]+)"/) || [])[1] || '';
  assert.match(csp, /script-src[^;]*'self'/, "script-src deve incluir 'self' para ./js/lyraFetch.js");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src http:\/\/127\.0\.0\.1:3001(;|$)/, 'continua só falando com a 3001');
  assert.doesNotMatch(csp, /script-src[^;]*(\*|https?:)/, 'nenhum script externo');
});
