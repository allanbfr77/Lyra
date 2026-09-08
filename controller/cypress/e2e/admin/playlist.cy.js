/**
 * Etapa 3 — Testes de gestão da playlist do culto.
 *
 * Estratégia de isolamento:
 *  • cy.task('resetDb')  → reseta o banco SQLite (músicas IDs 1-2-3).
 *  • onBeforeLoad        → injeta seed em localStorage antes do JS do app correr.
 *    - lyra_playlists_v1      : playlist com 2 músicas do culto de teste.
 *    - lyra_cultos_manuais_v1 : culto manual com ID no formato culto_YYYY-MM-DD_e2e.
 *  • selecionarCulto()   → abre o dropdown e clica no item do culto de teste.
 *
 * Nota sobre IDs do culto:
 *  O app filtra cultos manuais pela função cultoIdPertenceAoMes(), que extrai
 *  YYYY-MM do ID via regex /^culto_(\d{4}-\d{2}-\d{2})_/i. O ID precisa ser
 *  do mês corrente para aparecer no dropdown.
 */

// ── Helpers de culto dinâmico (mês corrente) ─────────────────────────────────
function cultoE2eId() {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `culto_${yy}-${mm}-${dd}_e2e`;
}

function cultoE2eLabel() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}/${mm} | Culto de Teste E2E`;
}

// ── Seed de playlist (formato localStorage: { cultoId: [itens] }) ─────────────
function seedPlaylist(cultoId) {
  return {
    [cultoId]: [
      {
        id: 1, titulo: 'Música Teste A', artista: 'Artista Teste',
        bancoFonte: 'user', cultoId, versaoLocalId: null, versaoRotulo: '',
      },
      {
        id: 2, titulo: 'Música Teste B', artista: 'Artista Teste',
        bancoFonte: 'user', cultoId, versaoLocalId: null, versaoRotulo: '',
      },
    ],
  };
}

// ── Comandos reutilizáveis ────────────────────────────────────────────────────
function visitComSeed(cultoId, cultoLabel) {
  cy.visit('/controller.html', {
    onBeforeLoad(win) {
      win.localStorage.setItem(
        'lyra_playlists_v1',
        JSON.stringify(seedPlaylist(cultoId))
      );
      win.localStorage.setItem(
        'lyra_cultos_manuais_v1',
        JSON.stringify([{ id: cultoId, label: cultoLabel }])
      );
    },
  });
}

function selecionarCulto(cultoId) {
  cy.get('#culto-dd-btn').click();
  cy.get('#culto-dd-menu').should('not.have.attr', 'hidden');
  cy.get(`#culto-dd-menu .culto-dd-item[data-value="${cultoId}"]`).click();
  cy.get('#culto-dd-menu').should('have.attr', 'hidden');
}

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('Playlist — gestão de músicas do culto', () => {
  let cultoId;
  let cultoLabel;

  before(() => {
    cultoId    = cultoE2eId();
    cultoLabel = cultoE2eLabel();
  });

  beforeEach(() => {
    cy.task('resetDb');
    visitComSeed(cultoId, cultoLabel);
    selecionarCulto(cultoId);
  });

  // ── Seleção de culto ──────────────────────────────────────────────────────
  it('dropdown mostra o culto de teste e atualiza a label do botão', () => {
    cy.get('#culto-sel').should('have.value', cultoId);
    cy.get('#culto-dd-desc').should('contain.text', 'Culto de Teste E2E');
  });

  // ── Renderização inicial ──────────────────────────────────────────────────
  it('playlist renderiza as 2 músicas do seed na ordem correta', () => {
    cy.get('#playlist-list .playlist-row[data-pl-idx]')
      .should('have.length', 2);
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"]')
      .should('contain.text', 'Música Teste A');
    cy.get('#playlist-list .playlist-row[data-pl-idx="1"]')
      .should('contain.text', 'Música Teste B');
  });

  // ── Botões de mover desabilitados nas extremidades ────────────────────────
  it('botão "subir" da primeira música está desabilitado', () => {
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-btn-subir')
      .should('be.disabled');
  });

  it('botão "descer" da última música está desabilitado', () => {
    cy.get('#playlist-list .playlist-row[data-pl-idx="1"] .pl-btn-descer')
      .should('be.disabled');
  });

  // ── Remover música ────────────────────────────────────────────────────────
  it('clique em remover exclui a primeira música da playlist', () => {
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-btn-remover')
      .click();
    cy.get('#playlist-list .playlist-row[data-pl-idx]')
      .should('have.length', 1);
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"]')
      .should('contain.text', 'Música Teste B');
  });

  // ── Reordenar músicas ─────────────────────────────────────────────────────
  it('botão "descer" da primeira música troca a sua posição com a segunda', () => {
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-btn-descer')
      .should('not.be.disabled')
      .click();
    // Após troca: A passa para idx 1, B passa para idx 0
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"]')
      .should('contain.text', 'Música Teste B');
    cy.get('#playlist-list .playlist-row[data-pl-idx="1"]')
      .should('contain.text', 'Música Teste A');
  });

  it('botão "subir" da segunda música troca a sua posição com a primeira', () => {
    cy.get('#playlist-list .playlist-row[data-pl-idx="1"] .pl-btn-subir')
      .should('not.be.disabled')
      .click();
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"]')
      .should('contain.text', 'Música Teste B');
    cy.get('#playlist-list .playlist-row[data-pl-idx="1"]')
      .should('contain.text', 'Música Teste A');
  });
});
