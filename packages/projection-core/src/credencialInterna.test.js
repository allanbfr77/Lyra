'use strict';

/**
 * E1.3 Fase B — arquitetura W: credencial interna efêmera do painel.
 *
 * Testes unitários do módulo puro (sem Electron). A integração com `session.webRequest`
 * e com janelas reais está em `controller/src/credencialInterna.integracao.test.js`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const util = require('node:util');
const { EventEmitter } = require('node:events');

const {
  criarCredencialInterna,
  decidirInjecao,
  criarRegistroJanelas,
  criarVerificadorHttp,
  CONFIG_PADRAO,
} = require('./credencialInterna');

const ORIGEM = 'http://127.0.0.1:3001';

function detalhes(sobre = {}) {
  return {
    resourceType: 'xhr',
    method: 'GET',
    url: 'http://127.0.0.1:3001/api/musicas',
    webContentsId: 7,
    frame: { url: `${ORIGEM}/controller.html`, parent: null },
    ...sobre,
  };
}

function registroCom(...entradas) {
  const r = criarRegistroJanelas();
  for (const [id, pagina] of entradas) r._definir(id, { papel: 'teste', pagina });
  return r;
}

/* ───────────────────────── geração e validação ───────────────────────── */

test('gera o segredo com crypto.randomBytes(32): 64 hex, novo a cada instância', () => {
  const pedidos = [];
  const a = criarCredencialInterna({
    gerarBytes: (n) => {
      pedidos.push(n);
      return crypto.randomBytes(n);
    },
  });
  assert.ok(pedidos.includes(32), 'o segredo vem de randomBytes(32)');
  const b = criarCredencialInterna();
  const ha = a.aplicarAosCabecalhos({});
  const hb = b.aplicarAosCabecalhos({});
  assert.match(ha['X-Lyra-Secret'], /^[0-9a-f]{64}$/);
  assert.notEqual(ha['X-Lyra-Secret'], hb['X-Lyra-Secret']);
  assert.notEqual(a.deviceId, b.deviceId);
});

test('conferir aceita só o par exato; recusa vazio, tipos errados e valores parecidos', () => {
  const c = criarCredencialInterna();
  const h = c.aplicarAosCabecalhos({});
  const par = { deviceId: h['X-Lyra-Device'], secret: h['X-Lyra-Secret'] };
  assert.equal(c.conferir(par), true);
  assert.equal(c.conferir({ deviceId: par.deviceId, secret: par.secret + 'x' }), false);
  assert.equal(c.conferir({ deviceId: par.deviceId, secret: par.secret.slice(0, -1) }), false);
  assert.equal(c.conferir({ deviceId: 'outro', secret: par.secret }), false);
  assert.equal(c.conferir({ deviceId: par.deviceId, secret: '' }), false);
  for (const ruim of [null, undefined, {}, 'x', 42, { deviceId: 1, secret: 2 }, { deviceId: [par.deviceId], secret: [par.secret] }]) {
    assert.equal(c.conferir(ruim), false);
  }
  assert.equal(c.ehDeviceInterno(par.deviceId), true);
  assert.equal(c.ehDeviceInterno('outro'), false);
});

test('a comparação é em tempo constante: timingSafeEqual nos dois campos, sem curto-circuito e sem exceção por tamanho', (t) => {
  const c = criarCredencialInterna();
  const h = c.aplicarAosCabecalhos({});
  const chamadas = [];
  const original = crypto.timingSafeEqual;
  t.mock.method(crypto, 'timingSafeEqual', (a, b) => {
    chamadas.push([a.length, b.length]);
    return original(a, b);
  });
  assert.equal(c.conferir({ deviceId: 'errado-e-bem-mais-comprido-que-o-esperado', secret: h['X-Lyra-Secret'] }), false);
  assert.equal(chamadas.length, 2, 'device E secret são comparados mesmo quando o primeiro já difere');
  assert.ok(chamadas.every(([x, y]) => x === y), 'compara resumos de mesmo tamanho (não vaza o comprimento)');
});

