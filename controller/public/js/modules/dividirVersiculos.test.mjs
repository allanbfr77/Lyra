import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITES_DIVISAO_VERSICULO,
  LIMITE_DIVISAO_PADRAO,
  MARCA_CONTINUACAO,
  normalizarLimiteDivisao,
  normalizarTextoVersiculo,
  dividirTextoVersiculo,
  dividirVersiculos,
  indicePrimeiraParteDoVersiculo,
} from './dividirVersiculos.js';

/** Gênesis 1:12 (ARC) — o versículo da imagem de referência. */
const GENESIS_1_12 =
  'A terra, pois, produziu relva, ervas que davam semente segundo a sua espécie e ' +
  'árvores que davam fruto, cuja semente estava nele, conforme a sua espécie. ' +
  'E viu Deus que isso era bom.';

/** Ester 8:9 — um dos versículos mais longos da Bíblia. */
const ESTER_8_9 =
  'Então, foram chamados os escrivães do rei, naquele mesmo tempo, no terceiro mês, ' +
  'que é o mês de sivã, aos vinte e três do mesmo, e se escreveu conforme tudo quanto ' +
  'ordenou Mardoqueu aos judeus, e aos sátrapas, e aos governadores, e aos príncipes ' +
  'das províncias, que se estendem da Índia até à Etiópia, cento e vinte e sete ' +
  'províncias, a cada província segundo a sua escrita, e a cada povo conforme a sua ' +
  'língua; como também aos judeus segundo a sua escrita e conforme a sua língua.';

const versiculo = (numero, texto) => ({
  livro: 'Gênesis',
  capitulo: '1',
  versiculo: String(numero),
  texto,
});

/** Remove as reticências de emenda e devolve o texto puro de cada parte. */
function semMarcas(partes) {
  return partes.map((p) =>
    p.texto
      .replace(new RegExp(`^${MARCA_CONTINUACAO}`), '')
      .replace(new RegExp(`\\s*${MARCA_CONTINUACAO}$`), '')
  );
}

// ─── 1 · opção desligada é a identidade ──────────────────────────────────────

test('opção desligada devolve uma parte por versículo, sem tocar no texto', () => {
  const entrada = [versiculo(12, GENESIS_1_12), versiculo(13, 'E foi a tarde e a manhã.')];
  const partes = dividirVersiculos(entrada, { ativo: false, limite: 100 });

  assert.equal(partes.length, 2);
  for (const p of partes) {
    assert.equal(p.parteTotal, 1);
    assert.equal(p.parteIndice, 0);
    assert.equal(p.texto, p.textoOriginal);
    assert.ok(!p.texto.includes(MARCA_CONTINUACAO));
  }
  assert.equal(partes[0].texto, GENESIS_1_12);
  assert.equal(partes[0].versiculo, '12');
  assert.equal(partes[0].livro, 'Gênesis');
});

test('opção desligada preserva espaçamento cru do banco (identidade estrita)', () => {
  const cru = '  A terra,   pois,\nproduziu relva.  ';
  const [parte] = dividirVersiculos([versiculo(12, cru)], { ativo: false, limite: 100 });
  assert.equal(parte.texto, cru);
  assert.equal(parte.textoOriginal, cru);
});

// ─── 2 · texto curto não é dividido ──────────────────────────────────────────

test('versículo dentro do limite continua inteiro mesmo com a opção ligada', () => {
  const curto = 'E viu Deus que isso era bom.';
  const partes = dividirVersiculos([versiculo(12, curto)], { ativo: true, limite: 100 });
  assert.equal(partes.length, 1);
  assert.equal(partes[0].parteTotal, 1);
  assert.equal(partes[0].texto, curto);
  assert.ok(!partes[0].texto.includes(MARCA_CONTINUACAO));
});

// ─── 3 · todo pedaço cabe no limite ──────────────────────────────────────────

test('nenhum pedaço excede o limite, descontadas as reticências', () => {
  for (const limite of LIMITES_DIVISAO_VERSICULO) {
    for (const texto of [GENESIS_1_12, ESTER_8_9]) {
      for (const pedaco of dividirTextoVersiculo(texto, limite)) {
        assert.ok(
          pedaco.length <= limite,
          `limite ${limite}: pedaço de ${pedaco.length} caracteres — «${pedaco}»`
        );
      }
    }
  }
});

// ─── 4 · invariante-mestra: nada se perde nem se duplica ─────────────────────

