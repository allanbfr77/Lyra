'use strict';

const https = require('https'); // usado por buscarLetraVagalume
const { buscarNoIndiceDeMusicas } = require('./indiceMusicasBusca');
const {
  CIFRA_ORIGIN,
  LETRAS_ORIGIN,
  foldAccents,
  decodeHtmlEntidades,
  slugParaTituloExibicao,
  slugifyParaUrl,
  slugsAlternativosDoTitulo,
  slugsLetrasParaTentar,
  paresDnsSlugAlternativos,
  pontuarCandidatoLetras,
  parseCaminhoLetraCifraClub,
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
} = require('@lyra/letras-fontes');

async function fetchTextoTimeout(url, init, ms = 14000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

/** Máximo de páginas do Letras tentadas via índice (após o slug direto falhar). */
const MAX_LETRAS_VIA_INDICE = 5;

async function tentarLetraLetrasViaIndice({ titulo, artista, dns, songSlug, jaTentados }) {
  const tit = String(titulo || '').trim();
  const art = String(artista || '').trim();
  const dnsNorm = String(dns || '').toLowerCase();
  const slugNorm = String(songSlug || '').toLowerCase();

  const vistoPath = new Set();
  const resultados = [];

  const semMedley = slugNorm.replace(/^medley-/, '');
  const termos = [
    ...new Set(
      [
        tit,
        art ? `${tit} ${art}` : '',
        slugParaTituloExibicao(semMedley),
        slugParaTituloExibicao(dnsNorm),
      ].filter((t) => String(t || '').trim().length >= 4)
    ),
  ];
  for (const termo of termos) {
    try {
      const rows = await buscarNoIndiceDeMusicas({
        texto: termo,
        filtros: { titulo: true, artista: false, letra: false },
        fonte: 'letras-mus-br',
      });
      for (const row of rows || []) {
        if (vistoPath.has(row.path)) continue;
        vistoPath.add(row.path);
        resultados.push(row);
      }
    } catch (_) {
      continue;
    }
  }

  // Pares derivados do path (artista composto / título com barra) mesmo sem índice.
  for (const [d, s] of paresDnsSlugAlternativos(dnsNorm, slugNorm)) {
    const path = `/${d}/${s}/`;
    if (vistoPath.has(path)) continue;
    vistoPath.add(path);
    resultados.push({
      path,
      titulo: tit || slugParaTituloExibicao(s),
      artista: art || slugParaTituloExibicao(d),
    });
  }

  if (!resultados.length) return null;

  const ordenados = [...resultados].sort(
    (a, b) =>
      pontuarCandidatoLetras(b, dnsNorm, slugNorm, tit) -
      pontuarCandidatoLetras(a, dnsNorm, slugNorm, tit)
  );

  for (const row of ordenados.slice(0, MAX_LETRAS_VIA_INDICE + 8)) {
    const seg = String(row.path || '')
      .split('/')
      .filter(Boolean);
    const d = seg[0] || '';
    const s = seg[1] || '';
    if (!d || !s) continue;
    const chave = `${d}/${s}`.toLowerCase();
    if (jaTentados && jaTentados.has(chave)) continue;
    if (jaTentados) jaTentados.add(chave);
    try {
      const hl = await fetchHtmlLetrasMus(d, s);
      const estrofes = estrofesDePaginaLetrasMusHtml(hl);
      if (estrofes.length) {
        const pa = tituloArtistaDoScriptPageArgsLetras(hl);
        return {
          estrofes,
          titulo: pa.titulo || row.titulo || '',
          artista: pa.artista || row.artista || '',
          path: `/${d}/${s}/`,
        };
      }
    } catch (_) {
      continue;
    }
  }
  return null;
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

/**
 * Limite de caracteres por linha antes do fatiamento em slides (projeção).
 *
 * 45 deixava passar inteiras quase todas as linhas do CifraClub/Letras
 * ("Quando as lutas vierem contra ti" tem 31), e o slide ficava com muito mais
 * palavra por linha do que o padrão do banco offline, que quebra a frase em
 * fragmentos curtos ("Quando as lutas" / "Vierem contra ti").
 */
const MAX_CHARS_POR_LINHA = 26;

function normalizarMaxLinhasPorSlide(valor) {
  const n = parseInt(valor, 10);
  if (n === 2 || n === 3 || n === 4) return n;
  return 4;
}

/** Valor do select «Padrão do Banco»: HLYRCS e banco online do Lyra. */
const PADRAO_LINHAS_DO_BANCO = 'banco';

function ehPadraoLinhasDoBanco(valor) {
  const v = String(valor ?? '').trim().toLowerCase();
  return v === PADRAO_LINHAS_DO_BANCO || v === 'origem' || v === 'padrao' || v === 'padrão';
}

function resolverModoLinhasFonteBanco(valor) {
  if (ehPadraoLinhasDoBanco(valor) || valor == null || valor === '') return PADRAO_LINHAS_DO_BANCO;
  const n = parseInt(valor, 10);
  if (n === 2 || n === 3 || n === 4) return n;
  return PADRAO_LINHAS_DO_BANCO;
}

/**
 * Estrofes tal como o banco as guarda — sem fatiar, sem limite de caracteres.
 * Só normaliza CRLF e descarta blocos vazios.
 */
function preservarEstrofesDoBanco(estrofes) {
  if (!Array.isArray(estrofes)) return [];
  return estrofes
    .map((s) => String(s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n'))
    .filter((s) => s.trim().length > 0);
}

/**
 * 2/3/4 linhas por slide a partir das linhas originais: não quebra frase, não
 * junta estrofes, não aplica MAX_CHARS_POR_LINHA. Cada estrofe do banco continua
 * uma unidade — só se fatia internamente de N em N linhas.
 */
function empacotarLinhasOriginaisPorSlide(estrofes, maxLinhas) {
  const n = parseInt(maxLinhas, 10);
  if (n !== 2 && n !== 3 && n !== 4) return preservarEstrofesDoBanco(estrofes);
  const slides = [];
  for (const bloco of preservarEstrofesDoBanco(estrofes)) {
    const linhas = bloco.split('\n').filter((l) => l.length > 0);
    if (!linhas.length) continue;
    for (let i = 0; i < linhas.length; i += n) {
      slides.push(linhas.slice(i, i + n).join('\n'));
    }
  }
  return slides.length ? slides : [''];
}

/**
 * Divisão para HLYRCS e banco online do Lyra.
 * `banco` → estrutura original; 2/3/4 → empacota linhas originais sem reescrever.
 */
function aplicarDivisaoEstrofesFonteBanco(estrofes, maxLinhasPorSlide) {
  const modo = resolverModoLinhasFonteBanco(maxLinhasPorSlide);
  if (modo === PADRAO_LINHAS_DO_BANCO) {
    const orig = preservarEstrofesDoBanco(estrofes);
    return orig.length ? orig : [''];
  }
  return empacotarLinhasOriginaisPorSlide(estrofes, modo);
}

const MIN_CHARS_FRAGMENTO_LINHA = 10;

/**
 * Folga sobre MAX_CHARS_POR_LINHA. Linha até `limite + folga` só é quebrada em
 * vírgula/conjunção ou num espaço que reparta a frase em metades parecidas —
 * senão "Na presença dos anjos, sempre" (29) virava "Na presença" (11) +
 * "dos anjos, sempre" (17), pior do que deixar a linha um pouco mais longa.
 */
const FOLGA_CHARS_POR_LINHA = 4;

/** Diferença máxima entre os dois pedaços numa quebra por espaço dentro da folga. */
const MAX_DESBALANCE_QUEBRA_FRACA = 4;

/** Conjunções (mais longas primeiro) para quebra antes da palavra. */
const CONJUNCOES_QUEBRA_LINHA = [
  'porém', 'porque', 'portanto', 'contudo', 'todavia', 'então',
  'quando', 'pois', 'assim', 'como', 'mas', 'que', 'se', 'ou', 'e',
];

/**
 * Palavras que não fecham uma frase em português: se a linha termina numa
 * delas, a ideia continua na linha seguinte.
 *
 * Serve para duas coisas: não pendurar essas palavras no fim de uma linha
 * quebrada por espaço, e reconhecer que a fonte partiu a frase no meio
 * ("E quanto mais" / "o tempo passa").
 *
 * Acentos são removidos antes da consulta, então 'e' cobre "é" e 'esta'
 * cobre "está".
 */
const PALAVRAS_QUE_NAO_FECHAM_LINHA = new Set([
  // artigos
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  // preposições e contrações
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos',
  'por', 'pela', 'pelo', 'pelas', 'pelos', 'pra', 'pro', 'para', 'com', 'sem',
  'sob', 'sobre', 'ate', 'ao', 'aos', 'entre', 'desde', 'apos', 'contra',
  // possessivos
  'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'seus', 'suas',
  'teu', 'tua', 'teus', 'tuas', 'nosso', 'nossa', 'nossos', 'nossas',
  // conjunções e relativos
  'e', 'ou', 'mas', 'que', 'se', 'porque', 'pois', 'quando', 'como', 'nem',
  'onde', 'qual', 'quais', 'quem', 'cujo', 'cuja', 'enquanto', 'embora',
  // comparativos e quantificadores
  'mais', 'menos', 'tao', 'tanto', 'quanto', 'quao', 'muito', 'todo', 'toda',
  'todos', 'todas', 'cada',
  // auxiliares e cópula
  'sao', 'foi', 'sera', 'seja', 'ser', 'esta', 'estao', 'estou', 'tem', 'ter',
  'vai', 'vou', 'vamos', 'vao', 'quer', 'quero', 'pode', 'posso', 'vem',
  // pronomes proclíticos ("Venho para Te" / "adorar"). 'nos' e 'vos' ficam de
  // fora: podem ser o "nós"/"vós" que fecha a frase ("Deus habita em nós").
  'te', 'me', 'lhe',
]);

function terminaEmPalavraFuncional(trecho) {
  const ultima = String(trecho || '')
    .trim()
    .split(/\s+/)
    .pop() || '';
  return PALAVRAS_QUE_NAO_FECHAM_LINHA.has(
    foldAccents(ultima).replace(/[^a-z0-9]/g, '')
  );
}

/** Comprimento máximo de uma frase remontada, para nunca colar a letra inteira. */
const MAX_CHARS_FRASE_REMONTADA = 120;

/**
 * Palavras que voltam a ser minúsculas no meio da frase remontada.
 *
 * A fonte capitaliza toda linha, então "E quanto mais" + "O tempo passa" daria
 * "E quanto mais O tempo passa". Só desce a caixa em palavra gramatical — nada
 * de mexer em "Deus", "Jesus", "Teu", "Ele", que são maiúsculas de propósito.
 */
const PALAVRAS_MINUSCULAS_NO_MEIO = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos',
  'por', 'pela', 'pelo', 'pra', 'pro', 'para', 'com', 'sem', 'sob', 'sobre',
  'ate', 'ao', 'aos', 'entre', 'desde',
  'e', 'ou', 'mas', 'que', 'se', 'porque', 'pois', 'quando', 'como', 'nem',
  'onde', 'enquanto', 'mais', 'menos', 'tao', 'tanto', 'quanto', 'muito',
  'todo', 'toda', 'todos', 'todas', 'cada', 'nao', 'ja', 'la', 'aqui',
]);

/** Baixa a caixa da primeira palavra de uma continuação, quando ela é gramatical. */
function descapitalizarContinuacao(linha) {
  const t = String(linha || '').trim();
  const m = t.match(/^(\p{Lu})(\p{L}*)/u);
  if (!m) return t;
  const palavra = foldAccents(m[1] + m[2]);
  // Infinitivos e clíticos também descem ("pode Apagar" → "pode apagar"), mas
  // Deus, Jesus, Senhor, Te, Teu, Ele continuam maiúsculos.
  const comum =
    PALAVRAS_MINUSCULAS_NO_MEIO.has(palavra) ||
    (palavra.length > 3 && /(ar|er|ir)$/.test(palavra)) ||
    palavra === 'me' ||
    palavra === 'nos' ||
    palavra === 'lhe';
  if (!comum) return t;
  return m[1].toLocaleLowerCase('pt-BR') + t.slice(1);
}

/**
 * Junta as linhas que a fonte cortou no meio da frase.
 *
 * O CifraClub e o Letras quebram a letra na métrica do canto: "E quanto mais"
 * numa linha, "o tempo passa" na outra. Cada uma virava uma linha do slide e a
 * frase acabava partida — às vezes em slides diferentes. Aqui elas voltam a ser
 * uma frase só; o corte por tamanho acontece depois, já com a frase inteira.
 *
 * @param {string[]} linhas - linhas de UMA estrofe
 * @returns {string[]}
 */
function unirLinhasIncompletas(linhas) {
  const out = [];
  for (const linha of linhas) {
    const anterior = out[out.length - 1];
    const podeJuntar =
      anterior &&
      anterior.length + 1 + linha.length <= MAX_CHARS_FRASE_REMONTADA &&
      !/[.!?…]$/.test(anterior) &&
      terminaEmPalavraFuncional(anterior);
    if (podeJuntar) {
      out[out.length - 1] = `${anterior} ${descapitalizarContinuacao(linha)}`;
      continue;
    }
    out.push(linha);
  }
  return out;
}

/** Maiúscula na primeira letra da linha, como no formato do banco offline. */
function capitalizarInicialLinha(linha) {
  return String(linha || '')
    .trim()
    .replace(/^([^\p{L}]*)(\p{L})/u, (_, pre, ch) => pre + ch.toLocaleUpperCase('pt-BR'));
}

function escRegexQuebra(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ponto de quebra natural: vírgula (mais equilibrada) → conjunções → espaço no limite.
 * Fragmentos >= MIN_CHARS_FRAGMENTO_LINHA; cabeça <= limite.
 *
 * @returns {{ cut: number, forte: boolean }} `forte` = quebra em pontuação ou
 * conjunção (fronteira real da frase), não num espaço qualquer.
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
    return { cut: virgulas[0].cut, forte: true };
  }

  const candidatos = [];
  const registrar = (prioridade, cut) => {
    const info = cutValido(cut);
    if (!info) return;
    // Corte no espaço não pode deixar preposição/artigo órfão ("vai passar por").
    const penalidade =
      prioridade === 3 && terminaEmPalavraFuncional(rest.slice(0, info.cut)) ? 1 : 0;
    candidatos.push({
      prioridade: prioridade + penalidade,
      cut: info.cut,
      dist: Math.abs(info.cut - alvo),
    });
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
    return { cut, forte: false };
  }

  candidatos.sort((a, b) => a.prioridade - b.prioridade || a.dist - b.dist);
  return { cut: candidatos[0].cut, forte: candidatos[0].prioridade <= 2 };
}

/** Quebra linha longa na vírgula, conjunção ou espaço (só se ultrapassar o limite). */
function quebrarLinhaLonga(linha, limite = MAX_CHARS_POR_LINHA) {
  const s = String(linha ?? '').trim();
  if (!s || s.length <= limite) return s ? [s] : [];

  const tolerado = limite + FOLGA_CHARS_POR_LINHA;
  const partes = [];
  let rest = s;
  while (rest.length > limite) {
    const escolha = encontrarPontoQuebraNatural(rest, limite);
    const head = rest.slice(0, escolha.cut).trim().replace(/[,;]\s*$/, '').trim();
    const cauda = rest.slice(escolha.cut).trim();
    if (!head || !cauda) break;
    // Dentro da folga, quebra fraca (espaço) só vale se repartir bem a frase e
    // não terminar em preposição/artigo — quando todo corte possível é ruim,
    // deixar a linha um pouco longa é melhor ("Eu ando com" + "meu Deus na rua").
    if (
      rest.length <= tolerado &&
      !escolha.forte &&
      (Math.abs(head.length - cauda.length) > MAX_DESBALANCE_QUEBRA_FRACA ||
        terminaEmPalavraFuncional(head))
    ) {
      break;
    }
    partes.push(head);
    rest = cauda;
  }
  if (rest) partes.push(rest);
  return partes.length ? partes : [s];
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

    // Slide órfão com o anterior cheio: reparte uma linha do slide anterior.
    // Só a partir de 3 linhas — tirar uma de um slide de 2 apenas move o órfão.
    if (i > 0) {
      const prev = linhasNaoVaziasDoSlide(out[i - 1]);
      if (prev.length >= 3) {
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

/**
 * Agrupa fragmentos em slides sem separar os pedaços de uma mesma linha
 * original e sem misturar estrofes (o chamador passa uma estrofe por vez).
 *
 * @param {string[][]} grupos - um array de fragmentos por linha original
 * @param {number} maxLinhas
 * @returns {string[]}
 */
function empacotarGruposEmSlides(grupos, maxLinhas) {
  const slides = [];
  let atual = [];
  for (const grupo of grupos) {
    if (grupo.length > maxLinhas) {
      if (atual.length) {
        slides.push(atual);
        atual = [];
      }
      for (let i = 0; i < grupo.length; i += maxLinhas) {
        slides.push(grupo.slice(i, i + maxLinhas));
      }
      continue;
    }
    if (atual.length + grupo.length > maxLinhas) {
      slides.push(atual);
      atual = [];
    }
    atual.push(...grupo);
  }
  if (atual.length) slides.push(atual);
  return slides.map((linhas) => linhas.join('\n'));
}

/**
 * Junta estrofes curtas seguidas enquanto couberem no mesmo slide.
 *
 * A fonte às vezes corta a frase em blocos de 2 linhas ("Na presença dos
 * homens / Na presença dos anjos, sempre" + "Eu Te louvarei / Te louvarei"),
 * e o banco offline projeta as duas juntas. Nenhuma estrofe é partida aqui:
 * ou entra inteira, ou começa um slide novo.
 *
 * @param {string[][][]} blocos
 * @param {number} maxLinhas
 * @returns {string[][][]}
 */
function mesclarEstrofesCurtas(blocos, maxLinhas) {
  const contar = (grupos) => grupos.reduce((acc, frs) => acc + frs.length, 0);
  const out = [];
  for (const grupos of blocos) {
    const anterior = out[out.length - 1];
    if (anterior && contar(anterior) + contar(grupos) <= maxLinhas) {
      anterior.push(...grupos);
      continue;
    }
    out.push([...grupos]);
  }
  return out;
}

/**
 * Abaixo desta média de linhas por bloco, os "blocos" da fonte são linhas
 * soltas (o Next.js do Cifra entrega um <div> por linha) e não estrofes.
 */
const MIN_MEDIA_LINHAS_POR_ESTROFE = 1.8;

/**
 * Converte as estrofes da fonte em slides prontos para projeção.
 *
 * Três regras, todas vindas do formato usado no banco offline:
 * 1. linha longa é quebrada em fragmentos curtos (MAX_CHARS_POR_LINHA);
 * 2. slide não atravessa estrofe — antes a letra inteira era achatada numa
 *    lista só e fatiada de N em N, o que fazia um slide terminar com o começo
 *    da estrofe seguinte;
 * 3. os fragmentos de uma mesma linha original ficam no mesmo slide.
 *
 * Quando a fonte não tem estrofe de verdade (um bloco por linha, típico do
 * Next.js do Cifra), a letra volta a ser achatada antes do fatiamento.
 */
function normalizarEstrofesComMaxLinhas(estrofes, maxLinhasPorSlide = 4) {
  const inArr = Array.isArray(estrofes) ? estrofes : [];
  const maxLinhas = normalizarMaxLinhasPorSlide(maxLinhasPorSlide);

  // 1. linhas cruas, uma lista por estrofe.
  let blocosLinhas = [];
  for (const bloco of inArr) {
    const t = String(bloco || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!t) continue;
    const linhas = t.split('\n').map((l) => l.trim()).filter((l) => l.length);
    if (linhas.length) blocosLinhas.push(linhas);
  }
  if (!blocosLinhas.length) return [''];

  // 2. fonte sem estrofe de verdade (um bloco por linha) volta a ser lista única.
  const totalLinhas = blocosLinhas.reduce((acc, l) => acc + l.length, 0);
  const temEstrofes = totalLinhas / blocosLinhas.length >= MIN_MEDIA_LINHAS_POR_ESTROFE;
  if (!temEstrofes) blocosLinhas = [blocosLinhas.flat()];

  // 3. remonta as frases partidas e só então quebra por tamanho.
  let blocos = blocosLinhas
    .map((linhas) =>
      unirLinhasIncompletas(linhas)
        .map((l) => quebrarLinhaLonga(l).map(capitalizarInicialLinha))
        .filter((g) => g.length)
    )
    .filter((grupos) => grupos.length);
  if (!blocos.length) return [''];

  if (temEstrofes) blocos = mesclarEstrofesCurtas(blocos, maxLinhas);

  const totalFragmentos = blocos.reduce(
    (acc, g) => acc + g.reduce((a, frs) => a + frs.length, 0),
    0
  );
  const slides = [];
  for (const grupos of blocos) {
    const doBloco = empacotarGruposEmSlides(grupos, maxLinhas);
    slides.push(...eliminarSlidesOrfaos(doBloco, maxLinhas, totalFragmentos));
  }
  return slides.length ? slides : [''];
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
  const { titulo: tHtmlEarly, artista: aHtmlEarly } = tituloArtistaDoHtmlCifra(html);
  const jaTentadosLetras = new Set();

  // Página completa do Letras.mus.br antes de qualquer meta tag.
  if (!estrofes.length && dns && songSlug) {
    const slugs = slugsLetrasParaTentar(html, dns, songSlug, tHtmlEarly);
    for (const slugTry of slugs) {
      jaTentadosLetras.add(`${dns}/${slugTry}`.toLowerCase());
      try {
        const hl = await fetchHtmlLetrasMus(dns, slugTry);
        estrofes = estrofesDePaginaLetrasMusHtml(hl);
        if (estrofes.length) {
          const pa = tituloArtistaDoScriptPageArgsLetras(hl);
          tituloLetras = pa.titulo;
          artistaLetras = pa.artista;
          parcial = false;
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

  // Slug do Cifra ≠ Letras (título composto, artista diferente, etc.): busca no índice.
  if (!estrofes.length || parcial) {
    const viaIndice = await tentarLetraLetrasViaIndice({
      titulo: tHtmlEarly || slugParaTituloExibicao(songSlug),
      artista: aHtmlEarly || slugParaTituloExibicao(dns),
      dns,
      songSlug,
      jaTentados: jaTentadosLetras,
    });
    if (viaIndice?.estrofes?.length) {
      estrofes = viaIndice.estrofes;
      tituloLetras = viaIndice.titulo || tituloLetras;
      artistaLetras = viaIndice.artista || artistaLetras;
      parcial = false;
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

  const titulo =
    String(tituloLetras || tHtmlEarly || '').trim() ||
    slugParaTituloExibicao(seg[1] || '') ||
    'Sem título';
  const artista =
    String(artistaLetras || aHtmlEarly || '').trim() || slugParaTituloExibicao(seg[0] || '');
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
          const { titulo: tRow, artista: aRow } = tituloArtistaDoHtmlCifra(htmlLetra);
          const jaTentados = new Set();
          if (dns && songSlug) {
            const slugs = slugsLetrasParaTentar(
              htmlLetra,
              dns,
              songSlug,
              tRow || row.titulo
            );
            for (const slugTry of slugs) {
              jaTentados.add(`${dns}/${slugTry}`.toLowerCase());
              try {
                const hl = await fetchHtmlLetrasMus(dns, slugTry);
                estrofes = estrofesDePaginaLetrasMusHtml(hl);
                if (estrofes.length) break;
              } catch (_) { continue; }
            }
          }
          if (!estrofes.length) {
            const viaIndice = await tentarLetraLetrasViaIndice({
              titulo: tRow || row.titulo || slugParaTituloExibicao(songSlug),
              artista: aRow || row.artista || slugParaTituloExibicao(dns),
              dns,
              songSlug,
              jaTentados,
            });
            if (viaIndice?.estrofes?.length) estrofes = viaIndice.estrofes;
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
  slugifyParaUrl,
  slugsAlternativosDoTitulo,
  slugsLetrasParaTentar,
  parseCaminhoLetraCifraClub,
  normalizarMaxLinhasPorSlide,
  PADRAO_LINHAS_DO_BANCO,
  ehPadraoLinhasDoBanco,
  resolverModoLinhasFonteBanco,
  preservarEstrofesDoBanco,
  empacotarLinhasOriginaisPorSlide,
  aplicarDivisaoEstrofesFonteBanco,
  normalizarEstrofesComMaxLinhas,
  quebrarLinhaLonga,
  unirLinhasIncompletas,
  capitalizarInicialLinha,
  empacotarGruposEmSlides,
  extrairLetraCifraClubParaPreviewOuImport,
  estrofesDePaginaCifraClub,
  estrofesFallbackMetaDescricaoCifra,
  extrairHtmlInternoPorAtributo,
  estrofesDePaginaLetrasMusHtml,
  estrofesDeTextoLetrasMetaEOg,
  tituloArtistaDoScriptPageArgsLetras,
  tituloArtistaDoHtmlCifra,
  limparRotuloMetadadoCifra,
  fetchHtmlLetrasMus,
  tentarLetraLetrasViaIndice,
  buscarLetraLocal,
  buscarLetraVagalume,
  buscarLetraCifraClub,
};
