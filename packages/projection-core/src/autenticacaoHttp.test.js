'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { criarAutenticacaoHttp, classificarRota, MODOS } = require('./autenticacaoHttp');

/* ───────────── utilitários ───────────── */

function reqFalso({ method = 'GET', path = '/api/musicas', headers = {}, ip = '192.168.0.50', url } = {}) {
  return {
    method,
    path,
    url: url || path,
    originalUrl: url || path,
    headers: { host: '192.168.0.10:3001', ...headers },
    socket: { remoteAddress: ip },
  };
}

function resFalso() {
  const r = {
    statusCode: 200,
    cabecalhos: {},
    corpo: null,
    terminou: false,
    setHeader(k, v) { this.cabecalhos[k.toLowerCase()] = v; },
    end(c) { this.corpo = c === undefined ? null : String(c); this.terminou = true; },
  };
  return r;
}

/** Roda o middleware e devolve se seguiu adiante (`next`) e o que foi respondido. */
function executar(mw, req) {
  const res = resFalso();
  let seguiu = false;
  mw(req, res, () => { seguiu = true; });
  return { seguiu, res };
}

function novo(opcoes = {}) {
  const eventos = [];
  const chamadasVerificar = [];
  const verificar = opcoes.verificar === undefined
    ? (auth) => {
        chamadasVerificar.push(auth);
        return { ok: false, classe: 'desconhecido' };
      }
    : opcoes.verificar;
  const auth = criarAutenticacaoHttp({
    modo: opcoes.modo || 'registrar',
    contexto: opcoes.contexto || 'servidor-5510',
    verificar,
    registrar: (e) => eventos.push(e),
    ...(opcoes.extra || {}),
  });
  return { auth, eventos, chamadasVerificar };
}

/* ───────────── políticas de rota ───────────── */

test('classificarRota: páginas, socket.io, identidade e preflight são públicos', () => {
  for (const [metodo, caminho] of [
    ['GET', '/'],
    ['GET', '/controller.html'],
    ['GET', '/js/controllerAppCore.js'],
    ['GET', '/obs'],
    ['GET', '/obs/biblia'],
    ['GET', '/socket.io/'],
    ['POST', '/socket.io/'],
    ['GET', '/api/identity'],
    ['GET', '/vosk-model/modelo.tar.gz'],
    ['OPTIONS', '/api/musicas'],
    ['OPTIONS', '/api/comando/audio_play'],
  ]) {
    assert.equal(classificarRota(metodo, caminho), 'publica', `${metodo} ${caminho}`);
  }
});

test('classificarRota: GET de mídia da apresentação segue público (risco residual registrado)', () => {
  assert.equal(classificarRota('GET', '/api/apresentacao/midia/ap_1'), 'publica');
  assert.equal(classificarRota('HEAD', '/api/apresentacao/video/7'), 'publica');
  assert.equal(classificarRota('GET', '/api/apresentacao/video/7'), 'publica');
});

test('classificarRota: leituras da API são "leitura"', () => {
  for (const caminho of [
    '/api/musicas', '/api/musicas/12', '/api/musicas/buscar', '/api/biblia/traducoes',
    '/api/playlists', '/api/estado', '/api/display-config', '/api/monitores',
    '/api/display-routing', '/api/sync/banco', '/api/sync/banco/local', '/api/historico',
    '/api/ministrantes', '/api/apresentacao/state',
  ]) {
    assert.equal(classificarRota('GET', caminho), 'leitura', caminho);
  }
  assert.equal(classificarRota('HEAD', '/api/musicas'), 'leitura');
});

test('classificarRota: escritas da API são "escrita"', () => {
  for (const [metodo, caminho] of [
    ['POST', '/api/musicas'], ['PUT', '/api/musicas/3'], ['PATCH', '/api/musicas/3/rotulo'],
    ['DELETE', '/api/musicas/3'], ['POST', '/api/musicas/3/excluir'], ['PUT', '/api/playlists'],
    ['POST', '/api/sync/banco'], ['POST', '/api/sync/banco/local'], ['PUT', '/api/sync/banco/meta'],
    ['POST', '/api/sync/banco/pedido'], ['PUT', '/api/display-config'],
    ['PUT', '/api/display-config/preview'], ['PUT', '/api/display-routing'],
    ['POST', '/api/historico/limpar'], ['DELETE', '/api/historico/4'],
    ['PUT', '/api/apresentacao/video/ap_1'], ['PUT', '/api/apresentacao/state'],
    ['POST', '/api/open-display-devtools'], ['POST', '/api/letras/importar'],
    ['POST', '/api/ministrantes'], ['POST', '/api/tom-memoria/webhook-invb'],
  ]) {
    assert.equal(classificarRota(metodo, caminho), 'escrita', `${metodo} ${caminho}`);
  }
});

