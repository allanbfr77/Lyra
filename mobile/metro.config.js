/**
 * Configuração do Metro para o app Lyra.
 *
 * Ajustes em relação ao padrão do Expo: `.db` vira asset (catálogo offline) e
 * `@lyra/letras-fontes` é resolvido a partir de `packages/` no monorepo.
 */

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const letrasFontes = path.resolve(__dirname, '../packages/letras-fontes');
config.watchFolders = [...(config.watchFolders || []), letrasFontes];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../node_modules'),
];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@lyra/letras-fontes': letrasFontes,
};

if (!config.resolver.assetExts.includes('db')) {
  config.resolver.assetExts.push('db');
}

module.exports = config;
