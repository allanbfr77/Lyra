'use strict';

/**
 * Entrega 2 — guardas POR ROTA (não são o modo `impor` geral): credencial exigida em rotas
 * sensíveis, «só local ou elo» para DevTools, seleção do limite de corpo e limite de taxa.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { criarGuardasRotas } = require('./guardasRotas');

const SEGREDO = 'SEGREDO-NUNCA-NO-LOG-0123456789';

function req(metodo = 'POST', url = '/api/sync/banco', { ip = '192.168.0.20', cab = {} } = {}) {
  const headers = {};
  for (const [k, v] of Object.entries(cab)) headers[k.toLowerCase()] = v;
  return { method: metodo, url, originalUrl: url, path: url.split('?')[0], headers, socket: { remoteAddress: ip } };
}
function res() {
  const r = { statusCode: 200, headers: {}, corpo: null, ended: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.corpo = o; r.ended = true; return r; };
  r.end = (b) => { r.ended = true; if (b) r.corpo = b; };
  return r;
}
const cred = (id = 'dev-1') => ({ 'X-Lyra-Device': id, 'X-Lyra-Secret': SEGREDO });
function rodar(mw, rq) {
  const rs = res();
  let seguiu = false;
  mw(rq, rs, () => { seguiu = true; });
  return { rs, seguiu };
}
function guardas(extra = {}) {
  const eventos = [];
  const g = criarGuardasRotas({
    verificar: (a) => (a.deviceId === 'dev-1' && a.secret === SEGREDO ? { ok: true, classe: 'autorizado' } : a.deviceId === 'pend' ? { ok: false, classe: 'pendente' } : { ok: false, classe: 'desconhecido' }),
    registrar: (e) => eventos.push(e),
    ...extra,
  });
  return { g, eventos };
}

/* ───────────────────────── exigirCredencial ───────────────────────── */

test('exigirCredencial: dispositivo autorizado passa; ausente, inválido, desconhecido e pendente são recusados com o motivo', () => {
  const { g, eventos } = guardas();
  const mw = g.exigirCredencial();
  assert.equal(rodar(mw, req('POST', '/api/sync/banco', { cab: cred() })).seguiu, true);
  const sem = rodar(mw, req());
  assert.deepEqual({ s: sem.seguiu, c: sem.rs.statusCode, m: sem.rs.corpo.motivo }, { s: false, c: 401, m: 'ausente' });
  const errado = rodar(mw, req('POST', '/api/sync/banco', { cab: { 'X-Lyra-Device': 'dev-1', 'X-Lyra-Secret': 'errado' } }));
  assert.deepEqual({ c: errado.rs.statusCode, m: errado.rs.corpo.motivo }, { c: 401, m: 'desconhecido' });
  const pend = rodar(mw, req('POST', '/api/sync/banco', { cab: cred('pend') }));
  assert.deepEqual({ c: pend.rs.statusCode, m: pend.rs.corpo.motivo }, { c: 403, m: 'pendente' });
  assert.ok(eventos.length >= 3);
});

test('exigirCredencial: veredito «não verificável» (null) e falha do verificador recusam (falha fechada), sem lançar', () => {
  for (const verificar of [() => null, () => { throw new Error('x'); }, () => undefined, () => 'lixo']) {
    const { g } = guardas({ verificar });
    const r = rodar(g.exigirCredencial(), req('POST', '/api/sync/banco', { cab: cred() }));
    assert.equal(r.seguiu, false);
    assert.equal(r.rs.statusCode, 401);
  }
});

test('exigirCredencial({aceitaElo}): o elo válido substitui a credencial de dispositivo; elo inválido não', () => {
  let resultado = { ok: true };
  const { g } = guardas({ verificarElo: () => resultado });
  const aceita = g.exigirCredencial({ aceitaElo: true });
  assert.equal(rodar(aceita, req()).seguiu, true);
  resultado = { ok: false, motivo: 'assinatura' };
  assert.equal(rodar(aceita, req()).seguiu, false);
  resultado = { ok: true };
  assert.equal(rodar(g.exigirCredencial(), req()).seguiu, false, 'sem aceitaElo o elo não vale');
});

test('exigirCredencial: interna do painel passa quando o verificador a reconhece (classe interna)', () => {
  const { g } = guardas({ verificar: (a) => (a.deviceId === 'interno' ? { ok: true, classe: 'interna' } : { ok: false, classe: 'ausente' }) });
  assert.equal(rodar(g.exigirCredencial(), req('PUT', '/api/display-config', { cab: { 'X-Lyra-Device': 'interno', 'X-Lyra-Secret': 'x' } })).seguiu, true);
});

test('chave de desligamento: com `desligadas` nenhuma guarda recusa nada (escape documentado)', () => {
  const { g } = guardas({ desligadas: true });
  assert.equal(rodar(g.exigirCredencial(), req()).seguiu, true);
  assert.equal(rodar(g.exigirLocalOuElo(), req()).seguiu, true);
  assert.equal(rodar(g.limitarTaxa(), req()).seguiu, true);
});

