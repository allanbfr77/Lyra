'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Identidade da instalação do controlador (para autenticação por allowlist no servidor).
 *
 * Na primeira execução, gera um par { deviceId, secret } e persiste em `userData`.
 * Nas execuções seguintes, reaproveita o mesmo par — o operador não digita nada.
 *  - deviceId: identificador estável desta instalação (não é segredo).
 *  - secret:   valor aleatório que torna a credencial não-forjável (é segredo).
 *
 * Os dois viajam no handshake do Socket.io (`auth: { deviceId, secret, nome }`) e o
 * servidor confere contra a allowlist. Ver docs/arquitetura-controle-estado-acesso.md.
 */

/**
 * @param {() => string} caminhoFn  Caminho do arquivo de identidade (ex.: userData/lyra-device.json).
 * @param {string} [nomePadrao]     Nome amigável desta máquina (ex.: os.hostname()).
 * @returns {{ deviceId: string, secret: string, nome: string }}
 */
function carregarOuCriarIdentidade(caminhoFn, nomePadrao = '') {
  const caminho = caminhoFn();

  // Tenta carregar identidade existente.
  try {
    const raw = fs.readFileSync(caminho, 'utf8');
    const d = JSON.parse(raw);
    if (d && typeof d.deviceId === 'string' && typeof d.secret === 'string' && d.deviceId && d.secret) {
      return { deviceId: d.deviceId, secret: d.secret, nome: d.nome || nomePadrao };
    }
  } catch (_) {
    // intencional — primeira execução ou arquivo inválido: geramos abaixo
  }

  // Primeira execução: gera e persiste (mesma linha de código para os dois — custo quase zero).
  const identidade = {
    deviceId: crypto.randomUUID(),
    secret: crypto.randomUUID(),
    nome: nomePadrao,
  };
  try {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
  } catch (_) {
    // intencional
  }
  const tmp = `${caminho}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(identidade, null, 2), 'utf8');
  fs.renameSync(tmp, caminho);
  return identidade;
}

module.exports = { carregarOuCriarIdentidade };
