'use strict';

const { autoUpdater } = require('electron-updater');

function mensagemErroAtualizacaoAmigavel(err) {
  const msg = String(err?.message || err || '');
  if (/404|Not Found|not found/i.test(msg)) {
    return (
      'Não foi encontrada atualização no GitHub (erro 404).\n\n' +
      'Confirme se existe uma release publicada no repositório lyra-releases com o arquivo latest.yml e o instalador .exe ' +
      'gerados no mesmo build.'
    );
  }
  if (/406|Not Acceptable/i.test(msg)) {
    return (
      'O GitHub não devolveu a lista de releases (erro 406).\n\n' +
      'Isso costuma acontecer quando ainda não existe uma release publicada com os artefatos do electron-builder.'
    );
  }
  if (/ENOTFOUND|ECONNREFUSED|network|getaddrinfo/i.test(msg)) {
    return 'Falha de rede ao acessar o GitHub Releases. Verifique sua conexão com a internet.';
  }
  return msg.length > 600 ? `${msg.slice(0, 600)}…` : msg;
}

function normalizarReleaseNotes(releaseNotes) {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        return String(item.note || item.name || '');
      })
      .filter(Boolean)
      .join('\n\n');
  }
  return typeof releaseNotes === 'string' ? releaseNotes : '';
}

