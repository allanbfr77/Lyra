/**
 * Contrato HTTP de duplicidade (409) partilhado por músicas e letras.
 */

'use strict';

/**
 * Modo de resolução de duplicidade a partir do corpo da requisição.
 *
 * Sem `decisaoDuplicidade` o backend apenas **detecta** e devolve 409, sem
 * gravar: quem decide é o usuário, no diálogo do controlador. Com
 * `decisaoDuplicidade: 'criar'` a escolha já foi feita e a cópia é gravada.
 */
function modoDuplicidadeDoBody(body) {
  const decisao = String((body && body.decisaoDuplicidade) || '').trim().toLowerCase();
  return decisao === 'criar' ? 'copiar' : 'perguntar';
}

/** Resposta padrão de duplicidade detectada (nada foi gravado no banco). */
function responderDuplicidade(res, resultado, titulo, artista) {
  return res.status(409).json({
    duplicado: true,
    existente: resultado.existente,
    titulo: String(titulo || '').trim(),
    artista: String(artista || '').trim(),
  });
}

module.exports = { modoDuplicidadeDoBody, responderDuplicidade };
