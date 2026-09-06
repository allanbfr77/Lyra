/**
 * Calendário de cultos do painel (ids, rótulos, mês automático e extra manual).
 *
 * Extraído do AppCore (secção C) sem mudar o critério: domingo gera manhã+noite,
 * quarta entra sozinha, extras usam o sufixo do dia. Dropdown, playlists e
 * localStorage continuam no núcleo.
 */

import { isoFromCultoId } from './proximoCulto.js';

export const NOMES_DIA_SEMANA_PT = Object.freeze([
  'DOMINGO',
  'SEGUNDA-FEIRA',
  'TERÇA-FEIRA',
  'QUARTA-FEIRA',
  'QUINTA-FEIRA',
  'SEXTA-FEIRA',
  'SÁBADO',
]);

export const SUFIXO_ID_DIA_SEMANA = Object.freeze([
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
]);

function rotuloCultoComTurno(data, dia, turno) {
  return `${String(data).padEnd(5, ' ')} | ${String(dia).padEnd(12, ' ')} | ${String(turno).padEnd(5, ' ')}`;
}

/**
 * Cultos automáticos do mês: domingos (manhã + noite) e quartas, com data DD/MM.
 * @param {Date|*} [dataRef]
 * @returns {{ id: string, label: string }[]}
 */
export function gerarCultosDoMes(dataRef) {
  const d0 = dataRef instanceof Date ? dataRef : new Date();
  const y = d0.getFullYear();
  const m0 = d0.getMonth();
  const lastD = new Date(y, m0 + 1, 0).getDate();
  const mm = String(m0 + 1).padStart(2, '0');
  const out = [];
  for (let d = 1; d <= lastD; d++) {
    const dt = new Date(y, m0, d);
    const dow = dt.getDay();
    const dd = String(d).padStart(2, '0');
    const suf = `${dd}/${mm}`;
    const iso = `${y}-${mm}-${dd}`;
    if (dow === 0) {
      out.push({ id: `culto_${iso}_manha`, label: rotuloCultoComTurno(suf, 'DOMINGO', 'MANHÃ') });
      out.push({ id: `culto_${iso}_noite`, label: rotuloCultoComTurno(suf, 'DOMINGO', 'NOITE') });
    }
    if (dow === 3) {
      out.push({ id: `culto_${iso}_quarta`, label: `${suf} | QUARTA-FEIRA` });
    }
  }
  return out;
}

/** True se o id `culto_YYYY-MM-DD_*` pertence ao mês/ano de `dataRef`. */
export function cultoIdPertenceAoMes(id, dataRef = new Date()) {
  const iso = isoFromCultoId(id);
  if (!iso) return false;
  const d0 = dataRef instanceof Date ? dataRef : new Date();
  const [y, mo] = iso.split('-').map((n) => parseInt(n, 10));
  return y === d0.getFullYear() && mo === d0.getMonth() + 1;
}

/** Gera entradas de culto manual para uma data (domingo = manhã + noite; demais dias = um culto). */
export function gerarCultosParaDataManual(dt) {
  const d0 = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(d0.getTime())) return [];
  const y = d0.getFullYear();
  const m0 = d0.getMonth();
  const d = d0.getDate();
  const mm = String(m0 + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const suf = `${dd}/${mm}`;
  const iso = `${y}-${mm}-${dd}`;
  const dow = d0.getDay();
  const out = [];
  if (dow === 0) {
    out.push({ id: `culto_${iso}_manha`, label: rotuloCultoComTurno(suf, 'DOMINGO', 'MANHÃ') });
    out.push({ id: `culto_${iso}_noite`, label: rotuloCultoComTurno(suf, 'DOMINGO', 'NOITE') });
  } else {
    const diaNome = NOMES_DIA_SEMANA_PT[dow];
    const sufId = SUFIXO_ID_DIA_SEMANA[dow];
    out.push({ id: `culto_${iso}_${sufId}`, label: `${suf} | ${diaNome}` });
  }
  return out;
}

export function parseLabelCulto(label) {
  const txt = String(label || '');
  const m = txt.match(/^(\d{2}\/\d{2})\s*\|\s*(.+)$/);
  if (!m) return { data: '--/--', desc: txt || 'Selecione o dia do culto...' };
  return { data: m[1], desc: m[2].trim() };
}

/** Rótulo quando o código importado não traz nome — mesmo critério do AppCore. */
export function labelFallbackDeCultoIdImport(cid) {
  const iso = isoFromCultoId(cid);
  if (!iso) return String(cid || '');
  const p = iso.split('-');
  const suf = p.length >= 3 ? `${p[2]}/${p[1]}` : iso;
  const m = String(cid).match(/^culto_\d{4}-\d{2}-\d{2}_(\w+)$/i);
  const sufixo = m ? m[1].toLowerCase() : '';
  if (sufixo === 'manha') return `${suf} | DOMINGO | MANHÃ`;
  if (sufixo === 'noite') return `${suf} | DOMINGO | NOITE`;
  if (sufixo === 'quarta') return `${suf} | QUARTA-FEIRA`;
  const idx = SUFIXO_ID_DIA_SEMANA.indexOf(sufixo);
  if (idx >= 0) return `${suf} | ${NOMES_DIA_SEMANA_PT[idx]}`;
  return `${suf} | ${sufixo.toUpperCase()}`;
}
