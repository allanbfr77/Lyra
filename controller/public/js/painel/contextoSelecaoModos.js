/**
 * Seleção independente entre Home e Slides.
 *
 * Home e Slides liam e escreviam os MESMOS campos de seleção em `estadoPainel` (música ativa,
 * slide selecionado, destaque da playlist/biblioteca…): escolher uma música ou um slide num
 * modo aparecia no outro. Aqui cada modo passa a ter o seu próprio contexto de seleção, trocado
 * à entrada/saída — por cima do mesmo `estadoPainel`, sem duplicar nenhum código de edição.
 *
 * O que NÃO é seleção e continua único, porque pertence à projeção física:
 *   - o que está no ar nos monitores (`estadoServidor`), os previews que o espelham;
 *   - o envio ao servidor (`exibir_musica`, `exibir_ministrante`), o roteamento, o `Esc`.
 *
 * A bandeira «esta música foi emitida por este painel» (`projecaoMusicaEmitidaNoServidor`)
 * viaja com o contexto, mas só é reposta se o servidor ainda mostrar essa mesma música —
 * senão um clique num modo reenviaria às telas uma música que já não é a do ar.
 */
import { estadoPainel, projecao } from './estadoPainel.js';
import { ehModoHomeOperador } from './modosUi.js';
import { musicaEstadoCombinaComAtiva } from './projecaoMusica.js';
import { renderPlaylist } from './playlistLista.js';
import { renderSlidesStrip } from './slidesStrip.js';
import { renderEstrofesEditor } from './editorEstrofes.js';
import { marcacaoEstrofeEditor } from './toolbarEdicaoHome.js';
import { renderMusicaVersoesBar } from './versoesMusica.js';
import { atualizarPreviewOperador } from './previewProjecao.js';
import { aplicarLayoutModoLetraCompleta } from './letraCompleta.js';

/** Campos que descrevem a SELEÇÃO de cada modo. */
const CAMPOS = [
  'musicaAtiva',
  'musicaBancoFonte',
  'musicaVersaoLocalId',
  'musicaRootId',
  'versoesMusicaServidorCache',
  'selecaoUiPlaylist',
  'selecaoUiBiblioteca',
  'estrofeAtiva',
  'faixaSlidesHabilitadaPorPlaylistNoModoSlides',
  'modoEdicaoEstrofes',
  'snapshotEdicaoEstrofes',
  'modoLetraCompletaCentral',
  'letraCompletaEditando',
  'snapshotLetraCompleta',
  'bloqueioSincronizarEstrofeDoServidor',
];

let contextoAtual = 'home';
const guardados = { home: null, slides: null };

function clonar(v) {
  if (v == null || typeof v !== 'object') return v;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (_) {
    return v;
  }
}

function capturar() {
  const snap = {};
  CAMPOS.forEach((c) => {
    snap[c] = estadoPainel[c];
  });
  snap.projecaoMusicaEmitidaNoServidor = !!estadoPainel.projecaoMusicaEmitidaNoServidor;
  return snap;
}

function servidorMostraAMusicaAtiva() {
  const e = estadoPainel.estadoServidor;
  return !!(
    e &&
    e.tipo === 'musica' &&
    !e.telaLimpa &&
    estadoPainel.musicaAtiva &&
    musicaEstadoCombinaComAtiva(e)
  );
}

function renderizarContexto() {
  const rodar = () => {
    try {
      const et = document.getElementById('edit-titulo');
      const ea = document.getElementById('edit-artista');
      if (et) et.value = estadoPainel.musicaAtiva?.titulo || '';
      if (ea) ea.value = estadoPainel.musicaAtiva?.artista || '';
      renderMusicaVersoesBar();
      aplicarLayoutModoLetraCompleta();
      renderPlaylist();
      renderEstrofesEditor();
      renderSlidesStrip();
      marcacaoEstrofeEditor();
      atualizarPreviewOperador();
    } catch (_) {
      // intencional — a troca de contexto nunca pode derrubar a navegação
    }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(rodar);
  else setTimeout(rodar, 0);
}

/**
 * Troca o contexto de seleção. Guarda o do modo que sai e repõe o do modo que entra.
 * Um modo que nunca teve contexto parte de uma CÓPIA do actual: assim uma projeção que já
 * estava no ar continua retomável ao entrar (faixa de slides no ponto certo), mas a partir
 * daí as escolhas são só dele.
 *
 * @param {'home'|'slides'} destino
 */
export function trocarContextoSelecao(destino) {
  if (destino !== 'home' && destino !== 'slides') return;
  if (destino === contextoAtual) return;
  guardados[contextoAtual] = capturar();
  const proximo = guardados[destino];
  contextoAtual = destino;
  if (proximo) {
    CAMPOS.forEach((c) => {
      estadoPainel[c] = proximo[c];
    });
    estadoPainel.projecaoMusicaEmitidaNoServidor =
      proximo.projecaoMusicaEmitidaNoServidor && servidorMostraAMusicaAtiva();
  } else {
    /* Primeira visita: cópia desligada da do outro modo (editar aqui não mexe lá). */
    estadoPainel.musicaAtiva = clonar(estadoPainel.musicaAtiva);
    estadoPainel.versoesMusicaServidorCache = clonar(estadoPainel.versoesMusicaServidorCache);
    estadoPainel.selecaoUiPlaylist = clonar(estadoPainel.selecaoUiPlaylist);
    estadoPainel.selecaoUiBiblioteca = clonar(estadoPainel.selecaoUiBiblioteca);
    estadoPainel.snapshotEdicaoEstrofes = clonar(estadoPainel.snapshotEdicaoEstrofes);
    estadoPainel.snapshotLetraCompleta = clonar(estadoPainel.snapshotLetraCompleta);
  }
  /* Home nunca tem projeção «sua» nos monitores: sem bandeira de emissão, nenhum gesto
     da Home reenvia ou navega a música que está no ar vinda do Slides. */
  if (destino === 'home') estadoPainel.projecaoMusicaEmitidaNoServidor = false;
  renderizarContexto();
}

/**
 * Rede de segurança: entradas/saídas de modo que não passam pelos ganchos explícitos
 * (Mídias, DOCS, Bíblia → Home) acabam por refletir-se na classe do `body`.
 */
export function iniciarContextoSelecaoModos() {
  /* Rede de segurança no transporte: nenhum comando de música/ministrante sai da Home. */
  projecao.definirFiltroEnvio((evento) =>
    ehModoHomeOperador() && (evento === 'exibir_musica' || evento === 'exibir_ministrante')
  );
  const assinatura = () => {
    const cl = document.body.classList;
    return ['app-mod-slides', 'app-mod-biblia', 'app-mod-apresentacao', 'app-mod-docs'].filter((c) => cl.contains(c)).join('|');
  };
  let anterior = assinatura();
  const alinhar = () => {
    /* Só age quando o MODO muda — uma classe qualquer do body não pode desfazer uma troca
       explícita que ainda espera pela transição de ecrã. */
    const agora = assinatura();
    if (agora === anterior) return;
    anterior = agora;
    if (agora === 'app-mod-slides') trocarContextoSelecao('slides');
    else if (agora === '') trocarContextoSelecao('home');
  };
  try {
    new MutationObserver(alinhar).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } catch (_) {
    // intencional — os ganchos explícitos cobrem Home ⇄ Slides
  }
}
