'use strict';

const projectionEncerrar = require('./projectionEncerrar');
const projectionPayloads = require('./projectionPayloads');
const comentariosSlide = require('./comentariosSlide');
const displayConfigModo = require('./displayConfigModo');

/**
 * Aplicador de comandos de projeção.
 *
 * Os handlers de socket do Servidor sempre tiveram a mesma forma de três camadas:
 *
 * ```
 * if (!comandoAutorizado(socket)) return;        ← guarda        (Servidor)
 * ...muta o estado, chama o motor...             ← regra         (PROJEÇÃO)
 * ctx.io.emit('estado', estadoPublico);          ← difusão       (Servidor)
 * emitirEstadoBibliaObs();
 * ```
 *
 * A camada do meio é a única que o Controlador precisa para projetar sozinho — e era a
 * única que estava presa dentro de `httpServer.js`. É ela que vive aqui.
 *
 * ## Porquê extrair em vez de duplicar
 *
 * A tentação era escrever no Controlador um tradutor comando→motor "igual ao do
 * Servidor, mas sem rede". Duas cópias da mesma regra divergem — e divergem em silêncio,
 * porque nada as compara. Extraindo, o Servidor passa a consumir este módulo em
 * produção: ele é o teste de regressão do aplicador, exercitado em todo culto, muito
 * antes de existir modo local.
 *
 * ## O aplicador não emite; devolve o que deve ser emitido
 *
 * Chamar `io.emit` aqui traria o Socket.IO para dentro do Core — exactamente o que a
 * extração desfez. Em vez disso `aplicar()` devolve uma lista de eventos, e o *host*
 * decide o que fazer com ela:
 *
 * - no Servidor, viram `io.emit` / `socket.broadcast.emit`;
 * - no Controlador em modo local, o mesmo evento vai ao renderer local **e** à porta
 *   5510, porque o OBS e o app de celular continuam a ser clientes dela.
 *
 * O `alcance` existe por causa de um único caso real: `set_display_config` responde com
 * `socket.broadcast.emit`, que exclui quem enviou. Sem o conceito, o host não teria como
 * distinguir «todos» de «todos menos a origem».
 */

/** Difundir a todos os clientes, incluindo quem originou o comando. */
const ALCANCE_TODOS = 'todos';
/** Difundir a todos menos a origem do comando (o `socket.broadcast.emit` do Servidor). */
const ALCANCE_OUTROS = 'outros';

/**
 * Estado do versículo em projeção para o overlay de Bíblia do OBS (`/obs/biblia`).
 *
 * Espelha o versículo vivo em QUALQUER canal físico (público ou ministrante), derivando
 * de `estadoAtual` — que guarda o versículo independentemente do alvo. Assim, escolher o
 * monitor do ministrante (ex.: M3) também alimenta o OBS, igual ao que já acontece com o
 * monitor público (ex.: M2). Não reflete quando uma apresentação/aviso está a cobrir o
 * público (aí o OBS de Bíblia fica limpo).
 *
 * É derivação pura do estado: nasceu dentro do `httpServer.js` por vizinhança com o
 * `io.emit`, não por pertencer ao Servidor.
 *
 * @param {object} state Porta de estado da projeção.
 */
function estadoBibliaParaObs(state) {
  const e = state.estadoAtual;
  const ehBiblia =
    !!e &&
    e.tipo === 'biblia' &&
    !e.telaLimpa &&
    !e.blackout &&
    Array.isArray(e.linhas) &&
    e.linhas.some((l) => String(l == null ? '' : l).length > 0);
  const ov = state.estadoPublicoOverride;
  const apresentacaoCobrePublico =
    !!ov &&
    typeof ov === 'object' &&
    (ov.tipo === 'apresentacao' || ov.tipo === 'aviso' || !!ov.apresentacao);
  if (!ehBiblia || apresentacaoCobrePublico) {
    return { tipo: null, titulo: '', linhas: [], telaLimpa: true, blackout: false, slidePretoFinal: false };
  }
  return {
    tipo: 'biblia',
    titulo: e.titulo || '',
    linhas: e.linhas.slice(),
    livro: e.livro || '',
    capitulo: e.capitulo || '',
    versiculo: e.versiculo || '',
    telaLimpa: false,
    blackout: false,
    slidePretoFinal: false,
  };
}

