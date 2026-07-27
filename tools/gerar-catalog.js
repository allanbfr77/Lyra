const fs = require('fs');
const path = require('path');

function requireBetterSqlite3() {
  const attempts = [];

  const tryLoad = (where, loader) => {
    try {
      const BetterSqlite3 = loader();
      // Validar já na carga (mismatch de NODE_MODULE_VERSION estoura aqui em new Database)
      const smoke = new BetterSqlite3(':memory:');
      smoke.close();
      return BetterSqlite3;
    } catch (e) {
      attempts.push({ where, error: e });
      return null;
    }
  };

  const root = tryLoad('raiz do projeto (node_modules)', () => {
    // Prefer the root install (recommended for running this tool)
    // eslint-disable-next-line global-require
    return require('better-sqlite3');
  });
  if (root) return root;

  const server = tryLoad('server/node_modules', () => {
    // Fallback: many Lyra installs already have it under server/
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(path.join(process.cwd(), 'server', 'node_modules', 'better-sqlite3'));
  });
  if (server) return server;

  const nodeVersion = process.version;
  const lines = [
    '❌ Não foi possível carregar o módulo "better-sqlite3".',
    '',
    `Node atual: ${nodeVersion}`,
    '',
    'Causas mais comuns:',
    '- Você não tem "better-sqlite3" instalado na raiz do projeto, OU',
    '- O "better-sqlite3" existente foi compilado para outra versão do Node (erro de NODE_MODULE_VERSION).',
    '',
    'Como resolver (escolha UMA opção):',
    '1) Instalar/compilar para o seu Node atual (recomendado para este script):',
    '   npm install better-sqlite3',
    '',
    '2) Recompilar o better-sqlite3 existente:',
    '   npm rebuild better-sqlite3',
    '',
    '3) Rodar o script com uma versão de Node compatível com o módulo já instalado (ex.: Node 20):',
    '   (use nvm-windows ou instale o Node 20 e rode novamente)',
    '',
    'Detalhes das tentativas:',
    ...attempts.map((a) => `- ${a.where}: ${a.error && a.error.message ? a.error.message : String(a.error)}`),
  ];

  throw new Error(lines.join('\n'));
}

const Database = requireBetterSqlite3();
const { stripLetrasPackHeader } = require('./strip-letras-pack-header');

// ─── CONFIGURAR AQUI ───────────────────────────────────────
// Padrão: pasta no projeto (empacotada no instalador via electron-builder).
//   data/catalog/letras/   ← .txt (subpastas = artista)
//   data/catalog/catalog.db ← gerado por este script
//
// Override opcional:
//   set LYRA_LETRAS_FOLDER=D:\OutraPastaLetras
//   node tools/gerar-catalog.js
const DATA_CATALOG_DIR = path.join(__dirname, '..', 'data', 'catalog');
const LETRAS_FOLDER = process.env.LYRA_LETRAS_FOLDER
  ? path.resolve(process.env.LYRA_LETRAS_FOLDER)
  : path.join(DATA_CATALOG_DIR, 'letras');
const OUTPUT_DB = path.join(DATA_CATALOG_DIR, 'catalog.db');
// ───────────────────────────────────────────────────────────

function parseLyricsToEstrofes(rawText) {
  // Remove cabeçalho Título/Artista/Tom/BPM/etc. de packs; depois divide estrofes.
  const letra = stripLetrasPackHeader(rawText);
  return letra
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Pastas que contêm .txt diretamente (ex.: letras/Letras/Adhemar de Campos). */
function collectPastasComMusicas(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    const txts = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.txt'));
    if (txts.length > 0) {
      out.push({ folder: dir, artista: path.basename(dir) });
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
    }
  };
  walk(root);
  return out;
}

function rebuildCatalogInPlace(sourceTempPath) {
  const src = new Database(sourceTempPath, { readonly: true });
  const rows = src.prepare('SELECT titulo, artista, estrofes FROM musicas').all();
  src.close();

  const dest = new Database(OUTPUT_DB);
  dest.exec(`
    DROP TABLE IF EXISTS musicas;
    CREATE TABLE musicas (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo     TEXT NOT NULL,
      artista    TEXT,
      estrofes   TEXT NOT NULL,
      criado_em  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_titulo  ON musicas(titulo);
    CREATE INDEX IF NOT EXISTS idx_artista ON musicas(artista);
  `);
  const insert = dest.prepare(
    'INSERT INTO musicas (titulo, artista, estrofes) VALUES (?, ?, ?)',
  );
  const tx = dest.transaction((list) => {
    for (const row of list) insert.run(row.titulo, row.artista, row.estrofes);
  });
  tx(rows);
  dest.close();
}

