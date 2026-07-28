'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const express = require('express');
const {
  getDb,
  getCatalog,
  getBibliaDb,
  getBibliaTraducoesDisponiveis,
  atualizarMusicaNoDb,
  apagarMusicaUsuarioNoDb,
  criarVersaoMusicaNoDb,
  atualizarRotuloVersaoNoDb,
  inserirMusicaUsuario,
  importarMusicaUsuarioNoDb,
  listarVersoesPorRootId,
  listarMusicasUsuarioParaSync,
  obterMusicaUsuarioPorId,
  resolverRootIdDaMusica,
  rowMusicaParaJson,
  substituirMusicasUsuarioParaSync,
} = require('./db');
const { loadPlaylistsJson, savePlaylistsJson } = require('./lib/playlistsStore');
const {
  loadSharedSyncMeta,
  normalizeSharedSyncMeta,
  saveSharedSyncMeta,
  touchSharedSyncMeta,
} = require('./lib/sharedSyncMetaStore');
const { SERVER_URL } = require('./serverLink');
const cifra = require('./lib/cifraLetras');
const letrasMus = require('./lib/letrasMusBr');
const vozSlidesModelo = require('./lib/vozSlidesModeloMain');

const HTTP_CONTROLLER_PORT = 3001;
const NOMES_TRADUCAO_BIBLIA = {
  ARA: 'Almeida Revista e Atualizada',
  ARC: 'Almeida Revista e Corrigida',
  ACF: 'Almeida Corrigida e Fiel',
  NAA: 'Nova Almeida Atualizada',
  NTLH: 'Nova Tradução na Linguagem de Hoje',
  NVI: 'Nova Versão Internacional',
};

/** Estado do modo apresentação persistido só na RAM (sincronização entre clientes na mesma máquina/rede). */
let apresentacaoStateMem = {};

/** Vídeos do card 5 — servidos por HTTP (telão/player carregam por URL, sem Base64 no POST). */
const apresentacaoVideosMem = new Map();
let apresentacaoVideosDirPath = '';

function extensaoMimeVideo(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('webm')) return '.webm';
  if (m.includes('ogg')) return '.ogv';
  if (m.includes('quicktime') || m.includes('mov')) return '.mov';
  if (m.includes('avi')) return '.avi';
  return '.mp4';
}

function caminhoVideoApresentacaoNoDisco(id, mime) {
  const safe = String(id || '').replace(/[^\w.-]+/g, '_');
  return path.join(apresentacaoVideosDirPath, `${safe}${extensaoMimeVideo(mime)}`);
}

function salvarVideoApresentacaoNoDisco(id, buf, mime) {
  if (!apresentacaoVideosDirPath || !buf?.length) return;
  try {
    fs.mkdirSync(apresentacaoVideosDirPath, { recursive: true });
    fs.writeFileSync(caminhoVideoApresentacaoNoDisco(id, mime), buf);
  } catch (_) {
  // intencional — erro ignorado
}
}

function resolverArquivoVideoApresentacaoNoDisco(id) {
  if (!apresentacaoVideosDirPath) return null;
  try {
    const dir = apresentacaoVideosDirPath;
    if (!fs.existsSync(dir)) return null;
    const safe = String(id || '').replace(/[^\w.-]+/g, '_');
    const found = fs.readdirSync(dir).find((f) => f.startsWith(safe + '.'));
    return found ? path.join(dir, found) : null;
  } catch (_) {
    return null;
  }
}

function mimePorCaminhoVideo(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.ogv') return 'video/ogg';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.avi') return 'video/x-msvideo';
  return 'video/mp4';
}

/** Entrega vídeo com suporte a Range — leitura em fluxo do disco (buffer do SO). */
function enviarVideoApresentacaoComRange(req, res, filePath, mime) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const tipo = mime || mimePorCaminhoVideo(filePath);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', tipo);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (match) {
      const start = match[1] !== '' ? parseInt(match[1], 10) : 0;
      let end = match[2] !== '' ? parseInt(match[2], 10) : total - 1;
      if (Number.isFinite(start) && start < total) {
        end = Math.min(end, total - 1);
        const chunkLen = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(chunkLen));
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }
    }
  }
  res.setHeader('Content-Length', String(total));
  fs.createReadStream(filePath).pipe(res);
}

function obterVideoApresentacaoPorId(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  return apresentacaoVideosMem.get(key) || null;
}

function projectionBaseUrl() {
  try {
    return new URL(SERVER_URL);
  } catch (_) {
    return new URL('http://127.0.0.1:5510');
  }
}

function compareUpdatedAt(a, b) {
  const ta = Date.parse(String(a || ''));
  const tb = Date.parse(String(b || ''));
  const va = Number.isFinite(ta) ? ta : 0;
  const vb = Number.isFinite(tb) ? tb : 0;
  return va === vb ? 0 : va > vb ? 1 : -1;
}

function cloneJsonSafe(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sanitizePlaylistValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePlaylistValue(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'versaoLocalId') continue;
    const next = sanitizePlaylistValue(raw);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

function normalizeMusicasForSync(musicas) {
  if (!Array.isArray(musicas)) return [];
  const out = [];
  const ids = new Set();
  for (const raw of musicas) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const titulo = String(raw.titulo || '').trim();
    const artista = String(raw.artista || '').trim();
    const estrofes = Array.isArray(raw.estrofes)
      ? raw.estrofes.map((s) => String(s ?? '')).filter((s) => s.trim())
      : [];
    if (!titulo || !estrofes.length) continue;
    const item = { titulo, artista, estrofes };
    const idNum = Number(raw.id);
    if (Number.isFinite(idNum) && idNum > 0) {
      const id = Math.trunc(idNum);
      if (ids.has(id)) continue;
      ids.add(id);
      item.id = id;
    }
    out.push(item);
  }
  return out;
}

