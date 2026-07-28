'use strict';

/**
 * Mescla pack flat "Titulo - Artista.txt" (ou metadados no arquivo)
 * em data/catalog/letras/<Artista>/<Titulo>.txt
 *
 * Se já existir a mesma música (título + artista, case-insensitive),
 * mantém a do Lyra e ignora a do pack.
 *
 * Uso:
 *   node tools/mesclar-pack-letras.js "C:\Users\allan\Downloads\musicas_exportadas"
 */

const fs = require('fs');
const path = require('path');
const { stripLetrasPackHeader } = require('./strip-letras-pack-header');

const SRC =
  process.argv[2] ||
  process.env.LYRA_LETRAS_PACK ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'musicas_exportadas');

const DEST =
  process.env.LYRA_LETRAS_DEST ||
  path.join(__dirname, '..', 'data', 'catalog', 'letras');

function sanitizeName(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
}

function normKey(titulo, artista) {
  const n = (s) =>
    String(s || '')
      .normalize('NFC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  return `${n(titulo)}|${n(artista)}`;
}

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

/** Indexa músicas já no Lyra: chave titulo|artista → caminho. */
function indexExisting(destRoot) {
  const map = new Map();
  if (!fs.existsSync(destRoot)) return map;
  for (const file of walkTxt(destRoot)) {
    const titulo = path.basename(file, path.extname(file));
    const artista = path.basename(path.dirname(file));
    map.set(normKey(titulo, artista), file);
  }
  return map;
}

/**
 * Extrai Título/Artista do nome do arquivo e/ou do cabeçalho do conteúdo.
 * Formatos de nome:
 *   - "Titulo - Artista.txt"
 *   - "Titulo (Artista).txt"
 */
function parseMeta(fileName, rawText) {
  const base = fileName.replace(/\.txt$/i, '');
  let titulo = '';
  let artista = '';

  const paren = base.match(/^(.*)\s+\(([^)]+)\)\s*$/);
  const dashIdx = base.lastIndexOf(' - ');
  if (dashIdx !== -1) {
    titulo = base.slice(0, dashIdx).trim();
    artista = base.slice(dashIdx + 3).trim();
  } else if (paren) {
    titulo = paren[1].trim();
    artista = paren[2].trim();
  } else {
    titulo = base.trim();
  }

  // Cabeçalho pode preencher/corrigir (Artista:/Titulo:)
  const header = String(rawText || '').replace(/\r\n/g, '\n').split('\n').slice(0, 20);
  for (const line of header) {
    const m = line.match(/^(t[ií]tulo|artista)\s*:\s*(.+)\s*$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (!val) continue;
    if (key.startsWith('t') && !titulo) titulo = val;
    if (key === 'artista' && !artista) artista = val;
  }

  if (!artista) artista = 'Sem artista';
  return { titulo: titulo.trim(), artista: artista.trim() };
}

function uniquePath(dir, fileName) {
  let candidate = path.join(dir, fileName);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem} (${n})${ext}`);
    n += 1;
  }
  return candidate;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('❌ Pasta de origem não encontrada:', SRC);
    process.exit(1);
  }

  fs.mkdirSync(DEST, { recursive: true });
  const existing = indexExisting(DEST);
  console.log('📂 Origem :', SRC);
  console.log('📦 Destino:', DEST);
  console.log('📚 Já no Lyra:', existing.size);

  const files = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.txt'));
  console.log('📄 No pack :', files.length);

  let added = 0;
  let skippedDup = 0;
  let skippedEmpty = 0;
  let skippedBad = 0;
  const porArtista = new Map();

  for (const file of files) {
    const srcPath = path.join(SRC, file);
    let raw;
    try {
      raw = fs.readFileSync(srcPath, 'utf8');
    } catch (_) {
      skippedBad += 1;
      continue;
    }

    const parsed = parseMeta(file, raw);
    const artista = sanitizeName(parsed.artista);
    const titulo = sanitizeName(parsed.titulo);
    if (!titulo) {
      skippedBad += 1;
      continue;
    }

    const key = normKey(titulo, artista);
    if (existing.has(key)) {
      skippedDup += 1;
      continue;
    }

    const letra = stripLetrasPackHeader(raw).trim();
    if (!letra) {
      skippedEmpty += 1;
      continue;
    }

    const artistDir = path.join(DEST, artista);
    fs.mkdirSync(artistDir, { recursive: true });
    const destFile = uniquePath(artistDir, `${titulo}.txt`);
    fs.writeFileSync(destFile, `${letra}\n`, 'utf8');

    existing.set(key, destFile);
    porArtista.set(artista, (porArtista.get(artista) || 0) + 1);
    added += 1;

    if (added % 1000 === 0) {
      console.log(`  … ${added} adicionadas`);
    }
  }

  console.log('\n🎤 Novos por artista (top 20):');
  [...porArtista.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([a, n]) => console.log(`  ${a}: ${n}`));

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  Adicionadas     : ${added}
↷  Duplicadas      : ${skippedDup} (mantido Lyra)
⚠  Vazias          : ${skippedEmpty}
✖  Inválidas       : ${skippedBad}
📚 Total no Lyra   : ${existing.size}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Próximo passo:
  npm run catalog:build
`);
}

main();
