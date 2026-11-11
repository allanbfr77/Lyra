/**
 * Compartilhar e importar playlist por código: modais, janela de confirmação de importação, conflitos
 * de músicas já existentes e fluxo de importação. Movido verbatim do núcleo (`controllerAppCore.js`);
 * o que o núcleo ainda possui entra por `registrarDependenciasPlaylistCompartilhar`.
 */
import { CLOUD_SHARE_URL, PLAYLIST_TIPO_MARCADOR_TEMA } from '../modules/chavesArmazenamentoLocal.js';
import { appAlert, appDialogEstado, fecharAppDialog } from './appDialog.js';
import { carregarMinistrantesDoServidor, garantirMinistrantePorNomeNoServidor, normalizarMinistranteIdPlaylist, normalizarTomPlaylist } from '../modules/playlistMinistranteTom.js';
import { carregarMusicas } from './bibliotecaMusicas.js';
import { ehVersaoLocalLegada } from '../modules/copiasLocaisLetra.js';
import { encontrarCopiaLocal } from './copiasLocaisPainel.js';
import { fonteBancoItemPlaylist, idFetchMusicaPlaylist, versaoLocalIdTrimado } from '../modules/playlistVersaoMusica.js';
import { garantirAberturaNoCatalogoCulto, garantirMarcadorAberturaNaPlaylist } from './playlistTemas.js';
import { idsCultosJaNaLista, listarCultosDisponiveis, saveCultosManuais, setCultoSelecionadoNaUi } from './cultoDoDia.js';
import { isoFromCultoId, ordenarCultosPorData } from '../modules/proximoCulto.js';
import { labelFallbackDeCultoIdImport, parseLabelCulto } from '../modules/cultosCalendario.js';
import { estadoPainel } from './estadoPainel.js';
import { addMusicaNaPlaylistParaCulto } from './playlistAdicionar.js';
import { garantirMinistrantesCarregados, nomeMinistrantePorId } from './ministrantesTons.js';
import { getControllerApiBase } from './servidorAlvo.js';
import { getPlaylist, savePlaylists } from './playlistServidor.js';
import { renderPlaylist } from './playlistLista.js';
import { renderSeletorTemasPlaylist } from './temasPlaylistUi.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasPlaylistCompartilhar(d) {
  dep = d || {};
}
const initCultoSelect = (...a) => dep.initCultoSelect(...a);
const onCultoChange = (...a) => dep.onCultoChange(...a);

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
export function abrirModalCompartilharPlaylist() {
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
  // Clique no escuro não fecha. Escape cancela (limpeza do resolver).
  appDialogEstado.fecharNoBackdrop = true;
  appDialogEstado.compartilharResolver = () => {};
  return wrap;
}

