import { supabase } from '@/lib/supabase';
import {
  applyRemoteFoodLogs,
  cacheRemoteFood,
  getMissingFoodIds,
  replaceMealsFromRemote,
} from '@/lib/database';
import { getUSDAFoodById } from '@/lib/foods-db';
import { lookupBarcode } from '@/lib/food-service';
import { restoreMealReminders } from '@/lib/reminders';
import { applyRemoteGoals, applyRemoteProfile, setOnboardingComplete } from '@/lib/storage';
import type {
  Food,
  RemoteFoodLog,
  RemoteMealDefinition,
  RemoteMealName,
  RemoteUserGoals,
  RemoteUserProfile,
} from '@/lib/types';

export const PAGE_SIZE = 1000;
const OFF_PREFIX = 'off:';
const FOOD_QUERY_BATCH = 100;
const OFF_CONCURRENCY = 4;

// ── Pure helpers ────────────────────────────────────────────────

/** True for rows not soft-deleted on the server (used to decide which foods to resolve). */
export function isLiveRow(row: { deleted_at?: string | null }): boolean {
  return row.deleted_at == null;
}

/** Inclusive [from, to] bounds for the page after `fetched` rows, as `.range()` expects. */
export function pageRange(fetched: number, pageSize: number = PAGE_SIZE): [number, number] {
  return [fetched, fetched + pageSize - 1];
}

export function uniqueFoodIds(logs: Pick<RemoteFoodLog, 'food_id'>[]): string[] {
  return Array.from(new Set(logs.map((l) => l.food_id)));
}

/** Open Food Facts foods are device-cached only (id `off:{code}`); everything else may be on Supabase. */
export function splitFoodIds(ids: string[]): { off: string[]; other: string[] } {
  const off: string[] = [];
  const other: string[] = [];
  for (const id of ids) (id.startsWith(OFF_PREFIX) ? off : other).push(id);
  return { off, other };
}

export function barcodeFromOffId(id: string): string {
  return id.slice(OFF_PREFIX.length);
}

type RemoteFoodRow = Record<string, unknown> & { id: string; name: string };

/** Maps a Supabase `foods` row to a local Food. Returns null if it cannot be used. */
export function remoteFoodToFood(row: RemoteFoodRow): Food | null {
  if (!row.id || !row.name) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const micro = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    id: row.id,
    name: row.name,
    brand: typeof row.brand === 'string' ? row.brand : null,
    serving_units: typeof row.serving_units === 'string' && row.serving_units ? row.serving_units : '100g',
    calories: num(row.calories),
    protein: num(row.protein),
    carbs: num(row.carbs),
    fat: num(row.fat),
    source: typeof row.source === 'string' ? row.source : 'branded',
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    fiber: micro(row.fiber),
    sugar: micro(row.sugar),
    sodium: micro(row.sodium),
    cholesterol: micro(row.cholesterol),
    saturated_fat: micro(row.saturated_fat),
    trans_fat: micro(row.trans_fat),
    vitamin_d: micro(row.vitamin_d),
    calcium: micro(row.calcium),
    iron: micro(row.iron),
    potassium: micro(row.potassium),
  };
}

// ── I/O ─────────────────────────────────────────────────────────

export type RestoreProgress =
  | { stage: 'logs'; fetched: number }
  | { stage: 'foods'; done: number; total: number }
  | { stage: 'saving' };

export type RestoreSummary = {
  logsRestored: number;
  /** Distinct foods that logs refer to but that could not be found anywhere. */
  unresolvedFoods: number;
  mealsRestored: boolean;
  goalsRestored: boolean;
};

/** True when a restore brought back anything beyond meal layout (meals alone do not skip onboarding). */
export function hasRestoredData(s: RestoreSummary): boolean {
  return s.goalsRestored || s.logsRestored > 0;
}

export type RestoreResult =
  | ({ ok: true } & RestoreSummary)
  | { ok: false; error: string };

type Table = 'food_logs' | 'meal_definitions' | 'meal_names' | 'user_goals' | 'user_profile';

/** Every row of `table` owned by the user, in 1000-row pages with a stable order. */
async function fetchAll<T>(
  table: Table,
  userId: string,
  orderBy: string[],
  onPage?: (total: number) => void
): Promise<T[]> {
  const out: T[] = [];
  for (;;) {
    const [from, to] = pageRange(out.length);
    let query = supabase.from(table).select('*').eq('user_id', userId);
    for (const col of orderBy) query = query.order(col, { ascending: true });
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    onPage?.(out.length);
    if (rows.length < PAGE_SIZE) return out;
  }
}

async function fetchSingle<T>(table: 'user_goals' | 'user_profile', userId: string): Promise<T | null> {
  const { data, error } = await supabase.from(table).select('*').eq('user_id', userId).limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as T | undefined) ?? null;
}

/**
 * Looks up foods the restored logs need and caches them locally: bundled foods.db first,
 * then Supabase, then Open Food Facts for `off:` ids (best-effort). Returns the ids that
 * stayed unresolved.
 */
