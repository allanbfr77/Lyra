'use strict';

/**
 * URL do host de projeção nesta máquina (porta 5510).
 * Sobrescreve com a env `SERVER_URL` quando necessário (testes / builds especiais).
 *
 * Era exportada por `serverLink.js` — módulo do cliente Socket.IO do processo principal,
 * removido porque o main nunca se ligava e o único consumidor restante é HTTP (consoles
 * de diagnóstico e proxies do controlador). Ver docs/architecture/projection-core.md §12.8.
 */
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5510';

module.exports = { SERVER_URL };
