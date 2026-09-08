/**
 * syncInvbPlaylist.js
 * POST /api/sync-invb-playlist
 *
 * Sincroniza a playlist do site INVB com a playlist do Lyra.
 * Lyra online é a ÚNICA fonte oficial de músicas.
 */

const { buscarCultosInvb } = require('../lib/invbPlaylistFetch');
const lyraSongbank = require('../lib/lyraSongbank');
const {
  importarMusicaUsuarioNoDb,
  inserirCopiaMusica,
  ROTULO_COPIA_IMPORTADA,
  ORIGEM_LYRA_ONLINE,
  garantirColunaOrigemImportacao,
} = require('../db/musicas');
const { loadPlaylistsJson, savePlaylistsJson } = require('../lib/playlistsStore');

const TEMA_PADRAO = 'ABERTURA';
const PLAYLIST_TIPO_MARCADOR_TEMA = 'marcador_tema';

/**
 * Busca no banco local uma cópia de origem lyra-online do root informado.
 * Retorna a linha da cópia ou null.
 */
function buscarCopiaLyraExistente(db, rootId) {
  return db.prepare(`
    SELECT * FROM musicas
    WHERE root_id = ?
      AND origem_importacao = ?
      AND parent_id IS NOT NULL
    ORDER BY id ASC
    LIMIT 1
  `).get(rootId, ORIGEM_LYRA_ONLINE) || null;
}

/** True se a linha (original) veio do banco do Lyra. */
function ehOriginalDoLyra(row) {
  return !!(row && String(row.origem_importacao || '').trim() === ORIGEM_LYRA_ONLINE);
}

/**
 * Índice do item de música (por root) na playlist, ou -1.
 * Compara com Number() — ids no JSON podem ser number ou string.
 */
function indiceRootNaPlaylist(itensPlaylist, rootId) {
  const alvo = Number(rootId);
  if (!Number.isFinite(alvo)) return -1;
  return itensPlaylist.findIndex(
    (item) =>
      item &&
      item.tipo !== PLAYLIST_TIPO_MARCADOR_TEMA &&
      Number(item.id) === alvo
  );
}

/**
 * Constrói um item de playlist a partir da versão Lyra a utilizar.
 * `id` é sempre o root (âncora da família). Quando a versão Lyra é uma
 * Cópia/Importada (filho), grava versaoLocalId — senão a UI abre o Original.
 */
function construirItemPlaylist(rootRow, cultoId, versaoLyra = null) {
  const rootId = Number(rootRow.root_id != null ? rootRow.root_id : rootRow.id);
  const item = {
    id: rootId,
    titulo: String((versaoLyra && versaoLyra.titulo) || rootRow.titulo || '').trim(),
    artista: String((versaoLyra && versaoLyra.artista) || rootRow.artista || '').trim(),
    bancoFonte: 'user',
    cultoId,
  };
  const versaoId = versaoLyra != null ? Number(versaoLyra.id) : NaN;
  // Filho do root (ex.: Cópia/Importada) → playlist DEVE apontar para esse id
  if (Number.isFinite(versaoId) && versaoId !== rootId) {
    item.versaoLocalId = String(versaoId);
    item.versaoRotulo =
      String(versaoLyra.rotulo || ROTULO_COPIA_IMPORTADA).trim() || ROTULO_COPIA_IMPORTADA;
  }
  return item;
}

/**
 * Garante que o item existente da playlist use a versão Lyra resolvida.
 * Retorna true se alterou o vínculo.
 */
function aplicarVinculoVersaoLyraNoItem(itemExistente, itemCorreto) {
  if (!itemExistente || !itemCorreto) return false;
  const vidAntes =
    itemExistente.versaoLocalId != null ? String(itemExistente.versaoLocalId).trim() : '';
  const vidDepois =
    itemCorreto.versaoLocalId != null ? String(itemCorreto.versaoLocalId).trim() : '';
  const rotAntes = String(itemExistente.versaoRotulo || '').trim();
  const rotDepois = String(itemCorreto.versaoRotulo || '').trim();

  let mudou = false;
  if (vidAntes !== vidDepois || rotAntes !== rotDepois) {
    if (vidDepois) {
      itemExistente.versaoLocalId = vidDepois;
      itemExistente.versaoRotulo = rotDepois || ROTULO_COPIA_IMPORTADA;
    } else {
      delete itemExistente.versaoLocalId;
      delete itemExistente.versaoRotulo;
    }
    mudou = true;
  }
  if (itemCorreto.titulo && itemExistente.titulo !== itemCorreto.titulo) {
    itemExistente.titulo = itemCorreto.titulo;
    mudou = true;
  }
  if (itemCorreto.artista != null && itemExistente.artista !== itemCorreto.artista) {
    itemExistente.artista = itemCorreto.artista;
    mudou = true;
  }
  return mudou;
}

