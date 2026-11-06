/**
 * Instalador do wrapper de `fetch` do app (E1.3 — Fase A).
 *
 * Troca `globalThis.fetch` uma única vez, no layout raiz. A lógica de quando enviar a
 * credencial (só para servidores do Lyra) mora em `lyraFetchCore.js`, que não depende de
 * React Native e tem testes. A identidade é a que já existe (`deviceIdentidade.js`, a mesma
 * do Socket.IO): nenhuma identidade nova é criada aqui.
 */
import Constants from 'expo-constants';
import { carregarIdentidadeDispositivo } from './deviceIdentidade';
import { criarFetchLyra } from './lyraFetchCore';

export function instalarFetchLyra() {
  try {
    if (typeof globalThis.fetch !== 'function' || globalThis.fetch.__lyraFetch) return;
    const original = globalThis.fetch.bind(globalThis);
    const envolvido = criarFetchLyra({
      fetchOriginal: original,
      obterIdentidade: carregarIdentidadeDispositivo,
      versaoApp: Constants.expoConfig?.version || '',
    });
    envolvido.__lyraFetch = true;
    globalThis.fetch = envolvido;
  } catch (_) {
    // intencional — sem o wrapper o app funciona exatamente como antes
  }
}