test('juntar os pedaços reproduz o texto normalizado, caractere a caractere', () => {
  for (const limite of LIMITES_DIVISAO_VERSICULO) {
    for (const texto of [GENESIS_1_12, ESTER_8_9]) {
      const junto = dividirTextoVersiculo(texto, limite).join(' ');
      assert.equal(junto, normalizarTextoVersiculo(texto), `limite ${limite}`);
    }
  }
});

test('a invariante vale também depois da decoração com reticências', () => {
  const partes = dividirVersiculos([versiculo(12, GENESIS_1_12)], { ativo: true, limite: 100 });
  assert.equal(semMarcas(partes).join(' '), normalizarTextoVersiculo(GENESIS_1_12));
});

// ─── 5 · preferência do ponto de corte ───────────────────────────────────────

test('prefere cortar no fim de frase', () => {
  const texto = `${'ab '.repeat(30)}fim. ${'cd '.repeat(30)}`.trim();
  const [primeiro] = dividirTextoVersiculo(texto, 100);
  assert.ok(primeiro.endsWith('fim.'), `cortou em «${primeiro.slice(-20)}»`);
});

test('sem fim de frase na janela, corta na vírgula', () => {
  const texto = `${'ab '.repeat(30)}virgula, ${'cd '.repeat(30)}`.trim();
  const [primeiro] = dividirTextoVersiculo(texto, 100);
  assert.ok(primeiro.endsWith('virgula,'), `cortou em «${primeiro.slice(-20)}»`);
});

test('sem pontuação nenhuma, corta em fim de palavra', () => {
  const texto = 'palavra '.repeat(40).trim();
  for (const pedaco of dividirTextoVersiculo(texto, 100)) {
    assert.ok(pedaco.endsWith('palavra'), `cortou no meio: «${pedaco.slice(-12)}»`);
  }
});

test('aspas e parênteses depois da pontuação não impedem o corte de frase', () => {
  const texto = `${'ab '.repeat(26)}(disse ele.) ${'cd '.repeat(30)}`.trim();
  const [primeiro] = dividirTextoVersiculo(texto, 100);
  assert.ok(primeiro.endsWith('ele.)'), `cortou em «${primeiro.slice(-20)}»`);
});

// ─── 6 · equilíbrio entre as partes ──────────────────────────────────────────

test('as partes ficam equilibradas — nada de sobras de uma linha', () => {
  for (const limite of LIMITES_DIVISAO_VERSICULO) {
    for (const texto of [GENESIS_1_12, ESTER_8_9]) {
      const pedacos = dividirTextoVersiculo(texto, limite);
      if (pedacos.length < 2) continue;
      const tamanhos = pedacos.map((p) => p.length);
      const menor = Math.min(...tamanhos);
      const maior = Math.max(...tamanhos);
      assert.ok(
        menor >= maior * 0.35,
        `limite ${limite}: partes desequilibradas ${JSON.stringify(tamanhos)}`
      );
    }
  }
});

// ─── 7 · reticências só nas emendas ──────────────────────────────────────────

test('reticências entram só nas emendas', () => {
  const partes = dividirVersiculos([versiculo(12, ESTER_8_9)], { ativo: true, limite: 100 });
  assert.ok(partes.length > 2);

  const primeira = partes[0];
  const ultima = partes[partes.length - 1];
  assert.ok(!primeira.texto.startsWith(MARCA_CONTINUACAO));
  assert.ok(primeira.texto.endsWith(MARCA_CONTINUACAO));
  assert.ok(ultima.texto.startsWith(MARCA_CONTINUACAO));
  assert.ok(!ultima.texto.endsWith(MARCA_CONTINUACAO));

  for (const meio of partes.slice(1, -1)) {
    assert.ok(meio.texto.startsWith(MARCA_CONTINUACAO));
    assert.ok(meio.texto.endsWith(MARCA_CONTINUACAO));
  }
});

test('todas as partes mantêm a mesma referência e o texto original', () => {
  const partes = dividirVersiculos([versiculo(12, GENESIS_1_12)], { ativo: true, limite: 100 });
  for (const [i, p] of partes.entries()) {
    assert.equal(p.livro, 'Gênesis');
    assert.equal(p.capitulo, '1');
    assert.equal(p.versiculo, '12');
    assert.equal(p.textoOriginal, GENESIS_1_12);
    assert.equal(p.parteIndice, i);
    assert.equal(p.parteTotal, partes.length);
    assert.equal(p.chave, `Gênesis|1|12|${i}`);
  }
});

