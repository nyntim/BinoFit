const mockCapture = jest.fn(async () => {});
jest.mock('@/lib/spotify/now-playing', () => ({ captureFinalPlaylist: (...a: unknown[]) => mockCapture(...(a as [])) }));
jest.mock('@/lib/workouts/session', () => ({ finishWorkout: jest.fn(async () => 'finished'), discardActiveWorkout: jest.fn() }));
jest.mock('@/lib/workouts/rest-timer-store', () => ({ stopRestTimer: jest.fn() }));
jest.mock('@/lib/workouts/db', () => ({ getWorkoutWithExercises: jest.fn() }));

import { confirmAndFinish } from '@/lib/workouts/finish-flow';

describe('confirmAndFinish playlist capture', () => {
  beforeEach(() => mockCapture.mockClear());
  it('checks the playlist when finishing now', async () => {
    expect(await confirmAndFinish('w1')).toBe('finished');
    expect(mockCapture).toHaveBeenCalledWith('w1', 3000);
  });
  it('skips it for a back-dated finish', async () => {
    await confirmAndFinish('w1', new Date());
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