/**
 * Sincroniza um único culto.
 * Retorna { adicionadas, naoEncontradas: [{nome, tipo}] }
 */
async function sincronizarCulto({ culto, db, playlistsJson, paths }) {
  const { cultoId, itens } = culto;

  // Garantir entrada no JSON de playlists
  if (!playlistsJson[cultoId]) {
    playlistsJson[cultoId] = [];
  }
  const playlistAtual = playlistsJson[cultoId];

  let adicionadas = 0;
  const naoEncontradas = [];

  // Agrupar itens por tema mantendo a ordem
  // Vamos processar cada item na ordem, inserindo marcadores de tema quando necessário
  // Descobrir qual o último marcador de tema já presente na playlist
  let temaAtualNaPlaylist = null;
  for (const it of playlistAtual) {
    if (it && it.tipo === PLAYLIST_TIPO_MARCADOR_TEMA && it.tema) {
      temaAtualNaPlaylist = it.tema;
    }
  }

  for (const item of itens) {
    const nomeMusica = (item.nome || item.titulo || item.title || '').trim();
    if (!nomeMusica) continue;

    const tema = item.tema || TEMA_PADRAO;

    // 1. Buscar no Lyra online pelo nome
    let slug = null;
    try {
      const resultBusca = await lyraSongbank.buscarMusicas({ q: nomeMusica, limit: 5 });
      if (resultBusca.sucesso && resultBusca.resultados && resultBusca.resultados.length > 0) {
        slug = resultBusca.resultados[0].slug;
      }
    } catch (e) {
      // falha de rede — tratar como não encontrada
    }

    if (!slug) {
      naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
      continue;
    }

    // 2. Extrair dados completos do Lyra online
    let dadosLyra = null;
    try {
      dadosLyra = await lyraSongbank.extrairLetraParaPreviewOuImport(slug, {});
    } catch (e) {
      // falha
    }

    if (!dadosLyra || dadosLyra.erro) {
      naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
      continue;
    }

    // 3. Obter/criar música no banco local — playlist SEMPRE usa versão do Lyra
    //  (1) Original do Lyra já existe → usar esse original
    //  (2) Não existe na biblioteca → criar Original + Cópia do Lyra; usar o original
    //  (3) Existe só de outro banco → criar/reutilizar Cópia/Importada do Lyra e usá-la
    let rootRow = null;
    let versaoLyraParaPlaylist = null;
    let rootId = null;
    try {
      // Passo 3a: tentar inserir com 'perguntar' para descobrir se já existe
      const check = importarMusicaUsuarioNoDb(
        dadosLyra.titulo,
        dadosLyra.artista || '',
        dadosLyra.estrofes || [],
        { aoDuplicar: 'perguntar', origem: ORIGEM_LYRA_ONLINE }
      );

      if (check.ok) {
        // Regra 2: música nova — Original + Cópia padrão; playlist usa o Original do Lyra
        rootId = check.rootId;
        rootRow = db.prepare('SELECT * FROM musicas WHERE id = ?').get(rootId);
        versaoLyraParaPlaylist = rootRow;
      } else if (check.duplicado && check.existente) {
        rootId = check.existente.root_id || check.existente.rootId || check.existente.id;
        rootRow = db.prepare('SELECT * FROM musicas WHERE id = ?').get(rootId);

        if (!rootRow) {
          naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
          continue;
        }

        if (ehOriginalDoLyra(rootRow)) {
          // Regra 1: original do Lyra já na biblioteca — usar essa versão
          versaoLyraParaPlaylist = rootRow;
        } else {
          // Regra 3: só existe de outro banco — Cópia/Importada do Lyra na playlist
          let copiaLyra = buscarCopiaLyraExistente(db, rootId);
          if (!copiaLyra) {
            const nova = inserirCopiaMusica(
              rootRow,
              dadosLyra.titulo,
              dadosLyra.artista || '',
              dadosLyra.estrofes || [],
              { rotulo: ROTULO_COPIA_IMPORTADA, origem: ORIGEM_LYRA_ONLINE }
            );
            if (nova && nova.ok) {
              copiaLyra = db.prepare('SELECT * FROM musicas WHERE id = ?').get(nova.id);
            }
          }
          if (!copiaLyra) {
            naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
            continue;
          }
          versaoLyraParaPlaylist = copiaLyra;
        }
      } else {
        naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
        continue;
      }

      if (!rootRow || !rootId || !versaoLyraParaPlaylist) {
        naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
        continue;
      }

      // Item da playlist SEMPRE com a versão Lyra resolvida (Original Lyra ou Cópia/Importada)
      const itemPlaylist = construirItemPlaylist(rootRow, cultoId, versaoLyraParaPlaylist);

      // 4. Se já está na playlist: atualizar vínculo para a versão Lyra (não manter Original de outro banco)
      const idxExistente = indiceRootNaPlaylist(playlistAtual, rootId);
      if (idxExistente >= 0) {
        aplicarVinculoVersaoLyraNoItem(playlistAtual[idxExistente], itemPlaylist);
        continue;
      }

      // 5. Inserir marcador de tema se necessário
      if (temaAtualNaPlaylist !== tema) {
        playlistAtual.push({ tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema });
        temaAtualNaPlaylist = tema;
      }

      // 6. Adicionar item novo já vinculado à versão Lyra
      playlistAtual.push(itemPlaylist);
      adicionadas++;
    } catch (e) {
      naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
    }
  }

  return { adicionadas, naoEncontradas };
}

