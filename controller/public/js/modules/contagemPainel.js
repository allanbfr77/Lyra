/**
 * Contagem regressiva — o que o painel do operador precisa de saber sozinho.
 *
 * ## Porquê o painel conta também
 *
 * O telão conta localmente a partir da duração que o host lhe deu (ver
 * `packages/projection-core/src/contagemRegressiva.js`). O painel faz o mesmo, pelo mesmo
 * motivo e com o mesmo desenho: o operador quer ver «04:32» a descer enquanto decide se
 * estica mais um minuto, e obrigar o host a emitir um pacote por segundo só para
 * alimentar essa leitura seria pagar rede por uma conta que qualquer um dos dois lados
 * sabe fazer.
 *
 * A consequência é que há dois relógios a andar — o do telão e o do painel — ancorados no
 * mesmo instante e na mesma duração. Divergem pela latência da rede local, que é muito
 * abaixo do segundo que os dígitos mostram.
 *
 * ## Porquê a regra de formato está aqui E no Core
 *
 * O painel do Controlador corre com `sandbox: true` (ver `mainWindow.js`). Um preload
 * sandboxed só consegue `require('electron')` — nenhum módulo de `node_modules` lhe é
 * alcançável, e portanto não há ponte possível para o `@lyra/projection-core`. A primeira
 * tentativa foi por aí e falhava no arranque, com o painel a acusar módulo em falta.
 *
 * Então o formato vive nos dois lados, como já acontece com `comentariosSlide` (CommonJS
 * no Core, ES module aqui) — o mesmo obstáculo, a mesma resposta. O que impede as duas
 * cópias de divergirem em silêncio é `contagemPainel.paridade.test.mjs`: carrega as duas
 * e compara-as em toda a grelha de durações e configurações que interessa. Uma alteração
 * de regra num dos lados e não no outro quebra a suíte na hora.
 *
 * ## O que este módulo NÃO faz
 *
 * Não toca no DOM, não emite comandos, não lê o relógio por conta própria: `agoraMs` é
 * sempre um argumento. É o que permite exercitar pausar/retomar/estourar numa suíte que
 * corre em milissegundos em vez de esperar minutos.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Regra de formato — espelho de packages/projection-core/src/contagemRegressiva.js
// Alterar aqui obriga a alterar lá (e vice-versa). O teste de paridade garante.
// ═══════════════════════════════════════════════════════════════════════════

/** Fim da contagem: para de contar e fica em 00:00 até o operador encerrar. */
export const AO_ZERAR_PARAR = 'parar';
/** Fim da contagem: passa a contar para cima, com sinal («+00:42»). */
export const AO_ZERAR_SUBIR = 'subir';
/** Fim da contagem: encerra a projeção sozinha, devolvendo o telão ao que estava. */
export const AO_ZERAR_ENCERRAR = 'encerrar';

export const MODOS_AO_ZERAR = [AO_ZERAR_PARAR, AO_ZERAR_SUBIR, AO_ZERAR_ENCERRAR];

/** Teto de 24 h: acima disto o operador enganou-se na unidade, não quis mesmo. */
export const DURACAO_MAX_MS = 24 * 60 * 60 * 1000;

export const CFG_CONTAGEM_PADRAO = Object.freeze({
  fontFamily: 'CMG Sans, sans-serif',
  fontSize: 18,
  negrito: true,
  textColor: '#ffffff',
  letterSpacing: -0.02,

  bgType: 'solid',
  bgColor: '#000000',
  bgGradient: 'linear-gradient(135deg, #05070f 0%, #16204a 100%)',
  bgImage: '',

  mensagemTopo: 'O culto começa em',
  mensagemTopoFontSize: 4.5,
  mensagemTopoColor: '#f3c15a',
  mensagemRodape: '',
  mensagemRodapeFontSize: 3,
  mensagemRodapeColor: '#ffffff',

  mostrarHoras: 'auto',
  mostrarSegundos: true,

  alertaSegundos: 60,
  alertaColor: '#ff5a5a',
  piscarNoFinal: true,

  aoZerar: AO_ZERAR_PARAR,
  textoFinal: '',

  verticalPosition: 'center',
});

export function clonarCfgContagemPadrao() {
  return { ...CFG_CONTAGEM_PADRAO };
}

function normalizarCorHex(valor, fallback) {
  const s = String(valor == null ? '' : valor).trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}

function numeroNoIntervalo(valor, min, max, fallback) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Texto de mensagem livre. Só corta o que quebraria o layout.
 *
 * @param {unknown} valor
 * @param {number} [maxLen]
 */
