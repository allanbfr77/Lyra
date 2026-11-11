/**
 * Contagem regressiva (telão pré-culto): painel, seletor de monitor, controles, aparência e
 * transporte dos comandos. A REGRA (formato dos dígitos, limites, relógio) continua em
 * modules/contagemPainel.js — pura e testável; aqui fica o DOM e o transporte.
 *
 * Extraído de controllerAppCore.js sem mudar o comportamento. O estado da contagem (config, estado
 * espelhado, tick, alvo) é privado deste módulo. A inicialização, que antes era uma função
 * auto-invocada no núcleo, virou `iniciarContagemRegressivaPainel()`, chamada pelo núcleo no mesmo
 * ponto da ordem de inicialização. As dependências do núcleo entram por
 * `registrarDependenciasContagem`, chamado no topo do núcleo.
 */
import { AJUSTE_CONTAGEM_MS, LS_CONTAGEM_ALVO, LS_CONTAGEM_CFG, LS_CONTAGEM_MONITOR, LS_CONTAGEM_ULTIMO_TEMPO, PRESETS_CONTAGEM_MIN, acabouDeZerar, acaoBotaoPrincipal, ancorarContagem, camposParaMs, clonarCfgContagemPadrao, comandoAjustarContagem, comandoAparenciaContagem, comandoControloContagem, comandoIniciarContagem, estadoContagemVazio, formatarContagem, msParaCampos, normalizarCfgContagem, restanteLocalMs, situacaoContagem } from '../modules/contagemPainel.js';
import { appConfirm } from './appDialog.js';
import { estadoPainel, projecao } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas
 * a cada uso, porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasContagem(d) {
  dep = d || {};
}
const abrirCfgModal = (...a) => dep.abrirCfgModal(...a);
const carregarRoteamentoTelasDoServidor = (...a) => dep.carregarRoteamentoTelasDoServidor(...a);
const definirEstadoBtnModoCabecalho = (...a) => dep.definirEstadoBtnModoCabecalho(...a);
const fecharMenusRoteamentoTelas = (...a) => dep.fecharMenusRoteamentoTelas(...a);
const getChkVal = (...a) => dep.getChkVal(...a);
const getServidorProjeccaoIp = (...a) => dep.getServidorProjeccaoIp(...a);
const indicesPadraoPublicoMinistranteApresentacao = (...a) => dep.indicesPadraoPublicoMinistranteApresentacao(...a);
const lerNumeroInput = (...a) => dep.lerNumeroInput(...a);
const listaMonitoresParaProjecao = (...a) => dep.listaMonitoresParaProjecao(...a);
const montarLabelMonitor = (...a) => dep.montarLabelMonitor(...a);
const montarTitleMonitor = (...a) => dep.montarTitleMonitor(...a);
const normalizarRota = (...a) => dep.normalizarRota(...a);
const rotaDesativada = (...a) => dep.rotaDesativada(...a);
const salvarRoteamentoTelasNoServidor = (...a) => dep.salvarRoteamentoTelasNoServidor(...a);
const sanitizarRotaProjecao = (...a) => dep.sanitizarRotaProjecao(...a);
const setChkVal = (...a) => dep.setChkVal(...a);
const setInputVal = (...a) => dep.setInputVal(...a);
const setSelVal = (...a) => dep.setSelVal(...a);
const setSpanText = (...a) => dep.setSpanText(...a);

/* ═══════════════════════════════════════════════════════════════════════════
   SECÇÃO I — Contagem regressiva (telão pré-culto)

   Duas peças, e a divisão entre elas é deliberada:

   - a REGRA — formato dos dígitos, limites da config, relógio do painel — vive em
     `modules/contagemPainel.js`, pura e testável. Conta localmente pelo mesmo motivo que
     o telão conta: emitir um pacote por segundo só para alimentar uma leitura seria pagar
     rede por uma conta que os dois lados sabem fazer;
   - o que sobra aqui é DOM e transporte.

   A regra de FORMATO existe em duplicado — aqui em ES module, e no Core em CommonJS. Não
   por descuido: o painel corre com `sandbox: true`, e um preload sandboxed só alcança
   `require('electron')`, nunca `node_modules` — não há ponte possível para o Core. É o
   mesmo obstáculo que `comentariosSlide` já tinha, e a mesma resposta. O que impede as
   duas cópias de divergirem em silêncio é `contagemPainel.paridade.test.mjs`, que as
   compara em toda a grelha de durações e configurações.

   A aparência persiste no `localStorage` deste painel, como a do aviso do card 6 — não em
   `displayConfig`. São conjuntos separados: a contagem tem fundo e tipografia próprios, e
   metê-la nas camadas de Slides/Bíblia obrigaria a mexer no merge de config que o modo
   Bíblia e o modo Slides já partilham com cuidado.
   ═══════════════════════════════════════════════════════════════════════════ */

let contagemCfg = clonarCfgContagemPadrao();

/** Espelho do que o painel sabe da contagem que mandou projetar. */
let contagemEstadoPainel = estadoContagemVazio();

/** Tick do mostrador do painel. Só corre com o modal aberto e a contagem a andar. */
let contagemTickPainel = null;

/**
 * Restante do tick anterior, para detectar a passagem por zero uma vez só.
 *
 * Sem esta memória, «encerrar ao zerar» dispararia um `encerrar_contagem` a cada 200 ms
 * depois do zero. Ver `acabouDeZerar` em `modules/contagemPainel.js`.
 */
let contagemRestanteUltimoTick = 0;

function agoraPainelMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function formatarContagemPainel(ms) {
  return formatarContagem(ms, contagemCfg);
}

// ── Persistência da aparência ─────────────────────────────────────────────

/**
 * Espera entre a última mexida e o trabalho pesado.
 *
 * Um `oninput` de slider dispara por pixel arrastado. Sem esta pausa, arrastar o tamanho
 * da fonte de 8 para 30 vh gravaria no `localStorage` e faria um POST — com a imagem de
 * fundo em Base64 a reboque — algumas dezenas de vezes por segundo. Mesmo número do
 * aviso do card 6, pelo mesmo motivo.
 */
