'use strict';

/**
 * E1.3 Fase C — C1: `avaliarRota(contexto, metodo, caminho)` e `motivoRecusaFutura`.
 *
 * O módulo só CLASSIFICA e descreve a credencial esperada; não decide nem bloqueia nada. A
 * credencial interprocessos (`X-Lyra-Via`) ainda não existe: ELO e ADM aparecem como «esperada,
 * inexistente», nunca como satisfeita.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const M = require('./manifestoRotas');
const { classificarRota } = require('./autenticacaoHttp');
const { avaliarRota, motivoRecusaFutura, CONTEXTOS } = require('./politicaRotas');

const C = 'controlador-3001';
const S = 'servidor-5510';
const L = 'local-5510';

const CTX_DO_SERVIDOR = { C, S, L };

/** Caminho concreto a partir do caminho do manifesto. */
function concreto(r) {
  if (r.tipo === 'estatico') return '/index.html';
  return r.caminho.replace('{video,midia}', 'video').replace(/:[A-Za-z_]+/g, '1').replace('*', 'x');
}

/* ───────────────────────── resolução ───────────────────────── */

test('contextos: os três existem e um desconhecido não lança — devolve «não encontrada»', () => {
  assert.deepEqual(Object.keys(CONTEXTOS).sort(), [C, L, S].sort());
  const d = avaliarRota('qualquer-coisa', 'GET', '/api/musicas');
  assert.equal(d.encontrada, false);
  assert.equal(d.origem, 'contexto-desconhecido');
  assert.equal(avaliarRota(undefined, 'GET', '/api/x').encontrada, false);
});

test('toda entrada do manifesto é resolvida pelo seu próprio contexto e vira exatamente aquela entrada', () => {
  const erros = [];
  for (const r of M.ROTAS) {
    const ctx = Object.keys(CTX_DO_SERVIDOR).find((k) => k === r.servidor);
    const metodo = r.metodo.split(',')[0];
    const d = avaliarRota(CTX_DO_SERVIDOR[ctx], metodo, concreto(r));
    if (d.id !== r.id) erros.push(`${r.id} ${metodo} ${concreto(r)} → ${d.id}`);
    if (d.encontrada !== true || d.origem !== 'manifesto') erros.push(`${r.id}: origem ${d.origem}`);
  }
  assert.deepEqual(erros, []);
});

test('a decisão repete a classe atual de classificarRota (a classificação existente não é redefinida)', () => {
  for (const r of M.ROTAS.filter((x) => x.tipo === 'rota')) {
    const d = avaliarRota(CTX_DO_SERVIDOR[r.servidor], r.metodo, concreto(r));
    assert.equal(d.classeAtual, classificarRota(r.metodo, concreto(r)), `${r.id}`);
  }
});

test('mesma rota, contexto diferente, política diferente (PUT /api/display-config)', () => {
  const c = avaliarRota(C, 'PUT', '/api/display-config');
  const s = avaliarRota(S, 'PUT', '/api/display-config');
  const l = avaliarRota(L, 'PUT', '/api/display-config');
  assert.deepEqual(c.politica, ['PL', 'ELO']);
  assert.deepEqual(s.politica, ['ESC', 'ELO']);
  assert.deepEqual(l.politica, ['ESC']);
  assert.notEqual(c.id, s.id);
  assert.notEqual(s.id, l.id);
  // no Controlador o painel é o chamador (credencial interna); a dependência do elo é de SAÍDA
  assert.equal(c.esperada.interna, 'exigida');
  assert.equal(c.esperada.interprocessos.esperada, false);
  assert.deepEqual(c.saida.interprocessos, { direcao: 'c→s', existe: false });
  // no Servidor o elo é de ENTRADA (alternativa à credencial de dispositivo); no motor local não há elo
  assert.equal(s.esperada.interprocessos.esperada, true);
  assert.equal(s.esperada.interprocessos.existe, false);
  assert.equal(l.esperada.interprocessos.esperada, false);
  assert.equal(l.saida.interprocessos, null);
});

