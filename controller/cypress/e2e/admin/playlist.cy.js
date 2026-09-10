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

  // ── Menu kebab da linha ──────────────────────────────────────
  /*
    O ícone existe sempre no DOM (só muda de opacidade), e é disso que depende a coluna
    do tom não saltar entre o repouso e o hover — daí o teste olhar para a existência do
    botão e não para a visibilidade dele.
  */
  it('cada música tem alça de arrasto e kebab de ações sempre no DOM', () => {
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-grip').should('exist');
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-btn-kebab').should('exist');
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-btn-kebab')
      .should('have.attr', 'aria-expanded', 'false');
  });

  it('kebab abre o menu com «Resetar» e «Excluir»', () => {
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-btn-kebab')
      .click({ force: true });
    cy.get('#playlist-linha-ctx-menu').should('not.have.attr', 'hidden');
    cy.get('#playlist-linha-ctx-menu .menu-flutuante-item')
      .should('have.length', 2)
      .then(($itens) => {
        expect($itens.eq(0)).to.contain.text('Resetar');
        expect($itens.eq(1)).to.contain.text('Excluir');
      });
  });

  // ── Remover música ─────────────────────────────────────────
  it('«Excluir» no menu do kebab remove a primeira música da playlist', () => {
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-btn-kebab')
      .click({ force: true });
    cy.get('#playlist-linha-ctx-menu .menu-flutuante-item')
      .contains('Excluir')
      .click();
    cy.get('#playlist-list .playlist-row[data-pl-idx]')
      .should('have.length', 1);
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"]')
      .should('contain.text', 'Música Teste B');
  });

  // ── Resetar ───────────────────────────────────────────────
  /*
    «Resetar» é do culto, não da linha de onde o menu foi aberto: limpa o tom de todas as
    músicas e o ministrante do culto, sem tirar nenhuma música da playlist.
  */
  it('«Resetar» no menu do kebab limpa os tons de toda a playlist', () => {
    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-sel-tom')
      .select('E')
      .should('have.value', 'E');
    cy.get('#playlist-list .playlist-row[data-pl-idx="1"] .pl-sel-tom')
      .select('G')
      .should('have.value', 'G');

    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-btn-kebab')
      .click({ force: true });
    cy.get('#playlist-linha-ctx-menu .menu-flutuante-item')
      .contains('Resetar')
      .click();

    cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-sel-tom')
      .should('have.value', '');
    cy.get('#playlist-list .playlist-row[data-pl-idx="1"] .pl-sel-tom')
      .should('have.value', '');
    /* Repor não remove músicas. */
    cy.get('#playlist-list .playlist-row[data-pl-idx]').should('have.length', 2);
    cy.get('#culto-ministrante-sel').should('have.value', '');
  });

  // ── Reordenar músicas ───────────────────────────────────
  /*
    As setas ↑↓ saíram: a ordem muda arrastando a alça. O `dataTransfer` é montado à mão
    porque o Cypress não gera eventos de arrasto nativos — o que se testa é a reacção do
    painel aos eventos, que é onde vive a lógica de reordenação.
  */
  it('arrastar a primeira música para baixo da segunda troca a ordem', () => {
    cy.window().then((win) => {
      const dt = new win.DataTransfer();
      cy.get('#playlist-list .playlist-row[data-pl-idx="0"] .pl-grip')
        .trigger('dragstart', { dataTransfer: dt });
      cy.get('#playlist-list .playlist-row[data-pl-idx="1"]').then(($alvo) => {
        const r = $alvo[0].getBoundingClientRect();
        /* Metade de baixo da linha 2 = entrar depois dela. */
        const clientY = r.top + r.height * 0.75;
        cy.wrap($alvo)
          .trigger('dragover', { dataTransfer: dt, clientY })
          .trigger('drop', { dataTransfer: dt, clientY });
      });
    });

    cy.get('#playlist-list .playlist-row[data-pl-idx="0"]')
      .should('contain.text', 'Música Teste B');
    cy.get('#playlist-list .playlist-row[data-pl-idx="1"]')
      .should('contain.text', 'Música Teste A');
  });
});
