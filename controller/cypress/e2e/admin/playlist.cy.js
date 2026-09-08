/**
 * Etapa 3 — Testes de gestão da playlist do culto.
 *
 * Estratégia de isolamento:
 *  • cy.task('resetDb')  → reseta o banco SQLite (músicas IDs 1-2-3).
 *  • onBeforeLoad        → injeta seed em localStorage antes do JS do app correr.
 *    - lyra_playlists_v1 : playlist com 2 músicas para TODOS os cultos
 *      auto-gerados do mês (domingos _manha/_noite e quartas _quarta).
 *      Não usa cultos manuais — evita interferência de aplicarSnapshotCompartilhado.
 *  • selecionarCulto()   → abre o dropdown e clica no PRIMEIRO item disponível.
 *
 * Por que não usar cultos manuais:
 *  A função aplicarSnapshotCompartilhadoNoRenderer pode sobrescrever
 *  cultosManuaisCache em memória após o onBeforeLoad, removendo o culto
 *  injetado antes de initCultoSelect() popular o dropdown.
 *  Os cultos auto-gerados (domingos/quartas) são sempre reconstruídos pelo
 *  app a partir da data do sistema, independente de localStorage.
 */

// ── Gera IDs de todos os cultos auto-gerados do mês corrente ────────────────
function gerarCultosDoMes() {
  const hoje = new Date();
  const ano  = hoje.getFullYear();
  const mes  = hoje.getMonth(); // 0-indexed
  const dias = new Date(ano, mes + 1, 0).getDate();
  const cultos = [];

  for (let dia = 1; dia <= dias; dia++) {
    const dow = new Date(ano, mes, dia).getDay(); // 0=dom, 3=qua
    const yy  = ano;
    const mm  = String(mes + 1).padStart(2, '0');
    const dd  = String(dia).padStart(2, '0');
    const iso = `${yy}-${mm}-${dd}`;

    if (dow === 0) {            // domingo
      cultos.push(`culto_${iso}_manha`);
      cultos.push(`culto_${iso}_noite`);
    } else if (dow === 3) {     // quarta-feira
      cultos.push(`culto_${iso}_quarta`);
    }
  }

  return cultos; // ex: ["culto_2026-09-02_quarta", "culto_2026-09-06_manha", ...]
}

// ── Seed de playlist para um culto ──────────────────────────────────────────
function seedItensCulto(cultoId) {
  return [
    {
      id: 1, titulo: 'Música Teste A', artista: 'Artista Teste',
      bancoFonte: 'user', cultoId, versaoLocalId: null, versaoRotulo: '',
    },
    {
      id: 2, titulo: 'Música Teste B', artista: 'Artista Teste',
      bancoFonte: 'user', cultoId, versaoLocalId: null, versaoRotulo: '',
    },
  ];
}

// Gera { cultoId1: [...], cultoId2: [...], ... } para todos os cultos do mês
function buildPlaylistSeedCompleto() {
  const cultos = gerarCultosDoMes();
  const obj = {};
  for (const id of cultos) {
    obj[id] = seedItensCulto(id);
  }
  return obj;
}

// ── Comandos reutilizáveis ───────────────────────────────────────────────────
function visitComSeed() {
  cy.visit('/controller.html', {
    onBeforeLoad(win) {
      win.localStorage.setItem(
        'lyra_playlists_v1',
        JSON.stringify(buildPlaylistSeedCompleto())
      );
      // NÃO injetamos lyra_cultos_manuais_v1 — usamos apenas cultos auto-gerados
    },
  });
}

/**
 * Abre o dropdown e clica no primeiro culto disponível (data-value não vazio).
 * Armazena o ID selecionado no alias @cultoId para uso nos testes.
 */
function selecionarCulto() {
  cy.get('#culto-dd-btn').click();
  cy.get('#culto-dd-menu').should('not.have.attr', 'hidden');

  // Pega o primeiro item real (não o placeholder vazio) e clica
  cy.get('#culto-dd-menu .culto-dd-item[data-value]')
    .not('[data-value=""]')
    .first()
    .then(($el) => {
      const id = $el.attr('data-value');
      cy.wrap(id).as('cultoId'); // @cultoId disponível nos testes
      cy.wrap($el).click();
    });

  cy.get('#culto-dd-menu').should('have.attr', 'hidden');
}

// ── Suite ────────────────────────────────────────────────────────────────────
describe('Playlist — gestão de músicas do culto', () => {
  beforeEach(() => {
    cy.task('resetDb');
    visitComSeed();
    selecionarCulto();
  });

  // ── Seleção de culto ──────────────────────────────────────────────────────
  it('dropdown seleciona um culto e atualiza a label do botão', function () {
    cy.get('#culto-sel').invoke('val').should('match', /^culto_\d{4}-\d{2}-\d{2}_/);
    cy.get('#culto-dd-desc').invoke('text').should('not.be.empty');
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
