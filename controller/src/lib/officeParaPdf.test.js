'use strict';

/**
 * A conversão em si depende do Office e do Windows — o que se pode fixar aqui é a
 * decisão que a precede: que aplicação trata cada extensão, e o que o operador lê
 * quando corre mal.
 */

const test = require('node:test');
const assert = require('node:assert');
const { tipoOfficeDoNome, mensagemFalhaConversao, converterOfficeParaPdf } = require('./officeParaPdf');

test('cada extensão vai para a aplicação certa', () => {
  assert.equal(tipoOfficeDoNome('Culto.pptx'), 'powerpoint');
  assert.equal(tipoOfficeDoNome('Culto.ppt'), 'powerpoint');
  assert.equal(tipoOfficeDoNome('Ata.docx'), 'word');
  assert.equal(tipoOfficeDoNome('Ata.doc'), 'word');
  /* Maiúsculas e caminhos completos entram pela mesma porta. */
  assert.equal(tipoOfficeDoNome('C:\\Docs\\ATA FINAL.DOCX'), 'word');
});

test('PDF não é convertido — segue direto para o pdf.js', () => {
  assert.equal(tipoOfficeDoNome('Estudo.pdf'), null);
  assert.equal(tipoOfficeDoNome('foto.png'), null);
  assert.equal(tipoOfficeDoNome('sem-extensao'), null);
  assert.equal(tipoOfficeDoNome(''), null);
  assert.equal(tipoOfficeDoNome(null), null);
});

test('Office em falta é dito por palavras, não pelo código de erro do COM', () => {
  const msg = mensagemFalhaConversao(
    'powerpoint',
    'Retrieving the COM class factory for component with CLSID {91493441-5A91-11CF-8700-00AA0060263B} failed: 80040154'
  );
  assert.match(msg, /Office não parece estar instalado/);
});

test('Lyra elevado é dito como tal, não como 0x80080005', () => {
  const msg = mensagemFalhaConversao(
    'powerpoint',
    'Falha na recuperação de fábrica de classes COM do componente com CLSID {91493441-5A91-11CF-8700-00AA0060263B} devido ao seguinte erro: 80080005'
  );
  assert.match(msg, /sem «Executar como administrador»/);
});

test('outras falhas mantêm o motivo à vista', () => {
  assert.match(mensagemFalhaConversao('word', 'O arquivo está corrompido.'), /corrompido/);
});

test('fora do Windows devolve erro em vez de rejeitar', async (t) => {
  if (process.platform === 'win32') return t.skip('este caminho só existe fora do Windows');
  const r = await converterOfficeParaPdf({ origem: 'a.pptx', destino: 'a.pdf' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Windows/);
});
