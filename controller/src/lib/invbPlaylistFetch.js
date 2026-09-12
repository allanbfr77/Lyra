/**
 * invbPlaylistFetch.js
 * Busca e parseia a playlist (escala) do culto a partir do Supabase da INVB.
 *
 * Estrutura real do campo `louvores`:
 *   { itens: [{nome, tom, data, musica_id, ofertorio?, pos?, ceia?}, ...], ministrante, ministrante_data }
 *   Pode vir como objeto já parseado (PostgREST retorna JSONB como objeto)
 *   ou como string JSON (caso legacy).
 *
 * O `cultoId` devolvido segue a convenção do painel
 * (`controller/public/js/modules/cultosCalendario.js`): `culto_AAAA-MM-DD_<sufixo>`,
 * com sufixo `manha` / `noite` / `quarta` / dia da semana. O `tipo` do site
 * («domingo_manha», «Domingo Manhã», …) é traduzido para esse sufixo — sem isso a
 * playlist era gravada num id que o seletor de culto nunca mostra, e a música só
 * aparecia na Biblioteca.
 */

const INVB_SUPABASE_REST_BASE = 'https://rosvseljurczmzdycbxs.supabase.co/rest/v1';

const SECTION_FLAGS = [
  { flag: 'ofertorio', tema: 'OFERTÓRIO' },
  { flag: 'pos',       tema: 'PÓS-PALAVRA' },
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
 * Sufixos de id de culto do painel (mesma ordem de `SUFIXO_ID_DIA_SEMANA`).
 * Domingo não entra por nome: o painel separa-o em `manha` e `noite`.
 */
const SUFIXO_ID_DIA_SEMANA = [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
];

/** `Domingo Manhã` -> `domingo_manha` (sem acento, minúsculas, separador `_`). */
function chaveTipoCulto(tipo) {
  return String(tipo || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Dia da semana (0=domingo) de uma data `AAAA-MM-DD`, ou null. */
function diaDaSemanaDeIso(dataIso) {
  const m = String(dataIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

/**
 * Sufixo do id de culto do painel a partir do `tipo` do site (e da data como rede
 * de segurança). `domingo_manha` -> `manha`; `quarta_feira` -> `quarta`.
 */
function sufixoCultoDoTipo(tipo, dataIso) {
  const k = chaveTipoCulto(tipo);
  if (k.includes('manha')) return 'manha';
  if (k.includes('noite')) return 'noite';
  /* `domingo` fica de fora: no painel o domingo é sempre `manha` ou `noite`. */
  const porNome = SUFIXO_ID_DIA_SEMANA.find(
    (suf) => suf !== 'domingo' && (k === suf || k.includes(suf))
  );
  if (porNome) return porNome;
  const dow = diaDaSemanaDeIso(dataIso);
  if (dow === 0) return 'manha'; /* domingo sem turno no site: o painel começa na manhã */
  if (dow != null) return SUFIXO_ID_DIA_SEMANA[dow];
  return k || 'culto';
}

/** Id do culto no formato do painel. */
function cultoIdDoSite(tipo, dataIso) {
  const sufixo = sufixoCultoDoTipo(tipo, dataIso);
  return dataIso ? `culto_${dataIso}_${sufixo}` : `culto_sem_data_${sufixo}`;
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
    const cultoId = cultoIdDoSite(tipo, data);

    const itens = itensRaw.map(item => ({
      ...item,
      tema: temaDoItem(item),
    }));

    // Ministrante do culto (nome como vem do site)
    const ministranteNome = (
      (typeof row.louvores === 'object' && row.louvores !== null
        ? row.louvores.ministrante
        : null) || ''
    ).trim();

    resultado.push({ tipo, cultoId, itens, ministranteNome });
  }

  return resultado;
}

module.exports = {
  buscarCultosInvb,
  extrairItensLouvores,
  temaDoItem,
  chaveTipoCulto,
  sufixoCultoDoTipo,
  cultoIdDoSite,
};
