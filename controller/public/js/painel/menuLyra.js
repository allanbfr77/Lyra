/**
 * Menu Ajuda/Ferramentas do Lyra: janela modal (`#lyra-menu-modal-overlay`), manual, atalhos, sobre,
 * limpar cache, reiniciar servidor local, encerrar servidor remoto e despacho dos comandos do menu
 * nativo do Electron. Extraído de controllerAppCore.js sem mudar o comportamento.
 *
 * O texto/HTML vive em lyraMenuConteudo.js. As ações que dependem do núcleo (socket, projeção
 * local, pré-voo, Ajustes…) entram por `registrarDependenciasMenuLyra`, no topo do núcleo.
 */
import { appAlert, appConfirm } from './appDialog.js';
import { estadoPainel } from './estadoPainel.js';
import {
  montarHtmlManualLyra,
  montarHtmlAtalhosLyra,
  montarHtmlSobreLyra,
  montarHtmlStatusReinicioServidor,
} from './lyraMenuConteudo.js';

let dep = {};

/**
 * @param {object} d
 * @param {() => *} d.getSocket  socket atual (o núcleo reatribui-o; por isso é lido a cada uso)
 * @param {() => boolean} d.emModoProjecaoLocal
 * @param {() => void} d.interromperReconexaoSocket
 * @param {() => Promise<*>} d.correrPreVooDoCulto
 * @param {() => void} d.recarregarPainelControlador
 * @param {() => Promise<{ ok?: boolean, erro?: string }|undefined>} d.alternarProjecaoNestaMaquina
 * @param {(aba?: string) => void} d.abrirCfgModal
 */
export function registrarDependenciasMenuLyra(d) {
  dep = d || {};
}

const lyraMenuModalState = {
  canClose: true,
};

const lyraServerRestartUiState = {
  emAndamento: false,
  stage: 'idle',
  message: '',
};

function obterLyraMenuModalEls() {
  return {
    overlay: document.getElementById('lyra-menu-modal-overlay'),
    panel: document.getElementById('lyra-menu-modal'),
    eyebrow: document.getElementById('lyra-menu-modal-eyebrow'),
    title: document.getElementById('lyra-menu-modal-title'),
    subtitle: document.getElementById('lyra-menu-modal-subtitle'),
    body: document.getElementById('lyra-menu-modal-body'),
    footer: document.querySelector('#lyra-menu-modal-overlay .lyra-menu-modal-footer'),
    close: document.getElementById('lyra-menu-modal-close'),
    closeX: document.getElementById('lyra-menu-modal-close-x'),
  };
}

function limparVariantesLyraMenuModal(panel) {
  if (!panel) return;
  panel.classList.remove('lyra-menu-modal--wide', 'lyra-menu-modal--about', 'lyra-menu-modal--status');
}


function configurarLyraMenuModal(opts = {}) {
  const els = obterLyraMenuModalEls();
  if (!els.overlay || !els.panel || !els.body || !els.title || !els.close || !els.closeX) return false;

  const variantClass =
    opts.variant === 'about'
      ? 'lyra-menu-modal--about'
      : opts.variant === 'status'
        ? 'lyra-menu-modal--status'
        : 'lyra-menu-modal--wide';
  const canClose = opts.canClose !== false;

  limparVariantesLyraMenuModal(els.panel);
  els.panel.classList.add(variantClass);

  els.title.textContent = String(opts.title || 'Lyra');

  if (els.eyebrow) {
    const mostrarEyebrow = String(opts.eyebrow || '').trim() !== '';
    els.eyebrow.hidden = !mostrarEyebrow;
    els.eyebrow.textContent = mostrarEyebrow ? String(opts.eyebrow) : '';
  }

  if (els.subtitle) {
    const mostrarSubtitle = String(opts.subtitle || '').trim() !== '';
    els.subtitle.hidden = !mostrarSubtitle;
    els.subtitle.textContent = mostrarSubtitle ? String(opts.subtitle) : '';
  }

  els.body.innerHTML = String(opts.html || '');
  els.close.textContent = String(opts.closeLabel || 'Fechar');
  els.close.disabled = !canClose;
  els.closeX.disabled = !canClose;
  els.closeX.hidden = opts.showCloseIcon === false;
  if (els.footer) els.footer.hidden = opts.showFooter === false;

  lyraMenuModalState.canClose = canClose;
  return true;
}

