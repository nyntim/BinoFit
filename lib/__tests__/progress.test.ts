import {
  bucket,
  bucketFor,
  bucketSpine,
  buildDailyTotals,
  chartScale,
  enumerateDates,
  rangeBounds,
  summarize,
  type DailyTotal,
} from '@/lib/progress';
import type { FoodLogWithFood, MealSlotConfirmation } from '@/lib/types';

let seq = 0;
function log(date: string, slot: string, calories: number, amount = 1): FoodLogWithFood {
  seq += 1;
  return {
    id: `l${seq}`,
    date,
    meal_slot: slot,
    food_id: 'f',
    serving_amount: amount,
    serving_unit: 'g',
    created_at: '',
    updated_at: '',
    food_name: 'Food',
    food_brand: null,
    food_calories: calories,
    food_protein: calories / 10,
    food_carbs: calories / 20,
    food_fat: calories / 40,
    food_serving_units: '',
  } as FoodLogWithFood;
}

function conf(date: string, slot: string, confirmed: boolean): MealSlotConfirmation {
  return { id: `${date}-${slot}`, date, meal_slot: slot, confirmed, updated_at: '' };
}

function day(date: string, calories: number, eatenLogs = calories > 0 ? 1 : 0, anyLogs = eatenLogs > 0): DailyTotal {
  return { date, calories, protein: calories / 10, carbs: calories / 20, fat: calories / 40, eatenLogs, anyLogs };
}

describe('rangeBounds', () => {
  it('7d ending Feb 3 starts in January', () => {
    expect(rangeBounds('7d', '2026-02-03', null)).toEqual({ start: '2026-01-28', end: '2026-02-03', days: 7 });
  });

  it('30d reaches back across Jan 31 into the prior month', () => {
    expect(rangeBounds('30d', '2026-02-05', null).start).toBe('2026-01-07');
  });

  it('leap year Feb 29 as today', () => {
    expect(rangeBounds('7d', '2024-02-29', null)).toEqual({ start: '2024-02-23', end: '2024-02-29', days: 7 });
  });

  it('90d from Jan 1 crosses the year end', () => {
    expect(rangeBounds('90d', '2026-01-01', null).start).toBe('2025-10-04');
  });

  it('all starts at the first logged date', () => {
    expect(rangeBounds('all', '2026-10-17', '2026-03-03')).toEqual({
      start: '2026-03-03',
      end: '2026-10-17',
      days: 229,
    });
  });

  it('all falls back to today with no logged date', () => {
    expect(rangeBounds('all', '2026-10-17', null)).toEqual({ start: '2026-10-17', end: '2026-10-17', days: 1 });
  });

  it('all clamps a future first date to today', () => {
    expect(rangeBounds('all', '2026-10-17', '2026-12-01').start).toBe('2026-10-17');
  });

  it('days always equals the enumerated length', () => {
    const cases: [Parameters<typeof rangeBounds>[0], string, string | null][] = [
      ['7d', '2026-01-03', null],
      ['30d', '2024-03-05', null],
      ['90d', '2026-03-30', null],
      ['all', '2026-10-17', '2025-02-27'],
    ];
    for (const [range, today, first] of cases) {
      const b = rangeBounds(range, today, first);
      expect(enumerateDates(b.start, b.end)).toHaveLength(b.days);
    }
  });
});

describe('enumerateDates', () => {
  it('is inclusive of both ends', () => {
    expect(enumerateDates('2026-10-15', '2026-10-17')).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
  });

  it('a single day returns that day', () => {
    expect(enumerateDates('2026-10-17', '2026-10-17')).toEqual(['2026-10-17']);
  });

  it('has no gaps or repeats across DST changes', () => {
    for (const [s, e, n] of [
      ['2026-03-06', '2026-03-10', 5],
      ['2026-10-30', '2026-11-03', 5],
    ] as const) {
      const out = enumerateDates(s, e);
      expect(out).toHaveLength(n);
      expect(new Set(out).size).toBe(n);
      expect(out[0]).toBe(s);
      expect(out[n - 1]).toBe(e);
    }
  });
});

