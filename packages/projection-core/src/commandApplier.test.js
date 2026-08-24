'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  criarAplicadorDeComandos,
  estadoBibliaParaObs,
  ALCANCE_TODOS,
} = require('./commandApplier');
const projectionPayloads = require('./projectionPayloads');

/**
 * Motor falso que regista a sequência de chamadas.
 *
 * A ordem importa tanto quanto o resultado: `render()` antes de
 * `aplicarDisplayConfigNasJanelas()` é o que evita um frame com a config anterior. Um
 * teste que só olhasse para o estado final não veria a inversão.
 */
function motorFalso() {
  const chamadas = [];
  return {
    chamadas,
    render(arg) {
      chamadas.push(['render', arg]);
      return { estadoPublico: { marcador: 'render', tipo: arg?.estado?.tipo ?? null } };
    },
    atualizarDisplays(e) {
      chamadas.push(['atualizarDisplays', e]);
    },
    atualizarDisplayMinistrante(e) {
      chamadas.push(['atualizarDisplayMinistrante', e]);
    },
    aplicarDisplayConfigNasJanelas(opts) {
      chamadas.push(['aplicarDisplayConfigNasJanelas', opts]);
    },
    estadoPublicoParaSocketsOuApi() {
      chamadas.push(['estadoPublicoParaSocketsOuApi']);
      return { marcador: 'estadoPublicoParaSocketsOuApi' };
    },
    garantirTelasAbertasParaProjecao() {
      chamadas.push(['garantirTelasAbertasParaProjecao']);
    },
    snapshotMinistranteAtual() {
      chamadas.push(['snapshotMinistranteAtual']);
      return { titulo: 'do snapshot', atual: 'atual snap', proximo: 'prox snap', telaLimpa: false };
    },
    sincronizarJanelasRelogio() {
      chamadas.push(['sincronizarJanelasRelogio']);
    },
    enviarComandoAudioParaControle(comando, dados) {
      chamadas.push(['enviarComandoAudioParaControle', comando, dados]);
    },
    enviarSyncVideoApresentacaoParaDisplays(sync) {
      chamadas.push(['enviarSyncVideoApresentacaoParaDisplays', sync]);
    },
  };
}

function estadoFalso(inicial = {}) {
  return {
    estadoAtual: projectionPayloads.estadoPublicoOcioso(),
    estadoMinistrante: { titulo: '', atual: '', proximo: '', telaLimpa: true },
    estadoPublicoOverride: null,
    ministranteApresentacaoOverride: null,
    projecaoLiveAtiva: false,
    ...inicial,
  };
}

function musicaProjetada() {
  return {
    ...projectionPayloads.estadoPublicoOcioso(),
    tipo: 'musica',
    titulo: 'Santo',
    linhas: ['linha 1'],
    telaLimpa: false,
  };
}

function versiculoProjetado() {
  return {
    ...projectionPayloads.estadoPublicoOcioso(),
    tipo: 'biblia',
    titulo: 'João 3:16',
    livro: 'João',
    capitulo: '3',
    versiculo: '16',
    linhas: ['Porque Deus amou o mundo'],
    telaLimpa: false,
  };
}

test('o aplicador rejeita motor ou estado inválidos', () => {
  assert.throws(() => criarAplicadorDeComandos({ state: null, engine: motorFalso() }), TypeError);
  assert.throws(() => criarAplicadorDeComandos({ state: estadoFalso(), engine: {} }), TypeError);
});

test('comando desconhecido falha alto, em vez de não fazer nada em silêncio', () => {
  const aplicador = criarAplicadorDeComandos({ state: estadoFalso(), engine: motorFalso() });
  // `registrar_controlador` é do Servidor e nunca deve ser aceite aqui.
  assert.equal(aplicador.suporta('registrar_controlador'), false);
  assert.throws(() => aplicador.aplicar('registrar_controlador', {}), /desconhecido/);
  assert.equal(aplicador.suporta('exibir_musica'), true);
});

test('limpar_tela apaga a camada de slides e preserva a Bíblia', () => {
  const state = estadoFalso({ estadoAtual: versiculoProjetado(), projecaoLiveAtiva: true });
  const engine = motorFalso();
  const aplicador = criarAplicadorDeComandos({ state, engine });

  aplicador.aplicar('limpar_tela');

  assert.equal(state.projecaoLiveAtiva, false);
  assert.equal(state.estadoAtual.tipo, 'biblia', 'limpar_tela não derruba o versículo');
});

test('limpar_tela renderiza antes de reaplicar a config das janelas', () => {
  const state = estadoFalso({ estadoAtual: musicaProjetada() });
  const engine = motorFalso();
  criarAplicadorDeComandos({ state, engine }).aplicar('limpar_tela');

  assert.deepEqual(
    engine.chamadas.map((c) => c[0]),
    ['render', 'aplicarDisplayConfigNasJanelas']
  );
  assert.deepEqual(engine.chamadas[1][1], { forcarModo: 'slides' });
});

test('limpar_tela difunde estado e estado_biblia_obs, nesta ordem, a todos', () => {
  const state = estadoFalso({ estadoAtual: musicaProjetada() });
  const { eventos } = criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar(
    'limpar_tela'
  );

  assert.deepEqual(
    eventos.map((e) => [e.nome, e.alcance]),
    [
      ['estado', ALCANCE_TODOS],
      ['estado_biblia_obs', ALCANCE_TODOS],
    ]
  );
  assert.equal(eventos[0].dados.marcador, 'render');
});

test('encerrar_projecao_biblia apaga o versículo e força o modo bíblia nas janelas', () => {
  const state = estadoFalso({ estadoAtual: versiculoProjetado() });
  const engine = motorFalso();
  criarAplicadorDeComandos({ state, engine }).aplicar('encerrar_projecao_biblia');

  assert.equal(state.estadoAtual.tipo, null);
  assert.deepEqual(engine.chamadas.at(-1), ['aplicarDisplayConfigNasJanelas', { forcarModo: 'biblia' }]);
});