function abrirLyraMenuModal(opts = {}) {
  const els = obterLyraMenuModalEls();
  if (!configurarLyraMenuModal(opts) || !els.overlay) return false;
  els.overlay.hidden = false;
  els.overlay.classList.add('aberto');
  requestAnimationFrame(() => {
    try {
      if (lyraMenuModalState.canClose) {
        (els.closeX.hidden ? els.close : els.closeX)?.focus({ preventScroll: true });
      }
    } catch (_) {
  // intencional — erro ignorado
}
  });
  return true;
}

function atualizarLyraMenuModal(opts = {}) {
  const els = obterLyraMenuModalEls();
  if (!els.overlay) return false;
  if (els.overlay.hidden || !els.overlay.classList.contains('aberto')) {
    return abrirLyraMenuModal(opts);
  }
  return configurarLyraMenuModal(opts);
}

export function fecharLyraMenuModal(force = false) {
  const els = obterLyraMenuModalEls();
  if (!els.overlay) return false;
  if (!force && !lyraMenuModalState.canClose) return false;
  els.overlay.classList.remove('aberto');
  els.overlay.hidden = true;
  if (els.body) els.body.innerHTML = '';
  if (els.close) {
    els.close.disabled = false;
    els.close.textContent = 'Fechar';
  }
  if (els.closeX) {
    els.closeX.disabled = false;
    els.closeX.hidden = false;
  }
  lyraMenuModalState.canClose = true;
  return true;
}

async function obterVersaoAppLyra() {
  try {
    const version = await window.lyraElectron?.obterVersaoApp?.();
    return version ? String(version) : 'Não disponível';
  } catch (_) {
    return 'Não disponível';
  }
}

function abrirManualUsuarioLyra() {
  abrirLyraMenuModal({
    variant: 'wide',
    eyebrow: 'Ajuda',
    title: 'Manual básico do Lyra',
    subtitle: 'Resumo de operação do controlador, do servidor e dos fluxos de projeção.',
    html: montarHtmlManualLyra(),
  });
}

function abrirAtalhosLyra() {
  abrirLyraMenuModal({
    variant: 'wide',
    eyebrow: 'Ajuda',
    title: 'Atalhos de teclado',
    subtitle: 'Levantamento dos atalhos já implementados no código do projeto.',
    html: montarHtmlAtalhosLyra(),
  });
}

async function abrirSobreLyra() {
  const version = await obterVersaoAppLyra();
  abrirLyraMenuModal({
    variant: 'about',
    eyebrow: 'Sobre',
    title: 'Lyra',
    subtitle: 'Informações da aplicação.',
    html: montarHtmlSobreLyra(version),
  });
}

export function atualizarModalStatusReinicioServidor(stage, message) {
  if (stage) lyraServerRestartUiState.stage = String(stage);
  if (message) lyraServerRestartUiState.message = String(message);

  const kind =
    lyraServerRestartUiState.stage === 'ready'
      ? 'success'
      : lyraServerRestartUiState.stage === 'error'
        ? 'error'
        : 'progress';

  atualizarLyraMenuModal({
    variant: 'status',
    eyebrow: 'Ferramentas',
    title:
      kind === 'success'
        ? 'Servidor reiniciado'
        : kind === 'error'
          ? 'Falha ao reiniciar o servidor'
          : 'Reiniciando servidor',
    subtitle:
      kind === 'success'
        ? 'O servidor local já voltou a responder.'
        : kind === 'error'
          ? 'Confira a mensagem abaixo antes de tentar novamente.'
          : 'Aguarde enquanto o servidor local é reiniciado.',
    html: montarHtmlStatusReinicioServidor(kind, lyraServerRestartUiState.message),
    canClose: kind !== 'progress',
    closeLabel: kind === 'progress' ? 'Aguarde...' : 'Fechar',
    showCloseIcon: kind !== 'progress',
  });
}

async function limparCacheElectronViaMenu() {
  if (typeof window.lyraElectron?.limparCacheElectron !== 'function') {
    await appAlert('Este recurso só está disponível no aplicativo Electron.', 'Limpar cache');
    return;
  }
  try {
    const result = await window.lyraElectron.limparCacheElectron();
    await appAlert(
      String(result?.message || 'Cache e dados temporários limpos com sucesso.'),
      'Limpar cache'
    );
  } catch (err) {
    await appAlert(
      String(err?.message || err || 'Não foi possível limpar o cache da sessão.'),
      'Limpar cache'
    );
  }
}

