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
  displayRouting,
  displayChangePolicy,
  monitorsList,
  localIp,
  controleAcesso,
} = require('@lyra/projection-core');

const { ligarTratadorMudancaDisplays } = displayChangePolicy;
const { buildMonitorsList } = monitorsList;
const { caminhoIconeApp } = require('./lib/iconPath');

const { getPreferredLocalIPv4, listLocalIPv4 } = localIp;

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
  const { paths, logError, buscarMusicaPorId, aoEmitirParaPainel, obterJanelaPainel } = deps;

  let io = null;
  let servidorApi = null;
  let servidorObs = null;
  let engine = null;
  let aplicador = null;
  let store = null;
  let acesso = null;
  let activa = false;

  /**
   * Função que desliga os listeners de mudança de monitores.
   * O Servidor regista os seus e nunca os larga; aqui o modo local liga e desliga
   * na mesma sessão, e listeners deixados para trás chamariam um motor já desmontado.
   * @type {(() => void)|null}
   */
  let desligarListenersDeMonitores = null;

  const registarErro = typeof logError === 'function' ? logError : () => {};

  /**
   * Ligar um projetor, desligá-lo ou mudar a resolução tem de reabrir/reposicionar as
   * telas — senão as janelas ficam em monitores que já não existem, ou o monitor novo
   * fica a mostrar a área de trabalho. A política (ignorar `workArea`, coalescer HDMI)
   * vive no Core para o Servidor e o modo local não divergirem.
   */
  function registarListenersDeMonitores() {
    removerListenersDeMonitores();
    try {
      desligarListenersDeMonitores = ligarTratadorMudancaDisplays(screen, {
        /*
         * Contraparte do `broadcastMonitoresParaJanelaControle()` do Servidor
         * (`server/src/main.js`), que aqui não existia.
         *
         * Sem ela, ligar o projetor com o app já aberto não mexia nos seletores: a lista
         * de monitores do painel só era recarregada no arranque, ao ligar o socket e ao
         * desenhar a contagem. O operador via «M2 (Público)» na lista antiga — ou não via
         * o monitor novo de todo — enquanto o motor já tinha reorganizado as telas.
         *
         * O painel recebe pelo mesmo canal de retorno dos eventos de projeção e vai ele
         * próprio buscar a lista à API; aqui só se avisa que mudou.
         */
        aoListaMonitores: () => {
          if (!activa) return;
          try {
            if (typeof aoEmitirParaPainel === 'function') {
              aoEmitirParaPainel('monitores_alterados', buildMonitorsList(screen));
            }
          } catch (e) {
            registarErro('projecao-local-monitores-alterados', e);
          }
        },
        aoReorganizarJanelas: (etapa) => {
          if (!activa || !engine) return;
          try {
            engine.garantirTelasAbertasParaProjecao();
          } catch (e) {
            registarErro(`projecao-local-display-change-garantir-telas-${etapa}`, e);
          }
        },
      });
    } catch (e) {
      registarErro('projecao-local-listeners-monitores', e);
    }
  }

  function removerListenersDeMonitores() {
    if (typeof desligarListenersDeMonitores === 'function') {
      try {
        desligarListenersDeMonitores();
      } catch (e) {
        registarErro('projecao-local-remover-listeners-monitores', e);
      }
    }
    desligarListenersDeMonitores = null;
  }

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
    if (COMANDOS_DE_HOST[comando]) return COMANDOS_DE_HOST[comando](dados, origemSocket);
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
   * Últimas playlists publicadas pelo painel.
   *
   * O telemóvel que liga a meio do culto não pode ficar à espera do próximo pedido — o
   * Servidor guarda isto pelo mesmo motivo.
   */
  let ultimasPlaylists = null;

  /**
   * Serviços do host que não são projeção.
   *
   * Reencaminhar playlists entre o painel e os telemóveis não desenha nada em tela
   * nenhuma — não pertence ao aplicador, que só sabe de projeção. Mas é serviço de quem
   * hospeda a 5510, e no modo local esse alguém é este módulo. No Servidor o mesmo
   * reencaminhamento existe, atravessando a rede em ambos os sentidos; aqui uma das
   * pontas é IPC.
   */
  const COMANDOS_DE_HOST = {
    /** O painel publicou as suas playlists → cache e difusão aos telemóveis. */
    controlador_playlists(dados) {
      const pl = dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {};
      ultimasPlaylists = pl;
      try {
        io?.emit('playlists_do_controlador', pl);
      } catch (e) {
        registarErro('projecao-local-playlists-difundir', e);
      }
      return { ok: true, aplicado: true };
    },

    /** Um telemóvel pediu as playlists → responde do cache e pede ao painel as actuais. */
    solicitar_playlists_controlador(_dados, origemSocket) {
      if (ultimasPlaylists && origemSocket) {
        try {
          origemSocket.emit('playlists_do_controlador', ultimasPlaylists);
        } catch (e) {
          registarErro('projecao-local-playlists-cache', e);
        }
      }
      try {
        if (typeof aoEmitirParaPainel === 'function') {
          aoEmitirParaPainel('solicitar_playlists_controlador', null);
        }
      } catch (e) {
        registarErro('projecao-local-playlists-pedir', e);
      }
      return { ok: true, aplicado: true };
    },
  };

  /**
   * Guarda de escrita para clientes de rede.
   *
   * ## Uma porta, não duas
   *
   * O Servidor tem duas: autenticação (dispositivo conhecido) e write-lock (entre
   * controladores registados, só o primário escreve). A segunda não faz sentido aqui —
   * o dono das telas é quem está sentado nesta máquina, e ele não entra por socket
   * nenhum: fala com o motor por IPC, dentro do processo. Não há bastão a disputar
   * porque não há dois candidatos ao mesmo canal.
   *
   * @param {object} socket
   * @param {Function} [ack]
   * @returns {boolean}
   */
  function comandoAutorizado(socket, ack) {
    if (socket.data && socket.data.autorizado === true) return true;
    const info = { erro: socket.data?.authMotivo || 'nao-autorizado', donoAtual: null };
    if (typeof ack === 'function') ack({ ok: false, ...info });
    else socket.emit('comando_recusado', info);
    return false;
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

  /**
   * API HTTP da projeção, na 5510.
   *
   * Não é acessório do socket: o painel depende dela para coisas que o socket nunca fez.
   *
   * - `/api/monitores` e `/api/display-routing` alimentam os seletores de tela. Sem elas o
   *   painel não sabe que monitores existem nem qual é o público — mostra «desativado» nos
   *   dois e uma lista vazia ao abrir.
   * - `/api/comando/exibir_apresentacao` é o único caminho da mídia. O Socket.IO corta
   *   pacotes grandes e derruba a ligação, por isso ficheiros e vídeo em base64 sempre
   *   foram por POST — daí o limite de 200 MB, igual ao do Servidor.
   */
  function montarRotasApi(apiApp) {
    apiApp.use(express.json({ limit: '200mb' }));

    /* Identidade do host na 5510 — sem autenticação nem allowlist. Um Controlador
       remoto consulta isto ao ligar para não confundir este modo local com um Servidor. */
    apiApp.get('/api/identity', (_req, res) => {
      res.json({ role: 'controller-local' });
    });

    apiApp.get('/api/monitores', (_req, res) => res.json(buildMonitorsList(screen)));

    apiApp.get('/api/display-routing', (_req, res) => {
      res.json(displayRouting.loadDisplayRouting(paths.displayRoutingPath));
    });

    apiApp.put('/api/display-routing', (req, res) => {
      try {
        const routing = displayRouting.saveDisplayRouting(paths.displayRoutingPath, req.body || {});
        engine.garantirTelasAbertasParaProjecao();
        res.json({ ok: true, routing });
      } catch (e) {
        registarErro('projecao-local-put-display-routing', e);
        res.status(500).json({ erro: e.message || String(e) });
      }
    });

    apiApp.get('/api/display-config', (_req, res) => res.json(store.displayConfig));

    apiApp.get('/api/estado', (_req, res) => res.json(engine.estadoPublicoParaSocketsOuApi()));

    /*
     * Gestão dos dispositivos autorizados. Mesmas rotas do Servidor, para que qualquer
     * ferramenta que já saiba falar com ele saiba falar com este host também.
     *
     * Só de loopback: aprovar um aparelho é decisão de quem está na máquina. Permitir
     * isso pela rede daria a quem ainda não foi aprovado a chave para se aprovar.
     */
    const soLocal = (req, res, next) => {
      const addr = String(req?.socket?.remoteAddress || '');
      const local = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
      if (!local) return res.status(403).json({ ok: false, erro: 'apenas da própria máquina' });
      next();
    };

    apiApp.get('/api/controladores', soLocal, (_req, res) => {
      res.json({ ok: true, modo: acesso.getModo(), dispositivos: acesso.listarDispositivos() });
    });
    apiApp.post('/api/controladores/aprovar', soLocal, (req, res) => {
      res.json({ ok: acesso.aprovarDispositivo(String(req.body?.deviceId || '')) });
    });
    apiApp.post('/api/controladores/revogar', soLocal, (req, res) => {
      res.json({ ok: acesso.revogarDispositivo(String(req.body?.deviceId || '')) });
    });
    apiApp.post('/api/controladores/travar', soLocal, (_req, res) => {
      acesso.travar();
      res.json({ ok: true, modo: acesso.getModo() });
    });
    apiApp.post('/api/controladores/destravar', soLocal, (_req, res) => {
      acesso.destravar();
      res.json({ ok: true, modo: acesso.getModo() });
    });

    /* Gémeos HTTP dos comandos de config. Tal como no Servidor, não difundem
       `display_config` — respondem com a config aplicada, que é o que um cliente HTTP
       espera. */
    const rotaConfig = (persistir) => (req, res) => {
      try {
        const cfg = req.body;
        if (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg)) {
          return res.status(400).json({ erro: 'corpo deve ser um objeto de configuração' });
        }
        const { modoConfig, forcarModo } = displayConfigModo.extrairPatchDisplayConfig(cfg);
        const enviada = displayConfigModo.processarDisplayConfigDoControlador(store, cfg, {
          persistirSlides: persistir && modoConfig !== displayConfigModo.MODO_CFG_BIBLIA,
          displayConfigPath: paths.displayConfigPath,
          enviar: engine.aplicarDisplayConfigNasJanelas,
        });
        try {
          engine.sincronizarJanelasRelogio();
        } catch (e) {
          registarErro('projecao-local-relogio', e);
        }
        res.json({
          ok: true,
          config:
            enviada ||
            displayConfigModo.resolverConfigParaJanelas(store, {
              forcarModo: forcarModo || 'slides',
            }),
        });
      } catch (e) {
        registarErro('projecao-local-put-display-config', e);
        res.status(500).json({ erro: e.message || String(e) });
      }
    };
    apiApp.put('/api/display-config', rotaConfig(true));
    apiApp.put('/api/display-config/preview', rotaConfig(false));

    /*
     * Fallbacks HTTP dos comandos. O painel em modo local quase nunca os usa — a porta de
     * projeção fala por IPC — mas `exibir_apresentacao` vem sempre por aqui, porque
     * ficheiros grandes não passam pelo socket.
     *
     * Restritos ao loopback, e aqui divirjo do Servidor de propósito: lá estas rotas são
     * abertas, porque o painel que as chama está noutra máquina. Aqui quem as chama é o
     * painel desta máquina, e deixá-las abertas seria contornar pela porta dos fundos a
     * autenticação que acabou de se pôr no socket. O celular comanda pelo socket, com
     * credencial; não perde nada.
     */
    const rotaComando = (comando, opts = {}) => (req, res) => {
      void receberComando(comando, req.body || {}, null).then((r) => {
        /*
         * `aplicado === false` é a regra a recusar-se — payload sem efeito, não avaria.
         * Só a contagem o traduz em 400: os comandos antigos sempre responderam 200 nesse
         * caso, e o painel trata qualquer não-200 como erro visível ao operador. Mudar-lhes
         * o contrato aqui faria aparecer alertas em situações que hoje passam em silêncio.
         */
        if (r.ok && r.aplicado === false && opts.recusaEh400) {
          return res.status(400).json({ ok: false, erro: `${comando}: comando sem efeito` });
        }
        if (r.ok) return res.json({ ok: true });
        res.status(500).json(r);
      });
    };
    /* A contagem vem por HTTP pelo mesmo motivo da mídia: a imagem de fundo em Base64 não
       cabe num pacote de socket. */
    apiApp.post('/api/comando/exibir_contagem', soLocal, rotaComando('exibir_contagem', { recusaEh400: true }));
    apiApp.post('/api/comando/encerrar_contagem', soLocal, rotaComando('encerrar_contagem'));
    for (const comando of [
      'exibir_apresentacao',
      'encerrar_apresentacao_publico',
      'audio_play',
      'audio_pause',
      'audio_stop',
      'audio_volume',
      'audio_seek',
      'apresentacao_video_state',
    ]) {
      apiApp.post(`/api/comando/${comando}`, soLocal, rotaComando(comando));
    }
  }

  function montarServidores() {
    const apiApp = express();
    apiApp.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
    montarRotasApi(apiApp);
    servidorApi = http.createServer(apiApp);

    const { Server } = require('socket.io');
    io = new Server(servidorApi, {
      cors: { origin: '*' },
      /* Base64 grandes no socket derrubavam o transporte em silêncio ao projetar mídia. */
      maxHttpBufferSize: Math.max(Number(process.env.SOCKET_MAX_BUFFER_MB || 110), 110) * 1024 * 1024,
    });

    /*
     * Autenticação no handshake — a mesma do Servidor, com o mesmo módulo.
     *
     * Não bloqueia a ligação: o OBS não manda credencial nenhuma e continua a ver o que
     * está projetado, como sempre viu. O que a credencial decide é quem pode **comandar**.
     * Sem isto, qualquer aparelho da rede que alcançasse a 5510 mandava nas telas.
     */
    io.use((socket, next) => {
      try {
        const r = acesso.autenticar(socket.handshake.auth || {});
        socket.data.autorizado = !!r.ok;
        socket.data.device = r.device || null;
        socket.data.authMotivo = r.motivo || null;
      } catch (e) {
        socket.data.autorizado = false;
        registarErro('projecao-local-auth', e);
      }
      next();
    });

    io.on('connection', (socket) => {
      const inicial = estadoParaClienteNovo();
      socket.emit('estado', inicial.estado);
      socket.emit('estado_biblia_obs', inicial.estado_biblia_obs);
      socket.emit('display_config', inicial.display_config);

      for (const comando of aplicador.comandos) {
        socket.on(comando, (dados, ack) => {
          if (!comandoAutorizado(socket, ack)) return;
          void receberComando(comando, dados, socket).then((r) => {
            if (typeof ack === 'function') ack(r);
          });
        });
      }

      /* Pedir playlists é leitura, e não passa pela guarda de escrita — tal como no
         Servidor, onde este handler também não tem `comandoAutorizado`. */
      socket.on('solicitar_playlists_controlador', () => {
        void receberComando('solicitar_playlists_controlador', null, socket);
      });
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
   * @returns {Promise<{ ok: boolean, erro?: string, lanIp?: string, lanIps?: string[] }>}
   */
  async function ligar() {
    if (activa) {
      return { ok: true, lanIp: getPreferredLocalIPv4(), lanIps: listLocalIPv4() };
    }
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

  /**
   * Estado do player, vindo de quem toca.
   *
   * No Servidor este caminho é `ipcMain.on('audio_state_update')` → `io.emit`. Aqui é o
   * mesmo, com o painel no lugar da janela de controle: o evento volta para ele **e** para
   * a rede, porque o celular também mostra a barra de progresso.
   */
  function publicarEstadoAudio(estado) {
    if (!activa) return;
    difundir(
      [{ nome: 'audio_state', dados: estado && typeof estado === 'object' ? estado : {}, alcance: 'todos' }],
      null
    );
  }

  async function ligarInterno() {
    /*
     * Mesma política do Servidor, incluindo o padrão `tofu`: o primeiro acesso de cada
     * aparelho é auto-inscrito e lembrado, e depois o operador pode travar a lista. Zero
     * fricção para inscrever o celular da equipa, e uma tranca disponível para quando a
     * rede não for de confiança.
     */
    acesso = controleAcesso.criarControleAcesso({
      allowlistPath: paths.allowlistPath,
      emitParaSocket: (id, evt, dados) => {
        try {
          io?.to(id).emit(evt, dados);
        } catch (_) {
          // intencional — o socket pode ter saído entretanto
        }
      },
      broadcast: (evt, dados) => {
        try {
          io?.emit(evt, dados);
        } catch (_) {
          // intencional
        }
      },
      notificar: (evt, dados) => registarErro(`acesso:${evt}`, dados || ''),
      logError: registarErro,
    });

    store = criarArmazemDeProjecao();
    /*
     * A «janela de controle» do motor, no modo local, é o próprio painel.
     *
     * É por este campo que `enviarComandoAudioParaControle` entrega `audio_play` e
     * companhia. Deixá-lo a `null` — como estava — fazia os comandos de áudio chegarem ao
     * motor e morrerem lá, sem erro: o som não saía e nada apontava porquê.
     *
     * Janela VIVA, não uma foto: o painel pode ser recriado (reload do controlador →
     * nova `BrowserWindow`) enquanto a projeção local continua activa. `ligar()` faz
     * curto-circuito quando já está activa e nunca voltava aqui, então uma referência
     * capturada uma vez ficava a apontar para a janela destruída — e daí em diante
     * `enviarComandoAudioParaControle` saía em silêncio no `isDestroyed()`: dar play não
     * fazia som nenhum. Resolver sempre a janela actual através do getter elimina isso, e
     * de quebra conserta os outros envios que dependem do mesmo campo (`estado_atualizado`,
     * ESC das telas).
     */
    Object.defineProperty(store, 'windowControl', {
      configurable: true,
      enumerable: true,
      get: () => (typeof obterJanelaPainel === 'function' ? obterJanelaPainel() : null),
    });
    engine = createProjectionEngine(paths, {
      logError: registarErro,
      screen,
      BrowserWindow,
      state: store,
      onProjecaoEncerrada: (ev) => {
        /* ESC numa janela física encerra a projeção. Quem carregou já vê o resultado nas
           telas; o painel e os clientes de rede precisam de saber que aconteceu. */
        const eventos = [{ nome: 'estado', dados: ev?.estadoPublico, alcance: 'todos' }];
        if (ev?.estadoBibliaObs) {
          eventos.push({
            nome: 'estado_biblia_obs',
            dados: ev.estadoBibliaObs,
            alcance: 'todos',
          });
        }
        difundir(eventos, null);
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

    /*
     * Vestir as telas faz parte de arrancar — não é consequência de alguém navegar.
     *
     * Contraparte exacta de `server/src/main.js:155-159`, que o Servidor faz no
     * `whenReady()`. Sem esta chamada, as janelas de projeção só nasciam quando algo
     * disparasse um `PUT /api/display-routing` (ver a rota acima) ou um comando de
     * projeção. Ou seja: por acidente, ao trocar de modo no painel.
     *
     * O sintoma era o monitor do público a mostrar a **área de trabalho** do operador
     * durante os primeiros segundos, enquanto o do ministrante já mostrava o relógio — o
     * relógio vinha por outro caminho, esse incondicional (`preview_display_config` →
     * `sincronizarJanelasRelogio`). E só a partir do segundo arranque: com o roteamento
     * ainda por gravar, o PUT de inicialização acontecia e tapava o buraco por sorte.
     *
     * Depois de `activa = true` de propósito — há caminhos do motor que consultam o estado.
     * Em `try/catch` porque falhar a abrir as telas não pode derrubar um motor que já tem
     * as portas de pé: o painel continua a comandar, e o operador vê o problema nas telas.
     */
    try {
      engine.garantirTelasAbertasParaProjecao();
    } catch (e) {
      registarErro('projecao-local-arranque-garantir-telas', e);
    }

    registarListenersDeMonitores();

    return { ok: true, lanIp: getPreferredLocalIPv4(), lanIps: listLocalIPv4() };
  }

  /** Desliga a projeção local e larga as portas. */
  async function desligar() {
    activa = false;
    /* Antes de largar o motor: um evento de monitor a chegar depois disto encontraria
       `engine` a `null`. O guard em `aoMudar` cobre a corrida, isto evita-a. */
    removerListenersDeMonitores();
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
    try {
      acesso?.pararHeartbeat();
    } catch (e) {
      registarErro('projecao-local-acesso-parar', e);
    }
    io = null;
    servidorApi = null;
    servidorObs = null;
    engine = null;
    aplicador = null;
    store = null;
    acesso = null;
    return { ok: true };
  }

  return {
    ligar,
    desligar,
    receberComando,
    publicarEstadoAudio,
    estaActiva: () => activa,
    /** Exposto para o painel poder sincronizar-se ao ligar, sem esperar por um comando. */
    estadoParaClienteNovo: () => (activa ? estadoParaClienteNovo() : null),
    PORTA_PROJECAO,
    PORTA_OBS,
  };
}

module.exports = { criarProjecaoLocal, PORTA_PROJECAO, PORTA_OBS };
