import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCS_EXTENSOES_ACEITES,
  extensaoDoNomeDeArquivo,
  ehArquivoDocumentoAceite,
  rotuloTipoDocumento,
  docsChavePdfInterno,
  docsChavePagina,
  docsHaPaginaProjetada,
  docsPaginaSelecionadaAtual,
  carregarDocsBibliotecaDoStorage,
  renderListaDocsImportados,
  registrarDependenciasDocs,
} from './docs.js';

test('extensões aceitas: PowerPoint, PDF e Word', () => {
  assert.deepEqual([...DOCS_EXTENSOES_ACEITES].sort(), ['.doc', '.docx', '.pdf', '.ppt', '.pptx']);
});

test('extensaoDoNomeDeArquivo: minúscula, sem extensão e arquivo oculto', () => {
  assert.equal(extensaoDoNomeDeArquivo('Culto.PDF'), '.pdf');
  assert.equal(extensaoDoNomeDeArquivo('a.b.pptx'), '.pptx');
  assert.equal(extensaoDoNomeDeArquivo('semextensao'), '');
  assert.equal(extensaoDoNomeDeArquivo('.oculto'), '');
  assert.equal(extensaoDoNomeDeArquivo(null), '');
  assert.equal(extensaoDoNomeDeArquivo(undefined), '');
});

test('ehArquivoDocumentoAceite: a extensão manda, não o accept do input', () => {
  for (const n of ['a.pdf', 'a.PDF', 'a.ppt', 'a.pptx', 'a.doc', 'a.DOCX']) assert.equal(ehArquivoDocumentoAceite(n), true, n);
  for (const n of ['foto.png', 'texto.txt', 'planilha.xlsx', 'semextensao', '', null]) assert.equal(ehArquivoDocumentoAceite(n), false, String(n));
});

test('rotuloTipoDocumento', () => {
  assert.equal(rotuloTipoDocumento('a.pdf'), 'PDF');
  assert.equal(rotuloTipoDocumento('a.ppt'), 'PowerPoint');
  assert.equal(rotuloTipoDocumento('a.PPTX'), 'PowerPoint');
  assert.equal(rotuloTipoDocumento('a.doc'), 'Word');
  assert.equal(rotuloTipoDocumento('a.docx'), 'Word');
  assert.equal(rotuloTipoDocumento('a.xyz'), 'documento');
});

test('chaves de PDF interno e de página', () => {
  assert.equal(docsChavePdfInterno('abc'), 'abc:pdf');
  assert.equal(docsChavePdfInterno(null), ':pdf');
  assert.equal(docsChavePagina('abc', 3), 'abc#3');
  assert.equal(docsChavePagina('abc', '0'), 'abc#0');
});

test('estado inicial exposto ao núcleo: nada projetado, nenhuma página selecionada', () => {
  assert.equal(docsHaPaginaProjetada(), false);
  assert.equal(docsPaginaSelecionadaAtual(), -1);
});

test('registrarDependenciasDocs aceita valor vazio sem lançar', () => {
  assert.doesNotThrow(() => registrarDependenciasDocs(undefined));
  assert.doesNotThrow(() => registrarDependenciasDocs({}));
});

/** DOM e armazenamento mínimos para a lista da biblioteca. */
function criarEl() {
  const el = {
    children: [], style: {}, hidden: false, className: '', textContent: '', innerHTML: '', title: '', tabIndex: 0,
    attrs: {}, listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { cs.forEach((c) => this.children.push(c)); },
    addEventListener(t, fn) { this.listeners[t] = fn; },
    remove() {},
  };
  return el;
}

function montarAmbiente(storageDocs) {
  const lista = criarEl();
  const guardado = new Map();
  if (storageDocs !== undefined) guardado.set('lyra_docs_biblioteca_v1', storageDocs);
  globalThis.localStorage = {
    getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
    setItem: (k, v) => guardado.set(k, String(v)),
  };
  globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.document = {
    getElementById: (id) => (id === 'docs-lib-list' ? lista : null),
    querySelectorAll: () => [],
    createElement: () => criarEl(),
  };
  registrarDependenciasDocs({ apLibFecharMenus() {} });
  return lista;
}

/* O estado do módulo é privado e persiste entre testes: o caso corrompido roda primeiro, com a biblioteca ainda vazia
   (como no arranque do app). Lista corrompida não zera uma biblioteca já carregada — só não carrega nada. */
test('biblioteca: lista corrompida equivale a lista vazia (sem lançar)', () => {
  const lista = montarAmbiente('{isto não é json');
  assert.doesNotThrow(() => carregarDocsBibliotecaDoStorage());
  renderListaDocsImportados();
  assert.equal(lista.children.length, 1);
  assert.equal(lista.children[0].className, 'placeholder-msg ap-lib-empty');
});

test('biblioteca: carrega do armazenamento, ignora itens sem nome e desenha uma linha por documento', () => {
  const lista = montarAmbiente(JSON.stringify({
    version: 1,
    itens: [
      { id: 'd1', name: 'Aviso.pdf', size: 10 },
      { id: 'd2', name: '   ' },
      null,
      { id: 'd3', name: 'Culto.pptx' },
    ],
  }));
  carregarDocsBibliotecaDoStorage();
  renderListaDocsImportados();
  assert.equal(lista.children.length, 2);
  const nomes = lista.children.map((row) => row.children[1].children[0].textContent);
  assert.deepEqual(nomes, ['Aviso.pdf', 'Culto.pptx']);
  const tipos = lista.children.map((row) => row.children[1].children[1].textContent);
  assert.deepEqual(tipos, ['PDF', 'PowerPoint']);
  assert.equal(lista.children[0].getAttribute('role'), 'option');
});
