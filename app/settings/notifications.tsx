import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SettingsPage, SettingsRow } from '@/components/settings/SettingsPage';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ThemedText } from '@/components/themed-text';
import { getMealDefinitions } from '@/lib/database';
import { parseReminderTime } from '@/lib/meals';
import { requestReminderPermission, restoreMealReminders } from '@/lib/reminders';
import { canDeliverReminders, getReminderPermission, type ReminderPermission } from '@/lib/notification-permissions';

export default function NotificationsSettings() {
  const tint = useThemeColor({}, 'tint');
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const requestingRef = useRef(false);
  const [requesting, setRequesting] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    async function refresh() {
      const next = await getReminderPermission();
      if (active) setPermission(next);
      try { const defs = await getMealDefinitions(); if (active) { setCount(defs.filter((d) => parseReminderTime(d.reminder_time)).length); setReadError(null); } }
      catch { if (active) { setCount(null); setReadError('Could not read meal reminders. Return here to retry.'); } }
    }
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { active = false; subscription.remove(); };
  }, []));
  async function allowNotifications() {
    if (requestingRef.current) return;
    requestingRef.current = true;
    setRequesting(true);
    setError(null);
    try {
      const allowed = await requestReminderPermission();
      const next = await getReminderPermission();
      setPermission(next);
      if (allowed) void restoreMealReminders();
      else if (next === 'not-determined' || next === 'unavailable') setError('Could not enable notifications. Try again or check your device Settings.');
    } catch {
      setError('Could not enable notifications. Try again or check your device Settings.');
      setPermission(await getReminderPermission());
    } finally {
      requestingRef.current = false;
      setRequesting(false);
    }
  }
  const labels = { 'not-determined': 'Not requested', granted: 'Allowed', provisional: 'Quiet delivery', denied: 'Blocked in system settings', unavailable: 'Unavailable on this device' };
  return <SettingsPage title="Notifications">
    <SettingsRow label="Permission" value={permission ? labels[permission] : 'Checking'} />
    <SettingsRow label="Meal reminders" value={count === null ? 'Unknown' : `${count} configured`} description={permission && !canDeliverReminders(permission) ? 'Configured reminders cannot be delivered until notifications are allowed.' : 'One daily local reminder per configured meal. All reminders are off by default.'} />
    {permission === 'not-determined' && <SettingsRow label="Allow notifications" disabled={requesting} value={requesting ? 'Requesting permission' : undefined} onPress={() => { void allowNotifications(); }}>{requesting && <ActivityIndicator color={tint} accessibilityLabel="Requesting notification permission" accessibilityState={{ busy: true }} />}</SettingsRow>}
    {permission === 'denied' && <SettingsRow label="Open system settings" onPress={() => { void Linking.openSettings().catch(() => setError('Could not open system settings. Open your device Settings and choose BinoFit.')); }} />}
    <SettingsRow label="Manage meal reminders" description="In Nutrition, tap a meal while editing to choose its reminder time." onPress={() => router.push({ pathname: '/(tabs)', params: { manageMeals: '1' } })} />
    {readError && <ThemedText>{readError}</ThemedText>}
    {error && <ThemedText>{error}</ThemedText>}
  </SettingsPage>;
}
