/**
 * =============================================================================
 * Lyra — Painel do controlador (JavaScript do renderer)
 * =============================================================================
 * Este ficheiro era um <script> inline gigante em controller.html. Foi extraído
 * para facilitar leitura, comentários e futuras divisões em módulos.
 *
 * ORDEM DE CARREGAMENTO (controller.html)
 *   0. css/controller.css — folha do painel (antes extraída do HTML)
 *   1. publicDisplayConfig.js — defaults de configuração de telas (partilhado)
 *   2. controllerApp.js (entrada ES module) → carrega este ficheiro
 *   3. controllerAppCore.js — toda a lógica deste painel (estado, UI, Socket.IO)
 *
 * CONVENÇÃO DE NOMES (não alterar à ligeira: HTML chama muitas funções por string)
 *   LS_*     — chaves do localStorage (persistência no browser)
 *   socket   — cliente Socket.IO para o servidor de projeção (porta 5510)
 *   estadoServidor — espelho do estado emitido pelo servidor ("estado")
 *   ehModo*  — funções que perguntam qual modo de UI está ativo (body.classList)
 *
 * MAPA DE SECÇÕES (marcadores «SECÇÃO A» … «SECÇÃO H» em comentários de linha)
 *   A — Modos de interface (slides / apresentação / completo) e transições
 *   B — Modo apresentação (ficheiros, áudio, grelha, HTTP :3001);
 *       tipo, URL e item em `modules/midiaApresentacao.js`
 *   C — Cultos, playlists, cópias locais, chaves localStorage;
 *       calendário em `modules/cultosCalendario.js`;
 *       ids/mapa de cópias locais em `modules/copiasLocaisLetra.js`;
 *       id e igualdade de item da playlist em `modules/playlistVersaoMusica.js`;
 *       fonte da busca de letras em `modules/fonteLetrasSite.js`
 *   D — Slides (dock, zoom, chips, edição de estrofes);
 *       geometria da grelha em `modules/slidesGrelha.js`
 *   E — Pré-visualização telão/ministrante e espelho do estado remoto
 *   F — Ligação IP, HTTP :3001 (músicas, bíblia, playlists, debounces)
 *   G — Socket.IO (estado em tempo real, sync playlists/músicas);
 *       handshake e IP em `modules/socketPainel.js`
 *   H — Tema escuro, modal de configuração de exibição, atalhos
 *
 * Módulos ES (`js/modules/`):
 *   chavesArmazenamentoLocal.js — chaves localStorage, URLs, SVG estáticos
 *   ponteHtmlWindow.js — expõe no `window` as funções chamadas pelo HTML inline
 *   socketPainel.js — handshake :5510, IP, badge e reassumir motor local
 *   slidesGrelha.js — zoom, colunas, auto-fit e digest da faixa de slides
 *   midiaApresentacao.js — tipo, URL segura, item e aviso do card 6
 *   cultosCalendario.js — ids, rótulos e geração do mês / extra manual
 *   copiasLocaisLetra.js — versão `c_*` vs SQLite e mapa no localStorage
 *   playlistVersaoMusica.js — id de fetch/pré-voo, fonte e igualdade de item
 *   fonteLetrasSite.js — seletor, placeholder e fonte do POST importar
 * `js/painel/` — utilitários reutilizáveis (extrair gradualmente mais blocos aqui):
 *   appDialog.js — diálogo padrão (alerta, confirmação, texto, escolha); estado em `appDialogEstado`
 *   menuLyra.js / lyraMenuConteudo.js — menu Ajuda/Ferramentas do Lyra (janela, fluxos, manual, atalhos)
 *   bannerAtualizacao.js — banner de atualização do app e dos componentes (companion)
 *   docs.js — modo DOCS: biblioteca, faixa de páginas, prévia e projeção
 *   contagemRegressiva.js — painel da Contagem (DOM e transporte; a regra está em modules/contagemPainel.js)
 *   biblia.js — modo Bíblia: tradução, livros/capítulos/versículos, busca rápida, projeção e aparência
 *   configExibicao.js — Exibição (Ajustes): modal de configuração, tema escuro e config de slides
 *   bibliotecaMusicas.js — biblioteca de músicas: lista, busca local/internet, seleção em lote, alfabeto, âncora, importação e nova música manual
 *   versoesMusica.js — versões da música: barra de versões, chips, renomear/remover (servidor e cópias locais) e troca de versão
 *   letraCompleta.js — modo «letra completa» da coluna central (texto corrido, guias de estrofe, edição pendente)
 *   comparativoVersoes.js — modo comparativo: duas versões lado a lado, realces e gravação
 *   editorEstrofes.js — editor de estrofes: cartões, caixa de letras, alturas, persistência da música e nova versão
 *   playlistTemas.js — playlists por culto: persistência, temas, marcadores, ministrante padrão e «abertura»
 *   copiasLocaisPainel.js — cópias locais de letra e versões do servidor da música ativa (mapa, leitura e gravação)
 *   cultoDoDia.js — culto do dia: cultos manuais, calendário, seletor (dropdown) e migração de playlists antigas
 *   playlistCompartilhar.js — compartilhar e importar playlist por código (modais, confirmação de importação e conflitos de músicas)
 *   sincronizacaoBanco.js — sincronização do banco compartilhado (snapshot, modal, PC parceiro) e envio de playlists ao servidor
 *   playlistTransmitidas.js — playlist: músicas já transmitidas (check verde), última projetada e seleção na interface
 *   ministrantesTons.js — ministrantes e tons da playlist: seletor do culto, cadastro nos Ajustes, importação e sincronização de tons e da playlist Lyra
 *   playlistLista.js — playlist: renderização, contagens, copiar nomes, animação de reordenação e arrastar/soltar
 *   playlistAdicionar.js — playlist: adicionar música/versão e modal de novas músicas sincronizadas
 *   playlistMenus.js — playlist: menus flutuantes (linha, tema, momento) e ações da barra
 *   videoApresentacao.js — mídias: vídeo da apresentação (HTTP, miniaturas, restauração) e projeção de itens
 *   playerLocalMidia.js — mídias: motor de áudio/vídeo local e no servidor (play, pausa, volume, seek, relógio da interface)
 *   bibliotecaMidiasApresentacao.js — mídias: criação de itens a partir de arquivos e biblioteca de mídias (abas, busca, renomear, excluir)
 *   playlistVideoApresentacao.js — mídias: playlist de vídeos (avanço automático, ordem, atraso, interface) e controles de áudio do servidor
 *   gridApresentacao.js — mídias: grelha de cards da apresentação (seleção, card de 4 imagens, adicionar arquivos)
 *   estadoApresentacao.js — mídias: estado do modo apresentação (coletar/aplicar, gravar no armazenamento, sincronizar com o servidor)
 *   slidesStrip.js — faixa de slides: renderização, menu de contexto, edição rápida e exclusão de slide
 *   projecaoLocalObs.js — projeção nesta máquina (IPC) e URLs de OBS
 *   previewLetras.js — modal de pré-visualização de letras (catálogo online/offline, linhas por slide, cópia)
 *   preVoo.js — pré-voo do culto: verificação de telas, músicas e mídias antes de começar
 *   removerMusicaBanco.js — excluir música do banco (modal de confirmação, exclusão em lote e limpeza da interface)
 *   tituloAberturaPreview.js — prévia do slide de título de abertura (M3) e primeiras linhas da estrofe para o ministrante
 *   previewProjecao.js — pré-visualização «ao vivo» do telão e do ministrante (relógio ocioso, instruções, espelho do estado)
 *   previewOculto.js — ocultar/mostrar a prévia do painel quando não há saída física (flags de sincronização, DOM, alternância)
 *   toolbarEdicaoHome.js — barra de edição da Home: título/artista editáveis, botões Editar/Salvar/Cancelar e estados dos modos
 *   roteamentoTelas.js — roteamento de telas no servidor: carregar e salvar rotas por modo
 *   eventosProjecao.js — eventos recebidos da projeção (estado, áudio, display, monitores), ligação do socket e duplo clique na playlist
 *   projecaoMusica.js — música ativa: seleção no banco, projeção/navegação de estrofes, voz, ir-para-slide, limpar/encerrar e blackout
 * =============================================================================
 */

import { montarHomeLayout } from './painel/homeLayout.js';

import {
  LS_UI_MODO_SLIDES,
  LS_MODO_APRESENTACAO_ATIVO,
  LS_ROTAS_POR_MODO,
  LS_PLAYLISTS,
  TEMA_PADRAO_ABERTURA,
  PLAYLIST_TIPO_MARCADOR_TEMA,
  LS_IP_KEY,
  LS_IP_LEGACY,
  LS_IP_LEMBRAR,
  LS_AUTO_CONECTAR,
  LS_SLIDES_RAIL_PX,
  LS_SLIDES_PREVIEW_H_PX,
  LS_SLIDES_CHIP_ZOOM,
  LS_SLIDES_POR_LINHA,
  LS_BANCO_SQLITE_LISTA_ABERTA,
} from './modules/chavesArmazenamentoLocal.js';
import { migrarChavesLegadoLocalStorage } from './modules/migrarChavesArmazenamentoLocal.js';
import {
  parseLabelCulto,
} from './modules/cultosCalendario.js';
import {
  versaoLocalIdTrimado,
  fonteBancoNormalizada,
  fonteBancoItemPlaylist,
  ehMarcadorTemaPlaylist,
  playlistItemMesmaVersaoQueRaiz,
} from './modules/playlistVersaoMusica.js';
import {
  normalizarFonteLetrasSite,
  placeholderBuscaLetrasPorFonte,
} from './modules/fonteLetrasSite.js';
import {
  criarSlidesGrelha,
} from './modules/slidesGrelha.js';
import {
  rotuloTipoMidiaApresentacao,
  svgIconeTipoMidiaApresentacao,
  clonarCfgAvisoCard6Padrao,
  normalizarCfgAvisoCard6,
} from './modules/midiaApresentacao.js';
import { rotaSemMonitorRepetido as aplicarSaidaExclusiva } from './modules/saidasMonitorExclusivas.js';
import {
  precisaReporRotaSlides,
  rotaSlidesReposta,
  limparNaoExibirManualSlides,
} from './modules/reposicaoRotaSlides.js';
import {
  registrarEscolhaSeletorUnificado,
  limparOrdemNaoExibirUnificado,
} from './modules/ordemNaoExibirUnificado.js';
import {
  MODOS_COM_MEMORIA,
  definirLembrarMonitor,
  lembrarMonitorLigado,
  registrarEscolhaMonitor,
  rotaLembradaParaEntrada,
} from './modules/monitorLembrado.js';
import { fecharMenuFlutuanteAberto } from './modules/menuFlutuante.js';
import { exporCallbacksParaAtributosHtml } from './modules/ponteHtmlWindow.js';
import {
  configurarNotasSlideControlador,
} from './modules/notasSlideControlador.js';
import {
  COR_COMENTARIO_MINISTRANTE_PADRAO,
} from './modules/comentariosSlide.js';
import { iniciarDicasDeTextoTruncado } from './modules/dicaTexto.js';
import {
  normalizarMinistranteIdPlaylist,
  normalizarTomPlaylist,
} from './modules/playlistMinistranteTom.js';

migrarChavesLegadoLocalStorage();
import { escapeHtml } from './painel/textoHtmlSeguro.js';
import {
  limparEstiloPreviewSlide,
  reaplicarFontesPreviewPainel,
} from './painel/tipografiaPainelPreview.js';
import {
  criarPortaProjecao,
} from './modules/projecaoPorta.js';
import {
  resumirComparacao,
} from './modules/diffLetrasComparativo.js';
import {
  identidadesDaRota,
  guardarIdentidadesRota,
  restaurarRotaPorIdentidade,
} from './modules/identidadeMonitores.js';
import {
  alvoDeRota,
  rotaCobreAlvo,
} from './modules/rotaEnvioBiblia.js';
import {
  appDialogEstado,
  fecharAppDialog,
  appAlert,
  registrarDependenciasAppDialog,
} from './painel/appDialog.js';
import {
  fecharLyraMenuModal,
  atualizarModalStatusReinicioServidor,
  tratarComandoMenuLyra,
  registrarDependenciasMenuLyra,
} from './painel/menuLyra.js';
import {
  lyraUpdaterUiState,
  esconderBannerAtualizacao,
  mostrarBannerAtualizacaoDisponivel,
  mostrarBannerProgressoAtualizacao,
  mostrarBannerAtualizacaoPronta,
  mostrarBannerCompanionDisponivel,
  mostrarBannerCompanionProgresso,
  registrarDependenciasBannerAtualizacao,
} from './painel/bannerAtualizacao.js';
import {
  atualizarBtnModoDocs,
  abrirModoDocs,
  fecharModoDocs,
  encerrarRotaModoDocs,
  navegarPaginaDocs,
  projetarPaginaDocs,
  adicionarArquivosAosDocs,
  escolherArquivoModoDocs,
  carregarDocsBibliotecaDoStorage,
  renderListaDocsImportados,
  configurarBuscaDocsImportados,
  docsHaPaginaProjetada,
  docsPaginaSelecionadaAtual,
  registrarDependenciasDocs,
} from './painel/docs.js';
import {
  onContagemCfgChange,
  setPosContagemCtrl,
  onContagemBgImagemChange,
  limparImagemFundoContagem,
  restaurarPadraoContagem,
  alternarPainelContagem,
  abrirPainelContagem,
  iniciarContagemRegressivaPainel,
  registrarDependenciasContagem,
} from './painel/contagemRegressiva.js';
import {
  alternarModoBiblia,
  aplicarTraducaoBibliaNoSelect,
  atualizarBtnModoBiblia,
  bibliaHaParteProjetada,
  bibliaNavPopupAberto,
  bibliaNavPopupFechar,
  bibliaNavegarVersiculosComSeta,
  bibliaPayloadCfgExibicao,
  bibliaPopularFormularioCfg,
  bibliaSairModo,
  bibliaTratarKeydownModo,
  carregarBibliaCfgDoStorage,
  encerrarProjecaoModoBiblia,
  fetchListaTraducoesBiblia,
  getBibliaCfgExibicao,
  getBibliaCfgMinistrante,
  lerBibliaCfgDoFormularioMinistrante,
  lerBibliaCfgDoFormularioPublico,
  obterBibliaTraducaoSessao,
  onTraducaoBibliaChange,
  popularGradeLivros,
  reconhecimentoVozBiblia,
  registrarDependenciasBiblia,
  salvarBibliaCfgNoStorage,
} from './painel/biblia.js';
import {
  abrirCfgModal,
  aprimorarControlesVisuaisCfg,
  fecharCfgModal,
  getChkVal,
  iniciarConfigExibicao,
  lerNumeroInput,
  registrarDependenciasConfigExibicao,
  setChkVal,
  setInputVal,
  setSelVal,
  setSpanText,
  slidesAplicarCfgArmazenada,
} from './painel/configExibicao.js';
import {
  BIB_ORIGEM_META,
  carregarMusicas,
  configurarBarraSelecaoBiblioteca,
  configurarModalNovaMusicaManual,
  configurarNavegadorAlfabeticoBiblioteca,
  fecharModalNovaMusicaManual,
  filtrar,
  garantirBuscaLetrasEditavel,
  garantirBuscaLocalEditavel,
  initBancoPainelFromStorage,
  registrarDependenciasBibliotecaMusicas,
} from './painel/bibliotecaMusicas.js';
import {
  registrarDependenciasVersoesMusica,
} from './painel/versoesMusica.js';
import {
  aplicarLayoutModoLetraCompleta,
  atualizarTextoPainelLetraCompleta,
  confirmarProsseguirDescartandoEdicaoPendente,
  entrarModoLetraCompletaCentral,
  estrofesArraysIguaisParaEdicao,
  irParaGradeSlidesDesdeLetraCompleta,
  registrarDependenciasLetraCompleta,
  splitTextoLetraCompletaEmEstrofes,
  temEdicaoMusicaNaoGravada,
} from './painel/letraCompleta.js';
import {
  aplicarLayoutModoComparativo,
  comparativoSujoVsSnapshot,
  registrarDependenciasComparativoVersoes,
  sairModoComparativoParaTrocarModo,
} from './painel/comparativoVersoes.js';
import {
  atualizarEstrofesEditorInPlace,
  configurarCamposMetadadosMusicaHome,
  entrarModoEdicao,
  iniciarCriarNovaVersao,
  iniciarEditorEstrofes,
  novaEstrofe,
  persistirMusicaAtivaNoServidor,
  reaplicarAlturasEstrofesEditor,
  registrarDependenciasEditorEstrofes,
  renderEstrofesEditor,
  sincronizarFlagCaixaLetrasComTextoAtual,
} from './painel/editorEstrofes.js';
import {
  filtrarPlaylistRemovendoTemaComMarcadores,
  garantirAberturaNoCatalogoCulto,
  garantirMarcadorAberturaNaPlaylist,
  getTemasDoCultoAtual,
  loadAberturaRemovidaPorCulto,
  loadMinistrantePadraoPorCulto,
  loadPlaylists,
  loadTemaSelecionadoPorCulto,
  loadTemasPorCulto,
  marcarAberturaRemovidaPeloUsuario,
  normalizarListaTemas,
  normalizarTemaPlaylist,
  ordenarTemasLista,
  persistirMinistrantePadraoNoLocalStorage,
  playlistPossuiMarcadoresTema,
  podarMinistrantePadraoSemMusicasNaPlaylist,
  registrarDependenciasPlaylistTemas,
  saveTemaSelecionadoPorCulto,
  saveTemasPorCulto,
  setAberturaRemovidaPorCulto,
  setMinistrantePadraoPorCulto,
} from './painel/playlistTemas.js';
import {
  atualizarCopiaLocal,
  carregarVersoesMusicaServidor,
  encontrarCopiaLocal,
  garantirCopiaPadraoServidor,
  getCopiasParaMusica,
  musicaAtivaEhOriginalServidor,
  obterRootIdMusicaAtiva,
  registrarDependenciasCopiasLocaisPainel,
  removerCopiaLocal,
  versaoAtivaParaCompararPlaylist,
} from './painel/copiasLocaisPainel.js';
import {
  ajustarCorpoSeletoresDoCulto,
  cultoIdEhManual,
  fecharCultoDropdown,
  listarCultosDisponiveis,
  loadCultosManuais,
  migrarPlaylistsCultosAntigos,
  registrarDependenciasCultoDoDia,
  resolverCultoInicialPorAgenda,
  setCultoSelecionadoNaUi,
  setupAdicionarCultoManual,
  setupCultoDropdown,
  solicitarExcluirCultoManual,
} from './painel/cultoDoDia.js';
import {
  getAppImportarBloqueadoFechar,
  getModalImportarTimerAutoFechar,
  iniciarPlaylistCompartilhar,
  liberarBloqueioFecharImportPlaylist,
  registrarDependenciasPlaylistCompartilhar,
} from './painel/playlistCompartilhar.js';
import {
  aplicarSnapshotCompartilhadoNoRenderer,
  getEnviarPlaylistsServidorTimer,
  getModalSincronizarTimerAutoFechar,
  marcarBancoCompartilhadoAlterado,
  recuperarPedidoSyncBancoPendente,
  registrarDependenciasSincronizacaoBanco,
  setEnviarPlaylistsServidorTimer,
  setSharedBancoLocalUpdatedAt,
  tratarPedidoSyncBancoDirecto,
} from './painel/sincronizacaoBanco.js';
import {
  deselecionarMusicaAtivaAPartirDaPlaylist,
  playlistItemSelecionadoNaUi,
  registrarDependenciasPlaylistTransmitidas,
} from './painel/playlistTransmitidas.js';
import {
  garantirMinistrantesCarregados,
  iniciarSyncPeriodicoTonsInvb,
  nomeMinistrantePorId,
  onPlaylistTomChange,
  registrarDependenciasMinistrantesTons,
  renderListaCfgMinistrantes,
} from './painel/ministrantesTons.js';
import {
  configurarDragReordenarLinhaPlaylist,
  preferenciaMovimentoReduzido,
  registrarDependenciasPlaylistLista,
  renderPlaylist,
} from './painel/playlistLista.js';
import {
  addMusicaNaPlaylist,
  addMusicaNaPlaylistParaCulto,
  processarMusicasSincronizadasPayload,
  registrarDependenciasPlaylistAdicionar,
} from './painel/playlistAdicionar.js';
import {
  SVG_MENU_EDITAR,
  SVG_MENU_EXCLUIR,
  SVG_MENU_INSERIR,
  abrirMenuAcoesLinhaPlaylist,
  configurarAcoesPlaylist,
  configurarMenuMomentoPlaylist,
  configurarModalSyncPlaylist,
  configurarSeletorTemaPlaylist,
  registrarDependenciasPlaylistMenus,
} from './painel/playlistMenus.js';
import {
  registrarDependenciasVideoApresentacao,
  restaurarVideosModoApresentacao,
  urlMidiaApresentacaoHttpPorId,
  videoProjetadoAtivoNoPlayer,
} from './painel/videoApresentacao.js';
import {
  alternarLoopPlayerApresentacao,
  alternarMudoAudioApresentacao,
  atualizarUiPlayerAudioRemoto,
  definirVolumeAudioServidor,
  get_previewAlvoAtual,
  obterElementoVideoLocal,
  pararAudioLocalApresentacao,
  pararAudioServidorPlayback,
  posicionarOverlayPreview,
  prepararPlayerVideoAposProjetar,
  registrarDependenciasPlayerLocalMidia,
  seekAudioServidor,
  tocarAudioServidorApresentacao,
} from './painel/playerLocalMidia.js';
import {
  apLibFecharMenus,
  configurarBibliotecaMidiasApresentacao,
  importarArquivosBibliotecaMidias,
  registrarDependenciasBibliotecaMidiasApresentacao,
  renderListaAudiosApresentacao,
  renderMenuApresentacao,
} from './painel/bibliotecaMidiasApresentacao.js';
import {
  aoTerminarVideoPlaylist,
  atualizarPlaylistUiAoVivoSeMudou,
  cancelarAvancoAutoPlaylist,
  pararAudioServidor,
  playlistAdicionarVideos,
  playlistAlternarModo,
  playlistControlaReproducaoAtual,
  playlistDefinirAtraso,
  playlistLimpar,
  registrarDependenciasPlaylistVideoApresentacao,
  renderListaPlaylistApresentacao,
  tocarAudioAtualSelecionado,
} from './painel/playlistVideoApresentacao.js';
import {
  adicionarArquivoDiretoNoCard,
  adicionarArquivosAoMenu,
  adicionarImagemNaAreaCard4,
  getApresentacaoCardUiClickTimer,
  registrarDependenciasGridApresentacao,
  renderGridApresentacao,
  setApresentacaoCardSelecionadoIdx,
  setApresentacaoCardUiClickTimer,
} from './painel/gridApresentacao.js';
import {
  agendarSalvarEstadoAposDigitarAviso,
  armarGuardaVisualRetomadaAudio,
  carregarEstadoModoApresentacaoDoServidor,
  carregarEstadoModoApresentacaoDoStorage,
  encerrarModoApresentacaoNoTelao,
  flushSalvarEstadoAposDigitarAviso,
  gravarEstadoModoApresentacaoNoStorageAgora,
  limparGuardaVisualRetomadaAudio,
  normalizarItemApresentacao,
  registrarDependenciasEstadoApresentacao,
  salvarEstadoModoApresentacaoNoStorage,
} from './painel/estadoApresentacao.js';
import {
  abrirSlideQuickEditModal,
  fecharSlideDeleteConfirmModal,
  fecharSlideQuickEditModal,
  registrarDependenciasSlidesStrip,
  renderSlidesStrip,
  setupSlidesStripContextMenuEEdicaoRapida,
} from './painel/slidesStrip.js';
import {
  alternarProjecaoNestaMaquina,
  atualizarUrlsObs,
  emModoProjecaoLocal,
  ligarProjecaoNestaMaquina,
  ponteProjecaoLocal,
  registrarDependenciasProjecaoLocalObs,
} from './painel/projecaoLocalObs.js';
import {
  abrirModalPreviewLetras,
  abrirModalPreviewLetrasOffline,
  configurarModalPreviewLetras,
  definirIsolamentoSelecaoPreviewLetras,
  fecharModalPreviewLetras,
  registrarDependenciasPreviewLetras,
} from './painel/previewLetras.js';
import {
  correrPreVooDoCulto,
  iniciarPreVoo,
  registrarDependenciasPreVoo,
} from './painel/preVoo.js';
import {
  configurarModalExcluirMusica,
  fecharModalExcluirMusica,
  registrarDependenciasRemoverMusicaBanco,
  solicitarRemoverMusicaDoBancoServidor,
  solicitarRemoverMusicasDoBancoServidorEmLote,
} from './painel/removerMusicaBanco.js';
import {
  aplicarEstiloPreviewTituloAbertura,
  limparPreviewTituloMusicaAbertura,
  registrarDependenciasTituloAberturaPreview,
} from './painel/tituloAberturaPreview.js';
import {
  aplicarPreviewTelaoNoDom,
  atualizarPreviewOperador,
  atualizarPreviewPlaylistCentral,
  atualizarSlidesInstrucoes,
  configurarObserverPreviewMinistrante,
  definirControlosZoomFaixaSlidesInertes,
  definirNomeMusicaBarraSlides,
  definirPreviewRelogioOciosoMinistrante,
  definirVazioDaFaixaSlidesVisivel,
  deveRevelarRelogioPreviewMinistrante,
  emitirEstadoMinistranteAoServidor,
  hayProjecaoAtivaNoServidor,
  limparConteudoPreviewOperadorSlides,
  podeEspelharLetraNosPreviewsModoSlide,
  preencherPreviewOperadorSomenteEstadoServidorMusica,
  preencherPreviewOperadorSomenteMusicaLocal,
  registrarDependenciasPreviewProjecao,
  selecaoLocalAlinhadaComProjecaoMusicaServidor,
  sincronizarPreviewOciosoMinistranteSlides,
} from './painel/previewProjecao.js';
import {
  aplicarPreviewPainelOcultoNoDom,
  carregarPreviewPainelOcultoDoArmazenamento,
  registrarDependenciasPreviewOculto,
} from './painel/previewOculto.js';
import {
  atualizarBotoesSalvarCancelarBarraPadrao,
  atualizarToolbarCaixaLetrasEdicao,
  atualizarToolbarModoEdicao,
  cancelarModoComparativoCentral,
  marcacaoEstrofeEditor,
  metadadosMusicaSujosNaHome,
  registrarDependenciasToolbarEdicaoHome,
  renomearVersaoSelecionadaComNome,
} from './painel/toolbarEdicaoHome.js';
import {
  carregarRoteamentoTelasDoServidor,
  registrarDependenciasRoteamentoTelas,
  salvarRoteamentoTelasNoServidor,
} from './painel/roteamentoTelas.js';
import {
  controladorSomenteLeitura,
  iniciarEventosProjecao,
  playlistDuploCliqueIniciarProjecao,
  registrarDependenciasEventosProjecao,
  socketPainel,
} from './painel/eventosProjecao.js';
import {
  direcaoTeclaPassadorSlides,
  emitirEstrofeAoServidor,
  encerrarProjecaoDoControlador,
  exibirEstrofe,
  iniciarProjecaoMusica,
  montarPayloadExibirMusica,
  musicaEstadoCombinaComAtiva,
  navegarEstrofe,
  navegarEstrofePassadorSlides,
  navegarEstrofePorSeta,
  nomeCultoAtivoParaHistorico,
  projetarPorDuploCliqueCentral,
  reconhecimentoVozSlides,
  registrarDependenciasProjecaoMusica,
  selecionarMusicaDoBanco,
  sincronizarEstrofeAtiva,
  toggleBlackoutTelas,
} from './painel/projecaoMusica.js';

/*
 * Diálogo do app, menu Lyra e banner de atualização vivem em painel/. As dependências do núcleo são
 * registadas aqui, no topo, antes de qualquer diálogo poder abrir. Tudo é lido de forma preguiçosa
 * (funções que chamam a do núcleo / getters): as variáveis do núcleo são reatribuídas mais adiante.
 */
