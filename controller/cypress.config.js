/**
 * Configuração Cypress para testes E2E do Lyra Controller.
 *
 * O servidor Express (porta 3001) é iniciado via `npm run test:e2e`,
 * que usa start-server-and-test: aguarda http://localhost:3001 estar
 * disponível antes de rodar o Cypress.
 */
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3001',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',
    video: false,          // desativar vídeo por padrão (mais rápido em CI)
    viewportWidth: 1280,
    viewportHeight: 800,

    /**
     * setupNodeEvents: registra tasks Node.js acessíveis via cy.task() nos testes.
     *
     * Etapa 2 — task "resetDb":
     *   Restaura o banco SQLite de teste para o estado inicial (seed mínimo).
     *   Uso nos testes:
     *
     *     beforeEach(() => {
     *       cy.task('resetDb');
     *     });
     */
    setupNodeEvents(on, _config) {
      const Database = require('better-sqlite3');
      const TEST_DATA_DIR = path.join(os.tmpdir(), 'lyra-e2e-test');
      const DB_PATH = path.join(TEST_DATA_DIR, 'lyra.db');

      on('task', {
        /**
         * Reseta o banco de dados para o estado seed mínimo de testes.
         * Apaga todas as músicas do usuário e insere fixtures previsíveis.
         *
         * Uso:
         *   beforeEach(() => { cy.task('resetDb'); });
         *
         * @returns {null} Cypress exige retorno não-undefined; null é aceito.
         */
        resetDb() {
          // Implementação completa adicionada na Etapa 2
          // (seed mínimo com músicas e playlists de teste).
          return null;
        },
      });
    },
  },
});
