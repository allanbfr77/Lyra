'use strict';

/**
 * E1.3 C2 — gancho opcional `avaliarBastao` do middleware de autenticação HTTP.
 *
 * Só OBSERVA: enriquece o evento `politica-http` das rotas CMD do Servidor 5510 com a decisão do
 * bastão. Nunca altera resposta, status ou execução do handler, e uma falha do gancho nunca derruba
 * a requisição. Nenhum segredo entra no evento nem no que é passado ao gancho.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarAutenticacaoHttp } = require('./autenticacaoHttp');

const SEGREDO = 'SEGREDO-NUNCA-REGISTRAR-0123456789';

function req(metodo, caminho, cab = {}) {
  const headers = {};
  for (const [k, v] of Object.entries(cab)) headers[k.toLowerCase()] = v;
  return { method: metodo, url: caminho, originalUrl: caminho, path: caminho.split('?')[0], headers, socket: { remoteAddress: '192.168.0.50' } };
}
function res() {
  const r = { statusCode: 200, setHeaders: [], ended: false, body: null };
  r.setHeader = (k, v) => r.setHeaders.push([k, v]);
  r.end = (b) => { r.ended = true; r.body = b; };
  return r;
}
const CRED = { 'X-Lyra-Device': 'dev-secundario-0001', 'X-Lyra-Secret': SEGREDO };

function montar({ contexto = 'servidor-5510', modo = 'registrar', bastao, verificar } = {}) {
  const eventos = [];
  const chamadas = [];
  const auth = criarAutenticacaoHttp({
    modo,
    contexto,
    verificar: verificar || ((a) => (a.secret === SEGREDO ? { ok: true, classe: 'autorizado' } : { ok: false, classe: 'secret-invalido' })),
    registrar: () => {},
    registrarDecisao: (e) => eventos.push(e),
    ...(bastao ? { avaliarBastao: (a) => { chamadas.push(a); return bastao(a); } } : {}),
  });
  return { auth, eventos, chamadas };
}

function passar(auth, r) {
  const rs = res();
  let seguiu = false;
  auth.middleware(r, rs, () => { seguiu = true; });
  return { rs, seguiu };
}

const SOMENTE_LEITURA = () => ({ permitido: false, motivo: 'somente-leitura', donoAtual: 'PC do Louvor', ambigua: false, via: 'dispositivo' });

test('rota CMD do Servidor: o gancho é chamado com {deviceId, autorizado} e o evento ganha a decisão do bastão', () => {
  const { auth, eventos, chamadas } = montar({ bastao: SOMENTE_LEITURA });
  const { seguiu, rs } = passar(auth, req('POST', '/api/comando/audio_play', CRED));
  assert.equal(seguiu, true, 'registrar nunca bloqueia');
  assert.equal(rs.ended, false, 'a resposta não é tocada');
  assert.deepEqual(chamadas, [{ deviceId: 'dev-secundario-0001', autorizado: true }], 'só identidade e veredito da credencial');
  assert.equal(eventos.length, 1);
  const e = eventos[0];
  assert.equal(e.rota.id, 'S-013');
  assert.deepEqual(e.bastao, {
    aplicavel: true, via: 'dispositivo', permitido: false, motivo: 'somente-leitura', donoAtual: 'PC do Louvor', ambigua: false, recusariaEmImpor: true,
  });
});

test('decisão permitida (ok/isento) não gera evento por si só, mas entra no resumo de política', () => {
  const { auth, eventos } = montar({ bastao: () => ({ permitido: true, motivo: 'isento', donoAtual: 'PC1', ambigua: false, via: 'dispositivo' }) });
  passar(auth, req('POST', '/api/comando/audio_pause', CRED));
  assert.equal(eventos.length, 0);
  const r = auth.resumoPolitica().find((x) => x.id === 'S-014');
  assert.ok(r && r.bastao && r.bastao.motivo === 'isento' && r.bastao.recusariaEmImpor === false);
});

test('decisão AMBÍGUA gera evento e fica marcada como incerta (recusariaEmImpor = null)', () => {
  const { auth, eventos } = montar({ bastao: () => ({ permitido: null, motivo: 'ambiguo', donoAtual: 'PC1', ambigua: true, via: 'dispositivo', candidatos: 2 }) });
  passar(auth, req('POST', '/api/comando/audio_seek', CRED));
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].bastao.ambigua, true);
  assert.equal(eventos[0].bastao.permitido, null);
  assert.equal(eventos[0].bastao.recusariaEmImpor, null);
  assert.equal(eventos[0].bastao.candidatos, 2);
});

test('credencial ausente/inválida: o gancho recebe autorizado=false e a decisão é nao-autorizado', () => {
  const { auth, eventos, chamadas } = montar({ bastao: ({ autorizado }) => (autorizado ? { permitido: true, motivo: 'ok', ambigua: false, via: 'dispositivo' } : { permitido: false, motivo: 'nao-autorizado', donoAtual: null, ambigua: false, via: 'dispositivo' }) });
  const a = passar(auth, req('POST', '/api/comando/exibir_contagem'));
  const b = passar(auth, req('POST', '/api/comando/audio_stop', { 'X-Lyra-Device': 'x', 'X-Lyra-Secret': 'errado' }));
  assert.equal(a.seguiu && b.seguiu, true);
  assert.deepEqual(chamadas.map((c) => c.autorizado), [false, false]);
  assert.ok(eventos.every((e) => e.bastao.motivo === 'nao-autorizado' && e.bastao.recusariaEmImpor === true));
});

test('credencial não verificável (verificador indisponível): gancho NÃO é chamado; evento diz nao-verificavel', () => {
  const { auth, eventos, chamadas } = montar({ bastao: SOMENTE_LEITURA, verificar: () => null });
  const { seguiu } = passar(auth, req('POST', '/api/comando/audio_volume', CRED));
  assert.equal(seguiu, true);
  assert.equal(chamadas.length, 0);
  assert.equal(eventos[0].bastao.motivo, 'nao-verificavel');
  assert.equal(eventos[0].bastao.permitido, null);
  assert.equal(eventos[0].bastao.recusariaEmImpor, null);
});

test('o gancho só é usado nas rotas CMD do Servidor 5510 (ESC, leitura e outros contextos ficam de fora)', () => {
  // ESC no Servidor
  let t = montar({ bastao: SOMENTE_LEITURA });
  passar(t.auth, req('PUT', '/api/display-config', CRED));
  passar(t.auth, req('PUT', '/api/display-config/preview', CRED));
  passar(t.auth, req('PUT', '/api/display-routing', CRED));
  passar(t.auth, req('POST', '/api/sync/banco', CRED));
  passar(t.auth, req('GET', '/api/display-config', CRED));
  assert.equal(t.chamadas.length, 0, 'ESC/leitura não consultam o bastão');
  assert.ok(t.eventos.every((e) => e.bastao === undefined), 'e o evento não ganha o campo');
  // CMD em outros contextos
  for (const contexto of ['local-5510', 'controlador-3001']) {
    t = montar({ contexto, bastao: SOMENTE_LEITURA });
    passar(t.auth, req('POST', '/api/comando/audio_play', CRED));
    assert.equal(t.chamadas.length, 0, `${contexto} não consulta o bastão`);
    assert.ok(t.eventos.every((e) => e.bastao === undefined));
  }
});

test('falha do gancho (lança exceção ou devolve lixo): a requisição segue e o evento registra a falha', () => {
  for (const bastao of [() => { throw new Error('boom'); }, () => 'lixo', () => null, () => undefined]) {
    const { auth, eventos } = montar({ bastao });
    const { seguiu, rs } = passar(auth, req('POST', '/api/comando/audio_play', CRED));
    assert.equal(seguiu, true);
    assert.equal(rs.ended, false);
    assert.equal(eventos.length, 1, 'a falha é visível');
    assert.deepEqual({ a: eventos[0].bastao.aplicavel, e: eventos[0].bastao.erro, r: eventos[0].bastao.recusariaEmImpor }, { a: true, e: 'falha-no-gancho', r: null });
  }
});

test('gancho que NÃO retorna (promessa) é tratado como falha: o middleware é síncrono e não espera', () => {
  const { auth, eventos } = montar({ bastao: () => Promise.resolve({ permitido: true }) });
  const { seguiu } = passar(auth, req('POST', '/api/comando/audio_play', CRED));
  assert.equal(seguiu, true);
  assert.equal(eventos[0].bastao.erro, 'falha-no-gancho');
});

test('sem o gancho, o evento é exatamente o da C1 (sem o campo bastao)', () => {
  const { auth, eventos } = montar();
  passar(auth, req('POST', '/api/comando/audio_play', {}));
  assert.equal(eventos.length, 1);
  assert.equal('bastao' in eventos[0], false);
});

test('nenhum segredo no evento nem no que é entregue ao gancho; deviceId do evento segue truncado', () => {
  const { auth, eventos, chamadas } = montar({ bastao: SOMENTE_LEITURA });
  passar(auth, req('POST', '/api/comando/audio_play', CRED));
  const txt = JSON.stringify(eventos) + JSON.stringify(chamadas) + JSON.stringify(auth.resumoPolitica()) + JSON.stringify(auth.resumo());
  assert.equal(txt.includes(SEGREDO), false);
  assert.deepEqual(Object.keys(chamadas[0]).sort(), ['autorizado', 'deviceId']);
  assert.equal(eventos[0].apresentada.deviceId, 'dev-secu…');
  assert.equal(JSON.stringify(eventos[0]).includes('dev-secundario-0001'), false, 'o id completo não vai para o log');
});

test('registrar nunca bloqueia: todas as decisões (inclusive recusas e ambiguidade) deixam a requisição passar', () => {
  for (const decisao of [SOMENTE_LEITURA, () => ({ permitido: null, motivo: 'ambiguo', ambigua: true, via: 'dispositivo' }), () => ({ permitido: false, motivo: 'nao-autorizado', ambigua: false, via: 'dispositivo' })]) {
    const { auth } = montar({ bastao: decisao });
    for (const cab of [CRED, {}, { 'X-Lyra-Device': 'a', 'X-Lyra-Secret': 'b' }]) {
      const { seguiu, rs } = passar(auth, req('POST', '/api/comando/apresentacao_video_state', cab));
      assert.equal(seguiu, true);
      assert.equal(rs.ended, false);
      assert.equal(rs.statusCode, 200);
    }
  }
});

test('deduplicação: a mesma recusa repetida vira um evento; motivo diferente vira outro', () => {
  let motivo = 'somente-leitura';
  const { auth, eventos } = montar({ bastao: () => ({ permitido: motivo === 'ok', motivo, donoAtual: 'PC1', ambigua: false, via: 'dispositivo' }) });
  for (let i = 0; i < 5; i += 1) passar(auth, req('POST', '/api/comando/audio_play', CRED));
  assert.equal(eventos.length, 1);
  motivo = 'nao-autorizado';
  passar(auth, req('POST', '/api/comando/audio_play', CRED));
  assert.equal(eventos.length, 2);
});

test('em «impor» o gancho não muda a decisão da autenticação (a C2 não ativa nada)', () => {
  const { auth } = montar({ modo: 'impor', bastao: () => ({ permitido: true, motivo: 'ok', ambigua: false, via: 'dispositivo' }) });
  const sem = passar(auth, req('POST', '/api/comando/audio_play', {}));
  assert.equal(sem.seguiu, false, 'sem credencial continua recusado pela Fase A, como antes');
  const com = passar(auth, req('POST', '/api/comando/audio_play', CRED));
  assert.equal(com.seguiu, true);
});
