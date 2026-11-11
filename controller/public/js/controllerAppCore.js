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
 * =============================================================================
 */

import { montarHomeLayout } from './painel/homeLayout.js';

import {
  LS_UI_MODO_SLIDES,
  LS_PREVIEW_PAINEL_OCULTO,
  LS_MODO_APRESENTACAO_ATIVO,
  LS_ROTAS_POR_MODO,
  LS_APRESENTACAO_STATE,
  SVG_OLHO_ABERTO,
  SVG_OLHO_CORTADO,
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
  ehVersaoServidorId,
} from './modules/copiasLocaisLetra.js';
import {
  versaoLocalIdTrimado,
  idMusicaParaPreVoo,
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
  digestEstrofesParaStripFaixa,
  textoSlideMaiusculo,
  textoSlideSnippetHtmlParaChip,
} from './modules/slidesGrelha.js';
import { criarIrParaSlideNumero } from './modules/slidesIrParaNumero.js';
import {
  rotuloTipoMidiaApresentacao,
  svgIconeTipoMidiaApresentacao,
  normalizarItemApresentacao as normalizarItemApresentacaoPuro,
  clonarCfgAvisoCard6Padrao,
  normalizarCfgAvisoCard6,
  cfgAvisoCard6TemPersonalizacao,
} from './modules/midiaApresentacao.js';
import { rotaSemMonitorRepetido as aplicarSaidaExclusiva } from './modules/saidasMonitorExclusivas.js';
import {
  rotaSlidesParaEnvioComBiblia,
  rotaSlidesParaEnvioComApresentacao,
} from './modules/supressaoCanalSlides.js';
import {
  precisaReporRotaSlides,
  rotaSlidesReposta,
  sincronizarNaoExibirManualSlidesDaEscolha,
  limparNaoExibirManualSlides,
  obterNaoExibirManualSlides,
} from './modules/reposicaoRotaSlides.js';
import {
  registrarEscolhaSeletorUnificado,
  ordemNaoExibirDoSeletorUnificado,
  limparOrdemNaoExibirUnificado,
} from './modules/ordemNaoExibirUnificado.js';
import {
  MODOS_COM_MEMORIA,
  definirLembrarMonitor,
  lembrarMonitorLigado,
  registrarEscolhaMonitor,
  rotaLembradaParaEntrada,
} from './modules/monitorLembrado.js';
import { criarMenuFlutuante, fecharMenuFlutuanteAberto } from './modules/menuFlutuante.js';
import {
  estaSelecionada,
  rotuloConfirmacaoExclusaoLote,
} from './modules/selecaoMultiplaBiblioteca.js';
import { exporCallbacksParaAtributosHtml } from './modules/ponteHtmlWindow.js';
import { criarReconhecimentoVozSlides } from './modules/reconhecimentoVozSlides.js';
import {
  configurarNotasSlideControlador,
  atualizarNotaSlideControladorUI,
} from './modules/notasSlideControlador.js';
import {
  filtrarLinhasParaPublico,
  aplicarPreviewMinistranteNoElemento,
  textoMinistranteDeElementoPreview,
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
  aplicarClasseLinhas,
  reaplicarFontesPreviewPainel,
} from './painel/tipografiaPainelPreview.js';
import {
  criarPortaProjecao,
  criarTransporteSocket,
  criarTransporteLocal,
} from './modules/projecaoPorta.js';
import { criarMotorAudioLocal } from './modules/motorAudioLocal.js';
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
import { criarSocketPainel } from './modules/socketPainel.js';
import {
  GRAVIDADE_IMPEDE,
  verificarTelas,
  verificarTonsEMinistrantes,
  verificarLetras,
  verificarMidias,
  verificarPlaylistVazia,
  consolidar,
  resumoPreVoo,
} from './modules/preVooPlaylist.js';
import {
  appDialogEstado,
  fecharAppDialog,
  appAlert,
  appConfirm,
  registrarDependenciasAppDialog,
} from './painel/appDialog.js';
import {
  fecharLyraMenuModal,
  atualizarModalStatusReinicioServidor,
  encerrarServidorRemotoViaMenu,
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
  marcarRotaDocsSincronizada,
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
  rotaContagemParaServidor,
  renderSeletorMonitorContagem,
  alternarPainelContagem,
  abrirPainelContagem,
  iniciarContagemRegressivaPainel,
  registrarDependenciasContagem,
} from './painel/contagemRegressiva.js';
import {
  alternarModoBiblia,
  aplicarTraducaoBibliaNoSelect,
  atualizarBtnModoBiblia,
  bibliaAplicarCfgExibicao,
  bibliaBuscaRapida,
  bibliaBuscaRapidaTecla,
  bibliaEscolherFundo,
  bibliaHaParteProjetada,
  bibliaLimparProjecaoOperador,
  bibliaNavPopupAberto,
  bibliaNavPopupAbrir,
  bibliaNavPopupFechar,
  bibliaNavegarVersiculosComSeta,
  bibliaPayloadCfgExibicao,
  bibliaPopularFormularioCfg,
  bibliaSairModo,
  bibliaTratarKeydownModo,
  bibliaZerarParteProjetada,
  bibliaZerarVersiculoSelecionado,
  bnpConfirmarCap,
  bnpConfirmarVer,
  bnpSelecionarLivro,
  carregarBibliaCfgDoStorage,
  definirFiltroTestamentoBiblia,
  encerrarProjecaoModoBiblia,
  fetchListaTraducoesBiblia,
  getBibliaCfgExibicao,
  getBibliaCfgMinistrante,
  lerBibliaCfgDoFormularioMinistrante,
  lerBibliaCfgDoFormularioPublico,
  marcarRotaBibliaSincronizada,
  obterBibliaTraducaoSessao,
  onBibliaDivisaoCfgChange,
  onBibliaMinistranteBgTypeCtrlChange,
  onBibliaMinistranteCfgChange,
  onBibliaPublicoBgTypeCtrlChange,
  onBibliaPublicoCfgChange,
  onTraducaoBibliaChange,
  popularGradeLivros,
  reconhecimentoVozBiblia,
  registrarDependenciasBiblia,
  salvarBibliaCfgNoStorage,
  setBibliaPosCtrl,
} from './painel/biblia.js';
import {
  abrirCfgModal,
  aplicarCfgRelogio,
  aplicarCorComentarioMinistranteNoPainel,
  aplicarWrapImediato,
  aprimorarControlesVisuaisCfg,
  debounceSalvarCfg,
  fecharCfgModal,
  getChkVal,
  iniciarConfigExibicao,
  lerCurrentCfgCtrl,
  lerNumeroInput,
  limparCfgBusca,
  mesclarSlideCfgNoEstado,
  mudarAbaCfg,
  mudarDestinoCfg,
  onAvisoCard6CfgChange,
  onCfgBuscaInput,
  onCfgGeralTemaChange,
  onCfgGeralVozChange,
  onClockBgImageCtrlChange,
  onClockBgTypeCtrlChange,
  onClockDateFontSizeCtrlInput,
  onClockFontSizeCtrlInput,
  onClockVerseFontSizeCtrlInput,
  onMinistranteBgColorCtrlInput,
  onMinistranteBgGradientCtrlInput,
  onMinistranteBgImageCtrlChange,
  onMinistranteBgTypeCtrlChange,
  onMinistranteSlideCfgChange,
  onPublicoBgColorCtrlInput,
  onPublicoBgGradientCtrlInput,
  onPublicoBgImageCtrlChange,
  onPublicoBgTypeCtrlChange,
  popularFormCfg,
  popularFormCfgAvisoCard6,
  registrarDependenciasConfigExibicao,
  salvarCfgNoServidor,
  setCfgSwitchState,
  setChkVal,
  setInputVal,
  setPosAvisoCard6Ctrl,
  setPosCtrl,
  setSelVal,
  setSpanText,
  sincronizarFormCfgGeral,
  slidesAplicarCfgArmazenada,
  toggleCfgSwitch,
  toggleDarkCtrl,
} from './painel/configExibicao.js';
import {
  BIB_ORIGEM_META,
  abrirModalNovaMusicaManual,
  agendarRenderizacoesOcultasDoModoSlides,
  bibGuardarAncoraScrollParaProximoRender,
  bibSelCancelarModo,
  bibSelChaveDaLinha,
  bibSelLinhas,
  bibSelecao,
  buscarLetrasExterno,
  carregarMusicas,
  configurarBarraSelecaoBiblioteca,
  configurarModalNovaMusicaManual,
  configurarNavegadorAlfabeticoBiblioteca,
  fecharModalNovaMusicaManual,
  filtrar,
  garantirBuscaLetrasEditavel,
  garantirBuscaLocalEditavel,
  importarLetrasDoCatalogoParaBanco,
  importarLetrasParaBanco,
  initBancoPainelFromStorage,
  limparBuscaLetras,
  onBancoFonteChange,
  onBuscaLetrasInput,
  onFiltroBuscaChange,
  refreshListaBanco,
  registrarDependenciasBibliotecaMusicas,
} from './painel/bibliotecaMusicas.js';
import {
  ERRO_ROTULO_DUPLICADO_API,
  apagarCopiaVersaoSelecionada,
  aplicarBaseMusicaSelecionada,
  concluirRenomearVersaoServidor,
  editarNomeVersaoSelecionada,
  nomeVersaoJaUsadoNaMusica,
  registrarDependenciasVersoesMusica,
  renderMusicaVersoesBar,
  versaoCopiaSelecionadaAtual,
} from './painel/versoesMusica.js';
import {
  alternarModoLetraCompletaCentral,
  alternarModoLetraCompletaOuVoltarGrade,
  aplicarLayoutModoLetraCompleta,
  atualizarTextoPainelLetraCompleta,
  atualizarToolbarModoLetraCompleta,
  cancelarModoLetraCompletaCentral,
  confirmarProsseguirDescartandoEdicaoPendente,
  descartarEdicaoLetraCompletaSemSair,
  entrarModoLetraCompletaCentral,
  estrofesArraysIguaisParaEdicao,
  irParaGradeSlidesDesdeLetraCompleta,
  letraCompletaSujaVsSnapshot,
  registrarDependenciasLetraCompleta,
  splitTextoLetraCompletaEmEstrofes,
  temEdicaoMusicaNaoGravada,
} from './painel/letraCompleta.js';
import {
  alternarModoComparativoCentral,
  aplicarLayoutModoComparativo,
  comparativoSujoVsSnapshot,
  fecharModoComparativo,
  registrarDependenciasComparativoVersoes,
  sairModoComparativoParaTrocarModo,
  salvarComparativoNoServidor,
} from './painel/comparativoVersoes.js';
import {
  alternarCaixaLetrasEdicao,
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
  sairModoEdicao,
  salvarMusicaServidor,
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
  migrarTemasParaGlobal,
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
  removerCopiasLocaisDaMusica,
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
  dataRefDoCultoImportado,
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
  tratarPedidoSincronizacaoBanco,
  tratarPedidoSyncBancoDirecto,
} from './painel/sincronizacaoBanco.js';
import {
  atualizarChecksAoProjetar,
  atualizarEstadoBtnProximaMusicaPlaylist,
  deselecionarMusicaAtivaAPartirDaPlaylist,
  marcarUltimaMusicaAoEncerrar,
  playlistItemSelecionadoNaUi,
  registrarDependenciasPlaylistTransmitidas,
} from './painel/playlistTransmitidas.js';
import {
  garantirMinistrantesCarregados,
  iniciarSyncPeriodicoTonsInvb,
  nomeMinistrantePorId,
  onCfgImportTonsArquivoChange,
  onCfgMinistranteAdicionar,
  onCfgSyncTonsInvbClick,
  onPlaylistTomChange,
  onSincronizarPlaylistLyraClick,
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
  adicionarVersaoAtivaNaPlaylistHome,
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
  restaurarItemVideoApresentacao,
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
  PLAYLIST_ATRASOS_PERMITIDOS,
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
let audioResumeVisualGuard = null;
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
/** Quando true, o cartão de pré-visualização fica recolhido só neste painel (não afeta monitores). */
let previewPainelOcultoLocal = [false, false];
/** Composição visual da Home; música, versões e edição continuam neste núcleo. */
let homeLayout = null;
let syncApresentacaoTimer = null;
let syncApresentacaoInFlight = false;
let syncApresentacaoPending = false;
let syncApresentacaoAvisoLiveTimer = null;

function limparGuardaVisualRetomadaAudio() {
  audioResumeVisualGuard = null;
}

function armarGuardaVisualRetomadaAudio(itemId, currentTime) {
  const t = Math.max(0, Number(currentTime) || 0);
  if (!itemId || t <= 0) {
    limparGuardaVisualRetomadaAudio();
    return;
  }
  audioResumeVisualGuard = {
    itemId: String(itemId),
    targetTime: t,
    expiresAt: performance.now() + 1800,
  };
}

function ajustarEstadoVisualRetomadaAudio(st, estadoAnterior) {
  const guard = audioResumeVisualGuard;
  if (!guard) return st;
  if (performance.now() > guard.expiresAt) {
    limparGuardaVisualRetomadaAudio();
    return st;
  }
  if (guard.itemId !== String(apresentacaoAudioAtualId || '')) {
    limparGuardaVisualRetomadaAudio();
    return st;
  }
  const mediaKind = String(st?.mediaKind || estadoAnterior?.mediaKind || '');
  if (mediaKind !== 'audio') {
    limparGuardaVisualRetomadaAudio();
    return st;
  }
  const incomingTime = Number(st?.currentTime);
  if (!Number.isFinite(incomingTime)) return st;
  if (incomingTime >= Math.max(0, guard.targetTime - 0.25)) {
    limparGuardaVisualRetomadaAudio();
    return st;
  }
  return {
    ...st,
    currentTime: Math.max(0, Number(estadoAnterior?.currentTime) || 0),
    duration: Math.max(Number(st?.duration) || 0, Number(estadoAnterior?.duration) || 0),
  };
}

function normalizarItemApresentacao(raw) {
  return normalizarItemApresentacaoPuro(raw, getControllerApiBase());
}

async function encerrarModoApresentacaoNoTelao() {
  await encerrarProjecaoModoApresentacao();
}

function coletarEstadoModoApresentacaoAtual() {
  return {
    biblioteca: (apresentacaoBiblioteca || []).map((it) => normalizarItemApresentacao(it)).filter(Boolean),
    cards: Array.from({ length: 6 }, (_, i) => {
      if (i === 5) return null;
      return normalizarItemApresentacao(apresentacaoCards?.[i] || null);
    }),
    audios: (apresentacaoAudios || []).map((it) => normalizarItemApresentacao(it)).filter((it) => it && it.kind === 'audio'),
    arquivoSelecionadoId: apresentacaoArquivoSelecionadoId || '',
    audioSelecionadoId: apresentacaoAudioAtualId || '',
    videoPlaylist: {
      modo: playlistVideoModo === 'auto' ? 'auto' : 'manual',
      atrasoAuto: PLAYLIST_ATRASOS_PERMITIDOS.includes(Number(playlistVideoAtrasoAuto))
        ? Number(playlistVideoAtrasoAuto)
        : 0,
      itens: (apresentacaoVideoPlaylist || [])
        .map((it) => {
          const base = normalizarItemApresentacao(it);
          if (!base || base.kind !== 'video') return null;
          if (Number(it && it.duracao) > 0) base.duracao = Number(it.duracao);
          return base;
        })
        .filter(Boolean),
    },
    extras: {
      audioLoop: !!audioLoopAtivo,
      /* As quatro áreas do card 4 vão nos extras, e não em `cards`: assim o formato de
         `cards` (seis posições, uma mídia cada) continua o mesmo para quem o lê — o
         storage e o estado partilhado com os outros controladores. */
      card4Imagens: Array.from({ length: 4 }, (_, i) =>
        normalizarItemApresentacao(apresentacaoCard4Imagens?.[i] || null)),
      card6AvisoTexto: apresentacaoCard6Texto,
      card6AvisoConfig: normalizarCfgAvisoCard6(apresentacaoCard6AvisoCfg),
    },
  };
}

function aplicarEstadoModoApresentacao(payload, opts = {}) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const biblioteca = Array.isArray(p.biblioteca) ? p.biblioteca.map(normalizarItemApresentacao).filter(Boolean) : [];
  const cardsRaw = Array.isArray(p.cards) ? p.cards : [];
  const cards = Array.from({ length: 6 }, (_, i) => {
    if (i === 5) return null;
    return normalizarItemApresentacao(cardsRaw[i] || null);
  });
  const audios = Array.isArray(p.audios)
    ? p.audios.map(normalizarItemApresentacao).filter((it) => it && it.kind === 'audio')
    : [];
  apresentacaoBiblioteca = biblioteca;
  apresentacaoCards = cards;
  apresentacaoAudios = audios;
  const vp = p.videoPlaylist && typeof p.videoPlaylist === 'object' ? p.videoPlaylist : {};
  playlistVideoModo = vp.modo === 'auto' ? 'auto' : 'manual';
  playlistVideoAtrasoAuto = PLAYLIST_ATRASOS_PERMITIDOS.includes(Math.round(Number(vp.atrasoAuto)))
    ? Math.round(Number(vp.atrasoAuto))
    : 0;
  apresentacaoVideoPlaylist = Array.isArray(vp.itens)
    ? vp.itens
        .map((raw) => {
          const base = normalizarItemApresentacao(raw);
          if (!base || base.kind !== 'video') return null;
          if (raw && Number(raw.duracao) > 0) base.duracao = Number(raw.duracao);
          return base;
        })
        .filter(Boolean)
    : [];
  cancelarAvancoAutoPlaylist();
  playlistVideoIndice = -1;
  playlistVideoAtiva = false;
  _playlistUiTocandoCache = null;
  const v5 = apresentacaoCards[APRESENTACAO_IDX_CARD5];
  if (v5?.kind === 'video') {
    void restaurarItemVideoApresentacao(v5).then((it) => {
      if (!it) return;
      apresentacaoCards[APRESENTACAO_IDX_CARD5] = it;
      salvarEstadoModoApresentacaoNoStorage();
      if (ehModoApresentacaoOperador()) renderGridApresentacao();
    });
  }
  const arqSel = String(p.arquivoSelecionadoId || '');
  const audSel = String(p.audioSelecionadoId || '');
  apresentacaoArquivoSelecionadoId = arqSel && biblioteca.some((it) => it.id === arqSel) ? arqSel : null;
  apresentacaoAudioAtualId = audSel && audios.some((it) => it.id === audSel) ? audSel : null;
  aplicarExtrasModoApresentacao(p.extras, {
    skipCard6Aviso: !!opts.skipCard6Extras,
    skipCard6AvisoConfig: !!opts.skipCard6Extras,
  });
  /* Estado gravado antes de o card 4 se dividir em quatro: o ficheiro que ocupava o card
     inteiro passa para a primeira das áreas, em vez de desaparecer do painel sem aviso.
     Daí em diante o slot 3 de `apresentacaoCards` fica sempre vazio. */
  const legadoCard4 = apresentacaoCards[APRESENTACAO_IDX_CARD4];
  if (legadoCard4 && !apresentacaoCard4Imagens.some(Boolean)) {
    apresentacaoCard4Imagens[0] = legadoCard4;
  }
  apresentacaoCards[APRESENTACAO_IDX_CARD4] = null;
  if (ehModoApresentacaoOperador()) {
    const modo = modoRoteamentoAtual();
    renderRoteamentoTelas(monitoresServidorCache, normalizarRota(rotasPorModo[modo]));
  }
}

let _salvarEstadoApresentacaoTimer = null;
let _avisouQuotaApresentacao = false;

/**
 * Grava mesmo. Só o agendador abaixo e o `beforeunload` chamam isto directamente.
 */
function gravarEstadoModoApresentacaoNoStorageAgora() {
  clearTimeout(_salvarEstadoApresentacaoTimer);
  _salvarEstadoApresentacaoTimer = null;
  try {
    localStorage.setItem(LS_APRESENTACAO_STATE, JSON.stringify(coletarEstadoModoApresentacaoAtual()));
    _avisouQuotaApresentacao = false;
  } catch (e) {
    /*
     * Isto falhava em silêncio, e o silêncio escondia um problema real: com a mídia
     * embutida em base64, um único áudio já leva o estado para lá dos ~5 MB de quota do
     * localStorage, a gravação nunca acontece — e o custo de a tentar (serializar dezenas
     * de MB) é pago à mesma. Enquanto a mídia não sair do estado, que ao menos deixe rasto.
     */
    if (!_avisouQuotaApresentacao) {
      _avisouQuotaApresentacao = true;
      console.warn(
        '[Lyra] estado do modo Mídias não foi gravado no localStorage:',
        (e && e.name) || '',
        (e && e.message) || ''
      );
    }
  }
  salvarAvisoCard6CfgNoStorage();
  agendarSincronizacaoEstadoModoApresentacaoServidor();
}

/**
 * Agenda a gravação do estado do modo Mídias.
 *
 * Havia 31 pontos a chamar a gravação directa, e cada uma serializa o estado inteiro —
 * biblioteca, cards, áudios e playlist, com a mídia em base64 lá dentro. Adicionar 10
 * áudios chamava-a 10 vezes sobre um objecto que crescia a cada volta: trabalho
 * quadrático sobre dezenas de MB, medido em ~4 s numa máquina rápida.
 *
 * O debounce é de arrasto: chamadas seguidas empurram a gravação para a frente, e um
 * lote inteiro rende uma escrita só. Quem precisa de gravar já — sair da janela —
 * chama `gravarEstadoModoApresentacaoNoStorageAgora`.
 */
function salvarEstadoModoApresentacaoNoStorage() {
  clearTimeout(_salvarEstadoApresentacaoTimer);
  _salvarEstadoApresentacaoTimer = setTimeout(gravarEstadoModoApresentacaoNoStorageAgora, 200);
}

/**
 * Debounce da gravação ao digitar avisos (Card 6). Persistir o estado inteiro do modo
 * Apresentação (biblioteca, cards, áudios, playlist — imagens podem ser base64) a cada tecla
 * trava a digitação. O texto já é atualizado em memória na hora; aqui só adiamos a gravação.
 */
let _salvarEstadoAposDigitarAvisoTimer = null;
function agendarSalvarEstadoAposDigitarAviso() {
  if (_salvarEstadoAposDigitarAvisoTimer) clearTimeout(_salvarEstadoAposDigitarAvisoTimer);
  _salvarEstadoAposDigitarAvisoTimer = setTimeout(() => {
    _salvarEstadoAposDigitarAvisoTimer = null;
    salvarEstadoModoApresentacaoNoStorage();
  }, 350);
}
function flushSalvarEstadoAposDigitarAviso() {
  if (!_salvarEstadoAposDigitarAvisoTimer) return;
  clearTimeout(_salvarEstadoAposDigitarAvisoTimer);
  _salvarEstadoAposDigitarAvisoTimer = null;
  salvarEstadoModoApresentacaoNoStorage();
}

function carregarEstadoModoApresentacaoDoStorage() {
  try {
    const raw = localStorage.getItem(LS_APRESENTACAO_STATE);
    if (!raw) return;
    const p = JSON.parse(raw);
    aplicarEstadoModoApresentacao(p);
  } catch (_) {
  // intencional — erro ignorado
}
}

