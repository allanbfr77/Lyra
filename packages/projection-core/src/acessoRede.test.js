'use strict';

/**
 * E1.2 — validação de `Host` e `Origin` (anti DNS rebinding e anti página externa).
 *
 * Testes das duas classificações puras. O comportamento HTTP/WebSocket completo está em
 * `controller/src/acessoRede.integracao.test.js`.
 */

const test = require('node:test');
const assert = require('node:assert');
const { criarProtecaoRede, PORTAS_ORIGEM_PADRAO, CAMINHOS_ORIGEM_OPACA } = require('./acessoRede');

function rede(env = {}, hostnameMaquina = 'PC-DA-IGREJA') {
  return criarProtecaoRede({ env, hostnameMaquina });
}

/* ─────────────────────────────── Host ─────────────────────────────── */

test('Host autorizado: IPv4, IPv6, localhost, nome de máquina e .local (com ou sem porta)', () => {
  const r = rede();
  for (const h of [
    '127.0.0.1:3001',
    '127.0.0.1',
    '192.168.1.10:5510',
    '10.0.0.5:5001',
    '203.0.113.7:5510', // IP literal público: não há DNS para sequestrar
    '[::1]:3001',
    '[fe80::1]:5510',
    'localhost:3001',
    'LOCALHOST:3001',
    'localhost.:3001',
    'app.localhost:3001',
    'pc-da-igreja:5510',
    'PC-DA-IGREJA',
    'servidor:5510',
    'sala-som.local:5510',
  ]) {
    assert.strictEqual(r.classificarHost(h).ok, true, h);
  }
});

test('Host não autorizado: nomes de domínio externos (DNS rebinding) são recusados', () => {
  const r = rede();
  for (const h of [
    'evil.example',
    'evil.example:3001',
    'rebind.attacker.com:5510',
    'localhost.evil.example',
    '127.0.0.1.evil.example',
    '192.168.1.10.nip.io:3001',
    'invbotafogo.com.br',
    'pc-da-igreja.evil.example',
    'EVIL.EXAMPLE.',
  ]) {
    const c = r.classificarHost(h);
    assert.strictEqual(c.ok, false, h);
    assert.match(c.motivo, /host/i);
  }
});

test('Host malformado ou manipulado é recusado', () => {
  const r = rede();
  for (const h of [
    undefined,
    '',
    '   ',
    '127.0.0.1@evil.example',
    'evil.example@127.0.0.1',
    '127.0.0.1/evil',
    '127.0.0.1:99999',
    '127.0.0.1:abc',
    '127.0.0.1:',
    'a b',
    'host\nX-Injetado: 1',
    'local\u0000host',
    'ex\u00e1mplo',
    '[::1',
    ['127.0.0.1', 'evil.example'],
    'x'.repeat(300),
  ]) {
    assert.strictEqual(r.classificarHost(h).ok, false, JSON.stringify(h));
  }
});

test('LYRA_HOSTS_PERMITIDOS cadastra nomes exatos (sem curinga, sem subdomínios)', () => {
  const r = rede({ LYRA_HOSTS_PERMITIDOS: ' Lyra.Igreja.org.br , tunel.ngrok-free.app ,, ' });
  assert.strictEqual(r.classificarHost('lyra.igreja.org.br:3001').ok, true);
  assert.strictEqual(r.classificarHost('TUNEL.ngrok-free.app').ok, true);
  assert.strictEqual(r.classificarHost('x.lyra.igreja.org.br').ok, false);
  assert.strictEqual(r.classificarHost('igreja.org.br').ok, false);
  const curinga = rede({ LYRA_HOSTS_PERMITIDOS: '*.igreja.org.br' });
  assert.strictEqual(curinga.classificarHost('lyra.igreja.org.br').ok, false);
});

test('o nome desta máquina (e nome.local) é aceito mesmo sendo um nome com pontos', () => {
  const r = rede({}, 'Servidor.Interno.Corp');
  assert.strictEqual(r.classificarHost('servidor.interno.corp:5510').ok, true);
  assert.strictEqual(r.classificarHost('servidor.interno.corp.local').ok, true);
  assert.strictEqual(r.classificarHost('outro.interno.corp').ok, false);
});

/* ────────────────────────────── Origin ────────────────────────────── */

test('Origin ausente: classificada como "ausente" (clientes que não são navegadores)', () => {
  const r = rede();
  assert.strictEqual(r.classificarOrigin(undefined).tipo, 'ausente');
});

test('Origin autorizado: painel, OBS e servidor nas portas do Lyra, em loopback e rede privada', () => {
  const r = rede();
  for (const o of [
    'http://127.0.0.1:3001', // painel
    'http://localhost:3001',
    'http://[::1]:3001',
    'http://192.168.1.10:3001', // painel aberto por outro PC da LAN
    'http://192.168.1.10:5001', // overlay do OBS
    'http://10.0.0.7:5510',
    'http://172.16.4.2:5510',
    'http://169.254.10.20:5001',
    'http://100.64.1.9:3001', // VPN tipo Tailscale
    'http://pc-da-igreja:5001',
    'http://sala-som.local:5510',
    'https://192.168.1.10:5510',
    'http://[fd12:3456:789a::1]:5510',
    'http://[fe80::1]:3001',
  ]) {
    assert.strictEqual(r.classificarOrigin(o).tipo, 'permitida', o);
  }
  assert.deepStrictEqual([...PORTAS_ORIGEM_PADRAO].sort((a, b) => a - b), [3001, 5001, 5510]);
});

