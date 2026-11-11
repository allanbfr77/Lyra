/**
 * Excluir música do banco: modal de confirmação, exclusão unitária e em lote e limpeza da interface
 * depois da remoção. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui
 * entra por `registrarDependenciasRemoverMusicaBanco`.
 */
import { aplicarLayoutModoLetraCompleta } from './letraCompleta.js';
import { bibGuardarAncoraScrollParaProximoRender, bibSelCancelarModo, bibSelChaveDaLinha, bibSelLinhas, bibSelecao, carregarMusicas, refreshListaBanco } from './bibliotecaMusicas.js';
import { estaSelecionada, rotuloConfirmacaoExclusaoLote } from '../modules/selecaoMultiplaBiblioteca.js';
import { obterRootIdMusicaAtiva, removerCopiasLocaisDaMusica } from './copiasLocaisPainel.js';
import { renderEstrofesEditor } from './editorEstrofes.js';
import { renderMusicaVersoesBar } from './versoesMusica.js';
import { renderPlaylist } from './playlistLista.js';
import { renderSlidesStrip } from './slidesStrip.js';
import { estadoPainel } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasRemoverMusicaBanco(d) {
  dep = d || {};
}
const ehModoSlidesOperador = (...a) => dep.ehModoSlidesOperador(...a);
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const marcacaoEstrofeEditor = (...a) => dep.marcacaoEstrofeEditor(...a);
const removerMusicaDeTodasPlaylists = (...a) => dep.removerMusicaDeTodasPlaylists(...a);
const atualizarPreviewOperador = (...a) => dep.atualizarPreviewOperador(...a);

let musicaExcluirPendente = null;
/** Lote pendente de exclusão, vindo do modo de seleção múltipla da Biblioteca. */
let musicasExcluirLotePendente = null;

/** Texto de repouso do aviso do modal, para o repor depois de uma exclusão em lote. */
function avisoModalExcluirMusicaPadrao(el) {
  if (el && !el.dataset.textoPadrao) el.dataset.textoPadrao = el.textContent || '';
  return el?.dataset?.textoPadrao || '';
}

export function fecharModalExcluirMusica() {
  musicaExcluirPendente = null;
  musicasExcluirLotePendente = null;
  const aviso = document.querySelector('#musica-excluir-backdrop .musica-excluir-aviso');
  if (aviso && aviso.dataset.textoPadrao) aviso.textContent = aviso.dataset.textoPadrao;
  document
    .querySelectorAll('.item.confirmando-exclusao')
    .forEach((el) => el.classList.remove('confirmando-exclusao'));
  const bd = document.getElementById('musica-excluir-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
}

export function solicitarRemoverMusicaDoBancoServidor(idMusica, tituloDisplay) {
  const idNum = Number(idMusica);
  if (!Number.isFinite(idNum)) return alert('ID da música inválido.');
  musicaExcluirPendente = { id: idNum, titulo: tituloDisplay || '' };
  const bd = document.getElementById('musica-excluir-backdrop');
  const nomeEl = document.getElementById('musica-excluir-nome');
  if (nomeEl) nomeEl.textContent = musicaExcluirPendente.titulo || `ID ${idNum}`;
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
}

/**
 * Mesma confirmação de sempre, com o nome da música trocado pela contagem: com doze
 * títulos não há espaço para os listar, e o que o operador precisa de saber antes de
 * uma ação sem volta é quantas músicas vão embora.
 *
 * @param {{ id: number, titulo: string }[]} lote
 */
export function solicitarRemoverMusicasDoBancoServidorEmLote(lote) {
  const itens = (Array.isArray(lote) ? lote : []).filter((m) => Number.isFinite(Number(m?.id)));
  if (!itens.length) return;
  musicaExcluirPendente = null;
  musicasExcluirLotePendente = itens.map((m) => ({ id: Number(m.id), titulo: String(m.titulo || '') }));
  const bd = document.getElementById('musica-excluir-backdrop');
  const nomeEl = document.getElementById('musica-excluir-nome');
  if (nomeEl) nomeEl.textContent = rotuloConfirmacaoExclusaoLote(musicasExcluirLotePendente.length);
  const aviso = document.querySelector('#musica-excluir-backdrop .musica-excluir-aviso');
  if (aviso) {
    avisoModalExcluirMusicaPadrao(aviso);
    aviso.textContent =
      'Esta ação não pode ser desfeita. Todas as músicas selecionadas deixam de existir na base deste PC e são retiradas das playlists neste navegador.';
  }
  /* O mesmo realce do caso de uma música só, agora em todas as linhas do lote: é ele
     que diz sobre o que o modal está a perguntar. */
  for (const linha of bibSelLinhas()) {
    const chave = bibSelChaveDaLinha(linha);
    if (chave && estaSelecionada(bibSelecao, chave)) linha.classList.add('confirmando-exclusao');
  }
  if (bd) {
    bd.hidden = false;
    bd.setAttribute('aria-hidden', 'false');
  }
}

export function configurarModalExcluirMusica() {
  document.getElementById('musica-excluir-cancel')?.addEventListener('click', () => fecharModalExcluirMusica());
  document.getElementById('musica-excluir-confirm')?.addEventListener('click', () => executarRemoverMusicaDoBancoConfirmado());
}

/**
 * Só a chamada de rede — extraída para a exclusão em lote poder repeti-la sem duplicar
 * a compatibilidade com o servidor antigo. Devolve o `rootId` removido, ou lança com a
 * mensagem que o operador veria.
 *
 * @param {number} idNum
 * @returns {Promise<number>}
 */
async function removerMusicaDoBancoNoServidor(idNum) {
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
      throw new Error(
        'Não foi possível excluir a música (HTTP 404). Verifique se o Controlador está em execução (API local na porta 3001).'
      );
    }
    throw new Error(data.erro || `Erro HTTP ${res.status}`);
  }
  return Number(data.rootId) || idNum;
}

