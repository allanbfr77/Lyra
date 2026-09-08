/**
 * Configuração Cypress para testes E2E do Lyra Controller.
 *
 * O servidor Express (porta 3001) é iniciado via `npm run test:e2e`,
 * que usa start-server-and-test: aguarda http://localhost:3001/controller.html
 * estar disponível antes de rodar o Cypress.
 *
 * Servidor de teste: npx electron cypress/server.js
 * (usa o binário Electron do better-sqlite3 — sem rebuild necessário)
 */
'use strict';

const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3001',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',
    video: false,
    viewportWidth: 1280,
    viewportHeight: 800,

    /**
     * setupNodeEvents — tasks Node.js acessíveis via cy.task() nos testes.
     *
     * ─── Task: resetDb ─────────────────────────────────────────────────────
     * Restaura o banco SQLite de teste para o estado seed mínimo antes de
     * cada suíte, sem reiniciar o servidor.
     *
     * Músicas seed inseridas (IDs 1, 2, 3 após reset):
     *   1 — "Música Teste A" / Artista Teste
     *   2 — "Música Teste B" / Artista Teste
     *   3 — "Música Teste C" / Outro Artista
     *
     * Playlist seed:
     *   cultoId "culto-e2e-001" com músicas 1 e 2.
     *
     * Uso nos testes:
     *
     *   beforeEach(() => {
     *     cy.task('resetDb');
     *   });
     *
     * A task faz uma chamada HTTP ao endpoint /_e2e/reset-db do servidor de
     * teste (que roda no processo Electron com better-sqlite3 já carregado),
     * evitando qualquer problema de incompatibilidade de binário nativo.
     */
    setupNodeEvents(on, _config) {
      on('task', {
        /**
         * Reseta o banco para o seed mínimo de testes.
         * @returns {Promise<null>} Cypress exige retorno não-undefined.
         */
        async resetDb() {
          // Node.js 18+ tem fetch nativo; Cypress 16 usa Node 20+.
          const res = await fetch('http://localhost:3001/_e2e/reset-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`resetDb falhou (HTTP ${res.status}): ${body}`);
          }
          return null; // Cypress exige null, não undefined
        },
      });
    },
  },
});
