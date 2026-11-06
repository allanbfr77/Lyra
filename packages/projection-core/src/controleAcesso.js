'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Controle de acesso do servidor Lyra — duas camadas ortogonais:
 *
 *  1) AUTENTICAÇÃO (quem pode conectar): allowlist de credenciais por dispositivo.
 *     Cada instalação do controller gera um `deviceId` + `secret` na primeira execução
 *     (ver controller/src/lib/deviceIdentidade.js). O servidor guarda uma allowlist
 *     `{ deviceId -> { secret, nome, aprovadoEm } }`. Só entra quem tem credencial válida.
 *     deviceId sozinho é identificador; o `secret` torna a credencial não-forjável.
 *
 *  2) AUTORIZAÇÃO (quem pode COMANDAR): write-lock de controlador primário.
 *     Só UM controlador tem o "bastão" de escrita por vez (`primarioSocketId`).
 *     Os demais ficam em modo somente-leitura: recebem estado/preview, mas seus
 *     comandos de escrita são recusados. Isso impede que abrir um segundo controlador
 *     "roube" a projeção. A passagem do bastão é explícita (forcarAssumir).
 *
 *  Heartbeat: o `disconnect` do Socket.io é lento e nem sempre dispara com PC dormindo
 *  ou app congelado. Contamos PONGs perdidos CONSECUTIVOS (não tempo absoluto) — um
 *  engasgo isolado de rede não libera o bastão; só a ausência sustentada de resposta.
 *
 *  Válvula de escape: `forcarAssumir` permite a um humano no PC do servidor quebrar o
 *  lock na hora, sem depender de timeout nenhum. É o "breaker manual" para o pior momento.
 *
 * Este módulo é puro (sem Socket.io): recebe callbacks e é dirigido pelo httpServer.js.
 * Ver docs/arquitetura-controle-estado-acesso.md para os pontos de integração.
 */

// ------------------------------------------------------------------ allowlist

/** Carrega a allowlist `{ devices: { [deviceId]: {...} }, modo }`. */
/** Modos de política de acesso. */
const MODOS = new Set(['tofu', 'locked', 'aberto']);

function carregarAllowlist(caminhoFn) {
  try {
    const raw = fs.readFileSync(caminhoFn(), 'utf8');
    const d = JSON.parse(raw);
    if (d && typeof d === 'object' && d.devices && typeof d.devices === 'object') {
      return { modo: MODOS.has(d.modo) ? d.modo : 'tofu', devices: d.devices };
    }
  } catch (_) {
    // intencional — arquivo ausente na primeira execução
  }
  // Padrão 'tofu' (trust-on-first-use): o 1º acesso de cada dispositivo é auto-inscrito e
  // lembrado — zero fricção para inscrever os PCs conhecidos. Depois de inscritos, o operador
  // "trava" (modo 'locked') e novos dispositivos ficam pendentes até aprovação manual.
  // 'aberto' = qualquer um autoriza (apenas testes).
  return { modo: 'tofu', devices: {} };
}

/** Grava a allowlist (síncrono; muda com pouca frequência — aprovar/revogar dispositivo). */
function salvarAllowlist(caminhoFn, allowlist) {
  const destino = caminhoFn();
  const tmp = `${destino}.tmp`;
  try {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
  } catch (_) {
    // intencional
  }
  fs.writeFileSync(tmp, JSON.stringify(allowlist, null, 2), 'utf8');
  fs.renameSync(tmp, destino);
}

/**
 * Comparação de segredos em tempo constante (evita timing attack — barato de fazer certo).
 * @returns {boolean}
 */