async function sincronizarEstadoModoApresentacaoServidor() {
  if (syncApresentacaoInFlight) {
    syncApresentacaoPending = true;
    return;
  }
  /* O destino do `fetch` abaixo é o banco desta máquina (:3001), não o Servidor — o nome
     da função é herança de quando o Controlador retransmitia. O guard existe para não
     gravar quando não há projeção alcançável, e no modo local há: é aqui mesmo. */
  const host = hostProjecao();
  if (!host) return;
  syncApresentacaoInFlight = true;
  try {
    await fetch(`${getControllerApiBase()}/api/apresentacao/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coletarEstadoModoApresentacaoAtual()),
    });
  } catch (_) {
    // Sem rede/servidor: mantém só cache local
  } finally {
    syncApresentacaoInFlight = false;
    if (syncApresentacaoPending) {
      syncApresentacaoPending = false;
      sincronizarEstadoModoApresentacaoServidor();
    }
  }
}

function agendarSincronizacaoEstadoModoApresentacaoServidor() {
  if (syncApresentacaoTimer) clearTimeout(syncApresentacaoTimer);
  syncApresentacaoTimer = setTimeout(() => {
    syncApresentacaoTimer = null;
    sincronizarEstadoModoApresentacaoServidor();
  }, 480);
}

async function carregarEstadoModoApresentacaoDoServidor() {
  /* Como em `sincronizarEstadoModoApresentacaoServidor`: lê do banco desta máquina. */
  const host = hostProjecao();
  if (!host) return;
  const localAntes = coletarEstadoModoApresentacaoAtual();
  const localTemConteudo =
    (localAntes.biblioteca && localAntes.biblioteca.length > 0) ||
    (localAntes.cards && localAntes.cards.some((x) => !!x)) ||
    (localAntes.audios && localAntes.audios.length > 0) ||
    String(localAntes.extras?.card6AvisoTexto || '').trim().length > 0 ||
    cfgAvisoCard6TemPersonalizacao(localAntes.extras?.card6AvisoConfig);
  try {
    const res = await fetch(`${getControllerApiBase()}/api/apresentacao/state`);
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return;
    const remotoTemConteudo =
      (Array.isArray(data.biblioteca) && data.biblioteca.length > 0) ||
      (Array.isArray(data.cards) && data.cards.some((x) => !!x)) ||
      (Array.isArray(data.audios) && data.audios.length > 0) ||
      String(data.extras?.card6AvisoTexto || '').trim().length > 0 ||
      cfgAvisoCard6TemPersonalizacao(data.extras?.card6AvisoConfig);
    if (!remotoTemConteudo && localTemConteudo) {
      await sincronizarEstadoModoApresentacaoServidor();
      return;
    }
    const editingCard6 = algumCampoAvisoCard6EmEdicao();
    aplicarEstadoModoApresentacao(data, { skipCard6Extras: editingCard6 });
    try { localStorage.setItem(LS_APRESENTACAO_STATE, JSON.stringify(coletarEstadoModoApresentacaoAtual())); } catch (_) {
  // intencional — erro ignorado
}
    if (!editingCard6) {
      popularFormCfgAvisoCard6();
      renderGridApresentacao();
      renderMenuApresentacao();
      renderListaAudiosApresentacao();
      renderListaPlaylistApresentacao();
    }
  } catch (_) {
  // intencional — erro ignorado
}
}
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

let musicaExcluirPendente = null;
/** Lote pendente de exclusão, vindo do modo de seleção múltipla da Biblioteca. */
let musicasExcluirLotePendente = null;

/** Texto de repouso do aviso do modal, para o repor depois de uma exclusão em lote. */
function avisoModalExcluirMusicaPadrao(el) {
  if (el && !el.dataset.textoPadrao) el.dataset.textoPadrao = el.textContent || '';
  return el?.dataset?.textoPadrao || '';
}

function fecharModalExcluirMusica() {
  musicaExcluirPendente = null;
  musicasExcluirLotePendente = null;
  const aviso = document.querySelector('#musica-excluir-backdrop .musica-excluir-aviso');
  if (aviso && aviso.dataset.textoPadrao) aviso.textContent = aviso.dataset.textoPadrao;
  document
    .querySelectorAll('.item.confirmando-exclusao')
    .forEach((el) => el.classList.remove('confirmando-exclusao'));
  const bd = document.getElementById('musica-excluir-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
}

function solicitarRemoverMusicaDoBancoServidor(idMusica, tituloDisplay) {
  const idNum = Number(idMusica);
  if (!Number.isFinite(idNum)) return alert('ID da música inválido.');
  musicaExcluirPendente = { id: idNum, titulo: tituloDisplay || '' };
  const bd = document.getElementById('musica-excluir-backdrop');
  const nomeEl = document.getElementById('musica-excluir-nome');
  if (nomeEl) nomeEl.textContent = musicaExcluirPendente.titulo || `ID ${idNum}`;
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
}

/**
 * Mesma confirmação de sempre, com o nome da música trocado pela contagem: com doze
 * títulos não há espaço para os listar, e o que o operador precisa de saber antes de
 * uma ação sem volta é quantas músicas vão embora.
 *
 * @param {{ id: number, titulo: string }[]} lote
 */
function solicitarRemoverMusicasDoBancoServidorEmLote(lote) {
  const itens = (Array.isArray(lote) ? lote : []).filter((m) => Number.isFinite(Number(m?.id)));
  if (!itens.length) return;
  musicaExcluirPendente = null;
  musicasExcluirLotePendente = itens.map((m) => ({ id: Number(m.id), titulo: String(m.titulo || '') }));
  const bd = document.getElementById('musica-excluir-backdrop');
  const nomeEl = document.getElementById('musica-excluir-nome');
  if (nomeEl) nomeEl.textContent = rotuloConfirmacaoExclusaoLote(musicasExcluirLotePendente.length);
  const aviso = document.querySelector('#musica-excluir-backdrop .musica-excluir-aviso');
  if (aviso) {
    avisoModalExcluirMusicaPadrao(aviso);
    aviso.textContent =
      'Esta ação não pode ser desfeita. Todas as músicas selecionadas deixam de existir na base deste PC e são retiradas das playlists neste navegador.';
  }
  /* O mesmo realce do caso de uma música só, agora em todas as linhas do lote: é ele
     que diz sobre o que o modal está a perguntar. */
  for (const linha of bibSelLinhas()) {
    const chave = bibSelChaveDaLinha(linha);
    if (chave && estaSelecionada(bibSelecao, chave)) linha.classList.add('confirmando-exclusao');
  }
  if (bd) {
    bd.hidden = false;
    bd.setAttribute('aria-hidden', 'false');
  }
}

function configurarModalExcluirMusica() {
  document.getElementById('musica-excluir-cancel')?.addEventListener('click', () => fecharModalExcluirMusica());
  document.getElementById('musica-excluir-confirm')?.addEventListener('click', () => executarRemoverMusicaDoBancoConfirmado());
}

/**
 * Só a chamada de rede — extraída para a exclusão em lote poder repeti-la sem duplicar
 * a compatibilidade com o servidor antigo. Devolve o `rootId` removido, ou lança com a
 * mensagem que o operador veria.
 *
 * @param {number} idNum
 * @returns {Promise<number>}
 */
async function removerMusicaDoBancoNoServidor(idNum) {
  let res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/excluir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const tentouFallbackDelete = res.status === 404;
  if (tentouFallbackDelete) {
    /* Compatibilidade com servidor que expõe apenas DELETE /api/musicas/:id. */
    res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}`, {
      method: 'DELETE',
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404 && tentouFallbackDelete) {
      throw new Error(
        'Não foi possível excluir a música (HTTP 404). Verifique se o Controlador está em execução (API local na porta 3001).'
      );
    }
    throw new Error(data.erro || `Erro HTTP ${res.status}`);
  }
  return Number(data.rootId) || idNum;
}

/**
 * Limpeza da UI depois de o servidor confirmar a remoção e de `carregarMusicas()`.
 * Não toca na rede — extraída pela mesma razão que a função acima.
 *
 * @param {number} idNum
 * @param {number} rootRemovido
 */
function aplicarLimpezaUiAposRemocaoMusica(idNum, rootRemovido) {
    if (
      selecaoUiBiblioteca &&
      (Number(selecaoUiBiblioteca.id) === idNum || Number(selecaoUiBiblioteca.id) === rootRemovido)
    ) {
      selecaoUiBiblioteca = null;
    }
    if (
      selecaoUiPlaylist &&
      (Number(selecaoUiPlaylist.id) === idNum || Number(selecaoUiPlaylist.id) === rootRemovido)
    ) {
      selecaoUiPlaylist = null;
    }
    const eraAtiva =
      musicaAtiva &&
      (Number(musicaAtiva.id) === idNum ||
        Number(musicaAtiva.id) === rootRemovido ||
        obterRootIdMusicaAtiva() === rootRemovido);
    if (eraAtiva) {
      musicaAtiva = null;
      musicaVersaoLocalId = null;
      musicaRootId = null;
      versoesMusicaServidorCache = { rootId: null, versoes: [] };
      musicaBancoFonte = 'user';
      renderMusicaVersoesBar();
      estrofeAtiva = -1;
      modoEdicaoEstrofes = false;
      snapshotEdicaoEstrofes = null;
      modoLetraCompletaCentral = false;
      aplicarLayoutModoLetraCompleta();
      projecaoMusicaEmitidaNoServidor = false;
      bloqueioSincronizarEstrofeDoServidor = false;
      slidesDockVisivel = ehModoSlidesOperador();
      renderEstrofesEditor();
      renderSlidesStrip();
      atualizarPreviewOperador();
      marcacaoEstrofeEditor();
    }
}

async function executarRemoverMusicaDoBancoConfirmado() {
  /* O lote tem caminho próprio: `carregarMusicas()` e os renders correm uma vez no
     fim, e não uma vez por música. */
  if (musicasExcluirLotePendente) return executarRemoverMusicasDoBancoEmLoteConfirmado();
  if (!musicaExcluirPendente) return fecharModalExcluirMusica();
  const idNum = musicaExcluirPendente.id;
  /* Medido antes de a lista se desfazer: é este ponto que o render a seguir devolve. */
  bibGuardarAncoraScrollParaProximoRender();
  fecharModalExcluirMusica();
  try {
    const rootRemovido = await removerMusicaDoBancoNoServidor(idNum);
    removerMusicaDeTodasPlaylists(rootRemovido);
    removerCopiasLocaisDaMusica(rootRemovido);
    await carregarMusicas();
    aplicarLimpezaUiAposRemocaoMusica(idNum, rootRemovido);
    renderPlaylist();
    refreshListaBanco();
  } catch (e) {
    alert(e.message || 'Falha ao remover.');
  }
}

/**
 * Exclusão em lote.
 *
 * Uma música que falhe não derruba as outras: cada remoção é tentada por si, e no fim o
 * operador recebe uma lista do que não saiu. O contrário — parar na primeira falha —
 * deixava o lote meio feito sem dizer onde tinha parado.
 */
async function executarRemoverMusicasDoBancoEmLoteConfirmado() {
  const lote = Array.isArray(musicasExcluirLotePendente) ? musicasExcluirLotePendente.slice() : [];
  fecharModalExcluirMusica();
  if (!lote.length) return;
  /* Mesma razão do caminho de uma só música. */
  bibGuardarAncoraScrollParaProximoRender();
  const removidos = [];
  const falhas = [];
  for (const m of lote) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const rootRemovido = await removerMusicaDoBancoNoServidor(m.id);
      removerMusicaDeTodasPlaylists(rootRemovido);
      removerCopiasLocaisDaMusica(rootRemovido);
      removidos.push({ id: m.id, rootRemovido });
    } catch (e) {
      falhas.push(`· ${m.titulo || `ID ${m.id}`}: ${e.message || 'falha ao remover'}`);
    }
  }
  if (removidos.length) {
    await carregarMusicas();
    for (const r of removidos) aplicarLimpezaUiAposRemocaoMusica(r.id, r.rootRemovido);
    renderPlaylist();
    refreshListaBanco();
  }
  bibSelCancelarModo();
  if (falhas.length) {
    alert(`Não foi possível remover ${falhas.length} de ${lote.length} músicas:\n${falhas.join('\n')}`);
  }
}

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

/** Primeiras N linhas de uma estrofe — prévia do próximo no slide 1 do M3. */
function primeirasLinhasEstrofeMinistrante(texto, n = 2) {
  const max = Math.max(0, Number(n) || 0);
  const lines = String(texto ?? '').split(/\r\n|\r|\n/);
  if (lines.length <= max) return String(texto ?? '');
  return lines.slice(0, max).join('\n');
}

/** Tom da música ativa na playlist do culto (vazio se não houver). */
function obterTomPlaylistMusicaAtiva() {
  if (!musicaAtiva || !cultoId) return '';
  const pl = getPlaylist(cultoId);
  if (!Array.isArray(pl)) return '';
  const it = pl.find((x) => playlistItemMesmaVersaoQueAtiva(x));
  return normalizarTomPlaylist(it?.tom);
}

/** Título do 1.º slide M3: «♪ Título | Tom» quando o tom estiver cadastrado. */
function tituloAberturaM3MusicaAtiva(tituloBase) {
  const tit = String(tituloBase || musicaAtiva?.titulo || '').trim();
  const tom = obterTomPlaylistMusicaAtiva();
  if (!tit) return tom || '';
  const corpo = tom ? `${tit} | ${tom}` : tit;
  return `♪ ${corpo}`;
}

function limparPreviewTituloMusicaAbertura() {
  const opTit = document.getElementById('op-titulo');
  if (!opTit) return;
  opTit.textContent = '';
  opTit.classList.add('vazio');
}

/** O `gap` que o flex já põe entre os filhos da prévia, em px — acompanha o CSS. */
const GAP_PREVIEW_SLIDES_PX = 14;

/** `line-height` da letra na prévia — acompanha `.op-slide-text` no CSS. */
const LINE_HEIGHT_PREVIEW_SLIDE = 1.35;

/**
 * Separa o título da letra por uma linha, como no M3 real.
 *
 * Mesma regra de lá (ver `aplicarRespiroTituloAberturaOp`): a linha mede-se na LETRA, e o
 * `gap` do flex já conta para a distância — a margem só acrescenta o que falta.
 *
 * Assim a prévia encolhe junto com a letra: como aqui a fonte é ~12 px e lá são ~4 vh, um
 * valor fixo em qualquer um dos lados faria os dois deixarem de se parecer.
 */
function aplicarRespiroPreviewTituloAbertura() {
  const opTit = document.getElementById('op-titulo');
  if (!opTit || opTit.classList.contains('vazio')) return;
  const opAtual = document.getElementById('op-atual');
  const fontePx = opAtual ? parseFloat(getComputedStyle(opAtual).fontSize) : 0;
  const linhaPx = (Number.isFinite(fontePx) && fontePx > 0 ? fontePx : 12) *
    LINE_HEIGHT_PREVIEW_SLIDE;
  opTit.style.marginBottom = `${Math.max(0, Math.round(linhaPx - GAP_PREVIEW_SLIDES_PX))}px`;
}

/** Estilo do título do 1.º slide na prévia M3 (cor + tamanho relativos à config). */
function aplicarEstiloPreviewTituloAbertura() {
  const opTit = document.getElementById('op-titulo');
  if (!opTit) return;
  const mb = lerCurrentCfgCtrl()?.ministrante || {};
  const cor = String(mb.aberturaTituloColor || '').trim() || '#f3c15a';
  const vh = Number(mb.aberturaTituloFontSize);
  const fontVh = Number.isFinite(vh) && vh >= 0 ? vh : 7;
  opTit.style.color = cor;
  /* Prévia é pequena: ~1.6 px por vh (7 vh ≈ 11 px, o tamanho anterior). */
  opTit.style.fontSize = `${Math.max(8, Math.round(fontVh * 1.6))}px`;
}

/**
 * Tom de cifra: `C`, `C#`, `Bb`, `Cm`, `F#m`, `ORIG.` — o conjunto de `TONS_MUSICAIS`.
 * Gémeo de `RX_TOM_TITULO_ABERTURA` em `display-operator.html`; alterar os dois juntos.
 */
const RX_TOM_TITULO_ABERTURA = /^(?:[A-G](?:#|b)?m?|ORIG\.?)$/;

/**
 * Separa «♪ Título | Tom» em nome e tom, para o tom escapar à caixa alta do título.
 *
 * O tom é o que vem depois do ÚLTIMO ` | `, e só se se parecer mesmo com um tom: uma
 * música chamada «Aleluia | Ao Vivo» continua a ser nome inteiro, toda em maiúsculas.
 */
function partesTituloAberturaM3(titulo) {
  const t = String(titulo || '').trim();
  const i = t.lastIndexOf(' | ');
  if (i < 0) return { nome: t, tom: '' };
  const tom = t.slice(i + 3).trim();
  if (!RX_TOM_TITULO_ABERTURA.test(tom)) return { nome: t, tom: '' };
  return { nome: t.slice(0, i), tom };
}

/** Título no topo do preview M3 — só no 1.º slide da música. */
function aplicarPreviewTituloMusicaAbertura(titulo, mostrar) {
  const opTit = document.getElementById('op-titulo');
  if (!opTit) return;
  const t = String(titulo || '').trim();
  if (!mostrar || !t) {
    limparPreviewTituloMusicaAbertura();
    return;
  }
  const { nome, tom } = partesTituloAberturaM3(t);
  opTit.textContent = '';
  const spanNome = document.createElement('span');
  spanNome.textContent = textoSlideMaiusculo(nome);
  opTit.appendChild(spanNome);
  if (tom) {
    /* Cifra não é texto: `Cm` é dó menor e `CM` seria outra coisa. O `text-transform` do
       título não pode chegar aqui — ver `.op-titulo-musica-tom` no CSS. */
    const spanTom = document.createElement('span');
    spanTom.className = 'op-titulo-musica-tom';
    spanTom.textContent = ` | ${tom}`;
    opTit.appendChild(spanTom);
  }
  opTit.classList.remove('vazio');
  aplicarEstiloPreviewTituloAbertura();
  aplicarRespiroPreviewTituloAbertura();
}

/**
 * Cor efectiva dos comentários na prévia do painel — fonte única para o `style` inline do
 * render E para a var CSS de reforço. Nunca é rebaixada para o padrão: uma config parcial
 * (sem `commentColor`) mantém a cor já aplicada em vez de piscar para o azul de fábrica.
 *
 * Declarada aqui, e não junto de `aplicarCorComentarioMinistranteNoPainel`, porque
 * `carregarSlideCfgInicialDoStorage()` corre no topo do módulo e já aplica a cor.
 */
let corComentarioMinistrantePainel = COR_COMENTARIO_MINISTRANTE_PADRAO;

const previewMinistranteHelpers = {
  escapeHtml,
  maiusculo: textoSlideMaiusculo,
  aplicarClasseLinhas,
  limparEstiloPreviewSlide,
  /* Lida a cada render da prévia. Cai na última cor aplicada (não no padrão) para que uma
     config ainda por chegar nunca produza um frame com a cor errada. */
  get commentColor() {
    try {
      return aplicarCorComentarioMinistranteNoPainel(lerCurrentCfgCtrl()?.ministrante?.commentColor);
    } catch (_) {
      return corComentarioMinistrantePainel;
    }
  },
};

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
/** Há algo efetivamente enviado às telas de projeção (servidor ligado). */
function hayProjecaoAtivaNoServidor() {
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.projecaoLive && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length) return true;
  if (e.blackout) return true;
  if (e.tipo === 'apresentacao' && e.apresentacao && String(e.apresentacao.src || '').trim()) return true;
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) return true;
  if (e.projecaoMinistranteApresentacao) return true;
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) return true;
  if (e.tipo === 'musica' && e.slidePretoFinal) return true;
  if (e.tipo === 'musica' && !e.telaLimpa && e.linhas && e.linhas.length) return true;
  return false;
}

/**
 * Para os cartões quando não há uma «saída nas telas» em curso de música/bíblia que deva espelhar sempre o servidor:
 * exige música selecionada alinhada + flag local de emissão (evita mostrar letra só ao navegar na playlist sem projetar).
 */
function hayProjecaoAtivaNoServidorParaPreviews() {
  if (!hayProjecaoAtivaNoServidor()) return false;
  const e = estadoServidor;
  if (!e) return false;
  if (e.blackout) return true;
  if (e.projecaoMinistranteApresentacao && e.tipo !== 'apresentacao' && e.tipo !== 'aviso') return true;
  if (e.tipo === 'biblia') return true;
  if (e.tipo === 'musica') {
    if (!musicaAtiva) return true;
    if (!musicaEstadoCombinaComAtiva(e)) return false;
    /* Só espelhar letra de música nos cartões quando este painel já «armou» projeção (duplo clique, setas, próxima música…). */
    if (!projecaoMusicaEmitidaNoServidor) return false;
    return true;
  }
  return false;
}

/**
 * Não espelhar letras de música nos cartões de preview até este painel estar no fluxo de projeção
 * (faixa de slides visível). Evita mostrar letra quando o servidor ainda guarda o estado anterior.
 */
function previewMusicaEsperandoDockParaEspelharLetra() {
  const e = estadoServidor;
  if (!e || e.tipo !== 'musica') return false;
  if (musicaAtiva && !musicaEstadoCombinaComAtiva(e)) return false;
  if (e.blackout || e.slidePretoFinal || e.telaLimpa) return false;
  if (!e.linhas || !e.linhas.length) return false;
  return !slidesDockVisivel && !ehModoSlidesOperador();
}

/**
 * Clique na playlist/banco só prepara musicaAtiva na faixa — até um novo emit deste painel,
 * os cartões Telão/TV não espelham o servidor (nem a música anterior nas telas físicas).
 */
function suprimirEspelhoPreviewsPorNavegacaoPlaylist() {
  /* Em qualquer modo, ao "engatilhar" música na playlist sem emitir ao servidor,
     manter nos previews o que já está projetado até um novo emit (duplo clique/setas). */
  return false;
}

/** Aplica no DOM o estado da saída “telão” (público). */
function aplicarPreviewTelaoNoDom(estado) {
  const prevTitulo = document.getElementById('pv-live-titulo');
  const prevLetras = document.getElementById('pv-live-letras');

  if (estado && estado.previewImagemNoTelao) {
    prevTitulo.textContent = '';
    const linhaTxt = 'IMAGEM NO TELÃO';
    prevLetras.innerHTML = `<span class="pv-live-ap-meta">${svgIconeTipoMidiaApresentacao('image')}<span class="pv-live-ap-meta-txt">${escapeHtml(linhaTxt)}</span></span>`;
    prevLetras.classList.remove('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (!estado || estado.semProjecao) {
    prevTitulo.textContent = '';
    prevLetras.textContent = '';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.blackout) {
    prevTitulo.textContent = '';
    prevLetras.textContent = 'Tela preta (F10)';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.tipo === 'aviso' && Array.isArray(estado.linhas) && estado.linhas.length) {
    prevTitulo.textContent = '';
    prevLetras.textContent = estado.linhas.join('\n');
    prevLetras.classList.remove('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.tipo === 'apresentacao' && estado.apresentacao && String(estado.apresentacao.src || '').trim()) {
    const ap = estado.apresentacao;
    const label =
      [ap.title, ap.name].map((x) => String(x || '').trim()).find(Boolean) ||
      String(estado.titulo || '').trim() ||
      'Apresentação';
    prevTitulo.textContent = ehModoSlidesOperador() ? '' : label.toUpperCase();
    const kind = String(ap.kind || '').toLowerCase();
    const tipoRotulo = rotuloTipoMidiaApresentacao(kind);
    const linhaTxt = `${tipoRotulo} no telão`;
    prevLetras.innerHTML = `<span class="pv-live-ap-meta">${svgIconeTipoMidiaApresentacao(kind)}<span class="pv-live-ap-meta-txt">${escapeHtml(linhaTxt)}</span></span>`;
    prevLetras.classList.remove('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.slidePretoFinal) {
    prevTitulo.textContent = '';
    prevLetras.textContent = '';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.telaLimpa || !estado.linhas || !estado.linhas.length) {
    prevTitulo.textContent = '';
    if (ehModoSlidesOperador()) {
      prevLetras.textContent = '';
      prevLetras.classList.add('vazio');
      limparEstiloPreviewSlide(prevLetras);
      return;
    }
    prevLetras.textContent = 'Tela limpa';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  const tituloTelaoDesejado = ehModoSlidesOperador() ? '' : (estado.titulo || '').toUpperCase();
  const linhasPub = filtrarLinhasParaPublico(estado.linhas);
  const textoPub = linhasPub.join('\n');
  const textoDom = textoSlideMaiusculo(textoPub);
  const previewTelaoJaAlinhado =
    prevTitulo.textContent === tituloTelaoDesejado &&
    prevLetras.textContent === textoDom &&
    !prevLetras.classList.contains('vazio') &&
    prevLetras.dataset.previewFonteTexto === textoPub;
  if (previewTelaoJaAlinhado) return;
  prevTitulo.textContent = tituloTelaoDesejado;
  prevLetras.textContent = textoDom;
  prevLetras.classList.remove('vazio');
  aplicarClasseLinhas(prevLetras, textoPub);
}

/**
 * Letra nos cartões TELÃO/TV do modo slide: só com projeção real já emitida.
 * Seleção na faixa/playlist (1 clique) não preenche as prévias dos monitores.
 * Home (modo completo) usa só `#playlist-preview-card`. Badges de mídia ficam
 * de fora — tratados nos early-returns de `atualizarPreviewOperador` / telão.
 */
function podeEspelharLetraNosPreviewsModoSlide() {
  if (!ehModoSlidesOperador()) return false;
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes) || !musicaAtiva.estrofes.length) {
    return false;
  }
  if (estrofeAtiva < 0) return false;
  return !!projecaoMusicaEmitidaNoServidor;
}

/**
 * Estado local do slide selecionado no painel (modo slide).
 * Não deve alimentar as prévias TELÃO/TV — essas espelham só a projeção real.
 * Mantido para usos pontuais que precisem do conteúdo da seleção local.
 */
function estadoPreviewTelaoLocalModoSlides() {
  if (!podeEspelharLetraNosPreviewsModoSlide()) {
    return { semProjecao: true };
  }
  const idxPreto = musicaAtiva.estrofes.length;
  if (estrofeAtiva === idxPreto) return { tipo: 'musica', slidePretoFinal: true };
  const cur = String(musicaAtiva.estrofes[estrofeAtiva] ?? '');
  return { tipo: 'musica', titulo: musicaAtiva.titulo || '', telaLimpa: false, linhas: cur.split('\n') };
}

/** Telão no painel: espelha o servidor com as regras de `suprimirEspelhoPreviewsPorNavegacaoPlaylist`. */
function atualizarPreviewTelaoPublico() {
  /* Modo Slides: M2 é monitor virtual independente (não misturar com a TV). */
  if (ehModoSlidesOperador()) {
    atualizarPreviewMonitorPublicoSlides();
    return;
  }
  const e = estadoServidor;
  if (!hayProjecaoAtivaNoServidor() || !e) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  if (suprimirEspelhoPreviewsPorNavegacaoPlaylist()) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  if (e.blackout) {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'apresentacao') {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'musica') {
    const telasMostramMusica =
      e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length);
    if (telasMostramMusica) {
      aplicarPreviewTelaoNoDom(e);
      return;
    }
  }
  if (!hayProjecaoAtivaNoServidorParaPreviews()) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  if (previewMusicaEsperandoDockParaEspelharLetra()) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  aplicarPreviewTelaoNoDom(estadoServidor);
}

/**
 * Cartão TV quando o painel não está alinhado com a projeção (ex.: letra comandada só pelo mobile).
 * Usa o mesmo estado que o servidor manda no socket (`linhas` + `linhasProximo` + `proximoSlidePreto`),
 * para o cartão «próximo» coincidir com a TV física e com o fluxo do controlador.
 */
function preencherPreviewOperadorSomenteEstadoServidorMusica() {
  const e = estadoServidor;
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (!e || e.tipo !== 'musica') return;
  if (e.slidePretoFinal) {
    limparPreviewTituloMusicaAbertura();
    opA.innerHTML = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    opP.innerHTML = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
    return;
  }
  const idx = Number.isFinite(Number(e.estrofeIndex)) ? Number(e.estrofeIndex) : -1;
  const tituloMusica =
    (musicaAtiva && musicaEstadoCombinaComAtiva(e) && musicaAtiva.titulo) || e.titulo || '';
  const abertura = idx === 0;
  aplicarPreviewTituloMusicaAbertura(
    musicaAtiva && musicaEstadoCombinaComAtiva(e)
      ? tituloAberturaM3MusicaAtiva(tituloMusica)
      : tituloMusica,
    abertura
  );

  let curRaw = '';
  let proxRaw = '';
  if (musicaAtiva && musicaEstadoCombinaComAtiva(e) && Array.isArray(musicaAtiva.estrofes)) {
    if (idx >= 0 && idx < musicaAtiva.estrofes.length) curRaw = String(musicaAtiva.estrofes[idx] ?? '');
    if (e.proximoSlidePreto) proxRaw = '';
    else if (idx >= 0 && idx < musicaAtiva.estrofes.length - 1) {
      const nxt = String(musicaAtiva.estrofes[idx + 1] ?? '');
      proxRaw = abertura ? primeirasLinhasEstrofeMinistrante(nxt, 2) : nxt;
    }
  } else {
    curRaw = (e.linhas || []).join('\n');
    if (e.proximoSlidePreto) proxRaw = '';
    else if (Array.isArray(e.linhasProximo) && e.linhasProximo.length) {
      const nxt = e.linhasProximo.join('\n');
      proxRaw = abertura ? primeirasLinhasEstrofeMinistrante(nxt, 2) : nxt;
    }
  }

  opA.className = 'op-slide-text';
  aplicarPreviewMinistranteNoElemento(opA, curRaw, previewMinistranteHelpers);

  opP.className = 'op-slide-text';
  if (proxRaw.trim()) {
    aplicarPreviewMinistranteNoElemento(opP, proxRaw, previewMinistranteHelpers);
  } else {
    opP.innerHTML = '';
    opP.classList.add('vazio');
    limparEstiloPreviewSlide(opP);
  }
}

/** Pré-visualização TV/ministrante só a partir da música e estrofe escolhidas no painel (sem depender do socket). */
function preencherPreviewOperadorSomenteMusicaLocal() {
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');

  if (!musicaAtiva || !musicaAtiva.estrofes || musicaAtiva.estrofes.length === 0) {
    limparPreviewTituloMusicaAbertura();
    opA.textContent = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    opP.textContent = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
    return;
  }

  const nEst = musicaAtiva.estrofes.length;
  const idxPreto = nEst;

  if (estrofeAtiva < 0) {
    limparPreviewTituloMusicaAbertura();
    opA.innerHTML = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    const p0 = musicaAtiva.estrofes[0];
    opP.className = 'op-slide-text';
    if (p0) {
      aplicarPreviewMinistranteNoElemento(opP, p0, previewMinistranteHelpers);
    } else {
      opP.innerHTML = '';
      opP.classList.add('vazio');
      limparEstiloPreviewSlide(opP);
    }
    return;
  }

  if (estrofeAtiva === idxPreto) {
    limparPreviewTituloMusicaAbertura();
    opA.innerHTML = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    opP.innerHTML = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
    return;
  }

  const abertura = estrofeAtiva === 0;
  aplicarPreviewTituloMusicaAbertura(tituloAberturaM3MusicaAtiva(musicaAtiva.titulo || ''), abertura);

  const cur = musicaAtiva.estrofes[estrofeAtiva];
  const proximoEhPreto = estrofeAtiva === nEst - 1;
  const nxtFull = proximoEhPreto ? null : musicaAtiva.estrofes[estrofeAtiva + 1];
  const nxt = nxtFull
    ? abertura
      ? primeirasLinhasEstrofeMinistrante(nxtFull, 2)
      : nxtFull
    : null;

  opA.className = 'op-slide-text';
  if (cur) {
    aplicarPreviewMinistranteNoElemento(opA, cur, previewMinistranteHelpers);
  } else {
    opA.innerHTML = '';
    opA.classList.add('vazio');
    limparEstiloPreviewSlide(opA);
  }

  opP.className = 'op-slide-text';
  if (proximoEhPreto) {
    opP.innerHTML = '';
    opP.classList.add('vazio');
    limparEstiloPreviewSlide(opP);
  } else if (nxt) {
    aplicarPreviewMinistranteNoElemento(opP, nxt, previewMinistranteHelpers);
  } else {
    opP.innerHTML = '';
    opP.classList.add('vazio');
    limparEstiloPreviewSlide(opP);
  }
}

/** Limpa título/letra da prévia TV (modo Slides ocioso). */
function limparConteudoPreviewOperadorSlides() {
  limparPreviewTituloMusicaAbertura();
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (opA) {
    opA.textContent = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
  }
  if (opP) {
    opP.textContent = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
  }
}

/**
 * Seleção local alinhada com o índice projetado no servidor (modo Slides).
 * Se o operador clicou noutro chip sem projetar, a prévia deve continuar no servidor.
 */
function selecaoLocalAlinhadaComProjecaoMusicaServidor() {
  const e = estadoServidor;
  if (!e || e.tipo !== 'musica' || !musicaAtiva || !Array.isArray(musicaAtiva.estrofes)) return false;
  if (!musicaEstadoCombinaComAtiva(e)) return false;
  const idxPreto = musicaAtiva.estrofes.length;
  if (e.slidePretoFinal) return estrofeAtiva === idxPreto;
  const idxSrv = Number(e.estrofeIndex);
  return Number.isFinite(idxSrv) && estrofeAtiva === idxSrv;
}

let previewRelogioOciosoTimer = null;

/** Config de relógio usada pelo M3 real (`currentCfgCtrl.clock`). */
function obterCfgClockPreviewSlides() {
  const cfg =
    typeof window.getCurrentCfgCtrl === 'function' ? window.getCurrentCfgCtrl() : lerCurrentCfgCtrl();
  return (cfg && cfg.clock) || {};
}

/** Igual a `deveRevelarRelogioMinistrante` em `display-operator.html`. */
function deveRevelarRelogioPreviewMinistrante() {
  return obterCfgClockPreviewSlides().showClock !== false;
}

/** `vh` do M3 escalado à altura da capa da prévia (mesma proporção visual). */
function pxVhPreviewRelogio(vh, capa) {
  const h = (capa && capa.clientHeight) || 80;
  return Math.max(6, (Number(vh) || 0) * (h / 100));
}

function corRelogioPreviewOp(clk) {
  return clk.textColor || '#ffffff';
}

function aplicarFundoRelogioPreviewOp(capa, clk) {
  if (!capa) return;
  if (clk.bgType === 'gradient') {
    capa.style.background = clk.bgGradient || '#000000';
  } else if (clk.bgType === 'image' && clk.bgImage) {
    capa.style.background = `url('${clk.bgImage}') center/cover no-repeat`;
  } else {
    capa.style.background = clk.bgColor || '#000000';
  }
}

function desenharRelogioAnalogicoPreviewOp(canvas, now, cor) {
  if (!canvas) return;
  const ctxCv = canvas.getContext('2d');
  if (!ctxCv) return;
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const r = W / 2 - 14;
  ctxCv.clearRect(0, 0, W, H);
  ctxCv.beginPath();
  ctxCv.arc(cx, cy, r, 0, 2 * Math.PI);
  ctxCv.strokeStyle = cor;
  ctxCv.globalAlpha = 0.28;
  ctxCv.lineWidth = 2;
  ctxCv.stroke();
  ctxCv.globalAlpha = 1;
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * 2 * Math.PI - Math.PI / 2;
    const maior = i % 3 === 0;
    const inner = maior ? r - 22 : r - 10;
    ctxCv.beginPath();
    ctxCv.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
    ctxCv.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    ctxCv.strokeStyle = cor;
    ctxCv.globalAlpha = maior ? 0.85 : 0.38;
    ctxCv.lineWidth = maior ? 3 : 1.5;
    ctxCv.stroke();
    ctxCv.globalAlpha = 1;
  }
  const sec = now.getSeconds();
  const min = now.getMinutes() + sec / 60;
  const hr = (now.getHours() % 12) + min / 60;
  const desenharMao = (frac, len, largura, alpha) => {
    const ang = frac * 2 * Math.PI - Math.PI / 2;
    ctxCv.beginPath();
    ctxCv.moveTo(cx, cy);
    ctxCv.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
    ctxCv.strokeStyle = cor;
    ctxCv.globalAlpha = alpha;
    ctxCv.lineWidth = largura;
    ctxCv.lineCap = 'round';
    ctxCv.stroke();
    ctxCv.globalAlpha = 1;
  };
  desenharMao(hr / 12, r * 0.52, 9, 0.95);
  desenharMao(min / 60, r * 0.73, 5.5, 0.88);
  desenharMao(sec / 60, r * 0.82, 2, 0.65);
  ctxCv.beginPath();
  ctxCv.arc(cx, cy, 7, 0, 2 * Math.PI);
  ctxCv.fillStyle = cor;
  ctxCv.globalAlpha = 0.9;
  ctxCv.fill();
  ctxCv.globalAlpha = 1;
}

