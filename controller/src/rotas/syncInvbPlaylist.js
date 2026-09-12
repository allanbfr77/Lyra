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
  normalizarChaveComparacao,
} = require('../db/musicas');
const { loadPlaylistsJson, savePlaylistsJson } = require('../lib/playlistsStore');

const TEMA_PADRAO = 'ABERTURA';
const PLAYLIST_TIPO_MARCADOR_TEMA = 'marcador_tema';

/* Busca no banco online: quantos resultados pedir e o quão parecido o título tem de
   ser para a música ser aceite como a mesma. Antes usava-se cegamente o 1.º resultado —
   e uma busca sem acerto nenhum ainda assim «encontrava» a música errada. */
const LIMITE_BUSCA_LYRA = 10;
const PONTUACAO_MINIMA_TITULO = 0.6;

/**
 * Termos a tentar no banco online, do mais fiel ao nome do site ao mais folgado.
 * A API procura por prefixo: o nome completo do site («Nome (Versão Ao Vivo)»)
 * costuma não devolver nada, e é aí que as variantes salvam a sincronização.
 */
function variantesDeTermoBusca(nome) {
  const base = String(nome || '').trim();
  const out = [];
  const add = (t) => {
    const v = String(t || '').replace(/\s+/g, ' ').trim();
    if (v && !out.includes(v)) out.push(v);
  };
  add(base);
  /* Sem o que está entre parênteses/colchetes: «Ousado Amor (Reckless Love)». */
  add(base.replace(/[([{][^)\]}]*[)\]}]/g, ' '));
  /* E só o que está lá dentro — às vezes é o título pelo qual o banco a conhece. */
  const dentro = base.match(/[([{]([^)\]}]+)[)\]}]/);
  if (dentro) add(dentro[1]);
  /* Antes do travessão: «Nome - Artista», «Nome — Ao Vivo». */
  add(base.split(/\s+[-–—]\s+/)[0]);
  const palavras = base.split(/\s+/).filter(Boolean);
  if (palavras.length > 3) add(palavras.slice(0, 3).join(' '));
  return out;
}

/**
 * Semelhança entre o nome do site e o título devolvido pelo banco (0 a 1).
 * Igual = 1; um contém o outro = 0.8/0.9; senão, proporção de palavras comuns.
 */
