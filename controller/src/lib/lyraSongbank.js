'use strict';

/**
 * Banco online do Lyra — API pública só de leitura, sem chave.
 *
 * Documentação: `documentacao do lyra banco de musicas.md`.
 * Base: https://lyra-music-database.vercel.app/api/v1
 *
 * Este módulo trabalha SOMENTE com letra (`lyrics`). Nunca pede cifra, nunca
 * usa `include=all_keys`, nunca chama `/chords/` e ignora `chords` / `keys`
 * se vierem na resposta.
 */

const cifra = require('./cifraLetras');

const LYRA_SONGBANK_BASE = 'https://lyra-music-database.vercel.app/api/v1';
const FONTE = 'lyra-online';
const TIMEOUT_MS = 14000;
const MAX_RESULTADOS = 40;

const ENDPOINTS_FALLBACK = {
  search: `${LYRA_SONGBANK_BASE}/songs?q={termo}&fields={title,artist,lyrics}&limit={1-100}&offset={n}`,
  song: `${LYRA_SONGBANK_BASE}/songs/{slug}`,
};

let descobertaCache = null;
let descobertaEm = 0;
const DESCOBERTA_TTL_MS = 10 * 60 * 1000;

function ehFonteLyraOnline(fonte) {
  const f = String(fonte || '').trim().toLowerCase();
  return f === 'lyra-online' || f === 'lyra-songbank' || f === 'banco-online-lyra';
}

async function fetchJsonTimeout(url, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    const texto = await res.text();
    let data = null;
    try {
      data = texto ? JSON.parse(texto) : null;
    } catch (_) {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, texto };
  } finally {
    clearTimeout(tid);
  }
}

async function obterEndpoints() {
  if (descobertaCache && Date.now() - descobertaEm < DESCOBERTA_TTL_MS) {
    return descobertaCache;
  }
  try {
    const r = await fetchJsonTimeout(LYRA_SONGBANK_BASE);
    if (r.ok && r.data && r.data.endpoints && typeof r.data.endpoints === 'object') {
      descobertaCache = r.data.endpoints;
      descobertaEm = Date.now();
      return descobertaCache;
    }
  } catch (_) {
    /* cai no fallback documentado */
  }
  return ENDPOINTS_FALLBACK;
}

function urlBusca(endpoints, { q, fields, limit, offset }) {
  const raw = String((endpoints && endpoints.search) || ENDPOINTS_FALLBACK.search);
  const baseUrl = raw.split('?')[0] || `${LYRA_SONGBANK_BASE}/songs`;
  const u = new URL(baseUrl);
  u.searchParams.set('q', String(q || ''));
  if (fields) u.searchParams.set('fields', String(fields));
  u.searchParams.set('limit', String(limit));
  u.searchParams.set('offset', String(offset || 0));
  return u.toString();
}

function urlMusica(endpoints, slug) {
  const raw = String((endpoints && endpoints.song) || ENDPOINTS_FALLBACK.song);
  const s = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (raw.includes('{slug}')) return raw.replace('{slug}', encodeURIComponent(s));
  return `${String(raw).replace(/\/+$/, '')}/${encodeURIComponent(s)}`;
}

/**
 * Checkboxes do Pesquisar Música → parâmetro `fields` da API.
 * Sem nenhum critério, a API procura nos três (padrão documentado).
 */
function montarFieldsBusca({ titulo, artista, letra } = {}) {
  const campos = [];
  if (titulo) campos.push('title');
  if (artista) campos.push('artist');
  if (letra) campos.push('lyrics');
  return campos.length ? campos.join(',') : 'title,artist,lyrics';
}

function mapearResultadoBusca(row) {
  if (!row || typeof row !== 'object') return null;
  const slug = String(row.slug || '').trim();
  if (!slug) return null;
  return {
    path: slug,
    slug,
    titulo: String(row.title || '').trim() || slug,
    artista: String(row.artist || '').trim(),
    fonte: FONTE,
  };
}

/**
 * Palavra real na linha (não é cifra). `//(2X)` é indicação de letra, não acorde.
 */
function linhaTemPalavraDeLetra(linha) {
  const t = String(linha || '').trim();
  if (!t) return false;
  if (/^\/\/\(/.test(t)) return true;
  const semMarcacao = t.replace(/\[[^\]]*\]/g, ' ');
  return /[a-záàâãéêíóôõúç]{3,}/i.test(semMarcacao);
}

