'use strict';

/**
 * Prova de PROPRIEDADE de uma porta local (E1.3 Fase B, arquitetura W).
 *
 * Pergunta: o que responde em `127.0.0.1:<porta>` é o servidor HTTP que ESTE processo iniciou?
 *
 * O que NÃO prova: IP de loopback, `localhost`, o número da porta ou «mesmo computador». Um
 * Servidor separado (outro app, outro processo) pode estar no mesmo PC e na mesma porta, e no
 * Windows um bind em endereço específico (127.0.0.1) pode coexistir com um em `0.0.0.0` e ficar
 * com o tráfego de loopback.
 *
 * O que prova: o processo abre uma conexão TCP a `127.0.0.1:<porta>` e confere se o PRÓPRIO objeto
 * `http.Server` que possui emitiu `connection` para esse mesmo par (porta de origem do cliente =
 * `remotePort` do socket recebido). Só o dono do socket de escuta recebe o evento; nenhum outro
 * processo consegue fazê-lo ocorrer no nosso objeto, e nada precisa ser respondido nem enviado
 * (nenhuma rota, nenhum segredo, nenhum byte HTTP).
 *
 * Validade: o resultado é guardado por TTL curto e AMARRADO ao objeto servidor — outro objeto
 * (reinício do motor) ou nenhum objeto (motor parado) invalida na hora. Qualquer erro, timeout ou
 * dúvida resulta em `false` (falha fechada).
 */

const net = require('net');

/**
 * @param {object} p
 * @param {() => (import('http').Server|null|undefined)} p.obterServidor servidor que o processo possui agora
 * @param {number} p.porta
 * @param {number} [p.ttlMs=1000]
 * @param {number} [p.timeoutMs=300]
 * @param {() => number} [p.agora]
 * @param {(opcoes: object) => import('net').Socket} [p.conectar] só para teste
 */
function criarProvaPropriedade({ obterServidor, porta, ttlMs = 1000, timeoutMs = 300, agora = Date.now, conectar = net.connect }) {
  /** { servidor, ok, ate } */
  let cache = null;
  /** { servidor, promessa } — sonda em andamento (compartilhada) */
  let voo = null;

  function sondar(servidor) {
    return new Promise((resolve) => {
      let cliente = null;
      let timer = null;
      let encerrado = false;
      let portaCliente = null;
      const vistas = new Set();

      const concluir = (ok) => {
        if (encerrado) return;
        encerrado = true;
        clearTimeout(timer);
        try { servidor.removeListener('connection', aoReceber); } catch (_) { /* ignora */ }
        try { if (cliente) cliente.destroy(); } catch (_) { /* ignora */ }
        resolve(ok);
      };
      const conferir = () => {
        if (portaCliente !== null && vistas.has(portaCliente)) concluir(true);
      };
      function aoReceber(socket) {
        const origem = String(socket.remoteAddress || '').replace(/^::ffff:/, '');
        if (origem === '127.0.0.1' || origem === '::1') {
          vistas.add(socket.remotePort);
          conferir();
        }
      }

      try {
        servidor.on('connection', aoReceber);
        timer = setTimeout(() => concluir(false), timeoutMs);
        cliente = conectar({ host: '127.0.0.1', port: porta });
        cliente.on('error', () => concluir(false));
        cliente.on('connect', () => {
          portaCliente = cliente.localPort;
          conferir();
        });
      } catch (_) {
        concluir(false);
      }
    });
  }

  async function provar() {
    let servidor = null;
    try {
      servidor = obterServidor();
    } catch (_) {
      return false;
    }
    if (!servidor || servidor.listening !== true) return false;
    let addr = null;
    try { addr = servidor.address(); } catch (_) { return false; }
    if (!addr || typeof addr !== 'object' || addr.port !== porta) return false;

    if (cache && cache.servidor === servidor && agora() < cache.ate) return cache.ok;
    if (voo && voo.servidor === servidor) return voo.promessa;

    const promessa = sondar(servidor).then((ok) => {
      cache = { servidor, ok, ate: agora() + ttlMs };
      if (voo && voo.promessa === promessa) voo = null;
      return ok;
    });
    voo = { servidor, promessa };
    return promessa;
  }

  function invalidar() {
    cache = null;
  }

  return Object.freeze({ provar, invalidar });
}

module.exports = { criarProvaPropriedade };
