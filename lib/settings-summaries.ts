import { formatReminderTime, mealsForDay } from '@/lib/meals';
import { GOAL_FIELDS, parseGoalInput, type GoalField } from '@/lib/nutrition-settings';
import type { ReminderPermission } from '@/lib/notification-permissions';
import type { AuthStatus, EffortMetric, MealDefinition, MealNameEntry } from '@/lib/types';

export type BackupTone = 'success' | 'neutral' | 'error';
export type BackupDescription = { text: string; tone: BackupTone };

type BackupInput = {
  configured: boolean;
  authStatus: AuthStatus;
  sync: { status: 'idle' | 'syncing' | 'success' | 'failed'; isOffline: boolean };
  /** Epoch ms of the last sync; `undefined` while unknown, `null` when it never happened. */
  lastSyncAt: number | null | undefined;
  now: number;
};

const MINUTE = 60_000;

/** One line about cloud backup for the Settings account card and the Account panel. */
export function describeBackup({ configured, authStatus, sync, lastSyncAt, now }: BackupInput): BackupDescription {
  if (!configured) return { text: 'Backup unavailable', tone: 'neutral' };
  if (sync.isOffline) return { text: 'Offline. Backup resumes when you reconnect.', tone: 'neutral' };
  if (sync.status === 'syncing') return { text: 'Backing up…', tone: 'neutral' };
  if (sync.status === 'failed') return { text: 'Backup failed', tone: 'error' };
  if (authStatus === 'none') return { text: 'Backup not connected', tone: 'neutral' };
  if (lastSyncAt === undefined) return { text: 'Backup status unknown', tone: 'neutral' };
  if (lastSyncAt === null) return { text: 'Not backed up yet', tone: 'neutral' };

  const age = now - lastSyncAt;
  if (age < MINUTE) return { text: 'Backed up just now', tone: 'success' };
  if (age < 60 * MINUTE) return { text: `Backed up ${Math.floor(age / MINUTE)} min ago`, tone: 'success' };
  const at = new Date(lastSyncAt);
  const today = new Date(now);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (at.toDateString() === today.toDateString()) return { text: `Backed up today at ${time}`, tone: 'success' };
  const date = at.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return { text: `Backed up ${date}, ${time}`, tone: 'success' };
}

export function formatTrainingSummary(showEffort: boolean, metric: EffortMetric): string {
  return showEffort ? metric.toUpperCase() : 'Effort off';
}

export function formatNotificationSummary(permission: ReminderPermission | null, count: number | null): string {
  if (permission === null) return 'Permission unknown';
  if (permission === 'not-determined') return 'Not requested';
  if (permission === 'denied') return 'Blocked';
  if (permission === 'unavailable') return 'Unavailable';
  if (count === null) return 'Reminders unknown';
  if (count === 0) return 'No reminders';
  return `${count} ${count === 1 ? 'reminder' : 'reminders'}`;
}

export function formatIntegrationsSummary({ health, spotify }: { health: boolean; spotify: boolean }): string {
  if (health && spotify) return 'Health, Spotify';
  if (health) return 'Health';
  if (spotify) return 'Spotify';
  return 'Not connected';
}

export type MacroShare = { kcal: number | null; percent: number | null };
type MacroField = Exclude<GoalField, 'calorie_goal'>;
const KCAL_PER_GRAM: Record<MacroField, number> = { protein_goal: 4, carb_goal: 4, fat_goal: 9 };

/** Calories and share of the calorie goal for each macro, from the text in the goal fields. */
export function macroEnergyShares(draft: Record<GoalField, string>): Record<MacroField, MacroShare> {
  const calories = parseGoalInput(draft.calorie_goal);
  const result = {} as Record<MacroField, MacroShare>;
  for (const field of GOAL_FIELDS) {
    if (field === 'calorie_goal') continue;
    const grams = parseGoalInput(draft[field]);
    const kcal = grams === null ? null : grams * KCAL_PER_GRAM[field];
    result[field] = { kcal, percent: kcal === null || calories === null ? null : Math.round((kcal / calories) * 100) };
  }
  return result;
}

export type MealSettingsRow = { id: string; name: string; reminder: string | null; calorieTarget: number | null };

/** Active meals in order, named as of `date`, with their reminder and calorie target. */
export function mealSettingsRows(defs: MealDefinition[], names: MealNameEntry[], date: string): MealSettingsRow[] {
  return mealsForDay(defs, names, [], date).map((meal) => {
    const time = meal.def?.reminder_time ?? null;
    const reminder = time && formatReminderTime(time) !== time ? formatReminderTime(time) : null;
    return { id: meal.id, name: meal.name, reminder, calorieTarget: meal.def?.calorie_target ?? null };
  });
}

export function mealSettingsDetail(row: Pick<MealSettingsRow, 'reminder' | 'calorieTarget'>): string {
  const time = row.reminder ?? 'No reminder';
  if (row.calorieTarget == null) return time;
  return `${time} · ${Math.round(row.calorieTarget)} cal`;
}
