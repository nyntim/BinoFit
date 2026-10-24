import {
  describeBackup,
  formatIntegrationsSummary,
  formatNotificationSummary,
  formatTrainingSummary,
  macroEnergyShares,
  mealSettingsDetail,
  mealSettingsRows,
} from '@/lib/settings-summaries';
import type { MealDefinition, MealNameEntry } from '@/lib/types';

const base = { configured: true, authStatus: 'signedIn' as const, sync: { status: 'idle' as const, isOffline: false }, lastSyncAt: undefined as number | null | undefined, now: new Date(2026, 9, 22, 12, 0, 0).getTime() };
const at = (h: number, m: number, s = 0, day = 22) => new Date(2026, 9, day, h, m, s).getTime();

describe('describeBackup precedence', () => {
  it('unconfigured beats offline, which beats syncing, failed and no session', () => {
    const all = { ...base, configured: false, authStatus: 'none' as const, sync: { status: 'failed' as const, isOffline: true }, lastSyncAt: 1 };
    expect(describeBackup(all)).toEqual({ text: 'Backup unavailable', tone: 'neutral' });
    expect(describeBackup({ ...all, configured: true }).text).toBe('Offline. Backup resumes when you reconnect.');
    expect(describeBackup({ ...all, configured: true, sync: { status: 'syncing', isOffline: false } }).text).toBe('Backing up…');
    expect(describeBackup({ ...all, configured: true, sync: { status: 'failed', isOffline: false } })).toEqual({ text: 'Backup failed', tone: 'error' });
    expect(describeBackup({ ...all, configured: true, sync: { status: 'idle', isOffline: false } }).text).toBe('Backup not connected');
  });

  it('reports unknown and never-synced states', () => {
    expect(describeBackup({ ...base, lastSyncAt: undefined }).text).toBe('Backup status unknown');
    expect(describeBackup({ ...base, lastSyncAt: null }).text).toBe('Not backed up yet');
  });

  it('words the age at the minute and hour boundaries', () => {
    const now = at(12, 0);
    expect(describeBackup({ ...base, now, lastSyncAt: now - 59_000 })).toEqual({ text: 'Backed up just now', tone: 'success' });
    expect(describeBackup({ ...base, now, lastSyncAt: now - 60_000 }).text).toBe('Backed up 1 min ago');
    expect(describeBackup({ ...base, now, lastSyncAt: now - 59 * 60_000 }).text).toBe('Backed up 59 min ago');
    expect(describeBackup({ ...base, now, lastSyncAt: now - 60 * 60_000 }).text).toMatch(/^Backed up today at /);
  });

  it('handles midnight: a minute across the date line is still minutes, hours across it are dated', () => {
    expect(describeBackup({ ...base, now: at(0, 1, 0, 22), lastSyncAt: at(23, 59, 30, 21) }).text).toBe('Backed up 1 min ago');
    const dated = describeBackup({ ...base, now: at(8, 0, 0, 22), lastSyncAt: at(20, 0, 0, 21) }).text;
    expect(dated).toMatch(/^Backed up Oct 21, /);
    expect(dated).not.toMatch(/today/);
  });

  it('treats a future timestamp (clock skew) as just now', () => {
    expect(describeBackup({ ...base, lastSyncAt: base.now + 5 * 60_000 }).text).toBe('Backed up just now');
  });
});

describe('small formatters', () => {
  it('formats the training summary', () => {
    expect(formatTrainingSummary(true, 'rir')).toBe('RIR');
    expect(formatTrainingSummary(true, 'rpe')).toBe('RPE');
    expect(formatTrainingSummary(false, 'rpe')).toBe('Effort off');
  });

  it('formats the notification summary', () => {
    expect(formatNotificationSummary('granted', 1)).toBe('1 reminder');
    expect(formatNotificationSummary('granted', 3)).toBe('3 reminders');
    expect(formatNotificationSummary('provisional', 0)).toBe('No reminders');
    expect(formatNotificationSummary('denied', 2)).toBe('Blocked');
    expect(formatNotificationSummary('not-determined', 2)).toBe('Not requested');
    expect(formatNotificationSummary('unavailable', null)).toBe('Unavailable');
    expect(formatNotificationSummary(null, 2)).toBe('Permission unknown');
    expect(formatNotificationSummary('granted', null)).toBe('Reminders unknown');
  });

  it('formats every integrations combination', () => {
    expect(formatIntegrationsSummary({ health: true, spotify: true })).toBe('Health, Spotify');
    expect(formatIntegrationsSummary({ health: true, spotify: false })).toBe('Health');
    expect(formatIntegrationsSummary({ health: false, spotify: true })).toBe('Spotify');
    expect(formatIntegrationsSummary({ health: false, spotify: false })).toBe('Not connected');
  });
});