registrarDependenciasAppDialog({
  getModalSincronizarTimer: () => getModalSincronizarTimerAutoFechar(),
  getModalImportarTimer: () => getModalImportarTimerAutoFechar(),
  liberarBloqueioFecharImportPlaylist: (...a) => liberarBloqueioFecharImportPlaylist(...a),
  normalizarTemaPlaylist: (...a) => normalizarTemaPlaylist(...a),
});
registrarDependenciasMenuLyra({
  getSocket: () => socket,
  emModoProjecaoLocal: (...a) => emModoProjecaoLocal(...a),
  interromperReconexaoSocket: (...a) => interromperReconexaoSocket(...a),
  correrPreVooDoCulto: (...a) => correrPreVooDoCulto(...a),
  recarregarPainelControlador: (...a) => recarregarPainelControlador(...a),
  alternarProjecaoNestaMaquina: (...a) => alternarProjecaoNestaMaquina(...a),
  abrirCfgModal: (...a) => abrirCfgModal(...a),
});
registrarDependenciasBannerAtualizacao({
  setCompanionHandoffEmCurso: (valor) => {
    companionHandoffEmCurso = valor;
  },
});
registrarDependenciasDocs({
  apLibFecharMenus,
  aplicarMonitorLembradoAoEntrarNoModo,
  aplicarRotaDoModoAtualNaUiEServidor,
  atualizarBtnTelaInicial,
  canaisParaEncerrarConteudoApresentacao,
  definirEstadoBtnModoCabecalho,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  ehModoDocsOperador,
  ehModoSlidesOperador,
  emitirApresentacao,
  encerrarCanaisApresentacaoNoServidor,
  executarComTransicaoUi,
  executarSemTransicaoUi,
  getControllerApiBase,
  hayProjecaoMidiaApresentacaoAtiva,
  hostChaveMonitores,
  irParaTelaInicial,
  normalizarRota,
  obterAlvoProjecaoDeRota,
  rotaDesativada,
  salvarRoteamentoTelasNoServidor,
  sincronizarCheckboxLembrarMonitor,
  getRotasPorModo: () => rotasPorModo,
  getMonitoresServidorCache: () => monitoresServidorCache,
  getProjecao: () => projecao,
});
registrarDependenciasContagem({
  abrirCfgModal,
  carregarRoteamentoTelasDoServidor,
  definirEstadoBtnModoCabecalho,
  fecharMenusRoteamentoTelas,
  getChkVal,
  getServidorProjeccaoIp,
  indicesPadraoPublicoMinistranteApresentacao,
  lerNumeroInput,
  listaMonitoresParaProjecao,
  montarLabelMonitor,
  montarTitleMonitor,
  normalizarRota,
  rotaDesativada,
  salvarRoteamentoTelasNoServidor,
  sanitizarRotaProjecao,
  setChkVal,
  setInputVal,
  setSelVal,
  setSpanText,
  getRotasPorModo: () => rotasPorModo,
  getMonitoresServidorCache: () => monitoresServidorCache,
  getProjecao: () => projecao,
});
registrarDependenciasBiblia({
  aplicarMonitorLembradoAoEntrarNoModo,
  aplicarRotaDoModoAtualNaUiEServidor,
  atualizarBtnModoApresentacao,
  atualizarBtnTelaInicial,
  atualizarBtnToggleModoSlides,
  atualizarPreviewOperador,
  carregarTraducoes,
  definirEstadoBtnModoCabecalho,
  desativarRotasModosTransitorios,
  ehModoBibliaOperador,
  ehModoSlidesOperador,
  executarComTransicaoUi,
  getControllerApiBase,
  hayProjecaoApresentacaoModoAtiva,
  hayProjecaoAtivaModoBibliaOuApresentacao,
  hayProjecaoMidiaApresentacaoAtiva,
  liberarBloqueioUiModos,
  limparUiAoSairDoModoSlides,
  marcarRotaLiveNoDom,
  mensagemAlvoInvalidoBiblia,
  normalizarRota,
  preferenciaMovimentoReduzido,
  renderSlidesStrip,
  rotaDesativada,
  rotaSelecionadaNaUi,
  salvarRotasPorModoNoStorage,
  salvarRoteamentoTelasNoServidor,
  sincronizarCheckboxLembrarMonitor,
  getEstadoServidor: () => estadoServidor,
  getProjecao: () => projecao,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  getReconhecimentoVozSlides: () => reconhecimentoVozSlides,
  getRotasPorModo: () => rotasPorModo,
  getUltimoConteudoProjetadoModoUnificado: () => ultimoConteudoProjetadoModoUnificado,
  setEstadoServidor: (valor) => {
    estadoServidor = valor;
  },
  setUltimoConteudoProjetadoModoUnificado: (valor) => {
    ultimoConteudoProjetadoModoUnificado = valor;
  },
});
registrarDependenciasConfigExibicao({
  agendarAtualizacaoAvisoCard6AoVivo,
  algumCampoAvisoCard6EmEdicao,
  aplicarEstiloPreviewTituloAbertura,
  atualizarUrlsObs,
  carregarEstadoModoApresentacaoDoServidor,
  controladorSomenteLeitura,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  hostProjecao,
  renderGridApresentacao,
  renderListaCfgMinistrantes,
  salvarEstadoModoApresentacaoNoStorage,
  sincronizarPreviewOciosoMinistranteSlides,
  sincronizarTicksSliderVh,
  bibliaPayloadCfgExibicao,
  bibliaPopularFormularioCfg,
  carregarBibliaCfgDoStorage,
  lerBibliaCfgDoFormularioMinistrante,
  lerBibliaCfgDoFormularioPublico,
  salvarBibliaCfgNoStorage,
  getApresentacaoIdxCard5: () => APRESENTACAO_IDX_CARD5,
  getApresentacaoCard6AvisoCfg: () => apresentacaoCard6AvisoCfg,
  getApresentacaoCards: () => apresentacaoCards,
  getApresentacaoMidiaProjetadaId: () => apresentacaoMidiaProjetadaId,
  getBibliaCfgExibicao,
  getBibliaCfgMinistrante,
  getCorComentarioMinistrantePainel: () => corComentarioMinistrantePainel,
  getProjecao: () => projecao,
  setApresentacaoCard6AvisoCfg: (valor) => {
    apresentacaoCard6AvisoCfg = valor;
  },
  setCorComentarioMinistrantePainel: (valor) => {
    corComentarioMinistrantePainel = valor;
  },
});
registrarDependenciasBibliotecaMusicas({
  abrirModalPreviewLetras,
  abrirModalPreviewLetrasOffline,
  addMusicaNaPlaylist,
  aplicarPlaceholderBuscaLetras,
  atualizarUiToggleListaBancoSqlite,
  entrarModoEdicao,
  garantirCopiaPadraoServidor,
  getControllerApiBase,
  getLetrasSiteFonteAtual,
  getPlaylist,
  renderEstrofesEditor,
  renderItensLyraSelectDropdown,
  selecionarMusicaDoBanco,
  setupLyraSelectDropdownWrap,
  solicitarRemoverMusicaDoBancoServidor,
  solicitarRemoverMusicasDoBancoServidorEmLote,
  splitTextoEmEstrofesPorLinhaVaziaStrict,
  getSVG_MENU_EDITAR: () => SVG_MENU_EDITAR,
  getSVG_MENU_EXCLUIR: () => SVG_MENU_EXCLUIR,
  getSVG_MENU_INSERIR: () => SVG_MENU_INSERIR,
  getBancoSqliteListaExpandida: () => bancoSqliteListaExpandida,
  setBancoSqliteListaExpandida: (valor) => {
    bancoSqliteListaExpandida = valor;
  },
  getCultoId: () => cultoId,
  getLetrasSiteFonte: () => letrasSiteFonte,
  setLetrasSiteFonte: (valor) => {
    letrasSiteFonte = valor;
  },
  getSelecaoUiBiblioteca: () => selecaoUiBiblioteca,
  getTodasMusicas: () => todasMusicas,
  setTodasMusicas: (valor) => {
    todasMusicas = valor;
  },
});
registrarDependenciasVersoesMusica({
  atualizarCopiaLocal,
  atualizarEstrofesEditorInPlace,
  atualizarRotuloVersaoNasPlaylists,
  atualizarSomenteAtivoFaixaSlides,
  atualizarTextoPainelLetraCompleta,
  atualizarToolbarModoEdicao,
  carregarVersoesMusicaServidor,
  ehModoSlidesOperador,
  encontrarCopiaLocal,
  estrofesArraysIguaisParaEdicao,
  formatarRotuloVersaoExibicao,
  getControllerApiBase,
  getCopiasParaMusica,
  iniciarCriarNovaVersao,
  marcacaoEstrofeEditor,
  musicaAtivaEhOriginalServidor,
  obterRootIdMusicaAtiva,
  removerCopiaLocal,
  removerVersaoLocalDasPlaylists,
  renderEstrofesEditor,
  renderPlaylist,
  renderSlidesStrip,
  rotuloVersaoMaiusculo,
  splitTextoLetraCompletaEmEstrofes,
  temEdicaoMusicaNaoGravada,
  getBloqueioSincronizarEstrofeDoServidor: () => bloqueioSincronizarEstrofeDoServidor,
  setBloqueioSincronizarEstrofeDoServidor: (valor) => {
    bloqueioSincronizarEstrofeDoServidor = valor;
  },
  getEstrofeAtiva: () => estrofeAtiva,
  setEstrofeAtiva: (valor) => {
    estrofeAtiva = valor;
  },
  getModoEdicaoEstrofes: () => modoEdicaoEstrofes,
  getModoLetraCompletaCentral: () => modoLetraCompletaCentral,
  getMusicaAtiva: () => musicaAtiva,
  setMusicaAtiva: (valor) => {
    musicaAtiva = valor;
  },
  getMusicaBancoFonte: () => musicaBancoFonte,
  setMusicaBancoFonte: (valor) => {
    musicaBancoFonte = valor;
  },
  getMusicaRootId: () => musicaRootId,
  setMusicaRootId: (valor) => {
    musicaRootId = valor;
  },
  getMusicaVersaoLocalId: () => musicaVersaoLocalId,
  setMusicaVersaoLocalId: (valor) => {
    musicaVersaoLocalId = valor;
  },
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  setProjecaoMusicaEmitidaNoServidor: (valor) => {
    projecaoMusicaEmitidaNoServidor = valor;
  },
  getSnapshotEdicaoEstrofes: () => snapshotEdicaoEstrofes,
  setSnapshotEdicaoEstrofes: (valor) => {
    snapshotEdicaoEstrofes = valor;
  },
  getSnapshotLetraCompleta: () => snapshotLetraCompleta,
  setSnapshotLetraCompleta: (valor) => {
    snapshotLetraCompleta = valor;
  },
  getVersoesMusicaServidorCache: () => versoesMusicaServidorCache,
});
registrarDependenciasLetraCompleta({
  atualizarPreviewOperador,
  atualizarToolbarModoEdicao,
  ehModoSlidesOperador,
  marcacaoEstrofeEditor,
  metadadosMusicaSujosNaHome,
  montarPayloadExibirMusica,
  renderSlidesStrip,
  splitTextoEmEstrofesPorLinhaVaziaStrict,
  aplicarLayoutModoComparativo,
  comparativoSujoVsSnapshot,
  persistirMusicaAtivaNoServidor,
  renderEstrofesEditor,
  sairModoComparativoParaTrocarModo,
  sincronizarFlagCaixaLetrasComTextoAtual,
  getComparativoLados: () => comparativoLados,
  setComparativoLados: (valor) => {
    comparativoLados = valor;
  },
  getEstrofeAtiva: () => estrofeAtiva,
  setEstrofeAtiva: (valor) => {
    estrofeAtiva = valor;
  },
  getHomeLayout: () => homeLayout,
  getLetraCompletaEditando: () => letraCompletaEditando,
  setLetraCompletaEditando: (valor) => {
    letraCompletaEditando = valor;
  },
  getModoComparativoCentral: () => modoComparativoCentral,
  setModoComparativoCentral: (valor) => {
    modoComparativoCentral = valor;
  },
  getModoEdicaoEstrofes: () => modoEdicaoEstrofes,
  setModoEdicaoEstrofes: (valor) => {
    modoEdicaoEstrofes = valor;
  },
  getModoLetraCompletaCentral: () => modoLetraCompletaCentral,
  setModoLetraCompletaCentral: (valor) => {
    modoLetraCompletaCentral = valor;
  },
  getMusicaAtiva: () => musicaAtiva,
  getMusicaBancoFonte: () => musicaBancoFonte,
  getProjecao: () => projecao,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  getSnapshotComparativo: () => snapshotComparativo,
  setSnapshotComparativo: (valor) => {
    snapshotComparativo = valor;
  },
  getSnapshotEdicaoEstrofes: () => snapshotEdicaoEstrofes,
  setSnapshotEdicaoEstrofes: (valor) => {
    snapshotEdicaoEstrofes = valor;
  },
  getSnapshotLetraCompleta: () => snapshotLetraCompleta,
  setSnapshotLetraCompleta: (valor) => {
    snapshotLetraCompleta = valor;
  },
});
registrarDependenciasComparativoVersoes({
  atualizarBotoesSalvarCancelarBarraPadrao,
  atualizarPreviewOperador,
  atualizarToolbarModoEdicao,
  cancelarModoComparativoCentral,
  carregarVersoesMusicaServidor,
  formatarRotuloVersaoExibicao,
  getControllerApiBase,
  marcacaoEstrofeEditor,
  obterRootIdMusicaAtiva,
  renderSlidesStrip,
  renderEstrofesEditor,
  getComparativoLados: () => comparativoLados,
  setComparativoLados: (valor) => {
    comparativoLados = valor;
  },
  getEstrofeAtiva: () => estrofeAtiva,
  setEstrofeAtiva: (valor) => {
    estrofeAtiva = valor;
  },
  getModoComparativoCentral: () => modoComparativoCentral,
  setModoComparativoCentral: (valor) => {
    modoComparativoCentral = valor;
  },
  getMusicaAtiva: () => musicaAtiva,
  setMusicaAtiva: (valor) => {
    musicaAtiva = valor;
  },
  getMusicaBancoFonte: () => musicaBancoFonte,
  getMusicaRootId: () => musicaRootId,
  setMusicaRootId: (valor) => {
    musicaRootId = valor;
  },
  getSnapshotComparativo: () => snapshotComparativo,
  setSnapshotComparativo: (valor) => {
    snapshotComparativo = valor;
  },
});
registrarDependenciasEditorEstrofes({
  abrirSlideQuickEditModal,
  aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice,
  aplicarSplitsEstrofesDosTextareasAntesDePersistir,
  atualizarBotoesSalvarCancelarBarraPadrao,
  atualizarCopiaLocal,
  atualizarPreviewOperador,
  atualizarSlidesInstrucoes,
  atualizarToolbarCaixaLetrasEdicao,
  atualizarToolbarModoEdicao,
  carregarVersoesMusicaServidor,
  ehModoSlidesOperador,
  emitirEstrofeAoServidor,
  exibirEstrofe,
  getControllerApiBase,
  marcacaoEstrofeEditor,
  metadadosMusicaSujosNaHome,
  obterRootIdMusicaAtiva,
  projetarPorDuploCliqueCentral,
  renderPlaylist,
  renderSlidesStrip,
  repontarVersaoNaPlaylistDoCulto,
  splitTextoEmEstrofesPorLinhaVaziaStrict,
  versaoAtivaParaCompararPlaylist,
  getBloqueioSincronizarEstrofeDoServidor: () => bloqueioSincronizarEstrofeDoServidor,
  setBloqueioSincronizarEstrofeDoServidor: (valor) => {
    bloqueioSincronizarEstrofeDoServidor = valor;
  },
  getCaixaLetrasEdicaoMaiuscula: () => caixaLetrasEdicaoMaiuscula,
  setCaixaLetrasEdicaoMaiuscula: (valor) => {
    caixaLetrasEdicaoMaiuscula = valor;
  },
  getCultoId: () => cultoId,
  getEstrofeAtiva: () => estrofeAtiva,
  setEstrofeAtiva: (valor) => {
    estrofeAtiva = valor;
  },
  getHomeLayout: () => homeLayout,
  getModoEdicaoEstrofes: () => modoEdicaoEstrofes,
  setModoEdicaoEstrofes: (valor) => {
    modoEdicaoEstrofes = valor;
  },
  getModoLetraCompletaCentral: () => modoLetraCompletaCentral,
  setModoLetraCompletaCentral: (valor) => {
    modoLetraCompletaCentral = valor;
  },
  getMusicaAtiva: () => musicaAtiva,
  setMusicaAtiva: (valor) => {
    musicaAtiva = valor;
  },
  getMusicaBancoFonte: () => musicaBancoFonte,
  setMusicaBancoFonte: (valor) => {
    musicaBancoFonte = valor;
  },
  getMusicaRootId: () => musicaRootId,
  setMusicaRootId: (valor) => {
    musicaRootId = valor;
  },
  getMusicaVersaoLocalId: () => musicaVersaoLocalId,
  setMusicaVersaoLocalId: (valor) => {
    musicaVersaoLocalId = valor;
  },
  getProjecao: () => projecao,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  setProjecaoMusicaEmitidaNoServidor: (valor) => {
    projecaoMusicaEmitidaNoServidor = valor;
  },
  getSnapshotEdicaoEstrofes: () => snapshotEdicaoEstrofes,
  setSnapshotEdicaoEstrofes: (valor) => {
    snapshotEdicaoEstrofes = valor;
  },
  getSnapshotLetraCompleta: () => snapshotLetraCompleta,
  setSnapshotLetraCompleta: (valor) => {
    snapshotLetraCompleta = valor;
  },
});
registrarDependenciasPlaylistTemas({
  getControllerApiBase,
  getPlaylist,
  getTemaSelecionadoAtual,
  marcarBancoCompartilhadoAlterado,
  savePlaylists,
  setTemaSelecionadoAtual,
  getPlaylists: () => playlists,
  getTemaSelecionadoPorCulto: () => temaSelecionadoPorCulto,
  getTemasPorCulto: () => temasPorCulto,
});
registrarDependenciasCopiasLocaisPainel({
  getControllerApiBase,
  getMusicaAtiva: () => musicaAtiva,
  getMusicaBancoFonte: () => musicaBancoFonte,
  getMusicaRootId: () => musicaRootId,
  getMusicaVersaoLocalId: () => musicaVersaoLocalId,
  getVersoesMusicaServidorCache: () => versoesMusicaServidorCache,
  setVersoesMusicaServidorCache: (valor) => {
    versoesMusicaServidorCache = valor;
  },
});
registrarDependenciasCultoDoDia({
  fecharOutrosSeletoresDropdown,
  initCultoSelect,
  marcarBancoCompartilhadoAlterado,
  onCultoChange,
  savePlaylists,
  getCultoId: () => cultoId,
  setCultoId: (valor) => {
    cultoId = valor;
  },
  getCultosDoMesCache: () => cultosDoMesCache,
  getCultosManuaisCache: () => cultosManuaisCache,
  setCultosManuaisCache: (valor) => {
    cultosManuaisCache = valor;
  },
  getPlaylists: () => playlists,
  getTemaSelecionadoPorCulto: () => temaSelecionadoPorCulto,
  getTemasPorCulto: () => temasPorCulto,
});
registrarDependenciasPlaylistCompartilhar({
  addMusicaNaPlaylistParaCulto,
  garantirMinistrantesCarregados,
  getControllerApiBase,
  getPlaylist,
  initCultoSelect,
  nomeMinistrantePorId,
  onCultoChange,
  renderPlaylist,
  renderSeletorTemasPlaylist,
  savePlaylists,
  getCultoId: () => cultoId,
  setCultoId: (valor) => {
    cultoId = valor;
  },
  getCultosManuaisCache: () => cultosManuaisCache,
  setCultosManuaisCache: (valor) => {
    cultosManuaisCache = valor;
  },
});
registrarDependenciasSincronizacaoBanco({
  emitirPlaylistsDoControlador,
  forcarRepinturaCompositorLyra,
  getControllerApiBase,
  getServidorProjeccaoIp,
  initCultoSelect,
  onCultoChange,
  ponteProjecaoLocal,
  renderSeletorTemasPlaylist,
  getCultosManuaisCache: () => cultosManuaisCache,
  setCultosManuaisCache: (valor) => {
    cultosManuaisCache = valor;
  },
  getPlaylists: () => playlists,
  setPlaylists: (valor) => {
    playlists = valor;
  },
  getTemasPorCulto: () => temasPorCulto,
  setTemasPorCulto: (valor) => {
    temasPorCulto = valor;
  },
});
registrarDependenciasPlaylistTransmitidas({
  ehModoSlidesOperador,
  encerrarProjecaoDoControlador,
  getPlaylist,
  indiceProximaMusicaNaPlaylist,
  playlistItemMesmaVersaoQueAtiva,
  playlistItemMesmaVersaoQueSelecaoUi,
  renderPlaylist,
  getCultoId: () => cultoId,
  getFaixaSlidesHabilitadaPorPlaylistNoModoSlides: () => faixaSlidesHabilitadaPorPlaylistNoModoSlides,
  getMusicaAtiva: () => musicaAtiva,
  getProjecao: () => projecao,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  getSlidesRailUserRecolhido: () => slidesRailUserRecolhido,
  setSlidesRailUserRecolhido: (valor) => {
    slidesRailUserRecolhido = valor;
  },
});
registrarDependenciasMinistrantesTons({
  atualizarPreviewOperador,
  ehModoSlidesOperador,
  emitirEstadoMinistranteAoServidor,
  emitirEstrofeAoServidor,
  formatarRotuloVersaoExibicao,
  getControllerApiBase,
  getPlaylist,
  playlistItemMesmaVersaoQueAtiva,
  renderItensLyraSelectDropdown,
  rotuloVersaoMaiusculo,
  savePlaylists,
  setupLyraSelectDropdownWrap,
  renderPlaylist,
  getCultoId: () => cultoId,
  getEstrofeAtiva: () => estrofeAtiva,
  getMusicaAtiva: () => musicaAtiva,
  getPlaylists: () => playlists,
  setPlaylists: (valor) => {
    playlists = valor;
  },
  getProjecao: () => projecao,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
});
registrarDependenciasPlaylistLista({
  ehModoSlidesOperador,
  encerrarProjecaoDoControlador,
  garantirMusicaAtivaVisivelNaPlaylist,
  getPlaylist,
  getTemaSelecionadoAtual,
  ligarBotoesESeletoresLinhaPlaylist,
  playlistItemMesmaVersaoQueAtiva,
  renderSeletorTemasPlaylist,
  savePlaylists,
  setTemaSelecionadoAtual,
  sufixoRotuloVersaoPlaylist,
  getCultoId: () => cultoId,
  getMusicaAtiva: () => musicaAtiva,
  getPlaylists: () => playlists,
});
registrarDependenciasPlaylistAdicionar({
  formatarRotuloVersaoExibicao,
  getControllerApiBase,
  getPlaylist,
  getTemaSelecionadoAtual,
  onCultoChange,
  rotuloVersaoMaiusculo,
  savePlaylists,
  getCultoId: () => cultoId,
  getMusicaAtiva: () => musicaAtiva,
  getMusicaBancoFonte: () => musicaBancoFonte,
  getTemasPorCulto: () => temasPorCulto,
  getVersoesMusicaServidorCache: () => versoesMusicaServidorCache,
});
registrarDependenciasPlaylistMenus({
  ehModoSlidesOperador,
  excluirTemaDoCulto,
  fecharOutrosSeletoresDropdown,
  getPlaylist,
  obterTemasDisponiveisPlaylist,
  playlistAtualJaTemTema,
  renderSeletorTemasPlaylist,
  savePlaylists,
  setTemaSelecionadoAtual,
  getCultoId: () => cultoId,
});
registrarDependenciasVideoApresentacao({
  atualizarFeedbackProjecaoApresentacaoUi,
  atualizarRodapeAudioApresentacao,
  emModoProjecaoLocal,
  emitirApresentacao,
  getControllerApiBase,
  getServidorIp,
  getServidorProjeccaoIp,
  mensagemAlvoInvalidoApresentacao,
  monitoresApresentacaoCobremAlvo,
  normalizarItemApresentacao,
  obterAlvoProjecaoModoApresentacao,
  reidratarRotaApresentacaoDoSeletor,
  salvarEstadoModoApresentacaoNoStorage,
  atualizarUiPlayerAudioRemoto,
  cancelarAvancoAutoPlaylist,
  obterElementoVideoLocal,
  prepararPlayerVideoAposProjetar,
  renderGridApresentacao,
  tocarAudioServidorApresentacao,
  getAPRESENTACAO_IDX_CARD5: () => APRESENTACAO_IDX_CARD5,
  get_playlistProjetando: () => _playlistProjetando,
  getApresentacaoAudioAtualId: () => apresentacaoAudioAtualId,
  setApresentacaoAudioAtualId: (valor) => {
    apresentacaoAudioAtualId = valor;
  },
  getApresentacaoBiblioteca: () => apresentacaoBiblioteca,
  getApresentacaoCards: () => apresentacaoCards,
  getApresentacaoMidiaProjetadaId: () => apresentacaoMidiaProjetadaId,
  setApresentacaoMidiaProjetadaId: (valor) => {
    apresentacaoMidiaProjetadaId = valor;
  },
  getApresentacaoVideoPlaylist: () => apresentacaoVideoPlaylist,
  getAudioStateRemoto: () => audioStateRemoto,
  getPlaylistVideoAtiva: () => playlistVideoAtiva,
  setPlaylistVideoAtiva: (valor) => {
    playlistVideoAtiva = valor;
  },
});
registrarDependenciasPlayerLocalMidia({
  armarGuardaVisualRetomadaAudio,
  enviarComandoAudioProjeccao,
  hostProjecao,
  limparGuardaVisualRetomadaAudio,
  salvarEstadoModoApresentacaoNoStorage,
  aoTerminarVideoPlaylist,
  atualizarPlaylistUiAoVivoSeMudou,
  playlistControlaReproducaoAtual,
  getAPRESENTACAO_IDX_CARD5: () => APRESENTACAO_IDX_CARD5,
  getApresentacaoAudioAtualId: () => apresentacaoAudioAtualId,
  setApresentacaoAudioAtualId: (valor) => {
    apresentacaoAudioAtualId = valor;
  },
  getApresentacaoCards: () => apresentacaoCards,
  getApresentacaoMidiaProjetadaId: () => apresentacaoMidiaProjetadaId,
  getApresentacaoVideoPlaylist: () => apresentacaoVideoPlaylist,
  getAudioLoopAtivo: () => audioLoopAtivo,
  setAudioLoopAtivo: (valor) => {
    audioLoopAtivo = valor;
  },
  getAudioLoopReinicioPendente: () => audioLoopReinicioPendente,
  setAudioLoopReinicioPendente: (valor) => {
    audioLoopReinicioPendente = valor;
  },
  getAudioSeekDragging: () => audioSeekDragging,
  getAudioStateRemoto: () => audioStateRemoto,
  setAudioStateRemoto: (valor) => {
    audioStateRemoto = valor;
  },
  getProjecao: () => projecao,
});
registrarDependenciasBibliotecaMidiasApresentacao({
  atualizarFeedbackProjecaoApresentacaoUi,
  emitirEncerrarApresentacaoPublicoAoServidor,
  escolherArquivoModoApresentacao,
  salvarEstadoModoApresentacaoNoStorage,
  sincronizarPillProjecaoNav,
  adicionarArquivosAoMenu,
  renderGridApresentacao,
  getApresentacaoArquivoSelecionadoId: () => apresentacaoArquivoSelecionadoId,
  setApresentacaoArquivoSelecionadoId: (valor) => {
    apresentacaoArquivoSelecionadoId = valor;
  },
  getApresentacaoAudioAtualId: () => apresentacaoAudioAtualId,
  setApresentacaoAudioAtualId: (valor) => {
    apresentacaoAudioAtualId = valor;
  },
  getApresentacaoAudios: () => apresentacaoAudios,
  setApresentacaoAudios: (valor) => {
    apresentacaoAudios = valor;
  },
  getApresentacaoBiblioteca: () => apresentacaoBiblioteca,
  setApresentacaoBiblioteca: (valor) => {
    apresentacaoBiblioteca = valor;
  },
  getApresentacaoCard4Imagens: () => apresentacaoCard4Imagens,
  setApresentacaoCard4Imagens: (valor) => {
    apresentacaoCard4Imagens = valor;
  },
  getApresentacaoCards: () => apresentacaoCards,
  setApresentacaoCards: (valor) => {
    apresentacaoCards = valor;
  },
  getApresentacaoMidiaProjetadaId: () => apresentacaoMidiaProjetadaId,
  setApresentacaoMidiaProjetadaId: (valor) => {
    apresentacaoMidiaProjetadaId = valor;
  },
  getAudioStateRemoto: () => audioStateRemoto,
  setAudioStateRemoto: (valor) => {
    audioStateRemoto = valor;
  },
});
registrarDependenciasPlaylistVideoApresentacao({
  atualizarFeedbackProjecaoApresentacaoUi,
  atualizarRodapeAudioApresentacao,
  encerrarModoApresentacaoNoTelao,
  salvarEstadoModoApresentacaoNoStorage,
  renderGridApresentacao,
  get_playlistProjetando: () => _playlistProjetando,
  set_playlistProjetando: (valor) => {
    _playlistProjetando = valor;
  },
  get_playlistUiTocandoCache: () => _playlistUiTocandoCache,
  set_playlistUiTocandoCache: (valor) => {
    _playlistUiTocandoCache = valor;
  },
  getApresentacaoAudioAtualId: () => apresentacaoAudioAtualId,
  setApresentacaoAudioAtualId: (valor) => {
    apresentacaoAudioAtualId = valor;
  },
  getApresentacaoAudios: () => apresentacaoAudios,
  getApresentacaoMidiaProjetadaId: () => apresentacaoMidiaProjetadaId,
  getApresentacaoVideoPlaylist: () => apresentacaoVideoPlaylist,
  setApresentacaoVideoPlaylist: (valor) => {
    apresentacaoVideoPlaylist = valor;
  },
  getAudioStateRemoto: () => audioStateRemoto,
  getPlaylistVideoAtiva: () => playlistVideoAtiva,
  setPlaylistVideoAtiva: (valor) => {
    playlistVideoAtiva = valor;
  },
  getPlaylistVideoAtrasoAuto: () => playlistVideoAtrasoAuto,
  setPlaylistVideoAtrasoAuto: (valor) => {
    playlistVideoAtrasoAuto = valor;
  },
  getPlaylistVideoIndice: () => playlistVideoIndice,
  setPlaylistVideoIndice: (valor) => {
    playlistVideoIndice = valor;
  },
  getPlaylistVideoModo: () => playlistVideoModo,
  setPlaylistVideoModo: (valor) => {
    playlistVideoModo = valor;
  },
});
registrarDependenciasGridApresentacao({
  agendarSalvarEstadoAposDigitarAviso,
  aplicarEstiloTextareaAvisoCard6,
  atualizarFeedbackProjecaoApresentacaoUi,
  criarSeletorMonitorAvisoCard6,
  ehItemImagemApresentacao,
  ehModoApresentacaoOperador,
  emitirEncerrarApresentacaoPublicoAoServidor,
  encerrarAvisoCard6NoControlador,
  flushSalvarEstadoAposDigitarAviso,
  projetarAvisoCard6,
  salvarEstadoModoApresentacaoNoStorage,
  getAPRESENTACAO_IDX_CARD4: () => APRESENTACAO_IDX_CARD4,
  getAPRESENTACAO_IDX_CARD5: () => APRESENTACAO_IDX_CARD5,
  getApresentacaoAvisoCard6Ativo: () => apresentacaoAvisoCard6Ativo,
  getApresentacaoBiblioteca: () => apresentacaoBiblioteca,
  getApresentacaoCard4Imagens: () => apresentacaoCard4Imagens,
  getApresentacaoCard4InputTarget: () => apresentacaoCard4InputTarget,
  setApresentacaoCard4InputTarget: (valor) => {
    apresentacaoCard4InputTarget = valor;
  },
  getApresentacaoCard6AvisoCfg: () => apresentacaoCard6AvisoCfg,
  getApresentacaoCard6Texto: () => apresentacaoCard6Texto,
  setApresentacaoCard6Texto: (valor) => {
    apresentacaoCard6Texto = valor;
  },
  getApresentacaoCardInputTarget: () => apresentacaoCardInputTarget,
  setApresentacaoCardInputTarget: (valor) => {
    apresentacaoCardInputTarget = valor;
  },
  getApresentacaoCards: () => apresentacaoCards,
  getApresentacaoMidiaProjetadaId: () => apresentacaoMidiaProjetadaId,
  setApresentacaoMidiaProjetadaId: (valor) => {
    apresentacaoMidiaProjetadaId = valor;
  },
  getAudioStateRemoto: () => audioStateRemoto,
});
registrarDependenciasEstadoApresentacao({
  algumCampoAvisoCard6EmEdicao,
  aplicarExtrasModoApresentacao,
  ehModoApresentacaoOperador,
  encerrarProjecaoModoApresentacao,
  getControllerApiBase,
  hostProjecao,
  modoRoteamentoAtual,
  normalizarRota,
  renderRoteamentoTelas,
  salvarAvisoCard6CfgNoStorage,
  getAPRESENTACAO_IDX_CARD4: () => APRESENTACAO_IDX_CARD4,
  getAPRESENTACAO_IDX_CARD5: () => APRESENTACAO_IDX_CARD5,
  get_playlistUiTocandoCache: () => _playlistUiTocandoCache,
  set_playlistUiTocandoCache: (valor) => {
    _playlistUiTocandoCache = valor;
  },
  getApresentacaoArquivoSelecionadoId: () => apresentacaoArquivoSelecionadoId,
  setApresentacaoArquivoSelecionadoId: (valor) => {
    apresentacaoArquivoSelecionadoId = valor;
  },
  getApresentacaoAudioAtualId: () => apresentacaoAudioAtualId,
  setApresentacaoAudioAtualId: (valor) => {
    apresentacaoAudioAtualId = valor;
  },
  getApresentacaoAudios: () => apresentacaoAudios,
  setApresentacaoAudios: (valor) => {
    apresentacaoAudios = valor;
  },
  getApresentacaoBiblioteca: () => apresentacaoBiblioteca,
  setApresentacaoBiblioteca: (valor) => {
    apresentacaoBiblioteca = valor;
  },
  getApresentacaoCard4Imagens: () => apresentacaoCard4Imagens,
  getApresentacaoCard6AvisoCfg: () => apresentacaoCard6AvisoCfg,
  getApresentacaoCard6Texto: () => apresentacaoCard6Texto,
  getApresentacaoCards: () => apresentacaoCards,
  setApresentacaoCards: (valor) => {
    apresentacaoCards = valor;
  },
  getApresentacaoVideoPlaylist: () => apresentacaoVideoPlaylist,
  setApresentacaoVideoPlaylist: (valor) => {
    apresentacaoVideoPlaylist = valor;
  },
  getAudioLoopAtivo: () => audioLoopAtivo,
  getMonitoresServidorCache: () => monitoresServidorCache,
  getPlaylistVideoAtiva: () => playlistVideoAtiva,
  setPlaylistVideoAtiva: (valor) => {
    playlistVideoAtiva = valor;
  },
  getPlaylistVideoAtrasoAuto: () => playlistVideoAtrasoAuto,
  setPlaylistVideoAtrasoAuto: (valor) => {
    playlistVideoAtrasoAuto = valor;
  },
  getPlaylistVideoIndice: () => playlistVideoIndice,
  setPlaylistVideoIndice: (valor) => {
    playlistVideoIndice = valor;
  },
  getPlaylistVideoModo: () => playlistVideoModo,
  setPlaylistVideoModo: (valor) => {
    playlistVideoModo = valor;
  },
  getRotasPorModo: () => rotasPorModo,
});
registrarDependenciasSlidesStrip({
  ajustarEncaixeGrelhaSlidesModoSlides,
  aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice,
  atualizarPreviewOperador,
  atualizarSlidesInstrucoes,
  atualizarSomenteAtivoFaixaSlides,
  definirControlosZoomFaixaSlidesInertes,
  definirNomeMusicaBarraSlides,
  definirVazioDaFaixaSlidesVisivel,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  ehModoSlidesOperador,
  emitirEstrofeAoServidor,
  exibirEstrofe,
  marcacaoEstrofeEditor,
  podeAtualizarSomenteAtivoFaixaSlides,
  projetarPorDuploCliqueCentral,
  getEstadoServidor: () => estadoServidor,
  getEstrofeAtiva: () => estrofeAtiva,
  setEstrofeAtiva: (valor) => {
    estrofeAtiva = valor;
  },
  getFaixaSlidesHabilitadaPorPlaylistNoModoSlides: () => faixaSlidesHabilitadaPorPlaylistNoModoSlides,
  getModoLetraCompletaCentral: () => modoLetraCompletaCentral,
  getMusicaAtiva: () => musicaAtiva,
  getProjecao: () => projecao,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  getSlidesGrelha: () => slidesGrelha,
  getSlidesRailUserRecolhido: () => slidesRailUserRecolhido,
});
registrarDependenciasProjecaoLocalObs({
  atualizarUiConexao,
  carregarRoteamentoTelasDoServidor,
  ehModoBibliaOperador,
  emitirEstadoMinistranteAoServidor,
  getServidorIp,
  recordarIpsDestaMaquina,
  setStatusServidorRemoto,
  getPapelControladorLocal: () => papelControladorLocal,
  setPapelControladorLocal: (valor) => {
    papelControladorLocal = valor;
  },
  getProjecao: () => projecao,
  getSocket: () => socket,
});
registrarDependenciasPreviewLetras({
  getControllerApiBase,
  selecionarMusicaDoBanco,
});
registrarDependenciasPreVoo({
  getControllerApiBase,
  getPlaylist,
  nomeCultoAtivoParaHistorico,
  normalizarRota,
  obterRotaSlidesParaUi,
  sanitizarRotaProjecao,
  getApresentacaoAudios: () => apresentacaoAudios,
  getApresentacaoBiblioteca: () => apresentacaoBiblioteca,
  getApresentacaoCards: () => apresentacaoCards,
  getApresentacaoVideoPlaylist: () => apresentacaoVideoPlaylist,
  getCultoId: () => cultoId,
  getMonitoresServidorCache: () => monitoresServidorCache,
  getRotasPorModo: () => rotasPorModo,
});
registrarDependenciasRemoverMusicaBanco({
  ehModoSlidesOperador,
  getControllerApiBase,
  marcacaoEstrofeEditor,
  removerMusicaDeTodasPlaylists,
  atualizarPreviewOperador,
  getBloqueioSincronizarEstrofeDoServidor: () => bloqueioSincronizarEstrofeDoServidor,
  setBloqueioSincronizarEstrofeDoServidor: (valor) => {
    bloqueioSincronizarEstrofeDoServidor = valor;
  },
  getEstrofeAtiva: () => estrofeAtiva,
  setEstrofeAtiva: (valor) => {
    estrofeAtiva = valor;
  },
  getModoEdicaoEstrofes: () => modoEdicaoEstrofes,
  setModoEdicaoEstrofes: (valor) => {
    modoEdicaoEstrofes = valor;
  },
  getModoLetraCompletaCentral: () => modoLetraCompletaCentral,
  setModoLetraCompletaCentral: (valor) => {
    modoLetraCompletaCentral = valor;
  },
  getMusicaAtiva: () => musicaAtiva,
  setMusicaAtiva: (valor) => {
    musicaAtiva = valor;
  },
  getMusicaBancoFonte: () => musicaBancoFonte,
  setMusicaBancoFonte: (valor) => {
    musicaBancoFonte = valor;
  },
  getMusicaRootId: () => musicaRootId,
  setMusicaRootId: (valor) => {
    musicaRootId = valor;
  },
  getMusicaVersaoLocalId: () => musicaVersaoLocalId,
  setMusicaVersaoLocalId: (valor) => {
    musicaVersaoLocalId = valor;
  },
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  setProjecaoMusicaEmitidaNoServidor: (valor) => {
    projecaoMusicaEmitidaNoServidor = valor;
  },
  getSelecaoUiBiblioteca: () => selecaoUiBiblioteca,
  setSelecaoUiBiblioteca: (valor) => {
    selecaoUiBiblioteca = valor;
  },
  getSelecaoUiPlaylist: () => selecaoUiPlaylist,
  setSelecaoUiPlaylist: (valor) => {
    selecaoUiPlaylist = valor;
  },
  getSlidesDockVisivel: () => slidesDockVisivel,
  setSlidesDockVisivel: (valor) => {
    slidesDockVisivel = valor;
  },
  getSnapshotEdicaoEstrofes: () => snapshotEdicaoEstrofes,
  setSnapshotEdicaoEstrofes: (valor) => {
    snapshotEdicaoEstrofes = valor;
  },
  getVersoesMusicaServidorCache: () => versoesMusicaServidorCache,
  setVersoesMusicaServidorCache: (valor) => {
    versoesMusicaServidorCache = valor;
  },
});
registrarDependenciasTituloAberturaPreview({
  getPlaylist,
  playlistItemMesmaVersaoQueAtiva,
  getCultoId: () => cultoId,
  getMusicaAtiva: () => musicaAtiva,
});
registrarDependenciasPreviewProjecao({
  aplicarPreviewPainelOcultoNoDom,
  apresentacaoOcupandoCanalMinistrante,
  atualizarPreviewMonitorMinistranteSlides,
  atualizarPreviewMonitorPublicoSlides,
  atualizarPreviewsMonitoresVirtuaisModoSlides,
  classificarSaidaMonitorMinistranteSlides,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  ehModoSlidesOperador,
  musicaEstadoCombinaComAtiva,
  obterRotaSlidesParaUi,
  syncRoteamentoTelasModoSlidesNaUi,
  getCorComentarioMinistrantePainel: () => corComentarioMinistrantePainel,
  getEstadoServidor: () => estadoServidor,
  getEstrofeAtiva: () => estrofeAtiva,
  getFaixaSlidesHabilitadaPorPlaylistNoModoSlides: () => faixaSlidesHabilitadaPorPlaylistNoModoSlides,
  getHomeLayout: () => homeLayout,
  getModoEdicaoEstrofes: () => modoEdicaoEstrofes,
  getMusicaAtiva: () => musicaAtiva,
  getProjecao: () => projecao,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  getSlidesDockVisivel: () => slidesDockVisivel,
});
registrarDependenciasPreviewOculto({
  classificarSaidaMonitorMinistranteSlides,
  classificarSaidaMonitorPublicoSlides,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  ehModoSlidesOperador,
  indicesEfetivosRoteamentoDualCliente,
  normalizarRota,
  getRotasPorModo: () => rotasPorModo,
});
registrarDependenciasToolbarEdicaoHome({
  atualizarRotuloVersaoNasPlaylists,
  getControllerApiBase,
  getCaixaLetrasEdicaoMaiuscula: () => caixaLetrasEdicaoMaiuscula,
  getEstrofeAtiva: () => estrofeAtiva,
  getHomeLayout: () => homeLayout,
  getLetraCompletaEditando: () => letraCompletaEditando,
  setLetraCompletaEditando: (valor) => {
    letraCompletaEditando = valor;
  },
  getModoComparativoCentral: () => modoComparativoCentral,
  getModoEdicaoEstrofes: () => modoEdicaoEstrofes,
  getModoLetraCompletaCentral: () => modoLetraCompletaCentral,
  getMusicaAtiva: () => musicaAtiva,
  getMusicaBancoFonte: () => musicaBancoFonte,
  getMusicaVersaoLocalId: () => musicaVersaoLocalId,
});
registrarDependenciasRoteamentoTelas({
  aplicarRotaDoModoAtualNaUiEServidor,
  atualizarFeedbackProjecaoApresentacaoUi,
  avisarMonitoresConfiguradosEmFalta,
  ehModoSlidesOperador,
  hayProjecaoMidiaApresentacaoAtiva,
  hostProjecao,
  modoRoteamentoAtual,
  normalizarRota,
  obterRotaApresentacaoParaServidor,
  persistirIdentidadesDosModos,
  restaurarRotaSlidesAposLibertarMonitores,
  rotaRestauradaPorIdentidade,
  rotaSelecionadaNaUi,
  rotaSemMonitorRepetido,
  rotaSlidesAoEntrarNoModo,
  salvarRotasPorModoNoStorage,
  sanitizarRotaProjecao,
  emitirEstrofeAoServidor,
  getEstrofeAtiva: () => estrofeAtiva,
  getMonitoresServidorCache: () => monitoresServidorCache,
  setMonitoresServidorCache: (valor) => {
    monitoresServidorCache = valor;
  },
  getMusicaAtiva: () => musicaAtiva,
  getProjecao: () => projecao,
  getRotasPorModo: () => rotasPorModo,
});
registrarDependenciasEventosProjecao({
  agendarRepinturaCompositorAposEstadoServidor,
  aplicarSelecaoUiPlaylist,
  assinaturaEstadoProjecaoRecebido,
  atualizarBtnModoApresentacao,
  atualizarFeedbackProjecaoApresentacaoUi,
  atualizarIndicadorProjecaoLiveUi,
  atualizarRodapeAudioApresentacao,
  atualizarUiConexao,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  ehModoSlidesOperador,
  emitirPlaylistsDoControlador,
  enviarPlaylistsParaServidor,
  forcarRepinturaCompositorLyra,
  hostProjecao,
  readLsMigrate,
  projetarPorDuploCliqueCentral,
  selecionarMusicaDoBanco,
  sincronizarEstrofeAtiva,
  getApresentacaoAudioAtualId: () => apresentacaoAudioAtualId,
  getApresentacaoAudios: () => apresentacaoAudios,
  getApresentacaoAvisoCard6Ativo: () => apresentacaoAvisoCard6Ativo,
  setApresentacaoAvisoCard6Ativo: (valor) => {
    apresentacaoAvisoCard6Ativo = valor;
  },
  getApresentacaoMidiaProjetadaId: () => apresentacaoMidiaProjetadaId,
  setApresentacaoMidiaProjetadaId: (valor) => {
    apresentacaoMidiaProjetadaId = valor;
  },
  getAudioLoopAtivo: () => audioLoopAtivo,
  getAudioLoopReinicioPendente: () => audioLoopReinicioPendente,
  setAudioLoopReinicioPendente: (valor) => {
    audioLoopReinicioPendente = valor;
  },
  getAudioStateRemoto: () => audioStateRemoto,
  setAudioStateRemoto: (valor) => {
    audioStateRemoto = valor;
  },
  getAutoConectarAoIniciarEmCurso: () => autoConectarAoIniciarEmCurso,
  setAutoConectarAoIniciarEmCurso: (valor) => {
    autoConectarAoIniciarEmCurso = valor;
  },
  getCompanionHandoffEmCurso: () => companionHandoffEmCurso,
  getEstadoServidor: () => estadoServidor,
  setEstadoServidor: (valor) => {
    estadoServidor = valor;
  },
  getFaixaSlidesHabilitadaPorPlaylistNoModoSlides: () => faixaSlidesHabilitadaPorPlaylistNoModoSlides,
  setFaixaSlidesHabilitadaPorPlaylistNoModoSlides: (valor) => {
    faixaSlidesHabilitadaPorPlaylistNoModoSlides = valor;
  },
  getLyraAssinaturaEstadoProjecaoRecebido: () => lyraAssinaturaEstadoProjecaoRecebido,
  setLyraAssinaturaEstadoProjecaoRecebido: (valor) => {
    lyraAssinaturaEstadoProjecaoRecebido = valor;
  },
  getMusicaAtiva: () => musicaAtiva,
  getMusicaBancoFonte: () => musicaBancoFonte,
  getPapelControladorLocal: () => papelControladorLocal,
  setPapelControladorLocal: (valor) => {
    papelControladorLocal = valor;
  },
  getProjecao: () => projecao,
  getReassumirLocalEmCurso: () => reassumirLocalEmCurso,
  setReassumirLocalEmCurso: (valor) => {
    reassumirLocalEmCurso = valor;
  },
  getSlidesDockVisivel: () => slidesDockVisivel,
  setSlidesDockVisivel: (valor) => {
    slidesDockVisivel = valor;
  },
  getSocket: () => socket,
  setSocket: (valor) => {
    socket = valor;
  },
  getTemaSelecionadoPorCulto: () => temaSelecionadoPorCulto,
  setTemaSelecionadoPorCulto: (valor) => {
    temaSelecionadoPorCulto = valor;
  },
  getTemasPorCulto: () => temasPorCulto,
  setTemasPorCulto: (valor) => {
    temasPorCulto = valor;
  },
  getUltimaDisplayConfigServidor: () => ultimaDisplayConfigServidor,
  setUltimaDisplayConfigServidor: (valor) => {
    ultimaDisplayConfigServidor = valor;
  },
  getUltimoPayloadAvisoCard6: () => ultimoPayloadAvisoCard6,
  setUltimoPayloadAvisoCard6: (valor) => {
    ultimoPayloadAvisoCard6 = valor;
  },
});
registrarDependenciasProjecaoMusica({
  abrirMenuModoApresentacao,
  alternarListaBancoSqlite,
  alternarModoSlidesOperador,
  aplicarSelecaoUiBiblioteca,
  aplicarSelecaoUiPlaylist,
  apresentacaoProjecaoAtivaNoCanalPublico,
  conectar,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  ehModoSlidesOperador,
  fecharMenuModoApresentacao,
  getControllerApiBase,
  getPlaylist,
  hostProjecao,
  indiceProximaMusicaNaPlaylist,
  irParaTelaInicial,
  limparEspelhoLocalSoCamadaSlides,
  modoRoteamentoAtual,
  onCfgAutoConectarChange,
  onCfgLembrarIpChange,
  playlistItemMesmaVersaoQueAtiva,
  recarregarPainelControlador,
  revelarChipEstrofeFocado,
  getBloqueioSincronizarEstrofeDoServidor: () => bloqueioSincronizarEstrofeDoServidor,
  setBloqueioSincronizarEstrofeDoServidor: (valor) => {
    bloqueioSincronizarEstrofeDoServidor = valor;
  },
  getCultoId: () => cultoId,
  getEstadoServidor: () => estadoServidor,
  setEstadoServidor: (valor) => {
    estadoServidor = valor;
  },
  getEstrofeAtiva: () => estrofeAtiva,
  setEstrofeAtiva: (valor) => {
    estrofeAtiva = valor;
  },
  getFaixaSlidesHabilitadaPorPlaylistNoModoSlides: () => faixaSlidesHabilitadaPorPlaylistNoModoSlides,
  setFaixaSlidesHabilitadaPorPlaylistNoModoSlides: (valor) => {
    faixaSlidesHabilitadaPorPlaylistNoModoSlides = valor;
  },
  getLyraAssinaturaEstadoProjecaoRecebido: () => lyraAssinaturaEstadoProjecaoRecebido,
  setLyraAssinaturaEstadoProjecaoRecebido: (valor) => {
    lyraAssinaturaEstadoProjecaoRecebido = valor;
  },
  getModoEdicaoEstrofes: () => modoEdicaoEstrofes,
  setModoEdicaoEstrofes: (valor) => {
    modoEdicaoEstrofes = valor;
  },
  getModoLetraCompletaCentral: () => modoLetraCompletaCentral,
  setModoLetraCompletaCentral: (valor) => {
    modoLetraCompletaCentral = valor;
  },
  getMusicaAtiva: () => musicaAtiva,
  setMusicaAtiva: (valor) => {
    musicaAtiva = valor;
  },
  getMusicaBancoFonte: () => musicaBancoFonte,
  setMusicaBancoFonte: (valor) => {
    musicaBancoFonte = valor;
  },
  getMusicaRootId: () => musicaRootId,
  setMusicaRootId: (valor) => {
    musicaRootId = valor;
  },
  getMusicaVersaoLocalId: () => musicaVersaoLocalId,
  setMusicaVersaoLocalId: (valor) => {
    musicaVersaoLocalId = valor;
  },
  getProjecao: () => projecao,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  setProjecaoMusicaEmitidaNoServidor: (valor) => {
    projecaoMusicaEmitidaNoServidor = valor;
  },
  getSelecaoUiBiblioteca: () => selecaoUiBiblioteca,
  setSelecaoUiBiblioteca: (valor) => {
    selecaoUiBiblioteca = valor;
  },
  getSelecaoUiPlaylist: () => selecaoUiPlaylist,
  setSelecaoUiPlaylist: (valor) => {
    selecaoUiPlaylist = valor;
  },
  getSlidesDockVisivel: () => slidesDockVisivel,
  setSlidesDockVisivel: (valor) => {
    slidesDockVisivel = valor;
  },
  getSlidesGrelha: () => slidesGrelha,
  getSlidesRailUserRecolhido: () => slidesRailUserRecolhido,
  setSlidesRailUserRecolhido: (valor) => {
    slidesRailUserRecolhido = valor;
  },
  getSnapshotEdicaoEstrofes: () => snapshotEdicaoEstrofes,
  setSnapshotEdicaoEstrofes: (valor) => {
    snapshotEdicaoEstrofes = valor;
  },
  getSnapshotLetraCompleta: () => snapshotLetraCompleta,
  setSnapshotLetraCompleta: (valor) => {
    snapshotLetraCompleta = valor;
  },
  getTodasMusicas: () => todasMusicas,
  getUltimoConteudoProjetadoModoUnificado: () => ultimoConteudoProjetadoModoUnificado,
  setUltimoConteudoProjetadoModoUnificado: (valor) => {
    ultimoConteudoProjetadoModoUnificado = valor;
  },
  getVersoesMusicaServidorCache: () => versoesMusicaServidorCache,
  setVersoesMusicaServidorCache: (valor) => {
    versoesMusicaServidorCache = valor;
  },
});

