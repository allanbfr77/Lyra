/**
 * Eventos recebidos da porta de projeção (estado, áudio, display, monitores), ligação/queda do socket
 * remoto e duplo clique na playlist. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo
 * ainda possui entra por `registrarDependenciasEventosProjecao`.
 */
import { ajustarEstadoVisualRetomadaAudio, carregarEstadoModoApresentacaoDoServidor } from './estadoApresentacao.js';
import { atualizarPreviewOperador, emitirEstadoMinistranteAoServidor } from './previewProjecao.js';
import { atualizarUiPlayerAudioRemoto, tocarAudioServidorApresentacao } from './playerLocalMidia.js';
import { atualizarUrlsObs, desligarProjecaoNestaMaquina, emModoProjecaoLocal, getProjecaoLocalActiva, getProjecaoLocalEmCurso, getServidorLanIpObs, ligarProjecaoNestaMaquina, ponteProjecaoLocal, setServidorLanIpObs, setServidorObsPort } from './projecaoLocalObs.js';
import { bibliaAplicarCfgExibicao, bibliaHaParteProjetada, bibliaLimparProjecaoOperador } from './biblia.js';
import { carregarMusicas, refreshListaBanco } from './bibliotecaMusicas.js';
import { criarSocketPainel } from '../modules/socketPainel.js';
import { criarTransporteSocket } from '../modules/projecaoPorta.js';
import { fonteBancoItemPlaylist, fonteBancoNormalizada } from '../modules/playlistVersaoMusica.js';
import { lerCurrentCfgCtrl, mesclarSlideCfgNoEstado, popularFormCfg, setCfgSwitchState, slidesAplicarCfgArmazenada } from './configExibicao.js';
import { loadAberturaRemovidaPorCulto, loadMinistrantePadraoPorCulto, loadTemaSelecionadoPorCulto, loadTemasPorCulto, migrarTemasParaGlobal, podarMinistrantePadraoSemMusicasNaPlaylist, setAberturaRemovidaPorCulto, setMinistrantePadraoPorCulto } from './playlistTemas.js';
import { obterRootIdMusicaAtiva, versaoAtivaParaCompararPlaylist } from './copiasLocaisPainel.js';
import { processarMusicasSincronizadasPayload } from './playlistAdicionar.js';
import { renderPlaylist } from './playlistLista.js';
import { renderSeletorMonitorContagem } from './contagemRegressiva.js';
import { renderSlidesStrip } from './slidesStrip.js';
import { tratarPedidoSincronizacaoBanco } from './sincronizacaoBanco.js';
import { videoProjetadoAtivoNoPlayer } from './videoApresentacao.js';
import { carregarRoteamentoTelasDoServidor } from './roteamentoTelas.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasEventosProjecao(d) {
  dep = d || {};
}
const agendarRepinturaCompositorAposEstadoServidor = (...a) => dep.agendarRepinturaCompositorAposEstadoServidor(...a);
const aplicarSelecaoUiPlaylist = (...a) => dep.aplicarSelecaoUiPlaylist(...a);
const assinaturaEstadoProjecaoRecebido = (...a) => dep.assinaturaEstadoProjecaoRecebido(...a);
const atualizarBtnModoApresentacao = (...a) => dep.atualizarBtnModoApresentacao(...a);
const atualizarFeedbackProjecaoApresentacaoUi = (...a) => dep.atualizarFeedbackProjecaoApresentacaoUi(...a);
const atualizarIndicadorProjecaoLiveUi = (...a) => dep.atualizarIndicadorProjecaoLiveUi(...a);
const atualizarRodapeAudioApresentacao = (...a) => dep.atualizarRodapeAudioApresentacao(...a);
const atualizarUiConexao = (...a) => dep.atualizarUiConexao(...a);
const ehModoApresentacaoOperador = (...a) => dep.ehModoApresentacaoOperador(...a);
const ehModoBibliaOperador = (...a) => dep.ehModoBibliaOperador(...a);
const ehModoSlidesOperador = (...a) => dep.ehModoSlidesOperador(...a);
const emitirPlaylistsDoControlador = (...a) => dep.emitirPlaylistsDoControlador(...a);
const enviarPlaylistsParaServidor = (...a) => dep.enviarPlaylistsParaServidor(...a);
const forcarRepinturaCompositorLyra = (...a) => dep.forcarRepinturaCompositorLyra(...a);
const hostProjecao = (...a) => dep.hostProjecao(...a);
const readLsMigrate = (...a) => dep.readLsMigrate(...a);
const projetarPorDuploCliqueCentral = (...a) => dep.projetarPorDuploCliqueCentral(...a);
const selecionarMusicaDoBanco = (...a) => dep.selecionarMusicaDoBanco(...a);
const sincronizarEstrofeAtiva = (...a) => dep.sincronizarEstrofeAtiva(...a);

