'use strict';

/**
 * Converte linhas do Tom Louvores (Supabase `musicas`) no payload de import
 * de tons do Lyra (`importarTonsMemoriaDeArquivo`).
 */

const INVB_SUPABASE_REST_BASE_DEFAULT =
  'https://rosvseljurczmzdycbxs.supabase.co/rest/v1';

const INVB_SUPABASE_URL_DEFAULT =
  `${INVB_SUPABASE_REST_BASE_DEFAULT}/musicas?select=*&order=nome.asc`;

const INVB_SUPABASE_ANON_KEY_DEFAULT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvc3ZzZWxqdXJjem16ZHljYnhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODI0MTUsImV4cCI6MjA5NjQ1ODQxNX0.XbiVRQLFzWj7j7-KRXxdtT_3giO0TOsE5hRw86NYNVQ';

const MAP_MIN = {
  cris: 'Cris',
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
  'ORIG.',
]);

/** No site, «Todos» não é pessoa: tom padrão da música para qualquer ministrante. */
function ehMinistranteTodos(nome) {
  const k = String(nome || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  return k === 'todos' || k === 'todas';
}

function chaveNomeMinistrante(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function chaveTituloComparacao(titulo) {
  return String(titulo || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.,;:!?¡¿"'`´^~(){}[\]<>/\\|@#$%&*+=_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function statsHistoricoVazio() {
  return { porMin: new Map(), geral: new Map() };
}

function acumularTomHistorico(mapa, tomRaw, dataRaw) {
  const tom = normTom(tomRaw);
  if (!TONS_OK.has(tom)) return;
  const rec = mapa.get(tom) || { vezes: 0, ultima: '' };
  rec.vezes += 1;
  const data = String(dataRaw || '').trim();
  if (data && data > rec.ultima) rec.ultima = data;
  mapa.set(tom, rec);
}

/**
 * Índice de `historico_louvores`: tom mais cantado por música (+ ministrante).
 * @param {object[]} rows
 */
function indexarHistoricoLouvores(rows) {
  const porTitulo = new Map();
  const porId = new Map();
  const garantir = (mapa, chave) => {
    if (!mapa.has(chave)) mapa.set(chave, statsHistoricoVazio());
    return mapa.get(chave);
  };
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const tituloKey = chaveTituloComparacao(row.nome || row.titulo);
    const idKey = String(row.musica_id || '').trim();
    const alvos = [];
    if (tituloKey) alvos.push(garantir(porTitulo, tituloKey));
    if (idKey) alvos.push(garantir(porId, idKey));
    if (!alvos.length) continue;
    const minKey = chaveNomeMinistrante(normMin(row.ministrante));
    for (const stats of alvos) {
      acumularTomHistorico(stats.geral, row.tom, row.data);
      if (minKey && !ehMinistranteTodos(minKey)) {
        if (!stats.porMin.has(minKey)) stats.porMin.set(minKey, new Map());
        acumularTomHistorico(stats.porMin.get(minKey), row.tom, row.data);
      }
    }
  }
  return { porTitulo, porId };
}

function statsHistoricoParaMusica(index, titulo, musicaId) {
  if (!index || typeof index !== 'object') return null;
  const idKey = String(musicaId || '').trim();
  if (idKey && index.porId instanceof Map && index.porId.has(idKey)) {
    return index.porId.get(idKey);
  }
  const tituloKey = chaveTituloComparacao(titulo);
  if (tituloKey && index.porTitulo instanceof Map && index.porTitulo.has(tituloKey)) {
    return index.porTitulo.get(tituloKey);
  }
  return null;
}

/**
 * Com vários tons candidatos, usa o histórico (mais vezes; empate → data mais recente).
 * Sem histórico, fica o primeiro da lista do site.
 * @param {string[]} tomsCandidatos
 * @param {{porMin:Map, geral:Map}|null} stats
 * @param {string} nomeMinistrante
 */
function escolherTomComHistorico(tomsCandidatos, stats, nomeMinistrante) {
  const unicos = [];
  const visto = new Set();
  for (const raw of Array.isArray(tomsCandidatos) ? tomsCandidatos : []) {
    const tom = normTom(raw);
    if (!TONS_OK.has(tom) || visto.has(tom)) continue;
    visto.add(tom);
    unicos.push(tom);
  }
  if (!unicos.length) return '';
  if (unicos.length === 1 || !stats) return unicos[0];

  const melhorDe = (mapa) => {
    if (!mapa || typeof mapa.get !== 'function') return null;
    let best = '';
    let bestVezes = 0;
    let bestData = '';
    for (const tom of unicos) {
      const rec = mapa.get(tom);
      if (!rec || rec.vezes <= 0) continue;
      if (
        rec.vezes > bestVezes ||
        (rec.vezes === bestVezes && String(rec.ultima || '') > bestData)
      ) {
        best = tom;
        bestVezes = rec.vezes;
        bestData = String(rec.ultima || '');
      }
    }
    return best || null;
  };

  const minKey = chaveNomeMinistrante(normMin(nomeMinistrante));
  if (minKey && stats.porMin instanceof Map) {
    const doMin = melhorDe(stats.porMin.get(minKey));
    if (doMin) return doMin;
  }
  return melhorDe(stats.geral) || unicos[0];
}

function normMin(n) {
  if (ehMinistranteTodos(n)) return 'Todos';
  const k = String(n || '')
    .trim()
    .toLowerCase();
  return MAP_MIN[k] || String(n || '').trim();
}

/**
 * Associa o nome do site a um ministrante já cadastrado (Humberto ≈ Pr. Humberto).
 * Não cria pessoa — só resolve alias/prefixo único.
 * @param {string} nomeRaw
 * @param {{id:number, nome:string}[]} cadastrados
 * @returns {{id:number, nome:string}|null}
 */
function resolverMinistranteNoCadastro(nomeRaw, cadastrados) {
  const lista = Array.isArray(cadastrados) ? cadastrados : [];
  const bruto = String(nomeRaw || '').trim();
  if (!bruto || ehMinistranteTodos(bruto)) return null;
  const alvo = chaveNomeMinistrante(normMin(bruto));
  if (!alvo) return null;

  const exact = [];
  const prefixo = [];
  for (const m of lista) {
    if (!m || ehMinistranteTodos(m.nome)) continue;
    const n = chaveNomeMinistrante(m.nome);
    const nCanon = chaveNomeMinistrante(normMin(m.nome));
    if (n === alvo || nCanon === alvo) {
      exact.push(m);
      continue;
    }
    if (
      n.startsWith(`${alvo} `) ||
      alvo.startsWith(`${n} `) ||
      nCanon.startsWith(`${alvo} `) ||
      alvo.startsWith(`${nCanon} `)
    ) {
      prefixo.push(m);
    }
  }
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const mesmoTexto = exact.find(
      (m) => chaveNomeMinistrante(m.nome) === chaveNomeMinistrante(bruto)
    );
    return mesmoTexto || exact[0];
  }
  if (prefixo.length === 1) return prefixo[0];
  return null;
}

function normTom(tom) {
  let t = String(tom || '').trim();
  if (/^orig\.?$/i.test(t)) return 'ORIG.';
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
  const nomesCampo = String(ministranteField || '')
    .split(/[,;/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (nomesCampo.some((n) => ehMinistranteTodos(n))) {
    const tomTodos = out[0]?.tom || normTom(tomField);
    if (tomTodos && TONS_OK.has(tomTodos) && !out.some((p) => ehMinistranteTodos(p.min))) {
      out.push({ tom: tomTodos, min: 'Todos' });
    }
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
 * @param {ReturnType<typeof indexarHistoricoLouvores>|null} [historicoIndex]
 * @returns {{ titulo: string, artista: string, tons: object|array }|null}
 */
function itemImportFromMusicaRow(row, historicoIndex) {
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

  const stats = statsHistoricoParaMusica(historicoIndex, titulo, row.id || row.musica_id);
  for (const [min, toms] of byMin) {
    if (toms.length <= 1) continue;
    const escolhido = escolherTomComHistorico(toms, stats, min);
    byMin.set(min, escolhido ? [escolhido] : [toms[0]]);
  }

  /* Um único tom no site = tag Todos automática (vale para qualquer ministrante). */
  const temTodos = [...byMin.keys()].some((k) => ehMinistranteTodos(k));
  if (!temTodos) {
    const tomsUnicos = new Set();
    for (const toms of byMin.values()) for (const t of toms) tomsUnicos.add(t);
    if (tomsUnicos.size === 1) {
      byMin.set('Todos', [[...tomsUnicos][0]]);
    }
  }

  const multi = [...byMin.values()].some((arr) => arr.length > 1);
  let tons;
  if (multi) {
    tons = [];
    for (const [min, tomsMin] of byMin) {
      for (const tom of tomsMin) tons.push({ ministrante: min, tom });
    }
  } else {
    tons = {};
    for (const [min, tomsMin] of byMin) tons[min] = tomsMin[0];
  }

  return {
    titulo,
    artista: artistFromObs(row.observacoes),
    tons,
  };
}

/**
 * @param {object[]} rows
 * @param {ReturnType<typeof indexarHistoricoLouvores>|object[]|null} [historico]
 */
function payloadImportFromMusicaRows(rows, historico) {
  const historicoIndex = Array.isArray(historico)
    ? indexarHistoricoLouvores(historico)
    : historico || null;
  const itens = [];
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    const item = itemImportFromMusicaRow(row, historicoIndex);
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
function payloadImportFromWebhookBody(body, historico) {
  const src = body && typeof body === 'object' ? body : {};
  const record = src.record && typeof src.record === 'object' ? src.record : null;
  const historicoIndex = Array.isArray(historico)
    ? indexarHistoricoLouvores(historico)
    : historico || null;
  if (!record) {
    if (Array.isArray(src.itens) || Array.isArray(src.musicas)) {
      return src;
    }
    return payloadImportFromMusicaRows([]);
  }
  const item = itemImportFromMusicaRow(record, historicoIndex);
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

function supabaseRestBase() {
  const { url } = supabaseConfigFromEnv();
  const m = String(url || '').match(/^(https?:\/\/[^/]+\/rest\/v1)/i);
  return m ? m[1] : INVB_SUPABASE_REST_BASE_DEFAULT;
}

async function fetchSupabaseTabela(caminhoComQuery) {
  const { key } = supabaseConfigFromEnv();
  const base = supabaseRestBase().replace(/\/$/, '');
  const page = 1000;
  let from = 0;
  const out = [];
  while (true) {
    const res = await fetch(`${base}/${String(caminhoComQuery || '').replace(/^\//, '')}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + page - 1}`,
        Prefer: 'count=exact',
      },
    });
    if (!res.ok) {
      const err = new Error(`Supabase HTTP ${res.status}`);
      err.statusCode = res.status === 404 ? 404 : 502;
      throw err;
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      const err = new Error('Resposta inválida do Supabase.');
      err.statusCode = 502;
      throw err;
    }
    out.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return out;
}

async function fetchMusicasFromSupabase() {
  const { url, key } = supabaseConfigFromEnv();
  if (String(url || '').includes('?')) {
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
  return fetchSupabaseTabela('musicas?select=*&order=nome.asc');
}

async function fetchHistoricoFromSupabase() {
  try {
    return await fetchSupabaseTabela(
      'historico_louvores?select=musica_id,nome,tom,ministrante,data&order=data.desc'
    );
  } catch (e) {
    if (e && e.statusCode === 404) return [];
    throw e;
  }
}

async function buildImportPayloadFromSupabase() {
  const [rows, historico] = await Promise.all([
    fetchMusicasFromSupabase(),
    fetchHistoricoFromSupabase().catch(() => []),
  ]);
  return payloadImportFromMusicaRows(rows, historico);
}

module.exports = {
  TONS_OK,
  ehMinistranteTodos,
  chaveNomeMinistrante,
  chaveTituloComparacao,
  resolverMinistranteNoCadastro,
  indexarHistoricoLouvores,
  escolherTomComHistorico,
  statsHistoricoParaMusica,
  normMin,
  normTom,
  parsePares,
  itemImportFromMusicaRow,
  payloadImportFromMusicaRows,
  payloadImportFromWebhookBody,
  fetchMusicasFromSupabase,
  fetchHistoricoFromSupabase,
  buildImportPayloadFromSupabase,
  supabaseConfigFromEnv,
  INVB_SUPABASE_URL_DEFAULT,
  INVB_SUPABASE_ANON_KEY_DEFAULT,
};