test('encerrar_projecao zera todas as camadas', () => {
  const state = estadoFalso({
    estadoAtual: musicaProjetada(),
    estadoPublicoOverride: { tipo: 'apresentacao' },
    ministranteApresentacaoOverride: { modo: 'apresentacao' },
    projecaoLiveAtiva: true,
  });
  const engine = motorFalso();

  criarAplicadorDeComandos({ state, engine }).aplicar('encerrar_projecao');

  assert.equal(state.projecaoLiveAtiva, false);
  assert.equal(state.estadoPublicoOverride, null);
  assert.equal(state.ministranteApresentacaoOverride, null);
  assert.deepEqual(state.estadoAtual, projectionPayloads.estadoPublicoOcioso());
  assert.deepEqual(state.estadoMinistrante, {
    titulo: '',
    atual: '',
    proximo: '',
    telaLimpa: true,
  });
});

test('encerrar_projecao usa o estado público do motor, não o do render', () => {
  // O handler original emitia `estadoPublicoParaSocketsOuApi()` e não o retorno de
  // `render()` — são payloads diferentes, e trocá-los muda o que chega ao painel.
  const state = estadoFalso({ estadoAtual: musicaProjetada() });
  const engine = motorFalso();
  const { eventos } = criarAplicadorDeComandos({ state, engine }).aplicar('encerrar_projecao');

  assert.equal(eventos[0].dados.marcador, 'estadoPublicoParaSocketsOuApi');
  assert.deepEqual(
    engine.chamadas.map((c) => c[0]),
    [
      'atualizarDisplays',
      'atualizarDisplayMinistrante',
      'aplicarDisplayConfigNasJanelas',
      'estadoPublicoParaSocketsOuApi',
    ]
  );
});

test('toggle_blackout alterna nos dois sentidos sem tocar no conteúdo', () => {
  const state = estadoFalso({ estadoAtual: musicaProjetada() });
  const aplicador = criarAplicadorDeComandos({ state, engine: motorFalso() });

  aplicador.aplicar('toggle_blackout');
  assert.equal(state.estadoAtual.blackout, true);
  assert.deepEqual(state.estadoAtual.linhas, ['linha 1'], 'o conteúdo permanece');

  aplicador.aplicar('toggle_blackout');
  assert.equal(state.estadoAtual.blackout, false);
});

test('toggle_blackout não reaplica a config das janelas', () => {
  const state = estadoFalso({ estadoAtual: musicaProjetada() });
  const engine = motorFalso();
  criarAplicadorDeComandos({ state, engine }).aplicar('toggle_blackout');

  assert.deepEqual(
    engine.chamadas.map((c) => c[0]),
    ['atualizarDisplays', 'estadoPublicoParaSocketsOuApi']
  );
});

test('o OBS de Bíblia reflete o versículo vivo', () => {
  const state = estadoFalso({ estadoAtual: versiculoProjetado() });
  const obs = estadoBibliaParaObs(state);

  assert.equal(obs.tipo, 'biblia');
  assert.equal(obs.livro, 'João');
  assert.deepEqual(obs.linhas, ['Porque Deus amou o mundo']);
  assert.notEqual(obs.linhas, state.estadoAtual.linhas, 'cópia, não a mesma referência');
});

test('o OBS de Bíblia fica limpo quando uma apresentação cobre o público', () => {
  const state = estadoFalso({
    estadoAtual: versiculoProjetado(),
    estadoPublicoOverride: { tipo: 'apresentacao' },
  });
  assert.equal(estadoBibliaParaObs(state).tipo, null);
});

test('o OBS de Bíblia fica limpo em blackout e com linhas vazias', () => {
  const comBlackout = estadoFalso({ estadoAtual: { ...versiculoProjetado(), blackout: true } });
  assert.equal(estadoBibliaParaObs(comBlackout).tipo, null);

  const semTexto = estadoFalso({ estadoAtual: { ...versiculoProjetado(), linhas: [''] } });
  assert.equal(estadoBibliaParaObs(semTexto).tipo, null);
});

test('encerrar a Bíblia deixa o overlay do OBS limpo', () => {
  const state = estadoFalso({ estadoAtual: versiculoProjetado() });
  const { eventos } = criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar(
    'encerrar_projecao_biblia'
  );

  const obs = eventos.find((e) => e.nome === 'estado_biblia_obs');
  assert.equal(obs.dados.tipo, null);
  assert.equal(obs.dados.telaLimpa, true);
});

// --- família «conteúdo» -----------------------------------------------------------

const ESTROFES = ['Primeira estrofe', 'Segunda estrofe', 'Terceira estrofe'];

test('exibir_musica projeta a estrofe pedida', () => {
  const state = estadoFalso();
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar('exibir_musica', {
    musicaId: 42,
    titulo: 'Santo',
    estrofes: ESTROFES,
    estrofeIndex: 1,
  });

  assert.equal(state.estadoAtual.tipo, 'musica');
  assert.equal(state.estadoAtual.musicaId, 42);
  assert.equal(state.estadoAtual.titulo, 'Santo');
  assert.deepEqual(state.estadoAtual.linhas, ['Segunda estrofe']);
  assert.equal(state.estadoAtual.slidePretoFinal, false);
  assert.equal(state.estadoAtual.totalEstrofes, 4, 'as estrofes mais o slide preto final');
});

test('exibir_musica aplica a config das janelas ANTES de renderizar', () => {
  // Ordem inversa à de `limpar_tela`, e de propósito: a estrofe entra já com a
  // tipografia certa, em vez de aparecer com a config anterior e corrigir-se depois.
  const state = estadoFalso();
  const engine = motorFalso();
  criarAplicadorDeComandos({ state, engine }).aplicar('exibir_musica', {
    estrofes: ESTROFES,
    estrofeIndex: 0,
  });

  assert.deepEqual(
    engine.chamadas.map((c) => c[0]),
    ['garantirTelasAbertasParaProjecao', 'aplicarDisplayConfigNasJanelas', 'render']
  );
  assert.equal(engine.chamadas.at(-1)[1].reforcarMinistrante, true);
});

test('exibir_musica no índice n é o slide preto final, sem título nem linhas', () => {
  const state = estadoFalso();
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar('exibir_musica', {
    titulo: 'Santo',
    estrofes: ESTROFES,
    estrofeIndex: 3,
  });

  assert.equal(state.estadoAtual.slidePretoFinal, true);
  assert.equal(state.estadoAtual.titulo, '');
  assert.deepEqual(state.estadoAtual.linhas, []);
});

