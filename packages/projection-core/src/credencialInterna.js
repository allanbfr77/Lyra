'use strict';

/**
 * Credencial interna efêmera do painel (E1.3 Fase B — arquitetura «W»).
 *
 * O problema
 * ----------
 * O painel (Electron) é o cliente HTTP mais importante das portas 3001 e 5510, e a Fase A o
 * fazia se autenticar com o par `deviceId`/`secret` guardado no `localStorage` do renderer. Esse
 * segredo vive no processo menos confiável do app (página web, vulnerável a XSS) e é o MESMO
 * usado no Socket.IO e na allowlist do Servidor.
 *
 * O que este módulo faz
 * ---------------------
 * O processo principal gera, a cada execução, um par próprio (`deviceId` interno + 32 bytes
 * aleatórios) que existe só na memória dele e é injetado nos cabeçalhos HTTP por
 * `session.webRequest.onBeforeSendHeaders`, depois que a requisição sai do renderer. O renderer
 * nunca o recebe: não está no preload, no DOM, no `localStorage`, em disco nem em log.
 *
 *  - `criarCredencialInterna`: gera o par e expõe SÓ `conferir`, `ehDeviceInterno` e
 *    `aplicarAosCabecalhos` (o único caminho que leva o segredo a um cabeçalho). Objeto
 *    congelado, sem propriedades enumeráveis do segredo, que não se deixa serializar/inspecionar.
 *  - `decidirInjecao`: política PURA — qual requisição recebe o par. Validada na prova técnica
 *    (Electron 29.4.6, 41 cenários): só XHR/fetch e ping, nunca OPTIONS nem WebSocket, só
 *    `webContentsId` registrado, só o frame principal da página exata da janela, só
 *    `http://127.0.0.1|localhost` nas portas 3001/5510.
 *  - `criarRegistroJanelas`: quais `webContents` estão autorizados, e para qual página.
 *  - `criarVerificadorHttp`: acrescenta a credencial interna aos verificadores da 3001 e da 5510
 *    local, restrita ao contexto local (loopback, Host de loopback, não proxificada).
 *
 * O que NÃO faz
 * -------------
 * Não cadastra nada na allowlist, não passa pelo Socket.IO e não altera `controleAcesso.js`. O
 * id interno nunca é consultado na allowlist: ou confere com a credencial em memória, ou é
 * recusado.
 *
 * Limitação conhecida: quem abre as DevTools da janela autorizada vê o cabeçalho injetado.
 * Por isso as DevTools ficam desligadas nessas janelas em produção (`controller/src`). Isso
 * não protege contra quem tem acesso administrativo ou físico à máquina.
 */

const crypto = require('crypto');

const PORTA_CONTROLADOR = '3001';
const PORTA_PROJECAO = '5510';

/** Páginas que podem ter uma janela autorizada (lista fechada). */
const PAGINAS_AUTORIZAVEIS = Object.freeze(['/controller.html', '/historico.html']);

const CONFIG_PADRAO = Object.freeze({
  origemPainel: `http://127.0.0.1:${PORTA_CONTROLADOR}`,
  hosts: Object.freeze(['127.0.0.1', 'localhost']),
  portas: Object.freeze([PORTA_CONTROLADOR, PORTA_PROJECAO]),
  tipos: Object.freeze(['xhr', 'ping']),
});

const PREFIXO_DEVICE = 'painel-local-';

function resumo(texto) {
  return crypto.createHash('sha256').update(String(texto), 'utf8').digest();
}

/* ───────────────────────── credencial ───────────────────────── */

/**
 * @param {object} [opcoes]
 * @param {(n: number) => Buffer} [opcoes.gerarBytes] só para teste; o padrão é `crypto.randomBytes`
 */
