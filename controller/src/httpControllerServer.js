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
  importarMusicaUsuarioNoDb,
  listarMusicasUsuarioParaSync,
  normalizarMusicasUsuarioParaSync,
  substituirMusicasUsuarioParaSync,
  listarMinistrantesNoDb,
  listarMinistrantesParaSync,
  normalizarMinistrantesParaSync,
  listarTomMemoriaParaSync,
  normalizarTomMemoriaParaSync,
  listarTomPadraoParaSync,
  normalizarTomPadraoParaSync,
  substituirMinistrantesETomMemoriaParaSync,
  inserirMinistranteNoDb,
  atualizarMinistranteNoDb,
  apagarMinistranteNoDb,
  inserirHistoricoProjecaoNoDb,
  listarHistoricoProjecaoNoDb,
  apagarHistoricoProjecaoNoDb,
  apagarHistoricoProjecaoPorPeriodoNoDb,
  obterTomMemoriaNoDb,
  gravarTomMemoriaNoDb,
  importarTonsMemoriaDeArquivo,
} = require('./db');
const { loadPlaylistsJson, savePlaylistsJson } = require('./lib/playlistsStore');
const {
  loadSharedSyncMeta,
  normalizeSharedSyncMeta,
  saveSharedSyncMeta,
} = require('./lib/sharedSyncMetaStore');
const { SERVER_URL } = require('./lib/projectionServerUrl');
const cifra = require('./lib/cifraLetras');
const letrasMus = require('./lib/letrasMusBr');
const indiceBusca = require('./lib/indiceMusicasBusca');
const lyraSongbank = require('./lib/lyraSongbank');
const historicoProjecao = require('./lib/historicoProjecao');
const vozSlidesModelo = require('./lib/vozSlidesModeloMain');
const {
  buildImportPayloadFromSupabase,
  payloadImportFromWebhookBody,
  fetchHistoricoFromSupabase,
} = require('./lib/invbTonsFromSupabase');
const { aplicarTonsImportNasPlaylists } = require('./lib/aplicarTonsImportPlaylists');
const { registrarRotasMusicas } = require('./rotas/musicas');

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

/** Vídeos do card 5 — servidos por HTTP a partir do disco, nunca da memória. */
let apresentacaoVideosDirPath = '';
/** Pasta das mídias importadas por caminho — áudio e vídeo. Ver `apresentacaoMidiasDir`. */
let apresentacaoMidiasDirPath = '';

/** Extensões que a importação por caminho aceita. */
const EXTENSOES_MIDIA_APRESENTACAO = new Set([
  '.mp3', '.m4a', '.aac', '.ogg', '.oga', '.wav', '.flac', '.opus', '.wma',
  '.mp4', '.webm', '.ogv', '.mov', '.avi', '.mkv', '.m4v',
]);

const MIMES_MIDIA_APRESENTACAO = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.m4v': 'video/mp4',
};

/** MIME pela extensão, para áudio e vídeo. Cai em `mimePorCaminhoVideo` no desconhecido. */
function mimePorCaminhoMidia(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return MIMES_MIDIA_APRESENTACAO[ext] || mimePorCaminhoVideo(filePath);
}

/**
 * Procura o ficheiro de uma mídia pelo id, nas duas pastas.
 *
 * A pasta nova primeiro; a antiga (`apresentacao-videos`) a seguir, para os vídeos que já
 * lá estavam antes de a importação passar a copiar por caminho.
 */
function resolverArquivoMidiaApresentacao(id) {
  const safe = String(id || '').replace(/[^\w.-]+/g, '_');
  if (!safe) return null;
  for (const dir of [apresentacaoMidiasDirPath, apresentacaoVideosDirPath]) {
    if (!dir) continue;
    try {
      if (!fs.existsSync(dir)) continue;
      const found = fs.readdirSync(dir).find((f) => f.startsWith(safe + '.'));
      if (found) return path.join(dir, found);
    } catch (_) {
      // intencional — uma pasta ilegível não impede de tentar a outra
    }
  }
  return null;
}

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


function mimePorCaminhoVideo(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.ogv') return 'video/ogg';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.avi') return 'video/x-msvideo';
  return 'video/mp4';
}

/** Entrega a mídia com suporte a Range — leitura em fluxo do disco (buffer do SO). */
function enviarMidiaApresentacaoComRange(req, res, filePath, mime) {
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

/**
 * Preserva `versaoLocalId` numérico (cópia no SQLite). Remove só IDs legados `c_*`
 * de localStorage, que não existem na outra máquina.
 */
function sanitizePlaylistValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePlaylistValue(item))
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'versaoLocalId') {
      const vid = raw != null ? String(raw).trim() : '';
      if (!vid || vid.startsWith('c_')) continue;
      const n = Number(vid);
      if (!Number.isFinite(n) || n <= 0) continue;
      out[key] = String(Math.trunc(n));
      continue;
    }
    const next = sanitizePlaylistValue(raw);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

