'use strict';

/**
 * Original imutável + cópia editável.
 *
 * Regra coberta aqui: toda música cadastrada nasce com **duas** linhas — o
 * ORIGINAL (`is_immutable = 1`, nunca alterado) e uma CÓPIA filha idêntica, que
 * é a versão aberta por padrão no controlador. Músicas antigas, que só têm o
 * original, ganham a cópia na primeira abertura (`garantirCopiaPadraoNoDb`).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Mesmo driver do `db.duplicidade.test.js`: better-sqlite3 com fallback. */
function carregarDriverSqlite() {
  try {
    const BetterSqlite3 = require('better-sqlite3');
    new BetterSqlite3(':memory:').close();
    return BetterSqlite3;
  } catch (_) {
    const { DatabaseSync } = require('node:sqlite');
    return class DatabaseCompat extends DatabaseSync {
      constructor(caminho, opcoes = {}) {
        super(caminho, opcoes.readonly ? { readOnly: true } : {});
      }
    };
  }
}

const Database = carregarDriverSqlite();
const {
  initControllerDatabase,
  getDb,
  inserirMusicaUsuario,
  criarMusicaUsuarioNoDb,
  importarMusicaUsuarioNoDb,
  garantirCopiaPadraoNoDb,
  obterCopiaPadraoDoRoot,
  atualizarMusicaNoDb,
  listarVersoesPorRootId,
  criarVersaoMusicaNoDb,
} = require('./db');

function criarPathsTemporarios() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-copia-'));
  return {
    dir,
    dbPathNew: () => path.join(dir, 'lyra.db'),
    dbPathLegacy: () => path.join(dir, 'legacy.db'),
    dbPathLegacyInvb: () => path.join(dir, 'legacy-invb.db'),
    catalogPath: () => path.join(dir, 'catalog.db'),
    catalogBundledDbPath: () => path.join(dir, 'catalog-bundled.db'),
  };
}

function bancoLimpo() {
  initControllerDatabase(criarPathsTemporarios(), Database);
  getDb().prepare('DELETE FROM musicas').run();
  return getDb();
}

/** Música «antiga»: só o original, sem cópia — como o banco era antes. */
function semearSoOriginal(db, titulo, artista, estrofes = ['Estrofe 1']) {
  const info = db
    .prepare('INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (?, ?, ?, 1)')
    .run(titulo, artista, JSON.stringify(estrofes));
  const id = Number(info.lastInsertRowid);
  db.prepare('UPDATE musicas SET root_id = ?, parent_id = NULL WHERE id = ?').run(id, id);
  return id;
}

test('inserir música cria original imutável e cópia editável', () => {
  const db = bancoLimpo();
  const r = inserirMusicaUsuario('Grande é o Senhor', 'Ministério', ['Estrofe A', 'Estrofe B']);

  assert.strictEqual(r.ok, true);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c, 2);

  const original = db.prepare('SELECT * FROM musicas WHERE id = ?').get(r.id);
  assert.strictEqual(original.is_immutable, 1);
  assert.strictEqual(original.parent_id, null);
  assert.strictEqual(Number(original.root_id), Number(r.id));

  assert.ok(Number.isFinite(Number(r.copiaId)), 'deveria devolver o id da cópia');
  const copia = db.prepare('SELECT * FROM musicas WHERE id = ?').get(r.copiaId);
  assert.strictEqual(copia.is_immutable, 0);
  assert.strictEqual(Number(copia.parent_id), Number(r.id));
  assert.strictEqual(Number(copia.root_id), Number(r.id));
  assert.strictEqual(copia.rotulo, 'CÓPIA');
  // Conteúdo idêntico ao do original no momento do cadastro.
  assert.strictEqual(copia.titulo, original.titulo);
  assert.strictEqual(copia.artista, original.artista);
  assert.strictEqual(copia.estrofes, original.estrofes);
});

test('cadastro manual e importação também nascem com a cópia', () => {
  bancoLimpo();
  const manual = criarMusicaUsuarioNoDb('Nova Manual', 'Autor', ['Letra'], {
    aoDuplicar: 'perguntar',
  });
  assert.strictEqual(manual.ok, true);
  assert.ok(Number.isFinite(Number(manual.copiaId)));

  const importada = importarMusicaUsuarioNoDb('Nova Importada', 'Autor', ['Letra'], {
    aoDuplicar: 'perguntar',
  });
  assert.strictEqual(importada.ok, true);
  assert.ok(Number.isFinite(Number(importada.copiaId)));
  assert.notStrictEqual(Number(importada.copiaId), Number(importada.id));
});

test('a lista do banco continua mostrando só os originais', () => {
  const db = bancoLimpo();
  inserirMusicaUsuario('Uma', 'A', ['x']);
  inserirMusicaUsuario('Outra', 'B', ['y']);
  const originais = db.prepare('SELECT id FROM musicas WHERE parent_id IS NULL').all();
  assert.strictEqual(originais.length, 2);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c, 4);
});

