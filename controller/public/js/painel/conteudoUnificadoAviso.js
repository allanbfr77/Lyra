/**
 * Modos de seletor unificado: emitir e encerrar a apresentação, alvos de projeção por rota, aviso do
 * card 6 (seletor de monitor, configuração, projeção ao vivo) e extras do modo. Movido verbatim do núcleo
 * (`controllerAppCore.js`); o que o núcleo ainda possui entra por `registrarDependenciasConteudoUnificadoAviso`.
 */
import { LS_MODO_APRESENTACAO_ATIVO } from '../modules/chavesArmazenamentoLocal.js';
import { alvoDeRota, rotaCobreAlvo } from '../modules/rotaEnvioBiblia.js';
import { atualizarUiPlayerAudioRemoto } from './playerLocalMidia.js';
import { bibliaHaParteProjetada } from './biblia.js';
import { normalizarCfgAvisoCard6 } from '../modules/midiaApresentacao.js';
import { normalizarItemApresentacao } from './estadoApresentacao.js';
import { renderGridApresentacao } from './gridApresentacao.js';
import { salvarRoteamentoTelasNoServidor } from './roteamentoTelas.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { fecharOutrosSeletoresDropdown } from './temasPlaylistUi.js';
import { getServidorProjeccaoIp, hostProjecao } from './servidorAlvo.js';
import { indiceRoteamentoMonitorNaUi, rotuloRotaApresentacaoForaDoPreset } from './roteamentoTelasUi.js';
import { encerrarAvisoCard6NoControlador } from './menuApresentacaoModo.js';
import { listaMonitoresParaProjecao, modoRoteamentoAtual, normalizarRota, sanitizarIndiceMonitorProjecao } from './rotasMonitores.js';

/**
 * Último conteúdo enviado a projetar nos modos de seletor unificado.
 *
 * O `alvoProjecao` (público / ministrante / ambos) viaja DENTRO do payload e é lido pelo
 * servidor no momento em que a projeção é feita. Mudar o seletor depois disso só altera a
 * rota de janelas — o conteúdo já enviado continua a apontar ao canal antigo, e o monitor
 * que acabou de entrar fica com o ecrã ocioso. Guardar o payload é o que permite reenviá-lo
 * com o alvo novo em vez de obrigar o operador a encerrar e projetar outra vez.
 *
 * @type {{tipo: 'apresentacao'|'biblia', payload: object}|null}
 */
let ultimoConteudoProjetadoModoUnificado = null;

export function emitirApresentacao(payload, opts = {}) {
  const pl = payload && typeof payload === 'object' ? payload : {};
  const ip = getServidorProjeccaoIp();

  /**
   * Nunca usar `socket.emit('exibir_apresentacao')` para ficheiros (data:, vídeo/Base64 grandes):
   * o Socket.IO corta pacotes grandes (~1 MB por defeito) e **derruba a ligação** — aparecia
   * «DESCONECTADO» e sumia «AO VIVO». O servidor aceita POST JSON até 200 MB.
   */
  const url = `http://${ip}:5510/api/comando/exibir_apresentacao`;

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pl),
  })
    .then(async (r) => {
      const txt = await r.text();
      let data = {};
      try {
        data = txt ? JSON.parse(txt) : {};
      } catch (_) {
  // intencional — erro ignorado
}

      if (!r.ok || data.ok === false) {
        const msg = data.erro || txt || r.statusText;
        throw new Error(msg || `HTTP ${r.status}`);
      }

      try {
        localStorage.setItem(LS_MODO_APRESENTACAO_ATIVO, '1');
      } catch (_) {
  // intencional — erro ignorado
}
      if (!opts.naoSubstituirUltimoUnificado) {
        ultimoConteudoProjetadoModoUnificado = { tipo: 'apresentacao', payload: pl };
      }
      return true;
    })
    .catch((e) => {
      alert(
        'Não foi possível projetar no servidor (porta 5510). Confira se o app SERVIDOR está a correr, o IP e a rede/firewall.\n\n' +
          String(e && e.message ? e.message : e)
      );
      return false;
    });
}

