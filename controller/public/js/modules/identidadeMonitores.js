/**
 * =============================================================================
 * Lyra — Identidade de monitores (controlador)
 * =============================================================================
 * Porquê este módulo existe
 * -------------------------
 * As rotas de projeção sempre foram guardadas por ÍNDICE (`publicoIndex: 1`). O índice
 * é a posição do monitor no desktop virtual — muda quando o Windows renumera os ecrãs,
 * quando se troca a ordem dos cabos, quando a TV está desligada no arranque. Resultado
 * prático: o telão aparecia no monitor errado depois de um reinício.
 *
 * Aqui guardamos QUAL monitor foi escolhido, não em que posição ele estava. A resolução
 * de volta para índice acontece no arranque, contra a lista real do momento.
 *
 * Estratégia de correspondência (por ordem, conforme decidido para o projecto)
 * ---------------------------------------------------------------------------
 *   1. `fingerprint` — nome do painel + resolução + escala. Resistente a renumeração.
 *   2. `id`          — `Display.id` do Electron. Fallback para quando o nome muda
 *                      (actualização de driver, EDID diferente).
 *   3. nada corresponde → devolve `null` e a UI pede nova seleção. Nunca adivinha:
 *      um palpite errado põe a letra do hino no ecrã do operador durante o culto.
 *
 * Onde é guardado
 * ---------------
 * `localStorage` do controlador, e não no servidor: a escolha de monitores é uma
 * preferência da máquina que opera a interface. Se amanhã outro PC for o controlador,
 * ele terá o seu próprio hardware e a sua própria configuração.
 *
 * Mas o mapa é indexado por HOST de projeção. No modo dois PCs os monitores são os da
 * máquina servidora — sem essa chave, ligar-se a um servidor diferente restauraria a
 * configuração do anterior por cima de monitores que não existem lá.
 * =============================================================================
 */

import { LS_IDENTIDADE_MONITORES } from './chavesArmazenamentoLocal.js';

/** Modos de roteamento que têm identidade persistida. */
export const MODOS_COM_IDENTIDADE = ['completo', 'slides', 'apresentacao', 'biblia'];

/**
 * Chave de host: agrupa a configuração pela máquina onde a projeção corre.
 * Projeção nesta máquina e projeção num servidor remoto são setups de hardware
 * diferentes e não devem partilhar configuração.
 * @param {string} host IP/hostname do servidor de projeção, ou vazio para local
 * @returns {string}
 */
export function chaveHostMonitores(host) {
  const h = String(host || '').trim().toLowerCase();
  if (!h || h === 'localhost' || h === '127.0.0.1' || h === '::1') return 'local';
  return h;
}

/**
 * Extrai do monitor apenas o que serve para reconhecê-lo numa execução futura.
 * `nome` vai junto só para a mensagem ao utilizador («já não encontro a LG TV»).
 * @param {object} m entrada de `buildMonitorsList`
 * @returns {{fingerprint: string, id: number|null, nome: string}|null}
 */
export function identidadeDoMonitor(m) {
  if (!m || typeof m !== 'object') return null;
  const fingerprint = typeof m.fingerprint === 'string' ? m.fingerprint : '';
  const id = Number.isFinite(Number(m.id)) ? Number(m.id) : null;
  if (!fingerprint && id === null) return null;
  return {
    fingerprint,
    id,
    nome: String(m.nome || m.label || ''),
  };
}

/**
 * Monitores onde a projeção pode abrir — o principal é do operador e nunca entra.
 * Duplicado da regra que já existe no painel, de propósito: este módulo tem de poder
 * ser testado e reutilizado sem arrastar o `controllerAppCore.js` inteiro.
 * @param {object[]} lista
 */
function monitoresElegiveis(lista) {
  return (Array.isArray(lista) ? lista : []).filter((m) => m && !m.primary);
}

/**
 * Encontra, na lista actual, o monitor que corresponde à identidade guardada.
 *
 * @param {{fingerprint?: string, id?: number|null}|null} salvo
 * @param {object[]} lista lista actual de `buildMonitorsList`
 * @returns {{monitor: object, via: 'fingerprint'|'id'}|null} `null` = pedir nova seleção
 */
export function casarMonitorSalvo(salvo, lista) {
  if (!salvo || typeof salvo !== 'object') return null;
  const elegiveis = monitoresElegiveis(lista);
  if (!elegiveis.length) return null;

  const fp = typeof salvo.fingerprint === 'string' ? salvo.fingerprint : '';
  if (fp) {
    const porFingerprint = elegiveis.find((m) => m.fingerprint === fp);
    if (porFingerprint) return { monitor: porFingerprint, via: 'fingerprint' };
  }

  const id = Number.isFinite(Number(salvo.id)) ? Number(salvo.id) : null;
  if (id !== null) {
    const porId = elegiveis.find((m) => Number(m.id) === id);
    if (porId) return { monitor: porId, via: 'id' };
  }

  return null;
}

