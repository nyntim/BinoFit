// Weight log: SQLite store, pure helpers, and the rule that the latest entry is canonical for
// profile.weight. Weight is always kg here; lib/units converts for display.
import type * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { format } from 'date-fns';
import { getDatabase } from '@/lib/database';
import { getUserProfile, saveUserProfile } from '@/lib/storage';
import { decideRemoteApply, tombstoneSql } from '@/lib/tombstones';
import { formatWeight, kgToLb, lbToKg, parseDecimal } from '@/lib/units';
import { initHealthLinksSchema, markPendingDelete } from '@/lib/health-links';
import type { RemoteWeightEntry, WeightEntry, WeightEntrySource, WeightUnit } from '@/lib/types';
import type { WeightImportAction } from '@/lib/health-sync';

export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 400;

// ── Pure helpers ────────────────────────────────────────────────

export function isValidWeightKg(kg: number): boolean {
  return Number.isFinite(kg) && kg >= WEIGHT_MIN_KG && kg <= WEIGHT_MAX_KG;
}

/** Kilograms for a weight typed in the display unit, or null when it is not a valid weight. */
export function weightInputToKg(input: string, unit: WeightUnit): number | null {
  const value = parseDecimal(input);
  if (value === null) return null;
  const kg = unit === 'kg' ? value : lbToKg(value);
  return isValidWeightKg(kg) ? kg : null;
}

/** "Enter a weight between 20 and 400 kg." (whole-number bounds inside the range for lb). */
export function weightRangeMessage(unit: WeightUnit): string {
  if (unit === 'kg') return `Enter a weight between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg.`;
  return `Enter a weight between ${Math.ceil(kgToLb(WEIGHT_MIN_KG))} and ${Math.floor(kgToLb(WEIGHT_MAX_KG))} lb.`;
}

type Orderable = Pick<WeightEntry, 'date' | 'measured_at' | 'created_at' | 'id'>;

/** Positive when `a` is later than `b`: date, then measured_at, then created_at, then id. */
function compareEntries(a: Orderable, b: Orderable): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.measured_at !== b.measured_at) return a.measured_at < b.measured_at ? -1 : 1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The latest entry by date, then measured_at. Null for an empty list. */
export function pickLatest<T extends Orderable>(entries: T[]): T | null {
  let best: T | null = null;
  for (const e of entries) if (!best || compareEntries(e, best) > 0) best = e;
  return best;
}

/** One entry per day (the latest measured_at wins), newest day first. */
export function collapseLatestPerDay<T extends Orderable>(entries: T[]): T[] {
  const byDay = new Map<string, T>();
  for (const e of entries) {
    const current = byDay.get(e.date);
    if (!current || compareEntries(e, current) > 0) byDay.set(e.date, e);
  }
  return Array.from(byDay.values()).sort((a, b) => compareEntries(b, a));
}

/** Bodyweight to use for a calculation: the dated entry if there is one, else profile.weight, else null. */
export function resolveBodyweightKg(
  entry: Pick<WeightEntry, 'weight_kg'> | null | undefined,
  profile: { weight: number | null } | null | undefined
): number | null {
  if (entry) return entry.weight_kg;
  return profile?.weight ?? null;
}

/**
 * Change between two weights in the display unit, e.g. "−0.6 kg" or "+1.2 lb".
 * "0 kg" when it rounds to nothing.
 */
export function formatWeightChange(latestKg: number, previousKg: number, unit: WeightUnit): string {
  const diffKg = latestKg - previousKg;
  const magnitude = formatWeight(Math.abs(diffKg), unit);
  if (Number(magnitude) === 0) return `0 ${unit}`;
  return `${diffKg < 0 ? '−' : '+'}${magnitude} ${unit}`;
}

