/**
 * Identidade persistente do dispositivo mobile (para autenticação na allowlist do servidor).
 *
 * Gera um par { deviceId, secret } na primeira execução e persiste em AsyncStorage.
 * Vai no `auth` do handshake Socket.io; o servidor confere contra a allowlist (etapa 3).
 * O par é carregado uma vez e mantido em cache de módulo para leitura síncrona no io().
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_ID = 'lyra_device_id';
const KEY_SECRET = 'lyra_device_secret';
const KEY_NOME = 'lyra_device_nome';

let cache = null; // { deviceId, secret, nome }

/** UUID v4 sem dependência (Hermes/RN nem sempre tem crypto.randomUUID). */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Carrega (ou cria e persiste) a identidade. Idempotente — resolve sempre o mesmo par.
 * @returns {Promise<{deviceId: string, secret: string, nome: string}>}
 */
export async function carregarIdentidadeDispositivo() {
  if (cache) return cache;
  try {
    let deviceId = await AsyncStorage.getItem(KEY_ID);
    let secret = await AsyncStorage.getItem(KEY_SECRET);
    const nome = (await AsyncStorage.getItem(KEY_NOME)) || '';
    if (!deviceId || !secret) {
      deviceId = deviceId || uuid();
      secret = secret || uuid();
      await AsyncStorage.multiSet([
        [KEY_ID, deviceId],
        [KEY_SECRET, secret],
      ]);
    }
    cache = { deviceId, secret, nome };
  } catch (_) {
    cache = cache || {};
  }
  return cache;
}

/** Identidade já carregada (ou {} se ainda não). Útil como fallback síncrono. */
export function identidadeDispositivoSync() {
  return cache || {};
}
