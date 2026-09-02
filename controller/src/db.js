'use strict';

const fs = require('fs');
const path = require('path');
const {
  normMin,
  resolverMinistranteNoCadastro,
  splitNomesMinistrantes,
  ehNomeMinistranteAgrupado,
} = require('./lib/invbTonsFromSupabase');

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
  finalizarMusicaOriginalAposInsert(r1.lastInsertRowid);
  const r2 = insert.run('Quão Grande és Tu', 'Hino Clássico', JSON.stringify([
    'Senhor meu Deus\nQuando eu, maravilhado\nContemple os mundos que as tuas mãos criou\nAs mil estrelas que puseste no espaço\nO universo todo que ordenou',
    'Então minh\'alma canta a ti, Senhor\nQuão grande és tu, quão grande és tu\nEntão minh\'alma canta a ti, Senhor\nQuão grande és tu, quão grande és tu',
  ]));
  finalizarMusicaOriginalAposInsert(r2.lastInsertRowid);
  const r3 = insert.run('Maravilhosa Graça', '', JSON.stringify([
    'Maravilhosa graça\nDo meu Salvador\nGraça que excede\nMeu maior pecado e culpa',
    'Louvado seja Jesus\nQue comprou a minha paz\nNa cruz pagou minha dívida\nE livre me fez',
  ]));
  finalizarMusicaOriginalAposInsert(r3.lastInsertRowid);
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
 * Cadastro de ministrantes (pessoas) e memória de tom por (ministrante + música).
 * Independente do monitor M3 (`displayConfig.ministrante`).
 */
function initMinistrantesETomMemoriaDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ministrantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL COLLATE NOCASE,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ministrantes_nome
      ON ministrantes(nome COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS tom_memoria (
      ministrante_id INTEGER NOT NULL,
      musica_id INTEGER NOT NULL,
      banco_fonte TEXT NOT NULL DEFAULT 'user',
      tom TEXT NOT NULL,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (ministrante_id, musica_id, banco_fonte),
      FOREIGN KEY (ministrante_id) REFERENCES ministrantes(id) ON DELETE CASCADE
    );
    /* Tons do site ainda sem música no banco — aplicados quando a música for cadastrada. */
    CREATE TABLE IF NOT EXISTS tom_import_pendente (
      titulo_norm TEXT NOT NULL,
      artista_norm TEXT NOT NULL,
      ministrante_nome TEXT NOT NULL COLLATE NOCASE,
      tom TEXT NOT NULL,
      titulo_original TEXT,
      artista_original TEXT,
      PRIMARY KEY (titulo_norm, artista_norm, ministrante_nome)
    );
    /* Tom «Todos» do site: padrão da música, não é um ministrante cadastrado. */
    CREATE TABLE IF NOT EXISTS tom_padrao (
      musica_id INTEGER NOT NULL,
      banco_fonte TEXT NOT NULL DEFAULT 'user',
      tom TEXT NOT NULL,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (musica_id, banco_fonte)
    );
  `);
  migrarMinistranteTodosParaTomPadrao();
}

const TONS_MUSICAIS_VALIDOS = new Set([
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'Cb',
  'Cm', 'C#m', 'Dbm', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gbm', 'Gm', 'G#m', 'Abm', 'Am', 'A#m', 'Bbm', 'Bm',
  'ORIG.',
]);

function normalizarTomMusical(tom) {
  let t = String(tom ?? '').trim();
  if (!t) return '';
  if (/^orig\.?$/i.test(t)) t = 'ORIG.';
  return TONS_MUSICAIS_VALIDOS.has(t) ? t : '';
}

function normalizarBancoFonteTom(fonte) {
  return fonte === 'catalog' ? 'catalog' : 'user';
}

/** «Todos» no site = tom padrão da música, não uma pessoa. */
function ehMinistranteTodos(nome) {
  const k = String(nome || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  return k === 'todos' || k === 'todas';
}

function gravarTomPadraoNoDb(musicaIdRaw, bancoFonteRaw, tomRaw) {
  const musicaId = Number(musicaIdRaw);
  if (!Number.isFinite(musicaId) || musicaId <= 0) return null;
  const banco_fonte = normalizarBancoFonteTom(bancoFonteRaw);
  const tom = normalizarTomMusical(tomRaw);
  if (!tom) {
    db.prepare('DELETE FROM tom_padrao WHERE musica_id = ? AND banco_fonte = ?').run(
      Math.trunc(musicaId),
      banco_fonte
    );
    return { musicaId: Math.trunc(musicaId), bancoFonte: banco_fonte, tom: '' };
  }
  db.prepare(
    `INSERT INTO tom_padrao (musica_id, banco_fonte, tom, atualizado_em)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(musica_id, banco_fonte)
     DO UPDATE SET tom = excluded.tom, atualizado_em = CURRENT_TIMESTAMP`
  ).run(Math.trunc(musicaId), banco_fonte, tom);
  return { musicaId: Math.trunc(musicaId), bancoFonte: banco_fonte, tom };
}

function obterTomPadraoNoDb(musicaIdRaw, bancoFonteRaw) {
  const musicaId = Number(musicaIdRaw);
  if (!Number.isFinite(musicaId) || musicaId <= 0) return null;
  const banco_fonte = normalizarBancoFonteTom(bancoFonteRaw);
  const row = db
    .prepare('SELECT tom FROM tom_padrao WHERE musica_id = ? AND banco_fonte = ?')
    .get(Math.trunc(musicaId), banco_fonte);
  if (!row) return null;
  const tom = normalizarTomMusical(row.tom);
  return tom || null;
}

/**
 * Se um import antigo criou o ministrante «Todos», move os tons para tom_padrao e apaga o nome.
 */
function migrarMinistranteTodosParaTomPadrao() {
  const row = db
    .prepare('SELECT id FROM ministrantes WHERE nome = ? COLLATE NOCASE')
    .get('Todos');
  if (!row) return;
  const tons = db
    .prepare('SELECT musica_id, banco_fonte, tom FROM tom_memoria WHERE ministrante_id = ?')
    .all(row.id);
  for (const t of tons) {
    gravarTomPadraoNoDb(t.musica_id, t.banco_fonte, t.tom);
  }
  db.prepare('DELETE FROM tom_memoria WHERE ministrante_id = ?').run(row.id);
  db.prepare('DELETE FROM ministrantes WHERE id = ?').run(row.id);
}

/**
 * Site usa «Cris». Se o cadastro ainda tiver «Cris Medeiros», renomeia ou
 * funde no «Cris» já existente (tom específico do Cris prevalece).
 */
function migrarMinistranteCrisMedeirosParaCris(playlistsJsonPathFn) {
  try {
    db.prepare(
      `UPDATE tom_import_pendente SET ministrante_nome = 'Cris'
       WHERE ministrante_nome = 'Cris Medeiros' COLLATE NOCASE`
    ).run();
  } catch (_) {
    /* tabela pode não existir ainda */
  }

  const antigo = db
    .prepare('SELECT id FROM ministrantes WHERE nome = ? COLLATE NOCASE')
    .get('Cris Medeiros');
  if (!antigo) return null;

  const cris = db
    .prepare('SELECT id FROM ministrantes WHERE nome = ? COLLATE NOCASE')
    .get('Cris');

  if (!cris || Number(cris.id) === Number(antigo.id)) {
    db.prepare('UPDATE ministrantes SET nome = ? WHERE id = ?').run('Cris', antigo.id);
    return { deId: antigo.id, paraId: antigo.id, acao: 'renomeou' };
  }

  const tons = db
    .prepare('SELECT musica_id, banco_fonte, tom FROM tom_memoria WHERE ministrante_id = ?')
    .all(antigo.id);
  for (const t of tons) {
    const ja = db
      .prepare(
        `SELECT 1 FROM tom_memoria
         WHERE ministrante_id = ? AND musica_id = ? AND banco_fonte = ?`
      )
      .get(cris.id, t.musica_id, t.banco_fonte);
    if (!ja) {
      db.prepare(
        `UPDATE tom_memoria SET ministrante_id = ?
         WHERE ministrante_id = ? AND musica_id = ? AND banco_fonte = ?`
      ).run(cris.id, antigo.id, t.musica_id, t.banco_fonte);
    }
  }
  db.prepare('DELETE FROM tom_memoria WHERE ministrante_id = ?').run(antigo.id);
  db.prepare('DELETE FROM ministrantes WHERE id = ?').run(antigo.id);

  if (typeof playlistsJsonPathFn === 'function') {
    try {
      const { loadPlaylistsJson, savePlaylistsJson } = require('./lib/playlistsStore');
      const playlists = loadPlaylistsJson(playlistsJsonPathFn);
      let mudou = false;
      for (const lista of Object.values(playlists)) {
        if (!Array.isArray(lista)) continue;
        for (const it of lista) {
          if (!it || it.tipo === 'marcador_tema') continue;
          if (Number(it.ministranteId) === Number(antigo.id)) {
            it.ministranteId = cris.id;
            mudou = true;
          }
        }
      }
      if (mudou) savePlaylistsJson(playlistsJsonPathFn, playlists);
    } catch (_) {
      /* playlists opcionais na migração */
    }
  }

  return { deId: antigo.id, paraId: cris.id, acao: 'fundiu' };
}

function copiarTomMemoriaSeVazio(deId, paraId) {
  const tons = db
    .prepare('SELECT musica_id, banco_fonte, tom FROM tom_memoria WHERE ministrante_id = ?')
    .all(deId);
  for (const t of tons) {
    const ja = db
      .prepare(
        `SELECT 1 FROM tom_memoria
         WHERE ministrante_id = ? AND musica_id = ? AND banco_fonte = ?`
      )
      .get(paraId, t.musica_id, t.banco_fonte);
    if (ja) continue;
    db.prepare(
      `INSERT INTO tom_memoria (ministrante_id, musica_id, banco_fonte, tom, atualizado_em)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(paraId, t.musica_id, t.banco_fonte, t.tom);
  }
}

