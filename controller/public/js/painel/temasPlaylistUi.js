/**
 * Temas da playlist na interface: excluir/selecionar tema, dropdowns «Lyra select» e seletor de temas.
 * Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasTemasPlaylistUi`.
 */
import { TEMA_PADRAO_ABERTURA } from '../modules/chavesArmazenamentoLocal.js';
import { ehMarcadorTemaPlaylist } from '../modules/playlistVersaoMusica.js';
import { encerrarProjecaoDoControlador } from './projecaoMusica.js';
import { fecharCultoDropdown } from './cultoDoDia.js';
import { filtrarPlaylistRemovendoTemaComMarcadores, getTemasDoCultoAtual, marcarAberturaRemovidaPeloUsuario, normalizarListaTemas, normalizarTemaPlaylist, ordenarTemasLista, playlistPossuiMarcadoresTema, saveTemaSelecionadoPorCulto, saveTemasPorCulto } from './playlistTemas.js';
import { estadoPainel } from './estadoPainel.js';
import { getPlaylist, playlistItemMesmaVersaoQueAtiva, savePlaylists } from './playlistServidor.js';
import { fecharMenuOverflowPlaylist } from './inicializacaoPainel.js';

export function excluirTemaDoCulto(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t) return;
  if (t === TEMA_PADRAO_ABERTURA && estadoPainel.cultoId) marcarAberturaRemovidaPeloUsuario(estadoPainel.cultoId);
  estadoPainel.temasPorCulto['__global__'] = getTemasDoCultoAtual().filter((x) => x !== t);
  saveTemasPorCulto();
  // Remove da playlist do culto atual
  if (estadoPainel.cultoId) {
    const pl = getPlaylist(estadoPainel.cultoId);
    const filtrado = playlistPossuiMarcadoresTema(pl)
      ? filtrarPlaylistRemovendoTemaComMarcadores(pl, t)
      : pl.filter((it) => normalizarTemaPlaylist(it.tema) !== t);
    estadoPainel.playlists[estadoPainel.cultoId] = filtrado;
    if (getTemaSelecionadoAtual() === t) setTemaSelecionadoAtual('');
    savePlaylists();
    const plDepois = getPlaylist(estadoPainel.cultoId);
    const aindaNaLista =
      !!estadoPainel.musicaAtiva &&
      plDepois.some((it) => !ehMarcadorTemaPlaylist(it) && playlistItemMesmaVersaoQueAtiva(it));
    if (estadoPainel.musicaAtiva && !aindaNaLista) encerrarProjecaoDoControlador({ limparMusica: true });
  }
}

export function getTemaSelecionadoAtual() {
  if (!estadoPainel.cultoId) return '';
  return normalizarTemaPlaylist(estadoPainel.temaSelecionadoPorCulto[estadoPainel.cultoId] || '');
}

export function setTemaSelecionadoAtual(v) {
  if (!estadoPainel.cultoId) return;
  const t = normalizarTemaPlaylist(v);
  estadoPainel.temaSelecionadoPorCulto[estadoPainel.cultoId] = t;
  saveTemaSelecionadoPorCulto();
}

/**
 * Um tema só pode ocupar um bloco por culto. Cobre o marcador do bloco e as músicas
 * já etiquetadas; a comparação passa pelo normalizador (trim, espaços, maiúsculas).
 */
export function playlistAtualJaTemTema(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t || !estadoPainel.cultoId) return false;
  return getPlaylist(estadoPainel.cultoId).some((it) => normalizarTemaPlaylist(it?.tema) === t);
}

/**
 * Um seletor aberto de cada vez: fecha todos os dropdowns customizados excepto `excetoWrap`.
 * Não mexe em opções nem na lógica de escolha — só no estado aberto/fechado.
 */
