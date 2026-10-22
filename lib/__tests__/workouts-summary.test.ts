import {
  formatDurationShort,
  formatMuscleSetCount,
  formatVolume,
  formatWeekRange,
  groupByMonth,
  pairRows,
  setsPerMuscle,
  summarizeWeek,
  summarizeWorkout,
  weekRange,
  workoutTitle,
} from '@/lib/workouts/summary';
import type { WorkoutWithExercises } from '@/lib/types';

const T = '2025-10-01T00:00:00.000Z';

function ex(over: any = {}) {
  return {
    id: 'e',
    name: 'Bench Press',
    log_type: 'weight_reps',
    brand: null,
    per_side: 0,
    ...over,
  };
}
function set(over: any = {}) {
  return {
    id: 's',
    set_type: 'normal',
    weight_kg: null,
    reps: null,
    duration_seconds: null,
    distance_m: null,
    ...over,
  };
}
function link(exercise: any, sets: any[]) {
  return { id: 'l', exercise, exercise_name: exercise?.name ?? 'Unknown exercise', sets };
}
function wk(over: any = {}, exercises: any[] = []): WorkoutWithExercises {
  return {
    id: 'w1',
    status: 'done',
    name: null,
    date: '2025-10-15',
    started_at: null,
    ended_at: null,
    duration_seconds: null,
    created_at: T,
    updated_at: T,
    ...over,
    exercises,
  } as WorkoutWithExercises;
}
const strength = (sets = [set({ weight_kg: 100, reps: 10 })]) => link(ex(), sets);
const run = (sets = [set({ distance_m: 5000, duration_seconds: 1500 })]) =>
  link(ex({ id: 'r', name: 'Running', log_type: 'distance_duration' }), sets);

describe('weekRange', () => {
  it('Sunday 23:59 local belongs to the week ending that Sunday', () => {
    expect(weekRange(new Date(2025, 9, 19, 23, 59, 59))).toEqual({ start: '2025-10-13', end: '2025-10-19' });
  });
  it('Monday 00:00 local starts a new week', () => {
    expect(weekRange(new Date(2025, 9, 20, 0, 0, 0))).toEqual({ start: '2025-10-20', end: '2025-10-26' });
  });
  it('a week spanning a month boundary', () => {
    expect(weekRange(new Date(2025, 9, 2, 12))).toEqual({ start: '2025-09-29', end: '2025-10-05' });
  });
  it('a week spanning a year boundary', () => {
    expect(weekRange(new Date(2025, 0, 1, 12))).toEqual({ start: '2024-12-30', end: '2025-01-05' });
  });
});

describe('formatWeekRange', () => {
  it('within one month names the month once', () => {
    expect(formatWeekRange({ start: '2025-10-13', end: '2025-10-19' })).toBe('Mon 13 to Sun 19 Oct');
  });
  it('repeats the month across months', () => {
    expect(formatWeekRange({ start: '2025-09-29', end: '2025-10-05' })).toBe('Mon 29 Sep to Sun 5 Oct');
  });
  it('repeats month and year across years', () => {
    expect(formatWeekRange({ start: '2024-12-30', end: '2025-01-05' })).toBe(
      'Mon 30 Dec 2024 to Sun 5 Jan 2025'
    );
  });
});

describe('formatDurationShort', () => {
  it('formats minutes, hours with padded minutes, and zero', () => {
    expect(formatDurationShort(58 * 60)).toBe('58 min');
    expect(formatDurationShort(64 * 60)).toBe('1h 04m');
    expect(formatDurationShort(3600)).toBe('1h 00m');
    expect(formatDurationShort(0)).toBe('0 min');
  });
  it('rounds to whole minutes and clamps negatives', () => {
    expect(formatDurationShort(89)).toBe('1 min');
    expect(formatDurationShort(3599)).toBe('1h 00m');
    expect(formatDurationShort(-30)).toBe('0 min');
  });
});

describe('formatVolume', () => {
  it('shows lb rounded with thousands separators', () => {
    expect(formatVolume(1000, 'lb')).toBe('2,205');
    expect(formatVolume(0, 'lb')).toBe('0');
    expect(formatVolume(100, 'lb')).toBe('220');
  });
  it('shows kg unconverted', () => {
    expect(formatVolume(12450.4, 'kg')).toBe('12,450');
  });
});

