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
 *   roteamentoTelasUi.js — seletores de roteamento de telas do cabeçalho (menus, rótulos de monitor, estado desativado, aplicar rota)
 *   slidesRailLayout.js — altura da faixa de slides e da prévia (limites, persistência, redimensionamento por arraste)
 *   temasPlaylistUi.js — temas da playlist na interface: seletor, dropdowns «Lyra select», excluir/selecionar tema
 *   playlistServidor.js — playlists: envio ao servidor, emissão na rede, gravação local, remoção de música/versão e seleção na interface
 *   playlistLinhaUi.js — playlist: rótulos de versão na linha, rolagem até a música ativa e ligação dos botões/seletores da linha
 * =============================================================================
 */

import { montarHomeLayout } from './painel/homeLayout.js';

import {
  LS_UI_MODO_SLIDES,
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
  normalizarFonteLetrasSite,
  placeholderBuscaLetrasPorFonte,
} from './modules/fonteLetrasSite.js';
import {
  criarSlidesGrelha,
} from './modules/slidesGrelha.js';
import {
  definirLembrarMonitor,
} from './modules/monitorLembrado.js';
import { fecharMenuFlutuanteAberto } from './modules/menuFlutuante.js';
import { exporCallbacksParaAtributosHtml } from './modules/ponteHtmlWindow.js';
import {
  configurarNotasSlideControlador,
} from './modules/notasSlideControlador.js';
import { iniciarDicasDeTextoTruncado } from './modules/dicaTexto.js';

