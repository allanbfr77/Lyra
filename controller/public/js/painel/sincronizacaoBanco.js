/**
 * Sincronização do banco compartilhado: snapshot local/servidor, modal de sincronização, PC parceiro e
 * pedidos de sincronização. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda
 * possui entra por `registrarDependenciasSincronizacaoBanco`.
 */
import { LS_CULTOS_MANUAIS, LS_PLAYLISTS, LS_PLAYLIST_ABERTURA_REMOVIDA, LS_PLAYLIST_MINISTRANTE_PADRAO, LS_PLAYLIST_TEMAS } from '../modules/chavesArmazenamentoLocal.js';
import { appAlert, appDialogEstado, appEscolherOpcao, appPrompt, fecharAppDialog } from './appDialog.js';
import { carregarMinistrantesDoServidor, normalizarMinistrantePadraoPorCulto } from '../modules/playlistMinistranteTom.js';
import { carregarMusicas, refreshListaBanco } from './bibliotecaMusicas.js';
import { getAberturaRemovidaPorCulto, mapaMinistrantePadraoPersistivel, podarMinistrantePadraoSemMusicasNaPlaylist, setAberturaRemovidaPorCulto, setMinistrantePadraoPorCulto } from './playlistTemas.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasSincronizacaoBanco(d) {
  dep = d || {};
}
const emitirPlaylistsDoControlador = (...a) => dep.emitirPlaylistsDoControlador(...a);
const forcarRepinturaCompositorLyra = (...a) => dep.forcarRepinturaCompositorLyra(...a);
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const getServidorProjeccaoIp = (...a) => dep.getServidorProjeccaoIp(...a);
const initCultoSelect = (...a) => dep.initCultoSelect(...a);
const onCultoChange = (...a) => dep.onCultoChange(...a);
const ponteProjecaoLocal = (...a) => dep.ponteProjecaoLocal(...a);
const renderSeletorTemasPlaylist = (...a) => dep.renderSeletorTemasPlaylist(...a);

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
    cultosManuais: Array.isArray(dep.getCultosManuaisCache()) ? dep.getCultosManuaisCache() : [],
    temasPorCulto: dep.getTemasPorCulto() && typeof temasPorCulto === 'object' ? dep.getTemasPorCulto() : {},
    aberturaRemovidaPorCulto:
      getAberturaRemovidaPorCulto() && typeof aberturaRemovidaPorCulto === 'object' ? getAberturaRemovidaPorCulto() : {},
    ministrantePadraoPorCulto: mapaMinistrantePadraoPersistivel(),
  };
  if (incluirPlaylists) payload.playlists = dep.getPlaylists() && typeof playlists === 'object' ? dep.getPlaylists() : {};
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

export async function aplicarSnapshotCompartilhadoNoRenderer(snapshot, opts = {}) {
  const src = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : null;
  if (!src) return;

  sharedBancoLocalUpdatedAt = String(src.updatedAt || '').trim();
  dep.setPlaylists(src.playlists && typeof src.playlists === 'object' && !Array.isArray(src.playlists) ? src.playlists : {});
  dep.setCultosManuaisCache(Array.isArray(src.cultosManuais) ? src.cultosManuais : []);
  dep.setTemasPorCulto(src.temasPorCulto && typeof src.temasPorCulto === 'object' && !Array.isArray(src.temasPorCulto)
      ? src.temasPorCulto
      : {});
  setAberturaRemovidaPorCulto(src.aberturaRemovidaPorCulto &&
    typeof src.aberturaRemovidaPorCulto === 'object' &&
    !Array.isArray(src.aberturaRemovidaPorCulto)
      ? src.aberturaRemovidaPorCulto
      : {});
  setMinistrantePadraoPorCulto(normalizarMinistrantePadraoPorCulto(src.ministrantePadraoPorCulto));
  podarMinistrantePadraoSemMusicasNaPlaylist();

  try { localStorage.setItem(LS_PLAYLISTS, JSON.stringify(dep.getPlaylists())); } catch (_) {
    // intencional — erro ignorado
  }
  try { localStorage.setItem(LS_CULTOS_MANUAIS, JSON.stringify(dep.getCultosManuaisCache() || [])); } catch (_) {
    // intencional — erro ignorado
  }
  try { localStorage.setItem(LS_PLAYLIST_TEMAS, JSON.stringify(dep.getTemasPorCulto() || {})); } catch (_) {
    // intencional — erro ignorado
  }
  try {
    localStorage.setItem(LS_PLAYLIST_ABERTURA_REMOVIDA, JSON.stringify(getAberturaRemovidaPorCulto() || {}));
  } catch (_) {
    // intencional — erro ignorado
  }
  try {
    localStorage.setItem(
      LS_PLAYLIST_MINISTRANTE_PADRAO,
      JSON.stringify(mapaMinistrantePadraoPersistivel())
    );
  } catch (_) {
    // intencional — erro ignorado
  }

  try {
    await carregarMusicas();
    refreshListaBanco();
  } catch (_) {
    // intencional — erro ignorado
  }

  try {
    await carregarMinistrantesDoServidor(getControllerApiBase());
  } catch (_) {
    // intencional — erro ignorado
  }

  initCultoSelect();
  renderSeletorTemasPlaylist();
  onCultoChange();
  emitirPlaylistsDoControlador();

  if (opts.forcarRepintura !== false) {
    forcarRepinturaCompositorLyra();
    setTimeout(() => forcarRepinturaCompositorLyra(), 80);
  }
}

