'use strict';

const fs = require('fs');

/**
 * @param {() => string} serverPrefsPathFn
 * @returns {{ minimizeToTray: boolean }}
 */
function loadServerPrefs(serverPrefsPathFn) {
  try {
    const raw = fs.readFileSync(serverPrefsPathFn(), 'utf8');
    const d = JSON.parse(raw);
    return { minimizeToTray: d.minimizeToTray === true };
  } catch (_) {
  // intencional — erro ignorado
}
  return { minimizeToTray: false };
}

/**
 * @param {() => string} serverPrefsPathFn
 * @param {object} partial
 */
function saveServerPrefs(serverPrefsPathFn, partial) {
  let cur = {};
  try {
    cur = JSON.parse(fs.readFileSync(serverPrefsPathFn(), 'utf8'));
  } catch (_) {
  // intencional — erro ignorado
}
  fs.writeFileSync(serverPrefsPathFn(), JSON.stringify({ ...cur, ...partial }, null, 2), 'utf8');
}

module.exports = { loadServerPrefs, saveServerPrefs };