/**
 * Registra a rota POST /api/sync-invb-playlist
 */
function registrarRotasSyncInvbPlaylist(expressApp, { db, marcarBancoCompartilhadoAlterado, notificarBancoCompartilhadoAlterado, paths }) {
  try {
    garantirColunaOrigemImportacao();
  } catch (e) {
    console.warn('[syncInvbPlaylist] Não foi possível garantir coluna origem_importacao:', e.message);
  }
  // DEBUG TEMPORÁRIO — remover após investigação
  expressApp.get('/api/sync-invb-playlist/debug', async (req, res) => {
    try {
      const key = process.env.INVB_SUPABASE_ANON_KEY;
      if (!key) return res.status(500).json({ erro: 'INVB_SUPABASE_ANON_KEY não definida' });
      const r = await fetch('https://rosvseljurczmzdycbxs.supabase.co/rest/v1/cultos?select=*', {
        headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' },
      });
      const raw = await r.json();
      // Mostrar estrutura do campo louvores sem parsear
      const info = Array.isArray(raw) ? raw.map(row => ({
        tipo: row.tipo,
        louvores_type: typeof row.louvores,
        louvores_preview: typeof row.louvores === 'string'
          ? row.louvores.slice(0, 500)
          : JSON.stringify(row.louvores).slice(0, 500),
      })) : raw;
      res.json({ status: r.status, info });
    } catch (e) {
      res.status(500).json({ erro: e.message });
    }
  });

  expressApp.post('/api/sync-invb-playlist', async (req, res) => {
    try {
      // 1. Buscar cultos do Supabase
      let cultos;
      try {
        cultos = await buscarCultosInvb();
      } catch (e) {
        return res.status(502).json({ erro: 'Falha ao buscar dados do site INVB: ' + e.message });
      }

      if (!cultos || cultos.length === 0) {
        return res.json({ adicionadas: 0, naoEncontradas: [], aviso: 'Nenhum culto encontrado no site.' });
      }

      // 2. Carregar playlists existentes
      const playlistsJson = loadPlaylistsJson(paths.playlistsJsonPath) || {};

      let totalAdicionadas = 0;
      const todasNaoEncontradas = [];
      const ministrantePorCulto = {}; // cultoId → nome do ministrante

      // 3. Processar cada culto
      for (const culto of cultos) {
        const resultado = await sincronizarCulto({ culto, db, playlistsJson, paths });
        totalAdicionadas += resultado.adicionadas;
        todasNaoEncontradas.push(...resultado.naoEncontradas);
        if (culto.ministranteNome) {
          ministrantePorCulto[culto.cultoId] = culto.ministranteNome;
        }
      }

      // 4. Salvar playlists atualizadas
      savePlaylistsJson(paths.playlistsJsonPath, playlistsJson);

      // 5. Notificar frontend
      if (totalAdicionadas > 0) {
        marcarBancoCompartilhadoAlterado();
        notificarBancoCompartilhadoAlterado();
      }

      // 6. Responder
      return res.json({
        adicionadas: totalAdicionadas,
        naoEncontradas: todasNaoEncontradas,
        ministrantePorCulto,
      });
    } catch (e) {
      console.error('[syncInvbPlaylist] Erro inesperado:', e);
      return res.status(500).json({ erro: 'Erro interno: ' + e.message });
    }
  });
}

module.exports = { registrarRotasSyncInvbPlaylist };
