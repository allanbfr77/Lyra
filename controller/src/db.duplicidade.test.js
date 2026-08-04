'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Driver SQLite para o teste: usa `better-sqlite3` (o mesmo do app) quando o
 * binário nativo carrega e cai para o `node:sqlite` embutido caso contrário —
 * o binário do better-sqlite3 é compilado por plataforma e nem sempre está
 * disponível no ambiente onde os testes rodam.
 */
function carregarDriverSqlite() {
  try {
    const BetterSqlite3 = require('better-sqlite3');
    // O binding nativo só é carregado ao abrir um banco — testar aqui.
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
  normalizarChaveComparacao,
  normalizarArtistaComparacao,
  encontrarMusicaUsuarioDuplicada,
  importarMusicaUsuarioNoDb,
  criarMusicaUsuarioNoDb,
  substituirMusicaUsuarioNoDb,
} = require('./db');

/** Paths mínimos exigidos por `initControllerDatabase`, apontando para tmp. */
function criarPathsTemporarios() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-dup-'));
  return {
    dir,
    dbPathNew: () => path.join(dir, 'lyra.db'),
    dbPathLegacy: () => path.join(dir, 'legacy.db'),
    dbPathLegacyInvb: () => path.join(dir, 'legacy-invb.db'),
    catalogPath: () => path.join(dir, 'catalog.db'),
    catalogBundledDbPath: () => path.join(dir, 'catalog-bundled.db'),
  };
}

/** Banco limpo, sem as músicas de exemplo, para cada cenário. */
function bancoLimpo() {
  initControllerDatabase(criarPathsTemporarios(), Database);
  getDb().prepare('DELETE FROM musicas').run();
  return getDb();
}

function semear(db, titulo, artista) {
  const info = db
    .prepare('INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (?, ?, ?, 1)')
    .run(titulo, artista, JSON.stringify(['Estrofe 1']));
  const id = Number(info.lastInsertRowid);
  db.prepare('UPDATE musicas SET root_id = ?, parent_id = NULL WHERE id = ?').run(id, id);
  return id;
}

test('normalização remove acentos, caixa, pontuação e espaços extras', () => {
  assert.strictEqual(normalizarChaveComparacao('Paulo César Baruk'), 'paulo cesar baruk');
  assert.strictEqual(normalizarChaveComparacao('  CLAMO   JESUS!  '), 'clamo jesus');
  assert.strictEqual(normalizarChaveComparacao('Ó, Quão Bom!'), 'o quao bom');
  assert.strictEqual(
    normalizarChaveComparacao('Clamo a Jesus'),
    normalizarChaveComparacao('clamo   a  jesus...')
  );
  assert.strictEqual(normalizarChaveComparacao(null), '');
});

test('normalização mantém músicas realmente diferentes separadas', () => {
  assert.notStrictEqual(
    normalizarChaveComparacao('Clamo Jesus'),
    normalizarChaveComparacao('Clamo a Jesus')
  );
});

test('artista ignora participações no fim do nome', () => {
  assert.strictEqual(normalizarArtistaComparacao('Paulo César Baruk feat. Fernandinho'), 'paulo cesar baruk');
  assert.strictEqual(normalizarArtistaComparacao('Baruk ft Nívea'), 'baruk');
  assert.strictEqual(normalizarArtistaComparacao('Baruk part. Ana'), 'baruk');
  // "feat" no meio do nome não deve truncar nada indevidamente.
  assert.strictEqual(normalizarArtistaComparacao('Fernandinho'), 'fernandinho');
});

test('detecta duplicidade apesar de acento e pontuação diferentes', () => {
  const db = bancoLimpo();
  const id = semear(db, 'Clamo Jesus', 'Paulo César Baruk');
  const dup = encontrarMusicaUsuarioDuplicada('clamo jesus!', 'Paulo Cesar Baruk');
  assert.ok(dup, 'deveria reconhecer a música existente');
  assert.strictEqual(dup.id, id);
  assert.strictEqual(dup.motivo, 'titulo-artista');
});

test('título igual com artista ausente de um dos lados vira candidato', () => {
  const db = bancoLimpo();
  const id = semear(db, 'Clamo Jesus', '');
  const dup = encontrarMusicaUsuarioDuplicada('Clamo Jesus', 'Paulo César Baruk');
  assert.ok(dup);
  assert.strictEqual(dup.id, id);
  assert.strictEqual(dup.motivo, 'titulo');
});

test('artista realmente diferente não é considerado duplicata', () => {
  const db = bancoLimpo();
  semear(db, 'Clamo Jesus', 'Paulo César Baruk');
  assert.strictEqual(encontrarMusicaUsuarioDuplicada('Clamo Jesus', 'Fernandinho'), null);
});

test('importação com aoDuplicar=perguntar não grava nada', () => {
  const db = bancoLimpo();
  semear(db, 'Clamo Jesus', 'Paulo César Baruk');
  const antes = db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c;

  const r = importarMusicaUsuarioNoDb('Clamo Jesus', 'Paulo Cesar Baruk', ['Nova letra'], {
    aoDuplicar: 'perguntar',
  });

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.duplicado, true);
  assert.ok(r.existente && r.existente.id);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c, antes);
});

test('importação com aoDuplicar=copiar preserva o comportamento do celular', () => {
  const db = bancoLimpo();
  const id = semear(db, 'Clamo Jesus', 'Paulo César Baruk');

  const r = importarMusicaUsuarioNoDb('Clamo Jesus', 'Paulo Cesar Baruk', ['Nova letra'], {
    aoDuplicar: 'copiar',
  });

  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.copyImportada, true);
  assert.strictEqual(r.rootId, id);
  const nova = db.prepare('SELECT * FROM musicas WHERE id = ?').get(r.id);
  assert.strictEqual(nova.parent_id, id);
  assert.strictEqual(nova.is_immutable, 0);
  assert.strictEqual(nova.rotulo, 'CÓPIA/IMPORTADA');
  // O original segue intacto.
  const original = db.prepare('SELECT * FROM musicas WHERE id = ?').get(id);
  assert.strictEqual(original.is_immutable, 1);
});

