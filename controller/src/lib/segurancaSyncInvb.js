'use strict';

/**
 * Validações de segurança do sync de tons INVB (E1.1).
 *
 * Duas peças pequenas e puras, usadas por `rotas/ministrantes.js`:
 *
 *  - `validarUrlNuvemTons`: a URL da API de tons na nuvem (`INVB_TONS_SYNC_URL`) só é
 *    usada se for HTTPS, de um host permitido, sem credenciais, porta, query ou fragmento.
 *    Sem isso, quem controla essa URL decide para onde o controlador faz `fetch` e o que
 *    ele importa no banco (SSRF).
 *  - `segredosIguais`: comparação de segredos em tempo constante (webhook).
 */

const crypto = require('crypto');
const net = require('net');

/**
 * Hosts EXATOS autorizados por padrão (nome completo, sem curingas e sem subdomínios).
 * - invb-webhook-api.onrender.com: nome documentado em `services/invb-webhook-api/README.md`
 *   para a API de tons na nuvem.
 * Qualquer outro host — inclusive outro subdomínio de onrender.com ou do domínio da igreja
 * — só vale se for cadastrado explicitamente em `INVB_TONS_SYNC_HOSTS`.
 */
const HOSTS_PERMITIDOS_PADRAO = Object.freeze(['invb-webhook-api.onrender.com']);

/**
 * Hosts extras cadastrados em `INVB_TONS_SYNC_HOSTS`: nomes EXATOS separados por vírgula
 * (espaços e caixa são ignorados). Não existe curinga: uma entrada como `*.exemplo.org`
 * é comparada literalmente e nunca coincide com um host real. Só quem administra a
 * máquina define variáveis de ambiente; continua valendo HTTPS e as demais regras.
 */
function hostsExtrasDoAmbiente(env) {
  return String((env && env.INVB_TONS_SYNC_HOSTS) || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function hostPermitido(hostname, env) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return HOSTS_PERMITIDOS_PADRAO.includes(host) || hostsExtrasDoAmbiente(env).includes(host);
}

/**
 * @param {string} bruta valor de `INVB_TONS_SYNC_URL`
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, base: string } | { ok: false, motivo: string }}
 *   `base` sem barra final, pronta para receber `/api/invb/tons-sync`.
 */
function validarUrlNuvemTons(bruta, env = process.env) {
  const texto = String(bruta || '').trim();
  if (!texto) return { ok: false, motivo: 'URL vazia' };
  if (/[?#]/.test(texto)) return { ok: false, motivo: 'não pode ter query nem fragmento' };

  let url;
  try {
    url = new URL(texto);
  } catch (_) {
    return { ok: false, motivo: 'URL malformada' };
  }
  if (url.protocol !== 'https:') return { ok: false, motivo: 'precisa ser HTTPS' };
  if (url.username || url.password) return { ok: false, motivo: 'não pode ter usuário nem senha' };
  if (url.port) return { ok: false, motivo: 'não pode ter porta explícita' };

  const hostname = url.hostname.toLowerCase();
  if (net.isIP(hostname) || hostname.startsWith('[')) {
    return { ok: false, motivo: 'não pode ser um endereço IP' };
  }
  if (!hostPermitido(hostname, env)) {
    return { ok: false, motivo: `host não permitido (${hostname})` };
  }

  const caminho = url.pathname.replace(/\/+$/, '');
  return { ok: true, base: `https://${hostname}${caminho}` };
}

/**
 * Compara dois segredos em tempo constante. Os dois lados passam por SHA-256 antes
 * de `timingSafeEqual`, o que iguala os tamanhos (ele lança erro se forem diferentes)
 * e impede deduzir o comprimento do segredo real pelo tempo de resposta.
 */
function segredosIguais(esperado, recebido) {
  const a = crypto.createHash('sha256').update(String(esperado ?? ''), 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(recebido ?? ''), 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  validarUrlNuvemTons,
  segredosIguais,
  HOSTS_PERMITIDOS_PADRAO,
};
