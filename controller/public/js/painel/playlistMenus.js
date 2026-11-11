/**
 * Playlist: menus flutuantes da linha, do tema e do «momento», ações da barra e configuração do
 * seletor de tema. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui
 * entra por `registrarDependenciasPlaylistMenus`.
 */
import { PLAYLIST_TIPO_MARCADOR_TEMA, TEMA_PADRAO_ABERTURA } from '../modules/chavesArmazenamentoLocal.js';
import { appAlert, appConfirm, appPrompt } from './appDialog.js';
import { compartilharPlaylist, importarPlaylist } from './playlistCompartilhar.js';
import { criarMenuFlutuante } from '../modules/menuFlutuante.js';
import { desmarcarAberturaRemovidaPeloUsuario, garantirTemaNoCatalogoAtual, normalizarTemaPlaylist, renomearTemaNoCulto } from './playlistTemas.js';
import { solicitarSincronizacaoManualBanco } from './sincronizacaoBanco.js';
import { configurarSeletorMinistranteCulto, limparMinistranteTomDeTodaPlaylist } from './ministrantesTons.js';
import { confirmarSyncPlaylistModal, fecharModalNovasMusicasSync } from './playlistAdicionar.js';
import { copiarNomesMusicasPlaylist, removePlItem, renderPlaylist } from './playlistLista.js';
import { limparChecksTransmitidosDoCulto } from './playlistTransmitidas.js';
import { estadoPainel } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasPlaylistMenus(d) {
  dep = d || {};
}
const ehModoSlidesOperador = (...a) => dep.ehModoSlidesOperador(...a);
const excluirTemaDoCulto = (...a) => dep.excluirTemaDoCulto(...a);
const fecharOutrosSeletoresDropdown = (...a) => dep.fecharOutrosSeletoresDropdown(...a);
const getPlaylist = (...a) => dep.getPlaylist(...a);
const obterTemasDisponiveisPlaylist = (...a) => dep.obterTemasDisponiveisPlaylist(...a);
const playlistAtualJaTemTema = (...a) => dep.playlistAtualJaTemTema(...a);
const renderSeletorTemasPlaylist = (...a) => dep.renderSeletorTemasPlaylist(...a);
const savePlaylists = (...a) => dep.savePlaylists(...a);
const setTemaSelecionadoAtual = (...a) => dep.setTemaSelecionadoAtual(...a);

/*
  Ícones dos menus flutuantes. Markup estático — é o que `menuFlutuante.js` aceita em
  `svg`, e a razão por que nunca pode receber texto de fora do código.
*/
export const SVG_MENU_INSERIR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v9"/><path d="m9 14 3 3 3-3"/><path d="M5 21h14"/></svg>';
export const SVG_MENU_EDITAR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
export const SVG_MENU_EXCLUIR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
// (extraído) ícone duplicar → painel/bibliotecaMusicas.js

// (extraído) ícone selecionar → painel/bibliotecaMusicas.js

/*
  Ícones do menu da linha da playlist. `ti-rotate` para repor (neutro) e `ti-x` para
  excluir (o vermelho vem da variante «perigo» do menu, não do desenho do ícone).
*/
const SVG_MENU_RESETAR_LINHA =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.95 11a8 8 0 1 0 -.5 4"/><path d="M20 20v-5h-5"/></svg>';
const SVG_MENU_EXCLUIR_LINHA =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

/*
  Menu do kebab de cada música. Um só nó reaproveitado por todas as linhas — é o que
  `menuFlutuante.js` garante — e ancorado ao ícone clicado, para nascer onde o olho já
  está em vez de num ponto fixo do painel.
*/
const menuAcoesLinhaPlaylist = criarMenuFlutuante({
  id: 'playlist-linha-ctx-menu',
  rotuloAria: 'Ações desta música',
});

/**
 * Mantém o kebab aceso enquanto o menu dele está aberto.
 *
 * O ícone só aparece no hover da linha, e para escolher uma opção o rato TEM de sair da
 * linha — o menu flutua por cima do painel. Sem esta marca, o menu ficava a apontar para
 * um botão que tinha desaparecido.
 */
function marcarLinhaPlaylistComMenuAberto(row, btn) {
  document
    .querySelectorAll('.playlist-row--menu-aberto')
    .forEach((r) => r.classList.remove('playlist-row--menu-aberto'));
  row.classList.add('playlist-row--menu-aberto');
  btn.setAttribute('aria-expanded', 'true');

  const limpar = () => {
    row.classList.remove('playlist-row--menu-aberto');
    btn.setAttribute('aria-expanded', 'false');
  };
  /* O fecho do menu é do `menuFlutuante` e não avisa ninguém; escuta-se o mesmo que ele
     escuta. O `setTimeout` deixa passar o clique que acabou de abrir isto. */
  setTimeout(() => {
    document.addEventListener('click', limpar, { once: true });
    document.addEventListener('keydown', limpar, { once: true });
  }, 0);
}