test('exibir_musica ignora índices fora do intervalo e payload sem estrofes', () => {
  const state = estadoFalso();
  const engine = motorFalso();
  const aplicador = criarAplicadorDeComandos({ state, engine });

  for (const dados of [
    { estrofes: ESTROFES, estrofeIndex: -1 },
    { estrofes: ESTROFES, estrofeIndex: 4 },
    { estrofes: ESTROFES, estrofeIndex: 'x' },
    { estrofes: [], estrofeIndex: 0 },
    {},
  ]) {
    assert.deepEqual(aplicador.aplicar('exibir_musica', dados).eventos, []);
  }
  assert.deepEqual(engine.chamadas, [], 'o motor nunca chegou a ser tocado');
  assert.equal(state.estadoAtual.tipo, null);
});

test('preparar busca as estrofes quando o cliente só manda o musicaId', async () => {
  let pedido = null;
  const aplicador = criarAplicadorDeComandos({
    state: estadoFalso(),
    engine: motorFalso(),
    buscarMusicaPorId: async (id) => {
      pedido = id;
      return { titulo: 'Vinda do banco', estrofes: ESTROFES };
    },
  });

  const prontos = await aplicador.preparar('exibir_musica', { musicaId: 7, estrofeIndex: 0 });

  assert.equal(pedido, 7);
  assert.deepEqual(prontos.estrofes, ESTROFES);
  assert.equal(prontos.titulo, 'Vinda do banco');
});

test('preparar não busca nada quando as estrofes já vieram no payload', async () => {
  let chamou = false;
  const aplicador = criarAplicadorDeComandos({
    state: estadoFalso(),
    engine: motorFalso(),
    buscarMusicaPorId: async () => {
      chamou = true;
      return { estrofes: ['outra coisa'] };
    },
  });

  const prontos = await aplicador.preparar('exibir_musica', {
    musicaId: 7,
    estrofes: ESTROFES,
    estrofeIndex: 0,
  });

  assert.equal(chamou, false, 'o payload do controlador ganha da busca');
  assert.deepEqual(prontos.estrofes, ESTROFES);
});

test('preparar sobrevive a uma busca sem resultado e a host sem busca', async () => {
  const semResultado = criarAplicadorDeComandos({
    state: estadoFalso(),
    engine: motorFalso(),
    buscarMusicaPorId: async () => null,
  });
  assert.deepEqual((await semResultado.preparar('exibir_musica', { musicaId: 9 })).estrofes, []);

  const semBusca = criarAplicadorDeComandos({ state: estadoFalso(), engine: motorFalso() });
  assert.deepEqual((await semBusca.preparar('exibir_musica', { musicaId: 9 })).estrofes, []);
});

test('preparar é identidade para os comandos que não precisam de I/O', async () => {
  const aplicador = criarAplicadorDeComandos({ state: estadoFalso(), engine: motorFalso() });
  const dados = { texto: 'algo' };
  assert.equal(await aplicador.preparar('exibir_versiculo', dados), dados);
});

test('exibir_versiculo monta o título a partir da referência', () => {
  const state = estadoFalso();
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar('exibir_versiculo', {
    livro: 'João',
    capitulo: '3',
    versiculo: '16',
    texto: 'Porque Deus amou o mundo',
  });

  assert.equal(state.estadoAtual.titulo, 'João 3:16');
  assert.deepEqual(state.estadoAtual.linhas, ['Porque Deus amou o mundo']);
});

test('exibir_versiculo trata a string "null" como referência ausente', () => {
  // O painel envia campos por serializar; "null" e "undefined" chegavam como texto e
  // acabavam impressos no título do versículo.
  const state = estadoFalso();
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar('exibir_versiculo', {
    livro: 'null',
    capitulo: 'undefined',
    versiculo: '16',
    texto: 'x',
  });

  assert.equal(state.estadoAtual.livro, '');
  assert.equal(state.estadoAtual.titulo, '', 'sem referência completa, não há título');
});

test('exibir_versiculo só no ministrante limpa o canal público', () => {
  const state = estadoFalso({ estadoAtual: musicaProjetada() });
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar('exibir_versiculo', {
    livro: 'Salmos',
    capitulo: '1',
    versiculo: '1',
    texto: 'Bem-aventurado',
    alvoProjecao: 'ministrante',
  });

  assert.equal(state.estadoAtual.tipo, 'biblia');
  assert.equal(state.estadoPublicoOverride.telaLimpa, true, 'o telão não fica com a música');
  assert.equal(state.ministranteApresentacaoOverride, null);
});

test('exibir_versiculo só no público limpa o canal do ministrante', () => {
  const state = estadoFalso();
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar('exibir_versiculo', {
    livro: 'Salmos',
    capitulo: '1',
    versiculo: '1',
    texto: 'Bem-aventurado',
    alvoProjecao: 'publico',
  });

  assert.equal(state.estadoPublicoOverride, null);
  assert.deepEqual(state.ministranteApresentacaoOverride, {
    modo: 'biblia',
    titulo: '',
    atual: '',
    proximo: '',
    telaLimpa: true,
  });
});

test('exibir_versiculo com alvo live marca a projeção como live', () => {
  const state = estadoFalso();
  const aplicador = criarAplicadorDeComandos({ state, engine: motorFalso() });

  aplicador.aplicar('exibir_versiculo', { texto: 'x', alvoProjecao: 'live' });
  assert.equal(state.projecaoLiveAtiva, true);

  aplicador.aplicar('exibir_versiculo', { texto: 'x', alvoProjecao: 'ambos' });
  assert.equal(state.projecaoLiveAtiva, false);
});

test('exibir_versiculo com somenteTexto não reenvia a config das janelas', () => {
  // Reenviar `display_config` a cada versículo arrasta a bgImage em base64 e atrasa
  // visivelmente a navegação entre versículos.
  const engine = motorFalso();
  criarAplicadorDeComandos({ state: estadoFalso(), engine }).aplicar('exibir_versiculo', {
    texto: 'x',
    somenteTexto: true,
  });

  assert.equal(
    engine.chamadas.some((c) => c[0] === 'aplicarDisplayConfigNasJanelas'),
    false
  );
});

test('exibir_versiculo com somenteTexto e reenviarDisplayConfig reenvia mesmo assim', () => {
  const engine = motorFalso();
  criarAplicadorDeComandos({ state: estadoFalso(), engine }).aplicar('exibir_versiculo', {
    texto: 'x',
    somenteTexto: true,
    reenviarDisplayConfig: true,
  });

  assert.deepEqual(
    engine.chamadas.find((c) => c[0] === 'aplicarDisplayConfigNasJanelas')[1],
    { forcarModo: 'biblia' }
  );
});

/* ── Independência do OBS face à projeção física ────────────────────────────── */

