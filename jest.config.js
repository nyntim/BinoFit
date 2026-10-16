// Feature worktrees live inside the repo; anchor to <rootDir> so a worktree
// still runs its own tests while the main checkout skips them.
const worktrees = ['<rootDir>/.worktrees/', '<rootDir>/.claude/worktrees/'];

module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', ...worktrees],
  modulePathIgnorePatterns: worktrees,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '\\.db$': '<rootDir>/__mocks__/fileMock.js',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
};
