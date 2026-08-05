/**
 * Banco de músicas offline (catalog.db) embarcado no próprio celular.
 *
 * É o mesmo arquivo que o controlador usa no PC (`data/catalog/catalog.db`),
 * copiado para `assets/catalogo/catalog.db` e empacotado no APK. Por isso a
 * busca funciona longe da igreja, sem rede e sem o PC ligado.
 *
 * Tabela: musicas(id, titulo, artista, estrofes TEXT JSON, criado_em)
 *
 * O arquivo do APK é somente leitura, então na primeira utilização copiamos o
 * asset para a pasta `SQLite` do app — é o caminho que o expo-sqlite abre.
 */

import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

/** Nome do arquivo dentro da pasta SQLite do app. */
const NOME_DB = 'lyra-catalog.db';

/** Máximo de resultados devolvidos por busca (mesmo teto do controlador). */
export const LIMITE_RESULTADOS = 40;

/** Linhas lidas por lote na varredura de letra — evita segurar tudo em memória. */
const LOTE_VARREDURA = 800;

/** Conexão única reaproveitada entre buscas. */
let dbPromise = null;

/**
 * Remove acentos, caixa e pontuação para comparar texto como o usuário espera
 * («coracao» encontra «Coração»; «ah jesus» encontra «Ah, Jesus»).
 * Mesma ideia do `fold()` do controlador (busca offline).
 *
 * @param {string} s
 * @returns {string}
 */
export function dobrarTexto(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,;:!?¡¿"'’‘“”`´^~(){}[\]<>/\\|@#$%&*+=_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Copia o banco do bundle para a pasta SQLite (só na primeira vez) e abre a conexão.
 *
 * @returns {Promise<import('expo-sqlite').SQLiteDatabase>}
 */
async function abrirBanco() {
  const pastaSQLite = new Directory(Paths.document, 'SQLite');
  if (!pastaSQLite.exists) pastaSQLite.create({ intermediates: true, idempotent: true });

  const destino = new File(pastaSQLite, NOME_DB);
  const asset = Asset.fromModule(require('../assets/catalogo/catalog.db'));
  await asset.downloadAsync();

  // Recopia se o arquivo ainda não existe ou se o catálogo do app mudou de tamanho
  // (novo build com catálogo atualizado).
  const origem = new File(asset.localUri || asset.uri);
  const precisaCopiar = !destino.exists || (origem.size > 0 && destino.size !== origem.size);
  if (precisaCopiar) {
    if (destino.exists) destino.delete();
    origem.copy(destino);
  }

  return SQLite.openDatabaseAsync(NOME_DB);
}

/**
 * Conexão com o catálogo offline (abre na primeira chamada).
 *
 * @returns {Promise<import('expo-sqlite').SQLiteDatabase>}
 */
export function obterBancoCatalogo() {
  if (!dbPromise) {
    dbPromise = abrirBanco().catch((e) => {
      dbPromise = null; // permite nova tentativa depois de uma falha
      throw e;
    });
  }
  return dbPromise;
}

/**
 * Converte a coluna `estrofes` (JSON) em array de slides.
 *
 * @param {string} json
 * @returns {string[]}
 */
export function estrofesDaLinha(json) {
  try {
    const arr = JSON.parse(json || '[]');
    if (Array.isArray(arr)) return arr.map((s) => String(s ?? ''));
    return String(arr || '')
      .split(/\n\s*\n/)
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Total de músicas do catálogo — usado no texto de ajuda da tela.
 *
 * @returns {Promise<number>}
 */
export async function contarMusicasCatalogo() {
  const db = await obterBancoCatalogo();
  const row = await db.getFirstAsync('SELECT COUNT(*) AS total FROM musicas');
  return row?.total ?? 0;
}

/**
 * Busca no catálogo offline por título, artista e/ou trecho de letra.
 *
 * Título e artista são varridos com uma consulta leve (sem a coluna `estrofes`).
 * O trecho de letra, que exige ler a letra inteira, é varrido em lotes e para
 * assim que o limite de resultados é atingido.
 *
 * @param {{ q: string, titulo?: boolean, artista?: boolean, letra?: boolean }} params
 * @returns {Promise<{ id: number, titulo: string, artista: string, ondeBateu: 'titulo'|'artista'|'letra' }[]>}
 */
export async function buscarNoCatalogoLocal({ q, titulo = true, artista = true, letra = false }) {
  const alvo = dobrarTexto(q);
  if (!alvo) return [];
  if (!titulo && !artista && !letra) return [];

  const db = await obterBancoCatalogo();
  const achados = [];
  const vistos = new Set();

  const registrar = (row, ondeBateu) => {
    if (vistos.has(row.id)) return;
    vistos.add(row.id);
    achados.push({
      id: row.id,
      titulo: String(row.titulo || ''),
      artista: String(row.artista || ''),
      ondeBateu,
    });
  };

  // 1) Título / artista — colunas curtas, cabe uma varredura única
  if (titulo || artista) {
    const linhas = await db.getAllAsync('SELECT id, titulo, artista FROM musicas');
    for (const row of linhas) {
      if (achados.length >= LIMITE_RESULTADOS) break;
      if (titulo && dobrarTexto(row.titulo).includes(alvo)) {
        registrar(row, 'titulo');
        continue;
      }
      if (artista && dobrarTexto(row.artista).includes(alvo)) registrar(row, 'artista');
    }
  }

  // 2) Trecho de letra — em lotes, para não carregar ~10 MB de uma vez
  if (letra && achados.length < LIMITE_RESULTADOS) {
    let offset = 0;
    for (;;) {
      const linhas = await db.getAllAsync(
        'SELECT id, titulo, artista, estrofes FROM musicas LIMIT ? OFFSET ?',
        [LOTE_VARREDURA, offset]
      );
      if (!linhas.length) break;
      for (const row of linhas) {
        if (achados.length >= LIMITE_RESULTADOS) break;
        if (vistos.has(row.id)) continue;
        const texto = dobrarTexto(estrofesDaLinha(row.estrofes).join('\n'));
        if (texto.includes(alvo)) registrar(row, 'letra');
      }
      if (achados.length >= LIMITE_RESULTADOS) break;
      offset += LOTE_VARREDURA;
    }
  }

  return achados;
}

/**
 * Carrega uma música completa do catálogo (para prévia ou para guardar).
 *
 * @param {number|string} id
 * @returns {Promise<{ id: number, titulo: string, artista: string, estrofes: string[] }|null>}
 */
export async function obterMusicaDoCatalogo(id) {
  const idNum = parseInt(String(id), 10);
  if (!Number.isFinite(idNum)) return null;

  const db = await obterBancoCatalogo();
  const row = await db.getFirstAsync(
    'SELECT id, titulo, artista, estrofes FROM musicas WHERE id = ?',
    [idNum]
  );
  if (!row) return null;

  return {
    id: row.id,
    titulo: String(row.titulo || ''),
    artista: String(row.artista || ''),
    estrofes: estrofesDaLinha(row.estrofes),
  };
}