/**
 * Motor que falha em tudo o que é janela física.
 *
 * Reproduz o mundo real do relatório: sem monitor externo, com a rota a apontar para um
 * ecrã que já não existe, ou com a janela destruída a meio. O overlay do OBS não tem nada
 * a ver com isso — e não pode emudecer por causa disso.
 */
function motorSemTelas() {
  const base = motorFalso();
  return {
    ...base,
    garantirTelasAbertasParaProjecao() {
      base.chamadas.push(['garantirTelasAbertasParaProjecao']);
      throw new Error('nenhum monitor de projeção disponível');
    },
    aplicarDisplayConfigNasJanelas(opts) {
      base.chamadas.push(['aplicarDisplayConfigNasJanelas', opts]);
      throw new Error('janela destruída');
    },
    render(arg) {
      base.chamadas.push(['render', arg]);
      throw new Error('sem janela para desenhar');
    },
  };
}

function eventosPorNome(eventos) {
  return Object.fromEntries(eventos.map((ev) => [ev.nome, ev.dados]));
}

const ALVOS_DO_RELATORIO = ['publico', 'ministrante', 'ambos', 'live'];

for (const alvo of ALVOS_DO_RELATORIO) {
  test(`exibir_versiculo com alvo «${alvo}» alimenta sempre o overlay de Bíblia`, () => {
    const state = estadoFalso();
    const { eventos } = criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar(
      'exibir_versiculo',
      {
        livro: 'João',
        capitulo: '3',
        versiculo: '16',
        texto: 'Porque Deus amou o mundo',
        alvoProjecao: alvo,
      }
    );

    const porNome = eventosPorNome(eventos);
    assert.ok('estado' in porNome, '/obs/slides recebe `estado`');
    assert.ok('estado_biblia_obs' in porNome, '/obs/biblia recebe `estado_biblia_obs`');

    const obs = porNome.estado_biblia_obs;
    assert.equal(obs.tipo, 'biblia');
    assert.equal(obs.titulo, 'João 3:16');
    assert.deepEqual(obs.linhas, ['Porque Deus amou o mundo']);
    assert.equal(obs.telaLimpa, false);
  });

  test(`exibir_versiculo com alvo «${alvo}» alimenta o OBS mesmo sem telas físicas`, () => {
    const state = estadoFalso();
    const engine = motorSemTelas();
    const { eventos } = criarAplicadorDeComandos({ state, engine, logError: () => {} }).aplicar(
      'exibir_versiculo',
      {
        livro: 'Salmos',
        capitulo: '23',
        versiculo: '1',
        texto: 'O Senhor é o meu pastor',
        alvoProjecao: alvo,
      }
    );

    const porNome = eventosPorNome(eventos);
    assert.ok('estado' in porNome, 'a rota /obs/slides continua a receber `estado`');
    assert.equal(porNome.estado_biblia_obs.titulo, 'Salmos 23:1');
    assert.deepEqual(porNome.estado_biblia_obs.linhas, ['O Senhor é o meu pastor']);
    /* A camada física foi de facto tentada — a blindagem não a saltou. */
    assert.ok(engine.chamadas.some((c) => c[0] === 'render'));
  });
}

test('a falha das telas não impede o estado público de ser difundido', () => {
  const engine = motorSemTelas();
  const { eventos } = criarAplicadorDeComandos({
    state: estadoFalso(),
    engine,
    logError: () => {},
  }).aplicar('exibir_versiculo', { texto: 'x', alvoProjecao: 'live' });

  const estado = eventosPorNome(eventos).estado;
  assert.ok(estado, '`estado` cai no valor de reserva em vez de ficar por difundir');
});

test('encerrar_projecao_biblia limpa o overlay mesmo com as telas a falhar', () => {
  const state = estadoFalso({ estadoAtual: versiculoProjetado() });
  const { eventos } = criarAplicadorDeComandos({
    state,
    engine: motorSemTelas(),
    logError: () => {},
  }).aplicar('encerrar_projecao_biblia');

  assert.equal(eventosPorNome(eventos).estado_biblia_obs.telaLimpa, true);
});

test('a camada física falhada é registada, não engolida', () => {
  const registados = [];
  criarAplicadorDeComandos({
    state: estadoFalso(),
    engine: motorSemTelas(),
    logError: (etapa) => registados.push(etapa),
  }).aplicar('exibir_versiculo', { texto: 'x', alvoProjecao: 'publico' });

  assert.ok(
    registados.some((e) => e.startsWith('camada-fisica-')),
    `esperava um log de camada física, veio ${JSON.stringify(registados)}`
  );
});

test('exibir_apresentacao monta os overrides de imagem nos dois canais', () => {
  const state = estadoFalso({ estadoAtual: musicaProjetada() });
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar('exibir_apresentacao', {
    kind: 'image',
    src: 'file:///slide.png',
    title: 'Slide',
  });

  assert.equal(state.estadoPublicoOverride.tipo, 'apresentacao');
  assert.equal(state.estadoPublicoOverride.apresentacao.kind, 'image');
  assert.equal(state.ministranteApresentacaoOverride.modo, 'apresentacao');
});

test('exibir_apresentacao trata pdf como iframe e aviso como texto', () => {
  const state = estadoFalso();
  const aplicador = criarAplicadorDeComandos({ state, engine: motorFalso() });

  aplicador.aplicar('exibir_apresentacao', { kind: 'pdf', src: 'file:///a.pdf' });
  assert.equal(state.estadoPublicoOverride.apresentacao.kind, 'iframe');

  aplicador.aplicar('exibir_apresentacao', { kind: 'aviso', texto: 'linha 1\nlinha 2' });
  assert.equal(state.estadoPublicoOverride.tipo, 'aviso');
  assert.deepEqual(state.estadoPublicoOverride.linhas, ['linha 1', 'linha 2']);
});

test('exibir_apresentacao com alvo parcial preserva o canal oposto', () => {
  const state = estadoFalso();
  const aplicador = criarAplicadorDeComandos({ state, engine: motorFalso() });

  aplicador.aplicar('exibir_apresentacao', {
    kind: 'image',
    src: 'file:///slide.png',
    alvoProjecao: 'publico',
  });
  assert.equal(state.estadoPublicoOverride.tipo, 'apresentacao');
  assert.equal(state.ministranteApresentacaoOverride, null);

  aplicador.aplicar('exibir_apresentacao', {
    kind: 'aviso',
    texto: 'Aviso no M2',
    alvoProjecao: 'ministrante',
  });
  assert.equal(state.estadoPublicoOverride.tipo, 'apresentacao');
  assert.equal(state.ministranteApresentacaoOverride.modo, 'aviso');
  assert.deepEqual(state.ministranteApresentacaoOverride.linhas, ['Aviso no M2']);
});

