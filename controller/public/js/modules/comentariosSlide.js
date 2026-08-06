/**
 * Comentários do modo Slide:
 * - Ministrante: linhas com prefixo // (persistem na letra da música)
 * - Controlador: notas por slide → `notasSlideControlador.js` (localStorage, só no painel)
 */

const RX_LINHA_COMENTARIO_MINISTRANTE = /^\s*\/\/(.*)$/;

export const COR_COMENTARIO_MINISTRANTE_PADRAO = '#00c8ff';

/**
 * Hex seguro para a cor dos comentários.
 *
 * Uma custom property CSS com valor inválido NÃO activa o fallback do `var()`: a declaração
 * `color` fica inválida no tempo de computação e a linha herda a cor do pai — o branco do
 * slide. Só sai daqui hex válido; valor ausente ou inválido devolve `fallback` (por omissão
 * a cor de fábrica), nunca uma string arbitrária.
 * @param {unknown} cor
 * @param {string} [fallback]
 */
export function normalizarCorComentarioMinistrante(
  cor,
  fallback = COR_COMENTARIO_MINISTRANTE_PADRAO
) {
  const c = String(cor ?? '').trim();
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{4}$/.test(c) || /^#[0-9a-fA-F]{8}$/.test(c)) return c;
  const fb = String(fallback ?? '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(fb)) return fb;
  return COR_COMENTARIO_MINISTRANTE_PADRAO;
}

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
 * @param {string} [commentColor] Cor dos comentários (inline — evita herdar branco/dourado do pai)
 */
export function htmlPreviewMinistranteComComentarios(
  texto,
  escapeHtml,
  maiusculo = (s) => s,
  commentColor = COR_COMENTARIO_MINISTRANTE_PADRAO
) {
  const cor = normalizarCorComentarioMinistrante(commentColor);
  const lines = String(texto ?? '').split(/\r\n|\r|\n/);
  return lines
    .map((line) => {
      if (line === '') {
        return '<span class="preview-linha preview-linha--vazia">\u00a0</span>';
      }
      if (isLinhaComentarioMinistrante(line)) {
        const inner = maiusculo(textoExibicaoComentarioMinistrante(line));
        /* `!important` inline: nenhuma regra de folha de estilo passa à frente da cor
           escolhida pelo utilizador. */
        return `<span class="preview-linha preview-linha--ministrante-comentario" style="color:${escapeHtml(cor)} !important">${escapeHtml(inner)}</span>`;
      }
      const inner = maiusculo(line);
      return `<span class="preview-linha">${escapeHtml(inner)}</span>`;
    })
    .join('');
}

/**
 * Texto do slide para ENVIAR ao ministrante (M3) — com os `//` preservados.
 *
 * Tem de ser o texto cru. O M3 é quem decide o que é comentário, e decide-o procurando o
 * prefixo `//` em cada linha (`isLinhaComentarioMinistrante`). Se lhe chegar o texto já
 * sem o prefixo, ele desenha a linha como uma linha normal — branca em `#atual`, dourada
 * em `#proximo` — em vez de comentário na cor configurada.
 *
 * `data-preview-fonte-texto` NÃO serve: é o texto plano (sem `//`) que `aplicarClasseLinhas`
 * guarda para medir a fonte da prévia, e medir usa o texto tal como ele aparece na tela.
 * São dois consumidores com necessidades opostas, por isso são dois atributos.
 */
export function textoMinistranteDeElementoPreview(el) {
  if (!el) return '';
  const raw = el.dataset?.previewMinistranteRaw;
  if (raw != null && raw !== '') return String(raw).trim();
  /* Elementos preenchidos por outros caminhos (prévia de Bíblia, mensagens de estado) não
     têm o atributo; aí o texto visível é o melhor disponível. */
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
  { escapeHtml, maiusculo, aplicarClasseLinhas, limparEstiloPreviewSlide, commentColor }
) {
  if (!el) return;
  const raw = String(texto ?? '');
  if (!raw.trim()) {
    el.__lyraHtmlPreviewMinistrante = '';
    delete el.dataset.previewMinistranteRaw;
    el.innerHTML = '';
    el.classList.add('vazio');
    limparEstiloPreviewSlide(el);
    return;
  }
  /* Texto cru (com `//`) para `textoMinistranteDeElementoPreview` — é ele que segue para o
     M3, que precisa do prefixo para saber que a linha é comentário. Distinto do texto plano
     que `aplicarClasseLinhas` guarda para medir a fonte. */
  el.dataset.previewMinistranteRaw = raw;
  const mai = maiusculo || ((s) => s);
  const cor = normalizarCorComentarioMinistrante(commentColor);
  const html = htmlPreviewMinistranteComComentarios(raw, escapeHtml, mai, cor);
  /* Só escreve quando o HTML mudou: reescrever `innerHTML` idêntico destrói e recria os
     `<span>`, e o comentário — único elemento com cor própria — pisca no repaint. */
  if (el.__lyraHtmlPreviewMinistrante !== html || el.childElementCount === 0) {
    el.__lyraHtmlPreviewMinistrante = html;
    el.innerHTML = html;
  }
  el.classList.remove('vazio');
  aplicarClasseLinhas(el, textoPlanoPreviewMinistrante(raw));
}
