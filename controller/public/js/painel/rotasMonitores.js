/**
 * Rotas por modo e monitores: persistência por modo, identidade dos monitores, «lembrar monitor»,
 * sanitização das rotas e indicador de projeção ao vivo. Movido verbatim do núcleo
 * (`controllerAppCore.js`); o que o núcleo ainda possui entra por `registrarDependenciasRotasMonitores`.
 */
import { LS_ROTAS_POR_MODO } from '../modules/chavesArmazenamentoLocal.js';
import { MODOS_COM_MEMORIA, lembrarMonitorLigado, registrarEscolhaMonitor, rotaLembradaParaEntrada } from '../modules/monitorLembrado.js';
import { rotaSemMonitorRepetido as aplicarSaidaExclusiva } from '../modules/saidasMonitorExclusivas.js';
import { bibliaHaParteProjetada } from './biblia.js';
import { emModoProjecaoLocal } from './projecaoLocalObs.js';
import { guardarIdentidadesRota, identidadesDaRota, restaurarRotaPorIdentidade } from '../modules/identidadeMonitores.js';
import { hayProjecaoAtivaNoServidor } from './previewProjecao.js';
import { limparNaoExibirManualSlides } from '../modules/reposicaoRotaSlides.js';
import { salvarRoteamentoTelasNoServidor } from './roteamentoTelas.js';
import { getApresentacaoAvisoCard6Ativo } from './conteudoUnificadoAviso.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { avisarMonitoresConfiguradosEmFalta, renderRoteamentoTelas, rotaSelecionadaNaUi } from './roteamentoTelasUi.js';
import { ehModoApresentacaoOperador, ehModoBibliaOperador, ehModoDocsOperador, ehModoSlidesOperador } from './modosUi.js';
import { getServidorIp } from './servidorAlvo.js';
import { estadoServidorEhProjecaoApresentacaoAtivaNoTelao, restaurarRotaSlidesAposLibertarMonitores } from './canaisProjecao.js';

export function modoRoteamentoAtual() {
  if (ehModoDocsOperador()) return 'docs';
  if (ehModoApresentacaoOperador()) return 'apresentacao';
  if (ehModoBibliaOperador()) return 'biblia';
  if (ehModoSlidesOperador()) return 'slides';
  return 'completo';
}

export function modoUsaSeletorMonitorUnificado() {
  const m = modoRoteamentoAtual();
  return m === 'apresentacao' || m === 'biblia' || m === 'docs';
}

export function salvarRotasPorModoNoStorage() {
  try {
    localStorage.setItem(
      LS_ROTAS_POR_MODO,
      JSON.stringify({
        completo: normalizarRota(estadoPainel.rotasPorModo.completo),
        slides: normalizarRota(estadoPainel.rotasPorModo.slides),
      })
    );
  } catch (_) {
  // intencional — erro ignorado
}
}

/*
 * `LS_ROTAS_DEFINIDAS_PELO_OPERADOR` era lido aqui.
 *
 * A marca existia para um fim só: calar o preenchimento automático do modo Slides assim
 * que o operador mexesse no seletor, porque o automatismo não distinguia «ainda não
 * configurado» de «configurado como Não exibir». Com a regra nova — o preenchimento olha
 * apenas para o vazio TOTAL, e «Não exibir» nas duas saídas vale só dentro da sessão do
 * modo (ver `alternarModoSlidesOperador`) — essa distinção deixou de ser precisa, e a
 * marca ficou sem um único leitor.
 *
 * Removida em vez de mantida «por via das dúvidas»: uma chave de localStorage que só se
 * escreve é uma armadilha para quem vier a seguir — parece estado com significado e não
 * governa nada. A chave antiga fica nas instalações existentes, inofensiva, e nada a lê.
 */

export function carregarRotasPorModoDoStorage() {
  try {
    const raw = localStorage.getItem(LS_ROTAS_POR_MODO);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        /* `completo` pode herdar a sessão anterior. O seletor do modo Slides é só de sessão:
           «Não exibir» e qualquer escolha manual morrem no reload — a rota de slides fica
           no estado inicial (−1/−1) até os monitores serem detectados e o padrão M2/M3
           aplicado em `carregarRoteamentoTelasDoServidor`. */
        if (p.completo && typeof p.completo === 'object') {
          estadoPainel.rotasPorModo.completo = normalizarRota(p.completo);
        }
      }
    }
  } catch (_) {
  // intencional — erro ignorado
}
  limparNaoExibirManualSlides();
  estadoPainel.rotasPorModo.slides = rotaDesativada();
  estadoPainel.rotasPorModo.apresentacao = rotaDesativada();
  estadoPainel.rotasPorModo.apresentacaoAviso = rotaDesativada();
  estadoPainel.rotasPorModo.biblia = rotaDesativada();
  estadoPainel.rotasPorModo.docs = rotaDesativada();
}

