/**
 * Modo Slides do operador: alternância, trabalho pesado adiado, limpeza do espelho local e da UI ao sair
 * e exposição de callbacks para atributos HTML. Movido verbatim do núcleo (`controllerAppCore.js`); o
 * que o núcleo ainda possui entra por `registrarDependenciasModoSlidesOperador`.
 */
import { LS_UI_MODO_SLIDES } from '../modules/chavesArmazenamentoLocal.js';
import { abrirModoDocs } from './docs.js';
import { alternarModoBiblia, bibliaSairModo, onTraducaoBibliaChange, reconhecimentoVozBiblia } from './biblia.js';
import { aplicarLayoutModoLetraCompleta } from './letraCompleta.js';
import { atualizarPreviewOperador } from './previewProjecao.js';
import { atualizarToolbarModoEdicao, marcacaoEstrofeEditor } from './toolbarEdicaoHome.js';
import { exporCallbacksParaAtributosHtml } from '../modules/ponteHtmlWindow.js';
import { getApresentacaoCardUiClickTimer, setApresentacaoCardSelecionadoIdx, setApresentacaoCardUiClickTimer } from './gridApresentacao.js';
import { precisaReporRotaSlides, rotaSlidesReposta } from '../modules/reposicaoRotaSlides.js';
import { reconhecimentoVozSlides } from './projecaoMusica.js';
import { renderPlaylist } from './playlistLista.js';
import { renderSlidesStrip } from './slidesStrip.js';
import { salvarRoteamentoTelasNoServidor } from './roteamentoTelas.js';
import { slidesAplicarCfgArmazenada } from './configExibicao.js';
import { abrirMenuModoApresentacao } from './menuApresentacaoModo.js';
import { hayProjecaoApresentacaoModoAtiva, hayProjecaoAtivaModoBibliaOuApresentacao, marcarRotaLiveNoDom, rotaDesativada, salvarRotasPorModoNoStorage } from './rotasMonitores.js';
import { rotaSlidesAoEntrarNoModo } from './conteudoUnificadoAviso.js';
import { syncRoteamentoTelasModoSlidesNaUi } from './canaisProjecao.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasModoSlidesOperador(d) {
  dep = d || {};
}
const aplicarRotaDoModoAtualNaUiEServidor = (...a) => dep.aplicarRotaDoModoAtualNaUiEServidor(...a);
const aplicarRotulosEPlaylistModoSlides = (...a) => dep.aplicarRotulosEPlaylistModoSlides(...a);
const atualizarBtnModoApresentacao = (...a) => dep.atualizarBtnModoApresentacao(...a);
const atualizarBtnToggleModoSlides = (...a) => dep.atualizarBtnToggleModoSlides(...a);
const ehModoApresentacaoOperador = (...a) => dep.ehModoApresentacaoOperador(...a);
const ehModoBibliaOperador = (...a) => dep.ehModoBibliaOperador(...a);
const ehModoSlidesOperador = (...a) => dep.ehModoSlidesOperador(...a);
const executarComTransicaoUi = (...a) => dep.executarComTransicaoUi(...a);
const irParaTelaInicial = (...a) => dep.irParaTelaInicial(...a);

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
export function limparEspelhoLocalSoCamadaSlides() {
  const e = dep.getEstadoServidor();
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
  dep.setEstadoServidor({
    tipo: null,
    titulo: '',
    linhas: [],
    estrofeIndex: 0,
    totalEstrofes: 0,
    telaLimpa: true,
    blackout: false,
    slidePretoFinal: false,
    projecaoMinistranteApresentacao: minAp,
  });
}

/**
 * Ao sair do modo slides.
 * Sem projeção: limpa faixa/seleção de slides (comportamento clássico).
 * Com projeção activa: preserva música, estrofe e faixa para retomar ao voltar.
 * Nunca encerra a projeção real — isso fica para ESC / Encerrar.
 */
export function limparUiAoSairDoModoSlides() {
  dep.setSlidesDockVisivel(false);
  if (dep.getProjecaoMusicaEmitidaNoServidor()) {
    /* Projeção no ar: mantém musicaAtiva, estrofeAtiva e a faixa armada. */
    return;
  }
  dep.setEstrofeAtiva(-1);
  dep.setProjecaoMusicaEmitidaNoServidor(false);
  dep.setBloqueioSincronizarEstrofeDoServidor(false);
  /**
   * Limpa a seleção da playlist do modo slides já na saída (e não só ao reentrar):
   * a faixa é sempre rearmada por clique na playlist, então deixá-la «ligada» aqui
   * fazia a linha voltar destacada sobre uma grade vazia.
   * `musicaAtiva` fica intacta de propósito — a Home continua com a música no editor.
   */
  dep.setFaixaSlidesHabilitadaPorPlaylistNoModoSlides(false);
  limparEspelhoLocalSoCamadaSlides();
}

export async function alternarModoSlidesOperador(opts = {}) {
  const permitirDesativar = opts.permitirDesativar === true;
  if (ehModoSlidesOperador() && !permitirDesativar) return;
  if (ehModoBibliaOperador()) {
    /*
     * Só desliga rotas transitórias se nada de Bíblia/mídia estiver no ar.
     * Com projeção activa, os monitores continuam — trocar para Slides é só navegação.
     */
    if (!hayProjecaoAtivaModoBibliaOuApresentacao()) {
      dep.getRotasPorModo().biblia = rotaDesativada();
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
        dep.getRotasPorModo().apresentacao = rotaDesativada();
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
    dep.setSlidesDockVisivel(ativo);
    document.title = ativo ? 'Lyra — Modo slides' : 'Lyra — Controlador';
    try {
      localStorage.setItem(LS_UI_MODO_SLIDES, ativo ? '1' : '0');
    } catch (_) {
  // intencional — erro ignorado
}
    if (ativo) {
      dep.setSlidesRailUserRecolhido(false);
      if (dep.getProjecaoMusicaEmitidaNoServidor() && dep.getMusicaAtiva()) {
        /* Retoma a faixa no ponto da projeção que ficou no ar. */
        dep.setFaixaSlidesHabilitadaPorPlaylistNoModoSlides(true);
        dep.setSlidesDockVisivel(true);
      } else {
        dep.setFaixaSlidesHabilitadaPorPlaylistNoModoSlides(false);
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
      if (precisaReporRotaSlides(dep.getRotasPorModo().slides)) {
        dep.getRotasPorModo().slides = rotaSlidesReposta(dep.getRotasPorModo().slides, rotaSlidesAoEntrarNoModo());
        salvarRotasPorModoNoStorage();
      }
      slidesAplicarCfgArmazenada();
      syncRoteamentoTelasModoSlidesNaUi();
    } else {
      limparUiAoSairDoModoSlides();
    }
    atualizarBtnToggleModoSlides();
    atualizarBtnModoApresentacao();
    dep.setModoLetraCompletaCentral(false);
    aplicarLayoutModoLetraCompleta();
    agendarTrabalhoPesadoAposModoSlides(ativo);
  });
}

/** Botões de modo no HTML — registo cedo para sobreviver a falhas mais abaixo no ficheiro. */

/**
 * Instruções que corriam no carregamento do núcleo. Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarModoSlidesOperador() {
  exporCallbacksParaAtributosHtml({
    irParaTelaInicial,
    alternarModoSlidesOperador,
    alternarModoBiblia,
    onTraducaoBibliaChange,
    abrirMenuModoApresentacao,
    abrirModoDocs,
  });
}
