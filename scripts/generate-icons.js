#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { Icns, IcnsImage } = require('@fiahfy/icns');
const sharp = require('sharp');
const { Ico, IcoImage } = require('@fiahfy/ico');

const ROOT_DIR = path.resolve(__dirname, '..');
const MOBILE_ASSETS_DIR = path.join(ROOT_DIR, 'mobile', 'assets');
const EXPLICIT_SOURCE_ARG = process.argv[2];
const MASTER_SIZE = 1024;
const EXPORT_SIZE = 512;
const CONTENT_SIZE = 896;
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];
const MOBILE_IOS_BACKGROUND = { r: 26, g: 26, b: 46, alpha: 1 };
const MOBILE_ANDROID_SIZES = [
  ['icon-mdpi-48.png', 48],
  ['icon-hdpi-72.png', 72],
  ['icon-xhdpi-96.png', 96],
  ['icon-xxhdpi-144.png', 144],
  ['icon-xxxhdpi-192.png', 192],
  ['play-store-icon-512.png', 512],
];
const MOBILE_IOS_SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
const TARGET_ICON_FILES = new Set([
  'icon.png',
  'icon.ico',
  'icon.icns',
  'icon-windows.png',
  'icon-macos.png',
]);
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.expo',
  '.cursor',
]);

function walkDirectory(dirPath, accumulator = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(absolutePath, accumulator);
      continue;
    }

    if (TARGET_ICON_FILES.has(entry.name)) {
      accumulator.push(absolutePath);
    }
  }

  return accumulator;
}

function discoverIconTargets() {
  const iconFiles = walkDirectory(ROOT_DIR).sort((left, right) =>
    left.localeCompare(right, 'pt-BR'),
  );
  const directoryMap = new Map();

  for (const filePath of iconFiles) {
    const directoryPath = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const relativeDirectory = path.relative(ROOT_DIR, directoryPath);

    if (!relativeDirectory.includes(`${path.sep}public${path.sep}images`) && relativeDirectory !== path.join('public', 'images')) {
      continue;
    }

    if (!directoryMap.has(directoryPath)) {
      directoryMap.set(directoryPath, {
        directoryPath,
        relativeDirectory,
        files: new Set(),
        sourcePngPath: null,
      });
    }

    const entry = directoryMap.get(directoryPath);
    entry.files.add(fileName);

    if (fileName === 'icon.png') {
      entry.sourcePngPath = filePath;
    }
  }

  return [...directoryMap.values()].sort((left, right) =>
    left.relativeDirectory.localeCompare(right.relativeDirectory, 'pt-BR'),
  );
}