describe('macroEnergyShares', () => {
  const draft = { calorie_goal: '2250', protein_goal: '169', carb_goal: '253', fat_goal: '63' };

  it('computes each macro share of calories at 4, 4 and 9 kcal per gram', () => {
    const shares = macroEnergyShares(draft);
    expect(shares.protein_goal).toEqual({ kcal: 676, percent: 30 });
    expect(shares.carb_goal.percent).toBe(45);
    expect(shares.fat_goal).toEqual({ kcal: 567, percent: 25 });
  });

  it('gives null for an invalid macro and all null percentages for invalid calories', () => {
    expect(macroEnergyShares({ ...draft, protein_goal: '16x' }).protein_goal).toEqual({ kcal: null, percent: null });
    const noCalories = macroEnergyShares({ ...draft, calorie_goal: '' });
    expect(noCalories.protein_goal).toEqual({ kcal: 676, percent: null });
    expect(noCalories.fat_goal.percent).toBeNull();
  });

  it('rounds half up and lets shares total over 100 percent', () => {
    expect(macroEnergyShares({ calorie_goal: '800', protein_goal: '1', carb_goal: '1', fat_goal: '1' }).protein_goal.percent).toBe(1); // 0.5 rounds up
    const over = macroEnergyShares({ calorie_goal: '1000', protein_goal: '200', carb_goal: '200', fat_goal: '100' });
    expect(over.protein_goal.percent! + over.carb_goal.percent! + over.fat_goal.percent!).toBeGreaterThan(100);
  });
});

describe('meal settings rows', () => {
  const def = (id: string, position: number, reminder_time: string | null, calorie_target: number | null = null): MealDefinition =>
    ({ id, position, reminder_time, calorie_target, protein_target: null, carb_target: null, fat_target: null, created_at: '', updated_at: '' });
  const names: MealNameEntry[] = [
    { meal_id: 'a', name: 'Breakfast', effective_from: '0000-01-01', updated_at: '' },
    { meal_id: 'a', name: 'First meal', effective_from: '2026-10-01', updated_at: '' },
    { meal_id: 'b', name: 'Lunch', effective_from: '0000-01-01', updated_at: '' },
  ];

  it('orders by position and uses the name in force on the date', () => {
    const rows = mealSettingsRows([def('b', 1, null), def('a', 0, '08:00')], names, '2026-10-22');
    expect(rows.map((row) => row.name)).toEqual(['First meal', 'Lunch']);
    expect(mealSettingsRows([def('a', 0, null)], names, '2026-09-01')[0].name).toBe('Breakfast');
  });

  it('treats a malformed reminder as no reminder and keeps a calorie target', () => {
    const [bad, target] = mealSettingsRows([def('a', 0, 'bad'), def('b', 1, null, 500)], names, '2026-10-22');
    expect(bad.reminder).toBeNull();
    expect(mealSettingsDetail(bad)).toBe('No reminder');
    expect(mealSettingsDetail(target)).toBe('No reminder · 500 cal');
  });

  it('joins a reminder and a target', () => {
    const [row] = mealSettingsRows([def('a', 0, '07:30', 500)], names, '2026-10-22');
    expect(row.reminder).not.toBeNull();
    expect(mealSettingsDetail(row)).toBe(`${row.reminder} · 500 cal`);
    expect(mealSettingsDetail({ reminder: '7:30 AM', calorieTarget: null })).toBe('7:30 AM');
  });

  it('returns nothing for no definitions', () => {
    expect(mealSettingsRows([], names, '2026-10-22')).toEqual([]);
  });
});
