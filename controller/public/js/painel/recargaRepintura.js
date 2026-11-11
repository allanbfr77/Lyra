/**
 * Recarregar o painel, forçar repintura do compositor depois de estados do servidor e ponte IPC do Electron
 * (`lyraElectron`). Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra
 * por `registrarDependenciasRecargaRepintura`.
 */
import { appAlert, fecharAppDialog } from './appDialog.js';
import { atualizarModalStatusReinicioServidor, tratarComandoMenuLyra } from './menuLyra.js';
import { esconderBannerAtualizacao, lyraUpdaterUiState, mostrarBannerAtualizacaoDisponivel, mostrarBannerAtualizacaoPronta, mostrarBannerCompanionDisponivel, mostrarBannerCompanionProgresso, mostrarBannerProgressoAtualizacao } from './bannerAtualizacao.js';
import { projecao } from './estadoPainel.js';
import { tentarAutoConectarSeDesconectado } from './socketPainelApi.js';

let _debounceRecarregarPainelT = null;
export function recarregarPainelControlador() {
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

export function forcarRepinturaCompositorLyra() {
  /* Repintura forçada com a janela oculta/minimizada altera o compositor sem ganho visual
     e provoca «tremida» nas prévias de slides que continuam no DOM. */
  if (document.hidden) return;
  requestAnimationFrame(() => {
    const el = document.documentElement;
    el.classList.add('lyra-gpu-repaint');
    requestAnimationFrame(() => el.classList.remove('lyra-gpu-repaint'));
  });
}


let lyraRepinturaAposEstadoT = 0;

export function assinaturaEstadoProjecaoRecebido(estado) {
  try {
    return JSON.stringify(estado ?? null);
  } catch (_) {
    return null;
  }
}

export function agendarRepinturaCompositorAposEstadoServidor() {
  if (!projecao.pronta()) return;
  const now = Date.now();
  if (now - lyraRepinturaAposEstadoT < 650) return;
  lyraRepinturaAposEstadoT = now;
  forcarRepinturaCompositorLyra();
}

/**
 * Instruções que corriam no carregamento do núcleo. Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarRecargaRepintura() {
  window.forcarRepinturaCompositorLyra = forcarRepinturaCompositorLyra;
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
}