/**
 * Porta de projeção — ver `modules/projecaoPorta.js`.
 *
 * Todo comando destinado às telas passa por aqui, e todo retorno sobre o que está
 * projetado entra por aqui. Nasce sem transporte: `iniciarSocket()` liga-lhe o socket.
 * Enquanto não houver transporte, `pronta()` é `false` e nada é enviado — o mesmo que
 * acontecia antes com `socket` ainda `null`.
 */
const projecao = criarPortaProjecao();

// --- SECÇÃO A: modos de UI, localStorage de layout, ícones ---
/** v2: padrão é modo completo; chave nova ignora preferência legada que deixava sempre «modo slides» ao abrir o .exe. */

function ehModoSlidesOperador() {
  return document.body.classList.contains('app-mod-slides');
}
function ehModoApresentacaoOperador() {
  return document.body.classList.contains('app-mod-apresentacao');
}
function ehModoBibliaOperador() {
  return document.body.classList.contains('app-mod-biblia');
}
function ehModoDocsOperador() {
  return document.body.classList.contains('app-mod-docs');
}

function liberarBloqueioUiModos() {
  try {
    if (typeof fecharMenusRoteamentoTelas === 'function') fecharMenusRoteamentoTelas();
  } catch (_) {
  // intencional — erro ignorado
}
  try {
    if (typeof bibliaNavPopupFechar === 'function') bibliaNavPopupFechar();
    const ov = document.getElementById('app-dialog-overlay');
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    document.getElementById('cfg-modal-overlay-ctrl')?.classList.remove('aberto');
    [
      'slide-quick-edit-backdrop',
      'slide-nota-backdrop',
      'slide-delete-confirm-backdrop',
      'letras-preview-backdrop',
      'musica-excluir-backdrop',
      'nova-musica-manual-backdrop',
      'culto-calendario-backdrop',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    definirIsolamentoSelecaoPreviewLetras(false);
    fecharMenuFlutuanteAberto();
  } catch (_) {
  // intencional — erro ignorado
}
}

/**
 * Enquanto for maior que zero, as trocas de ecrã aplicam-se sem cross-fade.
 * Só `executarSemTransicaoUi()` lhe mexe — ver a entrada no modo DOCS.
 */
let transicoesUiSuprimidas = 0;

/**
 * Corre `fn` com as View Transitions desligadas.
 *
 * Serve para as mudanças que envolvem mais do que uma troca de classe: encadeadas, cada
 * uma faria o seu cross-fade e o ecrã intermédio ficava à vista entre elas.
 */
function executarSemTransicaoUi(fn) {
  transicoesUiSuprimidas += 1;
  try {
    fn();
  } finally {
    transicoesUiSuprimidas -= 1;
  }
}

/**
 * Transição suave ao mudar modo ou aba (View Transitions API — Chromium/Electron).
 * No Electron a API pode deixar uma camada que bloqueia cliques — aí aplica o callback direto.
 */
function executarComTransicaoUi(fn) {
  try {
    liberarBloqueioUiModos();
  } catch (err) {
    console.error('[Lyra] liberarBloqueioUiModos', err);
  }
  const semAnimacaoViewTransition =
    transicoesUiSuprimidas > 0 ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    !!(typeof window !== 'undefined' && window.process?.versions?.electron);
  try {
    if (semAnimacaoViewTransition) {
      fn();
      return Promise.resolve();
    }
    if (typeof document.startViewTransition === 'function') {
      return document.startViewTransition(fn);
    }
  } catch (_) {
  // intencional — erro ignorado
}
  fn();
  return Promise.resolve();
}

function aplicarRotulosEPlaylistModoSlides() {
  const modo = ehModoSlidesOperador();
  const headPl = document.getElementById('playlist-panel-head');
  const cultoWrap = document.querySelector('.culto-select-wrap');
  /*
    Título em elemento próprio (não num nó de texto solto): na coluna estreita do modo
    slides o texto corrido quebrava a meio. Agora é só «CULTO», numa linha — vive na
    secção de datas, acima do seletor; os botões L/I/C/S ficam no cabeçalho.
  */
  let titulo = document.querySelector('.playlist-panel-head-titulo');
  if (!titulo && cultoWrap) {
    titulo = document.createElement('span');
    titulo.className = 'playlist-panel-head-titulo';
    cultoWrap.insertBefore(titulo, cultoWrap.firstChild);
  }
  if (headPl) {
    // Neutraliza nó de texto residual no cabeçalho, se ainda existir.
    headPl.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) n.textContent = '';
    });
  }
  /* «CULTO» nos dois modos: a lista tem cabeçalho próprio («PLAYLIST», logo acima dela),
     que é também onde vive o botão de copiar as músicas. */
  if (titulo) titulo.textContent = 'CULTO';
  /*
    Rótulo da barra da faixa: no modo slides ela identifica o que está carregado
    («MÚSICA ATUAL › Clamo Jesus»); nos outros modos continua a nomear a secção
    («SLIDES • Clamo Jesus»).
  */
  const marcaFaixa = document.querySelector('.slides-dock-bar-left .slides-dock-marca');
  const sepFaixa = document.querySelector('.slides-dock-bar-left .slides-dock-sep');
  if (marcaFaixa) marcaFaixa.textContent = modo ? 'Música atual' : 'Slides';
  if (sepFaixa) sepFaixa.textContent = modo ? '›' : '•';
  const playlistAcoes = document.getElementById('playlist-panel-head');
  if (playlistAcoes) playlistAcoes.hidden = modo;
  const t0 = document.getElementById('preview-titulo-tela-0');
  const t1 = document.getElementById('preview-titulo-tela-1');
  if (t0) t0.textContent = 'TELÃO / PÚBLICO / IGREJA';
  if (t1) t1.textContent = 'TV / MINISTRANTE / RETORNO';
  /* A troca de modo muda a largura (e o corpo base) do botão do culto sem passar por um
     `resize`: a descrição tem de ser remedida aqui também. */
  ajustarCorpoSeletoresDoCulto();
}

/**
 * Estado visual + acessível de um botão de modo do dock do cabeçalho.
 * `primary` é a classe de seleção lida pelo CSS; `aria-pressed` expõe o mesmo
 * estado a leitores de ecrã.
 */
function definirEstadoBtnModoCabecalho(idBtn, ativo, tituloAtivo, tituloInativo) {
  const btn = document.getElementById(idBtn);
  if (!btn) return;
  btn.classList.toggle('primary', ativo);
  btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  btn.title = ativo ? tituloAtivo : tituloInativo;
}

function atualizarBtnToggleModoSlides() {
  definirEstadoBtnModoCabecalho(
    'btn-toggle-modo-slides',
    ehModoSlidesOperador(),
    'MODO SLIDE (ativo)',
    'Entrar no MODO SLIDE',
  );
  atualizarBtnModoBiblia();
}

function atualizarBtnModoApresentacao() {
  definirEstadoBtnModoCabecalho(
    'btn-modo-apresentacao',
    ehModoApresentacaoOperador(),
    'MODO APRESENTAÇÃO (ativo)',
    'Entrar no MODO APRESENTAÇÃO',
  );
  atualizarBtnToggleModoSlides();
}

// (extraído) DOCS → painel/docs.js

function irParaTelaInicial() {
  if (ehModoDocsOperador()) {
    fecharModoDocs();
    return;
  }
  if (ehModoApresentacaoOperador()) {
    fecharMenuModoApresentacao();
    return;
  }
  if (ehModoBibliaOperador()) {
    alternarModoBiblia();
    return;
  }
  if (ehModoSlidesOperador()) {
    alternarModoSlidesOperador({ permitirDesativar: true });
    return;
  }
  liberarBloqueioUiModos();
  atualizarBtnToggleModoSlides();
}

// --- SECÇÃO B — Modo apresentação (grelha, áudio, sync :3001); tipo/URL/item em midiaApresentacao.js ---
function modoRoteamentoAtual() {
  if (ehModoDocsOperador()) return 'docs';
  if (ehModoApresentacaoOperador()) return 'apresentacao';
  if (ehModoBibliaOperador()) return 'biblia';
  if (ehModoSlidesOperador()) return 'slides';
  return 'completo';
}

function modoUsaSeletorMonitorUnificado() {
  const m = modoRoteamentoAtual();
  return m === 'apresentacao' || m === 'biblia' || m === 'docs';
}

function salvarRotasPorModoNoStorage() {
  try {
    localStorage.setItem(
      LS_ROTAS_POR_MODO,
      JSON.stringify({
        completo: normalizarRota(rotasPorModo.completo),
        slides: normalizarRota(rotasPorModo.slides),
      })
    );
  } catch (_) {
  // intencional — erro ignorado
}
}

/*
 * `LS_ROTAS_DEFINIDAS_PELO_OPERADOR` era lido aqui.
 *
 * A marca existia para um fim só: calar o preenchimento automático do modo Slides assim
 * que o operador mexesse no seletor, porque o automatismo não distinguia «ainda não
 * configurado» de «configurado como Não exibir». Com a regra nova — o preenchimento olha
 * apenas para o vazio TOTAL, e «Não exibir» nas duas saídas vale só dentro da sessão do
 * modo (ver `alternarModoSlidesOperador`) — essa distinção deixou de ser precisa, e a
 * marca ficou sem um único leitor.
 *
 * Removida em vez de mantida «por via das dúvidas»: uma chave de localStorage que só se
 * escreve é uma armadilha para quem vier a seguir — parece estado com significado e não
 * governa nada. A chave antiga fica nas instalações existentes, inofensiva, e nada a lê.
 */

function carregarRotasPorModoDoStorage() {
  try {
    const raw = localStorage.getItem(LS_ROTAS_POR_MODO);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        /* `completo` pode herdar a sessão anterior. O seletor do modo Slides é só de sessão:
           «Não exibir» e qualquer escolha manual morrem no reload — a rota de slides fica
           no estado inicial (−1/−1) até os monitores serem detectados e o padrão M2/M3
           aplicado em `carregarRoteamentoTelasDoServidor`. */
        if (p.completo && typeof p.completo === 'object') {
          rotasPorModo.completo = normalizarRota(p.completo);
        }
      }
    }
  } catch (_) {
  // intencional — erro ignorado
}
  limparNaoExibirManualSlides();
  rotasPorModo.slides = rotaDesativada();
  rotasPorModo.apresentacao = rotaDesativada();
  rotasPorModo.apresentacaoAviso = rotaDesativada();
  rotasPorModo.biblia = rotaDesativada();
  rotasPorModo.docs = rotaDesativada();
}

/**
 * Chave de agrupamento da configuração de monitores.
 * Projetar nesta máquina e comandar um PC servidor são setups de hardware distintos:
 * partilhar configuração entre eles restauraria monitores que não existem do outro lado.
 * @returns {string}
 */
function hostChaveMonitores() {
  if (emModoProjecaoLocal()) return 'local';
  return getServidorIp() || 'local';
}

/**
 * Grava quais monitores (por identidade) estão em uso, para o próximo arranque.
 *
 * Complementa — não substitui — `salvarRotasPorModoNoStorage`: os índices continuam a
 * ser a moeda de runtime, mas é daqui que sai a verdade quando o Windows renumera os
 * ecrãs entre sessões.
 */
function persistirIdentidadesDosModos() {
  const host = hostChaveMonitores();
  const lista = monitoresServidorCache;
  if (!Array.isArray(lista) || !lista.length) return;
  /* Só `completo` e `slides`: são as escolhas duradouras de infraestrutura («o telão é a
     LG TV»). `apresentacao` e `biblia` são rotas de sessão, deliberadamente repostas a
     «Não exibir» em cada arranque — persistir a sua identidade fá-las-ia ressuscitar. */
  ['completo', 'slides'].forEach((modo) => {
    const r = normalizarRota(rotasPorModo[modo]);
    /* Rota «Live — OBS» não usa monitor nenhum; gravar identidades aqui apagaria a
       escolha física do utilizador só por ele ter ido para o OBS por um momento. */
    if (r.live) return;
    const novas = identidadesDaRota(r, lista);
    /* Rota a −1 porque o monitor sumiu (sanitização), não porque o operador desligou.
       Gravar null apagaria a identidade e o aviso «Monitor não encontrado» desaparecia
       no recarregamento seguinte. */
    if (!novas.publico && !novas.ministrante) {
      const { faltou } = rotaRestauradaPorIdentidade(modo, r);
      if (faltou.length) return;
    }
    guardarIdentidadesRota(host, modo, novas);
  });
}

/**
 * Reescreve uma rota vinda do servidor com os monitores que o utilizador escolheu de facto.
 *
 * Regras:
 * - sem configuração guardada → devolve a rota do servidor intacta (primeira execução);
 * - configuração guardada e monitores presentes → aplica-a, mesmo que os índices do
 *   servidor apontem para outro lado (é exactamente o caso da renumeração do Windows);
 * - configuração guardada mas monitor ausente → devolve o canal desativado, para a UI
 *   pedir nova seleção em vez de projetar no ecrã errado.
 *
 * @param {string} modo
 * @param {object} rotaServidor
 * @returns {{rota: object, faltou: string[]}}
 */
function rotaRestauradaPorIdentidade(modo, rotaServidor) {
  const lista = monitoresServidorCache;
  const base = normalizarRota(rotaServidor);
  if (base.live) return { rota: base, faltou: [] };
  if (!Array.isArray(lista) || !lista.length) return { rota: base, faltou: [] };

  const { rota, houveSalvo, faltou } = restaurarRotaPorIdentidade(hostChaveMonitores(), modo, lista);
  if (!houveSalvo) return { rota: base, faltou: [] };
  return { rota: sanitizarRotaProjecao(rota, lista), faltou };
}

function rotaDesativada() {
  return { publicoIndex: -1, ministranteIndex: -1, live: false };
}

/* ─── «Lembrar monitor» (Bíblia e Mídias) — ver `modules/monitorLembrado.js` ─── */

/** Modo com memória de monitor aberto agora, ou `null`. */
function modoComMemoriaMonitorAtual() {
  const m = modoRoteamentoAtual();
  return MODOS_COM_MEMORIA.includes(m) ? m : null;
}

/** Põe o checkbox a dizer a verdade sobre o modo que está aberto. */
function sincronizarCheckboxLembrarMonitor() {
  const chk = document.getElementById('hdr-lembrar-monitor-chk');
  if (!chk) return;
  const modo = modoComMemoriaMonitorAtual();
  chk.checked = !!modo && lembrarMonitorLigado(hostChaveMonitores(), modo);
}

/**
 * Grava a escolha que o operador acabou de fazer no seletor unificado.
 *
 * Só daqui — do clique. Os caminhos automáticos escrevem «Não exibir» ao sair do modo, e
 * ouvi-los faria a memória apagar-se a si própria.
 */
function registrarEscolhaMonitorDoOperador() {
  const modo = modoComMemoriaMonitorAtual();
  if (!modo) return;
  const rota = rotaSelecionadaNaUi();
  if (!rota) return;
  registrarEscolhaMonitor(hostChaveMonitores(), modo, rota, monitoresServidorCache);
  avisarMonitoresConfiguradosEmFalta();
}

/**
 * Repõe o monitor lembrado — só à ENTRADA no modo.
 *
 * Aplicar isto a meio de uma projeção moveria a janela do que está no ar, e é por isso que
 * a projeção activa manda: com mídia ou versículo no telão, a rota em vigor fica como está
 * e a memória espera pela próxima entrada. «Monitor lembrado ≠ projeção ativa» corta nos
 * dois sentidos.
 *
 * @param {'biblia'|'apresentacao'} modo
 * @returns {boolean} houve reposição
 */
function aplicarMonitorLembradoAoEntrarNoModo(modo) {
  if (!MODOS_COM_MEMORIA.includes(modo)) return false;
  if (hayProjecaoAtivaModoBibliaOuApresentacao()) return false;
  /* Slides no ar: repor o monitor lembrado da Bíblia/Mídias reivindica o canal
     partilhado e o merge do servidor apaga a letra — trocar de aba não pode fazer isso. */
  if (projecaoMusicaEmitidaNoServidor) return false;
  /* Sem lista de monitores não se conclui nada: entrar no modo antes de o servidor
     responder daria «monitor não encontrado» para um monitor que está ligado e bem. A
     entrada seguinte, já com a lista, repõe. */
  if (!Array.isArray(monitoresServidorCache) || !monitoresServidorCache.length) return false;
  const { aplicar, rota, faltou } = rotaLembradaParaEntrada(
    hostChaveMonitores(),
    modo,
    monitoresServidorCache
  );
  if (!aplicar) return false;
  rotasPorModo[modo] = sanitizarRotaProjecao(rota, monitoresServidorCache);

  /*
   * A Bíblia não tem canal próprio no servidor: viaja no `apresentacao`, e é dali que
   * `obterRotaApresentacaoParaServidor()` monta o pacote. Sem este espelho, repor o monitor
   * lembrado enchia `rotasPorModo.biblia` e o servidor continuava a receber -1 — o painel
   * dava a projeção por feita e o M2 ficava vazio.
   *
   * O espelhamento já existia, mas só no ramo `usarValoresDaUi === true` de
   * `salvarRoteamentoTelasNoServidor` — o clique do operador. A reposição entra pelo
   * caminho automático e não passava por lá.
   *
   * Sem guarda de mídia no ar aqui de propósito: esta função já desistiu acima se houvesse
   * qualquer projeção activa, que é a mesma condição sob a qual aquele ramo se abstém de
   * mexer no canal partilhado.
   */
  if (modo === 'biblia') {
    rotasPorModo.apresentacao = { ...normalizarRota(rotasPorModo.biblia) };
  }

  /* Aviso do cabeçalho: só depende de haver (ou não) monitor de projeção. */
  avisarMonitoresConfiguradosEmFalta();
  return true;
}

function normalizarRota(obj) {
  const live = !!(obj && obj.live);
  const pub = parseInt(obj?.publicoIndex, 10);
  const min = parseInt(obj?.ministranteIndex, 10);
  return {
    publicoIndex: live ? -1 : Number.isFinite(pub) ? pub : -1,
    ministranteIndex: live ? -1 : Number.isFinite(min) ? min : -1,
    live,
  };
}

/**
 * Um monitor serve **uma** saída de cada vez — a regra vive em
 * `modules/saidasMonitorExclusivas.js`, para se poder ler e testar sem DOM.
 * Aqui só se garante que ela recebe uma rota já normalizada.
 *
 * @param {{publicoIndex:number, ministranteIndex:number, live?:boolean}} rota
 * @param {'publico'|'ministrante'} [canalQuePrevalece] a saída que o operador acabou de mexer
 */
function rotaSemMonitorRepetido(rota, canalQuePrevalece = 'publico') {
  return aplicarSaidaExclusiva(normalizarRota(rota), canalQuePrevalece);
}

function indiceMonitorPrincipalNaLista(monitores) {
  const lista = Array.isArray(monitores) ? monitores : [];
  const m = lista.find((x) => x && x.primary);
  return m != null ? m.index : 0;
}

/** Monitores onde a projeção pode abrir (nunca o principal / tela do utilizador). */
function listaMonitoresParaProjecao(lista) {
  const principal = indiceMonitorPrincipalNaLista(lista);
  return (Array.isArray(lista) ? lista : []).filter((m) => m && m.index !== principal);
}

function sanitizarIndiceMonitorProjecao(idx, lista) {
  if (!Number.isFinite(idx) || idx < 0) return -1;
  if (idx === indiceMonitorPrincipalNaLista(lista)) return -1;
  if (!(Array.isArray(lista) ? lista : []).some((m) => m && m.index === idx)) return -1;
  return idx;
}

/** Corrige rota salva com público/ministrante trocados (índices 2↔1 = Monitor 3↔2). */
function corrigirRotaMonitoresInvertida(rota, lista) {
  const r = normalizarRota(rota);
  if (r.live) return r;
  const sec = listaMonitoresParaProjecao(lista);
  const temM2 = sec.some((m) => m && m.index === 1);
  const temM3 = sec.some((m) => m && m.index === 2);
  if (!temM2 || !temM3) return r;
  if (r.publicoIndex === 2 && r.ministranteIndex === 1) {
    return { ...r, publicoIndex: 1, ministranteIndex: 2 };
  }
  return r;
}

function sanitizarRotaProjecao(rota, lista) {
  const r = normalizarRota(rota);
  if (r.live) return r;
  const base = {
    live: false,
    publicoIndex: sanitizarIndiceMonitorProjecao(r.publicoIndex, lista),
    ministranteIndex: sanitizarIndiceMonitorProjecao(r.ministranteIndex, lista),
  };
  return corrigirRotaMonitoresInvertida(base, lista);
}

function marcarRotaLiveNoDom(ligado) {
  const hidPub = document.getElementById('route-publico');
  const hidMin = document.getElementById('route-ministrante');
  if (!hidPub || !hidMin) return;
  if (ligado) {
    hidPub.dataset.live = '1';
    hidMin.dataset.live = '1';
  } else {
    delete hidPub.dataset.live;
    delete hidMin.dataset.live;
  }
}

function rotaLiveSelecionadaNaUi() {
  const hidPub = document.getElementById('route-publico');
  return !!(hidPub && hidPub.dataset && hidPub.dataset.live === '1');
}

/**
 * Imagem/vídeo/PDF/aviso do modo Mídias ainda no telão.
 * Trocar de modo NÃO pode encerrar esta projeção nem desativar a rota partilhada.
 */
function hayProjecaoMidiaApresentacaoAtiva() {
  if (apresentacaoMidiaProjetadaId) return true;
  if (estadoServidorEhProjecaoApresentacaoAtivaNoTelao()) return true;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  /*
   * `projecaoMinistranteApresentacao` diz apenas «há override no canal ministrante», e
   * não «há mídia no ar». A Bíblia projetada só no público também levanta essa marca: o
   * aplicador põe um override de tela limpa no ministrante para ele não continuar a
   * mostrar o que lá estava. Sem esta exclusão, o modo Bíblia dava-se a si próprio como
   * «mídia activa» e adoptava a rota antiga da Apresentação, descartando a escolha que o
   * operador acabara de fazer no seletor.
   *
   * Só `biblia` é excluída, e não `musica`: com slides no público é legítimo haver mídia
   * no canal do ministrante, e essa combinação tem de continuar a contar como activa. Com
   * a Bíblia não há ambiguidade — `exibir_versiculo` escreve sempre o override do
   * ministrante, portanto nenhuma mídia pode estar viva lá nesse momento.
   */
  if (e.tipo === 'biblia') return false;
  if (e.projecaoMinistranteApresentacao) return true;
  return false;
}

function hayProjecaoApresentacaoModoAtiva() {
  return hayProjecaoMidiaApresentacaoAtiva() || apresentacaoAvisoCard6Ativo;
}

/** Projeção de Bíblia ou apresentação ainda no ar — ao mudar de tela, manter rota de monitores. */
function hayProjecaoAtivaModoBibliaOuApresentacao() {
  if (hayProjecaoApresentacaoModoAtiva()) return true;
  if (bibliaHaParteProjetada()) return true;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.projecaoLive && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length) return true;
  if (e.projecaoBibliaMinistrante) return true;
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) return true;
  return false;
}

async function desativarRotasModosTransitorios(opts = {}) {
  if (opts.forcar !== true && hayProjecaoAtivaModoBibliaOuApresentacao()) return;
  const sync = opts.sincronizarServidor !== false;
  const projecaoApAtiva = hayProjecaoApresentacaoModoAtiva();
  /* Mídia no ar: Bíblia e Mídias partilham o canal `apresentacao` no dual-routing —
     desativar essa rota fecharia as janelas e encerraria a projeção. */
  if (!projecaoApAtiva) {
    rotasPorModo.apresentacao = rotaDesativada();
    restaurarRotaSlidesAposLibertarMonitores();
  }
  rotasPorModo.biblia = rotaDesativada();
  marcarRotaLiveNoDom(projecaoApAtiva ? !!normalizarRota(rotasPorModo.apresentacao).live : false);
  const modo = modoRoteamentoAtual();
  if (modo === 'apresentacao' || modo === 'biblia') {
    renderRoteamentoTelas(monitoresServidorCache, rotasPorModo[modo]);
  }
  if (sync) {
    try {
      await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
    } catch (_) {
  // intencional — erro ignorado
}
  }
  atualizarIndicadorProjecaoLiveUi();
}

function atualizarIndicadorProjecaoLiveUi() {
  const el = document.getElementById('indicador-live-obs');
  const wrap = document.getElementById('route-publico-dd');
  const liveSel = rotaLiveSelecionadaNaUi();
  const emModoLive = ehModoBibliaOperador() || ehModoApresentacaoOperador();
  const projetando =
    emModoLive &&
    liveSel &&
    hayProjecaoAtivaNoServidor() &&
    !!(estadoServidor && estadoServidor.projecaoLive);
  /*
     O selo «● LIVE → OBS» não aparece no modo Bíblia.

     Ali ele não acrescenta nada: o seletor ao lado já diz «Live — OBS», e o próprio
     versículo no ar é a confirmação de que está a sair. Dois avisos da mesma coisa, um
     deles a pulsar, num canto do cabeçalho que o operador tem debaixo dos olhos durante
     o culto inteiro.

     No modo Apresentação continua: lá o que está no ar é mídia, que pode estar a tocar sem
     o operador a ver, e o selo é o único sinal de que a saída Live está mesmo ativa. */
  const mostrarSelo = projetando && !ehModoBibliaOperador();
  if (el) {
    el.classList.toggle('oculto', !mostrarSelo);
    el.classList.toggle('indicador-live-obs--ativo', mostrarSelo);
  }
  if (wrap) {
    wrap.classList.toggle('route-dd--live-projetando', projetando);
    /* O seletor escolhe o destino; quem diz que há projeção no ar são os outros
       indicadores (pill, versículo na grelha, selo Live). */
    wrap.classList.remove('route-dd--projetando');
  }
  const btn = document.getElementById('route-publico-btn');
  if (btn && emModoLive && liveSel) {
    btn.title = projetando
      ? 'Live ativa — versículo no OBS (http://127.0.0.1:5001/obs)'
      : 'Live — OBS (sem monitores físicos; use Browser Source no OBS)';
  }
}

/** Índice efetivo por canal: apresentação substitui o slide no mesmo monitor. */
function indicesEfetivosRoteamentoDualCliente() {
  const s = normalizarRota(rotasPorModo.slides);
  const a = normalizarRota(rotasPorModo.apresentacao);
  if (a.live) {
    return { publicoIndex: -1, ministranteIndex: -1, live: true };
  }
  return {
    publicoIndex: a.publicoIndex >= 0 ? a.publicoIndex : s.publicoIndex,
    ministranteIndex: a.ministranteIndex >= 0 ? a.ministranteIndex : s.ministranteIndex,
    live: false,
  };
}

function apresentacaoOcupandoCanalPublico() {
  return normalizarRota(rotasPorModo.apresentacao).publicoIndex >= 0;
}

function apresentacaoOcupandoCanalMinistrante() {
  return normalizarRota(rotasPorModo.apresentacao).ministranteIndex >= 0;
}

/** Projeção activa do modo Apresentação no canal público (rota apresentação + estado no telão). */
function apresentacaoProjecaoAtivaNoCanalPublico() {
  const ap = normalizarRota(rotasPorModo.apresentacao);
  if (ap.live || ap.publicoIndex < 0) return false;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  if (e.tipo === 'apresentacao' && e.apresentacao && String(e.apresentacao.src || '').trim()) {
    return true;
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) return true;
  return false;
}

/** Projeção activa do modo Apresentação no canal ministrante. */
function apresentacaoProjecaoAtivaNoCanalMinistrante() {
  const ap = normalizarRota(rotasPorModo.apresentacao);
  if (ap.live || ap.ministranteIndex < 0) return false;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  /* Apenas M3: telão no socket pode ficar «limpo» com projecaoMinistranteApresentacao. */
  if (e.projecaoMinistranteApresentacao) return true;
  if (e.tipo === 'biblia' || e.tipo === 'musica') return false;
  if (
    ap.publicoIndex < 0 &&
    e.tipo === 'apresentacao' &&
    e.apresentacao &&
    String(e.apresentacao.src || '').trim()
  ) {
    return true;
  }
  return false;
}

/**
 * Versículo no ar no canal público.
 *
 * Gémeo de `apresentacaoProjecaoAtivaNoCanalPublico` para o outro inquilino do canal
 * partilhado. A rota diz QUAL canal a Bíblia pediu (o seletor dela), o estado do servidor
 * diz se há mesmo versículo no ar — as duas coisas, como no lado das Mídias.
 *
 * Não se funde com aquele: o classificador das prévias usa-o para escolher o rótulo da
 * badge, e «Imagem no Telão» não é «Versículo no Telão».
 */
function bibliaProjecaoAtivaNoCanalPublico() {
  const b = normalizarRota(rotasPorModo.biblia);
  if (b.live || b.publicoIndex < 0) return false;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  return !!(e.tipo === 'biblia' && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length);
}

/**
 * Versículo no ar no canal do ministrante.
 *
 * Dois caminhos porque o servidor tem dois: com alvo «ministrante» o canal público leva
 * override de tela limpa e o que sobra é a bandeira `projecaoBibliaMinistrante`; com alvo
 * «ambos» não há override nenhum e o versículo viaja no próprio payload público.
 */
function bibliaProjecaoAtivaNoCanalMinistrante() {
  const b = normalizarRota(rotasPorModo.biblia);
  if (b.live || b.ministranteIndex < 0) return false;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  if (e.projecaoBibliaMinistrante) return true;
  return !!(e.tipo === 'biblia' && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length);
}

/**
 * O canal público está ocupado por outro modo do canal partilhado — Mídias ou Bíblia?
 *
 * Uma noção só, para o seletor do Slides e para as prévias: o monitor está emprestado,
 * seja a uma imagem ou a um versículo. Quem precisa de saber QUAL dos dois (o rótulo da
 * badge) continua a perguntar aos predicados de cada modo.
 */
function canalPublicoOcupadoPorOutroModoNoSlides() {
  return apresentacaoProjecaoAtivaNoCanalPublico() || bibliaProjecaoAtivaNoCanalPublico();
}

/** Igual, para o canal do ministrante. */
function canalMinistranteOcupadoPorOutroModoNoSlides() {
  return apresentacaoProjecaoAtivaNoCanalMinistrante() || bibliaProjecaoAtivaNoCanalMinistrante();
}

/**
 * Telão com mídia do modo Apresentação activa (ignora Bíblia, Slides e fundo estático).
 * Usado pelo preview do modo Slide — não confundir bgImage da Bíblia com projeção.
 */
function estadoServidorEhProjecaoApresentacaoAtivaNoTelao() {
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.tipo === 'biblia' || e.tipo === 'musica') return false;
  if (e.telaLimpa || e.blackout || e.slidePretoFinal) return false;
  if (e.tipo === 'apresentacao') {
    return !!(e.apresentacao && String(e.apresentacao.src || '').trim());
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) return true;
  return false;
}

/** Preview Slide (público): informe de mídia da Apresentação activa no telão público. */
function slidePreviewDeveMostrarInformeMidiaApresentacaoNoPublico() {
  if (!ehModoSlidesOperador()) return false;
  return apresentacaoProjecaoAtivaNoCanalPublico();
}

/**
 * Mídia/aviso activos no canal ministrante (M3), para a prévia do modo Slides.
 * Usa o flag do socket (`projecaoMinistranteApresentacao`) e não só a rota local —
 * a rota pode ficar desactualizada ao projetar pelo Mídias noutro momento.
 * Exclui override de tela limpa da Bíblia e contagem (não são badge de mídia).
 */
