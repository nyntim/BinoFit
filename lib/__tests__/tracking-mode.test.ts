import { homeRouteFor, isTabVisible, type TabName } from '@/lib/tracking-mode';
import { resolveTrackingMode } from '@/lib/storage';
import type { TrackingMode } from '@/lib/types';

describe('tracking mode helpers', () => {
  it('unset mode resolves to both so every tab shows', () => {
    const mode = resolveTrackingMode(null);
    expect(mode).toBe('both');
    for (const tab of ['index', 'training', 'progress', 'settings'] as TabName[]) {
      expect(isTabVisible(tab, mode)).toBe(true);
    }
  });

  it.each<[TrackingMode, Record<TabName, boolean>]>([
    ['both', { index: true, training: true, progress: true, settings: true }],
    ['nutrition', { index: true, training: false, progress: true, settings: true }],
    ['training', { index: false, training: true, progress: true, settings: true }],
  ])('isTabVisible for mode %s', (mode, expected) => {
    for (const tab of Object.keys(expected) as TabName[]) {
      expect(isTabVisible(tab, mode)).toBe(expected[tab]);
    }
  });

  it('homeRouteFor lands on Training only in training mode', () => {
    expect(homeRouteFor('both')).toBe('/(tabs)');
    expect(homeRouteFor('nutrition')).toBe('/(tabs)');
    expect(homeRouteFor('training')).toBe('/(tabs)/training');
  });
});
