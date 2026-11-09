import test from 'node:test';
import assert from 'node:assert/strict';
import {
  indiceSlidePorNumero,
  alvoEhCampoDeDigitacao,
  criarIrParaSlideNumero,
} from './slidesIrParaNumero.js';

test('indiceSlidePorNumero: 1…N viram índice 0…N-1; o resto é inválido', () => {
  assert.equal(indiceSlidePorNumero('1', 14), 0);
  assert.equal(indiceSlidePorNumero('2', 14), 1);
  assert.equal(indiceSlidePorNumero('14', 14), 13);
  assert.equal(indiceSlidePorNumero('0', 14), null);
  assert.equal(indiceSlidePorNumero('15', 14), null);
  assert.equal(indiceSlidePorNumero('', 14), null);
  assert.equal(indiceSlidePorNumero('abc', 14), null);
  assert.equal(indiceSlidePorNumero('3', 0), null);
});

test('alvoEhCampoDeDigitacao: campos de texto sim; botão e o próprio campo não', () => {
  assert.equal(alvoEhCampoDeDigitacao({ tagName: 'INPUT', id: 'busca' }, 'meu'), true);
  assert.equal(alvoEhCampoDeDigitacao({ tagName: 'TEXTAREA' }, 'meu'), true);
  assert.equal(alvoEhCampoDeDigitacao({ tagName: 'SELECT' }, 'meu'), true);
  assert.equal(alvoEhCampoDeDigitacao({ tagName: 'DIV', isContentEditable: true }, 'meu'), true);
  assert.equal(alvoEhCampoDeDigitacao({ tagName: 'BUTTON' }, 'meu'), false);
  assert.equal(alvoEhCampoDeDigitacao({ tagName: 'INPUT', id: 'meu' }, 'meu'), false);
  assert.equal(alvoEhCampoDeDigitacao(null, 'meu'), false);
});

function montar(over = {}) {
  const projetados = [];
  global.document = { getElementById: () => null, addEventListener() {} };
  const c = criarIrParaSlideNumero({
    ehModoSlides: () => true,
    totalEstrofes: () => 14,
    projetar: (i) => projetados.push(i),
    ...over,
  });
  const tecla = (key, extra = {}) => c.tratarKeydown({ key, target: { tagName: 'BUTTON' }, ...extra });
  return { c, tecla, projetados };
}

test('digitar 2 e Enter projeta o slide 2 (índice 1)', () => {
  const { tecla, projetados, c } = montar();
  assert.equal(tecla('2'), true);
  assert.equal(c.getDigitos(), '2');
  assert.equal(tecla('Enter'), true);
  assert.deepEqual(projetados, [1]);
  assert.equal(c.getDigitos(), '');
});

test('aceita mais de um dígito', () => {
  const { tecla, projetados } = montar();
  tecla('1');
  tecla('2');
  tecla('Enter');
  assert.deepEqual(projetados, [11]);
});

test('número inválido não projeta e limpa o campo', () => {
  const { tecla, projetados, c } = montar();
  tecla('9');
  tecla('9');
  tecla('Enter');
  assert.deepEqual(projetados, []);
  assert.equal(c.getDigitos(), '');
});

test('sem número pendente, Enter e Backspace seguem para a navegação normal', () => {
  const { tecla } = montar();
  assert.equal(tecla('Enter'), false);
  assert.equal(tecla('Backspace'), false);
});

test('Backspace apaga o último dígito; Esc descarta mas não é consumido', () => {
  const { tecla, c } = montar();
  tecla('1');
  tecla('2');
  assert.equal(tecla('Backspace'), true);
  assert.equal(c.getDigitos(), '1');
  assert.equal(tecla('Escape'), false);
  assert.equal(c.getDigitos(), '');
});

test('não captura em campo de texto, com modificador, fora do modo slides ou com modal', () => {
  const m1 = montar();
  assert.equal(m1.c.tratarKeydown({ key: '2', target: { tagName: 'INPUT', id: 'busca' } }), false);
  const m2 = montar();
  assert.equal(m2.tecla('2', { ctrlKey: true }), false);
  const m3 = montar({ ehModoSlides: () => false });
  assert.equal(m3.tecla('2'), false);
  const m4 = montar({ interfaceBloqueada: () => true });
  assert.equal(m4.tecla('2'), false);
  assert.equal(m4.c.getDigitos(), '');
});