const RE_ACORDE =
  /^[A-G](#|b)?(?:m|maj|min|sus|add|dim|aug|º|°)?[0-9]*(?:sus[0-9]+)?(?:\([^)]+\))?(?:\/[A-G](#|b)?)?$/i;

function linhaESoAcordes(linha) {
  const t = String(linha || '').trim();
  if (!t) return false;
  if (linhaTemPalavraDeLetra(t)) return false;
  const semSecao = t.replace(/^\[[^\]]+\]\s*/, '');
  if (!semSecao) {
    return /^\[[^\]]+\]$/.test(t);
  }
  const tokens = semSecao.split(/[\s|]+/).filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((tok) => RE_ACORDE.test(tok));
}

/** Só o campo `lyrics`. `chords`, `keys`, `has_chords` e afins são ignorados. */
function extrairLetraDaMusica(songJson) {
  if (!songJson || typeof songJson !== 'object') return '';
  return String(songJson.lyrics || '').trim();
}

function estrofesDeLetraPura(lyrics) {
  const t = String(lyrics || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!t) return [];
  return t
    .split(/\n\s*\n/)
    .map((bloco) =>
      bloco
        .split('\n')
        .filter((l) => !linhaESoAcordes(l))
        .join('\n')
        .trim()
    )
    .filter(Boolean);
}

async function buscarMusicas({ q, titulo = true, artista = false, letra = false, limit = MAX_RESULTADOS } = {}) {
  const termo = String(q || '').trim();
  if (!termo) return { sucesso: false, erro: 'Parâmetro q obrigatório', resultados: [] };

  const fields = montarFieldsBusca({ titulo, artista, letra });
  const lim = Math.min(100, Math.max(1, Number(limit) || MAX_RESULTADOS));
  const endpoints = await obterEndpoints();
  const url = urlBusca(endpoints, { q: termo, fields, limit: lim, offset: 0 });

  let r;
  try {
    r = await fetchJsonTimeout(url);
  } catch (e) {
    if (e && e.name === 'AbortError') {
      return { sucesso: false, erro: 'Tempo esgotado ao contactar o banco online do Lyra', resultados: [] };
    }
    return { sucesso: false, erro: e.message || 'Falha ao contactar o banco online do Lyra', resultados: [] };
  }

  if (!r.ok || !r.data) {
    const msg =
      (r.data && (r.data.erro || r.data.error || r.data.message)) ||
      `Erro HTTP ${r.status} no banco online do Lyra`;
    return { sucesso: false, erro: msg, resultados: [] };
  }

  const bruto = Array.isArray(r.data.results) ? r.data.results : [];
  const resultados = bruto.map(mapearResultadoBusca).filter(Boolean);
  if (!resultados.length) {
    return { sucesso: false, erro: 'Nenhum resultado encontrado', resultados: [] };
  }
  return { sucesso: true, resultados };
}

async function obterMusicaPorSlug(slug) {
  const s = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!s) return { erro: 'Slug da música inválido' };
  const endpoints = await obterEndpoints();
  const url = urlMusica(endpoints, s);
  let r;
  try {
    r = await fetchJsonTimeout(url);
  } catch (e) {
    if (e && e.name === 'AbortError') return { erro: 'Tempo esgotado ao carregar a letra' };
    return { erro: e.message || 'Falha ao carregar a letra' };
  }
  if (r.status === 404) return { erro: 'Música não encontrada no banco online do Lyra' };
  if (!r.ok || !r.data) {
    return { erro: (r.data && (r.data.erro || r.data.error)) || `Erro HTTP ${r.status}` };
  }
  return { song: r.data };
}

async function extrairLetraParaPreviewOuImport(slug, { maxLinhasPorSlide } = {}) {
  const got = await obterMusicaPorSlug(slug);
  if (got.erro) return { erro: got.erro };
  const letra = extrairLetraDaMusica(got.song);
  if (!letra) return { erro: 'Letra vazia no banco online do Lyra' };
  const brutas = estrofesDeLetraPura(letra);
  if (!brutas.length) return { erro: 'Letra vazia no banco online do Lyra' };
  const maxLinhas = cifra.normalizarMaxLinhasPorSlide(maxLinhasPorSlide);
  const estrofes = cifra.normalizarEstrofesComMaxLinhas(brutas, maxLinhas);
  const pathNorm = String(got.song.slug || slug || '').trim();
  const titulo = String(got.song.title || '').trim() || pathNorm;
  const artista = String(got.song.artist || '').trim();
  return {
    titulo,
    artista,
    estrofes,
    path: pathNorm,
    maxLinhasPorSlide: maxLinhas,
    fonte: FONTE,
  };
}

module.exports = {
  FONTE,
  LYRA_SONGBANK_BASE,
  ehFonteLyraOnline,
  montarFieldsBusca,
  mapearResultadoBusca,
  extrairLetraDaMusica,
  estrofesDeLetraPura,
  linhaESoAcordes,
  urlBusca,
  urlMusica,
  buscarMusicas,
  extrairLetraParaPreviewOuImport,
  ENDPOINTS_FALLBACK,
};
