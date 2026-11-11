/**
 * Atalhos de teclado globais do painel: ESC da Home (só quando nada está por cima), setas, passador, F10 e
 * demais teclas por modo. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui
 * entra por `registrarDependenciasAtalhosTeclado`.
 */
import { bibliaHaParteProjetada, bibliaNavPopupAberto, bibliaNavPopupFechar, bibliaNavegarVersiculosComSeta, bibliaTratarKeydownModo, encerrarProjecaoModoBiblia } from './biblia.js';
import { direcaoTeclaPassadorSlides, encerrarProjecaoDoControlador, navegarEstrofe, navegarEstrofePassadorSlides, navegarEstrofePorSeta, toggleBlackoutTelas } from './projecaoMusica.js';
import { docsHaPaginaProjetada, encerrarRotaModoDocs, navegarPaginaDocs } from './docs.js';
import { ehModoApresentacaoOperador, ehModoBibliaOperador, ehModoDocsOperador, ehModoSlidesOperador } from './modosUi.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { fecharModalExcluirMusica } from './removerMusicaBanco.js';
import { fecharModalNovaMusicaManual } from './bibliotecaMusicas.js';
import { fecharModalPreviewLetras } from './previewLetras.js';
import { fecharSlideDeleteConfirmModal, fecharSlideQuickEditModal } from './slidesStrip.js';

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

/**
 * Instruções que corriam no carregamento do núcleo. Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarAtalhosTeclado() {
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
}
