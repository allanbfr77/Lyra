'use strict';

/**
 * Identidade técnica do artefacto Servidor (não é versão de produto).
 * Em builds empacotados vive em `resources/server-build.json`; em dev pode faltar.
 */

const fs = require('fs');
const path = require('path');

function candidatosServerBuildJson() {
  const lista = [];
  try {
    if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
      lista.push(path.join(process.resourcesPath, 'server-build.json'));
    }
  } catch (_) {
    // intencional
  }
  lista.push(path.join(__dirname, '..', '..', 'resources', 'server-build.json'));
  return lista;
}

/**
 * @returns {string} buildId ou '' se ausente
 */
function lerBuildIdServidor() {
  for (const ficheiro of candidatosServerBuildJson()) {
    try {
      if (!fs.existsSync(ficheiro)) continue;
      const raw = JSON.parse(fs.readFileSync(ficheiro, 'utf8'));
      const id = String(raw?.buildId || '').trim();
      if (id) return id;
    } catch (_) {
      // intencional — tenta o próximo candidato
    }
  }
  return '';
}

module.exports = { lerBuildIdServidor, candidatosServerBuildJson };
