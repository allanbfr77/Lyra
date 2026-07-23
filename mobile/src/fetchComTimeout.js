/**
 * fetch com AbortController — evita ficar pendurado sem feedback.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
export async function fetchComTimeout(url, options = {}, timeoutMs = 50000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('Tempo esgotado. Verifique a internet e tente novamente.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
