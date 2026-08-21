'use strict';

const path = require('path');
const fs = require('fs');
const { BrowserWindow, ipcMain, dialog, shell } = require('electron');

const { caminhoIconeApp } = require('./lib/iconPath');
const historicoProjecao = require('./lib/historicoProjecao');

/**
 * Janela «Histórico e relatórios».
 *
 * Janela própria, e não mais uma aba do painel, porque o que se faz aqui não é operar um
 * culto: é olhar para trás, com tempo, e muitas vezes com o painel a projetar ao lado. Uma
 * aba obrigaria a escolher entre as duas coisas.
 *
 * Não guarda estado nenhum do painel nem lhe toca: lê tudo da API HTTP do controlador,
 * exactamente como o painel faz. Abrir esta janela a meio de um culto não pode ter
 * consequência nenhuma no telão.
 */

/** @type {BrowserWindow | null} */
let janela = null;

function paginaHistorico() {
  return path.join(__dirname, '..', 'public', 'historico.html');
}

/**
 * Abre a janela, ou traz para a frente a que já está aberta.
 *
 * Uma só instância de propósito: abrir a terceira cópia do mesmo relatório não ajuda
 * ninguém, e um operador que carrega duas vezes no menu quer ver a janela, não ter duas.
 *
 * @param {BrowserWindow | null} [pai] Janela principal, para a nova nascer por cima dela.
 */
function abrirJanelaHistorico(pai) {
  if (janela && !janela.isDestroyed()) {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
    return janela;
  }

  janela = new BrowserWindow({
    width: 1080,
    height: 680,
    minWidth: 720,
    minHeight: 420,
    title: 'Histórico e relatórios — Lyra',
    icon: caminhoIconeApp(),
    /* Sem `parent`: a janela tem de poder ficar atrás do painel enquanto o operador
       trabalha, e uma janela-filha fica sempre por cima no Windows. */
    backgroundColor: '#f5f3ee',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preloadHistorico.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  janela.once('ready-to-show', () => {
    if (pai && !pai.isDestroyed()) {
      /* Ligeiramente desencostada da principal, para não parecer que a substituiu. */
      const [x, y] = pai.getPosition();
      janela.setPosition(x + 40, y + 40);
    }
    janela.show();
  });

  janela.on('closed', () => {
    janela = null;
  });

  /* Nada nesta página abre links, mas se um dia abrir, abre no browser do sistema e não
     numa janela do Electron sem barra de endereço. */
  janela.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  janela.loadFile(paginaHistorico());
  return janela;
}

function fecharJanelaHistorico() {
  if (janela && !janela.isDestroyed()) janela.close();
}

/** Nome sugerido no diálogo: identifica o conteúdo sem o operador ter de o escrever. */
function nomeFicheiroCsv(vista, periodo) {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const hoje = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const que = vista === 'repertorio' ? 'repertorio' : 'historico';
  return `lyra-${que}-${String(periodo || '').replace(/[^a-z0-9]/gi, '')}-${hoje}.csv`;
}

/**
 * Handlers de IPC desta janela.
 *
 * @param {() => BrowserWindow | null} getJanelaPrincipal
 */
function registarIpcHistorico(getJanelaPrincipal) {
  /**
   * Monta e grava o CSV.
   *
   * O ficheiro é montado aqui, no processo principal, pela mesma função que os testes
   * cobrem (`lib/historicoProjecao`). A janela manda só as linhas que está a mostrar —
   * filtro incluído —, porque o que o operador espera exportar é o que tem à frente.
   */
  ipcMain.handle('historico:exportar-csv', async (_ev, pedido) => {
    try {
      const p = pedido && typeof pedido === 'object' ? pedido : {};
      const linhas = Array.isArray(p.linhas) ? p.linhas : [];
      const agora = Date.now();
      const conteudo =
        p.vista === 'repertorio'
          ? historicoProjecao.csvRepertorio(linhas, agora)
          : historicoProjecao.csvHistorico(linhas);

      const alvo = janela && !janela.isDestroyed() ? janela : getJanelaPrincipal();
      const { canceled, filePath } = await dialog.showSaveDialog(alvo || undefined, {
        title: 'Guardar CSV',
        defaultPath: nomeFicheiroCsv(p.vista, p.periodo),
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (canceled || !filePath) return { cancelado: true };

      /* `utf8` e não `utf-8 sem BOM`: o BOM já vem no início da string, posto lá de
         propósito para o Excel no Windows não estragar os acentos. */
      fs.writeFileSync(filePath, conteudo, 'utf8');
      return { caminho: filePath };
    } catch (e) {
      return { erro: (e && e.message) || String(e) };
    }
  });

  ipcMain.handle('historico:confirmar', async (_ev, opts) => {
    const o = opts && typeof opts === 'object' ? opts : {};
    const alvo = janela && !janela.isDestroyed() ? janela : getJanelaPrincipal();
    const { response } = await dialog.showMessageBox(alvo || undefined, {
      type: o.perigo ? 'warning' : 'question',
      buttons: [String(o.confirmar || 'Confirmar'), 'Cancelar'],
      /* O botão seguro é o predefinido e o do Escape: numa caixa que apaga histórico, o
         Enter distraído tem de não destruir nada. */
      defaultId: 1,
      cancelId: 1,
      title: String(o.titulo || 'Lyra'),
      message: String(o.mensagem || ''),
      detail: o.detalhe ? String(o.detalhe) : undefined,
      noLink: true,
    });
    return response === 0;
  });

  ipcMain.on('historico:fechar', () => fecharJanelaHistorico());
}

module.exports = {
  abrirJanelaHistorico,
  fecharJanelaHistorico,
  registarIpcHistorico,
  nomeFicheiroCsv,
};
