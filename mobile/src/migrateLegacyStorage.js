import AsyncStorage from '@react-native-async-storage/async-storage';

const PARES = [
  ['invblyrics_local_musicas_v1', 'lyra_local_musicas_v1'],
];

/**
 * Migra chaves AsyncStorage do branding legado para Lyra.
 */
export async function migrarChavesLegadoAsyncStorage() {
  for (const [antiga, nova] of PARES) {
    try {
      const valor = await AsyncStorage.getItem(antiga);
      if (valor == null) continue;
      if ((await AsyncStorage.getItem(nova)) == null) {
        await AsyncStorage.setItem(nova, valor);
      }
      await AsyncStorage.removeItem(antiga);
    } catch (_) {}
  }
}
