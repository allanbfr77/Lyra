'use strict';

/**
 * E1.3 Fase C — C1: registro das decisões de política no middleware de autenticação.
 *
 * Express e HTTP reais (porta 0, 127.0.0.1). A opção nova `registrarDecisao` só OBSERVA: nenhuma
 * requisição pode ser bloqueada em `registrar`, a decisão de `impor` continua exatamente a de
 * antes e os eventos existentes (`registrar`) não mudam de formato.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const M = require('../../packages/projection-core/src/manifestoRotas');
const { autenticacaoHttp } = require('@lyra/projection-core');

const { criarAutenticacaoHttp } = autenticacaoHttp;

const SEGREDO = 'SEGREDO-NAO-VAZAR-C1-0123456789';
const CONTEXTOS = { C: 'controlador-3001', S: 'servidor-5510', L: 'local-5510' };

function requisitar(porta, { method = 'GET', caminho = '/', headers = {}, corpo } = {}) {
  return new Promise((resolve, reject) => {
    const dados = corpo === undefined ? null : Buffer.from(JSON.stringify(corpo));
    const req = http.request(
      { host: '127.0.0.1', port: porta, method, path: caminho, headers: { ...(dados ? { 'content-type': 'application/json', 'content-length': dados.length } : {}), ...headers } },
      (res) => {
        const partes = [];
        res.on('data', (c) => partes.push(c));
        res.on('end', () => resolve({ status: res.statusCode, texto: Buffer.concat(partes).toString('utf8') }));
      }
    );
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

/** Verificador: 'dev-ok' autorizado, 'dev-pend' pendente, 'interna-x' interna; o resto desconhecido. */
function verificar(auth) {
  if (auth.deviceId === 'interna-x') return { ok: true, classe: 'interna' };
  if (auth.deviceId === 'dev-ok-0001') return { ok: true, classe: 'autorizado' };
  if (auth.deviceId === 'dev-pend-02') return { ok: false, classe: 'pendente' };
  return { ok: false, classe: 'desconhecido' };
}

const CRED = {
  nenhuma: {},
  desconhecido: { 'X-Lyra-Device': 'dev-ninguem-99', 'X-Lyra-Secret': SEGREDO },
  pendente: { 'X-Lyra-Device': 'dev-pend-02', 'X-Lyra-Secret': SEGREDO },
  autorizado: { 'X-Lyra-Device': 'dev-ok-0001', 'X-Lyra-Secret': SEGREDO, 'X-Lyra-App': '1.3.0' },
  interna: { 'X-Lyra-Device': 'interna-x', 'X-Lyra-Secret': SEGREDO },
};

/** Sobe um app com o middleware e UMA rota por entrada do manifesto do contexto. */
async function subirContexto(sigla, { modo = 'registrar', comDecisao = true, registrarDecisao, extras } = {}) {
  const eventosDecisao = [];
  const eventosAuth = [];
  const executados = [];
  const auth = criarAutenticacaoHttp({
    modo,
    contexto: CONTEXTOS[sigla],
    verificar,
    registrar: (e) => eventosAuth.push(e),
    ...(comDecisao ? { registrarDecisao: registrarDecisao || ((e) => eventosDecisao.push(e)) } : {}),
    ...(extras || {}),
  });
  const app = express();
  app.use(auth.middleware);
  app.use(express.json());
  for (const r of M.ROTAS.filter((x) => x.servidor === sigla)) {
    const ex = (req, res) => { executados.push(`${req.method} ${req.path}`); res.json({ ok: true }); };
    if (r.tipo === 'proxy') {
      if (r.caminho.includes('{video,midia}')) app.all(/^\/api\/apresentacao\/(video|midia)\/.+/, ex);
      else app.all(new RegExp(`^${r.caminho.replace('/*', '').replace(/\//g, '\\/')}(\\/.*)?$`), ex);
    } else if (r.tipo === 'socket') app.all('/socket.io/*', ex);
    else if (r.tipo === 'estatico') app.get(/^\/(?!api).*/, ex);
    else app[r.metodo.toLowerCase()](r.caminho, ex);
  }
  app.all('*', (req, res) => { executados.push(`${req.method} ${req.path}`); res.status(404).json({ ok: false }); });
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { porta: srv.address().port, srv, auth, eventosDecisao, eventosAuth, executados, fechar: () => new Promise((r) => srv.close(r)) };
}

