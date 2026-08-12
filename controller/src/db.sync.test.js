'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function carregarDriverSqlite() {
  try {
    const BetterSqlite3 = require('better-sqlite3');
    new BetterSqlite3(':memory:').close();
    return BetterSqlite3;
  } catch (_) {
    const { DatabaseSync } = require('node:sqlite');
    return class DatabaseCompat extends DatabaseSync {
      constructor(caminho, opcoes = {}) {
        super(caminho, opcoes.readonly ? { readOnly: true } : {});
      }
    };
  }
}

const Database = carregarDriverSqlite();
const {
  initControllerDatabase,
  getDb,
  criarVersaoMusicaNoDb,
  listarMusicasUsuarioParaSync,
  substituirMusicasUsuarioParaSync,
  normalizarMusicasUsuarioParaSync,
  obterMusicaUsuarioPorId,
} = require('./db');

const {
  normalizeMusicas,
  normalizePlaylists,
  sanitizePlaylistValue,
  normalizeSharedDbSnapshot,
  SYNC_SCHEMA_VERSION,
} = require('../../server/src/lib/sharedDbSyncStore');

function criarPathsTemporarios() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-sync-'));
  return {
    dir,
    dbPathNew: () => path.join(dir, 'lyra.db'),
    dbPathLegacy: () => path.join(dir, 'legacy.db'),
    dbPathLegacyInvb: () => path.join(dir, 'legacy-invb.db'),
    catalogPath: () => path.join(dir, 'catalog.db'),
    catalogBundledDbPath: () => path.join(dir, 'catalog-bundled.db'),
  };
}

function bancoLimpo() {
  initControllerDatabase(criarPathsTemporarios(), Database);
  getDb().prepare('DELETE FROM musicas').run();
  try {
    getDb().prepare("DELETE FROM sqlite_sequence WHERE name='musicas'").run();
  } catch (_) {
    // intencional
  }
  return getDb();
}

function semearOriginal(db, titulo, artista, estrofes = ['Estrofe original']) {
  const info = db
    .prepare('INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (?, ?, ?, 1)')
    .run(titulo, artista, JSON.stringify(estrofes));
  const id = Number(info.lastInsertRowid);
  db.prepare('UPDATE musicas SET root_id = ?, parent_id = NULL WHERE id = ?').run(id, id);
  return id;
}

function contagemPorId(rows) {
  const m = new Map();
  for (const r of rows) m.set(Number(r.id), (m.get(Number(r.id)) || 0) + 1);
  return m;
}

function idEfetivoPlaylist(item) {
  const vid = item.versaoLocalId != null && String(item.versaoLocalId).trim()
    ? String(item.versaoLocalId).trim()
    : '';
  if (vid && Number.isFinite(Number(vid))) return Math.trunc(Number(vid));
  return Number(item.id);
}

test('1) sincronizar apenas músicas originais preserva identidade e imutabilidade', () => {
  const db = bancoLimpo();
  const id1 = semearOriginal(db, 'Grande é o Senhor', 'Ministério', ['A']);
  const id2 = semearOriginal(db, 'Quão Grande és Tu', 'Hino', ['B']);

  const exportadas = listarMusicasUsuarioParaSync();
  assert.strictEqual(exportadas.length, 2);
  assert.ok(exportadas.every((m) => m.parent_id == null && m.is_immutable === 1));

  bancoLimpo();
  substituirMusicasUsuarioParaSync(exportadas);

  const a = obterMusicaUsuarioPorId(id1);
  const b = obterMusicaUsuarioPorId(id2);
  assert.ok(a);
  assert.ok(b);
  assert.strictEqual(a.parent_id, null);
  assert.strictEqual(Number(a.is_immutable), 1);
  assert.strictEqual(a.root_id, id1);
  assert.strictEqual(a.titulo, 'Grande é o Senhor');
  assert.deepStrictEqual(JSON.parse(a.estrofes), ['A']);
});

