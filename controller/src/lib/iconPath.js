'use strict';

const path = require('path');
const { app } = require('electron');

function brandDir() {
  if (app.isPackaged && typeof process.resourcesPath === 'string' && process.resourcesPath) {
    return path.join(process.resourcesPath, 'brand');
  }
  return path.join(__dirname, '../../../brand');
}

function caminhoIconeApp() {
  const file = process.platform === 'win32' ? 'lyra-controller.ico' : 'lyra-controller-512.png';
  return path.join(brandDir(), file);
}

function caminhoIconeDock() {
  return path.join(brandDir(), 'lyra-controller-512.png');
}

module.exports = { brandDir, caminhoIconeApp, caminhoIconeDock };
