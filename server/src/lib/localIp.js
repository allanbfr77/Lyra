'use strict';

/**
 * Shim de compatibilidade — a logica real migrou para @lyra/projection-core.
 *
 * Passou para o Core quando o Controlador ganhou modo local: os dois hosts precisam do
 * IP de LAN para anunciar os enderecos do OBS e do celular, e uma terceira copia seria
 * a duplicacao que esta refatoracao existe para desfazer.
 */
module.exports = require('@lyra/projection-core').localIp;
