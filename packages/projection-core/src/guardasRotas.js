'use strict';

/**
 * Guardas POR ROTA (Entrega 2) — NÃO são o modo `impor` geral da autenticação HTTP, que segue em
 * `registrar`. Cada guarda protege só as rotas em que é instalada, com a regra mais estreita que
 * não quebra o uso legítimo:
 *
 *  - `exigirCredencial`: credencial de dispositivo autorizado (ou interna do painel, ou elo) —
 *    para rotas sensíveis com clientes que HOJE já mandam credencial (painel, mobile atual);
 *  - `exigirLocalOuElo`: só da própria máquina (sem proxy) ou com o elo válido — DevTools;
 *  - `selecionarJson`: corpo GRANDE só para quem provou quem é (credencial verificada) ou vem da
 *    própria máquina; o resto cai no parser pequeno — o JSON de centenas de MB deixa de ser
 *    processado para qualquer estranho antes da checagem;
 *  - `limitarTaxa`: teto de escritas por IP (loopback isento), folgado para vídeo/áudio.
 *
 * Chave de desligamento (`desligadas`): o operador pode voltar ao comportamento anterior (ex.:
 * um mobile antigo sem credencial). É decisão de quem monta o servidor (variável de ambiente
 * lida UMA vez na partida); aqui só vale o booleano. Falha de qualquer verificador = recusa
 * (falha fechada), sem lançar.
 */

const MAX_CREDENCIAL = 256;
const CORPO_PEQUENO_PADRAO = 1024 * 1024;

const ehLoopback = (ip) => ip === '127.0.0.1' || ip === '::1';

function ipDe(req) {
  const b = String((req && req.socket && req.socket.remoteAddress) || '').trim();
  return b.startsWith('::ffff:') ? b.slice(7) : b;
}

function cab(req, nome) {
  const v = req && req.headers ? req.headers[nome] : undefined;
  return (Array.isArray(v) ? String(v[0] || '') : typeof v === 'string' ? v : '').trim().slice(0, MAX_CREDENCIAL);
}

const proxificada = (req) => cab(req, 'x-lyra-proxy') === '1';
/** Da própria máquina e NÃO repassada por proxy (o proxy do Servidor chega de 127.0.0.1 em nome de outro). */
const localDireta = (req) => ehLoopback(ipDe(req)) && !proxificada(req);

const idCurto = (id) => (id ? `${String(id).slice(0, 4)}…` : '');

/**
 * @param {object} p
 * @param {(auth: {deviceId: string, secret: string}, req: object) => ({ok: boolean, classe?: string}|null|undefined)} p.verificar
 * @param {(req: object, direcao: string) => ({ok: boolean, motivo?: string}|null|undefined)} [p.verificarElo]
 * @param {(evento: object) => void} [p.registrar]
 * @param {() => number} [p.agora]
 * @param {boolean} [p.desligadas]
 * @param {{janelaMs?: number, max?: number}} [p.taxa] padrão: 300 escritas por IP a cada 10 s
 * @param {number} [p.maxEventos] teto de eventos distintos registrados
 * @param {number} [p.maxIps] teto de IPs rastreados pelo limite de taxa
 */