function segredosConferem(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ------------------------------------------------------------ gestor principal

/**
 * @param {object} deps
 * @param {() => string} deps.allowlistPath      Caminho do arquivo da allowlist.
 * @param {(evt: string, dados: object) => void} [deps.notificar]  Notifica a UI do servidor
 *        (ex.: "novo controlador", "bastão passou", "dispositivo pendente"). Opcional.
 * @param {(id: string, evt: string, dados?: object) => void} deps.emitParaSocket  Emite um
 *        evento para um socket específico (normalmente `ctx.io.to(id).emit`).
 * @param {(evt: string, dados?: object) => void} [deps.broadcast]  Broadcast para todos.
 * @param {object} [deps.opcoes]
 * @param {number} [deps.opcoes.pingIntervaloMs=4000]   Período do ping de aplicação.
 * @param {number} [deps.opcoes.maxFalhasConsecutivas=3] PONGs perdidos seguidos p/ liberar o bastão.
 */
function criarControleAcesso(deps) {
  const {
    allowlistPath,
    notificar = () => {},
    emitParaSocket,
    broadcast = () => {},
    opcoes = {},
  } = deps;

  const pingIntervaloMs = Number.isFinite(opcoes.pingIntervaloMs) ? opcoes.pingIntervaloMs : 4000;
  const maxFalhas = Number.isFinite(opcoes.maxFalhasConsecutivas) ? opcoes.maxFalhasConsecutivas : 3;

  let allowlist = carregarAllowlist(allowlistPath);

  /** socketId -> { deviceId, nome, ip, falhas, ultimoPong } dos controladores conectados. */
  const controladores = new Map();
  /** socketId do controlador primário (dono do bastão de escrita) ou null. */
  let primarioSocketId = null;
  /**
   * deviceIds revogados desde que o processo iniciou. Só serve para o log HTTP distinguir
   * «revogado» de «desconhecido» (a revogação apaga a entrada da allowlist). Não é
   * persistido de propósito: não altera o formato do arquivo; some ao reiniciar.
   */
  const revogadosNestaSessao = new Set();
  /** Handle do setInterval do heartbeat. */
  let heartbeatTimer = null;

  // ---------------------------------------------------------------- autenticação

  /**
   * Valida a credencial vinda do handshake (`socket.handshake.auth`).
   * Use dentro de `io.use((socket, next) => ...)` — NÃO bloqueia a conexão; devolve se o
   * socket está autorizado a ESCREVER. Visualizadores sem credencial (OBS, telão, mobile
   * apenas vendo) conectam normalmente com `ok:false` e ficam somente-leitura.
   * @returns {{ ok: true, device: object } | { ok: false, motivo: string, pendente?: boolean }}
   */
  function autenticar(auth = {}) {
    const deviceId = String(auth.deviceId || '').trim();
    const secret = String(auth.secret || '').trim();

    if (allowlist.modo === 'aberto') {
      return { ok: true, device: { deviceId: deviceId || 'anon', nome: String(auth.nome || '') } };
    }
    // Sem credencial → visualizador (não autorizado a escrever), mas conecta.
    if (!deviceId || !secret) {
      return { ok: false, motivo: 'credencial-ausente' };
    }
    const reg = allowlist.devices[deviceId];
    if (reg) {
      if (!segredosConferem(reg.secret, secret)) {
        return { ok: false, motivo: 'secret-invalido' };
      }
      if (reg.pendente) {
        notificar('dispositivo_pendente', { deviceId, nome: reg.nome || '' });
        return { ok: false, motivo: 'nao-aprovado', pendente: true };
      }
      return { ok: true, device: { deviceId, nome: reg.nome || String(auth.nome || '') } };
    }
    // Dispositivo desconhecido:
    const nome = String(auth.nome || '');
    if (allowlist.modo === 'tofu') {
      // Trust-on-first-use: auto-inscreve e autoriza (inscrição dos PCs conhecidos sem fricção).
      allowlist.devices[deviceId] = {
        secret,
        nome,
        aprovadoEm: new Date().toISOString(),
        pendente: false,
      };
      salvarAllowlist(allowlistPath, allowlist);
      notificar('dispositivo_autoinscrito', { deviceId, nome });
      return { ok: true, device: { deviceId, nome } };
    }
    // 'locked': fica pendente até aprovação manual do operador.
    allowlist.devices[deviceId] = { secret, nome, aprovadoEm: null, pendente: true };
    salvarAllowlist(allowlistPath, allowlist);
    notificar('dispositivo_pendente', { deviceId, nome });
    return { ok: false, motivo: 'nao-aprovado', pendente: true };
  }

  /**
   * Verificação PURA da credencial, para a API HTTP (E1.3).
   *
   * Diferença essencial para `autenticar`: aqui NADA muda. Não inscreve (TOFU), não cria
   * registro pendente, não grava a allowlist, não notifica, não altera o modo. Quem
   * inscreve dispositivos continua sendo apenas o handshake do Socket.IO — uma requisição
   * HTTP jamais pode mudar o estado de autorização de ninguém.
   *
   * @returns {{ ok: boolean, classe: 'autorizado'|'aberto'|'pendente'|'desconhecido'|'revogado'|'secret-invalido'|'ausente', device?: object }}
   */
  function verificarCredencial(auth) {
    const a = auth && typeof auth === 'object' ? auth : {};
    const deviceId = String(a.deviceId || '').trim();
    const secret = String(a.secret || '').trim();

    if (allowlist.modo === 'aberto') {
      return { ok: true, classe: 'aberto', device: { deviceId: deviceId || 'anon', nome: String(a.nome || '') } };
    }
    if (!deviceId || !secret) return { ok: false, classe: 'ausente' };

    const reg = Object.prototype.hasOwnProperty.call(allowlist.devices, deviceId)
      ? allowlist.devices[deviceId]
      : null;
    if (!reg) {
      return { ok: false, classe: revogadosNestaSessao.has(deviceId) ? 'revogado' : 'desconhecido' };
    }
    if (!segredosConferem(reg.secret, secret)) return { ok: false, classe: 'secret-invalido' };
    if (reg.pendente) return { ok: false, classe: 'pendente' };
    return { ok: true, classe: 'autorizado', device: { deviceId, nome: reg.nome || '' } };
  }

  /** Modo atual da política de acesso ('tofu' | 'locked' | 'aberto'). */
  function getModo() {
    return allowlist.modo;
  }

  /**
   * "Trava" a allowlist: sai do TOFU e passa a exigir aprovação manual de novos dispositivos.
   * Chame depois de inscrever os PCs conhecidos. Os já inscritos continuam autorizados.
   */
  function travar() {
    allowlist.modo = 'locked';
    salvarAllowlist(allowlistPath, allowlist);
    notificar('allowlist_travada', { total: Object.keys(allowlist.devices).length });
  }

  /** Volta ao modo TOFU (auto-inscrição) — ex.: para inscrever um PC novo sem digitar nada. */
  function destravar() {
    allowlist.modo = 'tofu';
    salvarAllowlist(allowlistPath, allowlist);
    notificar('allowlist_destravada', {});
  }

  /** Operador aprova (uma vez) um dispositivo pendente. Chame a partir de um botão na UI do servidor. */
  function aprovarDispositivo(deviceId) {
    const reg = allowlist.devices[deviceId];
    if (!reg) return false;
    reg.pendente = false;
    reg.aprovadoEm = new Date().toISOString();
    salvarAllowlist(allowlistPath, allowlist);
    notificar('dispositivo_aprovado', { deviceId, nome: reg.nome });
    return true;
  }

  /** Revoga o acesso de um dispositivo (ex.: máquina descomissionada). */
  function revogarDispositivo(deviceId) {
    if (!allowlist.devices[deviceId]) return false;
    delete allowlist.devices[deviceId];
    revogadosNestaSessao.add(deviceId);
    salvarAllowlist(allowlistPath, allowlist);
    notificar('dispositivo_revogado', { deviceId });
    return true;
  }

  function listarDispositivos() {
    return Object.entries(allowlist.devices).map(([deviceId, v]) => ({
      deviceId,
      nome: v.nome || '',
      pendente: !!v.pendente,
      aprovadoEm: v.aprovadoEm || null,
    }));
  }

  // ---------------------------------------------------------------- write-lock

  /** Registra um controlador conectado. O PRIMEIRO a registrar assume o bastão automaticamente. */
  function registrarControlador(socketId, info = {}) {
    controladores.set(socketId, {
      deviceId: info.deviceId || '',
      nome: info.nome || '',
      ip: info.ip || '',
      falhas: 0,
      /** true = ping enviado no ciclo anterior e ainda sem PONG. Base da contagem de falhas. */
      aguardandoPong: false,
    });
    // "Server autoritativo": o primeiro que chega comanda; ninguém sobrescreve o vigente.
    if (!primarioSocketId) {
      primarioSocketId = socketId;
      anunciarPapeis();
    } else {
      // Novo controlador entra em somente-leitura — informa só a ele.
      emitParaSocket(socketId, 'papel_controlador', papelDe(socketId));
    }
    notificar('controlador_conectado', { socketId, ...info, primario: socketId === primarioSocketId });
  }

  /** Remove um controlador (disconnect real). Se era o primário, o bastão fica livre. */
  function removerControlador(socketId) {
    const era = controladores.get(socketId);
    controladores.delete(socketId);
    if (socketId === primarioSocketId) {
      primarioSocketId = null;
      liberarBastao(era);
    }
  }

  /** Bastão livre → o controlador mais antigo ainda conectado o assume (ou fica sem primário). */
  function liberarBastao(anterior) {
    const proximo = controladores.keys().next();
    primarioSocketId = proximo.done ? null : proximo.value;
    notificar('bastao_liberado', {
      anterior: anterior ? anterior.nome || anterior.deviceId : null,
      novo: primarioSocketId ? nomeDe(primarioSocketId) : null,
    });
    anunciarPapeis();
  }

  /**
   * Guarda de escrita: chame no INÍCIO de cada handler de comando que altera o estado.
   * @returns {boolean} true se o socket pode escrever; false → comando deve ser ignorado.
   */
  function podeEscrever(socketId) {
    if (allowlist.modo === 'aberto') return true; // modo de teste
    return socketId === primarioSocketId;
  }

  /**
   * FONTE ÚNICA do direito de escrita (E1.3 C2): porta 1 «autorizado» + porta 2 «bastão».
   *
   * Duas vias, a mesma regra:
   *  - via SOCKET (`socketId`): sabe exatamente quem é; é o que o `comandoAutorizado` do Socket.IO
   *    sempre fez (a decisão é idêntica à anterior).
   *  - via DISPOSITIVO (`deviceId`, usada pela observação HTTP): a requisição HTTP traz credencial
   *    de dispositivo, não de socket. O mesmo `deviceId` pode ter VÁRIOS sockets registrados
   *    (duas janelas do mesmo PC), e a credencial não diz qual deles enviou a requisição. Quando
   *    isso torna a resposta incerta (há um primário entre vários sockets do dispositivo), devolve
   *    `ambigua: true` e `permitido: null` — nunca finge uma equivalência que não existe.
   *
   * Motivos: `nao-autorizado` (porta 1), `somente-leitura` (porta 2), `isento` (autorizado, mas
   * sem controlador registrado: mobile/OBS, como sempre), `ok` (é o dono do bastão), `ambiguo` e
   * `identidade-ausente` (só via dispositivo / sem identidade).
   *
   * PURA: não altera a allowlist, não inscreve, não notifica e não mexe no primário.
   *
   * @param {{socketId?: string, deviceId?: string, autorizado?: boolean}} [p]
   *        `autorizado` precisa ser estritamente `true` (o socket: `socket.data.autorizado`; HTTP:
   *        veredito de `verificarCredencial`).
   * @returns {{permitido: (boolean|null), motivo: string, donoAtual: (string|null), ambigua: boolean, via: ('socket'|'dispositivo'), candidatos?: number}}
   */
  function avaliarEscrita(p = {}) {
    const { socketId, deviceId, autorizado } = p || {};
    const donoDoBastao = () => (primarioSocketId ? nomeDe(primarioSocketId) : null);
    const via = socketId !== undefined && socketId !== null && socketId !== '' ? 'socket' : 'dispositivo';

    // Porta 1 — só dispositivo/socket autorizado escreve. Vale para todos, registrados ou não.
    if (autorizado !== true) {
      return { permitido: false, motivo: 'nao-autorizado', donoAtual: null, ambigua: false, via };
    }

    if (via === 'socket') {
      if (controladores.has(socketId)) {
        if (!podeEscrever(socketId)) {
          return { permitido: false, motivo: 'somente-leitura', donoAtual: papelDe(socketId).donoAtual, ambigua: false, via };
        }
        return { permitido: true, motivo: 'ok', donoAtual: donoDoBastao(), ambigua: false, via };
      }
      return { permitido: true, motivo: 'isento', donoAtual: donoDoBastao(), ambigua: false, via };
    }

    // Via dispositivo (HTTP). Sem identidade nenhuma não há o que avaliar.
    const id = String(deviceId || '').trim();
    if (!id) return { permitido: null, motivo: 'identidade-ausente', donoAtual: null, ambigua: false, via };

    const sockets = [];
    for (const [sid, info] of controladores) if (info.deviceId === id) sockets.push(sid);
    if (sockets.length === 0) {
      return { permitido: true, motivo: 'isento', donoAtual: donoDoBastao(), ambigua: false, via };
    }
    if (allowlist.modo === 'aberto') {
      return { permitido: true, motivo: 'ok', donoAtual: donoDoBastao(), ambigua: false, via };
    }
    const comOBastao = sockets.includes(primarioSocketId);
    if (sockets.length === 1) {
      return comOBastao
        ? { permitido: true, motivo: 'ok', donoAtual: donoDoBastao(), ambigua: false, via }
        : { permitido: false, motivo: 'somente-leitura', donoAtual: donoDoBastao(), ambigua: false, via };
    }
    // Vários sockets do mesmo dispositivo.
    if (comOBastao) {
      return { permitido: null, motivo: 'ambiguo', donoAtual: donoDoBastao(), ambigua: true, via, candidatos: sockets.length };
    }
    // Nenhum deles é o primário: qualquer um que tenha enviado é secundário → recusa é certa.
    return { permitido: false, motivo: 'somente-leitura', donoAtual: donoDoBastao(), ambigua: false, via };
  }

  /**
   * Passagem explícita do bastão (o "forçar assumir" / breaker manual).
   * Deve ser acionado por confirmação humana — no PC do servidor (recomendado) ou via
   * fluxo de request/approve entre controladores. Não depende do heartbeat.
   */
  function forcarAssumir(novoSocketId) {
    if (!controladores.has(novoSocketId)) return false;
    const anterior = primarioSocketId;
    primarioSocketId = novoSocketId;
    notificar('bastao_forcado', {
      anterior: anterior ? nomeDe(anterior) : null,
      novo: nomeDe(novoSocketId),
    });
    anunciarPapeis();
    return true;
  }

  function papelDe(socketId) {
    return {
      primario: socketId === primarioSocketId,
      podeEscrever: podeEscrever(socketId),
      donoAtual: primarioSocketId ? nomeDe(primarioSocketId) : null,
    };
  }

  function nomeDe(socketId) {
    const c = controladores.get(socketId);
    return c ? c.nome || c.deviceId || socketId : socketId;
  }

  /** Informa a TODOS os controladores quem é o primário agora (atualiza a UI: "PC 3 no controle"). */
  function anunciarPapeis() {
    for (const socketId of controladores.keys()) {
      emitParaSocket(socketId, 'papel_controlador', papelDe(socketId));
    }
    broadcast('controle_status', {
      donoAtual: primarioSocketId ? nomeDe(primarioSocketId) : null,
    });
  }

  // ---------------------------------------------------------------- heartbeat

  /**
   * Registra a chegada de um PONG. Zera o contador de falhas CONSECUTIVAS — este é o
   * ponto que impede um engasgo isolado (1 perdido, 1 ok, ...) de acumular como se fosse
   * uma queda sustentada: qualquer PONG reseta a contagem.
   */
  function registrarPong(socketId) {
    const c = controladores.get(socketId);
    if (!c) return;
    c.aguardandoPong = false;
    c.falhas = 0;
  }

  /**
   * Um ciclo do heartbeat (extraído para ser testável sem relógio real).
   * Semântica por ciclo, para cada controlador:
   *  - se estava aguardando PONG do ciclo anterior e ele NÃO chegou → falha += 1;
   *  - ao atingir `maxFalhas` consecutivas → considera morto (remove; libera bastão se era primário);
   *  - caso contrário, envia novo `ping_app` e passa a aguardar o PONG.
   * A primeira volta nunca conta falha (ainda não houve ping) — só arma o aguardo.
   * @returns {string[]} socketIds considerados mortos neste ciclo (útil para testes/log).
   */
  function _cicloHeartbeat() {
    const mortos = [];
    for (const [socketId, c] of controladores.entries()) {
      if (c.aguardandoPong) {
        // Enviamos um ping no ciclo anterior e nenhum PONG chegou desde então.
        c.falhas += 1;
        if (c.falhas >= maxFalhas) {
          notificar('controlador_sem_resposta', { socketId, nome: c.nome, falhas: c.falhas });
          mortos.push(socketId);
          removerControlador(socketId);
          continue;
        }
      }
      emitParaSocket(socketId, 'ping_app', { t: Date.now() });
      c.aguardandoPong = true;
    }
    return mortos;
  }

  /** Inicia o ping de aplicação periódico. Cada disparo é um `_cicloHeartbeat`. */
  function iniciarHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(_cicloHeartbeat, pingIntervaloMs);
    if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
  }

  function pararHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  return {
    // autenticação
    autenticar,
    verificarCredencial,
    aprovarDispositivo,
    revogarDispositivo,
    listarDispositivos,
    getModo,
    travar,
    destravar,
    // write-lock
    registrarControlador,
    removerControlador,
    podeEscrever,
    avaliarEscrita,
    forcarAssumir,
    papelDe,
    getPrimarioSocketId: () => primarioSocketId,
    /** true se o socket se registrou como controlador (mobile/OBS não registram). */
    estaRegistrado: (socketId) => controladores.has(socketId),
    // heartbeat
    registrarPong,
    iniciarHeartbeat,
    pararHeartbeat,
    /** Exposto para testes determinísticos (dispara um ciclo sem esperar o timer). */
    _cicloHeartbeat,
  };
}

module.exports = { criarControleAcesso, segredosConferem };
