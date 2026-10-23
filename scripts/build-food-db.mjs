import { parse } from 'csv-parse/sync';
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync, renameSync, rmSync } from 'fs';
import { randomUUID } from 'crypto';

// --- Config: CSV folders come from the environment ---
// SR_LEGACY_DIR: FoodData_Central_sr_legacy_food_csv_2018-04
// FOUNDATION_DIR: FoodData_Central_foundation_food_csv_2026-04-30
function requireDir(name) {
  const dir = process.env[name];
  if (!dir) {
    console.error(`Missing env var ${name}. Set SR_LEGACY_DIR and FOUNDATION_DIR to the unzipped USDA CSV folders.`);
    process.exit(1);
  }
  if (!existsSync(`${dir}/food.csv`)) {
    console.error(`${name}=${dir} does not contain food.csv.`);
    process.exit(1);
  }
  return dir;
}
const SR_LEGACY_DIR = requireDir('SR_LEGACY_DIR');
const FOUNDATION_DIR = requireDir('FOUNDATION_DIR');

const OUT_PATH = 'assets/data/foods.db';
const TMP_PATH = 'assets/data/foods.db.tmp';

// Fallback nutrient ids used by Foundation Foods when the primary id is missing.
const FALLBACKS = {
  calories: [2048, 2047], // Atwater specific, Atwater general
  carbs: [1050], // carbohydrate, by summation
  sugar: [1063], // sugars, total
};

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

// Reuse existing ids so food logs that reference them keep resolving.
const existingIds = new Map();
if (existsSync(OUT_PATH)) {
  const old = new Database(OUT_PATH, { readonly: true });
  for (const r of old.prepare('SELECT fdc_id, id FROM foods').all()) existingIds.set(r.fdc_id, r.id);
  old.close();
  console.log(`Reusing ${existingIds.size} existing ids`);
}

rmSync(TMP_PATH, { force: true });
const db = new Database(TMP_PATH);
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
const readCsv = (dir, file) =>
  parse(readFileSync(`${dir}/${file}`), { columns: true, skip_empty_lines: true });

function loadSource(dir, fallbacks) {
  console.log(`Loading ${dir}...`);
  const foods = readCsv(dir, 'food.csv');
  const foodNutrients = readCsv(dir, 'food_nutrient.csv');
  const portions = readCsv(dir, 'food_portion.csv');
  const categories = readCsv(dir, 'food_category.csv');

  const categoryMap = {};
  for (const row of categories) categoryMap[row.id] = row.description;

  // fdc_id -> { calories: x, protein: x, ... } via NUTRIENT_MAP
  const nutrientsByFood = {};
  // fdc_id -> { nutrient_id: amount } for the fallback ids only
  const fallbackByFood = {};
  const fallbackIds = new Set(Object.values(fallbacks).flat());
  for (const row of foodNutrients) {
    const id = parseInt(row.nutrient_id);
    const col = NUTRIENT_MAP[id];
    if (col) {
      if (!nutrientsByFood[row.fdc_id]) nutrientsByFood[row.fdc_id] = {};
      nutrientsByFood[row.fdc_id][col] = parseFloat(row.amount) ?? null;
    }
    if (fallbackIds.has(id)) {
      if (!fallbackByFood[row.fdc_id]) fallbackByFood[row.fdc_id] = {};
      fallbackByFood[row.fdc_id][id] = parseFloat(row.amount);
    }
  }
  return { foods, nutrientsByFood, fallbackByFood, portions, categoryMap };
}

const sr = loadSource(SR_LEGACY_DIR, {});
const ff = loadSource(FOUNDATION_DIR, FALLBACKS);

// SR Legacy: the first portion entry per food is the default serving.
const srPortions = {};
for (const row of sr.portions) {
  if (srPortions[row.fdc_id]) continue;
  srPortions[row.fdc_id] = {
    serving_size: parseFloat(row.gram_weight) || 100,
    serving_unit: row.portion_description || 'g',
  };
}

// Foundation: the first portion entry with a positive gram weight, else 100 g.
const ffPortions = {};
for (const row of ff.portions) {
  if (ffPortions[row.fdc_id]) continue;
  const grams = parseFloat(row.gram_weight);
  if (!(grams > 0)) continue;
  ffPortions[row.fdc_id] = { serving_size: grams, serving_unit: 'g' };
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

// Must match the nutrient column order of the INSERT statement above. (Not Object.values of
// NUTRIENT_MAP: integer keys iterate in ascending numeric order.)
const COLS = [
  'calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar',
  'saturated_fat', 'trans_fat', 'polyunsat_fat', 'monounsat_fat',
  'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
  'thiamin', 'riboflavin', 'niacin', 'b6', 'folate', 'b12', 'choline',
  'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'sodium',
  'zinc', 'copper', 'manganese', 'selenium',
];
if (COLS.length !== Object.keys(NUTRIENT_MAP).length) throw new Error('COLS out of step with NUTRIENT_MAP');
function insertFood(food, n, p, category, source) {
  insert.run(
    existingIds.get(parseInt(food.fdc_id)) ?? randomUUID(),
    parseInt(food.fdc_id),
    food.description,
    category,
    p.serving_size,
    p.serving_unit,
    ...COLS.map((c) => n[c] ?? null),
    source,
    now
  );
}

const insertAll = db.transaction(() => {
  const stats = { sr: 0, ffAdded: 0, skippedDuplicateName: 0, skippedNoCalories: 0 };

  const srNames = new Set();
  for (const food of sr.foods) {
    const n = sr.nutrientsByFood[food.fdc_id] || {};
    const p = srPortions[food.fdc_id] || { serving_size: 100, serving_unit: 'g' };
    const category = sr.categoryMap[food.food_category_id] || null;
    insertFood(food, n, p, category, 'usda_sr_legacy');
    srNames.add(food.description.toLowerCase());
    stats.sr++;
  }

  for (const food of ff.foods) {
    if (food.data_type !== 'foundation_food') continue;
    const n = { ...(ff.nutrientsByFood[food.fdc_id] || {}) };
    const fb = ff.fallbackByFood[food.fdc_id] || {};
    for (const [col, ids] of Object.entries(FALLBACKS)) {
      if (Number.isFinite(n[col])) continue;
      const hit = ids.find((id) => Number.isFinite(fb[id]));
      if (hit !== undefined) n[col] = fb[hit];
    }
    if (!Number.isFinite(n.calories)) {
      stats.skippedNoCalories++;
      continue;
    }
    if (srNames.has(food.description.toLowerCase())) {
      stats.skippedDuplicateName++;
      continue;
    }
    // Carbs are computed by difference, so some raw meats come out slightly negative: clamp to 0.
    for (const c of COLS) n[c] = Number.isFinite(n[c]) ? Math.max(0, n[c]) : null;
    const p = ffPortions[food.fdc_id] || { serving_size: 100, serving_unit: 'g' };
    const category = ff.categoryMap[food.food_category_id] || null;
    insertFood(food, n, p, category, 'usda_foundation');
    stats.ffAdded++;
  }
  return stats;
});

const stats = insertAll();
db.close();

// Replace the asset only after a successful build.
rmSync(OUT_PATH, { force: true });
renameSync(TMP_PATH, OUT_PATH);

console.log(`SR Legacy rows: ${stats.sr}`);
console.log(`Foundation added: ${stats.ffAdded}`);
console.log(
  `Foundation skipped: ${stats.skippedDuplicateName} duplicate SR Legacy name, ${stats.skippedNoCalories} no calories`
);
console.log(`Done. Wrote ${OUT_PATH}`);