function createUpdaterApi(ctx, deps) {
  const { app, dialog, getJanelaPrincipal, setUpdateStatusTitle } = deps;

  function limparFlagsVerificacao() {
    ctx.verificacaoManualAtualizacao = false;
    ctx.checkingManual = false;
  }

  function setTaskbarProgress(progress) {
    const w = getJanelaPrincipal();
    if (!w || w.isDestroyed() || typeof w.setProgressBar !== 'function') return;
    try {
      w.setProgressBar(progress);
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  function emitirEventoRenderer(canal, payload) {
    const w = getJanelaPrincipal();
    if (!w || w.isDestroyed()) return false;
    try {
      w.webContents.send(canal, payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  function construirPayloadUpdate(info) {
    const version = String(info?.version || ctx.updateInfo?.version || '');
    const releaseName = String(info?.releaseName || info?.tag || `v${version || app.getVersion()}`);
    const releaseDate = info?.releaseDate ? String(info.releaseDate) : '';
    const notes = normalizarReleaseNotes(info?.releaseNotes);
    return { version, releaseName, releaseDate, notes };
  }

  function mostrarErroAtualizacaoManual(err) {
    const w = getJanelaPrincipal();
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

  async function solicitarVerificacaoAtualizacaoManual() {
    if (!app.isPackaged) {
      await dialog.showMessageBox(getJanelaPrincipal() || undefined, {
        type: 'info',
        title: 'Verificar atualizações',
        message: 'A verificação de atualizações só está disponível no app instalado (.exe).',
        buttons: ['OK'],
      });
      return false;
    }
    if (ctx.updateReady) {
      const { response } = await dialog.showMessageBox(getJanelaPrincipal() || undefined, {
        type: 'info',
        title: 'Atualização pronta',
        message: 'Uma atualização já foi baixada e está pronta para instalar.',
        detail: 'Deseja reiniciar agora para concluir a instalação?',
        buttons: ['Reiniciar agora', 'Depois'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) {
        return instalarAtualizacaoAgora();
      }
      return false;
    }
    if (ctx.checkingManual) return false;
    ctx.checkingManual = true;
    ctx.verificacaoManualAtualizacao = true;
    setUpdateStatusTitle('Verificando atualizações…');
    try {
      await autoUpdater.checkForUpdates();
      return true;
    } catch (err) {
      if (ctx.verificacaoManualAtualizacao) {
        limparFlagsVerificacao();
        setUpdateStatusTitle('');
        mostrarErroAtualizacaoManual(err);
      }
      return false;
    }
  }

  async function baixarAtualizacaoDisponivel() {
    if (!app.isPackaged) return false;
    if (ctx.updateReady || ctx.updateDownloading) return true;
    if (!ctx.updateInfo?.version) return false;
    ctx.updateDownloading = true;
    setUpdateStatusTitle('Baixando atualização…');
    setTaskbarProgress(0);
    emitirEventoRenderer('update-download-started', { version: ctx.updateInfo.version });
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (err) {
      ctx.updateDownloading = false;
      throw err;
    }
  }

  function instalarAtualizacaoAgora() {
    if (!ctx.updateReady) return false;
    setImmediate(() => autoUpdater.quitAndInstall());
    return true;
  }

  function configurarAtualizacaoAutomatica() {
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.disableDifferentialDownload = true;

    autoUpdater.on('checking-for-update', () => {
      if (ctx.verificacaoManualAtualizacao) {
        setUpdateStatusTitle('Verificando atualizações…');
      }
    });

    autoUpdater.on('update-available', (info) => {
      const payload = construirPayloadUpdate(info);
      ctx.updateInfo = payload;
      ctx.updateReady = false;
      ctx.updateDownloading = false;
      limparFlagsVerificacao();
      setTaskbarProgress(-1);
      setUpdateStatusTitle('Atualização disponível');
      emitirEventoRenderer('update-available', payload);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      ctx.updateDownloading = true;
      const pct = Math.max(0, Math.min(100, Math.round(progressObj?.percent || 0)));
      setUpdateStatusTitle(`Baixando atualização… ${pct}%`);
      setTaskbarProgress(pct / 100);
      emitirEventoRenderer('update-download-progress', {
        percent: pct,
        bytesPerSecond: Number(progressObj?.bytesPerSecond || 0),
        transferred: Number(progressObj?.transferred || 0),
        total: Number(progressObj?.total || 0),
      });
    });

    autoUpdater.on('update-not-available', () => {
      ctx.updateInfo = null;
      ctx.updateReady = false;
      ctx.updateDownloading = false;
      setTaskbarProgress(-1);
      if (ctx.verificacaoManualAtualizacao) {
        limparFlagsVerificacao();
        setUpdateStatusTitle('');
        const w = getJanelaPrincipal();
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
      setUpdateStatusTitle('');
    });

    autoUpdater.on('update-downloaded', (info) => {
      const payload = construirPayloadUpdate(info);
      ctx.updateInfo = payload;
      ctx.updateReady = true;
      ctx.updateDownloading = false;
      limparFlagsVerificacao();
      setTaskbarProgress(-1);
      setUpdateStatusTitle('Atualização pronta');
      emitirEventoRenderer('update-downloaded', payload);
    });

    autoUpdater.on('error', (err) => {
      console.error('[Updater][Controller]', err?.message || err);
      ctx.updateDownloading = false;
      setTaskbarProgress(-1);
      if (ctx.verificacaoManualAtualizacao) {
        limparFlagsVerificacao();
        setUpdateStatusTitle('');
        mostrarErroAtualizacaoManual(err);
        return;
      }
      if (ctx.updateInfo?.version) {
        setUpdateStatusTitle('Falha ao baixar atualização');
        emitirEventoRenderer('update-error', {
          message: mensagemErroAtualizacaoAmigavel(err),
        });
        setTimeout(() => {
          if (!ctx.updateDownloading && !ctx.updateReady) {
            setUpdateStatusTitle('Atualização disponível');
          }
        }, 5000);
        return;
      }
      setUpdateStatusTitle('');
    });

    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[Updater][Controller][check silencioso]', err?.message || err);
      });
    }, 5000);
  }

  return {
    configurarAtualizacaoAutomatica,
    solicitarVerificacaoAtualizacaoManual,
    baixarAtualizacaoDisponivel,
    instalarAtualizacaoAgora,
  };
}

module.exports = { createUpdaterApi, autoUpdater };