export function marcarBancoCompartilhadoAlterado(updatedAt = new Date().toISOString(), opts = {}) {
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
export function abrirModalSincronizarBanco() {
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
  // Clique no escuro não fecha. Escape cancela (limpeza do resolver).
  appDialogEstado.fecharNoBackdrop = true;
  appDialogEstado.sincronizarResolver = () => {};
  return wrap;
}

/** Estado de sucesso (verde) — banco enviado e outros PCs notificados. */
export function modalSincronizarSucesso(wrap, msg) {
  // Se o usuário já fechou o modal durante o loading, não mexe nos botões compartilhados.
  if (!appDialogEstado.sincronizarResolver) return;
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
    if (appDialogEstado.sincronizarResolver) fecharAppDialog(false);
  }, 2600);
}

/** Estado de aviso (amarelo) — não é sucesso; envio sem destinatário/pré-condição. */
export function modalSincronizarAviso(wrap, msg) {
  if (!appDialogEstado.sincronizarResolver) return;
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

/** Estado de erro (vermelho) — falha ao enviar o banco.
 *  `acao` (opcional): `{ label, onClick }` no botão de confirmação. Falhar a falar com o
 *  outro PC é quase sempre endereço errado, e a correção tem de estar à mão de quem está
 *  a olhar para o erro — não escondida atrás de um menu. */
export function modalSincronizarErro(wrap, msg, acao) {
  if (!appDialogEstado.sincronizarResolver) return;
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  clearTimeout(modalSincronizarTimerAutoFechar);
  if (wrap) {
    wrap.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'share-modal-erro';
    err.textContent = String(msg || 'Não foi possível enviar o banco.');
    wrap.appendChild(err);
  }
  if (ok) {
    if (acao && typeof acao.onClick === 'function') {
      ok.style.display = '';
      ok.textContent = String(acao.label || 'OK');
      ok.onclick = () => {
        fecharAppDialog(false);
        acao.onClick();
      };
    } else {
      ok.style.display = 'none';
    }
  }
  if (cancel) {
    cancel.style.display = '';
    cancel.textContent = 'Fechar';
    cancel.onclick = () => fecharAppDialog(false);
  }
}

/**
 * Endereço do outro PC com quem este sincroniza o banco.
 *
 * Guardado à parte do IP do Servidor (`LS_IP_KEY`) porque é outra coisa: aquele é «quem
 * projeta», este é «com quem partilho o repertório». Confundi-los faria a sincronização
 * deixar de existir sempre que se projeta nesta máquina — que é o modo normal.
 */
const LS_SYNC_PC_PARCEIRO = 'lyra_sync_pc_parceiro_ip';

function ipPcParceiroSync() {
  try {
    return String(localStorage.getItem(LS_SYNC_PC_PARCEIRO) || '').trim();
  } catch (_) {
    return '';
  }
}

function guardarIpPcParceiroSync(ip) {
  try {
    localStorage.setItem(LS_SYNC_PC_PARCEIRO, String(ip || '').trim());
  } catch (_) {
    // intencional — erro ignorado
  }
}

/** Aceita IPv4 e nome de máquina; recusa o resto antes de gastar um pedido de rede. */
function ehEnderecoDeRedePlausivel(valor) {
  const v = String(valor || '').trim();
  if (!v || v.length > 60) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    return v.split('.').every((o) => Number(o) >= 0 && Number(o) <= 255);
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(v);
}

/**
 * Endereços desta máquina, para os mostrar a quem vai configurar o outro lado.
 *
 * Sem isto, «qual é o IP deste PC?» manda a pessoa ao `ipconfig` — e o passo mais chato
 * da configuração passa a ser o único que o app não ajuda a resolver.
 */
async function enderecosDestaMaquinaParaMostrar() {
  const ponte = ponteProjecaoLocal();
  if (!ponte?.estado) return [];
  try {
    const st = await ponte.estado();
    const lista = Array.isArray(st?.lanIps) ? st.lanIps : [];
    const preferido = String(st?.lanIp || '').trim();
    const out = preferido ? [preferido] : [];
    for (const ip of lista) {
      const n = String(ip || '').trim();
      if (n && !out.includes(n)) out.push(n);
    }
    return out;
  } catch (_) {
    return [];
  }
}

/** Pergunta o endereço do outro PC (uma vez) e guarda-o. */
async function pedirIpPcParceiroSync() {
  const meus = await enderecosDestaMaquinaParaMostrar();
  const ipLocal = meus.length ? meus.join(' ou ') : '';
  const resposta = await appPrompt('', {
    title: 'Sincronizar Banco de Dados',
    auxText: ipLocal
      ? `O IP deste computador é: ${ipLocal}`
      : 'Não foi possível detectar o IP deste computador.',
    fieldLabel: 'Digite o endereço IP do computador de destino (que receberá o banco):',
    defaultValue: ipPcParceiroSync(),
    emptyMsg: 'Digite um IP como 192.168.0.12, ou o nome do PC.',
    normalizar: (v) => (ehEnderecoDeRedePlausivel(v) ? String(v).trim() : ''),
  });
  if (!resposta) return '';
  guardarIpPcParceiroSync(resposta);
  return resposta;
}

/**
 * Entrega o banco ao outro PC e devolve o que ele disse.
 *
 * `avisado: false` quer dizer que o Controlador do outro lado recebeu o banco mas não
 * tinha painel aberto para perguntar a ninguém — o pedido fica lá, sem resposta. Não é
 * erro, mas também não é sucesso, e vale a pena dizê-lo.
 */
async function enviarBancoParaPcParceiro(ip, snapshot) {
  const r = await fetch(`http://${ip}:3001/api/sync/banco/pedido`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origem: (typeof window !== 'undefined' && window.lyraElectron?.nomeDestePc?.()) || '',
      snapshot: snapshot || {},
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.ok === false) throw new Error(data.erro || `HTTP ${r.status}`);
  return data;
}

/**
 * Botão «S»: manda o banco desta máquina para o outro PC.
 *
 * Directo, sem Servidor no meio. O Servidor servia de depósito e de carteiro, e nenhuma
 * das duas funções precisava dele: cada Controlador já expõe a sua API na 3001 e já sabe
 * montar e aplicar um snapshot. Tirá-lo do caminho é o que faz isto funcionar também
 * quando se projeta nesta máquina — que é o modo normal de arranque.
 */
export async function solicitarSincronizacaoManualBanco() {
  let ip = ipPcParceiroSync();
  /* Perguntado ANTES de abrir o modal: os dois usam o mesmo `app-dialog`, e abri-los em
     cima um do outro deixava o diálogo do IP a herdar os botões do modal de progresso. */
  if (!ip) {
    ip = await pedirIpPcParceiroSync();
    if (!ip) return;
  }

  const wrap = abrirModalSincronizarBanco();
  try {
    sharedBancoLocalUpdatedAt = new Date().toISOString();
    await persistirMetaCompartilhadaLocal({ incluirPlaylists: true, preservarUpdatedAt: false });
    const local = await obterSnapshotCompartilhadoLocal();
    const resposta = await enviarBancoParaPcParceiro(ip, local);
    if (resposta?.avisado === false) {
      modalSincronizarAviso(
        wrap,
        `O Lyra do PC ${ip} recebeu o banco, mas não tem o painel aberto para aceitar. ` +
          'Abra o Controlador nesse PC e envie de novo.'
      );
      return;
    }
    modalSincronizarSucesso(wrap, `Banco enviado ao PC ${ip}. Falta aceitar por lá.`);
  } catch (e) {
    modalSincronizarErro(
      wrap,
      `Não foi possível falar com o PC ${ip} na porta 3001.\n\n` +
        'Confira se o Lyra está aberto nesse PC, se o endereço está certo e se o firewall ' +
        'do Windows liberou o Lyra Controlador.\n\n' +
        String(e?.message || e),
      { label: 'Alterar endereço', onClick: () => void trocarPcParceiroSync() }
    );
  }
}

/** Esquece o PC parceiro, para o próximo «S» voltar a perguntar. */
async function trocarPcParceiroSync() {
  guardarIpPcParceiroSync('');
  await solicitarSincronizacaoManualBanco();
}

/**
 * Chegou banco do outro PC: pergunta, e só depois escreve.
 *
 * O snapshot não passou por aqui — ficou no processo principal desde que chegou pela
 * rede. O painel só diz sim ou não; quem aplica é a rota `/pedido/aceitar`, que é de
 * loopback justamente para que esta decisão não possa vir de fora.
 */
export async function tratarPedidoSyncBancoDirecto(payload) {
  if (pedidoSyncBancoEmAberto) return;
  pedidoSyncBancoEmAberto = true;
  try {
    const origem = String(payload?.origem || '').trim() || 'outro PC';
    const escolha = await appEscolherOpcao(
      'Sincronizar banco',
      [{ label: 'Aceitar', value: 'aceitar' }],
      `${origem} deseja enviar o banco de dados para este PC. Aceitar?`,
      { cancelLabel: 'Recusar' }
    );
    if (escolha !== 'aceitar') {
      await fetch(`${getControllerApiBase()}/api/sync/banco/pedido/recusar`, { method: 'POST' }).catch(
        () => {}
      );
      return;
    }
    const r = await fetch(`${getControllerApiBase()}/api/sync/banco/pedido/aceitar`, { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) throw new Error(data.erro || `HTTP ${r.status}`);
    if (data.saved === false) {
      await appAlert(
        'O banco recebido é mais antigo do que o deste PC — nada foi alterado.',
        'Sincronizar banco'
      );
      return;
    }
    await aplicarSnapshotCompartilhadoNoRenderer(data.snapshot || null);
    await appAlert('Banco sincronizado.', 'Sincronizar banco');
  } catch (e) {
    await appAlert(e?.message || 'Não foi possível aplicar o banco recebido.', 'Sincronizar banco');
  } finally {
    pedidoSyncBancoEmAberto = false;
  }
}

/**
 * Pedido que chegou com o painel fechado (ou a recarregar): ao abrir, pergunta-se por ele.
 *
 * Sem isto, quem enviou o banco enquanto o outro PC arrancava via «recebido» e nunca mais
 * ninguém era perguntado — o pedido morria de pé no processo principal.
 */
export async function recuperarPedidoSyncBancoPendente() {
  try {
    const r = await fetch(`${getControllerApiBase()}/api/sync/banco/pedido`);
    if (!r.ok) return;
    const data = await r.json().catch(() => ({}));
    if (data?.pedido) await tratarPedidoSyncBancoDirecto(data.pedido);
  } catch (_) {
    // intencional — erro ignorado
  }
}

/**
 * Pedido vindo pelo Servidor, no arranjo antigo em que ele era o carteiro.
 *
 * Mantido para quem tem os dois Controladores ligados a um Servidor: nesse caso o snapshot
 * está no Servidor, não aqui, e vai buscar-se lá.
 */
export async function tratarPedidoSincronizacaoBanco(payload) {
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

/* ─── Pontos de contato com o núcleo e com outros módulos (o estado acima é privado) ─── */

export function getEnviarPlaylistsServidorTimer() {
  return enviarPlaylistsServidorTimer;
}

export function setEnviarPlaylistsServidorTimer(valor) {
  enviarPlaylistsServidorTimer = valor;
}

export function setSharedBancoLocalUpdatedAt(valor) {
  sharedBancoLocalUpdatedAt = valor;
}

export function getModalSincronizarTimerAutoFechar() {
  return modalSincronizarTimerAutoFechar;
}
