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

function inserirMusicasExemplo() {
  const insert = db.prepare(
    'INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (?, ?, ?, 1)'
  );
  const r1 = insert.run('Grande é o Senhor', 'Ministério Ipiranga', JSON.stringify([
    'Grande é o Senhor\nE mui digno de louvor\nNa cidade do nosso Deus\nNo seu santo monte',
    'Belo em sua altitude\nA alegria de toda a terra\nO monte Sião, pelos lados do norte\nA cidade do grande Rei',
    'Grande é o Senhor\nGrande é o Senhor\nGrande é o Senhor\nÉ digno de louvor',
  ]));
  musicasDb.finalizarMusicaOriginalAposInsert(r1.lastInsertRowid);
  const r2 = insert.run('Quão Grande és Tu', 'Hino Clássico', JSON.stringify([
    'Senhor meu Deus\nQuando eu, maravilhado\nContemple os mundos que as tuas mãos criou\nAs mil estrelas que puseste no espaço\nO universo todo que ordenou',
    'Então minh\'alma canta a ti, Senhor\nQuão grande és tu, quão grande és tu\nEntão minh\'alma canta a ti, Senhor\nQuão grande és tu, quão grande és tu',
  ]));
  musicasDb.finalizarMusicaOriginalAposInsert(r2.lastInsertRowid);
  const r3 = insert.run('Maravilhosa Graça', '', JSON.stringify([
    'Maravilhosa graça\nDo meu Salvador\nGraça que excede\nMeu maior pecado e culpa',
    'Louvado seja Jesus\nQue comprou a minha paz\nNa cruz pagou minha dívida\nE livre me fez',
  ]));
  musicasDb.finalizarMusicaOriginalAposInsert(r3.lastInsertRowid);
}

function initBibliaSqliteDatabases(paths, Database) {
  closeBibliaDbs();
  if (typeof paths.bibliaSqlitePath !== 'function') return;
  for (const traducao of BIBLIA_TRADUCOES_SUPORTADAS) {
    const dbPath = paths.bibliaSqlitePath(traducao);
    if (!dbPath || !fs.existsSync(dbPath)) continue;
    try {
      bibliaDbs.set(traducao, new Database(dbPath, { readonly: true }));
    } catch (_) {
  // intencional — erro ignorado
}
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

/**
 * Histórico do que foi projetado.
 *
 * ## Porque é que quase tudo está desnormalizado
 *
 * Título, artista, tom, ministrante e culto estão gravados por extenso, ao lado dos ids.
 * Não é descuido: o histórico é registo do passado, e o passado não pode mudar porque
 * alguém apagou uma música, renomeou um culto ou corrigiu o nome de um ministrante. Um
 * relatório de direitos autorais que perde as linhas das músicas entretanto apagadas é
 * exactamente o relatório que não serve para prestar contas.
 *
 * Por isso também não há chaves estrangeiras aqui. Apagar uma música tem de deixar o
 * histórico de pé.
 *
 * ## Os índices
 *
 * `projetado_em` serve a consulta que a janela faz sempre — um período. `root_id` mais
 * `banco_fonte` servem o agrupamento do repertório, que junta original e cópias da mesma
 * música.
 */
function initHistoricoProjecaoDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS historico_projecao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      musica_id INTEGER,
      root_id INTEGER,
      banco_fonte TEXT NOT NULL DEFAULT 'user',
      titulo TEXT NOT NULL,
      artista TEXT,
      rotulo TEXT,
      tom TEXT,
      ministrante_id INTEGER,
      ministrante_nome TEXT,
      culto_id TEXT,
      culto_nome TEXT,
      projetado_em INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_historico_projetado_em
      ON historico_projecao(projetado_em);
    CREATE INDEX IF NOT EXISTS idx_historico_raiz
      ON historico_projecao(root_id, banco_fonte);
  `);
}

/** Uma linha do banco no formato que `lib/historicoProjecao.js` conhece. */
function rowHistoricoParaJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    musicaId: row.musica_id != null ? Number(row.musica_id) : null,
    rootId: row.root_id != null ? Number(row.root_id) : null,
    bancoFonte: row.banco_fonte === 'catalog' ? 'catalog' : 'user',
    titulo: String(row.titulo || ''),
    artista: String(row.artista || ''),
    rotulo: String(row.rotulo || ''),
    tom: String(row.tom || ''),
    ministranteId: row.ministrante_id != null ? Number(row.ministrante_id) : null,
    ministranteNome: String(row.ministrante_nome || ''),
    cultoId: String(row.culto_id || ''),
    cultoNome: String(row.culto_nome || ''),
    projetadoEm: Number(row.projetado_em) || 0,
  };
}

/**
 * @param {object} reg Já normalizado por `lib/historicoProjecao.normalizarRegisto`.
 * @returns {number} `id` da linha criada.
 */
function inserirHistoricoProjecaoNoDb(reg) {
  const info = db
    .prepare(
      `INSERT INTO historico_projecao
         (musica_id, root_id, banco_fonte, titulo, artista, rotulo, tom,
          ministrante_id, ministrante_nome, culto_id, culto_nome, projetado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      reg.musicaId,
      reg.rootId,
      reg.bancoFonte,
      reg.titulo,
      reg.artista,
      reg.rotulo,
      reg.tom,
      reg.ministranteId,
      reg.ministranteNome,
      reg.cultoId,
      reg.cultoNome,
      reg.projetadoEm
    );
  return Number(info.lastInsertRowid);
}

/**
 * @param {{ de?: number, ate?: number, limite?: number }} [filtro]
 * @returns {object[]} Mais recentes primeiro.
 */
function listarHistoricoProjecaoNoDb(filtro = {}) {
  const de = Number.isFinite(Number(filtro.de)) ? Number(filtro.de) : 0;
  const ate = Number.isFinite(Number(filtro.ate)) ? Number(filtro.ate) : Number.MAX_SAFE_INTEGER;
  /* Tecto alto em vez de nenhum: a janela mostra tudo o que couber, mas uma consulta sem
     limite num histórico de anos bloquearia o painel enquanto carrega. */
  const limite = Math.min(Math.max(1, Number(filtro.limite) || 5000), 20000);
  return db
    .prepare(
      `SELECT * FROM historico_projecao
        WHERE projetado_em >= ? AND projetado_em <= ?
        ORDER BY projetado_em DESC, id DESC
        LIMIT ?`
    )
    .all(de, ate, limite)
    .map(rowHistoricoParaJson);
}

/** @param {number} id */
function apagarHistoricoProjecaoNoDb(id) {
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) return false;
  return db.prepare('DELETE FROM historico_projecao WHERE id = ?').run(n).changes > 0;
}

