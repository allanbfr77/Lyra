/**
 * Rotas HTTP :3001 do domínio ministrantes e memória de tom.
 *
 * Extraído do servidor do controlador sem mudar paths nem JSON.
 * Sync de banco partilhado continua no núcleo.
 */

'use strict';

const {
  listarMinistrantesNoDb,
  inserirMinistranteNoDb,
  atualizarMinistranteNoDb,
  apagarMinistranteNoDb,
  obterTomMemoriaNoDb,
  gravarTomMemoriaNoDb,
  importarTonsMemoriaDeArquivo,
} = require('../db');
const {
  buildImportPayloadFromSupabase,
  payloadImportFromWebhookBody,
  fetchHistoricoFromSupabase,
} = require('../lib/invbTonsFromSupabase');
const { aplicarTonsImportNasPlaylists } = require('../lib/aplicarTonsImportPlaylists');

/**
 * @param {import('express').Express} expressApp
 * @param {{
 *   paths: object,
 *   marcarBancoCompartilhadoAlterado: Function,
 * }} deps
 */
function registrarRotasMinistrantes(expressApp, deps) {
  const { paths, marcarBancoCompartilhadoAlterado } = deps;

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
}

module.exports = { registrarRotasMinistrantes };
