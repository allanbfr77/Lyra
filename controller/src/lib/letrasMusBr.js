'use strict';

const { buscarNoIndiceDeMusicas } = require('./indiceMusicasBusca');

const {
  foldAccents,
  slugParaTituloExibicao,
  normalizarMaxLinhasPorSlide,
  normalizarEstrofesComMaxLinhas,
  estrofesDePaginaLetrasMusHtml,
  estrofesDeTextoLetrasMetaEOg,
  tituloArtistaDoScriptPageArgsLetras,
  fetchHtmlLetrasMus,
} = require('./cifraLetras');

const LETRAS_ORIGIN = 'https://www.letras.mus.br';

const LETRAS_SEG_RESERVADOS = new Set([
  'busca',
  'letra',
  'letras',
  'mais-acessadas',
  'top',
  'playlists',
  'blog',
  'sobre',
  'contato',
  'enviar',
  'login',
  'signup',
  'premium',
  'academy',
  'ccid',
]);

function parseCaminhoLetraLetrasMusBr(decodedUrl) {
  try {
    const u = new URL(decodedUrl);
    const host = u.hostname.replace(/^www\./i, '');
    if (host !== 'letras.mus.br') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return null;
    const [artist, song] = parts;
    if (!/^[a-z0-9_-]+$/i.test(artist) || !/^[a-z0-9_-]+$/i.test(song)) return null;
    if (LETRAS_SEG_RESERVADOS.has(artist.toLowerCase())) return null;
    return `/${artist}/${song}/`;
  } catch (_) {
    return null;
  }
}

/**
 * Busca no Letras.mus.br.
 *
 * Delega ao índice da Studio Sol (`indiceMusicasBusca`), que serve as duas fontes
 * porque os slugs são compartilhados com o CifraClub. Antes fazia scraping da
 * página `/busca/?q=` do site somado ao SERP do Yahoo: o primeiro passou a
 * responder HTTP 404 e o segundo a dar timeout, e ambos os erros eram apenas
 * logados com `console.warn`, devolvendo lista vazia como se nada tivesse falhado.
 *
 * @param {string} termo
 * @param {{ titulo?: boolean, artista?: boolean, letra?: boolean, termoFiltro?: string }} [opts]
 * @returns {Promise<{ path: string, titulo: string, artista: string, fonte: string }[]>}
 */
async function buscarResultadosLetrasMusBr(termo, opts = {}) {
  const texto = String(termo || '').trim();
  if (!texto) return [];

  return await buscarNoIndiceDeMusicas({
    texto,
    filtros: {
      titulo: opts.titulo !== false,
      artista: !!opts.artista,
      letra: !!opts.letra,
    },
    fonte: 'letras-mus-br',
  });
}

async function extrairLetraLetrasMusParaPreviewOuImport(pathRaw, opts = {}) {
  const maxLinhasPorSlide = normalizarMaxLinhasPorSlide(opts.maxLinhasPorSlide);
  const trimmed = pathRaw != null ? String(pathRaw).trim() : '';
  if (!trimmed) return { erro: 'path inválido.' };

  const abs = parseCaminhoLetraLetrasMusBr(
    `${LETRAS_ORIGIN}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
  );
  if (!abs) return { erro: 'URL de música inválida para letras.mus.br.' };

  const seg = abs.split('/').filter(Boolean);
  const dns = seg[0] || '';
  const slug = seg[1] || '';

  let html;
  try {
    html = await fetchHtmlLetrasMus(dns, slug);
  } catch (e) {
    return { erro: e.message || 'Letras.mus.br indisponível.' };
  }

  let estrofes = estrofesDePaginaLetrasMusHtml(html);
  if (!estrofes.length) estrofes = estrofesDeTextoLetrasMetaEOg(html);
  if (!estrofes.length) {
    return { erro: 'Não foi possível ler a letra nesta página do Letras.mus.br.' };
  }

  estrofes = normalizarEstrofesComMaxLinhas(estrofes, maxLinhasPorSlide);
  const pa = tituloArtistaDoScriptPageArgsLetras(html);
  const titulo =
    String(pa.titulo || '').trim() || slugParaTituloExibicao(slug) || 'Sem título';
  const artista = String(pa.artista || '').trim() || slugParaTituloExibicao(dns);
  const pathNorm = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return { titulo, artista, estrofes, path: pathNorm, maxLinhasPorSlide };
}

async function buscarLetraLetrasMusBr(titulo, artista) {
  try {
    const texto = artista ? `${titulo} ${artista}` : titulo;
    const filtradas = await buscarResultadosLetrasMusBr(texto, {
      titulo: true,
      artista: !!artista,
      termoFiltro: foldAccents(String(titulo || '')),
    });
    if (!filtradas.length) return null;

    for (const row of filtradas) {
      try {
        const r = await extrairLetraLetrasMusParaPreviewOuImport(row.path);
        if (r.erro || !r.estrofes?.length) continue;
        return {
          titulo: r.titulo,
          artista: r.artista,
          letra: r.estrofes.join('\n\n'),
          sucesso: true,
          fonte: 'Letras.mus.br',
        };
      } catch (_) {
        continue;
      }
    }
    return null;
  } catch (e) {
    console.error('[Controller] Erro Letras.mus.br:', e.message);
    return null;
  }
}

module.exports = {
  parseCaminhoLetraLetrasMusBr,
  buscarResultadosLetrasMusBr,
  extrairLetraLetrasMusParaPreviewOuImport,
  buscarLetraLetrasMusBr,
};
