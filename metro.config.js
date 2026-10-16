const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Include .db files so bundled SQLite databases are resolved as assets
config.resolver.assetExts.push('db');

// Keep feature worktrees (scripts/agents/ship.sh) out of the bundler's crawl
const escape = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${escape(path.join(__dirname, '.worktrees'))}/.*`),
  new RegExp(`^${escape(path.join(__dirname, '.claude', 'worktrees'))}/.*`),
];

module.exports = config;
