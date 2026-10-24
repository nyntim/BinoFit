import { previousScreenTitle, SETTINGS_SCREEN_TITLES } from '@/lib/settings-screens';

const stack = (names: string[], index = names.length - 1) => ({ index, routes: names.map((name) => ({ name })) });
const root = (tab: string | null) => ({
  index: 1,
  routes: [
    { name: '(tabs)', state: tab ? { index: 0, routes: [{ name: tab }] } : undefined },
    { name: 'settings' },
  ],
});

describe('previousScreenTitle', () => {
  it('names the screen below within the settings stack', () => {
    expect(previousScreenTitle(stack(['training', 'weekly-volume-targets']), root('training'))).toBe('Training');
    expect(previousScreenTitle(stack(['data-privacy', 'privacy-policy']), root('settings'))).toBe('Data and privacy');
    expect(previousScreenTitle(stack(['about', 'terms']), root('settings'))).toBe('About');
    expect(previousScreenTitle(stack(['support', 'report-problem']), root('settings'))).toBe('Support');
  });

  it.each([['index', 'Nutrition'], ['training', 'Training'], ['progress', 'Progress'], ['settings', 'Settings']])(
    'names the %s tab when the stack was opened from it',
    (tab, title) => {
      expect(previousScreenTitle(stack(['nutrition']), root(tab))).toBe(title);
    },
  );

  it('falls back to Back when the nested tab state is missing', () => {
    expect(previousScreenTitle(stack(['nutrition']), root(null))).toBe('Back');
  });

  it('falls back to Back for an unknown previous route or tab', () => {
    expect(previousScreenTitle(stack(['mystery', 'terms']), root('settings'))).toBe('Back');
    expect(previousScreenTitle(stack(['nutrition']), root('mystery'))).toBe('Back');
  });

  it('falls back to Back when the states are undefined or the root has no tabs below settings', () => {
    expect(previousScreenTitle(undefined, undefined)).toBe('Back');
    expect(previousScreenTitle({}, {})).toBe('Back');
    expect(previousScreenTitle(stack(['profile']), { index: 0, routes: [{ name: 'settings' }] })).toBe('Back');
  });
});

it('has a sentence-case title for every settings route', () => {
  expect(SETTINGS_SCREEN_TITLES['data-privacy']).toBe('Data and privacy');
  expect(SETTINGS_SCREEN_TITLES['privacy-policy']).toBe('Privacy policy');
  expect(SETTINGS_SCREEN_TITLES.terms).toBe('Terms of service');
  expect(Object.keys(SETTINGS_SCREEN_TITLES)).toHaveLength(15);
});