function midiaApresentacaoAtivaNoCanalMinistranteParaPreviewSlides() {
  if (!ehModoSlidesOperador()) return false;
  if (apresentacaoProjecaoAtivaNoCanalMinistrante()) return true;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  if (e.tipo === 'biblia' || e.tipo === 'contagem') return false;
  return !!e.projecaoMinistranteApresentacao;
}

/** Preview Slide (ministrante): informe de mídia da Apresentação activa na TV ministrante. */
function slidePreviewDeveMostrarInformeMidiaApresentacaoNoMinistrante() {
  if (!ehModoSlidesOperador()) return false;
  return midiaApresentacaoAtivaNoCanalMinistranteParaPreviewSlides();
}

/**
 * Há projeção real no canal ministrante (M3) para a prévia do modo Slides.
 * Independente do M2: mídia só no telão não conta; slides no M3 contam mesmo com
 * Mídias no M2 (o `estado` do socket pode continuar `tipo: 'apresentacao'`).
 */
function hayProjecaoAtivaNoCanalMinistranteParaPreviewSlides() {
  if (!ehModoSlidesOperador()) return false;
  if (midiaApresentacaoAtivaNoCanalMinistranteParaPreviewSlides()) return true;
  if (obterRotaSlidesParaUi().ministranteIndex < 0) return false;

  /* Letra já emitida neste painel: M3 tem conteúdo mesmo com override de Mídias no público. */
  if (projecaoMusicaEmitidaNoServidor && musicaAtiva && Number(estrofeAtiva) >= 0) {
    return true;
  }

  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout) return true;
  if (e.tipo === 'musica') {
    if (e.slidePretoFinal) return true;
    return !!(!e.telaLimpa && e.linhas && e.linhas.length);
  }
  if (
    e.tipo === 'biblia' &&
    (!e.telaLimpa || e.projecaoSomenteMinistrante || e.projecaoBibliaMinistrante)
  ) {
    return !!(e.linhas && e.linhas.length) || !!e.projecaoBibliaMinistrante;
  }
  return false;
}

function preencherPreviewInformeMidiaApresentacaoSlide(el) {
  if (!el) return;
  const e = estadoServidor;
  const ap = e && e.apresentacao ? e.apresentacao : {};
  const kind = String(ap.kind || 'image').toLowerCase();
  const tipoRotulo = rotuloTipoMidiaApresentacao(kind);
  preencherPreviewBadgeInformativoSlides(el, {
    kind,
    label: `${tipoRotulo} no Telão`,
  });
}

/**
 * Badge informativo na prévia do modo Slides (conteúdo de outro modo no monitor).
 * @param {HTMLElement|null} el
 * @param {{ kind?: string, label: string }} badge
 */
function preencherPreviewBadgeInformativoSlides(el, badge) {
  if (!el) return;
  const kind = String(badge?.kind || 'image').toLowerCase();
  const label = String(badge?.label || 'Projeção no telão').trim();
  const iconKinds = new Set(['image', 'video', 'audio', 'pdf', 'iframe', 'aviso']);
  const icon = svgIconeTipoMidiaApresentacao(iconKinds.has(kind) ? kind : 'iframe');
  el.innerHTML = `<span class="pv-live-ap-meta">${icon}<span class="pv-live-ap-meta-txt">${escapeHtml(label)}</span></span>`;
  const clsBase = el.classList.contains('op-slide-text') ? 'op-slide-text' : 'pv-live-letras';
  el.className = clsBase;
  el.classList.remove('vazio');
  limparEstiloPreviewSlide(el);
}

/**
 * Classifica a saída real do M2 (público) para a prévia virtual do modo Slides.
 * Independente do M3 e da aba aberta — só o estado de saída deste monitor.
 * @returns {{ mode: 'idle'|'blackout'|'slides'|'badge', badge?: {kind:string,label:string}, estadoSlides?: object }}
 */
function classificarSaidaMonitorPublicoSlides() {
  const r = obterRotaSlidesParaUi();
  /*
   * «Não exibir» neste canal NÃO significa monitor apagado quando é o Mídias que o
   * ocupa. A ocupação já não se escreve na rota do Slides, mas o operador pode ter
   * apagado o canal à mão com a mídia no ar — e aí a badge, que existe precisamente para
   * dizer «outro modo está neste monitor», continua a ser a leitura certa.
   * `apresentacaoProjecaoAtivaNoCanalPublico` já exige rota do Mídias neste canal e mídia
   * mesmo no ar, por isso o caso «canal desligado à mão, sem nada a projetar» continua
   * ocioso como antes.
   */
  if (r.publicoIndex < 0 && !canalPublicoOcupadoPorOutroModoNoSlides()) return { mode: 'idle' };

  const e = estadoServidor;
  if (!e || !projecao.pronta()) return { mode: 'idle' };
  if (e.blackout) return { mode: 'blackout' };

  /* Outros modos no M2 → só badge (não reproduzir o conteúdo visual). */
  if (apresentacaoProjecaoAtivaNoCanalPublico()) {
    if (e.tipo === 'aviso') {
      return { mode: 'badge', badge: { kind: 'aviso', label: 'Aviso no Telão' } };
    }
    const kind = String((e.apresentacao && e.apresentacao.kind) || 'image').toLowerCase();
    return {
      mode: 'badge',
      badge: { kind, label: `${rotuloTipoMidiaApresentacao(kind)} no Telão` },
    };
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) {
    return { mode: 'badge', badge: { kind: 'aviso', label: 'Aviso no Telão' } };
  }
  if (e.tipo === 'contagem' && e.contagem) {
    return { mode: 'badge', badge: { kind: 'contagem', label: 'Cronômetro no Telão' } };
  }
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) {
    return { mode: 'badge', badge: { kind: 'biblia', label: 'Versículo no Telão' } };
  }

  /* Modo Slides (música) no M2 → cópia visual da projeção. */
  if (e.tipo === 'musica') {
    if (e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length)) {
      return { mode: 'slides', estadoSlides: e };
    }
  }

  return { mode: 'idle' };
}

/**
 * Classifica a saída real do M3 (ministrante) para a prévia virtual do modo Slides.
 * Independente do M2 — flags/rota/emissão local só para inferir este canal.
 * @returns {{ mode: 'idle'|'blackout'|'slides'|'badge', clock?: boolean, badge?: {kind:string,label:string} }}
 */
function classificarSaidaMonitorMinistranteSlides() {
  const r = obterRotaSlidesParaUi();
  /* Mesma razão do canal público: com o Mídias a ocupar o monitor do ministrante, o −1
     da rota do Slides é a cedência do canal, não um monitor apagado. Ver
     `classificarSaidaMonitorPublicoSlides`. */
  if (r.ministranteIndex < 0 && !canalMinistranteOcupadoPorOutroModoNoSlides()) {
    return { mode: 'idle', clock: false };
  }

  const e = estadoServidor;
  if (!projecao.pronta()) return { mode: 'idle', clock: true };
  if (e && e.blackout) return { mode: 'blackout' };

  /* Mídia/aviso do Mídias no M3. */
  if (midiaApresentacaoAtivaNoCanalMinistranteParaPreviewSlides()) {
    if (e && e.tipo === 'aviso') {
      return { mode: 'badge', badge: { kind: 'aviso', label: 'Aviso no Telão' } };
    }
    const kind = String((e && e.apresentacao && e.apresentacao.kind) || 'image').toLowerCase();
    return {
      mode: 'badge',
      badge: { kind, label: `${rotuloTipoMidiaApresentacao(kind)} no Telão` },
    };
  }

  /* Contagem no M3 (override). */
  if (e && e.projecaoMinistranteApresentacao && e.tipo === 'contagem' && e.contagem) {
    return { mode: 'badge', badge: { kind: 'contagem', label: 'Cronômetro no Telão' } };
  }

  /* Bíblia no M3. */
  if (e && e.projecaoBibliaMinistrante) {
    return { mode: 'badge', badge: { kind: 'biblia', label: 'Versículo no Telão' } };
  }
  if (e && e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) {
    /* Bíblia só no público: override limpa o M3 → ocioso, não badge. */
    if (e.projecaoMinistranteApresentacao && !e.projecaoBibliaMinistrante) {
      return { mode: 'idle', clock: true };
    }
    return { mode: 'badge', badge: { kind: 'biblia', label: 'Versículo no Telão' } };
  }

  /* Slides (música) no M3 — mesmo com Mídias ainda no M2 (tipo do socket pode ser apresentação). */
  if (projecaoMusicaEmitidaNoServidor && musicaAtiva && Number(estrofeAtiva) >= 0) {
    return { mode: 'slides' };
  }
  if (e && e.tipo === 'musica' && (e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length))) {
    return { mode: 'slides' };
  }

  return { mode: 'idle', clock: true };
}

/** Prévia virtual do M2 no modo Slides — só este monitor. */
function atualizarPreviewMonitorPublicoSlides() {
  const cls = classificarSaidaMonitorPublicoSlides();
  if (cls.mode === 'badge' && cls.badge) {
    const prevTitulo = document.getElementById('pv-live-titulo');
    const prevLetras = document.getElementById('pv-live-letras');
    if (prevTitulo) prevTitulo.textContent = '';
    preencherPreviewBadgeInformativoSlides(prevLetras, cls.badge);
    return;
  }
  if (cls.mode === 'blackout') {
    aplicarPreviewTelaoNoDom({ blackout: true });
    return;
  }
  if (cls.mode === 'slides' && cls.estadoSlides) {
    aplicarPreviewTelaoNoDom(cls.estadoSlides);
    return;
  }
  aplicarPreviewTelaoNoDom({ semProjecao: true });
}

/** Prévia virtual do M3 no modo Slides — só este monitor. */
function atualizarPreviewMonitorMinistranteSlides() {
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  const cls = classificarSaidaMonitorMinistranteSlides();

  if (cls.mode === 'badge' && cls.badge) {
    definirPreviewRelogioOciosoMinistrante(false);
    limparPreviewTituloMusicaAbertura();
    preencherPreviewBadgeInformativoSlides(opA, cls.badge);
    if (opP) {
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
    }
    return;
  }

  if (cls.mode === 'blackout') {
    definirPreviewRelogioOciosoMinistrante(false);
    limparConteudoPreviewOperadorSlides();
    if (opA) {
      opA.textContent = 'Tela preta (F10)';
      opA.className = 'op-slide-text vazio';
    }
    return;
  }

  if (cls.mode === 'slides') {
    definirPreviewRelogioOciosoMinistrante(false);
    const e = estadoServidor;
    const servidorMostraMusica =
      e &&
      e.tipo === 'musica' &&
      !e.blackout &&
      (e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length));
    const alinhado =
      servidorMostraMusica &&
      musicaAtiva &&
      musicaEstadoCombinaComAtiva(e) &&
      projecaoMusicaEmitidaNoServidor;
    if (servidorMostraMusica && !alinhado) {
      preencherPreviewOperadorSomenteEstadoServidorMusica();
    } else if (
      alinhado &&
      !selecaoLocalAlinhadaComProjecaoMusicaServidor()
    ) {
      preencherPreviewOperadorSomenteEstadoServidorMusica();
    } else if (projecaoMusicaEmitidaNoServidor || podeEspelharLetraNosPreviewsModoSlide()) {
      preencherPreviewOperadorSomenteMusicaLocal();
    } else if (servidorMostraMusica) {
      preencherPreviewOperadorSomenteEstadoServidorMusica();
    } else {
      limparConteudoPreviewOperadorSlides();
    }
    return;
  }

  /* Idle: estado padrão do M3 (relógio conforme Ajustes). */
  limparConteudoPreviewOperadorSlides();
  definirPreviewRelogioOciosoMinistrante(!!cls.clock && deveRevelarRelogioPreviewMinistrante());
}

/**
 * Orquestra as duas prévias-virtuais do modo Slides de forma independente.
 * MONITOR REAL → estado da saída → prévia correspondente (não a aba actual).
 */
function atualizarPreviewsMonitoresVirtuaisModoSlides() {
  atualizarPreviewMonitorMinistranteSlides();
  atualizarPreviewMonitorPublicoSlides();
}

/** Apresentação no público e slides no público em monitores diferentes (convivência). */
function slidesCanalPublicoSeparadoDaApresentacao() {
  if (!ehModoSlidesOperador()) return false;
  const ap = normalizarRota(rotasPorModo.apresentacao);
  const sl = normalizarRota(rotasPorModo.slides);
  if (ap.live || sl.publicoIndex < 0) return false;
  if (ap.publicoIndex >= 0 && sl.publicoIndex !== ap.publicoIndex) return true;
  if (ap.ministranteIndex >= 0 && sl.publicoIndex !== ap.ministranteIndex) return true;
  return false;
}

/**
 * Rota do modo Slide para os seletores: estado real gravado em `rotasPorModo.slides`
 * (sem mascarar nem reatribuir monitores por conflito com Apresentação).
 */
function obterRotaSlidesParaUi() {
  return sanitizarRotaProjecao(normalizarRota(rotasPorModo.slides), monitoresServidorCache);
}

/** Atualiza só a UI dos seletores Público/Ministrante no modo Slide. */
function syncRoteamentoTelasModoSlidesNaUi() {
  if (!ehModoSlidesOperador()) return;
  renderRoteamentoTelas(monitoresServidorCache, obterRotaSlidesParaUi());
  atualizarEstiloRotasDesativadas();
}

/**
 * Quando o Mídias (ou outro modo no canal partilhado) liberta monitores, repõe canais do
 * Slides que tinham sido desligados automaticamente — sem tocar em «Não exibir» manual.
 */
function restaurarRotaSlidesAposLibertarMonitores() {
  if (!precisaReporRotaSlides(rotasPorModo.slides)) return false;
  rotasPorModo.slides = rotaSlidesReposta(rotasPorModo.slides, rotaSlidesAoEntrarNoModo());
  salvarRotasPorModoNoStorage();
  if (ehModoSlidesOperador()) {
    syncRoteamentoTelasModoSlidesNaUi();
  }
  return true;
}

/**
 * Último conteúdo enviado a projetar nos modos de seletor unificado.
 *
 * O `alvoProjecao` (público / ministrante / ambos) viaja DENTRO do payload e é lido pelo
 * servidor no momento em que a projeção é feita. Mudar o seletor depois disso só altera a
 * rota de janelas — o conteúdo já enviado continua a apontar ao canal antigo, e o monitor
 * que acabou de entrar fica com o ecrã ocioso. Guardar o payload é o que permite reenviá-lo
 * com o alvo novo em vez de obrigar o operador a encerrar e projetar outra vez.
 *
 * @type {{tipo: 'apresentacao'|'biblia', payload: object}|null}
 */
let ultimoConteudoProjetadoModoUnificado = null;

function emitirApresentacao(payload, opts = {}) {
  const pl = payload && typeof payload === 'object' ? payload : {};
  const ip = getServidorProjeccaoIp();

  /**
   * Nunca usar `socket.emit('exibir_apresentacao')` para ficheiros (data:, vídeo/Base64 grandes):
   * o Socket.IO corta pacotes grandes (~1 MB por defeito) e **derruba a ligação** — aparecia
   * «DESCONECTADO» e sumia «AO VIVO». O servidor aceita POST JSON até 200 MB.
   */
  const url = `http://${ip}:5510/api/comando/exibir_apresentacao`;

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pl),
  })
    .then(async (r) => {
      const txt = await r.text();
      let data = {};
      try {
        data = txt ? JSON.parse(txt) : {};
      } catch (_) {
  // intencional — erro ignorado
}

      if (!r.ok || data.ok === false) {
        const msg = data.erro || txt || r.statusText;
        throw new Error(msg || `HTTP ${r.status}`);
      }

      try {
        localStorage.setItem(LS_MODO_APRESENTACAO_ATIVO, '1');
      } catch (_) {
  // intencional — erro ignorado
}
      if (!opts.naoSubstituirUltimoUnificado) {
        ultimoConteudoProjetadoModoUnificado = { tipo: 'apresentacao', payload: pl };
      }
      return true;
    })
    .catch((e) => {
      alert(
        'Não foi possível projetar no servidor (porta 5510). Confira se o app SERVIDOR está a correr, o IP e a rede/firewall.\n\n' +
          String(e && e.message ? e.message : e)
      );
      return false;
    });
}

