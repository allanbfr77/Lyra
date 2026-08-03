'use strict';

/**
 * Ordenação estável por posição no desktop virtual (esquerda→direita, depois cima→baixo),
 * alinhada à numeração «Identificar» do Windows e ao arranjo em Configurações de vídeo.
 * @param {import('electron').Display} a
 * @param {import('electron').Display} b
 */
function compareDisplaysByDesktopPosition(a, b) {
  if (a.bounds.x !== b.bounds.x) return a.bounds.x - b.bounds.x;
  if (a.bounds.y !== b.bounds.y) return a.bounds.y - b.bounds.y;
  return a.id - b.id;
}

/**
 * Lista de monitores na mesma ordem usada pelos índices de projeção (UI e janelas).
 * @param {import('electron').Screen} screenMod
 * @returns {import('electron').Display[]}
 */
function getOrderedDisplays(screenMod) {
  return [...screenMod.getAllDisplays()].sort(compareDisplaysByDesktopPosition);
}

/**
 * Lista estável dos monitores (`getOrderedDisplays`).
 * Usada pela API HTTP e pela janela de controle (IPC).
 *
 * Nota Windows: Modo «Duplicar» ou espelhar pode fazê-lo como um só output lógico
 * aos olhos do SO — mesmo com físicos diferentes.
 *
 * @param {import('electron').Screen} screenMod
 */
function buildMonitorsList(screenMod) {
  const displays = getOrderedDisplays(screenMod);
  const primaryId = screenMod.getPrimaryDisplay().id;
  return displays.map((d, i) => ({
    index: i,
    primary: d.id === primaryId,
    bounds: d.bounds,
    label: `Monitor ${i + 1}`,
  }));
}

module.exports = { getOrderedDisplays, buildMonitorsList };
