'use strict';

/** Entrega 1 — a observação de política passa a conhecer o elo (disponível/presente) e a sessão. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarAutenticacaoHttp, classificarRota } = require('./autenticacaoHttp');
const { avaliarRota, motivoRecusaFutura } = require('./politicaRotas');

function req(metodo, caminho, cab = {}) {
  const headers = {};
  for (const [k, v] of Object.entries(cab)) headers[k.toLowerCase()] = v;
  return { method: metodo, url: caminho, originalUrl: caminho, path: caminho.split('?')[0], headers, socket: { remoteAddress: '192.168.0.50' } };
}
function montar(extra = {}) {
  const eventos = [];
  const auth = criarAutenticacaoHttp({
    modo: 'registrar', contexto: 'servidor-5510', verificar: () => ({ ok: false, classe: 'ausente' }), registrar: () => {},
    registrarDecisao: (e) => eventos.push(e), ...extra,
  });
  return { auth, eventos };
}
const passar = (auth, r) => { let s = false; auth.middleware(r, { setHeader() {}, end() {} }, () => { s = true; }); return s; };

test('sem eloDisponivel (padrão): a rota ELO continua com «credencial inexistente» (comportamento da C1)', () => {
  const d = avaliarRota('servidor-5510', 'POST', '/api/internal/restart');
  assert.deepEqual(motivoRecusaFutura(d, { tipo: 'ausente', loopback: true }), {
    recusaria: true, motivo: 'interprocessos: credencial ainda inexistente (aguarda as etapas C3 em diante)', credencialInexistente: true,
  });
});

test('com eloDisponivel: a credencial deixa de ser «inexistente» e a ausência do elo vira o motivo', () => {
  const d = avaliarRota('servidor-5510', 'POST', '/api/internal/restart');
  const r = motivoRecusaFutura(d, { tipo: 'ausente', loopback: true, eloDisponivel: true });
  assert.equal(r.recusaria, true);
  assert.equal(r.credencialInexistente, false);
  assert.match(r.motivo, /X-Lyra-Via/);
});

test('com o elo PRESENTE (cabeçalho) a recusa futura some, mesmo sem credencial de dispositivo', () => {
  const dSrv = avaliarRota('servidor-5510', 'PUT', '/api/display-config');
  assert.equal(motivoRecusaFutura(dSrv, { tipo: 'ausente', loopback: true, eloDisponivel: true }).recusaria, true);
  assert.equal(motivoRecusaFutura(dSrv, { tipo: 'ausente', loopback: true, eloDisponivel: true, eloPresente: true }).recusaria, false);
  const dInt = avaliarRota('servidor-5510', 'POST', '/api/internal/restart');
  assert.equal(motivoRecusaFutura(dInt, { tipo: 'ausente', loopback: true, eloDisponivel: true, eloPresente: true }).recusaria, false);
});

test('loopback-estrito continua valendo mesmo com o elo presente (o elo não substitui a guarda local)', () => {
  const d = avaliarRota('servidor-5510', 'POST', '/api/internal/restart');
  assert.equal(motivoRecusaFutura(d, { tipo: 'ausente', loopback: false, eloDisponivel: true, eloPresente: true }).recusaria, true);
  assert.equal(motivoRecusaFutura(d, { tipo: 'ausente', loopback: true, proxificada: true, eloDisponivel: true, eloPresente: true }).recusaria, true);
});

test('middleware: eloDisponivel/eloPresente chegam à decisão; a credencial deixa de ser inexistente', () => {
  const { auth, eventos } = montar({ eloDisponivel: true });
  passar(auth, req('POST', '/api/display-routing'));
  passar(auth, req('PUT', '/api/display-config'));
  assert.ok(eventos.length >= 1);
  assert.ok(eventos.every((e) => e.credencialInexistente === false));
  const { auth: a2, eventos: e2 } = montar({ eloDisponivel: true });
  passar(a2, req('PUT', '/api/display-config', { 'X-Lyra-Via': 'v1;kid=x;ts=1;n=aaaaaaaaaaaaaaaa;d=c2s;sig=y' }));
  assert.equal(e2.filter((e) => e.recusariaEmImpor === true).length, 0, 'com o elo presente nada seria recusado');
});

test('o gancho do bastão recebe a sessão SÓ quando o cabeçalho existe, e ela nunca vai ao evento', () => {
  const chamadas = [];
  const { auth, eventos } = montar({
    verificar: () => ({ ok: true, classe: 'autorizado' }),
    avaliarBastao: (a) => { chamadas.push(a); return { permitido: false, motivo: 'somente-leitura', donoAtual: 'PC1', ambigua: false, via: 'socket', identificadoPor: 'token-sessao' }; },
  });
  const cab = { 'X-Lyra-Device': 'dev-aaaaaaaa', 'X-Lyra-Secret': 'seg' };
  passar(auth, req('POST', '/api/comando/audio_play', cab));
  passar(auth, req('POST', '/api/comando/audio_pause', { ...cab, 'X-Lyra-Session': 'TOKEN-DE-SESSAO-SECRETO-1234567890ab' }));
  assert.deepEqual(Object.keys(chamadas[0]).sort(), ['autorizado', 'deviceId']);
  assert.deepEqual(Object.keys(chamadas[1]).sort(), ['autorizado', 'deviceId', 'sessao']);
  assert.equal(JSON.stringify(eventos).includes('TOKEN-DE-SESSAO-SECRETO'), false);
  assert.equal(JSON.stringify(auth.resumoPolitica()).includes('TOKEN-DE-SESSAO-SECRETO'), false);
  assert.ok(eventos.some((e) => e.bastao && e.bastao.identificadoPor === 'token-sessao'));
});

test('classificarRota: pareamento é público (guarda própria); gestão do elo é loopback-estrito', () => {
  assert.equal(classificarRota('POST', '/api/elo/parear'), 'publica');
  assert.equal(classificarRota('GET', '/api/elo/parear/abc'), 'publica');
  assert.equal(classificarRota('POST', '/api/elo/parear/abc/cancelar'), 'publica');
  assert.equal(classificarRota('POST', '/api/elo/verificar-dispositivo'), 'publica', 'o Controlador chama com o elo, sem credencial de dispositivo');
  assert.equal(classificarRota('GET', '/api/elo/pareamentos'), 'loopback-estrito');
  assert.equal(classificarRota('POST', '/api/elo/pareamentos/abc/aprovar'), 'loopback-estrito');
  assert.equal(classificarRota('POST', '/api/elo/chaves/revogar'), 'loopback-estrito');
  assert.equal(classificarRota('POST', '/api/elo/qualquer-outra'), 'escrita', 'o que não foi previsto segue a regra geral');
});

test('CORS: o painel pode enviar X-Lyra-Session (senão o preflight barra a chamada) e o elo NÃO é cabeçalho de página', () => {
  const { CABECALHOS_CORS } = require('./acessoRede');
  assert.match(CABECALHOS_CORS, /X-Lyra-Session/);
  assert.match(CABECALHOS_CORS, /X-Lyra-Device/);
  assert.doesNotMatch(CABECALHOS_CORS, /X-Lyra-Via/i);
});
