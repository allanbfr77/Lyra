'use strict';

/**
 * E1.1 — `validarUrlNuvemTons`: a URL da API de tons na nuvem só vale se for HTTPS e de um
 * host EXATO autorizado (lista padrão + `INVB_TONS_SYNC_HOSTS`). Subdomínios não
 * cadastrados, curingas e domínios "parecidos" são recusados.
 */

const test = require('node:test');
const assert = require('node:assert');
const {
  validarUrlNuvemTons,
  segredosIguais,
  HOSTS_PERMITIDOS_PADRAO,
} = require('./segurancaSyncInvb');

const HOST = 'invb-webhook-api.onrender.com';

test('hosts exatos autorizados por padrão', () => {
  assert.deepStrictEqual(HOSTS_PERMITIDOS_PADRAO, [HOST]);
});

test('o host autorizado é aceito e a base sai normalizada, sem barra final', () => {
  assert.deepStrictEqual(validarUrlNuvemTons(`https://${HOST}`, {}), {
    ok: true,
    base: `https://${HOST}`,
  });
  assert.deepStrictEqual(validarUrlNuvemTons(`https://${HOST}/`, {}), {
    ok: true,
    base: `https://${HOST}`,
  });
  assert.deepStrictEqual(validarUrlNuvemTons(`  https://${HOST}/prefixo/  `, {}), {
    ok: true,
    base: `https://${HOST}/prefixo`,
  });
  assert.strictEqual(validarUrlNuvemTons(`https://${HOST.toUpperCase()}`, {}).ok, true);
});

const NAO_CADASTRADOS = [
  'https://outro-servico.onrender.com',
  'https://invb-share-api.onrender.com',
  'https://invb-tons.onrender.com',
  'https://tons.invbotafogo.com.br',
  'https://louvores.invbotafogo.com.br',
  'https://database.invbotafogo.com.br',
  'https://invbotafogo.com.br',
  'https://onrender.com',
  'https://a.b.onrender.com',
  `https://x.${HOST}`,
  `https://${HOST}.evil.example`,
  `https://evil-${HOST}`,
  `https://${HOST}.`,
  'https://evil.example',
];

for (const url of NAO_CADASTRADOS) {
  test(`host não cadastrado é recusado: ${url}`, () => {
    const r = validarUrlNuvemTons(url, {});
    assert.strictEqual(r.ok, false);
    assert.match(r.motivo, /host não permitido/);
  });
}

test('INVB_TONS_SYNC_HOSTS cadastra hosts exatos (espaços e caixa são ignorados)', () => {
  const env = { INVB_TONS_SYNC_HOSTS: ' Tons.Exemplo.org ,segundo.exemplo.org,, ' };
  assert.strictEqual(validarUrlNuvemTons('https://tons.exemplo.org', env).ok, true);
  assert.strictEqual(validarUrlNuvemTons('https://segundo.exemplo.org/api', env).ok, true);
  /* O host padrão continua valendo junto com os cadastrados. */
  assert.strictEqual(validarUrlNuvemTons(`https://${HOST}`, env).ok, true);
});

test('INVB_TONS_SYNC_HOSTS não autoriza subdomínios, domínio raiz nem curingas', () => {
  const env = { INVB_TONS_SYNC_HOSTS: 'tons.exemplo.org,*.curinga.org,.ponto.org' };
  for (const url of [
    'https://x.tons.exemplo.org',
    'https://exemplo.org',
    'https://x.curinga.org',
    'https://curinga.org',
    'https://x.ponto.org',
    'https://ponto.org',
  ]) {
    const r = validarUrlNuvemTons(url, env);
    assert.strictEqual(r.ok, false, url);
    assert.match(r.motivo, /host não permitido/);
  }
});

test('mesmo um host cadastrado continua exigindo HTTPS e rejeita porta, credenciais, query e fragmento', () => {
  const env = { INVB_TONS_SYNC_HOSTS: 'tons.exemplo.org' };
  const casos = [
    ['http://tons.exemplo.org', /HTTPS/],
    ['https://tons.exemplo.org:8443', /porta/],
    ['https://u:p@tons.exemplo.org', /usuário/],
    ['https://tons.exemplo.org/a?x=1', /query/],
    ['https://tons.exemplo.org/#', /fragmento/],
    ['isto-nao-e-url', /malformada/],
    ['', /vazia/],
  ];
  for (const [url, motivo] of casos) {
    const r = validarUrlNuvemTons(url, env);
    assert.strictEqual(r.ok, false, url);
    assert.match(r.motivo, motivo, url);
  }
});

test('endereços IP são recusados mesmo se alguém os cadastrar em INVB_TONS_SYNC_HOSTS', () => {
  const env = { INVB_TONS_SYNC_HOSTS: '127.0.0.1,[::1],169.254.169.254' };
  for (const url of ['https://127.0.0.1', 'https://[::1]', 'https://169.254.169.254']) {
    const r = validarUrlNuvemTons(url, env);
    assert.strictEqual(r.ok, false, url);
    assert.match(r.motivo, /endereço IP/);
  }
});

test('segredosIguais: igual só quando idênticos, sem erro para tamanhos diferentes', () => {
  assert.strictEqual(segredosIguais('abc', 'abc'), true);
  assert.strictEqual(segredosIguais('abc', 'abd'), false);
  assert.strictEqual(segredosIguais('abc', 'ab'), false);
  assert.strictEqual(segredosIguais('abc', ''), false);
  assert.strictEqual(segredosIguais('abc', undefined), false);
  assert.strictEqual(segredosIguais('é'.repeat(300), 'é'.repeat(300)), true);
});