function normalizeMusicasForSync(musicas) {
  return normalizarMusicasUsuarioParaSync(musicas);
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
      ministrantePadraoPorCulto: src.ministrantePadraoPorCulto,
    },
    {
      fallbackUpdatedAt:
        opts.preserveCurrentUpdatedAt && metaAtual.updatedAt ? metaAtual.updatedAt : new Date().toISOString(),
    }
  );
  const out = {
    updatedAt: meta.updatedAt,
    musicas: normalizeMusicasForSync(src.musicas),
    playlists: normalizePlaylistsForSync(src.playlists),
    cultosManuais: meta.cultosManuais,
    temasPorCulto: meta.temasPorCulto,
    aberturaRemovidaPorCulto: meta.aberturaRemovidaPorCulto,
    ministrantePadraoPorCulto: meta.ministrantePadraoPorCulto,
  };
  /* Snapshots antigos sem estes campos: não forçar [] (evita apagar cadastro local). */
  if (Array.isArray(src.ministrantes)) {
    out.ministrantes = normalizarMinistrantesParaSync(src.ministrantes);
    out.tomMemoria = normalizarTomMemoriaParaSync(src.tomMemoria);
    out.tomPadrao = normalizarTomPadraoParaSync(src.tomPadrao);
  }
  return out;
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
    ministrantePadraoPorCulto: meta.ministrantePadraoPorCulto,
    ministrantes: listarMinistrantesParaSync(),
    tomMemoria: listarTomMemoriaParaSync(),
    tomPadrao: listarTomPadraoParaSync(),
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

/**
 * Normaliza texto para a busca offline (banco local + catálogo).
 *
 * Além de acentos/caixa, remove pontuação (ex.: vírgula em «Ah, Jesus»),
 * para que «ah jesus» encontre o título cadastrado. Os modos online já
 * toleram isso via casamento por palavra no índice; aqui o match é
 * `includes` no texto inteiro, então a pontuação precisa sumir.
 */
