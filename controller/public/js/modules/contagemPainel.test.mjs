import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estadoContagemVazio,
  ancorarContagem,
  restanteLocalMs,
  situacaoContagem,
  msParaCampos,
  camposParaMs,
  acaoBotaoPrincipal,
  acabouDeZerar,
  comandoIniciarContagem,
  comandoControloContagem,
  comandoAjustarContagem,
  comandoAparenciaContagem,
  AJUSTE_CONTAGEM_MS,
} from './contagemPainel.js';

/* Relógio do painel: `performance.now()` em produção, um número qualquer aqui. O módulo
   nunca o lê sozinho — é sempre argumento. */
const T = 10_000;

test('estado vazio não está no ar nem conta', () => {
  const e = estadoContagemVazio();
  assert.equal(e.noAr, false);
  assert.equal(restanteLocalMs(e, T + 999_999), 0);
  assert.equal(situacaoContagem(e, T), 'parada');
});

test('ancorar guarda o restante do host contra o relógio local', () => {
  const e = ancorarContagem({ rodando: true, restanteMs: 300_000, duracaoMs: 300_000 }, T);
  assert.equal(e.noAr, true);
  assert.equal(restanteLocalMs(e, T), 300_000);
  assert.equal(restanteLocalMs(e, T + 60_000), 240_000);
});

test('o restante local nunca passa de zero', () => {
  const e = ancorarContagem({ rodando: true, restanteMs: 5_000 }, T);
  assert.equal(restanteLocalMs(e, T + 999_999), 0);
});

test('pausada, o painel ignora o tempo que passa', () => {
  const e = ancorarContagem({ rodando: false, restanteMs: 120_000 }, T);
  assert.equal(restanteLocalMs(e, T + 600_000), 120_000);
  assert.equal(situacaoContagem(e, T + 600_000), 'pausada');
});

test('situação distingue no ar, pausada e zerada', () => {
  const correndo = ancorarContagem({ rodando: true, restanteMs: 60_000 }, T);
  assert.equal(situacaoContagem(correndo, T + 30_000), 'no-ar');
  assert.equal(situacaoContagem(correndo, T + 61_000), 'zerada');
});

test('duracaoMs nunca fica menor do que o restante que o host mandou', () => {
  /* Um painel que liga a meio da contagem recebe `restanteMs` sem `duracaoMs`; deixar a
     duração em zero faria qualquer barra de progresso dividir por zero. */
  const e = ancorarContagem({ rodando: true, restanteMs: 200_000 }, T);
  assert.equal(e.duracaoMs, 200_000);
});

test('campos e milissegundos são o inverso um do outro', () => {
  assert.deepEqual(msParaCampos(330_000), { minutos: 5, segundos: 30 });
  assert.equal(camposParaMs(5, 30), 330_000);
  assert.deepEqual(msParaCampos(camposParaMs(12, 7)), { minutos: 12, segundos: 7 });
});

test('campo vazio conta como zero; os dois vazios são «não escreveu nada»', () => {
  assert.equal(camposParaMs('5', ''), 300_000);
  assert.equal(camposParaMs('', '45'), 45_000);
  assert.equal(camposParaMs('', ''), null);
  assert.equal(camposParaMs(null, undefined), null);
});

test('campos com lixo não viram NaN', () => {
  assert.equal(camposParaMs('cinco', '30'), null);
  assert.equal(camposParaMs('-3', '0'), 0, 'tempo negativo é zero, não uma contagem invertida');
});

test('o botão principal muda de função conforme o estado', () => {
  assert.equal(acaoBotaoPrincipal(estadoContagemVazio(), T).acao, 'definir');

  const correndo = ancorarContagem({ rodando: true, restanteMs: 60_000 }, T);
  assert.equal(acaoBotaoPrincipal(correndo, T + 10_000).acao, 'pausar');

  const pausada = ancorarContagem({ rodando: false, restanteMs: 60_000 }, T);
  assert.equal(acaoBotaoPrincipal(pausada, T).acao, 'retomar');
});

test('zerada, o botão volta a «Iniciar» em vez de tentar retomar o nada', () => {
  const correndo = ancorarContagem({ rodando: true, restanteMs: 1_000 }, T);
  const b = acaoBotaoPrincipal(correndo, T + 5_000);
  assert.equal(b.acao, 'definir');
  assert.equal(b.rotulo, 'Iniciar');
});

test('«acabou de zerar» dispara uma vez só', () => {
  assert.equal(acabouDeZerar(1_000, 0), true);
  assert.equal(acabouDeZerar(0, 0), false, 'já estava em zero no tick anterior');
  assert.equal(acabouDeZerar(5_000, 4_800), false);
});

test('comandos levam sempre a config junto', () => {
  const cfg = { textColor: '#ff0000' };

  assert.deepEqual(comandoIniciarContagem(300_000, cfg), {
    acao: 'definir',
    duracaoMs: 300_000,
    rodando: true,
    contagemConfig: cfg,
  });

  assert.deepEqual(comandoIniciarContagem(60_000, cfg, { rodando: false }).rodando, false);
  assert.deepEqual(comandoControloContagem('pausar', cfg), { acao: 'pausar', contagemConfig: cfg });
  assert.deepEqual(comandoAjustarContagem(-AJUSTE_CONTAGEM_MS, cfg), {
    acao: 'ajustar',
    ajusteMs: -60_000,
    contagemConfig: cfg,
  });
});

test('o comando de aparência não fala de duração', () => {
  /* É o que o Ajustes emite com a contagem no ar: mexer na cor não pode reiniciar o
     tempo, e a ausência de duração é justamente o que faz o host herdar o que já corria. */
  const c = comandoAparenciaContagem({ fontSize: 20 });
  assert.equal(c.acao, 'definir');
  assert.equal('duracaoMs' in c, false);
  assert.equal('restanteMs' in c, false);
  assert.equal('minutos' in c, false);
});

test('comandoIniciar aceita duração zero sem a transformar em ausência', () => {
  const c = comandoIniciarContagem(0, {});
  assert.equal(c.duracaoMs, 0);
});
