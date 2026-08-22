#!/usr/bin/env node
'use strict';

/**
 * Gera controller/resources/runtime-env.json com a chave publishable do Supabase
 * para embutir no instalador (extraResources). Não versionar o arquivo gerado.
 *
 * Prioridade: process.env → HKCU\Environment (Windows).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KEYS = ['INVB_SUPABASE_ANON_KEY', 'INVB_SUPABASE_URL'];

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'controller', 'resources');
const outFile = path.join(outDir, 'runtime-env.json');

function readWindowsUserEnv(name) {
  if (process.platform !== 'win32') return '';
  try {
    const out = execSync(`reg query "HKCU\\Environment" /v ${name}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = out.match(new RegExp(`${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)`, 'i'));
    return m ? String(m[1]).trim() : '';
  } catch (_) {
    return '';
  }
}

function resolverValor(name) {
  const fromEnv = String(process.env[name] || '').trim();
  if (fromEnv) return fromEnv;
  return readWindowsUserEnv(name);
}

const payload = {};
for (const key of KEYS) {
  const val = resolverValor(key);
  if (val) payload[key] = val;
}

if (!payload.INVB_SUPABASE_ANON_KEY) {
  console.error(
    '[runtime-env] INVB_SUPABASE_ANON_KEY não definido.\n' +
      'Defina a variável de ambiente (ou no Windows: Variáveis de Ambiente do usuário)\n' +
      'antes de npm run build:win — o instalador precisa desta chave para sync de tons.'
  );
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(
  `[runtime-env] wrote ${outFile} (keys: ${Object.keys(payload).join(', ')})`
);
