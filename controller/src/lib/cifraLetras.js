'use strict';

const https = require('https'); // usado por buscarLetraVagalume
const { buscarNoIndiceDeMusicas } = require('./indiceMusicasBusca');

// ─── Utilitários de texto ─────────────────────────────────────────
function foldAccents(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function decodeHtmlEntidades(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function slugParaTituloExibicao(slug) {
  return String(slug || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

async function fetchTextoTimeout(url, init, ms = 14000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
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
 * Estrofes da página de letra do CifraClub.
 *
 * Duas estratégias: `div.letra` (markup antigo) e `data-chord-content` (Next.js
 * atual). A segunda foi acrescentada depois de constatar que a primeira não casa
 * mais — e que, sem ela, a extração caía na meta description, que traz **apenas
 * as 4 primeiras linhas** da música.
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
    const estrofes = estrofesDeParagrafos(blob);
    if (estrofes.length) return estrofes;
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

function slugsLetrasParaTentar(htmlCifra, dns, songSlug) {
  const esc = String(dns || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!esc || !songSlug) return [songSlug];
  const re = new RegExp(`href="/${esc}/([a-z0-9-]+)/"`, 'gi');
  const found = new Set();
  let m;
  while ((m = re.exec(htmlCifra)) !== null) found.add(m[1]);
  const arr = [...found];
  const related = arr.filter((s) => s === songSlug || s.startsWith(`${songSlug}-`));
  const ordered =
    related.length > 0
      ? [...related].sort((a, b) => b.length - a.length)
      : [songSlug];
  return [...new Set(ordered)];
}

async function fetchHtmlLetrasMus(dns, slugMusica) {
  const d = String(dns || '').replace(/^\/|\/$/g, '');
  const s = String(slugMusica || '').replace(/^\/|\/$/g, '');
  const url = `${LETRAS_ORIGIN}/${encodeURIComponent(d)}/${encodeURIComponent(s)}/`;
  const r = await fetchTextoTimeout(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
  });
  if (!r.ok) throw new Error(`Letras HTTP ${r.status}`);
  return await r.text();
}

async function fetchHtmlLetraCifraClub(pathRel) {
  const pathNorm = (pathRel.startsWith('/') ? pathRel : `/${pathRel}`).replace(/\/?$/, '/');
  const url = `${CIFRA_ORIGIN}${pathNorm}letra/`;
  const r = await fetchTextoTimeout(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    },
  });
  if (!r.ok) throw new Error(`Cifra Club HTTP ${r.status}`);
  return await r.text();
}

/** Limite de caracteres por linha antes do fatiamento em slides (projeção). */
const MAX_CHARS_POR_LINHA = 45;

function normalizarMaxLinhasPorSlide(valor) {
  const n = parseInt(valor, 10);
  if (n === 2 || n === 3 || n === 4) return n;
  return 4;
}

const MIN_CHARS_FRAGMENTO_LINHA = 15;

/** Conjunções (mais longas primeiro) para quebra antes da palavra. */
const CONJUNCOES_QUEBRA_LINHA = [
  'porém', 'porque', 'portanto', 'contudo', 'todavia', 'então',
  'quando', 'pois', 'assim', 'como', 'mas', 'que', 'se', 'ou', 'e',
];

function escRegexQuebra(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ponto de quebra natural: vírgula (mais equilibrada) → conjunções → espaço no limite.
 * Fragmentos >= MIN_CHARS_FRAGMENTO_LINHA; cabeça <= limite.
 */
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

/** Quebra linha longa na vírgula, conjunção ou espaço (só se ultrapassar o limite). */
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

/**
 * Após fatiar, evita slides com 1 linha sozinha (órfãos).
 * Não funde estrofes distintas; exceção se a música inteira tiver menos de 2 linhas.
 */
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

    // Último slide órfão com anterior cheio: reparte uma linha do slide anterior
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

function normalizarEstrofesComMaxLinhas(estrofes, maxLinhasPorSlide = 4) {
  const inArr = Array.isArray(estrofes) ? estrofes : [];
  const maxLinhas = [2, 3, 4].includes(parseInt(maxLinhasPorSlide, 10))
    ? parseInt(maxLinhasPorSlide, 10)
    : 4;

  const blocos = [];
  let totalLinhasMusica = 0;
  for (const bloco of inArr) {
    const t = String(bloco || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
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

function tituloArtistaDoHtmlCifra(html) {
  let titulo = '';
  let artista = '';
  const h1 = html.match(/<h1[^>]*class="[^"]*t1[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const h2 = html.match(/<h2[^>]*class="[^"]*t3[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
  if (h1) titulo = decodeHtmlEntidades(h1[1].replace(/<[^>]+>/g, '')).trim();
  if (h2) artista = decodeHtmlEntidades(h2[1].replace(/<[^>]+>/g, '')).trim();
  return { titulo, artista };
}

async function extrairLetraCifraClubParaPreviewOuImport(pathRaw, opts = {}) {
  const maxLinhasPorSlide = normalizarMaxLinhasPorSlide(opts.maxLinhasPorSlide);
  const trimmed = pathRaw != null ? String(pathRaw).trim() : '';
  if (!trimmed) return { erro: 'path inválido.' };
  const abs = parseCaminhoLetraCifraClub(`${CIFRA_ORIGIN}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`);
  if (!abs) return { erro: 'URL de música inválida para cifraclub.com.br.' };

  const html = await fetchHtmlLetraCifraClub(abs);

  const seg = abs.split('/').filter(Boolean);
  const dns = seg[0] || '';
  const songSlug = seg[1] || '';
  let tituloLetras = '';
  let artistaLetras = '';

  /**
   * Ordem dos fallbacks — e por que ela importa.
   *
   * A meta description do CifraClub traz só as 4 PRIMEIRAS LINHAS da música, e
   * antes ela era tentada logo depois do HTML do Cifra. Como vinha não-vazia, a
   * cadeia parava ali e a página do Letras.mus.br (que tem a letra completa)
   * nunca era consultada: o usuário importava uma música de 4 linhas achando que
   * era a letra inteira. Verificado com "Galileu" (Fernandinho): 17 estrofes /
   * 71 linhas nas fontes HTML, contra 4 linhas na meta description.
   *
   * Agora as fontes completas vêm primeiro e as meta tags são o último recurso,
   * marcando o resultado como `parcial` para a UI poder avisar.
   */
  let estrofes = estrofesDePaginaCifraClub(html);
  let parcial = false;

  // Página completa do Letras.mus.br antes de qualquer meta tag.
  if (!estrofes.length && dns && songSlug) {
    const slugs = slugsLetrasParaTentar(html, dns, songSlug);
    for (const slugTry of slugs) {
      try {
        const hl = await fetchHtmlLetrasMus(dns, slugTry);
        estrofes = estrofesDePaginaLetrasMusHtml(hl);
        if (estrofes.length) {
          const pa = tituloArtistaDoScriptPageArgsLetras(hl);
          tituloLetras = pa.titulo;
          artistaLetras = pa.artista;
          break;
        }
        // Guarda a og:description desta página como último recurso, sem parar aqui.
        if (!estrofes.length) {
          const og = estrofesDeTextoLetrasMetaEOg(hl);
          if (og.length && !parcial) {
            estrofes = og;
            parcial = true;
            const pa = tituloArtistaDoScriptPageArgsLetras(hl);
            tituloLetras = pa.titulo;
            artistaLetras = pa.artista;
          }
        }
      } catch (_) { continue; }
    }
  }

  // Último recurso: meta description do próprio CifraClub (só o começo da letra).
  if (!estrofes.length) {
    const meta = estrofesFallbackMetaDescricaoCifra(html);
    if (meta.length) {
      estrofes = meta;
      parcial = true;
    }
  }

  if (!estrofes.length) {
    return { erro: 'Não foi possível ler a letra (Cifra sem letra no HTML; fallback Letras falhou).' };
  }

  estrofes = normalizarEstrofesComMaxLinhas(estrofes, maxLinhasPorSlide);

  const { titulo: tHtml, artista: aHtml } = tituloArtistaDoHtmlCifra(html);
  const titulo = String(tituloLetras || tHtml || '').trim() || slugParaTituloExibicao(seg[1] || '') || 'Sem título';
  const artista = String(artistaLetras || aHtml || '').trim() || slugParaTituloExibicao(seg[0] || '');
  const pathNorm = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return { titulo, artista, estrofes, path: pathNorm, maxLinhasPorSlide, parcial };
}

// ─── Funções de Busca de Letras ───────────────────────────────────
function buscarLetraLocal(titulo, artista) {
  const letrasExemplo = {
    'grande e o senhor': `Grande é o Senhor
E mui digno de louvor
Na cidade do nosso Deus
No seu santo monte

Belo em sua altitude
A alegria de toda a terra
O monte Sião, pelos lados do norte
A cidade do grande Rei

Grande é o Senhor
Grande é o Senhor
Grande é o Senhor
É digno de louvor`,
    
    'quao grande es tu': `Senhor meu Deus
Quando eu, maravilhado
Contemple os mundos que as tuas mãos criou
As mil estrelas que puseste no espaço
O universo todo que ordenou

Então minh'alma canta a ti, Senhor
Quão grande és tu, quão grande és tu
Então minh'alma canta a ti, Senhor
Quão grande és tu, quão grande és tu`,
    
    'maravilhosa graca': `Maravilhosa graça
Do meu Salvador
Graça que excede
Meu maior pecado e culpa

Louvado seja Jesus
Que comprou a minha paz
Na cruz pagou minha dívida
E livre me fez`
  };
  
  const chave = String(titulo).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, letra] of Object.entries(letrasExemplo)) {
    if (chave.includes(key) || key.includes(chave)) {
      return { sucesso: true, fonte: 'Exemplo (local)', letra: letra };
    }
  }
  return null;
}

function buscarLetraVagalume(titulo, artista) {
  return new Promise((resolve) => {
    const tituloLimpo = encodeURIComponent(String(titulo).trim());
    const artistaLimpo = encodeURIComponent(String(artista || '').trim());
    
    const url = `https://api.vagalume.com.br/search.php?art=${artistaLimpo}&mus=${tituloLimpo}&extra=mus`;
    
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.mus && json.mus[0] && json.mus[0].text) {
            const letra = json.mus[0].text;
            resolve({ sucesso: true, fonte: 'Vagalume', letra: letra });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });
    
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function buscarLetraCifraClub(titulo, artista) {
  try {
    const texto = artista ? `${titulo} ${artista}` : titulo;
    // Índice da Studio Sol em vez do SERP do Yahoo, que passou a dar timeout.
    const filtradas = await buscarNoIndiceDeMusicas({
      texto,
      filtros: { titulo: true, artista: !!artista, letra: false },
      fonte: 'cifraclub',
    });

    if (!filtradas.length) return null;

    for (const row of filtradas) {
      try {
        const htmlLetra = await fetchHtmlLetraCifraClub(row.path);
        let estrofes = estrofesDePaginaCifraClub(htmlLetra);

        // Mesma ordem de extrairLetraCifraClubParaPreviewOuImport: fontes com a
        // letra completa primeiro, meta tags (só as 4 primeiras linhas) por último.
        if (!estrofes.length) {
          const seg = row.path.split('/').filter(Boolean);
          const dns = seg[0] || '';
          const songSlug = seg[1] || '';
          if (dns && songSlug) {
            const slugs = slugsLetrasParaTentar(htmlLetra, dns, songSlug);
            for (const slugTry of slugs) {
              try {
                const hl = await fetchHtmlLetrasMus(dns, slugTry);
                estrofes = estrofesDePaginaLetrasMusHtml(hl);
                if (estrofes.length) break;
              } catch (_) { continue; }
            }
          }
        }

        if (!estrofes.length) estrofes = estrofesFallbackMetaDescricaoCifra(htmlLetra);

        if (estrofes.length) {
          return {
            sucesso: true,
            fonte: 'CifraClub',
            letra: estrofes.join('\n\n'),
          };
        }
      } catch (_) { continue; }
    }

    return null;
  } catch (e) {
    console.error('[Controller] Erro CifraClub:', e.message);
    return null;
  }
}

module.exports = {
  foldAccents,
  decodeHtmlEntidades,
  slugParaTituloExibicao,
  parseCaminhoLetraCifraClub,
  normalizarMaxLinhasPorSlide,
  normalizarEstrofesComMaxLinhas,
  extrairLetraCifraClubParaPreviewOuImport,
  estrofesDePaginaCifraClub,
  estrofesFallbackMetaDescricaoCifra,
  extrairHtmlInternoPorAtributo,
  estrofesDePaginaLetrasMusHtml,
  estrofesDeTextoLetrasMetaEOg,
  tituloArtistaDoScriptPageArgsLetras,
  fetchHtmlLetrasMus,
  buscarLetraLocal,
  buscarLetraVagalume,
  buscarLetraCifraClub,
};