/**
 * Tick da prévia ociosa — espelho de `tickRelogioOp` (display-operator).
 * Usa a mesma `clock` de Ajustes que o M3 real.
 */
function tickPreviewRelogioOciosoMinistrante() {
  const capa = document.getElementById('op-preview-relogio');
  const elHora = document.getElementById('op-preview-relogio-hora');
  const elData = document.getElementById('op-preview-relogio-data');
  const elVerso = document.getElementById('op-preview-relogio-verso');
  const elAnalogWrap = document.getElementById('op-preview-relogio-analog-wrap');
  const elAnalog = document.getElementById('op-preview-relogio-analog');
  if (!capa || !elHora || capa.hidden) return;

  const clk = obterCfgClockPreviewSlides();
  const now = new Date();
  const fmt = String(clk.format || 'HH:MM');
  const lowerFmt = fmt.toLowerCase();
  const color = corRelogioPreviewOp(clk);
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const analogico = lowerFmt === 'analog';

  elHora.style.display = analogico || lowerFmt === 'none' ? 'none' : '';
  if (elAnalogWrap) elAnalogWrap.hidden = !analogico;
  if (lowerFmt === 'hh:mm:ss') elHora.textContent = `${h}:${m}:${s}`;
  else if (lowerFmt !== 'none' && !analogico) elHora.textContent = `${h}:${m}`;
  else elHora.textContent = '';
  elHora.style.color = color;
  elHora.style.fontSize = `${pxVhPreviewRelogio(Math.max(7, Number(clk.fontSize || 13)), capa)}px`;

  if (analogico) desenharRelogioAnalogicoPreviewOp(elAnalog, now, color);

  if (elData) {
    if (clk.showDate !== false) {
      elData.textContent = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      });
      elData.style.display = '';
      elData.style.color = clk.dateColor || color;
      elData.style.fontSize = `${pxVhPreviewRelogio(Math.max(0.8, Number(clk.dateFontSize || 2.4)), capa)}px`;
    } else {
      elData.textContent = '';
      elData.style.display = 'none';
    }
  }

  if (elVerso) {
    const verseTxt = clk.showVerse && clk.verse ? String(clk.verse) : '';
    if (verseTxt) {
      elVerso.textContent = verseTxt;
      elVerso.style.display = '';
      elVerso.style.color = clk.verseColor || color;
      elVerso.style.fontSize = `${pxVhPreviewRelogio(Math.max(0.8, Number(clk.verseFontSize || 2.4)), capa)}px`;
    } else {
      elVerso.textContent = '';
      elVerso.style.display = 'none';
    }
  }

  aplicarFundoRelogioPreviewOp(capa, clk);
}

/**
 * Liga/desliga a capa do relógio na prévia TV.
 * Com `showClock === false` a capa fica oculta → fundo preto do cartão (= M3 real).
 */
function definirPreviewRelogioOciosoMinistrante(visivel) {
  const capa = document.getElementById('op-preview-relogio');
  if (!capa) return;
  if (visivel) {
    capa.hidden = false;
    capa.setAttribute('aria-hidden', 'false');
    tickPreviewRelogioOciosoMinistrante();
    if (!previewRelogioOciosoTimer) {
      previewRelogioOciosoTimer = setInterval(tickPreviewRelogioOciosoMinistrante, 1000);
    }
  } else {
    capa.hidden = true;
    capa.setAttribute('aria-hidden', 'true');
    capa.style.background = '';
    if (previewRelogioOciosoTimer) {
      clearInterval(previewRelogioOciosoTimer);
      previewRelogioOciosoTimer = null;
    }
  }
}

/**
 * Estado ocioso / saída do M3 na prévia — delega ao classificador do monitor virtual.
 */
function sincronizarPreviewOciosoMinistranteSlides() {
  if (!ehModoSlidesOperador()) {
    definirPreviewRelogioOciosoMinistrante(false);
    return;
  }
  atualizarPreviewMonitorMinistranteSlides();
}

/**
 * Prévia flutuante da Home: só o estado da música/slides da coluna central (estrofeAtiva).
 * Tamanho da fonte por texto (linha mais longa + linhas) · sem quebra automática (`white-space: pre`).
 * Independente do socket · não altera projeção.
 */
function atualizarPreviewPlaylistCentral() {
  homeLayout?.updatePreview(estrofeAtiva, musicaAtiva?.estrofes?.length || 0);
  if (document.body.classList.contains('app-mod-slides')) return;
  const tit = document.getElementById('pl-pv-titulo');
  const slideEl = document.getElementById('pl-pv-slide');
  if (!tit || !slideEl) return;

  const limpar = () => {
    tit.textContent = '';
    tit.classList.add('vazio');
    slideEl.textContent = '';
    slideEl.className = 'pl-slide-text vazio';
    limparEstiloPreviewSlide(slideEl);
  };

  if (ehModoBibliaOperador() || !musicaAtiva || !musicaAtiva.estrofes || musicaAtiva.estrofes.length === 0) {
    limpar();
    return;
  }

  tit.classList.remove('vazio');
  tit.textContent = (musicaAtiva.titulo || '').toUpperCase();

  const nEst = musicaAtiva.estrofes.length;
  const idxPreto = nEst;

  if (estrofeAtiva < 0 || estrofeAtiva === idxPreto) {
    slideEl.textContent = '';
    slideEl.className = 'pl-slide-text vazio';
    limparEstiloPreviewSlide(slideEl);
    return;
  }

  const cur = musicaAtiva.estrofes[estrofeAtiva];
  slideEl.textContent = cur ? textoSlideMaiusculo(cur) : '';
  slideEl.className = 'pl-slide-text';
  if (cur) {
    slideEl.classList.remove('vazio');
    aplicarClasseLinhas(slideEl, cur);
  } else {
    slideEl.classList.add('vazio');
    limparEstiloPreviewSlide(slideEl);
  }
}

function atualizarPreviewOperador() {
  try {
    /* Modo Slides: duas prévias = monitores virtuais independentes (M2 e M3). */
    if (ehModoSlidesOperador()) {
      atualizarPreviewsMonitoresVirtuaisModoSlides();
      const clsMin = classificarSaidaMonitorMinistranteSlides();
      /* Só reemitir ministrante quando a prévia espelha slides (não badge/outro modo). */
      if (clsMin.mode === 'slides' || clsMin.mode === 'idle') {
        emitirEstadoMinistranteAoServidor();
      }
      return;
    }

    const opA = document.getElementById('op-atual');
    const opP = document.getElementById('op-proximo');

    if (!hayProjecaoAtivaNoServidor()) {
      definirPreviewRelogioOciosoMinistrante(false);
      limparPreviewTituloMusicaAbertura();
      opA.textContent = '';
      opA.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    definirPreviewRelogioOciosoMinistrante(false);

    if (suprimirEspelhoPreviewsPorNavegacaoPlaylist()) {
      limparPreviewTituloMusicaAbertura();
      opA.textContent = '';
      opA.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    if (
      estadoServidor &&
      estadoServidor.tipo === 'biblia' &&
      (!estadoServidor.telaLimpa || estadoServidor.projecaoSomenteMinistrante)
    ) {
      limparPreviewTituloMusicaAbertura();
      const linhasBib = Array.isArray(estadoServidor.linhas) ? estadoServidor.linhas : [];
      const txtBib = linhasBib.map((s) => String(s ?? '')).join('\n').trim();
      opA.textContent = txtBib;
      opA.className = 'op-slide-text';
      if (txtBib) {
        opA.classList.remove('vazio');
        aplicarClasseLinhas(opA, txtBib);
      } else {
        opA.classList.add('vazio');
        limparEstiloPreviewSlide(opA);
      }
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      /* Ministrante já foi atualizado no servidor por exibir_versiculo — não reemitir vazio. */
      return;
    }

    const eMus = estadoServidor;
    const servidorMostraMusicaProj =
      eMus &&
      eMus.tipo === 'musica' &&
      !eMus.blackout &&
      (eMus.slidePretoFinal || (!eMus.telaLimpa && eMus.linhas && eMus.linhas.length));

    const painelAlinhadoComProjecaoServidor =
      servidorMostraMusicaProj &&
      musicaAtiva &&
      musicaEstadoCombinaComAtiva(eMus) &&
      projecaoMusicaEmitidaNoServidor;

    if (servidorMostraMusicaProj && !painelAlinhadoComProjecaoServidor) {
      preencherPreviewOperadorSomenteEstadoServidorMusica();
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    const servidorMusicaAlinhado =
      estadoServidor &&
      estadoServidor.tipo === 'musica' &&
      hayProjecaoAtivaNoServidorParaPreviews();

    if (!servidorMusicaAlinhado) {
      /* Home: nunca preencher TELÃO/TV com letra — só a prévia da playlist (`pl-pv-*`). */
      const mostrarPreviewOpLocal = projecaoMusicaEmitidaNoServidor;
      if (mostrarPreviewOpLocal) {
        preencherPreviewOperadorSomenteMusicaLocal();
      } else {
        limparPreviewTituloMusicaAbertura();
        opA.textContent = '';
        opA.className = 'op-slide-text vazio';
        limparEstiloPreviewSlide(opA);
        opP.textContent = '';
        opP.className = 'op-slide-text vazio';
        limparEstiloPreviewSlide(opP);
      }
      atualizarPreviewTelaoPublico();
      return;
    }

    if (previewMusicaEsperandoDockParaEspelharLetra()) {
      limparPreviewTituloMusicaAbertura();
      opA.textContent = '';
      opA.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    preencherPreviewOperadorSomenteMusicaLocal();
    atualizarPreviewTelaoPublico();
    emitirEstadoMinistranteAoServidor();
  } finally {
    atualizarPreviewPlaylistCentral();
    if (ehModoSlidesOperador() || ehModoApresentacaoOperador()) {
      try {
        aplicarPreviewPainelOcultoNoDom();
      } catch (_) {
  // intencional — erro ignorado
}
    }
    if (ehModoSlidesOperador()) {
      try {
        syncRoteamentoTelasModoSlidesNaUi();
      } catch (_) {
  // intencional — erro ignorado
}
    } else {
      definirPreviewRelogioOciosoMinistrante(false);
    }
  }
}

let lyraAssinaturaEmitMinistrante = null;

function emitirEstadoMinistranteAoServidor() {
  if (apresentacaoOcupandoCanalMinistrante()) return;
  if (!projecao.pronta()) return;
  if (ehModoSlidesOperador() && obterRotaSlidesParaUi().ministranteIndex < 0) return;
  if (
    ehModoBibliaOperador() &&
    estadoServidor &&
    estadoServidor.tipo === 'biblia' &&
    !estadoServidor.telaLimpa
  ) {
    return;
  }
  /*
   * Folhear a playlist ou clicar num chip só selecciona no painel. Se já há
   * conteúdo no ar e este painel NÃO o emitiu, o título/letra do M3 têm de
   * continuar os da projeção — senão Galileu fica no slide e o nome vira Deixa.
   * Quem arma `projecaoMusicaEmitidaNoServidor` (duplo clique, setas, próxima
   * música) é que pode voltar a mandar `exibir_ministrante`.
   */
  if (hayProjecaoAtivaNoServidor() && !projecaoMusicaEmitidaNoServidor) return;
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (!opA || !opP) return;
  const atual = textoMinistranteDeElementoPreview(opA);
  const proximo = textoMinistranteDeElementoPreview(opP);
  /** Se ainda há saída ativa (inclui blackout/slide preto), não abrir relógio no ministrante. */
  const projecaoAtiva = hayProjecaoAtivaNoServidor();
  const slidePretoFinal = !!(estadoServidor && estadoServidor.slidePretoFinal);
  const telaLimpa = !atual && !proximo && !projecaoAtiva;
  const tituloMusica = tituloAberturaM3MusicaAtiva(musicaAtiva?.titulo || '');
  const aberturaMusica =
    !slidePretoFinal &&
    !!musicaAtiva &&
    estrofeAtiva === 0 &&
    !!(tituloMusica || atual || proximo);
  const payload = {
    titulo: tituloMusica,
    atual: slidePretoFinal ? '' : atual,
    proximo: slidePretoFinal ? '' : proximo,
    aberturaMusica,
    projecaoAtiva,
    telaLimpa,
    slidePretoFinal,
  };
  let assinatura = null;
  try {
    assinatura = JSON.stringify(payload);
  } catch (_) {
  // intencional — erro ignorado
}
  if (assinatura !== null && assinatura === lyraAssinaturaEmitMinistrante) return;
  lyraAssinaturaEmitMinistrante = assinatura;
  projecao.enviar('exibir_ministrante', payload);
}

function configurarObserverPreviewMinistrante() {
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (!opA || !opP) return;
  let timer = null;
  const agenda = () => {
    clearTimeout(timer);
    timer = setTimeout(() => emitirEstadoMinistranteAoServidor(), 40);
  };
  const obs = new MutationObserver(() => agenda());
  /* Só estrutura/texto — `attributes` disparava ao ajustar `font-size` nas prévias e
     reemitia `exibir_ministrante` sem mudança real de letra (ciclo de repintura). */
  obs.observe(opA, { childList: true, subtree: true, characterData: true });
  obs.observe(opP, { childList: true, subtree: true, characterData: true });
}

/**
 * As instruções vêm sempre como título + lista de ideias (uma por item), a partir de
 * uma única fonte de texto. No modo slides — onde vivem num balão que só abre ao pedido
 * — saem como lista, uma ideia por linha. Nos outros modos continuam em linha corrida
 * separada por «·», como sempre estiveram na faixa inferior.
 */
function renderInstrucoesProjecao(titulo, itens) {
  const dock = document.getElementById('slides-projecao-instrucoes');
  if (!dock) return;
  if (!itens || !itens.length) {
    dock.innerHTML = titulo || '';
    return;
  }
  if (ehModoSlidesOperador()) {
    const lis = itens.map((t) => `<li>${t}</li>`).join('');
    dock.innerHTML =
      (titulo ? `<div class="slides-instr-tit">${titulo}</div>` : '') +
      `<ul class="slides-instr-lista">${lis}</ul>`;
    return;
  }
  dock.innerHTML = [titulo, ...itens].filter(Boolean).join(' · ');
}

/** Texto da faixa central — também quando só a grelha de slides atualiza (ex.: edição em tempo real). */
function atualizarSlidesInstrucoes() {
  const kb = (t) => `<kbd class="slides-dock-kbd">${t}</kbd>`;
  const atalhosProjecao = [
    `${kb('←')} ${kb('→')} navegam entre os slides`,
    `${kb('ESC')} limpa as telas e desmarca a música (fecha a faixa)`,
    `${kb('F10')} alterna o blackout`,
  ];
  if (ehModoBibliaOperador() && !ehModoSlidesOperador()) {
    renderInstrucoesProjecao('');
    return;
  }
  if (!musicaAtiva || !musicaAtiva.estrofes) {
    if (ehModoSlidesOperador()) {
      renderInstrucoesProjecao('<strong>Modo slides</strong>', [
        'Escolher uma música na playlist só a carrega — não projeta',
        '<strong>Duplo clique na música</strong> começa a projetar na 1.ª estrofe',
        'Na faixa, duplo clique no chip muda o slide',
      ]);
    } else {
      renderInstrucoesProjecao('<strong>Modo controlador</strong>', [
        'A playlist só prepara a música, sem enviar às telas',
        'Na coluna central, <strong>clique</strong> seleciona o slide',
        'Botão ✎ ou clique direito: edição rápida',
      ]);
    }
    return;
  }
  if (ehModoSlidesOperador() && !faixaSlidesHabilitadaPorPlaylistNoModoSlides) {
    renderInstrucoesProjecao('<strong>Modo slides</strong>', [
      'Toque numa música <strong>na playlist à esquerda</strong> para mostrar os slides aqui',
      'Clique carrega; duplo clique projeta',
      'Música aberta só pelo banco (modo completo) não preenche esta faixa',
    ]);
    return;
  }
  const n = musicaAtiva.estrofes.length;
  if (modoEdicaoEstrofes) {
    renderInstrucoesProjecao(`<strong>Edição</strong> — ${n} slide(s)`, [
      '<strong>Linha vazia</strong> (Enter duplo, sem carácter no meio) cria outro slide na hora',
      'Linha com <strong>um espaço</strong> mantém tudo no mesmo slide',
      '<strong>Encerrar edição</strong> descarta as alterações',
      '<strong>Salvar</strong> grava e sai do modo edição',
      'Arrastar <strong>⋮⋮</strong> reordena os slides',
      'Último cartão = preto',
    ]);
  } else if (ehModoSlidesOperador()) {
    renderInstrucoesProjecao(
      `<strong>${n} slide(s)</strong>`,
      projecaoMusicaEmitidaNoServidor
        ? [
            'Com projeção ativa, <strong>um clique</strong> num chip envia esse slide às telas',
            'Último chip = preto',
            ...atalhosProjecao,
          ]
        : [
            '<strong>Duplo clique na música na playlist</strong> inicia na 1.ª estrofe',
            'Na faixa, <strong>clique</strong> apenas seleciona',
            '<strong>Duplo clique</strong> no chip projeta',
            'Último chip = preto',
            ...atalhosProjecao,
          ]
    );
  } else {
    renderInstrucoesProjecao(`<strong>${n} estrofe(s)</strong>`, [
      'Coluna central: <strong>clique</strong> seleciona o slide',
      'Botão direito no chip abre a edição rápida',
      'Último chip = preto',
      '<strong>Próxima música</strong> carrega a seguinte da playlist',
      ...atalhosProjecao,
    ]);
  }
}

/**
 * Zoom da faixa: à vista, mas inerte enquanto não há slides para dimensionar.
 *
 * Esconder os botões seria mais limpo e pior: o operador deixaria de saber que o controlo
 * existe. Não exibir diz «existe, ainda não serve para nada» — que é a verdade do estado
 * ocioso. Fica no mesmo grupo que «Próxima música», que já seguia esta regra.
 *
 * @param {boolean} inertes
 */
function definirControlosZoomFaixaSlidesInertes(inertes) {
  ['slides-zoom-menos', 'slides-zoom-mais'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!inertes;
  });
  const grupo = document.querySelector('.slides-dock-zoom-group');
  if (grupo) grupo.classList.toggle('slides-dock-zoom-group--inerte', !!inertes);
}

/**
 * Mensagem no vão da faixa quando ainda não há slides.
 *
 * Sem ela, o modo slides abre com uma área grande e vazia que parece falha de
 * carregamento. Diz só «playlist» de propósito: no modo slides, carregar do banco à
 * esquerda não arma a faixa — mandá-lo lá seria mandá-lo a lado nenhum.
 *
 * @param {boolean} mostrar
 */
function definirVazioDaFaixaSlidesVisivel(mostrar) {
  const el = document.getElementById('slides-grid-vazio');
  if (el) el.hidden = !mostrar;
}

/** Nome na barra da faixa de slides — texto e dica saem sempre juntos daqui. */
function definirNomeMusicaBarraSlides(el, titulo) {
  el.textContent = titulo;
  const artistaEl = document.getElementById('slides-musica-artista');
  if (artistaEl) artistaEl.textContent = titulo ? (musicaAtiva?.artista || 'Sem artista') : '';
  if (titulo) el.dataset.dica = titulo;
  else delete el.dataset.dica;
}

function renderSlidesStrip() {
  const dock = document.getElementById('slides-dock');
  const grid = document.getElementById('slides-grid');
  const nomeEl = document.getElementById('slides-musica-nome');
  if (grid) grid.dataset.slidesCols = String(slidesGrelha.getSlidesPorLinha());

  try {
  if (ehModoApresentacaoOperador()) {
    dock.classList.add('oculto');
    document.body.classList.remove('slides-rail-aberto');
    return;
  }

  const semMusicaCarregada = !musicaAtiva || !musicaAtiva.estrofes;

  /*
   * Esconder a faixa inteira só se vale para fora do modo slides.
   *
   * Antes, `!musicaAtiva` bastava para esconder — e como este ramo corre primeiro, ao
   * abrir o modo slides o painel aparecia sem barra nenhuma: duas prévias pretas a
   * flutuar no meio do ecrã, sem nada a dizer que falta escolher uma música. O ramo
   * seguinte, que mostra a barra vazia, nunca era alcançado.
   */
  if ((ehModoBibliaOperador() || semMusicaCarregada) && !ehModoSlidesOperador()) {
    dock.classList.add('oculto');
    grid.innerHTML = '';
    grid.style.zoom = '';
    delete grid.dataset.stripMusicaId;
    delete grid.dataset.stripEstrofeCount;
    delete grid.dataset.stripDigest;
    delete grid.dataset.stripProjecao;
    atualizarSlidesInstrucoes();
    document.body.classList.remove('slides-rail-aberto');
    return;
  }

  /**
   * Modo slides ocioso: barra à vista, grelha vazia.
   *
   * Dois caminhos chegam aqui — abrir o modo sem música nenhuma carregada, e música
   * vinda só do banco (modo completo), que não preenche a faixa ao alternar de modo.
   * Assim que a playlist arma uma música, o comportamento volta a ser o de sempre.
   */
  if (ehModoSlidesOperador() && (semMusicaCarregada || !faixaSlidesHabilitadaPorPlaylistNoModoSlides)) {
    dock.classList.toggle('oculto', false);
    if (nomeEl) definirNomeMusicaBarraSlides(nomeEl, '');
    grid.innerHTML = '';
    grid.style.zoom = '';
    delete grid.dataset.stripMusicaId;
    delete grid.dataset.stripEstrofeCount;
    delete grid.dataset.stripDigest;
    delete grid.dataset.stripProjecao;
    document.body.classList.remove('slides-rail-aberto');
    const btnNx = document.getElementById('btn-proxima-musica-playlist');
    if (btnNx) btnNx.disabled = true;
    definirControlosZoomFaixaSlidesInertes(true);
    definirVazioDaFaixaSlidesVisivel(true);
    atualizarSlidesInstrucoes();
    queueMicrotask(() => ajustarEncaixeGrelhaSlidesModoSlides());
    return;
  }

  /* Home + letra completa: a faixa não é o destino. Não montar chips. */
  if (modoLetraCompletaCentral && !ehModoSlidesOperador()) {
    dock.classList.add('oculto');
    document.body.classList.remove('slides-rail-aberto');
    atualizarSlidesInstrucoes();
    return;
  }

  definirControlosZoomFaixaSlidesInertes(false);
  definirVazioDaFaixaSlidesVisivel(false);

  if (podeAtualizarSomenteAtivoFaixaSlides()) {
    if (nomeEl) definirNomeMusicaBarraSlides(nomeEl, musicaAtiva.titulo || '');
    atualizarSomenteAtivoFaixaSlides();
    dock.classList.toggle('oculto', !ehModoSlidesOperador());
    document.body.classList.toggle(
      'slides-rail-aberto',
      ehModoSlidesOperador() && !!musicaAtiva && !slidesRailUserRecolhido
    );
    atualizarEstadoBtnProximaMusicaPlaylist();
    atualizarSlidesInstrucoes();
    return;
  }

  if (nomeEl) definirNomeMusicaBarraSlides(nomeEl, musicaAtiva.titulo || '');

  /* 1º frame com a fonte CSS; o auto-fit dos snippets corre depois, em lotes. */
  if (grid.style.visibility === 'hidden') grid.style.visibility = '';
  grid.innerHTML = '';
  const nEst = musicaAtiva.estrofes.length;
  const idxSlidePreto = nEst;

  musicaAtiva.estrofes.forEach((estrofe, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'slide-chip' + (estrofeAtiva === i ? ' ativo' : '');
    chip.dataset.i = String(i);
    chip.setAttribute('aria-current', estrofeAtiva === i ? 'true' : 'false');
    chip.innerHTML = `
      <span class="slide-num">${i + 1}</span>
      <span class="slide-snippet">${textoSlideSnippetHtmlParaChip(estrofe)}</span>
    `;
    chip.onclick = (ev) => {
      ev.preventDefault();
      /* Sem projeção: 1 clique só seleciona. Com projeção ativa: 1 clique troca o slide no ar.
         Nos dois casos a grelha rola como rolaria com as setas. */
      if (projecaoMusicaEmitidaNoServidor) {
        projetarPorDuploCliqueCentral(i, { rolarComoNasSetas: true });
        return;
      }
      exibirEstrofe(i);
    };
    /* Duplo clique só para iniciar a projeção — com ela já no ar, o clique único basta. */
    if (!projecaoMusicaEmitidaNoServidor) {
      chip.addEventListener('dblclick', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        projetarPorDuploCliqueCentral(i);
      });
    }
    chip.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      abrirMenuContextoSlideStrip(ev.clientX, ev.clientY, i);
    });
    grid.appendChild(chip);
  });

  const chipPreto = document.createElement('button');
  chipPreto.type = 'button';
  chipPreto.className = 'slide-chip slide-chip--preto' + (estrofeAtiva === idxSlidePreto ? ' ativo' : '');
  chipPreto.dataset.i = String(idxSlidePreto);
  chipPreto.innerHTML = '';
  chipPreto.setAttribute('aria-label', 'Slide preto');
  chipPreto.setAttribute('aria-current', estrofeAtiva === idxSlidePreto ? 'true' : 'false');
  chipPreto.onclick = (ev) => {
    ev.preventDefault();
    if (projecaoMusicaEmitidaNoServidor) {
      projetarPorDuploCliqueCentral(idxSlidePreto, { rolarComoNasSetas: true });
      return;
    }
    exibirEstrofe(idxSlidePreto);
  };
  if (!projecaoMusicaEmitidaNoServidor) {
    chipPreto.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      projetarPorDuploCliqueCentral(idxSlidePreto);
    });
  }
  grid.appendChild(chipPreto);

  /** Faixa inferior de slides existe apenas no modo slides. */
  dock.classList.toggle('oculto', !ehModoSlidesOperador());
  document.body.classList.toggle(
    'slides-rail-aberto',
    ehModoSlidesOperador() && !!musicaAtiva && !slidesRailUserRecolhido
  );

  const btnNx = document.getElementById('btn-proxima-musica-playlist');
  if (btnNx) {
    atualizarEstadoBtnProximaMusicaPlaylist();
  }

  atualizarSlidesInstrucoes();
  grid.dataset.stripMusicaId = String(musicaAtiva.id ?? '');
  grid.dataset.stripEstrofeCount = String(nEst);
  grid.dataset.stripDigest = digestEstrofesParaStripFaixa(musicaAtiva.estrofes);
  grid.dataset.stripProjecao = projecaoMusicaEmitidaNoServidor ? '1' : '0';
  queueMicrotask(() => ajustarEncaixeGrelhaSlidesModoSlides());
  } finally {
    try {
      atualizarNotaSlideControladorUI();
    } catch (_) {
  // intencional — erro ignorado
}
  }
}