test('duplicatas S/L: administração da allowlist difere (ADM+LOC no Servidor, LOC no motor local)', () => {
  const s = avaliarRota(S, 'POST', '/api/controladores/aprovar');
  const l = avaliarRota(L, 'POST', '/api/controladores/aprovar');
  assert.deepEqual(s.politica, ['ADM', 'LOC']);
  assert.deepEqual(l.politica, ['LOC']);
  assert.equal(s.guardaPropria, 'ip-loopback-handler');
  assert.equal(l.guardaPropria, 'ip-loopback-middleware');
  assert.equal(s.esperada.loopback, true);
  assert.equal(l.esperada.loopback, true);
  assert.equal(s.esperada.interprocessos.esperada, true);
  assert.equal(l.esperada.interprocessos.esperada, false);
});

test('comandos: Servidor sem guarda, motor local com loopback; os dois exigem CMD (paridade com o bastão fica para a C2)', () => {
  const s = avaliarRota(S, 'POST', '/api/comando/audio_play');
  const l = avaliarRota(L, 'POST', '/api/comando/audio_play');
  assert.deepEqual(s.politica, ['CMD']);
  assert.deepEqual(l.politica, ['CMD']);
  assert.equal(s.guardaPropria, 'nenhuma');
  assert.equal(l.guardaPropria, 'ip-loopback-middleware');
  assert.equal(s.classe, 'comando');
  assert.equal(l.classeAtual, 'comando');
  assert.equal(avaliarRota(C, 'POST', '/api/comando/audio_play').encontrada, false, 'o 3001 não tem comandos');
});

test('aliases: cada caminho alternativo é uma entrada própria, com a mesma política e o vínculo declarado', () => {
  const pares = [
    [['PUT', '/api/musicas/42'], ['POST', '/api/musicas/42/salvar']],
    [['DELETE', '/api/musicas/42'], ['POST', '/api/musicas/42/excluir']],
    [['PATCH', '/api/musicas/42/rotulo'], ['POST', '/api/musicas/42/rotulo']],
  ];
  for (const [a, b] of pares) {
    const da = avaliarRota(C, a[0], a[1]);
    const db = avaliarRota(C, b[0], b[1]);
    assert.notEqual(da.id, db.id);
    assert.deepEqual(da.politica, db.politica);
    assert.ok(da.relacionadas.some((x) => x.id === db.id && x.relacao === 'alias'), `${a.join(' ')} ↔ ${b.join(' ')}`);
  }
  const a = avaliarRota(C, 'GET', '/api/apresentacao/midia/abc');
  const b = avaliarRota(C, 'GET', '/api/apresentacao/video/abc');
  assert.ok(a.relacionadas.some((x) => x.id === b.id && x.relacao === 'caminho-alternativo'));
});

test('especificidade: caminho literal vence o parâmetro, como na ordem de declaração do Express', () => {
  assert.equal(avaliarRota(C, 'GET', '/api/musicas/buscar').id, M.ROTAS.find((r) => r.servidor === 'C' && r.metodo === 'GET' && r.caminho === '/api/musicas/buscar').id);
  assert.equal(avaliarRota(C, 'GET', '/api/musicas/7').id, M.ROTAS.find((r) => r.servidor === 'C' && r.metodo === 'GET' && r.caminho === '/api/musicas/:id').id);
  assert.equal(avaliarRota(C, 'POST', '/api/musicas/importar').id, M.ROTAS.find((r) => r.servidor === 'C' && r.metodo === 'POST' && r.caminho === '/api/musicas/importar').id);
  assert.equal(avaliarRota(C, 'GET', '/api/biblia/livros').id, M.ROTAS.find((r) => r.servidor === 'C' && r.caminho === '/api/biblia/livros').id);
  assert.equal(avaliarRota(C, 'GET', '/api/biblia/ARC/Gn/caps').id, M.ROTAS.find((r) => r.servidor === 'C' && r.caminho === '/api/biblia/:traducao/:livro/caps').id);
  assert.equal(avaliarRota(C, 'POST', '/api/sync/banco/pedido/aceitar').id, M.ROTAS.find((r) => r.servidor === 'C' && r.caminho === '/api/sync/banco/pedido/aceitar').id);
});

test('caminho normalizado: maiúsculas, barra final, query, ponto-ponto e codificação não enganam a avaliação', () => {
  const alvo = avaliarRota(C, 'DELETE', '/api/historico/limpar'.replace('limpar', '5')).id;
  for (const variante of ['/API/HISTORICO/5', '/api/historico/5/', '/api/historico/5?x=1', '/api//historico/5', '/api/historico/./5', '/api/x/../historico/5', '/api/%68istorico/5']) {
    assert.equal(avaliarRota(C, 'DELETE', variante).id, alvo, variante);
  }
});

