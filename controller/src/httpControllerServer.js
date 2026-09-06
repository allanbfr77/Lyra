'use strict';

const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const express = require('express');
const {
  getDb,
  getCatalog,
  importarMusicaUsuarioNoDb,
} = require('./db');
const {
  loadSharedSyncMeta,
  saveSharedSyncMeta,
} = require('./lib/sharedSyncMetaStore');
const { SERVER_URL } = require('./lib/projectionServerUrl');
const cifra = require('./lib/cifraLetras');
const letrasMus = require('./lib/letrasMusBr');
const indiceBusca = require('./lib/indiceMusicasBusca');
const lyraSongbank = require('./lib/lyraSongbank');
const { registrarRotasMusicas } = require('./rotas/musicas');
const { registrarRotasPlaylists } = require('./rotas/playlists');
const { registrarRotasMinistrantes } = require('./rotas/ministrantes');
const { registrarRotasHistorico } = require('./rotas/historico');
const { registrarRotasApresentacao } = require('./rotas/apresentacao');
const { registrarRotasSyncBanco } = require('./rotas/syncBanco');
const { registrarRotasBiblia } = require('./rotas/biblia');
const { registrarRotasVosk } = require('./rotas/vosk');

const HTTP_CONTROLLER_PORT = 3001;

function projectionBaseUrl() {
  try {
    return new URL(SERVER_URL);
  } catch (_) {
    return new URL('http://127.0.0.1:5510');
  }
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

/**
 * API HTTP local do controlador (músicas, bíblia, letras, playlists, proxy de display-config).
 * @param {object} ctx Estado mutável (`controllerContext.js`).
 * @param {object} paths Caminhos (`createUserPaths`).
 */
async function iniciarServidorController(ctx, paths) {
  const db = getDb();
  const expressApp = express();

  expressApp.use(express.json({ limit: '800mb' }));

  const publicDir = path.join(__dirname, '../public');
  expressApp.use(express.static(publicDir));
  expressApp.use(
    '/vendor/vosk-browser',
    express.static(path.join(__dirname, '../node_modules/vosk-browser/dist'))
  );

  registrarRotasVosk(expressApp);

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

  registrarRotasApresentacao(expressApp, {
    paths,
    soDestaMaquina,
    porta: HTTP_CONTROLLER_PORT,
  });

  registrarRotasPlaylists(expressApp, {
    paths,
    notificarMusicasSincronizadasNoPainel,
  });

  registrarRotasHistorico(expressApp);

  registrarRotasMinistrantes(expressApp, {
    paths,
    marcarBancoCompartilhadoAlterado,
  });

  registrarRotasSyncBanco(expressApp, {
    paths,
    soDestaMaquina,
    notificarBancoCompartilhadoAplicado,
    notificarPedidoSyncBanco,
  });

  registrarRotasMusicas(expressApp, {
    db,
    fold,
    varrerMusicasPorCriterios,
    marcarBancoCompartilhadoAlterado,
    notificarBancoCompartilhadoAlterado,
    notificarMusicasSincronizadasNoPainel,
  });

  registrarRotasBiblia(expressApp, { fold });

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
