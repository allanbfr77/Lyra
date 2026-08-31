/**
 * Dicas de texto truncado — o conteúdo inteiro de um texto cortado por reticências.
 *
 * ## Porquê um balão próprio, e não o `title` nativo
 *
 * O `title` já estava posto no título e no artista da playlist, e mesmo assim o texto
 * completo não aparecia ao repousar o rato. O balão nativo do Chromium é frágil por
 * natureza — não é elemento, não é estilizável, e desaparece com qualquer coisa que
 * mexa no DOM por baixo do cursor, que é precisamente o que uma lista que se redesenha
 * a cada mudança de playlist faz. Um balão nosso não depende disso, e ainda ganha a
 * tipografia e as cores do painel.
 *
 * ## Só quando há reticências
 *
 * Um balão que repete o que já se lê é ruído: aparece no caminho, tapa a linha seguinte
 * e ensina o operador a ignorá-lo. Aqui só abre quando o texto está mesmo cortado
 * (`scrollWidth > clientWidth`), medido no momento — a mesma marcação serve uma coluna
 * larga, onde nunca aparece, e uma estreita, onde aparece quase sempre.
 *
 * ## Marcação
 *
 * `data-dica` no elemento cortado. Sem valor, o balão mostra o texto do próprio elemento
 * (ou o `value`, se for um campo) — que é o caso comum e dispensa manter a mesma frase
 * escrita em dois sítios. Com valor, mostra o valor: serve para quando o que se lê é
 * uma versão abreviada do que interessa mostrar.
 */

/** Pausa antes de abrir. Curta o suficiente para não parecer preguiça, longa o
 *  suficiente para o rato poder atravessar a lista sem acender nada. */
const ATRASO_ABRIR_MS = 400;
const FOLGA_BORDA_PX = 8;

let balao = null;
let alvoAtual = null;
let timerAbrir = null;

function garantirBalao() {
  if (balao && balao.isConnected) return balao;
  balao = document.createElement('div');
  balao.className = 'dica-texto';
  balao.setAttribute('role', 'tooltip');
  balao.hidden = true;
  document.body.appendChild(balao);
  return balao;
}

/** Texto a mostrar: o `data-dica`, ou o próprio conteúdo do elemento. */
function textoDaDica(el) {
  const explicito = el.dataset.dica;
  if (explicito) return explicito;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return el.textContent || '';
}

/**
 * O texto está cortado?
 *
 * `scrollWidth` conta o conteúdo inteiro e `clientWidth` só a parte visível; a folga de
 * 1px absorve o arredondamento sub-pixel, que sozinho já dava falsos positivos em
 * títulos que cabiam à justa.
 */
function estaTruncado(el) {
  return el.scrollWidth - el.clientWidth > 1 || el.scrollHeight - el.clientHeight > 1;
}

function esconderDica() {
  clearTimeout(timerAbrir);
  timerAbrir = null;
  alvoAtual = null;
  if (balao) balao.hidden = true;
}

/** Ancora por baixo do elemento, recuando só o necessário para caber na janela. */
function posicionarBalao(el) {
  const r = el.getBoundingClientRect();
  balao.style.left = '0px';
  balao.style.top = '0px';
  balao.style.maxWidth = `${Math.max(160, window.innerWidth - FOLGA_BORDA_PX * 2)}px`;
  const b = balao.getBoundingClientRect();
  let left = r.left;
  if (left + b.width > window.innerWidth - FOLGA_BORDA_PX) {
    left = window.innerWidth - FOLGA_BORDA_PX - b.width;
  }
  if (left < FOLGA_BORDA_PX) left = FOLGA_BORDA_PX;
  let top = r.bottom + 6;
  /* Sem espaço por baixo, abre por cima — nunca fora do ecrã. */
  if (top + b.height > window.innerHeight - FOLGA_BORDA_PX) {
    top = r.top - 6 - b.height;
  }
  if (top < FOLGA_BORDA_PX) top = FOLGA_BORDA_PX;
  balao.style.left = `${Math.round(left)}px`;
  balao.style.top = `${Math.round(top)}px`;
}

function mostrarDica(el) {
  const texto = String(textoDaDica(el) || '').trim();
  if (!texto) return;
  garantirBalao();
  balao.textContent = texto;
  balao.hidden = false;
  posicionarBalao(el);
}

function aoApontar(ev) {
  const el = ev.target instanceof Element ? ev.target.closest('[data-dica]') : null;
  if (!el) {
    if (alvoAtual) esconderDica();
    return;
  }
  if (el === alvoAtual) return;
  esconderDica();
  if (!estaTruncado(el)) return;
  alvoAtual = el;
  timerAbrir = setTimeout(() => {
    timerAbrir = null;
    /* O elemento pode ter saído do DOM durante a pausa (a lista redesenha-se muito). */
    if (alvoAtual === el && el.isConnected) mostrarDica(el);
    else esconderDica();
  }, ATRASO_ABRIR_MS);
}

/**
 * Liga as dicas uma vez para a página inteira.
 *
 * Delegação no documento, e não um listener por elemento: as linhas da playlist são
 * recriadas a cada `renderPlaylist`, e listeners individuais teriam de ser religados
 * (e desligados) a cada passagem.
 */
export function iniciarDicasDeTextoTruncado() {
  document.addEventListener('mouseover', aoApontar);
  document.addEventListener('mouseleave', esconderDica, true);
  /* Qualquer coisa que mova o que está por baixo do balão fecha-o: um balão ancorado a
     um elemento que já saiu dali é pior do que nenhum. */
  document.addEventListener('scroll', esconderDica, true);
  document.addEventListener('mousedown', esconderDica, true);
  document.addEventListener('wheel', esconderDica, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') esconderDica();
  });
  window.addEventListener('blur', esconderDica);
  window.addEventListener('resize', esconderDica);
}
