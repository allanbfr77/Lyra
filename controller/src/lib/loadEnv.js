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

/** Carrega `.env` local e variáveis de usuário do Windows (Cursor/Electron não herdam setx). */
function loadLocalEnv() {
  const srcDir = __dirname;
  loadEnvFile(path.join(srcDir, '../../.env'));
  loadEnvFile(path.join(srcDir, '../.env'));
  hydrateFromWindowsUserEnv();
}

module.exports = { loadLocalEnv };