/**
 * Chave de agrupamento da configuração de monitores.
 * Projetar nesta máquina e comandar um PC servidor são setups de hardware distintos:
 * partilhar configuração entre eles restauraria monitores que não existem do outro lado.
 * @returns {string}
 */
export function hostChaveMonitores() {
  if (emModoProjecaoLocal()) return 'local';
  return getServidorIp() || 'local';
}

/**
 * Grava quais monitores (por identidade) estão em uso, para o próximo arranque.
 *
 * Complementa — não substitui — `salvarRotasPorModoNoStorage`: os índices continuam a
 * ser a moeda de runtime, mas é daqui que sai a verdade quando o Windows renumera os
 * ecrãs entre sessões.
 */
export function persistirIdentidadesDosModos() {
  const host = hostChaveMonitores();
  const lista = estadoPainel.monitoresServidorCache;
  if (!Array.isArray(lista) || !lista.length) return;
  /* Só `completo` e `slides`: são as escolhas duradouras de infraestrutura («o telão é a
     LG TV»). `apresentacao` e `biblia` são rotas de sessão, deliberadamente repostas a
     «Não exibir» em cada arranque — persistir a sua identidade fá-las-ia ressuscitar. */
  ['completo', 'slides'].forEach((modo) => {
    const r = normalizarRota(estadoPainel.rotasPorModo[modo]);
    /* Rota «Live — OBS» não usa monitor nenhum; gravar identidades aqui apagaria a
       escolha física do utilizador só por ele ter ido para o OBS por um momento. */
    if (r.live) return;
    const novas = identidadesDaRota(r, lista);
    /* Rota a −1 porque o monitor sumiu (sanitização), não porque o operador desligou.
       Gravar null apagaria a identidade e o aviso «Monitor não encontrado» desaparecia
       no recarregamento seguinte. */
    if (!novas.publico && !novas.ministrante) {
      const { faltou } = rotaRestauradaPorIdentidade(modo, r);
      if (faltou.length) return;
    }
    guardarIdentidadesRota(host, modo, novas);
  });
}

/**
 * Reescreve uma rota vinda do servidor com os monitores que o utilizador escolheu de facto.
 *
 * Regras:
 * - sem configuração guardada → devolve a rota do servidor intacta (primeira execução);
 * - configuração guardada e monitores presentes → aplica-a, mesmo que os índices do
 *   servidor apontem para outro lado (é exactamente o caso da renumeração do Windows);
 * - configuração guardada mas monitor ausente → devolve o canal desativado, para a UI
 *   pedir nova seleção em vez de projetar no ecrã errado.
 *
 * @param {string} modo
 * @param {object} rotaServidor
 * @returns {{rota: object, faltou: string[]}}
 */
export function rotaRestauradaPorIdentidade(modo, rotaServidor) {
  const lista = estadoPainel.monitoresServidorCache;
  const base = normalizarRota(rotaServidor);
  if (base.live) return { rota: base, faltou: [] };
  if (!Array.isArray(lista) || !lista.length) return { rota: base, faltou: [] };

  const { rota, houveSalvo, faltou } = restaurarRotaPorIdentidade(hostChaveMonitores(), modo, lista);
  if (!houveSalvo) return { rota: base, faltou: [] };
  return { rota: sanitizarRotaProjecao(rota, lista), faltou };
}

export function rotaDesativada() {
  return { publicoIndex: -1, ministranteIndex: -1, live: false };
}

/* ─── «Lembrar monitor» (Bíblia e Mídias) — ver `modules/monitorLembrado.js` ─── */

/** Modo com memória de monitor aberto agora, ou `null`. */
export function modoComMemoriaMonitorAtual() {
  const m = modoRoteamentoAtual();
  return MODOS_COM_MEMORIA.includes(m) ? m : null;
}

/** Põe o checkbox a dizer a verdade sobre o modo que está aberto. */
export function sincronizarCheckboxLembrarMonitor() {
  const chk = document.getElementById('hdr-lembrar-monitor-chk');
  if (!chk) return;
  const modo = modoComMemoriaMonitorAtual();
  chk.checked = !!modo && lembrarMonitorLigado(hostChaveMonitores(), modo);
}

