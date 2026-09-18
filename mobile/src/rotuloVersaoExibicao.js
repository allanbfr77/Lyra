/**
 * Nome exibido dos rótulos automáticos de versão.
 *
 * Espelha `ROTULOS_VERSAO_EXIBICAO` do painel (`controller/public/js/controllerAppCore.js`):
 * só exibição — o que está gravado no banco (`ROTULO_COPIA_PADRAO` = «Cópia») não
 * muda. A Cópia padrão, a que nasce junto com a Original, aparece como
 * «Cópia/Original». Tags personalizadas saem exactamente como o utilizador escreveu.
 */
const ROTULOS_VERSAO_EXIBICAO = new Map([
  ['cópia'.normalize('NFC'), 'Cópia/Original'],
  ['cópia/modificada'.normalize('NFC'), 'Cópia'],
  ['cópia/importada'.normalize('NFC'), 'Cópia/Importada'],
  ['cópia/manual'.normalize('NFC'), 'Cópia/Manual'],
]);

/**
 * @param {unknown} rotulo
 * @returns {string} nome a exibir ('' quando não há rótulo)
 */
export function rotuloVersaoExibicao(rotulo) {
  const bruto = String(rotulo == null ? '' : rotulo).trim();
  if (!bruto) return '';
  const chave = bruto.normalize('NFC').toLocaleLowerCase('pt-BR');
  return ROTULOS_VERSAO_EXIBICAO.get(chave) || bruto;
}
