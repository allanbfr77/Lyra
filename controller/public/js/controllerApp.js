/**
 * Entrada ES module do painel do controlador (Electron / Chromium).
 *
 * Ordem no `controller.html`:
 *   0. `css/controller.css` — folha do painel
 *   1. `publicDisplayConfig.js` — script «clássico» que define `window.attachPublicDisplayConfig`
 *   2. Este ficheiro (`type="module"`) — importa o núcleo e corre após o parsing do documento (defer)
 *   3. `controllerAppCore.js` — estado, Socket.IO, UI; expõe no `window` as funções usadas em `onclick="…"`
 *   4. `painel/` — utilitários puros extraídos (ex.: texto HTML seguro, tipografia de pré-visualização); o núcleo importa-os
 */
import './controllerAppCore.js';
