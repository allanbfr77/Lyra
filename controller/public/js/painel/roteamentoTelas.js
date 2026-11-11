/**
 * Roteamento de telas no servidor: carregar o roteamento, calcular o seletor por modo e salvar as rotas.
 * Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasRoteamentoTelas`.
 */
import { atualizarPreviewOperador } from './previewProjecao.js';
import { bibliaAplicarCfgExibicao, marcarRotaBibliaSincronizada } from './biblia.js';
import { marcarRotaDocsSincronizada } from './docs.js';
import { obterNaoExibirManualSlides, precisaReporRotaSlides, rotaSlidesReposta, sincronizarNaoExibirManualSlidesDaEscolha } from '../modules/reposicaoRotaSlides.js';
import { ordemNaoExibirDoSeletorUnificado } from '../modules/ordemNaoExibirUnificado.js';
import { rotaContagemParaServidor } from './contagemRegressiva.js';
import { rotaSlidesParaEnvioComApresentacao, rotaSlidesParaEnvioComBiblia } from '../modules/supressaoCanalSlides.js';
import { setPreVooMonitoresEmFalta } from './preVoo.js';
import { aplicarPreviewPainelOcultoNoDom } from './previewOculto.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { aplicarRotaDoModoAtualNaUiEServidor, avisarMonitoresConfiguradosEmFalta, rotaSelecionadaNaUi } from './roteamentoTelasUi.js';
import { atualizarFeedbackProjecaoApresentacaoUi, obterRotaApresentacaoParaServidor, rotaSlidesAoEntrarNoModo } from './conteudoUnificadoAviso.js';
import { ehModoSlidesOperador } from './modosUi.js';
import { hayProjecaoMidiaApresentacaoAtiva, modoRoteamentoAtual, normalizarRota, persistirIdentidadesDosModos, rotaRestauradaPorIdentidade, rotaSemMonitorRepetido, salvarRotasPorModoNoStorage, sanitizarRotaProjecao } from './rotasMonitores.js';
import { hostProjecao } from './servidorAlvo.js';
import { restaurarRotaSlidesAposLibertarMonitores } from './canaisProjecao.js';
import { emitirEstrofeAoServidor } from './projecaoMusica.js';

