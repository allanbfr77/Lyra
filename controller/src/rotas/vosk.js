/**
 * Entrega do modelo Vosk (voz → slides) na :3001.
 *
 * Extraído do servidor do controlador sem mudar o path.
 * O static `/vendor/vosk-browser` continua no núcleo.
 */

'use strict';

const vozSlidesModelo = require('../lib/vozSlidesModeloMain');

/**
 * @param {import('express').Express} expressApp
 */
function registrarRotasVosk(expressApp) {
  expressApp.get(`/vosk-model/${vozSlidesModelo.MODEL_TAR}`, async (_req, res) => {
    try {
      const arquivo = await vozSlidesModelo.garantirModeloTarGz();
      res.sendFile(arquivo);
    } catch (err) {
      res.status(500).json({ erro: err?.message || String(err) });
    }
  });
}

module.exports = { registrarRotasVosk };
