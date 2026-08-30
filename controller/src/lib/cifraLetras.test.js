'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizarEstrofesComMaxLinhas,
  quebrarLinhaLonga,
  capitalizarInicialLinha,
  unirLinhasIncompletas,
} = require('./cifraLetras.js');

// Letra como vem do CifraClub/Letras: linhas longas, uma frase inteira por linha.
const ESTROFES_FONTE = [
  [
    'Quando as lutas vierem contra ti',
    'Irmão, insista, ainda não é o fim',
    'A tua fé, mesmo fraca, ela é forte',
    'Destrói muralhas',
  ].join('\n'),
  [
    'Ponha os olhos no Senhor Jesus',
    'Receba a bênção e a Sua luz',
    'Você vai ver, você vai vencer',
    'Na unção de Deus e no Seu poder',
  ].join('\n'),
  [
    'O crente cheio da unção',
    'Manda glória pra cima e recebe poder',
    'Ele passa o Mar Vermelho, sai do lado de lá',
    'Ele expulsa os demônios, faz o inferno tremer',
  ].join('\n'),
];

describe('quebrarLinhaLonga', () => {
  it('quebra a frase em fragmentos curtos no ponto natural', () => {
    assert.deepEqual(quebrarLinhaLonga('Quando as lutas vierem contra ti'), [
      'Quando as lutas',
      'vierem contra ti',
    ]);
    assert.deepEqual(quebrarLinhaLonga('Irmão, insista, ainda não é o fim'), [
      'Irmão, insista',
      'ainda não é o fim',
    ]);
    assert.deepEqual(quebrarLinhaLonga('Receba a bênção e a Sua luz'), [
      'Receba a bênção',
      'e a Sua luz',
    ]);
  });

  it('não quebra linha que já cabe no limite', () => {
    assert.deepEqual(quebrarLinhaLonga('O crente cheio da unção'), ['O crente cheio da unção']);
    assert.deepEqual(quebrarLinhaLonga('Destrói muralhas'), ['Destrói muralhas']);
  });

  it('não deixa preposição pendurada no fim da linha', () => {
    for (const parte of quebrarLinhaLonga('vai passar por cima das águas')) {
      assert.ok(!/\b(por|de|da|do|em|na|no|com|para)$/i.test(parte), parte);
    }
  });
});

describe('capitalizarInicialLinha', () => {
  it('põe maiúscula na primeira letra', () => {
    assert.equal(capitalizarInicialLinha('vierem contra ti'), 'Vierem contra ti');
    assert.equal(capitalizarInicialLinha('(você vai vencer)'), '(Você vai vencer)');
    assert.equal(capitalizarInicialLinha('Já maiúscula'), 'Já maiúscula');
  });
});

describe('normalizarEstrofesComMaxLinhas', () => {
  it('gera slides no formato do banco offline', () => {
    assert.deepEqual(normalizarEstrofesComMaxLinhas(ESTROFES_FONTE, 4), [
      'Quando as lutas\nVierem contra ti\nIrmão, insista\nAinda não é o fim',
      'A tua fé, mesmo fraca\nEla é forte\nDestrói muralhas',
      'Ponha os olhos\nNo Senhor Jesus\nReceba a bênção\nE a Sua luz',
      'Você vai ver\nVocê vai vencer\nNa unção de Deus\nE no Seu poder',
      'O crente cheio da unção\nManda glória pra cima\nE recebe poder',
      'Ele passa o Mar Vermelho\nSai do lado de lá\nEle expulsa os demônios\nFaz o inferno tremer',
    ]);
  });

  it('nunca mistura duas estrofes no mesmo slide', () => {
    const primeirasDaEstrofe = ['Quando as lutas', 'Ponha os olhos', 'O crente cheio da unção'];
    const slides = normalizarEstrofesComMaxLinhas(ESTROFES_FONTE, 4);
    for (const slide of slides) {
      const linhas = slide.split('\n');
      const inicios = linhas.filter((l) => primeirasDaEstrofe.includes(l));
      assert.ok(inicios.length <= 1, `slide atravessa estrofe:\n${slide}`);
      if (inicios.length === 1) assert.equal(linhas[0], inicios[0]);
    }
  });

  it('mantém os dois pedaços da mesma linha no mesmo slide', () => {
    const slides = normalizarEstrofesComMaxLinhas(ESTROFES_FONTE, 4);
    const pares = [
      ['Ele passa o Mar Vermelho', 'Sai do lado de lá'],
      ['Ele expulsa os demônios', 'Faz o inferno tremer'],
    ];
    for (const [a, b] of pares) {
      const slide = slides.find((s) => s.includes(a));
      assert.ok(slide && slide.includes(b), `separou "${a}" de "${b}"`);
    }
  });

  it('respeita o máximo de linhas por slide', () => {
    for (const max of [2, 3, 4]) {
      for (const slide of normalizarEstrofesComMaxLinhas(ESTROFES_FONTE, max)) {
        assert.ok(slide.split('\n').length <= max, `slide com mais de ${max} linhas:\n${slide}`);
      }
    }
  });

  it('achata a letra quando a fonte entrega um bloco por linha (Next.js do Cifra)', () => {
    const porLinha = ESTROFES_FONTE.join('\n').split('\n');
    const slides = normalizarEstrofesComMaxLinhas(porLinha, 4);
    assert.ok(slides.length < porLinha.length, 'gerou um slide por linha solta');
    for (const slide of slides) {
      assert.ok(slide.split('\n').length <= 4);
    }
  });

  it('devolve [""] para entrada vazia', () => {
    assert.deepEqual(normalizarEstrofesComMaxLinhas([], 4), ['']);
    assert.deepEqual(normalizarEstrofesComMaxLinhas(['   '], 4), ['']);
  });
});

