import {
  REST_ADJUST_SECONDS,
  adjustRest,
  remainingSeconds,
  restChoiceLabel,
  restNotificationBody,
  restSecondsForTick,
  restoreRest,
  startRest,
} from '@/lib/workouts/rest-timer';
import { parseRestTimer } from '@/lib/storage';

const NOW = 1_000_000;
const timer = (over = {}) => ({ workoutId: 'w1', endsAt: NOW + 60_000, durationSeconds: 60, ...over });

describe('startRest', () => {
  it('sets the absolute end time and keeps exercise meta', () => {
    expect(startRest('w1', 90, NOW, { workoutExerciseId: 'we1', exerciseName: 'Bench' })).toEqual({
      workoutId: 'w1',
      endsAt: NOW + 90_000,
      durationSeconds: 90,
      workoutExerciseId: 'we1',
      exerciseName: 'Bench',
    });
  });

  it.each([0, -5, NaN])('returns null for duration %p (rest off)', (d) => {
    expect(startRest('w1', d, NOW)).toBeNull();
  });
});

describe('remainingSeconds', () => {
  it('rounds up so 0:01 shows until the end', () => {
    expect(remainingSeconds(timer(), NOW)).toBe(60);
    expect(remainingSeconds(timer(), NOW + 59_001)).toBe(1);
  });
  it('never goes negative', () => {
    expect(remainingSeconds(timer(), NOW + 60_000)).toBe(0);
    expect(remainingSeconds(timer(), NOW + 500_000)).toBe(0);
  });
});

describe('adjustRest', () => {
  it('+15 extends end time and duration', () => {
    expect(adjustRest(timer(), REST_ADJUST_SECONDS, NOW)).toEqual(
      timer({ endsAt: NOW + 75_000, durationSeconds: 75 })
    );
  });
  it('-15 shortens when more than 15 s remain', () => {
    expect(adjustRest(timer(), -15, NOW)).toEqual(timer({ endsAt: NOW + 45_000, durationSeconds: 45 }));
  });
  it('-15 with 15 s or less remaining ends the timer', () => {
    expect(adjustRest(timer({ endsAt: NOW + 15_000 }), -15, NOW)).toBeNull();
    expect(adjustRest(timer({ endsAt: NOW + 10_000 }), -15, NOW)).toBeNull();
  });
  it('-15 with 16 s remaining leaves 1 s', () => {
    const out = adjustRest(timer({ endsAt: NOW + 16_000 }), -15, NOW);
    expect(remainingSeconds(out!, NOW)).toBe(1);
  });
  it('keeps meta fields', () => {
    expect(adjustRest(timer({ exerciseName: 'Bench' }), 15, NOW)?.exerciseName).toBe('Bench');
  });
});

describe('restoreRest', () => {
  it('resumes a running timer of the active workout', () => {
    const t = timer();
    expect(restoreRest(t, 'w1', NOW + 1000)).toBe(t);
  });
  it('clears an expired timer (including exactly at end)', () => {
    expect(restoreRest(timer(), 'w1', NOW + 60_000)).toBeNull();
    expect(restoreRest(timer(), 'w1', NOW + 70_000)).toBeNull();
  });
  it('clears when the workout changed or there is no active workout', () => {
    expect(restoreRest(timer(), 'w2', NOW)).toBeNull();
    expect(restoreRest(timer(), null, NOW)).toBeNull();
  });
  it('returns null with nothing stored', () => {
    expect(restoreRest(null, 'w1', NOW)).toBeNull();
  });
});

describe('restNotificationBody', () => {
  it('names the exercise when known', () => {
    expect(restNotificationBody('Bench')).toBe('Next set: Bench.');
  });
  it('falls back without a name', () => {
    expect(restNotificationBody(undefined)).toBe('Next set.');
    expect(restNotificationBody('')).toBe('Next set.');
  });
});

describe('restChoiceLabel and restSecondsForTick', () => {
  it('labels 0 as No rest and others as m:ss', () => {
    expect(restChoiceLabel(0)).toBe('No rest');
    expect(restChoiceLabel(90)).toBe('1:30');
  });
  it('is 0 when disabled, the default when unset and keeps an explicit 0', () => {
    expect(restSecondsForTick(60, false)).toBe(0);
    expect(restSecondsForTick(null, false)).toBe(0);
    expect(restSecondsForTick(null, true)).toBe(90);
    expect(restSecondsForTick(undefined, true)).toBe(90);
    expect(restSecondsForTick(0, true)).toBe(0);
    expect(restSecondsForTick(45, true)).toBe(45);
  });
});

describe('parseRestTimer', () => {
  it('keeps workoutExerciseId and exerciseName', () => {
    const t = timer({ workoutExerciseId: 'we1', exerciseName: 'Bench' });
    expect(parseRestTimer(JSON.stringify(t))).toEqual(t);
  });
  it('omits meta of the wrong type', () => {
    expect(parseRestTimer(JSON.stringify(timer({ workoutExerciseId: 3, exerciseName: {} })))).toEqual(timer());
  });
  it.each([
    ['null', null],
    ['empty', ''],
    ['bad json', '{nope'],
    ['missing endsAt', JSON.stringify({ workoutId: 'w', durationSeconds: 5 })],
    ['string endsAt', JSON.stringify({ workoutId: 'w', endsAt: '5', durationSeconds: 5 })],
    ['numeric workoutId', JSON.stringify({ workoutId: 1, endsAt: 5, durationSeconds: 5 })],
    ['missing duration', JSON.stringify({ workoutId: 'w', endsAt: 5 })],
  ])('rejects %s', (_n, raw) => {
    expect(parseRestTimer(raw as string | null)).toBeNull();
  });
});
