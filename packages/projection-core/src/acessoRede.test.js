'use strict';

/**
 * E1.2 — validação de `Host` e `Origin` (anti DNS rebinding e anti página externa).
 *
 * Testes das duas classificações puras. O comportamento HTTP/WebSocket completo está em
 * `controller/src/acessoRede.integracao.test.js`.
 *
 * Política de Origin (ajuste final da E1.2): uma página só é aceita se for
 *   1. de loopback/localhost, ou
 *   2. desta própria máquina (nome ou endereço IP dela), ou
 *   3. do mesmo host que a requisição está a usar (cabeçalho Host) — o overlay do OBS servido
 *      pelo próprio Lyra, ou
 *   4. uma origem cadastrada em LYRA_ORIGENS_PERMITIDAS,
 * sempre numa das portas do Lyra (3001, 5510, 5001) — exceto as cadastradas, que valem como
 * escritas. `Origin: null` é negada; `file://` só é aceita no Socket.IO, como visualizador.
 */

const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const acesso = require('./acessoRede');

const { criarProtecaoRede, PORTAS_ORIGEM_PADRAO } = acesso;

const ENDERECOS_DA_MAQUINA = ['192.168.1.10', '10.8.0.2', 'fe80::1234'];

function rede(env = {}, hostnameMaquina = 'PC-DA-IGREJA', enderecosMaquina = ENDERECOS_DA_MAQUINA) {
  return criarProtecaoRede({ env, hostnameMaquina, enderecosMaquina });
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

test('Origin ausente: classificada como "ausente" (celular, processos Node, janelas file:// do Electron)', () => {
  const r = rede();
  assert.strictEqual(r.classificarOrigin(undefined).tipo, 'ausente');
});

test('Origin autorizado (1): loopback e localhost nas portas do Lyra — o painel, em qualquer máquina', () => {
  const r = rede();
  for (const o of [
    'http://127.0.0.1:3001', // painel
    'http://localhost:3001',
    'http://LOCALHOST:3001',
    'http://[::1]:3001',
    'http://127.0.0.2:5510',
    'http://127.0.0.1:5001', // overlay do OBS aberto no próprio servidor
    'http://app.localhost:5510',
  ]) {
    assert.strictEqual(r.classificarOrigin(o, { hostHeader: '192.168.1.99:5510' }).tipo, 'permitida', o);
  }
});

test('Origin autorizado (2): endereços IP e nomes DESTA máquina (mesmo com Host diferente)', () => {
  const r = rede();
  for (const o of [
    'http://192.168.1.10:3001',
    'http://192.168.1.10:5001', // OBS usando o IP do servidor
    'http://10.8.0.2:5510',
    'https://192.168.1.10:5510',
    'http://[fe80::1234]:3001',
    'http://pc-da-igreja:5001',
    'http://PC-DA-IGREJA:5001',
    'http://pc-da-igreja.local:5510',
  ]) {
    assert.strictEqual(r.classificarOrigin(o, { hostHeader: '127.0.0.1:5510' }).tipo, 'permitida', o);
  }
});

test('Origin autorizado (3): mesmo host que a requisição usa (OBS servido pelo próprio Lyra, NAT, VPN, nome cadastrado)', () => {
  const r = rede({ LYRA_HOSTS_PERMITIDOS: 'lyra.igreja.org.br' });
  assert.strictEqual(r.classificarOrigin('http://172.20.0.5:5001', { hostHeader: '172.20.0.5:5510' }).tipo, 'permitida');
  assert.strictEqual(r.classificarOrigin('http://lyra.igreja.org.br:5001', { hostHeader: 'lyra.igreja.org.br:5510' }).tipo, 'permitida');
  assert.strictEqual(r.classificarOrigin('http://sala-som:5001', { hostHeader: 'SALA-SOM:5510' }).tipo, 'permitida');
  assert.strictEqual(r.classificarOrigin('http://sala-som.local:5001', { hostHeader: 'sala-som.local' }).tipo, 'permitida');
});

test('Origin NÃO autorizado: IP privado, nome ou .local de TERCEIROS (outro PC da rede)', () => {
  const r = rede();
  const contextos = [undefined, '127.0.0.1:3001', '192.168.1.10:5510', '192.168.1.99:5510'];
  for (const o of [
    'http://192.168.1.77:5001', // página em outro PC da LAN
    'http://192.168.1.77:3001',
    'http://10.0.0.7:5510',
    'http://172.16.4.2:5510',
    'http://169.254.10.20:5001',
    'http://100.64.1.9:3001', // CGNAT / VPN de outra máquina
    'http://maquina-do-atacante:5001',
    'http://atacante.local:5001',
    'http://[fd12:3456:789a::1]:5510',
    'http://[fe80::1]:3001', // link-local, mas não é desta máquina
  ]) {
    for (const hostHeader of contextos) {
      const c = r.classificarOrigin(o, hostHeader ? { hostHeader } : undefined);
      assert.strictEqual(c.tipo, 'negada', `${o} com Host ${hostHeader}`);
    }
  }
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
    'http://192.168.1.10:8080', // IP desta máquina, mas porta que não é do Lyra
    'ftp://127.0.0.1:3001',
    'chrome-extension://abcdefghijklmnop',
    'http://127.0.0.1.evil.example:3001',
    'http://localhost.evil.example:3001',
    'http://[2001:db8::1]:3001',
  ]) {
    /* O Lyra é acessado pelo loopback ou pelo IP da própria máquina; a página é de fora. */
    for (const hostHeader of ['127.0.0.1:3001', '192.168.1.10:5510']) {
      assert.strictEqual(r.classificarOrigin(o, { hostHeader }).tipo, 'negada', `${o} → Host ${hostHeader}`);
    }
  }
});