function concreto(r) {
  if (r.tipo === 'estatico') return '/index.html';
  return r.caminho.replace('{video,midia}', 'video').replace(/:[A-Za-z_]+/g, '1').replace('*', 'x');
}

/* ───────────────────────── nada é bloqueado ───────────────────────── */

for (const sigla of ['C', 'S', 'L']) {
  test(`registrar (${CONTEXTOS[sigla]}): NENHUMA rota do manifesto é bloqueada, com qualquer credencial`, async () => {
    const s = await subirContexto(sigla);
    try {
      let n = 0;
      for (const r of M.ROTAS.filter((x) => x.servidor === sigla)) {
        for (const [nome, h] of Object.entries(CRED)) {
          const metodo = r.metodo.split(',')[0];
          const resp = await requisitar(s.porta, { method: metodo, caminho: concreto(r), headers: h, corpo: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo) ? { a: 1 } : undefined });
          assert.equal(resp.status, 200, `${r.id} ${metodo} ${concreto(r)} com credencial «${nome}» foi bloqueada`);
          n += 1;
        }
      }
      assert.equal(s.executados.length, n, 'todos os handlers executaram');
      assert.equal(s.auth.modo, 'registrar');
      const bruto = JSON.stringify(s.eventosDecisao) + JSON.stringify(s.eventosAuth);
      assert.ok(!bruto.includes(SEGREDO), 'nenhum segredo nos eventos');
      assert.ok(s.eventosDecisao.length > 0, 'houve decisões registradas');
    } finally { await s.fechar(); }
  });
}

test('registrar: requisições proxificadas, de OPTIONS e HEAD também passam', async () => {
  const s = await subirContexto('S');
  try {
    const opcoes = await requisitar(s.porta, { method: 'OPTIONS', caminho: '/api/display-config' });
    assert.ok(![401, 403].includes(opcoes.status), `OPTIONS não pode ser recusado (status ${opcoes.status})`);
    assert.equal((await requisitar(s.porta, { method: 'HEAD', caminho: '/api/estado' })).status, 200);
    assert.equal((await requisitar(s.porta, { method: 'POST', caminho: '/api/comando/audio_play', headers: { 'X-Lyra-Proxy': '1' } })).status, 200);
  } finally { await s.fechar(); }
});

/* ───────────────────────── o que é registrado ───────────────────────── */

test('evento: rota PL no Controlador com dispositivo autorizado — registra o motivo futuro, sem segredo', async () => {
  const s = await subirContexto('C');
  try {
    await requisitar(s.porta, { method: 'GET', caminho: '/api/historico?periodo=hoje', headers: CRED.autorizado });
    const e = s.eventosDecisao.find((x) => x.caminho === '/api/historico');
    assert.ok(e, 'evento da rota PL');
    assert.equal(e.evento, 'politica-http');
    assert.equal(e.contexto, 'controlador-3001');
    assert.equal(e.modo, 'registrar');
    assert.equal(e.metodo, 'GET');
    assert.equal(e.rota.classe, 'leitura-sensivel');
    assert.equal(e.rota.classeAtual, 'leitura');
    assert.deepEqual(e.rota.politica, ['PL']);
    assert.equal(e.rota.origem, 'manifesto');
    assert.equal(e.esperada.interna, 'exigida');
    assert.equal(e.apresentada.tipo, 'dispositivo-autorizado');
    assert.equal(e.apresentada.deviceId, 'dev-ok-0…');
    assert.equal(e.apresentada.appVersao, '1.3.0');
    assert.equal(e.recusariaEmImpor, true);
    assert.match(e.motivoFuturo, /^painel-local:/);
    assert.equal(e.origemDaDecisao, 'manifesto:C-' + e.rota.id.split('-')[1]);
    assert.ok(!JSON.stringify(e).includes(SEGREDO));
    assert.ok(!JSON.stringify(e).includes('periodo'), 'sem query string');
  } finally { await s.fechar(); }
});

