/**
 * Etapa 3 — Testes de acesso ao painel do controlador.
 *
 * O app é um Electron local sem sistema de login — nenhuma rota
 * exige autenticação. Estes testes verificam que:
 *  • controller.html carrega diretamente (sem redirecionamento);
 *  • os elementos estruturais principais estão presentes;
 *  • as APIs respondem sem token.
 */
describe('Painel — acesso sem autenticação', () => {
  beforeEach(() => {
    cy.task('resetDb');
  });

  it('carrega controller.html sem redirecionamento de login', () => {
    cy.visit('/controller.html');
    cy.url().should('include', 'controller.html');
    cy.get('#conn-bar').should('exist');
  });

  it('elementos estruturais do painel estão presentes', () => {
    cy.visit('/controller.html');
    cy.get('#conn-bar').should('be.visible');
    cy.get('#culto-dd-btn').should('be.visible');
    cy.get('#btn-adicionar-culto').should('be.visible');
    cy.get('#playlist-list').should('exist');
  });

  it('APIs do painel respondem sem token de autenticação', () => {
    cy.request('/api/musicas').its('status').should('eq', 200);
    cy.request('/api/playlists').its('status').should('eq', 200);
    cy.request('/api/ministrantes').its('status').should('eq', 200);
  });

  it('banco seed tem exatamente 3 músicas acessíveis via API', () => {
    cy.request('/api/musicas').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.be.an('array').with.length(3);
    });
  });
});
