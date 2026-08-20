'use strict';

const test = require('node:test');
const assert = require('node:assert');

const c = require('./contagemRegressiva');

/* Relógio fixo em todos os testes: o módulo recebe `agora` injectado precisamente para
   que a suíte não dependa de `Date.now()` — nem fique lenta a esperar segundos passarem. */
const T0 = 1_700_000_000_000;

test('formatarContagem arredonda para cima, como contagem regressiva', () => {
  /* 5:00.000 exactos ainda são «05:00» — e assim continuam até faltar 4:59.001. */
  assert.equal(c.formatarContagem(300_000, c.CFG_PADRAO), '05:00');
  assert.equal(c.formatarContagem(299_999, c.CFG_PADRAO), '05:00');
  assert.equal(c.formatarContagem(299_000, c.CFG_PADRAO), '04:59');
  assert.equal(c.formatarContagem(1, c.CFG_PADRAO), '00:01');
  assert.equal(c.formatarContagem(0, c.CFG_PADRAO), '00:00');
});

test('formatarContagem só mostra horas quando existem, no modo auto', () => {
  assert.equal(c.formatarContagem(59 * 60_000, c.CFG_PADRAO), '59:00');
  assert.equal(c.formatarContagem(60 * 60_000, c.CFG_PADRAO), '01:00:00');
});

test('formatarContagem respeita mostrarHoras sempre / nunca', () => {
  const sempre = c.normalizarCfgContagem({ mostrarHoras: 'sempre' });
  assert.equal(c.formatarContagem(90_000, sempre), '00:01:30');

  const nunca = c.normalizarCfgContagem({ mostrarHoras: 'nunca' });
  /* 90 min viram «90:00», não «01:30:00» — é o formato de quem cronometra ensaio. */
  assert.equal(c.formatarContagem(90 * 60_000, nunca), '90:00');
});

test('formatarContagem sem segundos arredonda o minuto para cima', () => {
  const cfg = c.normalizarCfgContagem({ mostrarSegundos: false });
  /* 4 min e 1 s ainda são «5» para quem lê a tela; mostrar 04 saltaria dois passos. */
  assert.equal(c.formatarContagem(241_000, cfg), '05');
  assert.equal(c.formatarContagem(240_000, cfg), '04');
  assert.equal(c.formatarContagem(0, cfg), '00');
});

test('duracaoPedidaMs aceita as três formas que os chamadores têm à mão', () => {
  assert.equal(c.duracaoPedidaMs({ minutos: 5 }), 300_000);
  assert.equal(c.duracaoPedidaMs({ minutos: 1, segundos: 30 }), 90_000);
  assert.equal(c.duracaoPedidaMs({ duracaoMs: 42_000 }), 42_000);
  assert.equal(c.duracaoPedidaMs({ restanteMs: 7_000 }), 7_000);
});

test('duracaoPedidaMs devolve null quando o comando não fala de duração', () => {
  assert.equal(c.duracaoPedidaMs({}), null);
  assert.equal(c.duracaoPedidaMs({ rodando: true }), null);
  assert.equal(c.duracaoPedidaMs(null), null);
});

test('duracaoPedidaMs distingue zero explícito de ausência', () => {
  /* «zerar» manda 0 e tem de continuar a ser um pedido válido — se virasse `null`, o
     comando herdaria a duração anterior e a contagem recomeçaria em vez de zerar. */
  assert.equal(c.duracaoPedidaMs({ duracaoMs: 0 }), 0);
  assert.equal(c.duracaoPedidaMs({ restanteMs: 0 }), 0);
  assert.equal(c.duracaoPedidaMs({ minutos: 0, segundos: 0 }), 0);
});

test('duracaoPedidaMs corta no teto de 24 h', () => {
  assert.equal(c.duracaoPedidaMs({ minutos: 60 * 48 }), c.DURACAO_MAX_MS);
});

test('duracaoPedidaMs nunca devolve negativo', () => {
  assert.equal(c.duracaoPedidaMs({ minutos: -10 }), 0);
});

test('criarEstadoContagem guarda alvo no relógio do host quando corre', () => {
  const e = c.criarEstadoContagem({ minutos: 5 }, T0);
  assert.equal(e.rodando, true);
  assert.equal(e.alvoEm, T0 + 300_000);
  assert.equal(e.duracaoMs, 300_000);
});