test('evento: a credencial interna numa rota PL NÃO gera evento de recusa, mas conta no resumo', async () => {
  const s = await subirContexto('C');
  try {
    await requisitar(s.porta, { method: 'GET', caminho: '/api/historico', headers: CRED.interna });
    assert.equal(s.eventosDecisao.filter((x) => x.caminho === '/api/historico').length, 0);
    const r = s.auth.resumoPolitica().find((x) => x.caminho === '/api/historico');
    assert.ok(r && r.total === 1 && r.recusaria === false && r.apresentada === 'interna');
  } finally { await s.fechar(); }
});

test('evento: rota pública pretendida que HOJE exige credencial registra a divergência (liberaria)', async () => {
  const s = await subirContexto('S');
  try {
    await requisitar(s.porta, { method: 'GET', caminho: '/api/monitores' });
    const e = s.eventosDecisao.find((x) => x.caminho === '/api/monitores');
    assert.ok(e);
    assert.equal(e.rota.classeAtual, 'leitura');
    assert.deepEqual(e.rota.politica, ['PUB-LEVE']);
    assert.equal(e.divergeDaClasseAtual, true);
    assert.equal(e.recusariaEmImpor, false, 'com a política pretendida passaria');
    assert.equal(e.seriaRecusadaPelaClasseAtual, true, 'com a classe atual seria recusada');
    // a autenticação existente continua registrando o que registrava
    assert.ok(s.eventosAuth.some((x) => x.caminho === '/api/monitores'));
  } finally { await s.fechar(); }
});

test('evento: pedido com aceite humano é registrado como PEDIDO (não é «seria recusada»)', async () => {
  const s = await subirContexto('C');
  try {
    await requisitar(s.porta, { method: 'POST', caminho: '/api/sync/banco/pedido', corpo: { snapshot: {} } });
    const e = s.eventosDecisao.find((x) => x.caminho === '/api/sync/banco/pedido');
    assert.ok(e);
    assert.deepEqual(e.rota.politica, ['PEDIDO']);
    assert.equal(e.esperada.humano, true);
    assert.equal(e.recusariaEmImpor, false);
  } finally { await s.fechar(); }
});

test('evento: ELO/ADM declaram credencial interprocessos esperada e inexistente — nunca satisfeita', async () => {
  const s = await subirContexto('S');
  try {
    await requisitar(s.porta, { method: 'POST', caminho: '/api/internal/restart', headers: CRED.autorizado });
    const e = s.eventosDecisao.find((x) => x.caminho === '/api/internal/restart');
    assert.ok(e);
    assert.equal(e.esperada.interprocessos.esperada, true);
    assert.equal(e.esperada.interprocessos.existe, false);
    assert.equal(e.credencialInexistente, true);
    assert.equal(e.recusariaEmImpor, true);
    assert.match(e.motivoFuturo, /interprocessos/);
  } finally { await s.fechar(); }
});

test('evento: rota sem entrada no manifesto é sinalizada (origem sem-manifesto)', async () => {
  const s = await subirContexto('C');
  try {
    await requisitar(s.porta, { method: 'GET', caminho: '/api/rota-que-nao-existe' });
    const e = s.eventosDecisao.find((x) => x.caminho === '/api/rota-que-nao-existe');
    assert.ok(e);
    assert.equal(e.rota.origem, 'sem-manifesto');
    assert.equal(e.recusariaEmImpor, null);
    assert.equal(e.motivoFuturo, 'rota-sem-politica');
  } finally { await s.fechar(); }
});