function localToday(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Now for today; local noon for any other day. */
function measuredAtFor(date: string, now: Date): string {
  if (date === format(now, 'yyyy-MM-dd')) return now.toISOString();
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

/** Supabase timestamptz strings carry offsets; local rows use plain ISO. */
function toIso(value: string | null | undefined, fallback: string): string {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
}

// ── Schema ──────────────────────────────────────────────────────

export async function initWeightSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS weight_entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      measured_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_weight_entries_date ON weight_entries(date);
  `);
  await db.execAsync(`ALTER TABLE weight_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';`).catch(() => {});
  await initHealthLinksSchema(db);
}

function fireAppleHealthSync(): void {
  void import('@/lib/health-schedule').then((m) => m.scheduleAppleHealthSync());
}

// ── Reads (always exclude tombstones, except getUnsyncedWeightEntries) ──

const LIVE_ORDER = 'ORDER BY date DESC, measured_at DESC, created_at DESC, id DESC';

export async function getLatestWeightEntry(): Promise<WeightEntry | null> {
  const db = await getDatabase();
  return db.getFirstAsync<WeightEntry>(
    `SELECT * FROM weight_entries WHERE deleted_at IS NULL ${LIVE_ORDER} LIMIT 1`
  );
}

/** Latest entry whose day is on or before `date` (yyyy-MM-dd). */
export async function getWeightOnOrBefore(date: string): Promise<WeightEntry | null> {
  const db = await getDatabase();
  return db.getFirstAsync<WeightEntry>(
    `SELECT * FROM weight_entries WHERE deleted_at IS NULL AND date <= ? ${LIVE_ORDER} LIMIT 1`,
    [date]
  );
}

/** The latest entry for each of the most recent `n` days, newest first. */
export async function getRecentWeightDays(n: number): Promise<WeightEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WeightEntry>(
    `SELECT * FROM weight_entries
     WHERE deleted_at IS NULL
       AND date IN (SELECT DISTINCT date FROM weight_entries WHERE deleted_at IS NULL ORDER BY date DESC LIMIT ?)
     ${LIVE_ORDER}`,
    [n]
  );
  return collapseLatestPerDay(rows);
}

/** Every live day (one entry per day, latest measured_at wins), newest first. */
export async function getLiveWeightDays(): Promise<WeightEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WeightEntry>(
    `SELECT * FROM weight_entries WHERE deleted_at IS NULL ${LIVE_ORDER}`
  );
  return collapseLatestPerDay(rows);
}

/** Includes tombstones; the only read that does. */
export async function getUnsyncedWeightEntries(): Promise<WeightEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<WeightEntry>('SELECT * FROM weight_entries WHERE synced_at IS NULL');
}

/** Live and tombstoned rows for Apple Health reconcile (the only other tombstone read). */
export async function getWeightRowsForHealth(): Promise<
  (Pick<
    WeightEntry,
    'date' | 'id' | 'source' | 'weight_kg' | 'measured_at' | 'updated_at' | 'deleted_at'
  >)[]
> {
  const db = await getDatabase();
  return db.getAllAsync(
    `SELECT date, id, source, weight_kg, measured_at, updated_at, deleted_at FROM weight_entries`
  );
}

// ── Writes ──────────────────────────────────────────────────────

/**
 * Makes profile.weight follow the latest entry. Writes only when the value differs, and leaves
 * the profile alone when there are no entries. A backdated entry is never the latest, so it does
 * not change the profile.
 */
export async function syncProfileWeightFromLatest(): Promise<void> {
  const latest = await getLatestWeightEntry();
  if (!latest) return;
  const profile = await getUserProfile();
  if (profile?.weight === latest.weight_kg) return;
  await saveUserProfile({
    weight: latest.weight_kg,
    height: profile?.height ?? null,
    activity_level: profile?.activity_level ?? null,
  });
}

/**
 * One entry per day: saving a day that has an entry updates it. Call syncToSupabase() after.
 */
export async function saveWeightEntry(input: { date?: string; weight_kg: number }): Promise<WeightEntry> {
  if (!isValidWeightKg(input.weight_kg)) {
    throw new Error(`Weight must be between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg`);
  }
  const date = input.date ?? localToday();
  const db = await getDatabase();
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const measuredAt = measuredAtFor(date, nowDate);

  const existing = await db.getFirstAsync<WeightEntry>(
    `SELECT * FROM weight_entries WHERE deleted_at IS NULL AND date = ? ${LIVE_ORDER} LIMIT 1`,
    [date]
  );
  let saved: WeightEntry;
  if (existing) {
    await db.runAsync(
      `UPDATE weight_entries SET weight_kg = ?, measured_at = ?, source = 'manual', updated_at = ?, synced_at = NULL
       WHERE id = ? AND deleted_at IS NULL`,
      [input.weight_kg, measuredAt, nowIso, existing.id]
    );
    saved = {
      ...existing,
      weight_kg: input.weight_kg,
      measured_at: measuredAt,
      source: 'manual',
      updated_at: nowIso,
      synced_at: null,
    };
  } else {
    const id = Crypto.randomUUID();
    await db.runAsync(
      `INSERT INTO weight_entries (id, date, weight_kg, measured_at, source, created_at, updated_at, synced_at, deleted_at)
       VALUES (?, ?, ?, ?, 'manual', ?, ?, NULL, NULL)`,
      [id, date, input.weight_kg, measuredAt, nowIso, nowIso]
    );
    saved = {
      id,
      date,
      weight_kg: input.weight_kg,
      measured_at: measuredAt,
      source: 'manual',
      created_at: nowIso,
      updated_at: nowIso,
      synced_at: null,
      deleted_at: null,
    };
  }
  await syncProfileWeightFromLatest();
  fireAppleHealthSync();
  return saved;
}

