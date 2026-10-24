import { daySummaryLine } from '@/lib/day-summary';
import type { WorkoutSummary } from '@/lib/types';

const workout = (title: string, durationLabel: string): WorkoutSummary => ({ id: title, date: '2026-10-20', title, subtitle: '', durationLabel, detailLabel: null, playlistLabel: null });

describe('daySummaryLine', () => {
  test('food only, no food and nothing at all', () => {
    expect(daySummaryLine(840, [])).toBe('840 cal eaten');
    expect(daySummaryLine(0, [])).toBe('No food logged');
  });
  test('uses a thousands separator', () => {
    expect(daySummaryLine(1100, [])).toBe('1,100 cal eaten');
  });
  test('one workout follows the food', () => {
    expect(daySummaryLine(1100, [workout('Push day', '58 min')])).toBe('1,100 cal eaten · Push day, 58 min');
    expect(daySummaryLine(0, [workout('Push day', '58 min')])).toBe('No food logged · Push day, 58 min');
  });
  test('two or more workouts add a count', () => {
    expect(daySummaryLine(1100, [workout('Push day', '58 min'), workout('Run', '30 min')])).toBe('1,100 cal eaten · Push day, 58 min +1 more');
    expect(daySummaryLine(1100, [workout('A', '1 min'), workout('B', '1 min'), workout('C', '1 min')])).toContain('+2 more');
  });
  test('a failed food read shows the workouts alone, or a load failure', () => {
    expect(daySummaryLine(null, [workout('Push day', '58 min')])).toBe('Push day, 58 min');
    expect(daySummaryLine(null, [])).toBe("Couldn't load this day");
  });
});
