/**
 * Inicialização do painel: leitura do armazenamento local, montagem da Home, ligação dos controles do DOM
 * (mídias, DOCS, áudio, cabeçalho), arranque da conexão e dos módulos. Movido verbatim do núcleo
 * (`controllerAppCore.js`); a ordem das instruções é a original e o núcleo a dispara por `iniciarPainel()`.
 */
import { LS_IP_KEY, LS_IP_LEGACY, LS_UI_MODO_SLIDES } from '../modules/chavesArmazenamentoLocal.js';
import { abrirPainelContagem, alternarPainelContagem, iniciarContagemRegressivaPainel, limparImagemFundoContagem, onContagemBgImagemChange, onContagemCfgChange, restaurarPadraoContagem, setPosContagemCtrl } from './contagemRegressiva.js';
import { adicionarArquivoDiretoNoCard, adicionarImagemNaAreaCard4, renderGridApresentacao } from './gridApresentacao.js';
import { adicionarArquivosAosDocs, carregarDocsBibliotecaDoStorage, configurarBuscaDocsImportados, docsPaginaSelecionadaAtual, encerrarRotaModoDocs, escolherArquivoModoDocs, navegarPaginaDocs, projetarPaginaDocs, renderListaDocsImportados } from './docs.js';
import { alternarLoopPlayerApresentacao, alternarMudoAudioApresentacao, atualizarUiPlayerAudioRemoto, definirVolumeAudioServidor, get_previewAlvoAtual, posicionarOverlayPreview, seekAudioServidor } from './playerLocalMidia.js';
import { aplicarPreviewPainelOcultoNoDom, carregarPreviewPainelOcultoDoArmazenamento } from './previewOculto.js';
import { aplicarRotulosEPlaylistModoSlides, atualizarBtnModoApresentacao, atualizarBtnToggleModoSlides, ehModoApresentacaoOperador, ehModoBibliaOperador, ehModoDocsOperador, ehModoSlidesOperador, liberarBloqueioUiModos } from './modosUi.js';
import { aplicarSnapshotCompartilhadoNoRenderer, recuperarPedidoSyncBancoPendente, setSharedBancoLocalUpdatedAt, tratarPedidoSyncBancoDirecto } from './sincronizacaoBanco.js';
import { appAlert, appDialogEstado, fecharAppDialog } from './appDialog.js';
import { aprimorarControlesVisuaisCfg, fecharCfgModal, iniciarConfigExibicao } from './configExibicao.js';
import { atualizarBtnModoBiblia, carregarBibliaCfgDoStorage, encerrarProjecaoModoBiblia, reconhecimentoVozBiblia } from './biblia.js';
import { atualizarPreviewOperador, atualizarPreviewPlaylistCentral, configurarObserverPreviewMinistrante } from './previewProjecao.js';
import { atualizarToolbarModoEdicao, renomearVersaoSelecionadaComNome } from './toolbarEdicaoHome.js';
import { carregarAvisoCard6CfgDoStorage } from './conteudoUnificadoAviso.js';
import { carregarEstadoModoApresentacaoDoStorage, encerrarModoApresentacaoNoTelao, gravarEstadoModoApresentacaoNoStorageAgora } from './estadoApresentacao.js';
import { carregarMusicas, configurarBarraSelecaoBiblioteca, configurarModalNovaMusicaManual, configurarNavegadorAlfabeticoBiblioteca, filtrar, garantirBuscaLetrasEditavel, garantirBuscaLocalEditavel, initBancoPainelFromStorage } from './bibliotecaMusicas.js';
import { carregarRotasPorModoDoStorage, hostChaveMonitores, modoComMemoriaMonitorAtual, normalizarRota, rotaDesativada, sincronizarCheckboxLembrarMonitor } from './rotasMonitores.js';
import { carregarRoteamentoTelasDoServidor } from './roteamentoTelas.js';
import { configurarAcoesPlaylist, configurarMenuMomentoPlaylist, configurarModalSyncPlaylist, configurarSeletorTemaPlaylist } from './playlistMenus.js';
import { configurarAutoConectarAoAlternarJanelas, limparIpGuardado, persistirIpServidor, preferenciaAutoConectar, preferenciaLembrarIp, sincronizarUiAutoConectar, sincronizarUiLembrarIp, tentarAutoConectarSeDesconectado, tentarConectarAutomaticoAoIniciar } from './socketPainelApi.js';
import { configurarBibliotecaMidiasApresentacao, importarArquivosBibliotecaMidias, renderListaAudiosApresentacao, renderMenuApresentacao } from './bibliotecaMidiasApresentacao.js';
import { configurarCamposMetadadosMusicaHome, entrarModoEdicao, novaEstrofe, renderEstrofesEditor } from './editorEstrofes.js';
import { configurarModalExcluirMusica } from './removerMusicaBanco.js';
import { configurarModalPreviewLetras } from './previewLetras.js';
import { configurarNotasSlideControlador } from '../modules/notasSlideControlador.js';
import { confirmarProsseguirDescartandoEdicaoPendente, entrarModoLetraCompletaCentral, irParaGradeSlidesDesdeLetraCompleta } from './letraCompleta.js';
import { definirLembrarMonitor } from '../modules/monitorLembrado.js';
import { iniciarBotaoEncerrarProjecaoCabecalho, modoAbertoTemProjecaoParaEncerrar } from './botaoEncerrarCabecalho.js';
import { encerrarProjecaoDoControlador, reconhecimentoVozSlides } from './projecaoMusica.js';
import { encerrarProjecaoMidiaCabecalhoModoApresentacao, escolherArquivoModoApresentacao, fecharMenuModoApresentacao } from './menuApresentacaoModo.js';
import { estadoPainel } from './estadoPainel.js';
import { exporCallbacksParaAtributosHtml } from '../modules/ponteHtmlWindow.js';
import { fecharLyraMenuModal } from './menuLyra.js';
import { fecharOutrosSeletoresDropdown, setupLyraSelectDropdownWrap } from './temasPlaylistUi.js';
import { garantirMinistrantesCarregados, iniciarSyncPeriodicoTonsInvb } from './ministrantesTons.js';
import { getAppImportarBloqueadoFechar } from './playlistCompartilhar.js';
import { hostProjecao, readLsMigrate } from './servidorAlvo.js';
import { impedirSelecaoDeTextoNoDuploClique, rotaSelecionadaNaUi, setupMenusRoteamentoTelas } from './roteamentoTelasUi.js';
import { iniciarDicasDeTextoTruncado } from '../modules/dicaTexto.js';
import { iniciarPreVoo } from './preVoo.js';
import { initAlturaPreviewModFromStorage, initSlidesRailHeightFromStorage, setupSlidesRailResize } from './slidesRailLayout.js';
import { initSlidesChipZoomFromStorage, initSlidesPorLinhaFromStorage, setupSlidesChipZoomButtons, setupSlidesGridViewportFitObserver, setupSlidesPorLinhaButtons } from './slidesGrelhaPainel.js';
import { ligarProjecaoNestaMaquina, ponteProjecaoLocal } from './projecaoLocalObs.js';
import { loadAberturaRemovidaPorCulto, loadMinistrantePadraoPorCulto, loadPlaylists, loadTemaSelecionadoPorCulto, loadTemasPorCulto, podarMinistrantePadraoSemMusicasNaPlaylist, setAberturaRemovidaPorCulto, setMinistrantePadraoPorCulto } from './playlistTemas.js';
import { loadCultosManuais, migrarPlaylistsCultosAntigos, resolverCultoInicialPorAgenda, setupAdicionarCultoManual, setupCultoDropdown } from './cultoDoDia.js';
import { montarHomeLayout } from './homeLayout.js';
import { pararAudioServidor, playlistAdicionarVideos, playlistAlternarModo, playlistDefinirAtraso, playlistLimpar, renderListaPlaylistApresentacao, tocarAudioAtualSelecionado } from './playlistVideoApresentacao.js';
import { processarMusicasSincronizadasPayload } from './playlistAdicionar.js';
import { renderPlaylist } from './playlistLista.js';
import { renderSlidesStrip, setupSlidesStripContextMenuEEdicaoRapida } from './slidesStrip.js';
import { sairModoComparativoParaTrocarModo } from './comparativoVersoes.js';
import { conectar } from './conexaoLetrasUi.js';
import { initCultoSelect, onCultoChange } from './cultoSeletor.js';

