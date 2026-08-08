#!/usr/bin/env node
'use strict';

/**
 * Gera resources/server-build.json com buildId técnico (não é versão de produto).
 *
 * Prioridade: LYRA_SERVER_BUILD_ID → GITHUB_SHA (12 chars) → local-<timestamp>.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'server');
const outDir = path.join(root, 'resources');
const outFile = path.join(outDir, 'server-build.json');

function resolverBuildId() {
  const envId = String(process.env.LYRA_SERVER_BUILD_ID || '').trim();
  if (envId) return envId;
  const sha = String(process.env.GITHUB_SHA || '').trim();
  if (sha) return sha.slice(0, 12);
  return `local-${Date.now().toString(36)}`;
}

const buildId = resolverBuildId();
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify({ buildId }, null, 2)}\n`, 'utf8');
console.log(`[server-build] buildId=${buildId} → ${outFile}`);
