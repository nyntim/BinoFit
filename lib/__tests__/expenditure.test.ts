import {
  countWeighInsInWindow,
  estimateExpenditure,
  expenditureWindow,
  formatExpenditure,
  type TrendPoint,
} from '@/lib/expenditure';
import { buildDailyTotals, enumerateDates, type DailyTotal } from '@/lib/progress';
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

function day(date: string, calories: number, eatenLogs = 1, anyLogs = eatenLogs > 0): DailyTotal {
  return {
    date,
    calories,
    protein: calories / 10,
    carbs: calories / 20,
    fat: calories / 40,
    eatenLogs,
    anyLogs,
  };
}

function makeLoggedDays(start: string, count: number, calories: number): DailyTotal[] {
  const dates = enumerateDates(start, '2026-10-16').slice(0, count);
  return dates.map((d) => day(d, calories, 1, true));
}

describe('expenditureWindow', () => {
  it('returns 21 days ending yesterday for 2026-10-17', () => {
    expect(expenditureWindow('2026-10-17')).toEqual({
      start: '2026-09-26',
      end: '2026-10-16',
      days: 21,
    });
  });

  it('starts 2026-02-08 and ends 2026-02-28 for 2026-03-01', () => {
    expect(expenditureWindow('2026-03-01')).toEqual({
      start: '2026-02-08',
      end: '2026-02-28',
      days: 21,
    });
  });

  it('crosses into the prior year for 2026-01-15', () => {
    expect(expenditureWindow('2026-01-15')).toEqual({
      start: '2025-12-25',
      end: '2026-01-14',
      days: 21,
    });
  });
});