// ─── 8 · casos degenerados ───────────────────────────────────────────────────

test('palavra maior que o limite sofre corte seco, sem hífen e sem laço infinito', () => {
  const texto = 'x'.repeat(260);
  const pedacos = dividirTextoVersiculo(texto, 100);
  assert.deepEqual(
    pedacos.map((p) => p.length),
    [100, 100, 60]
  );
  assert.ok(!pedacos.some((p) => p.includes('-')));
});

test('texto vazio ou nulo devolve uma parte vazia', () => {
  assert.deepEqual(dividirTextoVersiculo('', 100), ['']);
  assert.deepEqual(dividirTextoVersiculo(null, 100), ['']);
  const [parte] = dividirVersiculos([versiculo(1, null)], { ativo: true, limite: 100 });
  assert.equal(parte.texto, '');
  assert.equal(parte.parteTotal, 1);
});

test('entrada que não é lista devolve lista vazia', () => {
  assert.deepEqual(dividirVersiculos(null, { ativo: true, limite: 100 }), []);
  assert.deepEqual(dividirVersiculos(undefined, {}), []);
});

// ─── 9 · normalização do limite ──────────────────────────────────────────────

test('normalizarLimiteDivisao fixa valores fora da lista', () => {
  assert.equal(normalizarLimiteDivisao(100), 100);
  assert.equal(normalizarLimiteDivisao('250'), 250);
  assert.equal(normalizarLimiteDivisao(0), 100);
  assert.equal(normalizarLimiteDivisao(999), 250);
  assert.equal(normalizarLimiteDivisao(170), 150);
  assert.equal(normalizarLimiteDivisao(180), 200);
  assert.equal(normalizarLimiteDivisao('abc'), LIMITE_DIVISAO_PADRAO);
  assert.equal(normalizarLimiteDivisao(null), LIMITE_DIVISAO_PADRAO);
  assert.equal(normalizarLimiteDivisao(''), LIMITE_DIVISAO_PADRAO);
  assert.equal(normalizarLimiteDivisao(undefined), LIMITE_DIVISAO_PADRAO);
});

// ─── 10 · o caso da imagem de referência ─────────────────────────────────────

test('Gênesis 1:12 com limite 150 quebra numa vírgula e mantém a referência', () => {
  const partes = dividirVersiculos([versiculo(12, GENESIS_1_12)], { ativo: true, limite: 150 });
  assert.equal(partes.length, 2);
  assert.ok(partes[0].texto.startsWith('A terra, pois, produziu relva,'));
  assert.ok(
    partes[0].texto.endsWith(`, ${MARCA_CONTINUACAO}`),
    `primeira parte termina em «${partes[0].texto.slice(-24)}»`
  );
  assert.ok(partes[1].texto.startsWith(MARCA_CONTINUACAO));
  assert.ok(partes[1].texto.endsWith('E viu Deus que isso era bom.'));
  /* Os dois cards continuam a ser «12» — a divisão não renumera o texto bíblico. */
  assert.equal(partes[0].versiculo, '12');
  assert.equal(partes[1].versiculo, '12');
  assert.equal(semMarcas(partes).join(' '), normalizarTextoVersiculo(GENESIS_1_12));
});

test('Gênesis 1:12 com limite 100 continua a dar duas partes íntegras', () => {
  const partes = dividirVersiculos([versiculo(12, GENESIS_1_12)], { ativo: true, limite: 100 });
  assert.equal(partes.length, 2);
  assert.equal(semMarcas(partes).join(' '), normalizarTextoVersiculo(GENESIS_1_12));
  for (const p of partes) {
    assert.equal(p.versiculo, '12');
    assert.equal(p.parteTotal, 2);
  }
});

// ─── extra · localização da primeira parte ───────────────────────────────────

test('indicePrimeiraParteDoVersiculo aponta para o início do versículo', () => {
  const partes = dividirVersiculos(
    [versiculo(11, 'curto'), versiculo(12, GENESIS_1_12), versiculo(13, 'outro')],
    { ativo: true, limite: 100 }
  );
  const idx = indicePrimeiraParteDoVersiculo(partes, 12);
  assert.equal(partes[idx].versiculo, '12');
  assert.equal(partes[idx].parteIndice, 0);
  assert.equal(indicePrimeiraParteDoVersiculo(partes, '13'), idx + 2);
  assert.equal(indicePrimeiraParteDoVersiculo(partes, 99), -1);
  assert.equal(indicePrimeiraParteDoVersiculo(null, 1), -1);
});