test('o segredo não escapa por serialização, inspeção nem propriedades enumeráveis', () => {
  const c = criarCredencialInterna();
  const h = c.aplicarAosCabecalhos({});
  const segredo = h['X-Lyra-Secret'];
  const dumps = [
    JSON.stringify(c),
    util.inspect(c, { depth: 5, showHidden: true }),
    String(c),
    `${c}`,
    Object.keys(c).join(','),
    Object.getOwnPropertyNames(c).join(','),
    JSON.stringify(Object.entries(c).map(([k, v]) => [k, typeof v])),
  ];
  for (const d of dumps) assert.ok(!d.includes(segredo), `vazou em: ${d.slice(0, 80)}`);
  assert.ok(Object.isFrozen(c));
});

test('aplicarAosCabecalhos remove X-Lyra-Device/Secret do renderer (qualquer caixa) e não duplica', () => {
  const c = criarCredencialInterna();
  const entrada = {
    'x-lyra-device': 'renderer',
    'X-LYRA-SECRET': 'renderer',
    'X-Lyra-Device': 'renderer2',
    'x-lyra-secret': 'renderer2',
    'X-Lyra-App': '1.2.3',
    'Content-Type': 'application/json',
  };
  const copia = { ...entrada };
  const saida = c.aplicarAosCabecalhos(entrada);
  assert.deepEqual(entrada, copia, 'não muta o objeto recebido');
  const chaves = Object.keys(saida);
  assert.equal(chaves.filter((k) => /^x-lyra-device$/i.test(k)).length, 1);
  assert.equal(chaves.filter((k) => /^x-lyra-secret$/i.test(k)).length, 1);
  assert.equal(saida['X-Lyra-Device'], c.deviceId);
  assert.equal(saida['X-Lyra-App'], '1.2.3', 'X-Lyra-App é preservado');
  assert.equal(saida['Content-Type'], 'application/json');
  assert.ok(!Object.values(saida).some((v) => String(v).includes('renderer')));
});

/* ───────────────────────── política de injeção ───────────────────────── */

test('3001: injeta no frame principal de janela registrada, para XHR/fetch e ping, em 127.0.0.1 e localhost', () => {
  const reg = registroCom([7, '/controller.html']);
  for (const url of ['http://127.0.0.1:3001/api/musicas', 'http://localhost:3001/api/musicas']) {
    for (const resourceType of ['xhr', 'ping']) {
      assert.equal(decidirInjecao(detalhes({ url, resourceType }), { registro: reg }), 'injetar', `${resourceType} ${url}`);
    }
  }
});

test('5510: nunca «injetar» direto — só depois da prova de propriedade, e só em 127.0.0.1 (localhost não é comprovável)', () => {
  const reg = registroCom([7, '/controller.html']);
  for (const resourceType of ['xhr', 'ping']) {
    assert.equal(
      decidirInjecao(detalhes({ url: 'http://127.0.0.1:5510/api/monitores', resourceType }), { registro: reg }),
      'verificar-motor-local',
      resourceType
    );
  }
  // `localhost` pode resolver para ::1 (outro dono) — a prova cobre 127.0.0.1, então não injeta
  assert.equal(decidirInjecao(detalhes({ url: 'http://localhost:5510/api/monitores' }), { registro: reg }), 'host-motor-nao-comprovavel');
  // as demais regras valem antes da consulta de propriedade
  assert.equal(decidirInjecao(detalhes({ url: 'http://127.0.0.1:5510/x', method: 'OPTIONS' }), { registro: reg }), 'preflight');
  assert.equal(decidirInjecao(detalhes({ url: 'http://127.0.0.1:5510/x', webContentsId: 99 }), { registro: reg }), 'janela-nao-autorizada');
  assert.equal(decidirInjecao(detalhes({ url: 'http://127.0.0.1:5510/x', frame: { url: `${ORIGEM}/tela.html`, parent: null } }), { registro: reg }), 'frame-nao-autorizado');
  assert.equal(decidirInjecao(detalhes({ url: 'http://127.0.0.1:5510/x', frame: { url: `${ORIGEM}/controller.html`, parent: { url: ORIGEM } } }), { registro: reg }), 'subframe');
});