/**
 * Grava a escolha que o operador acabou de fazer no seletor unificado.
 *
 * Só daqui — do clique. Os caminhos automáticos escrevem «Não exibir» ao sair do modo, e
 * ouvi-los faria a memória apagar-se a si própria.
 */
export function registrarEscolhaMonitorDoOperador() {
  const modo = modoComMemoriaMonitorAtual();
  if (!modo) return;
  const rota = rotaSelecionadaNaUi();
  if (!rota) return;
  registrarEscolhaMonitor(hostChaveMonitores(), modo, rota, estadoPainel.monitoresServidorCache);
  avisarMonitoresConfiguradosEmFalta();
}

/**
 * Repõe o monitor lembrado — só à ENTRADA no modo.
 *
 * Aplicar isto a meio de uma projeção moveria a janela do que está no ar, e é por isso que
 * a projeção activa manda: com mídia ou versículo no telão, a rota em vigor fica como está
 * e a memória espera pela próxima entrada. «Monitor lembrado ≠ projeção ativa» corta nos
 * dois sentidos.
 *
 * @param {'biblia'|'apresentacao'} modo
 * @returns {boolean} houve reposição
 */
export function aplicarMonitorLembradoAoEntrarNoModo(modo) {
  if (!MODOS_COM_MEMORIA.includes(modo)) return false;
  if (hayProjecaoAtivaModoBibliaOuApresentacao()) return false;
  /* Slides no ar: repor o monitor lembrado da Bíblia/Mídias reivindica o canal
     partilhado e o merge do servidor apaga a letra — trocar de aba não pode fazer isso. */
  if (estadoPainel.projecaoMusicaEmitidaNoServidor) return false;
  /* Sem lista de monitores não se conclui nada: entrar no modo antes de o servidor
     responder daria «monitor não encontrado» para um monitor que está ligado e bem. A
     entrada seguinte, já com a lista, repõe. */
  if (!Array.isArray(estadoPainel.monitoresServidorCache) || !estadoPainel.monitoresServidorCache.length) return false;
  const { aplicar, rota, faltou } = rotaLembradaParaEntrada(
    hostChaveMonitores(),
    modo,
    estadoPainel.monitoresServidorCache
  );
  if (!aplicar) return false;
  estadoPainel.rotasPorModo[modo] = sanitizarRotaProjecao(rota, estadoPainel.monitoresServidorCache);

  /*
   * A Bíblia não tem canal próprio no servidor: viaja no `apresentacao`, e é dali que
   * `obterRotaApresentacaoParaServidor()` monta o pacote. Sem este espelho, repor o monitor
   * lembrado enchia `rotasPorModo.biblia` e o servidor continuava a receber -1 — o painel
   * dava a projeção por feita e o M2 ficava vazio.
   *
   * O espelhamento já existia, mas só no ramo `usarValoresDaUi === true` de
   * `salvarRoteamentoTelasNoServidor` — o clique do operador. A reposição entra pelo
   * caminho automático e não passava por lá.
   *
   * Sem guarda de mídia no ar aqui de propósito: esta função já desistiu acima se houvesse
   * qualquer projeção activa, que é a mesma condição sob a qual aquele ramo se abstém de
   * mexer no canal partilhado.
   */
  if (modo === 'biblia') {
    estadoPainel.rotasPorModo.apresentacao = { ...normalizarRota(estadoPainel.rotasPorModo.biblia) };
  }

  /* Aviso do cabeçalho: só depende de haver (ou não) monitor de projeção. */
  avisarMonitoresConfiguradosEmFalta();
  return true;
}

export function normalizarRota(obj) {
  const live = !!(obj && obj.live);
  const pub = parseInt(obj?.publicoIndex, 10);
  const min = parseInt(obj?.ministranteIndex, 10);
  return {
    publicoIndex: live ? -1 : Number.isFinite(pub) ? pub : -1,
    ministranteIndex: live ? -1 : Number.isFinite(min) ? min : -1,
    live,
  };
}

/**
 * Um monitor serve **uma** saída de cada vez — a regra vive em
 * `modules/saidasMonitorExclusivas.js`, para se poder ler e testar sem DOM.
 * Aqui só se garante que ela recebe uma rota já normalizada.
 *
 * @param {{publicoIndex:number, ministranteIndex:number, live?:boolean}} rota
 * @param {'publico'|'ministrante'} [canalQuePrevalece] a saída que o operador acabou de mexer
 */
