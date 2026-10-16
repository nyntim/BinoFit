// In-memory record of the last auth problem, so a silent failure (such as anonymous sign-in
// being rejected) is visible in the dev console and in Settings during development.

export type AuthIssue = { step: string; summary: string; at: number };

let lastIssue: AuthIssue | null = null;

/** "code/status/message" for any error-like value. */
export function describeAuthError(err: unknown): string {
  if (err === null || err === undefined) return 'unknown';
  if (typeof err === 'string') return `-/-/${err}`;
  const e = err as { code?: unknown; status?: unknown; message?: unknown };
  const code = e.code !== undefined ? String(e.code) : '-';
  const status = e.status !== undefined ? String(e.status) : '-';
  const message = typeof e.message === 'string' ? e.message : String(err);
  return `${code}/${status}/${message}`;
}

/** Records the issue; logs it to the console in development builds only. Never throws. */
export function reportAuthIssue(step: string, err: unknown): void {
  const summary = describeAuthError(err);
  lastIssue = { step, summary, at: Date.now() };
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !process.env.JEST_WORKER_ID) {
    console.warn(`[auth] ${step}: ${summary}`);
  }
}

export function getLastAuthIssue(): AuthIssue | null {
  return lastIssue;
}

/** Test helper. */
export function clearAuthIssue(): void {
  lastIssue = null;
}