/**
 * Abre «Resetar» e «Excluir» para a música da linha, ancorado ao próprio kebab.
 *
 * São as duas únicas ações que restaram da fileira de quatro ícones: repor (limpa o tom e
 * o ministrante de toda a playlist — ver `limparMinistranteTomDeTodaPlaylist`) e excluir
 * (tira da playlist a música desta linha). Reordenar passou para a alça de arrasto à
 * esquerda da linha.
 */
export function abrirMenuAcoesLinhaPlaylist(btn, row, idxPl) {
  if (!estadoPainel.cultoId) return;
  marcarLinhaPlaylistComMenuAberto(row, btn);
  menuAcoesLinhaPlaylist.abrirNaAncora(btn, {
    itens: [
      {
        rotulo: 'Resetar',
        svg: SVG_MENU_RESETAR_LINHA,
        /* Home: repõe ministrante e tons. Slides: só limpa os checks de «já transmitida». */
        aoEscolher: () => (ehModoSlidesOperador() ? limparChecksTransmitidosDoCulto() : limparMinistranteTomDeTodaPlaylist()),
      },
      {
        rotulo: 'Excluir',
        svg: SVG_MENU_EXCLUIR_LINHA,
        variante: 'perigo',
        aoEscolher: () => removePlItem(idxPl),
      },
    ],
  });
}

const menuContextoTemaPlaylist = criarMenuFlutuante({
  id: 'playlist-tema-ctx-menu',
  rotuloAria: 'Ações do tema',
});

function fecharMenuContextoTemaPlaylist() {
  menuContextoTemaPlaylist.fechar();
}

/**
 * Abre as ações do tema numa posição fixa: junto do botão «+ Adicionar momento»,
 * alinhado à esquerda dele. Não depende do item clicado — só o conteúdo do menu muda.
 */
function abrirMenuContextoTemaPlaylist(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t) return;
  const ancora = document.getElementById('playlist-momento-add');
  if (!ancora) return;
  menuContextoTemaPlaylist.abrirNaAncora(ancora, {
    titulo: t,
    itens: [
      {
        rotulo: 'Inserir na playlist',
        svg: SVG_MENU_INSERIR,
        aoEscolher: () => inserirTemaNaPlaylistAtual(t),
      },
      {
        rotulo: 'Editar nome',
        svg: SVG_MENU_EDITAR,
        aoEscolher: () => renomearTemaPeloMenuContexto(t).catch(() => {}),
      },
      {
        rotulo: 'Excluir tema',
        svg: SVG_MENU_EXCLUIR,
        variante: 'perigo',
        aoEscolher: () => excluirTemaPeloMenuContexto(t).catch(() => {}),
      },
    ],
  });
  menuContextoTemaPlaylist.node.querySelector('button')?.focus();
}

/* «+ Adicionar momento»: menu com os temas do catálogo + «Novo momento…». Substitui o antigo
   bloco «TEMA NA PLAYLIST» (seletor + «Inserir» + «+»). Botão direito num tema abre as ações
   de sempre (inserir, editar nome, excluir). */
const menuMomentoPlaylist = criarMenuFlutuante({
  id: 'playlist-momento-menu',
  rotuloAria: 'Adicionar momento',
  aoFechar: () => document.getElementById('playlist-momento-add')?.setAttribute('aria-expanded', 'false'),
});

async function criarNovoMomentoPlaylist() {
  const nome = await appPrompt('Nome do novo momento:', {
    title: 'Novo momento',
    defaultValue: '',
    emptyMsg: 'Digite um nome para o momento.',
  });
  if (!nome) return;
  garantirTemaNoCatalogoAtual(nome);
  renderSeletorTemasPlaylist();
  inserirTemaNaPlaylistAtual(nome);
}

function abrirMenuMomentoPlaylist() {
  const btn = document.getElementById('playlist-momento-add');
  if (!btn) return;
  const temas = obterTemasDisponiveisPlaylist();
  const itens = temas.map((t) => {
    const jaNaPlaylist = playlistAtualJaTemTema(t);
    return {
      rotulo: t,
      desabilitado: jaNaPlaylist,
      dica: jaNaPlaylist
        ? `O tema «${t}» já está na playlist deste culto`
        : 'Inserir este tema no fim da playlist; novas músicas entram neste bloco',
      aoEscolher: () => inserirTemaNaPlaylistAtual(t),
      // «⋯» visível e focável: abre as ações do tema (inserir, editar nome, excluir).
      acao: { rotulo: `Ações do tema ${t}`, aoEscolher: () => abrirMenuContextoTemaPlaylist(t) },
      // Atalho adicional: botão direito no item.
      aoContexto: () => {
        menuMomentoPlaylist.fechar();
        abrirMenuContextoTemaPlaylist(t);
      },
    };
  });
  itens.push({
    rotulo: 'Novo momento…',
    separadorAntes: temas.length > 0,
    aoEscolher: () => criarNovoMomentoPlaylist(),
  });
  menuMomentoPlaylist.abrirNaAncora(btn, { itens }, { acima: true, larguraDaAncora: true });
  btn.setAttribute('aria-expanded', 'true');
  menuMomentoPlaylist.node.querySelector('button:not(:disabled)')?.focus();
}

