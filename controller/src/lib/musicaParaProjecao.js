'use strict';

const { getDb, getCatalog, rowMusicaParaJson } = require('../db');

/**
 * Busca uma música para projetar, no banco desta máquina.
 *
 * ## A dependência que inverte de sentido
 *
 * No Servidor, o equivalente disto (`lib/fetchMusicaFromControladorHttp.js`) faz dois
 * pedidos HTTP ao Controlador, porque o banco não é dele. Aqui o banco está em casa: o
 * mesmo papel, sem rede pelo meio. É por isso que a busca entra no aplicador como
 * dependência injectada em vez de estar lá dentro — a regra de projeção é a mesma nos
 * dois modos, a origem dos dados é oposta.
 *
 * A ordem das fontes é a mesma do Servidor, e não por acaso: primeiro o banco do
 * utilizador, depois o catálogo empacotado. Uma música editada pelo operador tem de
 * ganhar da versão original do catálogo, senão as correcções dele desapareciam ao
 * projetar a partir do celular.
 *
 * @param {number} id
 * @returns {Promise<{titulo?: string, estrofes?: string[]}|null>}
 */
async function buscarMusicaLocalParaProjecao(id) {
  const idNum = Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) return null;

  const doUtilizador = lerMusica(getDb(), idNum, 'user');
  if (temEstrofes(doUtilizador)) return doUtilizador;

  const doCatalogo = lerMusica(getCatalog(), idNum, 'catalog');
  if (temEstrofes(doCatalogo)) return doCatalogo;

  return null;
}

function lerMusica(bd, id, fonte) {
  if (!bd) return null;
  try {
    const row = bd.prepare('SELECT * FROM musicas WHERE id = ?').get(id) || null;
    return row ? rowMusicaParaJson(row, { fonte }) : null;
  } catch (_) {
    /* Banco em falta ou esquema antigo não pode derrubar a projeção: o chamador segue
       para a fonte seguinte e, se nenhuma servir, o comando simplesmente não se aplica. */
    return null;
  }
}

function temEstrofes(musica) {
  return !!musica && Array.isArray(musica.estrofes) && musica.estrofes.length > 0;
}

module.exports = { buscarMusicaLocalParaProjecao };