export async function playlistDuploCliqueIniciarProjecao(itemOuId) {
  if (!ehModoSlidesOperador()) return;
  if (!dep.getProjecao().pronta()) return alert('Conecte ao servidor para projetar.');
  /* `hostProjecao`, não `getServidorIp`: a pergunta é «onde está a projeção», e no modo
     local a resposta é esta máquina mesmo sem IP nenhum configurado. Com `getServidorIp`
     uma instalação que nunca se ligou a um Servidor abortava aqui, com um pedido de IP
     que não se aplica a quem projeta localmente. */
  const hostAtual = hostProjecao();
  if (!hostAtual) return alert('Informe o IP ou use «Conectar».');
  const item =
    typeof itemOuId === 'object' && itemOuId !== null && !Array.isArray(itemOuId)
      ? itemOuId
      : { id: itemOuId };
  const idNum = Number(item.id);
  if (!Number.isFinite(idNum)) return;
  const rootAtivo = obterRootIdMusicaAtiva();
  const va = versaoAtivaParaCompararPlaylist();
  const vb = item.versaoLocalId ? String(item.versaoLocalId) : '';
  const itemBf = fonteBancoItemPlaylist(item);
  const curBf = fonteBancoNormalizada(dep.getMusicaBancoFonte());
  const mesmaMusicaEVersao =
    dep.getMusicaAtiva() &&
    Number.isFinite(rootAtivo) &&
    Number(item.id) === rootAtivo &&
    va === vb &&
    itemBf === curBf;
  if (!mesmaMusicaEVersao) {
    await selecionarMusicaDoBanco(idNum, {
      habilitarFaixaModoSlides: true,
      versaoLocalId: item.versaoLocalId || undefined,
      fonte: fonteBancoNormalizada(itemBf),
      origemUi: 'playlist',
    });
  } else {
    dep.setFaixaSlidesHabilitadaPorPlaylistNoModoSlides(true);
    aplicarSelecaoUiPlaylist(idNum, item.versaoLocalId, itemBf);
    refreshListaBanco();
    renderPlaylist();
    renderSlidesStrip();
  }
  dep.setSlidesDockVisivel(true);
  projetarPorDuploCliqueCentral(0);
}

/** true quando o servidor já informou que este controlador está em somente-leitura (write-lock). */
export function controladorSomenteLeitura() {
  return !!(dep.getPapelControladorLocal() && dep.getPapelControladorLocal().podeEscrever === false);
}

/**
 * Pull-by-role: aplica a config autoritativa do servidor ao painel SEM reempurrar.
 * Reutiliza o mesmo caminho de merge/preenchimento usado ao carregar a config local,
 * mas nunca chama enviarPreviewDisplayConfig — quem é somente-leitura não projeta.
 */
function aplicarDisplayConfigDoServidorNoPainel(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  try {
    mesclarSlideCfgNoEstado(cfg);
    popularFormCfg(lerCurrentCfgCtrl());
  } catch (_) {
    // intencional — shape inesperado do servidor não deve derrubar o painel
  }
}

/**
 * --- Canal de retorno da projeção ---
 *
 * O que as telas estão a mostrar volta por aqui. São funções **nomeadas** e de topo, e
 * não arrow functions inline como antes, por uma razão de mecânica: `iniciarSocket()`
 * corre a cada (re)ligação, e `projecao.aoReceber()` deduplica por identidade de função.
 * Um arrow criado dentro de `iniciarSocket` seria uma função nova a cada chamada — e o
 * painel passaria a reagir duas, três, N vezes ao mesmo `estado`. Com nomes de topo, a
 * reinscrição é idempotente e o `socket.off(...)` manual deixa de ser necessário.
 */