test('classificarRota: comandos de projeção são "comando"', () => {
  for (const c of ['exibir_apresentacao', 'exibir_contagem', 'encerrar_contagem', 'audio_play', 'apresentacao_video_state']) {
    assert.equal(classificarRota('POST', `/api/comando/${c}`), 'comando', c);
  }
});

test('classificarRota: rotas restritas à própria máquina são "loopback-estrito"', () => {
  for (const [metodo, caminho] of [
    ['GET', '/api/controladores'], ['POST', '/api/controladores/aprovar'],
    ['POST', '/api/controladores/revogar'], ['POST', '/api/controladores/travar'],
    ['POST', '/api/controladores/destravar'], ['POST', '/api/internal/restart'],
    ['POST', '/api/internal/quit-for-update'], ['POST', '/api/apresentacao/midia/importar'],
    ['POST', '/api/docs/converter-pdf'], ['GET', '/api/sync/banco/pedido'],
    ['POST', '/api/sync/banco/pedido/aceitar'], ['POST', '/api/sync/banco/pedido/recusar'],
  ]) {
    assert.equal(classificarRota(metodo, caminho), 'loopback-estrito', `${metodo} ${caminho}`);
  }
});

test('classificarRota: query string e barra final não mudam a classe; método desconhecido na API é escrita', () => {
  assert.equal(classificarRota('GET', '/api/musicas?fonte=catalog'), 'leitura');
  assert.equal(classificarRota('POST', '/api/comando/audio_play/'), 'comando');
  assert.equal(classificarRota('post', '/api/musicas'), 'escrita');
  assert.equal(classificarRota('FOO', '/api/musicas'), 'escrita');
});

test('classificarRota: caminho com ".." ou "//" não rebaixa a classe de uma rota crítica', () => {
  assert.equal(classificarRota('POST', '/api/musicas/../apresentacao/midia/importar'), 'loopback-estrito');
  assert.equal(classificarRota('POST', '//api/apresentacao/midia/importar'), 'loopback-estrito');
  assert.equal(classificarRota('POST', '/api/./comando/audio_play'), 'comando');
});

/* ───────────── modos ───────────── */

test('MODOS expõe desligado, registrar e impor', () => {
  assert.deepEqual([...MODOS].sort(), ['desligado', 'impor', 'registrar']);
});

test('modo inválido cai em "registrar" (nunca em "impor")', () => {
  const { auth } = novo({ modo: 'qualquer-coisa' });
  assert.equal(auth.modo, 'registrar');
  const { auth: a2 } = novo({ modo: undefined });
  assert.equal(a2.modo, 'registrar');
});

test('modo desligado: segue sem consultar credencial e sem registrar nada', () => {
  const { auth, eventos, chamadasVerificar } = novo({ modo: 'desligado' });
  const r = executar(auth.middleware, reqFalso({ method: 'POST', path: '/api/sync/banco/local' }));
  assert.equal(r.seguiu, true);
  assert.equal(r.res.terminou, false);
  assert.equal(chamadasVerificar.length, 0);
  assert.equal(eventos.length, 0);
});

test('modo registrar: NUNCA bloqueia, em nenhuma classe de credencial nem de rota', () => {
  const classes = ['ausente', 'secret-invalido', 'pendente', 'desconhecido', 'revogado', 'autorizado', 'aberto'];
  const rotas = [
    ['GET', '/api/musicas'], ['POST', '/api/musicas'], ['POST', '/api/comando/audio_play'],
    ['POST', '/api/sync/banco/local'], ['POST', '/api/apresentacao/midia/importar'],
    ['GET', '/api/identity'], ['GET', '/controller.html'], ['OPTIONS', '/api/musicas'],
  ];
  for (const classe of classes) {
    const { auth } = novo({ verificar: () => ({ ok: classe === 'autorizado' || classe === 'aberto', classe }) });
    for (const [metodo, caminho] of rotas) {
      const r = executar(auth.middleware, reqFalso({
        method: metodo, path: caminho,
        headers: { 'x-lyra-device': 'abcdef123456', 'x-lyra-secret': 'segredo' },
      }));
      assert.equal(r.seguiu, true, `${classe} ${metodo} ${caminho} deveria seguir`);
      assert.equal(r.res.terminou, false);
      assert.equal(r.res.statusCode, 200);
    }
  }
});