export async function emitirEncerrarApresentacaoPublicoAoServidor(alvoProjecao) {
  const body =
    alvoProjecao != null && String(alvoProjecao).trim()
      ? JSON.stringify({ alvoProjecao: String(alvoProjecao).trim() })
      : '{}';
  if (projecao.enviar('encerrar_apresentacao_publico', alvoProjecao != null ? { alvoProjecao } : undefined)) {
    return true;
  }
  const ip = hostProjecao();
  if (!ip) return false;
  try {
    const r = await fetch(`http://${ip}:5510/api/comando/encerrar_apresentacao_publico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return r.ok;
  } catch (_) {
    return false;
  }
}

/**
 * Destino da projeção (cabeçalho «Monitor»): desativado | publico | ministrante | ambos | live.
 *
 * Delega em `modules/rotaEnvioBiblia.js`: alvo e cobertura têm de sair da mesma regra, ou
 * voltam a divergir como divergiam antes (ver o cabeçalho desse módulo).
 */
export function obterAlvoProjecaoDeRota(rota) {
  return alvoDeRota(rota);
}

export function obterAlvoProjecaoModoApresentacao() {
  return obterAlvoProjecaoDeRota(estadoPainel.rotasPorModo.apresentacao);
}

function obterAlvoProjecaoModoBiblia() {
  return obterAlvoProjecaoDeRota(estadoPainel.rotasPorModo.biblia);
}

/** Aviso do card 6 ainda no telão (pode coexistir com mídia noutro monitor). */
let apresentacaoAvisoCard6Ativo = false;
/** Último payload de aviso — reenvio ao mudar o seletor do card 6. */
let ultimoPayloadAvisoCard6 = null;

function obterRotaAvisoCard6() {
  return normalizarRota(estadoPainel.rotasPorModo.apresentacaoAviso);
}

function rotaApresentacaoEstaDesativada(rota) {
  const r = normalizarRota(rota);
  return !r.live && r.publicoIndex < 0 && r.ministranteIndex < 0;
}

export function obterAlvoProjecaoAvisoCard6() {
  return obterAlvoProjecaoDeRota(obterRotaAvisoCard6());
}

function monitoresAvisoCard6CobremAlvo(alvo) {
  return monitoresRotaCobremAlvo(obterRotaAvisoCard6(), alvo);
}

function mensagemAlvoInvalidoAvisoCard6(alvo) {
  if (alvo === 'desativado') {
    return 'Escolha um monitor no seletor de Avisos (card 6) antes de projetar.';
  }
  return mensagemAlvoInvalidoMonitor(alvo, 'avisos (card 6)');
}

/**
 * Rota `apresentacao` enviada ao servidor quando mídia e avisos usam monitores distintos.
 * Cada índice vem da rota que activa esse canal; a mídia tem prioridade no público.
 */
function mesclarRotasApresentacaoMidiaEAviso(rotaMidia, rotaAviso) {
  const m = normalizarRota(rotaMidia);
  const a = normalizarRota(rotaAviso);
  if (m.live) return { ...m };
  if (a.live) return { ...a };
  return normalizarRota({
    publicoIndex: m.publicoIndex >= 0 ? m.publicoIndex : a.publicoIndex,
    ministranteIndex: m.ministranteIndex >= 0 ? m.ministranteIndex : a.ministranteIndex,
    live: false,
  });
}

export function obterRotaApresentacaoParaServidor() {
  const midia = normalizarRota(estadoPainel.rotasPorModo.apresentacao);
  const aviso = normalizarRota(estadoPainel.rotasPorModo.apresentacaoAviso);
  if (rotaApresentacaoEstaDesativada(aviso)) return midia;
  return mesclarRotasApresentacaoMidiaEAviso(midia, aviso);
}

function canaisOcupadosPorAlvoProjecao(alvo) {
  const a = String(alvo || '').toLowerCase();
  if (a === 'publico' || a === 'live') return ['publico'];
  if (a === 'ministrante') return ['ministrante'];
  if (a === 'ambos') return ['publico', 'ministrante'];
  return [];
}

/** Canais a limpar ao encerrar um conteúdo sem apagar o outro que partilha o mesmo telão. */
export function canaisParaEncerrarConteudoApresentacao(alvoConteudo, alvoOutroConteudo) {
  const meus = canaisOcupadosPorAlvoProjecao(alvoConteudo);
  if (!meus.length) return [];
  const outroAlvo = String(alvoOutroConteudo || '').toLowerCase();
  if (!outroAlvo || outroAlvo === 'desativado') {
    return meus.length === 2 ? ['ambos'] : meus;
  }
  const outros = new Set(canaisOcupadosPorAlvoProjecao(outroAlvo));
  const limpar = meus.filter((c) => !outros.has(c));
  return limpar.length ? limpar : [];
}

export async function encerrarCanaisApresentacaoNoServidor(canais) {
  const lista = Array.isArray(canais) ? canais : [];
  if (!lista.length) return;
  if (lista.includes('ambos') || (lista.includes('publico') && lista.includes('ministrante'))) {
    await emitirEncerrarApresentacaoPublicoAoServidor('ambos');
    return;
  }
  for (const canal of lista) {
    await emitirEncerrarApresentacaoPublicoAoServidor(canal);
  }
}

function aplicarSelecaoMonitorAvisoCard6(opcao) {
  const o = opcao && typeof opcao === 'object' ? opcao : {};
  estadoPainel.rotasPorModo.apresentacaoAviso = normalizarRota({
    publicoIndex: o.pub ?? -1,
    ministranteIndex: o.min ?? -1,
    live: !!o.live,
  });
}

async function reemitirAvisoCard6AposMudancaDeRota() {
  if (!apresentacaoAvisoCard6Ativo || !ultimoPayloadAvisoCard6) return;
  const alvo = obterAlvoProjecaoAvisoCard6();
  if (!monitoresAvisoCard6CobremAlvo(alvo)) return;
  await new Promise((r) => setTimeout(r, ATRASO_REENVIO_APOS_ROTA_MS));
  const payload = { ...ultimoPayloadAvisoCard6, alvoProjecao: alvo };
  const ok = await emitirApresentacao(payload, { naoSubstituirUltimoUnificado: true });
  if (ok) {
    ultimoPayloadAvisoCard6 = payload;
    atualizarFeedbackProjecaoApresentacaoUi();
  }
}

function rotuloSeletorMonitorAvisoCard6() {
  const rota = obterRotaAvisoCard6();
  const lista = estadoPainel.monitoresServidorCache;
  const opcoes = opcoesRoteamentoUnificadoModoApresentacao(lista, { incluirLive: false });
  const rLive = !!rota.live;
  let pub = rLive ? -1 : indiceRoteamentoMonitorNaUi(rota.publicoIndex);
  let min = rLive ? -1 : indiceRoteamentoMonitorNaUi(rota.ministranteIndex);
  pub = sanitizarIndiceMonitorProjecao(pub, lista);
  min = sanitizarIndiceMonitorProjecao(min, lista);
  const combina = (o) => !!o.live === rLive && (o.live || (o.pub === pub && o.min === min));
  const preset = opcoes.find(combina);
  if (preset) return preset.label;
  return rotuloRotaApresentacaoForaDoPreset({ publicoIndex: pub, ministranteIndex: min, live: rLive }, lista);
}

export function criarSeletorMonitorAvisoCard6() {
  const dd = document.createElement('div');
  dd.className = 'route-dd route-dd--card6-aviso';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'route-dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Monitor para avisos');
  const rotulo = rotuloSeletorMonitorAvisoCard6();
  btn.title =
    'Monitor exclusivo para avisos — independente do «Monitor» do cabeçalho (mídias)';
  const spanLbl = document.createElement('span');
  spanLbl.className = 'route-dd-label';
  spanLbl.textContent = rotulo;
  /* Ícone de monitor à esquerda e seta (chevron) à direita — só visual. */
  const icoMonitor = document.createElement('span');
  icoMonitor.className = 'route-dd-ico-monitor';
  icoMonitor.setAttribute('aria-hidden', 'true');
  icoMonitor.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2.5" width="13" height="8.5" rx="1.3"/><path d="M5.5 14h5M8 11v3"/></svg>';
  const caret = document.createElement('span');
  caret.className = 'route-dd-caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.innerHTML =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>';
  btn.appendChild(icoMonitor);
  btn.appendChild(spanLbl);
  btn.appendChild(caret);

  const menu = document.createElement('ul');
  menu.className = 'route-dd-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  const lista = estadoPainel.monitoresServidorCache;
  const rotaAtual = obterRotaAvisoCard6();
  const rLive = !!rotaAtual.live;
  let pubA = rLive ? -1 : indiceRoteamentoMonitorNaUi(rotaAtual.publicoIndex);
  let minA = rLive ? -1 : indiceRoteamentoMonitorNaUi(rotaAtual.ministranteIndex);
  pubA = sanitizarIndiceMonitorProjecao(pubA, lista);
  minA = sanitizarIndiceMonitorProjecao(minA, lista);
  const combinaAtual = (o) => !!o.live === rLive && (o.live || (o.pub === pubA && o.min === minA));

  const opcoes = opcoesRoteamentoUnificadoModoApresentacao(lista, { incluirLive: false });
  opcoes.forEach((o) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'route-dd-item';
    b.dataset.apOp = o.key;
    b.textContent = o.label;
    b.setAttribute('aria-selected', combinaAtual(o) ? 'true' : 'false');
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      dd.classList.remove('route-dd-open');
      aplicarSelecaoMonitorAvisoCard6({ pub: o.pub, min: o.min, live: o.live });
      spanLbl.textContent = o.label;
      menu.querySelectorAll('.route-dd-item').forEach((ib) => {
        ib.setAttribute('aria-selected', ib.dataset.apOp === o.key ? 'true' : 'false');
      });
      if (o.key === 'des' && apresentacaoAvisoCard6Ativo) {
        void encerrarAvisoCard6NoControlador();
      }
      salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false })
        .then(() => reemitirAvisoCard6AposMudancaDeRota())
        .catch(() => {});
    });
    li.appendChild(b);
    menu.appendChild(li);
  });

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const aberto = !menu.hidden;
    fecharOutrosSeletoresDropdown(dd);
    menu.hidden = aberto;
    dd.classList.toggle('route-dd-open', !aberto);
    btn.setAttribute('aria-expanded', aberto ? 'false' : 'true');
  });

  dd.appendChild(btn);
  dd.appendChild(menu);
  return dd;
}

/**
 * Reenvia o conteúdo que já está no ar depois de o operador mudar o seletor de monitores.
 *
 * Nos modos de seletor unificado (Bíblia e Mídias) o alvo é decidido no acto de projetar e
 * fica gravado no payload. Trocar de «Telão» para «Ambos» com a projeção a correr mudava
 * as janelas mas não o conteúdo: o monitor novo abria em ocioso e o operador tinha de
 * encerrar e projetar outra vez. Aqui o payload é reenviado tal e qual, só com o alvo
 * actualizado.
 *
 * Silencioso por natureza: nada a projetar, rota desativada ou modo errado não é erro —
 * é o caso normal de quem só está a preparar a próxima peça.
 */
const ATRASO_REENVIO_APOS_ROTA_MS = 320;

export async function reemitirConteudoAposMudancaDeRotaUnificada() {
  const guardado = ultimoConteudoProjetadoModoUnificado;
  if (!guardado || !guardado.payload) return;

  const modo = modoRoteamentoAtual();
  if (modo !== 'apresentacao' && modo !== 'biblia') return;

  const alvo = obterAlvoProjecaoDeRota(estadoPainel.rotasPorModo[modo]);
  if (alvo === 'desativado') return;
  /*
   * «Live — OBS» não tem janelas de monitor a alimentar — mas tem overlay. Em modo Mídias
   * continua a não haver nada a reenviar (a mídia é servida por outro caminho); em modo
   * Bíblia o reenvio é o que garante que o OBS recebe uma actualização válida no instante
   * em que o destino passa a ser o OBS, em vez de depender do estado que por acaso tenha
   * ficado da projeção física anterior.
   */
  if (alvo === 'live' && modo !== 'biblia') return;
  if (alvo === guardado.payload.alvoProjecao) return;

  /* O PUT já respondeu, mas a janela do monitor novo ainda está a carregar a página: o
     motor só lhe entrega conteúdo depois de a ter visível. Conteúdo enviado antes disso
     perde-se em silêncio — é a mesma razão do `reforcarMinistrante` no motor. */
  await new Promise((r) => setTimeout(r, ATRASO_REENVIO_APOS_ROTA_MS));

  if (guardado.tipo === 'apresentacao') {
    if (!estadoPainel.apresentacaoMidiaProjetadaId) return;
    await emitirApresentacao({ ...guardado.payload, alvoProjecao: alvo });
    return;
  }

  if (guardado.tipo === 'biblia') {
    if (!bibliaHaParteProjetada()) return;
    /* `somenteTexto: false` de propósito: o monitor que acabou de entrar não recebeu a
       referência nem a configuração de exibição, e um reenvio abreviado deixá-lo-ia com
       o versículo sem cabeçalho. */
    const payload = { ...guardado.payload, alvoProjecao: alvo, somenteTexto: false };
    projecao.enfileirar('exibir_versiculo', payload);
    ultimoConteudoProjetadoModoUnificado = { tipo: 'biblia', payload };
  }
}

function monitoresRotaCobremAlvo(rota, alvo) {
  return rotaCobreAlvo(rota, alvo);
}

export function monitoresApresentacaoCobremAlvo(alvo) {
  return monitoresRotaCobremAlvo(estadoPainel.rotasPorModo.apresentacao, alvo);
}

/*
 * Não há `monitoresBibliaCobremAlvo()`.
 *
 * Existia, e era metade do defeito: perguntar «os monitores cobrem o alvo?» antes de
 * enviar fazia a ausência de monitor físico calar o OBS. No Modo Bíblia a decisão passou
 * inteira para `resolverEnvioBiblia()` (`modules/rotaEnvioBiblia.js`), que lê alvo e
 * cobertura da mesma rota já sincronizada e nunca devolve «não enviar» por falta de tela.
 * O modo Mídias continua a usar `monitoresApresentacaoCobremAlvo()`: ali o conteúdo é uma
 * mídia servida às janelas, e sem janela não há o que enviar.
 */

const LS_CARD6_AVISO_CFG = 'lyra_card6_aviso_cfg_v1';

export function aplicarEstiloTextareaAvisoCard6(el, rawCfg) {
  if (!el) return;
  const cfg = normalizarCfgAvisoCard6(rawCfg);
  el.style.color = cfg.textColor;
  el.style.background = cfg.transparentBackground ? 'transparent' : cfg.backgroundColor;
  el.style.fontStyle = cfg.italic ? 'italic' : 'normal';
  el.style.width = '100%';
  el.style.maxWidth = '100%';
  el.style.fontSize = '15px';
  el.style.whiteSpace = cfg.wrapLongLines ? 'pre-wrap' : 'pre';
  el.style.overflowWrap = cfg.wrapLongLines ? 'anywhere' : 'normal';
  el.style.wordBreak = 'break-word';
  el.style.overflow = 'hidden';
  el.wrap = cfg.wrapLongLines ? 'soft' : 'off';
}

export function algumCampoAvisoCard6EmEdicao() {
  const ativo = document.activeElement;
  if (!ativo) return false;
  return (
    ativo.classList?.contains('ap-card6-aviso-textarea') ||
    ativo.dataset?.apCard6CfgField === '1'
  );
}

export function salvarAvisoCard6CfgNoStorage() {
  try {
    localStorage.setItem(
      LS_CARD6_AVISO_CFG,
      JSON.stringify(normalizarCfgAvisoCard6(estadoPainel.apresentacaoCard6AvisoCfg))
    );
  } catch (_) {
  // intencional — erro ignorado
}
}

export function carregarAvisoCard6CfgDoStorage() {
  try {
    const raw = localStorage.getItem(LS_CARD6_AVISO_CFG);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? normalizarCfgAvisoCard6(parsed) : null;
  } catch (_) {
    return null;
  }
}

function mensagemAlvoInvalidoMonitor(alvo, modoLabel) {
  const modo = modoLabel || 'apresentação';
  if (alvo === 'desativado') {
    return `No modo ${modo}, abra «Monitor» no cabeçalho e escolha um destino (público, ministrante ou ambos) antes de projetar.`;
  }
  if (alvo === 'publico') {
    return `Escolha «Igreja (M2)» em «Monitor» no cabeçalho antes de projetar para o telão.`;
  }
  if (alvo === 'ministrante') {
    return 'Escolha «Ministrante (M3)» em «Monitor» no cabeçalho antes de projetar só no retorno.';
  }
  if (alvo === 'live') {
    return 'Escolha «Live — OBS» em «Monitor» no cabeçalho. No OBS, use Browser Source em http://127.0.0.1:5001/obs';
  }
  return 'Escolha «Ambos» em «Monitor» no cabeçalho para enviar ao público e ao ministrante.';
}

export function mensagemAlvoInvalidoApresentacao(alvo) {
  return mensagemAlvoInvalidoMonitor(alvo, 'apresentação');
}

export function mensagemAlvoInvalidoBiblia(alvo) {
  if (alvo === 'desativado') {
    return 'A projeção está em «Não exibir». Selecione um destino em «Monitor» (no cabeçalho), antes de projetar o versículo.';
  }
  return mensagemAlvoInvalidoMonitor(alvo, 'Bíblia');
}

/**
 * Índices de monitor (0-based) nas opções do modo apresentação: 2.º e 3.º ecrã na lista do servidor;
 * com menos ecrãs, recua para o último disponível.
 */
export function indicesPadraoPublicoMinistranteApresentacao(lista) {
  const sec = listaMonitoresParaProjecao(lista);
  const n = sec.length;
  if (!n) return { iPub: -1, iMin: -1 };
  const temIdx = (idx) => sec.some((m) => m && m.index === idx);
  /* Convenção Lyra: Monitor 2 (índice 1) = público/telão; Monitor 3 (índice 2) = ministrante. */
  if (temIdx(1) && temIdx(2)) {
    return { iPub: 1, iMin: 2 };
  }
  const iPub = sec[0].index;
  /* Um único monitor de projeção: só o telão público abre nele. Partilhar o mesmo ecrã
     com o ministrante faria a janela do operador (atual + próximo) cobrir o público —
     era exactamente o sintoma reportado (público seleccionado, mas projeta atual+próximo). */
  let iMin = n >= 2 ? sec[1].index : -1;
  if (iMin === iPub && n >= 2) {
    const outro = sec.find((m) => m.index !== iPub);
    if (outro) iMin = outro.index;
  }
  return { iPub, iMin };
}

/**
 * Rota do modo slide padrão: 2.º ecrã = público (telão), 3.º = ministrante (retorno);
 * com menos monitores, aplica o mesmo fallback de `indicesPadraoPublicoMinistranteApresentacao`.
 */
function rotaSlidesPadraoPublico2Ministrante3(lista) {
  const { iPub, iMin } = indicesPadraoPublicoMinistranteApresentacao(Array.isArray(lista) ? lista : []);
  return normalizarRota({ publicoIndex: iPub, ministranteIndex: iMin });
}

/**
 * Rota do modo Slide ao entrar: Público M2 + Ministrante M3.
 *
 * Já se desviou do que as Mídias ocupavam, e era desviar a mais: o monitor emprestado
 * continua a ser o do Slides, apenas indisponível enquanto a mídia lá está — o seletor
 * mostra-o apagado (`route-dd--bloqueado-apresentacao`) e o pacote para o servidor
 * silencia o canal (`rotaSlidesParaEnvioComApresentacao`). Reatribuir o índice aqui
 * escrevia a ocupação na configuração do operador, que é o que esta separação evita.
 */
export function rotaSlidesAoEntrarNoModo() {
  return rotaSlidesPadraoPublico2Ministrante3(estadoPainel.monitoresServidorCache);
}

/**
 * Opções do seletor «Monitor» dos modos de seletor unificado.
 *
 * `incluirLive` existe porque o destino «Live — OBS» não serve os três seletores da
 * mesma maneira. Na Bíblia o OBS é um destino legítimo: o versículo é texto, e o
 * `display-routing` sabe entregá-lo ao overlay sem monitor físico nenhum. Nas Mídias e
 * nos Avisos do card 6 não é: a mídia é servida às janelas de projeção, e escolher Live
 * ali só produzia uma saída sem tela — nada a projetar e nada a ver.
 *
 * @param {Array} lista Monitores conhecidos do servidor.
 * @param {{ incluirLive?: boolean }} [opts] `incluirLive: false` omite «Live — OBS».
 */
/**
 * O seletor do cabeçalho é partilhado pela Bíblia e pelas Mídias; só a Bíblia tem OBS.
 * @returns {{ incluirLive: boolean }}
 */
export function opcoesSeletorCabecalhoDoModoAtual() {
  const m = modoRoteamentoAtual();
  return { incluirLive: m !== 'apresentacao' && m !== 'docs' };
}

export function opcoesRoteamentoUnificadoModoApresentacao(lista, opts = {}) {
  const incluirLive = opts.incluirLive !== false;
  const out = [];
  const naoExibir = { key: 'des', label: 'Não exibir', pub: -1, min: -1, live: false };
  const sec = listaMonitoresParaProjecao(lista);
  if (!sec.length) {
    if (incluirLive) out.push({ key: 'live', label: 'Live — OBS', pub: -1, min: -1, live: true });
    out.push(naoExibir);
    return out;
  }
  const { iPub, iMin } = indicesPadraoPublicoMinistranteApresentacao(lista);
  if (iPub >= 0) {
    out.push({
      key: 'pub',
      label: `Igreja (M${iPub + 1})`,
      pub: iPub,
      min: -1,
      live: false,
    });
  }
  if (iMin >= 0) {
    out.push({
      key: 'min',
      label: `Ministrante (M${iMin + 1})`,
      pub: -1,
      min: iMin,
      live: false,
    });
  }
  let ambPub = iPub;
  let ambMin = iMin;
  if (ambPub === ambMin && sec.length >= 2) {
    ambPub = sec[0].index;
    ambMin = sec[1].index;
  } else if (ambPub === ambMin) {
    ambMin = -1;
  }
  if (ambPub >= 0 && ambMin >= 0) {
    out.push({
      key: 'ambos',
      label: 'Ambos',
      pub: ambPub,
      min: ambMin,
      live: false,
    });
  }
  /* Ordem: Igreja, Ministrante, Ambos, Live (se houver) e, por último, «Não exibir». */
  if (incluirLive) out.push({ key: 'live', label: 'Live — OBS', pub: -1, min: -1, live: true });
  out.push(naoExibir);
  return out;
}

export function aplicarExtrasModoApresentacao(ex, opts = {}) {
  const extras = ex && typeof ex === 'object' ? ex : {};
  if (Array.isArray(extras.card4Imagens)) {
    estadoPainel.apresentacaoCard4Imagens = Array.from({ length: 4 }, (_, i) =>
      normalizarItemApresentacao(extras.card4Imagens[i] || null));
  }
  if (!opts.skipCard6Aviso && typeof extras.card6AvisoTexto === 'string') {
    estadoPainel.apresentacaoCard6Texto = extras.card6AvisoTexto;
  }
  if (!opts.skipCard6AvisoConfig && extras.card6AvisoConfig !== undefined) {
    estadoPainel.apresentacaoCard6AvisoCfg = normalizarCfgAvisoCard6(extras.card6AvisoConfig);
    salvarAvisoCard6CfgNoStorage();
  }
  estadoPainel.audioLoopAtivo = extras.audioLoop === true;
  migrarAlvoExtrasLegadoParaRotaApresentacao(extras);
  atualizarUiPlayerAudioRemoto();
}

/** Legado: rotas de apresentação/Bíblia são só de sessão — não restaurar alvo antigo do storage. */
function migrarAlvoExtrasLegadoParaRotaApresentacao(_ex) {}

export function atualizarRodapeAudioApresentacao(item) {
  if (!item) return;
  atualizarPillProjecaoNav({ ativo: true, nome: String(item.name || 'faixa') });
  renderGridApresentacao();
}

/**
 * Espelha o estado de projeção no indicador global da barra de navegação
 * (#hdr-projecao-pill). Só desenha — é chamado por sincronizarPillProjecaoNav
 * (fonte única: mídia no telão, aviso do card 6 e áudio no player) e por
 * atualizarRodapeAudioApresentacao; não mantém estado próprio.
 * @param {{ativo?: boolean, nome?: string}} info
 */
function atualizarPillProjecaoNav(info = {}) {
  let pill = document.getElementById('hdr-projecao-pill');
  /* Sem projeção: a pill não existe no DOM (sem espaço reservado, sem placeholder). */
  if (!info.ativo) {
    if (pill) pill.remove();
    return;
  }
  const txt = String(info.nome == null ? '' : info.nome).trim() || 'arquivo';
  if (!pill) {
    /* Filha direta do header (não de .app-header-right, que é escondido nos
       modos de projeção). Posicionada em absoluto à direita da barra. */
    const host = document.querySelector('.app-header');
    if (!host) return;
    pill = document.createElement('div');
    pill.id = 'hdr-projecao-pill';
    pill.className = 'hdr-projecao-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.innerHTML =
      '<span class="hdr-projecao-dot" aria-hidden="true"></span>' +
      '<span class="hdr-projecao-label">Projetando</span>' +
      '<span class="hdr-projecao-nome" id="hdr-projecao-nome"></span>';
    host.appendChild(pill);
  }
  pill.title = 'Projetando no telão: ' + txt;
  const nomeEl = pill.querySelector('.hdr-projecao-nome');
  if (nomeEl) nomeEl.textContent = txt;
}

/**
 * Áudio do modo Mídias ainda carregado no player do servidor — a tocar ou em pausa.
 *
 * O áudio não ocupa `apresentacaoMidiaProjetadaId`: esse id é de quem ocupa o telão
 * (imagem/vídeo/PDF/web) e `projetarItemApresentacao` limpa-o de propósito ao projetar
 * uma faixa. Por isso a projeção de áudio tem de ser lida à parte, senão qualquer
 * redesenho do feedback apagava a pill com o áudio ainda no ar.
 *
 * `mediaKind` só volta a '' quando o playback é mesmo parado (Parar / Encerrar
 * projeção); uma faixa em pausa continua carregada, tal como uma imagem pausada
 * continua no telão — e nesses dois casos a projeção continua a existir.
 */
function projecaoAudioApresentacaoAtiva() {
  return estadoPainel.audioStateRemoto.mediaKind === 'audio' && !!estadoPainel.apresentacaoAudioAtualId;
}

/** Nome da faixa em projeção, para o rótulo da pill. */
function nomeAudioProjecaoApresentacao() {
  const item =
    (estadoPainel.apresentacaoAudios || []).find((x) => x && x.id === estadoPainel.apresentacaoAudioAtualId) || null;
  return String(item?.name || estadoPainel.audioStateRemoto.name || 'faixa');
}

/**
 * Decide o estado da pill a partir do que está mesmo no ar — mídia no telão, aviso do
 * card 6 e áudio no player — sem tocar na grelha. Fonte única do «Projetando».
 */
export function sincronizarPillProjecaoNav() {
  const id = estadoPainel.apresentacaoMidiaProjetadaId;
  const avisoAtivo = apresentacaoAvisoCard6Ativo;
  if (!id && !avisoAtivo) {
    if (projecaoAudioApresentacaoAtiva()) {
      atualizarPillProjecaoNav({ ativo: true, nome: nomeAudioProjecaoApresentacao() });
    } else {
      atualizarPillProjecaoNav({ ativo: false });
    }
    return;
  }
  let rawNome;
  if (avisoAtivo && !id) {
    const linha =
      String(estadoPainel.apresentacaoCard6Texto || '').split(/\r\n|\r|\n/).find((l) => String(l).trim()) || 'Aviso';
    rawNome = linha.slice(0, 56);
  } else {
    const item =
      (estadoPainel.apresentacaoBiblioteca || []).find((x) => x && x.id === id) ||
      (estadoPainel.apresentacaoCards || []).find((x) => x && x.id === id) ||
      null;
    rawNome = String(item?.name || 'arquivo');
    if (avisoAtivo) rawNome = `${rawNome} + aviso`;
  }
  atualizarPillProjecaoNav({ ativo: true, nome: rawNome });
}

/**
 * Sincroniza o indicador de projeção (pill na barra de navegação —
 * sincronizarPillProjecaoNav) e redesenha a grelha de cards. Aceita e ignora
 * opções antigas (ex.: mensagemIdle) para compatibilidade com chamadas existentes.
 */
export function atualizarFeedbackProjecaoApresentacaoUi() {
  sincronizarPillProjecaoNav();
  renderGridApresentacao();
}

function montarPayloadAvisoCard6Atual(alvo) {
  return {
    kind: 'aviso',
    texto: String(estadoPainel.apresentacaoCard6Texto || '').trim(),
    alvoProjecao: alvo,
    avisoConfig: normalizarCfgAvisoCard6(estadoPainel.apresentacaoCard6AvisoCfg),
  };
}

async function atualizarAvisoCard6AoVivo() {
  if (!apresentacaoAvisoCard6Ativo) return;
  const alvo = obterAlvoProjecaoAvisoCard6();
  if (!monitoresAvisoCard6CobremAlvo(alvo)) return;
  const payload = montarPayloadAvisoCard6Atual(alvo);
  if (!payload.texto) return;
  const ok = await emitirApresentacao(payload, { naoSubstituirUltimoUnificado: true });
  if (ok) {
    ultimoPayloadAvisoCard6 = payload;
    atualizarFeedbackProjecaoApresentacaoUi();
  }
}

export function agendarAtualizacaoAvisoCard6AoVivo() {
  if (syncApresentacaoAvisoLiveTimer) clearTimeout(syncApresentacaoAvisoLiveTimer);
  if (!apresentacaoAvisoCard6Ativo) return;
  syncApresentacaoAvisoLiveTimer = setTimeout(() => {
    syncApresentacaoAvisoLiveTimer = null;
    void atualizarAvisoCard6AoVivo();
  }, 120);
}

export async function projetarAvisoCard6() {
  const texto = String(estadoPainel.apresentacaoCard6Texto || '').trim();
  if (!texto) {
    alert('Digite um aviso no card 6 antes de projetar.');
    return;
  }
  const alvo = obterAlvoProjecaoAvisoCard6();
  if (alvo === 'desativado' || !monitoresAvisoCard6CobremAlvo(alvo)) {
    alert(mensagemAlvoInvalidoAvisoCard6(alvo));
    return;
  }
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
  const payload = montarPayloadAvisoCard6Atual(alvo);
  const ok = await emitirApresentacao(payload, {
    naoSubstituirUltimoUnificado: !!estadoPainel.apresentacaoMidiaProjetadaId,
  });
  if (!ok) return;
  apresentacaoAvisoCard6Ativo = true;
  ultimoPayloadAvisoCard6 = payload;
  try {
    localStorage.setItem(LS_MODO_APRESENTACAO_ATIVO, '1');
  } catch (_) {
  // intencional — erro ignorado
}
  atualizarFeedbackProjecaoApresentacaoUi();
}

let syncApresentacaoAvisoLiveTimer = null;

/* ─── Pontos de contato com o núcleo e com outros módulos (o estado acima é privado) ─── */

export function getUltimoConteudoProjetadoModoUnificado() {
  return ultimoConteudoProjetadoModoUnificado;
}

export function setUltimoConteudoProjetadoModoUnificado(valor) {
  ultimoConteudoProjetadoModoUnificado = valor;
}

export function getApresentacaoAvisoCard6Ativo() {
  return apresentacaoAvisoCard6Ativo;
}

export function setApresentacaoAvisoCard6Ativo(valor) {
  apresentacaoAvisoCard6Ativo = valor;
}

export function getUltimoPayloadAvisoCard6() {
  return ultimoPayloadAvisoCard6;
}

export function setUltimoPayloadAvisoCard6(valor) {
  ultimoPayloadAvisoCard6 = valor;
}
