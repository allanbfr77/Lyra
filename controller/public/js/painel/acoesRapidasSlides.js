/**
 * Ações rápidas do modo Slides — a pesquisa de músicas («Adicionar música»), na Biblioteca ou Online.
 *
 * Não há segunda biblioteca: no Slides o painel da Biblioteca (`#panel-banco`) fica escondido, e
 * aqui ele é apenas mostrado como janela por cima da tela, com a pesquisa, a lista, o «+» e as
 * regras de inclusão (`addMusicaNaPlaylist`) de sempre. A playlist é a do culto selecionado —
 * a mesma do Home; o que é independente entre os modos é a seleção, e esta janela não a toca
 * (o clique na linha adiciona, em vez de abrir a música; ver `bibliotecaMusicas.js`).
 *
 * As outras ações são botões que chamam o que já existe: `onSincronizarPlaylistLyraClick`,
 * `abrirModalNovaMusicaManualParaSlides` e o botão de nota (`notasSlideControlador.js`).
 * «Adicionar novo momento» abre o menu de momentos do Home (`alternarMenuMomentoPlaylist`).
 */
import { refreshListaBanco } from './bibliotecaMusicas.js';
import { alternarMenuMomentoPlaylist } from './playlistMenus.js';
import { fecharModalPreviewLetras } from './previewLetras.js';

const CLASSE_ABERTA = 'slides-biblioteca-aberta';
let abaOnlineEstavaAtiva = false;

const $ = (id) => document.getElementById(id);

function estaAberta() {
  return document.body.classList.contains(CLASSE_ABERTA);
}

function previewLetrasAberto() {
  const bd = $('letras-preview-backdrop');
  return !!(bd && !bd.hidden);
}

function camadaPorCimaAberta() {
  return !!(
    $('app-dialog-overlay')?.classList.contains('aberto') ||
    previewLetrasAberto() ||
    ($('nova-musica-manual-backdrop') && !$('nova-musica-manual-backdrop').hidden)
  );
}

export function abrirBibliotecaParaSlides() {
  if (!document.body.classList.contains('app-mod-slides') || estaAberta()) return;
  /* Abre sempre na Biblioteca; o toggle Biblioteca/Online é o do Home. Uma música importada
     do Online vai para a playlist (ver `importacaoVaiParaPlaylistDoSlides`). A aba do Home é
     guardada para voltar como estava ao fechar. */
  abaOnlineEstavaAtiva = $('home-busca-online')?.getAttribute('aria-pressed') === 'true';
  if (abaOnlineEstavaAtiva) $('home-busca-biblioteca')?.click();
  document.body.classList.add(CLASSE_ABERTA);
  const bd = $('slides-biblioteca-backdrop');
  if (bd) bd.hidden = false;
  refreshListaBanco();
  setTimeout(() => $('busca')?.focus(), 30);
}

export function fecharBibliotecaParaSlides() {
  if (!estaAberta()) return;
  document.body.classList.remove(CLASSE_ABERTA);
  const bd = $('slides-biblioteca-backdrop');
  if (bd) bd.hidden = true;
  const onlineAgora = $('home-busca-online')?.getAttribute('aria-pressed') === 'true';
  if (abaOnlineEstavaAtiva !== onlineAgora) $(abaOnlineEstavaAtiva ? 'home-busca-online' : 'home-busca-biblioteca')?.click();
  abaOnlineEstavaAtiva = false;
}

export function configurarAcoesRapidasSlides() {
  /* «Adicionar novo momento»: o mesmo menu do «+ Adicionar momento» da playlist no Home
     (temas do catálogo + «Novo momento…»), aberto junto deste botão. */
  const btnMomento = $('btn-slides-acao-novo-momento');
  btnMomento?.addEventListener('click', (e) => alternarMenuMomentoPlaylist(btnMomento, e));
  $('slides-biblioteca-backdrop')?.addEventListener('click', fecharBibliotecaParaSlides);
  $('slides-biblioteca-fechar')?.addEventListener('click', fecharBibliotecaParaSlides);

  /*
   * Teclado enquanto a janela está aberta: Esc fecha só ela; qualquer outra tecla não pode chegar
   * aos atalhos do passador (Enter, setas, espaço…), que no Slides avançam e PROJETAM slides.
   * O ouvinte vive no `body` (borbulha antes do `document`) e só pára a propagação — a ação
   * própria do campo/da lista, que já correu no elemento, e o padrão do navegador ficam intactos.
   */
  document.body.addEventListener('keydown', (ev) => {
    if (!estaAberta()) return;
    const manual = $('nova-musica-manual-backdrop');
    /* Esc com o formulário de música por cima: o tratador de sempre o fecha (e só ele). */
    if (ev.key === 'Escape' && manual && !manual.hidden) return;
    ev.stopPropagation();
    /* Esc com a prévia da letra (Online) por cima: fecha só a prévia. */
    if (ev.key === 'Escape' && previewLetrasAberto()) {
      ev.preventDefault();
      fecharModalPreviewLetras();
      return;
    }
    if (ev.key === 'Escape' && !camadaPorCimaAberta()) {
      ev.preventDefault();
      fecharBibliotecaParaSlides();
    }
  });

  /* Sair do modo Slides (por qualquer caminho) fecha a janela, para não reaparecer na volta. */
  try {
    new MutationObserver(() => {
      if (estaAberta() && !document.body.classList.contains('app-mod-slides')) fecharBibliotecaParaSlides();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } catch (_) {
    // intencional — sem MutationObserver a janela só fica fechada pelo CSS fora do Slides
  }
}
