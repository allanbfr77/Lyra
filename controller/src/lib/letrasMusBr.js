'use strict';

const https = require('https');

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

function httpsGetUtf8(urlStr, ms = 14000) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      reject(e);
      return;
    }
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Yahoo HTTP ${res.statusCode}`));
            return;
          }
          resolve(txt);
        });
      }
    );
    const tid = setTimeout(() => {
      req.destroy(new Error('Tempo esgotado ao contactar Yahoo.'));
    }, ms);
    req.on('error', (e) => {
      clearTimeout(tid);
      reject(e);
    });
    req.on('close', () => clearTimeout(tid));
    req.end();
  });
}

async function yahooHtmlSiteLetrasMusBr(termo) {
  const q = `site:letras.mus.br ${termo}`;
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`;
  return await httpsGetUtf8(url);
}

function extrairParesRuLetrasMusBr(html) {
  const out = [];
  const re =
    /RU=(https%3[aA]%2[fF]%2[fF](?:www\.)?letras\.mus\.br(?:%2[fF][a-z0-9_.-]+)+(?:%2[fF])?)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let decoded;
    try {
      decoded = decodeURIComponent(m[1]);
    } catch (_) {
      continue;
    }
    const path = parseCaminhoLetraLetrasMusBr(decoded);
    if (!path) continue;
    const resto = html.slice(m.index, m.index + 14000);
    const trechoPlano = resto
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 700);
    out.push({ path, snippet: trechoPlano });
  }
  const visto = new Set();
  return out.filter((x) => {
    if (visto.has(x.path)) return false;
    visto.add(x.path);
    return true;
  });
}

function mergeResultadosLetrasBusca(primario, secundario) {
  const visto = new Set(primario.map((x) => x.path));
  const out = [...primario];
  for (const row of secundario) {
    if (visto.has(row.path)) continue;
    visto.add(row.path);
    out.push(row);
  }
  return out;
}

async function fetchHtmlBuscaLetrasMus(termo) {
  const q = encodeURIComponent(String(termo || '').trim());
  const url = `${LETRAS_ORIGIN}/busca/?q=${q}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: `${LETRAS_ORIGIN}/`,
    },
  });
  return await r.text();
}

function extrairResultadosBuscaLetrasMusBr(html) {
  const out = [];
  const re = /href="(\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\/)(?:"|[^>]*>)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const path = parseCaminhoLetraLetrasMusBr(`${LETRAS_ORIGIN}${m[1]}`);
    if (!path) continue;
    const resto = html.slice(m.index, m.index + 8000);
    const trechoPlano = resto
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
    out.push({ path, snippet: trechoPlano });
  }
  const visto = new Set();
  return out.filter((x) => {
    if (visto.has(x.path)) return false;
    visto.add(x.path);
    return true;
  });
}

function candidatoCombinaBuscaLetras(row, qBruto, { titulo, artista, letra }) {
  const q = foldAccents(qBruto.trim());
  if (!q) return true;
  const seg = row.path.split('/').filter(Boolean);
  const dns = seg[0] || '';
  const slug = seg[1] || '';
  const slugTxt = foldAccents(slug.replace(/-/g, ' '));
  const dnsTxt = foldAccents(dns.replace(/-/g, ' '));
  const snip = foldAccents(row.snippet || '');
  let ok = false;
  if (titulo && slugTxt.includes(q)) ok = true;
  if (artista && dnsTxt.includes(q)) ok = true;
  if (letra && snip.includes(q)) ok = true;
  if (!titulo && !artista && !letra) ok = true;
  return ok;
}

async function buscarResultadosLetrasMusBr(termo, opts = {}) {
  const texto = String(termo || '').trim();
  if (!texto) return [];

  let bruto = [];
  try {
    const htmlBusca = await fetchHtmlBuscaLetrasMus(texto);
    bruto = extrairResultadosBuscaLetrasMusBr(htmlBusca);
  } catch (e) {
    console.warn('[Letras.mus.br] busca direta:', e.message);
  }

  try {
    const htmlYahoo = await yahooHtmlSiteLetrasMusBr(texto);
    bruto = mergeResultadosLetrasBusca(bruto, extrairParesRuLetrasMusBr(htmlYahoo));
  } catch (e) {
    console.warn('[Letras.mus.br] Yahoo:', e.message);
  }

  const filt = {
    titulo: opts.titulo !== false,
    artista: !!opts.artista,
    letra: !!opts.letra,
  };
  const termoFiltro = foldAccents(opts.termoFiltro != null ? opts.termoFiltro : texto);
  return bruto.filter((row) => candidatoCombinaBuscaLetras(row, termoFiltro, filt));
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
