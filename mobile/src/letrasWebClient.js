/**
 * Busca e leitura de letras na web direto no app (sem PC servidor).
 * Lógica espelhada ao controlador (`cifraLetras.js` + `letrasMusBr.js`) — manter alinhado.
 *
 * Fluxo principal:
 * 1. `buscarLetrasNaWeb` → CifraClub (Yahoo) ou Letras.mus.br (busca + Yahoo), conforme `fonte`
 * 2. `extrairLetraParaPreviewOuImport` → extrai estrofes da fonte escolhida
 */

// --- Constantes de origem e configuração ---

import { urlApiControlador } from './lyraEndpoints';

const CIFRA_ORIGIN = 'https://www.cifraclub.com.br';
/** Fallback quando o Cifra não envia mais a letra no HTML (Next.js); mesmos slugs costumam funcionar no Letras. */
const LETRAS_ORIGIN = 'https://www.letras.mus.br';

/** Segmentos de URL do CifraClub que não correspondem a artistas (rotas do site). */
const CIFRA_SEG_RESERVADOS = new Set([
  'blog',
  'academy',
  'metronomo',
  'dicionario',
  'estilos',
  'enviar',
  'forum',
  'busca',
  'login',
  'signup',
  'palcomp3',
  'formesuabanda',
  'curso',
]);

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

/** Timeout em ms para requisições HTTP externas (evita travar a UI indefinidamente). */
const FETCH_MS = 22000;

// --- Utilitários de texto ---

/**
 * Remove acentos e converte para minúsculas para comparações insensíveis a acento.
 * @param {string} s
 * @returns {string}
 */
function foldAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Decodifica entidades HTML numéricas e nomeadas comuns para texto puro.
 * @param {string} s - HTML com entidades (ex.: "&amp;", "&#233;")
 * @returns {string} Texto decodificado
 */