function criarCredencialInterna(opcoes = {}) {
  const gerarBytes = typeof opcoes.gerarBytes === 'function' ? opcoes.gerarBytes : crypto.randomBytes;
  const secret = gerarBytes(32).toString('hex');
  const deviceId = `${PREFIXO_DEVICE}${gerarBytes(8).toString('hex')}`;
  const resumoSecret = resumo(secret);
  const resumoDevice = resumo(deviceId);

  /**
   * Compara os DOIS campos sem curto-circuito, sempre com resumos SHA-256 (mesmo tamanho), para
   * não vazar comprimento nem qual campo errou.
   */
  function conferir(auth) {
    const a = auth && typeof auth === 'object' ? auth : {};
    const d = typeof a.deviceId === 'string' ? a.deviceId : '';
    const s = typeof a.secret === 'string' ? a.secret : '';
    const okDevice = crypto.timingSafeEqual(resumo(d), resumoDevice);
    const okSecret = crypto.timingSafeEqual(resumo(s), resumoSecret);
    return okDevice && okSecret && d !== '' && s !== '';
  }

  /** O id NÃO é segredo; serve para o verificador nunca o mandar à allowlist. */
  function ehDeviceInterno(id) {
    return typeof id === 'string' && id !== '' && crypto.timingSafeEqual(resumo(id), resumoDevice);
  }

  /**
   * Devolve uma CÓPIA dos cabeçalhos sem qualquer X-Lyra-Device/Secret anterior (em qualquer
   * caixa) e com os internos. Não muta a entrada. X-Lyra-App e o resto são preservados.
   */
  function aplicarAosCabecalhos(cabecalhos) {
    const saida = {};
    for (const [nome, valor] of Object.entries(cabecalhos || {})) {
      if (/^x-lyra-(device|secret)$/i.test(nome)) continue;
      saida[nome] = valor;
    }
    saida['X-Lyra-Device'] = deviceId;
    saida['X-Lyra-Secret'] = secret;
    return saida;
  }

  const api = {
    deviceId,
    conferir,
    ehDeviceInterno,
    aplicarAosCabecalhos,
  };
  // Nada que o segredo possa vazar por serialização ou inspeção.
  Object.defineProperty(api, 'toJSON', { value: () => '[credencial-interna]', enumerable: false });
  Object.defineProperty(api, 'toString', { value: () => '[credencial-interna]', enumerable: false });
  Object.defineProperty(api, Symbol.for('nodejs.util.inspect.custom'), {
    value: () => '[credencial-interna]',
    enumerable: false,
  });
  return Object.freeze(api);
}

/* ───────────────────────── política de injeção ───────────────────────── */

/**
 * Decide se uma requisição recebe a credencial. Pura: `detalhes` é o objeto de
 * `onBeforeSendHeaders` (`resourceType`, `method`, `url`, `webContentsId`, `frame`).
 *
 * @param {object} detalhes
 * @param {object} cfg
 * @param {{tem: (id: number) => boolean, paginaDe: (id: number) => (string|undefined)}} cfg.registro
 * @param {string} [cfg.origemPainel]
 * @param {Iterable<string>} [cfg.hosts]
 * @param {Iterable<string>} [cfg.portas]
 * @param {Iterable<string>} [cfg.tipos]
 * @returns {'injetar'|string} 'injetar' ou o motivo da recusa
 */
function decidirInjecao(detalhes, cfg) {
  const d = detalhes && typeof detalhes === 'object' ? detalhes : {};
  const c = cfg || {};
  const registro = c.registro;
  const origemPainel = c.origemPainel || CONFIG_PADRAO.origemPainel;
  const hosts = new Set(c.hosts || CONFIG_PADRAO.hosts);
  const portas = new Set(c.portas || CONFIG_PADRAO.portas);
  const tipos = new Set(c.tipos || CONFIG_PADRAO.tipos);

  if (d.resourceType === 'webSocket') return 'websocket';
  if (String(d.method || '').toUpperCase() === 'OPTIONS') return 'preflight';
  if (!tipos.has(d.resourceType)) return `tipo-${d.resourceType}`;
  if (d.webContentsId === undefined || d.webContentsId === null) return 'sem-webcontents';
  if (!registro || !registro.tem(d.webContentsId)) return 'janela-nao-autorizada';

  let u;
  try {
    u = new URL(d.url);
  } catch (_) {
    return 'url-invalida';
  }
  if (u.protocol !== 'http:') return 'protocolo';
  if (u.username || u.password) return 'credenciais-na-url';
  if (!hosts.has(u.hostname) || !portas.has(u.port)) return 'destino-nao-permitido';

  const f = d.frame;
  if (!f) return 'sem-frame';
  if (f.parent) return 'subframe';
  let fu;
  try {
    fu = new URL(f.url);
  } catch (_) {
    return 'frame-url-invalida';
  }
  if (fu.origin !== origemPainel || fu.pathname !== registro.paginaDe(d.webContentsId)) {
    return 'frame-nao-autorizado';
  }
  return 'injetar';
}

/* ───────────────────────── registro de janelas ───────────────────────── */

