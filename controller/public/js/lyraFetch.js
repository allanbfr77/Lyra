/**
 * Wrapper único de `fetch` do painel (E1.3 — Fase A).
 *
 * Acrescenta `X-Lyra-Device` e `X-Lyra-Secret` às chamadas que vão para servidores DO LYRA
 * (portas 3001 e 5510 em loopback, rede privada ou nome local) e a nada mais: serviços
 * externos (Internet, CDNs, bancos de letras) nunca recebem a credencial.
 *
 * Por que um wrapper e não editar cada chamada: o painel tem ~100 `fetch` espalhados. Um ponto
 * só, carregado ANTES de `controllerApp.js` e do Histórico, cobre todos e os que vierem.
 *
 * Fase A: o servidor apenas REGISTRA a presença/ausência da credencial; nada é recusado. Se a
 * identidade não puder ser lida, a requisição segue exatamente como era.
 *
 * A identidade é a MESMA do Socket.IO (`socketPainel.js`: localStorage `lyra_device_id` /
 * `lyra_device_secret`). Este módulo não cria uma segunda identidade: usa as mesmas chaves
 * e, só se ainda não existirem, gera o par do mesmo jeito que o socket gera.
 *
 * Script clássico (não módulo): precisa executar antes de qualquer outro e funciona também
 * em Node para teste (CommonJS).
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else {
    raiz.LyraFetch = api;
    try {
      api.instalarFetchLyra(raiz);
    } catch (_) {
      /* o painel funciona sem o wrapper */
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var PORTAS_LYRA = { '3001': true, '5510': true };
  var KEY_ID = 'lyra_device_id';
  var KEY_SECRET = 'lyra_device_secret';

  function ipv4Privado(host) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m) return false;
    var o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (o.some(function (n) { return n > 255; })) return false;
    if (o[0] === 127) return true; // loopback
    if (o[0] === 10) return true; // 10.0.0.0/8
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true; // 172.16.0.0/12
    if (o[0] === 192 && o[1] === 168) return true; // 192.168.0.0/16
    if (o[0] === 169 && o[1] === 254) return true; // link-local
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT (ex.: Tailscale)
    return false;
  }

  function ipv6Local(host) {
    var h = host.replace(/^\[|\]$/g, '').toLowerCase();
    if (h.indexOf(':') < 0) return false;
    if (h === '::1') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // fc00::/7 (ULA)
    if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // fe80::/10 (link-local)
    return false;
  }

  function nomeLocal(host) {
    if (host === 'localhost' || host.slice(-10) === '.localhost') return true;
    if (host.indexOf('.') < 0 && /^[a-z0-9_-]+$/.test(host)) return true; // nome de máquina (NetBIOS)
    return host.slice(-6) === '.local';
  }

  function urlDe(entrada, base) {
    var bruta = '';
    if (typeof entrada === 'string') bruta = entrada;
    else if (entrada && typeof entrada.href === 'string') bruta = entrada.href; // URL
    else if (entrada && typeof entrada.url === 'string') bruta = entrada.url; // Request
    if (!bruta) return null;
    try {
      return base ? new URL(bruta, base) : new URL(bruta);
    } catch (_) {
      return null;
    }
  }

  /**
   * É um servidor do Lyra? Só `http:`, porta 3001 ou 5510 e host de loopback, rede privada,
   * nome local — ou o mesmo host da página do painel.
   * @param {string|URL|Request} entrada
   * @param {{ hostDaPagina?: string, base?: string }} [opcoes]
   */
  function ehDestinoLyra(entrada, opcoes) {
    var url = urlDe(entrada, opcoes && opcoes.base);
    if (!url || url.protocol !== 'http:') return false;
    if (url.username || url.password) return false;
    if (!PORTAS_LYRA[url.port]) return false;
    var host = url.hostname.toLowerCase();
    if (host.slice(-1) === '.') host = host.slice(0, -1);
    var daPagina = opcoes && opcoes.hostDaPagina ? String(opcoes.hostDaPagina).toLowerCase() : '';
    return ipv4Privado(host) || ipv6Local(host) || nomeLocal(host) || (!!daPagina && host === daPagina);
  }

  function identidadeCompleta(id) {
    return !!(id && typeof id.deviceId === 'string' && id.deviceId && typeof id.secret === 'string' && id.secret);
  }

  /**
   * @param {object} opcoes
   * @param {Function} opcoes.fetchOriginal
   * @param {() => ({deviceId?: string, secret?: string}|null|Promise<any>)} opcoes.obterIdentidade
   * @param {string} [opcoes.hostDaPagina]
   * @param {string} [opcoes.base] URL da página (resolve chamadas relativas)
   * @param {() => (string|null)} [opcoes.obterSessao] token de sessão do controlador (Entrega 1): vai em
   *        `X-Lyra-Session`, SÓ junto da credencial do dispositivo e SÓ para servidores do Lyra. Não
   *        autentica ninguém: apenas diz ao Servidor de qual socket a chamada veio.
   */
  function criarFetchLyra(opcoes) {
    var fetchOriginal = opcoes.fetchOriginal;
    var obterIdentidade = opcoes.obterIdentidade;
    var obterSessao = typeof opcoes.obterSessao === 'function' ? opcoes.obterSessao : null;
    var criterio = { hostDaPagina: opcoes.hostDaPagina, base: opcoes.base };

    return async function fetchLyra(input, init) {
      var cabecalhos = null;
      try {
        if (ehDestinoLyra(input, criterio)) {
          var id = await obterIdentidade();
          if (identidadeCompleta(id)) {
            var fonte = typeof Request !== 'undefined' && input instanceof Request && !(init && init.headers) ? input.headers : init && init.headers;
            var h = new Headers(fonte);
            if (!h.has('X-Lyra-Device')) h.set('X-Lyra-Device', id.deviceId);
            if (!h.has('X-Lyra-Secret')) h.set('X-Lyra-Secret', id.secret);
            if (obterSessao && !h.has('X-Lyra-Session')) {
              try {
                var sessao = obterSessao();
                if (typeof sessao === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(sessao)) h.set('X-Lyra-Session', sessao);
              } catch (_) { /* sem sessão: segue só com a credencial do dispositivo */ }
            }
            cabecalhos = h;
          }
        }
      } catch (_) {
        cabecalhos = null; // qualquer falha: a chamada segue como estava
      }
      if (!cabecalhos) return fetchOriginal(input, init);
      if (typeof Request !== 'undefined' && input instanceof Request) {
        return fetchOriginal(new Request(input, Object.assign({}, init, { headers: cabecalhos })));
      }
      return fetchOriginal(input, Object.assign({}, init, { headers: cabecalhos }));
    };
  }

  function uuid(alvo) {
    if (alvo.crypto && typeof alvo.crypto.randomUUID === 'function') return alvo.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /** Mesmas chaves e mesma regra de `obterIdentidadeDispositivoLocal` (socketPainel.js). */
  function lerIdentidade(alvo) {
    var ls = alvo.localStorage;
    var deviceId = ls.getItem(KEY_ID);
    var secret = ls.getItem(KEY_SECRET);
    if (!deviceId || !secret) {
      deviceId = deviceId || uuid(alvo);
      secret = secret || uuid(alvo);
      ls.setItem(KEY_ID, deviceId);
      ls.setItem(KEY_SECRET, secret);
    }
    return { deviceId: deviceId, secret: secret };
  }

  /** Troca `alvo.fetch` (normalmente `window`) pelo wrapper. Idempotente. */
  function instalarFetchLyra(alvo) {
    if (!alvo || typeof alvo.fetch !== 'function' || alvo.fetch.__lyraFetch) return;
    var original = alvo.fetch.bind(alvo);
    var envolvido = criarFetchLyra({
      fetchOriginal: original,
      hostDaPagina: alvo.location && alvo.location.hostname,
      base: alvo.location && alvo.location.href,
      obterIdentidade: function () {
        try {
          return lerIdentidade(alvo);
        } catch (_) {
          return null; // localStorage bloqueado: segue sem credencial
        }
      },
      obterSessao: function () {
        var s = alvo.__lyraSessaoControlador;
        return s && typeof s.token === 'string' && (!s.expiraEm || s.expiraEm > Date.now()) ? s.token : null;
      },
    });
    envolvido.__lyraFetch = true;
    alvo.fetch = envolvido;
  }

  return { criarFetchLyra: criarFetchLyra, ehDestinoLyra: ehDestinoLyra, instalarFetchLyra: instalarFetchLyra };
});