test('HEAD é tratado como GET; método sem rota não é confundido com outra rota', () => {
  assert.equal(avaliarRota(C, 'HEAD', '/api/musicas').id, avaliarRota(C, 'GET', '/api/musicas').id);
  assert.equal(avaliarRota(C, 'DELETE', '/api/playlists').encontrada, false);
  assert.equal(avaliarRota(S, 'GET', '/api/comando/audio_play').encontrada, false);
});

test('proxies do Servidor: leitura atravessa; outro método é recusado pelo proxy (405) e não vira rota do 3001', () => {
  const get = avaliarRota(S, 'GET', '/api/musicas/12');
  assert.equal(get.tipo, 'proxy');
  assert.equal(get.proxy.atravessa, true);
  assert.deepEqual(get.politica, ['LER', 'ELO']);
  assert.deepEqual(get.saida.interprocessos, { direcao: 's→c', existe: false });
  const post = avaliarRota(S, 'POST', '/api/musicas');
  assert.equal(post.tipo, 'proxy');
  assert.equal(post.proxy.atravessa, false);
  assert.equal(post.proxy.statusDoProxy, 405);
  const midia = avaliarRota(S, 'GET', '/api/apresentacao/midia/x');
  assert.deepEqual(midia.politica, ['PUB', 'ELO']);
  assert.equal(midia.publica, true);
});

test('o 3001 alcançado pelo proxy: rota LER aceita elo de entrada (inexistente) como alternativa; rotas fora das famílias não', () => {
  const alcancada = avaliarRota(C, 'GET', '/api/musicas/12');
  assert.equal(alcancada.alcancavelPorProxy, true);
  assert.equal(alcancada.esperada.interprocessos.esperada, true);
  assert.equal(alcancada.esperada.interprocessos.existe, false);
  assert.deepEqual(alcancada.esperada.interprocessos.alternativaA, ['dispositivo']);
  const fora = avaliarRota(C, 'GET', '/api/playlists');
  assert.equal(fora.alcancavelPorProxy, false);
  assert.equal(fora.esperada.interprocessos.esperada, false);
});

/* ───────────────────────── classes e credenciais esperadas ───────────────────────── */

test('PUB e PUB-LEVE: sem credencial; PEDIDO: sem credencial, com aceite humano', () => {
  for (const [ctx, m, p] of [[S, 'GET', '/api/identity'], [L, 'GET', '/api/estado'], [S, 'GET', '/api/monitores'], [L, 'GET', '/api/display-config'], [C, 'GET', '/api/apresentacao/midia/a'], [C, 'POST', '/api/tom-memoria/webhook-invb'], [S, 'GET', '/obs']]) {
    const d = avaliarRota(ctx, m, p);
    assert.equal(d.publica, true, `${ctx} ${m} ${p}`);
    assert.equal(d.esperada.dispositivo === 'exigida', false);
    assert.equal(d.esperada.interna === 'exigida', false);
  }
  const pedido = avaliarRota(C, 'POST', '/api/sync/banco/pedido');
  assert.deepEqual(pedido.politica, ['PEDIDO']);
  assert.equal(pedido.publica, true);
  assert.equal(pedido.esperada.humano, true);
  assert.equal(pedido.classeAtual, 'escrita', 'hoje a autenticação a trata como escrita');
  assert.equal(pedido.liberariaHoje, false);
  assert.equal(pedido.divergeDaClasseAtual, true, 'pretendida pública, atual exige credencial');
});

test('PUB-LEVE de monitores: pública, divergente da classe atual (leitura) — vai passar a ser liberada', () => {
  const d = avaliarRota(S, 'GET', '/api/monitores');
  assert.deepEqual(d.politica, ['PUB-LEVE']);
  assert.equal(d.classeAtual, 'leitura');
  assert.equal(d.divergeDaClasseAtual, true);
});

test('LER/ESC/CMD: dispositivo exigido; a interna é aceita no Controlador e no motor local, nunca no Servidor', () => {
  const c = avaliarRota(C, 'GET', '/api/playlists');
  assert.equal(c.esperada.dispositivo, 'exigida');
  assert.equal(c.esperada.interna, 'aceita');
  const s = avaliarRota(S, 'PUT', '/api/display-routing');
  assert.equal(s.esperada.dispositivo, 'exigida');
  assert.equal(s.esperada.interna, 'nao');
  const l = avaliarRota(L, 'PUT', '/api/display-routing');
  assert.equal(l.esperada.interna, 'aceita');
});

