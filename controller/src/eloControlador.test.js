'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { eloPareamento, elo: eloCore, politicaRotas } = require('@lyra/projection-core');
const { criarEloControlador, executarPareamentoInterativo } = require('./eloControlador');

const BASE = 'http://192.168.0.5:5510';
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-ctl-')), 'elo.json');
const dormir = (ms = 1) => new Promise((r) => setTimeout(r, ms));

/** Servidor em memória (mesmo serviço de produção) atrás de um transporte falso. */
function servidorFalso({ capacidades = { elo: 1, sessaoControlador: 1 } } = {}) {
  const srv = eloCore.criarElo({ papel: 'servidor', caminho: null, avaliarRota: politicaRotas.avaliarRota });
  const pedidos = [];
  const servico = eloPareamento.criarServicoPareamentoServidor({ armazem: srv.armazem, aoSolicitar: (p) => pedidos.push(p), cooldownPorIpMs: 0 });
  const chamadas = [];
  const transporte = {
    identidade: async () => { chamadas.push('identidade'); return capacidades ? { role: 'server', capacidades } : { role: 'server' }; },
    solicitar: async (c) => { chamadas.push('solicitar'); return servico.solicitar({ ...c, ip: '192.168.0.20' }); },
    consultar: async (id) => servico.consultar(id),
    cancelar: async (id, t) => servico.cancelar(id, t),
  };
  return { srv, servico, pedidos, transporte, chamadas };
}

function controlador(s, extra = {}) {
  return criarEloControlador({ caminho: tmp(), nomePc: 'PC do Louvor', obterBase: () => new URL(BASE), criarTransporte: () => s.transporte, ...extra });
}

test('sem pareamento: assinarParaServidor devolve null (nenhum cabeçalho novo é enviado)', () => {
  const c = controlador(servidorFalso());
  assert.equal(c.assinarParaServidor({ base: BASE, metodo: 'PUT', caminho: '/api/display-config', corpo: '{}' }), null);
});

test('Servidor ANTIGO (sem capacidades.elo): o pareamento nem é tentado e nada é alterado', async () => {
  for (const capacidades of [null, {}, { elo: 0 }]) {
    const s = servidorFalso({ capacidades });
    const c = controlador(s);
    const r = await c.parear();
    assert.equal(r.estado, 'sem-suporte');
    assert.equal(s.chamadas.includes('solicitar'), false, 'nenhum pedido foi enviado');
    assert.equal(c.chaves().length, 0);
  }
});

test('erro de rede ao consultar a identidade: estado erro, sem chave', async () => {
  const s = servidorFalso();
  s.transporte.identidade = async () => { throw new Error('ECONNREFUSED'); };
  const c = controlador(s);
  assert.equal((await c.parear()).estado, 'erro');
});

test('pareamento aprovado: o Controlador passa a assinar e o Servidor reconhece a assinatura', async () => {
  const s = servidorFalso();
  const c = controlador(s);
  const aprovar = () => setTimeout(() => s.servico.aprovar(s.pedidos[0].pairingId), 5);
  const r = await c.parear({ aoCodigo: aprovar });
  assert.equal(r.estado, 'aprovado');
  const via = c.assinarParaServidor({ base: `${BASE}/qualquer/coisa`, metodo: 'PUT', caminho: '/api/display-config', corpo: '{"a":1}' });
  assert.ok(via, 'a origem normalizada casa com a chave guardada');
  const v = s.srv.verificador.verificar({ valor: via, direcaoEsperada: 'c→s', metodo: 'PUT', caminho: '/api/display-config', corpo: '{"a":1}' });
  assert.equal(v.ok, true);
  assert.equal(c.assinarParaServidor({ base: 'http://10.9.9.9:5510', metodo: 'PUT', caminho: '/api/display-config', corpo: '{}' }), null, 'outro Servidor: sem chave, sem assinatura');
});

test('assinar nunca lança (base inválida devolve null)', () => {
  const c = controlador(servidorFalso());
  assert.equal(c.assinarParaServidor({ base: 'isto não é url', metodo: 'GET', caminho: '/x' }), null);
});

function dialogoFalso(respostas) {
  const chamadas = [];
  return {
    chamadas,
    showMessageBox: async (...a) => {
      const opcoes = a[a.length - 1];
      chamadas.push(opcoes);
      const r = respostas.shift();
      return typeof r === 'function' ? r(opcoes) : r || { response: 1 };
    },
  };
}

test('fluxo do operador: desistir na confirmação inicial não inicia nada', async () => {
  const s = servidorFalso();
  const c = controlador(s);
  const dialog = dialogoFalso([{ response: 0 }]);
  const r = await executarPareamentoInterativo({ eloControlador: c, dialog, janela: null, obterBase: () => new URL(BASE) });
  assert.equal(r.estado, 'abortado');
  assert.equal(s.chamadas.length, 0);
});

test('fluxo do operador: mostra o código (igual ao do Servidor), espera a aprovação e informa o resultado', async () => {
  const s = servidorFalso();
  const c = controlador(s);
  setTimeout(() => {}, 0);
  const dialog = dialogoFalso([{ response: 1 }, () => { setTimeout(() => s.servico.aprovar(s.pedidos[0].pairingId), 5); return { response: 1 }; }, { response: 0 }]);
  const r = await executarPareamentoInterativo({ eloControlador: c, dialog, janela: null, obterBase: () => new URL(BASE) });
  assert.equal(r.estado, 'aprovado');
  const codigoNoControlador = dialog.chamadas.map((o) => /Código: (\d{3}-\d{3})/.exec(o.message)).find(Boolean)[1];
  assert.equal(codigoNoControlador, s.pedidos[0].codigo, 'os dois operadores veem o mesmo código');
  assert.match(dialog.chamadas[dialog.chamadas.length - 1].message, /concluído/);
});