test('criarEstadoContagem pausado não guarda alvo', () => {
  const e = c.criarEstadoContagem({ minutos: 5, rodando: false }, T0);
  assert.equal(e.rodando, false);
  assert.equal(e.alvoEm, null);
  assert.equal(e.restanteMs, 300_000);
});

test('criarEstadoContagem sem duração e sem anterior recusa-se', () => {
  assert.equal(c.criarEstadoContagem({ rodando: true }, T0), null);
});

test('criarEstadoContagem sem duração herda o restante da contagem anterior', () => {
  /* É o caminho de «só mudei a cor no Ajustes»: a config muda, o tempo não recomeça. */
  const antes = c.criarEstadoContagem({ minutos: 5 }, T0);
  const depois = c.criarEstadoContagem(
    { contagemConfig: { textColor: '#ff0000' } },
    T0 + 60_000,
    antes
  );
  assert.equal(depois.restanteMs, 240_000);
  assert.equal(depois.duracaoMs, 300_000, 'a duração total é a original, não o que sobrou');
  assert.equal(depois.cfg.textColor, '#ff0000');
});

test('restanteMsContagem desconta o tempo passado e nunca fica negativo', () => {
  const e = c.criarEstadoContagem({ minutos: 5 }, T0);
  assert.equal(c.restanteMsContagem(e, T0), 300_000);
  assert.equal(c.restanteMsContagem(e, T0 + 120_000), 180_000);
  assert.equal(c.restanteMsContagem(e, T0 + 999_000), 0);
});

test('pausar congela o restante e retomar recomeça daí, mesmo uma hora depois', () => {
  const rodando = c.criarEstadoContagem({ minutos: 10 }, T0);
  const pausado = c.pausarContagem(rodando, T0 + 180_000);
  assert.equal(pausado.restanteMs, 420_000);

  /* Uma hora parado. Se o estado guardasse `alvoEm` em vez da duração, retomar aqui daria
     zero — este é o caso que o desenho «duração, não instante» existe para cobrir. */
  assert.equal(c.restanteMsContagem(pausado, T0 + 3_780_000), 420_000);

  const retomado = c.retomarContagem(pausado, T0 + 3_780_000);
  assert.equal(c.restanteMsContagem(retomado, T0 + 3_780_000), 420_000);
  assert.equal(c.restanteMsContagem(retomado, T0 + 3_840_000), 360_000);
});

test('ajustar soma tempo sem parar a contagem', () => {
  const e = c.criarEstadoContagem({ minutos: 5 }, T0);
  const mais = c.ajustarContagem(e, 60_000, T0 + 60_000);
  assert.equal(mais.rodando, true);
  assert.equal(c.restanteMsContagem(mais, T0 + 60_000), 300_000);
});

test('ajustar para baixo não passa de zero', () => {
  const e = c.criarEstadoContagem({ minutos: 1 }, T0);
  const menos = c.ajustarContagem(e, -600_000, T0);
  assert.equal(c.restanteMsContagem(menos, T0), 0);
});

test('ajustar uma contagem pausada mantém-na pausada', () => {
  const e = c.criarEstadoContagem({ minutos: 5, rodando: false }, T0);
  const mais = c.ajustarContagem(e, 60_000, T0 + 999_999);
  assert.equal(mais.rodando, false);
  assert.equal(mais.alvoEm, null);
  assert.equal(mais.restanteMs, 360_000);
});

test('excedente só existe depois do zero e só com a contagem a correr', () => {
  const e = c.criarEstadoContagem({ minutos: 1 }, T0);
  assert.equal(c.excedenteMsContagem(e, T0 + 30_000), 0);
  assert.equal(c.excedenteMsContagem(e, T0 + 102_000), 42_000);

  const pausado = c.pausarContagem(e, T0 + 30_000);
  assert.equal(c.excedenteMsContagem(pausado, T0 + 999_999), 0);
});

test('payloadContagem entrega duração, não instante', () => {
  const e = c.criarEstadoContagem({ minutos: 5 }, T0);
  const p = c.payloadContagem(e, T0 + 60_000);
  assert.equal(p.restanteMs, 240_000);
  assert.equal(p.rodando, true);
  assert.equal(p.zerada, false);
  assert.equal(p.duracaoMs, 300_000);
  assert.ok(!('alvoEm' in p), 'alvoEm é do relógio do host e não deve atravessar a rede');
});

