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

/**
 * Verifica se um rootId já está na lista de itens de uma playlist.
 */
function rootIdJaNaPlaylist(itensPlaylist, rootId) {
  return itensPlaylist.some(item =>
    item && item.tipo !== PLAYLIST_TIPO_MARCADOR_TEMA &&
    item.id === rootId
  );
}

/**
 * Constrói um item de playlist a partir de uma linha do banco e do cultoId.
 */
function construirItemPlaylist(musicaRow, cultoId) {
  return {
    id: musicaRow.root_id,
    titulo: musicaRow.titulo,
    artista: musicaRow.artista || '',
    bancoFonte: 'user',
    cultoId,
  };
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

    // 3. Obter/criar música no banco local
    // Cenários:
    //  (1) Já existe versão do Lyra → só reutilizar (sem nova Cópia/Importada)
    //  (2) Não existe na biblioteca → importação normal (Original + Cópia)
    //  (3) Existe só de outro banco → acrescentar Cópia/Importada do Lyra
    let musicaRow = null;
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
        // Cenário 2: música nova — Original + Cópia padrão; sem Cópia/Importada
        rootId = check.rootId;
        musicaRow = db.prepare('SELECT * FROM musicas WHERE id = ?').get(rootId);
      } else if (check.duplicado && check.existente) {
        // Já existe equivalente na biblioteca
        rootId = check.existente.root_id || check.existente.id;
        let copiaLyra = buscarCopiaLyraExistente(db, rootId);

        if (!copiaLyra) {
          // Cenário 3: existe de outro banco — acrescentar Cópia/Importada do Lyra
          const parentRow = db.prepare('SELECT * FROM musicas WHERE id = ?').get(rootId);
          if (parentRow) {
            const nova = inserirCopiaMusica(parentRow, dadosLyra.titulo, dadosLyra.artista || '', dadosLyra.estrofes || [], { rotulo: ROTULO_COPIA_IMPORTADA, origem: ORIGEM_LYRA_ONLINE });
            if (nova && nova.ok) {
              copiaLyra = db.prepare('SELECT * FROM musicas WHERE id = ?').get(nova.id);
            }
          }
        }
        // Cenário 1: já havia cópia lyra-online → reutilizar sem criar outra

        musicaRow = copiaLyra || db.prepare('SELECT * FROM musicas WHERE id = ?').get(rootId);
      } else {
        naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
        continue;
      }

      if (!musicaRow || !rootId) {
        naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
        continue;
      }

      // Garantir root_id no objeto
      musicaRow = { ...musicaRow, root_id: rootId };

      let copiaLyra = musicaRow; // já é a cópia correta

      // 4. Verificar duplicata na playlist
      if (rootIdJaNaPlaylist(playlistAtual, rootId)) {
        continue; // já está, respeitar comportamento existente
      }

      // 5. Inserir marcador de tema se necessário
      if (temaAtualNaPlaylist !== tema) {
        playlistAtual.push({ tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema });
        temaAtualNaPlaylist = tema;
      }

      // 6. Adicionar item à playlist
      const itemPlaylist = construirItemPlaylist(musicaRow, cultoId);
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