/**
 * Config autoritativa vinda de quem projeta. Pull-by-role:
 *  - somente-leitura: reflete a config no painel (fonte de verdade é quem projeta);
 *  - primário: guardamos, mas não sobrescrevemos o painel (o operador é a fonte).
 */
function aoReceberDisplayConfigDaProjecao(cfg) {
  dep.setUltimaDisplayConfigServidor(cfg);
  if (controladorSomenteLeitura()) aplicarDisplayConfigDoServidorNoPainel(cfg);
}

/** Estado do que está projetado nas telas. */
function aoReceberEstadoDaProjecao(estado) {
  const assinatura = assinaturaEstadoProjecaoRecebido(estado);
  if (assinatura !== null && assinatura === dep.getLyraAssinaturaEstadoProjecaoRecebido()) return;
  dep.setLyraAssinaturaEstadoProjecaoRecebido(assinatura);

  dep.setEstadoServidor(estado);
  sincronizarEstrofeAtiva(estado);
  /*
   * ESC no telão (ou outro controlador) encerrou a Bíblia: o marcador local tem de
   * acompanhar, senão o card fica «projetado» e o próximo ESC no painel parece falhar.
   * Contagem/aviso/mídia por cima NÃO contam como «Bíblia encerrada» — o versículo
   * continua por baixo e o marcador fica.
   */
  try {
    if (bibliaHaParteProjetada()) {
      const tip = estado && estado.tipo;
      const camadaPorCima =
        tip === 'contagem' || tip === 'apresentacao' || tip === 'aviso';
      /* `projecaoBibliaMinistrante`: com o alvo «Ministrante — M3» o canal público leva
         uma tela limpa de propósito, e o versículo viaja fora desta difusão. Sem ler a
         bandeira, o eco parecia dizer «Bíblia encerrada» e apagava o marcador verde — e
         com ele o estado de que o ESC precisa. Ver `projectionPayloads`. */
      const bibliaNoAr =
        !!estado.projecaoBibliaMinistrante ||
        (tip === 'biblia' &&
          !estado.telaLimpa &&
          Array.isArray(estado.linhas) &&
          estado.linhas.some((l) => String(l == null ? '' : l).length > 0));
      if (!camadaPorCima && !bibliaNoAr) {
        bibliaLimparProjecaoOperador();
      }
    }
  } catch (_) {
    // intencional — erro ignorado
  }
  atualizarPreviewOperador();
  atualizarIndicadorProjecaoLiveUi();
  atualizarBtnModoApresentacao();
  agendarRepinturaCompositorAposEstadoServidor();
  try {
    if (ehModoApresentacaoOperador() && (dep.getApresentacaoMidiaProjetadaId() || dep.getApresentacaoAvisoCard6Ativo())) {
      const tip = estado && estado.tipo;
      const minAp = !!(estado && estado.projecaoMinistranteApresentacao);
      const pubAp =
        tip === 'apresentacao' ||
        (tip === 'aviso' && dep.getApresentacaoAvisoCard6Ativo()) ||
        minAp;
      if (dep.getApresentacaoMidiaProjetadaId() && !pubAp && tip !== 'apresentacao') {
        dep.setApresentacaoMidiaProjetadaId(null);
      }
      if (dep.getApresentacaoAvisoCard6Ativo() && tip !== 'aviso' && !minAp) {
        dep.setApresentacaoAvisoCard6Ativo(false);
        dep.setUltimoPayloadAvisoCard6(null);
      }
      if (!dep.getApresentacaoMidiaProjetadaId() && !dep.getApresentacaoAvisoCard6Ativo()) {
        atualizarFeedbackProjecaoApresentacaoUi();
      } else {
        atualizarFeedbackProjecaoApresentacaoUi();
      }
    }
  } catch (_) {
// intencional — erro ignorado
}

}