function replaceCatalogDb(tempPath) {
  try {
    if (fs.existsSync(OUTPUT_DB)) fs.unlinkSync(OUTPUT_DB);
    fs.renameSync(tempPath, OUTPUT_DB);
    return true;
  } catch (e) {
    if (e && (e.code === 'EBUSY' || e.code === 'EPERM')) {
      try {
        rebuildCatalogInPlace(tempPath);
        fs.unlinkSync(tempPath);
        console.warn('⚠  catalog.db estava em uso; conteúdo atualizado in-place (reinicie o controlador).');
        return true;
      } catch (e2) {
        console.error(`
❌ catalog.db está em uso e não foi possível atualizar in-place.
   Feche o Lyra Controlador / npm run start e rode de novo:
   node tools/gerar-catalog.js

   Temporário: ${tempPath}
   Detalhe: ${e2 && e2.message ? e2.message : e2}
`);
        return false;
      }
    }
    throw e;
  }
}

function main() {
  console.log('📂 Pasta de letras (.txt):', LETRAS_FOLDER);
  // Gera em arquivo temporário para não falhar se o .db estiver aberto no Electron
  const tempDb = `${OUTPUT_DB}.tmp`;
  if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);

  const db = new Database(tempDb);

  db.exec(`
    CREATE TABLE IF NOT EXISTS musicas (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo     TEXT NOT NULL,
      artista    TEXT,
      estrofes   TEXT NOT NULL,
      criado_em  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_titulo  ON musicas(titulo);
    CREATE INDEX IF NOT EXISTS idx_artista ON musicas(artista);
  `);

  const insert = db.prepare(
    'INSERT INTO musicas (titulo, artista, estrofes) VALUES (?, ?, ?)',
  );

  let totalSaved = 0;
  let totalFailed = 0;

  if (!fs.existsSync(LETRAS_FOLDER)) {
    if (fs.existsSync(OUTPUT_DB)) {
      console.warn('⚠  Pasta de letras não encontrada; mantendo catalog.db existente:', OUTPUT_DB);
      return;
    }
    console.error('❌ Pasta não encontrada:', LETRAS_FOLDER);
    console.error('   Crie data/catalog/letras/ (subpastas por artista) ou defina LYRA_LETRAS_FOLDER.');
    process.exit(1);
  }

  const pastas = collectPastasComMusicas(LETRAS_FOLDER);
  if (!pastas.length) {
    console.error('❌ Nenhum .txt encontrado em subpastas de:', LETRAS_FOLDER);
    process.exit(1);
  }

  const insertMany = db.transaction((list) => {
    for (const { titulo, artista, estrofes } of list) {
      insert.run(titulo, artista, JSON.stringify(estrofes));
      totalSaved++;
    }
  });

  for (const { folder, artista } of pastas) {
    const files = fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.txt'));

    console.log(`\n🎤 ${artista} — ${files.length} música(s)`);

    const batch = [];
    for (const file of files) {
      const titulo = file.replace(/\.txt$/i, '').trim();
      const raw = fs.readFileSync(path.join(folder, file), 'utf8');
      const estrofes = parseLyricsToEstrofes(raw);

      if (!estrofes.length) {
        console.log(`  ⚠  Pulado (vazio): ${file}`);
        totalFailed++;
        continue;
      }

      console.log(`  ✔  ${titulo} (${estrofes.length} estrofe(s))`);
      batch.push({ titulo, artista, estrofes });
    }

    if (batch.length) insertMany(batch);
  }

  db.close();

  if (!replaceCatalogDb(tempDb)) {
    process.exit(1);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  Músicas importadas : ${totalSaved}
✖  Com erro           : ${totalFailed}
📦 Banco gerado em    : ${OUTPUT_DB}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Distribuição (exe):
  O electron-builder empacota data/catalog/catalog.db em resources/catalog/.
  Antes de build:win no controlador, rode este script de novo se as letras mudarem.

Dev (npm run dev):
  O controlador abre ${OUTPUT_DB} diretamente.
  `);
}

main();