async function emitirEncerrarApresentacaoPublicoAoServidor(alvoProjecao) {
  const body =
    alvoProjecao != null && String(alvoProjecao).trim()
      ? JSON.stringify({ alvoProjecao: String(alvoProjecao).trim() })
      : '{}';
  if (projecao.enviar('encerrar_apresentacao_publico', alvoProjecao != null ? { alvoProjecao } : undefined)) {
    return true;
  }
  const ip = hostProjecao();
  if (!ip) return false;
  try {
    const r = await fetch(`http://${ip}:5510/api/comando/encerrar_apresentacao_publico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return r.ok;
  } catch (_) {
    return false;
  }
}

/**
 * Destino da projeção (cabeçalho «Monitor»): desativado | publico | ministrante | ambos | live.
 *
 * Delega em `modules/rotaEnvioBiblia.js`: alvo e cobertura têm de sair da mesma regra, ou
 * voltam a divergir como divergiam antes (ver o cabeçalho desse módulo).
 */
function obterAlvoProjecaoDeRota(rota) {
  return alvoDeRota(rota);
}

function obterAlvoProjecaoModoApresentacao() {
  return obterAlvoProjecaoDeRota(rotasPorModo.apresentacao);
}

function obterAlvoProjecaoModoBiblia() {
  return obterAlvoProjecaoDeRota(rotasPorModo.biblia);
}

/** Aviso do card 6 ainda no telão (pode coexistir com mídia noutro monitor). */
let apresentacaoAvisoCard6Ativo = false;
/** Último payload de aviso — reenvio ao mudar o seletor do card 6. */
let ultimoPayloadAvisoCard6 = null;

function obterRotaAvisoCard6() {
  return normalizarRota(rotasPorModo.apresentacaoAviso);
}

function rotaApresentacaoEstaDesativada(rota) {
  const r = normalizarRota(rota);
  return !r.live && r.publicoIndex < 0 && r.ministranteIndex < 0;
}

function obterAlvoProjecaoAvisoCard6() {
  return obterAlvoProjecaoDeRota(obterRotaAvisoCard6());
}

function monitoresAvisoCard6CobremAlvo(alvo) {
  return monitoresRotaCobremAlvo(obterRotaAvisoCard6(), alvo);
}

function mensagemAlvoInvalidoAvisoCard6(alvo) {
  if (alvo === 'desativado') {
    return 'Escolha um monitor no seletor de Avisos (card 6) antes de projetar.';
  }
  return mensagemAlvoInvalidoMonitor(alvo, 'avisos (card 6)');
}

/**
 * Rota `apresentacao` enviada ao servidor quando mídia e avisos usam monitores distintos.
 * Cada índice vem da rota que activa esse canal; a mídia tem prioridade no público.
 */
function mesclarRotasApresentacaoMidiaEAviso(rotaMidia, rotaAviso) {
  const m = normalizarRota(rotaMidia);
  const a = normalizarRota(rotaAviso);
  if (m.live) return { ...m };
  if (a.live) return { ...a };
  return normalizarRota({
    publicoIndex: m.publicoIndex >= 0 ? m.publicoIndex : a.publicoIndex,
    ministranteIndex: m.ministranteIndex >= 0 ? m.ministranteIndex : a.ministranteIndex,
    live: false,
  });
}

function obterRotaApresentacaoParaServidor() {
  const midia = normalizarRota(rotasPorModo.apresentacao);
  const aviso = normalizarRota(rotasPorModo.apresentacaoAviso);
  if (rotaApresentacaoEstaDesativada(aviso)) return midia;
  return mesclarRotasApresentacaoMidiaEAviso(midia, aviso);
}

function canaisOcupadosPorAlvoProjecao(alvo) {
  const a = String(alvo || '').toLowerCase();
  if (a === 'publico' || a === 'live') return ['publico'];
  if (a === 'ministrante') return ['ministrante'];
  if (a === 'ambos') return ['publico', 'ministrante'];
  return [];
}

/** Canais a limpar ao encerrar um conteúdo sem apagar o outro que partilha o mesmo telão. */
function canaisParaEncerrarConteudoApresentacao(alvoConteudo, alvoOutroConteudo) {
  const meus = canaisOcupadosPorAlvoProjecao(alvoConteudo);
  if (!meus.length) return [];
  const outroAlvo = String(alvoOutroConteudo || '').toLowerCase();
  if (!outroAlvo || outroAlvo === 'desativado') {
    return meus.length === 2 ? ['ambos'] : meus;
  }
  const outros = new Set(canaisOcupadosPorAlvoProjecao(outroAlvo));
  const limpar = meus.filter((c) => !outros.has(c));
  return limpar.length ? limpar : [];
}

async function encerrarCanaisApresentacaoNoServidor(canais) {
  const lista = Array.isArray(canais) ? canais : [];
  if (!lista.length) return;
  if (lista.includes('ambos') || (lista.includes('publico') && lista.includes('ministrante'))) {
    await emitirEncerrarApresentacaoPublicoAoServidor('ambos');
    return;
  }
  for (const canal of lista) {
    await emitirEncerrarApresentacaoPublicoAoServidor(canal);
  }
}

function aplicarSelecaoMonitorAvisoCard6(opcao) {
  const o = opcao && typeof opcao === 'object' ? opcao : {};
  rotasPorModo.apresentacaoAviso = normalizarRota({
    publicoIndex: o.pub ?? -1,
    ministranteIndex: o.min ?? -1,
    live: !!o.live,
  });
}

async function reemitirAvisoCard6AposMudancaDeRota() {
  if (!apresentacaoAvisoCard6Ativo || !ultimoPayloadAvisoCard6) return;
  const alvo = obterAlvoProjecaoAvisoCard6();
  if (!monitoresAvisoCard6CobremAlvo(alvo)) return;
  await new Promise((r) => setTimeout(r, ATRASO_REENVIO_APOS_ROTA_MS));
  const payload = { ...ultimoPayloadAvisoCard6, alvoProjecao: alvo };
  const ok = await emitirApresentacao(payload, { naoSubstituirUltimoUnificado: true });
  if (ok) {
    ultimoPayloadAvisoCard6 = payload;
    atualizarFeedbackProjecaoApresentacaoUi();
  }
}

function rotuloSeletorMonitorAvisoCard6() {
  const rota = obterRotaAvisoCard6();
  const lista = monitoresServidorCache;
  const opcoes = opcoesRoteamentoUnificadoModoApresentacao(lista, { incluirLive: false });
  const rLive = !!rota.live;
  let pub = rLive ? -1 : indiceRoteamentoMonitorNaUi(rota.publicoIndex);
  let min = rLive ? -1 : indiceRoteamentoMonitorNaUi(rota.ministranteIndex);
  pub = sanitizarIndiceMonitorProjecao(pub, lista);
  min = sanitizarIndiceMonitorProjecao(min, lista);
  const combina = (o) => !!o.live === rLive && (o.live || (o.pub === pub && o.min === min));
  const preset = opcoes.find(combina);
  if (preset) return preset.label;
  return rotuloRotaApresentacaoForaDoPreset({ publicoIndex: pub, ministranteIndex: min, live: rLive }, lista);
}

function criarSeletorMonitorAvisoCard6() {
  const dd = document.createElement('div');
  dd.className = 'route-dd route-dd--card6-aviso';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'route-dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Monitor para avisos');
  const rotulo = rotuloSeletorMonitorAvisoCard6();
  btn.title =
    'Monitor exclusivo para avisos — independente do «Monitor» do cabeçalho (mídias)';
  const spanLbl = document.createElement('span');
  spanLbl.className = 'route-dd-label';
  spanLbl.textContent = rotulo;
  /* Ícone de monitor à esquerda e seta (chevron) à direita — só visual. */
  const icoMonitor = document.createElement('span');
  icoMonitor.className = 'route-dd-ico-monitor';
  icoMonitor.setAttribute('aria-hidden', 'true');
  icoMonitor.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="8.5" rx="1.3"/><path d="M5.5 14h5M8 11v3"/></svg>';
  const caret = document.createElement('span');
  caret.className = 'route-dd-caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.innerHTML =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>';
  btn.appendChild(icoMonitor);
  btn.appendChild(spanLbl);
  btn.appendChild(caret);

  const menu = document.createElement('ul');
  menu.className = 'route-dd-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  const lista = monitoresServidorCache;
  const rotaAtual = obterRotaAvisoCard6();
  const rLive = !!rotaAtual.live;
  let pubA = rLive ? -1 : indiceRoteamentoMonitorNaUi(rotaAtual.publicoIndex);
  let minA = rLive ? -1 : indiceRoteamentoMonitorNaUi(rotaAtual.ministranteIndex);
  pubA = sanitizarIndiceMonitorProjecao(pubA, lista);
  minA = sanitizarIndiceMonitorProjecao(minA, lista);
  const combinaAtual = (o) => !!o.live === rLive && (o.live || (o.pub === pubA && o.min === minA));

  const opcoes = opcoesRoteamentoUnificadoModoApresentacao(lista, { incluirLive: false });
  opcoes.forEach((o) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'route-dd-item';
    b.dataset.apOp = o.key;
    b.textContent = o.label;
    b.setAttribute('aria-selected', combinaAtual(o) ? 'true' : 'false');
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      dd.classList.remove('route-dd-open');
      aplicarSelecaoMonitorAvisoCard6({ pub: o.pub, min: o.min, live: o.live });
      spanLbl.textContent = o.label;
      menu.querySelectorAll('.route-dd-item').forEach((ib) => {
        ib.setAttribute('aria-selected', ib.dataset.apOp === o.key ? 'true' : 'false');
      });
      if (o.key === 'des' && apresentacaoAvisoCard6Ativo) {
        void encerrarAvisoCard6NoControlador();
      }
      salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false })
        .then(() => reemitirAvisoCard6AposMudancaDeRota())
        .catch(() => {});
    });
    li.appendChild(b);
    menu.appendChild(li);
  });

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const aberto = !menu.hidden;
    fecharOutrosSeletoresDropdown(dd);
    menu.hidden = aberto;
    dd.classList.toggle('route-dd-open', !aberto);
    btn.setAttribute('aria-expanded', aberto ? 'false' : 'true');
  });

  dd.appendChild(btn);
  dd.appendChild(menu);
  return dd;
}

/**
 * Reenvia o conteúdo que já está no ar depois de o operador mudar o seletor de monitores.
 *
 * Nos modos de seletor unificado (Bíblia e Mídias) o alvo é decidido no acto de projetar e
 * fica gravado no payload. Trocar de «Telão» para «Ambos» com a projeção a correr mudava
 * as janelas mas não o conteúdo: o monitor novo abria em ocioso e o operador tinha de
 * encerrar e projetar outra vez. Aqui o payload é reenviado tal e qual, só com o alvo
 * actualizado.
 *
 * Silencioso por natureza: nada a projetar, rota desativada ou modo errado não é erro —
 * é o caso normal de quem só está a preparar a próxima peça.
 */
const ATRASO_REENVIO_APOS_ROTA_MS = 320;

async function reemitirConteudoAposMudancaDeRotaUnificada() {
  const guardado = ultimoConteudoProjetadoModoUnificado;
  if (!guardado || !guardado.payload) return;

  const modo = modoRoteamentoAtual();
  if (modo !== 'apresentacao' && modo !== 'biblia') return;

  const alvo = obterAlvoProjecaoDeRota(rotasPorModo[modo]);
  if (alvo === 'desativado') return;
  /*
   * «Live — OBS» não tem janelas de monitor a alimentar — mas tem overlay. Em modo Mídias
   * continua a não haver nada a reenviar (a mídia é servida por outro caminho); em modo
   * Bíblia o reenvio é o que garante que o OBS recebe uma actualização válida no instante
   * em que o destino passa a ser o OBS, em vez de depender do estado que por acaso tenha
   * ficado da projeção física anterior.
   */
  if (alvo === 'live' && modo !== 'biblia') return;
  if (alvo === guardado.payload.alvoProjecao) return;

  /* O PUT já respondeu, mas a janela do monitor novo ainda está a carregar a página: o
     motor só lhe entrega conteúdo depois de a ter visível. Conteúdo enviado antes disso
     perde-se em silêncio — é a mesma razão do `reforcarMinistrante` no motor. */
  await new Promise((r) => setTimeout(r, ATRASO_REENVIO_APOS_ROTA_MS));

  if (guardado.tipo === 'apresentacao') {
    if (!apresentacaoMidiaProjetadaId) return;
    await emitirApresentacao({ ...guardado.payload, alvoProjecao: alvo });
    return;
  }

  if (guardado.tipo === 'biblia') {
    if (!bibliaHaParteProjetada()) return;
    /* `somenteTexto: false` de propósito: o monitor que acabou de entrar não recebeu a
       referência nem a configuração de exibição, e um reenvio abreviado deixá-lo-ia com
       o versículo sem cabeçalho. */
    const payload = { ...guardado.payload, alvoProjecao: alvo, somenteTexto: false };
    projecao.enfileirar('exibir_versiculo', payload);
    ultimoConteudoProjetadoModoUnificado = { tipo: 'biblia', payload };
  }
}

function monitoresRotaCobremAlvo(rota, alvo) {
  return rotaCobreAlvo(rota, alvo);
}

function monitoresApresentacaoCobremAlvo(alvo) {
  return monitoresRotaCobremAlvo(rotasPorModo.apresentacao, alvo);
}

/*
 * Não há `monitoresBibliaCobremAlvo()`.
 *
 * Existia, e era metade do defeito: perguntar «os monitores cobrem o alvo?» antes de
 * enviar fazia a ausência de monitor físico calar o OBS. No Modo Bíblia a decisão passou
 * inteira para `resolverEnvioBiblia()` (`modules/rotaEnvioBiblia.js`), que lê alvo e
 * cobertura da mesma rota já sincronizada e nunca devolve «não enviar» por falta de tela.
 * O modo Mídias continua a usar `monitoresApresentacaoCobremAlvo()`: ali o conteúdo é uma
 * mídia servida às janelas, e sem janela não há o que enviar.
 */

const LS_CARD6_AVISO_CFG = 'lyra_card6_aviso_cfg_v1';

function aplicarEstiloTextareaAvisoCard6(el, rawCfg) {
  if (!el) return;
  const cfg = normalizarCfgAvisoCard6(rawCfg);
  el.style.color = cfg.textColor;
  el.style.background = cfg.transparentBackground ? 'transparent' : cfg.backgroundColor;
  el.style.fontStyle = cfg.italic ? 'italic' : 'normal';
  el.style.width = '100%';
  el.style.maxWidth = '100%';
  el.style.fontSize = '15px';
  el.style.whiteSpace = cfg.wrapLongLines ? 'pre-wrap' : 'pre';
  el.style.overflowWrap = cfg.wrapLongLines ? 'anywhere' : 'normal';
  el.style.wordBreak = 'break-word';
  el.style.overflow = 'hidden';
  el.wrap = cfg.wrapLongLines ? 'soft' : 'off';
}

function algumCampoAvisoCard6EmEdicao() {
  const ativo = document.activeElement;
  if (!ativo) return false;
  return (
    ativo.classList?.contains('ap-card6-aviso-textarea') ||
    ativo.dataset?.apCard6CfgField === '1'
  );
}

function salvarAvisoCard6CfgNoStorage() {
  try {
    localStorage.setItem(
      LS_CARD6_AVISO_CFG,
      JSON.stringify(normalizarCfgAvisoCard6(apresentacaoCard6AvisoCfg))
    );
  } catch (_) {
  // intencional — erro ignorado
}
}

function carregarAvisoCard6CfgDoStorage() {
  try {
    const raw = localStorage.getItem(LS_CARD6_AVISO_CFG);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? normalizarCfgAvisoCard6(parsed) : null;
  } catch (_) {
    return null;
  }
}

function mensagemAlvoInvalidoMonitor(alvo, modoLabel) {
  const modo = modoLabel || 'apresentação';
  if (alvo === 'desativado') {
    return `No modo ${modo}, abra «Monitor» no cabeçalho e escolha um destino (público, ministrante ou ambos) antes de projetar.`;
  }
  if (alvo === 'publico') {
    return `Escolha «Público — Monitor …» em «Monitor» no cabeçalho antes de projetar para o telão.`;
  }
  if (alvo === 'ministrante') {
    return 'Escolha «Ministrante — Monitor …» em «Monitor» no cabeçalho antes de projetar só no retorno.';
  }
  if (alvo === 'live') {
    return 'Escolha «Live — OBS» em «Monitor» no cabeçalho. No OBS, use Browser Source em http://127.0.0.1:5001/obs';
  }
  return 'Escolha «Ambos» em «Monitor» no cabeçalho para enviar ao público e ao ministrante.';
}

function mensagemAlvoInvalidoApresentacao(alvo) {
  return mensagemAlvoInvalidoMonitor(alvo, 'apresentação');
}

function mensagemAlvoInvalidoBiblia(alvo) {
  if (alvo === 'desativado') {
    return 'A projeção está em «Não exibir». Selecione um destino em «Monitor» (no cabeçalho), antes de projetar o versículo.';
  }
  return mensagemAlvoInvalidoMonitor(alvo, 'Bíblia');
}

/**
 * Índices de monitor (0-based) nas opções do modo apresentação: 2.º e 3.º ecrã na lista do servidor;
 * com menos ecrãs, recua para o último disponível.
 */
function indicesPadraoPublicoMinistranteApresentacao(lista) {
  const sec = listaMonitoresParaProjecao(lista);
  const n = sec.length;
  if (!n) return { iPub: -1, iMin: -1 };
  const temIdx = (idx) => sec.some((m) => m && m.index === idx);
  /* Convenção Lyra: Monitor 2 (índice 1) = público/telão; Monitor 3 (índice 2) = ministrante. */
  if (temIdx(1) && temIdx(2)) {
    return { iPub: 1, iMin: 2 };
  }
  const iPub = sec[0].index;
  /* Um único monitor de projeção: só o telão público abre nele. Partilhar o mesmo ecrã
     com o ministrante faria a janela do operador (atual + próximo) cobrir o público —
     era exactamente o sintoma reportado (público seleccionado, mas projeta atual+próximo). */
  let iMin = n >= 2 ? sec[1].index : -1;
  if (iMin === iPub && n >= 2) {
    const outro = sec.find((m) => m.index !== iPub);
    if (outro) iMin = outro.index;
  }
  return { iPub, iMin };
}

/**
 * Rota do modo slide padrão: 2.º ecrã = público (telão), 3.º = ministrante (retorno);
 * com menos monitores, aplica o mesmo fallback de `indicesPadraoPublicoMinistranteApresentacao`.
 */
function rotaSlidesPadraoPublico2Ministrante3(lista) {
  const { iPub, iMin } = indicesPadraoPublicoMinistranteApresentacao(Array.isArray(lista) ? lista : []);
  return normalizarRota({ publicoIndex: iPub, ministranteIndex: iMin });
}

/**
 * Rota do modo Slide ao entrar: Público M2 + Ministrante M3.
 *
 * Já se desviou do que as Mídias ocupavam, e era desviar a mais: o monitor emprestado
 * continua a ser o do Slides, apenas indisponível enquanto a mídia lá está — o seletor
 * mostra-o apagado (`route-dd--bloqueado-apresentacao`) e o pacote para o servidor
 * silencia o canal (`rotaSlidesParaEnvioComApresentacao`). Reatribuir o índice aqui
 * escrevia a ocupação na configuração do operador, que é o que esta separação evita.
 */
function rotaSlidesAoEntrarNoModo() {
  return rotaSlidesPadraoPublico2Ministrante3(monitoresServidorCache);
}

/**
 * Opções do seletor «Monitor» dos modos de seletor unificado.
 *
 * `incluirLive` existe porque o destino «Live — OBS» não serve os três seletores da
 * mesma maneira. Na Bíblia o OBS é um destino legítimo: o versículo é texto, e o
 * `display-routing` sabe entregá-lo ao overlay sem monitor físico nenhum. Nas Mídias e
 * nos Avisos do card 6 não é: a mídia é servida às janelas de projeção, e escolher Live
 * ali só produzia uma saída sem tela — nada a projetar e nada a ver.
 *
 * @param {Array} lista Monitores conhecidos do servidor.
 * @param {{ incluirLive?: boolean }} [opts] `incluirLive: false` omite «Live — OBS».
 */
/**
 * O seletor do cabeçalho é partilhado pela Bíblia e pelas Mídias; só a Bíblia tem OBS.
 * @returns {{ incluirLive: boolean }}
 */
function opcoesSeletorCabecalhoDoModoAtual() {
  const m = modoRoteamentoAtual();
  return { incluirLive: m !== 'apresentacao' && m !== 'docs' };
}

function opcoesRoteamentoUnificadoModoApresentacao(lista, opts = {}) {
  const incluirLive = opts.incluirLive !== false;
  const out = [];
  out.push({ key: 'des', label: 'Não exibir', pub: -1, min: -1, live: false });
  if (incluirLive) {
    out.push({ key: 'live', label: 'Live — OBS', pub: -1, min: -1, live: true });
  }
  const sec = listaMonitoresParaProjecao(lista);
  if (!sec.length) return out;
  const { iPub, iMin } = indicesPadraoPublicoMinistranteApresentacao(lista);
  if (iPub >= 0) {
    out.push({
      key: 'pub',
      label: `Público — Monitor ${iPub + 1}`,
      pub: iPub,
      min: -1,
      live: false,
    });
  }
  if (iMin >= 0) {
    out.push({
      key: 'min',
      label: `Ministrante — Monitor ${iMin + 1}`,
      pub: -1,
      min: iMin,
      live: false,
    });
  }
  let ambPub = iPub;
  let ambMin = iMin;
  if (ambPub === ambMin && sec.length >= 2) {
    ambPub = sec[0].index;
    ambMin = sec[1].index;
  } else if (ambPub === ambMin) {
    ambMin = -1;
  }
  if (ambPub >= 0 && ambMin >= 0) {
    out.push({
      key: 'ambos',
      label: 'Ambos',
      pub: ambPub,
      min: ambMin,
      live: false,
    });
  }
  return out;
}

function aplicarExtrasModoApresentacao(ex, opts = {}) {
  const extras = ex && typeof ex === 'object' ? ex : {};
  if (Array.isArray(extras.card4Imagens)) {
    apresentacaoCard4Imagens = Array.from({ length: 4 }, (_, i) =>
      normalizarItemApresentacao(extras.card4Imagens[i] || null));
  }
  if (!opts.skipCard6Aviso && typeof extras.card6AvisoTexto === 'string') {
    apresentacaoCard6Texto = extras.card6AvisoTexto;
  }
  if (!opts.skipCard6AvisoConfig && extras.card6AvisoConfig !== undefined) {
    apresentacaoCard6AvisoCfg = normalizarCfgAvisoCard6(extras.card6AvisoConfig);
    salvarAvisoCard6CfgNoStorage();
  }
  audioLoopAtivo = extras.audioLoop === true;
  migrarAlvoExtrasLegadoParaRotaApresentacao(extras);
  atualizarUiPlayerAudioRemoto();
}

/** Legado: rotas de apresentação/Bíblia são só de sessão — não restaurar alvo antigo do storage. */
function migrarAlvoExtrasLegadoParaRotaApresentacao(_ex) {}

function atualizarRodapeAudioApresentacao(item) {
  if (!item) return;
  atualizarPillProjecaoNav({ ativo: true, nome: String(item.name || 'faixa') });
  renderGridApresentacao();
}

/**
 * Espelha o estado de projeção no indicador global da barra de navegação
 * (#hdr-projecao-pill). Só desenha — é chamado por sincronizarPillProjecaoNav
 * (fonte única: mídia no telão, aviso do card 6 e áudio no player) e por
 * atualizarRodapeAudioApresentacao; não mantém estado próprio.
 * @param {{ativo?: boolean, nome?: string}} info
 */
function atualizarPillProjecaoNav(info = {}) {
  let pill = document.getElementById('hdr-projecao-pill');
  /* Sem projeção: a pill não existe no DOM (sem espaço reservado, sem placeholder). */
  if (!info.ativo) {
    if (pill) pill.remove();
    return;
  }
  const txt = String(info.nome == null ? '' : info.nome).trim() || 'arquivo';
  if (!pill) {
    /* Filha direta do header (não de .app-header-right, que é escondido nos
       modos de projeção). Posicionada em absoluto à direita da barra. */
    const host = document.querySelector('.app-header');
    if (!host) return;
    pill = document.createElement('div');
    pill.id = 'hdr-projecao-pill';
    pill.className = 'hdr-projecao-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.innerHTML =
      '<span class="hdr-projecao-dot" aria-hidden="true"></span>' +
      '<span class="hdr-projecao-label">Projetando</span>' +
      '<span class="hdr-projecao-nome" id="hdr-projecao-nome"></span>';
    host.appendChild(pill);
  }
  pill.title = 'Projetando no telão: ' + txt;
  const nomeEl = pill.querySelector('.hdr-projecao-nome');
  if (nomeEl) nomeEl.textContent = txt;
}

/**
 * Áudio do modo Mídias ainda carregado no player do servidor — a tocar ou em pausa.
 *
 * O áudio não ocupa `apresentacaoMidiaProjetadaId`: esse id é de quem ocupa o telão
 * (imagem/vídeo/PDF/web) e `projetarItemApresentacao` limpa-o de propósito ao projetar
 * uma faixa. Por isso a projeção de áudio tem de ser lida à parte, senão qualquer
 * redesenho do feedback apagava a pill com o áudio ainda no ar.
 *
 * `mediaKind` só volta a '' quando o playback é mesmo parado (Parar / Encerrar
 * projeção); uma faixa em pausa continua carregada, tal como uma imagem pausada
 * continua no telão — e nesses dois casos a projeção continua a existir.
 */
function projecaoAudioApresentacaoAtiva() {
  return audioStateRemoto.mediaKind === 'audio' && !!apresentacaoAudioAtualId;
}

/** Nome da faixa em projeção, para o rótulo da pill. */
function nomeAudioProjecaoApresentacao() {
  const item =
    (apresentacaoAudios || []).find((x) => x && x.id === apresentacaoAudioAtualId) || null;
  return String(item?.name || audioStateRemoto.name || 'faixa');
}

/**
 * Decide o estado da pill a partir do que está mesmo no ar — mídia no telão, aviso do
 * card 6 e áudio no player — sem tocar na grelha. Fonte única do «Projetando».
 */
function sincronizarPillProjecaoNav() {
  const id = apresentacaoMidiaProjetadaId;
  const avisoAtivo = apresentacaoAvisoCard6Ativo;
  if (!id && !avisoAtivo) {
    if (projecaoAudioApresentacaoAtiva()) {
      atualizarPillProjecaoNav({ ativo: true, nome: nomeAudioProjecaoApresentacao() });
    } else {
      atualizarPillProjecaoNav({ ativo: false });
    }
    return;
  }
  let rawNome;
  if (avisoAtivo && !id) {
    const linha =
      String(apresentacaoCard6Texto || '').split(/\r\n|\r|\n/).find((l) => String(l).trim()) || 'Aviso';
    rawNome = linha.slice(0, 56);
  } else {
    const item =
      (apresentacaoBiblioteca || []).find((x) => x && x.id === id) ||
      (apresentacaoCards || []).find((x) => x && x.id === id) ||
      null;
    rawNome = String(item?.name || 'arquivo');
    if (avisoAtivo) rawNome = `${rawNome} + aviso`;
  }
  atualizarPillProjecaoNav({ ativo: true, nome: rawNome });
}

/**
 * Sincroniza o indicador de projeção (pill na barra de navegação —
 * sincronizarPillProjecaoNav) e redesenha a grelha de cards. Aceita e ignora
 * opções antigas (ex.: mensagemIdle) para compatibilidade com chamadas existentes.
 */
function atualizarFeedbackProjecaoApresentacaoUi() {
  sincronizarPillProjecaoNav();
  renderGridApresentacao();
}

function montarPayloadAvisoCard6Atual(alvo) {
  return {
    kind: 'aviso',
    texto: String(apresentacaoCard6Texto || '').trim(),
    alvoProjecao: alvo,
    avisoConfig: normalizarCfgAvisoCard6(apresentacaoCard6AvisoCfg),
  };
}

async function atualizarAvisoCard6AoVivo() {
  if (!apresentacaoAvisoCard6Ativo) return;
  const alvo = obterAlvoProjecaoAvisoCard6();
  if (!monitoresAvisoCard6CobremAlvo(alvo)) return;
  const payload = montarPayloadAvisoCard6Atual(alvo);
  if (!payload.texto) return;
  const ok = await emitirApresentacao(payload, { naoSubstituirUltimoUnificado: true });
  if (ok) {
    ultimoPayloadAvisoCard6 = payload;
    atualizarFeedbackProjecaoApresentacaoUi();
  }
}

function agendarAtualizacaoAvisoCard6AoVivo() {
  if (syncApresentacaoAvisoLiveTimer) clearTimeout(syncApresentacaoAvisoLiveTimer);
  if (!apresentacaoAvisoCard6Ativo) return;
  syncApresentacaoAvisoLiveTimer = setTimeout(() => {
    syncApresentacaoAvisoLiveTimer = null;
    void atualizarAvisoCard6AoVivo();
  }, 120);
}

async function projetarAvisoCard6() {
  const texto = String(apresentacaoCard6Texto || '').trim();
  if (!texto) {
    alert('Digite um aviso no card 6 antes de projetar.');
    return;
  }
  const alvo = obterAlvoProjecaoAvisoCard6();
  if (alvo === 'desativado' || !monitoresAvisoCard6CobremAlvo(alvo)) {
    alert(mensagemAlvoInvalidoAvisoCard6(alvo));
    return;
  }
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
  const payload = montarPayloadAvisoCard6Atual(alvo);
  const ok = await emitirApresentacao(payload, {
    naoSubstituirUltimoUnificado: !!apresentacaoMidiaProjetadaId,
  });
  if (!ok) return;
  apresentacaoAvisoCard6Ativo = true;
  ultimoPayloadAvisoCard6 = payload;
  try {
    localStorage.setItem(LS_MODO_APRESENTACAO_ATIVO, '1');
  } catch (_) {
  // intencional — erro ignorado
}
  atualizarFeedbackProjecaoApresentacaoUi();
}

// (extraído) vídeo da apresentação → painel/videoApresentacao.js

// (extraído) player local de mídias → painel/playerLocalMidia.js

// (extraído) biblioteca de mídias → painel/bibliotecaMidiasApresentacao.js

// (extraído) playlist de vídeos → painel/playlistVideoApresentacao.js


// (extraído) grelha de cards → painel/gridApresentacao.js

function abrirMenuModoApresentacao() {
  const ativo = ehModoApresentacaoOperador();
  if (ativo) return;
  executarComTransicaoUi(() => {
    if (document.body.classList.contains('app-mod-biblia')) {
      reconhecimentoVozBiblia.aoSairModoBiblia();
      bibliaSairModo();
    }
    document.body.classList.remove('app-mod-slides', 'app-mod-biblia', 'app-mod-docs');
    document.body.classList.add('app-mod-apresentacao');
    document.title = 'Lyra — Modo apresentação';
    try { localStorage.setItem(LS_UI_MODO_SLIDES, '0'); } catch (_) {
  // intencional — erro ignorado
}
    aplicarRotulosEPlaylistModoSlides();
    atualizarBtnToggleModoSlides();
    atualizarBtnModoApresentacao();
    renderSlidesStrip();
    if (!hayProjecaoAtivaModoBibliaOuApresentacao()) {
      rotasPorModo.apresentacao = rotaDesativada();
      rotasPorModo.apresentacaoAviso = rotaDesativada();
      marcarRotaLiveNoDom(false);
    } else if (!apresentacaoAvisoCard6Ativo) {
      rotasPorModo.apresentacaoAviso = rotaDesativada();
    }
    /* Entrar num modo não é escolher «Não exibir»: a ordem do operador não sobrevive à
       troca de ecrã. Ver `modules/ordemNaoExibirUnificado.js`. */
    limparOrdemNaoExibirUnificado();
    aplicarMonitorLembradoAoEntrarNoModo('apresentacao');
    sincronizarCheckboxLembrarMonitor();
    aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: true });
    setApresentacaoCardSelecionadoIdx(null);
    renderGridApresentacao();
    void restaurarVideosModoApresentacao().then(() => {
      if (ehModoApresentacaoOperador()) {
        renderGridApresentacao();
        renderListaPlaylistApresentacao();
      }
    });
    renderListaPlaylistApresentacao();
    reconhecimentoVozSlides.aoEntrarModoApresentacao();
    atualizarBtnModoBiblia();
  });
}

// (extraído) Modo Bíblia (tradução e entrada/saída do modo) → painel/biblia.js

/**
 * A Home está ativa quando nenhum modo está ativo. O realce visual é resolvido
 * em CSS; aqui só se expõe o estado a leitores de ecrã com aria-current.
 */
function atualizarBtnTelaInicial() {
  const btn = document.getElementById('btn-tela-inicial');
  if (!btn) return;
  const naHome = !ehModoSlidesOperador()
    && !ehModoBibliaOperador()
    && !ehModoApresentacaoOperador()
    && !ehModoDocsOperador();
  atualizarBtnModoDocs();
  if (naHome) btn.setAttribute('aria-current', 'page');
  else btn.removeAttribute('aria-current');
  btn.title = naHome ? 'TELA INICIAL (HOME) — ecrã atual' : 'VOLTAR PARA A TELA INICIAL (HOME)';
}

async function carregarTraducoes() {
  const wrap = document.getElementById('traducao-sel-dd');
  const hid = document.getElementById('traducao-sel');
  if (!wrap || !hid) return;
  try {
    const lista = await fetchListaTraducoesBiblia();
    const items = lista.map((t) => ({
      value: t.traducao,
      label: `${t.traducao} — ${t.nome}`,
    }));
    const traducaoSessao = obterBibliaTraducaoSessao();
    const valorAtual = traducaoSessao || hid.value || (items[0] ? items[0].value : '');
    renderItensLyraSelectDropdown(wrap, items, {
      valorAtual,
      placeholder: '—',
      aoSelecionar: () => onTraducaoBibliaChange(),
    });
    if (traducaoSessao) aplicarTraducaoBibliaNoSelect(traducaoSessao);
    popularGradeLivros();
  } catch (e) {
    console.error('Erro ao carregar traduções', e);
  }
}

function fecharMenuModoApresentacao() {
  if (!ehModoApresentacaoOperador()) return;
  const preservarProjecao = hayProjecaoApresentacaoModoAtiva();
  executarComTransicaoUi(() => {
    document.body.classList.remove('app-mod-apresentacao');
    document.title = 'Lyra — Controlador';
    if (!preservarProjecao) {
      apresentacaoMidiaProjetadaId = null;
    }
    clearTimeout(getApresentacaoCardUiClickTimer());
    setApresentacaoCardUiClickTimer(null);
    setApresentacaoCardSelecionadoIdx(null);
    atualizarBtnModoApresentacao();
    renderSlidesStrip();
    if (!preservarProjecao) {
      void desativarRotasModosTransitorios({ sincronizarServidor: true });
    }
    aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: preservarProjecao });
    reconhecimentoVozSlides.atualizarUi();
  });
}

function escolherArquivoModoApresentacao() {
  const input = document.getElementById('apresentacao-add-menu-input');
  if (!input) return;
  input.value = '';
  input.click();
}

/**
 * Para a mídia no servidor e limpa estado local da mídia (não encerra avisos do card 6).
 */
async function encerrarProjecaoMidiaApresentacaoNoControlador() {
  const eraVideo = audioStateRemoto.mediaKind === 'video' && videoProjetadoAtivoNoPlayer();
  if (eraVideo) {
    pararAudioLocalApresentacao();
  } else {
    pararAudioServidorPlayback();
  }

  const alvoMidia =
    ultimoConteudoProjetadoModoUnificado?.payload?.alvoProjecao ||
    (apresentacaoMidiaProjetadaId ? obterAlvoProjecaoModoApresentacao() : null);
  const alvoAviso =
    apresentacaoAvisoCard6Ativo
      ? ultimoPayloadAvisoCard6?.alvoProjecao || obterAlvoProjecaoAvisoCard6()
      : null;

  apresentacaoMidiaProjetadaId = null;
  ultimoConteudoProjetadoModoUnificado = null;
  apresentacaoAudioAtualId = null;
  audioStateRemoto = { ...audioStateRemoto, playing: false, currentTime: 0, duration: 0, name: '' };

  const canais = canaisParaEncerrarConteudoApresentacao(alvoMidia, alvoAviso);
  if (canais.length) {
    await encerrarCanaisApresentacaoNoServidor(canais);
  }

  if (!apresentacaoAvisoCard6Ativo) {
    try {
      localStorage.setItem(LS_MODO_APRESENTACAO_ATIVO, '0');
    } catch (_) {
  // intencional — erro ignorado
}
    estadoServidor = {
      tipo: null,
      titulo: '',
      linhas: [],
      estrofeIndex: 0,
      totalEstrofes: 0,
      telaLimpa: true,
      blackout: false,
      slidePretoFinal: false,
    };
  }

  try {
    atualizarUiPlayerAudioRemoto();
  } catch (_) {
  // intencional — erro ignorado
}
  try {
    renderListaAudiosApresentacao();
  } catch (_) {
  // intencional — erro ignorado
}
  atualizarFeedbackProjecaoApresentacaoUi();
}

/** Encerra só o aviso do card 6; a mídia do cabeçalho continua no ar. */
async function encerrarAvisoCard6NoControlador() {
  if (!apresentacaoAvisoCard6Ativo) return;

  const alvoAviso = ultimoPayloadAvisoCard6?.alvoProjecao || obterAlvoProjecaoAvisoCard6();
  const alvoMidia =
    apresentacaoMidiaProjetadaId
      ? ultimoConteudoProjetadoModoUnificado?.payload?.alvoProjecao ||
        obterAlvoProjecaoModoApresentacao()
      : null;

  apresentacaoAvisoCard6Ativo = false;
  ultimoPayloadAvisoCard6 = null;

  const canais = canaisParaEncerrarConteudoApresentacao(alvoAviso, alvoMidia);
  if (canais.length) {
    await encerrarCanaisApresentacaoNoServidor(canais);
  }

  if (!apresentacaoMidiaProjetadaId) {
    try {
      localStorage.setItem(LS_MODO_APRESENTACAO_ATIVO, '0');
    } catch (_) {
  // intencional — erro ignorado
}
  }

  atualizarFeedbackProjecaoApresentacaoUi();
}

/**
 * Cabeçalho «Encerrar projeção» no Modo Mídias: só mídia + rota do cabeçalho → Não exibir.
 */
async function encerrarProjecaoMidiaCabecalhoModoApresentacao() {
  if (!ehModoApresentacaoOperador()) return;
  await encerrarProjecaoMidiaApresentacaoNoControlador();
  rotasPorModo.apresentacao = rotaDesativada();
  marcarRotaLiveNoDom(false);
  /* Libertar o canal partilhado: canais do Slides desligados só por conflito voltam;
     «Não exibir» manual do Slides nesta sessão fica intocado. */
  restaurarRotaSlidesAposLibertarMonitores();
  atualizarFeedbackProjecaoApresentacaoUi({
    mensagemIdle: apresentacaoAvisoCard6Ativo
      ? 'Mídia encerrada. Aviso continua no ar.'
      : 'Projeção de mídia encerrada. «Monitor» em «Não exibir».',
  });
  aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
  reexibirMonitorLembradoNoSeletorAposEncerrar('apresentacao');
  atualizarPreviewOperador();
}

/**
 * Depois de encerrar: a projeção fica encerrada e as janelas libertadas — e o seletor volta
 * a mostrar o monitor lembrado, pronto para a próxima projeção.
 *
 * É aqui que «monitor lembrado ≠ projeção ativa» deixa de ser uma frase e passa a ser duas
 * camadas com valores diferentes de propósito: a rota em vigor está em «Não exibir» (o
 * servidor recebeu -1, as janelas foram libertadas, nada continua no telão) e o seletor
 * mostra o M2. `reidratarRotaApresentacaoDoSeletor()` é quem volta a juntá-las, no momento
 * de projetar outra vez.
 *
 * A alternativa era deixar a rota no monitor lembrado e o motor manteria lá uma janela
 * preta em cima do ecrã — encerrado para o público, mas com o monitor por devolver.
 *
 * @param {'biblia'|'apresentacao'} modo
 */
function reexibirMonitorLembradoNoSeletorAposEncerrar(modo) {
  if (!Array.isArray(monitoresServidorCache) || !monitoresServidorCache.length) return;
  const { aplicar, rota } = rotaLembradaParaEntrada(
    hostChaveMonitores(),
    modo,
    monitoresServidorCache
  );
  if (!aplicar) return;
  renderRoteamentoTelas(monitoresServidorCache, sanitizarRotaProjecao(rota, monitoresServidorCache));
  atualizarIndicadorProjecaoLiveUi();
}

/**
 * Alinha `rotasPorModo.apresentacao` com o seletor antes de projetar.
 *
 * Depois de «Encerrar» com «Lembrar monitor» ligado os dois divergem de propósito (ver
 * acima). Projetar outra vez tem de reconstituir a rota — e ANTES de ler o alvo, pela mesma
 * razão que está escrita em `modules/rotaEnvioBiblia.js`: ler o alvo da rota velha e
 * entregá-lo à rota nova era como o versículo ia parar ao monitor errado.
 *
 * Não faz nada quando a rota já tem destino: o caminho normal de quem não usa a memória
 * continua exactamente como estava.
 */
async function reidratarRotaApresentacaoDoSeletor() {
  if (!ehModoApresentacaoOperador()) return;
  const atual = normalizarRota(rotasPorModo.apresentacao);
  if (atual.live || atual.publicoIndex >= 0 || atual.ministranteIndex >= 0) return;
  const daUi = rotaSelecionadaNaUi();
  if (!daUi) return;
  const r = normalizarRota(daUi);
  if (!r.live && r.publicoIndex < 0 && r.ministranteIndex < 0) return;
  rotasPorModo.apresentacao = sanitizarRotaProjecao(r, monitoresServidorCache);
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
}

/**
 * Encerra mídia e aviso, repõe rotas (ex.: sair do modo ou encerrar tudo).
 */
async function encerrarProjecaoModoApresentacao() {
  if (!ehModoApresentacaoOperador()) return;
  if (apresentacaoAvisoCard6Ativo) {
    await encerrarAvisoCard6NoControlador();
  }
  await encerrarProjecaoMidiaApresentacaoNoControlador();
  rotasPorModo.apresentacao = { publicoIndex: -1, ministranteIndex: -1 };
  rotasPorModo.apresentacaoAviso = rotaDesativada();
  restaurarRotaSlidesAposLibertarMonitores();
  salvarRotasPorModoNoStorage();
  atualizarFeedbackProjecaoApresentacaoUi({
    mensagemIdle: 'Projeção encerrada. «Monitor» em «Não exibir»; o modo Slides mantém a configuração dele.',
  });
  aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
  atualizarPreviewOperador();
}

function agendarTrabalhoPesadoAposModoSlides(ativo) {
  const rodar = () => {
    aplicarRotulosEPlaylistModoSlides();
    renderSlidesStrip();
    atualizarPreviewOperador();
    renderPlaylist();
    atualizarToolbarModoEdicao();
    marcacaoEstrofeEditor();
    aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
    if (ativo) {
      reconhecimentoVozSlides.aoEntrarModoSlides();
      void salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
    } else {
      reconhecimentoVozSlides.aoSairModoSlides();
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(rodar);
  } else {
    setTimeout(rodar, 0);
  }
}

/**
 * Espelho local ao encerrar só a camada Slides (`limpar_tela` no servidor).
 *
 * O servidor preserva Mídias/aviso noutro monitor; o espelho tem de fazer o mesmo.
 * Apagar `estadoServidor` por completo fazia a badge «Imagem no Telão» sumir da prévia
 * ao encerrar música no M3 com imagem ainda no M2.
 */
function limparEspelhoLocalSoCamadaSlides() {
  const e = estadoServidor;
  if (
    e &&
    !e.blackout &&
    !e.slidePretoFinal &&
    ((e.tipo === 'apresentacao' && e.apresentacao && String(e.apresentacao.src || '').trim()) ||
      (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length > 0) ||
      (e.tipo === 'contagem' && e.contagem) ||
      (e.tipo === 'biblia' && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length > 0))
  ) {
    return;
  }
  const minAp = !!(e && e.projecaoMinistranteApresentacao);
  estadoServidor = {
    tipo: null,
    titulo: '',
    linhas: [],
    estrofeIndex: 0,
    totalEstrofes: 0,
    telaLimpa: true,
    blackout: false,
    slidePretoFinal: false,
    projecaoMinistranteApresentacao: minAp,
  };
}

/**
 * Ao sair do modo slides.
 * Sem projeção: limpa faixa/seleção de slides (comportamento clássico).
 * Com projeção activa: preserva música, estrofe e faixa para retomar ao voltar.
 * Nunca encerra a projeção real — isso fica para ESC / Encerrar.
 */
function limparUiAoSairDoModoSlides() {
  slidesDockVisivel = false;
  if (projecaoMusicaEmitidaNoServidor) {
    /* Projeção no ar: mantém musicaAtiva, estrofeAtiva e a faixa armada. */
    return;
  }
  estrofeAtiva = -1;
  projecaoMusicaEmitidaNoServidor = false;
  bloqueioSincronizarEstrofeDoServidor = false;
  /**
   * Limpa a seleção da playlist do modo slides já na saída (e não só ao reentrar):
   * a faixa é sempre rearmada por clique na playlist, então deixá-la «ligada» aqui
   * fazia a linha voltar destacada sobre uma grade vazia.
   * `musicaAtiva` fica intacta de propósito — a Home continua com a música no editor.
   */
  faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
  limparEspelhoLocalSoCamadaSlides();
}

async function alternarModoSlidesOperador(opts = {}) {
  const permitirDesativar = opts.permitirDesativar === true;
  if (ehModoSlidesOperador() && !permitirDesativar) return;
  if (ehModoBibliaOperador()) {
    /*
     * Só desliga rotas transitórias se nada de Bíblia/mídia estiver no ar.
     * Com projeção activa, os monitores continuam — trocar para Slides é só navegação.
     */
    if (!hayProjecaoAtivaModoBibliaOuApresentacao()) {
      rotasPorModo.biblia = rotaDesativada();
      /*
       * Devolver o canal partilhado, e não só largar a rota da Bíblia.
       *
       * Bíblia e Mídias escrevem ambas em `rotasPorModo.apresentacao`, e o motor dá-lhe
       * precedência sobre o canal do Slides (`a.publicoIndex >= 0 ? a : s`). Este caminho —
       * Bíblia direto para Slides, sem passar pela Home — limpava a rota da Bíblia e deixava
       * o monitor dela reservado no canal partilhado. O Slides ficava com o seletor a dizer
       * M3 e a projeção a sair no M2 da Bíblia: a interface a afirmar uma coisa e o projetor
       * a fazer outra, sem nada apagado que denunciasse o problema.
       *
       * A guarda é a mesma de `desativarRotasModosTransitorios`: com mídia no ar o canal não
       * se toca, senão fechavam-se as janelas do que está a projetar.
       */
      if (!hayProjecaoApresentacaoModoAtiva()) {
        rotasPorModo.apresentacao = rotaDesativada();
      }
      marcarRotaLiveNoDom(false);
    }
  }
  executarComTransicaoUi(() => {
    document.body.classList.remove('app-mod-docs');
    if (ehModoApresentacaoOperador()) {
      /* Sair de Mídias para Slides: nunca encerrar imagem/vídeo no telão. */
      document.body.classList.remove('app-mod-apresentacao');
      clearTimeout(getApresentacaoCardUiClickTimer());
      setApresentacaoCardUiClickTimer(null);
      setApresentacaoCardSelecionadoIdx(null);
    }
    if (ehModoBibliaOperador()) {
      reconhecimentoVozBiblia.aoSairModoBiblia();
      document.body.classList.remove('app-mod-biblia');
      bibliaSairModo();
    }
    if (!ehModoSlidesOperador()) {
      document.body.classList.add('app-mod-slides');
    } else {
      document.body.classList.remove('app-mod-slides');
    }
    const ativo = ehModoSlidesOperador();
    slidesDockVisivel = ativo;
    document.title = ativo ? 'Lyra — Modo slides' : 'Lyra — Controlador';
    try {
      localStorage.setItem(LS_UI_MODO_SLIDES, ativo ? '1' : '0');
    } catch (_) {
  // intencional — erro ignorado
}
    if (ativo) {
      slidesRailUserRecolhido = false;
      if (projecaoMusicaEmitidaNoServidor && musicaAtiva) {
        /* Retoma a faixa no ponto da projeção que ficou no ar. */
        faixaSlidesHabilitadaPorPlaylistNoModoSlides = true;
        slidesDockVisivel = true;
      } else {
        faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
      }
      const lm = document.getElementById('layout-musicas');
      if (lm) lm.removeAttribute('style');
      /*
       * O modo Slides abre sempre utilizável — é o modo rápido.
       *
       * Regra (sessão do programa): a escolha MANUAL do operador no seletor do Slides
       * mantém-se ao navegar entre ecrãs, inclusive «Não exibir». Só o clique no seletor
       * conta como manual (`sincronizarNaoExibirManualSlidesDaEscolha`).
       *
       * Se outro modo desligou um canal automaticamente (ex.: Mídias no mesmo monitor),
       * esse −1 NÃO é manual — à entrada repomos M2/M3 (ou o que ainda estiver livre).
       * Recarregar / reabrir limpa a marca manual e o seletor volta ao padrão.
       *
       * É por canal, e não só no vazio total, porque uma saída sozinha em «Não exibir»
       * automático é quase sempre rasto de outro modo: quando o Mídias toma o M2, a regra
       * de exclusão tira o M2 daqui — e a reposição (aqui ou ao libertar o Mídias) fecha
       * o ciclo. Roubar o monitor de volta ao Mídias não acontece:
       * `rotaSlidesAoEntrarNoModo()` consulta a rota dele e desvia-se do que estiver
       * mesmo a projetar.
       */
      if (precisaReporRotaSlides(rotasPorModo.slides)) {
        rotasPorModo.slides = rotaSlidesReposta(rotasPorModo.slides, rotaSlidesAoEntrarNoModo());
        salvarRotasPorModoNoStorage();
      }
      slidesAplicarCfgArmazenada();
      syncRoteamentoTelasModoSlidesNaUi();
    } else {
      limparUiAoSairDoModoSlides();
    }
    atualizarBtnToggleModoSlides();
    atualizarBtnModoApresentacao();
    modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
    agendarTrabalhoPesadoAposModoSlides(ativo);
  });
}

/** Botões de modo no HTML — registo cedo para sobreviver a falhas mais abaixo no ficheiro. */
exporCallbacksParaAtributosHtml({
  irParaTelaInicial,
  alternarModoSlidesOperador,
  alternarModoBiblia,
  onTraducaoBibliaChange,
  abrirMenuModoApresentacao,
  abrirModoDocs,
});

let _debounceRecarregarPainelT = null;
function recarregarPainelControlador() {
  if (_debounceRecarregarPainelT) clearTimeout(_debounceRecarregarPainelT);
  _debounceRecarregarPainelT = setTimeout(() => {
    _debounceRecarregarPainelT = null;
    /* Recarregar não deve ressuscitar projeção anterior nas telas. */
    projecao.enviar('encerrar_projecao');
    try {
      const ov = document.getElementById('app-dialog-overlay');
      if (ov) {
        ov.classList.remove('aberto');
        ov.hidden = true;
      }
    } catch (_) {
  // intencional — erro ignorado
}
    try {
      if (typeof fecharAppDialog === 'function') fecharAppDialog(false);
    } catch (_) {
  // intencional — erro ignorado
}
    const enviarReload = () => {
      try {
        if (window.lyraElectron?.reloadController) {
          window.lyraElectron.reloadController();
        } else {
          window.location.reload();
        }
      } catch (e) {
        console.error('[controller] reloadController', e);
        try {
          window.location.reload();
        } catch (_) {
  // intencional — erro ignorado
}
      }
    };
    /* Dar tempo ao servidor de processar encerrar_projecao antes do reload (evita estado «preto» ao reconectar). */
    setTimeout(enviarReload, 280);
  }, 320);
}

function forcarRepinturaCompositorLyra() {
  /* Repintura forçada com a janela oculta/minimizada altera o compositor sem ganho visual
     e provoca «tremida» nas prévias de slides que continuam no DOM. */
  if (document.hidden) return;
  requestAnimationFrame(() => {
    const el = document.documentElement;
    el.classList.add('lyra-gpu-repaint');
    requestAnimationFrame(() => el.classList.remove('lyra-gpu-repaint'));
  });
}
window.forcarRepinturaCompositorLyra = forcarRepinturaCompositorLyra;

let lyraRepinturaAposEstadoT = 0;
let lyraAssinaturaEstadoProjecaoRecebido = null;

function assinaturaEstadoProjecaoRecebido(estado) {
  try {
    return JSON.stringify(estado ?? null);
  } catch (_) {
    return null;
  }
}

function agendarRepinturaCompositorAposEstadoServidor() {
  if (!projecao.pronta()) return;
  const now = Date.now();
  if (now - lyraRepinturaAposEstadoT < 650) return;
  lyraRepinturaAposEstadoT = now;
  forcarRepinturaCompositorLyra();
}

try {
  const api = window.lyraElectron;
  if (api) {
    const offOpenDisplayDevtools = api.onOpenDisplayDevtoolsRequest(() => {
      if (typeof api.abrirConsoleTelao === 'function') {
        api.abrirConsoleTelao().catch(() => {});
        return;
      }
      if (!projecao.enviar('open_display_devtools')) {
        alert('Conecte ao servidor primeiro para abrir o console do telão.');
      }
    });
    const offControllerRepaint = api.onControllerRepaintRequest(() =>
      forcarRepinturaCompositorLyra()
    );
    const offAtualizacaoDisponivel = api.onAtualizacaoDisponivel((payload) => {
      lyraUpdaterUiState.ultimoPayload = payload || null;
      mostrarBannerAtualizacaoDisponivel(payload);
    });
    const offDownloadAtualizacaoIniciado = api.onDownloadAtualizacaoIniciado(() => {
      lyraUpdaterUiState.downloadEmAndamento = true;
      lyraUpdaterUiState.percentualDownload = 0;
      mostrarBannerProgressoAtualizacao(lyraUpdaterUiState.ultimoPayload);
    });
    const offProgressoDownloadAtualizacao = api.onProgressoDownloadAtualizacao((payload) => {
      lyraUpdaterUiState.downloadEmAndamento = true;
      lyraUpdaterUiState.percentualDownload = Number(payload?.percent || 0);
      mostrarBannerProgressoAtualizacao(lyraUpdaterUiState.ultimoPayload);
    });
    const offAtualizacaoPronta = api.onAtualizacaoPronta((payload) => {
      lyraUpdaterUiState.ultimoPayload = payload || lyraUpdaterUiState.ultimoPayload;
      lyraUpdaterUiState.downloadEmAndamento = false;
      lyraUpdaterUiState.percentualDownload = 100;
      mostrarBannerAtualizacaoPronta(payload);
    });
    const offErroAtualizacao = api.onErroAtualizacao((payload) => {
      lyraUpdaterUiState.downloadEmAndamento = false;
      esconderBannerAtualizacao();
      void appAlert(
        String(payload?.message || 'Não foi possível concluir a atualização.'),
        'Atualização'
      );
    });
    const offCompanionDisponivel = typeof api.onCompanionUpdateAvailable === 'function'
      ? api.onCompanionUpdateAvailable((payload) => {
          mostrarBannerCompanionDisponivel(payload);
        })
      : null;
    const offCompanionProgresso = typeof api.onCompanionUpdateProgress === 'function'
      ? api.onCompanionUpdateProgress((payload) => {
          mostrarBannerCompanionProgresso(payload);
        })
      : null;
    const offCompanionDone = typeof api.onCompanionUpdateDone === 'function'
      ? api.onCompanionUpdateDone(() => {
          esconderBannerAtualizacao();
          void appAlert(
            'Os componentes do Lyra foram atualizados. A ligação ao Servidor será reassumida.',
            'Componentes do Lyra'
          );
          try { tentarAutoConectarSeDesconectado(); } catch (_) { /* intencional */ }
        })
      : null;
    const offCompanionErro = typeof api.onCompanionUpdateError === 'function'
      ? api.onCompanionUpdateError((payload) => {
          esconderBannerAtualizacao();
          void appAlert(
            String(payload?.message || 'Não foi possível atualizar os componentes do Lyra.'),
            'Componentes do Lyra'
          );
        })
      : null;
    const offCompanionRemoto = typeof api.onCompanionUpdateRemoteInfo === 'function'
      ? api.onCompanionUpdateRemoteInfo((payload) => {
          void appAlert(
            'Há uma atualização disponível para os componentes do Lyra no computador onde o Servidor está a correr.\n\n' +
              'Instale a atualização nesse PC (não é possível instalá-la remotamente a partir deste Controlador).' +
              (payload?.host ? `\n\nServidor em: ${payload.host}` : ''),
            'Componentes do Lyra'
          );
        })
      : null;
    const offMenuCommand = typeof api.onMenuCommand === 'function'
      ? api.onMenuCommand((payload) => {
          void tratarComandoMenuLyra(payload);
        })
      : null;
    const offStatusReinicioServidor = typeof api.onStatusReinicioServidor === 'function'
      ? api.onStatusReinicioServidor((payload) => {
          atualizarModalStatusReinicioServidor(payload?.stage, payload?.message || '');
        })
      : null;
    window.addEventListener(
      'beforeunload',
      () => {
        try {
          if (typeof offOpenDisplayDevtools === 'function') offOpenDisplayDevtools();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offControllerRepaint === 'function') offControllerRepaint();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offAtualizacaoDisponivel === 'function') offAtualizacaoDisponivel();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offDownloadAtualizacaoIniciado === 'function') offDownloadAtualizacaoIniciado();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offProgressoDownloadAtualizacao === 'function') offProgressoDownloadAtualizacao();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offAtualizacaoPronta === 'function') offAtualizacaoPronta();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offErroAtualizacao === 'function') offErroAtualizacao();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offCompanionDisponivel === 'function') offCompanionDisponivel();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offCompanionProgresso === 'function') offCompanionProgresso();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offCompanionDone === 'function') offCompanionDone();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offCompanionErro === 'function') offCompanionErro();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offCompanionRemoto === 'function') offCompanionRemoto();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offMenuCommand === 'function') offMenuCommand();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offStatusReinicioServidor === 'function') offStatusReinicioServidor();
        } catch (_) {
  // intencional — erro ignorado
}
      },
      { once: true }
    );
  }
} catch (e) {
  console.error('[controller] lyraElectron IPC', e);
}

/**
 * Cultos do mês em exibição: domingos (manhã + noite) e quartas, com data DD/MM.
 * A lista é recalculada ao carregar. No dia seguinte ao último culto automático
 * do mês civil, já entra o mês seguinte (28/10 → 29/10 mostra novembro).
 * Ids e rótulos: `modules/cultosCalendario.js`.
 */
// --- SECÇÃO C — Culto do dia, playlists, temas, cópias locais de letra, chaves localStorage ---
// (extraído) culto do dia → painel/cultoDoDia.js

// (extraído) cópias locais de letra → painel/copiasLocaisPainel.js
// (extraído) estado da biblioteca → painel/bibliotecaMusicas.js
let letrasSiteFonte = 'lyra-online';
// (extraído) lista local renderizada → painel/bibliotecaMusicas.js
/** Lista de músicas SQLite visível (padrão) ou recolhida. */
let bancoSqliteListaExpandida = true;
let cultosDoMesCache = [];
let cultosManuaisCache = [];

// --- SECÇÃO D — Faixa de slides (dock), zoom, chips; geometria em slidesGrelha.js ---
const slidesGrelha = criarSlidesGrelha({
  ehModoSlidesOperador,
  getMusicaAtiva: () => musicaAtiva,
  getEstrofeAtiva: () => estrofeAtiva,
  getFaixaHabilitada: () => faixaSlidesHabilitadaPorPlaylistNoModoSlides,
  getProjecaoEmitida: () => projecaoMusicaEmitidaNoServidor,
});

function applySlidesChipZoomLevel(z) { slidesGrelha.applySlidesChipZoomLevel(z); }
function slideChipSnippetBaseFontPx() { return slidesGrelha.slideChipSnippetBaseFontPx(); }
function podeAtualizarSomenteAtivoFaixaSlides() { return slidesGrelha.podeAtualizarSomenteAtivoFaixaSlides(); }
function atualizarSomenteAtivoFaixaSlides() { slidesGrelha.atualizarSomenteAtivoFaixaSlides(); }
function obterChipEstrofeNaGrelha(idx) { return slidesGrelha.obterChipEstrofeNaGrelha(idx); }
function obterScrollportGrelhaSlides() { return slidesGrelha.obterScrollportGrelhaSlides(); }
function colunasVisiveisGrelhaSlides() { return slidesGrelha.colunasVisiveisGrelhaSlides(); }
function obterChipAntecipacaoNaGrelha(idx) { return slidesGrelha.obterChipAntecipacaoNaGrelha(idx); }
function revelarChipEstrofeFocado(idx, opts) { slidesGrelha.revelarChipEstrofeFocado(idx, opts); }
function revelarGradeSlides() { slidesGrelha.revelarGradeSlides(); }
function ajustarFonteSnippetsNosSlideChips(tentativa) { slidesGrelha.ajustarFonteSnippetsNosSlideChips(tentativa); }
function ajustarEncaixeGrelhaSlidesModoSlides() { slidesGrelha.ajustarEncaixeGrelhaSlidesModoSlides(); }
function setupSlidesGridViewportFitObserver() { slidesGrelha.setupSlidesGridViewportFitObserver(); }
function initSlidesChipZoomFromStorage() { slidesGrelha.initSlidesChipZoomFromStorage(); }
function setupSlidesChipZoomButtons() { slidesGrelha.setupSlidesChipZoomButtons(); }
function applySlidesPorLinha(n) { slidesGrelha.applySlidesPorLinha(n); }
function initSlidesPorLinhaFromStorage() { slidesGrelha.initSlidesPorLinhaFromStorage(); }
function setupSlidesPorLinhaButtons() { slidesGrelha.setupSlidesPorLinhaButtons(); }

function readLsMigrate(key, legacyKey) {
  let v = localStorage.getItem(key);
  if (v === null && legacyKey) {
    const old = localStorage.getItem(legacyKey);
    if (old !== null) {
      localStorage.setItem(key, old);
      localStorage.removeItem(legacyKey);
      v = old;
    }
  }
  return v;
}

/** IP efetivo: prefere o gravado na barra após «Conectar»; senão usa o campo manual. */
function getServidorIp() {
  const fromSpan = (document.getElementById('info-ip')?.textContent || '').trim();
  if (fromSpan && fromSpan !== '—') return fromSpan;
  const fromInput = (document.getElementById('ip-input')?.value || '').trim();
  return fromInput || null;
}

/** API HTTP do controlador (SQLite local) — sempre neste PC, porta 3001. */
function getControllerApiBase() {
  return 'http://127.0.0.1:3001';
}

/**
 * Endereço de quem hospeda a projeção na porta 5510.
 *
 * É o análogo HTTP do que a porta de projeção fez para os comandos: os call sites
 * perguntam «onde está a projeção», não «qual é o IP do Servidor». No modo local a
 * resposta é sempre esta máquina, mesmo que o campo de IP tenha sobrado de uma ligação
 * anterior — apontar para lá pediria os monitores ao PC errado.
 *
 * @returns {string|null} `null` quando não há projeção alcançável (modo remoto sem IP).
 */
function hostProjecao() {
  if (emModoProjecaoLocal()) return '127.0.0.1';
  return getServidorIp();
}

/** Como `hostProjecao`, mas assume o próprio PC quando nada está configurado. */
function getServidorProjeccaoIp() {
  return hostProjecao() || '127.0.0.1';
}

/**
 * Comandos de áudio do modo apresentação → servidor de projeção (5510).
 * Preferência: Socket.IO; fallback HTTP (como `exibir_apresentacao`).
 */
async function enviarComandoAudioProjeccao(evento, payload = {}) {
  if (projecao.enviar(evento, payload)) return true;
  const rotas = {
    audio_play: '/api/comando/audio_play',
    audio_pause: '/api/comando/audio_pause',
    audio_stop: '/api/comando/audio_stop',
    audio_volume: '/api/comando/audio_volume',
    audio_seek: '/api/comando/audio_seek',
  };
  const path = rotas[evento];
  if (!path) return false;
  const ip = getServidorProjeccaoIp();
  try {
    const r = await fetch(`http://${ip}:5510${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      throw new Error(data.erro || `HTTP ${r.status}`);
    }
    return true;
  } catch (e) {
    console.warn('[Lyra] comando áudio falhou:', evento, e);
    return false;
  }
}

