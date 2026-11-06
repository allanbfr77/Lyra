import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { criarFetchLyra, ehDestinoLyra, instalarFetchLyra } = require('../lyraFetch.js');

const ID = { deviceId: 'dev-painel-0001', secret: 'SEGREDO-DO-PAINEL' };

/** fetch falso que guarda as chamadas (input + init) e devolve uma resposta simples. */
function fetchFalso() {
  const chamadas = [];
  const fn = async (input, init) => {
    chamadas.push({ input, init });
    return { ok: true, status: 200 };
  };
  fn.chamadas = chamadas;
  return fn;
}

function cabecalhosDe(chamada) {
  const h = new Headers(chamada.init && chamada.init.headers);
  return Object.fromEntries([...h.entries()]);
}

test('destinos do Lyra: loopback, redes privadas e nomes locais nas portas 3001 e 5510', () => {
  for (const u of [
    'http://127.0.0.1:3001/api/musicas',
    'http://localhost:3001/api/musicas',
    'http://192.168.0.10:5510/api/display-routing',
    'http://10.1.2.3:5510/api/comando/audio_play',
    'http://172.16.5.4:3001/api/sync/banco/pedido',
    'http://172.31.255.1:3001/',
    'http://100.88.1.2:5510/',
    'http://[::1]:3001/api/musicas',
    'http://[fd12:3456::1]:5510/api/estado',
    'http://pc-da-igreja:5510/api/estado',
    'http://sala.local:3001/api/musicas',
  ]) {
    assert.equal(ehDestinoLyra(u), true, u);
  }
});

test('NÃO são destinos do Lyra: serviços externos, https, IP público, portas e hosts enganosos', () => {
  for (const u of [
    'https://database.invbotafogo.com.br/api/v1/musicas',
    'https://invb-share-api.onrender.com/share',
    'https://invb-webhook-api.onrender.com/api/x',
    'https://example.com:5510/api',
    'http://example.com:3001/api',
    'http://8.8.8.8:5510/api',
    'http://172.32.0.1:5510/',
    'http://192.168.0.10/api/musicas',
    'http://192.168.0.10:80/api/musicas',
    'http://192.168.0.10:3002/api/musicas',
    'http://192.168.0.10:55100/api',
    'https://192.168.0.10:5510/api',
    'http://192.168.0.10.evil.com:5510/api',
    'http://evil.com:3001@192.168.0.10:5510/',
    'http://127.0.0.1:3001@evil.com/api',
    'http://localhost.evil.com:3001/api',
    'ftp://192.168.0.10:5510/',
    'file:///C:/x',
    'nao é uma url',
    '',
  ]) {
    assert.equal(ehDestinoLyra(u), false, u);
  }
});

test('destino com o mesmo host da página do painel conta como Lyra (nome da máquina com ponto)', () => {
  assert.equal(ehDestinoLyra('http://servidor.igreja.com.br:5510/api/estado'), false);
  assert.equal(ehDestinoLyra('http://servidor.igreja.com.br:5510/api/estado', { hostDaPagina: 'servidor.igreja.com.br' }), true);
  assert.equal(ehDestinoLyra('http://outro.igreja.com.br:5510/api/estado', { hostDaPagina: 'servidor.igreja.com.br' }), false);
});

test('envia X-Lyra-Device e X-Lyra-Secret para o Lyra e preserva método, corpo e demais cabeçalhos', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: () => ID });
  const corpo = JSON.stringify({ a: 1 });
  await f('http://127.0.0.1:3001/api/musicas/1', { method: 'PUT', body: corpo, headers: { 'Content-Type': 'application/json' } });
  const c = base.chamadas[0];
  assert.equal(c.input, 'http://127.0.0.1:3001/api/musicas/1');
  assert.equal(c.init.method, 'PUT');
  assert.equal(c.init.body, corpo);
  const h = cabecalhosDe(c);
  assert.equal(h['content-type'], 'application/json');
  assert.equal(h['x-lyra-device'], ID.deviceId);
  assert.equal(h['x-lyra-secret'], ID.secret);
});

