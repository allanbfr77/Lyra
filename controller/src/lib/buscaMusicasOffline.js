/**
 * Busca offline em SQLite de músicas (banco do utilizador e catálogo).
 *
 * Extraído do servidor HTTP: músicas, letras e bíblia partilham o mesmo `fold`.
 */

'use strict';

const cifra = require('./cifraLetras');

/**
 * Normaliza texto para a busca offline (banco local + catálogo).
 *
 * Além de acentos/caixa, remove pontuação (ex.: vírgula em «Ah, Jesus»),
 * para que «ah jesus» encontre o título cadastrado. Os modos online já
 * toleram isso via casamento por palavra no índice; aqui o match é
 * `includes` no texto inteiro, então a pontuação precisa sumir.
 */
function fold(s) {
  return cifra
    .foldAccents(String(s || ''))
    .replace(/[.,;:!?¡¿"'’‘“”`´^~(){}[\]<>/\\|@#$%&*+=_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BUSCA_MUSICAS_LOTE = 40;

function matchTituloArtistaBusca(titulo, artista, foldQ, wantTit, wantArt) {
  if (!foldQ) return true;
  if (wantTit && fold(titulo).includes(foldQ)) return true;
  if (wantArt && fold(artista).includes(foldQ)) return true;
  return false;
}

function matchLetraBusca(estrofesJson, foldQ) {
  if (!foldQ) return false;
  try {
    const arr = JSON.parse(estrofesJson || '[]');
    const letraTxt = fold(Array.isArray(arr) ? arr.join('\n') : String(arr));
    return letraTxt.includes(foldQ);
  } catch (_) {
    return false;
  }
}

/**
 * Varre um SQLite de músicas sem carregar todas as letras de uma vez.
 * Percorre a tabela na ordem original (como o scan antigo); título/artista
 * resolvem-se na meta e as estrofes vêm em lotes, com `setImmediate` entre
 * eles, para o processo principal do Electron não congelar a digitação.
 *
 * @param {import('better-sqlite3').Database | null} sqliteDb
 * @param {{ foldQ: string, wantTit: boolean, wantArt: boolean, wantLetra: boolean, soRaiz?: boolean, limite?: number }} opts
 * @returns {Promise<Array<{ id: number, titulo: string, artista: string }>>}
 */
async function varrerMusicasPorCriterios(sqliteDb, opts) {
  const wantTit = !!opts.wantTit;
  const wantArt = !!opts.wantArt;
  const wantLetra = !!opts.wantLetra;
  const foldQ = opts.foldQ;
  const limite = Number.isFinite(opts.limite) && opts.limite > 0 ? opts.limite : Infinity;
  if (!sqliteDb || (!wantTit && !wantArt && !wantLetra)) return [];

  const sql = opts.soRaiz
    ? 'SELECT id, titulo, artista FROM musicas WHERE parent_id IS NULL'
    : 'SELECT id, titulo, artista FROM musicas';
  const metas = sqliteDb.prepare(sql).all();
  const out = [];

  for (let i = 0; i < metas.length && out.length < limite; i += BUSCA_MUSICAS_LOTE) {
    if (wantLetra && i > 0) await new Promise((r) => setImmediate(r));
    const chunk = metas.slice(i, i + BUSCA_MUSICAS_LOTE);
    const idsLetra = [];
    const hitTitArt = new Set();
    for (const r of chunk) {
      if (matchTituloArtistaBusca(r.titulo, r.artista, foldQ, wantTit, wantArt)) {
        hitTitArt.add(r.id);
      } else if (wantLetra) {
        idsLetra.push(r.id);
      }
    }
    const hitLetra = new Set();
    if (idsLetra.length) {
      const ph = idsLetra.map(() => '?').join(',');
      const rows = sqliteDb
        .prepare(`SELECT id, estrofes FROM musicas WHERE id IN (${ph})`)
        .all(...idsLetra);
      for (const row of rows) {
        if (matchLetraBusca(row.estrofes, foldQ)) hitLetra.add(row.id);
      }
    }
    for (const r of chunk) {
      if (out.length >= limite) break;
      if (hitTitArt.has(r.id) || hitLetra.has(r.id)) {
        out.push({ id: r.id, titulo: r.titulo, artista: r.artista || '' });
      }
    }
  }

  return limite === Infinity ? out : out.slice(0, limite);
}

module.exports = { fold, varrerMusicasPorCriterios };
