import {
  formatWeeklyRate,
  trendChange,
  trendWeights,
  weeklyRate,
  weightChartDomain,
  weightRangeBounds,
  type TrendInput,
  type TrendPoint,
} from '@/lib/weight-trend';
import { formatWeightChange } from '@/lib/weight';

const entry = (
  id: string,
  date: string,
  weight_kg: number,
  opts: Partial<Omit<TrendInput, 'id' | 'date' | 'weight_kg'>> = {}
): TrendInput => ({
  id,
  date,
  weight_kg,
  measured_at: opts.measured_at ?? `${date}T12:00:00.000Z`,
  created_at: opts.created_at ?? `${date}T12:00:00.000Z`,
  source: opts.source,
  deleted_at: opts.deleted_at ?? null,
});

describe('trendWeights', () => {
  it('computes the daily step worked example', () => {
    const out = trendWeights([
      entry('a', '2026-06-01', 80),
      entry('b', '2026-06-02', 81),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].trend_kg).toBe(80);
    expect(out[1].trend_kg).toBeCloseTo(80.068937, 6);
  });

  it('computes the 10-day gap worked example', () => {
    const out = trendWeights([
      entry('a', '2026-06-01', 80),
      entry('b', '2026-06-11', 78),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].trend_kg).toBe(80);
    expect(out[1].trend_kg).toBeCloseTo(78.979083, 6);
  });

  it('returns trend_kg === weight_kg and length 1 for one entry', () => {
    const out = trendWeights([entry('a', '2026-06-01', 82.4)]);
    expect(out).toEqual([
      {
        date: '2026-06-01',
        weight_kg: 82.4,
        trend_kg: 82.4,
        source: 'manual',
      },
    ]);
  });

  it('returns [] for empty input and skips non-finite weight_kg rows', () => {
    expect(trendWeights([])).toEqual([]);
    expect(trendWeights([entry('a', '2026-06-01', NaN)])).toEqual([]);
    const out = trendWeights([
      entry('a', '2026-06-01', 80),
      entry('bad1', '2026-06-02', NaN),
      entry('bad2', '2026-06-03', Infinity),
      entry('b', '2026-06-02', 81),
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].trend_kg).toBeCloseTo(80.068937, 6);
  });

  it('collapses two rows on one date by measured_at, then created_at, then id', () => {
    const byMeasured = trendWeights([
      entry('am', '2026-06-01', 85, { measured_at: '2026-06-01T08:00:00.000Z' }),
      entry('pm', '2026-06-01', 80, { measured_at: '2026-06-01T20:00:00.000Z' }),
      entry('d2', '2026-06-02', 81),
    ]);
    expect(byMeasured).toHaveLength(2);
    expect(byMeasured[0].weight_kg).toBe(80);
    expect(byMeasured[1].trend_kg).toBeCloseTo(80.068937, 6);

    const byCreated = trendWeights([
      entry('c1', '2026-06-01', 85, { measured_at: 'M', created_at: '2026-06-01T01:00:00.000Z' }),
      entry('c2', '2026-06-01', 80, { measured_at: 'M', created_at: '2026-06-01T02:00:00.000Z' }),
    ]);
    expect(byCreated[0].weight_kg).toBe(80);

    const byId = trendWeights([
      entry('id-a', '2026-06-01', 85, { measured_at: 'M', created_at: 'C' }),
      entry('id-b', '2026-06-01', 80, { measured_at: 'M', created_at: 'C' }),
    ]);
    expect(byId[0].weight_kg).toBe(80);
  });

  it('ignores tombstones even when the tombstone has a later measured_at on the same day', () => {
    const out = trendWeights([
      entry('live', '2026-06-01', 80, { measured_at: '2026-06-01T08:00:00.000Z' }),
      entry('dead-same', '2026-06-01', 70, {
        measured_at: '2026-06-01T22:00:00.000Z',
        deleted_at: '2026-06-01T23:00:00.000Z',
      }),
      entry('dead-other', '2026-06-02', 65, { deleted_at: '2026-06-02T13:00:00.000Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].weight_kg).toBe(80);
  });

  it('smooths in date order oldest first even when created_at is out of order', () => {
    const out = trendWeights([
      entry('late', '2026-06-11', 78, { created_at: '2026-06-01T01:00:00.000Z' }),
      entry('early', '2026-06-01', 80, { created_at: '2026-06-15T01:00:00.000Z' }),
      entry('mid', '2026-06-02', 81, { created_at: '2026-06-10T01:00:00.000Z' }),
    ]);
    expect(out.map((p) => p.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-11']);
    expect(out[0].trend_kg).toBe(80);
    expect(out[1].trend_kg).toBeCloseTo(80.068937, 6);
  });

  it('copies source healthkit and defaults missing source to manual', () => {
    const out = trendWeights([
      entry('a', '2026-06-01', 80),
      entry('b', '2026-06-02', 81, { source: 'healthkit' }),
    ]);
    expect(out[0].source).toBe('manual');
    expect(out[1].source).toBe('healthkit');
  });
});

describe('weeklyRate', () => {
  it('gates on 4 weigh-ins and at least a 10-day span', () => {
    const span10 = trendWeights([
      entry('1', '2026-06-01', 80),
      entry('2', '2026-06-04', 79.8),
      entry('3', '2026-06-08', 79.5),
      entry('4', '2026-06-11', 79.2),
    ]);
    const rate = weeklyRate(span10, '2026-06-11');
    expect(rate).not.toBeNull();
    expect(Number.isFinite(rate)).toBe(true);

    const span9 = trendWeights([
      entry('1', '2026-06-01', 80),
      entry('2', '2026-06-04', 79.8),
      entry('3', '2026-06-07', 79.5),
      entry('4', '2026-06-10', 79.2),
    ]);
    expect(weeklyRate(span9, '2026-06-10')).toBeNull();

    const threeOver30 = trendWeights([
      entry('1', '2026-06-01', 80),
      entry('2', '2026-06-15', 79),
      entry('3', '2026-07-01', 78),
    ]);
    expect(weeklyRate(threeOver30, '2026-07-01')).toBeNull();
  });

  it('returns 0 for a constant 80 kg series across a qualifying span', () => {
    const constant = trendWeights([
      entry('1', '2026-06-01', 80),
      entry('2', '2026-06-05', 80),
      entry('3', '2026-06-09', 80),
      entry('4', '2026-06-12', 80),
    ]);
    expect(weeklyRate(constant, '2026-06-12')).toBe(0);
  });

  it('ignores points dated after today for both the count and end', () => {
    const series = trendWeights([
      entry('1', '2026-06-01', 80),
      entry('2', '2026-06-05', 79.5),
      entry('3', '2026-06-11', 79),
      entry('4', '2026-06-15', 78.5),
    ]);
    // Only 3 points on or before 2026-06-11
    expect(weeklyRate(series, '2026-06-11')).toBeNull();

    const five = trendWeights([
      entry('1', '2026-06-01', 80),
      entry('2', '2026-06-04', 79.8),
      entry('3', '2026-06-08', 79.5),
      entry('4', '2026-06-11', 79.2),
      entry('5', '2026-06-20', 75),
    ]);
    expect(weeklyRate(five, '2026-06-11')).toBeCloseTo(
      weeklyRate(five.slice(0, 4), '2026-06-11')!,
      10
    );
  });

  it('uses latest point on or before end - 14 days and slopes trend_kg, falling back to earliest when inside 14 days', () => {
    const longSeries = trendWeights([
      entry('1', '2026-06-01', 82),
      entry('2', '2026-06-05', 81),
      entry('3', '2026-06-10', 80),
      entry('4', '2026-06-15', 79),
      entry('5', '2026-06-21', 78),
    ]);
    // end is 2026-06-21; end - 14 days is 2026-06-07; latest <= 2026-06-07 is 2026-06-05 (index 1, 16 days before end)
    const expectedLong = ((longSeries[4].trend_kg - longSeries[1].trend_kg) / 16) * 7;
    expect(weeklyRate(longSeries, '2026-06-21')).toBeCloseTo(expectedLong, 10);

    const shortSeries = trendWeights([
      entry('1', '2026-06-01', 80),
      entry('2', '2026-06-04', 79.5),
      entry('3', '2026-06-08', 79),
      entry('4', '2026-06-11', 78.5),
    ]);
    // All points inside 14 days -> start is earliest (index 0, 10 days before end)
    const expectedShort = ((shortSeries[3].trend_kg - shortSeries[0].trend_kg) / 10) * 7;
    expect(weeklyRate(shortSeries, '2026-06-11')).toBeCloseTo(expectedShort, 10);
  });

  it('returns kg/week without display-unit conversion', () => {
    const series = trendWeights([
      entry('1', '2026-06-01', 80),
      entry('2', '2026-06-05', 79),
      entry('3', '2026-06-10', 78),
      entry('4', '2026-06-15', 77),
    ]);
    const rate = weeklyRate(series, '2026-06-15')!;
    const expectedKgPerWeek = ((series[3].trend_kg - series[0].trend_kg) / 14) * 7;
    expect(rate).toBeCloseTo(expectedKgPerWeek, 10);
  });
});

describe('formatWeeklyRate', () => {
  it('formats a lb loss with U+2212 minus', () => {
    expect(formatWeeklyRate(-0.3 * 0.45359237, 'lb')).toBe('−0.3 lb / week');
  });

  it('formats a kg gain with + and / week', () => {
    expect(formatWeeklyRate(0.2, 'kg')).toBe('+0.2 kg / week');
  });

  it('formats a diff that rounds to 0 as 0 kg / week', () => {
    expect(formatWeeklyRate(0.001, 'kg')).toBe('0 kg / week');
    expect(formatWeeklyRate(-0.001, 'kg')).toBe('0 kg / week');
  });
});

describe('weightChartDomain', () => {
  it('centers a flat series with width 0.5, keeps wider spans, and returns 0..1 for empty', () => {
    expect(weightChartDomain([80, 80])).toEqual({ min: 79.75, max: 80.25 });
    expect(weightChartDomain([70, 80])).toEqual({ min: 70, max: 80 });
    expect(weightChartDomain([])).toEqual({ min: 0, max: 1 });
  });
});

describe('weightRangeBounds', () => {
  it('computes rolling bounds for 7d and earliest/today bounds for all', () => {
    expect(weightRangeBounds('7d', '2026-03-01', '2026-01-02')).toEqual({
      start: '2026-02-23',
      end: '2026-03-01',
    });
    expect(weightRangeBounds('all', '2026-03-01', '2026-01-02')).toEqual({
      start: '2026-01-02',
      end: '2026-03-01',
    });
    expect(weightRangeBounds('all', '2026-03-01', null)).toEqual({
      start: '2026-03-01',
      end: '2026-03-01',
    });
    expect(weightRangeBounds('all', '2026-03-01', '2026-03-01')).toEqual({
      start: '2026-03-01',
      end: '2026-03-01',
    });
  });
});

describe('trendChange', () => {
  const pt = (date: string, trend_kg: number, weight_kg = trend_kg + 5): TrendPoint => ({
    date,
    weight_kg,
    trend_kg,
    source: 'manual',
  });

  it('is null with 0 or 1 in-range points', () => {
    expect(trendChange([], '2026-10-01', '2026-10-31')).toBeNull();
    expect(trendChange([pt('2026-10-05', 80)], '2026-10-01', '2026-10-31')).toBeNull();
    expect(trendChange([pt('2026-09-05', 80), pt('2026-10-05', 79)], '2026-10-01', '2026-10-31')).toBeNull();
  });

  it('uses trend_kg, not weight_kg', () => {
    const r = trendChange([pt('2026-10-01', 80, 90), pt('2026-10-08', 79, 70)], '2026-10-01', '2026-10-31');
    expect(r?.changeKg).toBeCloseTo(-1);
  });

  it('ignores points outside the range', () => {
    const r = trendChange(
      [pt('2026-09-01', 90), pt('2026-10-03', 80), pt('2026-10-10', 79), pt('2026-11-20', 60)],
      '2026-10-01',
      '2026-10-31'
    );
    expect(r?.changeKg).toBeCloseTo(-1);
  });

  it('days is the span between the first and last in-range points', () => {
    const r = trendChange([pt('2026-10-03', 80), pt('2026-10-10', 79)], '2026-09-01', '2026-10-31');
    expect(r?.days).toBe(7);
  });

  it('formats through formatWeightChange with a minus sign and a zero case', () => {
    const down = trendChange([pt('2026-10-03', 80), pt('2026-10-10', 79)], '2026-10-01', '2026-10-31')!;
    expect(formatWeightChange(80 + down.changeKg, 80, 'lb')).toBe('−2.2 lb');
    const flat = trendChange([pt('2026-10-03', 80), pt('2026-10-10', 80.001)], '2026-10-01', '2026-10-31')!;
    expect(formatWeightChange(80 + flat.changeKg, 80, 'lb')).toBe('0 lb');
  });
});
