/**
 * SQL do histórico de projeção.
 *
 * Extraído de `db.js` sem mudar o contrato: o HTTP e `lib/historicoProjecao`
 * continuam a importar as mesmas funções via `require('../db')`.
 *
 * Quase tudo está desnormalizado de propósito: o histórico é registo do
 * passado, e o passado não pode mudar porque alguém apagou uma música ou
 * renomeou um culto. Por isso também não há chaves estrangeiras.
 */

'use strict';

function getDb() {
  return require('../db').getDb();
}

function initHistoricoProjecaoDB() {
  getDb().exec(`
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
  const info = getDb()
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
  return getDb()
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
  return getDb().prepare('DELETE FROM historico_projecao WHERE id = ?').run(n).changes > 0;
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
  return getDb()
    .prepare('DELETE FROM historico_projecao WHERE projetado_em >= ? AND projetado_em <= ?')
    .run(d, a).changes;
}

module.exports = {
  initHistoricoProjecaoDB,
  rowHistoricoParaJson,
  inserirHistoricoProjecaoNoDb,
  listarHistoricoProjecaoNoDb,
  apagarHistoricoProjecaoNoDb,
  apagarHistoricoProjecaoPorPeriodoNoDb,
};
