'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ehFonteLyraOnline,
  montarFieldsBusca,
  mapearResultadoBusca,
  extrairLetraDaMusica,
  estrofesDeLetraPura,
  linhaESoAcordes,
  urlBusca,
  urlMusica,
  ENDPOINTS_FALLBACK,
  FONTE,
} = require('./lyraSongbank');

test('reconhece as grafias da fonte do banco online', () => {
  assert.equal(ehFonteLyraOnline('lyra-online'), true);
  assert.equal(ehFonteLyraOnline('lyra-songbank'), true);
  assert.equal(ehFonteLyraOnline('cifraclub'), false);
  assert.equal(ehFonteLyraOnline('banco-local'), false);
});

test('fields da busca seguem os checkboxes (title, artist, lyrics)', () => {
  assert.equal(montarFieldsBusca({ titulo: true, artista: true, letra: true }), 'title,artist,lyrics');
  assert.equal(montarFieldsBusca({ titulo: false, artista: true, letra: false }), 'artist');
  assert.equal(montarFieldsBusca({ titulo: false, artista: false, letra: true }), 'lyrics');
  assert.equal(montarFieldsBusca({}), 'title,artist,lyrics');
});

test('mapeia resultado de busca para o formato da lista (slug como path)', () => {
  const row = mapearResultadoBusca({
    slug: 'os-sonhos-de-deus',
    title: 'Os Sonhos de Deus',
    artist: 'Ludmila Ferber',
    has_chords: true,
    keys: ['G'],
    url: 'https://lyra-music-database.vercel.app/musica/os-sonhos-de-deus/cifra/g',
    snippet: 'Não desista',
  });
  assert.equal(row.path, 'os-sonhos-de-deus');
  assert.equal(row.titulo, 'Os Sonhos de Deus');
  assert.equal(row.artista, 'Ludmila Ferber');
  assert.equal(row.fonte, FONTE);
  assert.equal(row.has_chords, undefined);
  assert.equal(row.keys, undefined);
  assert.equal(row.url, undefined);
});

test('letra vem só de lyrics — chords e keys são ignorados', () => {
  const song = {
    title: 'Os Sonhos de Deus',
    lyrics: 'Não desista, não pare de crer',
    chords: '[Intro] G  D  Em  C\nG            D/F#\nTu és o Deus',
    keys: [{ key: 'G' }],
    has_chords: true,
  };
  assert.equal(extrairLetraDaMusica(song), 'Não desista, não pare de crer');
  assert.equal(extrairLetraDaMusica({ chords: 'G D Em' }), '');
});

test('linhas só de acorde são descartadas; //(2X) permanece', () => {
  assert.equal(linhaESoAcordes('G            D/F#      Em'), true);
  assert.equal(linhaESoAcordes('[Intro] G  D  Em  C'), true);
  assert.equal(linhaESoAcordes('Tu és o Deus de toda a terra'), false);
  assert.equal(linhaESoAcordes('//(2X)'), false);
});

test('estrofes partem a letra por linha vazia e não puxam cifra misturada', () => {
  const lyrics =
    'Se tentaram matar os teus sonhos\nSufocando o teu coração\n//(2X)\n\nNão desista, não pare de crer\nOs sonhos de Deus';
  const comCifra =
    '[Intro] G  D\n\nG            D/F#      Em\nTu és o Deus de toda a terra\n\nNão desista';
  const a = estrofesDeLetraPura(lyrics);
  assert.equal(a.length, 2);
  assert.match(a[0], /\/\/\(2X\)/);
  const b = estrofesDeLetraPura(comCifra);
  assert.ok(b.every((bloco) => !bloco.includes('[Intro]')));
  assert.ok(b.some((bloco) => /Tu és o Deus/.test(bloco)));
});

test('URLs de busca e música usam os endpoints documentados, sem cifra', () => {
  const busca = urlBusca(ENDPOINTS_FALLBACK, {
    q: 'deus',
    fields: 'title,artist',
    limit: 20,
    offset: 0,
  });
  assert.match(busca, /\/api\/v1\/songs\?/);
  assert.match(busca, /q=deus/);
  assert.match(busca, /fields=title%2Cartist/);
  assert.doesNotMatch(busca, /include=all_keys/);
  assert.doesNotMatch(busca, /instrumento=/);
  assert.doesNotMatch(busca, /\/chords\//);

  const song = urlMusica(ENDPOINTS_FALLBACK, 'os-sonhos-de-deus');
  assert.equal(song, 'https://lyra-music-database.vercel.app/api/v1/songs/os-sonhos-de-deus');
  assert.doesNotMatch(song, /all_keys/);
  assert.doesNotMatch(song, /chords/);
});