const CONTAGEM_DEBOUNCE_MS = 120;

let contagemPersistirTimer = null;

/**
 * Grava a aparência e, se houver contagem no ar, leva-a ao telão — uma vez só, depois de
 * o operador parar de mexer.
 *
 * @param {{ imediato?: boolean }} [opts] `imediato` para acções discretas (escolher uma
 *   imagem, restaurar o padrão), onde não há rajada a absorver e esperar só atrasa.
 */
function persistirCfgContagem(opts = {}) {
  const aplicar = () => {
    contagemPersistirTimer = null;
    salvarContagemCfgNoStorage();
    if (contagemEstadoPainel.noAr) {
      void enviarComandoContagem(comandoAparenciaContagem(contagemCfg), { silencioso: true });
    }
  };
  clearTimeout(contagemPersistirTimer);
  if (opts.imediato) {
    aplicar();
    return;
  }
  contagemPersistirTimer = setTimeout(aplicar, CONTAGEM_DEBOUNCE_MS);
}

function salvarContagemCfgNoStorage() {
  try {
    localStorage.setItem(LS_CONTAGEM_CFG, JSON.stringify(contagemCfg));
  } catch (_) {
    // intencional — erro ignorado
  }
}

function carregarContagemCfgDoStorage() {
  try {
    const raw = localStorage.getItem(LS_CONTAGEM_CFG);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') contagemCfg = normalizarCfgContagem(parsed);
  } catch (_) {
    // intencional — erro ignorado
  }
}

/**
 * O último tempo digitado sobrevive ao fecho do app; o tempo A CORRER não.
 *
 * Reabrir o Lyra e encontrar uma contagem viva seria pior do que inútil: ela teria
 * continuado a descontar durante o tempo em que o app esteve fechado, e apareceria já
 * vencida. O que o operador quer de volta é o «15 minutos» que costuma usar.
 */
function salvarUltimoTempoContagem(ms) {
  try {
    localStorage.setItem(LS_CONTAGEM_ULTIMO_TEMPO, String(Math.max(0, Math.round(ms) || 0)));
  } catch (_) {
    // intencional — erro ignorado
  }
}

function carregarUltimoTempoContagem() {
  try {
    const n = Number(localStorage.getItem(LS_CONTAGEM_ULTIMO_TEMPO));
    return Number.isFinite(n) && n > 0 ? n : 5 * 60_000;
  } catch (_) {
    return 5 * 60_000;
  }
}

// ── Formulário de Ajustes › Contagem ──────────────────────────────────────

export function fundoCssPreviewContagem(cfg) {
  if (cfg.bgType === 'gradient') return cfg.bgGradient || '#000000';
  if (cfg.bgType === 'image' && cfg.bgImage) {
    return `url('${String(cfg.bgImage).replace(/'/g, '%27')}') center/cover no-repeat`;
  }
  return cfg.bgColor || '#000000';
}

/** Prévia da aba: o mesmo desenho do telão, em miniatura e com um tempo de exemplo. */
function atualizarPreviewContagem() {
  const box = document.getElementById('cfg-contagem-preview');
  if (!box) return;
  const cfg = contagemCfg;
  box.style.background = fundoCssPreviewContagem(cfg);
  box.style.justifyContent =
    cfg.verticalPosition === 'top'
      ? 'flex-start'
      : cfg.verticalPosition === 'bottom'
        ? 'flex-end'
        : 'center';

  const topo = document.getElementById('cfg-contagem-preview-topo');
  if (topo) {
    topo.textContent = cfg.mensagemTopo || '';
    topo.style.color = cfg.mensagemTopoColor;
    topo.style.fontFamily = cfg.fontFamily;
  }
  const rodape = document.getElementById('cfg-contagem-preview-rodape');
  if (rodape) {
    rodape.textContent = cfg.mensagemRodape || '';
    rodape.style.color = cfg.mensagemRodapeColor;
    rodape.style.fontFamily = cfg.fontFamily;
  }
  const dig = document.getElementById('cfg-contagem-preview-dig');
  if (dig) {
    /* Cinco minutos de exemplo: mostra o formato escolhido sem depender de haver uma
       contagem no ar, e é o preset mais usado. */
    dig.textContent = formatarContagem(5 * 60_000, cfg);
    dig.style.color = cfg.textColor;
    dig.style.fontFamily = cfg.fontFamily;
    dig.style.fontWeight = cfg.negrito ? '700' : '400';
    dig.style.letterSpacing = `${cfg.letterSpacing}em`;
  }
}

function atualizarVisibilidadeFundoContagem() {
  const tipo = contagemCfg.bgType;
  const mostrar = (id, cond) => {
    const el = document.getElementById(id);
    if (el) el.style.display = cond ? '' : 'none';
  };
  mostrar('cfg-contagem-bg-solid-wrap', tipo === 'solid');
  mostrar('cfg-contagem-bg-gradient-wrap', tipo === 'gradient');
  mostrar('cfg-contagem-bg-image-wrap', tipo === 'image');
  mostrar('cfg-contagem-bg-image-limpar-wrap', tipo === 'image' && !!contagemCfg.bgImage);

  const nome = document.getElementById('cfg-contagem-bg-image-nome');
  if (nome) {
    nome.textContent = contagemCfg.bgImage
      ? 'Imagem carregada — «Escolher imagem…» substitui.'
      : 'Nenhuma imagem escolhida.';
  }
}

