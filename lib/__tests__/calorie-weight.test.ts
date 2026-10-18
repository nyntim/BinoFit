import {
  alignTrendToBuckets,
  formatWeeklyRate,
  trendSegments,
  weightDomain,
  weightY,
} from '@/lib/calorie-weight';
import { trendWeights } from '@/lib/weight-trend';

describe('alignTrendToBuckets', () => {
  it('aligns day buckets: point on day wins, missing day carries prior point, before first point is null', () => {
    const trend = [
      { date: '2026-06-02', weight_kg: 80 },
      { date: '2026-06-04', weight_kg: 79.4 },
    ];
    const buckets = [
      { end: '2026-06-01' },
      { end: '2026-06-02' },
      { end: '2026-06-03' },
      { end: '2026-06-04' },
      { end: '2026-06-05' },
    ];
    expect(alignTrendToBuckets(trend, buckets)).toEqual([null, 80, 80, 79.4, 79.4]);
  });

  it('uses trend_kg when present on TrendPoint from trendWeights', () => {
    const trend = trendWeights([
      {
        id: '1',
        date: '2026-06-01',
        weight_kg: 80,
        measured_at: '2026-06-01T08:00:00.000Z',
        created_at: '2026-06-01T08:00:00.000Z',
      },
      {
        id: '2',
        date: '2026-06-02',
        weight_kg: 81,
        measured_at: '2026-06-02T08:00:00.000Z',
        created_at: '2026-06-02T08:00:00.000Z',
      },
    ]);
    const aligned = alignTrendToBuckets(trend, [{ end: '2026-06-01' }, { end: '2026-06-02' }]);
    expect(aligned[0]).toBe(80);
    expect(aligned[1]).toBeCloseTo(trend[1].trend_kg, 6);
  });

  it('samples week buckets at end (last in-range day), excludes points after end, and handles partial first week', () => {
    const trend = [
      { date: '2026-06-02', weight_kg: 81 }, // Tuesday inside partial first week ending 2026-06-07
      { date: '2026-06-06', weight_kg: 80.5 }, // Saturday inside first week
      { date: '2026-06-08', weight_kg: 80.2 }, // Monday of second week (day after first week's end)
      { date: '2026-06-12', weight_kg: 79.8 }, // Friday inside partial current week ending 2026-06-12
      { date: '2026-06-13', weight_kg: 79.1 }, // Saturday after second week's clipped end
    ];
    // Partial first week clipped to 2026-06-03..2026-06-07, second week clipped to 2026-06-08..2026-06-12
    const buckets = [{ end: '2026-06-07' }, { end: '2026-06-12' }];
    expect(alignTrendToBuckets(trend, buckets)).toEqual([80.5, 79.8]);

    // If the partial first week ends before 2026-06-06, only the 2026-06-02 point is included
    expect(alignTrendToBuckets(trend, [{ end: '2026-06-04' }])).toEqual([81]);
  });

  it('samples month buckets at end (today for current month), not the first of the month', () => {
    const trend = [
      { date: '2026-05-01', weight_kg: 82 },
      { date: '2026-05-28', weight_kg: 81.2 },
      { date: '2026-06-01', weight_kg: 81.0 },
      { date: '2026-06-15', weight_kg: 80.4 },
      { date: '2026-06-20', weight_kg: 80.1 },
    ];
    const buckets = [
      { end: '2026-05-31' }, // full May
      { end: '2026-06-17' }, // current month ending today (June 17)
    ];
    expect(alignTrendToBuckets(trend, buckets)).toEqual([81.2, 80.4]);
  });

  it('sorts unsorted points and when two points share a date the later one in ascending order wins', () => {
    const trend = [
      { date: '2026-06-05', weight_kg: 78 },
      { date: '2026-06-01', weight_kg: 80 },
      { date: '2026-06-01', weight_kg: 79.5 },
      { date: '2026-06-03', weight_kg: NaN },
    ];
    const buckets = [{ end: '2026-06-01' }, { end: '2026-06-04' }, { end: '2026-06-05' }];
    expect(alignTrendToBuckets(trend, buckets)).toEqual([79.5, 79.5, 78]);
  });

  it('returns all nulls for an empty trend and carries a pre-range point into every later bucket', () => {
    const buckets = [{ end: '2026-06-10' }, { end: '2026-06-11' }, { end: '2026-06-12' }];
    expect(alignTrendToBuckets([], buckets)).toEqual([null, null, null]);
    expect(alignTrendToBuckets([{ date: '2026-05-01', weight_kg: 77.3 }], buckets)).toEqual([
      77.3,
      77.3,
      77.3,
    ]);
  });
});

describe('trendSegments', () => {
  it('splits runs on null, does not connect a leading null, and preserves a run of one', () => {
    const values = [null, 80, null, 79.5, 79.2, null];
    expect(trendSegments(values)).toEqual([
      [{ index: 1, kg: 80 }],
      [
        { index: 3, kg: 79.5 },
        { index: 4, kg: 79.2 },
      ],
    ]);
    expect(trendSegments([null, null])).toEqual([]);
  });
});

describe('weightDomain', () => {
  it('pads [70, 72] by 10% each side and does not include 0', () => {
    const dom = weightDomain([70, 72]);
    expect(dom).not.toBeNull();
    expect(dom!.min).toBeCloseTo(69.8, 6);
    expect(dom!.max).toBeCloseTo(72.2, 6);
    expect(dom!.min).toBeGreaterThan(0);
  });

  it('pads a flat pair by ±1 kg and returns null for fewer than 2 finite values', () => {
    expect(weightDomain([70, 70])).toEqual({ min: 69, max: 71 });
    expect(weightDomain([70])).toBeNull();
    expect(weightDomain([])).toBeNull();
    expect(weightDomain([70, NaN, Infinity])).toBeNull();
    expect(weightDomain([NaN, 70, 72])).toEqual({
      min: expect.closeTo(69.8, 6),
      max: expect.closeTo(72.2, 6),
    });
  });
});

describe('weightY', () => {
  it('maps higher kg to smaller y, max to 0, min to height, and flat domain to mid-height', () => {
    const domain = { min: 70, max: 80 };
    expect(weightY(80, domain, 160)).toBe(0);
    expect(weightY(70, domain, 160)).toBe(160);
    expect(weightY(78, domain, 160)).toBeLessThan(weightY(72, domain, 160));
    expect(weightY(75, { min: 75, max: 75 }, 160)).toBe(80);
  });
});

describe('formatWeeklyRate', () => {
  it('formats negative kg in lb with unicode minus, positive with +, and 0 without sign', () => {
    expect(formatWeeklyRate(-0.45359237, 'lb')).toBe('−1 lb / week');
    expect(formatWeeklyRate(0.25, 'kg')).toBe('+0.25 kg / week');
    expect(formatWeeklyRate(0.001, 'kg')).toBe('0 kg / week');
    expect(formatWeeklyRate(-0.001, 'lb')).toBe('0 lb / week');
  });
});