test('payloadContagem marca zerada quando o tempo acabou', () => {
  const e = c.criarEstadoContagem({ minutos: 1 }, T0);
  const p = c.payloadContagem(e, T0 + 61_000);
  assert.equal(p.zerada, true);
  assert.equal(p.restanteMs, 0);
  assert.equal(p.excedenteMs, 1_000);
});

test('dois telões que ligam em instantes diferentes recebem o mesmo fim', () => {
  /* O payload é recalculado por emissão: quem chega atrasado recebe menos tempo, e as
     duas telas chegam a zero juntas sem o host guardar quem já recebeu o quê. */
  const e = c.criarEstadoContagem({ minutos: 5 }, T0);
  const cedo = c.payloadContagem(e, T0 + 10_000);
  const tarde = c.payloadContagem(e, T0 + 190_000);
  assert.equal(T0 + 10_000 + cedo.restanteMs, T0 + 190_000 + tarde.restanteMs);
});

test('normalizarCfgContagem devolve todo campo mesmo com lixo à entrada', () => {
  const cfg = c.normalizarCfgContagem(null);
  assert.deepEqual(Object.keys(cfg).sort(), Object.keys(c.CFG_PADRAO).sort());
  assert.equal(c.normalizarCfgContagem([]).fontSize, c.CFG_PADRAO.fontSize);
  assert.equal(c.normalizarCfgContagem('x').textColor, c.CFG_PADRAO.textColor);
});

test('normalizarCfgContagem rejeita cor inválida e aceita hex de 6 dígitos', () => {
  assert.equal(c.normalizarCfgContagem({ textColor: 'vermelho' }).textColor, '#ffffff');
  assert.equal(c.normalizarCfgContagem({ textColor: '#ABC' }).textColor, '#ffffff');
  assert.equal(c.normalizarCfgContagem({ textColor: '#A1B2C3' }).textColor, '#a1b2c3');
});

test('normalizarCfgContagem prende o tamanho da fonte a limites projetáveis', () => {
  assert.equal(c.normalizarCfgContagem({ fontSize: 900 }).fontSize, 40);
  assert.equal(c.normalizarCfgContagem({ fontSize: 0 }).fontSize, 4);
  assert.equal(c.normalizarCfgContagem({ fontSize: 'grande' }).fontSize, c.CFG_PADRAO.fontSize);
});

test('normalizarCfgContagem só guarda bgImage quando o fundo é imagem', () => {
  const img = 'data:image/png;base64,AAAA';
  assert.equal(c.normalizarCfgContagem({ bgType: 'image', bgImage: img }).bgImage, img);
  assert.equal(c.normalizarCfgContagem({ bgType: 'solid', bgImage: img }).bgImage, '');
});

test('normalizarMensagem limpa controlo e quebra de linha sem comer acento', () => {
  assert.equal(c.normalizarMensagem('Culto\ncomeça\tem'), 'Culto começa em');
  assert.equal(c.normalizarMensagem('  Vamos  louvar!  '), 'Vamos louvar!');
  assert.equal(c.normalizarMensagem('Ação — nº 1 (já!)'), 'Ação — nº 1 (já!)');
  assert.equal(c.normalizarMensagem(null), '');
});

test('normalizarMensagem corta textos que estourariam a tela', () => {
  assert.equal(c.normalizarMensagem('a'.repeat(500)).length, 160);
});

test('aoZerar aceita só os modos conhecidos', () => {
  assert.equal(c.normalizarCfgContagem({ aoZerar: 'subir' }).aoZerar, 'subir');
  assert.equal(c.normalizarCfgContagem({ aoZerar: 'encerrar' }).aoZerar, 'encerrar');
  assert.equal(c.normalizarCfgContagem({ aoZerar: 'explodir' }).aoZerar, 'parar');
});

test('partesContagem decompõe o tempo já arredondado', () => {
  const p = c.partesContagem(3_723_000);
  assert.equal(p.horas, 1);
  assert.equal(p.minutos, 2);
  assert.equal(p.segundos, 3);
  assert.equal(p.totalMinutos, 62);
});
