'use strict';

/**
 * E1.3 C2 — paridade de AVALIAÇÃO de escrita (Socket.IO × HTTP) no Servidor 5510.
 *
 * 1. Equivalência do Socket.IO: o `comandoAutorizado` ATUAL (extraído do httpServer.js) responde
 *    exatamente como o ANTERIOR (réplica congelada abaixo) — ack, `comando_recusado`, `donoAtual`.
 * 2. HTTP CMD em `registrar` com Express, allowlist e controleAcesso REAIS: nada é bloqueado, o
 *    handler sempre executa, e o evento observado traz a decisão que seria aplicada.
 * 3. Fiação: onde o gancho e a função compartilhada estão (e onde NÃO estão).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { autenticacaoHttp, controleAcesso } = require('@lyra/projection-core');

const FONTE = fs.readFileSync(path.join(__dirname, 'httpServer.js'), 'utf8');
const SEGREDO = 'SEGREDO-INTEGRACAO-C2-9876543210';

/* ───────────────────────── infraestrutura ───────────────────────── */

function novoAcesso(modo = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-c2-'));
  const allowlistPath = () => path.join(dir, 'allow.json');
  if (modo) fs.writeFileSync(allowlistPath(), JSON.stringify({ modo, devices: {} }));
  return controleAcesso.criarControleAcesso({ allowlistPath, emitParaSocket: () => {}, broadcast: () => {}, notificar: () => {} });
}

