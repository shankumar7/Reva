const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../shared')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

// Browser preview only (used to look at the design in a real browser): phone-only modules are swapped for stubs.
if (process.env.EXPO_PUBLIC_PREVIEW === '1') {
  const stubs = {
    'expo-sqlite': 'sqlite.ts',
    'expo-secure-store': 'securestore.ts',
  };
  const emptyFor = [
    'expo-camera', 'expo-image-picker', 'expo-document-picker', 'expo-sharing', 'expo-intent-launcher', 'expo-screen-capture',
    'expo-image-manipulator', 'expo-file-system/legacy', 'expo-application', '@react-native-community/netinfo',
    'expo-notifications', 'expo-audio', 'expo-haptics', 'expo-local-authentication',
  ];
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const file = stubs[moduleName] || (emptyFor.includes(moduleName) ? 'empty.ts' : null);
    if (file) return { type: 'sourceFile', filePath: path.resolve(__dirname, 'preview/stubs', file) };
    return context.resolveRequest(context, moduleName, platform);
  };
}
module.exports = config;
