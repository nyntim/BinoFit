/**
 * Pure Apple Health import/export plans. No native module; dates are local calendar days.
 */
import { format } from 'date-fns';

export const BINOFIT_PREFIX = 'binofit:';

export type WeightSource = 'manual' | 'healthkit';

export type WeightSample = {
  id: string;
  weight_kg: number;
  startDate: string;
  syncIdentifier?: string | null;
};

export type WeightHealthRow = {
  date: string;
  id: string;
  source: WeightSource | null;
  weight_kg: number;
  measured_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** HealthKit UUID for rows imported from Health (origin in link). */
  hk_sample_id?: string | null;
};

export type HealthLinkRow = {
  kind: 'weight' | 'nutrition' | 'workout';
  local_id: string;
  nutrient: '' | 'energy' | 'protein' | 'carbs' | 'fat';
  origin: 'out' | 'in';
  hk_id: string | null;
  hk_type: string;
  content_hash: string | null;
  sync_version: number;
  pending_delete: number;
};

export type NutritionDayTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type WorkoutForHealth = {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  deleted_at?: string | null;
};

export type NutritionNutrient = 'energy' | 'protein' | 'carbs' | 'fat';

export const WORKOUT_ACTIVITY_TYPE = 'TraditionalStrengthTraining';

export function roundKg(kg: number): number {
  return Math.round(kg * 100) / 100;
}

export function localDateFromIso(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd');
}

export function nutritionNoonIso(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

export function weightSyncId(entryId: string): string {
  return `${BINOFIT_PREFIX}weight:${entryId}`;
}

export function nutritionSyncId(date: string, nutrient: NutritionNutrient): string {
  return `${BINOFIT_PREFIX}nutrition:${date}:${nutrient}`;
}

export function workoutSyncId(workoutId: string): string {
  return `${BINOFIT_PREFIX}workout:${workoutId}`;
}

export function weightExportHash(weight_kg: number, measured_at: string): string {
  return `${roundKg(weight_kg)}|${measured_at}`;
}

export function nutritionExportHash(totals: NutritionDayTotals): string {
  const cal = Math.round(totals.calories);
  const p = Math.round(totals.protein * 10) / 10;
  const c = Math.round(totals.carbs * 10) / 10;
  const f = Math.round(totals.fat * 10) / 10;
  return `${cal}|${p}|${c}|${f}`;
}

export function workoutExportHash(start: string, end: string): string {
  return `${start}|${end}`;
}

export function roundNutritionTotals(totals: NutritionDayTotals): NutritionDayTotals {
  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
  };
}

function isManualSource(source: WeightSource | null | undefined): boolean {
  return source == null || source === 'manual';
}

export type WeightImportAction =
  | {
      type: 'insert';
      date: string;
      weight_kg: number;
      measured_at: string;
      hkSampleId: string;
    }
  | {
      type: 'update';
      id: string;
      weight_kg: number;
      measured_at: string;
      hkSampleId: string;
    };

export function planWeightImport(
  samples: WeightSample[],
  rows: WeightHealthRow[],
  outboundHkIds: ReadonlySet<string>
): WeightImportAction[] {
  const filtered = samples.filter((s) => {
    if (s.weight_kg < 20 || s.weight_kg > 400) return false;
    if (s.syncIdentifier?.startsWith(BINOFIT_PREFIX)) return false;
    if (outboundHkIds.has(s.id)) return false;
    return true;
  });

  const byDay = new Map<string, WeightSample>();
  for (const s of filtered) {
    const day = localDateFromIso(s.startDate);
    const prev = byDay.get(day);
    if (!prev) {
      byDay.set(day, s);
      continue;
    }
    const prevT = Date.parse(prev.startDate);
    const curT = Date.parse(s.startDate);
    if (curT > prevT || (curT === prevT && s.id > prev.id)) {
      byDay.set(day, s);
    }
  }

  const liveByDay = new Map<string, WeightHealthRow>();
  const tombstonesByDay: WeightHealthRow[] = [];
  for (const r of rows) {
    if (r.deleted_at) tombstonesByDay.push(r);
    else liveByDay.set(r.date, r);
  }

  const actions: WeightImportAction[] = [];
  for (const [day, sample] of byDay) {
    const live = liveByDay.get(day);
    if (live && isManualSource(live.source)) continue;

    if (live && live.source === 'healthkit') {
      const sameSample = (live.hk_sample_id ?? null) === sample.id;
      const sameKg = roundKg(live.weight_kg) === roundKg(sample.weight_kg);
      if (sameSample && sameKg) continue;
      actions.push({
        type: 'update',
        id: live.id,
        weight_kg: sample.weight_kg,
        measured_at: sample.startDate,
        hkSampleId: sample.id,
      });
      continue;
    }

    const tombstone = tombstonesByDay
      .filter((t) => t.date === day)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (tombstone && Date.parse(sample.startDate) <= Date.parse(tombstone.updated_at)) {
      continue;
    }

    actions.push({
      type: 'insert',
      date: day,
      weight_kg: sample.weight_kg,
      measured_at: sample.startDate,
      hkSampleId: sample.id,
    });
  }

  return actions;
}