export function popularFormCfgContagem() {
  const cfg = contagemCfg;
  setSelVal('cfg-contagem-bg-type', cfg.bgType);
  setInputVal('cfg-contagem-bg-color', cfg.bgColor);
  setInputVal('cfg-contagem-bg-gradient', cfg.bgGradient);
  setSelVal('cfg-contagem-fontfamily', cfg.fontFamily);
  setInputVal('cfg-contagem-fontsize', cfg.fontSize);
  setSpanText('cfg-contagem-fontsize-val', String(cfg.fontSize));
  setInputVal('cfg-contagem-text-color', cfg.textColor);
  setChkVal('cfg-contagem-negrito', cfg.negrito);
  setInputVal('cfg-contagem-letterspacing', cfg.letterSpacing);
  setSpanText('cfg-contagem-letterspacing-val', String(cfg.letterSpacing));
  setInputVal('cfg-contagem-topo-size', cfg.mensagemTopoFontSize);
  setSpanText('cfg-contagem-topo-size-val', String(cfg.mensagemTopoFontSize));
  setInputVal('cfg-contagem-topo-color', cfg.mensagemTopoColor);
  setInputVal('cfg-contagem-rodape-size', cfg.mensagemRodapeFontSize);
  setSpanText('cfg-contagem-rodape-size-val', String(cfg.mensagemRodapeFontSize));
  setInputVal('cfg-contagem-rodape-color', cfg.mensagemRodapeColor);
  setSelVal('cfg-contagem-mostrar-horas', cfg.mostrarHoras);
  setChkVal('cfg-contagem-mostrar-segundos', cfg.mostrarSegundos);
  setInputVal('cfg-contagem-alerta-segundos', cfg.alertaSegundos);
  setSpanText('cfg-contagem-alerta-val', String(cfg.alertaSegundos));
  setInputVal('cfg-contagem-alerta-color', cfg.alertaColor);
  setChkVal('cfg-contagem-piscar', cfg.piscarNoFinal);
  setSelVal('cfg-contagem-ao-zerar', cfg.aoZerar);
  setInputVal('cfg-contagem-texto-final', cfg.textoFinal);

  const grupo = document.getElementById('cfg-contagem-posy-group');
  if (grupo) {
    grupo.querySelectorAll('.cfg-btn-pos').forEach((b) => {
      b.classList.toggle('ativo', b.dataset.val === cfg.verticalPosition);
    });
  }

  atualizarVisibilidadeFundoContagem();
  atualizarPreviewContagem();
}

function lerCfgContagemDoFormulario() {
  const el = (id) => document.getElementById(id);
  return normalizarCfgContagem({
    ...contagemCfg,
    bgType: el('cfg-contagem-bg-type')?.value,
    bgColor: el('cfg-contagem-bg-color')?.value,
    bgGradient: el('cfg-contagem-bg-gradient')?.value,
    /* A imagem não vem do formulário: o `<input type=file>` não a devolve depois de lida.
       Fica no estado, e sai de lá por «Remover» ou por outra escolha de ficheiro. */
    bgImage: contagemCfg.bgImage,
    fontFamily: el('cfg-contagem-fontfamily')?.value,
    fontSize: lerNumeroInput('cfg-contagem-fontsize', contagemCfg.fontSize),
    textColor: el('cfg-contagem-text-color')?.value,
    negrito: getChkVal('cfg-contagem-negrito'),
    letterSpacing: lerNumeroInput('cfg-contagem-letterspacing', contagemCfg.letterSpacing),
    mensagemTopoFontSize: lerNumeroInput('cfg-contagem-topo-size', contagemCfg.mensagemTopoFontSize),
    mensagemTopoColor: el('cfg-contagem-topo-color')?.value,
    mensagemRodapeFontSize: lerNumeroInput(
      'cfg-contagem-rodape-size',
      contagemCfg.mensagemRodapeFontSize
    ),
    mensagemRodapeColor: el('cfg-contagem-rodape-color')?.value,
    mostrarHoras: el('cfg-contagem-mostrar-horas')?.value,
    mostrarSegundos: getChkVal('cfg-contagem-mostrar-segundos'),
    alertaSegundos: lerNumeroInput('cfg-contagem-alerta-segundos', contagemCfg.alertaSegundos),
    alertaColor: el('cfg-contagem-alerta-color')?.value,
    piscarNoFinal: getChkVal('cfg-contagem-piscar'),
    aoZerar: el('cfg-contagem-ao-zerar')?.value,
    textoFinal: el('cfg-contagem-texto-final')?.value,
  });
}

/**
 * Grava a aparência e, se houver contagem no ar, leva-a ao telão sem tocar no tempo.
 *
 * O comando de aparência não fala de duração — é assim que o host sabe herdar a contagem
 * que já corre em vez de a reiniciar. Ver `comandoAparenciaContagem`.
 */
export function onContagemCfgChange() {
  contagemCfg = lerCfgContagemDoFormulario();
  atualizarVisibilidadeFundoContagem();
  atualizarPreviewContagem();
  sincronizarCamposMensagemContagem();
  persistirCfgContagem();
}

export function setPosContagemCtrl(val) {
  contagemCfg = normalizarCfgContagem({ ...contagemCfg, verticalPosition: val });
  popularFormCfgContagem();
  persistirCfgContagem({ imediato: true });
}

export async function onContagemBgImagemChange() {
  const input = document.getElementById('cfg-contagem-bg-image');
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(r.error || new Error('falha a ler a imagem'));
      r.readAsDataURL(file);
    });
    contagemCfg = normalizarCfgContagem({ ...contagemCfg, bgType: 'image', bgImage: dataUrl });
    popularFormCfgContagem();
    persistirCfgContagem({ imediato: true });
  } catch (e) {
    alert(`Não foi possível carregar a imagem: ${e?.message || e}`);
  } finally {
    /* Limpar o input permite reescolher o MESMO ficheiro (o `change` não dispara duas
       vezes para o mesmo valor). */
    if (input) input.value = '';
  }
}

export function limparImagemFundoContagem() {
  contagemCfg = normalizarCfgContagem({ ...contagemCfg, bgImage: '', bgType: 'solid' });
  popularFormCfgContagem();
  persistirCfgContagem({ imediato: true });
}

export async function restaurarPadraoContagem() {
  const ok = await appConfirm('Restaurar toda a aparência da contagem aos valores de fábrica?');
  if (!ok) return;
  contagemCfg = clonarCfgContagemPadrao();
  popularFormCfgContagem();
  sincronizarCamposMensagemContagem();
  persistirCfgContagem({ imediato: true });
}

// ── Transporte ────────────────────────────────────────────────────────────