test('PL: só a credencial interna; dispositivo comum não entra', () => {
  for (const [m, p] of [['GET', '/api/historico'], ['POST', '/api/historico/limpar'], ['GET', '/api/sync/banco/local'], ['DELETE', '/api/musicas/3'], ['PUT', '/api/apresentacao/state']]) {
    const d = avaliarRota(C, m, p);
    assert.ok(d.politica.includes('PL'), `${m} ${p}`);
    assert.equal(d.esperada.interna, 'exigida');
    assert.equal(d.esperada.dispositivo, 'nao');
  }
});

test('leituras sensíveis e escritas destrutivas ficam marcadas', () => {
  assert.equal(avaliarRota(C, 'GET', '/api/sync/banco/local').classe, 'leitura-sensivel');
  assert.equal(avaliarRota(S, 'GET', '/api/sync/banco').classe, 'leitura-sensivel');
  assert.equal(avaliarRota(C, 'GET', '/api/historico').classe, 'leitura-sensivel');
  assert.equal(avaliarRota(C, 'DELETE', '/api/musicas/3').destrutiva, true);
  assert.equal(avaliarRota(C, 'POST', '/api/historico/limpar').destrutiva, true);
  assert.equal(avaliarRota(C, 'POST', '/api/musicas').destrutiva, false);
});

test('administrativas: loopback estrito; as que dependem do elo declaram credencial interprocessos ESPERADA e INEXISTENTE', () => {
  const restart = avaliarRota(S, 'POST', '/api/internal/restart');
  assert.deepEqual(restart.politica, ['ELO', 'LOC']);
  assert.equal(restart.esperada.loopback, true);
  assert.deepEqual(restart.esperada.interprocessos, { esperada: true, existe: false, direcao: 'c→s', alternativaA: [] });
  const dev = avaliarRota(S, 'POST', '/api/open-public-devtools');
  assert.equal(dev.classe, 'administrativa');
  assert.equal(dev.classeAtual, 'escrita', 'para a autenticação geral segue escrita comum (o `impor` geral não está ativo)');
  assert.equal(dev.esperada.loopback, true);
  assert.equal(dev.guardaPropria, 'local-ou-elo', 'Entrega 2: a própria rota exige a própria máquina ou o elo válido');
  const importar = avaliarRota(C, 'POST', '/api/apresentacao/midia/importar');
  assert.deepEqual(importar.politica, ['PL', 'LOC']);
  assert.equal(importar.esperada.interna, 'exigida');
});

test('nenhuma decisão afirma que o elo existe ou foi satisfeito', () => {
  for (const r of M.ROTAS) {
    const d = avaliarRota(CTX_DO_SERVIDOR[r.servidor], r.metodo.split(',')[0], concreto(r));
    assert.equal(d.esperada.interprocessos.existe, false, r.id);
    if (d.saida.interprocessos) assert.equal(d.saida.interprocessos.existe, false, r.id);
  }
});

test('rota sem entrada no manifesto: origem «sem-manifesto», política nula e classe atual preservada', () => {
  const d = avaliarRota(C, 'GET', '/api/rota-que-nao-existe');
  assert.equal(d.encontrada, false);
  assert.equal(d.origem, 'sem-manifesto');
  assert.equal(d.politica, null);
  assert.equal(d.classeAtual, 'leitura');
  const estatico = avaliarRota(C, 'GET', '/css/app.css');
  assert.equal(estatico.tipo, 'estatico');
  assert.equal(estatico.publica, true);
  assert.equal(avaliarRota(C, 'GET', '/api/inexistente').tipo, undefined);
});

test('OPTIONS (preflight): público, origem «preflight»', () => {
  const d = avaliarRota(C, 'OPTIONS', '/api/musicas');
  assert.equal(d.origem, 'preflight');
  assert.equal(d.publica, true);
  assert.equal(d.classeAtual, 'publica');
});

/* ───────────────────────── motivo de uma recusa FUTURA ───────────────────────── */

const apres = (tipo, extra = {}) => ({ tipo, proxificada: false, loopback: true, ...extra });

test('motivoRecusaFutura: rotas públicas nunca seriam recusadas', () => {
  const d = avaliarRota(S, 'GET', '/api/monitores');
  assert.deepEqual(motivoRecusaFutura(d, apres('ausente')), { recusaria: false, motivo: null, credencialInexistente: false });
  const p = avaliarRota(C, 'POST', '/api/sync/banco/pedido');
  assert.equal(motivoRecusaFutura(p, apres('ausente', { loopback: false })).recusaria, false);
});