export type WeightExportAction =
  | {
      type: 'save';
      entryId: string;
      weight_kg: number;
      measured_at: string;
      syncIdentifier: string;
      syncVersion: number;
      contentHash: string;
      unit: 'kg';
    }
  | { type: 'delete'; hk_id: string; entryId: string };

export function planWeightExport(
  liveManualRows: Pick<WeightHealthRow, 'id' | 'weight_kg' | 'measured_at' | 'source'>[],
  links: HealthLinkRow[],
  liveIds: ReadonlySet<string>
): WeightExportAction[] {
  const weightLinks = links.filter((l) => l.kind === 'weight');
  const actions: WeightExportAction[] = [];

  for (const link of weightLinks) {
    if (link.origin === 'in') continue;
    const rowLive = liveIds.has(link.local_id);
    if (link.pending_delete || !rowLive) {
      if (link.hk_id) {
        actions.push({ type: 'delete', hk_id: link.hk_id, entryId: link.local_id });
      }
    }
  }

  for (const row of liveManualRows) {
    if (row.source === 'healthkit') continue;
    const hash = weightExportHash(row.weight_kg, row.measured_at);
    const outLink = weightLinks.find(
      (l) => l.local_id === row.id && l.origin === 'out' && l.nutrient === ''
    );
    if (outLink && outLink.content_hash === hash && !outLink.pending_delete) continue;

    const version = outLink ? outLink.sync_version + 1 : 1;
    if (outLink?.hk_id && outLink.content_hash !== hash) {
      actions.push({ type: 'delete', hk_id: outLink.hk_id, entryId: row.id });
    }
    actions.push({
      type: 'save',
      entryId: row.id,
      weight_kg: roundKg(row.weight_kg),
      measured_at: row.measured_at,
      syncIdentifier: weightSyncId(row.id),
      syncVersion: version,
      contentHash: hash,
      unit: 'kg',
    });
  }

  return actions;
}

export type NutritionExportAction =
  | { type: 'delete_all'; date: string; hk_ids: Partial<Record<NutritionNutrient, string>> }
  | {
      type: 'save';
      date: string;
      totals: NutritionDayTotals;
      syncVersion: number;
      contentHash: string;
      sampleAt: string;
    };

const NUTRIENTS: NutritionNutrient[] = ['energy', 'protein', 'carbs', 'fat'];

export function planNutritionExport(
  days: Record<string, NutritionDayTotals>,
  links: HealthLinkRow[]
): NutritionExportAction[] {
  const nutritionLinks = links.filter((l) => l.kind === 'nutrition' && l.origin === 'out');
  const actions: NutritionExportAction[] = [];
  const dates = new Set([...Object.keys(days), ...nutritionLinks.map((l) => l.local_id)]);

  for (const date of dates) {
    const raw = days[date] ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const totals = roundNutritionTotals(raw);
    const hash = nutritionExportHash(totals);
    const dayLinks = nutritionLinks.filter((l) => l.local_id === date);
    const allZero =
      totals.calories === 0 && totals.protein === 0 && totals.carbs === 0 && totals.fat === 0;

    if (allZero) {
      const hk_ids: Partial<Record<NutritionNutrient, string>> = {};
      for (const n of NUTRIENTS) {
        const link = dayLinks.find((l) => l.nutrient === n);
        if (link?.hk_id) hk_ids[n] = link.hk_id;
      }
      if (Object.keys(hk_ids).length > 0) {
        actions.push({ type: 'delete_all', date, hk_ids });
      }
      continue;
    }

    const unchanged = dayLinks.length === 4 && dayLinks.every((l) => l.content_hash === hash);
    if (unchanged) continue;

    const hk_ids: Partial<Record<NutritionNutrient, string>> = {};
    for (const n of NUTRIENTS) {
      const link = dayLinks.find((l) => l.nutrient === n);
      if (link?.hk_id) hk_ids[n] = link.hk_id;
    }
    const maxVersion = dayLinks.reduce((m, l) => Math.max(m, l.sync_version), 0);
    if (Object.keys(hk_ids).length > 0) {
      actions.push({ type: 'delete_all', date, hk_ids });
    }
    actions.push({
      type: 'save',
      date,
      totals,
      syncVersion: maxVersion > 0 ? maxVersion + 1 : 1,
      contentHash: hash,
      sampleAt: nutritionNoonIso(date),
    });
  }

  return actions;
}

