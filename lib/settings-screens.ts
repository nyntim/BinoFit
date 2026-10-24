/** Sentence-case titles of the Settings stack screens, keyed by route name. */
export const SETTINGS_SCREEN_TITLES: Record<string, string> = {
  profile: 'Profile',
  nutrition: 'Nutrition',
  training: 'Training',
  'weekly-volume-targets': 'Weekly volume targets',
  preferences: 'Preferences',
  notifications: 'Notifications',
  account: 'Account',
  integrations: 'Integrations',
  'data-privacy': 'Data and privacy',
  about: 'About',
  support: 'Support',
  'privacy-policy': 'Privacy policy',
  terms: 'Terms of service',
  'report-problem': 'Report a problem',
  feedback: 'Send feedback',
};

type RouteLike = { name?: string; state?: NavStateLike };
/** Minimal structural shape of a React Navigation state; every field may be missing under mocks. */
export type NavStateLike = { index?: number; routes?: RouteLike[] };

const TAB_TITLES: Record<string, string> = { index: 'Nutrition', training: 'Training', progress: 'Progress', settings: 'Settings' };

/**
 * The name shown on a Settings page's back button. Within the Settings stack it is the screen below
 * (so legal pages say "Data and privacy"); on the first screen it is the tab the stack was opened
 * from. Anything unknown is "Back".
 */
export function previousScreenTitle(own?: NavStateLike | null, parent?: NavStateLike | null): string {
  const index = own?.index ?? 0;
  if (index > 0) {
    const name = own?.routes?.[index - 1]?.name;
    return (name && SETTINGS_SCREEN_TITLES[name]) || 'Back';
  }
  const routes = parent?.routes;
  const parentIndex = parent?.index;
  if (!routes || parentIndex == null) return 'Back';
  const settingsAt = routes.findIndex((route, i) => i <= parentIndex && route.name === 'settings');
  const below = settingsAt > 0 ? routes[settingsAt - 1] : undefined;
  if (below?.name !== '(tabs)') return 'Back';
  const tabs = below.state;
  const active = tabs?.routes?.[tabs.index ?? 0]?.name;
  return (active && TAB_TITLES[active]) || 'Back';
}