describe('buildDailyTotals', () => {
  it('includes every date, empty days too', () => {
    const out = buildDailyTotals([], [], '2026-10-15', '2026-10-17');
    expect(out.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(out.every((d) => d.calories === 0 && d.eatenLogs === 0 && !d.anyLogs)).toBe(true);
  });

  it('sums serving-scaled eaten logs per date', () => {
    const out = buildDailyTotals(
      [log('2026-10-16', 'lunch', 200, 1.5), log('2026-10-16', 'dinner', 400)],
      [],
      '2026-10-16',
      '2026-10-16'
    );
    expect(out[0]).toMatchObject({ calories: 700, protein: 70, eatenLogs: 2, anyLogs: true });
  });

  it('a slot with no confirmation row counts as eaten', () => {
    const out = buildDailyTotals([log('2026-10-16', 'lunch', 300)], [], '2026-10-16', '2026-10-16');
    expect(out[0].calories).toBe(300);
  });

  it('planned slots are left out of the totals', () => {
    const out = buildDailyTotals(
      [log('2026-10-16', 'lunch', 300), log('2026-10-16', 'dinner', 500)],
      [conf('2026-10-16', 'dinner', false)],
      '2026-10-16',
      '2026-10-16'
    );
    expect(out[0]).toMatchObject({ calories: 300, eatenLogs: 1 });
  });

  it('a planned-only day has anyLogs true and no eaten logs', () => {
    const out = buildDailyTotals(
      [log('2026-10-16', 'dinner', 500)],
      [conf('2026-10-16', 'dinner', false)],
      '2026-10-16',
      '2026-10-16'
    );
    expect(out[0]).toMatchObject({ calories: 0, eatenLogs: 0, anyLogs: true });
  });

  it('confirmations only apply to their own date', () => {
    const out = buildDailyTotals(
      [log('2026-10-15', 'dinner', 500), log('2026-10-16', 'dinner', 600)],
      [conf('2026-10-15', 'dinner', false)],
      '2026-10-15',
      '2026-10-16'
    );
    expect(out[0].calories).toBe(0);
    expect(out[1].calories).toBe(600);
  });

  it('logs in a deleted meal id still count', () => {
    const out = buildDailyTotals([log('2026-10-16', 'meal-removed-123', 250)], [], '2026-10-16', '2026-10-16');
    expect(out[0]).toMatchObject({ calories: 250, eatenLogs: 1 });
  });

  it('ignores logs outside the range', () => {
    const out = buildDailyTotals([log('2026-10-01', 'lunch', 250)], [], '2026-10-16', '2026-10-17');
    expect(out.every((d) => d.calories === 0)).toBe(true);
  });
});

describe('summarize', () => {
  const today = '2026-10-17';

  it('averages past days with eaten logs and leaves today out', () => {
    const s = summarize([day('2026-10-15', 2000), day('2026-10-16', 1000), day(today, 3000)], today);
    expect(s.averagedDays).toBe(2);
    expect(s.avg?.calories).toBe(1500);
    expect(s.avg?.protein).toBe(150);
  });

  it('today counts as a logged day', () => {
    const s = summarize([day('2026-10-16', 1000), day(today, 3000)], today);
    expect(s.loggedDays).toBe(2);
    expect(s.totalDays).toBe(2);
  });

  it('empty days are not averaged', () => {
    const s = summarize([day('2026-10-14', 0), day('2026-10-15', 2000), day('2026-10-16', 0)], today);
    expect(s.averagedDays).toBe(1);
    expect(s.avg?.calories).toBe(2000);
  });

  it('avg is null when no past day has eaten logs', () => {
    const s = summarize([day('2026-10-16', 0), day(today, 500)], today);
    expect(s.avg).toBeNull();
    expect(s.averagedDays).toBe(0);
  });

  it('a planned-only day is logged but not averaged', () => {
    const s = summarize([day('2026-10-16', 0, 0, true), day('2026-10-15', 1800)], today);
    expect(s.loggedDays).toBe(2);
    expect(s.averagedDays).toBe(1);
  });

  it('future days are not counted as logged', () => {
    const s = summarize([day('2026-10-16', 1000), day('2026-10-18', 0, 0, true)], today);
    expect(s.loggedDays).toBe(1);
  });
});

describe('bucket', () => {
  const days = (start: string, end: string, cals: Record<string, number> = {}) =>
    enumerateDates(start, end).map((d) => day(d, cals[d] ?? 0));

  it('day buckets mirror the days', () => {
    const b = bucket(days('2026-10-15', '2026-10-17', { '2026-10-16': 1900 }), 'day');
    expect(b.map((x) => [x.key, x.calories, x.hasData])).toEqual([
      ['2026-10-15', 0, false],
      ['2026-10-16', 1900, true],
      ['2026-10-17', 0, false],
    ]);
  });

  it('weeks start on Monday, so a Sunday belongs to the prior week', () => {
    // Oct 11 2026 is a Sunday, Oct 12 a Monday.
    const b = bucket(days('2026-10-10', '2026-10-13', { '2026-10-11': 1000, '2026-10-12': 2000 }), 'week');
    expect(b.map((x) => x.key)).toEqual(['2026-10-05', '2026-10-12']);
    expect(b[0]).toMatchObject({ start: '2026-10-10', end: '2026-10-11', calories: 1000 });
    expect(b[1]).toMatchObject({ start: '2026-10-12', end: '2026-10-13', calories: 2000 });
  });

  it('weekStartsOn 0 puts Sunday in the new week', () => {
    const b = bucket(days('2026-10-10', '2026-10-12'), 'week', 0);
    expect(b.map((x) => x.key)).toEqual(['2026-10-04', '2026-10-11']);
  });

  it('a partial first week still averages its own days', () => {
    const b = bucket(days('2026-10-14', '2026-10-19', { '2026-10-14': 1000, '2026-10-15': 3000 }), 'week');
    expect(b).toHaveLength(2);
    expect(b[0].calories).toBe(2000);
    expect(b[0].start).toBe('2026-10-14');
    expect(b[0].key).toBe('2026-10-12');
  });

  it('week average ignores empty days and includes today', () => {
    const b = bucket(days('2026-10-12', '2026-10-17', { '2026-10-12': 1800, '2026-10-14': 2200, '2026-10-17': 2000 }), 'week');
    expect(b).toHaveLength(1);
    expect(b[0].calories).toBe(2000);
  });

  it('a bucket with no eaten days has no data', () => {
    const b = bucket(days('2026-10-12', '2026-10-14'), 'week');
    expect(b[0]).toMatchObject({ calories: 0, hasData: false });
  });

  it('month buckets split at month boundaries', () => {
    const b = bucket(days('2026-09-29', '2026-10-02', { '2026-09-30': 1000, '2026-10-01': 2000 }), 'month');
    expect(b.map((x) => [x.key, x.calories])).toEqual([
      ['2026-09-01', 1000],
      ['2026-10-01', 2000],
    ]);
  });

  it('only the last bucket is current', () => {
    const b = bucket(days('2026-10-01', '2026-10-20'), 'week');
    expect(b.map((x) => x.isCurrent)).toEqual(b.map((_, i) => i === b.length - 1));
  });
});

describe('bucketSpine', () => {
  const compareWithBucket = (start: string, end: string, unit: 'day' | 'week' | 'month', weekStartsOn: 0 | 1 = 1) => {
    const dateList = enumerateDates(start, end);
    const spine = bucketSpine(dateList, unit, weekStartsOn);
    const nutrition = bucket(
      dateList.map((d) => day(d, 0)),
      unit,
      weekStartsOn
    );
    expect(
      spine.map((s) => ({
        key: s.key,
        start: s.start,
        end: s.end,
        unit: s.unit,
        isCurrent: s.isCurrent,
      }))
    ).toEqual(
      nutrition.map((b) => ({
        key: b.key,
        start: b.start,
        end: b.end,
        unit: b.unit,
        isCurrent: b.isCurrent,
      }))
    );
    return spine;
  };

  it('matches bucket keys, start, end and isCurrent for days', () => {
    const spine = compareWithBucket('2026-10-15', '2026-10-17', 'day');
    expect(spine.map((s) => s.dates)).toEqual([['2026-10-15'], ['2026-10-16'], ['2026-10-17']]);
  });

  it('matches bucket for Monday weeks with Sunday in the prior week', () => {
    const spine = compareWithBucket('2026-10-10', '2026-10-13', 'week');
    expect(spine.map((s) => [s.key, s.start, s.end])).toEqual([
      ['2026-10-05', '2026-10-10', '2026-10-11'],
      ['2026-10-12', '2026-10-12', '2026-10-13'],
    ]);
  });

  it('matches bucket for a partial first week', () => {
    const spine = compareWithBucket('2026-10-14', '2026-10-19', 'week');
    expect(spine).toHaveLength(2);
    expect(spine[0]).toMatchObject({ key: '2026-10-12', start: '2026-10-14', end: '2026-10-18', isCurrent: false });
    expect(spine[1]).toMatchObject({ key: '2026-10-19', start: '2026-10-19', end: '2026-10-19', isCurrent: true });
  });

  it('matches bucket for months', () => {
    const spine = compareWithBucket('2026-09-29', '2026-10-02', 'month');
    expect(spine.map((s) => [s.key, s.start, s.end, s.isCurrent])).toEqual([
      ['2026-09-01', '2026-09-29', '2026-09-30', false],
      ['2026-10-01', '2026-10-01', '2026-10-02', true],
    ]);
  });
});

describe('bucketFor', () => {
  it('short ranges use days, 90d uses weeks', () => {
    expect(bucketFor('7d', 7)).toBe('day');
    expect(bucketFor('30d', 30)).toBe('day');
    expect(bucketFor('90d', 90)).toBe('week');
  });

  it('all switches from weeks to months after 182 days', () => {
    expect(bucketFor('all', 182)).toBe('week');
    expect(bucketFor('all', 183)).toBe('month');
    expect(bucketFor('all', 1)).toBe('week');
  });
});

describe('chartScale', () => {
  it('leaves headroom above a 2100 goal', () => {
    expect(chartScale([1800, 1900], 2100)).toBe(2400);
  });

  it('grows past the goal when a value is taller', () => {
    expect(chartScale([3000], 2100)).toBe(3500);
  });

  it('uses values alone with no goal', () => {
    expect(chartScale([1750], null)).toBe(2000);
  });

  it('never goes below 100', () => {
    expect(chartScale([0, 0], null)).toBe(100);
    expect(chartScale([], null)).toBe(100);
  });
});