/**
 * Índice de projeção correspondente à identidade guardada.
 * @param {object|null} salvo
 * @param {object[]} lista
 * @returns {number} índice, ou -1 quando não há correspondência
 */
export function indiceMonitorSalvo(salvo, lista) {
  const r = casarMonitorSalvo(salvo, lista);
  return r ? Number(r.monitor.index) : -1;
}

/** Estrutura vazia — usada como fallback em qualquer leitura falhada. */
function mapaVazio() {
  return { version: 1, hosts: {} };
}

/**
 * @returns {{version: number, hosts: Record<string, Record<string, {publico: object|null, ministrante: object|null}>>}}
 */
export function carregarMapaIdentidades() {
  try {
    const raw = localStorage.getItem(LS_IDENTIDADE_MONITORES);
    if (!raw) return mapaVazio();
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || !p.hosts || typeof p.hosts !== 'object') return mapaVazio();
    return { version: 1, hosts: p.hosts };
  } catch (_) {
    // intencional — configuração corrompida equivale a «sem configuração»
    return mapaVazio();
  }
}

/**
 * Identidades guardadas para um host + modo de roteamento.
 * @param {string} host
 * @param {string} modo
 * @returns {{publico: object|null, ministrante: object|null}}
 */
export function lerIdentidadesRota(host, modo) {
  const mapa = carregarMapaIdentidades();
  const doHost = mapa.hosts[chaveHostMonitores(host)];
  const daRota = doHost && typeof doHost === 'object' ? doHost[modo] : null;
  if (!daRota || typeof daRota !== 'object') return { publico: null, ministrante: null };
  return {
    publico: daRota.publico || null,
    ministrante: daRota.ministrante || null,
  };
}

/**
 * Grava as identidades escolhidas para um host + modo.
 * `null` num canal significa «desativado» e é gravado como tal — apagar a entrada faria
 * a próxima leitura cair num restauro antigo em vez de respeitar o desligar explícito.
 *
 * @param {string} host
 * @param {string} modo
 * @param {{publico: object|null, ministrante: object|null}} identidades
 */
export function guardarIdentidadesRota(host, modo, identidades) {
  if (!MODOS_COM_IDENTIDADE.includes(modo)) return;
  const mapa = carregarMapaIdentidades();
  const chave = chaveHostMonitores(host);
  const doHost = mapa.hosts[chave] && typeof mapa.hosts[chave] === 'object' ? mapa.hosts[chave] : {};
  doHost[modo] = {
    publico: identidades?.publico || null,
    ministrante: identidades?.ministrante || null,
  };
  mapa.hosts[chave] = doHost;
  try {
    localStorage.setItem(LS_IDENTIDADE_MONITORES, JSON.stringify(mapa));
  } catch (_) {
    // intencional — quota cheia não pode derrubar a projeção em curso
  }
}

/**
 * Converte uma rota por índices na sua forma persistível por identidade.
 * @param {{publicoIndex: number, ministranteIndex: number}} rota
 * @param {object[]} lista
 */
export function identidadesDaRota(rota, lista) {
  const arr = Array.isArray(lista) ? lista : [];
  const porIndice = (i) => (Number.isFinite(i) && i >= 0 ? arr.find((m) => m && m.index === i) : null);
  return {
    publico: identidadeDoMonitor(porIndice(Number(rota?.publicoIndex))),
    ministrante: identidadeDoMonitor(porIndice(Number(rota?.ministranteIndex))),
  };
}

/**
 * Reconstrói a rota (índices) a partir das identidades guardadas para este host/modo.
 *
 * @param {string} host
 * @param {string} modo
 * @param {object[]} lista lista actual de monitores
 * @returns {{rota: {publicoIndex: number, ministranteIndex: number, live: boolean}, houveSalvo: boolean, faltou: string[]}}
 *   `houveSalvo` distingue «nunca configurado» de «configurado mas o monitor sumiu»;
 *   `faltou` traz os nomes que não foram encontrados, para avisar o utilizador.
 */
export function restaurarRotaPorIdentidade(host, modo, lista) {
  const salvas = lerIdentidadesRota(host, modo);
  const houveSalvo = !!(salvas.publico || salvas.ministrante);
  const faltou = [];

  const resolver = (ident) => {
    if (!ident) return -1;
    const idx = indiceMonitorSalvo(ident, lista);
    if (idx < 0) faltou.push(String(ident.nome || 'monitor desconhecido'));
    return idx;
  };

  return {
    rota: {
      publicoIndex: resolver(salvas.publico),
      ministranteIndex: resolver(salvas.ministrante),
      live: false,
    },
    houveSalvo,
    faltou,
  };
}
