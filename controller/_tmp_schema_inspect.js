const Database = require('better-sqlite3');
const path = require('path');

function dump(dbPath, label) {
  console.log('\n====', label, dbPath);
  const d = new Database(dbPath, { readonly: true });
  const tables = d.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
  for (const t of tables) {
    console.log('\n---', t.name);
    console.log(t.sql);
    console.log(JSON.stringify(d.prepare(`PRAGMA table_info(${t.name})`).all(), null, 2));
  }
  d.close();
}

dump(path.join(__dirname, 'data/biblia/NVI.sqlite'), 'BIBLIA NVI');
const catalogCandidates = [
  path.join(__dirname, '../data/catalog/catalog.db'),
  path.join(__dirname, 'data/catalog/catalog.db'),
];
for (const p of catalogCandidates) {
  try {
    require('fs').accessSync(p);
    dump(p, 'CATALOG');
    break;
  } catch (_) {}
}