export function configurarMenuMomentoPlaylist() {
  const btn = document.getElementById('playlist-momento-add');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    // Sem isto o clique chegaria ao handler global do menu, que o fecharia logo após abrir.
    e.stopPropagation();
    if (menuMomentoPlaylist.estaAberto()) {
      menuMomentoPlaylist.fechar();
      return;
    }
    fecharOutrosSeletoresDropdown(btn);
    abrirMenuMomentoPlaylist();
  });
  // Esc com o foco dentro do menu: devolve o foco ao botão que o abriu (o menu fecha em seguida).
  menuMomentoPlaylist.node.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') btn.focus();
  });
  menuContextoTemaPlaylist.node.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') btn.focus();
  });
}

/** Insere o tema no fim da playlist do culto; novas músicas passam a entrar nesse bloco. */
function inserirTemaNaPlaylistAtual(tema) {
  if (!estadoPainel.cultoId) {
    appAlert('Selecione primeiro o dia do culto para inserir o tema na playlist.', 'Inserir tema');
    return;
  }
  const t = normalizarTemaPlaylist(tema);
  if (!t) {
    appAlert('Escolha um tema na lista antes de «Inserir».', 'Inserir tema');
    return;
  }
  if (playlistAtualJaTemTema(t)) {
    appAlert(`O tema «${t}» já está na playlist deste culto.`, 'Inserir tema');
    return;
  }
  if (t === TEMA_PADRAO_ABERTURA) desmarcarAberturaRemovidaPeloUsuario(estadoPainel.cultoId);
  const pl = getPlaylist(estadoPainel.cultoId);
  pl.push({ tipo: PLAYLIST_TIPO_MARCADOR_TEMA, tema: t });
  garantirTemaNoCatalogoAtual(t);
  setTemaSelecionadoAtual(t);
  savePlaylists();
  renderSeletorTemasPlaylist();
  renderPlaylist();
}

/* O catálogo de temas é global (`temasPorCulto.__global__`), por isso criar, renomear e
   excluir funcionam sem culto selecionado. Só «Inserir» precisa de um culto aberto. */
async function renomearTemaPeloMenuContexto(tema) {
  const atual = normalizarTemaPlaylist(tema);
  if (!atual) return;
  const novo = await appPrompt('Novo nome do tema:', {
    title: 'Editar nome do tema',
    defaultValue: atual,
    emptyMsg: 'Digite o novo nome do tema.',
  });
  if (!novo || novo === atual) return;
  if (!renomearTemaNoCulto(atual, novo)) return;
  renderSeletorTemasPlaylist();
  renderPlaylist();
}

async function excluirTemaPeloMenuContexto(tema) {
  const t = normalizarTemaPlaylist(tema);
  if (!t) return;
  const ok = await appConfirm(
    estadoPainel.cultoId
      ? `Excluir o tema «${t}»? Todas as músicas inseridas nesse tema serão removidas da playlist deste culto.`
      : `Excluir o tema «${t}»? Ele sai da lista de temas disponíveis.`,
    'Excluir tema'
  );
  if (!ok) return;
  excluirTemaDoCulto(t);
  renderSeletorTemasPlaylist();
  renderPlaylist();
}

export function configurarSeletorTemaPlaylist() {
  // O seletor de ministrante tem guarda própria; não depende de nenhum elemento de tema.
  configurarSeletorMinistranteCulto();
}

/** Ações da playlist que não dependem do bloco de temas (compartilhar, importar, copiar nomes). */
export function configurarAcoesPlaylist() {
  document.getElementById('playlist-compartilhar-btn')?.addEventListener('click', compartilharPlaylist);
  document.getElementById('playlist-importar-btn')?.addEventListener('click', importarPlaylist);
  document.getElementById('playlist-copiar-nomes-btn')?.addEventListener('click', () => {
    copiarNomesMusicasPlaylist().catch(() => {});
  });
}

export function configurarModalSyncPlaylist() {
  document.getElementById('playlist-sync-btn')?.addEventListener('click', () => {
    solicitarSincronizacaoManualBanco().catch(() => {});
  });
  document.getElementById('sync-playlist-dismiss')?.addEventListener('click', () => fecharModalNovasMusicasSync());
  document.getElementById('sync-playlist-confirm')?.addEventListener('click', () => confirmarSyncPlaylistModal());
}
