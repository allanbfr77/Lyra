/**
 * Busca e leitura de letras na web direto no app (sem PC servidor).
 * Fetch e corrida LAN ficam aqui; HTML/slug/índice puro vêm de `@lyra/letras-fontes`.
 *
 * Fluxo principal:
 * 1. `buscarLetrasNaWeb` → índice de músicas da Studio Sol (JSON), em corrida com
 *    a API do controlador na LAN quando há um IP salvo
 * 2. `extrairLetraParaPreviewOuImport` → baixa a página e extrai as estrofes da
 *    fonte escolhida (CifraClub com fallback no Letras.mus.br), também em corrida
 *    com o controlador
 *
 * Histórico: a busca usava scraping do SERP do Yahoo (`site:cifraclub.com.br …`)
 * e da página `/busca/` do Letras.mus.br. Os dois pararam de funcionar — Yahoo dá
 * timeout total e `/busca/?q=` responde 404 — e foram trocados pelo índice JSON.
 */

// --- Constantes de origem e configuração ---

// Extensões explícitas para que este módulo também rode no Node (teste de fumaça
// em `letrasWebClient.test.mjs`); o Metro lida com elas normalmente.
import { urlApiControlador } from './lyraEndpoints.js';
import { fetchComTimeout } from './fetchComTimeout.js';
import { registrarHop } from './diagnosticoRede.js';
import letrasFontes from '@lyra/letras-fontes';

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
} = letrasFontes;

/**
 * Índice de busca da Studio Sol — a mesma empresa que opera o CifraClub e o
 * Letras.mus.br, então os slugs de artista/música servem para os dois sites.
 *
 * Substitui o scraping do Yahoo, que morreu: em campo, `search.yahoo.com` dava
 * timeout completo (15s sem resposta) e `letras.mus.br/busca/?q=` respondia 404.
 * Era essa a razão real de a busca não retornar nada — não a rede móvel.
 *
 * Vantagens sobre o scraping: JSON pequeno (dezenas de KB contra centenas do SERP),
 * sem muro de bot, sem regex sobre HTML de terceiros, e já devolve o slug exato da
 * música (`url`), que antes tinha de ser adivinhado por `slugsLetrasParaTentar`.
 *
 * Formato de cada `doc`: `t` (tipo: "1" artista, "2" música), `dns` (slug do
 * artista), `url` (slug da música), `art` (artista), `txt` (título),
 * `full_txt` (título + artista).
 */
const INDICE_BUSCA_URL = 'https://solr.sscdn.co/cifraclub/h/';
const INDICE_TIPO_MUSICA = '2';
const MAX_RESULTADOS_INDICE = 40;

/**
 * Timeouts por tipo de hop.
 *
 * Antes havia um único valor de 22s aplicado também ao hop do controlador na LAN.
 * Em 4G/5G um IP privado (192.168.x) não é alcançável e o SYN é descartado sem RST:
 * o socket ficava pendurado os 22s inteiros ANTES de a busca na web começar
 * (era o primeiro `await` do fluxo). Somando os hops em série, a busca levava
 * 44s (CifraClub) ou 66s (Letras.mus.br) — o que o usuário via como "travado".
 *
 * A correção é a corrida em `corridaPrimeiroNaoVazio`: o controlador e a web
 * correm em paralelo, então um controlador inalcançável não atrasa nada. O timeout
 * dele pode continuar generoso, porque a API do PC faz rede própria (Yahoo) e
 * legitimamente demora alguns segundos quando ESTÁ na LAN.
 */
const TIMEOUT_WEB_MS = 15000;