/**
 * Manda um comando de contagem ao motor de projeção.
 *
 * Por HTTP e não pela porta de projeção, pelo mesmo motivo de `emitirApresentacao`: a
 * config pode trazer uma imagem de fundo em Base64, e o Socket.IO corta pacotes acima de
 * ~1 MB derrubando a ligação — o operador veria «DESCONECTADO» ao escolher um fundo.
 *
 * `silencioso` existe para os comandos que o operador não pediu explicitamente (o slider
 * do Ajustes a arrastar): falhar aí não merece um alerta modal por cima do formulário.
 *
 * @param {object} payload
 * @param {{ silencioso?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
async function enviarComandoContagem(payload, opts = {}) {
  const ip = getServidorProjeccaoIp();
  if (!ip) {
    if (!opts.silencioso) alert('Sem servidor de projeção para receber a contagem.');
    return false;
  }
  try {
    const r = await fetch(`http://${ip}:5510/api/comando/exibir_contagem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      /* O alvo entra aqui, e não em cada fábrica de payload: é estado do painel, igual
         para «definir», «pausar» e «ajustar», e um comando que o esquecesse tiraria a
         contagem do palco sem ninguém a pedir. `payload` sobrepõe-se, para quem precise. */
      body: JSON.stringify({ alvo: contagemAlvoPainel, ...(payload || {}) }),
    });
    if (r.ok) return true;
    /*
     * 400 é a regra a recusar-se — pausar sem contagem no ar, por exemplo. Acontece
     * legitimamente quando o painel e o host se desencontram (outro operador encerrou a
     * contagem daqui a pouco). Ressincroniza em vez de acusar o operador de um erro.
     */
    if (r.status === 400) {
      contagemEstadoPainel = estadoContagemVazio();
      renderPainelContagem();
      void salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
      return false;
    }
    throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    if (!opts.silencioso) {
      alert(
        'Não foi possível falar com o servidor de projeção (porta 5510).\n\n' +
          String(e?.message || e)
      );
    }
    return false;
  }
}

