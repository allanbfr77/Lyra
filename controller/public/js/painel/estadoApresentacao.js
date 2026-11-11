/**
 * Mídias: estado do modo apresentação — coletar e aplicar, gravar no armazenamento local, carregar do
 * servidor e sincronizar com ele. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda
 * possui entra por `registrarDependenciasEstadoApresentacao`.
 */
import { LS_APRESENTACAO_STATE } from '../modules/chavesArmazenamentoLocal.js';
import { PLAYLIST_ATRASOS_PERMITIDOS, cancelarAvancoAutoPlaylist, renderListaPlaylistApresentacao } from './playlistVideoApresentacao.js';
import { cfgAvisoCard6TemPersonalizacao, normalizarCfgAvisoCard6, normalizarItemApresentacao as normalizarItemApresentacaoPuro } from '../modules/midiaApresentacao.js';
import { popularFormCfgAvisoCard6 } from './configExibicao.js';
import { renderGridApresentacao } from './gridApresentacao.js';
import { renderListaAudiosApresentacao, renderMenuApresentacao } from './bibliotecaMidiasApresentacao.js';
import { restaurarItemVideoApresentacao } from './videoApresentacao.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasEstadoApresentacao(d) {
  dep = d || {};
}
const algumCampoAvisoCard6EmEdicao = (...a) => dep.algumCampoAvisoCard6EmEdicao(...a);
const aplicarExtrasModoApresentacao = (...a) => dep.aplicarExtrasModoApresentacao(...a);
const ehModoApresentacaoOperador = (...a) => dep.ehModoApresentacaoOperador(...a);
const encerrarProjecaoModoApresentacao = (...a) => dep.encerrarProjecaoModoApresentacao(...a);
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const hostProjecao = (...a) => dep.hostProjecao(...a);
const modoRoteamentoAtual = (...a) => dep.modoRoteamentoAtual(...a);
const normalizarRota = (...a) => dep.normalizarRota(...a);
const renderRoteamentoTelas = (...a) => dep.renderRoteamentoTelas(...a);
const salvarAvisoCard6CfgNoStorage = (...a) => dep.salvarAvisoCard6CfgNoStorage(...a);

let audioResumeVisualGuard = null;

let syncApresentacaoTimer = null;
let syncApresentacaoInFlight = false;
let syncApresentacaoPending = false;

export function limparGuardaVisualRetomadaAudio() {
  audioResumeVisualGuard = null;
}