function fold(s) {
  return cifra
    .foldAccents(String(s || ''))
    .replace(/[.,;:!?¡¿"'’‘“”`´^~(){}[\]<>/\\|@#$%&*+=_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BUSCA_MUSICAS_LOTE = 40;

function matchTituloArtistaBusca(titulo, artista, foldQ, wantTit, wantArt) {
  if (!foldQ) return true;
  if (wantTit && fold(titulo).includes(foldQ)) return true;
  if (wantArt && fold(artista).includes(foldQ)) return true;
  return false;
}

function matchLetraBusca(estrofesJson, foldQ) {
  if (!foldQ) return false;
  try {
    const arr = JSON.parse(estrofesJson || '[]');
    const letraTxt = fold(Array.isArray(arr) ? arr.join('\n') : String(arr));
    return letraTxt.includes(foldQ);
  } catch (_) {
    return false;
  }
}

/**
 * Varre um SQLite de músicas sem carregar todas as letras de uma vez.
 * Percorre a tabela na ordem original (como o scan antigo); título/artista
 * resolvem-se na meta e as estrofes vêm em lotes, com `setImmediate` entre
 * eles, para o processo principal do Electron não congelar a digitação.
 *
 * @param {import('better-sqlite3').Database | null} sqliteDb
 * @param {{ foldQ: string, wantTit: boolean, wantArt: boolean, wantLetra: boolean, soRaiz?: boolean, limite?: number }} opts
 * @returns {Promise<Array<{ id: number, titulo: string, artista: string }>>}
 */
async function varrerMusicasPorCriterios(sqliteDb, opts) {
  const wantTit = !!opts.wantTit;
  const wantArt = !!opts.wantArt;
  const wantLetra = !!opts.wantLetra;
  const foldQ = opts.foldQ;
  const limite = Number.isFinite(opts.limite) && opts.limite > 0 ? opts.limite : Infinity;
  if (!sqliteDb || (!wantTit && !wantArt && !wantLetra)) return [];

  const sql = opts.soRaiz
    ? 'SELECT id, titulo, artista FROM musicas WHERE parent_id IS NULL'
    : 'SELECT id, titulo, artista FROM musicas';
  const metas = sqliteDb.prepare(sql).all();
  const out = [];

  for (let i = 0; i < metas.length && out.length < limite; i += BUSCA_MUSICAS_LOTE) {
    if (wantLetra && i > 0) await new Promise((r) => setImmediate(r));
    const chunk = metas.slice(i, i + BUSCA_MUSICAS_LOTE);
    const idsLetra = [];
    const hitTitArt = new Set();
    for (const r of chunk) {
      if (matchTituloArtistaBusca(r.titulo, r.artista, foldQ, wantTit, wantArt)) {
        hitTitArt.add(r.id);
      } else if (wantLetra) {
        idsLetra.push(r.id);
      }
    }
    const hitLetra = new Set();
    if (idsLetra.length) {
      const ph = idsLetra.map(() => '?').join(',');
      const rows = sqliteDb
        .prepare(`SELECT id, estrofes FROM musicas WHERE id IN (${ph})`)
        .all(...idsLetra);
      for (const row of rows) {
        if (matchLetraBusca(row.estrofes, foldQ)) hitLetra.add(row.id);
      }
    }
    for (const r of chunk) {
      if (out.length >= limite) break;
      if (hitTitArt.has(r.id) || hitLetra.has(r.id)) {
        out.push({ id: r.id, titulo: r.titulo, artista: r.artista || '' });
      }
    }
  }

  return limite === Infinity ? out : out.slice(0, limite);
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
  apresentacaoMidiasDirPath =
    typeof paths.apresentacaoMidiasDir === 'function' ? paths.apresentacaoMidiasDir() : '';
  for (const dir of [apresentacaoVideosDirPath, apresentacaoMidiasDirPath]) {
    if (!dir) continue;
    try {
      fs.mkdirSync(dir, { recursive: true });
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

  /* --- Marca «o banco compartilhado mudou» ---------------------------------- */

  const META_ALTERACAO_COALESCE_MS = 250;
  let metaAlteracaoPendente = '';
  let metaAlteracaoTimer = null;

  function gravarMarcaBancoCompartilhado() {
    metaAlteracaoTimer = null;
    const updatedAt = metaAlteracaoPendente;
    metaAlteracaoPendente = '';
    if (!updatedAt) return;
    try {
      const atual = loadSharedSyncMeta(paths.sharedSyncMetaPath);
      saveSharedSyncMeta(paths.sharedSyncMetaPath, { ...atual, updatedAt });
    } catch (e) {
      console.warn('[Lyra] marca de sincronização não gravada:', e && e.message);
    }
  }

  /**
   * «O banco mudou» — sem pagar uma escrita de ficheiro por música.
   *
   * `touchSharedSyncMeta` faz uma leitura e um `fs.writeFileSync` síncronos, e no caminho
   * da importação isso corria uma vez por música: 10 músicas, 10 ciclos de disco dentro
   * do processo principal — o mesmo que desenha a projeção.
   *
   * O `updatedAt` continua a sair na hora, porque é dele que dependem quem escuta e o
   * comparador de sincronização; só a gravação é adiada e coalescida, de modo que
   * marcações seguidas rendam um ficheiro escrito. O valor gravado é exactamente o que
   * foi anunciado — ficheiro e ouvintes nunca discordam.
   */
  function marcarBancoCompartilhadoAlterado() {
    const updatedAt = new Date().toISOString();
    metaAlteracaoPendente = updatedAt;
    if (!metaAlteracaoTimer) {
      metaAlteracaoTimer = setTimeout(gravarMarcaBancoCompartilhado, META_ALTERACAO_COALESCE_MS);
    }
    return updatedAt;
  }

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

  /**
   * Pedido de sincronização vindo de outro Controlador da rede, à espera de resposta.
   *
   * Em memória, e um só. Guardar uma fila obrigaria a uma UI de fila para um caso que não
   * acontece — dois PCs a pedir ao mesmo tempo. O pedido novo substitui o anterior: quem
   * chegou depois é quem está à espera do outro lado.
   *
   * @type {{ origem: string, recebidoEm: string, snapshot: object } | null}
   */
  let pedidoSyncBancoPendente = null;

  /**
   * Toca a campainha no painel. Devolve se havia painel para atender — é isso que diz a
   * quem enviou se há alguém em frente ao ecrã do outro lado, ou se o banco vai ficar à
   * espera de ninguém.
   */
  function notificarPedidoSyncBanco(pedido) {
    try {
      if (!ctx.windowMain || ctx.windowMain.isDestroyed()) return false;
      ctx.windowMain.webContents.send('shared-banco-pedido', {
        origem: pedido.origem,
        recebidoEm: pedido.recebidoEm,
        updatedAt: pedido.snapshot?.updatedAt || '',
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Aceitar um pedido escreve no banco desta máquina; quem decide é quem está sentado à
   * frente dela. Da rede vem o pedido, nunca a decisão.
   */
  function soDestaMaquina(req, res, next) {
    const addr = String(req?.socket?.remoteAddress || '');
    const local = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    if (!local) return res.status(403).json({ ok: false, erro: 'apenas da própria máquina' });
    next();
  }

  /** Etiqueta de quem enviou: o nome do PC, e o endereço quando ele não se apresentou. */
  function rotuloOrigemPedido(corpo, req) {
    const nome = String(corpo?.origem || '').trim();
    if (nome) return nome;
    const addr = String(req?.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    return addr || 'outro PC';
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

  function urlMidiaApresentacao(id) {
    return `http://127.0.0.1:${HTTP_CONTROLLER_PORT}/api/apresentacao/midia/${encodeURIComponent(id)}`;
  }

  /**
   * Importa uma mídia do modo Apresentação copiando o ficheiro — sem Base64 pelo meio.
   *
   * O caminho antigo era: o painel lia o ficheiro inteiro, transformava-o numa string
   * Base64 (~1,33x o tamanho), embrulhava-a em JSON e mandava-a por HTTP; deste lado o
   * body-parser guardava tudo em memória e descodificava de volta. Medido: um MP3 de
   * 7 MB custava ~92 ms e ~47 MB de heap; um vídeo de 100 MB, 1,4 s e 667 MB — que num
   * PC de 4 GB é o que faz a máquina ir para a memória virtual. `fs.copyFile` faz o
   * mesmo trabalho em 5,6 ms e 203 ms, e sem ocupar memória nenhuma.
   *
   * Só da própria máquina: o corpo traz um caminho de ficheiro, e aceitar caminhos
   * arbitrários da rede daria a qualquer aparelho da LAN uma forma de ler ficheiros
   * deste PC — bastava mandar copiar e depois pedir o GET.
   */
  expressApp.post('/api/apresentacao/midia/importar', soDestaMaquina, (req, res) => {
    void (async () => {
      try {
        const id = String((req.body && req.body.id) || '').trim();
        const origem = String((req.body && req.body.filePath) || '').trim();
        if (!id || !origem) {
          return res.status(400).json({ ok: false, erro: 'id e filePath são obrigatórios' });
        }
        if (!apresentacaoMidiasDirPath) {
          return res.status(500).json({ ok: false, erro: 'pasta de mídias indisponível' });
        }
        const ext = path.extname(origem).toLowerCase();
        if (!EXTENSOES_MIDIA_APRESENTACAO.has(ext)) {
          return res
            .status(400)
            .json({ ok: false, erro: `extensão não suportada: ${ext || '(nenhuma)'}` });
        }
        const safe = id.replace(/[^\w.-]+/g, '_');
        const destino = path.join(apresentacaoMidiasDirPath, `${safe}${ext}`);
        await fs.promises.mkdir(apresentacaoMidiasDirPath, { recursive: true });
        /* Mesmo id com outra extensão deixaria dois ficheiros a responder ao mesmo GET. */
        const anterior = resolverArquivoMidiaApresentacao(id);
        if (anterior && anterior !== destino) {
          try {
            await fs.promises.unlink(anterior);
          } catch (_) {
            // intencional — o que interessa é a cópia nova ficar de pé
          }
        }
        await fs.promises.copyFile(origem, destino);
        const stat = await fs.promises.stat(destino);
        res.json({
          ok: true,
          url: urlMidiaApresentacao(id),
          bytes: stat.size,
          mime: mimePorCaminhoMidia(destino),
        });
      } catch (e) {
        if (!res.headersSent) {
          res.status(500).json({ ok: false, erro: (e && e.message) || String(e) });
        }
      }
    })();
  });

  /** Serve a mídia importada. Em fluxo e com Range — o player pede aos pedaços. */
  expressApp.get('/api/apresentacao/midia/:id', (req, res) => {
    try {
      const arquivo = resolverArquivoMidiaApresentacao(req.params.id);
      if (!arquivo) return res.status(404).end();
      return enviarMidiaApresentacaoComRange(req, res, arquivo, mimePorCaminhoMidia(arquivo));
    } catch (_) {
      return res.status(500).end();
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
      /*
       * Só disco. Guardar também o Buffer aqui deixava o vídeo inteiro residente na RAM
       * do processo principal — 667 MB medidos para um ficheiro de 100 MB — e o GET já
       * preferia o disco de qualquer maneira. Era despesa pura.
       */
      salvarVideoApresentacaoNoDisco(id, buf, mime);
      const url = `http://127.0.0.1:${HTTP_CONTROLLER_PORT}/api/apresentacao/video/${encodeURIComponent(id)}`;
      res.json({ ok: true, url });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  /**
   * Rota antiga, mantida para os vídeos que versões anteriores gravaram e para o app de
   * celular. Serve do disco, como a rota nova — não há mais cópia em memória.
   */
  expressApp.get('/api/apresentacao/video/:id', (req, res) => {
    try {
      const arquivo = resolverArquivoMidiaApresentacao(req.params.id);
      if (!arquivo) return res.status(404).end();
      return enviarMidiaApresentacaoComRange(req, res, arquivo, mimePorCaminhoMidia(arquivo));
    } catch (_) {
      return res.status(500).end();
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

  /* —— Histórico de projeção e relatório de repertório —— */

  /**
   * Última música registada nesta sessão do controlador — ver o `POST /api/historico`.
   * @type {{chave: string, em: number} | null}
   */
  let ultimaProjecaoRegistada = null;

  /**
   * Regista que uma música foi ao ar.
   *
   * ## A regra de repetição mora aqui, não no painel
   *
   * O painel corre com `contextIsolation` e não alcança `lib/`, e reimplementá-la lá era a
   * escolha óbvia — e errada: duas cópias da regra dariam dois relatórios diferentes na
   * mesma igreja, consoante quem estivesse a operar. Por isso o painel manda a cada
   * estrofe, sem pensar, e é aqui que se decide se vira linha.
   *
   * `ultimaProjecaoRegistada` vive em memória de propósito: reiniciar o controlador começa
   * uma sessão nova, e um culto que recomeça depois de um crash deve mesmo poder registar
   * a música de abertura outra vez.
   *
   * ## Limitação conhecida: o celular não passa por aqui
   *
   * O app Android projeta emitindo `exibir_musica` directamente no socket da 5510, sem
   * falar com esta API. Uma música projetada só pelo celular NÃO entra no histórico.
   *
   * Fica assim de propósito, e não por esquecimento: cobrir esse caminho significa o
   * controlador passar a registar a partir do estado que recebe do servidor de projeção, e
   * aí tem de distinguir o que ele próprio acabou de projetar do que veio de outro
   * dispositivo — sob pena de contar cada música duas vezes, que é pior do que contar de
   * menos. Enquanto o painel do PC for quem opera o culto, o registo está onde os dados
   * completos existem: só ele conhece o tom da playlist, o ministrante do dia e o culto.
   *
   * ## Porquê 200 e não 400 quando não se grava
   *
   * Uma projeção não pode falhar porque o histórico recusou uma linha. O operador está no
   * meio de um culto e não há nada que ele possa fazer com esse erro — `registado: false`
   * diz o que aconteceu sem transformar isto num problema dele.
   */
  expressApp.post('/api/historico', (req, res) => {
    try {
      const agora = Date.now();
      const reg = historicoProjecao.normalizarRegisto(req.body, agora);
      if (!reg) {
        res.json({ registado: false, motivo: 'sem-titulo' });
        return;
      }
      if (!historicoProjecao.deveRegistar(reg, ultimaProjecaoRegistada, reg.projetadoEm)) {
        res.json({ registado: false, motivo: 'repetida' });
        return;
      }
      const id = inserirHistoricoProjecaoNoDb(reg);
      ultimaProjecaoRegistada = historicoProjecao.marcaDeRegisto(reg, reg.projetadoEm);
      res.status(201).json({ registado: true, id });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /**
   * Histórico detalhado de um período.
   *
   * `periodo` (`30d` / `90d` / `12m` / `tudo`) é o caminho normal; `de` e `ate` em ms
   * existem para a janela poder pedir um intervalo escolhido à mão sem duplicar a regra
   * dos períodos nomeados.
   */
  expressApp.get('/api/historico', (req, res) => {
    try {
      const { de, ate } = historicoProjecao.intervaloPedido(req.query, Date.now());
      res.json({ de, ate, linhas: listarHistoricoProjecaoNoDb({ de, ate }) });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /** O mesmo período, agregado por música: quantas vezes, quando foi a última, que tons. */
  expressApp.get('/api/historico/repertorio', (req, res) => {
    try {
      const { de, ate } = historicoProjecao.intervaloPedido(req.query, Date.now());
      const linhas = listarHistoricoProjecaoNoDb({ de, ate });
      res.json({ de, ate, grupos: historicoProjecao.agregarRepertorio(linhas) });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /** Remove uma linha — o registo que entrou por engano, num ensaio ou num teste. */
  expressApp.delete('/api/historico/:id', (req, res) => {
    try {
      res.json({ removido: apagarHistoricoProjecaoNoDb(req.params.id) });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /**
   * Apaga um período inteiro.
   *
   * Exige `confirmar: true` no corpo. Não é cerimónia: é a única rota do histórico que
   * destrói dados em lote e não tem como ser desfeita, e um POST sem corpo disparado por
   * engano levaria anos de registo.
   */
  expressApp.post('/api/historico/limpar', (req, res) => {
    try {
      if (!req.body || req.body.confirmar !== true) {
        res.status(400).json({ erro: 'Falta confirmar: true.' });
        return;
      }
      const { de, ate } = historicoProjecao.intervaloPedido(req.body, Date.now());
      res.json({ removidas: apagarHistoricoProjecaoPorPeriodoNoDb(de, ate) });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /* —— Ministrantes (pessoas) e memória de tom — não confundir com monitor M3. —— */
  expressApp.get('/api/ministrantes', (_req, res) => {
    try {
      res.json(listarMinistrantesNoDb());
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/ministrantes', (req, res) => {
    try {
      const nome = req.body && req.body.nome != null ? req.body.nome : '';
      const criado = inserirMinistranteNoDb(nome);
      marcarBancoCompartilhadoAlterado();
      res.status(201).json(criado);
    } catch (e) {
      res.status(e.statusCode || 500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.put('/api/ministrantes/:id', (req, res) => {
    try {
      const nome = req.body && req.body.nome != null ? req.body.nome : '';
      const atualizado = atualizarMinistranteNoDb(req.params.id, nome);
      marcarBancoCompartilhadoAlterado();
      res.json(atualizado);
    } catch (e) {
      res.status(e.statusCode || 500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.delete('/api/ministrantes/:id', (req, res) => {
    try {
      const out = apagarMinistranteNoDb(req.params.id);
      marcarBancoCompartilhadoAlterado();
      res.json(out);
    } catch (e) {
      res.status(e.statusCode || 500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.get('/api/tom-memoria', (req, res) => {
    try {
      const tom = obterTomMemoriaNoDb(
        req.query.ministranteId,
        req.query.musicaId,
        req.query.fonte,
        req.query.titulo
      );
      res.json({ tom: tom || '' });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  expressApp.put('/api/tom-memoria', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const out = gravarTomMemoriaNoDb(
        body.ministranteId,
        body.musicaId,
        body.fonte,
        body.tom
      );
      marcarBancoCompartilhadoAlterado();
      res.json(out);
    } catch (e) {
      res.status(e.statusCode || 500).json({ erro: e.message || String(e) });
    }
  });

  /** Importa JSON de tons do site (cruza título/artista; pendentes aguardam cadastro). */
  expressApp.post('/api/tom-memoria/import', (req, res) => {
    try {
      const body = req.body;
      const resumo = importarTonsMemoriaDeArquivo(body);
      const pl = aplicarTonsImportNasPlaylists(
        paths.playlistsJsonPath,
        Array.isArray(body?.itens) ? body.itens : body?.musicas || []
      );
      marcarBancoCompartilhadoAlterado();
      res.json({ ok: true, ...resumo, playlistsAtualizadas: pl.atualizadas });
    } catch (e) {
      res.status(e.statusCode || 500).json({ erro: e.message || String(e) });
    }
  });

  /**
   * Sincroniza tons/ministrantes a partir do site (Supabase) ou da API webhook na nuvem.
   * Body opcional: { fonte: 'supabase'|'cloud', since?: string }
   */
  expressApp.post('/api/tom-memoria/sync-invb', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const fontePedida = String(body.fonte || '').trim().toLowerCase();
      const cloudBase = String(
        process.env.INVB_TONS_SYNC_URL || body.cloudUrl || ''
      )
        .trim()
        .replace(/\/$/, '');
      const since = String(body.since || '').trim();

      let payload;
      let origem = 'supabase';
      let cloudUpdatedAt = '';

      if ((fontePedida === 'cloud' || (!fontePedida && cloudBase)) && cloudBase) {
        origem = 'cloud';
        const q = since ? `?since=${encodeURIComponent(since)}` : '';
        const r = await fetch(`${cloudBase}/api/invb/tons-sync${q}`);
        if (r.status === 204) {
          return res.json({
            ok: true,
            origem,
            semMudanca: true,
            updatedAt: since,
            aplicados: 0,
            pendentes: 0,
            playlistsAtualizadas: 0,
          });
        }
        if (!r.ok) {
          const errTxt = await r.text().catch(() => '');
          throw Object.assign(new Error(`Cloud sync HTTP ${r.status}: ${errTxt}`), {
            statusCode: 502,
          });
        }
        payload = await r.json();
        cloudUpdatedAt = String(payload.updatedAt || '');
      } else {
        payload = await buildImportPayloadFromSupabase();
        cloudUpdatedAt = payload.gerado_em || new Date().toISOString();
      }

      const resumo = importarTonsMemoriaDeArquivo(payload);
      const pl = aplicarTonsImportNasPlaylists(paths.playlistsJsonPath, payload.itens || []);
      marcarBancoCompartilhadoAlterado();
      res.json({
        ok: true,
        origem,
        updatedAt: cloudUpdatedAt,
        ...resumo,
        playlistsAtualizadas: pl.atualizadas,
      });
    } catch (e) {
      res.status(e.statusCode || 500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  /**
   * Recebe o mesmo payload do webhook Supabase (útil com túnel ngrok no Controlador).
   * Em produção preferir a API na nuvem + sync-invb.
   */
  expressApp.post('/api/tom-memoria/webhook-invb', async (req, res) => {
    try {
      const secretEsperado = String(process.env.LYRA_INVB_WEBHOOK_SECRET || '').trim();
      if (secretEsperado) {
        const got = String(req.get('x-lyra-webhook-secret') || '').trim();
        if (got !== secretEsperado) {
          return res.status(401).json({ ok: false, erro: 'secret inválido' });
        }
      }
      const historico = await fetchHistoricoFromSupabase().catch(() => []);
      const payload = payloadImportFromWebhookBody(req.body || {}, historico);
      if (!payload.itens || !payload.itens.length) {
        return res.json({
          ok: true,
          ignorado: true,
          motivo: 'evento sem pares tom/ministrante válidos',
        });
      }
      const resumo = importarTonsMemoriaDeArquivo(payload);
      const pl = aplicarTonsImportNasPlaylists(paths.playlistsJsonPath, payload.itens);
      marcarBancoCompartilhadoAlterado();
      res.json({ ok: true, ...resumo, playlistsAtualizadas: pl.atualizadas });
    } catch (e) {
      res.status(e.statusCode || 500).json({ ok: false, erro: e.message || String(e) });
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
          ministrantePadraoPorCulto: body.ministrantePadraoPorCulto,
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

  /**
   * Escreve um snapshot recebido no banco desta máquina.
   *
   * Extraído da rota `/api/sync/banco/local` para o pedido directo o poder reaproveitar:
   * são dois caminhos de entrada — um empurra, o outro pede licença — mas a escrita é uma
   * só, e duas cópias dela divergiriam.
   *
   * Snapshot mais antigo do que o daqui não escreve nada. É o que impede uma
   * sincronização atrasada de apagar trabalho recente do outro lado.
   */
  function aplicarSnapshotCompartilhado(corpo) {
    const atual = montarSnapshotCompartilhadoLocal(paths);
    const incoming = normalizarSnapshotCompartilhado(corpo || {}, paths);
    if (compareUpdatedAt(incoming.updatedAt, atual.updatedAt) < 0) {
      return { saved: false, snapshot: atual };
    }

    substituirMusicasUsuarioParaSync(incoming.musicas);
    savePlaylistsJson(paths.playlistsJsonPath, incoming.playlists);
    if (Array.isArray(incoming.ministrantes)) {
      substituirMinistrantesETomMemoriaParaSync(
        incoming.ministrantes,
        incoming.tomMemoria,
        incoming.tomPadrao
      );
    }
    saveSharedSyncMeta(
      paths.sharedSyncMetaPath,
      {
        updatedAt: incoming.updatedAt || new Date().toISOString(),
        cultosManuais: incoming.cultosManuais,
        temasPorCulto: incoming.temasPorCulto,
        aberturaRemovidaPorCulto: incoming.aberturaRemovidaPorCulto,
        ministrantePadraoPorCulto: incoming.ministrantePadraoPorCulto,
      },
      { fallbackUpdatedAt: new Date().toISOString() }
    );

    const snapshot = montarSnapshotCompartilhadoLocal(paths);
    notificarBancoCompartilhadoAplicado(snapshot);
    return { saved: true, snapshot };
  }

  expressApp.post('/api/sync/banco/local', (req, res) => {
    try {
      const r = aplicarSnapshotCompartilhado(req.body || {});
      res.json({ ok: true, saved: r.saved, snapshot: r.snapshot });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  /*
   * ─── Sincronização directa entre Controladores ───────────────────────────────
   *
   * O Servidor sempre foi o intermediário do banco: depósito do snapshot e carteiro a
   * avisar os outros controladores. Nenhuma das duas funções precisa dele. Cada
   * Controlador já tem esta API na 3001, aberta à LAN, e já sabe montar e aplicar um
   * snapshot — faltava só o toque à campainha.
   *
   * Isto importa para além da conveniência: com o Servidor no meio, dois PCs em que um
   * hospeda o Servidor não conseguiam sincronizar de todo, porque nesse PC o Controlador
   * não tinha como registar-se no Servidor da própria máquina.
   */

  /**
   * A campainha. Recebe o banco do outro PC e guarda-o à espera — não escreve nada.
   *
   * Aberta à LAN de propósito: é o outro PC que chama. O que a torna segura não é a
   * origem, é não decidir nada sozinha.
   */
  expressApp.post('/api/sync/banco/pedido', (req, res) => {
    try {
      const corpo = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const snapshot =
        corpo.snapshot && typeof corpo.snapshot === 'object' && !Array.isArray(corpo.snapshot)
          ? corpo.snapshot
          : null;
      if (!snapshot) return res.status(400).json({ ok: false, erro: 'snapshot ausente' });
      pedidoSyncBancoPendente = {
        origem: rotuloOrigemPedido(corpo, req),
        recebidoEm: new Date().toISOString(),
        snapshot,
      };
      /* `avisado: false` significa banco entregue a um painel que não está lá para
         responder. Quem enviou merece saber disso em vez de ver «enviado» e esperar. */
      res.json({ ok: true, avisado: notificarPedidoSyncBanco(pedidoSyncBancoPendente) });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  /** O painel pergunta o que está à espera — usado quando ele reabre com um pedido em pé. */
  expressApp.get('/api/sync/banco/pedido', soDestaMaquina, (_req, res) => {
    if (!pedidoSyncBancoPendente) return res.json({ ok: true, pedido: null });
    const { origem, recebidoEm, snapshot } = pedidoSyncBancoPendente;
    res.json({ ok: true, pedido: { origem, recebidoEm, updatedAt: snapshot?.updatedAt || '' } });
  });

  expressApp.post('/api/sync/banco/pedido/aceitar', soDestaMaquina, (_req, res) => {
    try {
      if (!pedidoSyncBancoPendente) {
        return res.status(409).json({ ok: false, erro: 'nenhum pedido pendente' });
      }
      /* Consumido antes de aplicar: se a escrita falhar a meio, o pedido não fica para
         trás à espera de ser aceite outra vez sobre um banco já meio alterado. */
      const { snapshot } = pedidoSyncBancoPendente;
      pedidoSyncBancoPendente = null;
      const r = aplicarSnapshotCompartilhado(snapshot);
      res.json({ ok: true, saved: r.saved, snapshot: r.snapshot });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message || String(e) });
    }
  });

  expressApp.post('/api/sync/banco/pedido/recusar', soDestaMaquina, (_req, res) => {
    pedidoSyncBancoPendente = null;
    res.json({ ok: true });
  });

  registrarRotasMusicas(expressApp, {
    db,
    fold,
    varrerMusicasPorCriterios,
    marcarBancoCompartilhadoAlterado,
    notificarBancoCompartilhadoAlterado,
    ctx,
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

    const catalogDb = getCatalog();
    void (async () => {
      try {
        const rows = await varrerMusicasPorCriterios(catalogDb, {
          foldQ: fold(qRaw),
          wantTit,
          wantArt,
          wantLetra,
          limite: 40,
        });
        const resultados = rows.map((r) => ({
          id: r.id,
          titulo: r.titulo,
          artista: r.artista || '',
          fonte: 'banco-local',
          origem: 'catalog',
        }));
        res.json({
          sucesso: true,
          resultados,
          total: resultados.length,
          offline: true,
          catalogDisponivel: !!catalogDb,
        });
      } catch (err) {
        if (!res.headersSent) res.json({ sucesso: false, erro: err.message, resultados: [] });
      }
    })();
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

      // HLYRCS: «Padrão do Banco» preserva a estrutura gravada; 2/3/4 só
      // empacota as linhas originais, sem o fatiamento do Cifra Club / Letras.
      const modoLinhas = cifra.resolverModoLinhasFonteBanco(req.query.maxLinhas);
      const estrofesSaida = cifra.aplicarDivisaoEstrofesFonteBanco(estrofes, modoLinhas);

      res.json({
        sucesso: true,
        titulo: row.titulo,
        artista: row.artista || '',
        estrofes: estrofesSaida,
        fonte: 'banco-local',
        origem,
        maxLinhasPorSlide: modoLinhas,
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

      // A importação segue o mesmo modo do preview (padrão do banco ou 2/3/4).
      const modoLinhas = cifra.resolverModoLinhasFonteBanco(req.body && req.body.maxLinhasPorSlide);
      estrofes = cifra.aplicarDivisaoEstrofesFonteBanco(estrofes, modoLinhas);

      const titulo = String(row.titulo || '').trim();
      const artista = String(row.artista || '').trim();
      if (!titulo) return res.status(400).json({ erro: 'Título obrigatório' });

      const imp = importarMusicaUsuarioNoDb(titulo, artista, estrofes, {
        aoDuplicar: modoDuplicidadeDoBody(req.body),
      });
      if (imp.duplicado) return responderDuplicidade(res, imp, titulo, artista);
      if (!imp.ok) return res.status(500).json({ erro: imp.erro || 'Falha ao importar' });
      const meta = { updatedAt: marcarBancoCompartilhadoAlterado() };
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
      const fonte = String(req.query.fonte || 'cifraclub').toLowerCase();
      if (lyraSongbank.ehFonteLyraOnline(fonte)) {
        const q = String(req.query.q || req.query.titulo || '').trim();
        if (!q) {
          return res.json({ sucesso: false, erro: 'Parâmetro q obrigatório', resultados: [] });
        }
        const wantTit = req.query.q != null ? req.query.titulo === '1' : true;
        const wantArt = req.query.artista === '1';
        const wantLetra = req.query.letra === '1';
        if (req.query.q != null && !wantTit && !wantArt && !wantLetra) {
          return res.json({
            sucesso: false,
            erro: 'Marque pelo menos um critério: Música (título), Artista ou Letra (trecho)',
            resultados: [],
          });
        }
        const out = await lyraSongbank.buscarMusicas({
          q,
          titulo: wantTit,
          artista: wantArt,
          letra: wantLetra,
        });
        return res.json(out);
      }

      const tituloQ = String(req.query.titulo || '').trim();
      if (!tituloQ)
        return res.json({ sucesso: false, erro: 'Parâmetro titulo obrigatório', resultados: [] });

      // Um caminho só para as duas fontes: o índice da Studio Sol atende CifraClub
      // e Letras.mus.br, porque os slugs são compartilhados entre os dois sites.
      // Antes eram dois caminhos distintos, ambos por scraping — o do Yahoo passou
      // a dar timeout e o de /busca/ do Letras a responder 404.
      const fonteNorm = indiceBusca.normalizarFonteLetras(fonte);
      const filtradas = await indiceBusca.buscarNoIndiceDeMusicas({
        texto: tituloQ,
        filtros: { titulo: true, artista: req.query.artista === '1', letra: false },
        fonte: fonteNorm,
      });

      // O índice já traz título e artista reais — não é mais preciso derivá-los
      // do slug da URL.
      const resultados = filtradas.slice(0, 40).map((row) => ({
        path: row.path,
        titulo: row.titulo || cifra.slugParaTituloExibicao((row.path.split('/').filter(Boolean))[1] || ''),
        artista: row.artista || cifra.slugParaTituloExibicao((row.path.split('/').filter(Boolean))[0] || ''),
        fonte: fonteNorm,
      }));

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
      let r;
      if (lyraSongbank.ehFonteLyraOnline(fonte)) {
        r = await lyraSongbank.extrairLetraParaPreviewOuImport(pathRaw, { maxLinhasPorSlide: maxLinhas });
      } else if (fonte === 'letras-mus-br' || fonte === 'letrasmusbr') {
        r = await letrasMus.extrairLetraLetrasMusParaPreviewOuImport(pathRaw, { maxLinhasPorSlide: maxLinhas });
      } else {
        r = await cifra.extrairLetraCifraClubParaPreviewOuImport(pathRaw, { maxLinhasPorSlide: maxLinhas });
      }
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
      let r;
      if (lyraSongbank.ehFonteLyraOnline(fonte)) {
        r = await lyraSongbank.extrairLetraParaPreviewOuImport(pathRaw, { maxLinhasPorSlide: maxLinhas });
      } else if (fonte === 'letras-mus-br' || fonte === 'letrasmusbr') {
        r = await letrasMus.extrairLetraLetrasMusParaPreviewOuImport(pathRaw, { maxLinhasPorSlide: maxLinhas });
      } else {
        r = await cifra.extrairLetraCifraClubParaPreviewOuImport(pathRaw, { maxLinhasPorSlide: maxLinhas });
      }
      if (r.erro) return res.status(400).json({ erro: r.erro });

      const imp = importarMusicaUsuarioNoDb(r.titulo, r.artista, r.estrofes || [], {
        aoDuplicar: modoDuplicidadeDoBody(req.body),
      });
      if (imp.duplicado) return responderDuplicidade(res, imp, r.titulo, r.artista);
      if (!imp.ok) return res.status(500).json({ erro: imp.erro || 'Falha ao importar' });
      const meta = { updatedAt: marcarBancoCompartilhadoAlterado() };
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