test('2) sincronizar música com uma cópia preserva original e versão', () => {
  const db = bancoLimpo();
  const rootId = semearOriginal(db, 'Clamo Jesus', 'Baruk', ['Original']);
  const versao = criarVersaoMusicaNoDb(rootId, 'CÓPIA');
  assert.ok(versao.ok);

  const exportadas = listarMusicasUsuarioParaSync();
  assert.strictEqual(exportadas.length, 2);

  const copiaExp = exportadas.find((m) => m.id === versao.id);
  assert.ok(copiaExp);
  assert.strictEqual(copiaExp.parent_id, rootId);
  assert.strictEqual(copiaExp.root_id, rootId);
  assert.strictEqual(copiaExp.is_immutable, 0);
  assert.strictEqual(copiaExp.rotulo, 'CÓPIA');

  bancoLimpo();
  substituirMusicasUsuarioParaSync(exportadas);

  const original = obterMusicaUsuarioPorId(rootId);
  const copia = obterMusicaUsuarioPorId(versao.id);
  assert.strictEqual(Number(original.is_immutable), 1);
  assert.strictEqual(original.parent_id, null);
  assert.strictEqual(Number(copia.is_immutable), 0);
  assert.strictEqual(copia.parent_id, rootId);
  assert.strictEqual(copia.root_id, rootId);
  assert.strictEqual(copia.rotulo, 'CÓPIA');
  assert.notStrictEqual(copia.id, original.id);
});

test('3) sincronizar música com múltiplas cópias preserva todas', () => {
  const db = bancoLimpo();
  const rootId = semearOriginal(db, 'Maravilhosa Graça', '', ['Base']);
  const v1 = criarVersaoMusicaNoDb(rootId, 'ENSAIO');
  const v2 = criarVersaoMusicaNoDb(rootId, 'CULTO');
  const v3 = criarVersaoMusicaNoDb(rootId, 'CÓPIA/MANUAL');
  assert.ok(v1.ok && v2.ok && v3.ok);

  // Conteúdo distinto em cada cópia
  db.prepare('UPDATE musicas SET estrofes=? WHERE id=?').run(JSON.stringify(['Letra ensaio']), v1.id);
  db.prepare('UPDATE musicas SET estrofes=? WHERE id=?').run(JSON.stringify(['Letra culto']), v2.id);
  db.prepare('UPDATE musicas SET estrofes=? WHERE id=?').run(JSON.stringify(['Letra manual']), v3.id);

  const exportadas = listarMusicasUsuarioParaSync();
  assert.strictEqual(exportadas.length, 4);

  bancoLimpo();
  substituirMusicasUsuarioParaSync(exportadas);

  const ids = getDb().prepare('SELECT id FROM musicas ORDER BY id').all().map((r) => r.id);
  assert.deepStrictEqual(ids, [rootId, v1.id, v2.id, v3.id]);

  assert.strictEqual(obterMusicaUsuarioPorId(v1.id).rotulo, 'ENSAIO');
  assert.strictEqual(obterMusicaUsuarioPorId(v2.id).rotulo, 'CULTO');
  assert.strictEqual(obterMusicaUsuarioPorId(v3.id).rotulo, 'CÓPIA/MANUAL');
  assert.deepStrictEqual(JSON.parse(obterMusicaUsuarioPorId(v2.id).estrofes), ['Letra culto']);
});

test('4) sincronizar cópias com diferentes tags (rótulos) preserva metadados', () => {
  const db = bancoLimpo();
  const rootId = semearOriginal(db, 'Tag Test', 'Art', ['O']);
  const tags = ['CÓPIA', 'CÓPIA/IMPORTADA', 'ALAN', 'ENSAIO/VOZ'];
  const ids = tags.map((t) => {
    const r = criarVersaoMusicaNoDb(rootId, t);
    assert.ok(r.ok);
    return r.id;
  });

  const exportadas = listarMusicasUsuarioParaSync();
  bancoLimpo();
  substituirMusicasUsuarioParaSync(exportadas);

  for (let i = 0; i < tags.length; i++) {
    const row = obterMusicaUsuarioPorId(ids[i]);
    assert.strictEqual(row.rotulo, tags[i]);
    assert.strictEqual(row.parent_id, rootId);
    assert.strictEqual(Number(row.is_immutable), 0);
  }
});

