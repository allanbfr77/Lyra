'use strict';

/**
 * Entrega 1 — o elo com DOIS PROCESSOS REAIS (Controlador e Servidor) falando HTTP de verdade.
 *
 * Cada lado roda num processo Node próprio (`elo.*.harness.js`) com a fiação REAL de produção
 * (módulos do núcleo, rotas do elo do Servidor, salto `proxyProjecaoJson`, observadores). Prova:
 * pareamento aprovado/negado/cancelado, assinatura válida/replay/adulterada/corpo alterado, s→c,
 * revogação, rotação, Servidor ANTIGO sem o elo, nada bloqueado e nenhum segredo nos logs.
 *
 * Computadores diferentes: não há aqui. A prova de rede é HTTP real entre processos separados,
 * com identidades e chaves independentes em disco; o que depende de 2 PCs físicos fica registrado
 * como não executado no relatório.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVIDOR = path.join(__dirname, 'elo.servidor.harness.js');
const CONTROLADOR = path.join(__dirname, 'elo.controlador.harness.js');

function iniciar(script, env) {
  const proc = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const linhas = [];
  let resto = '';
  const esperas = [];
  const alimentar = (d) => {
    resto += d;
    let i;
    while ((i = resto.indexOf('\n')) >= 0) {
      const l = resto.slice(0, i).replace(/\r$/, '');
      resto = resto.slice(i + 1);
      linhas.push(l);
      for (const e of [...esperas]) if (e.re.test(l)) { esperas.splice(esperas.indexOf(e), 1); e.ok(l); }
    }
  };
  proc.stdout.on('data', alimentar);
  proc.stderr.on('data', alimentar);
  const esperarLinha = (re, ms = 15000) => new Promise((ok, falha) => {
    const ja = linhas.find((l) => re.test(l));
    if (ja) return ok(ja);
    const t = setTimeout(() => falha(new Error(`linha ${re} não apareceu.\n${linhas.join('\n')}`)), ms);
    esperas.push({ re, ok: (l) => { clearTimeout(t); ok(l); } });
    return undefined;
  });
  return { proc, linhas, esperarLinha, parar: () => { try { proc.kill(); } catch (_) { /* ignora */ } } };
}

async function subir(script, env) {
  const p = iniciar(script, env);
  const porta = Number((await p.esperarLinha(/^PORTA \d+$/)).split(' ')[1]);
  return { ...p, porta, base: `http://127.0.0.1:${porta}` };
}

function chamar(porta, metodo, caminho, corpo, cab = {}) {
  return new Promise((resolve, reject) => {
    const payload = corpo === undefined ? null : Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
    const rq = http.request({
      host: '127.0.0.1', port: porta, path: caminho, method: metodo,
      headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}), ...cab },
    }, (rs) => {
      let t = '';
      rs.on('data', (d) => { t += d; });
      rs.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (_) { /* não é JSON */ } resolve({ status: rs.statusCode, json: j, texto: t }); });
    });
    rq.on('error', reject);
    if (payload) rq.write(payload);
    rq.end();
  });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const eventos = async (p) => (await chamar(p.porta, 'GET', '/__eventos')).json;

async function cenario(fn, { semElo = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-elo2p-'));
  const servidor = await subir(SERVIDOR, { HARNESS_DIR: dir, SEM_ELO: semElo ? '1' : '0' });
  const controlador = await subir(CONTROLADOR, { HARNESS_DIR: dir, BASE_SERVIDOR: servidor.base });
  try {
    await fn({ dir, servidor, controlador });
  } finally {
    servidor.parar();
    controlador.parar();
    await dormir(100);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignora */ }
  }
}

