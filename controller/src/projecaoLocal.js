'use strict';

const http = require('http');
const express = require('express');
const { BrowserWindow, screen } = require('electron');
const {
  createProjectionEngine,
  criarArmazemDeProjecao,
  criarAplicadorDeComandos,
  estadoBibliaParaObs,
  paginaProjecao,
  paginaObs,
  alvosDaDifusao,
  displayConfigModo,
  localIp,
} = require('@lyra/projection-core');
const { caminhoIconeApp } = require('./lib/iconPath');

const { getPreferredLocalIPv4 } = localIp;

/** A mesma porta do Servidor — e é isso que faz dela a guarda do invariante. */
const PORTA_PROJECAO = 5510;
const PORTA_OBS = 5001;

/**
 * Projeção na própria máquina do operador.
 *
 * ## O que isto é, e o que não é
 *
 * Não é «o motor sem servidor». O OBS e o app de celular são clientes Socket.IO da porta
 * 5510 e falam o vocabulário de projeção; tirar-lhes o servidor tirar-lhes-ia a projeção.
 * O que muda no modo local não é a existência da porta 5510 — é quem a atende, e por onde
 * o painel fala com o motor: por IPC, dentro do mesmo processo, em vez de pela rede.
 *
 * ```
 *   modo remoto                          modo local
 *   ───────────                          ──────────
 *   painel ──socket──► Servidor          painel ──IPC──► Controlador (este módulo)
 *   OBS    ──socket──► :5510             OBS    ──socket──► :5510
 *   celular ─socket──►                   celular ─socket──►
 * ```
 *
 * ## A porta como guarda de «um só dono»
 *
 * Duas instâncias a comandar as mesmas telas é o defeito que esta refatoração existe para
 * impedir. A defesa não é uma flag: é o `EADDRINUSE`. Se o Servidor já estiver de pé nesta
 * rede, o `listen` falha e o modo local recusa-se a arrancar, em vez de disputar as telas
 * com ele. Um sistema operativo a dizer «já está ocupado» é mais fiável do que qualquer
 * coordenação que escrevêssemos.
 */
