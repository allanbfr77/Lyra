'use strict';

/**
 * Entrega 1 — `criarElo`: assinatura de saída e OBSERVAÇÃO de entrada nas rotas ELO do manifesto
 * (sem bloquear nada: o observador só registra e sempre chama `next`).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { criarElo, capturarCorpoElo } = require('./elo');
const { avaliarRota } = require('./politicaRotas');

const BASE = 'http://192.168.0.5:5510';

/** Par pareado «à mão» (o pareamento real tem teste próprio): mesma chave nos dois armazéns. */
function par() {
  const eventosS = [];
  const eventosC = [];
  const srv = criarElo({ papel: 'servidor', caminho: null, avaliarRota, registrar: (e) => eventosS.push(e) });
  const ctl = criarElo({ papel: 'controlador', caminho: null, avaliarRota, registrar: (e) => eventosC.push(e) });
  const chave = crypto.randomBytes(32);
  const idC = ctl.armazem.idLocal();
  const idS = srv.armazem.idLocal();
  srv.armazem.adicionar({ kid: 'kid-1', chave, origem: idC, destino: idS, papel: 'servidor' });
  ctl.armazem.adicionar({ kid: 'kid-1', chave, origem: idC, destino: idS, papel: 'controlador', base: BASE });
  return { srv, ctl, eventosS, eventosC };
}

function req(metodo, url, corpo, cab = {}) {
  const buf = corpo === undefined ? undefined : Buffer.from(corpo);
  const r = { method: metodo, url, originalUrl: url, path: url.split('?')[0], headers: Object.fromEntries(Object.entries(cab).map(([k, v]) => [k.toLowerCase(), v])), socket: { remoteAddress: '192.168.0.20' } };
  if (buf) capturarCorpoElo(r, null, buf);
  return r;
}
const rodar = (mw, r) => { let seguiu = false; mw(r, { statusCode: 200, setHeader() {}, end() {} }, () => { seguiu = true; }); return seguiu; };

test('c→s: o Controlador assina, o Servidor observa «valido» na rota ELO (display-config)', () => {
  const { srv, ctl, eventosS } = par();
  const corpo = '{"a":1}';
  const via = ctl.assinarSaida({ base: BASE, metodo: 'PUT', caminho: '/api/display-config', corpo });
  assert.ok(via);
  const seguiu = rodar(srv.observador('servidor-5510'), req('PUT', '/api/display-config', corpo, { 'X-Lyra-Via': via }));
  assert.equal(seguiu, true, 'só observa');
  assert.equal(eventosS.length, 1);
  assert.deepEqual({ e: eventosS[0].evento, r: eventosS[0].rota, d: eventosS[0].direcao, x: eventosS[0].resultado, k: eventosS[0].kid }, { e: 'elo-http', r: 'S-007', d: 'c→s', x: 'valido', k: 'kid-1' });
});

test('replay, corpo alterado, rota trocada e ausência aparecem como resultados distintos', () => {
  const { srv, ctl, eventosS } = par();
  const mw = srv.observador('servidor-5510');
  const corpo = '{"a":1}';
  const via = ctl.assinarSaida({ base: BASE, metodo: 'PUT', caminho: '/api/display-config', corpo });
  rodar(mw, req('PUT', '/api/display-config', corpo, { 'X-Lyra-Via': via }));
  rodar(mw, req('PUT', '/api/display-config', corpo, { 'X-Lyra-Via': via }));
  const v2 = ctl.assinarSaida({ base: BASE, metodo: 'PUT', caminho: '/api/display-config', corpo });
  rodar(mw, req('PUT', '/api/display-config', '{"a":2}', { 'X-Lyra-Via': v2 }));
  const v3 = ctl.assinarSaida({ base: BASE, metodo: 'PUT', caminho: '/api/display-config', corpo });
  rodar(mw, req('PUT', '/api/display-config/preview', corpo, { 'X-Lyra-Via': v3 }));
  rodar(mw, req('PUT', '/api/display-config', corpo));
  assert.deepEqual(eventosS.map((e) => e.resultado), ['valido', 'repetida', 'assinatura', 'assinatura', 'ausente']);
});

test('rotas que NÃO esperam elo não geram evento do elo (nem com cabeçalho)', () => {
  const { srv, ctl, eventosS } = par();
  const mw = srv.observador('servidor-5510');
  const via = ctl.assinarSaida({ base: BASE, metodo: 'GET', caminho: '/api/estado' });
  assert.equal(rodar(mw, req('GET', '/api/estado', undefined, { 'X-Lyra-Via': via })), true);
  assert.equal(rodar(mw, req('POST', '/api/comando/audio_play', '{}')), true);
  assert.equal(eventosS.length, 0);
});

test('sem pareamento, assinarSaida devolve null (nada é inventado)', () => {
  const ctl = criarElo({ papel: 'controlador', caminho: null, avaliarRota });
  assert.equal(ctl.assinarSaida({ base: BASE, metodo: 'PUT', caminho: '/api/display-config', corpo: '{}' }), null);
  const srv = criarElo({ papel: 'servidor', caminho: null, avaliarRota });
  assert.equal(srv.assinarSaida({ metodo: 'GET', caminho: '/api/musicas' }), null);
});

test('s→c: o Servidor assina e o Controlador observa na rota alcançada pelo proxy (C-004, mídia)', () => {
  const { srv, ctl, eventosC } = par();
  const via = srv.assinarSaida({ metodo: 'GET', caminho: '/api/apresentacao/midia/abc' });
  assert.ok(via);
  rodar(ctl.observador('controlador-3001'), req('GET', '/api/apresentacao/midia/abc', undefined, { 'X-Lyra-Via': via }));
  assert.equal(eventosC.length, 1);
  assert.deepEqual({ r: eventosC[0].rota, d: eventosC[0].direcao, x: eventosC[0].resultado }, { r: 'C-004', d: 's→c', x: 'valido' });
});

