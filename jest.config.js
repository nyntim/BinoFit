// Feature worktrees live inside the repo; anchor to <rootDir> so a worktree
// still runs its own tests while the main checkout skips them.
const worktrees = ['<rootDir>/.worktrees/', '<rootDir>/.claude/worktrees/'];

const preset = require('jest-expo/jest-preset');
const [, babelJestOptions] = preset.transform['\\.[jt]sx?$'];

module.exports = {
  preset: 'jest-expo',
  transform: {
    // Same as the jest-expo transform, plus a plugin that makes `import()` work under Jest.
    '\\.[jt]sx?$': [
      'babel-jest',
      { ...babelJestOptions, plugins: [`${__dirname}/test-utils/babel-plugin-dynamic-import.js`] },
    ],
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', ...worktrees],
  modulePathIgnorePatterns: worktrees,
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^@/(.*)$': '<rootDir>/$1',
    '\\.db$': '<rootDir>/__mocks__/fileMock.js',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
};