test('modo registrar: se o verificador lançar exceção a requisição continua', () => {
  const { auth, eventos } = novo({ verificar: () => { throw new Error('quebrou'); } });
  const r = executar(auth.middleware, reqFalso({ headers: { 'x-lyra-device': 'd', 'x-lyra-secret': 's' } }));
  assert.equal(r.seguiu, true);
  assert.ok(Array.isArray(eventos));
});

test('modo registrar: se o registrador lançar exceção a requisição continua', () => {
  const auth = criarAutenticacaoHttp({
    modo: 'registrar',
    verificar: () => ({ ok: false, classe: 'ausente' }),
    registrar: () => { throw new Error('log quebrado'); },
  });
  const r = executar(auth.middleware, reqFalso());
  assert.equal(r.seguiu, true);
});

test('modo impor (não usado em produção nesta fase): recusa sem credencial; deixa as rotas públicas', () => {
  const { auth } = novo({ modo: 'impor' });
  const negada = executar(auth.middleware, reqFalso({ method: 'POST', path: '/api/musicas' }));
  assert.equal(negada.seguiu, false);
  assert.equal(negada.res.statusCode, 401);
  assert.equal(executar(auth.middleware, reqFalso({ path: '/api/identity' })).seguiu, true);
  assert.equal(executar(auth.middleware, reqFalso({ method: 'OPTIONS', path: '/api/musicas' })).seguiu, true);

  const pendente = novo({ modo: 'impor', verificar: () => ({ ok: false, classe: 'pendente' }) });
  const r = executar(pendente.auth.middleware, reqFalso({
    method: 'POST', path: '/api/musicas', headers: { 'x-lyra-device': 'd', 'x-lyra-secret': 's' },
  }));
  assert.equal(r.res.statusCode, 403);

  const ok = novo({ modo: 'impor', verificar: () => ({ ok: true, classe: 'autorizado', device: { deviceId: 'd' } }) });
  assert.equal(executar(ok.auth.middleware, reqFalso({
    method: 'POST', path: '/api/musicas', headers: { 'x-lyra-device': 'd', 'x-lyra-secret': 's' },
  })).seguiu, true);
});

/* ───────────── eventos registrados ───────────── */

test('registra requisição sem credencial com os campos esperados', () => {
  const { auth, eventos } = novo();
  executar(auth.middleware, reqFalso({ method: 'PUT', path: '/api/display-routing', ip: '::ffff:192.168.0.77' }));
  assert.equal(eventos.length, 1);
  const e = eventos[0];
  assert.equal(e.metodo, 'PUT');
  assert.equal(e.caminho, '/api/display-routing');
  assert.equal(e.politica, 'escrita');
  assert.equal(e.classe, 'ausente');
  assert.equal(e.ip, '192.168.0.77');
  assert.equal(e.temXLyraApp, false);
  assert.equal(e.proxificada, false);
  assert.equal(e.seriaRecusada, true);
  assert.equal(e.modo, 'registrar');
  assert.equal(e.contexto, 'servidor-5510');
  assert.equal(e.deviceId, '');
});

test('registra credencial inválida, pendente e desconhecida, com deviceId truncado', () => {
  for (const classe of ['secret-invalido', 'pendente', 'desconhecido', 'revogado']) {
    const { auth, eventos } = novo({ verificar: () => ({ ok: false, classe }) });
    executar(auth.middleware, reqFalso({
      method: 'POST', path: '/api/musicas',
      headers: { 'x-lyra-device': '0123456789abcdef-0123', 'x-lyra-secret': 'SEGREDO-MUITO-SECRETO' },
    }));
    assert.equal(eventos.length, 1, classe);
    assert.equal(eventos[0].classe, classe);
    assert.equal(eventos[0].seriaRecusada, true);
    assert.equal(eventos[0].deviceId, '01234567…');
  }
});

test('NÃO registra o que seria aceito (credencial válida) nem rotas públicas', () => {
  const { auth, eventos } = novo({ verificar: () => ({ ok: true, classe: 'autorizado', device: { deviceId: 'x' } }) });
  executar(auth.middleware, reqFalso({ method: 'POST', path: '/api/musicas', headers: { 'x-lyra-device': 'x', 'x-lyra-secret': 'y' } }));
  executar(auth.middleware, reqFalso({ path: '/api/identity' }));
  executar(auth.middleware, reqFalso({ path: '/controller.html' }));
  assert.equal(eventos.length, 0);
});

