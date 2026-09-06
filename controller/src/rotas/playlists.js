/**
 * Rotas HTTP :3001 do domínio playlists / cultos.
 *
 * Extraído do servidor do controlador sem mudar paths nem JSON.
 * Sync de banco partilhado continua no núcleo.
 */

'use strict';

const { loadPlaylistsJson, savePlaylistsJson } = require('../lib/playlistsStore');

/**
 * @param {import('express').Express} expressApp
 * @param {{
 *   paths: object,
 *   notificarMusicasSincronizadasNoPainel: Function,
 * }} deps
 */
function registrarRotasPlaylists(expressApp, deps) {
  const { paths, notificarMusicasSincronizadasNoPainel } = deps;

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
}

module.exports = { registrarRotasPlaylists };
