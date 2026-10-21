import { createMemoryDb } from '@/test-utils/sqlite-memory';
import { parse } from 'csv-parse/sync';

let mem: ReturnType<typeof createMemoryDb>;
let loadExport: typeof import('@/lib/export-data').loadExport;
beforeEach(async () => {
  jest.resetModules();
  mem = createMemoryDb();
  (require('expo-sqlite').openDatabaseAsync as jest.Mock).mockResolvedValue(mem);
  await require('@/lib/database').getDatabase();
  loadExport = require('@/lib/export-data').loadExport;
});
afterEach(() => mem.raw.close());
function workout(id: string, date: string, status = 'done', deleted: string | null = null) {
  mem.raw.prepare(`INSERT INTO workouts (id,status,source,name,date,created_at,updated_at,deleted_at) VALUES (?,?,'manual',?,?, 'x','x',?)`).run(id, status, '=Workout, "A"', date, deleted);
}
function link(id: string, workoutId: string, deleted: string | null = null) {
  mem.raw.prepare(`INSERT INTO workout_exercises (id,workout_id,exercise_id,position,created_at,updated_at,deleted_at) VALUES (?,?,'barbell-bench-press',0,'x','x',?)`).run(id, workoutId, deleted);
}
function set(id: string, workoutId: string, linkId: string, deleted: string | null = null) {
  mem.raw.prepare(`INSERT INTO workout_sets (id,workout_id,workout_exercise_id,position,set_type,weight_kg,reps,created_at,updated_at,deleted_at) VALUES (?,?,?,0,'normal',40,8,'x','x',?)`).run(id, workoutId, linkId, deleted);
}
it('exports only done live workout trees in the inclusive date range, retaining empty workouts', async () => {
  workout('a', '2024-02-29'); workout('b', '2024-03-01'); workout('outside', '2024-03-02');
  workout('draft', '2024-02-29', 'draft'); workout('active', '2024-02-29', 'active'); workout('deleted', '2024-02-29', 'done', 'gone');
  link('live', 'a'); set('live-set', 'a', 'live'); set('deleted-set', 'a', 'live', 'gone');
  link('gone', 'a', 'gone'); set('hidden-by-parent', 'a', 'gone');
  const result = await loadExport('workouts', '2024-02-29', '2024-03-01', '2024-03-01');
  const rows = parse(result.csv, { bom: true, columns: true }) as Record<string, string>[];
  expect(rows).toHaveLength(2);
  expect(rows.map((r: Record<string, string>) => r['Workout ID'])).toEqual(['a', 'b']);
  expect(rows[0]).toMatchObject({ 'Weight (kg)': '40', Reps: '8', 'Set ID': 'live-set', Workout: '\'=Workout, "A"' });
  expect(rows[1]['Set ID']).toBe('');
  expect(result).toMatchObject({ first: '2024-02-29', last: '2024-03-01', count: 2 });
});
it('keeps every live weight measurement without collapsing a day and excludes tombstones', async () => {
  for (const [id, date, deleted] of [['a', '2024-02-29', null], ['b', '2024-02-29', null], ['c', '2024-03-01', 'gone'], ['d', '2024-03-02', null]]) {
    mem.raw.prepare(`INSERT INTO weight_entries (id,date,weight_kg,measured_at,source,created_at,updated_at,deleted_at) VALUES (?,?,72.123,?,'manual','x','x',?)`).run(id, date, `${date}T12:00:00`, deleted);
  }
  const result = await loadExport('weight', '2024-02-29', '2024-03-01', '2024-03-01');
  const rows = parse(result.csv, { bom: true, columns: true }) as Record<string, string>[];
  expect(rows.map((r: Record<string, string>) => r['Entry ID'])).toEqual(['a', 'b']);
  expect(rows[0]['Weight (kg)']).toBe('72.123');
  expect((await loadExport('weight', null, null, '2024-03-01')).count).toBe(3);
});
it('returns header-only CSV for empty datasets and excludes deleted food', async () => {
  const result = await loadExport('workouts', null, null, '2024-01-01');
  expect(result).toMatchObject({ count: 0, first: null, last: null });
  expect(parse(result.csv, { bom: true })).toHaveLength(1);
});
