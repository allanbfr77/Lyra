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
  `);
}

const TONS_MUSICAIS_VALIDOS = new Set([
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm',
]);

function normalizarTomMusical(tom) {
  const t = String(tom ?? '').trim();
  if (!t) return '';
  return TONS_MUSICAIS_VALIDOS.has(t) ? t : '';
}

function normalizarBancoFonteTom(fonte) {
  return fonte === 'catalog' ? 'catalog' : 'user';
}

function listarMinistrantesNoDb() {
  return db
    .prepare('SELECT id, nome FROM ministrantes ORDER BY nome COLLATE NOCASE')
    .all()
    .map((r) => ({ id: r.id, nome: String(r.nome || '') }));
}

function inserirMinistranteNoDb(nomeRaw) {
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

function obterTomMemoriaNoDb(ministranteIdRaw, musicaIdRaw, bancoFonteRaw) {
  const ministranteId = Number(ministranteIdRaw);
  const musicaId = Number(musicaIdRaw);
  if (!Number.isFinite(ministranteId) || !Number.isFinite(musicaId)) return null;
  const banco_fonte = normalizarBancoFonteTom(bancoFonteRaw);
  const row = db
    .prepare(
      `SELECT tom FROM tom_memoria
       WHERE ministrante_id = ? AND musica_id = ? AND banco_fonte = ?`
    )
    .get(ministranteId, musicaId, banco_fonte);
  if (!row) return null;
  const tom = normalizarTomMusical(row.tom);
  return tom || null;
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

/** Garante ministrante pelo nome (cria se não existir). */
function garantirMinistrantePorNomeNoDb(nomeRaw) {
  const nome = String(nomeRaw ?? '').trim();
  if (!nome) return null;
  const existente = db
    .prepare('SELECT id, nome FROM ministrantes WHERE nome = ? COLLATE NOCASE')
    .get(nome);
  if (existente) return { id: existente.id, nome: String(existente.nome || nome), criado: false };
  const criado = inserirMinistranteNoDb(nome);
  return { id: criado.id, nome: criado.nome, criado: true };
}

/**
 * Normaliza o payload do ficheiro de importação de tons.
 * Aceita:
 *  - `{ versao, itens: [{ titulo, artista, tons: { "Nome": "G#" } }] }`
 *  - `[{ titulo, artista, ministrante, tom }]`
 */
function normalizarPayloadImportTons(raw) {
  const pares = [];
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      pares.push({
        titulo: String(row.titulo || '').trim(),
        artista: String(row.artista || '').trim(),
        ministrante: String(row.ministrante || row.ministranteNome || '').trim(),
        tom: String(row.tom || '').trim(),
      });
    }
  } else if (raw && typeof raw === 'object') {
    const itens = Array.isArray(raw.itens) ? raw.itens : Array.isArray(raw.musicas) ? raw.musicas : [];
    for (const item of itens) {
      if (!item || typeof item !== 'object') continue;
      const titulo = String(item.titulo || '').trim();
      const artista = String(item.artista || '').trim();
      if (item.tons && typeof item.tons === 'object' && !Array.isArray(item.tons)) {
        for (const [ministrante, tom] of Object.entries(item.tons)) {
          pares.push({
            titulo,
            artista,
            ministrante: String(ministrante || '').trim(),
            tom: String(tom || '').trim(),
          });
        }
      } else if (Array.isArray(item.tons)) {
        for (const t of item.tons) {
          if (!t || typeof t !== 'object') continue;
          pares.push({
            titulo,
            artista,
            ministrante: String(t.ministrante || t.nome || '').trim(),
            tom: String(t.tom || '').trim(),
          });
        }
      } else if (item.ministrante || item.tom) {
        pares.push({
          titulo,
          artista,
          ministrante: String(item.ministrante || '').trim(),
          tom: String(item.tom || '').trim(),
        });
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

/**
 * Importa arquivo de tons do site → memória + pendências.
 * Cruza por título/artista normalizados com músicas já no banco.
 */
function importarTonsMemoriaDeArquivo(payload) {
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

  const aplicar = db.transaction(() => {
    for (const p of pares) {
      const tom = normalizarTomMusical(p.tom);
      if (!tom) {
        resumo.ignorados += 1;
        continue;
      }
      const min = garantirMinistrantePorNomeNoDb(p.ministrante);
      if (!min) {
        resumo.ignorados += 1;
        continue;
      }
      if (min.criado) resumo.ministrantesCriados += 1;

      const match = encontrarMusicaUsuarioDuplicada(p.titulo, p.artista);
      if (match && match.motivo === 'titulo-artista') {
        const musicaId = match.rootId != null ? match.rootId : match.id;
        gravarTomMemoriaNoDb(min.id, musicaId, 'user', tom);
        resumo.aplicados += 1;
        resumo.detalhes.push({
          status: 'aplicado',
          titulo: p.titulo,
          artista: p.artista,
          ministrante: min.nome,
          tom,
          musicaId,
        });
      } else if (match && match.motivo === 'titulo' && !normalizarArtistaComparacao(p.artista)) {
        /* Só título e artista vazio no arquivo: aceitar match por título. */
        const musicaId = match.rootId != null ? match.rootId : match.id;
        gravarTomMemoriaNoDb(min.id, musicaId, 'user', tom);
        resumo.aplicados += 1;
        resumo.detalhes.push({
          status: 'aplicado',
          titulo: p.titulo,
          artista: p.artista,
          ministrante: min.nome,
          tom,
          musicaId,
          match: 'titulo',
        });
      } else {
        upsertTomImportPendente(p.titulo, p.artista, min.nome, tom);
        resumo.pendentes += 1;
        resumo.detalhes.push({
          status: 'pendente',
          titulo: p.titulo,
          artista: p.artista,
          ministrante: min.nome,
          tom,
        });
      }
    }
  });
  aplicar();
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

  if (!rows.length && !artista_norm) {
    rows = db
      .prepare(
        `SELECT ministrante_nome, tom FROM tom_import_pendente
         WHERE titulo_norm = ?`
      )
      .all(titulo_norm);
  }
  if (!rows.length) return 0;

  let n = 0;
  const aplicar = db.transaction(() => {
    for (const row of rows) {
      const min = garantirMinistrantePorNomeNoDb(row.ministrante_nome);
      if (!min) continue;
      const tom = normalizarTomMusical(row.tom);
      if (!tom) continue;
      gravarTomMemoriaNoDb(min.id, musicaId, 'user', tom);
      n += 1;
    }
    if (artista_norm) {
      db.prepare(
        `DELETE FROM tom_import_pendente WHERE titulo_norm = ? AND artista_norm = ?`
      ).run(titulo_norm, artista_norm);
    } else {
      db.prepare(`DELETE FROM tom_import_pendente WHERE titulo_norm = ?`).run(titulo_norm);
    }
  });
  aplicar();
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
}

const ROTULO_COPIA_MODIFICADA = 'CÓPIA';
const ROTULO_COPIA_IMPORTADA = 'CÓPIA/IMPORTADA';
const ROTULO_COPIA_MANUAL = 'CÓPIA/MANUAL';

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

function inserirMusicaUsuario(titulo, artista, estrofes) {
  const norm = estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
  const info = db
    .prepare('INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (?, ?, ?, 1)')
    .run(String(titulo).trim(), String(artista || '').trim(), JSON.stringify(norm));
  const newId = info.lastInsertRowid;
  finalizarMusicaOriginalAposInsert(newId);
  try {
    aplicarTonsPendentesParaMusica(newId, titulo, artista);
  } catch (_) {
    // intencional — memória de tom não deve impedir o cadastro
  }
  return { ok: true, id: newId };
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
  return { ok: true, id: fork.id, rootId: fork.rootId, copyImportada: true };
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
    return { ok: true, id: ins.id, rootId: ins.id, copyImportada: false };
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
    return { ok: true, id: ins.id, rootId: ins.id, copyImportada: false };
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
    if (nomes.has(nomeKey)) continue;
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

/**
 * Substitui cadastro de ministrantes + memória de tom (preserva IDs do snapshot).
 * Snapshots antigos sem estes campos não devem chamar esta função.
 */
function substituirMinistrantesETomMemoriaParaSync(ministrantes, tomMemoria) {
  const mins = normalizarMinistrantesParaSync(ministrantes);
  const tons = normalizarTomMemoriaParaSync(tomMemoria);
  const idsMin = new Set(mins.map((m) => m.id));
  const tonsOk = tons.filter((t) => idsMin.has(t.ministranteId));

  const insertMin = db.prepare('INSERT INTO ministrantes (id, nome) VALUES (?, ?)');
  const insertTom = db.prepare(
    `INSERT INTO tom_memoria (ministrante_id, musica_id, banco_fonte, tom, atualizado_em)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );

  const aplicar = () => {
    db.prepare('DELETE FROM tom_memoria').run();
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
  };

  if (typeof db.transaction === 'function') {
    db.transaction(aplicar)();
  } else {
    aplicar();
  }
  return { ok: true, ministrantes: mins.length, tomMemoria: tonsOk.length };
}

module.exports = {
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
  substituirMinistrantesETomMemoriaParaSync,
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
