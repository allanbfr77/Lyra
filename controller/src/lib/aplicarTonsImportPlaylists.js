'use strict';

const { normalizarChaveComparacao, listarMinistrantesNoDb } = require('../db');
const { loadPlaylistsJson, savePlaylistsJson } = require('./playlistsStore');
const {
  TONS_OK,
  ehMinistranteTodos,
  normTom,
  normMin,
  splitNomesMinistrantes,
} = require('./invbTonsFromSupabase');

/**
 * Monta mapa tituloNorm → { ministranteNomeLower → tom }.
 * @param {{ titulo: string, tons: object|array }[]} itens
 */
function mapaTonsPorTitulo(itens) {
  const out = new Map();
  for (const item of itens || []) {
    const tituloNorm = normalizarChaveComparacao(item?.titulo);
    if (!tituloNorm) continue;
    if (!out.has(tituloNorm)) out.set(tituloNorm, new Map());
    const byMin = out.get(tituloNorm);
    const tons = item.tons;
    if (tons && typeof tons === 'object' && !Array.isArray(tons)) {
      for (const [min, tom] of Object.entries(tons)) {
        const t = normTom(tom);
        if (!TONS_OK.has(t)) continue;
        for (const nome of splitNomesMinistrantes(min)) {
          const chave = String(nome || '').trim().toLocaleLowerCase('pt-BR');
          if (chave) byMin.set(chave, t);
        }
      }
    } else if (Array.isArray(tons)) {
      for (const p of tons) {
        const t = normTom(p?.tom);
        if (!TONS_OK.has(t)) continue;
        for (const nome of splitNomesMinistrantes(p?.ministrante || p?.nome || '')) {
          const min = String(nome || '').trim().toLocaleLowerCase('pt-BR');
          if (min) byMin.set(min, t);
        }
      }
    }
  }
  return out;
}

/**
 * Chave do mapa de tons do site para este nome (Humberto ≈ Pr. Humberto).
 * @param {Map<string, string>} byMin
 * @param {string} nomeMinistrante
 */
function chaveMinistranteNoMapaTons(byMin, nomeMinistrante) {
  const key = String(nomeMinistrante || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  if (!key || ehMinistranteTodos(key) || !byMin || typeof byMin.has !== 'function') return '';
  if (byMin.has(key)) return key;
  const canon = String(normMin(nomeMinistrante) || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  if (canon && byMin.has(canon)) return canon;
  const hits = [];
  for (const k of byMin.keys()) {
    if (!k || ehMinistranteTodos(k)) continue;
    if (
      k.startsWith(`${key} `) ||
      key.startsWith(`${k} `) ||
      (canon && (k.startsWith(`${canon} `) || canon.startsWith(`${k} `)))
    ) {
      hits.push(k);
    }
  }
  return hits.length === 1 ? hits[0] : '';
}

/**
 * Tom específico do ministrante, ou o tom «Todos» se não houver específico.
 * @param {Map<string, string>} byMin
 * @param {string} nomeMinistrante
 */
function resolverTomDoMapa(byMin, nomeMinistrante) {
  if (!byMin || typeof byMin.get !== 'function') return '';
  const chave = chaveMinistranteNoMapaTons(byMin, nomeMinistrante);
  if (chave) return byMin.get(chave) || '';
  if (byMin.has('todos')) return byMin.get('todos') || '';
  if (byMin.has('todas')) return byMin.get('todas') || '';
  return '';
}

/**
 * Atualiza `tom` nas playlists locais quando há match título + ministrante.
 * «Todos» no site preenche qualquer ministrante já escolhido na linha.
 * @returns {{ mudou: boolean, atualizadas: number }}
 */
function aplicarTonsImportNasPlaylists(playlistsJsonPathFn, itens) {
  const mapa = mapaTonsPorTitulo(itens);
  if (!mapa.size) return { mudou: false, atualizadas: 0 };

  const idParaNome = new Map();
  for (const m of listarMinistrantesNoDb()) {
    if (ehMinistranteTodos(m.nome)) continue;
    idParaNome.set(Number(m.id), String(m.nome || '').trim().toLocaleLowerCase('pt-BR'));
  }

  const playlists = loadPlaylistsJson(playlistsJsonPathFn);
  let atualizadas = 0;
  let mudou = false;

  for (const lista of Object.values(playlists)) {
    if (!Array.isArray(lista)) continue;
    for (const it of lista) {
      if (!it || it.tipo === 'marcador_tema') continue;
      const tituloNorm = normalizarChaveComparacao(it.titulo);
      const byMin = mapa.get(tituloNorm);
      if (!byMin) continue;
      const mid = Number(it.ministranteId);
      if (!Number.isFinite(mid) || mid <= 0) continue;
      const nomeKey = idParaNome.get(mid);
      if (!nomeKey) continue;
      const tomNovo = resolverTomDoMapa(byMin, nomeKey);
      if (!tomNovo) continue;
      if (String(it.tom || '').trim() === tomNovo) continue;
      it.tom = tomNovo;
      atualizadas += 1;
      mudou = true;
    }
  }

  if (mudou) savePlaylistsJson(playlistsJsonPathFn, playlists);
  return { mudou, atualizadas };
}

module.exports = {
  mapaTonsPorTitulo,
  resolverTomDoMapa,
  chaveMinistranteNoMapaTons,
  aplicarTonsImportNasPlaylists,
};
