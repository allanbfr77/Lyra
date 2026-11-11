'use strict';

/**
 * Playlists (escalas dos cultos) vindas do Lyra DB — https://database.invbotafogo.com.br
 *
 * ## Por que existe
 *
 * O site mostra as playlists em `/playlist`, mas essa página é protegida por login de
 * formulário (cookie de sessão) e a API pública `/api/v1` só documenta músicas, busca e
 * sync. Raspar a página autenticada exigiria guardar usuário/senha ou cookie do operador
 * e depender do HTML — frágil e menos seguro.
 *
 * O caminho adotado é o do próprio site: uma rota Bearer, autenticada pela mesma
 * `LYRA_API_KEY` que o Lyra já usa para as músicas. Ela só é usada quando o site a
 * ANUNCIA na descoberta de `/api/v1` (`endpoints.playlists`) — nada de endpoint adivinhado.
 * Enquanto o site não a anunciar, `buscarCultosLyraApi()` devolve `null` e o chamador
 * mantém a fonte anterior. Contrato esperado: `docs/lyra-db-api-playlists.md`.
 *
 * Sem senha em disco, sem credencial no código, sem cookie: só a chave que já existe.
 */

const lyraSongbank = require('./lyraSongbank');
const { cultoIdDoSite } = require('./invbPlaylistFetch');

const TIMEOUT_MS = 15000;
const MAX_PAGINAS = 20;
const TEMAS_VALIDOS = new Set(['ABERTURA', 'OFERTÓRIO', 'PÓS-PALAVRA', 'CEIA']);

/** Erro com `.codigo` para o chamador dar a mensagem certa ao operador. */
class ErroLyraApi extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.name = 'ErroLyraApi';
    this.codigo = codigo;
  }
}

async function getJson(url) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: lyraSongbank.cabecalhosRequisicao() });
    const texto = await res.text();
    let data = null;
    try {
      data = texto ? JSON.parse(texto) : null;
    } catch (_) {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(tid);
  }
}

/**
 * URL base das playlists, se o site a anunciar. `null` quando não anuncia (ainda não existe).
 * Lança `ErroLyraApi('sem-chave' | 'chave-recusada')` quando o site recusa a chave.
 */
async function descobrirEndpointPlaylists() {
  if (!String(process.env.LYRA_API_KEY || '').trim()) {
    throw new ErroLyraApi('sem-chave', 'LYRA_API_KEY não definida: o Lyra DB não devolve playlists sem ela.');
  }
  const r = await getJson(lyraSongbank.LYRA_SONGBANK_BASE);
  if (r.status === 401 || r.status === 403) {
    throw new ErroLyraApi('chave-recusada', 'O Lyra DB recusou a chave de acesso (LYRA_API_KEY inválida ou revogada).');
  }
  if (!r.ok || !r.data || typeof r.data !== 'object') return null;
  const url = r.data.endpoints && r.data.endpoints.playlists;
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : null;
}

/** `ABERTURA` por omissão; só os temas conhecidos do Lyra são aceitos. */
function normalizarTema(tema) {
  const t = String(tema || '').trim().toLocaleUpperCase('pt-BR');
  return TEMAS_VALIDOS.has(t) ? t : 'ABERTURA';
}

/**
 * Converte uma playlist do site para o formato interno `{ tipo, cultoId, itens, ministranteNome }`
 * que o sync já consome. Playlist sem data válida ou sem itens é ignorada.
 */
function mapearPlaylist(p) {
  if (!p || typeof p !== 'object') return null;
  const data = String(p.data || '').match(/^\d{4}-\d{2}-\d{2}/);
  if (!data) return null;
  const itensRaw = Array.isArray(p.itens) ? p.itens : [];
  const itens = itensRaw
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const nome = String(it.nome || it.titulo || '').trim();
      if (!nome) return null;
      return {
        nome,
        tom: it.tom == null ? '' : String(it.tom),
        data: data[0],
        /* `slug` vindo do site dispensa a busca por título (e o risco de acertar a música errada). */
        slug: it.slug ? String(it.slug).trim() : undefined,
        tema: normalizarTema(it.tema),
        /* `medley: true` = várias músicas numa entrada só; ausente em API antiga (o « / » cobre). */
        medley: it.medley === true,
        fonteApi: true,
      };
    })
    .filter(Boolean);
  if (!itens.length) return null;
  const tipo = String(p.tipo || '').trim();
  return {
    tipo,
    cultoId: cultoIdDoSite(tipo, data[0]),
    itens,
    ministranteNome: String(p.ministrante || '').trim(),
  };
}

/**
 * Cultos do Lyra DB pela API Bearer, no formato interno do sync. Pagina por `next_since`.
 * `null` = o site ainda não oferece a API (use a fonte anterior).
 *
 * @returns {Promise<null | Array<{tipo:string, cultoId:string, itens:Array, ministranteNome:string}>>}
 */
async function buscarCultosLyraApi() {
  const base = await descobrirEndpointPlaylists();
  if (!base) return null;
  const out = [];
  let since = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const u = new URL(base);
    /* A descoberta devolve um MODELO (`?since={iso8601}&limit={1-100}`): os marcadores não são
       valores. Mantê-los fazia o site receber `since` inválido e responder 400. */
    u.search = '';
    u.searchParams.set('limit', '100');
    if (since) u.searchParams.set('since', since);
    const r = await getJson(u.toString());
    if (r.status === 401 || r.status === 403) {
      throw new ErroLyraApi('chave-recusada', 'O Lyra DB recusou a chave de acesso (LYRA_API_KEY inválida ou revogada).');
    }
    if (!r.ok || !r.data || !Array.isArray(r.data.playlists)) {
      throw new ErroLyraApi('resposta-invalida', `O Lyra DB respondeu de forma inesperada ao pedir as playlists (HTTP ${r.status}).`);
    }
    for (const p of r.data.playlists) {
      const c = mapearPlaylist(p);
      if (c) out.push(c);
    }
    if (!r.data.has_more || !r.data.next_since) break;
    since = r.data.next_since;
  }
  return out;
}

module.exports = {
  ErroLyraApi,
  descobrirEndpointPlaylists,
  buscarCultosLyraApi,
  /* Para teste. */
  mapearPlaylist,
  normalizarTema,
};
