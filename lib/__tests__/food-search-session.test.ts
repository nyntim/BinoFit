import { FoodSearchSession, type SearchState } from '@/lib/food-search-session';
import type { Food } from '@/lib/types';
const food = (id: string, name: string) => ({ id, name }) as Food;
const tick = async (ms: number) => { await jest.advanceTimersByTimeAsync(ms); };
const setup = (rows: Food[] = [], local: Food[] = []) => {
  const remote = jest.fn(async () => rows);
  const changed = jest.fn<void, [SearchState]>();
  const session = new FoodSearchSession({ local: jest.fn(async () => local), remote, changed });
  return { session, remote, changed };
};
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('food search sessions', () => {
  it('aborts synchronously on clear and ignores a late response without caching it', async () => {
    let resolve!: (rows: Food[]) => void;
    const remote = jest.fn((_query: string, signal: AbortSignal) => new Promise<Food[]>(done => { resolve = done; expect(signal.aborted).toBe(false); }));
    const changed = jest.fn();
    const session = new FoodSearchSession({ local: async () => [], remote, changed });
    session.change('milk'); await tick(700);
    session.change('');
    resolve([food('1', 'Milk')]); await tick(0);
    expect(changed.mock.lastCall[0]).toMatchObject({ local: [], remote: [], remoteLoading: false });
    session.change('milk'); await tick(700);
    expect(remote).toHaveBeenCalledTimes(2);
    expect(session.metrics.aborts).toBe(1);
    session.dispose();
  });
  it('caches successful positive and negative rows, including duplicate-only raw responses', async () => {
    for (const rows of [[], [food('local', 'Milk')]]) {
      const { session, remote } = setup(rows);
      session.change('milk'); await tick(700);
      session.change(''); session.change('milk'); await tick(700);
      expect(remote).toHaveBeenCalledTimes(1);
      expect(session.metrics.cacheHits).toBe(1);
      session.dispose();
    }
  });
  it('does not cache errors and deduplicates in-flight manual lookups', async () => {
    const { session, remote } = setup();
    remote.mockRejectedValueOnce(new Error('offline'));
    session.change('milk'); await tick(700);
    await Promise.all([session.lookup(true), session.lookup(true)]);
    expect(remote).toHaveBeenCalledTimes(2);
    session.dispose();
  });
  it('times out without caching a negative and permits retry', async () => {
    const changed = jest.fn();
    const remote = jest.fn((_query: string, signal: AbortSignal) => new Promise<Food[]>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const session = new FoodSearchSession({ local: async () => [], remote, changed });
    session.change('milk'); await tick(8700);
    expect(changed.mock.lastCall[0]).toMatchObject({ remoteLoading: false, error: true });
    void session.lookup(true); await tick(0); expect(remote).toHaveBeenCalledTimes(2);
    session.dispose();
  });
  it('limits prefix negatives to short same-token extensions and permits manual bypass', async () => {
    const { session, remote } = setup();
    session.change('qwz'); await tick(800);
    session.change('qwzx'); await tick(800);
    expect(remote).toHaveBeenCalledTimes(1);
    await session.lookup(true); expect(remote).toHaveBeenCalledTimes(2);
    session.change('qwzxvv'); await tick(800); expect(remote).toHaveBeenCalledTimes(3);
    session.change('chike'); await tick(800);
    session.change('chiken'); await tick(800); expect(remote).toHaveBeenCalledTimes(5);
    session.change('qwz milk'); await tick(800); expect(remote).toHaveBeenCalledTimes(6);
    session.dispose();
  });
  it('uses at most 100 LRU entries and resets on account/session boundaries', async () => {
    const { session, remote } = setup();
    for (let i = 0; i <= 100; i++) { session.change(`brand ${i}`); await session.lookup(true); }
    session.change('brand 0'); await session.lookup(true);
    expect(remote).toHaveBeenCalledTimes(102);
    session.reset(); session.change('brand 0'); await session.lookup(true);
    expect(remote).toHaveBeenCalledTimes(103);
    session.dispose();
    const other = setup(); other.session.change('brand 0'); await other.session.lookup(true);
    expect(other.remote).toHaveBeenCalledTimes(1); other.session.dispose();
  });
  it('keeps common strong local matches offline but permits manual branded lookup', async () => {
    const { session, remote } = setup([], Array.from({ length: 8 }, (_, i) => food(`${i}`, 'Milk')));
    session.change('milk'); await tick(1000); expect(remote).not.toHaveBeenCalled();
    await session.lookup(true); expect(remote).toHaveBeenCalledTimes(1); session.dispose();
  });
  it('measures the identical fast typing trace: old 5 starts, new 1 start', async () => {
    const { session, remote } = setup();
    let oldCalls = 0;
    let baselineTimer: ReturnType<typeof setTimeout>;
    const enter = async (query: string, pause: number) => {
      clearTimeout(baselineTimer); baselineTimer = setTimeout(() => oldCalls++, 300);
      session.change(query); await tick(pause);
    };
    await enter('qwz', 400); await enter('qwzx', 400); await enter('qwzxv', 800);
    await enter('qwzx', 400); await enter('qwzxv', 800);
    expect(oldCalls).toBe(5); expect(remote).toHaveBeenCalledTimes(1);
    session.dispose();
  });
  it('measures slow typing with prefix negatives and repeats: old 5, new 1', async () => {
    const { session, remote } = setup();
    let oldCalls = 0;
    for (const query of ['qwz', 'qwzx', 'qwzxv', 'qwzx', 'qwz']) {
      setTimeout(() => oldCalls++, 300); session.change(query); await tick(800);
    }
    expect(oldCalls).toBe(5); expect(remote).toHaveBeenCalledTimes(1);
    expect(session.metrics.negativePrefixSkips).toBe(3); session.dispose();
  });
});