test('encerrar_apresentacao_publico com alvo parcial mantém o outro canal', () => {
  const state = estadoFalso({
    estadoPublicoOverride: { tipo: 'apresentacao', apresentacao: { kind: 'image', src: 'a.png' } },
    ministranteApresentacaoOverride: { modo: 'aviso', linhas: ['x'] },
  });
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar('encerrar_apresentacao_publico', {
    alvoProjecao: 'ministrante',
  });

  assert.equal(state.estadoPublicoOverride.tipo, 'apresentacao');
  assert.equal(state.ministranteApresentacaoOverride, null);
});

test('exibir_apresentacao sem src não cria override', () => {
  const state = estadoFalso();
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar('exibir_apresentacao', {
    kind: 'image',
    src: '   ',
  });

  assert.equal(state.estadoPublicoOverride, null);
  assert.equal(state.ministranteApresentacaoOverride, null);
});

test('exibir_apresentacao passa o src pela reescrita do host', () => {
  const state = estadoFalso();
  const vistos = [];
  criarAplicadorDeComandos({
    state,
    engine: motorFalso(),
    reescreverSrcMidia: (src, kind) => {
      vistos.push([src, kind]);
      return src.replace('127.0.0.1:3001', '192.168.0.9:5510');
    },
  }).aplicar('exibir_apresentacao', {
    kind: 'video',
    src: 'http://127.0.0.1:3001/api/apresentacao/video/7',
  });

  assert.deepEqual(vistos, [['http://127.0.0.1:3001/api/apresentacao/video/7', 'video']]);
  assert.equal(
    state.estadoPublicoOverride.apresentacao.src,
    'http://192.168.0.9:5510/api/apresentacao/video/7'
  );
});

test('encerrar_apresentacao_publico limpa os dois overrides', () => {
  const state = estadoFalso({
    estadoAtual: musicaProjetada(),
    estadoPublicoOverride: { tipo: 'apresentacao' },
    ministranteApresentacaoOverride: { modo: 'apresentacao' },
    projecaoLiveAtiva: true,
  });
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar(
    'encerrar_apresentacao_publico'
  );

  assert.equal(state.estadoPublicoOverride, null);
  assert.equal(state.ministranteApresentacaoOverride, null);
  assert.equal(state.projecaoLiveAtiva, false);
  assert.equal(state.estadoAtual.tipo, 'musica', 'a música por baixo reaparece');
});

test('exibir_ministrante usa o texto do painel quando ele vem', () => {
  const state = estadoFalso();
  const engine = motorFalso();
  const { eventos } = criarAplicadorDeComandos({ state, engine }).aplicar('exibir_ministrante', {
    titulo: 'Santo',
    atual: 'linha atual',
    proximo: 'linha próxima',
    telaLimpa: false,
  });

  assert.equal(state.estadoMinistrante.atual, 'linha atual');
  assert.deepEqual(eventos, [], 'escreve na janela; não difunde nada');
  assert.equal(engine.chamadas.at(-1)[0], 'atualizarDisplayMinistrante');
});

test('exibir_ministrante cai no snapshot quando o cliente não manda corpo', () => {
  const state = estadoFalso();
  criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar('exibir_ministrante', {});

  assert.equal(state.estadoMinistrante.titulo, 'do snapshot');
});

test('exibir_ministrante recusa-se a passar à frente de uma apresentação', () => {
  const state = estadoFalso({ ministranteApresentacaoOverride: { modo: 'apresentacao' } });
  const engine = motorFalso();
  criarAplicadorDeComandos({ state, engine }).aplicar('exibir_ministrante', { atual: 'texto' });

  assert.deepEqual(engine.chamadas, []);
  assert.equal(state.estadoMinistrante.atual, '', 'a apresentação continua dona do canal');
});

// --- famílias «config» e «áudio/vídeo» --------------------------------------------

const { ALCANCE_OUTROS } = require('./commandApplier');
const displayConfigLib = require('./displayConfig');

/** Estado com as camadas de config que o displayConfigModo espera encontrar. */
function estadoComConfig() {
  return estadoFalso({
    displayConfig: displayConfigLib.mergeDisplayConfigLayers(
      displayConfigLib.DEFAULT_DISPLAY_CONFIG,
      {}
    ),
    displayConfigBiblia: { publico: {}, ministrante: {}, clock: {} },
    modoVisualProjecaoAtivo: 'slides',
  });
}

test('preview_display_config aplica nas janelas sem persistir', () => {
  const state = estadoComConfig();
  const engine = motorFalso();
  const { aplicado } = criarAplicadorDeComandos({
    state,
    engine,
    // Se persistisse, precisaria deste caminho; o teste falha alto caso o use.
    displayConfigPath: () => {
      throw new Error('preview não pode gravar em disco');
    },
  }).aplicar('preview_display_config', { publico: { fontSize: 42 } });

  assert.equal(aplicado, true);
  assert.equal(engine.chamadas[0][0], 'aplicarDisplayConfigNasJanelas');
  assert.equal(engine.chamadas.at(-1)[0], 'sincronizarJanelasRelogio');
});

test('preview_display_config recusa corpo que não seja objeto de config', () => {
  const engine = motorFalso();
  const aplicador = criarAplicadorDeComandos({ state: estadoComConfig(), engine });

  for (const corpo of [null, undefined, [], 'texto', 7]) {
    assert.equal(aplicador.aplicar('preview_display_config', corpo).aplicado, false);
  }
  assert.deepEqual(engine.chamadas, [], 'o motor não foi tocado');
});

test('set_display_config lança em corpo inválido, para o ack poder responder', () => {
  const aplicador = criarAplicadorDeComandos({ state: estadoComConfig(), engine: motorFalso() });
  assert.throws(
    () => aplicador.aplicar('set_display_config', []),
    /corpo deve ser um objeto de configuração/
  );
});