/**
 * Limpeza da UI depois de o servidor confirmar a remoção e de `carregarMusicas()`.
 * Não toca na rede — extraída pela mesma razão que a função acima.
 *
 * @param {number} idNum
 * @param {number} rootRemovido
 */
function aplicarLimpezaUiAposRemocaoMusica(idNum, rootRemovido) {
    if (
      estadoPainel.selecaoUiBiblioteca &&
      (Number(estadoPainel.selecaoUiBiblioteca.id) === idNum || Number(estadoPainel.selecaoUiBiblioteca.id) === rootRemovido)
    ) {
      estadoPainel.selecaoUiBiblioteca = null;
    }
    if (
      estadoPainel.selecaoUiPlaylist &&
      (Number(estadoPainel.selecaoUiPlaylist.id) === idNum || Number(estadoPainel.selecaoUiPlaylist.id) === rootRemovido)
    ) {
      estadoPainel.selecaoUiPlaylist = null;
    }
    const eraAtiva =
      estadoPainel.musicaAtiva &&
      (Number(estadoPainel.musicaAtiva.id) === idNum ||
        Number(estadoPainel.musicaAtiva.id) === rootRemovido ||
        obterRootIdMusicaAtiva() === rootRemovido);
    if (eraAtiva) {
      estadoPainel.musicaAtiva = null;
      estadoPainel.musicaVersaoLocalId = null;
      estadoPainel.musicaRootId = null;
      estadoPainel.versoesMusicaServidorCache = { rootId: null, versoes: [] };
      estadoPainel.musicaBancoFonte = 'user';
      renderMusicaVersoesBar();
      estadoPainel.estrofeAtiva = -1;
      estadoPainel.modoEdicaoEstrofes = false;
      estadoPainel.snapshotEdicaoEstrofes = null;
      estadoPainel.modoLetraCompletaCentral = false;
      aplicarLayoutModoLetraCompleta();
      estadoPainel.projecaoMusicaEmitidaNoServidor = false;
      estadoPainel.bloqueioSincronizarEstrofeDoServidor = false;
      estadoPainel.slidesDockVisivel = ehModoSlidesOperador();
      renderEstrofesEditor();
      renderSlidesStrip();
      atualizarPreviewOperador();
      marcacaoEstrofeEditor();
    }
}

async function executarRemoverMusicaDoBancoConfirmado() {
  /* O lote tem caminho próprio: `carregarMusicas()` e os renders correm uma vez no
     fim, e não uma vez por música. */
  if (musicasExcluirLotePendente) return executarRemoverMusicasDoBancoEmLoteConfirmado();
  if (!musicaExcluirPendente) return fecharModalExcluirMusica();
  const idNum = musicaExcluirPendente.id;
  /* Medido antes de a lista se desfazer: é este ponto que o render a seguir devolve. */
  bibGuardarAncoraScrollParaProximoRender();
  fecharModalExcluirMusica();
  try {
    const rootRemovido = await removerMusicaDoBancoNoServidor(idNum);
    removerMusicaDeTodasPlaylists(rootRemovido);
    removerCopiasLocaisDaMusica(rootRemovido);
    await carregarMusicas();
    aplicarLimpezaUiAposRemocaoMusica(idNum, rootRemovido);
    renderPlaylist();
    refreshListaBanco();
  } catch (e) {
    alert(e.message || 'Falha ao remover.');
  }
}

/**
 * Exclusão em lote.
 *
 * Uma música que falhe não derruba as outras: cada remoção é tentada por si, e no fim o
 * operador recebe uma lista do que não saiu. O contrário — parar na primeira falha —
 * deixava o lote meio feito sem dizer onde tinha parado.
 */
async function executarRemoverMusicasDoBancoEmLoteConfirmado() {
  const lote = Array.isArray(musicasExcluirLotePendente) ? musicasExcluirLotePendente.slice() : [];
  fecharModalExcluirMusica();
  if (!lote.length) return;
  /* Mesma razão do caminho de uma só música. */
  bibGuardarAncoraScrollParaProximoRender();
  const removidos = [];
  const falhas = [];
  for (const m of lote) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const rootRemovido = await removerMusicaDoBancoNoServidor(m.id);
      removerMusicaDeTodasPlaylists(rootRemovido);
      removerCopiasLocaisDaMusica(rootRemovido);
      removidos.push({ id: m.id, rootRemovido });
    } catch (e) {
      falhas.push(`· ${m.titulo || `ID ${m.id}`}: ${e.message || 'falha ao remover'}`);
    }
  }
  if (removidos.length) {
    await carregarMusicas();
    for (const r of removidos) aplicarLimpezaUiAposRemocaoMusica(r.id, r.rootRemovido);
    renderPlaylist();
    refreshListaBanco();
  }
  bibSelCancelarModo();
  if (falhas.length) {
    alert(`Não foi possível remover ${falhas.length} de ${lote.length} músicas:\n${falhas.join('\n')}`);
  }
}
