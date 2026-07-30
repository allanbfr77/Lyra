/**
 * Store de músicas locais — armazenamento offline no dispositivo.
 *
 * Músicas ficam no AsyncStorage até serem compartilhadas (código) ou removidas após importação na igreja.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrarChavesLegadoAsyncStorage } from './migrateLegacyStorage';
import { labelDeCultoId } from './cultosMes';

/** Chave do AsyncStorage onde a lista completa de músicas locais é persistida. */
const KEY = 'lyra_local_musicas_v1';

/** Ouvintes para atualizar telas sem recarregar o app. */
const bibliotecaListeners = new Set();

/** Notifica telas (home, biblioteca local) que a lista mudou. */
export function notificarBibliotecaLocalAlterada() {
  bibliotecaListeners.forEach((fn) => {
    try {
      fn();
    } catch (_) {
      // intencional
    }
  });
}

/**
 * @param {() => void} fn
 * @returns {() => void} cancelar inscrição
 */
export function subscribeBibliotecaLocal(fn) {
  bibliotecaListeners.add(fn);
  return () => bibliotecaListeners.delete(fn);
}

let migracaoAsyncFeita = false;
async function garantirMigracaoAsync() {
  if (migracaoAsyncFeita) return;
  migracaoAsyncFeita = true;
  await migrarChavesLegadoAsyncStorage();
}

/**
 * Música armazenada só no celular (modo offline / preparo em casa).
 *
 * @typedef {Object} MusicaLocal
 * @property {string} localId - Identificador único gerado no celular (ex.: "L1715000000000-abc123")
 * @property {number|null} serverId - Legado; não usado no fluxo compartilhar/importar
 * @property {string} titulo - Nome da música
 * @property {string} artista - Nome do artista/banda
 * @property {string[]} estrofes - Array de slides (cada item = texto de um slide)
 * @property {boolean} pendente - `true` após criar/editar (interno; UI não expõe sync HTTP)
 * @property {string|null} [cultoId] - Slot do culto (mesmo id do controlador)
 * @property {string|null} [cultoLabel] - Texto legível do culto, ex.: "DOM, MANHÃ - 03/05"
 */

/**
 * Gera um identificador local único baseado em timestamp e aleatório.
 * O prefixo "L" distingue IDs locais de IDs do servidor.
 *
 * @returns {string}
 */
