import test from 'node:test';
import assert from 'node:assert/strict';
import { criarPortaProjecao, criarTransporteSocket } from './projecaoPorta.js';

/**
 * Duplo do cliente Socket.IO, com a distinção que interessa aqui: `emit` funciona
 * ligado ou desligado (o cliente real bufferiza), e o teste regista tudo para se poder
 * afirmar sobre o que foi para a rede.
 */
function socketFalso({ connected = true } = {}) {
  const enviados = [];
  const handlers = new Map();
  return {
    connected,
    enviados,
    handlers,
    emit(evento, ...args) {
      enviados.push({ evento, args });
    },
    on(evento, handler) {
      if (!handlers.has(evento)) handlers.set(evento, new Set());
      handlers.get(evento).add(handler);
    },
    off(evento, handler) {
      handlers.get(evento)?.delete(handler);
    },
    receber(evento, dados) {
      for (const h of handlers.get(evento) || []) h(dados);
    },
  };
}

test('sem transporte, nada é enviado e a porta não está pronta', () => {
  const porta = criarPortaProjecao();
  assert.equal(porta.ligada(), false);
  assert.equal(porta.pronta(), false);
  assert.equal(porta.enviar('limpar_tela'), false);
});

test('enviar entrega só com ligação viva; devolve false para o call site cair no fallback', () => {
  const s = socketFalso({ connected: false });
  const porta = criarPortaProjecao(criarTransporteSocket(s));

  assert.equal(porta.ligada(), true, 'há destino…');
  assert.equal(porta.pronta(), false, '…mas não atende');
  assert.equal(porta.enviar('preview_display_config', { a: 1 }), false);
  assert.deepEqual(s.enviados, [], 'nada foi para a rede — o call site fará o POST');

  s.connected = true;
  assert.equal(porta.enviar('preview_display_config', { a: 1 }), true);
  assert.deepEqual(s.enviados, [{ evento: 'preview_display_config', args: [{ a: 1 }] }]);
});

test('comando sem payload não emite um argumento undefined', () => {
  // `emit('limpar_tela')` e `emit('limpar_tela', undefined)` são pacotes diferentes.
  const s = socketFalso();
  const porta = criarPortaProjecao(criarTransporteSocket(s));
  porta.enviar('limpar_tela');
  assert.deepEqual(s.enviados, [{ evento: 'limpar_tela', args: [] }]);
});

test('enfileirar entrega mesmo desligado — o cliente Socket.IO é que bufferiza', () => {
  const s = socketFalso({ connected: false });
  const porta = criarPortaProjecao(criarTransporteSocket(s));
  porta.enfileirar('toggle_blackout');
  assert.deepEqual(s.enviados, [{ evento: 'toggle_blackout', args: [] }]);
});

test('o ack chega ao emit como terceiro argumento', () => {
  const s = socketFalso();
  const porta = criarPortaProjecao(criarTransporteSocket(s));
  const ack = () => {};
  porta.enviar('set_display_config', { modoConfig: 'slides' }, ack);
  assert.deepEqual(s.enviados[0].args, [{ modoConfig: 'slides' }, ack]);
});

test('aoReceber é idempotente por (evento, handler)', () => {
  // iniciarSocket() corre a cada religação e reinscreve os mesmos handlers nomeados.
  // Se duplicasse, o painel reagiria N vezes ao mesmo `estado`.
  const s = socketFalso();
  const porta = criarPortaProjecao(criarTransporteSocket(s));
  let chamadas = 0;
  const handler = () => {
    chamadas += 1;
  };

  porta.aoReceber('estado', handler);
  porta.aoReceber('estado', handler);
  porta.aoReceber('estado', handler);
  s.receber('estado', { tipo: 'musica' });

  assert.equal(chamadas, 1);
});

test('trocar de transporte remove do antigo e reinscreve no novo', () => {
  const antigo = socketFalso();
  const novo = socketFalso();
  const porta = criarPortaProjecao(criarTransporteSocket(antigo));
  const recebidos = [];
  porta.aoReceber('estado', (e) => recebidos.push(e));

  porta.usarTransporte(criarTransporteSocket(novo));

  antigo.receber('estado', 'do antigo');
  novo.receber('estado', 'do novo');

  assert.deepEqual(recebidos, ['do novo'], 'o socket antigo já não alimenta o painel');
});

test('o transporte prende-se a uma instância — reinscrever não desliga o socket novo', () => {
  // Regressão do erro que um transporte com getter partilhado (`() => socket`) causaria:
  // ao desinscrever do transporte "antigo", o getter já devolveria o socket NOVO e a
  // limpeza apagaria a inscrição acabada de criar. O canal de retorno morreria em
  // silêncio na primeira reconexão — sem erro, sem log, só um painel congelado.
  const s1 = socketFalso();
  const porta = criarPortaProjecao(criarTransporteSocket(s1));
  const recebidos = [];
  porta.aoReceber('estado', (e) => recebidos.push(e));

  const s2 = socketFalso();
  porta.usarTransporte(criarTransporteSocket(s2));
  s2.receber('estado', 'primeira reconexão');

  const s3 = socketFalso();
  porta.usarTransporte(criarTransporteSocket(s3));
  s3.receber('estado', 'segunda reconexão');

  assert.deepEqual(recebidos, ['primeira reconexão', 'segunda reconexão']);
});

test('cancelar a inscrição para de entregar', () => {
  const s = socketFalso();
  const porta = criarPortaProjecao(criarTransporteSocket(s));
  const recebidos = [];
  const cancelar = porta.aoReceber('audio_state', (st) => recebidos.push(st));

  s.receber('audio_state', { playing: true });
  cancelar();
  s.receber('audio_state', { playing: false });

  assert.deepEqual(recebidos, [{ playing: true }]);
});

test('um transporte que lança não derruba o painel', () => {
  const porta = criarPortaProjecao({
    pronto: () => true,
    enviar() {
      throw new Error('socket em estado inconsistente');
    },
    enfileirar() {
      throw new Error('idem');
    },
    inscrever() {},
    desinscrever() {},
  });

  assert.equal(porta.enviar('exibir_musica', {}), false);
  assert.doesNotThrow(() => porta.enfileirar('limpar_tela'));
});