/**
 * O hop do controlador é curto de propósito.
 *
 * A corrida resolve assim que ALGUÉM traz resultado, mas quando ninguém traz
 * (busca sem correspondência, por exemplo) ela precisa esperar o hop mais lento.
 * Com 20s aqui, uma busca infrutífera em 4G ficava 20s no spinner só por causa de
 * um IP de LAN que nunca responderia.
 *
 * Com o índice JSON respondendo em centenas de milissegundos, a corrida quase sempre
 * termina antes deste prazo, então ele só pesa quando a busca não acha nada. 12s dá
 * folga para a API do PC (que faz rede própria) sem prender o usuário por muito tempo.
 *
 * Nota: o `/api/letras/buscar` do controlador também dependia do Yahoo e estourava.
 * O desktop recebeu a mesma troca (`controller/src/lib/indiceMusicasBusca.js`), então
 * essa rota responde rápido de novo — normalmente vencendo a corrida na LAN.
 */
const TIMEOUT_CONTROLADOR_MS = 12000;

/** Máximo de slugs alternativos tentados no Letras.mus.br ao extrair uma letra. */
const MAX_SLUGS_ALTERNATIVOS = 3;
/** Máximo de páginas do Letras tentadas via índice quando o slug direto falha. */
const MAX_LETRAS_VIA_INDICE = 5;

// --- Fonte de busca ---

async function buscarNoIndiceDeMusicas({ texto, filtros, fonte, signal }) {
  const url = `${INDICE_BUSCA_URL}?q=${encodeURIComponent(String(texto || '').trim())}`;

  // Via fetchTexto para reaproveitar a checagem de status, a classificação de
  // bloqueio e o registro de bytes no diagnóstico.
  const corpo = await fetchTexto(
    url,
    {
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal,
      rotulo: 'indice/busca',
    },
    TIMEOUT_WEB_MS
  );

  let data = null;
  try {
    data = JSON.parse(corpo);
  } catch (_) {
    // Corpo 200 que não é JSON quase sempre é muro de bot ou portal cativo de
    // Wi-Fi. Sem esta checagem viraria "nenhum resultado" silencioso.
    if (pareceBloqueioHtml(corpo)) throw erroDeBloqueio('Índice de busca');
    const err = new Error('índice de busca devolveu resposta inesperada');
    err.motivo = 'http';
    throw err;
  }

  const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
  registrarHop({ rotulo: 'indice/busca:docs', url, status: 200, ms: 0, bytes: docs.length });

  const candidatos = docs
    .filter((d) => String(d?.t) === INDICE_TIPO_MUSICA && d?.dns && d?.url)
    .map((d) => ({
      path: `/${d.dns}/${d.url}/`,
      titulo: String(d.txt || '').trim() || slugParaTituloExibicao(d.url),
      artista: String(d.art || '').trim() || slugParaTituloExibicao(d.dns),
      fonte,
    }));

  // Remove duplicatas de path preservando a ordem de relevância do índice.
  const visto = new Set();
  const resultados = [];
  for (const row of candidatos) {
    if (visto.has(row.path)) continue;
    if (!resultadoDoIndiceCombina(row, texto, filtros)) continue;
    visto.add(row.path);
    resultados.push(row);
    if (resultados.length >= MAX_RESULTADOS_INDICE) break;
  }

  return { resultados };
}

/**
 * Busca via API HTTP do controlador (PC na LAN, porta 3001).
 *
 * Só alcançável na mesma rede local, por isso corre em PARALELO com o índice em
 * vez de bloqueá-lo. Erros são devolvidos, não engolidos.
 *
 * @returns {Promise<{ resultados: object[], falhas: object[] }>}
 */