function normalizarCampoReferenciaBiblica(valor) {
  if (valor == null) return '';
  const texto = String(valor).trim();
  if (!texto) return '';
  const lower = texto.toLowerCase();
  return lower === 'null' || lower === 'undefined' ? '' : texto;
}

function montarTituloBiblico(payload) {
  const livro = normalizarCampoReferenciaBiblica(payload?.livro);
  const capitulo = normalizarCampoReferenciaBiblica(payload?.capitulo);
  const versiculo = normalizarCampoReferenciaBiblica(payload?.versiculo);
  if (!livro || !capitulo || !versiculo) return '';
  return `${livro} ${capitulo}:${versiculo}`;
}

/**
 * Override público do telão a partir do payload de apresentação, no formato que
 * `public/js/publicProjectionRender.js` espera (`tipo` + `linhas` / `apresentacao`).
 */
function estadoPublicoOverrideDePayloadApresentacao(estadoAtual, payload) {
  const pl = payload && typeof payload === 'object' ? payload : {};
  const base = projectionPayloads.clonePayloadSafe(estadoAtual) || {};
  const kind = String(pl.kind || '').toLowerCase();

  /* Preserva blackout do slide actual; modo apresentação não usa slide preto / tela
     vazia como «sem conteúdo». */
  const comum = {
    ...base,
    blackout: !!base.blackout,
    slidePretoFinal: false,
    telaLimpa: false,
  };

  if (kind === 'aviso') {
    const texto = String(pl.texto || '');
    return {
      ...comum,
      tipo: 'aviso',
      linhas: texto ? texto.split(/\r\n|\r|\n/) : [''],
      avisoConfig:
        pl.avisoConfig && typeof pl.avisoConfig === 'object' ? pl.avisoConfig : undefined,
    };
  }

  const src = String(pl.src || '').trim();
  if (!src) return null;

  const kindMidia =
    kind === 'video' ? 'video' : kind === 'iframe' || kind === 'pdf' ? 'iframe' : 'image';

  return {
    ...comum,
    tipo: 'apresentacao',
    linhas: [],
    apresentacao: {
      kind: kindMidia,
      src,
      title: String(pl.title || pl.name || 'Apresentação'),
    },
  };
}

/** Payload equivalente para `display-operator.html` (`modo` + dados). */
function ministranteOverrideDePayloadApresentacao(payload) {
  const pl = payload && typeof payload === 'object' ? payload : {};
  const kind = String(pl.kind || '').toLowerCase();

  if (kind === 'aviso') {
    const texto = String(pl.texto || '');
    return {
      modo: 'aviso',
      telaLimpa: false,
      linhas: texto ? texto.split(/\r\n|\r|\n/) : [''],
      avisoConfig:
        pl.avisoConfig && typeof pl.avisoConfig === 'object' ? pl.avisoConfig : undefined,
    };
  }

  const src = String(pl.src || '').trim();
  if (!src) return null;

  const kindMidia =
    kind === 'video' ? 'video' : kind === 'iframe' || kind === 'pdf' ? 'iframe' : 'image';

  return {
    modo: 'apresentacao',
    telaLimpa: false,
    apresentacao: {
      kind: kindMidia,
      src,
      title: String(pl.title || pl.name || 'Apresentação'),
    },
  };
}

/**
 * A quem entregar um evento, dado de onde veio o comando.
 *
 * Regra única: `ALCANCE_OUTROS` significa «todos menos quem pediu». O que muda entre os
 * dois hosts é apenas quem é «quem pediu» — no Servidor é sempre um socket; no
 * Controlador em modo local pode ser o painel, que está no mesmo processo e não tem
 * socket nenhum. Sem esta função, cada host reinventava a regra e o modo local acabaria
 * a devolver ao painel a config que o próprio painel acabou de enviar.
 *
 * @param {EventoDeProjecao} evento
 * @param {boolean} origemEhCliente `true` se o comando veio de um cliente de rede;
 *   `false` se veio do painel local.
 * @returns {{ painel: boolean, clientes: boolean, excluirOrigemNaRede: boolean }}
 */