// Segunda música ("Na presença dos homens" / "Mil graus de unção"): a fonte
// corta as frases em blocos curtos e tem linhas logo acima do limite.
const ESTROFES_FONTE_2 = [
  'Na presença dos homens\nNa presença dos anjos, sempre',
  'Eu Te louvarei\nTe louvarei',
  'Mesmo estando em guerra\nVou celebrando\nMinha vitória',
  'Eu Te louvarei\nTe louvarei',
  'Sobre toda Terra novo som se ouvirá\nTua alegria\nForça pra continuar',
  'Eu entro na Sua presença\nPra receber o Seu poder\nE quanto mais\nO tempo passa\nMais quero Deus',
];

describe('folga acima do limite de caracteres', () => {
  it('mantém inteira a linha pouco acima do limite sem quebra boa', () => {
    // 29 caracteres: quebrar no espaço daria "Na presença" + "dos anjos, sempre".
    assert.deepEqual(quebrarLinhaLonga('Na presença dos anjos, sempre'), [
      'Na presença dos anjos, sempre',
    ]);
    assert.deepEqual(quebrarLinhaLonga('vai passar por cima das águas'), [
      'vai passar por cima das águas',
    ]);
  });

  it('ainda quebra quando os dois pedaços ficam equilibrados', () => {
    assert.deepEqual(quebrarLinhaLonga('Ponha os olhos no Senhor Jesus'), [
      'Ponha os olhos',
      'no Senhor Jesus',
    ]);
  });

  it('ainda quebra na vírgula/conjunção dentro da folga', () => {
    assert.deepEqual(quebrarLinhaLonga('Toma o Teu trono, vem reinar'), [
      'Toma o Teu trono',
      'vem reinar',
    ]);
    assert.deepEqual(quebrarLinhaLonga('Receba a bênção e a Sua luz'), [
      'Receba a bênção',
      'e a Sua luz',
    ]);
  });

  it('nenhuma linha passa do limite mais a folga', () => {
    for (const fonte of [ESTROFES_FONTE, ESTROFES_FONTE_2]) {
      for (const slide of normalizarEstrofesComMaxLinhas(fonte, 4)) {
        for (const linha of slide.split('\n')) {
          assert.ok(linha.length <= 30, `linha longa demais (${linha.length}): ${linha}`);
        }
      }
    }
  });
});

describe('estrofes curtas seguidas', () => {
  it('junta duas estrofes de 2 linhas no mesmo slide', () => {
    assert.deepEqual(normalizarEstrofesComMaxLinhas(ESTROFES_FONTE_2.slice(0, 2), 4), [
      'Na presença dos homens\nNa presença dos anjos, sempre\nEu Te louvarei\nTe louvarei',
    ]);
  });

  it('não junta quando a soma passa do máximo de linhas', () => {
    const slides = normalizarEstrofesComMaxLinhas(ESTROFES_FONTE_2.slice(2, 4), 4);
    assert.deepEqual(slides, [
      'Mesmo estando em guerra\nVou celebrando\nMinha vitória',
      'Eu Te louvarei\nTe louvarei',
    ]);
  });

  it('gera a sequência esperada para a música inteira', () => {
    assert.deepEqual(normalizarEstrofesComMaxLinhas(ESTROFES_FONTE_2, 4), [
      'Na presença dos homens\nNa presença dos anjos, sempre\nEu Te louvarei\nTe louvarei',
      'Mesmo estando em guerra\nVou celebrando\nMinha vitória',
      'Eu Te louvarei\nTe louvarei',
      'Sobre toda Terra\nNovo som se ouvirá\nTua alegria\nForça pra continuar',
      'Eu entro na Sua presença\nPra receber o Seu poder\nE quanto mais o tempo passa\nMais quero Deus',
    ]);
  });
});

describe('unirLinhasIncompletas', () => {
  it('remonta a frase que a fonte cortou na métrica do canto', () => {
    assert.deepEqual(
      unirLinhasIncompletas(['E quanto mais', 'O tempo passa', 'Mais quero Deus']),
      ['E quanto mais o tempo passa', 'Mais quero Deus']
    );
    assert.deepEqual(unirLinhasIncompletas(['O som da festa vai', 'Subir']), [
      'O som da festa vai subir',
    ]);
  });

  it('não junta linhas que já fecham a ideia', () => {
    const linhas = ['Eu Te louvarei', 'Te louvarei', 'Na presença dos homens'];
    assert.deepEqual(unirLinhasIncompletas(linhas), linhas);
  });

  it('não junta depois de ponto final', () => {
    const linhas = ['Tudo posso naquele que.', 'Me fortalece'];
    assert.deepEqual(unirLinhasIncompletas(linhas), linhas);
  });

  it('preserva maiúscula de nome próprio na continuação', () => {
    assert.deepEqual(unirLinhasIncompletas(['Eu quero mais de', 'Deus']), [
      'Eu quero mais de Deus',
    ]);
    assert.deepEqual(unirLinhasIncompletas(['Venho para Te', 'Adorar']), [
      'Venho para Te adorar',
    ]);
  });

  it('a frase remontada não atravessa slides', () => {
    const slides = normalizarEstrofesComMaxLinhas(
      ['Eu entro na Sua presença\nPra receber o Seu poder\nE quanto mais\nO tempo passa\nMais quero Deus'],
      4
    );
    assert.deepEqual(slides, [
      'Eu entro na Sua presença\nPra receber o Seu poder\nE quanto mais o tempo passa\nMais quero Deus',
    ]);
  });
});
