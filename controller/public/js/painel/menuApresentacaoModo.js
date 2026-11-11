/**
 * Menu do modo Mídias e encerramento da projeção de mídia e do aviso (botão do cabeçalho, escolha de
 * arquivo, tradução, rota do seletor). Movido verbatim do núcleo (`controllerAppCore.js`); o que o
 * núcleo ainda possui entra por `registrarDependenciasMenuApresentacaoModo`.
 */
import { LS_MODO_APRESENTACAO_ATIVO, LS_UI_MODO_SLIDES } from '../modules/chavesArmazenamentoLocal.js';
import { aplicarTraducaoBibliaNoSelect, atualizarBtnModoBiblia, bibliaSairModo, fetchListaTraducoesBiblia, obterBibliaTraducaoSessao, onTraducaoBibliaChange, popularGradeLivros, reconhecimentoVozBiblia } from './biblia.js';
import { atualizarBtnModoDocs } from './docs.js';
import { atualizarPreviewOperador } from './previewProjecao.js';
import { atualizarUiPlayerAudioRemoto, pararAudioLocalApresentacao, pararAudioServidorPlayback } from './playerLocalMidia.js';
import { getApresentacaoCardUiClickTimer, renderGridApresentacao, setApresentacaoCardSelecionadoIdx, setApresentacaoCardUiClickTimer } from './gridApresentacao.js';
import { limparOrdemNaoExibirUnificado } from '../modules/ordemNaoExibirUnificado.js';
import { reconhecimentoVozSlides } from './projecaoMusica.js';
import { renderListaAudiosApresentacao } from './bibliotecaMidiasApresentacao.js';
import { renderListaPlaylistApresentacao } from './playlistVideoApresentacao.js';
import { renderSlidesStrip } from './slidesStrip.js';
import { restaurarVideosModoApresentacao, videoProjetadoAtivoNoPlayer } from './videoApresentacao.js';
import { rotaLembradaParaEntrada } from '../modules/monitorLembrado.js';
import { salvarRoteamentoTelasNoServidor } from './roteamentoTelas.js';
import { aplicarMonitorLembradoAoEntrarNoModo, atualizarIndicadorProjecaoLiveUi, desativarRotasModosTransitorios, hayProjecaoApresentacaoModoAtiva, hayProjecaoAtivaModoBibliaOuApresentacao, hostChaveMonitores, marcarRotaLiveNoDom, normalizarRota, rotaDesativada, salvarRotasPorModoNoStorage, sanitizarRotaProjecao, sincronizarCheckboxLembrarMonitor } from './rotasMonitores.js';
import { atualizarFeedbackProjecaoApresentacaoUi, canaisParaEncerrarConteudoApresentacao, encerrarCanaisApresentacaoNoServidor, getApresentacaoAvisoCard6Ativo, getUltimoConteudoProjetadoModoUnificado, getUltimoPayloadAvisoCard6, obterAlvoProjecaoAvisoCard6, obterAlvoProjecaoModoApresentacao, setApresentacaoAvisoCard6Ativo, setUltimoConteudoProjetadoModoUnificado, setUltimoPayloadAvisoCard6 } from './conteudoUnificadoAviso.js';
import { restaurarRotaSlidesAposLibertarMonitores } from './canaisProjecao.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasMenuApresentacaoModo(d) {
  dep = d || {};
}
const aplicarRotaDoModoAtualNaUiEServidor = (...a) => dep.aplicarRotaDoModoAtualNaUiEServidor(...a);
const aplicarRotulosEPlaylistModoSlides = (...a) => dep.aplicarRotulosEPlaylistModoSlides(...a);
const atualizarBtnModoApresentacao = (...a) => dep.atualizarBtnModoApresentacao(...a);
const atualizarBtnToggleModoSlides = (...a) => dep.atualizarBtnToggleModoSlides(...a);
const ehModoApresentacaoOperador = (...a) => dep.ehModoApresentacaoOperador(...a);
const ehModoBibliaOperador = (...a) => dep.ehModoBibliaOperador(...a);
const ehModoDocsOperador = (...a) => dep.ehModoDocsOperador(...a);
const ehModoSlidesOperador = (...a) => dep.ehModoSlidesOperador(...a);
const executarComTransicaoUi = (...a) => dep.executarComTransicaoUi(...a);
const renderItensLyraSelectDropdown = (...a) => dep.renderItensLyraSelectDropdown(...a);
const renderRoteamentoTelas = (...a) => dep.renderRoteamentoTelas(...a);
const rotaSelecionadaNaUi = (...a) => dep.rotaSelecionadaNaUi(...a);

