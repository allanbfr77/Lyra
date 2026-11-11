/**
 * Banner de atualização (app e componentes do Lyra): disponível, progresso do download, pronta para
 * instalar, e o equivalente para os componentes (Servidor) do «companion». Extraído de
 * controllerAppCore.js sem mudar o comportamento.
 *
 * `lyraUpdaterUiState` é um objeto partilhado: o núcleo grava nele ao receber os eventos do
 * updater e o banner lê daqui. A única variável do núcleo que o banner escreve
 * (`companionHandoffEmCurso`) entra por `registrarDependenciasBannerAtualizacao`.
 */
import { appAlert } from './appDialog.js';
import { estadoPainel } from './estadoPainel.js';

export const lyraUpdaterUiState = {
  downloadEmAndamento: false,
  percentualDownload: 0,
  ultimoPayload: null,
};

function montarTextoDetalhesAtualizacao(payload, incluirPergunta = true) {
  const partes = [];
  const versao = String(payload?.version || '');
  if (versao) {
    partes.push(`Nova versão disponível: ${versao}`);
  } else {
    partes.push('Há uma nova versão disponível para o Lyra Controlador.');
  }
  if (payload?.releaseName) {
    partes.push(`Release: ${String(payload.releaseName)}`);
  }
  if (payload?.notes) {
    partes.push(`Notas da release:\n${String(payload.notes).trim()}`);
  }
  if (incluirPergunta) {
    partes.push('Deseja baixar a atualização agora?');
  }
  return partes.join('\n\n');
}

function obterBannerAtualizacaoElementos() {
  let host = document.getElementById('lyra-update-banner');
  if (!host) {
    host = document.createElement('section');
    host.id = 'lyra-update-banner';
    host.hidden = true;
    host.style.position = 'fixed';
    host.style.right = '18px';
    host.style.bottom = '18px';
    host.style.width = 'min(420px, calc(100vw - 36px))';
    host.style.background = 'var(--surface)';
    host.style.border = '1px solid var(--border)';
    host.style.borderRadius = '14px';
    host.style.boxShadow = '0 18px 54px rgba(0, 0, 0, 0.35)';
    host.style.padding = '14px 14px 12px';
    host.style.zIndex = '9500';
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.gap = '10px';

    const titulo = document.createElement('div');
    titulo.id = 'lyra-update-banner-title';
    titulo.style.fontSize = '16px';
    titulo.style.fontWeight = '700';
    titulo.style.color = 'var(--text)';

    const detalhe = document.createElement('div');
    detalhe.id = 'lyra-update-banner-body';
    detalhe.style.fontSize = '15px';
    detalhe.style.lineHeight = '1.5';
    detalhe.style.color = 'var(--text-muted, #7a726b)';
    detalhe.style.whiteSpace = 'pre-line';

    const progressWrap = document.createElement('div');
    progressWrap.id = 'lyra-update-banner-progress-wrap';
    progressWrap.hidden = true;
    progressWrap.style.display = 'flex';
    progressWrap.style.flexDirection = 'column';
    progressWrap.style.gap = '6px';

    const progressLabel = document.createElement('div');
    progressLabel.id = 'lyra-update-banner-progress-label';
    progressLabel.style.fontSize = '14px';
    progressLabel.style.color = 'var(--text-muted, #7a726b)';

    const progress = document.createElement('progress');
    progress.id = 'lyra-update-banner-progress';
    progress.max = 100;
    progress.value = 0;
    progress.style.width = '100%';
    progress.style.height = '12px';

    progressWrap.appendChild(progressLabel);
    progressWrap.appendChild(progress);

    const actions = document.createElement('div');
    actions.id = 'lyra-update-banner-actions';
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.flexWrap = 'wrap';
    actions.style.gap = '8px';

    host.appendChild(titulo);
    host.appendChild(detalhe);
    host.appendChild(progressWrap);
    host.appendChild(actions);
    document.body.appendChild(host);
  }
  return {
    host,
    titulo: document.getElementById('lyra-update-banner-title'),
    detalhe: document.getElementById('lyra-update-banner-body'),
    progressWrap: document.getElementById('lyra-update-banner-progress-wrap'),
    progressLabel: document.getElementById('lyra-update-banner-progress-label'),
    progress: document.getElementById('lyra-update-banner-progress'),
    actions: document.getElementById('lyra-update-banner-actions'),
  };
}

