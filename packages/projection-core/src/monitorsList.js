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
 * Nome legível vindo do sistema («DELL U2412M», «LG TV», «EPSON PJ»).
 * O Electron devolve string vazia ou «Unknown display» quando o driver não expõe EDID —
 * nesse caso não há nome real e quem chama decide o rótulo de recurso.
 * @param {import('electron').Display} d
 * @returns {string} nome real ou '' quando indisponível
 */
function nomeRealDoDisplay(d) {
  const raw = typeof d?.label === 'string' ? d.label.trim() : '';
  if (!raw) return '';
  if (/^unknown/i.test(raw)) return '';
  return raw;
}

/**
 * Impressão digital do monitor — base de comparação entre execuções.
 *
 * Deliberadamente NÃO inclui posição no desktop nem índice: mover o monitor no arranjo
 * do Windows ou trocar a ordem dos cabos não deve invalidar a configuração guardada.
 * Inclui resolução física e escala porque são o que distingue dois painéis do mesmo modelo
 * em setups reais (TV 1080p vs projetor 720p).
 *
 * @param {import('electron').Display} d
 * @returns {string}
 */
function impressaoDigitalBaseDoDisplay(d) {
  const nome = nomeRealDoDisplay(d) || 'sem-nome';
  const w = Number(d?.size?.width ?? d?.bounds?.width ?? 0);
  const h = Number(d?.size?.height ?? d?.bounds?.height ?? 0);
  const escala = Number(d?.scaleFactor ?? 1);
  const interno = d?.internal ? 'int' : 'ext';
  return `${nome}|${w}x${h}|@${escala}|${interno}`;
}

/**
 * Lista estável dos monitores (`getOrderedDisplays`).
 * Usada pela API HTTP e pela janela de controle (IPC).
 *
 * Cada entrada traz três formas de identificar o mesmo monitor, por ordem de robustez:
 * - `fingerprint` — nome + resolução + escala; sobrevive a renumeração do Windows e a
 *   reinícios. É a chave preferida para restaurar a configuração do utilizador.
 * - `id` — `Display.id` do Electron; fallback quando a impressão digital falha (uma troca
 *   de driver muda o nome EDID, por exemplo). Pode mudar entre sessões no Windows.
 * - `index` — posição na ordem do desktop; só serve dentro da sessão actual, porque
 *   depende do arranjo dos monitores.
 *
 * Monitores indistinguíveis (mesmo modelo, mesma resolução) recebem sufixo `#n` na
 * impressão digital, atribuído pela ordem do desktop — sem isso, dois painéis iguais
 * colapsariam na mesma chave e a restauração escolheria o errado.
 *
 * Nota Windows: Modo «Duplicar» ou espelhar pode fazê-lo como um só output lógico
 * aos olhos do SO — mesmo com físicos diferentes.
 *
 * @param {import('electron').Screen} screenMod
 */
function buildMonitorsList(screenMod) {
  const displays = getOrderedDisplays(screenMod);
  const primaryId = screenMod.getPrimaryDisplay().id;

  /** @type {Map<string, number>} quantas vezes cada base já apareceu */
  const vistos = new Map();

  return displays.map((d, i) => {
    const base = impressaoDigitalBaseDoDisplay(d);
    const ocorrencia = vistos.get(base) || 0;
    vistos.set(base, ocorrencia + 1);
    const fingerprint = ocorrencia === 0 ? base : `${base}#${ocorrencia + 1}`;

    const nome = nomeRealDoDisplay(d);
    const rotuloPosicional = `Monitor ${i + 1}`;

    return {
      index: i,
      id: d.id,
      primary: d.id === primaryId,
      bounds: d.bounds,
      size: d.size,
      scaleFactor: d.scaleFactor,
      internal: !!d.internal,
      fingerprint,
      /** Nome do sistema, ou '' quando o driver não o expõe. */
      nome,
      /** `Monitor N` — usado quando não há nome real e para desambiguar na UI. */
      rotuloPosicional,
      /** Rótulo pronto a mostrar: nome real quando existe, senão a numeração. */
      label: nome || rotuloPosicional,
    };
  });
}

module.exports = {
  getOrderedDisplays,
  buildMonitorsList,
  nomeRealDoDisplay,
  impressaoDigitalBaseDoDisplay,
};
