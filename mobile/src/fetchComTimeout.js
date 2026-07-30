/**
 * fetch com timeout e cancelamento externo — evita ficar pendurado sem feedback.
 *
 * Dois motivos de aborto, distinguidos em `erro.motivo`:
 * - `timeout`   → estourou `timeoutMs` (rede lenta, host inalcançável)
 * - `cancelado` → quem chamou desistiu (ex.: perdeu uma corrida entre hops)
 *
 * A distinção importa: um hop cancelado por ter perdido a corrida não é falha e
 * não deve virar mensagem de erro para o usuário.
 */

import { registrarHop } from './diagnosticoRede.js';

export const TIMEOUT_PADRAO_MS = 50000;

/**
 * @param {string} url
 * @param {RequestInit & { rotulo?: string }} [options] - `rotulo` é usado só no diagnóstico
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
export async function fetchComTimeout(url, options = {}, timeoutMs = TIMEOUT_PADRAO_MS) {
  const { rotulo, signal: sinalExterno, ...init } = options || {};
  const ctrl = new AbortController();

  /** @type {'timeout'|'cancelado'|null} */
  let motivo = null;

  const timer = setTimeout(() => {
    motivo = 'timeout';
    ctrl.abort();
  }, timeoutMs);

  // Propaga o cancelamento externo (corrida entre hops) para este fetch.
  const aoCancelar = () => {
    motivo = 'cancelado';
    ctrl.abort();
  };
  if (sinalExterno) {
    if (sinalExterno.aborted) aoCancelar();
    else sinalExterno.addEventListener('abort', aoCancelar);
  }

  const inicio = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    registrarHop({ rotulo: rotulo || 'fetch', url, status: res.status, ms: Date.now() - inicio });
    return res;
  } catch (e) {
    const ms = Date.now() - inicio;

    if (motivo === 'cancelado') {
      registrarHop({ rotulo: rotulo || 'fetch', url, ms, motivo: 'cancelado' });
      const err = new Error('Requisição cancelada.');
      err.motivo = 'cancelado';
      throw err;
    }

    if (motivo === 'timeout' || e?.name === 'AbortError') {
      registrarHop({ rotulo: rotulo || 'fetch', url, ms, motivo: 'timeout' });
      const err = new Error('Tempo esgotado. Verifique a internet e tente novamente.');
      err.motivo = 'timeout';
      err.name = 'AbortError'; // mantém compatibilidade com quem já checa AbortError
      throw err;
    }

    registrarHop({ rotulo: rotulo || 'fetch', url, ms, erro: e?.message || String(e), motivo: 'rede' });
    if (e && !e.motivo) e.motivo = 'rede';
    throw e;
  } finally {
    clearTimeout(timer);
    if (sinalExterno) sinalExterno.removeEventListener('abort', aoCancelar);
  }
}