/** Applies HealthKit import actions without calling saveWeightEntry. Caller syncs once after the batch. */
export async function applyHealthWeightPlan(actions: WeightImportAction[]): Promise<boolean> {
  if (actions.length === 0) return false;
  const db = await getDatabase();
  const nowIso = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const a of actions) {
      if (a.type === 'insert') {
        const id = Crypto.randomUUID();
        await txn.runAsync(
          `INSERT INTO weight_entries (id, date, weight_kg, measured_at, source, created_at, updated_at, synced_at, deleted_at)
           VALUES (?, ?, ?, ?, 'healthkit', ?, ?, NULL, NULL)`,
          [id, a.date, a.weight_kg, a.measured_at, nowIso, nowIso]
        );
        await txn.runAsync(
          `INSERT INTO health_links (kind, local_id, nutrient, origin, hk_id, hk_type, content_hash, sync_version, pending_delete, updated_at)
           VALUES ('weight', ?, '', 'in', ?, 'BodyMass', NULL, 0, 0, ?)`,
          [id, a.hkSampleId, nowIso]
        );
      } else {
        await txn.runAsync(
          `UPDATE weight_entries SET weight_kg = ?, measured_at = ?, updated_at = ?, synced_at = NULL
           WHERE id = ? AND deleted_at IS NULL AND source = 'healthkit'`,
          [a.weight_kg, a.measured_at, nowIso, a.id]
        );
        await txn.runAsync(
          `UPDATE health_links SET hk_id = ?, updated_at = ? WHERE kind = 'weight' AND local_id = ? AND origin = 'in'`,
          [a.hkSampleId, nowIso, a.id]
        );
      }
    }
  });
  await syncProfileWeightFromLatest();
  return true;
}

/** Tombstones every entry of the day. Call syncToSupabase() after. */
export async function deleteWeightEntriesForDate(date: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const live = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM weight_entries WHERE date = ? AND deleted_at IS NULL',
    [date]
  );
  for (const row of live) {
    await markPendingDelete('weight', row.id);
    await db.runAsync(
      `DELETE FROM health_links WHERE kind = 'weight' AND local_id = ? AND origin = 'in'`,
      [row.id]
    );
  }
  await db.runAsync(`${tombstoneSql('weight_entries')} WHERE date = ? AND deleted_at IS NULL`, [now, now, date]);
  await syncProfileWeightFromLatest();
  fireAppleHealthSync();
}

/**
 * Merges account weight entries, last write wins on updated_at (tombstones via decideRemoteApply).
 * Returns how many live rows were inserted or updated. The caller recomputes profile.weight
 * afterwards with syncProfileWeightFromLatest().
 */
export async function applyRemoteWeightEntries(rows: RemoteWeightEntry[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = await getDatabase();
  const now = new Date().toISOString();
  let applied = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const r of rows) {
      const updatedAt = toIso(r.updated_at, now);
      const existing = await txn.getFirstAsync<{ updated_at: string }>(
        'SELECT updated_at FROM weight_entries WHERE id = ?',
        [r.id]
      );
      const decision = decideRemoteApply({ updated_at: updatedAt, deleted_at: r.deleted_at }, existing);
      if (decision === 'skip') continue;
      if (decision === 'delete') {
        await txn.runAsync('DELETE FROM weight_entries WHERE id = ?', [r.id]);
        continue;
      }
      const createdAt = toIso(r.created_at, updatedAt);
      const source: WeightEntrySource = r.source === 'healthkit' ? 'healthkit' : 'manual';
      await txn.runAsync(
        `INSERT INTO weight_entries (id, date, weight_kg, measured_at, source, created_at, updated_at, synced_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           date = excluded.date,
           weight_kg = excluded.weight_kg,
           measured_at = excluded.measured_at,
           source = excluded.source,
           updated_at = excluded.updated_at,
           deleted_at = NULL,
           synced_at = excluded.synced_at`,
        [r.id, r.date, r.weight_kg, toIso(r.measured_at, createdAt), source, createdAt, updatedAt, now]
      );
      applied++;
    }
  });
  return applied;
}
