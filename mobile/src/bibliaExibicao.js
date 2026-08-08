/**
 * Configuração de exibição Bíblia no mobile — espelha o menu do Controlador PC
 * (Telão / Ministrante / Leitura), com camadas separadas para M2 e M3.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { urlApiProjecao } from './lyraEndpoints';
import { LIMITE_DIVISAO_PADRAO, normalizarLimiteDivisao } from './dividirVersiculos';

const STORAGE_KEY_V1 = 'lyra_biblia_exibicao_mobile_v1';
const STORAGE_KEY = 'lyra_biblia_exibicao_mobile_v2';

export const BIBLIA_FONTES = [
  { value: 'CMG Sans, sans-serif', label: 'CMG Sans' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: "'Times New Roman', serif", label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
];

export const BIBLIA_CORES_PRESET = [
  '#000000',
  '#161616',
  '#ffffff',
  '#fbf904',
  '#f3c15a',
  '#c94a4a',
  '#2f74d0',
  '#2f9d57',
];

export const BIBLIA_FONTE_MIN = 1;
export const BIBLIA_FONTE_MAX = 9;
export const BIBLIA_FONTE_STEP = 0.5;
export const BIBLIA_REF_FONTE_MIN = 0.5;
export const BIBLIA_REF_FONTE_MAX = 9;
export const BIBLIA_ESPACO_MIN = 1;
export const BIBLIA_ESPACO_MAX = 2.2;
export const BIBLIA_ESPACO_STEP = 0.05;

/** Padrão M2 (telão / público) — igual a `BIBLIA_CFG_EXIBICAO_PADRAO` do PC. */
export const BIBLIA_CAMADA_M2_PADRAO = {
  fontSize: 5.5,
  fontFamily: 'CMG Sans, sans-serif',
  lineSpacing: 1.4,
  wrapLongLines: true,
  bgType: 'solid',
  bgColor: '#000000',
  bgGradientFrom: '#000000',
  bgGradientTo: '#161616',
  bgGradient: 'linear-gradient(135deg, #000000 0%, #161616 100%)',
  bgImage: '',
  textColor: '#ffffff',
  negrito: true,
  maiusculo: false,
  textAlign: 'center',
  posX: 'center',
  posY: 'center',
  refMostrar: true,
  refFontSize: 1.8,
  refColor: '#fbf904',
};

/** Padrão M3 (ministrante) — igual a `BIBLIA_CFG_MINISTRANTE_PADRAO` do PC. */
export const BIBLIA_CAMADA_M3_PADRAO = {
  fontSize: 4.1,
  fontFamily: 'CMG Sans, sans-serif',
  lineSpacing: 1.35,
  wrapLongLines: true,
  bgType: 'solid',
  bgColor: '#000000',
  bgGradientFrom: '#000000',
  bgGradientTo: '#161616',
  bgGradient: 'linear-gradient(135deg, #000000 0%, #161616 100%)',
  bgImage: '',
  textColor: '#ffffff',
  textColorProximo: '#f3c15a',
  negrito: true,
  maiusculo: false,
  autoFitLongLines: false,
  textAlign: 'center',
  posX: 'center',
  posY: 'center',
  refMostrar: true,
  refFontSize: 1.7,
  refColor: '#fbf904',
};

export const BIBLIA_LEITURA_PADRAO = {
  dividirVersiculosLongos: false,
  limiteCaracteres: LIMITE_DIVISAO_PADRAO,
};

export const BIBLIA_CFG_PADRAO = {
  m2: { ...BIBLIA_CAMADA_M2_PADRAO },
  m3: { ...BIBLIA_CAMADA_M3_PADRAO },
  leitura: { ...BIBLIA_LEITURA_PADRAO },
};

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
function clampNum(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v * 100) / 100));
}

/**
 * @param {string} hex
 * @param {string} fallback
 */