function alvosDaDifusao(evento, origemEhCliente) {
  const excluiQuemPediu = evento.alcance === ALCANCE_OUTROS;
  return {
    painel: !(excluiQuemPediu && !origemEhCliente),
    clientes: true,
    excluirOrigemNaRede: excluiQuemPediu && origemEhCliente,
  };
}

/**
 * @typedef {object} EventoDeProjecao
 * @property {string} nome Nome do evento, no vocabulário da porta 5510.
 * @property {any} dados
 * @property {'todos'|'outros'} alcance
 */

/**
 * @param {{
 *   state: object,
 *   engine: object,
 *   buscarMusicaPorId?: (id: number) => Promise<{titulo?: string, estrofes?: string[]}|null>,
 *   reescreverSrcMidia?: (src: string, kind: string) => string
 * }} deps
 *   `state` é a porta de estado (`createProjectionState` no Servidor; armazém próprio no
 *   modo local). `engine` é o motor de projeção (`createProjectionEngine`).
 *
 *   As duas últimas são do **host**, não da projeção, e é por isso que entram injectadas:
 *
 *   - `buscarMusicaPorId` — o Servidor vai buscá-la por HTTP ao Controlador, porque o
 *     banco não é dele. No modo local o sentido inverte: o banco está em casa. Mesma
 *     regra de projeção, origem de dados oposta.
 *   - `reescreverSrcMidia` — o Servidor reescreve `127.0.0.1:3001` para o IP de LAN,
 *     porque os telões podem estar noutra máquina. No modo local não há nada a reescrever.
 */
