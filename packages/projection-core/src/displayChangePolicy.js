'use strict';

/**
 * Política de reação a mudanças de ecrã do Electron.
 *
 * O problema que isto existe para impedir: o Windows (e o Electron) emitem
 * `display-metrics-changed` por coisas que **não** são um monitor a ligar ou a mudar de
 * sítio — o caso clássico é `workArea`, que muda quando uma janela a cobrir o ecrã esconde
 * a barra de tarefas. Se o motor reorganizar as janelas a cada um desses eventos, a
 * reorganização dispara *outro* `workArea`, e o PC fica a «piscar» à procura do projetor.
 *
 * `display-added` / `display-removed` continuam a reorganizar: aí o SO está mesmo a
 * ligar/desligar um output. Mesmo esses vêm em rajada no handshake HDMI de um projetor, por
 * isso a primeira passagem é coalescida e há uma segunda, atrasada, para quando o Windows
 * acabar de arrastar as janelas órfãs (isso não emite segundo evento).
 */

/** Segunda passagem depois de um plug — ver `aoMudarDisplaysDoSistema` no Servidor. */
const ATRASO_REVALIDAR_APOS_PLUG_MS = 1200;

/** Junta uma rajada de `display-added`/`display-removed` num único sync. */
const DEBOUNCE_PLUG_MS = 150;

/** Junta uma rajada de métricas (DPI, bounds a oscilar no handshake) num único sync. */
const DEBOUNCE_METRICAS_MS = 400;

/**
 * Passagens de arranque, contadas a partir do momento em que os listeners ligam.
 *
 * O host faz uma primeira varredura assim que o processo está pronto — e faz bem, porque
 * num setup já ligado é isso que põe o telão no ar sem atraso nenhum. Mas se o projetor
 * ainda não estiver enumerado nesse instante, `podeAbrirJanelaSecundaria()` («há mais do
 * que um monitor?») devolve falso e **nenhuma janela é aberta**. A recuperação ficava
 * inteiramente dependente de um `display-added` posterior — e há máquinas onde o output
 * já estava presente antes do processo arrancar, ou onde o evento se perde no arranque do
 * Electron. O sintoma é o relatado: o seletor mostra «M2 (Público)» porque
 * `getAllDisplays()` está certo, e a projeção não usa o monitor.
 *
 * Estas passagens são a rede: repetem a varredura enquanto o arranjo assenta. São
 * idempotentes — com tudo no sítio não fazem uma única chamada nativa — e são canceladas
 * assim que um evento de ecrã real chega, porque esse caminho já reorganiza sozinho.
 */
const ATRASOS_ARRANQUE_MS = [1500, 4000];

/**
 * Estas métricas justificam mexer nas janelas de projeção.
 * `workArea` sozinha não: é efeito colateral de cobrir o ecrã, não causa.
 *
 * @param {string[]|undefined} changedMetrics
 * @returns {boolean}
 */
function metricasRelevantesParaJanelas(changedMetrics) {
  if (!Array.isArray(changedMetrics) || changedMetrics.length === 0) {
    /* Electron por vezes omite a lista. Tratar como relevante para não ignorar um resize. */
    return true;
  }
  return changedMetrics.some(
    (m) => m === 'bounds' || m === 'scaleFactor' || m === 'rotation'
  );
}

/**
 * Liga os três eventos de ecrã com a política acima.
 *
 * @param {import('electron').Screen} screenMod
 * @param {{
 *   aoListaMonitores?: () => void,
 *   aoReorganizarJanelas: (etapa: string) => void,
 * }} handlers
 * @param {{
 *   atrasoRevalidarMs?: number,
 *   debouncePlugMs?: number,
 *   debounceMetricasMs?: number,
 *   atrasosArranqueMs?: number[],
 * }} [opts]
 *   `atrasosArranqueMs` — passagens de rede no arranque; `[]` desliga-as.
 * @returns {() => void} desligar listeners e temporizadores
 */