/** Pareia de ponta a ponta: o operador (loopback) aprova o pedido que aparece no Servidor. */
/** Espera a N+1-ésima linha que casa com `re` (as anteriores são de pareamentos já feitos). */
async function novaLinha(p, re, jaVistas, ms = 15000) {
  const limite = Date.now() + ms;
  for (;;) {
    const l = p.linhas.filter((x) => re.test(x));
    if (l.length > jaVistas) return l[jaVistas];
    if (Date.now() > limite) throw new Error(`linha ${re} não apareceu`);
    await dormir(20);
  }
}

async function parear({ servidor, controlador }, { decisao = 'aprovar', aguardarResultado = true } = {}) {
  const pedidosAntes = servidor.linhas.filter((x) => /^PEDIDO /.test(x)).length;
  const codigosAntes = controlador.linhas.filter((x) => /^CODIGO /.test(x)).length;
  const resultado = chamar(controlador.porta, 'POST', '/__parear', {});
  const pedido = JSON.parse((await novaLinha(servidor, /^PEDIDO /, pedidosAntes)).slice(7));
  const codigoCtl = (await novaLinha(controlador, /^CODIGO \d{3}-\d{3}$/, codigosAntes)).split(' ')[1];
  if (decisao !== 'nenhuma') await chamar(servidor.porta, 'POST', `/api/elo/pareamentos/${pedido.pairingId}/${decisao}`, {});
  if (!aguardarResultado) return { resultado, pedido, codigoCtl };
  const r = await resultado;
  return { r: r.json, pedido, codigoCtl };
}

const OBS = { PUT: '/api/display-config' };
const hop = (controlador, corpo = { a: 1 }) => chamar(controlador.porta, 'PUT', OBS.PUT, corpo);

test('pareamento aprovado entre dois processos: mesmo código nos dois, chaves iguais, hop assinado e «valido»', async () => {
  await cenario(async ({ dir, servidor, controlador }) => {
    // antes: o salto vai SEM assinatura e o Servidor registra «ausente» (nada é recusado)
    assert.equal((await hop(controlador)).status, 200);
    assert.ok((await eventos(servidor)).some((e) => e.evento === 'elo-http' && e.rota === 'S-007' && e.resultado === 'ausente'));

    const p = await parear({ servidor, controlador });
    assert.equal(p.r.estado, 'aprovado');
    assert.equal(p.codigoCtl, p.pedido.codigo, 'os dois operadores veem o mesmo código');

    // depois: o salto REAL leva X-Lyra-Via e o Servidor confere como válido
    assert.equal((await hop(controlador, { cor: 'azul' })).status, 200);
    const ev = await eventos(servidor);
    assert.ok(ev.some((e) => e.rota === 'S-007' && e.resultado === 'valido'), JSON.stringify(ev));
    const ultimo = (await chamar(servidor.porta, 'GET', '/__ultimos')).json.pop();
    assert.ok(ultimo.via && ultimo.via.startsWith('v1;kid='), 'o Servidor recebeu o cabeçalho do elo');

    // as chaves estão em disco, são iguais e a listagem nunca as expõe
    const arqS = JSON.parse(fs.readFileSync(path.join(dir, 'elo-servidor.json'), 'utf8'));
    const arqC = JSON.parse(fs.readFileSync(path.join(dir, 'elo-controlador.json'), 'utf8'));
    const [kid] = Object.keys(arqS.chaves);
    assert.equal(arqS.chaves[kid].chave, arqC.chaves[kid].chave);
    assert.equal(JSON.stringify((await chamar(servidor.porta, 'GET', '/__chaves')).json).includes(arqS.chaves[kid].chave), false);

    // nenhum segredo nos logs dos dois processos
    const chave = arqS.chaves[kid].chave;
    const chaveHex = Buffer.from(chave, 'base64').toString('hex');
    for (const p2 of [servidor, controlador]) {
      const tudo = p2.linhas.join('\n');
      for (const s of [chave, chaveHex, chave.replace(/=+$/, '')]) assert.equal(tudo.includes(s), false);
      assert.equal(tudo.includes(ultimo.via), false, 'a assinatura (valor do cabeçalho) também não vai para o log');
    }
  });
});

