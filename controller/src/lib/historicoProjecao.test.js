'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./historicoProjecao');

const T0 = Date.parse('2026-08-16T19:00:00');
const MIN = 60 * 1000;

function reg(extra = {}) {
  return h.normalizarRegisto(
    { titulo: 'Grande é o Senhor', musicaId: 12, rootId: 12, ...extra },
    T0
  );
}

// --- repetição -------------------------------------------------------------------------

test('a primeira projeção sempre conta', () => {
  assert.equal(h.deveRegistar(reg(), null, T0), true);
});

test('as estrofes seguintes da mesma música não contam de novo', () => {
  /* O defeito que isto impede: uma música cantada uma vez a aparecer «47 vezes» no
     relatório, uma por cada estrofe que o operador projetou. */
  const r = reg();
  const marca = h.marcaDeRegisto(r, T0);
  assert.equal(h.deveRegistar(r, marca, T0 + 5 * MIN), false);
});

test('outra música conta logo, mesmo no mesmo minuto', () => {
  const marca = h.marcaDeRegisto(reg(), T0);
  assert.equal(h.deveRegistar(reg({ musicaId: 99, rootId: 99 }), marca, T0 + MIN), true);
});

test('a mesma música conta de novo passada a janela', () => {
  /* A abertura que volta no fim do culto é mesmo uma segunda vez. */
  const r = reg();
  const marca = h.marcaDeRegisto(r, T0);
  assert.equal(h.deveRegistar(r, marca, T0 + 21 * MIN), true);
  assert.equal(h.deveRegistar(r, marca, T0 + 19 * MIN), false);
});

test('trocar do original para a cópia não conta como segunda vez', () => {
  /* Original e cópia editável são a mesma música para quem monta repertório: o operador
     mudou de versão a meio, a congregação não cantou duas vezes. */
  const original = reg({ musicaId: 12, rootId: 12 });
  const copia = reg({ musicaId: 340, rootId: 12, rotulo: 'Cópia' });
  const marca = h.marcaDeRegisto(original, T0);
  assert.equal(h.deveRegistar(copia, marca, T0 + MIN), false);
});

test('mesmo id em bancos diferentes são músicas diferentes', () => {
  /* `catalog.db` e o banco do utilizador numeram-se de forma independente. */
  const a = reg({ bancoFonte: 'user' });
  const b = reg({ bancoFonte: 'catalog' });
  assert.notEqual(h.chaveRepeticao(a), h.chaveRepeticao(b));
});

test('sem id, o título serve de identidade e ignora acentos e caixa', () => {
  const a = h.normalizarRegisto({ titulo: 'Água Viva' }, T0);
  const b = h.normalizarRegisto({ titulo: 'agua viva' }, T0);
  assert.equal(h.chaveRepeticao(a), h.chaveRepeticao(b));
});

test('relógio a andar para trás não faz perder o registo', () => {
  /* NTP a corrigir a hora a meio do culto: registar a mais é menos mau do que perder. */
  const r = reg();
  const marca = { chave: h.chaveRepeticao(r), em: Number.NaN };
  assert.equal(h.deveRegistar(r, marca, T0), true);
});

// --- normalização ----------------------------------------------------------------------

test('registo sem título é recusado', () => {
  assert.equal(h.normalizarRegisto({ musicaId: 5 }, T0), null);
  assert.equal(h.normalizarRegisto({ titulo: '   ' }, T0), null);
});

test('título, tom e ministrante são gravados por extenso', () => {
  /* O histórico é registo do passado: apagar a música não pode apagar a linha. */
  const r = reg({ artista: 'Adhemar', tom: 'G', ministranteNome: 'Ana', cultoNome: 'Domingo' });
  assert.equal(r.titulo, 'Grande é o Senhor');
  assert.equal(r.artista, 'Adhemar');
  assert.equal(r.tom, 'G');
  assert.equal(r.ministranteNome, 'Ana');
  assert.equal(r.cultoNome, 'Domingo');
});

test('rootId em falta cai para o musicaId', () => {
  assert.equal(h.normalizarRegisto({ titulo: 'X', musicaId: 7 }, T0).rootId, 7);
});

test('banco de origem desconhecido cai para «user»', () => {
  assert.equal(h.normalizarRegisto({ titulo: 'X', bancoFonte: 'seja-o-que-for' }, T0).bancoFonte, 'user');
});

// --- repertório ------------------------------------------------------------------------

test('agrega por música e conta as vezes', () => {
  const linhas = [
    reg({ projetadoEm: T0 }),
    reg({ projetadoEm: T0 + 30 * MIN }),
    reg({ musicaId: 99, rootId: 99, titulo: 'Santo', projetadoEm: T0 }),
  ];
  const out = h.agregarRepertorio(linhas);
  assert.equal(out.length, 2);
  assert.equal(out[0].titulo, 'Grande é o Senhor');
  assert.equal(out[0].vezes, 2);
  assert.equal(out[1].vezes, 1);
});

test('o título mais recente ganha quando a música foi renomeada', () => {
  /* Uma música corrigida deve aparecer pelo nome novo, não pelo que tinha há dois anos. */
  const linhas = [
    reg({ titulo: 'Grande he o Senhor', projetadoEm: T0 }),
    reg({ titulo: 'Grande é o Senhor', projetadoEm: T0 + 40 * MIN }),
  ];
  const out = h.agregarRepertorio(linhas);
  assert.equal(out.length, 1);
  assert.equal(out[0].titulo, 'Grande é o Senhor');
});