function normalizarHex(hex, fallback) {
  const s = String(hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return fallback;
}

/**
 * @param {string} tipo
 */
function normalizarBgType(tipo) {
  const t = String(tipo || 'solid').toLowerCase();
  return t === 'gradient' || t === 'image' ? t : 'solid';
}

/**
 * @param {string} pos
 * @param {'x'|'y'} eixo
 */
function normalizarPos(pos, eixo) {
  const p = String(pos || 'center').toLowerCase();
  if (eixo === 'x') return p === 'left' || p === 'right' ? p : 'center';
  return p === 'top' || p === 'bottom' ? p : 'center';
}

/**
 * @param {object} camada
 * @param {object} padrao
 */
export function bibliaGradienteCss(camada, padrao) {
  const from = normalizarHex(camada?.bgGradientFrom, padrao.bgGradientFrom);
  const to = normalizarHex(camada?.bgGradientTo, padrao.bgGradientTo);
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

/**
 * @param {Partial<object>} raw
 * @param {object} padrao
 * @param {{ ministrante?: boolean }} [opts]
 */
export function normalizarCamadaBiblia(raw, padrao, opts = {}) {
  const bgType = normalizarBgType(raw?.bgType ?? padrao.bgType);
  const camada = {
    fontSize: clampNum(raw?.fontSize, BIBLIA_FONTE_MIN, BIBLIA_FONTE_MAX, padrao.fontSize),
    fontFamily: String(raw?.fontFamily || padrao.fontFamily),
    lineSpacing: clampNum(raw?.lineSpacing, BIBLIA_ESPACO_MIN, BIBLIA_ESPACO_MAX, padrao.lineSpacing),
    wrapLongLines: raw?.wrapLongLines !== false,
    bgType,
    bgColor: normalizarHex(raw?.bgColor, padrao.bgColor),
    bgGradientFrom: normalizarHex(raw?.bgGradientFrom, padrao.bgGradientFrom),
    bgGradientTo: normalizarHex(raw?.bgGradientTo, padrao.bgGradientTo),
    bgGradient: '',
    bgImage: bgType === 'image' ? String(raw?.bgImage || '') : '',
    textColor: normalizarHex(
      raw?.textColor ?? raw?.textColorAtual,
      padrao.textColor || padrao.textColorAtual || '#ffffff'
    ),
    negrito: raw?.negrito !== false,
    maiusculo: raw?.maiusculo === true,
    textAlign: String(raw?.textAlign || padrao.textAlign || 'center'),
    posX: normalizarPos(raw?.posX, 'x'),
    posY: normalizarPos(raw?.posY, 'y'),
    refMostrar: raw?.refMostrar !== false,
    refFontSize: clampNum(
      raw?.refFontSize,
      BIBLIA_REF_FONTE_MIN,
      BIBLIA_REF_FONTE_MAX,
      padrao.refFontSize
    ),
    refColor: normalizarHex(raw?.refColor, padrao.refColor),
  };
  camada.bgGradient = bibliaGradienteCss(camada, padrao);
  if (opts.ministrante) {
    camada.textColorProximo = normalizarHex(
      raw?.textColorProximo,
      padrao.textColorProximo || '#f3c15a'
    );
    camada.autoFitLongLines = raw?.autoFitLongLines === true;
  }
  if (!BIBLIA_FONTES.some((f) => f.value === camada.fontFamily)) {
    camada.fontFamily = padrao.fontFamily;
  }
  return camada;
}

/**
 * @param {Partial<object>} raw
 */
export function normalizarCfgExibicaoBiblia(raw) {
  // Migração v1 → v2: uma única camada virava M2+M3 iguais.
  if (raw && typeof raw === 'object' && !raw.m2 && !raw.m3 && (raw.fontSize != null || raw.posY)) {
    const legado = normalizarCamadaBiblia(raw, BIBLIA_CAMADA_M2_PADRAO);
    return {
      m2: { ...legado },
      m3: normalizarCamadaBiblia(
        { ...legado, fontSize: BIBLIA_CAMADA_M3_PADRAO.fontSize, lineSpacing: BIBLIA_CAMADA_M3_PADRAO.lineSpacing, refFontSize: BIBLIA_CAMADA_M3_PADRAO.refFontSize },
        BIBLIA_CAMADA_M3_PADRAO,
        { ministrante: true }
      ),
      leitura: { ...BIBLIA_LEITURA_PADRAO },
    };
  }

  return {
    m2: normalizarCamadaBiblia(raw?.m2 || {}, BIBLIA_CAMADA_M2_PADRAO),
    m3: normalizarCamadaBiblia(raw?.m3 || {}, BIBLIA_CAMADA_M3_PADRAO, { ministrante: true }),
    leitura: {
      dividirVersiculosLongos: raw?.leitura?.dividirVersiculosLongos === true,
      limiteCaracteres: normalizarLimiteDivisao(raw?.leitura?.limiteCaracteres),
    },
  };
}

/**
 * @returns {Promise<typeof BIBLIA_CFG_PADRAO>}
 */
export async function carregarCfgExibicaoBiblia() {
  try {
    const rawV2 = await AsyncStorage.getItem(STORAGE_KEY);
    if (rawV2) return normalizarCfgExibicaoBiblia(JSON.parse(rawV2));
    const rawV1 = await AsyncStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const migrado = normalizarCfgExibicaoBiblia(JSON.parse(rawV1));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrado));
      return migrado;
    }
    return normalizarCfgExibicaoBiblia({});
  } catch (_) {
    return normalizarCfgExibicaoBiblia({});
  }
}

