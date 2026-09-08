/**
 * Servidor Express standalone para os testes Cypress E2E.
 *
 * Inicia o mesmo servidor que o Electron usa (porta 3001), mas sem Electron,
 * apontando para um banco SQLite isolado em pasta temporária de testes.
 *
 * Uso via start-server-and-test:
 *   "node cypress/server.js" -> aguarda http://localhost:3001 -> roda cypress
 */
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const Database = require('better-sqlite3');

// ── Pasta de dados de teste ──────────────────────────────────────────────────
const TEST_DATA_DIR = path.join(os.tmpdir(), 'lyra-e2e-test');
fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

// Remove banco anterior para garantir estado limpo a cada execução
const dbTestPath = path.join(TEST_DATA_DIR, 'lyra.db');
try { fs.unlinkSync(dbTestPath); } catch (_) { /* inexistente — ok */ }

// ── Objeto `paths` mínimo (espelha createUserPaths de lib/paths.js) ──────────
const paths = {
  dbPathNew:             () => dbTestPath,
  dbPathLegacyInvb:      () => path.join(TEST_DATA_DIR, 'invblyrics.db'),
  dbPathLegacy:          () => path.join(TEST_DATA_DIR, 'churchdisplay.db'),
  catalogPath:           () => path.join(TEST_DATA_DIR, 'catalog.db'),
  catalogBundledDbPath:  () => null,                    // catálogo offline não necessário em E2E
  catalogLetrasDirProjeto: () => path.join(TEST_DATA_DIR, 'letras'),
  playlistsJsonPath:     () => path.join(TEST_DATA_DIR, 'lyra_playlists.json'),
  playlistsJsonPathLegacy: () => path.join(TEST_DATA_DIR, 'lyra_playlists_legacy.json'),
  sharedSyncMetaPath:    () => path.join(TEST_DATA_DIR, 'lyra_shared_sync_meta.json'),
  bibliaDataDir:         () => path.resolve(__dirname, '../data/biblia'),
  bibliaSqlitePath:      (t) => path.resolve(__dirname, '../data/biblia', `${String(t).toUpperCase()}.sqlite`),
  apresentacaoVideosDir: () => path.join(TEST_DATA_DIR, 'apresentacao-videos'),
  apresentacaoMidiasDir: () => path.join(TEST_DATA_DIR, 'apresentacao-midias'),
  localDisplayConfigPath:() => path.join(TEST_DATA_DIR, 'display-config.json'),
  localDisplayStatePath: () => path.join(TEST_DATA_DIR, 'display-state.json'),
};

// ── Inicializa banco (cria tabelas + seed de músicas exemplo) ────────────────
const { initControllerDatabase } = require('../src/db');
initControllerDatabase(paths, Database);

// ── Inicia servidor Express (porta 3001) ────────────────────────────────────
const ctx = require('../src/controllerContext');   // { windowMain: null, ... }
const { iniciarServidorController } = require('../src/httpControllerServer');

iniciarServidorController(ctx, paths)
  .then(() => {
    console.log('[Lyra E2E] Servidor de teste pronto em http://localhost:3001');
  })
  .catch((err) => {
    console.error('[Lyra E2E] Falha ao iniciar servidor:', err);
    process.exit(1);
  });
