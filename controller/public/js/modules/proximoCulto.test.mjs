import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolverProximoCultoPorHorarioBrasilia,
  horaCorteCulto,
  compararMomentoBrasilia,
  obterAgoraBrasilia,
} from './proximoCulto.js';

/** Brasília UTC-3 → Date UTC */
function emBrasilia(iso, hora, minuto = 0) {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, hora + 3, minuto));
}

function gerarCultosDoMes(dataRef) {
  const y = dataRef.getFullYear();
  const m0 = dataRef.getMonth();
  const lastD = new Date(y, m0 + 1, 0).getDate();
  const mm = String(m0 + 1).padStart(2, '0');
  const out = [];
  for (let d = 1; d <= lastD; d++) {
    const dt = new Date(y, m0, d);
    const dow = dt.getDay();
    const dd = String(d).padStart(2, '0');
    const iso = `${y}-${mm}-${dd}`;
    if (dow === 0) {
      out.push({ id: `culto_${iso}_manha`, label: `${dd}/${mm} | DOMINGO | MANHÃ` });
      out.push({ id: `culto_${iso}_noite`, label: `${dd}/${mm} | DOMINGO | NOITE` });
    }
    if (dow === 3) {
      out.push({ id: `culto_${iso}_quarta`, label: `${dd}/${mm} | QUARTA-FEIRA` });
    }
  }
  return out;
}

const cultosManuais = [];

function listarCultosDisponiveis(dataRef = new Date()) {
  const ref = dataRef instanceof Date ? dataRef : new Date(dataRef);
  const auto = gerarCultosDoMes(ref);
  const idsAuto = new Set(auto.map((c) => c.id));
  const manual = cultosManuais.filter((c) => {
    const m = /^culto_(\d{4}-\d{2}-\d{2})_/.exec(c.id);
    if (!m) return false;
    const [y, mo] = m[1].split('-').map(Number);
    return y === ref.getFullYear() && mo === ref.getMonth() + 1 && !idsAuto.has(c.id);
  });
  return [...auto, ...manual].sort((a, b) => a.id.localeCompare(b.id));
}

function resolver(agora) {
  return resolverProximoCultoPorHorarioBrasilia({ listarCultosDisponiveis, agora });
}

test('hora de corte: domingo manhã 13h, demais 23h', () => {
  assert.equal(horaCorteCulto('culto_2026-09-06_manha'), 13);
  assert.equal(horaCorteCulto('culto_2026-09-06_noite'), 23);
  assert.equal(horaCorteCulto('culto_2026-09-09_quarta'), 23);
  assert.equal(horaCorteCulto('culto_2026-09-11_sexta'), 23);
});

test('domingo antes das 13h → culto da manhã', () => {
  assert.equal(resolver(emBrasilia('2026-09-06', 10)), 'culto_2026-09-06_manha');
});

test('domingo entre 13h e 23h → culto da noite', () => {
  assert.equal(resolver(emBrasilia('2026-09-06', 14)), 'culto_2026-09-06_noite');
  assert.equal(resolver(emBrasilia('2026-09-06', 22, 59)), 'culto_2026-09-06_noite');
});

test('após domingo 23h → próxima quarta', () => {
  assert.equal(resolver(emBrasilia('2026-09-06', 23, 30)), 'culto_2026-09-09_quarta');
  assert.equal(resolver(emBrasilia('2026-09-07', 8)), 'culto_2026-09-09_quarta');
});

test('quarta antes das 23h → culto da quarta', () => {
  assert.equal(resolver(emBrasilia('2026-09-09', 20)), 'culto_2026-09-09_quarta');
});

test('após quarta 23h → domingo manhã seguinte', () => {
  assert.equal(resolver(emBrasilia('2026-09-09', 23, 30)), 'culto_2026-09-13_manha');
  assert.equal(resolver(emBrasilia('2026-09-12', 18)), 'culto_2026-09-13_manha');
});

test('culto extra na sexta entre quarta e domingo', () => {
  cultosManuais.length = 0;
  cultosManuais.push({ id: 'culto_2026-09-11_sexta', label: '11/09 | SEXTA-FEIRA' });

  assert.equal(resolver(emBrasilia('2026-09-09', 23, 30)), 'culto_2026-09-11_sexta');
  assert.equal(resolver(emBrasilia('2026-09-11', 20)), 'culto_2026-09-11_sexta');
  assert.equal(resolver(emBrasilia('2026-09-11', 23, 30)), 'culto_2026-09-13_manha');

  cultosManuais.length = 0;
});

test('compararMomentoBrasilia ordena corretamente', () => {
  assert.equal(compararMomentoBrasilia({ iso: '2026-09-06', hour: 12 }, { iso: '2026-09-06', hour: 13 }), -1);
  assert.equal(compararMomentoBrasilia({ iso: '2026-09-06', hour: 23 }, { iso: '2026-09-07', hour: 0 }), -1);
});

test('obterAgoraBrasilia usa fuso America/Sao_Paulo', () => {
  const br = obterAgoraBrasilia(emBrasilia('2026-09-06', 14, 30));
  assert.equal(br.iso, '2026-09-06');
  assert.equal(br.hour, 14);
  assert.equal(br.minute, 30);
});