test('contextos diferentes, mesma requisição, decisões diferentes (PUT /api/display-config)', async () => {
  const resultado = {};
  for (const sigla of ['C', 'S', 'L']) {
    const s = await subirContexto(sigla);
    try {
      await requisitar(s.porta, { method: 'PUT', caminho: '/api/display-config', headers: CRED.autorizado, corpo: {} });
      resultado[sigla] = s.auth.resumoPolitica().find((x) => x.caminho === '/api/display-config');
    } finally { await s.fechar(); }
  }
  assert.deepEqual(resultado.C.politica, ['PL', 'ELO']);
  assert.deepEqual(resultado.S.politica, ['ESC', 'ELO']);
  assert.deepEqual(resultado.L.politica, ['ESC']);
  assert.equal(resultado.C.recusaria, true, 'PL não aceita dispositivo');
  assert.equal(resultado.S.recusaria, false, 'no Servidor o dispositivo autorizado serve');
  assert.equal(resultado.L.recusaria, false);
  assert.notEqual(resultado.C.id, resultado.S.id);
});

test('proxificada: a marca é registrada como pista; proxy do Servidor fica identificado', async () => {
  const s = await subirContexto('S');
  try {
    await requisitar(s.porta, { method: 'POST', caminho: '/api/musicas', headers: CRED.autorizado, corpo: {} });
    const e = s.eventosDecisao.find((x) => x.caminho === '/api/musicas' && x.metodo === 'POST');
    assert.ok(e);
    assert.equal(e.rota.tipo, 'proxy');
    assert.equal(e.proxy.atravessa, false);
    assert.equal(e.proxy.statusDoProxy, 405);
  } finally { await s.fechar(); }
  const c = await subirContexto('C');
  try {
    await requisitar(c.porta, { method: 'GET', caminho: '/api/musicas/3', headers: { ...CRED.autorizado, 'X-Lyra-Proxy': '1' } });
    const e = c.eventosDecisao.find((x) => x.caminho === '/api/musicas/3');
    assert.ok(!e || e.proxificada === true);
    const r = c.auth.resumoPolitica().find((x) => x.caminho === '/api/musicas/3');
    assert.ok(r && r.proxificada === true && r.alcancavelPorProxy === true);
  } finally { await c.fechar(); }
});

test('identidade do cliente é truncada e o caminho limitado; nada além do necessário', async () => {
  const s = await subirContexto('C');
  try {
    const longo = `/api/musicas/${'a'.repeat(400)}`;
    await requisitar(s.porta, { method: 'GET', caminho: longo, headers: { 'X-Lyra-Device': 'dispositivo-com-id-muito-comprido-123456', 'X-Lyra-Secret': SEGREDO, 'X-Lyra-App': '9.9.9 <script>' } });
    const e = s.eventosDecisao.find((x) => x.caminho.startsWith('/api/musicas/aaa'));
    assert.ok(e);
    assert.ok(e.caminho.length <= 121);
    assert.equal(e.apresentada.deviceId, 'disposit…');
    assert.match(e.apresentada.appVersao, /^[\w.-]*$/);
    const chaves = Object.keys(e).sort();
    for (const proibida of ['secret', 'segredo', 'headers', 'authorization', 'cookie', 'body']) assert.ok(!chaves.includes(proibida));
    assert.ok(!JSON.stringify(e).includes(SEGREDO));
  } finally { await s.fechar(); }
});

test('deduplicação e teto: o mesmo evento não se repete e o total é limitado', async () => {
  const s = await subirContexto('C', { extras: { maxRegistros: 5 } });
  try {
    for (let i = 0; i < 6; i += 1) await requisitar(s.porta, { method: 'GET', caminho: '/api/historico', headers: CRED.desconhecido });
    assert.equal(s.eventosDecisao.filter((x) => x.caminho === '/api/historico').length, 1);
    for (let i = 0; i < 12; i += 1) await requisitar(s.porta, { method: 'GET', caminho: `/api/rota-${i}-inexistente` });
    assert.ok(s.eventosDecisao.length <= 5, `teto respeitado: ${s.eventosDecisao.length}`);
    const total = s.auth.resumoPolitica().find((x) => x.caminho === '/api/historico');
    assert.equal(total.total, 6, 'o resumo conta as repetições que o log omitiu');
  } finally { await s.fechar(); }
});