function criarAplicadorDeComandos(deps) {
  const { state, engine } = deps;
  const buscarMusicaPorId =
    typeof deps.buscarMusicaPorId === 'function' ? deps.buscarMusicaPorId : null;
  const reescreverSrcMidia =
    typeof deps.reescreverSrcMidia === 'function' ? deps.reescreverSrcMidia : (src) => src;
  const displayConfigPath = deps.displayConfigPath || null;
  const logError = typeof deps.logError === 'function' ? deps.logError : () => {};

  /** Corpo de config tem de ser um objeto simples — array e null não servem de patch. */
  const ehCorpoDeConfig = (cfg) => typeof cfg === 'object' && cfg !== null && !Array.isArray(cfg);

  /**
   * O relógio é acessório: se a sincronização falhar, o resto do comando de config tem
   * de seguir — nomeadamente o `display_config` que vai aos outros clientes.
   */
  function sincronizarRelogioSemDerrubar() {
    try {
      engine.sincronizarJanelasRelogio();
    } catch (err) {
      logError('sincronizar-janelas-relogio', err);
    }
  }

  /**
   * Executa a camada FÍSICA de um comando sem deixar que ela silencie o OBS.
   *
   * O overlay do OBS não é uma tela: é um cliente Socket.IO que só depende dos eventos
   * devolvidos por `aplicar()`. Mas abrir/posicionar janelas do Electron falha por motivos
   * que nada têm a ver com o overlay — monitor desligado a meio, janela destruída, rota a
   * apontar para um ecrã que já não existe. Sem esta fronteira, uma dessas falhas propaga
   * para fora de `aplicar()`, o host apanha-a no `catch` e NENHUM evento é difundido: o
   * estado já mudou, mas o OBS continua a mostrar o versículo anterior, sem erro visível.
   *
   * Com a fronteira, a regra fica explícita: o estado é a fonte de verdade e os eventos
   * saem sempre; desenhar nas telas é um efeito que pode falhar isoladamente.
   *
   * @template T
   * @param {string} etapa Nome para o log.
   * @param {() => T} fn
   * @param {T} [fallback] Devolvido quando `fn` falha.
   * @returns {T}
   */
  function camadaFisica(etapa, fn, fallback) {
    try {
      return fn();
    } catch (err) {
      logError(`camada-fisica-${etapa}`, err);
      return fallback;
    }
  }

  /**
   * Estado público a difundir quando `engine.render()` não pôde correr.
   *
   * Derivar do estado (em vez de devolver `undefined`) mantém `/obs/slides` e o painel
   * coerentes com o que o comando acabou de gravar.
   */
  function estadoPublicoDeReserva() {
    return camadaFisica('estado-publico', () => engine.estadoPublicoParaSocketsOuApi(), null);
  }
  if (!state || typeof state !== 'object') {
    throw new TypeError('criarAplicadorDeComandos: porta de estado inválida');
  }
  if (!engine || typeof engine.render !== 'function') {
    throw new TypeError('criarAplicadorDeComandos: motor de projeção inválido');
  }

  const evEstado = (estadoPublico) => ({
    nome: 'estado',
    dados: estadoPublico,
    alcance: ALCANCE_TODOS,
  });

  const evBibliaObs = () => ({
    nome: 'estado_biblia_obs',
    dados: estadoBibliaParaObs(state),
    alcance: ALCANCE_TODOS,
  });

  /**
   * Cada entrada devolve os eventos a difundir. A ordem das chamadas ao motor dentro de
   * cada comando é significativa e foi preservada tal como estava no `httpServer.js` —
   * `render()` antes de `aplicarDisplayConfigNasJanelas()`, por exemplo. Inverter produz
   * um frame com a config antiga.
   */
  const COMANDOS = {
    /** Limpa a camada de slides/música, preservando Bíblia e apresentação. */
    limpar_tela() {
      state.projecaoLiveAtiva = false;
      projectionEncerrar.encerrarCamadaSlides(state);
      const { estadoPublico } = engine.render({ estado: state.estadoAtual });
      engine.aplicarDisplayConfigNasJanelas({ forcarModo: 'slides' });
      return [evEstado(estadoPublico), evBibliaObs()];
    },

    /** Limpa apenas a camada de Bíblia. */
    encerrar_projecao_biblia() {
      state.projecaoLiveAtiva = false;
      projectionEncerrar.encerrarCamadaBiblia(state);
      /* Mesmo raciocínio de `exibir_versiculo`: limpar o overlay do OBS não pode depender
         de as janelas físicas aceitarem o frame de limpeza. */
      const renderizado = camadaFisica(
        'render-encerrar-biblia',
        () => engine.render({ estado: state.estadoAtual }),
        null
      );
      camadaFisica('display-config-encerrar-biblia', () =>
        engine.aplicarDisplayConfigNasJanelas({ forcarModo: 'biblia' })
      );
      const estadoPublico = renderizado ? renderizado.estadoPublico : estadoPublicoDeReserva();
      return [evEstado(estadoPublico), evBibliaObs()];
    },

    /**
     * Encerra todas as camadas.
     *
     * O `httpServer.js` reconstruía aqui, à mão, dois literais que já existiam no Core
     * (`estadoPublicoOcioso()` e `estadoOciosoMinistrante()`) — é o que
     * `encerrarTodasCamadas` faz, campo a campo. A extração tornou a duplicação visível.
     */
    encerrar_projecao() {
      state.projecaoLiveAtiva = false;
      projectionEncerrar.encerrarTodasCamadas(state);
      engine.atualizarDisplays(state.estadoAtual);
      engine.atualizarDisplayMinistrante(state.estadoMinistrante);
      engine.aplicarDisplayConfigNasJanelas({ forcarModo: 'slides' });
      return [evEstado(engine.estadoPublicoParaSocketsOuApi()), evBibliaObs()];
    },

    /** Alterna o blackout do telão sem mexer no conteúdo projetado. */
    toggle_blackout() {
      const proximo = state.estadoAtual.blackout !== true;
      state.estadoAtual = { ...state.estadoAtual, blackout: proximo };
      engine.atualizarDisplays(state.estadoAtual);
      return [evEstado(engine.estadoPublicoParaSocketsOuApi()), evBibliaObs()];
    },

    /**
     * Projeta uma estrofe.
     *
     * As estrofes já vêm resolvidas por `preparar()` — aqui não há I/O. `idx === n` é o
     * slide preto final: um índice a mais do que as estrofes, deliberadamente.
     *
     * Repare na ordem: config **antes** de `render()`, ao contrário de `limpar_tela`.
     * Não é descuido de quem escreveu — a estrofe entra já com a tipografia certa, em vez
     * de aparecer com a config anterior e corrigir-se no frame seguinte.
     */
    exibir_musica(dados = {}) {
      const estrofes = Array.isArray(dados.estrofes) ? dados.estrofes : [];
      if (estrofes.length === 0) return null;

      const idx = Number(dados.estrofeIndex);
      const n = estrofes.length;
      if (!Number.isFinite(idx) || idx < 0 || idx > n) return null;

      const proxMeta = projectionPayloads.linhasProximoParaMusica(estrofes, idx);
      const musicaIdNum = Number(dados.musicaId);
      const musicaId =
        Number.isFinite(musicaIdNum) && musicaIdNum > 0 ? Math.trunc(musicaIdNum) : null;

      /* Os dois literais estão escritos por extenso, e não como um spread sobre uma base
         comum, para preservarem a ordem de campos do payload original. É o objecto que
         atravessa o socket até o painel e o OBS; a diferença é invisível em JS e visível
         em qualquer comparação por serialização. */
      if (idx === n) {
        state.estadoAtual = {
          tipo: 'musica',
          musicaId,
          titulo: '',
          tom: '',
          linhas: [],
          linhasProximo: proxMeta.linhasProximo,
          proximoSlidePreto: proxMeta.proximoSlidePreto,
          estrofeIndex: idx,
          totalEstrofes: n + 1,
          telaLimpa: false,
          blackout: false,
          slidePretoFinal: true,
          estrofes,
        };
      } else {
        const estrofe = estrofes[idx];
        if (!estrofe) return null;
        state.estadoAtual = {
          tipo: 'musica',
          musicaId,
          titulo: String(dados.titulo || '').trim(),
          tom: String(dados.tom || '').trim(),
          linhas: comentariosSlide.filtrarLinhasParaPublico(String(estrofe).split('\n')),
          linhasProximo: proxMeta.linhasProximo,
          proximoSlidePreto: proxMeta.proximoSlidePreto,
          estrofeIndex: idx,
          totalEstrofes: n + 1,
          telaLimpa: false,
          blackout: false,
          slidePretoFinal: false,
          estrofes,
        };
      }

      state.projecaoLiveAtiva = false;

      engine.garantirTelasAbertasParaProjecao();
      engine.aplicarDisplayConfigNasJanelas({ forcarModo: 'slides' });
      const { estadoPublico } = engine.render({
        estado: state.estadoAtual,
        reforcarMinistrante: true,
      });
      return [evEstado(estadoPublico), evBibliaObs()];
    },

    /**
     * Projeta um versículo.
     *
     * `alvoProjecao` decide quais canais recebem: o canal que NÃO é alvo leva um override
     * de tela limpa em vez de simplesmente não ser tocado — senão continuaria a mostrar o
     * que lá estava antes.
     */
    exibir_versiculo(dados = {}) {
      const texto = dados.texto != null ? String(dados.texto) : '';
      const alvo = String(dados.alvoProjecao || 'ambos').toLowerCase();
      state.projecaoLiveAtiva = alvo === 'live';

      state.estadoAtual = {
        tipo: 'biblia',
        titulo: montarTituloBiblico(dados),
        livro: normalizarCampoReferenciaBiblica(dados?.livro),
        capitulo: normalizarCampoReferenciaBiblica(dados?.capitulo),
        versiculo: normalizarCampoReferenciaBiblica(dados?.versiculo),
        linhas: [texto],
        linhasProximo: [],
        proximoSlidePreto: false,
        estrofeIndex: 0,
        totalEstrofes: 1,
        telaLimpa: false,
        blackout: false,
        slidePretoFinal: false,
      };

      const vaiAoPublico = alvo === 'publico' || alvo === 'ambos' || alvo === 'live';
      /* `estadoPublicoOcioso()` já é, campo a campo, o literal de tela limpa que estava
         escrito à mão no handler. */
      state.estadoPublicoOverride = vaiAoPublico ? null : projectionPayloads.estadoPublicoOcioso();

      const vaiAoMinistrante = alvo === 'ministrante' || alvo === 'ambos';
      state.ministranteApresentacaoOverride = vaiAoMinistrante
        ? null
        : { modo: 'biblia', titulo: '', atual: '', proximo: '', telaLimpa: true };

      /*
       * A partir daqui é tudo camada física — e nada dela é pré-requisito do OBS.
       *
       * `garantirTelasAbertasParaProjecao()` decide janelas a partir da rota de monitores
       * gravada em disco: sem monitor externo ela fecha tudo, e é legítimo. O overlay, esse,
       * já tem o que precisa — `state.estadoAtual` foi escrito acima, incondicionalmente.
       * Isolar cada passo garante que «não há tela para abrir» ou «a tela falhou a abrir»
       * nunca se traduza em «o OBS não recebeu».
       */
      camadaFisica('garantir-telas-versiculo', () => engine.garantirTelasAbertasParaProjecao());
      /* Fundo/tipografia da Bíblia já estão nas janelas (o `preview_display_config` ao
         entrar no modo). Reenviar `display_config` a cada versículo — com `bgImage` em
         base64 — causava atraso visível na navegação. */
      const reenviarConfig = dados.reenviarDisplayConfig === true || dados.somenteTexto !== true;
      if (reenviarConfig) {
        camadaFisica('display-config-versiculo', () =>
          engine.aplicarDisplayConfigNasJanelas({ forcarModo: 'biblia' })
        );
      }
      const renderizado = camadaFisica(
        'render-versiculo',
        () => engine.render({ estado: state.estadoAtual, reforcarMinistrante: true }),
        null
      );
      const estadoPublico = renderizado ? renderizado.estadoPublico : estadoPublicoDeReserva();
      return [evEstado(estadoPublico), evBibliaObs()];
    },

    /** Projeta uma mídia (imagem, vídeo, PDF/iframe) ou um aviso. */
    exibir_apresentacao(dados) {
      const pl = dados && typeof dados === 'object' ? { ...dados } : {};
      const kind = String(pl.kind || '').toLowerCase();
      const srcBruto = String(pl.src || '').trim();
      if (srcBruto) pl.src = reescreverSrcMidia(srcBruto, kind);

      const alvo = String(pl.alvoProjecao || 'ambos').toLowerCase();
      state.projecaoLiveAtiva = alvo === 'live';

      const pubOv = estadoPublicoOverrideDePayloadApresentacao(state.estadoAtual, pl);
      const minOv = ministranteOverrideDePayloadApresentacao(pl);

      state.estadoPublicoOverride =
        (alvo === 'publico' || alvo === 'ambos' || alvo === 'live') && pubOv != null ? pubOv : null;
      state.ministranteApresentacaoOverride =
        (alvo === 'ministrante' || alvo === 'ambos') && minOv != null ? minOv : null;

      engine.garantirTelasAbertasParaProjecao();
      const { estadoPublico } = engine.render({ estado: state.estadoAtual });
      return [evEstado(estadoPublico), evBibliaObs()];
    },

    /** Retira a apresentação dos dois canais, deixando ver o que está por baixo. */
    encerrar_apresentacao_publico() {
      state.projecaoLiveAtiva = false;
      projectionEncerrar.encerrarCamadaApresentacao(state);
      engine.garantirTelasAbertasParaProjecao();
      const { estadoPublico } = engine.render({ estado: state.estadoAtual });
      return [evEstado(estadoPublico), evBibliaObs()];
    },

    /**
     * Atualiza o texto da tela do ministrante (atual / próximo).
     *
     * Único comando da família que não difunde nada: escreve na janela e pronto. E o
     * único que se recusa a agir — enquanto uma apresentação ocupa o canal do ministrante,
     * o texto do painel não pode passar-lhe à frente.
     */
    exibir_ministrante(dados = {}) {
      if (state.ministranteApresentacaoOverride) return null;
      const pl = dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {};
      const snapshot = engine.snapshotMinistranteAtual();
      /* O controlador envia strings do painel; clientes legacy sem corpo ficam só com o
         snapshot derivado da projeção. */
      const usouCliente = 'titulo' in pl || 'atual' in pl || 'proximo' in pl || 'telaLimpa' in pl;
      state.estadoMinistrante = usouCliente
        ? {
            titulo: pl.titulo != null ? String(pl.titulo) : snapshot.titulo || '',
            atual: pl.atual != null ? String(pl.atual) : snapshot.atual || '',
            proximo: pl.proximo != null ? String(pl.proximo) : snapshot.proximo || '',
            aberturaMusica:
              typeof pl.aberturaMusica === 'boolean'
                ? pl.aberturaMusica
                : !!snapshot.aberturaMusica,
            projecaoAtiva: typeof pl.projecaoAtiva === 'boolean' ? pl.projecaoAtiva : undefined,
            telaLimpa: typeof pl.telaLimpa === 'boolean' ? pl.telaLimpa : !!snapshot.telaLimpa,
            slidePretoFinal:
              typeof pl.slidePretoFinal === 'boolean'
                ? pl.slidePretoFinal
                : !!snapshot.slidePretoFinal,
          }
        : snapshot;
      engine.atualizarDisplayMinistrante(state.estadoMinistrante);
      return [];
    },

    /**
     * Pré-visualização de config: aplica nas janelas sem gravar em disco.
     *
     * É o que corre enquanto o operador arrasta um slider. Persistir a cada frame
     * escreveria centenas de vezes no disco por ajuste.
     */
    preview_display_config(dados) {
      if (!ehCorpoDeConfig(dados)) return null;
      displayConfigModo.processarDisplayConfigDoControlador(state, dados, {
        persistirSlides: false,
        enviar: engine.aplicarDisplayConfigNasJanelas,
      });
      sincronizarRelogioSemDerrubar();
      return [];
    },

    /**
     * Config definitiva: aplica, grava e conta aos outros clientes.
     *
     * `ALCANCE_OUTROS` não é detalhe de implementação — quem enviou já tem a config no
     * seu formulário, e devolvê-la faria o painel do operador saltar por cima do que ele
     * está a editar. Os restantes (segundo controlador, OBS, celular) precisam de saber.
     *
     * A config de Bíblia não persiste na camada de slides: são dois conjuntos separados,
     * e gravar um por cima do outro faria o modo Bíblia comer o tema dos slides.
     */
    set_display_config(dados) {
      if (!ehCorpoDeConfig(dados)) {
        throw new Error('corpo deve ser um objeto de configuração');
      }
      const { modoConfig, forcarModo } = displayConfigModo.extrairPatchDisplayConfig(dados);
      displayConfigModo.processarDisplayConfigDoControlador(state, dados, {
        persistirSlides: modoConfig !== displayConfigModo.MODO_CFG_BIBLIA,
        displayConfigPath,
        enviar: engine.aplicarDisplayConfigNasJanelas,
      });
      sincronizarRelogioSemDerrubar();

      const modoEnvio =
        forcarModo === displayConfigModo.MODO_CFG_BIBLIA
          ? displayConfigModo.MODO_CFG_BIBLIA
          : forcarModo === displayConfigModo.MODO_CFG_SLIDES
            ? displayConfigModo.MODO_CFG_SLIDES
            : modoConfig;

      return [
        {
          nome: 'display_config',
          dados: displayConfigModo.resolverConfigParaJanelas(state, { forcarModo: modoEnvio }),
          alcance: ALCANCE_OUTROS,
        },
      ];
    },

    /**
     * Toca áudio ou vídeo do modo apresentação.
     *
     * Quem é o «dono» do áudio — para o parar quando esse cliente cair — é contabilidade
     * do host, não da projeção: depende de haver sockets, e no modo local não há. Por
     * isso o comando devolve apenas se foi aceite, e o host tira daí a sua conclusão.
     */
    audio_play(dados) {
      const src = String(dados?.src || '').trim();
      if (!src) return null;
      engine.enviarComandoAudioParaControle('audio_play', {
        src,
        name: String(dados?.name || 'audio'),
        mediaKind: dados?.mediaKind === 'video' ? 'video' : 'audio',
        autoplay: dados?.autoplay !== false,
        volume: dados?.volume,
      });
      return [];
    },

    audio_pause() {
      engine.enviarComandoAudioParaControle('audio_pause', {});
      return [];
    },

    audio_volume(dados) {
      const v = Number(dados?.volume);
      if (!Number.isFinite(v)) return null;
      engine.enviarComandoAudioParaControle('audio_volume', { volume: Math.max(0, Math.min(1, v)) });
      return [];
    },

    audio_seek(dados) {
      const t = Number(dados?.time);
      if (!Number.isFinite(t)) return null;
      engine.enviarComandoAudioParaControle('audio_seek', { time: Math.max(0, t) });
      return [];
    },

    audio_stop() {
      engine.enviarComandoAudioParaControle('audio_stop', {});
      return [];
    },

    /**
     * Sincroniza play/pause/tempo/volume do vídeo da apresentação com as telas.
     *
     * `syncTime` é opt-in: sem ele, só play/pause e volume seguem. Reposicionar o vídeo a
     * cada evento produziria micro-saltos na imagem a cada ajuste de volume.
     */
    apresentacao_video_state(dados) {
      const pl = dados && typeof dados === 'object' ? dados : {};
      const sync = { playing: !!pl.playing };
      const vol = Number(pl.volume);
      if (pl.syncTime === true) {
        sync.syncTime = true;
        const ct = Number(pl.currentTime);
        if (Number.isFinite(ct)) sync.currentTime = Math.max(0, ct);
      }
      if (Number.isFinite(vol)) sync.volume = Math.max(0, Math.min(1, vol));
      engine.enviarSyncVideoApresentacaoParaDisplays(sync);
      return [];
    },
  };

  /**
   * Resolução de dados que exige I/O, separada da aplicação.
   *
   * Manter `aplicar()` síncrono não é purismo: é o que permite testá-lo sem relógio nem
   * rede, e o que deixa a ordem das chamadas ao motor legível. O I/O fica aqui, na
   * fronteira, com o host a decidir de onde vêm os dados.
   */
  const PREPARAR = {
    /**
     * O controlador manda as estrofes no payload. Quando não manda (mobile, cliente
     * antigo), sobra o `musicaId` e alguém tem de ir buscá-las.
     */
    async exibir_musica(dados = {}) {
      const estrofes = Array.isArray(dados.estrofes)
        ? dados.estrofes.map((s) => String(s ?? ''))
        : [];
      let titulo = String(dados.titulo || '').trim();
      const id = Number(dados.musicaId);

      if (estrofes.length > 0 || !buscarMusicaPorId || !Number.isFinite(id) || id <= 0) {
        return { ...dados, estrofes, titulo };
      }

      const achada = await buscarMusicaPorId(id);
      if (!achada || !Array.isArray(achada.estrofes)) return { ...dados, estrofes, titulo };
      if (!titulo) titulo = String(achada.titulo || '').trim();
      return { ...dados, estrofes: achada.estrofes.map((s) => String(s ?? '')), titulo };
    },
  };

  /**
   * O aplicador ainda não cobre todos os comandos de projeção — a migração é por
   * famílias, cada uma verificada antes da seguinte. O host usa isto para saber se
   * encaminha para cá ou mantém o caminho antigo.
   *
   * @param {string} comando
   */
  function suporta(comando) {
    return Object.prototype.hasOwnProperty.call(COMANDOS, comando);
  }

  /**
   * Aplica um comando de projeção.
   *
   * @param {string} comando Nome do evento, no vocabulário da porta 5510.
   * @param {any} [dados]
   * @returns {{ eventos: EventoDeProjecao[] }}
   */
  function aplicar(comando, dados) {
    if (!suporta(comando)) {
      throw new Error(`comando de projeção desconhecido: ${comando}`);
    }
    const saida = COMANDOS[comando](dados);
    /* Um comando devolve `null` quando se recusa a agir — payload inválido, índice fora
       do intervalo, canal já ocupado. É diferente de agir e não ter nada a difundir
       (`[]`), que é o caso normal do `exibir_ministrante`. O host precisa da distinção:
       é ela que decide, por exemplo, se o cliente vira dono do áudio. */
    return { eventos: saida || [], aplicado: saida != null };
  }

  /**
   * Resolve o que falta ao payload antes de aplicar. Identidade para quase todos os
   * comandos; só `exibir_musica` precisa de ir buscar dados.
   *
   * @param {string} comando
   * @param {any} [dados]
   * @returns {Promise<any>}
   */
  async function preparar(comando, dados) {
    const hook = PREPARAR[comando];
    return hook ? hook(dados) : dados;
  }

  return { aplicar, preparar, suporta, comandos: Object.keys(COMANDOS) };
}

module.exports = {
  criarAplicadorDeComandos,
  estadoBibliaParaObs,
  alvosDaDifusao,
  ALCANCE_TODOS,
  ALCANCE_OUTROS,
};
