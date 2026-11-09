import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LYRA_MANUAL_SECTIONS,
  LYRA_SHORTCUT_GROUPS,
  nomeTeclaPtBrLyra,
  renderizarAtalhosLyra,
  renderizarTabelaAtalhosLyra,
  montarHtmlManualLyra,
  montarHtmlAtalhosLyra,
  montarHtmlSobreLyra,
  montarHtmlStatusReinicioServidor,
} from './lyraMenuConteudo.js';

/* `escapeHtml` usa o DOM (textContent → innerHTML). DOM mínimo com o mesmo escape do navegador. */
globalThis.document = {
  createElement: () => {
    let texto = '';
    return {
      set textContent(v) { texto = String(v); },
      get innerHTML() { return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
    };
  },
};

test('dados do manual e dos atalhos têm a forma esperada', () => {
  assert.ok(LYRA_MANUAL_SECTIONS.length > 0);
  for (const s of LYRA_MANUAL_SECTIONS) {
    assert.equal(typeof s.title, 'string');
    assert.ok(Array.isArray(s.items) && s.items.length > 0);
  }
  assert.ok(LYRA_SHORTCUT_GROUPS.length > 0);
  for (const g of LYRA_SHORTCUT_GROUPS) {
    assert.equal(typeof g.title, 'string');
    assert.ok(g.rows.length > 0);
    for (const r of g.rows) {
      assert.ok(r.keys && r.keys.length > 0);
      assert.equal(typeof r.action, 'string');
    }
  }
});

test('nomeTeclaPtBrLyra traduz teclas conhecidas e devolve as demais como vieram', () => {
  assert.equal(nomeTeclaPtBrLyra('ArrowRight'), 'Seta Direita');
  assert.equal(nomeTeclaPtBrLyra('Escape'), 'Esc');
  assert.equal(nomeTeclaPtBrLyra('Space'), 'Barra de Espaço');
  assert.equal(nomeTeclaPtBrLyra('F9'), 'F9');
  assert.equal(nomeTeclaPtBrLyra(null), '');
  assert.equal(nomeTeclaPtBrLyra(undefined), '');
});

test('renderizarAtalhosLyra separa alternativas com «ou» e escapa o texto', () => {
  assert.equal(renderizarAtalhosLyra('Enter'), '<kbd>Enter</kbd>');
  assert.equal(
    renderizarAtalhosLyra(['ArrowRight', 'PageDown']),
    '<kbd>Seta Direita</kbd><span class="lyra-shortcuts-alt">ou</span><kbd>Page Down</kbd>'
  );
  assert.ok(!renderizarAtalhosLyra('<b>x</b>').includes('<b>'));
});

test('renderizarTabelaAtalhosLyra monta cabeçalho, linhas e escapa a ação', () => {
  const html = renderizarTabelaAtalhosLyra([{ keys: ['Enter'], action: 'a <i>b</i>' }]);
  assert.ok(html.includes('<th>Atalho</th>') && html.includes('<th>Ação</th>'));
  assert.ok(html.includes('<kbd>Enter</kbd>'));
  assert.ok(html.includes('a &lt;i&gt;b&lt;/i&gt;'));
  assert.ok(!html.includes('<i>'));
});

test('montarHtmlManualLyra lista todas as seções', () => {
  const html = montarHtmlManualLyra();
  for (const s of LYRA_MANUAL_SECTIONS) assert.ok(html.includes(`<h3>${s.title}</h3>`), s.title);
  assert.ok(html.includes('lyra-doc-callout'));
});

test('montarHtmlAtalhosLyra tem uma tabela por grupo', () => {
  const html = montarHtmlAtalhosLyra();
  assert.equal((html.match(/<table class="lyra-shortcuts-table">/g) || []).length, LYRA_SHORTCUT_GROUPS.length);
  for (const g of LYRA_SHORTCUT_GROUPS) assert.ok(html.includes(`<h3>${g.title}</h3>`), g.title);
});

test('montarHtmlSobreLyra escapa a versão e tem valor padrão', () => {
  assert.ok(montarHtmlSobreLyra('1.10.0').includes('Versão 1.10.0'));
  assert.ok(montarHtmlSobreLyra('').includes('Não disponível'));
  const mau = montarHtmlSobreLyra('<script>x</script>');
  assert.ok(!mau.includes('<script>'));
  assert.ok(mau.includes('&lt;script&gt;'));
});

test('montarHtmlStatusReinicioServidor cobre sucesso, erro e progresso', () => {
  const ok = montarHtmlStatusReinicioServidor('success', 'feito');
  assert.ok(ok.includes('lyra-status-indicator--success') && ok.includes('Servidor disponível') && ok.includes('>OK<'));
  const erro = montarHtmlStatusReinicioServidor('error', 'falhou');
  assert.ok(erro.includes('lyra-status-indicator--error') && erro.includes('Reinício não concluído') && erro.includes('>!<'));
  const prog = montarHtmlStatusReinicioServidor('progress', '');
  assert.ok(prog.includes('lyra-status-indicator--progress') && prog.includes('Processando reinício'));
  assert.ok(prog.includes('Aguarde alguns instantes.'));
  assert.ok(!montarHtmlStatusReinicioServidor('error', '<i>').includes('<i>'));
});