// A Home compõe os controles existentes; callbacks continuam usando o estado do núcleo.















































/* Mesma regra do clique na miniatura e do teclado: com projeção no ar, a página nova vai
   ao telão; parado, os botões só escolhem. */


/* Dois cliques na prévia central projetam a página escolhida — os mesmos gestos das
   miniaturas, para o operador não ter de pensar em que metade do ecrã está. */




/* Menu overflow (⋯) do cabeçalho da playlist. */
export function fecharMenuOverflowPlaylist() {
  const menu = document.getElementById('ap-playlist-overflow-menu');
  const btn = document.getElementById('ap-playlist-overflow-btn');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}






/* Mantém o overlay de preview alinhado ao slot ao rolar/redimensionar. */



















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



// ════════════════════════════════════════════════════════════
//  Dark Mode + Configurações de Exibição (Controlador remoto)
// ════════════════════════════════════════════════════════════

// (extraído) Diálogo padrão do app → painel/appDialog.js

// (extraído) Conteúdo e janela do menu Lyra → painel/lyraMenuConteudo.js e painel/menuLyra.js

// (extraído) Banner de atualização → painel/bannerAtualizacao.js


// (extraído) Exibição (Ajustes) → painel/configExibicao.js


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

export function sincronizarTicksSliderVh(input) {
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







/* (extraído) Contagem regressiva → painel/contagemRegressiva.js */




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



// ─── Pré-voo do culto ─────────────────────────────────────────────────────────────────

/*
 * Verificar antes de começar, em vez de descobrir no primeiro slide.
 *
 * As regras vivem em `modules/preVooPlaylist.js`, testadas à parte. O que está aqui é só a
 * recolha: juntar o que o painel já sabe (rota, monitores, playlist), ir buscar o que
 * falta (as letras) e mostrar o resultado.
 */

// (extraído) pré-voo do culto → painel/preVoo.js

/**
 * Instruções que corriam no carregamento do núcleo. Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarPainel() {
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
  document
    .getElementById('docs-nav-anterior')
    ?.addEventListener('click', () => navegarPaginaDocs(-1, { projetarSeNoAr: true }));
  document
    .getElementById('docs-nav-proxima')
    ?.addEventListener('click', () => navegarPaginaDocs(1, { projetarSeNoAr: true }));
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
  iniciarBotaoEncerrarProjecaoCabecalho();
  document.getElementById('hdr-encerrar-projecao')?.addEventListener('click', () => {
    /* Bloqueio funcional: sem projeção DESTE modo, o clique não encerra a de outro. */
    if (!modoAbertoTemProjecaoParaEncerrar()) return;
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
  window.alert = (msg) => { appAlert(msg); };
  iniciarConfigExibicao();
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
  iniciarPreVoo();
}
