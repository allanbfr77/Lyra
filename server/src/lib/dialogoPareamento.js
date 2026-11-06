'use strict';

/**
 * Diálogo nativo de aprovação do pareamento (Servidor). O operador DESTA máquina decide; sem
 * resposta o pedido expira sozinho (o serviço de pareamento cuida da validade). Diálogo fechado,
 * Esc ou erro = NEGAR. O padrão do botão é «Negar».
 */

/**
 * @param {{ dialog: { showMessageBox: Function }, obterJanela?: () => (object|undefined) }} deps
 * @returns {(pedido: {pairingId: string, nome: string, ip: string, codigo: string}, pareamento: {aprovar: Function, negar: Function}) => Promise<void>}
 */
function criarPedirAprovacaoPareamento({ dialog, obterJanela = () => undefined }) {
  return async function pedirAprovacao(pedido, pareamento) {
    let aprovado = false;
    try {
      const janela = obterJanela();
      const opcoes = {
        type: 'question',
        buttons: ['Negar', 'Aprovar'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: 'Lyra — Parear Controlador',
        message: `O Controlador «${pedido.nome || 'sem nome'}» (${pedido.ip || 'IP desconhecido'}) quer se parear com este Servidor.`,
        detail:
          `Código de confirmação: ${pedido.codigo}\n\n`
          + 'Confira se o MESMO código aparece no Controlador. Só aprove se foi você quem iniciou o pareamento agora e os códigos forem iguais. '
          + 'Na dúvida, negue: nada muda para quem já usa o Lyra.',
      };
      const r = janela && typeof janela.isDestroyed === 'function' && !janela.isDestroyed()
        ? await dialog.showMessageBox(janela, opcoes)
        : await dialog.showMessageBox(opcoes);
      aprovado = !!r && r.response === 1;
    } catch (_) {
      aprovado = false;
    }
    try {
      if (aprovado) pareamento.aprovar(pedido.pairingId);
      else pareamento.negar(pedido.pairingId);
    } catch (_) {
      /* o pedido já pode ter expirado ou sido decidido por outro caminho */
    }
  };
}

module.exports = { criarPedirAprovacaoPareamento };
