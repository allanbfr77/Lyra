import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMIAR_LINHA_ALTERADA,
  normalizarTextoComparativo,
  separarLinhasComparativo,
  tokenizarLinhaComparativo,
  compararPalavrasDaLinha,
  similaridadeLinhas,
  compararLetras,
  resumirComparacao,
} from './diffLetrasComparativo.js';

/** Reconstrói a linha a partir das partes — tem de bater com o original. */
function recompor(marca) {
  return marca.partes.map((p) => p.txt).join('');
}

function palavrasMarcadas(marca) {
  return marca.partes.filter((p) => p.mudou).map((p) => p.txt);
}

test('normalização unifica fins de linha sem tocar no resto', () => {
  assert.equal(normalizarTextoComparativo('a\r\nb\rc'), 'a\nb\nc');
  assert.equal(normalizarTextoComparativo('  a  '), '  a  ');
  assert.equal(normalizarTextoComparativo(null), '');
});

test('tokenização preserva palavras e espaços', () => {
  assert.deepEqual(tokenizarLinhaComparativo('Grande é  o Senhor'), [
    'Grande', ' ', 'é', '  ', 'o', ' ', 'Senhor',
  ]);
  assert.equal(tokenizarLinhaComparativo('a b').join(''), 'a b');
  assert.deepEqual(tokenizarLinhaComparativo(''), []);
});

test('textos idênticos não produzem nenhuma marca', () => {
  const txt = 'Grande é o Senhor\nE mui digno de louvor\n\nNa cidade do nosso Deus';
  const r = compararLetras(txt, txt);
  assert.equal(r.iguais, true);
  assert.deepEqual(r.totais, { alteradas: 0, exclusivasA: 0, exclusivasB: 0 });
  assert.ok(r.linhasA.every((l) => l.tipo === 'igual'));
  assert.ok(r.linhasB.every((l) => l.tipo === 'igual'));
  assert.equal(resumirComparacao(r), 'As duas versões são idênticas.');
});

test('idênticos a menos de CRLF continuam idênticos', () => {
  const r = compararLetras('linha 1\r\nlinha 2', 'linha 1\nlinha 2');
  assert.equal(r.iguais, true);
});

test('uma palavra trocada marca só a palavra, não a linha inteira', () => {
  const r = compararLetras('Grande é o Senhor', 'Grande é o Rei');
  assert.equal(r.iguais, false);
  assert.equal(r.linhasA[0].tipo, 'alterada');
  assert.equal(r.linhasB[0].tipo, 'alterada');
  assert.deepEqual(palavrasMarcadas(r.linhasA[0]), ['Senhor']);
  assert.deepEqual(palavrasMarcadas(r.linhasB[0]), ['Rei']);
  assert.equal(r.totais.alteradas, 1);
});

test('as partes recompõem exactamente a linha original', () => {
  const a = 'Ó  Senhor, quão  grande és Tu!';
  const b = 'Ó Senhor, quão bom és Tu!';
  const r = compararLetras(a, b);
  assert.equal(recompor(r.linhasA[0]), a);
  assert.equal(recompor(r.linhasB[0]), b);
});

test('espaço em branco alterado não vira palavra marcada', () => {
  const { a, b } = compararPalavrasDaLinha('um  dois', 'um dois');
  assert.deepEqual(a.filter((p) => p.mudou), []);
  assert.deepEqual(b.filter((p) => p.mudou), []);
});

test('linha só num dos lados é exclusiva desse lado', () => {
  const r = compararLetras('linha A\nlinha B', 'linha A');
  assert.equal(r.linhasA[0].tipo, 'igual');
  assert.equal(r.linhasA[1].tipo, 'exclusiva');
  assert.equal(r.totais.exclusivasA, 1);
  assert.equal(r.totais.exclusivasB, 0);
});

test('linha acrescentada no meio não desalinha as seguintes', () => {
  const r = compararLetras('um\ndois\ntrês', 'um\nnova\ndois\ntrês');
  assert.deepEqual(
    r.linhasA.map((l) => l.tipo),
    ['igual', 'igual', 'igual']
  );
  assert.deepEqual(
    r.linhasB.map((l) => l.tipo),
    ['igual', 'exclusiva', 'igual', 'igual']
  );
});

test('linhas sem nada em comum não são emparelhadas palavra a palavra', () => {
  const r = compararLetras('aleluia ao cordeiro', 'noite feliz de paz');
  assert.equal(r.linhasA[0].tipo, 'exclusiva');
  assert.equal(r.linhasB[0].tipo, 'exclusiva');
  assert.equal(r.totais.alteradas, 0);
});

test('similaridade vai de 0 a 1 e respeita o limiar', () => {
  assert.equal(similaridadeLinhas('', ''), 1);
  assert.equal(similaridadeLinhas('abc', ''), 0);
  assert.equal(similaridadeLinhas('um dois três', 'um dois três'), 1);
  assert.ok(similaridadeLinhas('um dois três quatro', 'um dois três cinco') >= LIMIAR_LINHA_ALTERADA);
  assert.ok(similaridadeLinhas('um dois três', 'sete oito nove') < LIMIAR_LINHA_ALTERADA);
});

test('estrofe inteira nova aparece como bloco exclusivo', () => {
  const a = 'verso um\n\nverso dois';
  const b = 'verso um\n\nverso novo\nmais um\n\nverso dois';
  const r = compararLetras(a, b);
  assert.equal(r.iguais, false);
  assert.equal(r.linhasB.filter((l) => l.tipo === 'exclusiva').length >= 1, true);
  // Nada do lado A foi inventado: as linhas que existem nos dois continuam iguais.
  assert.equal(r.linhasA.filter((l) => l.tipo === 'igual').length, 3);
});

test('linhas em branco iguais dos dois lados não são marcadas', () => {
  const r = compararLetras('a\n\nb', 'a\n\nc');
  assert.equal(r.linhasA[1].tipo, 'igual');
  assert.equal(r.linhasB[1].tipo, 'igual');
});

test('separarLinhasComparativo preserva linhas vazias das pontas', () => {
  assert.deepEqual(separarLinhasComparativo('\na\n'), ['', 'a', '']);
});

test('texto vazio dos dois lados é considerado igual', () => {
  const r = compararLetras('', '');
  assert.equal(r.iguais, true);
});

test('resumo descreve os tipos de diferença encontrados', () => {
  const r = compararLetras('um\ndois', 'um alterado');
  const txt = resumirComparacao(r);
  assert.match(txt, /linha/);
  assert.notEqual(txt, 'As duas versões são idênticas.');
});