test('Origin externo é negado: sites, IP público, porta fora do Lyra, esquema estranho', () => {
  const r = rede();
  for (const o of [
    'https://evil.example',
    'http://evil.example:3001',
    'https://invbotafogo.com.br',
    'http://203.0.113.5:3001', // IP público
    'http://8.8.8.8:5510',
    'http://localhost:8080', // outro programa local
    'http://127.0.0.1:3000',
    'http://127.0.0.1', // porta 80
    'https://127.0.0.1', // porta 443
    'ftp://127.0.0.1:3001',
    'chrome-extension://abcdefghijklmnop',
    'http://127.0.0.1.evil.example:3001',
    'http://localhost.evil.example:3001',
    'http://[2001:db8::1]:3001',
  ]) {
    assert.strictEqual(r.classificarOrigin(o).tipo, 'negada', o);
  }
});

test('Origin manipulado é negado: caixa/barra/caminho/credenciais/vários/vazio', () => {
  const r = rede();
  for (const o of [
    '',
    ' ',
    'http://127.0.0.1:3001/',
    'http://127.0.0.1:3001/caminho',
    'http://127.0.0.1:3001?x=1',
    'http://u:p@127.0.0.1:3001',
    'http://127.0.0.1:3001, https://evil.example',
    'http://127.0.0.1:3001 http://evil.example',
    'http://evil.example@127.0.0.1:3001',
    '127.0.0.1:3001',
    'javascript:alert(1)',
    'HTTP://127.0.0.1:3001/',
    ['http://127.0.0.1:3001', 'https://evil.example'],
  ]) {
    assert.strictEqual(r.classificarOrigin(o).tipo, 'negada', JSON.stringify(o));
  }
});

test('Origin com caixa diferente no host é aceito se for o mesmo origin (normalização do navegador)', () => {
  const r = rede();
  assert.strictEqual(r.classificarOrigin('http://LOCALHOST:3001').tipo, 'permitida');
  assert.strictEqual(r.classificarOrigin('http://PC-DA-IGREJA:5001').tipo, 'permitida');
});

test('Origin "null" e "file://" (janelas de projeção em file://) são "opaca": não são aceitas como origem comum', () => {
  const r = rede();
  assert.strictEqual(r.classificarOrigin('null').tipo, 'opaca');
  assert.strictEqual(r.classificarOrigin('file://').tipo, 'opaca');
  assert.strictEqual(r.classificarOrigin('file:///C:/app/display.html').tipo, 'negada');
});

test('LYRA_ORIGENS_PERMITIDAS cadastra origens exatas (esquema+host+porta)', () => {
  const r = rede({ LYRA_ORIGENS_PERMITIDAS: 'http://localhost:8081, https://painel.igreja.org.br' });
  assert.strictEqual(r.classificarOrigin('http://localhost:8081').tipo, 'permitida');
  assert.strictEqual(r.classificarOrigin('https://painel.igreja.org.br').tipo, 'permitida');
  assert.strictEqual(r.classificarOrigin('https://painel.igreja.org.br:8443').tipo, 'negada');
  assert.strictEqual(r.classificarOrigin('http://localhost:8082').tipo, 'negada');
  assert.strictEqual(r.classificarOrigin('https://outro.igreja.org.br').tipo, 'negada');
});

test('origem opaca só vale para os caminhos de leitura que as telas usam', () => {
  const r = rede();
  assert.deepStrictEqual([...CAMINHOS_ORIGEM_OPACA].sort(), ['/api/display-config', '/api/monitores']);
  assert.strictEqual(r.origemOpacaPermitida('GET', '/api/display-config'), true);
  assert.strictEqual(r.origemOpacaPermitida('GET', '/api/monitores'), true);
  assert.strictEqual(r.origemOpacaPermitida('HEAD', '/api/monitores'), true);
  assert.strictEqual(r.origemOpacaPermitida('OPTIONS', '/api/monitores'), true);
  assert.strictEqual(r.origemOpacaPermitida('GET', '/api/musicas'), false);
  assert.strictEqual(r.origemOpacaPermitida('GET', '/api/sync/banco/local'), false);
  assert.strictEqual(r.origemOpacaPermitida('PUT', '/api/display-config'), false);
  assert.strictEqual(r.origemOpacaPermitida('POST', '/api/monitores'), false);
  assert.strictEqual(r.origemOpacaPermitida('GET', '/api/display-config/../musicas'), false);
});

test('origemOpacaDoRequest reconhece "null" e "file://" no cabeçalho', () => {
  const r = rede();
  assert.strictEqual(r.origemOpacaDoRequest({ headers: { origin: 'null' } }), true);
  assert.strictEqual(r.origemOpacaDoRequest({ headers: { origin: 'file://' } }), true);
  assert.strictEqual(r.origemOpacaDoRequest({ headers: { origin: 'http://127.0.0.1:3001' } }), false);
  assert.strictEqual(r.origemOpacaDoRequest({ headers: {} }), false);
  assert.strictEqual(r.origemOpacaDoRequest(undefined), false);
});