export function armarGuardaVisualRetomadaAudio(itemId, currentTime) {
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

export function ajustarEstadoVisualRetomadaAudio(st, estadoAnterior) {
  const guard = audioResumeVisualGuard;
  if (!guard) return st;
  if (performance.now() > guard.expiresAt) {
    limparGuardaVisualRetomadaAudio();
    return st;
  }
  if (guard.itemId !== String(dep.getApresentacaoAudioAtualId() || '')) {
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

export function normalizarItemApresentacao(raw) {
  return normalizarItemApresentacaoPuro(raw, getControllerApiBase());
}

export async function encerrarModoApresentacaoNoTelao() {
  await encerrarProjecaoModoApresentacao();
}

function coletarEstadoModoApresentacaoAtual() {
  return {
    biblioteca: (dep.getApresentacaoBiblioteca() || []).map((it) => normalizarItemApresentacao(it)).filter(Boolean),
    cards: Array.from({ length: 6 }, (_, i) => {
      if (i === 5) return null;
      return normalizarItemApresentacao(dep.getApresentacaoCards()?.[i] || null);
    }),
    audios: (dep.getApresentacaoAudios() || []).map((it) => normalizarItemApresentacao(it)).filter((it) => it && it.kind === 'audio'),
    arquivoSelecionadoId: dep.getApresentacaoArquivoSelecionadoId() || '',
    audioSelecionadoId: dep.getApresentacaoAudioAtualId() || '',
    videoPlaylist: {
      modo: dep.getPlaylistVideoModo() === 'auto' ? 'auto' : 'manual',
      atrasoAuto: PLAYLIST_ATRASOS_PERMITIDOS.includes(Number(dep.getPlaylistVideoAtrasoAuto()))
        ? Number(dep.getPlaylistVideoAtrasoAuto())
        : 0,
      itens: (dep.getApresentacaoVideoPlaylist() || [])
        .map((it) => {
          const base = normalizarItemApresentacao(it);
          if (!base || base.kind !== 'video') return null;
          if (Number(it && it.duracao) > 0) base.duracao = Number(it.duracao);
          return base;
        })
        .filter(Boolean),
    },
    extras: {
      audioLoop: !!dep.getAudioLoopAtivo(),
      /* As quatro áreas do card 4 vão nos extras, e não em `cards`: assim o formato de
         `cards` (seis posições, uma mídia cada) continua o mesmo para quem o lê — o
         storage e o estado partilhado com os outros controladores. */
      card4Imagens: Array.from({ length: 4 }, (_, i) =>
        normalizarItemApresentacao(dep.getApresentacaoCard4Imagens()?.[i] || null)),
      card6AvisoTexto: dep.getApresentacaoCard6Texto(),
      card6AvisoConfig: normalizarCfgAvisoCard6(dep.getApresentacaoCard6AvisoCfg()),
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
  dep.setApresentacaoBiblioteca(biblioteca);
  dep.setApresentacaoCards(cards);
  dep.setApresentacaoAudios(audios);
  const vp = p.videoPlaylist && typeof p.videoPlaylist === 'object' ? p.videoPlaylist : {};
  dep.setPlaylistVideoModo(vp.modo === 'auto' ? 'auto' : 'manual');
  dep.setPlaylistVideoAtrasoAuto(PLAYLIST_ATRASOS_PERMITIDOS.includes(Math.round(Number(vp.atrasoAuto)))
    ? Math.round(Number(vp.atrasoAuto))
    : 0);
  dep.setApresentacaoVideoPlaylist(Array.isArray(vp.itens)
    ? vp.itens
        .map((raw) => {
          const base = normalizarItemApresentacao(raw);
          if (!base || base.kind !== 'video') return null;
          if (raw && Number(raw.duracao) > 0) base.duracao = Number(raw.duracao);
          return base;
        })
        .filter(Boolean)
    : []);
  cancelarAvancoAutoPlaylist();
  dep.setPlaylistVideoIndice(-1);
  dep.setPlaylistVideoAtiva(false);
  dep.set_playlistUiTocandoCache(null);
  const v5 = dep.getApresentacaoCards()[dep.getAPRESENTACAO_IDX_CARD5()];
  if (v5?.kind === 'video') {
    void restaurarItemVideoApresentacao(v5).then((it) => {
      if (!it) return;
      dep.getApresentacaoCards()[dep.getAPRESENTACAO_IDX_CARD5()] = it;
      salvarEstadoModoApresentacaoNoStorage();
      if (ehModoApresentacaoOperador()) renderGridApresentacao();
    });
  }
  const arqSel = String(p.arquivoSelecionadoId || '');
  const audSel = String(p.audioSelecionadoId || '');
  dep.setApresentacaoArquivoSelecionadoId(arqSel && biblioteca.some((it) => it.id === arqSel) ? arqSel : null);
  dep.setApresentacaoAudioAtualId(audSel && audios.some((it) => it.id === audSel) ? audSel : null);
  aplicarExtrasModoApresentacao(p.extras, {
    skipCard6Aviso: !!opts.skipCard6Extras,
    skipCard6AvisoConfig: !!opts.skipCard6Extras,
  });
  /* Estado gravado antes de o card 4 se dividir em quatro: o ficheiro que ocupava o card
     inteiro passa para a primeira das áreas, em vez de desaparecer do painel sem aviso.
     Daí em diante o slot 3 de `apresentacaoCards` fica sempre vazio. */
  const legadoCard4 = dep.getApresentacaoCards()[dep.getAPRESENTACAO_IDX_CARD4()];
  if (legadoCard4 && !dep.getApresentacaoCard4Imagens().some(Boolean)) {
    dep.getApresentacaoCard4Imagens()[0] = legadoCard4;
  }
  dep.getApresentacaoCards()[dep.getAPRESENTACAO_IDX_CARD4()] = null;
  if (ehModoApresentacaoOperador()) {
    const modo = modoRoteamentoAtual();
    renderRoteamentoTelas(dep.getMonitoresServidorCache(), normalizarRota(dep.getRotasPorModo()[modo]));
  }
}

let _salvarEstadoApresentacaoTimer = null;
let _avisouQuotaApresentacao = false;

/**
 * Grava mesmo. Só o agendador abaixo e o `beforeunload` chamam isto directamente.
 */
export function gravarEstadoModoApresentacaoNoStorageAgora() {
  clearTimeout(_salvarEstadoApresentacaoTimer);
  _salvarEstadoApresentacaoTimer = null;
  try {
    localStorage.setItem(LS_APRESENTACAO_STATE, JSON.stringify(coletarEstadoModoApresentacaoAtual()));
    _avisouQuotaApresentacao = false;
  } catch (e) {
    /*
     * Isto falhava em silêncio, e o silêncio escondia um problema real: com a mídia
     * embutida em base64, um único áudio já leva o estado para lá dos ~5 MB de quota do
     * localStorage, a gravação nunca acontece — e o custo de a tentar (serializar dezenas
     * de MB) é pago à mesma. Enquanto a mídia não sair do estado, que ao menos deixe rasto.
     */
    if (!_avisouQuotaApresentacao) {
      _avisouQuotaApresentacao = true;
      console.warn(
        '[Lyra] estado do modo Mídias não foi gravado no localStorage:',
        (e && e.name) || '',
        (e && e.message) || ''
      );
    }
  }
  salvarAvisoCard6CfgNoStorage();
  agendarSincronizacaoEstadoModoApresentacaoServidor();
}

/**
 * Agenda a gravação do estado do modo Mídias.
 *
 * Havia 31 pontos a chamar a gravação directa, e cada uma serializa o estado inteiro —
 * biblioteca, cards, áudios e playlist, com a mídia em base64 lá dentro. Adicionar 10
 * áudios chamava-a 10 vezes sobre um objecto que crescia a cada volta: trabalho
 * quadrático sobre dezenas de MB, medido em ~4 s numa máquina rápida.
 *
 * O debounce é de arrasto: chamadas seguidas empurram a gravação para a frente, e um
 * lote inteiro rende uma escrita só. Quem precisa de gravar já — sair da janela —
 * chama `gravarEstadoModoApresentacaoNoStorageAgora`.
 */
export function salvarEstadoModoApresentacaoNoStorage() {
  clearTimeout(_salvarEstadoApresentacaoTimer);
  _salvarEstadoApresentacaoTimer = setTimeout(gravarEstadoModoApresentacaoNoStorageAgora, 200);
}

/**
 * Debounce da gravação ao digitar avisos (Card 6). Persistir o estado inteiro do modo
 * Apresentação (biblioteca, cards, áudios, playlist — imagens podem ser base64) a cada tecla
 * trava a digitação. O texto já é atualizado em memória na hora; aqui só adiamos a gravação.
 */
let _salvarEstadoAposDigitarAvisoTimer = null;
export function agendarSalvarEstadoAposDigitarAviso() {
  if (_salvarEstadoAposDigitarAvisoTimer) clearTimeout(_salvarEstadoAposDigitarAvisoTimer);
  _salvarEstadoAposDigitarAvisoTimer = setTimeout(() => {
    _salvarEstadoAposDigitarAvisoTimer = null;
    salvarEstadoModoApresentacaoNoStorage();
  }, 350);
}
export function flushSalvarEstadoAposDigitarAviso() {
  if (!_salvarEstadoAposDigitarAvisoTimer) return;
  clearTimeout(_salvarEstadoAposDigitarAvisoTimer);
  _salvarEstadoAposDigitarAvisoTimer = null;
  salvarEstadoModoApresentacaoNoStorage();
}

export function carregarEstadoModoApresentacaoDoStorage() {
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

export async function carregarEstadoModoApresentacaoDoServidor() {
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
