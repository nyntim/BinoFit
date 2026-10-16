import { createMemoryDb } from '@/test-utils/sqlite-memory';
import type { Food } from '@/lib/types';

const CODE = '0036000291452';
const UPCA = '036000291452';

let mem: ReturnType<typeof createMemoryDb>;
let database: typeof import('@/lib/database');
let service: typeof import('@/lib/food-service');
let fetchMock: jest.Mock;

const okProduct = (extra: Record<string, unknown> = {}) => ({
  status: 1,
  product: {
    product_name: 'Crunch Bar', brands: 'Acme, Other', serving_size: '1 bar (40g)', serving_quantity: 40,
    nutriments: { 'energy-kcal_100g': 400, proteins_100g: 10, carbohydrates_100g: 50, fat_100g: 20, sodium_100g: 0.5 },
    ...extra,
  },
});
const jsonRes = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const custom = (over: Partial<Food> = {}): Food => ({
  id: 'custom-1', name: 'My Bar', brand: null, serving_units: '1 bar', calories: 111, protein: 1, carbs: 2, fat: 3,
  source: 'custom', updated_at: '2020-01-01T00:00:00.000Z', barcode: CODE, ...over,
});
const countRows = () => (mem.raw.prepare('SELECT COUNT(*) AS n FROM foods').get() as { n: number }).n;

beforeEach(() => {
  jest.resetModules();
  mem = createMemoryDb();
  const SQLite = require('expo-sqlite');
  (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  fetchMock = jest.fn();
  (globalThis as any).fetch = fetchMock;
  database = require('@/lib/database');
  service = require('@/lib/food-service');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('lookupBarcode', () => {
  it('returns invalid without touching the network for a bad code', async () => {
    expect(await service.lookupBarcode('123')).toEqual({ status: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a local cache hit with no fetch', async () => {
    await database.cacheRemoteFood(custom({ id: 'off:' + CODE, source: 'open_food_facts' }));
    const r = await service.lookupBarcode(CODE);
    expect(r.status).toBe('found');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the v2 URL with params and headers on a miss, normalizing UPC-A input', async () => {
    fetchMock.mockResolvedValue(jsonRes(okProduct()));
    await service.lookupBarcode(UPCA);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(`https://world.openfoodfacts.org/api/v2/product/${CODE}?`);
    expect(url).toContain('fields=');
    expect(url).toContain('nutriments');
    expect(url).toContain('app_name=BinoFit');
    expect(url).toMatch(/app_version=[^&]+/);
    expect(init.headers['User-Agent']).toMatch(/^BinoFit\/\S+ \(tin025@ucsd\.edu\)$/);
    expect(init.headers.Accept).toBe('application/json');
    expect(init.signal).toBeDefined();
  });

  it('stores a found product so a second lookup makes no fetch', async () => {
    fetchMock.mockResolvedValue(jsonRes(okProduct()));
    const first = await service.lookupBarcode(CODE);
    expect(first.status).toBe('found');
    if (first.status !== 'found') return;
    expect(first.food).toMatchObject({
      id: `off:${CODE}`, name: 'Crunch Bar', brand: 'Acme', serving_units: '1 bar (40g)',
      calories: 160, protein: 4, carbs: 20, fat: 8, sodium: 200, source: 'open_food_facts', barcode: CODE,
    });
    const second = await service.lookupBarcode(CODE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.status).toBe('found');
    if (second.status === 'found') expect(second.food).toMatchObject({ id: `off:${CODE}`, barcode: CODE, sodium: 200 });
    expect(countRows()).toBe(1);
  });

  it('returns not_found for HTTP 404 and stores nothing', async () => {
    fetchMock.mockResolvedValue(jsonRes({}, 404));
    expect(await service.lookupBarcode(CODE)).toEqual({ status: 'not_found', code: CODE });
    expect(countRows()).toBe(0);
  });

  it('returns not_found for status:0 and stores nothing', async () => {
    fetchMock.mockResolvedValue(jsonRes({ status: 0, status_verbose: 'product not found' }));
    expect(await service.lookupBarcode(CODE)).toEqual({ status: 'not_found', code: CODE });
    expect(countRows()).toBe(0);
  });

  it('returns error for a non-404 HTTP failure and does not cache', async () => {
    fetchMock.mockResolvedValue(jsonRes({}, 500));
    expect(await service.lookupBarcode(CODE)).toEqual({ status: 'error', code: CODE });
    expect(countRows()).toBe(0);
  });

  it('returns error when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    expect(await service.lookupBarcode(CODE)).toEqual({ status: 'error', code: CODE });
    expect(countRows()).toBe(0);
  });

  it('returns error when the response body is not JSON', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
    expect(await service.lookupBarcode(CODE)).toEqual({ status: 'error', code: CODE });
  });

  it('returns error after the 8s timeout aborts the request', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const p = service.lookupBarcode(CODE);
    await jest.advanceTimersByTimeAsync(7999);
    let settled = false;
    p.then(() => { settled = true; });
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ status: 'error', code: CODE });
    expect(countRows()).toBe(0);
  });

  it('returns incomplete with name and brand and stores nothing', async () => {
    fetchMock.mockResolvedValue(jsonRes(okProduct({ nutriments: {} })));
    expect(await service.lookupBarcode(CODE)).toEqual({ status: 'incomplete', code: CODE, name: 'Crunch Bar', brand: 'Acme' });
    expect(countRows()).toBe(0);
  });

  it('prefers a custom food with the same barcode over an OFF row, with no fetch', async () => {
    await database.cacheRemoteFood(custom({ id: `off:${CODE}`, name: 'OFF Bar', source: 'open_food_facts', updated_at: '2026-06-01T00:00:00.000Z' }));
    await database.addCustomFood({ name: 'Mine', brand: null, serving_units: '1 bar', calories: 5, protein: 1, carbs: 1, fat: 1, barcode: CODE } as any);
    const r = await service.lookupBarcode(CODE);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.status === 'found' && r.food.name).toBe('Mine');
  });
});

