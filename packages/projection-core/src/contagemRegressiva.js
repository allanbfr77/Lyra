'use strict';

/**
 * Contagem regressiva pré-culto — a regra, sem relógio nem DOM.
 *
 * ## Porquê um módulo próprio e não mais um `tipo` dentro do aviso
 *
 * O aviso é texto estático: o que o operador manda é o que a tela mostra até alguém
 * mandar outra coisa. A contagem muda sozinha a cada segundo, e isso levanta um problema
 * que o aviso não tem — **quem conta**.
 *
 * Contar no host e difundir o número a cada segundo seria um `io.emit` por segundo por
 * toda a duração da contagem (900 emissões numa contagem de 15 min), atravessando a rede
 * para dizer «agora são 14:59». Pior: cada emissão reconstrói o payload público inteiro,
 * que o telão volta a renderizar — trabalho a cada tick só para mudar dois dígitos.
 *
 * Aqui a contagem é declarada uma vez («faltam X ms, a correr») e cada tela conta
 * sozinha a partir daí. O host só volta a falar quando algo muda de facto: pausar,
 * retomar, ajustar o tempo, encerrar.
 *
 * ## Porquê `restanteMs` e não um `alvoEm` absoluto
 *
 * O telão pode estar noutro PC. Mandar «termina às 19:32:00» obriga os dois relógios a
 * concordarem — e relógios de PCs de igreja divergem em minutos, não em milissegundos.
 * Uma contagem que termina 3 minutos antes do previsto porque o PC do telão está
 * adiantado é um defeito invisível até ao dia em que acontece ao vivo.
 *
 * `restanteMs` é uma **duração**, e durações não dependem de relógios sincronizados. O
 * host guarda `alvoEm` no seu próprio relógio (para saber quanto falta a qualquer
 * momento) e converte para duração no instante de cada emissão. A tela recebe «faltam
 * 292 000 ms» e conta a partir do momento em que recebeu — errando, no máximo, a latência
 * da rede local, que é uma ordem de grandeza menor do que um segundo.
 */

/** Fim da contagem: para de contar e fica em 00:00 até o operador encerrar. */
const AO_ZERAR_PARAR = 'parar';
/** Fim da contagem: passa a contar para cima, com sinal («+00:42»). */
const AO_ZERAR_SUBIR = 'subir';
/** Fim da contagem: encerra a projeção sozinha, devolvendo o telão ao que estava. */
const AO_ZERAR_ENCERRAR = 'encerrar';

const MODOS_AO_ZERAR = [AO_ZERAR_PARAR, AO_ZERAR_SUBIR, AO_ZERAR_ENCERRAR];

/** Teto de 24 h: acima disto o operador enganou-se na unidade, não quis mesmo. */
const DURACAO_MAX_MS = 24 * 60 * 60 * 1000;

const CFG_PADRAO = Object.freeze({
  /* ── Dígitos ── */
  fontFamily: 'CMG Sans, sans-serif',
  /** vh, como o resto da projeção. 18 vh ≈ metade da altura útil num 1080p. */
  fontSize: 18,
  negrito: true,
  textColor: '#ffffff',
  /** em; negativo aperta os dígitos, útil em fontes largas. */
  letterSpacing: -0.02,

  /* ── Fundo ── */
  bgType: 'solid',
  bgColor: '#000000',
  bgGradient: 'linear-gradient(135deg, #05070f 0%, #16204a 100%)',
  bgImage: '',

  /* ── Texto livre acima e abaixo dos dígitos ── */
  mensagemTopo: 'O culto começa em',
  mensagemTopoFontSize: 4.5,
  mensagemTopoColor: '#f3c15a',
  mensagemRodape: '',
  mensagemRodapeFontSize: 3,
  mensagemRodapeColor: '#ffffff',

  /* ── Formato dos dígitos ── */
  /** 'auto' mostra horas só quando existem; 'sempre'/'nunca' forçam. */
  mostrarHoras: 'auto',
  mostrarSegundos: true,

  /* ── Reta final ── */
  /** Segundos restantes a partir dos quais os dígitos mudam de cor. 0 desliga. */
  alertaSegundos: 60,
  alertaColor: '#ff5a5a',
  piscarNoFinal: true,

  /* ── Fim ── */
  aoZerar: AO_ZERAR_PARAR,
  textoFinal: '',

  /* ── Posição ── */
  verticalPosition: 'center',
});