export async function carregarRoteamentoTelasDoServidor() {
  const ip = hostProjecao();
  if (!ip) return;
  try {
    const [rMon, rRoute] = await Promise.all([
      fetch(`http://${ip}:5510/api/monitores`),
      fetch(`http://${ip}:5510/api/display-routing`),
    ]);
    const mon = await rMon.json().catch(() => []);
    const route = await rRoute.json().catch(() => ({}));
    estadoPainel.monitoresServidorCache = Array.isArray(mon) ? mon : [];
    let slidesSrv;
    let apSrv;
    if (route && route.version === 2 && route.slides && route.apresentacao) {
      slidesSrv = sanitizarRotaProjecao(route.slides, estadoPainel.monitoresServidorCache);
      apSrv = sanitizarRotaProjecao(route.apresentacao, estadoPainel.monitoresServidorCache);
    } else {
      const leg = sanitizarRotaProjecao(route || {}, estadoPainel.monitoresServidorCache);
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
    const restCompleto = rotaRestauradaPorIdentidade('completo', estadoPainel.rotasPorModo.completo);
    estadoPainel.rotasPorModo.completo = restCompleto.rota;
    const faltou = [...restSlides.faltou, ...restCompleto.faltou];
    avisarMonitoresConfiguradosEmFalta(faltou);
    /* O pré-voo relata o mesmo, mas só quando o operador pergunta — a faixa do cabeçalho
       avisa na hora, e a lista da verificação recolhe-o junto do resto. */
    setPreVooMonitoresEmFalta(faltou);
    /* Apresentação primeiro: a reposição do Slides desvia-se do que a mídia já ocupa. */
    estadoPainel.rotasPorModo.apresentacao = { ...apSrv };
    if (precisaReporRotaSlides(estadoPainel.rotasPorModo.slides)) {
      estadoPainel.rotasPorModo.slides = rotaSlidesReposta(
        estadoPainel.rotasPorModo.slides,
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
      normalizarRota(estadoPainel.rotasPorModo.completo).publicoIndex === -1 &&
      normalizarRota(estadoPainel.rotasPorModo.completo).ministranteIndex === -1;
    if (semSalvo) {
      const padraoSlides = normalizarRota(estadoPainel.rotasPorModo.slides);
      if (padraoSlides.publicoIndex >= 0 || padraoSlides.ministranteIndex >= 0) {
        estadoPainel.rotasPorModo.completo = { ...padraoSlides };
        salvarRotasPorModoNoStorage();
      }
    }
    /**
     * Não sincronizar o modo atual para o servidor só por ligar o socket:
     * no modo slides com telão «Não exibir» (-1,-1) isso gravava -1 no PC servidor
     * e `garantirTelasAbertasParaProjecao` deixava de abrir janelas — só prévias no painel.
     */
    if (ehModoSlidesOperador()) {
      const s = normalizarRota(estadoPainel.rotasPorModo.slides);
      if (s.publicoIndex < 0 && s.ministranteIndex < 0) {
        /* Só preenche se não for «Não exibir» manual nesta sessão. */
        if (precisaReporRotaSlides(s)) {
          estadoPainel.rotasPorModo.slides = rotaSlidesAoEntrarNoModo();
          salvarRotasPorModoNoStorage();
        }
      }
    }
    await aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
    const modo = modoRoteamentoAtual();
    const rotaLocalModo = normalizarRota(estadoPainel.rotasPorModo[modo]);
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

  const enviada = normalizarRota(estadoPainel.rotasPorModo.slides);
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
          const c = normalizarRota(estadoPainel.rotasPorModo.completo);
          return { publico: c.publicoIndex < 0, ministrante: c.ministranteIndex < 0 };
        })();

  /* E só apaga o canal que de facto vai sair a −1: se o ajuste lhe deu um monitor, há
     conteúdo para mostrar e nada a apagar. */
  return {
    publico: !!escolha.publico && enviada.publicoIndex < 0,
    ministrante: !!escolha.ministrante && enviada.ministranteIndex < 0,
  };
}

export async function salvarRoteamentoTelasNoServidor(opts = {}) {
  const usarValoresDaUi = opts.usarValoresDaUi !== false;
  const modo = modoRoteamentoAtual();
  /** 'publico' | 'ministrante' — a saída que o operador acabou de escolher, quando veio de um clique. */
  const canalEscolhido =
    opts.canalEscolhido === 'publico' || opts.canalEscolhido === 'ministrante'
      ? opts.canalEscolhido
      : null;

  const slidesAntes = normalizarRota(estadoPainel.rotasPorModo.slides);

  if (usarValoresDaUi) {
    const fromUi = rotaSelecionadaNaUi();
    if (!fromUi) return;
    estadoPainel.rotasPorModo[modo] = { ...normalizarRota(fromUi) };

    /* Rede de segurança da regra «um monitor, uma saída». O clique já libertou a outra
       saída; isto cobre um DOM fora de sincronia e deixa a regra escrita num sítio só. */
    if (modo === 'slides' || modo === 'completo') {
      estadoPainel.rotasPorModo[modo] = rotaSemMonitorRepetido(estadoPainel.rotasPorModo[modo], 'publico');
    }

    if (modo === 'slides') {
      /* Marca «Não exibir» manual a partir do clique — antes do ajuste por conflito com
         Mídias, que também escreve −1 e não pode contar como escolha do operador.
         E só para a saída que o clique mexeu: a rota vem do DOM com as duas, e o −1 que
         o outro seletor trazia é justamente o do conflito com as Mídias. */
      sincronizarNaoExibirManualSlidesDaEscolha(
        estadoPainel.rotasPorModo.slides,
        canalEscolhido ? { publico: canalEscolhido === 'publico', ministrante: canalEscolhido === 'ministrante' } : null
      );
      estadoPainel.rotasPorModo.slides = normalizarRota(estadoPainel.rotasPorModo.slides);
    } else if (modo === 'completo') {
      estadoPainel.rotasPorModo.slides = normalizarRota(estadoPainel.rotasPorModo.completo);
    } else if (modo === 'apresentacao') {
      const a = normalizarRota(estadoPainel.rotasPorModo.apresentacao);
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
        estadoPainel.rotasPorModo.biblia = { ...normalizarRota(estadoPainel.rotasPorModo.apresentacao) };
      } else {
        estadoPainel.rotasPorModo.apresentacao = { ...normalizarRota(estadoPainel.rotasPorModo.biblia) };
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
        estadoPainel.rotasPorModo.docs = { ...normalizarRota(estadoPainel.rotasPorModo.apresentacao) };
      } else {
        estadoPainel.rotasPorModo.apresentacao = { ...normalizarRota(estadoPainel.rotasPorModo.docs) };
      }
    }

    if (modo !== 'biblia' && modo !== 'apresentacao' && modo !== 'docs') {
      salvarRotasPorModoNoStorage();
    }
  }

  estadoPainel.rotasPorModo.slides = sanitizarRotaProjecao(estadoPainel.rotasPorModo.slides, estadoPainel.monitoresServidorCache);
  estadoPainel.rotasPorModo.apresentacao = sanitizarRotaProjecao(estadoPainel.rotasPorModo.apresentacao, estadoPainel.monitoresServidorCache);
  estadoPainel.rotasPorModo.apresentacaoAviso = sanitizarRotaProjecao(
    estadoPainel.rotasPorModo.apresentacaoAviso,
    estadoPainel.monitoresServidorCache
  );
  estadoPainel.rotasPorModo.contagem = sanitizarRotaProjecao(estadoPainel.rotasPorModo.contagem, estadoPainel.monitoresServidorCache);
  if (modo === 'biblia') {
    estadoPainel.rotasPorModo.biblia = sanitizarRotaProjecao(estadoPainel.rotasPorModo.biblia, estadoPainel.monitoresServidorCache);
  }
  if (modo === 'docs') {
    estadoPainel.rotasPorModo.docs = sanitizarRotaProjecao(estadoPainel.rotasPorModo.docs, estadoPainel.monitoresServidorCache);
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
        ? rotaSlidesParaEnvioComBiblia(estadoPainel.rotasPorModo.biblia, estadoPainel.rotasPorModo.slides)
        : /* Mesma ideia, para o monitor que as Mídias estão a ocupar: silencia-se o canal
             no pacote, sem tocar na configuração do operador. Ver o módulo. */
          rotaSlidesParaEnvioComApresentacao(
            obterRotaApresentacaoParaServidor(),
            estadoPainel.rotasPorModo.slides
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
      const pubDepois = normalizarRota(estadoPainel.rotasPorModo.slides).publicoIndex;
      const publicoFoiAtivadoAgora = slidesAntes.publicoIndex < 0 && pubDepois >= 0;
      if (publicoFoiAtivadoAgora) {
        if (estadoPainel.musicaAtiva && Number.isFinite(estadoPainel.estrofeAtiva) && estadoPainel.estrofeAtiva >= 0) {
          emitirEstrofeAoServidor(estadoPainel.estrofeAtiva);
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