function configurarBannerAtualizacao({ titulo, mensagem, botoes = [], mostrarProgresso = false, progresso = 0 }) {
  const els = obterBannerAtualizacaoElementos();
  if (!els.host || !els.titulo || !els.detalhe || !els.actions) return;
  els.titulo.textContent = titulo;
  els.detalhe.textContent = mensagem;
  els.actions.innerHTML = '';
  botoes.forEach((botao) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn${botao.primary ? ' primary' : ''}`;
    el.textContent = botao.label;
    el.disabled = !!botao.disabled;
    el.onclick = () => {
      if (typeof botao.onClick === 'function') botao.onClick();
    };
    els.actions.appendChild(el);
  });
  if (els.progressWrap && els.progress && els.progressLabel) {
    els.progressWrap.hidden = !mostrarProgresso;
    els.progressWrap.style.display = mostrarProgresso ? 'flex' : 'none';
    els.progress.value = Math.max(0, Math.min(100, Math.round(Number(progresso || 0))));
    els.progressLabel.textContent = mostrarProgresso
      ? `Download em andamento: ${Math.round(Number(progresso || 0))}%`
      : '';
  }
  els.host.hidden = false;
  els.host.style.display = 'flex';
}

export function esconderBannerAtualizacao() {
  const els = obterBannerAtualizacaoElementos();
  if (!els.host) return;
  els.host.hidden = true;
  els.host.style.display = 'none';
}

export function mostrarBannerAtualizacaoDisponivel(payload) {
  const texto = montarTextoDetalhesAtualizacao(payload, true);
  configurarBannerAtualizacao({
    titulo: 'Atualização disponível',
    mensagem: texto,
    botoes: [
      {
        label: 'Depois',
        onClick: () => esconderBannerAtualizacao(),
      },
      {
        label: 'Atualizar',
        primary: true,
        onClick: async () => {
          lyraUpdaterUiState.downloadEmAndamento = true;
          lyraUpdaterUiState.percentualDownload = 0;
          mostrarBannerProgressoAtualizacao(payload);
          try {
            const ok = await window.lyraElectron?.baixarAtualizacao?.();
            if (!ok) {
              lyraUpdaterUiState.downloadEmAndamento = false;
              esconderBannerAtualizacao();
              await appAlert(
                'Não há atualização pendente para download neste momento.',
                'Atualização'
              );
            }
          } catch (err) {
            lyraUpdaterUiState.downloadEmAndamento = false;
            esconderBannerAtualizacao();
            await appAlert(
              String(err?.message || err || 'Não foi possível iniciar o download da atualização.'),
              'Atualização'
            );
          }
        },
      },
    ],
  });
}

export function mostrarBannerProgressoAtualizacao(payload) {
  const texto = montarTextoDetalhesAtualizacao(payload, false);
  configurarBannerAtualizacao({
    titulo: 'Baixando atualização',
    mensagem: texto,
    botoes: [
      {
        label: 'Baixando…',
        primary: true,
        disabled: true,
      },
    ],
    mostrarProgresso: true,
    progresso: lyraUpdaterUiState.percentualDownload,
  });
}

export function mostrarBannerAtualizacaoPronta(payload) {
  configurarBannerAtualizacao({
    titulo: 'Atualização pronta',
    mensagem:
      `${montarTextoDetalhesAtualizacao(payload, false)}\n\n` +
      'A atualização já foi baixada. Deseja reiniciar o app agora para concluir a instalação?',
    botoes: [
      {
        label: 'Depois',
        onClick: () => esconderBannerAtualizacao(),
      },
      {
        label: 'Reiniciar agora',
        primary: true,
        onClick: async () => {
          try {
            const ok = await window.lyraElectron?.instalarAtualizacaoAgora?.();
            if (!ok) {
              await appAlert(
                'A atualização ainda não está pronta para instalação.',
                'Atualização'
              );
            }
          } catch (err) {
            await appAlert(
              String(err?.message || err || 'Não foi possível reiniciar para instalar a atualização.'),
              'Atualização'
            );
          }
        },
      },
    ],
  });
}

export function mostrarBannerCompanionDisponivel(_payload) {
  configurarBannerAtualizacao({
    titulo: 'Componentes do Lyra',
    mensagem:
      'Há uma atualização disponível para os componentes do Lyra.\n\n' +
      'O Servidor será reiniciado durante a instalação e a projeção poderá ficar ' +
      'indisponível por alguns segundos.\n\n' +
      'Deseja atualizar agora?',
    botoes: [
      {
        label: 'Depois',
        onClick: () => esconderBannerAtualizacao(),
      },
      {
        label: 'Atualizar componentes',
        primary: true,
        onClick: async () => {
          mostrarBannerCompanionProgresso({
            stage: 'download',
            message: 'A descarregar componentes do Lyra…',
            percent: 0,
          });
          try {
            await window.lyraElectron?.instalarCompanionServidor?.();
          } catch (err) {
            esconderBannerAtualizacao();
            await appAlert(
              String(err?.message || err || 'Não foi possível atualizar os componentes do Lyra.'),
              'Componentes do Lyra'
            );
          }
        },
      },
    ],
  });
}

export function mostrarBannerCompanionProgresso(payload) {
  const stage = String(payload?.stage || '');
  if (stage === 'handoff' || stage === 'quit') {
    estadoPainel.companionHandoffEmCurso = true;
  }
  const pct = Math.max(0, Math.min(100, Math.round(Number(payload?.percent || 0))));
  const msg = String(
    payload?.message ||
      'A atualizar componentes do Lyra. O Servidor será reiniciado e a projeção poderá ficar indisponível por alguns segundos.'
  );
  const titulo =
    stage === 'install' || stage === 'quit' || stage === 'waiting' || stage === 'handoff'
      ? 'A instalar componentes'
      : 'A descarregar componentes';

  /* Em download, só atualiza a barra — reconstruir botões a cada % engasgava o UI. */
  if (stage === 'download') {
    const els = obterBannerAtualizacaoElementos();
    if (els.host && !els.host.hidden && els.progressWrap && !els.progressWrap.hidden) {
      if (els.titulo) els.titulo.textContent = titulo;
      if (els.detalhe) els.detalhe.textContent = msg;
      if (els.progress) els.progress.value = pct;
      if (els.progressLabel) els.progressLabel.textContent = `Download em andamento: ${pct}%`;
      return;
    }
  }

  configurarBannerAtualizacao({
    titulo,
    mensagem: msg,
    botoes: [
      {
        label:
          stage === 'download'
            ? 'A descarregar…'
            : stage === 'handoff'
              ? 'A reiniciar…'
              : 'Aguarde…',
        primary: true,
        disabled: true,
      },
    ],
    mostrarProgresso: stage === 'download',
    progresso: pct,
  });
}
