'use strict';

const fs = require('fs');
const path = require('path');
let db;
let catalog = null;
let bibliaDbs = new Map();
const BIBLIA_TRADUCOES_SUPORTADAS = ['ACF', 'ARA', 'ARC', 'NAA', 'NTLH', 'NVI'];

function getDb() {
  return db;
}

function getCatalog() {
  return catalog;
}

module.exports.getDb = getDb;
module.exports.getCatalog = getCatalog;
const musicasDb = require('./db/musicas');
const ministrantesDb = require('./db/ministrantes');
const historicoDb = require('./db/historico');

function getBibliaDb(traducao) {
  const codigo = String(traducao || '').trim().toUpperCase();
  return codigo ? bibliaDbs.get(codigo) || null : null;
}

function getBibliaTraducoesDisponiveis() {
  return [...bibliaDbs.keys()].sort();
}

function closeBibliaDbs() {
  for (const dbBiblia of bibliaDbs.values()) {
    try { dbBiblia.close(); } catch (_) {
  // intencional — erro ignorado
}
  }
  bibliaDbs = new Map();
}

/** Devolve 'ok' | 'ausente' | 'erro' (o chamador decide se avisa; a falha continua não-fatal). */
function abrirBibliaTraducao(paths, Database, traducao) {
  if (typeof paths.bibliaSqlitePath !== 'function') return 'ausente';
  const dbPath = paths.bibliaSqlitePath(traducao);
  if (!dbPath || !fs.existsSync(dbPath)) return 'ausente';
  try {
    bibliaDbs.set(traducao, new Database(dbPath, { readonly: true }));
    return 'ok';
  } catch (_) {
    return 'erro';
  }
}

function initBibliaSqliteDatabases(paths, Database) {
  closeBibliaDbs();
  if (typeof paths.bibliaSqlitePath !== 'function') return;
  for (const traducao of BIBLIA_TRADUCOES_SUPORTADAS) {
    abrirBibliaTraducao(paths, Database, traducao);
  }
}