function ligarTratadorMudancaDisplays(screenMod, handlers, opts = {}) {
  const aoLista = typeof handlers.aoListaMonitores === 'function'
    ? handlers.aoListaMonitores
    : () => {};
  const aoReorganizar = handlers.aoReorganizarJanelas;
  if (typeof aoReorganizar !== 'function') {
    throw new TypeError('ligarTratadorMudancaDisplays: aoReorganizarJanelas é obrigatório');
  }

  const atrasoRevalidar = opts.atrasoRevalidarMs ?? ATRASO_REVALIDAR_APOS_PLUG_MS;
  const debouncePlug = opts.debouncePlugMs ?? DEBOUNCE_PLUG_MS;
  const debounceMetricas = opts.debounceMetricasMs ?? DEBOUNCE_METRICAS_MS;
  const atrasosArranque = Array.isArray(opts.atrasosArranqueMs)
    ? opts.atrasosArranqueMs
    : ATRASOS_ARRANQUE_MS;

  let timerPlug = null;
  let timerRevalidar = null;
  let timerMetricas = null;
  /** @type {Array<ReturnType<typeof setTimeout>>} */
  let timersArranque = [];
  /** @type {Array<[string, Function]>} */
  const listeners = [];

  const dispararLista = () => {
    try { aoLista(); } catch (_) {
      // intencional — quem chama regista o erro
    }
  };
  const dispararReorganizar = (etapa) => {
    try { aoReorganizar(etapa); } catch (_) {
      // intencional
    }
  };

  /* Um evento de ecrã real torna as passagens de arranque redundantes: o caminho do
     evento já reorganiza, e mantê-las só duplicaria varreduras durante o handshake. */
  const cancelarArranque = () => {
    for (const t of timersArranque) clearTimeout(t);
    timersArranque = [];
  };

  const aoPlug = () => {
    cancelarArranque();
    dispararLista();
    if (timerPlug) clearTimeout(timerPlug);
    timerPlug = setTimeout(() => {
      timerPlug = null;
      dispararReorganizar('plug-imediato');
    }, debouncePlug);
    if (timerRevalidar) clearTimeout(timerRevalidar);
    timerRevalidar = setTimeout(() => {
      timerRevalidar = null;
      dispararLista();
      dispararReorganizar('plug-revalidacao');
    }, atrasoRevalidar);
  };

  const aoMetricas = (_event, _display, changedMetrics) => {
    if (!metricasRelevantesParaJanelas(changedMetrics)) return;
    cancelarArranque();
    if (timerMetricas) clearTimeout(timerMetricas);
    timerMetricas = setTimeout(() => {
      timerMetricas = null;
      dispararLista();
      dispararReorganizar('metrics');
    }, debounceMetricas);
  };

  const ligar = (evento, fn) => {
    screenMod.on(evento, fn);
    listeners.push([evento, fn]);
  };

  ligar('display-added', aoPlug);
  ligar('display-removed', aoPlug);
  ligar('display-metrics-changed', aoMetricas);

  timersArranque = atrasosArranque.map((ms, i) => {
    const t = setTimeout(() => {
      dispararLista();
      dispararReorganizar(`arranque-${i + 1}`);
    }, ms);
    if (typeof t.unref === 'function') t.unref();
    return t;
  });

  return () => {
    cancelarArranque();
    if (timerPlug) clearTimeout(timerPlug);
    if (timerRevalidar) clearTimeout(timerRevalidar);
    if (timerMetricas) clearTimeout(timerMetricas);
    timerPlug = null;
    timerRevalidar = null;
    timerMetricas = null;
    for (const [evento, fn] of listeners) {
      try { screenMod.removeListener(evento, fn); } catch (_) {
        // intencional
      }
    }
    listeners.length = 0;
  };
}

module.exports = {
  ATRASO_REVALIDAR_APOS_PLUG_MS,
  DEBOUNCE_PLUG_MS,
  DEBOUNCE_METRICAS_MS,
  ATRASOS_ARRANQUE_MS,
  metricasRelevantesParaJanelas,
  ligarTratadorMudancaDisplays,
};