function clonarCfgPadrao() {
  return { ...CFG_PADRAO };
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
 * Texto de mensagem livre.
 *
 * Só corta o que quebraria o layout — controlos e quebras de linha viram espaço, e o
 * comprimento é limitado. Acentos, emoji e pontuação passam intactos: é texto do
 * operador, não um identificador.
 *
 * @param {unknown} valor
 * @param {number} [maxLen]
 */
function normalizarMensagem(valor, maxLen = 160) {
  return String(valor == null ? '' : valor)
    /* eslint-disable-next-line no-control-regex */
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Config de aparência da contagem, com todo campo garantido e dentro de limites.
 *
 * Igual em espírito a `normalizarCfgAviso` no renderer: a config atravessa a rede e o
 * `localStorage`, e nenhum dos dois promete devolver o que lá foi posto.
 *
 * @param {object} [raw]
 */
function normalizarCfgContagem(raw) {
  const base = clonarCfgPadrao();
  const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  base.fontFamily = normalizarMensagem(cfg.fontFamily, 120) || CFG_PADRAO.fontFamily;
  base.fontSize = numeroNoIntervalo(cfg.fontSize, 4, 40, CFG_PADRAO.fontSize);
  base.negrito = cfg.negrito !== false;
  base.textColor = normalizarCorHex(cfg.textColor, CFG_PADRAO.textColor);
  base.letterSpacing = numeroNoIntervalo(cfg.letterSpacing, -0.2, 0.5, CFG_PADRAO.letterSpacing);

  base.bgType = cfg.bgType === 'gradient' || cfg.bgType === 'image' ? cfg.bgType : 'solid';
  base.bgColor = normalizarCorHex(cfg.bgColor, CFG_PADRAO.bgColor);
  base.bgGradient = normalizarMensagem(cfg.bgGradient, 400) || CFG_PADRAO.bgGradient;
  /* `bgImage` é data-URL ou http(s); não passa por `normalizarMensagem` para não perder
     caracteres do Base64, e só sobrevive quando o tipo de fundo é mesmo imagem — a mesma
     regra de `substituirCamadaDisplay` no renderer. */
  base.bgImage = base.bgType === 'image' ? String(cfg.bgImage == null ? '' : cfg.bgImage) : '';

  base.mensagemTopo = normalizarMensagem(cfg.mensagemTopo);
  base.mensagemTopoFontSize = numeroNoIntervalo(
    cfg.mensagemTopoFontSize,
    1,
    15,
    CFG_PADRAO.mensagemTopoFontSize
  );
  base.mensagemTopoColor = normalizarCorHex(cfg.mensagemTopoColor, CFG_PADRAO.mensagemTopoColor);
  base.mensagemRodape = normalizarMensagem(cfg.mensagemRodape);
  base.mensagemRodapeFontSize = numeroNoIntervalo(
    cfg.mensagemRodapeFontSize,
    1,
    15,
    CFG_PADRAO.mensagemRodapeFontSize
  );
  base.mensagemRodapeColor = normalizarCorHex(
    cfg.mensagemRodapeColor,
    CFG_PADRAO.mensagemRodapeColor
  );

  base.mostrarHoras =
    cfg.mostrarHoras === 'sempre' || cfg.mostrarHoras === 'nunca' ? cfg.mostrarHoras : 'auto';
  base.mostrarSegundos = cfg.mostrarSegundos !== false;

  base.alertaSegundos = Math.round(
    numeroNoIntervalo(cfg.alertaSegundos, 0, 3600, CFG_PADRAO.alertaSegundos)
  );
  base.alertaColor = normalizarCorHex(cfg.alertaColor, CFG_PADRAO.alertaColor);
  base.piscarNoFinal = cfg.piscarNoFinal !== false;

  base.aoZerar = MODOS_AO_ZERAR.includes(cfg.aoZerar) ? cfg.aoZerar : AO_ZERAR_PARAR;
  base.textoFinal = normalizarMensagem(cfg.textoFinal);

  base.verticalPosition =
    cfg.verticalPosition === 'top' || cfg.verticalPosition === 'bottom'
      ? cfg.verticalPosition
      : 'center';

  return base;
}

/**
 * Duração pedida pelo comando, em ms.
 *
 * Aceita três formas porque três chamadores diferentes têm três números à mão: o painel
 * manda `minutos`/`segundos` (dois campos), os presets mandam `duracaoMs`, e o
 * «retomar» manda `restanteMs` (o que sobrou da contagem anterior). Uma só chave
 * obrigaria cada um a converter, e conversões espalhadas divergem.
 *
 * @param {object} dados
 * @returns {number|null} `null` quando nenhuma das formas veio preenchida.
 */
function duracaoPedidaMs(dados) {
  const pl = dados && typeof dados === 'object' ? dados : {};

  const direto = Number(pl.restanteMs != null ? pl.restanteMs : pl.duracaoMs);
  if ((pl.restanteMs != null || pl.duracaoMs != null) && Number.isFinite(direto)) {
    return Math.min(DURACAO_MAX_MS, Math.max(0, Math.round(direto)));
  }

  const temMin = pl.minutos != null && pl.minutos !== '';
  const temSeg = pl.segundos != null && pl.segundos !== '';
  if (!temMin && !temSeg) return null;

  const min = Number(pl.minutos);
  const seg = Number(pl.segundos);
  const total =
    (Number.isFinite(min) ? min : 0) * 60000 + (Number.isFinite(seg) ? seg : 0) * 1000;
  if (!Number.isFinite(total)) return null;
  return Math.min(DURACAO_MAX_MS, Math.max(0, Math.round(total)));
}

/**
 * Estado interno da contagem, tal como o host o guarda.
 *
 * `alvoEm` só existe enquanto corre. Pausada, o estado guarda a duração congelada e
 * esquece o instante — é o que torna «pausar às 20 h e retomar às 21 h» correcto sem
 * nenhum cuidado especial.
 *
 * @typedef {object} EstadoContagem
 * @property {boolean} rodando
 * @property {number|null} alvoEm Epoch do host em que chega a zero. `null` se pausada.
 * @property {number} restanteMs Congelado quando pausada; último valor conhecido.
 * @property {number} duracaoMs Duração total pedida — base da barra de progresso.
 * @property {object} cfg
 */

/**
 * Quanto falta, agora.
 *
 * Nunca devolve negativo: o excedente («já passou 42 s») é assunto do modo `subir`, e
 * exprimi-lo como restante negativo faria toda comparação `restante <= alerta` no
 * renderer passar a ser verdadeira por acidente.
 *
 * @param {EstadoContagem|null} estado
 * @param {number} agora
 */
function restanteMsContagem(estado, agora) {
  if (!estado || typeof estado !== 'object') return 0;
  if (!estado.rodando || estado.alvoEm == null) {
    return Math.max(0, Number(estado.restanteMs) || 0);
  }
  return Math.max(0, estado.alvoEm - agora);
}

/**
 * Cria o estado a partir de um comando do painel.
 *
 * @param {object} dados
 * @param {number} agora Epoch do host (injectado — o módulo não lê o relógio).
 * @param {EstadoContagem|null} [anterior] Base para comandos que só ajustam um campo.
 * @returns {EstadoContagem|null} `null` se o comando não define duração nenhuma e não há
 *   contagem anterior de onde a herdar.
 */
function criarEstadoContagem(dados, agora, anterior = null) {
  const pl = dados && typeof dados === 'object' ? dados : {};
  const pedida = duracaoPedidaMs(pl);

  const restanteBase =
    pedida != null ? pedida : anterior ? restanteMsContagem(anterior, agora) : null;
  if (restanteBase == null) return null;

  const rodando = pl.rodando !== false;
  const duracaoMs =
    pedida != null ? pedida : anterior && anterior.duracaoMs ? anterior.duracaoMs : restanteBase;

  return {
    rodando,
    alvoEm: rodando ? agora + restanteBase : null,
    restanteMs: restanteBase,
    duracaoMs,
    cfg: normalizarCfgContagem(
      pl.contagemConfig !== undefined ? pl.contagemConfig : anterior && anterior.cfg
    ),
  };
}

/**
 * Quanto passou do zero, para o modo `subir`. Zero enquanto a contagem não estourou.
 *
 * @param {EstadoContagem|null} estado
 * @param {number} agora
 */
function excedenteMsContagem(estado, agora) {
  if (!estado || !estado.rodando || estado.alvoEm == null) return 0;
  return Math.max(0, agora - estado.alvoEm);
}

/** A contagem chegou a zero? */
function contagemZerou(estado, agora) {
  return restanteMsContagem(estado, agora) <= 0;
}

/**
 * Congela a contagem no instante actual.
 *
 * @param {EstadoContagem} estado
 * @param {number} agora
 * @returns {EstadoContagem}
 */
function pausarContagem(estado, agora) {
  const restante = restanteMsContagem(estado, agora);
  return { ...estado, rodando: false, alvoEm: null, restanteMs: restante };
}

/**
 * Retoma de onde parou.
 *
 * @param {EstadoContagem} estado
 * @param {number} agora
 * @returns {EstadoContagem}
 */
function retomarContagem(estado, agora) {
  const restante = Math.max(0, Number(estado.restanteMs) || 0);
  return { ...estado, rodando: true, alvoEm: agora + restante, restanteMs: restante };
}

/**
 * Soma (ou subtrai) tempo sem interromper a contagem.
 *
 * É o botão «+1 min» do painel: o culto atrasou, o operador estica a contagem em vez de
 * a encerrar e recomeçar — o que faria os dígitos saltarem para trás no telão.
 *
 * @param {EstadoContagem} estado
 * @param {number} deltaMs
 * @param {number} agora
 * @returns {EstadoContagem}
 */
function ajustarContagem(estado, deltaMs, agora) {
  const delta = Number(deltaMs);
  if (!Number.isFinite(delta)) return estado;
  const restante = Math.min(
    DURACAO_MAX_MS,
    Math.max(0, restanteMsContagem(estado, agora) + Math.round(delta))
  );
  return {
    ...estado,
    restanteMs: restante,
    alvoEm: estado.rodando ? agora + restante : null,
    duracaoMs: Math.max(estado.duracaoMs || 0, restante),
  };
}

/**
 * Partes de um tempo em ms, já arredondadas como contagem regressiva.
 *
 * `ceil` e não `round`: enquanto restar um milissegundo do minuto 5, a tela mostra 5:00.
 * Com `round`, «05:00» apareceria só a partir de 4:59.500 — e o primeiro frame de uma
 * contagem de 5 minutos mostraria 04:59, que lê como defeito.
 *
 * @param {number} ms
 */
function partesContagem(ms) {
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
 * @param {object} [cfg] Config já normalizada (ou não — os defaults cobrem).
 * @returns {string}
 */
function formatarContagem(ms, cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : CFG_PADRAO;
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

/**
 * Payload da contagem para as telas.
 *
 * `restanteMs` é recalculado a cada emissão de propósito — é o que permite a um telão que
 * ligou a meio da contagem entrar sincronizado, sem o host ter de guardar quem já recebeu
 * o quê. O cliente não precisa de saber que horas são no host; só quanto falta.
 *
 * @param {EstadoContagem|null} estado
 * @param {number} agora
 */
function payloadContagem(estado, agora) {
  if (!estado || typeof estado !== 'object') return null;
  const cfg = normalizarCfgContagem(estado.cfg);
  return {
    rodando: !!estado.rodando,
    restanteMs: restanteMsContagem(estado, agora),
    excedenteMs: excedenteMsContagem(estado, agora),
    duracaoMs: Math.max(0, Number(estado.duracaoMs) || 0),
    zerada: contagemZerou(estado, agora),
    contagemConfig: cfg,
  };
}

module.exports = {
  AO_ZERAR_PARAR,
  AO_ZERAR_SUBIR,
  AO_ZERAR_ENCERRAR,
  MODOS_AO_ZERAR,
  DURACAO_MAX_MS,
  CFG_PADRAO,
  clonarCfgPadrao,
  normalizarCfgContagem,
  normalizarMensagem,
  duracaoPedidaMs,
  criarEstadoContagem,
  restanteMsContagem,
  excedenteMsContagem,
  contagemZerou,
  pausarContagem,
  retomarContagem,
  ajustarContagem,
  partesContagem,
  formatarContagem,
  payloadContagem,
};
