'use strict';

/**
 * Política dos proxies 5510 → 3001 (E1.3 Fase B).
 *
 * Os proxies existem para telas e leitores que só alcançam a 5510: ler músicas, Bíblia e a
 * mídia da apresentação do controlador. NUNCA para escrever.
 *
 * Por que isto é segurança: a 3001 confia em requisições "da própria máquina"
 * (`soDestaMaquina`, `requisicaoVemDaMaquinaLocal`), e o proxy da 5510 conecta à 3001 a partir
 * da própria máquina. Uma escrita encaminhada (importar mídia por caminho de arquivo, apagar
 * música, sincronizar banco…) herdava essa confiança e deixava qualquer aparelho da rede
 * escrever na máquina do controlador.
 *
 * Regras (todas decididas ANTES de abrir conexão com a 3001):
 *  1. só GET e HEAD; qualquer outro método → 405 + `Allow: GET, HEAD`;
 *  2. o caminho (a query não conta) não pode ter `..`, `.`, `//`, `\`, caracteres de controle,
 *     percent-encoding inválido nem `%2e`, `%2f`, `%5c`, `%00` → 400;
 *  3. a família é casada por segmento inteiro (`/api/musicasX` não é família) e com a mesma
 *     caixa que a 3001 serve;
 *  4. mídia da apresentação: só `/video|midia/<id>` com UM segmento; `importar` jamais passa;
 *  5. só uma lista fechada de cabeçalhos segue ao controlador (nada de Origin, Cookie,
 *     Authorization, X-Forwarded-*, Sec-Fetch-*, corpo ou transferência).
 */

const FAMILIAS = ['musicas', 'biblia', 'apresentacao'];

const PREFIXOS = {
  musicas: ['/api/musicas'],
  biblia: ['/api/biblia'],
  apresentacao: ['/api/apresentacao/video', '/api/apresentacao/midia'],
};

const MAX_CAMINHO = 2048;
const MAX_URL = 8192;
const MAX_VALOR_CABECALHO = 2048;

const CABECALHOS_PERMITIDOS = [
  'accept',
  'accept-language',
  'accept-encoding',
  'range',
  'if-range',
  'if-none-match',
  'if-modified-since',
  'user-agent',
  'cache-control',
  // Credencial do dispositivo (E1.3): vai como veio, para o controlador decidir; nunca é criada aqui.
  'x-lyra-device',
  'x-lyra-secret',
  'x-lyra-app',
];

function soCaminho(url) {
  const s = String(url || '');
  let fim = s.length;
  const q = s.indexOf('?');
  if (q >= 0) fim = q;
  const h = s.indexOf('#');
  if (h >= 0 && h < fim) fim = h;
  return s.slice(0, fim);
}

/** Fronteira de segmento: `/api/musicas` e `/api/musicas/...`, nunca `/api/musicasX`. */
function pertenceAFamilia(url, familia) {
  const prefixos = PREFIXOS[familia];
  if (!prefixos) return false;
  const p = soCaminho(url);
  return prefixos.some((pre) => p === pre || p.startsWith(`${pre}/`));
}

function caminhoMalformado(caminho) {
  if (!caminho.startsWith('/') || caminho.startsWith('//')) return true;
  if (caminho.length > MAX_CAMINHO) return true;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\;]/.test(caminho)) return true;
  if (/%(?![0-9a-fA-F]{2})/.test(caminho)) return true; // percent-encoding inválido
  if (/%(2e|2f|5c|00)/i.test(caminho)) return true; // ponto, barras e nulo disfarçados
  if (caminho.includes('//')) return true;
  return caminho.split('/').some((seg) => seg === '.' || seg === '..');
}

function segmentoDecodificado(seg) {
  try {
    return decodeURIComponent(seg);
  } catch (_) {
    return null;
  }
}

/**
 * @param {{ method?: string, originalUrl?: string }} req
 * @param {'musicas'|'biblia'|'apresentacao'} familia
 * @returns {{ ok: true, caminho: string } | { ok: false, status: number, allow?: string, erro: string }}
 */
function avaliarRequisicaoProxy(req, familia) {
  const metodo = String((req && req.method) || '').toUpperCase();
  if (metodo !== 'GET' && metodo !== 'HEAD') {
    return { ok: false, status: 405, allow: 'GET, HEAD', erro: 'Método não permitido neste caminho (somente GET e HEAD).' };
  }

  const url = String((req && req.originalUrl) || '');
  // eslint-disable-next-line no-control-regex
  if (url.length > MAX_URL || /[\u0000-\u001f\u007f]/.test(url)) {
    return { ok: false, status: 400, erro: 'Requisição inválida.' };
  }
  const caminho = soCaminho(url);
  if (caminhoMalformado(caminho)) return { ok: false, status: 400, erro: 'Caminho inválido.' };

  if (!pertenceAFamilia(url, familia)) return { ok: false, status: 404, erro: 'Caminho não encontrado.' };

  if (familia === 'apresentacao') {
    const m = /^\/api\/apresentacao\/(?:video|midia)\/([^/]+)$/.exec(caminho);
    const id = m ? segmentoDecodificado(m[1]) : null;
    // `importar` é escrita da própria máquina (e já tem guarda na 3001): nunca atravessa o proxy.
    if (!id || id.toLowerCase() === 'importar') return { ok: false, status: 404, erro: 'Caminho não encontrado.' };
  }

  return { ok: true, caminho: url };
}

function valorSeguro(v) {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== 'string') return null;
  if (!s || s.length > MAX_VALOR_CABECALHO) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  return s;
}

/**
 * Cabeçalhos enviados ao controlador. `x-lyra-proxy: 1` é sempre do proxy (o cliente não o
 * controla) e `host` é o do alvo.
 * @param {Record<string, string|string[]|undefined>} headers
 * @param {string} hostAlvo `host:porta`
 * @param {string|null} [via] `X-Lyra-Via` assinado pelo PRÓPRIO Servidor (elo s→c, Entrega 1); o que o
 *        cliente mandar com esse nome nunca atravessa (não está na lista de cabeçalhos permitidos).
 */
function cabecalhosParaControlador(headers, hostAlvo, via = null) {
  const saida = {};
  const origem = headers || {};
  for (const nome of CABECALHOS_PERMITIDOS) {
    const v = valorSeguro(origem[nome]);
    if (v !== null) saida[nome] = v;
  }
  saida.host = hostAlvo;
  saida['x-lyra-proxy'] = '1';
  if (typeof via === 'string' && via !== '') saida['x-lyra-via'] = via;
  return saida;
}

/** Resposta padrão de recusa (405 com Allow, 400, 404). */
function responderRecusa(res, aval) {
  if (aval.allow) res.setHeader('Allow', aval.allow);
  res.status(aval.status).json({ ok: false, erro: aval.erro });
}

module.exports = {
  FAMILIAS,
  responderRecusa,
  pertenceAFamilia,
  avaliarRequisicaoProxy,
  cabecalhosParaControlador,
};
