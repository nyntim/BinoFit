import { NUTRIENT_IDS, normalizeNutrients } from '@/lib/nutrients';
import * as Crypto from 'expo-crypto';
import type { Food } from '@/lib/types';
import { getDatabase } from '@/lib/database-connection';
import { toIso, isRemoteNewer } from '@/lib/database-food-logs';

export async function searchFoods(query: string, limit = 50): Promise<Food[]> {
  const db = await getDatabase();
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Each word must appear in name or brand (AND between words, OR within each word across fields)
  const wordConditions = words.map(() => `(name LIKE ? OR brand LIKE ?)`).join(' AND ');
  const wordParams = words.flatMap((w) => [`%${w}%`, `%${w}%`]);

  return db.getAllAsync<Food>(
    `SELECT *, 
       CASE
         WHEN lower(name) = lower(?)           THEN 1
         WHEN lower(name) LIKE lower(? || '%') THEN 2
         ELSE                                       3
       END as matchTier
     FROM foods
     WHERE ${wordConditions}
     ORDER BY matchTier ASC, length(name) ASC
     LIMIT ?`,
    [...wordParams, query, query, limit]
  );
}

export async function searchFoodsByTokens(tokens: string[], limit = 50): Promise<Food[]> {
  if (tokens.length === 0) return [];
  const db = await getDatabase();
  const wordConditions = tokens.map(() => `(name LIKE ? OR brand LIKE ?)`).join(' AND ');
  const wordParams = tokens.flatMap((w) => [`%${w}%`, `%${w}%`]);

  return db.getAllAsync<Food>(
    `SELECT *, 3 as matchTier FROM foods
     WHERE ${wordConditions}
     ORDER BY length(name) ASC
     LIMIT ?`,
    [...wordParams, limit]
  );
}

export async function searchFoodsBySingleToken(token: string, limit = 50): Promise<Food[]> {
  const db = await getDatabase();
  return db.getAllAsync<Food>(
    `SELECT *, 4 as matchTier FROM foods
     WHERE name LIKE ? OR brand LIKE ?
     ORDER BY length(name) ASC
     LIMIT ?`,
    [`%${token}%`, `%${token}%`, limit]
  );
}

export async function searchLiquids(query: string): Promise<Food[]> {
  const db = await getDatabase();
  return db.getAllAsync<Food>(
    `SELECT * FROM foods 
     WHERE (name LIKE ? OR brand LIKE ?)
     AND (serving_units LIKE '%ml%' 
          OR serving_units LIKE '%fl oz%' 
          OR serving_units LIKE '%cup%' 
          OR serving_units LIKE '%oz%' 
          OR name LIKE '%Water%'
          OR name LIKE '%Coffee%'
          OR name LIKE '%Milk%'
          OR name LIKE '%Soda%'
          OR name LIKE '%Drink%'
          OR name LIKE '%Juice%')
     ORDER BY
       CASE
         WHEN lower(name) = lower(?)           THEN 0
         WHEN lower(name) LIKE lower(? || '%') THEN 1
         ELSE                                       2
       END ASC,
       length(name) ASC
     LIMIT 50`,
    [`%${query}%`, `%${query}%`, query, query]
  );
}

const MICRO_COLUMNS = NUTRIENT_IDS;

export function hasAnyMicros(food: Food): boolean {
  return MICRO_COLUMNS.some((col) => food[col] != null);
}

/**
 * Insert or update a remote food in the local cache. Micronutrients are merged:
 * a partial row (e.g. from a search result) never overwrites known values with null.
 */
export async function cacheRemoteFood(
  food: Food,
  options: { partial?: boolean } = {}
): Promise<void> {
  const db = await getDatabase();
  const microUpdates = MICRO_COLUMNS.map((c) => `${c} = CASE WHEN excluded.serving_units = foods.serving_units THEN COALESCE(excluded.${c}, foods.${c}) ELSE excluded.${c} END`).join(', ');
  // Partial rows (search results) never touch an existing row
  const insertVerb = options.partial ? 'INSERT OR IGNORE' : 'INSERT';
  const onConflict = options.partial
    ? ''
    : `ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       brand = excluded.brand,
       serving_units = excluded.serving_units,
       calories = excluded.calories,
       protein = excluded.protein,
       carbs = excluded.carbs,
       fat = excluded.fat,
       source = excluded.source,
       updated_at = excluded.updated_at,
       barcode = COALESCE(excluded.barcode, foods.barcode),
       ${microUpdates}
     WHERE foods.source IS NOT 'custom'`;
  await db.runAsync(
    `${insertVerb} INTO foods
      (id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at, barcode,
       ${MICRO_COLUMNS.join(', ')})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${MICRO_COLUMNS.map(() => '?').join(', ')})
     ${onConflict}`,
    [
      food.id,
      food.name,
      food.brand ?? null,
      food.serving_units,
      food.calories,
      food.protein,
      food.carbs,
      food.fat,
      food.source ?? null,
      food.updated_at,
      food.barcode ?? null,
      ...MICRO_COLUMNS.map((c) => normalizeNutrients(food)[c]),
    ]
  );
}

