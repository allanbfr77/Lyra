'use strict';

/**
 * Entrega 1 — pareamento do elo: acordo de chave X25519 + código de confirmação (SAS) + aprovação do
 * operador. Nenhuma chave trafega: só chaves PÚBLICAS e um MAC de confirmação.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarArmazemChaves } = require('./eloChaves');
const P = require('./eloPareamento');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-par-')), 'elo.json');
const parar = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function montar({ agoraRef = { t: 1_000_000 }, opcoesServico = {} } = {}) {
  const armSrv = criarArmazemChaves({ caminho: tmp(), agora: () => agoraRef.t });
  const armCtl = criarArmazemChaves({ caminho: tmp(), agora: () => agoraRef.t });
  const pedidos = [];
  const servico = P.criarServicoPareamentoServidor({
    armazem: armSrv, agora: () => agoraRef.t, aoSolicitar: (p) => pedidos.push(p), ...opcoesServico,
  });
  const trafego = [];
  const transporte = {
    solicitar: async (corpo) => { const r = servico.solicitar({ ...corpo, ip: '192.168.0.20' }); trafego.push([corpo, r]); return r; },
    consultar: async (id) => { const r = servico.consultar(id); trafego.push([id, r]); return r; },
    cancelar: async (id, token) => servico.cancelar(id, token),
  };
  const cliente = (extra = {}) => P.criarClientePareamento({
    armazem: armCtl, idControlador: armCtl.idLocal(), nome: 'PC do Louvor', base: 'http://192.168.0.5:5510',
    transporte, dormir: parar, intervaloMs: 1, timeoutMs: 2000, agora: () => agoraRef.t, ...extra,
  });
  return { armSrv, armCtl, servico, pedidos, transporte, cliente, trafego, agoraRef };
}

test('pareamento APROVADO: os dois lados derivam a MESMA chave; o código SAS é igual nos dois', async () => {
  const m = montar();
  const codigos = [];
  const c = m.cliente({ aoCodigo: (cod) => { codigos.push(cod); setTimeout(() => m.servico.aprovar(m.pedidos[0].pairingId), 5); } });
  const r = await c.parear();
  assert.equal(r.estado, 'aprovado');
  assert.match(codigos[0], /^\d{3}-\d{3}$/);
  assert.equal(m.pedidos[0].codigo, codigos[0], 'SAS idêntico no operador do Servidor e do Controlador');
  const kc = m.armCtl.obter(r.kid);
  const ks = m.armSrv.obter(r.kid);
  assert.ok(kc && ks && kc.chave.equals(ks.chave) && kc.chave.length === 32);
  assert.deepEqual({ p: kc.papel, o: kc.origem, d: kc.destino, b: kc.base }, { p: 'controlador', o: m.armCtl.idLocal(), d: m.armSrv.idLocal(), b: 'http://192.168.0.5:5510' });
  assert.deepEqual({ p: ks.papel, o: ks.origem, d: ks.destino }, { p: 'servidor', o: m.armCtl.idLocal(), d: m.armSrv.idLocal() });
});

test('nenhuma chave nem segredo trafega: só chaves públicas e o MAC de confirmação', async () => {
  const m = montar();
  const c = m.cliente({ aoCodigo: () => setTimeout(() => m.servico.aprovar(m.pedidos[0].pairingId), 5) });
  const r = await c.parear();
  const chave = m.armSrv.obter(r.kid).chave;
  const tudo = JSON.stringify(m.trafego);
  for (const forma of [chave.toString('base64'), chave.toString('hex'), chave.toString('base64url')]) assert.equal(tudo.includes(forma), false);
});

test('pareamento NEGADO pelo operador: nenhuma chave em nenhum lado', async () => {
  const m = montar();
  const c = m.cliente({ aoCodigo: () => setTimeout(() => m.servico.negar(m.pedidos[0].pairingId), 5) });
  const r = await c.parear();
  assert.equal(r.estado, 'negado');
  assert.equal(m.armCtl.listar().length, 0);
  assert.equal(m.armSrv.listar().length, 0);
});

test('pareamento CANCELADO pelo Controlador: estado cancelado, aprovar depois não gera chave', async () => {
  const m = montar();
  const c = m.cliente({ aoCodigo: () => setTimeout(() => c.cancelar(), 5) });
  const r = await c.parear();
  assert.equal(r.estado, 'cancelado');
  assert.equal(m.servico.aprovar(m.pedidos[0].pairingId), false, 'não aprova o que já foi cancelado');
  assert.equal(m.armSrv.listar().length, 0);
});

test('cancelar exige o token de cancelamento (outro cliente não cancela)', () => {
  const m = montar();
  const s = m.servico.solicitar({ idControlador: 'ctl-1234567890abcd', nome: 'x', ip: '10.0.0.1', publica: P.gerarParDeChaves().publica });
  assert.equal(m.servico.cancelar(s.pairingId, 'token-errado'), false);
  assert.equal(m.servico.consultar(s.pairingId).estado, 'pendente');
  assert.equal(m.servico.cancelar(s.pairingId, s.tokenCancelamento), true);
  assert.equal(m.servico.consultar(s.pairingId).estado, 'cancelado');
});

test('pedido EXPIRA sem aprovação; aprovar depois de expirado falha', async () => {
  const m = montar({ opcoesServico: { ttlMs: 50 } });
  const c = m.cliente({ timeoutMs: 1000, aoCodigo: () => { m.agoraRef.t += 100; } });
  const r = await c.parear();
  assert.equal(r.estado, 'expirado');
  assert.equal(m.servico.aprovar(m.pedidos[0].pairingId), false);
  assert.equal(m.armSrv.listar().length, 0);
});

test('MITM ativo: se o atacante troca a chave pública, o SAS difere e a confirmação não confere → sem chave', async () => {
  const m = montar();
  const atacante = P.gerarParDeChaves();
  const transporteMitm = {
    ...m.transporte,
    solicitar: async (corpo) => ({ ...(await m.transporte.solicitar(corpo)), publicaServidor: atacante.publica }),
  };
  const codigos = [];
  const c = m.cliente({ transporte: transporteMitm, aoCodigo: (cod) => { codigos.push(cod); setTimeout(() => m.servico.aprovar(m.pedidos[0].pairingId), 5); } });
  const r = await c.parear();
  assert.notEqual(codigos[0], m.pedidos[0].codigo, 'os dois operadores veriam códigos diferentes');
  assert.equal(r.estado, 'confirmacao-invalida');
  assert.equal(m.armCtl.listar().length, 0, 'o Controlador não guarda chave nenhuma');
});

test('solicitação inválida, rápida demais e acima do limite de pendentes são recusadas', () => {
  const m = montar({ opcoesServico: { maxPendentes: 2, cooldownPorIpMs: 1000 } });
  const ok = (ip) => m.servico.solicitar({ idControlador: `ctl-${ip.replace(/\D/g, '')}-1234567890`, nome: 'n', ip, publica: P.gerarParDeChaves().publica });
  assert.equal(m.servico.solicitar({ idControlador: 'x', nome: 'n', ip: '1.1.1.1', publica: 'lixo' }).ok, false);
  assert.equal(m.servico.solicitar({ idControlador: 'ctl-1234567890abcd', nome: 'n', ip: '1.1.1.1', publica: 'AAAA' }).motivo, 'invalido');
  assert.equal(ok('10.0.0.1').ok, true);
  assert.equal(ok('10.0.0.1').motivo, 'muito-rapido', 'mesmo IP em seguida');
  assert.equal(ok('10.0.0.2').ok, true);
  assert.equal(ok('10.0.0.3').motivo, 'ocupado', 'limite de pendentes');
});

test('o nome exibido ao operador é sanitizado e truncado; o pedido traz IP e código', () => {
  const m = montar();
  m.servico.solicitar({ idControlador: 'ctl-1234567890abcd', nome: `  Fulano\u0000\n${'x'.repeat(200)}`, ip: '10.1.1.1', publica: P.gerarParDeChaves().publica });
  const p = m.pedidos[0];
  // eslint-disable-next-line no-control-regex
  assert.ok(p.nome.length <= 60 && !/[\u0000-\u001f]/.test(p.nome));
  assert.equal(p.ip, '10.1.1.1');
  assert.match(p.codigo, /^\d{3}-\d{3}$/);
  assert.equal(JSON.stringify(m.servico.listarPendentes()).includes('tokenCancelamento'), false);
});

test('consultar id desconhecido; aprovar/negar duas vezes; falha na UI não impede o pedido', () => {
  const m = montar({ opcoesServico: { aoSolicitar: () => { throw new Error('ui quebrou'); } } });
  assert.equal(m.servico.consultar('nao-existe').estado, 'desconhecido');
  const s = m.servico.solicitar({ idControlador: 'ctl-1234567890abcd', nome: 'n', ip: '10.0.0.1', publica: P.gerarParDeChaves().publica });
  assert.equal(s.ok, true);
  assert.equal(m.servico.aprovar(s.pairingId), true);
  assert.equal(m.servico.aprovar(s.pairingId), false);
  assert.equal(m.servico.negar(s.pairingId), false);
  assert.equal(m.armSrv.listar().length, 1);
});

test('rotação e revogação pelo armazém: a chave nova assina, a antiga cai depois da graça', async () => {
  const m = montar();
  const c = m.cliente({ aoCodigo: () => setTimeout(() => m.servico.aprovar(m.pedidos[0].pairingId), 5) });
  const r = await c.parear();
  assert.equal(m.armSrv.rotacionar(r.kid, { kid: 'nova-1', chave: Buffer.alloc(32, 7) }, { gracaMs: 10 }), true);
  assert.equal(m.armSrv.revogar('nova-1'), true);
  assert.equal(m.armSrv.obter('nova-1').estado, 'revogada');
});

test('ROTAÇÃO por novo pareamento: a chave antiga vira «substituida» (graça) nos dois lados e a nova assume', async () => {
  const m = montar();
  const aprovar = () => setTimeout(() => m.servico.aprovar(m.pedidos[m.pedidos.length - 1].pairingId), 5);
  const r1 = await m.cliente({ aoCodigo: aprovar }).parear();
  m.agoraRef.t += 10_000; // fora do cooldown de IP
  const r2 = await m.cliente({ aoCodigo: aprovar }).parear();
  assert.equal(r2.estado, 'aprovado');
  assert.notEqual(r1.kid, r2.kid);
  for (const arm of [m.armSrv, m.armCtl]) {
    assert.equal(arm.obter(r1.kid).estado, 'substituida');
    assert.equal(arm.obter(r2.kid).estado, 'ativa');
    assert.ok(arm.obter(r1.kid).expiraEm > m.agoraRef.t, 'a antiga ainda vale pela graça');
  }
});