test('5) playlist só com originais aponta para os originais', () => {
  const db = bancoLimpo();
  const id1 = semearOriginal(db, 'A', 'X', ['1']);
  const id2 = semearOriginal(db, 'B', 'Y', ['2']);

  const playlists = normalizePlaylists({
    domingo: [
      { id: id1, titulo: 'A', artista: 'X' },
      { id: id2, titulo: 'B', artista: 'Y' },
    ],
  });

  assert.strictEqual(playlists.domingo[0].versaoLocalId, undefined);
  assert.strictEqual(idEfetivoPlaylist(playlists.domingo[0]), id1);
  assert.strictEqual(idEfetivoPlaylist(playlists.domingo[1]), id2);

  substituirMusicasUsuarioParaSync(listarMusicasUsuarioParaSync());
  assert.ok(obterMusicaUsuarioPorId(id1));
  assert.ok(obterMusicaUsuarioPorId(id2));
});

test('6) playlist com cópias preserva versaoLocalId apontando para a cópia', () => {
  const db = bancoLimpo();
  const rootId = semearOriginal(db, 'Playlist Cópia', 'Z', ['Orig']);
  const versao = criarVersaoMusicaNoDb(rootId, 'CÓPIA');
  db.prepare('UPDATE musicas SET estrofes=? WHERE id=?').run(JSON.stringify(['Letra da cópia']), versao.id);

  const exportadas = listarMusicasUsuarioParaSync();
  const playlistsOrig = {
    culto: [
      {
        id: rootId,
        titulo: 'Playlist Cópia',
        artista: 'Z',
        versaoLocalId: String(versao.id),
        versaoRotulo: 'CÓPIA',
      },
    ],
  };

  const playlists = normalizePlaylists(playlistsOrig);
  assert.strictEqual(playlists.culto[0].versaoLocalId, String(versao.id));
  assert.strictEqual(playlists.culto[0].versaoRotulo, 'CÓPIA');
  assert.strictEqual(idEfetivoPlaylist(playlists.culto[0]), versao.id);
  assert.notStrictEqual(idEfetivoPlaylist(playlists.culto[0]), rootId);

  bancoLimpo();
  substituirMusicasUsuarioParaSync(exportadas);
  const copia = obterMusicaUsuarioPorId(idEfetivoPlaylist(playlists.culto[0]));
  assert.ok(copia);
  assert.strictEqual(copia.id, versao.id);
  assert.deepStrictEqual(JSON.parse(copia.estrofes), ['Letra da cópia']);
});

test('7) playlist misturando originais e cópias preserva cada ponteiro', () => {
  const db = bancoLimpo();
  const rootA = semearOriginal(db, 'Mista A', '', ['A']);
  const rootB = semearOriginal(db, 'Mista B', '', ['B']);
  const copiaB = criarVersaoMusicaNoDb(rootB, 'ENSAIO');
  assert.ok(copiaB.ok);

  const playlists = normalizePlaylists({
    noite: [
      { id: rootA, titulo: 'Mista A', artista: '' },
      {
        id: rootB,
        titulo: 'Mista B',
        artista: '',
        versaoLocalId: String(copiaB.id),
        versaoRotulo: 'ENSAIO',
      },
    ],
  });

  assert.strictEqual(idEfetivoPlaylist(playlists.noite[0]), rootA);
  assert.strictEqual(idEfetivoPlaylist(playlists.noite[1]), copiaB.id);
  assert.strictEqual(playlists.noite[0].id, rootA);
  assert.strictEqual(playlists.noite[1].id, rootB);

  const exportadas = listarMusicasUsuarioParaSync();
  bancoLimpo();
  substituirMusicasUsuarioParaSync(exportadas);
  assert.strictEqual(obterMusicaUsuarioPorId(rootA).parent_id, null);
  assert.strictEqual(obterMusicaUsuarioPorId(copiaB.id).rotulo, 'ENSAIO');
});

