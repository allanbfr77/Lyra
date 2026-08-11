'use strict';

/**
 * Converte linhas do Tom Louvores (Supabase `musicas`) no payload de import
 * de tons do Lyra (`importarTonsMemoriaDeArquivo`).
 */

const INVB_SUPABASE_URL_DEFAULT =
  'https://rosvseljurczmzdycbxs.supabase.co/rest/v1/musicas?select=*&order=nome.asc';

const INVB_SUPABASE_ANON_KEY_DEFAULT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvc3ZzZWxqdXJjem16ZHljYnhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODI0MTUsImV4cCI6MjA5NjQ1ODQxNX0.XbiVRQLFzWj7j7-KRXxdtT_3giO0TOsE5hRw86NYNVQ';

const MAP_MIN = {
  cris: 'Cris',
  'cris medeiros': 'Cris',
  daniela: 'Daniela',
  mirian: 'Mirian',
  raphaela: 'Raphaela',
  'pr. humberto': 'Pr. Humberto',
  'pr humberto': 'Pr. Humberto',
  humberto: 'Pr. Humberto',
  vanessa: 'Vanessa',
};

const TONS_OK = new Set([
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm',
]);

function normMin(n) {
  const k = String(n || '')
    .trim()
    .toLowerCase();
  return MAP_MIN[k] || String(n || '').trim();
}

function normTom(tom) {
  let t = String(tom || '').trim();
  const map = {
    Db: 'C#',
    Eb: 'D#',
    Gb: 'F#',
    Ab: 'G#',
    Bb: 'A#',
    Dbm: 'C#m',
    Ebm: 'D#m',
    Gbm: 'F#m',
    Abm: 'G#m',
    Bbm: 'A#m',
  };
  if (map[t]) t = map[t];
  return t;
}

function parsePares(tomField, ministranteField) {
  const out = [];
  let parsed = null;
  try {
    const t = typeof tomField === 'string' ? JSON.parse(tomField) : tomField;
    if (Array.isArray(t)) parsed = t;
  } catch (_) {
    /* ignore */
  }
  if (parsed) {
    for (const p of parsed) {
      if (!p) continue;
      const tom = normTom(p.tom);
      const min = normMin(p.min || p.ministrante || '');
      if (tom && min) out.push({ tom, min });
    }
  }
  if (
    !out.length &&
    tomField &&
    typeof tomField === 'string' &&
    !tomField.trim().startsWith('[')
  ) {
    const tom = normTom(tomField);
    const min = normMin(ministranteField);
    if (tom && min) out.push({ tom, min });
  }
  return out;
}

function artistFromObs(obs) {
  const s = String(obs || '');
  const m = s.match(/cifraclub\.com\.br\/([^/]+)\//i);
  if (!m) return '';
  return decodeURIComponent(m[1])
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {object} row linha Supabase `musicas` (ou record do webhook)
 * @returns {{ titulo: string, artista: string, tons: object|array }|null}
 */
function itemImportFromMusicaRow(row) {
  if (!row || typeof row !== 'object') return null;
  const titulo = String(row.nome || row.titulo || '').trim();
  if (!titulo) return null;
  const pares = parsePares(row.tom, row.ministrante);
  const valid = pares.filter((p) => TONS_OK.has(p.tom));
  if (!valid.length) return null;

  const byMin = new Map();
  for (const p of valid) {
    if (!byMin.has(p.min)) byMin.set(p.min, []);
    byMin.get(p.min).push(p.tom);
  }

  const multi = [...byMin.values()].some((arr) => arr.length > 1);
  let tons;
  if (multi) {
    tons = [];
    for (const [min, toms] of byMin) {
      for (const tom of toms) tons.push({ ministrante: min, tom });
    }
  } else {
    tons = {};
    for (const [min, toms] of byMin) tons[min] = toms[0];
  }

  return {
    titulo,
    artista: artistFromObs(row.observacoes),
    tons,
  };
}

/**
 * @param {object[]} rows
 */
function payloadImportFromMusicaRows(rows) {
  const itens = [];
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const item = itemImportFromMusicaRow(row);
    if (item) itens.push(item);
  }
  itens.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  return {
    versao: 1,
    fonte: 'https://louvores.invbotafogo.com.br/',
    gerado_em: new Date().toISOString(),
    itens,
  };
}

/**
 * Payload do Database Webhook / trigger (`type`, `record`, …).
 */
function payloadImportFromWebhookBody(body) {
  const src = body && typeof body === 'object' ? body : {};
  const record = src.record && typeof src.record === 'object' ? src.record : null;
  if (!record) {
    if (Array.isArray(src.itens) || Array.isArray(src.musicas)) {
      return src;
    }
    return payloadImportFromMusicaRows([]);
  }
  const item = itemImportFromMusicaRow(record);
  return {
    versao: 1,
    fonte: 'https://louvores.invbotafogo.com.br/',
    gerado_em: new Date().toISOString(),
    origem: 'webhook',
    tipoEvento: String(src.type || ''),
    itens: item ? [item] : [],
  };
}

function supabaseConfigFromEnv() {
  const url = String(process.env.INVB_SUPABASE_URL || INVB_SUPABASE_URL_DEFAULT).trim();
  const key = String(process.env.INVB_SUPABASE_ANON_KEY || INVB_SUPABASE_ANON_KEY_DEFAULT).trim();
  return { url, key };
}

async function fetchMusicasFromSupabase() {
  const { url, key } = supabaseConfigFromEnv();
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const err = new Error(`Supabase HTTP ${res.status}`);
    err.statusCode = 502;
    throw err;
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    const err = new Error('Resposta inválida do Supabase.');
    err.statusCode = 502;
    throw err;
  }
  return data;
}

async function buildImportPayloadFromSupabase() {
  const rows = await fetchMusicasFromSupabase();
  return payloadImportFromMusicaRows(rows);
}

module.exports = {
  TONS_OK,
  normMin,
  normTom,
  parsePares,
  itemImportFromMusicaRow,
  payloadImportFromMusicaRows,
  payloadImportFromWebhookBody,
  fetchMusicasFromSupabase,
  buildImportPayloadFromSupabase,
  supabaseConfigFromEnv,
  INVB_SUPABASE_URL_DEFAULT,
  INVB_SUPABASE_ANON_KEY_DEFAULT,
};