describe('estimateExpenditure', () => {
  const today = '2026-10-17';
  const start = '2026-09-26';
  const end = '2026-10-16';
  const flatTrend: TrendPoint[] = [
    { date: start, kg: 75 },
    { date: end, kg: 75 },
  ];

  it('returns average calories when trend is flat', () => {
    const daily = makeLoggedDays(start, 14, 2000);
    expect(estimateExpenditure(daily, flatTrend, 4, today)).toEqual({
      kcal: 2000,
      windowDays: 21,
      loggedDays: 14,
    });
  });

  it('adjusts for weight gain and loss across 21 days', () => {
    const at2500 = makeLoggedDays(start, 14, 2500);
    const at2000 = makeLoggedDays(start, 14, 2000);

    expect(
      estimateExpenditure(
        at2500,
        [
          { date: start, kg: 75 },
          { date: end, kg: 75.21 },
        ],
        4,
        today
      )?.kcal
    ).toBe(2423);

    expect(
      estimateExpenditure(
        at2000,
        [
          { date: start, kg: 75 },
          { date: end, kg: 74.79 },
        ],
        4,
        today
      )?.kcal
    ).toBe(2077);

    expect(
      estimateExpenditure(
        at2000,
        [
          { date: start, kg: 75 },
          { date: end, kg: 74 },
        ],
        4,
        today
      )?.kcal
    ).toBe(2367);

    expect(
      estimateExpenditure(
        at2000,
        [
          { date: start, kg: 75 },
          { date: end, kg: 76 },
        ],
        4,
        today
      )?.kcal
    ).toBe(1633);
  });

  it('averages uneven intake across logged days', () => {
    const dates = enumerateDates(start, end);
    const daily = [
      ...dates.slice(0, 10).map((d) => day(d, 2000)),
      ...dates.slice(10, 14).map((d) => day(d, 3000)),
    ];
    expect(estimateExpenditure(daily, flatTrend, 4, today)?.kcal).toBe(2286);
  });

  it('returns null when logged days < 14 or weigh-ins < 4', () => {
    const daily13 = makeLoggedDays(start, 13, 2000);
    const daily14 = makeLoggedDays(start, 14, 2000);
    expect(estimateExpenditure(daily13, flatTrend, 4, today)).toBeNull();
    expect(estimateExpenditure(daily14, flatTrend, 3, today)).toBeNull();
  });

  it('ignores unlogged gap days even if calories are non-zero and averages non-contiguous eaten days by count', () => {
    const allDates = enumerateDates(start, end);
    const eatenDates = allDates.filter((_, idx) => idx % 3 !== 2); // 14 non-contiguous days
    const gapDates = allDates.filter((_, idx) => idx % 3 === 2); // 7 gap days
    const daily = [
      ...eatenDates.map((d) => day(d, 2000, 1, true)),
      ...gapDates.map((d) => day(d, 9000, 0, false)),
    ];
    expect(estimateExpenditure(daily, flatTrend, 4, today)).toEqual({
      kcal: 2000,
      windowDays: 21,
      loggedDays: 14,
    });
  });

  it('excludes planned slots via buildDailyTotals and ignores direct days with eatenLogs 0', () => {
    const dates = enumerateDates(start, end).slice(0, 14);
    const logs: FoodLogWithFood[] = [];
    const confirmations: MealSlotConfirmation[] = [];
    for (const d of dates) {
      logs.push(log(d, 'lunch', 2000), log(d, 'dinner', 800));
      confirmations.push(conf(d, 'dinner', false));
    }
    const built = buildDailyTotals(logs, confirmations, start, end);
    built.push(day('2026-10-15', 5000, 0, true));
    expect(estimateExpenditure(built, flatTrend, 4, today)?.kcal).toBe(2000);
  });

  it('ignores today in daily totals and trend points, and counts a 0 kcal eaten day as logged', () => {
    const dates = enumerateDates(start, end).slice(0, 14);
    const daily = [
      ...dates.slice(0, 13).map((d) => day(d, 2000, 1, true)),
      day(dates[13], 0, 1, true),
      day(today, 9000, 3, true),
    ];
    const trend: TrendPoint[] = [
      { date: start, kg: 75 },
      { date: end, kg: 75 },
      { date: today, kg: 90 },
    ];
    const res = estimateExpenditure(daily, trend, 4, today);
    expect(res).toEqual({
      kcal: Math.round((13 * 2000) / 14),
      windowDays: 21,
      loggedDays: 14,
    });
  });

  it('carries forward a point before start, requires coverage at start, and handles unsorted or duplicate-date points without mutating input', () => {
    const daily = makeLoggedDays(start, 14, 2000);

    // Point before start carries forward to start
    expect(
      estimateExpenditure(
        daily,
        [
          { date: '2026-09-20', kg: 75 },
          { date: '2026-10-10', kg: 74 },
        ],
        4,
        today
      )?.kcal
    ).toBe(2367);

    // First point after start -> null
    expect(
      estimateExpenditure(
        daily,
        [
          { date: '2026-09-27', kg: 75 },
          { date: end, kg: 75 },
        ],
        4,
        today
      )
    ).toBeNull();

    // Point on start is enough
    expect(estimateExpenditure(daily, [{ date: start, kg: 75 }], 4, today)?.kcal).toBe(2000);

    // Unsorted and same-day duplicate (later input wins)
    const unsortedWithDup: TrendPoint[] = [
      { date: end, kg: 74 },
      { date: start, kg: 80 },
      { date: start, kg: 75 },
    ];
    const copyBefore = [...unsortedWithDup];
    expect(estimateExpenditure(daily, unsortedWithDup, 4, today)?.kcal).toBe(2367);
    expect(unsortedWithDup).toEqual(copyBefore);
  });

  it('returns null on non-finite kg and does not clamp negative expenditure', () => {
    const daily = makeLoggedDays(start, 14, 500);
    expect(
      estimateExpenditure(
        daily,
        [
          { date: start, kg: Number.NaN },
          { date: end, kg: 75 },
        ],
        4,
        today
      )
    ).toBeNull();
    expect(
      estimateExpenditure(
        daily,
        [
          { date: start, kg: 75 },
          { date: end, kg: Number.POSITIVE_INFINITY },
        ],
        4,
        today
      )
    ).toBeNull();

    // Large weight gain producing negative expenditure is returned unclamped
    const neg = estimateExpenditure(
      daily,
      [
        { date: start, kg: 75 },
        { date: end, kg: 78 },
      ],
      4,
      today
    );
    expect(neg?.kcal).toBe(-600);
  });
});

describe('countWeighInsInWindow', () => {
  it('counts inclusive unique dates and rejects dates outside the window including today', () => {
    const start = '2026-09-26';
    const end = '2026-10-16';
    const entries = [
      { date: '2026-09-25' }, // before start
      { date: '2026-09-26' }, // on start
      { date: '2026-10-01' },
      { date: '2026-10-01' }, // duplicate
      { date: '2026-10-16' }, // on end
      { date: '2026-10-17' }, // today (after end)
    ];
    expect(countWeighInsInWindow(entries, start, end)).toBe(3);
  });
});

describe('formatExpenditure', () => {
  it('formats positive, zero, and negative values with U+2212 minus', () => {
    expect(formatExpenditure(2450)).toBe('2,450 kcal/day');
    expect(formatExpenditure(0)).toBe('0 kcal/day');
    expect(formatExpenditure(-1200)).toBe('−1,200 kcal/day');
  });
});