function criarProjecaoLocal(deps) {
  const { paths, logError, buscarMusicaPorId, aoEmitirParaPainel } = deps;

  let io = null;
  let servidorApi = null;
  let servidorObs = null;
  let engine = null;
  let aplicador = null;
  let store = null;
  let activa = false;

  const registarErro = typeof logError === 'function' ? logError : () => {};

  /**
   * Difunde os eventos do aplicador.
   *
   * A diferença essencial face ao Servidor está aqui: o painel do operador não está do
   * outro lado de um socket, mas na mesma aplicação. Ele recebe por IPC; OBS e celular
   * recebem pela 5510. `ALCANCE_OUTROS` significa «todos menos a origem» — e quando a
   * origem é o próprio painel, é o painel que fica de fora.
   *
   * @param {Array<{nome: string, dados: any, alcance: string}>} eventos
   * @param {object|null} origemSocket socket que originou; `null` quando veio do painel
   */
  function difundir(eventos, origemSocket) {
    for (const ev of eventos) {
      const alvos = alvosDaDifusao(ev, !!origemSocket);
      try {
        if (alvos.painel && typeof aoEmitirParaPainel === 'function') {
          aoEmitirParaPainel(ev.nome, ev.dados);
        }
      } catch (e) {
        registarErro(`projecao-local-painel-${ev.nome}`, e);
      }
      try {
        if (!io || !alvos.clientes) continue;
        if (alvos.excluirOrigemNaRede) origemSocket.broadcast.emit(ev.nome, ev.dados);
        else io.emit(ev.nome, ev.dados);
      } catch (e) {
        registarErro(`projecao-local-difundir-${ev.nome}`, e);
      }
    }
  }

  /**
   * Ponto único de entrada de comandos, venha o comando do painel ou da rede.
   *
   * É deliberado que não haja dois caminhos: o que o OBS e o celular conseguem pedir é
   * exactamente o que o painel consegue pedir, com a mesma regra a decidir. Um segundo
   * caminho «só para o painel» seria a duplicação que a extração do aplicador desfez.
   *
   * @param {string} comando
   * @param {any} dados
   * @param {object|null} [origemSocket]
   */
  async function receberComando(comando, dados, origemSocket = null) {
    if (!activa || !aplicador) return { ok: false, erro: 'projeção local inactiva' };
    if (!aplicador.suporta(comando)) return { ok: false, erro: `comando desconhecido: ${comando}` };
    try {
      const prontos = await aplicador.preparar(comando, dados);
      const { eventos, aplicado } = aplicador.aplicar(comando, prontos);
      difundir(eventos, origemSocket);
      return { ok: true, aplicado };
    } catch (e) {
      registarErro(`projecao-local-${comando}`, e);
      return { ok: false, erro: e.message || String(e) };
    }
  }

  /**
   * Estado inicial que um cliente novo (OBS, celular) precisa de receber ao ligar.
   *
   * Os três eventos são os mesmos que o Servidor envia na conexão, e a lista não é
   * arbitrária: `obs.html` assina `display_config` e sem ele desenharia com a tipografia
   * por omissão até alguém gravar a configuração — um overlay com a fonte errada no meio
   * do culto, sem erro nenhum a apontar a causa.
   */
  function estadoParaClienteNovo() {
    return {
      estado: engine.estadoPublicoParaSocketsOuApi(),
      estado_biblia_obs: estadoBibliaParaObs(store),
      display_config: displayConfigModo.resolverConfigParaJanelas(store),
    };
  }

  function montarServidores() {
    const apiApp = express();
    apiApp.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    });
    servidorApi = http.createServer(apiApp);

    const { Server } = require('socket.io');
    io = new Server(servidorApi, {
      cors: { origin: '*' },
      /* Base64 grandes no socket derrubavam o transporte em silêncio ao projetar mídia. */
      maxHttpBufferSize: Math.max(Number(process.env.SOCKET_MAX_BUFFER_MB || 110), 110) * 1024 * 1024,
    });

    io.on('connection', (socket) => {
      const inicial = estadoParaClienteNovo();
      socket.emit('estado', inicial.estado);
      socket.emit('estado_biblia_obs', inicial.estado_biblia_obs);
      socket.emit('display_config', inicial.display_config);

      for (const comando of aplicador.comandos) {
        socket.on(comando, (dados, ack) => {
          void receberComando(comando, dados, socket).then((r) => {
            if (typeof ack === 'function') ack(r);
          });
        });
      }
    });

    /* Overlays do OBS, servidos das páginas do Core. */
    const obsApp = express();
    obsApp.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    });
    obsApp.get('/obs', (_req, res) => res.sendFile(paginaObs('obs.html')));
    obsApp.get('/obs/biblia', (_req, res) => res.sendFile(paginaObs('obs-biblia.html')));
    obsApp.get('/obs/slides', (_req, res) => res.sendFile(paginaObs('obs-slides.html')));
    servidorObs = http.createServer(obsApp);
  }

  function escutar(servidor, porta) {
    return new Promise((resolve, reject) => {
      servidor.once('error', reject);
      servidor.listen(porta, '0.0.0.0', () => {
        servidor.removeListener('error', reject);
        resolve();
      });
    });
  }

  /**
   * Liga a projeção nesta máquina.
   *
   * @returns {Promise<{ ok: boolean, erro?: string, lanIp?: string }>}
   */
  async function ligar() {
    if (activa) return { ok: true, lanIp: getPreferredLocalIPv4() };
    try {
      return await ligarInterno();
    } catch (e) {
      /* Sem este `catch`, uma falha em montar o motor ou os servidores rejeitava o
         `invoke` do IPC e o painel ficava sem resposta nenhuma — só via a mensagem do
         auto-reconectar, que apontava para o lado errado do problema. */
      registarErro('projecao-local-ligar', e);
      await desligar();
      return { ok: false, erro: explicarFalhaAoLigar(e) };
    }
  }

  /**
   * Traduz falhas de arranque em algo accionável.
   *
   * O `socket.io` é dependência nova do Controlador (o modo local hospeda a 5510). Num
   * checkout sem `npm install` o `require` falha, e a mensagem crua do Node não diz ao
   * operador o que fazer.
   */
  function explicarFalhaAoLigar(e) {
    const msg = e?.message || String(e);
    if (e?.code === 'MODULE_NOT_FOUND' && /socket\.io/.test(msg)) {
      return 'Falta instalar as dependências do Controlador (socket.io). Rode `npm install` na pasta controller/ e reabra o app.';
    }
    return msg;
  }

  async function ligarInterno() {
    store = criarArmazemDeProjecao();
    engine = createProjectionEngine(paths, {
      logError: registarErro,
      screen,
      BrowserWindow,
      state: store,
      onProjecaoEncerrada: (ev) => {
        /* ESC numa janela física encerra a projeção. Quem carregou já vê o resultado nas
           telas; o painel e os clientes de rede precisam de saber que aconteceu. */
        difundir(
          [{ nome: 'estado', dados: ev?.estadoPublico, alcance: 'todos' }],
          null
        );
      },
      /* Sem Servidor não há «operador conectado» noutra máquina: o operador é quem está
         a olhar para este painel. */
      haOperadorConectado: () => true,
      resolverPaginaProjecao: paginaProjecao,
      caminhoIconeApp,
    });

    aplicador = criarAplicadorDeComandos({
      state: store,
      engine,
      logError: registarErro,
      displayConfigPath: paths.displayConfigPath,
      /* O banco está nesta máquina: nada de HTTP ao Controlador, porque o Controlador
         somos nós. É a dependência que inverte de sentido no modo local. */
      buscarMusicaPorId,
      /* Os telões são desta máquina; `127.0.0.1` alcança-os. Não há nada a reescrever. */
      reescreverSrcMidia: (src) => src,
    });

    montarServidores();

    try {
      await escutar(servidorApi, PORTA_PROJECAO);
    } catch (e) {
      await desligar();
      const ocupada = e && e.code === 'EADDRINUSE';
      return {
        ok: false,
        erro: ocupada
          ? `A porta ${PORTA_PROJECAO} já está ocupada — provavelmente o app Servidor está aberto. Feche-o antes de projetar nesta máquina.`
          : e.message || String(e),
      };
    }

    try {
      await escutar(servidorObs, PORTA_OBS);
    } catch (e) {
      /* Sem a 5001 perde-se o overlay do OBS, mas a projeção nas telas funciona. Não
         vale derrubar tudo por causa dela. */
      registarErro('projecao-local-obs-listen', e);
    }

    activa = true;
    return { ok: true, lanIp: getPreferredLocalIPv4() };
  }

  /** Desliga a projeção local e larga as portas. */
  async function desligar() {
    activa = false;
    try {
      if (engine) engine.fecharTodasJanelasProjecao();
    } catch (e) {
      registarErro('projecao-local-fechar-janelas', e);
    }
    for (const servidor of [servidorObs, servidorApi]) {
      if (!servidor) continue;
      await new Promise((resolve) => servidor.close(() => resolve()));
    }
    if (io) {
      try {
        io.close();
      } catch (e) {
        registarErro('projecao-local-io-close', e);
      }
    }
    io = null;
    servidorApi = null;
    servidorObs = null;
    engine = null;
    aplicador = null;
    store = null;
    return { ok: true };
  }

  return {
    ligar,
    desligar,
    receberComando,
    estaActiva: () => activa,
    /** Exposto para o painel poder sincronizar-se ao ligar, sem esperar por um comando. */
    estadoParaClienteNovo: () => (activa ? estadoParaClienteNovo() : null),
    PORTA_PROJECAO,
    PORTA_OBS,
  };
}

module.exports = { criarProjecaoLocal, PORTA_PROJECAO, PORTA_OBS };
