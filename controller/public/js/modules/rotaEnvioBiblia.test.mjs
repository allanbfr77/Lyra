import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alvoDeRota,
  rotaCobreAlvo,
  alvoEnvioParaModoBiblia,
  resolverEnvioBiblia,
} from './rotaEnvioBiblia.js';

/**
 * Cenários de hardware, na linguagem do operador.
 *
 * Os índices seguem a convenção Lyra: 0 = monitor principal (do operador, nunca recebe
 * projeção), 1 = Monitor 2 (público/telão), 2 = Monitor 3 (ministrante/retorno).
 */
const ROTA = {
  desativada: { publicoIndex: -1, ministranteIndex: -1, live: false },
  live: { publicoIndex: -1, ministranteIndex: -1, live: true },
  publico: { publicoIndex: 1, ministranteIndex: -1, live: false },
  ministrante: { publicoIndex: -1, ministranteIndex: 2, live: false },
  ambos: { publicoIndex: 1, ministranteIndex: 2, live: false },
};

/**
 * Painel falso: guarda a rota «vigente» e a rota «seleccionada na UI», e só as alinha
 * quando `sincronizar()` corre — exactamente como `bibliaSincronizarRotaComServidorSeMudou()`
 * faz ao copiar o DOM para `rotasPorModo.biblia`.
 *
 * É este desfasamento que reproduz o defeito: sem ele, ler o alvo antes ou depois da
 * sincronização daria o mesmo resultado e o teste não provaria nada.
 */
function painelFalso({ rotaVigente, rotaNaUi }) {
  const registo = { sincronizou: false, leuAntesDeSincronizar: false };
  let vigente = rotaVigente;
  return {
    registo,
    sincronizar() {
      registo.sincronizou = true;
      vigente = rotaNaUi;
    },
    ler() {
      if (!registo.sincronizou) registo.leuAntesDeSincronizar = true;
      return vigente;
    },
  };
}

/* ── alvoDeRota / rotaCobreAlvo ─────────────────────────────────────────────── */

test('alvoDeRota nomeia cada destino do cabeçalho «Monitor»', () => {
  assert.equal(alvoDeRota(ROTA.desativada), 'desativado');
  assert.equal(alvoDeRota(ROTA.live), 'live');
  assert.equal(alvoDeRota(ROTA.publico), 'publico');
  assert.equal(alvoDeRota(ROTA.ministrante), 'ministrante');
  assert.equal(alvoDeRota(ROTA.ambos), 'ambos');
});

test('live tem precedência sobre índices de monitor deixados para trás', () => {
  const suja = { publicoIndex: 1, ministranteIndex: 2, live: true };
  assert.equal(alvoDeRota(suja), 'live');
  assert.equal(rotaCobreAlvo(suja, 'live'), true);
});

test('a rota cobre sempre o alvo que ela própria produz', () => {
  for (const rota of Object.values(ROTA)) {
    const alvo = alvoDeRota(rota);
    if (alvo === 'desativado') continue;
    assert.equal(rotaCobreAlvo(rota, alvo), true, `rota ${JSON.stringify(rota)} / alvo ${alvo}`);
  }
});

test('só «Desativado» impede o envio; nenhuma outra escolha o faz', () => {
  assert.equal(alvoEnvioParaModoBiblia(ROTA.desativada), null);
  assert.equal(alvoEnvioParaModoBiblia(ROTA.live), 'live');
  assert.equal(alvoEnvioParaModoBiblia(ROTA.publico), 'publico');
  assert.equal(alvoEnvioParaModoBiblia(ROTA.ministrante), 'ministrante');
  assert.equal(alvoEnvioParaModoBiblia(ROTA.ambos), 'ambos');
});

test('alvo sem cobertura recai em live (só OBS) em vez de cancelar o envio', () => {
  /* Rota impossível de produzir pela UI de hoje — a rede de segurança existe para o dia
     em que alguma refatoração a voltar a produzir. */
  const rotaCorrompida = { publicoIndex: -1, ministranteIndex: -1, live: false };
  assert.equal(rotaCobreAlvo(rotaCorrompida, 'ambos'), false);
  /* E mesmo aí, o overlay recebe: nunca «não enviar». */
  assert.notEqual(alvoEnvioParaModoBiblia(ROTA.live), null);
});

