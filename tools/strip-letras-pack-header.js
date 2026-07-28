'use strict';

/**
 * Remove cabeçalho de metadados de packs de letras, ex.:
 *   Título: ...
 *   Artista: ...
 *   Autor: ...
 *   Tom: F
 *   BPM: 92
 *   Tempo: 6/8
 *
 * Mantém apenas a letra (estrofes).
 */

const META_LINE =
  /^(id|t[ií]tulo|artista|autor|tom|bpm|tempo|álbum|album|compositor|letra|ano|dura[cç][aã]o|g[eê]nero|idioma)\s*:/i;

/**
 * @param {string} rawText
 * @returns {string}
 */
function stripLetrasPackHeader(rawText) {
  const text = String(rawText || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      break;
    }
    if (META_LINE.test(line)) {
      i += 1;
      continue;
    }
    break;
  }

  while (i < lines.length && !lines[i].trim()) i += 1;

  return lines.slice(i).join('\n').replace(/^\uFEFF/, '').trimEnd() + (lines.length ? '\n' : '');
}

module.exports = { stripLetrasPackHeader, META_LINE };
