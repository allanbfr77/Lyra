'use strict';

/**
 * O diário de bordo tem um requisito acima de todos: **nunca derrubar a projeção**.
 * Metade destes testes é sobre isso — disco cheio, pasta sem permissão, dados estranhos.
 * A outra metade é sobre o ficheiro continuar legível depois de meses de cultos.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  criarDiagnosticoJanelas,
  criarDiagnosticoNulo,
  formatarLinha,
  valorLegivel,
} = require('./janelasDiagnostico');

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-diag-'));
}

test('grava uma linha por evento, com cabeçalho de sessão à cabeça', () => {
  const dir = pastaTemporaria();
  const alvo = path.join(dir, 'telas.log');
  const diario = criarDiagnosticoJanelas({ caminhoArquivo: alvo, rotulo: 'Teste 1.0' });

  diario.registar('abrir', { papel: 'publico', indice: 1 });
  diario.registar('mostrar', { papel: 'publico', indice: 1, vis: true });

  const linhas = fs.readFileSync(alvo, 'utf8').split('\n').filter(Boolean);
  assert.match(linhas[0], /^=== sessão .* Teste 1\.0 .* pid=\d+/);
  assert.match(linhas[1], /abrir\s+publico@1/);
  assert.match(linhas[2], /mostrar\s+publico@1\s+vis=1/);
});

test('caminho pode ser função — é assim que as `paths` deste projecto entregam', () => {
  const dir = pastaTemporaria();
  const alvo = path.join(dir, 'telas.log');
  const diario = criarDiagnosticoJanelas({ caminhoArquivo: () => alvo });
  diario.registar('abrir', { papel: 'fundo', indice: 2 });
  assert.strictEqual(diario.caminho(), alvo);
  assert.match(fs.readFileSync(alvo, 'utf8'), /fundo@2/);
});

test('sem caminho não há diário — devolve o nulo em vez de rebentar', () => {
  const diario = criarDiagnosticoJanelas({ caminhoArquivo: '' });
  assert.strictEqual(diario.caminho(), null);
  assert.doesNotThrow(() => diario.registar('abrir', { papel: 'publico', indice: 1 }));
});

test('cria a pasta que ainda não existe', () => {
  const dir = pastaTemporaria();
  const alvo = path.join(dir, 'sub', 'pasta', 'telas.log');
  const diario = criarDiagnosticoJanelas({ caminhoArquivo: alvo });
  diario.registar('abrir', { papel: 'relogio', indice: 2 });
  assert.ok(fs.existsSync(alvo));
});

test('roda o ficheiro no tecto e guarda exactamente um anterior', () => {
  const dir = pastaTemporaria();
  const alvo = path.join(dir, 'telas.log');
  const diario = criarDiagnosticoJanelas({ caminhoArquivo: alvo, limiteBytes: 400 });

  for (let i = 0; i < 40; i += 1) {
    diario.registar('mover', { papel: 'publico', indice: 1, de: { x: i, y: 0, width: 1, height: 1 } });
  }

  assert.ok(fs.existsSync(alvo), 'o ficheiro actual continua lá');
  assert.ok(fs.existsSync(path.join(dir, 'telas.1.log')), 'e existe um anterior');
  assert.deepStrictEqual(
    fs.readdirSync(dir).sort(),
    ['telas.1.log', 'telas.log'],
    'nunca mais do que dois — um culto por semana durante anos não pode encher o disco'
  );
});

test('escrita que falha sempre desiste em silêncio, sem lançar', () => {
  let tentativas = 0;
  const fsQueFalha = {
    mkdirSync: () => {},
    statSync: () => { throw new Error('sem ficheiro'); },
    rmSync: () => {},
    renameSync: () => {},
    appendFileSync: () => { tentativas += 1; throw new Error('disco cheio'); },
  };
  const diario = criarDiagnosticoJanelas({ caminhoArquivo: '/qualquer/telas.log', fsImpl: fsQueFalha });

  for (let i = 0; i < 50; i += 1) {
    assert.doesNotThrow(() => diario.registar('abrir', { papel: 'publico', indice: 1 }));
  }
  assert.ok(tentativas > 0, 'chegou a tentar');
  assert.ok(tentativas <= 5, `desiste depois de poucas falhas seguidas (tentou ${tentativas})`);
});

test('o diário nulo aceita tudo e não devolve caminho', () => {
  const nulo = criarDiagnosticoNulo();
  assert.strictEqual(nulo.caminho(), null);
  assert.doesNotThrow(() => nulo.registar('seja-o-que-for', { papel: 'x' }));
});

test('valores ficam legíveis numa coluna só', () => {
  assert.strictEqual(valorLegivel(true), '1');
  assert.strictEqual(valorLegivel(false), '0');
  assert.strictEqual(valorLegivel(null), '-');
  assert.strictEqual(valorLegivel(undefined), '-');
  assert.strictEqual(valorLegivel(''), '-');
  assert.strictEqual(valorLegivel(0), '0');
  assert.strictEqual(
    valorLegivel({ x: 1920, y: 0, width: 1280, height: 720 }),
    '1280x720+1920+0',
    'bounds na notação curta que ainda diz as quatro coisas'
  );
  assert.strictEqual(valorLegivel('com espaço'), '"com espaço"');
  assert.strictEqual(valorLegivel([1, 2]), '1,2');
});

test('a linha alinha as colunas e traz o delta face à anterior', () => {
  const linha = formatarLinha(Date.parse('2026-09-05T22:14:03.118Z'), 284, 'ready-to-show', {
    papel: 'publico',
    indice: 1,
    quadro: true,
  });
  assert.match(linha, /^2026-09-05T22:14:03\.118Z \+00284ms ready-to-show {4}publico@1 {5}quadro=1\n$/);
});

test('janela sem papel conhecido não quebra a coluna do alvo', () => {
  const linha = formatarLinha(0, 0, 'fechar', { motivo: 'rota-vazia' });
  assert.match(linha, /fechar\s+-\s+motivo=rota-vazia/);
});
