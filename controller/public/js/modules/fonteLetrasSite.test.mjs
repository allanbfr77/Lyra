import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANCO_FONTE_OPCOES,
  FONTE_LETRAS_BANCO_LOCAL,
  FONTE_LETRAS_CIFRACLUB,
  FONTE_LETRAS_LETRAS_MUS,
  FONTE_LETRAS_LYRA_ONLINE,
  normalizarFonteLetrasSite,
  placeholderBuscaLetrasPorFonte,
  fonteEnvioImportarLetras,
} from './fonteLetrasSite.js';

test('normalizarFonteLetrasSite: alias lyra-songbank vira lyra-online', () => {
  assert.equal(normalizarFonteLetrasSite('lyra-songbank'), FONTE_LETRAS_LYRA_ONLINE);
  assert.equal(normalizarFonteLetrasSite('lyra-online'), FONTE_LETRAS_LYRA_ONLINE);
  assert.equal(normalizarFonteLetrasSite('  lyra-online  '), FONTE_LETRAS_LYRA_ONLINE);
});

test('normalizarFonteLetrasSite: sites e banco local; lixo cai no HLYRCS', () => {
  assert.equal(normalizarFonteLetrasSite('cifraclub'), FONTE_LETRAS_CIFRACLUB);
  assert.equal(normalizarFonteLetrasSite('letras-mus-br'), FONTE_LETRAS_LETRAS_MUS);
  assert.equal(normalizarFonteLetrasSite('banco-local'), FONTE_LETRAS_BANCO_LOCAL);
  assert.equal(normalizarFonteLetrasSite(''), FONTE_LETRAS_BANCO_LOCAL);
  assert.equal(normalizarFonteLetrasSite('CifraClub'), FONTE_LETRAS_BANCO_LOCAL);
  assert.equal(normalizarFonteLetrasSite('banco-online-lyra'), FONTE_LETRAS_BANCO_LOCAL);
});

test('BANCO_FONTE_OPCOES tem as quatro fontes do seletor', () => {
  assert.deepEqual(
    BANCO_FONTE_OPCOES.map((o) => o.value),
    [
      FONTE_LETRAS_BANCO_LOCAL,
      FONTE_LETRAS_LYRA_ONLINE,
      FONTE_LETRAS_CIFRACLUB,
      FONTE_LETRAS_LETRAS_MUS,
    ]
  );
  assert.equal(BANCO_FONTE_OPCOES.find((o) => o.value === FONTE_LETRAS_BANCO_LOCAL).label, 'HLYRCS');
});

test('placeholderBuscaLetrasPorFonte segue a fonte já normalizada', () => {
  assert.equal(placeholderBuscaLetrasPorFonte(FONTE_LETRAS_LETRAS_MUS), 'Buscar em letras.mus.br…');
  assert.equal(placeholderBuscaLetrasPorFonte(FONTE_LETRAS_BANCO_LOCAL), 'Buscar no banco offline…');
  assert.equal(placeholderBuscaLetrasPorFonte(FONTE_LETRAS_LYRA_ONLINE), 'Buscar no banco online…');
  assert.equal(placeholderBuscaLetrasPorFonte(FONTE_LETRAS_CIFRACLUB), 'Buscar no Cifra Club…');
  assert.equal(placeholderBuscaLetrasPorFonte('lixo'), 'Buscar no Cifra Club…');
});

test('fonteEnvioImportarLetras: lyra-songbank vai ao online; banco-local não', () => {
  assert.equal(fonteEnvioImportarLetras(FONTE_LETRAS_LETRAS_MUS), FONTE_LETRAS_LETRAS_MUS);
  assert.equal(fonteEnvioImportarLetras(FONTE_LETRAS_LYRA_ONLINE), FONTE_LETRAS_LYRA_ONLINE);
  assert.equal(fonteEnvioImportarLetras('lyra-songbank'), FONTE_LETRAS_LYRA_ONLINE);
  assert.equal(fonteEnvioImportarLetras(FONTE_LETRAS_BANCO_LOCAL), FONTE_LETRAS_CIFRACLUB);
  assert.equal(fonteEnvioImportarLetras(''), FONTE_LETRAS_CIFRACLUB);
  assert.equal(
    fonteEnvioImportarLetras('lyra-songbank'),
    normalizarFonteLetrasSite('lyra-songbank')
  );
});
