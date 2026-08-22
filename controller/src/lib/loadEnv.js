'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_KEYS_WINDOWS = [
  'INVB_SUPABASE_ANON_KEY',
  'INVB_SUPABASE_URL',
  'LYRA_INVB_WEBHOOK_SECRET',
  'INVB_TONS_SYNC_URL',
];

function parseEnvLine(line) {
  const t = String(line || '').trim();
  if (!t || t.startsWith('#')) return null;
  const eq = t.indexOf('=');
  if (eq <= 0) return null;
  const key = t.slice(0, eq).trim();
  let val = t.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return key ? { key, val } : null;
}

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] == null || process.env[parsed.key] === '') {
      process.env[parsed.key] = parsed.val;
    }
  }
}

function readWindowsUserEnv(name) {
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

function hydrateFromWindowsUserEnv() {
  if (process.platform !== 'win32') return;
  for (const key of ENV_KEYS_WINDOWS) {
    if (String(process.env[key] || '').trim()) continue;
    const val = readWindowsUserEnv(key);
    if (val) process.env[key] = val;
  }
}

/**
 * Fallback do instalador: `resources/runtime-env.json` gerado no build
 * (`tools/gerar-controller-runtime-env.js` → extraResources).
 * Só preenche chaves ainda vazias (não sobrescreve .env / Windows).
 */
function hydrateFromPackagedRuntimeEnv() {
  const candidatos = [];
  if (process.resourcesPath) {
    candidatos.push(path.join(process.resourcesPath, 'runtime-env.json'));
  }
  candidatos.push(path.join(__dirname, '../../resources/runtime-env.json'));
  for (const filePath of candidatos) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!raw || typeof raw !== 'object') continue;
      for (const key of ENV_KEYS_WINDOWS) {
        if (String(process.env[key] || '').trim()) continue;
        const val = String(raw[key] || '').trim();
        if (val) process.env[key] = val;
      }
      return;
    } catch (_) {
      // intencional — JSON inválido ou ilegível
    }
  }
}

/** Carrega `.env` local, Windows user env e runtime-env do instalador. */
function loadLocalEnv() {
  const srcDir = __dirname;
  loadEnvFile(path.join(srcDir, '../../.env'));
  loadEnvFile(path.join(srcDir, '../.env'));
  hydrateFromWindowsUserEnv();
  hydrateFromPackagedRuntimeEnv();
}

module.exports = { loadLocalEnv };
