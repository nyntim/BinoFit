import { homeRouteFor, isTabVisible, type TabName } from '@/lib/tracking-mode';

describe('tracking mode helpers', () => {
  it('isTabVisible is true for every tab', () => {
    for (const tab of ['index', 'training', 'progress', 'settings'] as TabName[]) {
      expect(isTabVisible(tab)).toBe(true);
    }
  });

  it('homeRouteFor is always the Home tab', () => {
    expect(homeRouteFor()).toBe('/(tabs)');
  });
});
