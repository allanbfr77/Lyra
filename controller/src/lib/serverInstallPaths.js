'use strict';

/**
 * Caminhos da instalação Windows do app Servidor (electron-builder / NSIS).
 *
 * Com oneClick (default), o electron-builder usa o `name` sanitizado do package.json
 * (`lyra-server`) como pasta em %LOCALAPPDATA%\Programs — não o productName.
 */

const path = require('path');

/** Nome da pasta sob Programs (package name sanitizado). */
const SERVER_INSTALL_DIR_NAME = 'lyra-server';

/** Nome do executável (productName do electron-builder). */
const SERVER_EXE_NAME = 'Lyra Servidor.exe';

/**
 * @param {string} [localAppData]
 * @returns {string}
 */
function diretorioInstalacaoServidor(localAppData = process.env.LOCALAPPDATA) {
  const base = String(localAppData || '').trim();
  if (!base) return '';
  return path.join(base, 'Programs', SERVER_INSTALL_DIR_NAME);
}

/**
 * @param {string} [localAppData]
 * @returns {string}
 */
function caminhoExeServidorInstalado(localAppData = process.env.LOCALAPPDATA) {
  const dir = diretorioInstalacaoServidor(localAppData);
  if (!dir) return '';
  return path.join(dir, SERVER_EXE_NAME);
}

/**
 * True se o ExecutablePath aponta para a instalação per-user do Lyra Servidor.
 * @param {string} executablePath
 * @param {string} [localAppData]
 */
function processoPertenceAInstalacaoServidor(executablePath, localAppData = process.env.LOCALAPPDATA) {
  const dir = diretorioInstalacaoServidor(localAppData);
  if (!dir || !executablePath) return false;
  const norm = (p) => String(p).replace(/\//g, '\\').toLowerCase();
  return norm(executablePath).startsWith(norm(dir));
}

module.exports = {
  SERVER_INSTALL_DIR_NAME,
  SERVER_EXE_NAME,
  diretorioInstalacaoServidor,
  caminhoExeServidorInstalado,
  processoPertenceAInstalacaoServidor,
};
