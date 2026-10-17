// Pure helpers for tab visibility and the app home route (nutrition + training always on).

export type TabName = 'index' | 'training' | 'progress' | 'settings';

/** Every tab is always visible. */
export function isTabVisible(tab: TabName): boolean {
  return tab === 'index' || tab === 'training' || tab === 'progress' || tab === 'settings';
}

/** Route to land on after onboarding or sign-in. */
export function homeRouteFor(): '/(tabs)' {
  return '/(tabs)';
}