async function buscarLetrasViaControlador({ base, texto, artista, fonte, signal }) {
  if (!base) return { resultados: [], falhas: [] };

  const params = new URLSearchParams({
    titulo: texto,
    artista: artista ? '1' : '0',
    fonte: normalizarFonteLetras(fonte),
  });

  const res = await fetchComTimeout(
    `${base}/api/letras/buscar?${params}`,
    { signal, rotulo: 'controlador/buscar' },
    TIMEOUT_CONTROLADOR_MS
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.sucesso || !Array.isArray(data.resultados)) {
    return {
      resultados: [],
      falhas: [
        {
          hop: 'controlador/buscar',
          erro: data?.erro || `HTTP ${res.status}`,
          motivo: 'controlador',
        },
      ],
    };
  }

  return {
    resultados: data.resultados.map((row) => ({
      path: row.path,
      titulo: row.titulo || '',
      artista: row.artista || '',
      fonte: normalizarFonteLetras(fonte),
    })),
    falhas: [],
  };
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
 * Baixa o corpo como texto, exigindo status 2xx e registrando o tamanho no
 * diagnóstico. Antes, `fetchHtmlBuscaLetrasMus` não checava `res.ok` e entregava
 * o corpo de erro (403/captcha) ao parser, que devolvia lista vazia em silêncio —
 * indistinguível de "nenhum resultado encontrado".
 *
 * @param {string} url
 * @param {RequestInit & { rotulo?: string }} init
 * @param {number} ms
 * @returns {Promise<string>}
 */
async function fetchTexto(url, init, ms) {
  const res = await fetchComTimeout(url, init, ms);
  if (!res.ok) {
    const err = new Error(`${init?.rotulo || 'HTTP'} ${res.status}`);
    err.status = res.status;
    err.motivo = res.status === 403 || res.status === 401 || res.status === 429 ? 'bloqueado' : 'http';
    throw err;
  }
  const texto = await res.text();
  registrarHop({ rotulo: `${init?.rotulo || 'fetch'}:corpo`, url, status: res.status, ms: 0, bytes: texto.length });
  return texto;
}

/** Marcadores de página de bloqueio/consentimento servida com status 200. */
const MARCADORES_BLOQUEIO = [
  'captcha',
  'unusual traffic',
  'attention required',
  'verifying you are human',
  'access denied',
  'consent.yahoo',
  'are you a robot',
  'cf-browser-verification',
];

/**
 * Detecta uma resposta 200 que na verdade é muro de bot/consentimento.
 * Faixas de IP de operadora móvel (CGNAT, muito compartilhadas) recebem score de
 * bot bem mais agressivo que IP residencial, então isto acontece em 4G/5G e não
 * em Wi-Fi — sem esta checagem o app reportava "nenhum resultado".
 *
 * @param {string} html
 * @returns {boolean}
 */
function pareceBloqueioHtml(html) {
  const amostra = String(html || '').slice(0, 4000).toLowerCase();
  if (!amostra) return false;
  return MARCADORES_BLOQUEIO.some((m) => amostra.includes(m));
}

function erroDeBloqueio(rotulo) {
  const err = new Error(`${rotulo} respondeu com verificação de robô.`);
  err.motivo = 'bloqueado';
  return err;
}

/** Uma falha coletada indica bloqueio por anti-bot / rede restrita? */
function falhaEhBloqueio(f) {
  return f?.motivo === 'bloqueado';
}

/**
 * A falha veio do hop do controlador (PC na LAN)?
 *
 * Essencial para classificar a mensagem ao usuário. O controlador é inalcançável
 * por definição em 4G/5G, então o timeout dele é ESPERADO e não diz nada sobre a
 * Internet do celular. Uma primeira versão desta correção não fazia essa
 * distinção e mostrava "Sem resposta da Internet" só porque o IP da LAN não
 * respondeu — enganando o diagnóstico.
 */
function falhaEhDoControlador(f) {
  return String(f?.hop || '').startsWith('controlador') || f?.motivo === 'controlador';
}

/** Só as falhas que realmente dizem algo sobre a Internet do aparelho. */
function falhasDaWeb(falhas) {
  return (Array.isArray(falhas) ? falhas : []).filter((f) => !falhaEhDoControlador(f));
}

/**
 * Corre várias tarefas em paralelo e resolve com a PRIMEIRA que produzir
 * resultado útil (`temResultado`). As perdedoras são canceladas via AbortSignal.
 *
 * Substitui o encadeamento em série que fazia o hop do controlador na LAN
 * bloquear a busca na web. Uma tarefa que falha ou volta vazia não decide a
 * corrida — as outras continuam —, e só quando TODAS terminarem sem resultado
 * é que as falhas são agregadas.
 *
 * @template T
 * @param {{ nome: string, executar: (signal: AbortSignal) => Promise<T> }[]} tarefas
 * @param {(valor: T) => boolean} temResultado
 * @returns {Promise<{ vencedor: string|null, valor: T|null, falhas: { hop: string, erro: string, motivo: string|null }[] }>}
 */
async function corridaPrimeiroNaoVazio(tarefas, temResultado) {
  const ctrl = new AbortController();
  /** @type {{ hop: string, erro: string, motivo: string|null }[]} */
  const falhas = [];

  const vencedor = await new Promise((resolve) => {
    let pendentes = tarefas.length;
    let decidido = false;

    const encerrar = (valor) => {
      if (decidido) return;
      decidido = true;
      resolve(valor);
    };

    if (!pendentes) {
      encerrar(null);
      return;
    }

    for (const tarefa of tarefas) {
      Promise.resolve()
        .then(() => tarefa.executar(ctrl.signal))
        .then((valor) => {
          if (temResultado(valor)) {
            encerrar({ nome: tarefa.nome, valor });
            return;
          }
          // Sem resultado: guarda o motivo, se houver, e deixa os outros correrem.
          if (valor && valor.erro) {
            falhas.push({ hop: tarefa.nome, erro: String(valor.erro), motivo: valor.motivo || null });
          }
          if (Array.isArray(valor?.falhas)) falhas.push(...valor.falhas);
        })
        .catch((e) => {
          // Cancelamento é consequência de outro hop ter ganhado — não é falha.
          if (e?.motivo === 'cancelado') return;
          falhas.push({ hop: tarefa.nome, erro: e?.message || String(e), motivo: e?.motivo || null });
        })
        .then(() => {
          pendentes -= 1;
          if (pendentes === 0) encerrar(null);
        });
    }
  });

  ctrl.abort(); // libera os sockets das tarefas perdedoras

  return {
    vencedor: vencedor ? vencedor.nome : null,
    valor: vencedor ? vencedor.valor : null,
    falhas,
  };
}

/**
 * Busca o HTML da página de resultados do Yahoo para o CifraClub.
 * Usa User-Agent de navegador desktop para obter resultados mais completos.
 *
 * @param {string} termo - Termo de busca do usuário
 * @returns {Promise<string>} HTML da página de resultados
 */
// --- Extração de letra do HTML ---

/**
 * Extrai o conteúdo interno de uma `<div>` identificada por um token de classe.
 * Usa contagem de profundidade de tags para encontrar o fechamento correto da div.
 *
 * @param {string} html - HTML completo da página
 * @param {string} classToken - Token de classe a localizar (ex.: "letra")
 * @returns {string|null} HTML interno da div ou null se não encontrada
 */
async function tentarLetraLetrasViaIndice({ titulo, artista, dns, songSlug, jaTentados, signal }) {
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
    if (signal?.aborted) break;
    try {
      const r = await buscarNoIndiceDeMusicas({
        texto: termo,
        filtros: { titulo: true, artista: false, letra: false },
        fonte: 'letras-mus-br',
        signal,
      });
      for (const row of r?.resultados || []) {
        if (vistoPath.has(row.path)) continue;
        vistoPath.add(row.path);
        resultados.push(row);
      }
    } catch (e) {
      if (e?.motivo === 'cancelado') throw e;
      continue;
    }
  }

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
    if (signal?.aborted) break;
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
      const hl = await fetchHtmlLetrasMus(d, s, signal);
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
    } catch (e) {
      if (e?.motivo === 'cancelado') throw e;
      continue;
    }
  }
  return null;
}