test('X-Lyra-App: presença e versão (saneada) entram no registro', () => {
  const { auth, eventos } = novo();
  executar(auth.middleware, reqFalso({ headers: { 'x-lyra-app': '1.3.0' } }));
  assert.equal(eventos[0].temXLyraApp, true);
  assert.equal(eventos[0].appVersao, '1.3.0');
  const o = novo();
  executar(o.auth.middleware, reqFalso({ headers: { 'x-lyra-app': '<script>alert(1)</script>'.repeat(5) } }));
  assert.equal(o.eventos[0].temXLyraApp, true);
  assert.match(o.eventos[0].appVersao, /^[\w.\-]{0,24}$/);
});

test('requisição declarada como proxificada é identificada', () => {
  const { auth, eventos } = novo({ contexto: 'controlador-3001' });
  executar(auth.middleware, reqFalso({ headers: { 'x-lyra-proxy': '1' }, ip: '127.0.0.1' }));
  assert.equal(eventos[0].proxificada, true);
  assert.equal(eventos[0].contexto, 'controlador-3001');
});

test('sem verificador (3001 sem allowlist): credencial presente vira "nao-verificavel" e não conta como recusa', () => {
  const { auth, eventos } = novo({ verificar: null, contexto: 'controlador-3001' });
  executar(auth.middleware, reqFalso({
    method: 'POST', path: '/api/musicas', headers: { 'x-lyra-device': 'abcdefghij', 'x-lyra-secret': 'zzz' },
  }));
  executar(auth.middleware, reqFalso({ method: 'POST', path: '/api/musicas' }));
  const porClasse = Object.fromEntries(eventos.map((e) => [e.classe, e]));
  assert.equal(porClasse['nao-verificavel'].seriaRecusada, null);
  assert.equal(porClasse['ausente'].seriaRecusada, true);
});

test('o verificador pode ser resolvido tarde (função que devolve a função)', () => {
  let verificador = null;
  const eventos = [];
  const auth = criarAutenticacaoHttp({
    modo: 'registrar', verificar: (a) => (verificador ? verificador(a) : null), registrar: (e) => eventos.push(e),
  });
  executar(auth.middleware, reqFalso({ method: 'POST', path: '/api/musicas', headers: { 'x-lyra-device': 'd', 'x-lyra-secret': 's' } }));
  assert.equal(eventos[0].classe, 'nao-verificavel');
  verificador = () => ({ ok: false, classe: 'desconhecido' });
  executar(auth.middleware, reqFalso({ method: 'POST', path: '/api/outra', headers: { 'x-lyra-device': 'd', 'x-lyra-secret': 's' } }));
  assert.equal(eventos[1].classe, 'desconhecido');
});

test('NENHUM segredo aparece nos eventos registrados nem no resumo', () => {
  const SEGREDO = 'SEGREDO-NAO-PODE-VAZAR-9f3a';
  const { auth, eventos } = novo({ verificar: () => ({ ok: false, classe: 'secret-invalido' }) });
  for (let i = 0; i < 5; i++) {
    executar(auth.middleware, reqFalso({
      method: 'POST', path: `/api/musicas/${i}`,
      headers: { 'x-lyra-device': 'dispositivo-1234', 'x-lyra-secret': SEGREDO, authorization: `Bearer ${SEGREDO}` },
    }));
  }
  const tudo = JSON.stringify({ eventos, resumo: auth.resumo() });
  assert.ok(eventos.length > 0);
  assert.ok(!tudo.includes(SEGREDO), 'o segredo vazou no registro');
  assert.ok(!tudo.includes('dispositivo-1234'), 'deviceId completo vazou no registro');
});

test('o secret nunca é passado adiante além do verificador e o cabeçalho continua na requisição', () => {
  const { auth, chamadasVerificar } = novo();
  const req = reqFalso({ method: 'POST', path: '/api/musicas', headers: { 'x-lyra-device': 'd1', 'x-lyra-secret': 's1' } });
  executar(auth.middleware, req);
  assert.deepEqual(chamadasVerificar, [{ deviceId: 'd1', secret: 's1' }]);
  assert.equal(req.headers['x-lyra-secret'], 's1', 'a requisição não é alterada');
});

/* ───────────── deduplicação e limite ───────────── */

test('deduplica eventos iguais e conta as repetições no resumo', () => {
  const { auth, eventos } = novo();
  for (let i = 0; i < 10; i++) {
    executar(auth.middleware, reqFalso({ method: 'POST', path: '/api/musicas' }));
  }
  assert.equal(eventos.length, 1);
  const resumo = auth.resumo();
  assert.equal(resumo.length, 1);
  assert.equal(resumo[0].total, 10);
  assert.equal(resumo[0].classe, 'ausente');
});