test('8) cada cópia recebida continua identificada como a mesma versão enviada', () => {
  const db = bancoLimpo();
  const rootId = semearOriginal(db, 'Identidade', 'I', ['O']);
  const v1 = criarVersaoMusicaNoDb(rootId, 'V1');
  const v2 = criarVersaoMusicaNoDb(rootId, 'V2');
  db.prepare('UPDATE musicas SET estrofes=? WHERE id=?').run(JSON.stringify(['corpo-v1']), v1.id);
  db.prepare('UPDATE musicas SET estrofes=? WHERE id=?').run(JSON.stringify(['corpo-v2']), v2.id);

  const snapshot = listarMusicasUsuarioParaSync();
  const idV1Antes = v1.id;
  const idV2Antes = v2.id;

  bancoLimpo();
  substituirMusicasUsuarioParaSync(snapshot);

  assert.strictEqual(obterMusicaUsuarioPorId(idV1Antes).rotulo, 'V1');
  assert.strictEqual(obterMusicaUsuarioPorId(idV2Antes).rotulo, 'V2');
  assert.deepStrictEqual(JSON.parse(obterMusicaUsuarioPorId(idV1Antes).estrofes), ['corpo-v1']);
  assert.deepStrictEqual(JSON.parse(obterMusicaUsuarioPorId(idV2Antes).estrofes), ['corpo-v2']);
  assert.strictEqual(obterMusicaUsuarioPorId(idV1Antes).parent_id, rootId);
  assert.strictEqual(obterMusicaUsuarioPorId(idV2Antes).root_id, rootId);
});

test('9) playlist recebida aponta exatamente para as mesmas versões da origem', () => {
  const db = bancoLimpo();
  const rootId = semearOriginal(db, 'PL', 'P', ['base']);
  const c1 = criarVersaoMusicaNoDb(rootId, 'TAG-A');
  const c2 = criarVersaoMusicaNoDb(rootId, 'TAG-B');

  const origem = {
    sabado: [
      { id: rootId, titulo: 'PL', artista: 'P' },
      {
        id: rootId,
        titulo: 'PL',
        artista: 'P',
        versaoLocalId: String(c1.id),
        versaoRotulo: 'TAG-A',
      },
      {
        id: rootId,
        titulo: 'PL',
        artista: 'P',
        versaoLocalId: String(c2.id),
        versaoRotulo: 'TAG-B',
      },
    ],
  };

  const snapshot = normalizeSharedDbSnapshot({
    updatedAt: new Date().toISOString(),
    musicas: listarMusicasUsuarioParaSync(),
    playlists: origem,
  });

  assert.strictEqual(SYNC_SCHEMA_VERSION, 3);
  assert.strictEqual(idEfetivoPlaylist(snapshot.playlists.sabado[0]), rootId);
  assert.strictEqual(idEfetivoPlaylist(snapshot.playlists.sabado[1]), c1.id);
  assert.strictEqual(idEfetivoPlaylist(snapshot.playlists.sabado[2]), c2.id);
  assert.strictEqual(snapshot.playlists.sabado[1].versaoRotulo, 'TAG-A');
  assert.strictEqual(snapshot.playlists.sabado[2].versaoRotulo, 'TAG-B');

  // IDs legados c_* não devem sobreviver no sync entre PCs
  const sanitizado = sanitizePlaylistValue({
    id: rootId,
    versaoLocalId: 'c_abc123',
    versaoRotulo: 'legado',
  });
  assert.strictEqual(sanitizado.versaoLocalId, undefined);
  assert.strictEqual(sanitizado.versaoRotulo, 'legado');
});