/** Estado do player de áudio/vídeo da apresentação, do lado de quem projeta. */
function aoReceberAudioStateDaProjecao(st) {

  if (!st || typeof st !== 'object') return;
  if (videoProjetadoAtivoNoPlayer()) return;
  const estadoAnterior = { ...dep.getAudioStateRemoto() };
  const stAjustado = ajustarEstadoVisualRetomadaAudio(st, estadoAnterior);
  dep.setAudioStateRemoto({
    ...dep.getAudioStateRemoto(),
    ...stAjustado,
  });
  if (stAjustado.mediaKind) dep.getAudioStateRemoto().mediaKind = stAjustado.mediaKind;
  if (dep.getAudioStateRemoto().playing) {
    dep.setAudioLoopReinicioPendente(false);
  }
  atualizarUiPlayerAudioRemoto();
  const dur = Math.max(0, Number(dep.getAudioStateRemoto().duration) || 0);
  const atual = Math.max(0, Number(dep.getAudioStateRemoto().currentTime) || 0);
  const terminouFaixa =
    dep.getAudioLoopAtivo() &&
    !dep.getAudioLoopReinicioPendente() &&
    estadoAnterior.mediaKind === 'audio' &&
    estadoAnterior.playing === true &&
    dep.getAudioStateRemoto().playing === false &&
    dur > 0 &&
    atual >= Math.max(0, dur - 0.35) &&
    !!dep.getApresentacaoAudioAtualId();
  if (!terminouFaixa) return;
  const item = dep.getApresentacaoAudios().find((x) => x.id === dep.getApresentacaoAudioAtualId());
  if (!item?.src) return;
  dep.setAudioLoopReinicioPendente(true);
  void tocarAudioServidorApresentacao(item, { startTime: 0 }).then((ok) => {
    if (ok) {
      atualizarRodapeAudioApresentacao(item);
      return;
    }
    dep.setAudioLoopReinicioPendente(false);
  });

}

/*
 * As inscrições do canal de retorno são feitas UMA vez, ao carregar o painel — e não
 * dentro de `iniciarSocket()`.
 *
 * Enquanto viveram lá, existiam só no modo remoto: `iniciarSocket()` corre a partir de
 * `conectar()`, e no modo local nunca há ligação a fazer. O painel enviava comandos e não
 * recebia `estado` nenhum. `estadoServidor` ficava em `null`, e com ele morriam o preview
 * do operador, o badge do telão, a sincronização da estrofe activa e toda a decisão que
 * pergunta «o que está projetado agora».
 *
 * Aqui em cima funcionam para os dois transportes: a porta guarda as inscrições e
 * reinscreve-as sozinha ao trocar de transporte, e `aoReceber` deduplica por identidade
 * de função.
 */

/* Pedido de playlists vindo de um telemóvel, reencaminhado por quem hospeda a 5510. */



/*
 * O host avisou que o arranjo de monitores mudou (projetor ligado/desligado, resolução).
 *
 * Sem isto, os seletores só se actualizavam no arranque, ao ligar o socket e ao desenhar
 * a contagem — ligar o projetor com o app aberto deixava a lista desactualizada enquanto o
 * motor já tinha reorganizado as telas. `carregarRoteamentoTelasDoServidor()` é o caminho
 * completo: relê a lista, restaura a rota por identidade de monitor e avisa se algum
 * monitor configurado ficou em falta.
 */


/**
 * Hidrata o painel depois do handshake remoto — temas, banco, rotas, slides.
 * Vive no núcleo de propósito: não é protocolo Socket.IO.
 */
async function aoLigarSocketRemoto(_ip) {
  migrarTemasParaGlobal();
  dep.setTemasPorCulto(loadTemasPorCulto());
  dep.setTemaSelecionadoPorCulto(loadTemaSelecionadoPorCulto());
  setAberturaRemovidaPorCulto(loadAberturaRemovidaPorCulto());
  setMinistrantePadraoPorCulto(loadMinistrantePadraoPorCulto());
  podarMinistrantePadraoSemMusicasNaPlaylist();
  forcarRepinturaCompositorLyra();
  await carregarMusicas(_ip);
  await carregarRoteamentoTelasDoServidor();
  await carregarEstadoModoApresentacaoDoServidor();
  if (ehModoBibliaOperador()) bibliaAplicarCfgExibicao();
  else slidesAplicarCfgArmazenada();
  renderSlidesStrip();
  emitirEstadoMinistranteAoServidor();
  emitirPlaylistsDoControlador();
  enviarPlaylistsParaServidor();
  forcarRepinturaCompositorLyra();
  setTimeout(() => forcarRepinturaCompositorLyra(), 50);
  setTimeout(() => forcarRepinturaCompositorLyra(), 400);
}