function pontuacaoTitulo(alvoNorm, candidatoNorm) {
  if (!alvoNorm || !candidatoNorm) return 0;
  if (alvoNorm === candidatoNorm) return 1;
  if (candidatoNorm.startsWith(alvoNorm) || alvoNorm.startsWith(candidatoNorm)) return 0.9;
  if (candidatoNorm.includes(alvoNorm) || alvoNorm.includes(candidatoNorm)) return 0.8;
  const a = new Set(alvoNorm.split(' ').filter(Boolean));
  const b = new Set(candidatoNorm.split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let comuns = 0;
  for (const w of a) if (b.has(w)) comuns++;
  return comuns / Math.max(a.size, b.size);
}

/**
 * Resolve o slug da música no banco online a partir do nome que vem do site.
 * Devolve o melhor acerto acima do mínimo, ou null (música fica em «não encontradas»).
 */
async function resolverSlugNoLyra(nomeMusica) {
  const alvo = normalizarChaveComparacao(nomeMusica);
  if (!alvo) return null;
  let melhor = null;
  for (const termo of variantesDeTermoBusca(nomeMusica)) {
    let busca;
    try {
      busca = await lyraSongbank.buscarMusicas({ q: termo, limit: LIMITE_BUSCA_LYRA });
    } catch (_) {
      continue; /* falha de rede neste termo — tenta o seguinte */
    }
    if (!busca || !busca.sucesso || !Array.isArray(busca.resultados)) continue;
    for (const r of busca.resultados) {
      if (!r || !r.slug) continue;
      const p = pontuacaoTitulo(alvo, normalizarChaveComparacao(r.titulo));
      if (!melhor || p > melhor.pontuacao) {
        melhor = { slug: r.slug, titulo: r.titulo, pontuacao: p };
      }
    }
    if (melhor && melhor.pontuacao >= 1) break;
  }
  return melhor && melhor.pontuacao >= PONTUACAO_MINIMA_TITULO ? melhor : null;
}

function ehMarcadorTema(item) {
  return !!(item && item.tipo === PLAYLIST_TIPO_MARCADOR_TEMA);
}

function chaveTema(tema) {
  return String(tema || '').trim().toLocaleUpperCase('pt-BR');
}

/** Índice do último marcador do tema, ou -1. */
function indiceMarcadorTema(itensPlaylist, tema) {
  const alvo = chaveTema(tema);
  let idx = -1;
  for (let i = 0; i < itensPlaylist.length; i++) {
    if (ehMarcadorTema(itensPlaylist[i]) && chaveTema(itensPlaylist[i].tema) === alvo) idx = i;
  }
  return idx;
}

/** Tema do bloco (marcador anterior) onde está a linha do índice dado. */
function temaDoBlocoNoIndice(itensPlaylist, idx, temaPadrao) {
  for (let i = idx - 1; i >= 0; i--) {
    if (ehMarcadorTema(itensPlaylist[i])) return chaveTema(itensPlaylist[i].tema);
  }
  return chaveTema(temaPadrao);
}

/**
 * Linha já na playlist sem tema (gravada antes desta correção) passa a ter o tema
 * do bloco onde está — sem a mudar de sítio.
 */
function garantirTemaNoItemExistente(itensPlaylist, idx, temaPadrao) {
  const item = itensPlaylist[idx];
  if (!item || chaveTema(item.tema)) return false;
  item.tema = temaDoBlocoNoIndice(itensPlaylist, idx, temaPadrao);
  return true;
}

/**
 * Insere a música no fim do bloco do seu tema (criando o marcador no fim da playlist
 * se ainda não existir) — mesma regra do painel (`inserirMusicaNoBlocoTema`).
 * Antes a música ia sempre para o fim da lista, logo entrava debaixo do último
 * cabeçalho de tema, e não no seu.
 */
function inserirMusicaNoBlocoTema(itensPlaylist, tema, item) {
  let markerIdx = indiceMarcadorTema(itensPlaylist, tema);
  if (markerIdx < 0) {
    itensPlaylist.push({ tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema: chaveTema(tema) });
    markerIdx = itensPlaylist.length - 1;
  }
  let fimBloco = markerIdx + 1;
  while (fimBloco < itensPlaylist.length && !ehMarcadorTema(itensPlaylist[fimBloco])) fimBloco++;
  itensPlaylist.splice(fimBloco, 0, item);
}

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
function construirItemPlaylist(rootRow, cultoId, versaoLyra = null, tema = '') {
  const rootId = Number(rootRow.root_id != null ? rootRow.root_id : rootRow.id);
  const item = {
    id: rootId,
    titulo: String((versaoLyra && versaoLyra.titulo) || rootRow.titulo || '').trim(),
    artista: String((versaoLyra && versaoLyra.artista) || rootRow.artista || '').trim(),
    /* O painel grava o tema na própria linha (remover tema, seletor de temas e
       contagem por bloco leem-no daqui) — sem ele a música ficava «sem tema». */
    tema: chaveTema(tema),
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

  for (const item of itens) {
    const nomeMusica = (item.nome || item.titulo || item.title || '').trim();
    if (!nomeMusica) continue;

    const tema = item.tema || TEMA_PADRAO;

    // 1. Buscar no Lyra online pelo nome (variantes do termo + acerto pelo título)
    const acerto = await resolverSlugNoLyra(nomeMusica);
    const slug = acerto ? acerto.slug : null;

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
      const itemPlaylist = construirItemPlaylist(rootRow, cultoId, versaoLyraParaPlaylist, tema);

      // 4. Se já está na playlist: atualizar vínculo para a versão Lyra (não manter Original de outro banco)
      const idxExistente = indiceRootNaPlaylist(playlistAtual, rootId);
      if (idxExistente >= 0) {
        aplicarVinculoVersaoLyraNoItem(playlistAtual[idxExistente], itemPlaylist);
        garantirTemaNoItemExistente(playlistAtual, idxExistente, tema);
        continue;
      }

      // 5. Adicionar no fim do bloco do tema (criando o marcador se ainda não existir)
      inserirMusicaNoBlocoTema(playlistAtual, tema, itemPlaylist);
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

module.exports = {
  registrarRotasSyncInvbPlaylist,
  /* Exportados para teste (`syncInvbPlaylist.test.js`). */
  sincronizarCulto,
  variantesDeTermoBusca,
  pontuacaoTitulo,
  construirItemPlaylist,
  inserirMusicaNoBlocoTema,
  garantirTemaNoItemExistente,
  indiceRootNaPlaylist,
};