test('nunca injeta em OPTIONS (preflight) nem em WebSocket', () => {
  const reg = registroCom([7, '/controller.html']);
  assert.equal(decidirInjecao(detalhes({ method: 'OPTIONS' }), { registro: reg }), 'preflight');
  assert.equal(decidirInjecao(detalhes({ resourceType: 'webSocket', url: 'http://127.0.0.1:3001/socket.io/' }), { registro: reg }), 'websocket');
});

test('não injeta em recursos que não são XHR/fetch/ping (img, script, mídia, navegação)', () => {
  const reg = registroCom([7, '/controller.html']);
  for (const resourceType of ['image', 'script', 'stylesheet', 'media', 'mainFrame', 'subFrame', 'font', 'other']) {
    assert.notEqual(decidirInjecao(detalhes({ resourceType }), { registro: reg }), 'injetar', resourceType);
  }
});

test('escopo por janela: webContents não registrado ou ausente não recebe (mesma URL não basta)', () => {
  const reg = registroCom([7, '/controller.html']);
  assert.equal(decidirInjecao(detalhes({ webContentsId: 99 }), { registro: reg }), 'janela-nao-autorizada');
  assert.equal(decidirInjecao(detalhes({ webContentsId: undefined }), { registro: reg }), 'sem-webcontents');
});

test('escopo por página: cada janela só vale para a SUA página exata', () => {
  const reg = registroCom([7, '/controller.html'], [8, '/historico.html']);
  assert.equal(decidirInjecao(detalhes({ webContentsId: 8, frame: { url: `${ORIGEM}/historico.html`, parent: null } }), { registro: reg }), 'injetar');
  assert.equal(decidirInjecao(detalhes({ webContentsId: 8 }), { registro: reg }), 'frame-nao-autorizado', 'Histórico servindo a página do painel');
  assert.equal(decidirInjecao(detalhes({ frame: { url: `${ORIGEM}/historico.html`, parent: null } }), { registro: reg }), 'frame-nao-autorizado', 'painel servindo o Histórico');
  for (const url of [
    `${ORIGEM}/tela.html`,
    `${ORIGEM}/controller.html.evil`,
    `${ORIGEM}/x/controller.html`,
    `http://127.0.0.1:5510/controller.html`,
    `http://localhost:3001/controller.html`,
    `http://evil.test:3001/controller.html`,
    `file:///C:/controller.html`,
    'about:blank',
    'não é url',
  ]) {
    assert.notEqual(decidirInjecao(detalhes({ frame: { url, parent: null } }), { registro: reg }), 'injetar', url);
  }
});

test('só o frame principal: subframe (com pai) e requisição sem frame não recebem', () => {
  const reg = registroCom([7, '/controller.html']);
  assert.equal(decidirInjecao(detalhes({ frame: { url: `${ORIGEM}/controller.html`, parent: { url: ORIGEM } } }), { registro: reg }), 'subframe');
  assert.equal(decidirInjecao(detalhes({ frame: null }), { registro: reg }), 'sem-frame');
});

test('escopo por URL, host e porta: externo, outro IP de loopback, LAN, porta fora da lista e host parecido não recebem', () => {
  const reg = registroCom([7, '/controller.html']);
  for (const url of [
    'http://127.0.0.2:3001/api/x',
    'http://127.0.0.1:43999/api/x',
    'http://127.0.0.1:80/api/x',
    'http://127.0.0.1/api/x',
    'http://evil.localhost:3001/api/x',
    'http://localhost.evil.test:3001/api/x',
    'http://192.168.0.10:3001/api/x',
    'http://203.0.113.9:3001/api/x',
    'http://[::1]:3001/api/x',
    'https://127.0.0.1:3001/api/x',
    'ws://127.0.0.1:3001/api/x',
    'http://user:pw@127.0.0.1:3001/api/x',
    'texto qualquer',
  ]) {
    assert.notEqual(decidirInjecao(detalhes({ url }), { registro: reg }), 'injetar', url);
  }
});

