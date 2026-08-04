'use strict';

/**
 * Porta de projeção — o único caminho por onde o painel do Controlador fala com o
 * motor que desenha nas telas.
 *
 * Hoje há um transporte só: o Socket.IO para o Servidor (:5510). A porta existe para
 * que o segundo transporte — o motor em processo, no modo «projetar nesta máquina» —
 * entre sem tocar em nenhum call site. É a porta antes da casa.
 *
 * ## O vocabulário não muda
 *
 * `enviar('exibir_musica', payload)` usa exactamente o nome e o formato do evento de
 * socket de hoje. Isso não é preguiça: OBS (`/obs`, `/obs/biblia`, `/obs/slides`) e o
 * app de celular são clientes Socket.IO da mesma porta 5510 e falam esse vocabulário.
 * Inventar nomes novos aqui obrigaria a traduzir de volta na fronteira da rede — duas
 * gramáticas para a mesma coisa, divergindo com o tempo.
 *
 * ## `pronta()` é predicado, não detalhe de transporte
 *
 * Boa parte do núcleo usava `socket && socket.connected` com dois sentidos misturados:
 * «o socket está aberto» e «há projeção alcançável». O segundo é regra de negócio e
 * sobrevive à troca de transporte — com o motor local, há projeção alcançável e socket
 * nenhum. `pronta()` responde à pergunta de negócio; quem responde é o transporte.
 *
 * ## O que a porta NÃO carrega
 *
 * Registro do controlador, bastão (write-lock), heartbeat, allowlist e sincronização de
 * banco continuam em `socket.emit`/`socket.on` crus. Não são projeção — são negócio do
 * Servidor, e no modo local simplesmente não existem. Misturá-los aqui faria a porta
 * arrastar o Servidor consigo, que é precisamente o que esta refatoração desfaz.
 */

/**
 * @typedef {object} TransporteProjecao
 * @property {() => boolean} pronto Há caminho utilizável para o motor agora?
 * @property {(evento: string, dados: any, ack?: Function) => boolean} enviar
 *   Entrega o comando. Devolve `false` se não houve entrega — o call site decide o
 *   fallback (hoje, HTTP). Nunca lança.
 * @property {(evento: string, dados: any) => void} enfileirar
 *   Entrega sem exigir ligação viva; o transporte decide o que fazer.
 * @property {(evento: string, handler: Function) => void} inscrever
 * @property {(evento: string, handler: Function) => void} desinscrever
 */

/**
 * @param {TransporteProjecao|null} [transporteInicial]
 */