let slideQuickEditIndex = null;

const menuContextoSlideStrip = criarMenuFlutuante({
  id: 'slides-strip-context-menu',
  rotuloAria: 'Ações do slide',
});

function fecharMenuContextoSlideStrip() {
  menuContextoSlideStrip.fechar();
}

function abrirMenuContextoSlideStrip(clientX, clientY, slideIndex) {
  if (!(slideIndex >= 0)) return;
  menuContextoSlideStrip.abrirNoPonto(clientX, clientY, {
    itens: [
      {
        rotulo: 'Edição rápida deste slide…',
        svg: SVG_MENU_EDITAR,
        aoEscolher: () => abrirSlideQuickEditModal(slideIndex),
      },
    ],
  });
}

function fecharSlideQuickEditModal() {
  const bd = document.getElementById('slide-quick-edit-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
    bd.classList.remove('slide-quick-edit--arrastavel');
  }
  slideQuickEditIndex = null;
  const projRow = document.getElementById('slide-quick-edit-proj-row');
  if (projRow) projRow.hidden = true;
  resetarPosicaoDialogQuickEdit();
}

/** Limpa posição fixa do diálogo (volta ao centro do flex no próximo abrir). */
function resetarPosicaoDialogQuickEdit() {
  const dialog = document.querySelector('#slide-quick-edit-backdrop .slide-quick-edit-dialog');
  if (!dialog) return;
  dialog.style.position = '';
  dialog.style.left = '';
  dialog.style.top = '';
  dialog.style.width = '';
  dialog.style.margin = '';
  dialog.style.maxWidth = '';
}

/**
 * Índice 0-based do slide no telão (ou `estrofes.length` = tela preta).
 * Independente do slide aberto no modal de edição rápida.
 */
function indiceEstrofeProjetadaNoTelao() {
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes)) return null;
  if (!projecaoMusicaEmitidaNoServidor) return null;
  const e = estadoServidor;
  if (!e || e.tipo !== 'musica') return null;
  if (e.musicaId != null && musicaAtiva.id != null && Number(e.musicaId) !== Number(musicaAtiva.id)) {
    return null;
  }
  if (e.slidePretoFinal) return musicaAtiva.estrofes.length;
  const idx = Number(e.estrofeIndex);
  return Number.isFinite(idx) ? idx : null;
}

/** Atualiza o rodapé «Slide projetado» / PRÓXIMO SLIDE do modal de edição rápida (só modo Slide). */
function atualizarUiProjecaoQuickEdit() {
  const row = document.getElementById('slide-quick-edit-proj-row');
  const status = document.getElementById('slide-quick-edit-proj-status');
  const btn = document.getElementById('slide-quick-edit-next-proj');
  if (!row || !status || !btn) return;
  const emSlide = ehModoSlidesOperador();
  row.hidden = !emSlide;
  if (!emSlide) return;
  const nEst = musicaAtiva?.estrofes?.length ?? 0;
  const idx = indiceEstrofeProjetadaNoTelao();
  if (idx == null || nEst <= 0) {
    status.textContent = 'Slide projetado: —';
    btn.disabled = true;
    return;
  }
  const idxMaxPreto = nEst;
  if (idx >= idxMaxPreto) {
    status.textContent = 'Slide projetado: tela preta';
    btn.disabled = true;
    return;
  }
  status.textContent = `Slide projetado: ${idx + 1}`;
  btn.disabled = false;
}

/**
 * Avança só a projeção no telão. Não fecha o modal nem troca o slide em edição.
 */
function avancarProjecaoDoQuickEdit() {
  if (!ehModoSlidesOperador()) return;
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes) || !musicaAtiva.estrofes.length) return;
  if (!projecao.pronta() || !projecaoMusicaEmitidaNoServidor) return;
  const idxMaxPreto = musicaAtiva.estrofes.length;
  const base = indiceEstrofeProjetadaNoTelao();
  if (base == null || !Number.isFinite(base)) return;
  const prox = Math.min(idxMaxPreto, base + 1);
  if (prox === base) {
    atualizarUiProjecaoQuickEdit();
    return;
  }
  /* Só emite ao telão — sem `exibirEstrofe`, para não alterar seleção nem o texto do modal. */
  emitirEstrofeAoServidor(prox);
  atualizarUiProjecaoQuickEdit();
}

function abrirSlideQuickEditModal(slideIndex) {
  if (!musicaAtiva || slideIndex < 0 || slideIndex >= musicaAtiva.estrofes.length) return;
  fecharMenuContextoSlideStrip();
  slideQuickEditIndex = slideIndex;
  document.getElementById('slide-quick-edit-num').textContent = String(slideIndex + 1);
  document.getElementById('slide-quick-edit-ta').value = musicaAtiva.estrofes[slideIndex] ?? '';
  const bd = document.getElementById('slide-quick-edit-backdrop');
  resetarPosicaoDialogQuickEdit();
  bd.classList.toggle('slide-quick-edit--arrastavel', ehModoSlidesOperador());
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
  atualizarUiProjecaoQuickEdit();
  setTimeout(() => {
    const ta = document.getElementById('slide-quick-edit-ta');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, 50);
}

async function confirmarSlideQuickEdit() {
  const idx = slideQuickEditIndex;
  if (idx === null || !musicaAtiva) return;
  const ta = document.getElementById('slide-quick-edit-ta');
  aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idx, ta.value, { emitSocket: true });
  fecharSlideQuickEditModal();
  await persistirMusicaAtivaNoServidor();
}

function fecharSlideDeleteConfirmModal() {
  const delBd = document.getElementById('slide-delete-confirm-backdrop');
  if (delBd) {
    delBd.hidden = true;
    delBd.setAttribute('aria-hidden', 'true');
  }
}

function abrirSlideDeleteConfirmModal() {
  const idx = slideQuickEditIndex;
  if (idx === null || !musicaAtiva) return;
  const nEl = document.getElementById('slide-delete-confirm-num');
  if (nEl) nEl.textContent = String(idx + 1);
  const delBd = document.getElementById('slide-delete-confirm-backdrop');
  if (!delBd) return;
  delBd.hidden = false;
  delBd.setAttribute('aria-hidden', 'false');
}

async function executarExclusaoSlideConfirmada() {
  const idx = slideQuickEditIndex;
  if (idx === null || !musicaAtiva) return;
  if (musicaAtiva.estrofes.length <= 1) {
    alert('É necessário pelo menos uma estrofe.');
    fecharSlideDeleteConfirmModal();
    return;
  }

  musicaAtiva.estrofes.splice(idx, 1);
  if (estrofeAtiva === idx) estrofeAtiva = Math.max(0, idx - 1);
  else if (estrofeAtiva > idx) estrofeAtiva--;

  if (estrofeAtiva >= musicaAtiva.estrofes.length) {
    estrofeAtiva = musicaAtiva.estrofes.length - 1;
  }

  fecharSlideDeleteConfirmModal();
  fecharSlideQuickEditModal();
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();

  if (
    projecaoMusicaEmitidaNoServidor &&
    projecao.pronta() &&
    musicaAtiva &&
    estrofeAtiva >= 0
  ) {
    emitirEstrofeAoServidor(estrofeAtiva);
  }

  await persistirMusicaAtivaNoServidor();
}

function excluirSlideEdicaoRapida() {
  const idx = slideQuickEditIndex;
  if (idx === null || !musicaAtiva) return;
  if (musicaAtiva.estrofes.length <= 1) {
    alert('É necessário pelo menos uma estrofe.');
    return;
  }
  abrirSlideDeleteConfirmModal();
}

function setupSlidesStripContextMenuEEdicaoRapida() {
  const bd = document.getElementById('slide-quick-edit-backdrop');
  document.getElementById('slide-quick-edit-cancel')?.addEventListener('click', () => fecharSlideQuickEditModal());
  document.getElementById('slide-quick-edit-save')?.addEventListener('click', () => confirmarSlideQuickEdit());
  document.getElementById('slide-quick-edit-delete')?.addEventListener('click', () => excluirSlideEdicaoRapida());
  document.getElementById('slide-quick-edit-next-proj')?.addEventListener('click', () => avancarProjecaoDoQuickEdit());
  /**
   * Só fecha ao clicar «no escuro»: mousedown + mouseup no próprio backdrop.
   * Sem isto, arrastar seleção da textarea para fora termina no backdrop — o navegador
   * sintetiza click no backdrop e fecha o modal inadvertidamente.
   */
  let slideQuickBackdropPointerDown = false;
  bd?.addEventListener('pointerdown', (e) => {
    slideQuickBackdropPointerDown = e.target === bd;
  });
  bd?.addEventListener('pointerup', (e) => {
    if (slideQuickBackdropPointerDown && e.target === bd) fecharSlideQuickEditModal();
    slideQuickBackdropPointerDown = false;
  });
  bd?.addEventListener('pointercancel', () => {
    slideQuickBackdropPointerDown = false;
  });
  document.getElementById('slide-delete-confirm-cancel')?.addEventListener('click', () => fecharSlideDeleteConfirmModal());
  document.getElementById('slide-delete-confirm-excluir')?.addEventListener('click', () => executarExclusaoSlideConfirmada());
  configurarArrasteDialogQuickEdit();
}

/**
 * Arrastar o modal de edição rápida pelo título — só no modo Slide.
 * Textarea, botões e restante do conteúdo não iniciam o arraste.
 */
function configurarArrasteDialogQuickEdit() {
  const heading = document.getElementById('slide-quick-edit-heading');
  const dialog = document.querySelector('#slide-quick-edit-backdrop .slide-quick-edit-dialog');
  if (!heading || !dialog) return;

  let arrasto = null;

  function clampar(left, top) {
    const pad = 8;
    const w = dialog.offsetWidth;
    const h = dialog.offsetHeight;
    const maxL = Math.max(pad, window.innerWidth - w - pad);
    const maxT = Math.max(pad, window.innerHeight - h - pad);
    return {
      left: Math.min(Math.max(pad, left), maxL),
      top: Math.min(Math.max(pad, top), maxT),
    };
  }

  heading.addEventListener('pointerdown', (e) => {
    if (!ehModoSlidesOperador()) return;
    if (e.button != null && e.button !== 0) return;
    const bd = document.getElementById('slide-quick-edit-backdrop');
    if (!bd || bd.hidden || !bd.classList.contains('slide-quick-edit--arrastavel')) return;
    e.preventDefault();
    const rect = dialog.getBoundingClientRect();
    dialog.style.position = 'fixed';
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.width = `${rect.width}px`;
    dialog.style.maxWidth = 'none';
    dialog.style.margin = '0';
    arrasto = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    };
    try {
      heading.setPointerCapture(e.pointerId);
    } catch (_) {
      // intencional — captura opcional
    }
  });

  heading.addEventListener('pointermove', (e) => {
    if (!arrasto || e.pointerId !== arrasto.pointerId) return;
    const pos = clampar(
      arrasto.origLeft + (e.clientX - arrasto.startX),
      arrasto.origTop + (e.clientY - arrasto.startY)
    );
    dialog.style.left = `${pos.left}px`;
    dialog.style.top = `${pos.top}px`;
  });

  const encerrar = (e) => {
    if (!arrasto) return;
    if (e && e.pointerId != null && e.pointerId !== arrasto.pointerId) return;
    arrasto = null;
  };
  heading.addEventListener('pointerup', encerrar);
  heading.addEventListener('pointercancel', encerrar);
}

function marcacaoEstrofeEditor() {
  document.querySelectorAll('.estrofe-slide-edit').forEach((el, i) => {
    el.classList.toggle('ativa', estrofeAtiva === i);
  });
}

function metadadosMusicaEditaveisNaHome() {
  return !!musicaAtiva && musicaBancoFonte !== 'catalog';
}

function tituloMusicaEditavelNaHome() {
  return metadadosMusicaEditaveisNaHome();
}

function metadadosMusicaSujosNaHome() {
  if (!metadadosMusicaEditaveisNaHome()) return false;
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (!et || !ea) return false;
  return et.value !== String(musicaAtiva?.titulo || '') || ea.value !== String(musicaAtiva?.artista || '');
}

/**
 * Barra de ações central («menu padrão») — SECÇÃO A: itens que dependem só de
 * `musicaAtiva` / `modoEdicaoEstrofes` / `modoLetraCompletaCentral` / `modoComparativoCentral`.
 *
 * Regra geral do menu padrão (mesma barra nos dois modos, Grade/Slide e Letra
 * Completa — ver `atualizarToolbarModoLetraCompleta`, `atualizarToolbarModoComparativo`
 * e `atualizarBotoesSalvarCancelarBarraPadrao`): trocar de modo NUNCA esconde ou troca
 * o conjunto de botões — só habilita/desabilita os que não fazem sentido no estado
 * atual. A única exceção continua a ser «Editar tag» / «Apagar esta versão», que somem
 * (e não apenas desabilitam) quando não há cópia/versão selecionada — isso é uma
 * questão de qual versão está ativa, não de qual modo a barra está.
 */
function atualizarToolbarModoEdicao() {
  const m = !!musicaAtiva;
  const ed = modoEdicaoEstrofes;
  const full = modoLetraCompletaCentral;
  const comp = modoComparativoCentral;
  /* Setas de navegação e Sair continuam disponíveis também no modo Letra Completa —
     o utilizador quer poder controlar a projeção enquanto edita a letra inteira.
     Só a edição por estrofes e o modo comparativo (telas de edição exclusivas,
     sem projeção visível por trás) escondem esse grupo. */
  const emModoEdicaoVisual = ed || comp;
  /* «Criar nova versão» deixou de ser um botão desta barra — passou a ser o chip
     «Nova versão» na barra de versões (renderMusicaVersoesBar). */
  const metadadosEditaveis = metadadosMusicaEditaveisNaHome();
  const tituloEditavel = tituloMusicaEditavelNaHome();
  document.getElementById('btn-editar-letra').style.display = m ? '' : 'none';
  document.getElementById('btn-editar-letra').disabled = !m || full;
  document.getElementById('btn-nova-estrofe').style.display = m ? '' : 'none';
  document.getElementById('btn-nova-estrofe').disabled = !m || !ed;
  const bAnt = document.getElementById('btn-seta-anterior');
  const bProx = document.getElementById('btn-seta-proxima');
  const bSair = document.getElementById('btn-sair-projecao');
  /* Navegar/encerrar só faz sentido com música carregada — sem o `m` estas
     ficavam visíveis sobre o placeholder «Escolha uma música…». */
  const mostrarNavegacaoProjecao = m && !emModoEdicaoVisual;
  if (bAnt) bAnt.style.display = mostrarNavegacaoProjecao ? '' : 'none';
  if (bProx) bProx.style.display = mostrarNavegacaoProjecao ? '' : 'none';
  if (bSair) bSair.style.display = mostrarNavegacaoProjecao ? '' : 'none';
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (et) {
    et.disabled = !tituloEditavel;
    et.readOnly = !tituloEditavel;
    et.title = '';
  }
  if (ea) {
    ea.disabled = !metadadosEditaveis;
    ea.readOnly = !metadadosEditaveis;
  }

  /* Ações contextuais da cópia (Editar tag / Apagar esta versão): só aparecem
     quando há uma cópia selecionada (não ORIGINAL) — somem, não ficam
     desabilitadas por isso. Isso vale nos dois modos da barra padrão (Grade/Slide
     e Letra Completa) igualmente, mesmo durante a edição por estrofes — só o
     modo comparativo (tela de edição exclusiva, sem a versão selecionada à
     vista) as desabilita: a versão selecionada não muda, só não é hora de
     mexer nela por cima do comparativo. */
  const copiaSel = versaoCopiaSelecionadaAtual();
  const mostrarAcoesCopia = !!copiaSel;
  const btnEditarNome = document.getElementById('btn-editar-nome-versao');
  const btnApagarCopia = document.getElementById('btn-apagar-copia-versao');
  if (btnEditarNome) {
    btnEditarNome.style.display = mostrarAcoesCopia ? '' : 'none';
    btnEditarNome.disabled = !mostrarAcoesCopia || comp;
  }
  if (btnApagarCopia) {
    btnApagarCopia.style.display = mostrarAcoesCopia ? '' : 'none';
    btnApagarCopia.disabled = !mostrarAcoesCopia || comp;
  }
  const sep1 = document.getElementById('toolbar-sep-1');
  if (sep1) sep1.style.display = mostrarAcoesCopia ? '' : 'none';

  atualizarToolbarCaixaLetrasEdicao();
  atualizarToolbarAdicionarPlaylistHome();

  /* Sem música a linha fica sem nenhum botão: esconder remove também a
     divisória que ela desenha por baixo dos campos de título/artista. */
  document
    .getElementById('centro-toolbar-acoes')
    ?.classList.toggle('centro-toolbar-acoes--sem-musica', !m);

  atualizarToolbarModoLetraCompleta();
  atualizarToolbarModoComparativo();
  /* Por último: «Salvar alterações» e «Cancelar» dependem do resultado de todos
     os outros — cada um decide, pelo sub-modo activo, o que salvar/descartar. */
  atualizarBotoesSalvarCancelarBarraPadrao();
  homeLayout?.update({
    ...estadoFaixaEdicaoHome(),
    key: musicaAtiva ? `${musicaBancoFonte}:${musicaAtiva.id}:${musicaVersaoLocalId || ''}` : '',
    title: musicaAtiva?.titulo, artist: musicaAtiva?.artista,
    slides: musicaAtiva?.estrofes?.length || 0,
    metadataEditable: metadadosEditaveis, full, comparison: comp,
    editing: ed || full || comp,
  });
}

/** Estado que decide a faixa de edição da Home (recalculado também a cada tecla). */
function estadoFaixaEdicaoHome() {
  return {
    full: modoLetraCompletaCentral,
    comparison: modoComparativoCentral,
    dirty: temEdicaoMusicaNaoGravada(),
    // Na letra completa/comparativo a faixa só vale com texto alterado (dirty).
    editingSlides: modoEdicaoEstrofes && !modoLetraCompletaCentral && !modoComparativoCentral,
    editingFull: modoLetraCompletaCentral && letraCompletaEditando && !modoComparativoCentral,
    // Nome da cópia/versão selecionada (null no Original, que não é renomeável).
    versionName: versaoCopiaSelecionadaAtual()?.rotulo ?? null,
  };
}

/**
 * Renomeia a cópia/versão selecionada a partir do campo do cabeçalho (modo Editar).
 * Mesmas regras do diálogo «Renomear versão»: nome vazio não grava, nome repetido avisa
 * e não grava. Devolve true quando o nome foi gravado.
 */
async function renomearVersaoSelecionadaComNome(nomeBruto) {
  const c = versaoCopiaSelecionadaAtual();
  const nome = String(nomeBruto ?? '').trim();
  if (!c || !nome || nome === String(c.rotulo || '').trim()) return false;
  if (c.tipo === 'local') {
    if (nomeVersaoJaUsadoNaMusica(c.rootId, nome, c.id)) {
      await appAlert(`Já existe uma versão chamada «${nome}» nesta música. Escolha um nome diferente.`, 'Nome de versão repetido');
      return false;
    }
    const up = atualizarCopiaLocal(c.rootId, c.id, { rotulo: nome });
    if (!up.ok) {
      await appAlert(up.erro || 'Não foi possível renomear a versão local.');
      return false;
    }
    atualizarRotuloVersaoNasPlaylists(c.rootId, c.id, nome);
    renderMusicaVersoesBar();
    renderPlaylist();
    return true;
  }
  const idNum = parseInt(c.id, 10);
  if (!Number.isFinite(idNum)) return false;
  try {
    const url = `${getControllerApiBase()}/api/musicas/${idNum}/rotulo`;
    const opts = { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotulo: nome }) };
    let res = await fetch(url, { method: 'PATCH', ...opts });
    if (res.status === 404) res = await fetch(url, { method: 'POST', ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.codigo === ERRO_ROTULO_DUPLICADO_API) await appAlert(data.erro, 'Nome de versão repetido');
      else await appAlert(data.erro || `Não foi possível renomear (HTTP ${res.status}).`);
      return false;
    }
    await concluirRenomearVersaoServidor(c.rootId, c.id, idNum, String(data.rotulo || nome).trim());
    return true;
  } catch (e) {
    await appAlert(e?.message || 'Não foi possível renomear a versão.');
    return false;
  }
}

// (extraído) letra completa → painel/letraCompleta.js

// (extraído) modo comparativo → painel/comparativoVersoes.js

/** Botão «Editar letra»: no comparativo, sai dele primeiro. */
async function acionarEditarLetraBarraPadrao() {
  if (!musicaAtiva) return;
  if (!(await sairModoComparativoParaTrocarModo())) return;
  if (homeLayout?.isHome() && modoLetraCompletaCentral) {
    // Na letra completa, «Editar» só libera o texto para edição (continua na letra completa).
    if (!letraCompletaEditando) {
      letraCompletaEditando = true;
      atualizarToolbarModoEdicao();
      document.getElementById('centro-letra-completa-ta')?.focus();
    }
    return;
  }
  if (homeLayout?.isHome()) {
    // Na Home «Editar letra» abre a edição por slides (antigo botão do lápis).
    if (modoEdicaoEstrofes) return;
    if (!(await confirmarProsseguirDescartandoEdicaoPendente())) return;
  }
  entrarModoEdicao();
}

/** Sai do modo sem gravar nada — o que foi digitado nas colunas é descartado. */
async function cancelarModoComparativoCentral() {
  if (!modoComparativoCentral) return;
  if (comparativoSujoVsSnapshot()) {
    const ok = await appConfirm(
      'Descartar as alterações feitas nesta comparação?',
      'Modo comparativo'
    );
    if (!ok) return;
  }
  fecharModoComparativo();
}

/**
 * Botão «Modo comparativo» na barra padrão.
 *
 * Fica visível sempre que há música (nunca some — ver a regra geral no topo de
 * `atualizarToolbarModoEdicao`), e desabilitado quando não é possível abrir
 * (catálogo, sem versões) ou quando já está aberto — reabrir por cima de si
 * mesmo não faz sentido; para sair usa-se «Salvar alterações» ou «Cancelar»
 * da própria barra padrão. Pode ser aberto tanto durante a edição por
 * estrofes quanto durante a letra completa — `abrirModoComparativo` já pede
 * confirmação antes de descartar o que estiver pendente em qualquer um dos
 * dois (via `confirmarProsseguirDescartandoEdicaoPendente`).
 */
function atualizarToolbarModoComparativo() {
  const btn = document.getElementById('btn-modo-comparativo');
  const on = modoComparativoCentral;
  const m = !!musicaAtiva;
  const podeAbrir = m && musicaBancoFonte !== 'catalog';

  if (!btn) return;
  btn.style.display = m ? '' : 'none';
  /* Aberto, o botão é o toggle de saída — nunca pode ficar preso desabilitado. */
  btn.disabled = !m || (!on && !podeAbrir);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('ativo', on);
  btn.title = on
    ? 'Sai do modo comparativo (pede confirmação se houver alterações não gravadas)'
    : 'Abrir duas versões lado a lado e destacar as diferenças';
}

/**
 * «Salvar alterações» e «Cancelar» da barra padrão — um único par de botões
 * reaproveitado pelos três sub-modos de edição (estrofes, letra completa,
 * comparativo) e pela edição solta de título/artista, em vez de um par por
 * sub-modo. Cada um decide, pelo sub-modo activo no momento do clique, qual
 * função já existente chamar — nenhuma delas muda de comportamento.
 */