test('set_display_config difunde display_config só aos OUTROS clientes', () => {
  // Devolver a config a quem a enviou faria o painel do operador saltar por cima do
  // formulário que ele está a editar.
  const { eventos } = criarAplicadorDeComandos({
    state: estadoComConfig(),
    engine: motorFalso(),
  }).aplicar('set_display_config', { publico: { fontSize: 30 }, modoConfig: 'slides' });

  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].nome, 'display_config');
  assert.equal(eventos[0].alcance, ALCANCE_OUTROS);
});

test('set_display_config não persiste a camada de Bíblia junto com a de slides', () => {
  let gravou = false;
  criarAplicadorDeComandos({
    state: estadoComConfig(),
    engine: motorFalso(),
    displayConfigPath: () => {
      gravou = true;
      return '/tmp/nao-usar.json';
    },
  }).aplicar('set_display_config', { modoConfig: 'biblia', publico: { fontSize: 30 } });

  assert.equal(gravou, false, 'a config de Bíblia comeria o tema dos slides');
});

test('uma falha do relógio não impede o resto do comando de config', () => {
  const engine = motorFalso();
  engine.sincronizarJanelasRelogio = () => {
    throw new Error('sem janela de relógio');
  };
  const erros = [];

  const { eventos } = criarAplicadorDeComandos({
    state: estadoComConfig(),
    engine,
    logError: (rotulo) => erros.push(rotulo),
  }).aplicar('set_display_config', { publico: { fontSize: 30 }, modoConfig: 'slides' });

  assert.deepEqual(erros, ['sincronizar-janelas-relogio']);
  assert.equal(eventos.length, 1, 'o display_config seguiu para os outros clientes');
});

test('audio_play normaliza o payload e exige src', () => {
  const engine = motorFalso();
  const aplicador = criarAplicadorDeComandos({ state: estadoFalso(), engine });

  assert.equal(aplicador.aplicar('audio_play', { src: '  ' }).aplicado, false);
  assert.equal(aplicador.aplicar('audio_play', {}).aplicado, false);
  assert.deepEqual(engine.chamadas, []);

  assert.equal(aplicador.aplicar('audio_play', { src: 'f.mp3' }).aplicado, true);
  assert.deepEqual(engine.chamadas.at(-1), [
    'enviarComandoAudioParaControle',
    'audio_play',
    { src: 'f.mp3', name: 'audio', mediaKind: 'audio', autoplay: true, volume: undefined },
  ]);
});

test('audio_volume e audio_seek limitam os valores e recusam lixo', () => {
  const engine = motorFalso();
  const aplicador = criarAplicadorDeComandos({ state: estadoFalso(), engine });

  aplicador.aplicar('audio_volume', { volume: 5 });
  assert.deepEqual(engine.chamadas.at(-1)[2], { volume: 1 });

  aplicador.aplicar('audio_seek', { time: -3 });
  assert.deepEqual(engine.chamadas.at(-1)[2], { time: 0 });

  assert.equal(aplicador.aplicar('audio_volume', { volume: 'alto' }).aplicado, false);
  assert.equal(aplicador.aplicar('audio_seek', {}).aplicado, false);
});

test('apresentacao_video_state só sincroniza o tempo quando pedido', () => {
  // Reposicionar o vídeo a cada ajuste de volume produziria micro-saltos na imagem.
  const engine = motorFalso();
  const aplicador = criarAplicadorDeComandos({ state: estadoFalso(), engine });

  aplicador.aplicar('apresentacao_video_state', { playing: true, currentTime: 12, volume: 0.5 });
  assert.deepEqual(engine.chamadas.at(-1)[1], { playing: true, volume: 0.5 });

  aplicador.aplicar('apresentacao_video_state', { playing: true, syncTime: true, currentTime: 12 });
  assert.deepEqual(engine.chamadas.at(-1)[1], { playing: true, syncTime: true, currentTime: 12 });
});

test('aplicado distingue «recusou» de «agiu e não há nada a difundir»', () => {
  const state = estadoFalso({ ministranteApresentacaoOverride: { modo: 'apresentacao' } });
  const bloqueado = criarAplicadorDeComandos({ state, engine: motorFalso() }).aplicar(
    'exibir_ministrante',
    { atual: 'x' }
  );
  assert.deepEqual(bloqueado, { eventos: [], aplicado: false });

  const passou = criarAplicadorDeComandos({ state: estadoFalso(), engine: motorFalso() }).aplicar(
    'exibir_ministrante',
    { atual: 'x' }
  );
  assert.deepEqual(passou, { eventos: [], aplicado: true });
});

// --- contagem regressiva --------------------------------------------------------------

/* Relógio de bolso: o aplicador aceita `deps.agora`, e é por aí que a suíte controla o
   tempo em vez de dormir. */
function relogioFalso(inicio = 1_700_000_000_000) {
  let t = inicio;
  return {
    agora: () => t,
    avancar(ms) {
      t += ms;
    },
  };
}

function aplicadorComContagem(inicial = {}) {
  const state = estadoFalso(inicial);
  const engine = motorFalso();
  const clock = relogioFalso();
  const aplicador = criarAplicadorDeComandos({ state, engine, agora: clock.agora });
  return { state, engine, clock, aplicador };
}

test('contagem entra como override público sem apagar o slide por baixo', () => {
  const { state, aplicador } = aplicadorComContagem({ estadoAtual: musicaProjetada() });

  const r = aplicador.aplicar('exibir_contagem', { minutos: 5 });

  assert.equal(r.aplicado, true);
  assert.equal(state.estadoPublicoOverride.tipo, 'contagem');
  assert.equal(state.contagem.rodando, true);
  assert.equal(state.contagem.duracaoMs, 300_000);
  /* O slide continua em `estadoAtual`: encerrar a contagem devolve a música ao telão. */
  assert.equal(state.estadoAtual.tipo, 'musica');
});

test('contagem fica só no telão por omissão', () => {
  const { state, aplicador } = aplicadorComContagem();

  aplicador.aplicar('exibir_contagem', { minutos: 5 });

  assert.equal(state.estadoPublicoOverride.tipo, 'contagem');
  assert.equal(
    state.ministranteApresentacaoOverride,
    null,
    'sem alvo declarado, o palco continua com o que lá estava'
  );
});

test('alvo «ambos» põe a mesma contagem no monitor do ministrante', () => {
  const { state, aplicador } = aplicadorComContagem();

  aplicador.aplicar('exibir_contagem', { minutos: 5, alvo: 'ambos' });

  assert.equal(state.ministranteApresentacaoOverride.modo, 'contagem');
  /* O MESMO estado nos dois canais: é o que garante dígitos iguais nas duas telas. */
  assert.equal(state.ministranteApresentacaoOverride.contagem, state.contagem);
  assert.equal(state.estadoPublicoOverride.contagem, state.contagem);
});

