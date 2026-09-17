/**
 * Versão da música num item de playlist (id de fetch, pré-voo, fonte e igualdade).
 *
 * Extraído do AppCore sem unificar os dois ids: o share manda a string do
 * `versaoLocalId` numérico; o pré-voo manda número e trata `c_*` como o root.
 * A igualdade de item NÃO faz trim (diferente de `versaoLocalIdTrimado`).
 * Marcador de tema nunca conta como música. O fetch e o DOM ficam no núcleo.
 */

import { PLAYLIST_TIPO_MARCADOR_TEMA } from './chavesArmazenamentoLocal.js';
import { ehVersaoLocalLegada, ehVersaoServidorId } from './copiasLocaisLetra.js';

export function ehMarcadorTemaPlaylist(it) {
  return !!(it && it.tipo === PLAYLIST_TIPO_MARCADOR_TEMA);
}

/**
 * Assinatura do CONTEÚDO de uma versão: título, artista e estrofes, exatamente
 * como estão — caractere por caractere, sem trim nem normalização. Rótulo, id,
 * data de criação e tipo da versão ficam de fora: não são conteúdo.
 *
 * Devolve `null` quando o conteúdo não é conhecido (sem objeto ou sem estrofes).
 * `null` nunca é igual a nada: sem conteúdo não dá para afirmar que é idêntico.
 */
export function assinaturaConteudoVersao(conteudo) {
  if (!conteudo || typeof conteudo !== 'object') return null;
  if (!Array.isArray(conteudo.estrofes)) return null;
  const titulo = conteudo.titulo == null ? '' : String(conteudo.titulo);
  const artista = conteudo.artista == null ? '' : String(conteudo.artista);
  const estrofes = conteudo.estrofes.map((s) => (s == null ? '' : String(s)));
  return JSON.stringify([titulo, artista, estrofes]);
}

/** Duas versões só são iguais se o conteúdo das duas for conhecido e idêntico. */
export function versoesConteudoRigorosamenteIdentico(a, b) {
  const sa = assinaturaConteudoVersao(a);
  const sb = assinaturaConteudoVersao(b);
  return sa != null && sb != null && sa === sb;
}

/** Valor da opção que representa a Original na lista de versões. */
export const VALOR_OPCAO_VERSAO_ORIGINAL = '__ORIGINAL__';

function ehOpcaoVersaoOriginal(op) {
  return !!op && op.value === VALOR_OPCAO_VERSAO_ORIGINAL;
}

/**
 * Reduz as opções de versão às que têm conteúdo realmente diferente.
 *
 * A lista chega com a Original em primeiro lugar. Entre versões rigorosamente
 * idênticas fica uma só — e quem fica, quando a repetição é da Original, é a
 * CÓPIA: ela toma o lugar da Original na lista (mesma posição). A Original é
 * imutável, então usá-la na playlist obriga o Lyra a criar uma terceira versão
 * Editada na edição rápida dos Slides; a Cópia, sendo idêntica, representa o
 * mesmo conteúdo e pode ser editada no lugar. As demais repetições continuam
 * resolvidas pela primeira ocorrência. Opções cujo `conteudo` não é conhecido
 * ficam sempre — não há como afirmar que são iguais a outra.
 *
 * Sobrando uma opção só, quem chama não pergunta nada e importa essa opção.
 */
export function opcoesVersaoDistintasPorConteudo(opcoes) {
  const lista = Array.isArray(opcoes) ? opcoes : [];
  const indicePorAssinatura = new Map();
  const distintas = [];
  let idxOriginal = -1;
  for (const op of lista) {
    const sig = assinaturaConteudoVersao(op && op.conteudo);
    if (sig != null) {
      if (indicePorAssinatura.has(sig)) {
        const i = indicePorAssinatura.get(sig);
        // Idêntica à Original: a primeira Cópia assume o lugar dela.
        if (i === idxOriginal) {
          distintas[i] = op;
          idxOriginal = -1;
        }
        continue;
      }
      indicePorAssinatura.set(sig, distintas.length);
      if (idxOriginal === -1 && ehOpcaoVersaoOriginal(op)) idxOriginal = distintas.length;
    }
    distintas.push(op);
  }
  return distintas;
}

/** Comparação de versão na playlist: sem trim; `0` é falsy e conta como vazio. */
export function versaoLocalIdParaComparar(versaoId) {
  return versaoId ? String(versaoId) : '';
}

export function versaoLocalIdTrimado(versaoId) {
  return versaoId != null && String(versaoId).trim() ? String(versaoId).trim() : '';
}

/** Id no GET /api/musicas do código de partilha: cópia SQLite ou o `id` do item. */
export function idFetchMusicaPlaylist(it) {
  const vid = versaoLocalIdTrimado(it?.versaoLocalId);
  if (vid && ehVersaoServidorId(vid)) return vid;
  return it?.id;
}

/**
 * Qual id pedir ao servidor no pré-voo — o mesmo critério do clique.
 * Se divergir, o pré-voo acusa «música apagada» as que abrem sem problema.
 * Cópias `c_*` pedem o original (não têm id no SQLite).
 */
export function idMusicaParaPreVoo(item) {
  const vid = item?.versaoLocalId ? String(item.versaoLocalId).trim() : '';
  if (vid && !ehVersaoLocalLegada(vid)) {
    const n = Number(vid);
    if (Number.isFinite(n)) return n;
  }
  const raiz = Number(item?.id);
  return Number.isFinite(raiz) ? raiz : null;
}

export function fonteBancoNormalizada(bancoFonte) {
  return bancoFonte === 'catalog' ? 'catalog' : 'user';
}

export function fonteBancoItemPlaylist(it) {
  return fonteBancoNormalizada(it?.bancoFonte);
}

export function itemPlaylistMesmaMusicaEVersao(it, idMusica, versaoLocalId, bancoFonte) {
  if (!it || ehMarcadorTemaPlaylist(it)) return false;
  if (Number(it.id) !== Number(idMusica)) return false;
  return (
    versaoLocalIdParaComparar(it.versaoLocalId) === versaoLocalIdParaComparar(versaoLocalId) &&
    fonteBancoItemPlaylist(it) === fonteBancoNormalizada(bancoFonte)
  );
}

export function playlistJaContemMesmaMusicaEVersao(pl, idMusica, versaoLocalId, bancoFonte) {
  return pl.some((x) => itemPlaylistMesmaMusicaEVersao(x, idMusica, versaoLocalId, bancoFonte));
}

/**
 * Mesmo root + mesma versão + mesma fonte.
 * `raizId` entra cru: `null` falha (`Number.isFinite(null)` é falso), como no AppCore.
 */
export function playlistItemMesmaVersaoQueRaiz(it, raizId, versaoLocalId, bancoFonte) {
  if (!it || ehMarcadorTemaPlaylist(it)) return false;
  const itRoot = Number(it.id);
  if (!Number.isFinite(raizId) || !Number.isFinite(itRoot) || itRoot !== raizId) return false;
  return (
    versaoLocalIdParaComparar(versaoLocalId) === versaoLocalIdParaComparar(it.versaoLocalId) &&
    fonteBancoItemPlaylist(it) === fonteBancoNormalizada(bancoFonte)
  );
}