/**
 * «Salvar alterações»: habilitado só quando há alteração concreta e ainda não
 * gravada — nunca só por estar num sub-modo de edição. `temEdicaoMusicaNaoGravada`
 * já compara o conteúdo actual com o snapshot de quando o sub-modo abriu (não a
 * simples presença de um `<textarea>` focado), por isso digitar e depois desfazer
 * até voltar ao texto original mantém o botão desabilitado.
 *
 * «Cancelar» segue o mesmo critério — precisa de alteração pendente de facto,
 * não só de estar num sub-modo — EXCETO na edição por estrofes (Grade/Slide):
 * esse sub-modo não tem nenhum outro botão para sair dele (a Letra Completa
 * tem o próprio botão «Grade/Slide»; o Comparativo satura o «Comparativo» já
 * aberto), então «Cancelar» precisa ficar habilitado assim que o usuário
 * clica em «Editar letra», mesmo sem ter digitado nada ainda, só para poder
 * sair do modo edição.
 */
function atualizarBotoesSalvarCancelarBarraPadrao() {
  const m = !!musicaAtiva;
  const emSubModoEdicao = modoEdicaoEstrofes || modoLetraCompletaCentral || modoComparativoCentral;
  const temAlteracaoPendente = temEdicaoMusicaNaoGravada();
  const btnSalvar = document.getElementById('btn-salvar-musica');
  if (btnSalvar) {
    btnSalvar.style.display = m ? '' : 'none';
    btnSalvar.disabled = !m || !temAlteracaoPendente;
  }
  const btnCancelar = document.getElementById('btn-cancelar-padrao');
  if (btnCancelar) {
    btnCancelar.style.display = m ? '' : 'none';
    btnCancelar.disabled =
      !m || (!emSubModoEdicao && !homeLayout?.metadataOpen()) ||
      (!modoEdicaoEstrofes && !temAlteracaoPendente && !homeLayout?.isHome());
  }
  // Cada edição passa por aqui: mantém a faixa da Home em dia sem recalcular o resto.
  homeLayout?.updateStrip?.(estadoFaixaEdicaoHome());
}

/**
 * Grava o que estiver pendente no sub-modo activo no momento do clique.
 * Reaproveita, sem alterar, a função de gravação própria de cada sub-modo —
 * inclusive o tratamento do catálogo (letra completa grava só na sessão;
 * estrofes/metadados bloqueiam com aviso; comparativo grava por versão e
 * bifurca o ORIGINAL quando necessário).
 */
async function acionarSalvarAlteracoesBarraPadrao() {
  if (!musicaAtiva) return;
  if (modoComparativoCentral) {
    if (!comparativoSujoVsSnapshot()) return;
    const ok = await salvarComparativoNoServidor();
    if (ok) fecharModoComparativo();
    return;
  }
  if (modoLetraCompletaCentral) {
    if (!letraCompletaSujaVsSnapshot() && !metadadosMusicaSujosNaHome()) return;
    // Mesmo caminho do antigo botão «Modo letra completa» quando clicado já activo.
    await alternarModoLetraCompletaCentral();
    return;
  }
  // Cobre tanto a edição por estrofes quanto título/artista sozinhos.
  await salvarMusicaServidor();
}

/**
 * Descarta o que estiver pendente no sub-modo activo no momento do clique.
 * Cada sub-modo mantém o seu próprio destino/confirmação de sempre — só a
 * posição do botão na barra é que passou a ser uma só. Na Letra Completa,
 * «Cancelar» só desfaz a digitação (`descartarEdicaoLetraCompletaSemSair`) e
 * permanece na Letra Completa — trocar de tela é só o botão «Grade/Slide».
 */
async function acionarCancelarBarraPadrao() {
  if (modoComparativoCentral) {
    await cancelarModoComparativoCentral();
    return;
  }
  if (modoLetraCompletaCentral) {
    descartarEdicaoLetraCompletaSemSair();
    if (homeLayout?.isHome()) {
      // Cancelar volta à visualização da letra completa (não à grade) e restaura título/artista.
      letraCompletaEditando = false;
      const et = document.getElementById('edit-titulo');
      const ea = document.getElementById('edit-artista');
      if (et) et.value = musicaAtiva?.titulo || '';
      if (ea) ea.value = musicaAtiva?.artista || '';
      atualizarToolbarModoEdicao();
    }
    return;
  }
  if (modoEdicaoEstrofes) {
    await sairModoEdicao();
    return;
  }
  if (homeLayout?.isHome() && homeLayout.metadataOpen()) {
    document.getElementById('edit-titulo').value = musicaAtiva?.titulo || '';
    document.getElementById('edit-artista').value = musicaAtiva?.artista || '';
    homeLayout.closeMetadata();
    atualizarToolbarModoEdicao();
  }
}

/** Caixa das letras — habilitada só no modo edição (slides ou letra completa), mas
 *  sempre visível na barra padrão, como os demais itens (ver nota no topo de
 *  `atualizarToolbarModoEdicao`). */
function atualizarToolbarCaixaLetrasEdicao() {
  const btn = document.getElementById('btn-caixa-letras-edicao');
  const sep = document.getElementById('toolbar-sep-caixa-letras');
  const m = !!musicaAtiva;
  const habilitado = m && (modoEdicaoEstrofes || modoLetraCompletaCentral);
  /* aA fica sempre no fim da fila de ações; o «|» separa das ações à esquerda. */
  if (sep) sep.style.display = m ? '' : 'none';
  if (!btn) return;
  btn.style.display = m ? '' : 'none';
  btn.disabled = !habilitado;
  btn.classList.toggle('ativo', !!caixaLetrasEdicaoMaiuscula);
  btn.setAttribute('aria-pressed', caixaLetrasEdicaoMaiuscula ? 'true' : 'false');
  // Habilitado só ao editar a letra (por slides ou letra completa): explica o motivo quando apagado.
  const tituloCaixa = !habilitado
    ? 'Caixa das letras: disponível ao editar a letra (clique em «Editar letra» ou use a visualização em lista)'
    : caixaLetrasEdicaoMaiuscula
      ? 'Caixa: MAIÚSCULAS (clique para 1.ª maiúscula + resto minúsculas)'
      : 'Caixa: 1.ª maiúscula + resto minúsculas (clique para MAIÚSCULAS)';
  btn.title = tituloCaixa;
  btn.setAttribute('aria-label', tituloCaixa);
}

/**
 * «Adicionar à playlist» (HOME), ao lado do aA: visível sempre que há música
 * ativa, como o próprio aA (ver `atualizarToolbarCaixaLetrasEdicao` acima) —
 * não depende do sub-modo (Grade/Slide, Letra Completa ou Comparativo).
 */
function atualizarToolbarAdicionarPlaylistHome() {
  const btn = document.getElementById('btn-adicionar-playlist-home');
  const sep = document.getElementById('toolbar-sep-playlist');
  const m = !!musicaAtiva;
  if (sep) sep.style.display = m ? '' : 'none';
  if (!btn) return;
  btn.style.display = m ? '' : 'none';
  btn.disabled = !m;
}

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

/* ─── Modo «projetar nesta máquina» ─────────────────────────────────────────────
 *
 * O painel não muda: os mesmos comandos, pela mesma porta de projeção. O que muda é o
 * transporte por baixo dela — IPC para o motor deste processo, em vez de socket para o
 * Servidor. Nenhum call site sabe em qual dos dois está, que era o propósito da Peça 1.
 *
 * OBS e celular continuam a ligar-se à 5510, agora servida pelo Controlador. Quem impede
 * dois donos das mesmas telas é o próprio `listen`: com o Servidor aberto, a porta está
 * ocupada e o modo local recusa arrancar.
 */

/**
 * O modo de operação NÃO se guarda. Vive na sessão e morre com ela.
 *
 * Ligar ao Servidor é uma decisão sobre *este arranque*, não uma declaração permanente
 * sobre o PC. Quem opera duas máquinas hoje pode estar sozinho com uma amanhã, e um
 * Controlador que abrisse a apontar para um Servidor ausente ficava preso num
 * «conectando» sem nada projetável — para desfazer isso era preciso saber que existia um
 * menu que o desfazia. O padrão é o que funciona sempre: projeta-se nesta máquina.
 *
 * Por isso não há chave de preferência, nem em `localStorage`, nem em ficheiro de
 * configuração, nem em base de dados. A ligação ao Servidor é sempre um acto explícito do
 * operador — no badge ou em Ajustes › Conexão — repetido a cada abertura.
 *
 * Nota sobre `LS_IP_KEY`: o *endereço* pode ficar guardado (preferência «Lembrar IP»),
 * e isso não contradiz o acima. Guardar o IP poupa redigitação; não liga nada sozinho.
 * Quem decide ligar é o clique. Sem «Lembrar IP», o campo limpa-se no próximo arranque.
 *
 * A chave `lyra_projetar_nesta_maquina`, de versões que persistiam a escolha, é apagada no
 * arranque por `migrarChavesLegadoLocalStorage` — ver `CHAVES_OBSOLETAS` nesse módulo.
 */

/** Verdadeiro entre o clique no menu e a resposta do processo principal. */
let projecaoLocalEmCurso = false;

/**
 * Verdadeiro enquanto o motor local está mesmo de pé.
 *
 * Distinto da *intenção* de estar em modo local, e a distinção não é académica: enquanto o
 * modo local se derivava da intenção declarada, uma tentativa falhada — porta ocupada
 * porque o Servidor está aberto — deixava o painel a acreditar que projetava localmente.
 * E aí recusava-se a ligar ao Servidor, porque «está em modo local», e não projetava,
 * porque não está. Ficava preso entre os dois.
 */
let projecaoLocalActiva = false;

/**
 * Motor que toca o áudio quando a projeção corre nesta máquina.
 *
 * Criado só quando há ponte (dentro do aplicativo) e ligado só no modo local — no remoto
 * quem toca é a janela de controle do Servidor, e dois motores a tocar dariam eco.
 */
let motorAudioLocal = null;

function garantirMotorAudioLocal() {
  const ponte = ponteProjecaoLocal();
  if (!ponte?.audio) return null;
  if (!motorAudioLocal) motorAudioLocal = criarMotorAudioLocal(ponte.audio);
  return motorAudioLocal;
}

/**
 * O painel está — ou está a ficar — em modo local?
 *
 * Serve de guarda ao auto-reconectar e à resolução do endereço da projeção. Cobre a
 * janela entre o clique e o arranque (`emCurso`) e o período em que o motor está de facto
 * a correr (`activa`) — nunca a mera intenção gravada.
 */
function emModoProjecaoLocal() {
  return projecaoLocalEmCurso || projecaoLocalActiva;
}

/** A ponte só existe dentro do Electron; no browser o modo local não se aplica. */
function ponteProjecaoLocal() {
  return window.lyraElectron?.projecaoLocal || null;
}

/**
 * Liga o modo local e aponta a porta de projeção ao motor deste processo.
 *
 * @returns {Promise<{ ok: boolean, erro?: string }>}
 */
async function ligarProjecaoNestaMaquina() {
  const ponte = ponteProjecaoLocal();
  if (!ponte) return { ok: false, erro: 'modo local indisponível fora do aplicativo' };

  setStatusServidorRemoto('ocioso');
  /* `projecaoLocalEmCurso` bloqueia o auto-reconectar enquanto isto decorre: abrir as
     janelas de projeção rouba o foco, o foco dispara `tentarAutoConectarSeDesconectado`,
     e o painel ia atrás de um Servidor no meio do arranque do modo local. */
  projecaoLocalEmCurso = true;
  let r;
  try {
    r = await ponte.ligar();
  } catch (e) {
    r = { ok: false, erro: e?.message || String(e) };
  } finally {
    projecaoLocalEmCurso = false;
  }
  if (!r?.ok) {
    projecaoLocalActiva = false;
    setStatusServidorRemoto('ocioso');
    atualizarUiConexao(false);
    return r || { ok: false, erro: 'falha desconhecida' };
  }
  projecaoLocalActiva = true;

  /* Desligar o socket antes de trocar de transporte: um Servidor ainda ligado continuaria
     a mandar `estado` para o painel e a disputar as telas com o motor local. */
  try {
    if (socket) socket.disconnect();
  } catch (_) {
    // intencional
  }

  projecao.usarTransporte(criarTransporteLocal(ponte));
  garantirMotorAudioLocal()?.ligar();
  /* Nada se grava aqui: o modo local é o padrão de todo arranque, e um padrão não precisa
     de ser lembrado. */
  papelControladorLocal = { primario: true, podeEscrever: true, donoAtual: null };
  setStatusServidorRemoto('ocioso');
  atualizarUiConexao(true);
  if (r.lanIp) {
    servidorLanIpObs = String(r.lanIp).trim();
    atualizarUrlsObs();
  }
  recordarIpsDestaMaquina(r.lanIps, r.lanIp);

  /* O mesmo que o handler de `connect` do socket faz no modo remoto. Sem isto o painel
     ficava com os seletores de tela vazios: a carga do arranque corre antes de a 5510
     estar de pé, falha em silêncio, e no modo local não há evento de ligação a seguir
     que a repita. */
  try {
    await carregarRoteamentoTelasDoServidor();
    if (ehModoBibliaOperador()) bibliaAplicarCfgExibicao();
    else slidesAplicarCfgArmazenada();
    renderSlidesStrip();
    emitirEstadoMinistranteAoServidor();
  } catch (_) {
    // intencional — o modo local já está de pé; o painel recupera ao trocar de modo
  }
  return { ok: true };
}

/**
 * Desliga o modo local — só nesta sessão, como tudo o que diz respeito ao modo.
 *
 * Não escreve nada, e nenhum outro caminho escreve: o arranque seguinte volta sempre a
 * projetar nesta máquina, tenha ou não o operador desmarcado o item de menu antes de
 * fechar. Ver o bloco sobre persistência junto a `projecaoLocalEmCurso`.
 */
async function desligarProjecaoNestaMaquina() {
  const ponte = ponteProjecaoLocal();
  projecaoLocalActiva = false;
  motorAudioLocal?.desligar();
  if (ponte) await ponte.desligar();
  projecao.usarTransporte(null);
  atualizarUiConexao(false);
  /* O badge único descreve a ligação ao Servidor remoto; ao desligar a projeção local
     não há Servidor em jogo, então volta ao estado ocioso (cinza), sem soar a avaria. */
  setStatusServidorRemoto('ocioso');
}

/** Alterna o modo, para ligar a um botão ou item de menu. */
async function alternarProjecaoNestaMaquina() {
  const ponte = ponteProjecaoLocal();
  const estado = ponte ? await ponte.estado() : null;
  if (estado?.activa) return desligarProjecaoNestaMaquina();
  return ligarProjecaoNestaMaquina();
}

/** IP de LAN do servidor de projeção informado por ele (evento `server_info`); vazio até conectar. */
let servidorLanIpObs = '';
/** Porta do servidor HTTP das páginas de Browser Source do OBS (informada pelo servidor). */
let servidorObsPort = 5001;

/**
 * Atualiza os campos de URL de Browser Source (OBS) na aba «Conexão» dos Ajustes.
 * Host preferido: IP de LAN informado pelo servidor → IP usado para conectar → localhost.
 * O OBS pode rodar noutro PC, por isso `localhost` só serve como último recurso.
 */
function atualizarUrlsObs() {
  const host = servidorLanIpObs || getServidorIp() || 'localhost';
  const bib = document.getElementById('obs-url-biblia');
  const sli = document.getElementById('obs-url-slides');
  if (bib) bib.value = `http://${host}:${servidorObsPort}/obs/biblia`;
  if (sli) sli.value = `http://${host}:${servidorObsPort}/obs/slides`;
}

/**
 * Copia para a área de transferência a URL de Browser Source (OBS) do campo indicado
 * e dá um retorno visual rápido no botão.
 */
async function copiarUrlObs(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const url = input.value.trim();
  if (!url) return;
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      ok = true;
    }
  } catch (_) {
    // fallback abaixo
  }
  if (!ok) {
    try {
      input.focus();
      input.select();
      ok = document.execCommand('copy');
      input.setSelectionRange(0, 0);
      input.blur();
    } catch (_) {
      ok = false;
    }
  }
  if (btn) {
    const rotuloOriginal = btn.dataset.rotuloOriginal || btn.textContent;
    btn.dataset.rotuloOriginal = rotuloOriginal;
    btn.textContent = ok ? 'Copiado!' : 'Erro';
    btn.classList.toggle('success', ok);
    clearTimeout(btn._copiarTimer);
    btn._copiarTimer = setTimeout(() => {
      btn.textContent = btn.dataset.rotuloOriginal || 'Copiar';
      btn.classList.remove('success');
    }, 1400);
  }
}

async function carregarRoteamentoTelasDoServidor() {
  const ip = hostProjecao();
  if (!ip) return;
  try {
    const [rMon, rRoute] = await Promise.all([
      fetch(`http://${ip}:5510/api/monitores`),
      fetch(`http://${ip}:5510/api/display-routing`),
    ]);
    const mon = await rMon.json().catch(() => []);
    const route = await rRoute.json().catch(() => ({}));
    monitoresServidorCache = Array.isArray(mon) ? mon : [];
    let slidesSrv;
    let apSrv;
    if (route && route.version === 2 && route.slides && route.apresentacao) {
      slidesSrv = sanitizarRotaProjecao(route.slides, monitoresServidorCache);
      apSrv = sanitizarRotaProjecao(route.apresentacao, monitoresServidorCache);
    } else {
      const leg = sanitizarRotaProjecao(route || {}, monitoresServidorCache);
      slidesSrv = leg;
      apSrv = { publicoIndex: -1, ministranteIndex: -1, live: false };
    }

    /* A identidade manda sobre os índices: tanto os do servidor como os de
       `LS_ROTAS_POR_MODO` referem-se ao arranjo de monitores da sessão anterior, que é
       exactamente o que a renumeração do Windows corrompe. Ver `identidadeMonitores.js`.
       `apresentacao` fica de fora por ser rota de sessão, reposta a cada arranque.

       O seletor do modo Slides é só de sessão: a identidade ainda alimenta o pré-voo
       (avisos de monitor em falta), mas a rota em vigor não herda «Não exibir» nem a
       escolha da sessão anterior. Na primeira detecção (rota ainda virgem) aplica-se o
       padrão M2/M3; nas reconexões seguintes preserva-se o que o operador já escolheu. */
    const restSlides = rotaRestauradaPorIdentidade('slides', slidesSrv);
    const restCompleto = rotaRestauradaPorIdentidade('completo', rotasPorModo.completo);
    rotasPorModo.completo = restCompleto.rota;
    const faltou = [...restSlides.faltou, ...restCompleto.faltou];
    avisarMonitoresConfiguradosEmFalta(faltou);
    /* O pré-voo relata o mesmo, mas só quando o operador pergunta — a faixa do cabeçalho
       avisa na hora, e a lista da verificação recolhe-o junto do resto. */
    preVooMonitoresEmFalta = faltou;
    /* Apresentação primeiro: a reposição do Slides desvia-se do que a mídia já ocupa. */
    rotasPorModo.apresentacao = { ...apSrv };
    if (precisaReporRotaSlides(rotasPorModo.slides)) {
      rotasPorModo.slides = rotaSlidesReposta(
        rotasPorModo.slides,
        rotaSlidesAoEntrarNoModo()
      );
    }
    const mergedSrv = apSrv.live
      ? { publicoIndex: -1, ministranteIndex: -1, live: true }
      : {
          publicoIndex: apSrv.publicoIndex >= 0 ? apSrv.publicoIndex : slidesSrv.publicoIndex,
          ministranteIndex: apSrv.ministranteIndex >= 0 ? apSrv.ministranteIndex : slidesSrv.ministranteIndex,
          live: false,
        };
    const semSalvo =
      normalizarRota(rotasPorModo.completo).publicoIndex === -1 &&
      normalizarRota(rotasPorModo.completo).ministranteIndex === -1;
    if (semSalvo) {
      const padraoSlides = normalizarRota(rotasPorModo.slides);
      if (padraoSlides.publicoIndex >= 0 || padraoSlides.ministranteIndex >= 0) {
        rotasPorModo.completo = { ...padraoSlides };
        salvarRotasPorModoNoStorage();
      }
    }
    /**
     * Não sincronizar o modo atual para o servidor só por ligar o socket:
     * no modo slides com telão «Não exibir» (-1,-1) isso gravava -1 no PC servidor
     * e `garantirTelasAbertasParaProjecao` deixava de abrir janelas — só prévias no painel.
     */
    if (ehModoSlidesOperador()) {
      const s = normalizarRota(rotasPorModo.slides);
      if (s.publicoIndex < 0 && s.ministranteIndex < 0) {
        /* Só preenche se não for «Não exibir» manual nesta sessão. */
        if (precisaReporRotaSlides(s)) {
          rotasPorModo.slides = rotaSlidesAoEntrarNoModo();
          salvarRotasPorModoNoStorage();
        }
      }
    }
    await aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
    const modo = modoRoteamentoAtual();
    const rotaLocalModo = normalizarRota(rotasPorModo[modo]);
    const servidorSemMonitores =
      mergedSrv.publicoIndex < 0 && mergedSrv.ministranteIndex < 0 && !mergedSrv.live;
    const modoTemMonitores =
      rotaLocalModo.publicoIndex >= 0 ||
      rotaLocalModo.ministranteIndex >= 0 ||
      rotaLocalModo.live;
    if (servidorSemMonitores && modoTemMonitores) {
      await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
    }
  } catch (_) {
  // intencional — erro ignorado
}
}

/**
 * Os canais que o operador apagou NO SELETOR DO MODO EM QUE ESTÁ.
 *
 * É uma leitura do que está escolhido agora, recalculada a cada envio — não um estado que
 * fica pendurado. Só o modo em vigor a preenche: sair do Slides para a Bíblia devolve
 * `false` nos canais do Slides no envio seguinte, e vice-versa. Quem manda no que se vê é
 * sempre o modo em que o operador está.
 *
 * Os três seletores — o duplo do Slides e o unificado da Bíblia/Mídias/DOCS — alimentam a
 * MESMA ordem e a mesma mecânica no motor (`semExibicaoOrdenada` → lençol preto por cima
 * do conteúdo). O que difere é só a leitura do gesto, porque os seletores são diferentes;
 * ver `modules/ordemNaoExibirUnificado.js`.
 *
 * «Live — OBS» não é «apagar o monitor»: é mandar a saída para outro sítio. Fica de fora.
 *
 * @param {string} modo modo de roteamento em vigor (`modoRoteamentoAtual()`)
 */
function semExibicaoDoSeletorDoModo(modo) {
  const NENHUM = { publico: false, ministrante: false };
  if (modo === 'biblia' || modo === 'apresentacao' || modo === 'docs') {
    return ordemNaoExibirDoSeletorUnificado(modo, obterRotaApresentacaoParaServidor());
  }
  if (modo !== 'slides' && modo !== 'completo') return NENHUM;

  const enviada = normalizarRota(rotasPorModo.slides);
  if (enviada.live) return NENHUM;

  /*
   * A escolha do operador, ANTES dos ajustes automáticos.
   *
   * O −1 da ocupação pelas Mídias já não passa por aqui — vive só no pacote
   * (`rotaSlidesParaEnvioComApresentacao`) —, mas a distinção continua a ser a mesma e é
   * o que esta leitura protege: apagar o monitor é ordem do operador, não consequência de
   * a mídia lá estar. No modo Slides quem guarda a escolha à mão é `reposicaoRotaSlides`
   * (o mesmo registo que a reposição de rota já consulta); no modo completo,
   * `rotasPorModo.completo`.
   */
  const escolha =
    modo === 'slides'
      ? obterNaoExibirManualSlides()
      : (() => {
          const c = normalizarRota(rotasPorModo.completo);
          return { publico: c.publicoIndex < 0, ministrante: c.ministranteIndex < 0 };
        })();

  /* E só apaga o canal que de facto vai sair a −1: se o ajuste lhe deu um monitor, há
     conteúdo para mostrar e nada a apagar. */
  return {
    publico: !!escolha.publico && enviada.publicoIndex < 0,
    ministrante: !!escolha.ministrante && enviada.ministranteIndex < 0,
  };
}

