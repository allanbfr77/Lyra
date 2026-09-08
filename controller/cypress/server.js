/**
 * Servidor Express standalone para os testes Cypress E2E.
 *
 * Execute com `electron` (não com `node`):
 *   npx electron cypress/server.js
 *
 * Usa o binário de better-sqlite3 já compilado para Electron —
 * sem rebuild, sem dependência de Visual Studio.
 *
 * Expõe um endpoint exclusivo de testes:
 *   POST /_e2e/reset-db  →  reseta o banco para o seed mínimo
 *
 * Uso nos testes via cy.task('resetDb') — ver cypress.config.js.
 */
'use strict';

const { app } = require('electron');
const path     = require('path');
const os       = require('os');
const fs       = require('fs');
const Database = require('better-sqlite3');

app.on('window-all-closed', () => { /* mantém processo vivo */ });

// ── Seed mínimo de músicas para os testes ────────────────────────────────────
const MUSICAS_SEED = [
  {
    titulo: 'Música Teste A',
    artista: 'Artista Teste',
    estrofes: JSON.stringify(['Estrofe um da música A', 'Estrofe dois da música A']),
  },
  {
    titulo: 'Música Teste B',
    artista: 'Artista Teste',
    estrofes: JSON.stringify(['Estrofe um da música B']),
  },
  {
    titulo: 'Música Teste C',
    artista: 'Outro Artista',
    estrofes: JSON.stringify(['Única estrofe da música C']),
  },
];

// ── Seed mínimo de playlist (arquivo JSON) ────────────────────────────────────
function buildPlaylistSeed(musicaIds) {
  return {
    'culto-e2e-001': {
      titulo: 'Culto de Teste E2E',
      data: '2099-01-01',
      itens: musicaIds.slice(0, 2).map((id, i) => ({
        id,
        titulo: MUSICAS_SEED[i].titulo,
        artista: MUSICAS_SEED[i].artista,
        bancoFonte: 'user',
        cultoId: 'culto-e2e-001',
        versaoLocalId: null,
        versaoRotulo: '',
      })),
    },
  };
}

// ── Função de reset do banco (chamada pelo endpoint /_e2e/reset-db) ───────────
/**
 * Reseta o banco para o estado seed mínimo.
 *
 * Apaga todos os dados de músicas, ministrantes, histórico e apresentações,
 * insere as MUSICAS_SEED com IDs previsíveis e grava a playlist de teste.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} playlistsJsonPath
 */
function resetParaSeed(db, playlistsJsonPath) {
  db.transaction(() => {
    // Limpa tabelas dependentes primeiro (FK ordem)
    db.prepare('DELETE FROM historico_projecao').run();
    db.prepare('DELETE FROM tom_memoria').run();
    db.prepare('DELETE FROM tom_import_pendente').run();
    db.prepare('DELETE FROM tom_padrao').run();
    db.prepare('DELETE FROM ministrantes').run();
    db.prepare('DELETE FROM slides').run();
    db.prepare('DELETE FROM apresentacoes').run();
    db.prepare('DELETE FROM musicas').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('musicas','ministrantes','historico_projecao','apresentacoes','slides')").run();

    // Insere músicas seed com IDs determinísticos (1, 2, 3)
    const insert = db.prepare(
      'INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (@titulo, @artista, @estrofes, 0)'
    );
    const ids = [];
    for (const m of MUSICAS_SEED) {
      const { lastInsertRowid } = insert.run(m);
      ids.push(Number(lastInsertRowid));
    }

    return ids;
  })();

  // IDs após reset com sqlite_sequence zerado devem ser 1, 2, 3
  const ids = db.prepare('SELECT id FROM musicas ORDER BY id').all().map(r => r.id);

  // Grava playlist seed no JSON
  const playlist = buildPlaylistSeed(ids);
  fs.writeFileSync(playlistsJsonPath, JSON.stringify(playlist, null, 2), 'utf8');

  return { ids };
}

app.whenReady().then(async () => {
  // ── Pasta de dados isolada de teste ─────────────────────────────────────────
  const TEST_DATA_DIR = path.join(os.tmpdir(), 'lyra-e2e-test');
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  const dbTestPath       = path.join(TEST_DATA_DIR, 'lyra.db');
  const playlistsJsonPath = path.join(TEST_DATA_DIR, 'lyra_playlists.json');

  // Banco fresco a cada boot do servidor de teste
  try { fs.unlinkSync(dbTestPath); } catch (_) {}

  const paths = {
    dbPathNew:               () => dbTestPath,
    dbPathLegacyInvb:        () => path.join(TEST_DATA_DIR, 'invblyrics.db'),
    dbPathLegacy:            () => path.join(TEST_DATA_DIR, 'churchdisplay.db'),
    catalogPath:             () => path.join(TEST_DATA_DIR, 'catalog.db'),
    catalogBundledDbPath:    () => null,
    catalogLetrasDirProjeto: () => path.join(TEST_DATA_DIR, 'letras'),
    playlistsJsonPath:       () => playlistsJsonPath,
    playlistsJsonPathLegacy: () => path.join(TEST_DATA_DIR, 'lyra_playlists_legacy.json'),
    sharedSyncMetaPath:      () => path.join(TEST_DATA_DIR, 'lyra_shared_sync_meta.json'),
    bibliaDataDir:           () => path.resolve(__dirname, '../data/biblia'),
    bibliaSqlitePath:        (t) => path.resolve(__dirname, '../data/biblia', `${String(t).toUpperCase()}.sqlite`),
    apresentacaoVideosDir:   () => path.join(TEST_DATA_DIR, 'apresentacao-videos'),
    apresentacaoMidiasDir:   () => path.join(TEST_DATA_DIR, 'apresentacao-midias'),
    localDisplayConfigPath:  () => path.join(TEST_DATA_DIR, 'display-config.json'),
    localDisplayStatePath:   () => path.join(TEST_DATA_DIR, 'display-state.json'),
  };

  // ── Inicializa banco com seed mínimo ─────────────────────────────────────────
  const { initControllerDatabase, getDb } = require('../src/db');
  initControllerDatabase(paths, Database);
  const db = getDb();

  // Substitui as músicas de exemplo pelo seed de testes
  resetParaSeed(db, playlistsJsonPath);

  // ── Inicia servidor Express ───────────────────────────────────────────────────
  const ctx = require('../src/controllerContext');
  const { iniciarServidorController } = require('../src/httpControllerServer');
  const { server, expressApp } = await iniciarServidorController(ctx, paths);

  // ── Endpoint exclusivo E2E: POST /_e2e/reset-db ───────────────────────────────
  /**
   * Reseta o banco para o seed mínimo sem reiniciar o servidor.
   * Chamado pelo cy.task('resetDb') via HTTP — ver cypress.config.js.
   *
   * Uso nos testes:
   *   beforeEach(() => { cy.task('resetDb'); });
   */
  expressApp.post('/_e2e/reset-db', (_req, res) => {
    try {
      const result = resetParaSeed(db, playlistsJsonPath);
      res.json({ ok: true, ids: result.ids });
    } catch (e) {
      console.error('[E2E reset-db]', e);
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  console.log('[Lyra E2E] Servidor de teste pronto em http://localhost:3001');
  console.log('[Lyra E2E] Reset DB: POST http://localhost:3001/_e2e/reset-db');
});
