/**
 * Separação de estrofes por linha 100 % vazia: divisão do texto, aplicação no índice e nos textareas. Movido
 * verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasSplitEstrofes`.
 */
import { atualizarPreviewOperador } from './previewProjecao.js';
import { estadoPainel, projecao } from './estadoPainel.js';
import { marcacaoEstrofeEditor } from './toolbarEdicaoHome.js';
import { montarPayloadExibirMusica } from './projecaoMusica.js';
import { renderEstrofesEditor } from './editorEstrofes.js';
import { renderSlidesStrip } from './slidesStrip.js';

/**
 * Divide em slides onde há linha 100 % vazia (`\n\n` — sem espaço nem tab na linha).
 * Linha com pelo menos um carácter (ex.: um espaço) não separa: fica no mesmo slide (respiro visual).
 */
export function splitTextoEmEstrofesPorLinhaVaziaStrict(texto) {
  const t = String(texto ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (t === '') return [''];
  const lines = t.split('\n');
  const estrofes = [];
  let cur = [];
  for (const line of lines) {
    if (line === '') {
      if (cur.length) {
        estrofes.push(cur.join('\n'));
        cur = [];
      }
    } else {
      cur.push(line);
    }
  }
  if (cur.length) estrofes.push(cur.join('\n'));
  return estrofes.length ? estrofes : [''];
}

/**
 * Aplica a regra de linhas vazias num índice (edição rápida ao guardar ou estrofe ao sair do campo).
 */
export function aplicarSeparacaoEstrofesPorLinhasVaziasNoIndice(idx, texto, opts = {}) {
  if (!estadoPainel.musicaAtiva || idx < 0 || idx >= estadoPainel.musicaAtiva.estrofes.length) return;
  const emitSocket = opts.emitSocket !== false;
  const posCaretAposSplit = opts.posCaretAposSplit;
  const parts = splitTextoEmEstrofesPorLinhaVaziaStrict(texto);
  const eraProjecaoNesteIndice = estadoPainel.estrofeAtiva === idx;
  const delta = parts.length - 1;

  if (parts.length === 1) {
    estadoPainel.musicaAtiva.estrofes[idx] = parts[0];
  } else {
    estadoPainel.musicaAtiva.estrofes.splice(idx, 1, ...parts);
    if (estadoPainel.estrofeAtiva > idx) estadoPainel.estrofeAtiva += delta;
    else if (estadoPainel.estrofeAtiva === idx) estadoPainel.estrofeAtiva = idx;
  }

  renderSlidesStrip();
  atualizarPreviewOperador();
  renderEstrofesEditor();
  marcacaoEstrofeEditor();

  if (emitSocket && projecao.pronta() && eraProjecaoNesteIndice && estadoPainel.projecaoMusicaEmitidaNoServidor) {
    projecao.enviar('exibir_musica', montarPayloadExibirMusica(estadoPainel.estrofeAtiva));
  }

  if (posCaretAposSplit != null && parts.length > 1) {
    const di = posCaretAposSplit;
    requestAnimationFrame(() => {
      const ta = document.querySelector(
        `#estrofes-slide-editor textarea.estrofe-slide-ta[data-i="${di}"]`
      );
      if (ta) {
        ta.focus();
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
      }
    });
  }
}

/** Antes de gravar no servidor: aplica linhas vazias em cada caixa (sem depender só do blur). */
export function aplicarSplitsEstrofesDosTextareasAntesDePersistir() {
  if (!estadoPainel.musicaAtiva || !estadoPainel.modoEdicaoEstrofes) return;
  const tas = [...document.querySelectorAll('#estrofes-slide-editor textarea.estrofe-slide-ta')];
  if (!tas.length) return;
  const novas = [];
  for (const ta of tas) {
    novas.push(...splitTextoEmEstrofesPorLinhaVaziaStrict(ta.value));
  }
  estadoPainel.musicaAtiva.estrofes = novas.length ? novas : [''];
  if (estadoPainel.estrofeAtiva >= estadoPainel.musicaAtiva.estrofes.length) {
    estadoPainel.estrofeAtiva = Math.max(0, estadoPainel.musicaAtiva.estrofes.length - 1);
  }
  renderSlidesStrip();
  atualizarPreviewOperador();
  renderEstrofesEditor();
  marcacaoEstrofeEditor();
}