/**
 * Rótulo do monitor no seletor.
 *
 * Prefere o nome que o sistema dá ao painel («LG TV», «EPSON PJ») em vez de `Monitor 2`:
 * o operador reconhece o equipamento, não a numeração do Windows — que aliás muda.
 * Quando o driver não expõe nome, cai para a numeração, que é melhor que nada.
 */
function montarLabelMonitor(m) {
  const base = m && m.label ? String(m.label) : `Monitor ${Number(m?.index || 0) + 1}`;
  return m && m.primary ? `${base} (principal — sem projeção)` : base;
}

/** Tooltip com a posição e a resolução — desempata dois painéis com o mesmo nome. */
function montarTitleMonitor(m) {
  if (!m) return '';
  const partes = [];
  if (m.nome && m.rotuloPosicional) partes.push(m.rotuloPosicional);
  const w = Number(m?.size?.width || m?.bounds?.width || 0);
  const h = Number(m?.size?.height || m?.bounds?.height || 0);
  if (w && h) partes.push(`${w}×${h}`);
  return partes.join(' · ');
}

/**
 * Aviso no cabeçalho quando não há nenhum monitor de projeção.
 *
 * O ecrã principal é do operador e não conta. Com pelo menos um monitor externo,
 * o aviso não aparece — mesmo que o que estava guardado tenha mudado de nome.
 * Sem lista ainda (servidor a responder), não mostra nem esconde: evitar o pisca.
 */
function avisarMonitoresConfiguradosEmFalta() {
  const el = document.getElementById('hdr-monitores-aviso');
  if (!el) return;
  if (!Array.isArray(monitoresServidorCache) || !monitoresServidorCache.length) return;
  if (contarMonitoresDeProjecao() > 0) {
    el.classList.add('oculto');
    el.textContent = '';
    el.removeAttribute('title');
    return;
  }
  el.classList.remove('oculto');
  el.textContent = '⚠ Monitor não encontrado';
  el.title = 'Nenhum monitor de projeção foi encontrado. Ligue um monitor externo e escolha onde projetar.';
}

function fecharMenusRoteamentoTelas() {
  document.querySelectorAll('.route-dd').forEach((wrap) => {
    wrap.classList.remove('route-dd-open');
    const menu = wrap.querySelector('.route-dd-menu');
    const btn = wrap.querySelector('.route-dd-btn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

/**
 * Duplo clique projeta — não seleciona a palavra debaixo do cursor.
 *
 * O duplo clique é o gesto de projetar em quase todo o painel: versículo na Bíblia, chip
 * na faixa, cartão de estrofe, linha da playlist e do banco, cartão de mídia. Mas o
 * navegador também trata duplo clique como «selecionar palavra», e as duas coisas
 * aconteciam ao mesmo tempo: o operador projetava e ficava com um pedaço de texto
 * realçado a azul por cima do conteúdo, à vista durante o culto.
 *
 * A correção vai no `mousedown` e não no `dblclick`: quando o segundo clique chega, a
 * seleção já foi feita: limpá-la depois é um pisca visível. `preventDefault()` no clique
 * que a iniciaria impede-a de existir — e não cancela o evento `dblclick`, que continua a
 * disparar normalmente.
 *
 * Um listener só, em vez de remendar cada `dblclick`: os sítios com este gesto são muitos
 * e crescem, e um esquecido é um bug que só aparece em palco.
 *
 * Campos de texto ficam de fora: lá o duplo clique é mesmo para selecionar. Arrastar para
 * selecionar continua a funcionar em todo o lado — só o duplo clique deixa de o fazer.
 */
function impedirSelecaoDeTextoNoDuploClique() {
  const CAMPOS_DE_TEXTO = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  document.addEventListener(
    'mousedown',
    (ev) => {
      /* `detail` conta os cliques da sequência: 1 é clique simples e não selecciona nada. */
      if (ev.detail < 2 || ev.button !== 0) return;
      if (ev.target?.closest?.(CAMPOS_DE_TEXTO)) return;
      ev.preventDefault();
    },
    true
  );
}

function setupMenusRoteamentoTelas() {
  document.querySelectorAll('.route-dd').forEach((wrap) => {
    const btn = wrap.querySelector('.route-dd-btn');
    const menu = wrap.querySelector('.route-dd-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const abrir = !wrap.classList.contains('route-dd-open');
      fecharOutrosSeletoresDropdown(wrap);
      if (abrir) {
        wrap.classList.add('route-dd-open');
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      } else {
        wrap.classList.remove('route-dd-open');
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.addEventListener('click', fecharMenusRoteamentoTelas);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenusRoteamentoTelas();
  });
}

/** -1 = desativado; rejeita valores não numéricos (ex.: string vinda do JSON sem reparse). */
function indiceRoteamentoMonitorNaUi(val) {
  if (val === '' || val === null || val === undefined) return -1;
  const n = typeof val === 'number' && Number.isFinite(val) ? val : parseInt(String(val).trim(), 10);
  if (!Number.isFinite(n) || n < -1) return -1;
  return n;
}

/** Texto do botão quando a rota do modo apresentação não coincide com um dos quatro presets. */
function rotuloRotaApresentacaoForaDoPreset(r, lista) {
  if (r && r.live) return 'Live — OBS';
  const pub = indiceRoteamentoMonitorNaUi(r?.publicoIndex);
  const min = indiceRoteamentoMonitorNaUi(r?.ministranteIndex);
  if (pub < 0 && min < 0) return 'Não exibir';
  if (pub >= 0 && min < 0) return `Público — Monitor ${pub + 1}`;
  if (pub < 0 && min >= 0) return `Ministrante — Monitor ${min + 1}`;
  return 'Ambos';
}

function renderRoteamentoTelas(monitores, routing) {
  fecharMenusRoteamentoTelas();
  const hidPub = document.getElementById('route-publico');
  const hidMin = document.getElementById('route-ministrante');
  const menuPub = document.getElementById('route-publico-menu');
  const menuMin = document.getElementById('route-ministrante-menu');
  const dispPub = document.getElementById('route-publico-display');
  const dispMin = document.getElementById('route-ministrante-display');
  const lblPub = document.getElementById('route-publico-label');
  if (!hidPub || !hidMin || !menuPub || !menuMin || !dispPub || !dispMin) return;

  const modoR = modoRoteamentoAtual();
  if (lblPub) lblPub.textContent = modoUsaSeletorMonitorUnificado() ? 'Monitor' : 'Público';

  const items = [{ value: '-1', label: 'Não exibir' }];
  const lista = Array.isArray(monitores) ? monitores : [];
  lista.forEach((m) => {
    if (m && m.primary) return;
    items.push({ value: String(m.index), label: montarLabelMonitor(m), title: montarTitleMonitor(m) });
  });

  /**
   * Tira este monitor da outra saída — ver `rotaSemMonitorRepetido`.
   *
   * Mexe no DOM da outra coluna (valor, rótulo e `aria-selected`) porque a troca tem de
   * ser visível no mesmo instante do clique: o operador escolhe o M2 no Ministrante e vê o
   * Público passar a «Não exibir» sem ter de reabrir o menu. O `salvarRoteamento…` que
   * corre logo a seguir lê os dois campos, por isso as duas saídas vão coerentes.
   *
   * @param {HTMLElement} outroMenu
   * @param {HTMLInputElement} outroHid
   * @param {HTMLElement} outroDisp
   * @param {string} valorEscolhido
   */
  function libertarMonitorDaOutraSaida(outroMenu, outroHid, outroDisp, valorEscolhido) {
    if (!outroMenu || !outroHid || !outroDisp) return;
    if (valorEscolhido === '-1') return;
    if (outroHid.value !== valorEscolhido) return;
    outroHid.value = '-1';
    outroDisp.textContent = 'Não exibir';
    outroMenu.querySelectorAll('.route-dd-item').forEach((ib) => {
      ib.setAttribute('aria-selected', ib.dataset.value === '-1' ? 'true' : 'false');
    });
  }

  function preencherMenu(menuEl, hidEl, dispEl, valorSelecionado, outros = null) {
    menuEl.innerHTML = '';
    const vSel = String(valorSelecionado);
    items.forEach(({ value, label, title }) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'route-dd-item';
      b.dataset.value = value;
      b.textContent = label;
      if (title) b.title = title;
      b.setAttribute('aria-selected', String(value) === vSel ? 'true' : 'false');
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        hidEl.value = value;
        dispEl.textContent = label;
        menuEl.querySelectorAll('.route-dd-item').forEach((ib) => {
          ib.setAttribute('aria-selected', ib.dataset.value === String(value) ? 'true' : 'false');
        });
        if (outros) {
          libertarMonitorDaOutraSaida(outros.menu, outros.hid, outros.disp, String(value));
        }
        fecharMenusRoteamentoTelas();
        atualizarEstiloRotasDesativadas();
        /* Qual das duas saídas o operador mexeu. Só ela conta como «Não exibir» à mão —
           ver `sincronizarNaoExibirManualSlidesDaEscolha`. */
        salvarRoteamentoTelasNoServidor({
          canalEscolhido: hidEl === hidMin ? 'ministrante' : 'publico',
        });
      });
      li.appendChild(b);
      menuEl.appendChild(li);
    });
  }

  if (modoUsaSeletorMonitorUnificado()) {
    menuMin.innerHTML = '';
    if (!lista.length) {
      hidPub.value = '-1';
      hidMin.value = '-1';
      dispPub.textContent = 'Não exibir';
      dispMin.textContent = 'Não exibir';
      const op0 = opcoesRoteamentoUnificadoModoApresentacao(
        lista,
        opcoesSeletorCabecalhoDoModoAtual()
      );
      menuPub.innerHTML = '';
      op0.forEach((o) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'presentation');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'route-dd-item';
        b.dataset.apOp = o.key;
        b.textContent = o.label;
        b.setAttribute('aria-selected', o.key === 'des' ? 'true' : 'false');
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          hidPub.value = String(o.pub);
          hidMin.value = String(o.min);
          marcarRotaLiveNoDom(!!o.live);
          dispPub.textContent = o.label;
          menuPub.querySelectorAll('.route-dd-item').forEach((ib) => {
            ib.setAttribute('aria-selected', ib.dataset.apOp === o.key ? 'true' : 'false');
          });
          fecharMenusRoteamentoTelas();
          atualizarEstiloRotasDesativadas();
          salvarRoteamentoTelasNoServidor();
          atualizarIndicadorProjecaoLiveUi();
        });
        li.appendChild(b);
        menuPub.appendChild(li);
      });
      marcarRotaLiveNoDom(false);
      atualizarEstiloRotasDesativadas();
      aplicarPreviewPainelOcultoNoDom();
      atualizarIndicadorProjecaoLiveUi();
      return;
    }

    const rLive = !!(routing && routing.live);
    let pub = rLive ? -1 : indiceRoteamentoMonitorNaUi(routing?.publicoIndex);
    let min = rLive ? -1 : indiceRoteamentoMonitorNaUi(routing?.ministranteIndex);
    pub = sanitizarIndiceMonitorProjecao(pub, lista);
    min = sanitizarIndiceMonitorProjecao(min, lista);
    marcarRotaLiveNoDom(rLive);

    const opcoes = opcoesRoteamentoUnificadoModoApresentacao(
      lista,
      opcoesSeletorCabecalhoDoModoAtual()
    );
    const combina = (o) => !!o.live === rLive && (o.live || (o.pub === pub && o.min === min));
    const preset = opcoes.find(combina);
    const rotuloBtn = preset
      ? preset.label
      : rotuloRotaApresentacaoForaDoPreset(
          { publicoIndex: pub, ministranteIndex: min, live: rLive },
          lista
        );
    hidPub.value = String(pub);
    hidMin.value = String(min);
    dispPub.textContent = rotuloBtn;
    const rotMin = items.find((x) => x.value === String(min));
    dispMin.textContent = rotMin ? rotMin.label : 'Não exibir';

    menuPub.innerHTML = '';
    opcoes.forEach((o) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'route-dd-item';
      b.dataset.apOp = o.key;
      b.textContent = o.label;
      b.setAttribute('aria-selected', combina(o) ? 'true' : 'false');
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        hidPub.value = String(o.pub);
        hidMin.value = String(o.min);
        marcarRotaLiveNoDom(!!o.live);
        dispPub.textContent = o.label;
        menuPub.querySelectorAll('.route-dd-item').forEach((ib) => {
          ib.setAttribute('aria-selected', ib.dataset.apOp === o.key ? 'true' : 'false');
        });
        fecharMenusRoteamentoTelas();
        atualizarEstiloRotasDesativadas();
        /* O reenvio tem de esperar pelo PUT: as janelas do canal novo só existem depois de
           o servidor sincronizar a rota, e conteúdo enviado antes disso cai no vazio. */
        /* Antes do PUT, e a partir do DOM que o clique acabou de escrever: é este o único
           sítio onde se sabe que foi o operador a escolher. */
        registrarEscolhaMonitorDoOperador();
        /* E é também o único sítio onde se sabe que o «Não exibir» é ORDEM do operador, e
           não o −1 que um caminho automático deixou. Ver `modules/ordemNaoExibirUnificado.js`. */
        registrarEscolhaSeletorUnificado(modoRoteamentoAtual(), o.key);
        salvarRoteamentoTelasNoServidor()
          .then(() => reemitirConteudoAposMudancaDeRotaUnificada())
          .catch(() => {
            // intencional — falha de rede já é reportada por quem faz o PUT
          });
        atualizarIndicadorProjecaoLiveUi();
      });
      li.appendChild(b);
      menuPub.appendChild(li);
    });
    atualizarEstiloRotasDesativadas();
    aplicarPreviewPainelOcultoNoDom();
    atualizarIndicadorProjecaoLiveUi();
    return;
  }

  if (!lista.length) {
    hidPub.value = '-1';
    hidMin.value = '-1';
    dispPub.textContent = 'Não exibir';
    dispMin.textContent = 'Não exibir';
    preencherMenu(menuPub, hidPub, dispPub, '-1');
    preencherMenu(menuMin, hidMin, dispMin, '-1');
    atualizarEstiloRotasDesativadas();
    aplicarPreviewPainelOcultoNoDom();
    return;
  }

  let pub = indiceRoteamentoMonitorNaUi(routing?.publicoIndex);
  let min = indiceRoteamentoMonitorNaUi(routing?.ministranteIndex);
  pub = sanitizarIndiceMonitorProjecao(pub, lista);
  min = sanitizarIndiceMonitorProjecao(min, lista);
  /* Rota gravada antes desta regra podia ter o mesmo monitor nas duas saídas. Mostrar isso
     tal e qual deixaria o operador a olhar para uma configuração que o motor não consegue
     cumprir. Resolve-se aqui, com o Público a prevalecer. */
  ({ publicoIndex: pub, ministranteIndex: min } = rotaSemMonitorRepetido(
    { publicoIndex: pub, ministranteIndex: min },
    'publico'
  ));

  const pubStr = String(pub);
  const minStr = String(min);
  const rotPub = items.find((x) => x.value === pubStr);
  const rotMin = items.find((x) => x.value === minStr);
  hidPub.value = pubStr;
  hidMin.value = minStr;
  dispPub.textContent = rotPub ? rotPub.label : 'Não exibir';
  dispMin.textContent = rotMin ? rotMin.label : 'Não exibir';

  preencherMenu(menuPub, hidPub, dispPub, pubStr, {
    menu: menuMin,
    hid: hidMin,
    disp: dispMin,
  });
  preencherMenu(menuMin, hidMin, dispMin, minStr, {
    menu: menuPub,
    hid: hidPub,
    disp: dispPub,
  });
  atualizarEstiloRotasDesativadas();
  aplicarPreviewPainelOcultoNoDom();
}

/** Destaque vermelho quando a rota está em «Não exibir» (sem telão/TV externos — só pré-visualizações). */
function atualizarEstiloRotasDesativadas() {
  const wrapPub = document.getElementById('route-publico-dd');
  const wrapMin = document.getElementById('route-ministrante-dd');
  const hidPub = document.getElementById('route-publico');
  const hidMin = document.getElementById('route-ministrante');
  const btnPub = document.getElementById('route-publico-btn');
  const btnMin = document.getElementById('route-ministrante-btn');
  const modoUnificado = modoUsaSeletorMonitorUnificado();
  /* Monitor emprestado ao canal partilhado — Mídias ou Bíblia: o seletor do Slides
     mostra-o apagado em vez de deixar mudá-lo por baixo da projeção no ar. */
  const bloqPubAp = ehModoSlidesOperador() && canalPublicoOcupadoPorOutroModoNoSlides();
  const bloqMinAp = ehModoSlidesOperador() && canalMinistranteOcupadoPorOutroModoNoSlides();
  if (wrapPub && hidPub && hidMin) {
    const des = modoUnificado
      ? hidPub.value === '-1' && hidMin.value === '-1' && !rotaLiveSelecionadaNaUi()
      : hidPub.value === '-1';
    wrapPub.classList.toggle('route-dd--rota-desativada', des);
    wrapPub.classList.toggle('route-dd--rota-live', modoUnificado && rotaLiveSelecionadaNaUi());
    wrapPub.classList.toggle('route-dd--bloqueado-apresentacao', bloqPubAp);
    if (btnPub) {
      btnPub.disabled = bloqPubAp;
      btnPub.title = bloqPubAp
        ? rotuloBloqueioMonitorOcupado()
        : des
          ? modoUnificado
            ? 'Não exibir: nenhum monitor externo disponível para este modo.'
            : 'Não exibir: o monitor continua ligado, mas não recebe conteúdo deste modo — só a pré-visualização deste painel.'
          : modoUnificado
            ? 'Onde projetar (público, ministrante ou ambos).'
            : 'Escolher monitor do telão / público';
    }
  }
  if (wrapMin && hidMin) {
    /* Com um só monitor de projeção não há segunda saída para dar ao ministrante: o
       seletor fica desativado em vez de oferecer uma escolha que colidiria com o telão. */
    const semSegundaSaida = !modoUnificado && contarMonitoresDeProjecao() <= 1;
    if (semSegundaSaida && hidMin.value !== '-1') hidMin.value = '-1';
    const des = hidMin.value === '-1';
    wrapMin.classList.toggle('route-dd--rota-desativada', des && !semSegundaSaida);
    wrapMin.classList.toggle('route-dd--sem-monitor', semSegundaSaida);
    wrapMin.classList.toggle('route-dd--bloqueado-apresentacao', bloqMinAp);
    const dispMin = document.getElementById('route-ministrante-display');
    if (semSegundaSaida && dispMin) dispMin.textContent = 'Nenhum';
    if (btnMin) {
      btnMin.disabled = bloqMinAp || semSegundaSaida;
      btnMin.title = semSegundaSaida
        ? 'Só há um monitor de projeção disponível — ele está reservado ao telão. Ligue um segundo monitor para usar o retorno do ministrante.'
        : bloqMinAp
          ? rotuloBloqueioMonitorOcupado()
          : des
            ? 'Não exibir: o monitor continua ligado, mas não recebe conteúdo deste modo — só a pré-visualização deste painel.'
            : 'Escolher monitor do ministrante / retorno';
    }
  }
}

/** Texto do seletor bloqueado: nomeia o modo que está a ocupar o monitor. */
function rotuloBloqueioMonitorOcupado() {
  const ehBiblia =
    bibliaProjecaoAtivaNoCanalPublico() || bibliaProjecaoAtivaNoCanalMinistrante();
  const modoQueOcupa = ehBiblia ? 'a Bíblia' : 'a Apresentação';
  return `Bloqueado: ${modoQueOcupa} está a projetar neste monitor — encerre essa projeção para alterar.`;
}

/** Quantos monitores restam para projeção depois de reservar o principal ao operador. */
function contarMonitoresDeProjecao() {
  return listaMonitoresParaProjecao(monitoresServidorCache).length;
}

function rotaSelecionadaNaUi() {
  const selPublico = document.getElementById('route-publico');
  const selMin = document.getElementById('route-ministrante');
  if (!selPublico || !selMin) return null;
  const live = rotaLiveSelecionadaNaUi();
  const publicoIndex = parseInt(selPublico.value, 10);
  const ministranteIndex = parseInt(selMin.value, 10);
  if (!Number.isFinite(publicoIndex) || !Number.isFinite(ministranteIndex)) return null;
  return { publicoIndex: live ? -1 : publicoIndex, ministranteIndex: live ? -1 : ministranteIndex, live };
}

async function aplicarRotaDoModoAtualNaUiEServidor(opts = {}) {
  const sincronizarServidor = opts.sincronizarServidor !== false;
  const modo = modoRoteamentoAtual();

  const rotaAjustada =
    modo === 'slides'
      ? obterRotaSlidesParaUi()
      : sanitizarRotaProjecao(normalizarRota(rotasPorModo[modo]), monitoresServidorCache);
  salvarRotasPorModoNoStorage();
  renderRoteamentoTelas(monitoresServidorCache, rotaAjustada);
  if (sincronizarServidor) {
    await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
  }
}

function clampSlidesRailHeight(px) {
  const min = 260;
  const max = Math.max(min + 80, Math.floor(window.innerHeight * 0.78));
  return Math.min(Math.max(px, min), max);
}

function initSlidesRailHeightFromStorage() {
  const saved = parseInt(localStorage.getItem(LS_SLIDES_RAIL_PX), 10);
  const fallback = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--slides-rail-height'),
    10
  ) || 520;
  const base = Number.isFinite(saved) ? saved : fallback;
  document.documentElement.style.setProperty('--slides-rail-height', clampSlidesRailHeight(base) + 'px');
}

/**
 * Modo slides: a divisória arrasta a faixa de prévias (TELÃO/TV). Arrastar para baixo
 * aumenta as prévias e encolhe a grelha de slides; para cima faz o inverso. A grelha
 * fica sempre com o resto do espaço (`1fr`), por isso nunca sobra área morta.
 */
const SLIDES_PREVIEW_H_MIN_FALLBACK = 172;

/** Piso vem do CSS (`--preview-mod-card-h-min`) para não haver dois valores a divergir. */
function alturaMinimaPreviewMod() {
  const px = parseInt(
    getComputedStyle(document.body).getPropertyValue('--preview-mod-card-h-min'),
    10
  );
  return Number.isFinite(px) ? px : SLIDES_PREVIEW_H_MIN_FALLBACK;
}

/**
 * As prévias nunca encolhem abaixo do piso: arrastar a divisória para cima só
 * devolve espaço à grelha até esse limite; para baixo aumenta as prévias.
 */
function clampAlturaPreviewMod(px) {
  const min = alturaMinimaPreviewMod();
  const max = Math.max(min + 60, Math.floor(window.innerHeight * 0.5));
  return Math.min(Math.max(Math.round(px), min), max);
}

function alturaPreviewModAtualPx() {
  const px = parseInt(getComputedStyle(document.body).getPropertyValue('--preview-mod-card-h'), 10);
  return Number.isFinite(px) ? px : 68;
}

/* Inline no <body> para vencer o valor-padrão da regra `body.app-mod-slides`. */
function aplicarAlturaPreviewMod(px) {
  document.body.style.setProperty('--preview-mod-card-h', clampAlturaPreviewMod(px) + 'px');
}

function initAlturaPreviewModFromStorage() {
  const saved = parseInt(localStorage.getItem(LS_SLIDES_PREVIEW_H_PX), 10);
  if (Number.isFinite(saved)) aplicarAlturaPreviewMod(saved);
}

function setupSlidesRailResize() {
  const handle = document.getElementById('slides-resize-handle');
  if (!handle) return;

  handle.addEventListener('mousedown', (e) => {
    const emModoSlides = ehModoSlidesOperador();
    if (!emModoSlides && !document.body.classList.contains('slides-rail-aberto')) return;
    slidesRailDrag.active = true;
    slidesRailDrag.alvo = emModoSlides ? 'previa' : 'faixa';
    slidesRailDrag.startY = e.clientY;
    slidesRailDrag.startH = emModoSlides
      ? alturaPreviewModAtualPx()
      : parseInt(
          getComputedStyle(document.documentElement).getPropertyValue('--slides-rail-height'),
          10
        ) || 520;
    e.preventDefault();
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });
}

let socket = null;
let companionHandoffEmCurso = false;
let autoConectarAoIniciarEmCurso = false;
let reassumirLocalEmCurso = false;
// Write-lock: papel deste controlador conforme o servidor (null = ainda desconhecido).
// { primario: boolean, podeEscrever: boolean, donoAtual: string|null }
let papelControladorLocal = null;
// Último display_config autoritativo recebido do servidor — base do "pull" quando somente-leitura.
let ultimaDisplayConfigServidor = null;
let apresentacaoBiblioteca = [];
let apresentacaoCards = Array(6).fill(null);
/** Índice do card 5 na grelha (0-based = 4); único slot que aceita vídeo. */
const APRESENTACAO_IDX_CARD5 = 4;

/**
 * Índice do card 4 na grelha (0-based = 3).
 *
 * Ao contrário dos outros, este card não guarda uma mídia: é o recipiente de quatro áreas
 * de imagem independentes, numa grelha 2×2. O slot correspondente em `apresentacaoCards`
 * fica sempre vazio — quem guarda o conteúdo é `apresentacaoCard4Imagens`.
 */
const APRESENTACAO_IDX_CARD4 = 3;

/** As quatro imagens do card 4, por posição na grelha (0 = cima-esquerda … 3 = baixo-direita). */
let apresentacaoCard4Imagens = Array(4).fill(null);
/** Área do card 4 à espera do ficheiro escolhido no seletor, ou `null`. */
let apresentacaoCard4InputTarget = null;
// (extraído) seleção do card de 4 imagens → painel/gridApresentacao.js

/** As quatro áreas exibem imagens; o mesmo critério que a prévia dos outros cards usa. */
function ehItemImagemApresentacao(it) {
  const kind = String(it?.kind || '').toLowerCase();
  const mime = String(it?.mime || '').toLowerCase();
  return kind === 'image' || mime.startsWith('image/') || /^data:image\//i.test(String(it?.src || ''));
}

/** Texto editável do card 6 (avisos); não usa ficheiro. */
let apresentacaoCard6Texto = '';
/** Configuração global do card 6 — aplicada igualmente ao público e ministrante. */
let apresentacaoCard6AvisoCfg = clonarCfgAvisoCard6Padrao();
let apresentacaoAudios = [];
let apresentacaoArquivoSelecionadoId = null;
/** Id do item de vídeo/imagem/PDF/web projetado no telão público (não áudio) — destaque no card e roda-pé. */
let apresentacaoMidiaProjetadaId = null;
let apresentacaoAudioAtualId = null;
let audioStateRemoto = {
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  name: '',
  /** 'audio' | 'video' — qual elemento `<audio>` / `<video>` o player universal controla. */
  mediaKind: '',
};
let audioLoopAtivo = false;
let audioLoopReinicioPendente = false;
// (extraído) volume antes de mutar → painel/playerLocalMidia.js
/** ─── Playlist de vídeos (modo Mídias) — camada sobre o motor de vídeo único ─── */
let apresentacaoVideoPlaylist = [];
/** Índice do item atualmente carregado/reproduzido na playlist (-1 = nenhum). */
let playlistVideoIndice = -1;
/** 'manual' (padrão) | 'auto' — comportamento ao terminar um vídeo. */
let playlistVideoModo = 'manual';
/** Segundos de intervalo antes de iniciar o próximo no modo automático (0,1,2,3,5). */
let playlistVideoAtrasoAuto = 0;
/** true quando a playlist é o contexto que controla o player de vídeo. */
let playlistVideoAtiva = false;
// (extraído) timer da playlist de vídeos → painel/playlistVideoApresentacao.js
/** Guarda: reaproveita projetarItemApresentacao sem desativar a playlist. */
let _playlistProjetando = false;
// (extraído) arrastar na playlist de vídeos → painel/playlistVideoApresentacao.js
/** Cache do estado tocando/pausado para atualizar a UI só em transições. */
let _playlistUiTocandoCache = null;
// (extraído) guarda visual do áudio → painel/estadoApresentacao.js
let audioSeekDragging = false;
let apresentacaoCardInputTarget = null;
let rotasPorModo = {
  completo: { publicoIndex: -1, ministranteIndex: -1 },
  slides: { publicoIndex: -1, ministranteIndex: -1 },
  apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
  apresentacaoAviso: { publicoIndex: -1, ministranteIndex: -1 },
  biblia: { publicoIndex: -1, ministranteIndex: -1 },
  /* Rota só do DOCS — estado próprio, nunca espelhado em `apresentacao` nem em `biblia`. */
  docs: { publicoIndex: -1, ministranteIndex: -1 },
  /* Pin exclusivo do Contador — nunca partilha com o seletor do cabeçalho. */
  contagem: { publicoIndex: -1, ministranteIndex: -1 },
};
let musicaAtiva = null;
/**
 * Destaque visual da Biblioteca — exclusivo em relação à Playlist.
 * `{ id, fonte }` da linha clicada; `null` se nada estiver marcado à esquerda.
 */
let selecaoUiBiblioteca = null;
/**
 * Destaque visual da Playlist — exclusivo em relação à Biblioteca.
 * `{ id, versaoLocalId, fonte }` do item clicado; `null` se nada estiver marcado à direita.
 */
let selecaoUiPlaylist = null;
/** `user` — SQLite do servidor · `catalog` — `catalog.db` somente leitura (mesmo `id` pode existir nos dois). */
let musicaBancoFonte = 'user';
/** `null` = letra do servidor (original ou cópia com id próprio); id `c_*` = cópia legada em localStorage. */
let musicaVersaoLocalId = null;
/** Âncora da família de versões no SQLite (`root_id`). */
let musicaRootId = null;
/** Cache de `GET /api/musicas/:id/versoes` para a barra de versões. */
let versoesMusicaServidorCache = { rootId: null, versoes: [] };
let estrofeAtiva = -1;
let todasMusicas = [];
let estadoServidor = null;
// (extraído) estado da prévia oculta → painel/previewOculto.js
/** Composição visual da Home; música, versões e edição continuam neste núcleo. */
let homeLayout = null;
// (extraído) sincronização do estado → painel/estadoApresentacao.js
let syncApresentacaoAvisoLiveTimer = null;

// (extraído) estado do modo apresentação → painel/estadoApresentacao.js
let cultoId = '';
let playlists = {};
let temaSelecionadoPorCulto = {};
let temasPorCulto = {};
/** Só permite editar/apagar estrofes após «Editar letra». */
let modoEdicaoEstrofes = false;
/** true = TODAS MAIÚSCULAS na edição; false = 1.ª maiúscula + resto minúsculas (por linha). */
let caixaLetrasEdicaoMaiuscula = false;
/** Coluna central: ver letra inteira num só bloco (cópia), em vez dos cartões por slide. */
let modoLetraCompletaCentral = false;
/** Letra completa tem dois modos: visualização (somente leitura) e edição (depois de «Editar»). */
let letraCompletaEditando = false;
/** Cópia ao entrar no modo letra completa — «Cancelar» restaura isto (não aplica o textarea). */
let snapshotLetraCompleta = null;
/**
 * MODO COMPARATIVO — duas versões da mesma música lado a lado.
 *
 * Vive à parte dos outros dois modos da coluna central (cartões por slide e
 * letra completa): tem painel próprio, guarda o seu próprio par de versões e
 * grava directamente por `id` de versão, sem passar por `musicaAtiva`. É por
 * isso que não mexe em nada do fluxo de edição existente.
 */
let modoComparativoCentral = false;
/** `{ a: LadoComparativo, b: LadoComparativo }` das versões carregadas. */
let comparativoLados = null;
/** Estrofes de cada lado ao abrir — «Cancelar» descarta contra isto. */
let snapshotComparativo = null;
/** Cópia ao entrar em edição — «Encerrar edição» restaura isto (não grava). */
let snapshotEdicaoEstrofes = null;
// (extraído) estado do editor → painel/editorEstrofes.js
/**
 * Faixa inferior de slides: no modo controlador só após duplo clique num slide central.
 * No modo slides fica visível ao escolher música na playlist (sem projetar até duplo clique na lista).
 */
let slidesDockVisivel = false;
/** Modo slides: após ESC a música é desmarcada; ao escolher outra na playlist a faixa volta a abrir. */
let slidesRailUserRecolhido = false;
/**
 * Modo slides: a grelha de chips só aparece após escolher música na playlist (não ao carregar do banco na coluna esquerda).
 * Ao entrar no modo slides fica sempre false até clique/dupro na playlist ou «Próxima música».
 */
let faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
/**
 * Quando false, mudanças de estrofe só atualizam o painel (sem enviar às telas) até o primeiro duplo clique
 * na faixa de slides ou no cartão central — ou até «Próxima música», sincronização do servidor, etc.
 */
let projecaoMusicaEmitidaNoServidor = false;
/**
 * Após escolher música no painel (playlist/banco), não aplicar estado «estado» do socket como se fosse projeção
 * até este cliente emitir `exibir_musica` — senão o servidor continua com a mesma música e os previews voltavam a mostrar letra só com um clique.
 */
let bloqueioSincronizarEstrofeDoServidor = false;
/** Evita que dois cliques rápidos na playlist disparem só seleção duas vezes + duplo clique (projeta sem querer). */
let playlistRowClickTimer = null;
let slidesRailDrag = { active: false, alvo: 'faixa', startY: 0, startH: 520 };
let monitoresServidorCache = [];

document.addEventListener('mousemove', (e) => {
  if (!slidesRailDrag.active) return;
  if (slidesRailDrag.alvo === 'previa') {
    /* Para baixo (dy > 0) = prévias maiores, grelha menor. */
    aplicarAlturaPreviewMod(slidesRailDrag.startH + (e.clientY - slidesRailDrag.startY));
    return;
  }
  const dy = slidesRailDrag.startY - e.clientY;
  const nh = clampSlidesRailHeight(slidesRailDrag.startH + dy);
  document.documentElement.style.setProperty('--slides-rail-height', nh + 'px');
});

document.addEventListener('mouseup', () => {
  if (!slidesRailDrag.active) return;
  slidesRailDrag.active = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  if (slidesRailDrag.alvo === 'previa') {
    localStorage.setItem(LS_SLIDES_PREVIEW_H_PX, String(alturaPreviewModAtualPx()));
  } else {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--slides-rail-height');
    const px = parseInt(raw, 10);
    if (Number.isFinite(px)) localStorage.setItem(LS_SLIDES_RAIL_PX, String(px));
  }
  queueMicrotask(() => {
    if (document.hidden) return;
    ajustarEncaixeGrelhaSlidesModoSlides();
    reaplicarFontesPreviewPainel();
    reaplicarAlturasEstrofesEditor();
  });
});

window.addEventListener('resize', () => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--slides-rail-height');
  const px = parseInt(raw, 10);
  if (Number.isFinite(px)) {
    document.documentElement.style.setProperty('--slides-rail-height', clampSlidesRailHeight(px) + 'px');
  }
  if (document.body.style.getPropertyValue('--preview-mod-card-h')) {
    aplicarAlturaPreviewMod(alturaPreviewModAtualPx());
  }
  if (document.hidden) return;
  queueMicrotask(() => {
    ajustarEncaixeGrelhaSlidesModoSlides();
    reaplicarFontesPreviewPainel();
    reaplicarAlturasEstrofesEditor();
  });
});

// (extraído) playlists, temas e ministrante → painel/playlistTemas.js

// (extraído) compartilhar e importar playlist → painel/playlistCompartilhar.js
iniciarPlaylistCompartilhar();

function excluirTemaDoCulto(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t) return;
  if (t === TEMA_PADRAO_ABERTURA && cultoId) marcarAberturaRemovidaPeloUsuario(cultoId);
  temasPorCulto['__global__'] = getTemasDoCultoAtual().filter((x) => x !== t);
  saveTemasPorCulto();
  // Remove da playlist do culto atual
  if (cultoId) {
    const pl = getPlaylist(cultoId);
    const filtrado = playlistPossuiMarcadoresTema(pl)
      ? filtrarPlaylistRemovendoTemaComMarcadores(pl, t)
      : pl.filter((it) => normalizarTemaPlaylist(it.tema) !== t);
    playlists[cultoId] = filtrado;
    if (getTemaSelecionadoAtual() === t) setTemaSelecionadoAtual('');
    savePlaylists();
    const plDepois = getPlaylist(cultoId);
    const aindaNaLista =
      !!musicaAtiva &&
      plDepois.some((it) => !ehMarcadorTemaPlaylist(it) && playlistItemMesmaVersaoQueAtiva(it));
    if (musicaAtiva && !aindaNaLista) encerrarProjecaoDoControlador({ limparMusica: true });
  }
}

function getTemaSelecionadoAtual() {
  if (!cultoId) return '';
  return normalizarTemaPlaylist(temaSelecionadoPorCulto[cultoId] || '');
}

function setTemaSelecionadoAtual(v) {
  if (!cultoId) return;
  const t = normalizarTemaPlaylist(v);
  temaSelecionadoPorCulto[cultoId] = t;
  saveTemaSelecionadoPorCulto();
}

/**
 * Um tema só pode ocupar um bloco por culto. Cobre o marcador do bloco e as músicas
 * já etiquetadas; a comparação passa pelo normalizador (trim, espaços, maiúsculas).
 */
function playlistAtualJaTemTema(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t || !cultoId) return false;
  return getPlaylist(cultoId).some((it) => normalizarTemaPlaylist(it?.tema) === t);
}

/**
 * Um seletor aberto de cada vez: fecha todos os dropdowns customizados excepto `excetoWrap`.
 * Não mexe em opções nem na lógica de escolha — só no estado aberto/fechado.
 */
function fecharOutrosSeletoresDropdown(excetoWrap) {
  document.querySelectorAll('.playlist-tema-dd, .banco-fonte-dd').forEach((w) => {
    if (w !== excetoWrap) fecharLyraSelectDropdownWrap(w);
  });
  if (document.getElementById('culto-dd') !== excetoWrap) fecharCultoDropdown();
  document.querySelectorAll('.route-dd').forEach((wrap) => {
    if (wrap === excetoWrap) return;
    wrap.classList.remove('route-dd-open');
    const menu = wrap.querySelector('.route-dd-menu');
    const btn = wrap.querySelector('.route-dd-btn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
  const overflowWrap = document.querySelector('.ap-playlist-overflow');
  if (overflowWrap && overflowWrap !== excetoWrap) fecharMenuOverflowPlaylist();
}

function fecharLyraSelectDropdownWrap(wrap) {
  if (!wrap) return;
  const menu = wrap.querySelector('.playlist-tema-dd-menu');
  const btn = wrap.querySelector('.playlist-tema-dd-btn');
  wrap.classList.remove('open');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/** Mesmo visual/hover do dropdown «Tema da playlist» — evita o destaque azul do `<select>` nativo. */
function setupLyraSelectDropdownWrap(wrap) {
  if (!wrap || wrap.dataset.lyraSelectDdBound === '1') return;
  wrap.dataset.lyraSelectDdBound = '1';
  const btn = wrap.querySelector('.playlist-tema-dd-btn');
  const menu = wrap.querySelector('.playlist-tema-dd-menu');
  if (!btn || !menu) return;
  const fechar = () => fecharLyraSelectDropdownWrap(wrap);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    const abrir = menu.hidden;
    fecharOutrosSeletoresDropdown(wrap);
    if (abrir) {
      wrap.classList.add('open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    } else {
      fecharLyraSelectDropdownWrap(wrap);
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fechar();
  });
}

function renderItensLyraSelectDropdown(wrap, items, opts = {}) {
  if (!wrap) return;
  const menu = wrap.querySelector('.playlist-tema-dd-menu');
  const label = wrap.querySelector('.playlist-tema-dd-label');
  const hid = wrap.querySelector('input[type="hidden"]');
  if (!menu || !label || !hid) return;
  const valorAtual = opts.valorAtual != null ? String(opts.valorAtual) : String(hid.value || '');
  const placeholder = opts.placeholder ?? '—';
  menu.innerHTML = '';
  let rotuloBtn = placeholder;
  items.forEach(({ value, label: rotulo }) => {
    const v = value != null ? String(value) : '';
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'playlist-tema-dd-item';
    b.dataset.value = v;
    b.textContent = rotulo;
    b.setAttribute('aria-selected', v === valorAtual ? 'true' : 'false');
    li.appendChild(b);
    menu.appendChild(li);
    if (v === valorAtual) rotuloBtn = rotulo;
  });
  label.textContent = rotuloBtn;
  hid.value = valorAtual;
  menu.querySelectorAll('.playlist-tema-dd-item').forEach((b) => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const v = b.dataset.value ?? '';
      hid.value = v;
      label.textContent = b.textContent;
      menu.querySelectorAll('.playlist-tema-dd-item').forEach((ib) => {
        ib.setAttribute('aria-selected', ib.dataset.value === v ? 'true' : 'false');
      });
      fecharLyraSelectDropdownWrap(wrap);
      if (typeof opts.aoSelecionar === 'function') opts.aoSelecionar(v);
    });
  });
}

/**
 * Sincroniza o catálogo de temas com a playlist do culto e devolve os temas disponíveis,
 * já ordenados. Só acrescenta ao catálogo temas vindos da playlist; não substitui o catálogo
 * pelo merge (substituir apagava temas criados em «Novo momento…» que ainda não tinham
 * música na playlist). Se o tema selecionado deixou de existir, a seleção é limpa.
 */
function obterTemasDisponiveisPlaylist() {
  const pl = cultoId ? getPlaylist(cultoId) : [];
  const temasDaPlaylist = [
    ...new Set(
      pl.flatMap((x) => {
        if (ehMarcadorTemaPlaylist(x)) {
          const tm = normalizarTemaPlaylist(x.tema);
          return tm ? [tm] : [];
        }
        const tm = normalizarTemaPlaylist(x?.tema);
        return tm ? [tm] : [];
      })
    ),
  ];
  /* Só acrescenta à lista guardada temas vindos da playlist; não substituir o catálogo pelo merge
   * (substituir apagava temas criados com «+ TEMA» que ainda não tinham música na playlist). */
  if (cultoId) {
    const base = normalizarListaTemas([...(temasPorCulto[cultoId] || [])]);
    const seen = new Set(base);
    let mudou = false;
    temasDaPlaylist.forEach((t) => {
      if (t && !seen.has(t)) {
        base.push(t);
        seen.add(t);
        mudou = true;
      }
    });
    if (mudou) {
      temasPorCulto[cultoId] = ordenarTemasLista(normalizarListaTemas(base));
      saveTemasPorCulto();
    }
  }
  const temasDoCatalogoDepois = getTemasDoCultoAtual();
  const temas = ordenarTemasLista(normalizarListaTemas([...temasDoCatalogoDepois, ...temasDaPlaylist]));
  const atualAplicado = getTemaSelecionadoAtual();
  if (atualAplicado && !temas.includes(atualAplicado)) setTemaSelecionadoAtual('');
  return temas;
}

/** Mantém o nome histórico: chamado após qualquer mudança de tema/playlist para sincronizar o catálogo. */
function renderSeletorTemasPlaylist() {
  obterTemasDisponiveisPlaylist();
}

// (extraído) sincronização do banco → painel/sincronizacaoBanco.js

async function enviarPlaylistsParaServidor() {
  /* Escreve no `/api/playlists` desta máquina (:3001), que é de onde o celular as lê —
     inclusive no modo local, via `solicitar_playlists_controlador`. Com o guard preso a
     `getServidorIp`, uma instalação sem IP gravado nunca publicava a playlist e o celular
     ficava a ver uma lista vazia. */
  const hostAtual = hostProjecao();
  if (!hostAtual) return;
  try {
    await fetch(`${getControllerApiBase()}/api/playlists`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playlists),
    });
  } catch (_) {
  // intencional — erro ignorado
}
}

function enviarPlaylistsParaServidorDebounced() {
  clearTimeout(getEnviarPlaylistsServidorTimer());
  setEnviarPlaylistsServidorTimer(setTimeout(() => enviarPlaylistsParaServidor(), 450));
}

let emitirPlaylistsRedeTimer = null;

/**
 * Publica as playlists para quem estiver a hospedar a porta 5510.
 *
 * Vai pela porta de projeção, e não pelo socket cru, porque o destinatário muda com o
 * modo: no remoto é o Servidor, que reencaminha aos telemóveis; no local é o próprio
 * processo principal, que faz o mesmo reencaminhamento. O celular não nota diferença — é
 * o mesmo evento com o mesmo formato.
 */
function emitirPlaylistsDoControlador() {
  try {
    projecao.enviar('controlador_playlists', playlists);
  } catch (_) {
  // intencional — erro ignorado
}
}

function emitirPlaylistsDoControladorDebounced() {
  clearTimeout(emitirPlaylistsRedeTimer);
  emitirPlaylistsRedeTimer = setTimeout(() => emitirPlaylistsDoControlador(), 280);
}

function savePlaylists() {
  localStorage.setItem(LS_PLAYLISTS, JSON.stringify(playlists));
  /* Se o culto ganhou a 1.ª música com ministrante só em sessão, passa a
     persistir; se ficou sem músicas, some do disco para o próximo reload. */
  persistirMinistrantePadraoNoLocalStorage();
  enviarPlaylistsParaServidorDebounced();
  emitirPlaylistsDoControladorDebounced();
  marcarBancoCompartilhadoAlterado(new Date().toISOString(), { incluirPlaylists: true });
}

/** Remove um id de todas as playlists guardadas (ex.: música apagada no servidor). */
function removerMusicaDeTodasPlaylists(idMusica) {
  const idNum = Number(idMusica);
  if (!Number.isFinite(idNum)) return;
  let mudou = false;
  Object.keys(playlists).forEach((cid) => {
    const pl = playlists[cid];
    if (!Array.isArray(pl)) return;
    const novo = pl.filter((it) => Number(it.id) !== idNum);
    if (novo.length !== pl.length) {
      playlists[cid] = novo;
      mudou = true;
    }
  });
  if (mudou) savePlaylists();
}

/** Quando uma cópia local é apagada, entradas da playlist que a usavam passam a referenciar o original. */
function removerVersaoLocalDasPlaylists(idMusica, copiaId) {
  const idStr = String(Number(idMusica));
  const vid = String(copiaId);
  let mudou = false;
  Object.keys(playlists).forEach((cid) => {
    const pl = playlists[cid];
    if (!Array.isArray(pl)) return;
    pl.forEach((it) => {
      if (!it || ehMarcadorTemaPlaylist(it)) return;
      if (String(it.id) !== idStr) return;
      if (it.versaoLocalId && String(it.versaoLocalId) === vid) {
        it.versaoLocalId = null;
        it.versaoRotulo = '';
        mudou = true;
      }
    });
  });
  if (mudou) savePlaylists();
}

/**
 * Edição rápida no modo slides: o servidor não altera originais imutáveis — cria um fork.
 * Sem repontar a entrada da playlist do dia para o fork, ao voltar ao modo slides
 * recarregava-se o original (a edição só existia no estado da sessão).
 *
 * Reaponta apenas as entradas do culto indicado que correspondiam à versão editada;
 * o `id` da entrada continua a ser o root (identidade da música na playlist), muda só
 * `versaoLocalId`/`versaoRotulo`. Não mexe em ordem, nem adiciona/remove entradas.
 *
 * @param {string} cid culto (dia) cuja playlist deve ser repontada
 * @param {number} rootId root da família de versões
 * @param {string} versaoAntes versão ativa antes de gravar ('' = original do servidor)
 * @param {number|string} novaVersaoId id do fork criado pelo servidor
 * @param {string} [novoRotulo] rótulo do fork, para o cache visual da linha
 * @returns {boolean} true se alguma entrada foi repontada
 */
function repontarVersaoNaPlaylistDoCulto(cid, rootId, versaoAntes, novaVersaoId, novoRotulo) {
  const root = Number(rootId);
  const novoVid = novaVersaoId != null && String(novaVersaoId).trim() ? String(novaVersaoId).trim() : '';
  if (!cid || !Number.isFinite(root) || !novoVid) return false;
  const pl = playlists[cid];
  if (!Array.isArray(pl)) return false;

  const antes = versaoAntes ? String(versaoAntes).trim() : '';
  const rotulo = String(novoRotulo || '').trim();
  let mudou = false;

  pl.forEach((it) => {
    if (!it || ehMarcadorTemaPlaylist(it)) return;
    /* Catálogo é somente leitura: nunca chega aqui, mas não repontar por segurança. */
    if (it.bancoFonte === 'catalog') return;
    if (Number(it.id) !== root) return;
    const vidItem = it.versaoLocalId ? String(it.versaoLocalId).trim() : '';
    if (vidItem !== antes) return;
    if (vidItem === novoVid) return;
    it.versaoLocalId = novoVid;
    it.versaoRotulo = rotulo;
    mudou = true;
  });

  if (mudou) savePlaylists();
  return mudou;
}

/** Atualiza o rótulo em cache das entradas de playlist que apontam para esta versão. */
function atualizarRotuloVersaoNasPlaylists(idMusica, versaoId, novoRotulo) {
  const idStr = String(Number(idMusica));
  const vid = String(versaoId);
  const rotulo = String(novoRotulo || '').trim();
  let mudou = false;
  Object.keys(playlists).forEach((cid) => {
    const pl = playlists[cid];
    if (!Array.isArray(pl)) return;
    pl.forEach((it) => {
      if (!it || ehMarcadorTemaPlaylist(it)) return;
      if (String(it.id) !== idStr) return;
      if (it.versaoLocalId && String(it.versaoLocalId) === vid) {
        it.versaoRotulo = rotulo;
        mudou = true;
      }
    });
  });
  if (mudou) savePlaylists();
}

// (extraído) excluir música do banco → painel/removerMusicaBanco.js

function getPlaylist(cid) {
  if (!Array.isArray(playlists[cid])) playlists[cid] = [];
  playlists[cid] = playlists[cid].map((it) => {
    if (it && it.tipo === PLAYLIST_TIPO_MARCADOR_TEMA) {
      return { tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema: normalizarTemaPlaylist(it.tema) };
    }
    return {
      ...it,
      tema: normalizarTemaPlaylist(it?.tema),
      versaoLocalId: versaoLocalIdTrimado(it.versaoLocalId) || null,
      versaoRotulo: String(it.versaoRotulo || '').trim(),
      bancoFonte: fonteBancoItemPlaylist(it),
      ministranteId: normalizarMinistranteIdPlaylist(it.ministranteId),
      tom: normalizarTomPlaylist(it.tom),
    };
  });
  return playlists[cid];
}

function playlistItemMesmaVersaoQueAtiva(it) {
  if (!musicaAtiva) return false;
  return playlistItemMesmaVersaoQueRaiz(
    it,
    obterRootIdMusicaAtiva(),
    versaoAtivaParaCompararPlaylist(),
    musicaBancoFonte
  );
}

function aplicarSelecaoUiBiblioteca(id, fonte) {
  const n = Number(id);
  if (!Number.isFinite(n)) {
    selecaoUiBiblioteca = null;
    return;
  }
  selecaoUiBiblioteca = {
    id: n,
    fonte: fonteBancoNormalizada(fonte),
  };
  selecaoUiPlaylist = null;
}

function aplicarSelecaoUiPlaylist(id, versaoLocalId, fonte) {
  const n = Number(id);
  if (!Number.isFinite(n)) {
    selecaoUiPlaylist = null;
    return;
  }
  selecaoUiPlaylist = {
    id: n,
    versaoLocalId: versaoLocalId ? String(versaoLocalId) : '',
    fonte: fonteBancoNormalizada(fonte),
  };
  selecaoUiBiblioteca = null;
}

function playlistItemMesmaVersaoQueSelecaoUi(it) {
  if (!selecaoUiPlaylist) return false;
  return playlistItemMesmaVersaoQueRaiz(
    it,
    Number(selecaoUiPlaylist.id),
    selecaoUiPlaylist.versaoLocalId,
    selecaoUiPlaylist.fonte
  );
}

/** Índice da próxima música real na playlist (salta marcadores de tema). -1 se não houver. */
function indiceProximaMusicaNaPlaylist(pl, idxAtual) {
  const lista = Array.isArray(pl) ? pl : [];
  let j = Number(idxAtual) + 1;
  if (!Number.isFinite(j) || j < 1) j = 0;
  while (j < lista.length && ehMarcadorTemaPlaylist(lista[j])) j++;
  return j < lista.length ? j : -1;
}

// (extraído) playlist: transmitidas → painel/playlistTransmitidas.js

function initCultoSelect() {
  const hid = document.getElementById('culto-sel');
  const menu = document.getElementById('culto-dd-menu');
  if (!hid || !menu) return;
  menu.innerHTML = '';
  const lista = listarCultosDisponiveis();
  cultosDoMesCache = [...lista];
  const mkItem = (value, label, ehManual) => {
    const p = parseLabelCulto(label);
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    li.className = 'culto-dd-item-row';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'culto-dd-item';
    b.dataset.value = String(value || '');
    b.setAttribute('aria-selected', 'false');
    b.innerHTML = `<span class="data">${escapeHtml(p.data)}</span><span class="desc">${escapeHtml(p.desc)}</span>`;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setCultoSelecionadoNaUi(value);
      fecharCultoDropdown();
      onCultoChange();
    });
    li.appendChild(b);
    if (ehManual && value) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'culto-dd-item-del btn sm danger';
      del.title = 'Excluir culto manual e playlist';
      del.setAttribute('aria-label', 'Excluir culto manual');
      del.textContent = '✕';
      del.addEventListener('click', (ev) => solicitarExcluirCultoManual(ev, value));
      li.appendChild(del);
    }
    menu.appendChild(li);
  };
  mkItem('', 'Selecione o dia do culto...');
  if (!lista.length) {
    cultoId = '';
    setCultoSelecionadoNaUi('');
    return;
  }
  lista.forEach((c) => {
    mkItem(c.id, c.label, cultoIdEhManual(c.id));
  });
  if (!lista.some((c) => c.id === cultoId)) {
    cultoId = '';
  }
  setCultoSelecionadoNaUi(cultoId);
}

function onCultoChange() {
  cultoId = document.getElementById('culto-sel')?.value || '';
  setCultoSelecionadoNaUi(cultoId);
  if (cultoId) {
    garantirAberturaNoCatalogoCulto(cultoId);
    if (garantirMarcadorAberturaNaPlaylist(cultoId)) savePlaylists();
  }
  renderSeletorTemasPlaylist();
  renderPlaylist();
}

/**
 * Rótulo posto pelo servidor ao bifurcar um original imutável (`ROTULO_COPIA_MODIFICADA`
 * em controller/src/db/musicas.js → «Editada»; bases antigas podem ter «Cópia»).
 * Como quase toda a entrada da playlist acaba por ser uma cópia, repeti-lo em cada
 * linha é ruído — só nomes dados pelo operador dizem algo.
 * Comparação insensível a maiúsculas e normalizada; aceita também o rótulo legado
 * «cópia/modificada» já gravado em bases antigas.
 */
const ROTULOS_VERSAO_AUTOMATICOS = new Set([
  'cópia'.normalize('NFC'),
  'cópia/modificada'.normalize('NFC'),
]);

/**
 * Forma canónica de exibição dos rótulos automáticos. Só nome exibido: o que está
 * gravado (`ROTULO_COPIA_PADRAO` = «Cópia», em controller/src/db/musicas.js) não
 * muda. A Cópia padrão — a que nasce junto com a Original — chama-se
 * «Cópia/Original» na interface, porque é a versão editável que carrega o mesmo
 * conteúdo da Original. Tags personalizadas mantêm exactamente a caixa que o
 * utilizador escreveu.
 */
const ROTULOS_VERSAO_EXIBICAO = new Map([
  ['cópia'.normalize('NFC'), 'Cópia/Original'],
  ['cópia/modificada'.normalize('NFC'), 'Cópia'],
  ['cópia/importada'.normalize('NFC'), 'Cópia/Importada'],
  ['cópia/manual'.normalize('NFC'), 'Cópia/Manual'],
]);

/** Rótulo gravado na cópia criada por importação (`ROTULO_COPIA_IMPORTADA`). */
const ROTULO_VERSAO_IMPORTADA_BRUTO = 'cópia/importada'.normalize('NFC');

/**
 * Nome exibido da versão criada por uma importação: «Versão <BANCO DE ORIGEM>»
 * — «Versão HLYRCS», «Versão LYRA», «Versão CIFRA CLUB», … O banco sai de
 * `origem_importacao` (a origem real gravada na linha) e o nome curto é o
 * mesmo da legenda de origem da Biblioteca (`BIB_ORIGEM_META`).
 *
 * Só exibição: o rótulo gravado continua a ser «Cópia/Importada». Sem origem
 * conhecida devolve '' e quem chama mantém o nome de sempre.
 */
function nomeVersaoImportadaPorOrigem(rotulo, origem) {
  const bruto = String(rotulo || '').trim().normalize('NFC').toLocaleLowerCase('pt-BR');
  if (bruto !== ROTULO_VERSAO_IMPORTADA_BRUTO) return '';
  const meta = BIB_ORIGEM_META[String(origem || '').trim()];
  return meta && meta.legenda ? `Versão ${meta.legenda}` : '';
}

function formatarRotuloVersaoExibicao(rotulo, origem) {
  const importada = nomeVersaoImportadaPorOrigem(rotulo, origem);
  if (importada) return importada;
  const bruto = String(rotulo || '').trim();
  if (!bruto) return 'Cópia';
  const chave = bruto.normalize('NFC').toLocaleLowerCase('pt-BR');
  const automatico = ROTULOS_VERSAO_EXIBICAO.get(chave);
  if (automatico) return automatico;
  return bruto;
}

/** Só exibição: o nome da versão aparece sempre em maiúsculas. O dado gravado não muda. */
function rotuloVersaoMaiusculo(rotulo) {
  return String(rotulo || '').toLocaleUpperCase('pt-BR');
}

/** '' quando o rótulo é o automático; caso contrário o nome escolhido pelo utilizador. */
function rotuloVersaoParaExibicaoNaPlaylist(rotulo) {
  const r = String(rotulo || '').trim();
  if (!r) return '';
  return ROTULOS_VERSAO_AUTOMATICOS.has(r.normalize('NFC').toLowerCase()) ? '' : r;
}

/** Sufixo de versão na linha da playlist — sempre vazio.
 * O vínculo interno (`versaoLocalId` / `versaoRotulo`) continua a existir;
 * a playlist não mostra tag visual de versão. */
function sufixoRotuloVersaoPlaylist(_item) {
  return '';
}

/* Última linha ativa já rolada para a vista — evita brigar com o scroll manual do operador. */
let ultimaLinhaAtivaRoladaNaPlaylist = null;

/**
 * Garante que a música ativa não fique cortada nas bordas da lista.
 * Só rola quando a linha ativa muda (troca de música), nunca a cada render.
 */