migrarChavesLegadoLocalStorage();
import { escapeHtml } from './painel/textoHtmlSeguro.js';
import {
  reaplicarFontesPreviewPainel,
} from './painel/tipografiaPainelPreview.js';
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
  garantirAberturaNoCatalogoCulto,
  garantirMarcadorAberturaNaPlaylist,
  loadAberturaRemovidaPorCulto,
  loadMinistrantePadraoPorCulto,
  loadPlaylists,
  loadTemaSelecionadoPorCulto,
  loadTemasPorCulto,
  normalizarTemaPlaylist,
  podarMinistrantePadraoSemMusicasNaPlaylist,
  registrarDependenciasPlaylistTemas,
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
  getModalSincronizarTimerAutoFechar,
  marcarBancoCompartilhadoAlterado,
  recuperarPedidoSyncBancoPendente,
  registrarDependenciasSincronizacaoBanco,
  setSharedBancoLocalUpdatedAt,
  tratarPedidoSyncBancoDirecto,
} from './painel/sincronizacaoBanco.js';
import {
  registrarDependenciasPlaylistTransmitidas,
} from './painel/playlistTransmitidas.js';
import {
  garantirMinistrantesCarregados,
  iniciarSyncPeriodicoTonsInvb,
  nomeMinistrantePorId,
  registrarDependenciasMinistrantesTons,
  renderListaCfgMinistrantes,
} from './painel/ministrantesTons.js';
import {
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
  projetarAvisoCard6,
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
  normalizarRota,
  persistirIdentidadesDosModos,
  registrarDependenciasRotasMonitores,
  rotaDesativada,
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
import {
  aplicarRotaDoModoAtualNaUiEServidor,
  atualizarEstiloRotasDesativadas,
  avisarMonitoresConfiguradosEmFalta,
  fecharMenusRoteamentoTelas,
  impedirSelecaoDeTextoNoDuploClique,
  indiceRoteamentoMonitorNaUi,
  montarLabelMonitor,
  montarTitleMonitor,
  registrarDependenciasRoteamentoTelasUi,
  renderRoteamentoTelas,
  rotaSelecionadaNaUi,
  rotuloRotaApresentacaoForaDoPreset,
  setupMenusRoteamentoTelas,
} from './painel/roteamentoTelasUi.js';
import {
  alturaPreviewModAtualPx,
  aplicarAlturaPreviewMod,
  clampSlidesRailHeight,
  initAlturaPreviewModFromStorage,
  initSlidesRailHeightFromStorage,
  registrarDependenciasSlidesRailLayout,
  setupSlidesRailResize,
} from './painel/slidesRailLayout.js';
import {
  excluirTemaDoCulto,
  fecharOutrosSeletoresDropdown,
  getTemaSelecionadoAtual,
  obterTemasDisponiveisPlaylist,
  playlistAtualJaTemTema,
  registrarDependenciasTemasPlaylistUi,
  renderItensLyraSelectDropdown,
  renderSeletorTemasPlaylist,
  setTemaSelecionadoAtual,
  setupLyraSelectDropdownWrap,
} from './painel/temasPlaylistUi.js';
import {
  aplicarSelecaoUiBiblioteca,
  aplicarSelecaoUiPlaylist,
  atualizarRotuloVersaoNasPlaylists,
  emitirPlaylistsDoControlador,
  enviarPlaylistsParaServidor,
  getPlaylist,
  indiceProximaMusicaNaPlaylist,
  playlistItemMesmaVersaoQueAtiva,
  playlistItemMesmaVersaoQueSelecaoUi,
  registrarDependenciasPlaylistServidor,
  removerMusicaDeTodasPlaylists,
  removerVersaoLocalDasPlaylists,
  repontarVersaoNaPlaylistDoCulto,
  savePlaylists,
} from './painel/playlistServidor.js';
import {
  formatarRotuloVersaoExibicao,
  garantirMusicaAtivaVisivelNaPlaylist,
  ligarBotoesESeletoresLinhaPlaylist,
  rotuloVersaoMaiusculo,
  sufixoRotuloVersaoPlaylist,
} from './painel/playlistLinhaUi.js';
import { APRESENTACAO_IDX_CARD5, estadoPainel, projecao } from './painel/estadoPainel.js';

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
  emModoProjecaoLocal: (...a) => emModoProjecaoLocal(...a),
  interromperReconexaoSocket: (...a) => interromperReconexaoSocket(...a),
  correrPreVooDoCulto: (...a) => correrPreVooDoCulto(...a),
  recarregarPainelControlador: (...a) => recarregarPainelControlador(...a),
  alternarProjecaoNestaMaquina: (...a) => alternarProjecaoNestaMaquina(...a),
  abrirCfgModal: (...a) => abrirCfgModal(...a),
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
  getReconhecimentoVozSlides: () => reconhecimentoVozSlides,
  getUltimoConteudoProjetadoModoUnificado: () => getUltimoConteudoProjetadoModoUnificado(),
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
  getBibliaCfgExibicao,
  getBibliaCfgMinistrante,
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
});
registrarDependenciasPlaylistTemas({
  getControllerApiBase,
  getPlaylist,
  getTemaSelecionadoAtual,
  marcarBancoCompartilhadoAlterado,
  savePlaylists,
  setTemaSelecionadoAtual,
});
registrarDependenciasCopiasLocaisPainel({
  getControllerApiBase,
});
registrarDependenciasCultoDoDia({
  fecharOutrosSeletoresDropdown,
  initCultoSelect,
  marcarBancoCompartilhadoAlterado,
  onCultoChange,
  savePlaylists,
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
});
registrarDependenciasPlaylistTransmitidas({
  ehModoSlidesOperador,
  encerrarProjecaoDoControlador,
  getPlaylist,
  indiceProximaMusicaNaPlaylist,
  playlistItemMesmaVersaoQueAtiva,
  playlistItemMesmaVersaoQueSelecaoUi,
  renderPlaylist,
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
});
registrarDependenciasPlaylistAdicionar({
  formatarRotuloVersaoExibicao,
  getControllerApiBase,
  getPlaylist,
  getTemaSelecionadoAtual,
  onCultoChange,
  rotuloVersaoMaiusculo,
  savePlaylists,
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
});
registrarDependenciasBibliotecaMidiasApresentacao({
  atualizarFeedbackProjecaoApresentacaoUi,
  emitirEncerrarApresentacaoPublicoAoServidor,
  escolherArquivoModoApresentacao,
  salvarEstadoModoApresentacaoNoStorage,
  sincronizarPillProjecaoNav,
  adicionarArquivosAoMenu,
  renderGridApresentacao,
});
registrarDependenciasPlaylistVideoApresentacao({
  atualizarFeedbackProjecaoApresentacaoUi,
  atualizarRodapeAudioApresentacao,
  encerrarModoApresentacaoNoTelao,
  salvarEstadoModoApresentacaoNoStorage,
  renderGridApresentacao,
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
  getApresentacaoAvisoCard6Ativo: () => getApresentacaoAvisoCard6Ativo(),
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
  getSlidesGrelha: () => slidesGrelha,
});
registrarDependenciasProjecaoLocalObs({
  atualizarUiConexao,
  carregarRoteamentoTelasDoServidor,
  ehModoBibliaOperador,
  emitirEstadoMinistranteAoServidor,
  getServidorIp,
  recordarIpsDestaMaquina,
  setStatusServidorRemoto,
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
});
registrarDependenciasRemoverMusicaBanco({
  ehModoSlidesOperador,
  getControllerApiBase,
  marcacaoEstrofeEditor,
  removerMusicaDeTodasPlaylists,
  atualizarPreviewOperador,
});
registrarDependenciasTituloAberturaPreview({
  getPlaylist,
  playlistItemMesmaVersaoQueAtiva,
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
});
registrarDependenciasPreviewOculto({
  classificarSaidaMonitorMinistranteSlides,
  classificarSaidaMonitorPublicoSlides,
  ehModoApresentacaoOperador,
  ehModoBibliaOperador,
  ehModoSlidesOperador,
  indicesEfetivosRoteamentoDualCliente,
  normalizarRota,
});
registrarDependenciasToolbarEdicaoHome({
  atualizarRotuloVersaoNasPlaylists,
  getControllerApiBase,
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
  getApresentacaoAvisoCard6Ativo: () => getApresentacaoAvisoCard6Ativo(),
  setApresentacaoAvisoCard6Ativo: (valor) => {
    setApresentacaoAvisoCard6Ativo(valor);
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
  getSlidesGrelha: () => slidesGrelha,
  getUltimoConteudoProjetadoModoUnificado: () => getUltimoConteudoProjetadoModoUnificado(),
  setUltimoConteudoProjetadoModoUnificado: (valor) => {
    setUltimoConteudoProjetadoModoUnificado(valor);
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
});
registrarDependenciasCanaisProjecao({
  atualizarEstiloRotasDesativadas,
  ehModoSlidesOperador,
  renderRoteamentoTelas,
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
});
registrarDependenciasRoteamentoTelasUi({
  ehModoSlidesOperador,
  fecharOutrosSeletoresDropdown,
});
registrarDependenciasSlidesRailLayout({
  ehModoSlidesOperador,
});
registrarDependenciasTemasPlaylistUi({
  fecharMenuOverflowPlaylist,
  getPlaylist,
  playlistItemMesmaVersaoQueAtiva,
  savePlaylists,
});
registrarDependenciasPlaylistServidor({
  getControllerApiBase,
  hostProjecao,
});
// (extraído) estado compartilhado → painel/estadoPainel.js

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


// --- SECÇÃO D — Faixa de slides (dock), zoom, chips; geometria em slidesGrelha.js ---
const slidesGrelha = criarSlidesGrelha({
  ehModoSlidesOperador,
  getMusicaAtiva: () => estadoPainel.musicaAtiva,
  getEstrofeAtiva: () => estadoPainel.estrofeAtiva,
  getFaixaHabilitada: () => estadoPainel.faixaSlidesHabilitadaPorPlaylistNoModoSlides,
  getProjecaoEmitida: () => estadoPainel.projecaoMusicaEmitidaNoServidor,
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

// (extraído) seletores de roteamento de telas → painel/roteamentoTelasUi.js

// (extraído) altura da faixa de slides e da prévia → painel/slidesRailLayout.js



// (extraído) seleção do card de 4 imagens → painel/gridApresentacao.js

/** As quatro áreas exibem imagens; o mesmo critério que a prévia dos outros cards usa. */
function ehItemImagemApresentacao(it) {
  const kind = String(it?.kind || '').toLowerCase();
  const mime = String(it?.mime || '').toLowerCase();
  return kind === 'image' || mime.startsWith('image/') || /^data:image\//i.test(String(it?.src || ''));
}

// (extraído) sincronização do estado → painel/estadoApresentacao.js
// (extraído) timer do aviso ao vivo → painel/conteudoUnificadoAviso.js


document.addEventListener('mousemove', (e) => {
  if (!estadoPainel.slidesRailDrag.active) return;
  if (estadoPainel.slidesRailDrag.alvo === 'previa') {
    /* Para baixo (dy > 0) = prévias maiores, grelha menor. */
    aplicarAlturaPreviewMod(estadoPainel.slidesRailDrag.startH + (e.clientY - estadoPainel.slidesRailDrag.startY));
    return;
  }
  const dy = estadoPainel.slidesRailDrag.startY - e.clientY;
  const nh = clampSlidesRailHeight(estadoPainel.slidesRailDrag.startH + dy);
  document.documentElement.style.setProperty('--slides-rail-height', nh + 'px');
});

document.addEventListener('mouseup', () => {
  if (!estadoPainel.slidesRailDrag.active) return;
  estadoPainel.slidesRailDrag.active = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  if (estadoPainel.slidesRailDrag.alvo === 'previa') {
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

// (extraído) temas da playlist na interface → painel/temasPlaylistUi.js

// (extraído) sincronização do banco → painel/sincronizacaoBanco.js

// (extraído) playlists: servidor e seleção → painel/playlistServidor.js

// (extraído) playlist: transmitidas → painel/playlistTransmitidas.js

function initCultoSelect() {
  const hid = document.getElementById('culto-sel');
  const menu = document.getElementById('culto-dd-menu');
  if (!hid || !menu) return;
  menu.innerHTML = '';
  const lista = listarCultosDisponiveis();
  estadoPainel.cultosDoMesCache = [...lista];
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
    estadoPainel.cultoId = '';
    setCultoSelecionadoNaUi('');
    return;
  }
  lista.forEach((c) => {
    mkItem(c.id, c.label, cultoIdEhManual(c.id));
  });
  if (!lista.some((c) => c.id === estadoPainel.cultoId)) {
    estadoPainel.cultoId = '';
  }
  setCultoSelecionadoNaUi(estadoPainel.cultoId);
}

function onCultoChange() {
  estadoPainel.cultoId = document.getElementById('culto-sel')?.value || '';
  setCultoSelecionadoNaUi(estadoPainel.cultoId);
  if (estadoPainel.cultoId) {
    garantirAberturaNoCatalogoCulto(estadoPainel.cultoId);
    if (garantirMarcadorAberturaNaPlaylist(estadoPainel.cultoId)) savePlaylists();
  }
  renderSeletorTemasPlaylist();
  renderPlaylist();
}

// (extraído) playlist: linha → painel/playlistLinhaUi.js

// (extraído) ministrantes e tons → painel/ministrantesTons.js

// (extraído) playlist: lista e arrastar/soltar → painel/playlistLista.js


// (extraído) playlist: adicionar → painel/playlistAdicionar.js

// (extraído) playlist: menus → painel/playlistMenus.js

// (extraído) título de abertura → painel/tituloAberturaPreview.js


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
  if (!estadoPainel.musicaAtiva || idx < 0 || idx >= estadoPainel.musicaAtiva.estrofes.length) return;
  const emitSocket = opts.emitSocket !== false;
  const posCaretAposSplit = opts.posCaretAposSplit;
  const parts = splitTextoEmEstrofesPorLinhaVaziaStrict(texto);
  const eraProjecaoNesteIndice = estadoPainel.estrofeAtiva === idx;
  const delta = parts.length - 1;

  if (parts.length === 1) {
    estadoPainel.musicaAtiva.estrofes[idx] = parts[0];
  } else {
    estadoPainel.musicaAtiva.estrofes.splice(idx, 1, ...parts);
    if (estadoPainel.estrofeAtiva > idx) estadoPainel.estrofeAtiva += delta;
    else if (estadoPainel.estrofeAtiva === idx) estadoPainel.estrofeAtiva = idx;
  }

  renderSlidesStrip();
  atualizarPreviewOperador();
  renderEstrofesEditor();
  marcacaoEstrofeEditor();

  if (emitSocket && projecao.pronta() && eraProjecaoNesteIndice && estadoPainel.projecaoMusicaEmitidaNoServidor) {
    projecao.enviar('exibir_musica', montarPayloadExibirMusica(estadoPainel.estrofeAtiva));
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
  if (!estadoPainel.musicaAtiva || !estadoPainel.modoEdicaoEstrofes) return;
  const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
  if (!tas.length) return;
  const novas = [];
  for (const ta of tas) {
    novas.push(...splitTextoEmEstrofesPorLinhaVaziaStrict(ta.value));
  }
  estadoPainel.musicaAtiva.estrofes = novas.length ? novas : [''];
  if (estadoPainel.estrofeAtiva >= estadoPainel.musicaAtiva.estrofes.length) {
    estadoPainel.estrofeAtiva = Math.max(0, estadoPainel.musicaAtiva.estrofes.length - 1);
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
  return normalizarFonteLetrasSite(estadoPainel.letrasSiteFonte);
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
    btn.setAttribute('aria-expanded', estadoPainel.bancoSqliteListaExpandida ? 'true' : 'false');
    btn.title = estadoPainel.bancoSqliteListaExpandida ? 'Recolher lista de músicas' : 'Expandir lista de músicas';
  }
  if (lista) {
    lista.classList.toggle('lista-sqlite--recolhida', !estadoPainel.bancoSqliteListaExpandida);
    lista.setAttribute('aria-hidden', estadoPainel.bancoSqliteListaExpandida ? 'false' : 'true');
  }
  if (legenda) {
    // A legenda agora pertence ao rodapé fixo, não ao conteúdo recolhível da lista.
    legenda.hidden = false;
  }
  if (aviso) {
    aviso.hidden = estadoPainel.bancoSqliteListaExpandida;
  }
  /* Lista recolhida: nada para navegar, e a régua ficaria flutuando sobre o aviso. */
  const navAlfabeto = document.getElementById('bib-nav-alfabeto');
  if (navAlfabeto) navAlfabeto.hidden = !estadoPainel.bancoSqliteListaExpandida;
}

function alternarListaBancoSqlite() {
  estadoPainel.bancoSqliteListaExpandida = !estadoPainel.bancoSqliteListaExpandida;
  try {
    localStorage.setItem(LS_BANCO_SQLITE_LISTA_ABERTA, estadoPainel.bancoSqliteListaExpandida ? '1' : '0');
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
  if (!estadoPainel.modoLetraCompletaCentral || !estadoPainel.musicaAtiva || escDaHomeTemCamadaPorCima()) return false;
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
    } else if (ehModoSlidesOperador() && projecao.pronta() && estadoPainel.projecaoMusicaEmitidaNoServidor) {
      /* O modo slide já encerrava com o foco fora de campo; isto cobre o caso simétrico,
         que falhava pela mesma razão e que ninguém notava por ali se digitar menos. */
      e.preventDefault();
      estadoPainel.slidesRailUserRecolhido = true;
      encerrarProjecaoDoControlador({ limparMusica: true });
      return;
    } else if (
      estadoPainel.modoLetraCompletaCentral &&
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
        (estadoPainel.estadoServidor && estadoPainel.estadoServidor.projecaoBibliaMinistrante) ||
        (estadoPainel.estadoServidor &&
          estadoPainel.estadoServidor.tipo === 'biblia' &&
          !estadoPainel.estadoServidor.telaLimpa &&
          Array.isArray(estadoPainel.estadoServidor.linhas) &&
          estadoPainel.estadoServidor.linhas.length)
      ) {
        e.preventDefault();
        encerrarProjecaoModoBiblia();
      }
      return;
    }
    if (ehModoSlidesOperador()) {
      e.preventDefault();
      estadoPainel.slidesRailUserRecolhido = true;
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
  estadoPainel.playlists = loadPlaylists();
  estadoPainel.cultosManuaisCache = loadCultosManuais();
  estadoPainel.temaSelecionadoPorCulto = loadTemaSelecionadoPorCulto();
  estadoPainel.temasPorCulto = loadTemasPorCulto();
  setAberturaRemovidaPorCulto(loadAberturaRemovidaPorCulto());
  setMinistrantePadraoPorCulto(loadMinistrantePadraoPorCulto());
  podarMinistrantePadraoSemMusicasNaPlaylist();
  migrarPlaylistsCultosAntigos();
  carregarEstadoModoApresentacaoDoStorage();
  const avisoCard6CfgSalva = carregarAvisoCard6CfgDoStorage();
  if (avisoCard6CfgSalva) estadoPainel.apresentacaoCard6AvisoCfg = avisoCard6CfgSalva;
  carregarBibliaCfgDoStorage();
  setupCultoDropdown();
  setupLyraSelectDropdownWrap(document.getElementById('traducao-sel-dd'));
  setupAdicionarCultoManual();
  configurarNotasSlideControlador({
    obterMusicaId: () => (estadoPainel.musicaAtiva && estadoPainel.musicaAtiva.id != null ? Number(estadoPainel.musicaAtiva.id) : null),
    obterVersaoLocalId: () => estadoPainel.musicaVersaoLocalId,
    obterEstrofeAtiva: () => estadoPainel.estrofeAtiva,
    obterNumSlides: () =>
      estadoPainel.musicaAtiva && Array.isArray(estadoPainel.musicaAtiva.estrofes) ? estadoPainel.musicaAtiva.estrofes.length : 0,
    ehModoSlides: ehModoSlidesOperador,
  });
  configurarBibliotecaMidiasApresentacao();
  carregarDocsBibliotecaDoStorage();
  configurarBuscaDocsImportados();
  renderListaDocsImportados();
  estadoPainel.cultoId = resolverCultoInicialPorAgenda();
  initCultoSelect();
  if (estadoPainel.cultoId) onCultoChange();
  document.body.classList.remove('app-mod-slides');
  document.body.classList.remove('app-mod-apresentacao');
  document.body.classList.remove('app-mod-biblia');
  document.body.classList.remove('slides-rail-aberto');
  document.title = 'Lyra — Controlador';
  localStorage.setItem(LS_UI_MODO_SLIDES, '0');
  estadoPainel.slidesDockVisivel = false;
  estadoPainel.faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
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
  estadoPainel.rotasPorModo.apresentacao = rotaDesativada();
  estadoPainel.rotasPorModo.biblia = rotaDesativada();
  const ip = hostProjecao();
  if (!ip) return;
  try {
    const payload = JSON.stringify({
      version: 2,
      slides: normalizarRota(estadoPainel.rotasPorModo.slides),
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
estadoPainel.homeLayout = montarHomeLayout({
  filtrar,
  atualizar: atualizarToolbarModoEdicao,
  renderPreview: atualizarPreviewPlaylistCentral,
  cartoes: async () => {
    if (!(await sairModoComparativoParaTrocarModo())) return;
    if (estadoPainel.modoLetraCompletaCentral) await irParaGradeSlidesDesdeLetraCompleta();
  },
  letraCompleta: async () => {
    if (!estadoPainel.musicaAtiva || estadoPainel.modoLetraCompletaCentral) return;
    if (!(await sairModoComparativoParaTrocarModo())) return;
    entrarModoLetraCompletaCentral();
  },
  renomearVersao: (nome) => renomearVersaoSelecionadaComNome(nome),
  novoSlide: async () => {
    if (!estadoPainel.musicaAtiva) return;
    if (!estadoPainel.modoEdicaoEstrofes) {
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
  if (estadoPainel.apresentacaoCard4InputTarget !== null) {
    const sub = estadoPainel.apresentacaoCard4InputTarget;
    estadoPainel.apresentacaoCard4InputTarget = null;
    adicionarImagemNaAreaCard4(f, sub);
  } else {
    adicionarArquivoDiretoNoCard(f, estadoPainel.apresentacaoCardInputTarget ?? 0);
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
  const nextVol = Math.min(1, Math.round((Number(estadoPainel.audioStateRemoto.volume) + 0.1) * 10) / 10);
  definirVolumeAudioServidor(nextVol);
});
document.getElementById('ap-audio-vol-down')?.addEventListener('click', () => {
  const nextVol = Math.max(0, Math.round((Number(estadoPainel.audioStateRemoto.volume) - 0.1) * 10) / 10);
  definirVolumeAudioServidor(nextVol);
});
document.getElementById('ap-audio-seek')?.addEventListener('mousedown', () => { estadoPainel.audioSeekDragging = true; });
document.getElementById('ap-audio-seek')?.addEventListener('mouseup', (e) => {
  estadoPainel.audioSeekDragging = false;
  const val = Math.max(0, Math.min(1000, Number(e?.target?.value || 0)));
  const dur = Math.max(0, Number(estadoPainel.audioStateRemoto.duration) || 0);
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
    estadoPainel.monitoresServidorCache
  );
  sincronizarCheckboxLembrarMonitor();
});

document.getElementById('hdr-encerrar-projecao')?.addEventListener('click', () => {
  if (ehModoApresentacaoOperador()) {
    void encerrarProjecaoMidiaCabecalhoModoApresentacao();
  } else if (ehModoBibliaOperador()) {
    encerrarProjecaoModoBiblia();
  } else if (ehModoSlidesOperador()) {
    estadoPainel.slidesRailUserRecolhido = true;
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
  estadoPainel.companionHandoffEmCurso = false;
  estadoPainel.autoConectarAoIniciarEmCurso = true;
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
    estadoPainel.autoConectarAoIniciarEmCurso = false;
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
    if (querAuto) estadoPainel.autoConectarAoIniciarEmCurso = true;
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