test('alvo persiste através de pausar, ajustar e retomar', () => {
  /* Um «pausar» que não mencione o alvo não pode tirar a contagem do palco a meio. */
  const { state, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 5, alvo: 'ambos' });

  aplicador.aplicar('exibir_contagem', { acao: 'pausar' });
  assert.equal(state.ministranteApresentacaoOverride.modo, 'contagem');

  aplicador.aplicar('exibir_contagem', { acao: 'ajustar', ajusteMs: 60_000 });
  assert.equal(state.ministranteApresentacaoOverride.modo, 'contagem');

  aplicador.aplicar('exibir_contagem', { acao: 'retomar' });
  assert.equal(state.ministranteApresentacaoOverride.modo, 'contagem');
});

test('voltar a «publico» tira a contagem do palco', () => {
  const { state, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 5, alvo: 'ambos' });

  aplicador.aplicar('exibir_contagem', { alvo: 'publico' });

  assert.equal(state.ministranteApresentacaoOverride, null);
  assert.equal(state.estadoPublicoOverride.tipo, 'contagem');
});

test('encerrar limpa a contagem dos dois canais', () => {
  const { state, aplicador } = aplicadorComContagem({ estadoAtual: musicaProjetada() });
  aplicador.aplicar('exibir_contagem', { minutos: 5, alvo: 'ambos' });

  aplicador.aplicar('encerrar_contagem', {});

  assert.equal(state.estadoPublicoOverride, null);
  assert.equal(state.ministranteApresentacaoOverride, null);
});

test('alvo desconhecido não promove a contagem ao palco', () => {
  const { state, aplicador } = aplicadorComContagem();

  aplicador.aplicar('exibir_contagem', { minutos: 5, alvo: 'toda-a-gente' });

  assert.equal(state.ministranteApresentacaoOverride, null);
});

test('contagem abre as telas antes de desenhar', () => {
  const { engine, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 1 });

  const nomes = engine.chamadas.map((c) => c[0]);
  assert.ok(
    nomes.indexOf('garantirTelasAbertasParaProjecao') < nomes.indexOf('render'),
    'sem telas abertas o render não tem onde desenhar'
  );
});

test('contagem preserva o blackout do telão', () => {
  /* Quem apagou o telão não quer que uma contagem o acenda. */
  const { state, aplicador } = aplicadorComContagem({
    estadoAtual: { ...musicaProjetada(), blackout: true },
  });
  aplicador.aplicar('exibir_contagem', { minutos: 5 });
  assert.equal(state.estadoPublicoOverride.blackout, true);
});

test('o payload emitido leva duração, nunca o instante do relógio do host', () => {
  const { state, clock, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 5 });

  clock.avancar(120_000);
  const pub = projectionPayloads.payloadPublicoAtual(
    state.estadoAtual,
    state.estadoPublicoOverride,
    { agora: clock.agora() }
  );

  assert.equal(pub.tipo, 'contagem');
  assert.equal(pub.contagem.restanteMs, 180_000);
  assert.equal(pub.contagem.alvoEm, undefined, 'alvoEm é do host e não atravessa a fronteira');
});

test('um telão que liga a meio recebe o tempo que falta, não o tempo inicial', () => {
  const { state, clock, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 10 });

  clock.avancar(400_000);
  const tardio = projectionPayloads.payloadPublicoAtual(
    state.estadoAtual,
    state.estadoPublicoOverride,
    { agora: clock.agora() }
  );
  assert.equal(tardio.contagem.restanteMs, 200_000);
});

test('pausar congela e retomar continua de onde parou', () => {
  const { state, clock, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 5 });

  clock.avancar(60_000);
  aplicador.aplicar('exibir_contagem', { acao: 'pausar' });
  assert.equal(state.contagem.rodando, false);
  assert.equal(state.contagem.restanteMs, 240_000);

  clock.avancar(600_000);
  assert.equal(state.contagem.restanteMs, 240_000, 'pausada, o tempo parado não conta');

  aplicador.aplicar('exibir_contagem', { acao: 'retomar' });
  clock.avancar(40_000);
  const pub = projectionPayloads.payloadPublicoAtual(state.estadoAtual, state.estadoPublicoOverride, {
    agora: clock.agora(),
  });
  assert.equal(pub.contagem.restanteMs, 200_000);
});

test('ajustar estica a contagem sem a reiniciar', () => {
  const { state, clock, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 5 });
  clock.avancar(60_000);

  aplicador.aplicar('exibir_contagem', { acao: 'ajustar', ajusteMs: 60_000 });
  const pub = projectionPayloads.payloadPublicoAtual(state.estadoAtual, state.estadoPublicoOverride, {
    agora: clock.agora(),
  });
  assert.equal(pub.contagem.restanteMs, 300_000);
  assert.equal(pub.contagem.rodando, true, 'ajustar não pode pausar');
});

test('mudar só a aparência não reinicia o tempo', () => {
  /* É o caminho de quem mexe num slider no Ajustes com a contagem no ar. */
  const { state, clock, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 5 });
  clock.avancar(120_000);

  aplicador.aplicar('exibir_contagem', { contagemConfig: { textColor: '#ff0000' } });

  assert.equal(state.contagem.cfg.textColor, '#ff0000');
  const pub = projectionPayloads.payloadPublicoAtual(state.estadoAtual, state.estadoPublicoOverride, {
    agora: clock.agora(),
  });
  assert.equal(pub.contagem.restanteMs, 180_000);
});

test('pausar sem contagem no ar recusa-se em vez de inventar uma', () => {
  const { aplicador } = aplicadorComContagem();
  assert.deepEqual(aplicador.aplicar('exibir_contagem', { acao: 'pausar' }), {
    eventos: [],
    aplicado: false,
  });
  assert.deepEqual(aplicador.aplicar('exibir_contagem', { acao: 'retomar' }), {
    eventos: [],
    aplicado: false,
  });
  assert.deepEqual(aplicador.aplicar('exibir_contagem', { acao: 'ajustar', ajusteMs: 1000 }), {
    eventos: [],
    aplicado: false,
  });
});

test('definir sem duração e sem contagem anterior recusa-se', () => {
  const { aplicador } = aplicadorComContagem();
  assert.deepEqual(aplicador.aplicar('exibir_contagem', {}), { eventos: [], aplicado: false });
});

