/**
 * Ações rápidas do modo Slides — só a pesquisa de músicas («Adicionar música»).
 *
 * Não há segunda biblioteca: no Slides o painel da Biblioteca (`#panel-banco`) fica escondido, e
 * aqui ele é apenas mostrado como janela por cima da tela, com a pesquisa, a lista, o «+» e as
 * regras de inclusão (`addMusicaNaPlaylist`) de sempre. A playlist é a do culto selecionado —
 * a mesma do Home; o que é independente entre os modos é a seleção, e esta janela não a toca
 * (o clique na linha adiciona, em vez de abrir a música; ver `bibliotecaMusicas.js`).
 *
 * As outras três ações são botões que chamam o que já existe: `onSincronizarPlaylistLyraClick`,
 * `abrirModalNovaMusicaManualParaSlides` e o lápis de nota (`notasSlideControlador.js`).
 */
import { refreshListaBanco } from './bibliotecaMusicas.js';

const CLASSE_ABERTA = 'slides-biblioteca-aberta';
let abaOnlineEstavaAtiva = false;

const $ = (id) => document.getElementById(id);

function estaAberta() {
  return document.body.classList.contains(CLASSE_ABERTA);
}

function camadaPorCimaAberta() {
  return !!(
    $('app-dialog-overlay')?.classList.contains('aberto') ||
    ($('nova-musica-manual-backdrop') && !$('nova-musica-manual-backdrop').hidden)
  );
}

export function abrirBibliotecaParaSlides() {
  if (!document.body.classList.contains('app-mod-slides') || estaAberta()) return;
  /* Só a Biblioteca: a aba «Online» importa e abre a música, o que não é o objetivo aqui. */
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
  if (abaOnlineEstavaAtiva) $('home-busca-online')?.click();
  abaOnlineEstavaAtiva = false;
}

export function configurarAcoesRapidasSlides() {
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
