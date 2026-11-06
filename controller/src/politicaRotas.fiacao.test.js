'use strict';

/**
 * E1.3 Fase C — C1: fiação (leitura de código-fonte). Os três servidores registram as decisões de
 * política, continuam em `registrar`, e só o módulo de política importa o manifesto.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const SERVIDORES = [
  ['server/src/httpServer.js', 'servidor-5510', /registrarDecisao:\s*\(info\)\s*=>\s*console\.warn\(`\[Lyra\]\[politica-http\]/],
  ['controller/src/httpControllerServer.js', 'controlador-3001', /registrarDecisao:\s*\(info\)\s*=>\s*console\.warn\(`\[Lyra\]\[politica-http:\$\{HTTP_CONTROLLER_PORT\}\]/],
  ['controller/src/projecaoLocal.js', 'local-5510', /registrarDecisao:\s*\(info\)\s*=>\s*registarNoDiario\('politica-http', info\)/],
];

test('os três servidores registram decisões de política com o contexto certo e seguem em «registrar»', () => {
  for (const [rel, contexto, re] of SERVIDORES) {
    const src = ler(rel);
    assert.match(src, re, rel);
    assert.ok(src.includes(`contexto: '${contexto}'`), `${rel}: contexto ${contexto}`);
    assert.match(src, /modo\s*:\s*['"]registrar['"]/, rel);
    assert.doesNotMatch(src, /modo\s*:\s*['"]impor['"]/, `${rel} não pode ligar «impor»`);
    assert.doesNotMatch(src, /process\.env\.LYRA_(AUTH|MODO)/, `${rel} não lê o modo do ambiente`);
  }
});

test('a decisão de «impor» continua vindo de classificarRota: o middleware não usa a política para decidir', () => {
  const src = ler('packages/projection-core/src/autenticacaoHttp.js');
  const inicio = src.indexOf('function middleware(');
  const corpo = src.slice(inicio, src.indexOf('/** Contagem acumulada', inicio));
  assert.match(corpo, /classificarRota\(req\.method/);
  assert.match(corpo, /observarPolitica\(req\)/);
  // a observação roda em try/catch e antes de qualquer retorno; o resultado dela não entra na decisão
  assert.match(corpo, /try\s*\{\s*observarPolitica\(req\);\s*\}\s*catch/);
  const decisao = corpo.slice(corpo.indexOf('let decisao'));
  assert.doesNotMatch(decisao, /politica\.|avaliarRota|motivoRecusaFutura/, 'a decisão não consulta a política');
});

test('só o módulo de política importa o manifesto; nenhum cliente, servidor ou handler o lê', () => {
  const dirs = ['server/src', 'controller/src', 'packages/projection-core/src'];
  const importadores = [];
  const varrer = (dir) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) varrer(rel);
      else if (/\.js$/.test(e.name) && !/\.test\.js$/.test(e.name) && !e.name.endsWith('manifestoRotas.js') && /manifestoRotas/.test(ler(rel))) importadores.push(rel);
    }
  };
  dirs.forEach(varrer);
  assert.deepEqual(importadores, ['packages/projection-core/src/politicaRotas.js']);
});

test('o registro de decisões não escreve segredos nem cabeçalhos: o evento só carrega campos controlados', () => {
  const src = ler('packages/projection-core/src/autenticacaoHttp.js');
  const evento = src.slice(src.indexOf("evento: 'politica-http'"), src.indexOf('registrarDecisaoFn(evento)'));
  assert.doesNotMatch(evento, /headers|secret|authorization|cookie|req\.body/i);
  assert.match(evento, /deviceId,/);
});