function decodeHtmlEntidades(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Converte um slug de URL em título para exibição (capitaliza cada palavra).
 * Ex.: "oceans-where-feet-may-fail" → "Oceans Where Feet May Fail"
 *
 * @param {string} slug
 * @returns {string}
 */
function slugParaTituloExibicao(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ')
    .trim();
}

// --- Parsing de URLs do CifraClub ---

/**
 * Valida e normaliza um caminho de URL do cifraclub.com.br para o formato `/artista/musica/`.
 * Rejeita URLs de seções do site (blog, busca, etc.) e páginas sem o par artista/música.
 *
 * @param {string} decodedUrl - URL completa já decodificada (ex.: "https://www.cifraclub.com.br/artista/musica/letra/")
 * @returns {string|null} Caminho normalizado (ex.: "/artista/musica/") ou null se inválido
 */
function parseCaminhoLetraCifraClub(decodedUrl) {
  try {
    const u = new URL(decodedUrl);
    const host = u.hostname.replace(/^www\./i, '');
    if (host !== 'cifraclub.com.br') return null;

    let parts = u.pathname.split('/').filter(Boolean);
    // Remove extensão .html se presente
    for (let i = 0; i < parts.length; i++) {
      parts[i] = parts[i].replace(/\.html?$/i, '');
    }

    // Remove sufixo "letra" (redundante para nossos propósitos)
    while (parts.length && parts[parts.length - 1].toLowerCase() === 'letra') {
      parts.pop();
    }

    // Remove sufixos de versão da cifra (ex.: simplificada, principal)
    const versoes = new Set(['simplificada', 'principal', 'imprimir']);
    while (parts.length >= 3 && versoes.has(parts[parts.length - 1].toLowerCase())) {
      parts.pop();
    }

    // Esperamos exatamente dois segmentos: artista e música
    if (parts.length !== 2) return null;
    const [artist, song] = parts;

    // Valida formato slug (apenas letras, números, hifens e underscores)
    if (!/^[a-z0-9_-]+$/i.test(artist) || !/^[a-z0-9_-]+$/i.test(song)) return null;

    // Rejeita segmentos reservados do site
    const al = artist.toLowerCase();
    if (CIFRA_SEG_RESERVADOS.has(al)) return null;

    // Rejeita padrão "/letra/a/" (índice do site, não uma música)
    if (al === 'letra' && /^[a-z]$/i.test(song)) return null;

    return `/${artist}/${song}/`;
  } catch (_) {
    return null;
  }
}

// --- Extração de resultados do Yahoo ---

/**
 * Extrai pares {path, snippet} de URLs do CifraClub encontradas no HTML da página de resultados do Yahoo.
 * Usa o parâmetro `RU=` dos links de redirecionamento do Yahoo para obter as URLs reais.
 *
 * @param {string} html - HTML bruto da página de resultados do Yahoo
 * @returns {{ path: string, snippet: string }[]} Lista de resultados únicos (sem duplicatas de path)
 */
function extrairParesRuCifraClub(html) {
  const out = [];
  // Regex para encontrar URLs do CifraClub codificadas no parâmetro RU= do Yahoo
  const re =
    /RU=(https%3[aA]%2[fF]%2[fF](?:www\.)?cifraclub\.com\.br(?:%2[fF][a-z0-9_.-]+)+(?:%2[fF])?)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let decoded;
    try {
      decoded = decodeURIComponent(m[1]);
    } catch (_) {
      continue;
    }

    const path = parseCaminhoLetraCifraClub(decoded);
    if (!path) continue;

    // Extrai um trecho de texto próximo ao link para usar como snippet de busca
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

  // Remove caminhos duplicados mantendo apenas a primeira ocorrência
  const visto = new Set();
  return out.filter((x) => {
    if (visto.has(x.path)) return false;
    visto.add(x.path);
    return true;
  });
}

// --- Parsing e busca Letras.mus.br (espelho de controller/src/lib/letrasMusBr.js) ---

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

async function yahooHtmlSiteLetrasMusBr(termo) {
  const q = `site:letras.mus.br ${termo}`;
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`;
  const res = await fetchComTimeout(url, { headers: { ...HEADERS_NAVEGADOR } });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  return await res.text();
}

async function fetchHtmlBuscaLetrasMus(termo) {
  const q = encodeURIComponent(String(termo || '').trim());
  const url = `${LETRAS_ORIGIN}/busca/?q=${q}`;
  const res = await fetchComTimeout(url, {
    headers: {
      ...HEADERS_NAVEGADOR,
      Referer: `${LETRAS_ORIGIN}/`,
    },
  });
  return await res.text();
}

async function buscarResultadosLetrasMusBr(termo, { titulo, artista, letra }) {
  const texto = String(termo || '').trim();
  let bruto = [];
  try {
    const htmlBusca = await fetchHtmlBuscaLetrasMus(texto);
    bruto = extrairResultadosBuscaLetrasMusBr(htmlBusca);
  } catch (_) {
    // busca direta pode falhar; Yahoo abaixo
  }
  try {
    const htmlYahoo = await yahooHtmlSiteLetrasMusBr(texto);
    bruto = mergeResultadosLetrasBusca(bruto, extrairParesRuLetrasMusBr(htmlYahoo));
  } catch (_) {
    // Yahoo opcional
  }
  const filt = { titulo, artista, letra };
  return bruto.filter((row) => candidatoCombinaBusca(row, texto, filt));
}

function normalizarFonteLetras(fonte) {
  return fonte === 'letras-mus-br' ? 'letras-mus-br' : 'cifraclub';
}

async function buscarLetrasViaControlador({ hostControlador, texto, artista, fonte }) {
  const base = urlApiControlador(hostControlador);
  if (!base) return null;
  try {
    const params = new URLSearchParams({
      titulo: texto,
      artista: artista ? '1' : '0',
      fonte: normalizarFonteLetras(fonte),
    });
    const res = await fetchComTimeout(`${base}/api/letras/buscar?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.sucesso || !Array.isArray(data.resultados)) return null;
    return data.resultados.map((row) => ({
      path: row.path,
      titulo: row.titulo || '',
      artista: row.artista || '',
      fonte: normalizarFonteLetras(fonte),
    }));
  } catch (_) {
    return null;
  }
}

// --- Filtragem de candidatos ---

/**
 * Verifica se um resultado de busca combina com a query do usuário,
 * de acordo com os critérios de filtragem selecionados.
 *
 * @param {{ path: string, snippet: string }} row - Resultado candidato
 * @param {string} qBruto - Termo de busca original do usuário
 * @param {{ titulo: boolean, artista: boolean, letra: boolean }} filtros - Critérios ativos
 * @returns {boolean}
 */
function candidatoCombinaBusca(row, qBruto, { titulo, artista, letra }) {
  const q = foldAccents(qBruto.trim());
  if (!q) return true; // sem query = aceita tudo

  // Extrai slug do artista e da música a partir do path "/artista/musica/"
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
  return ok;
}

// --- Requisições HTTP ---

const HEADERS_NAVEGADOR = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

