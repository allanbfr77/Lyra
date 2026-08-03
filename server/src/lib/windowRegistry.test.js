'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { createWindowRegistry } = require('./windowRegistry');

function entrada(role, index) {
  return { role, index, win: { id: `${role}-${index}`, isDestroyed: () => false } };
}

test('começa vazio e conta o que foi adicionado', () => {
  const r = createWindowRegistry();
  assert.strictEqual(r.tamanho(), 0);
  assert.deepStrictEqual(r.todas(), []);

  r.adicionar(entrada('publico', 1));
  r.adicionar(entrada('relogio', 2));
  assert.strictEqual(r.tamanho(), 2);
});

test('cada registo é independente (nada de estado partilhado entre instâncias)', () => {
  const a = createWindowRegistry();
  const b = createWindowRegistry();
  a.adicionar(entrada('publico', 1));
  assert.strictEqual(a.tamanho(), 1);
  assert.strictEqual(b.tamanho(), 0);
});

test('todas() devolve cópia do array mas as MESMAS entradas', () => {
  const r = createWindowRegistry();
  const e = entrada('publico', 1);
  r.adicionar(e);

  const lista = r.todas();
  lista.push(entrada('intruso', 9));
  assert.strictEqual(r.tamanho(), 1, 'mexer na cópia não mexe no registo');

  /* As entradas têm de ser as mesmas referências: o motor anota estado nelas
     (ex.: `entry.ocultoParaRelogio`) e essa anotação tem de sobreviver. */
  assert.strictEqual(r.todas()[0], e);
  r.todas()[0].ocultoParaRelogio = true;
  assert.strictEqual(r.todas()[0].ocultoParaRelogio, true);
});

test('porRole e vivasPorRole', () => {
  const r = createWindowRegistry();
  const viva = entrada('publico', 1);
  const morta = { role: 'publico', index: 2, win: { isDestroyed: () => true } };
  r.adicionar(viva);
  r.adicionar(morta);
  r.adicionar(entrada('relogio', 3));

  assert.strictEqual(r.porRole('publico').length, 2);
  assert.strictEqual(r.porRole('relogio').length, 1);
  assert.strictEqual(r.porRole('ministrante').length, 0);

  assert.deepStrictEqual(r.vivasPorRole('publico'), [viva], 'janela destruída não conta como viva');
});

test('remover tira só quem satisfaz o predicado', () => {
  const r = createWindowRegistry();
  const manter = entrada('publico', 1);
  r.adicionar(manter);
  r.adicionar(entrada('escudo', 2));
  r.adicionar(entrada('escudo', 3));

  r.remover((e) => e.role === 'escudo');
  assert.deepStrictEqual(r.todas(), [manter]);
});

test('substituirPor troca o conteúdo e copia a lista recebida', () => {
  const r = createWindowRegistry();
  r.adicionar(entrada('publico', 1));

  const nova = [entrada('ministrante', 2)];
  r.substituirPor(nova);
  assert.strictEqual(r.tamanho(), 1);
  assert.strictEqual(r.todas()[0].role, 'ministrante');

  nova.push(entrada('intruso', 9));
  assert.strictEqual(r.tamanho(), 1, 'mexer na lista original não mexe no registo');

  r.substituirPor(undefined);
  assert.strictEqual(r.tamanho(), 0, 'entrada inválida esvazia em vez de rebentar');
});

test('limpar esvazia sem tocar nas janelas (quem fecha é o motor)', () => {
  const r = createWindowRegistry();
  const e = entrada('publico', 1);
  let fechou = false;
  e.win.close = () => { fechou = true; };
  r.adicionar(e);

  r.limpar();
  assert.strictEqual(r.tamanho(), 0);
  assert.strictEqual(fechou, false);
});
