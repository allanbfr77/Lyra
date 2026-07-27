'use strict';

/**
 * Remove cabeçalhos Título/Artista/Tom/BPM/... de todos os .txt em data/catalog/letras.
 *
 * Uso: node tools/limpar-cabecalhos-letras.js
 */

const fs = require('fs');
const path = require('path');
const { stripLetrasPackHeader } = require('./strip-letras-pack-header');

const ROOT =
  process.argv[2] ||
  path.join(__dirname, '..', 'data', 'catalog', 'letras');

function walkTxt(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTxt(full, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) out.push(full);
  }
  return out;
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error('❌ Pasta não encontrada:', ROOT);
    process.exit(1);
  }

  const files = walkTxt(ROOT);
  let changed = 0;
  let unchanged = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const cleaned = stripLetrasPackHeader(raw);
    const before = raw.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '').trim();
    const after = cleaned.trim();

    if (before === after) {
      unchanged += 1;
      continue;
    }

    fs.writeFileSync(file, `${after}\n`, 'utf8');
    changed += 1;
  }

  console.log(`📂 Pasta   : ${ROOT}`);
  console.log(`📄 Arquivos: ${files.length}`);
  console.log(`✔ Limpos   : ${changed}`);
  console.log(`· Iguais   : ${unchanged}`);
}

main();
