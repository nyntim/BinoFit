import { createMemoryDb } from '@/test-utils/sqlite-memory';

jest.mock('@/lib/sync', () => ({ syncToSupabase: jest.fn() }));

let Notifications: typeof import('expo-notifications');
let session: typeof import('@/lib/workouts/session');
let w: typeof import('@/lib/workouts/db');
let restStore: typeof import('@/lib/workouts/rest-timer-store');

const NOW = new Date(2026, 5, 1, 12, 0, 0);
const cancels = () => (Notifications.cancelScheduledNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);

beforeEach(async () => {
  const mem = createMemoryDb();
  jest.resetModules();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  require('expo-sqlite').openDatabaseAsync.mockResolvedValue(mem);
  Notifications = require('expo-notifications');
  require('react-native').Platform.OS = 'ios';
  await require('@/lib/database').getDatabase();
  mem.raw
    .prepare(
      `INSERT INTO exercises (id,name,log_type,equipment,source,created_at,updated_at)
       VALUES ('ex1','Bench','weight_reps','barbell','custom','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`
    )
    .run();
  w = require('@/lib/workouts/db');
  session = require('@/lib/workouts/session');
  restStore = require('@/lib/workouts/rest-timer-store');
  restStore.resetRestTimerStore();
  jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

async function activeWithTickedSet() {
  const a = await session.startEmptyWorkout(NOW);
  const link = await w.addWorkoutExercise({ workout_id: a.id, exercise_id: 'ex1' });
  await w.addWorkoutSet({ workout_exercise_id: link.id, weight_kg: 50, reps: 5, completed_at: NOW.toISOString() });
  restStore.startRestTimer({ workoutId: a.id, durationSeconds: 90 }, NOW.getTime());
  return a;
}

it('finishWorkout ends the rest timer and cancels its notification', async () => {
  const a = await activeWithTickedSet();
  jest.clearAllMocks();
  expect(await session.finishWorkout(a.id, { discardUnticked: false }, new Date(NOW.getTime() + 60_000))).toBe('finished');
  expect(restStore.getRestTimerState().timer).toBeNull();
  expect(cancels()).toContain(`rest-timer:${a.id}`);
});

it('discardActiveWorkout ends the rest timer and cancels its notification', async () => {
  const a = await activeWithTickedSet();
  jest.clearAllMocks();
  await session.discardActiveWorkout(a.id);
  expect(restStore.getRestTimerState().timer).toBeNull();
  expect(cancels()).toContain(`rest-timer:${a.id}`);
});