export type WorkoutExportAction =
  | {
      type: 'save';
      workoutId: string;
      start: string;
      end: string;
      syncVersion: number;
      contentHash: string;
      activityType: typeof WORKOUT_ACTIVITY_TYPE;
    }
  | { type: 'delete'; hk_id: string; workoutId: string };

function workoutWindow(w: WorkoutForHealth): { start: string; end: string } | null {
  if (!w.started_at) return null;
  const start = w.started_at;
  let end = w.ended_at;
  if (!end && w.duration_seconds != null) {
    end = new Date(Date.parse(start) + w.duration_seconds * 1000).toISOString();
  }
  if (!end) return null;
  if (Date.parse(end) <= Date.parse(start)) return null;
  return { start, end };
}

export function planWorkoutExport(
  doneWorkouts: WorkoutForHealth[],
  links: HealthLinkRow[]
): WorkoutExportAction[] {
  const workoutLinks = links.filter((l) => l.kind === 'workout' && l.origin === 'out');
  const actions: WorkoutExportAction[] = [];
  const liveIds = new Set(doneWorkouts.filter((w) => !w.deleted_at).map((w) => w.id));

  for (const link of workoutLinks) {
    if (link.origin === 'in') continue;
    const live = liveIds.has(link.local_id);
    if (link.pending_delete || !live) {
      if (link.hk_id) {
        actions.push({ type: 'delete', hk_id: link.hk_id, workoutId: link.local_id });
      }
    }
  }

  for (const w of doneWorkouts) {
    if (w.deleted_at) continue;
    const window = workoutWindow(w);
    if (!window) continue;
    const hash = workoutExportHash(window.start, window.end);
    const outLink = workoutLinks.find((l) => l.local_id === w.id);
    if (outLink && outLink.content_hash === hash && !outLink.pending_delete) continue;

    const version = outLink ? outLink.sync_version + 1 : 1;
    if (outLink?.hk_id) {
      actions.push({ type: 'delete', hk_id: outLink.hk_id, workoutId: w.id });
    }
    actions.push({
      type: 'save',
      workoutId: w.id,
      start: window.start,
      end: window.end,
      syncVersion: version,
      contentHash: hash,
      activityType: WORKOUT_ACTIVITY_TYPE,
    });
  }

  return actions;
}

/** Merge export plans with links as if prior saves succeeded (for idempotency checks). */
export function linksAfterWeightExport(
  links: HealthLinkRow[],
  actions: WeightExportAction[],
  saved: Map<string, { hk_id: string }>
): HealthLinkRow[] {
  let next = [...links];
  for (const a of actions) {
    if (a.type === 'delete') {
      next = next.filter(
        (l) => !(l.kind === 'weight' && l.local_id === a.entryId && l.origin === 'out')
      );
    } else if (a.type === 'save') {
      const hk_id = saved.get(a.entryId)?.hk_id ?? 'pending';
      next = next.filter(
        (l) => !(l.kind === 'weight' && l.local_id === a.entryId && l.origin === 'out')
      );
      next.push({
        kind: 'weight',
        local_id: a.entryId,
        nutrient: '',
        origin: 'out',
        hk_id,
        hk_type: 'BodyMass',
        content_hash: a.contentHash,
        sync_version: a.syncVersion,
        pending_delete: 0,
      });
    }
  }
  return next;
}
