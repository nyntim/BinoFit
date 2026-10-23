import type { Food } from '@/lib/types';
import { queryTokens, strongResultCount } from '@/lib/food-search-relevance';

export type SearchState = { local: Food[]; remote: Food[]; localLoading: boolean; remoteLoading: boolean; requested: boolean; error: boolean };
type Dependencies = {
  local: (query: string) => Promise<Food[]>;
  remote: (query: string, signal: AbortSignal, current: () => boolean) => Promise<Food[]>;
  changed: (state: SearchState) => void;
};
const emptyState = (): SearchState => ({ local: [], remote: [], localLoading: false, remoteLoading: false, requested: false, error: false });

/** A controller belongs to one mounted screen and one account. Never persist its cache. */
export class FoodSearchSession {
  readonly metrics = { starts: 0, aborts: 0, cacheHits: 0, negativePrefixSkips: 0 };
  private generation = 0;
  private query = '';
  private key = '';
  private state = emptyState();
  private localTimer?: ReturnType<typeof setTimeout>;
  private remoteTimer?: ReturnType<typeof setTimeout>;
  private cache = new Map<string, Food[]>();
  private pending = new Map<string, { controller: AbortController; promise: Promise<void>; timeout: ReturnType<typeof setTimeout> }>();
  private disposed = false;
  constructor(private readonly deps: Dependencies) {}

  private emit(patch: Partial<SearchState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.deps.changed(this.state);
  }
  private cancel() {
    this.generation++;
    clearTimeout(this.localTimer);
    clearTimeout(this.remoteTimer);
    this.pending.forEach(({ controller, timeout }) => { clearTimeout(timeout); controller.abort(); this.metrics.aborts++; });
    this.pending.clear();
  }
  /** Call synchronously from onChangeText, including clearing input. */
  change(query: string) {
    this.cancel();
    this.query = query;
    this.key = queryTokens(query).join(' ');
    const generation = this.generation;
    this.state = emptyState();
    this.emit({ localLoading: !!this.key });
    if (!this.key) return;
    this.localTimer = setTimeout(async () => {
      try {
        const local = await this.deps.local(query);
        if (generation !== this.generation) return;
        this.emit({ local, localLoading: false, remoteLoading: !this.state.requested && this.key.length >= 3 && strongResultCount(local, queryTokens(query)) < 8 });
      } catch {
        if (generation === this.generation) this.emit({ localLoading: false, remoteLoading: this.key.length >= 3 });
      }
    }, 150);
    this.remoteTimer = setTimeout(() => {
      if (generation === this.generation) void this.automatic(generation);
    }, 700);
  }
  private async automatic(generation: number) {
    // Local reads may finish after the remote timer. Wait without starting another read.
    if (this.state.localLoading) {
      this.remoteTimer = setTimeout(() => { if (generation === this.generation) void this.automatic(generation); }, 25);
      return;
    }
    if (this.key.length >= 3 && strongResultCount(this.state.local, queryTokens(this.query)) < 8) await this.lookup();
    else this.emit({ remoteLoading: false });
  }
  private inferredNegative(): boolean {
    const tokens = this.key.split(' ');
    const final = tokens[tokens.length - 1];
    if (final.length < 3 || final.length > 5 || tokens.some(token => token.length >= 6)) return false;
    for (const [key, rows] of this.cache) {
      if (rows.length) continue;
      const prior = key.split(' ');
      const previous = prior[prior.length - 1];
      if (prior.length === tokens.length && prior.slice(0, -1).join(' ') === tokens.slice(0, -1).join(' ') && previous.length >= 3 && previous.length < final.length && final.startsWith(previous)) return true;
    }
    return false;
  }
  async lookup(manual = false): Promise<void> {
    clearTimeout(this.remoteTimer);
    if (!this.key || this.key.length < 3 || this.disposed) return;
    const existing = this.pending.get(this.key);
    if (existing) return existing.promise;
    const cached = this.cache.get(this.key);
    if (cached) {
      this.cache.delete(this.key); this.cache.set(this.key, cached);
      this.metrics.cacheHits++;
      this.emit({ remote: cached, requested: true, remoteLoading: false, error: false });
      return;
    }
    if (!manual && this.inferredNegative()) {
      this.metrics.negativePrefixSkips++;
      this.emit({ remote: [], requested: true, remoteLoading: false });
      return;
    }
    const key = this.key, query = this.query, generation = this.generation;
    const controller = new AbortController();
    const current = () => generation === this.generation && !controller.signal.aborted && !this.disposed;
    this.emit({ remoteLoading: true, requested: true, error: false });
    // Start in a microtask so pending is registered even if the transport throws immediately.
    const timeout = setTimeout(() => {
      if (!current()) return;
      this.pending.delete(key);
      controller.abort(); this.metrics.aborts++;
      this.emit({ remoteLoading: false, error: true });
    }, 8000);
    const promise = Promise.resolve().then(() => {
      if (!current()) throw new Error('Search cancelled');
      this.metrics.starts++;
      return this.deps.remote(query, controller.signal, current);
    }).then(rows => {
      if (!current()) return;
      this.cache.set(key, rows);
      if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value!);
      this.emit({ remote: rows, error: false });
    }).catch(() => { if (current()) this.emit({ error: true }); }).finally(() => {
      clearTimeout(timeout);
      if (!current()) return;
      this.pending.delete(key);
      this.emit({ remoteLoading: false });
    });
    this.pending.set(key, { controller, promise, timeout });
    return promise;
  }
  reset() { this.cancel(); this.cache.clear(); this.query = ''; this.key = ''; this.emit(emptyState()); }
  dispose() { this.disposed = true; this.cancel(); this.cache.clear(); }
}
