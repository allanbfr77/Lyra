import test from 'node:test';
import assert from 'node:assert/strict';
import {
  capturarAncoraScrollBiblioteca,
  escolherChaveRestauroBiblioteca,
  clamparScrollTopBiblioteca,
  scrollTopParaAncoraBiblioteca,
} from './ancoraScrollBiblioteca.js';

const ALTURA = 48;

/** Lista de linhas já medidas em relação ao topo visível, com a primeira em `top`. */
function linhas(chaves, top = 0, altura = ALTURA) {
  return chaves.map((chave, i) => ({
    chave,
    top: top + i * altura,
    bottom: top + i * altura + altura,
  }));
}

function existeEm(vivas) {
  const set = new Set(vivas);
  return (chave) => set.has(chave);
}

test('âncora é a primeira linha que a área visível mostra', () => {
  const a = capturarAncoraScrollBiblioteca({
    scrollTop: 900,
    linhas: linhas(['user:10', 'user:11', 'user:12'], -10),
  });
  assert.equal(a.chave, 'user:10');
  assert.equal(a.indice, 0);
  assert.equal(a.deslocamento, -10);
  assert.equal(a.scrollTop, 900);
  assert.deepEqual(a.chaves, ['user:10', 'user:11', 'user:12']);
});

test('linha que já saiu por cima não serve de âncora', () => {
  const a = capturarAncoraScrollBiblioteca({
    scrollTop: 500,
    /* A primeira acabou acima da dobra: só o seu `bottom` negativo a distingue. */
    linhas: linhas(['user:1', 'user:2', 'user:3'], -ALTURA - 4),
  });
  assert.equal(a.chave, 'user:2');
  assert.equal(a.indice, 1);
});

test('lista sem linhas visíveis não dá âncora', () => {
  assert.equal(capturarAncoraScrollBiblioteca({ scrollTop: 0, linhas: [] }), null);
  assert.equal(capturarAncoraScrollBiblioteca({ scrollTop: 0, linhas: null }), null);
});

test('âncora sobrevivente é a própria', () => {
  const a = capturarAncoraScrollBiblioteca({ scrollTop: 800, linhas: linhas(['user:7', 'user:8']) });
  const chave = escolherChaveRestauroBiblioteca({ ancora: a, existeChave: existeEm(['user:7', 'user:8']) });
  assert.equal(chave, 'user:7');
});

test('excluída a música da âncora, segue-se a seguinte visível', () => {
  const a = capturarAncoraScrollBiblioteca({
    scrollTop: 800,
    linhas: linhas(['user:7', 'user:8', 'user:9']),
  });
  const chave = escolherChaveRestauroBiblioteca({ ancora: a, existeChave: existeEm(['user:8', 'user:9']) });
  assert.equal(chave, 'user:8');
});

test('excluída a última da região, recua para a anterior em vez de ir ao topo', () => {
  const a = capturarAncoraScrollBiblioteca({
    scrollTop: 1200,
    linhas: linhas(['user:20', 'user:21', 'user:22'], -20),
  });
  /* Nenhuma das seguintes sobreviveu; a de trás fica mais perto do que estava. */
  const chave = escolherChaveRestauroBiblioteca({ ancora: a, existeChave: existeEm(['user:19']) });
  assert.equal(chave, null, 'só as que estavam visíveis entram na procura');

  const b = capturarAncoraScrollBiblioteca({
    scrollTop: 1200,
    linhas: linhas(['user:19', 'user:20', 'user:21'], -20),
  });
  assert.equal(b.indice, 0);
  const c = capturarAncoraScrollBiblioteca({
    scrollTop: 1200,
    linhas: linhas(['user:19', 'user:20', 'user:21'], -ALTURA - 4),
  });
  assert.equal(c.indice, 1);
  assert.equal(
    escolherChaveRestauroBiblioteca({ ancora: c, existeChave: existeEm(['user:19']) }),
    'user:19'
  );
});

test('lote que levou tudo o que estava à vista não dá chave', () => {
  const a = capturarAncoraScrollBiblioteca({ scrollTop: 700, linhas: linhas(['user:1', 'user:2']) });
  assert.equal(escolherChaveRestauroBiblioteca({ ancora: a, existeChave: existeEm([]) }), null);
  assert.equal(escolherChaveRestauroBiblioteca({ ancora: null, existeChave: existeEm(['user:1']) }), null);
});

test('scrollTop devolve à linha a mesma distância do topo visível', () => {
  /* A linha reencontrada subiu 48px (a excluída era acima dela): o scroll sobe 48. */
  const novo = scrollTopParaAncoraBiblioteca({
    scrollTop: 1000,
    topoLinha: -20 - ALTURA,
    deslocamento: -20,
    scrollMaximo: 5000,
  });
  assert.equal(novo, 1000 - ALTURA);
});

test('sem deslocamento a pagar, o scroll não se move', () => {
  const novo = scrollTopParaAncoraBiblioteca({
    scrollTop: 640,
    topoLinha: -12,
    deslocamento: -12,
    scrollMaximo: 5000,
  });
  assert.equal(novo, 640);
});

test('lista encurtada: o alvo nunca passa do fim nem fica negativo', () => {
  assert.equal(
    scrollTopParaAncoraBiblioteca({ scrollTop: 900, topoLinha: 400, deslocamento: 0, scrollMaximo: 1000 }),
    1000
  );
  assert.equal(
    scrollTopParaAncoraBiblioteca({ scrollTop: 30, topoLinha: -200, deslocamento: 0, scrollMaximo: 1000 }),
    0
  );
});

test('clamp aceita lista que já não rola', () => {
  assert.equal(clamparScrollTopBiblioteca(800, 0), 0);
  assert.equal(clamparScrollTopBiblioteca(800, -5), 0);
  assert.equal(clamparScrollTopBiblioteca(120, 1000), 120);
  assert.equal(clamparScrollTopBiblioteca(Number.NaN, 1000), 0);
});