async function salvarRoteamentoTelasNoServidor(opts = {}) {
  const usarValoresDaUi = opts.usarValoresDaUi !== false;
  const modo = modoRoteamentoAtual();
  /** 'publico' | 'ministrante' — a saída que o operador acabou de escolher, quando veio de um clique. */
  const canalEscolhido =
    opts.canalEscolhido === 'publico' || opts.canalEscolhido === 'ministrante'
      ? opts.canalEscolhido
      : null;

  const slidesAntes = normalizarRota(rotasPorModo.slides);

  if (usarValoresDaUi) {
    const fromUi = rotaSelecionadaNaUi();
    if (!fromUi) return;
    rotasPorModo[modo] = { ...normalizarRota(fromUi) };

    /* Rede de segurança da regra «um monitor, uma saída». O clique já libertou a outra
       saída; isto cobre um DOM fora de sincronia e deixa a regra escrita num sítio só. */
    if (modo === 'slides' || modo === 'completo') {
      rotasPorModo[modo] = rotaSemMonitorRepetido(rotasPorModo[modo], 'publico');
    }

    if (modo === 'slides') {
      /* Marca «Não exibir» manual a partir do clique — antes do ajuste por conflito com
         Mídias, que também escreve −1 e não pode contar como escolha do operador.
         E só para a saída que o clique mexeu: a rota vem do DOM com as duas, e o −1 que
         o outro seletor trazia é justamente o do conflito com as Mídias. */
      sincronizarNaoExibirManualSlidesDaEscolha(
        rotasPorModo.slides,
        canalEscolhido ? { publico: canalEscolhido === 'publico', ministrante: canalEscolhido === 'ministrante' } : null
      );
      rotasPorModo.slides = normalizarRota(rotasPorModo.slides);
    } else if (modo === 'completo') {
      rotasPorModo.slides = normalizarRota(rotasPorModo.completo);
    } else if (modo === 'apresentacao') {
      const a = normalizarRota(rotasPorModo.apresentacao);
      if (!a.live && a.publicoIndex < 0 && a.ministranteIndex < 0) {
        /*
         * «Não exibir» nas Mídias NÃO encerra a mídia.
         *
         * Encerrava: este ramo chamava `encerrarProjecaoMidiaApresentacaoNoControlador()`,
         * que pára o áudio, limpa `apresentacaoMidiaProjetadaId` e manda o servidor fechar
         * os canais. O vídeo morria a meio, o áudio calava-se, e voltar a exibir obrigava a
         * projetar tudo de novo — nada disto é «não exibir», é encerrar.
         *
         * Agora é o mesmo lençol preto do Slides: a projeção continua activa, o vídeo e o
         * áudio continuam, e o que muda é só o que se vê no monitor. Encerrar de verdade
         * continua a existir, no botão «Encerrar projeção» do cabeçalho
         * (`encerrarProjecaoMidiaCabecalhoModoApresentacao`) — que é um gesto diferente e
         * segue por um caminho automático, sem ordem de «Não exibir».
         *
         * A libertação do monitor mantém-se, e é outra pergunta: canais do Slides
         * desligados só por conflito voltam; «Não exibir» que o operador escolheu à mão no
         * Slides nesta sessão fica intocado.
         */
        restaurarRotaSlidesAposLibertarMonitores();
        try {
          atualizarFeedbackProjecaoApresentacaoUi();
        } catch (_) {
  // intencional — erro ignorado
}
      } else {
        /*
         * A ocupação do monitor pelas Mídias NÃO se escreve em `rotasPorModo.slides`.
         *
         * Era o que fazia o antigo `desfazerConflitoSlidesComRotaApresentacao`, e é a
         * armadilha que `modules/supressaoCanalSlides.js` já documentava para a Bíblia:
         * gravado, o «este monitor agora é das Mídias» deixa de se distinguir do «Não
         * exibir» que o operador escolheu, e o seletor do Slides fica a anunciar «Não
         * exibir» num monitor apenas emprestado — de M2 para M3 apagava o ministrante e
         * nada o repunha na troca seguinte. A ocupação é facto do momento e recalcula-se
         * a cada envio, em `rotaSlidesParaEnvioComApresentacao`, no pacote e só nele.
         *
         * Fica a reposição: uma rota que chegue a −1 por outra via (arranque, servidor)
         * continua a ser preenchida, e canais desligados à mão continuam intocados.
         */
        restaurarRotaSlidesAposLibertarMonitores();
      }
    } else if (modo === 'biblia') {
      /*
       * Atenção ao ler: este ramo só corre com `usarValoresDaUi === true`, ou seja, o
       * operador acabou de escolher um monitor. Adoptar a rota da mídia descarta essa
       * escolha — deliberado, porque Bíblia e Mídias partilham o canal `apresentacao` no
       * servidor e mover a rota fecharia as janelas da mídia que ainda está no ar.
       *
       * O que era bug: `hayProjecaoMidiaApresentacaoAtiva()` dava `true` para uma Bíblia
       * projetada só no público, sem mídia nenhuma — e então toda e qualquer troca de
       * monitor em modo Bíblia caía aqui e era descartada em silêncio.
       */
      if (hayProjecaoMidiaApresentacaoAtiva()) {
        /* Mídia no ar: canal `apresentacao` no servidor fica intocado. */
        rotasPorModo.biblia = { ...normalizarRota(rotasPorModo.apresentacao) };
      } else {
        rotasPorModo.apresentacao = { ...normalizarRota(rotasPorModo.biblia) };
        /*
         * A rota do modo Slides NÃO se toca aqui — mesmo princípio do ramo `apresentacao`
         * acima, que já tinha sido corrigido: cada modo manda na configuração dele.
         *
         * O canal do Slides continua a ter de ser silenciado enquanto a Bíblia manda. Sem
         * isso o merge do servidor (`a.publicoIndex >= 0 ? a : s`) deixa o índice antigo do
         * Slides passar por baixo, e com a Bíblia só no público o M3 abre com conteúdo de
         * slides em vez do escudo preto. Mas isso é uma decisão sobre o PACOTE que sai, e é
         * lá que passa a viver: `rotaSlidesParaEnvioComBiblia()`, ao montar o `payloadDual`.
         *
         * Aqui zerava-se `rotasPorModo.slides` para obter o mesmo efeito — e as quatro
         * condições (`>= 0` e `< 0`) cobriam todos os valores, portanto zerava sempre. O
         * `persistirIdentidadesDosModos()` logo abaixo gravava esse zero como escolha
         * explícita do operador, e `restaurarRotaPorIdentidade()` no arranque seguinte lia
         * `houveSalvo === false`: uma única ida ao Modo Bíblia apagava para sempre o telão
         * configurado do Modo Slides. Ver `modules/supressaoCanalSlides.js`.
         */
      }
    } else if (modo === 'docs') {
      /*
       * O DOCS também não tem canal próprio: espelha-se no `apresentacao`, como a Bíblia.
       * A rota do DOCS continua a ser só dele — partilhado é o canal do servidor, não a
       * escolha. Com mídia no ar o canal não se toca, senão fechavam-se as janelas do que
       * está a projetar.
       */
      if (hayProjecaoMidiaApresentacaoAtiva()) {
        rotasPorModo.docs = { ...normalizarRota(rotasPorModo.apresentacao) };
      } else {
        rotasPorModo.apresentacao = { ...normalizarRota(rotasPorModo.docs) };
      }
    }

    if (modo !== 'biblia' && modo !== 'apresentacao' && modo !== 'docs') {
      salvarRotasPorModoNoStorage();
    }
  }

  rotasPorModo.slides = sanitizarRotaProjecao(rotasPorModo.slides, monitoresServidorCache);
  rotasPorModo.apresentacao = sanitizarRotaProjecao(rotasPorModo.apresentacao, monitoresServidorCache);
  rotasPorModo.apresentacaoAviso = sanitizarRotaProjecao(
    rotasPorModo.apresentacaoAviso,
    monitoresServidorCache
  );
  rotasPorModo.contagem = sanitizarRotaProjecao(rotasPorModo.contagem, monitoresServidorCache);
  if (modo === 'biblia') {
    rotasPorModo.biblia = sanitizarRotaProjecao(rotasPorModo.biblia, monitoresServidorCache);
  }
  if (modo === 'docs') {
    rotasPorModo.docs = sanitizarRotaProjecao(rotasPorModo.docs, monitoresServidorCache);
  }

  /* Guardar QUAIS monitores ficaram em uso, não em que posição estavam — é isto que
     permite restaurar a configuração depois de o Windows renumerar os ecrãs. */
  persistirIdentidadesDosModos();
  avisarMonitoresConfiguradosEmFalta();

  const payloadDual = {
    version: 2,
    /* Com o Modo Bíblia a reclamar o canal partilhado, o canal do Slides sai silenciado —
       sem que a configuração guardada em `rotasPorModo.slides` mude, que é o que
       `persistirIdentidadesDosModos()` acabou de gravar. Ver `modules/supressaoCanalSlides.js`. */
    slides:
      modo === 'biblia'
        ? rotaSlidesParaEnvioComBiblia(rotasPorModo.biblia, rotasPorModo.slides)
        : /* Mesma ideia, para o monitor que as Mídias estão a ocupar: silencia-se o canal
             no pacote, sem tocar na configuração do operador. Ver o módulo. */
          rotaSlidesParaEnvioComApresentacao(
            obterRotaApresentacaoParaServidor(),
            rotasPorModo.slides
          ),
    apresentacao: obterRotaApresentacaoParaServidor(),
    /* Pin exclusivo: com Contagem no ar o motor mantém o monitor dela aberto mesmo que
       a Bíblia vá para o M2 ou Live. Sem Contagem no ar o pin vai a −1. */
    contagem: rotaContagemParaServidor(),
    /*
     * «Não exibir» do seletor do modo em vigor, dito ao motor como ordem e não como índice.
     *
     * O −1 sozinho não chegava: no motor os canais fundem-se (`apresentacao >= 0 ? ... : slides`,
     * e o pin do Contador ainda por cima), de modo que uma mídia ou uma contagem que ainda
     * reivindicasse o M2 mantinha a projecção acesa — enquanto a prévia, que olha para a rota
     * deste modo, apagava. Era o desencontro relatado: prévia preta, monitor físico aceso.
     *
     * Todos os modos com seletor a preenchem — Slides, Bíblia, Mídias e DOCS —, sempre a
     * partir de um clique. Sem clique vai `false`, e aí o −1 continua a ser o de sempre:
     * «este canal não reivindica monitor», deixando o outro assumir. São duas perguntas
     * diferentes e continuam independentes.
     */
    semExibicaoOrdenada: semExibicaoDoSeletorDoModo(modo),
  };
  if (
    !Number.isFinite(payloadDual.slides.publicoIndex) ||
    !Number.isFinite(payloadDual.slides.ministranteIndex) ||
    !Number.isFinite(payloadDual.apresentacao.publicoIndex) ||
    !Number.isFinite(payloadDual.apresentacao.ministranteIndex)
  ) {
    return;
  }

  const ip = hostProjecao();
  if (!ip) {
    try {
      aplicarPreviewPainelOcultoNoDom();
    } catch (_) {
  // intencional — erro ignorado
}
    return;
  }
  try {
    await fetch(`http://${ip}:5510/api/display-routing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadDual),
    });
    if (modo === 'biblia') {
      marcarRotaBibliaSincronizada();
      bibliaAplicarCfgExibicao();
    }
    /* Same latch as the Bible: the key is the route the server accepted. A failed
       PUT leaves it unchanged, so the next docs page tries again. A monitor change
       that already saved also lands here, and the following pages then skip. */
    if (modo === 'docs') {
      marcarRotaDocsSincronizada();
    }
    if (projecao.pronta() && modo === 'slides') {
      const pubDepois = normalizarRota(rotasPorModo.slides).publicoIndex;
      const publicoFoiAtivadoAgora = slidesAntes.publicoIndex < 0 && pubDepois >= 0;
      if (publicoFoiAtivadoAgora) {
        if (musicaAtiva && Number.isFinite(estrofeAtiva) && estrofeAtiva >= 0) {
          emitirEstrofeAoServidor(estrofeAtiva);
        }
      }
    }
  } catch (_) {
  // intencional — erro ignorado
}
  try {
    aplicarPreviewPainelOcultoNoDom();
    atualizarPreviewOperador();
  } catch (_) {
  // intencional — erro ignorado
}
}

/**
 * Ocultar prévia quando não há saída física naquele canal (após unir slide ∪ apresentação no servidor).
 * Modo slide: cartões sempre visíveis — tela preta no conteúdo quando o monitor está desativado ou sem projeção.
 * Modo completo / apresentação: usa rota efetiva — ex.: apresentação «Não exibir» com slide em M2+M3 mostra as duas prévias.
 * [0] = público / telão, [1] = ministrante / retorno.
 */
function obterFlagsOcultarPreviewPorSincroniaModoSlides() {
  if (ehModoSlidesOperador()) {
    return [false, false];
  }
  if (ehModoBibliaOperador()) {
    const r = normalizarRota(rotasPorModo.biblia);
    if (r.live) return [true, true];
    const pubOn = r.publicoIndex >= 0;
    const minOn = r.ministranteIndex >= 0;
    if (!pubOn && !minOn) return [false, false];
    return [!pubOn, !minOn];
  }
  const eff = indicesEfetivosRoteamentoDualCliente();
  if (eff.live) return [true, true];
  const pubOn = eff.publicoIndex >= 0;
  const minOn = eff.ministranteIndex >= 0;
  if (!pubOn && !minOn) return [true, true];
  return [!pubOn, !minOn];
}

/** Conteúdo na saída real do M2 que deve manter a prévia visível no modo Slides. */
function hayConteudoExternoQueForcaPreviaPublicaModoSlide() {
  if (!ehModoSlidesOperador()) return false;
  const cls = classificarSaidaMonitorPublicoSlides();
  return cls.mode === 'badge' || cls.mode === 'slides' || cls.mode === 'blackout';
}

/**
 * Conteúdo na saída real do M3 que deve manter a prévia TV visível no modo Slides.
 */
function hayConteudoExternoQueForcaPreviaMinistranteModoSlide() {
  if (!ehModoSlidesOperador()) return false;
  const cls = classificarSaidaMonitorMinistranteSlides();
  return cls.mode === 'badge' || cls.mode === 'slides' || cls.mode === 'blackout';
}

function carregarPreviewPainelOcultoDoArmazenamento() {
  try {
    const raw = localStorage.getItem(LS_PREVIEW_PAINEL_OCULTO);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (Array.isArray(p) && p.length >= 2) previewPainelOcultoLocal = [!!p[0], !!p[1]];
  } catch (_) {
  // intencional — erro ignorado
}
}

function persistirPreviewPainelOcultoLocal() {
  try {
    localStorage.setItem(LS_PREVIEW_PAINEL_OCULTO, JSON.stringify(previewPainelOcultoLocal));
  } catch (_) {
  // intencional — erro ignorado
}
}

let lyraPreviewPainelOcultoDomCache = null;

function aplicarPreviewPainelOcultoNoDom() {
  const syncBase = obterFlagsOcultarPreviewPorSincroniaModoSlides();
  const desbloqPub = hayConteudoExternoQueForcaPreviaPublicaModoSlide();
  const desbloqMin = hayConteudoExternoQueForcaPreviaMinistranteModoSlide();
  const syncEfetivo = [
    !!(syncBase[0] && !desbloqPub),
    !!(syncBase[1] && !desbloqMin),
  ];
  const eff = [
    !!(previewPainelOcultoLocal[0] || syncEfetivo[0]),
    !!(previewPainelOcultoLocal[1] || syncEfetivo[1]),
  ];
  const visCount = eff.filter((o) => !o).length;
  let assinaturaDom = null;
  try {
    assinaturaDom = JSON.stringify({ eff, visCount, desbloqPub, desbloqMin, syncBase });
  } catch (_) {
  // intencional — erro ignorado
}
  if (assinaturaDom !== null && assinaturaDom === lyraPreviewPainelOcultoDomCache) return;
  lyraPreviewPainelOcultoDomCache = assinaturaDom;
  const stack = document.querySelector('#layout-musicas .centro-col-preview-stack');
  const items = document.querySelectorAll('#layout-musicas .centro-col-preview-stack .preview-stack-item');
  items.forEach((el, i) => {
    el.classList.remove('preview-stack-item--painel-oculto', 'preview-stack-item--destaque-solo');
    const oculto = !!eff[i];
    if (oculto) el.classList.add('preview-stack-item--painel-oculto');
    if (!oculto && visCount === 1) el.classList.add('preview-stack-item--destaque-solo');
    // O card TELÃO/PÚBLICO fica dentro de .preview-telao-col — o colapso precisa alcançar o
    // wrapper (o operador não tem wrapper: closest() devolve null e nada acontece).
    const wrapTelao = el.closest('.preview-telao-col');
    if (wrapTelao) wrapTelao.classList.toggle('preview-telao-col--painel-oculto', oculto);
  });
  // Todas as prévias ocultas → encolher o container para não sobrar faixa vazia.
  if (stack) stack.classList.toggle('centro-col-preview-stack--tudo-oculto', visCount === 0);
  [0, 1].forEach((i) => {
    const btn = document.getElementById(`btn-toggle-preview-${i}`);
    if (!btn) return;
    const oculto = !!eff[i];
    const desbloq = i === 0 ? desbloqPub : desbloqMin;
    const syncForca = !!(syncBase[i] && !desbloq);
    btn.disabled = syncForca;
    btn.innerHTML = oculto ? SVG_OLHO_CORTADO : SVG_OLHO_ABERTO;
    btn.setAttribute('aria-pressed', oculto ? 'true' : 'false');
    if (syncForca) {
      const modoAp = ehModoApresentacaoOperador();
      btn.title =
        i === 0
          ? modoAp
            ? 'No modo apresentação, esta prévia fica oculta porque o destino não inclui o monitor público.'
            : 'No modo slide, esta prévia fica oculta enquanto o Público estiver em «Não exibir» (escolha um monitor em Público para voltar a ver).'
          : modoAp
            ? 'No modo apresentação, esta prévia fica oculta porque o destino não inclui o monitor ministrante.'
            : 'No modo slide, esta prévia fica oculta enquanto o Ministrante estiver em «Não exibir» (escolha um monitor em Ministrante para voltar a ver).';
    } else if (desbloq && syncBase[i]) {
      btn.title =
        i === 0
          ? 'Prévia visível: há conteúdo no telão público (ex.: apresentação). Pode ocultar só neste painel.'
          : 'Prévia visível: há conteúdo na TV ministrante. Pode ocultar só neste painel.';
    } else {
      btn.title = oculto
        ? 'Mostrar esta pré-visualização no painel (só aqui — não altera os monitores)'
        : 'Ocultar esta pré-visualização só neste painel';
    }
  });
}

function alternarOcultacaoPreviewPainel(indice) {
  const i = Number(indice);
  if (i !== 0 && i !== 1) return;
  previewPainelOcultoLocal[i] = !previewPainelOcultoLocal[i];
  persistirPreviewPainelOcultoLocal();
  aplicarPreviewPainelOcultoNoDom();
}

let letrasPreviewPathPendente = '';
let letrasPreviewCatalogIdPendente = null;
let letrasPreviewUserIdPendente = null;
let letrasPreviewOfflineOrigem = 'catalog';
let letrasPreviewFontePendente = 'cifraclub';
let letrasPreviewMaxLinhasPorSlide = 4;
let letrasPreviewReqSeq = 0;
/** Estrofes exibidas no modal — usadas para montar o clipboard com linhas em branco entre trechos. */
let letrasPreviewPartesAtuais = [];

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

function fontePreviewUsaEstruturaDoBanco() {
  return letrasPreviewFontePendente === 'lyra-online' || letrasPreviewFontePendente === 'banco-local';
}

function configurarSelectLinhasPreviewLetras() {
  const sel = document.getElementById('letras-preview-max-linhas');
  if (!sel) return;
  const usaBanco = fontePreviewUsaEstruturaDoBanco();
  const optBanco = sel.querySelector('option[value="banco"]');
  const opt4 = sel.querySelector('option[value="4"]');
  if (optBanco) {
    optBanco.hidden = !usaBanco;
    optBanco.disabled = !usaBanco;
  }
  if (opt4) opt4.textContent = usaBanco ? '4 linhas' : '4 linhas (padrão)';
  sel.value = usaBanco ? 'banco' : '4';
}

function lerMaxLinhasPreviewLetras() {
  const raw = String(document.getElementById('letras-preview-max-linhas')?.value || '').trim();
  if (raw === 'banco') return 'banco';
  const n = parseInt(raw, 10);
  if (n === 2 || n === 3 || n === 4) return n;
  return fontePreviewUsaEstruturaDoBanco() ? 'banco' : 4;
}

function rotuloModoLinhasPreview(valor) {
  return valor === 'banco' ? 'padrão do banco' : `${valor} linha(s)/slide`;
}

function modalPreviewLetrasEstaAberto() {
  const bd = document.getElementById('letras-preview-backdrop');
  return !!bd && !bd.hidden;
}

/** Enquanto o modal está aberto, bloqueia seleção no resto da página. */
function definirIsolamentoSelecaoPreviewLetras(ativo) {
  document.documentElement.classList.toggle('letras-preview-aberto', !!ativo);
}

/** Ctrl+A no modal: só os blocos de letra (`.letras-preview-pre`), não a interface atrás. */
function selecionarTodoTextoPreviewLetras() {
  const scroll = document.getElementById('letras-preview-scroll');
  if (!scroll) return;
  const blocos = scroll.querySelectorAll('.letras-preview-pre');
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  if (!blocos.length) {
    const msg = scroll.querySelector('.placeholder-msg');
    if (!msg) return;
    const range = document.createRange();
    range.selectNodeContents(msg);
    sel.addRange(range);
    return;
  }
  const range = document.createRange();
  range.setStart(blocos[0], 0);
  const ultimo = blocos[blocos.length - 1];
  range.setEnd(ultimo, ultimo.childNodes.length);
  sel.addRange(range);
}

function selecaoPreviewLetrasIntersectaNo(sel, node) {
  if (!sel?.rangeCount) return false;
  const r = sel.getRangeAt(0);
  const nr = document.createRange();
  nr.selectNodeContents(node);
  return r.compareBoundaryPoints(Range.END_TO_START, nr) > 0 && r.compareBoundaryPoints(Range.START_TO_END, nr) < 0;
}

/** Recorta o trecho de um `<pre>` que cai dentro da seleção actual. */
function textoPrePreviewLetrasNaSelecao(pre, sel) {
  const selRange = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(pre);
  const range = document.createRange();
  range.selectNodeContents(pre);
  if (selRange.compareBoundaryPoints(Range.START_TO_START, preRange) > 0) {
    range.setStart(selRange.startContainer, selRange.startOffset);
  }
  if (selRange.compareBoundaryPoints(Range.END_TO_END, preRange) < 0) {
    range.setEnd(selRange.endContainer, selRange.endOffset);
  }
  return range.toString();
}

function selecaoPreviewLetrasDentroDoScroll(scroll, sel) {
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  const anc = range.commonAncestorContainer;
  const el = anc.nodeType === Node.TEXT_NODE ? anc.parentElement : anc;
  return !!el && scroll.contains(el);
}

/**
 * Ao copiar vários trechos, o espaço visual entre blocos é só CSS — o clipboard
 * vinha sem linha em branco. Junta cada `.letras-preview-pre` com `\n\n`.
 * @returns {string|null} texto formatado ou `null` para deixar o navegador copiar
 */
function textoCopiaPreviewLetrasComEspacosEntreTrechos(scroll) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return null;
  if (!selecaoPreviewLetrasDentroDoScroll(scroll, sel)) return null;

  const pres = [...scroll.querySelectorAll('.letras-preview-pre')];
  if (pres.length < 2) return null;

  const intersecting = pres.filter((pre) => selecaoPreviewLetrasIntersectaNo(sel, pre));
  if (intersecting.length < 2) return null;

  const selRange = sel.getRangeAt(0);
  if (
    intersecting.length === pres.length &&
    letrasPreviewPartesAtuais.length === pres.length &&
    pres.every((pre) => {
      const preRange = document.createRange();
      preRange.selectNodeContents(pre);
      return (
        selRange.compareBoundaryPoints(Range.START_TO_START, preRange) <= 0 &&
        selRange.compareBoundaryPoints(Range.END_TO_END, preRange) >= 0
      );
    })
  ) {
    return letrasPreviewPartesAtuais.join('\n\n');
  }

  const partes = intersecting.map((pre) => {
    const preRange = document.createRange();
    preRange.selectNodeContents(pre);
    const inteiro =
      selRange.compareBoundaryPoints(Range.START_TO_START, preRange) <= 0 &&
      selRange.compareBoundaryPoints(Range.END_TO_END, preRange) >= 0;
    return inteiro ? pre.textContent || '' : textoPrePreviewLetrasNaSelecao(pre, sel);
  });
  return partes.join('\n\n');
}

function tratarCopiaPreviewLetras(e) {
  if (!modalPreviewLetrasEstaAberto()) return;
  const scroll = document.getElementById('letras-preview-scroll');
  if (!scroll) return;
  const texto = textoCopiaPreviewLetrasComEspacosEntreTrechos(scroll);
  if (texto === null) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', texto);
}

function fecharModalPreviewLetras() {
  const bd = document.getElementById('letras-preview-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  definirIsolamentoSelecaoPreviewLetras(false);
  letrasPreviewPathPendente = '';
  letrasPreviewCatalogIdPendente = null;
  letrasPreviewUserIdPendente = null;
  letrasPreviewOfflineOrigem = 'catalog';
  letrasPreviewFontePendente = 'cifraclub';
  letrasPreviewPartesAtuais = [];
}

async function abrirModalPreviewLetras(path, fonte) {
  letrasPreviewCatalogIdPendente = null;
  letrasPreviewUserIdPendente = null;
  letrasPreviewPathPendente = path || '';
  letrasPreviewFontePendente = normalizarFonteLetrasSite(fonte || 'cifraclub');
  const btnImp = document.getElementById('letras-preview-import');
  if (btnImp) btnImp.textContent = 'Importar esta versão';
  configurarSelectLinhasPreviewLetras();
  const bd = document.getElementById('letras-preview-backdrop');
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
  definirIsolamentoSelecaoPreviewLetras(true);
  await carregarPreviewLetrasNoModal();
}

async function abrirModalPreviewLetrasOffline(id, origem) {
  const idNum = typeof id === 'number' ? id : parseInt(String(id), 10);
  if (!Number.isFinite(idNum)) return;
  const orig = origem === 'user' ? 'user' : 'catalog';
  letrasPreviewPathPendente = '';
  letrasPreviewCatalogIdPendente = orig === 'catalog' ? idNum : null;
  letrasPreviewUserIdPendente = orig === 'user' ? idNum : null;
  letrasPreviewOfflineOrigem = orig;
  letrasPreviewFontePendente = 'banco-local';
  configurarSelectLinhasPreviewLetras();
  const bd = document.getElementById('letras-preview-backdrop');
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
  definirIsolamentoSelecaoPreviewLetras(true);
  const btnImp = document.getElementById('letras-preview-import');
  if (btnImp) btnImp.textContent = orig === 'user' ? 'Usar esta música' : 'Importar para o banco';
  await carregarPreviewLetrasNoModal();
}

async function carregarPreviewLetrasNoModal() {
  const scroll = document.getElementById('letras-preview-scroll');
  const meta = document.getElementById('letras-preview-meta');
  const btnImp = document.getElementById('letras-preview-import');
  const path = letrasPreviewPathPendente;
  const catalogId = letrasPreviewCatalogIdPendente;
  const userId = letrasPreviewUserIdPendente;
  letrasPreviewMaxLinhasPorSlide = lerMaxLinhasPreviewLetras();
  const reqId = ++letrasPreviewReqSeq;
  scroll.innerHTML = '<div class="placeholder-msg">Carregando a letra…</div>';
  meta.textContent = '';
  if (btnImp) btnImp.disabled = true;
  try {
    let res;
    if (letrasPreviewFontePendente === 'banco-local' && (catalogId != null || userId != null)) {
      const origem = letrasPreviewOfflineOrigem === 'user' ? 'user' : 'catalog';
      const idPreview = origem === 'user' ? userId : catalogId;
      const paramLinhas = `&maxLinhas=${encodeURIComponent(String(letrasPreviewMaxLinhasPorSlide))}`;
      res = await fetch(
        `${getControllerApiBase()}/api/letras/preview-local?id=${encodeURIComponent(String(idPreview))}&origem=${origem}${paramLinhas}`
      );
    } else {
      res = await fetch(`${getControllerApiBase()}/api/letras/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          maxLinhasPorSlide: letrasPreviewMaxLinhasPorSlide,
          fonte: letrasPreviewFontePendente,
        }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (reqId !== letrasPreviewReqSeq) return;
    if (!res.ok) {
      scroll.innerHTML = `<div class="placeholder-msg">${escapeHtml(data.erro || `Erro HTTP ${res.status}`)}</div>`;
      return;
    }
    if (data.sucesso === false) {
      scroll.innerHTML = `<div class="placeholder-msg">${escapeHtml(data.erro || 'Falha ao carregar.')}</div>`;
      return;
    }
    if (btnImp) btnImp.disabled = false;
    const fonteLabel =
      letrasPreviewFontePendente === 'banco-local'
        ? letrasPreviewOfflineOrigem === 'user'
          ? 'Banco local (suas músicas)'
          : 'HLYRCS'
        : letrasPreviewFontePendente === 'letras-mus-br'
          ? 'Letras.mus.br'
          : letrasPreviewFontePendente === 'lyra-online'
            ? 'Banco online do Lyra'
            : 'Cifra Club';
    const metaLinhas = ` · ${rotuloModoLinhasPreview(letrasPreviewMaxLinhasPorSlide)}`;
    meta.innerHTML = `<strong>${escapeHtml(data.titulo || '')}</strong>${data.artista ? ` · ${escapeHtml(data.artista)}` : ''} · ${escapeHtml(fonteLabel)}${metaLinhas}`;
    const parts = Array.isArray(data.estrofes) ? data.estrofes : [];
    letrasPreviewPartesAtuais = parts.slice();

    // `parcial` = a letra veio de meta tag, que só traz o começo da música.
    // Sem este aviso, uma letra truncada em 4 linhas passava por completa.
    const avisoParcial = data.parcial
      ? `<div class="letras-preview-aviso">⚠ Só o início da letra foi encontrado (${parts.length} trecho${parts.length === 1 ? '' : 's'}). As fontes completas não responderam — confira antes de importar.</div>`
      : '';

    scroll.innerHTML =
      avisoParcial +
      parts
        .map((bloco, idx) => {
          const sep =
            idx > 0
              ? '<span class="letras-preview-sep" aria-hidden="true">\n\n</span>'
              : '';
          return (
            sep +
            `<div class="letras-preview-bloco"><span class="letras-preview-num">Trecho ${idx + 1}</span><pre class="letras-preview-pre">${escapeHtml(bloco)}</pre></div>`
          );
        })
        .join('');
  } catch (e) {
    if (reqId !== letrasPreviewReqSeq) return;
    scroll.innerHTML = `<div class="placeholder-msg">${escapeHtml(e.message || 'Falha ao carregar.')}</div>`;
  }
}

