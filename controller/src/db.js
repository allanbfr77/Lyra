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
}

const ROTULO_COPIA_MODIFICADA = 'Cópia/Modificada';
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
    const item = { titulo, artista, estrofes };
    const idNum = Number(raw.id);
    if (Number.isFinite(idNum) && idNum > 0) {
      const id = Math.trunc(idNum);
      if (ids.has(id)) continue;
      ids.add(id);
      item.id = id;
    }
    out.push(item);
  }
  return out;
}

function listarMusicasUsuarioParaSync() {
  return db
    .prepare(
      `SELECT id, titulo, artista, estrofes FROM musicas
       WHERE parent_id IS NULL
       ORDER BY id ASC`
    )
    .all()
    .map((row) => {
      let estrofes = [];
      try {
        estrofes = JSON.parse(row.estrofes || '[]');
      } catch (_) {
        estrofes = [];
      }
      return {
        id: row.id,
        titulo: String(row.titulo || '').trim(),
        artista: String(row.artista || '').trim(),
        estrofes: Array.isArray(estrofes) ? estrofes.map((s) => String(s ?? '')) : [],
      };
    })
    .filter((row) => row.titulo && row.estrofes.length);
}

function substituirMusicasUsuarioParaSync(musicas) {
  const itens = normalizarMusicasUsuarioParaSync(musicas);
  const insertWithId = db.prepare(
    `INSERT INTO musicas (id, titulo, artista, estrofes, is_immutable, parent_id, root_id)
     VALUES (?, ?, ?, ?, 1, NULL, ?)`
  );
  const insertAuto = db.prepare(
    'INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (?, ?, ?, 1)'
  );

  const tx = db.transaction((lista) => {
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
        insertWithId.run(id, item.titulo, item.artista, estrofesJson, id);
      } else {
        const info = insertAuto.run(item.titulo, item.artista, estrofesJson);
        finalizarMusicaOriginalAposInsert(info.lastInsertRowid);
      }
    }
  });

  tx(itens);
  return { ok: true, total: itens.length };
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
  substituirMusicasUsuarioParaSync,
};