test('junta os tons e os ministrantes sem repetir', () => {
  const linhas = [
    reg({ tom: 'G', ministranteNome: 'Ana', projetadoEm: T0 }),
    reg({ tom: 'A', ministranteNome: 'Ana', projetadoEm: T0 + MIN }),
    reg({ tom: 'G', ministranteNome: 'Bruno', projetadoEm: T0 + 2 * MIN }),
  ];
  const [g] = h.agregarRepertorio(linhas);
  assert.deepEqual(g.tons, ['G', 'A']);
  assert.deepEqual(g.ministrantes, ['Ana', 'Bruno']);
});

test('primeira e última vez são os extremos, em qualquer ordem de entrada', () => {
  const linhas = [
    reg({ projetadoEm: T0 + 40 * MIN }),
    reg({ projetadoEm: T0 }),
    reg({ projetadoEm: T0 + 20 * MIN }),
  ];
  const [g] = h.agregarRepertorio(linhas);
  assert.equal(g.primeiraEm, T0);
  assert.equal(g.ultimaEm, T0 + 40 * MIN);
});

test('histórico vazio dá repertório vazio', () => {
  assert.deepEqual(h.agregarRepertorio([]), []);
  assert.deepEqual(h.agregarRepertorio(null), []);
});

// --- tempo -----------------------------------------------------------------------------

test('«há quantos dias» conta dias de calendário', () => {
  /* Cantada ontem às 22 h, consultada hoje às 9 h: são «1 dia», não «0». */
  const ontemTarde = Date.parse('2026-08-15T22:00:00');
  const hojeCedo = Date.parse('2026-08-16T09:00:00');
  assert.equal(h.diasDesde(ontemTarde, hojeCedo), 1);
});

test('mesmo dia dá zero dias', () => {
  assert.equal(h.diasDesde(Date.parse('2026-08-16T08:00:00'), T0), 0);
});

test('o período termina no fim do dia de hoje, não agora', () => {
  /* Senão o número mudava consoante a hora a que a janela é aberta. */
  const meioDia = Date.parse('2026-08-16T12:00:00');
  const { ate } = h.intervaloDoPeriodo('30d', meioDia);
  const d = new Date(ate);
  assert.equal(d.getHours(), 23);
  assert.equal(d.getDate(), 16);
});

test('«tudo» começa no início dos tempos', () => {
  assert.equal(h.intervaloDoPeriodo('tudo', T0).de, 0);
});

test('30 dias inclui o próprio dia de hoje', () => {
  const { de } = h.intervaloDoPeriodo('30d', T0);
  assert.equal(new Date(de).getDate(), 18);
  assert.equal(new Date(de).getMonth(), 6);
});

// --- CSV -------------------------------------------------------------------------------

test('CSV leva BOM, ou o Excel estraga os acentos', () => {
  assert.equal(h.csvHistorico([]).charCodeAt(0), 0xfeff);
  assert.equal(h.csvRepertorio([], T0).charCodeAt(0), 0xfeff);
});

test('título com vírgula fica numa célula só', () => {
  const csv = h.csvHistorico([reg({ titulo: 'Tu és fiel, Senhor' })]);
  assert.match(csv, /"Tu és fiel, Senhor"/);
});

test('aspas no título são duplicadas', () => {
  const csv = h.csvHistorico([reg({ titulo: 'Ele é o "Rei"' })]);
  assert.match(csv, /"Ele é o ""Rei"""/);
});

test('CSV vazio ainda traz o cabeçalho', () => {
  const linhas = h.csvHistorico([]).replace('﻿', '').trim().split('\r\n');
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /^Data e hora,Música/);
});

test('data sai ordenável como texto', () => {
  /* `YYYY-MM-DD HH:MM` é o único formato que o Excel ordena bem sem interpretar. */
  assert.equal(h.dataHoraLocal(Date.parse('2026-01-05T08:07:00')), '2026-01-05 08:07');
});

// --- intervalo pedido ------------------------------------------------------------------

test('sem nada, o pedido vale 30 dias', () => {
  assert.deepEqual(h.intervaloPedido({}, T0), h.intervaloDoPeriodo('30d', T0));
  assert.deepEqual(h.intervaloPedido(null, T0), h.intervaloDoPeriodo('30d', T0));
});

test('período nomeado é respeitado', () => {
  assert.deepEqual(h.intervaloPedido({ periodo: 'tudo' }, T0), h.intervaloDoPeriodo('tudo', T0));
});

test('de/ate explícitos ganham ao período', () => {
  assert.deepEqual(h.intervaloPedido({ periodo: 'tudo', de: 10, ate: 20 }, T0), { de: 10, ate: 20 });
});

test('intervalo invertido é descartado, não obedecido', () => {
  /* Na rota que apaga, obedecer a um intervalo impossível seria apagar zero linhas e
     responder que correu bem — o operador só descobria meses depois. */
  assert.deepEqual(h.intervaloPedido({ de: 900, ate: 100 }, T0), h.intervaloDoPeriodo('30d', T0));
});

test('de/ate não numéricos caem para o período', () => {
  assert.deepEqual(
    h.intervaloPedido({ periodo: '90d', de: 'ontem', ate: 'hoje' }, T0),
    h.intervaloDoPeriodo('90d', T0)
  );
});

test('a consulta e a limpeza vêem o mesmo intervalo', () => {
  /* O invariante que impede apagar mais do que se estava a ver. */
  const query = h.intervaloPedido({ periodo: '90d' }, T0);
  const body = h.intervaloPedido({ periodo: '90d' }, T0);
  assert.deepEqual(query, body);
});