function configurarModalPreviewLetras() {
  document.getElementById('letras-preview-cancel')?.addEventListener('click', () => fecharModalPreviewLetras());
  document.getElementById('letras-preview-import')?.addEventListener('click', async () => {
    const p = letrasPreviewPathPendente;
    const catalogId = letrasPreviewCatalogIdPendente;
    const userId = letrasPreviewUserIdPendente;
    const maxLinhasPorSlide = lerMaxLinhasPreviewLetras();
    const fontePend = letrasPreviewFontePendente;
    fecharModalPreviewLetras();
    if (userId != null && fontePend === 'banco-local') {
      // «Usar esta música»: nada é gravado, mas o resultado da busca já cumpriu
      // o seu papel — limpa igual aos demais para manter o painel consistente.
      await selecionarMusicaDoBanco(userId, {
        fonte: 'user',
        preferirCopia: true,
        origemUi: 'biblioteca',
        abrirEmLetraCompleta: true,
      });
      limparBuscaLetras();
    } else if (catalogId != null && fontePend === 'banco-local') {
      await importarLetrasDoCatalogoParaBanco(catalogId, maxLinhasPorSlide);
    } else if (p) {
      await importarLetrasParaBanco(p, maxLinhasPorSlide, fontePend);
    }
  });
  document.getElementById('letras-preview-max-linhas')?.addEventListener('change', () => {
    letrasPreviewMaxLinhasPorSlide = lerMaxLinhasPreviewLetras();
    if (
      letrasPreviewPathPendente ||
      letrasPreviewCatalogIdPendente != null ||
      letrasPreviewUserIdPendente != null
    ) {
      carregarPreviewLetrasNoModal();
    }
  });
  /**
   * Só fecha ao clicar «no escuro»: pointerdown + pointerup no próprio backdrop.
   * Sem isto, arrastar seleção da letra para fora termina no backdrop — o navegador
   * sintetiza click no backdrop e fecha o modal inadvertidamente.
   */
  let letrasPreviewBackdropPointerDown = false;
  const letrasPreviewBd = document.getElementById('letras-preview-backdrop');
  letrasPreviewBd?.addEventListener('pointerdown', (e) => {
    letrasPreviewBackdropPointerDown = e.target === letrasPreviewBd;
  });
  letrasPreviewBd?.addEventListener('pointerup', (e) => {
    if (letrasPreviewBackdropPointerDown && e.target === letrasPreviewBd) fecharModalPreviewLetras();
    letrasPreviewBackdropPointerDown = false;
  });
  letrasPreviewBd?.addEventListener('pointercancel', () => {
    letrasPreviewBackdropPointerDown = false;
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (!modalPreviewLetrasEstaAberto()) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      e.preventDefault();
      selecionarTodoTextoPreviewLetras();
    },
    true
  );
  /* O `copy` dispara no elemento focado (ex.: campo de busca atrás do modal), não no scroll. */
  document.addEventListener('copy', tratarCopiaPreviewLetras, true);
}

async function playlistDuploCliqueIniciarProjecao(itemOuId) {
  if (!ehModoSlidesOperador()) return;
  if (!projecao.pronta()) return alert('Conecte ao servidor para projetar.');
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
  const curBf = fonteBancoNormalizada(musicaBancoFonte);
  const mesmaMusicaEVersao =
    musicaAtiva &&
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
    faixaSlidesHabilitadaPorPlaylistNoModoSlides = true;
    aplicarSelecaoUiPlaylist(idNum, item.versaoLocalId, itemBf);
    refreshListaBanco();
    renderPlaylist();
    renderSlidesStrip();
  }
  slidesDockVisivel = true;
  projetarPorDuploCliqueCentral(0);
}

/** true quando o servidor já informou que este controlador está em somente-leitura (write-lock). */
function controladorSomenteLeitura() {
  return !!(papelControladorLocal && papelControladorLocal.podeEscrever === false);
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
  ultimaDisplayConfigServidor = cfg;
  if (controladorSomenteLeitura()) aplicarDisplayConfigDoServidorNoPainel(cfg);
}

/** Estado do que está projetado nas telas. */
function aoReceberEstadoDaProjecao(estado) {
  const assinatura = assinaturaEstadoProjecaoRecebido(estado);
  if (assinatura !== null && assinatura === lyraAssinaturaEstadoProjecaoRecebido) return;
  lyraAssinaturaEstadoProjecaoRecebido = assinatura;

  estadoServidor = estado;
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
    if (ehModoApresentacaoOperador() && (apresentacaoMidiaProjetadaId || apresentacaoAvisoCard6Ativo)) {
      const tip = estado && estado.tipo;
      const minAp = !!(estado && estado.projecaoMinistranteApresentacao);
      const pubAp =
        tip === 'apresentacao' ||
        (tip === 'aviso' && apresentacaoAvisoCard6Ativo) ||
        minAp;
      if (apresentacaoMidiaProjetadaId && !pubAp && tip !== 'apresentacao') {
        apresentacaoMidiaProjetadaId = null;
      }
      if (apresentacaoAvisoCard6Ativo && tip !== 'aviso' && !minAp) {
        apresentacaoAvisoCard6Ativo = false;
        ultimoPayloadAvisoCard6 = null;
      }
      if (!apresentacaoMidiaProjetadaId && !apresentacaoAvisoCard6Ativo) {
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
  const estadoAnterior = { ...audioStateRemoto };
  const stAjustado = ajustarEstadoVisualRetomadaAudio(st, estadoAnterior);
  audioStateRemoto = {
    ...audioStateRemoto,
    ...stAjustado,
  };
  if (stAjustado.mediaKind) audioStateRemoto.mediaKind = stAjustado.mediaKind;
  if (audioStateRemoto.playing) {
    audioLoopReinicioPendente = false;
  }
  atualizarUiPlayerAudioRemoto();
  const dur = Math.max(0, Number(audioStateRemoto.duration) || 0);
  const atual = Math.max(0, Number(audioStateRemoto.currentTime) || 0);
  const terminouFaixa =
    audioLoopAtivo &&
    !audioLoopReinicioPendente &&
    estadoAnterior.mediaKind === 'audio' &&
    estadoAnterior.playing === true &&
    audioStateRemoto.playing === false &&
    dur > 0 &&
    atual >= Math.max(0, dur - 0.35) &&
    !!apresentacaoAudioAtualId;
  if (!terminouFaixa) return;
  const item = apresentacaoAudios.find((x) => x.id === apresentacaoAudioAtualId);
  if (!item?.src) return;
  audioLoopReinicioPendente = true;
  void tocarAudioServidorApresentacao(item, { startTime: 0 }).then((ok) => {
    if (ok) {
      atualizarRodapeAudioApresentacao(item);
      return;
    }
    audioLoopReinicioPendente = false;
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
projecao.aoReceber('display_config', aoReceberDisplayConfigDaProjecao);
/* Pedido de playlists vindo de um telemóvel, reencaminhado por quem hospeda a 5510. */
projecao.aoReceber('solicitar_playlists_controlador', emitirPlaylistsDoControlador);
projecao.aoReceber('estado', aoReceberEstadoDaProjecao);
projecao.aoReceber('audio_state', aoReceberAudioStateDaProjecao);
/*
 * O host avisou que o arranjo de monitores mudou (projetor ligado/desligado, resolução).
 *
 * Sem isto, os seletores só se actualizavam no arranque, ao ligar o socket e ao desenhar
 * a contagem — ligar o projetor com o app aberto deixava a lista desactualizada enquanto o
 * motor já tinha reorganizado as telas. `carregarRoteamentoTelasDoServidor()` é o caminho
 * completo: relê a lista, restaura a rota por identidade de monitor e avisa se algum
 * monitor configurado ficou em falta.
 */
projecao.aoReceber('monitores_alterados', () => {
  void carregarRoteamentoTelasDoServidor().then(() => {
    try { renderSeletorMonitorContagem(); } catch (_) {
      // intencional — o seletor da contagem pode ainda não estar montado
    }
  });
});

/**
 * Hidrata o painel depois do handshake remoto — temas, banco, rotas, slides.
 * Vive no núcleo de propósito: não é protocolo Socket.IO.
 */
async function aoLigarSocketRemoto(_ip) {
  migrarTemasParaGlobal();
  temasPorCulto = loadTemasPorCulto();
  temaSelecionadoPorCulto = loadTemaSelecionadoPorCulto();
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
    apresentacaoMidiaProjetadaId = null;
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

const socketPainel = criarSocketPainel({
  getSocket: () => socket,
  setSocket: (s) => { socket = s; },
  io: () => (typeof io !== 'undefined' ? io : undefined),
  getProjecaoLocalActiva: () => projecaoLocalActiva,
  getProjecaoLocalEmCurso: () => projecaoLocalEmCurso,
  desligarProjecaoNestaMaquina,
  ligarProjecaoNestaMaquina,
  emModoProjecaoLocal,
  ponteProjecaoLocal,
  adotarTransporteSocket: (sock) => {
    projecao.usarTransporte(criarTransporteSocket(sock));
  },
  getPapelControlador: () => papelControladorLocal,
  setPapelControlador: (p) => { papelControladorLocal = p; },
  getCompanionHandoffEmCurso: () => companionHandoffEmCurso,
  getAutoConectarAoIniciarEmCurso: () => autoConectarAoIniciarEmCurso,
  setAutoConectarAoIniciarEmCurso: (v) => { autoConectarAoIniciarEmCurso = !!v; },
  getReassumirLocalEmCurso: () => reassumirLocalEmCurso,
  setReassumirLocalEmCurso: (v) => { reassumirLocalEmCurso = !!v; },
  getServidorLanIpObs: () => servidorLanIpObs,
  setServidorLanIpObs: (v) => { servidorLanIpObs = v; },
  setServidorObsPort: (v) => { servidorObsPort = v; },
  getUltimaDisplayConfig: () => ultimaDisplayConfigServidor,
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

/**
 * Carrega uma música do banco no editor/projeção.
 *
 * @param {number|string} id
 * @param {object} [opts]
 * @param {'user'|'catalog'} [opts.fonte]
 * @param {string} [opts.versaoLocalId] Versão explícita (item de playlist, chip
 *   de versão). Quando presente, manda — inclusive quando aponta para o original.
 * @param {boolean} [opts.preferirCopia] Abre a **cópia** editável em vez do
 *   ORIGINAL quando nenhuma versão foi pedida explicitamente. É o caminho dos
 *   cliques do usuário na lista do banco: o original fica preservado e as
 *   edições caem sempre na cópia. A playlist não usa isto — lá vale a versão
 *   que o item guardou.
 * @param {'biblioteca'|'playlist'} [opts.origemUi] Coluna que disparou a
 *   seleção. Essa coluna recebe o destaque; a outra é limpa.
 * @param {boolean} [opts.abrirEmLetraCompleta] No modo completo, abre a letra
 *   corrida em vez da grade de slides. Usado por clique na Biblioteca/Playlist
 *   e após importar dos bancos Locais/Online.
 */
async function selecionarMusicaDoBanco(id, opts) {
  const fonteBanco = fonteBancoNormalizada(opts && opts.fonte);
  const qsMusica = fonteBanco === 'catalog' ? '?fonte=catalog' : '';
  const abrirLetraCompleta =
    !!(opts && opts.abrirEmLetraCompleta) &&
    modoRoteamentoAtual() === 'completo' &&
    !ehModoSlidesOperador();
  try {
    if (!(opts && opts.pularConfirmacaoDescarte)) {
      if (
        !(await confirmarProsseguirDescartandoEdicaoPendente(
          'Há alterações não gravadas nesta sessão. Descartar e carregar outra música?',
          'Alterações não gravadas',
          { manterLetraCompleta: abrirLetraCompleta }
        ))
      ) {
        return false;
      }
    }
    if (ehModoSlidesOperador()) slidesRailUserRecolhido = false;
    /* Modo controlador: se já existe projeção ativa, manter a faixa visível ao engatilhar próxima música. */
    slidesDockVisivel = ehModoSlidesOperador() || slidesDockVisivel || hayProjecaoAtivaNoServidor();
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${id}${qsMusica}`);
    if (!res.ok) throw new Error(`Falha ao carregar música (HTTP ${res.status}).`);
    const base = await res.json();
    if (!base || !Array.isArray(base.estrofes)) {
      throw new Error('Resposta inválida do servidor ao carregar a música.');
    }
    let versaoReq =
      opts && opts.versaoLocalId !== undefined && opts.versaoLocalId !== null
        ? String(opts.versaoLocalId)
        : null;

    /* Clique do usuário sem versão pedida: cai na cópia editável, não no original.
       Só faz sentido sobre um ORIGINAL do banco do usuário — o catálogo é
       só-leitura e uma cópia já carregada não precisa de outra. */
    if (
      !versaoReq &&
      opts &&
      opts.preferirCopia &&
      fonteBanco === 'user' &&
      Number(base.is_immutable) === 1
    ) {
      const copiaId = await garantirCopiaPadraoServidor(base.id != null ? base.id : id);
      if (copiaId != null) versaoReq = String(copiaId);
    }

    musicaBancoFonte = fonteBanco;
    if (versaoReq && ehVersaoServidorId(versaoReq)) {
      const resV = await fetch(`${getControllerApiBase()}/api/musicas/${encodeURIComponent(versaoReq)}`);
      if (!resV.ok) throw new Error(`Falha ao carregar versão (HTTP ${resV.status}).`);
      const ver = await resV.json();
      musicaAtiva = ver;
      musicaVersaoLocalId = null;
      musicaRootId = Number(ver.root_id ?? id);
      const et = document.getElementById('edit-titulo');
      const ea = document.getElementById('edit-artista');
      if (et) et.value = musicaAtiva.titulo || '';
      if (ea) ea.value = musicaAtiva.artista || '';
      /* Sem `await`: a barra de versões é informativa e mais um ida-e-volta aqui
         atrasava a projeção. Igual ao que `aplicarBaseMusicaSelecionada` já faz. */
      void carregarVersoesMusicaServidor(musicaRootId);
    } else {
      aplicarBaseMusicaSelecionada(base, id, versaoReq);
    }
    if (ehModoSlidesOperador()) {
      faixaSlidesHabilitadaPorPlaylistNoModoSlides = !!(opts && opts.habilitarFaixaModoSlides);
    } else {
      faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
    }
    estrofeAtiva = -1;

    /* Antes de construir chips da faixa: sem isto, `projecaoMusicaEmitidaNoServidor` ainda vinha true da música anterior e um único clique no chip projetava. */
    projecaoMusicaEmitidaNoServidor = false;
    bloqueioSincronizarEstrofeDoServidor = true;

    const origemUi =
      opts && opts.origemUi === 'playlist'
        ? 'playlist'
        : opts && opts.origemUi === 'biblioteca'
          ? 'biblioteca'
          : opts && opts.habilitarFaixaModoSlides
            ? 'playlist'
            : opts && opts.preferirCopia
              ? 'biblioteca'
              : null;
    if (origemUi === 'playlist') {
      aplicarSelecaoUiPlaylist(id, opts && opts.versaoLocalId, fonteBanco);
    } else if (origemUi === 'biblioteca') {
      aplicarSelecaoUiBiblioteca(id, fonteBanco);
    }

    /*
      Ponto mais cedo em que a música já está inteira em memória. Quem pediu projeção
      imediata — o botão «Próxima música» — emite AQUI, antes de qualquer DOM: o telão
      deixa de esperar pela reconstrução da grelha, das prévias e da playlist.
      O callback também deixa `estrofeAtiva` e as flags no valor final, para o painel
      ser desenhado UMA vez já no estado certo, em vez de duas.
    */
    if (typeof (opts && opts.aoCarregarAntesDeRenderizar) === 'function') {
      opts.aoCarregarAntesDeRenderizar();
    }

    /* Biblioteca e editor de estrofes vivem em contentores `display:none` no Modo
       Slides (`.panel-banco`, `.centro-col-letras`): reconstruí-los aqui só atrasaria
       o primeiro quadro da grelha. Ficam para o tempo ocioso, logo a seguir. */
    const emModoSlides = ehModoSlidesOperador();
    if (emModoSlides) {
      agendarRenderizacoesOcultasDoModoSlides();
    } else refreshListaBanco();
    renderPlaylist();
    /* Home: clique na Biblioteca/Playlist abre só a letra corrida.
       Montar a grade (cartões + chips) aqui era trabalho inútil e visível. */
    if (abrirLetraCompleta) {
      atualizarPreviewOperador();
      entrarModoLetraCompletaCentral();
    } else {
      if (!emModoSlides) renderEstrofesEditor();
      renderSlidesStrip();
      atualizarPreviewOperador();
    }
    return true;
  } catch (e) {
    musicaAtiva = null;
    musicaVersaoLocalId = null;
    musicaRootId = null;
    versoesMusicaServidorCache = { rootId: null, versoes: [] };
    musicaBancoFonte = 'user';
    estrofeAtiva = -1;
    renderMusicaVersoesBar();
    renderPlaylist();
    renderEstrofesEditor();
    renderSlidesStrip();
    atualizarPreviewOperador();
    alert(e?.message || 'Não foi possível carregar a música para edição/projeção.');
    return false;
  }
}

async function projecaoProximaMusicaPlaylist() {
  if (!projecao.pronta()) return alert('Conecte ao servidor.');
  /* Mesma razão de `playlistDuploCliqueIniciarProjecao`: o guard é sobre alcançar a
     projeção, e no modo local ela está nesta máquina — pedir um IP aqui bloqueava quem
     nunca configurou nenhum. */
  const hostAtual = hostProjecao();
  if (!hostAtual) return alert('Informe o IP ou use «Conectar».');
  if (!musicaAtiva) return alert('Selecione uma música primeiro.');
  const pl = getPlaylist(cultoId);
  const idx = pl.findIndex((it) => playlistItemMesmaVersaoQueAtiva(it));
  if (idx < 0) return alert('A música atual não está nesta playlist.');
  const j = indiceProximaMusicaNaPlaylist(pl, idx);
  if (j < 0) return alert('Não há próxima música nesta playlist.');
  if (
    !(await confirmarProsseguirDescartandoEdicaoPendente(
      'Há alterações não gravadas nesta sessão. Descartar e ir para a próxima música?',
      'Alterações não gravadas'
    ))
  ) {
    return;
  }
  const next = pl[j];
  /*
    A projeção sai no instante em que a música chega — antes de a grelha, as prévias e a
    playlist serem redesenhadas. Antes, o `emitir` só vinha depois de um ciclo inteiro de
    render (e de um segundo ciclo, aqui em baixo), e o telão trocava no fim: era esse o
    atraso perceptível entre o clique e a próxima música.
  */
  const ok = await selecionarMusicaDoBanco(Number(next.id), {
    habilitarFaixaModoSlides: true,
    versaoLocalId: next.versaoLocalId || undefined,
    fonte: fonteBancoItemPlaylist(next),
    pularConfirmacaoDescarte: true,
    origemUi: 'playlist',
    aoCarregarAntesDeRenderizar: () => {
      /* Destaque na playlist + botão «Próxima» alinhados à música recém-carregada. */
      faixaSlidesHabilitadaPorPlaylistNoModoSlides = true;
      estrofeAtiva = 0;
      slidesDockVisivel = ehModoSlidesOperador();
      emitirEstrofeAoServidor(0);
    },
  });
  if (!ok || !musicaAtiva) return;
  marcacaoEstrofeEditor();
  atualizarEstadoBtnProximaMusicaPlaylist();
}

function montarPayloadExibirMusica(estrofeIndex) {
  if (!musicaAtiva) return { musicaId: null, estrofeIndex };
  const payload = { musicaId: musicaAtiva.id, estrofeIndex };
  payload.estrofes = (musicaAtiva.estrofes || []).map((s) => String(s ?? ''));
  payload.titulo = String(musicaAtiva.titulo || '').trim();
  /* Tom só para o M3 (abertura); o título público permanece sem tom. */
  payload.tom = obterTomPlaylistMusicaAtiva();
  const idx = Number(estrofeIndex);
  if (Number.isFinite(idx) && idx === 0) {
    payload.tituloAbertura = tituloAberturaM3MusicaAtiva(payload.titulo);
  }
  return payload;
}

/**
 * Nome do culto activo, como aparece no seletor do painel.
 *
 * Gravado por extenso no histórico ao lado do id: renomear ou apagar um culto não pode
 * reescrever o que já aconteceu.
 */
function nomeCultoAtivoParaHistorico() {
  if (!cultoId) return '';
  try {
    const item = listarCultosDisponiveis(dataRefDoCultoImportado(cultoId)).find(
      (c) => c.id === cultoId
    );
    if (!item) return cultoId;
    const p = parseLabelCulto(item.label);
    return [p.data, p.desc].filter(Boolean).join(' — ') || cultoId;
  } catch (_) {
    return cultoId;
  }
}

/** Ministrante da música activa na playlist do culto (o do dia, não o cadastro todo). */
function ministrantePlaylistMusicaAtiva() {
  if (!musicaAtiva || !cultoId) return { id: null, nome: '' };
  try {
    const pl = getPlaylist(cultoId);
    const it = Array.isArray(pl) ? pl.find((x) => playlistItemMesmaVersaoQueAtiva(x)) : null;
    const id = it ? normalizarMinistranteIdPlaylist(it.ministranteId) : null;
    return { id: id ?? null, nome: id != null ? nomeMinistrantePorId(id) : '' };
  } catch (_) {
    return { id: null, nome: '' };
  }
}

/**
 * Regista no histórico que esta música foi ao ar.
 *
 * ## Porquê aqui, e porquê sem `await`
 *
 * Este é o ponto por onde toda a projeção de música passa — o duplo clique, as setas, o
 * «próxima da playlist», o comando de voz. Pendurar o registo em cada um deles seria
 * garantir que um fica esquecido.
 *
 * Não há `await` nem tratamento de erro visível: o histórico é um subproduto: se a rede
 * local engasgar ou o servidor HTTP estiver a arrancar, perde-se uma linha de relatório —
 * e é tudo. Fazer o operador esperar por isto, ou mostrar-lhe um erro a meio de um culto,
 * seria trocar o essencial pelo acessório.
 *
 * A decisão de gravar ou não é do servidor (ver `POST /api/historico`), que é quem tem a
 * regra de repetição; daqui manda-se a cada estrofe sem pensar. É também por isso que o
 * registo vive no painel e não no motor de projeção: só aqui se conhece o tom da playlist,
 * o ministrante do dia e o culto — o payload que vai para o telão não leva nada disso.
 */
function registarProjecaoNoHistorico() {
  if (!musicaAtiva) return;
  const min = ministrantePlaylistMusicaAtiva();
  const corpo = {
    musicaId: Number(musicaAtiva.id) || null,
    rootId: obterRootIdMusicaAtiva(),
    bancoFonte: fonteBancoNormalizada(musicaBancoFonte),
    titulo: String(musicaAtiva.titulo || '').trim(),
    artista: String(musicaAtiva.artista || '').trim(),
    rotulo: String(musicaAtiva.rotulo || '').trim(),
    tom: obterTomPlaylistMusicaAtiva(),
    ministranteId: min.id,
    ministranteNome: min.nome,
    cultoId: String(cultoId || ''),
    cultoNome: nomeCultoAtivoParaHistorico(),
  };
  try {
    fetch(`${getControllerApiBase()}/api/historico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    }).catch(() => {});
  } catch (_) {
  // intencional — o histórico nunca pode atrapalhar a projeção
}
}

function emitirEstrofeAoServidor(index) {
  if (!projecao.pronta() || !musicaAtiva) return;
  bloqueioSincronizarEstrofeDoServidor = false;
  projecaoMusicaEmitidaNoServidor = true;
  if (ehModoSlidesOperador()) slidesRailUserRecolhido = false;
  projecao.enviar('exibir_musica', montarPayloadExibirMusica(index));
  if (ehModoSlidesOperador()) {
    /* Espelho + refresh da prévia (e `exibir_ministrante`) — evita M3 com DOM antigo. */
    espelharEstadoMusicaLocalAposEmitSlides(index);
    try {
      atualizarPreviewOperador();
    } catch (_) {
      // intencional — erro ignorado
    }
  } else {
    emitirEstadoMinistranteAoServidor();
  }
  registarProjecaoNoHistorico();
  atualizarChecksAoProjetar();
}

/**
 * Espelho otimista de `estadoServidor` após `exibir_musica` no modo Slides.
 * Só para as prévias refletirem o que acabou de ir às telas (seleção ≠ projeção).
 */
function espelharEstadoMusicaLocalAposEmitSlides(index) {
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes)) return;
  /*
   * Mídias a ocupar o canal público (imagem/vídeo/PDF/web ou aviso do card 6): não há
   * nada a espelhar nesse canal, porque nada lá mudou.
   *
   * `exibir_musica` escreve `estadoAtual` no servidor e não toca em
   * `estadoPublicoOverride` — e é o override que o evento `estado` transporta. O eco que
   * chega a seguir continua, portanto, a ser o da mídia (`tipo: 'apresentacao'`).
   * Espelhar aqui `tipo: 'musica'` inventava, no intervalo entre o envio e o eco, um
   * estado que o servidor nunca produz, e tudo o que lê o canal público ia atrás dele:
   * `classificarSaidaMonitorPublicoSlides` trocava a badge «Imagem no Telão» pela cópia
   * do slide e `atualizarEstiloRotasDesativadas` desbloqueava o seletor do M2 (ambos por
   * `apresentacaoProjecaoAtivaNoCanalPublico`), para voltarem atrás assim que o eco
   * chegasse — o piscar do M2 ao projetar um slide.
   *
   * Mesma regra de `limparEspelhoLocalSoCamadaSlides`: o espelho local só mexe na camada
   * Slides; a camada de Mídias por cima sobrevive. O M3 não perde nada — a prévia dele e
   * o `exibir_ministrante` saem da música local (`projecaoMusicaEmitidaNoServidor`), que
   * é exactamente o caminho que já corria depois do eco.
   */
  if (apresentacaoProjecaoAtivaNoCanalPublico()) return;
  const nEst = musicaAtiva.estrofes.length;
  const idx = Number(index);
  const slidePreto = Number.isFinite(idx) && idx === nEst;
  const cur =
    !slidePreto && Number.isFinite(idx) && idx >= 0 && idx < nEst
      ? String(musicaAtiva.estrofes[idx] ?? '')
      : '';
  const nxtIdx = idx + 1;
  const proximoSlidePreto = !slidePreto && nxtIdx === nEst;
  let linhasProximo = [];
  if (!slidePreto && !proximoSlidePreto && nxtIdx >= 0 && nxtIdx < nEst) {
    linhasProximo = String(musicaAtiva.estrofes[nxtIdx] ?? '').split('\n');
  }
  const prev = estadoServidor && typeof estadoServidor === 'object' ? estadoServidor : {};
  estadoServidor = {
    ...prev,
    tipo: 'musica',
    titulo: String(musicaAtiva.titulo || '').trim(),
    linhas: slidePreto ? [] : cur.split('\n'),
    estrofeIndex: Number.isFinite(idx) ? idx : 0,
    totalEstrofes: nEst,
    telaLimpa: false,
    slidePretoFinal: slidePreto,
    proximoSlidePreto,
    linhasProximo,
    musicaId: musicaAtiva.id,
  };
  /* Permite o eco real do servidor atualizar de novo. */
  lyraAssinaturaEstadoProjecaoRecebido = null;
}

/** Atualiza só o painel (estrofe «selecionada»). Não envia às telas nem altera a prévia de projeção real — use duplo clique ou setas após projeção iniciada. */
function exibirEstrofe(index, opts) {
  if (!musicaAtiva) return;
  if (ehModoSlidesOperador()) slidesRailUserRecolhido = false;
  estrofeAtiva = index;
  renderSlidesStrip();
  const semScroll = !!(opts && opts.semScroll);
  if (!semScroll) {
    const suave = !(opts && opts.suave === false);
    requestAnimationFrame(() => revelarChipEstrofeFocado(estrofeAtiva, { suave }));
  }
  atualizarPreviewOperador();
  renderPlaylist();
  marcacaoEstrofeEditor();
}

function navegarEstrofe(dir) {
  if (!musicaAtiva || !musicaAtiva.estrofes.length) return;
  const idxMaxPreto = musicaAtiva.estrofes.length;
  const prox = estrofeAtiva + dir;
  if (prox >= 0 && prox <= idxMaxPreto) {
    exibirEstrofe(prox);
    if (projecaoMusicaEmitidaNoServidor && projecao.pronta()) {
      emitirEstrofeAoServidor(prox);
    }
  }
}

/**
 * Passador USB / apresentador sem fio (2 teclas): em geral envia PageDown/PageUp ou setas.
 * Devolve +1 (avançar), -1 (voltar) ou 0 se não for tecla de passador.
 */
function direcaoTeclaPassadorSlides(tecla, code) {
  const k = String(tecla || '');
  const c = String(code || '');
  const avancar = new Set([
    'PageDown',
    'ArrowRight',
    'ArrowDown',
    'Numpad2',
    'Numpad3',
    'Numpad6',
    'NumpadEnter',
    'Enter',
  ]);
  const voltar = new Set([
    'PageUp',
    'ArrowLeft',
    'ArrowUp',
    'Numpad4',
    'Numpad8',
    'Numpad9',
    'Backspace',
  ]);
  if (avancar.has(k) || c === 'PageDown' || c === 'MediaTrackNext') return 1;
  if (voltar.has(k) || c === 'PageUp' || c === 'MediaTrackPrevious') return -1;
  if (ehModoSlidesOperador() && k === ' ') return 1;
  return 0;
}

/**
 * Modo slides + passador: avançar/voltar slide. Só envia ao telão depois que a projeção
 * já foi iniciada (duplo clique, etc.) — antes disso, igual ao clique: só seleção no painel.
 */
function navegarEstrofePassadorSlides(direcao, opts) {
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes) || !musicaAtiva.estrofes.length) return;
  if (!ehModoSlidesOperador()) {
    navegarEstrofe(direcao);
    return;
  }
  const idxMaxPreto = musicaAtiva.estrofes.length;
  let base = Number.isFinite(estrofeAtiva) ? estrofeAtiva : -1;
  let prox = base + direcao;
  if (base < 0 && direcao > 0) prox = 0;
  prox = Math.max(0, Math.min(idxMaxPreto, prox));
  if (prox === estrofeAtiva && projecaoMusicaEmitidaNoServidor) return;
  exibirEstrofe(prox, { suave: !(opts && opts.repetir) });
  if (projecaoMusicaEmitidaNoServidor && projecao.pronta()) {
    emitirEstrofeAoServidor(prox);
  }
}

/** Botão «Tela preta» do modo slides: vai direto ao último slide (o preto, índice N). */
function irParaSlidePretoModoSlides() {
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes) || !musicaAtiva.estrofes.length) return;
  projecionarEstrofeModoSlides(musicaAtiva.estrofes.length);
}

