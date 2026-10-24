import { computeStreaks, currentStreakDates } from '@/lib/streak';

describe('computeStreaks', () => {
  it('empty list gives zero streaks', () => {
    expect(computeStreaks([], '2026-10-17')).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  it('a single date logged today is a streak of 1', () => {
    expect(computeStreaks(['2026-10-17'], '2026-10-17')).toEqual({ currentStreak: 1, longestStreak: 1 });
  });

  it('current streak counts from yesterday while today is unlogged', () => {
    const r = computeStreaks(['2026-10-14', '2026-10-15', '2026-10-16'], '2026-10-17');
    expect(r).toEqual({ currentStreak: 3, longestStreak: 3 });
  });

  it('current streak is 0 when neither today nor yesterday is logged', () => {
    const r = computeStreaks(['2026-10-10', '2026-10-11', '2026-10-12'], '2026-10-17');
    expect(r).toEqual({ currentStreak: 0, longestStreak: 3 });
  });

  it('a gap ends the current streak and the longest run is kept', () => {
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-16', '2026-10-17'];
    expect(computeStreaks(dates, '2026-10-17')).toEqual({ currentStreak: 2, longestStreak: 4 });
  });

  it('duplicates and unsorted input are handled', () => {
    const dates = ['2026-10-17', '2026-10-15', '2026-10-16', '2026-10-16', '2026-10-17'];
    expect(computeStreaks(dates, '2026-10-17')).toEqual({ currentStreak: 3, longestStreak: 3 });
  });

  it('future dates are ignored', () => {
    const r = computeStreaks(['2026-10-16', '2026-10-18', '2026-10-19', '2026-10-20'], '2026-10-17');
    expect(r).toEqual({ currentStreak: 1, longestStreak: 1 });
  });

  it('streaks run across month and year boundaries', () => {
    const r = computeStreaks(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'], '2026-01-02');
    expect(r).toEqual({ currentStreak: 4, longestStreak: 4 });
  });

  it('streaks run across a leap day', () => {
    const r = computeStreaks(['2024-02-28', '2024-02-29', '2024-03-01'], '2024-03-01');
    expect(r).toEqual({ currentStreak: 3, longestStreak: 3 });
  });

  it('days across a DST change stay consecutive', () => {
    const r = computeStreaks(['2026-03-07', '2026-03-08', '2026-03-09'], '2026-03-09');
    expect(r.longestStreak).toBe(3);
  });
});

describe('currentStreakDates', () => {
  const today = '2026-10-17';

  it('today logged gives a run ending today', () => {
    expect(currentStreakDates(['2026-10-15', '2026-10-16', '2026-10-17'], today)).toEqual([
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ]);
  });

  it('today unlogged and yesterday logged gives a run ending yesterday', () => {
    expect(currentStreakDates(['2026-10-15', '2026-10-16'], today)).toEqual(['2026-10-15', '2026-10-16']);
  });

  it('neither logged gives an empty run', () => {
    expect(currentStreakDates(['2026-10-10', '2026-10-11'], today)).toEqual([]);
  });

  it('ignores duplicates and future dates', () => {
    expect(
      currentStreakDates(['2026-10-17', '2026-10-17', '2026-10-16', '2026-10-18', '2026-10-19'], today)
    ).toEqual(['2026-10-16', '2026-10-17']);
  });

  it('length always equals computeStreaks currentStreak', () => {
    const table: string[][] = [
      [],
      ['2026-10-17'],
      ['2026-10-16'],
      ['2026-10-14', '2026-10-16', '2026-10-17'],
      ['2026-09-30', '2026-10-01', '2026-10-16'],
      ['2026-10-15', '2026-10-16', '2026-10-18'],
      ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-17', '2026-10-17'],
    ];
    for (const dates of table) {
      expect(currentStreakDates(dates, today)).toHaveLength(computeStreaks(dates, today).currentStreak);
    }
  });
});
