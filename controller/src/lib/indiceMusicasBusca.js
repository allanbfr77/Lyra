'use strict';

/**
 * Busca de músicas pelo índice da Studio Sol.
 *
 * A Studio Sol opera o CifraClub **e** o Letras.mus.br, então este único endpoint
 * atende as duas fontes: os slugs de artista/música são os mesmos nos dois sites.
 *
 * Substitui o scraping do SERP do Yahoo (`site:cifraclub.com.br …`) e da página
 * `/busca/` do Letras.mus.br. Ambos pararam de funcionar: em campo, o Yahoo dava
 * timeout completo (15s sem resposta) e `/busca/?q=` respondia HTTP 404. Era essa
 * a causa real de a busca de letras não retornar nada — no app e aqui no desktop.
 *
 * Filtro e slugs do índice vivem em `@lyra/letras-fontes` (partilhados com o mobile).
 *
 * Formato de cada `doc` da resposta:
 *   t        tipo — "1" artista, "2" música
 *   dns      slug do artista   (ex.: "fernandinho")
 *   url      slug da música    (ex.: "galileu")
 *   art      nome do artista   (ex.: "Fernandinho")
 *   txt      título da música  (ex.: "Galileu")
 *   full_txt título + artista
 */

const {
  slugParaTituloExibicao,
  normalizarFonteLetras,
  resultadoDoIndiceCombina,
} = require('@lyra/letras-fontes');

const INDICE_BUSCA_URL = 'https://solr.sscdn.co/cifraclub/h/';
const INDICE_TIPO_MUSICA = '2';
const MAX_RESULTADOS = 40;
const TIMEOUT_MS = 14000;

/** Marcadores de página de bloqueio/consentimento servida com status 200. */
const MARCADORES_BLOQUEIO = [
  'captcha',
  'unusual traffic',
  'attention required',
  'verifying you are human',
  'access denied',
  'are you a robot',
  'cf-browser-verification',
];

function pareceBloqueio(corpo) {
  const amostra = String(corpo || '').slice(0, 4000).toLowerCase();
  if (!amostra) return false;
  return MARCADORES_BLOQUEIO.some((m) => amostra.includes(m));
}

/**
 * Converte o corpo da resposta do índice em resultados prontos para a UI.
 * Separado do fetch para permitir teste sem rede.
 *
 * @param {string} corpo - corpo bruto da resposta
 * @param {{ texto?: string, filtros?: object, fonte?: string }} opts
 * @returns {{ path: string, titulo: string, artista: string, fonte: string }[]}
 * @throws {Error} se o corpo não for JSON (com `motivo` = 'bloqueado' ou 'http')
 */
function extrairResultadosDoIndice(corpo, opts = {}) {
  const fonte = normalizarFonteLetras(opts.fonte);
  const texto = opts.texto;
  const filtros = opts.filtros || {};

  let data;
  try {
    data = JSON.parse(corpo);
  } catch (_) {
    // Corpo 200 que não é JSON quase sempre é muro de bot ou portal cativo.
    // Sem esta checagem viraria "nenhum resultado" silencioso.
    const err = new Error(
      pareceBloqueio(corpo)
        ? 'Índice de busca respondeu com verificação de robô.'
        : 'Índice de busca devolveu resposta inesperada.'
    );
    err.motivo = pareceBloqueio(corpo) ? 'bloqueado' : 'http';
    throw err;
  }

  const docs = Array.isArray(data && data.response && data.response.docs)
    ? data.response.docs
    : [];

  const visto = new Set();
  const resultados = [];

  for (const d of docs) {
    if (!d || String(d.t) !== INDICE_TIPO_MUSICA || !d.dns || !d.url) continue;

    const row = {
      path: `/${d.dns}/${d.url}/`,
      titulo: String(d.txt || '').trim() || slugParaTituloExibicao(d.url),
      artista: String(d.art || '').trim() || slugParaTituloExibicao(d.dns),
      fonte,
    };

    if (visto.has(row.path)) continue;
    if (!resultadoDoIndiceCombina(row, texto, filtros)) continue;

    visto.add(row.path);
    resultados.push(row);
    if (resultados.length >= MAX_RESULTADOS) break;
  }

  return resultados;
}

/**
 * Busca músicas no índice.
 *
 * @param {{
 *   texto: string,
 *   filtros?: { titulo?: boolean, artista?: boolean, letra?: boolean },
 *   fonte?: string,
 *   timeoutMs?: number,
 * }} opts
 * @returns {Promise<{ path: string, titulo: string, artista: string, fonte: string }[]>}
 */
async function buscarNoIndiceDeMusicas(opts = {}) {
  const texto = String(opts.texto || '').trim();
  if (!texto) return [];

  const url = `${INDICE_BUSCA_URL}?q=${encodeURIComponent(texto)}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), opts.timeoutMs || TIMEOUT_MS);

  let corpo;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });

    if (!res.ok) {
      const err = new Error(`Índice de busca HTTP ${res.status}`);
      err.status = res.status;
      err.motivo = res.status === 403 || res.status === 429 ? 'bloqueado' : 'http';
      throw err;
    }

    corpo = await res.text();
  } catch (e) {
    if (e && e.name === 'AbortError') {
      const err = new Error('Tempo esgotado ao contactar o índice de busca.');
      err.motivo = 'timeout';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }

  return extrairResultadosDoIndice(corpo, {
    texto,
    filtros: opts.filtros,
    fonte: opts.fonte,
  });
}

module.exports = {
  INDICE_BUSCA_URL,
  buscarNoIndiceDeMusicas,
  extrairResultadosDoIndice,
  resultadoDoIndiceCombina,
  normalizarFonteLetras,
};