function resolveExplicitSourcePath(inputPath) {
  if (!inputPath) {
    return null;
  }

  const resolvedPath = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(ROOT_DIR, inputPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo de origem não encontrado: ${inputPath}`);
  }

  return resolvedPath;
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isLikelyBackgroundPixel(r, g, b, alpha) {
  if (alpha === 0) {
    return true;
  }

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const brightness = (r + g + b) / 3;
  const saturation = max === 0 ? 0 : delta / max;

  return brightness >= 80 && brightness <= 245 && (delta <= 20 || saturation <= 0.16);
}

function isSoftBackgroundPixel(r, g, b, alpha) {
  if (alpha === 0) {
    return true;
  }

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const brightness = (r + g + b) / 3;
  const saturation = max === 0 ? 0 : delta / max;

  return brightness >= 60 && brightness <= 248 && (delta <= 28 || saturation <= 0.2);
}

function buildRemovalMask(data, width, height) {
  const pixelCount = width * height;
  const candidateMask = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  const removalMask = new Uint8Array(pixelCount);
  const largeComponentThreshold = Math.max(512, Math.floor(pixelCount * 0.05));

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4;
    candidateMask[pixelIndex] = isLikelyBackgroundPixel(
      data[offset],
      data[offset + 1],
      data[offset + 2],
      data[offset + 3],
    )
      ? 1
      : 0;
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (!candidateMask[pixelIndex] || visited[pixelIndex]) {
      continue;
    }

    const queue = [pixelIndex];
    const component = [];
    let queueOffset = 0;
    let touchesBorder = false;

    visited[pixelIndex] = 1;

    while (queueOffset < queue.length) {
      const currentIndex = queue[queueOffset];
      queueOffset += 1;
      component.push(currentIndex);

      const y = Math.floor(currentIndex / width);
      const x = currentIndex - y * width;

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesBorder = true;
      }

      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) {
            continue;
          }

          const nextX = x + deltaX;
          const nextY = y + deltaY;

          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
            continue;
          }

          const nextIndex = nextY * width + nextX;

          if (!candidateMask[nextIndex] || visited[nextIndex]) {
            continue;
          }

          visited[nextIndex] = 1;
          queue.push(nextIndex);
        }
      }
    }

    if (touchesBorder || component.length >= largeComponentThreshold) {
      for (const componentIndex of component) {
        removalMask[componentIndex] = 1;
      }
    }
  }

  return removalMask;
}

function expandRemovalMask(data, width, height, removalMask) {
  const pixelCount = width * height;
  const expandedMask = removalMask.slice();

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (removalMask[pixelIndex]) {
      continue;
    }

    const offset = pixelIndex * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const alpha = data[offset + 3];

    if (!isSoftBackgroundPixel(r, g, b, alpha)) {
      continue;
    }

    const y = Math.floor(pixelIndex / width);
    const x = pixelIndex - y * width;

    for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
      for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
        if (deltaX === 0 && deltaY === 0) {
          continue;
        }

        const nextX = x + deltaX;
        const nextY = y + deltaY;

        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
          continue;
        }

        const nextIndex = nextY * width + nextX;

        if (removalMask[nextIndex]) {
          expandedMask[pixelIndex] = 1;
          deltaY = 2;
          break;
        }
      }
    }
  }

  return expandedMask;
}

function removeTinyForegroundArtifacts(rgba, width, height) {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const components = [];

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (visited[pixelIndex] || rgba[pixelIndex * 4 + 3] === 0) {
      continue;
    }

    const queue = [pixelIndex];
    const component = [];
    let queueOffset = 0;
    visited[pixelIndex] = 1;

    while (queueOffset < queue.length) {
      const currentIndex = queue[queueOffset];
      queueOffset += 1;
      component.push(currentIndex);

      const y = Math.floor(currentIndex / width);
      const x = currentIndex - y * width;

      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) {
            continue;
          }

          const nextX = x + deltaX;
          const nextY = y + deltaY;

          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
            continue;
          }

          const nextIndex = nextY * width + nextX;

          if (visited[nextIndex] || rgba[nextIndex * 4 + 3] === 0) {
            continue;
          }

          visited[nextIndex] = 1;
          queue.push(nextIndex);
        }
      }
    }

    components.push(component);
  }

  if (components.length <= 1) {
    return;
  }

  const largestComponentSize = components.reduce(
    (largest, component) => Math.max(largest, component.length),
    0,
  );
  const minimumComponentSize = Math.max(96, Math.floor(largestComponentSize * 0.05));

  for (const component of components) {
    if (component.length >= minimumComponentSize) {
      continue;
    }

    for (const componentIndex of component) {
      rgba[componentIndex * 4 + 3] = 0;
    }
  }
}

async function buildTransparentMaster(sourcePngPath) {
  const { data, info } = await sharp(sourcePngPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const removalMask = expandRemovalMask(
    data,
    info.width,
    info.height,
    buildRemovalMask(data, info.width, info.height),
  );
  const rgba = Buffer.from(data);

  for (let pixelIndex = 0; pixelIndex < removalMask.length; pixelIndex += 1) {
    if (!removalMask[pixelIndex]) {
      continue;
    }

    rgba[pixelIndex * 4 + 3] = 0;
  }

  removeTinyForegroundArtifacts(rgba, info.width, info.height);

  const trimmedBuffer = await sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .trim()
    .png()
    .toBuffer();

  const centeredContent = await sharp(trimmedBuffer)
    .resize(CONTENT_SIZE, CONTENT_SIZE, {
      fit: 'inside',
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: MASTER_SIZE,
      height: MASTER_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: centeredContent, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function renderPngAtSize(masterBuffer, size) {
  return sharp(masterBuffer)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

async function composeSolidBackground(masterBuffer, background) {
  return sharp({
    create: {
      width: MASTER_SIZE,
      height: MASTER_SIZE,
      channels: 4,
      background,
    },
  })
    .composite([{ input: masterBuffer, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function writeIconSet(target, masterBuffer) {
  const iconPngBuffer = await renderPngAtSize(masterBuffer, EXPORT_SIZE);
  if (target.files.has('icon.png')) {
    fs.writeFileSync(path.join(target.directoryPath, 'icon.png'), iconPngBuffer);
  }

  if (target.files.has('icon.ico')) {
    const ico = new Ico();
    for (const size of ICO_SIZES) {
      const sizedPngBuffer = await renderPngAtSize(masterBuffer, size);
      ico.append(IcoImage.fromPNG(sizedPngBuffer));
    }
    fs.writeFileSync(path.join(target.directoryPath, 'icon.ico'), ico.data);
  }

  if (target.files.has('icon.icns')) {
    const icns = new Icns();
    for (const size of ICNS_SIZES) {
      const sizedPngBuffer = await renderPngAtSize(masterBuffer, size);
      const supportedTypes = Icns.supportedIconTypes.filter((type) => type.size === size);

      for (const { osType } of supportedTypes) {
        icns.append(IcnsImage.fromPNG(sizedPngBuffer, osType));
      }
    }
    fs.writeFileSync(path.join(target.directoryPath, 'icon.icns'), icns.data);
  }

  for (const optionalPngName of ['icon-windows.png', 'icon-macos.png']) {
    if (target.files.has(optionalPngName)) {
      fs.writeFileSync(path.join(target.directoryPath, optionalPngName), iconPngBuffer);
    }
  }
}

async function writeMobileIcons(masterBuffer) {
  if (!fs.existsSync(MOBILE_ASSETS_DIR)) {
    return;
  }

  const androidDir = path.join(MOBILE_ASSETS_DIR, 'android');
  const iosDir = path.join(MOBILE_ASSETS_DIR, 'ios');
  ensureDirectory(androidDir);
  ensureDirectory(iosDir);

  const iosMasterBuffer = await composeSolidBackground(masterBuffer, MOBILE_IOS_BACKGROUND);

  fs.writeFileSync(
    path.join(MOBILE_ASSETS_DIR, 'icon.png'),
    await renderPngAtSize(iosMasterBuffer, MASTER_SIZE),
  );

  fs.writeFileSync(
    path.join(androidDir, 'icon-1024.png'),
    await renderPngAtSize(masterBuffer, MASTER_SIZE),
  );
  fs.writeFileSync(
    path.join(androidDir, 'adaptive-foreground-1024.png'),
    await renderPngAtSize(masterBuffer, MASTER_SIZE),
  );

  for (const [fileName, size] of MOBILE_ANDROID_SIZES) {
    fs.writeFileSync(path.join(androidDir, fileName), await renderPngAtSize(masterBuffer, size));
  }

  for (const size of MOBILE_IOS_SIZES) {
    fs.writeFileSync(
      path.join(iosDir, `icon-${size}.png`),
      await renderPngAtSize(iosMasterBuffer, size),
    );
  }
}

async function main() {
  const targets = discoverIconTargets();
  const targetsWithSource = targets.filter((target) => target.sourcePngPath);
  const explicitSourcePath = resolveExplicitSourcePath(EXPLICIT_SOURCE_ARG);

  if (!explicitSourcePath && targetsWithSource.length === 0) {
    throw new Error('Nenhum arquivo icon.png foi encontrado em pastas public/images.');
  }

  const masterCache = new Map();
  const canonicalSource = explicitSourcePath || targetsWithSource[0].sourcePngPath;

  for (const target of targets) {
    const sourcePngPath = explicitSourcePath || target.sourcePngPath || canonicalSource;

    if (!masterCache.has(sourcePngPath)) {
      masterCache.set(sourcePngPath, await buildTransparentMaster(sourcePngPath));
    }

    await writeIconSet(target, masterCache.get(sourcePngPath));
    console.log(`Icones regenerados em ${target.relativeDirectory}`);
  }

  if (!masterCache.has(canonicalSource)) {
    masterCache.set(canonicalSource, await buildTransparentMaster(canonicalSource));
  }
  await writeMobileIcons(masterCache.get(canonicalSource));
  if (fs.existsSync(MOBILE_ASSETS_DIR)) {
    console.log('Icones regenerados em mobile/assets');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