async function reiniciarServidorLocalViaMenu() {
  if (lyraServerRestartUiState.emAndamento) {
    atualizarModalStatusReinicioServidor(
      lyraServerRestartUiState.stage || 'starting',
      lyraServerRestartUiState.message || 'Já existe um reinício em andamento.'
    );
    return;
  }
  if (typeof window.lyraElectron?.reiniciarServidorLocal !== 'function') {
    await appAlert('Este recurso só está disponível no aplicativo Electron.', 'Reiniciar servidor');
    return;
  }

  lyraServerRestartUiState.emAndamento = true;
  lyraServerRestartUiState.stage = 'starting';
  lyraServerRestartUiState.message = 'Solicitando reinicialização do servidor local...';
  atualizarModalStatusReinicioServidor();

  try {
    const result = await window.lyraElectron.reiniciarServidorLocal();
    lyraServerRestartUiState.stage = 'ready';
    lyraServerRestartUiState.message = String(result?.message || 'Servidor local reiniciado com sucesso.');
    atualizarModalStatusReinicioServidor();
  } catch (err) {
    lyraServerRestartUiState.stage = 'error';
    lyraServerRestartUiState.message = String(
      err?.message || err || 'Não foi possível reiniciar o servidor local.'
    );
    atualizarModalStatusReinicioServidor();
  } finally {
    lyraServerRestartUiState.emAndamento = false;
  }
}

/**
 * Pede ao Servidor remoto que encerre o processo (cenário de dois PCs).
 * Corta reconnect já no emit; o disconnect existente reassume o modo local.
 */
export async function encerrarServidorRemotoViaMenu() {
  if (dep.emModoProjecaoLocal() || !estadoPainel.socket || !estadoPainel.socket.connected) {
    await appAlert(
      'Conecte ao Servidor remoto (Ajustes › Conexão) para poder encerrá-lo.',
      'Encerrar Server'
    );
    return;
  }
  const ok = await appConfirm(
    'Encerrar o Servidor no PC de projeção?\n\n' +
      'As telas desse PC fecham e este Controlador volta a projetar nesta máquina.',
    'Encerrar Server'
  );
  if (!ok) return;
  /* Antes do emit: se o Servidor cair a seguir, o cliente não tenta ligar outra vez. */
  dep.interromperReconexaoSocket();
  try {
    await new Promise((resolve) => {
      let feito = false;
      const acabar = () => {
        if (feito) return;
        feito = true;
        resolve();
      };
      const t = setTimeout(acabar, 2000);
      try {
        estadoPainel.socket.emit('encerrar_servidor', {}, (ack) => {
          clearTimeout(t);
          if (ack && ack.ok === false) {
            void appAlert(
              ack.erro === 'somente-leitura'
                ? 'Só o Controlador primário pode encerrar o Servidor.'
                : (ack.erro || 'O Servidor recusou o encerramento.'),
              'Encerrar Server'
            );
          }
          acabar();
        });
      } catch (_) {
        clearTimeout(t);
        acabar();
      }
    });
  } catch (err) {
    await appAlert(
      String(err?.message || err || 'Não foi possível enviar o comando ao Servidor.'),
      'Encerrar Server'
    );
  }
}

export async function tratarComandoMenuLyra(payload) {
  const command = String(payload?.command || '');
  if (!command) return;

  if (command === 'culto-prevoo') {
    await dep.correrPreVooDoCulto();
    return;
  }
  if (command === 'tools-clear-cache') {
    await limparCacheElectronViaMenu();
    return;
  }
  if (command === 'tools-recarregar-painel') {
    dep.recarregarPainelControlador();
    return;
  }
  if (command === 'tools-restart-local-server') {
    await reiniciarServidorLocalViaMenu();
    return;
  }
  if (command === 'tools-encerrar-servidor') {
    await encerrarServidorRemotoViaMenu();
    return;
  }
  if (command === 'tools-projetar-nesta-maquina') {
    const r = await dep.alternarProjecaoNestaMaquina();
    if (r && r.ok === false && r.erro) alert(r.erro);
    return;
  }
  /* Leva ao sítio onde o IP se escreve; quem liga é o botão «Conectar» de lá. O menu é só
     o atalho descobrível — e a ligação vale para a sessão, nada se grava. */
  if (command === 'tools-conectar-servidor-remoto') {
    dep.abrirCfgModal('conexao');
    document.getElementById('ip-input')?.focus();
    return;
  }
  if (command === 'help-open-manual') {
    abrirManualUsuarioLyra();
    return;
  }
  if (command === 'help-open-shortcuts') {
    abrirAtalhosLyra();
    return;
  }
  if (command === 'help-open-about') {
    await abrirSobreLyra();
  }
}