describe('workoutTitle', () => {
  it('uses a set name, trimmed', () => {
    expect(workoutTitle(wk({ name: '  Push day ' }, [strength()]))).toBe('Push day');
  });
  it('blank name falls back to Workout · date', () => {
    expect(workoutTitle(wk({ name: '   ' }, [strength()]))).toBe('Workout · Wed 15 Oct');
    expect(workoutTitle(wk({ name: null }, []))).toBe('Workout · Wed 15 Oct');
  });
  it('blank name with a single cardio exercise uses the exercise name', () => {
    expect(workoutTitle(wk({}, [run()]))).toBe('Running');
  });
  it('blank name with two cardio exercises uses the date fallback', () => {
    expect(workoutTitle(wk({}, [run(), run()]))).toBe('Workout · Wed 15 Oct');
  });
});

describe('summarizeWorkout', () => {
  it('lists exercise names with brand, only those with sets, and volume in lb', () => {
    const s = summarizeWorkout(
      wk({ name: 'Push', duration_seconds: 3540 }, [
        link(ex({ brand: 'Hammer' }), [set({ weight_kg: 100, reps: 10 })]),
        link(ex({ name: 'Curl' }), []),
        link(ex({ name: 'Row' }), [set({ weight_kg: 50, reps: 10 })]),
      ]),
      'lb'
    );
    expect(s.title).toBe('Push');
    expect(s.subtitle).toBe('Wed 15 Oct · Bench Press · Hammer, Row');
    expect(s.detailLabel).toBe('3,307 lb');
    expect(s.durationLabel).toBe('59 min');
  });
  it('playlistLabel is set only with a playlist id, with a fallback name', () => {
    expect(summarizeWorkout(wk({}, [link(ex(), [])]), 'kg').playlistLabel).toBeNull();
    expect(summarizeWorkout(wk({ playlist_id: 'abc', playlist_name: ' Lift ' }, [link(ex(), [])]), 'kg').playlistLabel).toBe('Lift');
    expect(summarizeWorkout(wk({ playlist_id: 'abc', playlist_name: null }, [link(ex(), [])]), 'kg').playlistLabel).toBe('Spotify playlist');
    expect(summarizeWorkout(wk({ playlist_name: 'orphan' }, [link(ex(), [])]), 'kg').playlistLabel).toBeNull();
  });
  it('subtitle is just the date when nothing has sets', () => {
    const s = summarizeWorkout(wk({}, [link(ex(), [])]), 'kg');
    expect(s.subtitle).toBe('Wed 15 Oct');
    expect(s.detailLabel).toBeNull();
  });
  it('single cardio exercise shows distance and pace, label cardio', () => {
    const s = summarizeWorkout(wk({}, [run()]), 'kg');
    expect(s.title).toBe('Running');
    expect(s.subtitle).toBe('Wed 15 Oct · 5.00 km · 5:00 /km');
    expect(s.detailLabel).toBe('cardio');
  });
  it('cardio in miles uses mi and /mi pace', () => {
    const s = summarizeWorkout(wk({}, [run([set({ distance_m: 1609.344, duration_seconds: 600 })])]), 'lb');
    expect(s.subtitle).toBe('Wed 15 Oct · 1.00 mi · 10:00 /mi');
  });
  it('cardio without distance has only the date', () => {
    const s = summarizeWorkout(wk({}, [run([set({ duration_seconds: 600 })])]), 'kg');
    expect(s.subtitle).toBe('Wed 15 Oct');
    expect(s.detailLabel).toBe('cardio');
  });
  it('multiple cardio exercises list names, label cardio', () => {
    const s = summarizeWorkout(wk({}, [run(), run()]), 'kg');
    expect(s.subtitle).toBe('Wed 15 Oct · Running, Running');
    expect(s.detailLabel).toBe('cardio');
  });
  it('mixed strength and cardio with no volume has no label', () => {
    const s = summarizeWorkout(wk({}, [run(), strength([set({ reps: 5 })])]), 'kg');
    expect(s.detailLabel).toBeNull();
  });
  it('duration falls back from stored to started/ended to 0', () => {
    expect(summarizeWorkout(wk({ duration_seconds: 600, started_at: '2025-10-15T10:00:00.000Z', ended_at: '2025-10-15T11:00:00.000Z' }), 'kg').durationLabel).toBe('10 min');
    expect(summarizeWorkout(wk({ started_at: '2025-10-15T10:00:00.000Z', ended_at: '2025-10-15T11:04:00.000Z' }), 'kg').durationLabel).toBe('1h 04m');
    expect(summarizeWorkout(wk({}), 'kg').durationLabel).toBe('0 min');
    expect(summarizeWorkout(wk({ started_at: '2025-10-15T10:00:00.000Z' }), 'kg').durationLabel).toBe('0 min');
  });
  it('unknown exercise (null definition) uses its stored name and no volume', () => {
    const s = summarizeWorkout(wk({}, [link(null, [set({ weight_kg: 50, reps: 5 })])]), 'kg');
    expect(s.subtitle).toBe('Wed 15 Oct · Unknown exercise');
    expect(s.detailLabel).toBeNull();
  });
});