test('garantirCopiaPadraoNoDb cria a cópia de músicas antigas na primeira abertura', () => {
  const db = bancoLimpo();
  const id = semearSoOriginal(db, 'Antiga', 'Autor', ['Verso 1', 'Verso 2']);
  assert.strictEqual(obterCopiaPadraoDoRoot(id), null);

  const r = garantirCopiaPadraoNoDb(id);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.criada, true);
  assert.strictEqual(r.rootId, id);
  assert.notStrictEqual(r.id, id);

  const copia = db.prepare('SELECT * FROM musicas WHERE id = ?').get(r.id);
  assert.strictEqual(copia.is_immutable, 0);
  assert.strictEqual(Number(copia.parent_id), id);
  assert.deepStrictEqual(JSON.parse(copia.estrofes), ['Verso 1', 'Verso 2']);

  // O original não foi tocado.
  const original = db.prepare('SELECT * FROM musicas WHERE id = ?').get(id);
  assert.strictEqual(original.is_immutable, 1);
  assert.deepStrictEqual(JSON.parse(original.estrofes), ['Verso 1', 'Verso 2']);
});

test('garantirCopiaPadraoNoDb é idempotente e não duplica cópias', () => {
  const db = bancoLimpo();
  const ins = inserirMusicaUsuario('Uma', 'A', ['x']);

  const a = garantirCopiaPadraoNoDb(ins.id);
  const b = garantirCopiaPadraoNoDb(ins.id);
  assert.strictEqual(a.criada, false);
  assert.strictEqual(b.criada, false);
  assert.strictEqual(a.id, Number(ins.copiaId));
  assert.strictEqual(b.id, Number(ins.copiaId));
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c, 2);
});

test('pedir a cópia padrão a partir de uma cópia devolve ela mesma', () => {
  bancoLimpo();
  const ins = inserirMusicaUsuario('Uma', 'A', ['x']);
  const nomeada = criarVersaoMusicaNoDb(ins.copiaId, 'AO VIVO');
  assert.strictEqual(nomeada.ok, true);

  const r = garantirCopiaPadraoNoDb(nomeada.id);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.criada, false);
  assert.strictEqual(r.id, Number(nomeada.id));
});

test('a cópia padrão continua sendo a mais antiga depois de novas versões', () => {
  bancoLimpo();
  const ins = inserirMusicaUsuario('Uma', 'A', ['x']);
  criarVersaoMusicaNoDb(ins.id, 'AO VIVO');
  criarVersaoMusicaNoDb(ins.id, 'ACÚSTICO');
  assert.strictEqual(Number(obterCopiaPadraoDoRoot(ins.id).id), Number(ins.copiaId));
});

test('editar a cópia não altera o original nem cria fork', () => {
  const db = bancoLimpo();
  const ins = inserirMusicaUsuario('Uma', 'A', ['original']);

  const r = atualizarMusicaNoDb(ins.copiaId, 'Uma editada', 'A', ['editado']);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.forked, false);
  assert.strictEqual(Number(r.id), Number(ins.copiaId));

  const original = db.prepare('SELECT * FROM musicas WHERE id = ?').get(ins.id);
  assert.strictEqual(original.titulo, 'Uma');
  assert.deepStrictEqual(JSON.parse(original.estrofes), ['original']);

  const copia = db.prepare('SELECT * FROM musicas WHERE id = ?').get(ins.copiaId);
  assert.strictEqual(copia.titulo, 'Uma editada');
  assert.deepStrictEqual(JSON.parse(copia.estrofes), ['editado']);

  // Nenhuma linha nova: a edição caiu na cópia que já existia.
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c, 2);
});

test('apagar o original remove a família inteira, cópia incluída', () => {
  const db = bancoLimpo();
  const ins = inserirMusicaUsuario('Uma', 'A', ['x']);
  const { apagarMusicaUsuarioNoDb } = require('./db');
  const r = apagarMusicaUsuarioNoDb(ins.id);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cascade, true);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c, 0);
});

test('listarVersoesPorRootId traz original e cópia da música recém-criada', () => {
  bancoLimpo();
  const ins = inserirMusicaUsuario('Uma', 'A', ['x']);
  const versoes = listarVersoesPorRootId(ins.id);
  assert.strictEqual(versoes.length, 2);
  assert.strictEqual(versoes[0].is_immutable, 1);
  assert.strictEqual(versoes[1].is_immutable, 0);
  assert.strictEqual(versoes[1].rotulo, 'CÓPIA');
});

test('garantirCopiaPadraoNoDb rejeita id inexistente ou inválido', () => {
  bancoLimpo();
  assert.strictEqual(garantirCopiaPadraoNoDb('abc').erro, 'id inválido');
  assert.strictEqual(garantirCopiaPadraoNoDb(9999).erro, 'Não encontrado');
});
