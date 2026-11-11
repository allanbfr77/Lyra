/**
 * Prévia do slide de título de abertura (M3): partes do título, tom, respiro e estilo, e primeiras
 * linhas de estrofe para o ministrante. Movido verbatim do núcleo (`controllerAppCore.js`); o que o
 * núcleo ainda possui entra por `registrarDependenciasTituloAberturaPreview`.
 */
import { lerCurrentCfgCtrl } from './configExibicao.js';
import { normalizarTomPlaylist } from '../modules/playlistMinistranteTom.js';
import { textoSlideMaiusculo } from '../modules/slidesGrelha.js';
import { estadoPainel } from './estadoPainel.js';
import { getPlaylist, playlistItemMesmaVersaoQueAtiva } from './playlistServidor.js';

/** Primeiras N linhas de uma estrofe — prévia do próximo no slide 1 do M3. */
export function primeirasLinhasEstrofeMinistrante(texto, n = 2) {
  const max = Math.max(0, Number(n) || 0);
  const lines = String(texto ?? '').split(/\r\n|\r|\n/);
  if (lines.length <= max) return String(texto ?? '');
  return lines.slice(0, max).join('\n');
}

/** Tom da música ativa na playlist do culto (vazio se não houver). */
export function obterTomPlaylistMusicaAtiva() {
  if (!estadoPainel.musicaAtiva || !estadoPainel.cultoId) return '';
  const pl = getPlaylist(estadoPainel.cultoId);
  if (!Array.isArray(pl)) return '';
  const it = pl.find((x) => playlistItemMesmaVersaoQueAtiva(x));
  return normalizarTomPlaylist(it?.tom);
}

/** Título do 1.º slide M3: «♪ Título | Tom» quando o tom estiver cadastrado. */
export function tituloAberturaM3MusicaAtiva(tituloBase) {
  const tit = String(tituloBase || estadoPainel.musicaAtiva?.titulo || '').trim();
  const tom = obterTomPlaylistMusicaAtiva();
  if (!tit) return tom || '';
  const corpo = tom ? `${tit} | ${tom}` : tit;
  return `♪ ${corpo}`;
}

export function limparPreviewTituloMusicaAbertura() {
  const opTit = document.getElementById('op-titulo');
  if (!opTit) return;
  opTit.textContent = '';
  opTit.classList.add('vazio');
}

/** O `gap` que o flex já põe entre os filhos da prévia, em px — acompanha o CSS. */
const GAP_PREVIEW_SLIDES_PX = 14;

/** `line-height` da letra na prévia — acompanha `.op-slide-text` no CSS. */
const LINE_HEIGHT_PREVIEW_SLIDE = 1.35;

/**
 * Separa o título da letra por uma linha, como no M3 real.
 *
 * Mesma regra de lá (ver `aplicarRespiroTituloAberturaOp`): a linha mede-se na LETRA, e o
 * `gap` do flex já conta para a distância — a margem só acrescenta o que falta.
 *
 * Assim a prévia encolhe junto com a letra: como aqui a fonte é ~12 px e lá são ~4 vh, um
 * valor fixo em qualquer um dos lados faria os dois deixarem de se parecer.
 */
function aplicarRespiroPreviewTituloAbertura() {
  const opTit = document.getElementById('op-titulo');
  if (!opTit || opTit.classList.contains('vazio')) return;
  const opAtual = document.getElementById('op-atual');
  const fontePx = opAtual ? parseFloat(getComputedStyle(opAtual).fontSize) : 0;
  const linhaPx = (Number.isFinite(fontePx) && fontePx > 0 ? fontePx : 12) *
    LINE_HEIGHT_PREVIEW_SLIDE;
  opTit.style.marginBottom = `${Math.max(0, Math.round(linhaPx - GAP_PREVIEW_SLIDES_PX))}px`;
}

/** Estilo do título do 1.º slide na prévia M3 (cor + tamanho relativos à config). */
export function aplicarEstiloPreviewTituloAbertura() {
  const opTit = document.getElementById('op-titulo');
  if (!opTit) return;
  const mb = lerCurrentCfgCtrl()?.ministrante || {};
  const cor = String(mb.aberturaTituloColor || '').trim() || '#f3c15a';
  const vh = Number(mb.aberturaTituloFontSize);
  const fontVh = Number.isFinite(vh) && vh >= 0 ? vh : 7;
  opTit.style.color = cor;
  /* Prévia é pequena: ~1.6 px por vh (7 vh ≈ 11 px, o tamanho anterior). */
  opTit.style.fontSize = `${Math.max(8, Math.round(fontVh * 1.6))}px`;
}

/**
 * Tom de cifra: `C`, `C#`, `Bb`, `Cm`, `F#m`, `ORIG.` — o conjunto de `TONS_MUSICAIS`.
 * Gémeo de `RX_TOM_TITULO_ABERTURA` em `display-operator.html`; alterar os dois juntos.
 */
const RX_TOM_TITULO_ABERTURA = /^(?:[A-G](?:#|b)?m?|ORIG\.?)$/;

/**
 * Separa «♪ Título | Tom» em nome e tom, para o tom escapar à caixa alta do título.
 *
 * O tom é o que vem depois do ÚLTIMO ` | `, e só se se parecer mesmo com um tom: uma
 * música chamada «Aleluia | Ao Vivo» continua a ser nome inteiro, toda em maiúsculas.
 */
function partesTituloAberturaM3(titulo) {
  const t = String(titulo || '').trim();
  const i = t.lastIndexOf(' | ');
  if (i < 0) return { nome: t, tom: '' };
  const tom = t.slice(i + 3).trim();
  if (!RX_TOM_TITULO_ABERTURA.test(tom)) return { nome: t, tom: '' };
  return { nome: t.slice(0, i), tom };
}

/** Título no topo do preview M3 — só no 1.º slide da música. */
export function aplicarPreviewTituloMusicaAbertura(titulo, mostrar) {
  const opTit = document.getElementById('op-titulo');
  if (!opTit) return;
  const t = String(titulo || '').trim();
  if (!mostrar || !t) {
    limparPreviewTituloMusicaAbertura();
    return;
  }
  const { nome, tom } = partesTituloAberturaM3(t);
  opTit.textContent = '';
  const spanNome = document.createElement('span');
  spanNome.textContent = textoSlideMaiusculo(nome);
  opTit.appendChild(spanNome);
  if (tom) {
    /* Cifra não é texto: `Cm` é dó menor e `CM` seria outra coisa. O `text-transform` do
       título não pode chegar aqui — ver `.op-titulo-musica-tom` no CSS. */
    const spanTom = document.createElement('span');
    spanTom.className = 'op-titulo-musica-tom';
    spanTom.textContent = ` | ${tom}`;
    opTit.appendChild(spanTom);
  }
  opTit.classList.remove('vazio');
  aplicarEstiloPreviewTituloAbertura();
  aplicarRespiroPreviewTituloAbertura();
}