export function fecharOutrosSeletoresDropdown(excetoWrap) {
  document.querySelectorAll('.playlist-tema-dd, .banco-fonte-dd').forEach((w) => {
    if (w !== excetoWrap) fecharLyraSelectDropdownWrap(w);
  });
  if (document.getElementById('culto-dd') !== excetoWrap) fecharCultoDropdown();
  document.querySelectorAll('.route-dd').forEach((wrap) => {
    if (wrap === excetoWrap) return;
    wrap.classList.remove('route-dd-open');
    const menu = wrap.querySelector('.route-dd-menu');
    const btn = wrap.querySelector('.route-dd-btn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
  const overflowWrap = document.querySelector('.ap-playlist-overflow');
  if (overflowWrap && overflowWrap !== excetoWrap) fecharMenuOverflowPlaylist();
}

function fecharLyraSelectDropdownWrap(wrap) {
  if (!wrap) return;
  const menu = wrap.querySelector('.playlist-tema-dd-menu');
  const btn = wrap.querySelector('.playlist-tema-dd-btn');
  wrap.classList.remove('open');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/** Mesmo visual/hover do dropdown «Tema da playlist» — evita o destaque azul do `<select>` nativo. */
export function setupLyraSelectDropdownWrap(wrap) {
  if (!wrap || wrap.dataset.lyraSelectDdBound === '1') return;
  wrap.dataset.lyraSelectDdBound = '1';
  const btn = wrap.querySelector('.playlist-tema-dd-btn');
  const menu = wrap.querySelector('.playlist-tema-dd-menu');
  if (!btn || !menu) return;
  const fechar = () => fecharLyraSelectDropdownWrap(wrap);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    const abrir = menu.hidden;
    fecharOutrosSeletoresDropdown(wrap);
    if (abrir) {
      wrap.classList.add('open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    } else {
      fecharLyraSelectDropdownWrap(wrap);
    }
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fechar();
  });
}

export function renderItensLyraSelectDropdown(wrap, items, opts = {}) {
  if (!wrap) return;
  const menu = wrap.querySelector('.playlist-tema-dd-menu');
  const label = wrap.querySelector('.playlist-tema-dd-label');
  const hid = wrap.querySelector('input[type="hidden"]');
  if (!menu || !label || !hid) return;
  const valorAtual = opts.valorAtual != null ? String(opts.valorAtual) : String(hid.value || '');
  const placeholder = opts.placeholder ?? '—';
  menu.innerHTML = '';
  let rotuloBtn = placeholder;
  items.forEach(({ value, label: rotulo }) => {
    const v = value != null ? String(value) : '';
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'playlist-tema-dd-item';
    b.dataset.value = v;
    b.textContent = rotulo;
    b.setAttribute('aria-selected', v === valorAtual ? 'true' : 'false');
    li.appendChild(b);
    menu.appendChild(li);
    if (v === valorAtual) rotuloBtn = rotulo;
  });
  label.textContent = rotuloBtn;
  hid.value = valorAtual;
  menu.querySelectorAll('.playlist-tema-dd-item').forEach((b) => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const v = b.dataset.value ?? '';
      hid.value = v;
      label.textContent = b.textContent;
      menu.querySelectorAll('.playlist-tema-dd-item').forEach((ib) => {
        ib.setAttribute('aria-selected', ib.dataset.value === v ? 'true' : 'false');
      });
      fecharLyraSelectDropdownWrap(wrap);
      if (typeof opts.aoSelecionar === 'function') opts.aoSelecionar(v);
    });
  });
}

/**
 * Sincroniza o catálogo de temas com a playlist do culto e devolve os temas disponíveis,
 * já ordenados. Só acrescenta ao catálogo temas vindos da playlist; não substitui o catálogo
 * pelo merge (substituir apagava temas criados em «Novo momento…» que ainda não tinham
 * música na playlist). Se o tema selecionado deixou de existir, a seleção é limpa.
 */
export function obterTemasDisponiveisPlaylist() {
  const pl = estadoPainel.cultoId ? getPlaylist(estadoPainel.cultoId) : [];
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
  if (estadoPainel.cultoId) {
    const base = normalizarListaTemas([...(estadoPainel.temasPorCulto[estadoPainel.cultoId] || [])]);
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
      estadoPainel.temasPorCulto[estadoPainel.cultoId] = ordenarTemasLista(normalizarListaTemas(base));
      saveTemasPorCulto();
    }
  }
  const temasDoCatalogoDepois = getTemasDoCultoAtual();
  const temas = ordenarTemasLista(normalizarListaTemas([...temasDoCatalogoDepois, ...temasDaPlaylist]));
  const atualAplicado = getTemaSelecionadoAtual();
  if (atualAplicado && !temas.includes(atualAplicado)) setTemaSelecionadoAtual('');
  return temas;
}

/** Mantém o nome histórico: chamado após qualquer mudança de tema/playlist para sincronizar o catálogo. */
export function renderSeletorTemasPlaylist() {
  obterTemasDisponiveisPlaylist();
}
