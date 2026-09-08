/**
 * Smoke test — verifica servidor, DOM e task resetDb.
 */
describe('Setup smoke test', () => {
  beforeEach(() => {
    cy.task('resetDb');
  });

  it('painel do controlador carrega (HTTP 200)', () => {
    cy.request('/controller.html').its('status').should('eq', 200);
  });

  it('painel do controlador renderiza no DOM', () => {
    cy.visit('/controller.html');
    cy.get('#conn-bar').should('exist');
  });

  it('API de músicas retorna seed mínimo (3 músicas)', () => {
    cy.request('/api/musicas').then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.be.an('array').with.length(3);
      const titulos = res.body.map(m => m.titulo);
      expect(titulos).to.include('Música Teste A');
      expect(titulos).to.include('Música Teste B');
      expect(titulos).to.include('Música Teste C');
    });
  });

  it('resetDb é idempotente — segunda chamada mantém 3 músicas', () => {
    cy.task('resetDb');
    cy.request('/api/musicas').its('body').should('have.length', 3);
  });
});
