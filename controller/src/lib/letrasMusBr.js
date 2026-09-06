'use strict';

const { buscarNoIndiceDeMusicas } = require('./indiceMusicasBusca');

const {
  parseCaminhoLetraLetrasMusBr,
} = require('@lyra/letras-fontes');
const {
  foldAccents,
  slugParaTituloExibicao,
  normalizarMaxLinhasPorSlide,
  normalizarEstrofesComMaxLinhas,
  estrofesDePaginaLetrasMusHtml,
  estrofesDeTextoLetrasMetaEOg,
  tituloArtistaDoScriptPageArgsLetras,
  fetchHtmlLetrasMus,
  tentarLetraLetrasViaIndice,
  extrairLetraCifraClubParaPreviewOuImport,
} = require('./cifraLetras');

const LETRAS_ORIGIN = 'https://www.letras.mus.br';

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
  const jaTentados = new Set([`${dns}/${slug}`.toLowerCase()]);

  let html = null;
  let erroDireto = null;
  try {
    html = await fetchHtmlLetrasMus(dns, slug);
  } catch (e) {
    erroDireto = e;
  }

  let estrofes = html ? estrofesDePaginaLetrasMusHtml(html) : [];
  let titulo = '';
  let artista = '';
  let pathNorm = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  if (html && estrofes.length) {
    const pa = tituloArtistaDoScriptPageArgsLetras(html);
    titulo = String(pa.titulo || '').trim();
    artista = String(pa.artista || '').trim();
  } else if (html) {
    estrofes = estrofesDeTextoLetrasMetaEOg(html);
    if (estrofes.length) {
      const pa = tituloArtistaDoScriptPageArgsLetras(html);
      titulo = String(pa.titulo || '').trim();
      artista = String(pa.artista || '').trim();
    }
  }

  // Path do índice às vezes 404 no Letras (slug compartilhado com o Cifra não existe).
  // 1) Mesma URL no CifraClub — preserva a faixa exata (ex.: medley que só existe lá).
  // 2) Depois alternativas no Letras via índice (podem ser outra versão/artista).
  if (!estrofes.length) {
    try {
      const viaCifra = await extrairLetraCifraClubParaPreviewOuImport(abs, {
        maxLinhasPorSlide,
      });
      if (!viaCifra.erro && viaCifra.estrofes?.length) {
        return {
          titulo: viaCifra.titulo,
          artista: viaCifra.artista,
          estrofes: viaCifra.estrofes,
          path: pathNorm,
          maxLinhasPorSlide: viaCifra.maxLinhasPorSlide || maxLinhasPorSlide,
          parcial: !!viaCifra.parcial,
          fonteFallback: 'cifraclub',
        };
      }
    } catch (_) {
      /* tenta Letras via índice abaixo */
    }
  }

  if (!estrofes.length) {
    const viaIndice = await tentarLetraLetrasViaIndice({
      titulo: titulo || slugParaTituloExibicao(slug),
      artista: artista || slugParaTituloExibicao(dns),
      dns,
      songSlug: slug,
      jaTentados,
    });
    if (viaIndice?.estrofes?.length) {
      estrofes = viaIndice.estrofes;
      titulo = viaIndice.titulo || titulo;
      artista = viaIndice.artista || artista;
      if (viaIndice.path) pathNorm = viaIndice.path;
    }
  }

  if (!estrofes.length) {
    return {
      erro:
        (erroDireto && erroDireto.message) ||
        'Não foi possível ler a letra nesta página do Letras.mus.br.',
    };
  }

  estrofes = normalizarEstrofesComMaxLinhas(estrofes, maxLinhasPorSlide);
  titulo = titulo || slugParaTituloExibicao(slug) || 'Sem título';
  artista = artista || slugParaTituloExibicao(dns);
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
