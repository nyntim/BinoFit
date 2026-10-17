// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.worktrees/**', '.claude/worktrees/**'],
  },
  {
    // React Compiler rules added in eslint-config-expo 57 flag existing
    // data-loading effects; keep them visible as warnings until refactored
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // Since SDK 56 the bundler rejects app imports of @react-navigation/*
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@react-navigation/*'],
              message: "Import from 'expo-router' or 'expo-router/react-navigation' instead.",
            },
          ],
        },
      ],
    },
  },
]);
