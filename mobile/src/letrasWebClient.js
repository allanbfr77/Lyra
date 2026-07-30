/**
 * Busca e leitura de letras na web direto no app (sem PC servidor).
 * Lógica espelhada ao controlador (`cifraLetras.js` + `letrasMusBr.js`) — manter alinhado.
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

const CIFRA_ORIGIN = 'https://www.cifraclub.com.br';

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

// --- Parsing de URLs do Letras.mus.br ---

/**
 * Valida e normaliza um caminho de URL do letras.mus.br para `/artista/musica/`.
 *
 * @param {string} decodedUrl
 * @returns {string|null}
 */
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

// --- Fonte de busca ---

function normalizarFonteLetras(fonte) {
  return fonte === 'letras-mus-br' ? 'letras-mus-br' : 'cifraclub';
}

/**
 * Um resultado do índice combina com o que o usuário pediu?
 *
 * Mais tolerante que o antigo `candidatoCombinaBusca`, que casava o termo contra
 * os *slugs* da URL. O índice já fez o casamento por relevância sobre
 * "título + artista", então filtrar de novo pelo slug descartava acertos bons:
 * buscar "fernandinho galileu" não casaria com o slug `galileu` nem com
 * `fernandinho` isoladamente. Aqui o casamento é sobre os nomes reais, por palavra.
 */
function resultadoDoIndiceCombina(row, qBruto, { titulo, artista, letra }) {
  const q = foldAccents(String(qBruto || '').trim());
  if (!q) return true;

  const tit = foldAccents(row.titulo);
  const art = foldAccents(row.artista);

  if (titulo && tit.includes(q)) return true;
  if (artista && art.includes(q)) return true;

  // Termo que mistura título e artista ("fernandinho galileu"), ou busca por
  // trecho: confia na relevância do índice, exigindo só que todas as palavras
  // apareçam em algum lugar do par título+artista.
  const combinado = `${tit} ${art}`;
  if (letra || combinado.includes(q)) return true;
  const palavras = q.split(/\s+/).filter(Boolean);
  return palavras.length > 1 && palavras.every((p) => combinado.includes(p));
}

/**
 * Busca no índice da Studio Sol. Único hop de busca na web — rápido e em JSON.
 *
 * @returns {Promise<{ resultados: object[] }>}
 */
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
  const openMatch = html.match(new RegExp(`<${tag}\\b[^>]*\\b${atributo}\\b[^>]*>`, 'i'));
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

/**
 * Extrai estrofes da página de letra do CifraClub.
 *
 * Duas estratégias: `div.letra` (markup antigo) e `data-chord-content` (Next.js
 * atual). A segunda foi acrescentada depois de constatar que a primeira não casa
 * mais — e que, sem ela, a extração caía na meta description, que traz **apenas
 * as 4 primeiras linhas** da música.
 *
 * @param {string} html - HTML da página de letra do CifraClub
 * @returns {string[]} Array de estrofes (cada item = um bloco de versos)
 */
function estrofesDePaginaCifraClub(html) {
  const legado = extrairHtmlInternoDivPorClasse(html, 'letra');
  if (legado) {
    const estrofes = estrofesDeParagrafos(legado);
    if (estrofes.length) return estrofes;
  }

  for (const atributo of ['data-chord-content', 'data-chord-container']) {
    const tag = atributo === 'data-chord-container' ? 'article' : 'div';
    const blob = extrairHtmlInternoPorAtributo(html, atributo, tag);
    if (!blob) continue;
    const estrofes = estrofesDeParagrafos(blob);
    if (estrofes.length) return estrofes;
  }

  return [];
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

  // A description usa " / " entre LINHAS, não entre estrofes. Devolver uma linha
  // por posição fazia cada linha virar um slide, ignorando "linhas por slide".
  // Um único bloco preserva as linhas e deixa o fatiamento para quem normaliza.
  return linhasComoBlocoUnico(t);
}

/**
 * Junta linhas separadas por " / " num único bloco de estrofe.
 *
 * A meta description não tem informação de fronteira de estrofe, então tratar
 * cada linha como uma estrofe separada é errado: quebra o agrupamento por
 * "linhas por slide". Um bloco só permite o fatiamento correto depois.
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
    const bloco = linhasComoBlocoUnico(decodeHtmlEntidades(og));
    if (bloco.length) return bloco;
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

  let html;
  try {
    html = await fetchHtmlLetrasMus(dns, slug, signal);
  } catch (e) {
    if (e?.motivo === 'cancelado') throw e;
    return { erro: e?.message || 'Letras.mus.br indisponível.', motivo: e?.motivo || null };
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

  // Página completa do Letras.mus.br antes de qualquer meta tag.
  if (!estrofes.length && dns && songSlug) {
    // Limitado a MAX_SLUGS_ALTERNATIVOS: antes, cada tentativa custava um timeout
    // completo e a lista era ilimitada — a origem do pior caso de ~130s.
    const slugs = (html ? slugsLetrasParaTentar(html, dns, songSlug) : [songSlug]).slice(
      0,
      MAX_SLUGS_ALTERNATIVOS
    );
    for (const slugTry of slugs) {
      if (signal?.aborted) break;
      try {
        const hl = await fetchHtmlLetrasMus(dns, slugTry, signal);
        estrofes = estrofesDePaginaLetrasMusHtml(hl);
        if (estrofes.length) {
          const pa = tituloArtistaDoScriptPageArgsLetras(hl);
          tituloLetras = pa.titulo;
          artistaLetras = pa.artista;
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

  const { titulo: tHtml, artista: aHtml } = html
    ? tituloArtistaDoHtmlCifra(html)
    : { titulo: '', artista: '' };
  const titulo =
    String(tituloLetras || tHtml || '').trim() || slugParaTituloExibicao(songSlug) || 'Sem título';
  const artista = String(artistaLetras || aHtml || '').trim() || slugParaTituloExibicao(dns);

  const pathNorm = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return { titulo, artista, estrofes, path: pathNorm, parcial };
}