function garantirMusicaAtivaVisivelNaPlaylist() {
  const el = document.getElementById('playlist-list');
  const row = el ? el.querySelector('.playlist-row.ativo') : null;
  if (!row) {
    ultimaLinhaAtivaRoladaNaPlaylist = null;
    return;
  }
  const chave = row.dataset.plIdx || '';
  if (chave === ultimaLinhaAtivaRoladaNaPlaylist) return;
  ultimaLinhaAtivaRoladaNaPlaylist = chave;
  requestAnimationFrame(() => {
    if (!row.isConnected) return;
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

/**
 * Alça de arrasto, kebab de ações e o select de Tom da linha.
 * O select não dispara seleção/projeção da música (stopPropagation).
 */
function ligarBotoesESeletoresLinhaPlaylist(row, item, idxPl) {
  const btnKebab = row.querySelector('.pl-btn-kebab');
  if (btnKebab) {
    btnKebab.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      abrirMenuAcoesLinhaPlaylist(btnKebab, row, idxPl);
    };
    /* Sem isto o `mousedown` chegava à linha e a música era seleccionada por baixo do
       menu que se estava a abrir. */
    btnKebab.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  configurarDragReordenarLinhaPlaylist(row, idxPl);

  const selTom = row.querySelector('.pl-sel-tom');
  if (selTom) {
    selTom.addEventListener('click', (e) => e.stopPropagation());
    selTom.addEventListener('mousedown', (e) => e.stopPropagation());
    selTom.addEventListener('change', (e) => {
      e.stopPropagation();
      onPlaylistTomChange(idxPl, selTom.value);
    });
  }

  row.addEventListener('click', (ev) => {
    if (
      ev.target.closest('.playlist-btns') ||
      ev.target.closest('.pl-sel') ||
      ev.target.closest('.pl-grip')
    ) {
      return;
    }
    clearTimeout(playlistRowClickTimer);
    const idNum = Number(item.id);
    playlistRowClickTimer = setTimeout(() => {
      playlistRowClickTimer = null;
      if (playlistItemSelecionadoNaUi(item)) {
        deselecionarMusicaAtivaAPartirDaPlaylist();
        return;
      }
      selecionarMusicaDoBanco(idNum, {
        habilitarFaixaModoSlides: true,
        versaoLocalId: item.versaoLocalId || undefined,
        fonte: fonteBancoItemPlaylist(item),
        origemUi: 'playlist',
        abrirEmLetraCompleta: true,
      });
    }, 300);
  });
  row.addEventListener('dblclick', (ev) => {
    if (
      ev.target.closest('.pl-sel') ||
      ev.target.closest('.playlist-btns') ||
      ev.target.closest('.pl-grip')
    ) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    clearTimeout(playlistRowClickTimer);
    playlistRowClickTimer = null;
    playlistDuploCliqueIniciarProjecao(item);
  });
}

// (extraído) ministrantes e tons → painel/ministrantesTons.js

// (extraído) playlist: lista e arrastar/soltar → painel/playlistLista.js


// (extraído) playlist: adicionar → painel/playlistAdicionar.js

// (extraído) playlist: menus → painel/playlistMenus.js

// (extraído) título de abertura → painel/tituloAberturaPreview.js

/**
 * Cor efectiva dos comentários na prévia do painel — fonte única para o `style` inline do
 * render E para a var CSS de reforço. Nunca é rebaixada para o padrão: uma config parcial
 * (sem `commentColor`) mantém a cor já aplicada em vez de piscar para o azul de fábrica.
 *
 * Declarada aqui, e não junto de `aplicarCorComentarioMinistranteNoPainel`, porque
 * `carregarSlideCfgInicialDoStorage()` corre no topo do módulo e já aplica a cor.
 */
let corComentarioMinistrantePainel = COR_COMENTARIO_MINISTRANTE_PADRAO;

// (extraído) helpers da prévia do ministrante → painel/previewProjecao.js

/**
 * Divide em slides onde há linha 100 % vazia (`\n\n` — sem espaço nem tab na linha).
 * Linha com pelo menos um carácter (ex.: um espaço) não separa: fica no mesmo slide (respiro visual).
 */
function splitTextoEmEstrofesPorLinhaVaziaStrict(texto) {
  const t = String(texto ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (t === '') return [''];
  const lines = t.split('\n');
  const estrofes = [];
  let cur = [];
  for (const line of lines) {
    if (line === '') {
      if (cur.length) {
        estrofes.push(cur.join('\n'));
        cur = [];
      }
    } else {
      cur.push(line);
    }
  }
  if (cur.length) estrofes.push(cur.join('\n'));
  return estrofes.length ? estrofes : [''];
}

/**
 * Aplica a regra de linhas vazias num índice (edição rápida ao guardar ou estrofe ao sair do campo).
 */
function aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idx, texto, opts = {}) {
  if (!musicaAtiva || idx < 0 || idx >= musicaAtiva.estrofes.length) return;
  const emitSocket = opts.emitSocket !== false;
  const posCaretAposSplit = opts.posCaretAposSplit;
  const parts = splitTextoEmEstrofesPorLinhaVaziaStrict(texto);
  const eraProjecaoNesteIndice = estrofeAtiva === idx;
  const delta = parts.length - 1;

  if (parts.length === 1) {
    musicaAtiva.estrofes[idx] = parts[0];
  } else {
    musicaAtiva.estrofes.splice(idx, 1, ...parts);
    if (estrofeAtiva > idx) estrofeAtiva += delta;
    else if (estrofeAtiva === idx) estrofeAtiva = idx;
  }

  renderSlidesStrip();
  atualizarPreviewOperador();
  renderEstrofesEditor();
  marcacaoEstrofeEditor();

  if (emitSocket && projecao.pronta() && eraProjecaoNesteIndice && projecaoMusicaEmitidaNoServidor) {
    projecao.enviar('exibir_musica', montarPayloadExibirMusica(estrofeAtiva));
  }

  if (posCaretAposSplit != null && parts.length > 1) {
    const di = posCaretAposSplit;
    requestAnimationFrame(() => {
      const ta = document.querySelector(
        `#estrofes-slide-editor textarea.estrofe-slide-ta[data-i="${di}"]`
      );
      if (ta) {
        ta.focus();
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
      }
    });
  }
}

/** Antes de gravar no servidor: aplica linhas vazias em cada caixa (sem depender só do blur). */
function aplicarSplitsEstrofesDosTextareasAntesDePersistir() {
  if (!musicaAtiva || !modoEdicaoEstrofes) return;
  const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
  if (!tas.length) return;
  const novas = [];
  for (const ta of tas) {
    novas.push(...splitTextoEmEstrofesPorLinhaVaziaStrict(ta.value));
  }
  musicaAtiva.estrofes = novas.length ? novas : [''];
  if (estrofeAtiva >= musicaAtiva.estrofes.length) {
    estrofeAtiva = Math.max(0, musicaAtiva.estrofes.length - 1);
  }
  renderSlidesStrip();
  atualizarPreviewOperador();
  renderEstrofesEditor();
  marcacaoEstrofeEditor();
}

// --- SECÇÃO E — Pré-visualização «ao vivo» (telão / ministrante) e regras de espelho do estado remoto ---
// (extraído) pré-visualização ao vivo → painel/previewProjecao.js

// (extraído) faixa de slides → painel/slidesStrip.js

// (extraído) barra de edição da Home → painel/toolbarEdicaoHome.js

// (extraído) editor de estrofes → painel/editorEstrofes.js
iniciarEditorEstrofes();

/**
 * Estado de «há projeção alcançável», na barra do topo.
 *
 * O texto distingue os dois modos porque a mesma bandeira verde significa coisas
 * diferentes: no remoto há um Servidor do outro lado da rede, no local as telas são deste
 * PC. Enquanto a dica falava só de ligação, o modo local — que passou a ser o padrão —
 * herdava uma frase sobre uma ligação que não existe.
 */
function atualizarUiConexao(conectado) {
  document.body.classList.toggle('socket-conectado', !!conectado);
  const bar = document.getElementById('conn-bar');
  if (!bar) return;
  if (!conectado) {
    bar.title = '';
    return;
  }
  bar.title = emModoProjecaoLocal()
    ? 'PROJETANDO NESTA MÁQUINA — as telas são servidas por este PC'
    : 'CONECTADO — feche a janela para desligar';
}

// --- SECÇÃO F — Ligação ao servidor (IP), pedidos HTTP ao controlador :3001, filas e debounces ---
async function conectar() {
  return socketPainel.conectar();
}

// (extraído) projeção local e OBS → painel/projecaoLocalObs.js

// (extraído) roteamento de telas no servidor → painel/roteamentoTelas.js

// (extraído) prévia oculta → painel/previewOculto.js

// (extraído) estado da pré-visualização de letras → painel/previewLetras.js

function getLetrasSiteFonteAtual() {
  const sel = document.getElementById('banco-fonte-select');
  if (sel?.value) return normalizarFonteLetrasSite(sel.value);
  return normalizarFonteLetrasSite(letrasSiteFonte);
}

function aplicarPlaceholderBuscaLetras() {
  const inp = document.getElementById('busca-letras-q');
  if (!inp) return;
  inp.placeholder = placeholderBuscaLetrasPorFonte(getLetrasSiteFonteAtual());
}

function atualizarUiToggleListaBancoSqlite() {
  const btn = document.getElementById('btn-banco-sqlite-toggle-lista');
  const lista = document.getElementById('lista');
  const aviso = document.getElementById('banco-sqlite-lista-recolhida-aviso');
  const legenda = document.getElementById('bib-origem-legenda');
  if (btn) {
    btn.setAttribute('aria-expanded', bancoSqliteListaExpandida ? 'true' : 'false');
    btn.title = bancoSqliteListaExpandida ? 'Recolher lista de músicas' : 'Expandir lista de músicas';
  }
  if (lista) {
    lista.classList.toggle('lista-sqlite--recolhida', !bancoSqliteListaExpandida);
    lista.setAttribute('aria-hidden', bancoSqliteListaExpandida ? 'false' : 'true');
  }
  if (legenda) {
    // A legenda agora pertence ao rodapé fixo, não ao conteúdo recolhível da lista.
    legenda.hidden = false;
  }
  if (aviso) {
    aviso.hidden = bancoSqliteListaExpandida;
  }
  /* Lista recolhida: nada para navegar, e a régua ficaria flutuando sobre o aviso. */
  const navAlfabeto = document.getElementById('bib-nav-alfabeto');
  if (navAlfabeto) navAlfabeto.hidden = !bancoSqliteListaExpandida;
}

function alternarListaBancoSqlite() {
  bancoSqliteListaExpandida = !bancoSqliteListaExpandida;
  try {
    localStorage.setItem(LS_BANCO_SQLITE_LISTA_ABERTA, bancoSqliteListaExpandida ? '1' : '0');
  } catch (_) {
  // intencional — erro ignorado
}
  atualizarUiToggleListaBancoSqlite();
}

// (extraído) pré-visualização de letras → painel/previewLetras.js

// (extraído) eventos da projeção → painel/eventosProjecao.js
iniciarEventosProjecao();

// --- SECÇÃO G — Socket.IO (eventos tempo real: estado, playlists, músicas, apresentação) ---
function iniciarSocket(ip) { socketPainel.iniciarSocket(ip); }
function tentarAutoConectarSeDesconectado() { socketPainel.tentarAutoConectarSeDesconectado(); }
function configurarAutoConectarAoAlternarJanelas() { socketPainel.configurarAutoConectarAoAlternarJanelas(); }
function setStatusServidorRemoto(estado) { socketPainel.setStatusServidorRemoto(estado); }
function recordarIpsDestaMaquina(lista, preferido) { socketPainel.recordarIpsDestaMaquina(lista, preferido); }
async function refrescarIpsDestaMaquina() { return socketPainel.refrescarIpsDestaMaquina(); }
function ipRemotoAlvo() { return socketPainel.ipRemotoAlvo(); }
function persistirIpServidor(ip) { socketPainel.persistirIpServidor(ip); }
function sincronizarUiLembrarIp() { socketPainel.sincronizarUiLembrarIp(); }
function onCfgLembrarIpChange(ligado) { socketPainel.onCfgLembrarIpChange(ligado); }
function sincronizarUiAutoConectar() { socketPainel.sincronizarUiAutoConectar(); }
function onCfgAutoConectarChange(ligado) { socketPainel.onCfgAutoConectarChange(ligado); }
async function tentarConectarAutomaticoAoIniciar() { return socketPainel.tentarConectarAutomaticoAoIniciar(); }
function ehEnderecoDestaMaquina(ip) { return socketPainel.ehEnderecoDestaMaquina(ip); }
async function consultarPapelHost5510(ip) { return socketPainel.consultarPapelHost5510(ip); }
function tratarFalhaLigacaoServidor(mensagem) { socketPainel.tratarFalhaLigacaoServidor(mensagem); }
function interromperReconexaoSocket() { socketPainel.interromperReconexaoSocket(); }
async function reassumirProjecaoLocalAposQuedaRemota() { return socketPainel.reassumirProjecaoLocalAposQuedaRemota(); }
function preferenciaLembrarIp() { return socketPainel.preferenciaLembrarIp(); }
function preferenciaAutoConectar() { return socketPainel.preferenciaAutoConectar(); }
function limparIpGuardado() { socketPainel.limparIpGuardado(); }

// (extraído) biblioteca de músicas → painel/bibliotecaMusicas.js

// (extraído) versões da música → painel/versoesMusica.js

// (extraído) projeção da música → painel/projecaoMusica.js
iniciarProjecaoMusica();

// (extraído) Modo Bíblia (dados, estado e aparência) → painel/biblia.js

// (extraído) Exibição (Ajustes: avisos, abas, busca) → painel/configExibicao.js

// (extraído) Modo Bíblia (runtime) → painel/biblia.js

/**
 * A Home só assume o ESC quando não há nada por cima dela.
 *
 * Antes desta tecla, o ESC na Home não fazia nada, e por isso pertencia sempre a quem
 * estivesse aberto — um modal, um menu de contexto, um dropdown. Continua a pertencer:
 * largar a música por baixo enquanto se fecha outra coisa seria um segundo efeito que
 * ninguém pediu, e no meio de um culto é o pior tipo de surpresa.
 *
 * Os modais resolvem-se sem lista de ids para manter: qualquer backdrop cobre a barra
 * central, portanto basta perguntar ao documento quem está no ponto do botão — se a
 * resposta não for o próprio botão, há camada por cima. Já os menus pequenos não o
 * cobrem, e esses são verificados pelo estado de abertura que cada um usa.
 */
function escDaHomePertenceAoSair(btn) {
  if (escDaHomeTemCamadaPorCima()) return false;
  const r = btn.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!topo && btn.contains(topo);
}

/** Menu, diálogo ou painel por cima: o ESC é deles, não da seleção da Home. */
function escDaHomeTemCamadaPorCima() {
  if (
    document.querySelector(
      '.menu-flutuante:not([hidden]), .culto-dd-menu:not([hidden]), .playlist-tema-dd-menu:not([hidden]), .route-dd.route-dd-open'
    )
  ) {
    return true;
  }
  if (document.getElementById('app-dialog-overlay')?.classList.contains('aberto')) return true;
  if (document.getElementById('lyra-menu-modal-overlay')?.classList.contains('aberto')) return true;
  if (document.getElementById('contagem-backdrop')?.classList.contains('aberto')) return true;
  if (document.getElementById('cfg-modal-overlay-ctrl')?.classList.contains('aberto')) return true;
  return false;
}

/**
 * ESC na Home = Sair (limpa a música). No modo letra completa o botão some da
 * barra, mas a tecla continua a fazer o mesmo — seleccionar uma música abre
 * nesse modo, e sem isto o ESC ficava mudo.
 * @returns {boolean} true se a selecção foi limpa.
 */
function acionarEscSairDaHome() {
  if (ehModoApresentacaoOperador() || ehModoBibliaOperador() || ehModoSlidesOperador()) {
    return false;
  }
  const btnSairCentral = document.getElementById('btn-sair-projecao');
  if (
    btnSairCentral &&
    !btnSairCentral.disabled &&
    btnSairCentral.offsetParent !== null &&
    escDaHomePertenceAoSair(btnSairCentral)
  ) {
    btnSairCentral.click();
    return true;
  }
  if (!modoLetraCompletaCentral || !musicaAtiva || escDaHomeTemCamadaPorCima()) return false;
  encerrarProjecaoDoControlador({ limparMusica: true });
  return true;
}

document.addEventListener('keydown', (e) => {
  const musicaExcBd = document.getElementById('musica-excluir-backdrop');
  if (musicaExcBd && !musicaExcBd.hidden && e.key === 'Escape') {
    e.preventDefault();
    fecharModalExcluirMusica();
    return;
  }
  const novaMusicaBd = document.getElementById('nova-musica-manual-backdrop');
  if (novaMusicaBd && !novaMusicaBd.hidden && e.key === 'Escape') {
    e.preventDefault();
    fecharModalNovaMusicaManual();
    return;
  }
  const letrasBd = document.getElementById('letras-preview-backdrop');
  if (letrasBd && !letrasBd.hidden && e.key === 'Escape') {
    e.preventDefault();
    fecharModalPreviewLetras();
    return;
  }
  const delBackdrop = document.getElementById('slide-delete-confirm-backdrop');
  if (delBackdrop && !delBackdrop.hidden && e.key === 'Escape') {
    e.preventDefault();
    fecharSlideDeleteConfirmModal();
    return;
  }
  const qeBackdrop = document.getElementById('slide-quick-edit-backdrop');
  if (qeBackdrop && !qeBackdrop.hidden && e.key === 'Escape') {
    e.preventDefault();
    fecharSlideQuickEditModal();
    return;
  }
  /*
   * Escape com o foco num campo — tratado **antes** do bloqueio abaixo.
   *
   * O bloco seguinte devolve o controlo ao campo sempre que o foco está num
   * `INPUT`/`TEXTAREA`/`SELECT`, e isso engolia o Escape. No modo Bíblia o foco está quase
   * sempre num campo — a busca rápida, os selectores de tradução/livro/capítulo — e o
   * resultado era o Escape não encerrar a projeção. Só voltava a funcionar depois de um
   * clique num versículo, que tira o foco do campo. `bibliaTratarKeydownModo` também não
   * salvava: para Escape ele só fecha o popup e, fora disso, devolve `false`.
   *
   * Precedência: popup aberto → painel Contagem / Ajustes abertos → encerrar a projeção
   * activa → deixar o campo tratar. Encerrar ganha ao campo de propósito: é a tecla de
   * pânico durante o culto, e o campo tem outras saídas. Sem projeção activa não há nada
   * a encerrar, e o Escape volta a ser do campo (limpar, desfocar).
   */
  if (
    e.key === 'Escape' &&
    (e.target.tagName === 'INPUT' ||
      e.target.tagName === 'TEXTAREA' ||
      e.target.tagName === 'SELECT') &&
    !ehModoApresentacaoOperador()
  ) {
    /* Painel Contagem / Ajustes por cima: não encerrar a Bíblia por baixo. */
    if (document.getElementById('contagem-backdrop')?.classList.contains('aberto')) return;
    if (document.getElementById('cfg-modal-overlay-ctrl')?.classList.contains('aberto')) return;
    if (ehModoBibliaOperador()) {
      if (bibliaNavPopupAberto()) {
        e.preventDefault();
        bibliaNavPopupFechar();
        return;
      }
      if (bibliaHaParteProjetada()) {
        e.preventDefault();
        encerrarProjecaoModoBiblia();
        return;
      }
    } else if (ehModoSlidesOperador() && projecao.pronta() && projecaoMusicaEmitidaNoServidor) {
      /* O modo slide já encerrava com o foco fora de campo; isto cobre o caso simétrico,
         que falhava pela mesma razão e que ninguém notava por ali se digitar menos. */
      e.preventDefault();
      slidesRailUserRecolhido = true;
      encerrarProjecaoDoControlador({ limparMusica: true });
      return;
    } else if (
      modoLetraCompletaCentral &&
      (e.target.id === 'centro-letra-completa-ta' ||
        e.target.id === 'edit-titulo' ||
        e.target.id === 'edit-artista')
    ) {
      /* O textarea da letra completa engolia o ESC; na Home ele limpa a selecção. */
      if (acionarEscSairDaHome()) {
        e.preventDefault();
        return;
      }
    }
    /* Sem nada projetado: cai no bloco abaixo e o campo trata o Escape. */
  }
  if (
    e.target.tagName === 'INPUT' ||
    e.target.tagName === 'TEXTAREA' ||
    e.target.tagName === 'SELECT'
  ) {
    if (e.target.id === 'biblia-busca-rapida') return;
    if (ehModoBibliaOperador() && bibliaTratarKeydownModo(e)) return;
    return;
  }
  /*
   * DOCS: setas e passador sem fio andam nas páginas do documento aberto.
   *
   * Só as quatro teclas pedidas — as restantes do passador (Enter, Espaço, Backspace)
   * ficam de fora de propósito: no DOCS elas pertencem aos botões e à lista. Campos de
   * texto já saíram no bloco acima; `isContentEditable` cobre o que venha a ser editável
   * aqui mais tarde. Os limites e o auto scroll são os de `navegarPaginaDocs`.
   */
  if (ehModoDocsOperador() && !e.target?.isContentEditable) {
    const passoDocs =
      e.key === 'ArrowRight' || e.key === 'PageDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'PageUp'
          ? -1
          : 0;
    if (passoDocs !== 0) {
      e.preventDefault();
      navegarPaginaDocs(passoDocs, { projetarSeNoAr: true, repetir: !!e.repeat });
      return;
    }
  }

  if (bibliaTratarKeydownModo(e)) return;

  const dirPassador = direcaoTeclaPassadorSlides(e.key, e.code);
  if (dirPassador !== 0) {
    e.preventDefault();
    if (ehModoSlidesOperador()) {
      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowUp'
      ) {
        navegarEstrofePorSeta(e.key, { repetir: !!e.repeat });
      } else {
        navegarEstrofePassadorSlides(dirPassador, { repetir: !!e.repeat });
      }
    } else if (
      e.key === 'ArrowRight' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowUp'
    ) {
      navegarEstrofePorSeta(e.key, { repetir: !!e.repeat });
    } else {
      navegarEstrofe(dirPassador);
    }
    return;
  }

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (ehModoBibliaOperador()) {
      bibliaNavegarVersiculosComSeta(e.key);
    } else {
      navegarEstrofePorSeta(e.key, { repetir: !!e.repeat });
    }
  } else if (e.key === 'Escape') {
    if (ehModoApresentacaoOperador()) return;
    /* Contagem / Ajustes abertos: o ESC fecha só essa UI — não a Bíblia por baixo. */
    if (document.getElementById('contagem-backdrop')?.classList.contains('aberto')) return;
    if (document.getElementById('cfg-modal-overlay-ctrl')?.classList.contains('aberto')) return;
    if (ehModoBibliaOperador()) {
      const popup = document.getElementById('biblia-nav-popup');
      if (popup && !popup.classList.contains('oculto')) {
        e.preventDefault();
        bibliaNavPopupFechar();
      } else if (
        bibliaHaParteProjetada() ||
        (estadoServidor && estadoServidor.projecaoBibliaMinistrante) ||
        (estadoServidor &&
          estadoServidor.tipo === 'biblia' &&
          !estadoServidor.telaLimpa &&
          Array.isArray(estadoServidor.linhas) &&
          estadoServidor.linhas.length)
      ) {
        e.preventDefault();
        encerrarProjecaoModoBiblia();
      }
      return;
    }
    if (ehModoSlidesOperador()) {
      e.preventDefault();
      slidesRailUserRecolhido = true;
      encerrarProjecaoDoControlador({ limparMusica: true });
      return;
    }
    /*
     * DOCS: o ESC faz o mesmo que o «Encerrar» do cabeçalho, como na Bíblia e no Slides —
     * é a tecla de pânico durante o culto. Sem nada no ar não faz nada: largar o monitor
     * escolhido por um ESC distraído seria pior do que não responder.
     */
    if (ehModoDocsOperador()) {
      if (docsHaPaginaProjetada()) {
        e.preventDefault();
        encerrarRotaModoDocs();
      }
      return;
    }
    /*
     * Home: o ESC é o botão «Sair» da barra central. No modo letra completa esse
     * botão está escondido (a barra troca para Salvar/Cancelar), mas seleccionar
     * uma música na Home abre nesse modo — o ESC tem de limpar a selecção na
     * mesma. `acionarEscSairDaHome` cobre os dois casos.
     */
    if (acionarEscSairDaHome()) e.preventDefault();
  } else if (e.key === 'F10') {
    e.preventDefault();
    toggleBlackoutTelas();
  }
});

try {
  initBancoPainelFromStorage();
  garantirBuscaLocalEditavel();
  garantirBuscaLetrasEditavel();
  carregarRotasPorModoDoStorage();
  playlists = loadPlaylists();
  cultosManuaisCache = loadCultosManuais();
  temaSelecionadoPorCulto = loadTemaSelecionadoPorCulto();
  temasPorCulto = loadTemasPorCulto();
  setAberturaRemovidaPorCulto(loadAberturaRemovidaPorCulto());
  setMinistrantePadraoPorCulto(loadMinistrantePadraoPorCulto());
  podarMinistrantePadraoSemMusicasNaPlaylist();
  migrarPlaylistsCultosAntigos();
  carregarEstadoModoApresentacaoDoStorage();
  const avisoCard6CfgSalva = carregarAvisoCard6CfgDoStorage();
  if (avisoCard6CfgSalva) apresentacaoCard6AvisoCfg = avisoCard6CfgSalva;
  carregarBibliaCfgDoStorage();
  setupCultoDropdown();
  setupLyraSelectDropdownWrap(document.getElementById('traducao-sel-dd'));
  setupAdicionarCultoManual();
  configurarNotasSlideControlador({
    obterMusicaId: () => (musicaAtiva && musicaAtiva.id != null ? Number(musicaAtiva.id) : null),
    obterVersaoLocalId: () => musicaVersaoLocalId,
    obterEstrofeAtiva: () => estrofeAtiva,
    obterNumSlides: () =>
      musicaAtiva && Array.isArray(musicaAtiva.estrofes) ? musicaAtiva.estrofes.length : 0,
    ehModoSlides: ehModoSlidesOperador,
  });
  configurarBibliotecaMidiasApresentacao();
  carregarDocsBibliotecaDoStorage();
  configurarBuscaDocsImportados();
  renderListaDocsImportados();
  cultoId = resolverCultoInicialPorAgenda();
  initCultoSelect();
  if (cultoId) onCultoChange();
  document.body.classList.remove('app-mod-slides');
  document.body.classList.remove('app-mod-apresentacao');
  document.body.classList.remove('app-mod-biblia');
  document.body.classList.remove('slides-rail-aberto');
  document.title = 'Lyra — Controlador';
  localStorage.setItem(LS_UI_MODO_SLIDES, '0');
  slidesDockVisivel = false;
  faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
  const lm = document.getElementById('layout-musicas');
  if (lm) lm.removeAttribute('style');

  aplicarRotulosEPlaylistModoSlides();
  atualizarBtnToggleModoSlides();
  atualizarBtnModoApresentacao();
  atualizarBtnModoBiblia();
  configurarObserverPreviewMinistrante();
  garantirMinistrantesCarregados().catch(() => {});
  iniciarSyncPeriodicoTonsInvb();
  iniciarDicasDeTextoTruncado();

  if (typeof window !== 'undefined' && window.lyraElectron?.onMusicasSincronizadas) {
    window.lyraElectron.onMusicasSincronizadas((payload) => {
      processarMusicasSincronizadasPayload(payload).catch(() => {});
    });
  }
  if (typeof window !== 'undefined' && window.lyraElectron?.onBancoCompartilhadoAlterado) {
    window.lyraElectron.onBancoCompartilhadoAlterado((payload) => {
      if (payload?.updatedAt) setSharedBancoLocalUpdatedAt(String(payload.updatedAt));
    });
  }
  if (typeof window !== 'undefined' && window.lyraElectron?.onBancoCompartilhadoAplicado) {
    window.lyraElectron.onBancoCompartilhadoAplicado((payload) => {
      aplicarSnapshotCompartilhadoNoRenderer(payload?.snapshot || null).catch(() => {});
    });
  }
  if (typeof window !== 'undefined' && window.lyraElectron?.onPedidoSyncBanco) {
    window.lyraElectron.onPedidoSyncBanco((payload) => {
      tratarPedidoSyncBancoDirecto(payload).catch(() => {});
    });
    /* E o que chegou antes de o painel existir: ver `recuperarPedidoSyncBancoPendente`. */
    recuperarPedidoSyncBancoPendente().catch(() => {});
  }
} catch (err) {
  console.error('[Lyra] falha no bootstrap do painel', err);
}

window.addEventListener('beforeunload', () => {
  /* A gravação do modo Mídias é adiada; sair da janela é o momento de a cumprir. */
  try {
    gravarEstadoModoApresentacaoNoStorageAgora();
  } catch (_) {
    // intencional — sair da janela nunca pode falhar por causa disto
  }
  rotasPorModo.apresentacao = rotaDesativada();
  rotasPorModo.biblia = rotaDesativada();
  const ip = hostProjecao();
  if (!ip) return;
  try {
    const payload = JSON.stringify({
      version: 2,
      slides: normalizarRota(rotasPorModo.slides),
      apresentacao: rotaDesativada(),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `http://${ip}:5510/api/display-routing`,
        new Blob([payload], { type: 'application/json' })
      );
    }
  } catch (_) {
  // intencional — erro ignorado
}
});

// A Home compõe os controles existentes; callbacks continuam usando o estado do núcleo.
homeLayout = montarHomeLayout({
  filtrar,
  atualizar: atualizarToolbarModoEdicao,
  renderPreview: atualizarPreviewPlaylistCentral,
  cartoes: async () => {
    if (!(await sairModoComparativoParaTrocarModo())) return;
    if (modoLetraCompletaCentral) await irParaGradeSlidesDesdeLetraCompleta();
  },
  letraCompleta: async () => {
    if (!musicaAtiva || modoLetraCompletaCentral) return;
    if (!(await sairModoComparativoParaTrocarModo())) return;
    entrarModoLetraCompletaCentral();
  },
  renomearVersao: (nome) => renomearVersaoSelecionadaComNome(nome),
  novoSlide: async () => {
    if (!musicaAtiva) return;
    if (!modoEdicaoEstrofes) {
      if (!(await confirmarProsseguirDescartandoEdicaoPendente())) return;
      entrarModoEdicao();
    }
    novaEstrofe();
  },
});
renderPlaylist();
renderEstrofesEditor();
renderSlidesStrip();
renderGridApresentacao();
renderMenuApresentacao();
renderListaAudiosApresentacao();
renderListaPlaylistApresentacao();
atualizarUiPlayerAudioRemoto();
atualizarPreviewOperador();
carregarPreviewPainelOcultoDoArmazenamento();
aplicarPreviewPainelOcultoNoDom();

sincronizarUiLembrarIp();
sincronizarUiAutoConectar();
if (preferenciaLembrarIp()) {
  const ipSalvo = readLsMigrate(LS_IP_KEY, LS_IP_LEGACY);
  if (ipSalvo) document.getElementById('ip-input').value = ipSalvo;
} else {
  limparIpGuardado();
}
carregarMusicas();
setTimeout(() => carregarRoteamentoTelasDoServidor(), 120);

configurarAutoConectarAoAlternarJanelas();

initSlidesRailHeightFromStorage();
initAlturaPreviewModFromStorage();
setupMenusRoteamentoTelas();
impedirSelecaoDeTextoNoDuploClique();
setupSlidesRailResize();
initSlidesChipZoomFromStorage();
setupSlidesChipZoomButtons();
initSlidesPorLinhaFromStorage();
setupSlidesPorLinhaButtons();
setupSlidesGridViewportFitObserver();
setupSlidesStripContextMenuEEdicaoRapida();
configurarCamposMetadadosMusicaHome();
configurarModalPreviewLetras();
configurarModalExcluirMusica();
configurarBarraSelecaoBiblioteca();
configurarNavegadorAlfabeticoBiblioteca();
configurarModalSyncPlaylist();
configurarModalNovaMusicaManual();
configurarSeletorTemaPlaylist();
configurarAcoesPlaylist();
configurarMenuMomentoPlaylist();
document.getElementById('banco-busca-local-wrap')?.addEventListener('click', () => {
  garantirBuscaLocalEditavel();
  document.getElementById('busca')?.focus();
});
document.getElementById('busca-letras-panel')?.addEventListener('click', () => {
  garantirBuscaLetrasEditavel();
  document.getElementById('busca-letras-q')?.focus();
});
document.getElementById('apresentacao-add-menu-input')?.addEventListener('change', (e) => {
  const files = e?.target?.files;
  if (files?.length) importarArquivosBibliotecaMidias(files);
  if (e.target) e.target.value = '';
});
document.getElementById('apresentacao-add-card-input')?.addEventListener('change', (e) => {
  const f = e?.target?.files?.[0];
  if (!f) return;
  /* O mesmo seletor serve os cards e as quatro áreas do card 4; quem o abriu deixou dito
     para onde vai o ficheiro. */
  if (apresentacaoCard4InputTarget !== null) {
    const sub = apresentacaoCard4InputTarget;
    apresentacaoCard4InputTarget = null;
    adicionarImagemNaAreaCard4(f, sub);
  } else {
    adicionarArquivoDiretoNoCard(f, apresentacaoCardInputTarget ?? 0);
  }
  if (e.target) e.target.value = '';
});
document.getElementById('docs-menu-add')?.addEventListener('click', () => escolherArquivoModoDocs());
/* Mesma regra do clique na miniatura e do teclado: com projeção no ar, a página nova vai
   ao telão; parado, os botões só escolhem. */
document
  .getElementById('docs-nav-anterior')
  ?.addEventListener('click', () => navegarPaginaDocs(-1, { projetarSeNoAr: true }));
document
  .getElementById('docs-nav-proxima')
  ?.addEventListener('click', () => navegarPaginaDocs(1, { projetarSeNoAr: true }));
/* Dois cliques na prévia central projetam a página escolhida — os mesmos gestos das
   miniaturas, para o operador não ter de pensar em que metade do ecrã está. */
document.getElementById('docs-preview')?.addEventListener('dblclick', () => {
  if (docsPaginaSelecionadaAtual() >= 0) void projetarPaginaDocs(docsPaginaSelecionadaAtual());
});
document.getElementById('docs-add-input')?.addEventListener('change', (e) => {
  const files = e?.target?.files;
  if (files?.length) adicionarArquivosAosDocs(files);
  if (e.target) e.target.value = '';
});
document.getElementById('apresentacao-add-video-input')?.addEventListener('change', (e) => {
  const files = e?.target?.files;
  if (files?.length) playlistAdicionarVideos(files);
  if (e.target) e.target.value = '';
});
document.getElementById('ap-playlist-add')?.addEventListener('click', () => {
  const input = document.getElementById('apresentacao-add-video-input');
  if (!input) return;
  input.value = '';
  input.click();
});
/* Menu overflow (⋯) do cabeçalho da playlist. */
function fecharMenuOverflowPlaylist() {
  const menu = document.getElementById('ap-playlist-overflow-menu');
  const btn = document.getElementById('ap-playlist-overflow-btn');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
document.getElementById('ap-playlist-overflow-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = document.getElementById('ap-playlist-overflow-menu');
  const btn = document.getElementById('ap-playlist-overflow-btn');
  if (!menu || !btn) return;
  const abrir = menu.hidden;
  fecharOutrosSeletoresDropdown(document.querySelector('.ap-playlist-overflow'));
  menu.hidden = !abrir;
  btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
});
document.addEventListener('click', (e) => {
  const wrap = e.target?.closest?.('.ap-playlist-overflow');
  if (!wrap) fecharMenuOverflowPlaylist();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharMenuOverflowPlaylist();
});
document.getElementById('ap-playlist-clear')?.addEventListener('click', () => {
  fecharMenuOverflowPlaylist();
  void playlistLimpar();
});
document.getElementById('ap-playlist-modo')?.addEventListener('click', () => playlistAlternarModo());
document.getElementById('ap-playlist-atraso')?.addEventListener('change', (e) => playlistDefinirAtraso(e?.target?.value));
/* Mantém o overlay de preview alinhado ao slot ao rolar/redimensionar. */
window.addEventListener('scroll', () => { if (get_previewAlvoAtual()) posicionarOverlayPreview(); }, true);
window.addEventListener('resize', () => { if (get_previewAlvoAtual()) posicionarOverlayPreview(); });
(function ligarBotaoPlayPauseApresentacao() {
  const btn = document.getElementById('ap-audio-play-pause');
  if (!btn) return;
  btn.onclick = () => {
    void tocarAudioAtualSelecionado();
  };
})();
document.getElementById('ap-audio-loop')?.addEventListener('click', () => {
  alternarLoopPlayerApresentacao();
});
document.getElementById('ap-audio-stop')?.addEventListener('click', () => pararAudioServidor());
document.getElementById('ap-audio-mute')?.addEventListener('click', () => alternarMudoAudioApresentacao());
document.getElementById('ap-audio-vol-up')?.addEventListener('click', () => {
  const nextVol = Math.min(1, Math.round((Number(audioStateRemoto.volume) + 0.1) * 10) / 10);
  definirVolumeAudioServidor(nextVol);
});
document.getElementById('ap-audio-vol-down')?.addEventListener('click', () => {
  const nextVol = Math.max(0, Math.round((Number(audioStateRemoto.volume) - 0.1) * 10) / 10);
  definirVolumeAudioServidor(nextVol);
});
document.getElementById('ap-audio-seek')?.addEventListener('mousedown', () => { audioSeekDragging = true; });
document.getElementById('ap-audio-seek')?.addEventListener('mouseup', (e) => {
  audioSeekDragging = false;
  const val = Math.max(0, Math.min(1000, Number(e?.target?.value || 0)));
  const dur = Math.max(0, Number(audioStateRemoto.duration) || 0);
  const t = dur > 0 ? (val / 1000) * dur : 0;
  seekAudioServidor(t);
});
document.getElementById('apresentacao-selecionar-arquivo')?.addEventListener('click', () => escolherArquivoModoApresentacao());
document.getElementById('apresentacao-fechar')?.addEventListener('click', () => fecharMenuModoApresentacao());
document.getElementById('apresentacao-encerrar')?.addEventListener('click', () => {
  void encerrarModoApresentacaoNoTelao();
});
document.getElementById('hdr-lembrar-monitor-chk')?.addEventListener('change', (ev) => {
  const modo = modoComMemoriaMonitorAtual();
  if (!modo) return;
  /* Ligar captura o que está no seletor naquele instante — é o que o operador tem à frente
     quando clica. Desligar não apaga o que estava guardado; só deixa de o aplicar. */
  definirLembrarMonitor(
    hostChaveMonitores(),
    modo,
    !!ev.target.checked,
    rotaSelecionadaNaUi(),
    monitoresServidorCache
  );
  sincronizarCheckboxLembrarMonitor();
});

document.getElementById('hdr-encerrar-projecao')?.addEventListener('click', () => {
  if (ehModoApresentacaoOperador()) {
    void encerrarProjecaoMidiaCabecalhoModoApresentacao();
  } else if (ehModoBibliaOperador()) {
    encerrarProjecaoModoBiblia();
  } else if (ehModoSlidesOperador()) {
    slidesRailUserRecolhido = true;
    encerrarProjecaoDoControlador({ limparMusica: true });
  } else if (ehModoDocsOperador()) {
    encerrarRotaModoDocs();
  }
});

document.getElementById('ip-input').addEventListener('change', (e) => {
  persistirIpServidor(e.target.value);
  setTimeout(() => carregarRoteamentoTelasDoServidor(), 120);
});

/**
 * Após handoff do companion: Server já deve estar na 5510. Não disputa o modo local —
 * espera identity real e reconecta ao IP guardado (one-shot).
 */
async function tentarReconnectAposCompanionRelaunch() {
  if (typeof window.lyraElectron?.consumirRelaunchCompanion !== 'function') return false;
  let info = null;
  try {
    info = await window.lyraElectron.consumirRelaunchCompanion();
  } catch (_) {
    return false;
  }
  if (!info?.ip) return false;

  const ip = String(info.ip).trim();
  companionHandoffEmCurso = false;
  autoConectarAoIniciarEmCurso = true;
  try {
    persistirIpServidor(ip);
    const ipInput = document.getElementById('ip-input');
    if (ipInput) ipInput.value = ip;

    const deadline = Date.now() + 90000;
    let disponivel = false;
    while (Date.now() < deadline) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2500);
        try {
          const r = await fetch(`http://${ip}:5510/api/identity`, {
            cache: 'no-store',
            signal: ctrl.signal,
          });
          if (r.ok && (await r.json())?.role === 'server') {
            disponivel = true;
            break;
          }
        } finally {
          clearTimeout(t);
        }
      } catch (_) {
        // intencional — retenta
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!disponivel) return true;
    await conectar();
    return true;
  } finally {
    autoConectarAoIniciarEmCurso = false;
  }
}

setTimeout(() => {
  /*
   * Projetar nesta máquina é SEMPRE o arranque, sem excepção e sem consultar nada: não há
   * preferência de modo gravada para consultar. Há projeção desde o início, e o painel
   * nunca fica preso num «conectando» sem nada projetável.
   *
   * A sessão anterior não influencia esta. Ter ligado ao Servidor ontem — ou há cinco
   * minutos, antes de fechar — não muda este caminho.
   *
   * Sem ponte não há modo local (o painel está num browser, fora do aplicativo), e aí só
   * resta o caminho remoto.
   *
   * Excepção: relaunch pós-companion — o Server já foi iniciado pelo handoff na 5510;
   * aí reconectamos sem tentar assaltar a porta com o motor local.
   */
  void (async () => {
    if (await tentarReconnectAposCompanionRelaunch()) return;

    const ponte = ponteProjecaoLocal();
    const querAuto = preferenciaAutoConectar();
    /*
     * Com a opção ligada, bloquear JÁ o auto-reconectar de foco/visibilidade — ele dispara
     * quando o arranque do local falha (porta ocupada) e cria um socket «fantasma»
     * (`connected` mas badge ainda em Este PC). O caminho novo via a seguir e abortava.
     */
    if (querAuto) autoConectarAoIniciarEmCurso = true;
    if (!ponte) {
      if (!querAuto) {
        tentarAutoConectarSeDesconectado();
      }
      void tentarConectarAutomaticoAoIniciar();
      return;
    }
    void ligarProjecaoNestaMaquina().then((r) => {
      if (!r?.ok && !querAuto) {
        tentarAutoConectarSeDesconectado();
      }
      void tentarConectarAutomaticoAoIniciar();
    });
  })();
}, 200);

// ════════════════════════════════════════════════════════════
//  Dark Mode + Configurações de Exibição (Controlador remoto)
// ════════════════════════════════════════════════════════════

// (extraído) Diálogo padrão do app → painel/appDialog.js

// (extraído) Conteúdo e janela do menu Lyra → painel/lyraMenuConteudo.js e painel/menuLyra.js

// (extraído) Banner de atualização → painel/bannerAtualizacao.js

window.alert = (msg) => { appAlert(msg); };
// (extraído) Exibição (Ajustes) → painel/configExibicao.js
iniciarConfigExibicao();

function bootOverlaysEAppDialogCtrl() {
  try {
    liberarBloqueioUiModos();
  } catch (_) {
  // intencional — erro ignorado
}
  document.getElementById('lyra-menu-modal-close')?.addEventListener('click', () => fecharLyraMenuModal());
  document.getElementById('lyra-menu-modal-close-x')?.addEventListener('click', () => fecharLyraMenuModal());
  document.getElementById('lyra-menu-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'lyra-menu-modal-overlay') fecharLyraMenuModal();
  });
  document.getElementById('app-dialog-overlay')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'app-dialog-overlay') {
      /* Aviso do sistema: clique fora é ignorado. Fecha só por botão do diálogo. */
      e.preventDefault();
    }
  });
  aprimorarControlesVisuaisCfg();
}

// (extraído) aprimorarControlesVisuaisCfg → painel/configExibicao.js

function sincronizarTicksSliderVh(input) {
  const wrap = input.closest('.cfg-size-wrap');
  if (!wrap) return;
  const maxVh = Math.max(0, Math.round(Number(input.max) || 9));
  const v = Math.max(0, Math.min(maxVh, Math.round(Number(input.value) || 0)));
  if (String(input.value) !== String(v)) input.value = String(v);
  wrap.querySelectorAll('.cfg-size-tick').forEach((t) => {
    const n = Number(t.dataset.n);
    t.classList.toggle('ativo', n === v);
    if (n === v || n === 0 || n === maxVh) t.setAttribute('data-label', String(n));
    else t.removeAttribute('data-label');
  });
}
function bootVozSlidesModo() {
  reconhecimentoVozSlides.initDom();
  reconhecimentoVozBiblia.initDom();
  if (ehModoSlidesOperador()) reconhecimentoVozSlides.aoEntrarModoSlides();
  else if (ehModoApresentacaoOperador()) reconhecimentoVozSlides.aoEntrarModoApresentacao();
  else if (ehModoBibliaOperador()) reconhecimentoVozBiblia.aoEntrarModoBiblia();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bootOverlaysEAppDialogCtrl();
    bootVozSlidesModo();
  });
} else {
  bootOverlaysEAppDialogCtrl();
  bootVozSlidesModo();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const lyraMenuModal = document.getElementById('lyra-menu-modal-overlay');
    if (lyraMenuModal && lyraMenuModal.classList.contains('aberto')) {
      e.preventDefault();
      fecharLyraMenuModal();
      return;
    }
    const appDialog = document.getElementById('app-dialog-overlay');
    if (appDialog && appDialog.classList.contains('aberto')) {
      e.preventDefault();
      /* Importação em andamento: Escape não dispensa o spinner. */
      if (getAppImportarBloqueadoFechar()) return;
      if (!appDialogEstado.fecharNoBackdrop) return;
      fecharAppDialog(false);
      return;
    }
    const overlay = document.getElementById('cfg-modal-overlay-ctrl');
    if (overlay && overlay.classList.contains('aberto')) {
      const ativo = document.activeElement;
      if (ativo && /^(INPUT|TEXTAREA|SELECT)$/i.test(ativo.tagName)) {
        return;
      }
      fecharCfgModal();
    }
  }
});



/* (extraído) Contagem regressiva → painel/contagemRegressiva.js */
iniciarContagemRegressivaPainel();

exporCallbacksParaAtributosHtml({
  abrirPainelContagem,
  alternarPainelContagem,
  onContagemCfgChange,
  onContagemBgImagemChange,
  limparImagemFundoContagem,
  setPosContagemCtrl,
  restaurarPadraoContagem,
});

/* ─────────────────────────────────────────────────────────────────────────
   Equilíbrio das laterais do cabeçalho.

   O dock de navegação está na coluna central de um grid
   `minmax(0,1fr) auto minmax(0,1fr)`, ou seja, no centro real da barra.
   Mas o vazio à esquerda e à direita do dock só é simétrico se os dois
   blocos laterais tiverem a mesma largura — e o bloco de status muda de
   largura conforme o texto («CONECTADO» vs «SERVIDOR NÃO ENCONTRADO»).

   Em vez de fixar um número no CSS, espelhamos a largura medida do bloco
   de status na `min-width` do bloco do logo, via `--hdr-side-w`.
   ───────────────────────────────────────────────────────────────────────── */
function sincronizarLarguraLateraisCabecalho() {
  const header = document.querySelector('.app-header');
  const status = document.querySelector('.app-header-right .status-conn-wrap');
  if (!header || !status) return;
  const larguraStatus = Math.ceil(status.getBoundingClientRect().width);
  if (!Number.isFinite(larguraStatus) || larguraStatus <= 0) return;
  header.style.setProperty('--hdr-side-w', `${larguraStatus}px`);
}

(function observarLarguraLateraisCabecalho() {
  const aplicar = () => sincronizarLarguraLateraisCabecalho();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicar, { once: true });
  } else {
    aplicar();
  }
  /* O texto do status muda com a ligação; o ResizeObserver reage a isso e a
     mudanças de zoom/janela sem precisar de hooks espalhados pelo código. */
  if (typeof ResizeObserver === 'function') {
    const alvo = document.querySelector('.app-header-right .status-conn-wrap');
    if (alvo) new ResizeObserver(aplicar).observe(alvo);
  }
  window.addEventListener('resize', aplicar);
})();

// ─── Pré-voo do culto ─────────────────────────────────────────────────────────────────

/*
 * Verificar antes de começar, em vez de descobrir no primeiro slide.
 *
 * As regras vivem em `modules/preVooPlaylist.js`, testadas à parte. O que está aqui é só a
 * recolha: juntar o que o painel já sabe (rota, monitores, playlist), ir buscar o que
 * falta (as letras) e mostrar o resultado.
 */

// (extraído) pré-voo do culto → painel/preVoo.js
iniciarPreVoo();