/**
 * Atalho «número + Enter» do modo slides: projeta o slide N da música atual.
 * Captura os dígitos no teclado todo (sem foco no campo), menos em campos de texto e com
 * modal / painel por cima. Detalhes em `modules/slidesIrParaNumero.js`.
 */
const irParaSlideNumero = criarIrParaSlideNumero({
  ehModoSlides: ehModoSlidesOperador,
  totalEstrofes: () =>
    musicaAtiva && Array.isArray(musicaAtiva.estrofes) ? musicaAtiva.estrofes.length : 0,
  projetar: (indice) => projecionarEstrofeModoSlides(indice),
  interfaceBloqueada: () => {
    if (document.getElementById('contagem-backdrop')?.classList.contains('aberto')) return true;
    if (document.getElementById('cfg-modal-overlay-ctrl')?.classList.contains('aberto')) return true;
    return [
      'musica-excluir-backdrop',
      'nova-musica-manual-backdrop',
      'letras-preview-backdrop',
      'slide-delete-confirm-backdrop',
      'slide-quick-edit-backdrop',
    ].some((id) => {
      const el = document.getElementById(id);
      return !!el && !el.hidden;
    });
  },
});
irParaSlideNumero.ligar();

/** Comando de voz / atalho: projeta estrofe no índice dado (0 … N, N = tela preta). */
function projecionarEstrofeModoSlides(index) {
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes) || !musicaAtiva.estrofes.length) return;
  const idxMaxPreto = musicaAtiva.estrofes.length;
  const idx = Math.max(0, Math.min(idxMaxPreto, Number(index)));
  if (projecao.pronta()) {
    emitirEstrofeAoServidor(idx);
    exibirEstrofe(idx);
    return;
  }
  exibirEstrofe(idx);
}

const reconhecimentoVozSlides = criarReconhecimentoVozSlides({
  ehModoSlides: ehModoSlidesOperador,
  ehModoApresentacao: ehModoApresentacaoOperador,
  // Microfone desativado no modo mídias (mesmo comportamento da Home): só disponível no modo slides.
  painelVozVisivel: () => ehModoSlidesOperador(),
  obterMusicaAtiva: () => musicaAtiva,
  projecionarEstrofe: projecionarEstrofeModoSlides,
  navegarDirecao: navegarEstrofePassadorSlides,
  encerrarComoEsc: () => {
    if (ehModoSlidesOperador()) {
      encerrarProjecaoDoControlador({ limparMusica: true });
    }
  },
  mudarModoApresentacao: () => {
    if (!ehModoApresentacaoOperador()) abrirMenuModoApresentacao();
  },
  mudarModoSlides: () => {
    if (ehModoApresentacaoOperador()) {
      fecharMenuModoApresentacao();
      setTimeout(() => {
        if (!ehModoSlidesOperador()) alternarModoSlidesOperador();
        else reconhecimentoVozSlides.atualizarUi();
      }, 360);
      return;
    }
    if (!ehModoSlidesOperador()) alternarModoSlidesOperador();
  },
  mudarModoCompleto: () => irParaTelaInicial(),
  mudarModoBiblia: () => {
    if (ehModoApresentacaoOperador()) {
      fecharMenuModoApresentacao();
      setTimeout(() => {
        if (!ehModoBibliaOperador()) alternarModoBiblia();
      }, 360);
      return;
    }
    if (!ehModoBibliaOperador()) alternarModoBiblia();
  },
});

/**
 * Regista cedo no `window` os handlers do HTML (`onclick="…"`).
 * Se o bootstrap abaixo falhar, os botões de modo continuam clicáveis.
 */
exporCallbacksParaAtributosHtml({
  recarregarPainelControlador,
  conectar,
  alternarProjecaoNestaMaquina,
  ligarProjecaoNestaMaquina,
  desligarProjecaoNestaMaquina,
  encerrarServidorRemotoViaMenu,
  copiarUrlObs,
  irParaTelaInicial,
  alternarModoSlidesOperador,
  alternarModoBiblia,
  onTraducaoBibliaChange,
  alternarVozSlides: () => {
    if (ehModoBibliaOperador()) reconhecimentoVozBiblia.alternarAtivo();
    else reconhecimentoVozSlides.alternarAtivo();
    setTimeout(() => {
      if (typeof sincronizarFormCfgGeral === 'function') sincronizarFormCfgGeral();
    }, 0);
  },
  abrirMenuModoApresentacao,
  abrirModoDocs,
  abrirCfgModal,
  toggleDarkCtrl,
  onCfgGeralTemaChange,
  onCfgGeralVozChange,
  onCfgLembrarIpChange,
  onCfgAutoConectarChange,
  sincronizarFormCfgGeral,
  toggleCfgSwitch,
  getChkVal,
  abrirModalNovaMusicaManual,
  buscarLetrasExterno,
  editarNomeVersaoSelecionada,
  apagarCopiaVersaoSelecionada,
  entrarModoEdicao,
  iniciarCriarNovaVersao,
  alternarModoLetraCompletaCentral,
  cancelarModoLetraCompletaCentral,
  irParaGradeSlidesDesdeLetraCompleta,
  alternarModoLetraCompletaOuVoltarGrade,
  alternarModoComparativoCentral,
  acionarEditarLetraBarraPadrao,
  cancelarModoComparativoCentral,
  alternarCaixaLetrasEdicao,
  adicionarVersaoAtivaNaPlaylistHome,
  sairModoEdicao,
  salvarMusicaServidor,
  acionarSalvarAlteracoesBarraPadrao,
  acionarCancelarBarraPadrao,
  novaEstrofe,
  navegarEstrofe,
  irParaSlidePretoModoSlides,
  limparTela,
  // SAIR na barra: encerra a prévia E limpa a seleção (música + slides), voltando ao estado inicial.
  encerrarProjecaoDoControlador: () => encerrarProjecaoDoControlador({ limparMusica: true }),
  alternarOcultacaoPreviewPainel,
  bibliaBuscaRapida,
  bibliaBuscaRapidaTecla,
  bibliaNavPopupAbrir,
  bibliaNavPopupFechar,
  bnpSelecionarLivro,
  bnpConfirmarCap,
  bnpConfirmarVer,
  bibliaAplicarCfgExibicao,
  definirFiltroTestamentoBiblia,
  bibliaEscolherFundo,
  setBibliaPosCtrl,
  onBibliaPublicoBgTypeCtrlChange,
  onBibliaMinistranteBgTypeCtrlChange,
  onBibliaPublicoCfgChange,
  onBibliaMinistranteCfgChange,
  projecaoProximaMusicaPlaylist,
  fecharCfgModal,
  mudarAbaCfg,
  mudarDestinoCfg,
  onCfgBuscaInput,
  limparCfgBusca,
  onCfgMinistranteAdicionar,
  onCfgImportTonsArquivoChange,
  onCfgSyncTonsInvbClick,
  onSincronizarPlaylistLyraClick,
  setPosCtrl,
  salvarCfgNoServidor,
  onBancoFonteChange,
  alternarListaBancoSqlite,
  onFiltroBuscaChange,
  onBuscaLetrasInput,
  limparBuscaLetras,
  filtrar,
  onPublicoBgTypeCtrlChange,
  onPublicoBgImageCtrlChange,
  onPublicoBgColorCtrlInput,
  onPublicoBgGradientCtrlInput,
  lerNumeroInput,
  setSpanText,
  debounceSalvarCfg,
  setSelVal,
  setInputVal,
  setChkVal,
  aplicarWrapImediato,
  onMinistranteBgTypeCtrlChange,
  onMinistranteBgImageCtrlChange,
  onMinistranteBgColorCtrlInput,
  onMinistranteBgGradientCtrlInput,
  onMinistranteSlideCfgChange,
  aplicarCfgRelogio,
  onClockBgTypeCtrlChange,
  onClockBgImageCtrlChange,
  onClockFontSizeCtrlInput,
  onClockDateFontSizeCtrlInput,
  onClockVerseFontSizeCtrlInput,
  onAvisoCard6CfgChange,
  setPosAvisoCard6Ctrl,
  onBibliaDivisaoCfgChange,
});

function navegarEstrofePorSeta(tecla, opts) {
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes) || !musicaAtiva.estrofes.length) return;
  const idxMaxPreto = musicaAtiva.estrofes.length;
  let base = Number.isFinite(estrofeAtiva) ? estrofeAtiva : -1;
  if (base < 0) base = 0;
  let prox = base;
  const cols = ehModoSlidesOperador() ? slidesGrelha.getSlidesPorLinha() : 3;

  if (tecla === 'ArrowRight') prox = base + 1;
  else if (tecla === 'ArrowLeft') prox = base - 1;
  else if (tecla === 'ArrowDown') prox = base + cols;
  else if (tecla === 'ArrowUp') prox = base - cols;

  prox = Math.max(0, Math.min(idxMaxPreto, prox));
  if (prox === estrofeAtiva) return;
  exibirEstrofe(prox, { suave: !(opts && opts.repetir) });
  if (projecaoMusicaEmitidaNoServidor && projecao.pronta()) {
    emitirEstrofeAoServidor(prox);
  }
}

function musicaEstadoCombinaComAtiva(estado) {
  if (!musicaAtiva || estado.tipo !== 'musica') return false;
  if (estado.musicaId != null && musicaAtiva.id != null) {
    return Number(estado.musicaId) === Number(musicaAtiva.id);
  }
  return estado.titulo === musicaAtiva.titulo;
}

function sincronizarEstrofeAtiva(estado) {
  if (!estado || estado.telaLimpa || estado.tipo === null) {
    estrofeAtiva = -1;
    slidesDockVisivel = ehModoSlidesOperador();
    projecaoMusicaEmitidaNoServidor = false;
    bloqueioSincronizarEstrofeDoServidor = false;
    renderSlidesStrip();
    renderPlaylist();
    marcacaoEstrofeEditor();
    return;
  }

  if (estado.tipo === 'musica' && musicaEstadoCombinaComAtiva(estado)) {
    if (bloqueioSincronizarEstrofeDoServidor) return;
    estrofeAtiva = estado.estrofeIndex;
    if (ehModoSlidesOperador()) slidesDockVisivel = true;
    projecaoMusicaEmitidaNoServidor = true;
    renderSlidesStrip();
    renderPlaylist();
    marcacaoEstrofeEditor();
  } else if (estado.tipo === 'musica' && todasMusicas.length && estado.musicaId != null) {
    const m = todasMusicas.find((x) => Number(x.id) === Number(estado.musicaId));
    if (m && musicaAtiva?.id === m.id) {
      if (bloqueioSincronizarEstrofeDoServidor) return;
      estrofeAtiva = estado.estrofeIndex;
      if (ehModoSlidesOperador()) slidesDockVisivel = true;
      projecaoMusicaEmitidaNoServidor = true;
      renderSlidesStrip();
      renderPlaylist();
      marcacaoEstrofeEditor();
    }
  }
}

function limparTela() {
  if (!projecao.ligada()) return;
  marcarUltimaMusicaAoEncerrar();
  estrofeAtiva = -1;
  slidesDockVisivel = ehModoSlidesOperador();
  projecaoMusicaEmitidaNoServidor = false;
  bloqueioSincronizarEstrofeDoServidor = false;
  projecao.enfileirar('limpar_tela');
  renderSlidesStrip();
  atualizarPreviewOperador();
  if (musicaAtiva) renderPlaylist();
  marcacaoEstrofeEditor();
}

/** `limparMusica`: modo slides — ESC desassocia a música do painel (playlist sem linha ativa, faixa de slides oculta). */
function encerrarProjecaoDoControlador(opts = {}) {
  marcarUltimaMusicaAoEncerrar();
  const limparMusica = !!opts.limparMusica;
  if (limparMusica) {
    musicaAtiva = null;
    musicaVersaoLocalId = null;
    musicaRootId = null;
    versoesMusicaServidorCache = { rootId: null, versoes: [] };
    renderMusicaVersoesBar();
    modoEdicaoEstrofes = false;
    snapshotEdicaoEstrofes = null;
    snapshotLetraCompleta = null;
    modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
    faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
    selecaoUiPlaylist = null;
    selecaoUiBiblioteca = null;
  }
  estrofeAtiva = -1;
  slidesDockVisivel = ehModoSlidesOperador();
  projecaoMusicaEmitidaNoServidor = false;
  bloqueioSincronizarEstrofeDoServidor = false;
  /* Sem isto, `estadoServidor` segue com música até o broadcast — no modo slides o cartão TV voltava pela ramo servidor ≠ painel alinhado.
     Só a camada Slides: Mídias noutro monitor (badge «Imagem no Telão») tem de sobreviver. */
  limparEspelhoLocalSoCamadaSlides();
  /** No controlador, ESC/encerrar limpa as saídas sem fechar as janelas de projeção (emit só se ligado). */
  projecao.enviar('limpar_tela');
  if (ehModoBibliaOperador()) {
    bibliaZerarParteProjetada();
    if (ultimoConteudoProjetadoModoUnificado?.tipo === 'biblia') {
      ultimoConteudoProjetadoModoUnificado = null;
    }
    bibliaZerarVersiculoSelecionado();
    document.querySelectorAll('.biblia-v-card').forEach((c) => {
      c.classList.remove('projetado', 'selecionado');
    });
  }
  renderSlidesStrip();
  atualizarPreviewOperador();
  if (limparMusica) {
    renderPlaylist();
    renderEstrofesEditor();
    refreshListaBanco();
  } else if (musicaAtiva) {
    renderPlaylist();
  }
  marcacaoEstrofeEditor();
}

function toggleBlackoutTelas() {
  if (!projecao.ligada()) return;
  projecao.enfileirar('toggle_blackout');
}

/**
 * @param {number} index
 * @param {{ rolarComoNasSetas?: boolean }} [opts] Ver a nota sobre a rolagem abaixo.
 */
function projetarPorDuploCliqueCentral(index, opts = {}) {
  if (!musicaAtiva || !projecao.pronta()) return;
  slidesRailUserRecolhido = false;
  slidesDockVisivel = true;
  /** Emitir antes de `exibirEstrofe`: senão `atualizarPreviewOperador` roda com `projecaoMusicaEmitidaNoServidor` ainda false e o painel espelha só o estado antigo do socket (telão físico atualiza, preview não). */
  emitirEstrofeAoServidor(index);
  /*
   * Quem rola aqui é o `exibirEstrofe` — o mesmo caminho das setas, que chega a
   * `revelarChipEstrofeFocado`. O que muda entre os dois chamadores é só se ele deve correr:
   *
   * · Duplo clique (projecção ainda por começar): o primeiro clique já seleccionou e já
   *   rolou. Um segundo scroll competia com esse e fazia a grelha tremer — daí o padrão
   *   continuar a ser não rolar.
   * · Clique único com a projecção no ar: não houve clique anterior nenhum, logo não há
   *   scroll com que competir. Sem rolar, clicar no slide da última fileira visível deixava
   *   a fileira seguinte escondida — enquanto chegar ao mesmo slide pelas setas a revelava.
   *   É o mesmo destino pelo mesmo gesto, e tem de se comportar igual.
   */
  exibirEstrofe(index, { semScroll: opts.rolarComoNasSetas !== true });
}

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

/** Monitores que estavam guardados e já não existem — preenchido ao restaurar a rota. */
let preVooMonitoresEmFalta = [];

/** Evita duas verificações em paralelo se o operador clicar duas vezes. */
let preVooACorrer = false;

/** Músicas reais do culto, sem os marcadores de tema. */
function musicasDoCultoParaPreVoo() {
  if (!cultoId) return [];
  const pl = getPlaylist(cultoId);
  if (!Array.isArray(pl)) return [];
  return pl.filter((it) => it && !ehMarcadorTemaPlaylist(it));
}

/**
 * Vai buscar a letra de cada música do culto.
 *
 * Em paralelo, e com o erro de cada uma isolado: uma música apagada devolve 404, e isso é
 * precisamente um dos achados que se procura — não uma falha que deva derrubar a
 * verificação inteira.
 *
 * @param {object[]} itens
 */
async function carregarLetrasParaPreVoo(itens) {
  const base = getControllerApiBase();
  return Promise.all(
    itens.map(async (item) => {
      const id = idMusicaParaPreVoo(item);
      if (id == null) return { item, musica: null, erro: true };
      const fonte = item?.bancoFonte === 'catalog' ? '?fonte=catalog' : '';
      try {
        const r = await fetch(`${base}/api/musicas/${id}${fonte}`);
        if (!r.ok) return { item, musica: null, erro: true };
        return { item, musica: await r.json(), erro: false };
      } catch (_) {
        return { item, musica: null, erro: true };
      }
    })
  );
}

/**
 * Confirma no disco os vídeos que o modo Mídias vai usar.
 *
 * Só itens com `filePath` — imagens e PDF viajam embutidos no estado e não têm como
 * desaparecer. Sem a ponte disponível (painel aberto fora do Electron), devolve lista
 * vazia: é preferível não verificar do que inventar que está tudo bem.
 */
async function verificarMidiasNoDiscoParaPreVoo() {
  const todos = [
    ...(apresentacaoBiblioteca || []),
    ...(apresentacaoCards || []),
    ...(apresentacaoVideoPlaylist || []),
    ...(apresentacaoAudios || []),
  ].filter((it) => it && String(it.filePath || '').trim());

  if (!todos.length) return [];
  const api = window.lyraElectron;
  if (!api || typeof api.verificarArquivosExistem !== 'function') return [];

  /* Um caminho pode estar em vários sítios (biblioteca e card): perguntar uma vez só. */
  const caminhos = [...new Set(todos.map((it) => String(it.filePath).trim()))];
  try {
    const res = await api.verificarArquivosExistem(caminhos);
    const mapa = new Map((res || []).map((r) => [r.caminho, !!r.existe]));
    return caminhos.map((c) => ({
      caminho: c,
      filePath: c,
      name: todos.find((it) => String(it.filePath).trim() === c)?.name || c,
      existe: mapa.get(c) !== false,
    }));
  } catch (_) {
    return [];
  }
}

/** Corre as quatro verificações e desenha o resultado. */
async function correrPreVooDoCulto() {
  if (preVooACorrer) return;
  preVooACorrer = true;

  abrirPainelPreVoo();
  desenharPreVooACarregar();

  try {
    const itens = musicasDoCultoParaPreVoo();

    /* Telas e tons saem do que já está em memória; letras e mídias precisam de ir buscar.
       As duas idas acontecem ao mesmo tempo — não dependem uma da outra. */
    const [carregadas, midias] = await Promise.all([
      itens.length ? carregarLetrasParaPreVoo(itens) : Promise.resolve([]),
      verificarMidiasNoDiscoParaPreVoo(),
    ]);

    /* Telas: não ler os seletores do cabeçalho (`rotaSelecionadaNaUi`). Esses reflectem o
       modo/aba aberto (Home→completo, Slides→slides, …). No Home o completo pode estar em
       «Não exibir» enquanto o telão do culto (slides) já tem monitor — e o pré-voo acusava
       «nenhum monitor a receber o telão» só por causa da aba. A verificação do culto olha
       a rota de infraestrutura, independente do modo activo. */
    let rota = null;
    try {
      const slides = obterRotaSlidesParaUi();
      const completo = sanitizarRotaProjecao(
        normalizarRota(rotasPorModo.completo),
        monitoresServidorCache
      );
      rota =
        slides.live || slides.publicoIndex >= 0
          ? slides
          : completo.live || completo.publicoIndex >= 0
            ? completo
            : slides;
    } catch (_) {
      rota = null;
    }

    const resultado = consolidar([
      verificarTelas(rota, monitoresServidorCache, preVooMonitoresEmFalta),
      verificarPlaylistVazia(itens),
      verificarTonsEMinistrantes(
        itens.map((it) => ({
          ...it,
          titulo: it.titulo || it.nome || '',
          ministranteNome: nomeMinistrantePorId(it.ministranteId),
        }))
      ),
      verificarLetras(carregadas),
      verificarMidias(midias),
    ]);

    desenharResultadoPreVoo(resultado, itens.length);
  } catch (e) {
    desenharErroPreVoo(e);
  } finally {
    preVooACorrer = false;
  }
}

function abrirPainelPreVoo() {
  const bd = document.getElementById('prevoo-backdrop');
  if (!bd) return;
  bd.classList.add('aberto');
  bd.setAttribute('aria-hidden', 'false');
  document.getElementById('prevoo-ok')?.focus();
}

function fecharPainelPreVoo() {
  const bd = document.getElementById('prevoo-backdrop');
  if (!bd) return;
  bd.classList.remove('aberto');
  bd.setAttribute('aria-hidden', 'true');
}

function desenharPreVooACarregar() {
  const corpo = document.getElementById('prevoo-corpo');
  const sub = document.getElementById('prevoo-sub');
  if (sub) sub.textContent = 'A verificar…';
  if (corpo) {
    corpo.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'prevoo-tudo-bem';
    d.innerHTML =
      '<div class="prevoo-tudo-bem-tit">A verificar o culto…</div>' +
      '<div class="prevoo-tudo-bem-det">Telas, tons, letras e mídias.</div>';
    corpo.appendChild(d);
  }
}

function desenharErroPreVoo(e) {
  const corpo = document.getElementById('prevoo-corpo');
  const sub = document.getElementById('prevoo-sub');
  if (sub) sub.textContent = 'A verificação não terminou';
  if (!corpo) return;
  corpo.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'prevoo-tudo-bem';
  const tit = document.createElement('div');
  tit.className = 'prevoo-tudo-bem-tit';
  tit.textContent = 'Não foi possível verificar tudo';
  const det = document.createElement('div');
  det.className = 'prevoo-tudo-bem-det';
  /* Sem lista parcial: meia verificação lida como completa é pior do que nenhuma. */
  det.textContent =
    'Algo falhou a meio, por isso não há resultado de confiança para mostrar. ' +
    'Tente «Verificar de novo». (' + ((e && e.message) || e) + ')';
  d.appendChild(tit);
  d.appendChild(det);
  corpo.appendChild(d);
}

/**
 * @param {{achados: object[], impedem: number, atencao: number, tudoBem: boolean}} r
 * @param {number} quantasMusicas
 */
function desenharResultadoPreVoo(r, quantasMusicas) {
  const corpo = document.getElementById('prevoo-corpo');
  const sub = document.getElementById('prevoo-sub');
  const nota = document.getElementById('prevoo-nota');
  if (!corpo) return;

  const nomeCulto = nomeCultoAtivoParaHistorico();
  if (sub) {
    sub.textContent =
      (nomeCulto ? `${nomeCulto} · ` : '') +
      `${quantasMusicas} música${quantasMusicas === 1 ? '' : 's'} · ${resumoPreVoo(r)}`;
  }
  if (nota) {
    nota.textContent = r.tudoBem
      ? ''
      : 'Nada foi alterado — o pré-voo só relata.';
  }

  corpo.innerHTML = '';

  if (r.tudoBem) {
    const d = document.createElement('div');
    d.className = 'prevoo-tudo-bem';
    const ico = document.createElement('div');
    ico.className = 'prevoo-tudo-bem-ico';
    ico.textContent = '✓';
    const tit = document.createElement('div');
    tit.className = 'prevoo-tudo-bem-tit';
    tit.textContent = 'Tudo pronto';
    const det = document.createElement('div');
    det.className = 'prevoo-tudo-bem-det';
    det.textContent =
      'As telas estão configuradas, as músicas têm letra e tom, e os ficheiros de mídia ' +
      'estão onde deviam. Pode começar.';
    d.appendChild(ico);
    d.appendChild(tit);
    d.appendChild(det);
    corpo.appendChild(d);
    return;
  }

  r.achados.forEach((a) => {
    const linha = document.createElement('div');
    linha.className = 'prevoo-item' + (a.gravidade === GRAVIDADE_IMPEDE ? ' impede' : '');
    const txt = document.createElement('div');
    txt.className = 'prevoo-item-txt';
    const tit = document.createElement('div');
    tit.className = 'prevoo-item-tit';
    tit.textContent = a.titulo;
    const det = document.createElement('div');
    det.className = 'prevoo-item-det';
    det.textContent = a.detalhe;
    txt.appendChild(tit);
    txt.appendChild(det);
    linha.appendChild(txt);
    corpo.appendChild(linha);
  });
}

(function iniciarPreVoo() {
  document.getElementById('prevoo-fechar')?.addEventListener('click', fecharPainelPreVoo);
  document.getElementById('prevoo-ok')?.addEventListener('click', fecharPainelPreVoo);
  document.getElementById('prevoo-repetir')?.addEventListener('click', () => {
    void correrPreVooDoCulto();
  });
  document.getElementById('prevoo-backdrop')?.addEventListener('click', (e) => {
    if (e.target?.id === 'prevoo-backdrop') fecharPainelPreVoo();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const bd = document.getElementById('prevoo-backdrop');
    if (bd?.classList.contains('aberto')) {
      e.preventDefault();
      fecharPainelPreVoo();
    }
  });
})();
