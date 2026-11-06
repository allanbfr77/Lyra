'use strict';

/**
 * E1.3 C2 — `avaliarEscrita`: fonte ÚNICA do direito de escrita (porta 1 «autorizado» + porta 2
 * «bastão»), usada pelo Socket.IO (por `socketId`) e pela observação HTTP (por `deviceId`).
 *
 * Três blocos:
 *   1. via socket: EQUIVALENTE ao `comandoAutorizado` anterior, em uma matriz exaustiva de estados;
 *   2. via dispositivo (HTTP): o que é certo e o que é AMBÍGUO (dois sockets do mesmo deviceId);
 *   3. a função é pura: não altera a allowlist, não registra, não notifica.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { criarControleAcesso } = require('./controleAcesso');

function novo(modo = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-escrita-'));
  const allowlistPath = () => path.join(dir, 'allow.json');
  if (modo) fs.writeFileSync(allowlistPath(), JSON.stringify({ modo, devices: {} }));
  const notificados = [];
  const ac = criarControleAcesso({ opcoes: { inscricaoAutomatica: true },
    allowlistPath,
    emitParaSocket: () => {},
    broadcast: () => {},
    notificar: (evt) => notificados.push(evt),
  });
  return { ac, dir, allowlistPath, notificados };
}

/** Réplica CONGELADA da regra de escrita do Socket.IO antes da C2 (`comandoAutorizado` em httpServer.js). */
function regraAnterior(ac, socketId, autorizadoDoSocket) {
  if (autorizadoDoSocket !== true) return { permitido: false, erro: 'nao-autorizado', donoAtual: null };
  if (ac.estaRegistrado(socketId) && !ac.podeEscrever(socketId)) {
    return { permitido: false, erro: 'somente-leitura', donoAtual: ac.papelDe(socketId).donoAtual };
  }
  return { permitido: true };
}

/* ───────────────────────── 1. via socket: equivalência com o comportamento anterior ───────────────────────── */

test('via socket: equivale à regra anterior em toda a matriz (modo × registro × primário × autorizado)', () => {
  for (const modo of ['tofu', 'locked', 'aberto']) {
    const { ac } = novo(modo);
    // A (primário), B (secundário, deviceId distinto), C (secundário, MESMO deviceId de A); U não registrado
    ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
    ac.registrarControlador('B', { deviceId: 'dev-2', nome: 'PC2' });
    ac.registrarControlador('C', { deviceId: 'dev-1', nome: 'PC1-b' });
    for (const socketId of ['A', 'B', 'C', 'U']) {
      for (const autorizado of [true, false, undefined, null, 'true', 1]) {
        const antes = regraAnterior(ac, socketId, autorizado);
        const agora = ac.avaliarEscrita({ socketId, autorizado });
        const rotulo = `${modo} socket=${socketId} autorizado=${String(autorizado)}`;
        assert.equal(agora.permitido, antes.permitido, `permitido: ${rotulo}`);
        if (!antes.permitido) {
          assert.equal(agora.motivo, antes.erro, `motivo: ${rotulo}`);
          assert.equal(agora.donoAtual, antes.donoAtual, `donoAtual: ${rotulo}`);
        } else {
          assert.ok(['ok', 'isento'].includes(agora.motivo), `motivo de permissão: ${rotulo}`);
        }
        assert.equal(agora.ambigua, false, 'a via socket nunca é ambígua');
        assert.equal(agora.via, 'socket');
      }
    }
  }
});

test('via socket: sem nenhum controlador primário (ninguém registrado) o socket autorizado é isento', () => {
  const { ac } = novo();
  assert.equal(ac.getPrimarioSocketId(), null);
  const r = ac.avaliarEscrita({ socketId: 'X', autorizado: true });
  assert.deepEqual({ p: r.permitido, m: r.motivo }, { p: true, m: 'isento' });
});

test('via socket: primário → ok; secundário → somente-leitura com o dono; depois de forçar, inverte', () => {
  const { ac } = novo();
  ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
  ac.registrarControlador('B', { deviceId: 'dev-2', nome: 'PC2' });
  assert.deepEqual(ac.avaliarEscrita({ socketId: 'A', autorizado: true }), { permitido: true, motivo: 'ok', donoAtual: 'PC1', ambigua: false, via: 'socket' });
  const b = ac.avaliarEscrita({ socketId: 'B', autorizado: true });
  assert.equal(b.permitido, false);
  assert.equal(b.motivo, 'somente-leitura');
  assert.equal(b.donoAtual, 'PC1');
  ac.forcarAssumir('B');
  assert.equal(ac.avaliarEscrita({ socketId: 'B', autorizado: true }).permitido, true);
  assert.equal(ac.avaliarEscrita({ socketId: 'A', autorizado: true }).motivo, 'somente-leitura');
});