function criarGuardasRotas({
  verificar, verificarElo = null, registrar = null, agora = Date.now, desligadas = false, taxa = {}, maxEventos = 300, maxIps = 5000,
}) {
  const janelaMs = Number.isFinite(taxa.janelaMs) ? taxa.janelaMs : 10000;
  const maxTaxa = Number.isFinite(taxa.max) ? taxa.max : 300;

  const vistos = new Set();
  function avisar(tipo, req, motivo, deviceId) {
    if (!registrar) return;
    const caminho = String(req.originalUrl || req.url || '').split('?')[0].slice(0, 120);
    const chave = [tipo, req.method, caminho, motivo, idCurto(deviceId)].join('|');
    if (vistos.has(chave) || vistos.size >= maxEventos) return;
    vistos.add(chave);
    try {
      registrar({ evento: 'guarda-rota', guarda: tipo, metodo: req.method, caminho, motivo, deviceId: idCurto(deviceId), ip: ipDe(req) });
    } catch (_) { /* registrar nunca derruba a requisição */ }
  }

  function credencialDe(req) {
    const deviceId = cab(req, 'x-lyra-device');
    const secret = cab(req, 'x-lyra-secret');
    return { deviceId, secret };
  }

  /** Veredito da credencial de dispositivo/interna: `{ok, classe}`; qualquer dúvida = não ok. */
  function veredito(req) {
    const auth = credencialDe(req);
    if (!auth.deviceId || !auth.secret) return { ok: false, classe: 'ausente', deviceId: auth.deviceId };
    let r = null;
    try { r = verificar(auth, req); } catch (_) { r = null; }
    if (!r || typeof r !== 'object' || typeof r.ok !== 'boolean') return { ok: false, classe: 'nao-verificavel', deviceId: auth.deviceId };
    return { ok: r.ok === true, classe: String(r.classe || (r.ok ? 'autorizado' : 'desconhecido')), deviceId: auth.deviceId };
  }

  function eloValido(req, direcao) {
    if (typeof verificarElo !== 'function') return false;
    try {
      const r = verificarElo(req, direcao);
      return !!(r && r.ok === true);
    } catch (_) {
      return false;
    }
  }

  function recusar(res, status, motivo, erro) {
    res.status(status).json({ ok: false, erro, motivo });
  }

  /** Rota sensível: exige dispositivo autorizado (ou interna) — e, se `aceitaElo`, o elo válido serve também. */
  function exigirCredencial({ aceitaElo = false } = {}) {
    return (req, res, next) => {
      if (desligadas) return next();
      const v = veredito(req);
      if (v.ok) return next();
      if (aceitaElo && eloValido(req, 'c→s')) return next();
      avisar('credencial', req, v.classe, v.deviceId);
      if (v.classe === 'pendente') return recusar(res, 403, 'pendente', 'Dispositivo aguardando aprovação.');
      return recusar(res, 401, v.classe, 'Credencial do dispositivo ausente ou inválida.');
    };
  }

  /** Rota local (ex.: DevTools): só da própria máquina, sem proxy, ou com o elo válido. */
  function exigirLocalOuElo() {
    return (req, res, next) => {
      if (desligadas) return next();
      if (localDireta(req)) return next();
      if (eloValido(req, 'c→s')) return next();
      avisar('local-ou-elo', req, 'somente-local', '');
      return recusar(res, 403, 'somente-local', 'Esta operação só é permitida a partir da própria máquina.');
    };
  }

  /** Escolhe o parser de corpo ANTES de ler o corpo (grande só para quem provou quem é). */
  function selecionarJson({ pequeno, grande }) {
    return (req, res, next) => {
      if (desligadas) return grande(req, res, next);
      if (localDireta(req) || veredito(req).ok) return grande(req, res, next);
      return pequeno(req, res, next);
    };
  }

  /** Middleware de erro: corpo acima do limite vira 413 em JSON. */
  function tratarErroCorpo(err, req, res, next) {
    if (err && err.type === 'entity.too.large') {
      avisar('corpo', req, 'corpo-grande-demais', cab(req, 'x-lyra-device'));
      return recusar(res, 413, 'corpo-grande-demais', 'Corpo da requisição grande demais para quem não se identificou.');
    }
    return next(err);
  }

  /** ip -> { inicio, total } da janela corrente */
  const janelas = new Map();
  function limitarTaxa() {
    return (req, res, next) => {
      if (desligadas) return next();
      const m = String(req.method || 'GET').toUpperCase();
      if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();
      if (localDireta(req)) return next();
      const t = agora();
      const ip = ipDe(req);
      let j = janelas.get(ip);
      if (!j || t - j.inicio >= janelaMs) {
        j = { inicio: t, total: 0 };
        janelas.delete(ip);
        janelas.set(ip, j);
        while (janelas.size > maxIps) janelas.delete(janelas.keys().next().value);
      }
      j.total += 1;
      if (j.total > maxTaxa) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((j.inicio + janelaMs - t) / 1000))));
        avisar('taxa', req, 'muitas-requisicoes', '');
        return recusar(res, 429, 'muitas-requisicoes', 'Muitas requisições em pouco tempo.');
      }
      return next();
    };
  }

  return Object.freeze({
    exigirCredencial, exigirLocalOuElo, selecionarJson, tratarErroCorpo, limitarTaxa,
    CORPO_PEQUENO_PADRAO, _diagnostico: () => ({ ips: janelas.size, eventos: vistos.size }),
  });
}

/**
 * Guardas de EVENTOS de Socket.IO (Entrega 2): só dispositivo autorizado e intervalo mínimo entre
 * usos (por socket ou global). Puro: o relógio é injetado.
 */
function criarGuardasSocket({ agora = Date.now } = {}) {
  /** chave -> último uso (global) */
  const globais = new Map();

  /** O socket foi autenticado e autorizado no handshake? (visualizador sem credencial: não) */
  const soAutorizado = (socket) => !!(socket && socket.data && socket.data.autorizado === true);

  /** Já passou `ms` desde o último `marcarGlobal(chave)`? Não marca. */
  const permitidoGlobal = (chave, ms) => agora() - (globais.get(chave) || 0) >= ms;
  const marcarGlobal = (chave) => { globais.set(chave, agora()); };

  /** Consome uma «vez» por socket: devolve true e marca, ou false se o intervalo ainda não passou. */
  function consumirPorSocket(socket, chave, ms) {
    if (!socket) return false;
    if (!socket.data) socket.data = {};
    const usos = socket.data.usosGuarda || (socket.data.usosGuarda = {});
    const t = agora();
    if (t - (usos[chave] || 0) < ms) return false;
    usos[chave] = t;
    return true;
  }

  return Object.freeze({ soAutorizado, permitidoGlobal, marcarGlobal, consumirPorSocket });
}

module.exports = { criarGuardasRotas, criarGuardasSocket, CORPO_PEQUENO_PADRAO };
