/**
 * Música ativa: seleção no banco, projeção e navegação de estrofes (teclado, passador, voz), ir para o
 * slide N, limpar/encerrar projeção e blackout. Movido verbatim do núcleo (`controllerAppCore.js`); o que
 * o núcleo ainda possui entra por `registrarDependenciasProjecaoMusica`.
 */
import { abrirCfgModal, aplicarCfgRelogio, aplicarWrapImediato, debounceSalvarCfg, fecharCfgModal, getChkVal, lerNumeroInput, limparCfgBusca, mudarAbaCfg, mudarDestinoCfg, onAvisoCard6CfgChange, onCfgBuscaInput, onCfgGeralTemaChange, onCfgGeralVozChange, onClockBgImageCtrlChange, onClockBgTypeCtrlChange, onClockDateFontSizeCtrlInput, onClockFontSizeCtrlInput, onClockVerseFontSizeCtrlInput, onMinistranteBgColorCtrlInput, onMinistranteBgGradientCtrlInput, onMinistranteBgImageCtrlChange, onMinistranteBgTypeCtrlChange, onMinistranteSlideCfgChange, onPublicoBgColorCtrlInput, onPublicoBgGradientCtrlInput, onPublicoBgImageCtrlChange, onPublicoBgTypeCtrlChange, salvarCfgNoServidor, setChkVal, setInputVal, setPosAvisoCard6Ctrl, setPosCtrl, setSelVal, setSpanText, sincronizarFormCfgGeral, toggleCfgSwitch, toggleDarkCtrl } from './configExibicao.js';
import { abrirModalNovaMusicaManual, agendarRenderizacoesOcultasDoModoSlides, buscarLetrasExterno, filtrar, limparBuscaLetras, onBancoFonteChange, onBuscaLetrasInput, onFiltroBuscaChange, refreshListaBanco } from './bibliotecaMusicas.js';
import { abrirModoDocs } from './docs.js';
import { adicionarVersaoAtivaNaPlaylistHome } from './playlistAdicionar.js';
import { alternarCaixaLetrasEdicao, entrarModoEdicao, iniciarCriarNovaVersao, novaEstrofe, renderEstrofesEditor, sairModoEdicao, salvarMusicaServidor } from './editorEstrofes.js';
import { alternarModoBiblia, bibliaAplicarCfgExibicao, bibliaBuscaRapida, bibliaBuscaRapidaTecla, bibliaEscolherFundo, bibliaNavPopupAbrir, bibliaNavPopupFechar, bibliaZerarParteProjetada, bibliaZerarVersiculoSelecionado, bnpConfirmarCap, bnpConfirmarVer, bnpSelecionarLivro, definirFiltroTestamentoBiblia, onBibliaDivisaoCfgChange, onBibliaMinistranteBgTypeCtrlChange, onBibliaMinistranteCfgChange, onBibliaPublicoBgTypeCtrlChange, onBibliaPublicoCfgChange, onTraducaoBibliaChange, reconhecimentoVozBiblia, setBibliaPosCtrl } from './biblia.js';
import { alternarModoComparativoCentral } from './comparativoVersoes.js';
import { alternarModoLetraCompletaCentral, alternarModoLetraCompletaOuVoltarGrade, aplicarLayoutModoLetraCompleta, cancelarModoLetraCompletaCentral, confirmarProsseguirDescartandoEdicaoPendente, entrarModoLetraCompletaCentral, irParaGradeSlidesDesdeLetraCompleta } from './letraCompleta.js';
import { alternarProjecaoNestaMaquina, copiarUrlObs, desligarProjecaoNestaMaquina, ligarProjecaoNestaMaquina } from './projecaoLocalObs.js';
import { apagarCopiaVersaoSelecionada, aplicarBaseMusicaSelecionada, editarNomeVersaoSelecionada, renderMusicaVersoesBar } from './versoesMusica.js';
import { atualizarChecksAoProjetar, atualizarEstadoBtnProximaMusicaPlaylist, marcarUltimaMusicaAoEncerrar } from './playlistTransmitidas.js';
import { atualizarPreviewOperador, emitirEstadoMinistranteAoServidor, hayProjecaoAtivaNoServidor } from './previewProjecao.js';
import { carregarVersoesMusicaServidor, garantirCopiaPadraoServidor, obterRootIdMusicaAtiva } from './copiasLocaisPainel.js';
import { criarIrParaSlideNumero } from '../modules/slidesIrParaNumero.js';
import { criarReconhecimentoVozSlides } from '../modules/reconhecimentoVozSlides.js';
import { dataRefDoCultoImportado } from './playlistCompartilhar.js';
import { ehVersaoServidorId } from '../modules/copiasLocaisLetra.js';
import { encerrarServidorRemotoViaMenu } from './menuLyra.js';
import { exporCallbacksParaAtributosHtml } from '../modules/ponteHtmlWindow.js';
import { fonteBancoItemPlaylist, fonteBancoNormalizada } from '../modules/playlistVersaoMusica.js';
import { listarCultosDisponiveis } from './cultoDoDia.js';
import { nomeMinistrantePorId, onCfgImportTonsArquivoChange, onCfgMinistranteAdicionar, onCfgSyncTonsInvbClick, onSincronizarPlaylistLyraClick } from './ministrantesTons.js';
import { normalizarMinistranteIdPlaylist } from '../modules/playlistMinistranteTom.js';
import { obterTomPlaylistMusicaAtiva, tituloAberturaM3MusicaAtiva } from './tituloAberturaPreview.js';
import { parseLabelCulto } from '../modules/cultosCalendario.js';
import { renderPlaylist } from './playlistLista.js';
import { renderSlidesStrip } from './slidesStrip.js';
import { acionarCancelarBarraPadrao, acionarEditarLetraBarraPadrao, acionarSalvarAlteracoesBarraPadrao, cancelarModoComparativoCentral, marcacaoEstrofeEditor } from './toolbarEdicaoHome.js';
import { alternarOcultacaoPreviewPainel } from './previewOculto.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { abrirMenuModoApresentacao, fecharMenuModoApresentacao } from './menuApresentacaoModo.js';
import { alternarModoSlidesOperador, limparEspelhoLocalSoCamadaSlides } from './modoSlidesOperador.js';
import { aplicarSelecaoUiBiblioteca, aplicarSelecaoUiPlaylist, getPlaylist, indiceProximaMusicaNaPlaylist, playlistItemMesmaVersaoQueAtiva } from './playlistServidor.js';
import { apresentacaoProjecaoAtivaNoCanalPublico } from './canaisProjecao.js';
import { ehModoApresentacaoOperador, ehModoBibliaOperador, ehModoHomeOperador, ehModoSlidesOperador, irParaTelaInicial } from './modosUi.js';
import { getControllerApiBase, hostProjecao } from './servidorAlvo.js';
import { modoRoteamentoAtual } from './rotasMonitores.js';
import { onCfgAutoConectarChange, onCfgLembrarIpChange } from './socketPainelApi.js';
import { revelarChipEstrofeFocado, slidesGrelha } from './slidesGrelhaPainel.js';
import { alternarListaBancoSqlite, conectar } from './conexaoLetrasUi.js';
import { recarregarPainelControlador } from './recargaRepintura.js';
import { getUltimoConteudoProjetadoModoUnificado, setUltimoConteudoProjetadoModoUnificado } from './conteudoUnificadoAviso.js';

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
export async function selecionarMusicaDoBanco(id, opts) {
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
    if (ehModoSlidesOperador()) estadoPainel.slidesRailUserRecolhido = false;
    /* Modo controlador: se já existe projeção ativa, manter a faixa visível ao engatilhar próxima música. */
    estadoPainel.slidesDockVisivel = ehModoSlidesOperador() || estadoPainel.slidesDockVisivel || hayProjecaoAtivaNoServidor();
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

    estadoPainel.musicaBancoFonte = fonteBanco;
    if (versaoReq && ehVersaoServidorId(versaoReq)) {
      const resV = await fetch(`${getControllerApiBase()}/api/musicas/${encodeURIComponent(versaoReq)}`);
      if (!resV.ok) throw new Error(`Falha ao carregar versão (HTTP ${resV.status}).`);
      const ver = await resV.json();
      estadoPainel.musicaAtiva = ver;
      estadoPainel.musicaVersaoLocalId = null;
      estadoPainel.musicaRootId = Number(ver.root_id ?? id);
      const et = document.getElementById('edit-titulo');
      const ea = document.getElementById('edit-artista');
      if (et) et.value = estadoPainel.musicaAtiva.titulo || '';
      if (ea) ea.value = estadoPainel.musicaAtiva.artista || '';
      /* Sem `await`: a barra de versões é informativa e mais um ida-e-volta aqui
         atrasava a projeção. Igual ao que `aplicarBaseMusicaSelecionada` já faz. */
      void carregarVersoesMusicaServidor(estadoPainel.musicaRootId);
    } else {
      aplicarBaseMusicaSelecionada(base, id, versaoReq);
    }
    if (ehModoSlidesOperador()) {
      estadoPainel.faixaSlidesHabilitadaPorPlaylistNoModoSlides = !!(opts && opts.habilitarFaixaModoSlides);
    } else {
      estadoPainel.faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
    }
    estadoPainel.estrofeAtiva = -1;

    /* Antes de construir chips da faixa: sem isto, `projecaoMusicaEmitidaNoServidor` ainda vinha true da música anterior e um único clique no chip projetava. */
    estadoPainel.projecaoMusicaEmitidaNoServidor = false;
    estadoPainel.bloqueioSincronizarEstrofeDoServidor = true;

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
    estadoPainel.musicaAtiva = null;
    estadoPainel.musicaVersaoLocalId = null;
    estadoPainel.musicaRootId = null;
    estadoPainel.versoesMusicaServidorCache = { rootId: null, versoes: [] };
    estadoPainel.musicaBancoFonte = 'user';
    estadoPainel.estrofeAtiva = -1;
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
  if (!estadoPainel.musicaAtiva) return alert('Selecione uma música primeiro.');
  const pl = getPlaylist(estadoPainel.cultoId);
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
      estadoPainel.faixaSlidesHabilitadaPorPlaylistNoModoSlides = true;
      estadoPainel.estrofeAtiva = 0;
      estadoPainel.slidesDockVisivel = ehModoSlidesOperador();
      emitirEstrofeAoServidor(0);
    },
  });
  if (!ok || !estadoPainel.musicaAtiva) return;
  marcacaoEstrofeEditor();
  atualizarEstadoBtnProximaMusicaPlaylist();
}

