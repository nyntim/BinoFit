import {
  authErrorMessage,
  codeError,
  emailError,
  isValidCode,
  isValidEmail,
  isValidPassword,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  passwordError,
} from '@/lib/auth-validation';
import { describeAuthError, clearAuthIssue, getLastAuthIssue, reportAuthIssue } from '@/lib/auth-debug';

const FALLBACK = 'Something went wrong. Try again.';

describe('authErrorMessage', () => {
  it.each([
    ['weak_password', /stronger password/i],
    ['email_exists', /already exists/i],
    ['user_already_exists', /already exists/i],
    ['invalid_credentials', /incorrect/i],
    ['over_email_send_rate_limit', /too many attempts/i],
    ['over_request_rate_limit', /too many attempts/i],
    ['otp_expired', /expired/i],
    ['same_password', /different/i],
  ])('maps code %s to its copy', (code, pattern) => {
    expect(authErrorMessage({ code, message: 'raw server text' })).toMatch(pattern);
  });

  it('never leaks the raw server message', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).not.toMatch(/login credentials/i);
  });

  it('treats status 0 and fetch failures as offline', () => {
    const offline = "You're offline. Connect and try again.";
    expect(authErrorMessage({ status: 0, message: '' })).toBe(offline);
    expect(authErrorMessage({ name: 'AuthRetryableFetchError' })).toBe(offline);
    expect(authErrorMessage(new Error('Network request failed'))).toBe(offline);
    expect(authErrorMessage(new Error('Failed to fetch'))).toBe(offline);
  });

  it('treats HTTP 429 as rate limited', () => {
    expect(authErrorMessage({ status: 429 })).toMatch(/too many attempts/i);
  });

  it('maps an invalid email validation failure and bad codes', () => {
    expect(authErrorMessage({ code: 'validation_failed', message: 'Unable to validate email address' })).toBe('Enter a valid email address.');
    expect(authErrorMessage({ message: 'Token has expired or is invalid' })).toMatch(/incorrect or has expired/i);
  });

  it('falls back for unknown errors and non-objects', () => {
    expect(authErrorMessage({ code: 'something_new', message: 'boom' })).toBe(FALLBACK);
    expect(authErrorMessage(null)).toBe(FALLBACK);
    expect(authErrorMessage(undefined)).toBe(FALLBACK);
    expect(authErrorMessage('oops')).toBe(FALLBACK);
  });
});

describe('validators', () => {
  it('isValidEmail accepts normal addresses, ignoring case and surrounding spaces', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('  First.Last+tag@Example.CO.uk ')).toBe(true);
  });

  it.each(['', 'a', 'a@b', 'a@b.c', '@b.com', 'a@.com', 'a b@c.com', 'a@@b.com'])('isValidEmail rejects %p', (v) => {
    expect(isValidEmail(v)).toBe(false);
  });

  it('isValidPassword requires 8 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('12345678')).toBe(true);
    expect(isValidPassword('')).toBe(false);
  });

  it('isValidCode requires exactly 6 digits after trimming', () => {
    expect(isValidCode('123456')).toBe(true);
    expect(isValidCode(' 123456 ')).toBe(true);
    for (const v of ['', '12345', '1234567', '12345a', '12 456', 'abcdef']) expect(isValidCode(v)).toBe(false);
  });

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Foo@Bar.COM \n')).toBe('foo@bar.com');
  });

  it('error helpers return null when valid and a message otherwise', () => {
    expect(emailError('a@b.com')).toBeNull();
    expect(emailError('nope')).toBe('Enter a valid email address.');
    expect(passwordError('12345678')).toBeNull();
    expect(passwordError('short')).toMatch(/8 characters/);
    expect(codeError('123456')).toBeNull();
    expect(codeError('12')).toBe('Enter the 6-digit code.');
  });
});

describe('auth-debug', () => {
  beforeEach(() => clearAuthIssue());

  it('describeAuthError formats code/status/message for any value', () => {
    expect(describeAuthError({ code: 'c', status: 400, message: 'm' })).toBe('c/400/m');
    expect(describeAuthError({ message: 'm' })).toBe('-/-/m');
    expect(describeAuthError('plain')).toBe('-/-/plain');
    expect(describeAuthError(null)).toBe('unknown');
  });

  it('reportAuthIssue records the last issue and clearAuthIssue resets it', () => {
    expect(getLastAuthIssue()).toBeNull();
    reportAuthIssue('step1', { code: 'x', message: 'y' });
    reportAuthIssue('step2', 'later');
    expect(getLastAuthIssue()).toMatchObject({ step: 'step2', summary: '-/-/later' });
    clearAuthIssue();
    expect(getLastAuthIssue()).toBeNull();
  });
});