describe('barcode persistence', () => {
  it('addCustomFood persists the barcode', async () => {
    await database.addCustomFood({ name: 'Mine', brand: null, serving_units: '1', calories: 5, protein: 1, carbs: 1, fat: 1, barcode: CODE } as any);
    const f = await database.getFoodByBarcode(CODE);
    expect(f?.name).toBe('Mine');
    expect(f?.source).toBe('custom');
  });

  it('getFoodByBarcode returns null for an unknown code and the newest non-custom row otherwise', async () => {
    expect(await database.getFoodByBarcode(CODE)).toBeNull();
    await database.cacheRemoteFood(custom({ id: 'a', source: 'open_food_facts', name: 'Old', updated_at: '2025-01-01' }));
    await database.cacheRemoteFood(custom({ id: 'b', source: 'open_food_facts', name: 'New', updated_at: '2026-01-01' }));
    expect((await database.getFoodByBarcode(CODE))?.name).toBe('New');
  });

  it('cacheRemoteFood never overwrites a custom row', async () => {
    await database.cacheRemoteFood(custom());
    await database.cacheRemoteFood({ ...custom(), name: 'Hijacked', calories: 999, source: 'open_food_facts', barcode: '9999999999999' });
    const row = mem.raw.prepare("SELECT * FROM foods WHERE id='custom-1'").get();
    expect(row).toMatchObject({ name: 'My Bar', calories: 111, source: 'custom', barcode: CODE });
  });

  it('cacheRemoteFood keeps an existing barcode when the update has none', async () => {
    const off = custom({ id: 'off:x', source: 'open_food_facts' });
    await database.cacheRemoteFood(off);
    await database.cacheRemoteFood({ ...off, name: 'Renamed', barcode: null });
    const row = mem.raw.prepare("SELECT * FROM foods WHERE id='off:x'").get();
    expect(row).toMatchObject({ name: 'Renamed', barcode: CODE });
  });
});

describe('foods.barcode migration', () => {
  const seedOld = () => {
    mem.raw.exec(`
      CREATE TABLE foods (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT, serving_units TEXT NOT NULL,
        calories REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
        source TEXT, updated_at TEXT NOT NULL
      );
      INSERT INTO foods VALUES ('f1','Egg',NULL,'1 egg',70,6,0,5,'custom','2024-01-01');
      INSERT INTO foods VALUES ('f2','Rice','Brand','100g',130,2.7,28,0.3,'usda','2024-01-02');
    `);
  };
  const cols = () => (mem.raw.prepare('PRAGMA table_info(foods)').all() as { name: string }[]).map((c) => c.name);

  it('adds the barcode column and index, leaving existing rows unchanged', async () => {
    seedOld();
    expect(cols()).not.toContain('barcode');
    await database.getDatabase();
    expect(cols()).toContain('barcode');
    const idx = mem.raw.prepare("PRAGMA index_list(foods)").all() as { name: string }[];
    expect(idx.map((i) => i.name)).toContain('idx_foods_barcode');
    const rows = mem.raw.prepare('SELECT id,name,brand,serving_units,calories,protein,carbs,fat,source,updated_at,barcode FROM foods ORDER BY id').all();
    expect(rows).toEqual([
      { id: 'f1', name: 'Egg', brand: null, serving_units: '1 egg', calories: 70, protein: 6, carbs: 0, fat: 5, source: 'custom', updated_at: '2024-01-01', barcode: null },
      { id: 'f2', name: 'Rice', brand: 'Brand', serving_units: '100g', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, source: 'usda', updated_at: '2024-01-02', barcode: null },
    ]);
  });

  it('running init again is harmless', async () => {
    seedOld();
    await database.getDatabase();
    jest.resetModules();
    const SQLite = require('expo-sqlite');
    (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
    const again = require('@/lib/database');
    await expect(again.getDatabase()).resolves.toBeTruthy();
    expect(cols().filter((c) => c === 'barcode')).toHaveLength(1);
    expect(countRows()).toBe(2);
  });
});
