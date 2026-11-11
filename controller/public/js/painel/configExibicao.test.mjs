import test from 'node:test';
import assert from 'node:assert/strict';
import './_stubDom.mjs';
import {
  CFG_ABAS_CTRL,
  CFG_DESTINOS_CTRL,
  CFG_ALIAS_ABA_CTRL,
  normalizarTermoCfg,
  resolverAbaCfgCtrl,
  sanitizarCfgSlidesLocal,
  lerCurrentCfgCtrl,
  iniciarConfigExibicao,
  registrarDependenciasConfigExibicao,
} from './configExibicao.js';

test('as oito abas do modal de Ajustes, na ordem do menu lateral', () => {
  assert.deepEqual(CFG_ABAS_CTRL, ['geral', 'conexao', 'slides', 'biblia', 'relogio', 'avisos', 'contagem', 'ministrantes']);
});

test('destinos: Slides e Bíblia têm destinos; os nomes antigos de aba viram aba + destino', () => {
  assert.deepEqual(CFG_DESTINOS_CTRL.slides, ['telao', 'ministrante']);
  assert.deepEqual(CFG_DESTINOS_CTRL.biblia, ['biblia-telao', 'biblia-ministrante', 'biblia-leitura']);
  for (const [alias, [aba, destino]] of Object.entries(CFG_ALIAS_ABA_CTRL)) {
    assert.ok(CFG_ABAS_CTRL.includes(aba), alias);
    assert.ok(CFG_DESTINOS_CTRL[aba].includes(destino), alias);
  }
});

test('resolverAbaCfgCtrl: alias vira [aba, destino]; aba comum vira [aba, null]; devolve cópia', () => {
  assert.deepEqual(resolverAbaCfgCtrl('telao'), ['slides', 'telao']);
  assert.deepEqual(resolverAbaCfgCtrl('biblia-leitura'), ['biblia', 'biblia-leitura']);
  assert.deepEqual(resolverAbaCfgCtrl('geral'), ['geral', null]);
  assert.deepEqual(resolverAbaCfgCtrl('inexistente'), ['inexistente', null]);
  const r = resolverAbaCfgCtrl('telao');
  r[0] = 'mudou';
  assert.deepEqual(resolverAbaCfgCtrl('telao'), ['slides', 'telao'], 'não vaza a mutação para o mapa');
});

test('normalizarTermoCfg: minúsculas e sem acentos (a busca ignora ambos)', () => {
  assert.equal(normalizarTermoCfg('AÇÃO Fundo'), 'acao fundo');
  assert.equal(normalizarTermoCfg('Posição'), 'posicao');
  assert.equal(normalizarTermoCfg(null), '');
  assert.equal(normalizarTermoCfg(undefined), '');
  assert.equal(normalizarTermoCfg(42), '42');
});

test('sanitizarCfgSlidesLocal: limpa imagem fora do tipo imagem, campos da Bíblia e do relógio', () => {
  const entrada = {
    publico: { bgType: 'solid', bgImage: 'a.png', refMostrar: true, refFontSize: 3, refColor: '#fff', fontSize: 5 },
    ministrante: { bgImage: 'b.png', refMostrar: false },
    clock: { showClock: true, showChurchName: true, churchName: 'X', churchFontSize: 2 },
  };
  const copia = JSON.parse(JSON.stringify(entrada));
  const r = sanitizarCfgSlidesLocal(entrada);
  assert.equal(r.publico.bgImage, '');
  assert.equal(r.publico.fontSize, 5);
  assert.equal('refMostrar' in r.publico, false);
  assert.equal('refFontSize' in r.publico, false);
  assert.equal('refColor' in r.publico, false);
  assert.equal(r.ministrante.bgImage, '');
  assert.equal(r.ministrante.bgType, 'solid', 'sem tipo vira sólido');
  assert.deepEqual(r.clock, { showClock: true });
  assert.deepEqual(entrada, copia, 'não altera a entrada');
});

test('sanitizarCfgSlidesLocal: imagem é mantida no tipo imagem; não objeto passa direto', () => {
  const r = sanitizarCfgSlidesLocal({ publico: { bgType: 'image', bgImage: 'a.png' } });
  assert.equal(r.publico.bgImage, 'a.png');
  assert.equal(sanitizarCfgSlidesLocal(null), null);
  assert.equal(sanitizarCfgSlidesLocal(undefined), undefined);
  assert.equal(sanitizarCfgSlidesLocal('texto'), 'texto');
});

test('config corrente inicial: tamanho, espaçamento e posição padrão do modal', () => {
  const cfg = lerCurrentCfgCtrl();
  assert.equal(cfg.fontSize, 5);
  assert.equal(cfg.lineSpacing, 1.7);
  assert.equal(cfg.posX, 'center');
  assert.equal(cfg.posY, 'center');
  assert.equal(typeof cfg.publico, 'object');
});

test('inicialização e dependências são funções exportadas (antes eram instruções soltas do núcleo)', () => {
  assert.equal(typeof iniciarConfigExibicao, 'function');
  assert.doesNotThrow(() => registrarDependenciasConfigExibicao(undefined));
  assert.doesNotThrow(() => registrarDependenciasConfigExibicao({}));
});
