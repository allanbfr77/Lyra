/**
 * invbPlaylistFetch.js
 * Busca e parseia a playlist (escala) do culto a partir do Supabase da INVB.
 *
 * Estrutura real do campo `louvores`:
 *   { itens: [{nome, tom, data, musica_id, ofertorio?, pos?, ceia?}, ...], ministrante, ministrante_data }
 *   Pode vir como objeto já parseado (PostgREST retorna JSONB como objeto)
 *   ou como string JSON (caso legacy).
 */

const INVB_SUPABASE_REST_BASE = 'https://rosvseljurczmzdycbxs.supabase.co/rest/v1';

const SECTION_FLAGS = [
  { flag: 'ofertorio', tema: 'OFERTÓRIO' },
  { flag: 'pos',       tema: 'PÓS-CULTO' },
  { flag: 'ceia',      tema: 'CEIA' },
];

function getSupabaseKey() {
  const key = process.env.INVB_SUPABASE_ANON_KEY;
  if (!key) throw new Error('INVB_SUPABASE_ANON_KEY não definida no ambiente');
  return key;
}

/**
 * Retorna o tema de um item da escala com base nas flags de seção.
 */
function temaDoItem(item) {
  for (const { flag, tema } of SECTION_FLAGS) {
    if (item[flag] === true) return tema;
  }
  return 'ABERTURA';
}

/**
 * Extrai o array de itens do campo `louvores`.
 * louvores pode ser:
 *   - objeto { itens: [...] }                  (PostgREST JSONB já parseado)
 *   - string JSON de { itens: [...] }          (legacy serializado)
 *   - array direto (formato muito antigo)
 *   - string JSON de array
 */
function extrairItensLouvores(louvores) {
  if (!louvores) return [];

  // Já é array direto
  if (Array.isArray(louvores)) return louvores;

  // Objeto com campo itens (formato atual)
  if (typeof louvores === 'object' && Array.isArray(louvores.itens)) {
    return louvores.itens;
  }

  // String — tentar parsear
  if (typeof louvores === 'string') {
    let parsed;
    try { parsed = JSON.parse(louvores); } catch { return []; }

    // double-encoded
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { return []; }
    }

    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.itens)) return parsed.itens;
  }

  return [];
}

/**
 * Extrai a data (YYYY-MM-DD) do primeiro item da lista.
 */
function extrairDataDosItens(itens) {
  for (const item of itens) {
    if (item.data && typeof item.data === 'string' && /\d{4}-\d{2}-\d{2}/.test(item.data)) {
      return item.data.match(/\d{4}-\d{2}-\d{2}/)[0];
    }
  }
  return null;
}

/**
 * Busca todos os cultos da tabela `cultos` no Supabase.
 * Retorna array de { tipo, cultoId, itens } onde cada item tem campo `tema`.
 */
async function buscarCultosInvb() {
  const key = getSupabaseKey();
  const url = `${INVB_SUPABASE_REST_BASE}/cultos?select=*`;

  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Erro ao buscar cultos do Supabase: ${res.status} ${txt}`);
  }

  const rows = await res.json();
  const resultado = [];

  for (const row of rows) {
    const tipo = row.tipo;
    const itensRaw = extrairItensLouvores(row.louvores);

    if (!itensRaw.length) continue;

    const data = extrairDataDosItens(itensRaw);
    const cultoId = data ? `culto_${data}_${tipo}` : `culto_sem_data_${tipo}`;

    const itens = itensRaw.map(item => ({
      ...item,
      tema: temaDoItem(item),
    }));

    resultado.push({ tipo, cultoId, itens });
  }

  return resultado;
}

module.exports = { buscarCultosInvb, extrairItensLouvores, temaDoItem };
