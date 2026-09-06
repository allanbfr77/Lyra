/**
 * Rotas HTTP :3001 do domínio músicas.
 *
 * Extraído do servidor do controlador sem mudar paths nem JSON.
 * Sync de banco partilhado e importação via /api/letras* ficam no núcleo.
 */

'use strict';

const {
  getCatalog,
  rowMusicaParaJson,
  criarMusicaUsuarioNoDb,
  encontrarMusicasUsuarioDuplicadasEmLote,
  encontrarMusicaUsuarioDuplicada,
  substituirMusicaUsuarioNoDb,
  importarMusicaUsuarioNoDb,
  atualizarMusicaNoDb,
  obterMusicaUsuarioPorId,
  resolverRootIdDaMusica,
  listarVersoesPorRootId,
  garantirCopiaPadraoNoDb,
  criarVersaoMusicaNoDb,
  atualizarRotuloVersaoNoDb,
  apagarMusicaUsuarioNoDb,
} = require('../db');

/**
 * @param {import('express').Express} expressApp
 * @param {{
 *   db: object,
 *   fold: (s: string) => string,
 *   varrerMusicasPorCriterios: Function,
 *   marcarBancoCompartilhadoAlterado: Function,
 *   notificarBancoCompartilhadoAlterado: Function,
 *   notificarMusicasSincronizadasNoPainel: Function,
 * }} deps
 */
