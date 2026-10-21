import { internalSettingsDestination, validateDestination } from '@/lib/settings-destinations';

it.each([undefined, '', 'http://example.com', 'javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com\n'])('rejects invalid or missing destination %s', (value) => {
  expect(validateDestination(value)).toBeNull();
});
it('accepts configured public HTTPS and opt-in email destinations', () => {
  expect(validateDestination('https://example.com/privacy')).toBe('https://example.com/privacy');
  expect(validateDestination('mailto:help@example.com')).toBeNull();
  expect(validateDestination('mailto:help@example.com', true)).toBe('mailto:help@example.com');
  expect(validateDestination('mailto:help@example.com?body=private', true)).toBeNull();
});

it.each([['privacy', '/settings/privacy-policy'], ['terms', '/settings/terms'], ['support', '/settings/report-problem'], ['feedback', '/settings/feedback']] as const)('maps %s to its internal page', (kind, route) => {
  expect(internalSettingsDestination(kind)).toBe(route);
});

it('ignores invalid release configuration and retains its internal fallback', () => {
  const previous = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL = 'javascript:alert(1)';
  try {
    jest.isolateModules(() => {
      const destinations = require('@/lib/settings-destinations') as typeof import('@/lib/settings-destinations');
      expect(destinations.settingsDestination('privacy')).toBeNull();
      expect(destinations.internalSettingsDestination('privacy')).toBe('/settings/privacy-policy');
    });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
    else process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL = previous;
  }
});