function normalizePlaylistsForSync(playlists) {
  const src = playlists && typeof playlists === 'object' && !Array.isArray(playlists) ? playlists : {};
  const out = {};
  for (const [cultoId, lista] of Object.entries(src)) {
    const id = String(cultoId || '').trim();
    if (!id || !Array.isArray(lista)) continue;
    out[id] = sanitizePlaylistValue(cloneJsonSafe(lista));
  }
  return out;
}

function normalizarSnapshotCompartilhado(snapshot, paths, opts = {}) {
  const src = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
  const metaAtual = loadSharedSyncMeta(paths.sharedSyncMetaPath);
  const meta = normalizeSharedSyncMeta(
    {
      updatedAt:
        src.updatedAt != null
          ? src.updatedAt
          : opts.preserveCurrentUpdatedAt
            ? metaAtual.updatedAt
            : new Date().toISOString(),
      cultosManuais: src.cultosManuais,
      temasPorCulto: src.temasPorCulto,
      aberturaRemovidaPorCulto: src.aberturaRemovidaPorCulto,
    },
    {
      fallbackUpdatedAt:
        opts.preserveCurrentUpdatedAt && metaAtual.updatedAt ? metaAtual.updatedAt : new Date().toISOString(),
    }
  );
  return {
    updatedAt: meta.updatedAt,
    musicas: normalizeMusicasForSync(src.musicas),
    playlists: normalizePlaylistsForSync(src.playlists),
    cultosManuais: meta.cultosManuais,
    temasPorCulto: meta.temasPorCulto,
    aberturaRemovidaPorCulto: meta.aberturaRemovidaPorCulto,
  };
}

function montarSnapshotCompartilhadoLocal(paths) {
  const meta = loadSharedSyncMeta(paths.sharedSyncMetaPath);
  return {
    updatedAt: meta.updatedAt,
    musicas: listarMusicasUsuarioParaSync(),
    playlists: normalizePlaylistsForSync(loadPlaylistsJson(paths.playlistsJsonPath)),
    cultosManuais: meta.cultosManuais,
    temasPorCulto: meta.temasPorCulto,
    aberturaRemovidaPorCulto: meta.aberturaRemovidaPorCulto,
  };
}

/**
 * Encaminha JSON ao servidor de projeção (5510) quando o controlador não tem socket ligado.
 */
function proxyJsonToProjection(method, pathname, jsonBody) {
  const base = projectionBaseUrl();
  const bodyBuf = jsonBody != null ? Buffer.from(JSON.stringify(jsonBody), 'utf8') : Buffer.alloc(0);
  const port = base.port ? Number(base.port) : base.protocol === 'https:' ? 443 : 80;
  const opts = {
    hostname: base.hostname,
    port,
    path: pathname,
    method,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': bodyBuf.length,
    },
  };
  const lib = base.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({ status: res.statusCode || 500, headers: res.headers, body: raw });
      });
    });
    req.on('error', reject);
    if (bodyBuf.length) req.write(bodyBuf);
    req.end();
  });
}

function fold(s) {
  return cifra.foldAccents(String(s || ''));
}

const LIVROS_BIBLIA_ALIASES = new Map([
  ['atos', ['Atos', 'Atos dos Apóstolos']],
  ['atos dos apostolos', ['Atos dos Apóstolos', 'Atos']],
  ['cantares', ['Cantares', 'Cânticos']],
  ['canticos', ['Cânticos', 'Cantares']],
]);