function limparMinistranteIdNasPlaylists(playlistsJsonPathFn, idsRemovidos) {
  const ids = new Set((idsRemovidos || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)));
  if (!ids.size || typeof playlistsJsonPathFn !== 'function') return;
  try {
    const { loadPlaylistsJson, savePlaylistsJson } = require('./lib/playlistsStore');
    const playlists = loadPlaylistsJson(playlistsJsonPathFn);
    let mudou = false;
    for (const lista of Object.values(playlists)) {
      if (!Array.isArray(lista)) continue;
      for (const it of lista) {
        if (!it || it.tipo === 'marcador_tema') continue;
        if (ids.has(Number(it.ministranteId))) {
          it.ministranteId = null;
          mudou = true;
        }
      }
    }
    if (mudou) savePlaylistsJson(playlistsJsonPathFn, playlists);
  } catch (_) {
    /* playlists opcionais na migração */
  }
}

/**
 * Import antigo gravou «Raphaela, Daniela» como uma pessoa. Desmembra e apaga o nome composto.
 */
function migrarMinistrantesAgrupadosDoSite(playlistsJsonPathFn) {
  let rows = [];
  try {
    rows = db.prepare('SELECT id, nome FROM ministrantes').all();
  } catch (_) {
    return [];
  }

  const idsRemovidos = [];
  for (const row of rows) {
    const nome = String(row.nome || '').trim();
    if (!ehNomeMinistranteAgrupado(nome)) continue;
    const nomes = splitNomesMinistrantes(nome).filter((n) => n && !ehMinistranteTodos(n));
    if (nomes.length < 2) continue;

    for (const individual of nomes) {
      const dest = garantirMinistrantePorNomeNoDb(individual);
      if (!dest) continue;
      copiarTomMemoriaSeVazio(row.id, dest.id);
    }

    try {
      const pendentes = db
        .prepare(
          `SELECT titulo_norm, artista_norm, ministrante_nome, tom, titulo_original, artista_original
           FROM tom_import_pendente WHERE ministrante_nome = ? COLLATE NOCASE`
        )
        .all(nome);
      for (const p of pendentes) {
        for (const individual of nomes) {
          upsertTomImportPendente(
            p.titulo_original || '',
            p.artista_original || '',
            individual,
            p.tom
          );
        }
        db.prepare(
          `DELETE FROM tom_import_pendente
           WHERE titulo_norm = ? AND artista_norm = ? AND ministrante_nome = ?`
        ).run(p.titulo_norm, p.artista_norm, p.ministrante_nome);
      }
    } catch (_) {
      /* tabela pode não existir ainda */
    }

    db.prepare('DELETE FROM tom_memoria WHERE ministrante_id = ?').run(row.id);
    db.prepare('DELETE FROM ministrantes WHERE id = ?').run(row.id);
    idsRemovidos.push(Number(row.id));
  }

  limparMinistranteIdNasPlaylists(playlistsJsonPathFn, idsRemovidos);
  return idsRemovidos;
}

function listarMinistrantesNoDb() {
  return db
    .prepare('SELECT id, nome FROM ministrantes ORDER BY nome COLLATE NOCASE')
    .all()
    .map((r) => ({ id: r.id, nome: String(r.nome || '') }))
    .filter((r) => !ehMinistranteTodos(r.nome) && !ehNomeMinistranteAgrupado(r.nome));
}

function inserirMinistranteNoDb(nomeRaw) {
  const nome = String(nomeRaw ?? '').trim();
  if (!nome) {
    const err = new Error('Nome do ministrante é obrigatório.');
    err.statusCode = 400;
    throw err;
  }
  if (ehMinistranteTodos(nome)) {
    const err = new Error('«Todos» não é um ministrante — é o tom padrão da música no site.');
    err.statusCode = 400;
    throw err;
  }
  if (ehNomeMinistranteAgrupado(nome)) {
    const err = new Error(
      'Este nome agrupa mais de uma pessoa (como no site). Cadastre cada ministrante separadamente.'
    );
    err.statusCode = 400;
    throw err;
  }
  if (nome.length > 80) {
    const err = new Error('Nome demasiado longo (máx. 80 caracteres).');
    err.statusCode = 400;
    throw err;
  }
  try {
    const info = db.prepare('INSERT INTO ministrantes (nome) VALUES (?)').run(nome);
    return { id: info.lastInsertRowid, nome };
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      const err = new Error('Já existe um ministrante com este nome.');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
}

function atualizarMinistranteNoDb(idRaw, nomeRaw) {
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Ministrante inválido.');
    err.statusCode = 400;
    throw err;
  }
  const nome = String(nomeRaw ?? '').trim();
  if (!nome) {
    const err = new Error('Nome do ministrante é obrigatório.');
    err.statusCode = 400;
    throw err;
  }
  if (nome.length > 80) {
    const err = new Error('Nome demasiado longo (máx. 80 caracteres).');
    err.statusCode = 400;
    throw err;
  }
  if (ehMinistranteTodos(nome)) {
    const err = new Error('«Todos» não é um ministrante — é o tom padrão da música no site.');
    err.statusCode = 400;
    throw err;
  }
  if (ehNomeMinistranteAgrupado(nome)) {
    const err = new Error(
      'Este nome agrupa mais de uma pessoa (como no site). Cadastre cada ministrante separadamente.'
    );
    err.statusCode = 400;
    throw err;
  }
  const row = db.prepare('SELECT id FROM ministrantes WHERE id = ?').get(id);
  if (!row) {
    const err = new Error('Ministrante não encontrado.');
    err.statusCode = 404;
    throw err;
  }
  try {
    db.prepare('UPDATE ministrantes SET nome = ? WHERE id = ?').run(nome, id);
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      const err = new Error('Já existe um ministrante com este nome.');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }
  return { id, nome };
}

/**
 * Remove o ministrante e a memória de tom associada (CASCADE).
 * @returns {{ id: number, ok: true }}
 */
function apagarMinistranteNoDb(idRaw) {
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Ministrante inválido.');
    err.statusCode = 400;
    throw err;
  }
  const aplicar = db.transaction((ministranteId) => {
    db.prepare('DELETE FROM tom_memoria WHERE ministrante_id = ?').run(ministranteId);
    return db.prepare('DELETE FROM ministrantes WHERE id = ?').run(ministranteId);
  });
  const info = aplicar(id);
  if (!info.changes) {
    const err = new Error('Ministrante não encontrado.');
    err.statusCode = 404;
    throw err;
  }
  return { id, ok: true };
}

function obterTomMemoriaNoDb(ministranteIdRaw, musicaIdRaw, bancoFonteRaw, tituloHint) {
  const ministranteId = Number(ministranteIdRaw);
  const musicaId = Number(musicaIdRaw);
  const tituloHintStr = String(tituloHint || '').trim();
  if (!Number.isFinite(musicaId) && !tituloHintStr) return null;
  const banco_fonte = normalizarBancoFonteTom(bancoFonteRaw);
  const fontes = banco_fonte === 'catalog' ? ['catalog', 'user'] : ['user', 'catalog'];

  const ids = [];
  if (Number.isFinite(musicaId) && musicaId > 0) ids.push(Math.trunc(musicaId));

  let titulo = tituloHintStr;
  let artista = '';
  let nomeMin = '';
  if (Number.isFinite(ministranteId) && ministranteId > 0) {
    const minRow = db.prepare('SELECT nome FROM ministrantes WHERE id = ?').get(ministranteId);
    nomeMin = minRow ? String(minRow.nome || '') : '';
  }

  if (Number.isFinite(musicaId) && musicaId > 0) {
    const rowMusica = getMusicaLinhaUsuarioOuCatalogo(musicaId);
    if (rowMusica) {
      const root = resolverRootIdDaMusica(rowMusica);
      if (root && !ids.includes(Number(root))) ids.push(Number(root));
      if (!titulo) titulo = String(rowMusica.titulo || '').trim();
      artista = String(rowMusica.artista || '').trim();
    }
  }

  const lerMemoria = (mid, id, fonte) => {
    const row = db
      .prepare(
        `SELECT tom FROM tom_memoria
         WHERE ministrante_id = ? AND musica_id = ? AND banco_fonte = ?`
      )
      .get(mid, id, fonte);
    return row ? normalizarTomMusical(row.tom) : '';
  };

  if (Number.isFinite(ministranteId) && ministranteId > 0) {
    for (const id of ids) {
      for (const f of fontes) {
        const tom = lerMemoria(ministranteId, id, f);
        if (tom) return tom;
      }
    }
  }
  for (const id of ids) {
    for (const f of fontes) {
      const tom = obterTomPadraoNoDb(id, f);
      if (tom) return tom;
    }
  }

  if (titulo) {
    const match = encontrarMusicaUsuarioParaTomImport(titulo, artista);
    if (match) {
      const id = match.rootId != null ? match.rootId : match.id;
      if (Number.isFinite(ministranteId) && ministranteId > 0) {
        for (const f of fontes) {
          const tom = lerMemoria(ministranteId, id, f);
          if (tom) return tom;
        }
      }
      for (const f of fontes) {
        const tom = obterTomPadraoNoDb(id, f);
        if (tom) return tom;
      }
    }
    const pend = obterTomImportPendentePorTitulo(titulo, nomeMin);
    if (pend) return pend;
  }

  return null;
}