function aoDisconnectSocketPainel({ descarteCliente }) {
  atualizarUiConexao(false);
  if (descarteCliente) {
    dep.setApresentacaoMidiaProjetadaId(null);
  }
  renderSlidesStrip();
  atualizarPreviewOperador();
  atualizarBtnModoApresentacao();
  try {
    if (ehModoApresentacaoOperador()) {
      if (descarteCliente) {
        atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'DESCONECTADO — sem ligação ao servidor.' });
      } else if (emModoProjecaoLocal()) {
        atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'Servidor desligado — a projetar nesta máquina.' });
      } else {
        atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'Servidor desligado — a reassumir projeção local…' });
      }
    }
  } catch (_) {
    // intencional
  }
}

export const socketPainel = criarSocketPainel({
  getSocket: () => dep.getSocket(),
  setSocket: (s) => { dep.setSocket(s); },
  io: () => (typeof io !== 'undefined' ? io : undefined),
  getProjecaoLocalActiva: () => getProjecaoLocalActiva(),
  getProjecaoLocalEmCurso: () => getProjecaoLocalEmCurso(),
  desligarProjecaoNestaMaquina,
  ligarProjecaoNestaMaquina,
  emModoProjecaoLocal,
  ponteProjecaoLocal,
  adotarTransporteSocket: (sock) => {
    dep.getProjecao().usarTransporte(criarTransporteSocket(sock));
  },
  getPapelControlador: () => dep.getPapelControladorLocal(),
  setPapelControlador: (p) => { dep.setPapelControladorLocal(p); },
  getCompanionHandoffEmCurso: () => dep.getCompanionHandoffEmCurso(),
  getAutoConectarAoIniciarEmCurso: () => dep.getAutoConectarAoIniciarEmCurso(),
  setAutoConectarAoIniciarEmCurso: (v) => { dep.setAutoConectarAoIniciarEmCurso(!!v); },
  getReassumirLocalEmCurso: () => dep.getReassumirLocalEmCurso(),
  setReassumirLocalEmCurso: (v) => { dep.setReassumirLocalEmCurso(!!v); },
  getServidorLanIpObs: () => getServidorLanIpObs(),
  setServidorLanIpObs: (v) => { setServidorLanIpObs(v); },
  setServidorObsPort: (v) => { setServidorObsPort(v); },
  getUltimaDisplayConfig: () => dep.getUltimaDisplayConfigServidor(),
  controladorSomenteLeitura,
  aplicarDisplayConfigDoServidor: aplicarDisplayConfigDoServidorNoPainel,
  atualizarUiConexao,
  atualizarUrlsObs,
  readLsMigrate,
  setCfgSwitchState,
  aoLigarRemoto: aoLigarSocketRemoto,
  aoDisconnectPainel: aoDisconnectSocketPainel,
  aoApresentacaoStateAtualizada: () => { carregarEstadoModoApresentacaoDoServidor(); },
  processarMusicasSincronizadas: processarMusicasSincronizadasPayload,
  tratarPedidoSincronizacaoBanco,
});

/**
 * Instruções que corriam no carregamento do núcleo. Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarEventosProjecao() {
  dep.getProjecao().aoReceber('display_config', aoReceberDisplayConfigDaProjecao);
  dep.getProjecao().aoReceber('solicitar_playlists_controlador', emitirPlaylistsDoControlador);
  dep.getProjecao().aoReceber('estado', aoReceberEstadoDaProjecao);
  dep.getProjecao().aoReceber('audio_state', aoReceberAudioStateDaProjecao);
  dep.getProjecao().aoReceber('monitores_alterados', () => {
    void carregarRoteamentoTelasDoServidor().then(() => {
      try { renderSeletorMonitorContagem(); } catch (_) {
        // intencional — o seletor da contagem pode ainda não estar montado
      }
    });
  });
}
