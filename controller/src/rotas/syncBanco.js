/**
 * Rotas HTTP :3001 do sync de banco partilhado entre Controladores.
 *
 * Extraído do servidor sem mudar paths, snapshot nem o pedido de licença.
 * A marca «o banco mudou» e o middleware `soDestaMaquina` ficam no núcleo.
 */

'use strict';

const {
  listarMusicasUsuarioParaSync,
  normalizarMusicasUsuarioParaSync,
  substituirMusicasUsuarioParaSync,
  listarMinistrantesParaSync,
  normalizarMinistrantesParaSync,
  listarTomMemoriaParaSync,
  normalizarTomMemoriaParaSync,
  listarTomPadraoParaSync,
  normalizarTomPadraoParaSync,
  substituirMinistrantesETomMemoriaParaSync,
} = require('../db');
const { loadPlaylistsJson, savePlaylistsJson } = require('../lib/playlistsStore');
const {
  loadSharedSyncMeta,
  normalizeSharedSyncMeta,
  saveSharedSyncMeta,
} = require('../lib/sharedSyncMetaStore');

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

/** Etiqueta de quem enviou: o nome do PC, e o endereço quando ele não se apresentou. */
function rotuloOrigemPedido(corpo, req) {
  const nome = String(corpo?.origem || '').trim();
  if (nome) return nome;
  const addr = String(req?.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  return addr || 'outro PC';
}

/**
 * @param {import('express').Express} expressApp
 * @param {{
 *   paths: object,
 *   soDestaMaquina: Function,
 *   notificarBancoCompartilhadoAplicado: Function,
 *   notificarPedidoSyncBanco: Function,
 * }} deps
 */
function registrarRotasSyncBanco(expressApp, deps) {
  const {
    paths,
    soDestaMaquina,
    notificarBancoCompartilhadoAplicado,
    notificarPedidoSyncBanco,
  } = deps;

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
}

module.exports = { registrarRotasSyncBanco };