/**
 * Busca o HTML da página de letra no Letras.mus.br.
 *
 * @param {string} dns - Slug do artista (ex.: "hillsong-united")
 * @param {string} slugMusica - Slug da música (ex.: "oceans")
 * @returns {Promise<string>} HTML da página
 */
async function fetchHtmlLetrasMus(dns, slugMusica, signal) {
  const d = String(dns || '').replace(/^\/|\/$/g, '');
  const s = String(slugMusica || '').replace(/^\/|\/$/g, '');
  const pathRel = `/${d}/${s}/`;
  const url = `${LETRAS_ORIGIN}${pathRel}`;
  const html = await fetchTexto(
    url,
    { headers: headersLetrasMus(pathRel), signal, rotulo: 'letras/pagina' },
    TIMEOUT_WEB_MS
  );
  if (pareceBloqueioHtml(html)) throw erroDeBloqueio('Letras.mus.br');
  return html;
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

  // Alinhado ao controlador: fatia a letra inteira em grupos de no máximo 4.
  const todasLinhas = [];
  for (const bloco of inArr) {
    const t = String(bloco || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
    if (!t) continue;

    const rawLines = expandirLinhasLongas(
      t.split('\n').map((l) => l.trim()).filter((l) => l.length)
    );
    todasLinhas.push(...rawLines);
  }

  if (!todasLinhas.length) return [''];
  return fatiarLinhasEmSlides(todasLinhas, maxLinhas, todasLinhas.length);
}

async function fetchHtmlLetraCifraClubComFallback(pathRel, signal) {
  const pathNorm = (pathRel.startsWith('/') ? pathRel : `/${pathRel}`).replace(/\/?$/, '/');
  const urls = [`${CIFRA_ORIGIN}${pathNorm}letra/`, `${CIFRA_ORIGIN}${pathNorm}`];
  let bloqueado = false;
  const falhas = [];

  for (const url of urls) {
    if (signal?.aborted) break;
    try {
      const r = await fetchComTimeout(
        url,
        { headers: headersCifraClub(pathNorm), signal, rotulo: 'cifraclub/pagina' },
        TIMEOUT_WEB_MS
      );
      if (r.status === 403 || r.status === 401 || r.status === 429) {
        bloqueado = true;
        falhas.push({ hop: 'cifraclub/pagina', erro: `HTTP ${r.status}`, motivo: 'bloqueado' });
        continue;
      }
      if (!r.ok) {
        falhas.push({ hop: 'cifraclub/pagina', erro: `HTTP ${r.status}`, motivo: 'http' });
        continue;
      }
      const html = await r.text();
      registrarHop({ rotulo: 'cifraclub/pagina:corpo', url, status: r.status, ms: 0, bytes: html.length });
      if (pareceBloqueioHtml(html)) {
        bloqueado = true;
        falhas.push({ hop: 'cifraclub/pagina', erro: 'verificação de robô', motivo: 'bloqueado' });
        continue;
      }
      if (html && html.length > 200) return { html, bloqueado: false, falhas };
    } catch (e) {
      if (e?.motivo === 'cancelado') break;
      if (e?.motivo === 'bloqueado') bloqueado = true;
      falhas.push({ hop: 'cifraclub/pagina', erro: e?.message || String(e), motivo: e?.motivo || null });
    }
  }

  return { html: null, bloqueado, falhas };
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
  const base = host ? urlApiControlador(host) : '';

  const filtros = { titulo, artista, letra };
  const tarefas = [];

  // O controlador é uma rota alternativa útil (o PC não sofre o bloqueio 403 que
  // o celular sofre), mas só existe na LAN. Corre em paralelo — nunca à frente.
  if (base) {
    tarefas.push({
      nome: 'controlador',
      executar: (signal) =>
        buscarLetrasViaControlador({ base, texto, artista, fonte: fonteNorm, signal }),
    });
  }

  // Um único hop de busca na web: o índice da Studio Sol serve CifraClub e
  // Letras.mus.br, porque os slugs são os mesmos nos dois sites.
  tarefas.push({
    nome: 'indice',
    executar: (signal) => buscarNoIndiceDeMusicas({ texto, filtros, fonte: fonteNorm, signal }),
  });

  const { vencedor, valor, falhas } = await corridaPrimeiroNaoVazio(
    tarefas,
    (v) => Array.isArray(v?.resultados) && v.resultados.length > 0
  );

  if (vencedor) {
    return { resultados: valor.resultados, via: vencedor, falhas };
  }

  // Ninguém trouxe resultado. Diferencia "bloqueado/sem rede" de "não achei nada":
  // antes os dois casos chegavam à UI como uma lista vazia idêntica.
  // A classificação ignora o hop do controlador — ver `falhaEhDoControlador`.
  const daWeb = falhasDaWeb(falhas);

  return {
    resultados: [],
    via: null,
    falhas,
    bloqueado: daWeb.some(falhaEhBloqueio),
    semRede: daWeb.some((f) => f?.motivo === 'timeout' || f?.motivo === 'rede'),
    diagnostico: resumirFalhas(falhas),
  };
}

/** Resumo curto das falhas, para exibir ou anexar a um relato de bug. */
function resumirFalhas(falhas) {
  if (!Array.isArray(falhas) || !falhas.length) return '';
  return falhas.map((f) => `${f.hop}: ${f.erro}`).join(' · ');
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
async function extrairLetraLetrasMusDireto(pathRaw, signal) {
  const trimmed = pathRaw != null ? String(pathRaw).trim() : '';
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
    html = await fetchHtmlLetrasMus(dns, slug, signal);
  } catch (e) {
    if (e?.motivo === 'cancelado') throw e;
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

  // 1) Mesma URL no CifraClub (faixa exata). 2) Alternativas no Letras via índice.
  if (!estrofes.length) {
    try {
      const viaCifra = await previewDiretoNaWeb(abs, 'cifraclub', signal);
      if (!viaCifra?.erro && viaCifra?.estrofes?.length) {
        return {
          titulo: viaCifra.titulo,
          artista: viaCifra.artista,
          estrofes: viaCifra.estrofes,
          path: pathNorm,
          parcial: !!viaCifra.parcial,
          fonteFallback: 'cifraclub',
        };
      }
    } catch (e) {
      if (e?.motivo === 'cancelado') throw e;
    }
  }

  if (!estrofes.length) {
    try {
      const viaIndice = await tentarLetraLetrasViaIndice({
        titulo: titulo || slugParaTituloExibicao(slug),
        artista: artista || slugParaTituloExibicao(dns),
        dns,
        songSlug: slug,
        jaTentados,
        signal,
      });
      if (viaIndice?.estrofes?.length) {
        estrofes = viaIndice.estrofes;
        titulo = viaIndice.titulo || titulo;
        artista = viaIndice.artista || artista;
        if (viaIndice.path) pathNorm = viaIndice.path;
      }
    } catch (e) {
      if (e?.motivo === 'cancelado') throw e;
    }
  }

  if (!estrofes.length) {
    return {
      erro:
        erroDireto?.message ||
        'Não foi possível ler a letra nesta página do Letras.mus.br.',
      motivo: erroDireto?.motivo || null,
    };
  }

  estrofes = normalizarEstrofesQuatroLinhas(estrofes);
  titulo = titulo || slugParaTituloExibicao(slug) || 'Sem título';
  artista = artista || slugParaTituloExibicao(dns);
  return { titulo, artista, estrofes, path: pathNorm };
}

export async function extrairLetraParaPreviewOuImport(pathRaw, opts = {}) {
  const trimmed = pathRaw != null ? String(pathRaw).trim() : '';
  if (!trimmed) return { erro: 'path inválido.' };

  const fonteNorm = normalizarFonteLetras(opts.fonte);
  const hostControlador = opts.hostControlador ? String(opts.hostControlador).trim() : '';
  const base = hostControlador ? urlApiControlador(hostControlador) : '';

  const tarefas = [];

  if (base) {
    tarefas.push({
      nome: 'controlador',
      executar: (signal) => previewViaControlador({ base, path: trimmed, fonte: fonteNorm, signal }),
    });
  }

  tarefas.push({
    nome: 'web',
    executar: (signal) => previewDiretoNaWeb(trimmed, fonteNorm, signal),
  });

  const { vencedor, valor, falhas } = await corridaPrimeiroNaoVazio(
    tarefas,
    (v) => Array.isArray(v?.estrofes) && v.estrofes.length > 0
  );

  if (vencedor) return { ...valor, via: vencedor };

  const daWeb = falhasDaWeb(falhas);
  const bloqueado = daWeb.some(falhaEhBloqueio);
  if (bloqueado) {
    return {
      erro: base
        ? 'Cifra Club bloqueou o celular (403). Verifique se o controlador está aberto no PC e na mesma rede.'
        : 'Cifra Club bloqueou o acesso a partir desta rede (403). Em Wi‑Fi da igreja, conecte ao IP do controlador na tela inicial para baixar pelo PC.',
      falhas,
      diagnostico: resumirFalhas(falhas),
    };
  }

  const semRede = daWeb.some((f) => f?.motivo === 'timeout' || f?.motivo === 'rede');
  return {
    erro: semRede
      ? 'Sem resposta da Internet ao baixar a letra. Verifique a conexão e tente novamente.'
      : 'Não foi possível ler a letra (Cifra Club e Letras.mus.br falharam).',
    falhas,
    diagnostico: resumirFalhas(falhas),
  };
}

/** Prévia pela API do PC (porta 3001). Só alcançável na LAN. */
async function previewViaControlador({ base, path, fonte, signal }) {
  const res = await fetchComTimeout(
    `${base}/api/letras/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, fonte }),
      signal,
      rotulo: 'controlador/preview',
    },
    TIMEOUT_CONTROLADOR_MS
  );

  if (!res.ok) {
    return { erro: `controlador HTTP ${res.status}`, motivo: 'controlador' };
  }

  const data = await res.json().catch(() => ({}));
  if (data?.erro || !Array.isArray(data.estrofes) || !data.estrofes.length) {
    return { erro: data?.erro || 'controlador sem estrofes', motivo: 'controlador' };
  }

  return {
    titulo: data.titulo || '',
    artista: data.artista || '',
    estrofes: normalizarEstrofesQuatroLinhas(data.estrofes),
    path: data.path || path,
  };
}

/** Extração direta no celular (CifraClub com fallback no Letras.mus.br). */
async function previewDiretoNaWeb(trimmed, fonteNorm, signal) {
  if (fonteNorm === 'letras-mus-br') {
    return extrairLetraLetrasMusDireto(trimmed, signal);
  }

  const pathNormCifra = parseCaminhoLetraCifraClub(
    `${CIFRA_ORIGIN}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
  );
  if (!pathNormCifra) return { erro: 'URL de música inválida para cifraclub.com.br.' };

  const seg = pathNormCifra.split('/').filter(Boolean);
  const dns = seg[0] || '';
  const songSlug = seg[1] || '';

  const { html, bloqueado, falhas: falhasCifra } = await fetchHtmlLetraCifraClubComFallback(
    pathNormCifra,
    signal
  );

  const falhas = [...(falhasCifra || [])];
  let tituloLetras = '';
  let artistaLetras = '';

  /**
   * Ordem dos fallbacks — e por que ela importa.
   *
   * A meta description do CifraClub traz só as 4 PRIMEIRAS LINHAS da música, e
   * antes ela era tentada logo depois do HTML do Cifra. Como vinha não-vazia, a
   * cadeia parava ali e a página do Letras.mus.br (que tem a letra completa)
   * nunca era consultada: importava-se uma música de 4 linhas achando que era a
   * letra inteira. Verificado com "Galileu" (Fernandinho): 17 estrofes / 71
   * linhas nas fontes HTML, contra 4 linhas na meta description.
   *
   * Agora as fontes completas vêm primeiro e as meta tags são o último recurso,
   * marcando o resultado como `parcial` para a UI poder avisar.
   */
  let estrofes = html ? estrofesDePaginaCifraClub(html) : [];
  let parcial = false;
  let ogGuardada = [];
  const { titulo: tHtmlEarly, artista: aHtmlEarly } = html
    ? tituloArtistaDoHtmlCifra(html)
    : { titulo: '', artista: '' };
  const jaTentadosLetras = new Set();

  // Página completa do Letras.mus.br antes de qualquer meta tag.
  if (!estrofes.length && dns && songSlug) {
    // Limitado a MAX_SLUGS_ALTERNATIVOS: antes, cada tentativa custava um timeout
    // completo e a lista era ilimitada — a origem do pior caso de ~130s.
    const slugs = (
      html ? slugsLetrasParaTentar(html, dns, songSlug, tHtmlEarly) : [songSlug]
    ).slice(0, MAX_SLUGS_ALTERNATIVOS);
    for (const slugTry of slugs) {
      if (signal?.aborted) break;
      jaTentadosLetras.add(`${dns}/${slugTry}`.toLowerCase());
      try {
        const hl = await fetchHtmlLetrasMus(dns, slugTry, signal);
        estrofes = estrofesDePaginaLetrasMusHtml(hl);
        if (estrofes.length) {
          const pa = tituloArtistaDoScriptPageArgsLetras(hl);
          tituloLetras = pa.titulo;
          artistaLetras = pa.artista;
          parcial = false;
          break;
        }
        // Guarda a og:description como último recurso, sem encerrar a busca aqui.
        if (!ogGuardada.length) {
          const og = estrofesDeTextoLetrasMetaEOg(hl);
          if (og.length) {
            ogGuardada = og;
            const pa = tituloArtistaDoScriptPageArgsLetras(hl);
            tituloLetras = tituloLetras || pa.titulo;
            artistaLetras = artistaLetras || pa.artista;
          }
        }
      } catch (e) {
        if (e?.motivo === 'cancelado') throw e;
        falhas.push({ hop: 'letras/pagina', erro: e?.message || String(e), motivo: e?.motivo || null });
      }
    }
  }

  // Slug do Cifra ≠ Letras: busca no índice por título+artista.
  if ((!estrofes.length || parcial || ogGuardada.length) && !signal?.aborted) {
    try {
      const viaIndice = await tentarLetraLetrasViaIndice({
        titulo: tHtmlEarly || slugParaTituloExibicao(songSlug),
        artista: aHtmlEarly || slugParaTituloExibicao(dns),
        dns,
        songSlug,
        jaTentados: jaTentadosLetras,
        signal,
      });
      if (viaIndice?.estrofes?.length) {
        estrofes = viaIndice.estrofes;
        tituloLetras = viaIndice.titulo || tituloLetras;
        artistaLetras = viaIndice.artista || artistaLetras;
        parcial = false;
        ogGuardada = [];
      }
    } catch (e) {
      if (e?.motivo === 'cancelado') throw e;
      falhas.push({
        hop: 'letras/indice',
        erro: e?.message || String(e),
        motivo: e?.motivo || null,
      });
    }
  }

  // Últimos recursos, os dois apenas com o começo da letra.
  if (!estrofes.length && ogGuardada.length) {
    estrofes = ogGuardada;
    parcial = true;
  }
  if (!estrofes.length && html) {
    const meta = estrofesFallbackMetaDescricaoCifra(html);
    if (meta.length) {
      estrofes = meta;
      parcial = true;
    }
  }

  if (!estrofes.length) {
    return {
      erro: bloqueado ? 'Cifra Club bloqueou o acesso (403).' : 'Letra não encontrada nas fontes.',
      motivo: bloqueado ? 'bloqueado' : null,
      falhas,
    };
  }

  estrofes = normalizarEstrofesQuatroLinhas(estrofes);

  const titulo =
    String(tituloLetras || tHtmlEarly || '').trim() ||
    slugParaTituloExibicao(songSlug) ||
    'Sem título';
  const artista =
    String(artistaLetras || aHtmlEarly || '').trim() || slugParaTituloExibicao(dns);

  const pathNorm = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return { titulo, artista, estrofes, path: pathNorm, parcial };
}