/** Local food for a normalized barcode: the user's own custom food first, then the most recently updated row. */
export async function getFoodByBarcode(code: string): Promise<Food | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Food>(
    `SELECT * FROM foods WHERE barcode = ?
     ORDER BY (source = 'custom') DESC, updated_at DESC LIMIT 1`,
    [code]
  );
}

export async function getFoodById(id: string): Promise<Food | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Food>('SELECT * FROM foods WHERE id = ?', [id]);
}

type CustomFoodInput = Omit<Food, 'id' | 'updated_at'>;

const FOOD_CORE_COLUMNS = ['name', 'brand', 'serving_units', 'calories', 'protein', 'carbs', 'fat'] as const;

function customValues(food: CustomFoodInput) {
  const nutrients = normalizeNutrients(food);
  return [...FOOD_CORE_COLUMNS.map((key) => food[key] ?? null), ...NUTRIENT_IDS.map((id) => nutrients[id])];
}

export async function addCustomFood(food: CustomFoodInput): Promise<Food> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  const columns = [...FOOD_CORE_COLUMNS, ...NUTRIENT_IDS];
  await db.runAsync(
    `INSERT INTO foods (id, ${columns.join(', ')}, source, updated_at, barcode, synced_at)
     VALUES (?, ${columns.map(() => '?').join(', ')}, 'custom', ?, ?, NULL)`,
    [id, ...customValues(food), now, food.barcode ?? null]
  );
  return { ...food, ...normalizeNutrients(food), id, source: 'custom', updated_at: now, synced_at: null };
}

export async function updateCustomFood(id: string, food: CustomFoodInput): Promise<Food> {
  const db = await getDatabase();
  const existing = await getFoodById(id);
  if (!existing || existing.source !== 'custom') throw new Error('Custom food unavailable');
  // Ensure a write during upload has a distinct snapshot timestamp, even in the same millisecond.
  const now = new Date(Math.max(Date.now(), Date.parse(existing.updated_at) + 1 || 0)).toISOString();
  const columns = [...FOOD_CORE_COLUMNS, ...NUTRIENT_IDS];
  await db.runAsync(
    `UPDATE foods SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ?, synced_at = NULL WHERE id = ? AND source = 'custom'`,
    [...customValues(food), now, id]
  );
  return { ...food, ...normalizeNutrients(food), id, source: 'custom', updated_at: now, synced_at: null };
}

export async function getUnsyncedCustomFoods(): Promise<Food[]> {
  const db = await getDatabase();
  return db.getAllAsync<Food>("SELECT * FROM foods WHERE source = 'custom' AND synced_at IS NULL");
}

export async function markCustomFoodsSynced(rows: readonly Pick<Food, 'id' | 'updated_at'>[]): Promise<void> {
  const db = await getDatabase();
  for (const row of rows) await db.runAsync("UPDATE foods SET synced_at = ? WHERE id = ? AND updated_at = ? AND source = 'custom'", [new Date().toISOString(), row.id, row.updated_at]);
}

/** Authoritative definitions; remote nulls clear values, local pending edits stay pending. */
export async function applyRemoteCustomFoods(rows: readonly Food[]): Promise<number> {
  const db = await getDatabase();
  let applied = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const food of rows) {
      if (food.source !== 'custom') continue;
      const local = await txn.getFirstAsync<Food>('SELECT * FROM foods WHERE id = ?', [food.id]);
      const updated = toIso(food.updated_at, new Date().toISOString());
      if (local && (local.source !== 'custom' || local.synced_at == null || !isRemoteNewer(updated, local.updated_at))) continue;
      const columns = [...FOOD_CORE_COLUMNS, ...NUTRIENT_IDS];
      await txn.runAsync(
        `INSERT INTO foods (id, ${columns.join(', ')}, source, updated_at, synced_at) VALUES (?, ${columns.map(() => '?').join(', ')}, 'custom', ?, ?)
         ON CONFLICT(id) DO UPDATE SET ${columns.map((c) => `${c} = excluded.${c}`).join(', ')}, updated_at = excluded.updated_at, synced_at = excluded.synced_at`,
        [food.id, ...customValues(food), updated, new Date().toISOString()]
      );
      applied++;
    }
  });
  return applied;
}