/** Catálogo empacotado (`data/catalog/catalog.db`) tem prioridade sobre AppData legado. */
function resolveCatalogDatabasePath(paths) {
  const candidates = [
    paths.catalogBundledDbPath?.(),
    path.resolve(__dirname, '../../data/catalog/catalog.db'),
    path.resolve(__dirname, '../../tools/catalog.db'),
    paths.catalogPath(),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return paths.catalogBundledDbPath?.() || paths.catalogPath();
}

function initApresentacoesDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS apresentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      descricao TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apresentacao_id INTEGER NOT NULL,
      ordem INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      conteudo TEXT NOT NULL,
      FOREIGN KEY (apresentacao_id) REFERENCES apresentacoes(id) ON DELETE CASCADE
    );
  `);
}

/**
 * @param {object} paths Objeto de caminhos (`createUserPaths`).
 * @param {typeof import('better-sqlite3')} Database
 */
/**
 * Modo de escrita do SQLite — WAL.
 *
 * No modo `delete` (o padrão, e o que este banco usava), cada COMMIT cria e apaga um
 * ficheiro de journal e paga um `fsync` por isso. Importar 10 músicas são ~40 desses
 * ciclos: 316 ms medidos num SSD, e bastante pior num disco mecânico — que é o que os
 * PCs de culto costumam ter. Com WAL a mesma importação cai para poucos milissegundos.
 *
 * `synchronous = NORMAL` é o par natural do WAL: deixa de sincronizar a cada COMMIT e
 * sincroniza no checkpoint. O que se aceita é perder as últimas transacções se a máquina
 * perder energia no instante exacto — o banco não corrompe. Para um repertório de
 * músicas, troca óbvia.
 *
 * O modo fica gravado no próprio ficheiro; declarar sempre é inofensivo e cobre os
 * bancos que vêm de versões anteriores.
 */
function aplicarPragmasDesempenho(conexao) {
  try {
    conexao.pragma('journal_mode = WAL');
    conexao.pragma('synchronous = NORMAL');
  } catch (e) {
    console.warn('[Lyra] PRAGMAs de desempenho não aplicados:', e && e.message);
  }
}

/** Fase 1 — abre o banco principal (copia o legado se preciso) e fecha o catálogo anterior. */
function abrirBancoPrincipal(paths, Database) {
  const dbPathNew = paths.dbPathNew();
  const dbPathLegacyInvb = paths.dbPathLegacyInvb?.();
  const dbPathLegacy = paths.dbPathLegacy();
  if (!fs.existsSync(dbPathNew)) {
    if (dbPathLegacyInvb && fs.existsSync(dbPathLegacyInvb)) {
      try { fs.copyFileSync(dbPathLegacyInvb, dbPathNew); } catch (_) {
  // intencional — erro ignorado
}
    } else if (fs.existsSync(dbPathLegacy)) {
      try { fs.copyFileSync(dbPathLegacy, dbPathNew); } catch (_) {
  // intencional — erro ignorado
}
    }
  }

  db = new Database(dbPathNew);
  aplicarPragmasDesempenho(db);
  if (catalog) { try { catalog.close(); } catch (_) {
  // intencional — erro ignorado
} catalog = null; }
}

/** Fase 3 — catálogo offline (já tem fallback: sem ele o app segue). */
function abrirCatalogoOffline(paths, Database) {
  const catalogDbPath = resolveCatalogDatabasePath(paths);
  if (catalogDbPath && fs.existsSync(catalogDbPath)) {
    try {
      catalog = new Database(catalogDbPath, { readonly: true });
      const n = catalog.prepare('SELECT COUNT(*) AS c FROM musicas').get();
      console.log('[Lyra] Catálogo offline carregado:', catalogDbPath, `(${n?.c ?? 0} músicas)`);
      return 'ok';
    } catch (e) {
      catalog = null;
      console.error('[Lyra] Não foi possível abrir catalog.db:', e.message);
      return 'erro';
    }
  } else {
    const bundled = paths.catalogBundledDbPath?.();
    console.warn(
      '[Lyra] catalog.db não encontrado.',
      bundled ? `Esperado em: ${bundled}` : '',
      'Rode: node tools/gerar-catalog.js'
    );
    return 'ausente';
  }
}

/** Fase 4 — tabelas e migrações. */
function criarEstruturaBanco(paths) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS musicas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      artista TEXT,
      estrofes TEXT NOT NULL,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      parent_id INTEGER,
      root_id INTEGER,
      is_immutable INTEGER NOT NULL DEFAULT 0,
      rotulo TEXT,
      origem_importacao TEXT
    );
  `);

  musicasDb.migrarMusicasImutabilidade();

  // Nota: não há mais seed de músicas de exemplo aqui — bancos novos começam com a
  // tabela `musicas` vazia. (Removido em 2026-09: eram músicas de teste/demonstração
  // que reapareciam sempre que o banco fosse recriado do zero.)

  initApresentacoesDB();
  ministrantesDb.initMinistrantesETomMemoriaDB();
  historicoDb.initHistoricoProjecaoDB();
  musicasDb.migrarRotuloCopiaCapitalizacao();
  ministrantesDb.migrarMinistranteCrisMedeirosParaCris(paths?.playlistsJsonPath);
  ministrantesDb.migrarMinistrantesAgrupadosDoSite(paths?.playlistsJsonPath);
}

function initControllerDatabase(paths, Database) {
  abrirBancoPrincipal(paths, Database);
  initBibliaSqliteDatabases(paths, Database);
  abrirCatalogoOffline(paths, Database);
  criarEstruturaBanco(paths);
}


module.exports = {
  ...musicasDb,
  ...ministrantesDb,
  ...historicoDb,
  initControllerDatabase,
  /* Fases separadas — usadas pela splash para reportar cada unidade real do boot. */
  abrirBancoPrincipal,
  prepararBibliasSqlite: closeBibliaDbs,
  abrirBibliaTraducao,
  abrirCatalogoOffline,
  criarEstruturaBanco,
  BIBLIA_TRADUCOES_SUPORTADAS,
  getDb,
  getCatalog,
  getBibliaDb,
  getBibliaTraducoesDisponiveis,
};
