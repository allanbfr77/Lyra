/**
 * =============================================================================
 * Lyra — Painel do controlador (JavaScript do renderer): coordenador de arranque
 * =============================================================================
 * Este ficheiro já foi um <script> inline gigante em controller.html e, depois, um módulo com cerca de
 * 29 mil linhas. A lógica do painel vive agora em `js/painel/` (um módulo por responsabilidade) e em
 * `js/modules/` (regras puras e utilitários reutilizáveis). Aqui fica só o arranque:
 *
 *   1. migra chaves antigas do localStorage;
 *   2. dispara, NA ORDEM ABAIXO, o `iniciar…()` de cada módulo que precisa registar escutas/instruções no
 *      carregamento (a ordem é a original do monólito — não a altere sem rodar `npm run test:home`).
 *
 * Carregamento (controller.html): css/controller.css → publicDisplayConfig.js → controllerApp.js (entrada
 * ES module) → este ficheiro. As funções chamadas por atributos HTML (onclick="…") são expostas em
 * `window` por `modules/ponteHtmlWindow.js`, a partir de `iniciarModoSlidesOperador` e `iniciarPainel`.
 *
 * ONDE ESTÁ CADA COISA (js/painel/)
 *   Estado compartilhado ....... estadoPainel.js (objeto `estadoPainel` + porta de projeção `projecao`)
 *   Arranque e coordenação ..... inicializacaoPainel.js, atalhosTeclado.js, recargaRepintura.js, modosUi.js
 *   Servidor e projeção ........ servidorAlvo.js, socketPainelApi.js, eventosProjecao.js, roteamentoTelas.js,
 *                                roteamentoTelasUi.js, rotasMonitores.js, canaisProjecao.js, projecaoLocalObs.js
 *   Música ativa e slides ...... projecaoMusica.js, versoesMusica.js, letraCompleta.js, comparativoVersoes.js,
 *                                editorEstrofes.js, splitEstrofes.js, toolbarEdicaoHome.js, slidesStrip.js,
 *                                slidesGrelhaPainel.js, slidesRailLayout.js, slidesRailEventos.js
 *   Biblioteca ................. bibliotecaMusicas.js, previewLetras.js, conexaoLetrasUi.js,
 *                                removerMusicaBanco.js, copiasLocaisPainel.js
 *   Playlist e culto ........... cultoDoDia.js, cultoSeletor.js, playlistTemas.js, temasPlaylistUi.js,
 *                                playlistLista.js, playlistLinhaUi.js, playlistAdicionar.js, playlistMenus.js,
 *                                playlistTransmitidas.js, playlistServidor.js, playlistCompartilhar.js,
 *                                sincronizacaoBanco.js, ministrantesTons.js
 *   Prévia ..................... previewProjecao.js, previewOculto.js, tituloAberturaPreview.js
 *   Mídias (modo Apresentação) . menuApresentacaoModo.js, gridApresentacao.js, bibliotecaMidiasApresentacao.js,
 *                                playerLocalMidia.js, playlistVideoApresentacao.js, videoApresentacao.js,
 *                                estadoApresentacao.js, conteudoUnificadoAviso.js, modoSlidesOperador.js
 *   Outros modos e janelas ..... biblia.js, docs.js, contagemRegressiva.js, configExibicao.js (Ajustes),
 *                                preVoo.js, appDialog.js, menuLyra.js / lyraMenuConteudo.js, bannerAtualizacao.js
 *
 * REGRAS DA ARQUITETURA
 *   - Estado compartilhado: só em `estadoPainel.js`; leia/atribua por `estadoPainel.nome`.
 *   - Estado privado de um módulo fica no módulo e é exposto por funções (`getX`/`setX`) só se outro precisar.
 *   - Módulos importam uns aos outros diretamente (explícito); não há registro de dependências nem ciclos
 *     com avaliação no carregamento — o que corre no carregamento está nas funções `iniciar…()` abaixo.
 *   - Convenção de nomes: LS_* = chaves do localStorage; ehModo* = predicados do modo de UI ativo.
 * =============================================================================
 */

import { migrarChavesLegadoLocalStorage } from './modules/migrarChavesArmazenamentoLocal.js';
import { iniciarModoSlidesOperador } from './painel/modoSlidesOperador.js';
import { iniciarRecargaRepintura } from './painel/recargaRepintura.js';
import { iniciarSlidesRailEventos } from './painel/slidesRailEventos.js';
import { iniciarPlaylistCompartilhar } from './painel/playlistCompartilhar.js';
import { iniciarEditorEstrofes } from './painel/editorEstrofes.js';
import { iniciarEventosProjecao } from './painel/eventosProjecao.js';
import { iniciarProjecaoMusica } from './painel/projecaoMusica.js';
import { iniciarAtalhosTeclado } from './painel/atalhosTeclado.js';
import { iniciarPainel } from './painel/inicializacaoPainel.js';

migrarChavesLegadoLocalStorage();

/* Ordem original do monólito. Cada função só liga escutas/inicializa o seu módulo. */
iniciarModoSlidesOperador(); // callbacks do HTML (modos Slides/Bíblia/Mídias/DOCS)
iniciarRecargaRepintura(); // recarregar painel, repintura do compositor e ponte IPC do Electron
iniciarSlidesRailEventos(); // arraste/redimensionamento da faixa de slides
iniciarPlaylistCompartilhar(); // Escape nas janelas de importação de playlist
iniciarEditorEstrofes(); // recalcular alturas das estrofes quando a fonte do slide carrega
iniciarEventosProjecao(); // inscrições da porta de projeção (estado, áudio, display, monitores)
iniciarProjecaoMusica(); // «ir para o slide N», voz e callbacks do HTML da música ativa
iniciarAtalhosTeclado(); // teclado global (ESC da Home, setas, passador, blackout)
iniciarPainel(); // leitura do armazenamento, Home, controles do DOM e arranque da conexão