test('NÃO envia credencial a serviços externos nem a destinos que não são do Lyra', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: () => ID });
  const externos = [
    'https://database.invbotafogo.com.br/api/v1/musicas',
    'https://invb-share-api.onrender.com/share',
    'http://8.8.8.8:5510/x',
    'http://192.168.0.10.evil.com:5510/x',
    'https://cdn.jsdelivr.net/npm/x.js',
    '/vendor/pdfjs/pdf.min.mjs',
  ];
  for (const u of externos) await f(u, { headers: { Accept: 'application/json' } });
  assert.equal(base.chamadas.length, externos.length);
  for (const c of base.chamadas) {
    const h = cabecalhosDe(c);
    assert.equal(h['x-lyra-device'], undefined, `deviceId vazou para ${c.input}`);
    assert.equal(h['x-lyra-secret'], undefined, `secret vazou para ${c.input}`);
    assert.equal(h.accept, 'application/json', 'cabeçalhos do chamador preservados');
  }
});

test('sem init, com URL ou Request como entrada: cria os cabeçalhos sem perder nada', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: () => ID });
  await f('http://192.168.0.10:5510/api/estado');
  assert.equal(cabecalhosDe(base.chamadas[0])['x-lyra-device'], ID.deviceId);

  await f(new URL('http://192.168.0.10:5510/api/estado'));
  assert.equal(cabecalhosDe(base.chamadas[1])['x-lyra-secret'], ID.secret);

  await f(new Request('http://192.168.0.10:5510/api/comando/audio_play', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }));
  const req = base.chamadas[2].input;
  assert.ok(req instanceof Request);
  assert.equal(req.headers.get('x-lyra-device'), ID.deviceId);
  assert.equal(req.headers.get('content-type'), 'application/json');
  assert.equal(req.method, 'POST');

  await f(new Request('https://example.com/x'));
  assert.equal(base.chamadas[3].input.headers.get('x-lyra-device'), null);
});

test('não sobrescreve credencial que o chamador já definiu', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: () => ID });
  await f('http://127.0.0.1:3001/api/musicas', { headers: { 'X-Lyra-Device': 'outro', 'X-Lyra-Secret': 'outro-s' } });
  const h = cabecalhosDe(base.chamadas[0]);
  assert.equal(h['x-lyra-device'], 'outro');
  assert.equal(h['x-lyra-secret'], 'outro-s');
});

test('aceita Headers, array de pares e objeto como init.headers', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: () => ID });
  await f('http://127.0.0.1:3001/a', { headers: new Headers({ Accept: 'x/y' }) });
  await f('http://127.0.0.1:3001/b', { headers: [['Accept', 'x/y']] });
  await f('http://127.0.0.1:3001/c', { headers: { Accept: 'x/y' } });
  for (const c of base.chamadas) {
    const h = cabecalhosDe(c);
    assert.equal(h.accept, 'x/y');
    assert.equal(h['x-lyra-device'], ID.deviceId);
  }
});

test('sem identidade (ou identidade quebrada) a requisição segue intacta, sem cabeçalhos', async () => {
  for (const obter of [() => null, () => ({}), () => ({ deviceId: 'so-id' }), () => { throw new Error('storage bloqueado'); }]) {
    const base = fetchFalso();
    const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: obter });
    const r = await f('http://127.0.0.1:3001/api/musicas', { method: 'DELETE' });
    assert.equal(r.status, 200);
    const h = cabecalhosDe(base.chamadas[0]);
    assert.equal(h['x-lyra-device'], undefined);
    assert.equal(h['x-lyra-secret'], undefined);
    assert.equal(base.chamadas[0].init.method, 'DELETE');
  }
});

test('erro do fetch original é propagado como veio (o wrapper não engole nem reescreve)', async () => {
  const f = criarFetchLyra({ fetchOriginal: async () => { throw new TypeError('Failed to fetch'); }, obterIdentidade: () => ID });
  await assert.rejects(() => f('http://127.0.0.1:3001/api/musicas'), { name: 'TypeError', message: 'Failed to fetch' });
});

test('instalarFetchLyra substitui window.fetch uma única vez (idempotente) e usa a identidade do localStorage', async () => {
  const base = fetchFalso();
  const mem = new Map();
  const alvo = {
    fetch: base,
    location: { hostname: '127.0.0.1' },
    localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) },
    crypto: { randomUUID: () => `uuid-${mem.size}` },
  };
  instalarFetchLyra(alvo);
  const primeiro = alvo.fetch;
  instalarFetchLyra(alvo);
  assert.equal(alvo.fetch, primeiro, 'não envolve duas vezes');
  assert.notEqual(alvo.fetch, base);

  await alvo.fetch('http://127.0.0.1:3001/api/musicas');
  const h = cabecalhosDe(base.chamadas[0]);
  assert.equal(h['x-lyra-device'], mem.get('lyra_device_id'));
  assert.equal(h['x-lyra-secret'], mem.get('lyra_device_secret'));
  assert.ok(h['x-lyra-device'] && h['x-lyra-secret']);

  // mesma identidade que o socket usa (mesmas chaves de localStorage): nenhuma segunda identidade
  const antes = [mem.get('lyra_device_id'), mem.get('lyra_device_secret')];
  await alvo.fetch('http://127.0.0.1:3001/api/musicas');
  assert.deepEqual([mem.get('lyra_device_id'), mem.get('lyra_device_secret')], antes);
});

