describe('jest setup', () => {
  it('resolves the @/ alias and runs TypeScript', () => {
    const { hasAnyMicros } = require('@/lib/database');
    expect(typeof hasAnyMicros).toBe('function');
  });
});
