#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const sharp = require('sharp');

const ROOT_DIR = path.resolve(__dirname, '..');
const BRAND_DIR = path.join(ROOT_DIR, 'brand');

const DARK_SVG = path.join(BRAND_DIR, 'lyra-dark-512.svg');
const LIGHT_SVG = path.join(BRAND_DIR, 'lyra-light-1024.svg');
const CONTROLLER_SVG = path.join(BRAND_DIR, 'lyra-controller-512.svg');
const SERVER_SVG = path.join(BRAND_DIR, 'lyra-server-512.svg');

const DARK_PNG_SIZES = [16, 32, 48, 64, 128, 256, 512];
// Windows shortcuts/exe: include standard shell sizes (16–256).
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const APP_PNG_SIZES = [16, 32, 48, 64, 128, 256, 512];

const APP_VARIANTS = [
  {
    id: 'controller',
    svgPath: CONTROLLER_SVG,
    pngPrefix: 'lyra-controller',
    icoName: 'lyra-controller.ico',
  },
  {
    id: 'server',
    svgPath: SERVER_SVG,
    pngPrefix: 'lyra-server',
    icoName: 'lyra-server.ico',
  },
];

async function renderSvgToPng(svgPath, outputPath, size) {
  await sharp(svgPath, { density: Math.max(72, Math.ceil((size / 512) * 300)) })
    .resize(size, size)
    .png()
    .toFile(outputPath);
  console.log(`  ${path.basename(outputPath)} (${size}px)`);
}

async function writeIcoFromPngSizes(pngPaths, icoPath) {
  const { default: pngToIco } = await import('png-to-ico');
  const icoBuffer = await pngToIco(pngPaths);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`  ${path.basename(icoPath)}`);
}

async function generateAppVariant(variant) {
  if (!fs.existsSync(variant.svgPath)) {
    throw new Error(`SVG não encontrado: ${variant.svgPath}`);
  }

  console.log(`Gerando ícones do ${variant.id}...`);
  const icoInputs = [];

  for (const size of APP_PNG_SIZES) {
    const outputPath = path.join(BRAND_DIR, `${variant.pngPrefix}-${size}.png`);
    await renderSvgToPng(variant.svgPath, outputPath, size);
    if (ICO_SIZES.includes(size)) {
      icoInputs.push(outputPath);
    }
  }

  // Garante icoInputs na ordem de ICO_SIZES
  const orderedIcoInputs = ICO_SIZES.map((size) =>
    path.join(BRAND_DIR, `${variant.pngPrefix}-${size}.png`),
  );
  await writeIcoFromPngSizes(orderedIcoInputs, path.join(BRAND_DIR, variant.icoName));
}

async function main() {
  if (!fs.existsSync(DARK_SVG)) {
    throw new Error(`SVG não encontrado: ${DARK_SVG}`);
  }
  if (!fs.existsSync(LIGHT_SVG)) {
    throw new Error(`SVG não encontrado: ${LIGHT_SVG}`);
  }

  console.log('Gerando PNGs a partir de lyra-dark-512.svg...');
  for (const size of DARK_PNG_SIZES) {
    const outputPath = path.join(BRAND_DIR, `lyra-dark-${size}.png`);
    await renderSvgToPng(DARK_SVG, outputPath, size);
  }

  console.log('Gerando lyra.ico...');
  const icoInputs = ICO_SIZES.map((size) => path.join(BRAND_DIR, `lyra-dark-${size}.png`));
  await writeIcoFromPngSizes(icoInputs, path.join(BRAND_DIR, 'lyra.ico'));

  for (const variant of APP_VARIANTS) {
    await generateAppVariant(variant);
  }

  console.log('Gerando lyra-light-1024.png...');
  await renderSvgToPng(LIGHT_SVG, path.join(BRAND_DIR, 'lyra-light-1024.png'), 1024);
  console.log('Concluído.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