/* ───────────────────────── a autenticação existente não muda ───────────────────────── */

test('compatibilidade: com ou sem registrarDecisao, os eventos de autenticação (Fase A/B) são idênticos', async () => {
  const roteiro = [
    ['GET', '/api/musicas', CRED.nenhuma], ['PUT', '/api/musicas/3', CRED.desconhecido], ['POST', '/api/sync/banco/pedido/aceitar', CRED.autorizado],
    ['GET', '/api/historico', CRED.pendente], ['POST', '/api/tom-memoria/webhook-invb', CRED.nenhuma], ['DELETE', '/api/musicas/3', CRED.interna],
  ];
  const coletar = async (comDecisao) => {
    const s = await subirContexto('C', { comDecisao });
    try {
      for (const [m, c, h] of roteiro) await requisitar(s.porta, { method: m, caminho: c, headers: h, corpo: ['PUT', 'POST', 'DELETE'].includes(m) ? {} : undefined });
      return s.eventosAuth;
    } finally { await s.fechar(); }
  };
  assert.deepEqual(await coletar(true), await coletar(false));
});

test('compatibilidade: em «impor» as respostas são as mesmas com e sem registrarDecisao', async () => {
  const roteiro = [
    ['GET', '/api/musicas', 'nenhuma'], ['GET', '/api/musicas', 'autorizado'], ['GET', '/api/musicas', 'interna'], ['PUT', '/api/musicas/3', 'pendente'],
    ['POST', '/api/sync/banco/pedido/aceitar', 'autorizado'], ['POST', '/api/tom-memoria/webhook-invb', 'nenhuma'], ['GET', '/api/historico', 'desconhecido'],
  ];
  const coletar = async (comDecisao) => {
    const s = await subirContexto('C', { modo: 'impor', comDecisao });
    try {
      const out = [];
      for (const [m, c, h] of roteiro) out.push((await requisitar(s.porta, { method: m, caminho: c, headers: CRED[h], corpo: m === 'GET' ? undefined : {} })).status);
      return out;
    } finally { await s.fechar(); }
  };
  const sem = await coletar(false);
  const com = await coletar(true);
  assert.deepEqual(com, sem);
  assert.ok(sem.includes(401) && sem.includes(200), 'o roteiro realmente exercita recusas e passagens');
});

test('«desligado» não registra decisão; modo inválido continua virando «registrar»', async () => {
  const s = await subirContexto('C', { modo: 'desligado' });
  try {
    await requisitar(s.porta, { method: 'GET', caminho: '/api/historico' });
    assert.equal(s.eventosDecisao.length, 0);
  } finally { await s.fechar(); }
  const t = await subirContexto('C', { modo: 'qualquer-coisa' });
  try {
    assert.equal(t.auth.modo, 'registrar');
  } finally { await t.fechar(); }
});

test('falha no registro de decisão nunca derruba a requisição', async () => {
  const s = await subirContexto('C', { registrarDecisao: () => { throw new Error('boom'); } });
  try {
    const r = await requisitar(s.porta, { method: 'GET', caminho: '/api/historico', headers: CRED.desconhecido });
    assert.equal(r.status, 200);
  } finally { await s.fechar(); }
});

test('sem a opção registrarDecisao nada muda e o resumo de política fica vazio', async () => {
  const s = await subirContexto('C', { comDecisao: false });
  try {
    await requisitar(s.porta, { method: 'GET', caminho: '/api/historico' });
    assert.deepEqual(s.auth.resumoPolitica(), []);
  } finally { await s.fechar(); }
});