describe('summarizeWeek', () => {
  it('totals sessions, volume and duration', () => {
    const a = wk({ id: 'a', duration_seconds: 1800 }, [strength()]);
    const b = wk({ id: 'b', started_at: '2025-10-16T10:00:00.000Z', ended_at: '2025-10-16T10:30:00.000Z' }, [
      strength([set({ weight_kg: 50, reps: 10 })]),
    ]);
    expect(summarizeWeek([a, b])).toEqual({ sessions: 2, volumeKg: 1500, durationSeconds: 3600 });
  });
  it('empty week is all zeros', () => {
    expect(summarizeWeek([])).toEqual({ sessions: 0, volumeKg: 0, durationSeconds: 0 });
  });
});

describe('groupByMonth', () => {
  it('groups consecutive items by month, keeping order and labelling with year', () => {
    const items = [
      { date: '2025-10-15', n: 1 },
      { date: '2025-10-02', n: 2 },
      { date: '2025-09-30', n: 3 },
      { date: '2024-09-01', n: 4 },
    ];
    const g = groupByMonth(items);
    expect(g.map((x) => [x.key, x.label, x.items.map((i) => i.n)])).toEqual([
      ['2025-10', 'October 2025', [1, 2]],
      ['2025-09', 'September 2025', [3]],
      ['2024-09', 'September 2024', [4]],
    ]);
  });
  it('empty input gives no groups', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe('setsPerMuscle', () => {
  it('counts only four completed bench working sets', () => {
    const bench = ex({ primary_muscles: ['chest'], secondary_muscles: ['triceps', 'front_delts'] });
    const sets = [
      set({ set_type: 'warmup', completed_at: T }),
      ...Array.from({ length: 4 }, () => set({ completed_at: T })),
      set({ completed_at: null }),
    ];
    expect(setsPerMuscle([wk({}, [link(bench, sets)])])).toEqual([{ region: 'Chest', sets: 4 }]);
  });

  it('computes the worked bench press and deadlift example with non-stacking regions and sort order', () => {
    const bench = ex({
      id: 'bench',
      name: 'Bench Press',
      primary_muscles: ['chest'],
      secondary_muscles: ['triceps', 'front_delts'],
    });
    const deadlift = ex({
      id: 'deadlift',
      name: 'Deadlift',
      primary_muscles: ['lower_back'],
      secondary_muscles: ['glutes', 'hamstrings', 'upper_back'],
    });
    const workout = wk({}, [
      link(bench, [
        set({ set_type: 'warmup', completed_at: T }),
        set({ completed_at: T }),
        set({ completed_at: T }),
        set({ completed_at: T }),
        set({ completed_at: T }),
        set({ completed_at: null }),
      ]),
      link(deadlift, [set({ completed_at: T }), set({ completed_at: T })]),
    ]);

    expect(setsPerMuscle([workout])).toEqual([
      { region: 'Chest', sets: 4 },
      { region: 'Erectors', sets: 2 },
    ]);
  });

  it('counts ticked drop and failure sets, and ignores warmup and unticked sets', () => {
    const chestEx = ex({ primary_muscles: ['chest'], secondary_muscles: [] });
    const workout = wk({}, [
      link(chestEx, [
        set({ set_type: 'drop', completed_at: T }),
        set({ set_type: 'failure', completed_at: T }),
        set({ set_type: 'warmup', completed_at: T }),
        set({ set_type: 'normal', completed_at: null }),
      ]),
    ]);
    expect(setsPerMuscle([workout])).toEqual([{ region: 'Chest', sets: 2 }]);
  });

  it('deduplicates primary muscles and ignores overlapping secondary muscles', () => {
    const both = ex({
      primary_muscles: ['chest', 'chest'],
      secondary_muscles: ['chest', 'triceps', 'triceps'],
    });
    const workout = wk({}, [link(both, [set({ completed_at: T })])]);
    expect(setsPerMuscle([workout])).toEqual([{ region: 'Chest', sets: 1 }]);
  });

  it('credits distinct primary muscles in the same region once per set', () => {
    const glutes = ex({
      primary_muscles: ['glutes', 'abductors'],
      secondary_muscles: ['hamstrings'],
    });
    expect(setsPerMuscle([wk({}, [link(glutes, [set({ completed_at: T })])])])).toEqual([
      { region: 'Glutes', sets: 1 },
    ]);
  });

  it('counts adductors under Adductors', () => {
    const adduction = ex({ primary_muscles: ['adductors'], secondary_muscles: [] });
    expect(setsPerMuscle([wk({}, [link(adduction, [set({ completed_at: T }), set({ completed_at: T })])])])).toEqual([
      { region: 'Adductors', sets: 2 },
    ]);
  });

  it('credits each distinct primary region once and ignores secondary regions', () => {
    const custom = ex({
      primary_muscles: ['chest', 'upper_back', 'lower_back'],
      secondary_muscles: ['triceps'],
    });
    expect(setsPerMuscle([wk({}, [link(custom, [set({ completed_at: T })])])])).toEqual([
      { region: 'Chest', sets: 1 },
      { region: 'Traps', sets: 1 },
      { region: 'Erectors', sets: 1 },
    ]);
  });

  it('ignores full_body alone or as a secondary next to another muscle', () => {
    const fullOnly = ex({ primary_muscles: ['full_body'], secondary_muscles: [] });
    const withFullSecondary = ex({ primary_muscles: ['chest'], secondary_muscles: ['full_body'] });
    expect(setsPerMuscle([wk({}, [link(fullOnly, [set({ completed_at: T })])])])).toEqual([]);
    expect(setsPerMuscle([wk({}, [link(withFullSecondary, [set({ completed_at: T })])])])).toEqual([
      { region: 'Chest', sets: 1 },
    ]);
  });

  it('returns empty for missing, empty, unknown-only, and full_body-only primary muscles', () => {
    const unknownMuscle = ex({
      primary_muscles: ['not_a_muscle'],
      secondary_muscles: ['also_unknown', 'abs'],
    });
    const emptyPrimary = ex({ primary_muscles: [], secondary_muscles: ['abs'] });
    const missingPrimary = ex({ primary_muscles: null, secondary_muscles: ['abs'] });
    const fullBodyPrimary = ex({ primary_muscles: ['full_body'], secondary_muscles: ['abs'] });
    expect(setsPerMuscle([wk({}, [link(null, [set({ completed_at: T })])])])).toEqual([]);
    for (const exercise of [unknownMuscle, emptyPrimary, missingPrimary, fullBodyPrimary]) {
      expect(setsPerMuscle([wk({}, [link(exercise, [set({ completed_at: T })])])])).toEqual([]);
    }
    const validPlusUnknown = ex({ primary_muscles: ['not_a_muscle', 'abs'] });
    expect(setsPerMuscle([wk({}, [link(validPlusUnknown, [set({ completed_at: T })])])])).toEqual([
      { region: 'Abdominals', sets: 1 },
    ]);
  });

  it('credits Cardio 1 for a ticked cardio set', () => {
    const cardioEx = ex({
      log_type: 'distance_duration',
      primary_muscles: ['cardio'],
      secondary_muscles: [],
    });
    expect(setsPerMuscle([wk({}, [link(cardioEx, [set({ completed_at: T })])])])).toEqual([
      { region: 'Cardio', sets: 1 },
    ]);
  });

  it('does not double sets for per_side exercises', () => {
    const unilateral = ex({
      per_side: 1,
      primary_muscles: ['biceps'],
      secondary_muscles: ['forearms'],
    });
    expect(setsPerMuscle([wk({}, [link(unilateral, [set({ completed_at: T })])])])).toEqual([
      { region: 'Biceps', sets: 1 },
    ]);
  });

  it('ignores draft, active, and tombstoned workouts', () => {
    const chestEx = ex({ primary_muscles: ['chest'], secondary_muscles: [] });
    const sets = [set({ completed_at: T })];
    expect(
      setsPerMuscle([
        wk({ id: 'draft', status: 'draft' }, [link(chestEx, sets)]),
        wk({ id: 'active', status: 'active' }, [link(chestEx, sets)]),
        wk({ id: 'deleted', status: 'done', deleted_at: T }, [link(chestEx, sets)]),
      ])
    ).toEqual([]);
  });

  it('ignores tombstoned exercise links and sets', () => {
    const chest = ex({ primary_muscles: ['chest'], secondary_muscles: [] });
    const deletedLink = { ...link(chest, [set({ completed_at: T })]), deleted_at: T };
    const liveLink = link(chest, [set({ completed_at: T, deleted_at: T }), set({ completed_at: T })]);
    expect(setsPerMuscle([wk({}, [deletedLink, liveLink])])).toEqual([
      { region: 'Chest', sets: 1 },
    ]);
  });

  it('adds credits across multiple workouts', () => {
    const row = ex({
      primary_muscles: ['upper_back'],
      secondary_muscles: ['lats', 'biceps', 'lower_back'],
    });
    const w1 = wk({ id: 'w1' }, [link(row, [set({ completed_at: T }), set({ completed_at: T })])]);
    const w2 = wk({ id: 'w2' }, [link(row, [set({ completed_at: T })])]);
    expect(setsPerMuscle([w1, w2])).toEqual([{ region: 'Traps', sets: 3 }]);
  });

  it('respects Monday-to-Sunday week boundaries when caller filters workouts by date', () => {
    const range = weekRange(new Date(2025, 9, 19, 23, 59, 59));
    expect(range).toEqual({ start: '2025-10-13', end: '2025-10-19' });

    const chestEx = ex({ primary_muscles: ['chest'], secondary_muscles: [] });
    const quadEx = ex({ primary_muscles: ['quads'], secondary_muscles: [] });
    const backEx = ex({ primary_muscles: ['lats'], secondary_muscles: [] });
    const shoulderEx = ex({ primary_muscles: ['side_delts'], secondary_muscles: [] });

    const all = [
      wk({ id: 'prev-sun', date: '2025-10-12' }, [link(shoulderEx, [set({ completed_at: T })])]),
      wk({ id: 'mon', date: '2025-10-13' }, [link(backEx, [set({ completed_at: T })])]),
      wk({ id: 'sun', date: '2025-10-19' }, [link(chestEx, [set({ completed_at: T })])]),
      wk({ id: 'next-mon', date: '2025-10-20' }, [
        link(quadEx, [
          set({ completed_at: T }),
          set({ completed_at: T }),
          set({ completed_at: T }),
          set({ completed_at: T }),
        ]),
      ]),
    ];

    const sunAndNextMon = all
      .filter((w) => w.id === 'sun' || w.id === 'next-mon')
      .filter((w) => w.date >= range.start && w.date <= range.end);
    expect(setsPerMuscle(sunAndNextMon)).toEqual([{ region: 'Chest', sets: 1 }]);

    const inWeek = all.filter((w) => w.date >= range.start && w.date <= range.end);
    expect(setsPerMuscle(inWeek)).toEqual([
      { region: 'Chest', sets: 1 },
      { region: 'Lats', sets: 1 },
    ]);
  });
});

describe('pairRows', () => {
  it('pairs rows in order, leaving null for an odd last cell', () => {
    expect(pairRows([])).toEqual([]);
    expect(pairRows(['a'])).toEqual([['a', null]]);
    expect(pairRows(['a', 'b'])).toEqual([['a', 'b']]);
    expect(pairRows(['a', 'b', 'c'])).toEqual([['a', 'b'], ['c', null]]);
    const fifteen = Array.from({ length: 15 }, (_, i) => i);
    const pairs = pairRows(fifteen);
    expect(pairs).toHaveLength(8);
    expect(pairs[7]).toEqual([14, null]);
    expect(pairs.flat().filter((x) => x !== null)).toEqual(fifteen);
  });
});

describe('formatMuscleSetCount', () => {
  it('formats nonnegative integers and returns 0 for invalid values', () => {
    expect(formatMuscleSetCount(4)).toBe('4');
    expect(formatMuscleSetCount(1)).toBe('1');
    expect(formatMuscleSetCount(0)).toBe('0');
    expect(formatMuscleSetCount(NaN)).toBe('0');
    expect(formatMuscleSetCount(-1)).toBe('0');
    expect(formatMuscleSetCount(Infinity)).toBe('0');
    expect(formatMuscleSetCount(0.5)).toBe('0');
  });
});

