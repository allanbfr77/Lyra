/**
 * =============================================================================
 * Lyra — «Lembrar monitor» (modos Bíblia e Mídias)
 * =============================================================================
 *
 * ## O que resolve
 *
 * Bíblia e Mídias são rotas de sessão: repostas a «Não exibir» a cada arranque e a cada
 * saída do modo, de propósito — persistir a rota fá-las-ia ressuscitar uma projeção que o
 * operador tinha encerrado (ver `persistirIdentidadesDosModos`). O preço era escolher o
 * monitor outra vez a cada ida ao modo, todo domingo.
 *
 * Este módulo separa as duas coisas que estavam coladas:
 *
 *   - **rota em vigor** — quem está a receber conteúdo AGORA. Continua de sessão, continua
 *     a ir a «Não exibir» ao encerrar, continua a fechar janelas.
 *   - **memória** — que monitor o operador quer da próxima vez. Só isto persiste.
 *
 * **Monitor lembrado ≠ projeção ativa.** Encerrar a projeção encerra-a; o que fica é a
 * escolha, para o seletor já aparecer preenchido na próxima entrada no modo.
 *
 * ## Quando é lida e quando é escrita
 *
 * Lida **só à entrada no modo** — nunca durante uma projeção, nunca ao trocar de modo. Uma
 * memória que se aplicasse a meio moveria a janela do que está no ar.
 *
 * Escrita **só no clique do operador** no seletor (e ao ligar o checkbox, capturando a
 * escolha do momento). Nunca a partir de mudanças automáticas de rota: os caminhos
 * automáticos escrevem «Não exibir» ao sair do modo, e ouvi-los faria a memória apagar-se
 * a si própria — exactamente o defeito que `LS_ROTAS_DEFINIDAS_PELO_OPERADOR` existiu para
 * evitar noutro sítio.
 *
 * ## Porquê identidade e não índice
 *
 * O índice é a posição no desktop virtual e muda quando o Windows renumera os ecrãs, quando
 * se troca um cabo, quando a TV está desligada no arranque. Guardar índice significa, num
 * domingo qualquer, o versículo a aparecer no ecrã do operador. Reutiliza-se por isso
 * `identidadeMonitores.js` — impressão digital do painel, com o `Display.id` como recurso —
 * e a mesma chave de host: o hardware de um servidor remoto não é o desta máquina.
 *
 * Monitor lembrado que não aparece na lista **não apaga a memória**: a TV desligada hoje
 * não pode custar a preferência para sempre. Resolve para «Não exibir» e devolve o nome em
 * falta, para a interface poder dizer porquê em vez de ficar calada.
 *
 * ## Estados independentes por modo
 *
 * Bíblia e Mídias partilham o canal `apresentacao` no servidor, mas a memória é separada:
 * cada modo tem o seu checkbox e a sua escolha. As duas nunca são aplicadas ao mesmo tempo,
 * porque a aplicação acontece à entrada de um modo de cada vez.
 * =============================================================================
 */

import { LS_MONITOR_LEMBRADO } from './chavesArmazenamentoLocal.js';
import { chaveHostMonitores, identidadeDoMonitor, indiceMonitorSalvo } from './identidadeMonitores.js';

/** Valor de «Não exibir». */
export const SEM_EXIBICAO = -1;

/** Modos com «Lembrar monitor». Slides e Contador têm persistência própria e não entram. */
export const MODOS_COM_MEMORIA = ['biblia', 'apresentacao'];

/** Preferência vazia — usada em qualquer leitura falhada ou modo sem memória. */
function preferenciaVazia() {
  return { ligado: false, live: false, publico: null, ministrante: null };
}

function mapaVazio() {
  return { version: 1, hosts: {} };
}

function carregarMapa() {
  try {
    const raw = localStorage.getItem(LS_MONITOR_LEMBRADO);
    if (!raw) return mapaVazio();
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || !p.hosts || typeof p.hosts !== 'object') return mapaVazio();
    return { version: 1, hosts: p.hosts };
  } catch (_) {
    // intencional — preferência corrompida equivale a «sem preferência»
    return mapaVazio();
  }
}

function gravarMapa(mapa) {
  try {
    localStorage.setItem(LS_MONITOR_LEMBRADO, JSON.stringify(mapa));
  } catch (_) {
    // intencional — quota cheia não pode derrubar a projeção em curso
  }
}

/**
 * Preferência guardada para um host + modo.
 * @param {string} host
 * @param {string} modo
 * @returns {{ligado: boolean, live: boolean, publico: object|null, ministrante: object|null}}
 */
export function lerMonitorLembrado(host, modo) {
  if (!MODOS_COM_MEMORIA.includes(modo)) return preferenciaVazia();
  const doHost = carregarMapa().hosts[chaveHostMonitores(host)];
  const pref = doHost && typeof doHost === 'object' ? doHost[modo] : null;
  if (!pref || typeof pref !== 'object') return preferenciaVazia();
  return {
    ligado: pref.ligado === true,
    live: pref.live === true,
    publico: pref.publico || null,
    ministrante: pref.ministrante || null,
  };
}

