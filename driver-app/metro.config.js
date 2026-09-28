const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import', 'default'];

module.exports = config;