test('importação sem duplicata cria original independente', () => {
  bancoLimpo();
  const r = importarMusicaUsuarioNoDb('Música Inédita', 'Alguém', ['Letra'], {
    aoDuplicar: 'perguntar',
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.copyImportada, false);
  assert.strictEqual(r.rootId, r.id);
});

test('cadastro manual passa pela mesma checagem de duplicidade', () => {
  const db = bancoLimpo();
  semear(db, 'Clamo Jesus', 'Paulo César Baruk');
  const antes = db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c;

  const r = criarMusicaUsuarioNoDb('clamo jesus', 'paulo cesar baruk', ['Letra digitada'], {
    aoDuplicar: 'perguntar',
  });

  assert.strictEqual(r.duplicado, true);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c, antes);
});

test('cadastro manual forçado grava como versão rotulada CÓPIA/MANUAL', () => {
  const db = bancoLimpo();
  const id = semear(db, 'Clamo Jesus', 'Paulo César Baruk');

  const r = criarMusicaUsuarioNoDb('Clamo Jesus', 'Paulo Cesar Baruk', ['Letra digitada'], {
    aoDuplicar: 'copiar',
  });

  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.copyImportada, true);
  const nova = db.prepare('SELECT * FROM musicas WHERE id = ?').get(r.id);
  assert.strictEqual(nova.parent_id, id);
  assert.strictEqual(nova.rotulo, 'CÓPIA/MANUAL');
});

test('cadastro manual sem duplicata cria original imutável', () => {
  const db = bancoLimpo();
  const r = criarMusicaUsuarioNoDb('Outra Música', 'Outro Artista', ['Letra'], {
    aoDuplicar: 'perguntar',
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.copyImportada, false);
  const row = db.prepare('SELECT * FROM musicas WHERE id = ?').get(r.id);
  assert.strictEqual(row.is_immutable, 1);
  assert.strictEqual(row.parent_id, null);
});

test('duplicata detectada devolve as estrofes da música atual', () => {
  const db = bancoLimpo();
  const id = semear(db, 'Clamo Jesus', 'Paulo César Baruk');
  db.prepare('UPDATE musicas SET estrofes = ? WHERE id = ?').run(
    JSON.stringify(['Bloco A', 'Bloco B']),
    id
  );

  const dup = encontrarMusicaUsuarioDuplicada('Clamo Jesus', 'Paulo Cesar Baruk');
  assert.deepStrictEqual(dup.estrofes, ['Bloco A', 'Bloco B']);
});

test('substituir sobrescreve o original preservando id e root_id', () => {
  const db = bancoLimpo();
  const id = semear(db, 'Clamo Jesus', 'Paulo César Baruk');
  const antes = db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c;

  const r = substituirMusicaUsuarioNoDb(id, 'Clamo Jesus', 'Paulo Cesar Baruk', ['Letra nova']);

  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.id, id);
  assert.strictEqual(r.rootId, id);
  assert.strictEqual(r.substituida, true);
  assert.strictEqual(r.copyImportada, false);
  // Não cria linha nova: a playlist que aponta para este id continua válida.
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS c FROM musicas').get().c, antes);

  const row = db.prepare('SELECT * FROM musicas WHERE id = ?').get(id);
  assert.deepStrictEqual(JSON.parse(row.estrofes), ['Letra nova']);
  assert.strictEqual(row.artista, 'Paulo Cesar Baruk');
  assert.strictEqual(row.is_immutable, 1);
  assert.strictEqual(row.parent_id, null);
});

test('substituir não altera versões filhas já existentes', () => {
  const db = bancoLimpo();
  const id = semear(db, 'Clamo Jesus', 'Paulo César Baruk');
  const fork = importarMusicaUsuarioNoDb('Clamo Jesus', 'Paulo César Baruk', ['Versão do usuário'], {
    aoDuplicar: 'copiar',
  });

  substituirMusicaUsuarioNoDb(id, 'Clamo Jesus', 'Paulo César Baruk', ['Letra recebida']);

  const filha = db.prepare('SELECT * FROM musicas WHERE id = ?').get(fork.id);
  assert.deepStrictEqual(JSON.parse(filha.estrofes), ['Versão do usuário']);
  assert.strictEqual(filha.parent_id, id);
});

test('substituir valida id e entrada', () => {
  const db = bancoLimpo();
  const id = semear(db, 'Clamo Jesus', 'Paulo César Baruk');
  assert.strictEqual(substituirMusicaUsuarioNoDb('abc', 'T', 'A', ['x']).erro, 'id inválido');
  assert.strictEqual(substituirMusicaUsuarioNoDb(999999, 'T', 'A', ['x']).erro, 'Não encontrado');
  assert.strictEqual(
    substituirMusicaUsuarioNoDb(id, 'T', 'A', []).erro,
    'estrofes deve ser um array não vazio'
  );
});

test('entradas inválidas continuam rejeitadas', () => {
  bancoLimpo();
  assert.strictEqual(importarMusicaUsuarioNoDb('', 'A', ['x']).erro, 'titulo obrigatório');
  assert.strictEqual(
    criarMusicaUsuarioNoDb('T', 'A', []).erro,
    'estrofes deve ser um array não vazio'
  );
});
