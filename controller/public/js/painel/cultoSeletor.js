/**
 * Seletor do culto: montagem da lista de cultos e reação à troca de culto (playlist, temas, interface).
 * Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasCultoSeletor`.
 */
import { cultoIdEhManual, fecharCultoDropdown, listarCultosDisponiveis, setCultoSelecionadoNaUi, solicitarExcluirCultoManual } from './cultoDoDia.js';
import { escapeHtml } from './textoHtmlSeguro.js';
import { estadoPainel } from './estadoPainel.js';
import { garantirAberturaNoCatalogoCulto, garantirMarcadorAberturaNaPlaylist } from './playlistTemas.js';
import { parseLabelCulto } from '../modules/cultosCalendario.js';
import { renderPlaylist } from './playlistLista.js';
import { renderSeletorTemasPlaylist } from './temasPlaylistUi.js';
import { savePlaylists } from './playlistServidor.js';

export function initCultoSelect() {
  const hid = document.getElementById('culto-sel');
  const menu = document.getElementById('culto-dd-menu');
  if (!hid || !menu) return;
  menu.innerHTML = '';
  const lista = listarCultosDisponiveis();
  estadoPainel.cultosDoMesCache = [...lista];
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
    estadoPainel.cultoId = '';
    setCultoSelecionadoNaUi('');
    return;
  }
  lista.forEach((c) => {
    mkItem(c.id, c.label, cultoIdEhManual(c.id));
  });
  if (!lista.some((c) => c.id === estadoPainel.cultoId)) {
    estadoPainel.cultoId = '';
  }
  setCultoSelecionadoNaUi(estadoPainel.cultoId);
}

export function onCultoChange() {
  estadoPainel.cultoId = document.getElementById('culto-sel')?.value || '';
  setCultoSelecionadoNaUi(estadoPainel.cultoId);
  if (estadoPainel.cultoId) {
    garantirAberturaNoCatalogoCulto(estadoPainel.cultoId);
    if (garantirMarcadorAberturaNaPlaylist(estadoPainel.cultoId)) savePlaylists();
  }
  renderSeletorTemasPlaylist();
  renderPlaylist();
}
