// Apple Health reconcile: import weight; export weight, nutrition, and finished workouts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthTransitioning } from '@/lib/auth-transition';
import { Platform } from 'react-native';
import { format } from 'date-fns';
import AppleHealthKit from 'react-native-health';
import {
  applyHealthWeightPlan,
  getWeightRowsForHealth,
} from '@/lib/weight';
import { getAllHealthLinks, upsertHealthLink, deleteHealthLink } from '@/lib/health-links';
import {
  planWeightImport,
  planWeightExport,
  planNutritionExport,
  planWorkoutExport,
  nutritionSyncId,
  type NutritionDayTotals,
  type WeightHealthRow,
  type WeightSample,
  BINOFIT_PREFIX,
} from '@/lib/health-sync';
import { getDoneWorkoutsForHealth } from '@/lib/workouts/history';
import { sumEatenTotals } from '@/lib/nutrition-totals';
import { getDatabase } from '@/lib/database';
import { syncToSupabase } from '@/lib/sync';

const HK = (AppleHealthKit as any)?.default || AppleHealthKit;

const HK_SYNC_ID = 'HKMetadataKeySyncIdentifier';
const HK_SYNC_VER = 'HKMetadataKeySyncVersion';

const WEIGHT_START = '2000-01-01T00:00:00.000Z';

export type HealthSyncPassResult = 'ok' | 'init_required' | 'failed';

const HEALTH_LAST_SUCCESS_KEY = 'healthKitLastSuccessAt';
const healthListeners = new Set<() => void>();
let healthPass: Promise<HealthSyncPassResult> | null = null;
export function subscribeHealthSync(listener: () => void): () => void {
  healthListeners.add(listener);
  return () => { healthListeners.delete(listener); };
}
function notifyHealthSync(): void { healthListeners.forEach((listener) => listener()); }
export function isHealthSyncing(): boolean { return healthPass !== null; }
export async function waitForHealthSyncIdle(): Promise<void> { await healthPass; }
export async function loadLastHealthSync(): Promise<void> {
  const saved = await AsyncStorage.getItem(HEALTH_LAST_SUCCESS_KEY);
  if (saved && Number.isFinite(Date.parse(saved)) && !lastPassAt) { lastPassAt = new Date(saved); notifyHealthSync(); }
}
let lastPassAt: Date | null = null;
let lastPassFailed = false;

export function getLastHealthSyncAt(): Date | null {
  return lastPassAt;
}

export function getLastHealthSyncFailed(): boolean {
  return lastPassFailed;
}

function metadata(syncId: string, version: number): Record<string, string | number> {
  return { [HK_SYNC_ID]: syncId, [HK_SYNC_VER]: version };
}

function syncIdFromMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null;
  const v = meta[HK_SYNC_ID];
  return typeof v === 'string' ? v : null;
}

