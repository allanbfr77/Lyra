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
 *   conteudoUnificadoAviso.js — conteúdo dos modos de seletor unificado: emitir/encerrar apresentação, alvos, aviso do card 6 e extras
 *   rotasMonitores.js — rotas por modo e monitores: persistência, identidade, «lembrar monitor», sanitização e indicador ao vivo
 *   canaisProjecao.js — canais de projeção: ocupação por Mídias/Bíblia, classificação da saída por monitor e prévias dos monitores virtuais (Slides)
 *   menuApresentacaoModo.js — menu do modo Mídias e encerramento da projeção de mídia/aviso
 *   modoSlidesOperador.js — alternância do modo Slides do operador (limpeza de espelho/UI) e callbacks expostos ao HTML
 * =============================================================================
 */

import { montarHomeLayout } from './painel/homeLayout.js';

import {
  LS_UI_MODO_SLIDES,
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
  clonarCfgAvisoCard6Padrao,
} from './modules/midiaApresentacao.js';
import {
  registrarEscolhaSeletorUnificado,
} from './modules/ordemNaoExibirUnificado.js';
import {
  definirLembrarMonitor,
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
  reaplicarFontesPreviewPainel,
} from './painel/tipografiaPainelPreview.js';
import {
  criarPortaProjecao,
} from './modules/projecaoPorta.js';
import {
  resumirComparacao,
} from './modules/diffLetrasComparativo.js';
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
  atualizarBtnModoBiblia,
  bibliaHaParteProjetada,
  bibliaNavPopupAberto,
  bibliaNavPopupFechar,
  bibliaNavegarVersiculosComSeta,
  bibliaPayloadCfgExibicao,
  bibliaPopularFormularioCfg,
  bibliaTratarKeydownModo,
  carregarBibliaCfgDoStorage,
  encerrarProjecaoModoBiblia,
  getBibliaCfgExibicao,
  getBibliaCfgMinistrante,
  lerBibliaCfgDoFormularioMinistrante,
  lerBibliaCfgDoFormularioPublico,
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
  urlMidiaApresentacaoHttpPorId,
} from './painel/videoApresentacao.js';
import {
  alternarLoopPlayerApresentacao,
  alternarMudoAudioApresentacao,
  atualizarUiPlayerAudioRemoto,
  definirVolumeAudioServidor,
  get_previewAlvoAtual,
  obterElementoVideoLocal,
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
  registrarDependenciasGridApresentacao,
  renderGridApresentacao,
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
  registrarDependenciasTituloAberturaPreview,
} from './painel/tituloAberturaPreview.js';
import {
  atualizarPreviewOperador,
  atualizarPreviewPlaylistCentral,
  atualizarSlidesInstrucoes,
  configurarObserverPreviewMinistrante,
  definirControlosZoomFaixaSlidesInertes,
  definirNomeMusicaBarraSlides,
  definirVazioDaFaixaSlidesVisivel,
  emitirEstadoMinistranteAoServidor,
  registrarDependenciasPreviewProjecao,
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
import {
  agendarAtualizacaoAvisoCard6AoVivo,
  algumCampoAvisoCard6EmEdicao,
  aplicarEstiloTextareaAvisoCard6,
  aplicarExtrasModoApresentacao,
  atualizarFeedbackProjecaoApresentacaoUi,
  atualizarRodapeAudioApresentacao,
  canaisParaEncerrarConteudoApresentacao,
  carregarAvisoCard6CfgDoStorage,
  criarSeletorMonitorAvisoCard6,
  emitirApresentacao,
  emitirEncerrarApresentacaoPublicoAoServidor,
  encerrarCanaisApresentacaoNoServidor,
  getApresentacaoAvisoCard6Ativo,
  getUltimoConteudoProjetadoModoUnificado,
  getUltimoPayloadAvisoCard6,
  indicesPadraoPublicoMinistranteApresentacao,
  mensagemAlvoInvalidoApresentacao,
  mensagemAlvoInvalidoBiblia,
  monitoresApresentacaoCobremAlvo,
  obterAlvoProjecaoDeRota,
  obterAlvoProjecaoModoApresentacao,
  obterRotaApresentacaoParaServidor,
  opcoesRoteamentoUnificadoModoApresentacao,
  opcoesSeletorCabecalhoDoModoAtual,
  projetarAvisoCard6,
  reemitirConteudoAposMudancaDeRotaUnificada,
  registrarDependenciasConteudoUnificadoAviso,
  rotaSlidesAoEntrarNoModo,
  salvarAvisoCard6CfgNoStorage,
  setApresentacaoAvisoCard6Ativo,
  setUltimoConteudoProjetadoModoUnificado,
  setUltimoPayloadAvisoCard6,
  sincronizarPillProjecaoNav,
} from './painel/conteudoUnificadoAviso.js';
import {
  aplicarMonitorLembradoAoEntrarNoModo,
  atualizarIndicadorProjecaoLiveUi,
  carregarRotasPorModoDoStorage,
  desativarRotasModosTransitorios,
  hayProjecaoApresentacaoModoAtiva,
  hayProjecaoAtivaModoBibliaOuApresentacao,
  hayProjecaoMidiaApresentacaoAtiva,
  hostChaveMonitores,
  indicesEfetivosRoteamentoDualCliente,
  listaMonitoresParaProjecao,
  marcarRotaLiveNoDom,
  modoComMemoriaMonitorAtual,
  modoRoteamentoAtual,
  modoUsaSeletorMonitorUnificado,
  normalizarRota,
  persistirIdentidadesDosModos,
  registrarDependenciasRotasMonitores,
  registrarEscolhaMonitorDoOperador,
  rotaDesativada,
  rotaLiveSelecionadaNaUi,
  rotaRestauradaPorIdentidade,
  rotaSemMonitorRepetido,
  salvarRotasPorModoNoStorage,
  sanitizarIndiceMonitorProjecao,
  sanitizarRotaProjecao,
  sincronizarCheckboxLembrarMonitor,
} from './painel/rotasMonitores.js';
import {
  apresentacaoOcupandoCanalMinistrante,
  apresentacaoProjecaoAtivaNoCanalPublico,
  atualizarPreviewMonitorMinistranteSlides,
  atualizarPreviewMonitorPublicoSlides,
  atualizarPreviewsMonitoresVirtuaisModoSlides,
  bibliaProjecaoAtivaNoCanalMinistrante,
  bibliaProjecaoAtivaNoCanalPublico,
  canalMinistranteOcupadoPorOutroModoNoSlides,
  canalPublicoOcupadoPorOutroModoNoSlides,
  classificarSaidaMonitorMinistranteSlides,
  classificarSaidaMonitorPublicoSlides,
  estadoServidorEhProjecaoApresentacaoAtivaNoTelao,
  obterRotaSlidesParaUi,
  registrarDependenciasCanaisProjecao,
  restaurarRotaSlidesAposLibertarMonitores,
  syncRoteamentoTelasModoSlidesNaUi,
} from './painel/canaisProjecao.js';
import {
  abrirMenuModoApresentacao,
  atualizarBtnTelaInicial,
  carregarTraducoes,
  encerrarAvisoCard6NoControlador,
  encerrarProjecaoMidiaCabecalhoModoApresentacao,
  encerrarProjecaoModoApresentacao,
  escolherArquivoModoApresentacao,
  fecharMenuModoApresentacao,
  registrarDependenciasMenuApresentacaoModo,
  reidratarRotaApresentacaoDoSeletor,
} from './painel/menuApresentacaoModo.js';
import {
  alternarModoSlidesOperador,
  iniciarModoSlidesOperador,
  limparEspelhoLocalSoCamadaSlides,
  limparUiAoSairDoModoSlides,
  registrarDependenciasModoSlidesOperador,
} from './painel/modoSlidesOperador.js';

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
  getUltimoConteudoProjetadoModoUnificado: () => getUltimoConteudoProjetadoModoUnificado(),
  setEstadoServidor: (valor) => {
    estadoServidor = valor;
  },
  setUltimoConteudoProjetadoModoUnificado: (valor) => {
    setUltimoConteudoProjetadoModoUnificado(valor);
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
  getApresentacaoAvisoCard6Ativo: () => getApresentacaoAvisoCard6Ativo(),
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
  getApresentacaoAvisoCard6Ativo: () => getApresentacaoAvisoCard6Ativo(),
  setApresentacaoAvisoCard6Ativo: (valor) => {
    setApresentacaoAvisoCard6Ativo(valor);
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
  getUltimoPayloadAvisoCard6: () => getUltimoPayloadAvisoCard6(),
  setUltimoPayloadAvisoCard6: (valor) => {
    setUltimoPayloadAvisoCard6(valor);
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
  getUltimoConteudoProjetadoModoUnificado: () => getUltimoConteudoProjetadoModoUnificado(),
  setUltimoConteudoProjetadoModoUnificado: (valor) => {
    setUltimoConteudoProjetadoModoUnificado(valor);
  },
  getVersoesMusicaServidorCache: () => versoesMusicaServidorCache,
  setVersoesMusicaServidorCache: (valor) => {
    versoesMusicaServidorCache = valor;
  },
});
registrarDependenciasConteudoUnificadoAviso({
  fecharOutrosSeletoresDropdown,
  getServidorProjeccaoIp,
  hostProjecao,
  indiceRoteamentoMonitorNaUi,
  rotuloRotaApresentacaoForaDoPreset,
  encerrarAvisoCard6NoControlador,
  listaMonitoresParaProjecao,
  modoRoteamentoAtual,
  normalizarRota,
  sanitizarIndiceMonitorProjecao,
  getApresentacaoAudioAtualId: () => apresentacaoAudioAtualId,
  getApresentacaoAudios: () => apresentacaoAudios,
  getApresentacaoBiblioteca: () => apresentacaoBiblioteca,
  getApresentacaoCard4Imagens: () => apresentacaoCard4Imagens,
  setApresentacaoCard4Imagens: (valor) => {
    apresentacaoCard4Imagens = valor;
  },
  getApresentacaoCard6AvisoCfg: () => apresentacaoCard6AvisoCfg,
  setApresentacaoCard6AvisoCfg: (valor) => {
    apresentacaoCard6AvisoCfg = valor;
  },
  getApresentacaoCard6Texto: () => apresentacaoCard6Texto,
  setApresentacaoCard6Texto: (valor) => {
    apresentacaoCard6Texto = valor;
  },
  getApresentacaoCards: () => apresentacaoCards,
  getApresentacaoMidiaProjetadaId: () => apresentacaoMidiaProjetadaId,
  getAudioLoopAtivo: () => audioLoopAtivo,
  setAudioLoopAtivo: (valor) => {
    audioLoopAtivo = valor;
  },
  getAudioStateRemoto: () => audioStateRemoto,
  getMonitoresServidorCache: () => monitoresServidorCache,
  getProjecao: () => projecao,
  getRotasPorModo: () => rotasPorModo,
});
registrarDependenciasRotasMonitores({
  avisarMonitoresConfiguradosEmFalta,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  ehModoDocsOperador,
  ehModoSlidesOperador,
  getServidorIp,
  renderRoteamentoTelas,
  rotaSelecionadaNaUi,
  estadoServidorEhProjecaoApresentacaoAtivaNoTelao,
  restaurarRotaSlidesAposLibertarMonitores,
  getApresentacaoMidiaProjetadaId: () => apresentacaoMidiaProjetadaId,
  getEstadoServidor: () => estadoServidor,
  getMonitoresServidorCache: () => monitoresServidorCache,
  getProjecao: () => projecao,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  getRotasPorModo: () => rotasPorModo,
});
registrarDependenciasCanaisProjecao({
  atualizarEstiloRotasDesativadas,
  ehModoSlidesOperador,
  renderRoteamentoTelas,
  getEstadoServidor: () => estadoServidor,
  getEstrofeAtiva: () => estrofeAtiva,
  getMonitoresServidorCache: () => monitoresServidorCache,
  getMusicaAtiva: () => musicaAtiva,
  getProjecao: () => projecao,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  getRotasPorModo: () => rotasPorModo,
});
registrarDependenciasMenuApresentacaoModo({
  aplicarRotaDoModoAtualNaUiEServidor,
  aplicarRotulosEPlaylistModoSlides,
  atualizarBtnModoApresentacao,
  atualizarBtnToggleModoSlides,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  ehModoDocsOperador,
  ehModoSlidesOperador,
  executarComTransicaoUi,
  renderItensLyraSelectDropdown,
  renderRoteamentoTelas,
  rotaSelecionadaNaUi,
  getApresentacaoAudioAtualId: () => apresentacaoAudioAtualId,
  setApresentacaoAudioAtualId: (valor) => {
    apresentacaoAudioAtualId = valor;
  },
  getApresentacaoMidiaProjetadaId: () => apresentacaoMidiaProjetadaId,
  setApresentacaoMidiaProjetadaId: (valor) => {
    apresentacaoMidiaProjetadaId = valor;
  },
  getAudioStateRemoto: () => audioStateRemoto,
  setAudioStateRemoto: (valor) => {
    audioStateRemoto = valor;
  },
  getEstadoServidor: () => estadoServidor,
  setEstadoServidor: (valor) => {
    estadoServidor = valor;
  },
  getMonitoresServidorCache: () => monitoresServidorCache,
  getRotasPorModo: () => rotasPorModo,
});
registrarDependenciasModoSlidesOperador({
  aplicarRotaDoModoAtualNaUiEServidor,
  aplicarRotulosEPlaylistModoSlides,
  atualizarBtnModoApresentacao,
  atualizarBtnToggleModoSlides,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  ehModoSlidesOperador,
  executarComTransicaoUi,
  irParaTelaInicial,
  getBloqueioSincronizarEstrofeDoServidor: () => bloqueioSincronizarEstrofeDoServidor,
  setBloqueioSincronizarEstrofeDoServidor: (valor) => {
    bloqueioSincronizarEstrofeDoServidor = valor;
  },
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
  getModoLetraCompletaCentral: () => modoLetraCompletaCentral,
  setModoLetraCompletaCentral: (valor) => {
    modoLetraCompletaCentral = valor;
  },
  getMusicaAtiva: () => musicaAtiva,
  getProjecaoMusicaEmitidaNoServidor: () => projecaoMusicaEmitidaNoServidor,
  setProjecaoMusicaEmitidaNoServidor: (valor) => {
    projecaoMusicaEmitidaNoServidor = valor;
  },
  getRotasPorModo: () => rotasPorModo,
  getSlidesDockVisivel: () => slidesDockVisivel,
  setSlidesDockVisivel: (valor) => {
    slidesDockVisivel = valor;
  },
  getSlidesRailUserRecolhido: () => slidesRailUserRecolhido,
  setSlidesRailUserRecolhido: (valor) => {
    slidesRailUserRecolhido = valor;
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
// (extraído) rotas por modo e monitores → painel/rotasMonitores.js

// (extraído) canais de projeção → painel/canaisProjecao.js

// (extraído) conteúdo unificado e aviso do card 6 → painel/conteudoUnificadoAviso.js

// (extraído) vídeo da apresentação → painel/videoApresentacao.js

// (extraído) player local de mídias → painel/playerLocalMidia.js

// (extraído) biblioteca de mídias → painel/bibliotecaMidiasApresentacao.js

// (extraído) playlist de vídeos → painel/playlistVideoApresentacao.js


// (extraído) grelha de cards → painel/gridApresentacao.js

// (extraído) menu do modo Mídias → painel/menuApresentacaoModo.js

// (extraído) modo Slides do operador → painel/modoSlidesOperador.js
iniciarModoSlidesOperador();

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
// (extraído) timer do aviso ao vivo → painel/conteudoUnificadoAviso.js

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