export function criarPortaProjecao(transporteInicial = null) {
  /** @type {TransporteProjecao|null} */
  let transporte = transporteInicial;

  /**
   * Handlers do canal de retorno, guardados na porta e não no transporte.
   *
   * O socket do Controlador é recriado a cada `iniciarSocket(ip)` — e o código antigo
   * tinha de repetir `socket.off(...)` + `socket.on(...)` a cada reconexão, uma linha
   * por evento, que é como se esquece um. Guardando aqui, `usarTransporte()` reinscreve
   * tudo sozinho.
   *
   * @type {Map<string, Set<Function>>}
   */
  const inscricoes = new Map();

  function paraCadaInscricao(fn) {
    for (const [evento, handlers] of inscricoes) {
      for (const handler of handlers) fn(evento, handler);
    }
  }

  /**
   * Troca o transporte, movendo as inscrições existentes para o novo.
   *
   * @param {TransporteProjecao|null} novo
   */
  function usarTransporte(novo) {
    if (transporte === novo) return;
    const anterior = transporte;
    if (anterior) {
      paraCadaInscricao((evento, handler) => {
        try {
          anterior.desinscrever(evento, handler);
        } catch (_) {
          // intencional — um transporte a ser descartado não deve impedir a troca
        }
      });
    }
    transporte = novo;
    if (novo) {
      paraCadaInscricao((evento, handler) => novo.inscrever(evento, handler));
    }
  }

  /**
   * Há transporte acoplado — ainda que a ligação esteja caída neste instante?
   *
   * Traduz o antigo `if (!socket) return`, que no núcleo guardava blocos inteiros
   * («ainda nem tentámos ligar; não mexer em nada»), e não o `socket.connected`.
   * Distinção com `pronta()`: `ligada()` é «existe destino», `pronta()` é «o destino
   * atende agora».
   */
  function ligada() {
    return !!transporte;
  }

  /** Há projeção alcançável agora? */
  function pronta() {
    if (!transporte) return false;
    try {
      return !!transporte.pronto();
    } catch (_) {
      return false;
    }
  }

  /**
   * Envia um comando ao motor de projeção.
   *
   * Absorve a guarda e o `try/catch` que estavam repetidos em cada call site. O valor
   * de retorno preserva a forma antiga `if (ligado) { emit } else { fetch }`: `false`
   * significa «não entregue», e o chamador segue para o seu fallback HTTP.
   *
   * @param {string} evento
   * @param {any} [dados]
   * @param {Function} [ack] Callback de confirmação (só o transporte socket o honra hoje).
   * @returns {boolean} `true` se o comando foi entregue ao transporte.
   */
  function enviar(evento, dados, ack) {
    if (!pronta()) return false;
    try {
      return !!transporte.enviar(evento, dados, ack);
    } catch (_) {
      // O motor de projeção a falhar não pode derrubar o painel do operador.
      return false;
    }
  }

  /**
   * Envia sem exigir ligação viva.
   *
   * Não é um capricho de API: o núcleo já tinha, de facto, duas famílias de call site.
   * Uns testavam `socket && socket.connected` e caíam num POST HTTP quando desligados;
   * outros testavam só `if (!socket) return` e deixavam o `emit` seguir — e o cliente
   * Socket.IO bufferiza esse pacote e entrega-o na reconexão. `limpar_tela` e
   * `toggle_blackout` são desta segunda família.
   *
   * Manter a distinção é o que torna esta peça inerte. Se ela devesse existir é outra
   * conversa: um `limpar_tela` bufferizado chega às telas minutos depois, possivelmente
   * já com outro operador no bastão. Unificar as duas famílias é decisão de projeto,
   * não efeito colateral de uma extração.
   *
   * @param {string} evento
   * @param {any} [dados]
   */
  function enfileirar(evento, dados) {
    if (!transporte) return;
    try {
      transporte.enfileirar(evento, dados);
    } catch (_) {
      // intencional — ver `enviar`
    }
  }

  /**
   * Assina um evento do canal de retorno (estado das telas, config aplicada, áudio).
   *
   * Idempotente por (evento, handler): reassinar o mesmo par não duplica a entrega —
   * o núcleo chama isto uma vez por reconexão.
   *
   * @param {string} evento
   * @param {Function} handler
   * @returns {() => void} Cancela a inscrição.
   */
  function aoReceber(evento, handler) {
    if (typeof handler !== 'function') return () => {};
    let handlers = inscricoes.get(evento);
    if (!handlers) {
      handlers = new Set();
      inscricoes.set(evento, handlers);
    }
    if (!handlers.has(handler)) {
      handlers.add(handler);
      if (transporte) transporte.inscrever(evento, handler);
    }
    return () => {
      const atuais = inscricoes.get(evento);
      if (!atuais || !atuais.has(handler)) return;
      atuais.delete(handler);
      if (atuais.size === 0) inscricoes.delete(evento);
      if (transporte) {
        try {
          transporte.desinscrever(evento, handler);
        } catch (_) {
          // intencional
        }
      }
    };
  }

  return { enviar, enfileirar, aoReceber, ligada, pronta, usarTransporte };
}

/**
 * Transporte remoto: o motor vive noutro processo, atrás do Servidor, e falamos com ele
 * por Socket.IO.
 *
 * Prende-se a **uma instância** de socket, não à variável `socket` do núcleo. É a
 * diferença entre um transporte correcto e um que desliga o socket errado:
 * `iniciarSocket()` recria a instância a cada ligação, e `usarTransporte()` desinscreve
 * do transporte anterior antes de inscrever no novo. Se ambos lessem a mesma variável
 * global, essa limpeza cairia sobre o socket recém-criado e o canal de retorno morria
 * em silêncio na primeira reconexão. Cada ligação cria o seu transporte.
 *
 * @param {any} socket Instância devolvida por `io(...)`.
 * @returns {TransporteProjecao}
 */
