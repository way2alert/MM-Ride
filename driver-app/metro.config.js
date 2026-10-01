const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('cjs');
config.resolver.assetExts.push('wav', 'mp3');
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import', 'default'];

module.exports = config;
