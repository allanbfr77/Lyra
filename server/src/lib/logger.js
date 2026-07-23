'use strict';

const fs = require('fs');

/**
 * @param {() => string} errorLogPathFn
 * @returns {(context: string, err: Error | unknown) => void}
 */
function createLogger(errorLogPathFn) {
  return function logError(context, err) {
    try {
      const stamp = new Date().toISOString();
      const msg = err instanceof Error ? (err.stack || err.message) : String(err);
      const line = `[${stamp}] [${context}] ${msg}\n`;
      fs.appendFileSync(errorLogPathFn(), line, 'utf8');
      console.error(`[ERRO] [${context}]`, msg);
    } catch (_) {
  // intencional — erro ignorado
}
  };
}

module.exports = { createLogger };
