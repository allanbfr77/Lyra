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
 * Nome curto do banco de origem, igual ao da legenda da Biblioteca do painel
 * (`BIB_ORIGEM_META` em controllerAppCore.js). A versão criada por uma
 * importação aparece como «Versão <ORIGEM>» — «Versão HLYRCS», «Versão LYRA», …
 */
const ORIGEM_NOME_CURTO = new Map([
  ['banco-local', 'HLYRCS'],
  ['lyra-online', 'LYRA'],
  ['cifraclub', 'CIFRA CLUB'],
  ['letras-mus-br', 'LETRAS.MUS'],
  ['manual', 'MANUAL'],
]);

const ROTULO_VERSAO_IMPORTADA_BRUTO = 'cópia/importada'.normalize('NFC');

/**
 * @param {unknown} rotulo
 * @param {unknown} [origem] valor de `origem_importacao` da versão, quando conhecido
 * @returns {string} nome a exibir ('' quando não há rótulo)
 */
export function rotuloVersaoExibicao(rotulo, origem) {
  const bruto = String(rotulo == null ? '' : rotulo).trim();
  if (!bruto) return '';
  const chave = bruto.normalize('NFC').toLocaleLowerCase('pt-BR');
  if (chave === ROTULO_VERSAO_IMPORTADA_BRUTO) {
    const banco = ORIGEM_NOME_CURTO.get(String(origem == null ? '' : origem).trim());
    if (banco) return `Versão ${banco}`;
  }
  return ROTULOS_VERSAO_EXIBICAO.get(chave) || bruto;
}
