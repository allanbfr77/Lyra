import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gerarCultosDoMes,
  cultoIdPertenceAoMes,
  gerarCultosParaDataManual,
  parseLabelCulto,
  labelFallbackDeCultoIdImport,
} from './cultosCalendario.js';

test('gerarCultosDoMes: setembro/2026 tem 4 domingos (manhã+noite) e 5 quartas', () => {
  const lista = gerarCultosDoMes(new Date(2026, 8, 1));
  const ids = lista.map((c) => c.id);
  assert.equal(lista.length, 13);
  assert.ok(ids.includes('culto_2026-09-06_manha'));
  assert.ok(ids.includes('culto_2026-09-06_noite'));
  assert.ok(ids.includes('culto_2026-09-02_quarta'));
  assert.ok(ids.includes('culto_2026-09-30_quarta'));
  assert.ok(!ids.includes('culto_2026-09-11_sexta'));
  const manha = lista.find((c) => c.id === 'culto_2026-09-06_manha');
  assert.equal(parseLabelCulto(manha.label).data, '06/09');
  assert.match(manha.label, /DOMINGO/);
  assert.match(manha.label, /MANHÃ/);
});

test('cultoIdPertenceAoMes filtra pelo mês/ano do id', () => {
  const set = new Date(2026, 8, 15);
  assert.equal(cultoIdPertenceAoMes('culto_2026-09-06_manha', set), true);
  assert.equal(cultoIdPertenceAoMes('culto_2026-08-30_noite', set), false);
  assert.equal(cultoIdPertenceAoMes('lixo', set), false);
});

test('gerarCultosParaDataManual: domingo rende dois; sexta rende um', () => {
  const dom = gerarCultosParaDataManual(new Date(2026, 8, 6));
  assert.deepEqual(
    dom.map((c) => c.id),
    ['culto_2026-09-06_manha', 'culto_2026-09-06_noite']
  );
  const sex = gerarCultosParaDataManual(new Date(2026, 8, 11));
  assert.equal(sex.length, 1);
  assert.equal(sex[0].id, 'culto_2026-09-11_sexta');
  assert.equal(sex[0].label, '11/09 | SEXTA-FEIRA');
  assert.deepEqual(gerarCultosParaDataManual('data-invalida'), []);
});

test('parseLabelCulto parte data e descrição; vazio tem fallback', () => {
  assert.deepEqual(parseLabelCulto('06/09 | DOMINGO | MANHÃ'), {
    data: '06/09',
    desc: 'DOMINGO | MANHÃ',
  });
  assert.deepEqual(parseLabelCulto(''), {
    data: '--/--',
    desc: 'Selecione o dia do culto...',
  });
});

test('labelFallbackDeCultoIdImport cobre manhã, quarta e extra', () => {
  assert.equal(labelFallbackDeCultoIdImport('culto_2026-09-06_manha'), '06/09 | DOMINGO | MANHÃ');
  assert.equal(labelFallbackDeCultoIdImport('culto_2026-09-09_quarta'), '09/09 | QUARTA-FEIRA');
  assert.equal(labelFallbackDeCultoIdImport('culto_2026-09-11_sexta'), '11/09 | SEXTA-FEIRA');
  assert.equal(labelFallbackDeCultoIdImport(''), '');
});