export function normalizarMensagemContagem(valor, maxLen = 160) {
  return String(valor == null ? '' : valor)
    /* eslint-disable-next-line no-control-regex */
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Config de aparência com todo campo garantido e dentro de limites.
 *
 * @param {object} [raw]
 */
export function normalizarCfgContagem(raw) {
  const base = clonarCfgContagemPadrao();
  const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  base.fontFamily =
    normalizarMensagemContagem(cfg.fontFamily, 120) || CFG_CONTAGEM_PADRAO.fontFamily;
  base.fontSize = numeroNoIntervalo(cfg.fontSize, 4, 40, CFG_CONTAGEM_PADRAO.fontSize);
  base.negrito = cfg.negrito !== false;
  base.textColor = normalizarCorHex(cfg.textColor, CFG_CONTAGEM_PADRAO.textColor);
  base.letterSpacing = numeroNoIntervalo(
    cfg.letterSpacing,
    -0.2,
    0.5,
    CFG_CONTAGEM_PADRAO.letterSpacing
  );

  base.bgType = cfg.bgType === 'gradient' || cfg.bgType === 'image' ? cfg.bgType : 'solid';
  base.bgColor = normalizarCorHex(cfg.bgColor, CFG_CONTAGEM_PADRAO.bgColor);
  base.bgGradient =
    normalizarMensagemContagem(cfg.bgGradient, 400) || CFG_CONTAGEM_PADRAO.bgGradient;
  /* `bgImage` é data-URL ou http(s); não passa por `normalizarMensagemContagem` para não
     perder caracteres do Base64, e só sobrevive quando o tipo de fundo é mesmo imagem. */
  base.bgImage = base.bgType === 'image' ? String(cfg.bgImage == null ? '' : cfg.bgImage) : '';

  base.mensagemTopo = normalizarMensagemContagem(cfg.mensagemTopo);
  base.mensagemTopoFontSize = numeroNoIntervalo(
    cfg.mensagemTopoFontSize,
    1,
    15,
    CFG_CONTAGEM_PADRAO.mensagemTopoFontSize
  );
  base.mensagemTopoColor = normalizarCorHex(
    cfg.mensagemTopoColor,
    CFG_CONTAGEM_PADRAO.mensagemTopoColor
  );
  base.mensagemRodape = normalizarMensagemContagem(cfg.mensagemRodape);
  base.mensagemRodapeFontSize = numeroNoIntervalo(
    cfg.mensagemRodapeFontSize,
    1,
    15,
    CFG_CONTAGEM_PADRAO.mensagemRodapeFontSize
  );
  base.mensagemRodapeColor = normalizarCorHex(
    cfg.mensagemRodapeColor,
    CFG_CONTAGEM_PADRAO.mensagemRodapeColor
  );

  base.mostrarHoras =
    cfg.mostrarHoras === 'sempre' || cfg.mostrarHoras === 'nunca' ? cfg.mostrarHoras : 'auto';
  base.mostrarSegundos = cfg.mostrarSegundos !== false;

  base.alertaSegundos = Math.round(
    numeroNoIntervalo(cfg.alertaSegundos, 0, 3600, CFG_CONTAGEM_PADRAO.alertaSegundos)
  );
  base.alertaColor = normalizarCorHex(cfg.alertaColor, CFG_CONTAGEM_PADRAO.alertaColor);
  base.piscarNoFinal = cfg.piscarNoFinal !== false;

  base.aoZerar = MODOS_AO_ZERAR.includes(cfg.aoZerar) ? cfg.aoZerar : AO_ZERAR_PARAR;
  base.textoFinal = normalizarMensagemContagem(cfg.textoFinal);

  base.verticalPosition =
    cfg.verticalPosition === 'top' || cfg.verticalPosition === 'bottom'
      ? cfg.verticalPosition
      : 'center';

  return base;
}

/**
 * Partes de um tempo em ms, já arredondadas como contagem regressiva.
 *
 * `ceil` e não `round`: enquanto restar um milissegundo do minuto 5, a tela mostra 5:00.
 *
 * @param {number} ms
 */
export function partesContagem(ms) {
  const totalSeg = Math.ceil(Math.max(0, Number(ms) || 0) / 1000);
  return {
    horas: Math.floor(totalSeg / 3600),
    minutos: Math.floor((totalSeg % 3600) / 60),
    segundos: totalSeg % 60,
    totalSegundos: totalSeg,
    totalMinutos: Math.floor(totalSeg / 60),
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Dígitos prontos para a tela.
 *
 * @param {number} ms
 * @param {object} [cfg]
 * @returns {string}
 */
export function formatarContagem(ms, cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : CFG_CONTAGEM_PADRAO;
  const p = partesContagem(ms);
  const mostrarSegundos = c.mostrarSegundos !== false;
  const modoHoras =
    c.mostrarHoras === 'sempre' || c.mostrarHoras === 'nunca' ? c.mostrarHoras : 'auto';

  if (!mostrarSegundos) {
    /* Sem segundos, arredondar para cima o minuto: faltando 4 min e 1 s ainda é «5 min»
       para quem lê a tela, e mostrar «04» faria o número saltar dois passos no fim. */
    const totalMin = Math.ceil(p.totalSegundos / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (modoHoras === 'nunca') return String(totalMin);
    if (modoHoras === 'sempre' || h > 0) return `${pad2(h)}:${pad2(m)}`;
    return `${pad2(m)}`;
  }

  if (modoHoras === 'nunca') return `${pad2(p.totalMinutos)}:${pad2(p.segundos)}`;
  if (modoHoras === 'sempre' || p.horas > 0) {
    return `${pad2(p.horas)}:${pad2(p.minutos)}:${pad2(p.segundos)}`;
  }
  return `${pad2(p.minutos)}:${pad2(p.segundos)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Estado do painel — não existe no Core, é só do operador
// ═══════════════════════════════════════════════════════════════════════════

/** Presets do painel, em minutos. Cobrem o «faltam X» que se usa antes de um culto. */
export const PRESETS_CONTAGEM_MIN = [5, 10, 15, 30];

/** Passo dos botões «−1 min» / «+1 min». */
export const AJUSTE_CONTAGEM_MS = 60_000;

/** Chave do `localStorage` com a aparência da contagem. */
export const LS_CONTAGEM_CFG = 'lyra_contagem_cfg_v1';

/** Telão só, ou telão e monitor do ministrante. Preferência de uso, não de hardware. */
export const LS_CONTAGEM_ALVO = 'lyra_contagem_alvo_v1';
/** Chave do `localStorage` com o último tempo digitado (não com o tempo a correr). */
export const LS_CONTAGEM_ULTIMO_TEMPO = 'lyra_contagem_ultimo_tempo_v1';

/**
 * Estado que o painel guarda sobre a contagem que ele próprio mandou pôr no ar.
 *
 * @typedef {object} EstadoPainelContagem
 * @property {boolean} noAr Há contagem projetada?
 * @property {boolean} rodando
 * @property {number} restanteMs Quanto faltava no instante `ancoraMs`.
 * @property {number} ancoraMs Relógio local em que `restanteMs` foi observado.
 * @property {number} duracaoMs
 */

/** Estado de partida: nada no ar. */
export function estadoContagemVazio() {
  return { noAr: false, rodando: false, restanteMs: 0, ancoraMs: 0, duracaoMs: 0 };
}

/**
 * Regista o que o host respondeu, ancorando no relógio local.
 *
 * @param {object} payload `{ rodando, restanteMs, duracaoMs }`
 * @param {number} agoraMs
 * @returns {EstadoPainelContagem}
 */
export function ancorarContagem(payload, agoraMs) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const restante = Math.max(0, Number(p.restanteMs) || 0);
  return {
    noAr: true,
    rodando: p.rodando !== false,
    restanteMs: restante,
    ancoraMs: Number(agoraMs) || 0,
    duracaoMs: Math.max(restante, Number(p.duracaoMs) || 0),
  };
}

/**
 * Quanto falta, segundo o relógio do painel.
 *
 * @param {EstadoPainelContagem|null} estado
 * @param {number} agoraMs
 */
export function restanteLocalMs(estado, agoraMs) {
  if (!estado || !estado.noAr) return 0;
  if (!estado.rodando) return Math.max(0, estado.restanteMs);
  const decorrido = Math.max(0, (Number(agoraMs) || 0) - estado.ancoraMs);
  return Math.max(0, estado.restanteMs - decorrido);
}

/**
 * Rótulo curto do estado, para o painel dizer o que está a acontecer sem o operador ter
 * de olhar para o telão.
 *
 * @param {EstadoPainelContagem|null} estado
 * @param {number} agoraMs
 * @returns {'parada'|'no-ar'|'pausada'|'zerada'}
 */
export function situacaoContagem(estado, agoraMs) {
  if (!estado || !estado.noAr) return 'parada';
  if (restanteLocalMs(estado, agoraMs) <= 0) return 'zerada';
  return estado.rodando ? 'no-ar' : 'pausada';
}

/**
 * Minutos e segundos de um total em ms, para preencher os dois campos do formulário.
 *
 * @param {number} ms
 */
export function msParaCampos(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return { minutos: Math.floor(total / 60), segundos: total % 60 };
}

/**
 * Lê os dois campos do formulário como uma duração.
 *
 * Campo vazio conta como zero, mas os dois vazios ao mesmo tempo devolvem `null` — é a
 * diferença entre «zero minutos e trinta segundos» e «o operador não escreveu nada».
 *
 * @param {string|number} minutos
 * @param {string|number} segundos
 * @returns {number|null}
 */
export function camposParaMs(minutos, segundos) {
  const mBruto = String(minutos == null ? '' : minutos).trim();
  const sBruto = String(segundos == null ? '' : segundos).trim();
  if (!mBruto && !sBruto) return null;
  const m = Number(mBruto || 0);
  const s = Number(sBruto || 0);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
  return Math.max(0, Math.round(m) * 60_000 + Math.round(s) * 1000);
}

/**
 * O botão do meio do painel muda de função conforme o estado — e a decisão de qual é
 * mora aqui, e não num `if` dentro do handler de clique, para poder ser exercitada.
 *
 * @param {EstadoPainelContagem|null} estado
 * @param {number} agoraMs
 * @returns {{acao: 'definir'|'pausar'|'retomar', rotulo: string}}
 */
export function acaoBotaoPrincipal(estado, agoraMs) {
  const situacao = situacaoContagem(estado, agoraMs);
  if (situacao === 'no-ar') return { acao: 'pausar', rotulo: 'Pausar' };
  if (situacao === 'pausada') return { acao: 'retomar', rotulo: 'Retomar' };
  /* Zerada conta como parada: o botão volta a ser «Iniciar» e usa o tempo do formulário,
     em vez de tentar retomar uma contagem que já não tem o que descontar. */
  return { acao: 'definir', rotulo: 'Iniciar' };
}

/**
 * A contagem acabou de estourar **neste tick**?
 *
 * Comparar o restante de agora com o do tick anterior, em vez de perguntar «está em
 * zero?», é o que torna o disparo único. Sem isso, o modo «encerrar ao zerar» emitiria um
 * `encerrar_contagem` a cada 200 ms depois do zero.
 *
 * @param {number} restanteAnteriorMs
 * @param {number} restanteAgoraMs
 */
export function acabouDeZerar(restanteAnteriorMs, restanteAgoraMs) {
  return (Number(restanteAnteriorMs) || 0) > 0 && (Number(restanteAgoraMs) || 0) <= 0;
}

/**
 * Payload de `exibir_contagem` para pôr (ou repor) a contagem no ar.
 *
 * @param {number} duracaoMs
 * @param {object} cfg
 * @param {{ rodando?: boolean }} [opts]
 */
export function comandoIniciarContagem(duracaoMs, cfg, opts = {}) {
  return {
    acao: 'definir',
    duracaoMs: Math.max(0, Math.round(Number(duracaoMs) || 0)),
    rodando: opts.rodando !== false,
    contagemConfig: cfg,
  };
}

/**
 * Payload de `exibir_contagem` para uma acção que não mexe na duração.
 *
 * A config vai junto de propósito: o operador pode ter mudado a cor no Ajustes com a
 * contagem pausada, e o comando de retomar é a próxima oportunidade de a levar ao telão.
 *
 * @param {'pausar'|'retomar'} acao
 * @param {object} cfg
 */
export function comandoControloContagem(acao, cfg) {
  return { acao, contagemConfig: cfg };
}

/**
 * Payload de `exibir_contagem` para somar ou tirar tempo.
 *
 * @param {number} deltaMs Negativo encurta.
 * @param {object} cfg
 */
export function comandoAjustarContagem(deltaMs, cfg) {
  return { acao: 'ajustar', ajusteMs: Math.round(Number(deltaMs) || 0), contagemConfig: cfg };
}

/**
 * Payload que leva só a aparência ao telão, sem tocar no tempo.
 *
 * É o que o Ajustes emite enquanto o operador arrasta um slider com a contagem no ar.
 *
 * @param {object} cfg
 */
export function comandoAparenciaContagem(cfg) {
  return { acao: 'definir', contagemConfig: cfg };
}
