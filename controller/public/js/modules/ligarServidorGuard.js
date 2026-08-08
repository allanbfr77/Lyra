/**
 * Guard pré-Socket.IO da ligação ao Servidor (porta 5510).
 *
 * Endereço desta própria máquina só é aceite quando quem atende a 5510 se identifica
 * como app Servidor (`role: 'server'`). Caso contrário a tentativa aborta — em silêncio
 * no painel — para não confundir o motor local (`controller-local`) com um Servidor e
 * para o auto-reconectar não interromper o operador com alertas.
 */

/**
 * @param {boolean} ehLocal IP alvo é desta máquina
 * @param {'server'|'controller-local'|null|undefined} papelHost5510 resultado de /api/identity
 * @returns {boolean} true → não iniciar Socket.IO nem mudar badge
 */
export function deveAbortarLigacaoIpLocalSemServidor(ehLocal, papelHost5510) {
  return !!ehLocal && papelHost5510 !== 'server';
}

/**
 * Orquestra a decisão do guard e os efeitos laterais da tentativa — usado pelos testes
 * e espelha o contrato de `conectar()` após resolver IP e papel.
 *
 * @param {object} opts
 * @param {boolean} opts.ehLocal
 * @param {() => Promise<'server'|'controller-local'|null>} opts.consultarPapel
 * @param {() => void} opts.iniciarSocket
 * @param {(estado: string) => void} opts.setBadge
 * @param {(msg: string) => void} [opts.alertFn]
 * @returns {Promise<{ abortado: boolean, motivo?: string }>}
 */
export async function executarTentativaLigacaoComGuard({
  ehLocal,
  consultarPapel,
  iniciarSocket,
  setBadge,
  alertFn = () => {},
}) {
  const papel = await consultarPapel();
  if (deveAbortarLigacaoIpLocalSemServidor(ehLocal, papel)) {
    // Silencioso de propósito: sem alert, sem Socket.IO, sem mudança de badge.
    void alertFn;
    return { abortado: true, motivo: 'ip-local-sem-servidor' };
  }
  setBadge('conectando');
  iniciarSocket();
  return { abortado: false };
}
