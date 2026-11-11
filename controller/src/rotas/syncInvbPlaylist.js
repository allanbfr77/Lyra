/**
 * syncInvbPlaylist.js
 * POST /api/sync-invb-playlist
 *
 * Sincroniza a playlist do site INVB com a playlist do Lyra.
 * Lyra online é a ÚNICA fonte oficial de músicas.
 */

const { buscarCultosInvb } = require('../lib/invbPlaylistFetch');
const { buscarCultosLyraApi, ErroLyraApi } = require('../lib/lyraPlaylistsApi');
const lyraSongbank = require('../lib/lyraSongbank');
const {
  importarMusicaUsuarioNoDb,
  inserirCopiaMusica,
  ROTULO_COPIA_IMPORTADA,
  ORIGEM_LYRA_ONLINE,
  ORIGEM_MANUAL,
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
async function resolverSlugNoLyra(nomeMusica, { exato = false } = {}) {
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
    if (!busca || !busca.sucesso || !Array.isArray(busca.resultados)) {
      /* Chave ausente ou recusada: parar. Seguir o laço marcaria toda a escala como «não encontrada». */
      if (busca && typeof busca.erro === 'string' && busca.erro.includes('LYRA_API_KEY')) {
        throw new Error(busca.erro);
      }
      continue;
    }
    for (const r of busca.resultados) {
      if (!r || !r.slug) continue;
      const p = pontuacaoTitulo(alvo, normalizarChaveComparacao(r.titulo));
      if (!melhor || p > melhor.pontuacao) {
        melhor = { slug: r.slug, titulo: r.titulo, pontuacao: p };
      }
    }
    if (melhor && melhor.pontuacao >= 1) break;
  }
  /* `exato`: só aceita o MESMO título (sem maiúsculas, acentos nem pontuação). Sem isto, «começa com»
     e «contém» ligavam um medley inteiro à primeira música dele. */
  const minimo = exato ? 1 : PONTUACAO_MINIMA_TITULO;
  return melhor && melhor.pontuacao >= minimo ? melhor : null;
}

/**
 * Medley = UMA entrada do culto que junta várias músicas («A / B / C»). Não é uma música do banco.
 * A API manda `medley: true`; o « / » (com espaços dos dois lados) cobre API antiga ou cache.
 * «24/7» não tem espaços ao redor da barra e NÃO é medley.
 */