test('instalarFetchLyra reaproveita a identidade já existente e nunca a troca', async () => {
  const base = fetchFalso();
  const mem = new Map([['lyra_device_id', 'id-ja-existente'], ['lyra_device_secret', 'secret-ja-existente']]);
  const alvo = { fetch: base, location: { hostname: '127.0.0.1' }, localStorage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) } };
  instalarFetchLyra(alvo);
  await alvo.fetch('http://127.0.0.1:3001/x');
  const h = cabecalhosDe(base.chamadas[0]);
  assert.equal(h['x-lyra-device'], 'id-ja-existente');
  assert.equal(h['x-lyra-secret'], 'secret-ja-existente');
});

test('instalarFetchLyra sem fetch ou sem localStorage não quebra a página', () => {
  assert.doesNotThrow(() => instalarFetchLyra({}));
  assert.doesNotThrow(() => instalarFetchLyra({ fetch: fetchFalso(), localStorage: { getItem() { throw new Error('bloqueado'); } } }));
});

/* ───────────────────────── Entrega 1: token de sessão do controlador ───────────────────────── */

const TOKEN = 'T0kenDeSessao_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123';

test('sessão: X-Lyra-Session acompanha a credencial para servidores do Lyra', async () => {
  const f = fetchFalso();
  const w = criarFetchLyra({ fetchOriginal: f, obterIdentidade: () => ID, obterSessao: () => TOKEN });
  await w('http://192.168.0.10:5510/api/comando/audio_play', { method: 'POST' });
  const h = cabecalhosDe(f.chamadas[0]);
  assert.equal(h['x-lyra-session'], TOKEN);
  assert.equal(h['x-lyra-device'], ID.deviceId);
});

test('sessão: nunca vai para fora do Lyra, nem sem a credencial do dispositivo, nem sobrescreve a explícita', async () => {
  const f = fetchFalso();
  const w = criarFetchLyra({ fetchOriginal: f, obterIdentidade: () => ID, obterSessao: () => TOKEN });
  await w('https://api.externa.com/x');
  assert.equal(f.chamadas[0].init, undefined);
  const f2 = fetchFalso();
  const w2 = criarFetchLyra({ fetchOriginal: f2, obterIdentidade: () => null, obterSessao: () => TOKEN });
  await w2('http://192.168.0.10:5510/api/estado');
  assert.equal(f2.chamadas[0].init, undefined, 'sem identidade, sem token');
  const f3 = fetchFalso();
  const w3 = criarFetchLyra({ fetchOriginal: f3, obterIdentidade: () => ID, obterSessao: () => TOKEN });
  await w3('http://192.168.0.10:5510/api/estado', { headers: { 'X-Lyra-Session': 'explicito-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' } });
  assert.equal(cabecalhosDe(f3.chamadas[0])['x-lyra-session'], 'explicito-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
});

test('sessão: ausente, malformada ou com falha no getter → a chamada segue só com a credencial', async () => {
  for (const obterSessao of [() => null, () => '', () => 'curto', () => 'tem espaço e é inválido............', () => { throw new Error('x'); }, () => 123]) {
    const f = fetchFalso();
    const w = criarFetchLyra({ fetchOriginal: f, obterIdentidade: () => ID, obterSessao });
    await w('http://192.168.0.10:5510/api/estado');
    const h = cabecalhosDe(f.chamadas[0]);
    assert.equal(h['x-lyra-session'], undefined);
    assert.equal(h['x-lyra-device'], ID.deviceId);
  }
});

test('sessão: sem a opção obterSessao o comportamento é o de antes', async () => {
  const f = fetchFalso();
  const w = criarFetchLyra({ fetchOriginal: f, obterIdentidade: () => ID });
  await w('http://192.168.0.10:5510/api/estado');
  assert.equal(cabecalhosDe(f.chamadas[0])['x-lyra-session'], undefined);
});
