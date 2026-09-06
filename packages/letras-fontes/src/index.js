/**
 * Núcleo puro das fontes de letra (Cifra Club, Letras.mus.br, índice Studio Sol).
 *
 * Extraído de `cifraLetras.js`, `letrasMusBr.js`, `indiceMusicasBusca.js` e
 * `letrasWebClient.js` — o mesmo recorte HTML/slug nos dois lados. Fetch, corrida
 * LAN e fatiamento em slides continuam no controlador e no mobile.
 */

'use strict';

function foldAccents(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slugParaTituloExibicao(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ')
    .trim();
}

function decodeHtmlEntidades(str) {
  return String(str || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// ─── Cifra Club — constantes ──────────────────────────────────────
const CIFRA_ORIGIN = 'https://www.cifraclub.com.br';
const LETRAS_ORIGIN = 'https://www.letras.mus.br';

const CIFRA_SEG_RESERVADOS = new Set([
  'blog', 'academy', 'metronomo', 'dicionario', 'estilos',
  'enviar', 'forum', 'busca', 'login', 'signup',
  'palcomp3', 'formesuabanda', 'curso',
]);

// ─── Cifra Club — helpers de parsing ─────────────────────────────
function parseCaminhoLetraCifraClub(decodedUrl) {
  try {
    const u = new URL(decodedUrl);
    const host = u.hostname.replace(/^www\./i, '');
    if (host !== 'cifraclub.com.br') return null;
    let parts = u.pathname.split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      parts[i] = parts[i].replace(/\.html?$/i, '');
    }
    while (parts.length && parts[parts.length - 1].toLowerCase() === 'letra') {
      parts.pop();
    }
    const versoes = new Set(['simplificada', 'principal', 'imprimir']);
    while (parts.length >= 3 && versoes.has(parts[parts.length - 1].toLowerCase())) {
      parts.pop();
    }
    if (parts.length !== 2) return null;
    const [artist, song] = parts;
    if (!/^[a-z0-9_-]+$/i.test(artist) || !/^[a-z0-9_-]+$/i.test(song)) return null;
    const al = artist.toLowerCase();
    if (CIFRA_SEG_RESERVADOS.has(al)) return null;
    if (al === 'letra' && /^[a-z]$/i.test(song)) return null;
    return `/${artist}/${song}/`;
  } catch (_) {
    return null;
  }
}
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
function extrairHtmlInternoDivPorClasse(html, classToken) {
  const openMatch = html.match(
    new RegExp(`<div\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${classToken}\\b[^"']*["'][^>]*>`, 'i')
  );
  if (!openMatch || openMatch.index === undefined) return null;
  const innerStart = openMatch.index + openMatch[0].length;
  let i = innerStart;
  let depth = 1;
  const lim = html.length;
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
 * Extrai o conteúdo interno do primeiro elemento que tenha o atributo informado.
 *
 * Ancorar em `data-*` em vez de classe é deliberado: o CifraClub migrou para
 * Next.js e as classes viraram hashes de build (`XjgwI`, `_0TPj`), que mudam a
 * cada deploy. Já `data-chord-content` é semântico e sobrevive.
 *
 * @param {string} html
 * @param {string} atributo - ex.: 'data-chord-content'
 * @param {string} [tag='div']
 * @returns {string|null}
 */
function extrairHtmlInternoPorAtributo(html, atributo, tag = 'div') {
  const abre = new RegExp(`<${tag}\\b[^>]*\\b${atributo}\\b[^>]*>`, 'i');
  const openMatch = html.match(abre);
  if (!openMatch || openMatch.index === undefined) return null;

  const innerStart = openMatch.index + openMatch[0].length;
  const reAbre = new RegExp(`<${tag}\\b`, 'i');
  const reFecha = new RegExp(`</${tag}>`, 'i');

  let i = innerStart;
  let depth = 1;
  while (i < html.length && depth > 0) {
    const slice = html.slice(i);
    const mOpen = reAbre.exec(slice);
    const mClose = reFecha.exec(slice);
    const openRel = mOpen ? mOpen.index : -1;
    const closeRel = mClose ? mClose.index : -1;
    if (closeRel === -1) return null;
    if (openRel !== -1 && openRel < closeRel) {
      depth += 1;
      i += openRel + mOpen[0].length;
    } else {
      depth -= 1;
      const closeAbs = i + closeRel;
      if (depth === 0) return html.slice(innerStart, closeAbs);
      i += closeRel + mClose[0].length;
    }
  }
  return null;
}

/** Converte `<p>…<br>…</p>` num array de estrofes, uma por `<p>`. */
function estrofesDeParagrafos(blob) {
  const estrofes = [];
  for (const m of blob.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
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
  return estrofes;
}

/**
 * Markup Next.js recente do Cifra: a letra fica em `<div>` filhos (não em `<p>`),
 * com acordes em `<b data-chord-name>`. Sem este parser, `data-chord-content`
 * existia mas devolvia 0 estrofes → falso "Cifra sem letra no HTML".
 */
function estrofesDeChordContentDivs(blob) {
  const estrofes = [];
  let i = 0;
  while (i < blob.length) {
    const open = blob.slice(i).search(/<div\b/i);
    if (open === -1) break;
    const openAbs = i + open;
    const openTagEnd = blob.indexOf('>', openAbs);
    if (openTagEnd === -1) break;

    let depth = 1;
    let j = openTagEnd + 1;
    while (j < blob.length && depth > 0) {
      const slice = blob.slice(j);
      const mOpen = /<div\b/i.exec(slice);
      const mClose = /<\/div>/i.exec(slice);
      const openRel = mOpen ? mOpen.index : -1;
      const closeRel = mClose ? mClose.index : -1;
      if (closeRel === -1) return estrofes;
      if (openRel !== -1 && openRel < closeRel) {
        depth += 1;
        j += openRel + mOpen[0].length;
      } else {
        depth -= 1;
        if (depth === 0) {
          const inner = blob.slice(openTagEnd + 1, j + closeRel);
          // Só folhas: se ainda tem <div>, o walk externo já visita os filhos.
          if (!/<div\b/i.test(inner)) {
            let text = inner.replace(/<b\b[^>]*\bdata-chord-name\b[^>]*>[\s\S]*?<\/b>/gi, '');
            text = text.replace(/<br\s*\/?>/gi, '\n');
            text = text.replace(/<[^>]+>/g, '');
            text = decodeHtmlEntidades(text);
            const stanza = text
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
              .join('\n')
              .trim();
            if (stanza && textoTemLetraUtil(stanza)) estrofes.push(stanza);
          }
          i = j + closeRel + 6;
          break;
        }
        j += closeRel + mClose[0].length;
      }
    }
    if (depth !== 0) break;
  }
  return estrofes;
}

/** Descarta blocos só de [Intro]/acordes, sem verso cantado. */
function textoTemLetraUtil(texto) {
  const limpo = String(texto || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add|M)?[0-9]*(?:\/[A-G](?:#|b)?)?\b/g, ' ')
    .replace(/[^a-zA-ZÀ-ÿ]/g, '');
  return limpo.length >= 4;
}

/**
 * Estrofes da página de letra do CifraClub.
 *
 * Estratégias: `div.letra` (legado), `data-chord-content` com `<p>` (Next.js
 * antigo) e `data-chord-content` com `<div>` + `<b data-chord-name>` (Next.js
 * atual). Sem a terceira, a página tinha a letra no HTML mas a extração
 * devolvia vazio.
 */
function estrofesDePaginaCifraClub(html) {
  const legado = extrairHtmlInternoDivPorClasse(html, 'letra');
  if (legado) {
    const estrofes = estrofesDeParagrafos(legado);
    if (estrofes.length) return estrofes;
  }

  for (const atributo of ['data-chord-content', 'data-chord-container']) {
    const blob = extrairHtmlInternoPorAtributo(html, atributo, atributo === 'data-chord-container' ? 'article' : 'div');
    if (!blob) continue;
    const porP = estrofesDeParagrafos(blob);
    if (porP.length) return porP;
    const porDiv = estrofesDeChordContentDivs(blob);
    if (porDiv.length) return porDiv;
  }

  return [];
}

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

function metaDescricaoCifraEGenericaSemLetra(textoPlano) {
  const t = String(textoPlano || '').toLowerCase();
  return (
    t.includes('cifras') &&
    t.includes('tablaturas') &&
    (t.includes('videoaulas') || t.includes('video aulas')) &&
    t.includes('cifra club')
  );
}

function estrofesFallbackMetaDescricaoCifra(html) {
  const raw = metaTagContent(html, { name: 'description' });
  if (!raw) return [];
  let t = decodeHtmlEntidades(raw);
  if (metaDescricaoCifraEGenericaSemLetra(t)) return [];
  const markerLongo = ' no Cifra Club ';
  const markerCurto = ' no Cifra Club';
  let i = t.indexOf(markerLongo);
  if (i === -1) i = t.indexOf(markerCurto);
  if (i !== -1) {
    t = t.slice(i + (t.indexOf(markerLongo) === i ? markerLongo.length : markerCurto.length)).trim();
  }
  if (!t || metaDescricaoCifraEGenericaSemLetra(t)) return [];
  // A description usa " / " entre LINHAS, não entre estrofes. Devolver uma linha
  // por posição fazia cada linha virar um slide, ignorando "linhas por slide".
  return linhasComoBlocoUnico(t);
}

/**
 * Junta linhas separadas por " / " num único bloco de estrofe.
 *
 * A meta description não carrega fronteira de estrofe, então tratar cada linha
 * como estrofe separada quebrava o agrupamento por "linhas por slide".
 *
 * @param {string} texto
 * @returns {string[]} array com 0 ou 1 elemento
 */
function linhasComoBlocoUnico(texto) {
  const linhas = String(texto || '')
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return linhas.length ? [linhas.join('\n')] : [];
}

function estrofesDePaginaLetrasMusHtml(html) {
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

function estrofesDeTextoLetrasMetaEOg(html) {
  const og = metaTagContent(html, { property: 'og:description' });
  if (og) {
    const bloco = linhasComoBlocoUnico(decodeHtmlEntidades(og));
    if (bloco.length) return bloco;
  }
  const desc = metaTagContent(html, { name: 'description' });
  if (!desc) return [];
  let t = decodeHtmlEntidades(desc);
  const marker = '(Letra e música para ouvir)';
  const idx = t.indexOf(marker);
  if (idx !== -1) {
    const after = t.slice(idx + marker.length);
    const dash = after.indexOf(' - ');
    if (dash !== -1) t = after.slice(dash + 3).trim();
  }
  return linhasComoBlocoUnico(t);
}

function tituloArtistaDoScriptPageArgsLetras(html) {
  let titulo = '';
  let artista = '';
  const mt = html.match(/"track_name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const ma = html.match(/"artist_name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (mt) titulo = mt[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  if (ma) artista = ma[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  return { titulo, artista };
}

/** Máximo de páginas do Letras tentadas via índice (após o slug direto falhar). */
const MAX_LETRAS_VIA_INDICE = 5;

/**
 * Converte título exibido em slug de URL (ex.: "A Casa é Sua" → "a-casa-e-sua").
 * Usado quando a URL do Cifra não bate com a do Letras (títulos compostos com "/").
 */
function slugifyParaUrl(texto) {
  return foldAccents(String(texto || ''))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Alternativas de slug a partir do título (ex.: "Sou Casa / A Casa é Sua").
 * O Cifra muitas vezes usa só a 1ª parte na URL; o Letras usa a 2ª ou o nome completo.
 */
function slugsAlternativosDoTitulo(titulo, songSlug) {
  const out = [];
  const t = String(titulo || '').trim();
  if (!t) return out;
  for (const parte of t.split(/\s*\/\s*/)) {
    const s = slugifyParaUrl(parte);
    if (s && s !== songSlug) out.push(s);
  }
  const full = slugifyParaUrl(t.replace(/\//g, ' '));
  if (full && full !== songSlug) out.push(full);
  return out;
}

function slugsLetrasParaTentar(htmlCifra, dns, songSlug, tituloOpcional) {
  const esc = String(dns || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!esc || !songSlug) return songSlug ? [songSlug] : [];
  const re = new RegExp(`href="/${esc}/([a-z0-9-]+)/"`, 'gi');
  const found = new Set();
  let m;
  while ((m = re.exec(htmlCifra || '')) !== null) found.add(m[1]);
  const arr = [...found];
  const related = arr.filter((s) => s === songSlug || s.startsWith(`${songSlug}-`));
  const ordered =
    related.length > 0
      ? [...related].sort((a, b) => b.length - a.length)
      : [songSlug];
  const extras = slugsAlternativosDoTitulo(tituloOpcional, songSlug);
  return [...new Set([...ordered, ...extras])];
}

/**
 * Pares artista/música alternativos quando o path do índice não existe no Letras
 * (ex.: /casa-worship-elizeu-alves/sou-casa-a-casa-e-sua/ → /elizeu-alves/sou-casa/).
 */
function paresDnsSlugAlternativos(dns, songSlug) {
  const out = [];
  const d = String(dns || '');
  const s = String(songSlug || '');
  if (!d || !s) return out;

  const artistaUtil = (a) => {
    const parts = String(a || '').split('-').filter(Boolean);
    return parts.length >= 2 && String(a).length >= 8;
  };

  const dParts = d.split('-').filter(Boolean);
  for (let i = 1; i < dParts.length; i++) {
    const left = dParts.slice(0, i).join('-');
    const right = dParts.slice(i).join('-');
    if (artistaUtil(left)) out.push([left, s]);
    if (artistaUtil(right)) out.push([right, s]);
  }

  const sParts = s.split('-').filter(Boolean);
  const songCuts = new Set();
  if (sParts.length >= 2) songCuts.add(sParts.slice(0, 2).join('-'));
  if (sParts.length >= 3) songCuts.add(sParts.slice(0, 3).join('-'));
  if (sParts.length >= 4) {
    const mid = Math.floor(sParts.length / 2);
    songCuts.add(sParts.slice(0, mid).join('-'));
    songCuts.add(sParts.slice(mid).join('-'));
  }

  const artists = new Set([d, ...out.map((p) => p[0])].filter(artistaUtil));
  // Sempre inclui o dns original para cortes curtos da música
  artists.add(d);

  const pares = [];
  for (const art of artists) {
    for (const song of songCuts) {
      if (art === d && song === s) continue;
      pares.push([art, song]);
    }
  }
  // Artista derivado + slug completo (menos prioritário, mas útil)
  for (const [art] of out) {
    if (art !== d) pares.push([art, s]);
  }
  return pares;
}

function pontuarCandidatoLetras(row, dns, songSlug, titulo) {
  let score = 0;
  const d = String(dns || '').toLowerCase();
  const s = String(songSlug || '').toLowerCase();
  const seg = String(row.path || '')
    .toLowerCase()
    .split('/')
    .filter(Boolean);
  const rd = seg[0] || '';
  const rs = seg[1] || '';

  if (rd && d) {
    if (rd === d) score += 10;
    else if (d.endsWith(`-${rd}`)) score += 12; // feat: casa-worship-elizeu-alves → elizeu-alves
    else if (d.startsWith(`${rd}-`)) score += 6;
    else if (d.includes(rd) || rd.includes(d)) score += 4;
  }
  if (rs && s) {
    if (rs === s) score += 5; // slug completo do Cifra muitas vezes 404 no Letras
    else if (s.startsWith(`${rs}-`)) {
      // Prefixo curto (ex.: sou-casa ⊂ sou-casa-a-casa-e-sua) — padrão real do Letras
      score += 12;
      if (rs.split('-').length <= 3) score += 4;
    } else if (rs.startsWith(`${s}-`) || s.includes(rs) || rs.includes(s)) {
      score += 4;
    }
  }

  const tit = foldAccents(row.titulo || '');
  const want = foldAccents(titulo || '');
  if (tit && want) {
    if (tit === want) score += 6;
    else if (tit.includes(want) || want.includes(tit)) score += 4;
  }
  return score;
}
/** Remove sufixos de navegação do CifraClub em título/artista (ex.: "(letra da música)"). */
function limparRotuloMetadadoCifra(texto) {
  return String(texto || '')
    .replace(/\s*\(\s*letra da m[uú]sica\s*\)/gi, ' ')
    .replace(/\s*\(\s*cifra\s*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textoDeHeadingHtml(fragmento) {
  return limparRotuloMetadadoCifra(
    decodeHtmlEntidades(String(fragmento || '').replace(/<[^>]+>/g, '')).trim()
  );
}

function tituloArtistaDoHtmlCifra(html) {
  let titulo = '';
  let artista = '';

  // Layout clássico (classes t1/t3).
  const h1Legacy = html.match(/<h1[^>]*class="[^"]*t1[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const h2Legacy = html.match(/<h2[^>]*class="[^"]*t3[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
  if (h1Legacy) titulo = textoDeHeadingHtml(h1Legacy[1]);
  if (h2Legacy) artista = textoDeHeadingHtml(h2Legacy[1]);

  // Next.js: par h1+h2 visíveis consecutivos (sem u-srOnly); hashes de classe mudam a cada deploy.
  if (!titulo || !artista) {
    const par = html.match(
      /<h1(?![^>]*\bu-srOnly\b)[^>]*>([\s\S]*?)<\/h1>\s*<h2(?![^>]*\bu-srOnly\b)[^>]*>([\s\S]*?)<\/h2>/i
    );
    if (par) {
      if (!titulo) titulo = textoDeHeadingHtml(par[1]);
      if (!artista) artista = textoDeHeadingHtml(par[2]);
    }
  }

  // og:title — "Música - Artista - Cifra Club" (às vezes com "(letra da música)" no artista).
  if (!titulo || !artista) {
    const og = metaTagContent(html, { property: 'og:title' }) || metaTagContent(html, { name: 'title' });
    if (og) {
      const limpo = limparRotuloMetadadoCifra(
        og.replace(/\s*[-–]\s*Cifra Club\s*$/i, '').trim()
      );
      const parts = limpo.split(/\s[-–]\s/);
      if (parts.length >= 2) {
        if (!titulo) titulo = parts[0].trim();
        if (!artista) artista = parts.slice(1).join(' - ').trim();
      } else if (!titulo) {
        titulo = limpo;
      }
    }
  }

  titulo = limparRotuloMetadadoCifra(titulo);
  artista = limparRotuloMetadadoCifra(artista);
  return { titulo, artista };
}
function normalizarFonteLetras(fonte) {
  const f = String(fonte || '').toLowerCase();
  return f === 'letras-mus-br' || f === 'letrasmusbr' ? 'letras-mus-br' : 'cifraclub';
}

function resultadoDoIndiceCombina(row, qBruto, filtros = {}) {
  const q = foldAccents(String(qBruto || '').trim());
  if (!q) return true;

  const titulo = filtros.titulo !== false;
  const artista = !!filtros.artista;
  const letra = !!filtros.letra;

  const tit = foldAccents(row.titulo);
  const art = foldAccents(row.artista);

  if (titulo && tit.includes(q)) return true;
  if (artista && art.includes(q)) return true;

  const combinado = `${tit} ${art}`;
  if (letra || combinado.includes(q)) return true;
  const palavras = q.split(/\s+/).filter(Boolean);
  return palavras.length > 1 && palavras.every((p) => combinado.includes(p));
}

module.exports = {
  CIFRA_ORIGIN,
  LETRAS_ORIGIN,
  CIFRA_SEG_RESERVADOS,
  LETRAS_SEG_RESERVADOS,
  foldAccents,
  decodeHtmlEntidades,
  slugParaTituloExibicao,
  slugifyParaUrl,
  slugsAlternativosDoTitulo,
  slugsLetrasParaTentar,
  paresDnsSlugAlternativos,
  pontuarCandidatoLetras,
  parseCaminhoLetraCifraClub,
  parseCaminhoLetraLetrasMusBr,
  extrairHtmlInternoDivPorClasse,
  extrairHtmlInternoPorAtributo,
  estrofesDeParagrafos,
  estrofesDeChordContentDivs,
  textoTemLetraUtil,
  estrofesDePaginaCifraClub,
  metaTagContent,
  metaDescricaoCifraEGenericaSemLetra,
  estrofesFallbackMetaDescricaoCifra,
  linhasComoBlocoUnico,
  estrofesDePaginaLetrasMusHtml,
  estrofesDeTextoLetrasMetaEOg,
  tituloArtistaDoScriptPageArgsLetras,
  limparRotuloMetadadoCifra,
  textoDeHeadingHtml,
  tituloArtistaDoHtmlCifra,
  normalizarFonteLetras,
  resultadoDoIndiceCombina,
};