export function rotaSemMonitorRepetido(rota, canalQuePrevalece = 'publico') {
  return aplicarSaidaExclusiva(normalizarRota(rota), canalQuePrevalece);
}

function indiceMonitorPrincipalNaLista(monitores) {
  const lista = Array.isArray(monitores) ? monitores : [];
  const m = lista.find((x) => x && x.primary);
  return m != null ? m.index : 0;
}

/** Monitores onde a projeção pode abrir (nunca o principal / tela do utilizador). */
export function listaMonitoresParaProjecao(lista) {
  const principal = indiceMonitorPrincipalNaLista(lista);
  return (Array.isArray(lista) ? lista : []).filter((m) => m && m.index !== principal);
}

export function sanitizarIndiceMonitorProjecao(idx, lista) {
  if (!Number.isFinite(idx) || idx < 0) return -1;
  if (idx === indiceMonitorPrincipalNaLista(lista)) return -1;
  if (!(Array.isArray(lista) ? lista : []).some((m) => m && m.index === idx)) return -1;
  return idx;
}

/** Corrige rota salva com público/ministrante trocados (índices 2↔1 = Monitor 3↔2). */
function corrigirRotaMonitoresInvertida(rota, lista) {
  const r = normalizarRota(rota);
  if (r.live) return r;
  const sec = listaMonitoresParaProjecao(lista);
  const temM2 = sec.some((m) => m && m.index === 1);
  const temM3 = sec.some((m) => m && m.index === 2);
  if (!temM2 || !temM3) return r;
  if (r.publicoIndex === 2 && r.ministranteIndex === 1) {
    return { ...r, publicoIndex: 1, ministranteIndex: 2 };
  }
  return r;
}

export function sanitizarRotaProjecao(rota, lista) {
  const r = normalizarRota(rota);
  if (r.live) return r;
  const base = {
    live: false,
    publicoIndex: sanitizarIndiceMonitorProjecao(r.publicoIndex, lista),
    ministranteIndex: sanitizarIndiceMonitorProjecao(r.ministranteIndex, lista),
  };
  return corrigirRotaMonitoresInvertida(base, lista);
}

export function marcarRotaLiveNoDom(ligado) {
  const hidPub = document.getElementById('route-publico');
  const hidMin = document.getElementById('route-ministrante');
  if (!hidPub || !hidMin) return;
  if (ligado) {
    hidPub.dataset.live = '1';
    hidMin.dataset.live = '1';
  } else {
    delete hidPub.dataset.live;
    delete hidMin.dataset.live;
  }
}

export function rotaLiveSelecionadaNaUi() {
  const hidPub = document.getElementById('route-publico');
  return !!(hidPub && hidPub.dataset && hidPub.dataset.live === '1');
}

/**
 * Imagem/vídeo/PDF/aviso do modo Mídias ainda no telão.
 * Trocar de modo NÃO pode encerrar esta projeção nem desativar a rota partilhada.
 */
export function hayProjecaoMidiaApresentacaoAtiva() {
  if (estadoPainel.apresentacaoMidiaProjetadaId) return true;
  if (estadoServidorEhProjecaoApresentacaoAtivaNoTelao()) return true;
  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return false;
  /*
   * `projecaoMinistranteApresentacao` diz apenas «há override no canal ministrante», e
   * não «há mídia no ar». A Bíblia projetada só no público também levanta essa marca: o
   * aplicador põe um override de tela limpa no ministrante para ele não continuar a
   * mostrar o que lá estava. Sem esta exclusão, o modo Bíblia dava-se a si próprio como
   * «mídia activa» e adoptava a rota antiga da Apresentação, descartando a escolha que o
   * operador acabara de fazer no seletor.
   *
   * Só `biblia` é excluída, e não `musica`: com slides no público é legítimo haver mídia
   * no canal do ministrante, e essa combinação tem de continuar a contar como activa. Com
   * a Bíblia não há ambiguidade — `exibir_versiculo` escreve sempre o override do
   * ministrante, portanto nenhuma mídia pode estar viva lá nesse momento.
   */
  if (e.tipo === 'biblia') return false;
  if (e.projecaoMinistranteApresentacao) return true;
  return false;
}

export function hayProjecaoApresentacaoModoAtiva() {
  return hayProjecaoMidiaApresentacaoAtiva() || getApresentacaoAvisoCard6Ativo();
}

