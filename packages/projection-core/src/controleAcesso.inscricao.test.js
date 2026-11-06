'use strict';

/**
 * Entrega 2 — janela EXPLÍCITA de inscrição (substitui a autorização automática permanente do
 * TOFU) e revogação PERSISTENTE (revogado não volta como «novo»).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarControleAcesso } = require('./controleAcesso');

function novo({ modo = null, opcoes = {}, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-insc-')), relogio = { t: 1_000_000 }, comRevogados = true } = {}) {
  const allowlistPath = () => path.join(dir, 'allow.json');
  const revogadosPath = () => path.join(dir, 'revogados.json');
  if (modo && !fs.existsSync(allowlistPath())) fs.writeFileSync(allowlistPath(), JSON.stringify({ modo, devices: {} }));
  const notificados = [];
  const ac = criarControleAcesso({
    allowlistPath, ...(comRevogados ? { revogadosPath } : {}), emitParaSocket: () => {}, broadcast: () => {},
    notificar: (evt, d) => notificados.push([evt, d]), agora: () => relogio.t, opcoes,
  });
  return { ac, dir, allowlistPath, revogadosPath, notificados, relogio, outra: () => novo({ dir, relogio, opcoes, comRevogados }) };
}
const auth = (id, secret = 's') => ({ deviceId: id, secret, nome: `PC ${id}` });
const evts = (n) => n.map(([e]) => e);

test('janela FECHADA (padrão): dispositivo desconhecido NÃO é autorizado — fica pendente até o operador aprovar', () => {
  const { ac, notificados, allowlistPath } = novo();
  assert.equal(ac.getModo(), 'tofu');
  assert.deepEqual(ac.getJanelaInscricao(), { aberta: false, expiraEm: null });
  const r = ac.autenticar(auth('d1'));
  assert.deepEqual({ ok: r.ok, p: r.pendente, m: r.motivo }, { ok: false, p: true, m: 'nao-aprovado' });
  assert.ok(evts(notificados).includes('dispositivo_pendente'));
  assert.equal(JSON.parse(fs.readFileSync(allowlistPath(), 'utf8')).devices.d1.pendente, true);
  assert.equal(ac.aprovarDispositivo('d1'), true);
  assert.equal(ac.autenticar(auth('d1')).ok, true);
});

test('janela ABERTA: inscreve e autoriza; depois de fechada, o próximo desconhecido volta a ficar pendente', () => {
  const { ac, notificados } = novo();
  const j = ac.abrirJanelaInscricao();
  assert.equal(j.aberta, true);
  assert.equal(ac.getJanelaInscricao().aberta, true);
  assert.equal(ac.autenticar(auth('d1')).ok, true);
  assert.ok(evts(notificados).includes('dispositivo_autoinscrito'));
  assert.ok(evts(notificados).includes('janela_inscricao_aberta'));
  assert.equal(ac.fecharJanelaInscricao(), true);
  assert.ok(evts(notificados).includes('janela_inscricao_fechada'));
  assert.equal(ac.autenticar(auth('d1')).ok, true, 'quem já entrou continua autorizado');
  const r = ac.autenticar(auth('d2'));
  assert.deepEqual({ ok: r.ok, p: r.pendente }, { ok: false, p: true });
});

test('janela EXPIRA sozinha (padrão 5 min) e a duração tem teto', () => {
  const m = novo();
  const j = m.ac.abrirJanelaInscricao();
  assert.equal(j.expiraEm, 1_000_000 + 300_000);
  m.relogio.t += 299_000;
  assert.equal(m.ac.autenticar(auth('d1')).ok, true);
  m.relogio.t += 2_000;
  assert.equal(m.ac.getJanelaInscricao().aberta, false);
  assert.equal(m.ac.autenticar(auth('d2')).pendente, true);
  assert.equal(m.ac.abrirJanelaInscricao({ duracaoMs: 99 * 3_600_000 }).expiraEm, m.relogio.t + 30 * 60_000, 'teto de 30 min');
  assert.equal(m.ac.abrirJanelaInscricao({ duracaoMs: -5 }).expiraEm, m.relogio.t + 300_000, 'valor inválido usa o padrão');
});

test('a janela vive só em memória: reiniciar o processo a FECHA', () => {
  const m = novo();
  m.ac.abrirJanelaInscricao();
  assert.equal(m.outra().ac.getJanelaInscricao().aberta, false);
});

test('modo «locked» (travado) NÃO aceita janela: continua exigindo aprovação manual', () => {
  const { ac } = novo({ modo: 'locked' });
  const j = ac.abrirJanelaInscricao();
  assert.deepEqual({ a: j.aberta, m: j.motivo }, { a: false, m: 'travada' });
  assert.equal(ac.autenticar(auth('d1')).pendente, true);
  ac.destravar();
  assert.equal(ac.getModo(), 'tofu');
  assert.equal(ac.abrirJanelaInscricao().aberta, true);
});

test('modo «aberto» (só testes) continua autorizando qualquer um, com ou sem janela', () => {
  const { ac } = novo({ modo: 'aberto' });
  assert.equal(ac.autenticar({}).ok, true);
  assert.equal(ac.autenticar(auth('x')).ok, true);
});

test('NEGAR um pendente: some da lista e continua sem autorização (não vira autorizado nem revogado)', () => {
  const { ac, notificados } = novo();
  ac.autenticar(auth('d1'));
  assert.equal(ac.listarPendentes().map((p) => p.deviceId).join(), 'd1');
  assert.equal(ac.negarDispositivo('d1'), true);
  assert.equal(ac.listarPendentes().length, 0);
  assert.ok(evts(notificados).includes('dispositivo_negado'));
  assert.equal(ac.negarDispositivo('d1'), false);
  assert.equal(ac.autenticar(auth('d1')).ok, false);
  assert.equal(ac.verificarCredencial({ deviceId: 'd1', secret: 's' }).classe, 'pendente');
  // não aprovado → nunca vira revogado
  assert.equal(ac.listarRevogados().length, 0);
});

test('APROVAR não funciona sem pendente; negar um já autorizado não o remove', () => {
  const { ac } = novo();
  assert.equal(ac.aprovarDispositivo('fantasma'), false);
  ac.abrirJanelaInscricao();
  ac.autenticar(auth('d1'));
  assert.equal(ac.negarDispositivo('d1'), false, 'só se nega pendente');
  assert.equal(ac.autenticar(auth('d1')).ok, true);
});

test('limite de pendentes: acima do teto nenhum registro novo é criado (a allowlist não cresce sem controle)', () => {
  const { ac, allowlistPath } = novo({ opcoes: { maxPendentes: 3 } });
  for (const id of ['a', 'b', 'c']) assert.equal(ac.autenticar(auth(id)).pendente, true);
  const r = ac.autenticar(auth('d'));
  assert.deepEqual({ ok: r.ok, m: r.motivo }, { ok: false, m: 'limite-pendentes' });
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(allowlistPath(), 'utf8')).devices).length, 3);
  assert.equal(ac.autenticar(auth('a')).pendente, true, 'quem já está pendente continua sendo reconhecido');
  ac.negarDispositivo('a');
  assert.equal(ac.autenticar(auth('d')).pendente, true, 'abriu vaga');
});

test('REVOGADO persiste: nova instância (reinício) ainda o reconhece como revogado, nunca como desconhecido', () => {
  const m = novo();
  m.ac.abrirJanelaInscricao();
  m.ac.autenticar(auth('d1'));
  assert.equal(m.ac.revogarDispositivo('d1'), true);
  const ac2 = m.outra().ac;
  assert.equal(ac2.verificarCredencial({ deviceId: 'd1', secret: 's' }).classe, 'revogado');
  assert.equal(ac2.listarRevogados().map((r) => r.deviceId).join(), 'd1');
  assert.equal(JSON.parse(fs.readFileSync(m.revogadosPath(), 'utf8')).versao, 1);
});

test('REVOGADO não é re-inscrito nem com a janela aberta nem no modo travado; fica registrado e sem entrada na allowlist', () => {
  const m = novo();
  m.ac.abrirJanelaInscricao();
  m.ac.autenticar(auth('d1'));
  m.ac.revogarDispositivo('d1');
  const ac2 = m.outra().ac;
  ac2.abrirJanelaInscricao();
  const r = ac2.autenticar(auth('d1'));
  assert.deepEqual({ ok: r.ok, m: r.motivo, p: r.pendente }, { ok: false, m: 'revogado', p: undefined });
  assert.equal(JSON.parse(fs.readFileSync(m.allowlistPath(), 'utf8')).devices.d1, undefined, 'não ganhou entrada nova');
  ac2.travar();
  assert.equal(ac2.autenticar(auth('d1')).motivo, 'revogado');
  assert.equal(ac2.aprovarDispositivo('d1'), false, 'aprovar não ressuscita um revogado');
});

test('READMITIR (decisão explícita do operador) tira da lista de revogados; só então o fluxo normal vale', () => {
  const m = novo();
  m.ac.abrirJanelaInscricao();
  m.ac.autenticar(auth('d1'));
  m.ac.revogarDispositivo('d1');
  assert.equal(m.ac.autenticar(auth('d1')).motivo, 'revogado');
  assert.equal(m.ac.readmitirDispositivo('d1'), true);
  assert.equal(m.ac.readmitirDispositivo('d1'), false);
  assert.equal(m.ac.listarRevogados().length, 0);
  assert.equal(m.outra().ac.listarRevogados().length, 0, 'persistiu');
  m.ac.fecharJanelaInscricao();
  assert.equal(m.ac.autenticar(auth('d1')).pendente, true, 'volta como desconhecido, sujeito à aprovação');
});

test('arquivo de revogados ausente, corrompido ou sem caminho: começa vazio sem lançar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-rev-'));
  fs.writeFileSync(path.join(dir, 'revogados.json'), '{não é json');
  const a = novo({ dir }).ac;
  assert.equal(a.listarRevogados().length, 0);
  const sem = novo({ comRevogados: false }).ac;
  sem.abrirJanelaInscricao();
  sem.autenticar(auth('d1'));
  assert.equal(sem.revogarDispositivo('d1'), true, 'sem caminho: revoga em memória, como antes');
  assert.equal(sem.verificarCredencial({ deviceId: 'd1', secret: 's' }).classe, 'revogado');
});

test('escrita dos revogados é atômica (sem .tmp sobrando) e a allowlist mantém o MESMO formato', () => {
  const m = novo();
  m.ac.abrirJanelaInscricao();
  m.ac.autenticar(auth('d1'));
  m.ac.revogarDispositivo('d1');
  assert.equal(fs.existsSync(`${m.revogadosPath()}.tmp`), false);
  const al = JSON.parse(fs.readFileSync(m.allowlistPath(), 'utf8'));
  assert.deepEqual(Object.keys(al).sort(), ['devices', 'modo']);
});

test('verificarCredencial continua PURA: não inscreve, não grava, não notifica (nem com a janela aberta)', () => {
  const m = novo();
  m.ac.abrirJanelaInscricao();
  const antes = m.notificados.length;
  const r = m.ac.verificarCredencial({ deviceId: 'novo', secret: 's' });
  assert.equal(r.classe, 'desconhecido');
  assert.equal(m.notificados.length, antes);
  assert.equal(fs.existsSync(m.allowlistPath()), false);
});

test('opção legada inscricaoAutomatica: o comportamento antigo do TOFU continua disponível (e só se pedido)', () => {
  const { ac } = novo({ opcoes: { inscricaoAutomatica: true } });
  assert.equal(ac.autenticar(auth('d1')).ok, true);
  assert.equal(novo().ac.autenticar(auth('d1')).ok, false, 'sem a opção, não');
});

test('o evento de revogado tentando voltar é registrado, mas só uma vez por dispositivo (sem inundar o log)', () => {
  const m = novo();
  m.ac.abrirJanelaInscricao();
  m.ac.autenticar(auth('d1'));
  m.ac.revogarDispositivo('d1');
  for (let i = 0; i < 5; i += 1) m.ac.autenticar(auth('d1'));
  assert.equal(evts(m.notificados).filter((e) => e === 'dispositivo_revogado_tentou_voltar').length, 1);
});
