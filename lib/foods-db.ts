import * as SQLite from 'expo-sqlite';
import { importDatabaseFromAssetAsync } from 'expo-sqlite';
import { indexFoodMetadata, queryTokens, rankFoods, type FoodMetadata } from '@/lib/food-search-relevance';
import type { Food } from '@/lib/types';
import { scaleNutrients, type NutrientValues } from '@/lib/nutrients';

let _foodsDb: SQLite.SQLiteDatabase | null = null;
let _imported = false;

type USDARow = Partial<NutrientValues> & {
  id: string;
  name: string;
  serving_size: number | null;
  serving_unit: string | null;
  source?: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  updated_at: string;
  matchTier?: number;
};

const FOODS_DB_NAME = 'foods.db';
const ASSET_ID = require('@/assets/data/foods.db');

async function getFoodsDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_foodsDb) return _foodsDb;

  if (!_imported) {
    console.log('[foods-db] Importing asset database...');
    await importDatabaseFromAssetAsync(FOODS_DB_NAME, { assetId: ASSET_ID, forceOverwrite: true });
    console.log('[foods-db] Import complete, opening...');
    _imported = true;
  }

  _foodsDb = await SQLite.openDatabaseAsync(FOODS_DB_NAME);
  const count = await _foodsDb.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM foods');
  console.log(`[foods-db] Opened foods.db: ${count?.c ?? 0} rows`);
  return _foodsDb;
}

function mapUSDARow(row: USDARow): Food {
  const servingSize = row.serving_size ?? 100;
  const servingUnit = row.serving_unit ?? 'g';
  const scale = servingSize / 100;
  // The bundled asset already uses the catalog's canonical units and definitions.
  // No added-sugar or cholesterol column exists; those values remain unknown.
  const nutrients = scaleNutrients(row, scale);

  const servingUnits =
    servingUnit === 'g' ? `${servingSize}g` : servingUnit;

  return {
    id: row.id,
    name: row.name,
    brand: null,
    serving_units: servingUnits,
    calories: Math.round((row.calories ?? 0) * scale),
    protein: Math.round((row.protein ?? 0) * scale * 10) / 10,
    carbs: Math.round((row.carbs ?? 0) * scale * 10) / 10,
    fat: Math.round((row.fat ?? 0) * scale * 10) / 10,
    ...nutrients,
    source: row.source ?? 'usda_sr_legacy',
    updated_at: row.updated_at,
    matchTier: row.matchTier,
  };
}

export async function getUSDAFoodById(id: string): Promise<Food | null> {
  try {
    const db = await getFoodsDatabase();
    const row = await db.getFirstAsync<USDARow>(
      `SELECT * FROM foods WHERE id = ?`,
      [id]
    );
    return row ? mapUSDARow(row) : null;
  } catch {
    return null;
  }
}

let metadataPromise: Promise<FoodMetadata[]> | undefined;

/** The bundled catalog is immutable. Retain names only, and retry failed reads. */
export function getUSDASearchMetadata(): Promise<FoodMetadata[]> {
  if (!metadataPromise) {
    metadataPromise = getFoodsDatabase().then(db => db.getAllAsync<FoodMetadata>('SELECT id, name, source FROM foods')).then(rows => rows.map(indexFoodMetadata))
      .catch(error => { metadataPromise = undefined; throw error; });
  }
  return metadataPromise;
}

export async function getUSDAFoodsByIds(ids: readonly string[]): Promise<Food[]> {
  if (!ids.length) return [];
  const db = await getFoodsDatabase();
  const rows = await db.getAllAsync<USDARow>(`SELECT * FROM foods WHERE id IN (${ids.map(() => '?').join(', ')})`, [...ids]);
  return rows.map(mapUSDARow);
}

export async function searchUSDAFoods(query: string, limit = 50): Promise<Food[]> {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];
  try {
    const winners = rankFoods(await getUSDASearchMetadata(), tokens).slice(0, limit);
    const rows = new Map((await getUSDAFoodsByIds(winners.map(food => food.id))).map(food => [food.id, food]));
    return winners.flatMap(food => rows.has(food.id) ? [rows.get(food.id)!] : []);
  } catch { return []; }
}
export const searchUSDAFoodsByTokens = (tokens: string[], limit = 50) => searchUSDAFoods(tokens.join(' '), limit);
export const searchUSDAFoodsBySingleToken = (token: string, limit = 50) => searchUSDAFoods(token, limit);