test('DNS rebinding: Origin e Host iguais de um domínio externo continuam negados (o Host não é aceitável)', () => {
  const r = rede();
  for (const dominio of ['evil.example', 'rebind.attacker.com', 'localhost.evil.example', '127.0.0.1.evil.example']) {
    const c = r.classificarOrigin(`http://${dominio}:3001`, { hostHeader: `${dominio}:3001` });
    assert.strictEqual(c.tipo, 'negada', dominio);
    assert.strictEqual(r.classificarHost(`${dominio}:3001`).ok, false);
  }
});

test('mesmo Host da requisição não basta se a porta da origem não for do Lyra', () => {
  const r = rede();
  assert.strictEqual(r.classificarOrigin('http://172.20.0.5:8080', { hostHeader: '172.20.0.5:5510' }).tipo, 'negada');
  assert.strictEqual(r.classificarOrigin('http://172.20.0.5', { hostHeader: '172.20.0.5:5510' }).tipo, 'negada');
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

test('Origin "null" é NEGADA (iframe isolado ou página data:); "file://" é "opaca" e só vale no Socket.IO', () => {
  const r = rede();
  const nula = r.classificarOrigin('null');
  assert.strictEqual(nula.tipo, 'negada');
  assert.match(nula.motivo, /null/i);
  assert.strictEqual(r.classificarOrigin('file://').tipo, 'opaca');
  assert.strictEqual(r.classificarOrigin('file:///C:/app/display.html').tipo, 'negada');
  assert.strictEqual(r.classificarOrigin('NULL').tipo, 'negada');
});

test('não existe mais exceção de origem opaca para caminhos HTTP', () => {
  const r = rede();
  assert.strictEqual(r.origemOpacaPermitida, undefined);
  assert.strictEqual(acesso.CAMINHOS_ORIGEM_OPACA, undefined);
});

test('origemOpacaDoRequest: só "file://" (a "null" já é recusada antes)', () => {
  const r = rede();
  assert.strictEqual(r.origemOpacaDoRequest({ headers: { origin: 'file://' } }), true);
  assert.strictEqual(r.origemOpacaDoRequest({ headers: { origin: 'null' } }), false);
  assert.strictEqual(r.origemOpacaDoRequest({ headers: { origin: 'http://127.0.0.1:3001' } }), false);
  assert.strictEqual(r.origemOpacaDoRequest({ headers: {} }), false);
  assert.strictEqual(r.origemOpacaDoRequest(undefined), false);
});

test('(4) LYRA_ORIGENS_PERMITIDAS cadastra origens exatas (esquema+host+porta), mesmo de terceiros', () => {
  const r = rede({
    LYRA_ORIGENS_PERMITIDAS: 'http://localhost:8081, https://painel.igreja.org.br, http://192.168.1.77:8081',
  });
  assert.strictEqual(r.classificarOrigin('http://localhost:8081').tipo, 'permitida');
  assert.strictEqual(r.classificarOrigin('https://painel.igreja.org.br').tipo, 'permitida');
  assert.strictEqual(r.classificarOrigin('http://192.168.1.77:8081').tipo, 'permitida');
  assert.strictEqual(r.classificarOrigin('https://painel.igreja.org.br:8443').tipo, 'negada');
  assert.strictEqual(r.classificarOrigin('http://localhost:8082').tipo, 'negada');
  assert.strictEqual(r.classificarOrigin('https://outro.igreja.org.br').tipo, 'negada');
  assert.strictEqual(r.classificarOrigin('http://192.168.1.77:5001').tipo, 'negada');
});

test('LYRA_HOSTS_PERMITIDOS libera o Host, mas NÃO vira origem de página por si só', () => {
  const r = rede({ LYRA_HOSTS_PERMITIDOS: 'lyra.igreja.org.br' });
  assert.strictEqual(r.classificarHost('lyra.igreja.org.br:3001').ok, true);
  assert.strictEqual(r.classificarOrigin('http://lyra.igreja.org.br:3001').tipo, 'negada');
  assert.strictEqual(r.classificarOrigin('http://lyra.igreja.org.br:3001', { hostHeader: '127.0.0.1:3001' }).tipo, 'negada');
  assert.strictEqual(r.classificarOrigin('http://lyra.igreja.org.br:3001', { hostHeader: 'lyra.igreja.org.br:3001' }).tipo, 'permitida');
});

test('os endereços padrão da máquina vêm das interfaces de rede reais (os.networkInterfaces)', () => {
  const r = criarProtecaoRede({ env: {} });
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  for (const ip of ips) {
    assert.strictEqual(r.classificarOrigin(`http://${ip}:5001`, { hostHeader: '127.0.0.1:5510' }).tipo, 'permitida', ip);
  }
  assert.strictEqual(r.classificarOrigin('http://192.0.2.77:5001', { hostHeader: '127.0.0.1:5510' }).tipo, 'negada');
  assert.deepStrictEqual([...PORTAS_ORIGEM_PADRAO].sort((a, b) => a - b), [3001, 5001, 5510]);
});
