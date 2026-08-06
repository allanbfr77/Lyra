'use strict';

const RX_LINHA_COMENTARIO_MINISTRANTE = /^\s*\/\/(.*)$/;

function isLinhaComentarioMinistrante(linha) {
  return RX_LINHA_COMENTARIO_MINISTRANTE.test(String(linha ?? ''));
}

function textoExibicaoComentarioMinistrante(linha) {
  const m = String(linha ?? '').match(RX_LINHA_COMENTARIO_MINISTRANTE);
  if (!m) return String(linha ?? '');
  return String(m[1] ?? '').trimStart();
}

function filtrarLinhasParaPublico(linhas) {
  if (!Array.isArray(linhas)) return [];
  return linhas.filter((l) => !isLinhaComentarioMinistrante(l));
}

/** Texto plano para M3 / medição (sem prefixo //). */
function textoPlanoMinistrante(texto) {
  return String(texto ?? '')
    .split(/\r\n|\r|\n/)
    .map((line) => {
      if (isLinhaComentarioMinistrante(line)) return textoExibicaoComentarioMinistrante(line);
      return line;
    })
    .join('\n');
}

function escapeHtmlBasico(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML para tela ministrante (cada linha em bloco; comentários com classe própria). */
function htmlMinistranteComComentarios(texto, maiusculo = (s) => s, commentColor = '#00c8ff') {
  const cor = String(commentColor || '').trim() || '#00c8ff';
  const lines = String(texto ?? '').split(/\r\n|\r|\n/);
  return lines
    .map((line) => {
      if (line === '') {
        return '<span class="linha-ministrante linha-ministrante--vazia">\u00a0</span>';
      }
      if (isLinhaComentarioMinistrante(line)) {
        const inner = maiusculo(textoExibicaoComentarioMinistrante(line));
        return `<span class="linha-ministrante linha-ministrante-comentario" style="color:${escapeHtmlBasico(cor)}">${escapeHtmlBasico(inner)}</span>`;
      }
      const inner = maiusculo(line);
      return `<span class="linha-ministrante">${escapeHtmlBasico(inner)}</span>`;
    })
    .join('');
}

module.exports = {
  isLinhaComentarioMinistrante,
  textoExibicaoComentarioMinistrante,
  filtrarLinhasParaPublico,
  textoPlanoMinistrante,
  htmlMinistranteComComentarios,
};