async function enviarEncerrarContagem() {
  const ip = getServidorProjeccaoIp();
  if (!ip) return false;
  try {
    const r = await fetch(`http://${ip}:5510/api/comando/encerrar_contagem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return r.ok;
  } catch (_) {
    return false;
  }
}

// ── Painel do operador ────────────────────────────────────────────────────

function sincronizarCamposMensagemContagem() {
  const topo = document.getElementById('contagem-msg-topo');
  const rodape = document.getElementById('contagem-msg-rodape');
  if (topo && document.activeElement !== topo) topo.value = contagemCfg.mensagemTopo || '';
  if (rodape && document.activeElement !== rodape) rodape.value = contagemCfg.mensagemRodape || '';
}

/**
 * Destaque do botão no cabeçalho.
 *
 * Usa o mesmo helper dos restantes modos, e não um `setAttribute` à parte: com a contagem
 * no ar o telão está coberto, e o operador tem de ver isso na barra sem abrir o painel.
 */
function atualizarBtnContagemCabecalho() {
  definirEstadoBtnModoCabecalho(
    'btn-modo-contagem',
    contagemEstadoPainel.noAr,
    'CONTAGEM NO AR — clique para pausar, ajustar ou encerrar',
    'CONTAGEM REGRESSIVA — tempo para o culto começar'
  );
}

const ROTULOS_SITUACAO_CONTAGEM = {
  parada: 'Parada',
  'no-ar': 'No ar',
  pausada: 'Pausada',
  zerada: 'Chegou a zero',
};

function pararTickPainelContagem() {
  if (contagemTickPainel) {
    clearInterval(contagemTickPainel);
    contagemTickPainel = null;
  }
}

/**
 * Redesenha o mostrador e o estado dos botões.
 *
 * Chamada tanto pelo tick como por cada resposta do host — é o único sítio que escreve
 * neste pedaço de DOM, o que evita dois caminhos a discordarem sobre o que mostrar.
 */
function renderPainelContagem() {
  const agora = agoraPainelMs();
  const restante = restanteLocalMs(contagemEstadoPainel, agora);
  const situacao = situacaoContagem(contagemEstadoPainel, agora);

  const textoTempo = contagemEstadoPainel.noAr
    ? formatarContagemPainel(restante)
    : formatarContagemPainel(camposParaMs(lerCampoContagem('minutos'), lerCampoContagem('segundos')) ?? 0);
  const zerada = situacao === 'zerada';

  const valor = document.getElementById('contagem-mostrador-valor');
  if (valor) valor.textContent = textoTempo;

  const headTempo = document.getElementById('contagem-head-tempo');
  if (headTempo) {
    headTempo.textContent = textoTempo;
    headTempo.classList.toggle('zerada', zerada);
  }

  const mostrador = document.getElementById('contagem-mostrador');
  if (mostrador) mostrador.classList.toggle('zerada', zerada);

  const badge = document.getElementById('contagem-situacao');
  if (badge) {
    badge.dataset.situacao = situacao;
    badge.textContent = ROTULOS_SITUACAO_CONTAGEM[situacao] || situacao;
  }

  const principal = document.getElementById('contagem-btn-principal');
  if (principal) principal.textContent = acaoBotaoPrincipal(contagemEstadoPainel, agora).rotulo;

  const noAr = contagemEstadoPainel.noAr;
  ['contagem-btn-encerrar', 'contagem-btn-menos', 'contagem-btn-mais', 'contagem-btn-reiniciar'].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !noAr;
    }
  );

  atualizarBtnContagemCabecalho();
  atualizarAlertaRotaContagem();
  sincronizarSeletorMonitorContagem();
}

/** Um tick só, partilhado pelo mostrador e pela deteção de «chegou a zero». */
function tickPainelContagem() {
  const restante = restanteLocalMs(contagemEstadoPainel, agoraPainelMs());
  const zerouAgora = acabouDeZerar(contagemRestanteUltimoTick, restante);
  contagemRestanteUltimoTick = restante;

  renderPainelContagem();

  if (!zerouAgora) return;
  /*
   * «Encerrar ao zerar» é decidido AQUI, e não no telão.
   *
   * O telão sabe desenhar, não sabe comandar — e são vários (telão, TV, OBS): se cada um
   * mandasse encerrar ao chegar a zero, o mesmo comando atravessaria a rede N vezes. O
   * painel é um só e é quem opera; a decisão é dele.
   */
  if (contagemCfg.aoZerar === 'encerrar' && contagemEstadoPainel.noAr) {
    void encerrarContagemDoPainel();
  }
}

function garantirTickPainelContagem() {
  pararTickPainelContagem();
  const modal = document.getElementById('contagem-backdrop');
  const aberto = modal?.classList.contains('aberto');
  const precisaContar = contagemEstadoPainel.noAr && contagemEstadoPainel.rodando;
  /* Com o modal fechado o tick continua enquanto a contagem corre — é o que permite ao
     modo «encerrar ao zerar» funcionar com o operador noutra aba do painel. */
  if (!aberto && !precisaContar) return;
  contagemTickPainel = setInterval(tickPainelContagem, 200);
}

function lerCampoContagem(qual) {
  const el = document.getElementById(qual === 'minutos' ? 'contagem-minutos' : 'contagem-segundos');
  return el ? el.value : '';
}

/**
 * Onde a Contagem está a ir — só o monitor do próprio Contador.
 *
 * Não lê o seletor do cabeçalho nem a rota do modo aberto (Bíblia, Slides, Mídias).
 * Cada modo controla o seu monitor; a Contagem não reage aos dos outros.
 *
 * @returns {{ estado: 'ok'|'sem-monitor', rotulo?: string }}
 */
function situacaoRotaContagem() {
  const r = normalizarRota(estadoPainel.rotasPorModo.contagem);
  return { estado: r.publicoIndex >= 0 ? 'ok' : 'sem-monitor' };
}

function atualizarAlertaRotaContagem() {
  const el = document.getElementById('contagem-alerta-rota');
  const texto = document.getElementById('contagem-alerta-rota-texto');
  if (!el || !texto) return;

  const { estado } = situacaoRotaContagem();
  el.hidden = estado === 'ok';
  if (estado === 'ok') return;

  texto.textContent =
    'Nenhum monitor está seleccionado para a contagem — escolha um abaixo. ' +
    'Este seletor é só do Contador e não altera o monitor da Bíblia, dos Slides ou das Mídias.';
}

/**
 * Para onde a contagem é enviada: só o telão, ou telão e monitor do ministrante.
 *
 * Preferência de uso, não de hardware — por isso persiste como a aparência, e não como a
 * rota dos outros modos. É sanitizada na leitura: um «ambos» guardado num culto com dois
 * monitores não pode sobreviver a um culto onde só há um.
 */
let contagemAlvoPainel = 'publico';

export function normalizarAlvoContagemPainel(v) {
  return String(v ?? '').toLowerCase() === 'ambos' ? 'ambos' : 'publico';
}

function carregarAlvoContagemDoStorage() {
  try {
    contagemAlvoPainel = normalizarAlvoContagemPainel(localStorage.getItem(LS_CONTAGEM_ALVO));
  } catch (_) {
    contagemAlvoPainel = 'publico';
  }
}

function salvarAlvoContagemNoStorage() {
  try {
    localStorage.setItem(LS_CONTAGEM_ALVO, contagemAlvoPainel);
  } catch (_) {
  // intencional — erro ignorado
}
}

function carregarRotaContagemDoStorage() {
  try {
    const raw = localStorage.getItem(LS_CONTAGEM_MONITOR);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return;
    estadoPainel.rotasPorModo.contagem = normalizarRota(p);
  } catch (_) {
    estadoPainel.rotasPorModo.contagem = rotaDesativada();
  }
}

function salvarRotaContagemNoStorage() {
  try {
    localStorage.setItem(LS_CONTAGEM_MONITOR, JSON.stringify(normalizarRota(estadoPainel.rotasPorModo.contagem)));
  } catch (_) {
  // intencional — erro ignorado
}
}

/**
 * Pin enviado ao servidor: só com a Contagem no ar.
 *
 * Parada, o pin fica a −1 para não roubar monitores aos outros modos. A escolha do
 * operador continua em `rotasPorModo.contagem` / localStorage para a próxima vez.
 */
export function rotaContagemParaServidor() {
  if (!contagemEstadoPainel || !contagemEstadoPainel.noAr) {
    return { publicoIndex: -1, ministranteIndex: -1 };
  }
  const c = sanitizarRotaProjecao(normalizarRota(estadoPainel.rotasPorModo.contagem), estadoPainel.monitoresServidorCache);
  if (contagemAlvoPainel === 'ambos') {
    const { iPub, iMin } = indicesPadraoPublicoMinistranteApresentacao(estadoPainel.monitoresServidorCache);
    return {
      publicoIndex: c.publicoIndex >= 0 ? c.publicoIndex : iPub,
      ministranteIndex: c.ministranteIndex >= 0 ? c.ministranteIndex : iMin,
    };
  }
  return { publicoIndex: c.publicoIndex, ministranteIndex: -1 };
}

/**
 * Escolha do monitor da Contagem — só dela, sem tocar no cabeçalho nem noutros modos.
 *
 * ## Porquê um seletor próprio
 *
 * As tentativas que escreviam no dropdown do cabeçalho faziam a Contagem herdar a rota
 * do modo aberto: abrir a Bíblia no M2 ou Live «movia» a Contagem ou mostrava o aviso
 * vermelho. O Contador tem de ignorar por completo o monitor dos outros modos.
 *
 * @param {object} opcao Uma entrada de `opcoesMonitorContagem()`.
 */
async function definirMonitorDoTelaoDaContagem(opcao) {
  const o = opcao && typeof opcao === 'object' ? opcao : {};

  estadoPainel.rotasPorModo.contagem = normalizarRota({
    publicoIndex: o.publicoIndex ?? -1,
    ministranteIndex: Number.isFinite(o.ministranteIndex) ? o.ministranteIndex : -1,
    live: false,
  });
  contagemAlvoPainel = normalizarAlvoContagemPainel(o.alvo);
  salvarAlvoContagemNoStorage();
  salvarRotaContagemNoStorage();

  /* Propaga o pin (ou limpa-o se a Contagem não está no ar) sem alterar seletores
     de Bíblia/Slides/Mídias na UI. */
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });

  if (contagemEstadoPainel && contagemEstadoPainel.noAr) {
    void enviarComandoContagem(comandoAparenciaContagem(contagemCfg), { silencioso: true });
  }

  renderSeletorMonitorContagem();
  renderPainelContagem();
}

/** Índice do monitor escolhido no painel do Contador, ou `-1`. */
function indiceMonitorPublicoAtual() {
  const r = normalizarRota(estadoPainel.rotasPorModo.contagem);
  return Number.isFinite(r.publicoIndex) ? r.publicoIndex : -1;
}

/**
 * Qual opção do seletor está em vigor — só a preferência do Contador.
 */
function chaveMonitorSelecionadoContagem() {
  const pub = indiceMonitorPublicoAtual();
  if (contagemAlvoPainel === 'ambos') {
    const ambos = opcoesMonitorContagem().find((o) => o.chave === 'ambos');
    if (ambos && ambos.publicoIndex === pub) return 'ambos';
  }
  return String(pub);
}

/**
 * Opções do seletor: «Não exibir», cada monitor de projeção, e «Ambos» quando há dois.
 *
 * «Ambos» usa os mesmos índices que o resto do app trata como telão e ministrante
 * (`indicesPadraoPublicoMinistranteApresentacao` — Monitor 2 e Monitor 3, na convenção do
 * Lyra), para a contagem não inventar um arranjo de ecrãs próprio.
 */
function opcoesMonitorContagem() {
  const lista = listaMonitoresParaProjecao(estadoPainel.monitoresServidorCache);
  const out = [
    {
      chave: '-1',
      publicoIndex: -1,
      alvo: 'publico',
      label: 'Não exibir',
      title: 'Sem telão — a contagem não aparece em monitor nenhum.',
    },
  ];

  lista.forEach((m) => {
    out.push({
      chave: String(m.index),
      publicoIndex: m.index,
      alvo: 'publico',
      label: montarLabelMonitor(m),
      title: montarTitleMonitor(m),
    });
  });

  const { iPub, iMin } = indicesPadraoPublicoMinistranteApresentacao(estadoPainel.monitoresServidorCache);
  if (iPub >= 0 && iMin >= 0 && iPub !== iMin) {
    out.push({
      chave: 'ambos',
      publicoIndex: iPub,
      ministranteIndex: iMin,
      alvo: 'ambos',
      label: `Ambos — Monitor ${iPub + 1} e Monitor ${iMin + 1}`,
      title:
        'A mesma contagem no telão e no monitor do ministrante, com os mesmos dígitos ao ' +
        'mesmo tempo.',
    });
  }

  return out;
}

export function renderSeletorMonitorContagem() {
  const host = document.getElementById('contagem-monitores');
  if (!host) return;

  const opcoes = opcoesMonitorContagem();
  const atual = chaveMonitorSelecionadoContagem();
  host.innerHTML = '';

  const sel = document.createElement('select');
  sel.id = 'contagem-monitor-select';
  sel.className = 'contagem-monitor-select';
  sel.setAttribute('aria-labelledby', 'contagem-monitor-rotulo');
  opcoes.forEach((o) => {
    const op = document.createElement('option');
    op.value = o.chave;
    op.textContent = o.chave === '-1' ? 'Nenhum monitor selecionado' : o.label;
    if (o.title) op.title = o.title;
    sel.appendChild(op);
  });
  sel.value = atual;
  sel.classList.toggle('sem-monitor', sel.value === '-1');
  sel.addEventListener('change', () => {
    const escolhida = opcoesMonitorContagem().find((o) => o.chave === sel.value);
    if (escolhida) void definirMonitorDoTelaoDaContagem(escolhida);
  });
  host.appendChild(sel);

  /* Só «Não exibir» significa que não há para onde projetar — dizer isso é mais útil do
     que oferecer uma lista de um item que não leva a lado nenhum. */
  if (opcoes.length <= 1) {
    const ajuda = document.createElement('div');
    ajuda.className = 'contagem-ajuda';
    ajuda.textContent =
      'Só foi encontrado o monitor principal. Ligue um segundo monitor ou projetor e reabra este painel.';
    host.appendChild(ajuda);
  }
}

/**
 * Acerta o valor do seletor sem reconstruir o DOM.
 *
 * Corre a cada tick do painel (cinco vezes por segundo), e é por isso que não recria o
 * <select>: recriá-lo fecharia a lista aberta e tiraria o foco. Só quando a própria lista
 * de monitores muda — alguém ligou um projetor com o painel aberto — é que vale a pena
 * redesenhar.
 */
function sincronizarSeletorMonitorContagem() {
  const host = document.getElementById('contagem-monitores');
  if (!host) return;

  const sel = host.querySelector('select.contagem-monitor-select');
  const opcoes = opcoesMonitorContagem();
  if (!sel || sel.options.length !== opcoes.length) {
    renderSeletorMonitorContagem();
    return;
  }
  const atual = chaveMonitorSelecionadoContagem();
  if (sel.value !== atual) sel.value = atual;
  sel.classList.toggle('sem-monitor', sel.value === '-1');
}

/**
 * Abre o painel, ou fecha-o se já estiver aberto.
 *
 * O botão do cabeçalho continua a alternar mesmo com o fecho por clique fora: é a saída
 * óbvia para quem acabou de o abrir e ainda tem o rato lá.
 */
export function alternarPainelContagem() {
  const modal = document.getElementById('contagem-backdrop');
  if (modal?.classList.contains('aberto')) {
    fecharPainelContagem();
    return;
  }
  abrirPainelContagem();
}

export function abrirPainelContagem() {
  const modal = document.getElementById('contagem-backdrop');
  if (!modal) return;

  if (!contagemEstadoPainel.noAr) {
    const campos = msParaCampos(carregarUltimoTempoContagem());
    setInputVal('contagem-minutos', campos.minutos);
    setInputVal('contagem-segundos', campos.segundos);
  }
  sincronizarCamposMensagemContagem();
  atualizarAlertaRotaContagem();
  renderSeletorMonitorContagem();
  /* Painel aberto antes de o cabeçalho ter falado com o servidor: sem isto, a lista de
     monitores ficaria vazia até o operador ir a outro modo e voltar. */
  if (!listaMonitoresParaProjecao(estadoPainel.monitoresServidorCache).length) {
    void carregarRoteamentoTelasDoServidor().then(() => renderSeletorMonitorContagem());
  }

  modal.classList.add('aberto');
  modal.setAttribute('aria-hidden', 'false');
  /* Reabrir sempre expandido: a barra compacta é uma escolha da sessão actual. */
  definirPainelContagemRetraido(false);
  renderPainelContagem();
  garantirTickPainelContagem();
}

export function fecharPainelContagem() {
  const modal = document.getElementById('contagem-backdrop');
  if (!modal) return;
  modal.classList.remove('aberto');
  modal.setAttribute('aria-hidden', 'true');
  definirPainelContagemRetraido(false);
  atualizarBtnContagemCabecalho();
  garantirTickPainelContagem();
}

/**
 * Barra compacta: só o cabeçalho fica visível, com o cronómetro ao lado do título.
 * Não mexe no estado da contagem — o tick e o telão continuam iguais.
 */
function definirPainelContagemRetraido(retraido) {
  const painel = document.querySelector('#contagem-backdrop .contagem-painel');
  const btn = document.getElementById('contagem-retrair');
  const on = !!retraido;
  if (painel) painel.classList.toggle('retraido', on);
  if (btn) {
    btn.setAttribute('aria-expanded', on ? 'false' : 'true');
    btn.setAttribute('aria-label', on ? 'Expandir painel' : 'Retrair painel');
    btn.title = on ? 'Expandir painel' : 'Retrair painel';
  }
}

function alternarRetrairPainelContagem() {
  const painel = document.querySelector('#contagem-backdrop .contagem-painel');
  if (!painel) return;
  definirPainelContagemRetraido(!painel.classList.contains('retraido'));
  /* Garante dígitos frescos no cabeçalho no instante da retração. */
  renderPainelContagem();
}

/** Aplica ao estado local a resposta do host e volta a desenhar. */
function registarContagemNoAr(payload) {
  contagemEstadoPainel = ancorarContagem(payload, agoraPainelMs());
  contagemRestanteUltimoTick = restanteLocalMs(contagemEstadoPainel, agoraPainelMs());
  renderPainelContagem();
  garantirTickPainelContagem();
}

async function iniciarContagemDoPainel() {
  /* `camposParaMs` devolve `null` (os dois campos vazios) ou um número — daí o `===`. */
  const ms = camposParaMs(lerCampoContagem('minutos'), lerCampoContagem('segundos'));
  if (ms === null) {
    alert('Escreva quantos minutos (e segundos) a contagem deve durar.');
    return;
  }
  if (ms <= 0) {
    alert('A contagem precisa de pelo menos um segundo.');
    return;
  }
  if (situacaoRotaContagem().estado !== 'ok') {
    alert('Escolha um monitor para a contagem antes de iniciar.');
    return;
  }
  salvarUltimoTempoContagem(ms);
  /* Marca noAr antes do pin: `rotaContagemParaServidor` só envia monitores com Contagem activa. */
  contagemEstadoPainel = ancorarContagem(
    { rodando: true, restanteMs: ms, duracaoMs: ms },
    agoraPainelMs()
  );
  contagemRestanteUltimoTick = restanteLocalMs(contagemEstadoPainel, agoraPainelMs());
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
  const ok = await enviarComandoContagem(comandoIniciarContagem(ms, contagemCfg));
  if (!ok) {
    contagemEstadoPainel = estadoContagemVazio();
    contagemRestanteUltimoTick = 0;
    void salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
    renderPainelContagem();
    garantirTickPainelContagem();
    return;
  }
  renderPainelContagem();
  garantirTickPainelContagem();
}

async function alternarPausaContagemDoPainel() {
  const { acao } = acaoBotaoPrincipal(contagemEstadoPainel, agoraPainelMs());
  if (acao === 'definir') {
    await iniciarContagemDoPainel();
    return;
  }
  const restante = restanteLocalMs(contagemEstadoPainel, agoraPainelMs());
  const ok = await enviarComandoContagem(comandoControloContagem(acao, contagemCfg));
  if (!ok) return;
  registarContagemNoAr({
    rodando: acao === 'retomar',
    restanteMs: restante,
    duracaoMs: contagemEstadoPainel.duracaoMs,
  });
}

async function ajustarContagemDoPainel(deltaMs) {
  if (!contagemEstadoPainel.noAr) return;
  const restante = Math.max(0, restanteLocalMs(contagemEstadoPainel, agoraPainelMs()) + deltaMs);
  const ok = await enviarComandoContagem(comandoAjustarContagem(deltaMs, contagemCfg));
  if (!ok) return;
  registarContagemNoAr({
    rodando: contagemEstadoPainel.rodando,
    restanteMs: restante,
    duracaoMs: Math.max(contagemEstadoPainel.duracaoMs, restante),
  });
}

async function reiniciarContagemDoPainel() {
  const ms = camposParaMs(lerCampoContagem('minutos'), lerCampoContagem('segundos'));
  if (ms === null || ms <= 0) {
    alert('Escreva um tempo válido nos campos acima antes de reiniciar.');
    return;
  }
  salvarUltimoTempoContagem(ms);
  const ok = await enviarComandoContagem(comandoIniciarContagem(ms, contagemCfg));
  if (!ok) return;
  registarContagemNoAr({ rodando: true, restanteMs: ms, duracaoMs: ms });
}

async function encerrarContagemDoPainel() {
  await enviarEncerrarContagem();
  contagemEstadoPainel = estadoContagemVazio();
  contagemRestanteUltimoTick = 0;
  renderPainelContagem();
  garantirTickPainelContagem();
  /* Liberta o pin para os outros modos voltarem a mandar sozinhos nos monitores. */
  void salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
}

// ── Arranque ──────────────────────────────────────────────────────────────

export function iniciarContagemRegressivaPainel() {
  carregarContagemCfgDoStorage();
  carregarAlvoContagemDoStorage();
  carregarRotaContagemDoStorage();

  const presets = document.getElementById('contagem-presets');
  if (presets) {
    PRESETS_CONTAGEM_MIN.forEach((min) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'contagem-preset';
      b.textContent = String(min);
      b.setAttribute('aria-label', `${min} minutos`);
      b.addEventListener('click', () => {
        setInputVal('contagem-minutos', min);
        setInputVal('contagem-segundos', 0);
        renderPainelContagem();
      });
      presets.appendChild(b);
    });
  }

  document.getElementById('contagem-como-btn')?.addEventListener('click', (ev) => {
    const caixa = document.getElementById('contagem-como');
    if (!caixa) return;
    const abrir = caixa.hidden;
    caixa.hidden = !abrir;
    ev.currentTarget.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  });
  document.getElementById('contagem-fechar')?.addEventListener('click', fecharPainelContagem);
  document.getElementById('contagem-retrair')?.addEventListener('click', alternarRetrairPainelContagem);
  document.getElementById('contagem-abrir-ajustes')?.addEventListener('click', () => {
    fecharPainelContagem();
    abrirCfgModal('contagem');
  });

  document
    .getElementById('contagem-btn-principal')
    ?.addEventListener('click', () => void alternarPausaContagemDoPainel());
  document
    .getElementById('contagem-btn-encerrar')
    ?.addEventListener('click', () => void encerrarContagemDoPainel());
  document
    .getElementById('contagem-btn-menos')
    ?.addEventListener('click', () => void ajustarContagemDoPainel(-AJUSTE_CONTAGEM_MS));
  document
    .getElementById('contagem-btn-mais')
    ?.addEventListener('click', () => void ajustarContagemDoPainel(AJUSTE_CONTAGEM_MS));
  document
    .getElementById('contagem-btn-reiniciar')
    ?.addEventListener('click', () => void reiniciarContagemDoPainel());

  ['contagem-minutos', 'contagem-segundos'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      /* Com a contagem parada, o mostrador é a prévia do que vai ser projetado. */
      if (!contagemEstadoPainel.noAr) renderPainelContagem();
    });
  });

  /* As mensagens fazem parte da aparência (viajam em `contagemConfig`), mas editam-se
     aqui, no painel — é onde o operador está quando decide o que escrever. */
  const ligarCampoMensagem = (id, chave) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      contagemCfg = normalizarCfgContagem({ ...contagemCfg, [chave]: el.value });
      atualizarPreviewContagem();
      /* O mesmo debounce dos sliders: escrever «O culto começa em» são 17 teclas, e 17
         POSTs com a imagem de fundo a reboque seriam 17 travessias inúteis. */
      persistirCfgContagem();
    });
  };
  ligarCampoMensagem('contagem-msg-topo', 'mensagemTopo');
  ligarCampoMensagem('contagem-msg-rodape', 'mensagemRodape');

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('contagem-backdrop');
    if (!modal?.classList.contains('aberto')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    /* Com o painel aberto e o menu de rota por cima, o primeiro ESC fecha o menu — fechar
       o painel por baixo deixaria o menu órfão no cabeçalho. */
    if (document.querySelector('.route-dd.route-dd-open')) {
      fecharMenusRoteamentoTelas();
      return;
    }
    fecharPainelContagem();
  }, true);

  /*
   * Clique fora fecha o painel, como uma janela que perde o foco. Sai só a UI: a contagem
   * que já está no telão continua no ar — encerrá-la é o botão «Encerrar».
   *
   * `pointerdown` e não `click` por duas razões. No `pointerdown` a árvore ainda é a que o
   * operador viu: cliques em botões do painel que provocam re-render (monitores, presets)
   * chegariam ao `click` com o alvo já fora do DOM e passariam por «clique fora». E o
   * painel abre no `click` do cabeçalho, que vem depois — assim o próprio clique que o
   * abre nunca o fecha, venha de onde vier.
   */
  document.addEventListener('pointerdown', (ev) => {
    const modal = document.getElementById('contagem-backdrop');
    if (!modal?.classList.contains('aberto')) return;
    /* Retraído é estado deliberado de quem quer o cronómetro à vista enquanto trabalha no
       resto do controlador: aí clicar fora é o uso normal, não a saída do modo. Só sai
       pelo botão do cabeçalho, pelo ✕ ou por ESC. */
    if (modal.querySelector('.contagem-painel.retraido')) return;
    const alvo = ev.target instanceof Element ? ev.target : null;
    if (!alvo || alvo.closest('.contagem-painel')) return;
    /* Deixar o botão do cabeçalho fechar aqui faria o `click` seguinte reabrir o painel. */
    if (alvo.closest('#btn-modo-contagem')) return;
    /* Os avisos do próprio painel (`alert` → app-dialog) desenham-se por cima, fora dele:
       clicar no «OK» é responder ao painel, não sair do Modo Contador. */
    if (alvo.closest('#app-dialog-overlay')) return;
    fecharPainelContagem();
  });

  /*
   * O host é a fonte de verdade: se outro operador (ou o ESC de uma janela de projeção)
   * encerrar a contagem, o painel tem de saber. `estado` é o mesmo evento que já alimenta
   * a prévia do telão — a contagem só se pendura nele.
   */
  projecao.aoReceber('estado', (st) => {
    if (st && st.tipo === 'contagem' && st.contagem) {
      registarContagemNoAr(st.contagem);
      return;
    }
    if (contagemEstadoPainel.noAr) {
      contagemEstadoPainel = estadoContagemVazio();
      contagemRestanteUltimoTick = 0;
      renderPainelContagem();
      garantirTickPainelContagem();
      /* Contagem encerrou (ESC, outro operador, ao zerar): liberta o pin. */
      void salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
    }
  });

  renderPainelContagem();
}