/**
 * @param {object} cfg
 */
export async function salvarCfgExibicaoBiblia(cfg) {
  const norm = normalizarCfgExibicaoBiblia(cfg);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(norm));
  return norm;
}

/**
 * @param {object} camada
 */
function fundoParaPayload(camada) {
  const fundo = {
    bgType: camada.bgType || 'solid',
    bgColor: camada.bgColor,
    bgGradient: camada.bgGradient,
  };
  if (camada.bgType === 'image' && camada.bgImage) {
    fundo.bgImage = camada.bgImage;
  } else {
    fundo.bgImage = '';
  }
  return fundo;
}

/**
 * Payload `preview_display_config` / `set_display_config` no modo Bíblia.
 * M2 → `publico`, M3 → `ministrante` (mesmo vocabulário do PC).
 *
 * @param {object} cfg
 */
export function payloadDisplayConfigBiblia(cfg) {
  const c = normalizarCfgExibicaoBiblia(cfg);
  const pub = c.m2;
  const mon = c.m3;
  return {
    modoConfig: 'biblia',
    forcarModo: 'biblia',
    publico: {
      fontSize: pub.fontSize,
      fontFamily: pub.fontFamily,
      lineSpacing: pub.lineSpacing,
      wrapLongLines: pub.wrapLongLines !== false,
      textColor: pub.textColor,
      negrito: pub.negrito,
      maiusculo: pub.maiusculo === true,
      textAlign: pub.textAlign || 'center',
      posX: pub.posX || 'center',
      posY: pub.posY || 'center',
      ...fundoParaPayload(pub),
      refMostrar: pub.refMostrar !== false,
      refFontSize: pub.refFontSize,
      refColor: pub.refColor,
    },
    ministrante: {
      fontSize: mon.fontSize,
      fontSizeAtual: mon.fontSize,
      fontSizeProximo: mon.fontSize,
      fontFamily: mon.fontFamily,
      lineSpacing: mon.lineSpacing,
      wrapLongLines: mon.wrapLongLines !== false,
      autoFitLongLines: mon.autoFitLongLines === true,
      negrito: mon.negrito !== false,
      maiusculo: mon.maiusculo === true,
      textColorAtual: mon.textColor,
      textColorProximo: mon.textColorProximo || BIBLIA_CAMADA_M3_PADRAO.textColorProximo,
      posX: mon.posX || 'center',
      posY: mon.posY || 'center',
      ...fundoParaPayload(mon),
      refMostrar: mon.refMostrar !== false,
      refFontSize: mon.refFontSize,
      refColor: mon.refColor,
    },
  };
}

/**
 * @param {string} host
 * @param {object} cfg
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
 * @param {object} cfg
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
 * @param {object} cfg
 */
export async function aplicarCfgExibicaoBiblia(host, socket, cfg) {
  enviarCfgExibicaoBibliaSocket(socket, cfg);
  await enviarCfgExibicaoBibliaHttp(host, cfg);
}