function gravarTomMemoriaNoDb(ministranteIdRaw, musicaIdRaw, bancoFonteRaw, tomRaw) {
  const ministranteId = Number(ministranteIdRaw);
  const musicaId = Number(musicaIdRaw);
  if (!Number.isFinite(ministranteId) || !Number.isFinite(musicaId)) {
    const err = new Error('Parâmetros inválidos para memória de tom.');
    err.statusCode = 400;
    throw err;
  }
  const minRow = db.prepare('SELECT id FROM ministrantes WHERE id = ?').get(ministranteId);
  if (!minRow) {
    const err = new Error('Ministrante não encontrado.');
    err.statusCode = 404;
    throw err;
  }
  const tom = normalizarTomMusical(tomRaw);
  const banco_fonte = normalizarBancoFonteTom(bancoFonteRaw);
  if (!tom) {
    db.prepare(
      `DELETE FROM tom_memoria
       WHERE ministrante_id = ? AND musica_id = ? AND banco_fonte = ?`
    ).run(ministranteId, musicaId, banco_fonte);
    return { ministranteId, musicaId, bancoFonte: banco_fonte, tom: '' };
  }
  db.prepare(
    `INSERT INTO tom_memoria (ministrante_id, musica_id, banco_fonte, tom, atualizado_em)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(ministrante_id, musica_id, banco_fonte)
     DO UPDATE SET tom = excluded.tom, atualizado_em = CURRENT_TIMESTAMP`
  ).run(ministranteId, musicaId, banco_fonte, tom);
  return { ministranteId, musicaId, bancoFonte: banco_fonte, tom };
}

/** Garante ministrante pelo nome (cria se não existir). «Todos» não é cadastrado. */
function garantirMinistrantePorNomeNoDb(nomeRaw) {
  const nome = String(nomeRaw ?? '').trim();
  if (!nome || ehMinistranteTodos(nome) || ehNomeMinistranteAgrupado(nome)) return null;
  const existente = db
    .prepare('SELECT id, nome FROM ministrantes WHERE nome = ? COLLATE NOCASE')
    .get(nome);
  if (existente) return { id: existente.id, nome: String(existente.nome || nome), criado: false };
  const alias = resolverMinistranteNoCadastro(nome, listarMinistrantesNoDb());
  if (alias) return { id: alias.id, nome: String(alias.nome || nome), criado: false };
  const nomeCanonico = String(normMin(nome) || nome).trim() || nome;
  const criado = inserirMinistranteNoDb(nomeCanonico);
  return { id: criado.id, nome: criado.nome, criado: true };
}

/**
 * Normaliza o payload do ficheiro de importação de tons.
 * Aceita:
 *  - `{ versao, itens: [{ titulo, artista, tons: { "Nome": "G#" } }] }`
 *  - `[{ titulo, artista, ministrante, tom }]`
 */
function empilharParesMinistranteTom(pares, titulo, artista, ministranteRaw, tom) {
  const tomStr = String(tom || '').trim();
  for (const nome of splitNomesMinistrantes(ministranteRaw)) {
    const ministrante = String(nome || '').trim();
    if (!ministrante) continue;
    pares.push({ titulo, artista, ministrante, tom: tomStr });
  }
}

function normalizarPayloadImportTons(raw) {
  const pares = [];
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      empilharParesMinistranteTom(
        pares,
        String(row.titulo || '').trim(),
        String(row.artista || '').trim(),
        row.ministrante || row.ministranteNome || '',
        row.tom
      );
    }
  } else if (raw && typeof raw === 'object') {
    const itens = Array.isArray(raw.itens) ? raw.itens : Array.isArray(raw.musicas) ? raw.musicas : [];
    for (const item of itens) {
      if (!item || typeof item !== 'object') continue;
      const titulo = String(item.titulo || '').trim();
      const artista = String(item.artista || '').trim();
      if (item.tons && typeof item.tons === 'object' && !Array.isArray(item.tons)) {
        for (const [ministrante, tom] of Object.entries(item.tons)) {
          empilharParesMinistranteTom(pares, titulo, artista, ministrante, tom);
        }
      } else if (Array.isArray(item.tons)) {
        for (const t of item.tons) {
          if (!t || typeof t !== 'object') continue;
          empilharParesMinistranteTom(
            pares,
            titulo,
            artista,
            t.ministrante || t.nome || '',
            t.tom
          );
        }
      } else if (item.ministrante || item.tom) {
        empilharParesMinistranteTom(pares, titulo, artista, item.ministrante || '', item.tom);
      }
    }
  }
  return pares.filter((p) => p.titulo && p.ministrante && normalizarTomMusical(p.tom));
}

function upsertTomImportPendente(titulo, artista, ministranteNome, tom) {
  const titulo_norm = normalizarChaveComparacao(titulo);
  const artista_norm = normalizarArtistaComparacao(artista);
  if (!titulo_norm) return;
  db.prepare(
    `INSERT INTO tom_import_pendente
       (titulo_norm, artista_norm, ministrante_nome, tom, titulo_original, artista_original)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(titulo_norm, artista_norm, ministrante_nome)
     DO UPDATE SET tom = excluded.tom,
                   titulo_original = excluded.titulo_original,
                   artista_original = excluded.artista_original`
  ).run(
    titulo_norm,
    artista_norm,
    String(ministranteNome).trim(),
    normalizarTomMusical(tom),
    String(titulo || '').trim(),
    String(artista || '').trim()
  );
}

function partesTituloMedleyNorm(titulo) {
  return String(titulo || '')
    .split(/\s*[/|]+\s*/)
    .map((p) => normalizarChaveComparacao(p))
    .filter((p) => p.length >= 4);
}

function titulosTomCompativeis(tituloA, tituloB) {
  const a = normalizarChaveComparacao(tituloA);
  const b = normalizarChaveComparacao(tituloB);
  if (!a || !b) return false;
  if (a === b) return true;
  const pa = partesTituloMedleyNorm(tituloA);
  const pb = partesTituloMedleyNorm(tituloB);
  if (pa.some((p) => p === b) || pb.some((p) => p === a)) return true;
  if (pa.some((p) => pb.includes(p))) return true;
  if (a.length >= 8 && b.includes(a)) return true;
  if (b.length >= 8 && a.includes(b)) return true;
  return false;
}

/**
 * Match de música só para import de tom: título+artista, título único
 * (mesmo com artista diferente) ou medley («Tu És / Águas Purificadoras»).
 */
function encontrarMusicaUsuarioParaTomImport(titulo, artista) {
  const tituloAlvo = normalizarChaveComparacao(titulo);
  if (!tituloAlvo) return null;
  const artistaAlvo = normalizarArtistaComparacao(artista);

  const rows = db
    .prepare(
      'SELECT id, titulo, artista, root_id FROM musicas WHERE parent_id IS NULL ORDER BY id ASC'
    )
    .all();

  const montar = (row, motivo) => ({
    id: row.id,
    titulo: String(row.titulo || '').trim(),
    artista: String(row.artista || '').trim(),
    rootId: row.root_id != null ? row.root_id : row.id,
    motivo,
  });

  const mesmoTitulo = [];
  const medley = [];
  for (const row of rows) {
    const tRow = normalizarChaveComparacao(row.titulo);
    if (!tRow) continue;
    if (tRow === tituloAlvo) {
      mesmoTitulo.push(row);
      const artistaRow = normalizarArtistaComparacao(row.artista);
      if (artistaRow && artistaAlvo && artistaRow === artistaAlvo) {
        return montar(row, 'titulo-artista');
      }
      continue;
    }
    if (titulosTomCompativeis(titulo, row.titulo)) medley.push(row);
  }
  if (mesmoTitulo.length === 1) return montar(mesmoTitulo[0], 'titulo-unico');
  if (mesmoTitulo.length > 1) {
    const semArtista = mesmoTitulo.filter((row) => {
      const a = normalizarArtistaComparacao(row.artista);
      return !a || !artistaAlvo;
    });
    if (semArtista.length === 1) return montar(semArtista[0], 'titulo');
  }
  if (medley.length === 1) return montar(medley[0], 'titulo-medley');
  return null;
}