/**
 * Apaga um período inteiro.
 * @param {number} de
 * @param {number} ate
 * @returns {number} Linhas removidas.
 */
function apagarHistoricoProjecaoPorPeriodoNoDb(de, ate) {
  const d = Number.isFinite(Number(de)) ? Number(de) : 0;
  const a = Number.isFinite(Number(ate)) ? Number(ate) : Number.MAX_SAFE_INTEGER;
  return db
    .prepare('DELETE FROM historico_projecao WHERE projetado_em >= ? AND projetado_em <= ?')
    .run(d, a).changes;
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

function initControllerDatabase(paths, Database) {
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
  initBibliaSqliteDatabases(paths, Database);
  const catalogDbPath = resolveCatalogDatabasePath(paths);
  if (catalogDbPath && fs.existsSync(catalogDbPath)) {
    try {
      catalog = new Database(catalogDbPath, { readonly: true });
      const n = catalog.prepare('SELECT COUNT(*) AS c FROM musicas').get();
      console.log('[Lyra] Catálogo offline carregado:', catalogDbPath, `(${n?.c ?? 0} músicas)`);
    } catch (e) {
      catalog = null;
      console.error('[Lyra] Não foi possível abrir catalog.db:', e.message);
    }
  } else {
    const bundled = paths.catalogBundledDbPath?.();
    console.warn(
      '[Lyra] catalog.db não encontrado.',
      bundled ? `Esperado em: ${bundled}` : '',
      'Rode: node tools/gerar-catalog.js'
    );
  }

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
      rotulo TEXT
    );
  `);

  musicasDb.migrarMusicasImutabilidade();

  const count = db.prepare('SELECT COUNT(*) as c FROM musicas').get();
  if (count.c === 0) inserirMusicasExemplo();

  initApresentacoesDB();
  ministrantesDb.initMinistrantesETomMemoriaDB();
  initHistoricoProjecaoDB();
  musicasDb.migrarRotuloCopiaCapitalizacao();
  ministrantesDb.migrarMinistranteCrisMedeirosParaCris(paths?.playlistsJsonPath);
  ministrantesDb.migrarMinistrantesAgrupadosDoSite(paths?.playlistsJsonPath);
}


module.exports = {
  ...musicasDb,
  ...ministrantesDb,
  inserirHistoricoProjecaoNoDb,
  listarHistoricoProjecaoNoDb,
  apagarHistoricoProjecaoNoDb,
  apagarHistoricoProjecaoPorPeriodoNoDb,
  rowHistoricoParaJson,
  initControllerDatabase,
  getDb,
  getCatalog,
  getBibliaDb,
  getBibliaTraducoesDisponiveis,
};
