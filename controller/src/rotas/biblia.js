/**
 * Rotas HTTP :3001 da Bíblia (traduções, livros, capítulos, busca).
 *
 * Extraído do servidor do controlador sem mudar paths, aliases nem JSON.
 * Os SQLite das traduções continuam em `db.js`.
 */

'use strict';

const { getBibliaDb, getBibliaTraducoesDisponiveis } = require('../db');

const NOMES_TRADUCAO_BIBLIA = {
  ARA: 'Almeida Revista e Atualizada',
  ARC: 'Almeida Revista e Corrigida',
  ACF: 'Almeida Corrigida e Fiel',
  NAA: 'Nova Almeida Atualizada',
  NTLH: 'Nova Tradução na Linguagem de Hoje',
  NVI: 'Nova Versão Internacional',
};

const LIVROS_BIBLIA_ALIASES = new Map([
  ['atos', ['Atos', 'Atos dos Apóstolos']],
  ['atos dos apostolos', ['Atos dos Apóstolos', 'Atos']],
  ['cantares', ['Cantares', 'Cânticos']],
  ['canticos', ['Cânticos', 'Cantares']],
]);

function nomeTraducaoBiblia(codigo) {
  const traducao = String(codigo || '').trim().toUpperCase();
  return NOMES_TRADUCAO_BIBLIA[traducao] || traducao;
}

/**
 * @param {import('express').Express} expressApp
 * @param {{ fold: (s: string) => string }} deps
 */
function registrarRotasBiblia(expressApp, deps) {
  const { fold } = deps;

  function foldLivroBiblia(s) {
    return fold(s).toLowerCase().replace(/\s+/g, ' ').trim();
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
}

module.exports = { registrarRotasBiblia };
