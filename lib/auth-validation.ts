export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email));
}

export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/** Inline message for a bad email, or null when it is fine. */
export function emailError(email: string): string | null {
  return isValidEmail(email) ? null : 'Enter a valid email address.';
}

/** Inline message for a bad password, or null when it is fine. */
export function passwordError(password: string): string | null {
  return isValidPassword(password)
    ? null
    : `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
}

export function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export function codeError(code: string): string | null {
  return isValidCode(code) ? null : 'Enter the 6-digit code.';
}

type ErrorLike = { code?: unknown; status?: unknown; message?: unknown; name?: unknown };

/** Maps a Supabase auth error to neutral, user-facing copy. */
export function authErrorMessage(err: unknown): string {
  const e = (typeof err === 'object' && err !== null ? err : {}) as ErrorLike;
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  const status = typeof e.status === 'number' ? e.status : undefined;

  if (code === 'weak_password') return `Use a stronger password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (code === 'email_exists' || code === 'user_already_exists') {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (code === 'invalid_credentials') return 'Email or password is incorrect.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return 'Too many attempts. Try again in a few minutes.';
  }
  if (code === 'otp_expired') return 'This code has expired. Request a new one.';
  if (code === 'same_password') return 'Choose a password different from the current one.';
  if (code === 'validation_failed' && message.includes('email')) return 'Enter a valid email address.';
  if (
    status === 0 ||
    e.name === 'AuthRetryableFetchError' ||
    message.includes('network request failed') ||
    message.includes('failed to fetch')
  ) {
    return "You're offline. Connect and try again.";
  }
  if (message.includes('token has expired or is invalid') || message.includes('invalid code') || code === 'bad_code') {
    return 'This code is incorrect or has expired.';
  }
  return 'Something went wrong. Try again.';
}