async function resolveFoods(
  missing: string[],
  onProgress?: (p: RestoreProgress) => void
): Promise<string[]> {
  const total = missing.length;
  let done = 0;
  const tick = () => onProgress?.({ stage: 'foods', done, total });
  tick();

  const { off, other } = splitFoodIds(missing);
  const unresolved = new Set<string>();

  const needRemote: string[] = [];
  for (const id of other) {
    const usda = await getUSDAFoodById(id);
    if (usda) {
      await cacheRemoteFood(usda);
      done++;
      tick();
    } else {
      needRemote.push(id);
    }
  }

  for (let i = 0; i < needRemote.length; i += FOOD_QUERY_BATCH) {
    const batch = needRemote.slice(i, i + FOOD_QUERY_BATCH);
    const found = new Set<string>();
    try {
      const { data, error } = await supabase.from('foods').select('*').in('id', batch);
      if (error) throw error;
      for (const row of (data ?? []) as RemoteFoodRow[]) {
        const food = remoteFoodToFood(row);
        if (!food) continue;
        await cacheRemoteFood(food);
        found.add(food.id);
      }
    } catch {
      // Treated as unresolved below.
    }
    for (const id of batch) if (!found.has(id)) unresolved.add(id);
    done += batch.length;
    tick();
  }

  let next = 0;
  const worker = async () => {
    while (next < off.length) {
      const id = off[next++];
      const result = await lookupBarcode(barcodeFromOffId(id));
      if (result.status !== 'found' || result.food.id !== id) unresolved.add(id);
      done++;
      tick();
    }
  };
  await Promise.all(Array.from({ length: Math.min(OFF_CONCURRENCY, off.length) }, worker));

  return Array.from(unresolved);
}

/**
 * Pulls the account's data into the device. Food logs merge last-write-wins; meals, names,
 * goals and profile from the account replace the local copies. Never throws.
 */
export async function restoreFromAccount(
  userId: string,
  onProgress?: (p: RestoreProgress) => void
): Promise<RestoreResult> {
  try {
    onProgress?.({ stage: 'logs', fetched: 0 });
    const allLogs = await fetchAll<RemoteFoodLog>('food_logs', userId, ['id'], (n) =>
      onProgress?.({ stage: 'logs', fetched: n })
    );
    const [defs, names, goals, profile] = await Promise.all([
      fetchAll<RemoteMealDefinition>('meal_definitions', userId, ['id']),
      fetchAll<RemoteMealName>('meal_names', userId, ['meal_id', 'effective_from']),
      fetchSingle<RemoteUserGoals>('user_goals', userId),
      fetchSingle<RemoteUserProfile>('user_profile', userId),
    ]);

    const missing = await getMissingFoodIds(uniqueFoodIds(allLogs.filter(isLiveRow)));
    const unresolved = missing.length > 0 ? await resolveFoods(missing, onProgress) : [];

    onProgress?.({ stage: 'saving' });
    // Meals first so restored logs never point at a meal that does not exist yet.
    await replaceMealsFromRemote(defs, names);
    const logsRestored = await applyRemoteFoodLogs(allLogs);

    let goalsRestored = false;
    if (goals) goalsRestored = await applyRemoteGoals(goals);
    if (profile) await applyRemoteProfile(profile);
    if (hasRestoredData({ logsRestored, unresolvedFoods: 0, mealsRestored: false, goalsRestored })) {
      await setOnboardingComplete();
    }

    restoreMealReminders();

    return {
      ok: true,
      logsRestored,
      unresolvedFoods: unresolved.length,
      mealsRestored: defs.length > 0,
      goalsRestored,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Restore failed' };
  }
}

// ── Copy ────────────────────────────────────────────────────────

export function describeProgress(p: RestoreProgress | null): string {
  if (!p) return 'Restoring…';
  switch (p.stage) {
    case 'logs':
      return p.fetched > 0 ? `Restoring ${p.fetched} entries…` : 'Restoring…';
    case 'foods':
      return `Looking up foods ${p.done} of ${p.total}…`;
    case 'saving':
      return 'Saving to this device…';
  }
}

/** Neutral one-line outcome shown after a successful restore. */
export function describeRestore(s: RestoreSummary): string {
  const parts: string[] = [];
  if (s.logsRestored > 0) parts.push(`Restored ${s.logsRestored} ${s.logsRestored === 1 ? 'entry' : 'entries'}.`);
  else if (!hasRestoredData(s) && !s.mealsRestored) parts.push('No saved data found for this account.');
  else parts.push('Restored your settings.');
  if (s.unresolvedFoods > 0) {
    parts.push(
      `${s.unresolvedFoods} ${s.unresolvedFoods === 1 ? 'food' : 'foods'} could not be found, so entries using ${s.unresolvedFoods === 1 ? 'it' : 'them'} are hidden.`
    );
  }
  return parts.join(' ');
}
