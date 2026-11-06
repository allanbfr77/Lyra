import test from 'node:test';
import assert from 'node:assert/strict';
import { criarFetchLyra, ehDestinoLyra } from './lyraFetchCore.js';

const ID = { deviceId: 'dev-mobile-0001', secret: 'SEGREDO-DO-CELULAR' };
const VERSAO = '1.3.0';

function fetchFalso() {
  const chamadas = [];
  const fn = async (input, init) => {
    chamadas.push({ input, init });
    return { ok: true, status: 200 };
  };
  fn.chamadas = chamadas;
  return fn;
}

const cab = (chamada) => Object.fromEntries([...new Headers(chamada.init && chamada.init.headers).entries()]);

test('destinos do Lyra: loopback, redes privadas e nomes locais nas portas 3001 e 5510', () => {
  for (const u of [
    'http://192.168.0.10:3001/api/musicas',
    'http://192.168.0.10:5510/api/display-routing',
    'http://10.0.0.5:5510/api/monitores',
    'http://172.20.1.1:3001/api/biblia/traducoes',
    'http://127.0.0.1:3001/api/musicas',
    'http://localhost:5510/api/estado',
    'http://[::1]:3001/x',
    'http://[fd00::5]:5510/x',
    'http://pc-da-igreja:3001/api/musicas',
    'http://sala.local:5510/api/estado',
  ]) {
    assert.equal(ehDestinoLyra(u), true, u);
  }
});

test('NÃO são destinos do Lyra: serviços externos, https, IP público, portas e hosts enganosos', () => {
  for (const u of [
    'https://database.invbotafogo.com.br/api/v1/musicas',
    'https://invb-share-api.onrender.com/share',
    'https://api.exemplo.com/x',
    'https://lyrics.lewdhutao.my.eu.org/v2/youtube/lyrics?title=x',
    'http://8.8.8.8:5510/x',
    'http://172.32.0.1:3001/x',
    'http://192.168.0.10/x',
    'http://192.168.0.10:8081/x',
    'http://192.168.0.10:55100/x',
    'https://192.168.0.10:5510/x',
    'http://192.168.0.10.evil.com:5510/x',
    'http://localhost.evil.com:3001/x',
    'http://192.168.0.10:5510@evil.com/x',
    'http://evil.com:3001@192.168.0.10:5510/x',
    'ftp://192.168.0.10:5510/x',
    '/relativo',
    'sem esquema 192.168.0.10:3001',
    '',
    undefined,
    null,
  ]) {
    assert.equal(ehDestinoLyra(u), false, String(u));
  }
});

test('envia X-Lyra-Device, X-Lyra-Secret e X-Lyra-App ao Lyra, preservando método, corpo e cabeçalhos', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: async () => ID, versaoApp: VERSAO });
  const corpo = JSON.stringify({ titulo: 'x' });
  await f('http://192.168.0.10:3001/api/musicas/9', { method: 'PUT', body: corpo, headers: { 'Content-Type': 'application/json' } });
  const c = base.chamadas[0];
  assert.equal(c.input, 'http://192.168.0.10:3001/api/musicas/9');
  assert.equal(c.init.method, 'PUT');
  assert.equal(c.init.body, corpo);
  const h = cab(c);
  assert.equal(h['content-type'], 'application/json');
  assert.equal(h['x-lyra-device'], ID.deviceId);
  assert.equal(h['x-lyra-secret'], ID.secret);
  assert.equal(h['x-lyra-app'], VERSAO);
});

test('preserva signal (timeout do fetchComTimeout) e demais opções do init', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: async () => ID, versaoApp: VERSAO });
  const ctrl = new AbortController();
  await f('http://192.168.0.10:3001/api/musicas', { signal: ctrl.signal, cache: 'no-store' });
  assert.equal(base.chamadas[0].init.signal, ctrl.signal);
  assert.equal(base.chamadas[0].init.cache, 'no-store');
});

test('NUNCA envia credencial nem versão a serviços externos', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: async () => ID, versaoApp: VERSAO });
  const externos = [
    'https://database.invbotafogo.com.br/api/v1/musicas',
    'https://invb-share-api.onrender.com/share',
    'https://lyrics.lewdhutao.my.eu.org/v2/youtube/lyrics?title=x',
    'http://8.8.8.8:5510/x',
    'http://192.168.0.10.evil.com:5510/x',
    'http://192.168.0.10:5510@evil.com/x',
  ];
  for (const u of externos) await f(u, { headers: { Accept: 'application/json' } });
  for (const c of base.chamadas) {
    const h = cab(c);
    for (const nome of ['x-lyra-device', 'x-lyra-secret', 'x-lyra-app']) {
      assert.equal(h[nome], undefined, `${nome} vazou para ${c.input}`);
    }
    assert.equal(h.accept, 'application/json');
  }
});

test('o secret nunca vai na URL nem no corpo', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: async () => ID, versaoApp: VERSAO });
  await f('http://192.168.0.10:3001/api/musicas?q=a', { method: 'POST', body: '{"a":1}' });
  const c = base.chamadas[0];
  assert.ok(!String(c.input).includes(ID.secret));
  assert.ok(!String(c.input).includes(ID.deviceId));
  assert.equal(c.init.body, '{"a":1}');
});

test('sem identidade a chamada segue e leva só X-Lyra-App; identidade quebrada não derruba o fetch', async () => {
  for (const obter of [async () => null, async () => ({}), async () => ({ deviceId: 'so-id' }), async () => { throw new Error('AsyncStorage falhou'); }]) {
    const base = fetchFalso();
    const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: obter, versaoApp: VERSAO });
    const r = await f('http://192.168.0.10:3001/api/musicas');
    assert.equal(r.status, 200);
    const h = cab(base.chamadas[0]);
    assert.equal(h['x-lyra-device'], undefined);
    assert.equal(h['x-lyra-secret'], undefined);
  }
});

test('não sobrescreve cabeçalhos X-Lyra-* que o chamador definiu', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: async () => ID, versaoApp: VERSAO });
  await f('http://192.168.0.10:3001/x', { headers: { 'X-Lyra-Device': 'meu', 'X-Lyra-Secret': 'meu-s', 'X-Lyra-App': 'teste' } });
  const h = cab(base.chamadas[0]);
  assert.equal(h['x-lyra-device'], 'meu');
  assert.equal(h['x-lyra-secret'], 'meu-s');
  assert.equal(h['x-lyra-app'], 'teste');
});

test('erro do fetch original (rede fora, abort) é propagado intacto', async () => {
  const f = criarFetchLyra({
    fetchOriginal: async () => { throw new TypeError('Network request failed'); },
    obterIdentidade: async () => ID,
    versaoApp: VERSAO,
  });
  await assert.rejects(() => f('http://192.168.0.10:3001/api/musicas'), { message: 'Network request failed' });
});

test('versão do app é saneada (só caracteres de versão, tamanho limitado)', async () => {
  const base = fetchFalso();
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: async () => ID, versaoApp: '1.3.0 <script>\n' + 'x'.repeat(100) });
  await f('http://192.168.0.10:3001/x');
  const v = cab(base.chamadas[0])['x-lyra-app'];
  assert.match(v, /^[\w.\-]{1,24}$/);
});
