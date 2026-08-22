'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarReleaseNotes, stripHtmlReleaseNotes } = require('./releaseNotesText.js');

describe('stripHtmlReleaseNotes', () => {
  it('remove tags HTML do GitHub e preserva bullets', () => {
    const html =
      '<p>Lyra v1.5.1</p>\n' +
      '<p>Correcao: sync de tons.</p>\n' +
      '<ul>\n<li>Instalador: foo.exe</li>\n<li>Manifesto: latest.yml</li>\n</ul>';
    const texto = stripHtmlReleaseNotes(html);
    assert.ok(!texto.includes('<'));
    assert.ok(texto.includes('Lyra v1.5.1'));
    assert.ok(texto.includes('• Instalador: foo.exe'));
    assert.ok(texto.includes('• Manifesto: latest.yml'));
  });

  it('normaliza string e array', () => {
    assert.equal(normalizarReleaseNotes('<p>oi</p>'), 'oi');
    assert.equal(normalizarReleaseNotes([{ note: '<p>a</p>' }, { note: '<p>b</p>' }]), 'a\n\nb');
  });
});