test('uma assinatura c→s não vale se apresentada como s→c (direção)', () => {
  const { srv, ctl, eventosC } = par();
  void srv;
  const via = ctl.assinarSaida({ base: BASE, metodo: 'GET', caminho: '/api/apresentacao/midia/abc' });
  rodar(ctl.observador('controlador-3001'), req('GET', '/api/apresentacao/midia/abc', undefined, { 'X-Lyra-Via': via }));
  assert.equal(eventosC[0].resultado, 'direcao');
});

test('papel errado não reconhece a chave: o Servidor não aceita assinatura feita com chave de papel «controlador»', () => {
  const { ctl } = par();
  const eventos = [];
  const outro = criarElo({ papel: 'servidor', caminho: null, avaliarRota, registrar: (e) => eventos.push(e) });
  outro.armazem.adicionar({ kid: 'kid-1', chave: crypto.randomBytes(32), origem: 'a'.repeat(16), destino: 'b'.repeat(16), papel: 'servidor' });
  const via = ctl.assinarSaida({ base: BASE, metodo: 'PUT', caminho: '/api/display-config', corpo: '{}' });
  rodar(outro.observador('servidor-5510'), req('PUT', '/api/display-config', '{}', { 'X-Lyra-Via': via }));
  assert.equal(eventos[0].resultado, 'assinatura');
});

test('deduplica e tem teto; evento sem segredo, sem chave e sem corpo', () => {
  const { srv, ctl, eventosS } = par();
  const mw = srv.observador('servidor-5510');
  for (let i = 0; i < 10; i += 1) rodar(mw, req('PUT', '/api/display-config', '{}'));
  assert.equal(eventosS.length, 1, 'ausente repetido = um evento');
  const via = ctl.assinarSaida({ base: BASE, metodo: 'PUT', caminho: '/api/display-config', corpo: 'CORPO-SECRETO' });
  rodar(mw, req('PUT', '/api/display-config', 'CORPO-SECRETO', { 'X-Lyra-Via': via }));
  const txt = JSON.stringify(eventosS) + JSON.stringify(srv.observadorResumo());
  assert.equal(txt.includes('CORPO-SECRETO'), false);
  assert.equal(txt.includes(via), false);
  assert.ok(srv.observadorResumo().some((x) => x.resultado === 'ausente' && x.total === 10));
});

test('falha no avaliarRota ou no registrar nunca derruba a requisição', () => {
  const srv = criarElo({ papel: 'servidor', caminho: null, avaliarRota: () => { throw new Error('x'); }, registrar: () => { throw new Error('y'); } });
  assert.equal(rodar(srv.observador('servidor-5510'), req('PUT', '/api/display-config', '{}')), true);
  const srv2 = criarElo({ papel: 'servidor', caminho: null, avaliarRota, registrar: () => { throw new Error('y'); } });
  assert.equal(rodar(srv2.observador('servidor-5510'), req('PUT', '/api/display-config', '{}')), true);
});

test('capturarCorpoElo só guarda o corpo quando o cabeçalho do elo está presente', () => {
  const a = { headers: {} };
  capturarCorpoElo(a, null, Buffer.from('x'));
  assert.equal(a.rawBody, undefined);
  const b = { headers: { 'x-lyra-via': 'v1;...' } };
  capturarCorpoElo(b, null, Buffer.from('x'));
  assert.equal(b.rawBody.toString(), 'x');
});

test('capacidades anunciam elo e sessão de controlador sem expor identidade nem chaves', () => {
  const { srv } = par();
  const c = srv.capacidades();
  assert.deepEqual(c, { elo: 1, sessaoControlador: 1 });
});

test('verificarRequisicao: reaproveita o resultado do observador (o nonce não é consumido duas vezes)', () => {
  const { srv, ctl } = par();
  const corpo = '{"deviceId":"d","secret":"s"}';
  const via = ctl.assinarSaida({ base: BASE, metodo: 'POST', caminho: '/api/elo/verificar-dispositivo', corpo });
  const r = req('POST', '/api/elo/verificar-dispositivo', corpo, { 'X-Lyra-Via': via });
  rodar(srv.observador('servidor-5510'), r);
  assert.equal(r.eloResultado.ok, true);
  assert.equal(srv.verificarRequisicao(r, 'c→s').ok, true, 'o handler não dá «repetida»');
  assert.equal(srv.verificarRequisicao(r, 'c→s').ok, true);
});

test('verificarRequisicao: sem o cabeçalho (ou com assinatura ruim) não passa; fora do observador, confere sozinho', () => {
  const { srv, ctl } = par();
  const semVia = req('POST', '/api/elo/verificar-dispositivo', '{}');
  rodar(srv.observador('servidor-5510'), semVia);
  assert.deepEqual({ ok: srv.verificarRequisicao(semVia, 'c→s').ok, m: srv.verificarRequisicao(semVia, 'c→s').motivo }, { ok: false, m: 'ausente' });
  // rota que o observador não conhece: o handler confere por conta própria
  const via = ctl.assinarSaida({ base: BASE, metodo: 'POST', caminho: '/api/outra-coisa', corpo: '{}' });
  const solta = req('POST', '/api/outra-coisa', '{}', { 'X-Lyra-Via': via });
  assert.equal(srv.verificarRequisicao(solta, 'c→s').ok, true);
  assert.equal(srv.verificarRequisicao(solta, 'c→s').ok, false, 'segunda conferência do mesmo cabeçalho: replay');
});
