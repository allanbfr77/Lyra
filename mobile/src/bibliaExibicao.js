/**
 * Configuração global de exibição Bíblia (M2 + M3) — espelha campos do controlador.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { urlApiProjecao } from './lyraEndpoints';

const STORAGE_KEY = 'lyra_biblia_exibicao_mobile_v1';

/** @typedef {{ fontSize: number, wrapLongLines: boolean, posY: 'top'|'center'|'bottom' }} BibliaExibicaoCfg */

export const BIBLIA_EXIBICAO_PADRAO = {
  fontSize: 5.5,
  wrapLongLines: true,
  posY: 'center',
};

export const BIBLIA_FONTE_MIN = 2.2;
export const BIBLIA_FONTE_MAX = 9;
export const BIBLIA_FONTE_STEP = 0.5;

/**
 * @param {Partial<BibliaExibicaoCfg>} raw
 * @returns {BibliaExibicaoCfg}
 */
export function normalizarCfgExibicaoBiblia(raw) {
  const fontSize = Number(raw?.fontSize);
  const posY = String(raw?.posY || 'center').toLowerCase();
  return {
    fontSize: Number.isFinite(fontSize)
      ? Math.min(BIBLIA_FONTE_MAX, Math.max(BIBLIA_FONTE_MIN, fontSize))
      : BIBLIA_EXIBICAO_PADRAO.fontSize,
    wrapLongLines: raw?.wrapLongLines !== false,
    posY: posY === 'top' || posY === 'bottom' ? posY : 'center',
  };
}

/**
 * @returns {Promise<BibliaExibicaoCfg>}
 */
export async function carregarCfgExibicaoBiblia() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...BIBLIA_EXIBICAO_PADRAO };
    return normalizarCfgExibicaoBiblia(JSON.parse(raw));
  } catch (_) {
    return { ...BIBLIA_EXIBICAO_PADRAO };
  }
}

/**
 * @param {BibliaExibicaoCfg} cfg
 */
export async function salvarCfgExibicaoBiblia(cfg) {
  const norm = normalizarCfgExibicaoBiblia(cfg);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(norm));
  return norm;
}

/**
 * Camada única aplicada em público (M2) e ministrante (M3).
 *
 * @param {BibliaExibicaoCfg} cfg
 */
export function payloadDisplayConfigBiblia(cfg) {
  const c = normalizarCfgExibicaoBiblia(cfg);
  const camada = {
    fontSize: c.fontSize,
    wrapLongLines: c.wrapLongLines,
    posX: 'center',
    posY: c.posY,
    textAlign: 'center',
  };
  return {
    modoConfig: 'biblia',
    forcarModo: 'biblia',
    publico: { ...camada },
    ministrante: { ...camada },
  };
}

/**
 * @param {string} host
 * @param {BibliaExibicaoCfg} cfg
 */
export async function enviarCfgExibicaoBibliaHttp(host, cfg) {
  const base = urlApiProjecao(host);
  if (!base) return;
  const body = payloadDisplayConfigBiblia(cfg);
  try {
    await fetch(`${base}/api/display-config/preview`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (_) {}
}

/**
 * @param {import('socket.io-client').Socket|null|undefined} socket
 * @param {BibliaExibicaoCfg} cfg
 */
export function enviarCfgExibicaoBibliaSocket(socket, cfg) {
  if (!socket?.connected) return;
  try {
    socket.emit('preview_display_config', payloadDisplayConfigBiblia(cfg));
  } catch (_) {}
}

/**
 * @param {string} host
 * @param {import('socket.io-client').Socket|null|undefined} socket
 * @param {BibliaExibicaoCfg} cfg
 */
export async function aplicarCfgExibicaoBiblia(host, socket, cfg) {
  enviarCfgExibicaoBibliaSocket(socket, cfg);
  await enviarCfgExibicaoBibliaHttp(host, cfg);
}