export function criarTransporteSocket(socket) {
  return {
    pronto() {
      return !!(socket && socket.connected);
    },
    enviar(evento, dados, ack) {
      if (!socket || !socket.connected) return false;
      // `emit(evento)` e `emit(evento, undefined)` não são o mesmo pacote na rede.
      // Os comandos sem payload (`limpar_tela`, `toggle_blackout`, `encerrar_projecao`)
      // sempre foram emitidos sem argumento — manter assim preserva o fingerprint.
      if (typeof ack === 'function') socket.emit(evento, dados, ack);
      else if (dados === undefined) socket.emit(evento);
      else socket.emit(evento, dados);
      return true;
    },
    enfileirar(evento, dados) {
      // Sem `connected`: é o próprio cliente Socket.IO que bufferiza e entrega na
      // reconexão. Preserva o comportamento dos call sites que só testavam `if (!socket)`.
      if (!socket) return;
      if (dados === undefined) socket.emit(evento);
      else socket.emit(evento, dados);
    },
    inscrever(evento, handler) {
      if (socket) socket.on(evento, handler);
    },
    desinscrever(evento, handler) {
      if (socket) socket.off(evento, handler);
    },
  };
}

/**
 * Transporte local: o motor de projeção corre neste mesmo aplicativo, no processo
 * principal, e falamos com ele por IPC em vez de rede.
 *
 * ## Mesmo vocabulário, outro meio
 *
 * `enviar('exibir_musica', payload)` leva exactamente o payload que iria pelo socket. Não
 * é conveniência: no modo local o Controlador continua a hospedar a porta 5510 para o OBS
 * e o app de celular, e o que o motor recebe do painel tem de ser indistinguível do que
 * recebe da rede. Duas gramáticas obrigariam a traduzir numa das pontas.
 *
 * ## Porque `enviar` devolve `true` sem esperar
 *
 * A ponte IPC é assíncrona; a porta é síncrona. Devolver `true` significa «entregue ao
 * processo principal», que é a mesma promessa que o transporte socket faz — o `emit`
 * também não espera pelo servidor. Quem precisa de saber o resultado usa o `ack`, que é
 * resolvido quando o processo principal responde.
 *
 * O fallback HTTP dos call sites nunca corre neste transporte: não há rede a falhar
 * entre o painel e um motor que vive no mesmo processo.
 *
 * @param {{
 *   enviar: (evento: string, dados: any) => Promise<any>,
 *   aoReceber: (handler: (evento: string, dados: any) => void) => (() => void),
 *   pronta?: () => boolean
 * }} ponte Exposta pelo preload do Controlador.
 * @returns {TransporteProjecao}
 */
export function criarTransporteLocal(ponte) {
  /**
   * A ponte entrega um canal só, com `(evento, dados)`. A porta assina por evento. Este
   * mapa é o desmultiplexador entre os dois — e a razão de assinarmos a ponte uma vez, e
   * não uma vez por evento.
   *
   * @type {Map<string, Set<Function>>}
   */
  const porEvento = new Map();
  let cancelarPonte = null;

  function garantirLigacaoAPonte() {
    if (cancelarPonte) return;
    cancelarPonte = ponte.aoReceber((evento, dados) => {
      for (const handler of porEvento.get(evento) || []) {
        try {
          handler(dados);
        } catch (_) {
          // Um handler do painel a falhar não pode impedir os outros de receber.
        }
      }
    });
  }

  return {
    pronto() {
      return typeof ponte.pronta === 'function' ? !!ponte.pronta() : true;
    },
    enviar(evento, dados, ack) {
      const promessa = ponte.enviar(evento, dados);
      if (typeof ack === 'function') {
        Promise.resolve(promessa).then(
          (r) => ack(r || { ok: true }),
          (e) => ack({ ok: false, erro: e?.message || String(e) })
        );
      } else {
        Promise.resolve(promessa).catch(() => {
          // Sem ack não há a quem contar; o processo principal já registou o erro.
        });
      }
      return true;
    },
    enfileirar(evento, dados) {
      Promise.resolve(ponte.enviar(evento, dados)).catch(() => {
        // idem
      });
    },
    inscrever(evento, handler) {
      garantirLigacaoAPonte();
      if (!porEvento.has(evento)) porEvento.set(evento, new Set());
      porEvento.get(evento).add(handler);
    },
    desinscrever(evento, handler) {
      const handlers = porEvento.get(evento);
      if (!handlers) return;
      handlers.delete(handler);
      if (handlers.size > 0) return;
      porEvento.delete(evento);
      if (porEvento.size === 0 && cancelarPonte) {
        cancelarPonte();
        cancelarPonte = null;
      }
    },
  };
}