test('replay, corpo alterado e rota trocada contra o Servidor real: repetida / assinatura / assinatura', async () => {
  await cenario(async ({ servidor, controlador }) => {
    assert.equal((await parear({ servidor, controlador })).r.estado, 'aprovado');
    const corpo = '{"x":1}';
    const { via } = (await chamar(controlador.porta, 'POST', '/__assinar', { metodo: 'PUT', caminho: '/api/display-config', corpo })).json;
    const enviar = (caminho, c, v) => chamar(servidor.porta, 'PUT', caminho, c, { 'X-Lyra-Via': v });
    assert.equal((await enviar('/api/display-config', corpo, via)).status, 200);
    assert.equal((await enviar('/api/display-config', corpo, via)).status, 200, 'registrar nunca bloqueia, nem o replay');
    const v2 = (await chamar(controlador.porta, 'POST', '/__assinar', { metodo: 'PUT', caminho: '/api/display-config', corpo })).json.via;
    await enviar('/api/display-config', '{"x":2}', v2); // corpo alterado
    const v3 = (await chamar(controlador.porta, 'POST', '/__assinar', { metodo: 'PUT', caminho: '/api/display-config', corpo })).json.via;
    await enviar('/api/display-config/preview', corpo, v3); // rota trocada (preview também é ELO)
    const res = (await eventos(servidor)).filter((e) => e.evento === 'elo-http').map((e) => e.resultado);
    assert.deepEqual(res, ['valido', 'repetida', 'assinatura', 'assinatura']);
  });
});

test('pareamento NEGADO e CANCELADO entre processos: nenhuma chave em nenhum lado e o hop segue sem assinatura', async () => {
  await cenario(async ({ dir, servidor, controlador }) => {
    const negado = await parear({ servidor, controlador }, { decisao: 'negar' });
    assert.equal(negado.r.estado, 'negado');
    assert.deepEqual((await chamar(controlador.porta, 'GET', '/__chaves')).json, []);
    assert.deepEqual((await chamar(servidor.porta, 'GET', '/__chaves')).json, []);
    assert.equal((await hop(controlador)).status, 200);
    assert.equal((await chamar(servidor.porta, 'GET', '/__ultimos')).json.pop().via, null);

    // cancelado pelo Controlador antes de qualquer decisão: aprovar depois não gera chave
    const c = await parear({ servidor, controlador }, { decisao: 'nenhuma', aguardarResultado: false });
    await chamar(controlador.porta, 'POST', '/__cancelar', {});
    assert.equal((await c.resultado).json.estado, 'cancelado');
    assert.equal((await chamar(servidor.porta, 'POST', `/api/elo/pareamentos/${c.pedido.pairingId}/aprovar`, {})).json.ok, false);
    assert.deepEqual((await chamar(servidor.porta, 'GET', '/__chaves')).json, []);
    assert.deepEqual((await chamar(controlador.porta, 'GET', '/__chaves')).json, []);
    void dir;
  });
});

test('s→c: o Servidor assina uma chamada ao 3001 e o Controlador a observa como «valido» (direção c→s é recusada ali)', async () => {
  await cenario(async ({ servidor, controlador }) => {
    assert.equal((await parear({ servidor, controlador })).r.estado, 'aprovado');
    const r = await chamar(servidor.porta, 'POST', '/__chamar-controlador', { porta: controlador.porta, caminho: '/api/apresentacao/midia/abc' });
    assert.deepEqual(r.json, { status: 200, assinou: true });
    const ev = (await eventos(controlador)).filter((e) => e.evento === 'elo-http');
    assert.deepEqual(ev.map((e) => [e.rota, e.direcao, e.resultado]), [['C-004', 's→c', 'valido']]);
    // uma assinatura c→s apresentada ao 3001 (rota que espera s→c) não vale
    const { via } = (await chamar(controlador.porta, 'POST', '/__assinar', { metodo: 'GET', caminho: '/api/apresentacao/midia/abc' })).json;
    await chamar(controlador.porta, 'GET', '/api/apresentacao/midia/abc', undefined, { 'X-Lyra-Via': via });
    const ev2 = (await eventos(controlador)).filter((e) => e.evento === 'elo-http');
    assert.equal(ev2[ev2.length - 1].resultado, 'direcao');
  });
});