function registrarRotasMusicas(expressApp, deps) {
  const {
    db,
    fold,
    varrerMusicasPorCriterios,
    marcarBancoCompartilhadoAlterado,
    notificarBancoCompartilhadoAlterado,
    notificarMusicasSincronizadasNoPainel,
  } = deps;

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

  /**
   * Busca na Biblioteca do programa (banco do utilizador).
   *
   * O catálogo offline («Banco Local» em PESQUISAR MÚSICAS) não entra aqui —
   * tem endpoint próprio: GET /api/letras/buscar-local.
   */
  expressApp.get('/api/musicas/buscar', (req, res) => {
    const qRaw = String(req.query.q || '').trim();
    const wantTit = req.query.titulo === '1';
    const wantArt = req.query.artista === '1';
    const wantLetra = req.query.letra === '1';
    if (!wantTit && !wantArt && !wantLetra) return res.json([]);

    void (async () => {
      try {
        const rows = await varrerMusicasPorCriterios(db, {
          foldQ: fold(qRaw),
          wantTit,
          wantArt,
          wantLetra,
          soRaiz: true,
        });
        res.json(rows.map((r) => ({ ...r, fonte: 'user' })));
      } catch (e) {
        if (!res.headersSent) res.status(500).json({ erro: e.message || String(e) });
      }
    })();
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

  /**
   * Modo de resolução de duplicidade a partir do corpo da requisição.
   *
   * Sem `decisaoDuplicidade` o backend apenas **detecta** e devolve 409, sem
   * gravar: quem decide é o usuário, no diálogo do controlador. Com
   * `decisaoDuplicidade: 'criar'` a escolha já foi feita e a cópia é gravada.
   */
  function modoDuplicidadeDoBody(body) {
    const decisao = String((body && body.decisaoDuplicidade) || '').trim().toLowerCase();
    return decisao === 'criar' ? 'copiar' : 'perguntar';
  }

  /** Resposta padrão de duplicidade detectada (nada foi gravado no banco). */
  function responderDuplicidade(res, resultado, titulo, artista) {
    return res.status(409).json({
      duplicado: true,
      existente: resultado.existente,
      titulo: String(titulo || '').trim(),
      artista: String(artista || '').trim(),
    });
  }

  expressApp.post('/api/musicas', (req, res) => {
    try {
      const { titulo, artista, estrofes } = req.body || {};
      if (typeof titulo !== 'string' || !titulo.trim()) return res.status(400).json({ erro: 'titulo obrigatório' });
      if (!Array.isArray(estrofes) || !estrofes.length)
        return res.status(400).json({ erro: 'estrofes deve ser array não vazio' });
      const norm = estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
      const ins = criarMusicaUsuarioNoDb(titulo.trim(), String(artista || '').trim(), norm, {
        aoDuplicar: modoDuplicidadeDoBody(req.body),
      });
      if (ins.duplicado) return responderDuplicidade(res, ins, titulo, artista);
      if (!ins.ok) return res.status(400).json({ erro: ins.erro || 'Falha ao inserir' });
      const meta = { updatedAt: marcarBancoCompartilhadoAlterado() };
      notificarBancoCompartilhadoAlterado(meta.updatedAt);
      res.json({
        id: ins.id,
        titulo: titulo.trim(),
        artista: String(artista || '').trim(),
        root_id: ins.rootId,
        is_immutable: ins.copyImportada ? 0 : 1,
        copyImportada: !!ins.copyImportada,
        // Cópia editável criada junto com o original (é a que o controlador abre).
        copiaId: ins.copiaId != null ? ins.copiaId : null,
      });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e) });
    }
  });

  /**
   * Checagem de duplicidade em lote — **somente leitura**, nada é gravado.
   *
   * Serve à janela de confirmação da importação por código, que precisa marcar
   * quais músicas recebidas já existem antes de o usuário decidir. Não dá para
   * usar `/api/musicas/importar` com `perguntar` para isto: lá, a ausência de
   * duplicata resulta em inserção.
   */
  expressApp.post('/api/musicas/checar-duplicidade', (req, res) => {
    try {
      const lista = Array.isArray(req.body && req.body.musicas) ? req.body.musicas : [];
      // Uma varredura para a lista inteira — ver `encontrarMusicasUsuarioDuplicadasEmLote`.
      // Sem as estrofes: aqui só interessa sinalizar. A letra completa é
      // carregada depois, pela janela de conflito, música a música.
      const resultados = encontrarMusicasUsuarioDuplicadasEmLote(lista).map((r) =>
        r.duplicado
          ? {
              duplicado: true,
              id: r.id,
              titulo: r.titulo,
              artista: r.artista,
              motivo: r.motivo,
            }
          : { duplicado: false }
      );
      res.json({ resultados });
    } catch (e) {
      res.status(500).json({ erro: e.message || String(e), resultados: [] });
    }
  });

  /**
   * Importação por código (playlist compartilhada entre máquinas).
   *
   * `decisaoDuplicidade` no corpo controla o que fazer se já existir equivalente:
   *  - ausente / `copiar`: grava Cópia/Importada automaticamente. **Default por
   *    compatibilidade** — é o que o app do celular usa, onde não há janela de
   *    conflito para perguntar;
   *  - `perguntar`: só detecta e responde 409, sem gravar nada (usado pelo
   *    controlador para abrir a janela de conflito);
   *  - `criar`: duplica como nova versão (decisão «Duplicar»);
   *  - `substituir`: sobrescreve a música existente (decisão «Substituir»).
   */
  expressApp.post('/api/musicas/importar', (req, res) => {
    try {
      const { titulo, artista, estrofes } = req.body || {};
      const decisao = String((req.body && req.body.decisaoDuplicidade) || '').trim().toLowerCase();

      if (decisao === 'substituir') {
        const alvo = encontrarMusicaUsuarioDuplicada(titulo, artista);
        if (!alvo) return res.status(409).json({ erro: 'Música existente não encontrada para substituir' });
        const sub = substituirMusicaUsuarioNoDb(alvo.id, titulo, artista, estrofes);
        if (!sub.ok) return res.status(400).json({ erro: sub.erro || 'Falha ao substituir' });
        const metaSub = { updatedAt: marcarBancoCompartilhadoAlterado() };
        notificarBancoCompartilhadoAlterado(metaSub.updatedAt);
        return res.json({
          id: sub.id,
          rootId: sub.rootId,
          copyImportada: false,
          substituida: true,
          titulo: String(titulo || '').trim(),
          artista: String(artista || '').trim(),
        });
      }

      const r = importarMusicaUsuarioNoDb(titulo, artista, estrofes, {
        aoDuplicar: decisao === 'perguntar' ? 'perguntar' : 'copiar',
      });
      if (r.duplicado) return responderDuplicidade(res, r, titulo, artista);
      if (!r.ok) return res.status(400).json({ erro: r.erro || 'Falha ao importar' });
      const meta = { updatedAt: marcarBancoCompartilhadoAlterado() };
      notificarBancoCompartilhadoAlterado(meta.updatedAt);
      res.json({
        id: r.id,
        rootId: r.rootId,
        copyImportada: !!r.copyImportada,
        copiaId: r.copiaId != null ? r.copiaId : null,
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
    const meta = { updatedAt: marcarBancoCompartilhadoAlterado() };
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

  /**
   * Cópia editável padrão da música — criada na hora se ainda não existir.
   *
   * É o que o controlador abre quando o usuário clica numa música: o ORIGINAL
   * fica preservado e a edição acontece sempre sobre esta cópia. Músicas
   * cadastradas antes deste comportamento não têm cópia; a primeira abertura
   * materializa uma, sem tocar no original.
   */
  expressApp.post('/api/musicas/:id/copia-padrao', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ erro: 'id inválido' });
      const r = garantirCopiaPadraoNoDb(id);
      if (!r.ok) return res.status(r.erro === 'Não encontrado' ? 404 : 400).json({ erro: r.erro });
      if (r.criada) {
        const meta = { updatedAt: marcarBancoCompartilhadoAlterado() };
        notificarBancoCompartilhadoAlterado(meta.updatedAt);
      }
      const row = obterMusicaUsuarioPorId(r.id);
      if (!row) return res.status(404).json({ erro: 'Não encontrado' });
      res.json({
        ok: true,
        id: r.id,
        rootId: r.rootId,
        criada: !!r.criada,
        musica: rowMusicaParaJson(row, { fonte: 'user' }),
      });
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
      const meta = { updatedAt: marcarBancoCompartilhadoAlterado() };
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
      const meta = { updatedAt: marcarBancoCompartilhadoAlterado() };
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
    const meta = { updatedAt: marcarBancoCompartilhadoAlterado() };
    notificarBancoCompartilhadoAlterado(meta.updatedAt);
    res.json({ ok: true, removidos: r.removidos, cascade: !!r.cascade, rootId: r.rootId });
  }

  expressApp.delete('/api/musicas/:id', (req, res) => apagarMusicaHandler(req.params.id, res));
  expressApp.post('/api/musicas/:id/excluir', (req, res) => apagarMusicaHandler(req.params.id, res));

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
              versaoRotulo: 'Cópia/Importada',
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
        // Lote vindo do celular: sem diálogo possível, mantém Cópia/Importada.
        const imp = importarMusicaUsuarioNoDb(titulo, artista, norm, { aoDuplicar: 'copiar' });
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
        const meta = { updatedAt: marcarBancoCompartilhadoAlterado() };
        notificarBancoCompartilhadoAlterado(meta.updatedAt);
      }
      notificarMusicasSincronizadasNoPainel(musicasOk);
      res.json({ resultados });
    } catch (e) {
      console.error('[Controller HTTP] musicas/sincronizar', e);
      res.status(500).json({ erro: e.message || String(e), resultados: [] });
    }
  });
}

module.exports = { registrarRotasMusicas };