function gravarPreferencia(host, modo, pref) {
  if (!MODOS_COM_MEMORIA.includes(modo)) return;
  const mapa = carregarMapa();
  const chave = chaveHostMonitores(host);
  const doHost = mapa.hosts[chave] && typeof mapa.hosts[chave] === 'object' ? mapa.hosts[chave] : {};
  doHost[modo] = pref;
  mapa.hosts[chave] = doHost;
  gravarMapa(mapa);
}

/** O checkbox está marcado neste modo? */
export function lembrarMonitorLigado(host, modo) {
  return lerMonitorLembrado(host, modo).ligado;
}

/**
 * Converte uma rota (índices) na forma persistível por identidade.
 * @param {{publicoIndex: number, ministranteIndex: number, live?: boolean}} rota
 * @param {object[]} lista lista actual de monitores
 */
function identidadesDaRotaLocal(rota, lista) {
  const arr = Array.isArray(lista) ? lista : [];
  const porIndice = (i) => (Number.isFinite(i) && i >= 0 ? arr.find((m) => m && m.index === i) : null);
  return {
    publico: identidadeDoMonitor(porIndice(Number(rota?.publicoIndex))),
    ministrante: identidadeDoMonitor(porIndice(Number(rota?.ministranteIndex))),
  };
}

/**
 * Liga ou desliga o checkbox.
 *
 * Ligar captura a escolha que está no seletor naquele instante — é o que o operador tem à
 * frente quando clica, e obrigá-lo a reescolher para «confirmar» seria pedir duas vezes a
 * mesma coisa. Desligar **não apaga** o que estava guardado: só deixa de o aplicar. Voltar
 * a ligar sem mexer no seletor devolve a escolha anterior, em vez de a perder por um clique
 * acidental.
 *
 * @param {string} host
 * @param {string} modo
 * @param {boolean} ligado
 * @param {{publicoIndex: number, ministranteIndex: number, live?: boolean}} rotaAtual
 * @param {object[]} lista
 */
export function definirLembrarMonitor(host, modo, ligado, rotaAtual, lista) {
  const anterior = lerMonitorLembrado(host, modo);
  if (!ligado) {
    gravarPreferencia(host, modo, { ...anterior, ligado: false });
    return;
  }
  const live = !!(rotaAtual && rotaAtual.live);
  const ids = live ? { publico: null, ministrante: null } : identidadesDaRotaLocal(rotaAtual, lista);
  gravarPreferencia(host, modo, { ligado: true, live, publico: ids.publico, ministrante: ids.ministrante });
}

/**
 * Regista a escolha que o operador acabou de fazer no seletor.
 *
 * Sem efeito com o checkbox desligado — é ele que autoriza a memória a existir. Chamar isto
 * a partir de um caminho automático seria gravar o «Não exibir» que a saída do modo escreve,
 * e a memória apagava-se sozinha.
 *
 * @param {string} host
 * @param {string} modo
 * @param {{publicoIndex: number, ministranteIndex: number, live?: boolean}} rota
 * @param {object[]} lista
 */
export function registrarEscolhaMonitor(host, modo, rota, lista) {
  const pref = lerMonitorLembrado(host, modo);
  if (!pref.ligado) return;
  const live = !!(rota && rota.live);
  const ids = live ? { publico: null, ministrante: null } : identidadesDaRotaLocal(rota, lista);
  gravarPreferencia(host, modo, { ligado: true, live, publico: ids.publico, ministrante: ids.ministrante });
}

/**
 * Rota a repor à entrada no modo.
 *
 * @param {string} host
 * @param {string} modo
 * @param {object[]} lista lista actual de monitores
 * @returns {{aplicar: boolean, rota: {publicoIndex: number, ministranteIndex: number, live: boolean}, faltou: string[]}}
 *   `aplicar: false` — não há nada a repor (checkbox desligado, ou nunca se escolheu nada).
 *   `faltou` traz os nomes guardados que já não existem, para a interface avisar; a
 *   preferência fica intacta no armazenamento.
 */
export function rotaLembradaParaEntrada(host, modo, lista) {
  const pref = lerMonitorLembrado(host, modo);
  const nada = { aplicar: false, rota: { publicoIndex: SEM_EXIBICAO, ministranteIndex: SEM_EXIBICAO, live: false }, faltou: [] };
  if (!pref.ligado) return nada;

  if (pref.live) {
    return { aplicar: true, rota: { publicoIndex: SEM_EXIBICAO, ministranteIndex: SEM_EXIBICAO, live: true }, faltou: [] };
  }

  /* Sem identidade nenhuma o checkbox está ligado mas ainda não há escolha para repor —
     acontece quando se liga o checkbox com o seletor em «Não exibir». Não é o mesmo que
     «repor Não exibir»: aí não há nada a fazer, e dizê-lo evita uma escrita inútil. */
  if (!pref.publico && !pref.ministrante) return nada;

  const faltou = [];
  const resolver = (ident) => {
    if (!ident) return SEM_EXIBICAO;
    const idx = indiceMonitorSalvo(ident, lista);
    if (idx < 0) faltou.push(String(ident.nome || 'monitor desconhecido'));
    return idx;
  };

  return {
    aplicar: true,
    rota: {
      publicoIndex: resolver(pref.publico),
      ministranteIndex: resolver(pref.ministrante),
      live: false,
    },
    faltou,
  };
}