test('revogação no Servidor: a assinatura do Controlador passa a ser «chave-revogada» (e nada é bloqueado)', async () => {
  await cenario(async ({ servidor, controlador }) => {
    assert.equal((await parear({ servidor, controlador })).r.estado, 'aprovado');
    const kid = (await chamar(servidor.porta, 'GET', '/__chaves')).json[0].kid;
    assert.equal((await chamar(servidor.porta, 'POST', '/api/elo/chaves/revogar', { kid })).json.ok, true);
    assert.equal((await hop(controlador)).status, 200);
    const ev = (await eventos(servidor)).filter((e) => e.evento === 'elo-http');
    assert.equal(ev[ev.length - 1].resultado, 'chave-revogada');
  });
});

test('rotação: parear de novo substitui a chave (a antiga vale pela graça) e a nova assina', async () => {
  await cenario(async ({ servidor, controlador }) => {
    const a = await parear({ servidor, controlador });
    assert.equal(a.r.estado, 'aprovado');
    await dormir(20);
    const b = await parear({ servidor, controlador });
    assert.equal(b.r.estado, 'aprovado');
    const chaves = (await chamar(servidor.porta, 'GET', '/__chaves')).json;
    assert.deepEqual(chaves.map((c) => c.estado).sort(), ['ativa', 'substituida']);
    assert.equal((await hop(controlador)).status, 200);
    const ev = (await eventos(servidor)).filter((e) => e.evento === 'elo-http');
    const ultimo = ev[ev.length - 1];
    assert.equal(ultimo.resultado, 'valido');
    assert.equal(ultimo.kid, b.r.kid, 'a chave NOVA assinou');
  });
});

test('gestão do elo no Servidor só da própria máquina: rotas administrativas exigem loopback (aqui é loopback, então responde)', async () => {
  await cenario(async ({ servidor }) => {
    const r = await chamar(servidor.porta, 'GET', '/api/elo/pareamentos');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json).sort(), ['chaves', 'ok', 'pendentes']);
  });
});

test('Servidor ANTIGO (sem o elo): o pareamento nem é tentado, o salto segue idêntico e nada novo é enviado', async () => {
  await cenario(async ({ servidor, controlador }) => {
    const r = await chamar(controlador.porta, 'POST', '/__parear', {});
    assert.equal(r.json.estado, 'sem-suporte');
    assert.equal(servidor.linhas.some((l) => l.startsWith('PEDIDO')), false);
    assert.equal((await hop(controlador)).status, 200);
    const u = (await chamar(servidor.porta, 'GET', '/__ultimos')).json.pop();
    assert.equal(u.via, null, 'sem pareamento o cabeçalho do elo nunca é enviado');
    assert.deepEqual((await chamar(controlador.porta, 'GET', '/__chaves')).json, []);
    const id = (await chamar(servidor.porta, 'GET', '/api/identity')).json;
    assert.equal(id.capacidades, undefined);
    assert.equal((await chamar(servidor.porta, 'GET', '/api/elo/pareamentos')).status, 404, 'as rotas do elo não existem no Servidor antigo');
  }, { semElo: true });
});

test('Servidor NOVO anuncia as capacidades em /api/identity (detecção de compatibilidade)', async () => {
  await cenario(async ({ servidor }) => {
    const id = (await chamar(servidor.porta, 'GET', '/api/identity')).json;
    assert.deepEqual(id.capacidades, { elo: 1, sessaoControlador: 1 });
  });
});