function obterTomImportPendentePorTitulo(titulo, nomeMinistrante) {
  const variantes = new Set([normalizarChaveComparacao(titulo)].filter(Boolean));
  for (const p of partesTituloMedleyNorm(titulo)) variantes.add(p);
  if (!variantes.size) return null;

  let rows = [];
  try {
    rows = db
      .prepare(
        `SELECT titulo_norm, ministrante_nome, tom FROM tom_import_pendente`
      )
      .all();
  } catch (_) {
    return null;
  }

  const nomeKey = String(nomeMinistrante || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  let tomTodos = '';
  let tomEspecifico = '';
  for (const row of rows) {
    const tn = String(row.titulo_norm || '');
    const bate = [...variantes].some((v) => v && (tn === v || tn.includes(v) || v.includes(tn)));
    if (!bate) continue;
    const tom = normalizarTomMusical(row.tom);
    if (!tom) continue;
    if (ehMinistranteTodos(row.ministrante_nome)) tomTodos = tom;
    else if (
      nomeKey &&
      String(row.ministrante_nome || '')
        .trim()
        .toLocaleLowerCase('pt-BR') === nomeKey
    ) {
      tomEspecifico = tom;
    }
  }
  return tomEspecifico || tomTodos || null;
}

/**
 * Importa arquivo de tons do site → memória + pendências.
 * Cruza por título/artista normalizados com músicas já no banco.
 * «Todos» vira tom padrão e também preenche os ministrantes já cadastrados.
 */
function importarTonsMemoriaDeArquivo(payload) {
  migrarMinistrantesAgrupadosDoSite();
  const pares = normalizarPayloadImportTons(payload);
  const resumo = {
    total: pares.length,
    aplicados: 0,
    pendentes: 0,
    ministrantesCriados: 0,
    ignorados: 0,
    detalhes: [],
  };
  if (!pares.length) {
    const err = new Error(
      'Nenhum vínculo válido no arquivo. Use titulo + ministrante + tom (C, G#, Am…).'
    );
    err.statusCode = 400;
    throw err;
  }

  const grupos = new Map();
  for (const p of pares) {
    const tom = normalizarTomMusical(p.tom);
    if (!tom) {
      resumo.ignorados += 1;
      continue;
    }
    const chave = `${String(p.titulo || '').trim()}\0${String(p.artista || '').trim()}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        titulo: String(p.titulo || '').trim(),
        artista: String(p.artista || '').trim(),
        todos: null,
        especificos: [],
      });
    }
    const g = grupos.get(chave);
    if (ehMinistranteTodos(p.ministrante)) g.todos = tom;
    else g.especificos.push({ nome: String(p.ministrante || '').trim(), tom });
  }

  for (const g of grupos.values()) {
    if (!g.todos) {
      const tomsUnicos = new Set(g.especificos.map((e) => e.tom));
      if (tomsUnicos.size === 1) g.todos = [...tomsUnicos][0];
    }
  }

  const aplicar = () => {
    const padroesAplicados = [];

    for (const g of grupos.values()) {
      const match = encontrarMusicaUsuarioParaTomImport(g.titulo, g.artista);
      const musicaId = match ? (match.rootId != null ? match.rootId : match.id) : null;
      const motivoMatch = match && match.motivo !== 'titulo-artista' ? match.motivo : undefined;

      if (!musicaId) {
        if (g.todos) {
          upsertTomImportPendente(g.titulo, g.artista, 'Todos', g.todos);
          resumo.pendentes += 1;
          resumo.detalhes.push({
            status: 'pendente',
            titulo: g.titulo,
            artista: g.artista,
            ministrante: 'Todos',
            tom: g.todos,
          });
        }
        for (const e of g.especificos) {
          upsertTomImportPendente(g.titulo, g.artista, e.nome, e.tom);
          resumo.pendentes += 1;
          resumo.detalhes.push({
            status: 'pendente',
            titulo: g.titulo,
            artista: g.artista,
            ministrante: e.nome,
            tom: e.tom,
          });
        }
        continue;
      }

      const idsEspecificos = new Set();
      for (const e of g.especificos) {
        const min = garantirMinistrantePorNomeNoDb(e.nome);
        if (!min) {
          resumo.ignorados += 1;
          continue;
        }
        if (min.criado) resumo.ministrantesCriados += 1;
        gravarTomMemoriaNoDb(min.id, musicaId, 'user', e.tom);
        idsEspecificos.add(Number(min.id));
        resumo.aplicados += 1;
        resumo.detalhes.push({
          status: 'aplicado',
          titulo: g.titulo,
          artista: g.artista,
          ministrante: min.nome,
          tom: e.tom,
          musicaId,
          match: motivoMatch,
        });
      }

      if (g.todos) {
        gravarTomPadraoNoDb(musicaId, 'user', g.todos);
        padroesAplicados.push({ musicaId, tom: g.todos, idsEspecificos });
        resumo.aplicados += 1;
        resumo.detalhes.push({
          status: 'aplicado',
          titulo: g.titulo,
          artista: g.artista,
          ministrante: 'Todos',
          tom: g.todos,
          musicaId,
          padraoTodos: true,
          match: motivoMatch,
        });
      }
    }

    if (padroesAplicados.length) {
      const cadastrados = listarMinistrantesNoDb();
      for (const p of padroesAplicados) {
        for (const m of cadastrados) {
          if (p.idsEspecificos.has(Number(m.id))) continue;
          gravarTomMemoriaNoDb(m.id, p.musicaId, 'user', p.tom);
        }
      }
    }
  };
  if (typeof db.transaction === 'function') db.transaction(aplicar)();
  else aplicar();
  return resumo;
}

/**
 * Quando uma música nova entra no banco, aplica tons pendentes do import do site.
 * @returns {number} quantos vínculos aplicados
 */
function aplicarTonsPendentesParaMusica(musicaIdRaw, titulo, artista) {
  const musicaId = Number(musicaIdRaw);
  if (!Number.isFinite(musicaId) || musicaId <= 0) return 0;
  const titulo_norm = normalizarChaveComparacao(titulo);
  if (!titulo_norm) return 0;
  const artista_norm = normalizarArtistaComparacao(artista);

  let rows = db
    .prepare(
      `SELECT ministrante_nome, tom FROM tom_import_pendente
       WHERE titulo_norm = ? AND artista_norm = ?`
    )
    .all(titulo_norm, artista_norm);

  let aplicouPorTitulo = false;
  if (!rows.length) {
    const porTitulo = db
      .prepare(
        `SELECT artista_norm, ministrante_nome, tom FROM tom_import_pendente
         WHERE titulo_norm = ?`
      )
      .all(titulo_norm);
    const artistas = new Set(porTitulo.map((r) => String(r.artista_norm || '')));
    if (porTitulo.length && (artistas.size <= 1 || !artista_norm)) {
      rows = porTitulo;
      aplicouPorTitulo = true;
    }
  }
  if (!rows.length) return 0;

  let n = 0;
  const aplicar = () => {
    const idsEspecificos = new Set();
    let tomTodos = '';
    for (const row of rows) {
      const tom = normalizarTomMusical(row.tom);
      if (!tom) continue;
      if (ehMinistranteTodos(row.ministrante_nome)) {
        gravarTomPadraoNoDb(musicaId, 'user', tom);
        tomTodos = tom;
        n += 1;
        continue;
      }
      const nomes = splitNomesMinistrantes(row.ministrante_nome);
      const alvo = nomes.length ? nomes : [row.ministrante_nome];
      for (const nome of alvo) {
        const min = garantirMinistrantePorNomeNoDb(nome);
        if (!min) continue;
        gravarTomMemoriaNoDb(min.id, musicaId, 'user', tom);
        idsEspecificos.add(Number(min.id));
        n += 1;
      }
    }
    if (tomTodos) {
      for (const m of listarMinistrantesNoDb()) {
        if (idsEspecificos.has(Number(m.id))) continue;
        gravarTomMemoriaNoDb(m.id, musicaId, 'user', tomTodos);
      }
    }
    if (aplicouPorTitulo || !artista_norm) {
      db.prepare(`DELETE FROM tom_import_pendente WHERE titulo_norm = ?`).run(titulo_norm);
    } else {
      db.prepare(
        `DELETE FROM tom_import_pendente WHERE titulo_norm = ? AND artista_norm = ?`
      ).run(titulo_norm, artista_norm);
    }
  };
  if (typeof db.transaction === 'function') db.transaction(aplicar)();
  else aplicar();
  return n;
}

/**
 * @param {object} paths Objeto de caminhos (`createUserPaths`).
 * @param {typeof import('better-sqlite3')} Database
 */
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

  migrarMusicasImutabilidade();

  const count = db.prepare('SELECT COUNT(*) as c FROM musicas').get();
  if (count.c === 0) inserirMusicasExemplo();

  initApresentacoesDB();
  initMinistrantesETomMemoriaDB();
  initHistoricoProjecaoDB();
  migrarRotuloCopiaCapitalizacao();
  migrarMinistranteCrisMedeirosParaCris(paths?.playlistsJsonPath);
  migrarMinistrantesAgrupadosDoSite(paths?.playlistsJsonPath);
}

const ROTULO_COPIA_MODIFICADA = 'Cópia';
const ROTULO_COPIA_IMPORTADA = 'Cópia/Importada';
const ROTULO_COPIA_MANUAL = 'Cópia/Manual';
/**
 * Rótulo da cópia editável que nasce junto com o original.
 *
 * Mesmo texto de `ROTULO_COPIA_MODIFICADA` de propósito: para o usuário é a
 * mesma coisa («a cópia»), e a barra de versões já sabe desenhar esse rótulo.
 */
const ROTULO_COPIA_PADRAO = 'Cópia';

/** Marcas de acentuação isoladas pela decomposição NFD (U+0300..U+036F). */
const REGEX_MARCAS_ACENTO = /[\u0300-\u036f]/g;

/**
 * Normaliza texto para comparação de duplicidade de músicas.
 *
 * Motivo: os dados vindos de scraping (CifraClub / Letras.mus.br) raramente
 * batem caractere a caractere com o que o usuário já tem salvo — «Paulo César
 * Baruk» vs «Paulo Cesar Baruk», «Clamo a Jesus!» vs «Clamo a Jesus». A
 * comparação exata anterior deixava passar esses casos e criava duplicatas.
 *
 * Não é fuzzy matching: só remove acentos, caixa, pontuação simples e espaços
 * redundantes. Diferenças reais de palavra continuam sendo músicas distintas.
 */
function normalizarChaveComparacao(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(REGEX_MARCAS_ACENTO, '')
    .toLowerCase()
    .replace(/[.,;:!?¡¿"'’‘“”`´^~(){}[\]<>/\\|@#$%&*+=_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Igual a `normalizarChaveComparacao`, mas descarta participações no fim do
 * nome do artista («Baruk feat. Fernandinho» → «baruk»), muito comuns nos
 * títulos das fontes online e ausentes no banco do usuário.
 */
function normalizarArtistaComparacao(texto) {
  return normalizarChaveComparacao(texto)
    .replace(/\s(?:feat|ft|featuring|part|participacao)(?:\s.*)?$/, '')
    .trim();
}

function colunaExiste(nomeTabela, nomeColuna) {
  const cols = db.prepare(`PRAGMA table_info(${nomeTabela})`).all();
  return cols.some((c) => c.name === nomeColuna);
}

function migrarMusicasImutabilidade() {
  const adds = [
    ['parent_id', 'INTEGER'],
    ['root_id', 'INTEGER'],
    ['is_immutable', 'INTEGER NOT NULL DEFAULT 0'],
    ['rotulo', 'TEXT'],
  ];
  for (const [nome, tipo] of adds) {
    if (!colunaExiste('musicas', nome)) {
      db.exec(`ALTER TABLE musicas ADD COLUMN ${nome} ${tipo}`);
    }
  }

  db.exec(`
    UPDATE musicas
    SET parent_id = NULL,
        root_id = id,
        is_immutable = 1
    WHERE root_id IS NULL OR root_id = 0
  `);
}

/** Rótulo automático deixa de ser «CÓPIA» e passa a «Cópia» (e variantes). */
function migrarRotuloCopiaCapitalizacao() {
  const pares = [
    ['CÓPIA', 'Cópia'],
    ['CÓPIA/IMPORTADA', 'Cópia/Importada'],
    ['CÓPIA/MANUAL', 'Cópia/Manual'],
  ];
  const aplicar = () => {
    const atualizar = (tabela) => {
      if (!colunaExiste(tabela, 'rotulo')) return;
      const upd = db.prepare(`UPDATE ${tabela} SET rotulo = ? WHERE rotulo = ?`);
      for (const [antigo, novo] of pares) upd.run(novo, antigo);
    };
    atualizar('musicas');
    atualizar('historico_projecao');
  };
  if (typeof db.transaction === 'function') db.transaction(aplicar)();
  else aplicar();
}

function parseEstrofesJson(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.map((s) => String(s ?? '')) : [];
  } catch (_) {
    return [];
  }
}

function rowMusicaParaJson(row, extras = {}) {
  if (!row) return null;
  const estrofes = parseEstrofesJson(row.estrofes);
  const rootId = row.root_id != null ? row.root_id : row.id;
  return {
    id: row.id,
    titulo: String(row.titulo || '').trim(),
    artista: String(row.artista || '').trim(),
    estrofes,
    parent_id: row.parent_id != null ? row.parent_id : null,
    root_id: rootId,
    is_immutable: Number(row.is_immutable) === 1 ? 1 : 0,
    rotulo: row.rotulo != null ? String(row.rotulo) : '',
    criado_em: row.criado_em,
    ...extras,
  };
}

function obterMusicaUsuarioPorId(id) {
  const idn = parseInt(id, 10);
  if (!Number.isFinite(idn)) return null;
  return db.prepare('SELECT * FROM musicas WHERE id = ?').get(idn) || null;
}

function finalizarMusicaOriginalAposInsert(id) {
  const idn = parseInt(id, 10);
  db.prepare('UPDATE musicas SET root_id = ?, is_immutable = 1, parent_id = NULL WHERE id = ?').run(
    idn,
    idn
  );
}

/**
 * Cadastra uma música nova: **duas linhas**, sempre.
 *
 * 1. o ORIGINAL (`is_immutable = 1`), que nunca é alterado pela edição normal;
 * 2. uma Cópia filha idêntica (`is_immutable = 0`), que é a versão que o
 *    controlador abre por padrão e onde as edições acontecem.
 *
 * Antes só o original era gravado e a cópia nascia tarde, no primeiro fork de
 * `atualizarMusicaNoDb`. O `id` devolvido continua sendo o do original — é ele
 * que a lista do banco e as playlists usam como âncora (`root_id`).
 */
function inserirMusicaUsuario(titulo, artista, estrofes) {
  const norm = estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
  const tituloTrim = String(titulo).trim();
  const artistaTrim = String(artista || '').trim();
  const info = db
    .prepare('INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (?, ?, ?, 1)')
    .run(tituloTrim, artistaTrim, JSON.stringify(norm));
  const newId = info.lastInsertRowid;
  finalizarMusicaOriginalAposInsert(newId);

  let copiaId = null;
  const originalRow = obterMusicaUsuarioPorId(newId);
  if (originalRow) {
    const copia = inserirCopiaMusica(originalRow, tituloTrim, artistaTrim, norm, {
      rotulo: ROTULO_COPIA_PADRAO,
    });
    if (copia && copia.ok) copiaId = copia.id;
  }

  try {
    aplicarTonsPendentesParaMusica(newId, titulo, artista);
  } catch (_) {
    // intencional — memória de tom não deve impedir o cadastro
  }
  return { ok: true, id: newId, copiaId, rootId: newId };
}

function inserirCopiaMusica(parentRow, titulo, artista, estrofes, opts = {}) {
  const norm = estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
  const rootId = parentRow.root_id != null ? parentRow.root_id : parentRow.id;
  const rotulo = opts.rotulo != null ? String(opts.rotulo).trim().slice(0, 40) : '';
  const info = db
    .prepare(
      `INSERT INTO musicas (titulo, artista, estrofes, parent_id, root_id, is_immutable, rotulo)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      String(titulo).trim(),
      String(artista || '').trim(),
      JSON.stringify(norm),
      parentRow.id,
      rootId,
      rotulo || null
    );
  return { ok: true, id: info.lastInsertRowid, rootId, parentId: parentRow.id };
}

function listarVersoesPorRootId(rootIdRaw) {
  const rootId = parseInt(rootIdRaw, 10);
  if (!Number.isFinite(rootId)) return [];
  const rows = db
    .prepare(
      `SELECT id, titulo, artista, estrofes, parent_id, root_id, is_immutable, rotulo, criado_em
       FROM musicas
       WHERE root_id = ? OR id = ?
       ORDER BY id ASC`
    )
    .all(rootId, rootId);
  return rows.map((row) => rowMusicaParaJson(row));
}

function resolverRootIdDaMusica(row) {
  if (!row) return null;
  return row.root_id != null ? row.root_id : row.id;
}

/**
 * Cópia editável «padrão» de uma família: a filha mais antiga do root.
 *
 * Não é um campo no banco — é uma convenção (menor `id` entre as cópias), que
 * mantém a escolha estável mesmo depois de o usuário criar outras versões.
 */
function obterCopiaPadraoDoRoot(rootIdRaw) {
  const rootId = parseInt(rootIdRaw, 10);
  if (!Number.isFinite(rootId)) return null;
  return (
    db
      .prepare(
        `SELECT * FROM musicas
         WHERE root_id = ? AND parent_id IS NOT NULL AND is_immutable = 0
         ORDER BY id ASC
         LIMIT 1`
      )
      .get(rootId) || null
  );
}

/**
 * Resolve — criando se ainda não existir — a cópia editável padrão da música.
 *
 * As músicas cadastradas antes desta mudança só têm o original; em vez de uma
 * migração em massa (que dobraria a tabela de uma vez), a cópia é materializada
 * na primeira vez que a música é aberta. O original nunca é tocado aqui.
 *
 * @returns {{ok:true, id:number, rootId:number, criada:boolean}|{ok:false, erro:string}}
 */
function garantirCopiaPadraoNoDb(idRaw) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };

  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };

  const rootId = Number(resolverRootIdDaMusica(row));

  // Já é uma cópia (a padrão ou uma versão nomeada): nada a criar.
  if (Number(row.is_immutable) !== 1 && row.parent_id != null) {
    return { ok: true, id: Number(row.id), rootId, criada: false };
  }

  const existente = obterCopiaPadraoDoRoot(rootId);
  if (existente) return { ok: true, id: Number(existente.id), rootId, criada: false };

  const rootRow = Number(row.id) === rootId ? row : obterMusicaUsuarioPorId(rootId);
  if (!rootRow) return { ok: false, erro: 'Não encontrado' };

  const estrofes = parseEstrofesJson(rootRow.estrofes);
  if (!estrofes.length) return { ok: false, erro: 'estrofes vazias' };

  const fork = inserirCopiaMusica(
    rootRow,
    String(rootRow.titulo || '').trim(),
    String(rootRow.artista || '').trim(),
    estrofes,
    { rotulo: ROTULO_COPIA_PADRAO }
  );
  return { ok: true, id: Number(fork.id), rootId: Number(fork.rootId), criada: true };
}

function estrofesIguaisNoBanco(estrofesExistentesJson, estrofesNovos) {
  const atuais = parseEstrofesJson(estrofesExistentesJson);
  const novos = estrofesNovos.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
  if (atuais.length !== novos.length) return false;
  for (let i = 0; i < atuais.length; i++) {
    if (atuais[i] !== novos[i]) return false;
  }
  return true;
}

function getMusicaLinhaUsuarioOuCatalogo(id) {
  const row = db.prepare('SELECT * FROM musicas WHERE id = ?').get(id);
  if (row) return row;
  if (catalog) return catalog.prepare('SELECT * FROM musicas WHERE id = ?').get(id) || null;
  return null;
}

function atualizarMusicaNoDb(idRaw, titulo, artista, estrofes) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };
  if (typeof titulo !== 'string' || !String(titulo).trim())
    return { ok: false, erro: 'titulo obrigatório' };
  if (!Array.isArray(estrofes) || estrofes.length === 0)
    return { ok: false, erro: 'estrofes deve ser um array não vazio' };
  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };

  const normalized = estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
  const tituloTrim = String(titulo).trim();
  const artistaTrim = String(artista || '').trim();

  if (Number(row.is_immutable) === 1) {
    const letraAlterada = !estrofesIguaisNoBanco(row.estrofes, normalized);
    if (letraAlterada) {
      const fork = inserirCopiaMusica(
        row,
        String(row.titulo || '').trim(),
        String(row.artista ?? '').trim(),
        normalized,
        { rotulo: ROTULO_COPIA_MODIFICADA }
      );
      return {
        ok: true,
        forked: true,
        id: fork.id,
        previousId: id,
        rootId: fork.rootId,
      };
    }
    const rMeta = db
      .prepare('UPDATE musicas SET titulo=?, artista=? WHERE id=? AND is_immutable = 1')
      .run(tituloTrim, artistaTrim, id);
    if (rMeta.changes === 0) return { ok: false, erro: 'Não encontrado' };
    return { ok: true, forked: false, id, titulo: tituloTrim };
  }

  const r = db
    .prepare(
      'UPDATE musicas SET titulo=?, artista=?, estrofes=? WHERE id=? AND is_immutable = 0'
    )
    .run(tituloTrim, artistaTrim, JSON.stringify(normalized), id);
  if (r.changes === 0) return { ok: false, erro: 'Não encontrado' };
  return { ok: true, forked: false, id, titulo: tituloTrim };
}

/** Remove uma cópia ou a família inteira (ao apagar o original / root_id). */
function apagarMusicaUsuarioNoDb(idRaw) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };
  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };

  const rootId = resolverRootIdDaMusica(row);

  if (Number(row.id) === Number(rootId)) {
    const r = db.prepare('DELETE FROM musicas WHERE root_id = ? OR id = ?').run(rootId, rootId);
    if (r.changes === 0) return { ok: false, erro: 'Não encontrado' };
    return { ok: true, removidos: r.changes, rootId, cascade: true };
  }

  const r = db.prepare('DELETE FROM musicas WHERE id = ?').run(id);
  if (r.changes === 0) return { ok: false, erro: 'Não encontrado' };
  return { ok: true, removidos: r.changes, rootId, cascade: false };
}

/** Valida entrada comum aos fluxos de importação/criação de música do usuário. */
function prepararEntradaMusicaUsuario(titulo, artista, estrofes) {
  const tituloTrim = String(titulo || '').trim();
  const artistaTrim = String(artista || '').trim();
  if (!tituloTrim) return { erro: 'titulo obrigatório' };
  if (!Array.isArray(estrofes) || !estrofes.length)
    return { erro: 'estrofes deve ser um array não vazio' };
  return {
    tituloTrim,
    artistaTrim,
    norm: estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? ''))),
  };
}

/**
 * Grava a música quando já existe uma equivalente: sempre como cópia filha,
 * preservando o original intacto.
 */
function gravarComoCopiaDeExistente(existente, tituloTrim, artistaTrim, norm, rotulo) {
  const row = obterMusicaUsuarioPorId(existente.id);
  if (!row) return { ok: false, erro: 'Não encontrado' };
  const fork = inserirCopiaMusica(row, tituloTrim, artistaTrim, norm, { rotulo });
  // Aqui o registro gravado já é a própria cópia editável.
  return { ok: true, id: fork.id, rootId: fork.rootId, copiaId: fork.id, copyImportada: true };
}

/**
 * Importa música (playlist, sync, letras): nova original ou cópia filha se já existir equivalente.
 *
 * @param {object} [opts]
 * @param {'copiar'|'perguntar'} [opts.aoDuplicar] `copiar` (padrão) mantém o
 *   comportamento automático usado pelos fluxos em lote do celular. `perguntar`
 *   **não grava nada** ao detectar duplicidade e devolve `{ duplicado: true }`
 *   para que a decisão seja do usuário.
 */
function importarMusicaUsuarioNoDb(titulo, artista, estrofes, opts = {}) {
  const entrada = prepararEntradaMusicaUsuario(titulo, artista, estrofes);
  if (entrada.erro) return { ok: false, erro: entrada.erro };
  const { tituloTrim, artistaTrim, norm } = entrada;

  const existente = encontrarMusicaUsuarioDuplicada(tituloTrim, artistaTrim);

  if (!existente) {
    const ins = inserirMusicaUsuario(tituloTrim, artistaTrim, norm);
    if (!ins.ok) return { ok: false, erro: ins.erro || 'Falha ao inserir' };
    return { ok: true, id: ins.id, rootId: ins.id, copiaId: ins.copiaId, copyImportada: false };
  }

  if (String(opts.aoDuplicar || 'copiar') === 'perguntar') {
    return { ok: false, duplicado: true, existente, erro: 'Música já existe no banco' };
  }

  return gravarComoCopiaDeExistente(
    existente,
    tituloTrim,
    artistaTrim,
    norm,
    ROTULO_COPIA_IMPORTADA
  );
}

/**
 * Cadastro manual de música pelo usuário, com a mesma checagem de duplicidade
 * dos fluxos de importação. Antes esta rota inseria sempre uma nova original,
 * mesmo com título e artista idênticos a uma já existente.
 *
 * @param {object} [opts]
 * @param {'copiar'|'perguntar'} [opts.aoDuplicar] Ver `importarMusicaUsuarioNoDb`.
 */
function criarMusicaUsuarioNoDb(titulo, artista, estrofes, opts = {}) {
  const entrada = prepararEntradaMusicaUsuario(titulo, artista, estrofes);
  if (entrada.erro) return { ok: false, erro: entrada.erro };
  const { tituloTrim, artistaTrim, norm } = entrada;

  const existente = encontrarMusicaUsuarioDuplicada(tituloTrim, artistaTrim);

  if (!existente) {
    const ins = inserirMusicaUsuario(tituloTrim, artistaTrim, norm);
    if (!ins.ok) return { ok: false, erro: ins.erro || 'Falha ao inserir' };
    return { ok: true, id: ins.id, rootId: ins.id, copiaId: ins.copiaId, copyImportada: false };
  }

  if (String(opts.aoDuplicar || 'copiar') === 'perguntar') {
    return { ok: false, duplicado: true, existente, erro: 'Música já existe no banco' };
  }

  return gravarComoCopiaDeExistente(
    existente,
    tituloTrim,
    artistaTrim,
    norm,
    ROTULO_COPIA_MANUAL
  );
}

/** Cópia B — nova versão nomeada a partir do conteúdo atual do registro (sem alterar o pai). */
function criarVersaoMusicaNoDb(idRaw, rotuloRaw) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };
  const rotulo = String(rotuloRaw || '').trim();
  if (!rotulo) return { ok: false, erro: 'rotulo obrigatório' };

  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };

  const estrofes = parseEstrofesJson(row.estrofes);
  if (!estrofes.length) return { ok: false, erro: 'estrofes vazias' };

  const fork = inserirCopiaMusica(
    row,
    String(row.titulo || '').trim(),
    String(row.artista || '').trim(),
    estrofes,
    { rotulo }
  );
  return {
    ok: true,
    forked: true,
    id: fork.id,
    previousId: id,
    rootId: fork.rootId,
    rotulo,
  };
}

/** Renomeia o rótulo de uma cópia/versão (não o original imutável). */
function atualizarRotuloVersaoNoDb(idRaw, rotuloRaw) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };
  const rotulo = String(rotuloRaw || '').trim().slice(0, 40);
  if (!rotulo) return { ok: false, erro: 'rotulo obrigatório' };

  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };
  if (Number(row.is_immutable) === 1 || row.parent_id == null) {
    return { ok: false, erro: 'Não é possível renomear o original' };
  }

  const r = db
    .prepare('UPDATE musicas SET rotulo=? WHERE id=? AND is_immutable = 0')
    .run(rotulo, id);
  if (r.changes === 0) return { ok: false, erro: 'Não encontrado' };
  return { ok: true, id, rotulo, rootId: resolverRootIdDaMusica(row) };
}

/**
 * Procura no banco do usuário uma música equivalente à informada.
 *
 * A comparação é feita em JS (e não em SQL) porque o SQLite não decompõe
 * acentos: `lower(trim(titulo))` não faz «César» bater com «Cesar». A varredura
 * cobre só os originais (`parent_id IS NULL`) e o banco pessoal é pequeno.
 *
 * `motivo`:
 *  - `titulo-artista`: título e artista equivalentes;
 *  - `titulo`: título equivalente e um dos lados sem artista preenchido.
 *
 * @returns {{id:number, titulo:string, artista:string, rootId:number, motivo:string}|null}
 */
function encontrarMusicaUsuarioDuplicada(titulo, artista) {
  const tituloAlvo = normalizarChaveComparacao(titulo);
  if (!tituloAlvo) return null;
  const artistaAlvo = normalizarArtistaComparacao(artista);

  const rows = db
    .prepare(
      'SELECT id, titulo, artista, root_id FROM musicas WHERE parent_id IS NULL ORDER BY id ASC'
    )
    .all();

  // As estrofes só são lidas para a linha que casou — a janela de conflito da
  // importação por código precisa delas para mostrar a letra atual lado a lado.
  const estrofesDaLinha = (id) => {
    const r = db.prepare('SELECT estrofes FROM musicas WHERE id = ?').get(id);
    return r ? parseEstrofesJson(r.estrofes) : [];
  };

  const montar = (row, motivo) => ({
    id: row.id,
    titulo: String(row.titulo || '').trim(),
    artista: String(row.artista || '').trim(),
    estrofes: estrofesDaLinha(row.id),
    rootId: row.root_id != null ? row.root_id : row.id,
    motivo,
  });

  let candidatoSoTitulo = null;
  for (const row of rows) {
    if (normalizarChaveComparacao(row.titulo) !== tituloAlvo) continue;
    const artistaRow = normalizarArtistaComparacao(row.artista);
    if (artistaRow === artistaAlvo) return montar(row, 'titulo-artista');
    // Título idêntico e artista ausente de um dos lados: tratamos como possível
    // duplicata, mas com prioridade menor — quem decide é o usuário.
    if ((!artistaRow || !artistaAlvo) && !candidatoSoTitulo) {
      candidatoSoTitulo = montar(row, 'titulo');
    }
  }
  return candidatoSoTitulo;
}

/**
 * Sobrescreve uma música existente com o conteúdo recebido, preservando o `id`
 * (as playlists que já apontam para ela continuam válidas) e a linhagem.
 *
 * Usada só pela decisão explícita «Substituir» na janela de conflito da
 * importação por código. É o único caminho que altera o conteúdo de um
 * original imutável — `atualizarMusicaNoDb` deliberadamente faz fork nesse
 * caso, e esse comportamento continua valendo para a edição normal de letra.
 *
 * Versões filhas já existentes não são tocadas: mantêm as próprias letras.
 */
function substituirMusicaUsuarioNoDb(idRaw, titulo, artista, estrofes) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };

  const entrada = prepararEntradaMusicaUsuario(titulo, artista, estrofes);
  if (entrada.erro) return { ok: false, erro: entrada.erro };
  const { tituloTrim, artistaTrim, norm } = entrada;

  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };

  const r = db
    .prepare('UPDATE musicas SET titulo = ?, artista = ?, estrofes = ? WHERE id = ?')
    .run(tituloTrim, artistaTrim, JSON.stringify(norm), id);
  if (r.changes === 0) return { ok: false, erro: 'Não encontrado' };

  return {
    ok: true,
    id,
    rootId: resolverRootIdDaMusica(row),
    substituida: true,
    copyImportada: false,
  };
}

/** Compatibilidade: id da música equivalente já existente, ou `null`. */
function musicaIdPorTituloArtistaIgual(titulo, artista) {
  const dup = encontrarMusicaUsuarioDuplicada(titulo, artista);
  return dup ? dup.id : null;
}

/**
 * Normaliza o payload de sync de músicas preservando a identidade de cada linha:
 * originais (`parent_id` nulo, `is_immutable=1`) e cópias/versões (lineage + `rotulo`).
 * Snapshots antigos sem lineage continuam sendo tratados como originais.
 */
function normalizarMusicasUsuarioParaSync(musicas) {
  if (!Array.isArray(musicas)) return [];
  const out = [];
  const ids = new Set();
  for (const raw of musicas) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const titulo = String(raw.titulo || '').trim();
    const artista = String(raw.artista || '').trim();
    const estrofes = Array.isArray(raw.estrofes)
      ? raw.estrofes.map((s) => String(s ?? '')).filter((s) => s.trim())
      : [];
    if (!titulo || !estrofes.length) continue;

    const idNum = Number(raw.id);
    const hasId = Number.isFinite(idNum) && idNum > 0;
    const id = hasId ? Math.trunc(idNum) : null;
    if (hasId && ids.has(id)) continue;

    const parentRaw = raw.parent_id;
    const parentNum = parentRaw == null || parentRaw === '' ? null : Number(parentRaw);
    const parent_id =
      parentNum != null && Number.isFinite(parentNum) && parentNum > 0 ? Math.trunc(parentNum) : null;

    // Cópias precisam de id estável para `versaoLocalId` das playlists continuar válido.
    if (parent_id != null && !hasId) continue;

    // Original: parent nulo. Cópia: nunca imutável. Snapshot antigo sem lineage = original.
    let is_immutable;
    if (parent_id != null) {
      is_immutable = 0;
    } else if (raw.is_immutable != null && raw.is_immutable !== '') {
      is_immutable = Number(raw.is_immutable) === 1 ? 1 : 0;
    } else {
      is_immutable = 1;
    }

    const rootRaw = raw.root_id;
    const rootNum = rootRaw == null || rootRaw === '' ? null : Number(rootRaw);
    let root_id =
      rootNum != null && Number.isFinite(rootNum) && rootNum > 0 ? Math.trunc(rootNum) : null;
    if (root_id == null) {
      if (parent_id == null && hasId) root_id = id;
      else if (parent_id != null) root_id = parent_id;
    }

    const rotulo = raw.rotulo != null ? String(raw.rotulo).trim().slice(0, 40) : '';

    const item = {
      titulo,
      artista,
      estrofes,
      parent_id,
      root_id,
      is_immutable,
      rotulo,
    };
    if (hasId) {
      ids.add(id);
      item.id = id;
      if (parent_id == null) item.root_id = id;
    }
    out.push(item);
  }

  // Pais antes dos filhos (e root antes de ramos) para reinserção previsível.
  out.sort((a, b) => {
    const aOrig = a.parent_id == null ? 0 : 1;
    const bOrig = b.parent_id == null ? 0 : 1;
    if (aOrig !== bOrig) return aOrig - bOrig;
    const aId = Number.isFinite(a.id) ? a.id : Number.MAX_SAFE_INTEGER;
    const bId = Number.isFinite(b.id) ? b.id : Number.MAX_SAFE_INTEGER;
    return aId - bId;
  });
  return out;
}

function listarMusicasUsuarioParaSync() {
  return db
    .prepare(
      `SELECT id, titulo, artista, estrofes, parent_id, root_id, is_immutable, rotulo
       FROM musicas
       ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, id ASC`
    )
    .all()
    .map((row) => {
      let estrofes = [];
      try {
        estrofes = JSON.parse(row.estrofes || '[]');
      } catch (_) {
        estrofes = [];
      }
      const id = row.id;
      const parent_id = row.parent_id != null ? row.parent_id : null;
      const root_id = row.root_id != null ? row.root_id : id;
      return {
        id,
        titulo: String(row.titulo || '').trim(),
        artista: String(row.artista || '').trim(),
        estrofes: Array.isArray(estrofes) ? estrofes.map((s) => String(s ?? '')) : [],
        parent_id,
        root_id,
        is_immutable: Number(row.is_immutable) === 1 ? 1 : 0,
        rotulo: row.rotulo != null ? String(row.rotulo) : '',
      };
    })
    .filter((row) => row.titulo && row.estrofes.length);
}

function substituirMusicasUsuarioParaSync(musicas) {
  const itens = normalizarMusicasUsuarioParaSync(musicas);
  const insertWithId = db.prepare(
    `INSERT INTO musicas (id, titulo, artista, estrofes, is_immutable, parent_id, root_id, rotulo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAuto = db.prepare(
    'INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (?, ?, ?, 1)'
  );

  const aplicar = (lista) => {
    db.prepare('DELETE FROM musicas').run();
    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name='musicas'").run();
    } catch (_) {
      // intencional — erro ignorado
    }
    for (const item of lista) {
      const estrofesJson = JSON.stringify(item.estrofes);
      if (Number.isFinite(item.id) && item.id > 0) {
        const id = Math.trunc(item.id);
        const parent_id = item.parent_id != null ? item.parent_id : null;
        const root_id =
          item.root_id != null ? item.root_id : parent_id == null ? id : parent_id;
        const is_immutable = parent_id == null ? 1 : 0;
        const rotulo = parent_id == null ? null : item.rotulo ? String(item.rotulo).slice(0, 40) : null;
        insertWithId.run(
          id,
          item.titulo,
          item.artista,
          estrofesJson,
          is_immutable,
          parent_id,
          root_id,
          rotulo
        );
      } else {
        // Sem id só aceitamos originais (compat com snapshots antigos).
        const info = insertAuto.run(item.titulo, item.artista, estrofesJson);
        finalizarMusicaOriginalAposInsert(info.lastInsertRowid);
      }
    }
  };

  if (typeof db.transaction === 'function') {
    db.transaction(aplicar)(itens);
  } else {
    aplicar(itens);
  }
  return { ok: true, total: itens.length };
}

/**
 * Snapshot de sync: ministrantes com id estável (playlists referenciam `ministranteId`).
 */
function normalizarMinistrantesParaSync(ministrantes) {
  if (!Array.isArray(ministrantes)) return [];
  const out = [];
  const ids = new Set();
  const nomes = new Set();
  for (const raw of ministrantes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const idNum = Number(raw.id);
    const id = Number.isFinite(idNum) && idNum > 0 ? Math.trunc(idNum) : null;
    const nome = String(raw.nome || '').trim();
    if (!id || !nome || ids.has(id)) continue;
    const nomeKey = nome.toLocaleLowerCase('pt-BR');
    if (ehMinistranteTodos(nome) || nomes.has(nomeKey)) continue;
    ids.add(id);
    nomes.add(nomeKey);
    out.push({ id, nome: nome.slice(0, 80) });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

function listarMinistrantesParaSync() {
  return normalizarMinistrantesParaSync(listarMinistrantesNoDb());
}

/**
 * Memória de tom (ministrante + música + fonte → tom) para o sync entre PCs.
 */
function normalizarTomMemoriaParaSync(itens) {
  if (!Array.isArray(itens)) return [];
  const out = [];
  const chaves = new Set();
  for (const raw of itens) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const ministranteId = Number(raw.ministranteId ?? raw.ministrante_id);
    const musicaId = Number(raw.musicaId ?? raw.musica_id);
    if (!Number.isFinite(ministranteId) || ministranteId <= 0) continue;
    if (!Number.isFinite(musicaId) || musicaId <= 0) continue;
    const bancoFonte = normalizarBancoFonteTom(raw.bancoFonte ?? raw.banco_fonte ?? raw.fonte);
    const tom = normalizarTomMusical(raw.tom);
    if (!tom) continue;
    const mid = Math.trunc(ministranteId);
    const uid = Math.trunc(musicaId);
    const chave = `${mid}|${uid}|${bancoFonte}`;
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    out.push({ ministranteId: mid, musicaId: uid, bancoFonte, tom });
  }
  out.sort((a, b) => {
    if (a.ministranteId !== b.ministranteId) return a.ministranteId - b.ministranteId;
    if (a.musicaId !== b.musicaId) return a.musicaId - b.musicaId;
    return a.bancoFonte.localeCompare(b.bancoFonte);
  });
  return out;
}

function listarTomMemoriaParaSync() {
  return db
    .prepare(
      `SELECT ministrante_id, musica_id, banco_fonte, tom
       FROM tom_memoria
       ORDER BY ministrante_id ASC, musica_id ASC, banco_fonte ASC`
    )
    .all()
    .map((r) => ({
      ministranteId: Number(r.ministrante_id),
      musicaId: Number(r.musica_id),
      bancoFonte: normalizarBancoFonteTom(r.banco_fonte),
      tom: normalizarTomMusical(r.tom),
    }))
    .filter((r) => r.ministranteId > 0 && r.musicaId > 0 && r.tom);
}

function normalizarTomPadraoParaSync(itens) {
  if (!Array.isArray(itens)) return [];
  const out = [];
  const chaves = new Set();
  for (const raw of itens) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const musicaId = Number(raw.musicaId ?? raw.musica_id);
    if (!Number.isFinite(musicaId) || musicaId <= 0) continue;
    const bancoFonte = normalizarBancoFonteTom(raw.bancoFonte ?? raw.banco_fonte ?? raw.fonte);
    const tom = normalizarTomMusical(raw.tom);
    if (!tom) continue;
    const uid = Math.trunc(musicaId);
    const chave = `${uid}|${bancoFonte}`;
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    out.push({ musicaId: uid, bancoFonte, tom });
  }
  out.sort((a, b) => {
    if (a.musicaId !== b.musicaId) return a.musicaId - b.musicaId;
    return a.bancoFonte.localeCompare(b.bancoFonte);
  });
  return out;
}

function listarTomPadraoParaSync() {
  return db
    .prepare('SELECT musica_id, banco_fonte, tom FROM tom_padrao ORDER BY musica_id ASC, banco_fonte ASC')
    .all()
    .map((r) => ({
      musicaId: Number(r.musica_id),
      bancoFonte: normalizarBancoFonteTom(r.banco_fonte),
      tom: normalizarTomMusical(r.tom),
    }))
    .filter((r) => r.musicaId > 0 && r.tom);
}

/**
 * Substitui cadastro de ministrantes + memória de tom (preserva IDs do snapshot).
 * Snapshots antigos sem estes campos não devem chamar esta função.
 */
function substituirMinistrantesETomMemoriaParaSync(ministrantes, tomMemoria, tomPadrao) {
  const mins = normalizarMinistrantesParaSync(ministrantes);
  const tons = normalizarTomMemoriaParaSync(tomMemoria);
  const padroes = normalizarTomPadraoParaSync(tomPadrao);
  const idsMin = new Set(mins.map((m) => m.id));
  const tonsOk = tons.filter((t) => idsMin.has(t.ministranteId));

  const insertMin = db.prepare('INSERT INTO ministrantes (id, nome) VALUES (?, ?)');
  const insertTom = db.prepare(
    `INSERT INTO tom_memoria (ministrante_id, musica_id, banco_fonte, tom, atualizado_em)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  const insertPadrao = db.prepare(
    `INSERT INTO tom_padrao (musica_id, banco_fonte, tom, atualizado_em)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
  );

  const aplicar = () => {
    db.prepare('DELETE FROM tom_memoria').run();
    db.prepare('DELETE FROM tom_padrao').run();
    db.prepare('DELETE FROM ministrantes').run();
    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name='ministrantes'").run();
    } catch (_) {
      // intencional — erro ignorado
    }
    for (const m of mins) {
      insertMin.run(m.id, m.nome);
    }
    for (const t of tonsOk) {
      insertTom.run(t.ministranteId, t.musicaId, t.bancoFonte, t.tom);
    }
    for (const p of padroes) {
      insertPadrao.run(p.musicaId, p.bancoFonte, p.tom);
    }
  };

  if (typeof db.transaction === 'function') {
    db.transaction(aplicar)();
  } else {
    aplicar();
  }
  return {
    ok: true,
    ministrantes: mins.length,
    tomMemoria: tonsOk.length,
    tomPadrao: padroes.length,
  };
}

module.exports = {
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
  getMusicaLinhaUsuarioOuCatalogo,
  obterMusicaUsuarioPorId,
  rowMusicaParaJson,
  inserirMusicaUsuario,
  importarMusicaUsuarioNoDb,
  criarMusicaUsuarioNoDb,
  substituirMusicaUsuarioNoDb,
  encontrarMusicaUsuarioDuplicada,
  normalizarChaveComparacao,
  normalizarArtistaComparacao,
  atualizarMusicaNoDb,
  apagarMusicaUsuarioNoDb,
  criarVersaoMusicaNoDb,
  atualizarRotuloVersaoNoDb,
  listarVersoesPorRootId,
  obterCopiaPadraoDoRoot,
  garantirCopiaPadraoNoDb,
  resolverRootIdDaMusica,
  listarMusicasUsuarioParaSync,
  musicaIdPorTituloArtistaIgual,
  normalizarMusicasUsuarioParaSync,
  substituirMusicasUsuarioParaSync,
  listarMinistrantesNoDb,
  listarMinistrantesParaSync,
  normalizarMinistrantesParaSync,
  listarTomMemoriaParaSync,
  normalizarTomMemoriaParaSync,
  listarTomPadraoParaSync,
  normalizarTomPadraoParaSync,
  substituirMinistrantesETomMemoriaParaSync,
  ehMinistranteTodos,
  migrarMinistranteCrisMedeirosParaCris,
  migrarMinistrantesAgrupadosDoSite,
  obterTomPadraoNoDb,
  gravarTomPadraoNoDb,
  inserirMinistranteNoDb,
  atualizarMinistranteNoDb,
  apagarMinistranteNoDb,
  obterTomMemoriaNoDb,
  gravarTomMemoriaNoDb,
  importarTonsMemoriaDeArquivo,
  aplicarTonsPendentesParaMusica,
  garantirMinistrantePorNomeNoDb,
  normalizarTomMusical,
  TONS_MUSICAIS_VALIDOS,
};