function criarRegistroJanelas() {
  /** webContentsId -> { papel, pagina, token } */
  const entradas = new Map();

  function _definir(id, { papel, pagina }) {
    const token = Symbol('registro');
    entradas.set(id, { papel, pagina, token });
    return token;
  }

  /**
   * Autoriza a janela `win` para a página exata `pagina`. A autorização cai quando a janela
   * fecha OU o seu webContents é destruído (janela substituída por «recarregar»).
   */
  function autorizar(win, { papel, pagina }) {
    if (!PAGINAS_AUTORIZAVEIS.includes(pagina)) throw new Error(`página não autorizável: ${pagina}`);
    const wc = win && win.webContents;
    const id = wc && wc.id;
    if (!Number.isInteger(id)) throw new Error('janela inválida para autorização');
    const token = _definir(id, { papel: String(papel || ''), pagina });
    const remover = () => {
      const atual = entradas.get(id);
      if (atual && atual.token === token) entradas.delete(id);
    };
    win.once('closed', remover);
    wc.once('destroyed', remover);
    return id;
  }

  return {
    autorizar,
    tem: (id) => entradas.has(id),
    paginaDe: (id) => (entradas.get(id) || {}).pagina,
    papelDe: (id) => (entradas.get(id) || {}).papel,
    tamanho: () => entradas.size,
    ids: () => [...entradas.keys()],
    _definir,
  };
}

/* ───────────────────────── verificador HTTP ───────────────────────── */

function ipDoRequest(req) {
  const bruto = String((req && req.socket && req.socket.remoteAddress) || '').trim();
  return bruto.startsWith('::ffff:') ? bruto.slice(7) : bruto;
}

function hostDoRequest(req) {
  const h = req && req.headers ? req.headers.host : '';
  const s = String(Array.isArray(h) ? h[0] : h || '').toLowerCase().trim();
  if (s.startsWith('[')) return s.slice(0, s.indexOf(']') + 1);
  return s.split(':')[0];
}

/**
 * Contexto local previsto: a conexão vem da própria máquina, o Host é de loopback (é o que a
 * política de injeção exige) e a requisição NÃO foi reencaminhada por um proxy do Lyra.
 */
function contextoLocal(req) {
  if (!req) return false;
  const ip = ipDoRequest(req);
  if (ip !== '127.0.0.1' && ip !== '::1') return false;
  const host = hostDoRequest(req);
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') return false;
  const via = req.headers ? req.headers['x-lyra-proxy'] : undefined;
  if (via !== undefined && via !== '') return false;
  return true;
}

/**
 * Envolve o verificador da allowlist com a credencial interna.
 *
 * - id interno: confere só com a credencial em memória, só no contexto local; NUNCA vai à allowlist.
 * - qualquer outro: delegado ao `verificarBase` (ou `null` = «não-verificável» se não houver).
 *
 * @param {object} p
 * @param {ReturnType<typeof criarCredencialInterna>|null} p.interna
 * @param {((auth: object, req?: object) => (object|null|undefined))|null} p.verificarBase
 * @returns {(auth: {deviceId: string, secret: string}, req?: object) => (object|null|undefined)}
 */
function criarVerificadorHttp({ interna, verificarBase }) {
  return function verificar(auth, req) {
    if (interna && auth && interna.ehDeviceInterno(auth.deviceId)) {
      if (contextoLocal(req) && interna.conferir(auth)) return { ok: true, classe: 'interna' };
      return { ok: false, classe: 'interna-recusada' };
    }
    return typeof verificarBase === 'function' ? verificarBase(auth, req) : null;
  };
}

/* ───────────────────────── Socket.IO ───────────────────────── */

/**
 * Guarda do handshake do Socket.IO: o par interno NUNCA autentica ali nem é inscrito por TOFU.
 * Qualquer outro `auth` segue para `autenticar` exatamente como antes (fluxo TOFU intacto). O
 * socket continua conectando como visualizador, igual a quem não tem credencial válida.
 *
 * @param {object} p
 * @param {ReturnType<typeof criarCredencialInterna>|null} p.interna
 * @param {(auth: object) => object} p.autenticar `controleAcesso.autenticar`
 */
function protegerSocket({ interna, autenticar }) {
  return function autenticarSocket(auth) {
    if (interna && auth && interna.ehDeviceInterno(auth.deviceId)) {
      return { ok: false, motivo: 'credencial-interna-recusada' };
    }
    return autenticar(auth);
  };
}

module.exports = {
  protegerSocket,
  criarCredencialInterna,
  decidirInjecao,
  criarRegistroJanelas,
  criarVerificadorHttp,
  contextoLocal,
  CONFIG_PADRAO,
  PAGINAS_AUTORIZAVEIS,
};