test('pedidos de pareamento são limitados (pendentes) e inválidos não geram pedido', async () => {
  await cenario(async ({ servidor }) => {
    assert.equal((await chamar(servidor.porta, 'POST', '/api/elo/parear', { idControlador: 'x', publica: 'lixo' })).status, 400);
    assert.equal(servidor.linhas.some((l) => l.startsWith('PEDIDO')), false);
    assert.equal((await chamar(servidor.porta, 'GET', '/api/elo/parear/inexistente')).json.estado, 'desconhecido');
  });
});

test('verificação delegada entre processos: sem pareamento nada é delegado; pareado, o Servidor real responde pela allowlist dele', async () => {
  await cenario(async ({ servidor, controlador }) => {
    const bom = { deviceId: 'pc-1-harness', secret: 'seg-1' };
    const antes = (await chamar(controlador.porta, 'POST', '/__verificar', bom)).json;
    assert.deepEqual(antes, { primeira: null, segunda: null }, 'sem pareamento: «não verificável», como sempre foi');

    assert.equal((await parear({ servidor, controlador })).r.estado, 'aprovado');
    const ok = (await chamar(controlador.porta, 'POST', '/__verificar', bom)).json;
    assert.equal(ok.primeira, null, 'o primeiro veredito chega em segundo plano');
    assert.deepEqual(ok.segunda, { ok: true, classe: 'autorizado' });
    const ruim = (await chamar(controlador.porta, 'POST', '/__verificar', { deviceId: 'pc-1-harness', secret: 'errado' })).json;
    assert.deepEqual(ruim.segunda, { ok: false, classe: 'secret-invalido' });
    const desconhecido = (await chamar(controlador.porta, 'POST', '/__verificar', { deviceId: 'ninguem', secret: 'x' })).json;
    assert.deepEqual(desconhecido.segunda, { ok: false, classe: 'desconhecido' });

    // a rota é auto-protegida: sem o elo (ou com elo repetido) o Servidor responde 401 e NÃO vira oráculo
    const semElo = await chamar(servidor.porta, 'POST', '/api/elo/verificar-dispositivo', bom);
    assert.equal(semElo.status, 401);
    assert.equal(semElo.json.motivo, 'elo-ausente');
    assert.equal(JSON.stringify(semElo.json).includes('autorizado'), false);
    const corpo = JSON.stringify(bom);
    const { via } = (await chamar(controlador.porta, 'POST', '/__assinar', { metodo: 'POST', caminho: '/api/elo/verificar-dispositivo', corpo })).json;
    assert.equal((await chamar(servidor.porta, 'POST', '/api/elo/verificar-dispositivo', corpo, { 'X-Lyra-Via': via })).status, 200);
    const replay = await chamar(servidor.porta, 'POST', '/api/elo/verificar-dispositivo', corpo, { 'X-Lyra-Via': via });
    assert.equal(replay.status, 401);
    assert.equal(replay.json.motivo, 'elo-repetida');
    // corpo adulterado com assinatura de outro corpo
    const { via: via2 } = (await chamar(controlador.porta, 'POST', '/__assinar', { metodo: 'POST', caminho: '/api/elo/verificar-dispositivo', corpo })).json;
    const adulterado = await chamar(servidor.porta, 'POST', '/api/elo/verificar-dispositivo', JSON.stringify({ deviceId: 'pc-1-harness', secret: 'outro' }), { 'X-Lyra-Via': via2 });
    assert.equal(adulterado.status, 401);
    assert.equal(adulterado.json.motivo, 'elo-assinatura');
    // o Servidor não registrou o segredo em lugar nenhum
    assert.equal(servidor.linhas.join(' | ').includes('seg-1'), false);
    assert.equal(controlador.linhas.join(' | ').includes('seg-1'), false);
  });
});
