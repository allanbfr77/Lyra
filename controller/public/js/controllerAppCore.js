/**
 * =============================================================================
 * Lyra — Painel do controlador (JavaScript do renderer)
 * =============================================================================
 * Este ficheiro era um <script> inline gigante em controller.html. Foi extraído
 * para facilitar leitura, comentários e futuras divisões em módulos.
 *
 * ORDEM DE CARREGAMENTO (controller.html)
 *   1. publicDisplayConfig.js — defaults de configuração de telas (partilhado)
 *   2. controllerApp.js (entrada ES module) → carrega este ficheiro
 *   3. controllerAppCore.js — toda a lógica deste painel (estado, UI, Socket.IO)
 *
 * CONVENÇÃO DE NOMES (não alterar à ligeira: HTML chama muitas funções por string)
 *   LS_*     — chaves do localStorage (persistência no browser)
 *   socket   — cliente Socket.IO para o servidor de projeção (porta 5510)
 *   estadoServidor — espelho do estado emitido pelo servidor ("estado")
 *   ehModo*  — funções que perguntam qual modo de UI está ativo (body.classList)
 *
 * MAPA DE SECÇÕES (marcadores «SECÇÃO A» … «SECÇÃO H» em comentários de linha)
 *   A — Modos de interface (slides / apresentação / completo) e transições
 *   B — Modo apresentação (ficheiros, áudio, grelha, HTTP :3001)
 *   C — Cultos, playlists, cópias locais, chaves localStorage
 *   D — Slides (dock, zoom, chips, edição de estrofes)
 *   E — Pré-visualização telão/ministrante e espelho do estado remoto
 *   F — Ligação IP, HTTP :3001 (músicas, bíblia, playlists, debounces)
 *   G — Socket.IO (estado em tempo real, sync playlists/músicas)
 *   H — Tema escuro, modal de configuração de exibição, atalhos
 *
 * Módulos ES (`js/modules/`):
 *   chavesArmazenamentoLocal.js — chaves localStorage, URLs, SVG estáticos
 *   ponteHtmlWindow.js — expõe no `window` as funções chamadas pelo HTML inline
 * `js/painel/` — utilitários reutilizáveis (extrair gradualmente mais blocos aqui)
 * =============================================================================
 */

import {
  LS_UI_MODO_SLIDES,
  LS_PREVIEW_PAINEL_OCULTO,
  LS_PLAYLIST_PREVIEW_SLIDE_OCULTO,
  LS_MODO_APRESENTACAO_ATIVO,
  LS_ROTAS_POR_MODO,
  LS_APRESENTACAO_STATE,
  LS_BIBLIA_CFG,
  LS_SLIDE_CFG,
  SVG_OLHO_ABERTO,
  SVG_OLHO_CORTADO,
  LS_PLAYLISTS,
  LS_PLAYLISTS_LEGACY,
  LS_CULTO,
  LS_CULTO_LEGACY,
  LS_CULTOS_MANUAIS,
  LS_PLAYLIST_TEMA_SEL,
  LS_PLAYLIST_TEMAS,
  LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS,
  LS_PLAYLIST_ABERTURA_REMOVIDA,
  TEMA_PADRAO_ABERTURA,
  PLAYLIST_TIPO_MARCADOR_TEMA,
  LS_COPIAS_LOCAIS,
  LS_IP_KEY,
  LS_IP_LEGACY,
  LS_SLIDES_RAIL_PX,
  LS_SLIDES_PREVIEW_H_PX,
  LS_SLIDES_CHIP_ZOOM,
  CLOUD_SHARE_URL,
  LS_FILTRO_TITULO,
  LS_FILTRO_ARTISTA,
  LS_FILTRO_LETRA,
  LS_BANCO_SQLITE_LISTA_ABERTA,
  ID_PROJECAO_AVISO_CARD6,
  SVG_PLAYLIST_SECAO_EXPANDIR,
  SVG_PLAYLIST_SECAO_RECOLHER,
  LS_DARK_CTRL,
} from './modules/chavesArmazenamentoLocal.js';
import { migrarChavesLegadoLocalStorage } from './modules/migrarChavesArmazenamentoLocal.js';
import { exporCallbacksParaAtributosHtml } from './modules/ponteHtmlWindow.js';
import { criarReconhecimentoVozSlides } from './modules/reconhecimentoVozSlides.js';
import { criarReconhecimentoVozBiblia } from './modules/reconhecimentoVozBiblia.js';
import {
  configurarNotasSlideControlador,
  atualizarNotaSlideControladorUI,
} from './modules/notasSlideControlador.js';
import {
  filtrarLinhasParaPublico,
  aplicarPreviewMinistranteNoElemento,
  textoPlanoDeElementoPreviewMinistrante,
} from './modules/comentariosSlide.js';

migrarChavesLegadoLocalStorage();
import { escapeHtml } from './painel/textoHtmlSeguro.js';
import {
  limparEstiloPreviewSlide,
  aplicarClasseLinhas,
  reaplicarFontesPreviewPainel,
} from './painel/tipografiaPainelPreview.js';
import {
  criarPortaProjecao,
  criarTransporteSocket,
  criarTransporteLocal,
} from './modules/projecaoPorta.js';
import { criarMotorAudioLocal } from './modules/motorAudioLocal.js';
import {
  LIMITE_DIVISAO_PADRAO,
  normalizarLimiteDivisao,
  dividirVersiculos,
  indicePrimeiraParteDoVersiculo,
} from './modules/dividirVersiculos.js';
import {
  identidadesDaRota,
  guardarIdentidadesRota,
  restaurarRotaPorIdentidade,
} from './modules/identidadeMonitores.js';

/**
 * Porta de projeção — ver `modules/projecaoPorta.js`.
 *
 * Todo comando destinado às telas passa por aqui, e todo retorno sobre o que está
 * projetado entra por aqui. Nasce sem transporte: `iniciarSocket()` liga-lhe o socket.
 * Enquanto não houver transporte, `pronta()` é `false` e nada é enviado — o mesmo que
 * acontecia antes com `socket` ainda `null`.
 */
const projecao = criarPortaProjecao();

// --- SECÇÃO A: modos de UI, localStorage de layout, ícones ---
/** v2: padrão é modo completo; chave nova ignora preferência legada que deixava sempre «modo slides» ao abrir o .exe. */

function ehModoSlidesOperador() {
  return document.body.classList.contains('app-mod-slides');
}
function ehModoApresentacaoOperador() {
  return document.body.classList.contains('app-mod-apresentacao');
}
function ehModoBibliaOperador() {
  return document.body.classList.contains('app-mod-biblia');
}

function liberarBloqueioUiModos() {
  try {
    if (typeof fecharMenusRoteamentoTelas === 'function') fecharMenusRoteamentoTelas();
  } catch (_) {
  // intencional — erro ignorado
}
  try {
    if (typeof bibliaNavPopupFechar === 'function') bibliaNavPopupFechar();
    const ov = document.getElementById('app-dialog-overlay');
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    document.getElementById('cfg-modal-overlay-ctrl')?.classList.remove('aberto');
    [
      'slide-quick-edit-backdrop',
      'slide-nota-backdrop',
      'slide-delete-confirm-backdrop',
      'letras-preview-backdrop',
      'musica-excluir-backdrop',
      'nova-musica-manual-backdrop',
      'culto-calendario-backdrop',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    const ctxMenu = document.getElementById('slides-strip-context-menu');
    if (ctxMenu) ctxMenu.hidden = true;
  } catch (_) {
  // intencional — erro ignorado
}
}

/**
 * Transição suave ao mudar modo ou aba (View Transitions API — Chromium/Electron).
 * No Electron a API pode deixar uma camada que bloqueia cliques — aí aplica o callback direto.
 */
function executarComTransicaoUi(fn) {
  try {
    liberarBloqueioUiModos();
  } catch (err) {
    console.error('[Lyra] liberarBloqueioUiModos', err);
  }
  const semAnimacaoViewTransition =
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    !!(typeof window !== 'undefined' && window.process?.versions?.electron);
  try {
    if (semAnimacaoViewTransition) {
      fn();
      return Promise.resolve();
    }
    if (typeof document.startViewTransition === 'function') {
      return document.startViewTransition(fn);
    }
  } catch (_) {
  // intencional — erro ignorado
}
  fn();
  return Promise.resolve();
}

function aplicarRotulosEPlaylistModoSlides() {
  const modo = ehModoSlidesOperador();
  const headPl = document.getElementById('playlist-panel-head');
if (headPl) {
  /*
    Título em elemento próprio (não num nó de texto solto): na coluna estreita do modo
    slides o texto corrido quebrava a meio. Agora é só «PLAYLIST», numa linha, com os
    botões do cabeçalho intactos.
  */
  let titulo = headPl.querySelector('.playlist-panel-head-titulo');
  if (!titulo) {
    titulo = document.createElement('span');
    titulo.className = 'playlist-panel-head-titulo';
    headPl.insertBefore(titulo, headPl.firstChild);
  }
  // Neutraliza o nó de texto original do HTML («CULTO & PLAYLIST»), se ainda existir.
  headPl.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) n.textContent = '';
  });
  titulo.textContent = modo ? 'PLAYLIST' : 'CULTO & PLAYLIST';
}
  /*
    Rótulo da barra da faixa: no modo slides ela identifica o que está carregado
    («MÚSICA ATUAL › Clamo Jesus»); nos outros modos continua a nomear a secção
    («SLIDES • Clamo Jesus»).
  */
  const marcaFaixa = document.querySelector('.slides-dock-bar-left .slides-dock-marca');
  const sepFaixa = document.querySelector('.slides-dock-bar-left .slides-dock-sep');
  if (marcaFaixa) marcaFaixa.textContent = modo ? 'Música atual' : 'Slides';
  if (sepFaixa) sepFaixa.textContent = modo ? '›' : '•';
  const playlistAcoes =
    document.getElementById('playlist-compartilhar-btn')?.parentElement
    || document.getElementById('playlist-importar-btn')?.parentElement;
  if (playlistAcoes) playlistAcoes.hidden = modo;
  const t0 = document.getElementById('preview-titulo-tela-0');
  const t1 = document.getElementById('preview-titulo-tela-1');
  if (t0) t0.textContent = 'TELÃO / PÚBLICO / IGREJA';
  if (t1) t1.textContent = 'TV / MINISTRANTE / RETORNO';
}

/**
 * Estado visual + acessível de um botão de modo do dock do cabeçalho.
 * `primary` é a classe de seleção lida pelo CSS; `aria-pressed` expõe o mesmo
 * estado a leitores de ecrã.
 */
function definirEstadoBtnModoCabecalho(idBtn, ativo, tituloAtivo, tituloInativo) {
  const btn = document.getElementById(idBtn);
  if (!btn) return;
  btn.classList.toggle('primary', ativo);
  btn.setAttribute('aria-pressed', ativo ? 'true' : 'false');
  btn.title = ativo ? tituloAtivo : tituloInativo;
}

function atualizarBtnToggleModoSlides() {
  definirEstadoBtnModoCabecalho(
    'btn-toggle-modo-slides',
    ehModoSlidesOperador(),
    'MODO SLIDE (ativo)',
    'Entrar no MODO SLIDE',
  );
  atualizarBtnModoBiblia();
}

function atualizarBtnModoApresentacao() {
  definirEstadoBtnModoCabecalho(
    'btn-modo-apresentacao',
    ehModoApresentacaoOperador(),
    'MODO APRESENTAÇÃO (ativo)',
    'Entrar no MODO APRESENTAÇÃO',
  );
  atualizarBtnToggleModoSlides();
}

function irParaTelaInicial() {
  if (ehModoApresentacaoOperador()) {
    fecharMenuModoApresentacao();
    return;
  }
  if (ehModoBibliaOperador()) {
    alternarModoBiblia();
    return;
  }
  if (ehModoSlidesOperador()) {
    alternarModoSlidesOperador({ permitirDesativar: true });
    return;
  }
  liberarBloqueioUiModos();
  atualizarBtnToggleModoSlides();
}

// --- SECÇÃO B — Modo apresentação (tipos de ficheiro, grelha, áudio, sincronização de estado no :3001) ---
function detectarKindApresentacaoPorMimeOuNome(mime, nome) {
  const m = String(mime || '').toLowerCase();
  const n = String(nome || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  /* Windows / alguns browsers devolvem type vazio para .jpg/.png — inferir pela extensão. */
  if (/\.(jpe?g|png|gif|webp|bmp|svg|avif|ico)(\?|$)/i.test(n)) return 'image';
  if (m.startsWith('video/')) return 'video';
  /* Mesmo caso no Windows para .mp4/.webm com type vazio. */
  if (/\.(mp4|webm|mov|mkv|m4v|ogv|avi)(\?|$)/i.test(n)) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  return 'iframe';
}

function modoRoteamentoAtual() {
  if (ehModoApresentacaoOperador()) return 'apresentacao';
  if (ehModoBibliaOperador()) return 'biblia';
  if (ehModoSlidesOperador()) return 'slides';
  return 'completo';
}

function modoUsaSeletorMonitorUnificado() {
  const m = modoRoteamentoAtual();
  return m === 'apresentacao' || m === 'biblia';
}

function salvarRotasPorModoNoStorage() {
  try {
    localStorage.setItem(
      LS_ROTAS_POR_MODO,
      JSON.stringify({
        completo: normalizarRota(rotasPorModo.completo),
        slides: normalizarRota(rotasPorModo.slides),
      })
    );
  } catch (_) {
  // intencional — erro ignorado
}
}

function carregarRotasPorModoDoStorage() {
  try {
    const raw = localStorage.getItem(LS_ROTAS_POR_MODO);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return;
    ['completo', 'slides'].forEach((k) => {
      if (!p[k] || typeof p[k] !== 'object') return;
      rotasPorModo[k] = normalizarRota(p[k]);
    });
  } catch (_) {
  // intencional — erro ignorado
}
  rotasPorModo.apresentacao = rotaDesativada();
  rotasPorModo.biblia = rotaDesativada();
}

/**
 * Chave de agrupamento da configuração de monitores.
 * Projetar nesta máquina e comandar um PC servidor são setups de hardware distintos:
 * partilhar configuração entre eles restauraria monitores que não existem do outro lado.
 * @returns {string}
 */
function hostChaveMonitores() {
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
function persistirIdentidadesDosModos() {
  const host = hostChaveMonitores();
  const lista = monitoresServidorCache;
  if (!Array.isArray(lista) || !lista.length) return;
  /* Só `completo` e `slides`: são as escolhas duradouras de infraestrutura («o telão é a
     LG TV»). `apresentacao` e `biblia` são rotas de sessão, deliberadamente repostas a
     «Desativado» em cada arranque — persistir a sua identidade fá-las-ia ressuscitar. */
  ['completo', 'slides'].forEach((modo) => {
    const r = normalizarRota(rotasPorModo[modo]);
    /* Rota «Live — OBS» não usa monitor nenhum; gravar identidades aqui apagaria a
       escolha física do utilizador só por ele ter ido para o OBS por um momento. */
    if (r.live) return;
    guardarIdentidadesRota(host, modo, identidadesDaRota(r, lista));
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
function rotaRestauradaPorIdentidade(modo, rotaServidor) {
  const lista = monitoresServidorCache;
  const base = normalizarRota(rotaServidor);
  if (base.live) return { rota: base, faltou: [] };
  if (!Array.isArray(lista) || !lista.length) return { rota: base, faltou: [] };

  const { rota, houveSalvo, faltou } = restaurarRotaPorIdentidade(hostChaveMonitores(), modo, lista);
  if (!houveSalvo) return { rota: base, faltou: [] };
  return { rota: sanitizarRotaProjecao(rota, lista), faltou };
}

function rotaDesativada() {
  return { publicoIndex: -1, ministranteIndex: -1, live: false };
}

function normalizarRota(obj) {
  const live = !!(obj && obj.live);
  const pub = parseInt(obj?.publicoIndex, 10);
  const min = parseInt(obj?.ministranteIndex, 10);
  return {
    publicoIndex: live ? -1 : Number.isFinite(pub) ? pub : -1,
    ministranteIndex: live ? -1 : Number.isFinite(min) ? min : -1,
    live,
  };
}

function indiceMonitorPrincipalNaLista(monitores) {
  const lista = Array.isArray(monitores) ? monitores : [];
  const m = lista.find((x) => x && x.primary);
  return m != null ? m.index : 0;
}

/** Monitores onde a projeção pode abrir (nunca o principal / tela do utilizador). */
function listaMonitoresParaProjecao(lista) {
  const principal = indiceMonitorPrincipalNaLista(lista);
  return (Array.isArray(lista) ? lista : []).filter((m) => m && m.index !== principal);
}

function sanitizarIndiceMonitorProjecao(idx, lista) {
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

function sanitizarRotaProjecao(rota, lista) {
  const r = normalizarRota(rota);
  if (r.live) return r;
  const base = {
    live: false,
    publicoIndex: sanitizarIndiceMonitorProjecao(r.publicoIndex, lista),
    ministranteIndex: sanitizarIndiceMonitorProjecao(r.ministranteIndex, lista),
  };
  return corrigirRotaMonitoresInvertida(base, lista);
}

function marcarRotaLiveNoDom(ligado) {
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

function rotaLiveSelecionadaNaUi() {
  const hidPub = document.getElementById('route-publico');
  return !!(hidPub && hidPub.dataset && hidPub.dataset.live === '1');
}

/**
 * Imagem/vídeo/PDF/aviso do modo Mídias ainda no telão.
 * Trocar de modo NÃO pode encerrar esta projeção nem desativar a rota partilhada.
 */
function hayProjecaoMidiaApresentacaoAtiva() {
  if (apresentacaoMidiaProjetadaId) return true;
  if (estadoServidorEhProjecaoApresentacaoAtivaNoTelao()) return true;
  const e = estadoServidor;
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

/** Projeção de Bíblia ou apresentação ainda no ar — ao mudar de tela, manter rota de monitores. */
function hayProjecaoAtivaModoBibliaOuApresentacao() {
  if (hayProjecaoMidiaApresentacaoAtiva()) return true;
  if (bibliaParteProjetadaChave != null) return true;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.projecaoLive && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length) return true;
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) return true;
  return false;
}

async function desativarRotasModosTransitorios(opts = {}) {
  if (opts.forcar !== true && hayProjecaoAtivaModoBibliaOuApresentacao()) return;
  const sync = opts.sincronizarServidor !== false;
  const midiaAtiva = hayProjecaoMidiaApresentacaoAtiva();
  /* Mídia no ar: Bíblia e Mídias partilham o canal `apresentacao` no dual-routing —
     desativar essa rota fecharia as janelas e encerraria a projeção. */
  if (!midiaAtiva) {
    rotasPorModo.apresentacao = rotaDesativada();
  }
  rotasPorModo.biblia = rotaDesativada();
  marcarRotaLiveNoDom(midiaAtiva ? !!normalizarRota(rotasPorModo.apresentacao).live : false);
  const modo = modoRoteamentoAtual();
  if (modo === 'apresentacao' || modo === 'biblia') {
    renderRoteamentoTelas(monitoresServidorCache, rotasPorModo[modo]);
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

function atualizarIndicadorProjecaoLiveUi() {
  const el = document.getElementById('indicador-live-obs');
  const wrap = document.getElementById('route-publico-dd');
  const liveSel = rotaLiveSelecionadaNaUi();
  const emModoLive = ehModoBibliaOperador() || ehModoApresentacaoOperador();
  const projetando =
    emModoLive &&
    liveSel &&
    hayProjecaoAtivaNoServidor() &&
    !!(estadoServidor && estadoServidor.projecaoLive);
  if (el) {
    el.classList.toggle('oculto', !projetando);
    el.classList.toggle('indicador-live-obs--ativo', projetando);
  }
  if (wrap) {
    wrap.classList.toggle('route-dd--live-projetando', projetando);
  }
  const btn = document.getElementById('route-publico-btn');
  if (btn && emModoLive && liveSel) {
    btn.title = projetando
      ? 'Live ativa — versículo no OBS (http://127.0.0.1:5001/obs)'
      : 'Live — OBS (sem monitores físicos; use Browser Source no OBS)';
  }
}

/** Índice efetivo por canal: apresentação substitui o slide no mesmo monitor. */
function indicesEfetivosRoteamentoDualCliente() {
  const s = normalizarRota(rotasPorModo.slides);
  const a = normalizarRota(rotasPorModo.apresentacao);
  if (a.live) {
    return { publicoIndex: -1, ministranteIndex: -1, live: true };
  }
  return {
    publicoIndex: a.publicoIndex >= 0 ? a.publicoIndex : s.publicoIndex,
    ministranteIndex: a.ministranteIndex >= 0 ? a.ministranteIndex : s.ministranteIndex,
    live: false,
  };
}

function apresentacaoOcupandoCanalPublico() {
  return normalizarRota(rotasPorModo.apresentacao).publicoIndex >= 0;
}

function apresentacaoOcupandoCanalMinistrante() {
  return normalizarRota(rotasPorModo.apresentacao).ministranteIndex >= 0;
}

/** Projeção activa do modo Apresentação no canal público (rota apresentação + estado no telão). */
function apresentacaoProjecaoAtivaNoCanalPublico() {
  const ap = normalizarRota(rotasPorModo.apresentacao);
  if (ap.live || ap.publicoIndex < 0) return false;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  if (e.tipo === 'apresentacao' && e.apresentacao && String(e.apresentacao.src || '').trim()) {
    return true;
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) return true;
  return false;
}

/** Projeção activa do modo Apresentação no canal ministrante. */
function apresentacaoProjecaoAtivaNoCanalMinistrante() {
  const ap = normalizarRota(rotasPorModo.apresentacao);
  if (ap.live || ap.ministranteIndex < 0) return false;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.blackout || e.slidePretoFinal) return false;
  /* Apenas M3: telão no socket pode ficar «limpo» com projecaoMinistranteApresentacao. */
  if (e.projecaoMinistranteApresentacao) return true;
  if (e.tipo === 'biblia' || e.tipo === 'musica') return false;
  if (
    ap.publicoIndex < 0 &&
    e.tipo === 'apresentacao' &&
    e.apresentacao &&
    String(e.apresentacao.src || '').trim()
  ) {
    return true;
  }
  return false;
}

/**
 * Telão com mídia do modo Apresentação activa (ignora Bíblia, Slides e fundo estático).
 * Usado pelo preview do modo Slide — não confundir bgImage da Bíblia com projeção.
 */
function estadoServidorEhProjecaoApresentacaoAtivaNoTelao() {
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.tipo === 'biblia' || e.tipo === 'musica') return false;
  if (e.telaLimpa || e.blackout || e.slidePretoFinal) return false;
  if (e.tipo === 'apresentacao') {
    return !!(e.apresentacao && String(e.apresentacao.src || '').trim());
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) return true;
  return false;
}

/** Preview Slide (público): informe de mídia da Apresentação activa no telão público. */
function slidePreviewDeveMostrarInformeMidiaApresentacaoNoPublico() {
  if (!ehModoSlidesOperador()) return false;
  return apresentacaoProjecaoAtivaNoCanalPublico();
}

/** Preview Slide (ministrante): informe de mídia da Apresentação activa na TV ministrante. */
function slidePreviewDeveMostrarInformeMidiaApresentacaoNoMinistrante() {
  if (!ehModoSlidesOperador()) return false;
  return apresentacaoProjecaoAtivaNoCanalMinistrante();
}

function preencherPreviewInformeMidiaApresentacaoSlide(el) {
  if (!el) return;
  const e = estadoServidor;
  const ap = e && e.apresentacao ? e.apresentacao : {};
  const kind = String(ap.kind || 'image').toLowerCase();
  const tipoRotulo = rotuloTipoMidiaApresentacao(kind);
  const linhaTxt = `${tipoRotulo} no telão`;
  el.innerHTML = `<span class="pv-live-ap-meta">${svgIconeTipoMidiaApresentacao(kind)}<span class="pv-live-ap-meta-txt">${escapeHtml(linhaTxt)}</span></span>`;
  const clsBase = el.classList.contains('op-slide-text') ? 'op-slide-text' : 'pv-live-letras';
  el.className = clsBase;
  el.classList.remove('vazio');
  limparEstiloPreviewSlide(el);
}

/** Apresentação no público e slides no público em monitores diferentes (convivência). */
function slidesCanalPublicoSeparadoDaApresentacao() {
  if (!ehModoSlidesOperador()) return false;
  const ap = normalizarRota(rotasPorModo.apresentacao);
  const sl = normalizarRota(rotasPorModo.slides);
  if (ap.live || sl.publicoIndex < 0) return false;
  if (ap.publicoIndex >= 0 && sl.publicoIndex !== ap.publicoIndex) return true;
  if (ap.ministranteIndex >= 0 && sl.publicoIndex !== ap.ministranteIndex) return true;
  return false;
}

/**
 * Rota do modo Slide para os seletores: estado real gravado em `rotasPorModo.slides`
 * (sem mascarar nem reatribuir monitores por conflito com Apresentação).
 */
function obterRotaSlidesParaUi() {
  return sanitizarRotaProjecao(normalizarRota(rotasPorModo.slides), monitoresServidorCache);
}

/** Atualiza só a UI dos seletores Público/Ministrante no modo Slide. */
function syncRoteamentoTelasModoSlidesNaUi() {
  if (!ehModoSlidesOperador()) return;
  renderRoteamentoTelas(monitoresServidorCache, obterRotaSlidesParaUi());
  atualizarEstiloRotasDesativadas();
}

/** Índice de monitor livre para slides quando apresentação já ocupa outro (nunca o principal). */
function outroIndiceMonitor(idxOcupado, listaMonitores) {
  const lista = listaMonitoresParaProjecao(listaMonitores);
  if (!lista.length) return -1;
  const outro = lista.find((m) => m.index !== idxOcupado);
  return outro != null ? outro.index : -1;
}

/** Garante que a rota de slides não use o mesmo monitor que a apresentação ativa. */
function ajustarSlidesSemConflitoComApresentacao(rotaSlide) {
  const s = normalizarRota(rotaSlide);
  const a = normalizarRota(rotasPorModo.apresentacao);
  if (a.live) return s;
  const lista = monitoresServidorCache;
  const out = { ...s };
  if (a.publicoIndex >= 0 && out.publicoIndex === a.publicoIndex && apresentacaoProjecaoAtivaNoCanalPublico()) {
    const alt = outroIndiceMonitor(a.publicoIndex, lista);
    out.publicoIndex = alt >= 0 ? alt : -1;
  }
  if (a.ministranteIndex >= 0 && out.ministranteIndex === a.ministranteIndex && apresentacaoProjecaoAtivaNoCanalMinistrante()) {
    const alt = outroIndiceMonitor(a.ministranteIndex, lista);
    out.ministranteIndex = alt >= 0 ? alt : -1;
  }
  return out;
}

/** Apresentação passa a usar um monitor: slides deixa de usar esse índice. */
function desfazerConflitoSlidesComRotaApresentacao(rotaApresentacao) {
  const a = normalizarRota(rotaApresentacao);
  let s = normalizarRota(rotasPorModo.slides);
  if (a.publicoIndex >= 0 && s.publicoIndex === a.publicoIndex) s = { ...s, publicoIndex: -1 };
  if (a.ministranteIndex >= 0 && s.ministranteIndex === a.ministranteIndex) s = { ...s, ministranteIndex: -1 };
  rotasPorModo.slides = s;
}

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

function emitirApresentacao(payload) {
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
      ultimoConteudoProjetadoModoUnificado = { tipo: 'apresentacao', payload: pl };
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

async function emitirEncerrarApresentacaoPublicoAoServidor() {
  if (projecao.enviar('encerrar_apresentacao_publico')) return true;
  const ip = hostProjecao();
  if (!ip) return false;
  try {
    const r = await fetch(`http://${ip}:5510/api/comando/encerrar_apresentacao_publico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return r.ok;
  } catch (_) {
    return false;
  }
}

/** Destino da projeção (cabeçalho «Monitor»): desativado | publico | ministrante | ambos | live. */
function obterAlvoProjecaoDeRota(rota) {
  const r = normalizarRota(rota);
  if (r.live) return 'live';
  const pub = r.publicoIndex >= 0;
  const min = r.ministranteIndex >= 0;
  if (!pub && !min) return 'desativado';
  if (pub && min) return 'ambos';
  if (pub) return 'publico';
  return 'ministrante';
}

function obterAlvoProjecaoModoApresentacao() {
  return obterAlvoProjecaoDeRota(rotasPorModo.apresentacao);
}

function obterAlvoProjecaoModoBiblia() {
  return obterAlvoProjecaoDeRota(rotasPorModo.biblia);
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

async function reemitirConteudoAposMudancaDeRotaUnificada() {
  const guardado = ultimoConteudoProjetadoModoUnificado;
  if (!guardado || !guardado.payload) return;

  const modo = modoRoteamentoAtual();
  if (modo !== 'apresentacao' && modo !== 'biblia') return;

  const alvo = obterAlvoProjecaoDeRota(rotasPorModo[modo]);
  if (alvo === 'desativado') return;
  /* Em «Live — OBS» não há janelas de monitor a alimentar. */
  if (alvo === 'live') return;
  if (alvo === guardado.payload.alvoProjecao) return;

  /* O PUT já respondeu, mas a janela do monitor novo ainda está a carregar a página: o
     motor só lhe entrega conteúdo depois de a ter visível. Conteúdo enviado antes disso
     perde-se em silêncio — é a mesma razão do `reforcarMinistrante` no motor. */
  await new Promise((r) => setTimeout(r, ATRASO_REENVIO_APOS_ROTA_MS));

  if (guardado.tipo === 'apresentacao') {
    if (!apresentacaoMidiaProjetadaId) return;
    await emitirApresentacao({ ...guardado.payload, alvoProjecao: alvo });
    return;
  }

  if (guardado.tipo === 'biblia') {
    if (bibliaParteProjetadaChave == null) return;
    /* `somenteTexto: false` de propósito: o monitor que acabou de entrar não recebeu a
       referência nem a configuração de exibição, e um reenvio abreviado deixá-lo-ia com
       o versículo sem cabeçalho. */
    const payload = { ...guardado.payload, alvoProjecao: alvo, somenteTexto: false };
    projecao.enfileirar('exibir_versiculo', payload);
    ultimoConteudoProjetadoModoUnificado = { tipo: 'biblia', payload };
  }
}

function monitoresRotaCobremAlvo(rota, alvo) {
  if (alvo === 'desativado') return false;
  if (alvo === 'live') return normalizarRota(rota).live;
  const r = normalizarRota(rota);
  const pub = r.publicoIndex >= 0;
  const min = r.ministranteIndex >= 0;
  if (alvo === 'publico') return pub;
  if (alvo === 'ministrante') return min;
  return pub && min;
}

function monitoresApresentacaoCobremAlvo(alvo) {
  return monitoresRotaCobremAlvo(rotasPorModo.apresentacao, alvo);
}

function monitoresBibliaCobremAlvo(alvo) {
  return monitoresRotaCobremAlvo(rotasPorModo.biblia, alvo);
}

const APRESENTACAO_CARD6_AVISO_CFG_PADRAO = Object.freeze({
  fontSize: 5.5,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  transparentBackground: false,
  wrapLongLines: true,
  italic: false,
  verticalPosition: 'center',
});
const LS_CARD6_AVISO_CFG = 'lyra_card6_aviso_cfg_v1';

function clonarCfgAvisoCard6Padrao() {
  return { ...APRESENTACAO_CARD6_AVISO_CFG_PADRAO };
}

function normalizarCorHexCard6Aviso(valor, fallback) {
  const s = String(valor || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}

function normalizarCfgAvisoCard6(raw) {
  const base = clonarCfgAvisoCard6Padrao();
  const cfg = raw && typeof raw === 'object' ? raw : {};
  const fontSize = Number(cfg.fontSize);
  if (Number.isFinite(fontSize)) {
    base.fontSize = Math.min(9, Math.max(2.2, fontSize));
  }
  base.textColor = normalizarCorHexCard6Aviso(cfg.textColor, base.textColor);
  base.backgroundColor = normalizarCorHexCard6Aviso(cfg.backgroundColor, base.backgroundColor);
  base.transparentBackground = cfg.transparentBackground === true;
  base.wrapLongLines = cfg.wrapLongLines !== false;
  base.italic = cfg.italic === true;
  base.verticalPosition =
    cfg.verticalPosition === 'top' || cfg.verticalPosition === 'bottom'
      ? cfg.verticalPosition
      : 'center';
  return base;
}

function cfgAvisoCard6TemPersonalizacao(raw) {
  const cfg = normalizarCfgAvisoCard6(raw);
  const padrao = APRESENTACAO_CARD6_AVISO_CFG_PADRAO;
  return (
    cfg.fontSize !== padrao.fontSize ||
    cfg.textColor !== padrao.textColor ||
    cfg.backgroundColor !== padrao.backgroundColor ||
    cfg.transparentBackground !== padrao.transparentBackground ||
    cfg.wrapLongLines !== padrao.wrapLongLines ||
    cfg.italic !== padrao.italic ||
    cfg.verticalPosition !== padrao.verticalPosition
  );
}

function aplicarEstiloTextareaAvisoCard6(el, rawCfg) {
  if (!el) return;
  const cfg = normalizarCfgAvisoCard6(rawCfg);
  el.style.color = cfg.textColor;
  el.style.background = cfg.transparentBackground ? 'transparent' : cfg.backgroundColor;
  el.style.fontStyle = cfg.italic ? 'italic' : 'normal';
  el.style.width = '100%';
  el.style.maxWidth = '100%';
  el.style.fontSize = '13px';
  el.style.whiteSpace = cfg.wrapLongLines ? 'pre-wrap' : 'pre';
  el.style.overflowWrap = cfg.wrapLongLines ? 'anywhere' : 'normal';
  el.style.wordBreak = 'break-word';
  el.style.overflow = 'hidden';
  el.wrap = cfg.wrapLongLines ? 'soft' : 'off';
}

function algumCampoAvisoCard6EmEdicao() {
  const ativo = document.activeElement;
  if (!ativo) return false;
  return (
    ativo.classList?.contains('ap-card6-aviso-textarea') ||
    ativo.dataset?.apCard6CfgField === '1'
  );
}

function salvarAvisoCard6CfgNoStorage() {
  try {
    localStorage.setItem(
      LS_CARD6_AVISO_CFG,
      JSON.stringify(normalizarCfgAvisoCard6(apresentacaoCard6AvisoCfg))
    );
  } catch (_) {
  // intencional — erro ignorado
}
}

function carregarAvisoCard6CfgDoStorage() {
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
    return `Escolha «Público — Monitor …» em «Monitor» no cabeçalho antes de projetar para o telão.`;
  }
  if (alvo === 'ministrante') {
    return 'Escolha «Ministrante — Monitor …» em «Monitor» no cabeçalho antes de projetar só no retorno.';
  }
  if (alvo === 'live') {
    return 'Escolha «Live — OBS» em «Monitor» no cabeçalho. No OBS, use Browser Source em http://127.0.0.1:5001/obs';
  }
  return 'Escolha «Ambos» em «Monitor» no cabeçalho para enviar ao público e ao ministrante.';
}

function mensagemAlvoInvalidoApresentacao(alvo) {
  return mensagemAlvoInvalidoMonitor(alvo, 'apresentação');
}

function mensagemAlvoInvalidoBiblia(alvo) {
  return mensagemAlvoInvalidoMonitor(alvo, 'Bíblia');
}

/**
 * Índices de monitor (0-based) nas opções do modo apresentação: 2.º e 3.º ecrã na lista do servidor;
 * com menos ecrãs, recua para o último disponível.
 */
function indicesPadraoPublicoMinistranteApresentacao(lista) {
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

/** Rota do modo Slide ao entrar: Público M2 + Ministrante M3 (ajusta se Apresentação já ocupa um índice). */
function rotaSlidesAoEntrarNoModo() {
  const ap = normalizarRota(rotasPorModo.apresentacao);
  const base = rotaSlidesPadraoPublico2Ministrante3(monitoresServidorCache);
  return ap.publicoIndex >= 0 || ap.ministranteIndex >= 0
    ? ajustarSlidesSemConflitoComApresentacao(base)
    : base;
}

/** Opções do seletor «Monitor» (apresentação / Bíblia): inclui Live → OBS. */
function opcoesRoteamentoUnificadoModoApresentacao(lista) {
  const out = [];
  out.push({ key: 'des', label: 'Desativado', pub: -1, min: -1, live: false });
  out.push({ key: 'live', label: 'Live — OBS', pub: -1, min: -1, live: true });
  const sec = listaMonitoresParaProjecao(lista);
  if (!sec.length) return out;
  const { iPub, iMin } = indicesPadraoPublicoMinistranteApresentacao(lista);
  if (iPub >= 0) {
    out.push({
      key: 'pub',
      label: `Público — Monitor ${iPub + 1}`,
      pub: iPub,
      min: -1,
      live: false,
    });
  }
  if (iMin >= 0) {
    out.push({
      key: 'min',
      label: `Ministrante — Monitor ${iMin + 1}`,
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
  return out;
}

function aplicarExtrasModoApresentacao(ex, opts = {}) {
  const extras = ex && typeof ex === 'object' ? ex : {};
  if (!opts.skipCard6Aviso && typeof extras.card6AvisoTexto === 'string') {
    apresentacaoCard6Texto = extras.card6AvisoTexto;
  }
  if (!opts.skipCard6AvisoConfig && extras.card6AvisoConfig !== undefined) {
    apresentacaoCard6AvisoCfg = normalizarCfgAvisoCard6(extras.card6AvisoConfig);
    salvarAvisoCard6CfgNoStorage();
  }
  audioLoopAtivo = extras.audioLoop === true;
  migrarAlvoExtrasLegadoParaRotaApresentacao(extras);
  atualizarUiPlayerAudioRemoto();
}

/** Legado: rotas de apresentação/Bíblia são só de sessão — não restaurar alvo antigo do storage. */
function migrarAlvoExtrasLegadoParaRotaApresentacao(_ex) {}

function atualizarRodapeAudioApresentacao(item) {
  if (!item) return;
  atualizarPillProjecaoNav({ ativo: true, nome: String(item.name || 'faixa') });
  renderGridApresentacao();
}

/**
 * Espelha o estado de projeção no indicador global da barra de navegação
 * (#hdr-projecao-pill). Fonte única — é chamado por
 * atualizarFeedbackProjecaoApresentacaoUi e atualizarRodapeAudioApresentacao,
 * que já leem o estado real do que está no telão; não mantém estado próprio.
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
 * Sincroniza o indicador de projeção (pill na barra de navegação —
 * atualizarPillProjecaoNav) e redesenha a grelha de cards. Aceita e ignora
 * opções antigas (ex.: mensagemIdle) para compatibilidade com chamadas existentes.
 */
function atualizarFeedbackProjecaoApresentacaoUi() {
  const id = apresentacaoMidiaProjetadaId;
  if (!id) {
    atualizarPillProjecaoNav({ ativo: false });
    renderGridApresentacao();
    return;
  }
  const item =
    (apresentacaoBiblioteca || []).find((x) => x && x.id === id) ||
    (apresentacaoCards || []).find((x) => x && x.id === id) ||
    null;
  let rawNome;
  if (id === ID_PROJECAO_AVISO_CARD6) {
    const linha = String(apresentacaoCard6Texto || '').split(/\r\n|\r|\n/).find((l) => String(l).trim()) || 'Aviso';
    rawNome = linha.slice(0, 56);
  } else {
    rawNome = String(item?.name || 'arquivo');
  }
  atualizarPillProjecaoNav({ ativo: true, nome: rawNome });
  renderGridApresentacao();
}

function montarPayloadAvisoCard6Atual(alvo) {
  return {
    kind: 'aviso',
    texto: String(apresentacaoCard6Texto || '').trim(),
    alvoProjecao: alvo,
    avisoConfig: normalizarCfgAvisoCard6(apresentacaoCard6AvisoCfg),
  };
}

async function atualizarAvisoCard6AoVivo() {
  if (apresentacaoMidiaProjetadaId !== ID_PROJECAO_AVISO_CARD6) return;
  const alvo = obterAlvoProjecaoModoApresentacao();
  if (!monitoresApresentacaoCobremAlvo(alvo)) return;
  const payload = montarPayloadAvisoCard6Atual(alvo);
  if (!payload.texto) return;
  const ok = await emitirApresentacao(payload);
  if (ok) atualizarFeedbackProjecaoApresentacaoUi();
}

function agendarAtualizacaoAvisoCard6AoVivo() {
  if (syncApresentacaoAvisoLiveTimer) clearTimeout(syncApresentacaoAvisoLiveTimer);
  if (apresentacaoMidiaProjetadaId !== ID_PROJECAO_AVISO_CARD6) return;
  syncApresentacaoAvisoLiveTimer = setTimeout(() => {
    syncApresentacaoAvisoLiveTimer = null;
    void atualizarAvisoCard6AoVivo();
  }, 120);
}

async function projetarAvisoCard6() {
  const texto = String(apresentacaoCard6Texto || '').trim();
  if (!texto) {
    alert('Digite um aviso no card 6 antes de projetar.');
    return;
  }
  const alvo = obterAlvoProjecaoModoApresentacao();
  if (!monitoresApresentacaoCobremAlvo(alvo)) {
    alert(mensagemAlvoInvalidoApresentacao(alvo));
    return;
  }
  const ok = await emitirApresentacao(montarPayloadAvisoCard6Atual(alvo));
  if (!ok) return;
  apresentacaoMidiaProjetadaId = ID_PROJECAO_AVISO_CARD6;
  atualizarFeedbackProjecaoApresentacaoUi();
}

/** Publica vídeo local no HTTP :3001 e devolve URL (evita Base64 enorme no POST ao servidor). */
async function publicarVideoApresentacaoHttp(item) {
  if (!item?.id) return String(item?.src || '').trim();
  const src = String(item.src || '').trim();
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  if (!/^data:/i.test(src)) return src;
  try {
    const r = await fetch(
      `${getControllerApiBase()}/api/apresentacao/video/${encodeURIComponent(item.id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: src, mime: item.mime || 'video/mp4' }),
      }
    );
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) return String(j.url);
  } catch (e) {
    console.warn('[Lyra] publicar vídeo HTTP', e);
  }
  return src;
}

async function garantirVideoSrcHttp(item) {
  if (!item || item.kind !== 'video') return item;
  const url = await publicarVideoApresentacaoHttp(item);
  if (url && url !== item.src) {
    item.src = url;
  }
  return item;
}

function urlVideoApresentacaoHttpPorId(id) {
  const vid = String(id || '').trim();
  if (!vid) return '';
  return `${getControllerApiBase()}/api/apresentacao/video/${encodeURIComponent(vid)}`;
}

/**
 * Telões correm no PC do servidor — `127.0.0.1:3001` aponta para a máquina errada.
 * Reescreve para o proxy `:5510` do servidor (que encaminha ao controlador).
 */
function reescreverUrlVideoParaTelas(url) {
  const u = String(url || '').trim();
  if (!u) return u;
  const ip =
    (typeof getServidorProjeccaoIp === 'function'
      ? String(getServidorProjeccaoIp() || '').trim()
      : '') ||
    (typeof getServidorIp === 'function' ? String(getServidorIp() || '').trim() : '');
  if (!ip) return u;
  return u
    .replace(
      /^https?:\/\/127\.0\.0\.1:3001(?=\/api\/apresentacao\/video\/)/i,
      `http://${ip}:5510`
    )
    .replace(
      /^https?:\/\/localhost:3001(?=\/api\/apresentacao\/video\/)/i,
      `http://${ip}:5510`
    );
}

async function videoHttpDisponivel(url) {
  const u = String(url || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) return false;
  try {
    const r = await fetch(u, { method: 'HEAD' });
    return r.ok;
  } catch (_) {
    return false;
  }
}

async function lerVideoComoDataUrlDoCaminho(filePath) {
  const fp = String(filePath || '').trim();
  if (!fp) return '';
  try {
    const url = /^file:/i.test(fp) ? fp : `file:///${fp.replace(/\\/g, '/')}`;
    const r = await fetch(url);
    if (!r.ok) return '';
    const blob = await r.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(blob);
    });
  } catch (_) {
    return '';
  }
}

async function republicarVideoDoCaminhoArquivo(item) {
  if (!item?.id) return item;
  const data = await lerVideoComoDataUrlDoCaminho(item.filePath);
  if (!data) return item;
  const republicado = { ...item, src: data };
  return garantirVideoSrcHttp(republicado);
}

function obterThumbVideoApresentacao(item) {
  const t = String(item?.thumb || '').trim();
  return /^data:image\//i.test(t) ? t : '';
}

function aguardarMetadadosVideo(el, timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!el) return resolve();
    if (Number.isFinite(el.duration) && el.duration > 0) return resolve();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('loadedmetadata', finish);
      el.removeEventListener('error', finish);
      resolve();
    };
    el.addEventListener('loadedmetadata', finish, { once: true });
    el.addEventListener('error', finish, { once: true });
    setTimeout(finish, timeoutMs);
    try {
      el.load();
    } catch (_) {
      finish();
    }
  });
}

async function gerarThumbnailVideoApresentacao(src) {
  const url = String(src || '').trim();
  if (!url) return '';
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    let settled = false;
    const finish = (dataUrl) => {
      if (settled) return;
      settled = true;
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch (_) {
  // intencional — erro ignorado
}
      resolve(dataUrl || '');
    };
    const capturar = () => {
      try {
        const w = v.videoWidth || 0;
        const h = v.videoHeight || 0;
        if (w < 2 || h < 2) return finish('');
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        finish(c.toDataURL('image/jpeg', 0.82));
      } catch (_) {
        finish('');
      }
    };
    v.addEventListener('loadeddata', () => {
      try {
        const dur = Number(v.duration);
        const alvo = Number.isFinite(dur) && dur > 0.2 ? Math.min(dur * 0.1, Math.max(0.05, dur - 0.05)) : 0.5;
        v.currentTime = alvo;
      } catch (_) {
        capturar();
      }
    }, { once: true });
    v.addEventListener('seeked', capturar, { once: true });
    v.addEventListener('error', () => finish(''), { once: true });
    setTimeout(() => finish(''), 15000);
    v.src = url;
  });
}

async function garantirThumbnailVideoItem(item) {
  if (!item || item.kind !== 'video') return item;
  if (videoProjetadoAtivoNoPlayer() && audioStateRemoto.playing) return item;
  if (obterThumbVideoApresentacao(item)) return item;
  const srcThumb = /^https?:\/\//i.test(item.src) ? item.src : await resolverSrcProjecaoApresentacao(item);
  if (!srcThumb) return item;
  const thumb = await gerarThumbnailVideoApresentacao(srcThumb);
  if (thumb) item.thumb = thumb;
  return item;
}

async function restaurarItemVideoApresentacao(item) {
  if (!item || item.kind !== 'video') return null;
  const id = String(item.id || '').trim();
  let src = String(item.src || '').trim();
  const filePath = String(item.filePath || '').trim();

  if (!src && id) src = urlVideoApresentacaoHttpPorId(id);

  if (/^https?:\/\//i.test(src)) {
    item.src = src;
    if (await videoHttpDisponivel(src)) {
      return garantirThumbnailVideoItem(item);
    }
  }

  if (/^data:/i.test(src)) {
    const it = await garantirVideoSrcHttp(item);
    return garantirThumbnailVideoItem(it);
  }

  if (filePath) {
    const it = await republicarVideoDoCaminhoArquivo({ ...item, src: '' });
    if (it?.src && /^https?:\/\//i.test(it.src)) {
      return garantirThumbnailVideoItem(it);
    }
  }

  return null;
}

async function restaurarVideosModoApresentacao() {
  const v5 = apresentacaoCards[APRESENTACAO_IDX_CARD5];
  if (v5?.kind === 'video') {
    const it = await restaurarItemVideoApresentacao(v5);
    if (it) {
      apresentacaoCards[APRESENTACAO_IDX_CARD5] = it;
      const bibIdx = apresentacaoBiblioteca.findIndex((x) => x && x.id === it.id);
      if (bibIdx >= 0) apresentacaoBiblioteca[bibIdx] = it;
      salvarEstadoModoApresentacaoNoStorage();
    }
  }
  for (let i = 0; i < apresentacaoVideoPlaylist.length; i += 1) {
    const it0 = apresentacaoVideoPlaylist[i];
    if (it0?.kind !== 'video') continue;
    const it = await restaurarItemVideoApresentacao(it0);
    if (it) apresentacaoVideoPlaylist[i] = { ...it0, ...it };
  }
  if (videoProjetadoAtivoNoPlayer()) {
    const proj = obterItemVideoProjetadoNoPlayer();
    if (proj) {
      const it = await restaurarItemVideoApresentacao(proj);
      if (it) await prepararPlayerVideoAposProjetar(it);
    }
  }
}

async function resolverSrcProjecaoApresentacao(item) {
  if (!item?.src) return '';
  if (item.kind === 'video') {
    return publicarVideoApresentacaoHttp(item);
  }
  return String(item.src).trim();
}

async function projetarItemApresentacao(item) {
  if (!item || !item.src) return;
  /** Qualquer projeção fora da orquestração da playlist a desativa (vídeo único, áudio, cards). */
  if (!_playlistProjetando) {
    playlistVideoAtiva = false;
    cancelarAvancoAutoPlaylist();
  }
  if (item.kind === 'audio') {
    apresentacaoMidiaProjetadaId = null;
    const ok = await tocarAudioServidorApresentacao(item);
    if (!ok) {
      alert('Não foi possível reproduzir o áudio no servidor. Verifique a ligação.');
      atualizarFeedbackProjecaoApresentacaoUi();
      return;
    }
    apresentacaoAudioAtualId = item.id || null;
    atualizarRodapeAudioApresentacao(item);
    return;
  }
  const alvoProjecao = obterAlvoProjecaoModoApresentacao();
  if (!monitoresApresentacaoCobremAlvo(alvoProjecao)) {
    alert(mensagemAlvoInvalidoApresentacao(alvoProjecao));
    return;
  }
  const srcLocal = await resolverSrcProjecaoApresentacao(item);
  if (!srcLocal) {
    alert('Não foi possível preparar o ficheiro para projeção.');
    return;
  }
  if (item.kind === 'video' && /^https?:\/\//i.test(srcLocal)) {
    item.src = srcLocal;
    const noCard = apresentacaoCards?.[APRESENTACAO_IDX_CARD5];
    if (noCard?.id === item.id) apresentacaoCards[APRESENTACAO_IDX_CARD5] = item;
    const noBib = apresentacaoBiblioteca.findIndex((x) => x && x.id === item.id);
    if (noBib >= 0) apresentacaoBiblioteca[noBib] = item;
    salvarEstadoModoApresentacaoNoStorage();
  }
  const srcProj = item.kind === 'video' ? reescreverUrlVideoParaTelas(srcLocal) : srcLocal;
  const payloadAp = {
    kind: item.kind,
    src: srcProj,
    mime: item.mime || '',
    name: item.name || '',
    title: item.name || 'Apresentação',
    alvoProjecao,
  };
  const ok = await emitirApresentacao(payloadAp);
  if (!ok) {
    atualizarFeedbackProjecaoApresentacaoUi();
    return;
  }
  apresentacaoMidiaProjetadaId = item.id || null;
  if (item.kind === 'video') {
    await prepararPlayerVideoAposProjetar(item);
  }
  renderGridApresentacao();
  atualizarFeedbackProjecaoApresentacaoUi();
}

function fmtTempoAudio(seg) {
  const s = Math.max(0, Math.floor(Number(seg) || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function obterItemVideoProjetadoNoPlayer() {
  if (!apresentacaoMidiaProjetadaId) return null;
  const id = apresentacaoMidiaProjetadaId;
  const raw =
    (apresentacaoCards || []).find((x) => x && x.id === id) ||
    (apresentacaoBiblioteca || []).find((x) => x && x.id === id) ||
    (apresentacaoVideoPlaylist || []).find((x) => x && x.id === id) ||
    null;
  const it = normalizarItemApresentacao(raw);
  return it && it.kind === 'video' ? it : null;
}

function videoProjetadoAtivoNoPlayer() {
  return !!obterItemVideoProjetadoNoPlayer();
}

let audioLocalMotorPronto = false;

function obterElementoAudioLocal() {
  return document.getElementById('lyra-audio-local');
}

function obterElementoVideoLocal() {
  return document.getElementById('lyra-video-local');
}

/** Vídeo local só para barra de progresso — áudio exclusivo no telão de projeção. */
function prepararElementoVideoLocalControle(el) {
  if (!el) return;
  el.muted = true;
  el.playsInline = true;
}

/** Reproduz o elemento de preview local (sempre mudo) em sincronia com o telão. */
function reproduzirElementoPreviewLocal(t) {
  const el = obterElementoVideoLocal();
  if (!el || !el.src) return;
  el.muted = true;
  if (Number.isFinite(t)) {
    try {
      el.currentTime = Math.max(0, Number(t));
    } catch (_) {
  // intencional — erro ignorado
}
  }
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function pausarElementoPreviewLocal() {
  const el = obterElementoVideoLocal();
  if (el && !el.paused) {
    try {
      el.pause();
    } catch (_) {
  // intencional — erro ignorado
}
  }
}

/** Elemento-slot atualmente rastreado pelo overlay de preview (ou null). */
let _previewAlvoAtual = null;

/** Retorna o slot alvo do preview ao vivo (card 5 ou playlist) — só quando reproduzindo. */
function alvoPreviewVideoAtual() {
  const id = apresentacaoMidiaProjetadaId;
  if (!id || audioStateRemoto.mediaKind !== 'video' || !audioStateRemoto.playing) return null;
  const card5 = apresentacaoCards?.[APRESENTACAO_IDX_CARD5];
  if (card5 && card5.id === id) return document.getElementById('ap-card5-video-live-slot');
  if ((apresentacaoVideoPlaylist || []).some((x) => x && x.id === id)) {
    return document.getElementById('ap-playlist-preview');
  }
  return null;
}

/** Ajusta as coordenadas do overlay para cobrir exatamente o slot alvo atual. */
function posicionarOverlayPreview() {
  const overlay = document.getElementById('lyra-video-overlay');
  if (!overlay) return;
  const alvo = _previewAlvoAtual;
  if (!alvo || !alvo.isConnected) {
    overlay.classList.remove('ativo');
    overlay.style.left = '-99999px';
    overlay.style.top = '-99999px';
    return;
  }
  const r = alvo.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) {
    overlay.classList.remove('ativo');
    overlay.style.left = '-99999px';
    overlay.style.top = '-99999px';
    return;
  }
  overlay.style.left = `${Math.round(r.left)}px`;
  overlay.style.top = `${Math.round(r.top)}px`;
  overlay.style.width = `${Math.round(r.width)}px`;
  overlay.style.height = `${Math.round(r.height)}px`;
  overlay.classList.add('ativo');
}

/**
 * Atualiza o preview de vídeo ao vivo (mudo) via OVERLAY fixo — o elemento de vídeo
 * nunca é movido no DOM (evita o quadro preto do Chromium ao reposicionar mídia).
 * Apenas o overlay acompanha as coordenadas do slot alvo (card 5 ou playlist).
 */
function atualizarPreviewVideoAoVivo() {
  const overlay = document.getElementById('lyra-video-overlay');
  const el = obterElementoVideoLocal();
  const slotPlaylist = document.getElementById('ap-playlist-preview');
  if (!overlay || !el) return;
  const alvo = alvoPreviewVideoAtual();
  _previewAlvoAtual = alvo;
  /* Reserva o espaço do slot da playlist só quando ele é o alvo. */
  if (slotPlaylist) {
    if (alvo === slotPlaylist) {
      slotPlaylist.classList.add('reservado');
      slotPlaylist.hidden = false;
    } else {
      slotPlaylist.classList.remove('reservado');
      slotPlaylist.hidden = true;
    }
  }
  if (alvo) {
    el.muted = true;
    if (el.src && el.paused && audioStateRemoto.playing) {
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    posicionarOverlayPreview();
  } else {
    overlay.classList.remove('ativo');
    overlay.style.left = '-99999px';
    overlay.style.top = '-99999px';
  }
}

function obterElementoPlayerAtivo() {
  return audioStateRemoto.mediaKind === 'video' ? obterElementoVideoLocal() : obterElementoAudioLocal();
}

function pararElementoMidia(el) {
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  try {
    el.load();
  } catch (_) {
  // intencional — erro ignorado
}
}

/** Telão é a única instância em reprodução — evita dupla decodificação e sync contínuo. */
function videoPlaybackUsaTelaoComoFonte() {
  return videoProjetadoAtivoNoPlayer();
}

let _videoUiClockRaf = null;
let _videoUiClockBase = 0;
let _videoUiClockT0 = 0;

function pararRelogioUiVideo() {
  if (_videoUiClockRaf) {
    cancelAnimationFrame(_videoUiClockRaf);
    _videoUiClockRaf = null;
  }
}

function iniciarRelogioUiVideo() {
  pararRelogioUiVideo();
  const dur = Math.max(0, Number(audioStateRemoto.duration) || 0);
  const tick = () => {
    if (!videoProjetadoAtivoNoPlayer() || !audioStateRemoto.playing) {
      pararRelogioUiVideo();
      return;
    }
    const elapsed = (performance.now() - _videoUiClockT0) / 1000;
    let t = _videoUiClockBase + elapsed;
    if (dur > 0 && t >= dur) {
      if (playlistControlaReproducaoAtual()) {
        audioStateRemoto.playing = false;
        audioStateRemoto.currentTime = dur;
        atualizarUiPlayerAudioRemoto();
        emitirEstadoVideoParaServidor({ playing: false, syncTime: true, currentTime: dur });
        pararRelogioUiVideo();
        aoTerminarVideoPlaylist();
        return;
      }
      if (audioLoopAtivo) {
        _videoUiClockBase = 0;
        _videoUiClockT0 = performance.now();
        audioStateRemoto.playing = true;
        audioStateRemoto.currentTime = 0;
        atualizarUiPlayerAudioRemoto();
        emitirEstadoVideoParaServidor({ playing: true, syncTime: true, currentTime: 0 });
        reproduzirElementoPreviewLocal(0);
        _videoUiClockRaf = requestAnimationFrame(tick);
        return;
      }
      t = dur;
      audioStateRemoto.playing = false;
      audioStateRemoto.currentTime = t;
      atualizarUiPlayerAudioRemoto();
      emitirEstadoVideoParaServidor({ playing: false, syncTime: true, currentTime: t });
      pararRelogioUiVideo();
      return;
    }
    audioStateRemoto.currentTime = t;
    atualizarUiPlayerAudioRemoto();
    _videoUiClockRaf = requestAnimationFrame(tick);
  };
  _videoUiClockRaf = requestAnimationFrame(tick);
}

function emitirEstadoVideoParaServidor(opts = {}) {
  if (!videoProjetadoAtivoNoPlayer()) {
    return;
  }
  const syncTime = opts.syncTime === true;
  const el = obterElementoVideoLocal();
  const payload = {
    playing:
      opts.playing != null
        ? !!opts.playing
        : el && !videoPlaybackUsaTelaoComoFonte()
          ? !el.paused && !el.ended
          : !!audioStateRemoto.playing,
    volume: Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 1)),
  };
  if (syncTime) {
    payload.syncTime = true;
    payload.currentTime =
      Number(opts.currentTime ?? (el && !videoPlaybackUsaTelaoComoFonte() ? el.currentTime : audioStateRemoto.currentTime)) || 0;
  }
  if (projecao.enviar('apresentacao_video_state', payload)) return;
  const ip = hostProjecao();
  if (!ip) {
    return;
  }
  fetch(`http://${ip}:5510/api/comando/apresentacao_video_state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function sincronizarEstadoPlayerLocalDesdeElemento() {
  if (audioStateRemoto.mediaKind === 'video' && videoPlaybackUsaTelaoComoFonte()) {
    atualizarUiPlayerAudioRemoto();
    return;
  }
  const el = obterElementoPlayerAtivo();
  if (!el) return;
  audioStateRemoto = {
    ...audioStateRemoto,
    playing: !el.paused && !el.ended,
    currentTime: Number(el.currentTime) || 0,
    duration: Number.isFinite(el.duration) ? Number(el.duration) : 0,
    volume:
      audioStateRemoto.mediaKind === 'video'
        ? audioStateRemoto.volume
        : Number.isFinite(el.volume)
          ? el.volume
          : audioStateRemoto.volume,
  };
  atualizarUiPlayerAudioRemoto();
}

function ligarEventosElementoPlayer(el) {
  if (!el || el.dataset.lyraPlayerBound === '1') return;
  el.dataset.lyraPlayerBound = '1';
  el.addEventListener('timeupdate', sincronizarEstadoPlayerLocalDesdeElemento);
  el.addEventListener('loadedmetadata', sincronizarEstadoPlayerLocalDesdeElemento);
}

function configurarMotorAudioLocalApresentacao() {
  if (audioLocalMotorPronto) return;
  const audioEl = obterElementoAudioLocal();
  const videoEl = obterElementoVideoLocal();
  if (!audioEl && !videoEl) return;
  audioLocalMotorPronto = true;
  const vol = Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 1));
  if (audioEl) audioEl.volume = vol;
  if (videoEl) prepararElementoVideoLocalControle(videoEl);
  ligarEventosElementoPlayer(audioEl);
  ligarEventosElementoPlayer(videoEl);
}

async function prepararPlayerVideoAposProjetar(item) {
  const it = await restaurarItemVideoApresentacao(item);
  if (!it?.src) return;
  configurarMotorAudioLocalApresentacao();
  pararElementoMidia(obterElementoAudioLocal());
  apresentacaoAudioAtualId = null;
  const el = obterElementoVideoLocal();
  if (!el) return;
  audioStateRemoto.mediaKind = 'video';
  audioStateRemoto.name = it.name || 'Vídeo';
  audioStateRemoto.playing = false;
  audioStateRemoto.currentTime = 0;
  try {
    prepararElementoVideoLocalControle(el);
    el.preload = 'metadata';
    el.src = it.src;
    el.pause();
    await aguardarMetadadosVideo(el, 6000);
    if (Number.isFinite(el.duration) && el.duration > 0) {
      audioStateRemoto.duration = Number(el.duration);
    }
    try {
      el.currentTime = 0;
    } catch (_) {
  // intencional — erro ignorado
}
    atualizarUiPlayerAudioRemoto();
    emitirEstadoVideoParaServidor({ playing: false, syncTime: true, currentTime: 0 });
  } catch (e) {
    console.warn('[Lyra] player vídeo', e);
  }
}

function pausarAudioLocalApresentacao() {
  if (videoProjetadoAtivoNoPlayer()) {
    pararRelogioUiVideo();
    pausarElementoPreviewLocal();
    audioStateRemoto = {
      ...audioStateRemoto,
      mediaKind: 'video',
      playing: false,
    };
    atualizarUiPlayerAudioRemoto();
    emitirEstadoVideoParaServidor({
      playing: false,
      syncTime: true,
      currentTime: Number(audioStateRemoto.currentTime) || 0,
    });
    return;
  }
  const el = obterElementoPlayerAtivo();
  if (el) el.pause();
  audioStateRemoto = { ...audioStateRemoto, playing: false };
  atualizarUiPlayerAudioRemoto();
}

function pararAudioLocalApresentacao() {
  const eraVideo = videoProjetadoAtivoNoPlayer();
  pararRelogioUiVideo();
  audioLoopReinicioPendente = false;
  pararElementoMidia(obterElementoAudioLocal());
  pararElementoMidia(obterElementoVideoLocal());
  audioStateRemoto = {
    ...audioStateRemoto,
    playing: false,
    currentTime: 0,
    duration: 0,
    name: '',
    mediaKind: '',
  };
  atualizarUiPlayerAudioRemoto();
  if (eraVideo) {
    const payload = {
      playing: false,
      syncTime: true,
      currentTime: 0,
      volume: Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 1)),
    };
    if (!projecao.enviar('apresentacao_video_state', payload)) {
      const ip = hostProjecao();
      if (ip) {
        fetch(`http://${ip}:5510/api/comando/apresentacao_video_state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
      }
    }
  }
}

function definirVolumeAudioLocalApresentacao(volume) {
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  const audioEl = obterElementoAudioLocal();
  const videoEl = obterElementoVideoLocal();
  if (audioEl) audioEl.volume = v;
  if (videoEl) prepararElementoVideoLocalControle(videoEl);
  audioStateRemoto = { ...audioStateRemoto, volume: v };
  atualizarUiPlayerAudioRemoto();
  if (audioStateRemoto.mediaKind === 'video') {
    const payloadVol = { playing: !!audioStateRemoto.playing, volume: v };
    if (!projecao.enviar('apresentacao_video_state', payloadVol)) {
      const ip = hostProjecao();
      if (ip) {
        fetch(`http://${ip}:5510/api/comando/apresentacao_video_state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadVol),
        }).catch(() => {});
      }
    }
  }
}

function seekAudioLocalApresentacao(time) {
  const t = Math.max(0, Number(time) || 0);
  if (audioStateRemoto.mediaKind === 'video' && videoPlaybackUsaTelaoComoFonte()) {
    audioStateRemoto.currentTime = t;
    if (audioStateRemoto.playing) {
      _videoUiClockBase = t;
      _videoUiClockT0 = performance.now();
    }
    const el = obterElementoVideoLocal();
    if (el?.src) {
      try {
        el.currentTime = t;
      } catch (_) {
  // intencional — erro ignorado
}
    }
    atualizarUiPlayerAudioRemoto();
    emitirEstadoVideoParaServidor({
      playing: !!audioStateRemoto.playing,
      syncTime: true,
      currentTime: t,
    });
    return;
  }
  const el = obterElementoPlayerAtivo();
  if (el) el.currentTime = t;
  sincronizarEstadoPlayerLocalDesdeElemento();
}

/** Reprodução de áudio no processo Servidor (saída padrão do Windows da máquina do servidor). */
async function tocarAudioServidorApresentacao(item, opts = {}) {
  if (!item?.src) return false;
  const vol = Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 1));
  const startTime = Math.max(0, Number(opts.startTime) || 0);
  if (startTime > 0 && item.id) {
    armarGuardaVisualRetomadaAudio(item.id, startTime);
  } else {
    limparGuardaVisualRetomadaAudio();
  }
  const ok = await enviarComandoAudioProjeccao('audio_play', {
    src: item.src,
    name: item.name || 'audio',
    mediaKind: 'audio',
    autoplay: opts.autoplay !== false,
    volume: vol,
  });
  if (!ok) {
    limparGuardaVisualRetomadaAudio();
  }
  if (ok) {
    if (startTime > 0) {
      await enviarComandoAudioProjeccao('audio_seek', { time: startTime });
    }
    audioStateRemoto.mediaKind = 'audio';
    audioStateRemoto.name = item.name || '';
    audioStateRemoto.volume = vol;
    audioStateRemoto.currentTime = startTime;
    if (opts.autoplay === false) {
      audioStateRemoto.playing = false;
    }
    atualizarUiPlayerAudioRemoto();
  }
  return ok;
}

function pausarAudioServidorPlayback() {
  if (audioStateRemoto.mediaKind === 'video') {
    pausarAudioLocalApresentacao();
    return;
  }
  void enviarComandoAudioProjeccao('audio_pause', {});
  audioLoopReinicioPendente = false;
  limparGuardaVisualRetomadaAudio();
  audioStateRemoto = { ...audioStateRemoto, playing: false };
  atualizarUiPlayerAudioRemoto();
}

function pararAudioServidorPlayback() {
  if (audioStateRemoto.mediaKind === 'video') {
    pararAudioLocalApresentacao();
    return;
  }
  void enviarComandoAudioProjeccao('audio_stop', {});
  audioLoopReinicioPendente = false;
  limparGuardaVisualRetomadaAudio();
  audioStateRemoto = {
    ...audioStateRemoto,
    playing: false,
    currentTime: 0,
    duration: 0,
    name: '',
    mediaKind: '',
  };
  atualizarUiPlayerAudioRemoto();
}

function definirVolumeAudioServidor(volume) {
  if (audioStateRemoto.mediaKind === 'video') {
    definirVolumeAudioLocalApresentacao(volume);
    return;
  }
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  void enviarComandoAudioProjeccao('audio_volume', { volume: v });
  audioStateRemoto = { ...audioStateRemoto, volume: v };
  atualizarUiPlayerAudioRemoto();
}

function seekAudioServidor(time) {
  if (audioStateRemoto.mediaKind === 'video') {
    seekAudioLocalApresentacao(time);
    return;
  }
  const t = Math.max(0, Number(time) || 0);
  limparGuardaVisualRetomadaAudio();
  void enviarComandoAudioProjeccao('audio_seek', { time: t });
  audioStateRemoto = { ...audioStateRemoto, currentTime: t };
  atualizarUiPlayerAudioRemoto();
}

function renderPlayPauseIcon() {
  const btn = document.getElementById('ap-audio-play-pause');
  if (!btn) return;
  if (audioStateRemoto.playing) {
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  } else {
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  }
}

function atualizarBotaoLoopPlayerAudio() {
  const btn = document.getElementById('ap-audio-loop');
  if (!btn) return;
  btn.classList.toggle('ap-ctrl--ativo', !!audioLoopAtivo);
  btn.setAttribute('aria-pressed', audioLoopAtivo ? 'true' : 'false');
  btn.title = audioLoopAtivo ? 'Desativar repetir' : 'Ativar repetir';
  btn.setAttribute('aria-label', audioLoopAtivo ? 'Desativar repetir' : 'Ativar repetir');
}

function alternarLoopPlayerApresentacao(force) {
  const proximoEstado = force == null ? !audioLoopAtivo : !!force;
  if (audioLoopAtivo === proximoEstado) {
    atualizarBotaoLoopPlayerAudio();
    return;
  }
  audioLoopAtivo = proximoEstado;
  audioLoopReinicioPendente = false;
  atualizarUiPlayerAudioRemoto();
  salvarEstadoModoApresentacaoNoStorage();
}

function atualizarUiPlayerAudioRemoto() {
  const now = document.getElementById('ap-audio-now');
  const cur = document.getElementById('ap-audio-current');
  const dur = document.getElementById('ap-audio-duration');
  const seek = document.getElementById('ap-audio-seek');
  const volVal = document.getElementById('ap-audio-vol-val');
  const volFill = document.getElementById('ap-audio-vol-fill');
  if (now) {
    const tipo =
      audioStateRemoto.mediaKind === 'video'
        ? 'Vídeo'
        : audioStateRemoto.mediaKind === 'audio'
          ? 'Áudio'
          : '';
    now.textContent = audioStateRemoto.name
      ? `${audioStateRemoto.playing ? 'Tocando' : 'Pausado'}${tipo ? ` (${tipo})` : ''}: ${audioStateRemoto.name}`
      : 'Nenhuma mídia no player';
    now.title = audioStateRemoto.name ? String(audioStateRemoto.name) : '';
  }
  if (cur) cur.textContent = fmtTempoAudio(audioStateRemoto.currentTime);
  if (dur) dur.textContent = fmtTempoAudio(audioStateRemoto.duration);
  let seekPct = 0;
  if (seek && !audioSeekDragging) {
    const d = Math.max(0, Number(audioStateRemoto.duration) || 0);
    const c = Math.max(0, Number(audioStateRemoto.currentTime) || 0);
    const val = d > 0 ? Math.round((c / d) * 1000) : 0;
    seek.value = String(Math.max(0, Math.min(1000, val)));
    seekPct = d > 0 ? Math.round((c / d) * 1000) / 10 : 0;
  } else if (seek) {
    const d = Math.max(0, Number(audioStateRemoto.duration) || 0);
    const c = Math.max(0, Number(audioStateRemoto.currentTime) || 0);
    seekPct = d > 0 ? Math.round((c / d) * 1000) / 10 : Number(seek.value) / 10;
  }
  if (seek) seek.style.setProperty('--seek-pct', `${seekPct}%`);
  const vPct = Math.round(Math.max(0, Math.min(1, Number(audioStateRemoto.volume) || 0)) * 100);
  if (volVal) volVal.textContent = `${vPct}%`;
  if (volFill) volFill.style.width = `${vPct}%`;
  renderPlayPauseIcon();
  atualizarBotaoLoopPlayerAudio();
  atualizarPlaylistUiAoVivoSeMudou();
  if (_previewAlvoAtual) posicionarOverlayPreview();
}

function criarItemApresentacaoDeArquivo(file, onDone) {
  if (!file) return;
  const mime = String(file.type || '');
  const nome = String(file.name || 'arquivo');
  const isPowerPoint =
    /\.pptx?$/.test(nome.toLowerCase()) ||
    /\.odp$/.test(nome.toLowerCase()) ||
    mime.includes('powerpoint') ||
    mime.includes('presentation');
  if (isPowerPoint) {
    alert('PowerPoint local ainda não abre direto no telão. Exporte para PDF ou use URL de apresentação online (Google Slides / Office Online).');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => alert('Não foi possível ler o arquivo selecionado.');
  reader.onload = () => {
    const src = String(reader.result || '');
    if (!src) return;
    const kind = detectarKindApresentacaoPorMimeOuNome(mime, nome);
    const itemNovo = {
      id: `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      kind,
      src,
      mime,
      name: nome,
      title: nome,
    };
    const fp = String(file.path || '').trim();
    if (fp && kind === 'video') itemNovo.filePath = fp;
    onDone(itemNovo);
  };
  reader.readAsDataURL(file);
}

function renderListaAudiosApresentacao() {
  const list = document.getElementById('apresentacao-audio-list');
  const selLabel = document.getElementById('ap-audio-selected');
  if (!list) return;
  list.innerHTML = '';
  const atual = apresentacaoAudios.find((x) => x.id === apresentacaoAudioAtualId) || null;
  if (selLabel) {
    selLabel.textContent = atual ? `Áudio: ${atual.name}` : 'Selecione um áudio...';
    selLabel.title = atual && atual.name ? String(atual.name) : '';
  }
  if (!apresentacaoAudios.length) {
    list.innerHTML = '<div class="placeholder-msg" style="margin:4px 0 0;">Lista suspensa com todos os áudios.</div>';
    return;
  }
  apresentacaoAudios.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'ap-menu-item';
    row.innerHTML = `
      <div class="ap-menu-item-main">
        <div class="ap-menu-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <span class="ap-menu-item-meta">áudio</span>
      </div>
      <div class="ap-menu-item-actions">
        <button type="button" class="ap-menu-action edit" title="Editar nome" aria-label="Editar nome">✏</button>
        <button type="button" class="ap-menu-action delete" title="Excluir do menu" aria-label="Excluir do menu">✕</button>
      </div>
    `;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', apresentacaoAudioAtualId && item.id === apresentacaoAudioAtualId ? 'true' : 'false');
    row.addEventListener('dblclick', () => {
      projetarItemApresentacao(item);
      renderListaAudiosApresentacao();
      fecharApAudioDropdown();
    });
    row.addEventListener('click', (ev) => {
      if (ev.target instanceof HTMLElement && ev.target.closest('.ap-menu-item-actions, .ap-menu-edit-input')) return;
      apresentacaoAudioAtualId = item.id;
      salvarEstadoModoApresentacaoNoStorage();
      renderListaAudiosApresentacao();
      fecharApAudioDropdown();
    });

    const btnEdit = row.querySelector('.ap-menu-action.edit');
    const btnDelete = row.querySelector('.ap-menu-action.delete');
    const nameWrap = row.querySelector('.ap-menu-item-name');
    const mainWrap = row.querySelector('.ap-menu-item-main');

    btnEdit?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!nameWrap || !mainWrap) return;
      if (mainWrap.querySelector('input.ap-menu-edit-input')) return;
      const valorAtual = String(item.name || '').trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'ap-menu-edit-input';
      input.value = valorAtual;
      input.maxLength = 140;
      nameWrap.replaceWith(input);
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('mousedown', (e) => e.stopPropagation());
      input.focus();
      input.select();

      const salvarNome = () => {
        const novoNome = String(input.value || '').trim();
        if (!novoNome) {
          renderListaAudiosApresentacao();
          return;
        }
        const alvo = apresentacaoAudios.find((x) => x && x.id === item.id);
        if (alvo) {
          alvo.name = novoNome;
          alvo.title = novoNome;
        }
        if (apresentacaoAudioAtualId === item.id && audioStateRemoto.name) {
          audioStateRemoto = { ...audioStateRemoto, name: novoNome };
          atualizarUiPlayerAudioRemoto();
        }
        salvarEstadoModoApresentacaoNoStorage();
        renderListaAudiosApresentacao();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          salvarNome();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          renderListaAudiosApresentacao();
        }
      });
      input.addEventListener('blur', salvarNome);
    });

    btnDelete?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const ok = await appConfirm(`Excluir "${item.name}" da lista de áudios?`, 'Modo apresentação');
      if (!ok) return;
      const eraAtual = apresentacaoAudioAtualId === item.id;
      apresentacaoAudios = (apresentacaoAudios || []).filter((x) => x && x.id !== item.id);
      if (eraAtual) {
        apresentacaoAudioAtualId = null;
        pararAudioServidorPlayback();
        atualizarUiPlayerAudioRemoto();
      }
      salvarEstadoModoApresentacaoNoStorage();
      renderListaAudiosApresentacao();
    });

    list.appendChild(row);
  });
}

function adicionarAudiosAoMenu(files) {
  Array.from(files || []).forEach((file) => {
    criarItemApresentacaoDeArquivo(file, (item) => {
      if (item.kind !== 'audio') return;
      apresentacaoAudios.push(item);
      salvarEstadoModoApresentacaoNoStorage();
      renderListaAudiosApresentacao();
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Playlist de vídeos (modo Mídias)
   Camada de orquestração por cima do motor de vídeo único já existente.
   Reutiliza: projetarItemApresentacao, prepararPlayerVideoAposProjetar,
   iniciarRelogioUiVideo, pausarAudioLocalApresentacao, encerrarModoApresentacaoNoTelao.
   ═══════════════════════════════════════════════════════════════════════════ */

const PLAYLIST_ATRASOS_PERMITIDOS = [0, 1, 2, 3, 5];

function playlistItemAtual() {
  if (playlistVideoIndice < 0) return null;
  return apresentacaoVideoPlaylist[playlistVideoIndice] || null;
}

function playlistItemAtualId() {
  const it = playlistItemAtual();
  return it ? it.id : null;
}

/** true somente quando a playlist está ativa E o vídeo projetado é o item atual dela. */
function playlistControlaReproducaoAtual() {
  return (
    playlistVideoAtiva &&
    playlistVideoIndice >= 0 &&
    !!apresentacaoMidiaProjetadaId &&
    apresentacaoMidiaProjetadaId === playlistItemAtualId()
  );
}

function cancelarAvancoAutoPlaylist() {
  if (_playlistAutoTimer) {
    clearTimeout(_playlistAutoTimer);
    _playlistAutoTimer = null;
  }
}

/** Inicia a reprodução do vídeo já projetado no telão, a partir de fromTime. */
function iniciarPlaybackVideoProjetado(fromTime = 0) {
  const dur = Math.max(0, Number(audioStateRemoto.duration) || 0);
  let t = Math.max(0, Number(fromTime) || 0);
  if (dur > 0 && t >= dur - 0.05) t = 0;
  audioStateRemoto.mediaKind = 'video';
  audioStateRemoto.playing = true;
  audioStateRemoto.currentTime = t;
  _videoUiClockBase = t;
  _videoUiClockT0 = performance.now();
  emitirEstadoVideoParaServidor({ playing: true, syncTime: true, currentTime: t });
  iniciarRelogioUiVideo();
  reproduzirElementoPreviewLocal(t);
  atualizarUiPlayerAudioRemoto();
  renderGridApresentacao();
}

/** Projeta e reproduz o item i da playlist, reutilizando o motor de vídeo único. */
async function reproduzirItemPlaylist(i) {
  if (!apresentacaoVideoPlaylist.length) return;
  const idx = Math.max(0, Math.min(apresentacaoVideoPlaylist.length - 1, Math.round(Number(i) || 0)));
  const item = apresentacaoVideoPlaylist[idx];
  if (!item) return;
  cancelarAvancoAutoPlaylist();
  playlistVideoIndice = idx;
  playlistVideoAtiva = true;
  renderListaPlaylistApresentacao();
  const it = await restaurarItemVideoApresentacao(item);
  if (!it?.src) {
    playlistVideoAtiva = false;
    renderListaPlaylistApresentacao();
    alert('Não foi possível carregar o vídeo da playlist. Adicione o arquivo novamente.');
    return;
  }
  apresentacaoVideoPlaylist[idx] = { ...item, ...it };
  if (Number(item.duracao) > 0) apresentacaoVideoPlaylist[idx].duracao = Number(item.duracao);
  _playlistProjetando = true;
  try {
    await projetarItemApresentacao(apresentacaoVideoPlaylist[idx]);
  } finally {
    _playlistProjetando = false;
  }
  if (apresentacaoMidiaProjetadaId !== apresentacaoVideoPlaylist[idx].id) {
    playlistVideoAtiva = false;
    renderListaPlaylistApresentacao();
    return;
  }
  iniciarPlaybackVideoProjetado(0);
  renderListaPlaylistApresentacao();
  /* Reforço: o telão pode montar o <video> logo após receber a projeção;
     reenvia o play para evitar que o primeiro comando chegue antes do elemento. */
  setTimeout(() => {
    if (playlistControlaReproducaoAtual() && audioStateRemoto.playing) {
      emitirEstadoVideoParaServidor({
        playing: true,
        syncTime: true,
        currentTime: Number(audioStateRemoto.currentTime) || 0,
      });
    }
  }, 350);
}

/** Chamado quando um vídeo da playlist termina (a partir do relógio da UI). */
function aoTerminarVideoPlaylist() {
  const total = apresentacaoVideoPlaylist.length;
  const proximo = playlistVideoIndice + 1;
  if (proximo >= total) {
    playlistVideoAtiva = false;
    cancelarAvancoAutoPlaylist();
    renderListaPlaylistApresentacao();
    return;
  }
  playlistVideoIndice = proximo;
  renderListaPlaylistApresentacao();
  if (playlistVideoModo === 'auto') {
    const atrasoMs = Math.max(0, Number(playlistVideoAtrasoAuto) || 0) * 1000;
    cancelarAvancoAutoPlaylist();
    _playlistAutoTimer = setTimeout(() => {
      _playlistAutoTimer = null;
      void reproduzirItemPlaylist(playlistVideoIndice);
    }, atrasoMs);
  }
}

function playlistAlternarModo(force) {
  const semArgumento = force === undefined || force === null;
  const prox = semArgumento
    ? playlistVideoModo === 'auto'
      ? 'manual'
      : 'auto'
    : force === 'auto'
      ? 'auto'
      : 'manual';
  playlistVideoModo = prox;
  if (prox === 'manual') cancelarAvancoAutoPlaylist();
  salvarEstadoModoApresentacaoNoStorage();
  atualizarControlesPlaylistUi();
}

function playlistDefinirAtraso(seg) {
  let v = Math.round(Number(seg) || 0);
  if (!PLAYLIST_ATRASOS_PERMITIDOS.includes(v)) v = 0;
  playlistVideoAtrasoAuto = v;
  salvarEstadoModoApresentacaoNoStorage();
  atualizarControlesPlaylistUi();
}

/** Lê a duração de um arquivo de vídeo sem carregar tudo (metadata via objectURL). */
function probeDuracaoArquivoVideo(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      const limpar = () => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
  // intencional — erro ignorado
}
      };
      v.onloadedmetadata = () => {
        const d = Number(v.duration);
        limpar();
        resolve(Number.isFinite(d) ? d : 0);
      };
      v.onerror = () => {
        limpar();
        resolve(0);
      };
      setTimeout(() => resolve(0), 12000);
      v.src = url;
    } catch (_) {
      resolve(0);
    }
  });
}

function playlistAdicionarVideos(files) {
  Array.from(files || []).forEach((file) => {
    const mime = String(file.type || '');
    const nome = String(file.name || 'vídeo');
    if (!/^video\//i.test(mime) && !/\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(nome)) return;
    criarItemApresentacaoDeArquivo(file, (item) => {
      if (item.kind !== 'video') return;
      apresentacaoVideoPlaylist.push(item);
      renderListaPlaylistApresentacao();
      salvarEstadoModoApresentacaoNoStorage();
      void probeDuracaoArquivoVideo(file).then((d) => {
        if (d > 0) {
          const alvo = apresentacaoVideoPlaylist.find((x) => x && x.id === item.id);
          if (alvo) {
            alvo.duracao = d;
            renderListaPlaylistApresentacao();
            salvarEstadoModoApresentacaoNoStorage();
          }
        }
      });
    });
  });
}

function playlistRemover(id) {
  const idx = apresentacaoVideoPlaylist.findIndex((x) => x && x.id === id);
  if (idx < 0) return;
  const eraItemProjetado = audioStateRemoto.mediaKind === 'video' && apresentacaoMidiaProjetadaId === id;
  apresentacaoVideoPlaylist.splice(idx, 1);
  if (eraItemProjetado) {
    cancelarAvancoAutoPlaylist();
    playlistVideoAtiva = false;
    void encerrarModoApresentacaoNoTelao();
  }
  if (idx < playlistVideoIndice) {
    playlistVideoIndice -= 1;
  } else if (idx === playlistVideoIndice) {
    if (playlistVideoIndice >= apresentacaoVideoPlaylist.length) {
      playlistVideoIndice = apresentacaoVideoPlaylist.length - 1;
    }
  }
  if (!apresentacaoVideoPlaylist.length) playlistVideoIndice = -1;
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

async function playlistLimpar() {
  if (!apresentacaoVideoPlaylist.length) return;
  const ok = await appConfirm('Limpar toda a playlist de vídeos?', 'Modo mídias');
  if (!ok) return;
  cancelarAvancoAutoPlaylist();
  const eraVideo = playlistVideoAtiva && audioStateRemoto.mediaKind === 'video' && videoProjetadoAtivoNoPlayer();
  apresentacaoVideoPlaylist = [];
  playlistVideoIndice = -1;
  playlistVideoAtiva = false;
  if (eraVideo) void encerrarModoApresentacaoNoTelao();
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

function playlistMover(id, dir) {
  const idx = apresentacaoVideoPlaylist.findIndex((x) => x && x.id === id);
  if (idx < 0) return;
  const alvo = idx + (dir === 'up' ? -1 : 1);
  if (alvo < 0 || alvo >= apresentacaoVideoPlaylist.length) return;
  const arr = apresentacaoVideoPlaylist;
  const tmp = arr[idx];
  arr[idx] = arr[alvo];
  arr[alvo] = tmp;
  if (playlistVideoIndice === idx) playlistVideoIndice = alvo;
  else if (playlistVideoIndice === alvo) playlistVideoIndice = idx;
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

/** Reordena por arrastar-e-soltar: move fromId para a posição de toId. */
function playlistReordenarArrastando(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const atualId = playlistItemAtualId();
  const from = apresentacaoVideoPlaylist.findIndex((x) => x && x.id === fromId);
  if (from < 0) return;
  const [movido] = apresentacaoVideoPlaylist.splice(from, 1);
  let to = apresentacaoVideoPlaylist.findIndex((x) => x && x.id === toId);
  if (to < 0) to = apresentacaoVideoPlaylist.length;
  apresentacaoVideoPlaylist.splice(to, 0, movido);
  if (atualId) {
    const ni = apresentacaoVideoPlaylist.findIndex((x) => x && x.id === atualId);
    if (ni >= 0) playlistVideoIndice = ni;
  }
  salvarEstadoModoApresentacaoNoStorage();
  renderListaPlaylistApresentacao();
}

/** Atualiza botões de transporte, modo e intervalo (estado, não a lista inteira). */
function atualizarControlesPlaylistUi() {
  const auto = playlistVideoModo === 'auto';
  const modoBtn = document.getElementById('ap-playlist-modo');
  if (modoBtn) {
    modoBtn.classList.toggle('ap-switch--on', auto);
    modoBtn.setAttribute('aria-checked', auto ? 'true' : 'false');
    modoBtn.title = auto
      ? 'Avanço automático ativado — clique para Manual'
      : 'Avanço manual — clique para Automático';
  }
  const atrasoSel = document.getElementById('ap-playlist-atraso');
  if (atrasoSel) {
    atrasoSel.value = String(playlistVideoAtrasoAuto);
    atrasoSel.disabled = !auto;
  }
  const clearBtn = document.getElementById('ap-playlist-clear');
  if (clearBtn) clearBtn.disabled = !apresentacaoVideoPlaylist.length;
  _playlistUiTocandoCache = playlistControlaReproducaoAtual() && !!audioStateRemoto.playing;
}

/** Sincroniza só o destaque da linha ativa da playlist em transições (chamado a cada tick). */
function atualizarPlaylistUiAoVivoSeMudou() {
  const list = document.getElementById('apresentacao-playlist-list');
  if (!list) return;
  const tocando = playlistControlaReproducaoAtual() && !!audioStateRemoto.playing;
  if (_playlistUiTocandoCache === tocando) return;
  _playlistUiTocandoCache = tocando;
  if (list && playlistVideoIndice >= 0) {
    const row = list.querySelectorAll('.ap-playlist-item')[playlistVideoIndice];
    if (row) {
      row.classList.toggle('is-playing', tocando);
      row.classList.toggle('is-current', !tocando);
      const badge = row.querySelector('.ap-playlist-badge');
      const meta = row.querySelector('.ap-menu-item-meta');
      if (badge) badge.textContent = tocando ? '▶' : String(playlistVideoIndice + 1).padStart(2, '0');
      if (meta) {
        const it = apresentacaoVideoPlaylist[playlistVideoIndice];
        const durTxt = it && Number(it.duracao) > 0 ? ` · ${fmtTempoAudio(it.duracao)}` : '';
        meta.textContent = (tocando ? 'Tocando agora' : 'Pausado') + durTxt;
      }
    }
  }
}

function renderListaPlaylistApresentacao() {
  const list = document.getElementById('apresentacao-playlist-list');
  if (!list) return;
  list.innerHTML = '';
  if (!apresentacaoVideoPlaylist.length) {
    list.innerHTML =
      '<div class="placeholder-msg" style="margin:4px 0 0;">Nenhum vídeo na playlist. Use “Adicionar”.</div>';
    atualizarControlesPlaylistUi();
    return;
  }
  const projetadoEhAtual = !!apresentacaoMidiaProjetadaId && apresentacaoMidiaProjetadaId === playlistItemAtualId();
  apresentacaoVideoPlaylist.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'ap-menu-item ap-playlist-item';
    row.setAttribute('draggable', 'true');
    row.dataset.id = item.id;

    let statusTxt = 'Na fila';
    let statusCls = '';
    if (i === playlistVideoIndice) {
      if (projetadoEhAtual && audioStateRemoto.playing) {
        statusTxt = 'Tocando agora';
        statusCls = 'is-playing';
      } else if (projetadoEhAtual) {
        statusTxt = 'Pausado';
        statusCls = 'is-current';
      } else {
        statusTxt = 'Selecionado';
        statusCls = 'is-current';
      }
    } else if (i === playlistVideoIndice + 1) {
      statusTxt = 'Próximo';
      statusCls = 'is-next';
    }
    if (statusCls) row.classList.add(statusCls);

    const durTxt = Number(item.duracao) > 0 ? ` · ${fmtTempoAudio(item.duracao)}` : '';
    const badge = statusCls === 'is-playing' ? '▶' : String(i + 1).padStart(2, '0');
    row.innerHTML = `
      <div class="ap-playlist-badge" aria-hidden="true">${escapeHtml(badge)}</div>
      <div class="ap-menu-item-main">
        <div class="ap-menu-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <span class="ap-menu-item-meta">${escapeHtml(statusTxt)}${durTxt}</span>
      </div>
      <div class="ap-menu-item-actions">
        <button type="button" class="ap-menu-action mv-up" title="Mover para cima" aria-label="Mover para cima">↑</button>
        <button type="button" class="ap-menu-action mv-down" title="Mover para baixo" aria-label="Mover para baixo">↓</button>
        <button type="button" class="ap-menu-action delete" title="Remover da playlist" aria-label="Remover da playlist">✕</button>
      </div>
    `;

    row.addEventListener('dblclick', () => {
      void reproduzirItemPlaylist(i);
    });
    row.querySelector('.mv-up')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playlistMover(item.id, 'up');
    });
    row.querySelector('.mv-down')?.addEventListener('click', (e) => {
      e.stopPropagation();
      playlistMover(item.id, 'down');
    });
    row.querySelector('.delete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await appConfirm(`Remover "${item.name}" da playlist?`, 'Modo mídias');
      if (ok) playlistRemover(item.id);
    });

    row.addEventListener('dragstart', (e) => {
      playlistArrastandoId = item.id;
      row.classList.add('arrastando');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
      } catch (_) {
  // intencional — erro ignorado
}
    });
    row.addEventListener('dragend', () => {
      playlistArrastandoId = null;
      row.classList.remove('arrastando');
      list.querySelectorAll('.ap-playlist-item').forEach((r) => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('drag-over');
      try {
        e.dataTransfer.dropEffect = 'move';
      } catch (_) {
  // intencional — erro ignorado
}
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const fromId = playlistArrastandoId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
      playlistReordenarArrastando(fromId, item.id);
    });

    list.appendChild(row);
  });
  atualizarControlesPlaylistUi();
  atualizarPreviewVideoAoVivo();
}

let _playerVideoToggleLock = false;

async function tocarAudioAtualSelecionado() {
  const itemVideo = obterItemVideoProjetadoNoPlayer();
  if (itemVideo) {
    if (_playerVideoToggleLock) return;
    _playerVideoToggleLock = true;
    const querPausar = !!audioStateRemoto.playing;
    let liberarLockNoFinally = true;
    try {
      audioStateRemoto.mediaKind = 'video';
      audioStateRemoto.name = itemVideo.name || 'Vídeo';

      if (querPausar) {
        pausarAudioLocalApresentacao();
        renderGridApresentacao();
        liberarLockNoFinally = false;
        setTimeout(() => {
          _playerVideoToggleLock = false;
        }, 0);
        return;
      }

      const item = await restaurarItemVideoApresentacao(itemVideo);
      if (!item?.src) {
        alert('Não foi possível carregar o vídeo. Selecione o arquivo novamente no card 5.');
        return;
      }
      const el = obterElementoVideoLocal();
      if (el && (!Number.isFinite(audioStateRemoto.duration) || audioStateRemoto.duration <= 0)) {
        if (!el.src || el.src !== item.src) {
          prepararElementoVideoLocalControle(el);
          el.preload = 'metadata';
          el.src = item.src;
          await aguardarMetadadosVideo(el, 6000);
        }
        if (Number.isFinite(el.duration) && el.duration > 0) {
          audioStateRemoto.duration = Number(el.duration);
        }
      }
      const t = Number(audioStateRemoto.currentTime) || 0;
      audioStateRemoto.playing = true;
      _videoUiClockBase = t;
      _videoUiClockT0 = performance.now();
      emitirEstadoVideoParaServidor({ playing: true, syncTime: true, currentTime: t });
      iniciarRelogioUiVideo();
      reproduzirElementoPreviewLocal(t);
      atualizarUiPlayerAudioRemoto();
      renderGridApresentacao();
    } finally {
      if (liberarLockNoFinally) _playerVideoToggleLock = false;
    }
    return;
  }
  if (!apresentacaoAudioAtualId) return;
  const item = apresentacaoAudios.find((x) => x.id === apresentacaoAudioAtualId);
  if (!item) return;
  if (audioStateRemoto.playing && audioStateRemoto.mediaKind === 'audio' && apresentacaoAudioAtualId === item.id) {
    pausarAudioServidor();
  } else {
    const deveRetomarMesmoAudio = audioStateRemoto.mediaKind === 'audio' && apresentacaoAudioAtualId === item.id;
    if (deveRetomarMesmoAudio) {
      const dur = Math.max(0, Number(audioStateRemoto.duration) || 0);
      const atual = Math.max(0, Number(audioStateRemoto.currentTime) || 0);
      const startTime = dur > 0 && atual >= Math.max(0, dur - 0.35) ? 0 : atual;
      const ok = await tocarAudioServidorApresentacao(item, { startTime });
      if (ok) atualizarRodapeAudioApresentacao(item);
    } else {
      await projetarItemApresentacao(item);
    }
  }
  renderListaAudiosApresentacao();
}

function pausarAudioServidor() {
  pausarAudioServidorPlayback();
}

function pararAudioServidor() {
  const eraVideo = audioStateRemoto.mediaKind === 'video' && videoProjetadoAtivoNoPlayer();
  pararAudioServidorPlayback();
  apresentacaoAudioAtualId = null;
  salvarEstadoModoApresentacaoNoStorage();
  renderListaAudiosApresentacao();
  if (eraVideo) {
    void encerrarModoApresentacaoNoTelao();
    renderGridApresentacao();
    return;
  }
  if (!apresentacaoMidiaProjetadaId) {
    atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'Reprodução parada.' });
  } else {
    renderGridApresentacao();
  }
}

function renderMenuApresentacao() {
  const list = document.getElementById('apresentacao-menu-list');
  const selLabel = document.getElementById('ap-files-selected');
  if (!list) return;
  list.innerHTML = '';
  const atual = apresentacaoBiblioteca.find((x) => x.id === apresentacaoArquivoSelecionadoId) || null;
  if (selLabel) {
    selLabel.textContent = atual ? `Arquivo: ${atual.name}` : 'Selecione um arquivo...';
    selLabel.title = atual && atual.name ? String(atual.name) : '';
  }
  if (!apresentacaoBiblioteca.length) {
    list.innerHTML = '<div class="placeholder-msg">Sem arquivos no menu.</div>';
    return;
  }
  apresentacaoBiblioteca.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'ap-menu-item';
    row.draggable = true;
    row.dataset.itemId = item.id;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', apresentacaoArquivoSelecionadoId && item.id === apresentacaoArquivoSelecionadoId ? 'true' : 'false');
    row.innerHTML = `
      <div class="ap-menu-item-main">
        <div class="ap-menu-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <span class="ap-menu-item-meta">${escapeHtml(item.kind)}</span>
      </div>
      <div class="ap-menu-item-actions">
        <button type="button" class="ap-menu-action edit" title="Editar nome" aria-label="Editar nome">✏</button>
        <button type="button" class="ap-menu-action delete" title="Excluir do menu" aria-label="Excluir do menu">✕</button>
      </div>
    `;
    row.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', item.id);
      ev.dataTransfer.effectAllowed = 'copyMove';
    });
    row.addEventListener('dblclick', () => {
      projetarItemApresentacao(item);
      fecharApFilesDropdown();
    });
    row.addEventListener('click', (ev) => {
      if (ev.target instanceof HTMLElement && ev.target.closest('.ap-menu-item-actions, .ap-menu-edit-input')) return;
      apresentacaoArquivoSelecionadoId = item.id || null;
      salvarEstadoModoApresentacaoNoStorage();
      renderMenuApresentacao();
      fecharApFilesDropdown();
    });

    const btnEdit = row.querySelector('.ap-menu-action.edit');
    const btnDelete = row.querySelector('.ap-menu-action.delete');
    const nameWrap = row.querySelector('.ap-menu-item-name');
    const mainWrap = row.querySelector('.ap-menu-item-main');

    btnEdit?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!nameWrap || !mainWrap) return;
      if (mainWrap.querySelector('input.ap-menu-edit-input')) return;
      const valorAtual = String(item.name || '').trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'ap-menu-edit-input';
      input.value = valorAtual;
      input.maxLength = 140;
      nameWrap.replaceWith(input);
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('mousedown', (e) => e.stopPropagation());
      input.focus();
      input.select();

      const salvarNome = () => {
        const novoNome = String(input.value || '').trim();
        if (!novoNome) {
          renderMenuApresentacao();
          return;
        }
        const atualizarNome = (obj) => {
          if (!obj || obj.id !== item.id) return;
          obj.name = novoNome;
          obj.title = novoNome;
        };
        apresentacaoBiblioteca.forEach(atualizarNome);
        apresentacaoCards.forEach(atualizarNome);
        if (apresentacaoArquivoSelecionadoId === item.id) {
          const selecionado = apresentacaoBiblioteca.find((x) => x.id === item.id);
          if (selecionado) {
            selecionado.name = novoNome;
            selecionado.title = novoNome;
          }
        }
        salvarEstadoModoApresentacaoNoStorage();
        renderMenuApresentacao();
        renderGridApresentacao();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          salvarNome();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          renderMenuApresentacao();
        }
      });
      input.addEventListener('blur', salvarNome);
    });

    btnDelete?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const ok = await appConfirm(`Excluir "${item.name}" do menu de arquivos?`, 'Modo apresentação');
      if (!ok) return;
      apresentacaoBiblioteca = (apresentacaoBiblioteca || []).filter((x) => x && x.id !== item.id);
      apresentacaoCards = (apresentacaoCards || []).map((x) => (x && x.id === item.id ? null : x));
      if (apresentacaoArquivoSelecionadoId === item.id) apresentacaoArquivoSelecionadoId = null;
      if (apresentacaoMidiaProjetadaId === item.id) {
        apresentacaoMidiaProjetadaId = null;
        void emitirEncerrarApresentacaoPublicoAoServidor();
      }
      salvarEstadoModoApresentacaoNoStorage();
      renderMenuApresentacao();
      atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'Arquivo removido do menu.' });
    });
    list.appendChild(row);
  });
}

function rotuloTipoMidiaApresentacao(kind) {
  const k = String(kind || '').toLowerCase();
  const map = {
    image: 'Imagem',
    video: 'Vídeo',
    audio: 'Áudio',
    pdf: 'PDF',
    iframe: 'Apresentação web',
    aviso: 'Aviso',
  };
  return map[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Arquivo');
}

/**
 * URL segura para `<img>` nos cards: só conteúdo **imagem** (`data:image/…`, `blob:` ou
 * `http(s)://…/api/apresentacao/media/id`). PDF/vídeo/áudio usam o mesmo endpoint no servidor
 * mas não são renderizáveis em `<img>` — sem o filtro por tipo aparecia ícone de imagem partida.
 */
function srcImagemApresentacaoSeguro(src, itemOuKind) {
  const s = String(src || '').trim();
  if (!s) return '';
  const sl = s.toLowerCase();
  if (sl.startsWith('javascript:') || sl.startsWith('vbscript:')) return '';
  const kind =
    itemOuKind && typeof itemOuKind === 'object'
      ? String(itemOuKind.kind || '').toLowerCase()
      : String(itemOuKind || '').toLowerCase();
  const mime =
    itemOuKind && typeof itemOuKind === 'object' ? String(itemOuKind.mime || '').toLowerCase() : '';
  const tratarComoImagem = kind === 'image' || mime.startsWith('image/');
  if (sl.startsWith('data:image/')) {
    const comma = s.indexOf(',');
    const meta = comma === -1 ? s : s.slice(0, comma);
    // eslint-disable-next-line no-control-regex -- intencional: rejeitar control chars em URL de imagem
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(meta)) return '';
    return s;
  }
  if (sl.startsWith('blob:') && /^blob:[^"'<>\s]+$/i.test(s)) {
    if (!tratarComoImagem) return '';
    return s;
  }
  try {
    const u = new URL(s, typeof window !== 'undefined' ? window.location.href : undefined);
    if (!/^https?:$/i.test(u.protocol)) return '';
    const p = (u.pathname || '').replace(/\/+$/, '');
    if (!/\/api\/apresentacao\/media\/[^/]+$/i.test(p)) return '';
    // eslint-disable-next-line no-control-regex -- intencional: rejeitar control chars em URL de imagem
    if (/[\u0000-\u001f\s"']/.test(s)) return '';
    if (!tratarComoImagem) return '';
    return s;
  } catch (_) {
    return '';
  }
}

/** Índice do card destacado na grelha (0–5) ou null — igual «slide seleccionado» na faixa do modo slide. */
let apresentacaoCardSelecionadoIdx = null;
/** Debounce entre clique simples e duplo na grelha de apresentação (padrão playlist). */
let apresentacaoCardUiClickTimer = null;

function aplicarClasseSelecaoCardsApresentacaoNoDom() {
  const grid = document.getElementById('apresentacao-grid');
  if (!grid) return;
  grid.querySelectorAll('.ap-card[data-ap-card-idx]').forEach((el) => {
    const idx = parseInt(el.dataset.apCardIdx, 10);
    const sel =
      Number.isFinite(idx) &&
      apresentacaoCardSelecionadoIdx !== null &&
      idx === apresentacaoCardSelecionadoIdx;
    el.classList.toggle('ap-card--selecionado', sel);
  });
}

function definirSelecaoCardApresentacao(idx) {
  if (idx === null || idx === undefined) {
    apresentacaoCardSelecionadoIdx = null;
  } else {
    const n = Number(idx);
    apresentacaoCardSelecionadoIdx = Number.isFinite(n) && n >= 0 && n <= 5 ? n : null;
  }
  aplicarClasseSelecaoCardsApresentacaoNoDom();
}

function svgIconeTipoMidiaApresentacao(kind) {
  const k = String(kind || '').toLowerCase();
  const c = 'ap-card-kind-ic';
  if (k === 'image') {
    return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  }
  if (k === 'video') {
    return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><polygon points="10 9 16 12 10 15 10 9" fill="currentColor" stroke="none"/></svg>`;
  }
  if (k === 'pdf') {
    return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/><path d="M9 11h6"/></svg>`;
  }
  if (k === 'iframe') {
    return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  }
  if (k === 'aviso') {
    return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 8v4M12 16h.01"/><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
  }
  return `<svg class="${c}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;
}

function renderGridApresentacao() {
  const grid = document.getElementById('apresentacao-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    const card = document.createElement('div');
    const item = apresentacaoCards[i];
    card.dataset.apCardIdx = String(i);
    card.className = item ? 'ap-card' : 'ap-card ap-card--vazio';
    const num = document.createElement('span');
    num.className = 'ap-card-num';
    num.textContent = i === APRESENTACAO_IDX_CARD5 ? 'CARD 5 — (APENAS VÍDEO)' : `CARD ${i + 1}`;
    const body = document.createElement('div');
    body.className = 'ap-card-body';
    body.dataset.cardIdx = String(i);
    if (!item) {
      body.innerHTML = '<div class="ap-card-plus">+</div>';
      body.addEventListener('click', () => {
        apresentacaoCardInputTarget = i;
        const input = document.getElementById('apresentacao-add-card-input');
        if (!input) return;
        input.accept =
          i === APRESENTACAO_IDX_CARD5
            ? 'video/*'
            : 'image/*,application/pdf,.ppt,.pptx,.odp';
        input.value = '';
        input.click();
      });
    } else {
      const srcRaw = String(item.src || '');
      const kItem = String(item.kind || '').toLowerCase();
      const mimeItem = String(item.mime || '').toLowerCase();
      const ehCard5Video = i === APRESENTACAO_IDX_CARD5 && kItem === 'video';
      if (ehCard5Video) {
        card.classList.add('ap-card--video');
        body.className = 'ap-card-body ap-card-body--video';
      }
      const ehImg =
        !ehCard5Video &&
        (/^data:image\//i.test(srcRaw) ||
          (kItem === 'image' || mimeItem.startsWith('image/')));
      const srcImg = ehImg ? srcImagemApresentacaoSeguro(item.src, item) : '';
      const metaLinha = `${svgIconeTipoMidiaApresentacao(item.kind)}<span>${escapeHtml(rotuloTipoMidiaApresentacao(item.kind))}</span>`;
      const wrap = document.createElement('div');
      wrap.className = ehCard5Video ? 'ap-card5-video-wrap' : 'ap-card-file';
      const card5VideoAoVivo =
        ehCard5Video &&
        item.id === apresentacaoMidiaProjetadaId &&
        audioStateRemoto.mediaKind === 'video' &&
        !!audioStateRemoto.playing;
      if (ehCard5Video && card5VideoAoVivo) {
        /* Slot placeholder com id estável; o overlay de vídeo ao vivo o cobre. */
        const slot = document.createElement('div');
        slot.className = 'ap-card5-video-player';
        slot.id = 'ap-card5-video-live-slot';
        slot.setAttribute('aria-hidden', 'true');
        wrap.appendChild(slot);
      } else if (ehCard5Video) {
        const thumbSrc = obterThumbVideoApresentacao(item);
        if (thumbSrc) {
          const img = document.createElement('img');
          img.className = 'ap-card5-video-player ap-card5-video-thumb';
          img.alt = '';
          img.src = thumbSrc;
          wrap.appendChild(img);
        } else {
          const ph = document.createElement('div');
          ph.className = 'ap-card5-video-player ap-card5-video-thumb-placeholder';
          ph.setAttribute('aria-hidden', 'true');
          wrap.appendChild(ph);
          void garantirThumbnailVideoItem(item).then((it) => {
            if (videoProjetadoAtivoNoPlayer() && audioStateRemoto.playing) return;
            if (!it?.thumb) return;
            apresentacaoCards[APRESENTACAO_IDX_CARD5] = it;
            const bibIdx = apresentacaoBiblioteca.findIndex((x) => x && x.id === it.id);
            if (bibIdx >= 0) apresentacaoBiblioteca[bibIdx] = it;
            salvarEstadoModoApresentacaoNoStorage();
            if (ehModoApresentacaoOperador()) renderGridApresentacao();
          });
        }
      } else if (srcImg) {
        const img = document.createElement('img');
        img.className = 'ap-card-preview-image';
        img.alt = String(item.name || 'imagem');
        img.src = srcImg;
        wrap.appendChild(img);
      }
      const nomeEl = document.createElement('div');
      nomeEl.className = ehCard5Video ? 'ap-card5-video-name' : 'ap-card-file-name';
      nomeEl.title = String(item.name || '');
      nomeEl.textContent = String(item.name || 'Arquivo');
      wrap.appendChild(nomeEl);
      if (!ehCard5Video) {
        const metaEl = document.createElement('div');
        metaEl.className = 'ap-card-file-meta';
        metaEl.title = String(item.name || '');
        metaEl.innerHTML = metaLinha;
        wrap.appendChild(metaEl);
      }
      if (item.id && item.id === apresentacaoMidiaProjetadaId && item.kind !== 'audio') {
        card.classList.add('ap-card--projetando');
        const live = document.createElement('div');
        live.className = 'ap-card-live-pill';
        live.textContent = 'AO VIVO';
        live.setAttribute('aria-hidden', 'true');
        wrap.insertBefore(live, wrap.firstChild);
      }
      body.appendChild(wrap);
      body.draggable = true;
      body.title = 'Clique para selecionar · duplo clique para projetar';
      body.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', item.id || '');
        ev.dataTransfer.setData('application/x-ap-card-idx', String(i));
        ev.dataTransfer.effectAllowed = 'copyMove';
      });
      body.addEventListener('click', (ev) => {
        if (ev.target.closest('.ap-card-remove')) return;
        if (ev.detail >= 2) return;
        clearTimeout(apresentacaoCardUiClickTimer);
        apresentacaoCardUiClickTimer = setTimeout(() => {
          apresentacaoCardUiClickTimer = null;
          definirSelecaoCardApresentacao(i);
        }, 300);
      });
      body.addEventListener('dblclick', (ev) => {
        if (ev.target.closest('.ap-card-remove')) return;
        ev.preventDefault();
        clearTimeout(apresentacaoCardUiClickTimer);
        apresentacaoCardUiClickTimer = null;
        projetarItemApresentacao(item);
      });

      const btnRemove = document.createElement('button');
      btnRemove.type = 'button';
      btnRemove.className = 'ap-card-remove';
      btnRemove.title = 'Remover arquivo do card';
      btnRemove.setAttribute('aria-label', `Remover arquivo do card ${i + 1}`);
      btnRemove.textContent = 'X';
      btnRemove.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (item.id && apresentacaoMidiaProjetadaId === item.id) {
          apresentacaoMidiaProjetadaId = null;
          void emitirEncerrarApresentacaoPublicoAoServidor();
        }
        if (apresentacaoCardSelecionadoIdx === i) definirSelecaoCardApresentacao(null);
        apresentacaoCards[i] = null;
        salvarEstadoModoApresentacaoNoStorage();
        atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: `Card ${i + 1} limpo.` });
      });
      card.appendChild(btnRemove);
    }
    body.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      body.classList.add('drag-over');
      ev.dataTransfer.dropEffect = 'copy';
    });
    body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
    body.addEventListener('drop', (ev) => {
      ev.preventDefault();
      body.classList.remove('drag-over');
      const id = String(ev.dataTransfer.getData('text/plain') || '');
      const fromIdxRaw = ev.dataTransfer.getData('application/x-ap-card-idx');
      const fromIdx = parseInt(String(fromIdxRaw || ''), 10);
      let it = null;
      if (id) it = apresentacaoBiblioteca.find((x) => x.id === id) || null;
      if (!it && Number.isInteger(fromIdx) && fromIdx >= 0 && fromIdx < 5) {
        it = apresentacaoCards[fromIdx] || null;
      }
      if (!it) return;
      if (it.kind === 'video' && i !== APRESENTACAO_IDX_CARD5) {
        alert('Use o card 5 para ficheiros de vídeo.');
        return;
      }
      if (it.kind !== 'video' && i === APRESENTACAO_IDX_CARD5) {
        alert('O card 5 aceita apenas vídeos.');
        return;
      }
      if (Number.isInteger(fromIdx) && fromIdx >= 0 && fromIdx < 5) {
        if (fromIdx === i) return;
        apresentacaoCards[fromIdx] = null;
      }
      if (it.kind === 'video') {
        void (async () => {
          const itemHttp = await garantirVideoSrcHttp(it);
          await garantirThumbnailVideoItem(itemHttp);
          apresentacaoCards[i] = itemHttp;
          salvarEstadoModoApresentacaoNoStorage();
          renderGridApresentacao();
        })();
        return;
      }
      apresentacaoCards[i] = it;
      salvarEstadoModoApresentacaoNoStorage();
      renderGridApresentacao();
    });
    card.appendChild(num);
    card.appendChild(body);
    grid.appendChild(card);
  }

  /* Card 6: avisos em texto (sem ficheiro) */
  const i = 5;
  const card6 = document.createElement('div');
  card6.dataset.apCardIdx = '5';
  card6.className = 'ap-card ap-card--aviso';
  card6.title = 'Clique para selecionar o card · duplo clique fora do texto para projetar';
  if (apresentacaoMidiaProjetadaId === ID_PROJECAO_AVISO_CARD6) card6.classList.add('ap-card--projetando');
  const num6 = document.createElement('span');
  num6.className = 'ap-card-num';
  num6.textContent = 'CARD 6 — AVISOS';
  const body6 = document.createElement('div');
  body6.className = 'ap-card-body ap-card-body--aviso';
  body6.dataset.cardIdx = '5';
  const ta = document.createElement('textarea');
  ta.className = 'ap-card6-aviso-textarea';
  ta.dataset.apCard6CfgField = '1';
  ta.setAttribute('aria-label', 'Texto de avisos para projetar no card 6');
  ta.placeholder = 'Digite avisos rápidos… Use o botão Projetar ou duplo clique no texto.';
  ta.value = apresentacaoCard6Texto;
  aplicarEstiloTextareaAvisoCard6(ta, apresentacaoCard6AvisoCfg);
  ta.addEventListener('click', (ev) => ev.stopPropagation());
  ta.addEventListener('input', () => {
    // Atualização em memória é instantânea; a gravação pesada é adiada (debounce) para não travar a digitação.
    apresentacaoCard6Texto = ta.value;
    agendarSalvarEstadoAposDigitarAviso();
  });
  ta.addEventListener('blur', flushSalvarEstadoAposDigitarAviso);
  ta.addEventListener('dblclick', (ev) => {
    ev.stopPropagation();
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = null;
    projetarAvisoCard6();
  });
  card6.addEventListener('click', (ev) => {
    if (ev.target === ta || (ta && ta.contains(ev.target))) return;
    if (ev.target.closest('button')) return;
    if (ev.detail >= 2) return;
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = setTimeout(() => {
      apresentacaoCardUiClickTimer = null;
      definirSelecaoCardApresentacao(5);
    }, 300);
  });
  card6.addEventListener('dblclick', (ev) => {
    if (ev.target === ta || (ta && ta.contains(ev.target))) return;
    if (ev.target.closest('button')) return;
    ev.preventDefault();
    ev.stopPropagation();
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = null;
    projetarAvisoCard6();
  });
  if (apresentacaoMidiaProjetadaId === ID_PROJECAO_AVISO_CARD6) {
    const live = document.createElement('div');
    live.className = 'ap-card-live-pill';
    live.textContent = 'AO VIVO';
    live.setAttribute('aria-hidden', 'true');
    body6.appendChild(live);
  }
  body6.appendChild(ta);
  const rowBtns = document.createElement('div');
  rowBtns.className = 'ap-card6-actions';
  const btnProjCard6 = document.createElement('button');
  btnProjCard6.type = 'button';
  btnProjCard6.className = 'btn sm primary';
  btnProjCard6.textContent = 'Projetar';
  btnProjCard6.title = 'Projeta o aviso nos monitores definidos em «Monitor» no cabeçalho';
  btnProjCard6.addEventListener('click', (ev) => {
    ev.stopPropagation();
    projetarAvisoCard6();
  });
  const btnLimparTxt = document.createElement('button');
  btnLimparTxt.type = 'button';
  btnLimparTxt.className = 'btn sm';
  btnLimparTxt.textContent = 'Limpar texto';
  btnLimparTxt.addEventListener('click', (ev) => {
    ev.stopPropagation();
    apresentacaoCard6Texto = '';
    salvarEstadoModoApresentacaoNoStorage();
    renderGridApresentacao();
  });
  rowBtns.appendChild(btnProjCard6);
  rowBtns.appendChild(btnLimparTxt);
  body6.appendChild(rowBtns);
  card6.appendChild(num6);
  card6.appendChild(body6);
  grid.appendChild(card6);

  aplicarClasseSelecaoCardsApresentacaoNoDom();
  atualizarPreviewVideoAoVivo();
}

function adicionarArquivosAoMenu(files) {
  Array.from(files || []).forEach((file) => {
    criarItemApresentacaoDeArquivo(file, (item) => {
      apresentacaoBiblioteca.push(item);
      salvarEstadoModoApresentacaoNoStorage();
      renderMenuApresentacao();
    });
  });
}

function adicionarArquivoDiretoNoCard(file, cardIdx) {
  const idx = Number(cardIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx > 5) return;
  if (idx === 5) return;
  criarItemApresentacaoDeArquivo(file, async (item) => {
    if (item.kind === 'video' && idx !== APRESENTACAO_IDX_CARD5) {
      alert('Vídeos devem ser adicionados no card 5.');
      return;
    }
    if (item.kind !== 'video' && idx === APRESENTACAO_IDX_CARD5) {
      alert('O card 5 aceita apenas vídeos.');
      return;
    }
    if (item.kind === 'video') {
      await garantirVideoSrcHttp(item);
      await garantirThumbnailVideoItem(item);
    }
    apresentacaoCards[idx] = item;
    const ja = apresentacaoBiblioteca.some((x) => x.src === item.src && x.name === item.name);
    if (!ja) apresentacaoBiblioteca.push(item);
    salvarEstadoModoApresentacaoNoStorage();
    renderMenuApresentacao();
    if (apresentacaoMidiaProjetadaId) {
      renderGridApresentacao();
    } else {
      atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: `Arquivo no card ${idx + 1}: ${item.name}` });
    }
  });
}

function abrirMenuModoApresentacao() {
  const ativo = ehModoApresentacaoOperador();
  if (ativo) return;
  executarComTransicaoUi(() => {
    if (document.body.classList.contains('app-mod-biblia')) {
      reconhecimentoVozBiblia.aoSairModoBiblia();
      bibliaSairModo();
    }
    document.body.classList.remove('app-mod-slides', 'app-mod-biblia');
    document.body.classList.add('app-mod-apresentacao');
    document.title = 'Lyra — Modo apresentação';
    try { localStorage.setItem(LS_UI_MODO_SLIDES, '0'); } catch (_) {
  // intencional — erro ignorado
}
    aplicarRotulosEPlaylistModoSlides();
    atualizarBtnToggleModoSlides();
    atualizarBtnModoApresentacao();
    renderSlidesStrip();
    if (!hayProjecaoAtivaModoBibliaOuApresentacao()) {
      rotasPorModo.apresentacao = rotaDesativada();
      marcarRotaLiveNoDom(false);
    }
    aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: true });
    apresentacaoCardSelecionadoIdx = null;
    renderGridApresentacao();
    void restaurarVideosModoApresentacao().then(() => {
      if (ehModoApresentacaoOperador()) {
        renderGridApresentacao();
        renderListaPlaylistApresentacao();
      }
    });
    renderListaPlaylistApresentacao();
    reconhecimentoVozSlides.aoEntrarModoApresentacao();
    atualizarBtnModoBiblia();
  });
}

/** Tradução escolhida ao entrar no modo Bíblia; só vale nesta janela do controlador (não persiste ao fechar o app). */
let bibliaTraducaoSessao = null;
const SS_BIBLIA_TRADUCAO_SESSAO = 'lyra_biblia_traducao_sessao_v1';

function obterBibliaTraducaoSessao() {
  if (bibliaTraducaoSessao) return bibliaTraducaoSessao;
  try {
    const codigo = String(sessionStorage.getItem(SS_BIBLIA_TRADUCAO_SESSAO) || '').trim();
    if (codigo) bibliaTraducaoSessao = codigo;
  } catch (_) {
  // intencional — erro ignorado
}
  return bibliaTraducaoSessao;
}

function definirBibliaTraducaoSessao(codigo) {
  const traducao = String(codigo || '').trim();
  bibliaTraducaoSessao = traducao || null;
  try {
    if (bibliaTraducaoSessao) {
      sessionStorage.setItem(SS_BIBLIA_TRADUCAO_SESSAO, bibliaTraducaoSessao);
    } else {
      sessionStorage.removeItem(SS_BIBLIA_TRADUCAO_SESSAO);
    }
  } catch (_) {
  // intencional — erro ignorado
}
  return bibliaTraducaoSessao;
}

async function fetchListaTraducoesBiblia() {
  const res = await fetch(`${getControllerApiBase()}/api/biblia/traducoes`);
  if (!res.ok) throw new Error('Falha ao carregar traduções da Bíblia');
  return res.json();
}

async function perguntarTraducaoBibliaSeNecessario() {
  const traducaoSessao = obterBibliaTraducaoSessao();
  if (traducaoSessao) return traducaoSessao;
  let lista;
  try {
    lista = await fetchListaTraducoesBiblia();
  } catch (e) {
    console.error('Erro ao carregar traduções', e);
    await appAlert('Não foi possível carregar as traduções da Bíblia.', 'Modo Bíblia');
    return null;
  }
  if (!Array.isArray(lista) || !lista.length) {
    await appAlert('Nenhuma tradução da Bíblia disponível neste servidor.', 'Modo Bíblia');
    return null;
  }
  const escolha = await appEscolherOpcao(
    'Versão da Bíblia',
    lista.map((t) => ({
      label: `${t.traducao} — ${t.nome}`,
      value: t.traducao,
    })),
    'Escolha a tradução para projetar nesta sessão do controlador.\nAo fechar e abrir o app de novo, será perguntado outra vez.'
  );
  if (!escolha) return null;
  return definirBibliaTraducaoSessao(escolha);
}

function aplicarTraducaoBibliaNoSelect(codigo) {
  const sel = document.getElementById('traducao-sel');
  if (!codigo) return;
  bibliaTraducaoAtual = codigo;
  if (sel && [...sel.options].some((o) => o.value === codigo)) sel.value = codigo;
}

function onTraducaoBibliaChange() {
  const cod = (document.getElementById('traducao-sel')?.value || '').trim();
  if (!cod) return;
  definirBibliaTraducaoSessao(cod);
  bibliaTraducaoAtual = cod;
  bibliaSelecionadoLivro = null;
  bibliaSelecionadoLivroDb = null;
  bibliaSelecionadoCap = null;
  bibliaCapsRequestSeq++;
  bibliaVersiculosRequestSeq++;
  bibliaPrefetchCapJob++;
  popularGradeLivros();
  const colCaps = document.getElementById('biblia-col-caps');
  if (colCaps) colCaps.innerHTML = '<div class="biblia-placeholder">← Selecione um livro</div>';
  const colVers = document.getElementById('biblia-col-versiculos');
  if (colVers) colVers.innerHTML = '<div class="biblia-placeholder">← Selecione um capítulo</div>';
}

async function alternarModoBiblia() {
  const ativo = document.body.classList.contains('app-mod-biblia');
  /* Slide → Bíblia tem de encerrar a projeção, tal como Slide → Home. */
  const vinhaDoModoSlides = !ativo && ehModoSlidesOperador();
  if (!ativo) {
    const trad = await perguntarTraducaoBibliaSeNecessario();
    if (!trad) return;
    await carregarTraducoes();
    aplicarTraducaoBibliaNoSelect(trad);
  }
  executarComTransicaoUi(() => {
    document.body.classList.remove('app-mod-slides', 'app-mod-apresentacao');
    if (!ativo) {
      salvarSlideCfgNoStorage();
      document.body.classList.add('app-mod-biblia');
      document.title = 'Lyra — Modo Bíblia';
      if (vinhaDoModoSlides) {
        try { localStorage.setItem(LS_UI_MODO_SLIDES, '0'); } catch (_) {
          // intencional — erro ignorado
        }
        encerrarProjecaoAoSairDoModoSlides();
        renderSlidesStrip();
        atualizarPreviewOperador();
      }
      carregarBibliaCfgDoStorage();
      if (hayProjecaoMidiaApresentacaoAtiva()) {
        /* Canal partilhado: adopta monitores da mídia ainda no ar — não os desativa. */
        rotasPorModo.biblia = { ...normalizarRota(rotasPorModo.apresentacao) };
      } else if (!hayProjecaoAtivaModoBibliaOuApresentacao()) {
        rotasPorModo.biblia = rotaDesativada();
        marcarRotaLiveNoDom(false);
      }
      bibliaAplicarCfgExibicao();
      bibliaRotaSyncServidorChave = null;
      aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: true });
      bibliaRotaSyncServidorChave = bibliaChaveRotaAtual();
      atualizarVisibilidadeAbasCfgPorModo();
    } else {
      document.body.classList.remove('app-mod-biblia');
      document.title = 'Lyra — Controlador';
      bibliaSairModo();
      atualizarVisibilidadeAbasCfgPorModo();
      liberarBloqueioUiModos();
      /* Sair do modo Bíblia encerra a projeção — rotas transitórias voltam a Desativado. */
      void desativarRotasModosTransitorios({ sincronizarServidor: true, forcar: true });
      aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
    }
    atualizarBtnModoBiblia();
    atualizarBtnToggleModoSlides();
    atualizarBtnModoApresentacao();
    if (!ativo) {
      reconhecimentoVozSlides.aoSairModoSlides();
      reconhecimentoVozBiblia.aoEntrarModoBiblia();
    } else {
      reconhecimentoVozBiblia.aoSairModoBiblia();
      reconhecimentoVozSlides.atualizarUi();
    }
  });
}

function atualizarBtnModoBiblia() {
  definirEstadoBtnModoCabecalho(
    'btn-modo-biblia',
    document.body.classList.contains('app-mod-biblia'),
    'MODO BÍBLIA (ativo) — voltar à tela inicial',
    'Entrar no MODO BÍBLIA',
  );
  atualizarBtnTelaInicial();
}

/**
 * A Home está ativa quando nenhum modo está ativo. O realce visual é resolvido
 * em CSS; aqui só se expõe o estado a leitores de ecrã com aria-current.
 */
function atualizarBtnTelaInicial() {
  const btn = document.getElementById('btn-tela-inicial');
  if (!btn) return;
  const naHome = !ehModoSlidesOperador()
    && !ehModoBibliaOperador()
    && !ehModoApresentacaoOperador();
  if (naHome) btn.setAttribute('aria-current', 'page');
  else btn.removeAttribute('aria-current');
  btn.title = naHome ? 'TELA INICIAL (HOME) — ecrã atual' : 'VOLTAR PARA A TELA INICIAL (HOME)';
}

async function carregarTraducoes() {
  const sel = document.getElementById('traducao-sel');
  if (!sel) return;
  try {
    const lista = await fetchListaTraducoesBiblia();
    sel.innerHTML = lista.map((t) =>
      `<option value="${escapeHtml(t.traducao)}">${escapeHtml(t.traducao)} — ${escapeHtml(t.nome)}</option>`
    ).join('');
    const traducaoSessao = obterBibliaTraducaoSessao();
    if (traducaoSessao) aplicarTraducaoBibliaNoSelect(traducaoSessao);
    popularGradeLivros();
  } catch (e) {
    console.error('Erro ao carregar traduções', e);
  }
}

function fecharMenuModoApresentacao() {
  if (!ehModoApresentacaoOperador()) return;
  const preservarProjecao = hayProjecaoMidiaApresentacaoAtiva();
  executarComTransicaoUi(() => {
    document.body.classList.remove('app-mod-apresentacao');
    document.title = 'Lyra — Controlador';
    if (!preservarProjecao) {
      apresentacaoMidiaProjetadaId = null;
    }
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = null;
    apresentacaoCardSelecionadoIdx = null;
    atualizarBtnModoApresentacao();
    renderSlidesStrip();
    if (!preservarProjecao) {
      void desativarRotasModosTransitorios({ sincronizarServidor: true });
    }
    aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: preservarProjecao });
    reconhecimentoVozSlides.atualizarUi();
  });
}

function escolherArquivoModoApresentacao() {
  const input = document.getElementById('apresentacao-add-menu-input');
  if (!input) return;
  input.value = '';
  input.click();
}

/**
 * Para mídia/telas no servidor e limpa estado local usado nas prévias.
 * Usado ao escolher «Desativado» no modo apresentação e no botão «Encerrar projeção».
 */
function encerrarProjecaoMidiaApresentacaoNoControlador() {
  const eraVideo = audioStateRemoto.mediaKind === 'video' && videoProjetadoAtivoNoPlayer();
  if (eraVideo) {
    pararAudioLocalApresentacao();
  } else {
    pararAudioServidorPlayback();
  }
  apresentacaoMidiaProjetadaId = null;
  ultimoConteudoProjetadoModoUnificado = null;
  try {
    localStorage.setItem(LS_MODO_APRESENTACAO_ATIVO, '0');
  } catch (_) {
  // intencional — erro ignorado
}
  void emitirEncerrarApresentacaoPublicoAoServidor();
  projecao.enviar('encerrar_projecao');
  apresentacaoAudioAtualId = null;
  audioStateRemoto = { ...audioStateRemoto, playing: false, currentTime: 0, duration: 0, name: '' };
  try {
    atualizarUiPlayerAudioRemoto();
  } catch (_) {
  // intencional — erro ignorado
}
  try {
    renderListaAudiosApresentacao();
  } catch (_) {
  // intencional — erro ignorado
}
  estadoServidor = {
    tipo: null,
    titulo: '',
    linhas: [],
    estrofeIndex: 0,
    totalEstrofes: 0,
    telaLimpa: true,
    blackout: false,
    slidePretoFinal: false,
  };
}

/**
 * Encerra projeção, «Monitor» → Desativado, modo slide → Público M2 + Ministrante M3.
 */
async function encerrarProjecaoModoApresentacao() {
  if (!ehModoApresentacaoOperador()) return;
  encerrarProjecaoMidiaApresentacaoNoControlador();
  rotasPorModo.apresentacao = { publicoIndex: -1, ministranteIndex: -1 };
  rotasPorModo.slides = rotaSlidesPadraoPublico2Ministrante3(monitoresServidorCache);
  salvarRotasPorModoNoStorage();
  atualizarFeedbackProjecaoApresentacaoUi({
    mensagemIdle: 'Projeção encerrada. «Monitor» em Desativado; modo slide com Público (M2) e Ministrante (M3) ativos.',
  });
  aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
  atualizarPreviewOperador();
}

function agendarTrabalhoPesadoAposModoSlides(ativo) {
  const rodar = () => {
    aplicarRotulosEPlaylistModoSlides();
    renderSlidesStrip();
    atualizarPreviewOperador();
    renderPlaylist();
    atualizarToolbarModoEdicao();
    marcacaoEstrofeEditor();
    aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
    if (ativo) {
      reconhecimentoVozSlides.aoEntrarModoSlides();
      void salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
    } else {
      reconhecimentoVozSlides.aoSairModoSlides();
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(rodar);
  } else {
    setTimeout(rodar, 0);
  }
}

/**
 * Ao sair do modo slides: público sem projeção e ministrante em relógio (telaLimpa).
 * Partilhado por todas as saídas do modo slides (Home, Bíblia, Apresentação) para que
 * a transição encerre sempre a projeção de música.
 */
function encerrarProjecaoAoSairDoModoSlides() {
  estrofeAtiva = -1;
  slidesDockVisivel = false;
  projecaoMusicaEmitidaNoServidor = false;
  bloqueioSincronizarEstrofeDoServidor = false;
  /**
   * Limpa a seleção da playlist do modo slides já na saída (e não só ao reentrar):
   * a faixa é sempre rearmada por clique na playlist, então deixá-la «ligada» aqui
   * fazia a linha voltar destacada sobre uma grade vazia.
   * `musicaAtiva` fica intacta de propósito — a Home continua com a música no editor.
   */
  faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
  estadoServidor = {
    tipo: null,
    titulo: '',
    linhas: [],
    estrofeIndex: 0,
    totalEstrofes: 0,
    telaLimpa: true,
    blackout: false,
    slidePretoFinal: false,
  };
  projecao.enviar('limpar_tela');
}

async function alternarModoSlidesOperador(opts = {}) {
  const permitirDesativar = opts.permitirDesativar === true;
  if (ehModoSlidesOperador() && !permitirDesativar) return;
  if (ehModoBibliaOperador()) {
    rotasPorModo.biblia = rotaDesativada();
    marcarRotaLiveNoDom(false);
  }
  executarComTransicaoUi(() => {
    if (ehModoApresentacaoOperador()) {
      /* Sair de Mídias para Slides: nunca encerrar imagem/vídeo no telão. */
      document.body.classList.remove('app-mod-apresentacao');
      clearTimeout(apresentacaoCardUiClickTimer);
      apresentacaoCardUiClickTimer = null;
      apresentacaoCardSelecionadoIdx = null;
    }
    if (ehModoBibliaOperador()) {
      reconhecimentoVozBiblia.aoSairModoBiblia();
      document.body.classList.remove('app-mod-biblia');
      bibliaSairModo();
    }
    if (!ehModoSlidesOperador()) {
      document.body.classList.add('app-mod-slides');
    } else {
      document.body.classList.remove('app-mod-slides');
    }
    const ativo = ehModoSlidesOperador();
    slidesDockVisivel = ativo;
    document.title = ativo ? 'Lyra — Modo slides' : 'Lyra — Controlador';
    try {
      localStorage.setItem(LS_UI_MODO_SLIDES, ativo ? '1' : '0');
    } catch (_) {
  // intencional — erro ignorado
}
    if (ativo) {
      slidesRailUserRecolhido = false;
      faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
      const lm = document.getElementById('layout-musicas');
      if (lm) lm.removeAttribute('style');
      const sEntrada = normalizarRota(rotasPorModo.slides);
      if (sEntrada.publicoIndex < 0 && sEntrada.ministranteIndex < 0) {
        rotasPorModo.slides = rotaSlidesAoEntrarNoModo();
        salvarRotasPorModoNoStorage();
      } else if (!hayProjecaoAtivaNoServidor()) {
        rotasPorModo.slides = rotaSlidesAoEntrarNoModo();
        salvarRotasPorModoNoStorage();
      }
      slidesAplicarCfgArmazenada();
      atualizarVisibilidadeAbasCfgPorModo();
      syncRoteamentoTelasModoSlidesNaUi();
    } else {
      atualizarVisibilidadeAbasCfgPorModo();
      encerrarProjecaoAoSairDoModoSlides();
    }
    atualizarBtnToggleModoSlides();
    atualizarBtnModoApresentacao();
    modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
    agendarTrabalhoPesadoAposModoSlides(ativo);
  });
}

/** Botões de modo no HTML — registo cedo para sobreviver a falhas mais abaixo no ficheiro. */
exporCallbacksParaAtributosHtml({
  irParaTelaInicial,
  alternarModoSlidesOperador,
  alternarModoBiblia,
  onTraducaoBibliaChange,
  abrirMenuModoApresentacao,
});

let _debounceRecarregarPainelT = null;
function recarregarPainelControlador() {
  if (_debounceRecarregarPainelT) clearTimeout(_debounceRecarregarPainelT);
  _debounceRecarregarPainelT = setTimeout(() => {
    _debounceRecarregarPainelT = null;
    /* Recarregar não deve ressuscitar projeção anterior nas telas. */
    projecao.enviar('encerrar_projecao');
    try {
      const ov = document.getElementById('app-dialog-overlay');
      if (ov) {
        ov.classList.remove('aberto');
        ov.hidden = true;
      }
    } catch (_) {
  // intencional — erro ignorado
}
    try {
      if (typeof fecharAppDialog === 'function') fecharAppDialog(false);
    } catch (_) {
  // intencional — erro ignorado
}
    const enviarReload = () => {
      try {
        if (window.lyraElectron?.reloadController) {
          window.lyraElectron.reloadController();
        } else {
          window.location.reload();
        }
      } catch (e) {
        console.error('[controller] reloadController', e);
        try {
          window.location.reload();
        } catch (_) {
  // intencional — erro ignorado
}
      }
    };
    /* Dar tempo ao servidor de processar encerrar_projecao antes do reload (evita estado «preto» ao reconectar). */
    setTimeout(enviarReload, 280);
  }, 320);
}

function forcarRepinturaCompositorLyra() {
  requestAnimationFrame(() => {
    const el = document.documentElement;
    el.classList.add('lyra-gpu-repaint');
    requestAnimationFrame(() => el.classList.remove('lyra-gpu-repaint'));
  });
}
window.forcarRepinturaCompositorLyra = forcarRepinturaCompositorLyra;

let lyraRepinturaAposEstadoT = 0;
function agendarRepinturaCompositorAposEstadoServidor() {
  if (!projecao.pronta()) return;
  const now = Date.now();
  if (now - lyraRepinturaAposEstadoT < 650) return;
  lyraRepinturaAposEstadoT = now;
  forcarRepinturaCompositorLyra();
}

try {
  const api = window.lyraElectron;
  if (api) {
    const offOpenDisplayDevtools = api.onOpenDisplayDevtoolsRequest(() => {
      if (typeof api.abrirConsoleTelao === 'function') {
        api.abrirConsoleTelao().catch(() => {});
        return;
      }
      if (!projecao.enviar('open_display_devtools')) {
        alert('Conecte ao servidor primeiro para abrir o console do telão.');
      }
    });
    const offControllerRepaint = api.onControllerRepaintRequest(() =>
      forcarRepinturaCompositorLyra()
    );
    const offAtualizacaoDisponivel = api.onAtualizacaoDisponivel((payload) => {
      lyraUpdaterUiState.ultimoPayload = payload || null;
      mostrarBannerAtualizacaoDisponivel(payload);
    });
    const offDownloadAtualizacaoIniciado = api.onDownloadAtualizacaoIniciado(() => {
      lyraUpdaterUiState.downloadEmAndamento = true;
      lyraUpdaterUiState.percentualDownload = 0;
      mostrarBannerProgressoAtualizacao(lyraUpdaterUiState.ultimoPayload);
    });
    const offProgressoDownloadAtualizacao = api.onProgressoDownloadAtualizacao((payload) => {
      lyraUpdaterUiState.downloadEmAndamento = true;
      lyraUpdaterUiState.percentualDownload = Number(payload?.percent || 0);
      mostrarBannerProgressoAtualizacao(lyraUpdaterUiState.ultimoPayload);
    });
    const offAtualizacaoPronta = api.onAtualizacaoPronta((payload) => {
      lyraUpdaterUiState.ultimoPayload = payload || lyraUpdaterUiState.ultimoPayload;
      lyraUpdaterUiState.downloadEmAndamento = false;
      lyraUpdaterUiState.percentualDownload = 100;
      mostrarBannerAtualizacaoPronta(payload);
    });
    const offErroAtualizacao = api.onErroAtualizacao((payload) => {
      lyraUpdaterUiState.downloadEmAndamento = false;
      esconderBannerAtualizacao();
      void appAlert(
        String(payload?.message || 'Não foi possível concluir a atualização.'),
        'Atualização'
      );
    });
    const offMenuCommand = typeof api.onMenuCommand === 'function'
      ? api.onMenuCommand((payload) => {
          void tratarComandoMenuLyra(payload);
        })
      : null;
    const offStatusReinicioServidor = typeof api.onStatusReinicioServidor === 'function'
      ? api.onStatusReinicioServidor((payload) => {
          atualizarModalStatusReinicioServidor(payload?.stage, payload?.message || '');
        })
      : null;
    window.addEventListener(
      'beforeunload',
      () => {
        try {
          if (typeof offOpenDisplayDevtools === 'function') offOpenDisplayDevtools();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offControllerRepaint === 'function') offControllerRepaint();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offAtualizacaoDisponivel === 'function') offAtualizacaoDisponivel();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offDownloadAtualizacaoIniciado === 'function') offDownloadAtualizacaoIniciado();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offProgressoDownloadAtualizacao === 'function') offProgressoDownloadAtualizacao();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offAtualizacaoPronta === 'function') offAtualizacaoPronta();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offErroAtualizacao === 'function') offErroAtualizacao();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offMenuCommand === 'function') offMenuCommand();
        } catch (_) {
  // intencional — erro ignorado
}
        try {
          if (typeof offStatusReinicioServidor === 'function') offStatusReinicioServidor();
        } catch (_) {
  // intencional — erro ignorado
}
      },
      { once: true }
    );
  }
} catch (e) {
  console.error('[controller] lyraElectron IPC', e);
}

/**
 * Cultos do mês corrente: domingos (manhã + noite) e quartas, com data DD/MM.
 * A lista é recalculada ao carregar (mês novo = opções novas; playlists usam o id completo).
 */
// --- SECÇÃO C — Culto do dia, playlists, temas, cópias locais de letra, chaves localStorage ---
function gerarCultosDoMes(dataRef) {
  const d0 = dataRef instanceof Date ? dataRef : new Date();
  const y = d0.getFullYear();
  const m0 = d0.getMonth();
  const lastD = new Date(y, m0 + 1, 0).getDate();
  const mm = String(m0 + 1).padStart(2, '0');
  const out = [];
  const mk = (data, dia, turno) =>
    `${String(data).padEnd(5, ' ')} | ${String(dia).padEnd(12, ' ')} | ${String(turno).padEnd(5, ' ')}`;
  for (let d = 1; d <= lastD; d++) {
    const dt = new Date(y, m0, d);
    const dow = dt.getDay();
    const dd = String(d).padStart(2, '0');
    const suf = `${dd}/${mm}`;
    const iso = `${y}-${mm}-${dd}`;
    if (dow === 0) {
      out.push({ id: `culto_${iso}_manha`, label: mk(suf, 'DOMINGO', 'MANHÃ') });
      out.push({ id: `culto_${iso}_noite`, label: mk(suf, 'DOMINGO', 'NOITE') });
    }
    if (dow === 3) {
      out.push({ id: `culto_${iso}_quarta`, label: `${suf} | QUARTA-FEIRA` });
    }
  }
  return out;
}

const NOMES_DIA_SEMANA_PT = [
  'DOMINGO',
  'SEGUNDA-FEIRA',
  'TERÇA-FEIRA',
  'QUARTA-FEIRA',
  'QUINTA-FEIRA',
  'SEXTA-FEIRA',
  'SÁBADO',
];
const SUFIXO_ID_DIA_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function isoFromCultoId(id) {
  const m = String(id || '').match(/^culto_(\d{4}-\d{2}-\d{2})_/);
  return m ? m[1] : '';
}

/** True se o id `culto_YYYY-MM-DD_*` pertence ao mês/ano de `dataRef`. */
function cultoIdPertenceAoMes(id, dataRef = new Date()) {
  const iso = isoFromCultoId(id);
  if (!iso) return false;
  const d0 = dataRef instanceof Date ? dataRef : new Date();
  const [y, mo] = iso.split('-').map((n) => parseInt(n, 10));
  return y === d0.getFullYear() && mo === d0.getMonth() + 1;
}

function ordenarCultosPorData(lista) {
  return [...lista].sort((a, b) => {
    const ia = isoFromCultoId(a.id);
    const ib = isoFromCultoId(b.id);
    if (ia !== ib) return ia.localeCompare(ib);
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Gera entradas de culto manual para uma data (domingo = manhã + noite; demais dias = um culto). */
function gerarCultosParaDataManual(dt) {
  const d0 = dt instanceof Date ? dt : new Date(dt);
  if (Number.isNaN(d0.getTime())) return [];
  const y = d0.getFullYear();
  const m0 = d0.getMonth();
  const d = d0.getDate();
  const mm = String(m0 + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const suf = `${dd}/${mm}`;
  const iso = `${y}-${mm}-${dd}`;
  const dow = d0.getDay();
  const out = [];
  const mk = (data, dia, turno) =>
    `${String(data).padEnd(5, ' ')} | ${String(dia).padEnd(12, ' ')} | ${String(turno).padEnd(5, ' ')}`;
  if (dow === 0) {
    out.push({ id: `culto_${iso}_manha`, label: mk(suf, 'DOMINGO', 'MANHÃ') });
    out.push({ id: `culto_${iso}_noite`, label: mk(suf, 'DOMINGO', 'NOITE') });
  } else {
    const diaNome = NOMES_DIA_SEMANA_PT[dow];
    const sufId = SUFIXO_ID_DIA_SEMANA[dow];
    out.push({ id: `culto_${iso}_${sufId}`, label: `${suf} | ${diaNome}` });
  }
  return out;
}

function loadCultosManuais() {
  try {
    const raw = localStorage.getItem(LS_CULTOS_MANUAIS);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return ordenarCultosPorData(
      p
        .filter((c) => c && c.id && c.label)
        .map((c) => ({ id: String(c.id), label: String(c.label) }))
    );
  } catch (_) {
    return [];
  }
}

function saveCultosManuais() {
  try {
    localStorage.setItem(LS_CULTOS_MANUAIS, JSON.stringify(cultosManuaisCache || []));
  } catch (_) {
  // intencional — erro ignorado
}
  marcarBancoCompartilhadoAlterado();
}

function idsCultosJaNaLista() {
  const s = new Set();
  gerarCultosDoMes(new Date()).forEach((c) => s.add(c.id));
  (cultosManuaisCache || []).forEach((c) => s.add(c.id));
  return s;
}

/**
 * Cultos automáticos do mês + manuais desse mesmo mês/ano (sem duplicar id).
 * Cultos extras de outros meses permanecem persistidos, mas não entram na lista.
 */
function listarCultosDisponiveis(dataRef = new Date()) {
  const ref = dataRef instanceof Date ? dataRef : new Date();
  const auto = gerarCultosDoMes(ref);
  const idsAuto = new Set(auto.map((c) => c.id));
  const manual = (cultosManuaisCache || []).filter(
    (c) => !idsAuto.has(c.id) && cultoIdPertenceAoMes(c.id, ref)
  );
  return ordenarCultosPorData([...auto, ...manual]);
}

function cultoIdEhManual(cid) {
  return (cultosManuaisCache || []).some((c) => c.id === cid);
}

function limparSecoesTemaRecolhidasDoCulto(cid) {
  const m = carregarMapaSecoesTemaPlaylistRecolhidas();
  const pref = `${String(cid)}|||`;
  let mudou = false;
  Object.keys(m).forEach((k) => {
    if (k.startsWith(pref)) {
      delete m[k];
      mudou = true;
    }
  });
  if (mudou) {
    try {
      localStorage.setItem(LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS, JSON.stringify(m));
    } catch (_) {
  // intencional — erro ignorado
}
  }
}

function excluirCultoManualPorId(cid) {
  if (!cid || !cultoIdEhManual(cid)) return;
  cultosManuaisCache = (cultosManuaisCache || []).filter((c) => c.id !== cid);
  saveCultosManuais();
  delete playlists[cid];
  delete temasPorCulto[cid];
  delete temaSelecionadoPorCulto[cid];
  delete aberturaRemovidaPorCulto[cid];
  limparSecoesTemaRecolhidasDoCulto(cid);
  savePlaylists();
  saveTemasPorCulto();
  saveTemaSelecionadoPorCulto();
  saveAberturaRemovidaPorCulto();
  if (cultoId === cid) {
    cultoId = '';
    localStorage.setItem(LS_CULTO, '');
  }
  initCultoSelect();
  onCultoChange();
}

async function solicitarExcluirCultoManual(ev, cid) {
  ev.preventDefault();
  ev.stopPropagation();
  const item = (cultosManuaisCache || []).find((c) => c.id === cid);
  const ok = await appConfirm(
    `Excluir o culto «${item?.label || cid}» e toda a playlist (temas e músicas)?`,
    'Excluir culto'
  );
  if (!ok) return;
  excluirCultoManualPorId(cid);
}

function adicionarCultosManuaisNaData(dt) {
  const novos = gerarCultosParaDataManual(dt);
  const existentes = idsCultosJaNaLista();
  const aInserir = novos.filter((c) => !existentes.has(c.id));
  if (!aInserir.length) {
    appAlert('Já existe culto para esta data na lista.', 'Adicionar culto');
    return;
  }
  cultosManuaisCache = ordenarCultosPorData([...(cultosManuaisCache || []), ...aInserir]);
  saveCultosManuais();
  let playlistMudou = false;
  aInserir.forEach((c) => {
    garantirAberturaNoCatalogoCulto(c.id);
    if (garantirMarcadorAberturaNaPlaylist(c.id)) playlistMudou = true;
  });
  if (playlistMudou) savePlaylists();
  cultoId = aInserir[0].id;
  localStorage.setItem(LS_CULTO, cultoId);
  initCultoSelect();
  setCultoSelecionadoNaUi(cultoId);
  onCultoChange();
  fecharModalCalendarioCulto();
}

let cultoCalMesRef = new Date();
let cultoCalDiaSelecionado = null;

const CULTO_CAL_MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function renderGradeCalendarioCulto() {
  const tit = document.getElementById('culto-cal-mes-ano');
  const grid = document.getElementById('culto-cal-grid');
  const btnOk = document.getElementById('culto-cal-confirmar');
  if (!tit || !grid) return;
  const y = cultoCalMesRef.getFullYear();
  const m0 = cultoCalMesRef.getMonth();
  tit.textContent = `${CULTO_CAL_MESES_PT[m0]} ${y}`;
  grid.innerHTML = '';
  const first = new Date(y, m0, 1);
  const startPad = first.getDay();
  const lastD = new Date(y, m0 + 1, 0).getDate();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (let i = 0; i < startPad; i++) {
    const cell = document.createElement('span');
    cell.className = 'culto-cal-cell culto-cal-cell--vazio';
    grid.appendChild(cell);
  }
  for (let d = 1; d <= lastD; d++) {
    const dt = new Date(y, m0, d);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'culto-cal-cell';
    cell.textContent = String(d);
    const isoSel =
      cultoCalDiaSelecionado &&
      cultoCalDiaSelecionado.getFullYear() === y &&
      cultoCalDiaSelecionado.getMonth() === m0 &&
      cultoCalDiaSelecionado.getDate() === d;
    if (isoSel) cell.classList.add('culto-cal-cell--sel');
    if (dt.getTime() === hoje.getTime()) cell.classList.add('culto-cal-cell--hoje');
    cell.addEventListener('click', () => {
      cultoCalDiaSelecionado = new Date(y, m0, d);
      renderGradeCalendarioCulto();
    });
    grid.appendChild(cell);
  }
  if (btnOk) btnOk.disabled = !cultoCalDiaSelecionado;
}

function abrirModalCalendarioCulto() {
  const bd = document.getElementById('culto-calendario-backdrop');
  if (!bd) return;
  cultoCalMesRef = new Date();
  cultoCalMesRef.setDate(1);
  cultoCalDiaSelecionado = null;
  renderGradeCalendarioCulto();
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
}

function fecharModalCalendarioCulto() {
  const bd = document.getElementById('culto-calendario-backdrop');
  if (!bd) return;
  bd.hidden = true;
  bd.setAttribute('aria-hidden', 'true');
}

function setupAdicionarCultoManual() {
  document.getElementById('btn-adicionar-culto')?.addEventListener('click', () => abrirModalCalendarioCulto());
  document.getElementById('culto-cal-cancel')?.addEventListener('click', () => fecharModalCalendarioCulto());
  document.getElementById('culto-cal-confirmar')?.addEventListener('click', () => {
    if (!cultoCalDiaSelecionado) return;
    adicionarCultosManuaisNaData(cultoCalDiaSelecionado);
  });
  document.getElementById('culto-cal-prev')?.addEventListener('click', () => {
    cultoCalMesRef = new Date(cultoCalMesRef.getFullYear(), cultoCalMesRef.getMonth() - 1, 1);
    renderGradeCalendarioCulto();
  });
  document.getElementById('culto-cal-next')?.addEventListener('click', () => {
    cultoCalMesRef = new Date(cultoCalMesRef.getFullYear(), cultoCalMesRef.getMonth() + 1, 1);
    renderGradeCalendarioCulto();
  });
  const bd = document.getElementById('culto-calendario-backdrop');
  bd?.addEventListener('click', (e) => {
    if (e.target === bd) fecharModalCalendarioCulto();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bd && !bd.hidden) fecharModalCalendarioCulto();
  });
}

function parseLabelCulto(label) {
  const txt = String(label || '');
  const m = txt.match(/^(\d{2}\/\d{2})\s*\|\s*(.+)$/);
  if (!m) return { data: '--/--', desc: txt || 'Selecione o dia do culto...' };
  return { data: m[1], desc: m[2].trim() };
}

function fecharCultoDropdown() {
  const wrap = document.getElementById('culto-dd');
  const btn = document.getElementById('culto-dd-btn');
  const menu = document.getElementById('culto-dd-menu');
  if (!wrap || !btn || !menu) return;
  wrap.classList.remove('open');
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function setCultoSelecionadoNaUi(value) {
  const hid = document.getElementById('culto-sel');
  const dataEl = document.getElementById('culto-dd-data');
  const descEl = document.getElementById('culto-dd-desc');
  const menu = document.getElementById('culto-dd-menu');
  if (!hid || !dataEl || !descEl) return;
  const v = String(value || '');
  hid.value = v;
  const item = cultosDoMesCache.find((c) => c.id === v);
  if (!item) {
    dataEl.textContent = '--/--';
    descEl.textContent = 'Selecione o dia do culto...';
  } else {
    const p = parseLabelCulto(item.label);
    dataEl.textContent = p.data;
    descEl.textContent = p.desc;
  }
  if (menu) {
    menu.querySelectorAll('.culto-dd-item').forEach((b) => {
      b.setAttribute('aria-selected', b.dataset.value === v ? 'true' : 'false');
    });
  }
}

function setupCultoDropdown() {
  const wrap = document.getElementById('culto-dd');
  const btn = document.getElementById('culto-dd-btn');
  const menu = document.getElementById('culto-dd-menu');
  if (!wrap || !btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = menu.hidden;
    if (abrir) {
      wrap.classList.add('open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    } else {
      fecharCultoDropdown();
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) fecharCultoDropdown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharCultoDropdown();
  });
}

function fecharApAudioDropdown() {
  const wrap = document.getElementById('ap-audio-dd');
  const btn = document.getElementById('ap-audio-dd-btn');
  const menu = document.getElementById('ap-audio-dd-menu');
  if (!wrap || !btn || !menu) return;
  wrap.classList.remove('open');
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function fecharApFilesDropdown() {
  const wrap = document.getElementById('ap-files-dd');
  const btn = document.getElementById('ap-files-dd-btn');
  const menu = document.getElementById('ap-files-dd-menu');
  if (!wrap || !btn || !menu) return;
  wrap.classList.remove('open');
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function setupApAudioDropdown() {
  const wrap = document.getElementById('ap-audio-dd');
  const btn = document.getElementById('ap-audio-dd-btn');
  const menu = document.getElementById('ap-audio-dd-menu');
  if (!wrap || !btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = menu.hidden;
    if (abrir) {
      fecharApFilesDropdown();
      wrap.classList.add('open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    } else {
      fecharApAudioDropdown();
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) fecharApAudioDropdown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharApAudioDropdown();
  });
}

function setupApFilesDropdown() {
  const wrap = document.getElementById('ap-files-dd');
  const btn = document.getElementById('ap-files-dd-btn');
  const menu = document.getElementById('ap-files-dd-menu');
  if (!wrap || !btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = menu.hidden;
    if (abrir) {
      fecharApAudioDropdown();
      wrap.classList.add('open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    } else {
      fecharApFilesDropdown();
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) fecharApFilesDropdown();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharApFilesDropdown();
  });
}

/** Migra playlists dos ids fixos antigos para o 1.º culto equivalente do mês atual. */
function migrarPlaylistsCultosAntigos() {
  const cultos = gerarCultosDoMes(new Date());
  if (!cultos.length) return;
  const primeiro = (pred) => cultos.find(pred);
  const mapLegado = [
    ['quarta', () => primeiro((c) => c.id.endsWith('_quarta'))],
    ['domingo_manha', () => primeiro((c) => c.id.endsWith('_manha'))],
    ['domingo_noite', () => primeiro((c) => c.id.endsWith('_noite'))],
  ];
  let mudou = false;
  mapLegado.forEach(([oldKey, finder]) => {
    const arr = playlists[oldKey];
    if (!Array.isArray(arr) || arr.length === 0) return;
    const target = finder();
    if (!target) return;
    if (!Array.isArray(playlists[target.id])) playlists[target.id] = [];
    const mesclado = [...arr];
    mesclado.forEach((item) => {
      const dup = playlists[target.id].some((x) => Number(x.id) === Number(item.id));
      if (!dup) playlists[target.id].push(item);
    });
    delete playlists[oldKey];
    mudou = true;
  });
  if (mudou) savePlaylists();
}

function loadCopiasLocaisMapBruto() {
  try {
    const raw = localStorage.getItem(LS_COPIAS_LOCAIS);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
}

let musicasCopiasLocais = loadCopiasLocaisMapBruto();

function saveCopiasLocaisMap() {
  try {
    localStorage.setItem(LS_COPIAS_LOCAIS, JSON.stringify(musicasCopiasLocais));
  } catch (_) {
  // intencional — erro ignorado
}
}

function listaCopiasMusicaInterno(idMusica) {
  const k = String(idMusica);
  if (!Array.isArray(musicasCopiasLocais[k])) musicasCopiasLocais[k] = [];
  return musicasCopiasLocais[k];
}

function getCopiasParaMusica(idMusica) {
  return [...listaCopiasMusicaInterno(idMusica)].sort((a, b) =>
    String(a.rotulo || '').localeCompare(String(b.rotulo || ''), 'pt-BR', { sensitivity: 'base' })
  );
}

function encontrarCopiaLocal(idMusica, copiaId) {
  if (copiaId == null || copiaId === '') return null;
  return listaCopiasMusicaInterno(idMusica).find((c) => c.id === copiaId) || null;
}

function ehVersaoLocalLegada(versaoId) {
  return !!(versaoId && String(versaoId).trim().startsWith('c_'));
}

function ehVersaoServidorId(versaoId) {
  if (versaoId == null || versaoId === '') return false;
  if (ehVersaoLocalLegada(versaoId)) return false;
  return Number.isFinite(Number(versaoId));
}

function obterRootIdMusicaAtiva() {
  if (!musicaAtiva) return null;
  const r = Number(musicaRootId ?? musicaAtiva.root_id ?? musicaAtiva.id);
  return Number.isFinite(r) ? r : null;
}

function musicaAtivaEhOriginalServidor() {
  if (!musicaAtiva || musicaBancoFonte === 'catalog') return false;
  const root = obterRootIdMusicaAtiva();
  const id = Number(musicaAtiva.id);
  if (!Number.isFinite(root) || !Number.isFinite(id)) return false;
  if (musicaVersaoLocalId && ehVersaoLocalLegada(musicaVersaoLocalId)) return false;
  return id === root && (musicaAtiva.parent_id == null || musicaAtiva.parent_id === '');
}

/** Original protegido no SQLite (`is_immutable === 1`); cópias/versões filhas são editáveis. */
function versaoAtivaParaCompararPlaylist() {
  if (musicaVersaoLocalId && String(musicaVersaoLocalId).trim()) {
    return String(musicaVersaoLocalId).trim();
  }
  if (musicaAtivaEhOriginalServidor()) return '';
  if (musicaAtiva && musicaBancoFonte !== 'catalog') return String(musicaAtiva.id);
  return '';
}

async function carregarVersoesMusicaServidor(rootId) {
  const root = Number(rootId);
  if (!Number.isFinite(root)) {
    versoesMusicaServidorCache = { rootId: null, versoes: [] };
    renderMusicaVersoesBar();
    return;
  }
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${root}/versoes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    versoesMusicaServidorCache = {
      rootId: Number(data.rootId) || root,
      versoes: Array.isArray(data.versoes) ? data.versoes : [],
    };
  } catch (_) {
    versoesMusicaServidorCache = { rootId: root, versoes: [] };
  }
  renderMusicaVersoesBar();
}

function atualizarCopiaLocal(idMusica, copiaId, data) {
  const list = listaCopiasMusicaInterno(idMusica);
  const c = list.find((x) => x.id === copiaId);
  if (!c) return { ok: false, erro: 'Cópia não encontrada.' };
  if (data.titulo != null) c.titulo = String(data.titulo || '').trim();
  if (data.artista != null) c.artista = String(data.artista || '').trim();
  if (data.estrofes != null) {
    c.estrofes = Array.isArray(data.estrofes) ? data.estrofes.map((s) => String(s ?? '')) : [''];
  }
  if (data.rotulo != null) {
    const rotulo = String(data.rotulo || '').trim().slice(0, 40);
    if (!rotulo) return { ok: false, erro: 'Informe um nome para a versão.' };
    c.rotulo = rotulo;
  }
  saveCopiasLocaisMap();
  const idN = Number(idMusica);
  const vid = String(copiaId);
  if (
    musicaAtiva &&
    Number(musicaAtiva.id) === idN &&
    musicaVersaoLocalId &&
    String(musicaVersaoLocalId) === vid
  ) {
    if (data.titulo != null) musicaAtiva.titulo = c.titulo;
    if (data.artista != null) musicaAtiva.artista = c.artista;
    if (data.estrofes != null) musicaAtiva.estrofes = c.estrofes.map((s) => String(s));
    if (data.rotulo != null) musicaAtiva.rotulo = c.rotulo;
    const et = document.getElementById('edit-titulo');
    const ea = document.getElementById('edit-artista');
    if (et && data.titulo != null) et.value = musicaAtiva.titulo || '';
    if (ea && data.artista != null) ea.value = musicaAtiva.artista || '';
  }
  return { ok: true };
}

function removerCopiaLocal(idMusica, copiaId) {
  const list = listaCopiasMusicaInterno(idMusica);
  const idx = list.findIndex((c) => c.id === copiaId);
  if (idx === -1) return false;
  list.splice(idx, 1);
  musicasCopiasLocais[String(idMusica)] = list;
  saveCopiasLocaisMap();
  return true;
}

function removerCopiasLocaisDaMusica(idMusica) {
  delete musicasCopiasLocais[String(idMusica)];
  saveCopiasLocaisMap();
}
let filtrarLocalTimer = null;
let resultadosLetrasCache = [];
/** Fonte da busca de letras: `banco-local`, `cifraclub` ou `letras-mus-br` (seletor único). */
function normalizarFonteLetrasSite(val) {
  const s = String(val || '').trim();
  if (s === 'letras-mus-br') return 'letras-mus-br';
  if (s === 'cifraclub') return 'cifraclub';
  return 'banco-local';
}
let letrasSiteFonte = 'banco-local';
let listaLocalRenderizada = [];
/** Lista de músicas SQLite visível (padrão) ou recolhida. */
let bancoSqliteListaExpandida = true;
let cultosDoMesCache = [];
let cultosManuaisCache = [];

let slidesChipZoomLevel = 1;

function clampSlidesChipZoom(z) {
  return Math.min(1.42, Math.max(0.72, Math.round(z * 100) / 100));
}

function applySlidesChipZoomLevel(z) {
  slidesChipZoomLevel = clampSlidesChipZoom(z);
  const dock = document.getElementById('slides-dock');
  if (dock) dock.style.setProperty('--slide-chip-zoom', String(slidesChipZoomLevel));
  localStorage.setItem(LS_SLIDES_CHIP_ZOOM, String(slidesChipZoomLevel));
  const lab = document.getElementById('slides-zoom-val');
  if (lab) lab.textContent = `${Math.round(slidesChipZoomLevel * 100)}%`;
  queueMicrotask(() => ajustarEncaixeGrelhaSlidesModoSlides());
}

/** Zoom extra só no modo slides (Electron/Chromium): constante `SLIDES_GRID_AUTO_ZOOM_MIN` em `modules/chavesArmazenamentoLocal.js`. */
/** Tamanho base (px) do texto do chip, alinhado ao CSS `--slide-chip-snippet-px` × zoom. */
function slideChipSnippetBaseFontPx() {
  const dock = document.getElementById('slides-dock');
  let base = 14;
  if (dock) {
    const raw = getComputedStyle(dock).getPropertyValue('--slide-chip-snippet-px').trim();
    const n = parseFloat(raw, 10);
    if (Number.isFinite(n) && n > 0) base = n;
  }
  return base * slidesChipZoomLevel;
}

// --- SECÇÃO D — Faixa de slides (dock), zoom, chips, edição de estrofes, grelha modo slides ---
/** Digest rápido das estrofes — se mudar, a faixa de slides precisa ser reconstruída. */
function digestEstrofesParaStripFaixa(arr) {
  if (!arr || !arr.length) return '0';
  let h = 2166136261;
  for (let i = 0; i < arr.length; i++) {
    const s = String(arr[i] ?? '');
    h ^= s.length;
    for (let j = 0; j < s.length; j++) {
      h = Math.imul(h ^ s.charCodeAt(j), 16777619);
    }
  }
  return `${arr.length}:${h >>> 0}`;
}

function podeAtualizarSomenteAtivoFaixaSlides() {
  if (!ehModoSlidesOperador() || !faixaSlidesHabilitadaPorPlaylistNoModoSlides) return false;
  if (!musicaAtiva || !musicaAtiva.estrofes || !musicaAtiva.estrofes.length) return false;
  const grid = document.getElementById('slides-grid');
  if (!grid || !grid.dataset.stripMusicaId) return false;
  const n = musicaAtiva.estrofes.length;
  if (String(musicaAtiva.id ?? '') !== grid.dataset.stripMusicaId) return false;
  if (String(n) !== grid.dataset.stripEstrofeCount) return false;
  if (digestEstrofesParaStripFaixa(musicaAtiva.estrofes) !== grid.dataset.stripDigest) return false;
  const proj = projecaoMusicaEmitidaNoServidor ? '1' : '0';
  if ((grid.dataset.stripProjecao || '') !== proj) return false;
  const chips = grid.querySelectorAll('.slide-chip:not(.slide-chip--preto)');
  if (chips.length !== n) return false;
  if (!grid.querySelector('.slide-chip--preto')) return false;
  return true;
}

function atualizarSomenteAtivoFaixaSlides() {
  const grid = document.getElementById('slides-grid');
  if (!grid || !musicaAtiva || !musicaAtiva.estrofes) return;
  const n = musicaAtiva.estrofes.length;
  grid.querySelectorAll('.slide-chip:not(.slide-chip--preto)').forEach((chip, i) => {
    chip.classList.toggle('ativo', estrofeAtiva === i);
  });
  const preto = grid.querySelector('.slide-chip--preto');
  if (preto) preto.classList.toggle('ativo', estrofeAtiva === n);
}

/**
 * Cada linha lógica do slide fica em `nowrap`; reduz font-size para caber na largura e na altura
 * útil do cartão (evita cortar a última linha e linhas «coladas»).
 *
 * Largura útil = `clientWidth` (sem borda) − padding − margem de segurança: o cálculo
 * antigo usava `getBoundingClientRect` (com borda) e quase zero folga, o que em
 * algumas resoluções cortava a última letra com `overflow-x: hidden`.
 */
function ajustarFonteSnippetsNosSlideChips() {
  if (!ehModoSlidesOperador()) return;
  const grid = document.getElementById('slides-grid');
  if (!grid) return;
  const chips = grid.querySelectorAll('.slide-chip:not(.slide-chip--preto)');
  if (!chips.length) return;

  const basePx = slideChipSnippetBaseFontPx();
  const minPx = 5.5;
  const z = slidesChipZoomLevel;
  const gapNumSnippet = 10 * z;
  /** Folga horizontal (px) + factor — letter-spacing e subpixels não cortam o glifo. */
  const SAFE_X = Math.max(4, 3 * z);
  const SAFE_FACTOR = 0.97;
  const meas = document.createElement('span');
  meas.setAttribute('aria-hidden', 'true');
  meas.style.cssText =
    'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;';
  document.body.appendChild(meas);

  chips.forEach((chip) => {
    const snippet = chip.querySelector('.slide-snippet');
    if (!snippet) return;
    const lines = snippet.querySelectorAll('.slide-snippet-line');
    if (!lines.length) return;

    const cs = getComputedStyle(snippet);
    const cChip = getComputedStyle(chip);
    const padX = parseFloat(cChip.paddingLeft) + parseFloat(cChip.paddingRight);
    const padY = parseFloat(cChip.paddingTop) + parseFloat(cChip.paddingBottom);
    const snPadX =
      parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) || 0;
    const availW = Math.max(8, chip.clientWidth - padX - snPadX - SAFE_X);

    const numEl = chip.querySelector('.slide-num');
    const numH = numEl ? numEl.getBoundingClientRect().height : 0;
    const innerH = Math.max(0, chip.clientHeight - padY);
    const availH = Math.max(40, innerH - numH - gapNumSnippet);

    let maxW = 0;
    lines.forEach((el) => {
      if (el.classList.contains('slide-snippet-line--empty')) return;
      const t = (el.textContent || '').trim();
      if (!t) return;
      meas.textContent = t;
      meas.style.fontFamily = cs.fontFamily;
      meas.style.fontWeight = cs.fontWeight;
      meas.style.fontSize = `${basePx}px`;
      meas.style.letterSpacing = cs.letterSpacing;
      meas.style.textTransform = 'uppercase';
      maxW = Math.max(maxW, meas.getBoundingClientRect().width);
    });

    let fx = maxW < 1 ? basePx : Math.max(minPx, basePx * Math.min(1, (availW / maxW) * SAFE_FACTOR));
    snippet.style.fontSize = `${fx}px`;

    for (let iter = 0; iter < 8; iter++) {
      const sh = snippet.scrollHeight;
      if (sh <= availH + 1) break;
      const next = Math.max(minPx, fx * (availH / sh) * 0.97);
      if (next >= fx - 0.02) break;
      fx = next;
      snippet.style.fontSize = `${fx}px`;
    }

    let maxW2 = 0;
    lines.forEach((el) => {
      if (el.classList.contains('slide-snippet-line--empty')) return;
      const t = (el.textContent || '').trim();
      if (!t) return;
      meas.textContent = t;
      meas.style.fontSize = `${fx}px`;
      maxW2 = Math.max(maxW2, meas.getBoundingClientRect().width);
    });
    if (maxW2 > availW) {
      fx = Math.max(minPx, fx * (availW / maxW2) * SAFE_FACTOR);
      snippet.style.fontSize = `${fx}px`;
      for (let iter = 0; iter < 6; iter++) {
        const sh = snippet.scrollHeight;
        if (sh <= availH + 1) break;
        const next = Math.max(minPx, fx * (availH / sh) * 0.97);
        if (next >= fx - 0.02) break;
        fx = next;
        snippet.style.fontSize = `${fx}px`;
      }
    }
  });

  document.body.removeChild(meas);
}

function ajustarEncaixeGrelhaSlidesModoSlides() {
  const grid = document.getElementById('slides-grid');
  const viewport = document.getElementById('slides-grid-viewport');
  if (grid) grid.style.zoom = '';
  /* Revela a grade (escondida durante a reconstrução para evitar a «tremida»
     de pintar com fonte base e só depois encolher). Sempre reexibe, mesmo nos
     early-returns, para não deixar a grade presa em visibility:hidden. */
  const revelarGrade = () => {
    if (grid && grid.style.visibility === 'hidden') grid.style.visibility = '';
  };
  if (!ehModoSlidesOperador() || !viewport || !grid) {
    revelarGrade();
    return;
  }
  const dock = document.getElementById('slides-dock');
  if (!dock || dock.classList.contains('oculto')) {
    revelarGrade();
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // No modo slides, manter escala 1 e permitir scroll vertical para listas longas.
      grid.style.zoom = '';
      ajustarFonteSnippetsNosSlideChips();
      revelarGrade();
    });
  });
}

function setupSlidesGridViewportFitObserver() {
  const vp = document.getElementById('slides-grid-viewport');
  if (!vp || typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver(() => ajustarEncaixeGrelhaSlidesModoSlides());
  ro.observe(vp);
}

function initSlidesChipZoomFromStorage() {
  const raw = parseFloat(localStorage.getItem(LS_SLIDES_CHIP_ZOOM), 10);
  applySlidesChipZoomLevel(Number.isFinite(raw) ? raw : 1);
}

function setupSlidesChipZoomButtons() {
  const menos = document.getElementById('slides-zoom-menos');
  const mais = document.getElementById('slides-zoom-mais');
  if (!menos || !mais) return;
  menos.addEventListener('click', () => applySlidesChipZoomLevel(slidesChipZoomLevel - 0.07));
  mais.addEventListener('click', () => applySlidesChipZoomLevel(slidesChipZoomLevel + 0.07));
}

function readLsMigrate(key, legacyKey) {
  let v = localStorage.getItem(key);
  if (v === null && legacyKey) {
    const old = localStorage.getItem(legacyKey);
    if (old !== null) {
      localStorage.setItem(key, old);
      localStorage.removeItem(legacyKey);
      v = old;
    }
  }
  return v;
}

/** IP efetivo: prefere o gravado na barra após «Conectar»; senão usa o campo manual. */
function getServidorIp() {
  const fromSpan = (document.getElementById('info-ip')?.textContent || '').trim();
  if (fromSpan && fromSpan !== '—') return fromSpan;
  const fromInput = (document.getElementById('ip-input')?.value || '').trim();
  return fromInput || null;
}

/** API HTTP do controlador (SQLite local) — sempre neste PC, porta 3001. */
function getControllerApiBase() {
  return 'http://127.0.0.1:3001';
}

/**
 * Endereço de quem hospeda a projeção na porta 5510.
 *
 * É o análogo HTTP do que a porta de projeção fez para os comandos: os call sites
 * perguntam «onde está a projeção», não «qual é o IP do Servidor». No modo local a
 * resposta é sempre esta máquina, mesmo que o campo de IP tenha sobrado de uma ligação
 * anterior — apontar para lá pediria os monitores ao PC errado.
 *
 * @returns {string|null} `null` quando não há projeção alcançável (modo remoto sem IP).
 */
function hostProjecao() {
  if (emModoProjecaoLocal()) return '127.0.0.1';
  return getServidorIp();
}

/** Como `hostProjecao`, mas assume o próprio PC quando nada está configurado. */
function getServidorProjeccaoIp() {
  return hostProjecao() || '127.0.0.1';
}

/**
 * Comandos de áudio do modo apresentação → servidor de projeção (5510).
 * Preferência: Socket.IO; fallback HTTP (como `exibir_apresentacao`).
 */
async function enviarComandoAudioProjeccao(evento, payload = {}) {
  if (projecao.enviar(evento, payload)) return true;
  const rotas = {
    audio_play: '/api/comando/audio_play',
    audio_pause: '/api/comando/audio_pause',
    audio_stop: '/api/comando/audio_stop',
    audio_volume: '/api/comando/audio_volume',
    audio_seek: '/api/comando/audio_seek',
  };
  const path = rotas[evento];
  if (!path) return false;
  const ip = getServidorProjeccaoIp();
  try {
    const r = await fetch(`http://${ip}:5510${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      throw new Error(data.erro || `HTTP ${r.status}`);
    }
    return true;
  } catch (e) {
    console.warn('[Lyra] comando áudio falhou:', evento, e);
    return false;
  }
}

/**
 * Rótulo do monitor no seletor.
 *
 * Prefere o nome que o sistema dá ao painel («LG TV», «EPSON PJ») em vez de `Monitor 2`:
 * o operador reconhece o equipamento, não a numeração do Windows — que aliás muda.
 * Quando o driver não expõe nome, cai para a numeração, que é melhor que nada.
 */
function montarLabelMonitor(m) {
  const base = m && m.label ? String(m.label) : `Monitor ${Number(m?.index || 0) + 1}`;
  return m && m.primary ? `${base} (principal — sem projeção)` : base;
}

/** Tooltip com a posição e a resolução — desempata dois painéis com o mesmo nome. */
function montarTitleMonitor(m) {
  if (!m) return '';
  const partes = [];
  if (m.nome && m.rotuloPosicional) partes.push(m.rotuloPosicional);
  const w = Number(m?.size?.width || m?.bounds?.width || 0);
  const h = Number(m?.size?.height || m?.bounds?.height || 0);
  if (w && h) partes.push(`${w}×${h}`);
  return partes.join(' · ');
}

/**
 * Aviso persistente no cabeçalho quando um monitor guardado deixou de existir.
 *
 * Não usa `alert()`: isto pode disparar durante um culto, e um modal a bloquear o painel
 * é pior que o problema que anuncia. O canal afetado já ficou em «Desativado» — o aviso
 * só explica porquê e o operador refaz a escolha quando puder.
 *
 * @param {string[]} nomes
 */
function avisarMonitoresConfiguradosEmFalta(nomes) {
  const el = document.getElementById('hdr-monitores-aviso');
  if (!el) return;
  const unicos = [...new Set((Array.isArray(nomes) ? nomes : []).filter(Boolean))];
  if (!unicos.length) {
    el.classList.add('oculto');
    el.textContent = '';
    el.removeAttribute('title');
    return;
  }
  el.classList.remove('oculto');
  el.textContent = '⚠ Monitor não encontrado';
  el.title = `Estes monitores estavam configurados e não foram encontrados: ${unicos.join(', ')}.\nEscolha novamente onde projetar.`;
}

function fecharMenusRoteamentoTelas() {
  document.querySelectorAll('.route-dd').forEach((wrap) => {
    wrap.classList.remove('route-dd-open');
    const menu = wrap.querySelector('.route-dd-menu');
    const btn = wrap.querySelector('.route-dd-btn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

/**
 * Duplo clique projeta — não seleciona a palavra debaixo do cursor.
 *
 * O duplo clique é o gesto de projetar em quase todo o painel: versículo na Bíblia, chip
 * na faixa, cartão de estrofe, linha da playlist e do banco, cartão de mídia. Mas o
 * navegador também trata duplo clique como «selecionar palavra», e as duas coisas
 * aconteciam ao mesmo tempo: o operador projetava e ficava com um pedaço de texto
 * realçado a azul por cima do conteúdo, à vista durante o culto.
 *
 * A correção vai no `mousedown` e não no `dblclick`: quando o segundo clique chega, a
 * seleção já foi feita: limpá-la depois é um pisca visível. `preventDefault()` no clique
 * que a iniciaria impede-a de existir — e não cancela o evento `dblclick`, que continua a
 * disparar normalmente.
 *
 * Um listener só, em vez de remendar cada `dblclick`: os sítios com este gesto são muitos
 * e crescem, e um esquecido é um bug que só aparece em palco.
 *
 * Campos de texto ficam de fora: lá o duplo clique é mesmo para selecionar. Arrastar para
 * selecionar continua a funcionar em todo o lado — só o duplo clique deixa de o fazer.
 */
function impedirSelecaoDeTextoNoDuploClique() {
  const CAMPOS_DE_TEXTO = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  document.addEventListener(
    'mousedown',
    (ev) => {
      /* `detail` conta os cliques da sequência: 1 é clique simples e não selecciona nada. */
      if (ev.detail < 2 || ev.button !== 0) return;
      if (ev.target?.closest?.(CAMPOS_DE_TEXTO)) return;
      ev.preventDefault();
    },
    true
  );
}

function setupMenusRoteamentoTelas() {
  document.querySelectorAll('.route-dd').forEach((wrap) => {
    const btn = wrap.querySelector('.route-dd-btn');
    const menu = wrap.querySelector('.route-dd-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const abrir = !wrap.classList.contains('route-dd-open');
      document.querySelectorAll('.route-dd').forEach((w) => {
        if (w !== wrap) {
          w.classList.remove('route-dd-open');
          const m = w.querySelector('.route-dd-menu');
          const b = w.querySelector('.route-dd-btn');
          if (m) m.hidden = true;
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
      if (abrir) {
        wrap.classList.add('route-dd-open');
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      } else {
        wrap.classList.remove('route-dd-open');
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.addEventListener('click', fecharMenusRoteamentoTelas);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenusRoteamentoTelas();
  });
}

/** -1 = desativado; rejeita valores não numéricos (ex.: string vinda do JSON sem reparse). */
function indiceRoteamentoMonitorNaUi(val) {
  if (val === '' || val === null || val === undefined) return -1;
  const n = typeof val === 'number' && Number.isFinite(val) ? val : parseInt(String(val).trim(), 10);
  if (!Number.isFinite(n) || n < -1) return -1;
  return n;
}

/** Texto do botão quando a rota do modo apresentação não coincide com um dos quatro presets. */
function rotuloRotaApresentacaoForaDoPreset(r, lista) {
  if (r && r.live) return 'Live — OBS';
  const pub = indiceRoteamentoMonitorNaUi(r?.publicoIndex);
  const min = indiceRoteamentoMonitorNaUi(r?.ministranteIndex);
  if (pub < 0 && min < 0) return 'Desativado';
  if (pub >= 0 && min < 0) return `Público — Monitor ${pub + 1}`;
  if (pub < 0 && min >= 0) return `Ministrante — Monitor ${min + 1}`;
  return 'Ambos';
}

function renderRoteamentoTelas(monitores, routing) {
  fecharMenusRoteamentoTelas();
  const hidPub = document.getElementById('route-publico');
  const hidMin = document.getElementById('route-ministrante');
  const menuPub = document.getElementById('route-publico-menu');
  const menuMin = document.getElementById('route-ministrante-menu');
  const dispPub = document.getElementById('route-publico-display');
  const dispMin = document.getElementById('route-ministrante-display');
  const lblPub = document.getElementById('route-publico-label');
  if (!hidPub || !hidMin || !menuPub || !menuMin || !dispPub || !dispMin) return;

  const modoR = modoRoteamentoAtual();
  if (lblPub) lblPub.textContent = modoUsaSeletorMonitorUnificado() ? 'Monitor' : 'Público';

  const items = [{ value: '-1', label: 'Desativado' }];
  const lista = Array.isArray(monitores) ? monitores : [];
  lista.forEach((m) => {
    if (m && m.primary) return;
    items.push({ value: String(m.index), label: montarLabelMonitor(m), title: montarTitleMonitor(m) });
  });

  function preencherMenu(menuEl, hidEl, dispEl, valorSelecionado) {
    menuEl.innerHTML = '';
    const vSel = String(valorSelecionado);
    items.forEach(({ value, label, title }) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'route-dd-item';
      b.dataset.value = value;
      b.textContent = label;
      if (title) b.title = title;
      b.setAttribute('aria-selected', String(value) === vSel ? 'true' : 'false');
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        hidEl.value = value;
        dispEl.textContent = label;
        menuEl.querySelectorAll('.route-dd-item').forEach((ib) => {
          ib.setAttribute('aria-selected', ib.dataset.value === String(value) ? 'true' : 'false');
        });
        fecharMenusRoteamentoTelas();
        atualizarEstiloRotasDesativadas();
        salvarRoteamentoTelasNoServidor();
      });
      li.appendChild(b);
      menuEl.appendChild(li);
    });
  }

  if (modoUsaSeletorMonitorUnificado()) {
    menuMin.innerHTML = '';
    if (!lista.length) {
      hidPub.value = '-1';
      hidMin.value = '-1';
      dispPub.textContent = 'Desativado';
      dispMin.textContent = 'Desativado';
      const op0 = opcoesRoteamentoUnificadoModoApresentacao(lista);
      menuPub.innerHTML = '';
      op0.forEach((o) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'presentation');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'route-dd-item';
        b.dataset.apOp = o.key;
        b.textContent = o.label;
        b.setAttribute('aria-selected', o.key === 'des' ? 'true' : 'false');
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          hidPub.value = String(o.pub);
          hidMin.value = String(o.min);
          marcarRotaLiveNoDom(!!o.live);
          dispPub.textContent = o.label;
          menuPub.querySelectorAll('.route-dd-item').forEach((ib) => {
            ib.setAttribute('aria-selected', ib.dataset.apOp === o.key ? 'true' : 'false');
          });
          fecharMenusRoteamentoTelas();
          atualizarEstiloRotasDesativadas();
          salvarRoteamentoTelasNoServidor();
          atualizarIndicadorProjecaoLiveUi();
        });
        li.appendChild(b);
        menuPub.appendChild(li);
      });
      marcarRotaLiveNoDom(false);
      atualizarEstiloRotasDesativadas();
      aplicarPreviewPainelOcultoNoDom();
      atualizarIndicadorProjecaoLiveUi();
      return;
    }

    const rLive = !!(routing && routing.live);
    let pub = rLive ? -1 : indiceRoteamentoMonitorNaUi(routing?.publicoIndex);
    let min = rLive ? -1 : indiceRoteamentoMonitorNaUi(routing?.ministranteIndex);
    pub = sanitizarIndiceMonitorProjecao(pub, lista);
    min = sanitizarIndiceMonitorProjecao(min, lista);
    marcarRotaLiveNoDom(rLive);

    const opcoes = opcoesRoteamentoUnificadoModoApresentacao(lista);
    const combina = (o) => !!o.live === rLive && (o.live || (o.pub === pub && o.min === min));
    const preset = opcoes.find(combina);
    const rotuloBtn = preset
      ? preset.label
      : rotuloRotaApresentacaoForaDoPreset(
          { publicoIndex: pub, ministranteIndex: min, live: rLive },
          lista
        );
    hidPub.value = String(pub);
    hidMin.value = String(min);
    dispPub.textContent = rotuloBtn;
    const rotMin = items.find((x) => x.value === String(min));
    dispMin.textContent = rotMin ? rotMin.label : 'Desativado';

    menuPub.innerHTML = '';
    opcoes.forEach((o) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'route-dd-item';
      b.dataset.apOp = o.key;
      b.textContent = o.label;
      b.setAttribute('aria-selected', combina(o) ? 'true' : 'false');
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        hidPub.value = String(o.pub);
        hidMin.value = String(o.min);
        marcarRotaLiveNoDom(!!o.live);
        dispPub.textContent = o.label;
        menuPub.querySelectorAll('.route-dd-item').forEach((ib) => {
          ib.setAttribute('aria-selected', ib.dataset.apOp === o.key ? 'true' : 'false');
        });
        fecharMenusRoteamentoTelas();
        atualizarEstiloRotasDesativadas();
        /* O reenvio tem de esperar pelo PUT: as janelas do canal novo só existem depois de
           o servidor sincronizar a rota, e conteúdo enviado antes disso cai no vazio. */
        salvarRoteamentoTelasNoServidor()
          .then(() => reemitirConteudoAposMudancaDeRotaUnificada())
          .catch(() => {
            // intencional — falha de rede já é reportada por quem faz o PUT
          });
        atualizarIndicadorProjecaoLiveUi();
      });
      li.appendChild(b);
      menuPub.appendChild(li);
    });
    atualizarEstiloRotasDesativadas();
    aplicarPreviewPainelOcultoNoDom();
    atualizarIndicadorProjecaoLiveUi();
    return;
  }

  if (!lista.length) {
    hidPub.value = '-1';
    hidMin.value = '-1';
    dispPub.textContent = 'Desativado';
    dispMin.textContent = 'Desativado';
    preencherMenu(menuPub, hidPub, dispPub, '-1');
    preencherMenu(menuMin, hidMin, dispMin, '-1');
    atualizarEstiloRotasDesativadas();
    aplicarPreviewPainelOcultoNoDom();
    return;
  }

  let pub = indiceRoteamentoMonitorNaUi(routing?.publicoIndex);
  let min = indiceRoteamentoMonitorNaUi(routing?.ministranteIndex);
  pub = sanitizarIndiceMonitorProjecao(pub, lista);
  min = sanitizarIndiceMonitorProjecao(min, lista);

  const pubStr = String(pub);
  const minStr = String(min);
  const rotPub = items.find((x) => x.value === pubStr);
  const rotMin = items.find((x) => x.value === minStr);
  hidPub.value = pubStr;
  hidMin.value = minStr;
  dispPub.textContent = rotPub ? rotPub.label : 'Desativado';
  dispMin.textContent = rotMin ? rotMin.label : 'Desativado';

  preencherMenu(menuPub, hidPub, dispPub, pubStr);
  preencherMenu(menuMin, hidMin, dispMin, minStr);
  atualizarEstiloRotasDesativadas();
  aplicarPreviewPainelOcultoNoDom();
}

/** Destaque vermelho quando a rota está em «Desativado» (sem telão/TV externos — só pré-visualizações). */
function atualizarEstiloRotasDesativadas() {
  const wrapPub = document.getElementById('route-publico-dd');
  const wrapMin = document.getElementById('route-ministrante-dd');
  const hidPub = document.getElementById('route-publico');
  const hidMin = document.getElementById('route-ministrante');
  const btnPub = document.getElementById('route-publico-btn');
  const btnMin = document.getElementById('route-ministrante-btn');
  const modoUnificado = modoUsaSeletorMonitorUnificado();
  const bloqPubAp = ehModoSlidesOperador() && apresentacaoProjecaoAtivaNoCanalPublico();
  const bloqMinAp = ehModoSlidesOperador() && apresentacaoProjecaoAtivaNoCanalMinistrante();
  if (wrapPub && hidPub && hidMin) {
    const des = modoUnificado
      ? hidPub.value === '-1' && hidMin.value === '-1' && !rotaLiveSelecionadaNaUi()
      : hidPub.value === '-1';
    wrapPub.classList.toggle('route-dd--rota-desativada', des);
    wrapPub.classList.toggle('route-dd--rota-live', modoUnificado && rotaLiveSelecionadaNaUi());
    wrapPub.classList.toggle('route-dd--bloqueado-apresentacao', bloqPubAp);
    if (btnPub) {
      btnPub.disabled = bloqPubAp;
      btnPub.title = bloqPubAp
        ? 'Bloqueado: Apresentação activa neste monitor — encerre a projeção da Apresentação para alterar.'
        : des
          ? modoUnificado
            ? 'Desativado: nenhum monitor externo para projeção neste modo.'
            : 'Desativado: sem envio a monitor externo — só pré-visualização neste painel.'
          : modoUnificado
            ? 'Onde projetar (público, ministrante ou ambos).'
            : 'Escolher monitor do telão / público';
    }
  }
  if (wrapMin && hidMin) {
    /* Com um só monitor de projeção não há segunda saída para dar ao ministrante: o
       seletor fica desativado em vez de oferecer uma escolha que colidiria com o telão. */
    const semSegundaSaida = !modoUnificado && contarMonitoresDeProjecao() <= 1;
    if (semSegundaSaida && hidMin.value !== '-1') hidMin.value = '-1';
    const des = hidMin.value === '-1';
    wrapMin.classList.toggle('route-dd--rota-desativada', des && !semSegundaSaida);
    wrapMin.classList.toggle('route-dd--sem-monitor', semSegundaSaida);
    wrapMin.classList.toggle('route-dd--bloqueado-apresentacao', bloqMinAp);
    const dispMin = document.getElementById('route-ministrante-display');
    if (semSegundaSaida && dispMin) dispMin.textContent = 'Nenhum';
    if (btnMin) {
      btnMin.disabled = bloqMinAp || semSegundaSaida;
      btnMin.title = semSegundaSaida
        ? 'Só há um monitor de projeção disponível — ele está reservado ao telão. Ligue um segundo monitor para usar o retorno do ministrante.'
        : bloqMinAp
          ? 'Bloqueado: Apresentação activa neste monitor — encerre a projeção da Apresentação para alterar.'
          : des
            ? 'Desativado: sem envio a monitor externo — só pré-visualização neste painel.'
            : 'Escolher monitor do ministrante / retorno';
    }
  }
}

/** Quantos monitores restam para projeção depois de reservar o principal ao operador. */
function contarMonitoresDeProjecao() {
  return listaMonitoresParaProjecao(monitoresServidorCache).length;
}

function rotaSelecionadaNaUi() {
  const selPublico = document.getElementById('route-publico');
  const selMin = document.getElementById('route-ministrante');
  if (!selPublico || !selMin) return null;
  const live = rotaLiveSelecionadaNaUi();
  const publicoIndex = parseInt(selPublico.value, 10);
  const ministranteIndex = parseInt(selMin.value, 10);
  if (!Number.isFinite(publicoIndex) || !Number.isFinite(ministranteIndex)) return null;
  return { publicoIndex: live ? -1 : publicoIndex, ministranteIndex: live ? -1 : ministranteIndex, live };
}

async function aplicarRotaDoModoAtualNaUiEServidor(opts = {}) {
  const sincronizarServidor = opts.sincronizarServidor !== false;
  const modo = modoRoteamentoAtual();

  const rotaAjustada =
    modo === 'slides'
      ? obterRotaSlidesParaUi()
      : sanitizarRotaProjecao(normalizarRota(rotasPorModo[modo]), monitoresServidorCache);
  salvarRotasPorModoNoStorage();
  renderRoteamentoTelas(monitoresServidorCache, rotaAjustada);
  if (sincronizarServidor) {
    await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
  }
}

function clampSlidesRailHeight(px) {
  const min = 260;
  const max = Math.max(min + 80, Math.floor(window.innerHeight * 0.78));
  return Math.min(Math.max(px, min), max);
}

function initSlidesRailHeightFromStorage() {
  const saved = parseInt(localStorage.getItem(LS_SLIDES_RAIL_PX), 10);
  const fallback = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--slides-rail-height'),
    10
  ) || 520;
  const base = Number.isFinite(saved) ? saved : fallback;
  document.documentElement.style.setProperty('--slides-rail-height', clampSlidesRailHeight(base) + 'px');
}

/**
 * Modo slides: a divisória arrasta a faixa de prévias (TELÃO/TV). Arrastar para baixo
 * aumenta as prévias e encolhe a grelha de slides; para cima faz o inverso. A grelha
 * fica sempre com o resto do espaço (`1fr`), por isso nunca sobra área morta.
 */
const SLIDES_PREVIEW_H_MIN_FALLBACK = 172;

/** Piso vem do CSS (`--preview-mod-card-h-min`) para não haver dois valores a divergir. */
function alturaMinimaPreviewMod() {
  const px = parseInt(
    getComputedStyle(document.body).getPropertyValue('--preview-mod-card-h-min'),
    10
  );
  return Number.isFinite(px) ? px : SLIDES_PREVIEW_H_MIN_FALLBACK;
}

/**
 * As prévias nunca encolhem abaixo do piso: arrastar a divisória para cima só
 * devolve espaço à grelha até esse limite; para baixo aumenta as prévias.
 */
function clampAlturaPreviewMod(px) {
  const min = alturaMinimaPreviewMod();
  const max = Math.max(min + 60, Math.floor(window.innerHeight * 0.5));
  return Math.min(Math.max(Math.round(px), min), max);
}

function alturaPreviewModAtualPx() {
  const px = parseInt(getComputedStyle(document.body).getPropertyValue('--preview-mod-card-h'), 10);
  return Number.isFinite(px) ? px : 68;
}

/* Inline no <body> para vencer o valor-padrão da regra `body.app-mod-slides`. */
function aplicarAlturaPreviewMod(px) {
  document.body.style.setProperty('--preview-mod-card-h', clampAlturaPreviewMod(px) + 'px');
}

function initAlturaPreviewModFromStorage() {
  const saved = parseInt(localStorage.getItem(LS_SLIDES_PREVIEW_H_PX), 10);
  if (Number.isFinite(saved)) aplicarAlturaPreviewMod(saved);
}

function setupSlidesRailResize() {
  const handle = document.getElementById('slides-resize-handle');
  if (!handle) return;

  handle.addEventListener('mousedown', (e) => {
    const emModoSlides = ehModoSlidesOperador();
    if (!emModoSlides && !document.body.classList.contains('slides-rail-aberto')) return;
    slidesRailDrag.active = true;
    slidesRailDrag.alvo = emModoSlides ? 'previa' : 'faixa';
    slidesRailDrag.startY = e.clientY;
    slidesRailDrag.startH = emModoSlides
      ? alturaPreviewModAtualPx()
      : parseInt(
          getComputedStyle(document.documentElement).getPropertyValue('--slides-rail-height'),
          10
        ) || 520;
    e.preventDefault();
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });
}

let socket = null;
// Write-lock: papel deste controlador conforme o servidor (null = ainda desconhecido).
// { primario: boolean, podeEscrever: boolean, donoAtual: string|null }
let papelControladorLocal = null;
// Último display_config autoritativo recebido do servidor — base do "pull" quando somente-leitura.
let ultimaDisplayConfigServidor = null;
let apresentacaoBiblioteca = [];
let apresentacaoCards = Array(6).fill(null);
/** Índice do card 5 na grelha (0-based = 4); único slot que aceita vídeo. */
const APRESENTACAO_IDX_CARD5 = 4;

/** Texto editável do card 6 (avisos); não usa ficheiro. */
let apresentacaoCard6Texto = '';
/** Configuração global do card 6 — aplicada igualmente ao público e ministrante. */
let apresentacaoCard6AvisoCfg = clonarCfgAvisoCard6Padrao();
let apresentacaoAudios = [];
let apresentacaoArquivoSelecionadoId = null;
/** Id do item de vídeo/imagem/PDF/web projetado no telão público (não áudio) — destaque no card e roda-pé. */
let apresentacaoMidiaProjetadaId = null;
let apresentacaoAudioAtualId = null;
let audioStateRemoto = {
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  name: '',
  /** 'audio' | 'video' — qual elemento `<audio>` / `<video>` o player universal controla. */
  mediaKind: '',
};
let audioLoopAtivo = false;
let audioLoopReinicioPendente = false;
/** ─── Playlist de vídeos (modo Mídias) — camada sobre o motor de vídeo único ─── */
let apresentacaoVideoPlaylist = [];
/** Índice do item atualmente carregado/reproduzido na playlist (-1 = nenhum). */
let playlistVideoIndice = -1;
/** 'manual' (padrão) | 'auto' — comportamento ao terminar um vídeo. */
let playlistVideoModo = 'manual';
/** Segundos de intervalo antes de iniciar o próximo no modo automático (0,1,2,3,5). */
let playlistVideoAtrasoAuto = 0;
/** true quando a playlist é o contexto que controla o player de vídeo. */
let playlistVideoAtiva = false;
/** Timeout do avanço automático entre vídeos. */
let _playlistAutoTimer = null;
/** Guarda: reaproveita projetarItemApresentacao sem desativar a playlist. */
let _playlistProjetando = false;
/** Id do item sendo arrastado (reordenar por drag-and-drop). */
let playlistArrastandoId = null;
/** Cache do estado tocando/pausado para atualizar a UI só em transições. */
let _playlistUiTocandoCache = null;
let audioResumeVisualGuard = null;
let audioSeekDragging = false;
let apresentacaoCardInputTarget = null;
let rotasPorModo = {
  completo: { publicoIndex: -1, ministranteIndex: -1 },
  slides: { publicoIndex: -1, ministranteIndex: -1 },
  apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
  biblia: { publicoIndex: -1, ministranteIndex: -1 },
};
let musicaAtiva = null;
/** `user` — SQLite do servidor · `catalog` — `catalog.db` somente leitura (mesmo `id` pode existir nos dois). */
let musicaBancoFonte = 'user';
/** `null` = letra do servidor (original ou cópia com id próprio); id `c_*` = cópia legada em localStorage. */
let musicaVersaoLocalId = null;
/** Âncora da família de versões no SQLite (`root_id`). */
let musicaRootId = null;
/** Cache de `GET /api/musicas/:id/versoes` para a barra de versões. */
let versoesMusicaServidorCache = { rootId: null, versoes: [] };
let estrofeAtiva = -1;
let todasMusicas = [];
let estadoServidor = null;
/** Quando true, o cartão de pré-visualização fica recolhido só neste painel (não afeta monitores). */
let previewPainelOcultoLocal = [false, false];
/** Prévia de slide dentro do painel direito (playlist): corpo recolhido para ganhar altura na lista. */
let playlistPreviewSlideOcultoLocal = false;
let syncApresentacaoTimer = null;
let syncApresentacaoInFlight = false;
let syncApresentacaoPending = false;
let syncApresentacaoAvisoLiveTimer = null;

function limparGuardaVisualRetomadaAudio() {
  audioResumeVisualGuard = null;
}

function armarGuardaVisualRetomadaAudio(itemId, currentTime) {
  const t = Math.max(0, Number(currentTime) || 0);
  if (!itemId || t <= 0) {
    limparGuardaVisualRetomadaAudio();
    return;
  }
  audioResumeVisualGuard = {
    itemId: String(itemId),
    targetTime: t,
    expiresAt: performance.now() + 1800,
  };
}

function ajustarEstadoVisualRetomadaAudio(st, estadoAnterior) {
  const guard = audioResumeVisualGuard;
  if (!guard) return st;
  if (performance.now() > guard.expiresAt) {
    limparGuardaVisualRetomadaAudio();
    return st;
  }
  if (guard.itemId !== String(apresentacaoAudioAtualId || '')) {
    limparGuardaVisualRetomadaAudio();
    return st;
  }
  const mediaKind = String(st?.mediaKind || estadoAnterior?.mediaKind || '');
  if (mediaKind !== 'audio') {
    limparGuardaVisualRetomadaAudio();
    return st;
  }
  const incomingTime = Number(st?.currentTime);
  if (!Number.isFinite(incomingTime)) return st;
  if (incomingTime >= Math.max(0, guard.targetTime - 0.25)) {
    limparGuardaVisualRetomadaAudio();
    return st;
  }
  return {
    ...st,
    currentTime: Math.max(0, Number(estadoAnterior?.currentTime) || 0),
    duration: Math.max(Number(st?.duration) || 0, Number(estadoAnterior?.duration) || 0),
  };
}

function normalizarItemApresentacao(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const src = String(raw.src || '').trim();
  const name = String(raw.name || '').trim();
  const filePath = String(raw.filePath || '').trim();
  const thumb = String(raw.thumb || '').trim();
  let kind = String(raw.kind || '').trim();
  if (!id || !name) return null;
  if (!src && !filePath) return null;
  if (kind === 'video' && !src && filePath) {
    /* src HTTP será restaurado ao reentrar no modo. */
  } else if (!src) return null;
  /* Itens antigos: MIME vazio classificou como iframe mas o src é data:image — corrige para prévia e projeção. */
  if ((!kind || kind === 'iframe') && /^data:image\//i.test(src)) kind = 'image';
  if (!kind) return null;
  const out = {
    id,
    kind,
    src: src || urlVideoApresentacaoHttpPorId(id),
    mime: String(raw.mime || ''),
    name,
    title: String(raw.title || name),
  };
  if (filePath) out.filePath = filePath;
  if (/^data:image\//i.test(thumb)) out.thumb = thumb;
  return out;
}

async function encerrarModoApresentacaoNoTelao() {
  await emitirEncerrarApresentacaoPublicoAoServidor();
  try {
    localStorage.setItem(LS_MODO_APRESENTACAO_ATIVO, '0');
  } catch (_) {
  // intencional — erro ignorado
}
  if (audioStateRemoto.mediaKind === 'video') {
    pararAudioLocalApresentacao();
  }
  apresentacaoMidiaProjetadaId = null;
  renderGridApresentacao();
  atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'Apresentação encerrada no telão.' });
}

function coletarEstadoModoApresentacaoAtual() {
  return {
    biblioteca: (apresentacaoBiblioteca || []).map((it) => normalizarItemApresentacao(it)).filter(Boolean),
    cards: Array.from({ length: 6 }, (_, i) => {
      if (i === 5) return null;
      return normalizarItemApresentacao(apresentacaoCards?.[i] || null);
    }),
    audios: (apresentacaoAudios || []).map((it) => normalizarItemApresentacao(it)).filter((it) => it && it.kind === 'audio'),
    arquivoSelecionadoId: apresentacaoArquivoSelecionadoId || '',
    audioSelecionadoId: apresentacaoAudioAtualId || '',
    videoPlaylist: {
      modo: playlistVideoModo === 'auto' ? 'auto' : 'manual',
      atrasoAuto: PLAYLIST_ATRASOS_PERMITIDOS.includes(Number(playlistVideoAtrasoAuto))
        ? Number(playlistVideoAtrasoAuto)
        : 0,
      itens: (apresentacaoVideoPlaylist || [])
        .map((it) => {
          const base = normalizarItemApresentacao(it);
          if (!base || base.kind !== 'video') return null;
          if (Number(it && it.duracao) > 0) base.duracao = Number(it.duracao);
          return base;
        })
        .filter(Boolean),
    },
    extras: {
      audioLoop: !!audioLoopAtivo,
      card6AvisoTexto: apresentacaoCard6Texto,
      card6AvisoConfig: normalizarCfgAvisoCard6(apresentacaoCard6AvisoCfg),
    },
  };
}

function aplicarEstadoModoApresentacao(payload, opts = {}) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const biblioteca = Array.isArray(p.biblioteca) ? p.biblioteca.map(normalizarItemApresentacao).filter(Boolean) : [];
  const cardsRaw = Array.isArray(p.cards) ? p.cards : [];
  const cards = Array.from({ length: 6 }, (_, i) => {
    if (i === 5) return null;
    return normalizarItemApresentacao(cardsRaw[i] || null);
  });
  const audios = Array.isArray(p.audios)
    ? p.audios.map(normalizarItemApresentacao).filter((it) => it && it.kind === 'audio')
    : [];
  apresentacaoBiblioteca = biblioteca;
  apresentacaoCards = cards;
  apresentacaoAudios = audios;
  const vp = p.videoPlaylist && typeof p.videoPlaylist === 'object' ? p.videoPlaylist : {};
  playlistVideoModo = vp.modo === 'auto' ? 'auto' : 'manual';
  playlistVideoAtrasoAuto = PLAYLIST_ATRASOS_PERMITIDOS.includes(Math.round(Number(vp.atrasoAuto)))
    ? Math.round(Number(vp.atrasoAuto))
    : 0;
  apresentacaoVideoPlaylist = Array.isArray(vp.itens)
    ? vp.itens
        .map((raw) => {
          const base = normalizarItemApresentacao(raw);
          if (!base || base.kind !== 'video') return null;
          if (raw && Number(raw.duracao) > 0) base.duracao = Number(raw.duracao);
          return base;
        })
        .filter(Boolean)
    : [];
  cancelarAvancoAutoPlaylist();
  playlistVideoIndice = -1;
  playlistVideoAtiva = false;
  _playlistUiTocandoCache = null;
  const v5 = apresentacaoCards[APRESENTACAO_IDX_CARD5];
  if (v5?.kind === 'video') {
    void restaurarItemVideoApresentacao(v5).then((it) => {
      if (!it) return;
      apresentacaoCards[APRESENTACAO_IDX_CARD5] = it;
      salvarEstadoModoApresentacaoNoStorage();
      if (ehModoApresentacaoOperador()) renderGridApresentacao();
    });
  }
  const arqSel = String(p.arquivoSelecionadoId || '');
  const audSel = String(p.audioSelecionadoId || '');
  apresentacaoArquivoSelecionadoId = arqSel && biblioteca.some((it) => it.id === arqSel) ? arqSel : null;
  apresentacaoAudioAtualId = audSel && audios.some((it) => it.id === audSel) ? audSel : null;
  aplicarExtrasModoApresentacao(p.extras, {
    skipCard6Aviso: !!opts.skipCard6Extras,
    skipCard6AvisoConfig: !!opts.skipCard6Extras,
  });
  if (ehModoApresentacaoOperador()) {
    const modo = modoRoteamentoAtual();
    renderRoteamentoTelas(monitoresServidorCache, normalizarRota(rotasPorModo[modo]));
  }
}

function salvarEstadoModoApresentacaoNoStorage() {
  try {
    localStorage.setItem(LS_APRESENTACAO_STATE, JSON.stringify(coletarEstadoModoApresentacaoAtual()));
  } catch (_) {
  // intencional — erro ignorado
}
  salvarAvisoCard6CfgNoStorage();
  agendarSincronizacaoEstadoModoApresentacaoServidor();
}

/**
 * Debounce da gravação ao digitar avisos (Card 6). Persistir o estado inteiro do modo
 * Apresentação (biblioteca, cards, áudios, playlist — imagens podem ser base64) a cada tecla
 * trava a digitação. O texto já é atualizado em memória na hora; aqui só adiamos a gravação.
 */
let _salvarEstadoAposDigitarAvisoTimer = null;
function agendarSalvarEstadoAposDigitarAviso() {
  if (_salvarEstadoAposDigitarAvisoTimer) clearTimeout(_salvarEstadoAposDigitarAvisoTimer);
  _salvarEstadoAposDigitarAvisoTimer = setTimeout(() => {
    _salvarEstadoAposDigitarAvisoTimer = null;
    salvarEstadoModoApresentacaoNoStorage();
  }, 350);
}
function flushSalvarEstadoAposDigitarAviso() {
  if (!_salvarEstadoAposDigitarAvisoTimer) return;
  clearTimeout(_salvarEstadoAposDigitarAvisoTimer);
  _salvarEstadoAposDigitarAvisoTimer = null;
  salvarEstadoModoApresentacaoNoStorage();
}

function carregarEstadoModoApresentacaoDoStorage() {
  try {
    const raw = localStorage.getItem(LS_APRESENTACAO_STATE);
    if (!raw) return;
    const p = JSON.parse(raw);
    aplicarEstadoModoApresentacao(p);
  } catch (_) {
  // intencional — erro ignorado
}
}

async function sincronizarEstadoModoApresentacaoServidor() {
  if (syncApresentacaoInFlight) {
    syncApresentacaoPending = true;
    return;
  }
  /* O destino do `fetch` abaixo é o banco desta máquina (:3001), não o Servidor — o nome
     da função é herança de quando o Controlador retransmitia. O guard existe para não
     gravar quando não há projeção alcançável, e no modo local há: é aqui mesmo. */
  const host = hostProjecao();
  if (!host) return;
  syncApresentacaoInFlight = true;
  try {
    await fetch(`${getControllerApiBase()}/api/apresentacao/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coletarEstadoModoApresentacaoAtual()),
    });
  } catch (_) {
    // Sem rede/servidor: mantém só cache local
  } finally {
    syncApresentacaoInFlight = false;
    if (syncApresentacaoPending) {
      syncApresentacaoPending = false;
      sincronizarEstadoModoApresentacaoServidor();
    }
  }
}

function agendarSincronizacaoEstadoModoApresentacaoServidor() {
  if (syncApresentacaoTimer) clearTimeout(syncApresentacaoTimer);
  syncApresentacaoTimer = setTimeout(() => {
    syncApresentacaoTimer = null;
    sincronizarEstadoModoApresentacaoServidor();
  }, 480);
}

async function carregarEstadoModoApresentacaoDoServidor() {
  /* Como em `sincronizarEstadoModoApresentacaoServidor`: lê do banco desta máquina. */
  const host = hostProjecao();
  if (!host) return;
  const localAntes = coletarEstadoModoApresentacaoAtual();
  const localTemConteudo =
    (localAntes.biblioteca && localAntes.biblioteca.length > 0) ||
    (localAntes.cards && localAntes.cards.some((x) => !!x)) ||
    (localAntes.audios && localAntes.audios.length > 0) ||
    String(localAntes.extras?.card6AvisoTexto || '').trim().length > 0 ||
    cfgAvisoCard6TemPersonalizacao(localAntes.extras?.card6AvisoConfig);
  try {
    const res = await fetch(`${getControllerApiBase()}/api/apresentacao/state`);
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return;
    const remotoTemConteudo =
      (Array.isArray(data.biblioteca) && data.biblioteca.length > 0) ||
      (Array.isArray(data.cards) && data.cards.some((x) => !!x)) ||
      (Array.isArray(data.audios) && data.audios.length > 0) ||
      String(data.extras?.card6AvisoTexto || '').trim().length > 0 ||
      cfgAvisoCard6TemPersonalizacao(data.extras?.card6AvisoConfig);
    if (!remotoTemConteudo && localTemConteudo) {
      await sincronizarEstadoModoApresentacaoServidor();
      return;
    }
    const editingCard6 = algumCampoAvisoCard6EmEdicao();
    aplicarEstadoModoApresentacao(data, { skipCard6Extras: editingCard6 });
    try { localStorage.setItem(LS_APRESENTACAO_STATE, JSON.stringify(coletarEstadoModoApresentacaoAtual())); } catch (_) {
  // intencional — erro ignorado
}
    if (!editingCard6) {
      popularFormCfgAvisoCard6();
      renderGridApresentacao();
      renderMenuApresentacao();
      renderListaAudiosApresentacao();
      renderListaPlaylistApresentacao();
    }
  } catch (_) {
  // intencional — erro ignorado
}
}
let cultoId = '';
let playlists = {};
let temaSelecionadoPorCulto = {};
let temasPorCulto = {};
/** Só permite editar/apagar estrofes após «Editar letra». */
let modoEdicaoEstrofes = false;
/** Coluna central: ver letra inteira num só bloco (cópia), em vez dos cartões por slide. */
let modoLetraCompletaCentral = false;
/** Cópia ao entrar no modo letra completa — «Cancelar» restaura isto (não aplica o textarea). */
let snapshotLetraCompleta = null;
/** Cópia ao entrar em edição — «Encerrar edição» restaura isto (não grava). */
let snapshotEdicaoEstrofes = null;
/**
 * Após separar estrofes no evento `input`, o `blur` do textarea antigo ainda tinha o texto com `\n\n`
 * e chamava de novo `aplicarSeparacao…`, duplicando slides — ignoramos esse blur pelo índice.
 */
let ignorarBlurSeparacaoEstrofeIdx = null;
/**
 * Faixa inferior de slides: no modo controlador só após duplo clique num slide central.
 * No modo slides fica visível ao escolher música na playlist (sem projetar até duplo clique na lista).
 */
let slidesDockVisivel = false;
/** Modo slides: após ESC a música é desmarcada; ao escolher outra na playlist a faixa volta a abrir. */
let slidesRailUserRecolhido = false;
/**
 * Modo slides: a grelha de chips só aparece após escolher música na playlist (não ao carregar do banco na coluna esquerda).
 * Ao entrar no modo slides fica sempre false até clique/dupro na playlist ou «Avançar música».
 */
let faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
/**
 * Quando false, mudanças de estrofe só atualizam o painel (sem enviar às telas) até o primeiro duplo clique
 * na faixa de slides ou no cartão central — ou até «Avançar música», sincronização do servidor, etc.
 */
let projecaoMusicaEmitidaNoServidor = false;
/**
 * Após escolher música no painel (playlist/banco), não aplicar estado «estado» do socket como se fosse projeção
 * até este cliente emitir `exibir_musica` — senão o servidor continua com a mesma música e os previews voltavam a mostrar letra só com um clique.
 */
let bloqueioSincronizarEstrofeDoServidor = false;
/** Evita que dois cliques rápidos na playlist disparem só seleção duas vezes + duplo clique (projeta sem querer). */
let playlistRowClickTimer = null;
let slidesRailDrag = { active: false, alvo: 'faixa', startY: 0, startH: 520 };
let monitoresServidorCache = [];

document.addEventListener('mousemove', (e) => {
  if (!slidesRailDrag.active) return;
  if (slidesRailDrag.alvo === 'previa') {
    /* Para baixo (dy > 0) = prévias maiores, grelha menor. */
    aplicarAlturaPreviewMod(slidesRailDrag.startH + (e.clientY - slidesRailDrag.startY));
    return;
  }
  const dy = slidesRailDrag.startY - e.clientY;
  const nh = clampSlidesRailHeight(slidesRailDrag.startH + dy);
  document.documentElement.style.setProperty('--slides-rail-height', nh + 'px');
});

document.addEventListener('mouseup', () => {
  if (!slidesRailDrag.active) return;
  slidesRailDrag.active = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  if (slidesRailDrag.alvo === 'previa') {
    localStorage.setItem(LS_SLIDES_PREVIEW_H_PX, String(alturaPreviewModAtualPx()));
  } else {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--slides-rail-height');
    const px = parseInt(raw, 10);
    if (Number.isFinite(px)) localStorage.setItem(LS_SLIDES_RAIL_PX, String(px));
  }
  queueMicrotask(() => {
    ajustarEncaixeGrelhaSlidesModoSlides();
    reaplicarFontesPreviewPainel();
    reaplicarAlturasEstrofesEditor();
  });
});

window.addEventListener('resize', () => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--slides-rail-height');
  const px = parseInt(raw, 10);
  if (Number.isFinite(px)) {
    document.documentElement.style.setProperty('--slides-rail-height', clampSlidesRailHeight(px) + 'px');
  }
  if (document.body.style.getPropertyValue('--preview-mod-card-h')) {
    aplicarAlturaPreviewMod(alturaPreviewModAtualPx());
  }
  queueMicrotask(() => {
    ajustarEncaixeGrelhaSlidesModoSlides();
    reaplicarFontesPreviewPainel();
    reaplicarAlturasEstrofesEditor();
  });
});

let socketScriptLoading = false;

function loadPlaylists() {
  try {
    let raw = localStorage.getItem(LS_PLAYLISTS);
    if (!raw && localStorage.getItem(LS_PLAYLISTS_LEGACY)) {
      raw = localStorage.getItem(LS_PLAYLISTS_LEGACY);
      localStorage.setItem(LS_PLAYLISTS, raw);
      localStorage.removeItem(LS_PLAYLISTS_LEGACY);
    }
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === 'object' && p ? p : {};
  } catch (_) { return {}; }
}

function normalizarTemaPlaylist(v) {
  return String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40)
    .toLocaleUpperCase('pt-BR');
}

function normalizarListaTemas(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  arr.forEach((t) => {
    const n = normalizarTemaPlaylist(t);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  });
  return out;
}

function ehMarcadorTemaPlaylist(it) {
  return it && it.tipo === PLAYLIST_TIPO_MARCADOR_TEMA;
}

/**
 * Remove marcadores do tema e todas as músicas desse bloco (ordem dos marcadores na playlist).
 * O cabeçalho visual segue o marcador anterior; muitas linhas podem ter `tema` vazio ou desactualizado.
 */
function filtrarPlaylistRemovendoTemaComMarcadores(pl, tNorm) {
  const t = normalizarTemaPlaylist(tNorm);
  if (!t || !Array.isArray(pl)) return pl ? pl.slice() : [];
  const out = [];
  const len = pl.length;
  let i = 0;

  if (len && !ehMarcadorTemaPlaylist(pl[0])) {
    let j = 0;
    while (j < len && !ehMarcadorTemaPlaylist(pl[j])) j++;
    const temaPrefixo = normalizarTemaPlaylist(pl[0]?.tema);
    for (let k = 0; k < j; k++) {
      const it = pl[k];
      const ti = normalizarTemaPlaylist(it?.tema);
      if (temaPrefixo === t || ti === t) continue;
      out.push(it);
    }
    i = j;
  }

  let ignorarAteProximoMarcador = false;
  while (i < len) {
    const it = pl[i];
    if (ehMarcadorTemaPlaylist(it)) {
      const mt = normalizarTemaPlaylist(it.tema);
      if (mt === t) {
        ignorarAteProximoMarcador = true;
        i++;
        continue;
      }
      ignorarAteProximoMarcador = false;
      out.push(it);
      i++;
      continue;
    }
    if (ignorarAteProximoMarcador) {
      i++;
      continue;
    }
    if (normalizarTemaPlaylist(it?.tema) === t) {
      i++;
      continue;
    }
    out.push(it);
    i++;
  }
  return out;
}

function chaveArmazenamentoSecaoTemaPlaylist(cid, rotuloCabecalho) {
  const n = normalizarTemaPlaylist(rotuloCabecalho);
  const tag = n ? n : '__SEM_TEMA__';
  return `${String(cid || '')}|||${tag}`;
}

function carregarMapaSecoesTemaPlaylistRecolhidas() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}

function secaoTemaPlaylistRecolhida(cid, rotuloCabecalho) {
  const k = chaveArmazenamentoSecaoTemaPlaylist(cid, rotuloCabecalho);
  return !!carregarMapaSecoesTemaPlaylistRecolhidas()[k];
}

function definirSecaoTemaPlaylistRecolhida(cid, rotuloCabecalho, recolhido) {
  const m = { ...carregarMapaSecoesTemaPlaylistRecolhidas() };
  const k = chaveArmazenamentoSecaoTemaPlaylist(cid, rotuloCabecalho);
  if (recolhido) m[k] = true;
  else delete m[k];
  try {
    localStorage.setItem(LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS, JSON.stringify(m));
  } catch (_) {
  // intencional — erro ignorado
}
}

function atualizarUiExpandSecaoTema(btn, recolhido) {
  if (recolhido) {
    btn.innerHTML = SVG_PLAYLIST_SECAO_EXPANDIR;
    btn.title = 'Expandir músicas deste tema';
    btn.setAttribute('aria-expanded', 'false');
  } else {
    btn.innerHTML = SVG_PLAYLIST_SECAO_RECOLHER;
    btn.title = 'Recolher músicas deste tema';
    btn.setAttribute('aria-expanded', 'true');
  }
}

function playlistPossuiMarcadoresTema(pl) {
  return Array.isArray(pl) && pl.some(ehMarcadorTemaPlaylist);
}

function obterUltimoMarcadorTema(pl) {
  if (!Array.isArray(pl)) return '';
  for (let i = pl.length - 1; i >= 0; i--) {
    if (ehMarcadorTemaPlaylist(pl[i])) return normalizarTemaPlaylist(pl[i].tema);
  }
  return '';
}

/** Lista os temas distintos (por marcador) presentes na playlist, na ordem em que aparecem. */
function listarMarcadoresTemaPlaylist(pl) {
  if (!Array.isArray(pl)) return [];
  const seen = new Set();
  const out = [];
  for (const it of pl) {
    if (!ehMarcadorTemaPlaylist(it)) continue;
    const t = normalizarTemaPlaylist(it.tema);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Insere `item` no fim do bloco do tema escolhido (posição correta na playlist plana),
 * já que os blocos são delimitados por marcadores. Se o tema não for encontrado, faz push.
 * Usa a última ocorrência do marcador, caso haja marcadores repetidos com o mesmo nome.
 */
function inserirMusicaNoBlocoTema(pl, tema, item) {
  if (!Array.isArray(pl)) return;
  const alvo = normalizarTemaPlaylist(tema);
  let markerIdx = -1;
  for (let i = 0; i < pl.length; i++) {
    if (ehMarcadorTemaPlaylist(pl[i]) && normalizarTemaPlaylist(pl[i].tema) === alvo) {
      markerIdx = i;
    }
  }
  if (markerIdx < 0) {
    pl.push(item);
    return;
  }
  let fimBloco = markerIdx + 1;
  while (fimBloco < pl.length && !ehMarcadorTemaPlaylist(pl[fimBloco])) fimBloco++;
  pl.splice(fimBloco, 0, item);
}

function loadTemaSelecionadoPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_TEMA_SEL);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
}

function saveTemaSelecionadoPorCulto() {
  try {
    localStorage.setItem(LS_PLAYLIST_TEMA_SEL, JSON.stringify(temaSelecionadoPorCulto || {}));
  } catch (_) {
  // intencional — erro ignorado
}
}

function migrarTemasParaGlobal() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_TEMAS);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return;
    // Se já tem __global__, não faz nada
    if (Array.isArray(p['__global__']) && p['__global__'].length) return;
    // Junta todos os temas de todos os cultos em __global__
    const todos = [];
    const seen = new Set();
    Object.values(p).forEach((arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((t) => {
        const n = normalizarTemaPlaylist(t);
        if (n && !seen.has(n)) { seen.add(n); todos.push(n); }
      });
    });
    if (!todos.length) return;
    p['__global__'] = ordenarTemasLista(todos);
    localStorage.setItem(LS_PLAYLIST_TEMAS, JSON.stringify(p));
  } catch (_) {
  // intencional — erro ignorado
}
}

function loadTemasPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_TEMAS);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return {};
    const out = {};
    Object.keys(p).forEach((cid) => {
      out[cid] = normalizarListaTemas(p[cid]);
    });
    return out;
  } catch (_) {
    return {};
  }
}

function saveTemasPorCulto() {
  try {
    localStorage.setItem(LS_PLAYLIST_TEMAS, JSON.stringify(temasPorCulto || {}));
  } catch (_) {
  // intencional — erro ignorado
}
  marcarBancoCompartilhadoAlterado();
}

function getTemasDoCultoAtual() {
  if (!Array.isArray(temasPorCulto['__global__'])) temasPorCulto['__global__'] = [];
  temasPorCulto['__global__'] = normalizarListaTemas(temasPorCulto['__global__']);
  return temasPorCulto['__global__'];
}

function garantirTemaNoCatalogoAtual(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t) return;
  const lista = getTemasDoCultoAtual();
  if (lista.includes(t)) return;
  lista.push(t);
  temasPorCulto['__global__'] = normalizarListaTemas(lista);
  saveTemasPorCulto();
}

/** Mantém a ordem do array e coloca ABERTURA sempre em primeiro. */
function ordenarTemasLista(arr) {
  const lista = normalizarListaTemas(arr || []);
  const resto = lista.filter((t) => t !== TEMA_PADRAO_ABERTURA);
  if (lista.includes(TEMA_PADRAO_ABERTURA)) return [TEMA_PADRAO_ABERTURA, ...resto];
  return resto;
}

let aberturaRemovidaPorCulto = {};

function loadAberturaRemovidaPorCulto() {
  try {
    const raw = localStorage.getItem(LS_PLAYLIST_ABERTURA_REMOVIDA);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch (_) {
    return {};
  }
}

function saveAberturaRemovidaPorCulto() {
  try {
    localStorage.setItem(LS_PLAYLIST_ABERTURA_REMOVIDA, JSON.stringify(aberturaRemovidaPorCulto || {}));
  } catch (_) {
  // intencional — erro ignorado
}
  marcarBancoCompartilhadoAlterado();
}

function cultoUsuarioRemoveuAbertura(cid) {
  return !!aberturaRemovidaPorCulto[String(cid || '')];
}

function marcarAberturaRemovidaPeloUsuario(cid) {
  const id = String(cid || '');
  if (!id) return;
  aberturaRemovidaPorCulto[id] = true;
  saveAberturaRemovidaPorCulto();
}

function desmarcarAberturaRemovidaPeloUsuario(cid) {
  const id = String(cid || '');
  if (!id) return;
  delete aberturaRemovidaPorCulto[id];
  saveAberturaRemovidaPorCulto();
}

function playlistTemMarcadorAbertura(pl) {
  return (pl || []).some(
    (it) => ehMarcadorTemaPlaylist(it) && normalizarTemaPlaylist(it.tema) === TEMA_PADRAO_ABERTURA
  );
}

function playlistParaBlocosComMarcadores(pl) {
  const blocos = [];
  let i = 0;
  if (pl.length && !ehMarcadorTemaPlaylist(pl[0])) {
    let j = 0;
    while (j < pl.length && !ehMarcadorTemaPlaylist(pl[j])) j++;
    blocos.push({
      tema: normalizarTemaPlaylist(pl[0]?.tema) || '',
      itens: pl.slice(0, j),
      markerPlIdx: null,
    });
    i = j;
  }
  while (i < pl.length) {
    if (ehMarcadorTemaPlaylist(pl[i])) {
      const markerPlIdx = i;
      const tema = normalizarTemaPlaylist(pl[i].tema);
      let j = i + 1;
      while (j < pl.length && !ehMarcadorTemaPlaylist(pl[j])) j++;
      blocos.push({ tema, itens: pl.slice(i, j), markerPlIdx });
      i = j;
    } else {
      i++;
    }
  }
  return blocos;
}

function blocosComMarcadoresParaPlaylist(blocos) {
  return blocos.flatMap((b) => b.itens);
}

function garantirAberturaNoCatalogoCulto(cid) {
  garantirTemaNoCatalogoAtual(TEMA_PADRAO_ABERTURA);
  if (!cid) return;
  if (!Array.isArray(temasPorCulto[cid])) temasPorCulto[cid] = [];
  const lista = normalizarListaTemas(temasPorCulto[cid]);
  if (!lista.includes(TEMA_PADRAO_ABERTURA)) {
    temasPorCulto[cid] = [TEMA_PADRAO_ABERTURA, ...lista];
    saveTemasPorCulto();
  } else {
    const ordenada = ordenarTemasLista(lista);
    if (ordenada.join('\u0001') !== lista.join('\u0001')) {
      temasPorCulto[cid] = ordenada;
      saveTemasPorCulto();
    }
  }
}

function garantirMarcadorAberturaNaPlaylist(cid) {
  if (!cid || cultoUsuarioRemoveuAbertura(cid)) return false;
  const pl = getPlaylist(cid);
  if (playlistTemMarcadorAbertura(pl)) return false;
  garantirAberturaNoCatalogoCulto(cid);
  pl.unshift({ tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema: TEMA_PADRAO_ABERTURA });
  playlists[cid] = pl;
  return true;
}

function sincronizarOrdemTemasCatalogoComPlaylist(cid) {
  if (!cid) return;
  const pl = getPlaylist(cid);
  const ordem = [];
  const seen = new Set();
  playlistParaBlocosComMarcadores(pl).forEach((b) => {
    const t = b.tema;
    if (t && !seen.has(t)) {
      seen.add(t);
      ordem.push(t);
    }
  });
  (pl || []).forEach((it) => {
    if (ehMarcadorTemaPlaylist(it)) return;
    const t = normalizarTemaPlaylist(it?.tema);
    if (t && !seen.has(t)) {
      seen.add(t);
      ordem.push(t);
    }
  });
  const extras = (temasPorCulto[cid] || []).filter((t) => t && !seen.has(t));
  temasPorCulto[cid] = ordenarTemasLista(normalizarListaTemas([...ordem, ...extras]));
  saveTemasPorCulto();
}

function reordenarMarcadoresTemaNaPlaylist(cid, fromMarkerIdx, toMarkerIdx) {
  const from = Number(fromMarkerIdx);
  const to = Number(toMarkerIdx);
  if (!cid || !Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
  const pl = getPlaylist(cid);
  const blocos = playlistParaBlocosComMarcadores(pl);
  const fromB = blocos.findIndex((b) => b.markerPlIdx === from);
  const toB = blocos.findIndex((b) => b.markerPlIdx === to);
  if (fromB < 0 || toB < 0 || blocos[fromB].markerPlIdx == null) return;
  const reord = [...blocos];
  const [bloco] = reord.splice(fromB, 1);
  reord.splice(toB, 0, bloco);
  playlists[cid] = blocosComMarcadoresParaPlaylist(reord);
  sincronizarOrdemTemasCatalogoComPlaylist(cid);
  savePlaylists();
}

function renomearTemaNoCulto(velho, novo) {
  const v = normalizarTemaPlaylist(velho);
  const n = normalizarTemaPlaylist(novo);
  if (!v || !n) return false;
  if (v === n) return true;
  const lista = ordenarTemasLista(getTemasDoCultoAtual());
  if (!lista.includes(v)) return false;
  if (lista.includes(n)) {
    appAlert('Já existe um tema com esse nome.');
    return false;
  }
  temasPorCulto['__global__'] = normalizarListaTemas(lista.map((t) => (t === v ? n : t)));
  saveTemasPorCulto();
  // Atualiza todas as playlists
  Object.keys(playlists).forEach((cid) => {
    const pl = getPlaylist(cid);
    pl.forEach((it) => {
      if (normalizarTemaPlaylist(it.tema) === v) it.tema = n;
    });
  });
  if (getTemaSelecionadoAtual() === v) setTemaSelecionadoAtual(n);
  savePlaylists();
  return true;
}

let compartilharPlaylistEmAndamento = false;

/** Só desabilita/reabilita o botão «C». O feedback de progresso vive no modal
 *  (ver abrirModalCompartilharPlaylist), não mais inline na toolbar S/C/I. */
function atualizarFeedbackCompartilharPlaylist(ativo) {
  const btn = document.getElementById('playlist-compartilhar-btn');
  if (btn) {
    btn.disabled = !!ativo;
    btn.setAttribute('aria-busy', ativo ? 'true' : 'false');
  }
}

/** Abre o modal (reutiliza o app-dialog padrão do app) no estado de carregamento
 *  e devolve o container `.share-modal` para evoluir in-place até o código. */
function abrirModalCompartilharPlaylist() {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel) return null;
  head.textContent = 'Compartilhar Playlist';
  ok.style.display = 'none';
  cancel.style.display = '';
  cancel.textContent = 'Fechar';
  cancel.onclick = () => fecharAppDialog(false);
  body.style.whiteSpace = 'normal';
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'share-modal';
  const loading = document.createElement('div');
  loading.className = 'share-modal-loading';
  const spin = document.createElement('div');
  spin.className = 'share-modal-spinner';
  spin.setAttribute('aria-hidden', 'true');
  const txt = document.createElement('div');
  txt.className = 'share-modal-loading-text';
  txt.textContent = 'Gerando código de compartilhamento...';
  loading.appendChild(spin);
  loading.appendChild(txt);
  wrap.appendChild(loading);
  body.appendChild(wrap);
  ov.hidden = false;
  ov.classList.add('aberto');
  // Marca o modal como ativo p/ que Escape e clique no backdrop façam a limpeza correta.
  appCompartilharResolver = () => {};
  return wrap;
}

/** Substitui o estado de loading pelo código gerado + botão de copiar (mesmo modal). */
function modalCompartilharMostrarCodigo(wrap, codigo, dataExp) {
  if (!wrap) return;
  wrap.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'share-modal-label';
  label.textContent = 'Código da playlist';
  const row = document.createElement('div');
  row.className = 'share-modal-code-row';
  const code = document.createElement('div');
  code.className = 'share-modal-code';
  code.textContent = String(codigo || '');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn sm share-modal-copy';
  copy.textContent = 'Copiar';
  copy.setAttribute('aria-label', 'Copiar código');
  copy.title = 'Copiar código para a área de transferência';
  copy.onclick = () => copiarCodigoCompartilhar(copy, String(codigo || ''));
  row.appendChild(code);
  row.appendChild(copy);
  wrap.appendChild(label);
  wrap.appendChild(row);
  if (dataExp) {
    const exp = document.createElement('div');
    exp.className = 'share-modal-exp';
    exp.textContent = `Válido até ${dataExp}`;
    wrap.appendChild(exp);
  }
}

/** Substitui o conteúdo do modal por uma mensagem de erro (mesmo modal). */
function modalCompartilharMostrarErro(wrap, msg) {
  if (!wrap) return;
  wrap.innerHTML = '';
  const err = document.createElement('div');
  err.className = 'share-modal-erro';
  err.textContent = String(msg || 'Não foi possível gerar o código de compartilhamento. Tente novamente.');
  wrap.appendChild(err);
}

/** Copia o código pro clipboard com feedback visual («Copiado!») por ~1,6s. */
async function copiarCodigoCompartilhar(btn, codigo) {
  const texto = String(codigo || '').trim();
  if (!texto) return;
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
      ok = true;
    }
  } catch (_) {
    // fallback abaixo
  }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {
      ok = false;
    }
  }
  if (btn) {
    const rotuloOriginal = btn.dataset.rotuloOriginal || btn.textContent;
    btn.dataset.rotuloOriginal = rotuloOriginal;
    btn.textContent = ok ? 'Copiado!' : 'Erro';
    btn.classList.toggle('success', ok);
    clearTimeout(btn._copiarTimer);
    btn._copiarTimer = setTimeout(() => {
      btn.textContent = btn.dataset.rotuloOriginal || 'Copiar';
      btn.classList.remove('success');
    }, 1600);
  }
}

/**
 * Letra a enviar no código de compartilhamento = exatamente a versão do item na playlist.
 * (`id` = original/root; `versaoLocalId` = cópia escolhida, se houver.)
 */
async function conteudoMusicaParaShare(it) {
  const vid = it.versaoLocalId != null && String(it.versaoLocalId).trim() ? String(it.versaoLocalId).trim() : '';
  if (vid && ehVersaoLocalLegada(vid)) {
    const c = encontrarCopiaLocal(it.id, vid);
    if (c) {
      return {
        titulo: c.titulo || it.titulo || '',
        artista: c.artista || it.artista || '',
        estrofes: Array.isArray(c.estrofes) ? c.estrofes.map((s) => String(s)) : [],
        // Rótulo de origem da versão escolhida (ex.: 'CÓPIA'). Só procedência
        // p/ exibição no destino; não recria fork/lineage entre bancos.
        rotulo: String(c.rotulo || it.versaoRotulo || '').trim(),
      };
    }
  }
  const idFetch = vid && ehVersaoServidorId(vid) ? vid : it.id;
  const fonte = it.bancoFonte === 'catalog' ? 'catalog' : 'user';
  const res = await fetch(
    `${getControllerApiBase()}/api/musicas/${encodeURIComponent(idFetch)}?fonte=${fonte}`
  );
  if (!res.ok) throw new Error();
  const m = await res.json();
  return {
    titulo: m.titulo || it.titulo || '',
    artista: m.artista || it.artista || '',
    estrofes: Array.isArray(m.estrofes) ? m.estrofes : [],
    // Rótulo de origem da versão escolhida (ex.: 'CÓPIA'). Só procedência
    // p/ exibição no destino; não recria fork/lineage entre bancos.
    rotulo: String(m.rotulo || it.versaoRotulo || '').trim(),
  };
}

async function compartilharPlaylist() {
  if (compartilharPlaylistEmAndamento) return;
  if (!cultoId) return appAlert('Selecione um culto primeiro.', 'Compartilhar Playlist');
  const pl = getPlaylist(cultoId);
  if (!pl.length) return appAlert('A playlist está vazia.', 'Compartilhar Playlist');

  compartilharPlaylistEmAndamento = true;
  atualizarFeedbackCompartilharPlaylist(true);
  // Modal (mesmo app-dialog do restante do app) já abre no estado de carregamento.
  const modalWrap = abrirModalCompartilharPlaylist();
  try {
    // Coleta estrofes de cada música via API local do controlador (sempre em localhost:3001)
    const musicas = [];
    for (const it of pl) {
      if (it.tipo === PLAYLIST_TIPO_MARCADOR_TEMA) continue;
      try {
        musicas.push(await conteudoMusicaParaShare(it));
      } catch (_) {
        if (it.titulo) musicas.push({ titulo: it.titulo, artista: it.artista || '', estrofes: [] });
      }
    }

    if (!musicas.length) {
      modalCompartilharMostrarErro(modalWrap, 'Nenhuma música encontrada na playlist.');
      return;
    }

    const res = await fetch(`${CLOUD_SHARE_URL}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cultoId, cultoNome: '', musicas }),
    });
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    const { codigo, expiraEm } = await res.json();
    const dataExp = new Date(expiraEm).toLocaleDateString('pt-BR');
    // Mesmo modal evolui de loading → código, sem fechar/reabrir.
    modalCompartilharMostrarCodigo(modalWrap, codigo, dataExp);
  } catch (err) {
    console.error('Falha ao gerar código de compartilhamento da playlist.', err);
    modalCompartilharMostrarErro(
      modalWrap,
      'Não foi possível gerar o código de compartilhamento. Tente novamente.'
    );
  } finally {
    compartilharPlaylistEmAndamento = false;
    atualizarFeedbackCompartilharPlaylist(false);
  }
}

function labelFallbackDeCultoIdImport(cid) {
  const iso = isoFromCultoId(cid);
  if (!iso) return String(cid || '');
  const p = iso.split('-');
  const suf = p.length >= 3 ? `${p[2]}/${p[1]}` : iso;
  const m = String(cid).match(/^culto_\d{4}-\d{2}-\d{2}_(\w+)$/i);
  const sufixo = m ? m[1].toLowerCase() : '';
  if (sufixo === 'manha') return `${suf} | DOMINGO | MANHÃ`;
  if (sufixo === 'noite') return `${suf} | DOMINGO | NOITE`;
  if (sufixo === 'quarta') return `${suf} | QUARTA-FEIRA`;
  const idx = SUFIXO_ID_DIA_SEMANA.indexOf(sufixo);
  if (idx >= 0) return `${suf} | ${NOMES_DIA_SEMANA_PT[idx]}`;
  return `${suf} | ${sufixo.toUpperCase()}`;
}

function garantirCultoDisponivelParaImportacaoCodigo(cultoIdCodigo, cultoNomeNuvem) {
  const cid = String(cultoIdCodigo || '').trim();
  if (!cid) return;
  if (idsCultosJaNaLista().has(cid)) return;
  const label = String(cultoNomeNuvem || '').trim() || labelFallbackDeCultoIdImport(cid);
  cultosManuaisCache = ordenarCultosPorData([...(cultosManuaisCache || []), { id: cid, label }]);
  saveCultosManuais();
  garantirAberturaNoCatalogoCulto(cid);
  if (garantirMarcadorAberturaNaPlaylist(cid)) savePlaylists();
}

function ativarCultoNaUiParaImportacaoCodigo(cultoDestino) {
  const cid = String(cultoDestino || '').trim();
  if (!cid) return;
  cultoId = cid;
  try {
    localStorage.setItem(LS_CULTO, cultoId);
  } catch (_) {
  // intencional — erro ignorado
}
  initCultoSelect();
  setCultoSelecionadoNaUi(cultoId);
  onCultoChange();
}

let modalImportarTimerAutoFechar = null;

function importarPlaylist() {
  abrirModalImportarPlaylistInput('');
}

/** Estado 1 — campo de código. Reabre com o valor anterior quando o usuário
 *  escolhe «Tentar de novo» após um erro. Reutiliza o app-dialog padrão do app. */
function abrirModalImportarPlaylistInput(valorInicial = '') {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel) return;
  clearTimeout(modalImportarTimerAutoFechar);
  head.textContent = 'Importar Playlist';
  body.style.whiteSpace = 'normal';
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'share-modal';
  const label = document.createElement('div');
  label.className = 'share-modal-label';
  label.textContent = 'Código da playlist';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 20;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.className = 'share-modal-input';
  input.value = String(valorInicial || '');
  input.placeholder = 'Ex: XKJA-29BM';
  const err = document.createElement('div');
  err.className = 'share-modal-erro';
  err.style.minHeight = '16px';
  err.hidden = true;
  wrap.appendChild(label);
  wrap.appendChild(input);
  wrap.appendChild(err);
  body.appendChild(wrap);

  ok.style.display = '';
  ok.textContent = 'OK';
  cancel.style.display = '';
  cancel.textContent = 'Cancelar';
  const confirmar = () => {
    const codigo = String(input.value || '').trim().toUpperCase();
    if (!codigo) {
      err.hidden = false;
      err.textContent = 'Digite o código gerado pelo Compartilhar (ex: XKJA-29BM).';
      try {
        input.focus();
      } catch (_) {
        // intencional — erro ignorado
      }
      return;
    }
    void executarFluxoImportarPlaylist(codigo, wrap);
  };
  ok.onclick = confirmar;
  cancel.onclick = () => fecharAppDialog(false);
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmar();
    }
  };

  ov.hidden = false;
  ov.classList.add('aberto');
  // Marca o modal como ativo p/ que Escape e clique no backdrop façam a limpeza correta.
  appImportarResolver = () => {};
  setTimeout(() => {
    try {
      input.focus();
      input.select();
    } catch (_) {
      // intencional — erro ignorado
    }
  }, 50);
}

/** Estado 2 — carregando (mesmo padrão visual do modal do «C»). */
function modalImportarPlaylistLoading(wrap, texto = 'Importando playlist...') {
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (ok) ok.style.display = 'none';
  if (cancel) cancel.style.display = 'none';
  if (!wrap) return;
  wrap.innerHTML = '';
  const loading = document.createElement('div');
  loading.className = 'share-modal-loading';
  const spin = document.createElement('div');
  spin.className = 'share-modal-spinner';
  spin.setAttribute('aria-hidden', 'true');
  const t = document.createElement('div');
  t.className = 'share-modal-loading-text';
  t.textContent = String(texto || 'Importando playlist...');
  loading.appendChild(spin);
  loading.appendChild(t);
  wrap.appendChild(loading);
}

/** Estado 3a — erro. Não fecha sozinho: «Tentar de novo» volta ao campo, «Fechar» dispensa. */
function modalImportarPlaylistErro(wrap, msg, codigoAnterior) {
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  clearTimeout(modalImportarTimerAutoFechar);
  if (wrap) {
    wrap.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'share-modal-erro';
    err.textContent = String(msg || 'Não foi possível importar a playlist. Tente novamente.');
    wrap.appendChild(err);
  }
  if (ok) {
    ok.style.display = '';
    ok.textContent = 'Tentar de novo';
    ok.onclick = () => abrirModalImportarPlaylistInput(String(codigoAnterior || ''));
  }
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
}

/** Estado 3b — sucesso. Mostra confirmação + botão «Fechar»; auto-fecha em casos simples. */
function modalImportarPlaylistSucesso(wrap, msg, autoFechar = true) {
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (wrap) {
    wrap.innerHTML = '';
    const s = document.createElement('div');
    s.className = 'share-modal-sucesso';
    s.textContent = String(msg || 'Playlist importada com sucesso.');
    wrap.appendChild(s);
  }
  if (ok) ok.style.display = 'none';
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
  clearTimeout(modalImportarTimerAutoFechar);
  if (autoFechar) {
    modalImportarTimerAutoFechar = setTimeout(() => {
      // Só fecha se ainda for o modal de importação que está aberto.
      if (appImportarResolver) fecharAppDialog(false);
    }, 2600);
  }
}

/* ── Confirmação da importação por código (antes de gravar) ──────────────── */

const NOMES_MES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

let confirmarImportResolver = null;

/** Data de referência do código: o mês do culto que ele traz, senão o mês atual. */
function dataRefDoCultoImportado(cultoIdCodigo) {
  const iso = isoFromCultoId(cultoIdCodigo);
  if (!iso) return new Date();
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

/** Rótulo curto de uma opção do seletor: «09/08 — DOMINGO | MANHÃ». */
function rotuloOpcaoCultoImport(item) {
  const p = parseLabelCulto(item.label);
  return p.desc ? `${p.data} — ${p.desc}` : p.data || String(item.id || '');
}

function fecharJanelaConfirmarImport(resultado) {
  const bd = document.getElementById('confirmar-import-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  const r = confirmarImportResolver;
  confirmarImportResolver = null;
  if (r) r(resultado || { confirmado: false, cultoId: '', cultoLabel: '' });
}

/**
 * Lista as músicas recebidas no código e pede confirmação + culto de destino.
 * Nada é gravado enquanto esta janela estiver aberta.
 *
 * @param {{ musicas: Array<object>, cultoIdCodigo: string, cultoNomeCodigo: string }} ctx
 * @returns {Promise<{ confirmado: boolean, cultoId: string, cultoLabel: string }>}
 */
function abrirJanelaConfirmarImport(ctx) {
  const bd = document.getElementById('confirmar-import-backdrop');
  const lista = document.getElementById('confirmar-import-lista');
  const sel = document.getElementById('confirmar-import-culto');
  if (!bd || !lista || !sel) {
    // Sem a janela no DOM não há como perguntar: segue com o destino do código.
    return Promise.resolve({
      confirmado: true,
      cultoId: String(ctx?.cultoIdCodigo || cultoId || '').trim(),
      cultoLabel: String(ctx?.cultoNomeCodigo || '').trim(),
    });
  }

  const musicas = Array.isArray(ctx?.musicas) ? ctx.musicas : [];
  const cultoIdCodigo = String(ctx?.cultoIdCodigo || '').trim();
  const jaExistem = Array.isArray(ctx?.jaExistem) ? ctx.jaExistem : [];

  lista.innerHTML = '';
  musicas.forEach((m, i) => {
    const linha = document.createElement('div');
    linha.className = 'confirmar-import-item';

    const num = document.createElement('span');
    num.className = 'confirmar-import-item-num';
    num.textContent = String(i + 1);
    linha.appendChild(num);

    const txt = document.createElement('div');
    txt.className = 'confirmar-import-item-txt';

    const nome = document.createElement('div');
    nome.className = 'confirmar-import-item-nome';
    nome.textContent = String(m.titulo || '').trim() || 'Sem título';
    // Rótulo da versão que veio no código (ex.: 'COP. ALAN', 'CÓPIA').
    const rotulo = String(m.rotulo || '').trim();
    if (rotulo) {
      const tag = document.createElement('span');
      tag.className = 'confirmar-import-item-rotulo';
      tag.textContent = `(${rotulo})`;
      nome.appendChild(tag);
    }
    txt.appendChild(nome);

    const artista = String(m.artista || '').trim();
    if (artista) {
      const art = document.createElement('div');
      art.className = 'confirmar-import-item-artista';
      art.textContent = artista;
      txt.appendChild(art);
    }
    linha.appendChild(txt);

    if (jaExistem[i]) {
      const badge = document.createElement('span');
      badge.className = 'confirmar-import-badge';
      badge.textContent = 'JÁ EXISTE';
      badge.title = 'Você decidirá o que fazer com esta música no passo seguinte.';
      linha.appendChild(badge);
    }

    lista.appendChild(linha);
  });
  lista.scrollTop = 0;

  const total = musicas.length;
  const conflitos = jaExistem.filter(Boolean).length;
  const elTotal = document.getElementById('confirmar-import-total');
  if (elTotal) elTotal.textContent = `${total} música${total === 1 ? '' : 's'} recebida${total === 1 ? '' : 's'}`;
  const elExist = document.getElementById('confirmar-import-existentes');
  if (elExist) {
    elExist.innerHTML = '';
    if (conflitos > 0) {
      const n = document.createElement('strong');
      n.textContent = String(conflitos);
      elExist.appendChild(n);
      elExist.appendChild(
        document.createTextNode(conflitos === 1 ? ' já existe no seu banco' : ' já existem no seu banco')
      );
    }
  }

  // Seletor: cultos do mês de referência + o culto do código, se ainda não existir.
  const dataRef = dataRefDoCultoImportado(cultoIdCodigo);
  const disponiveis = listarCultosDisponiveis(dataRef);
  const jaNaLista = new Set(disponiveis.map((c) => c.id));
  const opcoes = [...disponiveis];
  if (cultoIdCodigo && !jaNaLista.has(cultoIdCodigo)) {
    opcoes.unshift({
      id: cultoIdCodigo,
      label: String(ctx?.cultoNomeCodigo || '').trim() || labelFallbackDeCultoIdImport(cultoIdCodigo),
      novo: true,
    });
  }

  sel.innerHTML = '';
  opcoes.forEach((item) => {
    const op = document.createElement('option');
    op.value = item.id;
    op.textContent = item.novo
      ? `${rotuloOpcaoCultoImport(item)}  ·  novo (do código)`
      : rotuloOpcaoCultoImport(item);
    sel.appendChild(op);
  });

  // Pré-seleção: o culto do código; senão o culto ativo; senão o primeiro.
  const preferido = [cultoIdCodigo, cultoId].find((c) => c && opcoes.some((o) => o.id === c));
  sel.value = preferido || (opcoes[0] ? opcoes[0].id : '');

  const mes = document.getElementById('confirmar-import-mes');
  if (mes) mes.textContent = `${NOMES_MES_PT[dataRef.getMonth()]}/${dataRef.getFullYear()}`;

  const btnSim = document.getElementById('confirmar-import-sim');
  if (btnSim) btnSim.disabled = !opcoes.length;

  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    confirmarImportResolver = resolve;
    const cancelar = () => fecharJanelaConfirmarImport({ confirmado: false, cultoId: '', cultoLabel: '' });
    btnSim.onclick = () => {
      const escolhido = String(sel.value || '').trim();
      if (!escolhido) return;
      const item = opcoes.find((o) => o.id === escolhido);
      fecharJanelaConfirmarImport({
        confirmado: true,
        cultoId: escolhido,
        cultoLabel: item ? String(item.label || '') : '',
      });
    };
    document.getElementById('confirmar-import-nao').onclick = cancelar;
    document.getElementById('confirmar-import-fechar').onclick = cancelar;
  });
}

/**
 * Marca quais músicas recebidas já existem no banco local. Somente leitura —
 * usa a rota de checagem, e não a de importação, que gravaria as inéditas.
 *
 * @returns {Promise<boolean[]>} Um booleano por música, na mesma ordem.
 */
async function checarQuaisMusicasJaExistem(musicas) {
  const vazio = musicas.map(() => false);
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/checar-duplicidade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        musicas: musicas.map((m) => ({ titulo: m.titulo, artista: m.artista || '' })),
      }),
    });
    if (!res.ok) return vazio;
    const data = await res.json().catch(() => ({}));
    const arr = Array.isArray(data.resultados) ? data.resultados : [];
    return musicas.map((_, i) => !!(arr[i] && arr[i].duplicado));
  } catch (_) {
    // Sem a marcação a janela ainda funciona; o conflito aparece adiante.
    return vazio;
  }
}

/** Escape cancela a confirmação da importação. */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && confirmarImportResolver) {
    e.preventDefault();
    fecharJanelaConfirmarImport({ confirmado: false, cultoId: '', cultoLabel: '' });
  }
});

/* ── Janela de conflito da importação por código ─────────────────────────── */

let conflitoImportResolver = null;

/** Cabeçalho + letra de um dos lados da comparação.
 *  `estrofesOutroLado` serve só para realçar os trechos que diferem. */
function renderizarLadoConflitoImport(el, musica, estrofesOutroLado) {
  if (!el) return;
  el.innerHTML = '';
  const titulo = String(musica?.titulo || '').trim() || 'Sem título';
  const artista = String(musica?.artista || '').trim();
  const estrofes = Array.isArray(musica?.estrofes) ? musica.estrofes : [];

  const nome = document.createElement('div');
  nome.className = 'conflito-import-nome';
  nome.textContent = titulo;
  el.appendChild(nome);

  if (artista) {
    const autor = document.createElement('div');
    autor.className = 'conflito-import-autor';
    autor.textContent = `Autor: ${artista}`;
    el.appendChild(autor);
  }

  const meta = document.createElement('div');
  meta.className = 'conflito-import-meta';
  meta.textContent = `${estrofes.length} trecho(s)`;
  el.appendChild(meta);

  if (!estrofes.length) {
    const vazio = document.createElement('div');
    vazio.className = 'conflito-import-vazio';
    vazio.textContent = 'Sem letra.';
    el.appendChild(vazio);
    return;
  }

  const outro = Array.isArray(estrofesOutroLado) ? estrofesOutroLado : null;
  estrofes.forEach((bloco, i) => {
    const pre = document.createElement('pre');
    pre.className = 'conflito-import-estrofe';
    if (outro && String(outro[i] ?? '') !== String(bloco ?? '')) {
      pre.classList.add('conflito-import-estrofe--dif');
    }
    pre.textContent = String(bloco ?? '');
    el.appendChild(pre);
  });
}

function fecharJanelaConflitoImport(resultado) {
  const bd = document.getElementById('conflito-import-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  const r = conflitoImportResolver;
  conflitoImportResolver = null;
  if (r) r(resultado || { acao: 'cancelar', aplicarATodos: false });
}

/**
 * Abre a janela de conflito e resolve com a decisão do usuário.
 *
 * @param {{ atual: object, recebida: object, indice: number, total: number, restantes: number }} ctx
 * @returns {Promise<{ acao: 'substituir'|'manter'|'duplicar'|'cancelar', aplicarATodos: boolean }>}
 */
function abrirJanelaConflitoImport(ctx) {
  const bd = document.getElementById('conflito-import-backdrop');
  const elAtual = document.getElementById('conflito-import-atual');
  const elRecebido = document.getElementById('conflito-import-recebido');
  if (!bd || !elAtual || !elRecebido) {
    // Sem a janela no DOM não há como perguntar: mantém o comportamento antigo.
    return Promise.resolve({ acao: 'duplicar', aplicarATodos: true });
  }

  const atual = ctx?.atual || {};
  const recebida = ctx?.recebida || {};
  renderizarLadoConflitoImport(elAtual, atual, recebida.estrofes);
  renderizarLadoConflitoImport(elRecebido, recebida, atual.estrofes);
  elAtual.scrollTop = 0;
  elRecebido.scrollTop = 0;

  const prog = document.getElementById('conflito-import-progresso');
  if (prog) {
    prog.textContent = ctx?.total > 1 ? `Conflito ${ctx.indice} de ${ctx.total}` : '';
  }

  // «Aplicar aos demais» só faz sentido havendo mais músicas por processar.
  const restantes = Number(ctx?.restantes || 0);
  const todosWrap = document.getElementById('conflito-import-todos-wrap');
  const todos = document.getElementById('conflito-import-todos');
  const todosLabel = document.getElementById('conflito-import-todos-label');
  if (todos) todos.checked = false;
  if (todosWrap) todosWrap.hidden = restantes <= 0;
  if (todosLabel) {
    todosLabel.textContent =
      restantes === 1 ? 'Aplicar à próxima música' : `Aplicar às ${restantes} músicas restantes`;
  }

  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    conflitoImportResolver = resolve;
    const decidir = (acao) =>
      fecharJanelaConflitoImport({ acao, aplicarATodos: !!(todos && todos.checked) });

    document.getElementById('conflito-import-substituir').onclick = () => decidir('substituir');
    document.getElementById('conflito-import-manter').onclick = () => decidir('manter');
    document.getElementById('conflito-import-duplicar').onclick = () => decidir('duplicar');
    document.getElementById('conflito-import-fechar').onclick = () =>
      fecharJanelaConflitoImport({ acao: 'cancelar', aplicarATodos: false });
  });
}

/** Escape fecha a janela de conflito como «cancelar importação». */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && conflitoImportResolver) {
    e.preventDefault();
    fecharJanelaConflitoImport({ acao: 'cancelar', aplicarATodos: false });
  }
});

/** Grava uma música do código no banco, conforme a decisão já tomada (ou sem decisão). */
async function postImportarMusicaDoCodigo(m, decisaoDuplicidade) {
  const res = await fetch(`${getControllerApiBase()}/api/musicas/importar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titulo: m.titulo,
      artista: m.artista || '',
      estrofes: m.estrofes,
      ...(decisaoDuplicidade ? { decisaoDuplicidade } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/** Fluxo completo de importação; evolui o modal in-place (loading → sucesso/erro). */
async function executarFluxoImportarPlaylist(codigoNorm, wrap) {
  modalImportarPlaylistLoading(wrap, 'Importando playlist...');

  let data;
  try {
    const res = await fetch(`${CLOUD_SHARE_URL}/share/${encodeURIComponent(codigoNorm)}`);
    if (res.status === 404) {
      return modalImportarPlaylistErro(wrap, 'Código não encontrado ou expirado.', codigoNorm);
    }
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    data = await res.json();
  } catch (err) {
    return modalImportarPlaylistErro(
      wrap,
      `Não foi possível buscar a playlist: ${err.message || 'Falha de rede'}`,
      codigoNorm
    );
  }

  if (!Array.isArray(data.musicas) || !data.musicas.length) {
    return modalImportarPlaylistErro(wrap, 'Código inválido — sem músicas.', codigoNorm);
  }

  /* Não há guard de Servidor aqui, e não havia razão para o haver: este fluxo lê do
     serviço de partilha na nuvem (`CLOUD_SHARE_URL`) e escreve no banco desta máquina
     (`getControllerApiBase`, :3001). O Servidor de projeção não participa em nenhum dos
     dois lados. Exigir ligação a ele bloqueava a importação no modo local — e também em
     modo remoto antes de conectar — sem nada em troca. */

  const cultoIdCodigo = String(data.cultoId || '').trim();
  const cultoNomeCodigo = String(data.cultoNome || data.cultoLabel || '').trim();

  const elegiveis = data.musicas.filter(
    (m) => m.titulo && Array.isArray(m.estrofes) && m.estrofes.length
  );
  if (!elegiveis.length) {
    return modalImportarPlaylistErro(wrap, 'Código inválido — nenhuma música com letra.', codigoNorm);
  }

  // Confirmação ANTES de qualquer escrita: o usuário vê o que veio no código,
  // quais já existem no banco, e escolhe o culto de destino. Até aqui nada é
  // gravado e o culto ainda não foi criado.
  modalImportarPlaylistLoading(wrap, 'Analisando músicas recebidas...');
  const jaExistem = await checarQuaisMusicasJaExistem(elegiveis);

  modalImportarPlaylistLoading(wrap, 'Aguardando confirmação...');
  const confirmacao = await abrirJanelaConfirmarImport({
    musicas: elegiveis,
    jaExistem,
    cultoIdCodigo,
    cultoNomeCodigo,
  });

  if (!confirmacao.confirmado) {
    fecharAppDialog(false);
    return;
  }

  const cultoDestino = String(confirmacao.cultoId || '').trim();
  if (!cultoDestino) {
    return modalImportarPlaylistErro(wrap, 'Selecione um culto de destino.', codigoNorm);
  }

  modalImportarPlaylistLoading(wrap, 'Importando playlist...');

  // Só agora o culto é criado (se for novo, vindo do código) e ativado na UI.
  if (!idsCultosJaNaLista().has(cultoDestino)) {
    garantirCultoDisponivelParaImportacaoCodigo(
      cultoDestino,
      confirmacao.cultoLabel || cultoNomeCodigo
    );
  }
  ativarCultoNaUiParaImportacaoCodigo(cultoDestino);

  let importadas = 0;
  let copiasImportadas = 0;
  let substituidas = 0;
  let mantidas = 0;
  let cancelada = false;
  // Decisão memorizada por «Aplicar aos demais conflitos» (null = perguntar sempre).
  let decisaoParaTodos = null;

  for (let i = 0; i < elegiveis.length; i++) {
    const m = elegiveis[i];

    try {
      // 1.ª chamada: só detecta. Nada é gravado enquanto houver conflito em aberto.
      let { res: res2, data: nova } = await postImportarMusicaDoCodigo(m, 'perguntar');

      if (res2.status === 409 && nova.duplicado) {
        let decisao = decisaoParaTodos;
        if (!decisao) {
          modalImportarPlaylistLoading(wrap, 'Aguardando decisão sobre o conflito...');
          const escolha = await abrirJanelaConflitoImport({
            atual: nova.existente || {},
            recebida: m,
            indice: i + 1,
            total: elegiveis.length,
            restantes: elegiveis.length - (i + 1),
          });
          decisao = escolha.acao;
          if (escolha.aplicarATodos && decisao !== 'cancelar') decisaoParaTodos = decisao;
          modalImportarPlaylistLoading(wrap, 'Importando playlist...');
        }

        if (decisao === 'cancelar') {
          cancelada = true;
          break;
        }

        if (decisao === 'manter') {
          // Não grava nada: a playlist passa a apontar para a música já existente.
          const idExistente = Number(nova.existente?.id);
          if (Number.isFinite(idExistente) && idExistente > 0) {
            addMusicaNaPlaylistParaCulto(cultoDestino, {
              id: Number(nova.existente.rootId || idExistente),
              titulo: nova.existente.titulo || m.titulo,
              artista: nova.existente.artista || m.artista || '',
              bancoFonte: 'user',
            });
            importadas++;
            mantidas++;
          }
          continue;
        }

        // 2.ª chamada: agora sim grava, conforme a decisão do usuário.
        ({ res: res2, data: nova } = await postImportarMusicaDoCodigo(
          m,
          decisao === 'substituir' ? 'substituir' : 'criar'
        ));
      }

      if (!res2.ok) continue;
      const rootId = nova.copyImportada ? Number(nova.rootId) : Number(nova.id);
      // Rótulo de origem enviado no payload (ex.: 'CÓPIA'). Compat.: se o app
      // de origem não enviou, fica vazio e o item segue sem tag como hoje.
      const rotuloOrigem = String(m.rotulo || '').trim();
      addMusicaNaPlaylistParaCulto(cultoDestino, {
        id: rootId,
        titulo: m.titulo,
        artista: m.artista || '',
        bancoFonte: 'user',
        ...(nova.copyImportada
          ? { versaoLocalId: String(nova.id), versaoRotulo: 'CÓPIA/IMPORTADA' }
          : rotuloOrigem
            ? { versaoRotulo: rotuloOrigem }
            : {}),
      });
      importadas++;
      if (nova.copyImportada) copiasImportadas++;
      if (nova.substituida) substituidas++;
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  savePlaylists();
  renderSeletorTemasPlaylist();
  renderPlaylist();
  // `carregarMusicas` não usa IP — o banco é sempre o :3001 desta máquina.
  // Um ReferenceError antigo em `ip` (variável inexistente aqui) impedia o
  // modal de sucesso depois da playlist já ter sido renderizada.
  try {
    await carregarMusicas();
  } catch (_) {
    // intencional — playlist já gravada; só falhou o refresh da lista do banco
  }

  if (!importadas) {
    return modalImportarPlaylistErro(
      wrap,
      cancelada
        ? 'Importação cancelada. Nada foi gravado no banco.'
        : 'Nenhuma música pôde ser importada. Tente novamente.',
      codigoNorm
    );
  }

  const itemCulto = listarCultosDisponiveis(dataRefDoCultoImportado(cultoDestino)).find(
    (c) => c.id === cultoDestino
  );
  const nomeCulto = itemCulto
    ? parseLabelCulto(itemCulto.label).data + ' — ' + parseLabelCulto(itemCulto.label).desc
    : cultoDestino;
  let msg = cancelada
    ? `Importação interrompida.\n${importadas} música(s) já tinham sido adicionada(s) a ${nomeCulto}.`
    : `Playlist importada para ${nomeCulto}!\n${importadas} música(s) adicionada(s) à playlist.`;

  const detalhes = [];
  if (substituidas > 0) detalhes.push(`${substituidas} substituída(s) pela versão recebida`);
  if (mantidas > 0) detalhes.push(`${mantidas} mantida(s) como já estavam no banco`);
  if (copiasImportadas > 0) detalhes.push(`${copiasImportadas} duplicada(s) como «CÓPIA/IMPORTADA»`);
  if (detalhes.length) msg += `\n\nConflitos resolvidos: ${detalhes.join('; ')}.`;

  // Caso simples auto-fecha; havendo conflitos resolvidos, exige fechar manual.
  modalImportarPlaylistSucesso(wrap, msg, detalhes.length === 0 && !cancelada);
}

function excluirTemaDoCulto(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t) return;
  if (t === TEMA_PADRAO_ABERTURA && cultoId) marcarAberturaRemovidaPeloUsuario(cultoId);
  temasPorCulto['__global__'] = getTemasDoCultoAtual().filter((x) => x !== t);
  saveTemasPorCulto();
  // Remove da playlist do culto atual
  if (cultoId) {
    const pl = getPlaylist(cultoId);
    const filtrado = playlistPossuiMarcadoresTema(pl)
      ? filtrarPlaylistRemovendoTemaComMarcadores(pl, t)
      : pl.filter((it) => normalizarTemaPlaylist(it.tema) !== t);
    playlists[cultoId] = filtrado;
    if (getTemaSelecionadoAtual() === t) setTemaSelecionadoAtual('');
    savePlaylists();
    const plDepois = getPlaylist(cultoId);
    const aindaNaLista =
      !!musicaAtiva &&
      plDepois.some((it) => !ehMarcadorTemaPlaylist(it) && playlistItemMesmaVersaoQueAtiva(it));
    if (musicaAtiva && !aindaNaLista) encerrarProjecaoDoControlador({ limparMusica: true });
  }
}

function getTemaSelecionadoAtual() {
  if (!cultoId) return '';
  return normalizarTemaPlaylist(temaSelecionadoPorCulto[cultoId] || '');
}

function setTemaSelecionadoAtual(v) {
  if (!cultoId) return;
  const t = normalizarTemaPlaylist(v);
  temaSelecionadoPorCulto[cultoId] = t;
  saveTemaSelecionadoPorCulto();
}

function aplicarSelecaoTemaNaUi(valor) {
  const sel = document.getElementById('playlist-tema-sel');
  const menu = document.getElementById('playlist-tema-dd-menu');
  const label = document.getElementById('playlist-tema-dd-label');
  if (!sel || !menu || !label) return;
  const v = valor || '';
  sel.value = v;
  const itens = menu.querySelectorAll('.playlist-tema-dd-item');
  let textoSelecionado = '';
  itens.forEach((b) => {
    const ehPlaceholder = b.dataset.value === '';
    const selecionado = b.dataset.value === v;
    // O placeholder nunca ganha o destaque de "selecionado": evita repetir visualmente o mesmo
    // texto do botão fechado já realçado como se fosse um item escolhido (efeito de "duplicado").
    b.setAttribute('aria-selected', selecionado && !ehPlaceholder ? 'true' : 'false');
    if (selecionado) textoSelecionado = b.textContent;
  });
  // Fallback do botão fechado: usa o placeholder guardado (ele pode não existir mais como item da lista).
  if (!textoSelecionado) textoSelecionado = menu.dataset.placeholder || (itens[0] ? itens[0].textContent : '');
  label.textContent = textoSelecionado;
}

function fecharDropdownTemaPlaylist() {
  const wrap = document.getElementById('playlist-tema-dd');
  const menu = document.getElementById('playlist-tema-dd-menu');
  const btn = document.getElementById('playlist-tema-dd-btn');
  if (wrap) wrap.classList.remove('open');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function setupDropdownTemaPlaylist() {
  const wrap = document.getElementById('playlist-tema-dd');
  const btn = document.getElementById('playlist-tema-dd-btn');
  const menu = document.getElementById('playlist-tema-dd-menu');
  if (!wrap || !btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abrir = menu.hidden;
    fecharDropdownTemaPlaylist();
    if (abrir) {
      wrap.classList.add('open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    }
  });
  document.addEventListener('click', fecharDropdownTemaPlaylist);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharDropdownTemaPlaylist();
  });
}

function renderSeletorTemasPlaylist() {
  const sel = document.getElementById('playlist-tema-sel');
  const menu = document.getElementById('playlist-tema-dd-menu');
  const label = document.getElementById('playlist-tema-dd-label');
  if (!sel || !menu || !label) return;
  const pl = cultoId ? getPlaylist(cultoId) : [];
  const temasDaPlaylist = [
    ...new Set(
      pl.flatMap((x) => {
        if (ehMarcadorTemaPlaylist(x)) {
          const tm = normalizarTemaPlaylist(x.tema);
          return tm ? [tm] : [];
        }
        const tm = normalizarTemaPlaylist(x?.tema);
        return tm ? [tm] : [];
      })
    ),
  ];
  /* Só acrescenta à lista guardada temas vindos da playlist; não substituir o catálogo pelo merge
   * (substituir apagava temas criados com «+ TEMA» que ainda não tinham música na playlist). */
  if (cultoId) {
    const base = normalizarListaTemas([...(temasPorCulto[cultoId] || [])]);
    const seen = new Set(base);
    let mudou = false;
    temasDaPlaylist.forEach((t) => {
      if (t && !seen.has(t)) {
        base.push(t);
        seen.add(t);
        mudou = true;
      }
    });
    if (mudou) {
      temasPorCulto[cultoId] = ordenarTemasLista(normalizarListaTemas(base));
      saveTemasPorCulto();
    }
  }
  const temasDoCatalogoDepois = getTemasDoCultoAtual();
  const temas = ordenarTemasLista(normalizarListaTemas([...temasDoCatalogoDepois, ...temasDaPlaylist]));
  let atualAplicado = getTemaSelecionadoAtual();
  if (atualAplicado && !temas.includes(atualAplicado)) {
    setTemaSelecionadoAtual('');
    atualAplicado = '';
  }
  /** O que o usuário acabou de escolher no menu (não o tema já ativado com «Inserir na playlist»). */
  const escolhaNaUi = normalizarTemaPlaylist(sel.value);
  const preferido =
    escolhaNaUi && temas.includes(escolhaNaUi)
      ? escolhaNaUi
      : atualAplicado && temas.includes(atualAplicado)
        ? atualAplicado
        : '';
  const textoPlaceholder = temas.length ? 'Selecione o tema…' : 'Use + Tema para criar';
  // Guarda o texto do placeholder para o botão fechado, sem depender de ele existir como item da lista.
  menu.dataset.placeholder = textoPlaceholder;
  menu.innerHTML = '';
  // O placeholder só entra na lista quando há um tema selecionado (aí serve como "limpar seleção").
  // Quando nada está selecionado, ele já é o valor exibido no botão fechado — não repetir na lista.
  if (preferido) {
    const liPh = document.createElement('li');
    liPh.setAttribute('role', 'presentation');
    const btnPh = document.createElement('button');
    btnPh.type = 'button';
    btnPh.className = 'playlist-tema-dd-item';
    btnPh.dataset.value = '';
    btnPh.textContent = textoPlaceholder;
    liPh.appendChild(btnPh);
    menu.appendChild(liPh);
  }
  temas.forEach((t) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'playlist-tema-dd-item';
    b.dataset.value = t;
    b.textContent = t;
    li.appendChild(b);
    menu.appendChild(li);
  });
  menu.querySelectorAll('.playlist-tema-dd-item').forEach((b) => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      aplicarSelecaoTemaNaUi(b.dataset.value || '');
      fecharDropdownTemaPlaylist();
    });
  });
  aplicarSelecaoTemaNaUi(preferido || '');
}

let enviarPlaylistsServidorTimer = null;
let persistirMetaSyncLocalTimer = null;
let persistenciaMetaSyncPendente = {
  incluirPlaylists: false,
  preservarUpdatedAt: false,
};
let sharedBancoLocalUpdatedAt = '';
let pedidoSyncBancoEmAberto = false;

function snapshotMetaCompartilhadaAtual({ incluirPlaylists = true, preservarUpdatedAt = false } = {}) {
  const payload = {
    cultosManuais: Array.isArray(cultosManuaisCache) ? cultosManuaisCache : [],
    temasPorCulto: temasPorCulto && typeof temasPorCulto === 'object' ? temasPorCulto : {},
    aberturaRemovidaPorCulto:
      aberturaRemovidaPorCulto && typeof aberturaRemovidaPorCulto === 'object' ? aberturaRemovidaPorCulto : {},
  };
  if (incluirPlaylists) payload.playlists = playlists && typeof playlists === 'object' ? playlists : {};
  if (!preservarUpdatedAt && sharedBancoLocalUpdatedAt) payload.updatedAt = sharedBancoLocalUpdatedAt;
  return payload;
}

async function persistirMetaCompartilhadaLocal({ incluirPlaylists = false, preservarUpdatedAt = false } = {}) {
  try {
    const res = await fetch(`${getControllerApiBase()}/api/sync/banco/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshotMetaCompartilhadaAtual({ incluirPlaylists, preservarUpdatedAt })),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    if (data?.updatedAt) sharedBancoLocalUpdatedAt = String(data.updatedAt);
    return true;
  } catch (_) {
    return false;
  }
}

function enfileirarPersistenciaMetaCompartilhadaLocal({ incluirPlaylists = false, preservarUpdatedAt = false } = {}) {
  persistenciaMetaSyncPendente.incluirPlaylists = persistenciaMetaSyncPendente.incluirPlaylists || incluirPlaylists;
  persistenciaMetaSyncPendente.preservarUpdatedAt =
    persistenciaMetaSyncPendente.preservarUpdatedAt || preservarUpdatedAt;
  clearTimeout(persistirMetaSyncLocalTimer);
  persistirMetaSyncLocalTimer = setTimeout(() => {
    const opts = { ...persistenciaMetaSyncPendente };
    persistenciaMetaSyncPendente = { incluirPlaylists: false, preservarUpdatedAt: false };
    persistirMetaCompartilhadaLocal(opts).catch(() => {});
  }, 220);
}

async function obterSnapshotCompartilhadoLocal() {
  const res = await fetch(`${getControllerApiBase()}/api/sync/banco/local`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function obterSnapshotCompartilhadoServidor(ipAtual = getServidorProjeccaoIp()) {
  const ip = String(ipAtual || '').trim();
  if (!ip) return null;
  const res = await fetch(`http://${ip}:5510/api/sync/banco`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function enviarSnapshotCompartilhadoParaServidor(snapshot, ipAtual = getServidorProjeccaoIp()) {
  const ip = String(ipAtual || '').trim();
  if (!ip) return null;
  const res = await fetch(`http://${ip}:5510/api/sync/banco`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot || {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function aplicarSnapshotCompartilhadoNoControladorLocal(snapshot) {
  const res = await fetch(`${getControllerApiBase()}/api/sync/banco/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot || {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data?.snapshot || null;
}

async function aplicarSnapshotCompartilhadoNoRenderer(snapshot, opts = {}) {
  const src = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : null;
  if (!src) return;

  sharedBancoLocalUpdatedAt = String(src.updatedAt || '').trim();
  playlists = src.playlists && typeof src.playlists === 'object' && !Array.isArray(src.playlists) ? src.playlists : {};
  cultosManuaisCache = Array.isArray(src.cultosManuais) ? src.cultosManuais : [];
  temasPorCulto =
    src.temasPorCulto && typeof src.temasPorCulto === 'object' && !Array.isArray(src.temasPorCulto)
      ? src.temasPorCulto
      : {};
  aberturaRemovidaPorCulto =
    src.aberturaRemovidaPorCulto &&
    typeof src.aberturaRemovidaPorCulto === 'object' &&
    !Array.isArray(src.aberturaRemovidaPorCulto)
      ? src.aberturaRemovidaPorCulto
      : {};

  try { localStorage.setItem(LS_PLAYLISTS, JSON.stringify(playlists)); } catch (_) {
    // intencional — erro ignorado
  }
  try { localStorage.setItem(LS_CULTOS_MANUAIS, JSON.stringify(cultosManuaisCache || [])); } catch (_) {
    // intencional — erro ignorado
  }
  try { localStorage.setItem(LS_PLAYLIST_TEMAS, JSON.stringify(temasPorCulto || {})); } catch (_) {
    // intencional — erro ignorado
  }
  try {
    localStorage.setItem(LS_PLAYLIST_ABERTURA_REMOVIDA, JSON.stringify(aberturaRemovidaPorCulto || {}));
  } catch (_) {
    // intencional — erro ignorado
  }

  initCultoSelect();
  renderSeletorTemasPlaylist();
  onCultoChange();
  emitirPlaylistsDoControlador();

  try {
    await carregarMusicas();
    refreshListaBanco();
  } catch (_) {
    // intencional — erro ignorado
  }

  if (opts.forcarRepintura !== false) {
    forcarRepinturaCompositorLyra();
    setTimeout(() => forcarRepinturaCompositorLyra(), 80);
  }
}

function marcarBancoCompartilhadoAlterado(updatedAt = new Date().toISOString(), opts = {}) {
  sharedBancoLocalUpdatedAt = String(updatedAt || '').trim() || new Date().toISOString();
  enfileirarPersistenciaMetaCompartilhadaLocal({ incluirPlaylists: opts.incluirPlaylists === true });
}

async function importarBancoCompartilhadoDoServidor(ipAtual = getServidorProjeccaoIp()) {
  const remoto = await obterSnapshotCompartilhadoServidor(ipAtual);
  if (!remoto || typeof remoto !== 'object') throw new Error('Snapshot do servidor indisponível.');
  const aplicado = await aplicarSnapshotCompartilhadoNoControladorLocal(remoto);
  if (aplicado) await aplicarSnapshotCompartilhadoNoRenderer(aplicado);
  return aplicado || remoto;
}

let modalSincronizarTimerAutoFechar = null;

/** Abre o modal (mesmo app-dialog dos fluxos C/I) no estado de carregamento. */
function abrirModalSincronizarBanco() {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel) return null;
  clearTimeout(modalSincronizarTimerAutoFechar);
  head.textContent = 'Sincronizar banco';
  ok.style.display = 'none';
  cancel.style.display = 'none';
  body.style.whiteSpace = 'normal';
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'share-modal';
  const loading = document.createElement('div');
  loading.className = 'share-modal-loading';
  const spin = document.createElement('div');
  spin.className = 'share-modal-spinner';
  spin.setAttribute('aria-hidden', 'true');
  const txt = document.createElement('div');
  txt.className = 'share-modal-loading-text';
  txt.textContent = 'Sincronizando...';
  loading.appendChild(spin);
  loading.appendChild(txt);
  wrap.appendChild(loading);
  body.appendChild(wrap);
  ov.hidden = false;
  ov.classList.add('aberto');
  // Marca o modal como ativo p/ que Escape e clique no backdrop façam a limpeza correta.
  appSincronizarResolver = () => {};
  return wrap;
}

/** Estado de sucesso (verde) — banco enviado e outros PCs notificados. */
function modalSincronizarSucesso(wrap, msg) {
  // Se o usuário já fechou o modal durante o loading, não mexe nos botões compartilhados.
  if (!appSincronizarResolver) return;
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (wrap) {
    wrap.innerHTML = '';
    const s = document.createElement('div');
    s.className = 'share-modal-sucesso';
    s.textContent = String(msg || 'Banco enviado.');
    wrap.appendChild(s);
  }
  if (ok) ok.style.display = 'none';
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
  clearTimeout(modalSincronizarTimerAutoFechar);
  modalSincronizarTimerAutoFechar = setTimeout(() => {
    if (appSincronizarResolver) fecharAppDialog(false);
  }, 2600);
}

/** Estado de aviso (amarelo) — não é sucesso; envio sem destinatário/pré-condição. */
function modalSincronizarAviso(wrap, msg) {
  if (!appSincronizarResolver) return;
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  clearTimeout(modalSincronizarTimerAutoFechar);
  if (wrap) {
    wrap.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'share-modal-aviso';
    const icone = document.createElement('div');
    icone.className = 'share-modal-aviso-icone';
    icone.setAttribute('aria-hidden', 'true');
    icone.textContent = '⚠';
    const t = document.createElement('div');
    t.textContent = String(msg || 'Sincronização sem efeito.');
    box.appendChild(icone);
    box.appendChild(t);
    wrap.appendChild(box);
  }
  if (ok) ok.style.display = 'none';
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
}

/** Estado de erro (vermelho) — falha ao enviar o banco. */
function modalSincronizarErro(wrap, msg) {
  if (!appSincronizarResolver) return;
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  clearTimeout(modalSincronizarTimerAutoFechar);
  if (wrap) {
    wrap.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'share-modal-erro';
    err.textContent = String(msg || 'Não foi possível enviar o banco ao servidor.');
    wrap.appendChild(err);
  }
  if (ok) ok.style.display = 'none';
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
}

/** Emite o pedido de sincronização e resolve com o nº de controladores notificados.
 *  Usa ack do servidor (com timeout); clientes/servidores antigos resolvem 0. */
function emitirSolicitacaoSincronizacaoBanco(payload) {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) return resolve(0);
    let resolvido = false;
    const done = (n) => {
      if (resolvido) return;
      resolvido = true;
      resolve(Number(n) || 0);
    };
    try {
      socket.timeout(4000).emit('solicitar_sincronizacao_banco', payload, (err, resposta) => {
        if (err) return done(0);
        done(resposta && typeof resposta.notificados === 'number' ? resposta.notificados : 0);
      });
    } catch (_) {
      done(0);
    }
  });
}

async function solicitarSincronizacaoManualBanco() {
  const wrap = abrirModalSincronizarBanco();
  /* `getServidorIp` e não `hostProjecao`, de propósito: sincronizar o banco é serviço do
     Servidor e não tem equivalente local (ver docs/architecture/projection-core.md §12.8).
     Apontar para `127.0.0.1` no modo local mandaria o snapshot para o próprio Controlador. */
  const ip = getServidorIp();
  // Caso 1 — sem conexão: mostrado como aviso dentro do mesmo modal.
  if (!ip || !socket || !socket.connected) {
    modalSincronizarAviso(
      wrap,
      'A sincronização do banco acontece através do Servidor, e este Controlador não está ligado a nenhum. ' +
        'Conecte-se a um servidor remoto em Ajustes › Conexão e tente de novo.'
    );
    return;
  }

  try {
    sharedBancoLocalUpdatedAt = new Date().toISOString();
    await persistirMetaCompartilhadaLocal({ incluirPlaylists: true, preservarUpdatedAt: false });
    const local = await obterSnapshotCompartilhadoLocal();
    const resposta = await enviarSnapshotCompartilhadoParaServidor(local, ip);
    if (resposta?.snapshot?.updatedAt) sharedBancoLocalUpdatedAt = String(resposta.snapshot.updatedAt);
    const notificados = await emitirSolicitacaoSincronizacaoBanco({
      updatedAt: resposta?.snapshot?.updatedAt || local?.updatedAt || '',
    });
    if (notificados > 0) {
      // Caso 2 — sucesso real: havia outros controladores para receber.
      modalSincronizarSucesso(
        wrap,
        'Banco enviado. Os outros PCs foram notificados para aceitar a sincronização.'
      );
    } else {
      // Caso 3 — aviso: envio ao servidor sem destinatário, sem efeito prático.
      modalSincronizarAviso(wrap, 'Nenhum controlador conectado para receber a sincronização agora.');
    }
  } catch (e) {
    // Caso 4 — erro: mantém a mensagem de falha original, agora dentro do modal.
    modalSincronizarErro(wrap, e?.message || 'Não foi possível enviar o banco ao servidor.');
  }
}

async function tratarPedidoSincronizacaoBanco(payload) {
  if (pedidoSyncBancoEmAberto) return;
  pedidoSyncBancoEmAberto = true;
  try {
    const origem = String(payload?.origem || 'desconhecido').trim() || 'desconhecido';
    const escolha = await appEscolherOpcao(
      'Sincronizar banco',
      [{ label: 'Aceitar', value: 'aceitar' }],
      `PC ${origem} deseja sincronizar o banco de dados. Aceitar?`,
      { cancelLabel: 'Recusar' }
    );
    if (escolha !== 'aceitar') return;
    await importarBancoCompartilhadoDoServidor(getServidorProjeccaoIp());
  } catch (e) {
    await appAlert(e?.message || 'Não foi possível importar o banco do servidor.', 'Sincronizar banco');
  } finally {
    pedidoSyncBancoEmAberto = false;
  }
}

async function enviarPlaylistsParaServidor() {
  /* Escreve no `/api/playlists` desta máquina (:3001), que é de onde o celular as lê —
     inclusive no modo local, via `solicitar_playlists_controlador`. Com o guard preso a
     `getServidorIp`, uma instalação sem IP gravado nunca publicava a playlist e o celular
     ficava a ver uma lista vazia. */
  const hostAtual = hostProjecao();
  if (!hostAtual) return;
  try {
    await fetch(`${getControllerApiBase()}/api/playlists`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playlists),
    });
  } catch (_) {
  // intencional — erro ignorado
}
}

function enviarPlaylistsParaServidorDebounced() {
  clearTimeout(enviarPlaylistsServidorTimer);
  enviarPlaylistsServidorTimer = setTimeout(() => enviarPlaylistsParaServidor(), 450);
}

let emitirPlaylistsRedeTimer = null;

/**
 * Publica as playlists para quem estiver a hospedar a porta 5510.
 *
 * Vai pela porta de projeção, e não pelo socket cru, porque o destinatário muda com o
 * modo: no remoto é o Servidor, que reencaminha aos telemóveis; no local é o próprio
 * processo principal, que faz o mesmo reencaminhamento. O celular não nota diferença — é
 * o mesmo evento com o mesmo formato.
 */
function emitirPlaylistsDoControlador() {
  try {
    projecao.enviar('controlador_playlists', playlists);
  } catch (_) {
  // intencional — erro ignorado
}
}

function emitirPlaylistsDoControladorDebounced() {
  clearTimeout(emitirPlaylistsRedeTimer);
  emitirPlaylistsRedeTimer = setTimeout(() => emitirPlaylistsDoControlador(), 280);
}

function savePlaylists() {
  localStorage.setItem(LS_PLAYLISTS, JSON.stringify(playlists));
  enviarPlaylistsParaServidorDebounced();
  emitirPlaylistsDoControladorDebounced();
  marcarBancoCompartilhadoAlterado(new Date().toISOString(), { incluirPlaylists: true });
}

/** Remove um id de todas as playlists guardadas (ex.: música apagada no servidor). */
function removerMusicaDeTodasPlaylists(idMusica) {
  const idNum = Number(idMusica);
  if (!Number.isFinite(idNum)) return;
  let mudou = false;
  Object.keys(playlists).forEach((cid) => {
    const pl = playlists[cid];
    if (!Array.isArray(pl)) return;
    const novo = pl.filter((it) => Number(it.id) !== idNum);
    if (novo.length !== pl.length) {
      playlists[cid] = novo;
      mudou = true;
    }
  });
  if (mudou) savePlaylists();
}

/** Quando uma cópia local é apagada, entradas da playlist que a usavam passam a referenciar o original. */
function removerVersaoLocalDasPlaylists(idMusica, copiaId) {
  const idStr = String(Number(idMusica));
  const vid = String(copiaId);
  let mudou = false;
  Object.keys(playlists).forEach((cid) => {
    const pl = playlists[cid];
    if (!Array.isArray(pl)) return;
    pl.forEach((it) => {
      if (!it || ehMarcadorTemaPlaylist(it)) return;
      if (String(it.id) !== idStr) return;
      if (it.versaoLocalId && String(it.versaoLocalId) === vid) {
        it.versaoLocalId = null;
        it.versaoRotulo = '';
        mudou = true;
      }
    });
  });
  if (mudou) savePlaylists();
}

/**
 * Edição rápida no modo slides: o servidor não altera originais imutáveis — cria um fork.
 * Sem repontar a entrada da playlist do dia para o fork, ao voltar ao modo slides
 * recarregava-se o original (a edição só existia no estado da sessão).
 *
 * Reaponta apenas as entradas do culto indicado que correspondiam à versão editada;
 * o `id` da entrada continua a ser o root (identidade da música na playlist), muda só
 * `versaoLocalId`/`versaoRotulo`. Não mexe em ordem, nem adiciona/remove entradas.
 *
 * @param {string} cid culto (dia) cuja playlist deve ser repontada
 * @param {number} rootId root da família de versões
 * @param {string} versaoAntes versão ativa antes de gravar ('' = original do servidor)
 * @param {number|string} novaVersaoId id do fork criado pelo servidor
 * @param {string} [novoRotulo] rótulo do fork, para o cache visual da linha
 * @returns {boolean} true se alguma entrada foi repontada
 */
function repontarVersaoNaPlaylistDoCulto(cid, rootId, versaoAntes, novaVersaoId, novoRotulo) {
  const root = Number(rootId);
  const novoVid = novaVersaoId != null && String(novaVersaoId).trim() ? String(novaVersaoId).trim() : '';
  if (!cid || !Number.isFinite(root) || !novoVid) return false;
  const pl = playlists[cid];
  if (!Array.isArray(pl)) return false;

  const antes = versaoAntes ? String(versaoAntes).trim() : '';
  const rotulo = String(novoRotulo || '').trim();
  let mudou = false;

  pl.forEach((it) => {
    if (!it || ehMarcadorTemaPlaylist(it)) return;
    /* Catálogo é somente leitura: nunca chega aqui, mas não repontar por segurança. */
    if (it.bancoFonte === 'catalog') return;
    if (Number(it.id) !== root) return;
    const vidItem = it.versaoLocalId ? String(it.versaoLocalId).trim() : '';
    if (vidItem !== antes) return;
    if (vidItem === novoVid) return;
    it.versaoLocalId = novoVid;
    it.versaoRotulo = rotulo;
    mudou = true;
  });

  if (mudou) savePlaylists();
  return mudou;
}

/** Atualiza o rótulo em cache das entradas de playlist que apontam para esta versão. */
function atualizarRotuloVersaoNasPlaylists(idMusica, versaoId, novoRotulo) {
  const idStr = String(Number(idMusica));
  const vid = String(versaoId);
  const rotulo = String(novoRotulo || '').trim();
  let mudou = false;
  Object.keys(playlists).forEach((cid) => {
    const pl = playlists[cid];
    if (!Array.isArray(pl)) return;
    pl.forEach((it) => {
      if (!it || ehMarcadorTemaPlaylist(it)) return;
      if (String(it.id) !== idStr) return;
      if (it.versaoLocalId && String(it.versaoLocalId) === vid) {
        it.versaoRotulo = rotulo;
        mudou = true;
      }
    });
  });
  if (mudou) savePlaylists();
}

let musicaExcluirPendente = null;

function fecharModalExcluirMusica() {
  musicaExcluirPendente = null;
  document
    .querySelectorAll('.btn-banco-remover.confirmando')
    .forEach((b) => b.classList.remove('confirmando'));
  const bd = document.getElementById('musica-excluir-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
}

function solicitarRemoverMusicaDoBancoServidor(idMusica, tituloDisplay) {
  const idNum = Number(idMusica);
  if (!Number.isFinite(idNum)) return alert('ID da música inválido.');
  musicaExcluirPendente = { id: idNum, titulo: tituloDisplay || '' };
  const bd = document.getElementById('musica-excluir-backdrop');
  const nomeEl = document.getElementById('musica-excluir-nome');
  if (nomeEl) nomeEl.textContent = musicaExcluirPendente.titulo || `ID ${idNum}`;
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
}

function configurarModalExcluirMusica() {
  document.getElementById('musica-excluir-cancel')?.addEventListener('click', () => fecharModalExcluirMusica());
  document.getElementById('musica-excluir-backdrop')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'musica-excluir-backdrop') fecharModalExcluirMusica();
  });
  document.getElementById('musica-excluir-confirm')?.addEventListener('click', () => executarRemoverMusicaDoBancoConfirmado());
}

async function executarRemoverMusicaDoBancoConfirmado() {
  if (!musicaExcluirPendente) return fecharModalExcluirMusica();
  const idNum = musicaExcluirPendente.id;
  fecharModalExcluirMusica();
  try {
    let res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/excluir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const tentouFallbackDelete = res.status === 404;
    if (tentouFallbackDelete) {
      /* Compatibilidade com servidor que expõe apenas DELETE /api/musicas/:id. */
      res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}`, {
        method: 'DELETE',
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404 && tentouFallbackDelete) {
        alert(
          'Não foi possível excluir a música (HTTP 404). Verifique se o Controlador está em execução (API local na porta 3001).'
        );
        return;
      }
      alert(data.erro || `Erro HTTP ${res.status}`);
      return;
    }
    const rootRemovido = Number(data.rootId) || idNum;
    removerMusicaDeTodasPlaylists(rootRemovido);
    removerCopiasLocaisDaMusica(rootRemovido);
    await carregarMusicas();
    const eraAtiva =
      musicaAtiva &&
      (Number(musicaAtiva.id) === idNum ||
        Number(musicaAtiva.id) === rootRemovido ||
        obterRootIdMusicaAtiva() === rootRemovido);
    if (eraAtiva) {
      musicaAtiva = null;
      musicaVersaoLocalId = null;
      musicaRootId = null;
      versoesMusicaServidorCache = { rootId: null, versoes: [] };
      musicaBancoFonte = 'user';
      renderMusicaVersoesBar();
      estrofeAtiva = -1;
      modoEdicaoEstrofes = false;
      snapshotEdicaoEstrofes = null;
      modoLetraCompletaCentral = false;
      aplicarLayoutModoLetraCompleta();
      projecaoMusicaEmitidaNoServidor = false;
      bloqueioSincronizarEstrofeDoServidor = false;
      slidesDockVisivel = ehModoSlidesOperador();
      renderEstrofesEditor();
      renderSlidesStrip();
      atualizarPreviewOperador();
      marcacaoEstrofeEditor();
    }
    renderPlaylist();
    refreshListaBanco();
  } catch (e) {
    alert(e.message || 'Falha ao remover.');
  }
}

function getPlaylist(cid) {
  if (!Array.isArray(playlists[cid])) playlists[cid] = [];
  playlists[cid] = playlists[cid].map((it) => {
    if (it && it.tipo === PLAYLIST_TIPO_MARCADOR_TEMA) {
      return { tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema: normalizarTemaPlaylist(it.tema) };
    }
    return {
      ...it,
      tema: normalizarTemaPlaylist(it?.tema),
      versaoLocalId:
        it.versaoLocalId !== undefined && it.versaoLocalId !== null && String(it.versaoLocalId).trim()
          ? String(it.versaoLocalId).trim()
          : null,
      versaoRotulo: String(it.versaoRotulo || '').trim(),
      bancoFonte: it.bancoFonte === 'catalog' ? 'catalog' : 'user',
    };
  });
  return playlists[cid];
}

function playlistItemMesmaVersaoQueAtiva(it) {
  if (!musicaAtiva || !it || ehMarcadorTemaPlaylist(it)) return false;
  const rootAtivo = obterRootIdMusicaAtiva();
  const itRoot = Number(it.id);
  if (!Number.isFinite(rootAtivo) || !Number.isFinite(itRoot) || itRoot !== rootAtivo) return false;
  const va = versaoAtivaParaCompararPlaylist();
  const vb = it.versaoLocalId ? String(it.versaoLocalId) : '';
  const itBf = it.bancoFonte === 'catalog' ? 'catalog' : 'user';
  const curBf = musicaBancoFonte === 'catalog' ? 'catalog' : 'user';
  return va === vb && itBf === curBf;
}

/** Índice da próxima música real na playlist (salta marcadores de tema). -1 se não houver. */
function indiceProximaMusicaNaPlaylist(pl, idxAtual) {
  const lista = Array.isArray(pl) ? pl : [];
  let j = Number(idxAtual) + 1;
  if (!Number.isFinite(j) || j < 1) j = 0;
  while (j < lista.length && ehMarcadorTemaPlaylist(lista[j])) j++;
  return j < lista.length ? j : -1;
}

/** Há música seguinte após a actualmente activa (para o botão «Avançar música»). */
function haProximaMusicaNaPlaylistAtiva() {
  if (!musicaAtiva) return false;
  const pl = getPlaylist(cultoId);
  const ix = pl.findIndex((it) => playlistItemMesmaVersaoQueAtiva(it));
  if (ix < 0) return false;
  return indiceProximaMusicaNaPlaylist(pl, ix) >= 0;
}

function atualizarEstadoBtnProximaMusicaPlaylist() {
  const btnNx = document.getElementById('btn-proxima-musica-playlist');
  if (!btnNx) return;
  btnNx.disabled = !projecao.pronta() || !haProximaMusicaNaPlaylistAtiva();
}

/**
 * `musicaAtiva` sobrevive à saída do modo slides (a Home mantém a música no editor),
 * mas a faixa de slides é rearmada do zero ao reentrar. Sem esta distinção, a linha
 * ficava destacada com a grade vazia e o primeiro clique caía no ramo «desmarcar»,
 * exigindo um segundo clique para os slides voltarem.
 *
 * No modo slides, só há seleção enquanto a faixa está de facto preenchida.
 */
function playlistSelecaoVisivelNoModoAtual() {
  if (!musicaAtiva) return false;
  if (!ehModoSlidesOperador()) return true;
  return faixaSlidesHabilitadaPorPlaylistNoModoSlides;
}

/**
 * Seleção como a UI a mostra — usar para o destaque da linha e para decidir o clique.
 * Para lógica funcional (próxima música, deduplicação da playlist) usar
 * `playlistItemMesmaVersaoQueAtiva`, que ignora o estado da faixa.
 */
function playlistItemSelecionadoNaUi(it) {
  return playlistSelecaoVisivelNoModoAtual() && playlistItemMesmaVersaoQueAtiva(it);
}

/** Segundo clique na mesma linha da playlist: desmarca (como ESC no modo slides). */
function deselecionarMusicaAtivaAPartirDaPlaylist() {
  if (ehModoSlidesOperador()) slidesRailUserRecolhido = true;
  encerrarProjecaoDoControlador({ limparMusica: true });
}

function initCultoSelect() {
  const hid = document.getElementById('culto-sel');
  const menu = document.getElementById('culto-dd-menu');
  if (!hid || !menu) return;
  menu.innerHTML = '';
  const lista = listarCultosDisponiveis();
  cultosDoMesCache = [...lista];
  const mkItem = (value, label, ehManual) => {
    const p = parseLabelCulto(label);
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    li.className = 'culto-dd-item-row';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'culto-dd-item';
    b.dataset.value = String(value || '');
    b.setAttribute('aria-selected', 'false');
    b.innerHTML = `<span class="data">${escapeHtml(p.data)}</span><span class="desc">${escapeHtml(p.desc)}</span>`;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setCultoSelecionadoNaUi(value);
      fecharCultoDropdown();
      onCultoChange();
    });
    li.appendChild(b);
    if (ehManual && value) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'culto-dd-item-del btn sm danger';
      del.title = 'Excluir culto manual e playlist';
      del.setAttribute('aria-label', 'Excluir culto manual');
      del.textContent = '✕';
      del.addEventListener('click', (ev) => solicitarExcluirCultoManual(ev, value));
      li.appendChild(del);
    }
    menu.appendChild(li);
  };
  mkItem('', 'Selecione o dia do culto...');
  if (!lista.length) {
    cultoId = '';
    setCultoSelecionadoNaUi('');
    return;
  }
  lista.forEach((c) => {
    mkItem(c.id, c.label, cultoIdEhManual(c.id));
  });
  cultoId = readLsMigrate(LS_CULTO, LS_CULTO_LEGACY);
  if (!lista.some((c) => c.id === cultoId)) {
    cultoId = '';
  }
  setCultoSelecionadoNaUi(cultoId);
}

function onCultoChange() {
  cultoId = document.getElementById('culto-sel')?.value || '';
  setCultoSelecionadoNaUi(cultoId);
  localStorage.setItem(LS_CULTO, cultoId);
  if (cultoId) {
    garantirAberturaNoCatalogoCulto(cultoId);
    if (garantirMarcadorAberturaNaPlaylist(cultoId)) savePlaylists();
  }
  renderSeletorTemasPlaylist();
  renderPlaylist();
}

/**
 * Rótulo posto pelo servidor ao bifurcar um original imutável (`ROTULO_COPIA_MODIFICADA`
 * em controller/src/db.js → «CÓPIA»). Como quase toda a entrada da playlist acaba por ser
 * uma cópia, repeti-lo em cada linha é ruído — só nomes dados pelo operador dizem algo.
 * Comparação insensível a maiúsculas e normalizada; aceita também o rótulo legado
 * «cópia/modificada» já gravado em bases antigas.
 */
const ROTULOS_VERSAO_AUTOMATICOS = new Set([
  'cópia'.normalize('NFC'),
  'cópia/modificada'.normalize('NFC'),
]);

/** '' quando o rótulo é o automático; caso contrário o nome escolhido pelo utilizador. */
function rotuloVersaoParaExibicaoNaPlaylist(rotulo) {
  const r = String(rotulo || '').trim();
  if (!r) return '';
  return ROTULOS_VERSAO_AUTOMATICOS.has(r.normalize('NFC').toLowerCase()) ? '' : r;
}

/** Sufixo « · NOME» da linha da playlist, já escapado (vazio se não houver nome próprio). */
function sufixoRotuloVersaoPlaylist(item) {
  const r = rotuloVersaoParaExibicaoNaPlaylist(item?.versaoRotulo);
  return r ? ` · ${escapeHtml(r)}` : '';
}

/* Última linha ativa já rolada para a vista — evita brigar com o scroll manual do operador. */
let ultimaLinhaAtivaRoladaNaPlaylist = null;

/**
 * Garante que a música ativa não fique cortada nas bordas da lista.
 * Só rola quando a linha ativa muda (troca de música), nunca a cada render.
 */
function garantirMusicaAtivaVisivelNaPlaylist() {
  const el = document.getElementById('playlist-list');
  const row = el ? el.querySelector('.playlist-row.ativo') : null;
  if (!row) {
    ultimaLinhaAtivaRoladaNaPlaylist = null;
    return;
  }
  const chave = row.dataset.plIdx || '';
  if (chave === ultimaLinhaAtivaRoladaNaPlaylist) return;
  ultimaLinhaAtivaRoladaNaPlaylist = chave;
  requestAnimationFrame(() => {
    if (!row.isConnected) return;
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

/** Ordem da playlist respeitando marcadores de tema (cabeçalhos mesmo sem música). */
function renderPlaylistItensComMarcadores(el, pl) {
  let i = 0;
  let songNum = 0;
  let songAppendParent = el;

  const appendSongRow = (item, idxPl) => {
    songNum++;
    const row = document.createElement('div');
    row.dataset.plIdx = String(idxPl);
    row.className = 'playlist-row' + (playlistItemSelecionadoNaUi(item) ? ' ativo' : '');
    const rotuloVersao = sufixoRotuloVersaoPlaylist(item);
    row.innerHTML = `
      <div class="playlist-row-top">
        <div class="tit">${songNum}. ${escapeHtml(item.titulo)}${rotuloVersao}</div>
        <div class="playlist-btns">
          <button class="btn sm" type="button" title="Subir">↑</button>
          <button class="btn sm" type="button" title="Descer">↓</button>
          <button class="btn sm danger" type="button" title="Remover">✕</button>
        </div>
      </div>
      ${item.artista ? `<div class="mini">${escapeHtml(item.artista)}</div>` : ''}
    `;
    const [bUp, bDn, bRm] = row.querySelectorAll('.playlist-btns button');
    bUp.onclick = (e) => {
      e.stopPropagation();
      movePlItem(idxPl, -1);
    };
    bDn.onclick = (e) => {
      e.stopPropagation();
      movePlItem(idxPl, 1);
    };
    bRm.onclick = (e) => {
      e.stopPropagation();
      removePlItem(idxPl);
    };
    row.addEventListener('click', (ev) => {
      if (ev.target.closest('.playlist-btns')) return;
      clearTimeout(playlistRowClickTimer);
      const idNum = Number(item.id);
      playlistRowClickTimer = setTimeout(() => {
        playlistRowClickTimer = null;
        /* Só desmarca o que a UI mostra como selecionado; com a faixa vazia, carrega. */
        if (playlistItemSelecionadoNaUi(item)) {
          deselecionarMusicaAtivaAPartirDaPlaylist();
          return;
        }
        selecionarMusicaDoBanco(idNum, {
          habilitarFaixaModoSlides: true,
          versaoLocalId: item.versaoLocalId || undefined,
          fonte: item.bancoFonte === 'catalog' ? 'catalog' : 'user',
        });
      }, 300);
    });
    row.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      clearTimeout(playlistRowClickTimer);
      playlistRowClickTimer = null;
      playlistDuploCliqueIniciarProjecao(item);
    });
    songAppendParent.appendChild(row);
  };

  if (pl.length && !ehMarcadorTemaPlaylist(pl[0])) {
    let j = 0;
    while (j < pl.length && !ehMarcadorTemaPlaylist(pl[j])) j++;
    const rotulo = normalizarTemaPlaylist(pl[0]?.tema) || 'Sem tema';
    songAppendParent = anexarCabecalhoTemaPlaylist(el, rotulo, null);
    for (let k = 0; k < j; k++) appendSongRow(pl[k], k);
    i = j;
  }

  while (i < pl.length) {
    const it = pl[i];
    if (ehMarcadorTemaPlaylist(it)) {
      songAppendParent = anexarCabecalhoTemaPlaylist(
        el,
        normalizarTemaPlaylist(it.tema) || 'Sem tema',
        i
      );
      i++;
      continue;
    }
    appendSongRow(it, i);
    i++;
  }
}

/** Gera a lista numerada só com o NOME das músicas da playlist atual (sem autor/tags). */
function gerarTextoNomesMusicasPlaylist() {
  if (!cultoId) return '';
  const pl = getPlaylist(cultoId) || [];
  const linhas = [];
  for (const it of pl) {
    if (ehMarcadorTemaPlaylist(it)) continue;
    const nome = String(it?.titulo ?? '').trim();
    if (!nome) continue;
    linhas.push(`${linhas.length + 1}. ${nome}`);
  }
  return linhas.join('\n');
}

const PLAYLIST_COPIAR_ICONE_COPY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const PLAYLIST_COPIAR_ICONE_CHECK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
let playlistCopiarFeedbackTimer = null;

/** Copia a lista de músicas para a área de transferência e dá micro-feedback (ícone → check). */
async function copiarNomesMusicasPlaylist() {
  const btn = document.getElementById('playlist-copiar-nomes-btn');
  const texto = gerarTextoNomesMusicasPlaylist();
  if (!texto) {
    appAlert('Nenhuma música na playlist para copiar.');
    return;
  }
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
      ok = true;
    }
  } catch (_) {
    // fallback abaixo
  }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {
      ok = false;
    }
  }
  if (!ok) {
    appAlert('Não foi possível copiar a lista de músicas.');
    return;
  }
  if (btn) {
    clearTimeout(playlistCopiarFeedbackTimer);
    btn.innerHTML = PLAYLIST_COPIAR_ICONE_CHECK;
    btn.classList.add('copiado');
    btn.title = 'Copiado!';
    playlistCopiarFeedbackTimer = setTimeout(() => {
      btn.innerHTML = PLAYLIST_COPIAR_ICONE_COPY;
      btn.classList.remove('copiado');
      btn.title = 'Copiar lista numerada das músicas (só o nome)';
      playlistCopiarFeedbackTimer = null;
    }, 1500);
  }
}

function renderPlaylist() {
  const el = document.getElementById('playlist-list');
  el.innerHTML = '';
  renderSeletorTemasPlaylist();
  if (!cultoId) {
    el.innerHTML = '<div class="placeholder-msg" style="margin:16px">🗓️ Selecione primeiro o <strong>dia do culto</strong> para ver ou montar a playlist.</div>';
    return;
  }
  const pl = getPlaylist(cultoId);
  if (!pl.length) {
    el.innerHTML = ehModoSlidesOperador()
      ? '<div class="placeholder-msg" style="margin:16px">📝 Nenhuma música neste culto.<br>Abra <strong>TELA INICIAL</strong> (topo) e, no <strong>banco de músicas à esquerda</strong>, toque em <strong>+</strong> em cada música para incluir na playlist.</div>'
      : '<div class="placeholder-msg" style="margin:16px">📝 Nenhuma música neste culto.<br>No banco de músicas <strong>à esquerda</strong>, toque em <strong>+</strong> na linha da música para adicionar ao culto.</div>';
    return;
  }

  if (playlistPossuiMarcadoresTema(pl)) {
    renderPlaylistItensComMarcadores(el, pl);
    garantirMusicaAtivaVisivelNaPlaylist();
    return;
  }

  /* Ordem linear = ordem real do array (subir/descer reflecte-se na lista).
     Secções por tema consecutivo, com seta para recolher/expandir. */
  let nLista = 0;
  let lastTemaChave = '\u0000';
  let songAppendParent = el;
  for (let idx = 0; idx < pl.length; idx++) {
    const item = pl[idx];
    if (ehMarcadorTemaPlaylist(item)) continue;
    nLista++;
    const temaNorm = normalizarTemaPlaylist(item?.tema) || '';
    const temaChave = temaNorm || '__SEM_TEMA__';
    if (temaChave !== lastTemaChave) {
      lastTemaChave = temaChave;
      const rotuloCab = temaNorm || 'Sem tema';
      songAppendParent = anexarCabecalhoTemaPlaylist(el, rotuloCab, null);
    }
    const row = document.createElement('div');
    row.dataset.plIdx = String(idx);
    const rotuloVersao = sufixoRotuloVersaoPlaylist(item);
    row.className = 'playlist-row' + (playlistItemSelecionadoNaUi(item) ? ' ativo' : '');
    row.innerHTML = `
      <div class="playlist-row-top">
        <div class="tit">${nLista}. ${escapeHtml(item.titulo)}${rotuloVersao}</div>
        <div class="playlist-btns">
          <button class="btn sm" type="button" title="Subir">↑</button>
          <button class="btn sm" type="button" title="Descer">↓</button>
          <button class="btn sm danger" type="button" title="Remover">✕</button>
        </div>
      </div>
      ${item.artista ? `<div class="mini">${escapeHtml(item.artista)}</div>` : ''}
    `;
    const [bUp, bDn, bRm] = row.querySelectorAll('.playlist-btns button');
    bUp.onclick = (e) => {
      e.stopPropagation();
      movePlItem(idx, -1);
    };
    bDn.onclick = (e) => {
      e.stopPropagation();
      movePlItem(idx, 1);
    };
    bRm.onclick = (e) => {
      e.stopPropagation();
      removePlItem(idx);
    };
    row.addEventListener('click', (ev) => {
      if (ev.target.closest('.playlist-btns')) return;
      clearTimeout(playlistRowClickTimer);
      const idNum = Number(item.id);
      playlistRowClickTimer = setTimeout(() => {
        playlistRowClickTimer = null;
        /* Só desmarca o que a UI mostra como selecionado; com a faixa vazia, carrega. */
        if (playlistItemSelecionadoNaUi(item)) {
          deselecionarMusicaAtivaAPartirDaPlaylist();
          return;
        }
        selecionarMusicaDoBanco(idNum, {
          habilitarFaixaModoSlides: true,
          versaoLocalId: item.versaoLocalId || undefined,
          fonte: item.bancoFonte === 'catalog' ? 'catalog' : 'user',
        });
      }, 300);
    });
    row.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      clearTimeout(playlistRowClickTimer);
      playlistRowClickTimer = null;
      playlistDuploCliqueIniciarProjecao(item);
    });
    songAppendParent.appendChild(row);
  }
  garantirMusicaAtivaVisivelNaPlaylist();
}

function movePlItem(idx, dir) {
  const pl = getPlaylist(cultoId);
  const j = idx + dir;
  if (j < 0 || j >= pl.length) return;
  if (ehMarcadorTemaPlaylist(pl[idx]) || ehMarcadorTemaPlaylist(pl[j])) return;
  [pl[idx], pl[j]] = [pl[j], pl[idx]];
  savePlaylists();
  const novoIdx = idx + dir;
  renderPlaylist();
  requestAnimationFrame(() => {
    const row = document.querySelector(`#playlist-list .playlist-row[data-pl-idx="${novoIdx}"]`);
    if (!row) return;
    row.classList.add('playlist-row--flash-move');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setTimeout(() => row.classList.remove('playlist-row--flash-move'), 600);
  });
}

function removePlItem(idx) {
  getPlaylist(cultoId).splice(idx, 1);
  savePlaylists();
  renderPlaylist();
}

/** Cabeçalho de tema com seta expandir/recolher e corpo onde entram as linhas da playlist. Devolve o elemento onde anexar as músicas. */
function anexarCabecalhoTemaPlaylist(elRoot, rotulo, idxMarcador) {
  const texto = rotulo || 'Sem tema';
  const cid = String(cultoId || '');

  const wrap = document.createElement('div');
  wrap.className = 'playlist-tema-section';

  const row = document.createElement('div');
  row.className = 'playlist-tema-head-row';

  const btnExpand = document.createElement('button');
  btnExpand.type = 'button';
  btnExpand.className = 'btn sm playlist-tema-toggle-expand';
  btnExpand.setAttribute('aria-label', 'Expandir ou recolher músicas deste tema');

  const lab = document.createElement('div');
  lab.className = 'playlist-tema-head-label';
  lab.textContent = texto;

  row.appendChild(btnExpand);
  row.appendChild(lab);

  if (idxMarcador != null && idxMarcador !== undefined) {
    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'btn sm danger playlist-tema-head-del';
    btnDel.textContent = '✕';
    btnDel.title = 'Excluir este tema e todas as músicas deste bloco na playlist';
    btnDel.onclick = (e) => {
      e.stopPropagation();
      solicitarRemoverMarcadorTemaPlaylist(idxMarcador);
    };
    row.appendChild(btnDel);
  }

  const body = document.createElement('div');
  body.className = 'playlist-tema-section-body';

  wrap.appendChild(row);
  wrap.appendChild(body);
  elRoot.appendChild(wrap);

  const inicioRecolhido = secaoTemaPlaylistRecolhida(cid, texto);
  if (inicioRecolhido) wrap.classList.add('playlist-tema-section--colapsada');
  atualizarUiExpandSecaoTema(btnExpand, inicioRecolhido);

  btnExpand.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    wrap.classList.toggle('playlist-tema-section--colapsada');
    const rec = wrap.classList.contains('playlist-tema-section--colapsada');
    definirSecaoTemaPlaylistRecolhida(cid, texto, rec);
    atualizarUiExpandSecaoTema(btnExpand, rec);
  };

  if (idxMarcador != null && idxMarcador !== undefined && cultoId && playlistPossuiMarcadoresTema(getPlaylist(cultoId))) {
    configurarDragReordenarCabecalhoTemaPlaylist(row, idxMarcador);
  }

  return body;
}

function configurarDragReordenarCabecalhoTemaPlaylist(row, markerPlIdx) {
  row.draggable = true;
  row.dataset.plMarcadorIdx = String(markerPlIdx);
  row.title = row.title ? `${row.title} · Arrastar para reordenar` : 'Arrastar para reordenar';

  row.addEventListener('dragstart', (ev) => {
    if (ev.target instanceof HTMLElement && ev.target.closest('button')) {
      ev.preventDefault();
      return;
    }
    ev.dataTransfer.setData('application/x-lyra-pl-marcador-idx', String(markerPlIdx));
    ev.dataTransfer.effectAllowed = 'move';
    row.classList.add('playlist-tema-head-row--dragging');
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('playlist-tema-head-row--dragging');
    document.querySelectorAll('.playlist-tema-head-row--drag-over').forEach((el) => {
      el.classList.remove('playlist-tema-head-row--drag-over');
    });
  });

  row.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    const from = ev.dataTransfer.types.includes('application/x-lyra-pl-marcador-idx');
    if (!from) return;
    ev.dataTransfer.dropEffect = 'move';
    row.classList.add('playlist-tema-head-row--drag-over');
  });

  row.addEventListener('dragleave', () => {
    row.classList.remove('playlist-tema-head-row--drag-over');
  });

  row.addEventListener('drop', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    row.classList.remove('playlist-tema-head-row--drag-over');
    const fromRaw = ev.dataTransfer.getData('application/x-lyra-pl-marcador-idx');
    const fromIdx = Number(fromRaw);
    const toIdx = Number(row.dataset.plMarcadorIdx);
    if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx) || fromIdx === toIdx) return;
    reordenarMarcadoresTemaNaPlaylist(cultoId, fromIdx, toIdx);
    renderSeletorTemasPlaylist();
    renderPlaylist();
  });
}

async function solicitarRemoverMarcadorTemaPlaylist(idx) {
  if (!cultoId) return;
  const plAntes = getPlaylist(cultoId);
  if (!ehMarcadorTemaPlaylist(plAntes[idx])) return;
  const nome = normalizarTemaPlaylist(plAntes[idx].tema) || '';
  if (!nome) {
    const ok = await appConfirm(
      'Remover este separador (sem nome de tema)? As músicas deste trecho continuam na playlist.',
      'Remover separador'
    );
    if (!ok) return;
    const pl = getPlaylist(cultoId);
    if (!ehMarcadorTemaPlaylist(pl[idx])) return;
    pl.splice(idx, 1);
    savePlaylists();
    renderSeletorTemasPlaylist();
    renderPlaylist();
    return;
  }
  const ok = await appConfirm(
    `Remover o tema «${nome}» da playlist? As músicas deste bloco serão removidas da playlist, mas o tema continuará disponível no menu.`,
    'Remover tema da playlist'
  );
  if (!ok) return;
  const pl = getPlaylist(cultoId);
  const filtrado = playlistPossuiMarcadoresTema(pl)
    ? filtrarPlaylistRemovendoTemaComMarcadores(pl, nome)
    : pl.filter((it) => normalizarTemaPlaylist(it.tema) !== nome);
  playlists[cultoId] = filtrado;
  if (nome === TEMA_PADRAO_ABERTURA) marcarAberturaRemovidaPeloUsuario(cultoId);
  if (getTemaSelecionadoAtual() === nome) setTemaSelecionadoAtual('');
  savePlaylists();
  const plDepois = getPlaylist(cultoId);
  const aindaNaLista =
    !!musicaAtiva &&
    plDepois.some((it) => !ehMarcadorTemaPlaylist(it) && playlistItemMesmaVersaoQueAtiva(it));
  if (musicaAtiva && !aindaNaLista) encerrarProjecaoDoControlador({ limparMusica: true });
  renderSeletorTemasPlaylist();
  renderPlaylist();
}

function playlistJaContemMesmaMusicaEVersao(pl, idMusica, versaoLocalId, bancoFonte) {
  const va = versaoLocalId ? String(versaoLocalId) : '';
  const bf = bancoFonte === 'catalog' ? 'catalog' : 'user';
  return pl.some((x) => {
    if (ehMarcadorTemaPlaylist(x)) return false;
    if (Number(x.id) !== Number(idMusica)) return false;
    const vb = x.versaoLocalId ? String(x.versaoLocalId) : '';
    const xbf = x.bancoFonte === 'catalog' ? 'catalog' : 'user';
    return va === vb && xbf === bf;
  });
}

async function addMusicaNaPlaylist(meta) {
  if (!cultoId) {
    alert('Selecione primeiro o dia do culto.');
    return;
  }
  const idNum = Number(meta.id);
  const bancoFonte = meta.bancoFonte === 'catalog' ? 'catalog' : 'user';
  let versaoLocalId = null;
  let versaoRotulo = '';
  let tituloPl = meta.titulo;
  let artistaPl = meta.artista || '';
  const opcoesVersao = [{ value: '__ORIGINAL__', label: 'ORIGINAL (SERVIDOR)' }];
  if (bancoFonte !== 'catalog') {
    try {
      const resV = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/versoes`);
      if (resV.ok) {
        const dataV = await resV.json();
        const rootId = Number(dataV.rootId) || idNum;
        for (const v of dataV.versoes || []) {
          if (Number(v.id) === rootId || v.parent_id == null) continue;
          const rotulo = String(v.rotulo || '').trim() || 'Cópia';
          opcoesVersao.push({
            value: String(v.id),
            label: rotulo.toLocaleUpperCase('pt-BR'),
          });
        }
      }
    } catch (_) {
      // intencional — falha ao listar versões do servidor
    }
    for (const c of getCopiasParaMusica(idNum)) {
      opcoesVersao.push({
        value: c.id,
        label: `${String(c.rotulo || 'Cópia').toLocaleUpperCase('pt-BR')} (LOCAL)`,
      });
    }
  }
  if (opcoesVersao.length > 1) {
    const esc = await appEscolherOpcao('Qual versão deseja adicionar à playlist?', opcoesVersao);
    if (esc == null) return;
    if (esc !== '__ORIGINAL__') {
      versaoLocalId = esc;
      if (ehVersaoServidorId(esc)) {
        try {
          const resM = await fetch(`${getControllerApiBase()}/api/musicas/${encodeURIComponent(esc)}`);
          if (resM.ok) {
            const m = await resM.json();
            tituloPl = m.titulo || tituloPl;
            artistaPl = m.artista || artistaPl;
            versaoRotulo = String(m.rotulo || '').trim();
          }
        } catch (_) {
          // intencional — falha ao carregar metadados da versão
        }
      } else {
        const c = encontrarCopiaLocal(idNum, esc);
        if (c) {
          tituloPl = c.titulo;
          artistaPl = c.artista || '';
          versaoRotulo = c.rotulo || '';
        }
      }
    }
  }
  const pl = getPlaylist(cultoId);
  if (playlistJaContemMesmaMusicaEVersao(pl, idNum, versaoLocalId, bancoFonte)) {
    appAlert('Esta música (mesma versão e mesma origem catálogo/servidor) já está na playlist deste culto.', 'Playlist');
    return;
  }
  let tema;
  const temMarcadores = playlistPossuiMarcadoresTema(pl);
  if (temMarcadores) {
    const marcadores = listarMarcadoresTemaPlaylist(pl);
    if (marcadores.length === 0) {
      alert('Use o botão «Inserir tema na playlist abaixo» (seta até à linha) para adicionar um bloco de tema no fim da playlist antes de incluir músicas.');
      return;
    }
    if (marcadores.length === 1) {
      // Só um tema (ex.: apenas ABERTURA) → mantém o comportamento atual, sem perguntar.
      tema = marcadores[0];
    } else {
      // Mais de um tema → deixa o usuário escolher em qual bloco adicionar (Modal 2).
      const ultimo = obterUltimoMarcadorTema(pl);
      const opcoesTema = marcadores.map((t) => ({
        value: t,
        label: t === ultimo ? `${t} (ÚLTIMO)` : t,
      }));
      const escTema = await appEscolherOpcao(
        'Em qual tema adicionar esta música?',
        opcoesTema,
        `«${tituloPl}» será adicionada ao tema escolhido.`
      );
      if (escTema == null) return; // cancelou
      tema = normalizarTemaPlaylist(escTema);
    }
  } else {
    tema = getTemaSelecionadoAtual();
    if (!tema) {
      alert('Selecione um tema na lista e use «Inserir tema na playlist abaixo» para ativá-lo na playlist.');
      return;
    }
  }
  garantirTemaNoCatalogoAtual(tema);
  const novoItem = {
    id: meta.id,
    titulo: tituloPl,
    artista: artistaPl,
    tema,
    versaoLocalId,
    versaoRotulo,
    bancoFonte,
  };
  if (temMarcadores) {
    // Insere no fim do bloco do tema escolhido (posição correta na playlist plana).
    inserirMusicaNoBlocoTema(pl, tema, novoItem);
  } else {
    pl.push(novoItem);
  }
  savePlaylists();
  renderPlaylist();
}

/** Adiciona ao culto indicado (sem mudar o culto atualmente selecionado até `onCultoChange`). */
function addMusicaNaPlaylistParaCulto(cid, meta) {
  if (!cid || meta == null || meta.id == null) return;
  const pl = getPlaylist(cid);
  const vid = meta.versaoLocalId != null && String(meta.versaoLocalId).trim() ? String(meta.versaoLocalId).trim() : null;
  const bfAdd = meta.bancoFonte === 'catalog' ? 'catalog' : 'user';
  if (playlistJaContemMesmaMusicaEVersao(pl, meta.id, vid, bfAdd)) return;
  let tema = normalizarTemaPlaylist(meta.tema);
  if (playlistPossuiMarcadoresTema(pl)) {
    const ult = obterUltimoMarcadorTema(pl);
    if (ult) tema = ult;
  }
  if (tema) {
    if (!Array.isArray(temasPorCulto[cid])) temasPorCulto[cid] = [];
    temasPorCulto[cid] = normalizarListaTemas([...(temasPorCulto[cid] || []), tema]);
    saveTemasPorCulto();
  }
  pl.push({
    id: meta.id,
    titulo: meta.titulo,
    artista: meta.artista || '',
    tema,
    versaoLocalId: vid,
    versaoRotulo: String(meta.versaoRotulo || '').trim(),
    bancoFonte: bfAdd,
  });
}

/**
 * Aplica músicas vindas do telemóvel (HTTP :3001 ou socket) nas playlists do painel.
 *
 * @param {{ musicas?: Array }} payload
 */
async function processarMusicasSincronizadasPayload(payload) {
  try {
    await carregarMusicas();
    refreshListaBanco();
  } catch (_) {
  // intencional — erro ignorado
}
  if (!payload || !Array.isArray(payload.musicas) || !payload.musicas.length) return;

  const semCulto = [];
  for (const m of payload.musicas) {
    const cid = m.cultoId != null ? String(m.cultoId).trim() : '';
    if (cid) addMusicaNaPlaylistParaCulto(cid, m);
    else semCulto.push(m);
  }

  let mudouPlaylist = false;
  for (const m of payload.musicas) {
    const cid = m.cultoId != null ? String(m.cultoId).trim() : '';
    if (cid) mudouPlaylist = true;
  }
  if (mudouPlaylist) savePlaylists();

  const comCulto = payload.musicas.filter((m) => m.cultoId != null && String(m.cultoId).trim());
  const cids = [...new Set(comCulto.map((m) => String(m.cultoId).trim()))];
  const mainSel = document.getElementById('culto-sel');
  if (mainSel && cids.length === 1) {
    mainSel.value = cids[0];
    onCultoChange();
  } else if (mudouPlaylist) {
    renderPlaylist();
  }

  if (semCulto.length) abrirModalNovasMusicasSync({ musicas: semCulto });
}

let syncPlaylistModalPayload = null;

function preencherSyncPlaylistCultoSel() {
  const sel = document.getElementById('sync-playlist-culto-sel');
  if (!sel) return;
  sel.innerHTML = '';
  const lista = listarCultosDisponiveis();
  const vazio = document.createElement('option');
  vazio.value = '';
  vazio.textContent = 'Selecione o dia do culto...';
  sel.appendChild(vazio);
  lista.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.label;
    sel.appendChild(o);
  });
  sel.value =
    cultoId && lista.some((c) => c.id === cultoId) ? cultoId : '';
}

function abrirModalNovasMusicasSync(payload) {
  syncPlaylistModalPayload = payload && Array.isArray(payload.musicas) ? payload.musicas : [];
  const bd = document.getElementById('sync-playlist-backdrop');
  const desc = document.getElementById('sync-playlist-desc');
  const ul = document.getElementById('sync-playlist-lista');
  if (!bd || !desc || !ul) return;
  const n = syncPlaylistModalPayload.length;
  if (n === 0) return;
  desc.textContent =
    n === 1
      ? 'Uma música foi gravada no PC (sincronização do telemóvel).'
      : `${n} músicas foram gravadas no PC (sincronização do telemóvel).`;
  ul.innerHTML = '';
  syncPlaylistModalPayload.forEach((m) => {
    const li = document.createElement('li');
    li.textContent = `${m.titulo || ''}${m.artista ? ' — ' + m.artista : ''}`;
    ul.appendChild(li);
  });
  preencherSyncPlaylistCultoSel();
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
}

function fecharModalNovasMusicasSync() {
  const bd = document.getElementById('sync-playlist-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  syncPlaylistModalPayload = null;
}

function confirmarSyncPlaylistModal() {
  const sel = document.getElementById('sync-playlist-culto-sel');
  const cid = sel ? String(sel.value || '').trim() : '';
  if (!cid || !syncPlaylistModalPayload || syncPlaylistModalPayload.length === 0) {
    fecharModalNovasMusicasSync();
    return;
  }
  syncPlaylistModalPayload.forEach((m) => addMusicaNaPlaylistParaCulto(cid, m));
  savePlaylists();
  const mainSel = document.getElementById('culto-sel');
  if (mainSel) {
    mainSel.value = cid;
    onCultoChange();
  } else {
    renderPlaylist();
  }
  fecharModalNovasMusicasSync();
}

function configurarSeletorTemaPlaylist() {
  const sel = document.getElementById('playlist-tema-sel');
  const btnAdd = document.getElementById('playlist-tema-add');
  const btnAplicar = document.getElementById('playlist-tema-aplicar');
  const btnEdit = document.getElementById('playlist-tema-edit');
  const btnDel = document.getElementById('playlist-tema-del');
  if (!sel || !btnAdd || !btnAplicar || !btnEdit || !btnDel) return;

  setupDropdownTemaPlaylist();

  btnAplicar.addEventListener('click', () => {
    if (!cultoId) {
      alert('Selecione primeiro o dia do culto.');
      return;
    }
    const t = normalizarTemaPlaylist(sel.value);
    if (!t) {
      alert('Escolha um tema na lista antes de «Inserir tema na playlist abaixo».');
      return;
    }
    if (t === TEMA_PADRAO_ABERTURA) desmarcarAberturaRemovidaPeloUsuario(cultoId);
    const pl = getPlaylist(cultoId);
    pl.push({ tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema: t });
    garantirTemaNoCatalogoAtual(t);
    setTemaSelecionadoAtual(t);
    savePlaylists();
    renderSeletorTemasPlaylist();
    renderPlaylist();
  });

 btnAdd.addEventListener('click', async () => {
  const nome = await appPrompt('Nome do novo tema:', {
    title: '+ Tema',
    defaultValue: '',
    emptyMsg: 'Digite um nome para o tema.',
  });
  if (!nome) return;
  garantirTemaNoCatalogoAtual(nome);
  renderSeletorTemasPlaylist();
  aplicarSelecaoTemaNaUi(nome);
});

  btnEdit.addEventListener('click', async () => {
    if (!cultoId) {
      alert('Selecione primeiro o dia do culto.');
      return;
    }
    const atual = normalizarTemaPlaylist(sel.value);
    if (!atual) {
      alert('Selecione um tema na lista para renomear.');
      return;
    }
    const novo = await appPrompt('Novo nome do tema:', {
      title: 'Renomear tema',
      defaultValue: atual,
      emptyMsg: 'Digite o novo nome do tema.',
    });
    if (!novo || novo === atual) return;
    if (!renomearTemaNoCulto(atual, novo)) return;
    renderSeletorTemasPlaylist();
    if (getTemaSelecionadoAtual() === novo) aplicarSelecaoTemaNaUi(novo);
  });

  btnDel.addEventListener('click', async () => {
    if (!cultoId) {
      alert('Selecione primeiro o dia do culto.');
      return;
    }
    const t = normalizarTemaPlaylist(sel.value);
    if (!t) {
      alert('Selecione um tema na lista para excluir.');
      return;
    }
    // Estado de confirmação: o "X" só fica vermelho enquanto a confirmação está aberta.
    btnDel.classList.add('confirmando');
    let ok = false;
    try {
      ok = await appConfirm(
        `Excluir o tema «${t}»? Todas as músicas inseridas nesse tema serão removidas da playlist deste culto.`,
        'Excluir tema'
      );
    } finally {
      btnDel.classList.remove('confirmando');
    }
    if (!ok) return;
    excluirTemaDoCulto(t);
    renderSeletorTemasPlaylist();
    renderPlaylist();
  });

  document.getElementById('playlist-compartilhar-btn')?.addEventListener('click', compartilharPlaylist);
document.getElementById('playlist-importar-btn')?.addEventListener('click', importarPlaylist);
document.getElementById('playlist-copiar-nomes-btn')?.addEventListener('click', () => {
  copiarNomesMusicasPlaylist().catch(() => {});
});

}

function configurarModalSyncPlaylist() {
  document.getElementById('playlist-sync-btn')?.addEventListener('click', () => {
    solicitarSincronizacaoManualBanco().catch(() => {});
  });
  document.getElementById('sync-playlist-dismiss')?.addEventListener('click', () => fecharModalNovasMusicasSync());
  document.getElementById('sync-playlist-backdrop')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'sync-playlist-backdrop') fecharModalNovasMusicasSync();
  });
  document.getElementById('sync-playlist-confirm')?.addEventListener('click', () => confirmarSyncPlaylistModal());
}

function textoSlideMaiusculo(texto) {
  return (texto || '').toUpperCase();
}

const previewMinistranteHelpers = {
  escapeHtml,
  maiusculo: textoSlideMaiusculo,
  aplicarClasseLinhas,
  limparEstiloPreviewSlide,
};

/**
 * Divide em slides onde há linha 100 % vazia (`\n\n` — sem espaço nem tab na linha).
 * Linha com pelo menos um carácter (ex.: um espaço) não separa: fica no mesmo slide (respiro visual).
 */
function splitTextoEmEstrofesPorLinhaVaziaStrict(texto) {
  const t = String(texto ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (t === '') return [''];
  const lines = t.split('\n');
  const estrofes = [];
  let cur = [];
  for (const line of lines) {
    if (line === '') {
      if (cur.length) {
        estrofes.push(cur.join('\n'));
        cur = [];
      }
    } else {
      cur.push(line);
    }
  }
  if (cur.length) estrofes.push(cur.join('\n'));
  return estrofes.length ? estrofes : [''];
}

/**
 * Aplica a regra de linhas vazias num índice (edição rápida ao guardar ou estrofe ao sair do campo).
 */
function aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idx, texto, opts = {}) {
  if (!musicaAtiva || idx < 0 || idx >= musicaAtiva.estrofes.length) return;
  const emitSocket = opts.emitSocket !== false;
  const posCaretAposSplit = opts.posCaretAposSplit;
  const parts = splitTextoEmEstrofesPorLinhaVaziaStrict(texto);
  const eraProjecaoNesteIndice = estrofeAtiva === idx;
  const delta = parts.length - 1;

  if (parts.length === 1) {
    musicaAtiva.estrofes[idx] = parts[0];
  } else {
    musicaAtiva.estrofes.splice(idx, 1, ...parts);
    if (estrofeAtiva > idx) estrofeAtiva += delta;
    else if (estrofeAtiva === idx) estrofeAtiva = idx;
  }

  renderSlidesStrip();
  atualizarPreviewOperador();
  renderEstrofesEditor();
  marcacaoEstrofeEditor();

  if (emitSocket && projecao.pronta() && eraProjecaoNesteIndice && projecaoMusicaEmitidaNoServidor) {
    projecao.enviar('exibir_musica', montarPayloadExibirMusica(estrofeAtiva));
  }

  if (posCaretAposSplit != null && parts.length > 1) {
    const di = posCaretAposSplit;
    requestAnimationFrame(() => {
      const ta = document.querySelector(
        `#estrofes-slide-editor textarea.estrofe-slide-ta[data-i="${di}"]`
      );
      if (ta) {
        ta.focus();
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
      }
    });
  }
}

/** Antes de gravar no servidor: aplica linhas vazias em cada caixa (sem depender só do blur). */
function aplicarSplitsEstrofesDosTextareasAntesDePersistir() {
  if (!musicaAtiva || !modoEdicaoEstrofes) return;
  const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
  if (!tas.length) return;
  const novas = [];
  for (const ta of tas) {
    novas.push(...splitTextoEmEstrofesPorLinhaVaziaStrict(ta.value));
  }
  musicaAtiva.estrofes = novas.length ? novas : [''];
  if (estrofeAtiva >= musicaAtiva.estrofes.length) {
    estrofeAtiva = Math.max(0, musicaAtiva.estrofes.length - 1);
  }
  renderSlidesStrip();
  atualizarPreviewOperador();
  renderEstrofesEditor();
  marcacaoEstrofeEditor();
}

/** HTML para o cartão da faixa — cada linha da letra (\\n) permanece uma linha visual; fonte ajustada por JS. */
function textoSlideSnippetHtmlParaChip(estrofe) {
  const raw = textoSlideMaiusculo(estrofe || '');
  const lines = raw.split(/\r\n|\r|\n/);
  return lines
    .map((line) => {
      const empty = line === '';
      const cls = empty ? 'slide-snippet-line slide-snippet-line--empty' : 'slide-snippet-line';
      const inner = empty ? '\u00a0' : escapeHtml(line);
      return `<span class="${cls}">${inner}</span>`;
    })
    .join('');
}

// --- SECÇÃO E — Pré-visualização «ao vivo» (telão / ministrante) e regras de espelho do estado remoto ---
/** Há algo efetivamente enviado às telas de projeção (servidor ligado). */
function hayProjecaoAtivaNoServidor() {
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.projecaoLive && !e.telaLimpa && Array.isArray(e.linhas) && e.linhas.length) return true;
  if (e.blackout) return true;
  if (e.tipo === 'apresentacao' && e.apresentacao && String(e.apresentacao.src || '').trim()) return true;
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) return true;
  if (e.projecaoMinistranteApresentacao) return true;
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) return true;
  if (e.tipo === 'musica' && e.slidePretoFinal) return true;
  if (e.tipo === 'musica' && !e.telaLimpa && e.linhas && e.linhas.length) return true;
  return false;
}

/**
 * Para os cartões quando não há uma «saída nas telas» em curso de música/bíblia que deva espelhar sempre o servidor:
 * exige música selecionada alinhada + flag local de emissão (evita mostrar letra só ao navegar na playlist sem projetar).
 */
function hayProjecaoAtivaNoServidorParaPreviews() {
  if (!hayProjecaoAtivaNoServidor()) return false;
  const e = estadoServidor;
  if (!e) return false;
  if (e.blackout) return true;
  if (e.projecaoMinistranteApresentacao && e.tipo !== 'apresentacao' && e.tipo !== 'aviso') return true;
  if (e.tipo === 'biblia') return true;
  if (e.tipo === 'musica') {
    if (!musicaAtiva) return true;
    if (!musicaEstadoCombinaComAtiva(e)) return false;
    /* Só espelhar letra de música nos cartões quando este painel já «armou» projeção (duplo clique, setas, próxima música…). */
    if (!projecaoMusicaEmitidaNoServidor) return false;
    return true;
  }
  return false;
}

/**
 * Não espelhar letras de música nos cartões de preview até este painel estar no fluxo de projeção
 * (faixa de slides visível). Evita mostrar letra quando o servidor ainda guarda o estado anterior.
 */
function previewMusicaEsperandoDockParaEspelharLetra() {
  const e = estadoServidor;
  if (!e || e.tipo !== 'musica') return false;
  if (musicaAtiva && !musicaEstadoCombinaComAtiva(e)) return false;
  if (e.blackout || e.slidePretoFinal || e.telaLimpa) return false;
  if (!e.linhas || !e.linhas.length) return false;
  return !slidesDockVisivel && !ehModoSlidesOperador();
}

/**
 * Clique na playlist/banco só prepara musicaAtiva na faixa — até um novo emit deste painel,
 * os cartões Telão/TV não espelham o servidor (nem a música anterior nas telas físicas).
 */
function suprimirEspelhoPreviewsPorNavegacaoPlaylist() {
  /* Em qualquer modo, ao "engatilhar" música na playlist sem emitir ao servidor,
     manter nos previews o que já está projetado até um novo emit (duplo clique/setas). */
  return false;
}

/** Aplica no DOM o estado da saída “telão” (público). */
function aplicarPreviewTelaoNoDom(estado) {
  const prevTitulo = document.getElementById('pv-live-titulo');
  const prevLetras = document.getElementById('pv-live-letras');

  if (estado && estado.previewImagemNoTelao) {
    prevTitulo.textContent = '';
    const linhaTxt = 'IMAGEM NO TELÃO';
    prevLetras.innerHTML = `<span class="pv-live-ap-meta">${svgIconeTipoMidiaApresentacao('image')}<span class="pv-live-ap-meta-txt">${escapeHtml(linhaTxt)}</span></span>`;
    prevLetras.classList.remove('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (!estado || estado.semProjecao) {
    prevTitulo.textContent = '';
    prevLetras.textContent = '';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.blackout) {
    prevTitulo.textContent = '';
    prevLetras.textContent = 'Tela preta (F10)';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.tipo === 'aviso' && Array.isArray(estado.linhas) && estado.linhas.length) {
    prevTitulo.textContent = '';
    prevLetras.textContent = estado.linhas.join('\n');
    prevLetras.classList.remove('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.tipo === 'apresentacao' && estado.apresentacao && String(estado.apresentacao.src || '').trim()) {
    const ap = estado.apresentacao;
    const label =
      [ap.title, ap.name].map((x) => String(x || '').trim()).find(Boolean) ||
      String(estado.titulo || '').trim() ||
      'Apresentação';
    prevTitulo.textContent = ehModoSlidesOperador() ? '' : label.toUpperCase();
    const kind = String(ap.kind || '').toLowerCase();
    const tipoRotulo = rotuloTipoMidiaApresentacao(kind);
    const linhaTxt = `${tipoRotulo} no telão`;
    prevLetras.innerHTML = `<span class="pv-live-ap-meta">${svgIconeTipoMidiaApresentacao(kind)}<span class="pv-live-ap-meta-txt">${escapeHtml(linhaTxt)}</span></span>`;
    prevLetras.classList.remove('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.slidePretoFinal) {
    prevTitulo.textContent = '';
    prevLetras.textContent = '';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  if (estado.telaLimpa || !estado.linhas || !estado.linhas.length) {
    prevTitulo.textContent = '';
    if (ehModoSlidesOperador()) {
      prevLetras.textContent = '';
      prevLetras.classList.add('vazio');
      limparEstiloPreviewSlide(prevLetras);
      return;
    }
    prevLetras.textContent = 'Tela limpa';
    prevLetras.classList.add('vazio');
    limparEstiloPreviewSlide(prevLetras);
    return;
  }

  prevTitulo.textContent = ehModoSlidesOperador() ? '' : (estado.titulo || '').toUpperCase();
  const linhasPub = filtrarLinhasParaPublico(estado.linhas);
  const textoPub = linhasPub.join('\n');
  prevLetras.textContent = textoSlideMaiusculo(textoPub);
  prevLetras.classList.remove('vazio');
  aplicarClasseLinhas(prevLetras, textoPub);
}

/**
 * Letra nos cartões TELÃO/TV: exclusivos do modo slide.
 * Home (modo completo) usa só `#playlist-preview-card`. Badges de mídia (ex. «imagem no telão»)
 * ficam de fora — tratados nos early-returns de `atualizarPreviewOperador` / telão.
 * Exige faixa armada pela playlist ou projeção já emitida (não basta `musicaAtiva` da Home).
 */
function podeEspelharLetraNosPreviewsModoSlide() {
  if (!ehModoSlidesOperador()) return false;
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes) || !musicaAtiva.estrofes.length) {
    return false;
  }
  if (estrofeAtiva < 0) return false;
  return !!(projecaoMusicaEmitidaNoServidor || faixaSlidesHabilitadaPorPlaylistNoModoSlides);
}

/**
 * Estado local (sem socket) do que o modo slide mostraria no telão, a partir do slide
 * selecionado no painel. Usado para o preview continuar a refletir o slide clicado mesmo
 * sem conexão — não altera a projeção real (isso depende da emissão ao servidor).
 */
function estadoPreviewTelaoLocalModoSlides() {
  if (!podeEspelharLetraNosPreviewsModoSlide()) {
    return { semProjecao: true };
  }
  const idxPreto = musicaAtiva.estrofes.length;
  if (estrofeAtiva === idxPreto) return { tipo: 'musica', slidePretoFinal: true };
  const cur = String(musicaAtiva.estrofes[estrofeAtiva] ?? '');
  return { tipo: 'musica', titulo: musicaAtiva.titulo || '', telaLimpa: false, linhas: cur.split('\n') };
}

/** Telão no painel: espelha o servidor com as regras de `suprimirEspelhoPreviewsPorNavegacaoPlaylist`. */
function atualizarPreviewTelaoPublico() {
  if (ehModoSlidesOperador()) {
    if (slidePreviewDeveMostrarInformeMidiaApresentacaoNoPublico()) {
      aplicarPreviewTelaoNoDom(estadoServidor);
      return;
    }
    // Sem projeção ativa no servidor (ex.: desconectado): o preview do modo slide reflete o
    // slide selecionado localmente. A projeção real nos monitores externos continua dependendo
    // da conexão/rota (fluxo de emissão ao servidor, inalterado).
    if (!hayProjecaoAtivaNoServidor()) {
      aplicarPreviewTelaoNoDom(estadoPreviewTelaoLocalModoSlides());
      return;
    }
    const r = obterRotaSlidesParaUi();
    const apSoNoMinistrante =
      apresentacaoProjecaoAtivaNoCanalMinistrante() &&
      !apresentacaoProjecaoAtivaNoCanalPublico() &&
      !slidesCanalPublicoSeparadoDaApresentacao();
    if (r.publicoIndex < 0 || apSoNoMinistrante) {
      aplicarPreviewTelaoNoDom({ semProjecao: true });
      return;
    }
  }
  const e = estadoServidor;
  if (!hayProjecaoAtivaNoServidor() || !e) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  if (suprimirEspelhoPreviewsPorNavegacaoPlaylist()) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  if (e.blackout) {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'apresentacao') {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) {
    aplicarPreviewTelaoNoDom(e);
    return;
  }
  if (e.tipo === 'musica') {
    const telasMostramMusica =
      e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length);
    if (telasMostramMusica) {
      aplicarPreviewTelaoNoDom(e);
      return;
    }
  }
  if (!hayProjecaoAtivaNoServidorParaPreviews()) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  if (previewMusicaEsperandoDockParaEspelharLetra()) {
    aplicarPreviewTelaoNoDom({ semProjecao: true });
    return;
  }
  aplicarPreviewTelaoNoDom(estadoServidor);
}

/**
 * Cartão TV quando o painel não está alinhado com a projeção (ex.: letra comandada só pelo mobile).
 * Usa o mesmo estado que o servidor manda no socket (`linhas` + `linhasProximo` + `proximoSlidePreto`),
 * para o cartão «próximo» coincidir com a TV física e com o fluxo do controlador.
 */
function preencherPreviewOperadorSomenteEstadoServidorMusica() {
  const e = estadoServidor;
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (!e || e.tipo !== 'musica') return;
  if (e.slidePretoFinal) {
    opA.innerHTML = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    opP.innerHTML = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
    return;
  }
  const idx = Number.isFinite(Number(e.estrofeIndex)) ? Number(e.estrofeIndex) : -1;
  let curRaw = '';
  let proxRaw = '';
  if (musicaAtiva && musicaEstadoCombinaComAtiva(e) && Array.isArray(musicaAtiva.estrofes)) {
    if (idx >= 0 && idx < musicaAtiva.estrofes.length) curRaw = String(musicaAtiva.estrofes[idx] ?? '');
    if (e.proximoSlidePreto) proxRaw = '';
    else if (idx >= 0 && idx < musicaAtiva.estrofes.length - 1) {
      proxRaw = String(musicaAtiva.estrofes[idx + 1] ?? '');
    }
  } else {
    curRaw = (e.linhas || []).join('\n');
    if (e.proximoSlidePreto) proxRaw = '';
    else if (Array.isArray(e.linhasProximo) && e.linhasProximo.length) {
      proxRaw = e.linhasProximo.join('\n');
    }
  }

  opA.className = 'op-slide-text';
  aplicarPreviewMinistranteNoElemento(opA, curRaw, previewMinistranteHelpers);

  opP.className = 'op-slide-text';
  if (proxRaw.trim()) {
    aplicarPreviewMinistranteNoElemento(opP, proxRaw, previewMinistranteHelpers);
  } else {
    opP.innerHTML = '';
    opP.classList.add('vazio');
    limparEstiloPreviewSlide(opP);
  }
}

/** Pré-visualização TV/ministrante só a partir da música e estrofe escolhidas no painel (sem depender do socket). */
function preencherPreviewOperadorSomenteMusicaLocal() {
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');

  if (!musicaAtiva || !musicaAtiva.estrofes || musicaAtiva.estrofes.length === 0) {
    opA.textContent = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    opP.textContent = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
    return;
  }

  const nEst = musicaAtiva.estrofes.length;
  const idxPreto = nEst;

  if (estrofeAtiva < 0) {
    opA.innerHTML = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    const p0 = musicaAtiva.estrofes[0];
    opP.className = 'op-slide-text';
    if (p0) {
      aplicarPreviewMinistranteNoElemento(opP, p0, previewMinistranteHelpers);
    } else {
      opP.innerHTML = '';
      opP.classList.add('vazio');
      limparEstiloPreviewSlide(opP);
    }
    return;
  }

  if (estrofeAtiva === idxPreto) {
    opA.innerHTML = '';
    opA.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opA);
    opP.innerHTML = '';
    opP.className = 'op-slide-text vazio';
    limparEstiloPreviewSlide(opP);
    return;
  }

  const cur = musicaAtiva.estrofes[estrofeAtiva];
  const proximoEhPreto = estrofeAtiva === nEst - 1;
  const nxt = proximoEhPreto ? null : musicaAtiva.estrofes[estrofeAtiva + 1];

  opA.className = 'op-slide-text';
  if (cur) {
    aplicarPreviewMinistranteNoElemento(opA, cur, previewMinistranteHelpers);
  } else {
    opA.innerHTML = '';
    opA.classList.add('vazio');
    limparEstiloPreviewSlide(opA);
  }

  opP.className = 'op-slide-text';
  if (proximoEhPreto) {
    opP.innerHTML = '';
    opP.classList.add('vazio');
    limparEstiloPreviewSlide(opP);
  } else if (nxt) {
    aplicarPreviewMinistranteNoElemento(opP, nxt, previewMinistranteHelpers);
  } else {
    opP.innerHTML = '';
    opP.classList.add('vazio');
    limparEstiloPreviewSlide(opP);
  }
}

/**
 * Prévia na coluna playlist: só o estado da música/slides da coluna central (estrofeAtiva).
 * Tamanho da fonte por texto (linha mais longa + linhas) · sem quebra automática (`white-space: pre`).
 * Independente do socket · não altera projeção.
 */
function atualizarPreviewPlaylistCentral() {
  if (document.body.classList.contains('app-mod-slides')) return;
  const tit = document.getElementById('pl-pv-titulo');
  const slideEl = document.getElementById('pl-pv-slide');
  if (!tit || !slideEl) return;

  const limpar = () => {
    tit.textContent = '';
    tit.classList.add('vazio');
    slideEl.textContent = '';
    slideEl.className = 'pl-slide-text vazio';
    limparEstiloPreviewSlide(slideEl);
  };

  if (ehModoBibliaOperador() || !musicaAtiva || !musicaAtiva.estrofes || musicaAtiva.estrofes.length === 0) {
    limpar();
    return;
  }

  tit.classList.remove('vazio');
  tit.textContent = (musicaAtiva.titulo || '').toUpperCase();

  const nEst = musicaAtiva.estrofes.length;
  const idxPreto = nEst;

  if (estrofeAtiva < 0 || estrofeAtiva === idxPreto) {
    slideEl.textContent = '';
    slideEl.className = 'pl-slide-text vazio';
    limparEstiloPreviewSlide(slideEl);
    return;
  }

  const cur = musicaAtiva.estrofes[estrofeAtiva];
  slideEl.textContent = cur ? textoSlideMaiusculo(cur) : '';
  slideEl.className = 'pl-slide-text';
  if (cur) {
    slideEl.classList.remove('vazio');
    aplicarClasseLinhas(slideEl, cur);
  } else {
    slideEl.classList.add('vazio');
    limparEstiloPreviewSlide(slideEl);
  }
}

function atualizarPreviewOperador() {
  try {
    const opA = document.getElementById('op-atual');
    const opP = document.getElementById('op-proximo');

    if (slidePreviewDeveMostrarInformeMidiaApresentacaoNoMinistrante()) {
      preencherPreviewInformeMidiaApresentacaoSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      return;
    }

    // No modo slide, quando não há projeção ativa no servidor (ex.: desconectado), os cartões
    // ministrante/TV refletem o slide selecionado localmente — só se a faixa veio da playlist
    // (ou já houve emit). Música aberta só na Home não vaza para estes cartões.
    if (ehModoSlidesOperador() && !hayProjecaoAtivaNoServidor()) {
      if (podeEspelharLetraNosPreviewsModoSlide()) {
        preencherPreviewOperadorSomenteMusicaLocal();
      } else {
        opA.textContent = '';
        opA.className = 'op-slide-text vazio';
        limparEstiloPreviewSlide(opA);
        opP.textContent = '';
        opP.className = 'op-slide-text vazio';
        limparEstiloPreviewSlide(opP);
      }
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    if (ehModoSlidesOperador() && obterRotaSlidesParaUi().ministranteIndex < 0) {
      opA.textContent = '';
      opA.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    if (!hayProjecaoAtivaNoServidor()) {
      opA.textContent = '';
      opA.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    if (suprimirEspelhoPreviewsPorNavegacaoPlaylist()) {
      opA.textContent = '';
      opA.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    if (
      estadoServidor &&
      estadoServidor.tipo === 'biblia' &&
      (!estadoServidor.telaLimpa || estadoServidor.projecaoSomenteMinistrante)
    ) {
      const linhasBib = Array.isArray(estadoServidor.linhas) ? estadoServidor.linhas : [];
      const txtBib = linhasBib.map((s) => String(s ?? '')).join('\n').trim();
      opA.textContent = txtBib;
      opA.className = 'op-slide-text';
      if (txtBib) {
        opA.classList.remove('vazio');
        aplicarClasseLinhas(opA, txtBib);
      } else {
        opA.classList.add('vazio');
        limparEstiloPreviewSlide(opA);
      }
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      /* Ministrante já foi atualizado no servidor por exibir_versiculo — não reemitir vazio. */
      return;
    }

    const eMus = estadoServidor;
    const servidorMostraMusicaProj =
      eMus &&
      eMus.tipo === 'musica' &&
      !eMus.blackout &&
      (eMus.slidePretoFinal || (!eMus.telaLimpa && eMus.linhas && eMus.linhas.length));

    const painelAlinhadoComProjecaoServidor =
      servidorMostraMusicaProj &&
      musicaAtiva &&
      musicaEstadoCombinaComAtiva(eMus) &&
      projecaoMusicaEmitidaNoServidor;

    if (servidorMostraMusicaProj && !painelAlinhadoComProjecaoServidor) {
      preencherPreviewOperadorSomenteEstadoServidorMusica();
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    const servidorMusicaAlinhado =
      estadoServidor &&
      estadoServidor.tipo === 'musica' &&
      hayProjecaoAtivaNoServidorParaPreviews();

    if (!servidorMusicaAlinhado) {
      /* Home: nunca preencher TELÃO/TV com letra — só a prévia da playlist (`pl-pv-*`).
         Modo slide: letra local só com faixa/playlist ou projeção já emitida. */
      const mostrarPreviewOpLocal =
        projecaoMusicaEmitidaNoServidor || podeEspelharLetraNosPreviewsModoSlide();
      if (mostrarPreviewOpLocal) {
        preencherPreviewOperadorSomenteMusicaLocal();
      } else {
        opA.textContent = '';
        opA.className = 'op-slide-text vazio';
        limparEstiloPreviewSlide(opA);
        opP.textContent = '';
        opP.className = 'op-slide-text vazio';
        limparEstiloPreviewSlide(opP);
      }
      atualizarPreviewTelaoPublico();
      return;
    }

    if (previewMusicaEsperandoDockParaEspelharLetra()) {
      opA.textContent = '';
      opA.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opA);
      opP.textContent = '';
      opP.className = 'op-slide-text vazio';
      limparEstiloPreviewSlide(opP);
      atualizarPreviewTelaoPublico();
      emitirEstadoMinistranteAoServidor();
      return;
    }

    preencherPreviewOperadorSomenteMusicaLocal();
    atualizarPreviewTelaoPublico();
    emitirEstadoMinistranteAoServidor();
  } finally {
    atualizarPreviewPlaylistCentral();
    if (ehModoSlidesOperador() || ehModoApresentacaoOperador()) {
      try {
        aplicarPreviewPainelOcultoNoDom();
      } catch (_) {
  // intencional — erro ignorado
}
    }
    if (ehModoSlidesOperador()) {
      try {
        syncRoteamentoTelasModoSlidesNaUi();
      } catch (_) {
  // intencional — erro ignorado
}
    }
  }
}

function emitirEstadoMinistranteAoServidor() {
  if (apresentacaoOcupandoCanalMinistrante()) return;
  if (!projecao.pronta()) return;
  if (ehModoSlidesOperador() && obterRotaSlidesParaUi().ministranteIndex < 0) return;
  if (
    ehModoBibliaOperador() &&
    estadoServidor &&
    estadoServidor.tipo === 'biblia' &&
    !estadoServidor.telaLimpa
  ) {
    return;
  }
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (!opA || !opP) return;
  const atual = textoPlanoDeElementoPreviewMinistrante(opA);
  const proximo = textoPlanoDeElementoPreviewMinistrante(opP);
  /** Se ainda há saída ativa (inclui blackout/slide preto), não abrir relógio no ministrante. */
  const projecaoAtiva = hayProjecaoAtivaNoServidor();
  const slidePretoFinal = !!(estadoServidor && estadoServidor.slidePretoFinal);
  const telaLimpa = !atual && !proximo && !projecaoAtiva;
  projecao.enviar('exibir_ministrante', {
    titulo: musicaAtiva?.titulo || '',
    atual: slidePretoFinal ? '' : atual,
    proximo: slidePretoFinal ? '' : proximo,
    projecaoAtiva,
    telaLimpa,
    slidePretoFinal,
  });
}

function configurarObserverPreviewMinistrante() {
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (!opA || !opP) return;
  let timer = null;
  const agenda = () => {
    clearTimeout(timer);
    timer = setTimeout(() => emitirEstadoMinistranteAoServidor(), 40);
  };
  const obs = new MutationObserver(() => agenda());
  obs.observe(opA, { childList: true, subtree: true, characterData: true, attributes: true });
  obs.observe(opP, { childList: true, subtree: true, characterData: true, attributes: true });
}

/**
 * As instruções vêm sempre como título + lista de ideias (uma por item), a partir de
 * uma única fonte de texto. No modo slides — onde vivem num balão que só abre ao pedido
 * — saem como lista, uma ideia por linha. Nos outros modos continuam em linha corrida
 * separada por «·», como sempre estiveram na faixa inferior.
 */
function renderInstrucoesProjecao(titulo, itens) {
  const dock = document.getElementById('slides-projecao-instrucoes');
  if (!dock) return;
  if (!itens || !itens.length) {
    dock.innerHTML = titulo || '';
    return;
  }
  if (ehModoSlidesOperador()) {
    const lis = itens.map((t) => `<li>${t}</li>`).join('');
    dock.innerHTML =
      (titulo ? `<div class="slides-instr-tit">${titulo}</div>` : '') +
      `<ul class="slides-instr-lista">${lis}</ul>`;
    return;
  }
  dock.innerHTML = [titulo, ...itens].filter(Boolean).join(' · ');
}

/** Texto da faixa central — também quando só a grelha de slides atualiza (ex.: edição em tempo real). */
function atualizarSlidesInstrucoes() {
  const kb = (t) => `<kbd class="slides-dock-kbd">${t}</kbd>`;
  const atalhosProjecao = [
    `${kb('←')} ${kb('→')} navegam entre os slides`,
    `${kb('ESC')} limpa as telas e desmarca a música (fecha a faixa)`,
    `${kb('F10')} alterna o blackout`,
  ];
  if (ehModoBibliaOperador() && !ehModoSlidesOperador()) {
    renderInstrucoesProjecao('');
    return;
  }
  if (!musicaAtiva || !musicaAtiva.estrofes) {
    if (ehModoSlidesOperador()) {
      renderInstrucoesProjecao('<strong>Modo slides</strong>', [
        'Escolher uma música na playlist só a carrega — não projeta',
        '<strong>Duplo clique na música</strong> começa a projetar na 1.ª estrofe',
        'Na faixa, duplo clique no chip muda o slide',
      ]);
    } else {
      renderInstrucoesProjecao('<strong>Modo controlador</strong>', [
        'A playlist só prepara a música, sem enviar às telas',
        'Na coluna central, <strong>clique</strong> seleciona o slide',
        '<strong>Duplo clique</strong> projeta ou abre a faixa (na 1.ª vez)',
        'Duplo clique no chip da faixa projeta',
      ]);
    }
    return;
  }
  if (ehModoSlidesOperador() && !faixaSlidesHabilitadaPorPlaylistNoModoSlides) {
    renderInstrucoesProjecao('<strong>Modo slides</strong>', [
      'Toque numa música <strong>na playlist à direita</strong> para mostrar os slides aqui',
      'Clique carrega; duplo clique projeta',
      'Música aberta só pelo banco (modo completo) não preenche esta faixa',
    ]);
    return;
  }
  const n = musicaAtiva.estrofes.length;
  if (modoEdicaoEstrofes) {
    renderInstrucoesProjecao(`<strong>Edição</strong> — ${n} slide(s)`, [
      '<strong>Linha vazia</strong> (Enter duplo, sem carácter no meio) cria outro slide na hora',
      'Linha com <strong>um espaço</strong> mantém tudo no mesmo slide',
      '<strong>Encerrar edição</strong> descarta as alterações',
      '<strong>Salvar</strong> grava e sai do modo edição',
      'Arrastar <strong>⋮⋮</strong> reordena os slides',
      'Último cartão = preto',
    ]);
  } else if (ehModoSlidesOperador()) {
    renderInstrucoesProjecao(
      `<strong>${n} slide(s)</strong>`,
      projecaoMusicaEmitidaNoServidor
        ? [
            'Com projeção ativa, <strong>um clique</strong> num chip envia esse slide às telas',
            'Último chip = preto',
            ...atalhosProjecao,
          ]
        : [
            '<strong>Duplo clique na música na playlist</strong> inicia na 1.ª estrofe',
            'Na faixa, <strong>clique</strong> apenas seleciona',
            '<strong>Duplo clique</strong> no chip projeta',
            'Último chip = preto',
            ...atalhosProjecao,
          ]
    );
  } else {
    renderInstrucoesProjecao(`<strong>${n} estrofe(s)</strong>`, [
      'Coluna central: <strong>clique</strong> seleciona, <strong>duplo clique</strong> projeta direto',
      'Faixa inferior: duplo clique no chip projeta',
      'Botão direito no chip abre a edição rápida',
      'Último chip = preto',
      '<strong>Avançar música</strong> carrega a seguinte da playlist',
      ...atalhosProjecao,
    ]);
  }
}

/**
 * Zoom da faixa: à vista, mas inerte enquanto não há slides para dimensionar.
 *
 * Esconder os botões seria mais limpo e pior: o operador deixaria de saber que o controlo
 * existe. Desativado diz «existe, ainda não serve para nada» — que é a verdade do estado
 * ocioso. Fica ao lado do «Avançar música», que já seguia esta regra.
 *
 * @param {boolean} inertes
 */
function definirControlosZoomFaixaSlidesInertes(inertes) {
  ['slides-zoom-menos', 'slides-zoom-mais'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!inertes;
  });
  const grupo = document.querySelector('.slides-dock-zoom-group');
  if (grupo) grupo.classList.toggle('slides-dock-zoom-group--inerte', !!inertes);
}

/**
 * Mensagem no vão da faixa quando ainda não há slides.
 *
 * Sem ela, o modo slides abre com uma área grande e vazia que parece falha de
 * carregamento. Diz só «playlist» de propósito: no modo slides, carregar do banco à
 * esquerda não arma a faixa — mandá-lo lá seria mandá-lo a lado nenhum.
 *
 * @param {boolean} mostrar
 */
function definirVazioDaFaixaSlidesVisivel(mostrar) {
  const el = document.getElementById('slides-grid-vazio');
  if (el) el.hidden = !mostrar;
}

function renderSlidesStrip() {
  const dock = document.getElementById('slides-dock');
  const grid = document.getElementById('slides-grid');
  const nomeEl = document.getElementById('slides-musica-nome');

  try {
  if (ehModoApresentacaoOperador()) {
    dock.classList.add('oculto');
    document.body.classList.remove('slides-rail-aberto');
    return;
  }

  const semMusicaCarregada = !musicaAtiva || !musicaAtiva.estrofes;

  /*
   * Esconder a faixa inteira só se vale para fora do modo slides.
   *
   * Antes, `!musicaAtiva` bastava para esconder — e como este ramo corre primeiro, ao
   * abrir o modo slides o painel aparecia sem barra nenhuma: duas prévias pretas a
   * flutuar no meio do ecrã, sem nada a dizer que falta escolher uma música. O ramo
   * seguinte, que mostra a barra vazia, nunca era alcançado.
   */
  if ((ehModoBibliaOperador() || semMusicaCarregada) && !ehModoSlidesOperador()) {
    dock.classList.add('oculto');
    grid.innerHTML = '';
    grid.style.zoom = '';
    delete grid.dataset.stripMusicaId;
    delete grid.dataset.stripEstrofeCount;
    delete grid.dataset.stripDigest;
    delete grid.dataset.stripProjecao;
    atualizarSlidesInstrucoes();
    document.body.classList.remove('slides-rail-aberto');
    return;
  }

  /**
   * Modo slides ocioso: barra à vista, grelha vazia.
   *
   * Dois caminhos chegam aqui — abrir o modo sem música nenhuma carregada, e música
   * vinda só do banco (modo completo), que não preenche a faixa ao alternar de modo.
   * Assim que a playlist arma uma música, o comportamento volta a ser o de sempre.
   */
  if (ehModoSlidesOperador() && (semMusicaCarregada || !faixaSlidesHabilitadaPorPlaylistNoModoSlides)) {
    dock.classList.toggle('oculto', false);
    if (nomeEl) nomeEl.textContent = '';
    grid.innerHTML = '';
    grid.style.zoom = '';
    delete grid.dataset.stripMusicaId;
    delete grid.dataset.stripEstrofeCount;
    delete grid.dataset.stripDigest;
    delete grid.dataset.stripProjecao;
    document.body.classList.remove('slides-rail-aberto');
    const btnNx = document.getElementById('btn-proxima-musica-playlist');
    if (btnNx) btnNx.disabled = true;
    definirControlosZoomFaixaSlidesInertes(true);
    definirVazioDaFaixaSlidesVisivel(true);
    atualizarSlidesInstrucoes();
    queueMicrotask(() => ajustarEncaixeGrelhaSlidesModoSlides());
    return;
  }

  definirControlosZoomFaixaSlidesInertes(false);
  definirVazioDaFaixaSlidesVisivel(false);

  if (podeAtualizarSomenteAtivoFaixaSlides()) {
    if (nomeEl) nomeEl.textContent = musicaAtiva.titulo || '';
    atualizarSomenteAtivoFaixaSlides();
    dock.classList.toggle('oculto', !ehModoSlidesOperador());
    document.body.classList.toggle(
      'slides-rail-aberto',
      ehModoSlidesOperador() && !!musicaAtiva && !slidesRailUserRecolhido
    );
    atualizarEstadoBtnProximaMusicaPlaylist();
    atualizarSlidesInstrucoes();
    return;
  }

  if (nomeEl) nomeEl.textContent = musicaAtiva.titulo || '';

  /* Esconde a grade enquanto reconstrói e reajusta a fonte; ajustarEncaixe…
     a revela já dimensionada, evitando a «tremida» na troca de música. O
     visibility:hidden preserva o layout, então a medição continua a funcionar. */
  if (ehModoSlidesOperador()) grid.style.visibility = 'hidden';
  grid.innerHTML = '';
  const nEst = musicaAtiva.estrofes.length;
  const idxSlidePreto = nEst;

  musicaAtiva.estrofes.forEach((estrofe, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'slide-chip' + (estrofeAtiva === i ? ' ativo' : '');
    chip.innerHTML = `
      <span class="slide-num">${i + 1}</span>
      <span class="slide-snippet">${textoSlideSnippetHtmlParaChip(estrofe)}</span>
    `;
    chip.onclick = (ev) => {
      ev.preventDefault();
      if (projecaoMusicaEmitidaNoServidor) {
        projetarPorDuploCliqueCentral(i);
        return;
      }
      exibirEstrofe(i);
    };
    if (!projecaoMusicaEmitidaNoServidor) {
      chip.addEventListener('dblclick', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        projetarPorDuploCliqueCentral(i);
      });
    }
    chip.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      abrirMenuContextoSlideStrip(ev.clientX, ev.clientY, i);
    });
    grid.appendChild(chip);
  });

  const chipPreto = document.createElement('button');
  chipPreto.type = 'button';
  chipPreto.className = 'slide-chip slide-chip--preto' + (estrofeAtiva === idxSlidePreto ? ' ativo' : '');
  chipPreto.innerHTML = '';
  chipPreto.setAttribute('aria-label', 'Slide preto');
  chipPreto.onclick = (ev) => {
    ev.preventDefault();
    if (projecaoMusicaEmitidaNoServidor) {
      projetarPorDuploCliqueCentral(idxSlidePreto);
      return;
    }
    exibirEstrofe(idxSlidePreto);
  };
  if (!projecaoMusicaEmitidaNoServidor) {
    chipPreto.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      projetarPorDuploCliqueCentral(idxSlidePreto);
    });
  }
  grid.appendChild(chipPreto);

  /** Faixa inferior de slides existe apenas no modo slides. */
  dock.classList.toggle('oculto', !ehModoSlidesOperador());
  document.body.classList.toggle(
    'slides-rail-aberto',
    ehModoSlidesOperador() && !!musicaAtiva && !slidesRailUserRecolhido
  );

  const btnNx = document.getElementById('btn-proxima-musica-playlist');
  if (btnNx) {
    atualizarEstadoBtnProximaMusicaPlaylist();
  }

  atualizarSlidesInstrucoes();
  grid.dataset.stripMusicaId = String(musicaAtiva.id ?? '');
  grid.dataset.stripEstrofeCount = String(nEst);
  grid.dataset.stripDigest = digestEstrofesParaStripFaixa(musicaAtiva.estrofes);
  grid.dataset.stripProjecao = projecaoMusicaEmitidaNoServidor ? '1' : '0';
  queueMicrotask(() => ajustarEncaixeGrelhaSlidesModoSlides());
  } finally {
    try {
      atualizarNotaSlideControladorUI();
    } catch (_) {
  // intencional — erro ignorado
}
  }
}

let slidesStripCtxSlideIndex = null;
let slideQuickEditIndex = null;

function fecharMenuContextoSlideStrip() {
  const m = document.getElementById('slides-strip-context-menu');
  if (m) {
    m.hidden = true;
    slidesStripCtxSlideIndex = null;
  }
}

function abrirMenuContextoSlideStrip(clientX, clientY, slideIndex) {
  fecharMenuContextoSlideStrip();
  slidesStripCtxSlideIndex = slideIndex;
  const menu = document.getElementById('slides-strip-context-menu');
  if (!menu) return;
  menu.hidden = false;
  menu.style.left = '-9999px';
  menu.style.top = '0';
  const rect = menu.getBoundingClientRect();
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = clientX;
  let y = clientY;
  if (x + rect.width + pad > vw) x = Math.max(pad, vw - rect.width - pad);
  if (y + rect.height + pad > vh) y = Math.max(pad, vh - rect.height - pad);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

function fecharSlideQuickEditModal() {
  const bd = document.getElementById('slide-quick-edit-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  slideQuickEditIndex = null;
}

function abrirSlideQuickEditModal(slideIndex) {
  if (!musicaAtiva || slideIndex < 0 || slideIndex >= musicaAtiva.estrofes.length) return;
  fecharMenuContextoSlideStrip();
  slideQuickEditIndex = slideIndex;
  document.getElementById('slide-quick-edit-num').textContent = String(slideIndex + 1);
  document.getElementById('slide-quick-edit-ta').value = musicaAtiva.estrofes[slideIndex] ?? '';
  const bd = document.getElementById('slide-quick-edit-backdrop');
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    const ta = document.getElementById('slide-quick-edit-ta');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, 50);
}

async function confirmarSlideQuickEdit() {
  const idx = slideQuickEditIndex;
  if (idx === null || !musicaAtiva) return;
  const ta = document.getElementById('slide-quick-edit-ta');
  aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idx, ta.value, { emitSocket: true });
  fecharSlideQuickEditModal();
  await persistirMusicaAtivaNoServidor();
}

function fecharSlideDeleteConfirmModal() {
  const delBd = document.getElementById('slide-delete-confirm-backdrop');
  if (delBd) {
    delBd.hidden = true;
    delBd.setAttribute('aria-hidden', 'true');
  }
}

function abrirSlideDeleteConfirmModal() {
  const idx = slideQuickEditIndex;
  if (idx === null || !musicaAtiva) return;
  const nEl = document.getElementById('slide-delete-confirm-num');
  if (nEl) nEl.textContent = String(idx + 1);
  const delBd = document.getElementById('slide-delete-confirm-backdrop');
  if (!delBd) return;
  delBd.hidden = false;
  delBd.setAttribute('aria-hidden', 'false');
}

async function executarExclusaoSlideConfirmada() {
  const idx = slideQuickEditIndex;
  if (idx === null || !musicaAtiva) return;
  if (musicaAtiva.estrofes.length <= 1) {
    alert('É necessário pelo menos uma estrofe.');
    fecharSlideDeleteConfirmModal();
    return;
  }

  musicaAtiva.estrofes.splice(idx, 1);
  if (estrofeAtiva === idx) estrofeAtiva = Math.max(0, idx - 1);
  else if (estrofeAtiva > idx) estrofeAtiva--;

  if (estrofeAtiva >= musicaAtiva.estrofes.length) {
    estrofeAtiva = musicaAtiva.estrofes.length - 1;
  }

  fecharSlideDeleteConfirmModal();
  fecharSlideQuickEditModal();
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();

  if (
    projecaoMusicaEmitidaNoServidor &&
    projecao.pronta() &&
    musicaAtiva &&
    estrofeAtiva >= 0
  ) {
    emitirEstrofeAoServidor(estrofeAtiva);
  }

  await persistirMusicaAtivaNoServidor();
}

function excluirSlideEdicaoRapida() {
  const idx = slideQuickEditIndex;
  if (idx === null || !musicaAtiva) return;
  if (musicaAtiva.estrofes.length <= 1) {
    alert('É necessário pelo menos uma estrofe.');
    return;
  }
  abrirSlideDeleteConfirmModal();
}

function setupSlidesStripContextMenuEEdicaoRapida() {
  const menu = document.getElementById('slides-strip-context-menu');
  const bd = document.getElementById('slide-quick-edit-backdrop');
  const delBd = document.getElementById('slide-delete-confirm-backdrop');
  document.getElementById('slides-strip-ctx-edit')?.addEventListener('click', () => {
    const i = slidesStripCtxSlideIndex;
    fecharMenuContextoSlideStrip();
    if (i !== null && i >= 0) abrirSlideQuickEditModal(i);
  });
  document.addEventListener('click', (e) => {
    if (menu && !menu.hidden && !menu.contains(e.target)) fecharMenuContextoSlideStrip();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu && !menu.hidden) fecharMenuContextoSlideStrip();
  });
  document.getElementById('slide-quick-edit-cancel')?.addEventListener('click', () => fecharSlideQuickEditModal());
  document.getElementById('slide-quick-edit-save')?.addEventListener('click', () => confirmarSlideQuickEdit());
  document.getElementById('slide-quick-edit-delete')?.addEventListener('click', () => excluirSlideEdicaoRapida());
  /**
   * Só fecha ao clicar «no escuro»: mousedown + mouseup no próprio backdrop.
   * Sem isto, arrastar seleção da textarea para fora termina no backdrop — o navegador
   * sintetiza click no backdrop e fecha o modal inadvertidamente.
   */
  let slideQuickBackdropPointerDown = false;
  bd?.addEventListener('pointerdown', (e) => {
    slideQuickBackdropPointerDown = e.target === bd;
  });
  bd?.addEventListener('pointerup', (e) => {
    if (slideQuickBackdropPointerDown && e.target === bd) fecharSlideQuickEditModal();
    slideQuickBackdropPointerDown = false;
  });
  bd?.addEventListener('pointercancel', () => {
    slideQuickBackdropPointerDown = false;
  });
  document.getElementById('slide-delete-confirm-cancel')?.addEventListener('click', () => fecharSlideDeleteConfirmModal());
  document.getElementById('slide-delete-confirm-excluir')?.addEventListener('click', () => executarExclusaoSlideConfirmada());
  let slideDelBackdropPointerDown = false;
  delBd?.addEventListener('pointerdown', (e) => {
    slideDelBackdropPointerDown = e.target === delBd;
  });
  delBd?.addEventListener('pointerup', (e) => {
    if (slideDelBackdropPointerDown && e.target === delBd) fecharSlideDeleteConfirmModal();
    slideDelBackdropPointerDown = false;
  });
  delBd?.addEventListener('pointercancel', () => {
    slideDelBackdropPointerDown = false;
  });
}

function marcacaoEstrofeEditor() {
  document.querySelectorAll('.estrofe-slide-edit').forEach((el, i) => {
    el.classList.toggle('ativa', estrofeAtiva === i);
  });
}

function metadadosMusicaEditaveisNaHome() {
  return !!musicaAtiva && musicaBancoFonte !== 'catalog';
}

function tituloMusicaEditavelNaHome() {
  return metadadosMusicaEditaveisNaHome();
}

function metadadosMusicaSujosNaHome() {
  if (!metadadosMusicaEditaveisNaHome()) return false;
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (!et || !ea) return false;
  return et.value !== String(musicaAtiva?.titulo || '') || ea.value !== String(musicaAtiva?.artista || '');
}

function atualizarToolbarModoEdicao() {
  const m = !!musicaAtiva;
  const ed = modoEdicaoEstrofes;
  const full = modoLetraCompletaCentral;
  const emModoEdicaoVisual = ed || full;
  const btnNova = document.getElementById('btn-criar-nova-versao');
  const btnSalvar = document.getElementById('btn-salvar-musica');
  const fromCatalog = m && musicaBancoFonte === 'catalog';
  const metadadosEditaveis = metadadosMusicaEditaveisNaHome();
  const tituloEditavel = tituloMusicaEditavelNaHome();
  const metadadosSujos = metadadosMusicaSujosNaHome();
  if (btnNova) {
    btnNova.disabled = !m || ed || full || fromCatalog;
    btnNova.style.display = m && !ed && !full && !fromCatalog ? '' : 'none';
  }
  document.getElementById('btn-editar-letra').disabled = !m || ed || full;
  document.getElementById('btn-editar-letra').style.display = (m && !ed && !full) ? '' : 'none';
  document.getElementById('btn-encerrar-edicao').style.display = (m && ed) ? '' : 'none';
  if (btnSalvar) {
    btnSalvar.style.display = (m && (ed || metadadosSujos) && !fromCatalog) ? '' : 'none';
    btnSalvar.disabled = !m || fromCatalog || (!ed && !metadadosSujos);
  }
  document.getElementById('btn-nova-estrofe').style.display = (m && ed && !full) ? '' : 'none';
  document.getElementById('btn-nova-estrofe').disabled = !m || !ed || full;
  const bAnt = document.getElementById('btn-seta-anterior');
  const bProx = document.getElementById('btn-seta-proxima');
  const bSair = document.getElementById('btn-sair-projecao');
  /* Navegar/encerrar só faz sentido com música carregada — sem o `m` estas
     ficavam visíveis sobre o placeholder «Escolha uma música…». */
  const mostrarNavegacaoProjecao = m && !emModoEdicaoVisual;
  if (bAnt) bAnt.style.display = mostrarNavegacaoProjecao ? '' : 'none';
  if (bProx) bProx.style.display = mostrarNavegacaoProjecao ? '' : 'none';
  if (bSair) bSair.style.display = mostrarNavegacaoProjecao ? '' : 'none';
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (et) {
    et.disabled = !tituloEditavel;
    et.readOnly = !tituloEditavel;
    et.title = '';
  }
  if (ea) {
    ea.disabled = !metadadosEditaveis;
    ea.readOnly = !metadadosEditaveis;
  }

  /* Ações contextuais da cópia (Editar nome / Apagar cópia): só aparecem quando
     há uma cópia selecionada (não ORIGINAL) e fora do modo edição — somem, não
     ficam desabilitadas. Os separadores acompanham a visibilidade dos grupos. */
  const copiaSel = versaoCopiaSelecionadaAtual();
  const mostrarAcoesCopia = !!copiaSel && !ed && !full;
  const btnEditarNome = document.getElementById('btn-editar-nome-versao');
  const btnApagarCopia = document.getElementById('btn-apagar-copia-versao');
  if (btnEditarNome) btnEditarNome.style.display = mostrarAcoesCopia ? '' : 'none';
  if (btnApagarCopia) btnApagarCopia.style.display = mostrarAcoesCopia ? '' : 'none';
  const sep1 = document.getElementById('toolbar-sep-1');
  const sep2 = document.getElementById('toolbar-sep-2');
  if (sep1) sep1.style.display = mostrarAcoesCopia ? '' : 'none';
  if (sep2) sep2.style.display = mostrarNavegacaoProjecao ? '' : 'none';

  /* Sem música a linha fica sem nenhum botão: esconder remove também a
     divisória que ela desenha por baixo dos campos de título/artista. */
  document
    .getElementById('centro-toolbar-acoes')
    ?.classList.toggle('centro-toolbar-acoes--sem-musica', !m);

  atualizarToolbarModoLetraCompleta();
}

function juntarEstrofesParaLetraCompleta() {
  if (!musicaAtiva?.estrofes) return '';
  return musicaAtiva.estrofes
    .map((s) => String(s ?? '').replace(/\r\n/g, '\n').replace(/\s+$/, ''))
    .join('\n\n');
}

/** Converte o texto do painel «letra completa» de volta em estrofes (mesma regra de linhas vazias do resto do sistema). */
function splitTextoLetraCompletaEmEstrofes(texto) {
  return splitTextoEmEstrofesPorLinhaVaziaStrict(texto);
}

/**
 * Divisórias entre estrofes no modo «letra completa».
 *
 * Um `<textarea>` desenha apenas texto puro, portanto as linhas não podem ser filhas dele.
 * A alternativa seria trocá-lo por blocos `contenteditable`, o que sacrificaria o histórico
 * de desfazer nativo, o IME e a colagem sanitizada. Em vez disso desenha-se numa camada por
 * baixo, e o textarea — que continua a ser a única fonte de verdade — fica transparente.
 *
 * Para saber onde cai cada linha em branco (que pode estar deslocada por quebras suaves de
 * linhas longas), o texto é reproduzido num espelho invisível que copia as métricas
 * tipográficas do textarea em tempo de execução, via `getComputedStyle`. Copiar em vez de
 * duplicar valores no CSS evita que as guias se desalinhem se a tipografia do painel mudar.
 *
 * Nada aqui lê ou escreve `musicaAtiva`: é estritamente decorativo.
 */
const guiasEstrofesLetraCompleta = (() => {
  /**
   * Propriedades que afetam a disposição do texto e têm de ser idênticas no espelho.
   * As larguras de borda ficam de fora de propósito: a camada `.centro-letra-completa-guias`
   * já tem uma borda transparente da mesma espessura, e o filho posicionado em absoluto
   * ancora no interior dela — copiá-las aqui contaria o desvio duas vezes.
   */
  const PROPS_METRICA = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent', 'textTransform',
    'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ];

  let espelho = null;
  let desloca = null;
  let agendado = false;

  function elementos() {
    const ta = document.getElementById('centro-letra-completa-ta');
    const guias = document.getElementById('centro-letra-completa-guias');
    if (!ta || !guias) return null;
    if (!desloca || desloca.parentNode !== guias) {
      guias.innerHTML = '';
      desloca = document.createElement('div');
      desloca.className = 'centro-letra-completa-guias-desloca';
      espelho = document.createElement('div');
      espelho.className = 'centro-letra-completa-espelho';
      desloca.appendChild(espelho);
      guias.appendChild(desloca);
    }
    return { ta, guias };
  }

  /**
   * Índices das linhas em branco que separam de facto duas estrofes.
   * Espelha `splitTextoEmEstrofesPorLinhaVaziaStrict`: corridas de linhas vazias contam
   * como um único corte, e vazios no início/fim não separam nada.
   * @param {string[]} linhas
   * @returns {number[]}
   */
  function indicesLinhasSeparadoras(linhas) {
    const idx = [];
    let viuConteudo = false;
    let inicioCorrida = -1;
    for (let i = 0; i < linhas.length; i++) {
      if (linhas[i] === '') {
        if (viuConteudo && inicioCorrida === -1) inicioCorrida = i;
        continue;
      }
      /* Só é separadora se houver conteúdo antes e depois. */
      if (inicioCorrida !== -1) idx.push(inicioCorrida);
      inicioCorrida = -1;
      viuConteudo = true;
    }
    return idx;
  }

  function desenhar() {
    agendado = false;
    const els = elementos();
    if (!els) return;
    const { ta, guias } = els;
    if (!modoLetraCompletaCentral || guias.offsetParent === null) {
      espelho.textContent = '';
      desloca.querySelectorAll('.centro-letra-completa-guia').forEach((n) => n.remove());
      return;
    }

    const cs = getComputedStyle(ta);
    PROPS_METRICA.forEach((p) => {
      espelho.style[p] = cs[p];
    });
    /* `clientWidth` já exclui a barra de deslocamento — a largura útil bate certo. */
    espelho.style.width = `${ta.clientWidth}px`;
    espelho.style.border = '0';
    desloca.style.width = `${ta.clientWidth}px`;

    const linhas = String(ta.value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');
    const separadoras = indicesLinhasSeparadoras(linhas);

    desloca.querySelectorAll('.centro-letra-completa-guia').forEach((n) => n.remove());
    if (!separadoras.length) {
      espelho.textContent = '';
      desloca.style.transform = 'translateY(0px)';
      return;
    }

    /* Espelho = mesmo texto, com marcas de largura zero no início das linhas separadoras.
       Marcas em linha e vazias não alteram a quebra de linha, mas dão-nos o `offsetTop`. */
    espelho.textContent = '';
    const marcas = [];
    const alvo = new Set(separadoras);
    linhas.forEach((linha, i) => {
      if (i > 0) espelho.appendChild(document.createTextNode('\n'));
      if (alvo.has(i)) {
        const marca = document.createElement('span');
        espelho.appendChild(marca);
        marcas.push(marca);
      }
      if (linha !== '') espelho.appendChild(document.createTextNode(linha));
    });

    const alturaLinha = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    /* Recuo igual ao do texto, para a régua não invadir o espaço da barra de deslocamento. */
    const recuoEsq = cs.paddingLeft;
    const recuoDir = cs.paddingRight;
    marcas.forEach((marca) => {
      const regua = document.createElement('div');
      regua.className = 'centro-letra-completa-guia';
      regua.style.top = `${Math.round(marca.offsetTop + alturaLinha / 2)}px`;
      regua.style.left = recuoEsq;
      regua.style.right = recuoDir;
      desloca.appendChild(regua);
    });

    desloca.style.transform = `translateY(${-ta.scrollTop}px)`;
  }

  function sincronizarDeslocamento() {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (!ta || !desloca) return;
    desloca.style.transform = `translateY(${-ta.scrollTop}px)`;
  }

  /** Recalcula na próxima pintura (agrupa rajadas de `input`). */
  function agendar() {
    if (agendado) return;
    agendado = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(desenhar);
    else setTimeout(desenhar, 0);
  }

  function ligar() {
    const els = elementos();
    if (!els) return;
    const { ta } = els;
    if (ta.dataset.guiasLigadas === '1') {
      agendar();
      return;
    }
    ta.dataset.guiasLigadas = '1';
    ta.addEventListener('input', agendar);
    ta.addEventListener('scroll', sincronizarDeslocamento, { passive: true });
    window.addEventListener('resize', agendar);
    if (typeof ResizeObserver === 'function') {
      /* O textarea tem `resize: vertical`; o operador pode arrastá-lo. */
      new ResizeObserver(agendar).observe(ta);
    }
    agendar();
  }

  return { ligar, agendar };
})();

function atualizarTextoPainelLetraCompleta() {
  const ta = document.getElementById('centro-letra-completa-ta');
  if (!ta || !musicaAtiva?.estrofes) return;
  if (!modoLetraCompletaCentral) return;
  ta.value = juntarEstrofesParaLetraCompleta();
  guiasEstrofesLetraCompleta.agendar();
}

/**
 * @param {{ preencherTextarea?: boolean }} opts — Se true, preenche o textarea a partir de `musicaAtiva.estrofes` (ex.: ao abrir o modo). Se false, só ajusta visibilidade (não apaga o que o utilizador está a editar).
 */
function aplicarLayoutModoLetraCompleta(opts = {}) {
  const preencherTextarea = opts.preencherTextarea === true;
  const ed = document.getElementById('estrofes-slide-editor');
  const full = document.getElementById('centro-letra-completa-wrap');
  if (!ed || !full) return;
  if (!musicaAtiva) {
    modoLetraCompletaCentral = false;
    snapshotLetraCompleta = null;
    full.hidden = true;
    ed.style.display = '';
    return;
  }
  const on = modoLetraCompletaCentral;
  full.hidden = !on;
  ed.style.display = on ? 'none' : '';
  if (on && preencherTextarea) atualizarTextoPainelLetraCompleta();
  /* As guias só medem com o painel visível — (re)calcular sempre que ele alterna. */
  if (on) guiasEstrofesLetraCompleta.ligar();
  else guiasEstrofesLetraCompleta.agendar();
}

/** Grava o conteúdo do textarea de letra completa em `musicaAtiva.estrofes` e atualiza faixa/previews. */
function sincronizarEstrofesDesdeTextareaLetraCompleta() {
  if (!musicaAtiva) return;
  const ta = document.getElementById('centro-letra-completa-ta');
  if (!ta) return;
  const novas = splitTextoLetraCompletaEmEstrofes(ta.value);
  musicaAtiva.estrofes = novas;
  const n = novas.length;
  const idxPreto = n;
  if (estrofeAtiva > idxPreto) estrofeAtiva = idxPreto;
  if (estrofeAtiva < -1) estrofeAtiva = -1;
  renderSlidesStrip();
  atualizarPreviewOperador();
  renderEstrofesEditor();
  marcacaoEstrofeEditor();
  if (
    projecaoMusicaEmitidaNoServidor &&
    projecao.pronta() &&
    estrofeAtiva >= 0 &&
    estrofeAtiva < n
  ) {
    projecao.enviar('exibir_musica', montarPayloadExibirMusica(estrofeAtiva));
  }
}

function normalizarEstrofesParaCmp(arr) {
  return (arr || []).map((s) => String(s ?? '').replace(/\r\n/g, '\n'));
}

function estrofesArraysIguaisParaEdicao(a, b) {
  const aa = normalizarEstrofesParaCmp(a);
  const bb = normalizarEstrofesParaCmp(b);
  if (aa.length !== bb.length) return false;
  return aa.every((s, i) => s === bb[i]);
}

/** Estrofes atuais do editor por slides (textareas) ou de `musicaAtiva`. */
function obterEstrofesAtuaisDaEdicao() {
  if (!musicaAtiva) return [];
  if (modoEdicaoEstrofes) {
    const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
    if (tas.length) {
      const novas = [];
      for (const ta of tas) novas.push(...splitTextoEmEstrofesPorLinhaVaziaStrict(ta.value));
      return novas.length ? novas : [''];
    }
  }
  if (modoLetraCompletaCentral) {
    const ta = document.getElementById('centro-letra-completa-ta');
    if (ta) return splitTextoLetraCompletaEmEstrofes(ta.value);
  }
  return (musicaAtiva.estrofes || []).map((s) => String(s ?? ''));
}

function letraCompletaSujaVsSnapshot() {
  if (!modoLetraCompletaCentral || !snapshotLetraCompleta) return false;
  const ta = document.getElementById('centro-letra-completa-ta');
  if (!ta) return false;
  return !estrofesArraysIguaisParaEdicao(
    splitTextoLetraCompletaEmEstrofes(ta.value),
    snapshotLetraCompleta.estrofes
  );
}

function edicaoEstrofesSujaVsSnapshot() {
  if (!modoEdicaoEstrofes || !musicaAtiva || !snapshotEdicaoEstrofes) return false;
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  const titulo = et ? et.value : String(musicaAtiva.titulo || '');
  const artista = ea ? ea.value : String(musicaAtiva.artista || '');
  if (titulo !== String(snapshotEdicaoEstrofes.titulo || '')) return true;
  if (artista !== String(snapshotEdicaoEstrofes.artista || '')) return true;
  return !estrofesArraysIguaisParaEdicao(obterEstrofesAtuaisDaEdicao(), snapshotEdicaoEstrofes.estrofes);
}

function temEdicaoMusicaNaoGravada() {
  if (metadadosMusicaSujosNaHome()) return true;
  if (edicaoEstrofesSujaVsSnapshot()) return true;
  if (letraCompletaSujaVsSnapshot()) return true;
  return false;
}

function limparFlagsModoEdicaoMusica() {
  snapshotEdicaoEstrofes = null;
  modoEdicaoEstrofes = false;
  snapshotLetraCompleta = null;
  modoLetraCompletaCentral = false;
  aplicarLayoutModoLetraCompleta();
}

/**
 * Se houver edições só em memória, pede confirmação antes de trocar de música/contexto.
 * @returns {Promise<boolean>} true para prosseguir (descartando ou sem sujo).
 */
async function confirmarProsseguirDescartandoEdicaoPendente(mensagem, titulo) {
  if (!temEdicaoMusicaNaoGravada()) {
    if (modoEdicaoEstrofes || modoLetraCompletaCentral) limparFlagsModoEdicaoMusica();
    return true;
  }
  const ok = await appConfirm(
    mensagem || 'Há alterações não gravadas nesta sessão. Descartar e continuar?',
    titulo || 'Alterações não gravadas'
  );
  if (!ok) return false;
  limparFlagsModoEdicaoMusica();
  return true;
}

async function alternarModoLetraCompletaCentral() {
  if (!musicaAtiva) return;
  if (modoLetraCompletaCentral) {
    const suja = letraCompletaSujaVsSnapshot();
    sincronizarEstrofesDesdeTextareaLetraCompleta();
    if (suja) {
      if (musicaBancoFonte === 'catalog') {
        await appAlert(
          'Música do catálogo: as alterações ficam só nesta sessão. Importe para o seu banco para gravar de forma permanente.',
          'Catálogo'
        );
      } else {
        const ok = await persistirMusicaAtivaNoServidor();
        if (!ok) return;
        // Persistência já recarrega a música e limpa os modos; reforça layout.
        limparFlagsModoEdicaoMusica();
        atualizarToolbarModoEdicao();
        return;
      }
    }
    snapshotLetraCompleta = null;
    modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
    atualizarToolbarModoEdicao();
    return;
  }
  snapshotLetraCompleta = {
    estrofes: musicaAtiva.estrofes.map((s) => String(s ?? '')),
    estrofeAtiva,
  };
  modoLetraCompletaCentral = true;
  aplicarLayoutModoLetraCompleta({ preencherTextarea: true });
  atualizarToolbarModoEdicao();
}

/** Sai do modo letra completa sem aplicar o textarea — restaura o estado de quando entrou. */
function cancelarModoLetraCompletaCentral() {
  if (!modoLetraCompletaCentral) return;
  if (snapshotLetraCompleta && musicaAtiva) {
    musicaAtiva.estrofes = snapshotLetraCompleta.estrofes.map((s) => String(s));
    estrofeAtiva = snapshotLetraCompleta.estrofeAtiva;
    const n = musicaAtiva.estrofes.length;
    const idxPreto = n;
    if (estrofeAtiva > idxPreto) estrofeAtiva = idxPreto;
    if (estrofeAtiva < -1) estrofeAtiva = -1;
    renderSlidesStrip();
    atualizarPreviewOperador();
    renderEstrofesEditor();
    marcacaoEstrofeEditor();
    if (
      projecaoMusicaEmitidaNoServidor &&
      projecao.pronta() &&
      estrofeAtiva >= 0 &&
      estrofeAtiva < n
    ) {
      projecao.enviar('exibir_musica', montarPayloadExibirMusica(estrofeAtiva));
    }
  }
  snapshotLetraCompleta = null;
  modoLetraCompletaCentral = false;
  aplicarLayoutModoLetraCompleta();
  atualizarToolbarModoEdicao();
}

function atualizarToolbarModoLetraCompleta() {
  const btn = document.getElementById('btn-modo-letra-completa');
  const btnCancelar = document.getElementById('btn-cancelar-letra-completa');
  if (!btn) return;
  const m = !!musicaAtiva;
  const mostrar = m && !modoEdicaoEstrofes;
  btn.style.display = mostrar ? '' : 'none';
  btn.disabled = !mostrar;
  btn.textContent = modoLetraCompletaCentral ? 'SALVAR ALTERAÇÕES' : 'MODO LETRA COMPLETA';
  // Toggle explícito: inativo = outline neutro, ativo = preenchido.
  btn.setAttribute('aria-pressed', modoLetraCompletaCentral ? 'true' : 'false');
  btn.classList.toggle('ativo', !!modoLetraCompletaCentral);
  btn.title = modoLetraCompletaCentral
    ? 'Gravar a letra no banco local e voltar aos cartões por slide'
    : 'Editar ou copiar a letra inteira num só texto';
  if (btnCancelar) {
    btnCancelar.style.display = mostrar && modoLetraCompletaCentral ? '' : 'none';
    btnCancelar.disabled = !mostrar || !modoLetraCompletaCentral;
  }
}

function configurarCamposMetadadosMusicaHome() {
  const atualizar = () => atualizarToolbarModoEdicao();
  document.getElementById('edit-titulo')?.addEventListener('input', atualizar);
  document.getElementById('edit-artista')?.addEventListener('input', atualizar);
}

function entrarModoEdicao() {
  if (!musicaAtiva) return;
  if (modoLetraCompletaCentral) {
    sincronizarEstrofesDesdeTextareaLetraCompleta();
    snapshotLetraCompleta = null;
    modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
  }
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (et) musicaAtiva.titulo = et.value;
  if (ea) musicaAtiva.artista = ea.value;
  snapshotEdicaoEstrofes = {
    titulo: musicaAtiva.titulo,
    artista: musicaAtiva.artista || '',
    estrofes: musicaAtiva.estrofes.map((s) => String(s ?? '')),
    estrofeAtiva,
  };
  modoEdicaoEstrofes = true;
  renderEstrofesEditor();
}

async function sairModoEdicao() {
  if (edicaoEstrofesSujaVsSnapshot()) {
    const ok = await appConfirm(
      'Há alterações não gravadas. Descartar e sair do modo edição? Use «Salvar alterações» para gravar no banco.',
      'Encerrar edição'
    );
    if (!ok) return;
  }
  if (snapshotEdicaoEstrofes && musicaAtiva && modoEdicaoEstrofes) {
    musicaAtiva.titulo = snapshotEdicaoEstrofes.titulo;
    musicaAtiva.artista = snapshotEdicaoEstrofes.artista;
    musicaAtiva.estrofes = snapshotEdicaoEstrofes.estrofes.map((s) => String(s));
    estrofeAtiva = snapshotEdicaoEstrofes.estrofeAtiva;
    const n = musicaAtiva.estrofes.length;
    const idxPreto = n;
    if (estrofeAtiva > idxPreto) estrofeAtiva = idxPreto;
    if (estrofeAtiva < -1) estrofeAtiva = -1;
  }
  snapshotEdicaoEstrofes = null;
  modoEdicaoEstrofes = false;
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();
}

/** Altura mínima equivalente a 5 linhas (13px × 1.55). */
function alturaMinimaTextoEstrofePx(el) {
  if (!el) return 5 * 13 * 1.55;
  const cs = getComputedStyle(el);
  const fs = parseFloat(cs.fontSize) || 13;
  const lhRaw = cs.lineHeight;
  let lhPx;
  if (!lhRaw || lhRaw === 'normal') {
    lhPx = fs * 1.55;
  } else if (lhRaw.endsWith('px')) {
    lhPx = parseFloat(lhRaw);
  } else {
    const ratio = parseFloat(lhRaw);
    lhPx = Number.isFinite(ratio) ? ratio * fs : fs * 1.55;
  }
  return 5 * lhPx;
}

/**
 * Modo edição: altura mínima 5 linhas; expande até caber scrollHeight (várias passagens por causa do wrap).
 * Modo exibição: só CSS — `.estrofe-slide-view-body` em fluxo, sem altura fixa em JS.
 */
function aplicarAlturaTextareaEstrofe(ta) {
  if (!ta || !ta.classList.contains('estrofe-slide-ta')) return;

  const apply = () => {
    const minH = alturaMinimaTextoEstrofePx(ta);
    ta.style.maxHeight = 'none';
    ta.style.minHeight = minH + 'px';
    ta.style.overflow = 'hidden';
    for (let i = 0; i < 5; i++) {
      ta.style.height = 'auto';
      ta.style.height = Math.max(minH, ta.scrollHeight) + 'px';
    }
    ta.style.overflow = 'auto';
  };
  apply();
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

function aplicarAlturaCardEstrofe(cardEl) {
  if (!cardEl) return;
  const ta = cardEl.querySelector('.estrofe-slide-ta');
  if (ta) aplicarAlturaTextareaEstrofe(ta);
}

function reaplicarAlturasEstrofesEditor() {
  const wrap = document.getElementById('estrofes-slide-editor');
  if (!wrap || !musicaAtiva || !musicaAtiva.estrofes) return;
  wrap.querySelectorAll('.estrofe-slide-edit').forEach((card) => {
    aplicarAlturaCardEstrofe(card);
  });
}

function reorderEstrofesIndices(from, to) {
  if (!musicaAtiva || !modoEdicaoEstrofes) return;
  const arr = musicaAtiva.estrofes;
  const n = arr.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;

  const snapAtiva =
    estrofeAtiva >= 0 && estrofeAtiva < n ? arr[estrofeAtiva] : null;

  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);

  if (snapAtiva !== null) {
    const idx = arr.indexOf(snapAtiva);
    estrofeAtiva = idx >= 0 ? idx : Math.max(0, Math.min(estrofeAtiva, arr.length - 1));
  }

  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();
}

function renderEstrofesEditor() {
  const wrap = document.getElementById('estrofes-slide-editor');

  if (!musicaAtiva) {
    modoEdicaoEstrofes = false;
    snapshotEdicaoEstrofes = null;
    modoLetraCompletaCentral = false;
    wrap.classList.remove('estrofes-modo-edicao');
    wrap.classList.add('estrofes-slide-editor--vazio');
    atualizarToolbarModoEdicao();
    wrap.innerHTML =
      '<div class="placeholder-msg placeholder-msg--escolha-musica">Escolha uma música na playlist (à direita) ou no banco (à esquerda).</div>';
    atualizarSlidesInstrucoes();
    document.getElementById('edit-titulo').value = '';
    document.getElementById('edit-artista').value = '';
    aplicarLayoutModoLetraCompleta();
    return;
  }

  document.getElementById('edit-titulo').value = musicaAtiva.titulo;
  document.getElementById('edit-artista').value = musicaAtiva.artista || '';

  wrap.classList.remove('estrofes-slide-editor--vazio');
  wrap.classList.toggle('estrofes-modo-edicao', modoEdicaoEstrofes);

  atualizarToolbarModoEdicao();

  wrap.innerHTML = '';
  musicaAtiva.estrofes.forEach((txt, i) => {
    let centralSlideTapTimer = null;
    const div = document.createElement('div');
    div.className = 'estrofe-slide-edit' + (estrofeAtiva === i ? ' ativa' : '');
    if (modoEdicaoEstrofes) {
      div.title =
        'Edição · arrastar ⋮⋮ para reordenar · duplo clique fora do texto para projetar';
    } else if (ehModoSlidesOperador()) {
      div.title = 'Duplo clique para projetar nas telas';
    } else {
      const base =
        slidesDockVisivel
          ? 'Clique para selecionar · duplo clique para projetar nas telas'
          : 'Clique para selecionar · duplo clique para projetar nas telas';
      div.title = `${base} · Botão ✎ ou clique direito: edição rápida`;
    }

    if (modoEdicaoEstrofes) {
      div.innerHTML = `
        <div class="estrofe-slide-toolbar">
          <div class="estrofe-slide-toolbar-left">
            <span class="estrofe-drag-handle" draggable="true" data-drag-from="${i}" title="Arrastar para reordenar">⋮⋮</span>
            <span class="estrofe-num-big">${i + 1}</span>
          </div>
          <button type="button" class="btn sm danger btn-del-estrofe" data-i="${i}" title="Remover estrofe">✕</button>
        </div>
        <textarea class="estrofe-slide-ta" data-i="${i}" spellcheck="false"></textarea>
      `;
      div.querySelector('textarea').value = txt;
      const taEst = div.querySelector('textarea');
      taEst.addEventListener('focus', () => aplicarAlturaCardEstrofe(div));
      taEst.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.i, 10);
        const val = e.target.value;
        const parts = splitTextoEmEstrofesPorLinhaVaziaStrict(val);
        if (parts.length > 1) {
          ignorarBlurSeparacaoEstrofeIdx = idx;
          aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idx, val, {
            emitSocket: true,
            posCaretAposSplit: idx + parts.length - 1,
          });
          setTimeout(() => {
            if (ignorarBlurSeparacaoEstrofeIdx === idx) ignorarBlurSeparacaoEstrofeIdx = null;
          }, 0);
          return;
        }
        musicaAtiva.estrofes[idx] = val;
        aplicarAlturaCardEstrofe(div);
        renderSlidesStrip();
        atualizarPreviewOperador();
      });
      taEst.addEventListener('blur', (e) => {
        const t = e.target;
        if (!t.isConnected) return;
        const idxBlur = parseInt(t.dataset.i, 10);
        if (ignorarBlurSeparacaoEstrofeIdx === idxBlur) {
          ignorarBlurSeparacaoEstrofeIdx = null;
          return;
        }
        aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idxBlur, t.value, { emitSocket: true });
      });
      div.querySelector('.btn-del-estrofe').addEventListener('click', (e) => {
        e.stopPropagation();
        removerEstrofeEditor(parseInt(e.currentTarget.dataset.i, 10));
      });

      const handle = div.querySelector('.estrofe-drag-handle');
      handle.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', String(i));
        e.dataTransfer.effectAllowed = 'move';
        div.classList.add('dragging-reorder');
      });
      handle.addEventListener('dragend', () => {
        div.classList.remove('dragging-reorder');
        wrap.querySelectorAll('.estrofe-slide-edit').forEach((el) =>
          el.classList.remove('drag-over-reorder'));
      });
      div.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        div.classList.add('drag-over-reorder');
      });
      div.addEventListener('dragleave', () => div.classList.remove('drag-over-reorder'));
      div.addEventListener('drop', (e) => {
        e.preventDefault();
        div.classList.remove('drag-over-reorder');
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const to = i;
        if (!Number.isFinite(from)) return;
        reorderEstrofesIndices(from, to);
      });
    } else {
      const quickBtn = !ehModoSlidesOperador()
        ? `<button type="button" class="btn sm btn-estrofe-quick" data-i="${i}" title="Edição rápida">✎</button>`
        : '';
      div.innerHTML = `
        <div class="estrofe-slide-toolbar">
          <div class="estrofe-slide-toolbar-left">
            <span class="estrofe-num-big">${i + 1}</span>
          </div>
          ${quickBtn}
        </div>
      `;
      const body = document.createElement('div');
      body.className = 'estrofe-slide-view-body';
      body.textContent = txt;
      div.appendChild(body);

      if (!ehModoSlidesOperador()) {
        div.querySelector('.btn-estrofe-quick')?.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          abrirSlideQuickEditModal(i);
        });
        div.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          abrirSlideQuickEditModal(i);
        });
      }

      div.addEventListener('click', (e) => {
        if (ehModoSlidesOperador()) return;
        if (e.target.closest('.btn-del-estrofe')) return;
        if (e.target.closest('.btn-estrofe-quick')) return;
        clearTimeout(centralSlideTapTimer);
        centralSlideTapTimer = setTimeout(() => {
          centralSlideTapTimer = null;
          if (projecaoMusicaEmitidaNoServidor) {
            projetarPorDuploCliqueCentral(i);
            return;
          }
          exibirEstrofe(i);
          renderSlidesStrip();
          atualizarPreviewOperador();
          renderEstrofesEditor();
          marcacaoEstrofeEditor();
        }, 280);
      });
    }

    div.addEventListener('dblclick', (e) => {
      if (modoEdicaoEstrofes && e.target.closest('textarea')) return;
      if (e.target.closest('.btn-del-estrofe')) return;
      if (e.target.closest('.btn-estrofe-quick')) return;
      e.preventDefault();
      clearTimeout(centralSlideTapTimer);
      centralSlideTapTimer = null;
      if (ehModoSlidesOperador()) {
        projetarPorDuploCliqueCentral(i);
        return;
      }
      // Modo completo: duplo clique entra no modo slides e já projeta o slide.
      alternarModoSlidesOperador();
      faixaSlidesHabilitadaPorPlaylistNoModoSlides = true;
      projetarPorDuploCliqueCentral(i);
    });

    wrap.appendChild(div);
  });

  queueMicrotask(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => reaplicarAlturasEstrofesEditor()));
  });

  atualizarSlidesInstrucoes();
  aplicarLayoutModoLetraCompleta({ preencherTextarea: false });
}

function novaEstrofe() {
  if (!musicaAtiva || !modoEdicaoEstrofes || modoLetraCompletaCentral) return;
  const n = musicaAtiva.estrofes.length;
  let insertAt;
  if (estrofeAtiva < 0) insertAt = 0;
  else if (estrofeAtiva >= n) insertAt = n;
  else insertAt = estrofeAtiva + 1;
  musicaAtiva.estrofes.splice(insertAt, 0, '');
  exibirEstrofe(insertAt);
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
}

function removerEstrofeEditor(index) {
  if (!modoEdicaoEstrofes) return;
  if (!musicaAtiva || musicaAtiva.estrofes.length <= 1) {
    alert('É necessário pelo menos uma estrofe.');
    return;
  }
  musicaAtiva.estrofes.splice(index, 1);
  if (estrofeAtiva === index) estrofeAtiva = Math.max(0, index - 1);
  else if (estrofeAtiva > index) estrofeAtiva--;

  if (estrofeAtiva >= musicaAtiva.estrofes.length) {
    estrofeAtiva = musicaAtiva.estrofes.length - 1;
  }

  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
}

async function persistirMusicaAtivaNoServidor() {
  if (!musicaAtiva) {
    alert('Nenhuma música selecionada.');
    return false;
  }

  if (musicaBancoFonte === 'catalog') {
    alert('Música do catálogo: não é possível gravar no banco local.');
    return false;
  }

  const idNum = Number(musicaAtiva.id);
  if (!Number.isFinite(idNum)) {
    alert('ID da música inválido.');
    return false;
  }

  const titulo = document.getElementById('edit-titulo').value.trim();
  if (!titulo) {
    alert('Informe o título da música.');
    return false;
  }

  aplicarSplitsEstrofesDosTextareasAntesDePersistir();

  musicaAtiva.titulo = titulo;
  musicaAtiva.artista = document.getElementById('edit-artista').value.trim();

  const estrofesPayload = (musicaAtiva.estrofes || []).map((s) =>
    typeof s === 'string' ? s : String(s ?? '')
  );
  const versaoLocalIdAtiva =
    musicaVersaoLocalId && String(musicaVersaoLocalId).trim() ? String(musicaVersaoLocalId) : null;
  const idPersistencia = Number(musicaAtiva.id);
  /* Capturado antes de gravar: se o servidor bifurcar, é por aqui que se acha a entrada da playlist a repontar. */
  const rootAntesDeGravar = obterRootIdMusicaAtiva();
  const versaoPlaylistAntesDeGravar = versaoAtivaParaCompararPlaylist();
  const cultoDaEdicao = cultoId;

  const api = getControllerApiBase();

  async function aplicarMusicaRecarregada(idAlvo, forked) {
    await carregarMusicas();
    const res2 = await fetch(`${api}/api/musicas/${idAlvo}`);
    if (!res2.ok) throw new Error('Não foi possível recarregar a música.');
    musicaAtiva = await res2.json();
    musicaBancoFonte = 'user';
    musicaVersaoLocalId = null;
    musicaRootId = Number(musicaAtiva.root_id ?? musicaAtiva.id);
    document.getElementById('edit-titulo').value = musicaAtiva.titulo;
    document.getElementById('edit-artista').value = musicaAtiva.artista || '';
    snapshotEdicaoEstrofes = null;
    modoEdicaoEstrofes = false;
    snapshotLetraCompleta = null;
    modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
    refreshListaBanco();
    renderPlaylist();
    await carregarVersoesMusicaServidor(musicaRootId);
    renderMusicaVersoesBar();
    renderEstrofesEditor();
    renderSlidesStrip();
    atualizarPreviewOperador();
    atualizarToolbarModoEdicao();
    if (forked) {
      await appAlert(
        'As alterações foram gravadas numa nova cópia. O original no servidor foi preservado.',
        'Cópia criada'
      );
    }
  }

  if (versaoLocalIdAtiva && ehVersaoLocalLegada(versaoLocalIdAtiva)) {
    const rootLegado = obterRootIdMusicaAtiva() ?? idNum;
    const up = atualizarCopiaLocal(rootLegado, versaoLocalIdAtiva, {
      titulo,
      artista: musicaAtiva.artista,
      estrofes: estrofesPayload,
    });
    if (!up.ok) {
      alert(up.erro || 'Não foi possível atualizar a cópia.');
      return false;
    }
    await carregarVersoesMusicaServidor(obterRootIdMusicaAtiva() ?? idNum);
    renderMusicaVersoesBar();
    return true;
  }

  try {
    const bodyJson = JSON.stringify({
      titulo,
      artista: musicaAtiva.artista,
      estrofes: estrofesPayload,
    });
    let res = await fetch(`${api}/api/musicas/${idPersistencia}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: bodyJson,
    });

    if (res.status === 404) {
      res = await fetch(`${api}/api/musicas/${idPersistencia}/salvar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyJson,
      });
    }

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      let msg = '';
      try {
        msg = JSON.parse(raw).erro || '';
      } catch (_) {
        msg = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
      }
      alert(
        msg ||
          `Não foi possível salvar (HTTP ${res.status}). Verifique se o aplicativo Controlador está em execução (API local na porta 3001).`
      );
      return false;
    }

    const data = await res.json().catch(() => ({}));
    const forked = !!data.forked;
    const idAlvo = forked && data.id != null ? Number(data.id) : idPersistencia;
    musicaVersaoLocalId = null;
    await aplicarMusicaRecarregada(idAlvo, forked);
    /**
     * Fork = a edição virou uma versão nova; a playlist do dia continuaria a apontar
     * para o original imutável e recarregaria a letra antiga ao reentrar no modo slides.
     */
    if (forked) {
      const rootFork = Number(data.rootId ?? musicaRootId ?? rootAntesDeGravar);
      const repontou = repontarVersaoNaPlaylistDoCulto(
        cultoDaEdicao,
        rootFork,
        versaoPlaylistAntesDeGravar,
        idAlvo,
        musicaAtiva?.rotulo || ''
      );
      if (repontou) renderPlaylist();
    }
    return true;
  } catch (e) {
    alert(e.message || 'Erro ao salvar no banco local do controlador.');
    return false;
  }
}

async function iniciarCriarNovaVersao() {
  if (!musicaAtiva) return;
  if (musicaBancoFonte === 'catalog') {
    await appAlert(
      'Música do catálogo somente leitura. Importe para o seu banco antes de criar uma versão editável.',
      'Catálogo'
    );
    return;
  }
  const idNum = Number(musicaAtiva.id);
  if (!Number.isFinite(idNum)) return;

  if (modoEdicaoEstrofes || modoLetraCompletaCentral || temEdicaoMusicaNaoGravada()) {
    const ok = await appConfirm(
      'Descartar alterações não gravadas e criar uma nova versão a partir do texto gravado no servidor?',
      'Criar nova versão'
    );
    if (!ok) return;
  }

  const nome = await appPrompt('Nome da nova versão:', {
    title: 'Nova versão',
    emptyMsg: 'Digite um nome para a versão.',
  });
  if (!nome) return;

  try {
    limparFlagsModoEdicaoMusica();

    const res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/criar-versao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotulo: nome }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      await appAlert(payload.erro || `Não foi possível criar a versão (HTTP ${res.status}).`);
      return;
    }

    const nova = payload.musica;
    if (!nova || !Array.isArray(nova.estrofes)) throw new Error('Resposta inválida do servidor.');

    musicaAtiva = nova;
    musicaBancoFonte = 'user';
    musicaVersaoLocalId = null;
    musicaRootId = Number(nova.root_id ?? payload.rootId ?? idNum);
    const et = document.getElementById('edit-titulo');
    const ea = document.getElementById('edit-artista');
    if (et) et.value = musicaAtiva.titulo || '';
    if (ea) ea.value = musicaAtiva.artista || '';

    estrofeAtiva = Math.min(
      Math.max(estrofeAtiva < 0 ? 0 : estrofeAtiva, 0),
      Math.max(0, musicaAtiva.estrofes.length - 1)
    );
    projecaoMusicaEmitidaNoServidor = false;
    bloqueioSincronizarEstrofeDoServidor = true;
    await carregarMusicas();
    refreshListaBanco();
    renderPlaylist();
    await carregarVersoesMusicaServidor(musicaRootId);
    renderEstrofesEditor();
    renderSlidesStrip();
    atualizarPreviewOperador();
    marcacaoEstrofeEditor();

    entrarModoEdicao();
    atualizarToolbarModoEdicao();
  } catch (e) {
    appAlert(e?.message || 'Não foi possível criar a nova versão.');
  }
}

async function salvarMusicaServidor() {
  if (!musicaAtiva) return;
  const metadadosSujos = metadadosMusicaSujosNaHome();
  if (!modoEdicaoEstrofes && !modoLetraCompletaCentral && !metadadosSujos) return;
  if (musicaBancoFonte === 'catalog') {
    await appAlert(
      'Música do catálogo somente leitura: não é possível usar Salvar alterações. Importe a letra para o seu banco ou escolha uma música gravada neste servidor.'
    );
    return;
  }
  if (modoLetraCompletaCentral) sincronizarEstrofesDesdeTextareaLetraCompleta();
  if (modoEdicaoEstrofes) aplicarSplitsEstrofesDosTextareasAntesDePersistir();

  const vid =
    musicaVersaoLocalId && ehVersaoLocalLegada(musicaVersaoLocalId)
      ? String(musicaVersaoLocalId).trim()
      : null;
  const idNum = Number(musicaAtiva.id);

  if (vid) {
    const titulo = document.getElementById('edit-titulo').value.trim();
    const artista = document.getElementById('edit-artista').value.trim();
    const estrofesPayload = (musicaAtiva.estrofes || []).map((s) => String(s ?? ''));
    const rootLegado = obterRootIdMusicaAtiva() ?? idNum;
    const up = atualizarCopiaLocal(rootLegado, vid, { titulo, artista, estrofes: estrofesPayload });
    if (!up.ok) {
      await appAlert(up.erro || 'Não foi possível atualizar a cópia.');
      return;
    }
    await carregarVersoesMusicaServidor(obterRootIdMusicaAtiva() ?? idNum);
  } else {
    const ok = await persistirMusicaAtivaNoServidor();
    if (!ok) return;
    return;
  }

  limparFlagsModoEdicaoMusica();
  renderEstrofesEditor();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();
  atualizarToolbarModoEdicao();
  renderMusicaVersoesBar();
  refreshListaBanco();
  renderPlaylist();
}

/**
 * Estado de «há projeção alcançável», na barra do topo.
 *
 * O texto distingue os dois modos porque a mesma bandeira verde significa coisas
 * diferentes: no remoto há um Servidor do outro lado da rede, no local as telas são deste
 * PC. Enquanto a dica falava só de ligação, o modo local — que passou a ser o padrão —
 * herdava uma frase sobre uma ligação que não existe.
 */
function atualizarUiConexao(conectado) {
  document.body.classList.toggle('socket-conectado', !!conectado);
  const bar = document.getElementById('conn-bar');
  if (!bar) return;
  if (!conectado) {
    bar.title = '';
    return;
  }
  bar.title = emModoProjecaoLocal()
    ? 'PROJETANDO NESTA MÁQUINA — as telas são servidas por este PC'
    : 'CONECTADO — feche a janela para desligar';
}

// --- SECÇÃO F — Ligação ao servidor (IP), pedidos HTTP ao controlador :3001, filas e debounces ---
async function conectar() {
  /*
   * A preferência de modo remoto só se grava quando a ligação TEM SUCESSO — ver o
   * `socket.on('connect')`. Aqui não se escreve nada.
   *
   * Gravar logo na tentativa deixava o operador preso: um clique que falhava (Servidor
   * desligado, IP errado) registava `'0'`, e a cada arranque seguinte o painel tentava o
   * Servidor de novo e caía em «servidor não encontrado», sem forma óbvia de voltar ao
   * padrão local. Persistir só no sucesso mantém o reinício a voltar a ocioso.
   */

  /* Sem um Servidor remoto real a que ligar (campo vazio ou o endereço desta própria
     máquina): nada acontece. O local fica intacto e o badge permanece em LOCAL. Ligar ao
     IP da LAN deste PC — com o modo local a servir a 5510 — fingia sucesso e o badge
     passava a SERVIDOR sem nenhum app Servidor aberto. */
  await refrescarIpsDestaMaquina();
  const ip = ipRemotoAlvo();
  if (!ip) return;
  if (ehEnderecoDestaMaquina(ip)) {
    alert(
      'Esse IP é deste computador.\n\n' +
      'No modo remoto, informe o IP do outro PC — o que está a correr o app Servidor.'
    );
    return;
  }

  /* A projeção local NÃO se derruba aqui. Enquanto a ligação ao Servidor não confirmar, o
     local continua a projetar — uma tentativa que falha não faz perder a projeção. A troca
     para o Servidor acontece só no `socket.on('connect')`, quando há de facto ligação. O
     badge também não muda na tentativa: só passa a SERVIDOR (verde) quando a ligação vinga. */
  if (typeof io !== 'undefined') {
    iniciarSocket(ip);
    return;
  }
  if (socketScriptLoading) return;
  socketScriptLoading = true;
  const script = document.createElement('script');
  script.src = `http://${ip}:5510/socket.io/socket.io.js`;
  script.onload = () => { socketScriptLoading = false; iniciarSocket(ip); };
  script.onerror = () => {
    socketScriptLoading = false;
    tratarFalhaLigacaoServidor();
  };
  document.head.appendChild(script);
}

/* ─── Modo «projetar nesta máquina» ─────────────────────────────────────────────
 *
 * O painel não muda: os mesmos comandos, pela mesma porta de projeção. O que muda é o
 * transporte por baixo dela — IPC para o motor deste processo, em vez de socket para o
 * Servidor. Nenhum call site sabe em qual dos dois está, que era o propósito da Peça 1.
 *
 * OBS e celular continuam a ligar-se à 5510, agora servida pelo Controlador. Quem impede
 * dois donos das mesmas telas é o próprio `listen`: com o Servidor aberto, a porta está
 * ocupada e o modo local recusa arrancar.
 */

/**
 * Preferência de modo, com três estados — e os três importam desde que o padrão inverteu.
 *
 * - ausente: o operador nunca decidiu → **projetar nesta máquina**, que é o padrão;
 * - `'0'`: escolheu o Servidor remoto, deliberadamente, em Ajustes › Conexão;
 * - `'1'`: escolheu o modo local, deliberadamente.
 *
 * Ausente e `'1'` levam ao mesmo arranque; distingui-los serve para saber se houve
 * escolha, o que uma migração futura pode querer consultar.
 *
 * Quem grava `'0'` é o `socket.on('connect')` — só uma ligação com SUCESSO declara o modo
 * remoto. Uma tentativa falhada limpa a chave (`tratarFalhaLigacaoServidor`), para o
 * reinício voltar ao padrão local. Desmarcar «Projetar nesta máquina» no menu derruba o
 * motor na sessão e não escreve nada: parar de projetar agora não é o mesmo que declarar
 * que este PC opera contra um Servidor da rede.
 */
const LS_PROJETAR_LOCAL = 'lyra_projetar_nesta_maquina';

/** Verdadeiro entre o clique no menu e a resposta do processo principal. */
let projecaoLocalEmCurso = false;

/**
 * Verdadeiro enquanto o motor local está mesmo de pé.
 *
 * Distinto da preferência gravada, e a distinção não é académica: a preferência é a
 * *intenção* do operador, este é o *facto*. Enquanto o modo local se derivava só da
 * preferência, uma tentativa falhada — porta ocupada porque o Servidor está aberto —
 * deixava o painel a acreditar que projetava localmente. E aí recusava-se a ligar ao
 * Servidor, porque «está em modo local», e não projetava, porque não está. Ficava preso
 * entre os dois.
 */
let projecaoLocalActiva = false;

/**
 * Motor que toca o áudio quando a projeção corre nesta máquina.
 *
 * Criado só quando há ponte (dentro do aplicativo) e ligado só no modo local — no remoto
 * quem toca é a janela de controle do Servidor, e dois motores a tocar dariam eco.
 */
let motorAudioLocal = null;

function garantirMotorAudioLocal() {
  const ponte = ponteProjecaoLocal();
  if (!ponte?.audio) return null;
  if (!motorAudioLocal) motorAudioLocal = criarMotorAudioLocal(ponte.audio);
  return motorAudioLocal;
}

/**
 * O painel está — ou está a ficar — em modo local?
 *
 * Serve de guarda ao auto-reconectar e à resolução do endereço da projeção. Cobre a
 * janela entre o clique e o arranque (`emCurso`) e o período em que o motor está de facto
 * a correr (`activa`) — nunca a mera intenção gravada.
 */
function emModoProjecaoLocal() {
  return projecaoLocalEmCurso || projecaoLocalActiva;
}

/** A ponte só existe dentro do Electron; no browser o modo local não se aplica. */
function ponteProjecaoLocal() {
  return window.lyraElectron?.projecaoLocal || null;
}

/**
 * Liga o modo local e aponta a porta de projeção ao motor deste processo.
 *
 * @returns {Promise<{ ok: boolean, erro?: string }>}
 */
async function ligarProjecaoNestaMaquina() {
  const ponte = ponteProjecaoLocal();
  if (!ponte) return { ok: false, erro: 'modo local indisponível fora do aplicativo' };

  setStatusServidorRemoto('ocioso');
  /* `projecaoLocalEmCurso` bloqueia o auto-reconectar enquanto isto decorre: abrir as
     janelas de projeção rouba o foco, o foco dispara `tentarAutoConectarSeDesconectado`,
     e o painel ia atrás de um Servidor no meio do arranque do modo local. */
  projecaoLocalEmCurso = true;
  let r;
  try {
    r = await ponte.ligar();
  } catch (e) {
    r = { ok: false, erro: e?.message || String(e) };
  } finally {
    projecaoLocalEmCurso = false;
  }
  if (!r?.ok) {
    projecaoLocalActiva = false;
    setStatusServidorRemoto('ocioso');
    atualizarUiConexao(false);
    return r || { ok: false, erro: 'falha desconhecida' };
  }
  projecaoLocalActiva = true;

  /* Desligar o socket antes de trocar de transporte: um Servidor ainda ligado continuaria
     a mandar `estado` para o painel e a disputar as telas com o motor local. */
  try {
    if (socket) socket.disconnect();
  } catch (_) {
    // intencional
  }

  projecao.usarTransporte(criarTransporteLocal(ponte));
  garantirMotorAudioLocal()?.ligar();
  try {
    localStorage.setItem(LS_PROJETAR_LOCAL, '1');
  } catch (_) {
    // intencional
  }
  papelControladorLocal = { primario: true, podeEscrever: true, donoAtual: null };
  setStatusServidorRemoto('ocioso');
  atualizarUiConexao(true);
  if (r.lanIp) {
    servidorLanIpObs = String(r.lanIp).trim();
    atualizarUrlsObs();
  }
  recordarIpsDestaMaquina(r.lanIps, r.lanIp);

  /* O mesmo que o handler de `connect` do socket faz no modo remoto. Sem isto o painel
     ficava com os seletores de tela vazios: a carga do arranque corre antes de a 5510
     estar de pé, falha em silêncio, e no modo local não há evento de ligação a seguir
     que a repita. */
  try {
    await carregarRoteamentoTelasDoServidor();
    if (ehModoBibliaOperador()) bibliaAplicarCfgExibicao();
    else slidesAplicarCfgArmazenada();
    renderSlidesStrip();
    emitirEstadoMinistranteAoServidor();
  } catch (_) {
    // intencional — o modo local já está de pé; o painel recupera ao trocar de modo
  }
  return { ok: true };
}

/**
 * Desliga o modo local — só nesta sessão.
 *
 * Não escreve a preferência de propósito. Desde que projetar nesta máquina passou a ser o
 * padrão, gravar `'0'` aqui fazia com que desmarcar o item de menu para parar de projetar
 * por um instante tirasse o PC do padrão para sempre — e no arranque seguinte ele não
 * projetava nada, porque sem IP gravado o caminho remoto é um no-op silencioso.
 *
 * Quem declara «este PC opera contra um Servidor da rede» é `conectar()`, que é a acção
 * onde essa intenção existe de facto.
 */
async function desligarProjecaoNestaMaquina() {
  const ponte = ponteProjecaoLocal();
  projecaoLocalActiva = false;
  motorAudioLocal?.desligar();
  if (ponte) await ponte.desligar();
  projecao.usarTransporte(null);
  atualizarUiConexao(false);
  /* O badge único descreve a ligação ao Servidor remoto; ao desligar a projeção local
     não há Servidor em jogo, então volta ao estado ocioso (cinza), sem soar a avaria. */
  setStatusServidorRemoto('ocioso');
}

/** Alterna o modo, para ligar a um botão ou item de menu. */
async function alternarProjecaoNestaMaquina() {
  const ponte = ponteProjecaoLocal();
  const estado = ponte ? await ponte.estado() : null;
  if (estado?.activa) return desligarProjecaoNestaMaquina();
  return ligarProjecaoNestaMaquina();
}

/** IP de LAN do servidor de projeção informado por ele (evento `server_info`); vazio até conectar. */
let servidorLanIpObs = '';
/** Porta do servidor HTTP das páginas de Browser Source do OBS (informada pelo servidor). */
let servidorObsPort = 5001;

/**
 * Atualiza os campos de URL de Browser Source (OBS) na aba «Conexão» dos Ajustes.
 * Host preferido: IP de LAN informado pelo servidor → IP usado para conectar → localhost.
 * O OBS pode rodar noutro PC, por isso `localhost` só serve como último recurso.
 */
function atualizarUrlsObs() {
  const host = servidorLanIpObs || getServidorIp() || 'localhost';
  const bib = document.getElementById('obs-url-biblia');
  const sli = document.getElementById('obs-url-slides');
  if (bib) bib.value = `http://${host}:${servidorObsPort}/obs/biblia`;
  if (sli) sli.value = `http://${host}:${servidorObsPort}/obs/slides`;
}

/**
 * Copia para a área de transferência a URL de Browser Source (OBS) do campo indicado
 * e dá um retorno visual rápido no botão.
 */
async function copiarUrlObs(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const url = input.value.trim();
  if (!url) return;
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      ok = true;
    }
  } catch (_) {
    // fallback abaixo
  }
  if (!ok) {
    try {
      input.focus();
      input.select();
      ok = document.execCommand('copy');
      input.setSelectionRange(0, 0);
      input.blur();
    } catch (_) {
      ok = false;
    }
  }
  if (btn) {
    const rotuloOriginal = btn.dataset.rotuloOriginal || btn.textContent;
    btn.dataset.rotuloOriginal = rotuloOriginal;
    btn.textContent = ok ? 'Copiado!' : 'Erro';
    btn.classList.toggle('success', ok);
    clearTimeout(btn._copiarTimer);
    btn._copiarTimer = setTimeout(() => {
      btn.textContent = btn.dataset.rotuloOriginal || 'Copiar';
      btn.classList.remove('success');
    }, 1400);
  }
}

async function carregarRoteamentoTelasDoServidor() {
  const ip = hostProjecao();
  if (!ip) return;
  try {
    const [rMon, rRoute] = await Promise.all([
      fetch(`http://${ip}:5510/api/monitores`),
      fetch(`http://${ip}:5510/api/display-routing`),
    ]);
    const mon = await rMon.json().catch(() => []);
    const route = await rRoute.json().catch(() => ({}));
    monitoresServidorCache = Array.isArray(mon) ? mon : [];
    let slidesSrv;
    let apSrv;
    if (route && route.version === 2 && route.slides && route.apresentacao) {
      slidesSrv = sanitizarRotaProjecao(route.slides, monitoresServidorCache);
      apSrv = sanitizarRotaProjecao(route.apresentacao, monitoresServidorCache);
    } else {
      const leg = sanitizarRotaProjecao(route || {}, monitoresServidorCache);
      slidesSrv = leg;
      apSrv = { publicoIndex: -1, ministranteIndex: -1, live: false };
    }

    /* A identidade manda sobre os índices: tanto os do servidor como os de
       `LS_ROTAS_POR_MODO` referem-se ao arranjo de monitores da sessão anterior, que é
       exactamente o que a renumeração do Windows corrompe. Ver `identidadeMonitores.js`.
       `apresentacao` fica de fora por ser rota de sessão, reposta a cada arranque. */
    const restSlides = rotaRestauradaPorIdentidade('slides', slidesSrv);
    const restCompleto = rotaRestauradaPorIdentidade('completo', rotasPorModo.completo);
    slidesSrv = restSlides.rota;
    rotasPorModo.completo = restCompleto.rota;
    avisarMonitoresConfiguradosEmFalta([...restSlides.faltou, ...restCompleto.faltou]);
    rotasPorModo.slides = { ...slidesSrv };
    rotasPorModo.apresentacao = { ...apSrv };
    const mergedSrv = apSrv.live
      ? { publicoIndex: -1, ministranteIndex: -1, live: true }
      : {
          publicoIndex: apSrv.publicoIndex >= 0 ? apSrv.publicoIndex : slidesSrv.publicoIndex,
          ministranteIndex: apSrv.ministranteIndex >= 0 ? apSrv.ministranteIndex : slidesSrv.ministranteIndex,
          live: false,
        };
    const semSalvo =
      normalizarRota(rotasPorModo.completo).publicoIndex === -1 &&
      normalizarRota(rotasPorModo.completo).ministranteIndex === -1 &&
      normalizarRota(rotasPorModo.slides).publicoIndex === -1 &&
      normalizarRota(rotasPorModo.slides).ministranteIndex === -1;
    if (semSalvo) {
      rotasPorModo.completo = { ...slidesSrv };
      rotasPorModo.slides = { ...slidesSrv };
      salvarRotasPorModoNoStorage();
    }
    /**
     * Não sincronizar o modo atual para o servidor só por ligar o socket:
     * no modo slides com telão «Desativado» (-1,-1) isso gravava -1 no PC servidor
     * e `garantirTelasAbertasParaProjecao` deixava de abrir janelas — só prévias no painel.
     */
    if (ehModoSlidesOperador()) {
      const s = normalizarRota(rotasPorModo.slides);
      if (s.publicoIndex < 0 && s.ministranteIndex < 0) {
        rotasPorModo.slides = rotaSlidesAoEntrarNoModo();
        salvarRotasPorModoNoStorage();
      }
    }
    await aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
    const modo = modoRoteamentoAtual();
    const rotaLocalModo = normalizarRota(rotasPorModo[modo]);
    const servidorSemMonitores =
      mergedSrv.publicoIndex < 0 && mergedSrv.ministranteIndex < 0 && !mergedSrv.live;
    const modoTemMonitores =
      rotaLocalModo.publicoIndex >= 0 ||
      rotaLocalModo.ministranteIndex >= 0 ||
      rotaLocalModo.live;
    if (servidorSemMonitores && modoTemMonitores) {
      await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
    }
  } catch (_) {
  // intencional — erro ignorado
}
}

async function salvarRoteamentoTelasNoServidor(opts = {}) {
  const usarValoresDaUi = opts.usarValoresDaUi !== false;
  const modo = modoRoteamentoAtual();
  const slidesAntes = normalizarRota(rotasPorModo.slides);

  if (usarValoresDaUi) {
    const fromUi = rotaSelecionadaNaUi();
    if (!fromUi) return;
    rotasPorModo[modo] = { ...normalizarRota(fromUi) };

    if (modo === 'slides') {
      rotasPorModo.slides = ajustarSlidesSemConflitoComApresentacao(normalizarRota(rotasPorModo.slides));
    } else if (modo === 'completo') {
      rotasPorModo.slides = ajustarSlidesSemConflitoComApresentacao(
        normalizarRota(rotasPorModo.completo)
      );
    } else if (modo === 'apresentacao') {
      const a = normalizarRota(rotasPorModo.apresentacao);
      if (!a.live && a.publicoIndex < 0 && a.ministranteIndex < 0) {
        encerrarProjecaoMidiaApresentacaoNoControlador();
        rotasPorModo.slides = rotaSlidesPadraoPublico2Ministrante3(monitoresServidorCache);
        try {
          atualizarFeedbackProjecaoApresentacaoUi({
            mensagemIdle: 'Projeção encerrada. Modo slide: Público (M2) e Ministrante (M3) ativos.',
          });
        } catch (_) {
  // intencional — erro ignorado
}
      } else {
        desfazerConflitoSlidesComRotaApresentacao(a);
      }
    } else if (modo === 'biblia') {
      /*
       * Atenção ao ler: este ramo só corre com `usarValoresDaUi === true`, ou seja, o
       * operador acabou de escolher um monitor. Adoptar a rota da mídia descarta essa
       * escolha — deliberado, porque Bíblia e Mídias partilham o canal `apresentacao` no
       * servidor e mover a rota fecharia as janelas da mídia que ainda está no ar.
       *
       * O que era bug: `hayProjecaoMidiaApresentacaoAtiva()` dava `true` para uma Bíblia
       * projetada só no público, sem mídia nenhuma — e então toda e qualquer troca de
       * monitor em modo Bíblia caía aqui e era descartada em silêncio.
       */
      if (hayProjecaoMidiaApresentacaoAtiva()) {
        /* Mídia no ar: canal `apresentacao` no servidor fica intocado. */
        rotasPorModo.biblia = { ...normalizarRota(rotasPorModo.apresentacao) };
      } else {
        const b = normalizarRota(rotasPorModo.biblia);
        rotasPorModo.apresentacao = { ...b };
        let s = normalizarRota(rotasPorModo.slides);
        if (b.live || b.publicoIndex >= 0) s = { ...s, publicoIndex: -1 };
        if (b.live || b.ministranteIndex >= 0) s = { ...s, ministranteIndex: -1 };
        /* Evita que o merge no servidor reabra o telão via índice antigo em slides. */
        if (b.live || b.publicoIndex < 0) s = { ...s, publicoIndex: -1 };
        if (b.live || b.ministranteIndex < 0) s = { ...s, ministranteIndex: -1 };
        rotasPorModo.slides = s;
      }
    }

    if (modo !== 'biblia' && modo !== 'apresentacao') {
      salvarRotasPorModoNoStorage();
    }
  }

  rotasPorModo.slides = sanitizarRotaProjecao(rotasPorModo.slides, monitoresServidorCache);
  rotasPorModo.apresentacao = sanitizarRotaProjecao(rotasPorModo.apresentacao, monitoresServidorCache);
  if (modo === 'biblia') {
    rotasPorModo.biblia = sanitizarRotaProjecao(rotasPorModo.biblia, monitoresServidorCache);
  }

  /* Guardar QUAIS monitores ficaram em uso, não em que posição estavam — é isto que
     permite restaurar a configuração depois de o Windows renumerar os ecrãs. */
  persistirIdentidadesDosModos();

  const payloadDual = {
    version: 2,
    slides: normalizarRota(rotasPorModo.slides),
    apresentacao: normalizarRota(rotasPorModo.apresentacao),
  };
  if (
    !Number.isFinite(payloadDual.slides.publicoIndex) ||
    !Number.isFinite(payloadDual.slides.ministranteIndex) ||
    !Number.isFinite(payloadDual.apresentacao.publicoIndex) ||
    !Number.isFinite(payloadDual.apresentacao.ministranteIndex)
  ) {
    return;
  }

  const ip = hostProjecao();
  if (!ip) {
    try {
      aplicarPreviewPainelOcultoNoDom();
    } catch (_) {
  // intencional — erro ignorado
}
    return;
  }
  try {
    await fetch(`http://${ip}:5510/api/display-routing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadDual),
    });
    if (modo === 'biblia') {
      bibliaRotaSyncServidorChave = bibliaChaveRotaAtual();
      bibliaAplicarCfgExibicao();
    }
    if (projecao.pronta() && modo === 'slides') {
      const pubDepois = normalizarRota(rotasPorModo.slides).publicoIndex;
      const publicoFoiAtivadoAgora = slidesAntes.publicoIndex < 0 && pubDepois >= 0;
      if (publicoFoiAtivadoAgora) {
        if (musicaAtiva && Number.isFinite(estrofeAtiva) && estrofeAtiva >= 0) {
          emitirEstrofeAoServidor(estrofeAtiva);
        }
      }
    }
  } catch (_) {
  // intencional — erro ignorado
}
  try {
    aplicarPreviewPainelOcultoNoDom();
    atualizarPreviewOperador();
  } catch (_) {
  // intencional — erro ignorado
}
}

/**
 * Ocultar prévia quando não há saída física naquele canal (após unir slide ∪ apresentação no servidor).
 * Modo slide: cartões sempre visíveis — tela preta no conteúdo quando o monitor está desativado ou sem projeção.
 * Modo completo / apresentação: usa rota efetiva — ex.: apresentação «Desativado» com slide em M2+M3 mostra as duas prévias.
 * [0] = público / telão, [1] = ministrante / retorno.
 */
function obterFlagsOcultarPreviewPorSincroniaModoSlides() {
  if (ehModoSlidesOperador()) {
    return [false, false];
  }
  if (ehModoBibliaOperador()) {
    const r = normalizarRota(rotasPorModo.biblia);
    if (r.live) return [true, true];
    const pubOn = r.publicoIndex >= 0;
    const minOn = r.ministranteIndex >= 0;
    if (!pubOn && !minOn) return [false, false];
    return [!pubOn, !minOn];
  }
  const eff = indicesEfetivosRoteamentoDualCliente();
  if (eff.live) return [true, true];
  const pubOn = eff.publicoIndex >= 0;
  const minOn = eff.ministranteIndex >= 0;
  if (!pubOn && !minOn) return [true, true];
  return [!pubOn, !minOn];
}

/** Apresentação ativa no telão público (estado já fundido no socket) — força prévia visível no modo slide. */
function hayConteudoExternoQueForcaPreviaPublicaModoSlide() {
  if (!ehModoSlidesOperador()) return false;
  if (slidePreviewDeveMostrarInformeMidiaApresentacaoNoPublico()) return true;
  const rSlide = obterRotaSlidesParaUi();
  if (rSlide.publicoIndex < 0) return false;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (slidesCanalPublicoSeparadoDaApresentacao()) {
    return (
      (e.tipo === 'musica' &&
        (e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length))) ||
      (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length) ||
      estadoServidorEhProjecaoApresentacaoAtivaNoTelao()
    );
  }
  if (!slidesCanalPublicoSeparadoDaApresentacao() && apresentacaoOcupandoCanalPublico()) {
    return (
      estadoServidorEhProjecaoApresentacaoAtivaNoTelao() ||
      (e.tipo === 'musica' &&
        (e.slidePretoFinal || (!e.telaLimpa && e.linhas && e.linhas.length))) ||
      (e.tipo === 'biblia' && !e.telaLimpa && e.linhas && e.linhas.length)
    );
  }
  return (
    estadoServidorEhProjecaoApresentacaoAtivaNoTelao() ||
    (e.tipo === 'aviso' && Array.isArray(e.linhas) && e.linhas.length) ||
    !!e.projecaoMinistranteApresentacao
  );
}

/**
 * Há conteúdo que justifica mostrar a prévia TV — só quando o ministrante está ativo na rota de slides
 * ou a apresentação ocupa esse canal (slide desliga esse monitor por desenho).
 */
function hayConteudoExternoQueForcaPreviaMinistranteModoSlide() {
  if (!ehModoSlidesOperador()) return false;
  if (slidePreviewDeveMostrarInformeMidiaApresentacaoNoMinistrante()) return true;
  const rSlide = normalizarRota(rotasPorModo.slides);
  if (rSlide.ministranteIndex < 0) return false;
  const e = estadoServidor;
  if (!e || !projecao.pronta()) return false;
  if (e.tipo === 'apresentacao' || e.tipo === 'aviso' || e.projecaoMinistranteApresentacao) return false;
  if (!hayProjecaoAtivaNoServidor()) return false;
  if (e.tipo !== 'musica' && e.tipo !== 'biblia') return false;
  const opA = document.getElementById('op-atual');
  const opP = document.getElementById('op-proximo');
  if (!opA || !opP) return false;
  const ta = (opA.textContent || '').trim();
  const tp = (opP.textContent || '').trim();
  return !!(ta || tp);
}

function carregarPreviewPainelOcultoDoArmazenamento() {
  try {
    const raw = localStorage.getItem(LS_PREVIEW_PAINEL_OCULTO);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (Array.isArray(p) && p.length >= 2) previewPainelOcultoLocal = [!!p[0], !!p[1]];
  } catch (_) {
  // intencional — erro ignorado
}
}

function persistirPreviewPainelOcultoLocal() {
  try {
    localStorage.setItem(LS_PREVIEW_PAINEL_OCULTO, JSON.stringify(previewPainelOcultoLocal));
  } catch (_) {
  // intencional — erro ignorado
}
}

function aplicarPreviewPainelOcultoNoDom() {
  const syncBase = obterFlagsOcultarPreviewPorSincroniaModoSlides();
  const desbloqPub = hayConteudoExternoQueForcaPreviaPublicaModoSlide();
  const desbloqMin = hayConteudoExternoQueForcaPreviaMinistranteModoSlide();
  const syncEfetivo = [
    !!(syncBase[0] && !desbloqPub),
    !!(syncBase[1] && !desbloqMin),
  ];
  const eff = [
    !!(previewPainelOcultoLocal[0] || syncEfetivo[0]),
    !!(previewPainelOcultoLocal[1] || syncEfetivo[1]),
  ];
  const stack = document.querySelector('#layout-musicas .centro-col-preview-stack');
  const items = document.querySelectorAll('#layout-musicas .centro-col-preview-stack .preview-stack-item');
  const visCount = eff.filter((o) => !o).length;
  items.forEach((el, i) => {
    el.classList.remove('preview-stack-item--painel-oculto', 'preview-stack-item--destaque-solo');
    const oculto = !!eff[i];
    if (oculto) el.classList.add('preview-stack-item--painel-oculto');
    if (!oculto && visCount === 1) el.classList.add('preview-stack-item--destaque-solo');
    // O card TELÃO/PÚBLICO fica dentro de .preview-telao-col — o colapso precisa alcançar o
    // wrapper (o operador não tem wrapper: closest() devolve null e nada acontece).
    const wrapTelao = el.closest('.preview-telao-col');
    if (wrapTelao) wrapTelao.classList.toggle('preview-telao-col--painel-oculto', oculto);
  });
  // Todas as prévias ocultas → encolher o container para não sobrar faixa vazia.
  if (stack) stack.classList.toggle('centro-col-preview-stack--tudo-oculto', visCount === 0);
  [0, 1].forEach((i) => {
    const btn = document.getElementById(`btn-toggle-preview-${i}`);
    if (!btn) return;
    const oculto = !!eff[i];
    const desbloq = i === 0 ? desbloqPub : desbloqMin;
    const syncForca = !!(syncBase[i] && !desbloq);
    btn.disabled = syncForca;
    btn.innerHTML = oculto ? SVG_OLHO_CORTADO : SVG_OLHO_ABERTO;
    btn.setAttribute('aria-pressed', oculto ? 'true' : 'false');
    if (syncForca) {
      const modoAp = ehModoApresentacaoOperador();
      btn.title =
        i === 0
          ? modoAp
            ? 'No modo apresentação, esta prévia fica oculta porque o destino não inclui o monitor público.'
            : 'No modo slide, esta prévia fica oculta enquanto o Público estiver Desativado (ative um monitor em Público para voltar a ver).'
          : modoAp
            ? 'No modo apresentação, esta prévia fica oculta porque o destino não inclui o monitor ministrante.'
            : 'No modo slide, esta prévia fica oculta enquanto o Ministrante estiver Desativado (ative um monitor em Ministrante para voltar a ver).';
    } else if (desbloq && syncBase[i]) {
      btn.title =
        i === 0
          ? 'Prévia visível: há conteúdo no telão público (ex.: apresentação). Pode ocultar só neste painel.'
          : 'Prévia visível: há conteúdo na TV ministrante. Pode ocultar só neste painel.';
    } else {
      btn.title = oculto
        ? 'Mostrar esta pré-visualização no painel (só aqui — não altera os monitores)'
        : 'Ocultar esta pré-visualização só neste painel';
    }
  });
}

function alternarOcultacaoPreviewPainel(indice) {
  const i = Number(indice);
  if (i !== 0 && i !== 1) return;
  previewPainelOcultoLocal[i] = !previewPainelOcultoLocal[i];
  persistirPreviewPainelOcultoLocal();
  aplicarPreviewPainelOcultoNoDom();
}

function carregarPlaylistPreviewSlideOcultoDoArmazenamento() {
  try {
    playlistPreviewSlideOcultoLocal = localStorage.getItem(LS_PLAYLIST_PREVIEW_SLIDE_OCULTO) === '1';
  } catch (_) {
    playlistPreviewSlideOcultoLocal = false;
  }
}

function aplicarPlaylistPreviewSlideOcultoNoDom() {
  const card = document.getElementById('playlist-preview-card');
  const btn = document.getElementById('btn-toggle-playlist-preview');
  if (!card || !btn) return;
  const oculto = !!playlistPreviewSlideOcultoLocal;
  card.classList.toggle('playlist-preview-card--corpo-oculto', oculto);
  btn.innerHTML = oculto ? SVG_OLHO_CORTADO : SVG_OLHO_ABERTO;
  btn.setAttribute('aria-pressed', oculto ? 'true' : 'false');
  btn.title = oculto
    ? 'Mostrar prévia dos slides'
    : 'Ocultar prévia dos slides para ampliar a lista';
}

function alternarOcultacaoPlaylistPreviewSlide() {
  playlistPreviewSlideOcultoLocal = !playlistPreviewSlideOcultoLocal;
  try {
    localStorage.setItem(LS_PLAYLIST_PREVIEW_SLIDE_OCULTO, playlistPreviewSlideOcultoLocal ? '1' : '0');
  } catch (_) {
  // intencional — erro ignorado
}
  aplicarPlaylistPreviewSlideOcultoNoDom();
}

let letrasPreviewPathPendente = '';
let letrasPreviewCatalogIdPendente = null;
let letrasPreviewUserIdPendente = null;
let letrasPreviewOfflineOrigem = 'catalog';
let letrasPreviewFontePendente = 'cifraclub';
let letrasPreviewMaxLinhasPorSlide = 4;
let letrasPreviewReqSeq = 0;

function getLetrasSiteFonteAtual() {
  const sel = document.getElementById('banco-fonte-select');
  if (sel?.value) return normalizarFonteLetrasSite(sel.value);
  return normalizarFonteLetrasSite(letrasSiteFonte);
}

function aplicarPlaceholderBuscaLetras() {
  const inp = document.getElementById('busca-letras-q');
  if (!inp) return;
  const f = getLetrasSiteFonteAtual();
  if (f === 'letras-mus-br') inp.placeholder = 'Buscar em letras.mus.br…';
  else if (f === 'banco-local') inp.placeholder = 'Buscar no banco offline…';
  else inp.placeholder = 'Buscar em cifraclub.com.br…';
}

function atualizarUiToggleListaBancoSqlite() {
  const btn = document.getElementById('btn-banco-sqlite-toggle-lista');
  const lista = document.getElementById('lista');
  const aviso = document.getElementById('banco-sqlite-lista-recolhida-aviso');
  if (btn) {
    btn.setAttribute('aria-expanded', bancoSqliteListaExpandida ? 'true' : 'false');
    btn.title = bancoSqliteListaExpandida ? 'Recolher lista de músicas' : 'Expandir lista de músicas';
  }
  if (lista) {
    lista.classList.toggle('lista-sqlite--recolhida', !bancoSqliteListaExpandida);
    lista.setAttribute('aria-hidden', bancoSqliteListaExpandida ? 'false' : 'true');
  }
  if (aviso) {
    aviso.hidden = bancoSqliteListaExpandida;
  }
}

function alternarListaBancoSqlite() {
  bancoSqliteListaExpandida = !bancoSqliteListaExpandida;
  try {
    localStorage.setItem(LS_BANCO_SQLITE_LISTA_ABERTA, bancoSqliteListaExpandida ? '1' : '0');
  } catch (_) {
  // intencional — erro ignorado
}
  atualizarUiToggleListaBancoSqlite();
}

function lerMaxLinhasPreviewLetras() {
  const raw = parseInt(document.getElementById('letras-preview-max-linhas')?.value || '4', 10);
  if (raw === 2 || raw === 3 || raw === 4) return raw;
  return 4;
}

function fecharModalPreviewLetras() {
  const bd = document.getElementById('letras-preview-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  letrasPreviewPathPendente = '';
  letrasPreviewCatalogIdPendente = null;
  letrasPreviewUserIdPendente = null;
  letrasPreviewOfflineOrigem = 'catalog';
  letrasPreviewFontePendente = 'cifraclub';
}

async function abrirModalPreviewLetras(path, fonte) {
  letrasPreviewCatalogIdPendente = null;
  letrasPreviewPathPendente = path || '';
  letrasPreviewFontePendente =
    fonte === 'letras-mus-br' ? 'letras-mus-br' : normalizarFonteLetrasSite(fonte || 'cifraclub');
  const bd = document.getElementById('letras-preview-backdrop');
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
  await carregarPreviewLetrasNoModal();
}

async function abrirModalPreviewLetrasOffline(id, origem) {
  const idNum = typeof id === 'number' ? id : parseInt(String(id), 10);
  if (!Number.isFinite(idNum)) return;
  const orig = origem === 'user' ? 'user' : 'catalog';
  letrasPreviewPathPendente = '';
  letrasPreviewCatalogIdPendente = orig === 'catalog' ? idNum : null;
  letrasPreviewUserIdPendente = orig === 'user' ? idNum : null;
  letrasPreviewOfflineOrigem = orig;
  letrasPreviewFontePendente = 'banco-local';
  const bd = document.getElementById('letras-preview-backdrop');
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
  const btnImp = document.getElementById('letras-preview-import');
  if (btnImp) btnImp.textContent = orig === 'user' ? 'Usar esta música' : 'Importar para o banco';
  await carregarPreviewLetrasNoModal();
}

async function carregarPreviewLetrasNoModal() {
  const scroll = document.getElementById('letras-preview-scroll');
  const meta = document.getElementById('letras-preview-meta');
  const btnImp = document.getElementById('letras-preview-import');
  const path = letrasPreviewPathPendente;
  const catalogId = letrasPreviewCatalogIdPendente;
  const userId = letrasPreviewUserIdPendente;
  letrasPreviewMaxLinhasPorSlide = lerMaxLinhasPreviewLetras();
  const reqId = ++letrasPreviewReqSeq;
  scroll.innerHTML = '<div class="placeholder-msg">Carregando a letra…</div>';
  meta.textContent = '';
  if (btnImp) btnImp.disabled = true;
  try {
    let res;
    if (letrasPreviewFontePendente === 'banco-local' && (catalogId != null || userId != null)) {
      const origem = letrasPreviewOfflineOrigem === 'user' ? 'user' : 'catalog';
      const idPreview = origem === 'user' ? userId : catalogId;
      const paramLinhas =
        origem === 'catalog' ? `&maxLinhas=${encodeURIComponent(String(letrasPreviewMaxLinhasPorSlide))}` : '';
      res = await fetch(
        `${getControllerApiBase()}/api/letras/preview-local?id=${encodeURIComponent(String(idPreview))}&origem=${origem}${paramLinhas}`
      );
    } else {
      res = await fetch(`${getControllerApiBase()}/api/letras/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          maxLinhasPorSlide: letrasPreviewMaxLinhasPorSlide,
          fonte: letrasPreviewFontePendente,
        }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (reqId !== letrasPreviewReqSeq) return;
    if (!res.ok) {
      scroll.innerHTML = `<div class="placeholder-msg">${escapeHtml(data.erro || `Erro HTTP ${res.status}`)}</div>`;
      return;
    }
    if (data.sucesso === false) {
      scroll.innerHTML = `<div class="placeholder-msg">${escapeHtml(data.erro || 'Falha ao carregar.')}</div>`;
      return;
    }
    if (btnImp) btnImp.disabled = false;
    const fonteLabel =
      letrasPreviewFontePendente === 'banco-local'
        ? letrasPreviewOfflineOrigem === 'user'
          ? 'Banco local (suas músicas)'
          : 'Catálogo offline'
        : letrasPreviewFontePendente === 'letras-mus-br'
          ? 'Letras.mus.br'
          : 'Cifra Club';
    const mostraLinhas =
      letrasPreviewFontePendente !== 'banco-local' ||
      (letrasPreviewFontePendente === 'banco-local' && letrasPreviewOfflineOrigem === 'catalog');
    const metaLinhas = mostraLinhas ? ` · ${letrasPreviewMaxLinhasPorSlide} linha(s)/slide` : '';
    meta.innerHTML = `<strong>${escapeHtml(data.titulo || '')}</strong>${data.artista ? ` · ${escapeHtml(data.artista)}` : ''} · ${escapeHtml(fonteLabel)}${metaLinhas}`;
    const parts = Array.isArray(data.estrofes) ? data.estrofes : [];

    // `parcial` = a letra veio de meta tag, que só traz o começo da música.
    // Sem este aviso, uma letra truncada em 4 linhas passava por completa.
    const avisoParcial = data.parcial
      ? `<div class="letras-preview-aviso">⚠ Só o início da letra foi encontrado (${parts.length} trecho${parts.length === 1 ? '' : 's'}). As fontes completas não responderam — confira antes de importar.</div>`
      : '';

    scroll.innerHTML =
      avisoParcial +
      parts
        .map(
          (bloco, idx) =>
            `<div class="letras-preview-bloco"><span class="letras-preview-num">Trecho ${idx + 1}</span><pre class="letras-preview-pre">${escapeHtml(bloco)}</pre></div>`
        )
        .join('');
  } catch (e) {
    if (reqId !== letrasPreviewReqSeq) return;
    scroll.innerHTML = `<div class="placeholder-msg">${escapeHtml(e.message || 'Falha ao carregar.')}</div>`;
  }
}

function configurarModalPreviewLetras() {
  document.getElementById('letras-preview-cancel')?.addEventListener('click', () => fecharModalPreviewLetras());
  document.getElementById('letras-preview-import')?.addEventListener('click', async () => {
    const p = letrasPreviewPathPendente;
    const catalogId = letrasPreviewCatalogIdPendente;
    const userId = letrasPreviewUserIdPendente;
    const maxLinhasPorSlide = lerMaxLinhasPreviewLetras();
    const fontePend = letrasPreviewFontePendente;
    fecharModalPreviewLetras();
    if (userId != null && fontePend === 'banco-local') {
      // «Usar esta música»: nada é gravado, mas o resultado da busca já cumpriu
      // o seu papel — limpa igual aos demais para manter o painel consistente.
      await selecionarMusicaDoBanco(userId, { fonte: 'user' });
      limparBuscaLetras();
    } else if (catalogId != null && fontePend === 'banco-local') {
      await importarLetrasDoCatalogoParaBanco(catalogId, maxLinhasPorSlide);
    } else if (p) {
      await importarLetrasParaBanco(p, maxLinhasPorSlide, fontePend);
    }
  });
  document.getElementById('letras-preview-max-linhas')?.addEventListener('change', () => {
    letrasPreviewMaxLinhasPorSlide = lerMaxLinhasPreviewLetras();
    if (
      letrasPreviewPathPendente ||
      letrasPreviewCatalogIdPendente != null ||
      letrasPreviewUserIdPendente != null
    ) {
      carregarPreviewLetrasNoModal();
    }
  });
  document.getElementById('letras-preview-backdrop')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'letras-preview-backdrop') fecharModalPreviewLetras();
  });
}

async function playlistDuploCliqueIniciarProjecao(itemOuId) {
  if (!ehModoSlidesOperador()) return;
  if (!projecao.pronta()) return alert('Conecte ao servidor para projetar.');
  /* `hostProjecao`, não `getServidorIp`: a pergunta é «onde está a projeção», e no modo
     local a resposta é esta máquina mesmo sem IP nenhum configurado. Com `getServidorIp`
     uma instalação que nunca se ligou a um Servidor abortava aqui, com um pedido de IP
     que não se aplica a quem projeta localmente. */
  const hostAtual = hostProjecao();
  if (!hostAtual) return alert('Informe o IP ou use «Conectar».');
  const item =
    typeof itemOuId === 'object' && itemOuId !== null && !Array.isArray(itemOuId)
      ? itemOuId
      : { id: itemOuId };
  const idNum = Number(item.id);
  if (!Number.isFinite(idNum)) return;
  const rootAtivo = obterRootIdMusicaAtiva();
  const va = versaoAtivaParaCompararPlaylist();
  const vb = item.versaoLocalId ? String(item.versaoLocalId) : '';
  const itemBf = item.bancoFonte === 'catalog' ? 'catalog' : 'user';
  const curBf = musicaBancoFonte === 'catalog' ? 'catalog' : 'user';
  const mesmaMusicaEVersao =
    musicaAtiva &&
    Number.isFinite(rootAtivo) &&
    Number(item.id) === rootAtivo &&
    va === vb &&
    itemBf === curBf;
  if (!mesmaMusicaEVersao) {
    await selecionarMusicaDoBanco(idNum, {
      habilitarFaixaModoSlides: true,
      versaoLocalId: item.versaoLocalId || undefined,
      fonte: itemBf === 'catalog' ? 'catalog' : 'user',
    });
  } else {
    faixaSlidesHabilitadaPorPlaylistNoModoSlides = true;
    renderSlidesStrip();
  }
  slidesDockVisivel = true;
  projetarPorDuploCliqueCentral(0);
}

/**
 * Identidade persistente deste controlador (localStorage) para autenticação na allowlist.
 * Gera deviceId + secret na primeira execução e reaproveita depois — o operador não digita nada.
 */
function obterIdentidadeDispositivoLocal() {
  try {
    const gen = () =>
      window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
    let deviceId = localStorage.getItem('lyra_device_id');
    let secret = localStorage.getItem('lyra_device_secret');
    if (!deviceId || !secret) {
      deviceId = deviceId || gen();
      secret = secret || gen();
      localStorage.setItem('lyra_device_id', deviceId);
      localStorage.setItem('lyra_device_secret', secret);
    }
    const nome = localStorage.getItem('lyra_device_nome') || '';
    return { deviceId, secret, nome };
  } catch (_) {
    return {};
  }
}

/** true quando o servidor já informou que este controlador está em somente-leitura (write-lock). */
function controladorSomenteLeitura() {
  return !!(papelControladorLocal && papelControladorLocal.podeEscrever === false);
}

/**
 * Pull-by-role: aplica a config autoritativa do servidor ao painel SEM reempurrar.
 * Reutiliza o mesmo caminho de merge/preenchimento usado ao carregar a config local,
 * mas nunca chama enviarPreviewDisplayConfig — quem é somente-leitura não projeta.
 */
function aplicarDisplayConfigDoServidorNoPainel(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  try {
    mesclarSlideCfgNoEstado(cfg);
    popularFormCfg(currentCfgCtrl);
  } catch (_) {
    // intencional — shape inesperado do servidor não deve derrubar o painel
  }
}

/**
 * --- Canal de retorno da projeção ---
 *
 * O que as telas estão a mostrar volta por aqui. São funções **nomeadas** e de topo, e
 * não arrow functions inline como antes, por uma razão de mecânica: `iniciarSocket()`
 * corre a cada (re)ligação, e `projecao.aoReceber()` deduplica por identidade de função.
 * Um arrow criado dentro de `iniciarSocket` seria uma função nova a cada chamada — e o
 * painel passaria a reagir duas, três, N vezes ao mesmo `estado`. Com nomes de topo, a
 * reinscrição é idempotente e o `socket.off(...)` manual deixa de ser necessário.
 */

/**
 * Config autoritativa vinda de quem projeta. Pull-by-role:
 *  - somente-leitura: reflete a config no painel (fonte de verdade é quem projeta);
 *  - primário: guardamos, mas não sobrescrevemos o painel (o operador é a fonte).
 */
function aoReceberDisplayConfigDaProjecao(cfg) {
  ultimaDisplayConfigServidor = cfg;
  if (controladorSomenteLeitura()) aplicarDisplayConfigDoServidorNoPainel(cfg);
}

/** Estado do que está projetado nas telas. */
function aoReceberEstadoDaProjecao(estado) {

  estadoServidor = estado;
  sincronizarEstrofeAtiva(estado);
  atualizarPreviewOperador();
  atualizarIndicadorProjecaoLiveUi();
  atualizarBtnModoApresentacao();
  agendarRepinturaCompositorAposEstadoServidor();
  try {
    if (ehModoApresentacaoOperador() && apresentacaoMidiaProjetadaId) {
      const tip = estado && estado.tipo;
      const minAp = !!(estado && estado.projecaoMinistranteApresentacao);
      const aindaProjecaoApresentacao =
        tip === 'apresentacao' ||
        (tip === 'aviso' && apresentacaoMidiaProjetadaId === ID_PROJECAO_AVISO_CARD6) ||
        minAp;
      if (!aindaProjecaoApresentacao) {
        apresentacaoMidiaProjetadaId = null;
        atualizarFeedbackProjecaoApresentacaoUi();
      }
    }
  } catch (_) {
// intencional — erro ignorado
}

}

/** Estado do player de áudio/vídeo da apresentação, do lado de quem projeta. */
function aoReceberAudioStateDaProjecao(st) {

  if (!st || typeof st !== 'object') return;
  if (videoProjetadoAtivoNoPlayer()) return;
  const estadoAnterior = { ...audioStateRemoto };
  const stAjustado = ajustarEstadoVisualRetomadaAudio(st, estadoAnterior);
  audioStateRemoto = {
    ...audioStateRemoto,
    ...stAjustado,
  };
  if (stAjustado.mediaKind) audioStateRemoto.mediaKind = stAjustado.mediaKind;
  if (audioStateRemoto.playing) {
    audioLoopReinicioPendente = false;
  }
  atualizarUiPlayerAudioRemoto();
  const dur = Math.max(0, Number(audioStateRemoto.duration) || 0);
  const atual = Math.max(0, Number(audioStateRemoto.currentTime) || 0);
  const terminouFaixa =
    audioLoopAtivo &&
    !audioLoopReinicioPendente &&
    estadoAnterior.mediaKind === 'audio' &&
    estadoAnterior.playing === true &&
    audioStateRemoto.playing === false &&
    dur > 0 &&
    atual >= Math.max(0, dur - 0.35) &&
    !!apresentacaoAudioAtualId;
  if (!terminouFaixa) return;
  const item = apresentacaoAudios.find((x) => x.id === apresentacaoAudioAtualId);
  if (!item?.src) return;
  audioLoopReinicioPendente = true;
  void tocarAudioServidorApresentacao(item, { startTime: 0 }).then((ok) => {
    if (ok) {
      atualizarRodapeAudioApresentacao(item);
      return;
    }
    audioLoopReinicioPendente = false;
  });

}

/*
 * As inscrições do canal de retorno são feitas UMA vez, ao carregar o painel — e não
 * dentro de `iniciarSocket()`.
 *
 * Enquanto viveram lá, existiam só no modo remoto: `iniciarSocket()` corre a partir de
 * `conectar()`, e no modo local nunca há ligação a fazer. O painel enviava comandos e não
 * recebia `estado` nenhum. `estadoServidor` ficava em `null`, e com ele morriam o preview
 * do operador, o badge do telão, a sincronização da estrofe activa e toda a decisão que
 * pergunta «o que está projetado agora».
 *
 * Aqui em cima funcionam para os dois transportes: a porta guarda as inscrições e
 * reinscreve-as sozinha ao trocar de transporte, e `aoReceber` deduplica por identidade
 * de função.
 */
projecao.aoReceber('display_config', aoReceberDisplayConfigDaProjecao);
/* Pedido de playlists vindo de um telemóvel, reencaminhado por quem hospeda a 5510. */
projecao.aoReceber('solicitar_playlists_controlador', emitirPlaylistsDoControlador);
projecao.aoReceber('estado', aoReceberEstadoDaProjecao);
projecao.aoReceber('audio_state', aoReceberAudioStateDaProjecao);

// --- SECÇÃO G — Socket.IO (eventos tempo real: estado, playlists, músicas, apresentação) ---
function iniciarSocket(ip) {
  if (socket) {
    socket.off('disconnect');
    socket.off('connect_error');
    socket.off('connect');
    // `estado` já não consta desta lista: vive na porta de projeção, que reinscreve
    // sozinha ao trocar de transporte (ver `usarTransporte`, abaixo).
    socket.off('apresentacao_state_atualizada');
    socket.off('solicitar_playlists_controlador');
    socket.off('musicas_sincronizadas');
    socket.off('pedido_sincronizacao_banco');
    socket.disconnect();
  }

  let _conectandoEmAndamento = false;
  // auth no handshake: credencial de dispositivo para a allowlist do servidor (etapa 3).
  socket = io(`http://${ip}:5510`, { auth: obterIdentidadeDispositivoLocal() });
  /* O transporte do socket NÃO se adota já: enquanto a ligação não vinga, quem projeta
     continua a ser o transporte em vigor (local, se estava a projetar aqui). A adoção
     acontece no `connect`, abaixo. */

socket.on('connect', async () => {
  if (_conectandoEmAndamento) {
    return;
  }
  /* Rede de segurança: ligar ao motor local deste PC (IP da LAN / localhost) enquanto a
     5510 está a ser servida pelo próprio Controlador NÃO é modo remoto. Sem isto o badge
     passava a SERVIDOR sem o app Servidor existir. */
  await refrescarIpsDestaMaquina();
  if (ehEnderecoDestaMaquina(ip)) {
    try { socket.disconnect(); } catch (_) { /* intencional */ }
    tratarFalhaLigacaoServidor();
    return;
  }
  _conectandoEmAndamento = true;
  try {
    /* Ligação confirmada: só agora se abandona a projeção local e se adota o transporte do
       Servidor. Feito por esta ordem, a projeção nunca fica sem transporte no meio. */
    if (projecaoLocalActiva) await desligarProjecaoNestaMaquina();
    /* Modo remoto: quem projeta é o Servidor, do outro lado deste socket. O transporte
       prende-se a ESTA instância — daí ser adotado a cada ligação. */
    projecao.usarTransporte(criarTransporteSocket(socket));
    // Papel desconhecido a cada (re)conexão até o servidor reenviar 'papel_controlador'.
    // Enquanto desconhecido, o boot pode empurrar preview (compat com servidor antigo);
    // se formos somente-leitura, o servidor rejeita e o papel_controlador corrige o painel.
    papelControladorLocal = null;
    socket.emit('registrar_controlador');
    migrarTemasParaGlobal();
    temasPorCulto = loadTemasPorCulto();
    temaSelecionadoPorCulto = loadTemaSelecionadoPorCulto();
    aberturaRemovidaPorCulto = loadAberturaRemovidaPorCulto();
    if (typeof fecharOverlaysPainelCtrl === 'function') fecharOverlaysPainelCtrl();
    setStatusServidorRemoto('conectado');
    /* Ligação confirmada: só agora se declara e se lembra o modo remoto. Uma tentativa
       falhada nunca chega aqui, então o reinício volta ao padrão local (ocioso). */
    try {
      localStorage.setItem(LS_PROJETAR_LOCAL, '0');
    } catch (_) {
      // intencional — sem `localStorage` liga na mesma; só não se lembra na próxima
    }
    atualizarUiConexao(true);
    document.getElementById('info-ip').textContent = ip;
    atualizarUrlsObs();
    try { localStorage.setItem(LS_IP_KEY, ip); } catch (_) {
  // intencional — erro ignorado
}
    forcarRepinturaCompositorLyra();
    await carregarMusicas(ip);
    await carregarRoteamentoTelasDoServidor();
    await carregarEstadoModoApresentacaoDoServidor();
    if (ehModoBibliaOperador()) bibliaAplicarCfgExibicao();
    else slidesAplicarCfgArmazenada();
    renderSlidesStrip();
    emitirEstadoMinistranteAoServidor();
    emitirPlaylistsDoControlador();
    enviarPlaylistsParaServidor();
    forcarRepinturaCompositorLyra();
    setTimeout(() => forcarRepinturaCompositorLyra(), 50);
    setTimeout(() => forcarRepinturaCompositorLyra(), 400);
} finally {
    _conectandoEmAndamento = false;
  }
});

  // O servidor informa o próprio IP de LAN e a porta do OBS — usados para montar as URLs
  // de Browser Source (o OBS pode estar noutro PC, então `localhost` não serve).
  socket.on('server_info', (info) => {
    if (info && info.lanIp) servidorLanIpObs = String(info.lanIp).trim();
    if (info && Number(info.obsPort) > 0) servidorObsPort = Number(info.obsPort);
    atualizarUrlsObs();
  });

  socket.off('apresentacao_state_atualizada');
  socket.on('apresentacao_state_atualizada', () => {
    carregarEstadoModoApresentacaoDoServidor();
  });


  socket.off('musicas_sincronizadas');
  socket.on('musicas_sincronizadas', async (payload) => {
    await processarMusicasSincronizadasPayload(payload);
  });

  socket.off('pedido_sincronizacao_banco');
  socket.on('pedido_sincronizacao_banco', (payload) => {
    tratarPedidoSincronizacaoBanco(payload).catch(() => {});
  });

  /**
   * Config autoritativa vinda do servidor. Pull-by-role:
   *  - somente-leitura: reflete a config do servidor no painel (fonte de verdade);
   *  - primário: guardamos, mas não sobrescrevemos o painel (o operador é a fonte).
   */

  // Heartbeat de aplicação: responde a cada ping do servidor. SEM isto, o servidor
  // consideraria este controlador (o socket registrado) "sem resposta" após N ciclos e
  // liberaria o bastão / fecharia a projeção mesmo com o socket ainda ligado.
  socket.on('ping_app', () => {
    try { socket.emit('pong_app'); } catch (_) {
      // intencional — socket pode estar em reconexão
    }
  });

  /**
   * Papel deste controlador no write-lock. Ao saber que é somente-leitura, faz o pull
   * imediato da última config do servidor (o display_config normalmente já chegou antes).
   */
  socket.on('papel_controlador', (papel) => {
    papelControladorLocal = papel && typeof papel === 'object' ? papel : null;
    try { atualizarUiConexao(!!(socket && socket.connected)); } catch (_) {
      // intencional
    }
    if (controladorSomenteLeitura() && ultimaDisplayConfigServidor) {
      aplicarDisplayConfigDoServidorNoPainel(ultimaDisplayConfigServidor);
    }
    // TODO (UX): indicar visualmente "PC X no controle" e desabilitar comandos quando read-only.
  });

  // Status global de quem detém o controle (para exibir "PC X no controle").
  socket.on('controle_status', (status) => {
    if (papelControladorLocal && status && typeof status === 'object') {
      papelControladorLocal.donoAtual = status.donoAtual || null;
    }
    // TODO (UX): atualizar o rótulo de dono do controle no painel.
  });

  // Comando recusado por este controlador estar em somente-leitura — feedback ao operador.
  socket.on('comando_recusado', (info) => {
    const motivo = (info && info.erro) || 'recusado';
    const dono = info && info.donoAtual ? ` — ${info.donoAtual} está no controle` : '';
    console.warn(`[controle] comando recusado (${motivo})${dono}`);
    // TODO (UX): trocar por um toast no painel em vez de console.
  });



  socket.on('disconnect', (motivo) => {
    atualizarUiConexao(false);
    setStatusServidorRemoto('ocioso');
    /**
     * Só reposicionar «AO VIVO» quando o próprio cliente desliga o socket ou encerra sessão —
     * quedas rápidas (ex.: erro de transporte) reconectam e o servidor pode continuar a projetar.
     */
    const m = String(motivo || '');
    const descarteCliente = m === 'io client disconnect' || m.includes('forced close');
    /* Não limpar o id só por ter saído do modo Mídias — a mídia pode continuar no telão. */
    if (descarteCliente) {
      apresentacaoMidiaProjetadaId = null;
    }
    renderSlidesStrip();
    atualizarPreviewOperador();
    atualizarBtnModoApresentacao();
    try {
      if (!ehModoApresentacaoOperador()) return;
      if (descarteCliente) {
        atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'DESCONECTADO — sem ligação ao servidor.' });
      } else {
        atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'À espera de reconexão com o servidor…' });
      }
    } catch (_) {
  // intencional — erro ignorado
}
  });
  socket.on('connect_error', () => {
    /* Não achou Servidor: nada de destrutivo. Volta a LOCAL e o local segue intacto.
       Não se mexe em `atualizarUiConexao` — o corpo continua no estado do modo local. */
    tratarFalhaLigacaoServidor();
  });
}

/** Liga ao servidor se há IP gravado. */
function tentarAutoConectarSeDesconectado() {
  /* Em modo local não há Servidor a procurar — e procurá-lo não era só inútil: o
     auto-reconectar dispara ao mudar de foco, o que acontece precisamente quando as
     janelas de projeção abrem. O painel passava de «iniciando projeção local» para
     «servidor não encontrado» e o modo local ficava por baixo, sem ninguém a apontar
     para ele. */
  if (emModoProjecaoLocal()) return;
  const ip = (document.getElementById('ip-input')?.value || '').trim();
  if (!ip) return;
  if (socket && socket.connected) return;
  conectar();
}

function configurarAutoConectarAoAlternarJanelas() {
  const rodar = () => tentarAutoConectarSeDesconectado();
  window.addEventListener('focus', rodar);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rodar();
  });
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_IP_KEY && e.key !== LS_IP_LEGACY) return;
    const ipInput = document.getElementById('ip-input');
    if (!ipInput) return;
    const novo = (e.newValue || '').trim();
    if (novo) ipInput.value = novo;
    rodar();
  });
}

/**
 * Badge do canto superior direito — só status, sem clique.
 *
 * Dois estados:
 *   - `ocioso`    → cinza,  texto «LOCAL»    — a projetar nesta máquina;
 *   - `conectado` → verde,  texto «SERVIDOR» — ligado a um Servidor remoto.
 *
 * Tentativa falhada não altera o badge: fica em LOCAL. Qualquer valor que não seja
 * `conectado` cai em `ocioso`.
 */
function setStatusServidorRemoto(estado) {
  const badge = document.getElementById('status-conn-badge');
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-txt');
  const cls = estado === 'conectado' ? 'conectado' : 'ocioso';
  const rotulo = cls === 'conectado' ? 'SERVIDOR' : 'LOCAL';
  if (badge) badge.className = 'status-conn ' + cls;
  if (dot) dot.className = 'status-dot ' + cls;
  if (txt) txt.textContent = rotulo;
  if (badge) {
    badge.title = cls === 'conectado'
      ? 'Ligado ao Servidor remoto'
      : 'A projetar nesta máquina';
  }
}

/** IPs desta máquina (LAN + loopback lógico). Evita tratar o motor local como Servidor remoto. */
const ipsDestaMaquina = new Set();

function recordarIpsDestaMaquina(lista, preferido) {
  if (preferido) ipsDestaMaquina.add(String(preferido).trim().toLowerCase());
  for (const ip of lista || []) {
    const n = String(ip || '').trim().toLowerCase();
    if (n) ipsDestaMaquina.add(n);
  }
  if (servidorLanIpObs) ipsDestaMaquina.add(String(servidorLanIpObs).trim().toLowerCase());
}

async function refrescarIpsDestaMaquina() {
  const ponte = ponteProjecaoLocal();
  if (!ponte?.estado) return;
  try {
    const st = await ponte.estado();
    recordarIpsDestaMaquina(st?.lanIps, st?.lanIp);
  } catch (_) {
    // intencional — sem lista completa, o guard ainda cobre localhost e o IP já conhecido
  }
}

/** IP alvo da ligação remota: o que está no campo de Ajustes, ou o último gravado. */
function ipRemotoAlvo() {
  const doCampo = (document.getElementById('ip-input')?.value || '').trim();
  if (doCampo) return doCampo;
  try { return (readLsMigrate(LS_IP_KEY, LS_IP_LEGACY) || '').trim(); } catch (_) { return ''; }
}

/**
 * O endereço aponta para esta própria máquina? Ligar a si mesmo não é «remoto» — com o
 * modo local a servir a 5510, o socket «ligava» ao próprio motor e o badge ia a SERVIDOR
 * sem o app Servidor existir.
 */
function ehEnderecoDestaMaquina(ip) {
  const h = String(ip || '').trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  if (servidorLanIpObs && h === String(servidorLanIpObs).trim().toLowerCase()) return true;
  return ipsDestaMaquina.has(h);
}

/**
 * Não achou Servidor. Nada de destrutivo e — importante — nada de reabrir o motor local.
 *
 * O badge volta a LOCAL. A projeção local, se estava de pé, continua: a tentativa
 * nunca a derruba (só o `connect` com sucesso a derruba). Reabrir o local aqui causava um
 * pisca-pisca das telas: uma vez ligado ao Servidor (local já derrubado), qualquer
 * `connect_error` das retentativas do socket reabria o local — que ganhava o M2 e a porta —
 * e a reconexão seguinte derrubava-o outra vez, em ciclo. O local só se (re)liga por
 * arranque ou por acção explícita do operador, nunca como efeito de uma falha remota.
 */
function tratarFalhaLigacaoServidor() {
  setStatusServidorRemoto('ocioso');
}

async function carregarMusicas() {
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas`);
    todasMusicas = await res.json();
    filtrar();
  } catch (e) {
    console.error('Erro ao carregar músicas', e);
  }
}

function initBancoPainelFromStorage() {
  const sel = document.getElementById('banco-fonte-select');
  if (!sel) return;

  // Padrão ao abrir o controlador: banco offline (não restaura Cifra Club / Letras da sessão anterior).
  letrasSiteFonte = 'banco-local';
  sel.value = 'banco-local';
  aplicarPlaceholderBuscaLetras();

  const ft = localStorage.getItem(LS_FILTRO_TITULO);
  if (ft !== null) document.getElementById('filtro-busca-titulo').checked = ft === '1';
  const fa = localStorage.getItem(LS_FILTRO_ARTISTA);
  if (fa !== null) document.getElementById('filtro-busca-artista').checked = fa === '1';
  const fl = localStorage.getItem(LS_FILTRO_LETRA);
  if (fl !== null) document.getElementById('filtro-busca-letra').checked = fl === '1';

  const gravadoLista = localStorage.getItem(LS_BANCO_SQLITE_LISTA_ABERTA);
  bancoSqliteListaExpandida = gravadoLista !== '0';
  atualizarUiToggleListaBancoSqlite();
}

function onBancoFonteChange() {
  const sel = document.getElementById('banco-fonte-select');
  letrasSiteFonte = normalizarFonteLetrasSite(sel?.value);
  aplicarPlaceholderBuscaLetras();
  garantirBuscaLetrasEditavel();
  limparResultadosBuscaLetras();
  atualizarBotaoLimparBuscaLetras();
  setTimeout(() => document.getElementById('busca-letras-q')?.focus(), 0);
}

function garantirBuscaLocalEditavel() {
  const busca = document.getElementById('busca');
  if (!busca) return;
  // Mantém o campo utilizável mesmo após trocas de modo/fonte e estados de UI.
  busca.disabled = false;
  busca.readOnly = false;
  busca.removeAttribute('disabled');
}

function garantirBuscaLetrasEditavel() {
  const busca = document.getElementById('busca-letras-q');
  if (!busca) return;
  busca.disabled = false;
  busca.readOnly = false;
  busca.removeAttribute('disabled');
}

/* ── Limpeza da busca de letras (vale para as três fontes) ───────────────── */

/** O «x» dentro do campo só aparece havendo texto. */
function atualizarBotaoLimparBuscaLetras() {
  const inp = document.getElementById('busca-letras-q');
  const btn = document.getElementById('busca-letras-limpar');
  if (!inp || !btn) return;
  btn.hidden = !String(inp.value || '').trim();
}

/** Zera só os resultados exibidos (cache + lista + contagem), preservando o texto. */
function limparResultadosBuscaLetras() {
  resultadosLetrasCache = [];
  renderizarListaInternet([]);
}

/** Limpa campo e resultados de uma vez: botão «x» e fim de uma importação. */
function limparBuscaLetras({ focar = false } = {}) {
  const inp = document.getElementById('busca-letras-q');
  if (inp) inp.value = '';
  atualizarBotaoLimparBuscaLetras();
  limparResultadosBuscaLetras();
  if (focar && inp) {
    try {
      inp.focus();
    } catch (_) {
      // intencional — erro ignorado
    }
  }
}

/**
 * Digitação no campo. Esvaziando-o à mão, os resultados anteriores deixam de
 * ter termo associado e são descartados — antes ficavam presos na tela.
 */
function onBuscaLetrasInput() {
  atualizarBotaoLimparBuscaLetras();
  const inp = document.getElementById('busca-letras-q');
  if (inp && !String(inp.value || '').trim()) limparResultadosBuscaLetras();
}

function onFiltroBuscaChange() {
  localStorage.setItem(LS_FILTRO_TITULO, document.getElementById('filtro-busca-titulo').checked ? '1' : '0');
  localStorage.setItem(LS_FILTRO_ARTISTA, document.getElementById('filtro-busca-artista').checked ? '1' : '0');
  localStorage.setItem(LS_FILTRO_LETRA, document.getElementById('filtro-busca-letra').checked ? '1' : '0');
  filtrar();
}

function refreshListaBanco() {
  renderizarListaInternet(resultadosLetrasCache);
  filtrar();
}

/**
 * Atualiza a linha de contexto acima da lista de resultados da pesquisa.
 * A fonte já está indicada no seletor acima, então aqui mostramos apenas
 * a contagem ("X resultados encontrados"). Some quando não há lista.
 */
function atualizarContagemListaInternet(qtd) {
  const el = document.getElementById('lista-internet-contagem');
  if (!el) return;
  if (!qtd) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = qtd === 1 ? '1 resultado encontrado' : `${qtd} resultados encontrados`;
}

function renderizarListaInternet(lista) {
  const el = document.getElementById('lista-internet');
  if (!el) return;
  el.innerHTML = '';

  atualizarContagemListaInternet(Array.isArray(lista) ? lista.length : 0);

  lista.forEach((m) => {
    const div = document.createElement('div');
    div.className = 'item item--letras';
    const meta = document.createElement('div');
    meta.className = 'item-letras-meta';
    meta.innerHTML = `
      <div class="titulo">${escapeHtml(m.titulo || '')}</div>
      ${m.artista ? `<div class="sub">${escapeHtml(m.artista)}</div>` : ''}
    `;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn sm primary btn-import-letras';
    btn.textContent = 'Ver letra';
    btn.title = 'Ver a letra completa antes de importar para o banco deste servidor';
    btn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setTimeout(() => {
        if (m.fonte === 'banco-local' && m.id != null) {
          abrirModalPreviewLetrasOffline(m.id, m.origem === 'user' ? 'user' : 'catalog');
        } else abrirModalPreviewLetras(m.path, m.fonte);
      }, 0);
    };
    div.appendChild(meta);
    div.appendChild(btn);
    el.appendChild(div);
  });
}

function renderizarListaLocal(lista) {
  const el = document.getElementById('lista');
  if (!el) return;
  listaLocalRenderizada = Array.isArray(lista) ? lista : [];
  el.innerHTML = '';

  listaLocalRenderizada.forEach((m) => {
    const div = document.createElement('div');
    const rowFonte = m.fonte === 'catalog' ? 'catalog' : 'user';
    const ativo =
      musicaAtiva &&
      Number(musicaAtiva.id) === Number(m.id) &&
      (musicaBancoFonte === 'catalog' ? 'catalog' : 'user') === rowFonte;
    div.className = 'item' + (ativo ? ' ativo' : '');
    div.innerHTML = `
      <div>
        <div class="titulo">${escapeHtml(m.titulo)}</div>
        ${m.artista ? `<div class="sub">${escapeHtml(m.artista)}</div>` : ''}
      </div>
      <div class="item-acoes-banco">
        <button type="button" class="btn sm btn-playlist-plus" title="Adicionar à playlist do culto">+</button>
        <button type="button" class="btn sm danger btn-banco-remover" title="Remover do banco neste servidor">🗑</button>
      </div>
    `;

    const btnAdd = div.querySelector('.btn-playlist-plus');
    if (btnAdd) {
      btnAdd.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await addMusicaNaPlaylist({
          id: m.id,
          titulo: m.titulo,
          artista: m.artista,
          bancoFonte: rowFonte,
        });
      });
    }
    const btnRm = div.querySelector('.btn-banco-remover');
    if (rowFonte === 'catalog') {
      btnRm.style.display = 'none';
      btnRm.disabled = true;
    } else if (btnRm) {
      btnRm.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Estado de confirmação: só aqui a lixeira fica vermelha de forma persistente.
        btnRm.classList.add('confirmando');
        solicitarRemoverMusicaDoBancoServidor(m.id, m.titulo);
      });
    }
    div.addEventListener('click', (ev) => {
      if (ev.target instanceof Element && ev.target.closest('.item-acoes-banco')) return;
      selecionarMusicaDoBanco(m.id, { fonte: rowFonte });
    });

    el.appendChild(div);
  });
}

function filtrar() {
  const titulo = document.getElementById('filtro-busca-titulo').checked;
  const artista = document.getElementById('filtro-busca-artista').checked;
  const letra = document.getElementById('filtro-busca-letra').checked;

  if (!titulo && !artista && !letra) {
    renderizarListaLocal([]);
    return;
  }

  const q = (document.getElementById('busca').value || '').trim();

  clearTimeout(filtrarLocalTimer);
  filtrarLocalTimer = null;

  const precisaDebounce = letra && q.length >= 1;

  const rodar = async () => {
    try {
      if (!letra) {
        if (!q) {
          renderizarListaLocal(todasMusicas);
          return;
        }
        const ql = q.toLowerCase();
        const filtradas = todasMusicas.filter(
          (m) =>
            (titulo && m.titulo && m.titulo.toLowerCase().includes(ql)) ||
            (artista && m.artista && m.artista.toLowerCase().includes(ql))
        );
        renderizarListaLocal(filtradas);
        return;
      }

      if (!q) {
        renderizarListaLocal(todasMusicas);
        return;
      }
      const qs = new URLSearchParams({
        q,
        titulo: titulo ? '1' : '0',
        artista: artista ? '1' : '0',
        letra: letra ? '1' : '0',
      });
      const res = await fetch(`${getControllerApiBase()}/api/musicas/buscar?${qs}`);
      const lista = await res.json();
      if (!Array.isArray(lista)) {
        renderizarListaLocal([]);
        return;
      }
      renderizarListaLocal(lista);
    } catch (e) {
      console.error(e);
      renderizarListaLocal([]);
    }
  };

  if (precisaDebounce) filtrarLocalTimer = setTimeout(() => rodar(), 220);
  else rodar();
}

async function buscarLetrasExterno() {
  if (getLetrasSiteFonteAtual() === 'banco-local') {
    const q = document.getElementById('busca-letras-q').value.trim();
    if (!q) return alert('Digite o nome da música/artista ou um trecho da letra');
    const titulo = document.getElementById('filtro-busca-titulo').checked;
    const artista = document.getElementById('filtro-busca-artista').checked;
    const letra = document.getElementById('filtro-busca-letra').checked;
    if (!titulo && !artista && !letra) return alert('Marque pelo menos um critério de busca.');
    const elLista = document.getElementById('lista-internet');
    if (elLista) elLista.innerHTML = '<div class="placeholder-msg">Buscando no banco offline…</div>';
    try {
      const params = new URLSearchParams({
        q,
        titulo: titulo ? '1' : '0',
        artista: artista ? '1' : '0',
        letra: letra ? '1' : '0',
      });
      const res = await fetch(`${getControllerApiBase()}/api/letras/buscar-local?${params}`);
      const data = await res.json().catch(() => ({}));

      if (!data.sucesso) {
        alert(data.erro || 'Erro ao buscar no banco local');
        resultadosLetrasCache = [];
        renderizarListaInternet([]);
        return;
      }

      if (!data.resultados || data.resultados.length === 0) {
        alert('Nenhuma música encontrada no banco offline (suas músicas + catálogo).');
        resultadosLetrasCache = [];
        renderizarListaInternet([]);
        return;
      }

      resultadosLetrasCache = data.resultados.map((r) => ({
        titulo: r.titulo,
        artista: r.artista,
        path: r.path,
        id: r.id,
        fonte: 'banco-local',
        origem: r.origem === 'user' ? 'user' : 'catalog',
      }));
      renderizarListaInternet(resultadosLetrasCache);
    } catch (_err) {
      alert('Erro de conexão com o banco offline.');
      resultadosLetrasCache = [];
      renderizarListaInternet([]);
    }
    return;
  }

  const q = document.getElementById('busca-letras-q').value.trim();
  if (!q) return alert('Digite o nome da música/artista');
  
  const titulo = document.getElementById('filtro-busca-titulo').checked;
  const artista = document.getElementById('filtro-busca-artista').checked;
  const letra = document.getElementById('filtro-busca-letra').checked;
  
  if (!titulo && !artista && !letra) return alert('Marque pelo menos um critério de busca.');
  
  // ALTERADO: agora aponta para o Controller (porta 3001)
  const base = `${getControllerApiBase()}/api/letras/buscar`;
  
  try {
    // Controller espera titulo e artista como query params
    const params = new URLSearchParams({
      titulo: q,
      artista: artista ? '1' : '',
      fonte: getLetrasSiteFonteAtual(),
    });
    
    const res = await fetch(`${base}?${params}`);
    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      alert(data.erro || `Erro HTTP ${res.status}`);
      resultadosLetrasCache = [];
      renderizarListaInternet([]);
      return;
    }

    if (data.sucesso && data.resultados && data.resultados.length > 0) {
      resultadosLetrasCache = data.resultados;
      renderizarListaInternet(resultadosLetrasCache);
    } else {
      alert(data.erro || 'Nenhum resultado encontrado');
      resultadosLetrasCache = [];
      renderizarListaInternet([]);
    }
  } catch (e) {
    console.error('Erro na busca:', e);
    alert('Erro ao buscar letra. Verifique se o Controller está rodando (porta 3001): ' + e.message);
  }
}

/**
 * Diálogo de decisão quando o backend responde 409 (música equivalente já
 * existe no banco do usuário). Nada foi gravado até aqui — a escolha do usuário
 * é que define o fluxo.
 *
 * @param {{ existente?: object, titulo?: string, artista?: string }} data Corpo do 409.
 * @returns {Promise<'usar'|'criar'|null>} `null` = cancelar.
 */
async function decidirDuplicidadeMusica(data) {
  const existente = (data && data.existente) || {};
  const tituloExistente = String(existente.titulo || data?.titulo || 'Sem título').trim();
  const artistaExistente = String(existente.artista || '').trim();
  const tituloNovo = String(data?.titulo || '').trim();
  const artistaNovo = String(data?.artista || '').trim();

  const descreve = (t, a) => (a ? `«${t}» — ${a}` : `«${t}»`);
  const linhas = [`Já existe no seu banco: ${descreve(tituloExistente, artistaExistente)}.`];
  // Só mostra o "a importar" quando a grafia difere — é justamente o caso que
  // a comparação normalizada passou a reconhecer.
  if (tituloNovo && (tituloNovo !== tituloExistente || artistaNovo !== artistaExistente)) {
    linhas.push(`A adicionar: ${descreve(tituloNovo, artistaNovo)}.`);
  }
  linhas.push(
    '',
    'Usar a existente: abre a música já salva, sem gravar nada.',
    'Criar mesmo assim: grava uma nova versão ligada à existente; o original não é alterado.'
  );

  return appEscolherOpcao(
    'Música já existe no banco',
    [
      { label: 'Usar a música existente', value: 'usar' },
      { label: 'Criar mesmo assim como nova versão', value: 'criar' },
    ],
    linhas.join('\n'),
    { cancelLabel: 'Cancelar' }
  );
}

/** Abre no editor a música já existente apontada pelo 409, sem gravar nada. */
async function usarMusicaExistenteDoBanco(data) {
  const idExistente = Number(data?.existente?.id);
  if (!Number.isFinite(idExistente)) {
    alert('Não foi possível localizar a música existente no banco.');
    return;
  }
  await carregarMusicas();
  await selecionarMusicaDoBanco(idExistente, { fonte: 'user' });
  limparBuscaLetras();
}

async function importarLetrasParaBanco(path, maxLinhasPorSlide = 4, fonte, decisaoDuplicidade = '') {
  const fonteEnvio = fonte === 'letras-mus-br' ? 'letras-mus-br' : 'cifraclub';
  try {
    const res = await fetch(`${getControllerApiBase()}/api/letras/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, maxLinhasPorSlide, fonte: fonteEnvio, decisaoDuplicidade }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.duplicado) {
      const escolha = await decidirDuplicidadeMusica(data);
      if (escolha === 'usar') return usarMusicaExistenteDoBanco(data);
      if (escolha === 'criar')
        return importarLetrasParaBanco(path, maxLinhasPorSlide, fonte, 'criar');
      return;
    }
    if (!res.ok) {
      alert(
        res.status === 404
          ? 'API de importação Letras indisponível (HTTP 404). Verifique se o Controlador está em execução (porta 3001).'
          : data.erro || `Erro HTTP ${res.status}`
      );
      return;
    }
    await carregarMusicas();
    await selecionarMusicaDoBanco(data.id);
    limparBuscaLetras();
  } catch (e) {
    alert(e.message || 'Falha ao importar.');
  }
}

async function importarLetrasDoCatalogoParaBanco(catalogId, maxLinhasPorSlide = 4, decisaoDuplicidade = '') {
  try {
    const res = await fetch(`${getControllerApiBase()}/api/letras/importar-do-catalogo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: catalogId, maxLinhasPorSlide, decisaoDuplicidade }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.duplicado) {
      const escolha = await decidirDuplicidadeMusica(data);
      if (escolha === 'usar') return usarMusicaExistenteDoBanco(data);
      if (escolha === 'criar')
        return importarLetrasDoCatalogoParaBanco(catalogId, maxLinhasPorSlide, 'criar');
      return;
    }
    if (!res.ok) {
      alert(data.erro || `Erro HTTP ${res.status}`);
      return;
    }
    await carregarMusicas();
    await selecionarMusicaDoBanco(data.id);
    limparBuscaLetras();
  } catch (e) {
    alert(e.message || 'Falha ao importar do catálogo.');
  }
}

function abrirModalNovaMusicaManual() {
  const tit = document.getElementById('nova-musica-manual-titulo');
  const art = document.getElementById('nova-musica-manual-artista');
  const est = document.getElementById('nova-musica-manual-estrofes');
  if (tit) tit.value = '';
  if (art) art.value = '';
  if (est) est.value = '';
  const bd = document.getElementById('nova-musica-manual-backdrop');
  if (bd) {
    bd.hidden = false;
    bd.setAttribute('aria-hidden', 'false');
  }
  setTimeout(() => tit?.focus(), 30);
}

function fecharModalNovaMusicaManual() {
  const bd = document.getElementById('nova-musica-manual-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
}

/** Reabre o modal preservando o que já foi digitado (usado ao cancelar o
 *  diálogo de duplicidade — o modal precisa sair da frente porque o
 *  `app-dialog-overlay` fica numa camada abaixo dele). */
function reabrirModalNovaMusicaManual() {
  const bd = document.getElementById('nova-musica-manual-backdrop');
  if (bd) {
    bd.hidden = false;
    bd.setAttribute('aria-hidden', 'false');
  }
}

async function salvarNovaMusicaManualNoServidor(decisaoDuplicidade = '') {
  const titulo = document.getElementById('nova-musica-manual-titulo')?.value.trim() || '';
  const artista = document.getElementById('nova-musica-manual-artista')?.value.trim() || '';
  const raw = document.getElementById('nova-musica-manual-estrofes')?.value || '';
  if (!titulo) return alert('Informe o título da música.');
  const estrofes = splitTextoEmEstrofesPorLinhaVaziaStrict(raw)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (estrofes.length === 0) {
    return alert('Informe pelo menos uma estrofe. Slides separados só com linha totalmente vazia (Enter duplo, sem espaço na linha do meio).');
  }
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, artista, estrofes, decisaoDuplicidade }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.duplicado) {
      fecharModalNovaMusicaManual();
      const escolha = await decidirDuplicidadeMusica(data);
      if (escolha === 'usar') return usarMusicaExistenteDoBanco(data);
      if (escolha === 'criar') return salvarNovaMusicaManualNoServidor('criar');
      // Cancelou: devolve o formulário com o texto preservado.
      reabrirModalNovaMusicaManual();
      return;
    }
    if (!res.ok) {
      alert(data.erro || `Erro HTTP ${res.status}`);
      return;
    }
    fecharModalNovaMusicaManual();
    await carregarMusicas();
    await selecionarMusicaDoBanco(data.id);
  } catch (e) {
    alert(e.message || 'Erro ao criar a música no banco local.');
  }
}

function configurarModalNovaMusicaManual() {
  const bd = document.getElementById('nova-musica-manual-backdrop');
  if (bd) {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) fecharModalNovaMusicaManual();
    });
  }
  document.getElementById('nova-musica-manual-cancel')?.addEventListener('click', fecharModalNovaMusicaManual);
  document.getElementById('nova-musica-manual-salvar')?.addEventListener('click', () => salvarNovaMusicaManualNoServidor());
}

function aplicarBaseMusicaSelecionada(base, id, versaoLocalId) {
  const idNum = Number(id);
  musicaRootId = Number(base?.root_id ?? idNum);
  musicaVersaoLocalId = versaoLocalId && String(versaoLocalId).trim() ? String(versaoLocalId) : null;
  if (musicaVersaoLocalId && ehVersaoLocalLegada(musicaVersaoLocalId)) {
    const c = encontrarCopiaLocal(idNum, musicaVersaoLocalId);
    if (c) {
      musicaAtiva = {
        ...base,
        titulo: c.titulo,
        artista: c.artista || '',
        estrofes: (c.estrofes || []).map((s) => String(s)),
      };
    } else {
      musicaAtiva = base;
      musicaVersaoLocalId = null;
    }
  } else {
    musicaAtiva = base;
    if (musicaVersaoLocalId && ehVersaoServidorId(musicaVersaoLocalId)) {
      musicaVersaoLocalId = null;
    }
  }
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (et) et.value = musicaAtiva.titulo || '';
  if (ea) ea.value = musicaAtiva.artista || '';
  void carregarVersoesMusicaServidor(musicaRootId);
  atualizarToolbarModoEdicao();
}

async function confirmarRemoverVersaoLocal(idMusica, copiaId) {
  const ok = await appConfirm(
    'Remover esta versão local? Itens da playlist que usavam esta versão passarão a usar o texto original.',
    'Remover versão'
  );
  if (!ok) return;
  removerCopiaLocal(idMusica, copiaId);
  removerVersaoLocalDasPlaylists(idMusica, copiaId);
  const idNum = Number(idMusica);
  if (musicaAtiva && Number(musicaAtiva.id) === idNum && musicaVersaoLocalId === copiaId) {
    await trocarVersaoMusicaCentral(null);
  } else {
    renderMusicaVersoesBar();
    renderPlaylist();
    refreshListaBanco();
  }
}

function rotuloExibicaoVersaoServidor(v) {
  const rotulo = String(v.rotulo || '').trim();
  if (rotulo) return rotulo.toLocaleUpperCase('pt-BR');
  return 'CÓPIA';
}

/**
 * Descreve a versão «cópia» atualmente selecionada (não-ORIGINAL), para as ações
 * contextuais do menu inferior. Devolve `null` quando ORIGINAL, catálogo ou sem
 * música — casos em que Editar nome / Apagar cópia não se aplicam.
 * @returns {{ tipo: 'local'|'servidor', rootId: number, id: string, rotulo: string } | null}
 */
function versaoCopiaSelecionadaAtual() {
  if (!musicaAtiva || musicaAtiva.id == null || musicaBancoFonte === 'catalog') return null;
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) return null;
  if (musicaVersaoLocalId) {
    const copia = encontrarCopiaLocal(rootId, musicaVersaoLocalId);
    if (!copia) return null;
    return { tipo: 'local', rootId, id: copia.id, rotulo: copia.rotulo || '' };
  }
  if (!musicaAtivaEhOriginalServidor()) {
    return { tipo: 'servidor', rootId, id: String(musicaAtiva.id), rotulo: musicaAtiva.rotulo || '' };
  }
  return null;
}

/** Editar nome (menu inferior): renomeia a cópia selecionada — servidor ou local. */
function editarNomeVersaoSelecionada() {
  const c = versaoCopiaSelecionadaAtual();
  if (!c) return;
  if (c.tipo === 'local') void iniciarRenomearVersaoLocal(c.rootId, c.id, c.rotulo);
  else void iniciarRenomearVersaoServidor(c.rootId, c.id, c.rotulo);
}

/** Apagar cópia (menu inferior): remove a cópia selecionada — servidor ou local. */
function apagarCopiaVersaoSelecionada() {
  const c = versaoCopiaSelecionadaAtual();
  if (!c) return;
  if (c.tipo === 'local') void confirmarRemoverVersaoLocal(c.rootId, c.id);
  else void confirmarRemoverVersaoServidor(c.rootId, c.id);
}

function renderMusicaVersoesBar() {
  const bar = document.getElementById('musica-versoes-bar');
  if (!bar) return;
  if (!musicaAtiva || musicaAtiva.id == null) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) {
    bar.hidden = true;
    return;
  }
  if (musicaBancoFonte === 'catalog') {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  const versoesSrv =
    Number(versoesMusicaServidorCache.rootId) === rootId
      ? versoesMusicaServidorCache.versoes || []
      : [];
  const copiasLocais = getCopiasParaMusica(rootId);
  const temAlgo = versoesSrv.some((v) => v.parent_id != null) || copiasLocais.length > 0;
  if (!temAlgo && musicaAtivaEhOriginalServidor()) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  bar.hidden = false;
  bar.innerHTML = '';
  const mkBtn = (label, copiaId, ativo) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn sm' + (ativo ? ' versao-musica-ativa' : '');
    b.textContent = label;
    b.onclick = () => void trocarVersaoMusicaCentral(copiaId);
    return b;
  };

  const originalAtivo = musicaAtivaEhOriginalServidor() && !musicaVersaoLocalId;
  bar.appendChild(mkBtn('ORIGINAL', null, originalAtivo));

  for (const v of versoesSrv) {
    if (v.parent_id == null && Number(v.id) === rootId) continue;
    if (v.parent_id == null) continue;
    const vid = String(v.id);
    const ativo = !musicaVersaoLocalId && Number(musicaAtiva.id) === Number(v.id);
    /* Só o nome/badge — editar e apagar ficam no menu inferior contextual. */
    bar.appendChild(mkBtn(rotuloExibicaoVersaoServidor(v), vid, ativo));
  }

  copiasLocais.forEach((c) => {
    const rotuloVis = `${String(c.rotulo || 'Cópia').toLocaleUpperCase('pt-BR')} (LOCAL)`;
    bar.appendChild(mkBtn(rotuloVis, c.id, musicaVersaoLocalId === c.id));
  });
}

async function iniciarRenomearVersaoServidor(rootId, versaoId, rotuloAtual) {
  const nome = await appPrompt('Novo nome da versão:', {
    title: 'Renomear versão',
    defaultValue: String(rotuloAtual || '').trim(),
    emptyMsg: 'Digite um nome para a versão.',
  });
  if (!nome) return;
  const idNum = parseInt(versaoId, 10);
  if (!Number.isFinite(idNum)) return;
  try {
    let res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/rotulo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotulo: nome }),
    });
    if (res.status === 404) {
      res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/rotulo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotulo: nome }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      await appAlert(data.erro || `Não foi possível renomear (HTTP ${res.status}).`);
      return;
    }
    const rotuloFinal = String(data.rotulo || nome).trim();
    atualizarRotuloVersaoNasPlaylists(rootId, versaoId, rotuloFinal);
    if (musicaAtiva && Number(musicaAtiva.id) === idNum) {
      musicaAtiva.rotulo = rotuloFinal;
    }
    await carregarVersoesMusicaServidor(rootId);
    renderPlaylist();
  } catch (e) {
    await appAlert(e?.message || 'Não foi possível renomear a versão.');
  }
}

async function iniciarRenomearVersaoLocal(rootId, copiaId, rotuloAtual) {
  const nome = await appPrompt('Novo nome da versão:', {
    title: 'Renomear versão',
    defaultValue: String(rotuloAtual || '').trim(),
    emptyMsg: 'Digite um nome para a versão.',
  });
  if (!nome) return;
  const up = atualizarCopiaLocal(rootId, copiaId, { rotulo: nome });
  if (!up.ok) {
    await appAlert(up.erro || 'Não foi possível renomear a versão local.');
    return;
  }
  atualizarRotuloVersaoNasPlaylists(rootId, copiaId, nome);
  renderMusicaVersoesBar();
  renderPlaylist();
}

async function confirmarRemoverVersaoServidor(rootId, versaoId) {
  const ok = await appConfirm(
    'Remover esta versão do banco? Itens da playlist que usavam esta versão passarão a usar o original.',
    'Remover versão'
  );
  if (!ok) return;
  const idNum = parseInt(versaoId, 10);
  if (!Number.isFinite(idNum)) return;
  try {
    let res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/excluir`, {
      method: 'POST',
    });
    if (!res.ok) {
      res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}`, { method: 'DELETE' });
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      await appAlert(data.erro || `Não foi possível remover (HTTP ${res.status}).`);
      return;
    }
    removerVersaoLocalDasPlaylists(rootId, String(versaoId));
    if (musicaAtiva && Number(musicaAtiva.id) === idNum) {
      await trocarVersaoMusicaCentral(null);
    } else {
      await carregarVersoesMusicaServidor(rootId);
      renderPlaylist();
      refreshListaBanco();
    }
  } catch (e) {
    appAlert(e?.message || 'Não foi possível remover a versão.');
  }
}

async function trocarVersaoMusicaCentral(copiaId) {
  if (!musicaAtiva) return;
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) return;
  if (modoEdicaoEstrofes || modoLetraCompletaCentral || temEdicaoMusicaNaoGravada()) {
    const ok = await appConfirm(
      'Descartar alterações não gravadas nesta sessão e trocar de versão?',
      'Trocar versão'
    );
    if (!ok) return;
  }
  limparFlagsModoEdicaoMusica();
  try {
    const vid = copiaId && String(copiaId).trim() ? String(copiaId) : null;
    let url;
    if (!vid) {
      url = `${getControllerApiBase()}/api/musicas/${rootId}`;
    } else if (ehVersaoLocalLegada(vid)) {
      url = `${getControllerApiBase()}/api/musicas/${rootId}`;
    } else {
      url = `${getControllerApiBase()}/api/musicas/${encodeURIComponent(vid)}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao carregar música (HTTP ${res.status}).`);
    const base = await res.json();
    if (!base || !Array.isArray(base.estrofes)) throw new Error('Resposta inválida do controlador.');
    musicaBancoFonte = 'user';
    if (!vid || ehVersaoServidorId(vid)) {
      musicaAtiva = base;
      musicaVersaoLocalId = vid && ehVersaoLocalLegada(vid) ? vid : null;
      musicaRootId = Number(base.root_id ?? rootId);
      const et = document.getElementById('edit-titulo');
      const ea = document.getElementById('edit-artista');
      if (et) et.value = musicaAtiva.titulo || '';
      if (ea) ea.value = musicaAtiva.artista || '';
      await carregarVersoesMusicaServidor(musicaRootId);
    } else {
      aplicarBaseMusicaSelecionada(base, rootId, vid);
    }
    estrofeAtiva = Math.min(
      Math.max(estrofeAtiva < 0 ? 0 : estrofeAtiva, 0),
      Math.max(0, musicaAtiva.estrofes.length - 1)
    );
    projecaoMusicaEmitidaNoServidor = false;
    bloqueioSincronizarEstrofeDoServidor = true;
    refreshListaBanco();
    renderPlaylist();
    renderEstrofesEditor();
    renderSlidesStrip();
    atualizarPreviewOperador();
    atualizarToolbarModoEdicao();
    marcacaoEstrofeEditor();
  } catch (e) {
    appAlert(e?.message || 'Não foi possível trocar de versão.');
  }
}

async function selecionarMusicaDoBanco(id, opts) {
  const fonteBanco = opts && opts.fonte === 'catalog' ? 'catalog' : 'user';
  const qsMusica = fonteBanco === 'catalog' ? '?fonte=catalog' : '';
  try {
    if (!(opts && opts.pularConfirmacaoDescarte)) {
      if (
        !(await confirmarProsseguirDescartandoEdicaoPendente(
          'Há alterações não gravadas nesta sessão. Descartar e carregar outra música?',
          'Alterações não gravadas'
        ))
      ) {
        return false;
      }
    }
    if (ehModoSlidesOperador()) slidesRailUserRecolhido = false;
    /* Modo controlador: se já existe projeção ativa, manter a faixa visível ao engatilhar próxima música. */
    slidesDockVisivel = ehModoSlidesOperador() || slidesDockVisivel || hayProjecaoAtivaNoServidor();
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${id}${qsMusica}`);
    if (!res.ok) throw new Error(`Falha ao carregar música (HTTP ${res.status}).`);
    const base = await res.json();
    if (!base || !Array.isArray(base.estrofes)) {
      throw new Error('Resposta inválida do servidor ao carregar a música.');
    }
    const versaoReq =
      opts && opts.versaoLocalId !== undefined && opts.versaoLocalId !== null
        ? String(opts.versaoLocalId)
        : null;
    musicaBancoFonte = fonteBanco;
    if (versaoReq && ehVersaoServidorId(versaoReq)) {
      const resV = await fetch(`${getControllerApiBase()}/api/musicas/${encodeURIComponent(versaoReq)}`);
      if (!resV.ok) throw new Error(`Falha ao carregar versão (HTTP ${resV.status}).`);
      const ver = await resV.json();
      musicaAtiva = ver;
      musicaVersaoLocalId = null;
      musicaRootId = Number(ver.root_id ?? id);
      const et = document.getElementById('edit-titulo');
      const ea = document.getElementById('edit-artista');
      if (et) et.value = musicaAtiva.titulo || '';
      if (ea) ea.value = musicaAtiva.artista || '';
      await carregarVersoesMusicaServidor(musicaRootId);
    } else {
      aplicarBaseMusicaSelecionada(base, id, versaoReq);
    }
    if (ehModoSlidesOperador()) {
      faixaSlidesHabilitadaPorPlaylistNoModoSlides = !!(opts && opts.habilitarFaixaModoSlides);
    } else {
      faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
    }
    estrofeAtiva = -1;

    /* Antes de construir chips da faixa: sem isto, `projecaoMusicaEmitidaNoServidor` ainda vinha true da música anterior e um único clique no chip projetava. */
    projecaoMusicaEmitidaNoServidor = false;
    bloqueioSincronizarEstrofeDoServidor = true;

    refreshListaBanco();
    renderPlaylist();
    renderEstrofesEditor();
    renderSlidesStrip();
    atualizarPreviewOperador();
    return true;
  } catch (e) {
    musicaAtiva = null;
    musicaVersaoLocalId = null;
    musicaRootId = null;
    versoesMusicaServidorCache = { rootId: null, versoes: [] };
    musicaBancoFonte = 'user';
    estrofeAtiva = -1;
    renderMusicaVersoesBar();
    renderPlaylist();
    renderEstrofesEditor();
    renderSlidesStrip();
    atualizarPreviewOperador();
    alert(e?.message || 'Não foi possível carregar a música para edição/projeção.');
    return false;
  }
}

async function projecaoProximaMusicaPlaylist() {
  if (!projecao.pronta()) return alert('Conecte ao servidor.');
  /* Mesma razão de `playlistDuploCliqueIniciarProjecao`: o guard é sobre alcançar a
     projeção, e no modo local ela está nesta máquina — pedir um IP aqui bloqueava quem
     nunca configurou nenhum. */
  const hostAtual = hostProjecao();
  if (!hostAtual) return alert('Informe o IP ou use «Conectar».');
  if (!musicaAtiva) return alert('Selecione uma música primeiro.');
  const pl = getPlaylist(cultoId);
  const idx = pl.findIndex((it) => playlistItemMesmaVersaoQueAtiva(it));
  if (idx < 0) return alert('A música atual não está nesta playlist.');
  const j = indiceProximaMusicaNaPlaylist(pl, idx);
  if (j < 0) return alert('Não há próxima música nesta playlist.');
  if (
    !(await confirmarProsseguirDescartandoEdicaoPendente(
      'Há alterações não gravadas nesta sessão. Descartar e ir para a próxima música?',
      'Alterações não gravadas'
    ))
  ) {
    return;
  }
  const next = pl[j];
  const ok = await selecionarMusicaDoBanco(Number(next.id), {
    habilitarFaixaModoSlides: true,
    versaoLocalId: next.versaoLocalId || undefined,
    fonte: next.bancoFonte === 'catalog' ? 'catalog' : 'user',
    pularConfirmacaoDescarte: true,
  });
  if (!ok || !musicaAtiva) return;
  /* Garante destaque na playlist + botão «Próxima» alinhados à música recém-carregada. */
  faixaSlidesHabilitadaPorPlaylistNoModoSlides = true;
  estrofeAtiva = 0;
  slidesDockVisivel = ehModoSlidesOperador();
  emitirEstrofeAoServidor(0);
  renderPlaylist();
  renderSlidesStrip();
  atualizarPreviewOperador();
  marcacaoEstrofeEditor();
  atualizarEstadoBtnProximaMusicaPlaylist();
}

function montarPayloadExibirMusica(estrofeIndex) {
  if (!musicaAtiva) return { musicaId: null, estrofeIndex };
  const payload = { musicaId: musicaAtiva.id, estrofeIndex };
  payload.estrofes = (musicaAtiva.estrofes || []).map((s) => String(s ?? ''));
  payload.titulo = String(musicaAtiva.titulo || '').trim();
  return payload;
}

function emitirEstrofeAoServidor(index) {
  if (!projecao.pronta() || !musicaAtiva) return;
  bloqueioSincronizarEstrofeDoServidor = false;
  projecaoMusicaEmitidaNoServidor = true;
  if (ehModoSlidesOperador()) slidesRailUserRecolhido = false;
  projecao.enviar('exibir_musica', montarPayloadExibirMusica(index));
}

/** Atualiza só o painel (estrofe «selecionada»). Não envia às telas — use duplo clique ou setas após projeção iniciada. */
function exibirEstrofe(index) {
  if (!musicaAtiva) return;
  if (ehModoSlidesOperador()) slidesRailUserRecolhido = false;
  estrofeAtiva = index;
  renderSlidesStrip();
  atualizarPreviewOperador();
  renderPlaylist();
  marcacaoEstrofeEditor();
}

function navegarEstrofe(dir) {
  if (!musicaAtiva || !musicaAtiva.estrofes.length) return;
  const idxMaxPreto = musicaAtiva.estrofes.length;
  const prox = estrofeAtiva + dir;
  if (prox >= 0 && prox <= idxMaxPreto) {
    exibirEstrofe(prox);
    if (projecaoMusicaEmitidaNoServidor && projecao.pronta()) {
      emitirEstrofeAoServidor(prox);
    }
  }
}

/**
 * Passador USB / apresentador sem fio (2 teclas): em geral envia PageDown/PageUp ou setas.
 * Devolve +1 (avançar), -1 (voltar) ou 0 se não for tecla de passador.
 */
function direcaoTeclaPassadorSlides(tecla, code) {
  const k = String(tecla || '');
  const c = String(code || '');
  const avancar = new Set([
    'PageDown',
    'ArrowRight',
    'ArrowDown',
    'Numpad2',
    'Numpad3',
    'Numpad6',
    'NumpadEnter',
    'Enter',
  ]);
  const voltar = new Set([
    'PageUp',
    'ArrowLeft',
    'ArrowUp',
    'Numpad4',
    'Numpad8',
    'Numpad9',
    'Backspace',
  ]);
  if (avancar.has(k) || c === 'PageDown' || c === 'MediaTrackNext') return 1;
  if (voltar.has(k) || c === 'PageUp' || c === 'MediaTrackPrevious') return -1;
  if (ehModoSlidesOperador() && k === ' ') return 1;
  return 0;
}

/**
 * Modo slides + passador: avançar/voltar slide e projetar no telão (socket ligado),
 * como no PowerPoint — não exige duplo clique no chip.
 */
function navegarEstrofePassadorSlides(direcao) {
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes) || !musicaAtiva.estrofes.length) return;
  if (!ehModoSlidesOperador()) {
    navegarEstrofe(direcao);
    return;
  }
  const idxMaxPreto = musicaAtiva.estrofes.length;
  let base = Number.isFinite(estrofeAtiva) ? estrofeAtiva : -1;
  let prox = base + direcao;
  if (base < 0 && direcao > 0) prox = 0;
  prox = Math.max(0, Math.min(idxMaxPreto, prox));
  if (prox === estrofeAtiva && projecaoMusicaEmitidaNoServidor) return;
  if (projecao.pronta()) {
    emitirEstrofeAoServidor(prox);
    exibirEstrofe(prox);
    return;
  }
  exibirEstrofe(prox);
}

/** Comando de voz / atalho: projeta estrofe no índice dado (0 … N, N = tela preta). */
function projecionarEstrofeModoSlides(index) {
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes) || !musicaAtiva.estrofes.length) return;
  const idxMaxPreto = musicaAtiva.estrofes.length;
  const idx = Math.max(0, Math.min(idxMaxPreto, Number(index)));
  if (projecao.pronta()) {
    emitirEstrofeAoServidor(idx);
    exibirEstrofe(idx);
    return;
  }
  exibirEstrofe(idx);
}

const reconhecimentoVozSlides = criarReconhecimentoVozSlides({
  ehModoSlides: ehModoSlidesOperador,
  ehModoApresentacao: ehModoApresentacaoOperador,
  // Microfone desativado no modo mídias (mesmo comportamento da Home): só disponível no modo slides.
  painelVozVisivel: () => ehModoSlidesOperador(),
  obterMusicaAtiva: () => musicaAtiva,
  projecionarEstrofe: projecionarEstrofeModoSlides,
  navegarDirecao: navegarEstrofePassadorSlides,
  encerrarComoEsc: () => {
    if (ehModoSlidesOperador()) {
      encerrarProjecaoDoControlador({ limparMusica: true });
    }
  },
  mudarModoApresentacao: () => {
    if (!ehModoApresentacaoOperador()) abrirMenuModoApresentacao();
  },
  mudarModoSlides: () => {
    if (ehModoApresentacaoOperador()) {
      fecharMenuModoApresentacao();
      setTimeout(() => {
        if (!ehModoSlidesOperador()) alternarModoSlidesOperador();
        else reconhecimentoVozSlides.atualizarUi();
      }, 360);
      return;
    }
    if (!ehModoSlidesOperador()) alternarModoSlidesOperador();
  },
  mudarModoCompleto: () => irParaTelaInicial(),
  mudarModoBiblia: () => {
    if (ehModoApresentacaoOperador()) {
      fecharMenuModoApresentacao();
      setTimeout(() => {
        if (!ehModoBibliaOperador()) alternarModoBiblia();
      }, 360);
      return;
    }
    if (!ehModoBibliaOperador()) alternarModoBiblia();
  },
});

/**
 * Regista cedo no `window` os handlers do HTML (`onclick="…"`).
 * Se o bootstrap abaixo falhar, os botões de modo continuam clicáveis.
 */
exporCallbacksParaAtributosHtml({
  recarregarPainelControlador,
  conectar,
  alternarProjecaoNestaMaquina,
  ligarProjecaoNestaMaquina,
  desligarProjecaoNestaMaquina,
  copiarUrlObs,
  irParaTelaInicial,
  alternarModoSlidesOperador,
  alternarModoBiblia,
  onTraducaoBibliaChange,
  alternarVozSlides: () => {
    if (ehModoBibliaOperador()) reconhecimentoVozBiblia.alternarAtivo();
    else reconhecimentoVozSlides.alternarAtivo();
  },
  abrirMenuModoApresentacao,
  abrirCfgModal,
  toggleDarkCtrl,
  abrirModalNovaMusicaManual,
  buscarLetrasExterno,
  editarNomeVersaoSelecionada,
  apagarCopiaVersaoSelecionada,
  entrarModoEdicao,
  iniciarCriarNovaVersao,
  alternarModoLetraCompletaCentral,
  cancelarModoLetraCompletaCentral,
  sairModoEdicao,
  salvarMusicaServidor,
  novaEstrofe,
  navegarEstrofe,
  limparTela,
  // SAIR na barra de letra: mesma rotina do ESC, mas sem desassociar a música do painel.
  encerrarProjecaoDoControlador: () => encerrarProjecaoDoControlador(),
  alternarOcultacaoPreviewPainel,
  bibliaBuscaRapida,
  bibliaBuscaRapidaTecla,
  bibliaNavPopupAbrir,
  bibliaNavPopupFechar,
  bnpSelecionarLivro,
  bnpConfirmarCap,
  bnpConfirmarVer,
  bibliaAplicarCfgExibicao,
  bibliaEscolherFundo,
  setBibliaPosCtrl,
  onBibliaPublicoBgTypeCtrlChange,
  onBibliaMinistranteBgTypeCtrlChange,
  onBibliaPublicoCfgChange,
  onBibliaMinistranteCfgChange,
  alternarOcultacaoPlaylistPreviewSlide,
  projecaoProximaMusicaPlaylist,
  fecharCfgModal,
  mudarAbaCfg,
  setPosCtrl,
  salvarCfgNoServidor,
  onBancoFonteChange,
  alternarListaBancoSqlite,
  onFiltroBuscaChange,
  onBuscaLetrasInput,
  limparBuscaLetras,
  filtrar,
  onPublicoBgTypeCtrlChange,
  onPublicoBgImageCtrlChange,
  onPublicoBgColorCtrlInput,
  onPublicoBgGradientCtrlInput,
  lerNumeroInput,
  setSpanText,
  debounceSalvarCfg,
  setSelVal,
  setInputVal,
  setChkVal,
  aplicarWrapImediato,
  onMinistranteBgTypeCtrlChange,
  onMinistranteBgImageCtrlChange,
  onMinistranteBgColorCtrlInput,
  onMinistranteBgGradientCtrlInput,
  onMinistranteSlideCfgChange,
  aplicarCfgRelogio,
  onClockBgTypeCtrlChange,
  onClockBgImageCtrlChange,
  onClockFontSizeCtrlInput,
  onClockDateFontSizeCtrlInput,
  onClockChurchFontSizeCtrlInput,
  onClockVerseFontSizeCtrlInput,
  onAvisoCard6CfgChange,
  setPosAvisoCard6Ctrl,
  onBibliaDivisaoCfgChange,
});

function navegarEstrofePorSeta(tecla) {
  if (!musicaAtiva || !Array.isArray(musicaAtiva.estrofes) || !musicaAtiva.estrofes.length) return;
  const idxMaxPreto = musicaAtiva.estrofes.length;
  let base = Number.isFinite(estrofeAtiva) ? estrofeAtiva : -1;
  if (base < 0) base = 0;
  let prox = base;

  if (ehModoSlidesOperador()) {
    const COLS = 7;
    if (tecla === 'ArrowRight') prox = base + 1;
    else if (tecla === 'ArrowLeft') prox = base - 1;
    else if (tecla === 'ArrowDown') prox = base + COLS;
    else if (tecla === 'ArrowUp') prox = base - COLS;
  } else {
    const COLS = 3;
    if (tecla === 'ArrowRight') prox = base + 1;
    else if (tecla === 'ArrowLeft') prox = base - 1;
    else if (tecla === 'ArrowDown') prox = base + COLS;
    else if (tecla === 'ArrowUp') prox = base - COLS;
  }

  prox = Math.max(0, Math.min(idxMaxPreto, prox));
  if (prox === estrofeAtiva) return;
  exibirEstrofe(prox);
  if (projecaoMusicaEmitidaNoServidor && projecao.pronta()) {
    emitirEstrofeAoServidor(prox);
  }
}

function musicaEstadoCombinaComAtiva(estado) {
  if (!musicaAtiva || estado.tipo !== 'musica') return false;
  if (estado.musicaId != null && musicaAtiva.id != null) {
    return Number(estado.musicaId) === Number(musicaAtiva.id);
  }
  return estado.titulo === musicaAtiva.titulo;
}

function sincronizarEstrofeAtiva(estado) {
  if (!estado || estado.telaLimpa || estado.tipo === null) {
    estrofeAtiva = -1;
    slidesDockVisivel = ehModoSlidesOperador();
    projecaoMusicaEmitidaNoServidor = false;
    bloqueioSincronizarEstrofeDoServidor = false;
    renderSlidesStrip();
    renderPlaylist();
    marcacaoEstrofeEditor();
    return;
  }

  if (estado.tipo === 'musica' && musicaEstadoCombinaComAtiva(estado)) {
    if (bloqueioSincronizarEstrofeDoServidor) return;
    estrofeAtiva = estado.estrofeIndex;
    if (ehModoSlidesOperador()) slidesDockVisivel = true;
    projecaoMusicaEmitidaNoServidor = true;
    renderSlidesStrip();
    renderPlaylist();
    marcacaoEstrofeEditor();
  } else if (estado.tipo === 'musica' && todasMusicas.length && estado.musicaId != null) {
    const m = todasMusicas.find((x) => Number(x.id) === Number(estado.musicaId));
    if (m && musicaAtiva?.id === m.id) {
      if (bloqueioSincronizarEstrofeDoServidor) return;
      estrofeAtiva = estado.estrofeIndex;
      if (ehModoSlidesOperador()) slidesDockVisivel = true;
      projecaoMusicaEmitidaNoServidor = true;
      renderSlidesStrip();
      renderPlaylist();
      marcacaoEstrofeEditor();
    }
  }
}

function limparTela() {
  if (!projecao.ligada()) return;
  estrofeAtiva = -1;
  slidesDockVisivel = ehModoSlidesOperador();
  projecaoMusicaEmitidaNoServidor = false;
  bloqueioSincronizarEstrofeDoServidor = false;
  projecao.enfileirar('limpar_tela');
  renderSlidesStrip();
  atualizarPreviewOperador();
  if (musicaAtiva) renderPlaylist();
  marcacaoEstrofeEditor();
}

/** `limparMusica`: modo slides — ESC desassocia a música do painel (playlist sem linha ativa, faixa de slides oculta). */
function encerrarProjecaoDoControlador(opts = {}) {
  const limparMusica = !!opts.limparMusica;
  if (limparMusica) {
    musicaAtiva = null;
    musicaVersaoLocalId = null;
    musicaRootId = null;
    versoesMusicaServidorCache = { rootId: null, versoes: [] };
    renderMusicaVersoesBar();
    modoEdicaoEstrofes = false;
    snapshotEdicaoEstrofes = null;
    modoLetraCompletaCentral = false;
    aplicarLayoutModoLetraCompleta();
    faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
  }
  estrofeAtiva = -1;
  slidesDockVisivel = ehModoSlidesOperador();
  projecaoMusicaEmitidaNoServidor = false;
  bloqueioSincronizarEstrofeDoServidor = false;
  /* Sem isto, `estadoServidor` segue com música até o broadcast — no modo slides o cartão TV voltava pela ramo servidor ≠ painel alinhado. */
  estadoServidor = {
    tipo: null,
    titulo: '',
    linhas: [],
    estrofeIndex: 0,
    totalEstrofes: 0,
    telaLimpa: true,
    blackout: false,
    slidePretoFinal: false,
  };
  /** No controlador, ESC/encerrar limpa as saídas sem fechar as janelas de projeção (emit só se ligado). */
  projecao.enviar('limpar_tela');
  if (ehModoBibliaOperador()) {
    bibliaParteProjetadaChave = null;
    if (ultimoConteudoProjetadoModoUnificado?.tipo === 'biblia') {
      ultimoConteudoProjetadoModoUnificado = null;
    }
    bibliaVersiculoSelecionadoIdx = null;
    document.querySelectorAll('.biblia-v-card').forEach((c) => {
      c.classList.remove('projetado', 'selecionado');
    });
  }
  renderSlidesStrip();
  atualizarPreviewOperador();
  if (limparMusica) {
    renderPlaylist();
    renderEstrofesEditor();
    refreshListaBanco();
  } else if (musicaAtiva) {
    renderPlaylist();
  }
  marcacaoEstrofeEditor();
}

function toggleBlackoutTelas() {
  if (!projecao.ligada()) return;
  projecao.enfileirar('toggle_blackout');
}

function projetarPorDuploCliqueCentral(index) {
  if (!musicaAtiva || !projecao.pronta()) return;
  slidesRailUserRecolhido = false;
  slidesDockVisivel = true;
  /** Emitir antes de `exibirEstrofe`: senão `atualizarPreviewOperador` roda com `projecaoMusicaEmitidaNoServidor` ainda false e o painel espelha só o estado antigo do socket (telão físico atualiza, preview não). */
  emitirEstrofeAoServidor(index);
  exibirEstrofe(index);
}

/* ═══════════════════════════════════════════════
   MODO BÍBLIA — dados
   ═══════════════════════════════════════════════ */
/** Nove grupos canônicos (índice final inclusivo em `LIVROS`). */
const BIBLIA_GRUPOS = [
  { id: 'pent', label: 'Pentateuco', cor: '#3F2F13', textoClaro: true, fim: 4 },
  { id: 'hist', label: 'Históricos', cor: '#BE532D', textoClaro: true, fim: 16 },
  { id: 'poet', label: 'Poéticos', cor: '#B81450', textoClaro: true, fim: 21 },
  { id: 'pmay', label: 'Prof. maiores', cor: '#522182', textoClaro: true, fim: 26 },
  { id: 'pmen', label: 'Prof. menores', cor: '#AF1DA6', textoClaro: true, fim: 38 },
  { id: 'evan', label: 'Evangelhos + Atos', cor: '#0C60DF', textoClaro: true, fim: 43 },
  { id: 'paul', label: 'Epístolas de Paulo', cor: '#085E41', textoClaro: true, fim: 57 },
  { id: 'gera', label: 'Epístolas gerais', cor: '#096771', textoClaro: true, fim: 64 },
  { id: 'apoc', label: 'Apocalipse', cor: '#2A5408', textoClaro: true, fim: 65 },
];

function bibliaGrupoPorIndiceLivro(idx) {
  const i = Math.max(0, Math.min(idx, LIVROS.length - 1));
  return BIBLIA_GRUPOS.find((g) => i <= g.fim) || BIBLIA_GRUPOS[BIBLIA_GRUPOS.length - 1];
}

function bibliaGrupoPorLivro(livro) {
  const idx = LIVROS.findIndex((l) => l.nome === livro.nome);
  return bibliaGrupoPorIndiceLivro(idx >= 0 ? idx : 0);
}

function bibliaCorTextoGrupo(grupo) {
  return grupo.textoClaro ? '#ffffff' : '#1a1a1a';
}

function bibliaAplicarEstiloGrupoNoElemento(el, grupo) {
  if (!el || !grupo) return;
  el.style.backgroundColor = grupo.cor;
  el.style.color = bibliaCorTextoGrupo(grupo);
}

const LIVROS = [
  { nome: 'Gênesis', sigla: 'Gn', nt: false }, { nome: 'Êxodo', sigla: 'Ex', nt: false },
  { nome: 'Levítico', sigla: 'Lv', nt: false }, { nome: 'Números', sigla: 'Nm', nt: false },
  { nome: 'Deuteronômio', sigla: 'Dt', nt: false }, { nome: 'Josué', sigla: 'Js', nt: false },
  { nome: 'Juízes', sigla: 'Jz', nt: false }, { nome: 'Rute', sigla: 'Rt', nt: false },
  { nome: '1 Samuel', sigla: '1Sm', nt: false }, { nome: '2 Samuel', sigla: '2Sm', nt: false },
  { nome: '1 Reis', sigla: '1Rs', nt: false }, { nome: '2 Reis', sigla: '2Rs', nt: false },
  { nome: '1 Crônicas', sigla: '1Cr', nt: false }, { nome: '2 Crônicas', sigla: '2Cr', nt: false },
  { nome: 'Esdras', sigla: 'Ed', nt: false }, { nome: 'Neemias', sigla: 'Ne', nt: false },
  { nome: 'Ester', sigla: 'Et', nt: false }, { nome: 'Jó', sigla: 'Jó', nt: false },
  { nome: 'Salmos', sigla: 'Sl', nt: false }, { nome: 'Provérbios', sigla: 'Pv', nt: false },
  { nome: 'Eclesiastes', sigla: 'Ec', nt: false }, { nome: 'Cantares', dbNome: 'Cânticos', sigla: 'Ct', nt: false },
  { nome: 'Isaías', sigla: 'Is', nt: false }, { nome: 'Jeremias', sigla: 'Jr', nt: false },
  { nome: 'Lamentações', sigla: 'Lm', nt: false }, { nome: 'Ezequiel', sigla: 'Ez', nt: false },
  { nome: 'Daniel', sigla: 'Dn', nt: false }, { nome: 'Oséias', sigla: 'Os', nt: false },
  { nome: 'Joel', sigla: 'Jl', nt: false }, { nome: 'Amós', sigla: 'Am', nt: false },
  { nome: 'Obadias', sigla: 'Ob', nt: false }, { nome: 'Jonas', sigla: 'Jn', nt: false },
  { nome: 'Miquéias', sigla: 'Mq', nt: false }, { nome: 'Naum', sigla: 'Na', nt: false },
  { nome: 'Habacuque', sigla: 'Hc', nt: false }, { nome: 'Sofonias', sigla: 'Sf', nt: false },
  { nome: 'Ageu', sigla: 'Ag', nt: false }, { nome: 'Zacarias', sigla: 'Zc', nt: false },
  { nome: 'Malaquias', sigla: 'Ml', nt: false },
  { nome: 'Mateus', sigla: 'Mt', nt: true }, { nome: 'Marcos', sigla: 'Mc', nt: true },
  { nome: 'Lucas', sigla: 'Lc', nt: true }, { nome: 'João', sigla: 'Jo', nt: true },
  { nome: 'Atos', dbNome: 'Atos dos Apóstolos', sigla: 'At', nt: true }, { nome: 'Romanos', sigla: 'Rm', nt: true },
  { nome: '1 Coríntios', sigla: '1Co', nt: true }, { nome: '2 Coríntios', sigla: '2Co', nt: true },
  { nome: 'Gálatas', sigla: 'Gl', nt: true }, { nome: 'Efésios', sigla: 'Ef', nt: true },
  { nome: 'Filipenses', sigla: 'Fp', nt: true }, { nome: 'Colossenses', sigla: 'Cl', nt: true },
  { nome: '1 Tessalonicenses', sigla: '1Ts', nt: true }, { nome: '2 Tessalonicenses', sigla: '2Ts', nt: true },
  { nome: '1 Timóteo', sigla: '1Tm', nt: true }, { nome: '2 Timóteo', sigla: '2Tm', nt: true },
  { nome: 'Tito', sigla: 'Tt', nt: true }, { nome: 'Filemom', sigla: 'Fm', nt: true },
  { nome: 'Hebreus', sigla: 'Hb', nt: true }, { nome: 'Tiago', sigla: 'Tg', nt: true },
  { nome: '1 Pedro', sigla: '1Pe', nt: true }, { nome: '2 Pedro', sigla: '2Pe', nt: true },
  { nome: '1 João', sigla: '1Jo', nt: true }, { nome: '2 João', sigla: '2Jo', nt: true },
  { nome: '3 João', sigla: '3Jo', nt: true }, { nome: 'Judas', sigla: 'Jd', nt: true },
  { nome: 'Apocalipse', sigla: 'Ap', nt: true },
];

/** Navega na UI do modo Bíblia e projeta o versículo (voz / referência). */
async function bibliaNavegarEProjetarPorReferencia(livroNome, capitulo, versiculo) {
  const livro = LIVROS.find((l) => l.nome === livroNome);
  if (!livro || !ehModoBibliaOperador()) return false;
  const traducao = document.getElementById('traducao-sel')?.value;
  if (!traducao) return false;
  const livroDbRef = bibliaLivroNomeDb(livro);
  try {
    const resCap = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livroDbRef)}/caps`
    );
    if (!resCap.ok) return false;
    const { total: totalCaps } = await resCap.json();
    if (capitulo < 1 || capitulo > totalCaps) return false;

    /* Este fetch só confirma que a referência existe. O que se projeta vem sempre de
       `bibliaVersiculosCapitulo` — que já está dividido em partes; projetar o resultado
       deste fetch mandaria o versículo inteiro enquanto o seletor mostra as partes. */
    const resVer = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livroDbRef)}/${capitulo}`
    );
    if (!resVer.ok) return false;
    const versiculos = await resVer.json();
    if (!versiculos.some((item) => item.versiculo === versiculo)) return false;

    await bibliaEscolherLivro(livro);
    const capBtn = document.querySelector(`.biblia-cap-btn[data-cap="${capitulo}"]`);
    if (!capBtn) return false;
    await bibliaEscolherCap(capitulo, capBtn);
    /* Voz e referência levam sempre à primeira parte do versículo. */
    const idx = indicePrimeiraParteDoVersiculo(bibliaVersiculosCapitulo, versiculo);
    const v = idx >= 0 ? bibliaVersiculosCapitulo[idx] : null;
    if (!v) return false;
    const card = bibliaMarcarVersiculoNaUi(v, idx);
    if (card) card.scrollIntoView({ block: 'center' });
    await bibliaProjetarVersiculo(v, card);
    return true;
  } catch (_) {
    return false;
  }
}

const reconhecimentoVozBiblia = criarReconhecimentoVozBiblia({
  ehModoBiblia: ehModoBibliaOperador,
  livros: LIVROS,
  navegarEProjetarVersiculo: (ref) =>
    bibliaNavegarEProjetarPorReferencia(ref.livro, ref.capitulo, ref.versiculo),
});

let bibliaSelecionadoLivro = null;
let bibliaSelecionadoLivroDb = null;
let bibliaSelecionadoCap = null;
let bibliaTraducaoAtual = null;
/**
 * `chave` da parte que está no ar (ver `modules/dividirVersiculos.js`), ou `null`.
 *
 * Guarda a chave da **parte**, não o número do versículo: com a divisão ligada, duas
 * partes do mesmo versículo têm o mesmo número, e comparar números faria o controlador
 * julgar que nada mudou ao passar da parte 1 para a parte 2 — reenviando a configuração
 * de exibição inteira (com `bgImage` em base64) a cada parte.
 */
let bibliaParteProjetadaChave = null;
let bibliaVersiculoSelecionadoIdx = null;
let bnpEtapa = 'livro';
let bnpLivroSelecionado = null;
let bnpCapSelecionado = null;
let bnpDigitando = '';
let bnpFocoIndex = -1;
let bnpTotalCaps = 0;
let bnpTotalVers = 0;
/** Evita PUT /api/display-routing (reabria janelas) em cada versículo projetado. */
let bibliaRotaSyncServidorChave = null;
/**
 * **Partes** do capítulo actual (memória — navegação por setas sem novo fetch).
 *
 * Fonte única do seletor E da projeção. Já vem dividido por
 * `bibliaRederivarPartesCapitulo()`; com a opção de divisão desligada há exactamente uma
 * parte por versículo. Nem o render nem `bibliaProjetarVersiculo` dividem seja o que for.
 */
let bibliaVersiculosCapitulo = [];
/** Versículos inteiros do capítulo actual, como vieram da API — origem da re-derivação. */
let bibliaVersiculosBrutosCapitulo = [];
/** Cache de capítulos adjacentes pré-carregados: `${trad}|${livro}|${cap}` → versículos[]. */
const bibliaCapituloCache = new Map();
let bibliaPrefetchCapJob = 0;
let bibliaCapsRequestSeq = 0;
let bibliaVersiculosRequestSeq = 0;

function bibliaNormalizarCampoReferencia(valor) {
  if (valor == null) return '';
  const texto = String(valor).trim();
  if (!texto) return '';
  const lower = texto.toLowerCase();
  return lower === 'null' || lower === 'undefined' ? '' : texto;
}

function bibliaLivroNomeDb(livro) {
  if (livro && typeof livro === 'object' && !Array.isArray(livro)) {
    return String(livro.dbNome || livro.nome || '').trim();
  }
  const nome = String(livro || '').trim();
  if (!nome) return '';
  const meta = LIVROS.find((item) => item.nome === nome);
  return String(meta?.dbNome || meta?.nome || nome).trim();
}

function bibliaAnexarReferenciaVersiculos(versiculos, livro, capitulo) {
  if (!Array.isArray(versiculos)) return [];
  const livroRef = bibliaNormalizarCampoReferencia(livro);
  const capRef = bibliaNormalizarCampoReferencia(capitulo);
  return versiculos.map((item) => ({
    ...(item && typeof item === 'object' ? item : {}),
    livro: livroRef || bibliaNormalizarCampoReferencia(item?.livro),
    capitulo: bibliaNormalizarCampoReferencia(item?.capitulo) || capRef,
    versiculo: bibliaNormalizarCampoReferencia(item?.versiculo),
    texto: item?.texto != null ? String(item.texto) : '',
  }));
}

const BIBLIA_CFG_EXIBICAO_PADRAO = {
  fontSize: 5.5,
  fontFamily: 'CMG Sans, sans-serif',
  lineSpacing: 1.4,
  wrapLongLines: true,
  bgType: 'solid',
  bgColor: '#000000',
  bgGradientFrom: '#000000',
  bgGradientTo: '#161616',
  bgGradient: 'linear-gradient(135deg, #000000 0%, #161616 100%)',
  bgImage: '',
  textColor: '#ffffff',
  negrito: true,
  maiusculo: false,
  textAlign: 'center',
  posX: 'center',
  posY: 'center',
  refMostrar: true,
  refFontSize: 1.8,
  refColor: '#fbf904',
};

let bibliaCfgExibicao = { ...BIBLIA_CFG_EXIBICAO_PADRAO };

const BIBLIA_CFG_MINISTRANTE_PADRAO = {
  fontSize: 4.1,
  fontFamily: 'CMG Sans, sans-serif',
  lineSpacing: 1.35,
  wrapLongLines: true,
  negrito: true,
  maiusculo: false,
  autoFitLongLines: false,
  bgType: 'solid',
  bgColor: '#000000',
  bgGradientFrom: '#000000',
  bgGradientTo: '#161616',
  bgGradient: 'linear-gradient(135deg, #000000 0%, #161616 100%)',
  bgImage: '',
  textColorAtual: '#ffffff',
  textColorProximo: '#f3c15a',
  posX: 'center',
  posY: 'center',
  refMostrar: true,
  refFontSize: 1.7,
  refColor: '#fbf904',
};

let bibliaCfgMinistrante = { ...BIBLIA_CFG_MINISTRANTE_PADRAO };

/**
 * Leitura — opções que não são de um canal, mas do modo Bíblia inteiro.
 *
 * A divisão de versículos longos afeta o telão, o ministrante e o seletor do operador ao
 * mesmo tempo; por isso não cabe em `exibicao` nem em `ministrante`. Nasce desligada: JSON
 * antigo sem `leitura` cai nos padrões e nenhuma instalação muda de comportamento.
 */
const BIBLIA_CFG_LEITURA_PADRAO = {
  dividirVersiculosLongos: false,
  limiteCaracteres: LIMITE_DIVISAO_PADRAO,
};

let bibliaCfgLeitura = { ...BIBLIA_CFG_LEITURA_PADRAO };

function bibliaMesclarCfgSalva(salva) {
  if (!salva || typeof salva !== 'object') return;
  if (salva.exibicao && typeof salva.exibicao === 'object') {
    bibliaCfgExibicao = { ...BIBLIA_CFG_EXIBICAO_PADRAO, ...salva.exibicao };
  }
  if (salva.ministrante && typeof salva.ministrante === 'object') {
    bibliaCfgMinistrante = { ...BIBLIA_CFG_MINISTRANTE_PADRAO, ...salva.ministrante };
  }
  if (salva.leitura && typeof salva.leitura === 'object') {
    bibliaCfgLeitura = { ...BIBLIA_CFG_LEITURA_PADRAO, ...salva.leitura };
  }
  bibliaCfgLeitura.dividirVersiculosLongos = bibliaCfgLeitura.dividirVersiculosLongos === true;
  bibliaCfgLeitura.limiteCaracteres = normalizarLimiteDivisao(bibliaCfgLeitura.limiteCaracteres);
}

function carregarBibliaCfgDoStorage() {
  try {
    const raw = localStorage.getItem(LS_BIBLIA_CFG);
    if (!raw) return;
    bibliaMesclarCfgSalva(JSON.parse(raw));
    bibliaMesclarGradienteSalvo(bibliaCfgExibicao, BIBLIA_CFG_EXIBICAO_PADRAO);
    bibliaMesclarGradienteSalvo(bibliaCfgMinistrante, BIBLIA_CFG_MINISTRANTE_PADRAO);
  } catch (_) {
  // intencional — erro ignorado
}
}

function salvarBibliaCfgNoStorage() {
  try {
    localStorage.setItem(
      LS_BIBLIA_CFG,
      JSON.stringify({
        exibicao: bibliaCfgExibicao,
        ministrante: bibliaCfgMinistrante,
        leitura: bibliaCfgLeitura,
      })
    );
  } catch (_) {
  // intencional — erro ignorado
}
}

function bibliaGradienteCss(camada) {
  const a = camada.bgGradientFrom || '#000000';
  const b = camada.bgGradientTo || '#161616';
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

function bibliaMesclarGradienteSalvo(camada, padrao) {
  if (camada.bgGradientFrom && camada.bgGradientTo) return;
  const m = String(camada.bgGradient || '').match(/#[0-9a-fA-F]{3,8}/g);
  if (m && m.length >= 2) {
    camada.bgGradientFrom = m[0];
    camada.bgGradientTo = m[1];
  } else {
    camada.bgGradientFrom = padrao.bgGradientFrom;
    camada.bgGradientTo = padrao.bgGradientTo;
  }
}

function bibliaSanitizarCamada(camada) {
  const out = { ...camada };
  if (out.bgType !== 'image') out.bgImage = '';
  if (out.bgType === 'gradient') out.bgGradient = bibliaGradienteCss(out);
  return out;
}

/** Fundo no payload: só envia bgImage quando há data URL — evita apagar imagem no servidor. */
function bibliaFundoParaPayload(camada) {
  const c = bibliaSanitizarCamada(camada);
  const fundo = {
    bgType: c.bgType || 'solid',
    bgColor: c.bgColor,
    bgGradient: c.bgGradient,
  };
  if (c.bgType === 'image') {
    if (c.bgImage && String(c.bgImage).length > 0) fundo.bgImage = c.bgImage;
  } else {
    fundo.bgImage = '';
  }
  return fundo;
}

function bibliaAtualizarVisibilidadeFundo(alvo) {
  const prefix = alvo === 'ministrante' ? 'cfg-biblia-min' : 'cfg-biblia-pub';
  const cfg = alvo === 'ministrante' ? bibliaCfgMinistrante : bibliaCfgExibicao;
  const val = cfg.bgType || 'solid';
  const solid = document.getElementById(`${prefix}-bg-solid-ctrl`);
  const grad = document.getElementById(`${prefix}-bg-gradient-wrap-ctrl`);
  const img = document.getElementById(`${prefix}-bg-image-wrap-ctrl`);
  if (solid) solid.style.display = val === 'solid' ? '' : 'none';
  if (grad) grad.style.display = val === 'gradient' ? '' : 'none';
  if (img) img.style.display = val === 'image' ? '' : 'none';
}

function setBibliaPosCtrlBtn(alvo, axis, val) {
  const prefix = alvo === 'ministrante' ? 'cfg-biblia-min' : 'cfg-biblia-pub';
  const groupId = axis === 'posX' ? `${prefix}-posx-ctrl-group` : `${prefix}-posy-ctrl-group`;
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.cfg-btn-pos').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.val === val);
  });
}

function setBibliaPosCtrl(alvo, axis, val) {
  const cfg = alvo === 'ministrante' ? bibliaCfgMinistrante : bibliaCfgExibicao;
  cfg[axis] = val;
  setBibliaPosCtrlBtn(alvo, axis, val);
  bibliaAplicarCfgExibicao();
}

function onBibliaPublicoBgTypeCtrlChange() {
  const val = document.getElementById('cfg-biblia-pub-bg-type-ctrl')?.value || 'solid';
  bibliaCfgExibicao.bgType = val;
  if (val !== 'image') bibliaCfgExibicao.bgImage = '';
  bibliaAtualizarVisibilidadeFundo('publico');
  bibliaAplicarCfgExibicao();
}

function onBibliaMinistranteBgTypeCtrlChange() {
  const val = document.getElementById('cfg-biblia-min-bg-type-ctrl')?.value || 'solid';
  bibliaCfgMinistrante.bgType = val;
  if (val !== 'image') bibliaCfgMinistrante.bgImage = '';
  bibliaAtualizarVisibilidadeFundo('ministrante');
  bibliaAplicarCfgExibicao();
}

function lerBibliaCfgDoFormularioPublico() {
  const pub = bibliaCfgExibicao;
  pub.bgType = document.getElementById('cfg-biblia-pub-bg-type-ctrl')?.value || pub.bgType || 'solid';
  pub.bgColor = document.getElementById('cfg-biblia-pub-bg-color-ctrl')?.value || pub.bgColor;
  pub.bgGradientFrom =
    document.getElementById('cfg-biblia-pub-bg-gradient-from-ctrl')?.value || pub.bgGradientFrom;
  pub.bgGradientTo =
    document.getElementById('cfg-biblia-pub-bg-gradient-to-ctrl')?.value || pub.bgGradientTo;
  pub.fontFamily = document.getElementById('cfg-biblia-pub-fontfamily-ctrl')?.value || pub.fontFamily;
  pub.fontSize = parseFloat(document.getElementById('cfg-biblia-pub-fontsize-ctrl')?.value) || pub.fontSize;
  pub.textColor = document.getElementById('cfg-biblia-pub-text-color-ctrl')?.value || pub.textColor;
  pub.maiusculo = !!document.getElementById('cfg-biblia-pub-maiusculo-ctrl')?.checked;
  pub.negrito = !!document.getElementById('cfg-biblia-pub-negrito-ctrl')?.checked;
  pub.wrapLongLines = !!document.getElementById('cfg-biblia-pub-wrap-ctrl')?.checked;
  pub.refMostrar = !!document.getElementById('cfg-biblia-pub-ref-mostrar-ctrl')?.checked;
  pub.refFontSize =
    parseFloat(document.getElementById('cfg-biblia-pub-ref-size-ctrl')?.value) ||
    BIBLIA_CFG_EXIBICAO_PADRAO.refFontSize;
  pub.refColor =
    document.getElementById('cfg-biblia-pub-ref-color-ctrl')?.value || BIBLIA_CFG_EXIBICAO_PADRAO.refColor;
  if (pub.bgType === 'gradient') pub.bgGradient = bibliaGradienteCss(pub);
}

function lerBibliaCfgDoFormularioMinistrante() {
  const mon = bibliaCfgMinistrante;
  mon.bgType = document.getElementById('cfg-biblia-min-bg-type-ctrl')?.value || mon.bgType || 'solid';
  mon.bgColor = document.getElementById('cfg-biblia-min-bg-color-ctrl')?.value || mon.bgColor;
  mon.bgGradientFrom =
    document.getElementById('cfg-biblia-min-bg-gradient-from-ctrl')?.value || mon.bgGradientFrom;
  mon.bgGradientTo =
    document.getElementById('cfg-biblia-min-bg-gradient-to-ctrl')?.value || mon.bgGradientTo;
  mon.fontFamily = document.getElementById('cfg-biblia-min-fontfamily-ctrl')?.value || mon.fontFamily;
  mon.fontSize = parseFloat(document.getElementById('cfg-biblia-min-fontsize-ctrl')?.value) || mon.fontSize;
  mon.textColorAtual =
    document.getElementById('cfg-biblia-min-text-color-ctrl')?.value || mon.textColorAtual;
  mon.maiusculo = !!document.getElementById('cfg-biblia-min-maiusculo-ctrl')?.checked;
  mon.negrito = !!document.getElementById('cfg-biblia-min-negrito-ctrl')?.checked;
  mon.wrapLongLines = !!document.getElementById('cfg-biblia-min-wrap-ctrl')?.checked;
  mon.refMostrar = !!document.getElementById('cfg-biblia-min-ref-mostrar-ctrl')?.checked;
  mon.refFontSize =
    parseFloat(document.getElementById('cfg-biblia-min-ref-size-ctrl')?.value) ||
    BIBLIA_CFG_MINISTRANTE_PADRAO.refFontSize;
  mon.refColor =
    document.getElementById('cfg-biblia-min-ref-color-ctrl')?.value || BIBLIA_CFG_MINISTRANTE_PADRAO.refColor;
  if (mon.bgType === 'gradient') mon.bgGradient = bibliaGradienteCss(mon);
}

function onBibliaPublicoCfgChange() {
  lerBibliaCfgDoFormularioPublico();
  setSpanText('cfg-biblia-pub-fontsize-val-ctrl', String(bibliaCfgExibicao.fontSize));
  setSpanText('cfg-biblia-pub-ref-size-val-ctrl', String(bibliaCfgExibicao.refFontSize));
  bibliaAplicarCfgExibicao();
}

function onBibliaMinistranteCfgChange() {
  lerBibliaCfgDoFormularioMinistrante();
  setSpanText('cfg-biblia-min-fontsize-val-ctrl', String(bibliaCfgMinistrante.fontSize));
  setSpanText('cfg-biblia-min-ref-size-val-ctrl', String(bibliaCfgMinistrante.refFontSize));
  bibliaAplicarCfgExibicao();
}

/**
 * Divisão de versículos longos — a única opção do modo Bíblia que não é de um canal.
 *
 * Re-deriva as partes e redesenha o seletor, mas **não reprojeta**: mexer nas
 * configurações durante o culto não deve trocar o que está no telão. O realce
 * `.projetado` some (os índices mudaram) e volta na próxima projeção.
 */
function onBibliaDivisaoCfgChange() {
  bibliaCfgLeitura.dividirVersiculosLongos =
    !!document.getElementById('cfg-biblia-divisao-ativa-ctrl')?.checked;
  bibliaCfgLeitura.limiteCaracteres = normalizarLimiteDivisao(
    document.getElementById('cfg-biblia-divisao-limite-ctrl')?.value
  );
  salvarBibliaCfgNoStorage();
  bibliaPopularFormularioCfgLeitura();
  bibliaRederivarPartesCapitulo();
  bibliaVersiculoSelecionadoIdx = null;
  bibliaRenderizarSeletorVersiculos();
}

function bibliaPopularFormularioCfgLeitura() {
  const ativo = bibliaCfgLeitura.dividirVersiculosLongos === true;
  setChkVal('cfg-biblia-divisao-ativa-ctrl', ativo);
  setSelVal(
    'cfg-biblia-divisao-limite-ctrl',
    String(normalizarLimiteDivisao(bibliaCfgLeitura.limiteCaracteres))
  );
  const sel = document.getElementById('cfg-biblia-divisao-limite-ctrl');
  if (sel) sel.disabled = !ativo;
}

function bibliaPopularFormularioCfg() {
  const pub = bibliaCfgExibicao;
  const mon = bibliaCfgMinistrante;
  bibliaPopularFormularioCfgLeitura();
  bibliaMesclarGradienteSalvo(pub, BIBLIA_CFG_EXIBICAO_PADRAO);
  bibliaMesclarGradienteSalvo(mon, BIBLIA_CFG_MINISTRANTE_PADRAO);

  setSelVal('cfg-biblia-pub-bg-type-ctrl', pub.bgType || 'solid');
  setInputVal('cfg-biblia-pub-bg-color-ctrl', pub.bgColor || '#000000');
  setInputVal('cfg-biblia-pub-bg-gradient-from-ctrl', pub.bgGradientFrom || '#000000');
  setInputVal('cfg-biblia-pub-bg-gradient-to-ctrl', pub.bgGradientTo || '#161616');
  setSelVal('cfg-biblia-pub-fontfamily-ctrl', pub.fontFamily || BIBLIA_CFG_EXIBICAO_PADRAO.fontFamily);
  setInputVal('cfg-biblia-pub-fontsize-ctrl', pub.fontSize ?? BIBLIA_CFG_EXIBICAO_PADRAO.fontSize);
  setSpanText('cfg-biblia-pub-fontsize-val-ctrl', String(pub.fontSize ?? BIBLIA_CFG_EXIBICAO_PADRAO.fontSize));
  setInputVal('cfg-biblia-pub-text-color-ctrl', pub.textColor || '#ffffff');
  setChkVal('cfg-biblia-pub-maiusculo-ctrl', pub.maiusculo === true);
  setChkVal('cfg-biblia-pub-negrito-ctrl', pub.negrito !== false);
  setChkVal('cfg-biblia-pub-wrap-ctrl', pub.wrapLongLines !== false);
  setChkVal('cfg-biblia-pub-ref-mostrar-ctrl', pub.refMostrar !== false);
  setInputVal('cfg-biblia-pub-ref-size-ctrl', pub.refFontSize ?? BIBLIA_CFG_EXIBICAO_PADRAO.refFontSize);
  setSpanText('cfg-biblia-pub-ref-size-val-ctrl', String(pub.refFontSize ?? BIBLIA_CFG_EXIBICAO_PADRAO.refFontSize));
  setInputVal('cfg-biblia-pub-ref-color-ctrl', pub.refColor || BIBLIA_CFG_EXIBICAO_PADRAO.refColor);
  setBibliaPosCtrlBtn('publico', 'posX', pub.posX || 'center');
  setBibliaPosCtrlBtn('publico', 'posY', pub.posY || 'center');
  bibliaAtualizarVisibilidadeFundo('publico');
  const prevPub = document.getElementById('cfg-biblia-pub-bg-preview-ctrl');
  if (prevPub) {
    prevPub.style.backgroundImage =
      pub.bgType === 'image' && pub.bgImage ? `url(${pub.bgImage})` : '';
  }

  setSelVal('cfg-biblia-min-bg-type-ctrl', mon.bgType || 'solid');
  setInputVal('cfg-biblia-min-bg-color-ctrl', mon.bgColor || '#000000');
  setInputVal('cfg-biblia-min-bg-gradient-from-ctrl', mon.bgGradientFrom || '#000000');
  setInputVal('cfg-biblia-min-bg-gradient-to-ctrl', mon.bgGradientTo || '#161616');
  setSelVal('cfg-biblia-min-fontfamily-ctrl', mon.fontFamily || BIBLIA_CFG_MINISTRANTE_PADRAO.fontFamily);
  setInputVal('cfg-biblia-min-fontsize-ctrl', mon.fontSize ?? BIBLIA_CFG_MINISTRANTE_PADRAO.fontSize);
  setSpanText('cfg-biblia-min-fontsize-val-ctrl', String(mon.fontSize ?? BIBLIA_CFG_MINISTRANTE_PADRAO.fontSize));
  setInputVal('cfg-biblia-min-text-color-ctrl', mon.textColorAtual || '#ffffff');
  setChkVal('cfg-biblia-min-maiusculo-ctrl', mon.maiusculo === true);
  setChkVal('cfg-biblia-min-negrito-ctrl', mon.negrito !== false);
  setChkVal('cfg-biblia-min-wrap-ctrl', mon.wrapLongLines !== false);
  setChkVal('cfg-biblia-min-ref-mostrar-ctrl', mon.refMostrar !== false);
  setInputVal('cfg-biblia-min-ref-size-ctrl', mon.refFontSize ?? BIBLIA_CFG_MINISTRANTE_PADRAO.refFontSize);
  setSpanText('cfg-biblia-min-ref-size-val-ctrl', String(mon.refFontSize ?? BIBLIA_CFG_MINISTRANTE_PADRAO.refFontSize));
  setInputVal('cfg-biblia-min-ref-color-ctrl', mon.refColor || BIBLIA_CFG_MINISTRANTE_PADRAO.refColor);
  setBibliaPosCtrlBtn('ministrante', 'posX', mon.posX || 'center');
  setBibliaPosCtrlBtn('ministrante', 'posY', mon.posY || 'center');
  bibliaAtualizarVisibilidadeFundo('ministrante');
  const prevMin = document.getElementById('cfg-biblia-min-bg-preview-ctrl');
  if (prevMin) {
    prevMin.style.backgroundImage =
      mon.bgType === 'image' && mon.bgImage ? `url(${mon.bgImage})` : '';
  }
}

function setPosAvisoCard6CtrlBtn(val) {
  const group = document.getElementById('cfg-card6-posy-ctrl-group');
  if (!group) return;
  group.querySelectorAll('.cfg-btn-pos').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.val === val);
  });
}

function popularFormCfgAvisoCard6() {
  const cfg = normalizarCfgAvisoCard6(apresentacaoCard6AvisoCfg);
  setInputVal('cfg-card6-fontsize-ctrl', cfg.fontSize);
  setSpanText('cfg-card6-fontsize-val-ctrl', String(cfg.fontSize));
  setInputVal('cfg-card6-text-color-ctrl', cfg.textColor);
  setInputVal('cfg-card6-bg-color-ctrl', cfg.backgroundColor);
  setChkVal('cfg-card6-bg-transparent-ctrl', cfg.transparentBackground);
  setChkVal('cfg-card6-wrap-ctrl', cfg.wrapLongLines);
  setChkVal('cfg-card6-italic-ctrl', cfg.italic);
  setPosAvisoCard6CtrlBtn(cfg.verticalPosition);
  const bgColor = document.getElementById('cfg-card6-bg-color-ctrl');
  if (bgColor) {
    bgColor.disabled = cfg.transparentBackground;
    bgColor.title = cfg.transparentBackground ? 'Desative o fundo transparente para escolher uma cor.' : '';
  }
}

function persistirCfgAvisoCard6(opts = {}) {
  salvarEstadoModoApresentacaoNoStorage();
  if (ehModoApresentacaoOperador()) renderGridApresentacao();
  if (opts.atualizarAoVivo !== false) agendarAtualizacaoAvisoCard6AoVivo();
}

function lerCfgAvisoCard6DoFormulario() {
  return normalizarCfgAvisoCard6({
    fontSize: lerNumeroInput('cfg-card6-fontsize-ctrl', apresentacaoCard6AvisoCfg?.fontSize ?? 5.5),
    textColor: document.getElementById('cfg-card6-text-color-ctrl')?.value,
    backgroundColor: document.getElementById('cfg-card6-bg-color-ctrl')?.value,
    transparentBackground: !!document.getElementById('cfg-card6-bg-transparent-ctrl')?.checked,
    wrapLongLines: !!document.getElementById('cfg-card6-wrap-ctrl')?.checked,
    italic: !!document.getElementById('cfg-card6-italic-ctrl')?.checked,
    verticalPosition: (document.querySelector('#cfg-card6-posy-ctrl-group .cfg-btn-pos.ativo')?.dataset.val || 'center'),
  });
}

function onAvisoCard6CfgChange() {
  apresentacaoCard6AvisoCfg = lerCfgAvisoCard6DoFormulario();
  popularFormCfgAvisoCard6();
  persistirCfgAvisoCard6();
}

function setPosAvisoCard6Ctrl(val) {
  apresentacaoCard6AvisoCfg = normalizarCfgAvisoCard6({
    ...apresentacaoCard6AvisoCfg,
    verticalPosition: val,
  });
  popularFormCfgAvisoCard6();
  persistirCfgAvisoCard6();
}

const CFG_ABAS_CTRL = [
  'conexao',
  'telao',
  'ministrante',
  'biblia-telao',
  'biblia-ministrante',
  'biblia-leitura',
  'relogio',
  'avisos',
];

function atualizarVisibilidadeAbasCfgPorModo() {
  const emBiblia = ehModoBibliaOperador();
  document.querySelectorAll('.cfg-tab-slide').forEach((el) => {
    el.style.display = emBiblia ? 'none' : '';
  });
  document.querySelectorAll('.cfg-tab-biblia').forEach((el) => {
    el.style.display = emBiblia ? '' : 'none';
  });
}

function salvarSlideCfgNoStorage() {
  try {
    const cfg =
      typeof window.getCurrentCfgCtrl === 'function' ? window.getCurrentCfgCtrl() : currentCfgCtrl;
    if (cfg && typeof cfg === 'object') {
      localStorage.setItem(LS_SLIDE_CFG, JSON.stringify(cfg));
    }
  } catch (_) {
  // intencional — erro ignorado
}
}

function carregarSlideCfgDoStorage() {
  try {
    const raw = localStorage.getItem(LS_SLIDE_CFG);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

/** Mescla config Slides salva em `lyra_slide_cfg_v1` sobre o estado em memória (M2 público + M3 ministrante). */
function mesclarSlideCfgNoEstado(salva) {
  if (!salva || typeof salva !== 'object') return;
  const s = sanitizarCfgSlidesLocal(salva);
  const base = currentCfgCtrl && typeof currentCfgCtrl === 'object' ? currentCfgCtrl : {};
  for (const k of ['posX', 'posY', 'fontSize', 'lineSpacing', 'autoFitLongLines']) {
    if (s[k] !== undefined) base[k] = s[k];
  }
  if (s.publico && typeof s.publico === 'object') {
    base.publico = { ...(base.publico || {}), ...s.publico };
  }
  if (s.ministrante && typeof s.ministrante === 'object') {
    base.ministrante = { ...(base.ministrante || {}), ...s.ministrante };
  }
  if (s.clock && typeof s.clock === 'object') {
    base.clock = { ...(base.clock || {}), ...s.clock };
  }
  currentCfgCtrl = base;
  if (typeof window.setCurrentCfgCtrl === 'function') window.setCurrentCfgCtrl(currentCfgCtrl);
}

/** Ao abrir o app: repõe `currentCfgCtrl` a partir do localStorage (antes de conectar ao servidor). */
function carregarSlideCfgInicialDoStorage() {
  const salva = carregarSlideCfgDoStorage();
  if (!salva) return;
  mesclarSlideCfgNoEstado(salva);
  try {
    cfgSnapshotSalvoCtrl = JSON.stringify(currentCfgCtrl || {});
    cfgDirtyCtrl = false;
  } catch (_) {
  // intencional — erro ignorado
}
}

function sanitizarCfgSlidesLocal(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg;
  let c;
  try {
    c = JSON.parse(JSON.stringify(cfg));
  } catch (_) {
    return cfg;
  }
  for (const chave of ['publico', 'ministrante']) {
    const layer = c[chave];
    if (!layer || typeof layer !== 'object') continue;
    if (layer.bgType !== 'image') {
      layer.bgImage = '';
      if (!layer.bgType) layer.bgType = 'solid';
    }
    delete layer.refMostrar;
    delete layer.refFontSize;
    delete layer.refColor;
  }
  return c;
}

function enviarPreviewDisplayConfig(cfg, opts = {}) {
  // Pull-by-role: um controlador somente-leitura NUNCA empurra config (nem no boot, nem ao
  // mexer no painel). O servidor já rejeitaria via guarda; aqui evitamos até o ruído do envio.
  if (controladorSomenteLeitura()) return;
  const modo = opts.modoConfig || 'slides';
  let corpo = cfg && typeof cfg === 'object' ? cfg : {};
  if (modo === 'biblia') {
    corpo = bibliaPayloadCfgExibicao();
  } else {
    corpo = sanitizarCfgSlidesLocal(corpo);
  }
  const payload = {
    ...corpo,
    modoConfig: modo,
    forcarModo: opts.forcarModo || modo,
  };
  if (projecao.enviar('preview_display_config', payload)) return;
  const ip = hostProjecao();
  if (!ip) return;
  fetch(`http://${ip}:5510/api/display-config/preview`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function slidesAplicarCfgArmazenada() {
  let cfg = carregarSlideCfgDoStorage();
  if (!cfg) {
    try {
      if (cfgSnapshotSalvoCtrl) cfg = JSON.parse(cfgSnapshotSalvoCtrl);
    } catch (_) {
  // intencional — erro ignorado
}
  }
  if (!cfg || typeof cfg !== 'object') {
    cfg = sanitizarCfgSlidesLocal(
      typeof window.getCurrentCfgCtrl === 'function' ? window.getCurrentCfgCtrl() : currentCfgCtrl
    );
  } else {
    mesclarSlideCfgNoEstado(cfg);
    cfg = sanitizarCfgSlidesLocal(
      typeof window.getCurrentCfgCtrl === 'function' ? window.getCurrentCfgCtrl() : currentCfgCtrl
    );
  }
  if (typeof window.setCurrentCfgCtrl === 'function') window.setCurrentCfgCtrl(cfg);
  try {
    popularFormCfg(cfg);
  } catch (_) {
  // intencional — erro ignorado
}
  enviarPreviewDisplayConfig(cfg, {
    modoConfig: 'slides',
    forcarModo: 'slides',
  });
}

function bibliaCacheChaveCapitulo(traducao, livro, cap) {
  return `${traducao}|${livro}|${cap}`;
}

/**
 * **O ponto único de aplicação da divisão** (ver
 * `docs/architecture/divisao-automatica-versiculos.md`, §6).
 *
 * Deriva `bibliaVersiculosCapitulo` (partes) a partir de `bibliaVersiculosBrutosCapitulo`
 * (versículos inteiros). É a única função do painel que lê `bibliaCfgLeitura` — todos os
 * consumidores a jusante (seletor, setas, projeção, prefetch) veem sempre a mesma
 * estrutura, com a divisão ligada ou desligada.
 */
function bibliaRederivarPartesCapitulo() {
  bibliaVersiculosCapitulo = dividirVersiculos(bibliaVersiculosBrutosCapitulo, {
    ativo: bibliaCfgLeitura.dividirVersiculosLongos === true,
    limite: bibliaCfgLeitura.limiteCaracteres,
  });
}

function bibliaGuardarVersiculosCapitulo(versiculos, traducao, livro, cap) {
  bibliaVersiculosBrutosCapitulo = bibliaAnexarReferenciaVersiculos(versiculos, livro, cap);
  if (traducao && livro && cap) {
    /* O cache guarda o BRUTO, não as partes: assim mudar o limite nas configurações é só
       re-derivar, sem invalidar os capítulos vizinhos já pré-carregados. */
    bibliaCapituloCache.set(
      bibliaCacheChaveCapitulo(traducao, livro, cap),
      bibliaVersiculosBrutosCapitulo
    );
  }
  bibliaRederivarPartesCapitulo();
  bibliaPrefetchCapitulosVizinhos();
}

function bibliaPrefetchCapitulosVizinhos() {
  const traducao = bibliaTraducaoAtual || document.getElementById('traducao-sel')?.value;
  const livro = bibliaSelecionadoLivro;
  const livroDb = bibliaSelecionadoLivroDb || livro;
  const cap = bibliaSelecionadoCap;
  if (!traducao || !livro || !livroDb || !cap || !bibliaVersiculosCapitulo.length) return;
  const idx = bibliaVersiculoSelecionadoIdx ?? 0;
  const caps = [];
  if (idx >= bibliaVersiculosCapitulo.length - 2 && cap > 1) caps.push(cap - 1);
  if (idx <= 1) caps.push(cap + 1);
  if (!caps.length) return;
  const job = ++bibliaPrefetchCapJob;
  caps.forEach((capNum) => {
    const chave = bibliaCacheChaveCapitulo(traducao, livro, capNum);
    if (bibliaCapituloCache.has(chave)) return;
    fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livroDb)}/${capNum}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (job !== bibliaPrefetchCapJob || !Array.isArray(data)) return;
        bibliaCapituloCache.set(chave, bibliaAnexarReferenciaVersiculos(data, livro, capNum));
      })
      .catch(() => {});
  });
}

function bibliaLimparEstadoOperador() {
  bibliaParteProjetadaChave = null;
  if (ultimoConteudoProjetadoModoUnificado?.tipo === 'biblia') {
    ultimoConteudoProjetadoModoUnificado = null;
  }
  bibliaVersiculoSelecionadoIdx = null;
  bibliaVersiculosCapitulo = [];
  bibliaVersiculosBrutosCapitulo = [];
  bibliaPrefetchCapJob++;
  bibliaCapsRequestSeq++;
  bibliaVersiculosRequestSeq++;
  bibliaSelecionadoLivro = null;
  bibliaSelecionadoLivroDb = null;
  bibliaSelecionadoCap = null;
  document.querySelectorAll('.biblia-v-card').forEach((c) => {
    c.classList.remove('projetado', 'selecionado');
  });
  bibliaNavPopupFechar();
}

/** Limpa estado local e manda encerrar a camada Bíblia no servidor. */
function encerrarCamadaBibliaNoControlador() {
  bibliaLimparEstadoOperador();
  if (estadoServidor && estadoServidor.tipo === 'biblia') {
    estadoServidor = {
      tipo: null,
      titulo: '',
      linhas: [],
      estrofeIndex: 0,
      totalEstrofes: 0,
      telaLimpa: true,
      blackout: false,
      slidePretoFinal: false,
    };
  }
  projecao.enviar('encerrar_projecao_biblia');
}

/** Encerra apenas a projeção da Bíblia (botão «Encerrar projeção» no modo Bíblia). */
function encerrarProjecaoModoBiblia() {
  if (!ehModoBibliaOperador()) return;
  encerrarCamadaBibliaNoControlador();
  atualizarPreviewOperador();
}

/**
 * Ao sair do modo Bíblia: encerra projeção no telão (se houver), limpa estado local
 * e repõe config de Slides nos monitores.
 */
function bibliaSairModo() {
  encerrarCamadaBibliaNoControlador();
  slidesAplicarCfgArmazenada();
  try {
    atualizarPreviewOperador();
  } catch (_) {
    // intencional — erro ignorado
  }
}

function popularLegendaBiblia() {
  const el = document.getElementById('biblia-legenda');
  if (!el) return;
  el.innerHTML = BIBLIA_GRUPOS.map(
    (g) =>
      `<span class="biblia-legenda-item">` +
      `<span class="biblia-legenda-swatch" style="background:${g.cor}"></span>` +
      `<span>${escapeHtml(g.label)}</span></span>`
  ).join('');
}

function popularGradeLivros() {
  const col = document.getElementById('biblia-col-livros');
  if (!col) return;
  popularLegendaBiblia();
  col.innerHTML = '';
  LIVROS.forEach((l, idx) => {
    const grupo = bibliaGrupoPorIndiceLivro(idx);
    const btn = document.createElement('button');
    btn.className =
      'biblia-livro-btn' + (grupo.textoClaro ? '' : ' biblia-livro-btn--texto-escuro');
    btn.dataset.nome = l.nome;
    btn.dataset.grupo = grupo.id;
    bibliaAplicarEstiloGrupoNoElemento(btn, grupo);
    btn.innerHTML = `<span class="livro-sigla">${escapeHtml(l.sigla)}</span><span class="livro-nome">${escapeHtml(l.nome)}</span>`;
    btn.onclick = () => bibliaEscolherLivro(l);
    col.appendChild(btn);
  });
}

function bibliaEscolherLivro(livro) {
  bibliaSelecionadoLivro = livro.nome;
  bibliaSelecionadoLivroDb = bibliaLivroNomeDb(livro);
  bibliaSelecionadoCap = null;
  document.querySelectorAll('.biblia-livro-btn').forEach((b) => {
    b.classList.toggle('selecionado', b.dataset.nome === livro.nome);
  });
  const btn = document.querySelector(
    `.biblia-livro-btn[data-nome="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(livro.nome) : livro.nome}"]`
  );
  if (btn) btn.scrollIntoView({ block: 'nearest' });
  const carregamentoCaps = bibliaCarregarCaps(bibliaSelecionadoLivroDb || livro.nome);
  const colVers = document.getElementById('biblia-col-versiculos');
  if (colVers) {
    colVers.innerHTML = '<div class="biblia-placeholder">← Selecione um capítulo</div>';
  }
  bibliaNavPopupFechar();
  const busca = document.getElementById('biblia-busca-rapida');
  if (busca) busca.value = '';
  return carregamentoCaps;
}

async function bibliaCarregarCaps(livro) {
  const traducao = document.getElementById('traducao-sel')?.value;
  const col = document.getElementById('biblia-col-caps');
  const livroRef = String(livro || '').trim();
  if (!col || !traducao || !livroRef) return;
  const requestSeq = ++bibliaCapsRequestSeq;
  col.innerHTML = '<div class="biblia-placeholder">…</div>';
  try {
    const res = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livroRef)}/caps`
    );
    const { total } = await res.json();
    if (requestSeq !== bibliaCapsRequestSeq) return;
    col.innerHTML = '';
    for (let i = 1; i <= total; i++) {
      const btn = document.createElement('button');
      btn.className = 'biblia-cap-btn';
      btn.textContent = i;
      btn.dataset.cap = i;
      btn.onclick = () => bibliaEscolherCap(i, btn);
      col.appendChild(btn);
    }
  } catch (_) {
    if (requestSeq !== bibliaCapsRequestSeq) return;
    col.innerHTML = '<div class="biblia-placeholder">Erro ao carregar</div>';
  }
}

function bibliaEscolherCap(cap, btnEl) {
  bibliaSelecionadoCap = cap;
  bibliaVersiculoSelecionadoIdx = null;
  bibliaParteProjetadaChave = null;
  document.querySelectorAll('.biblia-cap-btn').forEach((b) => b.classList.remove('selecionado'));
  btnEl.classList.add('selecionado');
  return bibliaCarregarVersiculos();
}

async function bibliaCarregarVersiculos() {
  if (!bibliaSelecionadoLivro || !bibliaSelecionadoCap) return;
  const livroRef = String(bibliaSelecionadoLivro || '').trim();
  const livroDbRef = String(bibliaSelecionadoLivroDb || livroRef).trim();
  const capRef = bibliaSelecionadoCap;
  const traducao = document.getElementById('traducao-sel')?.value;
  bibliaTraducaoAtual = traducao;
  const col = document.getElementById('biblia-col-versiculos');
  if (!col || !traducao || !livroDbRef) return;
  const requestSeq = ++bibliaVersiculosRequestSeq;
  bibliaVersiculoSelecionadoIdx = null;
  bibliaParteProjetadaChave = null;
  col.innerHTML = '<div class="biblia-placeholder">Carregando…</div>';
  try {
    const res = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livroDbRef)}/${capRef}`
    );
    const versiculos = await res.json();
    if (requestSeq !== bibliaVersiculosRequestSeq) return;
    bibliaGuardarVersiculosCapitulo(versiculos, traducao, livroRef, capRef);
    bibliaRenderizarSeletorVersiculos();
  } catch (_) {
    if (requestSeq !== bibliaVersiculosRequestSeq) return;
    col.innerHTML = '<div class="biblia-placeholder">Erro ao carregar versículos</div>';
  }
}

/**
 * Redesenha a coluna de versículos a partir de `bibliaVersiculosCapitulo`.
 *
 * Um card por **parte**: com a divisão ligada, o versículo 12 pode aparecer em dois cards,
 * ambos numerados «12». Por isso `data-versiculo` deixou de ser único e a seleção passou a
 * usar `data-indice`.
 *
 * Dois chamadores — o carregamento do capítulo e a mudança da opção de divisão — e uma só
 * cópia do render.
 */
function bibliaRenderizarSeletorVersiculos() {
  const col = document.getElementById('biblia-col-versiculos');
  if (!col) return;
  col.innerHTML = '';
  bibliaVersiculosCapitulo.forEach((v, index) => {
    const card = document.createElement('div');
    card.className = 'biblia-v-card' + (v.parteTotal > 1 ? ' biblia-v-parte' : '');
    card.dataset.versiculo = v.versiculo;
    card.dataset.indice = index;
    card.dataset.parte = v.parteIndice ?? 0;
    if (v.parteTotal > 1) {
      card.title = `${v.livro} ${v.capitulo}:${v.versiculo} — parte ${(v.parteIndice ?? 0) + 1} de ${v.parteTotal}`;
    }
    card.innerHTML = `
      <div class="biblia-v-num">${v.versiculo}</div>
      <div class="biblia-v-texto">${escapeHtml(v.texto)}</div>
    `;
    card.onclick = () => bibliaClicarVersiculo(v, card, index);
    col.appendChild(card);
  });
}

function bibliaClicarVersiculo(v, cardEl, index) {
  const jaSelecionado = cardEl.classList.contains('selecionado');
  document.querySelectorAll('.biblia-v-card').forEach((c) => c.classList.remove('selecionado'));
  cardEl.classList.add('selecionado');
  bibliaVersiculoSelecionadoIdx = index;
  if (jaSelecionado || bibliaParteProjetadaChave !== null) {
    bibliaProjetarVersiculo(v, cardEl);
  }
}

function bibliaChaveRotaAtual() {
  const r = normalizarRota(rotasPorModo.biblia);
  return `${r.publicoIndex},${r.ministranteIndex},${r.live ? 1 : 0}`;
}

async function bibliaSincronizarRotaComServidorSeMudou() {
  const fromUi = rotaSelecionadaNaUi();
  if (fromUi) rotasPorModo.biblia = normalizarRota(fromUi);
  salvarRotasPorModoNoStorage();
  const chave = bibliaChaveRotaAtual();
  if (chave === bibliaRotaSyncServidorChave) return;
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
}

async function bibliaProjetarVersiculo(v, cardEl, opts = {}) {
  if (!projecao.ligada()) return;
  const alvo = obterAlvoProjecaoModoBiblia();
  const livroRef = bibliaNormalizarCampoReferencia(v?.livro) || bibliaNormalizarCampoReferencia(bibliaSelecionadoLivro);
  const capituloRef =
    bibliaNormalizarCampoReferencia(v?.capitulo) || bibliaNormalizarCampoReferencia(bibliaSelecionadoCap);
  const versiculoRef = bibliaNormalizarCampoReferencia(v?.versiculo);
  /* Chave da parte, não o número: duas partes do mesmo versículo têm o mesmo número e
     seriam tomadas por «o mesmo conteúdo», forçando o reenvio da config a cada parte. */
  const chaveParte = v?.chave ?? `${livroRef}|${capituloRef}|${versiculoRef}|0`;
  const navegacaoRapida =
    opts.navegacaoRapida === true ||
    (bibliaParteProjetadaChave != null && bibliaParteProjetadaChave !== chaveParte);
  if (!navegacaoRapida) {
    /* Sincroniza rota só na primeira projeção — evita PUT /api/display-routing a cada versículo. */
    await bibliaSincronizarRotaComServidorSeMudou();
  }
  if (!monitoresBibliaCobremAlvo(alvo)) {
    if (!navegacaoRapida) alert(mensagemAlvoInvalidoBiblia(alvo));
    return;
  }
  document.querySelectorAll('.biblia-v-card').forEach((c) => c.classList.remove('projetado'));
  if (cardEl && cardEl.classList) cardEl.classList.add('projetado');
  bibliaParteProjetadaChave = chaveParte;
  const payloadVersiculo = {
    livro: livroRef,
    capitulo: capituloRef,
    versiculo: versiculoRef,
    texto: v?.texto != null ? String(v.texto) : '',
    traducao: bibliaTraducaoAtual,
    alvoProjecao: alvo,
    somenteTexto: navegacaoRapida,
  };
  projecao.enfileirar('exibir_versiculo', payloadVersiculo);
  ultimoConteudoProjetadoModoUnificado = { tipo: 'biblia', payload: payloadVersiculo };
  bibliaPrefetchCapitulosVizinhos();
}

function bibliaPayloadCfgExibicao() {
  const pub = { ...bibliaCfgExibicao };
  const mon = { ...bibliaCfgMinistrante };
  const fundoPub = bibliaFundoParaPayload(pub);
  const fundoMon = bibliaFundoParaPayload(mon);
  return {
    publico: {
      fontSize: pub.fontSize,
      fontFamily: pub.fontFamily,
      lineSpacing: pub.lineSpacing,
      wrapLongLines: pub.wrapLongLines !== false,
      textColor: pub.textColor,
      negrito: pub.negrito,
      maiusculo: pub.maiusculo === true,
      textAlign: pub.textAlign,
      posX: pub.posX || 'center',
      posY: pub.posY || 'center',
      ...fundoPub,
      refMostrar: pub.refMostrar !== false,
      refFontSize: pub.refFontSize ?? BIBLIA_CFG_EXIBICAO_PADRAO.refFontSize,
      refColor: pub.refColor || BIBLIA_CFG_EXIBICAO_PADRAO.refColor,
    },
    ministrante: {
      fontSize: mon.fontSize,
      fontSizeAtual: mon.fontSize,
      fontSizeProximo: mon.fontSize,
      fontFamily: mon.fontFamily,
      lineSpacing: mon.lineSpacing,
      wrapLongLines: mon.wrapLongLines !== false,
      autoFitLongLines: mon.autoFitLongLines,
      negrito: mon.negrito !== false,
      maiusculo: mon.maiusculo === true,
      textColorAtual: mon.textColorAtual,
      textColorProximo: mon.textColorProximo,
      posX: mon.posX || 'center',
      posY: mon.posY || 'center',
      ...fundoMon,
      refMostrar: mon.refMostrar !== false,
      refFontSize: mon.refFontSize ?? BIBLIA_CFG_MINISTRANTE_PADRAO.refFontSize,
      refColor: mon.refColor || BIBLIA_CFG_MINISTRANTE_PADRAO.refColor,
    },
  };
}

function bibliaAplicarCfgExibicao() {
  salvarBibliaCfgNoStorage();
  enviarPreviewDisplayConfig(null, {
    modoConfig: 'biblia',
    forcarModo: 'biblia',
  });
}

function bibliaNavPopupAberto() {
  const popup = document.getElementById('biblia-nav-popup');
  return popup && !popup.classList.contains('oculto');
}

function bibliaNavPopupAbrir() {
  bnpEtapa = 'livro';
  bnpLivroSelecionado = null;
  bnpCapSelecionado = null;
  bnpDigitando = '';
  bnpFocoIndex = -1;
  const livroDisp = document.getElementById('bnp-livro-display');
  const capDisp = document.getElementById('bnp-cap-display');
  const verDisp = document.getElementById('bnp-ver-display');
  const linhaCap = document.getElementById('bnp-linha-cap');
  const linhaVer = document.getElementById('bnp-linha-ver');
  if (livroDisp) livroDisp.textContent = '—';
  if (capDisp) {
    capDisp.textContent = '—';
    capDisp.style.color = 'var(--text, #fff)';
  }
  if (verDisp) {
    verDisp.textContent = '—';
    verDisp.style.color = 'var(--text, #fff)';
  }
  if (linhaCap) linhaCap.style.display = 'none';
  if (linhaVer) linhaVer.style.display = 'none';
  const popup = document.getElementById('biblia-nav-popup');
  if (popup) popup.classList.remove('oculto');
  const inp = document.getElementById('biblia-busca-rapida');
  if (inp) {
    inp.value = '';
    setTimeout(() => inp.focus(), 30);
  }
}

function bibliaNavPopupFechar() {
  const popup = document.getElementById('biblia-nav-popup');
  if (popup) popup.classList.add('oculto');
  const lista = document.getElementById('bnp-livro-lista');
  if (lista) lista.innerHTML = '';
  bnpDigitando = '';
  bnpFocoIndex = -1;
  const inp = document.getElementById('biblia-busca-rapida');
  if (inp) inp.blur();
}

/** Número digitado está completo (evita avançar em "1" quando ainda pode ser "12"). */
function bnpNumeroEntradaCompleta(str, max) {
  const t = String(str || '').trim();
  if (!/^\d+$/.test(t)) return false;
  const n = parseInt(t, 10);
  if (n < 1 || n > max) return false;
  const maxLen = String(max).length;
  if (t.length >= maxLen) return true;
  return n * Math.pow(10, maxLen - t.length) > max;
}

function bnpLivroPorSiglaExata(q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return null;
  const matches = LIVROS.filter((l) => l.sigla.toLowerCase() === t);
  return matches.length === 1 ? matches[0] : null;
}

function bibliaBuscaRapida(val) {
  bnpDigitando = val;
  bnpFocoIndex = -1;

  if (bnpEtapa === 'livro') {
    const lista = document.getElementById('bnp-livro-lista');
    const livroDisp = document.getElementById('bnp-livro-display');
    if (!lista || !livroDisp) return;
    const q = val.trim().toLowerCase();
    livroDisp.textContent = val || '—';
    if (!q) {
      lista.innerHTML = '';
      return;
    }
    const exato = bnpLivroPorSiglaExata(val);
    if (exato) {
      bnpSelecionarLivro(exato);
      return;
    }
    const encontrados = LIVROS.filter((l) =>
      l.sigla.toLowerCase().startsWith(q) ||
      l.nome.toLowerCase().startsWith(q) ||
      l.nome.toLowerCase().includes(q)
    ).slice(0, 8);
    lista.innerHTML = '';
    encontrados.forEach((l) => {
      const grupo = bibliaGrupoPorLivro(l);
      const item = document.createElement('div');
      item.className = 'bnp-item';
      item.innerHTML =
        `<span class="bnp-sigla" style="background:${grupo.cor};color:${bibliaCorTextoGrupo(grupo)}">` +
        `${escapeHtml(l.sigla)}</span><span>${escapeHtml(l.nome)}</span>`;
      item.onclick = () => bnpSelecionarLivro(l);
      lista.appendChild(item);
    });
    lista._resultados = encontrados;
  } else if (bnpEtapa === 'cap') {
    const capDisp = document.getElementById('bnp-cap-display');
    if (!capDisp) return;
    capDisp.textContent = val || '—';
    const num = parseInt(val, 10);
    if (num >= 1 && num <= bnpTotalCaps) {
      capDisp.style.color = 'var(--accent, #c49a3a)';
      if (bnpNumeroEntradaCompleta(val, bnpTotalCaps)) {
        bnpConfirmarCap(val);
      }
    } else {
      capDisp.style.color = 'var(--text, #fff)';
    }
  } else if (bnpEtapa === 'ver') {
    const verDisp = document.getElementById('bnp-ver-display');
    if (!verDisp) return;
    verDisp.textContent = val || '—';
    const num = parseInt(val, 10);
    if (num >= 1 && num <= bnpTotalVers) {
      verDisp.style.color = 'var(--accent, #c49a3a)';
      if (bnpNumeroEntradaCompleta(val, bnpTotalVers)) {
        bnpConfirmarVer(val);
      }
    } else {
      verDisp.style.color = 'var(--text, #fff)';
    }
  }
}

async function bnpSelecionarLivro(livro) {
  bnpLivroSelecionado = livro;
  bnpEtapa = 'cap';
  bnpDigitando = '';
  const inp = document.getElementById('biblia-busca-rapida');
  if (inp) inp.value = '';
  const livroDisp = document.getElementById('bnp-livro-display');
  const lista = document.getElementById('bnp-livro-lista');
  if (livroDisp) livroDisp.textContent = `${livro.sigla} — ${livro.nome}`;
  if (lista) lista.innerHTML = '';
  const traducao = document.getElementById('traducao-sel')?.value;
  try {
    const res = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livro.nome)}/caps`
    );
    const { total } = await res.json();
    bnpTotalCaps = total;
  } catch (_) {
    bnpTotalCaps = 150;
  }
  const linhaCap = document.getElementById('bnp-linha-cap');
  const capDisp = document.getElementById('bnp-cap-display');
  if (linhaCap) linhaCap.style.display = 'flex';
  if (capDisp) {
    capDisp.textContent = '—';
    capDisp.style.color = 'var(--text, #fff)';
  }
  setTimeout(() => document.getElementById('biblia-busca-rapida')?.focus(), 30);
}

async function bnpConfirmarCap(val) {
  const num = parseInt(val, 10);
  if (!num || num < 1 || num > bnpTotalCaps) return;
  bnpCapSelecionado = num;
  bnpEtapa = 'ver';
  bnpDigitando = '';
  const inp = document.getElementById('biblia-busca-rapida');
  if (inp) inp.value = '';
  const capDisp = document.getElementById('bnp-cap-display');
  if (capDisp) capDisp.textContent = String(num);
  const traducao = document.getElementById('traducao-sel')?.value;
  try {
    const res = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(bnpLivroSelecionado.nome)}/${num}`
    );
    const vers = await res.json();
    bnpTotalVers = vers.length;
  } catch (_) {
    bnpTotalVers = 200;
  }
  const linhaVer = document.getElementById('bnp-linha-ver');
  const verDisp = document.getElementById('bnp-ver-display');
  if (linhaVer) linhaVer.style.display = 'flex';
  if (verDisp) {
    verDisp.textContent = '—';
    verDisp.style.color = 'var(--text, #fff)';
  }
  setTimeout(() => document.getElementById('biblia-busca-rapida')?.focus(), 30);
}

async function bnpConfirmarVer(val) {
  const num = parseInt(val, 10);
  if (!num || num < 1 || num > bnpTotalVers || !bnpLivroSelecionado) return;
  bibliaNavPopupFechar();
  await bibliaEscolherLivro(bnpLivroSelecionado);
  await new Promise((r) => setTimeout(r, 200));
  const capBtn = document.querySelector(`.biblia-cap-btn[data-cap="${bnpCapSelecionado}"]`);
  if (capBtn) bibliaEscolherCap(bnpCapSelecionado, capBtn);
  await new Promise((r) => setTimeout(r, 300));
  /* Uma referência aponta sempre para o início do versículo — nunca para o meio. */
  const idx = indicePrimeiraParteDoVersiculo(bibliaVersiculosCapitulo, num);
  const v = idx >= 0 ? bibliaVersiculosCapitulo[idx] : null;
  if (!v) return;
  /* O objeto projetado sai da lista, não do DOM: ler o texto do card traria as reticências
     decorativas para dentro da projeção e perderia `livro`/`capitulo` (referência vazia). */
  const card = bibliaMarcarVersiculoNaUi(v, idx);
  if (card) card.scrollIntoView({ block: 'center' });
  await bibliaProjetarVersiculo(v, card);
}

function bibliaBuscaRapidaTecla(e) {
  if (!bibliaNavPopupAberto()) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      bibliaNavegarVersiculosComSeta(e.key);
    }
    return;
  }

  if (bnpEtapa === 'livro') {
    const lista = document.getElementById('bnp-livro-lista');
    if (!lista) return;
    const items = lista.querySelectorAll('.bnp-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      bnpFocoIndex = Math.min(bnpFocoIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('focado', i === bnpFocoIndex));
      if (items[bnpFocoIndex]) items[bnpFocoIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      bnpFocoIndex = Math.max(bnpFocoIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle('focado', i === bnpFocoIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = bnpFocoIndex >= 0 ? bnpFocoIndex : 0;
      if (lista._resultados && lista._resultados[idx]) {
        bnpSelecionarLivro(lista._resultados[idx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      bibliaNavPopupFechar();
    }
  } else if (bnpEtapa === 'cap') {
    if (e.key === 'Enter') {
      e.preventDefault();
      bnpConfirmarCap(document.getElementById('biblia-busca-rapida')?.value || '');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      bibliaNavPopupFechar();
    }
  } else if (bnpEtapa === 'ver') {
    if (e.key === 'Enter') {
      e.preventDefault();
      bnpConfirmarVer(document.getElementById('biblia-busca-rapida')?.value || '');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      bibliaNavPopupFechar();
    }
  }
}

function bibliaIndicePorTeclaNavegacao(key, idxAtual, total) {
  let idx = idxAtual ?? -1;
  if (key === 'ArrowDown' || key === 'ArrowRight') idx = Math.min(idx + 1, total - 1);
  else if (key === 'ArrowUp' || key === 'ArrowLeft') idx = Math.max(idx - 1, 0);
  return idx;
}

/**
 * Marca a parte de índice `idx` como selecionada.
 *
 * Procura por `data-indice` e não por `data-versiculo`: com a divisão ligada o número do
 * versículo repete-se entre partes e a consulta antiga acertaria sempre na primeira.
 */
function bibliaMarcarVersiculoNaUi(v, idx) {
  const card = document.querySelector(`.biblia-v-card[data-indice="${idx}"]`);
  document.querySelectorAll('.biblia-v-card').forEach((c) => c.classList.remove('selecionado'));
  if (card) {
    card.classList.add('selecionado');
    card.scrollIntoView({ block: 'nearest' });
  }
  bibliaVersiculoSelecionadoIdx = idx;
  return card;
}

function bibliaNavegarVersiculosComSeta(key) {
  if (bibliaNavPopupAberto()) return;
  const total = bibliaVersiculosCapitulo.length;
  if (!total) {
    const cards = document.querySelectorAll('.biblia-v-card');
    if (!cards.length) return;
    let idx = bibliaVersiculoSelecionadoIdx ?? -1;
    idx = bibliaIndicePorTeclaNavegacao(key, idx, cards.length);
    if (idx === bibliaVersiculoSelecionadoIdx && bibliaParteProjetadaChave != null) return;
    bibliaVersiculoSelecionadoIdx = idx;
    cards[idx].scrollIntoView({ block: 'nearest' });
    cards[idx].click();
    return;
  }
  let idx = bibliaVersiculoSelecionadoIdx ?? -1;
  const prox = bibliaIndicePorTeclaNavegacao(key, idx, total);
  if (prox === idx && bibliaParteProjetadaChave != null) return;
  const v = bibliaVersiculosCapitulo[prox];
  if (!v) return;
  const card = bibliaMarcarVersiculoNaUi(v, prox);
  if (bibliaParteProjetadaChave != null) {
    void bibliaProjetarVersiculo(v, card, { navegacaoRapida: true });
  }
}

/** Teclado no modo Bíblia: retorna true se o evento foi consumido. */
function bibliaTratarKeydownModo(e) {
  if (!ehModoBibliaOperador()) return false;

  const inpNav = document.getElementById('biblia-busca-rapida');
  const tag = document.activeElement?.tagName?.toLowerCase();
  const isField =
    (tag === 'input' || tag === 'select' || tag === 'textarea') &&
    document.activeElement !== inpNav;
  if (isField) return false;

  if (e.ctrlKey || e.altKey || e.metaKey) return false;

  if (e.key === 'Escape') {
    if (bibliaNavPopupAberto()) {
      e.preventDefault();
      bibliaNavPopupFechar();
      return true;
    }
    return false;
  }

  if (bibliaNavPopupAberto()) {
    if (document.activeElement === inpNav) return false;
    return false;
  }

  if (
    e.key === 'ArrowDown' ||
    e.key === 'ArrowUp' ||
    e.key === 'ArrowLeft' ||
    e.key === 'ArrowRight'
  ) {
    e.preventDefault();
    bibliaNavegarVersiculosComSeta(e.key);
    return true;
  }

  if (e.key.length === 1 || e.key === 'Backspace') {
    e.preventDefault();
    bibliaNavPopupAbrir();
    setTimeout(() => {
      if (!inpNav) return;
      inpNav.focus();
      if (e.key === 'Backspace') {
        inpNav.value = '';
      } else {
        inpNav.value = e.key;
      }
      bibliaBuscaRapida(inpNav.value);
    }, 0);
    return true;
  }

  return false;
}

async function bibliaEscolherFundo(input) {
  const file = input.files?.[0];
  if (!file) return;
  const id = input.id || '';
  const alvo = id.includes('biblia-min') ? 'ministrante' : 'publico';
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    if (alvo === 'ministrante') {
      bibliaCfgMinistrante.bgType = 'image';
      bibliaCfgMinistrante.bgImage = dataUrl;
      const prev = document.getElementById('cfg-biblia-min-bg-preview-ctrl');
      if (prev) prev.style.backgroundImage = `url(${dataUrl})`;
      setSelVal('cfg-biblia-min-bg-type-ctrl', 'image');
      bibliaAtualizarVisibilidadeFundo('ministrante');
    } else {
      bibliaCfgExibicao.bgType = 'image';
      bibliaCfgExibicao.bgImage = dataUrl;
      const prev = document.getElementById('cfg-biblia-pub-bg-preview-ctrl');
      if (prev) prev.style.backgroundImage = `url(${dataUrl})`;
      setSelVal('cfg-biblia-pub-bg-type-ctrl', 'image');
      bibliaAtualizarVisibilidadeFundo('publico');
    }
    salvarBibliaCfgNoStorage();
    bibliaAplicarCfgExibicao();
  };
  reader.readAsDataURL(file);
  input.value = '';
}

document.addEventListener('keydown', (e) => {
  const musicaExcBd = document.getElementById('musica-excluir-backdrop');
  if (musicaExcBd && !musicaExcBd.hidden && e.key === 'Escape') {
    e.preventDefault();
    fecharModalExcluirMusica();
    return;
  }
  const novaMusicaBd = document.getElementById('nova-musica-manual-backdrop');
  if (novaMusicaBd && !novaMusicaBd.hidden && e.key === 'Escape') {
    e.preventDefault();
    fecharModalNovaMusicaManual();
    return;
  }
  const letrasBd = document.getElementById('letras-preview-backdrop');
  if (letrasBd && !letrasBd.hidden && e.key === 'Escape') {
    e.preventDefault();
    fecharModalPreviewLetras();
    return;
  }
  const delBackdrop = document.getElementById('slide-delete-confirm-backdrop');
  if (delBackdrop && !delBackdrop.hidden && e.key === 'Escape') {
    e.preventDefault();
    fecharSlideDeleteConfirmModal();
    return;
  }
  const qeBackdrop = document.getElementById('slide-quick-edit-backdrop');
  if (qeBackdrop && !qeBackdrop.hidden && e.key === 'Escape') {
    e.preventDefault();
    fecharSlideQuickEditModal();
    return;
  }
  /*
   * Escape com o foco num campo — tratado **antes** do bloqueio abaixo.
   *
   * O bloco seguinte devolve o controlo ao campo sempre que o foco está num
   * `INPUT`/`TEXTAREA`/`SELECT`, e isso engolia o Escape. No modo Bíblia o foco está quase
   * sempre num campo — a busca rápida, os selectores de tradução/livro/capítulo — e o
   * resultado era o Escape não encerrar a projeção. Só voltava a funcionar depois de um
   * clique num versículo, que tira o foco do campo. `bibliaTratarKeydownModo` também não
   * salvava: para Escape ele só fecha o popup e, fora disso, devolve `false`.
   *
   * Precedência: popup aberto → encerrar a projeção activa → deixar o campo tratar.
   * Encerrar ganha ao campo de propósito: é a tecla de pânico durante o culto, e o campo
   * tem outras saídas. Sem projeção activa não há nada a encerrar, e o Escape volta a ser
   * do campo (limpar, desfocar).
   */
  if (
    e.key === 'Escape' &&
    (e.target.tagName === 'INPUT' ||
      e.target.tagName === 'TEXTAREA' ||
      e.target.tagName === 'SELECT') &&
    !ehModoApresentacaoOperador()
  ) {
    if (ehModoBibliaOperador()) {
      if (bibliaNavPopupAberto()) {
        e.preventDefault();
        bibliaNavPopupFechar();
        return;
      }
      if (bibliaParteProjetadaChave != null) {
        e.preventDefault();
        encerrarProjecaoModoBiblia();
        return;
      }
    } else if (ehModoSlidesOperador() && projecao.pronta() && projecaoMusicaEmitidaNoServidor) {
      /* O modo slide já encerrava com o foco fora de campo; isto cobre o caso simétrico,
         que falhava pela mesma razão e que ninguém notava por ali se digitar menos. */
      e.preventDefault();
      slidesRailUserRecolhido = true;
      encerrarProjecaoDoControlador({ limparMusica: true });
      return;
    }
    /* Sem nada projetado: cai no bloco abaixo e o campo trata o Escape. */
  }
  if (
    e.target.tagName === 'INPUT' ||
    e.target.tagName === 'TEXTAREA' ||
    e.target.tagName === 'SELECT'
  ) {
    if (e.target.id === 'biblia-busca-rapida') return;
    if (ehModoBibliaOperador() && bibliaTratarKeydownModo(e)) return;
    return;
  }
  if (bibliaTratarKeydownModo(e)) return;

  const dirPassador = direcaoTeclaPassadorSlides(e.key, e.code);
  if (dirPassador !== 0) {
    e.preventDefault();
    if (ehModoSlidesOperador()) {
      navegarEstrofePassadorSlides(dirPassador);
    } else if (
      e.key === 'ArrowRight' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowUp'
    ) {
      navegarEstrofePorSeta(e.key);
    } else {
      navegarEstrofe(dirPassador);
    }
    return;
  }

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (ehModoBibliaOperador()) {
      bibliaNavegarVersiculosComSeta(e.key);
    } else {
      navegarEstrofePorSeta(e.key);
    }
  } else if (e.key === 'Escape') {
    if (ehModoApresentacaoOperador()) return;
    if (ehModoBibliaOperador()) {
      const popup = document.getElementById('biblia-nav-popup');
      if (popup && !popup.classList.contains('oculto')) {
        e.preventDefault();
        bibliaNavPopupFechar();
      } else {
        e.preventDefault();
        encerrarProjecaoModoBiblia();
      }
      return;
    }
    if (ehModoSlidesOperador()) {
      e.preventDefault();
      slidesRailUserRecolhido = true;
      encerrarProjecaoDoControlador({ limparMusica: true });
    }
  } else if (e.key === 'F10') {
    e.preventDefault();
    toggleBlackoutTelas();
  }
});

try {
  initBancoPainelFromStorage();
  garantirBuscaLocalEditavel();
  garantirBuscaLetrasEditavel();
  carregarRotasPorModoDoStorage();
  playlists = loadPlaylists();
  cultosManuaisCache = loadCultosManuais();
  temaSelecionadoPorCulto = loadTemaSelecionadoPorCulto();
  temasPorCulto = loadTemasPorCulto();
  aberturaRemovidaPorCulto = loadAberturaRemovidaPorCulto();
  migrarPlaylistsCultosAntigos();
  carregarEstadoModoApresentacaoDoStorage();
  const avisoCard6CfgSalva = carregarAvisoCard6CfgDoStorage();
  if (avisoCard6CfgSalva) apresentacaoCard6AvisoCfg = avisoCard6CfgSalva;
  carregarBibliaCfgDoStorage();
  atualizarVisibilidadeAbasCfgPorModo();
  setupCultoDropdown();
  setupAdicionarCultoManual();
  configurarNotasSlideControlador({
    obterMusicaId: () => (musicaAtiva && musicaAtiva.id != null ? Number(musicaAtiva.id) : null),
    obterVersaoLocalId: () => musicaVersaoLocalId,
    obterEstrofeAtiva: () => estrofeAtiva,
    obterNumSlides: () =>
      musicaAtiva && Array.isArray(musicaAtiva.estrofes) ? musicaAtiva.estrofes.length : 0,
    ehModoSlides: ehModoSlidesOperador,
  });
  setupApAudioDropdown();
  setupApFilesDropdown();
  initCultoSelect();
  if (cultoId) {
    garantirAberturaNoCatalogoCulto(cultoId);
    if (garantirMarcadorAberturaNaPlaylist(cultoId)) savePlaylists();
  }
  document.body.classList.remove('app-mod-slides');
  document.body.classList.remove('app-mod-apresentacao');
  document.body.classList.remove('app-mod-biblia');
  document.body.classList.remove('slides-rail-aberto');
  document.title = 'Lyra — Controlador';
  localStorage.setItem(LS_UI_MODO_SLIDES, '0');
  slidesDockVisivel = false;
  faixaSlidesHabilitadaPorPlaylistNoModoSlides = false;
  const lm = document.getElementById('layout-musicas');
  if (lm) lm.removeAttribute('style');

  aplicarRotulosEPlaylistModoSlides();
  atualizarBtnToggleModoSlides();
  atualizarBtnModoApresentacao();
  atualizarBtnModoBiblia();
  configurarObserverPreviewMinistrante();

  if (typeof window !== 'undefined' && window.lyraElectron?.onMusicasSincronizadas) {
    window.lyraElectron.onMusicasSincronizadas((payload) => {
      processarMusicasSincronizadasPayload(payload).catch(() => {});
    });
  }
  if (typeof window !== 'undefined' && window.lyraElectron?.onBancoCompartilhadoAlterado) {
    window.lyraElectron.onBancoCompartilhadoAlterado((payload) => {
      if (payload?.updatedAt) sharedBancoLocalUpdatedAt = String(payload.updatedAt);
    });
  }
  if (typeof window !== 'undefined' && window.lyraElectron?.onBancoCompartilhadoAplicado) {
    window.lyraElectron.onBancoCompartilhadoAplicado((payload) => {
      aplicarSnapshotCompartilhadoNoRenderer(payload?.snapshot || null).catch(() => {});
    });
  }
} catch (err) {
  console.error('[Lyra] falha no bootstrap do painel', err);
}

window.addEventListener('beforeunload', () => {
  rotasPorModo.apresentacao = rotaDesativada();
  rotasPorModo.biblia = rotaDesativada();
  const ip = hostProjecao();
  if (!ip) return;
  try {
    const payload = JSON.stringify({
      version: 2,
      slides: normalizarRota(rotasPorModo.slides),
      apresentacao: rotaDesativada(),
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `http://${ip}:5510/api/display-routing`,
        new Blob([payload], { type: 'application/json' })
      );
    }
  } catch (_) {
  // intencional — erro ignorado
}
});

renderPlaylist();
renderEstrofesEditor();
renderSlidesStrip();
renderGridApresentacao();
renderMenuApresentacao();
renderListaAudiosApresentacao();
renderListaPlaylistApresentacao();
atualizarUiPlayerAudioRemoto();
atualizarPreviewOperador();
carregarPreviewPainelOcultoDoArmazenamento();
aplicarPreviewPainelOcultoNoDom();
carregarPlaylistPreviewSlideOcultoDoArmazenamento();
aplicarPlaylistPreviewSlideOcultoNoDom();

const ipSalvo = readLsMigrate(LS_IP_KEY, LS_IP_LEGACY);
if (ipSalvo) document.getElementById('ip-input').value = ipSalvo;
carregarMusicas();
setTimeout(() => carregarRoteamentoTelasDoServidor(), 120);

configurarAutoConectarAoAlternarJanelas();

initSlidesRailHeightFromStorage();
initAlturaPreviewModFromStorage();
setupMenusRoteamentoTelas();
impedirSelecaoDeTextoNoDuploClique();
setupSlidesRailResize();
initSlidesChipZoomFromStorage();
setupSlidesChipZoomButtons();
setupSlidesGridViewportFitObserver();
setupSlidesStripContextMenuEEdicaoRapida();
configurarCamposMetadadosMusicaHome();
configurarModalPreviewLetras();
configurarModalExcluirMusica();
configurarModalSyncPlaylist();
configurarModalNovaMusicaManual();
configurarSeletorTemaPlaylist();
document.getElementById('banco-busca-local-wrap')?.addEventListener('click', () => {
  garantirBuscaLocalEditavel();
  document.getElementById('busca')?.focus();
});
document.getElementById('busca-letras-panel')?.addEventListener('click', () => {
  garantirBuscaLetrasEditavel();
  document.getElementById('busca-letras-q')?.focus();
});
document.getElementById('apresentacao-add-menu-input')?.addEventListener('change', (e) => {
  const files = e?.target?.files;
  if (files?.length) adicionarArquivosAoMenu(files);
});
document.getElementById('apresentacao-add-card-input')?.addEventListener('change', (e) => {
  const f = e?.target?.files?.[0];
  if (!f) return;
  adicionarArquivoDiretoNoCard(f, apresentacaoCardInputTarget ?? 0);
  if (e.target) e.target.value = '';
});
document.getElementById('apresentacao-add-audio-input')?.addEventListener('change', (e) => {
  const files = e?.target?.files;
  if (files?.length) adicionarAudiosAoMenu(files);
});
document.getElementById('apresentacao-menu-add')?.addEventListener('click', () => escolherArquivoModoApresentacao());
document.getElementById('apresentacao-audio-add')?.addEventListener('click', () => {
  const input = document.getElementById('apresentacao-add-audio-input');
  if (!input) return;
  input.value = '';
  input.click();
});
document.getElementById('apresentacao-add-video-input')?.addEventListener('change', (e) => {
  const files = e?.target?.files;
  if (files?.length) playlistAdicionarVideos(files);
  if (e.target) e.target.value = '';
});
document.getElementById('ap-playlist-add')?.addEventListener('click', () => {
  const input = document.getElementById('apresentacao-add-video-input');
  if (!input) return;
  input.value = '';
  input.click();
});
/* Menu overflow (⋯) do cabeçalho da playlist. */
function fecharMenuOverflowPlaylist() {
  const menu = document.getElementById('ap-playlist-overflow-menu');
  const btn = document.getElementById('ap-playlist-overflow-btn');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
document.getElementById('ap-playlist-overflow-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = document.getElementById('ap-playlist-overflow-menu');
  const btn = document.getElementById('ap-playlist-overflow-btn');
  if (!menu || !btn) return;
  const abrir = menu.hidden;
  menu.hidden = !abrir;
  btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
});
document.addEventListener('click', (e) => {
  const wrap = e.target?.closest?.('.ap-playlist-overflow');
  if (!wrap) fecharMenuOverflowPlaylist();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharMenuOverflowPlaylist();
});
document.getElementById('ap-playlist-clear')?.addEventListener('click', () => {
  fecharMenuOverflowPlaylist();
  void playlistLimpar();
});
document.getElementById('ap-playlist-modo')?.addEventListener('click', () => playlistAlternarModo());
document.getElementById('ap-playlist-atraso')?.addEventListener('change', (e) => playlistDefinirAtraso(e?.target?.value));
/* Mantém o overlay de preview alinhado ao slot ao rolar/redimensionar. */
window.addEventListener('scroll', () => { if (_previewAlvoAtual) posicionarOverlayPreview(); }, true);
window.addEventListener('resize', () => { if (_previewAlvoAtual) posicionarOverlayPreview(); });
(function ligarBotaoPlayPauseApresentacao() {
  const btn = document.getElementById('ap-audio-play-pause');
  if (!btn) return;
  btn.onclick = () => {
    void tocarAudioAtualSelecionado();
  };
})();
document.getElementById('ap-audio-loop')?.addEventListener('click', () => {
  alternarLoopPlayerApresentacao();
});
document.getElementById('ap-audio-stop')?.addEventListener('click', () => pararAudioServidor());
document.getElementById('ap-audio-vol-up')?.addEventListener('click', () => {
  const nextVol = Math.min(1, Math.round((Number(audioStateRemoto.volume) + 0.1) * 10) / 10);
  definirVolumeAudioServidor(nextVol);
});
document.getElementById('ap-audio-vol-down')?.addEventListener('click', () => {
  const nextVol = Math.max(0, Math.round((Number(audioStateRemoto.volume) - 0.1) * 10) / 10);
  definirVolumeAudioServidor(nextVol);
});
document.getElementById('ap-audio-seek')?.addEventListener('mousedown', () => { audioSeekDragging = true; });
document.getElementById('ap-audio-seek')?.addEventListener('mouseup', (e) => {
  audioSeekDragging = false;
  const val = Math.max(0, Math.min(1000, Number(e?.target?.value || 0)));
  const dur = Math.max(0, Number(audioStateRemoto.duration) || 0);
  const t = dur > 0 ? (val / 1000) * dur : 0;
  seekAudioServidor(t);
});
document.getElementById('apresentacao-selecionar-arquivo')?.addEventListener('click', () => escolherArquivoModoApresentacao());
document.getElementById('apresentacao-fechar')?.addEventListener('click', () => fecharMenuModoApresentacao());
document.getElementById('apresentacao-encerrar')?.addEventListener('click', () => {
  void encerrarModoApresentacaoNoTelao();
});
document.getElementById('hdr-encerrar-projecao')?.addEventListener('click', () => {
  if (ehModoApresentacaoOperador()) {
    void encerrarProjecaoModoApresentacao();
  } else if (ehModoBibliaOperador()) {
    encerrarProjecaoModoBiblia();
  } else if (ehModoSlidesOperador()) {
    slidesRailUserRecolhido = true;
    encerrarProjecaoDoControlador({ limparMusica: true });
  }
});

document.getElementById('ip-input').addEventListener('change', (e) => {
  localStorage.setItem(LS_IP_KEY, e.target.value);
  setTimeout(() => carregarRoteamentoTelasDoServidor(), 120);
});

setTimeout(() => {
  /*
   * Projetar nesta máquina é SEMPRE o arranque: há projeção desde o início e o painel nunca
   * fica preso num «conectando» sem nada projetável.
   *
   * Se a preferência declarada é o Servidor remoto (cenário de dois PCs), tenta-se ligar POR
   * CIMA do local — enquanto a ligação não vinga, o local continua a projetar; quem troca de
   * transporte é o `socket.on('connect')`, só quando a ligação se estabelece de facto.
   *
   * Sem ponte não há modo local (o painel está num browser, fora do aplicativo), e aí só
   * resta o caminho remoto.
   */
  const ponte = ponteProjecaoLocal();
  if (!ponte) {
    /* Painel num browser: sem motor local, só resta o Servidor. */
    tentarAutoConectarSeDesconectado();
    return;
  }
  /* O arranque é sempre local — o painel abre já a projetar, nunca preso num «conectando».
     Ligar ao Servidor é uma acção manual (badge / Ajustes), e a preferência `'0'` não força
     mais um arranque remoto: quando muito, é o clique do operador que o declara. */
  void ligarProjecaoNestaMaquina().then((r) => {
    if (!r?.ok) {
      /* Local não subiu — porta ocupada, tipicamente porque o Servidor está nesta mesma
         máquina. Só aí resta o caminho remoto. */
      tentarAutoConectarSeDesconectado();
    }
  });
}, 200);

// ════════════════════════════════════════════════════════════
//  Dark Mode + Configurações de Exibição (Controlador remoto)
// ════════════════════════════════════════════════════════════

let appDialogResolver = null;
let appPromptResolver = null;
let appEscolhaResolver = null;
let appCompartilharResolver = null;
let appImportarResolver = null;
let appSincronizarResolver = null;

function fecharAppDialog(resultado) {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const okBtn = document.getElementById('app-dialog-ok');
  if (appSincronizarResolver) {
    const r = appSincronizarResolver;
    appSincronizarResolver = null;
    clearTimeout(modalSincronizarTimerAutoFechar);
    if (body) {
      body.innerHTML = '';
      body.style.whiteSpace = '';
    }
    if (okBtn) {
      okBtn.style.display = '';
      okBtn.textContent = 'OK';
    }
    const cancelBtn = document.getElementById('app-dialog-cancel');
    if (cancelBtn) {
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.style.display = 'none';
    }
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    r(null);
    return;
  }
  if (appImportarResolver) {
    const r = appImportarResolver;
    appImportarResolver = null;
    clearTimeout(modalImportarTimerAutoFechar);
    if (body) {
      body.innerHTML = '';
      body.style.whiteSpace = '';
    }
    if (okBtn) {
      okBtn.style.display = '';
      okBtn.textContent = 'OK';
    }
    const cancelBtn = document.getElementById('app-dialog-cancel');
    if (cancelBtn) {
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.style.display = 'none';
    }
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    r(null);
    return;
  }
  if (appCompartilharResolver) {
    const r = appCompartilharResolver;
    appCompartilharResolver = null;
    if (body) body.innerHTML = '';
    if (body) body.style.whiteSpace = '';
    if (okBtn) okBtn.style.display = '';
    const cancelBtn = document.getElementById('app-dialog-cancel');
    if (cancelBtn) {
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.style.display = 'none';
    }
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    r(null);
    return;
  }
  if (appEscolhaResolver) {
    const r = appEscolhaResolver;
    appEscolhaResolver = null;
    if (body) body.innerHTML = '';
    if (okBtn) okBtn.style.display = '';
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    r(null);
    return;
  }
  if (appPromptResolver) {
    const r = appPromptResolver;
    appPromptResolver = null;
    if (body) body.textContent = '';
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    r(null);
    return;
  }
  if (ov) {
    ov.classList.remove('aberto');
    ov.hidden = true;
  }
  const resolver = appDialogResolver;
  appDialogResolver = null;
  if (resolver) resolver(!!resultado);
}

function abrirAppDialog(msg, opts = {}) {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel) return Promise.resolve(false);
  body.textContent = String(msg || '');
  head.textContent = String(opts.title || 'Lyra');
  ok.textContent = String(opts.okLabel || 'OK');
  cancel.textContent = String(opts.cancelLabel || 'Cancelar');
  cancel.style.display = opts.confirm ? '' : 'none';
  ov.hidden = false;
  ov.classList.add('aberto');
  return new Promise((resolve) => {
    appDialogResolver = resolve;
    ok.onclick = () => fecharAppDialog(true);
    cancel.onclick = () => fecharAppDialog(false);
  });
}

function appAlert(msg, title) {
  return abrirAppDialog(msg, { title: title || 'Lyra', confirm: false });
}

function appConfirm(msg, title) {
  return abrirAppDialog(msg, { title: title || 'Lyra', confirm: true });
}

/** Diálogo com campo de texto; resolve string normalizada ou null (cancelar). */
function appPrompt(msg, opts = {}) {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel) return Promise.resolve(null);
  head.textContent = String(opts.title || 'Lyra');
  ok.textContent = 'OK';
  cancel.textContent = 'Cancelar';
  body.textContent = '';
  const p = document.createElement('p');
  p.style.margin = '0 0 10px 0';
  p.style.fontSize = '13px';
  p.textContent = String(msg || '');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 40;
  input.value = String(opts.defaultValue || '');
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.padding = '8px 10px';
  input.style.borderRadius = '6px';
  input.style.border = '1px solid var(--border)';
  input.style.background = 'var(--surface2)';
  input.style.color = 'var(--text)';
  input.style.fontFamily = 'var(--font-ui)';
  body.appendChild(p);
  body.appendChild(input);
  const err = document.createElement('div');
  err.className = 'app-prompt-err';
  err.style.marginTop = '8px';
  err.style.fontSize = '12px';
  err.style.color = 'var(--danger, #c44)';
  err.style.minHeight = '16px';
  body.appendChild(err);
  cancel.style.display = '';
  ov.hidden = false;
  ov.classList.add('aberto');
  return new Promise((resolve) => {
    appPromptResolver = resolve;
    const fecharOk = () => {
      const v = normalizarTemaPlaylist(input.value);
      if (!v) {
        err.textContent = opts.emptyMsg || 'Digite um nome válido.';
        try {
          input.focus();
        } catch (_) {
  // intencional — erro ignorado
}
        return;
      }
      appPromptResolver = null;
      body.textContent = '';
      ov.classList.remove('aberto');
      ov.hidden = true;
      resolve(v);
    };
    ok.onclick = fecharOk;
    cancel.onclick = () => fecharAppDialog(false);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        fecharOk();
      }
    });
    setTimeout(() => {
      try {
        input.focus();
        input.select();
      } catch (_) {
  // intencional — erro ignorado
}
    }, 50);
  });
}

/** Várias opções com botões; resolve o `value` escolhido ou `null` (cancelar / overlay).
 *  `textoDetalhe` (opcional): parágrafo acima dos botões (use \\n para quebras). */
function appEscolherOpcao(titulo, opcoes, textoDetalhe, opts = {}) {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel || !Array.isArray(opcoes)) return Promise.resolve(null);
  return new Promise((resolve) => {
    appEscolhaResolver = resolve;
    head.textContent = String(titulo || 'Escolher');
    ok.style.display = 'none';
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';
    if (textoDetalhe != null && String(textoDetalhe).trim() !== '') {
      const det = document.createElement('p');
      det.style.margin = '0 0 12px 0';
      det.style.fontSize = '13px';
      det.style.lineHeight = '1.55';
      det.style.whiteSpace = 'pre-line';
      det.style.color = 'var(--text-muted, #7a726b)';
      det.textContent = String(textoDetalhe);
      body.appendChild(det);
    }
    const finish = (v) => {
      if (!appEscolhaResolver) return;
      const r = appEscolhaResolver;
      appEscolhaResolver = null;
      body.innerHTML = '';
      ok.style.display = '';
      ov.classList.remove('aberto');
      ov.hidden = true;
      r(v);
    };
    opcoes.forEach((op) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn primary';
      b.style.width = '100%';
      b.textContent = op.label;
      b.onclick = () => finish(op.value);
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
    cancel.style.display = '';
    cancel.textContent = String(opts.cancelLabel || 'Cancelar');
    cancel.onclick = () => finish(null);
    ov.hidden = false;
    ov.classList.add('aberto');
  });
}

const LYRA_MANUAL_SECTIONS = [
  {
    title: 'Visão geral',
    items: [
      'O Lyra trabalha com duas frentes: o Servidor abre e alimenta as telas de projeção, e o Controlador concentra a operação do culto, evento ou transmissão.',
      'Na rotina normal, deixe o Servidor aberto no computador conectado aos monitores e use o Controlador para selecionar o conteúdo, acompanhar prévias e disparar a projeção.',
    ],
  },
  {
    title: 'Modos disponíveis',
    items: [
      '<strong>Slide:</strong> opera músicas, estrofes, playlist do culto, próxima música e projeção em telão/ministrante.',
      '<strong>Bíblia:</strong> permite buscar livro, capítulo e versículo, navegar rapidamente e projetar textos bíblicos com configuração visual própria.',
      '<strong>Mídias:</strong> projeta imagens, PDFs e apresentações nos cards 1 a 4, vídeo no card 5 (exclusivo para vídeo) e avisos rápidos no card 6 — inclusive em canais separados do telão e do ministrante.',
    ],
  },
  {
    title: 'Onde a projeção acontece',
    items: [
      '<strong>Por padrão, o Lyra projeta nesta máquina.</strong> Ao abrir, ele já assume os monitores deste PC — nada precisa ser configurado, e nenhum servidor precisa estar rodando. É o caso de quem opera no mesmo computador que tem os projetores.',
      'Os monitores secundários ficam <strong>pretos</strong> quando não há nada projetado, com o relógio por cima se você o tiver ligado em Ajustes. Isso é proposital: a área de trabalho do operador nunca aparece no telão.',
      'O menu <strong>Ferramentas → Projetar nesta máquina</strong> mostra e controla esse modo. A marca indica se ele está mesmo de pé.',
      '<strong>Dois PCs:</strong> se os monitores estiverem em outro computador, abra o app <strong>Servidor</strong> nele e, aqui, use <strong>Ferramentas → Conectar a servidor remoto…</strong> (ou Ajustes → Conexão), informe o IP daquele PC e clique em <strong>Conectar</strong>. O Lyra lembra dessa escolha nas próximas aberturas.',
      'Para voltar ao padrão, use <strong>Ferramentas → Projetar nesta máquina</strong>.',
      'O Servidor publica a API principal na porta 5510 e exibe o IP local. Se a conexão cair, revise IP, firewall e rede local — o Lyra foi pensado para uso em LAN confiável, com Servidor e Controlador na mesma rede.',
      'O item <strong>Ferramentas → Reiniciar servidor</strong> só aparece quando você está conectado a um Servidor remoto; ele reinicia esse servidor e aguarda até ele responder novamente.',
      'Os dois modos não podem coexistir na mesma máquina: quem chegar primeiro à porta 5510 fica com ela, e o outro avisa em vez de disputar as telas.',
    ],
  },
  {
    title: 'Projeção nos monitores',
    items: [
      'O roteamento permite escolher onde cada modo será exibido: público (M2), ministrante (M3) ou live/OBS, sem precisar alterar o restante da operação.',
      'No modo Slide, o telão e o ministrante podem continuar ativos ao mesmo tempo; no modo Apresentação, cada mídia pode ser enviada para público, ministrante, ambos ou live.',
      'Use as prévias do painel para confirmar o que está indo para cada destino antes de projetar.',
    ],
  },
  {
    title: 'OBS e modo Live',
    items: [
      'Quando a rota do público estiver em <strong>Live</strong>, o Lyra não usa monitor físico para esse canal e prepara a saída para captura no OBS — ideal quando o texto ou a mídia precisam entrar na cena sem ocupar uma tela física.',
      'Fonte única (traz tudo junto — Bíblia, slides/letra e avisos), para quem usa uma só Browser Source em uma cena: <code>http://127.0.0.1:5001/obs</code>',
      'Fonte só da Bíblia — adicione como Browser Source na cena da pregação: <code>http://127.0.0.1:5001/obs/biblia</code>',
      'Fonte só de slides/letra — adicione como Browser Source na cena de louvor: <code>http://127.0.0.1:5001/obs/slides</code>',
      'A troca de cena continua manual no OBS: o Lyra apenas liga/desliga o conteúdo de cada fonte, e cada Browser Source só aparece quando você seleciona a cena correspondente.',
      'Todas as fontes têm fundo transparente por padrão. Use o campo “Custom CSS” da Browser Source para estilizar cores, fontes e fundo — classes: <code>.biblia-texto</code>, <code>.biblia-referencia</code>, <code>.slide-titulo</code>, <code>.slide-linha</code>.',
    ],
  },
  {
    title: 'Playlist e compartilhamento',
    items: [
      'A playlist fica associada ao culto selecionado e permite organizar ordem, temas, versões e próxima música.',
      'O botão de compartilhamento gera um código temporário da playlist; outro controlador compatível pode importar esse código para receber a mesma seleção.',
      'Esse recurso ajuda a transferir a programação entre máquinas sem exportações manuais.',
    ],
  },
];

const LYRA_SHORTCUT_GROUPS = [
  {
    title: 'Operação principal',
    rows: [
      { keys: ['F10'], action: 'Alterna o blackout das telas de projeção.' },
      {
        keys: ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'],
        action: 'Navega pelos slides ou versículos conforme o modo ativo do painel.',
      },
      {
        keys: ['PageDown', 'ArrowRight', 'ArrowDown', 'Numpad2', 'Numpad6', 'NumpadEnter', 'Enter', 'Space'],
        action: 'Avança a projeção quando usado como passador ou navegação de slides. A tecla Espaço entra apenas no modo Slide.',
      },
      {
        keys: ['PageUp', 'ArrowLeft', 'ArrowUp', 'Numpad4', 'Numpad9', 'Backspace'],
        action: 'Volta a projeção quando usado como passador ou navegação de slides.',
      },
      {
        keys: ['Escape'],
        action: 'No modo Slide, encerra a projeção atual e limpa as telas. No modo Bíblia, fecha a busca rápida aberta ou encerra a projeção bíblica.',
      },
    ],
  },
  {
    title: 'Busca rápida da Bíblia',
    rows: [
      {
        keys: ['Qualquer caractere'],
        action: 'Abre a busca rápida da Bíblia e já preenche o campo com a tecla digitada.',
      },
      {
        keys: ['Backspace'],
        action: 'Abre a busca rápida da Bíblia limpando o texto atual.',
      },
      {
        keys: ['ArrowDown', 'ArrowUp'],
        action: 'Navega entre os livros e resultados da busca rápida.',
      },
      {
        keys: ['Enter'],
        action: 'Confirma o livro, capítulo ou versículo selecionado na busca rápida.',
      },
      {
        keys: ['Escape'],
        action: 'Fecha a busca rápida da Bíblia.',
      },
    ],
  },
  {
    title: 'Menus, modais e telas auxiliares',
    rows: [
      {
        keys: ['Escape'],
        action: 'Fecha calendário de culto, dropdowns, menus de roteamento, menu de contexto do strip, notas por slide, diálogos do app e esta janela de ajuda.',
      },
      {
        keys: ['Enter'],
        action: 'Confirma prompts e renomeações rápidas de itens de áudio, arquivos e campos equivalentes.',
      },
      {
        keys: ['Escape'],
        action: 'Cancela renomeações rápidas e fecha modais contextuais compatíveis.',
      },
    ],
  },
  {
    title: 'Janelas de projeção e servidor',
    rows: [
      {
        keys: ['Escape'],
        action: 'Na janela pública, na janela do ministrante e no display do servidor, encerra a projeção ativa daquela tela.',
      },
    ],
  },
];

const lyraMenuModalState = {
  canClose: true,
};

const lyraServerRestartUiState = {
  emAndamento: false,
  stage: 'idle',
  message: '',
};

function obterLyraMenuModalEls() {
  return {
    overlay: document.getElementById('lyra-menu-modal-overlay'),
    panel: document.getElementById('lyra-menu-modal'),
    eyebrow: document.getElementById('lyra-menu-modal-eyebrow'),
    title: document.getElementById('lyra-menu-modal-title'),
    subtitle: document.getElementById('lyra-menu-modal-subtitle'),
    body: document.getElementById('lyra-menu-modal-body'),
    footer: document.querySelector('#lyra-menu-modal-overlay .lyra-menu-modal-footer'),
    close: document.getElementById('lyra-menu-modal-close'),
    closeX: document.getElementById('lyra-menu-modal-close-x'),
  };
}

function limparVariantesLyraMenuModal(panel) {
  if (!panel) return;
  panel.classList.remove('lyra-menu-modal--wide', 'lyra-menu-modal--about', 'lyra-menu-modal--status');
}

function nomeTeclaPtBrLyra(key) {
  const mapa = {
    ArrowRight: 'Seta Direita',
    ArrowLeft: 'Seta Esquerda',
    ArrowUp: 'Seta para Cima',
    ArrowDown: 'Seta para Baixo',
    PageDown: 'Page Down',
    PageUp: 'Page Up',
    Escape: 'Esc',
    Enter: 'Enter',
    Backspace: 'Retrocesso',
    Space: 'Barra de Espaço',
    NumpadEnter: 'Enter Numérico',
    Numpad2: 'Teclado Numérico 2',
    Numpad4: 'Teclado Numérico 4',
    Numpad6: 'Teclado Numérico 6',
    Numpad9: 'Teclado Numérico 9',
    F10: 'F10',
  };
  return mapa[String(key || '')] || String(key || '');
}

function renderizarAtalhosLyra(keys) {
  const lista = Array.isArray(keys) ? keys : [keys];
  return lista.map((key, idx) => {
    const sep = idx === 0 ? '' : '<span class="lyra-shortcuts-alt">ou</span>';
    return `${sep}<kbd>${escapeHtml(nomeTeclaPtBrLyra(key))}</kbd>`;
  }).join('');
}

function renderizarTabelaAtalhosLyra(rows) {
  return `
    <table class="lyra-shortcuts-table">
      <thead>
        <tr>
          <th>Atalho</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${renderizarAtalhosLyra(row.keys)}</td>
            <td>${escapeHtml(String(row.action || ''))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function montarHtmlManualLyra() {
  return `
    <p>
      Este manual resume o fluxo principal do Lyra com base nas funções já disponíveis no projeto:
      operação por modos, ligação com o servidor, roteamento de monitores, OBS, playlists e
      compartilhamento.
    </p>
    <div class="lyra-doc-grid">
      ${LYRA_MANUAL_SECTIONS.map((section) => `
        <section class="lyra-doc-section">
          <h3>${section.title}</h3>
          <ul class="lyra-doc-list">
            ${section.items.map((item) => `<li>${item}</li>`).join('')}
          </ul>
        </section>
      `).join('')}
    </div>
    <div class="lyra-doc-callout">
      <strong>Dica prática:</strong> para operação estável, abra primeiro o Servidor no computador
      conectado às telas, confira o IP e os monitores configurados, e depois use o Controlador para
      operar Slides, Bíblia, Mídias e playlists no mesmo culto.
    </div>
  `;
}

function montarHtmlAtalhosLyra() {
  return LYRA_SHORTCUT_GROUPS.map((group) => `
    <section class="lyra-shortcuts-group">
      <h3>${group.title}</h3>
      ${renderizarTabelaAtalhosLyra(group.rows)}
    </section>
  `).join('');
}

function montarHtmlSobreLyra(version) {
  const versao = escapeHtml(String(version || 'Não disponível'));
  return `
    <div class="lyra-about-card">
      <div class="lyra-about-hero">
        <img class="lyra-about-icon" src="./images/lyra-logo.png" alt="Ícone do Lyra">
        <div>
          <div class="lyra-about-name">Lyra</div>
          <div class="lyra-about-tagline">Controlador de projeção para igrejas e eventos ao vivo</div>
          <div class="lyra-about-version">Versão ${versao}</div>
        </div>
      </div>
      <div class="lyra-about-body">
        <div class="lyra-about-row">
          <div class="lyra-about-label">Nome</div>
          <div class="lyra-about-value">Lyra</div>
        </div>
        <div class="lyra-about-row">
          <div class="lyra-about-label">Versão</div>
          <div class="lyra-about-value">${versao}</div>
        </div>
        <div class="lyra-about-row">
          <div class="lyra-about-label">Descrição</div>
          <div class="lyra-about-value">Controlador de projeção para igrejas e eventos ao vivo</div>
        </div>
        <div class="lyra-about-row">
          <div class="lyra-about-label">Desenvolvedor</div>
          <div class="lyra-about-value">Alan Pereira</div>
        </div>
        <div class="lyra-about-row">
          <div class="lyra-about-label">Organização</div>
          <div class="lyra-about-value">Ministério de Comunicações — INVB</div>
        </div>
      </div>
    </div>
  `;
}

function montarHtmlStatusReinicioServidor(statusKind, message) {
  const indicadorClasse =
    statusKind === 'success'
      ? 'lyra-status-indicator lyra-status-indicator--success'
      : statusKind === 'error'
        ? 'lyra-status-indicator lyra-status-indicator--error'
        : 'lyra-status-indicator lyra-status-indicator--progress';
  const indicadorTexto = statusKind === 'success' ? 'OK' : statusKind === 'error' ? '!' : '';
  const titulo =
    statusKind === 'success'
      ? 'Servidor disponível'
      : statusKind === 'error'
        ? 'Reinício não concluído'
        : 'Processando reinício';

  return `
    <div class="lyra-status-card">
      <div class="${indicadorClasse}">${indicadorTexto}</div>
      <div class="lyra-status-text">
        <h3>${titulo}</h3>
        <p>${escapeHtml(String(message || 'Aguarde alguns instantes.'))}</p>
      </div>
    </div>
  `;
}

function configurarLyraMenuModal(opts = {}) {
  const els = obterLyraMenuModalEls();
  if (!els.overlay || !els.panel || !els.body || !els.title || !els.close || !els.closeX) return false;

  const variantClass =
    opts.variant === 'about'
      ? 'lyra-menu-modal--about'
      : opts.variant === 'status'
        ? 'lyra-menu-modal--status'
        : 'lyra-menu-modal--wide';
  const canClose = opts.canClose !== false;

  limparVariantesLyraMenuModal(els.panel);
  els.panel.classList.add(variantClass);

  els.title.textContent = String(opts.title || 'Lyra');

  if (els.eyebrow) {
    const mostrarEyebrow = String(opts.eyebrow || '').trim() !== '';
    els.eyebrow.hidden = !mostrarEyebrow;
    els.eyebrow.textContent = mostrarEyebrow ? String(opts.eyebrow) : '';
  }

  if (els.subtitle) {
    const mostrarSubtitle = String(opts.subtitle || '').trim() !== '';
    els.subtitle.hidden = !mostrarSubtitle;
    els.subtitle.textContent = mostrarSubtitle ? String(opts.subtitle) : '';
  }

  els.body.innerHTML = String(opts.html || '');
  els.close.textContent = String(opts.closeLabel || 'Fechar');
  els.close.disabled = !canClose;
  els.closeX.disabled = !canClose;
  els.closeX.hidden = opts.showCloseIcon === false;
  if (els.footer) els.footer.hidden = opts.showFooter === false;

  lyraMenuModalState.canClose = canClose;
  return true;
}

function abrirLyraMenuModal(opts = {}) {
  const els = obterLyraMenuModalEls();
  if (!configurarLyraMenuModal(opts) || !els.overlay) return false;
  els.overlay.hidden = false;
  els.overlay.classList.add('aberto');
  requestAnimationFrame(() => {
    try {
      if (lyraMenuModalState.canClose) {
        (els.closeX.hidden ? els.close : els.closeX)?.focus({ preventScroll: true });
      }
    } catch (_) {
  // intencional — erro ignorado
}
  });
  return true;
}

function atualizarLyraMenuModal(opts = {}) {
  const els = obterLyraMenuModalEls();
  if (!els.overlay) return false;
  if (els.overlay.hidden || !els.overlay.classList.contains('aberto')) {
    return abrirLyraMenuModal(opts);
  }
  return configurarLyraMenuModal(opts);
}

function fecharLyraMenuModal(force = false) {
  const els = obterLyraMenuModalEls();
  if (!els.overlay) return false;
  if (!force && !lyraMenuModalState.canClose) return false;
  els.overlay.classList.remove('aberto');
  els.overlay.hidden = true;
  if (els.body) els.body.innerHTML = '';
  if (els.close) {
    els.close.disabled = false;
    els.close.textContent = 'Fechar';
  }
  if (els.closeX) {
    els.closeX.disabled = false;
    els.closeX.hidden = false;
  }
  lyraMenuModalState.canClose = true;
  return true;
}

async function obterVersaoAppLyra() {
  try {
    const version = await window.lyraElectron?.obterVersaoApp?.();
    return version ? String(version) : 'Não disponível';
  } catch (_) {
    return 'Não disponível';
  }
}

function abrirManualUsuarioLyra() {
  abrirLyraMenuModal({
    variant: 'wide',
    eyebrow: 'Ajuda',
    title: 'Manual básico do Lyra',
    subtitle: 'Resumo de operação do controlador, do servidor e dos fluxos de projeção.',
    html: montarHtmlManualLyra(),
  });
}

function abrirAtalhosLyra() {
  abrirLyraMenuModal({
    variant: 'wide',
    eyebrow: 'Ajuda',
    title: 'Atalhos de teclado',
    subtitle: 'Levantamento dos atalhos já implementados no código do projeto.',
    html: montarHtmlAtalhosLyra(),
  });
}

async function abrirSobreLyra() {
  const version = await obterVersaoAppLyra();
  abrirLyraMenuModal({
    variant: 'about',
    eyebrow: 'Sobre',
    title: 'Lyra',
    subtitle: 'Informações da aplicação.',
    html: montarHtmlSobreLyra(version),
  });
}

function atualizarModalStatusReinicioServidor(stage, message) {
  if (stage) lyraServerRestartUiState.stage = String(stage);
  if (message) lyraServerRestartUiState.message = String(message);

  const kind =
    lyraServerRestartUiState.stage === 'ready'
      ? 'success'
      : lyraServerRestartUiState.stage === 'error'
        ? 'error'
        : 'progress';

  atualizarLyraMenuModal({
    variant: 'status',
    eyebrow: 'Ferramentas',
    title:
      kind === 'success'
        ? 'Servidor reiniciado'
        : kind === 'error'
          ? 'Falha ao reiniciar o servidor'
          : 'Reiniciando servidor',
    subtitle:
      kind === 'success'
        ? 'O servidor local já voltou a responder.'
        : kind === 'error'
          ? 'Confira a mensagem abaixo antes de tentar novamente.'
          : 'Aguarde enquanto o servidor local é reiniciado.',
    html: montarHtmlStatusReinicioServidor(kind, lyraServerRestartUiState.message),
    canClose: kind !== 'progress',
    closeLabel: kind === 'progress' ? 'Aguarde...' : 'Fechar',
    showCloseIcon: kind !== 'progress',
  });
}

async function limparCacheElectronViaMenu() {
  if (typeof window.lyraElectron?.limparCacheElectron !== 'function') {
    await appAlert('Este recurso só está disponível no aplicativo Electron.', 'Limpar cache');
    return;
  }
  try {
    const result = await window.lyraElectron.limparCacheElectron();
    await appAlert(
      String(result?.message || 'Cache e dados temporários limpos com sucesso.'),
      'Limpar cache'
    );
  } catch (err) {
    await appAlert(
      String(err?.message || err || 'Não foi possível limpar o cache da sessão.'),
      'Limpar cache'
    );
  }
}

async function reiniciarServidorLocalViaMenu() {
  if (lyraServerRestartUiState.emAndamento) {
    atualizarModalStatusReinicioServidor(
      lyraServerRestartUiState.stage || 'starting',
      lyraServerRestartUiState.message || 'Já existe um reinício em andamento.'
    );
    return;
  }
  if (typeof window.lyraElectron?.reiniciarServidorLocal !== 'function') {
    await appAlert('Este recurso só está disponível no aplicativo Electron.', 'Reiniciar servidor');
    return;
  }

  lyraServerRestartUiState.emAndamento = true;
  lyraServerRestartUiState.stage = 'starting';
  lyraServerRestartUiState.message = 'Solicitando reinicialização do servidor local...';
  atualizarModalStatusReinicioServidor();

  try {
    const result = await window.lyraElectron.reiniciarServidorLocal();
    lyraServerRestartUiState.stage = 'ready';
    lyraServerRestartUiState.message = String(result?.message || 'Servidor local reiniciado com sucesso.');
    atualizarModalStatusReinicioServidor();
  } catch (err) {
    lyraServerRestartUiState.stage = 'error';
    lyraServerRestartUiState.message = String(
      err?.message || err || 'Não foi possível reiniciar o servidor local.'
    );
    atualizarModalStatusReinicioServidor();
  } finally {
    lyraServerRestartUiState.emAndamento = false;
  }
}

async function tratarComandoMenuLyra(payload) {
  const command = String(payload?.command || '');
  if (!command) return;

  if (command === 'tools-clear-cache') {
    await limparCacheElectronViaMenu();
    return;
  }
  if (command === 'tools-restart-local-server') {
    await reiniciarServidorLocalViaMenu();
    return;
  }
  if (command === 'tools-projetar-nesta-maquina') {
    const r = await alternarProjecaoNestaMaquina();
    if (r && r.ok === false && r.erro) alert(r.erro);
    return;
  }
  /* Leva ao sítio onde o IP se escreve; quem liga é o botão «Conectar» de lá, que é também
     quem grava a preferência do modo remoto. O menu é só o atalho descobrível. */
  if (command === 'tools-conectar-servidor-remoto') {
    abrirCfgModal('conexao');
    document.getElementById('ip-input')?.focus();
    return;
  }
  if (command === 'help-open-manual') {
    abrirManualUsuarioLyra();
    return;
  }
  if (command === 'help-open-shortcuts') {
    abrirAtalhosLyra();
    return;
  }
  if (command === 'help-open-about') {
    await abrirSobreLyra();
  }
}

const lyraUpdaterUiState = {
  downloadEmAndamento: false,
  percentualDownload: 0,
  ultimoPayload: null,
};

function montarTextoDetalhesAtualizacao(payload, incluirPergunta = true) {
  const partes = [];
  const versao = String(payload?.version || '');
  if (versao) {
    partes.push(`Nova versão disponível: ${versao}`);
  } else {
    partes.push('Há uma nova versão disponível para o Lyra Controlador.');
  }
  if (payload?.releaseName) {
    partes.push(`Release: ${String(payload.releaseName)}`);
  }
  if (payload?.notes) {
    partes.push(`Notas da release:\n${String(payload.notes).trim()}`);
  }
  if (lyraUpdaterUiState.downloadEmAndamento) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(lyraUpdaterUiState.percentualDownload || 0))));
    partes.push(`Download em andamento: ${pct}%`);
  }
  if (incluirPergunta) {
    partes.push('Deseja baixar a atualização agora?');
  }
  return partes.join('\n\n');
}

function obterBannerAtualizacaoElementos() {
  let host = document.getElementById('lyra-update-banner');
  if (!host) {
    host = document.createElement('section');
    host.id = 'lyra-update-banner';
    host.hidden = true;
    host.style.position = 'fixed';
    host.style.right = '18px';
    host.style.bottom = '18px';
    host.style.width = 'min(420px, calc(100vw - 36px))';
    host.style.background = 'var(--surface)';
    host.style.border = '1px solid var(--border)';
    host.style.borderRadius = '14px';
    host.style.boxShadow = '0 18px 54px rgba(0, 0, 0, 0.35)';
    host.style.padding = '14px 14px 12px';
    host.style.zIndex = '9500';
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.gap = '10px';

    const titulo = document.createElement('div');
    titulo.id = 'lyra-update-banner-title';
    titulo.style.fontSize = '14px';
    titulo.style.fontWeight = '700';
    titulo.style.color = 'var(--text)';

    const detalhe = document.createElement('div');
    detalhe.id = 'lyra-update-banner-body';
    detalhe.style.fontSize = '13px';
    detalhe.style.lineHeight = '1.5';
    detalhe.style.color = 'var(--text-muted, #7a726b)';
    detalhe.style.whiteSpace = 'pre-line';

    const progressWrap = document.createElement('div');
    progressWrap.id = 'lyra-update-banner-progress-wrap';
    progressWrap.hidden = true;
    progressWrap.style.display = 'flex';
    progressWrap.style.flexDirection = 'column';
    progressWrap.style.gap = '6px';

    const progressLabel = document.createElement('div');
    progressLabel.id = 'lyra-update-banner-progress-label';
    progressLabel.style.fontSize = '12px';
    progressLabel.style.color = 'var(--text-muted, #7a726b)';

    const progress = document.createElement('progress');
    progress.id = 'lyra-update-banner-progress';
    progress.max = 100;
    progress.value = 0;
    progress.style.width = '100%';
    progress.style.height = '12px';

    progressWrap.appendChild(progressLabel);
    progressWrap.appendChild(progress);

    const actions = document.createElement('div');
    actions.id = 'lyra-update-banner-actions';
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.flexWrap = 'wrap';
    actions.style.gap = '8px';

    host.appendChild(titulo);
    host.appendChild(detalhe);
    host.appendChild(progressWrap);
    host.appendChild(actions);
    document.body.appendChild(host);
  }
  return {
    host,
    titulo: document.getElementById('lyra-update-banner-title'),
    detalhe: document.getElementById('lyra-update-banner-body'),
    progressWrap: document.getElementById('lyra-update-banner-progress-wrap'),
    progressLabel: document.getElementById('lyra-update-banner-progress-label'),
    progress: document.getElementById('lyra-update-banner-progress'),
    actions: document.getElementById('lyra-update-banner-actions'),
  };
}

function configurarBannerAtualizacao({ titulo, mensagem, botoes = [], mostrarProgresso = false, progresso = 0 }) {
  const els = obterBannerAtualizacaoElementos();
  if (!els.host || !els.titulo || !els.detalhe || !els.actions) return;
  els.titulo.textContent = titulo;
  els.detalhe.textContent = mensagem;
  els.actions.innerHTML = '';
  botoes.forEach((botao) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn${botao.primary ? ' primary' : ''}`;
    el.textContent = botao.label;
    el.disabled = !!botao.disabled;
    el.onclick = () => {
      if (typeof botao.onClick === 'function') botao.onClick();
    };
    els.actions.appendChild(el);
  });
  if (els.progressWrap && els.progress && els.progressLabel) {
    els.progressWrap.hidden = !mostrarProgresso;
    els.progressWrap.style.display = mostrarProgresso ? 'flex' : 'none';
    els.progress.value = Math.max(0, Math.min(100, Math.round(Number(progresso || 0))));
    els.progressLabel.textContent = mostrarProgresso
      ? `Download em andamento: ${Math.round(Number(progresso || 0))}%`
      : '';
  }
  els.host.hidden = false;
  els.host.style.display = 'flex';
}

function esconderBannerAtualizacao() {
  const els = obterBannerAtualizacaoElementos();
  if (!els.host) return;
  els.host.hidden = true;
  els.host.style.display = 'none';
}

function mostrarBannerAtualizacaoDisponivel(payload) {
  const texto = montarTextoDetalhesAtualizacao(payload, true);
  configurarBannerAtualizacao({
    titulo: 'Atualização disponível',
    mensagem: texto,
    botoes: [
      {
        label: 'Depois',
        onClick: () => esconderBannerAtualizacao(),
      },
      {
        label: 'Atualizar',
        primary: true,
        onClick: async () => {
          lyraUpdaterUiState.downloadEmAndamento = true;
          lyraUpdaterUiState.percentualDownload = 0;
          mostrarBannerProgressoAtualizacao(payload);
          try {
            const ok = await window.lyraElectron?.baixarAtualizacao?.();
            if (!ok) {
              lyraUpdaterUiState.downloadEmAndamento = false;
              esconderBannerAtualizacao();
              await appAlert(
                'Não há atualização pendente para download neste momento.',
                'Atualização'
              );
            }
          } catch (err) {
            lyraUpdaterUiState.downloadEmAndamento = false;
            esconderBannerAtualizacao();
            await appAlert(
              String(err?.message || err || 'Não foi possível iniciar o download da atualização.'),
              'Atualização'
            );
          }
        },
      },
    ],
  });
}

function mostrarBannerProgressoAtualizacao(payload) {
  const texto = montarTextoDetalhesAtualizacao(payload, false);
  configurarBannerAtualizacao({
    titulo: 'Baixando atualização',
    mensagem: texto,
    botoes: [
      {
        label: 'Baixando…',
        primary: true,
        disabled: true,
      },
    ],
    mostrarProgresso: true,
    progresso: lyraUpdaterUiState.percentualDownload,
  });
}

function mostrarBannerAtualizacaoPronta(payload) {
  configurarBannerAtualizacao({
    titulo: 'Atualização pronta',
    mensagem:
      `${montarTextoDetalhesAtualizacao(payload, false)}\n\n` +
      'A atualização já foi baixada. Deseja reiniciar o app agora para concluir a instalação?',
    botoes: [
      {
        label: 'Depois',
        onClick: () => esconderBannerAtualizacao(),
      },
      {
        label: 'Reiniciar agora',
        primary: true,
        onClick: async () => {
          try {
            const ok = await window.lyraElectron?.instalarAtualizacaoAgora?.();
            if (!ok) {
              await appAlert(
                'A atualização ainda não está pronta para instalação.',
                'Atualização'
              );
            }
          } catch (err) {
            await appAlert(
              String(err?.message || err || 'Não foi possível reiniciar para instalar a atualização.'),
              'Atualização'
            );
          }
        },
      },
    ],
  });
}

window.alert = (msg) => { appAlert(msg); };
let currentCfgCtrl = {
  fontSize: 5, lineSpacing: 1.7, autoFitLongLines: false, posX: 'center', posY: 'center',
  publico: {
    bgType: 'solid',
    bgColor: '#f5f2ea',
    bgGradient: 'linear-gradient(135deg, #f5f2ea 0%, #e9e2d4 100%)',
    bgImage: '',
    textColor: '#1c1816',
    fontSize: 5.5,
    lineSpacing: 1.35,
    fillScreen: false,
    wrapLongLines: true,
    autoFitLongLines: false,
  },
  ministrante: {
    bgType: 'solid',
    bgColor: '#000000',
    bgGradient: 'linear-gradient(135deg, #000000 0%, #161616 100%)',
    bgImage: '',
    textColorAtual: '#ffffff',
    textColorProximo: '#f3c15a',
    fontSize: 4.1,
    lineSpacing: 1.35,
    wrapLongLines: true,
    autoFitLongLines: false,
  },
  clock: {
    format: 'HH:MM', fontSize: 13, dateFontSize: 2.4, churchFontSize: 2.4, verseFontSize: 2.4, showClock: true, monitorRelogio: 'ministrante', showDate: true, showChurchName: false, churchName: '',
    showVerse: false, verse: '', bgType: 'solid', bgColor: '#f5f2ea',
    bgGradient: 'linear-gradient(135deg, #1a1816 0%, #2c2420 100%)',
    bgImage: '', textColor: '#1c1816'
  }
};
let cfgAbaAtualCtrl = 'telao';
let cfgSaveTimerCtrl = null;
let cfgDirtyCtrl = false;
let cfgSnapshotSalvoCtrl = '';
let preenchendoForm = false;
carregarSlideCfgInicialDoStorage();

function syncColorSchemeCtrl() {
  try {
    document.documentElement.style.colorScheme = document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';
  } catch (_) {
  // intencional — erro ignorado
}
}

function atualizarIconeTemaCabecalho() {
  const el = document.getElementById('btn-dark-ctrl-letter');
  if (!el) return;
  const isDark = document.documentElement.classList.contains('dark');
  el.textContent = isDark ? '☀' : '☾';
}

function toggleDarkCtrl() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  try { localStorage.setItem(LS_DARK_CTRL, isDark ? '1' : '0'); } catch (_) {
  // intencional — erro ignorado
}
  syncColorSchemeCtrl();
  atualizarIconeTemaCabecalho();
}

// --- SECÇÃO H — Tema escuro, modal de configuração de exibição, atalhos (ex.: Escape) ---
function loadDarkCtrl() {
  try {
    const saved = localStorage.getItem(LS_DARK_CTRL);
    if (saved === '1') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    atualizarIconeTemaCabecalho();
  } catch (_) {
  // intencional — erro ignorado
}
  syncColorSchemeCtrl();
}

function abrirCfgModal(aba) {
  const statusEl = document.getElementById('cfg-status-ctrl');
  if (statusEl) statusEl.textContent = '';
  atualizarVisibilidadeAbasCfgPorModo();
  carregarBibliaCfgDoStorage();
  bibliaPopularFormularioCfg();
  popularFormCfgAvisoCard6();
  void carregarEstadoModoApresentacaoDoServidor().then(() => {
    if (!algumCampoAvisoCard6EmEdicao()) popularFormCfgAvisoCard6();
  });
  const abaEfetiva =
    aba || (ehModoBibliaOperador() ? 'biblia-telao' : cfgAbaAtualCtrl || 'telao');
  mudarAbaCfg(abaEfetiva);
  if (abaEfetiva !== 'conexao' && !ehModoBibliaOperador()) carregarCfgDoServidor();
  atualizarUrlsObs();
  document.getElementById('cfg-modal-overlay-ctrl').classList.add('aberto');
}

async function fecharCfgModal() {
  if (cfgDirtyCtrl) {
    const sair = await appConfirm('Existem alterações não salvas. Deseja sair sem salvar?');
    if (!sair) return;
    try {
      const cfgSalva = JSON.parse(cfgSnapshotSalvoCtrl || '{}');
      currentCfgCtrl = cfgSalva;
      aplicarPreviewCfgNoServidor();
    } catch (_) {
  // intencional — erro ignorado
}
    cfgDirtyCtrl = false;
  }
  document.getElementById('cfg-modal-overlay-ctrl').classList.remove('aberto');
}

function mudarAbaCfg(aba) {
  cfgAbaAtualCtrl = aba;
  atualizarVisibilidadeAbasCfgPorModo();
  CFG_ABAS_CTRL.forEach((a) => {
    const tab = document.getElementById('cfg-tab-ctrl-' + a);
    const panel = document.getElementById('cfg-panel-ctrl-' + a);
    if (tab) tab.classList.toggle('ativo', a === aba);
    if (panel) panel.classList.toggle('ativo', a === aba);
  });
}

async function carregarCfgDoServidor() {
  const ip = hostProjecao();
  if (!ip) return;
  const cfgLocal = carregarSlideCfgDoStorage();
  if (cfgLocal) {
    mesclarSlideCfgNoEstado(cfgLocal);
    const cfg = sanitizarCfgSlidesLocal(currentCfgCtrl);
    cfgSnapshotSalvoCtrl = JSON.stringify(cfg || {});
    cfgDirtyCtrl = false;
    popularFormCfg(cfg);
    if (!ehModoBibliaOperador()) {
      enviarPreviewDisplayConfig(cfg, { modoConfig: 'slides', forcarModo: 'slides' });
    }
    return;
  }
  try {
    /** Config do telão vive na API do app SERVIDOR (5510); :3001 aqui só é o BD local/proxy opcional — evitar GET inexistente. */
    const res = await fetch(`http://${ip}:5510/api/display-config`);
    if (!res.ok) return;
    const cfg = await res.json();
    currentCfgCtrl = cfg;
    cfgSnapshotSalvoCtrl = JSON.stringify(cfg || {});
    cfgDirtyCtrl = false;
    salvarSlideCfgNoStorage();
    popularFormCfg(cfg);
    if (!ehModoBibliaOperador()) {
      enviarPreviewDisplayConfig(cfg, { modoConfig: 'slides', forcarModo: 'slides' });
    }
  } catch (_) {
  // intencional — erro ignorado
}
}

function popularFormCfg(cfg) {
  if (!cfg) return;
  preenchendoForm = true;
  try {
  const fs = document.getElementById('cfg-fontsize-ctrl');
  if (fs) { fs.value = cfg.fontSize || 5; document.getElementById('cfg-fontsize-val-ctrl').textContent = cfg.fontSize || 5; }
  const ls = document.getElementById('cfg-linespacing-ctrl');
  if (ls) { ls.value = cfg.lineSpacing || 1.7; document.getElementById('cfg-linespacing-val-ctrl').textContent = (cfg.lineSpacing || 1.7).toFixed(1); }
  setChkVal('cfg-autofit-long-lines-ctrl', cfg.autoFitLongLines === true);
  setPosCtrlBtn('posX', cfg.posX || 'center');
  setPosCtrlBtn('posY', cfg.posY || 'center');
  const ck = cfg.clock || {};
  const pb = cfg.publico || {};
  const mb = cfg.ministrante || {};
  aplicarPublicoCfgForm(pb);
  setSelVal('cfg-ministrante-bg-type-ctrl', mb.bgType || 'solid');
  setInputVal('cfg-ministrante-bg-color-ctrl', mb.bgColor || '#000000');
  setInputVal('cfg-ministrante-bg-gradient-ctrl', mb.bgGradient || '');
  setInputVal('cfg-ministrante-text-color-atual-ctrl', mb.textColorAtual || '#ffffff');
  setInputVal('cfg-ministrante-text-color-proximo-ctrl', mb.textColorProximo || '#f3c15a');
  const mbFontAtual = mb.fontSizeAtual ?? mb.fontSize ?? 4.1;
  const mbFontProximo = mb.fontSizeProximo ?? mb.fontSize ?? 4.1;
  setInputVal('cfg-ministrante-fontsize-atual-ctrl', mbFontAtual);
  setSpanText('cfg-ministrante-fontsize-atual-val-ctrl', String(mbFontAtual));
  setInputVal('cfg-ministrante-fontsize-proximo-ctrl', mbFontProximo);
  setSpanText('cfg-ministrante-fontsize-proximo-val-ctrl', String(mbFontProximo));
  setInputVal('cfg-ministrante-linespacing-ctrl', mb.lineSpacing || 1.35);
  setSpanText('cfg-ministrante-linespacing-val-ctrl', String(mb.lineSpacing || 1.35));
  setChkVal('cfg-ministrante-wrap-ctrl', mb.wrapLongLines !== false);
  setChkVal('cfg-ministrante-autofit-ctrl', mb.autoFitLongLines === true);
  setSelVal('cfg-clock-format-ctrl', ck.format || 'HH:MM');
  setChkVal('cfg-clock-show-ctrl', ck.showClock !== false);
  setSelVal('cfg-clock-monitor-ctrl', ck.monitorRelogio || 'ministrante');
  setInputVal('cfg-clock-fontsize-ctrl', ck.fontSize || 13);
  setSpanText('cfg-clock-fontsize-val-ctrl', String(ck.fontSize || 13));
  setInputVal('cfg-clock-date-fontsize-ctrl', ck.dateFontSize || 2.4);
  setSpanText('cfg-clock-date-fontsize-val-ctrl', String(ck.dateFontSize || 2.4));
  setInputVal('cfg-clock-church-fontsize-ctrl', ck.churchFontSize || 2.4);
  setSpanText('cfg-clock-church-fontsize-val-ctrl', String(ck.churchFontSize || 2.4));
  setInputVal('cfg-clock-verse-fontsize-ctrl', ck.verseFontSize || 2.4);
  setSpanText('cfg-clock-verse-fontsize-val-ctrl', String(ck.verseFontSize || 2.4));
  setChkVal('cfg-clock-date-ctrl', ck.showDate !== false);
  setChkVal('cfg-clock-church-ctrl', !!ck.showChurchName);
  setInputVal('cfg-church-name-ctrl', ck.churchName || '');
  setChkVal('cfg-clock-verse-ctrl', !!ck.showVerse);
  setInputVal('cfg-verse-ctrl', ck.verse || '');
  setInputVal('cfg-clock-text-color-ctrl', ck.textColor || '#1c1816');
  setSpanText('cfg-clock-text-color-val-ctrl', ck.textColor || '#1c1816');
  setSelVal('cfg-clock-bg-type-ctrl', ck.bgType || 'solid');
  setInputVal('cfg-clock-bg-color-ctrl', ck.bgColor || '#f5f2ea');
  setSpanText('cfg-clock-bg-color-val-ctrl', ck.bgColor || '#f5f2ea');
  setInputVal('cfg-clock-gradient-ctrl', ck.bgGradient || '');
  onClockBgTypeCtrlChange();
  onPublicoBgTypeCtrlChange();
  onMinistranteBgTypeCtrlChange();
  atualizarVisibilidadeCamposRelogio();
  atualizarDependenciaAutoFitPublico();
  } finally {
    preenchendoForm = false;
  }
}

function setSelVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function setChkVal(id, v) { const el = document.getElementById(id); if (el) el.checked = v; }
function setInputVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function setSpanText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function lerNumeroInput(id, fallback) {
  const el = document.getElementById(id);
  const raw = String(el?.value || '').trim().replace(',', '.');
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

/** Feedback imediato no painel de pré-visualização (mesmo critério que `publicProjectionUtils`). */
function aplicarWrapImediato(pb) {
  const elLetrasEl = document.getElementById('pv-live-letras');
  if (!elLetrasEl) return;
  const wrap = pb?.wrapLongLines === true;
  elLetrasEl.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
  elLetrasEl.style.overflowWrap = wrap ? 'anywhere' : 'normal';
  elLetrasEl.style.wordBreak = wrap ? 'break-word' : 'normal';
}

window.setSpanText = setSpanText;
window.setSelVal = setSelVal;
window.setInputVal = setInputVal;
window.setChkVal = setChkVal;
window.lerNumeroInput = lerNumeroInput;
window.debounceSalvarCfg = debounceSalvarCfg;
window.aplicarWrapImediato = aplicarWrapImediato;
window.getCurrentCfgCtrl = () => currentCfgCtrl;
window.setCurrentCfgCtrl = (next) => { currentCfgCtrl = next || {}; };
window.getElLetras = () => elLetras;
try {
  if (typeof window.attachPublicDisplayConfig === 'function') {
    window.attachPublicDisplayConfig(window);
  }
  exporCallbacksParaAtributosHtml({
    onPublicoSlideCfgChange: window.onPublicoSlideCfgChange,
    onPublicoSlideCfgRangeInput: window.onPublicoSlideCfgRangeInput,
  });
} catch (e) {
  console.error('[controller] attachPublicDisplayConfig', e);
}
function atualizarDependenciaAutoFitPublico() {
  const wrap = document.getElementById('cfg-publico-wrap-ctrl');
  const auto = document.getElementById('cfg-publico-autofit-ctrl');
  if (!wrap || !auto) return;
  /** Igual ao telão físico (`publicProjectionUtils`): sem wrap o autoajuste está sempre ligado — reflete só com wrap opcional na UI */
  auto.disabled = !wrap.checked;
  auto.title = wrap.checked ? '' : 'Sem quebra automática da linha longa o telão sempre reduz a fonte até caber na horizontal.';
}

try {
  window.atualizarDependenciaAutoFitPublico = atualizarDependenciaAutoFitPublico;
} catch (_) {
  // intencional — erro ignorado
}

function setPosCtrl(axis, val) {
  if (axis === 'posX') currentCfgCtrl.posX = val;
  else currentCfgCtrl.posY = val;
  setPosCtrlBtn(axis, val);
  debounceSalvarCfg();
}

function setPosCtrlBtn(axis, val) {
  const groupId = axis === 'posX' ? 'cfg-posx-ctrl-group' : 'cfg-posy-ctrl-group';
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.cfg-btn-pos').forEach(b => b.classList.toggle('ativo', b.dataset.val === val));
}

function aplicarCfgRelogio() {
  const ck = currentCfgCtrl.clock || {};
  ck.format       = document.getElementById('cfg-clock-format-ctrl')?.value || 'HH:MM';
  ck.showClock    = document.getElementById('cfg-clock-show-ctrl')?.checked ?? true;
  ck.monitorRelogio = document.getElementById('cfg-clock-monitor-ctrl')?.value || 'ministrante';
  ck.fontSize     = lerNumeroInput('cfg-clock-fontsize-ctrl', ck.fontSize ?? 13);
  ck.dateFontSize = lerNumeroInput('cfg-clock-date-fontsize-ctrl', ck.dateFontSize ?? 2.4);
  ck.churchFontSize = lerNumeroInput('cfg-clock-church-fontsize-ctrl', ck.churchFontSize ?? 2.4);
  ck.verseFontSize = lerNumeroInput('cfg-clock-verse-fontsize-ctrl', ck.verseFontSize ?? 2.4);
  ck.showDate     = document.getElementById('cfg-clock-date-ctrl')?.checked ?? true;
  ck.showChurchName = document.getElementById('cfg-clock-church-ctrl')?.checked ?? false;
  ck.churchName   = document.getElementById('cfg-church-name-ctrl')?.value || '';
  ck.showVerse    = document.getElementById('cfg-clock-verse-ctrl')?.checked ?? false;
  ck.verse        = document.getElementById('cfg-verse-ctrl')?.value || '';
  const tcEl = document.getElementById('cfg-clock-text-color-ctrl');
  if (tcEl) { ck.textColor = tcEl.value; setSpanText('cfg-clock-text-color-val-ctrl', tcEl.value); }
  const bgColEl = document.getElementById('cfg-clock-bg-color-ctrl');
  if (bgColEl) { ck.bgColor = bgColEl.value; setSpanText('cfg-clock-bg-color-val-ctrl', bgColEl.value); }
  ck.bgGradient   = document.getElementById('cfg-clock-gradient-ctrl')?.value || '';
  currentCfgCtrl.clock = ck;
  setSpanText('cfg-clock-fontsize-val-ctrl', String(ck.fontSize));
  setSpanText('cfg-clock-date-fontsize-val-ctrl', String(ck.dateFontSize));
  setSpanText('cfg-clock-church-fontsize-val-ctrl', String(ck.churchFontSize));
  setSpanText('cfg-clock-verse-fontsize-val-ctrl', String(ck.verseFontSize));
  atualizarVisibilidadeCamposRelogio();
  debounceSalvarCfg();
}

function onClockFontSizeCtrlInput() {
  const val = lerNumeroInput('cfg-clock-fontsize-ctrl', currentCfgCtrl.clock?.fontSize ?? 13);
  if (!currentCfgCtrl.clock) currentCfgCtrl.clock = {};
  currentCfgCtrl.clock.fontSize = val;
  setSpanText('cfg-clock-fontsize-val-ctrl', String(val));
  debounceSalvarCfg();
}

function onClockDateFontSizeCtrlInput() {
  const val = lerNumeroInput('cfg-clock-date-fontsize-ctrl', currentCfgCtrl.clock?.dateFontSize ?? 2.4);
  if (!currentCfgCtrl.clock) currentCfgCtrl.clock = {};
  currentCfgCtrl.clock.dateFontSize = val;
  setSpanText('cfg-clock-date-fontsize-val-ctrl', String(val));
  debounceSalvarCfg();
}

function onClockChurchFontSizeCtrlInput() {
  const val = lerNumeroInput('cfg-clock-church-fontsize-ctrl', currentCfgCtrl.clock?.churchFontSize ?? 2.4);
  if (!currentCfgCtrl.clock) currentCfgCtrl.clock = {};
  currentCfgCtrl.clock.churchFontSize = val;
  setSpanText('cfg-clock-church-fontsize-val-ctrl', String(val));
  debounceSalvarCfg();
}

function onClockVerseFontSizeCtrlInput() {
  const val = lerNumeroInput('cfg-clock-verse-fontsize-ctrl', currentCfgCtrl.clock?.verseFontSize ?? 2.4);
  if (!currentCfgCtrl.clock) currentCfgCtrl.clock = {};
  currentCfgCtrl.clock.verseFontSize = val;
  setSpanText('cfg-clock-verse-fontsize-val-ctrl', String(val));
  debounceSalvarCfg();
}

function onPublicoBgTypeCtrlChange() {
  if (!currentCfgCtrl.publico) currentCfgCtrl.publico = {};
  const val = document.getElementById('cfg-publico-bg-type-ctrl')?.value || 'solid';
  currentCfgCtrl.publico.bgType = val;
  if (val !== 'image') currentCfgCtrl.publico.bgImage = '';
  const solid = document.getElementById('cfg-publico-bg-solid-ctrl');
  const grad = document.getElementById('cfg-publico-bg-gradient-wrap-ctrl');
  const img = document.getElementById('cfg-publico-bg-image-wrap-ctrl');
  if (solid) solid.style.display = val === 'solid' ? '' : 'none';
  if (grad) grad.style.display = val === 'gradient' ? '' : 'none';
  if (img) img.style.display = val === 'image' ? '' : 'none';
  debounceSalvarCfg();
}

function onMinistranteBgTypeCtrlChange() {
  if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
  const val = document.getElementById('cfg-ministrante-bg-type-ctrl')?.value || 'solid';
  currentCfgCtrl.ministrante.bgType = val;
  if (val !== 'image') currentCfgCtrl.ministrante.bgImage = '';
  const solid = document.getElementById('cfg-ministrante-bg-solid-ctrl');
  const grad = document.getElementById('cfg-ministrante-bg-gradient-wrap-ctrl');
  const img = document.getElementById('cfg-ministrante-bg-image-wrap-ctrl');
  if (solid) solid.style.display = val === 'solid' ? '' : 'none';
  if (grad) grad.style.display = val === 'gradient' ? '' : 'none';
  if (img) img.style.display = val === 'image' ? '' : 'none';
  debounceSalvarCfg();
}

function onPublicoBgColorCtrlInput() {
  if (!currentCfgCtrl.publico) currentCfgCtrl.publico = {};
  currentCfgCtrl.publico.bgColor = document.getElementById('cfg-publico-bg-color-ctrl')?.value || '#f5f2ea';
  debounceSalvarCfg();
}

function onPublicoBgGradientCtrlInput() {
  if (!currentCfgCtrl.publico) currentCfgCtrl.publico = {};
  currentCfgCtrl.publico.bgGradient = document.getElementById('cfg-publico-bg-gradient-ctrl')?.value || '';
  debounceSalvarCfg();
}

function onMinistranteBgColorCtrlInput() {
  if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
  currentCfgCtrl.ministrante.bgColor = document.getElementById('cfg-ministrante-bg-color-ctrl')?.value || '#000000';
  debounceSalvarCfg();
}

function onMinistranteBgGradientCtrlInput() {
  if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
  currentCfgCtrl.ministrante.bgGradient = document.getElementById('cfg-ministrante-bg-gradient-ctrl')?.value || '';
  debounceSalvarCfg();
}

function onPublicoBgImageCtrlChange() {
  const file = document.getElementById('cfg-publico-bg-image-ctrl')?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (!currentCfgCtrl.publico) currentCfgCtrl.publico = {};
    currentCfgCtrl.publico.bgImage = e.target.result;
    debounceSalvarCfg();
  };
  reader.readAsDataURL(file);
}


function onMinistranteSlideCfgChange() {
  if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
  currentCfgCtrl.ministrante.textColorAtual =
    document.getElementById('cfg-ministrante-text-color-atual-ctrl')?.value || '#ffffff';
  currentCfgCtrl.ministrante.textColorProximo =
    document.getElementById('cfg-ministrante-text-color-proximo-ctrl')?.value || '#f3c15a';
  currentCfgCtrl.ministrante.fontSizeAtual = lerNumeroInput(
    'cfg-ministrante-fontsize-atual-ctrl',
    currentCfgCtrl.ministrante.fontSizeAtual ?? currentCfgCtrl.ministrante.fontSize ?? 4.1
  );
  currentCfgCtrl.ministrante.fontSizeProximo = lerNumeroInput(
    'cfg-ministrante-fontsize-proximo-ctrl',
    currentCfgCtrl.ministrante.fontSizeProximo ?? currentCfgCtrl.ministrante.fontSize ?? 4.1
  );
  currentCfgCtrl.ministrante.lineSpacing = lerNumeroInput(
    'cfg-ministrante-linespacing-ctrl',
    currentCfgCtrl.ministrante.lineSpacing ?? 1.35
  );
  currentCfgCtrl.ministrante.wrapLongLines = !!document.getElementById('cfg-ministrante-wrap-ctrl')?.checked;
  currentCfgCtrl.ministrante.autoFitLongLines = !!document.getElementById('cfg-ministrante-autofit-ctrl')?.checked;
  setSpanText('cfg-ministrante-fontsize-atual-val-ctrl', String(currentCfgCtrl.ministrante.fontSizeAtual));
  setSpanText('cfg-ministrante-fontsize-proximo-val-ctrl', String(currentCfgCtrl.ministrante.fontSizeProximo));
  setSpanText('cfg-ministrante-linespacing-val-ctrl', String(currentCfgCtrl.ministrante.lineSpacing));
  debounceSalvarCfg();
}

function onMinistranteBgImageCtrlChange() {
  const file = document.getElementById('cfg-ministrante-bg-image-ctrl')?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (!currentCfgCtrl.ministrante) currentCfgCtrl.ministrante = {};
    currentCfgCtrl.ministrante.bgImage = e.target.result;
    debounceSalvarCfg();
  };
  reader.readAsDataURL(file);
}

function atualizarVisibilidadeCamposRelogio() {
  const showChurch = document.getElementById('cfg-clock-church-ctrl')?.checked;
  const showVerse  = document.getElementById('cfg-clock-verse-ctrl')?.checked;
  const cng = document.getElementById('cfg-church-name-group-ctrl');
  const vg  = document.getElementById('cfg-verse-group-ctrl');
  if (cng) cng.style.display = showChurch ? '' : 'none';
  if (vg)  vg.style.display  = showVerse  ? '' : 'none';
}

function onClockBgTypeCtrlChange() {
  const val = document.getElementById('cfg-clock-bg-type-ctrl')?.value || 'solid';
  if (!currentCfgCtrl.clock) currentCfgCtrl.clock = {};
  currentCfgCtrl.clock.bgType = val;
  if (val !== 'image') currentCfgCtrl.clock.bgImage = '';
  const solid    = document.getElementById('cfg-bg-solid-ctrl');
  const gradient = document.getElementById('cfg-bg-gradient-ctrl');
  const image    = document.getElementById('cfg-bg-image-ctrl');
  if (solid)    solid.style.display    = val === 'solid'    ? '' : 'none';
  if (gradient) gradient.style.display = val === 'gradient' ? '' : 'none';
  if (image)    image.style.display    = val === 'image'    ? '' : 'none';
  debounceSalvarCfg();
}

function onClockBgImageCtrlChange() {
  const file = document.getElementById('cfg-clock-image-ctrl')?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (currentCfgCtrl.clock) currentCfgCtrl.clock.bgImage = e.target.result;
    debounceSalvarCfg();
  };
  reader.readAsDataURL(file);
}

function aplicarPreviewCfgNoServidor() {
  if (ehModoBibliaOperador()) return;
  salvarSlideCfgNoStorage();
  enviarPreviewDisplayConfig(currentCfgCtrl, { modoConfig: 'slides', forcarModo: 'slides' });
}

function debounceSalvarCfg() {
  if (preenchendoForm) return;
  clearTimeout(cfgSaveTimerCtrl);
  cfgDirtyCtrl = JSON.stringify(currentCfgCtrl || {}) !== cfgSnapshotSalvoCtrl;
  cfgSaveTimerCtrl = setTimeout(() => {
    if (ehModoBibliaOperador()) {
      salvarSlideCfgNoStorage();
      enviarPreviewDisplayConfig({ clock: currentCfgCtrl?.clock || {} }, {
        modoConfig: 'slides',
        forcarModo: 'slides',
      });
      return;
    }
    aplicarPreviewCfgNoServidor();
  }, 60);
}

async function salvarCfgNoServidor() {
  const ip = hostProjecao();
  const statusEl = document.getElementById('cfg-status-ctrl');
  if (!ip) { if (statusEl) statusEl.textContent = 'Sem IP configurado'; return; }

  if (ehModoBibliaOperador()) {
    lerBibliaCfgDoFormularioPublico();
    lerBibliaCfgDoFormularioMinistrante();
    salvarBibliaCfgNoStorage();
    const payloadBiblia = {
      ...bibliaPayloadCfgExibicao(),
      modoConfig: 'biblia',
      forcarModo: 'biblia',
    };
    if (projecao.pronta()) {
      projecao.enviar('set_display_config', { clock: currentCfgCtrl?.clock || {}, modoConfig: 'slides' });
      projecao.enviar('set_display_config', payloadBiblia, (ack) => {
        if (statusEl) statusEl.textContent = ack?.ok ? 'Salvo ✓' : 'Erro ao salvar';
        if (ack?.ok) {
          cfgDirtyCtrl = false;
          salvarSlideCfgNoStorage();
          fecharCfgModal();
        }
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
      });
      return;
    }
    try {
      const res = await fetch(`http://${ip}:5510/api/display-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBiblia),
      });
      if (statusEl) statusEl.textContent = res.ok ? 'Salvo ✓' : 'Erro ao salvar';
      if (res.ok) {
        cfgDirtyCtrl = false;
        salvarSlideCfgNoStorage();
        fecharCfgModal();
      }
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    } catch (_) {
      if (statusEl) statusEl.textContent = 'Erro de rede';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    }
    return;
  }

  if (projecao.pronta()) {
    const payloadSlides = {
      ...(currentCfgCtrl || {}),
      modoConfig: 'slides',
      forcarModo: 'slides',
    };
    projecao.enviar('set_display_config', payloadSlides, (ack) => {
      if (statusEl) statusEl.textContent = ack?.ok ? 'Salvo ✓' : 'Erro ao salvar';
      if (ack?.ok) {
        cfgSnapshotSalvoCtrl = JSON.stringify(currentCfgCtrl || {});
        cfgDirtyCtrl = false;
        salvarSlideCfgNoStorage();
        fecharCfgModal();
      }
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    });
    return;
  }
  try {
    const res = await fetch(`http://${ip}:5510/api/display-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentCfgCtrl)
    });
    if (statusEl) statusEl.textContent = res.ok ? 'Salvo ✓' : 'Erro ao salvar';
    if (res.ok) {
      cfgSnapshotSalvoCtrl = JSON.stringify(currentCfgCtrl || {});
      cfgDirtyCtrl = false;
      salvarSlideCfgNoStorage();
      fecharCfgModal();
    }
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  } catch (_) {
    if (statusEl) statusEl.textContent = 'Erro de rede';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  }
}

loadDarkCtrl();

window.bibliaCfgExibicao = bibliaCfgExibicao;
window.bibliaCfgMinistrante = bibliaCfgMinistrante;

function bootOverlaysEAppDialogCtrl() {
  try {
    liberarBloqueioUiModos();
  } catch (_) {
  // intencional — erro ignorado
}
  document.getElementById('lyra-menu-modal-close')?.addEventListener('click', () => fecharLyraMenuModal());
  document.getElementById('lyra-menu-modal-close-x')?.addEventListener('click', () => fecharLyraMenuModal());
  document.getElementById('lyra-menu-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'lyra-menu-modal-overlay') fecharLyraMenuModal();
  });
  document.getElementById('app-dialog-overlay')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'app-dialog-overlay') fecharAppDialog(false);
  });
}
function bootVozSlidesModo() {
  reconhecimentoVozSlides.initDom();
  reconhecimentoVozBiblia.initDom();
  if (ehModoSlidesOperador()) reconhecimentoVozSlides.aoEntrarModoSlides();
  else if (ehModoApresentacaoOperador()) reconhecimentoVozSlides.aoEntrarModoApresentacao();
  else if (ehModoBibliaOperador()) reconhecimentoVozBiblia.aoEntrarModoBiblia();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bootOverlaysEAppDialogCtrl();
    bootVozSlidesModo();
  });
} else {
  bootOverlaysEAppDialogCtrl();
  bootVozSlidesModo();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const lyraMenuModal = document.getElementById('lyra-menu-modal-overlay');
    if (lyraMenuModal && lyraMenuModal.classList.contains('aberto')) {
      e.preventDefault();
      fecharLyraMenuModal();
      return;
    }
    const appDialog = document.getElementById('app-dialog-overlay');
    if (appDialog && appDialog.classList.contains('aberto')) {
      e.preventDefault();
      fecharAppDialog(false);
      return;
    }
    const overlay = document.getElementById('cfg-modal-overlay-ctrl');
    if (overlay && overlay.classList.contains('aberto')) {
      const ativo = document.activeElement;
      if (ativo && /^(INPUT|TEXTAREA|SELECT)$/i.test(ativo.tagName)) {
        return;
      }
      fecharCfgModal();
    }
  }
});


/* ─────────────────────────────────────────────────────────────────────────
   Equilíbrio das laterais do cabeçalho.

   O dock de navegação está na coluna central de um grid
   `minmax(0,1fr) auto minmax(0,1fr)`, ou seja, no centro real da barra.
   Mas o vazio à esquerda e à direita do dock só é simétrico se os dois
   blocos laterais tiverem a mesma largura — e o bloco de status muda de
   largura conforme o texto («CONECTADO» vs «SERVIDOR NÃO ENCONTRADO»).

   Em vez de fixar um número no CSS, espelhamos a largura medida do bloco
   de status na `min-width` do bloco do logo, via `--hdr-side-w`.
   ───────────────────────────────────────────────────────────────────────── */
function sincronizarLarguraLateraisCabecalho() {
  const header = document.querySelector('.app-header');
  const status = document.querySelector('.app-header-right .status-conn-wrap');
  if (!header || !status) return;
  const larguraStatus = Math.ceil(status.getBoundingClientRect().width);
  if (!Number.isFinite(larguraStatus) || larguraStatus <= 0) return;
  header.style.setProperty('--hdr-side-w', `${larguraStatus}px`);
}

(function observarLarguraLateraisCabecalho() {
  const aplicar = () => sincronizarLarguraLateraisCabecalho();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicar, { once: true });
  } else {
    aplicar();
  }
  /* O texto do status muda com a ligação; o ResizeObserver reage a isso e a
     mudanças de zoom/janela sem precisar de hooks espalhados pelo código. */
  if (typeof ResizeObserver === 'function') {
    const alvo = document.querySelector('.app-header-right .status-conn-wrap');
    if (alvo) new ResizeObserver(aplicar).observe(alvo);
  }
  window.addEventListener('resize', aplicar);
})();
