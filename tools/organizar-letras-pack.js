'use strict';

/**
 * Converte pack flat: "Titulo (Artista).txt"
 * para estrutura Lyra: data/catalog/letras/<Artista>/<Titulo>.txt
 *
 * Uso:
 *   node tools/organizar-letras-pack.js
 *   node tools/organizar-letras-pack.js "C:\Users\allan\Downloads\letras"
 *   set LYRA_LETRAS_PACK=D:\pack && node tools/organizar-letras-pack.js
 */

const fs = require('fs');
const path = require('path');
const { stripLetrasPackHeader } = require('./strip-letras-pack-header');

const SRC =
  process.argv[2] ||
  process.env.LYRA_LETRAS_PACK ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'letras');

const DEST =
  process.env.LYRA_LETRAS_DEST ||
  path.join(__dirname, '..', 'data', 'catalog', 'letras');

/** Remove caracteres inválidos em pastas/arquivos no Windows. */
function sanitizeName(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
}

/**
 * "Titulo (Artista).txt" → { titulo, artista }
 * Usa o último "(...)" antes de .txt (ex.: "Aleluia (Hallelujah) (Gabriela Rocha).txt").
 */
function parseTituloArtista(fileName) {
  const base = fileName.replace(/\.txt$/i, '');
  const m = base.match(/^(.*)\s+\(([^)]+)\)\s*$/);
  if (!m) return null;
  const titulo = m[1].trim();
  const artista = m[2].trim();
  if (!titulo || !artista) return null;
  return { titulo, artista };
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

  const files = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.txt'));
  console.log('📂 Origem :', SRC);
  console.log('📦 Destino:', DEST);
  console.log('📄 Arquivos .txt:', files.length);

  let ok = 0;
  let skip = 0;
  const porArtista = new Map();

  for (const file of files) {
    const parsed = parseTituloArtista(file);
    if (!parsed) {
      console.log('  ⚠  Nome não reconhecido (pulei):', file);
      skip += 1;
      continue;
    }

    const artista = sanitizeName(parsed.artista);
    const titulo = sanitizeName(parsed.titulo);
    if (!artista || !titulo) {
      console.log('  ⚠  Nome inválido após sanitize (pulei):', file);
      skip += 1;
      continue;
    }

    const artistDir = path.join(DEST, artista);
    fs.mkdirSync(artistDir, { recursive: true });

    const destFile = uniquePath(artistDir, `${titulo}.txt`);
    const raw = fs.readFileSync(path.join(SRC, file), 'utf8');
    const letra = stripLetrasPackHeader(raw);
    fs.writeFileSync(destFile, letra, 'utf8');

    porArtista.set(artista, (porArtista.get(artista) || 0) + 1);
    ok += 1;
  }

  console.log('\n🎤 Por artista:');
  [...porArtista.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .forEach(([a, n]) => console.log(`  ${a}: ${n}`));

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  Organizados : ${ok}
✖  Pulados     : ${skip}
📦 Destino     : ${DEST}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Próximo passo:
  npm run catalog:build
`);
}

main();
