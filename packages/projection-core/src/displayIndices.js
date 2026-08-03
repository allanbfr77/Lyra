'use strict';

const fs = require('fs');

/**
 * @param {() => string} displaySettingsPathFn
 * @returns {number[]}
 */
function loadDisplayIndices(displaySettingsPathFn) {
  try {
    const raw = fs.readFileSync(displaySettingsPathFn(), 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.indices)) {
      return [...new Set(data.indices)].filter((i) => Number.isInteger(i) && i >= 0).sort((a, b) => a - b);
    }
  } catch (_) {
  // intencional — erro ignorado
}
  return [1, 2];
}

/**
 * @param {() => string} displaySettingsPathFn
 * @param {number[]} indices
 */
function saveDisplayIndices(displaySettingsPathFn, indices) {
  const uniq = [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0).sort((a, b) => a - b);
  fs.writeFileSync(displaySettingsPathFn(), JSON.stringify({ indices: uniq }, null, 2), 'utf8');
}

module.exports = { loadDisplayIndices, saveDisplayIndices };
