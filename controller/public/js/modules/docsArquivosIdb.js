/**
 * Ficheiros do modo DOCS — guarda-os no IndexedDB desta instalação.
 *
 * O `localStorage` guarda a ficha de cada documento (nome, tipo, tamanho); o conteúdo
 * vive aqui. São duas razões:
 *
 *  - tamanho — um PDF de 20 MB em Base64 passa dos 5 MB de quota do localStorage e não
 *    grava, em silêncio (o mesmo problema que os áudios do modo Mídias já tiveram);
 *  - permanência — sem os bytes, recarregar o painel deixaria a lista com nomes que já
 *    não abrem. O caminho em disco não serve: o painel corre em http://127.0.0.1 e não
 *    lê ficheiros locais por caminho.
 *
 * Tudo falha em silêncio e devolve `null`: um documento que não abre é um aviso na área
 * central, nunca um painel em baixo a meio do culto.
 */

const DB_NOME = 'lyra_docs_v1';
const DB_VERSAO = 1;
const STORE = 'arquivos';

function abrirBaseDados() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NOME, DB_VERSAO);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

function comStore(modo, fn) {
  return abrirBaseDados().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, modo);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => {
            db.close();
            resolve(req ? req.result : true);
          };
          tx.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch (_) {
          try { db.close(); } catch (__) { /* intencional */ }
          resolve(null);
        }
      })
  );
}

/** Guarda o ficheiro tal como veio do seletor. */
export function guardarArquivoDoc(id, blob) {
  const chave = String(id || '').trim();
  if (!chave || !blob) return Promise.resolve(null);
  return comStore('readwrite', (store) => store.put(blob, chave));
}

/** Devolve o ficheiro guardado, ou `null` se não existir. */
export function lerArquivoDoc(id) {
  const chave = String(id || '').trim();
  if (!chave) return Promise.resolve(null);
  return comStore('readonly', (store) => store.get(chave));
}

/** Apaga o ficheiro de um documento removido da lista. */
export function apagarArquivoDoc(id) {
  const chave = String(id || '').trim();
  if (!chave) return Promise.resolve(null);
  return comStore('readwrite', (store) => store.delete(chave));
}
