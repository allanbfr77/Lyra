'use strict';

const { autoUpdater } = require('electron-updater');

/**
 * Mensagens amigáveis para falhas do GitHub / rede no auto-updater.
 */
function mensagemErroAtualizacaoAmigavel(err) {
  const msg = String(err?.message || err || '');
  if (/404|Not Found|not found/i.test(msg)) {
    return (
      'Não foi encontrada atualização no GitHub (erro 404).\n\n' +
      'Confirme se existe uma release pública no repositório de updates do servidor, com o arquivo latest.yml e o instalador .exe ' +
      'gerados no mesmo build. Repositórios privados ou sem release retornam 404.'
    );
  }
  if (/406|Not Acceptable/i.test(msg)) {
    return (
      'O GitHub não devolveu a lista de releases (erro 406).\n\n' +
      'Isso costuma acontecer quando não existe nenhuma release publicada no repositório de updates ' +
      '(por exemplo, após apagar todas as releases). Publique pelo menos uma release com latest.yml e o .exe do mesmo build.'
    );
  }
  if (/ENOTFOUND|ECONNREFUSED|network|getaddrinfo/i.test(msg)) {
    return 'Falha de rede ao acessar o servidor de atualizações. Verifique sua conexão com a internet.';
  }
  return msg.length > 600 ? `${msg.slice(0, 600)}…` : msg;
}

/**
 * @param {object} ctx
 * @param {{ app: object, dialog: object, logError: Function, getJanelaControle: Function, setUpdateStatusTitle: (s: string) => void }} deps
 */
function createUpdaterApi(ctx, deps) {
  const { app, dialog, logError, getJanelaControle, setUpdateStatusTitle } = deps;

  function mostrarErroAtualizacaoManual(err) {
    const w = getJanelaControle();
    dialog
      .showMessageBox(w || undefined, {
        type: 'warning',
        title: 'Verificar atualizações',
        message: 'Não foi possível verificar ou transferir atualizações.',
        detail: mensagemErroAtualizacaoAmigavel(err),
        buttons: ['OK'],
      })
      .catch(() => {});
  }

  function solicitarVerificacaoAtualizacaoManual() {
    if (!app.isPackaged) {
      dialog.showMessageBox(getJanelaControle() || undefined, {
        type: 'info',
        title: 'Verificar atualizações',
        message: 'A verificação de atualizações só está disponível no app instalado (.exe).',
        buttons: ['OK'],
      });
      return;
    }
    if (ctx.checkingManual) return;
    ctx.checkingManual = true;
    ctx.verificacaoManualAtualizacao = true;
    setUpdateStatusTitle('Verificando atualizações…');
    autoUpdater.checkForUpdates().catch((err) => {
      if (ctx.verificacaoManualAtualizacao) {
        ctx.verificacaoManualAtualizacao = false;
        ctx.checkingManual = false;
        setUpdateStatusTitle('');
        mostrarErroAtualizacaoManual(err);
      }
    });
  }

  function configurarAtualizacaoAutomatica() {
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.disableDifferentialDownload = true;

    autoUpdater.on('checking-for-update', () => {
      if (!ctx.verificacaoManualAtualizacao) {
        setUpdateStatusTitle('Verificando atualizações…');
      }
    });

    autoUpdater.on('update-available', () => {
      setUpdateStatusTitle('Baixando atualização…');
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const pct = Math.max(0, Math.min(100, Math.round(progressObj?.percent || 0)));
      setUpdateStatusTitle(`Baixando atualização… ${pct}%`);
    });

    autoUpdater.on('update-not-available', () => {
      if (ctx.verificacaoManualAtualizacao) {
        ctx.verificacaoManualAtualizacao = false;
        ctx.checkingManual = false;
        setUpdateStatusTitle('');
        const w = getJanelaControle();
        dialog
          .showMessageBox(w || undefined, {
            type: 'info',
            title: 'Verificar atualizações',
            message: 'Você já está na versão mais recente.',
            detail: `Versão instalada: ${app.getVersion()}`,
            buttons: ['OK'],
          })
          .catch(() => {});
        return;
      }
      setUpdateStatusTitle('Atualizado');
      setTimeout(() => setUpdateStatusTitle(''), 3000);
    });

    autoUpdater.on('update-downloaded', () => {
      ctx.updateReady = true;
      ctx.verificacaoManualAtualizacao = false;
      ctx.checkingManual = false;
      const w = getJanelaControle();
      if (w) w.webContents.send('update_ready');
      setUpdateStatusTitle('Atualização pronta');
      dialog
        .showMessageBox(w || undefined, {
          type: 'info',
          title: 'Atualização pronta',
          message: 'Uma nova versão foi baixada.',
          detail: 'Deseja reiniciar agora para concluir a instalação?',
          buttons: ['Reiniciar agora', 'Depois'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) {
            setImmediate(() => autoUpdater.quitAndInstall());
          } else {
            setUpdateStatusTitle('');
          }
        })
        .catch(() => {});
    });

    autoUpdater.on('error', (err) => {
      logError('updater-server', err);
      if (ctx.verificacaoManualAtualizacao) {
        ctx.verificacaoManualAtualizacao = false;
        ctx.checkingManual = false;
        setUpdateStatusTitle('');
        mostrarErroAtualizacaoManual(err);
        return;
      }
      setUpdateStatusTitle('Falha ao verificar atualizações');
      setTimeout(() => setUpdateStatusTitle(''), 5000);
    });

    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        logError('updater-check-server', err);
      });
    }, 5000);
  }

  return { configurarAtualizacaoAutomatica, solicitarVerificacaoAtualizacaoManual, mensagemErroAtualizacaoAmigavel };
}

module.exports = { createUpdaterApi };
