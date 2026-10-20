const mockTables: Record<string, any[]> = {};
const mockFetched: string[] = [];
let mockFailTable: string | null = null;
const mockOrder: string[] = [];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.limit = async () => ({ data: (mockTables[table] ?? []).slice(0, 1), error: null });
      q.in = async () => ({ data: [], error: null });
      q.range = async (from: number, to: number) => {
        mockFetched.push(table);
        if (mockFailTable === table) return { data: null, error: new Error('boom') };
        return { data: (mockTables[table] ?? []).slice(from, to + 1), error: null };
      };
      return q;
    },
  },
}));
jest.mock('@/lib/database', () => ({
  applyRemoteCustomFoods: jest.fn(async () => 0),
  applyRemoteFoodLogs: jest.fn(async (rows: unknown[]) => {
    mockOrder.push('logs');
    return rows.length;
  }),
  cacheRemoteFood: jest.fn(async () => {}),
  getMissingFoodIds: jest.fn(async () => []),
  replaceMealsFromRemote: jest.fn(async () => {}),
}));
jest.mock('@/lib/weight', () => ({
  applyRemoteWeightEntries: jest.fn(async (rows: unknown[]) => rows.length),
  syncProfileWeightFromLatest: jest.fn(async () => {}),
}));
jest.mock('@/lib/foods-db', () => ({ getUSDAFoodById: jest.fn(async () => null) }));
jest.mock('@/lib/food-service', () => ({ lookupBarcode: jest.fn() }));
jest.mock('@/lib/reminders', () => ({ restoreMealReminders: jest.fn() }));
jest.mock('@/lib/storage', () => ({
  applyRemoteGoals: jest.fn(async () => true),
  applyRemoteProfile: jest.fn(async () => {}),
  setOnboardingComplete: jest.fn(async () => {}),
}));
jest.mock('@/lib/workouts/restore-apply', () => ({
  applyRemoteExercises: jest.fn(async (rows: unknown[]) => {
    mockOrder.push('exercises');
    return rows.length;
  }),
  applyRemoteWorkoutTree: jest.fn(async (tree: { workouts: unknown[] }) => {
    mockOrder.push('tree');
    return tree.workouts.length;
  }),
  applyRemoteRoutines: jest.fn(async (arg: { routines?: unknown[] } | unknown[]) => {
    mockOrder.push('routines');
    return Array.isArray(arg) ? arg.length : (arg.routines?.length ?? 0);
  }),
}));

import { describeRestore, restoreFromAccount } from '@/lib/restore';
import { applyRemoteExercises, applyRemoteRoutines, applyRemoteWorkoutTree } from '@/lib/workouts/restore-apply';

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockTables)) delete mockTables[k];
  mockFetched.length = 0;
  mockOrder.length = 0;
  mockFailTable = null;
});

describe('restoreFromAccount workouts', () => {
  it('fetches workout and routine tables and applies exercises before the workout tree and routines', async () => {
    mockTables.exercises = [{ id: 'e1' }];
    mockTables.workouts = [{ id: 'w1' }, { id: 'w2' }];
    mockTables.workout_exercises = [{ id: 'l1', exercise_id: 'e1' }];
    mockTables.workout_sets = [{ id: 's1' }];
    mockTables.routines = [{ id: 'r1' }];
    mockTables.routine_exercises = [{ id: 're1', exercise_id: 'e2' }];
    const res = await restoreFromAccount('u');
    expect(mockFetched).toEqual(
      expect.arrayContaining([
        'exercises',
        'workouts',
        'workout_exercises',
        'workout_sets',
        'routines',
        'routine_exercises',
      ])
    );
    expect(mockOrder.indexOf('exercises')).toBeLessThan(mockOrder.indexOf('tree'));
    expect(mockOrder.indexOf('exercises')).toBeLessThan(mockOrder.indexOf('routines'));
    expect(applyRemoteExercises).toHaveBeenCalledWith([{ id: 'e1' }], ['e1', 'e2']);
    expect(applyRemoteWorkoutTree).toHaveBeenCalledWith({
      workouts: [{ id: 'w1' }, { id: 'w2' }],
      workoutExercises: [{ id: 'l1', exercise_id: 'e1' }],
      sets: [{ id: 's1' }],
    });
    expect(applyRemoteRoutines).toHaveBeenCalledWith({
      routines: [{ id: 'r1' }],
      routineExercises: [{ id: 're1', exercise_id: 'e2' }],
    });
    expect(res).toMatchObject({ ok: true, workoutsRestored: 2, routinesRestored: 1 });
  });

  it('reports zero workouts for an account with none', async () => {
    const res = await restoreFromAccount('u');
    expect(res).toMatchObject({ ok: true, workoutsRestored: 0, routinesRestored: 0 });
  });

  it('a failed workout fetch is treated as empty and the rest of the restore succeeds', async () => {
    mockFailTable = 'workout_sets';
    mockTables.workouts = [{ id: 'w1' }];
    const res = await restoreFromAccount('u');
    expect(res).toMatchObject({ ok: true });
    expect(applyRemoteWorkoutTree).toHaveBeenCalledWith({
      workouts: [{ id: 'w1' }],
      workoutExercises: [],
      sets: [],
    });
  });

  it('describeRestore does not crash with workoutsRestored set', () => {
    const base = { logsRestored: 0, unresolvedFoods: 0, mealsRestored: false, goalsRestored: false, weightEntriesRestored: 0, routinesRestored: 0 };
    expect(typeof describeRestore({ ...base, workoutsRestored: 3 })).toBe('string');
  });
});
