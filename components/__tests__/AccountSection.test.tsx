import { signedInLabel } from '@/components/settings/AccountSection';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/auth', () => ({
  prepareSignOut: jest.fn(),
  retryRestore: jest.fn(),
  signInWithApple: jest.fn(),
  signOutAndWipe: jest.fn(),
}));
jest.mock('@/hooks/useAuth', () => ({ useAuth: jest.fn() }));


describe('signedInLabel', () => {
  it('names Apple, with the email when known', () => {
    expect(signedInLabel('apple', 'a@b.com')).toBe('Signed in with Apple · a@b.com');
    expect(signedInLabel('apple', null)).toBe('Signed in with Apple');
  });

  it('shows just the email for email accounts', () => {
    expect(signedInLabel('email', 'a@b.com')).toBe('Signed in as a@b.com');
  });

  it('falls back when the method or email is unknown', () => {
    expect(signedInLabel(null, 'a@b.com')).toBe('Signed in as a@b.com');
    expect(signedInLabel(null, null)).toBe('Signed in');
    expect(signedInLabel('email', null)).toBe('Signed in');
  });
});