test('a política é configurável (portas/origem) sem afrouxar os padrões', () => {
  const reg = registroCom([7, '/controller.html']);
  const cfg = { registro: reg, portas: ['43001', '45510'], portaMotorLocal: '45510', origemPainel: 'http://127.0.0.1:43001' };
  const frame = { url: 'http://127.0.0.1:43001/controller.html', parent: null };
  assert.equal(decidirInjecao(detalhes({ url: 'http://127.0.0.1:45510/api/x', frame }), cfg), 'verificar-motor-local');
  assert.equal(decidirInjecao(detalhes({ url: 'http://127.0.0.1:43001/api/x', frame }), cfg), 'injetar');
  assert.equal(CONFIG_PADRAO.portaMotorLocal, '5510');
  assert.notEqual(decidirInjecao(detalhes({ url: 'http://127.0.0.1:3001/api/x' }), cfg), 'injetar');
  assert.deepEqual([...CONFIG_PADRAO.portas].sort(), ['3001', '5510']);
  assert.deepEqual([...CONFIG_PADRAO.hosts].sort(), ['127.0.0.1', 'localhost']);
});

/* ───────────────────────── registro de janelas ───────────────────────── */

function janelaFalsa(id) {
  const win = new EventEmitter();
  win.webContents = new EventEmitter();
  win.webContents.id = id;
  win.isDestroyed = () => false;
  return win;
}

test('registro: autorizar guarda o id e a página; fechar a janela remove', () => {
  const reg = criarRegistroJanelas();
  const win = janelaFalsa(11);
  const id = reg.autorizar(win, { papel: 'painel', pagina: '/controller.html' });
  assert.equal(id, 11);
  assert.equal(reg.tem(11), true);
  assert.equal(reg.paginaDe(11), '/controller.html');
  win.emit('closed');
  assert.equal(reg.tem(11), false);
  assert.equal(reg.tamanho(), 0);
});

test('registro: webContents destruído também remove (janela substituída sem passar por closed)', () => {
  const reg = criarRegistroJanelas();
  const win = janelaFalsa(12);
  reg.autorizar(win, { papel: 'painel', pagina: '/controller.html' });
  win.webContents.emit('destroyed');
  assert.equal(reg.tem(12), false);
});

test('registro: janela substituída — o id antigo sai, o novo entra, e o antigo não volta', () => {
  const reg = criarRegistroJanelas();
  const velha = janelaFalsa(20);
  reg.autorizar(velha, { papel: 'painel', pagina: '/controller.html' });
  velha.emit('closed');
  const nova = janelaFalsa(21);
  reg.autorizar(nova, { papel: 'painel', pagina: '/controller.html' });
  assert.equal(reg.tem(20), false);
  assert.equal(reg.tem(21), true);
  velha.emit('closed');
  assert.equal(reg.tem(21), true, 'um closed tardio da janela velha não derruba a nova');
});

test('registro: papéis independentes (fechar o Histórico não afeta o painel)', () => {
  const reg = criarRegistroJanelas();
  const painel = janelaFalsa(1);
  const hist = janelaFalsa(2);
  reg.autorizar(painel, { papel: 'painel', pagina: '/controller.html' });
  reg.autorizar(hist, { papel: 'historico', pagina: '/historico.html' });
  hist.emit('closed');
  assert.equal(reg.tem(1), true);
  assert.equal(reg.tem(2), false);
});

test('registro: recusa página fora da lista fechada e janela inválida', () => {
  const reg = criarRegistroJanelas();
  assert.throws(() => reg.autorizar(janelaFalsa(3), { papel: 'x', pagina: '/tela.html' }));
  assert.throws(() => reg.autorizar(null, { papel: 'x', pagina: '/controller.html' }));
  assert.throws(() => reg.autorizar({ webContents: {} }, { papel: 'x', pagina: '/controller.html' }));
  assert.equal(reg.tamanho(), 0);
});

/* ───────────────────────── verificador HTTP ───────────────────────── */

function reqFalso({ ip = '127.0.0.1', host = '127.0.0.1:3001', proxy = false } = {}) {
  return {
    socket: { remoteAddress: ip },
    headers: { host, ...(proxy ? { 'x-lyra-proxy': '1' } : {}) },
  };
}

