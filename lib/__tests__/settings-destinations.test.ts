import { validateDestination } from '@/lib/settings-destinations';

it.each([undefined, '', 'http://example.com', 'javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com\n'])('rejects invalid or missing destination %s', (value) => {
  expect(validateDestination(value)).toBeNull();
});
it('accepts configured public HTTPS and opt-in email destinations', () => {
  expect(validateDestination('https://example.com/privacy')).toBe('https://example.com/privacy');
  expect(validateDestination('mailto:help@example.com')).toBeNull();
  expect(validateDestination('mailto:help@example.com', true)).toBe('mailto:help@example.com');
  expect(validateDestination('mailto:help@example.com?body=private', true)).toBeNull();
});