test('10) re-sincronizar não cria duplicações', () => {
  const db = bancoLimpo();
  const rootId = semearOriginal(db, 'Sem Dup', 'D', ['o']);
  const v1 = criarVersaoMusicaNoDb(rootId, 'CÓPIA');
  const v2 = criarVersaoMusicaNoDb(rootId, 'OUTRA');

  const snapshot = listarMusicasUsuarioParaSync();
  assert.strictEqual(snapshot.length, 3);

  substituirMusicasUsuarioParaSync(snapshot);
  let rows = getDb().prepare('SELECT id FROM musicas').all();
  assert.strictEqual(rows.length, 3);
  assert.ok([...contagemPorId(rows).values()].every((n) => n === 1));

  // Segunda aplicação do mesmo snapshot (PC recebedor sync de novo)
  substituirMusicasUsuarioParaSync(snapshot);
  rows = getDb().prepare('SELECT id, parent_id, rotulo FROM musicas ORDER BY id').all();
  assert.strictEqual(rows.length, 3);
  assert.ok([...contagemPorId(rows).values()].every((n) => n === 1));
  assert.deepStrictEqual(
    rows.map((r) => r.id),
    [rootId, v1.id, v2.id]
  );

  // Export → import → export → import (round-trip)
  const deNovo = listarMusicasUsuarioParaSync();
  bancoLimpo();
  substituirMusicasUsuarioParaSync(deNovo);
  substituirMusicasUsuarioParaSync(deNovo);
  rows = getDb().prepare('SELECT id FROM musicas').all();
  assert.strictEqual(rows.length, 3);
});

test('snapshot antigo (só originais, sem lineage) continua importável como originais', () => {
  bancoLimpo();
  const legado = normalizarMusicasUsuarioParaSync([
    { id: 10, titulo: 'Legado', artista: 'A', estrofes: ['x'] },
    { titulo: 'Sem Id', artista: '', estrofes: ['y'] },
  ]);
  assert.strictEqual(legado[0].parent_id, null);
  assert.strictEqual(legado[0].is_immutable, 1);
  assert.strictEqual(legado[0].root_id, 10);

  substituirMusicasUsuarioParaSync([
    { id: 10, titulo: 'Legado', artista: 'A', estrofes: ['x'] },
  ]);
  const row = obterMusicaUsuarioPorId(10);
  assert.strictEqual(Number(row.is_immutable), 1);
  assert.strictEqual(row.parent_id, null);
  assert.strictEqual(row.root_id, 10);
});

test('normalizeMusicas do servidor alinha com o controlador (cópias + tags)', () => {
  const payload = [
    {
      id: 1,
      titulo: 'Root',
      artista: '',
      estrofes: ['a'],
      parent_id: null,
      root_id: 1,
      is_immutable: 1,
      rotulo: '',
    },
    {
      id: 2,
      titulo: 'Root',
      artista: '',
      estrofes: ['b'],
      parent_id: 1,
      root_id: 1,
      is_immutable: 0,
      rotulo: 'CÓPIA/IMPORTADA',
    },
  ];
  const a = normalizarMusicasUsuarioParaSync(payload);
  const b = normalizeMusicas(payload);
  assert.strictEqual(a.length, 2);
  assert.strictEqual(b.length, 2);
  assert.strictEqual(a[1].rotulo, 'CÓPIA/IMPORTADA');
  assert.strictEqual(b[1].rotulo, 'CÓPIA/IMPORTADA');
  assert.strictEqual(a[1].parent_id, 1);
  assert.strictEqual(b[1].parent_id, 1);
});

