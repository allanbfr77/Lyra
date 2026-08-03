'use strict';

/**
 * Shim de compatibilidade — a logica real migrou para @lyra/projection-core.
 * Mantido para nao quebrar imports existentes durante a extracao incremental
 * do Projection Core (ver docs/architecture/projection-core.md).
 */
module.exports = require('@lyra/projection-core').projectionPayloads;