function hkCallback<T>(fn: (cb: (err: unknown, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function hkAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  if (typeof HK.isAvailable !== 'function') return false;
  return true;
}

async function readWeightSamples(): Promise<WeightSample[] | null> {
  if (!HK.getWeightSamples) return null;
  try {
    const results = await hkCallback<any[]>((cb) =>
      HK.getWeightSamples(
        { startDate: WEIGHT_START, endDate: new Date().toISOString(), unit: 'kg', ascending: true },
        cb
      )
    );
    return (results ?? []).map((r) => ({
      id: String(r.id),
      weight_kg: Number(r.value),
      startDate: String(r.startDate),
      syncIdentifier: syncIdFromMetadata(r.metadata),
    }));
  } catch {
    lastPassFailed = true;
    return null;
  }
}

async function saveWeightSample(opts: {
  value: number;
  unit: string;
  startDate: string;
  syncId: string;
  version: number;
}): Promise<string | null> {
  if (!HK.saveWeight) { lastPassFailed = true; return null; }
  try {
    const result = await hkCallback<{ id?: string; value?: number } | number>((cb) =>
      HK.saveWeight(
        {
          value: opts.value,
          unit: opts.unit,
          startDate: opts.startDate,
          metadata: metadata(opts.syncId, opts.version),
        },
        cb
      )
    );
    if (typeof result === 'object' && result?.id) return result.id;
    lastPassFailed = true;
    return null;
  } catch {
    lastPassFailed = true;
    return null;
  }
}

async function deleteHealthSample(type: string, uuid: string): Promise<boolean> {
  if (!HK.deleteHealthSample) return false;
  try {
    await hkCallback<unknown>((cb) => HK.deleteHealthSample(type, uuid, cb));
    return true;
  } catch {
    return false;
  }
}

/** Removes the HealthKit sample first; only clears the local link when delete succeeds. */
async function retractHealthSample(
  type: string,
  uuid: string | null | undefined,
  clearLink: () => Promise<void>
): Promise<void> {
  if (!uuid) {
    await clearLink();
    return;
  }
  const ok = await deleteHealthSample(type, uuid);
  if (ok) await clearLink();
  else lastPassFailed = true;
}

async function saveDietarySample(opts: {
  type: 'EnergyConsumed' | 'Protein' | 'Carbohydrates' | 'FatTotal';
  value: number;
  unit: string;
  startDate: string;
  endDate: string;
  syncId: string;
  version: number;
}): Promise<string | null> {
  if (!HK.saveDietarySample) { lastPassFailed = true; return null; }
  try {
    return await hkCallback<string>((cb) =>
      HK.saveDietarySample(
        {
          type: opts.type,
          value: opts.value,
          unit: opts.unit,
          startDate: opts.startDate,
          endDate: opts.endDate,
          metadata: metadata(opts.syncId, opts.version),
        },
        cb
      )
    );
  } catch {
    lastPassFailed = true;
    return null;
  }
}

async function saveWorkoutSample(opts: {
  startDate: string;
  endDate: string;
  type: string;
  syncId: string;
  version: number;
}): Promise<string | null> {
  if (!HK.saveWorkout) { lastPassFailed = true; return null; }
  try {
    return await hkCallback<string>((cb) =>
      HK.saveWorkout(
        {
          type: opts.type,
          startDate: opts.startDate,
          endDate: opts.endDate,
          metadata: metadata(opts.syncId, opts.version),
        },
        cb
      )
    );
  } catch {
    lastPassFailed = true;
    return null;
  }
}

async function buildNutritionDays(today: string): Promise<Record<string, NutritionDayTotals>> {
  const db = await getDatabase();
  const logs = await db.getAllAsync<{
    date: string;
    meal_slot: string;
    serving_amount: number;
    food_calories: number;
    food_protein: number;
    food_carbs: number;
    food_fat: number;
  }>(
    `SELECT fl.date, fl.meal_slot, fl.serving_amount,
            f.calories AS food_calories, f.protein AS food_protein,
            f.carbs AS food_carbs, f.fat AS food_fat
     FROM food_logs fl
     JOIN foods f ON fl.food_id = f.id
     WHERE fl.deleted_at IS NULL AND fl.date <= ?`,
    [today]
  );
  const confirmations = await db.getAllAsync<{ date: string; meal_slot: string; confirmed: number }>(
    'SELECT date, meal_slot, confirmed FROM meal_slot_confirmations WHERE date <= ?',
    [today]
  );
  const confByDate = new Map<string, { meal_slot: string; confirmed: boolean }[]>();
  for (const c of confirmations) {
    const list = confByDate.get(c.date) ?? [];
    list.push({ meal_slot: c.meal_slot, confirmed: c.confirmed === 1 });
    confByDate.set(c.date, list);
  }
  const byDate = new Map<string, typeof logs>();
  for (const l of logs) {
    const list = byDate.get(l.date) ?? [];
    list.push(l);
    byDate.set(l.date, list);
  }
  const out: Record<string, NutritionDayTotals> = {};
  for (const [date, dayLogs] of byDate) {
    out[date] = sumEatenTotals(dayLogs, confByDate.get(date) ?? []);
  }
  return out;
}

function attachInboundHkIds(rows: WeightHealthRow[], links: Awaited<ReturnType<typeof getAllHealthLinks>>) {
  const inByEntry = new Map(
    links.filter((l) => l.kind === 'weight' && l.origin === 'in').map((l) => [l.local_id, l.hk_id])
  );
  return rows.map((r) => ({
    ...r,
    hk_sample_id: inByEntry.get(r.id) ?? null,
  }));
}

export function runAppleHealthSyncPass(): Promise<HealthSyncPassResult> {
  if (healthPass) return healthPass;
  if (isAuthTransitioning()) return Promise.resolve('init_required');
  healthPass = runHealthPass().finally(() => { healthPass = null; notifyHealthSync(); });
  notifyHealthSync();
  return healthPass;
}

async function runHealthPass(): Promise<HealthSyncPassResult> {
  if (await AsyncStorage.getItem('accountDeletionPending')) return 'init_required';
  if (!hkAvailable()) return 'init_required';
  lastPassFailed = false;
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    const links = await getAllHealthLinks();
    const outboundHkIds = new Set(
      links.filter((l) => l.origin === 'out' && l.hk_id).map((l) => l.hk_id as string)
    );

    const weightRowsRaw = await getWeightRowsForHealth();
    const weightRows = attachInboundHkIds(
      weightRowsRaw.map((r) => ({ ...r, deleted_at: r.deleted_at ?? null })),
      links
    );

    const weightSamples = await readWeightSamples();
    const weightReadOk = weightSamples !== null;

    let weightChanged = false;
    if (weightReadOk) {
      const importPlan = planWeightImport(weightSamples, weightRows, outboundHkIds);
      if (await applyHealthWeightPlan(importPlan)) {
        weightChanged = true;
      }
    }

    const liveIds = new Set(weightRows.filter((r) => !r.deleted_at).map((r) => r.id));
    const liveManual = weightRows.filter((r) => !r.deleted_at && r.source !== 'healthkit');
    let weightExport = planWeightExport(liveManual, links, liveIds);
    if (!weightReadOk) {
      weightExport = weightExport.filter((a) => a.type === 'delete' || links.some((l) => l.local_id === (a as any).entryId && l.hk_id));
    }

    const nutritionDays = await buildNutritionDays(today);
    for (const l of links.filter((x) => x.kind === 'nutrition' && x.origin === 'out')) {
      if (!(l.local_id in nutritionDays)) nutritionDays[l.local_id] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    }
    const nutritionExport = planNutritionExport(nutritionDays, links);

    const workouts = await getDoneWorkoutsForHealth();
    const workoutExport = planWorkoutExport(workouts, links);

    for (const a of weightExport) {
      if (a.type === 'delete') {
        await retractHealthSample('BodyMass', a.hk_id, () =>
          deleteHealthLink('weight', a.entryId, '')
        );
      } else {
        const hkId = await saveWeightSample({
          value: a.weight_kg,
          unit: a.unit,
          startDate: a.measured_at,
          syncId: a.syncIdentifier,
          version: a.syncVersion,
        });
        if (hkId) {
          await upsertHealthLink({
            kind: 'weight',
            local_id: a.entryId,
            nutrient: '',
            origin: 'out',
            hk_id: hkId,
            hk_type: 'BodyMass',
            content_hash: a.contentHash,
            sync_version: a.syncVersion,
            pending_delete: 0,
          });
        }
      }
    }

    const nutritionTypes = {
      energy: 'EnergyConsumed',
      protein: 'Protein',
      carbs: 'Carbohydrates',
      fat: 'FatTotal',
    } as const;

    for (const a of nutritionExport) {
      if (a.type === 'delete_all') {
        for (const nutrient of ['energy', 'protein', 'carbs', 'fat'] as const) {
          const id = a.hk_ids[nutrient];
          await retractHealthSample(nutritionTypes[nutrient], id, () =>
            deleteHealthLink('nutrition', a.date, nutrient)
          );
        }
      } else {
        const v = a.syncVersion;
        const at = a.sampleAt;
        const saves: { nutrient: 'energy' | 'protein' | 'carbs' | 'fat'; type: any; unit: string; value: number }[] = [
          { nutrient: 'energy', type: 'EnergyConsumed', unit: 'kilocalorie', value: a.totals.calories },
          { nutrient: 'protein', type: 'Protein', unit: 'gram', value: a.totals.protein },
          { nutrient: 'carbs', type: 'Carbohydrates', unit: 'gram', value: a.totals.carbs },
          { nutrient: 'fat', type: 'FatTotal', unit: 'gram', value: a.totals.fat },
        ];
        for (const s of saves) {
          const hkId = await saveDietarySample({
            type: s.type,
            value: s.value,
            unit: s.unit,
            startDate: at,
            endDate: at,
            syncId: nutritionSyncId(a.date, s.nutrient),
            version: v,
          });
          if (hkId) {
            await upsertHealthLink({
              kind: 'nutrition',
              local_id: a.date,
              nutrient: s.nutrient,
              origin: 'out',
              hk_id: hkId,
              hk_type: s.type,
              content_hash: a.contentHash,
              sync_version: v,
              pending_delete: 0,
            });
          }
        }
      }
    }

    for (const a of workoutExport) {
      if (a.type === 'delete') {
        await retractHealthSample('Workout', a.hk_id, () =>
          deleteHealthLink('workout', a.workoutId, '')
        );
      } else {
        const hkId = await saveWorkoutSample({
          startDate: a.start,
          endDate: a.end,
          type: a.activityType,
          syncId: `${BINOFIT_PREFIX}workout:${a.workoutId}`,
          version: a.syncVersion,
        });
        if (hkId) {
          await upsertHealthLink({
            kind: 'workout',
            local_id: a.workoutId,
            nutrient: '',
            origin: 'out',
            hk_id: hkId,
            hk_type: 'Workout',
            content_hash: a.contentHash,
            sync_version: a.syncVersion,
            pending_delete: 0,
          });
        }
      }
    }

    if (weightChanged) syncToSupabase();

    const { fetchTodayActivityFromHealthKit } = await import('@/lib/health-kit-activity');
    await fetchTodayActivityFromHealthKit(true, true);

    if (lastPassFailed) return 'failed';
    const completed = new Date();
    await AsyncStorage.setItem(HEALTH_LAST_SUCCESS_KEY, completed.toISOString());
    lastPassAt = completed;
    return 'ok';
  } catch {
    lastPassFailed = true;
    return 'failed';
  }
}