test('verificador: aceita a credencial interna só em loopback, Host de loopback e sem marca de proxy', () => {
  const c = criarCredencialInterna();
  const h = c.aplicarAosCabecalhos({});
  const auth = { deviceId: h['X-Lyra-Device'], secret: h['X-Lyra-Secret'] };
  const base = () => ({ ok: false, classe: 'desconhecido' });
  const v = criarVerificadorHttp({ interna: c, verificarBase: base });

  assert.deepEqual(v(auth, reqFalso()).ok, true);
  assert.equal(v(auth, reqFalso()).classe, 'interna');
  assert.equal(v(auth, reqFalso({ ip: '::ffff:127.0.0.1' })).ok, true);
  assert.equal(v(auth, reqFalso({ ip: '::1', host: 'localhost:5510' })).ok, true);

  assert.equal(v(auth, reqFalso({ ip: '192.168.0.20' })).ok, false, 'de fora da máquina');
  assert.equal(v(auth, reqFalso({ host: '192.168.0.10:3001' })).ok, false, 'Host não é de loopback');
  assert.equal(v(auth, reqFalso({ host: 'evil.test:3001' })).ok, false);
  assert.equal(v(auth, reqFalso({ proxy: true })).ok, false, 'proxy não transforma a interna em autorização');
  assert.equal(v(auth, undefined).ok, false, 'sem requisição não há contexto local');
});

test('verificador: credencial inválida e dispositivo desconhecido continuam recusados', () => {
  const c = criarCredencialInterna();
  const h = c.aplicarAosCabecalhos({});
  const chamadas = [];
  const v = criarVerificadorHttp({
    interna: c,
    verificarBase: (auth) => {
      chamadas.push(auth);
      return { ok: false, classe: 'desconhecido' };
    },
  });
  assert.equal(v({ deviceId: h['X-Lyra-Device'], secret: 'errado' }, reqFalso()).ok, false);
  assert.equal(v({ deviceId: 'qualquer', secret: 'qualquer' }, reqFalso()).ok, false);
  assert.equal(v({ deviceId: 'qualquer', secret: 'qualquer' }, reqFalso()).classe, 'desconhecido');
});

test('verificador: o segredo interno nunca chega ao verificador da allowlist', () => {
  const c = criarCredencialInterna();
  const h = c.aplicarAosCabecalhos({});
  const chamadas = [];
  const v = criarVerificadorHttp({
    interna: c,
    verificarBase: (auth) => {
      chamadas.push(auth);
      return { ok: false, classe: 'desconhecido' };
    },
  });
  v({ deviceId: h['X-Lyra-Device'], secret: h['X-Lyra-Secret'] }, reqFalso());
  v({ deviceId: h['X-Lyra-Device'], secret: h['X-Lyra-Secret'] }, reqFalso({ proxy: true }));
  v({ deviceId: h['X-Lyra-Device'], secret: 'errado' }, reqFalso());
  assert.equal(chamadas.length, 0, 'o id interno nunca é consultado na allowlist');
});

test('verificador: credencial de dispositivo comum segue para o verificador da allowlist', () => {
  const c = criarCredencialInterna();
  const v = criarVerificadorHttp({
    interna: c,
    verificarBase: (auth) => (auth.deviceId === 'cel' ? { ok: true, classe: 'autorizado' } : { ok: false, classe: 'desconhecido' }),
  });
  assert.equal(v({ deviceId: 'cel', secret: 's' }, reqFalso({ ip: '192.168.0.20', host: '192.168.0.10:5510' })).ok, true);
});

test('verificador: sem verificador base devolve null (não-verificável) para quem não é interno', () => {
  const c = criarCredencialInterna();
  const v = criarVerificadorHttp({ interna: c, verificarBase: null });
  assert.equal(v({ deviceId: 'x', secret: 'y' }, reqFalso()), null);
});

test('verificador: sem credencial interna configurada, apenas delega', () => {
  const v = criarVerificadorHttp({ interna: null, verificarBase: () => ({ ok: true, classe: 'autorizado' }) });
  assert.equal(v({ deviceId: 'x', secret: 'y' }, reqFalso()).ok, true);
});