/** Mesma fiação do httpServer.js: verificar pura + gancho do bastão sobre a função compartilhada. */
async function subirServidor(acesso, { comGancho = true } = {}) {
  const eventos = [];
  const executados = [];
  const auth = autenticacaoHttp.criarAutenticacaoHttp({
    modo: 'registrar',
    contexto: 'servidor-5510',
    verificar: (a) => acesso.verificarCredencial(a),
    registrar: () => {},
    registrarDecisao: (e) => eventos.push(e),
    ...(comGancho ? { avaliarBastao: (a) => acesso.avaliarEscrita(a) } : {}),
  });
  const app = express();
  app.use(auth.middleware);
  app.use(express.json());
  app.post(/^\/api\/comando\/.*/, (req, res) => { executados.push(req.path); res.json({ ok: true }); });
  app.put(/^\/api\/display-.*/, (req, res) => { executados.push(req.path); res.json({ ok: true }); });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const porta = server.address().port;
  const chamar = (metodo, caminho, cab = {}) => new Promise((resolve, reject) => {
    const rq = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: metodo, headers: { 'content-type': 'application/json', ...cab } }, (rs) => {
      let corpo = '';
      rs.on('data', (d) => { corpo += d; });
      rs.on('end', () => resolve({ status: rs.statusCode, corpo }));
    });
    rq.on('error', reject);
    rq.end('{}');
  });
  return { eventos, executados, chamar, auth, fechar: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

const cred = (id, secret = SEGREDO) => ({ 'X-Lyra-Device': id, 'X-Lyra-Secret': secret });

/** Cenário completo: primário (PC1), secundário (PC2), mobile (autorizado, não registrado), pendente, revogado. */
function montarCenario() {
  const ac = novoAcesso();
  for (const id of ['pc-1', 'pc-2', 'mobile-1', 'rev-1']) ac.autenticar({ deviceId: id, secret: SEGREDO });
  ac.revogarDispositivo('rev-1');
  ac.travar();
  ac.autenticar({ deviceId: 'pend-1', secret: SEGREDO });
  ac.registrarControlador('S1', { deviceId: 'pc-1', nome: 'PC1' });
  ac.registrarControlador('S2', { deviceId: 'pc-2', nome: 'PC2' });
  return ac;
}

const COMANDOS = [
  'exibir_apresentacao', 'exibir_contagem', 'encerrar_contagem', 'encerrar_apresentacao_publico',
  'audio_play', 'audio_pause', 'audio_stop', 'audio_volume', 'audio_seek', 'apresentacao_video_state',
];

/* ───────────────────────── 1. equivalência do Socket.IO ───────────────────────── */

/** Réplica CONGELADA do trecho do httpServer.js anterior à C2 (comandoAutorizado + recusarComando). */
const LEGADO = `
  function comandoAutorizado(socket, ack) {
    if (!socket.data || socket.data.autorizado !== true) {
      return recusarComando(socket, ack, 'nao-autorizado', null);
    }
    if (ctx.acesso.estaRegistrado(socket.id) && !ctx.acesso.podeEscrever(socket.id)) {
      return recusarComando(socket, ack, 'somente-leitura', ctx.acesso.papelDe(socket.id).donoAtual);
    }
    return true;
  }
  function recusarComando(socket, ack, erro, donoAtual) {
    if (typeof ack === 'function') ack({ ok: false, erro, donoAtual });
    else socket.emit('comando_recusado', { erro, donoAtual });
    return false;
  }
`;

/** Extrai do httpServer.js ATUAL o mesmo trecho (comandoAutorizado até o comentário do primeiro middleware). */
function trechoAtual() {
  const ini = FONTE.indexOf('function comandoAutorizado(socket, ack) {');
  const fim = FONTE.indexOf('/* Primeiro middleware do app');
  assert.ok(ini > 0 && fim > ini, 'não encontrei o trecho do comandoAutorizado em httpServer.js');
  return FONTE.slice(ini, fim);
}

function instanciar(fonte, ctx) {
  // eslint-disable-next-line no-new-func
  return new Function('ctx', `${fonte}; return comandoAutorizado;`)(ctx);
}

function socketFalso(id, data) {
  const log = [];
  return { id, data, emit: (evt, dados) => log.push(['emit', evt, JSON.parse(JSON.stringify(dados))]), log };
}

test('Socket.IO: o comandoAutorizado ATUAL responde exatamente como o ANTERIOR em toda a matriz', () => {
  let comparados = 0;
  for (const modo of ['tofu', 'locked', 'aberto']) {
    const ac = novoAcesso(modo);
    ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
    ac.registrarControlador('B', { deviceId: 'dev-2', nome: 'PC2' });
    ac.registrarControlador('C', { deviceId: 'dev-1', nome: 'PC1-b' });
    const ctx = { acesso: ac };
    const antes = instanciar(LEGADO, ctx);
    const agora = instanciar(trechoAtual(), ctx);
    for (const id of ['A', 'B', 'C', 'U']) {
      for (const data of [{ autorizado: true }, { autorizado: false }, { autorizado: undefined }, { autorizado: 'true' }, {}, undefined, null]) {
        for (const comAck of [true, false]) {
          const sA = socketFalso(id, data);
          const sB = socketFalso(id, data);
          const ackA = []; const ackB = [];
          const rA = antes(sA, comAck ? (x) => ackA.push(JSON.parse(JSON.stringify(x))) : undefined);
          const rB = agora(sB, comAck ? (x) => ackB.push(JSON.parse(JSON.stringify(x))) : undefined);
          const rotulo = `${modo} socket=${id} data=${JSON.stringify(data)} ack=${comAck}`;
          assert.equal(rB, rA, `retorno: ${rotulo}`);
          assert.deepEqual(ackB, ackA, `ack: ${rotulo}`);
          assert.deepEqual(sB.log, sA.log, `eventos: ${rotulo}`);
          comparados += 1;
        }
      }
    }
  }
  assert.equal(comparados, 3 * 4 * 7 * 2);
});

test('Socket.IO: o trecho atual usa a avaliação compartilhada (e não repete a regra)', () => {
  const t = trechoAtual();
  assert.match(t, /ctx\.acesso\.avaliarEscrita\(/);
  assert.doesNotMatch(t, /podeEscrever\(/, 'a regra do bastão mora só no controleAcesso');
  assert.doesNotMatch(t, /estaRegistrado\(/);
});

/* ───────────────────────── 2. HTTP CMD em «registrar» ───────────────────────── */

test('HTTP CMD: nada é bloqueado em «registrar» (200 e o handler executa) para TODOS os perfis', async () => {
  const ac = montarCenario();
  const s = await subirServidor(ac);
  try {
    const perfis = {
      primario: cred('pc-1'), secundario: cred('pc-2'), mobile: cred('mobile-1'),
      pendente: cred('pend-1'), revogado: cred('rev-1'), desconhecido: cred('ninguem'),
      segredoErrado: cred('pc-1', 'errado'), semCredencial: {},
    };
    let n = 0;
    for (const [nome, cab] of Object.entries(perfis)) {
      for (const cmd of COMANDOS) {
        const r = await s.chamar('POST', `/api/comando/${cmd}`, cab);
        assert.equal(r.status, 200, `${nome} ${cmd}`);
        n += 1;
      }
    }
    assert.equal(s.executados.length, n, 'todos os handlers executaram');
  } finally { await s.fechar(); }
});

test('HTTP CMD: o evento observado traz a decisão do bastão de cada perfil', async () => {
  const ac = montarCenario();
  const s = await subirServidor(ac);
  try {
    const esperado = {
      'pc-1': { motivo: 'ok', permitido: true },
      'pc-2': { motivo: 'somente-leitura', permitido: false, donoAtual: 'PC1' },
      'mobile-1': { motivo: 'isento', permitido: true },
      'pend-1': { motivo: 'nao-autorizado', permitido: false },
      'rev-1': { motivo: 'nao-autorizado', permitido: false },
      ninguem: { motivo: 'nao-autorizado', permitido: false },
    };
    for (const id of Object.keys(esperado)) await s.chamar('POST', '/api/comando/audio_play', cred(id));
    const resumo = s.auth.resumoPolitica().filter((x) => x.id === 'S-013');
    for (const [id, esp] of Object.entries(esperado)) {
      const linha = resumo.find((x) => x.deviceId === `${id.slice(0, 8)}…`);
      assert.ok(linha && linha.bastao, `resumo de ${id}`);
      assert.equal(linha.bastao.motivo, esp.motivo, id);
      assert.equal(linha.bastao.permitido, esp.permitido, id);
      if (esp.donoAtual) assert.equal(linha.bastao.donoAtual, esp.donoAtual);
    }
    const ev = s.eventos.find((e) => e.bastao && e.bastao.motivo === 'somente-leitura');
    assert.ok(ev, 'o secundário gerou evento');
    assert.equal(ev.contexto, 'servidor-5510');
    assert.equal(ev.bastao.recusariaEmImpor, true);
    // O primário e o mobile (permitidos) não geram evento do bastão
    assert.equal(s.eventos.some((e) => e.bastao && e.bastao.permitido === true), false);
  } finally { await s.fechar(); }
});

test('HTTP CMD: dois sockets do mesmo deviceId → ambiguidade registrada, sem decisão afirmada', async () => {
  const ac = novoAcesso();
  ac.autenticar({ deviceId: 'pc-1', secret: SEGREDO });
  ac.registrarControlador('S1', { deviceId: 'pc-1', nome: 'PC1' });
  ac.registrarControlador('S1b', { deviceId: 'pc-1', nome: 'PC1-janela2' });
  const s = await subirServidor(ac);
  try {
    const r = await s.chamar('POST', '/api/comando/exibir_contagem', cred('pc-1'));
    assert.equal(r.status, 200);
    const ev = s.eventos.find((e) => e.bastao);
    assert.ok(ev);
    assert.deepEqual({ a: ev.bastao.ambigua, p: ev.bastao.permitido, m: ev.bastao.motivo, r: ev.bastao.recusariaEmImpor }, { a: true, p: null, m: 'ambiguo', r: null });
  } finally { await s.fechar(); }
});

test('HTTP: rotas ESC (display-config, preview, display-routing) NÃO consultam o bastão nesta fase', async () => {
  const ac = montarCenario();
  const s = await subirServidor(ac);
  try {
    for (const p of ['/api/display-config', '/api/display-config/preview', '/api/display-routing']) {
      const r = await s.chamar('PUT', p, cred('pc-2')); // secundário
      assert.equal(r.status, 200);
    }
    assert.equal(s.eventos.some((e) => e.bastao !== undefined), false);
    assert.equal(s.auth.resumoPolitica().some((x) => x.bastao !== undefined), false);
  } finally { await s.fechar(); }
});

test('HTTP: a observação não altera o estado de acesso (allowlist, primário e inscrições)', async () => {
  const ac = montarCenario();
  const antesLista = JSON.stringify(ac.listarDispositivos());
  const s = await subirServidor(ac);
  try {
    for (const id of ['pc-1', 'pc-2', 'mobile-1', 'pend-1', 'rev-1', 'ninguem']) {
      for (const cmd of COMANDOS) await s.chamar('POST', `/api/comando/${cmd}`, cred(id));
    }
    assert.equal(JSON.stringify(ac.listarDispositivos()), antesLista);
    assert.equal(ac.getPrimarioSocketId(), 'S1');
    assert.equal(ac.getModo(), 'locked');
  } finally { await s.fechar(); }
});

test('HTTP: nenhum segredo nos eventos, no resumo nem nas respostas', async () => {
  const ac = montarCenario();
  const s = await subirServidor(ac);
  try {
    const respostas = [];
    for (const id of ['pc-1', 'pc-2', 'ninguem']) respostas.push((await s.chamar('POST', '/api/comando/audio_play', cred(id))).corpo);
    const tudo = JSON.stringify(s.eventos) + JSON.stringify(s.auth.resumoPolitica()) + JSON.stringify(s.auth.resumo()) + respostas.join('');
    assert.equal(tudo.includes(SEGREDO), false);
  } finally { await s.fechar(); }
});

test('HTTP: gancho que falha não derruba nem muda a resposta', async () => {
  const ac = montarCenario();
  const ruim = { avaliarEscrita: () => { throw new Error('boom'); } };
  const eventos = [];
  const auth = autenticacaoHttp.criarAutenticacaoHttp({
    modo: 'registrar', contexto: 'servidor-5510', verificar: (a) => ac.verificarCredencial(a),
    registrarDecisao: (e) => eventos.push(e), avaliarBastao: (a) => ruim.avaliarEscrita(a),
  });
  const app = express();
  app.use(auth.middleware);
  app.post('/api/comando/audio_play', (_q, r) => r.json({ ok: true }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const st = await new Promise((resolve) => {
      const rq = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/comando/audio_play', method: 'POST', headers: cred('pc-2') }, (rs) => { rs.resume(); rs.on('end', () => resolve(rs.statusCode)); });
      rq.end();
    });
    assert.equal(st, 200);
    assert.equal(eventos[0].bastao.erro, 'falha-no-gancho');
  } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
});

/* ───────────────────────── 3. fiação ───────────────────────── */

test('fiação: o Servidor injeta avaliarBastao sobre avaliarEscrita e continua em «registrar»', () => {
  assert.match(FONTE, /avaliarBastao:\s*\(a\)\s*=>\s*sessaoControladorCore\.resolverBastao\(\{\s*acesso:\s*ctx\.acesso/);
  assert.match(FONTE, /modo:\s*'registrar'/);
  assert.doesNotMatch(FONTE, /modo:\s*'impor'/);
});

test('fiação: os handlers HTTP não consultam o bastão (a decisão é só observada pelo middleware)', () => {
  const ini = FONTE.indexOf("expressApp.post('/api/comando/exibir_apresentacao'");
  const fim = FONTE.indexOf("expressApp.get('/api/monitores'");
  assert.ok(ini > 0 && fim > ini);
  const handlers = FONTE.slice(ini, fim);
  assert.doesNotMatch(handlers, /avaliarEscrita|avaliarBastao|podeEscrever|comandoAutorizado/);
});

test('fiação: o motor local (projecaoLocal) e o controlador 3001 NÃO usam o bastão', () => {
  for (const arq of ['../../controller/src/projecaoLocal.js', '../../controller/src/httpControllerServer.js']) {
    const txt = fs.readFileSync(path.join(__dirname, arq), 'utf8');
    assert.doesNotMatch(txt, /avaliarEscrita|avaliarBastao/, arq);
  }
});
