'use strict';

const { normalizarChaveComparacao, listarMinistrantesNoDb } = require('../db');
const { loadPlaylistsJson, savePlaylistsJson } = require('./playlistsStore');
const { TONS_OK } = require('./invbTonsFromSupabase');

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
        const t = String(tom || '').trim();
        if (!TONS_OK.has(t)) continue;
        byMin.set(String(min || '').trim().toLocaleLowerCase('pt-BR'), t);
      }
    } else if (Array.isArray(tons)) {
      for (const p of tons) {
        const t = String(p?.tom || '').trim();
        const min = String(p?.ministrante || '').trim().toLocaleLowerCase('pt-BR');
        if (!min || !TONS_OK.has(t)) continue;
        byMin.set(min, t);
      }
    }
  }
  return out;
}

/**
 * Atualiza `tom` nas playlists locais quando há match título + ministrante.
 * @returns {{ mudou: boolean, atualizadas: number }}
 */
function aplicarTonsImportNasPlaylists(playlistsJsonPathFn, itens) {
  const mapa = mapaTonsPorTitulo(itens);
  if (!mapa.size) return { mudou: false, atualizadas: 0 };

  const idParaNome = new Map();
  for (const m of listarMinistrantesNoDb()) {
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
      const tomNovo = byMin.get(nomeKey);
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
  aplicarTonsImportNasPlaylists,
};