export function abrirMenuModoApresentacao() {
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
      dep.getRotasPorModo().apresentacao = rotaDesativada();
      dep.getRotasPorModo().apresentacaoAviso = rotaDesativada();
      marcarRotaLiveNoDom(false);
    } else if (!getApresentacaoAvisoCard6Ativo()) {
      dep.getRotasPorModo().apresentacaoAviso = rotaDesativada();
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
export function atualizarBtnTelaInicial() {
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

export async function carregarTraducoes() {
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

export function fecharMenuModoApresentacao() {
  if (!ehModoApresentacaoOperador()) return;
  const preservarProjecao = hayProjecaoApresentacaoModoAtiva();
  executarComTransicaoUi(() => {
    document.body.classList.remove('app-mod-apresentacao');
    document.title = 'Lyra — Controlador';
    if (!preservarProjecao) {
      dep.setApresentacaoMidiaProjetadaId(null);
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

export function escolherArquivoModoApresentacao() {
  const input = document.getElementById('apresentacao-add-menu-input');
  if (!input) return;
  input.value = '';
  input.click();
}

/**
 * Para a mídia no servidor e limpa estado local da mídia (não encerra avisos do card 6).
 */
async function encerrarProjecaoMidiaApresentacaoNoControlador() {
  const eraVideo = dep.getAudioStateRemoto().mediaKind === 'video' && videoProjetadoAtivoNoPlayer();
  if (eraVideo) {
    pararAudioLocalApresentacao();
  } else {
    pararAudioServidorPlayback();
  }

  const alvoMidia =
    getUltimoConteudoProjetadoModoUnificado()?.payload?.alvoProjecao ||
    (dep.getApresentacaoMidiaProjetadaId() ? obterAlvoProjecaoModoApresentacao() : null);
  const alvoAviso =
    getApresentacaoAvisoCard6Ativo()
      ? getUltimoPayloadAvisoCard6()?.alvoProjecao || obterAlvoProjecaoAvisoCard6()
      : null;

  dep.setApresentacaoMidiaProjetadaId(null);
  setUltimoConteudoProjetadoModoUnificado(null);
  dep.setApresentacaoAudioAtualId(null);
  dep.setAudioStateRemoto({ ...dep.getAudioStateRemoto(), playing: false, currentTime: 0, duration: 0, name: '' });

  const canais = canaisParaEncerrarConteudoApresentacao(alvoMidia, alvoAviso);
  if (canais.length) {
    await encerrarCanaisApresentacaoNoServidor(canais);
  }

  if (!getApresentacaoAvisoCard6Ativo()) {
    try {
      localStorage.setItem(LS_MODO_APRESENTACAO_ATIVO, '0');
    } catch (_) {
  // intencional — erro ignorado
}
    dep.setEstadoServidor({
      tipo: null,
      titulo: '',
      linhas: [],
      estrofeIndex: 0,
      totalEstrofes: 0,
      telaLimpa: true,
      blackout: false,
      slidePretoFinal: false,
    });
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
export async function encerrarAvisoCard6NoControlador() {
  if (!getApresentacaoAvisoCard6Ativo()) return;

  const alvoAviso = getUltimoPayloadAvisoCard6()?.alvoProjecao || obterAlvoProjecaoAvisoCard6();
  const alvoMidia =
    dep.getApresentacaoMidiaProjetadaId()
      ? getUltimoConteudoProjetadoModoUnificado()?.payload?.alvoProjecao ||
        obterAlvoProjecaoModoApresentacao()
      : null;

  setApresentacaoAvisoCard6Ativo(false);
  setUltimoPayloadAvisoCard6(null);

  const canais = canaisParaEncerrarConteudoApresentacao(alvoAviso, alvoMidia);
  if (canais.length) {
    await encerrarCanaisApresentacaoNoServidor(canais);
  }

  if (!dep.getApresentacaoMidiaProjetadaId()) {
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
export async function encerrarProjecaoMidiaCabecalhoModoApresentacao() {
  if (!ehModoApresentacaoOperador()) return;
  await encerrarProjecaoMidiaApresentacaoNoControlador();
  dep.getRotasPorModo().apresentacao = rotaDesativada();
  marcarRotaLiveNoDom(false);
  /* Libertar o canal partilhado: canais do Slides desligados só por conflito voltam;
     «Não exibir» manual do Slides nesta sessão fica intocado. */
  restaurarRotaSlidesAposLibertarMonitores();
  atualizarFeedbackProjecaoApresentacaoUi({
    mensagemIdle: getApresentacaoAvisoCard6Ativo()
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
  if (!Array.isArray(dep.getMonitoresServidorCache()) || !dep.getMonitoresServidorCache().length) return;
  const { aplicar, rota } = rotaLembradaParaEntrada(
    hostChaveMonitores(),
    modo,
    dep.getMonitoresServidorCache()
  );
  if (!aplicar) return;
  renderRoteamentoTelas(dep.getMonitoresServidorCache(), sanitizarRotaProjecao(rota, dep.getMonitoresServidorCache()));
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
export async function reidratarRotaApresentacaoDoSeletor() {
  if (!ehModoApresentacaoOperador()) return;
  const atual = normalizarRota(dep.getRotasPorModo().apresentacao);
  if (atual.live || atual.publicoIndex >= 0 || atual.ministranteIndex >= 0) return;
  const daUi = rotaSelecionadaNaUi();
  if (!daUi) return;
  const r = normalizarRota(daUi);
  if (!r.live && r.publicoIndex < 0 && r.ministranteIndex < 0) return;
  dep.getRotasPorModo().apresentacao = sanitizarRotaProjecao(r, dep.getMonitoresServidorCache());
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
}

/**
 * Encerra mídia e aviso, repõe rotas (ex.: sair do modo ou encerrar tudo).
 */
export async function encerrarProjecaoModoApresentacao() {
  if (!ehModoApresentacaoOperador()) return;
  if (getApresentacaoAvisoCard6Ativo()) {
    await encerrarAvisoCard6NoControlador();
  }
  await encerrarProjecaoMidiaApresentacaoNoControlador();
  dep.getRotasPorModo().apresentacao = { publicoIndex: -1, ministranteIndex: -1 };
  dep.getRotasPorModo().apresentacaoAviso = rotaDesativada();
  restaurarRotaSlidesAposLibertarMonitores();
  salvarRotasPorModoNoStorage();
  atualizarFeedbackProjecaoApresentacaoUi({
    mensagemIdle: 'Projeção encerrada. «Monitor» em «Não exibir»; o modo Slides mantém a configuração dele.',
  });
  aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
  atualizarPreviewOperador();
}