export function montarPayloadExibirMusica(estrofeIndex) {
  if (!estadoPainel.musicaAtiva) return { musicaId: null, estrofeIndex };
  const payload = { musicaId: estadoPainel.musicaAtiva.id, estrofeIndex };
  payload.estrofes = (estadoPainel.musicaAtiva.estrofes || []).map((s) => String(s ?? ''));
  payload.titulo = String(estadoPainel.musicaAtiva.titulo || '').trim();
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
export function nomeCultoAtivoParaHistorico() {
  if (!estadoPainel.cultoId) return '';
  try {
    const item = listarCultosDisponiveis(dataRefDoCultoImportado(estadoPainel.cultoId)).find(
      (c) => c.id === estadoPainel.cultoId
    );
    if (!item) return estadoPainel.cultoId;
    const p = parseLabelCulto(item.label);
    return [p.data, p.desc].filter(Boolean).join(' — ') || estadoPainel.cultoId;
  } catch (_) {
    return estadoPainel.cultoId;
  }
}

/** Ministrante da música activa na playlist do culto (o do dia, não o cadastro todo). */
function ministrantePlaylistMusicaAtiva() {
  if (!estadoPainel.musicaAtiva || !estadoPainel.cultoId) return { id: null, nome: '' };
  try {
    const pl = getPlaylist(estadoPainel.cultoId);
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
  if (!estadoPainel.musicaAtiva) return;
  const min = ministrantePlaylistMusicaAtiva();
  const corpo = {
    musicaId: Number(estadoPainel.musicaAtiva.id) || null,
    rootId: obterRootIdMusicaAtiva(),
    bancoFonte: fonteBancoNormalizada(estadoPainel.musicaBancoFonte),
    titulo: String(estadoPainel.musicaAtiva.titulo || '').trim(),
    artista: String(estadoPainel.musicaAtiva.artista || '').trim(),
    rotulo: String(estadoPainel.musicaAtiva.rotulo || '').trim(),
    tom: obterTomPlaylistMusicaAtiva(),
    ministranteId: min.id,
    ministranteNome: min.nome,
    cultoId: String(estadoPainel.cultoId || ''),
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

export function emitirEstrofeAoServidor(index) {
  /* Home nunca projeta nos monitores reais: a única saída é a prévia da própria Home, que lê
     `estrofeAtiva` e não depende de nada enviado ao servidor. */
  if (ehModoHomeOperador()) return;
  if (!projecao.pronta() || !estadoPainel.musicaAtiva) return;
  estadoPainel.bloqueioSincronizarEstrofeDoServidor = false;
  estadoPainel.projecaoMusicaEmitidaNoServidor = true;
  if (ehModoSlidesOperador()) estadoPainel.slidesRailUserRecolhido = false;
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
  if (!estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes)) return;
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
  const nEst = estadoPainel.musicaAtiva.estrofes.length;
  const idx = Number(index);
  const slidePreto = Number.isFinite(idx) && idx === nEst;
  const cur =
    !slidePreto && Number.isFinite(idx) && idx >= 0 && idx < nEst
      ? String(estadoPainel.musicaAtiva.estrofes[idx] ?? '')
      : '';
  const nxtIdx = idx + 1;
  const proximoSlidePreto = !slidePreto && nxtIdx === nEst;
  let linhasProximo = [];
  if (!slidePreto && !proximoSlidePreto && nxtIdx >= 0 && nxtIdx < nEst) {
    linhasProximo = String(estadoPainel.musicaAtiva.estrofes[nxtIdx] ?? '').split('\n');
  }
  const prev = estadoPainel.estadoServidor && typeof estadoPainel.estadoServidor === 'object' ? estadoPainel.estadoServidor : {};
  estadoPainel.estadoServidor = {
    ...prev,
    tipo: 'musica',
    titulo: String(estadoPainel.musicaAtiva.titulo || '').trim(),
    linhas: slidePreto ? [] : cur.split('\n'),
    estrofeIndex: Number.isFinite(idx) ? idx : 0,
    totalEstrofes: nEst,
    telaLimpa: false,
    slidePretoFinal: slidePreto,
    proximoSlidePreto,
    linhasProximo,
    musicaId: estadoPainel.musicaAtiva.id,
  };
  /* Permite o eco real do servidor atualizar de novo. */
  estadoPainel.lyraAssinaturaEstadoProjecaoRecebido = null;
}

/** Atualiza só o painel (estrofe «selecionada»). Não envia às telas nem altera a prévia de projeção real — use duplo clique ou setas após projeção iniciada. */
export function exibirEstrofe(index, opts) {
  if (!estadoPainel.musicaAtiva) return;
  if (ehModoSlidesOperador()) estadoPainel.slidesRailUserRecolhido = false;
  estadoPainel.estrofeAtiva = index;
  renderSlidesStrip();
  const semScroll = !!(opts && opts.semScroll);
  if (!semScroll) {
    const suave = !(opts && opts.suave === false);
    requestAnimationFrame(() => revelarChipEstrofeFocado(estadoPainel.estrofeAtiva, { suave }));
  }
  atualizarPreviewOperador();
  renderPlaylist();
  marcacaoEstrofeEditor();
}

export function navegarEstrofe(dir) {
  if (!estadoPainel.musicaAtiva || !estadoPainel.musicaAtiva.estrofes.length) return;
  const idxMaxPreto = estadoPainel.musicaAtiva.estrofes.length;
  const prox = estadoPainel.estrofeAtiva + dir;
  if (prox >= 0 && prox <= idxMaxPreto) {
    exibirEstrofe(prox);
    if (estadoPainel.projecaoMusicaEmitidaNoServidor && projecao.pronta()) {
      emitirEstrofeAoServidor(prox);
    }
  }
}

/**
 * Passador USB / apresentador sem fio (2 teclas): em geral envia PageDown/PageUp ou setas.
 * Devolve +1 (avançar), -1 (voltar) ou 0 se não for tecla de passador.
 */
export function direcaoTeclaPassadorSlides(tecla, code) {
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
export function navegarEstrofePassadorSlides(direcao, opts) {
  if (!estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes) || !estadoPainel.musicaAtiva.estrofes.length) return;
  if (!ehModoSlidesOperador()) {
    navegarEstrofe(direcao);
    return;
  }
  const idxMaxPreto = estadoPainel.musicaAtiva.estrofes.length;
  let base = Number.isFinite(estadoPainel.estrofeAtiva) ? estadoPainel.estrofeAtiva : -1;
  let prox = base + direcao;
  if (base < 0 && direcao > 0) prox = 0;
  prox = Math.max(0, Math.min(idxMaxPreto, prox));
  if (prox === estadoPainel.estrofeAtiva && estadoPainel.projecaoMusicaEmitidaNoServidor) return;
  exibirEstrofe(prox, { suave: !(opts && opts.repetir) });
  if (estadoPainel.projecaoMusicaEmitidaNoServidor && projecao.pronta()) {
    emitirEstrofeAoServidor(prox);
  }
}

/** Botão «Tela preta» do modo slides: vai direto ao último slide (o preto, índice N). */
function irParaSlidePretoModoSlides() {
  if (!estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes) || !estadoPainel.musicaAtiva.estrofes.length) return;
  projecionarEstrofeModoSlides(estadoPainel.musicaAtiva.estrofes.length);
}

/**
 * Atalho «número + Enter» do modo slides: projeta o slide N da música atual.
 * Captura os dígitos no teclado todo (sem foco no campo), menos em campos de texto e com
 * modal / painel por cima. Detalhes em `modules/slidesIrParaNumero.js`.
 */
const irParaSlideNumero = criarIrParaSlideNumero({
  ehModoSlides: ehModoSlidesOperador,
  totalEstrofes: () =>
    estadoPainel.musicaAtiva && Array.isArray(estadoPainel.musicaAtiva.estrofes) ? estadoPainel.musicaAtiva.estrofes.length : 0,
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


/** Comando de voz / atalho: projeta estrofe no índice dado (0 … N, N = tela preta). */
function projecionarEstrofeModoSlides(index) {
  if (!estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes) || !estadoPainel.musicaAtiva.estrofes.length) return;
  const idxMaxPreto = estadoPainel.musicaAtiva.estrofes.length;
  const idx = Math.max(0, Math.min(idxMaxPreto, Number(index)));
  if (projecao.pronta()) {
    emitirEstrofeAoServidor(idx);
    exibirEstrofe(idx);
    return;
  }
  exibirEstrofe(idx);
}

export const reconhecimentoVozSlides = criarReconhecimentoVozSlides({
  ehModoSlides: ehModoSlidesOperador,
  ehModoApresentacao: ehModoApresentacaoOperador,
  // Microfone desativado no modo mídias (mesmo comportamento da Home): só disponível no modo slides.
  painelVozVisivel: () => ehModoSlidesOperador(),
  obterMusicaAtiva: () => estadoPainel.musicaAtiva,
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


export function navegarEstrofePorSeta(tecla, opts) {
  if (!estadoPainel.musicaAtiva || !Array.isArray(estadoPainel.musicaAtiva.estrofes) || !estadoPainel.musicaAtiva.estrofes.length) return;
  const idxMaxPreto = estadoPainel.musicaAtiva.estrofes.length;
  let base = Number.isFinite(estadoPainel.estrofeAtiva) ? estadoPainel.estrofeAtiva : -1;
  if (base < 0) base = 0;
  let prox = base;
  const cols = ehModoSlidesOperador() ? slidesGrelha.getSlidesPorLinha() : 3;

  if (tecla === 'ArrowRight') prox = base + 1;
  else if (tecla === 'ArrowLeft') prox = base - 1;
  else if (tecla === 'ArrowDown') prox = base + cols;
  else if (tecla === 'ArrowUp') prox = base - cols;

  prox = Math.max(0, Math.min(idxMaxPreto, prox));
  if (prox === estadoPainel.estrofeAtiva) return;
  exibirEstrofe(prox, { suave: !(opts && opts.repetir) });
  if (estadoPainel.projecaoMusicaEmitidaNoServidor && projecao.pronta()) {
    emitirEstrofeAoServidor(prox);
  }
}

export function musicaEstadoCombinaComAtiva(estado) {
  if (!estadoPainel.musicaAtiva || estado.tipo !== 'musica') return false;
  if (estado.musicaId != null && estadoPainel.musicaAtiva.id != null) {
    return Number(estado.musicaId) === Number(estadoPainel.musicaAtiva.id);
  }
  return estado.titulo === estadoPainel.musicaAtiva.titulo;
}

export function sincronizarEstrofeAtiva(estado) {
  if (!estado || estado.telaLimpa || estado.tipo === null) {
    estadoPainel.estrofeAtiva = -1;
    estadoPainel.slidesDockVisivel = ehModoSlidesOperador();
    estadoPainel.projecaoMusicaEmitidaNoServidor = false;
    estadoPainel.bloqueioSincronizarEstrofeDoServidor = false;
    renderSlidesStrip();
    renderPlaylist();
    marcacaoEstrofeEditor();
    return;
  }

  if (estado.tipo === 'musica' && musicaEstadoCombinaComAtiva(estado)) {
    if (estadoPainel.bloqueioSincronizarEstrofeDoServidor) return;
    estadoPainel.estrofeAtiva = estado.estrofeIndex;
    if (ehModoSlidesOperador()) estadoPainel.slidesDockVisivel = true;
    estadoPainel.projecaoMusicaEmitidaNoServidor = true;
    renderSlidesStrip();
    renderPlaylist();
    marcacaoEstrofeEditor();
  } else if (estado.tipo === 'musica' && estadoPainel.todasMusicas.length && estado.musicaId != null) {
    const m = estadoPainel.todasMusicas.find((x) => Number(x.id) === Number(estado.musicaId));
    if (m && estadoPainel.musicaAtiva?.id === m.id) {
      if (estadoPainel.bloqueioSincronizarEstrofeDoServidor) return;
      estadoPainel.estrofeAtiva = estado.estrofeIndex;
      if (ehModoSlidesOperador()) estadoPainel.slidesDockVisivel = true;
      estadoPainel.projecaoMusicaEmitidaNoServidor = true;
      renderSlidesStrip();
      renderPlaylist();
      marcacaoEstrofeEditor();
    }
  }
}

function limparTela() {
  if (!projecao.ligada()) return;
  marcarUltimaMusicaAoEncerrar();
  estadoPainel.estrofeAtiva = -1;
  estadoPainel.slidesDockVisivel = ehModoSlidesOperador();
  estadoPainel.projecaoMusicaEmitidaNoServidor = false;
  estadoPainel.bloqueioSincronizarEstrofeDoServidor = false;
  projecao.enfileirar('limpar_tela');
  renderSlidesStrip();
  atualizarPreviewOperador();
  if (estadoPainel.musicaAtiva) renderPlaylist();
  marcacaoEstrofeEditor();
}

/** `limparMusica`: modo slides — ESC desassocia a música do painel (playlist sem linha ativa, faixa de slides oculta). */
export function encerrarProjecaoDoControlador(opts = {}) {
  marcarUltimaMusicaAoEncerrar();
  const limparMusica = !!opts.limparMusica;
  if (limparMusica) {
    estadoPainel.musicaAtiva = null;
    estadoPainel.musicaVersaoLocalId = null;
    estadoPainel.musicaRootId = null;
    estadoPainel.versoesMusicaServidorCache = { rootId: null, versoes: [] };
    renderMusicaVersoesBar();
    estadoPainel.modoEdicaoEstrofes = false;
    estadoPainel.snapshotEdicaoEstrofes = null;
    estadoPainel.snapshotLetraCompleta = null;
    estadoPainel.modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
    estadoPainel.faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
    estadoPainel.selecaoUiPlaylist = null;
    estadoPainel.selecaoUiBiblioteca = null;
  }
  estadoPainel.estrofeAtiva = -1;
  estadoPainel.slidesDockVisivel = ehModoSlidesOperador();
  estadoPainel.projecaoMusicaEmitidaNoServidor = false;
  estadoPainel.bloqueioSincronizarEstrofeDoServidor = false;
  /* Sem isto, `estadoServidor` segue com música até o broadcast — no modo slides o cartão TV voltava pela ramo servidor ≠ painel alinhado.
     Só a camada Slides: Mídias noutro monitor (badge «Imagem no Telão») tem de sobreviver. */
  limparEspelhoLocalSoCamadaSlides();
  /** No controlador, ESC/encerrar limpa as saídas sem fechar as janelas de projeção (emit só se ligado). */
  projecao.enviar('limpar_tela');
  if (ehModoBibliaOperador()) {
    bibliaZerarParteProjetada();
    if (getUltimoConteudoProjetadoModoUnificado()?.tipo === 'biblia') {
      setUltimoConteudoProjetadoModoUnificado(null);
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
  } else if (estadoPainel.musicaAtiva) {
    renderPlaylist();
  }
  marcacaoEstrofeEditor();
}

export function toggleBlackoutTelas() {
  if (!projecao.ligada()) return;
  projecao.enfileirar('toggle_blackout');
}

/**
 * @param {number} index
 * @param {{ rolarComoNasSetas?: boolean }} [opts] Ver a nota sobre a rolagem abaixo.
 */
export function projetarPorDuploCliqueCentral(index, opts = {}) {
  if (!estadoPainel.musicaAtiva || !projecao.pronta()) return;
  estadoPainel.slidesRailUserRecolhido = false;
  estadoPainel.slidesDockVisivel = true;
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

/**
 * Instruções que corriam no carregamento do núcleo. Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarProjecaoMusica() {
  irParaSlideNumero.ligar();
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
}
