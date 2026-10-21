/** Supply only owner-approved public destinations through the release environment. */
export type SettingsDestination = 'privacy' | 'terms' | 'support' | 'feedback';
export function validateDestination(value: unknown, allowEmail = false): string | null {
  if (typeof value !== 'string' || value.trim() !== value || /[\s\r\n]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) return url.href;
    if (allowEmail && url.protocol === 'mailto:' && /^[^@?]+@[^@?]+\.[^@?]+$/.test(url.pathname) && !url.search && !url.hash) return value;
  } catch { /* Unconfigured destinations remain unavailable. */ }
  return null;
}
const configured = {
  privacy: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  terms: process.env.EXPO_PUBLIC_TERMS_URL,
  support: process.env.EXPO_PUBLIC_REPORT_PROBLEM_URL,
  feedback: process.env.EXPO_PUBLIC_FEEDBACK_URL,
};
export function settingsDestination(kind: SettingsDestination): string | null {
  return validateDestination(configured[kind], kind === 'support' || kind === 'feedback');
}