test('motivoRecusaFutura: LER/ESC/CMD — dispositivo autorizado ou interna (onde aceita) passam; o resto tem motivo', () => {
  const c = avaliarRota(C, 'GET', '/api/playlists');
  assert.equal(motivoRecusaFutura(c, apres('dispositivo-autorizado')).recusaria, false);
  assert.equal(motivoRecusaFutura(c, apres('interna')).recusaria, false);
  for (const tipo of ['ausente', 'dispositivo-desconhecido', 'dispositivo-pendente', 'dispositivo-secret-invalido', 'nao-verificavel']) {
    const m = motivoRecusaFutura(c, apres(tipo));
    assert.equal(m.recusaria, true, tipo);
    assert.match(m.motivo, /^dispositivo:/);
    assert.ok(m.motivo.includes(tipo.replace('dispositivo-', '')) || tipo === 'ausente' || tipo === 'nao-verificavel');
  }
  const s = avaliarRota(S, 'PUT', '/api/display-routing');
  assert.equal(motivoRecusaFutura(s, apres('interna')).recusaria, true, 'o Servidor não conhece a credencial interna');
});

test('motivoRecusaFutura: PL só aceita a interna; dispositivo autorizado seria recusado por ser painel-local', () => {
  const d = avaliarRota(C, 'GET', '/api/historico');
  assert.equal(motivoRecusaFutura(d, apres('interna')).recusaria, false);
  const m = motivoRecusaFutura(d, apres('dispositivo-autorizado'));
  assert.equal(m.recusaria, true);
  assert.match(m.motivo, /^painel-local:/);
  assert.equal(motivoRecusaFutura(d, apres('ausente')).recusaria, true);
});

test('motivoRecusaFutura: LOC exige loopback e ausência de proxy', () => {
  const d = avaliarRota(C, 'POST', '/api/sync/banco/pedido/aceitar');
  assert.equal(motivoRecusaFutura(d, apres('interna')).recusaria, false);
  assert.match(motivoRecusaFutura(d, apres('interna', { loopback: false })).motivo, /loopback/);
  assert.match(motivoRecusaFutura(d, apres('interna', { proxificada: true })).motivo, /proxificada/);
});

test('motivoRecusaFutura: ELO exige credencial interprocessos que AINDA NÃO EXISTE — marca credencialInexistente', () => {
  const restart = avaliarRota(S, 'POST', '/api/internal/restart');
  const m = motivoRecusaFutura(restart, apres('ausente'));
  assert.equal(m.recusaria, true);
  assert.equal(m.credencialInexistente, true);
  assert.match(m.motivo, /interprocessos/);
  // dispositivo autorizado NÃO substitui o elo numa rota só-elo
  assert.equal(motivoRecusaFutura(restart, apres('dispositivo-autorizado')).recusaria, true);
  // em ESC+ELO o dispositivo autorizado é a alternativa
  const cfg = avaliarRota(S, 'PUT', '/api/display-config');
  assert.equal(motivoRecusaFutura(cfg, apres('dispositivo-autorizado')).recusaria, false);
  assert.equal(motivoRecusaFutura(cfg, apres('ausente')).recusaria, true);
});

test('motivoRecusaFutura: rota sem manifesto não decide (nem libera nem recusa)', () => {
  const d = avaliarRota(C, 'GET', '/api/rota-que-nao-existe');
  assert.deepEqual(motivoRecusaFutura(d, apres('ausente')), { recusaria: null, motivo: 'rota-sem-politica', credencialInexistente: false });
});

test('as decisões são dados puros: sem funções, sem segredos e serializáveis', () => {
  const d = avaliarRota(C, 'PUT', '/api/display-config');
  const json = JSON.stringify(d);
  assert.ok(json.length > 100);
  assert.doesNotMatch(json, /secret|segredo|password|senha/i);
  assert.deepEqual(JSON.parse(json), d);
});

test('o módulo é puro: não lê o ambiente, não escreve em disco e só ele importa o manifesto', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, 'politicaRotas.js'), 'utf8');
  assert.doesNotMatch(src, /process\.env|writeFile|appendFile|console\./);
  assert.match(src, /require\('\.\/manifestoRotas'\)/);
});