test('11) sync preserva ministranteId/tom na playlist e cadastro+tom_memoria', () => {
  const {
    listarMinistrantesParaSync,
    listarTomMemoriaParaSync,
    substituirMinistrantesETomMemoriaParaSync,
    inserirMinistranteNoDb,
    gravarTomMemoriaNoDb,
  } = require('./db');

  const db = bancoLimpo();
  const musicaId = semearOriginal(db, 'Com Tom', 'Banda', ['letra']);
  const min = inserirMinistranteNoDb('Cris');
  gravarTomMemoriaNoDb(min.id, musicaId, 'user', 'G#');

  const sanitizado = sanitizePlaylistValue({
    id: musicaId,
    titulo: 'Com Tom',
    artista: 'Banda',
    ministranteId: min.id,
    tom: 'G#',
  });
  assert.strictEqual(sanitizado.ministranteId, min.id);
  assert.strictEqual(sanitizado.tom, 'G#');

  const snap = normalizeSharedDbSnapshot({
    updatedAt: new Date().toISOString(),
    musicas: listarMusicasUsuarioParaSync(),
    playlists: { culto: [sanitizado] },
    ministrantes: listarMinistrantesParaSync(),
    tomMemoria: listarTomMemoriaParaSync(),
  });
  assert.ok(Array.isArray(snap.ministrantes));
  assert.strictEqual(snap.ministrantes.length, 1);
  assert.strictEqual(snap.ministrantes[0].nome, 'Cris');
  assert.strictEqual(snap.tomMemoria.length, 1);
  assert.strictEqual(snap.tomMemoria[0].tom, 'G#');
  assert.strictEqual(snap.playlists.culto[0].ministranteId, min.id);
  assert.strictEqual(snap.playlists.culto[0].tom, 'G#');

  bancoLimpo();
  substituirMusicasUsuarioParaSync(snap.musicas);
  substituirMinistrantesETomMemoriaParaSync(snap.ministrantes, snap.tomMemoria);
  const mins = listarMinistrantesParaSync();
  const tons = listarTomMemoriaParaSync();
  assert.strictEqual(mins.length, 1);
  assert.strictEqual(mins[0].id, min.id);
  assert.strictEqual(mins[0].nome, 'Cris');
  assert.strictEqual(tons.length, 1);
  assert.strictEqual(tons[0].tom, 'G#');
  assert.strictEqual(tons[0].musicaId, musicaId);
});

test('12) Todos é tom padrão e não cria ministrante', () => {
  const {
    inserirMinistranteNoDb,
    importarTonsMemoriaDeArquivo,
    obterTomMemoriaNoDb,
    listarMinistrantesNoDb,
    obterTomPadraoNoDb,
  } = require('./db');

  const db = bancoLimpo();
  const musicaId = semearOriginal(db, 'Te amo', 'Banda', ['letra']);
  const cris = inserirMinistranteNoDb('Cris');

  const resumo = importarTonsMemoriaDeArquivo({
    itens: [
      {
        titulo: 'Te amo',
        artista: 'Banda',
        tons: { Todos: 'B', Cris: 'G' },
      },
    ],
  });
  assert.strictEqual(resumo.aplicados, 2);
  assert.ok(!listarMinistrantesNoDb().some((m) => String(m.nome).toLowerCase() === 'todos'));
  assert.strictEqual(obterTomPadraoNoDb(musicaId, 'user'), 'B');
  assert.strictEqual(obterTomMemoriaNoDb(cris.id, musicaId, 'user'), 'G');

  const daniela = inserirMinistranteNoDb('Daniela');
  assert.strictEqual(obterTomMemoriaNoDb(daniela.id, musicaId, 'user'), 'B');

  assert.throws(() => inserirMinistranteNoDb('Todos'), /não é um ministrante/i);
});

test('13) Todos preenche todos os ministrantes já cadastrados', () => {
  const {
    inserirMinistranteNoDb,
    importarTonsMemoriaDeArquivo,
    obterTomMemoriaNoDb,
    obterTomPadraoNoDb,
  } = require('./db');

  const db = bancoLimpo();
  const musicaId = semearOriginal(db, 'Te amo', '', ['letra']);
  const cris = inserirMinistranteNoDb('Cris');
  const daniela = inserirMinistranteNoDb('Daniela');
  const mirian = inserirMinistranteNoDb('Mirian');

  importarTonsMemoriaDeArquivo({
    itens: [
      {
        titulo: 'Te amo',
        artista: 'Diante Do Trono',
        tons: { Todos: 'B', Cris: 'G' },
      },
    ],
  });

  assert.strictEqual(obterTomPadraoNoDb(musicaId, 'user'), 'B');
  assert.strictEqual(obterTomMemoriaNoDb(cris.id, musicaId, 'user'), 'G');
  assert.strictEqual(obterTomMemoriaNoDb(daniela.id, musicaId, 'user'), 'B');
  assert.strictEqual(obterTomMemoriaNoDb(mirian.id, musicaId, 'user'), 'B');
});

