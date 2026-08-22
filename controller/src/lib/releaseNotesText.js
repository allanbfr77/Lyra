'use strict';

/**
 * O GitHub Releases devolve release notes em HTML; o diálogo do Lyra mostra texto puro.
 * Converte tags comuns em quebras/bullets e remove o restante.
 */
function stripHtmlReleaseNotes(html) {
  let s = String(html || '');
  if (!s) return '';
  s = s
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\/\s*h[1-6]\s*>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

function normalizarReleaseNotes(releaseNotes) {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return stripHtmlReleaseNotes(item);
        return stripHtmlReleaseNotes(item.note || item.name || '');
      })
      .filter(Boolean)
      .join('\n\n');
  }
  return typeof releaseNotes === 'string' ? stripHtmlReleaseNotes(releaseNotes) : '';
}

module.exports = { stripHtmlReleaseNotes, normalizarReleaseNotes };