test('ids numéricos no caminho não furam a deduplicação', () => {
  const { auth, eventos } = novo();
  for (let i = 1; i <= 30; i++) {
    executar(auth.middleware, reqFalso({ method: 'PUT', path: `/api/musicas/${i}` }));
  }
  assert.equal(eventos.length, 1);
});

test('IP, método e classe diferentes geram eventos diferentes', () => {
  const { auth, eventos } = novo();
  executar(auth.middleware, reqFalso({ ip: '10.0.0.1' }));
  executar(auth.middleware, reqFalso({ ip: '10.0.0.2' }));
  executar(auth.middleware, reqFalso({ ip: '10.0.0.2', method: 'POST' }));
  assert.equal(eventos.length, 3);
});

test('limite de registros: passado o teto, nada novo é registrado e a requisição segue', () => {
  const { auth, eventos } = novo({ extra: { maxRegistros: 5 } });
  let ultimo;
  for (let i = 0; i < 20; i++) {
    ultimo = executar(auth.middleware, reqFalso({ ip: `10.0.0.${i}` }));
  }
  assert.equal(eventos.length, 5);
  assert.equal(ultimo.seguiu, true);
});

test('o caminho registrado é truncado e a query string não é registrada', () => {
  const { auth, eventos } = novo();
  executar(auth.middleware, reqFalso({ path: '/api/musicas/buscar', url: '/api/musicas/buscar?q=segredo-na-query&token=abc' }));
  assert.equal(eventos[0].caminho, '/api/musicas/buscar');
  const longo = '/api/' + 'a'.repeat(500);
  const o = novo();
  executar(o.auth.middleware, reqFalso({ path: longo }));
  assert.ok(o.eventos[0].caminho.length <= 130);
});

test('cabeçalhos absurdamente longos não derrubam nem entram no registro inteiros', () => {
  const { auth, eventos } = novo();
  const r = executar(auth.middleware, reqFalso({
    method: 'POST', path: '/api/musicas',
    headers: { 'x-lyra-device': 'd'.repeat(100000), 'x-lyra-secret': 's'.repeat(100000) },
  }));
  assert.equal(r.seguiu, true);
  assert.ok(JSON.stringify(eventos).length < 2000);
});

/* ───────────── rotas restritas à própria máquina ───────────── */

test('loopback-estrito vindo de fora da máquina é registrado como "nao-loopback"', () => {
  const { auth, eventos } = novo();
  const r = executar(auth.middleware, reqFalso({ method: 'POST', path: '/api/apresentacao/midia/importar', ip: '192.168.0.50' }));
  assert.equal(r.seguiu, true, 'a Fase A não bloqueia (a guarda da própria rota é que recusa)');
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].politica, 'loopback-estrito');
  assert.equal(eventos[0].classe, 'nao-loopback');
});

test('loopback-estrito vindo do loopback sem proxy não gera registro', () => {
  const { auth, eventos } = novo();
  executar(auth.middleware, reqFalso({ method: 'POST', path: '/api/apresentacao/midia/importar', ip: '127.0.0.1' }));
  executar(auth.middleware, reqFalso({ method: 'POST', path: '/api/controladores/aprovar', ip: '::ffff:127.0.0.1' }));
  assert.equal(eventos.length, 0);
});

test('loopback-estrito que chegou por proxy (V1) é registrado mesmo vindo de 127.0.0.1', () => {
  const { auth, eventos } = novo({ contexto: 'controlador-3001' });
  executar(auth.middleware, reqFalso({
    method: 'POST', path: '/api/apresentacao/midia/importar', ip: '127.0.0.1', headers: { 'x-lyra-proxy': '1' },
  }));
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].classe, 'proxificada-em-rota-local');
  assert.equal(eventos[0].proxificada, true);
  assert.equal(eventos[0].seriaRecusada, true);
});

test('caminho com maiúsculas e codificação não rebaixa a classe (Express ignora maiúsculas)', () => {
  assert.equal(classificarRota('POST', '/API/Comando/Audio_Play'), 'comando');
  assert.equal(classificarRota('POST', '/api/%2e%2e/api/apresentacao/midia/importar'), 'loopback-estrito');
  assert.equal(classificarRota('POST', '/api/Apresentacao/Midia/Importar'), 'loopback-estrito');
});
