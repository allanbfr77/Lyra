'use strict';

/**
 * Shim de compatibilidade — a logica real migrou para ../core/comentariosSlide.
 * Mantido para nao quebrar imports existentes durante a extracao incremental
 * do Projection Core (ver docs/architecture/projection-core.md).
 */
module.exports = require('../core/comentariosSlide');