function ehMedley(item, nome) {
  return !!(item && item.medley === true) || /\s\/\s/.test(String(nome || ''));
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

/** Todas as versões da família (Original + filhas), da mais antiga para a mais nova. */
function listarVersoesDaFamilia(db, rootId) {
  const alvo = Number(rootId);
  if (!Number.isFinite(alvo)) return [];
  const stmt = db.prepare('SELECT * FROM musicas WHERE id = ? OR root_id = ? ORDER BY id ASC');
  if (typeof stmt.all !== 'function') return [];
  return stmt.all(alvo, alvo) || [];
}

/**
 * Assinatura do CONTEÚDO de uma linha de versão: título, artista e estrofes,
 * exatamente como estão — caractere por caractere, sem trim nem normalização.
 * Rótulo, id, data e tags ficam de fora: não são conteúdo. Mesma regra do painel
 * (`public/js/modules/playlistVersaoMusica.js`), aqui sobre a linha do SQLite.
 *
 * `null` quando o conteúdo não é conhecido — e `null` nunca é igual a nada.
 */
function assinaturaConteudoVersaoRow(row) {
  if (!row) return null;
  let estrofes = row.estrofes;
  if (typeof estrofes === 'string') {
    try {
      estrofes = JSON.parse(estrofes);
    } catch (_) {
      return null;
    }
  }
  if (!Array.isArray(estrofes)) return null;
  const titulo = row.titulo == null ? '' : String(row.titulo);
  const artista = row.artista == null ? '' : String(row.artista);
  return JSON.stringify([titulo, artista, estrofes.map((t) => (t == null ? '' : String(t)))]);
}

/** Duas versões só são iguais se o conteúdo das duas for conhecido e idêntico. */
function versoesRowsRigorosamenteIdenticas(a, b) {
  const sa = assinaturaConteudoVersaoRow(a);
  const sb = assinaturaConteudoVersaoRow(b);
  return sa != null && sb != null && sa === sb;
}

/**
 * Reduz a família a UMA versão por conteúdo distinto — o que decide se há
 * pergunta é o conteúdo, nunca a quantidade de cópias.
 *
 * A lista chega por id (a Original primeiro). Versões com o mesmo conteúdo
 * formam um grupo e só a primeira representa o grupo, com uma exceção: se uma
 * Cópia for rigorosamente idêntica à Original, é a CÓPIA que representa esse
 * conteúdo. A Original é imutável — usá-la na playlist obrigaria o Lyra a criar
 * uma terceira versão na edição rápida dos Slides; a Cópia, sendo idêntica,
 * carrega o mesmo conteúdo e pode ser editada no lugar.
 *
 * Versões cujo conteúdo não é legível ficam sempre: não dá para afirmar que são
 * iguais a outra.
 *
 * Sobrando uma só, quem chama importa essa versão sem perguntar nada.
 */
function versoesDistintasPorConteudo(versoes, rootId) {
  const lista = Array.isArray(versoes) ? versoes : [];
  const alvo = Number(rootId);
  const indicePorAssinatura = new Map();
  const distintas = [];
  let idxOriginal = -1;
  for (const v of lista) {
    const sig = assinaturaConteudoVersaoRow(v);
    if (sig != null) {
      if (indicePorAssinatura.has(sig)) {
        const i = indicePorAssinatura.get(sig);
        /* Mesmo conteúdo da Original: a primeira Cópia assume o lugar dela. */
        if (i === idxOriginal) {
          distintas[i] = v;
          idxOriginal = -1;
        }
        continue;
      }
      indicePorAssinatura.set(sig, distintas.length);
      if (idxOriginal === -1 && Number(v.id) === alvo) idxOriginal = distintas.length;
    }
    distintas.push(v);
  }
  return distintas;
}

/**
 * Resolve a versão do root do Lyra: `{ versao, versoes }`.
 *
 * `versoes` são os conteúdos distintos da família (um representante cada).
 * Sobrando um só, é ele que entra — sem perguntar. Havendo mais de um,
 * `versao` vem a `null`: quem escolhe é o utilizador, entre esses.
 * Sem lista de versões (consulta indisponível), fica como antes: a Original.
 */
function resolverVersaoLyraDoRoot(db, rootRow, rootId) {
  const versoes = listarVersoesDaFamilia(db, rootId);
  if (versoes.length === 0) return { versao: rootRow, versoes: [] };
  const distintas = versoesDistintasPorConteudo(versoes, rootId);
  if (distintas.length <= 1) return { versao: distintas[0] || rootRow, versoes: distintas };
  return { versao: null, versoes: distintas };
}

/** Linha de versão no formato que o painel usa para montar a pergunta. */
function opcaoVersaoParaEscolha(row, rootId) {
  return {
    id: Number(row.id),
    ehOriginal: Number(row.id) === Number(rootId),
    rotulo: String(row.rotulo || '').trim(),
    /* Só para o nome exibido: uma cópia importada aparece como «Versão <ORIGEM>». */
    origem: String(row.origem_importacao || '').trim(),
    titulo: String(row.titulo || '').trim(),
    artista: String(row.artista || '').trim(),
  };
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
 * Entrada própria para o medley na biblioteca local — o item da playlist precisa de um `id`, e o
 * medley NUNCA é ligado a uma música individual do banco. Cria (ou reaproveita, pelo título EXATO
 * do medley) uma entrada manual com o nome completo e sem letra: o operador pode completá-la.
 * Devolve { rootRow, versao } ou null.
 */
function obterEntradaDeMedley(db, nome) {
  const check = importarMusicaUsuarioNoDb(nome, '', [''], { aoDuplicar: 'perguntar', origem: ORIGEM_MANUAL });
  let rootId = null;
  if (check.ok) rootId = check.rootId;
  else if (check.duplicado && check.existente) {
    rootId = check.existente.root_id || check.existente.rootId || check.existente.id;
  }
  if (!rootId) return null;
  const rootRow = db.prepare('SELECT * FROM musicas WHERE id = ?').get(rootId);
  if (!rootRow) return null;
  const r = resolverVersaoLyraDoRoot(db, rootRow, rootId);
  /* Medley já editado em mais de uma versão: mantém a Original (não pergunta por um medley). */
  return { rootRow, versao: r.versao || rootRow };
}

/**
 * Limpa vínculos errados de sincronizações antigas: um medley ficava ligado a uma música
 * individual cujo título é o PRIMEIRO trecho dele (a busca por nome casava só o começo).
 * Só sai a linha do mesmo bloco/tema do medley e cujo título é exatamente esse primeiro trecho —
 * e nunca se a própria escala trouxer essa música como item avulso.
 * Retorna quantas linhas foram removidas.
 */
function limparVinculosDeMedleys(playlistAtual, itens) {
  const avulsos = new Set();
  const medleys = [];
  for (const it of itens) {
    const nome = String((it && (it.nome || it.titulo || it.title)) || '').trim();
    if (!nome) continue;
    if (ehMedley(it, nome)) {
      const primeiro = normalizarChaveComparacao(nome.split(/\s+\/\s+/)[0]);
      if (primeiro) medleys.push({ primeiro, tema: chaveTema(it.tema || TEMA_PADRAO) });
    } else {
      avulsos.add(normalizarChaveComparacao(nome));
    }
  }
  if (!medleys.length) return 0;
  let removidas = 0;
  for (let i = playlistAtual.length - 1; i >= 0; i--) {
    const linha = playlistAtual[i];
    if (!linha || ehMarcadorTema(linha) || linha.medley === true) continue;
    const titulo = normalizarChaveComparacao(linha.titulo);
    if (!titulo || avulsos.has(titulo)) continue;
    const m = medleys.find((x) => x.primeiro === titulo);
    if (!m) continue;
    if (temaDoBlocoNoIndice(playlistAtual, i, TEMA_PADRAO) !== m.tema) continue;
    playlistAtual.splice(i, 1);
    removidas++;
  }
  return removidas;
}

/**
 * Sincroniza um único culto.
 * Retorna { adicionadas, naoEncontradas: [{nome, tipo}], pendentesVersao: [...] }
 *
 * `pendentesVersao` são as músicas que o servidor não pode resolver sozinho: a
 * escolha da versão é do utilizador e acontece no painel, ANTES de a música
 * entrar na playlist (`POST /api/sync-invb-playlist/aplicar-versoes`).
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
  const pendentesVersao = [];

  /* Antes de importar: desfaz medleys que uma sincronização antiga ligou a uma música individual. */
  limparVinculosDeMedleys(playlistAtual, itens);

  for (const item of itens) {
    const nomeMusica = (item.nome || item.titulo || item.title || '').trim();
    if (!nomeMusica) continue;

    const tema = item.tema || TEMA_PADRAO;

    /* Medley: item único, sem busca por nome e sem vínculo com música individual. */
    if (ehMedley(item, nomeMusica)) {
      try {
        const e = obterEntradaDeMedley(db, nomeMusica);
        if (!e) {
          naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
          continue;
        }
        const rootIdMedley = Number(e.rootRow.root_id != null ? e.rootRow.root_id : e.rootRow.id);
        const itemMedley = construirItemPlaylist(e.rootRow, cultoId, e.versao, tema);
        itemMedley.titulo = nomeMusica;
        itemMedley.medley = true;
        const ix = indiceRootNaPlaylist(playlistAtual, rootIdMedley);
        if (ix >= 0) {
          aplicarVinculoVersaoLyraNoItem(playlistAtual[ix], itemMedley);
          playlistAtual[ix].medley = true;
          garantirTemaNoItemExistente(playlistAtual, ix, tema);
        } else {
          inserirMusicaNoBlocoTema(playlistAtual, tema, itemMedley);
          adicionadas++;
        }
      } catch (e) {
        naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
      }
      continue;
    }

    // 1. Buscar no Lyra online pelo nome (variantes do termo + acerto pelo título).
    //    Quando a playlist vem da API do Lyra DB com o `slug` da música, ele é usado direto:
    //    sem busca por título, não há risco de acertar a música errada.
    const slugDoSite = item.slug ? String(item.slug).trim() : '';
    /* Vinda da API do Lyra DB sem slug: só título EXATO (nada de «começa com» / «contém»). */
    const acerto = slugDoSite ? { slug: slugDoSite } : await resolverSlugNoLyra(nomeMusica, { exato: item.fonteApi === true });
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
    //  (1) Original do Lyra já existe → decidir a versão entre as da família
    //  (2) Não existe na biblioteca → criar Original + Cópia do Lyra; decidir igual
    //  (3) Existe só de outro banco → criar/reutilizar Cópia/Importada do Lyra e usá-la
    //
    //  Em (1) e (2) a família é reduzida a um representante por conteúdo (a
    //  Cópia representa a Original quando são idênticas). Sobrando um só, entra
    //  sozinho; havendo mais de um, a música vai para `pendentesVersao` e o
    //  painel pergunta apenas entre os conteúdos diferentes.
    //  (3) fica como sempre: a Cópia/Importada é a única versão com conteúdo do Lyra.
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

      let versoesDaFamilia = null;
      if (check.ok) {
        // Regra 2: música nova — Original + Cópia padrão idênticas → entra a Cópia
        rootId = check.rootId;
        rootRow = db.prepare('SELECT * FROM musicas WHERE id = ?').get(rootId);
        const r = resolverVersaoLyraDoRoot(db, rootRow, rootId);
        versaoLyraParaPlaylist = r.versao;
        versoesDaFamilia = r.versoes;
      } else if (check.duplicado && check.existente) {
        rootId = check.existente.root_id || check.existente.rootId || check.existente.id;
        rootRow = db.prepare('SELECT * FROM musicas WHERE id = ?').get(rootId);

        if (!rootRow) {
          naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
          continue;
        }

        if (ehOriginalDoLyra(rootRow)) {
          // Regra 1: original do Lyra já na biblioteca — decidir entre as versões
          const r = resolverVersaoLyraDoRoot(db, rootRow, rootId);
          versaoLyraParaPlaylist = r.versao;
          versoesDaFamilia = r.versoes;
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

      if (!rootRow || !rootId) {
        naoEncontradas.push({ nome: nomeMusica, tipo: culto.tipo });
        continue;
      }

      if (!versaoLyraParaPlaylist) {
        /* Sem escolha automática: quem escolhe é o utilizador, no painel, antes
           de a música entrar na playlist. Se o root já está na playlist, o
           vínculo fica como está — o sync não desfaz uma escolha anterior. */
        const opcoes = (versoesDaFamilia || []).map((v) => opcaoVersaoParaEscolha(v, rootId));
        if (indiceRootNaPlaylist(playlistAtual, rootId) < 0) {
          pendentesVersao.push({
            cultoId,
            rootId: Number(rootId),
            tema: chaveTema(tema),
            nome: String(rootRow.titulo || nomeMusica).trim(),
            /* Para o painel mostrar de que música se trata sem margem para dúvida. */
            artista: String(rootRow.artista || '').trim(),
            opcoes,
          });
        }
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

  return { adicionadas, naoEncontradas, pendentesVersao };
}

/**
 * Aplica na playlist as versões escolhidas pelo utilizador no painel.
 *
 * Só lê o banco: a versão escolhida entra como está, com as suas tags e os seus
 * dados — nenhuma cópia nova é criada e nenhuma versão é alterada.
 * Retorna { adicionadas }.
 */
function aplicarEscolhasVersao({ db, playlistsJson, escolhas }) {
  let adicionadas = 0;
  for (const esc of Array.isArray(escolhas) ? escolhas : []) {
    const cultoId = esc && esc.cultoId != null ? String(esc.cultoId).trim() : '';
    const rootId = Number(esc && esc.rootId);
    const versaoId = Number(esc && esc.versaoId);
    if (!cultoId || !Number.isFinite(rootId) || !Number.isFinite(versaoId)) continue;

    const rootRow = db.prepare('SELECT * FROM musicas WHERE id = ?').get(rootId);
    if (!rootRow) continue;
    const versao =
      versaoId === rootId ? rootRow : db.prepare('SELECT * FROM musicas WHERE id = ?').get(versaoId);
    /* Só uma versão da MESMA família entra — nunca outra música. */
    if (!versao) continue;
    const rootDaVersao = Number(versao.root_id != null ? versao.root_id : versao.id);
    if (rootDaVersao !== rootId) continue;

    if (!Array.isArray(playlistsJson[cultoId])) playlistsJson[cultoId] = [];
    const playlistAtual = playlistsJson[cultoId];
    const tema = chaveTema(esc.tema) || TEMA_PADRAO;
    const itemPlaylist = construirItemPlaylist(rootRow, cultoId, versao, tema);

    const idxExistente = indiceRootNaPlaylist(playlistAtual, rootId);
    if (idxExistente >= 0) {
      aplicarVinculoVersaoLyraNoItem(playlistAtual[idxExistente], itemPlaylist);
      garantirTemaNoItemExistente(playlistAtual, idxExistente, tema);
      continue;
    }
    inserirMusicaNoBlocoTema(playlistAtual, tema, itemPlaylist);
    adicionadas++;
  }
  return { adicionadas };
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
  /* Segunda metade do sync: as versões que o utilizador escolheu no painel. */
  expressApp.post('/api/sync-invb-playlist/aplicar-versoes', (req, res) => {
    try {
      const escolhas = req.body && Array.isArray(req.body.escolhas) ? req.body.escolhas : [];
      const playlistsJson = loadPlaylistsJson(paths.playlistsJsonPath) || {};
      const { adicionadas } = aplicarEscolhasVersao({ db, playlistsJson, escolhas });
      savePlaylistsJson(paths.playlistsJsonPath, playlistsJson);
      if (adicionadas > 0) {
        marcarBancoCompartilhadoAlterado();
        notificarBancoCompartilhadoAlterado();
      }
      return res.json({ adicionadas });
    } catch (e) {
      console.error('[syncInvbPlaylist] Erro ao aplicar versões escolhidas:', e);
      return res.status(500).json({ erro: 'Erro interno: ' + e.message });
    }
  });

  expressApp.post('/api/sync-invb-playlist', async (req, res) => {
    try {
      /* Culto selecionado no painel (`culto_AAAA-MM-DD_<sufixo>`): filtro obrigatório —
         só a playlist do site correspondente a este culto é importada. */
      const cultoIdSelecionado =
        req.body && req.body.cultoId != null ? String(req.body.cultoId).trim() : '';
      if (!cultoIdSelecionado) {
        return res.status(400).json({ erro: 'Selecione primeiro o culto no Lyra.' });
      }

      // 1. Buscar as playlists. Origem preferida: API do Lyra DB (database.invbotafogo.com.br),
      //    autenticada pela LYRA_API_KEY — usada assim que o site a anuncia. Enquanto não
      //    anunciar, segue a fonte anterior (Supabase), para o botão não ficar sem função.
      let cultos = null;
      let fonte = 'lyra-db-api';
      try {
        cultos = await buscarCultosLyraApi();
      } catch (e) {
        if (e instanceof ErroLyraApi) {
          /* 502 (e não 401): o 401 é do próprio Controller (E1/E2) — aqui falhou o serviço de fora. */
          return res.status(502).json({ erro: e.message, codigo: e.codigo });
        }
        return res.status(502).json({ erro: 'Falha ao consultar as playlists do Lyra DB: ' + e.message });
      }
      if (cultos == null) {
        fonte = 'supabase-legado';
        try {
          cultos = await buscarCultosInvb();
        } catch (e) {
          return res.status(502).json({ erro: 'Falha ao buscar dados do site INVB: ' + e.message });
        }
      }

      /* `cultoId` do site usa a mesma convenção do painel (`cultoIdDoSite`). */
      cultos = (cultos || []).filter((c) => c && c.cultoId === cultoIdSelecionado);

      if (cultos.length === 0) {
        return res.json({
          adicionadas: 0,
          naoEncontradas: [],
          aviso: 'Nenhuma playlist encontrada no site para o culto selecionado.',
        });
      }

      // 2. Carregar playlists existentes
      const playlistsJson = loadPlaylistsJson(paths.playlistsJsonPath) || {};

      let totalAdicionadas = 0;
      const todasNaoEncontradas = [];
      const todasPendentesVersao = [];
      const ministrantePorCulto = {}; // cultoId → nome do ministrante

      // 3. Processar cada culto
      for (const culto of cultos) {
        const resultado = await sincronizarCulto({ culto, db, playlistsJson, paths });
        totalAdicionadas += resultado.adicionadas;
        todasNaoEncontradas.push(...resultado.naoEncontradas);
        todasPendentesVersao.push(...(resultado.pendentesVersao || []));
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
        /* Músicas cuja versão o painel tem de perguntar antes de adicionar. */
        pendentesVersao: todasPendentesVersao,
        ministrantePorCulto,
        /* De onde vieram as playlists: `lyra-db-api` ou `supabase-legado` (site ainda sem a API). */
        fonte,
      });
    } catch (e) {
      if (e && typeof e.message === 'string' && e.message.includes('LYRA_API_KEY')) {
        return res.status(502).json({ erro: e.message });
      }
      console.error('[syncInvbPlaylist] Erro inesperado:', e);
      return res.status(500).json({ erro: 'Erro interno: ' + e.message });
    }
  });
}

module.exports = {
  registrarRotasSyncInvbPlaylist,
  /* Exportados para teste (`syncInvbPlaylist.test.js`). */
  sincronizarCulto,
  aplicarEscolhasVersao,
  versoesDistintasPorConteudo,
  versoesRowsRigorosamenteIdenticas,
  variantesDeTermoBusca,
  pontuacaoTitulo,
  construirItemPlaylist,
  inserirMusicaNoBlocoTema,
  garantirTemaNoItemExistente,
  indiceRootNaPlaylist,
  ehMedley,
  limparVinculosDeMedleys,
};
