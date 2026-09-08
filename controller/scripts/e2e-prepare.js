/**
 * Prepara o binário do better-sqlite3 para rodar com Node.js puro (testes E2E).
 *
 * O Electron usa um ABI diferente do Node.js do sistema; este script faz o swap:
 *   1. Faz backup do .node compilado para Electron  →  better_sqlite3.node.electron-bak
 *   2. Apaga o arquivo original (para o node-gyp poder recriar)
 *   3. Executa npm rebuild para compilar para o Node.js do sistema
 *
 * PRÉ-REQUISITO: o app Electron (Lyra Controlador) precisa estar FECHADO.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RELEASE_DIR   = path.join(__dirname, '../node_modules/better-sqlite3/build/Release');
const BINARY        = path.join(RELEASE_DIR, 'better_sqlite3.node');
const ELECTRON_BAK  = BINARY + '.electron-bak';
const NODE_BAK      = BINARY + '.node-bak';

// ── Se já existe backup Node.js → só restaura (rebuild foi feito antes) ──────
if (fs.existsSync(NODE_BAK)) {
  console.log('[e2e-prepare] Binário Node.js em cache — restaurando.');
  fs.copyFileSync(NODE_BAK, BINARY);
  process.exit(0);
}

// ── Backup do binário Electron atual ─────────────────────────────────────────
if (fs.existsSync(BINARY)) {
  console.log('[e2e-prepare] Fazendo backup do binário Electron…');
  try {
    fs.copyFileSync(BINARY, ELECTRON_BAK);
  } catch (e) {
    console.error('[e2e-prepare] Falha ao copiar binário Electron:', e.message);
    process.exit(1);
  }

  console.log('[e2e-prepare] Removendo binário Electron para rebuild…');
  try {
    fs.unlinkSync(BINARY);
  } catch (e) {
    console.error('\n[e2e-prepare] ERRO: Não foi possível remover o binário do Electron.');
    console.error('  → Certifique-se de que o app Lyra Controlador está FECHADO e tente novamente.\n');
    console.error('  Detalhe:', e.message);
    process.exit(1);
  }
}

// ── Rebuild para Node.js do sistema ──────────────────────────────────────────
console.log('[e2e-prepare] Reconstruindo better-sqlite3 para Node.js…');
try {
  execSync('npm rebuild better-sqlite3', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (e) {
  console.error('[e2e-prepare] Rebuild falhou. Detalhes acima.');
  process.exit(1);
}

// ── Salva backup do binário Node.js (para reutilizar sem rebuild) ─────────────
if (fs.existsSync(BINARY)) {
  fs.copyFileSync(BINARY, NODE_BAK);
  console.log('[e2e-prepare] Binário Node.js salvo em cache (.node-bak).');
}

console.log('[e2e-prepare] Pronto — better-sqlite3 compilado para Node.js.');