test('encerrar devolve o telão ao que estava por baixo', () => {
  const { state, aplicador } = aplicadorComContagem({ estadoAtual: musicaProjetada() });
  aplicador.aplicar('exibir_contagem', { minutos: 5 });

  const r = aplicador.aplicar('encerrar_contagem');

  assert.equal(r.aplicado, true);
  assert.equal(state.estadoPublicoOverride, null);
  assert.equal(state.contagem, null, 'o estado interno também sai — senão ressuscita');
  assert.equal(state.estadoAtual.tipo, 'musica');
});

test('depois de encerrar, um comando só de aparência não ressuscita a contagem', () => {
  const { state, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 5 });
  aplicador.aplicar('encerrar_contagem');

  const r = aplicador.aplicar('exibir_contagem', { contagemConfig: { textColor: '#00ff00' } });

  assert.equal(r.aplicado, false);
  assert.equal(state.estadoPublicoOverride, null);
});

test('encerrar a apresentação leva a contagem junto — é a mesma camada', () => {
  const { state, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 5 });

  aplicador.aplicar('encerrar_apresentacao_publico');

  assert.equal(state.estadoPublicoOverride, null);
  assert.equal(state.contagem, null);
});

test('contagem no ar cala o overlay de Bíblia do OBS', () => {
  /* Mesma regra do aviso: o que cobre o telão cobre o overlay. */
  const { state, aplicador } = aplicadorComContagem({ estadoAtual: versiculoProjetado() });
  assert.equal(estadoBibliaParaObs(state).tipo, 'biblia');

  aplicador.aplicar('exibir_contagem', { minutos: 5 });
  assert.equal(estadoBibliaParaObs(state).tipo, null);

  aplicador.aplicar('encerrar_contagem');
  assert.equal(estadoBibliaParaObs(state).tipo, 'biblia');
});

test('a contagem não chega a nenhum overlay do OBS', () => {
  /*
   * Contrato, não coincidência.
   *
   * Os três overlays decidem o que desenhar a partir deste payload, cada um à sua
   * maneira: `/obs` e `/obs/slides` perguntam por `linhas` com conteúdo, `/obs/slides`
   * filtra ainda por `tipo`, e `/obs/biblia` vive de `estado_biblia_obs`. Se algum dia a
   * contagem passar a trazer `linhas` — para reaproveitar o renderizador de texto, por
   * exemplo —, estreia-se na transmissão sem ninguém pedir. Este teste é o que faz esse
   * dia falhar aqui, e não ao vivo.
   */
  const { state, aplicador } = aplicadorComContagem({ estadoAtual: musicaProjetada() });
  aplicador.aplicar('exibir_contagem', { minutos: 5 });

  const pub = projectionPayloads.payloadPublicoAtual(
    state.estadoAtual,
    state.estadoPublicoOverride
  );

  /* `/obs` e `/obs/slides`: sem linhas, os dois caem no ramo «vazio». */
  assert.deepEqual(pub.linhas, [], 'a contagem não pode trazer texto para o OBS desenhar');

  /* `/obs/slides`: filtra por tipo, e `contagem` não é nenhum dos que aceita. */
  assert.notEqual(pub.tipo, 'musica');
  assert.notEqual(pub.tipo, 'aviso');

  /* `/obs/biblia`: a contagem cobre o telão, portanto cala o versículo. */
  assert.equal(estadoBibliaParaObs(state).tipo, null);
});

test('contagem armada em pausa não corre até o operador mandar', () => {
  const { state, clock, aplicador } = aplicadorComContagem();
  aplicador.aplicar('exibir_contagem', { minutos: 5, rodando: false });

  clock.avancar(120_000);
  const pub = projectionPayloads.payloadPublicoAtual(state.estadoAtual, state.estadoPublicoOverride, {
    agora: clock.agora(),
  });
  assert.equal(pub.contagem.restanteMs, 300_000);
  assert.equal(pub.contagem.rodando, false);
});

test('todos os comandos de projeção do Servidor estão cobertos', () => {
  const aplicador = criarAplicadorDeComandos({ state: estadoFalso(), engine: motorFalso() });
  const esperados = [
    'limpar_tela',
    'encerrar_projecao_biblia',
    'encerrar_projecao',
    'toggle_blackout',
    'exibir_musica',
    'exibir_versiculo',
    'exibir_apresentacao',
    'encerrar_apresentacao_publico',
    'exibir_contagem',
    'encerrar_contagem',
    'exibir_ministrante',
    'preview_display_config',
    'set_display_config',
    'audio_play',
    'audio_pause',
    'audio_volume',
    'audio_seek',
    'audio_stop',
    'apresentacao_video_state',
  ];
  assert.deepEqual(aplicador.comandos.sort(), esperados.sort());
});

// --- regra de difusão partilhada pelos dois hosts -----------------------------------

const { alvosDaDifusao } = require('./commandApplier');

test('evento para todos chega ao painel e aos clientes, venha de onde vier', () => {
  const ev = { nome: 'estado', alcance: ALCANCE_TODOS };

  assert.deepEqual(alvosDaDifusao(ev, true), {
    painel: true,
    clientes: true,
    excluirOrigemNaRede: false,
  });
  assert.deepEqual(alvosDaDifusao(ev, false), {
    painel: true,
    clientes: true,
    excluirOrigemNaRede: false,
  });
});

test('alcance OUTROS exclui o painel quando foi o painel que pediu', () => {
  // O caso que só existe no modo local: o operador grava a config e não pode receber de
  // volta o que acabou de enviar, ou o formulário salta por cima da edição dele.
  const ev = { nome: 'display_config', alcance: ALCANCE_OUTROS };
  const doPainel = alvosDaDifusao(ev, false);

  assert.equal(doPainel.painel, false);
  assert.equal(doPainel.clientes, true, 'OBS e celular continuam a receber');
  assert.equal(doPainel.excluirOrigemNaRede, false, 'não há socket de origem a excluir');
});

test('alcance OUTROS exclui o socket de origem quando o pedido veio da rede', () => {
  const ev = { nome: 'display_config', alcance: ALCANCE_OUTROS };
  const daRede = alvosDaDifusao(ev, true);

  assert.equal(daRede.painel, true, 'o painel não foi quem pediu, logo recebe');
  assert.equal(daRede.excluirOrigemNaRede, true);
});
