'use strict';
/**
 * Reembute lyra-mark.png / lyra-rule.png (assets/) como data URI dentro de splash.html.
 * Rode `node controller/src/splash/embutirAssets.js` depois de trocar um PNG: a splash não faz
 * acesso a disco para imagens (caminho crítico do boot).
 */
const fs = require('fs');
const path = require('path');

const arquivo = path.join(__dirname, 'splash.html');
let html = fs.readFileSync(arquivo, 'utf8');
html = html.replace(/data-asset="([^"]+)" src="[^"]*"/g, (_m, nome) => {
  const b64 = fs.readFileSync(path.join(__dirname, 'assets', nome)).toString('base64');
  return `data-asset="${nome}" src="data:image/png;base64,${b64}"`;
});
fs.writeFileSync(arquivo, html);
