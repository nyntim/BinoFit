import { parse } from 'csv-parse/sync';
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

// --- Config: point this at wherever your CSVs live ---
const CSV_DIR = `${process.env.HOME}/Downloads/FoodData_Central_sr_legacy_food_csv_2018-04`;

const NUTRIENT_MAP = {
  1008: 'calories',
  1003: 'protein',
  1005: 'carbs',
  1004: 'fat',
  1079: 'fiber',
  2000: 'sugar',
  1258: 'saturated_fat',
  1257: 'trans_fat',
  1293: 'polyunsat_fat',
  1292: 'monounsat_fat',
  1106: 'vitamin_a',
  1162: 'vitamin_c',
  1114: 'vitamin_d',
  1109: 'vitamin_e',
  1185: 'vitamin_k',
  1165: 'thiamin',
  1166: 'riboflavin',
  1167: 'niacin',
  1175: 'b6',
  1177: 'folate',
  1178: 'b12',
  1180: 'choline',
  1087: 'calcium',
  1089: 'iron',
  1090: 'magnesium',
  1091: 'phosphorus',
  1092: 'potassium',
  1093: 'sodium',
  1095: 'zinc',
  1098: 'copper',
  1101: 'manganese',
  1103: 'selenium',
};

// --- Setup output directory ---
if (!existsSync('assets/data')) {
  mkdirSync('assets/data', { recursive: true });
}

const db = new Database('assets/data/foods.db');
const now = new Date().toISOString();

// --- Schema ---
db.exec(`
  DROP TABLE IF EXISTS foods;

  CREATE TABLE foods (
    id             TEXT PRIMARY KEY,
    fdc_id         INTEGER UNIQUE,
    name           TEXT NOT NULL,
    category       TEXT,
    serving_size   REAL,
    serving_unit   TEXT,
    calories       REAL,
    protein        REAL,
    carbs          REAL,
    fat            REAL,
    fiber          REAL,
    sugar          REAL,
    saturated_fat  REAL,
    trans_fat      REAL,
    polyunsat_fat  REAL,
    monounsat_fat  REAL,
    vitamin_a      REAL,
    vitamin_c      REAL,
    vitamin_d      REAL,
    vitamin_e      REAL,
    vitamin_k      REAL,
    thiamin        REAL,
    riboflavin     REAL,
    niacin         REAL,
    b6             REAL,
    folate         REAL,
    b12            REAL,
    choline        REAL,
    calcium        REAL,
    iron           REAL,
    magnesium      REAL,
    phosphorus     REAL,
    potassium      REAL,
    sodium         REAL,
    zinc           REAL,
    copper         REAL,
    manganese      REAL,
    selenium       REAL,
    source         TEXT,
    updated_at     TEXT NOT NULL
  );

  CREATE INDEX idx_foods_name ON foods(name);
  CREATE INDEX idx_foods_fdc  ON foods(fdc_id);
`);

// --- Load CSVs ---
console.log('Loading CSVs...');

const foods = parse(readFileSync(`${CSV_DIR}/food.csv`), {
  columns: true, skip_empty_lines: true,
});

const foodNutrients = parse(readFileSync(`${CSV_DIR}/food_nutrient.csv`), {
  columns: true, skip_empty_lines: true,
});

const portions = parse(readFileSync(`${CSV_DIR}/food_portion.csv`), {
  columns: true, skip_empty_lines: true,
});

const categories = parse(readFileSync(`${CSV_DIR}/food_category.csv`), {
  columns: true, skip_empty_lines: true,
});

// --- Build lookup maps ---
console.log('Building lookup maps...');

// Category map: id -> description
const categoryMap = {};
for (const row of categories) {
  categoryMap[row.id] = row.description;
}

// Nutrient map: fdc_id -> { calories: x, protein: x, ... }
const nutrientsByFood = {};
for (const row of foodNutrients) {
  const col = NUTRIENT_MAP[parseInt(row.nutrient_id)];
  if (!col) continue;
  if (!nutrientsByFood[row.fdc_id]) nutrientsByFood[row.fdc_id] = {};
  nutrientsByFood[row.fdc_id][col] = parseFloat(row.amount) ?? null;
}

// Portion map: fdc_id -> { serving_size, serving_unit }
// Takes the first portion entry per food as the default serving
const portionsByFood = {};
for (const row of portions) {
  if (portionsByFood[row.fdc_id]) continue;
  portionsByFood[row.fdc_id] = {
    serving_size: parseFloat(row.gram_weight) || 100,
    serving_unit: row.portion_description || 'g',
  };
}

// --- Insert ---
console.log('Inserting foods...');

const insert = db.prepare(`
  INSERT OR IGNORE INTO foods (
    id, fdc_id, name, category, serving_size, serving_unit,
    calories, protein, carbs, fat, fiber, sugar,
    saturated_fat, trans_fat, polyunsat_fat, monounsat_fat,
    vitamin_a, vitamin_c, vitamin_d, vitamin_e, vitamin_k,
    thiamin, riboflavin, niacin, b6, folate, b12, choline,
    calcium, iron, magnesium, phosphorus, potassium, sodium,
    zinc, copper, manganese, selenium,
    source, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?
  )
`);

const insertAll = db.transaction(() => {
  let count = 0;
  for (const food of foods) {
    const n = nutrientsByFood[food.fdc_id] || {};
    const p = portionsByFood[food.fdc_id] || { serving_size: 100, serving_unit: 'g' };
    const category = categoryMap[food.food_category_id] || null;

    insert.run(
      randomUUID(),
      parseInt(food.fdc_id),
      food.description,
      category,
      p.serving_size,
      p.serving_unit,
      n.calories       ?? null,
      n.protein        ?? null,
      n.carbs          ?? null,
      n.fat            ?? null,
      n.fiber          ?? null,
      n.sugar          ?? null,
      n.saturated_fat  ?? null,
      n.trans_fat      ?? null,
      n.polyunsat_fat  ?? null,
      n.monounsat_fat  ?? null,
      n.vitamin_a      ?? null,
      n.vitamin_c      ?? null,
      n.vitamin_d      ?? null,
      n.vitamin_e      ?? null,
      n.vitamin_k      ?? null,
      n.thiamin        ?? null,
      n.riboflavin     ?? null,
      n.niacin         ?? null,
      n.b6             ?? null,
      n.folate         ?? null,
      n.b12            ?? null,
      n.choline        ?? null,
      n.calcium        ?? null,
      n.iron           ?? null,
      n.magnesium      ?? null,
      n.phosphorus     ?? null,
      n.potassium      ?? null,
      n.sodium         ?? null,
      n.zinc           ?? null,
      n.copper         ?? null,
      n.manganese      ?? null,
      n.selenium       ?? null,
      'usda_sr_legacy',
      now
    );
    count++;
  }
  return count;
});

const count = insertAll();

console.log(`Done. Inserted ${count} foods into assets/data/foods.db`);
db.close();