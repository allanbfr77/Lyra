#!/usr/bin/env node
'use strict';

/**
 * Após o build NSIS do Servidor, gera server-latest.yml (manifesto companion).
 * Sem semver de produto — só buildId técnico + sha512 do instalador de nome fixo.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const serverRoot = path.join(__dirname, '..', 'server');
const distDir = path.join(serverRoot, 'dist');
const exeName = 'Lyra-Servidor-Setup.exe';
const exePath = path.join(distDir, exeName);
const buildJsonPath = path.join(serverRoot, 'resources', 'server-build.json');
const outYml = path.join(distDir, 'server-latest.yml');

function falhar(msg) {
  console.error(`[server-latest] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(exePath)) falhar(`instalador não encontrado: ${exePath}`);
if (!fs.existsSync(buildJsonPath)) falhar(`server-build.json ausente: ${buildJsonPath}`);

const buildId = String(JSON.parse(fs.readFileSync(buildJsonPath, 'utf8')).buildId || '').trim();
if (!buildId) falhar('buildId vazio em server-build.json');

const buf = fs.readFileSync(exePath);
const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
const size = buf.length;
const releaseDate = new Date().toISOString();
const compatibleController = String(process.env.LYRA_COMPATIBLE_CONTROLLER || '>=1.2.3').trim();

const yml = [
  `buildId: "${buildId}"`,
  `sha512: "${sha512}"`,
  `path: "${exeName}"`,
  `size: ${size}`,
  `releaseDate: "${releaseDate}"`,
  `compatibleController: "${compatibleController}"`,
  '',
].join('\n');

fs.writeFileSync(outYml, yml, 'utf8');
console.log(`[server-latest] wrote ${outYml} (buildId=${buildId}, size=${size})`);