/* ── Sequência: sincronizar antes de ler ────────────────────────────────────── */

test('resolverEnvioBiblia sincroniza a rota ANTES de ler o alvo', async () => {
  const painel = painelFalso({ rotaVigente: ROTA.desativada, rotaNaUi: ROTA.live });
  await resolverEnvioBiblia({ sincronizarRota: painel.sincronizar, lerRota: painel.ler });
  assert.equal(painel.registo.sincronizou, true);
  assert.equal(painel.registo.leuAntesDeSincronizar, false);
});

test(
  'REGRESSÃO: LIVE OBS escolhido antes da primeira projeção física envia ao OBS',
  async () => {
    /* Entrar no Modo Bíblia repõe a rota em «Desativado»; o operador escolhe «Live — OBS»
       no cabeçalho (só o DOM muda) e clica logo num versículo. Antes da correcção, o alvo
       era lido da rota antiga («Desativado») e o envio era cancelado em silêncio. */
    const painel = painelFalso({ rotaVigente: ROTA.desativada, rotaNaUi: ROTA.live });
    const r = await resolverEnvioBiblia({
      sincronizarRota: painel.sincronizar,
      lerRota: painel.ler,
    });
    assert.equal(r.enviar, true);
    assert.equal(r.alvoEnvio, 'live');
  }
);

test('sem sincronizador (navegação rápida) lê a rota já vigente', async () => {
  const painel = painelFalso({ rotaVigente: ROTA.publico, rotaNaUi: ROTA.live });
  const r = await resolverEnvioBiblia({ lerRota: painel.ler });
  assert.equal(painel.registo.sincronizou, false);
  assert.equal(r.alvoEnvio, 'publico');
});

test('«Desativado» continua a ser recusado, e com o alvo certo para a mensagem', async () => {
  const painel = painelFalso({ rotaVigente: ROTA.live, rotaNaUi: ROTA.desativada });
  const r = await resolverEnvioBiblia({
    sincronizarRota: painel.sincronizar,
    lerRota: painel.ler,
  });
  assert.equal(r.enviar, false);
  assert.equal(r.alvo, 'desativado');
  assert.equal(r.alvoEnvio, null);
});

/* ── Matriz de cenários do relatório ────────────────────────────────────────── */

/**
 * Cada linha é um cenário do relatório de defeito. `rotaNaUi` é o que o operador acabou
 * de escolher no cabeçalho; `rotaVigente` é o que o painel ainda tinha em memória.
 */
const CENARIOS = [
  // Dois monitores
  ['2 monitores · Público', ROTA.desativada, ROTA.publico, 'publico'],
  ['2 monitores · Ministrante', ROTA.desativada, ROTA.ministrante, 'ministrante'],
  ['2 monitores · Ambos', ROTA.desativada, ROTA.ambos, 'ambos'],
  ['2 monitores · LIVE OBS de início', ROTA.desativada, ROTA.live, 'live'],
  ['2 monitores · monitor → LIVE OBS', ROTA.ambos, ROTA.live, 'live'],
  ['2 monitores · LIVE OBS → monitor', ROTA.live, ROTA.ambos, 'ambos'],
  // Um monitor de projeção (só o canal público existe)
  ['1 monitor · Público', ROTA.desativada, ROTA.publico, 'publico'],
  ['1 monitor · LIVE OBS de início', ROTA.desativada, ROTA.live, 'live'],
  ['1 monitor · projetou e depois LIVE OBS', ROTA.publico, ROTA.live, 'live'],
  // Nenhum monitor físico: só o principal, logo só «Desativado» e «Live — OBS» existem
  ['0 monitores · LIVE OBS de início', ROTA.desativada, ROTA.live, 'live'],
  ['0 monitores · LIVE OBS mantido', ROTA.live, ROTA.live, 'live'],
];

for (const [nome, rotaVigente, rotaNaUi, esperado] of CENARIOS) {
  test(`cenário — ${nome} → envia com alvo «${esperado}»`, async () => {
    const painel = painelFalso({ rotaVigente, rotaNaUi });
    const r = await resolverEnvioBiblia({
      sincronizarRota: painel.sincronizar,
      lerRota: painel.ler,
    });
    assert.equal(r.enviar, true, 'o comando tem de sair');
    assert.equal(r.alvoEnvio, esperado);
  });
}