/** Substitui o estado de loading pelo código gerado + botão de copiar (mesmo modal). */
export function modalCompartilharMostrarCodigo(wrap, codigo, dataExp) {
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
 * Inclui ministrante (nome) e tom preenchidos na playlist — o destino resolve o cadastro pelo nome.
 */
async function conteudoMusicaParaShare(it) {
  const extrasShare = camposMinistranteTomParaShare(it);
  const vid = versaoLocalIdTrimado(it.versaoLocalId);
  if (vid && ehVersaoLocalLegada(vid)) {
    const c = encontrarCopiaLocal(it.id, vid);
    if (c) {
      return {
        titulo: c.titulo || it.titulo || '',
        artista: c.artista || it.artista || '',
        estrofes: Array.isArray(c.estrofes) ? c.estrofes.map((s) => String(s)) : [],
        // Rótulo de origem da versão escolhida (ex.: 'Cópia'). Só procedência
        // p/ exibição no destino; não recria fork/lineage entre bancos.
        rotulo: String(c.rotulo || it.versaoRotulo || '').trim(),
        ...extrasShare,
      };
    }
  }
  const idFetch = idFetchMusicaPlaylist(it);
  const fonte = fonteBancoItemPlaylist(it);
  const res = await fetch(
    `${getControllerApiBase()}/api/musicas/${encodeURIComponent(idFetch)}?fonte=${fonte}`
  );
  if (!res.ok) throw new Error();
  const m = await res.json();
  return {
    titulo: m.titulo || it.titulo || '',
    artista: m.artista || it.artista || '',
    estrofes: Array.isArray(m.estrofes) ? m.estrofes : [],
    // Rótulo de origem da versão escolhida (ex.: 'Cópia'). Só procedência
    // p/ exibição no destino; não recria fork/lineage entre bancos.
    rotulo: String(m.rotulo || it.versaoRotulo || '').trim(),
    ...extrasShare,
  };
}

/** Nome do ministrante + tom da linha da playlist (só se preenchidos). */
function camposMinistranteTomParaShare(it) {
  const out = {};
  const nome = nomeMinistrantePorId(it?.ministranteId);
  if (nome) out.ministrante = nome;
  const tom = normalizarTomPlaylist(it?.tom);
  if (tom) out.tom = tom;
  return out;
}

/**
 * Resolve ministrante/tom vindos do código C para IDs locais (+ memória de tom).
 * @param {object} m payload da música no share
 * @param {number} musicaId id root/cópia no banco local
 * @param {string} [bancoFonte]
 */
async function aplicarMinistranteTomDoShareNaPlaylistMeta(m, musicaId, bancoFonte) {
  const tom = normalizarTomPlaylist(m?.tom);
  const nome = String(m?.ministrante || m?.ministranteNome || '').trim();
  let ministranteId = null;
  if (nome) {
    try {
      const min = await garantirMinistrantePorNomeNoServidor(getControllerApiBase(), nome);
      if (min) ministranteId = normalizarMinistranteIdPlaylist(min.id);
    } catch (_) {
      // intencional — import segue sem ministrante
    }
  }
  return { ministranteId, tom };
}

export async function compartilharPlaylist() {
  if (compartilharPlaylistEmAndamento) return;
  if (!estadoPainel.cultoId) return appAlert('Selecione um culto primeiro.', 'Compartilhar Playlist');
  const pl = getPlaylist(estadoPainel.cultoId);
  if (!pl.length) return appAlert('A playlist está vazia.', 'Compartilhar Playlist');

  compartilharPlaylistEmAndamento = true;
  atualizarFeedbackCompartilharPlaylist(true);
  // Modal (mesmo app-dialog do restante do app) já abre no estado de carregamento.
  const modalWrap = abrirModalCompartilharPlaylist();
  try {
    try {
      await garantirMinistrantesCarregados();
    } catch (_) {
      // intencional — share segue; sem cache o nome do ministrante pode ficar de fora
    }
    // Coleta estrofes de cada música via API local do controlador (sempre em localhost:3001)
    const musicas = [];
    for (const it of pl) {
      if (it.tipo === PLAYLIST_TIPO_MARCADOR_TEMA) continue;
      try {
        musicas.push(await conteudoMusicaParaShare(it));
      } catch (_) {
        if (it.titulo) {
          musicas.push({
            titulo: it.titulo,
            artista: it.artista || '',
            estrofes: [],
            ...camposMinistranteTomParaShare(it),
          });
        }
      }
    }

    if (!musicas.length) {
      modalCompartilharMostrarErro(modalWrap, 'Nenhuma música encontrada na playlist.');
      return;
    }

    const res = await fetch(`${CLOUD_SHARE_URL}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cultoId: estadoPainel.cultoId, cultoNome: '', musicas }),
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

function garantirCultoDisponivelParaImportacaoCodigo(cultoIdCodigo, cultoNomeNuvem) {
  const cid = String(cultoIdCodigo || '').trim();
  if (!cid) return;
  if (idsCultosJaNaLista().has(cid)) return;
  const label = String(cultoNomeNuvem || '').trim() || labelFallbackDeCultoIdImport(cid);
  estadoPainel.cultosManuaisCache = ordenarCultosPorData([...(estadoPainel.cultosManuaisCache || []), { id: cid, label }]);
  saveCultosManuais();
  garantirAberturaNoCatalogoCulto(cid);
  if (garantirMarcadorAberturaNaPlaylist(cid)) savePlaylists();
}

function ativarCultoNaUiParaImportacaoCodigo(cultoDestino) {
  const cid = String(cultoDestino || '').trim();
  if (!cid) return;
  estadoPainel.cultoId = cid;
  initCultoSelect();
  setCultoSelecionadoNaUi(estadoPainel.cultoId);
  onCultoChange();
}

let modalImportarTimerAutoFechar = null;
/**
 * Enquanto a importação por código está em andamento (spinner), o modal não pode
 * ser dispensado por clique no escuro nem por Escape — só fecha no fim (sucesso/
 * erro com botões) ou por chamada explícita a `fecharAppDialog` no fluxo.
 */
let appImportarBloqueadoFechar = false;

export function liberarBloqueioFecharImportPlaylist() {
  appImportarBloqueadoFechar = false;
  appDialogEstado.fecharNoBackdrop = true;
}

function bloquearFecharImportPlaylistEmAndamento() {
  appImportarBloqueadoFechar = true;
  appDialogEstado.fecharNoBackdrop = false;
}

export function importarPlaylist() {
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
  liberarBloqueioFecharImportPlaylist();
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
  // Clique no escuro não fecha. Escape cancela (limpeza do resolver), salvo spinner bloqueado.
  appDialogEstado.fecharNoBackdrop = true;
  appDialogEstado.importarResolver = () => {};
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
export function modalImportarPlaylistLoading(wrap, texto = 'Importando playlist...') {
  bloquearFecharImportPlaylistEmAndamento();
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
export function modalImportarPlaylistErro(wrap, msg, codigoAnterior) {
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  clearTimeout(modalImportarTimerAutoFechar);
  liberarBloqueioFecharImportPlaylist();
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
export function modalImportarPlaylistSucesso(wrap, msg, autoFechar = true) {
  liberarBloqueioFecharImportPlaylist();
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
      if (appDialogEstado.importarResolver) fecharAppDialog(false);
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
export function dataRefDoCultoImportado(cultoIdCodigo) {
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
export function abrirJanelaConfirmarImport(ctx) {
  const bd = document.getElementById('confirmar-import-backdrop');
  const lista = document.getElementById('confirmar-import-lista');
  const sel = document.getElementById('confirmar-import-culto');
  if (!bd || !lista || !sel) {
    // Sem a janela no DOM não há como perguntar: segue com o destino do código.
    return Promise.resolve({
      confirmado: true,
      cultoId: String(ctx?.cultoIdCodigo || estadoPainel.cultoId || '').trim(),
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
    // Rótulo da versão que veio no código (ex.: 'COP. ALAN', 'Cópia').
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
  const preferido = [cultoIdCodigo, estadoPainel.cultoId].find((c) => c && opcoes.some((o) => o.id === c));
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
export function abrirJanelaConflitoImport(ctx) {
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
            const rootId = Number(nova.existente.rootId || idExistente);
            const mt = await aplicarMinistranteTomDoShareNaPlaylistMeta(m, rootId, 'user');
            await addMusicaNaPlaylistParaCulto(cultoDestino, {
              id: rootId,
              titulo: nova.existente.titulo || m.titulo,
              artista: nova.existente.artista || m.artista || '',
              bancoFonte: 'user',
              ministranteId: mt.ministranteId,
              tom: mt.tom,
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
      // Rótulo de origem enviado no payload (ex.: 'Cópia'). Compat.: se o app
      // de origem não enviou, fica vazio e o item segue sem tag como hoje.
      const rotuloOrigem = String(m.rotulo || '').trim();
      const idParaTom = nova.copyImportada ? Number(nova.id) : rootId;
      const mt = await aplicarMinistranteTomDoShareNaPlaylistMeta(m, idParaTom, 'user');
      await addMusicaNaPlaylistParaCulto(cultoDestino, {
        id: rootId,
        titulo: m.titulo,
        artista: m.artista || '',
        bancoFonte: 'user',
        ministranteId: mt.ministranteId,
        tom: mt.tom,
        ...(nova.copyImportada
          ? { versaoLocalId: String(nova.id), versaoRotulo: 'Cópia/Importada' }
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
  try {
    await carregarMinistrantesDoServidor(getControllerApiBase());
  } catch (_) {
    // intencional — selects usam cache; refresh best-effort
  }
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
  if (copiasImportadas > 0) detalhes.push(`${copiasImportadas} duplicada(s) como nova versão do banco de origem`);
  if (detalhes.length) msg += `\n\nConflitos resolvidos: ${detalhes.join('; ')}.`;

  // Caso simples auto-fecha; havendo conflitos resolvidos, exige fechar manual.
  modalImportarPlaylistSucesso(wrap, msg, detalhes.length === 0 && !cancelada);
}

/* ─── Pontos de contato com o núcleo e com outros módulos (o estado acima é privado) ─── */

export function getModalImportarTimerAutoFechar() {
  return modalImportarTimerAutoFechar;
}

export function getAppImportarBloqueadoFechar() {
  return appImportarBloqueadoFechar;
}

/**
 * Instruções que corriam no carregamento do núcleo. Chamada pelo núcleo no ponto onde o bloco estava.
 */
export function iniciarPlaylistCompartilhar() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmarImportResolver) {
      e.preventDefault();
      fecharJanelaConfirmarImport({ confirmado: false, cultoId: '', cultoLabel: '' });
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && conflitoImportResolver) {
      e.preventDefault();
      fecharJanelaConflitoImport({ acao: 'cancelar', aplicarATodos: false });
    }
  });
}
