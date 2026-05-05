const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Include .db files so bundled SQLite databases are resolved as assets
config.resolver.assetExts.push('db');

module.exports = config;