test('fluxo do operador: «Cancelar pareamento» no diálogo do código cancela de verdade', async () => {
  const s = servidorFalso();
  const c = controlador(s);
  const dialog = dialogoFalso([{ response: 1 }, { response: 0 }, { response: 0 }]);
  const r = await executarPareamentoInterativo({ eloControlador: c, dialog, janela: null, obterBase: () => new URL(BASE) });
  await dormir(20);
  assert.equal(r.estado, 'cancelado');
  assert.equal(s.servico.consultar(s.pedidos[0].pairingId).estado, 'cancelado');
  assert.equal(c.chaves().length, 0);
});

test('fluxo do operador: Servidor sem suporte mostra o aviso certo e nada é pedido', async () => {
  const s = servidorFalso({ capacidades: null });
  const c = controlador(s);
  const dialog = dialogoFalso([{ response: 1 }, { response: 0 }]);
  const r = await executarPareamentoInterativo({ eloControlador: c, dialog, janela: null, obterBase: () => new URL(BASE) });
  assert.equal(r.estado, 'sem-suporte');
  assert.match(dialog.chamadas[dialog.chamadas.length - 1].message, /ainda não suporta/);
});

/* ───────────────────────── verificação delegada de dispositivo ───────────────────────── */

test('delegada: sem pareamento devolve null e NÃO consulta o Servidor (comportamento de antes)', async () => {
  const s = servidorFalso();
  let consultas = 0;
  s.transporte.verificarDispositivo = async () => { consultas += 1; return { ok: true, classe: 'autorizado' }; };
  const c = controlador(s);
  assert.equal(c.verificarDelegado({ deviceId: 'dev-1', secret: 'seg' }), null);
  await dormir(10);
  assert.equal(consultas, 0);
  assert.equal(c.verificarDelegado({ deviceId: '', secret: '' }), null);
  assert.equal(c.verificarDelegado(undefined), null);
});

async function controladorPareado(s, extra = {}) {
  const c = controlador(s, extra);
  const r = await c.parear({ aoCodigo: () => setTimeout(() => s.servico.aprovar(s.pedidos[0].pairingId), 5) });
  assert.equal(r.estado, 'aprovado');
  return c;
}

test('delegada: o primeiro veredito é «não verificável» (null) e chega em segundo plano; depois vem do cache', async () => {
  const s = servidorFalso();
  const chamadas = [];
  s.transporte.verificarDispositivo = async (corpo, via) => {
    chamadas.push({ corpo, via });
    return corpo.secret === 'bom' ? { ok: true, classe: 'autorizado' } : { ok: false, classe: 'secret-invalido' };
  };
  const c = await controladorPareado(s);
  assert.equal(c.verificarDelegado({ deviceId: 'dev-1', secret: 'bom' }), null);
  await dormir(20);
  assert.deepEqual(c.verificarDelegado({ deviceId: 'dev-1', secret: 'bom' }), { ok: true, classe: 'autorizado' });
  assert.equal(chamadas.length, 1, 'o cache evita consultar de novo');
  assert.ok(chamadas[0].via.startsWith('v1;kid='), 'a pergunta vai assinada pelo elo');
  c.verificarDelegado({ deviceId: 'dev-1', secret: 'ruim' });
  await dormir(20);
  assert.deepEqual(c.verificarDelegado({ deviceId: 'dev-1', secret: 'ruim' }), { ok: false, classe: 'secret-invalido' });
});

test('delegada: a assinatura enviada é aceita pelo Servidor (mesmos bytes do corpo) e o cache expira', async () => {
  const s = servidorFalso();
  const r0 = { t: Date.now() };
  let ultimo = null;
  s.transporte.verificarDispositivo = async (corpo, via) => {
    ultimo = { corpo, via };
    const v = s.srv.verificador.verificar({ valor: via, direcaoEsperada: 'c→s', metodo: 'POST', caminho: '/api/elo/verificar-dispositivo', corpo: Buffer.from(JSON.stringify(corpo)) });
    return v.ok ? { ok: true, classe: 'autorizado' } : { ok: false, classe: `elo-${v.motivo}` };
  };
  const c = await controladorPareado(s, { agora: () => r0.t });
  c.verificarDelegado({ deviceId: 'dev-1', secret: 'x' });
  await dormir(20);
  assert.deepEqual(c.verificarDelegado({ deviceId: 'dev-1', secret: 'x' }), { ok: true, classe: 'autorizado' });
  r0.t += 40_000; // passou o TTL (30 s): devolve o antigo e reconsulta em segundo plano
  const antes = ultimo;
  assert.deepEqual(c.verificarDelegado({ deviceId: 'dev-1', secret: 'x' }), { ok: true, classe: 'autorizado' });
  await dormir(20);
  assert.notEqual(ultimo.via, antes.via, 'nova consulta, nova assinatura (nonce novo)');
});

test('delegada: erro de rede nunca derruba e mantém «não verificável»; lixo na resposta é ignorado', async () => {
  const s = servidorFalso();
  const c = await controladorPareado(s);
  for (const resp of [() => { throw new Error('ECONNREFUSED'); }, () => ({ foo: 1 }), () => null, () => ({ ok: 'sim', classe: 5 })]) {
    s.transporte.verificarDispositivo = async () => resp();
    assert.doesNotThrow(() => c.verificarDelegado({ deviceId: 'dev-9', secret: 'z' }));
    await dormir(15);
    assert.equal(c.verificarDelegado({ deviceId: 'dev-9', secret: 'z' }), null);
  }
});
