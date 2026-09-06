/**
 * Rotas HTTP :3001 de busca, preview e importação de letras
 * (catálogo offline e fontes online).
 *
 * Extraído do servidor do controlador sem mudar paths nem JSON.
 * O pacote `@lyra/letras-fontes` e os scrapers em `lib/` não mudam.
 */

'use strict';

const { getCatalog, importarMusicaUsuarioNoDb } = require('../db');
const cifra = require('../lib/cifraLetras');
const letrasMus = require('../lib/letrasMusBr');
const indiceBusca = require('../lib/indiceMusicasBusca');
const lyraSongbank = require('../lib/lyraSongbank');
const { fold, varrerMusicasPorCriterios } = require('../lib/buscaMusicasOffline');
const { modoDuplicidadeDoBody, responderDuplicidade } = require('../lib/duplicidadeHttp');

/**
 * @param {import('express').Express} expressApp
 * @param {{
 *   db: object,
 *   marcarBancoCompartilhadoAlterado: Function,
 *   notificarBancoCompartilhadoAlterado: Function,
 * }} deps
 */
function registrarRotasLetras(expressApp, deps) {
  const { db, marcarBancoCompartilhadoAlterado, notificarBancoCompartilhadoAlterado } = deps;

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
}

module.exports = { registrarRotasLetras };
