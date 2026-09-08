/**
 * Restaura o binário do better-sqlite3 para a versão compilada com Electron.
 * Chamado automaticamente pelo posttest:e2e.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RELEASE_DIR  = path.join(__dirname, '../node_modules/better-sqlite3/build/Release');
const BINARY       = path.join(RELEASE_DIR, 'better_sqlite3.node');
const ELECTRON_BAK = BINARY + '.electron-bak';

if (fs.existsSync(ELECTRON_BAK)) {
  console.log('[e2e-restore] Restaurando binário Electron a partir do backup…');
  fs.copyFileSync(ELECTRON_BAK, BINARY);
  fs.unlinkSync(ELECTRON_BAK);
  console.log('[e2e-restore] Binário Electron restaurado.');
} else {
  console.log('[e2e-restore] Sem backup Electron — executando electron-rebuild…');
  try {
    execSync('npx electron-rebuild -f better-sqlite3', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (e) {
    console.warn('[e2e-restore] electron-rebuild falhou (não crítico para produção):', e.message);
  }
}