test('via socket: não autorizado vence o bastão (mesmo sendo o primário)', () => {
  const { ac } = novo();
  ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
  const r = ac.avaliarEscrita({ socketId: 'A', autorizado: false });
  assert.deepEqual({ p: r.permitido, m: r.motivo, d: r.donoAtual }, { p: false, m: 'nao-autorizado', d: null });
});

/* ───────────────────────── 2. via dispositivo (HTTP) ───────────────────────── */

const SEGREDO = 'segredo-de-teste';
function autorizadoPorCredencial(ac, deviceId, secret = SEGREDO) {
  return ac.verificarCredencial({ deviceId, secret }).ok === true;
}

test('via dispositivo: único socket do dispositivo — primário ok, secundário somente-leitura (certeza exata)', () => {
  const { ac } = novo();
  ac.autenticar({ deviceId: 'dev-1', secret: SEGREDO });
  ac.autenticar({ deviceId: 'dev-2', secret: SEGREDO });
  ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
  ac.registrarControlador('B', { deviceId: 'dev-2', nome: 'PC2' });
  const p = ac.avaliarEscrita({ deviceId: 'dev-1', autorizado: autorizadoPorCredencial(ac, 'dev-1') });
  assert.deepEqual({ p: p.permitido, m: p.motivo, a: p.ambigua, v: p.via }, { p: true, m: 'ok', a: false, v: 'dispositivo' });
  const s = ac.avaliarEscrita({ deviceId: 'dev-2', autorizado: autorizadoPorCredencial(ac, 'dev-2') });
  assert.deepEqual({ p: s.permitido, m: s.motivo, d: s.donoAtual, a: s.ambigua }, { p: false, m: 'somente-leitura', d: 'PC1', a: false });
});

test('via dispositivo: autorizado SEM controlador registrado (mobile) é isento — mesma isenção do socket', () => {
  const { ac } = novo();
  ac.autenticar({ deviceId: 'dev-1', secret: SEGREDO });
  ac.autenticar({ deviceId: 'mobile-1', secret: SEGREDO });
  ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
  const r = ac.avaliarEscrita({ deviceId: 'mobile-1', autorizado: autorizadoPorCredencial(ac, 'mobile-1') });
  assert.deepEqual({ p: r.permitido, m: r.motivo, a: r.ambigua }, { p: true, m: 'isento', a: false });
});

test('via dispositivo: sem nenhum controlador registrado, o dispositivo autorizado é isento', () => {
  const { ac } = novo();
  ac.autenticar({ deviceId: 'dev-1', secret: SEGREDO });
  const r = ac.avaliarEscrita({ deviceId: 'dev-1', autorizado: autorizadoPorCredencial(ac, 'dev-1') });
  assert.deepEqual({ p: r.permitido, m: r.motivo }, { p: true, m: 'isento' });
});

test('via dispositivo: pendente, desconhecido e revogado → nao-autorizado, com ou sem socket registrado', () => {
  const { ac } = novo();
  ac.autenticar({ deviceId: 'dev-1', secret: SEGREDO }); // autorizado (TOFU)
  ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
  ac.autenticar({ deviceId: 'rev-1', secret: SEGREDO });
  ac.revogarDispositivo('rev-1');
  ac.travar();
  ac.autenticar({ deviceId: 'pend-1', secret: SEGREDO }); // fica pendente
  for (const id of ['pend-1', 'desconhecido-1', 'rev-1']) {
    const aut = autorizadoPorCredencial(ac, id);
    assert.equal(aut, false, `${id} não deveria estar autorizado`);
    const r = ac.avaliarEscrita({ deviceId: id, autorizado: aut });
    assert.deepEqual({ p: r.permitido, m: r.motivo, d: r.donoAtual }, { p: false, m: 'nao-autorizado', d: null }, id);
  }
  // segredo errado também não autoriza
  assert.equal(ac.avaliarEscrita({ deviceId: 'dev-1', autorizado: autorizadoPorCredencial(ac, 'dev-1', 'errado') }).motivo, 'nao-autorizado');
});

