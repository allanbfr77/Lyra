/**
 * Comentários do modo Slide:
 * - Ministrante: linhas com prefixo // (persistem na letra da música)
 * - Controlador: notas por slide → `notasSlideControlador.js` (localStorage, só no painel)
 */

const RX_LINHA_COMENTARIO_MINISTRANTE = /^\s*\/\/(.*)$/;

/** Linha cuja primeira parte não-branca é // */
export function isLinhaComentarioMinistrante(linha) {
  return RX_LINHA_COMENTARIO_MINISTRANTE.test(String(linha ?? ''));
}

/** Texto exibido no M3 / preview ministrante (após //, sem o prefixo). */
export function textoExibicaoComentarioMinistrante(linha) {
  const m = String(linha ?? '').match(RX_LINHA_COMENTARIO_MINISTRANTE);
  if (!m) return String(linha ?? '');
  return String(m[1] ?? '').trimStart();
}

/** Remove linhas // do telão (M2) e prévia pública. */
export function filtrarLinhasParaPublico(linhas) {
  if (!Array.isArray(linhas)) return [];
  return linhas.filter((l) => !isLinhaComentarioMinistrante(l));
}

/** Filtra linhas // de um bloco de estrofe (string com \\n). */
export function filtrarTextoEstrofeParaPublico(texto) {
  const lines = String(texto ?? '').split(/\r\n|\r|\n/);
  return filtrarLinhasParaPublico(lines).join('\n');
}

/** Texto plano para medição de fonte e emissão ao servidor (ministrante). */
export function textoPlanoPreviewMinistrante(texto) {
  return String(texto ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => {
      if (isLinhaComentarioMinistrante(line)) return textoExibicaoComentarioMinistrante(line);
      return line;
    })
    .join('\n');
}

/**
 * HTML para prévia ministrante no painel (op-atual / op-proximo).
 * @param {string} texto
 * @param {(s: string) => string} escapeHtml
 * @param {(s: string) => string} [maiusculo]
 */
export function htmlPreviewMinistranteComComentarios(texto, escapeHtml, maiusculo = (s) => s) {
  const lines = String(texto ?? '').split(/\r\n|\r|\n/);
  return lines
    .map((line) => {
      if (line === '') {
        return '<span class="preview-linha preview-linha--vazia">\u00a0</span>';
      }
      if (isLinhaComentarioMinistrante(line)) {
        const inner = maiusculo(textoExibicaoComentarioMinistrante(line));
        return `<span class="preview-linha preview-linha--ministrante-comentario">${escapeHtml(inner)}</span>`;
      }
      const inner = maiusculo(line);
      return `<span class="preview-linha">${escapeHtml(inner)}</span>`;
    })
    .join('');
}

/** Texto plano guardado em `data-preview-fonte-texto` e enviado ao servidor (sem //). */
export function textoPlanoDeElementoPreviewMinistrante(el) {
  if (!el) return '';
  const t = el.dataset?.previewFonteTexto;
  if (t != null && t !== '') return String(t).trim();
  return String(el.textContent || '').trim();
}

/**
 * Prévia ministrante no painel (op-atual / op-proximo): HTML com comentários estilizados.
 */
export function aplicarPreviewMinistranteNoElemento(
  el,
  texto,
  { escapeHtml, maiusculo, aplicarClasseLinhas, limparEstiloPreviewSlide }
) {
  if (!el) return;
  const raw = String(texto ?? '');
  if (!raw.trim()) {
    el.innerHTML = '';
    el.classList.add('vazio');
    limparEstiloPreviewSlide(el);
    return;
  }
  const mai = maiusculo || ((s) => s);
  el.innerHTML = htmlPreviewMinistranteComComentarios(raw, escapeHtml, mai);
  el.classList.remove('vazio');
  aplicarClasseLinhas(el, textoPlanoPreviewMinistrante(raw));
}
