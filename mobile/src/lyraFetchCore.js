/**
 * Núcleo (puro, sem React Native) do wrapper de `fetch` do app (E1.3 — Fase A).
 *
 * Acrescenta `X-Lyra-Device`, `X-Lyra-Secret` e `X-Lyra-App` (versão) às chamadas que vão
 * para servidores DO LYRA — portas 3001 e 5510 em loopback, rede privada ou nome local — e a
 * nada mais. O app também fala com a Internet (banco de letras, compartilhamento em nuvem,
 * busca de letras): esses destinos nunca recebem a credencial.
 *
 * Sem `new URL`: o parser de URL do Hermes/React Native não é confiável em todas as
 * versões, então o destino é analisado à mão, com regras estritas (só `http:`, porta
 * explícita, sem `usuario@`).
 *
 * Fase A: o servidor só REGISTRA a presença da credencial; nada é recusado. Se a identidade
 * não puder ser lida, a chamada segue como sempre foi.
 */

const PORTAS_LYRA = new Set(['3001', '5510']);

function ipv4Privado(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (o.some((n) => n > 255)) return false;
  if (o[0] === 127 || o[0] === 10) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 169 && o[1] === 254) return true;
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT (ex.: Tailscale)
  return false;
}

function ipv6Local(host) {
  if (!host.startsWith('[') || !host.endsWith(']')) return false;
  const h = host.slice(1, -1).toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::1') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;
  return false;
}

function nomeLocal(host) {
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (!host.includes('.') && /^[a-z0-9_-]+$/.test(host)) return true;
  return host.endsWith('.local');
}

/** @returns {{host: string, porta: string}|null} só para `http://host:porta/...` sem usuário. */
function analisar(url) {
  if (typeof url !== 'string') return null;
  const m = /^http:\/\/([^/?#]+)/i.exec(url.trim());
  if (!m) return null;
  const autoridade = m[1];
  if (autoridade.includes('@') || /\s/.test(autoridade)) return null;
  const p = /^(\[[0-9a-fA-F:.]+\]|[^:[\]]+):(\d{1,5})$/.exec(autoridade);
  if (!p) return null; // sem porta explícita não é o Lyra
  return { host: p[1].toLowerCase().replace(/\.$/, ''), porta: p[2] };
}

/**
 * @param {unknown} url
 * @returns {boolean} true só para servidores do Lyra (http, porta 3001/5510, host local/privado)
 */
export function ehDestinoLyra(url) {
  const a = analisar(url);
  if (!a || !PORTAS_LYRA.has(a.porta)) return false;
  return ipv4Privado(a.host) || ipv6Local(a.host) || nomeLocal(a.host);
}

function urlDe(entrada) {
  if (typeof entrada === 'string') return entrada;
  if (entrada && typeof entrada.url === 'string') return entrada.url; // Request
  if (entrada && typeof entrada.href === 'string') return entrada.href; // URL
  return '';
}

function versaoSaneada(v) {
  return String(v || '').replace(/[^\w.-]/g, '').slice(0, 24);
}

/**
 * @param {object} opcoes
 * @param {Function} opcoes.fetchOriginal
 * @param {() => Promise<{deviceId?: string, secret?: string}|null>} opcoes.obterIdentidade
 * @param {string} [opcoes.versaoApp]
 */
export function criarFetchLyra({ fetchOriginal, obterIdentidade, versaoApp }) {
  const versao = versaoSaneada(versaoApp);

  return async function fetchLyra(input, init) {
    let cabecalhos = null;
    try {
      if (ehDestinoLyra(urlDe(input))) {
        const h = new Headers(init && init.headers);
        let id = null;
        try {
          id = await obterIdentidade();
        } catch (_) {
          id = null; // AsyncStorage indisponível: segue sem credencial
        }
        if (id && id.deviceId && id.secret) {
          if (!h.has('X-Lyra-Device')) h.set('X-Lyra-Device', String(id.deviceId));
          if (!h.has('X-Lyra-Secret')) h.set('X-Lyra-Secret', String(id.secret));
        }
        if (versao && !h.has('X-Lyra-App')) h.set('X-Lyra-App', versao);
        cabecalhos = h;
      }
    } catch (_) {
      cabecalhos = null; // qualquer falha: a chamada segue como estava
    }
    if (!cabecalhos) return fetchOriginal(input, init);
    return fetchOriginal(input, { ...(init || {}), headers: cabecalhos });
  };
}