test('via dispositivo: DOIS sockets do mesmo deviceId, um deles primário → AMBÍGUO (não se afirma equivalência)', () => {
  const { ac } = novo();
  ac.autenticar({ deviceId: 'dev-1', secret: SEGREDO });
  ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
  ac.registrarControlador('C', { deviceId: 'dev-1', nome: 'PC1-janela2' });
  const r = ac.avaliarEscrita({ deviceId: 'dev-1', autorizado: true });
  assert.equal(r.ambigua, true);
  assert.equal(r.permitido, null, 'decisão incerta nunca vira true/false');
  assert.equal(r.motivo, 'ambiguo');
  assert.equal(r.via, 'dispositivo');
  assert.equal(r.candidatos, 2);
  // E o socket, que sabe quem é, continua exato:
  assert.equal(ac.avaliarEscrita({ socketId: 'A', autorizado: true }).permitido, true);
  assert.equal(ac.avaliarEscrita({ socketId: 'C', autorizado: true }).permitido, false);
});

test('via dispositivo: dois sockets do mesmo deviceId, NENHUM primário → somente-leitura é certo (todos são secundários)', () => {
  const { ac } = novo();
  ac.autenticar({ deviceId: 'dev-2', secret: SEGREDO });
  ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
  ac.registrarControlador('B', { deviceId: 'dev-2', nome: 'PC2' });
  ac.registrarControlador('D', { deviceId: 'dev-2', nome: 'PC2-b' });
  const r = ac.avaliarEscrita({ deviceId: 'dev-2', autorizado: true });
  assert.deepEqual({ p: r.permitido, m: r.motivo, a: r.ambigua, d: r.donoAtual }, { p: false, m: 'somente-leitura', a: false, d: 'PC1' });
});

test('via dispositivo: modo «aberto» permite escrever (como podeEscrever), mesmo registrado e secundário', () => {
  const { ac } = novo('aberto');
  ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
  ac.registrarControlador('B', { deviceId: 'dev-2', nome: 'PC2' });
  assert.equal(ac.avaliarEscrita({ deviceId: 'dev-2', autorizado: true }).permitido, true);
});

test('sem identidade (nem socketId nem deviceId): autorizado → identidade-ausente (incerto); não autorizado → nao-autorizado', () => {
  const { ac } = novo();
  const a = ac.avaliarEscrita({ autorizado: true });
  assert.deepEqual({ p: a.permitido, m: a.motivo }, { p: null, m: 'identidade-ausente' });
  assert.equal(ac.avaliarEscrita({ autorizado: false }).motivo, 'nao-autorizado');
  assert.equal(ac.avaliarEscrita().motivo, 'nao-autorizado'); // chamada sem argumentos: falha fechada
});

test('socketId tem precedência sobre deviceId quando os dois vêm', () => {
  const { ac } = novo();
  ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
  ac.registrarControlador('B', { deviceId: 'dev-2', nome: 'PC2' });
  const r = ac.avaliarEscrita({ socketId: 'B', deviceId: 'dev-1', autorizado: true });
  assert.equal(r.via, 'socket');
  assert.equal(r.permitido, false);
});

/* ───────────────────────── 3. pureza ───────────────────────── */

test('é PURA: não altera a allowlist, não registra dispositivo, não notifica e não muda o primário', () => {
  const { ac, allowlistPath, notificados } = novo('locked');
  ac.registrarControlador('A', { deviceId: 'dev-1', nome: 'PC1' });
  const antesNotif = notificados.length;
  const antesArquivo = fs.existsSync(allowlistPath()) ? fs.readFileSync(allowlistPath(), 'utf8') : null;
  const antesLista = JSON.stringify(ac.listarDispositivos());
  for (const args of [
    { socketId: 'A', autorizado: true }, { socketId: 'Z', autorizado: false },
    { deviceId: 'novo-dispositivo', autorizado: false }, { deviceId: 'dev-1', autorizado: true }, {},
  ]) ac.avaliarEscrita(args);
  assert.equal(notificados.length, antesNotif, 'nenhuma notificação');
  assert.equal(fs.existsSync(allowlistPath()) ? fs.readFileSync(allowlistPath(), 'utf8') : null, antesArquivo, 'allowlist intacta');
  assert.equal(JSON.stringify(ac.listarDispositivos()), antesLista, 'nenhum dispositivo inscrito');
  assert.equal(ac.getPrimarioSocketId(), 'A');
  assert.equal(ac.getModo(), 'locked');
});
