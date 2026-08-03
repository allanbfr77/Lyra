'use strict';

/**
 * Shim de compatibilidade — a logica real migrou para ../core/displayIndices.
 * Mantido para nao quebrar imports existentes durante a extracao incremental
 * do Projection Core (ver docs/architecture/projection-core.md).
 */
module.exports = require('../core/displayIndices');
