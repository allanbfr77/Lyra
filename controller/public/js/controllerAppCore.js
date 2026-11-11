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
 * =============================================================================
 */

import { montarHomeLayout, organizarVersoesHome, atualizarVersoesHome } from './painel/homeLayout.js';

import {
  LS_UI_MODO_SLIDES,
  LS_PREVIEW_PAINEL_OCULTO,
  LS_MODO_APRESENTACAO_ATIVO,
  LS_ROTAS_POR_MODO,
  LS_APRESENTACAO_STATE,
  SVG_OLHO_ABERTO,
  SVG_OLHO_CORTADO,
  LS_PLAYLISTS,
  LS_PLAYLISTS_LEGACY,
  LS_CULTOS_MANUAIS,
  LS_PLAYLIST_TEMA_SEL,
  LS_PLAYLIST_TEMAS,
  LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS,
  LS_PLAYLIST_ABERTURA_REMOVIDA,
  LS_PLAYLIST_MINISTRANTE_PADRAO,
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
  CLOUD_SHARE_URL,
  CLOUD_INVB_TONS_SYNC_URL,
  LS_INVB_TONS_SYNC_AT,
  LS_BANCO_SQLITE_LISTA_ABERTA,
  SVG_PLAYLIST_SECAO_EXPANDIR,
  SVG_PLAYLIST_SECAO_RECOLHER,
} from './modules/chavesArmazenamentoLocal.js';
import { migrarChavesLegadoLocalStorage } from './modules/migrarChavesArmazenamentoLocal.js';
import {
  resolverProximoCultoPorHorarioBrasilia,
  isoFromCultoId,
  ordenarCultosPorData,
} from './modules/proximoCulto.js';
import {
  gerarCultosDoMes,
  dataReferenciaCalendarioCultos,
  cultoIdPertenceAoMes,
  gerarCultosParaDataManual,
  parseLabelCulto,
  labelFallbackDeCultoIdImport,
} from './modules/cultosCalendario.js';
import {
  ehVersaoLocalLegada,
  ehVersaoServidorId,
  criarMapaCopiasLocais,
} from './modules/copiasLocaisLetra.js';
import {
  versaoLocalIdTrimado,
  idFetchMusicaPlaylist,
  idMusicaParaPreVoo,
  fonteBancoNormalizada,
  fonteBancoItemPlaylist,
  ehMarcadorTemaPlaylist,
  opcoesVersaoDistintasPorConteudo,
  versoesConteudoRigorosamenteIdentico,
  playlistJaContemMesmaMusicaEVersao,
  playlistItemMesmaVersaoQueRaiz,
  VALOR_OPCAO_VERSAO_ORIGINAL,
  decidirAcaoAdicionarVersaoAtivaNaPlaylist,
  substituirVersaoItemPlaylist,
  ACAO_JA_PRESENTE_PLAYLIST,
  ACAO_CONFIRMAR_TROCA_VERSAO_PLAYLIST,
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
  detectarKindApresentacaoPorMimeOuNome,
  ehArquivoPowerPointLocal,
  rotuloTipoMidiaApresentacao,
  svgIconeTipoMidiaApresentacao,
  srcImagemApresentacaoSeguro,
  fmtTempoAudio,
  obterThumbVideoApresentacao,
  reescreverUrlVideoParaTelas as reescreverUrlVideoParaTelasPuro,
  urlMidiaApresentacaoHttpPorId as urlMidiaApresentacaoHttpPorIdPuro,
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
  htmlCorpoLinhaPlaylistComTom,
  htmlCorpoLinhaPlaylistSimples,
  carregarMinistrantesDoServidor,
  criarMinistranteNoServidor,
  garantirMinistrantePorNomeNoServidor,
  renomearMinistranteNoServidor,
  excluirMinistranteNoServidor,
  buscarTomMemoria,
  limparMinistranteDasPlaylists,
  limparMinistrantePadraoPorCulto,
  normalizarMinistrantePadraoPorCulto,
  obterCacheMinistrantes,
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
  compararLetras,
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
  appPrompt,
  appEscolherOpcao,
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
  atualizarEstadoAdicionadasListaLocal,
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

/*
 * Diálogo do app, menu Lyra e banner de atualização vivem em painel/. As dependências do núcleo são
 * registadas aqui, no topo, antes de qualquer diálogo poder abrir. Tudo é lido de forma preguiçosa
 * (funções que chamam a do núcleo / getters): as variáveis do núcleo são reatribuídas mais adiante.
 */
registrarDependenciasAppDialog({
  getModalSincronizarTimer: () => modalSincronizarTimerAutoFechar,
  getModalImportarTimer: () => modalImportarTimerAutoFechar,
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

/** Publica vídeo local no HTTP :3001 e devolve URL (evita Base64 enorme no POST ao servidor). */
async function publicarVideoApresentacaoHttp(item) {
  if (!item?.id) return String(item?.src || '').trim();
  const src = String(item.src || '').trim();
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  if (!/^data:/i.test(src)) return src;
  try {
    const r = await fetch(
      `${getControllerApiBase()}/api/apresentacao/video/${encodeURIComponent(item.id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: src, mime: item.mime || 'video/mp4' }),
      }
    );
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) return String(j.url);
  } catch (e) {
    console.warn('[Lyra] publicar vídeo HTTP', e);
  }
  return src;
}

async function garantirVideoSrcHttp(item) {
  if (!item || item.kind !== 'video') return item;
  const url = await publicarVideoApresentacaoHttp(item);
  if (url && url !== item.src) {
    item.src = url;
  }
  return item;
}

/** URL da mídia importada (áudio ou vídeo). O servidor acha o ficheiro pelo id. */
function urlMidiaApresentacaoHttpPorId(id) {
  return urlMidiaApresentacaoHttpPorIdPuro(id, getControllerApiBase());
}

/**
 * Manda o controlador copiar o ficheiro para a pasta do aplicativo — sem Base64.
 *
 * O caminho antigo lia o ficheiro inteiro no painel, transformava-o numa string Base64,
 * embrulhava-a em JSON e mandava-a por HTTP. Um MP3 de 7 MB custava ~92 ms e ~47 MB de
 * heap; um vídeo de 100 MB, 1,4 s e 667 MB. Aqui só viaja o caminho, e quem copia é o
 * processo principal, com uma cópia de sistema operativo.
 *
 * Devolve `true` e preenche `item.src` quando correu bem. O chamador decide o que fazer
 * com o `false` — hoje, voltar ao caminho antigo, que continua a funcionar.
 */
async function importarMidiaApresentacaoPorCaminho(item) {
  const id = String(item?.id || '').trim();
  const filePath = String(item?.filePath || '').trim();
  if (!id || !filePath) return false;
  try {
    const r = await fetch(`${getControllerApiBase()}/api/apresentacao/midia/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, filePath, mime: item.mime || '' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok || !j.url) {
      console.warn('[Lyra] importar mídia por caminho falhou:', j.erro || `HTTP ${r.status}`);
      return false;
    }
    item.src = String(j.url);
    if (j.mime) item.mime = String(j.mime);
    return true;
  } catch (e) {
    console.warn('[Lyra] importar mídia por caminho falhou:', e);
    return false;
  }
}

function urlVideoApresentacaoHttpPorId(id) {
  const vid = String(id || '').trim();
  if (!vid) return '';
  return `${getControllerApiBase()}/api/apresentacao/video/${encodeURIComponent(vid)}`;
}

/**
 * Telões no PC do servidor remoto não alcançam `127.0.0.1:3001` do controlador —
 * reescreve para o proxy `:5510` do servidor (que encaminha ao controlador).
 * No modo local os telões são desta máquina: `:3001` já serve o vídeo e `:5510`
 * não tem proxy — manter a URL original.
 */
function reescreverUrlVideoParaTelas(url) {
  const ip =
    (typeof getServidorProjeccaoIp === 'function'
      ? String(getServidorProjeccaoIp() || '').trim()
      : '') ||
    (typeof getServidorIp === 'function' ? String(getServidorIp() || '').trim() : '');
  return reescreverUrlVideoParaTelasPuro(url, {
    local: typeof emModoProjecaoLocal === 'function' && emModoProjecaoLocal(),
    ip,
  });
}

async function videoHttpDisponivel(url) {
  const u = String(url || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) return false;
  try {
    const r = await fetch(u, { method: 'HEAD' });
    return r.ok;
  } catch (_) {
    return false;
  }
}

async function lerVideoComoDataUrlDoCaminho(filePath) {
  const fp = String(filePath || '').trim();
  if (!fp) return '';
  try {
    const url = /^file:/i.test(fp) ? fp : `file:///${fp.replace(/\\/g, '/')}`;
    const r = await fetch(url);
    if (!r.ok) return '';
    const blob = await r.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(blob);
    });
  } catch (_) {
    return '';
  }
}

async function republicarVideoDoCaminhoArquivo(item) {
  if (!item?.id || !item.filePath) return item;
  /* A cópia por caminho primeiro: é o caminho novo, e não carrega o ficheiro em memória. */
  const copia = { ...item };
  if (await importarMidiaApresentacaoPorCaminho(copia)) return copia;
  /* Falhou (ficheiro movido, disco cheio): o caminho antigo ainda serve de rede. */
  const data = await lerVideoComoDataUrlDoCaminho(item.filePath);
  if (!data) return item;
  return garantirVideoSrcHttp({ ...item, src: data });
}

function aguardarMetadadosVideo(el, timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!el) return resolve();
    if (Number.isFinite(el.duration) && el.duration > 0) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('loadedmetadata', finish);
      el.removeEventListener('error', finish);
      resolve();
    };
    el.addEventListener('loadedmetadata', finish, { once: true });
    el.addEventListener('error', finish, { once: true });
    setTimeout(finish, timeoutMs);
    try {
      el.load();
    } catch (_) {
      finish();
    }
  });
}

async function gerarThumbnailVideoApresentacao(src) {
  const url = String(src || '').trim();
  if (!url) return '';
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    let settled = false;
    const finish = (dataUrl) => {
      if (settled) return;
      settled = true;
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch (_) {
  // intencional — erro ignorado
}
      resolve(dataUrl || '');
    };
    const LARGURA_THUMB_PX = 320;
    const capturar = () => {
      try {
        const w = v.videoWidth || 0;
        const h = v.videoHeight || 0;
        if (w < 2 || h < 2) return finish('');
        /* A miniatura é pintada num cartão de poucos centímetros. Guardá-la na resolução
           nativa do vídeo dava 200 a 500 KB de Base64 por item — no estado, no
           localStorage e em cada sincronização — para desenhar 160 pixels. */
        const escala = Math.min(1, LARGURA_THUMB_PX / w);
        const cw = Math.max(2, Math.round(w * escala));
        const ch = Math.max(2, Math.round(h * escala));
        const c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        c.getContext('2d').drawImage(v, 0, 0, cw, ch);
        finish(c.toDataURL('image/jpeg', 0.82));
      } catch (_) {
        finish('');
      }
    };
    v.addEventListener('loadeddata', () => {
      try {
        const dur = Number(v.duration);
        const alvo = Number.isFinite(dur) && dur > 0.2 ? Math.min(dur * 0.1, Math.max(0.05, dur - 0.05)) : 0.5;
        v.currentTime = alvo;
      } catch (_) {
        capturar();
      }
    }, { once: true });
    v.addEventListener('seeked', capturar, { once: true });
    v.addEventListener('error', () => finish(''), { once: true });
    setTimeout(() => finish(''), 15000);
    v.src = url;
  });
}

async function garantirThumbnailVideoItem(item) {
  if (!item || item.kind !== 'video') return item;
  if (videoProjetadoAtivoNoPlayer() && audioStateRemoto.playing) return item;
  if (obterThumbVideoApresentacao(item)) return item;
  const srcThumb = /^https?:\/\//i.test(item.src) ? item.src : await resolverSrcProjecaoApresentacao(item);
  if (!srcThumb) return item;
  const thumb = await gerarThumbnailVideoApresentacao(srcThumb);
  if (thumb) item.thumb = thumb;
  return item;
}

async function restaurarItemVideoApresentacao(item) {
  if (!item || item.kind !== 'video') return null;
  const id = String(item.id || '').trim();
  let src = String(item.src || '').trim();
  const filePath = String(item.filePath || '').trim();

  if (!src && id) src = urlVideoApresentacaoHttpPorId(id);

  if (/^https?:\/\//i.test(src)) {
    item.src = src;
    if (await videoHttpDisponivel(src)) {
      return garantirThumbnailVideoItem(item);
    }
  }

  if (/^data:/i.test(src)) {
    const it = await garantirVideoSrcHttp(item);
    return garantirThumbnailVideoItem(it);
  }

  if (filePath) {
    const it = await republicarVideoDoCaminhoArquivo({ ...item, src: '' });
    if (it?.src && /^https?:\/\//i.test(it.src)) {
      return garantirThumbnailVideoItem(it);
    }
  }

  return null;
}

async function restaurarVideosModoApresentacao() {
  const v5 = apresentacaoCards[APRESENTACAO_IDX_CARD5];
  if (v5?.kind === 'video') {
    const it = await restaurarItemVideoApresentacao(v5);
    if (it) {
      apresentacaoCards[APRESENTACAO_IDX_CARD5] = it;
      const bibIdx = apresentacaoBiblioteca.findIndex((x) => x && x.id === it.id);
      if (bibIdx >= 0) apresentacaoBiblioteca[bibIdx] = it;
      salvarEstadoModoApresentacaoNoStorage();
    }
  }
  for (let i = 0; i < apresentacaoVideoPlaylist.length; i += 1) {
    const it0 = apresentacaoVideoPlaylist[i];
    if (it0?.kind !== 'video') continue;
    const it = await restaurarItemVideoApresentacao(it0);
    if (it) apresentacaoVideoPlaylist[i] = { ...it0, ...it };
  }
  if (videoProjetadoAtivoNoPlayer()) {
    const proj = obterItemVideoProjetadoNoPlayer();
    if (proj) {
      const it = await restaurarItemVideoApresentacao(proj);
      if (it) {
        /*
         * Só armar o player quando ele ainda não está armado com este vídeo.
         *
         * `prepararPlayerVideoAposProjetar` existe para o instante logo a seguir a
         * projetar: põe o vídeo no primeiro quadro, em pausa, pronto a arrancar. Correr
         * outra vez sobre um vídeo que já está no ar fazia exactamente isso — e como ela
         * emite o estado para o servidor, o telão voltava ao início junto com o painel.
         *
         * Bastava o operador ir à Bíblia, aos Slides ou aos Ajustes e voltar a Mídias
         * para o vídeo recomeçar. E um vídeo pausado de propósito a meio saltava para o
         * zero pelo mesmo caminho. Entrar no modo para ver o que está a passar não pode
         * interromper o que está a passar.
         *
         * Continua a armar quando é preciso: painel recarregado (elemento sem `src`) ou
         * outro vídeo no card.
         */
        const el = obterElementoVideoLocal();
        const armadoComEste =
          !!(el && it.src && (el.getAttribute('src') || el.src || '') === it.src);
        if (armadoComEste) atualizarUiPlayerAudioRemoto();
        else await prepararPlayerVideoAposProjetar(it);
      }
    }
  }
}

async function resolverSrcProjecaoApresentacao(item) {
  if (!item?.src) return '';
  if (item.kind === 'video') {
    return publicarVideoApresentacaoHttp(item);
  }
  return String(item.src).trim();
}

async function projetarItemApresentacao(item) {
  if (!item || !item.src) return;
  /** Qualquer projeção fora da orquestração da playlist a desativa (vídeo único, áudio, cards). */
  if (!_playlistProjetando) {
    playlistVideoAtiva = false;
    cancelarAvancoAutoPlaylist();
  }
  if (item.kind === 'audio') {
    apresentacaoMidiaProjetadaId = null;
    const ok = await tocarAudioServidorApresentacao(item);
    if (!ok) {
      alert('Não foi possível reproduzir o áudio no servidor. Verifique a ligação.');
      atualizarFeedbackProjecaoApresentacaoUi();
      return;
    }
    apresentacaoAudioAtualId = item.id || null;
    atualizarRodapeAudioApresentacao(item);
    return;
  }
  await reidratarRotaApresentacaoDoSeletor();
  const alvoProjecao = obterAlvoProjecaoModoApresentacao();
  if (!monitoresApresentacaoCobremAlvo(alvoProjecao)) {
    alert(mensagemAlvoInvalidoApresentacao(alvoProjecao));
    return;
  }
  const srcLocal = await resolverSrcProjecaoApresentacao(item);
  if (!srcLocal) {
    alert('Não foi possível preparar o ficheiro para projeção.');
    return;
  }
  if (item.kind === 'video' && /^https?:\/\//i.test(srcLocal)) {
    item.src = srcLocal;
    const noCard = apresentacaoCards?.[APRESENTACAO_IDX_CARD5];
    if (noCard?.id === item.id) apresentacaoCards[APRESENTACAO_IDX_CARD5] = item;
    const noBib = apresentacaoBiblioteca.findIndex((x) => x && x.id === item.id);
    if (noBib >= 0) apresentacaoBiblioteca[noBib] = item;
    salvarEstadoModoApresentacaoNoStorage();
  }
  const srcProj = item.kind === 'video' ? reescreverUrlVideoParaTelas(srcLocal) : srcLocal;
  const payloadAp = {
    kind: item.kind,
    src: srcProj,
    mime: item.mime || '',
    name: item.name || '',
    title: item.name || 'Apresentação',
    alvoProjecao,
  };
  const ok = await emitirApresentacao(payloadAp);
  if (!ok) {
    atualizarFeedbackProjecaoApresentacaoUi();
    return;
  }
  apresentacaoMidiaProjetadaId = item.id || null;
  if (item.kind === 'video') {
    await prepararPlayerVideoAposProjetar(item);
  }
  renderGridApresentacao();
  atualizarFeedbackProjecaoApresentacaoUi();
}

function obterItemVideoProjetadoNoPlayer() {
  if (!apresentacaoMidiaProjetadaId) return null;
  const id = apresentacaoMidiaProjetadaId;
  const raw =
    (apresentacaoCards || []).find((x) => x && x.id === id) ||
    (apresentacaoBiblioteca || []).find((x) => x && x.id === id) ||
    (apresentacaoVideoPlaylist || []).find((x) => x && x.id === id) ||
    null;
  const it = normalizarItemApresentacao(raw);
  return it && it.kind === 'video' ? it : null;
}

function videoProjetadoAtivoNoPlayer() {
  return !!obterItemVideoProjetadoNoPlayer();
}

let audioLocalMotorPronto = false;

function obterElementoAudioLocal() {
  return document.getElementById('lyra-audio-local');
}

function obterElementoVideoLocal() {
  return document.getElementById('lyra-video-local');
}

/** Vídeo local só para barra de progresso — áudio exclusivo no telão de projeção. */
function prepararElementoVideoLocalControle(el) {
  if (!el) return;
  el.muted = true;
  el.playsInline = true;
}

/** Reproduz o elemento de preview local (sempre mudo) em sincronia com o telão. */
function reproduzirElementoPreviewLocal(t) {
  const el = obterElementoVideoLocal();
  if (!el || !el.src) return;
  el.muted = true;
  if (Number.isFinite(t)) {
    try {
      el.currentTime = Math.max(0, Number(t));
    } catch (_) {
  // intencional — erro ignorado
}
  }
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function pausarElementoPreviewLocal() {
  const el = obterElementoVideoLocal();
  if (el && !el.paused) {
    try {
      el.pause();
    } catch (_) {
  // intencional — erro ignorado
}
  }
}

/** Elemento-slot atualmente rastreado pelo overlay de preview (ou null). */
let _previewAlvoAtual = null;

/** Retorna o slot alvo do preview ao vivo (card 5 ou playlist) — só quando reproduzindo. */
function alvoPreviewVideoAtual() {
  const id = apresentacaoMidiaProjetadaId;
  if (!id || audioStateRemoto.mediaKind !== 'video' || !audioStateRemoto.playing) return null;
  const card5 = apresentacaoCards?.[APRESENTACAO_IDX_CARD5];
  if (card5 && card5.id === id) return document.getElementById('ap-card5-video-live-slot');
  if ((apresentacaoVideoPlaylist || []).some((x) => x && x.id === id)) {
    return document.getElementById('ap-playlist-preview');
  }
  return null;
}

/** Ajusta as coordenadas do overlay para cobrir exatamente o slot alvo atual. */
function posicionarOverlayPreview() {
  const overlay = document.getElementById('lyra-video-overlay');
  if (!overlay) return;
  const alvo = _previewAlvoAtual;
  if (!alvo || !alvo.isConnected) {
    overlay.classList.remove('ativo');
    overlay.style.left = '-99999px';
    overlay.style.top = '-99999px';
    return;
  }
  const r = alvo.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) {
    overlay.classList.remove('ativo');
    overlay.style.left = '-99999px';
    overlay.style.top = '-99999px';
    return;
  }
  overlay.style.left = `${Math.round(r.left)}px`;
  overlay.style.top = `${Math.round(r.top)}px`;
  overlay.style.width = `${Math.round(r.width)}px`;
  overlay.style.height = `${Math.round(r.height)}px`;
  overlay.classList.add('ativo');
}

/**
 * Atualiza o preview de vídeo ao vivo (mudo) via OVERLAY fixo — o elemento de vídeo
 * nunca é movido no DOM (evita o quadro preto do Chromium ao reposicionar mídia).
 * Apenas o overlay acompanha as coordenadas do slot alvo (card 5 ou playlist).
 */
function atualizarPreviewVideoAoVivo() {
  const overlay = document.getElementById('lyra-video-overlay');
  const el = obterElementoVideoLocal();
  const slotPlaylist = document.getElementById('ap-playlist-preview');
  if (!overlay || !el) return;
  const alvo = alvoPreviewVideoAtual();
  _previewAlvoAtual = alvo;
  /* Reserva o espaço do slot da playlist só quando ele é o alvo. */
  if (slotPlaylist) {
    if (alvo === slotPlaylist) {
      slotPlaylist.classList.add('reservado');
      slotPlaylist.hidden = false;
    } else {
      slotPlaylist.classList.remove('reservado');
      slotPlaylist.hidden = true;
    }
  }
  if (alvo) {
    el.muted = true;
    if (el.src && el.paused && audioStateRemoto.playing) {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    posicionarOverlayPreview();
  } else {
    overlay.classList.remove('ativo');
    overlay.style.left = '-99999px';
    overlay.style.top = '-99999px';
  }
}

function obterElementoPlayerAtivo() {
  return audioStateRemoto.mediaKind === 'video' ? obterElementoVideoLocal() : obterElementoAudioLocal();
}

function pararElementoMidia(el) {
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  try {
    el.load();
  } catch (_) {
  // intencional — erro ignorado
}
}

/** Telão é a única instância em reprodução — evita dupla decodificação e sync contínuo. */
function videoPlaybackUsaTelaoComoFonte() {
  return videoProjetadoAtivoNoPlayer();
}

let _videoUiClockRaf = null;
let _videoUiClockBase = 0;
let _videoUiClockT0 = 0;

function pararRelogioUiVideo() {
  if (_videoUiClockRaf) {
    cancelAnimationFrame(_videoUiClockRaf);
    _videoUiClockRaf = null;
  }
}

function iniciarRelogioUiVideo() {
  pararRelogioUiVideo();
  const dur = Math.max(0, Number(audioStateRemoto.duration) || 0);
  /* O relógio mostra segundos. Refazer textos, ícones e barra a cada quadro era pagar 60
     atualizações de DOM — com um `getBoundingClientRect` dentro, ou seja, um cálculo de
     layout forçado — para mudar um dígito uma vez por segundo. */
  let ultimoSegundoUi = -1;
  const tick = () => {
    if (!videoProjetadoAtivoNoPlayer() || !audioStateRemoto.playing) {
      pararRelogioUiVideo();
      return;
    }
    const elapsed = (performance.now() - _videoUiClockT0) / 1000;
    let t = _videoUiClockBase + elapsed;
    if (dur > 0 && t >= dur) {
      if (playlistControlaReproducaoAtual()) {
        audioStateRemoto.playing = false;
        audioStateRemoto.currentTime = dur;
        atualizarUiPlayerAudioRemoto();
        emitirEstadoVideoParaServidor({ playing: false, syncTime: true, currentTime: dur });
        pararRelogioUiVideo();
        aoTerminarVideoPlaylist();
        return;
      }
      if (audioLoopAtivo) {
        _videoUiClockBase = 0;
        _videoUiClockT0 = performance.now();
        audioStateRemoto.playing = true;
        audioStateRemoto.currentTime = 0;
        atualizarUiPlayerAudioRemoto();
        emitirEstadoVideoParaServidor({ playing: true, syncTime: true, currentTime: 0 });
        reproduzirElementoPreviewLocal(0);
        _videoUiClockRaf = requestAnimationFrame(tick);
        return;
      }
      t = dur;
      audioStateRemoto.playing = false;
      audioStateRemoto.currentTime = t;
      atualizarUiPlayerAudioRemoto();
      emitirEstadoVideoParaServidor({ playing: false, syncTime: true, currentTime: t });
      pararRelogioUiVideo();
      return;
    }
    audioStateRemoto.currentTime = t;
    const segundo = Math.floor(t);
    if (segundo !== ultimoSegundoUi) {
      ultimoSegundoUi = segundo;
      atualizarUiPlayerAudioRemoto();
    } else if (_previewAlvoAtual) {
      /* O overlay do preview continua a acompanhar o layout a cada quadro — é para isso
         que este laço existe. O resto da UI não precisa. */
      posicionarOverlayPreview();
    }
    _videoUiClockRaf = requestAnimationFrame(tick);
  };
  _videoUiClockRaf = requestAnimationFrame(tick);
}

function emitirEstadoVideoParaServidor(opts = {}) {
  if (!videoProjetadoAtivoNoPlayer()) {
    return;
  }
  const syncTime = opts.syncTime === true;
  const el = obterElementoVideoLocal();
  const payload = {
    playing:
      opts.playing != null
        ? !!opts.playing
        : el && !videoPlaybackUsaTelaoComoFonte()
          ? !el.paused && !el.ended
          : !!audioStateRemoto.playing,
    volume: Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 1)),
  };
  if (syncTime) {
    payload.syncTime = true;
    payload.currentTime =
      Number(opts.currentTime ?? (el && !videoPlaybackUsaTelaoComoFonte() ? el.currentTime : audioStateRemoto.currentTime)) || 0;
  }
  if (projecao.enviar('apresentacao_video_state', payload)) return;
  const ip = hostProjecao();
  if (!ip) {
    return;
  }
  fetch(`http://${ip}:5510/api/comando/apresentacao_video_state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function sincronizarEstadoPlayerLocalDesdeElemento() {
  if (audioStateRemoto.mediaKind === 'video' && videoPlaybackUsaTelaoComoFonte()) {
    atualizarUiPlayerAudioRemoto();
    return;
  }
  const el = obterElementoPlayerAtivo();
  if (!el) return;
  audioStateRemoto = {
    ...audioStateRemoto,
    playing: !el.paused && !el.ended,
    currentTime: Number(el.currentTime) || 0,
    duration: Number.isFinite(el.duration) ? Number(el.duration) : 0,
    volume:
      audioStateRemoto.mediaKind === 'video'
        ? audioStateRemoto.volume
        : Number.isFinite(el.volume)
          ? el.volume
          : audioStateRemoto.volume,
  };
  atualizarUiPlayerAudioRemoto();
}

function ligarEventosElementoPlayer(el) {
  if (!el || el.dataset.lyraPlayerBound === '1') return;
  el.dataset.lyraPlayerBound = '1';
  el.addEventListener('timeupdate', sincronizarEstadoPlayerLocalDesdeElemento);
  el.addEventListener('loadedmetadata', sincronizarEstadoPlayerLocalDesdeElemento);
}

function configurarMotorAudioLocalApresentacao() {
  if (audioLocalMotorPronto) return;
  const audioEl = obterElementoAudioLocal();
  const videoEl = obterElementoVideoLocal();
  if (!audioEl && !videoEl) return;
  audioLocalMotorPronto = true;
  const vol = Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 1));
  if (audioEl) audioEl.volume = vol;
  if (videoEl) prepararElementoVideoLocalControle(videoEl);
  ligarEventosElementoPlayer(audioEl);
  ligarEventosElementoPlayer(videoEl);
}

async function prepararPlayerVideoAposProjetar(item) {
  const it = await restaurarItemVideoApresentacao(item);
  if (!it?.src) return;
  configurarMotorAudioLocalApresentacao();
  pararElementoMidia(obterElementoAudioLocal());
  apresentacaoAudioAtualId = null;
  const el = obterElementoVideoLocal();
  if (!el) return;
  audioStateRemoto.mediaKind = 'video';
  audioStateRemoto.name = it.name || 'Vídeo';
  audioStateRemoto.playing = false;
  audioStateRemoto.currentTime = 0;
  try {
    prepararElementoVideoLocalControle(el);
    el.preload = 'metadata';
    el.src = it.src;
    el.pause();
    await aguardarMetadadosVideo(el, 6000);
    if (Number.isFinite(el.duration) && el.duration > 0) {
      audioStateRemoto.duration = Number(el.duration);
    }
    try {
      el.currentTime = 0;
    } catch (_) {
  // intencional — erro ignorado
}
    atualizarUiPlayerAudioRemoto();
    emitirEstadoVideoParaServidor({ playing: false, syncTime: true, currentTime: 0 });
  } catch (e) {
    console.warn('[Lyra] player vídeo', e);
  }
}

function pausarAudioLocalApresentacao() {
  if (videoProjetadoAtivoNoPlayer()) {
    pararRelogioUiVideo();
    pausarElementoPreviewLocal();
    audioStateRemoto = {
      ...audioStateRemoto,
      mediaKind: 'video',
      playing: false,
    };
    atualizarUiPlayerAudioRemoto();
    emitirEstadoVideoParaServidor({
      playing: false,
      syncTime: true,
      currentTime: Number(audioStateRemoto.currentTime) || 0,
    });
    return;
  }
  const el = obterElementoPlayerAtivo();
  if (el) el.pause();
  audioStateRemoto = { ...audioStateRemoto, playing: false };
  atualizarUiPlayerAudioRemoto();
}

function pararAudioLocalApresentacao() {
  const eraVideo = videoProjetadoAtivoNoPlayer();
  pararRelogioUiVideo();
  audioLoopReinicioPendente = false;
  pararElementoMidia(obterElementoAudioLocal());
  pararElementoMidia(obterElementoVideoLocal());
  audioStateRemoto = {
    ...audioStateRemoto,
    playing: false,
    currentTime: 0,
    duration: 0,
    name: '',
    mediaKind: '',
  };
  atualizarUiPlayerAudioRemoto();
  if (eraVideo) {
    const payload = {
      playing: false,
      syncTime: true,
      currentTime: 0,
      volume: Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 1)),
    };
    if (!projecao.enviar('apresentacao_video_state', payload)) {
      const ip = hostProjecao();
      if (ip) {
        fetch(`http://${ip}:5510/api/comando/apresentacao_video_state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
      }
    }
  }
}

function definirVolumeAudioLocalApresentacao(volume) {
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  const audioEl = obterElementoAudioLocal();
  const videoEl = obterElementoVideoLocal();
  if (audioEl) audioEl.volume = v;
  if (videoEl) prepararElementoVideoLocalControle(videoEl);
  audioStateRemoto = { ...audioStateRemoto, volume: v };
  atualizarUiPlayerAudioRemoto();
  if (audioStateRemoto.mediaKind === 'video') {
    const payloadVol = { playing: !!audioStateRemoto.playing, volume: v };
    if (!projecao.enviar('apresentacao_video_state', payloadVol)) {
      const ip = hostProjecao();
      if (ip) {
        fetch(`http://${ip}:5510/api/comando/apresentacao_video_state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadVol),
        }).catch(() => {});
      }
    }
  }
}

function seekAudioLocalApresentacao(time) {
  const t = Math.max(0, Number(time) || 0);
  if (audioStateRemoto.mediaKind === 'video' && videoPlaybackUsaTelaoComoFonte()) {
    audioStateRemoto.currentTime = t;
    if (audioStateRemoto.playing) {
      _videoUiClockBase = t;
      _videoUiClockT0 = performance.now();
    }
    const el = obterElementoVideoLocal();
    if (el?.src) {
      try {
        el.currentTime = t;
      } catch (_) {
  // intencional — erro ignorado
}
    }
    atualizarUiPlayerAudioRemoto();
    emitirEstadoVideoParaServidor({
      playing: !!audioStateRemoto.playing,
      syncTime: true,
      currentTime: t,
    });
    return;
  }
  const el = obterElementoPlayerAtivo();
  if (el) el.currentTime = t;
  sincronizarEstadoPlayerLocalDesdeElemento();
}

/** Reprodução de áudio no processo Servidor (saída padrão do Windows da máquina do servidor). */
async function tocarAudioServidorApresentacao(item, opts = {}) {
  if (!item?.src) return false;
  const vol = Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 1));
  const startTime = Math.max(0, Number(opts.startTime) || 0);
  if (startTime > 0 && item.id) {
    armarGuardaVisualRetomadaAudio(item.id, startTime);
  } else {
    limparGuardaVisualRetomadaAudio();
  }
  /* No modo dois PCs quem toca é a janela de controle do Servidor, na outra máquina:
     lá, `127.0.0.1:3001` é o próprio Servidor e não o controlador. A mesma reescrita que
     o vídeo já usava leva a URL para o proxy da 5510. */
  const ok = await enviarComandoAudioProjeccao('audio_play', {
    src: reescreverUrlVideoParaTelas(item.src),
    name: item.name || 'audio',
    mediaKind: 'audio',
    autoplay: opts.autoplay !== false,
    volume: vol,
  });
  if (!ok) {
    limparGuardaVisualRetomadaAudio();
  }
  if (ok) {
    if (startTime > 0) {
      await enviarComandoAudioProjeccao('audio_seek', { time: startTime });
    }
    audioStateRemoto.mediaKind = 'audio';
    audioStateRemoto.name = item.name || '';
    audioStateRemoto.volume = vol;
    audioStateRemoto.currentTime = startTime;
    if (opts.autoplay === false) {
      audioStateRemoto.playing = false;
    }
    atualizarUiPlayerAudioRemoto();
  }
  return ok;
}

function pausarAudioServidorPlayback() {
  if (audioStateRemoto.mediaKind === 'video') {
    pausarAudioLocalApresentacao();
    return;
  }
  void enviarComandoAudioProjeccao('audio_pause', {});
  audioLoopReinicioPendente = false;
  limparGuardaVisualRetomadaAudio();
  audioStateRemoto = { ...audioStateRemoto, playing: false };
  atualizarUiPlayerAudioRemoto();
}

function pararAudioServidorPlayback() {
  if (audioStateRemoto.mediaKind === 'video') {
    pararAudioLocalApresentacao();
    return;
  }
  void enviarComandoAudioProjeccao('audio_stop', {});
  audioLoopReinicioPendente = false;
  limparGuardaVisualRetomadaAudio();
  audioStateRemoto = {
    ...audioStateRemoto,
    playing: false,
    currentTime: 0,
    duration: 0,
    name: '',
    mediaKind: '',
  };
  atualizarUiPlayerAudioRemoto();
}

function definirVolumeAudioServidor(volume) {
  if (audioStateRemoto.mediaKind === 'video') {
    definirVolumeAudioLocalApresentacao(volume);
    return;
  }
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  void enviarComandoAudioProjeccao('audio_volume', { volume: v });
  audioStateRemoto = { ...audioStateRemoto, volume: v };
  atualizarUiPlayerAudioRemoto();
}

/**
 * Botão único de mudo/desmudo do player.
 *
 * «Mudo» é volume 0 — mesmo canal que os botões −/+, então funciona para áudio e vídeo
 * sem caminho novo. Ao mutar, guarda o volume actual para o restaurar; se o volume já
 * estava a 0 (arrastado pelos −), desmutar volta a um nível audível.
 */
function alternarMudoAudioApresentacao() {
  const volAtual = Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 0));
  if (volAtual > 0) {
    audioVolAntesDeMutar = volAtual;
    definirVolumeAudioServidor(0);
  } else {
    const restaurar = audioVolAntesDeMutar > 0 ? audioVolAntesDeMutar : 1;
    definirVolumeAudioServidor(restaurar);
  }
}

function atualizarBotaoMudoPlayerAudio() {
  const btn = document.getElementById('ap-audio-mute');
  if (!btn) return;
  const mudo = Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 0)) === 0;
  btn.classList.toggle('ap-ctrl-mute--on', mudo);
  btn.setAttribute('aria-pressed', mudo ? 'true' : 'false');
  btn.title = mudo ? 'Reativar som' : 'Mudo';
  btn.setAttribute('aria-label', mudo ? 'Reativar som' : 'Silenciar');
  /* Os atributos acima são idempotentes e baratos; o SVG é que não. */
  const iconeMudo = mudo ? 'mudo' : 'som';
  if (btn.dataset.lyraIcone === iconeMudo) return;
  btn.dataset.lyraIcone = iconeMudo;
  btn.innerHTML = mudo
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m16 9 5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a4 4 0 0 1 0 7M18 6a7 7 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
}

function seekAudioServidor(time) {
  if (audioStateRemoto.mediaKind === 'video') {
    seekAudioLocalApresentacao(time);
    return;
  }
  const t = Math.max(0, Number(time) || 0);
  limparGuardaVisualRetomadaAudio();
  void enviarComandoAudioProjeccao('audio_seek', { time: t });
  audioStateRemoto = { ...audioStateRemoto, currentTime: t };
  atualizarUiPlayerAudioRemoto();
}

function renderPlayPauseIcon() {
  const btn = document.getElementById('ap-audio-play-pause');
  if (!btn) return;
  /* Dois estados, só. Reconstruir o SVG a cada `timeupdate` refazia o mesmo desenho ~4x
     por segundo — e 60x por segundo enquanto um vídeo corria, porque o relógio do vídeo
     passava por aqui a cada quadro. */
  const iconeAlvo = audioStateRemoto.playing ? 'pause' : 'play';
  if (btn.dataset.lyraIcone === iconeAlvo) return;
  btn.dataset.lyraIcone = iconeAlvo;
  if (audioStateRemoto.playing) {
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  } else {
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  }
}

function atualizarBotaoLoopPlayerAudio() {
  const btn = document.getElementById('ap-audio-loop');
  if (!btn) return;
  btn.classList.toggle('ap-ctrl--ativo', !!audioLoopAtivo);
  btn.setAttribute('aria-pressed', audioLoopAtivo ? 'true' : 'false');
  btn.title = audioLoopAtivo ? 'Desativar repetir' : 'Ativar repetir';
  btn.setAttribute('aria-label', audioLoopAtivo ? 'Desativar repetir' : 'Ativar repetir');
}

function alternarLoopPlayerApresentacao(force) {
  const proximoEstado = force == null ? !audioLoopAtivo : !!force;
  if (audioLoopAtivo === proximoEstado) {
    atualizarBotaoLoopPlayerAudio();
    return;
  }
  audioLoopAtivo = proximoEstado;
  audioLoopReinicioPendente = false;
  atualizarUiPlayerAudioRemoto();
  salvarEstadoModoApresentacaoNoStorage();
}

function atualizarUiPlayerAudioRemoto() {
  const now = document.getElementById('ap-audio-now');
  const cur = document.getElementById('ap-audio-current');
  const dur = document.getElementById('ap-audio-duration');
  const seek = document.getElementById('ap-audio-seek');
  const volVal = document.getElementById('ap-audio-vol-val');
  const volFill = document.getElementById('ap-audio-vol-fill');
  if (now) {
    const tipo =
      audioStateRemoto.mediaKind === 'video'
        ? 'Vídeo'
        : audioStateRemoto.mediaKind === 'audio'
          ? 'Áudio'
          : '';
    now.textContent = audioStateRemoto.name
      ? `${audioStateRemoto.playing ? 'Tocando' : 'Pausado'}${tipo ? ` (${tipo})` : ''}: ${audioStateRemoto.name}`
      : 'Nenhuma mídia no player';
    now.title = audioStateRemoto.name ? String(audioStateRemoto.name) : '';
  }
  if (cur) cur.textContent = fmtTempoAudio(audioStateRemoto.currentTime);
  if (dur) dur.textContent = fmtTempoAudio(audioStateRemoto.duration);
  let seekPct = 0;
  if (seek && !audioSeekDragging) {
    const d = Math.max(0, Number(audioStateRemoto.duration) || 0);
    const c = Math.max(0, Number(audioStateRemoto.currentTime) || 0);
    const val = d > 0 ? Math.round((c / d) * 1000) : 0;
    seek.value = String(Math.max(0, Math.min(1000, val)));
    seekPct = d > 0 ? Math.round((c / d) * 1000) / 10 : 0;
  } else if (seek) {
    const d = Math.max(0, Number(audioStateRemoto.duration) || 0);
    const c = Math.max(0, Number(audioStateRemoto.currentTime) || 0);
    seekPct = d > 0 ? Math.round((c / d) * 1000) / 10 : Number(seek.value) / 10;
  }
  if (seek) seek.style.setProperty('--seek-pct', `${seekPct}%`);
  const vPct = Math.round(Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 0)) * 100);
  if (volVal) volVal.textContent = `${vPct}%`;
  if (volFill) volFill.style.width = `${vPct}%`;
  renderPlayPauseIcon();
  atualizarBotaoLoopPlayerAudio();
  atualizarBotaoMudoPlayerAudio();
  atualizarPlaylistUiAoVivoSeMudou();
  if (_previewAlvoAtual) posicionarOverlayPreview();
}

function criarItemApresentacaoDeArquivo(file, onDone) {
  if (!file) return;
  const mime = String(file.type || '');
  const nome = String(file.name || 'arquivo');
  const isPowerPoint = ehArquivoPowerPointLocal(mime, nome);
  if (isPowerPoint) {
    alert('PowerPoint local ainda não abre direto no telão. Exporte para PDF ou use URL de apresentação online (Google Slides / Office Online).');
    return;
  }
  const kind = detectarKindApresentacaoPorMimeOuNome(mime, nome);
  const id = `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fp = String(file.path || '').trim();

  /** O caminho antigo: o ficheiro inteiro em Base64, dentro do item. */
  const entregarPorDataUrl = () => {
    const reader = new FileReader();
    reader.onerror = () => alert('Não foi possível ler o arquivo selecionado.');
    reader.onload = () => {
      const src = String(reader.result || '');
      if (!src) return;
      const itemNovo = { id, kind, src, mime, name: nome, title: nome };
      if (fp) itemNovo.filePath = fp;
      onDone(itemNovo);
    };
    reader.readAsDataURL(file);
  };

  /*
   * Áudio e vídeo entram por caminho de ficheiro; o controlador copia-os para a pasta do
   * aplicativo e devolve uma URL.
   *
   * Antes vinham em Base64 e ficavam assim: no item, no estado gravado e em cada comando
   * que os mandava tocar. Um MP3 de 7 MB ocupava ~47 MB de heap e o estado do modo Mídias
   * passava dos 5 MB de quota do localStorage logo no primeiro áudio — não gravava, em
   * silêncio, e pagava o custo à mesma. Com a URL, o que viaja são duzentos bytes.
   *
   * Sem caminho de ficheiro (arrastado do navegador, por exemplo) ou se a cópia falhar,
   * o caminho antigo continua a servir — pior, mas funciona.
   */
  if ((kind === 'audio' || kind === 'video') && fp) {
    const itemNovo = { id, kind, src: '', mime, name: nome, title: nome, filePath: fp };
    void importarMidiaApresentacaoPorCaminho(itemNovo).then((ok) => {
      if (ok) return onDone(itemNovo);
      entregarPorDataUrl();
    });
    return;
  }

  entregarPorDataUrl();
}

/* ═══════════════════════════════════════════════════════════════════════════
   Biblioteca de arquivos (modo Mídias)
   Substitui os dois seletores antigos ("Arquivos no menu" e "Player"). Os dados são os
   mesmos: `apresentacaoBiblioteca` (imagem, vídeo, PDF…) e `apresentacaoAudios`. Clique
   seleciona (id próprio de cada lista), duplo clique projeta — exatamente como antes.
   ═══════════════════════════════════════════════════════════════════════════ */
const SS_AP_LIB_ABA = 'lyra.apLibAba';
let apLibBusca = '';
let apLibAba = (() => {
  try {
    const v = sessionStorage.getItem(SS_AP_LIB_ABA);
    return v === 'video' || v === 'audio' ? v : 'image';
  } catch (_) {
    return 'image';
  }
})();

function apLibDefinirAba(aba, { render = true } = {}) {
  apLibAba = aba === 'video' || aba === 'audio' ? aba : 'image';
  try {
    sessionStorage.setItem(SS_AP_LIB_ABA, apLibAba);
  } catch (_) {
    /* sem sessionStorage: a aba só não é lembrada */
  }
  if (render) renderBibliotecaMidiasApresentacao();
}

function apLibAbaDoItem(item, origem) {
  if (origem === 'audio') return 'audio';
  const k = String(item?.kind || '').toLowerCase();
  if (k === 'video' || k === 'audio') return k;
  return 'image';
}

function apLibFecharMenus() {
  document.querySelectorAll('.ap-lib-menu').forEach((m) => {
    m.hidden = true;
  });
  document.querySelectorAll('#ap-lib-list .ap-lib-more[aria-expanded="true"]').forEach((b) => {
    b.setAttribute('aria-expanded', 'false');
  });
}

function apLibRenomear(entry, nameEl) {
  const { item, origem } = entry;
  const main = nameEl?.parentElement;
  if (!nameEl || !main || main.querySelector('input.ap-menu-edit-input')) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ap-menu-edit-input';
  input.value = String(item.name || '').trim();
  input.maxLength = 140;
  input.setAttribute('aria-label', 'Novo nome do arquivo');
  nameEl.replaceWith(input);
  ['click', 'mousedown', 'dblclick', 'dragstart'].forEach((t) => input.addEventListener(t, (e) => e.stopPropagation()));
  input.focus();
  input.select();
  let feito = false;
  const salvar = () => {
    if (feito) return;
    feito = true;
    const novo = String(input.value || '').trim();
    if (!novo) {
      renderBibliotecaMidiasApresentacao();
      return;
    }
    if (origem === 'audio') {
      const alvo = apresentacaoAudios.find((x) => x && x.id === item.id);
      if (alvo) {
        alvo.name = novo;
        alvo.title = novo;
      }
      if (apresentacaoAudioAtualId === item.id && audioStateRemoto.name) {
        audioStateRemoto = { ...audioStateRemoto, name: novo };
        atualizarUiPlayerAudioRemoto();
      }
    } else {
      const atualizar = (obj) => {
        if (!obj || obj.id !== item.id) return;
        obj.name = novo;
        obj.title = novo;
      };
      apresentacaoBiblioteca.forEach(atualizar);
      apresentacaoCards.forEach(atualizar);
    }
    salvarEstadoModoApresentacaoNoStorage();
    renderBibliotecaMidiasApresentacao();
    if (origem !== 'audio') renderGridApresentacao();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      salvar();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      feito = true;
      renderBibliotecaMidiasApresentacao();
    }
  });
  input.addEventListener('blur', salvar);
}

async function apLibExcluir(entry) {
  const { item, origem } = entry;
  if (origem === 'audio') {
    const ok = await appConfirm(`Excluir "${item.name}" da lista de áudios?`, 'Modo apresentação');
    if (!ok) return;
    const eraAtual = apresentacaoAudioAtualId === item.id;
    apresentacaoAudios = (apresentacaoAudios || []).filter((x) => x && x.id !== item.id);
    if (eraAtual) {
      apresentacaoAudioAtualId = null;
      pararAudioServidorPlayback();
      atualizarUiPlayerAudioRemoto();
      sincronizarPillProjecaoNav();
    }
    salvarEstadoModoApresentacaoNoStorage();
    renderBibliotecaMidiasApresentacao();
    return;
  }
  const ok = await appConfirm(`Excluir "${item.name}" do menu de arquivos?`, 'Modo apresentação');
  if (!ok) return;
  apresentacaoBiblioteca = (apresentacaoBiblioteca || []).filter((x) => x && x.id !== item.id);
  apresentacaoCards = (apresentacaoCards || []).map((x) => (x && x.id === item.id ? null : x));
  apresentacaoCard4Imagens = (apresentacaoCard4Imagens || []).map((x) => (x && x.id === item.id ? null : x));
  if (apresentacaoArquivoSelecionadoId === item.id) apresentacaoArquivoSelecionadoId = null;
  if (apresentacaoMidiaProjetadaId === item.id) {
    apresentacaoMidiaProjetadaId = null;
    void emitirEncerrarApresentacaoPublicoAoServidor();
  }
  salvarEstadoModoApresentacaoNoStorage();
  renderBibliotecaMidiasApresentacao();
  atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'Arquivo removido do menu.' });
}

function renderBibliotecaMidiasApresentacao() {
  const list = document.getElementById('ap-lib-list');
  if (!list) return;
  document.querySelectorAll('#painel-modo-apresentacao .ap-lib-tab').forEach((t) => {
    t.setAttribute('aria-selected', t.dataset.tab === apLibAba ? 'true' : 'false');
  });
  const entradas = [
    ...apresentacaoBiblioteca.map((item) => ({ item, origem: 'bib' })),
    ...apresentacaoAudios.map((item) => ({ item, origem: 'audio' })),
  ].filter((e) => e.item && apLibAbaDoItem(e.item, e.origem) === apLibAba);
  const q = apLibBusca.trim().toLowerCase();
  const filtradas = q ? entradas.filter((e) => String(e.item.name || '').toLowerCase().includes(q)) : entradas;

  document.querySelectorAll('body > .ap-lib-menu').forEach((m) => m.remove());
  list.innerHTML = '';
  if (!filtradas.length) {
    const vazio = document.createElement('div');
    vazio.className = 'placeholder-msg ap-lib-empty';
    const nomes = { image: 'imagem', video: 'vídeo', audio: 'áudio' };
    vazio.textContent = q
      ? 'Nenhum arquivo encontrado.'
      : `Nenhum${apLibAba === 'image' ? 'a' : ''} ${nomes[apLibAba]}. Use + Importar.`;
    list.appendChild(vazio);
    return;
  }
  filtradas.forEach((entry) => {
    const { item, origem } = entry;
    const selecionado = origem === 'audio' ? apresentacaoAudioAtualId === item.id : apresentacaoArquivoSelecionadoId === item.id;
    const row = document.createElement('div');
    row.className = 'ap-lib-item';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', selecionado ? 'true' : 'false');
    row.tabIndex = 0;
    if (origem === 'bib') {
      row.draggable = true;
      row.dataset.itemId = item.id;
      row.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', item.id);
        ev.dataTransfer.effectAllowed = 'copyMove';
      });
    }
    const thumb = document.createElement('div');
    thumb.className = 'ap-lib-thumb';
    const kind = String(item.kind || (origem === 'audio' ? 'audio' : '')).toLowerCase();
    const imgSrc =
      kind === 'image' ? srcImagemApresentacaoSeguro(item.src, item) : kind === 'video' ? obterThumbVideoApresentacao(item) : '';
    if (imgSrc) {
      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = svgIconeTipoMidiaApresentacao(kind);
    }
    const main = document.createElement('div');
    main.className = 'ap-lib-main';
    const nome = document.createElement('div');
    nome.className = 'ap-lib-name';
    nome.textContent = String(item.name || 'arquivo');
    nome.title = String(item.name || '');
    const meta = document.createElement('div');
    meta.className = 'ap-lib-meta';
    const dur = Number(item.duration) > 0 ? ` · ${fmtTempoAudio(item.duration)}` : '';
    meta.textContent = rotuloTipoMidiaApresentacao(kind) + dur;
    main.append(nome, meta);

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ap-lib-more';
    more.setAttribute('aria-label', `Mais ações para ${item.name || 'arquivo'}`);
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.textContent = '⋯';
    const menu = document.createElement('div');
    menu.className = 'ap-lib-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    const bRen = document.createElement('button');
    bRen.type = 'button';
    bRen.setAttribute('role', 'menuitem');
    bRen.textContent = 'Renomear';
    const bDel = document.createElement('button');
    bDel.type = 'button';
    bDel.setAttribute('role', 'menuitem');
    bDel.className = 'is-danger';
    bDel.textContent = 'Excluir';
    menu.append(bRen, bDel);
    more.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const abrir = menu.hidden;
      apLibFecharMenus();
      menu.hidden = !abrir;
      more.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      if (abrir) {
        /* No <body> e position: fixed — a lista rola e o container do painel contém o layout, e ambos cortariam o menu. */
        if (menu.parentElement !== document.body) document.body.appendChild(menu);
        menu.hidden = false;
        const r = more.getBoundingClientRect();
        const h = menu.offsetHeight || 96;
        const w = menu.offsetWidth || 140;
        const abaixo = r.bottom + 4 + h <= window.innerHeight - 8;
        menu.style.top = `${Math.max(8, abaixo ? r.bottom + 4 : r.top - h - 4)}px`;
        menu.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
      }
    });
    bRen.addEventListener('click', (ev) => {
      ev.stopPropagation();
      apLibFecharMenus();
      apLibRenomear(entry, nome);
    });
    bDel.addEventListener('click', (ev) => {
      ev.stopPropagation();
      apLibFecharMenus();
      void apLibExcluir(entry);
    });

    const escolher = () => {
      if (origem === 'audio') apresentacaoAudioAtualId = item.id;
      else apresentacaoArquivoSelecionadoId = item.id || null;
      salvarEstadoModoApresentacaoNoStorage();
      renderBibliotecaMidiasApresentacao();
    };
    const ehControle = (ev) =>
      ev.target instanceof HTMLElement && ev.target.closest('.ap-lib-more, .ap-lib-menu, .ap-menu-edit-input');
    row.addEventListener('click', (ev) => {
      if (ehControle(ev)) return;
      escolher();
    });
    row.addEventListener('dblclick', (ev) => {
      if (ehControle(ev)) return;
      projetarItemApresentacao(item);
      if (origem === 'audio') renderBibliotecaMidiasApresentacao();
    });
    row.addEventListener('keydown', (ev) => {
      if (ev.target !== row) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        escolher();
      }
    });
    row.append(thumb, main, more, menu);
    list.appendChild(row);
  });
}

function configurarBibliotecaMidiasApresentacao() {
  document.querySelectorAll('#painel-modo-apresentacao .ap-lib-tab').forEach((t) => {
    t.addEventListener('click', () => apLibDefinirAba(t.dataset.tab));
  });
  document.getElementById('ap-lib-search')?.addEventListener('input', (e) => {
    apLibBusca = String(e.target.value || '');
    renderBibliotecaMidiasApresentacao();
  });
  document.getElementById('ap-lib-list')?.addEventListener('scroll', apLibFecharMenus, { passive: true });
  document.getElementById('ap-lib-import')?.addEventListener('click', () => escolherArquivoModoApresentacao());
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('.ap-lib-more, .ap-lib-menu')) apLibFecharMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') apLibFecharMenus();
  });
}

/** Mantidos como pontos de entrada: muitos fluxos chamam estes nomes ao mudar os dados. */
function renderMenuApresentacao() {
  renderBibliotecaMidiasApresentacao();
}

function renderListaAudiosApresentacao() {
  renderBibliotecaMidiasApresentacao();
}

/** Importação única: áudio segue o fluxo do Player; o resto, o de "Arquivos no menu". */
function importarArquivosBibliotecaMidias(files) {
  const lista = Array.from(files || []);
  if (!lista.length) return;
  const kindDe = (f) => detectarKindApresentacaoPorMimeOuNome(String(f.type || ''), String(f.name || ''));
  const audios = lista.filter((f) => kindDe(f) === 'audio');
  const demais = lista.filter((f) => kindDe(f) !== 'audio');
  const primeiro = kindDe(lista[0]);
  apLibDefinirAba(primeiro === 'video' || primeiro === 'audio' ? primeiro : 'image', { render: false });
  apLibBusca = '';
  const campo = document.getElementById('ap-lib-search');
  if (campo) campo.value = '';
  if (audios.length) adicionarAudiosAoMenu(audios);
  if (demais.length) adicionarArquivosAoMenu(demais);
  renderBibliotecaMidiasApresentacao();
}

function adicionarAudiosAoMenu(files) {
  Array.from(files || []).forEach((file) => {
    criarItemApresentacaoDeArquivo(file, (item) => {
      if (item.kind !== 'audio') return;
      apresentacaoAudios.push(item);
      salvarEstadoModoApresentacaoNoStorage();
      renderListaAudiosApresentacao();
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Playlist de vídeos (modo Mídias)
   Camada de orquestração por cima do motor de vídeo único já existente.
   Reutiliza: projetarItemApresentacao, prepararPlayerVideoAposProjetar,
   iniciarRelogioUiVideo, pausarAudioLocalApresentacao, encerrarModoApresentacaoNoTelao.
   ═══════════════════════════════════════════════════════════════════════════ */

const PLAYLIST_ATRASOS_PERMITIDOS = [0, 1, 2, 3, 5];

function playlistItemAtual() {
  if (playlistVideoIndice < 0) return null;
  return apresentacaoVideoPlaylist[playlistVideoIndice] || null;
}

function playlistItemAtualId() {
  const it = playlistItemAtual();
  return it ? it.id : null;
}

/** true somente quando a playlist está ativa E o vídeo projetado é o item atual dela. */
function playlistControlaReproducaoAtual() {
  return (
    playlistVideoAtiva &&
    playlistVideoIndice >= 0 &&
    !!apresentacaoMidiaProjetadaId &&
    apresentacaoMidiaProjetadaId === playlistItemAtualId()
  );
}

function cancelarAvancoAutoPlaylist() {
  if (_playlistAutoTimer) {
    clearTimeout(_playlistAutoTimer);
    _playlistAutoTimer = null;
  }
}

/** Inicia a reprodução do vídeo já projetado no telão, a partir de fromTime. */
function iniciarPlaybackVideoProjetado(fromTime = 0) {
  const dur = Math.max(0, Number(audioStateRemoto.duration) || 0);
  let t = Math.max(0, Number(fromTime) || 0);
  if (dur > 0 && t >= dur - 0.05) t = 0;
  audioStateRemoto.mediaKind = 'video';
  audioStateRemoto.playing = true;
  audioStateRemoto.currentTime = t;
  _videoUiClockBase = t;
  _videoUiClockT0 = performance.now();
  emitirEstadoVideoParaServidor({ playing: true, syncTime: true, currentTime: t });
  iniciarRelogioUiVideo();
  reproduzirElementoPreviewLocal(t);
  atualizarUiPlayerAudioRemoto();
  renderGridApresentacao();
}

/** Projeta e reproduz o item i da playlist, reutilizando o motor de vídeo único. */
async function reproduzirItemPlaylist(i) {
  if (!apresentacaoVideoPlaylist.length) return;
  const idx = Math.max(0, Math.min(apresentacaoVideoPlaylist.length - 1, Math.round(Number(i) || 0)));
  const item = apresentacaoVideoPlaylist[idx];
  if (!item) return;
  cancelarAvancoAutoPlaylist();
  playlistVideoIndice = idx;
  playlistVideoAtiva = true;
  renderListaPlaylistApresentacao();
  const it = await restaurarItemVideoApresentacao(item);
  if (!it?.src) {
    playlistVideoAtiva = false;
    renderListaPlaylistApresentacao();
    alert('Não foi possível carregar o vídeo da playlist. Adicione o arquivo novamente.');
    return;
  }
  apresentacaoVideoPlaylist[idx] = { ...item, ...it };
  if (Number(item.duracao) > 0) apresentacaoVideoPlaylist[idx].duracao = Number(item.duracao);
  _playlistProjetando = true;
  try {
    await projetarItemApresentacao(apresentacaoVideoPlaylist[idx]);
  } finally {
    _playlistProjetando = false;
  }
  if (apresentacaoMidiaProjetadaId !== apresentacaoVideoPlaylist[idx].id) {
    playlistVideoAtiva = false;
    renderListaPlaylistApresentacao();
    return;
  }
  iniciarPlaybackVideoProjetado(0);
  renderListaPlaylistApresentacao();
  /* Reforço: o telão pode montar o <video> logo após receber a projeção;
     reenvia o play para evitar que o primeiro comando chegue antes do elemento. */
  setTimeout(() => {
    if (playlistControlaReproducaoAtual() && audioStateRemoto.playing) {
      emitirEstadoVideoParaServidor({
        playing: true,
        syncTime: true,
        currentTime: Number(audioStateRemoto.currentTime) || 0,
      });
    }
  }, 350);
}

/** Chamado quando um vídeo da playlist termina (a partir do relógio da UI). */
function aoTerminarVideoPlaylist() {
  const total = apresentacaoVideoPlaylist.length;
  const proximo = playlistVideoIndice + 1;
  if (proximo >= total) {
    playlistVideoAtiva = false;
    cancelarAvancoAutoPlaylist();
    renderListaPlaylistApresentacao();
    return;
  }
  playlistVideoIndice = proximo;
  renderListaPlaylistApresentacao();
  if (playlistVideoModo === 'auto') {
    const atrasoMs = Math.max(0, Number(playlistVideoAtrasoAuto) || 0) * 1000;
    cancelarAvancoAutoPlaylist();
    _playlistAutoTimer = setTimeout(() => {
      _playlistAutoTimer = null;
      void reproduzirItemPlaylist(playlistVideoIndice);
    }, atrasoMs);
  }
}

function playlistAlternarModo(force) {
  const semArgumento = force === undefined || force === null;
  const prox = semArgumento
    ? playlistVideoModo === 'auto'
      ? 'manual'
      : 'auto'
    : force === 'auto'
      ? 'auto'
      : 'manual';
  playlistVideoModo = prox;
  if (prox === 'manual') cancelarAvancoAutoPlaylist();
  salvarEstadoModoApresentacaoNoStorage();
  atualizarControlesPlaylistUi();
}

function playlistDefinirAtraso(seg) {
  let v = Math.round(Number(seg) || 0);
  if (!PLAYLIST_ATRASOS_PERMITIDOS.includes(v)) v = 0;
  playlistVideoAtrasoAuto = v;
  salvarEstadoModoApresentacaoNoStorage();
  atualizarControlesPlaylistUi();
}

/** Lê a duração de um arquivo de vídeo sem carregar tudo (metadata via objectURL). */
function probeDuracaoArquivoVideo(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      const limpar = () => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
  // intencional — erro ignorado
}
      };
      v.onloadedmetadata = () => {
        const d = Number(v.duration);
        limpar();
        resolve(Number.isFinite(d) ? d : 0);
      };
      v.onerror = () => {
        limpar();
        resolve(0);
      };
      setTimeout(() => resolve(0), 12000);
      v.src = url;
    } catch (_) {
      resolve(0);
    }
  });
}

function playlistAdicionarVideos(files) {
  Array.from(files || []).forEach((file) => {
    const mime = String(file.type || '');
    const nome = String(file.name || 'vídeo');
    if (!/^video\//i.test(mime) && !/\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(nome)) return;
    criarItemApresentacaoDeArquivo(file, (item) => {
      if (item.kind !== 'video') return;
      apresentacaoVideoPlaylist.push(item);
      renderListaPlaylistApresentacao();
      salvarEstadoModoApresentacaoNoStorage();
      void probeDuracaoArquivoVideo(file).then((d) => {
        if (d > 0) {
          const alvo = apresentacaoVideoPlaylist.find((x) => x && x.id === item.id);
          if (alvo) {
            alvo.duracao = d;
            renderListaPlaylistApresentacao();
            salvarEstadoModoApresentacaoNoStorage();
          }
        }
      });
    });
  });
}

function playlistRemover(id) {
  const idx = apresentacaoVideoPlaylist.findIndex((x) => x && x.id === id);
  if (idx < 0) return;
  const eraItemProjetado = audioStateRemoto.mediaKind === 'video' && apresentacaoMidiaProjetadaId === id;
  apresentacaoVideoPlaylist.splice(idx, 1);
  if (eraItemProjetado) {
    cancelarAvancoAutoPlaylist();
    playlistVideoAtiva = false;
    void encerrarModoApresentacaoNoTelao();
  }
  if (idx < playlistVideoIndice) {
    playlistVideoIndice -= 1;
  } else if (idx === playlistVideoIndice) {
    if (playlistVideoIndice >= apresentacaoVideoPlaylist.length) {
      playlistVideoIndice = apresentacaoVideoPlaylist.length - 1;
    }
  }
  if (!apresentacaoVideoPlaylist.length) playlistVideoIndice = -1;
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

async function playlistLimpar() {
  if (!apresentacaoVideoPlaylist.length) return;
  const ok = await appConfirm('Limpar toda a playlist de vídeos?', 'Modo mídias');
  if (!ok) return;
  cancelarAvancoAutoPlaylist();
  const eraVideo = playlistVideoAtiva && audioStateRemoto.mediaKind === 'video' && videoProjetadoAtivoNoPlayer();
  apresentacaoVideoPlaylist = [];
  playlistVideoIndice = -1;
  playlistVideoAtiva = false;
  if (eraVideo) void encerrarModoApresentacaoNoTelao();
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

function playlistMover(id, dir) {
  const idx = apresentacaoVideoPlaylist.findIndex((x) => x && x.id === id);
  if (idx < 0) return;
  const alvo = idx + (dir === 'up' ? -1 : 1);
  if (alvo < 0 || alvo >= apresentacaoVideoPlaylist.length) return;
  const arr = apresentacaoVideoPlaylist;
  const tmp = arr[idx];
  arr[idx] = arr[alvo];
  arr[alvo] = tmp;
  if (playlistVideoIndice === idx) playlistVideoIndice = alvo;
  else if (playlistVideoIndice === alvo) playlistVideoIndice = idx;
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

/** Reordena por arrastar-e-soltar: move fromId para a posição de toId. */
function playlistReordenarArrastando(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const atualId = playlistItemAtualId();
  const from = apresentacaoVideoPlaylist.findIndex((x) => x && x.id === fromId);
  if (from < 0) return;
  const [movido] = apresentacaoVideoPlaylist.splice(from, 1);
  let to = apresentacaoVideoPlaylist.findIndex((x) => x && x.id === toId);
  if (to < 0) to = apresentacaoVideoPlaylist.length;
  apresentacaoVideoPlaylist.splice(to, 0, movido);
  if (atualId) {
    const ni = apresentacaoVideoPlaylist.findIndex((x) => x && x.id === atualId);
    if (ni >= 0) playlistVideoIndice = ni;
  }
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

/** Atualiza botões de transporte, modo e intervalo (estado, não a lista inteira). */
function atualizarControlesPlaylistUi() {
  const auto = playlistVideoModo === 'auto';
  const modoBtn = document.getElementById('ap-playlist-modo');
  if (modoBtn) {
    modoBtn.classList.toggle('ap-switch--on', auto);
    modoBtn.setAttribute('aria-checked', auto ? 'true' : 'false');
    modoBtn.title = auto
      ? 'Avanço automático ativado — clique para Manual'
      : 'Avanço manual — clique para Automático';
  }
  const atrasoSel = document.getElementById('ap-playlist-atraso');
  if (atrasoSel) {
    atrasoSel.value = String(playlistVideoAtrasoAuto);
    atrasoSel.disabled = !auto;
  }
  const clearBtn = document.getElementById('ap-playlist-clear');
  if (clearBtn) clearBtn.disabled = !apresentacaoVideoPlaylist.length;
  _playlistUiTocandoCache = playlistControlaReproducaoAtual() && !!audioStateRemoto.playing;
}

/** Sincroniza só o destaque da linha ativa da playlist em transições (chamado a cada tick). */
function atualizarPlaylistUiAoVivoSeMudou() {
  const list = document.getElementById('apresentacao-playlist-list');
  if (!list) return;
  const tocando = playlistControlaReproducaoAtual() && !!audioStateRemoto.playing;
  if (_playlistUiTocandoCache === tocando) return;
  _playlistUiTocandoCache = tocando;
  if (list && playlistVideoIndice >= 0) {
    const row = list.querySelectorAll('.ap-playlist-item')[playlistVideoIndice];
    if (row) {
      row.classList.toggle('is-playing', tocando);
      row.classList.toggle('is-current', !tocando);
      const badge = row.querySelector('.ap-playlist-badge');
      const meta = row.querySelector('.ap-menu-item-meta');
      if (badge) badge.textContent = tocando ? '▶' : String(playlistVideoIndice + 1).padStart(2, '0');
      if (meta) {
        const it = apresentacaoVideoPlaylist[playlistVideoIndice];
        const durTxt = it && Number(it.duracao) > 0 ? ` · ${fmtTempoAudio(it.duracao)}` : '';
        meta.textContent = (tocando ? 'Tocando agora' : 'Pausado') + durTxt;
      }
    }
  }
}

function renderListaPlaylistApresentacao() {
  const list = document.getElementById('apresentacao-playlist-list');
  if (!list) return;
  list.innerHTML = '';
  if (!apresentacaoVideoPlaylist.length) {
    list.innerHTML =
      '<div class="placeholder-msg" style="margin:4px 0 0;">Nenhum vídeo na playlist. Use “Adicionar”.</div>';
    atualizarControlesPlaylistUi();
    return;
  }
  const projetadoEhAtual = !!apresentacaoMidiaProjetadaId && apresentacaoMidiaProjetadaId === playlistItemAtualId();
  apresentacaoVideoPlaylist.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'ap-menu-item ap-playlist-item';
    row.setAttribute('draggable', 'true');
    row.dataset.id = item.id;

    let statusTxt = 'Na fila';
    let statusCls = '';
    if (i === playlistVideoIndice) {
      if (projetadoEhAtual && audioStateRemoto.playing) {
        statusTxt = 'Tocando agora';
        statusCls = 'is-playing';
      } else if (projetadoEhAtual) {
        statusTxt = 'Pausado';
        statusCls = 'is-current';
      } else {
        statusTxt = 'Selecionado';
        statusCls = 'is-current';
      }
    } else if (i === playlistVideoIndice + 1) {
      statusTxt = 'Próximo';
      statusCls = 'is-next';
    }
    if (statusCls) row.classList.add(statusCls);

    const durTxt = Number(item.duracao) > 0 ? ` · ${fmtTempoAudio(item.duracao)}` : '';
    const badge = statusCls === 'is-playing' ? '▶' : String(i + 1).padStart(2, '0');
    row.innerHTML = `
      <div class="ap-playlist-badge" aria-hidden="true">${escapeHtml(badge)}</div>
      <div class="ap-menu-item-main">
        <div class="ap-menu-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <span class="ap-menu-item-meta">${escapeHtml(statusTxt)}${durTxt}</span>
      </div>
      <div class="ap-menu-item-actions">
        <button type="button" class="ap-menu-action mv-up" title="Mover para cima" aria-label="Mover para cima">↑</button>
        <button type="button" class="ap-menu-action mv-down" title="Mover para baixo" aria-label="Mover para baixo">↓</button>
        <button type="button" class="ap-menu-action delete" title="Remover da playlist" aria-label="Remover da playlist">✕</button>
      </div>
    `;

    row.addEventListener('dblclick', () => {
      void reproduzirItemPlaylist(i);
    });
    row.querySelector('.mv-up')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playlistMover(item.id, 'up');
    });
    row.querySelector('.mv-down')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playlistMover(item.id, 'down');
    });
    row.querySelector('.delete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await appConfirm(`Remover "${item.name}" da playlist?`, 'Modo mídias');
      if (ok) playlistRemover(item.id);
    });

    row.addEventListener('dragstart', (e) => {
      playlistArrastandoId = item.id;
      row.classList.add('arrastando');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
      } catch (_) {
  // intencional — erro ignorado
}
    });
    row.addEventListener('dragend', () => {
      playlistArrastandoId = null;
      row.classList.remove('arrastando');
      list.querySelectorAll('.ap-playlist-item').forEach((r) => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('drag-over');
      try {
        e.dataTransfer.dropEffect = 'move';
      } catch (_) {
  // intencional — erro ignorado
}
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const fromId = playlistArrastandoId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      playlistReordenarArrastando(fromId, item.id);
    });

    list.appendChild(row);
  });
  atualizarControlesPlaylistUi();
  atualizarPreviewVideoAoVivo();
}

let _playerVideoToggleLock = false;

async function tocarAudioAtualSelecionado() {
  const itemVideo = obterItemVideoProjetadoNoPlayer();
  if (itemVideo) {
    if (_playerVideoToggleLock) return;
    _playerVideoToggleLock = true;
    const querPausar = !!audioStateRemoto.playing;
    let liberarLockNoFinally = true;
    try {
      audioStateRemoto.mediaKind = 'video';
      audioStateRemoto.name = itemVideo.name || 'Vídeo';

      if (querPausar) {
        pausarAudioLocalApresentacao();
        renderGridApresentacao();
        liberarLockNoFinally = false;
        setTimeout(() => {
          _playerVideoToggleLock = false;
        }, 0);
        return;
      }

      const item = await restaurarItemVideoApresentacao(itemVideo);
      if (!item?.src) {
        alert('Não foi possível carregar o vídeo. Selecione o arquivo novamente no card 5.');
        return;
      }
      const el = obterElementoVideoLocal();
      if (el && (!Number.isFinite(audioStateRemoto.duration) || audioStateRemoto.duration <= 0)) {
        if (!el.src || el.src !== item.src) {
          prepararElementoVideoLocalControle(el);
          el.preload = 'metadata';
          el.src = item.src;
          await aguardarMetadadosVideo(el, 6000);
        }
        if (Number.isFinite(el.duration) && el.duration > 0) {
          audioStateRemoto.duration = Number(el.duration);
        }
      }
      const t = Number(audioStateRemoto.currentTime) || 0;
      audioStateRemoto.playing = true;
      _videoUiClockBase = t;
      _videoUiClockT0 = performance.now();
      emitirEstadoVideoParaServidor({ playing: true, syncTime: true, currentTime: t });
      iniciarRelogioUiVideo();
      reproduzirElementoPreviewLocal(t);
      atualizarUiPlayerAudioRemoto();
      renderGridApresentacao();
    } finally {
      if (liberarLockNoFinally) _playerVideoToggleLock = false;
    }
    return;
  }
  if (!apresentacaoAudioAtualId) return;
  const item = apresentacaoAudios.find((x) => x.id === apresentacaoAudioAtualId);
  if (!item) return;
  if (audioStateRemoto.playing && audioStateRemoto.mediaKind === 'audio' && apresentacaoAudioAtualId === item.id) {
    pausarAudioServidor();
  } else {
    const deveRetomarMesmoAudio = audioStateRemoto.mediaKind === 'audio' && apresentacaoAudioAtualId === item.id;
    if (deveRetomarMesmoAudio) {
      const dur = Math.max(0, Number(audioStateRemoto.duration) || 0);
      const atual = Math.max(0, Number(audioStateRemoto.currentTime) || 0);
      const startTime = dur > 0 && atual >= Math.max(0, dur - 0.35) ? 0 : atual;
      const ok = await tocarAudioServidorApresentacao(item, { startTime });
      if (ok) atualizarRodapeAudioApresentacao(item);
    } else {
      await projetarItemApresentacao(item);
    }
  }
  renderListaAudiosApresentacao();
}

function pausarAudioServidor() {
  pausarAudioServidorPlayback();
}

function pararAudioServidor() {
  const eraVideo = audioStateRemoto.mediaKind === 'video' && videoProjetadoAtivoNoPlayer();
  pararAudioServidorPlayback();
  apresentacaoAudioAtualId = null;
  salvarEstadoModoApresentacaoNoStorage();
  renderListaAudiosApresentacao();
  if (eraVideo) {
    void encerrarModoApresentacaoNoTelao();
    renderGridApresentacao();
    return;
  }
  if (!apresentacaoMidiaProjetadaId) {
    atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'Reprodução parada.' });
  } else {
    renderGridApresentacao();
  }
}


/**
 * URL segura para `<img>` nos cards: só conteúdo **imagem** (`data:image/…`, `blob:` ou
 * `http(s)://…/api/apresentacao/media/id`). PDF/vídeo/áudio usam o mesmo endpoint no servidor
 * mas não são renderizáveis em `<img>` — sem o filtro por tipo aparecia ícone de imagem partida.
 */
/** Índice do card destacado na grelha (0–5) ou null — igual «slide seleccionado» na faixa do modo slide. */
let apresentacaoCardSelecionadoIdx = null;
/** Debounce entre clique simples e duplo na grelha de apresentação (padrão playlist). */
let apresentacaoCardUiClickTimer = null;

function aplicarClasseSelecaoCardsApresentacaoNoDom() {
  const grid = document.getElementById('apresentacao-grid');
  if (!grid) return;
  grid.querySelectorAll('.ap-card[data-ap-card-idx]').forEach((el) => {
    const idx = parseInt(el.dataset.apCardIdx, 10);
    const sel =
      Number.isFinite(idx) &&
      apresentacaoCardSelecionadoIdx !== null &&
      idx === apresentacaoCardSelecionadoIdx;
    el.classList.toggle('ap-card--selecionado', sel);
  });
}

function definirSelecaoCardApresentacao(idx) {
  if (idx === null || idx === undefined) {
    apresentacaoCardSelecionadoIdx = null;
  } else {
    const n = Number(idx);
    apresentacaoCardSelecionadoIdx = Number.isFinite(n) && n >= 0 && n <= 5 ? n : null;
  }
  /* Seleccionar outro card larga a área destacada dentro do card 4. */
  if (apresentacaoCardSelecionadoIdx !== APRESENTACAO_IDX_CARD4) {
    apresentacaoCard4SubSelecionadoIdx = null;
  }
  aplicarClasseSelecaoCardsApresentacaoNoDom();
}

/**
 * Card 4 — quatro áreas de imagem numa grelha 2×2 dentro do mesmo cartão.
 *
 * Ocupa a célula da grelha que sempre ocupou e mantém a moldura, o número e o
 * comportamento dos outros cards; o que muda é o interior, dividido por uma linha
 * vertical e uma horizontal em quatro áreas que se enchem e projetam uma a uma.
 *
 * O cartão em si nunca fica com o desenho de «vazio»: quem está vazia, ou não, é cada
 * uma das áreas lá dentro.
 */
function montarCardQuatroImagensApresentacao() {
  const card = document.createElement('div');
  card.dataset.apCardIdx = String(APRESENTACAO_IDX_CARD4);
  card.className = 'ap-card ap-card--quad';

  const num = document.createElement('span');
  num.className = 'ap-card-num';
  num.textContent = `CARD ${APRESENTACAO_IDX_CARD4 + 1}`;

  const body = document.createElement('div');
  body.className = 'ap-card-body ap-card-body--quad';
  body.dataset.cardIdx = String(APRESENTACAO_IDX_CARD4);
  for (let sub = 0; sub < 4; sub++) {
    body.appendChild(montarAreaImagemCard4(sub));
  }

  card.appendChild(num);
  card.appendChild(body);
  return card;
}

/**
 * Uma das quatro áreas do card 4.
 *
 * Cada área é independente: recebe o seu ficheiro, mostra a sua imagem, tem o seu «X» e
 * responde ao clique (selecionar) e ao duplo clique (projetar) como qualquer card da
 * grelha — é o mesmo `projetarItemApresentacao` de sempre, que não precisa de saber de
 * onde veio a imagem.
 *
 * Aqui só entram imagens. Vídeo continua a ser exclusivo do card 5, e PDF/apresentação
 * não teriam como se mostrar numa área deste tamanho.
 *
 * @param {number} sub 0 = cima-esquerda, 1 = cima-direita, 2 = baixo-esquerda, 3 = baixo-direita
 */
function montarAreaImagemCard4(sub) {
  const item = apresentacaoCard4Imagens[sub] || null;
  const slot = document.createElement('div');
  slot.className = 'ap-quad-slot' + (item ? '' : ' ap-quad-slot--vazio');
  slot.dataset.card4Sub = String(sub);
  if (apresentacaoCard4SubSelecionadoIdx === sub) slot.classList.add('ap-quad-slot--selecionado');

  if (!item) {
    slot.title = `Imagem ${sub + 1} do card 4 — clique para escolher um ficheiro`;
    const mais = document.createElement('div');
    mais.className = 'ap-quad-plus';
    mais.textContent = '+';
    mais.setAttribute('aria-hidden', 'true');
    slot.appendChild(mais);
    slot.addEventListener('click', () => {
      apresentacaoCard4InputTarget = sub;
      apresentacaoCardInputTarget = null;
      const input = document.getElementById('apresentacao-add-card-input');
      if (!input) return;
      input.accept = 'image/*';
      input.value = '';
      input.click();
    });
  } else {
    slot.title = `${String(item.name || 'imagem')} — clique para selecionar · duplo clique para projetar`;
    const src = srcImagemApresentacaoSeguro(item.src, item);
    if (src) {
      const img = document.createElement('img');
      img.className = 'ap-quad-img';
      img.alt = String(item.name || 'imagem');
      img.src = src;
      slot.appendChild(img);
    }
    if (item.id && item.id === apresentacaoMidiaProjetadaId) {
      slot.classList.add('ap-quad-slot--projetando');
      const live = document.createElement('div');
      live.className = 'ap-quad-live';
      live.textContent = 'AO VIVO';
      live.setAttribute('aria-hidden', 'true');
      slot.appendChild(live);
    }

    slot.draggable = true;
    slot.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', item.id || '');
      ev.dataTransfer.setData('application/x-ap-card4-sub-idx', String(sub));
      ev.dataTransfer.effectAllowed = 'copyMove';
    });
    slot.addEventListener('click', (ev) => {
      if (ev.target.closest('.ap-quad-remove')) return;
      if (ev.detail >= 2) return;
      clearTimeout(apresentacaoCardUiClickTimer);
      apresentacaoCardUiClickTimer = setTimeout(() => {
        apresentacaoCardUiClickTimer = null;
        apresentacaoCard4SubSelecionadoIdx = sub;
        definirSelecaoCardApresentacao(APRESENTACAO_IDX_CARD4);
        /* Troca a classe nas quatro áreas em vez de redesenhar a grelha: um clique não
           deve fazer as imagens piscarem enquanto voltam a carregar. */
        slot.parentElement?.querySelectorAll('.ap-quad-slot').forEach((el) => {
          el.classList.toggle('ap-quad-slot--selecionado', el === slot);
        });
      }, 300);
    });
    slot.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('.ap-quad-remove')) return;
      ev.preventDefault();
      clearTimeout(apresentacaoCardUiClickTimer);
      apresentacaoCardUiClickTimer = null;
      projetarItemApresentacao(item);
    });

    const btnRemove = document.createElement('button');
    btnRemove.type = 'button';
    btnRemove.className = 'ap-quad-remove';
    btnRemove.title = 'Remover esta imagem';
    btnRemove.setAttribute('aria-label', `Remover a imagem ${sub + 1} do card 4`);
    btnRemove.textContent = 'X';
    btnRemove.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (item.id && apresentacaoMidiaProjetadaId === item.id) {
        apresentacaoMidiaProjetadaId = null;
        void emitirEncerrarApresentacaoPublicoAoServidor();
      }
      if (apresentacaoCard4SubSelecionadoIdx === sub) apresentacaoCard4SubSelecionadoIdx = null;
      apresentacaoCard4Imagens[sub] = null;
      salvarEstadoModoApresentacaoNoStorage();
      renderGridApresentacao();
      atualizarFeedbackProjecaoApresentacaoUi({
        mensagemIdle: `Imagem ${sub + 1} do card 4 removida.`,
      });
    });
    slot.appendChild(btnRemove);
  }

  slot.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    slot.classList.add('drag-over');
    ev.dataTransfer.dropEffect = 'copy';
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
  slot.addEventListener('drop', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    slot.classList.remove('drag-over');
    const id = String(ev.dataTransfer.getData('text/plain') || '');
    const subDe = parseInt(String(ev.dataTransfer.getData('application/x-ap-card4-sub-idx') || ''), 10);
    const cardDe = parseInt(String(ev.dataTransfer.getData('application/x-ap-card-idx') || ''), 10);
    const veioDeArea = Number.isInteger(subDe) && subDe >= 0 && subDe < 4;
    const veioDeCard = !veioDeArea && Number.isInteger(cardDe) && cardDe >= 0 && cardDe < 5;

    let it = null;
    if (id) it = apresentacaoBiblioteca.find((x) => x.id === id) || null;
    if (!it && veioDeArea) it = apresentacaoCard4Imagens[subDe] || null;
    if (!it && veioDeCard) it = apresentacaoCards[cardDe] || null;
    if (!it) return;
    if (!ehItemImagemApresentacao(it)) {
      alert('As quatro áreas do card 4 exibem apenas imagens.');
      return;
    }
    /* Arrastar é mover, como entre os outros cards: a origem fica livre. */
    if (veioDeArea) {
      if (subDe === sub) return;
      apresentacaoCard4Imagens[subDe] = null;
    } else if (veioDeCard) {
      apresentacaoCards[cardDe] = null;
    }
    apresentacaoCard4Imagens[sub] = it;
    salvarEstadoModoApresentacaoNoStorage();
    renderGridApresentacao();
  });

  return slot;
}

/**
 * Ficheiro escolhido no seletor para uma das quatro áreas do card 4.
 *
 * Espelha `adicionarArquivoDiretoNoCard` — cria o item, junta-o à biblioteca se ainda lá
 * não estiver e grava — mudando só onde o item fica e o que é aceite.
 */
function adicionarImagemNaAreaCard4(file, sub) {
  const s = Number(sub);
  if (!Number.isInteger(s) || s < 0 || s > 3) return;
  criarItemApresentacaoDeArquivo(file, (item) => {
    if (!ehItemImagemApresentacao(item)) {
      alert('As quatro áreas do card 4 aceitam apenas imagens.');
      return;
    }
    apresentacaoCard4Imagens[s] = item;
    const ja = apresentacaoBiblioteca.some((x) => x.src === item.src && x.name === item.name);
    if (!ja) apresentacaoBiblioteca.push(item);
    salvarEstadoModoApresentacaoNoStorage();
    renderMenuApresentacao();
    renderGridApresentacao();
    atualizarFeedbackProjecaoApresentacaoUi({
      mensagemIdle: `Imagem ${s + 1} do card 4: ${item.name}`,
    });
  });
}

function renderGridApresentacao() {
  const grid = document.getElementById('apresentacao-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    /* O card 4 não guarda uma mídia: é o recipiente das quatro áreas de imagem. */
    if (i === APRESENTACAO_IDX_CARD4) {
      grid.appendChild(montarCardQuatroImagensApresentacao());
      continue;
    }
    const card = document.createElement('div');
    const item = apresentacaoCards[i];
    card.dataset.apCardIdx = String(i);
    card.className = item ? 'ap-card' : 'ap-card ap-card--vazio';
    const num = document.createElement('span');
    num.className = 'ap-card-num';
    num.textContent = i === APRESENTACAO_IDX_CARD5 ? 'CARD 5 — (APENAS VÍDEO)' : `CARD ${i + 1}`;
    const body = document.createElement('div');
    body.className = 'ap-card-body';
    body.dataset.cardIdx = String(i);
    if (!item) {
      body.innerHTML = '<div class="ap-card-plus">+</div>';
      body.addEventListener('click', () => {
        apresentacaoCardInputTarget = i;
        apresentacaoCard4InputTarget = null;
        const input = document.getElementById('apresentacao-add-card-input');
        if (!input) return;
        input.accept =
          i === APRESENTACAO_IDX_CARD5
            ? 'video/*'
            : 'image/*,application/pdf,.ppt,.pptx,.odp';
        input.value = '';
        input.click();
      });
    } else {
      const srcRaw = String(item.src || '');
      const kItem = String(item.kind || '').toLowerCase();
      const mimeItem = String(item.mime || '').toLowerCase();
      const ehCard5Video = i === APRESENTACAO_IDX_CARD5 && kItem === 'video';
      if (ehCard5Video) {
        card.classList.add('ap-card--video');
        body.className = 'ap-card-body ap-card-body--video';
      }
      const ehImg =
        !ehCard5Video &&
        (/^data:image\//i.test(srcRaw) ||
          (kItem === 'image' || mimeItem.startsWith('image/')));
      const srcImg = ehImg ? srcImagemApresentacaoSeguro(item.src, item) : '';
      const metaLinha = `${svgIconeTipoMidiaApresentacao(item.kind)}<span>${escapeHtml(rotuloTipoMidiaApresentacao(item.kind))}</span>`;
      const wrap = document.createElement('div');
      wrap.className = ehCard5Video ? 'ap-card5-video-wrap' : 'ap-card-file';
      const card5VideoAoVivo =
        ehCard5Video &&
        item.id === apresentacaoMidiaProjetadaId &&
        audioStateRemoto.mediaKind === 'video' &&
        !!audioStateRemoto.playing;
      if (ehCard5Video && card5VideoAoVivo) {
        /* Slot placeholder com id estável; o overlay de vídeo ao vivo o cobre. */
        const slot = document.createElement('div');
        slot.className = 'ap-card5-video-player';
        slot.id = 'ap-card5-video-live-slot';
        slot.setAttribute('aria-hidden', 'true');
        wrap.appendChild(slot);
      } else if (ehCard5Video) {
        const thumbSrc = obterThumbVideoApresentacao(item);
        if (thumbSrc) {
          const img = document.createElement('img');
          img.className = 'ap-card5-video-player ap-card5-video-thumb';
          img.alt = '';
          img.src = thumbSrc;
          wrap.appendChild(img);
        } else {
          const ph = document.createElement('div');
          ph.className = 'ap-card5-video-player ap-card5-video-thumb-placeholder';
          ph.setAttribute('aria-hidden', 'true');
          wrap.appendChild(ph);
          void garantirThumbnailVideoItem(item).then((it) => {
            if (videoProjetadoAtivoNoPlayer() && audioStateRemoto.playing) return;
            if (!it?.thumb) return;
            apresentacaoCards[APRESENTACAO_IDX_CARD5] = it;
            const bibIdx = apresentacaoBiblioteca.findIndex((x) => x && x.id === it.id);
            if (bibIdx >= 0) apresentacaoBiblioteca[bibIdx] = it;
            salvarEstadoModoApresentacaoNoStorage();
            if (ehModoApresentacaoOperador()) renderGridApresentacao();
          });
        }
      } else if (srcImg) {
        const img = document.createElement('img');
        img.className = 'ap-card-preview-image';
        img.alt = String(item.name || 'imagem');
        img.src = srcImg;
        wrap.appendChild(img);
      }
      const nomeEl = document.createElement('div');
      nomeEl.className = ehCard5Video ? 'ap-card5-video-name' : 'ap-card-file-name';
      nomeEl.title = String(item.name || '');
      nomeEl.textContent = String(item.name || 'Arquivo');
      wrap.appendChild(nomeEl);
      if (!ehCard5Video) {
        const metaEl = document.createElement('div');
        metaEl.className = 'ap-card-file-meta';
        metaEl.title = String(item.name || '');
        metaEl.innerHTML = metaLinha;
        wrap.appendChild(metaEl);
      }
      if (item.id && item.id === apresentacaoMidiaProjetadaId && item.kind !== 'audio') {
        card.classList.add('ap-card--projetando');
        const live = document.createElement('div');
        live.className = 'ap-card-live-pill';
        live.textContent = 'AO VIVO';
        live.setAttribute('aria-hidden', 'true');
        wrap.insertBefore(live, wrap.firstChild);
      }
      body.appendChild(wrap);
      body.draggable = true;
      body.title = 'Clique para selecionar · duplo clique para projetar';
      body.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', item.id || '');
        ev.dataTransfer.setData('application/x-ap-card-idx', String(i));
        ev.dataTransfer.effectAllowed = 'copyMove';
      });
      body.addEventListener('click', (ev) => {
        if (ev.target.closest('.ap-card-remove')) return;
        if (ev.detail >= 2) return;
        clearTimeout(apresentacaoCardUiClickTimer);
        apresentacaoCardUiClickTimer = setTimeout(() => {
          apresentacaoCardUiClickTimer = null;
          definirSelecaoCardApresentacao(i);
        }, 300);
      });
      body.addEventListener('dblclick', (ev) => {
        if (ev.target.closest('.ap-card-remove')) return;
        ev.preventDefault();
        clearTimeout(apresentacaoCardUiClickTimer);
        apresentacaoCardUiClickTimer = null;
        projetarItemApresentacao(item);
      });

      const btnRemove = document.createElement('button');
      btnRemove.type = 'button';
      btnRemove.className = 'ap-card-remove';
      btnRemove.title = 'Remover arquivo do card';
      btnRemove.setAttribute('aria-label', `Remover arquivo do card ${i + 1}`);
      btnRemove.innerHTML =
        '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>';
      btnRemove.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (item.id && apresentacaoMidiaProjetadaId === item.id) {
          apresentacaoMidiaProjetadaId = null;
          void emitirEncerrarApresentacaoPublicoAoServidor();
        }
        if (apresentacaoCardSelecionadoIdx === i) definirSelecaoCardApresentacao(null);
        apresentacaoCards[i] = null;
        salvarEstadoModoApresentacaoNoStorage();
        atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: `Card ${i + 1} limpo.` });
      });
      card.appendChild(btnRemove);
    }
    body.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      body.classList.add('drag-over');
      ev.dataTransfer.dropEffect = 'copy';
    });
    body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
    body.addEventListener('drop', (ev) => {
      ev.preventDefault();
      body.classList.remove('drag-over');
      const id = String(ev.dataTransfer.getData('text/plain') || '');
      const fromIdxRaw = ev.dataTransfer.getData('application/x-ap-card-idx');
      const fromIdx = parseInt(String(fromIdxRaw || ''), 10);
      let it = null;
      if (id) it = apresentacaoBiblioteca.find((x) => x.id === id) || null;
      if (!it && Number.isInteger(fromIdx) && fromIdx >= 0 && fromIdx < 5) {
        it = apresentacaoCards[fromIdx] || null;
      }
      if (!it) return;
      if (it.kind === 'video' && i !== APRESENTACAO_IDX_CARD5) {
        alert('Use o card 5 para ficheiros de vídeo.');
        return;
      }
      if (it.kind !== 'video' && i === APRESENTACAO_IDX_CARD5) {
        alert('O card 5 aceita apenas vídeos.');
        return;
      }
      if (Number.isInteger(fromIdx) && fromIdx >= 0 && fromIdx < 5) {
        if (fromIdx === i) return;
        apresentacaoCards[fromIdx] = null;
      }
      if (it.kind === 'video') {
        void (async () => {
          const itemHttp = await garantirVideoSrcHttp(it);
          await garantirThumbnailVideoItem(itemHttp);
          apresentacaoCards[i] = itemHttp;
          salvarEstadoModoApresentacaoNoStorage();
          renderGridApresentacao();
        })();
        return;
      }
      apresentacaoCards[i] = it;
      salvarEstadoModoApresentacaoNoStorage();
      renderGridApresentacao();
    });
    card.appendChild(num);
    card.appendChild(body);
    grid.appendChild(card);
  }

  /* Card 6: avisos em texto (sem ficheiro) */
  const i = 5;
  const card6 = document.createElement('div');
  card6.dataset.apCardIdx = '5';
  card6.className = 'ap-card ap-card--aviso';
  card6.title = 'Clique para selecionar o card · duplo clique fora do texto para projetar';
  if (apresentacaoAvisoCard6Ativo) card6.classList.add('ap-card--projetando');
  const num6 = document.createElement('span');
  num6.className = 'ap-card-num';
  num6.textContent = 'CARD 6 — AVISOS';
  const body6 = document.createElement('div');
  body6.className = 'ap-card-body ap-card-body--aviso';
  body6.dataset.cardIdx = '5';
  const ta = document.createElement('textarea');
  ta.className = 'ap-card6-aviso-textarea';
  ta.dataset.apCard6CfgField = '1';
  ta.setAttribute('aria-label', 'Texto de avisos para projetar no card 6');
  ta.placeholder = 'Digite o aviso… (duplo clique projeta)';
  ta.value = apresentacaoCard6Texto;
  aplicarEstiloTextareaAvisoCard6(ta, apresentacaoCard6AvisoCfg);
  ta.addEventListener('click', (ev) => ev.stopPropagation());
  ta.addEventListener('input', () => {
    // Atualização em memória é instantânea; a gravação pesada é adiada (debounce) para não travar a digitação.
    apresentacaoCard6Texto = ta.value;
    agendarSalvarEstadoAposDigitarAviso();
  });
  ta.addEventListener('blur', flushSalvarEstadoAposDigitarAviso);
  ta.addEventListener('dblclick', (ev) => {
    ev.stopPropagation();
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = null;
    projetarAvisoCard6();
  });
  card6.addEventListener('click', (ev) => {
    if (ev.target === ta || (ta && ta.contains(ev.target))) return;
    if (ev.target.closest('.ap-card6-footer')) return;
    if (ev.target.closest('button')) return;
    if (ev.detail >= 2) return;
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = setTimeout(() => {
      apresentacaoCardUiClickTimer = null;
      definirSelecaoCardApresentacao(5);
    }, 300);
  });
  card6.addEventListener('dblclick', (ev) => {
    if (ev.target === ta || (ta && ta.contains(ev.target))) return;
    if (ev.target.closest('.ap-card6-footer')) return;
    if (ev.target.closest('button')) return;
    ev.preventDefault();
    ev.stopPropagation();
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = null;
    projetarAvisoCard6();
  });
  if (apresentacaoAvisoCard6Ativo) {
    const live = document.createElement('div');
    live.className = 'ap-card-live-pill';
    live.textContent = 'AO VIVO';
    live.setAttribute('aria-hidden', 'true');
    body6.appendChild(live);
  }
  const footer6 = document.createElement('div');
  footer6.className = 'ap-card6-footer';
  footer6.appendChild(criarSeletorMonitorAvisoCard6());
  const btnProjCard6 = document.createElement('button');
  btnProjCard6.type = 'button';
  btnProjCard6.className = 'btn sm primary ap-card6-btn-projetar';
  /* Visual: ▶ + «Projetar»; com o aviso no ar, pontinho verde + «Projetando». */
  btnProjCard6.innerHTML = apresentacaoAvisoCard6Ativo
    ? '<span class="ap-card6-dot" aria-hidden="true"></span><span>Projetando</span>'
    : '<svg class="ap-card6-ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor"/></svg><span>Projetar</span>';
  btnProjCard6.title = 'Projeta o aviso no monitor escolhido ao lado (independente das mídias)';
  btnProjCard6.addEventListener('click', (ev) => {
    ev.stopPropagation();
    projetarAvisoCard6();
  });
  const btnEncerrarAviso = document.createElement('button');
  btnEncerrarAviso.type = 'button';
  btnEncerrarAviso.className = 'btn sm danger ap-card6-btn-icone ap-card6-btn-encerrar';
  btnEncerrarAviso.innerHTML =
    '<svg class="ap-card6-ico" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1.2" fill="currentColor"/></svg>';
  btnEncerrarAviso.title = 'Encerrar';
  btnEncerrarAviso.setAttribute('aria-label', 'Encerrar');
  btnEncerrarAviso.disabled = !apresentacaoAvisoCard6Ativo;
  btnEncerrarAviso.addEventListener('click', (ev) => {
    ev.stopPropagation();
    void encerrarAvisoCard6NoControlador();
  });
  const btnLimparTxt = document.createElement('button');
  btnLimparTxt.type = 'button';
  btnLimparTxt.className = 'btn sm ap-card6-btn-limpar';
  /* Ícone (borracha/backspace) + rótulo «Limpar»; em card estreito o rótulo some (CSS) e fica o ícone. */
  btnLimparTxt.innerHTML =
    '<svg class="ap-card6-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h7.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6L1.8 8z"/><path d="M8.5 6l3 4M11.5 6l-3 4"/></svg><span class="ap-card6-btn-rotulo">Limpar</span>';
  btnLimparTxt.title = 'Limpar texto';
  btnLimparTxt.setAttribute('aria-label', 'Limpar texto');
  btnLimparTxt.addEventListener('click', (ev) => {
    ev.stopPropagation();
    apresentacaoCard6Texto = '';
    salvarEstadoModoApresentacaoNoStorage();
    renderGridApresentacao();
  });
  footer6.appendChild(btnProjCard6);
  footer6.appendChild(btnEncerrarAviso);
  footer6.appendChild(btnLimparTxt);
  body6.appendChild(footer6);
  body6.appendChild(ta);
  card6.appendChild(num6);
  card6.appendChild(body6);
  grid.appendChild(card6);

  aplicarClasseSelecaoCardsApresentacaoNoDom();
  atualizarPreviewVideoAoVivo();
}

function adicionarArquivosAoMenu(files) {
  Array.from(files || []).forEach((file) => {
    criarItemApresentacaoDeArquivo(file, (item) => {
      apresentacaoBiblioteca.push(item);
      salvarEstadoModoApresentacaoNoStorage();
      renderMenuApresentacao();
    });
  });
}

function adicionarArquivoDiretoNoCard(file, cardIdx) {
  const idx = Number(cardIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx > 5) return;
  if (idx === 5) return;
  criarItemApresentacaoDeArquivo(file, async (item) => {
    if (item.kind === 'video' && idx !== APRESENTACAO_IDX_CARD5) {
      alert('Vídeos devem ser adicionados no card 5.');
      return;
    }
    if (item.kind !== 'video' && idx === APRESENTACAO_IDX_CARD5) {
      alert('O card 5 aceita apenas vídeos.');
      return;
    }
    if (item.kind === 'video') {
      await garantirVideoSrcHttp(item);
      await garantirThumbnailVideoItem(item);
    }
    apresentacaoCards[idx] = item;
    const ja = apresentacaoBiblioteca.some((x) => x.src === item.src && x.name === item.name);
    if (!ja) apresentacaoBiblioteca.push(item);
    salvarEstadoModoApresentacaoNoStorage();
    renderMenuApresentacao();
    if (apresentacaoMidiaProjetadaId) {
      renderGridApresentacao();
    } else {
      atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: `Arquivo no card ${idx + 1}: ${item.name}` });
    }
  });
}

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
    apresentacaoCardSelecionadoIdx = null;
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
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = null;
    apresentacaoCardSelecionadoIdx = null;
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
      clearTimeout(apresentacaoCardUiClickTimer);
      apresentacaoCardUiClickTimer = null;
      apresentacaoCardSelecionadoIdx = null;
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
function loadCultosManuais() {
  try {
    const raw = localStorage.getItem(LS_CULTOS_MANUAIS);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return ordenarCultosPorData(
      p
        .filter((c) => c && c.id && c.label)
        .map((c) => ({ id: String(c.id), label: String(c.label) }))
    );
  } catch (_) {
    return [];
  }
}

function saveCultosManuais() {
  try {
    localStorage.setItem(LS_CULTOS_MANUAIS, JSON.stringify(cultosManuaisCache || []));
  } catch (_) {
  // intencional — erro ignorado
}
  marcarBancoCompartilhadoAlterado();
}

function idsCultosJaNaLista() {
  const s = new Set();
  gerarCultosDoMes(dataReferenciaCalendarioCultos(new Date())).forEach((c) => s.add(c.id));
  (cultosManuaisCache || []).forEach((c) => s.add(c.id));
  return s;
}

/**
 * Cultos automáticos do mês + manuais desse mesmo mês/ano (sem duplicar id).
 * Cultos extras de outros meses permanecem persistidos, mas não entram na lista.
 */
function listarCultosDisponiveis(dataRef = dataReferenciaCalendarioCultos(new Date())) {
  const ref = dataRef instanceof Date ? dataRef : new Date();
  const auto = gerarCultosDoMes(ref);
  const idsAuto = new Set(auto.map((c) => c.id));
  const manual = (cultosManuaisCache || []).filter(
    (c) => !idsAuto.has(c.id) && cultoIdPertenceAoMes(c.id, ref)
  );
  return ordenarCultosPorData([...auto, ...manual]);
}

function cultoIdEhManual(cid) {
  return (cultosManuaisCache || []).some((c) => c.id === cid);
}

function limparSecoesTemaRecolhidasDoCulto(cid) {
  const m = carregarMapaSecoesTemaPlaylistRecolhidas();
  const pref = `${String(cid)}|||`;
  let mudou = false;
  Object.keys(m).forEach((k) => {
    if (k.startsWith(pref)) {
      delete m[k];
      mudou = true;
    }
  });
  if (mudou) {
    try {
      localStorage.setItem(LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS, JSON.stringify(m));
    } catch (_) {
  // intencional — erro ignorado
}
  }
}

function excluirCultoManualPorId(cid) {
  if (!cid || !cultoIdEhManual(cid)) return;
  cultosManuaisCache = (cultosManuaisCache || []).filter((c) => c.id !== cid);
  saveCultosManuais();
  delete playlists[cid];
  delete temasPorCulto[cid];
  delete temaSelecionadoPorCulto[cid];
  delete aberturaRemovidaPorCulto[cid];
  delete ministrantePadraoPorCulto[cid];
  limparSecoesTemaRecolhidasDoCulto(cid);
  savePlaylists();
  saveTemasPorCulto();
  saveTemaSelecionadoPorCulto();
  saveAberturaRemovidaPorCulto();
  saveMinistrantePadraoPorCulto();
  if (cultoId === cid) {
    cultoId = '';
  }
  initCultoSelect();
  onCultoChange();
}

async function solicitarExcluirCultoManual(ev, cid) {
  ev.preventDefault();
  ev.stopPropagation();
  const item = (cultosManuaisCache || []).find((c) => c.id === cid);
  const ok = await appConfirm(
    `Excluir o culto «${item?.label || cid}» e toda a playlist (temas e músicas)?`,
    'Excluir culto'
  );
  if (!ok) return;
  excluirCultoManualPorId(cid);
}

function adicionarCultosManuaisNaData(dt) {
  const novos = gerarCultosParaDataManual(dt);
  const existentes = idsCultosJaNaLista();
  const aInserir = novos.filter((c) => !existentes.has(c.id));
  if (!aInserir.length) {
    appAlert('Já existe culto para esta data na lista.', 'Adicionar culto');
    return;
  }
  cultosManuaisCache = ordenarCultosPorData([...(cultosManuaisCache || []), ...aInserir]);
  saveCultosManuais();
  let playlistMudou = false;
  aInserir.forEach((c) => {
    garantirAberturaNoCatalogoCulto(c.id);
    if (garantirMarcadorAberturaNaPlaylist(c.id)) playlistMudou = true;
  });
  if (playlistMudou) savePlaylists();
  cultoId = aInserir[0].id;
  initCultoSelect();
  setCultoSelecionadoNaUi(cultoId);
  onCultoChange();
  fecharModalCalendarioCulto();
}

let cultoCalMesRef = new Date();
let cultoCalDiaSelecionado = null;

const CULTO_CAL_MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function renderGradeCalendarioCulto() {
  const tit = document.getElementById('culto-cal-mes-ano');
  const grid = document.getElementById('culto-cal-grid');
  const btnOk = document.getElementById('culto-cal-confirmar');
  if (!tit || !grid) return;
  const y = cultoCalMesRef.getFullYear();
  const m0 = cultoCalMesRef.getMonth();
  tit.textContent = `${CULTO_CAL_MESES_PT[m0]} ${y}`;
  grid.innerHTML = '';
  const first = new Date(y, m0, 1);
  const startPad = first.getDay();
  const lastD = new Date(y, m0 + 1, 0).getDate();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (let i = 0; i < startPad; i++) {
    const cell = document.createElement('span');
    cell.className = 'culto-cal-cell culto-cal-cell--vazio';
    grid.appendChild(cell);
  }
  for (let d = 1; d <= lastD; d++) {
    const dt = new Date(y, m0, d);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'culto-cal-cell';
    cell.textContent = String(d);
    const isoSel =
      cultoCalDiaSelecionado &&
      cultoCalDiaSelecionado.getFullYear() === y &&
      cultoCalDiaSelecionado.getMonth() === m0 &&
      cultoCalDiaSelecionado.getDate() === d;
    if (isoSel) cell.classList.add('culto-cal-cell--sel');
    if (dt.getTime() === hoje.getTime()) cell.classList.add('culto-cal-cell--hoje');
    cell.addEventListener('click', () => {
      cultoCalDiaSelecionado = new Date(y, m0, d);
      renderGradeCalendarioCulto();
    });
    grid.appendChild(cell);
  }
  if (btnOk) btnOk.disabled = !cultoCalDiaSelecionado;
}

function abrirModalCalendarioCulto() {
  const bd = document.getElementById('culto-calendario-backdrop');
  if (!bd) return;
  cultoCalMesRef = new Date();
  cultoCalMesRef.setDate(1);
  cultoCalDiaSelecionado = null;
  renderGradeCalendarioCulto();
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
}

function fecharModalCalendarioCulto() {
  const bd = document.getElementById('culto-calendario-backdrop');
  if (!bd) return;
  bd.hidden = true;
  bd.setAttribute('aria-hidden', 'true');
}

function setupAdicionarCultoManual() {
  document.getElementById('btn-adicionar-culto')?.addEventListener('click', () => abrirModalCalendarioCulto());
  document.getElementById('culto-cal-cancel')?.addEventListener('click', () => fecharModalCalendarioCulto());
  document.getElementById('culto-cal-confirmar')?.addEventListener('click', () => {
    if (!cultoCalDiaSelecionado) return;
    adicionarCultosManuaisNaData(cultoCalDiaSelecionado);
  });
  document.getElementById('culto-cal-prev')?.addEventListener('click', () => {
    cultoCalMesRef = new Date(cultoCalMesRef.getFullYear(), cultoCalMesRef.getMonth() - 1, 1);
    renderGradeCalendarioCulto();
  });
  document.getElementById('culto-cal-next')?.addEventListener('click', () => {
    cultoCalMesRef = new Date(cultoCalMesRef.getFullYear(), cultoCalMesRef.getMonth() + 1, 1);
    renderGradeCalendarioCulto();
  });
  const bd = document.getElementById('culto-calendario-backdrop');
  bd?.addEventListener('click', (e) => {
    if (e.target === bd) fecharModalCalendarioCulto();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bd && !bd.hidden) fecharModalCalendarioCulto();
  });
}

function fecharCultoDropdown() {
  const wrap = document.getElementById('culto-dd');
  const btn = document.getElementById('culto-dd-btn');
  const menu = document.getElementById('culto-dd-menu');
  if (!wrap || !btn || !menu) return;
  wrap.classList.remove('open');
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

/** Seleciona automaticamente o próximo culto com base na data/hora de Brasília. */
function resolverCultoInicialPorAgenda() {
  return resolverProximoCultoPorHorarioBrasilia({ listarCultosDisponiveis });
}

/**
 * Encolhe o texto dos três seletores do topo da playlist até caberem todos inteiros.
 *
 * São o dia do culto, o ministrante e o tema. Partilham uma medida por duas razões: estão
 * empilhados no mesmo cabeçalho e leem-se como uma coisa só — três corpos diferentes ali
 * seriam lidos como três níveis de importância que não existem — e porque o que cada um
 * mostra muda de comprimento a toda a hora, e um corpo por seletor faria a coluna trocar
 * de tipografia a cada escolha.
 *
 * Por isso o laço desce enquanto QUALQUER um deles transbordar e aplica o resultado aos
 * três: quem manda é o mais apertado, que é quase sempre o ministrante — a caixa mais
 * estreita das três e a que tem o texto mais longo («Selecione o ministrante...»).
 *
 * O ponto de partida é o corpo que o CSS lhes dá, e não um número escrito aqui: o valor
 * vive na folha, ao pé do resto do desenho do seletor.
 *
 * `scrollWidth > clientWidth` é o mesmo critério com que o browser decide pôr as
 * reticências — o laço pára exactamente quando elas deixariam de aparecer. Caixa de
 * largura zero é seletor ainda por desenhar ou escondido (o ministrante no modo slides):
 * fica de fora da conta, senão um elemento invisível encolhia os outros dois.
 */
const SELETORES_CULTO_TEXTO_IDS = Object.freeze([
  'culto-dd-desc',
  'culto-ministrante-dd-label',
]);
const SELETOR_CULTO_CORPO_MIN_PX = 11;

function ajustarCorpoSeletoresDoCulto() {
  const els = SELETORES_CULTO_TEXTO_IDS
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!els.length) return;

  els.forEach((el) => { el.style.fontSize = ''; });
  const base = parseFloat(getComputedStyle(els[0]).fontSize);
  if (!Number.isFinite(base)) return;

  const medidos = els.filter((el) => el.clientWidth > 0);
  if (!medidos.length) return;

  const transborda = () => medidos.some((el) => el.scrollWidth > el.clientWidth);
  let px = base;
  while (px > SELETOR_CULTO_CORPO_MIN_PX && transborda()) {
    px -= 0.5;
    els.forEach((el) => { el.style.fontSize = px + 'px'; });
  }
}

function setCultoSelecionadoNaUi(value) {
  const hid = document.getElementById('culto-sel');
  const dataEl = document.getElementById('culto-dd-data');
  const descEl = document.getElementById('culto-dd-desc');
  const menu = document.getElementById('culto-dd-menu');
  if (!hid || !dataEl || !descEl) return;
  const v = String(value || '');
  hid.value = v;
  const item = cultosDoMesCache.find((c) => c.id === v);
  if (!item) {
    dataEl.textContent = '--/--';
    descEl.textContent = 'Selecione o dia do culto...';
  } else {
    const p = parseLabelCulto(item.label);
    dataEl.textContent = p.data;
    descEl.textContent = p.desc;
  }
  ajustarCorpoSeletoresDoCulto();
  if (menu) {
    menu.querySelectorAll('.culto-dd-item').forEach((b) => {
      b.setAttribute('aria-selected', b.dataset.value === v ? 'true' : 'false');
    });
  }
}

function setupCultoDropdown() {
  const wrap = document.getElementById('culto-dd');
  const btn = document.getElementById('culto-dd-btn');
  const menu = document.getElementById('culto-dd-menu');
  if (!wrap || !btn || !menu) return;
  /* A coluna da direita estica e encolhe com a janela: o corpo que cabia numa largura
     pode não caber noutra, e vice-versa — por isso a medida repete-se a cada redimensão. */
  window.addEventListener('resize', ajustarCorpoSeletoresDoCulto);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = menu.hidden;
    fecharOutrosSeletoresDropdown(wrap);
    if (abrir) {
      wrap.classList.add('open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    } else {
      fecharCultoDropdown();
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) fecharCultoDropdown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharCultoDropdown();
  });
}

/** Migra playlists dos ids fixos antigos para o 1.º culto equivalente do mês atual. */
function migrarPlaylistsCultosAntigos() {
  const cultos = gerarCultosDoMes(dataReferenciaCalendarioCultos(new Date()));
  if (!cultos.length) return;
  const primeiro = (pred) => cultos.find(pred);
  const mapLegado = [
    ['quarta', () => primeiro((c) => c.id.endsWith('_quarta'))],
    ['domingo_manha', () => primeiro((c) => c.id.endsWith('_manha'))],
    ['domingo_noite', () => primeiro((c) => c.id.endsWith('_noite'))],
  ];
  let mudou = false;
  mapLegado.forEach(([oldKey, finder]) => {
    const arr = playlists[oldKey];
    if (!Array.isArray(arr) || arr.length === 0) return;
    const target = finder();
    if (!target) return;
    if (!Array.isArray(playlists[target.id])) playlists[target.id] = [];
    const mesclado = [...arr];
    mesclado.forEach((item) => {
      const dup = playlists[target.id].some((x) => Number(x.id) === Number(item.id));
      if (!dup) playlists[target.id].push(item);
    });
    delete playlists[oldKey];
    mudou = true;
  });
  if (mudou) savePlaylists();
}

const mapaCopiasLocais = criarMapaCopiasLocais();

function getCopiasParaMusica(idMusica) {
  return mapaCopiasLocais.getCopiasParaMusica(idMusica);
}

function encontrarCopiaLocal(idMusica, copiaId) {
  return mapaCopiasLocais.encontrar(idMusica, copiaId);
}

function obterRootIdMusicaAtiva() {
  if (!musicaAtiva) return null;
  const r = Number(musicaRootId ?? musicaAtiva.root_id ?? musicaAtiva.id);
  return Number.isFinite(r) ? r : null;
}

function musicaAtivaEhOriginalServidor() {
  if (!musicaAtiva || musicaBancoFonte === 'catalog') return false;
  const root = obterRootIdMusicaAtiva();
  const id = Number(musicaAtiva.id);
  if (!Number.isFinite(root) || !Number.isFinite(id)) return false;
  if (musicaVersaoLocalId && ehVersaoLocalLegada(musicaVersaoLocalId)) return false;
  return id === root && (musicaAtiva.parent_id == null || musicaAtiva.parent_id === '');
}

/** Original protegido no SQLite (`is_immutable === 1`); cópias/versões filhas são editáveis. */
function versaoAtivaParaCompararPlaylist() {
  if (musicaVersaoLocalId && String(musicaVersaoLocalId).trim()) {
    return String(musicaVersaoLocalId).trim();
  }
  if (musicaAtivaEhOriginalServidor()) return '';
  if (musicaAtiva && musicaBancoFonte !== 'catalog') return String(musicaAtiva.id);
  return '';
}

/**
 * Id da cópia editável padrão de uma música do banco do usuário.
 *
 * O ORIGINAL nunca é alterado pela edição: ao abrir uma música o controlador
 * trabalha sobre a cópia que nasceu junto com ela. Músicas cadastradas antes
 * desse comportamento não têm cópia — o servidor materializa uma aqui, na
 * primeira abertura, sem tocar no original.
 *
 * Devolve `null` em qualquer falha: nesse caso a música abre no original, como
 * antes, em vez de o clique não fazer nada.
 *
 * @returns {Promise<number|null>}
 */
async function garantirCopiaPadraoServidor(id) {
  const idNum = Number(id);
  if (!Number.isFinite(idNum)) return null;
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/copia-padrao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const copiaId = Number(data && data.id);
    return Number.isFinite(copiaId) && copiaId !== idNum ? copiaId : null;
  } catch (_) {
    // intencional — sem cópia o fluxo segue no original
    return null;
  }
}

async function carregarVersoesMusicaServidor(rootId) {
  const root = Number(rootId);
  if (!Number.isFinite(root)) {
    versoesMusicaServidorCache = { rootId: null, versoes: [] };
    renderMusicaVersoesBar();
    return;
  }
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${root}/versoes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    versoesMusicaServidorCache = {
      rootId: Number(data.rootId) || root,
      versoes: Array.isArray(data.versoes) ? data.versoes : [],
    };
  } catch (_) {
    versoesMusicaServidorCache = { rootId: root, versoes: [] };
  }
  renderMusicaVersoesBar();
}

function atualizarCopiaLocal(idMusica, copiaId, data) {
  const up = mapaCopiasLocais.atualizarCampos(idMusica, copiaId, data);
  if (!up.ok) return up;
  const c = up.copia;
  const idN = Number(idMusica);
  const vid = String(copiaId);
  if (
    musicaAtiva &&
    Number(musicaAtiva.id) === idN &&
    musicaVersaoLocalId &&
    String(musicaVersaoLocalId) === vid
  ) {
    if (data.titulo != null) musicaAtiva.titulo = c.titulo;
    if (data.artista != null) musicaAtiva.artista = c.artista;
    if (data.estrofes != null) musicaAtiva.estrofes = c.estrofes.map((s) => String(s));
    if (data.rotulo != null) musicaAtiva.rotulo = c.rotulo;
    const et = document.getElementById('edit-titulo');
    const ea = document.getElementById('edit-artista');
    if (et && data.titulo != null) et.value = musicaAtiva.titulo || '';
    if (ea && data.artista != null) ea.value = musicaAtiva.artista || '';
  }
  return { ok: true };
}

function removerCopiaLocal(idMusica, copiaId) {
  return mapaCopiasLocais.remover(idMusica, copiaId);
}

function removerCopiasLocaisDaMusica(idMusica) {
  mapaCopiasLocais.removerTodas(idMusica);
}
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
/** Área do card 4 destacada por clique (0–3) ou `null` — só realce, como nos outros cards. */
let apresentacaoCard4SubSelecionadoIdx = null;

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
/** Volume guardado antes de mutar, para o botão de mudo restaurar ao desmutar. */
let audioVolAntesDeMutar = 1;
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
/** Timeout do avanço automático entre vídeos. */
let _playlistAutoTimer = null;
/** Guarda: reaproveita projetarItemApresentacao sem desativar a playlist. */
let _playlistProjetando = false;
/** Id do item sendo arrastado (reordenar por drag-and-drop). */
let playlistArrastandoId = null;
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
/**
 * Após separar estrofes no evento `input`, o `blur` do textarea antigo ainda tinha o texto com `\n\n`
 * e chamava de novo `aplicarSeparacao…`, duplicando slides — ignoramos esse blur pelo índice.
 */
let ignorarBlurSeparacaoEstrofeIdx = null;
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

function loadPlaylists() {
  try {
    let raw = localStorage.getItem(LS_PLAYLISTS);
    if (!raw && localStorage.getItem(LS_PLAYLISTS_LEGACY)) {
      raw = localStorage.getItem(LS_PLAYLISTS_LEGACY);
      localStorage.setItem(LS_PLAYLISTS, raw);
      localStorage.removeItem(LS_PLAYLISTS_LEGACY);
    }
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === 'object' && p ? p : {};
  } catch (_) { return {}; }
}

function normalizarTemaPlaylist(v) {
  return String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40)
    .toLocaleUpperCase('pt-BR');
}

function normalizarListaTemas(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  arr.forEach((t) => {
    const n = normalizarTemaPlaylist(t);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  });
  return out;
}

/**
 * Remove marcadores do tema e todas as músicas desse bloco (ordem dos marcadores na playlist).
 * O cabeçalho visual segue o marcador anterior; muitas linhas podem ter `tema` vazio ou desactualizado.
 */
function filtrarPlaylistRemovendoTemaComMarcadores(pl, tNorm) {
  const t = normalizarTemaPlaylist(tNorm);
  if (!t || !Array.isArray(pl)) return pl ? pl.slice() : [];
  const out = [];
  const len = pl.length;
  let i = 0;

  if (len && !ehMarcadorTemaPlaylist(pl[0])) {
    let j = 0;
    while (j < len && !ehMarcadorTemaPlaylist(pl[j])) j++;
    const temaPrefixo = normalizarTemaPlaylist(pl[0]?.tema);
    for (let k = 0; k < j; k++) {
      const it = pl[k];
      const ti = normalizarTemaPlaylist(it?.tema);
      if (temaPrefixo === t || ti === t) continue;
      out.push(it);
    }
    i = j;
  }

  let ignorarAteProximoMarcador = false;
  while (i < len) {
    const it = pl[i];
    if (ehMarcadorTemaPlaylist(it)) {
      const mt = normalizarTemaPlaylist(it.tema);
      if (mt === t) {
        ignorarAteProximoMarcador = true;
        i++;
        continue;
      }
      ignorarAteProximoMarcador = false;
      out.push(it);
      i++;
      continue;
    }
    if (ignorarAteProximoMarcador) {
      i++;
      continue;
    }
    if (normalizarTemaPlaylist(it?.tema) === t) {
      i++;
      continue;
    }
    out.push(it);
    i++;
  }
  return out;
}

function chaveArmazenamentoSecaoTemaPlaylist(cid, rotuloCabecalho) {
  const n = normalizarTemaPlaylist(rotuloCabecalho);
  const tag = n ? n : '__SEM_TEMA__';
  return `${String(cid || '')}|||${tag}`;
}

function carregarMapaSecoesTemaPlaylistRecolhidas() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}

function secaoTemaPlaylistRecolhida(cid, rotuloCabecalho) {
  const k = chaveArmazenamentoSecaoTemaPlaylist(cid, rotuloCabecalho);
  return !!carregarMapaSecoesTemaPlaylistRecolhidas()[k];
}

function definirSecaoTemaPlaylistRecolhida(cid, rotuloCabecalho, recolhido) {
  const m = { ...carregarMapaSecoesTemaPlaylistRecolhidas() };
  const k = chaveArmazenamentoSecaoTemaPlaylist(cid, rotuloCabecalho);
  if (recolhido) m[k] = true;
  else delete m[k];
  try {
    localStorage.setItem(LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS, JSON.stringify(m));
  } catch (_) {
  // intencional — erro ignorado
}
}

function atualizarUiExpandSecaoTema(btn, recolhido) {
  if (recolhido) {
    btn.innerHTML = SVG_PLAYLIST_SECAO_EXPANDIR;
    btn.title = 'Expandir músicas deste tema';
    btn.setAttribute('aria-expanded', 'false');
  } else {
    btn.innerHTML = SVG_PLAYLIST_SECAO_RECOLHER;
    btn.title = 'Recolher músicas deste tema';
    btn.setAttribute('aria-expanded', 'true');
  }
}

function playlistPossuiMarcadoresTema(pl) {
  return Array.isArray(pl) && pl.some(ehMarcadorTemaPlaylist);
}

function obterUltimoMarcadorTema(pl) {
  if (!Array.isArray(pl)) return '';
  for (let i = pl.length - 1; i >= 0; i--) {
    if (ehMarcadorTemaPlaylist(pl[i])) return normalizarTemaPlaylist(pl[i].tema);
  }
  return '';
}

/** Lista os temas distintos (por marcador) presentes na playlist, na ordem em que aparecem. */
function listarMarcadoresTemaPlaylist(pl) {
  if (!Array.isArray(pl)) return [];
  const seen = new Set();
  const out = [];
  for (const it of pl) {
    if (!ehMarcadorTemaPlaylist(it)) continue;
    const t = normalizarTemaPlaylist(it.tema);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Insere `item` no fim do bloco do tema escolhido (posição correta na playlist plana),
 * já que os blocos são delimitados por marcadores. Se o tema não for encontrado, faz push.
 * Usa a última ocorrência do marcador, caso haja marcadores repetidos com o mesmo nome.
 */
function inserirMusicaNoBlocoTema(pl, tema, item) {
  if (!Array.isArray(pl)) return;
  const alvo = normalizarTemaPlaylist(tema);
  let markerIdx = -1;
  for (let i = 0; i < pl.length; i++) {
    if (ehMarcadorTemaPlaylist(pl[i]) && normalizarTemaPlaylist(pl[i].tema) === alvo) {
      markerIdx = i;
    }
  }
  if (markerIdx < 0) {
    pl.push(item);
    return;
  }
  let fimBloco = markerIdx + 1;
  while (fimBloco < pl.length && !ehMarcadorTemaPlaylist(pl[fimBloco])) fimBloco++;
  pl.splice(fimBloco, 0, item);
}

function loadTemaSelecionadoPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_TEMA_SEL);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
}

function saveTemaSelecionadoPorCulto() {
  try {
    localStorage.setItem(LS_PLAYLIST_TEMA_SEL, JSON.stringify(temaSelecionadoPorCulto || {}));
  } catch (_) {
  // intencional — erro ignorado
}
}

function migrarTemasParaGlobal() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_TEMAS);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return;
    // Se já tem __global__, não faz nada
    if (Array.isArray(p['__global__']) && p['__global__'].length) return;
    // Junta todos os temas de todos os cultos em __global__
    const todos = [];
    const seen = new Set();
    Object.values(p).forEach((arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((t) => {
        const n = normalizarTemaPlaylist(t);
        if (n && !seen.has(n)) { seen.add(n); todos.push(n); }
      });
    });
    if (!todos.length) return;
    p['__global__'] = ordenarTemasLista(todos);
    localStorage.setItem(LS_PLAYLIST_TEMAS, JSON.stringify(p));
  } catch (_) {
  // intencional — erro ignorado
}
}

function loadTemasPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_TEMAS);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return {};
    const out = {};
    Object.keys(p).forEach((cid) => {
      out[cid] = normalizarListaTemas(p[cid]);
    });
    return out;
  } catch (_) {
    return {};
  }
}

function saveTemasPorCulto() {
  try {
    localStorage.setItem(LS_PLAYLIST_TEMAS, JSON.stringify(temasPorCulto || {}));
  } catch (_) {
  // intencional — erro ignorado
}
  marcarBancoCompartilhadoAlterado();
}

function getTemasDoCultoAtual() {
  if (!Array.isArray(temasPorCulto['__global__'])) temasPorCulto['__global__'] = [];
  temasPorCulto['__global__'] = normalizarListaTemas(temasPorCulto['__global__']);
  return temasPorCulto['__global__'];
}

function garantirTemaNoCatalogoAtual(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t) return;
  const lista = getTemasDoCultoAtual();
  if (lista.includes(t)) return;
  lista.push(t);
  temasPorCulto['__global__'] = normalizarListaTemas(lista);
  saveTemasPorCulto();
}

/** Mantém a ordem do array e coloca ABERTURA sempre em primeiro. */
function ordenarTemasLista(arr) {
  const lista = normalizarListaTemas(arr || []);
  const resto = lista.filter((t) => t !== TEMA_PADRAO_ABERTURA);
  if (lista.includes(TEMA_PADRAO_ABERTURA)) return [TEMA_PADRAO_ABERTURA, ...resto];
  return resto;
}

let aberturaRemovidaPorCulto = {};

/** Ministrante padrão por culto — herdado por músicas novas na playlist. */
let ministrantePadraoPorCulto = {};

/** Há pelo menos uma música (não marcador de tema) na playlist do culto. */
function cultoTemMusicaNaPlaylist(cid) {
  const id = String(cid || '').trim();
  if (!id) return false;
  const pl = playlists[id];
  if (!Array.isArray(pl)) return false;
  return pl.some((it) => it && !ehMarcadorTemaPlaylist(it));
}

/**
 * Mapa só com cultos que têm música — é o que pode sobreviver a reload/sair.
 * Sem música na playlist, a seleção do ministrante é só da sessão actual.
 */
function mapaMinistrantePadraoPersistivel() {
  const src = normalizarMinistrantePadraoPorCulto(ministrantePadraoPorCulto);
  const out = {};
  for (const [cid, mid] of Object.entries(src)) {
    if (cultoTemMusicaNaPlaylist(cid)) out[cid] = mid;
  }
  return out;
}

function loadMinistrantePadraoPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_MINISTRANTE_PADRAO);
    if (!raw) return {};
    return normalizarMinistrantePadraoPorCulto(JSON.parse(raw));
  } catch (_) {
    return {};
  }
}

function persistirMinistrantePadraoNoLocalStorage() {
  try {
    localStorage.setItem(LS_PLAYLIST_MINISTRANTE_PADRAO, JSON.stringify(mapaMinistrantePadraoPersistivel()));
  } catch (_) {
    // intencional — erro ignorado
  }
}

function saveMinistrantePadraoPorCulto() {
  persistirMinistrantePadraoNoLocalStorage();
  marcarBancoCompartilhadoAlterado();
}

function setMinistrantePadraoCulto(cid, ministranteId) {
  const id = String(cid || '').trim();
  if (!id) return;
  const mid = normalizarMinistranteIdPlaylist(ministranteId);
  if (mid) ministrantePadraoPorCulto[id] = mid;
  else delete ministrantePadraoPorCulto[id];
  saveMinistrantePadraoPorCulto();
}

/**
 * No arranque/reload: descarta selecções gravadas de cultos sem músicas.
 * A UI fica limpa; só permanece o que ainda tem playlist com música.
 */
function podarMinistrantePadraoSemMusicasNaPlaylist() {
  let mudou = false;
  for (const cid of Object.keys(ministrantePadraoPorCulto || {})) {
    if (!cultoTemMusicaNaPlaylist(cid)) {
      delete ministrantePadraoPorCulto[cid];
      mudou = true;
    }
  }
  if (mudou) saveMinistrantePadraoPorCulto();
  return mudou;
}

/**
 * Ministrante padrão do culto. Se ainda não estiver gravado, infere quando todas as
 * músicas existentes partilham o mesmo ministrante (playlists já configuradas antes
 * desta funcionalidade).
 */
function getMinistrantePadraoCulto(cid) {
  const id = String(cid || '').trim();
  if (!id) return null;
  const stored = normalizarMinistranteIdPlaylist(ministrantePadraoPorCulto[id]);
  if (stored) return stored;
  const pl = playlists[id];
  if (!Array.isArray(pl)) return null;
  let unico = null;
  for (const it of pl) {
    if (!it || ehMarcadorTemaPlaylist(it)) continue;
    const mid = normalizarMinistranteIdPlaylist(it.ministranteId);
    if (!mid) return null;
    if (unico == null) unico = mid;
    else if (unico !== mid) return null;
  }
  if (unico) {
    ministrantePadraoPorCulto[id] = unico;
    saveMinistrantePadraoPorCulto();
  }
  return unico;
}

/** Ministrante + tom para uma música recém-adicionada à playlist. */
async function camposMinistranteTomParaNovaMusicaNaPlaylist(cid, meta) {
  const fromMeta = normalizarMinistranteIdPlaylist(meta?.ministranteId);
  if (fromMeta) {
    return {
      ministranteId: fromMeta,
      tom: normalizarTomPlaylist(meta?.tom),
    };
  }
  const padrao = getMinistrantePadraoCulto(cid);
  if (!padrao) return { ministranteId: null, tom: '' };
  let tom = '';
  try {
    tom =
      (await buscarTomMemoria(
        getControllerApiBase(),
        padrao,
        Number(meta?.id),
        fonteBancoItemPlaylist(meta),
        meta?.titulo
      )) || '';
  } catch (_) {
    // intencional — memória indisponível; ministrante sem tom
  }
  return { ministranteId: padrao, tom: normalizarTomPlaylist(tom) };
}

function loadAberturaRemovidaPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_ABERTURA_REMOVIDA);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
}

function saveAberturaRemovidaPorCulto() {
  try {
    localStorage.setItem(LS_PLAYLIST_ABERTURA_REMOVIDA, JSON.stringify(aberturaRemovidaPorCulto || {}));
  } catch (_) {
  // intencional — erro ignorado
}
  marcarBancoCompartilhadoAlterado();
}

function cultoUsuarioRemoveuAbertura(cid) {
  return !!aberturaRemovidaPorCulto[String(cid || '')];
}

function marcarAberturaRemovidaPeloUsuario(cid) {
  const id = String(cid || '');
  if (!id) return;
  aberturaRemovidaPorCulto[id] = true;
  saveAberturaRemovidaPorCulto();
}

function desmarcarAberturaRemovidaPeloUsuario(cid) {
  const id = String(cid || '');
  if (!id) return;
  delete aberturaRemovidaPorCulto[id];
  saveAberturaRemovidaPorCulto();
}

function playlistTemMarcadorAbertura(pl) {
  return (pl || []).some(
    (it) => ehMarcadorTemaPlaylist(it) && normalizarTemaPlaylist(it.tema) === TEMA_PADRAO_ABERTURA
  );
}

function playlistParaBlocosComMarcadores(pl) {
  const blocos = [];
  let i = 0;
  if (pl.length && !ehMarcadorTemaPlaylist(pl[0])) {
    let j = 0;
    while (j < pl.length && !ehMarcadorTemaPlaylist(pl[j])) j++;
    blocos.push({
      tema: normalizarTemaPlaylist(pl[0]?.tema) || '',
      itens: pl.slice(0, j),
      markerPlIdx: null,
    });
    i = j;
  }
  while (i < pl.length) {
    if (ehMarcadorTemaPlaylist(pl[i])) {
      const markerPlIdx = i;
      const tema = normalizarTemaPlaylist(pl[i].tema);
      let j = i + 1;
      while (j < pl.length && !ehMarcadorTemaPlaylist(pl[j])) j++;
      blocos.push({ tema, itens: pl.slice(i, j), markerPlIdx });
      i = j;
    } else {
      i++;
    }
  }
  return blocos;
}

function blocosComMarcadoresParaPlaylist(blocos) {
  return blocos.flatMap((b) => b.itens);
}

function garantirAberturaNoCatalogoCulto(cid) {
  garantirTemaNoCatalogoAtual(TEMA_PADRAO_ABERTURA);
  if (!cid) return;
  if (!Array.isArray(temasPorCulto[cid])) temasPorCulto[cid] = [];
  const lista = normalizarListaTemas(temasPorCulto[cid]);
  if (!lista.includes(TEMA_PADRAO_ABERTURA)) {
    temasPorCulto[cid] = [TEMA_PADRAO_ABERTURA, ...lista];
    saveTemasPorCulto();
  } else {
    const ordenada = ordenarTemasLista(lista);
    if (ordenada.join('\u0001') !== lista.join('\u0001')) {
      temasPorCulto[cid] = ordenada;
      saveTemasPorCulto();
    }
  }
}

function garantirMarcadorAberturaNaPlaylist(cid) {
  if (!cid || cultoUsuarioRemoveuAbertura(cid)) return false;
  const pl = getPlaylist(cid);
  if (playlistTemMarcadorAbertura(pl)) return false;
  garantirAberturaNoCatalogoCulto(cid);
  pl.unshift({ tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema: TEMA_PADRAO_ABERTURA });
  playlists[cid] = pl;
  return true;
}

function sincronizarOrdemTemasCatalogoComPlaylist(cid) {
  if (!cid) return;
  const pl = getPlaylist(cid);
  const ordem = [];
  const seen = new Set();
  playlistParaBlocosComMarcadores(pl).forEach((b) => {
    const t = b.tema;
    if (t && !seen.has(t)) {
      seen.add(t);
      ordem.push(t);
    }
  });
  (pl || []).forEach((it) => {
    if (ehMarcadorTemaPlaylist(it)) return;
    const t = normalizarTemaPlaylist(it?.tema);
    if (t && !seen.has(t)) {
      seen.add(t);
      ordem.push(t);
    }
  });
  const extras = (temasPorCulto[cid] || []).filter((t) => t && !seen.has(t));
  temasPorCulto[cid] = ordenarTemasLista(normalizarListaTemas([...ordem, ...extras]));
  saveTemasPorCulto();
}

/**
 * Move o bloco do tema `fromMarkerIdx` para antes ou depois do bloco `toMarkerIdx`.
 *
 * `posicao` é obrigatória para o resultado ser previsível: com um único índice de
 * destino, arrastar para baixo e para cima davam semânticas diferentes (o `splice`
 * de inserção acontece já com os índices deslocados pela remoção). Aqui o destino é
 * calculado na lista original e só depois compensado em -1 quando o bloco removido
 * estava antes dele.
 *
 * @returns {boolean} `true` se a ordem mudou de facto.
 */
function reordenarMarcadoresTemaNaPlaylist(cid, fromMarkerIdx, toMarkerIdx, posicao = 'antes') {
  const from = Number(fromMarkerIdx);
  const to = Number(toMarkerIdx);
  if (!cid || !Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  const pl = getPlaylist(cid);
  const blocos = playlistParaBlocosComMarcadores(pl);
  const fromB = blocos.findIndex((b) => b.markerPlIdx === from);
  const toB = blocos.findIndex((b) => b.markerPlIdx === to);
  if (fromB < 0 || toB < 0 || blocos[fromB].markerPlIdx == null) return false;

  let alvo = posicao === 'depois' ? toB + 1 : toB;
  /* O bloco inicial sem marcador (músicas antes do 1.º tema) tem de continuar em
     primeiro: sem marcador próprio, as suas músicas seriam absorvidas pelo tema acima. */
  if (blocos[0] && blocos[0].markerPlIdx == null && alvo === 0) alvo = 1;
  if (fromB < alvo) alvo -= 1;
  if (alvo === fromB) return false;

  const reord = [...blocos];
  const [bloco] = reord.splice(fromB, 1);
  reord.splice(alvo, 0, bloco);
  playlists[cid] = blocosComMarcadoresParaPlaylist(reord);
  sincronizarOrdemTemasCatalogoComPlaylist(cid);
  savePlaylists();
  return true;
}

function renomearTemaNoCulto(velho, novo) {
  const v = normalizarTemaPlaylist(velho);
  const n = normalizarTemaPlaylist(novo);
  if (!v || !n) return false;
  if (v === n) return true;
  const lista = ordenarTemasLista(getTemasDoCultoAtual());
  if (!lista.includes(v)) return false;
  if (lista.includes(n)) {
    appAlert('Já existe um tema com esse nome.');
    return false;
  }
  temasPorCulto['__global__'] = normalizarListaTemas(lista.map((t) => (t === v ? n : t)));
  saveTemasPorCulto();
  // Atualiza todas as playlists
  Object.keys(playlists).forEach((cid) => {
    const pl = getPlaylist(cid);
    pl.forEach((it) => {
      if (normalizarTemaPlaylist(it.tema) === v) it.tema = n;
    });
  });
  if (getTemaSelecionadoAtual() === v) setTemaSelecionadoAtual(n);
  savePlaylists();
  return true;
}

let compartilharPlaylistEmAndamento = false;

/** Só desabilita/reabilita o botão «C». O feedback de progresso vive no modal
 *  (ver abrirModalCompartilharPlaylist), não mais inline na toolbar S/C/I. */
function atualizarFeedbackCompartilharPlaylist(ativo) {
  const btn = document.getElementById('playlist-compartilhar-btn');
  if (btn) {
    btn.disabled = !!ativo;
    btn.setAttribute('aria-busy', ativo ? 'true' : 'false');
  }
}

/** Abre o modal (reutiliza o app-dialog padrão do app) no estado de carregamento
 *  e devolve o container `.share-modal` para evoluir in-place até o código. */
function abrirModalCompartilharPlaylist() {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel) return null;
  head.textContent = 'Compartilhar Playlist';
  ok.style.display = 'none';
  cancel.style.display = '';
  cancel.textContent = 'Fechar';
  cancel.onclick = () => fecharAppDialog(false);
  body.style.whiteSpace = 'normal';
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'share-modal';
  const loading = document.createElement('div');
  loading.className = 'share-modal-loading';
  const spin = document.createElement('div');
  spin.className = 'share-modal-spinner';
  spin.setAttribute('aria-hidden', 'true');
  const txt = document.createElement('div');
  txt.className = 'share-modal-loading-text';
  txt.textContent = 'Gerando código de compartilhamento...';
  loading.appendChild(spin);
  loading.appendChild(txt);
  wrap.appendChild(loading);
  body.appendChild(wrap);
  ov.hidden = false;
  ov.classList.add('aberto');
  // Clique no escuro não fecha. Escape cancela (limpeza do resolver).
  appDialogEstado.fecharNoBackdrop = true;
  appDialogEstado.compartilharResolver = () => {};
  return wrap;
}

/** Substitui o estado de loading pelo código gerado + botão de copiar (mesmo modal). */
function modalCompartilharMostrarCodigo(wrap, codigo, dataExp) {
  if (!wrap) return;
  wrap.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'share-modal-label';
  label.textContent = 'Código da playlist';
  const row = document.createElement('div');
  row.className = 'share-modal-code-row';
  const code = document.createElement('div');
  code.className = 'share-modal-code';
  code.textContent = String(codigo || '');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn sm share-modal-copy';
  copy.textContent = 'Copiar';
  copy.setAttribute('aria-label', 'Copiar código');
  copy.title = 'Copiar código para a área de transferência';
  copy.onclick = () => copiarCodigoCompartilhar(copy, String(codigo || ''));
  row.appendChild(code);
  row.appendChild(copy);
  wrap.appendChild(label);
  wrap.appendChild(row);
  if (dataExp) {
    const exp = document.createElement('div');
    exp.className = 'share-modal-exp';
    exp.textContent = `Válido até ${dataExp}`;
    wrap.appendChild(exp);
  }
}

/** Substitui o conteúdo do modal por uma mensagem de erro (mesmo modal). */
function modalCompartilharMostrarErro(wrap, msg) {
  if (!wrap) return;
  wrap.innerHTML = '';
  const err = document.createElement('div');
  err.className = 'share-modal-erro';
  err.textContent = String(msg || 'Não foi possível gerar o código de compartilhamento. Tente novamente.');
  wrap.appendChild(err);
}

/** Copia o código pro clipboard com feedback visual («Copiado!») por ~1,6s. */
async function copiarCodigoCompartilhar(btn, codigo) {
  const texto = String(codigo || '').trim();
  if (!texto) return;
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
      ok = true;
    }
  } catch (_) {
    // fallback abaixo
  }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
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
    }, 1600);
  }
}

/**
 * Letra a enviar no código de compartilhamento = exatamente a versão do item na playlist.
 * (`id` = original/root; `versaoLocalId` = cópia escolhida, se houver.)
 * Inclui ministrante (nome) e tom preenchidos na playlist — o destino resolve o cadastro pelo nome.
 */
async function conteudoMusicaParaShare(it) {
  const extrasShare = camposMinistranteTomParaShare(it);
  const vid = versaoLocalIdTrimado(it.versaoLocalId);
  if (vid && ehVersaoLocalLegada(vid)) {
    const c = encontrarCopiaLocal(it.id, vid);
    if (c) {
      return {
        titulo: c.titulo || it.titulo || '',
        artista: c.artista || it.artista || '',
        estrofes: Array.isArray(c.estrofes) ? c.estrofes.map((s) => String(s)) : [],
        // Rótulo de origem da versão escolhida (ex.: 'Cópia'). Só procedência
        // p/ exibição no destino; não recria fork/lineage entre bancos.
        rotulo: String(c.rotulo || it.versaoRotulo || '').trim(),
        ...extrasShare,
      };
    }
  }
  const idFetch = idFetchMusicaPlaylist(it);
  const fonte = fonteBancoItemPlaylist(it);
  const res = await fetch(
    `${getControllerApiBase()}/api/musicas/${encodeURIComponent(idFetch)}?fonte=${fonte}`
  );
  if (!res.ok) throw new Error();
  const m = await res.json();
  return {
    titulo: m.titulo || it.titulo || '',
    artista: m.artista || it.artista || '',
    estrofes: Array.isArray(m.estrofes) ? m.estrofes : [],
    // Rótulo de origem da versão escolhida (ex.: 'Cópia'). Só procedência
    // p/ exibição no destino; não recria fork/lineage entre bancos.
    rotulo: String(m.rotulo || it.versaoRotulo || '').trim(),
    ...extrasShare,
  };
}

/** Nome do ministrante + tom da linha da playlist (só se preenchidos). */
function camposMinistranteTomParaShare(it) {
  const out = {};
  const nome = nomeMinistrantePorId(it?.ministranteId);
  if (nome) out.ministrante = nome;
  const tom = normalizarTomPlaylist(it?.tom);
  if (tom) out.tom = tom;
  return out;
}

/**
 * Resolve ministrante/tom vindos do código C para IDs locais (+ memória de tom).
 * @param {object} m payload da música no share
 * @param {number} musicaId id root/cópia no banco local
 * @param {string} [bancoFonte]
 */
async function aplicarMinistranteTomDoShareNaPlaylistMeta(m, musicaId, bancoFonte) {
  const tom = normalizarTomPlaylist(m?.tom);
  const nome = String(m?.ministrante || m?.ministranteNome || '').trim();
  let ministranteId = null;
  if (nome) {
    try {
      const min = await garantirMinistrantePorNomeNoServidor(getControllerApiBase(), nome);
      if (min) ministranteId = normalizarMinistranteIdPlaylist(min.id);
    } catch (_) {
      // intencional — import segue sem ministrante
    }
  }
  return { ministranteId, tom };
}

async function compartilharPlaylist() {
  if (compartilharPlaylistEmAndamento) return;
  if (!cultoId) return appAlert('Selecione um culto primeiro.', 'Compartilhar Playlist');
  const pl = getPlaylist(cultoId);
  if (!pl.length) return appAlert('A playlist está vazia.', 'Compartilhar Playlist');

  compartilharPlaylistEmAndamento = true;
  atualizarFeedbackCompartilharPlaylist(true);
  // Modal (mesmo app-dialog do restante do app) já abre no estado de carregamento.
  const modalWrap = abrirModalCompartilharPlaylist();
  try {
    try {
      await garantirMinistrantesCarregados();
    } catch (_) {
      // intencional — share segue; sem cache o nome do ministrante pode ficar de fora
    }
    // Coleta estrofes de cada música via API local do controlador (sempre em localhost:3001)
    const musicas = [];
    for (const it of pl) {
      if (it.tipo === PLAYLIST_TIPO_MARCADOR_TEMA) continue;
      try {
        musicas.push(await conteudoMusicaParaShare(it));
      } catch (_) {
        if (it.titulo) {
          musicas.push({
            titulo: it.titulo,
            artista: it.artista || '',
            estrofes: [],
            ...camposMinistranteTomParaShare(it),
          });
        }
      }
    }

    if (!musicas.length) {
      modalCompartilharMostrarErro(modalWrap, 'Nenhuma música encontrada na playlist.');
      return;
    }

    const res = await fetch(`${CLOUD_SHARE_URL}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cultoId, cultoNome: '', musicas }),
    });
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    const { codigo, expiraEm } = await res.json();
    const dataExp = new Date(expiraEm).toLocaleDateString('pt-BR');
    // Mesmo modal evolui de loading → código, sem fechar/reabrir.
    modalCompartilharMostrarCodigo(modalWrap, codigo, dataExp);
  } catch (err) {
    console.error('Falha ao gerar código de compartilhamento da playlist.', err);
    modalCompartilharMostrarErro(
      modalWrap,
      'Não foi possível gerar o código de compartilhamento. Tente novamente.'
    );
  } finally {
    compartilharPlaylistEmAndamento = false;
    atualizarFeedbackCompartilharPlaylist(false);
  }
}

function garantirCultoDisponivelParaImportacaoCodigo(cultoIdCodigo, cultoNomeNuvem) {
  const cid = String(cultoIdCodigo || '').trim();
  if (!cid) return;
  if (idsCultosJaNaLista().has(cid)) return;
  const label = String(cultoNomeNuvem || '').trim() || labelFallbackDeCultoIdImport(cid);
  cultosManuaisCache = ordenarCultosPorData([...(cultosManuaisCache || []), { id: cid, label }]);
  saveCultosManuais();
  garantirAberturaNoCatalogoCulto(cid);
  if (garantirMarcadorAberturaNaPlaylist(cid)) savePlaylists();
}

function ativarCultoNaUiParaImportacaoCodigo(cultoDestino) {
  const cid = String(cultoDestino || '').trim();
  if (!cid) return;
  cultoId = cid;
  initCultoSelect();
  setCultoSelecionadoNaUi(cultoId);
  onCultoChange();
}

let modalImportarTimerAutoFechar = null;
/**
 * Enquanto a importação por código está em andamento (spinner), o modal não pode
 * ser dispensado por clique no escuro nem por Escape — só fecha no fim (sucesso/
 * erro com botões) ou por chamada explícita a `fecharAppDialog` no fluxo.
 */
let appImportarBloqueadoFechar = false;

function liberarBloqueioFecharImportPlaylist() {
  appImportarBloqueadoFechar = false;
  appDialogEstado.fecharNoBackdrop = true;
}

function bloquearFecharImportPlaylistEmAndamento() {
  appImportarBloqueadoFechar = true;
  appDialogEstado.fecharNoBackdrop = false;
}

function importarPlaylist() {
  abrirModalImportarPlaylistInput('');
}

/** Estado 1 — campo de código. Reabre com o valor anterior quando o usuário
 *  escolhe «Tentar de novo» após um erro. Reutiliza o app-dialog padrão do app. */
function abrirModalImportarPlaylistInput(valorInicial = '') {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel) return;
  clearTimeout(modalImportarTimerAutoFechar);
  liberarBloqueioFecharImportPlaylist();
  head.textContent = 'Importar Playlist';
  body.style.whiteSpace = 'normal';
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'share-modal';
  const label = document.createElement('div');
  label.className = 'share-modal-label';
  label.textContent = 'Código da playlist';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 20;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.className = 'share-modal-input';
  input.value = String(valorInicial || '');
  input.placeholder = 'Ex: XKJA-29BM';
  const err = document.createElement('div');
  err.className = 'share-modal-erro';
  err.style.minHeight = '16px';
  err.hidden = true;
  wrap.appendChild(label);
  wrap.appendChild(input);
  wrap.appendChild(err);
  body.appendChild(wrap);

  ok.style.display = '';
  ok.textContent = 'OK';
  cancel.style.display = '';
  cancel.textContent = 'Cancelar';
  const confirmar = () => {
    const codigo = String(input.value || '').trim().toUpperCase();
    if (!codigo) {
      err.hidden = false;
      err.textContent = 'Digite o código gerado pelo Compartilhar (ex: XKJA-29BM).';
      try {
        input.focus();
      } catch (_) {
        // intencional — erro ignorado
      }
      return;
    }
    void executarFluxoImportarPlaylist(codigo, wrap);
  };
  ok.onclick = confirmar;
  cancel.onclick = () => fecharAppDialog(false);
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmar();
    }
  };

  ov.hidden = false;
  ov.classList.add('aberto');
  // Clique no escuro não fecha. Escape cancela (limpeza do resolver), salvo spinner bloqueado.
  appDialogEstado.fecharNoBackdrop = true;
  appDialogEstado.importarResolver = () => {};
  setTimeout(() => {
    try {
      input.focus();
      input.select();
    } catch (_) {
      // intencional — erro ignorado
    }
  }, 50);
}

/** Estado 2 — carregando (mesmo padrão visual do modal do «C»). */
function modalImportarPlaylistLoading(wrap, texto = 'Importando playlist...') {
  bloquearFecharImportPlaylistEmAndamento();
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (ok) ok.style.display = 'none';
  if (cancel) cancel.style.display = 'none';
  if (!wrap) return;
  wrap.innerHTML = '';
  const loading = document.createElement('div');
  loading.className = 'share-modal-loading';
  const spin = document.createElement('div');
  spin.className = 'share-modal-spinner';
  spin.setAttribute('aria-hidden', 'true');
  const t = document.createElement('div');
  t.className = 'share-modal-loading-text';
  t.textContent = String(texto || 'Importando playlist...');
  loading.appendChild(spin);
  loading.appendChild(t);
  wrap.appendChild(loading);
}

/** Estado 3a — erro. Não fecha sozinho: «Tentar de novo» volta ao campo, «Fechar» dispensa. */
function modalImportarPlaylistErro(wrap, msg, codigoAnterior) {
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  clearTimeout(modalImportarTimerAutoFechar);
  liberarBloqueioFecharImportPlaylist();
  if (wrap) {
    wrap.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'share-modal-erro';
    err.textContent = String(msg || 'Não foi possível importar a playlist. Tente novamente.');
    wrap.appendChild(err);
  }
  if (ok) {
    ok.style.display = '';
    ok.textContent = 'Tentar de novo';
    ok.onclick = () => abrirModalImportarPlaylistInput(String(codigoAnterior || ''));
  }
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
}

/** Estado 3b — sucesso. Mostra confirmação + botão «Fechar»; auto-fecha em casos simples. */
function modalImportarPlaylistSucesso(wrap, msg, autoFechar = true) {
  liberarBloqueioFecharImportPlaylist();
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (wrap) {
    wrap.innerHTML = '';
    const s = document.createElement('div');
    s.className = 'share-modal-sucesso';
    s.textContent = String(msg || 'Playlist importada com sucesso.');
    wrap.appendChild(s);
  }
  if (ok) ok.style.display = 'none';
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
  clearTimeout(modalImportarTimerAutoFechar);
  if (autoFechar) {
    modalImportarTimerAutoFechar = setTimeout(() => {
      // Só fecha se ainda for o modal de importação que está aberto.
      if (appDialogEstado.importarResolver) fecharAppDialog(false);
    }, 2600);
  }
}

/* ── Confirmação da importação por código (antes de gravar) ──────────────── */

const NOMES_MES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

let confirmarImportResolver = null;

/** Data de referência do código: o mês do culto que ele traz, senão o mês atual. */
function dataRefDoCultoImportado(cultoIdCodigo) {
  const iso = isoFromCultoId(cultoIdCodigo);
  if (!iso) return new Date();
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

/** Rótulo curto de uma opção do seletor: «09/08 — DOMINGO | MANHÃ». */
function rotuloOpcaoCultoImport(item) {
  const p = parseLabelCulto(item.label);
  return p.desc ? `${p.data} — ${p.desc}` : p.data || String(item.id || '');
}

function fecharJanelaConfirmarImport(resultado) {
  const bd = document.getElementById('confirmar-import-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  const r = confirmarImportResolver;
  confirmarImportResolver = null;
  if (r) r(resultado || { confirmado: false, cultoId: '', cultoLabel: '' });
}

/**
 * Lista as músicas recebidas no código e pede confirmação + culto de destino.
 * Nada é gravado enquanto esta janela estiver aberta.
 *
 * @param {{ musicas: Array<object>, cultoIdCodigo: string, cultoNomeCodigo: string }} ctx
 * @returns {Promise<{ confirmado: boolean, cultoId: string, cultoLabel: string }>}
 */
function abrirJanelaConfirmarImport(ctx) {
  const bd = document.getElementById('confirmar-import-backdrop');
  const lista = document.getElementById('confirmar-import-lista');
  const sel = document.getElementById('confirmar-import-culto');
  if (!bd || !lista || !sel) {
    // Sem a janela no DOM não há como perguntar: segue com o destino do código.
    return Promise.resolve({
      confirmado: true,
      cultoId: String(ctx?.cultoIdCodigo || cultoId || '').trim(),
      cultoLabel: String(ctx?.cultoNomeCodigo || '').trim(),
    });
  }

  const musicas = Array.isArray(ctx?.musicas) ? ctx.musicas : [];
  const cultoIdCodigo = String(ctx?.cultoIdCodigo || '').trim();
  const jaExistem = Array.isArray(ctx?.jaExistem) ? ctx.jaExistem : [];

  lista.innerHTML = '';
  musicas.forEach((m, i) => {
    const linha = document.createElement('div');
    linha.className = 'confirmar-import-item';

    const num = document.createElement('span');
    num.className = 'confirmar-import-item-num';
    num.textContent = String(i + 1);
    linha.appendChild(num);

    const txt = document.createElement('div');
    txt.className = 'confirmar-import-item-txt';

    const nome = document.createElement('div');
    nome.className = 'confirmar-import-item-nome';
    nome.textContent = String(m.titulo || '').trim() || 'Sem título';
    // Rótulo da versão que veio no código (ex.: 'COP. ALAN', 'Cópia').
    const rotulo = String(m.rotulo || '').trim();
    if (rotulo) {
      const tag = document.createElement('span');
      tag.className = 'confirmar-import-item-rotulo';
      tag.textContent = `(${rotulo})`;
      nome.appendChild(tag);
    }
    txt.appendChild(nome);

    const artista = String(m.artista || '').trim();
    if (artista) {
      const art = document.createElement('div');
      art.className = 'confirmar-import-item-artista';
      art.textContent = artista;
      txt.appendChild(art);
    }
    linha.appendChild(txt);

    if (jaExistem[i]) {
      const badge = document.createElement('span');
      badge.className = 'confirmar-import-badge';
      badge.textContent = 'JÁ EXISTE';
      badge.title = 'Você decidirá o que fazer com esta música no passo seguinte.';
      linha.appendChild(badge);
    }

    lista.appendChild(linha);
  });
  lista.scrollTop = 0;

  const total = musicas.length;
  const conflitos = jaExistem.filter(Boolean).length;
  const elTotal = document.getElementById('confirmar-import-total');
  if (elTotal) elTotal.textContent = `${total} música${total === 1 ? '' : 's'} recebida${total === 1 ? '' : 's'}`;
  const elExist = document.getElementById('confirmar-import-existentes');
  if (elExist) {
    elExist.innerHTML = '';
    if (conflitos > 0) {
      const n = document.createElement('strong');
      n.textContent = String(conflitos);
      elExist.appendChild(n);
      elExist.appendChild(
        document.createTextNode(conflitos === 1 ? ' já existe no seu banco' : ' já existem no seu banco')
      );
    }
  }

  // Seletor: cultos do mês de referência + o culto do código, se ainda não existir.
  const dataRef = dataRefDoCultoImportado(cultoIdCodigo);
  const disponiveis = listarCultosDisponiveis(dataRef);
  const jaNaLista = new Set(disponiveis.map((c) => c.id));
  const opcoes = [...disponiveis];
  if (cultoIdCodigo && !jaNaLista.has(cultoIdCodigo)) {
    opcoes.unshift({
      id: cultoIdCodigo,
      label: String(ctx?.cultoNomeCodigo || '').trim() || labelFallbackDeCultoIdImport(cultoIdCodigo),
      novo: true,
    });
  }

  sel.innerHTML = '';
  opcoes.forEach((item) => {
    const op = document.createElement('option');
    op.value = item.id;
    op.textContent = item.novo
      ? `${rotuloOpcaoCultoImport(item)}  ·  novo (do código)`
      : rotuloOpcaoCultoImport(item);
    sel.appendChild(op);
  });

  // Pré-seleção: o culto do código; senão o culto ativo; senão o primeiro.
  const preferido = [cultoIdCodigo, cultoId].find((c) => c && opcoes.some((o) => o.id === c));
  sel.value = preferido || (opcoes[0] ? opcoes[0].id : '');

  const mes = document.getElementById('confirmar-import-mes');
  if (mes) mes.textContent = `${NOMES_MES_PT[dataRef.getMonth()]}/${dataRef.getFullYear()}`;

  const btnSim = document.getElementById('confirmar-import-sim');
  if (btnSim) btnSim.disabled = !opcoes.length;

  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    confirmarImportResolver = resolve;
    const cancelar = () => fecharJanelaConfirmarImport({ confirmado: false, cultoId: '', cultoLabel: '' });
    btnSim.onclick = () => {
      const escolhido = String(sel.value || '').trim();
      if (!escolhido) return;
      const item = opcoes.find((o) => o.id === escolhido);
      fecharJanelaConfirmarImport({
        confirmado: true,
        cultoId: escolhido,
        cultoLabel: item ? String(item.label || '') : '',
      });
    };
    document.getElementById('confirmar-import-nao').onclick = cancelar;
    document.getElementById('confirmar-import-fechar').onclick = cancelar;
  });
}

/**
 * Marca quais músicas recebidas já existem no banco local. Somente leitura —
 * usa a rota de checagem, e não a de importação, que gravaria as inéditas.
 *
 * @returns {Promise<boolean[]>} Um booleano por música, na mesma ordem.
 */
async function checarQuaisMusicasJaExistem(musicas) {
  const vazio = musicas.map(() => false);
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/checar-duplicidade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        musicas: musicas.map((m) => ({ titulo: m.titulo, artista: m.artista || '' })),
      }),
    });
    if (!res.ok) return vazio;
    const data = await res.json().catch(() => ({}));
    const arr = Array.isArray(data.resultados) ? data.resultados : [];
    return musicas.map((_, i) => !!(arr[i] && arr[i].duplicado));
  } catch (_) {
    // Sem a marcação a janela ainda funciona; o conflito aparece adiante.
    return vazio;
  }
}

/** Escape cancela a confirmação da importação. */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && confirmarImportResolver) {
    e.preventDefault();
    fecharJanelaConfirmarImport({ confirmado: false, cultoId: '', cultoLabel: '' });
  }
});

/* ── Janela de conflito da importação por código ─────────────────────────── */

let conflitoImportResolver = null;

/** Cabeçalho + letra de um dos lados da comparação.
 *  `estrofesOutroLado` serve só para realçar os trechos que diferem. */
function renderizarLadoConflitoImport(el, musica, estrofesOutroLado) {
  if (!el) return;
  el.innerHTML = '';
  const titulo = String(musica?.titulo || '').trim() || 'Sem título';
  const artista = String(musica?.artista || '').trim();
  const estrofes = Array.isArray(musica?.estrofes) ? musica.estrofes : [];

  const nome = document.createElement('div');
  nome.className = 'conflito-import-nome';
  nome.textContent = titulo;
  el.appendChild(nome);

  if (artista) {
    const autor = document.createElement('div');
    autor.className = 'conflito-import-autor';
    autor.textContent = `Autor: ${artista}`;
    el.appendChild(autor);
  }

  const meta = document.createElement('div');
  meta.className = 'conflito-import-meta';
  meta.textContent = `${estrofes.length} trecho(s)`;
  el.appendChild(meta);

  if (!estrofes.length) {
    const vazio = document.createElement('div');
    vazio.className = 'conflito-import-vazio';
    vazio.textContent = 'Sem letra.';
    el.appendChild(vazio);
    return;
  }

  const outro = Array.isArray(estrofesOutroLado) ? estrofesOutroLado : null;
  estrofes.forEach((bloco, i) => {
    const pre = document.createElement('pre');
    pre.className = 'conflito-import-estrofe';
    if (outro && String(outro[i] ?? '') !== String(bloco ?? '')) {
      pre.classList.add('conflito-import-estrofe--dif');
    }
    pre.textContent = String(bloco ?? '');
    el.appendChild(pre);
  });
}

function fecharJanelaConflitoImport(resultado) {
  const bd = document.getElementById('conflito-import-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  const r = conflitoImportResolver;
  conflitoImportResolver = null;
  if (r) r(resultado || { acao: 'cancelar', aplicarATodos: false });
}

/**
 * Abre a janela de conflito e resolve com a decisão do usuário.
 *
 * @param {{ atual: object, recebida: object, indice: number, total: number, restantes: number }} ctx
 * @returns {Promise<{ acao: 'substituir'|'manter'|'duplicar'|'cancelar', aplicarATodos: boolean }>}
 */
function abrirJanelaConflitoImport(ctx) {
  const bd = document.getElementById('conflito-import-backdrop');
  const elAtual = document.getElementById('conflito-import-atual');
  const elRecebido = document.getElementById('conflito-import-recebido');
  if (!bd || !elAtual || !elRecebido) {
    // Sem a janela no DOM não há como perguntar: mantém o comportamento antigo.
    return Promise.resolve({ acao: 'duplicar', aplicarATodos: true });
  }

  const atual = ctx?.atual || {};
  const recebida = ctx?.recebida || {};
  renderizarLadoConflitoImport(elAtual, atual, recebida.estrofes);
  renderizarLadoConflitoImport(elRecebido, recebida, atual.estrofes);
  elAtual.scrollTop = 0;
  elRecebido.scrollTop = 0;

  const prog = document.getElementById('conflito-import-progresso');
  if (prog) {
    prog.textContent = ctx?.total > 1 ? `Conflito ${ctx.indice} de ${ctx.total}` : '';
  }

  // «Aplicar aos demais» só faz sentido havendo mais músicas por processar.
  const restantes = Number(ctx?.restantes || 0);
  const todosWrap = document.getElementById('conflito-import-todos-wrap');
  const todos = document.getElementById('conflito-import-todos');
  const todosLabel = document.getElementById('conflito-import-todos-label');
  if (todos) todos.checked = false;
  if (todosWrap) todosWrap.hidden = restantes <= 0;
  if (todosLabel) {
    todosLabel.textContent =
      restantes === 1 ? 'Aplicar à próxima música' : `Aplicar às ${restantes} músicas restantes`;
  }

  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    conflitoImportResolver = resolve;
    const decidir = (acao) =>
      fecharJanelaConflitoImport({ acao, aplicarATodos: !!(todos && todos.checked) });

    document.getElementById('conflito-import-substituir').onclick = () => decidir('substituir');
    document.getElementById('conflito-import-manter').onclick = () => decidir('manter');
    document.getElementById('conflito-import-duplicar').onclick = () => decidir('duplicar');
    document.getElementById('conflito-import-fechar').onclick = () =>
      fecharJanelaConflitoImport({ acao: 'cancelar', aplicarATodos: false });
  });
}

/** Escape fecha a janela de conflito como «cancelar importação». */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && conflitoImportResolver) {
    e.preventDefault();
    fecharJanelaConflitoImport({ acao: 'cancelar', aplicarATodos: false });
  }
});

/** Grava uma música do código no banco, conforme a decisão já tomada (ou sem decisão). */
async function postImportarMusicaDoCodigo(m, decisaoDuplicidade) {
  const res = await fetch(`${getControllerApiBase()}/api/musicas/importar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titulo: m.titulo,
      artista: m.artista || '',
      estrofes: m.estrofes,
      ...(decisaoDuplicidade ? { decisaoDuplicidade } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/** Fluxo completo de importação; evolui o modal in-place (loading → sucesso/erro). */
async function executarFluxoImportarPlaylist(codigoNorm, wrap) {
  modalImportarPlaylistLoading(wrap, 'Importando playlist...');

  let data;
  try {
    const res = await fetch(`${CLOUD_SHARE_URL}/share/${encodeURIComponent(codigoNorm)}`);
    if (res.status === 404) {
      return modalImportarPlaylistErro(wrap, 'Código não encontrado ou expirado.', codigoNorm);
    }
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    data = await res.json();
  } catch (err) {
    return modalImportarPlaylistErro(
      wrap,
      `Não foi possível buscar a playlist: ${err.message || 'Falha de rede'}`,
      codigoNorm
    );
  }

  if (!Array.isArray(data.musicas) || !data.musicas.length) {
    return modalImportarPlaylistErro(wrap, 'Código inválido — sem músicas.', codigoNorm);
  }

  /* Não há guard de Servidor aqui, e não havia razão para o haver: este fluxo lê do
     serviço de partilha na nuvem (`CLOUD_SHARE_URL`) e escreve no banco desta máquina
     (`getControllerApiBase`, :3001). O Servidor de projeção não participa em nenhum dos
     dois lados. Exigir ligação a ele bloqueava a importação no modo local — e também em
     modo remoto antes de conectar — sem nada em troca. */

  const cultoIdCodigo = String(data.cultoId || '').trim();
  const cultoNomeCodigo = String(data.cultoNome || data.cultoLabel || '').trim();

  const elegiveis = data.musicas.filter(
    (m) => m.titulo && Array.isArray(m.estrofes) && m.estrofes.length
  );
  if (!elegiveis.length) {
    return modalImportarPlaylistErro(wrap, 'Código inválido — nenhuma música com letra.', codigoNorm);
  }

  // Confirmação ANTES de qualquer escrita: o usuário vê o que veio no código,
  // quais já existem no banco, e escolhe o culto de destino. Até aqui nada é
  // gravado e o culto ainda não foi criado.
  modalImportarPlaylistLoading(wrap, 'Analisando músicas recebidas...');
  const jaExistem = await checarQuaisMusicasJaExistem(elegiveis);

  modalImportarPlaylistLoading(wrap, 'Aguardando confirmação...');
  const confirmacao = await abrirJanelaConfirmarImport({
    musicas: elegiveis,
    jaExistem,
    cultoIdCodigo,
    cultoNomeCodigo,
  });

  if (!confirmacao.confirmado) {
    fecharAppDialog(false);
    return;
  }

  const cultoDestino = String(confirmacao.cultoId || '').trim();
  if (!cultoDestino) {
    return modalImportarPlaylistErro(wrap, 'Selecione um culto de destino.', codigoNorm);
  }

  modalImportarPlaylistLoading(wrap, 'Importando playlist...');

  // Só agora o culto é criado (se for novo, vindo do código) e ativado na UI.
  if (!idsCultosJaNaLista().has(cultoDestino)) {
    garantirCultoDisponivelParaImportacaoCodigo(
      cultoDestino,
      confirmacao.cultoLabel || cultoNomeCodigo
    );
  }
  ativarCultoNaUiParaImportacaoCodigo(cultoDestino);

  let importadas = 0;
  let copiasImportadas = 0;
  let substituidas = 0;
  let mantidas = 0;
  let cancelada = false;
  // Decisão memorizada por «Aplicar aos demais conflitos» (null = perguntar sempre).
  let decisaoParaTodos = null;

  for (let i = 0; i < elegiveis.length; i++) {
    const m = elegiveis[i];

    try {
      // 1.ª chamada: só detecta. Nada é gravado enquanto houver conflito em aberto.
      let { res: res2, data: nova } = await postImportarMusicaDoCodigo(m, 'perguntar');

      if (res2.status === 409 && nova.duplicado) {
        let decisao = decisaoParaTodos;
        if (!decisao) {
          modalImportarPlaylistLoading(wrap, 'Aguardando decisão sobre o conflito...');
          const escolha = await abrirJanelaConflitoImport({
            atual: nova.existente || {},
            recebida: m,
            indice: i + 1,
            total: elegiveis.length,
            restantes: elegiveis.length - (i + 1),
          });
          decisao = escolha.acao;
          if (escolha.aplicarATodos && decisao !== 'cancelar') decisaoParaTodos = decisao;
          modalImportarPlaylistLoading(wrap, 'Importando playlist...');
        }

        if (decisao === 'cancelar') {
          cancelada = true;
          break;
        }

        if (decisao === 'manter') {
          // Não grava nada: a playlist passa a apontar para a música já existente.
          const idExistente = Number(nova.existente?.id);
          if (Number.isFinite(idExistente) && idExistente > 0) {
            const rootId = Number(nova.existente.rootId || idExistente);
            const mt = await aplicarMinistranteTomDoShareNaPlaylistMeta(m, rootId, 'user');
            await addMusicaNaPlaylistParaCulto(cultoDestino, {
              id: rootId,
              titulo: nova.existente.titulo || m.titulo,
              artista: nova.existente.artista || m.artista || '',
              bancoFonte: 'user',
              ministranteId: mt.ministranteId,
              tom: mt.tom,
            });
            importadas++;
            mantidas++;
          }
          continue;
        }

        // 2.ª chamada: agora sim grava, conforme a decisão do usuário.
        ({ res: res2, data: nova } = await postImportarMusicaDoCodigo(
          m,
          decisao === 'substituir' ? 'substituir' : 'criar'
        ));
      }

      if (!res2.ok) continue;
      const rootId = nova.copyImportada ? Number(nova.rootId) : Number(nova.id);
      // Rótulo de origem enviado no payload (ex.: 'Cópia'). Compat.: se o app
      // de origem não enviou, fica vazio e o item segue sem tag como hoje.
      const rotuloOrigem = String(m.rotulo || '').trim();
      const idParaTom = nova.copyImportada ? Number(nova.id) : rootId;
      const mt = await aplicarMinistranteTomDoShareNaPlaylistMeta(m, idParaTom, 'user');
      await addMusicaNaPlaylistParaCulto(cultoDestino, {
        id: rootId,
        titulo: m.titulo,
        artista: m.artista || '',
        bancoFonte: 'user',
        ministranteId: mt.ministranteId,
        tom: mt.tom,
        ...(nova.copyImportada
          ? { versaoLocalId: String(nova.id), versaoRotulo: 'Cópia/Importada' }
          : rotuloOrigem
            ? { versaoRotulo: rotuloOrigem }
            : {}),
      });
      importadas++;
      if (nova.copyImportada) copiasImportadas++;
      if (nova.substituida) substituidas++;
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  savePlaylists();
  renderSeletorTemasPlaylist();
  try {
    await carregarMinistrantesDoServidor(getControllerApiBase());
  } catch (_) {
    // intencional — selects usam cache; refresh best-effort
  }
  renderPlaylist();
  // `carregarMusicas` não usa IP — o banco é sempre o :3001 desta máquina.
  // Um ReferenceError antigo em `ip` (variável inexistente aqui) impedia o
  // modal de sucesso depois da playlist já ter sido renderizada.
  try {
    await carregarMusicas();
  } catch (_) {
    // intencional — playlist já gravada; só falhou o refresh da lista do banco
  }

  if (!importadas) {
    return modalImportarPlaylistErro(
      wrap,
      cancelada
        ? 'Importação cancelada. Nada foi gravado no banco.'
        : 'Nenhuma música pôde ser importada. Tente novamente.',
      codigoNorm
    );
  }

  const itemCulto = listarCultosDisponiveis(dataRefDoCultoImportado(cultoDestino)).find(
    (c) => c.id === cultoDestino
  );
  const nomeCulto = itemCulto
    ? parseLabelCulto(itemCulto.label).data + ' — ' + parseLabelCulto(itemCulto.label).desc
    : cultoDestino;
  let msg = cancelada
    ? `Importação interrompida.\n${importadas} música(s) já tinham sido adicionada(s) a ${nomeCulto}.`
    : `Playlist importada para ${nomeCulto}!\n${importadas} música(s) adicionada(s) à playlist.`;

  const detalhes = [];
  if (substituidas > 0) detalhes.push(`${substituidas} substituída(s) pela versão recebida`);
  if (mantidas > 0) detalhes.push(`${mantidas} mantida(s) como já estavam no banco`);
  if (copiasImportadas > 0) detalhes.push(`${copiasImportadas} duplicada(s) como nova versão do banco de origem`);
  if (detalhes.length) msg += `\n\nConflitos resolvidos: ${detalhes.join('; ')}.`;

  // Caso simples auto-fecha; havendo conflitos resolvidos, exige fechar manual.
  modalImportarPlaylistSucesso(wrap, msg, detalhes.length === 0 && !cancelada);
}

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

let enviarPlaylistsServidorTimer = null;
let persistirMetaSyncLocalTimer = null;
let persistenciaMetaSyncPendente = {
  incluirPlaylists: false,
  preservarUpdatedAt: false,
};
let sharedBancoLocalUpdatedAt = '';
let pedidoSyncBancoEmAberto = false;

function snapshotMetaCompartilhadaAtual({ incluirPlaylists = true, preservarUpdatedAt = false } = {}) {
  const payload = {
    cultosManuais: Array.isArray(cultosManuaisCache) ? cultosManuaisCache : [],
    temasPorCulto: temasPorCulto && typeof temasPorCulto === 'object' ? temasPorCulto : {},
    aberturaRemovidaPorCulto:
      aberturaRemovidaPorCulto && typeof aberturaRemovidaPorCulto === 'object' ? aberturaRemovidaPorCulto : {},
    ministrantePadraoPorCulto: mapaMinistrantePadraoPersistivel(),
  };
  if (incluirPlaylists) payload.playlists = playlists && typeof playlists === 'object' ? playlists : {};
  if (!preservarUpdatedAt && sharedBancoLocalUpdatedAt) payload.updatedAt = sharedBancoLocalUpdatedAt;
  return payload;
}

async function persistirMetaCompartilhadaLocal({ incluirPlaylists = false, preservarUpdatedAt = false } = {}) {
  try {
    const res = await fetch(`${getControllerApiBase()}/api/sync/banco/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshotMetaCompartilhadaAtual({ incluirPlaylists, preservarUpdatedAt })),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    if (data?.updatedAt) sharedBancoLocalUpdatedAt = String(data.updatedAt);
    return true;
  } catch (_) {
    return false;
  }
}

function enfileirarPersistenciaMetaCompartilhadaLocal({ incluirPlaylists = false, preservarUpdatedAt = false } = {}) {
  persistenciaMetaSyncPendente.incluirPlaylists = persistenciaMetaSyncPendente.incluirPlaylists || incluirPlaylists;
  persistenciaMetaSyncPendente.preservarUpdatedAt =
    persistenciaMetaSyncPendente.preservarUpdatedAt || preservarUpdatedAt;
  clearTimeout(persistirMetaSyncLocalTimer);
  persistirMetaSyncLocalTimer = setTimeout(() => {
    const opts = { ...persistenciaMetaSyncPendente };
    persistenciaMetaSyncPendente = { incluirPlaylists: false, preservarUpdatedAt: false };
    persistirMetaCompartilhadaLocal(opts).catch(() => {});
  }, 220);
}

async function obterSnapshotCompartilhadoLocal() {
  const res = await fetch(`${getControllerApiBase()}/api/sync/banco/local`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function obterSnapshotCompartilhadoServidor(ipAtual = getServidorProjeccaoIp()) {
  const ip = String(ipAtual || '').trim();
  if (!ip) return null;
  const res = await fetch(`http://${ip}:5510/api/sync/banco`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function aplicarSnapshotCompartilhadoNoControladorLocal(snapshot) {
  const res = await fetch(`${getControllerApiBase()}/api/sync/banco/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot || {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.snapshot || null;
}

async function aplicarSnapshotCompartilhadoNoRenderer(snapshot, opts = {}) {
  const src = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : null;
  if (!src) return;

  sharedBancoLocalUpdatedAt = String(src.updatedAt || '').trim();
  playlists = src.playlists && typeof src.playlists === 'object' && !Array.isArray(src.playlists) ? src.playlists : {};
  cultosManuaisCache = Array.isArray(src.cultosManuais) ? src.cultosManuais : [];
  temasPorCulto =
    src.temasPorCulto && typeof src.temasPorCulto === 'object' && !Array.isArray(src.temasPorCulto)
      ? src.temasPorCulto
      : {};
  aberturaRemovidaPorCulto =
    src.aberturaRemovidaPorCulto &&
    typeof src.aberturaRemovidaPorCulto === 'object' &&
    !Array.isArray(src.aberturaRemovidaPorCulto)
      ? src.aberturaRemovidaPorCulto
      : {};
  ministrantePadraoPorCulto = normalizarMinistrantePadraoPorCulto(src.ministrantePadraoPorCulto);
  podarMinistrantePadraoSemMusicasNaPlaylist();

  try { localStorage.setItem(LS_PLAYLISTS, JSON.stringify(playlists)); } catch (_) {
    // intencional — erro ignorado
  }
  try { localStorage.setItem(LS_CULTOS_MANUAIS, JSON.stringify(cultosManuaisCache || [])); } catch (_) {
    // intencional — erro ignorado
  }
  try { localStorage.setItem(LS_PLAYLIST_TEMAS, JSON.stringify(temasPorCulto || {})); } catch (_) {
    // intencional — erro ignorado
  }
  try {
    localStorage.setItem(LS_PLAYLIST_ABERTURA_REMOVIDA, JSON.stringify(aberturaRemovidaPorCulto || {}));
  } catch (_) {
    // intencional — erro ignorado
  }
  try {
    localStorage.setItem(
      LS_PLAYLIST_MINISTRANTE_PADRAO,
      JSON.stringify(mapaMinistrantePadraoPersistivel())
    );
  } catch (_) {
    // intencional — erro ignorado
  }

  try {
    await carregarMusicas();
    refreshListaBanco();
  } catch (_) {
    // intencional — erro ignorado
  }

  try {
    await carregarMinistrantesDoServidor(getControllerApiBase());
  } catch (_) {
    // intencional — erro ignorado
  }

  initCultoSelect();
  renderSeletorTemasPlaylist();
  onCultoChange();
  emitirPlaylistsDoControlador();

  if (opts.forcarRepintura !== false) {
    forcarRepinturaCompositorLyra();
    setTimeout(() => forcarRepinturaCompositorLyra(), 80);
  }
}

function marcarBancoCompartilhadoAlterado(updatedAt = new Date().toISOString(), opts = {}) {
  sharedBancoLocalUpdatedAt = String(updatedAt || '').trim() || new Date().toISOString();
  enfileirarPersistenciaMetaCompartilhadaLocal({ incluirPlaylists: opts.incluirPlaylists === true });
}

async function importarBancoCompartilhadoDoServidor(ipAtual = getServidorProjeccaoIp()) {
  const remoto = await obterSnapshotCompartilhadoServidor(ipAtual);
  if (!remoto || typeof remoto !== 'object') throw new Error('Snapshot do servidor indisponível.');
  const aplicado = await aplicarSnapshotCompartilhadoNoControladorLocal(remoto);
  if (aplicado) await aplicarSnapshotCompartilhadoNoRenderer(aplicado);
  return aplicado || remoto;
}

let modalSincronizarTimerAutoFechar = null;

/** Abre o modal (mesmo app-dialog dos fluxos C/I) no estado de carregamento. */
function abrirModalSincronizarBanco() {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel) return null;
  clearTimeout(modalSincronizarTimerAutoFechar);
  head.textContent = 'Sincronizar banco';
  ok.style.display = 'none';
  cancel.style.display = 'none';
  body.style.whiteSpace = 'normal';
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'share-modal';
  const loading = document.createElement('div');
  loading.className = 'share-modal-loading';
  const spin = document.createElement('div');
  spin.className = 'share-modal-spinner';
  spin.setAttribute('aria-hidden', 'true');
  const txt = document.createElement('div');
  txt.className = 'share-modal-loading-text';
  txt.textContent = 'Sincronizando...';
  loading.appendChild(spin);
  loading.appendChild(txt);
  wrap.appendChild(loading);
  body.appendChild(wrap);
  ov.hidden = false;
  ov.classList.add('aberto');
  // Clique no escuro não fecha. Escape cancela (limpeza do resolver).
  appDialogEstado.fecharNoBackdrop = true;
  appDialogEstado.sincronizarResolver = () => {};
  return wrap;
}

/** Estado de sucesso (verde) — banco enviado e outros PCs notificados. */
function modalSincronizarSucesso(wrap, msg) {
  // Se o usuário já fechou o modal durante o loading, não mexe nos botões compartilhados.
  if (!appDialogEstado.sincronizarResolver) return;
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (wrap) {
    wrap.innerHTML = '';
    const s = document.createElement('div');
    s.className = 'share-modal-sucesso';
    s.textContent = String(msg || 'Banco enviado.');
    wrap.appendChild(s);
  }
  if (ok) ok.style.display = 'none';
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
  clearTimeout(modalSincronizarTimerAutoFechar);
  modalSincronizarTimerAutoFechar = setTimeout(() => {
    if (appDialogEstado.sincronizarResolver) fecharAppDialog(false);
  }, 2600);
}

/** Estado de aviso (amarelo) — não é sucesso; envio sem destinatário/pré-condição. */
function modalSincronizarAviso(wrap, msg) {
  if (!appDialogEstado.sincronizarResolver) return;
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  clearTimeout(modalSincronizarTimerAutoFechar);
  if (wrap) {
    wrap.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'share-modal-aviso';
    const icone = document.createElement('div');
    icone.className = 'share-modal-aviso-icone';
    icone.setAttribute('aria-hidden', 'true');
    icone.textContent = '⚠';
    const t = document.createElement('div');
    t.textContent = String(msg || 'Sincronização sem efeito.');
    box.appendChild(icone);
    box.appendChild(t);
    wrap.appendChild(box);
  }
  if (ok) ok.style.display = 'none';
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
}

/** Estado de erro (vermelho) — falha ao enviar o banco.
 *  `acao` (opcional): `{ label, onClick }` no botão de confirmação. Falhar a falar com o
 *  outro PC é quase sempre endereço errado, e a correção tem de estar à mão de quem está
 *  a olhar para o erro — não escondida atrás de um menu. */
function modalSincronizarErro(wrap, msg, acao) {
  if (!appDialogEstado.sincronizarResolver) return;
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  clearTimeout(modalSincronizarTimerAutoFechar);
  if (wrap) {
    wrap.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'share-modal-erro';
    err.textContent = String(msg || 'Não foi possível enviar o banco.');
    wrap.appendChild(err);
  }
  if (ok) {
    if (acao && typeof acao.onClick === 'function') {
      ok.style.display = '';
      ok.textContent = String(acao.label || 'OK');
      ok.onclick = () => {
        fecharAppDialog(false);
        acao.onClick();
      };
    } else {
      ok.style.display = 'none';
    }
  }
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
}

/**
 * Endereço do outro PC com quem este sincroniza o banco.
 *
 * Guardado à parte do IP do Servidor (`LS_IP_KEY`) porque é outra coisa: aquele é «quem
 * projeta», este é «com quem partilho o repertório». Confundi-los faria a sincronização
 * deixar de existir sempre que se projeta nesta máquina — que é o modo normal.
 */
const LS_SYNC_PC_PARCEIRO = 'lyra_sync_pc_parceiro_ip';

function ipPcParceiroSync() {
  try {
    return String(localStorage.getItem(LS_SYNC_PC_PARCEIRO) || '').trim();
  } catch (_) {
    return '';
  }
}

function guardarIpPcParceiroSync(ip) {
  try {
    localStorage.setItem(LS_SYNC_PC_PARCEIRO, String(ip || '').trim());
  } catch (_) {
    // intencional — erro ignorado
  }
}

/** Aceita IPv4 e nome de máquina; recusa o resto antes de gastar um pedido de rede. */
function ehEnderecoDeRedePlausivel(valor) {
  const v = String(valor || '').trim();
  if (!v || v.length > 60) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    return v.split('.').every((o) => Number(o) >= 0 && Number(o) <= 255);
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(v);
}

/**
 * Endereços desta máquina, para os mostrar a quem vai configurar o outro lado.
 *
 * Sem isto, «qual é o IP deste PC?» manda a pessoa ao `ipconfig` — e o passo mais chato
 * da configuração passa a ser o único que o app não ajuda a resolver.
 */
async function enderecosDestaMaquinaParaMostrar() {
  const ponte = ponteProjecaoLocal();
  if (!ponte?.estado) return [];
  try {
    const st = await ponte.estado();
    const lista = Array.isArray(st?.lanIps) ? st.lanIps : [];
    const preferido = String(st?.lanIp || '').trim();
    const out = preferido ? [preferido] : [];
    for (const ip of lista) {
      const n = String(ip || '').trim();
      if (n && !out.includes(n)) out.push(n);
    }
    return out;
  } catch (_) {
    return [];
  }
}

/** Pergunta o endereço do outro PC (uma vez) e guarda-o. */
async function pedirIpPcParceiroSync() {
  const meus = await enderecosDestaMaquinaParaMostrar();
  const ipLocal = meus.length ? meus.join(' ou ') : '';
  const resposta = await appPrompt('', {
    title: 'Sincronizar Banco de Dados',
    auxText: ipLocal
      ? `O IP deste computador é: ${ipLocal}`
      : 'Não foi possível detectar o IP deste computador.',
    fieldLabel: 'Digite o endereço IP do computador de destino (que receberá o banco):',
    defaultValue: ipPcParceiroSync(),
    emptyMsg: 'Digite um IP como 192.168.0.12, ou o nome do PC.',
    normalizar: (v) => (ehEnderecoDeRedePlausivel(v) ? String(v).trim() : ''),
  });
  if (!resposta) return '';
  guardarIpPcParceiroSync(resposta);
  return resposta;
}

/**
 * Entrega o banco ao outro PC e devolve o que ele disse.
 *
 * `avisado: false` quer dizer que o Controlador do outro lado recebeu o banco mas não
 * tinha painel aberto para perguntar a ninguém — o pedido fica lá, sem resposta. Não é
 * erro, mas também não é sucesso, e vale a pena dizê-lo.
 */
async function enviarBancoParaPcParceiro(ip, snapshot) {
  const r = await fetch(`http://${ip}:3001/api/sync/banco/pedido`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origem: (typeof window !== 'undefined' && window.lyraElectron?.nomeDestePc?.()) || '',
      snapshot: snapshot || {},
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.erro || `HTTP ${r.status}`);
  return data;
}

/**
 * Botão «S»: manda o banco desta máquina para o outro PC.
 *
 * Directo, sem Servidor no meio. O Servidor servia de depósito e de carteiro, e nenhuma
 * das duas funções precisava dele: cada Controlador já expõe a sua API na 3001 e já sabe
 * montar e aplicar um snapshot. Tirá-lo do caminho é o que faz isto funcionar também
 * quando se projeta nesta máquina — que é o modo normal de arranque.
 */
async function solicitarSincronizacaoManualBanco() {
  let ip = ipPcParceiroSync();
  /* Perguntado ANTES de abrir o modal: os dois usam o mesmo `app-dialog`, e abri-los em
     cima um do outro deixava o diálogo do IP a herdar os botões do modal de progresso. */
  if (!ip) {
    ip = await pedirIpPcParceiroSync();
    if (!ip) return;
  }

  const wrap = abrirModalSincronizarBanco();
  try {
    sharedBancoLocalUpdatedAt = new Date().toISOString();
    await persistirMetaCompartilhadaLocal({ incluirPlaylists: true, preservarUpdatedAt: false });
    const local = await obterSnapshotCompartilhadoLocal();
    const resposta = await enviarBancoParaPcParceiro(ip, local);
    if (resposta?.avisado === false) {
      modalSincronizarAviso(
        wrap,
        `O Lyra do PC ${ip} recebeu o banco, mas não tem o painel aberto para aceitar. ` +
          'Abra o Controlador nesse PC e envie de novo.'
      );
      return;
    }
    modalSincronizarSucesso(wrap, `Banco enviado ao PC ${ip}. Falta aceitar por lá.`);
  } catch (e) {
    modalSincronizarErro(
      wrap,
      `Não foi possível falar com o PC ${ip} na porta 3001.\n\n` +
        'Confira se o Lyra está aberto nesse PC, se o endereço está certo e se o firewall ' +
        'do Windows liberou o Lyra Controlador.\n\n' +
        String(e?.message || e),
      { label: 'Alterar endereço', onClick: () => void trocarPcParceiroSync() }
    );
  }
}

/** Esquece o PC parceiro, para o próximo «S» voltar a perguntar. */
async function trocarPcParceiroSync() {
  guardarIpPcParceiroSync('');
  await solicitarSincronizacaoManualBanco();
}

/**
 * Chegou banco do outro PC: pergunta, e só depois escreve.
 *
 * O snapshot não passou por aqui — ficou no processo principal desde que chegou pela
 * rede. O painel só diz sim ou não; quem aplica é a rota `/pedido/aceitar`, que é de
 * loopback justamente para que esta decisão não possa vir de fora.
 */
async function tratarPedidoSyncBancoDirecto(payload) {
  if (pedidoSyncBancoEmAberto) return;
  pedidoSyncBancoEmAberto = true;
  try {
    const origem = String(payload?.origem || '').trim() || 'outro PC';
    const escolha = await appEscolherOpcao(
      'Sincronizar banco',
      [{ label: 'Aceitar', value: 'aceitar' }],
      `${origem} deseja enviar o banco de dados para este PC. Aceitar?`,
      { cancelLabel: 'Recusar' }
    );
    if (escolha !== 'aceitar') {
      await fetch(`${getControllerApiBase()}/api/sync/banco/pedido/recusar`, { method: 'POST' }).catch(
        () => {}
      );
      return;
    }
    const r = await fetch(`${getControllerApiBase()}/api/sync/banco/pedido/aceitar`, { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.erro || `HTTP ${r.status}`);
    if (data.saved === false) {
      await appAlert(
        'O banco recebido é mais antigo do que o deste PC — nada foi alterado.',
        'Sincronizar banco'
      );
      return;
    }
    await aplicarSnapshotCompartilhadoNoRenderer(data.snapshot || null);
    await appAlert('Banco sincronizado.', 'Sincronizar banco');
  } catch (e) {
    await appAlert(e?.message || 'Não foi possível aplicar o banco recebido.', 'Sincronizar banco');
  } finally {
    pedidoSyncBancoEmAberto = false;
  }
}

/**
 * Pedido que chegou com o painel fechado (ou a recarregar): ao abrir, pergunta-se por ele.
 *
 * Sem isto, quem enviou o banco enquanto o outro PC arrancava via «recebido» e nunca mais
 * ninguém era perguntado — o pedido morria de pé no processo principal.
 */
async function recuperarPedidoSyncBancoPendente() {
  try {
    const r = await fetch(`${getControllerApiBase()}/api/sync/banco/pedido`);
    if (!r.ok) return;
    const data = await r.json().catch(() => ({}));
    if (data?.pedido) await tratarPedidoSyncBancoDirecto(data.pedido);
  } catch (_) {
    // intencional — erro ignorado
  }
}

/**
 * Pedido vindo pelo Servidor, no arranjo antigo em que ele era o carteiro.
 *
 * Mantido para quem tem os dois Controladores ligados a um Servidor: nesse caso o snapshot
 * está no Servidor, não aqui, e vai buscar-se lá.
 */
async function tratarPedidoSincronizacaoBanco(payload) {
  if (pedidoSyncBancoEmAberto) return;
  pedidoSyncBancoEmAberto = true;
  try {
    const origem = String(payload?.origem || 'desconhecido').trim() || 'desconhecido';
    const escolha = await appEscolherOpcao(
      'Sincronizar banco',
      [{ label: 'Aceitar', value: 'aceitar' }],
      `PC ${origem} deseja sincronizar o banco de dados. Aceitar?`,
      { cancelLabel: 'Recusar' }
    );
    if (escolha !== 'aceitar') return;
    await importarBancoCompartilhadoDoServidor(getServidorProjeccaoIp());
  } catch (e) {
    await appAlert(e?.message || 'Não foi possível importar o banco do servidor.', 'Sincronizar banco');
  } finally {
    pedidoSyncBancoEmAberto = false;
  }
}

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
  clearTimeout(enviarPlaylistsServidorTimer);
  enviarPlaylistsServidorTimer = setTimeout(() => enviarPlaylistsParaServidor(), 450);
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

/* ── Músicas já transmitidas da playlist (check verde ao lado do número) ──
   Uma música ganha o check quando o operador passa para OUTRA música (ver `atualizarChecksAoProjetar`).
   Guardado por culto no localStorage, para sobreviver a recarregar o painel. */
const LS_PLAYLIST_TRANSMITIDAS = 'lyra_playlist_transmitidas_v1';
let playlistTransmitidas = null;

function carregarPlaylistTransmitidas() {
  if (playlistTransmitidas) return playlistTransmitidas;
  playlistTransmitidas = new Set();
  try {
    const arr = JSON.parse(localStorage.getItem(LS_PLAYLIST_TRANSMITIDAS) || '[]');
    if (Array.isArray(arr)) arr.forEach((k) => playlistTransmitidas.add(String(k)));
  } catch (_) {
    // intencional — sem localStorage a marcação vale só nesta sessão
  }
  return playlistTransmitidas;
}

function chaveTransmitidaPlaylist(it) {
  return `${cultoId}|${Number(it?.id)}|${it?.versaoLocalId ?? ''}|${it?.bancoFonte ?? ''}`;
}

function playlistItemFoiTransmitido(it) {
  return !!it && !ehMarcadorTemaPlaylist(it) && carregarPlaylistTransmitidas().has(chaveTransmitidaPlaylist(it));
}

function salvarPlaylistTransmitidas() {
  try {
    localStorage.setItem(LS_PLAYLIST_TRANSMITIDAS, JSON.stringify([...carregarPlaylistTransmitidas()]));
  } catch (_) {
    // intencional — erro ignorado
  }
}

/**
 * Tira as marcações de músicas que já não estão na playlist deste culto. É o que impede
 * uma música excluída e adicionada de novo de herdar o check de antes.
 */
function podarTransmitidasDoCultoAtual(pl) {
  if (!cultoId) return;
  const set = carregarPlaylistTransmitidas();
  const prefixo = `${cultoId}|`;
  const validas = new Set((Array.isArray(pl) ? pl : []).filter((it) => it && !ehMarcadorTemaPlaylist(it)).map(chaveTransmitidaPlaylist));
  let mudou = false;
  for (const k of [...set]) {
    if (k.startsWith(prefixo) && !validas.has(k)) {
      set.delete(k);
      mudou = true;
    }
  }
  if (mudou) salvarPlaylistTransmitidas();
}

/** «Resetar» do modo Slides: apaga os checks de todas as músicas da playlist deste culto. */
function limparChecksTransmitidosDoCulto() {
  if (!cultoId) return;
  const set = carregarPlaylistTransmitidas();
  const prefixo = `${cultoId}|`;
  let mudou = false;
  for (const k of [...set]) {
    if (k.startsWith(prefixo)) {
      set.delete(k);
      mudou = true;
    }
  }
  if (!mudou) return;
  salvarPlaylistTransmitidas();
  renderPlaylist();
}

const LS_PLAYLIST_ULTIMA_PROJETADA = 'lyra_playlist_ultima_projetada_v1';
let ultimaChaveProjetada = null;

/**
 * O check de uma música só acende quando o operador PASSA para outra: ao projetar a 2, a 1
 * ganha o check (ela terminou); a 2 só ganha o seu quando a 3 for projetada, e assim por
 * diante. Chamado a cada envio de slide às telas.
 */
function atualizarChecksAoProjetar() {
  if (!musicaAtiva || !cultoId) return;
  const item = getPlaylist(cultoId).find((it) => playlistItemMesmaVersaoQueAtiva(it));
  if (!item) return;
  const atual = chaveTransmitidaPlaylist(item);
  const musicas = getPlaylist(cultoId).filter((it) => it && !ehMarcadorTemaPlaylist(it));
  const ehPrimeira = musicas.length > 0 && chaveTransmitidaPlaylist(musicas[0]) === atual;
  if (ultimaChaveProjetada == null) {
    try {
      ultimaChaveProjetada = localStorage.getItem(LS_PLAYLIST_ULTIMA_PROJETADA) || null;
    } catch (_) {
      // intencional — sem localStorage vale só nesta sessão
    }
  }
  const anterior = ultimaChaveProjetada;
  let mudou = false;
  if (ehPrimeira) {
    /* Projetar a música 1 começa uma passagem nova: os checks de ensaios anteriores somem,
       para o culto de verdade começar limpo. */
    const set = carregarPlaylistTransmitidas();
    for (const k of [...set]) {
      if (k.startsWith(`${cultoId}|`)) {
        set.delete(k);
        mudou = true;
      }
    }
    if (mudou) salvarPlaylistTransmitidas();
  } else if (anterior && anterior !== atual && anterior.startsWith(`${cultoId}|`)) {
    const set = carregarPlaylistTransmitidas();
    if (!set.has(anterior)) {
      set.add(anterior);
      salvarPlaylistTransmitidas();
      mudou = true;
    }
  }
  ultimaChaveProjetada = atual;
  try {
    localStorage.setItem(LS_PLAYLIST_ULTIMA_PROJETADA, atual);
  } catch (_) {
    // intencional — erro ignorado
  }
  if (mudou) renderPlaylist();
}

/**
 * A última música da playlist não tem «próxima» que a faça passar: o check dela acende
 * quando a projeção é encerrada (Encerrar/Esc/limpar tela) estando ela no ar.
 */
function marcarUltimaMusicaAoEncerrar() {
  if (!musicaAtiva || !cultoId || !projecaoMusicaEmitidaNoServidor) return;
  const musicas = getPlaylist(cultoId).filter((it) => it && !ehMarcadorTemaPlaylist(it));
  const ultima = musicas[musicas.length - 1];
  if (!ultima || !playlistItemMesmaVersaoQueAtiva(ultima)) return;
  const set = carregarPlaylistTransmitidas();
  const k = chaveTransmitidaPlaylist(ultima);
  if (set.has(k)) return;
  set.add(k);
  salvarPlaylistTransmitidas();
  renderPlaylist();
}

/** Há música seguinte após a actualmente activa (para o botão «Próxima música»). */
function haProximaMusicaNaPlaylistAtiva() {
  if (!musicaAtiva) return false;
  const pl = getPlaylist(cultoId);
  const ix = pl.findIndex((it) => playlistItemMesmaVersaoQueAtiva(it));
  if (ix < 0) return false;
  return indiceProximaMusicaNaPlaylist(pl, ix) >= 0;
}

function atualizarEstadoBtnProximaMusicaPlaylist() {
  const btnNx = document.getElementById('btn-proxima-musica-playlist');
  if (!btnNx) return;
  btnNx.disabled = !projecao.pronta() || !haProximaMusicaNaPlaylistAtiva();
}

/**
 * `musicaAtiva` sobrevive à saída do modo slides (a Home mantém a música no editor),
 * mas a faixa de slides é rearmada do zero ao reentrar. Sem esta distinção, a linha
 * ficava destacada com a grade vazia e o primeiro clique caía no ramo «desmarcar»,
 * exigindo um segundo clique para os slides voltarem.
 *
 * No modo slides, só há seleção enquanto a faixa está de facto preenchida.
 */
function playlistSelecaoVisivelNoModoAtual() {
  if (!musicaAtiva) return false;
  if (!ehModoSlidesOperador()) return true;
  return faixaSlidesHabilitadaPorPlaylistNoModoSlides;
}

/**
 * Destaque da linha na Playlist — independente da Biblioteca e do que está no centro.
 */
function playlistItemDestacadoNaUi(it) {
  return playlistItemMesmaVersaoQueSelecaoUi(it);
}

/**
 * Clique na linha já carregada no centro e já marcada nesta coluna: segundo clique desmarca.
 * Só desmarca se a seleção visual da Playlist for desta linha — senão um clique
 * na Playlist após abrir a mesma música pela Biblioteca apagaria o centro.
 * Para lógica funcional (próxima música, deduplicação) usar
 * `playlistItemMesmaVersaoQueAtiva`, que ignora o estado da faixa.
 */
function playlistItemSelecionadoNaUi(it) {
  return (
    playlistSelecaoVisivelNoModoAtual() &&
    playlistItemMesmaVersaoQueAtiva(it) &&
    playlistItemMesmaVersaoQueSelecaoUi(it)
  );
}

/** Segundo clique na mesma linha da playlist: desmarca (como ESC no modo slides). */
function deselecionarMusicaAtivaAPartirDaPlaylist() {
  if (ehModoSlidesOperador()) slidesRailUserRecolhido = true;
  encerrarProjecaoDoControlador({ limparMusica: true });
}

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

/**
 * Limpa ministrante e tom de TODAS as músicas desta playlist (não remove músicas).
 *
 * É o «Resetar» do menu de cada linha. Era o botão que aparecia no hover da Música 1 e
 * mudou de lugar com a passagem para o menu — o que faz é exactamente o mesmo, e de
 * propósito: repor é uma operação sobre o culto inteiro (o ministrante é um só para todas
 * as músicas), e não sobre a linha de onde o menu foi aberto.
 *
 * Zerar o ministrante padrão do culto faz parte do gesto: sem isso, o seletor do topo
 * continuaria a mostrar uma pessoa cujos tons acabaram de ser apagados da lista.
 */
function limparMinistranteTomDeTodaPlaylist() {
  if (!cultoId) return;
  const pl = getPlaylist(cultoId);
  if (!Array.isArray(pl) || !pl.length) return;
  let mudou = false;
  for (const it of pl) {
    if (!it || ehMarcadorTemaPlaylist(it)) continue;
    if (it.ministranteId != null || it.tom) {
      it.ministranteId = null;
      it.tom = '';
      mudou = true;
    }
  }
  if (!mudou) return;
  setMinistrantePadraoCulto(cultoId, null);
  savePlaylists();
  renderPlaylist();
  refrescarAberturaM3SeMusicaAtivaNaPlaylist();
}

function nomeMinistrantePorId(id) {
  const n = Number(id);
  const m = obterCacheMinistrantes().find((x) => Number(x.id) === n);
  return m ? String(m.nome || '').trim() : '';
}

/**
 * Aplica o ministrante do culto a todas as músicas e repõe os tons a partir do cadastro
 * dele (a memória ministrante+música do banco, que esta função só lê).
 *
 * O tom passa a refletir estritamente o ministrante escolhido: onde ele tem tom cadastrado,
 * fica esse; onde não tem, a linha fica vazia em vez de herdar o tom de outra pessoa. O
 * operador continua livre para escrever o tom que quiser na linha depois disto.
 *
 * Uma falha de rede na consulta não apaga nada: sem resposta do banco, o tom que já estava
 * na linha fica onde está.
 */
async function aplicarMinistranteETonsEmTodasMusicas(pl, ministranteId) {
  const api = getControllerApiBase();
  const mid = normalizarMinistranteIdPlaylist(ministranteId);
  if (!mid || !Array.isArray(pl)) return;
  for (const it of pl) {
    if (!it || ehMarcadorTemaPlaylist(it)) continue;
    it.ministranteId = mid;
    try {
      const tomMem = await buscarTomMemoria(
        api,
        mid,
        Number(it.id),
        fonteBancoItemPlaylist(it),
        it.titulo
      );
      it.tom = normalizarTomPlaylist(tomMem);
    } catch (_) {
      // intencional — banco indisponível: mantém o tom que já estava na linha
    }
  }
}

/** Zera ministrante e tom de todas as músicas do culto (escolha vazia no seletor). */
function limparMinistranteETonsDeTodasMusicas(pl) {
  if (!Array.isArray(pl)) return;
  for (const it of pl) {
    if (!it || ehMarcadorTemaPlaylist(it)) continue;
    it.ministranteId = null;
    it.tom = '';
  }
}

/**
 * Repõe as opções e a seleção do seletor único de ministrante do culto.
 *
 * A lista de pessoas vem do cache do cadastro; o valor escolhido vem de
 * `getMinistrantePadraoCulto`, que também infere o ministrante de playlists montadas
 * antes de existir um seletor único (todas as músicas com a mesma pessoa).
 */
function renderSeletorMinistranteCulto() {
  const wrap = document.getElementById('culto-ministrante-dd');
  const btn = document.getElementById('culto-ministrante-dd-btn');
  if (!wrap || !btn) return;
  const atual = cultoId ? getMinistrantePadraoCulto(cultoId) : null;
  const items = [{ value: '', label: 'Selecione o ministrante...' }];
  for (const m of obterCacheMinistrantes()) {
    const id = Number(m.id);
    if (!Number.isFinite(id)) continue;
    items.push({
      value: String(id),
      label: String(m.nome || '').toLocaleUpperCase('pt-BR'),
    });
  }
  renderItensLyraSelectDropdown(wrap, items, {
    valorAtual: atual != null ? String(atual) : '',
    placeholder: 'Selecione o ministrante...',
    aoSelecionar: (v) => {
      onMinistranteCultoChange(v).catch(() => {});
    },
  });
  btn.disabled = !cultoId;
}

/**
 * Troca do ministrante do culto — sem confirmação: é uma escolha por culto, não por música,
 * e o operador vê o efeito na hora nos tons da lista.
 */
async function onMinistranteCultoChange(valorSelect) {
  if (!cultoId) return;
  const btn = document.getElementById('culto-ministrante-dd-btn');
  const novoId = normalizarMinistranteIdPlaylist(valorSelect);
  const pl = getPlaylist(cultoId);
  setMinistrantePadraoCulto(cultoId, novoId);
  if (btn) btn.disabled = true;
  try {
    if (novoId) await aplicarMinistranteETonsEmTodasMusicas(pl, novoId);
    else limparMinistranteETonsDeTodasMusicas(pl);
  } finally {
    if (btn) btn.disabled = !cultoId;
  }
  savePlaylists();
  renderPlaylist();
  refrescarAberturaM3SeMusicaAtivaNaPlaylist();
}

function configurarSeletorMinistranteCulto() {
  const wrap = document.getElementById('culto-ministrante-dd');
  if (wrap) setupLyraSelectDropdownWrap(wrap);
}

function onPlaylistTomChange(idxPl, valorSelect) {
  if (!cultoId) return;
  const pl = getPlaylist(cultoId);
  const item = pl[idxPl];
  if (!item || ehMarcadorTemaPlaylist(item)) return;
  const tom = normalizarTomPlaylist(valorSelect);
  item.tom = tom;
  savePlaylists();
  if (playlistItemMesmaVersaoQueAtiva(item)) {
    refrescarAberturaM3SeMusicaAtivaNaPlaylist();
  }
}

/** Atualiza título (+ tom) do 1.º slide no preview/M3 quando a playlist muda. */
function refrescarAberturaM3SeMusicaAtivaNaPlaylist() {
  atualizarPreviewOperador();
  emitirEstadoMinistranteAoServidor();
  if (projecaoMusicaEmitidaNoServidor && projecao.pronta() && musicaAtiva && estrofeAtiva === 0) {
    emitirEstrofeAoServidor(0);
  }
}

/**
 * Tema do bloco onde a linha `idx` está — o do cabeçalho acima dela, não o `item.tema`.
 *
 * Os dois divergem: com marcadores, o cabeçalho manda, e `item.tema` de linhas antigas
 * pode estar vazio ou desactualizado. Quem quer saber «em que tema esta música está»
 * quer o que a lista mostra.
 *
 * Dar-lhe o índice de um cabeçalho devolve o tema do bloco ACIMA dele — andar para trás a
 * partir de um marcador encontra o marcador anterior. É assim que se pergunta «para que
 * tema é que esta seta me leva».
 */
function temaDoBlocoNaPlaylist(pl, idx) {
  if (!Array.isArray(pl) || !pl[idx]) return '';
  if (playlistPossuiMarcadoresTema(pl)) {
    for (let i = idx - 1; i >= 0; i--) {
      if (ehMarcadorTemaPlaylist(pl[i])) return normalizarTemaPlaylist(pl[i].tema) || '';
    }
    /* Antes do primeiro marcador não há cabeçalho de marcador: o render tira o rótulo do
       `tema` da primeira linha, e aqui segue-se a mesma regra para os dois concordarem. */
    return normalizarTemaPlaylist(pl[0]?.tema) || '';
  }
  return normalizarTemaPlaylist(pl[idx]?.tema) || '';
}

/**
 * HTML da linha da playlist: Home com o tom; Slide compacto como antes.
 * O ministrante é do culto inteiro e vive no seletor único acima da lista.
 */
function htmlLinhaPlaylistModoAtual(item, songNum, rotuloVersao) {
  if (ehModoSlidesOperador()) {
    return htmlCorpoLinhaPlaylistSimples(item, songNum, rotuloVersao, escapeHtml);
  }
  return htmlCorpoLinhaPlaylistComTom(item, songNum, rotuloVersao, escapeHtml);
}

async function garantirMinistrantesCarregados() {
  try {
    await carregarMinistrantesDoServidor(getControllerApiBase());
    renderPlaylist();
  } catch (_) {
    // intencional — API ainda a subir; dropdowns ficam só com «—»
  }
}

async function renderListaCfgMinistrantes() {
  const el = document.getElementById('cfg-ministrantes-lista');
  if (!el) return;
  try {
    await carregarMinistrantesDoServidor(getControllerApiBase());
  } catch (e) {
    el.innerHTML = `<div class="placeholder-msg">${escapeHtml(e.message || 'Falha ao carregar.')}</div>`;
    return;
  }
  const lista = obterCacheMinistrantes();
  if (!lista.length) {
    el.innerHTML = '<div class="placeholder-msg">Nenhum ministrante cadastrado ainda.</div>';
    return;
  }
  el.innerHTML = '';
  for (const m of lista) {
    const row = document.createElement('div');
    row.className = 'cfg-ministrante-row';
    row.innerHTML = `
      <span class="cfg-ministrante-nome">${escapeHtml(m.nome)}</span>
      <button type="button" class="btn sm" data-acao="edit" title="Renomear">✎</button>
      <button type="button" class="btn sm danger" data-acao="del" title="Excluir">✕</button>
    `;
    row.querySelector('[data-acao="edit"]').onclick = () => onCfgMinistranteRenomear(m.id, m.nome);
    row.querySelector('[data-acao="del"]').onclick = () => onCfgMinistranteExcluir(m.id, m.nome);
    el.appendChild(row);
  }
}

async function onCfgMinistranteAdicionar() {
  const input = document.getElementById('cfg-ministrante-novo-nome');
  const nome = String(input?.value || '').trim();
  if (!nome) {
    alert('Digite o nome do ministrante.');
    return;
  }
  try {
    await criarMinistranteNoServidor(getControllerApiBase(), nome);
    if (input) input.value = '';
    await renderListaCfgMinistrantes();
    renderPlaylist();
  } catch (e) {
    alert(e.message || 'Falha ao adicionar.');
  }
}

async function onCfgMinistranteRenomear(id, nomeAtual) {
  /* Electron bloqueia `window.prompt` — usar o diálogo interno do painel. */
  const novo = await appPrompt('Novo nome do ministrante:', {
    title: 'Renomear ministrante',
    defaultValue: nomeAtual || '',
    emptyMsg: 'Digite um nome válido.',
    maxLength: 80,
    normalizar: (v) => String(v ?? '').trim().slice(0, 80),
  });
  if (novo == null) return;
  const nome = String(novo).trim();
  if (!nome) {
    alert('Nome inválido.');
    return;
  }
  try {
    await renomearMinistranteNoServidor(getControllerApiBase(), id, nome);
    await renderListaCfgMinistrantes();
    renderPlaylist();
  } catch (e) {
    alert(e.message || 'Falha ao renomear.');
  }
}

async function onCfgMinistranteExcluir(id, nome) {
  const ok = await appConfirm(
    `Excluir o ministrante «${nome}»?\n\nAs músicas que o tinham selecionado ficam sem ministrante. Os tons memorizados deste nome também são removidos.`,
    'Excluir ministrante'
  );
  if (!ok) return;
  try {
    await excluirMinistranteNoServidor(getControllerApiBase(), id);
    if (limparMinistranteDasPlaylists(playlists, id)) savePlaylists();
    if (limparMinistrantePadraoPorCulto(ministrantePadraoPorCulto, id)) saveMinistrantePadraoPorCulto();
    await renderListaCfgMinistrantes();
    renderPlaylist();
  } catch (e) {
    alert(e.message || 'Falha ao excluir.');
  }
}

async function onCfgImportTonsArquivoChange(ev) {
  const file = ev?.target?.files?.[0];
  const outEl = document.getElementById('cfg-tom-import-resultado');
  if (ev?.target) ev.target.value = '';
  if (!file) return;
  let payload;
  try {
    const texto = await file.text();
    payload = JSON.parse(texto);
  } catch (_) {
    alert('Arquivo JSON inválido.');
    return;
  }
  try {
    const res = await fetch(`${getControllerApiBase()}/api/tom-memoria/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detalhe = data.erro || (res.status === 404
        ? 'Rota de importação não encontrada. Reinicie o Lyra Controlador e tente de novo.'
        : `Falha na importação (HTTP ${res.status}).`);
      throw new Error(detalhe);
    }
    await aposSyncTonsInvb(data);
    const msg =
      `Importação concluída.\n` +
      `Aplicados agora: ${data.aplicados || 0}\n` +
      `Pendentes (música ainda não no banco): ${data.pendentes || 0}\n` +
      `Ministrantes criados: ${data.ministrantesCriados || 0}\n` +
      `Ignorados: ${data.ignorados || 0}`;
    if (outEl) {
      outEl.hidden = false;
      outEl.textContent = msg;
    }
    alert(msg);
  } catch (e) {
    alert(e.message || 'Falha ao importar tons.');
  }
}

/** Após sync/import de tons: refresca UI e playlists do disco se o servidor as alterou. */
async function aposSyncTonsInvb(data) {
  if (data?.updatedAt) {
    try {
      localStorage.setItem(LS_INVB_TONS_SYNC_AT, String(data.updatedAt));
    } catch (_) {
      // intencional
    }
  }
  if (Number(data?.playlistsAtualizadas) > 0) {
    try {
      const res = await fetch(`${getControllerApiBase()}/api/playlists`);
      if (res.ok) {
        const remoto = await res.json();
        if (remoto && typeof remoto === 'object' && !Array.isArray(remoto)) {
          playlists = remoto;
          try {
            localStorage.setItem(LS_PLAYLISTS, JSON.stringify(playlists));
          } catch (_) {
            // intencional
          }
        }
      }
    } catch (_) {
      // intencional
    }
  }
  await renderListaCfgMinistrantes();
  renderPlaylist();
  refrescarAberturaM3SeMusicaAtivaNaPlaylist();
}

/**
 * Sincroniza tons/ministrantes do site Tom Louvores.
 * @param {{ silencioso?: boolean }} [opts]
 */
async function sincronizarTonsInvbDoSite(opts = {}) {
  const silencioso = opts.silencioso === true;
  const outEl = document.getElementById('cfg-tom-import-resultado');
  const since = (() => {
    try {
      return String(localStorage.getItem(LS_INVB_TONS_SYNC_AT) || '').trim();
    } catch (_) {
      return '';
    }
  })();
  const body = {};
  if (CLOUD_INVB_TONS_SYNC_URL) {
    body.fonte = 'cloud';
    body.cloudUrl = CLOUD_INVB_TONS_SYNC_URL;
    if (since) body.since = since;
  } else {
    body.fonte = 'supabase';
  }
  try {
    const res = await fetch(`${getControllerApiBase()}/api/tom-memoria/sync-invb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || `Falha no sync (HTTP ${res.status}).`);
    if (data.semMudanca) {
      if (!silencioso && outEl) {
        outEl.hidden = false;
        outEl.textContent = 'Tons do site já estavam atualizados.';
      }
      return data;
    }
    await aposSyncTonsInvb(data);
    const msg =
      `Sync do site (${data.origem || 'supabase'}).\n` +
      `Aplicados: ${data.aplicados || 0} · Pendentes: ${data.pendentes || 0} · ` +
      `Ministrantes novos: ${data.ministrantesCriados || 0}` +
      (data.playlistsAtualizadas
        ? `\nPlaylist: ${data.playlistsAtualizadas} tom(ns) atualizado(s).`
        : '');
    if (outEl) {
      outEl.hidden = false;
      outEl.textContent = msg;
    }
    if (!silencioso) alert(msg);
    return data;
  } catch (e) {
    if (!silencioso) alert(e.message || 'Falha ao sincronizar tons do site.');
    throw e;
  }
}

async function onCfgSyncTonsInvbClick() {
  try {
    await sincronizarTonsInvbDoSite({ silencioso: false });
  } catch (_) {
    // alerta já mostrado
  }
}

/**
 * Pergunta, uma a uma, qual versão das músicas pendentes entra na playlist.
 *
 * O servidor só escolhe sozinho quando a família é exatamente «Original + uma
 * Cópia rigorosamente idêntica» (aí entra a Cópia). Cópia com alterações, ou uma
 * terceira versão, chegam aqui em `pendentesVersao`. Cancelar salta a música:
 * ela não entra na playlist. Devolve quantas foram efetivamente adicionadas.
 */
async function perguntarVersoesPendentesSyncLyra(pendentes) {
  const lista = Array.isArray(pendentes) ? pendentes : [];
  if (!lista.length) return 0;
  const escolhas = [];
  let posicaoAtual = 0;
  for (const p of lista) {
    const opcoes = (Array.isArray(p && p.opcoes) ? p.opcoes : []).map((o) => ({
      value: String(o.id),
      label: rotuloVersaoMaiusculo(
        o.ehOriginal ? 'Original' : formatarRotuloVersaoExibicao(o.rotulo, o.origem)
      ),
    }));
    if (opcoes.length < 2) continue;
    /* O nome da música vai no cabeçalho: é a primeira coisa que se lê no diálogo.
       Em baixo, só o secundário — artista e a posição na fila de pendentes. */
    const artista = String(p.artista || '').trim();
    posicaoAtual++;
    const posicao = lista.length > 1 ? `Música ${posicaoAtual} de ${lista.length}` : '';
    const detalhe = [
      artista ? `${artista}` : '',
      'Esta música tem mais de uma versão na biblioteca.',
      posicao,
    ]
      .filter(Boolean)
      .join('\n');
    const esc = await appEscolherOpcao(
      `${p.nome} — qual versão adicionar à playlist?`,
      opcoes,
      detalhe
    );
    if (esc == null) continue; // cancelou → a música não entra
    escolhas.push({
      cultoId: p.cultoId,
      rootId: p.rootId,
      versaoId: Number(esc),
      tema: p.tema,
    });
  }
  if (!escolhas.length) return 0;
  try {
    const res = await fetch(getControllerApiBase() + '/api/sync-invb-playlist/aplicar-versoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ escolhas }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Erro ao aplicar as versões escolhidas: ' + (data.erro || res.status));
      return 0;
    }
    return Number(data.adicionadas) || 0;
  } catch (e) {
    alert('Erro ao aplicar as versões escolhidas: ' + e.message);
    return 0;
  }
}

async function onSincronizarPlaylistLyraClick() {
  const btn = document.getElementById('btn-sync-invb-playlist');
  const btnShortcut = document.getElementById('playlist-sync-lyra-btn');
  const setLoading = (on) => {
    if (btn) { btn.disabled = on; btn.textContent = on ? 'Sincronizando…' : 'Sincronizar com Lyra'; }
    if (btnShortcut) {
      btnShortcut.disabled = on;
      /* Só o nome muda: escrever no botão inteiro apagaria o ícone do cartão. */
      const txtShortcut = btnShortcut.querySelector('.playlist-acao-card-txt');
      if (txtShortcut) txtShortcut.textContent = on ? 'Sincronizando…' : 'Sinc. Lyra DB';
      btnShortcut.title = on ? 'Sincronizando com Lyra…' : 'Sincronizar playlist com Lyra — importa músicas da escala do site usando o banco online do Lyra';
    }
  };
  /* Importa só a playlist do site do culto selecionado (data + turno). */
  const cultoIdSelecionado = String(cultoId || '').trim();
  if (!cultoIdSelecionado) {
    alert('Selecione primeiro o culto para importar a playlist do site.');
    return;
  }
  setLoading(true);
  try {
    const res = await fetch(getControllerApiBase() + '/api/sync-invb-playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cultoId: cultoIdSelecionado }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Erro ao sincronizar: ' + (data.erro || res.status));
      return;
    }
    /* Versões que o servidor não resolve sozinho: perguntar ANTES de a música
       entrar na playlist e só então mandar aplicar. Cancelar salta a música. */
    const adicionadasPorEscolha = await perguntarVersoesPendentesSyncLyra(data.pendentesVersao);

    // Recarregar playlists do servidor
    const resP = await fetch(getControllerApiBase() + '/api/playlists');
    if (resP.ok) {
      playlists = await resP.json();
      localStorage.setItem(LS_PLAYLISTS, JSON.stringify(playlists));
    }

    // Selecionar ministrante e aplicar tons automaticamente por cultoId
    if (data.ministrantePorCulto && typeof data.ministrantePorCulto === 'object') {
      const ministrantes = obterCacheMinistrantes();
      for (const [cultoId, nomeRaw] of Object.entries(data.ministrantePorCulto)) {
        if (!nomeRaw) continue;
        const nomeBusca = nomeRaw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const encontrado = ministrantes.find(m => {
          const n = String(m.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          return n === nomeBusca || n.startsWith(nomeBusca) || nomeBusca.startsWith(n);
        });
        if (encontrado) {
          setMinistrantePadraoCulto(cultoId, encontrado.id);
          const pl = playlists[cultoId];
          if (Array.isArray(pl)) {
            await aplicarMinistranteETonsEmTodasMusicas(pl, encontrado.id);
          }
        }
      }
      savePlaylists();
    }

    await renderListaCfgMinistrantes();
    // Biblioteca: refletir de imediato as músicas acabadas de importar no DB
    await carregarMusicas();
    refreshListaBanco();
    renderPlaylist();

    const totalAdicionadas = (Number(data.adicionadas) || 0) + adicionadasPorEscolha;
    let msg = 'Sincronização concluída\n' + totalAdicionadas + ' músicas adicionadas';
    if (data.aviso) msg += '\n' + data.aviso;
    if (data.naoEncontradas && data.naoEncontradas.length > 0) {
      msg += '\n' + data.naoEncontradas.length + ' músicas não encontradas:\n';
      msg += data.naoEncontradas.map(m => '  • ' + m.nome + ' (' + m.tipo + ')').join('\n');
    }
    alert(msg);
  } catch (e) {
    alert('Erro ao sincronizar playlist: ' + e.message);
  } finally {
    setLoading(false);
  }
}

let invbTonsSyncTimer = null;
function iniciarSyncPeriodicoTonsInvb() {
  clearInterval(invbTonsSyncTimer);
  /* Primeira passagem após arranque (site → memória local). */
  setTimeout(() => {
    sincronizarTonsInvbDoSite({ silencioso: true }).catch(() => {});
  }, 8000);
  invbTonsSyncTimer = setInterval(() => {
    sincronizarTonsInvbDoSite({ silencioso: true }).catch(() => {});
  }, 5 * 60 * 1000);
}

/**
 * Classe da linha de música conforme onde ela vai ser anexada.
 *
 * A linha nasceu como cartão isolado e passou a ser uma linha dentro do cartão da
 * secção — mas continua a poder ser usada solta (uma busca, uma lista sem temas), e aí
 * o desenho de linha não se sustenta: sem cartão à volta, os divisores separam o nada.
 * Quem monta a lista já sabe qual é o caso — se está a anexar à raiz, é solta — e é essa
 * a única informação de que a variante precisa.
 *
 * @param {HTMLElement} parent onde a linha vai ser anexada
 * @param {HTMLElement} raiz raiz da lista (`#playlist-list`)
 * @param {boolean} ativa
 */
function classeLinhaPlaylist(parent, raiz, ativa) {
  const variante = parent === raiz ? ' playlist-row--card' : '';
  return 'playlist-row' + variante + (ativa ? ' ativo' : '');
}

/** Ordem da playlist respeitando marcadores de tema (cabeçalhos mesmo sem música). */
function renderPlaylistItensComMarcadores(el, pl) {
  let i = 0;
  let songNum = 0;
  let songAppendParent = el;

  const appendSongRow = (item, idxPl) => {
    songNum++;
    const row = document.createElement('div');
    row.dataset.plIdx = String(idxPl);
    row.className = classeLinhaPlaylist(
      songAppendParent,
      el,
      playlistItemDestacadoNaUi(item)
    );
    const rotuloVersao = sufixoRotuloVersaoPlaylist(item);
    row.innerHTML = htmlLinhaPlaylistModoAtual(item, songNum, rotuloVersao);
    if (playlistItemFoiTransmitido(item)) row.classList.add('playlist-row--transmitida');
    ligarBotoesESeletoresLinhaPlaylist(row, item, idxPl);
    songAppendParent.appendChild(row);
  };

  if (pl.length && !ehMarcadorTemaPlaylist(pl[0])) {
    let j = 0;
    while (j < pl.length && !ehMarcadorTemaPlaylist(pl[j])) j++;
    const rotulo = normalizarTemaPlaylist(pl[0]?.tema) || 'Sem tema';
    songAppendParent = anexarCabecalhoTemaPlaylist(el, rotulo, null);
    for (let k = 0; k < j; k++) appendSongRow(pl[k], k);
    i = j;
  }

  while (i < pl.length) {
    const it = pl[i];
    if (ehMarcadorTemaPlaylist(it)) {
      songAppendParent = anexarCabecalhoTemaPlaylist(
        el,
        normalizarTemaPlaylist(it.tema) || 'Sem tema',
        i
      );
      i++;
      continue;
    }
    appendSongRow(it, i);
    i++;
  }
}

/** Gera a lista numerada só com o NOME das músicas da playlist atual (sem autor/tags). */
function gerarTextoNomesMusicasPlaylist() {
  if (!cultoId) return '';
  const pl = getPlaylist(cultoId) || [];
  const linhas = [];
  for (const it of pl) {
    if (ehMarcadorTemaPlaylist(it)) continue;
    const nome = String(it?.titulo ?? '').trim();
    if (!nome) continue;
    linhas.push(`${linhas.length + 1}. ${nome}`);
  }
  return linhas.join('\n');
}

const PLAYLIST_COPIAR_ICONE_COPY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const PLAYLIST_COPIAR_ICONE_CHECK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
let playlistCopiarFeedbackTimer = null;

/** Copia a lista de músicas para a área de transferência e dá micro-feedback (ícone → check). */
async function copiarNomesMusicasPlaylist() {
  const btn = document.getElementById('playlist-copiar-nomes-btn');
  const texto = gerarTextoNomesMusicasPlaylist();
  if (!texto) {
    appAlert('Nenhuma música na playlist para copiar.');
    return;
  }
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
      ok = true;
    }
  } catch (_) {
    // fallback abaixo
  }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {
      ok = false;
    }
  }
  if (!ok) {
    appAlert('Não foi possível copiar a lista de músicas.');
    return;
  }
  if (btn) {
    clearTimeout(playlistCopiarFeedbackTimer);
    btn.innerHTML = PLAYLIST_COPIAR_ICONE_CHECK;
    btn.classList.add('copiado');
    btn.title = 'Copiado!';
    playlistCopiarFeedbackTimer = setTimeout(() => {
      btn.innerHTML = PLAYLIST_COPIAR_ICONE_COPY;
      btn.classList.remove('copiado');
      btn.title = 'Copiar lista numerada das músicas (só o nome)';
      playlistCopiarFeedbackTimer = null;
    }, 1500);
  }
}

/**
 * Desenha a playlist do culto e, a seguir, sincroniza a biblioteca à esquerda.
 *
 * A biblioteca esmaece as músicas que já estão neste culto; esse estado só pode
 * mudar quando a playlist muda, e todas as alterações passam por aqui. Fica um
 * invólucro (e não uma chamada no fim de `renderPlaylistPainel`) porque essa
 * função tem vários `return` pelo meio — no culto vazio, no culto por escolher —
 * e a sincronização tem de acontecer também nesses caminhos.
 */
function renderPlaylist() {
  renderPlaylistPainel();
  atualizarEstadoAdicionadasListaLocal();
}

function renderPlaylistPainel() {
  renderPlaylistPainelCorpo();
  atualizarContagensPlaylist();
}

function textoContagemMusicas(n) {
  return `${n} ${n === 1 ? 'música' : 'músicas'}`;
}

/**
 * Contagens da lista já desenhada: por bloco («4 músicas») e na barra («6 músicas · 3 momentos»).
 * Lê o DOM, não o array: é o que está na tela, e roda a cada `renderPlaylistPainel`.
 */
function atualizarContagensPlaylist() {
  const lista = document.getElementById('playlist-list');
  const total = document.getElementById('playlist-lista-contagem');
  if (!lista) return;
  const secoes = lista.querySelectorAll('.playlist-tema-section');
  secoes.forEach((sec) => {
    const n = sec.querySelectorAll('.playlist-tema-section-body .playlist-row').length;
    const c = sec.querySelector('.playlist-tema-head-count');
    if (c) c.textContent = textoContagemMusicas(n);
    /* Bloco expandido sem músicas: uma linha discreta, para o corpo não parecer defeito. */
    const corpo = sec.querySelector('.playlist-tema-section-body');
    if (corpo && n === 0 && !corpo.querySelector('.playlist-tema-vazio')) {
      const vazio = document.createElement('div');
      vazio.className = 'playlist-tema-vazio';
      vazio.textContent = 'Nenhuma música neste momento';
      corpo.appendChild(vazio);
    }
  });
  if (!total) return;
  if (!cultoId) {
    total.textContent = '';
    return;
  }
  const musicas = lista.querySelectorAll('.playlist-row').length;
  const momentos = secoes.length;
  total.textContent =
    `${textoContagemMusicas(musicas)} · ${momentos} ${momentos === 1 ? 'momento' : 'momentos'}`;
}

function renderPlaylistPainelCorpo() {
  const el = document.getElementById('playlist-list');
  el.innerHTML = '';
  renderSeletorTemasPlaylist();
  renderSeletorMinistranteCulto();
  /* Os dois seletores acabaram de receber texto novo (um nome de ministrante, um tema):
     o corpo que servia ao anterior pode não servir a este. */
  ajustarCorpoSeletoresDoCulto();
  if (!cultoId) {
    el.innerHTML = '<div class="placeholder-msg" style="margin:16px">🗓️ Selecione primeiro o <strong>dia do culto</strong> para ver ou montar a playlist.</div>';
    return;
  }
  const pl = getPlaylist(cultoId);
  podarTransmitidasDoCultoAtual(pl);
  if (!pl.length) {
    el.innerHTML = ehModoSlidesOperador()
      ? '<div class="placeholder-msg" style="margin:16px">📝 Nenhuma música neste culto.<br>Abra <strong>TELA INICIAL</strong> (topo) e, no <strong>banco de músicas à esquerda</strong>, toque em <strong>+</strong> em cada música para incluir na playlist.</div>'
      : '<div class="placeholder-msg" style="margin:16px">📝 Nenhuma música neste culto.<br>No banco de músicas <strong>à esquerda</strong>, toque em <strong>+</strong> na linha da música para adicionar ao culto.</div>';
    return;
  }

  if (playlistPossuiMarcadoresTema(pl)) {
    renderPlaylistItensComMarcadores(el, pl);
    garantirMusicaAtivaVisivelNaPlaylist();
    return;
  }

  /* Ordem linear = ordem real do array (subir/descer reflecte-se na lista).
     Secções por tema consecutivo, com seta para recolher/expandir. */
  let nLista = 0;
  let lastTemaChave = '\u0000';
  let songAppendParent = el;
  for (let idx = 0; idx < pl.length; idx++) {
    const item = pl[idx];
    if (ehMarcadorTemaPlaylist(item)) continue;
    nLista++;
    const temaNorm = normalizarTemaPlaylist(item?.tema) || '';
    const temaChave = temaNorm || '__SEM_TEMA__';
    if (temaChave !== lastTemaChave) {
      lastTemaChave = temaChave;
      const rotuloCab = temaNorm || 'Sem tema';
      songAppendParent = anexarCabecalhoTemaPlaylist(el, rotuloCab, null);
    }
    const row = document.createElement('div');
    row.dataset.plIdx = String(idx);
    const rotuloVersao = sufixoRotuloVersaoPlaylist(item);
    row.className = classeLinhaPlaylist(
      songAppendParent,
      el,
      playlistItemDestacadoNaUi(item)
    );
    row.innerHTML = htmlLinhaPlaylistModoAtual(item, nLista, rotuloVersao);
    if (playlistItemFoiTransmitido(item)) row.classList.add('playlist-row--transmitida');
    ligarBotoesESeletoresLinhaPlaylist(row, item, idx);
    songAppendParent.appendChild(row);
  }
  garantirMusicaAtivaVisivelNaPlaylist();
}

const PLAYLIST_MOVE_DUR_MS = 260;
const PLAYLIST_MOVE_FLASH_MS = 640;
/* Curva com travagem no fim: arranca depressa e assenta devagar, que é como se lê um
   objecto a cair no lugar. Linear parecia um salto; `ease` parecia lento a arrancar. */
const PLAYLIST_MOVE_EASING = 'cubic-bezier(0.22, 0.68, 0.28, 1)';

function preferenciaMovimentoReduzido() {
  try {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/**
 * Topo de cada linha no espaço de conteúdo da lista (soma do scroll), não no ecrã.
 *
 * Medir em coordenadas de ecrã dava deltas errados sempre que o `scrollIntoView` a seguir
 * mexia no scroll a meio da animação; descontando o `scrollTop` a medida deixa de
 * depender de onde a lista está a ser vista.
 *
 * @returns {Map<string, number>} índice na playlist → topo
 */
function medirPosicoesLinhasPlaylist() {
  const mapa = new Map();
  const lista = document.getElementById('playlist-list');
  if (!lista) return mapa;
  const base = lista.getBoundingClientRect().top - lista.scrollTop;
  lista.querySelectorAll('.playlist-row[data-pl-idx]').forEach((r) => {
    mapa.set(String(r.dataset.plIdx), r.getBoundingClientRect().top - base);
  });
  return mapa;
}

/** Aplica uma classe de realce reiniciando a animação mesmo em cliques seguidos. */
function realcarLinhaPlaylist(el, classe) {
  if (!el) return;
  el.classList.remove(classe);
  void el.offsetWidth; /* reinicia a animação: sem isto, dois cliques rápidos não piscam */
  el.classList.add(classe);
  setTimeout(() => el.classList.remove(classe), PLAYLIST_MOVE_FLASH_MS);
}

/**
 * Desliza as duas linhas trocadas entre a posição antiga e a nova (técnica FLIP).
 *
 * A lista é reconstruída do zero a cada `renderPlaylist()`, por isso não há elemento
 * para animar «de A para B»: o que se faz é medir onde as linhas estavam, deixar o
 * render pô-las já no sítio certo, e devolvê-las visualmente ao ponto de partida com um
 * `translateY` que depois se desfaz. O utilizador vê o movimento; o DOM nunca esteve
 * numa posição intermédia.
 *
 * @param {Map<string, number>} posAntes medições feitas ANTES de reordenar
 * @param {Map<string, string>} novoParaAntigo índice novo → índice antigo
 * @param {number} idxMovido
 * @param {number} idxDeslocado
 */
function animarReordenacaoPlaylist(posAntes, novoParaAntigo, idxMovido, idxDeslocado) {
  const lista = document.getElementById('playlist-list');
  if (!lista) return;
  const linhaMovida = lista.querySelector(`.playlist-row[data-pl-idx="${idxMovido}"]`);
  const linhaDeslocada = lista.querySelector(`.playlist-row[data-pl-idx="${idxDeslocado}"]`);
  const reduzido = preferenciaMovimentoReduzido();

  if (!reduzido) {
    const posDepois = medirPosicoesLinhasPlaylist();
    const emMovimento = [];
    novoParaAntigo.forEach((idxAntigo, idxNovo) => {
      const el = lista.querySelector(`.playlist-row[data-pl-idx="${idxNovo}"]`);
      const antes = posAntes.get(String(idxAntigo));
      const depois = posDepois.get(String(idxNovo));
      if (!el || antes == null || depois == null) return;
      const delta = antes - depois;
      /* Secção de tema recolhida, linha fora do DOM, troca sem deslocação: nada a animar. */
      if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) return;
      el.classList.add(el === linhaMovida ? 'playlist-row--a-mover' : 'playlist-row--a-deslocar');
      el.style.willChange = 'transform';
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      emMovimento.push(el);
    });

    if (emMovimento.length) {
      void lista.offsetWidth; /* fixa o ponto de partida antes de ligar a transição */
      requestAnimationFrame(() => {
        emMovimento.forEach((el) => {
          el.style.transition = `transform ${PLAYLIST_MOVE_DUR_MS}ms ${PLAYLIST_MOVE_EASING}`;
          el.style.transform = 'translateY(0)';
        });
      });
      setTimeout(() => {
        emMovimento.forEach((el) => {
          el.style.transition = '';
          el.style.transform = '';
          el.style.willChange = '';
          el.classList.remove('playlist-row--a-mover', 'playlist-row--a-deslocar');
        });
      }, PLAYLIST_MOVE_DUR_MS + 80);
    }
  }

  realcarLinhaPlaylist(linhaMovida, 'playlist-row--flash-move');
  realcarLinhaPlaylist(linhaDeslocada, 'playlist-row--flash-swap');
  if (linhaMovida) {
    linhaMovida.scrollIntoView({ block: 'nearest', behavior: reduzido ? 'auto' : 'smooth' });
  }
}

/**
 * Move uma música para outro sítio da playlist (arrasto).
 *
 * Substitui as setas ↑↓ que viviam em cada linha. Elas resolviam bem «uma posição acima»
 * e mal tudo o resto: pôr a última música em terceiro lugar eram seis cliques, cada um
 * com um render pelo meio. O arrasto diz o destino de uma vez.
 *
 * `pos` é o lado da linha de destino por onde a música entra — «antes» é a metade de
 * cima, «depois» a de baixo (ver `posicaoDropMusicaPlaylist`).
 *
 * A etiqueta de tema acompanha o bloco onde a música cai: é o que faz a fronteira entre
 * temas ser atravessável pelo mesmo gesto, sem um comando próprio para «mudar de tema».
 *
 * @param {string} cid culto
 * @param {number} fromIdx índice na playlist da música arrastada
 * @param {number} toIdx índice da linha sobre a qual se largou
 * @param {'antes'|'depois'} pos
 * @returns {number|null} índice final da música, ou `null` se nada mudou
 */
function reordenarMusicaNaPlaylist(cid, fromIdx, toIdx, pos) {
  const pl = getPlaylist(cid);
  if (!Array.isArray(pl)) return null;
  const item = pl[fromIdx];
  const alvo = pl[toIdx];
  if (!item || ehMarcadorTemaPlaylist(item)) return null;
  if (!alvo || ehMarcadorTemaPlaylist(alvo)) return null;

  /* O destino é medido na lista COM a música ainda lá dentro; tirá-la primeiro encurta
     tudo o que vem depois dela em um, e é essa a correção do `fromIdx < destino`. */
  let destino = pos === 'depois' ? toIdx + 1 : toIdx;
  if (fromIdx < destino) destino--;
  if (destino === fromIdx) return null;

  pl.splice(fromIdx, 1);
  pl.splice(destino, 0, item);
  item.tema = temaDoBlocoDeDestinoNaPlaylist(pl, destino);
  return destino;
}

/**
 * Tema que a música passa a ter depois de largada em `idx`.
 *
 * Com marcadores, quem manda é o cabeçalho acima dela — o mesmo critério que a lista usa
 * para a desenhar. Sem marcadores não há cabeçalho: o bloco é a etiqueta das músicas
 * seguidas, por isso a etiqueta vem do vizinho de cima e, à falta dele (largada no topo),
 * do de baixo.
 */
function temaDoBlocoDeDestinoNaPlaylist(pl, idx) {
  if (playlistPossuiMarcadoresTema(pl)) return temaDoBlocoNaPlaylist(pl, idx);
  const acima = pl[idx - 1];
  const abaixo = pl[idx + 1];
  const vizinho =
    acima && !ehMarcadorTemaPlaylist(acima)
      ? acima
      : abaixo && !ehMarcadorTemaPlaylist(abaixo)
        ? abaixo
        : null;
  return normalizarTemaPlaylist((vizinho || pl[idx])?.tema) || '';
}

/**
 * Bloco de tema sem nenhuma música.
 *
 * Um bloco vai do marcador até ao marcador seguinte (ou ao fim da lista), por isso basta
 * olhar para o elemento logo a seguir: se for outro marcador — ou se não houver nada —,
 * o tema está vazio e a lista desenha-o só com o cabeçalho.
 */
function blocoTemaPlaylistVazio(pl, markerIdx) {
  if (!Array.isArray(pl)) return false;
  if (!ehMarcadorTemaPlaylist(pl[markerIdx])) return false;
  const seguinte = pl[markerIdx + 1];
  return !seguinte || ehMarcadorTemaPlaylist(seguinte);
}

/**
 * Move uma música para um tema que ainda não tem nenhuma (arrasto largado no cartão).
 *
 * `reordenarMusicaNaPlaylist` mede o destino a partir de uma linha de música, e num bloco
 * vazio não existe nenhuma — era por isso que o gesto morria a meio. Aqui o destino vem
 * do marcador: a música entra logo a seguir ao cabeçalho, que é o único sítio que o bloco
 * tem. A etiqueta de tema segue a mesma regra do arrasto entre blocos com músicas.
 *
 * @param {string} cid culto
 * @param {number} fromIdx índice na playlist da música arrastada
 * @param {number} markerIdx índice do marcador do tema de destino
 * @returns {number|null} índice final da música, ou `null` se nada mudou
 */
function moverMusicaParaTemaVazioNaPlaylist(cid, fromIdx, markerIdx) {
  const pl = getPlaylist(cid);
  if (!Array.isArray(pl)) return null;
  const item = pl[fromIdx];
  if (!item || ehMarcadorTemaPlaylist(item)) return null;
  if (!blocoTemaPlaylistVazio(pl, markerIdx)) return null;

  /* O destino é medido na lista COM a música ainda lá dentro; tirá-la primeiro encurta
     tudo o que vem depois dela em um — a mesma correcção do arrasto entre linhas. */
  let destino = markerIdx + 1;
  if (fromIdx < destino) destino--;
  if (destino === fromIdx) return null;

  pl.splice(fromIdx, 1);
  pl.splice(destino, 0, item);
  item.tema = temaDoBlocoDeDestinoNaPlaylist(pl, destino);
  return destino;
}

/**
 * Move uma música para o FIM de um bloco de tema (arrasto largado sobre o bloco recolhido).
 *
 * Com o bloco recolhido as linhas não existem na tela, logo não há linha-alvo: o destino vem
 * do marcador — a música entra depois da última do bloco. Mesma correção de índice do arrasto
 * entre linhas (o destino é medido com a música ainda na lista) e mesma regra de etiqueta.
 *
 * @returns {number|null} índice final da música, ou `null` se nada mudou
 */
function moverMusicaParaFimDoBlocoTemaNaPlaylist(cid, fromIdx, markerIdx) {
  const pl = getPlaylist(cid);
  if (!Array.isArray(pl)) return null;
  const item = pl[fromIdx];
  if (!item || ehMarcadorTemaPlaylist(item)) return null;
  if (!ehMarcadorTemaPlaylist(pl[markerIdx])) return null;

  let fim = markerIdx + 1;
  while (fim < pl.length && !ehMarcadorTemaPlaylist(pl[fim])) fim++;
  let destino = fim;
  if (fromIdx < destino) destino--;
  if (destino === fromIdx) return null;

  pl.splice(fromIdx, 1);
  pl.splice(destino, 0, item);
  item.tema = temaDoBlocoDeDestinoNaPlaylist(pl, destino);
  return destino;
}

const MIME_MUSICA_PLAYLIST = 'application/x-lyra-pl-musica-idx';

/**
 * Índice da música em arrasto. Como no arrasto de blocos de tema, o `dataTransfer` só
 * devolve os dados no `drop` (no `dragover` há apenas os tipos), por isso o índice fica
 * aqui para o feedback visual saber qual linha está a viajar.
 */
let arrastandoMusicaPlaylistIdx = null;

function limparIndicadoresDropMusicaPlaylist() {
  document
    .querySelectorAll('.playlist-row--drop-antes, .playlist-row--drop-depois')
    .forEach((el) => {
      el.classList.remove('playlist-row--drop-antes', 'playlist-row--drop-depois');
    });
  /* O realce do bloco vazio pertence ao mesmo gesto que os traços das linhas: sai com
     eles, senão ficava aceso depois de o cursor seguir para a linha de outro tema. */
  document
    .querySelectorAll('.playlist-tema-section--drop-dentro')
    .forEach((el) => el.classList.remove('playlist-tema-section--drop-dentro'));
}

/** Metade de cima da linha = entrar antes dela; metade de baixo = entrar depois. */
function posicaoDropMusicaPlaylist(row, clientY) {
  const r = row.getBoundingClientRect();
  if (!r.height) return 'antes';
  return clientY - r.top < r.height / 2 ? 'antes' : 'depois';
}

/**
 * Liga o arrasto de uma linha da playlist.
 *
 * O `draggable` vive na alça (`.pl-grip`) e não na linha, pela mesma razão que no
 * cabeçalho de tema: a linha inteira já responde ao clique (selecciona a música) e ao
 * duplo clique (projecta), e um gesto de arrasto nascido em qualquer ponto dela colidiria
 * com os dois. Marcando só a alça, é o browser que decide quando o gesto começa.
 *
 * A linha INTEIRA continua a ser zona de largada — a alça é estreita de mais para ser
 * alvo, e o gesto tem de perdoar imprecisão.
 */
function configurarDragReordenarLinhaPlaylist(row, idxPl) {
  const grip = row.querySelector('.pl-grip');
  if (!grip) return;
  grip.draggable = true;

  /* A alça não selecciona nem projecta a música: o gesto que ela serve é outro. */
  grip.addEventListener('mousedown', (ev) => ev.stopPropagation());
  grip.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  });

  grip.addEventListener('dragstart', (ev) => {
    arrastandoMusicaPlaylistIdx = idxPl;
    ev.dataTransfer.setData(MIME_MUSICA_PLAYLIST, String(idxPl));
    ev.dataTransfer.effectAllowed = 'move';
    /* O que viaja é a música, não a alça: o fantasma é a linha toda, agarrada no ponto
       onde o rato caiu. Antes de a esmaecer, senão é a versão apagada que fica sob o
       cursor. */
    try {
      const r = row.getBoundingClientRect();
      ev.dataTransfer.setDragImage(row, ev.clientX - r.left, ev.clientY - r.top);
    } catch (_) {
      // intencional — sem imagem própria o arraste continua a funcionar
    }
    row.classList.add('playlist-row--arrastando');
    document.getElementById('playlist-list')?.classList.add('playlist-list--reordenando-musica');
  });

  grip.addEventListener('dragend', () => {
    arrastandoMusicaPlaylistIdx = null;
    row.classList.remove('playlist-row--arrastando');
    document
      .getElementById('playlist-list')
      ?.classList.remove('playlist-list--reordenando-musica');
    limparIndicadoresDropMusicaPlaylist();
  });

  row.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    /* Sem isto a secção do tema por baixo também trataria o evento e as duas leituras do
       destino disputavam o mesmo traço. */
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    if (arrastandoMusicaPlaylistIdx === idxPl) {
      limparIndicadoresDropMusicaPlaylist();
      return;
    }
    const cls =
      posicaoDropMusicaPlaylist(row, ev.clientY) === 'depois'
        ? 'playlist-row--drop-depois'
        : 'playlist-row--drop-antes';
    /* Sem o atalho, cada `dragover` reescrevia a classe e o traço piscava. */
    if (row.classList.contains(cls)) return;
    limparIndicadoresDropMusicaPlaylist();
    row.classList.add(cls);
  });

  row.addEventListener('dragleave', (ev) => {
    /* Passar por um filho dispara `dragleave` na linha; só limpa ao sair de facto. */
    if (ev.relatedTarget instanceof Node && row.contains(ev.relatedTarget)) return;
    row.classList.remove('playlist-row--drop-antes', 'playlist-row--drop-depois');
  });

  row.addEventListener('drop', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const pos = posicaoDropMusicaPlaylist(row, ev.clientY);
    limparIndicadoresDropMusicaPlaylist();
    const fromIdx = Number(ev.dataTransfer.getData(MIME_MUSICA_PLAYLIST));
    arrastandoMusicaPlaylistIdx = null;
    if (!Number.isFinite(fromIdx) || !cultoId) return;
    const destino = reordenarMusicaNaPlaylist(cultoId, fromIdx, idxPl, pos);
    if (destino == null) return;
    savePlaylists();
    renderPlaylist();
    /* Sem deslize (FLIP) aqui: o utilizador acabou de ver a música ir para onde a levou.
       O realce responde à única pergunta que sobra — «foi esta que mudou de sítio?». */
    realcarLinhaPlaylist(
      document.querySelector(`#playlist-list .playlist-row[data-pl-idx="${destino}"]`),
      'playlist-row--flash-move'
    );
  });
}

/**
 * Liga a largada de músicas no cartão de um tema vazio.
 *
 * A zona de largada de uma música é sempre a linha de outra música — e um bloco vazio não
 * desenha nenhuma. O cartão do tema via o arrasto passar por cima e não o recebia, por
 * isso um tema sem músicas nunca chegava a ser destino. Aqui o alvo é o cartão inteiro,
 * que é tudo o que esse bloco tem.
 *
 * Só se liga em blocos vazios: onde já há músicas, quem manda continua a ser a linha
 * (metade de cima entra antes, metade de baixo entra depois), e um alvo por cima dela
 * roubaria essa leitura. As linhas travam a propagação no `dragover` e no `drop`, por
 * isso mesmo nesse caso nunca haveria disputa — mas o mais claro é nem existir.
 */
function configurarDropMusicaEmTemaVazioPlaylist(secao, markerPlIdx) {
  secao.classList.add('playlist-tema-section--vazia');

  secao.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    /* Sem o atalho, cada `dragover` reescrevia a classe e o realce piscava. */
    if (secao.classList.contains('playlist-tema-section--drop-dentro')) return;
    limparIndicadoresDropMusicaPlaylist();
    secao.classList.add('playlist-tema-section--drop-dentro');
  });

  secao.addEventListener('dragleave', (ev) => {
    /* Passar por um filho dispara `dragleave` na secção; só limpa ao sair de facto. */
    if (ev.relatedTarget instanceof Node && secao.contains(ev.relatedTarget)) return;
    secao.classList.remove('playlist-tema-section--drop-dentro');
  });

  secao.addEventListener('drop', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    limparIndicadoresDropMusicaPlaylist();
    const fromIdx = Number(ev.dataTransfer.getData(MIME_MUSICA_PLAYLIST));
    arrastandoMusicaPlaylistIdx = null;
    if (!Number.isFinite(fromIdx) || !cultoId) return;
    const destino = moverMusicaParaTemaVazioNaPlaylist(cultoId, fromIdx, markerPlIdx);
    if (destino == null) return;
    savePlaylists();
    renderPlaylist();
    /* Mesmo critério do arrasto entre linhas: sem deslize, só o realce a responder
       «foi esta que mudou de sítio?». */
    realcarLinhaPlaylist(
      document.querySelector(`#playlist-list .playlist-row[data-pl-idx="${destino}"]`),
      'playlist-row--flash-move'
    );
  });
}

/**
 * Largada de música sobre um bloco RECOLHIDO que já tem músicas.
 *
 * O bloco recolhido só mostra o cabeçalho, e a zona de largada de uma música é sempre outra
 * linha — que ali está oculta. A música cai no fim do bloco, e o bloco expande para o
 * operador ver onde ela foi parar. Só age enquanto recolhido: expandido, quem manda são as
 * linhas (este alvo nem responde), e bloco vazio já tem o seu próprio alvo.
 */
function configurarDropMusicaEmSecaoRecolhidaPlaylist(secao, markerPlIdx, rotuloTema) {
  const recolhida = () => secao.classList.contains('playlist-tema-section--colapsada');

  secao.addEventListener('dragover', (ev) => {
    if (!recolhida() || !ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    if (secao.classList.contains('playlist-tema-section--drop-dentro')) return;
    limparIndicadoresDropMusicaPlaylist();
    secao.classList.add('playlist-tema-section--drop-dentro');
  });

  secao.addEventListener('dragleave', (ev) => {
    if (ev.relatedTarget instanceof Node && secao.contains(ev.relatedTarget)) return;
    secao.classList.remove('playlist-tema-section--drop-dentro');
  });

  secao.addEventListener('drop', (ev) => {
    if (!recolhida() || !ev.dataTransfer.types.includes(MIME_MUSICA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    limparIndicadoresDropMusicaPlaylist();
    const fromIdx = Number(ev.dataTransfer.getData(MIME_MUSICA_PLAYLIST));
    arrastandoMusicaPlaylistIdx = null;
    if (!Number.isFinite(fromIdx) || !cultoId) return;
    const destino = moverMusicaParaFimDoBlocoTemaNaPlaylist(cultoId, fromIdx, markerPlIdx);
    if (destino === null) return;
    definirSecaoTemaPlaylistRecolhida(String(cultoId), rotuloTema, false);
    savePlaylists();
    renderPlaylist();
    realcarLinhaPlaylist(
      document.querySelector(`#playlist-list .playlist-row[data-pl-idx="${destino}"]`),
      'playlist-row--flash-move'
    );
  });
}

function removePlItem(idx) {
  getPlaylist(cultoId).splice(idx, 1);
  savePlaylists();
  renderPlaylist();
}

/** Cabeçalho de tema com seta expandir/recolher e corpo onde entram as linhas da playlist. Devolve o elemento onde anexar as músicas. */
function anexarCabecalhoTemaPlaylist(elRoot, rotulo, idxMarcador) {
  const texto = rotulo || 'Sem tema';
  const cid = String(cultoId || '');

  const wrap = document.createElement('div');
  wrap.className = 'playlist-tema-section';

  const row = document.createElement('div');
  row.className = 'playlist-tema-head-row';

  const btnExpand = document.createElement('button');
  btnExpand.type = 'button';
  btnExpand.className = 'btn sm playlist-tema-toggle-expand';
  btnExpand.setAttribute('aria-label', 'Expandir ou recolher músicas deste tema');

  const lab = document.createElement('div');
  lab.className = 'playlist-tema-head-label';
  lab.textContent = texto;
  lab.dataset.dica = texto;

  /* Contagem de músicas do bloco («4 músicas»); preenchida por `atualizarContagensPlaylist`
     depois que as linhas são anexadas. */
  const contagem = document.createElement('span');
  contagem.className = 'playlist-tema-head-count';

  row.appendChild(btnExpand);
  row.appendChild(lab);
  row.appendChild(contagem);

  if (idxMarcador != null && idxMarcador !== undefined) {
    // O ✕ vive numa zona própria no canto direito: é o hover dela — e não o do card
    // inteiro — que revela o botão, e é ela que separa a área de excluir da de arrastar.
    const zonaDel = document.createElement('div');
    zonaDel.className = 'playlist-tema-head-zona-del';

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'btn sm danger playlist-tema-head-del';
    btnDel.textContent = '✕';
    btnDel.title = 'Excluir este tema e todas as músicas deste bloco na playlist';
    btnDel.onclick = (e) => {
      e.stopPropagation();
      solicitarRemoverMarcadorTemaPlaylist(idxMarcador);
    };

    zonaDel.appendChild(btnDel);
    row.appendChild(zonaDel);
  }

  const body = document.createElement('div');
  body.className = 'playlist-tema-section-body';

  wrap.appendChild(row);
  wrap.appendChild(body);
  elRoot.appendChild(wrap);

  const inicioRecolhido = secaoTemaPlaylistRecolhida(cid, texto);
  if (inicioRecolhido) wrap.classList.add('playlist-tema-section--colapsada');
  atualizarUiExpandSecaoTema(btnExpand, inicioRecolhido);

  btnExpand.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    wrap.classList.toggle('playlist-tema-section--colapsada');
    const rec = wrap.classList.contains('playlist-tema-section--colapsada');
    definirSecaoTemaPlaylistRecolhida(cid, texto, rec);
    atualizarUiExpandSecaoTema(btnExpand, rec);
  };

  if (idxMarcador != null && idxMarcador !== undefined && cultoId && playlistPossuiMarcadoresTema(getPlaylist(cultoId))) {
    configurarDragReordenarCabecalhoTemaPlaylist(row, wrap, idxMarcador);
    /* Sem músicas, o cartão não tem nenhuma linha que sirva de destino: passa ele
       próprio a receber o arrasto (ver a função). */
    if (blocoTemaPlaylistVazio(getPlaylist(cultoId), idxMarcador)) {
      configurarDropMusicaEmTemaVazioPlaylist(wrap, idxMarcador);
    } else {
      configurarDropMusicaEmSecaoRecolhidaPlaylist(wrap, idxMarcador, texto);
    }
  }

  return body;
}

const MIME_MARCADOR_TEMA_PLAYLIST = 'application/x-lyra-pl-marcador-idx';

/**
 * Índice do marcador em arrasto. O `dataTransfer` só devolve os dados no `drop`
 * (no `dragover` só há os tipos), por isso o índice fica aqui para o feedback
 * visual poder saber qual bloco está a ser movido.
 */
let arrastandoMarcadorTemaPlaylistIdx = null;

function limparIndicadoresDropTemaPlaylist() {
  document
    .querySelectorAll('.playlist-tema-section--drop-antes, .playlist-tema-section--drop-depois')
    .forEach((el) => {
      el.classList.remove('playlist-tema-section--drop-antes', 'playlist-tema-section--drop-depois');
    });
}

/** Metade de cima da secção = cair antes dela; metade de baixo = cair depois. */
function posicaoDropTemaPlaylist(secao, clientY) {
  const r = secao.getBoundingClientRect();
  if (!r.height) return 'antes';
  return clientY - r.top < r.height / 2 ? 'antes' : 'depois';
}

/**
 * Arrastar o cabeçalho move o bloco inteiro (marcador + músicas). A secção completa
 * é zona de largada — não só o cabeçalho — para o gesto perdoar imprecisão.
 */
function configurarDragReordenarCabecalhoTemaPlaylist(row, secao, markerPlIdx) {
  row.dataset.plMarcadorIdx = String(markerPlIdx);
  secao.dataset.plMarcadorIdx = String(markerPlIdx);

  /*
   * O `draggable` vive no rótulo, e não no card: os cantos do card pertencem ao expandir/
   * recolher e ao excluir, e o gesto só deve nascer na faixa do meio.
   *
   * Deixá-lo no card e recusar o gesto quando `ev.target` não estivesse dentro do rótulo
   * não funciona: no `dragstart`, o `target` é sempre o próprio elemento que tem
   * `draggable` — nunca o filho onde o rato caiu. A condição dava sempre falso, o arraste
   * morria num `preventDefault()`, e nenhum tema se conseguia reordenar. Marcar só o
   * rótulo deixa a decisão ao browser, que é quem a sabe tomar. É também o que já se faz
   * no editor de estrofes, onde o `draggable` está na alça e não na linha.
   */
  const zonaArraste = row.querySelector('.playlist-tema-head-label');
  if (!zonaArraste) return;
  zonaArraste.draggable = true;
  zonaArraste.title = 'Arrastar para reordenar este tema na playlist';

  zonaArraste.addEventListener('dragstart', (ev) => {
    arrastandoMarcadorTemaPlaylistIdx = markerPlIdx;
    ev.dataTransfer.setData(MIME_MARCADOR_TEMA_PLAYLIST, String(markerPlIdx));
    ev.dataTransfer.effectAllowed = 'move';
    /* O que viaja é o bloco inteiro, por isso o fantasma é o card e não a faixa do
       rótulo. Antes de esmaecer o card, senão é a versão apagada que fica sob o rato. */
    try {
      const r = row.getBoundingClientRect();
      ev.dataTransfer.setDragImage(row, ev.clientX - r.left, ev.clientY - r.top);
    } catch (_) {
      // intencional — sem imagem própria o arraste continua a funcionar
    }
    row.classList.add('playlist-tema-head-row--dragging');
    secao.classList.add('playlist-tema-section--arrastando');
    document.getElementById('playlist-list')?.classList.add('playlist-list--reordenando-tema');
  });

  zonaArraste.addEventListener('dragend', () => {
    arrastandoMarcadorTemaPlaylistIdx = null;
    row.classList.remove('playlist-tema-head-row--dragging');
    secao.classList.remove('playlist-tema-section--arrastando');
    document.getElementById('playlist-list')?.classList.remove('playlist-list--reordenando-tema');
    limparIndicadoresDropTemaPlaylist();
  });

  secao.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MARCADOR_TEMA_PLAYLIST)) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    /* Sobre o próprio bloco arrastado não há destino a mostrar. */
    if (arrastandoMarcadorTemaPlaylistIdx === markerPlIdx) {
      limparIndicadoresDropTemaPlaylist();
      return;
    }
    const pos = posicaoDropTemaPlaylist(secao, ev.clientY);
    const cls =
      pos === 'depois' ? 'playlist-tema-section--drop-depois' : 'playlist-tema-section--drop-antes';
    /* Sem o atalho, cada `dragover` reescrevia a classe e o traço piscava. */
    if (secao.classList.contains(cls)) return;
    limparIndicadoresDropTemaPlaylist();
    secao.classList.add(cls);
  });

  secao.addEventListener('dragleave', (ev) => {
    /* Passar por um filho dispara `dragleave` na secção; só limpa ao sair de facto. */
    if (ev.relatedTarget instanceof Node && secao.contains(ev.relatedTarget)) return;
    secao.classList.remove('playlist-tema-section--drop-antes', 'playlist-tema-section--drop-depois');
  });

  secao.addEventListener('drop', (ev) => {
    if (!ev.dataTransfer.types.includes(MIME_MARCADOR_TEMA_PLAYLIST)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const pos = posicaoDropTemaPlaylist(secao, ev.clientY);
    limparIndicadoresDropTemaPlaylist();
    const fromIdx = Number(ev.dataTransfer.getData(MIME_MARCADOR_TEMA_PLAYLIST));
    const toIdx = Number(secao.dataset.plMarcadorIdx);
    arrastandoMarcadorTemaPlaylistIdx = null;
    if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx)) return;
    if (!reordenarMarcadoresTemaNaPlaylist(cultoId, fromIdx, toIdx, pos)) return;
    renderSeletorTemasPlaylist();
    renderPlaylist();
  });
}

async function solicitarRemoverMarcadorTemaPlaylist(idx) {
  if (!cultoId) return;
  const plAntes = getPlaylist(cultoId);
  if (!ehMarcadorTemaPlaylist(plAntes[idx])) return;
  const nome = normalizarTemaPlaylist(plAntes[idx].tema) || '';
  if (!nome) {
    const ok = await appConfirm(
      'Remover este separador (sem nome de tema)? As músicas deste trecho continuam na playlist.',
      'Remover separador'
    );
    if (!ok) return;
    const pl = getPlaylist(cultoId);
    if (!ehMarcadorTemaPlaylist(pl[idx])) return;
    pl.splice(idx, 1);
    savePlaylists();
    renderSeletorTemasPlaylist();
    renderPlaylist();
    return;
  }
  const ok = await appConfirm(
    `Remover o tema «${nome}» da playlist? As músicas deste bloco serão removidas da playlist, mas o tema continuará disponível no menu.`,
    'Remover tema da playlist'
  );
  if (!ok) return;
  const pl = getPlaylist(cultoId);
  const filtrado = playlistPossuiMarcadoresTema(pl)
    ? filtrarPlaylistRemovendoTemaComMarcadores(pl, nome)
    : pl.filter((it) => normalizarTemaPlaylist(it.tema) !== nome);
  playlists[cultoId] = filtrado;
  if (nome === TEMA_PADRAO_ABERTURA) marcarAberturaRemovidaPeloUsuario(cultoId);
  if (getTemaSelecionadoAtual() === nome) setTemaSelecionadoAtual('');
  savePlaylists();
  const plDepois = getPlaylist(cultoId);
  const aindaNaLista =
    !!musicaAtiva &&
    plDepois.some((it) => !ehMarcadorTemaPlaylist(it) && playlistItemMesmaVersaoQueAtiva(it));
  if (musicaAtiva && !aindaNaLista) encerrarProjecaoDoControlador({ limparMusica: true });
  renderSeletorTemasPlaylist();
  renderPlaylist();
}


async function addMusicaNaPlaylist(meta) {
  if (!cultoId) {
    alert('Selecione primeiro o dia do culto.');
    return;
  }
  const idNum = Number(meta.id);
  const bancoFonte = fonteBancoItemPlaylist(meta);
  let versaoLocalId = null;
  let tituloPl = meta.titulo;
  let artistaPl = meta.artista || '';
  const opcoesVersao = [{ value: '__ORIGINAL__', label: rotuloVersaoMaiusculo('Original') }];
  if (bancoFonte !== 'catalog') {
    try {
      const resV = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/versoes`);
      if (resV.ok) {
        const dataV = await resV.json();
        const rootId = Number(dataV.rootId) || idNum;
        for (const v of dataV.versoes || []) {
          if (Number(v.id) === rootId || v.parent_id == null) {
            // Conteúdo da Original, para comparar com o das outras versões.
            if (Number(v.id) === rootId) opcoesVersao[0].conteudo = v;
            continue;
          }
          const rotulo = String(v.rotulo || '').trim() || 'Cópia';
          opcoesVersao.push({
            value: String(v.id),
            label: rotuloVersaoMaiusculo(formatarRotuloVersaoExibicao(rotulo, v.origem_importacao)),
            conteudo: v,
          });
        }
      }
    } catch (_) {
      // intencional — falha ao listar versões do servidor
    }
    for (const c of getCopiasParaMusica(idNum)) {
      opcoesVersao.push({
        value: c.id,
        label: `${rotuloVersaoMaiusculo(formatarRotuloVersaoExibicao(c.rotulo))} (LOCAL)`,
        conteudo: c,
      });
    }
  }
  // Versões rigorosamente idênticas (mesmo título, artista e estrofes, caractere
  // por caractere) contam como uma só; quando a repetida é a Original, quem fica
  // na lista é a Cópia (a Original é imutável). Sobrando uma opção só, importa
  // essa opção sem perguntar; senão, pergunta só entre as versões distintas.
  const opcoesVersaoDistintas = opcoesVersaoDistintasPorConteudo(opcoesVersao);
  let esc = null;
  if (opcoesVersaoDistintas.length > 1) {
    esc = await appEscolherOpcao('Qual versão deseja adicionar à playlist?', opcoesVersaoDistintas);
    if (esc == null) return;
  } else if (opcoesVersaoDistintas.length === 1) {
    esc = opcoesVersaoDistintas[0].value;
  }
  if (esc != null && esc !== '__ORIGINAL__') {
    versaoLocalId = esc;
    if (ehVersaoServidorId(esc)) {
      try {
        const resM = await fetch(`${getControllerApiBase()}/api/musicas/${encodeURIComponent(esc)}`);
        if (resM.ok) {
          const m = await resM.json();
          tituloPl = m.titulo || tituloPl;
          artistaPl = m.artista || artistaPl;
        }
      } catch (_) {
        // intencional — falha ao carregar metadados da versão
      }
    } else {
      const c = encontrarCopiaLocal(idNum, esc);
      if (c) {
        tituloPl = c.titulo;
        artistaPl = c.artista || '';
      }
    }
  }
  const pl = getPlaylist(cultoId);
  if (playlistJaContemMesmaMusicaEVersao(pl, idNum, versaoLocalId, bancoFonte)) {
    appAlert('Esta música (mesma versão e mesma origem catálogo/servidor) já está na playlist deste culto.', 'Playlist');
    return;
  }
  let tema;
  const temMarcadores = playlistPossuiMarcadoresTema(pl);
  if (temMarcadores) {
    const marcadores = listarMarcadoresTemaPlaylist(pl);
    if (marcadores.length === 0) {
      alert('Use o botão «Inserir tema na playlist abaixo» (seta até à linha) para adicionar um bloco de tema no fim da playlist antes de incluir músicas.');
      return;
    }
    if (marcadores.length === 1) {
      // Só um tema (ex.: apenas ABERTURA) → mantém o comportamento atual, sem perguntar.
      tema = marcadores[0];
    } else {
      // Mais de um tema → deixa o usuário escolher em qual bloco adicionar (Modal 2).
      const ultimo = obterUltimoMarcadorTema(pl);
      const opcoesTema = marcadores.map((t) => ({
        value: t,
        label: t === ultimo ? `${t} (ÚLTIMO)` : t,
      }));
      const escTema = await appEscolherOpcao(
        'Em qual tema adicionar esta música?',
        opcoesTema,
        `«${tituloPl}» será adicionada ao tema escolhido.`
      );
      if (escTema == null) return; // cancelou
      tema = normalizarTemaPlaylist(escTema);
    }
  } else {
    tema = getTemaSelecionadoAtual();
    if (!tema) {
      alert('Selecione um tema na lista e use «Inserir tema na playlist abaixo» para ativá-lo na playlist.');
      return;
    }
  }
  garantirTemaNoCatalogoAtual(tema);
  const mt = await camposMinistranteTomParaNovaMusicaNaPlaylist(cultoId, {
    id: idNum,
    titulo: tituloPl,
    bancoFonte,
  });
  const novoItem = {
    id: meta.id,
    titulo: tituloPl,
    artista: artistaPl,
    tema,
    versaoLocalId,
    // Tags (rótulos de versão) nunca entram na playlist, seja qual for a versão escolhida.
    versaoRotulo: '',
    bancoFonte,
    ministranteId: mt.ministranteId,
    tom: mt.tom,
  };
  if (temMarcadores) {
    // Insere no fim do bloco do tema escolhido (posição correta na playlist plana).
    inserirMusicaNoBlocoTema(pl, tema, novoItem);
  } else {
    pl.push(novoItem);
  }
  savePlaylists();
  renderPlaylist();
}

/**
 * Rótulo de exibição de uma versão para o popup de troca de versão do botão
 * «Adicionar à playlist» do HOME (ver `adicionarVersaoAtivaNaPlaylistHome`).
 * Mesmo critério de rótulo da barra de versões (`renderMusicaVersoesBar`):
 * ORIGINAL sem `versaoLocalId`, cópia local `c_*` ou versão do servidor.
 */
function rotuloVersaoParaPopupPlaylist(rootId, versaoLocalId) {
  const vid = versaoLocalIdTrimado(versaoLocalId);
  if (!vid) return rotuloVersaoMaiusculo('Original');
  if (ehVersaoLocalLegada(vid)) {
    const c = encontrarCopiaLocal(rootId, vid);
    if (c) return rotuloVersaoMaiusculo(formatarRotuloVersaoExibicao(c.rotulo));
    return rotuloVersaoMaiusculo('Cópia');
  }
  const versoesSrv =
    Number(versoesMusicaServidorCache.rootId) === Number(rootId)
      ? versoesMusicaServidorCache.versoes || []
      : [];
  const v = versoesSrv.find((x) => String(x.id) === vid);
  if (v) return rotuloVersaoMaiusculo(rotuloExibicaoVersaoServidor(v));
  return rotuloVersaoMaiusculo('Versão');
}

/**
 * Botão «Adicionar à playlist» da barra padrão (HOME).
 *
 * Mesma função básica do «+» da Biblioteca (`addMusicaNaPlaylist`, que esta
 * função NÃO altera nem chama por baixo dos panos além dos mesmos helpers de
 * tema/ministrante), com uma diferença: nunca pergunta qual versão adicionar —
 * usa exatamente a versão ativa no HOME, via `versaoAtivaParaCompararPlaylist()`
 * (cobre tanto cópia local quanto versão do servidor; ORIGINAL quando vazia).
 *
 * - Música ainda não presente na playlist do culto: adiciona normalmente com
 *   a versão ativa (mesma lógica de tema/ministrante do «+» da Biblioteca).
 * - Já presente com a MESMA versão: não faz nada, só avisa.
 * - Já presente com OUTRA versão: pede confirmação e, confirmando, substitui
 *   a versão da entrada já existente NO LUGAR — mesma posição, sem duplicar
 *   a música e sem tocar em tema/ministrante/tom já gravados.
 */
async function adicionarVersaoAtivaNaPlaylistHome() {
  if (!musicaAtiva || musicaAtiva.id == null) return;
  if (!cultoId) {
    alert('Selecione primeiro o dia do culto.');
    return;
  }
  const idNum = obterRootIdMusicaAtiva();
  if (!Number.isFinite(idNum)) return;
  const bancoFonte = fonteBancoNormalizada(musicaBancoFonte);
  /* Fonte da verdade da versão ativa no HOME — a MESMA já usada para comparar
     a música ativa com a playlist (`playlistItemMesmaVersaoQueAtiva`). NUNCA
     usar `musicaVersaoLocalId` sozinho aqui: ele só cobre cópias locais
     (`c_*`) — para uma versão do SERVIDOR (fork) ele já vem `null` depois de
     carregada (a identidade dela mora em `musicaAtiva.id`), então lê-lo puro
     confundiria «versão do servidor selecionada» com ORIGINAL. */
  const versaoLocalId = versaoAtivaParaCompararPlaylist() || null;
  const tituloPl = musicaAtiva.titulo;
  const artistaPl = musicaAtiva.artista || '';

  const pl = getPlaylist(cultoId);
  const decisao = decidirAcaoAdicionarVersaoAtivaNaPlaylist(pl, idNum, versaoLocalId, bancoFonte);

  if (decisao.acao === ACAO_JA_PRESENTE_PLAYLIST) {
    appAlert(
      'Esta música (mesma versão e mesma origem catálogo/servidor) já está na playlist deste culto.',
      'Playlist'
    );
    return;
  }

  if (decisao.acao === ACAO_CONFIRMAR_TROCA_VERSAO_PLAYLIST) {
    const rotuloAtual = rotuloVersaoParaPopupPlaylist(idNum, decisao.item.versaoLocalId);
    const rotuloNovo = rotuloVersaoParaPopupPlaylist(idNum, versaoLocalId);
    const ok = await appConfirm(
      `Esta música já está na playlist com outra versão.\n\nAtualmente: ${rotuloAtual}\nNova versão: ${rotuloNovo}\n\nDeseja substituir a versão atual pela versão selecionada?`,
      'Playlist',
      { okLabel: 'Confirmar alteração', cancelLabel: 'Cancelar' }
    );
    if (!ok) return; // cancelou: playlist continua exatamente como estava.
    substituirVersaoItemPlaylist(decisao.item, versaoLocalId);
    savePlaylists();
    renderPlaylist();
    return;
  }

  // ACAO_ADICIONAR_PLAYLIST — música ainda não presente na playlist deste culto.
  // Daqui em diante, mesma lógica de tema/ministrante do «+» da Biblioteca
  // (`addMusicaNaPlaylist`), só que sem o prompt de versão — já resolvida acima.
  let tema;
  const temMarcadores = playlistPossuiMarcadoresTema(pl);
  if (temMarcadores) {
    const marcadores = listarMarcadoresTemaPlaylist(pl);
    if (marcadores.length === 0) {
      alert('Use o botão «Inserir tema na playlist abaixo» (seta até à linha) para adicionar um bloco de tema no fim da playlist antes de incluir músicas.');
      return;
    }
    if (marcadores.length === 1) {
      tema = marcadores[0];
    } else {
      const ultimo = obterUltimoMarcadorTema(pl);
      const opcoesTema = marcadores.map((t) => ({
        value: t,
        label: t === ultimo ? `${t} (ÚLTIMO)` : t,
      }));
      const escTema = await appEscolherOpcao(
        'Em qual tema adicionar esta música?',
        opcoesTema,
        `«${tituloPl}» será adicionada ao tema escolhido.`
      );
      if (escTema == null) return; // cancelou
      tema = normalizarTemaPlaylist(escTema);
    }
  } else {
    tema = getTemaSelecionadoAtual();
    if (!tema) {
      alert('Selecione um tema na lista e use «Inserir tema na playlist abaixo» para ativá-lo na playlist.');
      return;
    }
  }
  garantirTemaNoCatalogoAtual(tema);
  const mt = await camposMinistranteTomParaNovaMusicaNaPlaylist(cultoId, {
    id: idNum,
    titulo: tituloPl,
    bancoFonte,
  });
  const novoItemHome = {
    id: idNum,
    titulo: tituloPl,
    artista: artistaPl,
    tema,
    versaoLocalId,
    // Tags (rótulos de versão) nunca entram na playlist, seja qual for a versão escolhida.
    versaoRotulo: '',
    bancoFonte,
    ministranteId: mt.ministranteId,
    tom: mt.tom,
  };
  if (temMarcadores) {
    inserirMusicaNoBlocoTema(pl, tema, novoItemHome);
  } else {
    pl.push(novoItemHome);
  }
  savePlaylists();
  renderPlaylist();
}

/** Adiciona ao culto indicado (sem mudar o culto atualmente selecionado até `onCultoChange`). */
async function addMusicaNaPlaylistParaCulto(cid, meta) {
  if (!cid || meta == null || meta.id == null) return;
  const pl = getPlaylist(cid);
  const vid = versaoLocalIdTrimado(meta.versaoLocalId) || null;
  const bfAdd = fonteBancoItemPlaylist(meta);
  if (playlistJaContemMesmaMusicaEVersao(pl, meta.id, vid, bfAdd)) return;
  let tema = normalizarTemaPlaylist(meta.tema);
  if (playlistPossuiMarcadoresTema(pl)) {
    const ult = obterUltimoMarcadorTema(pl);
    if (ult) tema = ult;
  }
  if (tema) {
    if (!Array.isArray(temasPorCulto[cid])) temasPorCulto[cid] = [];
    temasPorCulto[cid] = normalizarListaTemas([...(temasPorCulto[cid] || []), tema]);
    saveTemasPorCulto();
  }
  const mt = await camposMinistranteTomParaNovaMusicaNaPlaylist(cid, {
    ...meta,
    id: meta.id,
    bancoFonte: bfAdd,
    titulo: meta.titulo,
  });
  pl.push({
    id: meta.id,
    titulo: meta.titulo,
    artista: meta.artista || '',
    tema,
    versaoLocalId: vid,
    // Tags (rótulos de versão) nunca entram na playlist, qualquer que seja a origem do import.
    versaoRotulo: '',
    bancoFonte: bfAdd,
    ministranteId: mt.ministranteId,
    tom: mt.tom,
  });
}

/**
 * Aplica músicas vindas do telemóvel (HTTP :3001 ou socket) nas playlists do painel.
 *
 * @param {{ musicas?: Array }} payload
 */
async function processarMusicasSincronizadasPayload(payload) {
  try {
    await carregarMusicas();
    refreshListaBanco();
  } catch (_) {
  // intencional — erro ignorado
}
  if (!payload || !Array.isArray(payload.musicas) || !payload.musicas.length) return;

  const semCulto = [];
  for (const m of payload.musicas) {
    const cid = m.cultoId != null ? String(m.cultoId).trim() : '';
    if (cid) await addMusicaNaPlaylistParaCulto(cid, m);
    else semCulto.push(m);
  }

  let mudouPlaylist = false;
  for (const m of payload.musicas) {
    const cid = m.cultoId != null ? String(m.cultoId).trim() : '';
    if (cid) mudouPlaylist = true;
  }
  if (mudouPlaylist) savePlaylists();

  const comCulto = payload.musicas.filter((m) => m.cultoId != null && String(m.cultoId).trim());
  const cids = [...new Set(comCulto.map((m) => String(m.cultoId).trim()))];
  const mainSel = document.getElementById('culto-sel');
  if (mainSel && cids.length === 1) {
    mainSel.value = cids[0];
    onCultoChange();
  } else if (mudouPlaylist) {
    renderPlaylist();
  }

  if (semCulto.length) abrirModalNovasMusicasSync({ musicas: semCulto });
}

let syncPlaylistModalPayload = null;

function preencherSyncPlaylistCultoSel() {
  const sel = document.getElementById('sync-playlist-culto-sel');
  if (!sel) return;
  sel.innerHTML = '';
  const lista = listarCultosDisponiveis();
  const vazio = document.createElement('option');
  vazio.value = '';
  vazio.textContent = 'Selecione o dia do culto...';
  sel.appendChild(vazio);
  lista.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.label;
    sel.appendChild(o);
  });
  sel.value =
    cultoId && lista.some((c) => c.id === cultoId) ? cultoId : '';
}

function abrirModalNovasMusicasSync(payload) {
  syncPlaylistModalPayload = payload && Array.isArray(payload.musicas) ? payload.musicas : [];
  const bd = document.getElementById('sync-playlist-backdrop');
  const desc = document.getElementById('sync-playlist-desc');
  const ul = document.getElementById('sync-playlist-lista');
  if (!bd || !desc || !ul) return;
  const n = syncPlaylistModalPayload.length;
  if (n === 0) return;
  desc.textContent =
    n === 1
      ? 'Uma música foi gravada no PC (sincronização do telemóvel).'
      : `${n} músicas foram gravadas no PC (sincronização do telemóvel).`;
  ul.innerHTML = '';
  syncPlaylistModalPayload.forEach((m) => {
    const li = document.createElement('li');
    li.textContent = `${m.titulo || ''}${m.artista ? ' — ' + m.artista : ''}`;
    ul.appendChild(li);
  });
  preencherSyncPlaylistCultoSel();
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
}

function fecharModalNovasMusicasSync() {
  const bd = document.getElementById('sync-playlist-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  syncPlaylistModalPayload = null;
}

function confirmarSyncPlaylistModal() {
  const sel = document.getElementById('sync-playlist-culto-sel');
  const cid = sel ? String(sel.value || '').trim() : '';
  if (!cid || !syncPlaylistModalPayload || syncPlaylistModalPayload.length === 0) {
    fecharModalNovasMusicasSync();
    return;
  }
  void (async () => {
    for (const m of syncPlaylistModalPayload) {
      await addMusicaNaPlaylistParaCulto(cid, m);
    }
    savePlaylists();
    const mainSel = document.getElementById('culto-sel');
    if (mainSel) {
      mainSel.value = cid;
      onCultoChange();
    } else {
      renderPlaylist();
    }
    fecharModalNovasMusicasSync();
  })();
}

/*
  Ícones dos menus flutuantes. Markup estático — é o que `menuFlutuante.js` aceita em
  `svg`, e a razão por que nunca pode receber texto de fora do código.
*/
const SVG_MENU_INSERIR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v9"/><path d="m9 14 3 3 3-3"/><path d="M5 21h14"/></svg>';
const SVG_MENU_EDITAR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const SVG_MENU_EXCLUIR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
// (extraído) ícone duplicar → painel/bibliotecaMusicas.js

// (extraído) ícone selecionar → painel/bibliotecaMusicas.js

/*
  Ícones do menu da linha da playlist. `ti-rotate` para repor (neutro) e `ti-x` para
  excluir (o vermelho vem da variante «perigo» do menu, não do desenho do ícone).
*/
const SVG_MENU_RESETAR_LINHA =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.95 11a8 8 0 1 0 -.5 4"/><path d="M20 20v-5h-5"/></svg>';
const SVG_MENU_EXCLUIR_LINHA =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

/*
  Menu do kebab de cada música. Um só nó reaproveitado por todas as linhas — é o que
  `menuFlutuante.js` garante — e ancorado ao ícone clicado, para nascer onde o olho já
  está em vez de num ponto fixo do painel.
*/
const menuAcoesLinhaPlaylist = criarMenuFlutuante({
  id: 'playlist-linha-ctx-menu',
  rotuloAria: 'Ações desta música',
});

/**
 * Mantém o kebab aceso enquanto o menu dele está aberto.
 *
 * O ícone só aparece no hover da linha, e para escolher uma opção o rato TEM de sair da
 * linha — o menu flutua por cima do painel. Sem esta marca, o menu ficava a apontar para
 * um botão que tinha desaparecido.
 */
function marcarLinhaPlaylistComMenuAberto(row, btn) {
  document
    .querySelectorAll('.playlist-row--menu-aberto')
    .forEach((r) => r.classList.remove('playlist-row--menu-aberto'));
  row.classList.add('playlist-row--menu-aberto');
  btn.setAttribute('aria-expanded', 'true');

  const limpar = () => {
    row.classList.remove('playlist-row--menu-aberto');
    btn.setAttribute('aria-expanded', 'false');
  };
  /* O fecho do menu é do `menuFlutuante` e não avisa ninguém; escuta-se o mesmo que ele
     escuta. O `setTimeout` deixa passar o clique que acabou de abrir isto. */
  setTimeout(() => {
    document.addEventListener('click', limpar, { once: true });
    document.addEventListener('keydown', limpar, { once: true });
  }, 0);
}

/**
 * Abre «Resetar» e «Excluir» para a música da linha, ancorado ao próprio kebab.
 *
 * São as duas únicas ações que restaram da fileira de quatro ícones: repor (limpa o tom e
 * o ministrante de toda a playlist — ver `limparMinistranteTomDeTodaPlaylist`) e excluir
 * (tira da playlist a música desta linha). Reordenar passou para a alça de arrasto à
 * esquerda da linha.
 */
function abrirMenuAcoesLinhaPlaylist(btn, row, idxPl) {
  if (!cultoId) return;
  marcarLinhaPlaylistComMenuAberto(row, btn);
  menuAcoesLinhaPlaylist.abrirNaAncora(btn, {
    itens: [
      {
        rotulo: 'Resetar',
        svg: SVG_MENU_RESETAR_LINHA,
        /* Home: repõe ministrante e tons. Slides: só limpa os checks de «já transmitida». */
        aoEscolher: () => (ehModoSlidesOperador() ? limparChecksTransmitidosDoCulto() : limparMinistranteTomDeTodaPlaylist()),
      },
      {
        rotulo: 'Excluir',
        svg: SVG_MENU_EXCLUIR_LINHA,
        variante: 'perigo',
        aoEscolher: () => removePlItem(idxPl),
      },
    ],
  });
}

const menuContextoTemaPlaylist = criarMenuFlutuante({
  id: 'playlist-tema-ctx-menu',
  rotuloAria: 'Ações do tema',
});

function fecharMenuContextoTemaPlaylist() {
  menuContextoTemaPlaylist.fechar();
}

/**
 * Abre as ações do tema numa posição fixa: junto do botão «+ Adicionar momento»,
 * alinhado à esquerda dele. Não depende do item clicado — só o conteúdo do menu muda.
 */
function abrirMenuContextoTemaPlaylist(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t) return;
  const ancora = document.getElementById('playlist-momento-add');
  if (!ancora) return;
  menuContextoTemaPlaylist.abrirNaAncora(ancora, {
    titulo: t,
    itens: [
      {
        rotulo: 'Inserir na playlist',
        svg: SVG_MENU_INSERIR,
        aoEscolher: () => inserirTemaNaPlaylistAtual(t),
      },
      {
        rotulo: 'Editar nome',
        svg: SVG_MENU_EDITAR,
        aoEscolher: () => renomearTemaPeloMenuContexto(t).catch(() => {}),
      },
      {
        rotulo: 'Excluir tema',
        svg: SVG_MENU_EXCLUIR,
        variante: 'perigo',
        aoEscolher: () => excluirTemaPeloMenuContexto(t).catch(() => {}),
      },
    ],
  });
  menuContextoTemaPlaylist.node.querySelector('button')?.focus();
}

/* «+ Adicionar momento»: menu com os temas do catálogo + «Novo momento…». Substitui o antigo
   bloco «TEMA NA PLAYLIST» (seletor + «Inserir» + «+»). Botão direito num tema abre as ações
   de sempre (inserir, editar nome, excluir). */
const menuMomentoPlaylist = criarMenuFlutuante({
  id: 'playlist-momento-menu',
  rotuloAria: 'Adicionar momento',
  aoFechar: () => document.getElementById('playlist-momento-add')?.setAttribute('aria-expanded', 'false'),
});

async function criarNovoMomentoPlaylist() {
  const nome = await appPrompt('Nome do novo momento:', {
    title: 'Novo momento',
    defaultValue: '',
    emptyMsg: 'Digite um nome para o momento.',
  });
  if (!nome) return;
  garantirTemaNoCatalogoAtual(nome);
  renderSeletorTemasPlaylist();
  inserirTemaNaPlaylistAtual(nome);
}

function abrirMenuMomentoPlaylist() {
  const btn = document.getElementById('playlist-momento-add');
  if (!btn) return;
  const temas = obterTemasDisponiveisPlaylist();
  const itens = temas.map((t) => {
    const jaNaPlaylist = playlistAtualJaTemTema(t);
    return {
      rotulo: t,
      desabilitado: jaNaPlaylist,
      dica: jaNaPlaylist
        ? `O tema «${t}» já está na playlist deste culto`
        : 'Inserir este tema no fim da playlist; novas músicas entram neste bloco',
      aoEscolher: () => inserirTemaNaPlaylistAtual(t),
      // «⋯» visível e focável: abre as ações do tema (inserir, editar nome, excluir).
      acao: { rotulo: `Ações do tema ${t}`, aoEscolher: () => abrirMenuContextoTemaPlaylist(t) },
      // Atalho adicional: botão direito no item.
      aoContexto: () => {
        menuMomentoPlaylist.fechar();
        abrirMenuContextoTemaPlaylist(t);
      },
    };
  });
  itens.push({
    rotulo: 'Novo momento…',
    separadorAntes: temas.length > 0,
    aoEscolher: () => criarNovoMomentoPlaylist(),
  });
  menuMomentoPlaylist.abrirNaAncora(btn, { itens }, { acima: true, larguraDaAncora: true });
  btn.setAttribute('aria-expanded', 'true');
  menuMomentoPlaylist.node.querySelector('button:not(:disabled)')?.focus();
}

function configurarMenuMomentoPlaylist() {
  const btn = document.getElementById('playlist-momento-add');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    // Sem isto o clique chegaria ao handler global do menu, que o fecharia logo após abrir.
    e.stopPropagation();
    if (menuMomentoPlaylist.estaAberto()) {
      menuMomentoPlaylist.fechar();
      return;
    }
    fecharOutrosSeletoresDropdown(btn);
    abrirMenuMomentoPlaylist();
  });
  // Esc com o foco dentro do menu: devolve o foco ao botão que o abriu (o menu fecha em seguida).
  menuMomentoPlaylist.node.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') btn.focus();
  });
  menuContextoTemaPlaylist.node.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') btn.focus();
  });
}

/** Insere o tema no fim da playlist do culto; novas músicas passam a entrar nesse bloco. */
function inserirTemaNaPlaylistAtual(tema) {
  if (!cultoId) {
    appAlert('Selecione primeiro o dia do culto para inserir o tema na playlist.', 'Inserir tema');
    return;
  }
  const t = normalizarTemaPlaylist(tema);
  if (!t) {
    appAlert('Escolha um tema na lista antes de «Inserir».', 'Inserir tema');
    return;
  }
  if (playlistAtualJaTemTema(t)) {
    appAlert(`O tema «${t}» já está na playlist deste culto.`, 'Inserir tema');
    return;
  }
  if (t === TEMA_PADRAO_ABERTURA) desmarcarAberturaRemovidaPeloUsuario(cultoId);
  const pl = getPlaylist(cultoId);
  pl.push({ tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema: t });
  garantirTemaNoCatalogoAtual(t);
  setTemaSelecionadoAtual(t);
  savePlaylists();
  renderSeletorTemasPlaylist();
  renderPlaylist();
}

/* O catálogo de temas é global (`temasPorCulto.__global__`), por isso criar, renomear e
   excluir funcionam sem culto selecionado. Só «Inserir» precisa de um culto aberto. */
async function renomearTemaPeloMenuContexto(tema) {
  const atual = normalizarTemaPlaylist(tema);
  if (!atual) return;
  const novo = await appPrompt('Novo nome do tema:', {
    title: 'Editar nome do tema',
    defaultValue: atual,
    emptyMsg: 'Digite o novo nome do tema.',
  });
  if (!novo || novo === atual) return;
  if (!renomearTemaNoCulto(atual, novo)) return;
  renderSeletorTemasPlaylist();
  renderPlaylist();
}

async function excluirTemaPeloMenuContexto(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t) return;
  const ok = await appConfirm(
    cultoId
      ? `Excluir o tema «${t}»? Todas as músicas inseridas nesse tema serão removidas da playlist deste culto.`
      : `Excluir o tema «${t}»? Ele sai da lista de temas disponíveis.`,
    'Excluir tema'
  );
  if (!ok) return;
  excluirTemaDoCulto(t);
  renderSeletorTemasPlaylist();
  renderPlaylist();
}

function configurarSeletorTemaPlaylist() {
  // O seletor de ministrante tem guarda própria; não depende de nenhum elemento de tema.
  configurarSeletorMinistranteCulto();
}

/** Ações da playlist que não dependem do bloco de temas (compartilhar, importar, copiar nomes). */
function configurarAcoesPlaylist() {
  document.getElementById('playlist-compartilhar-btn')?.addEventListener('click', compartilharPlaylist);
  document.getElementById('playlist-importar-btn')?.addEventListener('click', importarPlaylist);
  document.getElementById('playlist-copiar-nomes-btn')?.addEventListener('click', () => {
    copiarNomesMusicasPlaylist().catch(() => {});
  });
}

function configurarModalSyncPlaylist() {
  document.getElementById('playlist-sync-btn')?.addEventListener('click', () => {
    solicitarSincronizacaoManualBanco().catch(() => {});
  });
  document.getElementById('sync-playlist-dismiss')?.addEventListener('click', () => fecharModalNovasMusicasSync());
  document.getElementById('sync-playlist-confirm')?.addEventListener('click', () => confirmarSyncPlaylistModal());
}

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

function juntarEstrofesParaLetraCompleta() {
  if (!musicaAtiva?.estrofes) return '';
  return musicaAtiva.estrofes
    .map((s) => String(s ?? '').replace(/\r\n/g, '\n').replace(/\s+$/, ''))
    .join('\n\n');
}

/** Converte o texto do painel «letra completa» de volta em estrofes (mesma regra de linhas vazias do resto do sistema). */
function splitTextoLetraCompletaEmEstrofes(texto) {
  return splitTextoEmEstrofesPorLinhaVaziaStrict(texto);
}

/**
 * Divisórias entre estrofes no modo «letra completa».
 *
 * Um `<textarea>` desenha apenas texto puro, portanto as linhas não podem ser filhas dele.
 * A alternativa seria trocá-lo por blocos `contenteditable`, o que sacrificaria o histórico
 * de desfazer nativo, o IME e a colagem sanitizada. Em vez disso desenha-se numa camada por
 * baixo, e o textarea — que continua a ser a única fonte de verdade — fica transparente.
 *
 * Para saber onde cai cada linha em branco (que pode estar deslocada por quebras suaves de
 * linhas longas), o texto é reproduzido num espelho invisível que copia as métricas
 * tipográficas do textarea em tempo de execução, via `getComputedStyle`. Copiar em vez de
 * duplicar valores no CSS evita que as guias se desalinhem se a tipografia do painel mudar.
 *
 * Nada aqui lê ou escreve `musicaAtiva`: é estritamente decorativo.
 */
const guiasEstrofesLetraCompleta = (() => {
  /**
   * Propriedades que afetam a disposição do texto e têm de ser idênticas no espelho.
   * As larguras de borda ficam de fora de propósito: a camada `.centro-letra-completa-guias`
   * já tem uma borda transparente da mesma espessura, e o filho posicionado em absoluto
   * ancora no interior dela — copiá-las aqui contaria o desvio duas vezes.
   */
  const PROPS_METRICA = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent', 'textTransform',
    'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ];

  let espelho = null;
  let desloca = null;
  let agendado = false;
  /* Recuos e colunas laterais (número do slide / contador) vêm das variáveis --lc-* do textarea
     em home.css (grade 44px | 1fr | 72px), para CSS e JS nunca divergirem. */
  /** Estrofes da última renderização: corridas de linhas não vazias (índices de linha do textarea). */
  let estrofesRuns = [];

  function elementos() {
    const ta = document.getElementById('centro-letra-completa-ta');
    const guias = document.getElementById('centro-letra-completa-guias');
    if (!ta || !guias) return null;
    if (!desloca || desloca.parentNode !== guias) {
      guias.innerHTML = '';
      desloca = document.createElement('div');
      desloca.className = 'centro-letra-completa-guias-desloca';
      espelho = document.createElement('div');
      espelho.className = 'centro-letra-completa-espelho';
      desloca.appendChild(espelho);
      guias.appendChild(desloca);
    }
    return { ta, guias };
  }

  /**
   * Índices das linhas em branco que separam de facto duas estrofes.
   * Espelha `splitTextoEmEstrofesPorLinhaVaziaStrict`: uma corrida de vazias é
   * um único corte. A guia vai na ÚLTIMA vazia da corrida — assim um Enter no
   * fim do slide (ainda no mesmo bloco) empurra a linha para baixo, em vez de
   * a deixar colada à última frase. Dois Enters no fim (duas vazias) marcam
   * slide novo; um Enter pendurado não.
   * @param {string[]} linhas
   * @returns {number[]}
   */
  function indicesLinhasSeparadoras(linhas) {
    const idx = [];
    let viuConteudo = false;
    let inicioCorrida = -1;
    for (let i = 0; i < linhas.length; i++) {
      if (linhas[i] === '') {
        if (viuConteudo && inicioCorrida === -1) inicioCorrida = i;
        continue;
      }
      if (inicioCorrida !== -1) idx.push(i - 1);
      inicioCorrida = -1;
      viuConteudo = true;
    }
    if (inicioCorrida !== -1 && linhas.length - inicioCorrida >= 2) {
      idx.push(linhas.length - 1);
    }
    return idx;
  }

  function desenhar() {
    agendado = false;
    const els = elementos();
    if (!els) return;
    const { ta, guias } = els;
    if (!modoLetraCompletaCentral || guias.offsetParent === null) {
      if (espelho) espelho.textContent = '';
      if (desloca) {
        desloca.querySelectorAll('.centro-letra-completa-guia, [data-estrofe]').forEach((n) => n.remove());
      }
      return;
    }

    const cs = getComputedStyle(ta);
    PROPS_METRICA.forEach((p) => {
      espelho.style[p] = cs[p];
    });
    /* O fluxo contínuo com <span> vazio não gerava caixa de linha: o offsetTop
       ficava preso e as guias não acompanhavam o Enter. Cada linha do textarea
       vira um bloco — linhas longas continuam a quebrar com as mesmas métricas. */
    espelho.style.whiteSpace = 'pre-wrap';
    espelho.style.overflowWrap = 'break-word';
    espelho.style.wordBreak = 'normal';
    /* `clientWidth` já exclui a barra de deslocamento — a largura útil bate certo. */
    espelho.style.width = `${ta.clientWidth}px`;
    espelho.style.border = '0';
    desloca.style.width = `${ta.clientWidth}px`;

    const linhas = String(ta.value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');
    const separadoras = indicesLinhasSeparadoras(linhas);
    const alvo = new Set(separadoras);

    desloca.querySelectorAll('.centro-letra-completa-guia, [data-estrofe]').forEach((n) => n.remove());
    espelho.textContent = '';
    const marcas = [];
    linhas.forEach((linha, i) => {
      const row = document.createElement('div');
      row.className = 'centro-letra-completa-espelho-linha';
      /* NBSP na linha vazia: sem caractere o bloco colapsa e o offset mente. */
      row.textContent = linha === '' ? '\u00a0' : linha;
      espelho.appendChild(row);
      if (alvo.has(i)) {
        row.dataset.i = String(i);
        marcas.push(row);
      }
    });

    const alturaLinha = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    /* Linhas de largura total: recuos e larguras laterais lidos das variáveis CSS do textarea. */
    const larg = ta.clientWidth;
    const px = (nome, padrao) => {
      const v = parseFloat(cs.getPropertyValue(nome));
      return Number.isFinite(v) ? v : padrao;
    };
    const insEsq = px('--lc-ins-e', 20);
    const insDir = px('--lc-ins-d', 24);
    const alturaTotal = espelho.offsetHeight;

    /* Estrofes = corridas de linhas não vazias (a mesma regra de splitTextoEmEstrofesPorLinhaVaziaStrict). */
    estrofesRuns = [];
    let ini = -1;
    linhas.forEach((l, i) => {
      if (l === '') {
        if (ini !== -1) {
          estrofesRuns.push({ ini, fim: i - 1 });
          ini = -1;
        }
      } else if (ini === -1) ini = i;
    });
    if (ini !== -1) estrofesRuns.push({ ini, fim: linhas.length - 1 });

    /* Todas as leituras de layout do espelho primeiro, depois as escritas no DOM visual. */
    const geo = estrofesRuns.map((r) => {
      const primeira = espelho.children[r.ini];
      const ultima = espelho.children[r.fim];
      if (!primeira || !ultima) return null;
      return { topo: primeira.offsetTop };
    });
    /* Y de cada divisor (meio da linha em branco que separa), indexado pela estrofe que vem antes dele. */
    const divisorApos = [];
    const reguas = marcas.map((marca) => {
      const h = marca.offsetHeight || alturaLinha;
      const i = Number(marca.dataset.i);
      const apos = estrofesRuns.filter((r) => r.fim < i).length - 1;
      const y = Math.round(marca.offsetTop + h / 2);
      divisorApos[apos] = y;
      return { apos, y };
    });
    const frag = document.createDocumentFragment();
    geo.forEach((g, k) => {
      if (!g) return;
      /* O destaque ocupa a altura inteira da linha da estrofe: de divisor a divisor. */
      const yTopo = k === 0 ? 0 : divisorApos[k - 1] ?? g.topo - 16;
      const yBase = divisorApos[k] ?? alturaTotal;
      const fundo = document.createElement('div');
      fundo.className = 'centro-letra-completa-estrofe-fundo';
      fundo.dataset.estrofe = String(k);
      fundo.style.cssText = `top:${yTopo}px;height:${Math.max(0, yBase - yTopo)}px;left:0;width:${larg}px`;
      const num = document.createElement('span');
      num.className = 'centro-letra-completa-estrofe-num';
      num.dataset.estrofe = String(k);
      num.textContent = String(k + 1);
      num.style.cssText = `top:${Math.round(g.topo + 2)}px;left:${insEsq}px`;
      const cont = document.createElement('span');
      cont.className = 'centro-letra-completa-estrofe-cont';
      cont.dataset.estrofe = String(k);
      cont.textContent = `${estrofesRuns[k].fim - estrofesRuns[k].ini + 1} linhas`;
      cont.style.cssText = `top:${g.topo}px;height:${alturaLinha}px;right:${insDir}px`;
      frag.append(fundo, num, cont);
    });
    reguas.forEach(({ apos, y }) => {
      const regua = document.createElement('div');
      regua.className = 'centro-letra-completa-guia';
      regua.dataset.apos = String(apos);
      regua.style.top = `${y}px`;
      regua.style.left = '0';
      regua.style.width = `${larg}px`;
      regua.style.right = 'auto';
      frag.appendChild(regua);
    });
    desloca.appendChild(frag);

    desloca.style.transform = `translateY(${-ta.scrollTop}px)`;
    atualizarAtiva();
  }

  /** Estrofe que contém o cursor (só com o textarea em foco): destaque dourado, sem tocar no texto. */
  function atualizarAtiva() {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (!ta || !desloca) return;
    let ativa = -1;
    if (document.activeElement === ta && estrofesRuns.length) {
      const pos = ta.selectionStart ?? 0;
      let linha = 0;
      const v = ta.value;
      for (let p = v.indexOf(String.fromCharCode(10)); p !== -1 && p < pos; p = v.indexOf(String.fromCharCode(10), p + 1)) linha++;
      ativa = estrofesRuns.findIndex((r) => linha >= r.ini && linha <= r.fim);
    }
    desloca.querySelectorAll('[data-estrofe]').forEach((el) => {
      el.classList.toggle('ativa', Number(el.dataset.estrofe) === ativa);
    });
    /* O divisor logo abaixo da estrofe ativa some, para não duplicar linhas com o destaque. */
    desloca.querySelectorAll('.centro-letra-completa-guia').forEach((g) => {
      g.classList.toggle('oculta', Number(g.dataset.apos) === ativa);
    });
  }

  function sincronizarDeslocamento() {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (!ta || !desloca) return;
    desloca.style.transform = `translateY(${-ta.scrollTop}px)`;
  }

  /** Recalcula na próxima pintura (agrupa rajadas de `input`). */
  function agendar() {
    if (agendado) return;
    agendado = true;
    const pintar = () => {
      desenhar();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        pintar();
        /* O Enter pode mostrar a barra de deslocamento só no frame seguinte. */
        requestAnimationFrame(pintar);
      });
    } else setTimeout(pintar, 0);
  }

  function ligar() {
    const els = elementos();
    if (!els) return;
    const { ta } = els;
    if (ta.dataset.guiasLigadas === '1') {
      agendar();
      return;
    }
    ta.dataset.guiasLigadas = '1';
    ta.addEventListener('input', agendar);
    ta.addEventListener('keyup', agendar);
    ta.addEventListener('paste', agendar);
    ta.addEventListener('cut', agendar);
    ta.addEventListener('scroll', sincronizarDeslocamento, { passive: true });
    ta.addEventListener('focus', atualizarAtiva);
    ta.addEventListener('blur', atualizarAtiva);
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === ta) atualizarAtiva();
    });
    /* A métrica muda quando a fonte (Poppins) termina de carregar: remede tudo. */
    if (document.fonts) {
      document.fonts.addEventListener('loadingdone', agendar);
      document.fonts.ready.then(agendar);
    }
    window.addEventListener('resize', agendar);
    if (typeof ResizeObserver === 'function') {
      /* Recalcula se a caixa mudar de tamanho (redimensionar a janela / o painel). */
      new ResizeObserver(agendar).observe(ta);
    }
    agendar();
  }

  return { ligar, agendar };
})();

function atualizarTextoPainelLetraCompleta() {
  const ta = document.getElementById('centro-letra-completa-ta');
  if (!ta || !musicaAtiva?.estrofes) return;
  if (!modoLetraCompletaCentral) return;
  const novo = juntarEstrofesParaLetraCompleta();
  if (ta.value === novo) return;
  ta.value = novo;
  guiasEstrofesLetraCompleta.agendar();
}

/**
 * @param {{ preencherTextarea?: boolean }} opts — Se true, preenche o textarea a partir de `musicaAtiva.estrofes` (ex.: ao abrir o modo). Se false, só ajusta visibilidade (não apaga o que o utilizador está a editar).
 */
function aplicarLayoutModoLetraCompleta(opts = {}) {
  const preencherTextarea = opts.preencherTextarea === true;
  const ed = document.getElementById('estrofes-slide-editor');
  const full = document.getElementById('centro-letra-completa-wrap');
  if (!ed || !full) return;
  if (!musicaAtiva) {
    modoLetraCompletaCentral = false;
    snapshotLetraCompleta = null;
    full.hidden = true;
    ed.style.display = '';
    /* Sem música não há o que comparar — o painel comparativo também sai. */
    if (modoComparativoCentral) {
      modoComparativoCentral = false;
      comparativoLados = null;
      snapshotComparativo = null;
      aplicarLayoutModoComparativo();
    }
    return;
  }
  const on = modoLetraCompletaCentral;
  full.hidden = !on;
  ed.style.display = on ? 'none' : '';
  if (on && preencherTextarea) atualizarTextoPainelLetraCompleta();
  /* As guias só medem com o painel visível — (re)calcular sempre que ele alterna. */
  if (on) guiasEstrofesLetraCompleta.ligar();
  else guiasEstrofesLetraCompleta.agendar();
  /* O MODO COMPARATIVO tem painel próprio e manda no layout enquanto estiver
     activo — nem os cartões por slide nem a letra completa podem reaparecer. */
  if (modoComparativoCentral) {
    ed.style.display = 'none';
    full.hidden = true;
  }
}

/** Grava o conteúdo do textarea de letra completa em `musicaAtiva.estrofes` e atualiza faixa/previews. */
function sincronizarEstrofesDesdeTextareaLetraCompleta() {
  if (!musicaAtiva) return;
  const ta = document.getElementById('centro-letra-completa-ta');
  if (!ta) return;
  const novas = splitTextoLetraCompletaEmEstrofes(ta.value);
  musicaAtiva.estrofes = novas;
  const n = novas.length;
  const idxPreto = n;
  if (estrofeAtiva > idxPreto) estrofeAtiva = idxPreto;
  if (estrofeAtiva < -1) estrofeAtiva = -1;
  renderSlidesStrip();
  atualizarPreviewOperador();
  renderEstrofesEditor();
  marcacaoEstrofeEditor();
  if (
    projecaoMusicaEmitidaNoServidor &&
    projecao.pronta() &&
    estrofeAtiva >= 0 &&
    estrofeAtiva < n
  ) {
    projecao.enviar('exibir_musica', montarPayloadExibirMusica(estrofeAtiva));
  }
}

function normalizarEstrofesParaCmp(arr) {
  return (arr || []).map((s) => String(s ?? '').replace(/\r\n/g, '\n'));
}

function estrofesArraysIguaisParaEdicao(a, b) {
  const aa = normalizarEstrofesParaCmp(a);
  const bb = normalizarEstrofesParaCmp(b);
  if (aa.length !== bb.length) return false;
  return aa.every((s, i) => s === bb[i]);
}

/** Estrofes atuais do editor por slides (textareas) ou de `musicaAtiva`. */
function obterEstrofesAtuaisDaEdicao() {
  if (!musicaAtiva) return [];
  if (modoEdicaoEstrofes) {
    const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
    if (tas.length) {
      const novas = [];
      for (const ta of tas) novas.push(...splitTextoEmEstrofesPorLinhaVaziaStrict(ta.value));
      return novas.length ? novas : [''];
    }
  }
  if (modoLetraCompletaCentral) {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (ta) return splitTextoLetraCompletaEmEstrofes(ta.value);
  }
  return (musicaAtiva.estrofes || []).map((s) => String(s ?? ''));
}

function letraCompletaSujaVsSnapshot() {
  if (!modoLetraCompletaCentral || !snapshotLetraCompleta) return false;
  const ta = document.getElementById('centro-letra-completa-ta');
  if (!ta) return false;
  return !estrofesArraysIguaisParaEdicao(
    splitTextoLetraCompletaEmEstrofes(ta.value),
    snapshotLetraCompleta.estrofes
  );
}

function edicaoEstrofesSujaVsSnapshot() {
  if (!modoEdicaoEstrofes || !musicaAtiva || !snapshotEdicaoEstrofes) return false;
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  const titulo = et ? et.value : String(musicaAtiva.titulo || '');
  const artista = ea ? ea.value : String(musicaAtiva.artista || '');
  if (titulo !== String(snapshotEdicaoEstrofes.titulo || '')) return true;
  if (artista !== String(snapshotEdicaoEstrofes.artista || '')) return true;
  return !estrofesArraysIguaisParaEdicao(obterEstrofesAtuaisDaEdicao(), snapshotEdicaoEstrofes.estrofes);
}

function temEdicaoMusicaNaoGravada() {
  if (metadadosMusicaSujosNaHome()) return true;
  if (edicaoEstrofesSujaVsSnapshot()) return true;
  if (letraCompletaSujaVsSnapshot()) return true;
  if (comparativoSujoVsSnapshot()) return true;
  return false;
}

function limparFlagsModoEdicaoMusica() {
  homeLayout?.closeMetadata();
  snapshotEdicaoEstrofes = null;
  modoEdicaoEstrofes = false;
  snapshotLetraCompleta = null;
  modoLetraCompletaCentral = false;
  modoComparativoCentral = false;
  comparativoLados = null;
  snapshotComparativo = null;
  aplicarLayoutModoComparativo();
  aplicarLayoutModoLetraCompleta();
}

/**
 * Se houver edições só em memória, pede confirmação antes de trocar de música/contexto.
 * @param {string} [mensagem]
 * @param {string} [titulo]
 * @param {{ manterLetraCompleta?: boolean }} [opts] — Clique na Biblioteca/Playlist no
 *   Home: não sai da letra corrida (evita montar a grade só para a esconder de novo).
 * @returns {Promise<boolean>} true para prosseguir (descartando ou sem sujo).
 */
async function confirmarProsseguirDescartandoEdicaoPendente(mensagem, titulo, opts) {
  const manterLetra = !!(opts && opts.manterLetraCompleta);
  if (!temEdicaoMusicaNaoGravada()) {
    if (modoEdicaoEstrofes || modoLetraCompletaCentral || modoComparativoCentral) {
      if (manterLetra && modoLetraCompletaCentral && !modoEdicaoEstrofes && !modoComparativoCentral) {
        snapshotLetraCompleta = null;
        return true;
      }
      limparFlagsModoEdicaoMusica();
    }
    return true;
  }
  const ok = await appConfirm(
    mensagem || 'Há alterações não gravadas nesta sessão. Descartar e continuar?',
    titulo || 'Alterações não gravadas'
  );
  if (!ok) return false;
  if (manterLetra) {
    snapshotEdicaoEstrofes = null;
    modoEdicaoEstrofes = false;
    snapshotLetraCompleta = null;
    modoComparativoCentral = false;
    comparativoLados = null;
    snapshotComparativo = null;
    aplicarLayoutModoComparativo();
    aplicarLayoutModoLetraCompleta();
  } else {
    limparFlagsModoEdicaoMusica();
  }
  return true;
}

/** Entra no modo letra completa (o mesmo do botão da barra). Salvar/cancelar continua a sair para a grade.
 *  Se já estiver neste modo, só atualiza o texto da música atual. */
function entrarModoLetraCompletaCentral() {
  if (!musicaAtiva) return;
  modoLetraCompletaCentral = true;
  letraCompletaEditando = false; // abre sempre em visualização
  aplicarLayoutModoLetraCompleta({ preencherTextarea: true });
  /* Snapshot do texto já no painel — o ida-e-volta juntar/partir não conta como sujo. */
  const ta = document.getElementById('centro-letra-completa-ta');
  snapshotLetraCompleta = {
    estrofes: ta
      ? splitTextoLetraCompletaEmEstrofes(ta.value)
      : musicaAtiva.estrofes.map((s) => String(s ?? '')),
    estrofeAtiva,
  };
  sincronizarFlagCaixaLetrasComTextoAtual();
  atualizarToolbarModoEdicao();
}

async function alternarModoLetraCompletaCentral() {
  if (!musicaAtiva) return;
  if (modoLetraCompletaCentral) {
    const suja = letraCompletaSujaVsSnapshot() || metadadosMusicaSujosNaHome();
    // Captura titulo/artista dos inputs ANTES da sincronizacao: renderEstrofesEditor()
    // (chamado dentro da sync) sobrescreve os inputs com musicaAtiva.titulo/artista,
    // apagando as edicoes do usuario antes de persistirMusicaAtivaNoServidor() le-las.
    const _etLC = document.getElementById('edit-titulo');
    const _eaLC = document.getElementById('edit-artista');
    if (_etLC) musicaAtiva.titulo = _etLC.value;
    if (_eaLC) musicaAtiva.artista = _eaLC.value;
    sincronizarEstrofesDesdeTextareaLetraCompleta();
    if (suja) {
      if (musicaBancoFonte === 'catalog') {
        await appAlert(
          'Música do catálogo: as alterações ficam só nesta sessão. Importe para o seu banco para gravar de forma permanente.',
          'Catálogo'
        );
      } else {
        const ok = await persistirMusicaAtivaNoServidor();
        if (!ok) return;
        // Persistência já recarrega a música e limpa os modos; reforça layout.
        limparFlagsModoEdicaoMusica();
        // Na Home, gravar volta à visualização da letra completa (não à grade).
        if (homeLayout?.isHome() && musicaAtiva) entrarModoLetraCompletaCentral();
        atualizarToolbarModoEdicao();
        return;
      }
    }
    if (homeLayout?.isHome()) {
      // Sem alteração (ou catálogo): sai da edição e continua na visualização.
      letraCompletaEditando = false;
      atualizarToolbarModoEdicao();
      return;
    }
    sairDoModoLetraCompletaParaGrade();
    return;
  }
  entrarModoLetraCompletaCentral();
}

/** Transição partilhada de volta à grade de slides (destino de Salvar, Cancelar e Grade/Slide). */
function sairDoModoLetraCompletaParaGrade() {
  snapshotLetraCompleta = null;
  modoLetraCompletaCentral = false;
  aplicarLayoutModoLetraCompleta();
  renderEstrofesEditor();
  if (ehModoSlidesOperador()) renderSlidesStrip();
  atualizarToolbarModoEdicao();
}

/** Sai do modo letra completa sem aplicar o textarea — restaura o estado de quando entrou. */
function cancelarModoLetraCompletaCentral() {
  if (!modoLetraCompletaCentral) return;
  if (snapshotLetraCompleta && musicaAtiva) {
    musicaAtiva.estrofes = snapshotLetraCompleta.estrofes.map((s) => String(s));
    estrofeAtiva = snapshotLetraCompleta.estrofeAtiva;
    const n = musicaAtiva.estrofes.length;
    const idxPreto = n;
    if (estrofeAtiva > idxPreto) estrofeAtiva = idxPreto;
    if (estrofeAtiva < -1) estrofeAtiva = -1;
    renderSlidesStrip();
    atualizarPreviewOperador();
    renderEstrofesEditor();
    marcacaoEstrofeEditor();
    if (
      projecaoMusicaEmitidaNoServidor &&
      projecao.pronta() &&
      estrofeAtiva >= 0 &&
      estrofeAtiva < n
    ) {
      projecao.enviar('exibir_musica', montarPayloadExibirMusica(estrofeAtiva));
    }
  }
  sairDoModoLetraCompletaParaGrade();
}

/**
 * «Cancelar» da barra padrão, quando clicado na Letra Completa: descarta o texto
 * digitado (volta ao snapshot de quando o modo abriu) mas PERMANECE na Letra
 * Completa — ao contrário de `cancelarModoLetraCompletaCentral`, não troca de
 * tela. Trocar de tela é responsabilidade só do botão «Grade/Slide»
 * (`irParaGradeSlidesDesdeLetraCompleta` / `alternarModoLetraCompletaOuVoltarGrade`);
 * «Cancelar» aqui é só desfazer a alteração pendente, no mesmo lugar.
 */
function descartarEdicaoLetraCompletaSemSair() {
  if (!modoLetraCompletaCentral || !snapshotLetraCompleta || !musicaAtiva) return;
  musicaAtiva.estrofes = snapshotLetraCompleta.estrofes.map((s) => String(s));
  estrofeAtiva = snapshotLetraCompleta.estrofeAtiva;
  const n = musicaAtiva.estrofes.length;
  const idxPreto = n;
  if (estrofeAtiva > idxPreto) estrofeAtiva = idxPreto;
  if (estrofeAtiva < -1) estrofeAtiva = -1;
  atualizarTextoPainelLetraCompleta();
  guiasEstrofesLetraCompleta.agendar();
  renderSlidesStrip();
  atualizarPreviewOperador();
  if (
    projecaoMusicaEmitidaNoServidor &&
    projecao.pronta() &&
    estrofeAtiva >= 0 &&
    estrofeAtiva < n
  ) {
    projecao.enviar('exibir_musica', montarPayloadExibirMusica(estrofeAtiva));
  }
  /* Conteúdo já bate com o snapshot outra vez — Salvar/Cancelar voltam a ficar
     desabilitados, mas o modo (Letra Completa) continua o mesmo. */
  atualizarToolbarModoEdicao();
}

/**
 * Atalho de navegação: volta à grade sem gravar.
 * Reutiliza o mesmo destino de Cancelar. Se a letra estiver suja, pede confirmação
 * (o Cancelar desta barra descarta em silêncio; o Cancelar do modo edição por
 * slides já avisa — o mesmo cuidado aplica-se aqui).
 */
async function irParaGradeSlidesDesdeLetraCompleta() {
  if (!modoLetraCompletaCentral) return;
  if (letraCompletaSujaVsSnapshot()) {
    const ok = await appConfirm(
      'Há alterações não gravadas. Descartar e voltar à grade de slides? Use «Salvar alterações» para gravar no banco.',
      'Voltar à grade'
    );
    if (!ok) return;
  }
  cancelarModoLetraCompletaCentral();
}

/**
 * Botão único de alternância Grade/Slide ⇄ Letra completa, do menu padrão.
 *
 * Puramente navegação — quem salva é sempre «Salvar alterações»
 * (`acionarSalvarAlteracoesBarraPadrao`), nunca este botão. Por isso, ao sair da
 * letra completa por aqui, reaproveita-se `irParaGradeSlidesDesdeLetraCompleta`
 * (o mesmo destino do antigo botão «Grade/Slide»: pergunta antes de descartar
 * se houver algo por gravar) e não `alternarModoLetraCompletaCentral` (que
 * gravava ao sair).
 */
async function alternarModoLetraCompletaOuVoltarGrade() {
  if (!musicaAtiva) return;
  if (!(await sairModoComparativoParaTrocarModo())) return;
  if (modoLetraCompletaCentral) {
    await irParaGradeSlidesDesdeLetraCompleta();
  } else {
    entrarModoLetraCompletaCentral();
  }
}

function atualizarToolbarModoLetraCompleta() {
  const btn = document.getElementById('btn-modo-letra-completa');
  /* Visualização = somente leitura. No layout antigo (sem Home) o texto continua editável direto. */
  const taLC = document.getElementById('centro-letra-completa-ta');
  if (taLC) taLC.readOnly = !!homeLayout?.isHome() && !(modoLetraCompletaCentral && letraCompletaEditando);
  if (!btn) return;
  const m = !!musicaAtiva;
  btn.style.display = m ? '' : 'none';
  btn.disabled = !m;
  /* Só o rótulo e o ícone mudam — não sobrescrever o botão inteiro (`textContent`
     apagaria o SVG). O texto reflete sempre o modo PARA ONDE o clique leva. */
  const txtModo = document.getElementById('txt-modo-letra-completa');
  const icoModo = document.getElementById('ico-modo-letra-completa');
  // Na Home o botão é só «Letra Completa» (a grade tem botão próprio): ícone fixo.
  const noHome = !!homeLayout?.isHome();
  if (txtModo) txtModo.textContent = modoLetraCompletaCentral && !noHome ? 'Grade/Slide' : 'Letra Completa';
  if (icoModo && !noHome) {
    icoModo.innerHTML = modoLetraCompletaCentral
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/></svg>';
  }
  // Toggle explícito: inativo = outline neutro, ativo (= modo actualmente aberto) = preenchido.
  btn.setAttribute('aria-pressed', modoLetraCompletaCentral ? 'true' : 'false');
  btn.classList.toggle('ativo', modoLetraCompletaCentral);
  btn.title = modoLetraCompletaCentral
    ? 'Volta aos cartões por slide sem gravar. Se houver alterações, pede confirmação.'
    : 'Editar ou copiar a letra inteira num só texto';
}

/* ==========================================================================
 * MODO COMPARATIVO — duas versões da mesma música lado a lado
 * ==========================================================================
 * Painel próprio (`#centro-comparativo-wrap`), estado próprio
 * (`modoComparativoCentral` / `comparativoLados` / `snapshotComparativo`) e
 * gravação própria, por `id` de versão. Nada aqui escreve em `musicaAtiva`
 * durante a edição: os outros modos da coluna central continuam exactamente
 * como eram.
 *
 * O visual segue o MODO LETRA COMPLETA — mesma caixa, mesma tipografia — e os
 * realces usam o mesmo truque das divisórias daquele modo: como um `<textarea>`
 * só desenha texto puro, os fundos coloridos vivem numa camada por baixo, num
 * espelho que copia as métricas tipográficas do textarea em tempo de execução.
 * ========================================================================== */

/** Rótulo de exibição de uma versão na coluna e no seletor. */
function rotuloVersaoComparativo(v, rootId) {
  if (!v) return '';
  const ehOriginal = v.parent_id == null && Number(v.id) === Number(rootId);
  if (ehOriginal) return 'Original';
  const rotulo = String(v.rotulo || '').trim();
  return formatarRotuloVersaoExibicao(rotulo, v.origem_importacao);
}

function comparativoTextarea(lado) {
  return document.getElementById(`comparativo-ta-${lado}`);
}

/**
 * Camada de realces das duas colunas.
 *
 * Estritamente decorativa: lê o texto dos dois textareas, calcula as diferenças
 * com `compararLetras` e pinta os fundos. Não escreve em lado nenhum do estado
 * da aplicação.
 */
const realcesComparativo = (() => {
  /**
   * Propriedades que afectam a disposição do texto e têm de ser idênticas no
   * espelho. As larguras de borda ficam de fora de propósito — a camada
   * `.centro-comparativo-realces` já tem uma borda transparente da mesma
   * espessura, e contá-las aqui duplicaria o desvio.
   */
  const PROPS_METRICA = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent', 'textTransform',
    'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ];

  const LADOS = ['a', 'b'];
  const partes = { a: null, b: null };
  let agendado = false;

  function elementos(lado) {
    const ta = comparativoTextarea(lado);
    const camada = document.getElementById(`comparativo-realces-${lado}`);
    if (!ta || !camada) return null;
    let ref = partes[lado];
    if (!ref || ref.desloca.parentNode !== camada) {
      camada.innerHTML = '';
      const desloca = document.createElement('div');
      desloca.className = 'centro-comparativo-realces-desloca';
      const espelho = document.createElement('div');
      espelho.className = 'centro-comparativo-espelho';
      desloca.appendChild(espelho);
      camada.appendChild(desloca);
      ref = { desloca, espelho };
      partes[lado] = ref;
    }
    return { ta, camada, ...ref };
  }

  /**
   * Reproduz as marcas de uma coluna no espelho, uma LINHA por bloco. Cada linha do textarea
   * vira um <div>: assim o fundo da linha ocupa a largura inteira (a barra lateral fica na
   * borda do painel) sem mudar a posição do texto — o recuo é compensado com margem negativa
   * + padding iguais (variáveis --cmp-pl/--cmp-pr, copiadas do textarea em `desenhar`).
   */
  function pintar(espelho, marcas) {
    espelho.textContent = '';
    marcas.forEach((m) => {
      const linha = document.createElement('div');
      linha.className = 'cmp-row';
      if (m.tipo === 'igual') {
        /* NBSP na linha vazia: sem caractere o bloco colapsaria e as linhas desalinhariam. */
        linha.textContent = m.texto ? m.texto : '\u00a0';
        espelho.appendChild(linha);
        return;
      }
      linha.classList.add('cmp-linha', m.tipo === 'exclusiva' ? 'cmp-linha--exclusiva' : 'cmp-linha--alterada');
      if (!m.texto) {
        linha.textContent = '\u00a0';
      } else if (m.tipo === 'alterada') {
        m.partes.forEach((p) => {
          if (!p.txt) return;
          if (!p.mudou) {
            linha.appendChild(document.createTextNode(p.txt));
            return;
          }
          const palavra = document.createElement('span');
          palavra.className = 'cmp-palavra';
          palavra.textContent = p.txt;
          linha.appendChild(palavra);
        });
      } else {
        linha.textContent = m.texto;
      }
      espelho.appendChild(linha);
    });
  }

  /** Resumo em chips (uma contagem por chip, sem chip com zero) + legenda só quando há diferenças. */
  function atualizarRodape(resultado) {
    const resumo = document.getElementById('comparativo-resumo');
    const legenda = document.getElementById('comparativo-legenda');
    if (resumo) {
      resumo.classList.toggle('igual', !!resultado.iguais);
      resumo.textContent = '';
      const chip = (texto, check) => {
        const el = document.createElement('span');
        el.className = 'cmp-chip';
        if (check) {
          el.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
        }
        el.appendChild(document.createTextNode(texto));
        resumo.appendChild(el);
      };
      if (resultado.iguais) {
        chip('Versões idênticas', true);
      } else {
        const { alteradas, exclusivasA, exclusivasB } = resultado.totais;
        if (alteradas) chip(`${alteradas} ${alteradas === 1 ? 'linha alterada' : 'linhas alteradas'}`);
        if (exclusivasA) chip(`${exclusivasA} só à esquerda`);
        if (exclusivasB) chip(`${exclusivasB} só à direita`);
        if (!alteradas && !exclusivasA && !exclusivasB) chip('Diferenças apenas em espaços');
      }
    }
    if (legenda) legenda.hidden = !!resultado.iguais;
  }

  function desenhar() {
    agendado = false;
    const refA = elementos('a');
    const refB = elementos('b');
    if (!refA || !refB) return;

    if (!modoComparativoCentral || refA.camada.offsetParent === null) {
      refA.espelho.textContent = '';
      refB.espelho.textContent = '';
      return;
    }

    const resultado = compararLetras(refA.ta.value, refB.ta.value);
    const marcas = { a: resultado.linhasA, b: resultado.linhasB };

    for (const lado of LADOS) {
      const ref = lado === 'a' ? refA : refB;
      const cs = getComputedStyle(ref.ta);
      PROPS_METRICA.forEach((p) => {
        ref.espelho.style[p] = cs[p];
      });
      /* `clientWidth` já exclui a barra de deslocamento — largura útil certa. */
      ref.espelho.style.width = `${ref.ta.clientWidth}px`;
      ref.espelho.style.border = '0';
      /* As linhas do espelho são blocos que sangram até as bordas do painel. */
      ref.espelho.style.setProperty('--cmp-pl', cs.paddingLeft);
      ref.espelho.style.setProperty('--cmp-pr', cs.paddingRight);
      ref.desloca.style.width = `${ref.ta.clientWidth}px`;
      /* Iguais: espelho vazio. É o requisito de não marcar nada nesse caso. */
      pintar(ref.espelho, resultado.iguais ? [] : marcas[lado]);
      ref.desloca.style.transform = `translateY(${-ref.ta.scrollTop}px)`;
    }

    atualizarRodape(resultado);
  }

  function sincronizarDeslocamento(lado) {
    const ref = partes[lado];
    const ta = comparativoTextarea(lado);
    if (!ref || !ta) return;
    ref.desloca.style.transform = `translateY(${-ta.scrollTop}px)`;
  }

  /** Recalcula na próxima pintura (agrupa rajadas de `input`). */
  function agendar() {
    if (agendado) return;
    agendado = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(desenhar);
    else setTimeout(desenhar, 0);
  }

  function ligar() {
    for (const lado of LADOS) {
      const ref = elementos(lado);
      if (!ref) continue;
      const { ta } = ref;
      if (ta.dataset.realcesLigados === '1') continue;
      ta.dataset.realcesLigados = '1';
      ta.addEventListener('input', agendar);
      /* «Salvar alterações» da barra padrão precisa saber, a cada tecla, se algum
         dos lados já diverge do snapshot — não só quando o modo abre/fecha. */
      ta.addEventListener('input', atualizarBotoesSalvarCancelarBarraPadrao);
      ta.addEventListener('scroll', () => sincronizarDeslocamento(lado), { passive: true });
      if (typeof ResizeObserver === 'function') new ResizeObserver(agendar).observe(ta);
    }
    window.addEventListener('resize', agendar);
    /* A métrica muda quando a fonte da letra termina de carregar: remede os realces. */
    if (document.fonts && !ligar._fonts) {
      ligar._fonts = true;
      document.fonts.addEventListener('loadingdone', agendar);
      document.fonts.ready.then(agendar);
    }
    agendar();
  }

  function limpar() {
    for (const lado of LADOS) {
      const ref = partes[lado];
      if (ref) ref.espelho.textContent = '';
    }
    const resumo = document.getElementById('comparativo-resumo');
    if (resumo) resumo.textContent = '';
    const legenda = document.getElementById('comparativo-legenda');
    if (legenda) legenda.hidden = true;
  }

  return { ligar, agendar, limpar };
})();

/**
 * Reduz a lista de versões do Comparativo ao mesmo critério já usado em
 * Versões (`opcoesVersaoDistintasPorConteudo`, em `playlistVersaoMusica.js`):
 * quando a Original e uma Cópia têm conteúdo rigorosamente idêntico, só a
 * Cópia fica na lista — ela toma o lugar da Original (mesma posição). Não
 * recria o critério aqui; só adapta as versões cruas do servidor para o
 * formato `{ value, conteudo }` que aquela função espera e devolve o mesmo
 * objeto de versão de volta.
 */
function versoesDistintasParaComparativo(versoes, rootId) {
  const lista = Array.isArray(versoes) ? versoes : [];
  const opcoes = lista.map((v) => {
    const ehOriginal = !!v && v.parent_id == null && Number(v.id) === Number(rootId);
    return {
      value: ehOriginal ? VALOR_OPCAO_VERSAO_ORIGINAL : String(v.id),
      conteudo: v,
      _versao: v,
    };
  });
  return opcoesVersaoDistintasPorConteudo(opcoes).map((op) => op._versao);
}

/**
 * Versões do servidor comparáveis (original + cópias) da música carregada.
 *
 * `totalVersoesBrutas` é a contagem ANTES da redução por conteúdo (quantas
 * versões existem mesmo no banco) — quem chama precisa dela para distinguir
 * «só existe uma versão» de «existem várias, mas todas idênticas entre si».
 */
async function carregarVersoesParaComparativo() {
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) return { rootId: null, versoes: [], totalVersoesBrutas: 0 };
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${rootId}/versoes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rootIdResolvido = Number(data.rootId) || rootId;
    const versoesBrutas = Array.isArray(data.versoes) ? data.versoes : [];
    const versoes = versoesDistintasParaComparativo(versoesBrutas, rootIdResolvido);
    return { rootId: rootIdResolvido, versoes, totalVersoesBrutas: versoesBrutas.length };
  } catch (_) {
    return { rootId, versoes: [], totalVersoesBrutas: 0 };
  }
}

/**
 * Pergunta que duas versões comparar.
 *
 * Reutiliza o `app-dialog` padrão (e o `appEscolhaResolver`, para que Escape
 * continue a cancelar). Clique no escuro não fecha. Resolve `{ idA, idB }` ou `null`.
 */
function escolherVersoesParaComparar(versoes, rootId) {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  const dialog = ov?.querySelector('.app-dialog');
  if (!ov || !body || !head || !ok || !cancel) return Promise.resolve(null);

  return new Promise((resolve) => {
    appDialogEstado.escolhaResolver = resolve;
    head.textContent = 'Comparar versões';
    body.innerHTML = '';
    dialog?.classList.add('app-dialog--cmp-escolha');

    const wrap = document.createElement('div');
    wrap.className = 'cmp-escolha-form';

    const det = document.createElement('p');
    det.className = 'cmp-escolha-intro';
    det.textContent = 'Escolha as duas versões que quer ver lado a lado.';
    wrap.appendChild(det);

    /**
     * A coluna avisa a OUTRA (via `aoSelecionar`) sempre que o usuário escolhe
     * uma versão; a outra reage cinzando/desabilitando o botão da mesma versão
     * na sua própria lista (`atualizarIndisponivel`), para impedir comparar uma
     * versão com ela mesma. Nunca mexe na própria seleção da coluna — só na
     * disponibilidade dos botões que representam a versão escolhida do lado de lá.
     */
    const criarColuna = (rotulo) => {
      let selecionado = null;
      let notificarOutraColuna = () => {};
      const botoesPorId = new Map();
      const col = document.createElement('div');
      col.className = 'cmp-escolha-col';

      const titulo = document.createElement('div');
      titulo.className = 'cmp-escolha-col-titulo';
      titulo.textContent = versoes.length > 1 ? `${rotulo} (${versoes.length})` : rotulo;

      const hint = document.createElement('p');
      hint.className = 'cmp-escolha-col-hint';
      hint.textContent = 'Nenhuma versão selecionada';

      const lista = document.createElement('div');
      lista.className = 'cmp-escolha-lista';
      lista.setAttribute('role', 'listbox');

      versoes.forEach((v) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cmp-escolha-opcao';
        btn.setAttribute('role', 'option');
        btn.textContent = rotuloVersaoComparativo(v, rootId);
        btn.onclick = () => {
          lista.querySelectorAll('.cmp-escolha-opcao').forEach((b) => {
            b.classList.remove('ativo');
            b.setAttribute('aria-selected', 'false');
          });
          btn.classList.add('ativo');
          btn.setAttribute('aria-selected', 'true');
          selecionado = Number(v.id);
          col.classList.remove('cmp-escolha-col--pendente');
          hint.textContent = `Selecionada: ${rotuloVersaoComparativo(v, rootId)}`;
          hint.classList.add('cmp-escolha-col-hint--ok');
          erro.textContent = '';
          btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          notificarOutraColuna(selecionado);
        };
        botoesPorId.set(Number(v.id), btn);
        lista.appendChild(btn);
      });

      col.appendChild(titulo);
      if (versoes.length > 4) {
        const nota = document.createElement('p');
        nota.className = 'cmp-escolha-col-nota';
        nota.textContent = 'Role a lista para ver todas as versões.';
        col.appendChild(nota);
      }
      col.appendChild(hint);
      col.appendChild(lista);
      return {
        col,
        getId: () => selecionado,
        marcarPendente: () => col.classList.add('cmp-escolha-col--pendente'),
        /** Chamado pela OUTRA coluna quando sua seleção muda (ou é `null`). */
        atualizarIndisponivel(idUsadoNaOutraColuna) {
          botoesPorId.forEach((btn, id) => {
            const indisponivel = idUsadoNaOutraColuna != null && id === idUsadoNaOutraColuna;
            btn.disabled = indisponivel;
            btn.classList.toggle('cmp-escolha-opcao--indisponivel', indisponivel);
          });
        },
        /** Define quem avisar quando o usuário escolher algo nesta coluna. */
        aoSelecionar(fn) {
          notificarOutraColuna = fn;
        },
      };
    };

    const colA = criarColuna('Versão à esquerda');
    const colB = criarColuna('Versão à direita');
    colA.aoSelecionar((id) => colB.atualizarIndisponivel(id));
    colB.aoSelecionar((id) => colA.atualizarIndisponivel(id));
    wrap.appendChild(colA.col);
    wrap.appendChild(colB.col);

    const erro = document.createElement('div');
    erro.className = 'cmp-escolha-erro';
    wrap.appendChild(erro);
    body.appendChild(wrap);

    const finish = (v) => {
      if (!appDialogEstado.escolhaResolver) return;
      const r = appDialogEstado.escolhaResolver;
      appDialogEstado.escolhaResolver = null;
      body.innerHTML = '';
      dialog?.classList.remove('app-dialog--cmp-escolha');
      ok.style.display = '';
      ov.classList.remove('aberto');
      ov.hidden = true;
      r(v);
    };

    ok.style.display = '';
    ok.textContent = 'Comparar';
    ok.onclick = () => {
      let pendente = false;
      const idA = colA.getId();
      const idB = colB.getId();
      if (!Number.isFinite(idA)) {
        colA.marcarPendente();
        pendente = true;
      }
      if (!Number.isFinite(idB)) {
        colB.marcarPendente();
        pendente = true;
      }
      if (pendente) {
        erro.textContent = 'Escolha as duas versões.';
        return;
      }
      if (idA === idB) {
        erro.textContent = 'Escolha duas versões diferentes.';
        return;
      }
      finish({ idA, idB });
    };
    cancel.style.display = '';
    cancel.textContent = 'Cancelar';
    cancel.onclick = () => finish(null);

    ov.hidden = false;
    ov.classList.add('aberto');
    appDialogEstado.fecharNoBackdrop = true;
  });
}

/** Carrega uma versão do servidor no formato usado pelas colunas. */
async function carregarLadoComparativo(id) {
  const res = await fetch(`${getControllerApiBase()}/api/musicas/${Number(id)}`);
  if (!res.ok) throw new Error(`Falha ao carregar a versão (HTTP ${res.status}).`);
  const v = await res.json();
  if (!v || !Array.isArray(v.estrofes)) throw new Error('Resposta inválida do controlador.');
  return {
    id: Number(v.id),
    titulo: String(v.titulo || ''),
    artista: String(v.artista || ''),
    estrofes: v.estrofes.map((s) => String(s ?? '')),
    rootId: Number(v.root_id ?? v.id),
    imutavel: Number(v.is_immutable) === 1,
    rotulo: String(v.rotulo || ''),
  };
}

/** Junta estrofes num texto único, com a mesma regra do modo letra completa. */
function juntarEstrofesParaComparativo(estrofes) {
  return (estrofes || [])
    .map((s) => String(s ?? '').replace(/\r\n/g, '\n').replace(/\s+$/, ''))
    .join('\n\n');
}

function preencherPainelComparativo() {
  if (!comparativoLados) return;
  for (const lado of ['a', 'b']) {
    const dados = comparativoLados[lado];
    const ta = comparativoTextarea(lado);
    const rotulo = document.getElementById(`comparativo-rotulo-${lado}`);
    const selo = document.getElementById(`comparativo-selo-${lado}`);
    if (ta) ta.value = juntarEstrofesParaComparativo(dados.estrofes);
    if (rotulo) rotulo.textContent = dados.rotuloExibicao;
    if (selo) {
      selo.hidden = !dados.imutavel;
      selo.title = dados.imutavel
        ? 'O ORIGINAL nunca é alterado: gravar mudanças deste lado cria uma cópia nova.'
        : '';
    }
  }
}

/** Estrofes actuais de um lado, lidas do textarea. */
function estrofesLadoComparativo(lado) {
  const ta = comparativoTextarea(lado);
  if (!ta) return [];
  return splitTextoLetraCompletaEmEstrofes(ta.value);
}

function comparativoSujoVsSnapshot() {
  if (!modoComparativoCentral || !snapshotComparativo) return false;
  return ['a', 'b'].some(
    (lado) => !estrofesArraysIguaisParaEdicao(estrofesLadoComparativo(lado), snapshotComparativo[lado])
  );
}

/**
 * Visibilidade do painel comparativo.
 *
 * Enquanto está activo manda no layout da coluna central: esconde tanto os
 * cartões por slide como o painel de letra completa.
 */
function aplicarLayoutModoComparativo() {
  const wrap = document.getElementById('centro-comparativo-wrap');
  if (!wrap) return;
  if (!musicaAtiva) {
    modoComparativoCentral = false;
    comparativoLados = null;
    snapshotComparativo = null;
  }
  const on = modoComparativoCentral;
  wrap.hidden = !on;
  if (on) {
    const ed = document.getElementById('estrofes-slide-editor');
    const full = document.getElementById('centro-letra-completa-wrap');
    if (ed) ed.style.display = 'none';
    if (full) full.hidden = true;
    realcesComparativo.ligar();
  } else {
    realcesComparativo.limpar();
  }
}

/** Abre o modo, perguntando antes que duas versões comparar. */
async function abrirModoComparativo() {
  if (!musicaAtiva) return;
  if (musicaBancoFonte === 'catalog') {
    await appAlert(
      'Música do catálogo: não há versões para comparar. Importe-a para o seu banco primeiro.',
      'Modo comparativo'
    );
    return;
  }
  if (
    !(await confirmarProsseguirDescartandoEdicaoPendente(
      'Há alterações não gravadas nesta sessão. Descartar e abrir o modo comparativo?',
      'Alterações não gravadas'
    ))
  ) {
    return;
  }

  const { rootId, versoes, totalVersoesBrutas } = await carregarVersoesParaComparativo();
  if (versoes.length < 2) {
    /* Só uma versão no banco: falta o que criar para comparar. Duas ou mais,
       mas reduzidas a uma só por serem rigorosamente idênticas (mesmo critério
       de `opcoesVersaoDistintasPorConteudo`): já existem versões — só não há
       diferença entre elas. */
    await appAlert(
      totalVersoesBrutas > 1
        ? 'Todas as versões desta música são idênticas. Não há diferenças para comparar.'
        : 'Esta música tem só uma versão no banco. Crie uma cópia (chip «Nova versão») para poder comparar.',
      'Modo comparativo'
    );
    return;
  }

  const escolha = await escolherVersoesParaComparar(versoes, rootId);
  if (!escolha) return;

  try {
    const [a, b] = await Promise.all([
      carregarLadoComparativo(escolha.idA),
      carregarLadoComparativo(escolha.idB),
    ]);
    const acharVersao = (id) => versoes.find((v) => Number(v.id) === Number(id)) || null;
    a.rotuloExibicao = rotuloVersaoComparativo(acharVersao(a.id) || { ...a, parent_id: a.imutavel ? null : 1 }, rootId);
    b.rotuloExibicao = rotuloVersaoComparativo(acharVersao(b.id) || { ...b, parent_id: b.imutavel ? null : 1 }, rootId);
    comparativoLados = { a, b };
    snapshotComparativo = {
      a: a.estrofes.map((s) => String(s)),
      b: b.estrofes.map((s) => String(s)),
    };
    modoComparativoCentral = true;
    aplicarLayoutModoComparativo();
    preencherPainelComparativo();
    realcesComparativo.agendar();
    atualizarToolbarModoEdicao();
  } catch (e) {
    comparativoLados = null;
    snapshotComparativo = null;
    modoComparativoCentral = false;
    aplicarLayoutModoComparativo();
    await appAlert(e?.message || 'Não foi possível abrir o modo comparativo.', 'Modo comparativo');
  }
}

/** Fecha o painel e devolve a coluna central ao estado anterior. */
function fecharModoComparativo() {
  modoComparativoCentral = false;
  comparativoLados = null;
  snapshotComparativo = null;
  aplicarLayoutModoComparativo();
  /* Devolve os cartões por slide (ou o painel de letra completa, se estivesse aberto). */
  aplicarLayoutModoLetraCompleta();
  atualizarToolbarModoEdicao();
}

/**
 * Grava os lados que mudaram, um pedido por versão.
 *
 * Gravar sobre o ORIGINAL não o altera: o servidor bifurca e cria uma cópia
 * nova (`forked`), que é exactamente a protecção que se quer. O utilizador é
 * avisado quando isso acontece.
 */
async function salvarComparativoNoServidor() {
  if (!modoComparativoCentral || !comparativoLados || !snapshotComparativo) return false;
  const api = getControllerApiBase();
  const bifurcados = [];
  const gravados = [];

  for (const lado of ['a', 'b']) {
    const dados = comparativoLados[lado];
    const estrofes = estrofesLadoComparativo(lado);
    if (estrofesArraysIguaisParaEdicao(estrofes, snapshotComparativo[lado])) continue;
    if (!estrofes.length || estrofes.every((s) => !String(s).trim())) {
      await appAlert(
        `A versão «${dados.rotuloExibicao}» ficou sem nenhuma estrofe. Escreva ao menos uma linha antes de gravar.`,
        'Modo comparativo'
      );
      return false;
    }
    try {
      const res = await fetch(`${api}/api/musicas/${dados.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: dados.titulo, artista: dados.artista, estrofes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || `Erro HTTP ${res.status}`);
      gravados.push(dados.id);
      if (data.forked) bifurcados.push({ rotulo: dados.rotuloExibicao, id: Number(data.id) });
    } catch (e) {
      await appAlert(
        `Não foi possível gravar a versão «${dados.rotuloExibicao}»: ${e?.message || e}`,
        'Modo comparativo'
      );
      return false;
    }
  }

  if (!gravados.length) return true;

  await carregarMusicas();
  const rootId = obterRootIdMusicaAtiva();
  if (Number.isFinite(rootId)) await carregarVersoesMusicaServidor(rootId);
  /* Se um dos lados era a versão aberta no editor, recarrega-a para os cartões
     e a pré-visualização mostrarem o texto novo. */
  if (musicaAtiva && gravados.some((id) => Number(id) === Number(musicaAtiva.id))) {
    await recarregarMusicaAtivaDoServidor();
  }

  if (bifurcados.length) {
    const lista = bifurcados.map((b) => `«${b.rotulo}»`).join(' e ');
    await appAlert(
      `O ORIGINAL não é alterado: as mudanças em ${lista} foram gravadas numa cópia nova, visível na barra de versões.`,
      'Original preservado'
    );
  }
  return true;
}

/** Recarrega `musicaAtiva` do servidor mantendo o slide seleccionado. */
async function recarregarMusicaAtivaDoServidor() {
  if (!musicaAtiva || musicaAtiva.id == null) return;
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${Number(musicaAtiva.id)}`);
    if (!res.ok) return;
    const nova = await res.json();
    if (!nova || !Array.isArray(nova.estrofes)) return;
    musicaAtiva = nova;
    musicaRootId = Number(nova.root_id ?? nova.id);
    const n = musicaAtiva.estrofes.length;
    if (estrofeAtiva > n) estrofeAtiva = n;
    if (estrofeAtiva < -1) estrofeAtiva = -1;
    renderSlidesStrip();
    renderEstrofesEditor();
    atualizarPreviewOperador();
    marcacaoEstrofeEditor();
  } catch (_) {
    // intencional — a gravação já foi feita; o painel recarrega na próxima seleção
  }
}

/**
 * Botão da barra: abre o modo (escolher as duas versões a comparar).
 *
 * Puramente navegação, como o toggle da letra completa — enquanto o modo está
 * activo o botão fica desabilitado (ver `atualizarToolbarModoComparativo`) e
 * quem grava ou descarta é sempre «Salvar alterações» / «Cancelar» da barra
 * padrão (`acionarSalvarAlteracoesBarraPadrao` / `acionarCancelarBarraPadrao`).
 */
async function alternarModoComparativoCentral() {
  if (!musicaAtiva) return;
  if (modoComparativoCentral) {
    await cancelarModoComparativoCentral();
    return;
  }
  await abrirModoComparativo();
}

/**
 * Sai do comparativo antes de trocar para outro modo (pede confirmação se houver
 * alterações). Devolve true quando o comparativo já não está activo.
 */
async function sairModoComparativoParaTrocarModo() {
  if (!modoComparativoCentral) return true;
  await cancelarModoComparativoCentral();
  return !modoComparativoCentral;
}

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

/** Por linha: 1.ª letra maiúscula, restante minúsculas (preserva espaços à esquerda). */
function textoEstrofeCaixaSentenca(texto) {
  return String(texto ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => {
      const m = line.match(/^(\s*)(.*)$/);
      if (!m) return line;
      const corpo = m[2];
      if (!corpo) return line;
      return m[1] + corpo.charAt(0).toLocaleUpperCase('pt-BR') + corpo.slice(1).toLocaleLowerCase('pt-BR');
    })
    .join('\n');
}

function textoEstrofeCaixaMaiuscula(texto) {
  return String(texto ?? '').toLocaleUpperCase('pt-BR');
}

function aplicarCaixaLetrasAoTexto(texto) {
  return caixaLetrasEdicaoMaiuscula
    ? textoEstrofeCaixaMaiuscula(texto)
    : textoEstrofeCaixaSentenca(texto);
}

/** true se o texto já está todo em maiúsculas (e tem letras com caixa). */
function textoEstaTodoEmMaiusculas(texto) {
  const s = String(texto ?? '');
  if (!s) return false;
  if (s !== textoEstrofeCaixaMaiuscula(s)) return false;
  return s !== s.toLocaleLowerCase('pt-BR');
}

function obterTextosEstrofesEmEdicao() {
  if (modoLetraCompletaCentral) {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (ta) return [ta.value];
  }
  if (modoEdicaoEstrofes) {
    const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
    if (tas.length) return tas.map((ta) => ta.value);
  }
  return Array.isArray(musicaAtiva?.estrofes)
    ? musicaAtiva.estrofes.map((s) => String(s ?? ''))
    : [];
}

function estrofesEmEdicaoEstaoEmMaiusculas() {
  return textoEstaTodoEmMaiusculas(obterTextosEstrofesEmEdicao().join('\n'));
}

/** Alinha o botão aA ao que a letra já tem (evita 1.º clique no-op em letras MAIÚSCULAS). */
function sincronizarFlagCaixaLetrasComTextoAtual() {
  caixaLetrasEdicaoMaiuscula = estrofesEmEdicaoEstaoEmMaiusculas();
}

function aplicarValorTextareaPreservandoSelecao(ta, novo) {
  if (!ta || ta.value === novo) return false;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  ta.value = novo;
  try {
    ta.setSelectionRange(start, end);
  } catch (_) {
    /* ignore */
  }
  return true;
}

/** Força MAIÚSCULAS no textarea preservando o cursor (só no modo aA activo). */
function forcarMaiusculasNoTextareaSeAtivo(ta) {
  if (!caixaLetrasEdicaoMaiuscula || !ta) return;
  aplicarValorTextareaPreservandoSelecao(ta, textoEstrofeCaixaMaiuscula(ta.value));
}

/**
 * Aplica a caixa actual nos textareas já montados — sem reconstruir os cartões.
 * Faixa e prévias já mostram maiúsculas; um rebuild só fazia os slides tremerem.
 */
function aplicarCaixaLetrasNasEstrofesEmEdicao() {
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes)) return;
  let alterou = false;
  if (modoLetraCompletaCentral) {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (ta) {
      const novo = aplicarCaixaLetrasAoTexto(ta.value);
      if (aplicarValorTextareaPreservandoSelecao(ta, novo)) alterou = true;
      const novas = splitTextoLetraCompletaEmEstrofes(ta.value);
      if (
        novas.length !== musicaAtiva.estrofes.length ||
        novas.some((s, i) => s !== musicaAtiva.estrofes[i])
      ) {
        musicaAtiva.estrofes = novas;
        alterou = true;
      }
      if (typeof guiasEstrofesLetraCompleta?.agendar === 'function') {
        guiasEstrofesLetraCompleta.agendar();
      }
    }
  } else if (modoEdicaoEstrofes) {
    const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
    if (tas.length === musicaAtiva.estrofes.length) {
      tas.forEach((ta) => {
        const idx = parseInt(ta.dataset.i, 10);
        const novo = aplicarCaixaLetrasAoTexto(ta.value);
        if (Number.isFinite(idx) && musicaAtiva.estrofes[idx] != null && musicaAtiva.estrofes[idx] !== novo) {
          musicaAtiva.estrofes[idx] = novo;
          alterou = true;
        }
        if (aplicarValorTextareaPreservandoSelecao(ta, novo)) {
          alterou = true;
          aplicarAlturaCardEstrofe(ta.closest('.estrofe-slide-edit'));
        }
      });
    } else {
      const novas = musicaAtiva.estrofes.map((s) => aplicarCaixaLetrasAoTexto(s));
      alterou = novas.some((s, i) => s !== musicaAtiva.estrofes[i]);
      musicaAtiva.estrofes = novas;
      renderEstrofesEditor();
    }
  }
  if (!alterou) return;
  const grid = document.getElementById('slides-grid');
  if (grid && musicaAtiva.estrofes) {
    grid.dataset.stripDigest = digestEstrofesParaStripFaixa(musicaAtiva.estrofes);
  }
  if (projecaoMusicaEmitidaNoServidor && projecao.pronta() && estrofeAtiva >= 0) {
    emitirEstrofeAoServidor(estrofeAtiva);
  }
}

function alternarCaixaLetrasEdicao() {
  if (!musicaAtiva || (!modoEdicaoEstrofes && !modoLetraCompletaCentral)) return;
  if (modoEdicaoEstrofes && !modoLetraCompletaCentral) {
    /* Sincroniza textareas abertos antes de transformar. */
    document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta').forEach((ta) => {
      const idx = parseInt(ta.dataset.i, 10);
      if (Number.isFinite(idx) && musicaAtiva.estrofes[idx] != null) {
        musicaAtiva.estrofes[idx] = ta.value;
      }
    });
  }
  /* Converte para o oposto do que o texto já é — o flag arrancava em false,
     então o 1.º clique só re-renderizava letras que já estavam em MAIÚSCULAS. */
  caixaLetrasEdicaoMaiuscula = !estrofesEmEdicaoEstaoEmMaiusculas();
  aplicarCaixaLetrasNasEstrofesEmEdicao();
  atualizarToolbarCaixaLetrasEdicao();
}

function configurarCamposMetadadosMusicaHome() {
  const atualizar = () => atualizarToolbarModoEdicao();
  document.getElementById('edit-titulo')?.addEventListener('input', atualizar);
  document.getElementById('edit-artista')?.addEventListener('input', atualizar);
  const taFull = document.getElementById('centro-letra-completa-ta');
  if (taFull && taFull.dataset.caixaLetrasLigada !== '1') {
    taFull.dataset.caixaLetrasLigada = '1';
    taFull.addEventListener('input', () => {
      if (!modoLetraCompletaCentral) return;
      forcarMaiusculasNoTextareaSeAtivo(taFull);
      if (typeof guiasEstrofesLetraCompleta?.agendar === 'function') {
        guiasEstrofesLetraCompleta.agendar();
      }
      atualizarToolbarModoLetraCompleta();
      /* «Salvar alterações» da barra padrão precisa saber, a cada tecla, se o
         conteúdo já diverge do snapshot — não só quando o modo abre/fecha. */
      atualizarBotoesSalvarCancelarBarraPadrao();
    });
  }
  const btnCaixa = document.getElementById('btn-caixa-letras-edicao');
  if (btnCaixa && btnCaixa.dataset.caixaLetrasCfg !== '1') {
    btnCaixa.dataset.caixaLetrasCfg = '1';
    /* Evita blur do textarea no mousedown (rebuild dos cartões roubava o 1.º clique). */
    btnCaixa.addEventListener('mousedown', (e) => e.preventDefault());
  }
}

function entrarModoEdicao() {
  if (!musicaAtiva) return;
  if (modoLetraCompletaCentral) {
    sincronizarEstrofesDesdeTextareaLetraCompleta();
    snapshotLetraCompleta = null;
    modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
  }
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (et) musicaAtiva.titulo = et.value;
  if (ea) musicaAtiva.artista = ea.value;
  snapshotEdicaoEstrofes = {
    titulo: musicaAtiva.titulo,
    artista: musicaAtiva.artista || '',
    estrofes: musicaAtiva.estrofes.map((s) => String(s ?? '')),
    estrofeAtiva,
  };
  modoEdicaoEstrofes = true;
  sincronizarFlagCaixaLetrasComTextoAtual();
  renderEstrofesEditor();
}

async function sairModoEdicao() {
  if (edicaoEstrofesSujaVsSnapshot()) {
    const ok = await appConfirm(
      'Há alterações não gravadas. Descartar e sair do modo edição? Use «Salvar alterações» para gravar no banco.',
      'Encerrar edição'
    );
    if (!ok) return;
  }
  if (snapshotEdicaoEstrofes && musicaAtiva && modoEdicaoEstrofes) {
    musicaAtiva.titulo = snapshotEdicaoEstrofes.titulo;
    musicaAtiva.artista = snapshotEdicaoEstrofes.artista;
    musicaAtiva.estrofes = snapshotEdicaoEstrofes.estrofes.map((s) => String(s));
    estrofeAtiva = snapshotEdicaoEstrofes.estrofeAtiva;
    const n = musicaAtiva.estrofes.length;
    const idxPreto = n;
    if (estrofeAtiva > idxPreto) estrofeAtiva = idxPreto;
    if (estrofeAtiva < -1) estrofeAtiva = -1;
  }
  snapshotEdicaoEstrofes = null;
  modoEdicaoEstrofes = false;
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();
}

/**
 * Altura mínima da área de texto de um slide, medida a partir da fonte actual do elemento.
 * Home: 4 linhas (+ o respiro inferior que mantém a alça de redimensionar dentro do cartão);
 * layout antigo: 5 linhas, como sempre.
 */
function alturaMinimaTextoEstrofePx(el) {
  const home = document.body.classList.contains('home-layout-v2');
  const linhas = home ? 4 : 5;
  if (!el) return linhas * 13 * 1.55;
  const cs = getComputedStyle(el);
  const fs = parseFloat(cs.fontSize) || 13;
  const lhRaw = cs.lineHeight;
  let lhPx;
  if (!lhRaw || lhRaw === 'normal') {
    lhPx = fs * 1.55;
  } else if (lhRaw.endsWith('px')) {
    lhPx = parseFloat(lhRaw);
  } else {
    const ratio = parseFloat(lhRaw);
    lhPx = Number.isFinite(ratio) ? ratio * fs : fs * 1.55;
  }
  const respiro = home ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 0;
  return linhas * lhPx + respiro;
}

/** Guarda o tamanho que o usuário arrastou na alça, para respeitá-lo até o conteúdo exigir mais. */
function observarRedimensionamentoManualTextareaEstrofe(ta) {
  if (ta.dataset.alturaManualLigada === '1') return;
  ta.dataset.alturaManualLigada = '1';
  ta.addEventListener('pointerup', () => {
    const h = ta.offsetHeight;
    if (Math.abs(h - (ta._alturaAuto || 0)) > 2) ta._alturaManual = h;
  });
}

/**
 * Auto-grow em lote: primeiro todas as escritas (`height:auto`), depois todas as leituras
 * (`scrollHeight`), depois as escritas finais — um único reflow, mesmo com muitos slides.
 * Overflow escondido (sem barra interna) e altura nunca menor que o conteúdo.
 */
function aplicarAlturasTextareasEstrofes(tas) {
  const lista = tas.filter((ta) => ta && ta.classList.contains('estrofe-slide-ta'));
  if (!lista.length) return;
  const minH = alturaMinimaTextoEstrofePx(lista[0]);
  lista.forEach((ta) => {
    observarRedimensionamentoManualTextareaEstrofe(ta);
    ta.style.maxHeight = 'none';
    ta.style.minHeight = minH + 'px';
    ta.style.overflow = 'hidden';
    ta.style.height = 'auto';
  });
  const alturas = lista.map((ta) => Math.max(minH, ta.scrollHeight, ta._alturaManual || 0));
  lista.forEach((ta, i) => {
    ta.style.height = alturas[i] + 'px';
    ta._alturaAuto = alturas[i];
  });
  // Os cartões crescerem pode fazer a grade ganhar barra de rolagem e estreitar as colunas:
  // as quebras de linha mudam. Confere (um reflow) e corrige o que ainda estiver cortado.
  for (let passo = 0; passo < 3; passo++) {
    const faltam = lista.filter((ta) => ta.scrollHeight > ta.clientHeight + 1);
    if (!faltam.length) break;
    faltam.forEach((ta) => {
      ta.style.height = 'auto';
    });
    const novas = faltam.map((ta) => Math.max(minH, ta.scrollHeight, ta._alturaManual || 0));
    faltam.forEach((ta, i) => {
      ta.style.height = novas[i] + 'px';
      ta._alturaAuto = novas[i];
    });
  }
}

/**
 * Modo edição: altura mínima fixa de linhas; cresce e encolhe com o conteúdo.
 * Modo exibição: só CSS — `.estrofe-slide-view-body` em fluxo, sem altura fixa em JS.
 */
function aplicarAlturaTextareaEstrofe(ta) {
  if (!ta || !ta.classList.contains('estrofe-slide-ta')) return;
  aplicarAlturasTextareasEstrofes([ta]);
  // Segunda passagem após o layout/fontes assentarem (quebras de linha podem mudar a altura).
  requestAnimationFrame(() => requestAnimationFrame(() => aplicarAlturasTextareasEstrofes([ta])));
}

function aplicarAlturaCardEstrofe(cardEl) {
  if (!cardEl) return;
  const ta = cardEl.querySelector('.estrofe-slide-ta');
  if (ta) aplicarAlturaTextareaEstrofe(ta);
}

/**
 * Texto do slide no modo exibição: a 1.ª linha lógica vai num <span> para ganhar peso 600
 * (`::first-line` pegaria só a 1.ª linha visual quando o texto quebra). O texto em si —
 * `textContent`, quebras de linha, contagem de linhas — fica exatamente o mesmo.
 */
function definirTextoCorpoSlide(body, txt) {
  const t = String(txt ?? '');
  body.textContent = '';
  const i = t.indexOf('\n');
  const primeira = document.createElement('span');
  primeira.className = 'estrofe-primeira-linha';
  primeira.textContent = i < 0 ? t : t.slice(0, i);
  body.appendChild(primeira);
  if (i >= 0) body.appendChild(document.createTextNode(t.slice(i)));
}

function reaplicarAlturasEstrofesEditor() {
  const wrap = document.getElementById('estrofes-slide-editor');
  if (!wrap || !musicaAtiva || !musicaAtiva.estrofes) return;
  aplicarAlturasTextareasEstrofes([...wrap.querySelectorAll('textarea.estrofe-slide-ta')]);
}

/* O scrollHeight muda quando a fonte do slide (Poppins) termina de carregar: recalcula as alturas. */
if (document.fonts) {
  document.fonts.addEventListener('loadingdone', () => reaplicarAlturasEstrofesEditor());
  document.fonts.ready.then(() => reaplicarAlturasEstrofesEditor());
}

/**
 * Actualiza o texto dos cartões já montados, sem os destruir.
 * Devolve false quando a grelha não bate (contagem ou estrutura) e precisa de rebuild.
 */
function atualizarEstrofesEditorInPlace() {
  const wrap = document.getElementById('estrofes-slide-editor');
  if (!wrap || !musicaAtiva || !Array.isArray(musicaAtiva.estrofes)) return false;
  const cards = [...wrap.querySelectorAll('.estrofe-slide-edit')];
  const n = musicaAtiva.estrofes.length;
  if (cards.length !== n) return false;
  if (modoEdicaoEstrofes) {
    for (let i = 0; i < n; i++) {
      const ta = cards[i].querySelector('.estrofe-slide-ta');
      if (!ta) return false;
      const txt = String(musicaAtiva.estrofes[i] ?? '');
      if (ta.value !== txt) {
        ta.value = txt;
        aplicarAlturaCardEstrofe(cards[i]);
      }
      cards[i].classList.toggle('ativa', estrofeAtiva === i);
    }
    return true;
  }
  for (let i = 0; i < n; i++) {
    const body = cards[i].querySelector('.estrofe-slide-view-body');
    if (!body) return false;
    const txt = String(musicaAtiva.estrofes[i] ?? '');
    if (body.textContent !== txt) definirTextoCorpoSlide(body, txt);
    cards[i].classList.toggle('ativa', estrofeAtiva === i);
  }
  return true;
}

function reorderEstrofesIndices(from, to) {
  if (!musicaAtiva || !modoEdicaoEstrofes) return;
  const arr = musicaAtiva.estrofes;
  const n = arr.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;

  const snapAtiva =
    estrofeAtiva >= 0 && estrofeAtiva < n ? arr[estrofeAtiva] : null;

  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);

  if (snapAtiva !== null) {
    const idx = arr.indexOf(snapAtiva);
    estrofeAtiva = idx >= 0 ? idx : Math.max(0, Math.min(estrofeAtiva, arr.length - 1));
  }

  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();
}

function renderEstrofesEditor() {
  const wrap = document.getElementById('estrofes-slide-editor');

  if (!musicaAtiva) {
    modoEdicaoEstrofes = false;
    snapshotEdicaoEstrofes = null;
    modoLetraCompletaCentral = false;
    wrap.classList.remove('estrofes-modo-edicao');
    wrap.classList.add('estrofes-slide-editor--vazio');
    atualizarToolbarModoEdicao();
    wrap.innerHTML =
      '<div class="placeholder-msg placeholder-msg--escolha-musica">Escolha uma música na playlist (à direita) ou na biblioteca (à esquerda).</div>';
    atualizarSlidesInstrucoes();
    document.getElementById('edit-titulo').value = '';
    document.getElementById('edit-artista').value = '';
    aplicarLayoutModoLetraCompleta();
    return;
  }

  document.getElementById('edit-titulo').value = musicaAtiva.titulo;
  document.getElementById('edit-artista').value = musicaAtiva.artista || '';

  wrap.classList.remove('estrofes-slide-editor--vazio');
  wrap.classList.toggle('estrofes-modo-edicao', modoEdicaoEstrofes);

  atualizarToolbarModoEdicao();

  wrap.innerHTML = '';
  musicaAtiva.estrofes.forEach((txt, i) => {
    let centralSlideTapTimer = null;
    const div = document.createElement('div');
    div.className = 'estrofe-slide-edit' + (estrofeAtiva === i ? ' ativa' : '');
    if (modoEdicaoEstrofes) {
      div.title = ehModoSlidesOperador()
        ? 'Edição · arrastar ⋮⋮ para reordenar · duplo clique fora do texto para projetar'
        : 'Edição · arrastar ⋮⋮ para reordenar';
    } else if (ehModoSlidesOperador()) {
      div.title = 'Duplo clique para projetar nas telas';
    } else {
      div.title = 'Clique para selecionar · Botão ✎ ou clique direito: edição rápida';
    }

    if (modoEdicaoEstrofes) {
      div.innerHTML = `
        <div class="estrofe-slide-toolbar">
          <div class="estrofe-slide-toolbar-left">
            <span class="estrofe-drag-handle" draggable="true" data-drag-from="${i}" title="Arrastar para reordenar">⋮⋮</span>
            <span class="estrofe-num-big">${i + 1}</span>
          </div>
          <button type="button" class="btn sm danger btn-del-estrofe" data-i="${i}" title="Remover estrofe">✕</button>
        </div>
        <textarea class="estrofe-slide-ta" data-i="${i}" spellcheck="false"></textarea>
      `;
      div.querySelector('textarea').value = txt;
      const taEst = div.querySelector('textarea');
      taEst.addEventListener('focus', () => aplicarAlturaCardEstrofe(div));
      taEst.addEventListener('input', (e) => {
        forcarMaiusculasNoTextareaSeAtivo(e.target);
        /* «Salvar alterações» da barra padrão precisa saber, a cada tecla, se o
           conteúdo já diverge do snapshot — não só quando o modo abre/fecha. */
        atualizarBotoesSalvarCancelarBarraPadrao();
        const idx = parseInt(e.target.dataset.i, 10);
        const val = e.target.value;
        const parts = splitTextoEmEstrofesPorLinhaVaziaStrict(val);
        if (parts.length > 1) {
          ignorarBlurSeparacaoEstrofeIdx = idx;
          aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idx, val, {
            emitSocket: true,
            posCaretAposSplit: idx + parts.length - 1,
          });
          setTimeout(() => {
            if (ignorarBlurSeparacaoEstrofeIdx === idx) ignorarBlurSeparacaoEstrofeIdx = null;
          }, 0);
          return;
        }
        musicaAtiva.estrofes[idx] = val;
        aplicarAlturaCardEstrofe(div);
        renderSlidesStrip();
        atualizarPreviewOperador();
      });
      taEst.addEventListener('blur', (e) => {
        const t = e.target;
        if (!t.isConnected) return;
        const idxBlur = parseInt(t.dataset.i, 10);
        if (ignorarBlurSeparacaoEstrofeIdx === idxBlur) {
          ignorarBlurSeparacaoEstrofeIdx = null;
          return;
        }
        aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idxBlur, t.value, { emitSocket: true });
      });
      div.querySelector('.btn-del-estrofe').addEventListener('click', (e) => {
        e.stopPropagation();
        removerEstrofeEditor(parseInt(e.currentTarget.dataset.i, 10));
      });

      const handle = div.querySelector('.estrofe-drag-handle');
      handle.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', String(i));
        e.dataTransfer.effectAllowed = 'move';
        div.classList.add('dragging-reorder');
      });
      handle.addEventListener('dragend', () => {
        div.classList.remove('dragging-reorder');
        wrap.querySelectorAll('.estrofe-slide-edit').forEach((el) =>
          el.classList.remove('drag-over-reorder'));
      });
      div.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        div.classList.add('drag-over-reorder');
      });
      div.addEventListener('dragleave', () => div.classList.remove('drag-over-reorder'));
      div.addEventListener('drop', (e) => {
        e.preventDefault();
        div.classList.remove('drag-over-reorder');
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const to = i;
        if (!Number.isFinite(from)) return;
        reorderEstrofesIndices(from, to);
      });
    } else {
      const quickBtn = !ehModoSlidesOperador()
        ? `<button type="button" class="btn sm btn-estrofe-quick" data-i="${i}" title="Edição rápida">✎</button>`
        : '';
      div.innerHTML = `
        <div class="estrofe-slide-toolbar">
          <div class="estrofe-slide-toolbar-left">
            <span class="estrofe-num-big">${i + 1}</span>
          </div>
          ${quickBtn}
        </div>
      `;
      const body = document.createElement('div');
      body.className = 'estrofe-slide-view-body';
      definirTextoCorpoSlide(body, txt);
      div.appendChild(body);

      if (!ehModoSlidesOperador()) {
        div.querySelector('.btn-estrofe-quick')?.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          abrirSlideQuickEditModal(i);
        });
        div.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          abrirSlideQuickEditModal(i);
        });
      }

      div.addEventListener('click', (e) => {
        if (ehModoSlidesOperador()) return;
        if (e.target.closest('.btn-del-estrofe')) return;
        if (e.target.closest('.btn-estrofe-quick')) return;
        clearTimeout(centralSlideTapTimer);
        centralSlideTapTimer = setTimeout(() => {
          centralSlideTapTimer = null;
          if (projecaoMusicaEmitidaNoServidor) {
            projetarPorDuploCliqueCentral(i);
            return;
          }
          exibirEstrofe(i);
          renderSlidesStrip();
          atualizarPreviewOperador();
          renderEstrofesEditor();
          marcacaoEstrofeEditor();
        }, 280);
      });
    }

    div.addEventListener('dblclick', (e) => {
      if (modoEdicaoEstrofes && e.target.closest('textarea')) return;
      if (e.target.closest('.btn-del-estrofe')) return;
      if (e.target.closest('.btn-estrofe-quick')) return;
      e.preventDefault();
      clearTimeout(centralSlideTapTimer);
      centralSlideTapTimer = null;
      if (ehModoSlidesOperador()) {
        projetarPorDuploCliqueCentral(i);
      }
    });

    wrap.appendChild(div);
  });

  homeLayout?.decorateCards();
  queueMicrotask(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => reaplicarAlturasEstrofesEditor()));
  });

  atualizarSlidesInstrucoes();
  aplicarLayoutModoLetraCompleta({ preencherTextarea: false });
}

function novaEstrofe() {
  if (!musicaAtiva || !modoEdicaoEstrofes || modoLetraCompletaCentral) return;
  const n = musicaAtiva.estrofes.length;
  let insertAt;
  if (estrofeAtiva < 0) insertAt = 0;
  else if (estrofeAtiva >= n) insertAt = n;
  else insertAt = estrofeAtiva + 1;
  musicaAtiva.estrofes.splice(insertAt, 0, '');
  exibirEstrofe(insertAt);
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
}

function removerEstrofeEditor(index) {
  if (!modoEdicaoEstrofes) return;
  if (!musicaAtiva || musicaAtiva.estrofes.length <= 1) {
    alert('É necessário pelo menos uma estrofe.');
    return;
  }
  musicaAtiva.estrofes.splice(index, 1);
  if (estrofeAtiva === index) estrofeAtiva = Math.max(0, index - 1);
  else if (estrofeAtiva > index) estrofeAtiva--;

  if (estrofeAtiva >= musicaAtiva.estrofes.length) {
    estrofeAtiva = musicaAtiva.estrofes.length - 1;
  }

  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
}

async function persistirMusicaAtivaNoServidor() {
  if (!musicaAtiva) {
    alert('Nenhuma música selecionada.');
    return false;
  }

  if (musicaBancoFonte === 'catalog') {
    alert('Música do catálogo: não é possível gravar no banco local.');
    return false;
  }

  const idNum = Number(musicaAtiva.id);
  if (!Number.isFinite(idNum)) {
    alert('ID da música inválido.');
    return false;
  }

  const titulo = document.getElementById('edit-titulo').value.trim();
  if (!titulo) {
    alert('Informe o título da música.');
    return false;
  }

  aplicarSplitsEstrofesDosTextareasAntesDePersistir();

  musicaAtiva.titulo = titulo;
  musicaAtiva.artista = document.getElementById('edit-artista').value.trim();

  const estrofesPayload = (musicaAtiva.estrofes || []).map((s) =>
    typeof s === 'string' ? s : String(s ?? '')
  );
  const versaoLocalIdAtiva =
    musicaVersaoLocalId && String(musicaVersaoLocalId).trim() ? String(musicaVersaoLocalId) : null;
  const idPersistencia = Number(musicaAtiva.id);
  /* Capturado antes de gravar: se o servidor bifurcar, é por aqui que se acha a entrada da playlist a repontar. */
  const rootAntesDeGravar = obterRootIdMusicaAtiva();
  const versaoPlaylistAntesDeGravar = versaoAtivaParaCompararPlaylist();
  const cultoDaEdicao = cultoId;

  const api = getControllerApiBase();

  async function aplicarMusicaRecarregada(idAlvo, forked) {
    await carregarMusicas();
    const res2 = await fetch(`${api}/api/musicas/${idAlvo}`);
    if (!res2.ok) throw new Error('Não foi possível recarregar a música.');
    musicaAtiva = await res2.json();
    musicaBancoFonte = 'user';
    musicaVersaoLocalId = null;
    musicaRootId = Number(musicaAtiva.root_id ?? musicaAtiva.id);
    document.getElementById('edit-titulo').value = musicaAtiva.titulo;
    document.getElementById('edit-artista').value = musicaAtiva.artista || '';
    snapshotEdicaoEstrofes = null;
    modoEdicaoEstrofes = false;
    snapshotLetraCompleta = null;
    modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
    refreshListaBanco();
    renderPlaylist();
    await carregarVersoesMusicaServidor(musicaRootId);
    renderMusicaVersoesBar();
    renderEstrofesEditor();
    renderSlidesStrip();
    atualizarPreviewOperador();
    atualizarToolbarModoEdicao();
    if (forked && !ehModoSlidesOperador()) {
      await appAlert(
        'As alterações foram gravadas numa nova cópia. O original no servidor foi preservado.',
        'Cópia criada'
      );
    }
  }

  if (versaoLocalIdAtiva && ehVersaoLocalLegada(versaoLocalIdAtiva)) {
    const rootLegado = obterRootIdMusicaAtiva() ?? idNum;
    const up = atualizarCopiaLocal(rootLegado, versaoLocalIdAtiva, {
      titulo,
      artista: musicaAtiva.artista,
      estrofes: estrofesPayload,
    });
    if (!up.ok) {
      alert(up.erro || 'Não foi possível atualizar a cópia.');
      return false;
    }
    await carregarVersoesMusicaServidor(obterRootIdMusicaAtiva() ?? idNum);
    renderMusicaVersoesBar();
    return true;
  }

  try {
    const bodyJson = JSON.stringify({
      titulo,
      artista: musicaAtiva.artista,
      estrofes: estrofesPayload,
    });
    let res = await fetch(`${api}/api/musicas/${idPersistencia}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: bodyJson,
    });

    if (res.status === 404) {
      res = await fetch(`${api}/api/musicas/${idPersistencia}/salvar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyJson,
      });
    }

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      let msg = '';
      try {
        msg = JSON.parse(raw).erro || '';
      } catch (_) {
        msg = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
      }
      alert(
        msg ||
          `Não foi possível salvar (HTTP ${res.status}). Verifique se o aplicativo Controlador está em execução (API local na porta 3001).`
      );
      return false;
    }

    const data = await res.json().catch(() => ({}));
    const forked = !!data.forked;
    const idAlvo = forked && data.id != null ? Number(data.id) : idPersistencia;
    musicaVersaoLocalId = null;
    await aplicarMusicaRecarregada(idAlvo, forked);
    /**
     * Fork = a edição virou uma versão nova; a playlist do dia continuaria a apontar
     * para o original imutável e recarregaria a letra antiga ao reentrar no modo slides.
     */
    if (forked) {
      const rootFork = Number(data.rootId ?? musicaRootId ?? rootAntesDeGravar);
      const repontou = repontarVersaoNaPlaylistDoCulto(
        cultoDaEdicao,
        rootFork,
        versaoPlaylistAntesDeGravar,
        idAlvo,
        musicaAtiva?.rotulo || ''
      );
      if (repontou) renderPlaylist();
    }
    return true;
  } catch (e) {
    alert(e.message || 'Erro ao salvar no banco local do controlador.');
    return false;
  }
}

async function iniciarCriarNovaVersao() {
  if (!musicaAtiva) return;
  if (musicaBancoFonte === 'catalog') {
    await appAlert(
      'Música do catálogo somente leitura. Importe para o seu banco antes de criar uma versão editável.',
      'Catálogo'
    );
    return;
  }
  const idNum = Number(musicaAtiva.id);
  if (!Number.isFinite(idNum)) return;

  if (
    !(await confirmarProsseguirDescartandoEdicaoPendente(
      'Você tem alterações não salvas. Descartar e criar uma nova versão a partir do texto gravado no servidor?',
      'Criar nova versão'
    ))
  ) {
    return;
  }

  /* Duas versões da mesma música não podem ter o mesmo nome: quando o servidor
     recusa por nome repetido, avisa e volta a pedir outro — sem gravar nada. */
  let sugestao = '';
  let avisoNomeRepetido = '';
  let payload = null;
  for (;;) {
    const nome = await appPrompt('Nome da nova versão:', {
      title: 'Nova versão',
      defaultValue: sugestao,
      emptyMsg: 'Digite um nome para a versão.',
      auxText: avisoNomeRepetido || undefined,
    });
    if (!nome) return;
    try {
      limparFlagsModoEdicaoMusica();

      const res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/criar-versao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotulo: nome }),
      });
      const resposta = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (resposta.codigo === ERRO_ROTULO_DUPLICADO_API) {
          await appAlert(resposta.erro, 'Nome de versão repetido');
          sugestao = nome;
          avisoNomeRepetido = resposta.erro;
          continue;
        }
        await appAlert(resposta.erro || `Não foi possível criar a versão (HTTP ${res.status}).`);
        return;
      }
      payload = resposta;
      break;
    } catch (e) {
      await appAlert(e?.message || 'Não foi possível criar a nova versão.');
      return;
    }
  }

  try {
    const nova = payload.musica;
    if (!nova || !Array.isArray(nova.estrofes)) throw new Error('Resposta inválida do servidor.');

    musicaAtiva = nova;
    musicaBancoFonte = 'user';
    musicaVersaoLocalId = null;
    musicaRootId = Number(nova.root_id ?? payload.rootId ?? idNum);
    const et = document.getElementById('edit-titulo');
    const ea = document.getElementById('edit-artista');
    if (et) et.value = musicaAtiva.titulo || '';
    if (ea) ea.value = musicaAtiva.artista || '';

    estrofeAtiva = Math.min(
      Math.max(estrofeAtiva < 0 ? 0 : estrofeAtiva, 0),
      Math.max(0, musicaAtiva.estrofes.length - 1)
    );
    projecaoMusicaEmitidaNoServidor = false;
    bloqueioSincronizarEstrofeDoServidor = true;
    await carregarMusicas();
    refreshListaBanco();
    renderPlaylist();
    await carregarVersoesMusicaServidor(musicaRootId);
    renderEstrofesEditor();
    renderSlidesStrip();
    atualizarPreviewOperador();
    marcacaoEstrofeEditor();

    /* A cópia recém-criada abre na letra corrida, como uma música aberta do
       banco — não na grade de edição por slides. `entrarModoLetraCompletaCentral`
       já trata do layout, do snapshot e da barra de ações. */
    entrarModoLetraCompletaCentral();
  } catch (e) {
    appAlert(e?.message || 'Não foi possível criar a nova versão.');
  }
}

async function salvarMusicaServidor() {
  if (!musicaAtiva) return;
  const metadadosSujos = metadadosMusicaSujosNaHome();
  if (!modoEdicaoEstrofes && !modoLetraCompletaCentral && !metadadosSujos) return;
  if (musicaBancoFonte === 'catalog') {
    await appAlert(
      'Música do catálogo somente leitura: não é possível usar Salvar alterações. Importe a letra para o seu banco ou escolha uma música gravada neste servidor.'
    );
    return;
  }
  if (modoLetraCompletaCentral) sincronizarEstrofesDesdeTextareaLetraCompleta();
  if (modoEdicaoEstrofes) aplicarSplitsEstrofesDosTextareasAntesDePersistir();

  const vid =
    musicaVersaoLocalId && ehVersaoLocalLegada(musicaVersaoLocalId)
      ? String(musicaVersaoLocalId).trim()
      : null;
  const idNum = Number(musicaAtiva.id);

  if (vid) {
    const titulo = document.getElementById('edit-titulo').value.trim();
    const artista = document.getElementById('edit-artista').value.trim();
    const estrofesPayload = (musicaAtiva.estrofes || []).map((s) => String(s ?? ''));
    const rootLegado = obterRootIdMusicaAtiva() ?? idNum;
    const up = atualizarCopiaLocal(rootLegado, vid, { titulo, artista, estrofes: estrofesPayload });
    if (!up.ok) {
      await appAlert(up.erro || 'Não foi possível atualizar a cópia.');
      return;
    }
    await carregarVersoesMusicaServidor(obterRootIdMusicaAtiva() ?? idNum);
  } else {
    const ok = await persistirMusicaAtivaNoServidor();
    if (!ok) return;
    return;
  }

  limparFlagsModoEdicaoMusica();
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();
  atualizarToolbarModoEdicao();
  renderMusicaVersoesBar();
  refreshListaBanco();
  renderPlaylist();
}

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
  aberturaRemovidaPorCulto = loadAberturaRemovidaPorCulto();
  ministrantePadraoPorCulto = loadMinistrantePadraoPorCulto();
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

function aplicarBaseMusicaSelecionada(base, id, versaoLocalId) {
  const idNum = Number(id);
  musicaRootId = Number(base?.root_id ?? idNum);
  musicaVersaoLocalId = versaoLocalId && String(versaoLocalId).trim() ? String(versaoLocalId) : null;
  if (musicaVersaoLocalId && ehVersaoLocalLegada(musicaVersaoLocalId)) {
    const c = encontrarCopiaLocal(idNum, musicaVersaoLocalId);
    if (c) {
      musicaAtiva = {
        ...base,
        titulo: c.titulo,
        artista: c.artista || '',
        estrofes: (c.estrofes || []).map((s) => String(s)),
      };
    } else {
      musicaAtiva = base;
      musicaVersaoLocalId = null;
    }
  } else {
    musicaAtiva = base;
    if (musicaVersaoLocalId && ehVersaoServidorId(musicaVersaoLocalId)) {
      musicaVersaoLocalId = null;
    }
  }
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (et) et.value = musicaAtiva.titulo || '';
  if (ea) ea.value = musicaAtiva.artista || '';
  void sincronizarBarraVersoesAposTroca();
  atualizarToolbarModoEdicao();
}

async function confirmarRemoverVersaoLocal(idMusica, copiaId) {
  const ok = await appConfirm(
    'Remover esta versão local? Itens da playlist que usavam esta versão passarão a usar o texto original.',
    'Remover versão'
  );
  if (!ok) return;
  removerCopiaLocal(idMusica, copiaId);
  removerVersaoLocalDasPlaylists(idMusica, copiaId);
  const idNum = Number(idMusica);
  if (musicaAtiva && Number(musicaAtiva.id) === idNum && musicaVersaoLocalId === copiaId) {
    await trocarVersaoMusicaCentral(null);
  }
  renderMusicaVersoesBar();
  renderPlaylist();
  await carregarMusicas();
  atualizarToolbarModoEdicao();
}

function rotuloExibicaoVersaoServidor(v) {
  return formatarRotuloVersaoExibicao(v?.rotulo, v?.origem_importacao);
}

/**
 * Descreve a versão «cópia» atualmente selecionada (não-ORIGINAL), para as ações
 * contextuais do menu inferior. Devolve `null` quando ORIGINAL, catálogo ou sem
 * música — casos em que Editar nome / Apagar cópia não se aplicam.
 * @returns {{ tipo: 'local'|'servidor', rootId: number, id: string, rotulo: string } | null}
 */
function versaoCopiaSelecionadaAtual() {
  if (!musicaAtiva || musicaAtiva.id == null || musicaBancoFonte === 'catalog') return null;
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) return null;
  if (musicaVersaoLocalId) {
    const copia = encontrarCopiaLocal(rootId, musicaVersaoLocalId);
    if (!copia) return null;
    return { tipo: 'local', rootId, id: copia.id, rotulo: copia.rotulo || '' };
  }
  if (!musicaAtivaEhOriginalServidor()) {
    return { tipo: 'servidor', rootId, id: String(musicaAtiva.id), rotulo: musicaAtiva.rotulo || '' };
  }
  return null;
}

/** Editar nome (menu inferior): renomeia a cópia selecionada — servidor ou local. */
function editarNomeVersaoSelecionada() {
  const c = versaoCopiaSelecionadaAtual();
  if (!c) return;
  if (c.tipo === 'local') void iniciarRenomearVersaoLocal(c.rootId, c.id, c.rotulo);
  else void iniciarRenomearVersaoServidor(c.rootId, c.id, c.rotulo);
}

/** Apagar cópia (menu inferior): remove a cópia selecionada — servidor ou local. */
function apagarCopiaVersaoSelecionada() {
  const c = versaoCopiaSelecionadaAtual();
  if (!c) return;
  if (c.tipo === 'local') void confirmarRemoverVersaoLocal(c.rootId, c.id);
  else void confirmarRemoverVersaoServidor(c.rootId, c.id);
}

/* Ícones (SVG contorno) da barra de versões. currentColor acompanha o estado do chip. */
const SVG_VERSAO = {
  ramo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
  original: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1L12 2z"/></svg>',
  modificada: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  importada: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  local: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M7 20h10M9 16v4M15 16v4"/></svg>',
  copia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  nova: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

/**
 * A Cópia padrão tem hoje o mesmo conteúdo do Original?
 *
 * Cópia padrão é a primeira versão filha da música — a que nasce junto com o
 * Original (mesmo critério do servidor, `obterCopiaPadraoDoRoot`: o menor id
 * entre os filhos). Vale pelo conteúdo, não pelo nome: uma cópia já renomeada
 * para «Editada» que volte a ficar igual continua a valer.
 *
 * A igualdade é a mesma do resto do sistema: título, artista e estrofes,
 * caractere por caractere.
 */
function copiaPadraoIdenticaAoOriginal(versoes, rootId) {
  const lista = Array.isArray(versoes) ? versoes : [];
  const alvo = Number(rootId);
  const original = lista.find((v) => Number(v.id) === alvo) || null;
  if (!original) return false;
  const copiaPadrao = lista
    .filter((v) => v && v.parent_id != null && Number(v.id) !== alvo)
    .sort((a, b) => Number(a.id) - Number(b.id))[0];
  if (!copiaPadrao) return false;
  return versoesConteudoRigorosamenteIdentico(original, copiaPadrao);
}

/** Ícone da cópia a partir do rótulo (rótulos automáticos conhecidos; nome próprio = cópia genérica). */
function iconeVersaoServidorPorRotulo(labelUpper) {
  const s = String(labelUpper || '').normalize('NFC').toLocaleUpperCase('pt-BR');
  if (s.includes('IMPORTAD')) return SVG_VERSAO.importada;
  /* «VERSÃO <ORIGEM>» é o nome exibido da cópia importada — mesmo ícone. */
  if (s.startsWith('VERSÃO ')) return SVG_VERSAO.importada;
  /* «CÓPIA/ORIGINAL» é o nome exibido da Cópia padrão — mesmo ícone de sempre. */
  if (s.includes('MODIFICAD') || s === 'CÓPIA' || s === 'COPIA') return SVG_VERSAO.modificada;
  if (s === 'CÓPIA/ORIGINAL' || s === 'COPIA/ORIGINAL') return SVG_VERSAO.modificada;
  return SVG_VERSAO.copia;
}

function idChipVersaoAtiva() {
  if (musicaVersaoLocalId) return String(musicaVersaoLocalId);
  if (musicaAtivaEhOriginalServidor()) return '__original__';
  if (musicaAtiva?.id != null) return String(musicaAtiva.id);
  return '';
}

/** Só troca o chip activo — evita reconstruir a barra (e tremer os slides por baixo). */
function atualizarChipAtivoBarraVersoes() {
  const bar = document.getElementById('musica-versoes-bar');
  if (!bar || bar.hidden) return false;
  const chips = bar.querySelectorAll('.versao-chip[data-versao-id]');
  if (!chips.length) return false;
  const ativo = idChipVersaoAtiva();
  let achou = false;
  chips.forEach((chip) => {
    const on = chip.dataset.versaoId === ativo;
    if (on) achou = true;
    chip.classList.toggle('versao-musica-ativa', on);
  });
  atualizarVersoesHome(bar);
  return achou;
}

function sincronizarBarraVersoesAposTroca() {
  const root = obterRootIdMusicaAtiva();
  if (Number(versoesMusicaServidorCache.rootId) === Number(root)) {
    if (!atualizarChipAtivoBarraVersoes()) renderMusicaVersoesBar();
    return Promise.resolve();
  }
  return carregarVersoesMusicaServidor(root);
}

function renderMusicaVersoesBar() {
  const bar = document.getElementById('musica-versoes-bar');
  if (!bar) return;
  if (!musicaAtiva || musicaAtiva.id == null) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) {
    bar.hidden = true;
    return;
  }
  /* Catálogo é só-leitura: não há versões nem criação. */
  if (musicaBancoFonte === 'catalog') {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  const versoesSrv =
    Number(versoesMusicaServidorCache.rootId) === rootId
      ? versoesMusicaServidorCache.versoes || []
      : [];
  const copiasLocais = getCopiasParaMusica(rootId);

  /* Sempre visível (com música editável carregada): mesmo sem cópias, o chip «Nova versão»
     é o único ponto de criação — antes isto ficava no botão da barra de baixo, agora saiu. */
  bar.hidden = false;
  bar.innerHTML = '';

  const mkChip = (label, copiaId, ativo, svg, rotuloOriginal) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn sm versao-chip' + (ativo ? ' versao-musica-ativa' : '');
    b.dataset.versaoId = copiaId == null || copiaId === '' ? '__original__' : String(copiaId);
    b.innerHTML = (svg || '') + '<span class="versao-chip-txt"></span>';
    b.querySelector('.versao-chip-txt').textContent = label;
    if (rotuloOriginal != null) b.dataset.rotuloOriginal = rotuloOriginal;
    b.onclick = () => void trocarVersaoMusicaCentral(copiaId);
    return b;
  };

  const lbl = document.createElement('span');
  lbl.className = 'versao-bar-label';
  lbl.innerHTML = SVG_VERSAO.ramo + '<span>Versões</span>';
  bar.appendChild(lbl);

  const originalAtivo = musicaAtivaEhOriginalServidor() && !musicaVersaoLocalId;
  /* Enquanto a Cópia padrão tiver exactamente o conteúdo do Original, o chip do
     ORIGINAL é redundante e some do cabeçalho — o registo continua no banco,
     intacto. Editada a cópia, os conteúdos deixam de bater e o ORIGINAL
     reaparece sozinho; voltando a ficar iguais, some outra vez.
     Excepção: se o ORIGINAL for a versão activa, fica — sem ele o cabeçalho não
     mostraria nenhuma versão assinalada. */
  if (originalAtivo || !copiaPadraoIdenticaAoOriginal(versoesSrv, rootId)) {
    bar.appendChild(
      mkChip(rotuloVersaoMaiusculo('Original'), null, originalAtivo, SVG_VERSAO.original, 'Original')
    );
  }

  for (const v of versoesSrv) {
    if (v.parent_id == null && Number(v.id) === rootId) continue;
    if (v.parent_id == null) continue;
    const vid = String(v.id);
    const ativo = !musicaVersaoLocalId && Number(musicaAtiva.id) === Number(v.id);
    const rotulo = rotuloExibicaoVersaoServidor(v);
    /* Só o nome/badge — editar e apagar ficam no menu inferior contextual. */
    bar.appendChild(
      mkChip(rotuloVersaoMaiusculo(rotulo), vid, ativo, iconeVersaoServidorPorRotulo(rotulo), rotulo)
    );
  }

  copiasLocais.forEach((c) => {
    const rotuloVis = `${rotuloVersaoMaiusculo(formatarRotuloVersaoExibicao(c.rotulo))} (LOCAL)`;
    bar.appendChild(mkChip(rotuloVis, c.id, musicaVersaoLocalId === c.id, SVG_VERSAO.local, `${formatarRotuloVersaoExibicao(c.rotulo)} (local)`));
  });

  /* Chip de criação: mesmo destino do antigo botão «Criar nova versão». */
  const nova = document.createElement('button');
  nova.type = 'button';
  nova.className = 'btn sm versao-nova-chip';
  nova.title = 'Cria uma cópia editável a partir do texto gravado no servidor';
  nova.innerHTML = SVG_VERSAO.nova + '<span class="versao-chip-txt">Nova versão</span>';
  nova.onclick = () => void iniciarCriarNovaVersao();
  bar.appendChild(nova);
  organizarVersoesHome(bar);
}

async function iniciarRenomearVersaoServidor(rootId, versaoId, rotuloAtual) {
  const idNum = parseInt(versaoId, 10);
  if (!Number.isFinite(idNum)) return;
  let sugestao = String(rotuloAtual || '').trim();
  let avisoNomeRepetido = '';
  for (;;) {
    /* Nome repetido: avisa e volta a pedir, já com o que foi escrito. */
    const nome = await appPrompt('Novo nome da versão:', {
      title: 'Renomear versão',
      defaultValue: sugestao,
      emptyMsg: 'Digite um nome para a versão.',
      auxText: avisoNomeRepetido || undefined,
    });
    if (!nome) return;
    try {
      let res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/rotulo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotulo: nome }),
      });
      if (res.status === 404) {
        res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/rotulo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rotulo: nome }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.codigo === ERRO_ROTULO_DUPLICADO_API) {
          await appAlert(data.erro, 'Nome de versão repetido');
          sugestao = nome;
          avisoNomeRepetido = data.erro;
          continue;
        }
        await appAlert(data.erro || `Não foi possível renomear (HTTP ${res.status}).`);
        return;
      }
      await concluirRenomearVersaoServidor(rootId, versaoId, idNum, String(data.rotulo || nome).trim());
    } catch (e) {
      await appAlert(e?.message || 'Não foi possível renomear a versão.');
    }
    return;
  }
}

/** Código devolvido pela API quando o nome já pertence a outra versão da música. */
const ERRO_ROTULO_DUPLICADO_API = 'rotulo-duplicado';

/** Depois de gravado o novo nome: playlists, música activa e barra de versões. */
async function concluirRenomearVersaoServidor(rootId, versaoId, idNum, rotuloFinal) {
  atualizarRotuloVersaoNasPlaylists(rootId, versaoId, rotuloFinal);
  if (musicaAtiva && Number(musicaAtiva.id) === idNum) {
    musicaAtiva.rotulo = rotuloFinal;
  }
  await carregarVersoesMusicaServidor(rootId);
  renderPlaylist();
}

/**
 * Nome já usado por outra versão desta música (servidor ou local)?
 * Mesma regra do servidor (`existeRotuloVersaoNaFamilia`): caixa não conta, e o
 * original entra com o nome por que é exibido. `idIgnorar` é a versão em causa.
 */
function nomeVersaoJaUsadoNaMusica(rootId, nome, idIgnorar) {
  const chave = String(nome || '').trim().normalize('NFC').toLocaleLowerCase('pt-BR');
  if (!chave) return false;
  const mesmo = (r) => String(r || '').trim().normalize('NFC').toLocaleLowerCase('pt-BR') === chave;
  if (mesmo('Original')) return true;
  const versoesSrv =
    Number(versoesMusicaServidorCache.rootId) === Number(rootId)
      ? versoesMusicaServidorCache.versoes || []
      : [];
  const naoEhAPropria = (id) => String(id) !== String(idIgnorar);
  return (
    versoesSrv.some(
      (v) => v.parent_id != null && naoEhAPropria(v.id) && mesmo(v.rotulo)
    ) || getCopiasParaMusica(rootId).some((c) => naoEhAPropria(c.id) && mesmo(c.rotulo))
  );
}

async function iniciarRenomearVersaoLocal(rootId, copiaId, rotuloAtual) {
  let sugestao = String(rotuloAtual || '').trim();
  let avisoNomeRepetido = '';
  for (;;) {
    const nome = await appPrompt('Novo nome da versão:', {
      title: 'Renomear versão',
      defaultValue: sugestao,
      emptyMsg: 'Digite um nome para a versão.',
      auxText: avisoNomeRepetido || undefined,
    });
    if (!nome) return;
    /* Nome repetido: avisa e volta a pedir outro — sem gravar nada. */
    if (nomeVersaoJaUsadoNaMusica(rootId, nome, copiaId)) {
      const msg = `Já existe uma versão chamada «${nome.trim()}» nesta música. Escolha um nome diferente.`;
      await appAlert(msg, 'Nome de versão repetido');
      sugestao = nome;
      avisoNomeRepetido = msg;
      continue;
    }
    const up = atualizarCopiaLocal(rootId, copiaId, { rotulo: nome });
    if (!up.ok) {
      await appAlert(up.erro || 'Não foi possível renomear a versão local.');
      return;
    }
    atualizarRotuloVersaoNasPlaylists(rootId, copiaId, nome);
    renderMusicaVersoesBar();
    renderPlaylist();
    return;
  }
}

async function confirmarRemoverVersaoServidor(rootId, versaoId) {
  const ok = await appConfirm(
    'Remover esta versão do banco? Itens da playlist que usavam esta versão passarão a usar o original.',
    'Remover versão'
  );
  if (!ok) return;
  const idNum = parseInt(versaoId, 10);
  if (!Number.isFinite(idNum)) return;
  /* Original nunca se exclui como versão individual — só pela Biblioteca (música inteira). */
  if (Number(rootId) === idNum) {
    await appAlert(
      'A Original não pode ser excluída individualmente. Exclua a música pela Biblioteca.',
      'Remover versão'
    );
    return;
  }
  try {
    let res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/excluir`, {
      method: 'POST',
    });
    if (!res.ok) {
      res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}`, { method: 'DELETE' });
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      await appAlert(data.erro || `Não foi possível remover (HTTP ${res.status}).`);
      return;
    }
    removerVersaoLocalDasPlaylists(rootId, String(versaoId));
    if (musicaAtiva && Number(musicaAtiva.id) === idNum) {
      await trocarVersaoMusicaCentral(null);
    }
    /* Sempre recarregar do servidor: o cache da barra mantinha a versão apagada
       (ex.: «Cópia»), parecendo que a exclusão não tinha funcionado. */
    await carregarVersoesMusicaServidor(rootId);
    renderPlaylist();
    await carregarMusicas();
    atualizarToolbarModoEdicao();
  } catch (e) {
    appAlert(e?.message || 'Não foi possível remover a versão.');
  }
}

async function trocarVersaoMusicaCentral(copiaId) {
  if (!musicaAtiva) return;
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) return;
  if (temEdicaoMusicaNaoGravada()) {
    const ok = await appConfirm(
      'Você tem alterações não salvas. Descartar e trocar de versão?',
      'Trocar versão',
      { okLabel: 'Descartar', cancelLabel: 'Cancelar' }
    );
    if (!ok) return;
  }

  const manterLetraCompleta = modoLetraCompletaCentral;
  const estrofesAntes = (musicaAtiva.estrofes || []).map((s) => String(s ?? ''));

  try {
    const vid = copiaId && String(copiaId).trim() ? String(copiaId) : null;
    let url;
    if (!vid) {
      url = `${getControllerApiBase()}/api/musicas/${rootId}`;
    } else if (ehVersaoLocalLegada(vid)) {
      url = `${getControllerApiBase()}/api/musicas/${rootId}`;
    } else {
      url = `${getControllerApiBase()}/api/musicas/${encodeURIComponent(vid)}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao carregar música (HTTP ${res.status}).`);
    const base = await res.json();
    if (!base || !Array.isArray(base.estrofes)) throw new Error('Resposta inválida do controlador.');
    musicaBancoFonte = 'user';
    if (!vid || ehVersaoServidorId(vid)) {
      musicaAtiva = base;
      musicaVersaoLocalId = vid && ehVersaoLocalLegada(vid) ? vid : null;
      musicaRootId = Number(base.root_id ?? rootId);
      const et = document.getElementById('edit-titulo');
      const ea = document.getElementById('edit-artista');
      if (et) et.value = musicaAtiva.titulo || '';
      if (ea) ea.value = musicaAtiva.artista || '';
      await sincronizarBarraVersoesAposTroca();
    } else {
      aplicarBaseMusicaSelecionada(base, rootId, vid);
    }
    estrofeAtiva = Math.min(
      Math.max(estrofeAtiva < 0 ? 0 : estrofeAtiva, 0),
      Math.max(0, musicaAtiva.estrofes.length - 1)
    );
    projecaoMusicaEmitidaNoServidor = false;
    bloqueioSincronizarEstrofeDoServidor = true;

    const mesmaLetra = estrofesArraysIguaisParaEdicao(estrofesAntes, musicaAtiva.estrofes);

    if (manterLetraCompleta) {
      atualizarTextoPainelLetraCompleta();
      const ta = document.getElementById('centro-letra-completa-ta');
      snapshotLetraCompleta = {
        estrofes: ta
          ? splitTextoLetraCompletaEmEstrofes(ta.value)
          : musicaAtiva.estrofes.map((s) => String(s ?? '')),
        estrofeAtiva,
      };
    } else if (!mesmaLetra) {
      if (!atualizarEstrofesEditorInPlace()) renderEstrofesEditor();
    } else {
      marcacaoEstrofeEditor();
    }

    if (modoEdicaoEstrofes) {
      snapshotEdicaoEstrofes = {
        titulo: String(musicaAtiva.titulo || ''),
        artista: String(musicaAtiva.artista || ''),
        estrofes: musicaAtiva.estrofes.map((s) => String(s ?? '')),
        estrofeAtiva,
      };
    }

    if (ehModoSlidesOperador()) {
      if (mesmaLetra) {
        const grid = document.getElementById('slides-grid');
        if (grid && musicaAtiva) {
          grid.dataset.stripMusicaId = String(musicaAtiva.id ?? '');
          grid.dataset.stripProjecao = projecaoMusicaEmitidaNoServidor ? '1' : '0';
        }
        atualizarSomenteAtivoFaixaSlides();
      } else {
        renderSlidesStrip();
      }
    }

    atualizarToolbarModoEdicao();
  } catch (e) {
    appAlert(e?.message || 'Não foi possível trocar de versão.');
  }
}

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
  aberturaRemovidaPorCulto = loadAberturaRemovidaPorCulto();
  ministrantePadraoPorCulto = loadMinistrantePadraoPorCulto();
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
      if (payload?.updatedAt) sharedBancoLocalUpdatedAt = String(payload.updatedAt);
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
window.addEventListener('scroll', () => { if (_previewAlvoAtual) posicionarOverlayPreview(); }, true);
window.addEventListener('resize', () => { if (_previewAlvoAtual) posicionarOverlayPreview(); });
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
      if (appImportarBloqueadoFechar) return;
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