test('recusa nunca vaza segredo: nem na resposta, nem no evento; evento deduplicado e com teto', () => {
  const { g, eventos } = guardas({ maxEventos: 3 });
  const mw = g.exigirCredencial();
  for (let i = 0; i < 20; i += 1) rodar(mw, req('POST', '/api/sync/banco', { cab: { 'X-Lyra-Device': 'ninguem', 'X-Lyra-Secret': SEGREDO } }));
  assert.equal(eventos.length, 1, 'mesma recusa repetida = um evento');
  for (let i = 0; i < 10; i += 1) rodar(mw, req('POST', `/api/rota-${i}`, { cab: cred('x') }));
  assert.ok(eventos.length <= 3);
  const r = rodar(mw, req('POST', '/api/sync/banco', { cab: cred('x') }));
  assert.equal(JSON.stringify(eventos).includes(SEGREDO) || JSON.stringify(r.rs.corpo).includes(SEGREDO), false);
  assert.equal(JSON.stringify(eventos).includes('ninguem'), false, 'o deviceId aparece truncado/anonimizado, nunca inteiro');
});

/* ───────────────────────── exigirLocalOuElo ───────────────────────── */

test('exigirLocalOuElo: loopback direto passa; remoto, e loopback PROXIFICADO, não (sem elo)', () => {
  const { g } = guardas();
  const mw = g.exigirLocalOuElo();
  assert.equal(rodar(mw, req('POST', '/api/open-display-devtools', { ip: '127.0.0.1' })).seguiu, true);
  assert.equal(rodar(mw, req('POST', '/api/open-display-devtools', { ip: '::1' })).seguiu, true);
  assert.equal(rodar(mw, req('POST', '/api/open-display-devtools', { ip: '::ffff:127.0.0.1' })).seguiu, true);
  const remoto = rodar(mw, req('POST', '/api/open-display-devtools', { ip: '192.168.0.9' }));
  assert.deepEqual({ s: remoto.seguiu, c: remoto.rs.statusCode, m: remoto.rs.corpo.motivo }, { s: false, c: 403, m: 'somente-local' });
  assert.equal(rodar(mw, req('POST', '/api/open-display-devtools', { ip: '127.0.0.1', cab: { 'X-Lyra-Proxy': '1' } })).seguiu, false);
});

test('exigirLocalOuElo: elo válido libera mesmo de outro PC; inválido não', () => {
  let r = { ok: true };
  const { g } = guardas({ verificarElo: () => r });
  const mw = g.exigirLocalOuElo();
  assert.equal(rodar(mw, req('POST', '/api/open-public-devtools', { ip: '192.168.0.9' })).seguiu, true);
  r = { ok: false, motivo: 'repetida' };
  assert.equal(rodar(mw, req('POST', '/api/open-public-devtools', { ip: '192.168.0.9' })).seguiu, false);
});

/* ───────────────────────── selecionarJson ───────────────────────── */

test('selecionarJson: credencial verificada e loopback usam o parser GRANDE; o resto, o PEQUENO', () => {
  const { g } = guardas();
  const usado = [];
  const mw = g.selecionarJson({ pequeno: (rq, rs, n) => { usado.push('pequeno'); n(); }, grande: (rq, rs, n) => { usado.push('grande'); n(); } });
  rodar(mw, req('POST', '/api/sync/banco', { cab: cred() }));
  rodar(mw, req('POST', '/api/sync/banco', { ip: '127.0.0.1' }));
  rodar(mw, req('POST', '/api/sync/banco', {}));
  rodar(mw, req('POST', '/api/sync/banco', { cab: cred('ninguem') }));
  assert.deepEqual(usado, ['grande', 'grande', 'pequeno', 'pequeno']);
  const { g: g2 } = guardas({ desligadas: true });
  const u2 = [];
  rodar(g2.selecionarJson({ pequeno: (a, b, n) => { u2.push('p'); n(); }, grande: (a, b, n) => { u2.push('g'); n(); } }), req('POST', '/x'));
  assert.deepEqual(u2, ['g'], 'desligadas: como antes (parser grande para todos)');
});

test('selecionarJson: loopback proxificado NÃO ganha o parser grande por ser loopback', () => {
  const { g } = guardas();
  const usado = [];
  const mw = g.selecionarJson({ pequeno: (a, b, n) => { usado.push('p'); n(); }, grande: (a, b, n) => { usado.push('g'); n(); } });
  rodar(mw, req('POST', '/x', { ip: '127.0.0.1', cab: { 'X-Lyra-Proxy': '1' } }));
  assert.deepEqual(usado, ['p']);
});

test('tratarErroCorpo: corpo grande demais vira 413 em JSON; outros erros seguem adiante', () => {
  const { g } = guardas();
  const rs = res();
  let adiante = null;
  g.tratarErroCorpo({ type: 'entity.too.large' }, req(), rs, (e) => { adiante = e; });
  assert.deepEqual({ c: rs.statusCode, m: rs.corpo.motivo, a: adiante }, { c: 413, m: 'corpo-grande-demais', a: null });
  const rs2 = res();
  const outro = new Error('x');
  g.tratarErroCorpo(outro, req(), rs2, (e) => { adiante = e; });
  assert.equal(adiante, outro);
  assert.equal(rs2.ended, false);
});

