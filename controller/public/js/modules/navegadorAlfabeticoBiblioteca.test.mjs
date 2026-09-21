import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LETRAS_NAVEGADOR_BIBLIOTECA,
  letraNavegavelMaisProxima,
  letraAtualDoScrollBiblioteca,
  letraSobPosicaoNavegador,
} from './navegadorAlfabeticoBiblioteca.js';

test('26 letras, A a Z, na ordem', () => {
  assert.equal(LETRAS_NAVEGADOR_BIBLIOTECA.length, 26);
  assert.equal(LETRAS_NAVEGADOR_BIBLIOTECA[0], 'A');
  assert.equal(LETRAS_NAVEGADOR_BIBLIOTECA[25], 'Z');
});

test('letra disponível: fica nela mesma', () => {
  const letra = letraNavegavelMaisProxima({ letra: 'M', disponiveis: new Set(['A', 'M', 'Z']) });
  assert.equal(letra, 'M');
});

test('letra sem música: avança para a próxima que existe', () => {
  const letra = letraNavegavelMaisProxima({ letra: 'N', disponiveis: new Set(['A', 'P', 'Z']) });
  assert.equal(letra, 'P');
});

test('sem nada depois: volta para a mais próxima antes', () => {
  const letra = letraNavegavelMaisProxima({ letra: 'Y', disponiveis: new Set(['A', 'J']) });
  assert.equal(letra, 'J');
});

test('aceita array além de Set', () => {
  const letra = letraNavegavelMaisProxima({ letra: 'B', disponiveis: ['A', 'C'] });
  assert.equal(letra, 'C');
});

test('nenhuma letra disponível: null', () => {
  assert.equal(letraNavegavelMaisProxima({ letra: 'A', disponiveis: new Set() }), null);
  assert.equal(letraNavegavelMaisProxima({ letra: 'A', disponiveis: [] }), null);
});

test('letra fora do alfabeto (ex.: "#"): só existe se estiver disponível', () => {
  assert.equal(letraNavegavelMaisProxima({ letra: '#', disponiveis: new Set(['#', 'A']) }), '#');
  assert.equal(letraNavegavelMaisProxima({ letra: '#', disponiveis: new Set(['A']) }), null);
});

test('letra atual: o cabeçalho que já cruzou o topo', () => {
  const letra = letraAtualDoScrollBiblioteca({
    cabecalhos: [
      { letra: 'A', top: -400 },
      { letra: 'C', top: -20 },
      { letra: 'N', top: 180 },
    ],
  });
  assert.equal(letra, 'C');
});

test('letra atual: no topo de tudo, fica no primeiro cabeçalho', () => {
  const letra = letraAtualDoScrollBiblioteca({
    cabecalhos: [
      { letra: 'A', top: 12 },
      { letra: 'B', top: 240 },
    ],
  });
  assert.equal(letra, 'A');
});

test('letra atual: sem cabeçalhos, null', () => {
  assert.equal(letraAtualDoScrollBiblioteca({ cabecalhos: [] }), null);
  assert.equal(letraAtualDoScrollBiblioteca({ cabecalhos: null }), null);
});

test('letra sob a posição: dentro do botão certo', () => {
  const botoes = [
    { letra: 'A', top: 0, bottom: 10 },
    { letra: 'B', top: 10, bottom: 20 },
    { letra: 'C', top: 20, bottom: 30 },
  ];
  assert.equal(letraSobPosicaoNavegador({ y: 15, botoes }), 'B');
});

test('letra sob a posição: acima do primeiro gruda nele', () => {
  const botoes = [
    { letra: 'A', top: 10, bottom: 20 },
    { letra: 'B', top: 20, bottom: 30 },
  ];
  assert.equal(letraSobPosicaoNavegador({ y: -5, botoes }), 'A');
});

test('letra sob a posição: abaixo do último gruda nele', () => {
  const botoes = [
    { letra: 'Y', top: 10, bottom: 20 },
    { letra: 'Z', top: 20, bottom: 30 },
  ];
  assert.equal(letraSobPosicaoNavegador({ y: 999, botoes }), 'Z');
});

test('letra sob a posição: sem botões, null', () => {
  assert.equal(letraSobPosicaoNavegador({ y: 10, botoes: [] }), null);
});
