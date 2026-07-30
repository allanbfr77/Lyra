/**
 * Configuração do Metro para o app Lyra.
 *
 * Único ajuste em relação ao padrão do Expo: `.db` passa a ser tratado como
 * asset, para que `assets/catalogo/catalog.db` (banco offline de músicas) seja
 * empacotado no APK e possa ser lido com expo-asset + expo-sqlite no aparelho.
 */

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('db')) {
  config.resolver.assetExts.push('db');
}

module.exports = config;