/* ───────────────────────── limitarTaxa ───────────────────────── */

test('limitarTaxa: passa do teto → 429 com Retry-After; a janela reabre; leitura e loopback não contam', () => {
  const r0 = { t: 1_000_000 };
  const { g } = guardas({ agora: () => r0.t, taxa: { janelaMs: 10_000, max: 5 } });
  const mw = g.limitarTaxa();
  for (let i = 0; i < 5; i += 1) assert.equal(rodar(mw, req('POST', '/api/comando/audio_play')).seguiu, true);
  const bloqueada = rodar(mw, req('POST', '/api/comando/audio_play'));
  assert.deepEqual({ s: bloqueada.seguiu, c: bloqueada.rs.statusCode, m: bloqueada.rs.corpo.motivo }, { s: false, c: 429, m: 'muitas-requisicoes' });
  assert.ok(Number(bloqueada.rs.headers['retry-after']) >= 1);
  assert.equal(rodar(mw, req('GET', '/api/estado')).seguiu, true, 'leitura não conta');
  assert.equal(rodar(mw, req('POST', '/api/comando/audio_play', { ip: '127.0.0.1' })).seguiu, true, 'loopback é isento');
  assert.equal(rodar(mw, req('POST', '/api/comando/audio_play', { ip: '192.168.0.99' })).seguiu, true, 'outro IP tem a sua cota');
  r0.t += 10_001;
  assert.equal(rodar(mw, req('POST', '/api/comando/audio_play')).seguiu, true, 'janela reaberta');
});

test('limitarTaxa: loopback PROXIFICADO não é isento; memória tem teto de IPs', () => {
  const { g } = guardas({ taxa: { janelaMs: 10_000, max: 1 }, maxIps: 50 });
  const mw = g.limitarTaxa();
  rodar(mw, req('POST', '/x', { ip: '127.0.0.1', cab: { 'X-Lyra-Proxy': '1' } }));
  assert.equal(rodar(mw, req('POST', '/x', { ip: '127.0.0.1', cab: { 'X-Lyra-Proxy': '1' } })).seguiu, false);
  for (let i = 0; i < 500; i += 1) rodar(mw, req('POST', '/x', { ip: `10.0.${Math.floor(i / 250)}.${i % 250}` }));
  assert.ok(g._diagnostico().ips <= 50);
});

test('valores padrão são generosos para o uso legítimo (vídeo/áudio em alta frequência)', () => {
  const { g } = guardas();
  const mw = g.limitarTaxa();
  let barradas = 0;
  for (let i = 0; i < 250; i += 1) if (!rodar(mw, req('POST', '/api/comando/apresentacao_video_state')).seguiu) barradas += 1;
  assert.equal(barradas, 0, '250 chamadas seguidas (25 por segundo durante 10 s) cabem na cota padrão');
});

/* ───────────────────────── guardas de eventos de socket ───────────────────────── */

const { criarGuardasSocket } = require('./guardasRotas');

test('socket: soAutorizado exige handshake autorizado (visualizador, ausente e valores estranhos não passam)', () => {
  const g = criarGuardasSocket();
  assert.equal(g.soAutorizado({ data: { autorizado: true } }), true);
  for (const s of [{ data: { autorizado: false } }, { data: {} }, { data: { autorizado: 'true' } }, { data: { autorizado: 1 } }, {}, null, undefined]) {
    assert.equal(g.soAutorizado(s), false, JSON.stringify(s));
  }
});

test('socket: cooldown GLOBAL só conta depois de marcado (tentativa que falha não bloqueia a próxima)', () => {
  const r = { t: 1_000_000 };
  const g = criarGuardasSocket({ agora: () => r.t });
  assert.equal(g.permitidoGlobal('forcar', 3000), true);
  assert.equal(g.permitidoGlobal('forcar', 3000), true, 'sem marcar, continua livre');
  g.marcarGlobal('forcar');
  assert.equal(g.permitidoGlobal('forcar', 3000), false);
  assert.equal(g.permitidoGlobal('outra', 3000), true, 'chaves independentes');
  r.t += 3000;
  assert.equal(g.permitidoGlobal('forcar', 3000), true);
});

test('socket: cooldown POR SOCKET consome ao permitir e é independente entre sockets e chaves', () => {
  const r = { t: 1_000_000 };
  const g = criarGuardasSocket({ agora: () => r.t });
  const a = { data: {} };
  const b = { data: {} };
  assert.equal(g.consumirPorSocket(a, 'sync', 10_000), true);
  assert.equal(g.consumirPorSocket(a, 'sync', 10_000), false);
  assert.equal(g.consumirPorSocket(b, 'sync', 10_000), true, 'outro socket tem a sua vez');
  assert.equal(g.consumirPorSocket(a, 'outra', 10_000), true);
  r.t += 10_000;
  assert.equal(g.consumirPorSocket(a, 'sync', 10_000), true);
  assert.equal(g.consumirPorSocket(null, 'sync', 1), false);
  const semData = {};
  assert.equal(g.consumirPorSocket(semData, 'x', 1), true, 'cria `data` se faltar');
});
