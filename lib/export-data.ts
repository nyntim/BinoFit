import {
  getDatabase, getFoodLogsWithFoodInRange, getMealDefinitions, getMealNames,
  getMealSlotConfirmationsInRange,
} from '@/lib/database';
import { buildExportRows, csvField, exportFileName, toCsv } from '@/lib/export';

export type ExportKind = 'food' | 'workouts' | 'weight';
type Cell = string | number | null;
export type ExportDocument = { csv: string; count: number; first: string | null; last: string | null; fileName: string };

export function tableCsv(headers: readonly string[], rows: Cell[][]): string {
  return '\uFEFF' + [headers, ...rows].map((row) => row.map((v) =>
    csvField(v ?? '', typeof v === 'string')).join(',') + '\r\n').join('');
}

/** Local reads only. Bounds are inclusive local calendar dates, or null for all history. */
export async function loadExport(kind: ExportKind, start: string | null, end: string | null, today: string): Promise<ExportDocument> {
  if (kind === 'food') {
    const [logs, defs, names, confirmations] = await Promise.all([
      getFoodLogsWithFoodInRange(start, end), getMealDefinitions(), getMealNames(),
      getMealSlotConfirmationsInRange(start, end),
    ]);
    const rows = buildExportRows(logs, defs, names, confirmations);
    return { csv: toCsv(rows), count: rows.length, first: rows[0]?.date ?? null,
      last: rows.at(-1)?.date ?? null, fileName: exportFileName(start, end, today) };
  }
  const db = await getDatabase();
  let rows: { date: string; [key: string]: Cell }[];
  let headers: string[];
  let keys: string[];
  if (kind === 'weight') {
    rows = await db.getAllAsync(
      `SELECT date, id, measured_at, weight_kg, source FROM weight_entries
       WHERE deleted_at IS NULL AND (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
       ORDER BY date, measured_at, id`, [start, start, end, end]);
    headers = ['Date', 'Entry ID', 'Measured at', 'Weight (kg)', 'Source'];
    keys = ['date', 'id', 'measured_at', 'weight_kg', 'source'];
  } else {
    rows = await db.getAllAsync(
      `SELECT w.date, w.id, w.name, w.started_at, w.ended_at, w.duration_seconds AS workout_seconds,
        w.notes AS workout_notes, we.id AS workout_exercise_id, we.exercise_id,
        e.name AS exercise, we.position AS exercise_position, we.notes AS exercise_notes,
        s.id AS set_id, s.position AS set_position, s.set_type, s.weight_kg, s.reps,
        s.duration_seconds, s.distance_m, s.rpe, s.rir, s.completed_at
       FROM workouts w
       LEFT JOIN workout_exercises we ON we.workout_id = w.id AND we.deleted_at IS NULL
       LEFT JOIN exercises e ON e.id = we.exercise_id
       LEFT JOIN workout_sets s ON s.workout_exercise_id = we.id AND s.workout_id = w.id AND s.deleted_at IS NULL
       WHERE w.status = 'done' AND w.deleted_at IS NULL
         AND (? IS NULL OR w.date >= ?) AND (? IS NULL OR w.date <= ?)
       ORDER BY w.date, w.created_at, w.id, we.position, we.id, s.position, s.id`, [start, start, end, end]);
    headers = ['Date', 'Workout ID', 'Workout', 'Started at', 'Ended at', 'Workout duration (s)',
      'Workout notes', 'Workout exercise ID', 'Exercise ID', 'Exercise', 'Exercise position',
      'Exercise notes', 'Set ID', 'Set position', 'Set type', 'Weight (kg)', 'Reps', 'Duration (s)',
      'Distance (m)', 'RPE', 'RIR', 'Completed at'];
    keys = ['date', 'id', 'name', 'started_at', 'ended_at', 'workout_seconds', 'workout_notes',
      'workout_exercise_id', 'exercise_id', 'exercise', 'exercise_position', 'exercise_notes',
      'set_id', 'set_position', 'set_type', 'weight_kg', 'reps', 'duration_seconds', 'distance_m', 'rpe', 'rir', 'completed_at'];
  }
  return {
    csv: tableCsv(headers, rows.map((r) => keys.map((k) => r[k]))), count: rows.length,
    first: rows[0]?.date ?? null, last: rows.at(-1)?.date ?? null,
    fileName: `binofit-${kind}-${start && end ? `${start}-to-${end}` : `all-${today}`}.csv`,
  };
}