function headersCifraClub(pathRel) {
  const pathNorm = (pathRel.startsWith('/') ? pathRel : `/${pathRel}`).replace(/\/?$/, '/');
  return {
    ...HEADERS_NAVEGADOR,
    Referer: `${CIFRA_ORIGIN}${pathNorm}`,
    Origin: CIFRA_ORIGIN,
  };
}

function headersLetrasMus(pathRel) {
  const pathNorm = pathRel.startsWith('/') ? pathRel : `/${pathRel}`;
  return {
    ...HEADERS_NAVEGADOR,
    Referer: `${LETRAS_ORIGIN}${pathNorm}`,
    Origin: LETRAS_ORIGIN,
  };
}

/**
 * Faz uma requisição fetch com timeout automático via AbortController.
 *
 * @param {string} url
 * @param {RequestInit} [init={}]
 * @param {number} [ms=FETCH_MS] - Timeout em milissegundos
 * @returns {Promise<Response>}
 */
async function fetchComTimeout(url, init = {}, ms = FETCH_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Busca o HTML da página de resultados do Yahoo para o CifraClub.
 * Usa User-Agent de navegador desktop para obter resultados mais completos.
 *
 * @param {string} termo - Termo de busca do usuário
 * @returns {Promise<string>} HTML da página de resultados
 */
async function yahooHtmlSiteCifraClub(termo) {
  const q = `site:cifraclub.com.br ${termo}`;
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`;
  const res = await fetchComTimeout(url, {
    headers: {
      ...HEADERS_NAVEGADOR,
    },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  return await res.text();
}

// --- Extração de letra do HTML ---

/**
 * Extrai o conteúdo interno de uma `<div>` identificada por um token de classe.
 * Usa contagem de profundidade de tags para encontrar o fechamento correto da div.
 *
 * @param {string} html - HTML completo da página
 * @param {string} classToken - Token de classe a localizar (ex.: "letra")
 * @returns {string|null} HTML interno da div ou null se não encontrada
 */
function extrairHtmlInternoDivPorClasse(html, classToken) {
  const openMatch = html.match(
    new RegExp(`<div\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${classToken}\\b[^"']*["'][^>]*>`, 'i')
  );
  if (!openMatch || openMatch.index === undefined) return null;

  const innerStart = openMatch.index + openMatch[0].length;
  let i = innerStart;
  let depth = 1;
  const lim = html.length;

  // Percorre o HTML contando abertura e fechamento de divs aninhadas
  while (i < lim && depth > 0) {
    const slice = html.slice(i);
    const mOpen = /<div\b/i.exec(slice);
    const mClose = /<\/div>/i.exec(slice);
    const openRel = mOpen ? mOpen.index : -1;
    const closeRel = mClose ? mClose.index : -1;
    if (closeRel === -1) return null;
    if (openRel !== -1 && openRel < closeRel) {
      depth += 1;
      i += openRel + mOpen[0].length;
    } else {
      depth -= 1;
      const closeAbs = i + closeRel;
      if (depth === 0) {
        return html.slice(innerStart, closeAbs);
      }
      i += closeRel + mClose[0].length;
    }
  }
  return null;
}

/**
 * Extrai estrofes da página HTML do CifraClub.
 * Procura pela div com classe "letra" e parseia os parágrafos `<p>` dentro dela.
 *
 * @param {string} html - HTML da página de letra do CifraClub
 * @returns {string[]} Array de estrofes (cada item = um bloco de versos)
 */
function estrofesDePaginaCifraClub(html) {
  const blob = extrairHtmlInternoDivPorClasse(html, 'letra');
  if (!blob) return [];

  const ps = [...blob.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  const estrofes = [];

  for (const m of ps) {
    let inner = m[1];
    // Converte <br> em quebras de linha antes de remover demais tags
    inner = inner.replace(/<br\s*\/?>/gi, '\n');
    inner = inner.replace(/<[^>]+>/g, '');
    inner = decodeHtmlEntidades(inner);

    const stanza = inner
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n')
      .trim();

    if (stanza) estrofes.push(stanza);
  }
  return estrofes;
}

/** Aceita `<meta name content>` ou `<meta content name>`. */
function metaTagContent(html, { name, property }) {
  const attr = name != null ? `name=["']${name}["']` : `property=["']${property}["']`;
  const re = new RegExp(
    `<meta[^>]+(?:${attr}[^>]+content=["']([^"']*)["']|content=["']([^"']*)["'][^>]+${attr})[^>]*>`,
    'i'
  );
  const m = html.match(re);
  if (!m) return '';
  return String(m[1] || m[2] || '').trim();
}

/**
 * Verifica se o texto da meta description do CifraClub é genérico (sem letra),
 * o que indica que a página é de cifras/tablaturas, não de letra.
 *
 * @param {string} textoPlano
 * @returns {boolean}
 */
function metaDescricaoCifraEGenericaSemLetra(textoPlano) {
  const t = String(textoPlano || '').toLowerCase();
  return (
    t.includes('cifras') &&
    t.includes('tablaturas') &&
    (t.includes('videoaulas') || t.includes('video aulas')) &&
    t.includes('cifra club')
  );
}

/**
 * Fallback: tenta extrair versos da meta description da página do CifraClub.
 * Usado quando o HTML principal não contém a div "letra" (páginas Next.js).
 *
 * @param {string} html
 * @returns {string[]} Estrofes extraídas ou array vazio
 */
function estrofesFallbackMetaDescricaoCifra(html) {
  const raw = metaTagContent(html, { name: 'description' });
  if (!raw) return [];

  let t = decodeHtmlEntidades(raw);

  // Rejeita descrições genéricas do site sem conteúdo de letra
  if (metaDescricaoCifraEGenericaSemLetra(t)) return [];

  // Remove prefixo "... no Cifra Club" que precede a letra na description
  const markerLongo = ' no Cifra Club ';
  const markerCurto = ' no Cifra Club';
  let i = t.indexOf(markerLongo);
  if (i === -1) i = t.indexOf(markerCurto);
  if (i !== -1) t = t.slice(i + (t.indexOf(markerLongo) === i ? markerLongo.length : markerCurto.length)).trim();

  if (!t || metaDescricaoCifraEGenericaSemLetra(t)) return [];

  // Letras na description costumam usar " / " como separador de linhas
  return t.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Extrai estrofes da página HTML do Letras.mus.br.
 * Tenta múltiplas classes de div conhecidas do site (fallback progressivo).
 *
 * @param {string} html - HTML da página do Letras
 * @returns {string[]} Estrofes ou array vazio
 */
function estrofesDePaginaLetrasMusHtml(html) {
  // Tenta cada seletor de div em ordem de prioridade
  for (const token of ['lyric-original', 'lyric-vs', 'cnt-letra', 'letra']) {
    const blob = extrairHtmlInternoDivPorClasse(html, token);
    if (!blob) continue;

    const ps = [...blob.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    const estrofes = [];

    for (const m of ps) {
      let inner = m[1];
      inner = inner.replace(/<br\s*\/?>/gi, '\n');
      inner = inner.replace(/<[^>]+>/g, '');
      inner = decodeHtmlEntidades(inner);

      const stanza = inner
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n')
        .trim();

      if (stanza) estrofes.push(stanza);
    }

    if (estrofes.length) return estrofes;
  }
  return [];
}

/** og:description costuma trazer só os versos (com " / " entre linhas). */
function estrofesDeTextoLetrasMetaEOg(html) {
  // Tenta primeiro a meta og:description (mais limpa)
  const og = metaTagContent(html, { property: 'og:description' });
  if (og) {
    const partes = decodeHtmlEntidades(og)
      .split(/\s*\/\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (partes.length) return partes;
  }

  // Fallback para meta description normal
  const desc = metaTagContent(html, { name: 'description' });
  if (!desc) return [];

  let t = decodeHtmlEntidades(desc);
  // Remove o cabeçalho de identificação que precede a letra no Letras.mus.br
  const marker = '(Letra e música para ouvir)';
  const idx = t.indexOf(marker);
  if (idx !== -1) {
    const after = t.slice(idx + marker.length);
    // O nome do artista vem separado por " - " antes da letra
    const dash = after.indexOf(' - ');
    if (dash !== -1) t = after.slice(dash + 3).trim();
  }

  return t
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extrai título e artista do script de dados de página do Letras.mus.br
 * (campos `track_name` e `artist_name` em JSON inline).
 *
 * @param {string} html
 * @returns {{ titulo: string, artista: string }}
 */
function tituloArtistaDoScriptPageArgsLetras(html) {
  let titulo = '';
  let artista = '';
  const mt = html.match(/"track_name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const ma = html.match(/"artist_name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (mt) titulo = mt[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  if (ma) artista = ma[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  return { titulo, artista };
}

/** Slugs em links internos do HTML do Cifra (ex.: oceans-… quando a URL curta é …/oceans/). */
function slugsLetrasParaTentar(htmlCifra, dns, songSlug) {
  const esc = String(dns || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!esc || !songSlug) return [songSlug];

  // Encontra slugs de músicas do mesmo artista referenciados no HTML
  const re = new RegExp(`href="/${esc}/([a-z0-9-]+)/"`, 'gi');
  const found = new Set();
  let m;
  while ((m = re.exec(htmlCifra)) !== null) found.add(m[1]);

  const arr = [...found];
  // Prioriza slugs que correspondem ao slug principal ou suas variações (ex.: com número)
  const related = arr.filter((s) => s === songSlug || s.startsWith(`${songSlug}-`));
  const ordered =
    related.length > 0
      ? [...related].sort((a, b) => b.length - a.length) // variação mais longa primeiro
      : [songSlug];

  return [...new Set(ordered)];
}

/**
 * Busca o HTML da página de letra no Letras.mus.br.
 *
 * @param {string} dns - Slug do artista (ex.: "hillsong-united")
 * @param {string} slugMusica - Slug da música (ex.: "oceans")
 * @returns {Promise<string>} HTML da página
 */
async function fetchHtmlLetrasMus(dns, slugMusica) {
  const d = String(dns || '').replace(/^\/|\/$/g, '');
  const s = String(slugMusica || '').replace(/^\/|\/$/g, '');
  const pathRel = `/${d}/${s}/`;
  const url = `${LETRAS_ORIGIN}${pathRel}`;
  const r = await fetchComTimeout(url, {
    headers: headersLetrasMus(pathRel),
  });
  if (!r.ok) throw new Error(`Letras HTTP ${r.status}`);
  return await r.text();
}

/** Limite de caracteres por linha antes do fatiamento (alinhado ao controlador). */
const MAX_CHARS_POR_LINHA = 45;

const MIN_CHARS_FRAGMENTO_LINHA = 15;

const CONJUNCOES_QUEBRA_LINHA = [
  'porém', 'porque', 'portanto', 'contudo', 'todavia', 'então',
  'quando', 'pois', 'assim', 'como', 'mas', 'que', 'se', 'ou', 'e',
];

function escRegexQuebra(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function encontrarPontoQuebraNatural(rest, limite) {
  const len = rest.length;
  const minCut = MIN_CHARS_FRAGMENTO_LINHA;
  const maxCut = Math.min(limite, len - MIN_CHARS_FRAGMENTO_LINHA);
  const alvo = Math.floor(len / 2);

  const medidas = (cut) => {
    const head = rest.slice(0, cut).trim().replace(/[,;]\s*$/, '').trim();
    const tail = rest.slice(cut).trim();
    return { headLen: head.length, tailLen: tail.length };
  };

  const cutValido = (cut) => {
    if (cut < minCut || cut > maxCut) return null;
    const { headLen, tailLen } = medidas(cut);
    if (headLen < MIN_CHARS_FRAGMENTO_LINHA || tailLen < MIN_CHARS_FRAGMENTO_LINHA) return null;
    if (headLen > limite) return null;
    return { cut, headLen, tailLen };
  };

  const virgulas = [];
  const reVirg = /,\s*/g;
  let m;
  while ((m = reVirg.exec(rest)) !== null) {
    const info = cutValido(m.index + m[0].length);
    if (info) {
      virgulas.push({
        cut: info.cut,
        desbalance: Math.abs(info.headLen - info.tailLen),
        dist: Math.abs(info.cut - alvo),
      });
    }
  }
  if (virgulas.length) {
    virgulas.sort((a, b) => a.desbalance - b.desbalance || a.dist - b.dist);
    return virgulas[0].cut;
  }

  const candidatos = [];
  const registrar = (prioridade, cut) => {
    const info = cutValido(cut);
    if (!info) return;
    candidatos.push({ prioridade, cut: info.cut, dist: Math.abs(info.cut - alvo) });
  };

  const altConj = CONJUNCOES_QUEBRA_LINHA.map(escRegexQuebra).join('|');
  const reConj = new RegExp(`(?:^|[\\s,;])(?:(${altConj}))(?=[\\s,;]|$)`, 'gi');
  while ((m = reConj.exec(rest)) !== null) {
    registrar(2, m.index + m[0].length - m[1].length);
  }

  const rePunct = /;\s*/g;
  while ((m = rePunct.exec(rest)) !== null) {
    registrar(2, m.index + m[0].length);
  }

  for (let cut = minCut; cut <= maxCut; cut += 1) {
    if (rest[cut - 1] === ' ') registrar(3, cut);
  }
  const sp = rest.lastIndexOf(' ', maxCut);
  if (sp >= minCut) registrar(3, sp);

  if (!candidatos.length) {
    let cut = rest.lastIndexOf(' ', limite);
    if (cut < minCut) cut = Math.max(minCut, Math.min(limite, len - MIN_CHARS_FRAGMENTO_LINHA));
    if (cut <= 0) cut = limite;
    return cut;
  }

  candidatos.sort((a, b) => a.prioridade - b.prioridade || a.dist - b.dist);
  return candidatos[0].cut;
}

function quebrarLinhaLonga(linha, limite = MAX_CHARS_POR_LINHA) {
  const s = String(linha ?? '').trim();
  if (!s || s.length <= limite) return s ? [s] : [];

  const partes = [];
  let rest = s;
  while (rest.length > limite) {
    const cut = encontrarPontoQuebraNatural(rest, limite);
    let head = rest.slice(0, cut).trim().replace(/[,;]\s*$/, '').trim();
    rest = rest.slice(cut).trim();
    if (head) partes.push(head);
  }
  if (rest) partes.push(rest);
  return partes.length ? partes : [s];
}

function expandirLinhasLongas(linhas, limite = MAX_CHARS_POR_LINHA) {
  const out = [];
  for (const l of linhas) out.push(...quebrarLinhaLonga(l, limite));
  return out;
}

function linhasNaoVaziasDoSlide(slide) {
  return String(slide || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length);
}

function eliminarSlidesOrfaos(slides, maxLinhas, totalLinhasMusica) {
  if (!slides.length || totalLinhasMusica < 2) return slides;

  const out = [...slides];
  let i = 0;
  while (i < out.length) {
    const linhas = linhasNaoVaziasDoSlide(out[i]);
    if (linhas.length !== 1) {
      i += 1;
      continue;
    }

    const orphan = linhas[0];

    if (i > 0) {
      const prev = linhasNaoVaziasDoSlide(out[i - 1]);
      if (prev.length < maxLinhas) {
        out[i - 1] = [...prev, orphan].join('\n');
        out.splice(i, 1);
        continue;
      }
    }

    if (i < out.length - 1) {
      const next = linhasNaoVaziasDoSlide(out[i + 1]);
      if (next.length < maxLinhas) {
        out[i + 1] = [orphan, ...next].join('\n');
        out.splice(i, 1);
        continue;
      }
    }

    if (i > 0) {
      const prev = linhasNaoVaziasDoSlide(out[i - 1]);
      if (prev.length >= 2) {
        const moved = prev.pop();
        out[i - 1] = prev.join('\n');
        out[i] = [moved, orphan].join('\n');
        i += 1;
        continue;
      }
    }

    i += 1;
  }
  return out;
}

function fatiarLinhasEmSlides(rawLines, maxLinhas, totalLinhasMusica) {
  const slides = [];
  for (let i = 0; i < rawLines.length; i += maxLinhas) {
    slides.push(rawLines.slice(i, i + maxLinhas).join('\n'));
  }
  return eliminarSlidesOrfaos(slides, maxLinhas, totalLinhasMusica);
}

/**
 * Normaliza estrofes para grupos de no máximo 4 linhas por slide,
 * conforme a regra de projeção do controlador Lyra.
 *
 * @param {string[]} estrofes - Array de blocos de versos
 * @returns {string[]} Estrofes normalizadas (nunca vazio; mínimo `['']`)
 */
function normalizarEstrofesQuatroLinhas(estrofes) {
  const inArr = Array.isArray(estrofes) ? estrofes : [];
  const maxLinhas = 4;

  const blocos = [];
  let totalLinhasMusica = 0;
  for (const bloco of inArr) {
    const t = String(bloco || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
    if (!t) continue;

    const rawLines = expandirLinhasLongas(
      t.split('\n').map((l) => l.trim()).filter((l) => l.length)
    );
    if (rawLines.length === 0) continue;
    totalLinhasMusica += rawLines.length;
    blocos.push(rawLines);
  }

  const out = [];
  for (const rawLines of blocos) {
    if (rawLines.length === 1) {
      out.push(rawLines[0]);
      continue;
    }
    out.push(...fatiarLinhasEmSlides(rawLines, maxLinhas, totalLinhasMusica));
  }

  return out.length ? out : [''];
}

/**
 * Extrai título e artista dos elementos H1/H2 do HTML do CifraClub.
 *
 * @param {string} html
 * @returns {{ titulo: string, artista: string }}
 */
function tituloArtistaDoHtmlCifra(html) {
  let titulo = '';
  let artista = '';
  const h1 = html.match(/<h1[^>]*class="[^"]*t1[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const h2 = html.match(/<h2[^>]*class="[^"]*t3[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
  if (h1) titulo = decodeHtmlEntidades(h1[1].replace(/<[^>]+>/g, '')).trim();
  if (h2) artista = decodeHtmlEntidades(h2[1].replace(/<[^>]+>/g, '')).trim();
  return { titulo, artista };
}

/**
 * Busca HTML da letra no CifraClub. Tenta `/letra/` e, se bloqueado (403), a página principal.
 *
 * @param {string} pathRel
 * @returns {Promise<{ html: string|null, bloqueado: boolean }>}
 */
async function fetchHtmlLetraCifraClubComFallback(pathRel) {
  const pathNorm = (pathRel.startsWith('/') ? pathRel : `/${pathRel}`).replace(/\/?$/, '/');
  const urls = [`${CIFRA_ORIGIN}${pathNorm}letra/`, `${CIFRA_ORIGIN}${pathNorm}`];
  let bloqueado = false;

  for (const url of urls) {
    try {
      const r = await fetchComTimeout(url, { headers: headersCifraClub(pathNorm) });
      if (r.status === 403 || r.status === 401) {
        bloqueado = true;
        continue;
      }
      if (!r.ok) continue;
      const html = await r.text();
      if (html && html.length > 200) return { html, bloqueado: false };
    } catch (_) {}
  }

  return { html: null, bloqueado };
}

/** @deprecated use fetchHtmlLetraCifraClubComFallback */
async function fetchHtmlLetraCifraClub(pathRel) {
  const out = await fetchHtmlLetraCifraClubComFallback(pathRel);
  if (!out.html) {
    if (out.bloqueado) throw new Error('Cifra Club HTTP 403');
    throw new Error('Cifra Club indisponível');
  }
  return out.html;
}

// --- API Pública ---

/**
 * Busca letras na fonte escolhida (CifraClub ou Letras.mus.br).
 * Com IP do controlador, tenta a API HTTP do PC (mesmo módulo do desktop).
 *
 * @param {{ q: string, titulo: boolean, artista: boolean, letra: boolean, fonte?: string, hostControlador?: string }} params
 * @returns {Promise<{ resultados: { path: string, titulo: string, artista: string, fonte?: string }[] }>}
 * @throws {Error} Se o termo estiver vazio ou nenhum critério for selecionado
 */
export async function buscarLetrasNaWeb({ q, titulo, artista, letra, fonte, hostControlador }) {
  const texto = String(q || '').trim();
  if (!texto) {
    const err = new Error('Digite um termo de busca.');
    err.statusCode = 400;
    throw err;
  }
  if (!titulo && !artista && !letra) {
    const err = new Error('Marque pelo menos um critério (música, artista ou letra).');
    err.statusCode = 400;
    throw err;
  }

  const fonteNorm = normalizarFonteLetras(fonte);
  const host = hostControlador ? String(hostControlador).trim() : '';

  if (host) {
    const viaPc = await buscarLetrasViaControlador({
      hostControlador: host,
      texto,
      artista,
      fonte: fonteNorm,
    });
    if (viaPc && viaPc.length) return { resultados: viaPc };
  }

  let filtradas = [];
  if (fonteNorm === 'letras-mus-br') {
    filtradas = await buscarResultadosLetrasMusBr(texto, { titulo, artista, letra });
  } else {
    const html = await yahooHtmlSiteCifraClub(texto);
    const bruto = extrairParesRuCifraClub(html);
    const filt = { titulo, artista, letra };
    filtradas = bruto.filter((row) => candidatoCombinaBusca(row, texto, filt));
  }

  const resultados = filtradas.map((row) => {
    const seg = row.path.split('/').filter(Boolean);
    const dns = seg[0] || '';
    const slug = seg[1] || '';
    return {
      path: row.path,
      titulo: slugParaTituloExibicao(slug),
      artista: slugParaTituloExibicao(dns),
      fonte: fonteNorm,
    };
  });

  return { resultados };
}

/**
 * Acessa a página de letra do CifraClub (e fallback no Letras.mus.br) e retorna
 * as estrofes normalizadas para importação ou pré-visualização no app.
 *
 * Estratégia:
 * 1. Tenta extrair da div "letra" do HTML do CifraClub
 * 2. Fallback: extrai da meta description do Cifra
 * 3. Fallback final: tenta no Letras.mus.br com os slugs encontrados no HTML do Cifra
 *
 * @param {string} pathRaw - Caminho relativo (ex.: "/hillsong-united/oceans/")
 * @param {{ hostControlador?: string, fonte?: string }} [opts]
 * @returns {Promise<{ titulo: string, artista: string, estrofes: string[], path: string } | { erro: string }>}
 */
async function extrairLetraLetrasMusDireto(pathRaw) {
  const trimmed = pathRaw != null ? String(pathRaw).trim() : '';
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
    return { erro: e?.message || 'Letras.mus.br indisponível.' };
  }

  let estrofes = estrofesDePaginaLetrasMusHtml(html);
  if (!estrofes.length) estrofes = estrofesDeTextoLetrasMetaEOg(html);
  if (!estrofes.length) {
    return { erro: 'Não foi possível ler a letra nesta página do Letras.mus.br.' };
  }

  estrofes = normalizarEstrofesQuatroLinhas(estrofes);
  const pa = tituloArtistaDoScriptPageArgsLetras(html);
  const titulo =
    String(pa.titulo || '').trim() || slugParaTituloExibicao(slug) || 'Sem título';
  const artista = String(pa.artista || '').trim() || slugParaTituloExibicao(dns);
  const pathNorm = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return { titulo, artista, estrofes, path: pathNorm };
}

export async function extrairLetraParaPreviewOuImport(pathRaw, opts = {}) {
  const trimmed = pathRaw != null ? String(pathRaw).trim() : '';
  if (!trimmed) return { erro: 'path inválido.' };

  const fonteNorm = normalizarFonteLetras(opts.fonte);
  const hostControlador = opts.hostControlador ? String(opts.hostControlador).trim() : '';
  if (hostControlador) {
    const base = urlApiControlador(hostControlador);
    if (base) {
      try {
        const res = await fetchComTimeout(`${base}/api/letras/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: trimmed, fonte: fonteNorm }),
        });
        if (res.ok) {
          const data = await res.json();
          if (!data?.erro && Array.isArray(data.estrofes) && data.estrofes.length) {
            return {
              titulo: data.titulo || '',
              artista: data.artista || '',
              estrofes: normalizarEstrofesQuatroLinhas(data.estrofes),
              path: data.path || trimmed,
            };
          }
        }
      } catch (_) {}
    }
  }

  if (fonteNorm === 'letras-mus-br') {
    return extrairLetraLetrasMusDireto(trimmed);
  }

  const pathNormCifra = parseCaminhoLetraCifraClub(
    `${CIFRA_ORIGIN}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
  );
  if (!pathNormCifra) return { erro: 'URL de música inválida para cifraclub.com.br.' };

  const seg = pathNormCifra.split('/').filter(Boolean);
  const dns = seg[0] || '';
  const songSlug = seg[1] || '';

  const { html, bloqueado } = await fetchHtmlLetraCifraClubComFallback(pathNormCifra);

  let estrofes = [];
  let tituloLetras = '';
  let artistaLetras = '';

  if (html) {
    estrofes = estrofesDePaginaCifraClub(html);
    if (!estrofes.length) estrofes = estrofesFallbackMetaDescricaoCifra(html);
  }

  if (!estrofes.length && dns && songSlug) {
    const slugs = html ? slugsLetrasParaTentar(html, dns, songSlug) : [songSlug];
    for (const slugTry of slugs) {
      try {
        const hl = await fetchHtmlLetrasMus(dns, slugTry);
        estrofes = estrofesDePaginaLetrasMusHtml(hl);
        if (!estrofes.length) estrofes = estrofesDeTextoLetrasMetaEOg(hl);
        if (estrofes.length) {
          const pa = tituloArtistaDoScriptPageArgsLetras(hl);
          tituloLetras = pa.titulo;
          artistaLetras = pa.artista;
          break;
        }
      } catch (_) {}
    }
  }

  if (!estrofes.length) {
    if (bloqueado) {
      return {
        erro: hostControlador
          ? 'Cifra Club bloqueou o celular (403). Verifique se o controlador está aberto no PC.'
          : 'Cifra Club bloqueou o acesso (403). Conecte na tela inicial ao IP do controlador para buscar pelo PC.',
      };
    }
    return { erro: 'Não foi possível ler a letra (Cifra e Letras.mus.br falharam).' };
  }

  estrofes = normalizarEstrofesQuatroLinhas(estrofes);

  const { titulo: tHtml, artista: aHtml } = html ? tituloArtistaDoHtmlCifra(html) : { titulo: '', artista: '' };
  const titulo =
    String(tituloLetras || tHtml || '').trim() ||
    slugParaTituloExibicao(seg[1] || '') ||
    'Sem título';
  const artista =
    String(artistaLetras || aHtml || '').trim() || slugParaTituloExibicao(seg[0] || '');

  const pathNorm = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return { titulo, artista, estrofes, path: pathNorm };
}