test('14) Cris Medeiros no cadastro vira Cris (como no site)', () => {
  const {
    inserirMinistranteNoDb,
    migrarMinistranteCrisMedeirosParaCris,
    listarMinistrantesNoDb,
    gravarTomMemoriaNoDb,
    obterTomMemoriaNoDb,
  } = require('./db');

  const db = bancoLimpo();
  const musicaId = semearOriginal(db, 'Te amo', '', ['letra']);
  const antigo = inserirMinistranteNoDb('Cris Medeiros');
  gravarTomMemoriaNoDb(antigo.id, musicaId, 'user', 'G');

  const out = migrarMinistranteCrisMedeirosParaCris();
  assert.ok(out);
  assert.strictEqual(out.acao, 'renomeou');
  const mins = listarMinistrantesNoDb();
  assert.ok(mins.some((m) => m.nome === 'Cris'));
  assert.ok(!mins.some((m) => String(m.nome).toLowerCase() === 'cris medeiros'));
  assert.strictEqual(obterTomMemoriaNoDb(out.paraId, musicaId, 'user'), 'G');

  const cris = inserirMinistranteNoDb('Cris Extra');
  db.prepare("UPDATE ministrantes SET nome = 'Cris Medeiros' WHERE id = ?").run(cris.id);
  const fundiu = migrarMinistranteCrisMedeirosParaCris();
  assert.strictEqual(fundiu.acao, 'fundiu');
  assert.strictEqual(fundiu.paraId, out.paraId);
  assert.ok(!listarMinistrantesNoDb().some((m) => String(m.nome).toLowerCase() === 'cris medeiros'));
});

test('15) Todos do site + medley preenche qualquer ministrante', () => {
  const {
    inserirMinistranteNoDb,
    importarTonsMemoriaDeArquivo,
    obterTomMemoriaNoDb,
    obterTomPadraoNoDb,
  } = require('./db');

  const db = bancoLimpo();
  const musicaId = semearOriginal(db, 'Águas Purificadoras', '', ['letra']);
  const cris = inserirMinistranteNoDb('Cris');

  importarTonsMemoriaDeArquivo({
    itens: [
      {
        titulo: 'Tu És / Águas Purificadoras',
        artista: 'FHOP',
        tons: { Todos: 'B' },
      },
    ],
  });

  assert.strictEqual(obterTomPadraoNoDb(musicaId, 'user'), 'B');
  assert.strictEqual(obterTomMemoriaNoDb(cris.id, musicaId, 'user'), 'B');
  assert.strictEqual(
    obterTomMemoriaNoDb(cris.id, 999999, 'catalog', 'Tu És / Águas Purificadoras'),
    'B'
  );
});

test('16) um único tom no site (Raphaela B) preenche qualquer ministrante', () => {
  const {
    inserirMinistranteNoDb,
    importarTonsMemoriaDeArquivo,
    obterTomMemoriaNoDb,
    obterTomPadraoNoDb,
  } = require('./db');

  const db = bancoLimpo();
  const musicaId = semearOriginal(db, 'Tu És / Águas Purificadoras', '', ['letra']);
  const cris = inserirMinistranteNoDb('Cris');
  const raphaela = inserirMinistranteNoDb('Raphaela');

  importarTonsMemoriaDeArquivo({
    itens: [
      {
        titulo: 'Tu És / Águas Purificadoras',
        artista: '',
        tons: { Raphaela: 'B' },
      },
    ],
  });

  assert.strictEqual(obterTomPadraoNoDb(musicaId, 'user'), 'B');
  assert.strictEqual(obterTomMemoriaNoDb(raphaela.id, musicaId, 'user'), 'B');
  assert.strictEqual(obterTomMemoriaNoDb(cris.id, musicaId, 'user'), 'B');
});
