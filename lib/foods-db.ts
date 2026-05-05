import * as SQLite from 'expo-sqlite';
import { importDatabaseFromAssetAsync } from 'expo-sqlite';
import type { Food } from '@/lib/types';

let _foodsDb: SQLite.SQLiteDatabase | null = null;
let _imported = false;

type USDARow = {
  id: string;
  name: string;
  serving_size: number | null;
  serving_unit: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  updated_at: string;
};

const FOODS_DB_NAME = 'foods.db';
const ASSET_ID = require('@/assets/data/foods.db');

async function getFoodsDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_foodsDb) return _foodsDb;

  if (!_imported) {
    await importDatabaseFromAssetAsync(FOODS_DB_NAME, { assetId: ASSET_ID });
    _imported = true;
  }

  _foodsDb = await SQLite.openDatabaseAsync(FOODS_DB_NAME);
  return _foodsDb;
}

function mapUSDARow(row: USDARow): Food {
  const servingSize = row.serving_size ?? 100;
  const servingUnit = row.serving_unit ?? 'g';
  const scale = servingSize / 100;

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
    source: 'usda_sr_legacy',
    updated_at: row.updated_at,
  };
}

export async function getUSDAFoodById(id: string): Promise<Food | null> {
  try {
    const db = await getFoodsDatabase();
    const row = await db.getFirstAsync<USDARow>(
      `SELECT id, name, serving_size, serving_unit, calories, protein, carbs, fat, updated_at
       FROM foods WHERE id = ?`,
      [id]
    );
    return row ? mapUSDARow(row) : null;
  } catch {
    return null;
  }
}

export async function searchUSDAFoods(query: string): Promise<Food[]> {
  try {
    const db = await getFoodsDatabase();
    const rows = await db.getAllAsync<USDARow>(
      `SELECT id, name, serving_size, serving_unit, calories, protein, carbs, fat, updated_at
       FROM foods
       WHERE name LIKE ?
       ORDER BY name
       LIMIT 50`,
      [`%${query}%`]
    );
    return rows.map(mapUSDARow);
  } catch {
    return [];
  }
}