function gerarLocalId() {
  return `L${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- Operações de leitura ---

/**
 * Retorna todas as músicas salvas localmente no dispositivo.
 *
 * @returns {Promise<MusicaLocal[]>} Lista de músicas (vazia se nenhuma ou em caso de erro)
 */
export async function listarMusicasLocais() {
  try {
    await garantirMigracaoAsync();
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    // Em caso de erro de leitura/parse, retorna lista vazia para não travar o app
    return [];
  }
}

/**
 * Busca uma música local pelo seu ID.
 *
 * @param {string} localId - ID local da música
 * @returns {Promise<MusicaLocal|null>} A música encontrada ou null
 */
export async function obterMusicaLocal(localId) {
  const list = await listarMusicasLocais();
  return list.find((m) => m.localId === localId) || null;
}

// --- Operações de escrita (internas) ---

/**
 * Persiste a lista completa de músicas no AsyncStorage.
 * Função interna — use as funções exportadas para modificar músicas.
 *
 * @param {MusicaLocal[]} lista
 */
async function salvarTodas(lista, { notificar = true } = {}) {
  await AsyncStorage.setItem(KEY, JSON.stringify(lista));
  if (notificar) notificarBibliotecaLocalAlterada();
}

// --- Operações de escrita (exportadas) ---

/**
 * Salva ou atualiza uma música local. Sempre marca como `pendente: true`.
 * Se a música já existe (mesmo localId), substitui; caso contrário, adiciona ao final.
 *
 * @param {MusicaLocal} musica
 * @returns {Promise<MusicaLocal>} A música salva (com pendente forçado para true)
 */
export async function salvarMusicaLocal(musica) {
  const list = await listarMusicasLocais();
  const i = list.findIndex((m) => m.localId === musica.localId);
  const next = { ...musica, pendente: true };
  if (i >= 0) list[i] = next;   // Atualiza existente
  else list.push(next);          // Insere nova
  await salvarTodas(list);
  return next;
}

/*
 * Não existe criação de rascunho vazio: «Nova música» apenas abre o formulário
 * e a música só é persistida em `criarMusicaLocalCompleta` ao guardar, já com
 * título, slides e culto. Assim, sair da edição sem guardar não deixa entradas
 * «(sem título)» na biblioteca.
 */

/**
 * Importação a partir da busca na web (Cifra Club no próprio celular).
 * Cria uma música completa com título, artista e estrofes já preenchidos.
 *
 * @param {{ titulo: string, artista: string, estrofes: string[], cultoId?: string|null, cultoLabel?: string|null }} params
 * @returns {Promise<MusicaLocal>}
 */
export async function criarMusicaLocalCompleta({ titulo, artista, estrofes, cultoId = null, cultoLabel = null }) {
  // Filtra estrofes vazias para não criar slides em branco
  const arr = Array.isArray(estrofes) ? estrofes.filter((s) => String(s || '').trim()) : [];
  const m = {
    localId: gerarLocalId(),
    serverId: null,
    titulo: String(titulo || '').trim() || 'Sem título',
    artista: String(artista || '').trim(),
    estrofes: arr.length ? arr : [''],
    pendente: true,
    cultoId: cultoId != null ? String(cultoId) : null,
    cultoLabel: cultoLabel != null ? String(cultoLabel) : null,
  };
  const list = await listarMusicasLocais();
  list.push(m);
  await salvarTodas(list);
  return m;
}

/**
 * Remove uma música da biblioteca local pelo seu ID.
 * Chamado após sync bem-sucedido ou exclusão manual pelo usuário.
 *
 * @param {string} localId
 */
export async function excluirMusicaLocal(localId) {
  const list = (await listarMusicasLocais()).filter((m) => m.localId !== localId);
  await salvarTodas(list);
}

/** Chave normalizada título+artista para comparar músicas. */
export function chaveTituloArtista(titulo, artista) {
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${norm(titulo)}|${norm(artista)}`;
}

/**
 * Remove da biblioteca local as músicas que correspondem ao título/artista do código importado.
 *
 * @param {Array<{ titulo?: string, artista?: string }>} musicas
 * @returns {Promise<number>} Quantidade removida
 */
/**
 * Se as músicas do código baterem com a biblioteca local e tiverem o mesmo cultoId, devolve esse culto.
 *
 * @param {Array<{ titulo?: string, artista?: string }>} musicasCodigo
 * @returns {Promise<{ id: string, label: string }|null>}
 */
export async function inferirCultoDasMusicasNaBibliotecaLocal(musicasCodigo) {
  if (!Array.isArray(musicasCodigo) || !musicasCodigo.length) return null;

  const locais = await listarMusicasLocais();
  const cultosVistos = new Map();

  for (const m of musicasCodigo) {
    const ch = chaveTituloArtista(m.titulo, m.artista);
    const local = locais.find((l) => chaveTituloArtista(l.titulo, l.artista) === ch);
    const cid = local?.cultoId != null ? String(local.cultoId).trim() : '';
    if (!cid) continue;
    if (!cultosVistos.has(cid)) {
      cultosVistos.set(cid, local.cultoLabel != null ? String(local.cultoLabel) : '');
    }
  }

  if (cultosVistos.size !== 1) return null;

  const [id, cultoLabel] = [...cultosVistos.entries()][0];
  const label =
    cultoLabel && cultoLabel.includes('/')
      ? cultoLabel
      : labelDeCultoId(id);
  return { id, label };
}

export async function removerMusicasLocaisPorCorrespondencia(musicas) {
  if (!Array.isArray(musicas) || !musicas.length) return 0;

  const chaves = new Set(musicas.map((m) => chaveTituloArtista(m.titulo, m.artista)));
  const list = await listarMusicasLocais();
  const next = list.filter((m) => !chaves.has(chaveTituloArtista(m.titulo, m.artista)));
  const removidas = list.length - next.length;
  if (removidas > 0) await salvarTodas(next);
  return removidas;
}