/** Projeção de Bíblia ou apresentação ainda no ar — ao mudar de tela, manter rota de monitores. */
export function hayProjecaoAtivaModoBibliaOuApresentacao() {
  if (hayProjecaoApresentacaoModoAtiva()) return true;
  if (bibliaHaParteProjetada()) return true;
  const e = estadoPainel.estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.projecaoLive && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length) return true;
  if (e.projecaoBibliaMinistrante) return true;
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) return true;
  return false;
}

export async function desativarRotasModosTransitorios(opts = {}) {
  if (opts.forcar !== true && hayProjecaoAtivaModoBibliaOuApresentacao()) return;
  const sync = opts.sincronizarServidor !== false;
  const projecaoApAtiva = hayProjecaoApresentacaoModoAtiva();
  /* Mídia no ar: Bíblia e Mídias partilham o canal `apresentacao` no dual-routing —
     desativar essa rota fecharia as janelas e encerraria a projeção. */
  if (!projecaoApAtiva) {
    estadoPainel.rotasPorModo.apresentacao = rotaDesativada();
    restaurarRotaSlidesAposLibertarMonitores();
  }
  estadoPainel.rotasPorModo.biblia = rotaDesativada();
  marcarRotaLiveNoDom(projecaoApAtiva ? !!normalizarRota(estadoPainel.rotasPorModo.apresentacao).live : false);
  const modo = modoRoteamentoAtual();
  if (modo === 'apresentacao' || modo === 'biblia') {
    renderRoteamentoTelas(estadoPainel.monitoresServidorCache, estadoPainel.rotasPorModo[modo]);
  }
  if (sync) {
    try {
      await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
    } catch (_) {
  // intencional — erro ignorado
}
  }
  atualizarIndicadorProjecaoLiveUi();
}

export function atualizarIndicadorProjecaoLiveUi() {
  const el = document.getElementById('indicador-live-obs');
  const wrap = document.getElementById('route-publico-dd');
  const liveSel = rotaLiveSelecionadaNaUi();
  const emModoLive = ehModoBibliaOperador() || ehModoApresentacaoOperador();
  const projetando =
    emModoLive &&
    liveSel &&
    hayProjecaoAtivaNoServidor() &&
    !!(estadoPainel.estadoServidor && estadoPainel.estadoServidor.projecaoLive);
  /*
     O selo «● LIVE → OBS» não aparece no modo Bíblia.

     Ali ele não acrescenta nada: o seletor ao lado já diz «Live — OBS», e o próprio
     versículo no ar é a confirmação de que está a sair. Dois avisos da mesma coisa, um
     deles a pulsar, num canto do cabeçalho que o operador tem debaixo dos olhos durante
     o culto inteiro.

     No modo Apresentação continua: lá o que está no ar é mídia, que pode estar a tocar sem
     o operador a ver, e o selo é o único sinal de que a saída Live está mesmo ativa. */
  const mostrarSelo = projetando && !ehModoBibliaOperador();
  if (el) {
    el.classList.toggle('oculto', !mostrarSelo);
    el.classList.toggle('indicador-live-obs--ativo', mostrarSelo);
  }
  if (wrap) {
    wrap.classList.toggle('route-dd--live-projetando', projetando);
    /* O seletor escolhe o destino; quem diz que há projeção no ar são os outros
       indicadores (pill, versículo na grelha, selo Live). */
    wrap.classList.remove('route-dd--projetando');
  }
  const btn = document.getElementById('route-publico-btn');
  if (btn && emModoLive && liveSel) {
    btn.title = projetando
      ? 'Live ativa — versículo no OBS (http://127.0.0.1:5001/obs)'
      : 'Live — OBS (sem monitores físicos; use Browser Source no OBS)';
  }
}

/** Índice efetivo por canal: apresentação substitui o slide no mesmo monitor. */
export function indicesEfetivosRoteamentoDualCliente() {
  const s = normalizarRota(estadoPainel.rotasPorModo.slides);
  const a = normalizarRota(estadoPainel.rotasPorModo.apresentacao);
  if (a.live) {
    return { publicoIndex: -1, ministranteIndex: -1, live: true };
  }
  return {
    publicoIndex: a.publicoIndex >= 0 ? a.publicoIndex : s.publicoIndex,
    ministranteIndex: a.ministranteIndex >= 0 ? a.ministranteIndex : s.ministranteIndex,
    live: false,
  };
}