function foldLivroBiblia(s) {
  return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function nomeTraducaoBiblia(codigo) {
  const traducao = String(codigo || '').trim().toUpperCase();
  return NOMES_TRADUCAO_BIBLIA[traducao] || traducao;
}

function resolverLivroBibliaNoDb(dbBiblia, livroInformado) {
  const livro = String(livroInformado || '').trim();
  if (!livro) return livro;

  const livrosDb = dbBiblia
    .prepare('SELECT DISTINCT name FROM book ORDER BY name COLLATE NOCASE')
    .all()
    .map((row) => String(row?.name || '').trim())
    .filter(Boolean);

  if (!livrosDb.length) return livro;

  if (livrosDb.includes(livro)) return livro;

  const livroFold = foldLivroBiblia(livro);
  const porNomeEquivalente = livrosDb.find((nomeDb) => foldLivroBiblia(nomeDb) === livroFold);
  if (porNomeEquivalente) return porNomeEquivalente;

  const aliases = LIVROS_BIBLIA_ALIASES.get(livroFold) || [];
  for (const alias of aliases) {
    const aliasFold = foldLivroBiblia(alias);
    const porAlias = livrosDb.find((nomeDb) => foldLivroBiblia(nomeDb) === aliasFold);
    if (porAlias) return porAlias;
  }

  return livro;
}

/**
 * API HTTP local do controlador (músicas, bíblia, letras, playlists, proxy de display-config).
 * @param {object} ctx Estado mutável (`controllerContext.js`).
 * @param {object} paths Caminhos (`createUserPaths`).
 */
async function iniciarServidorController(ctx, paths) {
  const db = getDb();
  const expressApp = express();
  apresentacaoVideosDirPath =
    typeof paths.apresentacaoVideosDir === 'function' ? paths.apresentacaoVideosDir() : '';
  if (apresentacaoVideosDirPath) {
    try {
      fs.mkdirSync(apresentacaoVideosDirPath, { recursive: true });
    } catch (_) {
  // intencional — erro ignorado
}
  }

  expressApp.use(express.json({ limit: '800mb' }));

  const publicDir = path.join(__dirname, '../public');
  expressApp.use(express.static(publicDir));
  expressApp.use(
    '/vendor/vosk-browser',
    express.static(path.join(__dirname, '../node_modules/vosk-browser/dist'))
  );

  expressApp.get(`/vosk-model/${vozSlidesModelo.MODEL_TAR}`, async (_req, res) => {
    try {
      const arquivo = await vozSlidesModelo.garantirModeloTarGz();
      res.sendFile(arquivo);
    } catch (err) {
      res.status(500).json({ erro: err?.message || String(err) });
    }
  });

  expressApp.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  function notificarBancoCompartilhadoAlterado(updatedAt) {
    try {
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('shared-banco-alterado', {
          updatedAt: String(updatedAt || ''),
        });
      }
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  function notificarBancoCompartilhadoAplicado(snapshot) {
    try {
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('shared-banco-aplicado', {
          snapshot,
        });
      }
    } catch (_) {
      // intencional — erro ignorado
    }
  }

  expressApp.get('/api/apresentacao/state', (_req, res) => {
    try {
      const out = apresentacaoStateMem && typeof apresentacaoStateMem === 'object' ? apresentacaoStateMem : {};
      res.json(out);
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.put('/api/apresentacao/state', (req, res) => {
    try {
      apresentacaoStateMem =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.put('/api/apresentacao/video/:id', (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const data = String(req.body?.data || '');
      let mime = String(req.body?.mime || 'video/mp4');
      if (!id || !data) {
        return res.status(400).json({ ok: false, erro: 'id e data são obrigatórios' });
      }
      let b64 = data;
      const m = data.match(/^data:([^;]+);base64,(.+)$/i);
      if (m) {
        mime = m[1] || mime;
        b64 = m[2];
      }
      const buf = Buffer.from(b64, 'base64');
      if (!buf.length) {
        return res.status(400).json({ ok: false, erro: 'vídeo vazio' });
      }
      apresentacaoVideosMem.set(id, { mime, buf });
      salvarVideoApresentacaoNoDisco(id, buf, mime);
      const url = `http://127.0.0.1:${HTTP_CONTROLLER_PORT}/api/apresentacao/video/${encodeURIComponent(id)}`;
      res.json({ ok: true, url });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/apresentacao/video/:id', (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const arquivo = resolverArquivoVideoApresentacaoNoDisco(id);
      if (arquivo) {
        return enviarVideoApresentacaoComRange(req, res, arquivo, mimePorCaminhoVideo(arquivo));
      }
      const entry = obterVideoApresentacaoPorId(id);
      if (!entry?.buf) return res.status(404).end();
      const buf = entry.buf;
      const mime = entry.mime || 'video/mp4';
      const total = buf.length;
      const range = req.headers.range;
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
        if (match) {
          const start = match[1] !== '' ? parseInt(match[1], 10) : 0;
          const end = match[2] !== '' ? parseInt(match[2], 10) : total - 1;
          if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < total) {
            const chunk = buf.subarray(start, end + 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
            res.setHeader('Content-Length', String(chunk.length));
            return res.send(chunk);
          }
        }
      }
      res.setHeader('Content-Length', String(total));
      res.send(buf);
    } catch (e) {
      res.status(500).end();
    }
  });

  expressApp.get('/api/playlists', (_req, res) => {
    try {
      res.json(loadPlaylistsJson(paths.playlistsJsonPath));
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.put('/api/playlists', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      savePlaylistsJson(paths.playlistsJsonPath, body);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.put('/api/sync/banco/meta', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      if (body.playlists != null) {
        savePlaylistsJson(paths.playlistsJsonPath, normalizePlaylistsForSync(body.playlists));
      }
      const metaAtual = loadSharedSyncMeta(paths.sharedSyncMetaPath);
      const saved = saveSharedSyncMeta(
        paths.sharedSyncMetaPath,
        {
          updatedAt: body.updatedAt != null ? body.updatedAt : metaAtual.updatedAt,
          cultosManuais: body.cultosManuais,
          temasPorCulto: body.temasPorCulto,
          aberturaRemovidaPorCulto: body.aberturaRemovidaPorCulto,
        },
        {
          fallbackUpdatedAt: metaAtual.updatedAt || new Date().toISOString(),
        }
      );
      res.json({ ok: true, updatedAt: saved.updatedAt });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/sync/banco/local', (_req, res) => {
    try {
      res.json(montarSnapshotCompartilhadoLocal(paths));
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/sync/banco/local', (req, res) => {
    try {
      const atual = montarSnapshotCompartilhadoLocal(paths);
      const incoming = normalizarSnapshotCompartilhado(req.body || {}, paths);
      if (compareUpdatedAt(incoming.updatedAt, atual.updatedAt) < 0) {
        return res.json({ ok: true, saved: false, snapshot: atual });
      }

      substituirMusicasUsuarioParaSync(incoming.musicas);
      savePlaylistsJson(paths.playlistsJsonPath, incoming.playlists);
      saveSharedSyncMeta(
        paths.sharedSyncMetaPath,
        {
          updatedAt: incoming.updatedAt || new Date().toISOString(),
          cultosManuais: incoming.cultosManuais,
          temasPorCulto: incoming.temasPorCulto,
          aberturaRemovidaPorCulto: incoming.aberturaRemovidaPorCulto,
        },
        { fallbackUpdatedAt: new Date().toISOString() }
      );

      const snapshot = montarSnapshotCompartilhadoLocal(paths);
      notificarBancoCompartilhadoAplicado(snapshot);
      res.json({ ok: true, saved: true, snapshot });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/musicas', (_req, res) => {
    try {
      const out = [];
      const rowsU = db
        .prepare(
          `SELECT id, titulo, artista FROM musicas
           WHERE parent_id IS NULL
           ORDER BY titulo COLLATE NOCASE`
        )
        .all();
      for (const r of rowsU) out.push({ ...r, fonte: 'user' });
      res.json(out);
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/musicas/buscar', (req, res) => {
    try {
      const qRaw = String(req.query.q || '').trim();
      const wantTit = req.query.titulo === '1';
      const wantArt = req.query.artista === '1';
      const wantLetra = req.query.letra === '1';
      if (!wantTit && !wantArt && !wantLetra) return res.json([]);

      const foldQ = fold(qRaw);

      const matchRow = (titulo, artista, estrofesJson) => {
        if (!foldQ) return true;
        const t = fold(titulo);
        const a = fold(artista);
        let letraTxt = '';
        try {
          const arr = JSON.parse(estrofesJson || '[]');
          letraTxt = fold(Array.isArray(arr) ? arr.join('\n') : String(arr));
        } catch (_) {
  // intencional — erro ignorado
}
        if (wantTit && t.includes(foldQ)) return true;
        if (wantArt && a.includes(foldQ)) return true;
        if (wantLetra && letraTxt.includes(foldQ)) return true;
        return false;
      };

      const out = [];
      const seen = new Set();
      const rowsU = db
        .prepare(
          `SELECT id, titulo, artista, estrofes FROM musicas WHERE parent_id IS NULL`
        )
        .all();
      for (const r of rowsU) {
        if (!matchRow(r.titulo, r.artista, r.estrofes)) continue;
        const k = `u:${r.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ id: r.id, titulo: r.titulo, artista: r.artista || '', fonte: 'user' });
      }
      const catalogDb = getCatalog();
      if (catalogDb) {
        try {
          const rowsC = catalogDb.prepare('SELECT id, titulo, artista, estrofes FROM musicas').all();
          for (const r of rowsC) {
            if (!matchRow(r.titulo, r.artista, r.estrofes)) continue;
            const k = `c:${r.id}`;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({ id: r.id, titulo: r.titulo, artista: r.artista || '', fonte: 'catalog' });
          }
        } catch (_) {
          // intencional — erro ignorado
        }
      }
      res.json(out);
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/musicas/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ erro: 'id inválido' });
      const fonte = String(req.query.fonte || 'user').toLowerCase() === 'catalog' ? 'catalog' : 'user';
      const catalogDb = getCatalog();
      const row =
        fonte === 'catalog' && catalogDb
          ? catalogDb.prepare('SELECT * FROM musicas WHERE id = ?').get(id) || null
          : db.prepare('SELECT * FROM musicas WHERE id = ?').get(id) || null;
      if (!row) return res.status(404).json({ erro: 'Não encontrado' });
      const payload = rowMusicaParaJson(row, { fonte });
      if (!payload) return res.status(404).json({ erro: 'Não encontrado' });
      res.json(payload);
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/musicas', (req, res) => {
    try {
      const { titulo, artista, estrofes } = req.body || {};
      if (typeof titulo !== 'string' || !titulo.trim()) return res.status(400).json({ erro: 'titulo obrigatório' });
      if (!Array.isArray(estrofes) || !estrofes.length)
        return res.status(400).json({ erro: 'estrofes deve ser array não vazio' });
      const norm = estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
      const ins = inserirMusicaUsuario(titulo.trim(), String(artista || '').trim(), norm);
      if (!ins.ok) return res.status(400).json({ erro: ins.erro || 'Falha ao inserir' });
      const meta = touchSharedSyncMeta(paths.sharedSyncMetaPath);
      notificarBancoCompartilhadoAlterado(meta.updatedAt);
      res.json({
        id: ins.id,
        titulo: titulo.trim(),
        artista: String(artista || '').trim(),
        root_id: ins.id,
        is_immutable: 1,
      });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/musicas/importar', (req, res) => {
    try {
      const { titulo, artista, estrofes } = req.body || {};
      const r = importarMusicaUsuarioNoDb(titulo, artista, estrofes);
      if (!r.ok) return res.status(400).json({ erro: r.erro || 'Falha ao importar' });
      const meta = touchSharedSyncMeta(paths.sharedSyncMetaPath);
      notificarBancoCompartilhadoAlterado(meta.updatedAt);
      res.json({
        id: r.id,
        rootId: r.rootId,
        copyImportada: !!r.copyImportada,
        titulo: String(titulo || '').trim(),
        artista: String(artista || '').trim(),
      });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  function salvarMusicaHandler(idRaw, req, res) {
    const id = parseInt(idRaw, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ erro: 'id inválido' });
    const { titulo, artista, estrofes } = req.body || {};
    const r = atualizarMusicaNoDb(id, titulo, artista, estrofes);
    if (!r.ok) return res.status(r.erro === 'Não encontrado' ? 404 : 400).json({ erro: r.erro });
    const meta = touchSharedSyncMeta(paths.sharedSyncMetaPath);
    notificarBancoCompartilhadoAlterado(meta.updatedAt);
    res.json({
      ok: true,
      id: r.id,
      forked: !!r.forked,
      ...(r.forked ? { previousId: r.previousId, rootId: r.rootId } : {}),
    });
  }

  expressApp.put('/api/musicas/:id', (req, res) => salvarMusicaHandler(req.params.id, req, res));
  expressApp.post('/api/musicas/:id/salvar', (req, res) => salvarMusicaHandler(req.params.id, req, res));

  expressApp.get('/api/musicas/:id/versoes', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ erro: 'id inválido' });
      const row = obterMusicaUsuarioPorId(id);
      if (!row) return res.status(404).json({ erro: 'Não encontrado' });
      const rootId = resolverRootIdDaMusica(row);
      const versoes = listarVersoesPorRootId(rootId);
      res.json({ rootId, versoes });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/musicas/:id/criar-versao', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ erro: 'id inválido' });
      const rotulo = String(req.body?.rotulo || '').trim();
      const r = criarVersaoMusicaNoDb(id, rotulo);
      if (!r.ok) return res.status(r.erro === 'Não encontrado' ? 404 : 400).json({ erro: r.erro });
      const meta = touchSharedSyncMeta(paths.sharedSyncMetaPath);
      notificarBancoCompartilhadoAlterado(meta.updatedAt);
      const row = obterMusicaUsuarioPorId(r.id);
      res.status(201).json({
        ok: true,
        forked: true,
        id: r.id,
        previousId: r.previousId,
        rootId: r.rootId,
        rotulo: r.rotulo,
        musica: rowMusicaParaJson(row, { fonte: 'user' }),
      });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  function renomearRotuloVersaoHandler(idRaw, req, res) {
    try {
      const id = parseInt(idRaw, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ erro: 'id inválido' });
      const rotulo = String(req.body?.rotulo || '').trim();
      const r = atualizarRotuloVersaoNoDb(id, rotulo);
      if (!r.ok) return res.status(r.erro === 'Não encontrado' ? 404 : 400).json({ erro: r.erro });
      const meta = touchSharedSyncMeta(paths.sharedSyncMetaPath);
      notificarBancoCompartilhadoAlterado(meta.updatedAt);
      res.json({ ok: true, id: r.id, rotulo: r.rotulo, rootId: r.rootId });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  }

  expressApp.patch('/api/musicas/:id/rotulo', (req, res) => renomearRotuloVersaoHandler(req.params.id, req, res));
  expressApp.post('/api/musicas/:id/rotulo', (req, res) => renomearRotuloVersaoHandler(req.params.id, req, res));

  function apagarMusicaHandler(id, res) {
    const idn = parseInt(id, 10);
    if (!Number.isFinite(idn)) return res.status(400).json({ erro: 'id inválido' });
    const r = apagarMusicaUsuarioNoDb(idn);
    if (!r.ok) return res.status(r.erro === 'Não encontrado' ? 404 : 400).json({ erro: r.erro });
    const meta = touchSharedSyncMeta(paths.sharedSyncMetaPath);
    notificarBancoCompartilhadoAlterado(meta.updatedAt);
    res.json({ ok: true, removidos: r.removidos, cascade: !!r.cascade, rootId: r.rootId });
  }

  expressApp.delete('/api/musicas/:id', (req, res) => apagarMusicaHandler(req.params.id, res));
  expressApp.post('/api/musicas/:id/excluir', (req, res) => apagarMusicaHandler(req.params.id, res));

  function notificarMusicasSincronizadasNoPainel(musicasOk) {
    if (!musicasOk?.length) return;
    try {
      if (ctx.windowMain && !ctx.windowMain.isDestroyed()) {
        ctx.windowMain.webContents.send('musicas-sincronizadas', { musicas: musicasOk });
      }
    } catch (_) {
  // intencional — erro ignorado
}
  }

  expressApp.post('/api/musicas/sincronizar', (req, res) => {
    try {
      const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
      if (!itens.length) return res.json({ resultados: [] });

      const resultados = [];
      const musicasOk = [];

      for (const raw of itens) {
        const clientId = String(raw?.clientId || '').trim();
        const titulo = String(raw?.titulo || '').trim();
        const artista = String(raw?.artista || '').trim();
        const estrofes = Array.isArray(raw?.estrofes) ? raw.estrofes : [];
        const cultoId = raw?.cultoId != null ? String(raw.cultoId).trim() : '';

        if (!clientId || !titulo || !estrofes.length) {
          resultados.push({
            status: 'erro',
            clientId: clientId || '?',
            erro: 'titulo e estrofes são obrigatórios',
          });
          continue;
        }

        const metaPlaylistFromImport = (imp) => {
          const base = {
            titulo,
            artista,
            bancoFonte: 'user',
            ...(cultoId ? { cultoId } : {}),
            ...(raw?.cultoLabel ? { cultoLabel: String(raw.cultoLabel) } : {}),
          };
          if (imp.copyImportada) {
            return {
              ...base,
              id: imp.rootId,
              versaoLocalId: String(imp.id),
              versaoRotulo: 'CÓPIA/IMPORTADA',
            };
          }
          return { ...base, id: imp.id };
        };

        const serverIdRaw = parseInt(raw?.serverId, 10);
        if (Number.isFinite(serverIdRaw)) {
          const r = atualizarMusicaNoDb(serverIdRaw, titulo, artista, estrofes);
          if (!r.ok) {
            resultados.push({ status: 'erro', clientId, erro: r.erro || 'Música não encontrada no controlador' });
            continue;
          }
          const idFinal = r.forked ? r.id : serverIdRaw;
          const rootSrv = r.rootId ?? resolverRootIdDaMusica(obterMusicaUsuarioPorId(idFinal));
          resultados.push({
            status: 'ok',
            clientId,
            serverId: idFinal,
            ...(r.forked ? { forked: true, copyImportada: true, rootId: rootSrv, previousId: serverIdRaw } : {}),
          });
          musicasOk.push(
            metaPlaylistFromImport({
              id: idFinal,
              rootId: rootSrv || idFinal,
              copyImportada: !!r.forked,
            })
          );
          continue;
        }

        const norm = estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
        const imp = importarMusicaUsuarioNoDb(titulo, artista, norm);
        if (!imp.ok) {
          resultados.push({ status: 'erro', clientId, erro: imp.erro || 'Falha ao importar' });
          continue;
        }
        resultados.push({
          status: 'ok',
          clientId,
          serverId: imp.id,
          ...(imp.copyImportada ? { copyImportada: true, rootId: imp.rootId } : {}),
        });
        musicasOk.push(metaPlaylistFromImport(imp));
      }

      if (musicasOk.length) {
        const meta = touchSharedSyncMeta(paths.sharedSyncMetaPath);
        notificarBancoCompartilhadoAlterado(meta.updatedAt);
      }
      notificarMusicasSincronizadasNoPainel(musicasOk);
      res.json({ resultados });
    } catch (e) {
      console.error('[Controller HTTP] musicas/sincronizar', e);
      res.status(500).json({ erro: e.message || String(e), resultados: [] });
    }
  });

  /** Inclui música existente na playlist de um culto (original ou versão importada). */
  expressApp.post('/api/playlists/adicionar-musica', (req, res) => {
    try {
      const cultoId = req.body?.cultoId != null ? String(req.body.cultoId).trim() : '';
      const idNum = parseInt(req.body?.id, 10);
      if (!cultoId || !Number.isFinite(idNum)) {
        return res.status(400).json({ erro: 'cultoId e id são obrigatórios' });
      }
      const titulo = String(req.body?.titulo || '').trim() || 'Sem título';
      const artista = String(req.body?.artista || '').trim();
      const vid =
        req.body?.versaoLocalId != null && String(req.body.versaoLocalId).trim()
          ? String(req.body.versaoLocalId).trim()
          : null;
      const versaoRotulo = String(req.body?.versaoRotulo || '').trim();
      const meta = {
        id: idNum,
        titulo,
        artista,
        bancoFonte: 'user',
        cultoId,
        // Com versão (fork): mantém par versaoLocalId + versaoRotulo como antes.
        // Sem versão mas com rótulo de origem (import sem conflito): só versaoRotulo,
        // procedência p/ exibição — não recria fork/lineage entre bancos.
        ...(vid ? { versaoLocalId: vid, versaoRotulo } : versaoRotulo ? { versaoRotulo } : {}),
        ...(req.body?.cultoLabel ? { cultoLabel: String(req.body.cultoLabel) } : {}),
      };
      notificarMusicasSincronizadasNoPainel([meta]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/biblia/traducoes', (_req, res) => {
    try {
      const rows = getBibliaTraducoesDisponiveis().map((traducao) => ({
        traducao,
        nome: nomeTraducaoBiblia(traducao),
      }));
      res.json(rows);
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/biblia/:traducao/:livro/caps', (req, res) => {
    try {
      const traducao = String(req.params.traducao || 'ARC');
      const dbBiblia = getBibliaDb(traducao);
      if (!dbBiblia) return res.json({ total: 0 });
      const livro = resolverLivroBibliaNoDb(dbBiblia, decodeURIComponent(req.params.livro));
      const row = dbBiblia
        .prepare(
          'SELECT MAX(v.chapter) as total FROM verse v JOIN book b ON b.id = v.book_id WHERE b.name = ?'
        )
        .get(livro);
      res.json({ total: row?.total || 0 });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/biblia/:traducao/:livro/:cap', (req, res) => {
    try {
      const traducao = String(req.params.traducao || 'ARC');
      const dbBiblia = getBibliaDb(traducao);
      if (!dbBiblia) return res.json([]);
      const livro = resolverLivroBibliaNoDb(dbBiblia, decodeURIComponent(req.params.livro));
      const cap = parseInt(req.params.cap, 10);
      if (!Number.isFinite(cap)) return res.status(400).json({ erro: 'cap inválido' });
      const rows = dbBiblia
        .prepare(
          `SELECT
             b.name as livro,
             v.chapter as capitulo,
             v.verse as versiculo,
             v.text as texto
           FROM verse v
           JOIN book b ON b.id = v.book_id
           WHERE b.name = ? AND v.chapter = ?
           ORDER BY v.verse`
        )
        .all(livro, cap);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/biblia/buscar', (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.json([]);
      const needle = `%${q.replace(/%/g, '').replace(/_/g, '')}%`;
      const rows = [];
      for (const traducao of getBibliaTraducoesDisponiveis()) {
        if (rows.length >= 200) break;
        const dbBiblia = getBibliaDb(traducao);
        if (!dbBiblia) continue;
        const restante = 200 - rows.length;
        const hits = dbBiblia
          .prepare(
            `SELECT
               b.name as livro,
               v.chapter as capitulo,
               v.verse as versiculo
             FROM verse v
             JOIN book b ON b.id = v.book_id
             WHERE v.text LIKE ?
             LIMIT ?`
          )
          .all(needle, restante)
          .map((row) => ({ ...row, traducao }));
        rows.push(...hits);
      }
      res.json(rows);
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/biblia/livros', (_req, res) => {
    try {
      const livros = new Set();
      for (const traducao of getBibliaTraducoesDisponiveis()) {
        const dbBiblia = getBibliaDb(traducao);
        if (!dbBiblia) continue;
        const rows = dbBiblia.prepare('SELECT DISTINCT name FROM book ORDER BY name COLLATE NOCASE').all();
        for (const row of rows) livros.add(String(row?.name || '').trim());
      }
      res.json([...livros].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')));
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/letras/buscar-local', (req, res) => {
    try {
      const qRaw = String(req.query.q || req.query.titulo || '').trim();
      const wantTit = req.query.titulo === '1';
      const wantArt = req.query.artista === '1';
      const wantLetra = req.query.letra === '1';
      if (!qRaw) return res.json({ sucesso: false, erro: 'Informe o texto da busca', resultados: [] });
      if (!wantTit && !wantArt && !wantLetra) {
        return res.json({
          sucesso: false,
          erro: 'Marque pelo menos um critério: Música (título), Artista ou Letra (trecho)',
          resultados: [],
        });
      }

      const foldQ = fold(qRaw);
      const matchRow = (titulo, artista, estrofesJson) => {
        const t = fold(titulo);
        const a = fold(artista);
        let letraTxt = '';
        try {
          const arr = JSON.parse(estrofesJson || '[]');
          letraTxt = fold(Array.isArray(arr) ? arr.join('\n') : String(arr));
        } catch (_) {
          // intencional — erro ignorado
        }
        if (wantTit && t.includes(foldQ)) return true;
        if (wantArt && a.includes(foldQ)) return true;
        if (wantLetra && letraTxt.includes(foldQ)) return true;
        return false;
      };

      const resultados = [];
      const seen = new Set();

      const rowsU = db
        .prepare(
          `SELECT id, titulo, artista, estrofes FROM musicas WHERE parent_id IS NULL`
        )
        .all();
      for (const r of rowsU) {
        if (!matchRow(r.titulo, r.artista, r.estrofes)) continue;
        const k = `u:${r.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        resultados.push({
          id: r.id,
          titulo: r.titulo,
          artista: r.artista || '',
          fonte: 'banco-local',
          origem: 'user',
        });
      }

      const catalogDb = getCatalog();
      if (catalogDb) {
        try {
          const rowsC = catalogDb.prepare('SELECT id, titulo, artista, estrofes FROM musicas').all();
          for (const r of rowsC) {
            if (!matchRow(r.titulo, r.artista, r.estrofes)) continue;
            const k = `c:${r.id}`;
            if (seen.has(k)) continue;
            seen.add(k);
            resultados.push({
              id: r.id,
              titulo: r.titulo,
              artista: r.artista || '',
              fonte: 'banco-local',
              origem: 'catalog',
            });
          }
        } catch (_) {
          // intencional — erro ignorado
        }
      }

      const limitados = resultados.slice(0, 40);
      if (!limitados.length) {
        return res.json({
          sucesso: true,
          resultados: [],
          total: 0,
          offline: true,
          catalogDisponivel: !!catalogDb,
        });
      }

      res.json({
        sucesso: true,
        resultados: limitados,
        total: limitados.length,
        offline: true,
        catalogDisponivel: !!catalogDb,
      });
    } catch (err) {
      res.json({ sucesso: false, erro: err.message, resultados: [] });
    }
  });

  expressApp.get('/api/letras/preview-local', (req, res) => {
    try {
      const idRaw = parseInt(req.query.id, 10);
      if (!Number.isFinite(idRaw)) return res.status(400).json({ sucesso: false, erro: 'id inválido' });

      const origem = String(req.query.origem || 'catalog').toLowerCase() === 'user' ? 'user' : 'catalog';
      const catalogDb = getCatalog();
      const row =
        origem === 'user'
          ? db.prepare('SELECT titulo, artista, estrofes FROM musicas WHERE id = ?').get(idRaw)
          : catalogDb
            ? catalogDb.prepare('SELECT titulo, artista, estrofes FROM musicas WHERE id = ?').get(idRaw)
            : null;

      if (origem === 'catalog' && !catalogDb) {
        return res.status(400).json({ sucesso: false, erro: 'Catálogo offline não disponível' });
      }

      if (!row) return res.status(404).json({ sucesso: false, erro: 'Música não encontrada' });

      let estrofes = [];
      try {
        estrofes = JSON.parse(row.estrofes || '[]');
      } catch (_) {
        estrofes = [];
      }

      // Para o catálogo offline as estrofes ficam pré-divididas no SQLite; ao
      // importar reagrupamos as linhas conforme «Linhas por slide» escolhido no
      // modal (2/3/4), igual ao fluxo das fontes online. As músicas do usuário
      // já são a versão salva por ele — mantemos como estão.
      const maxLinhas = cifra.normalizarMaxLinhasPorSlide(req.query.maxLinhas);
      const estrofesSaida =
        origem === 'catalog' ? cifra.normalizarEstrofesComMaxLinhas(estrofes, maxLinhas) : estrofes;

      res.json({
        sucesso: true,
        titulo: row.titulo,
        artista: row.artista || '',
        estrofes: estrofesSaida,
        fonte: 'banco-local',
        origem,
        maxLinhasPorSlide: origem === 'catalog' ? maxLinhas : undefined,
      });
    } catch (err) {
      res.status(500).json({ sucesso: false, erro: err.message });
    }
  });

  expressApp.post('/api/letras/importar-do-catalogo', (req, res) => {
    try {
      const idRaw = parseInt((req.body && req.body.id) || '', 10);
      if (!Number.isFinite(idRaw)) return res.status(400).json({ erro: 'id inválido' });
      const catalogDb = getCatalog();
      if (!catalogDb) return res.status(400).json({ erro: 'Banco offline não disponível' });

      const row = catalogDb.prepare('SELECT titulo, artista, estrofes FROM musicas WHERE id = ?').get(idRaw);
      if (!row) return res.status(404).json({ erro: 'Música não encontrada' });

      let estrofes = [];
      try {
        estrofes = JSON.parse(row.estrofes || '[]');
      } catch (_) {
        estrofes = [];
      }
      if (!Array.isArray(estrofes) || !estrofes.length)
        return res.status(400).json({ erro: 'Letra vazia no catálogo' });

      // Reagrupa as linhas conforme «Linhas por slide» escolhido no modal, para
      // que o que é importado bata com a pré-visualização.
      const maxLinhas = cifra.normalizarMaxLinhasPorSlide(req.body && req.body.maxLinhasPorSlide);
      estrofes = cifra.normalizarEstrofesComMaxLinhas(estrofes, maxLinhas);

      const titulo = String(row.titulo || '').trim();
      const artista = String(row.artista || '').trim();
      if (!titulo) return res.status(400).json({ erro: 'Título obrigatório' });

      const imp = importarMusicaUsuarioNoDb(titulo, artista, estrofes);
      if (!imp.ok) return res.status(500).json({ erro: imp.erro || 'Falha ao importar' });
      const meta = touchSharedSyncMeta(paths.sharedSyncMetaPath);
      notificarBancoCompartilhadoAlterado(meta.updatedAt);
      return res.json({
        id: imp.id,
        rootId: imp.rootId,
        copyImportada: !!imp.copyImportada,
      });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/letras/buscar', async (req, res) => {
    try {
      const tituloQ = String(req.query.titulo || '').trim();
      const artistaMarcado = req.query.artista === '1';
      const fonte = String(req.query.fonte || 'cifraclub').toLowerCase();
      if (!tituloQ)
        return res.json({ sucesso: false, erro: 'Parâmetro titulo obrigatório', resultados: [] });

      const textoBusca = tituloQ;
      let filtradas = [];

      if (fonte === 'letras-mus-br' || fonte === 'letrasmusbr') {
        filtradas = await letrasMus.buscarResultadosLetrasMusBr(textoBusca, {
          titulo: true,
          artista: artistaMarcado,
          termoFiltro: cifra.foldAccents(tituloQ),
        });
      } else {
        const html = await cifra.yahooHtmlSiteCifraClub(textoBusca);
        const bruto = cifra.extrairParesRuCifraClub(html) || [];
        const filt = { titulo: true, artista: artistaMarcado, letra: false };
        filtradas = bruto.filter((row) => cifra.candidatoCombinaBusca(row, cifra.foldAccents(tituloQ), filt));
      }

      const resultados = filtradas.slice(0, 40).map((row) => {
        const seg = row.path.split('/').filter(Boolean);
        return {
          path: row.path,
          titulo: cifra.slugParaTituloExibicao(seg[1] || ''),
          artista: cifra.slugParaTituloExibicao(seg[0] || ''),
          fonte: fonte === 'letras-mus-br' || fonte === 'letrasmusbr' ? 'letras-mus-br' : 'cifraclub',
        };
      });

      if (!resultados.length)
        return res.json({ sucesso: false, erro: 'Nenhum resultado encontrado', resultados: [] });
      res.json({ sucesso: true, resultados });
    } catch (e) {
      console.error('[Controller HTTP] letras/buscar', e);
      res.status(500).json({ sucesso: false, erro: e.message || String(e), resultados: [] });
    }
  });

  expressApp.post('/api/letras/preview', async (req, res) => {
    try {
      const pathRaw = req.body && req.body.path;
      const maxLinhas = req.body && req.body.maxLinhasPorSlide;
      const fonte = String((req.body && req.body.fonte) || 'cifraclub').toLowerCase();
      const r =
        fonte === 'letras-mus-br' || fonte === 'letrasmusbr'
          ? await letrasMus.extrairLetraLetrasMusParaPreviewOuImport(pathRaw, { maxLinhasPorSlide: maxLinhas })
          : await cifra.extrairLetraCifraClubParaPreviewOuImport(pathRaw, { maxLinhasPorSlide: maxLinhas });
      if (r.erro) return res.status(400).json({ erro: r.erro });
      res.json({
        titulo: r.titulo,
        artista: r.artista,
        estrofes: r.estrofes,
        path: r.path,
        maxLinhasPorSlide: r.maxLinhasPorSlide,
      });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/letras/importar', async (req, res) => {
    try {
      const pathRaw = req.body && req.body.path;
      const maxLinhas = req.body && req.body.maxLinhasPorSlide;
      const fonte = String((req.body && req.body.fonte) || 'cifraclub').toLowerCase();
      const r =
        fonte === 'letras-mus-br' || fonte === 'letrasmusbr'
          ? await letrasMus.extrairLetraLetrasMusParaPreviewOuImport(pathRaw, { maxLinhasPorSlide: maxLinhas })
          : await cifra.extrairLetraCifraClubParaPreviewOuImport(pathRaw, { maxLinhasPorSlide: maxLinhas });
      if (r.erro) return res.status(400).json({ erro: r.erro });

      const imp = importarMusicaUsuarioNoDb(r.titulo, r.artista, r.estrofes || []);
      if (!imp.ok) return res.status(500).json({ erro: imp.erro || 'Falha ao importar' });
      const meta = touchSharedSyncMeta(paths.sharedSyncMetaPath);
      notificarBancoCompartilhadoAlterado(meta.updatedAt);
      res.json({
        id: imp.id,
        rootId: imp.rootId,
        copyImportada: !!imp.copyImportada,
      });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  async function proxyDisplay(req, res, pathname) {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const pr = await proxyJsonToProjection('PUT', pathname, body);
      res.status(pr.status);
      const ct = pr.headers['content-type'];
      if (ct) res.setHeader('Content-Type', ct);
      res.send(pr.body.length ? pr.body.toString('utf8') : '');
    } catch (e) {
      console.error('[Controller HTTP] proxy display-config', e);
      res
        .status(502)
        .json({ erro: 'Falha ao contactar servidor de projeção (5510). ' + (e.message || String(e)) });
    }
  }

  expressApp.put('/api/display-config', (req, res) => proxyDisplay(req, res, '/api/display-config'));
  expressApp.put('/api/display-config/preview', (req, res) => proxyDisplay(req, res, '/api/display-config/preview'));

  const server = http.createServer(expressApp);
  ctx.controllerServer = server;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(HTTP_CONTROLLER_PORT, '0.0.0.0', () => {
      console.log('[Controller HTTP] escuta em 0.0.0.0:' + HTTP_CONTROLLER_PORT);
      resolve();
    });
  });

  return { server, expressApp };
}

module.exports = { iniciarServidorController, HTTP_CONTROLLER_PORT };
