import { useCallback, useMemo, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { getMealDefinitions, getMealNames } from '@/lib/database';
import { requestReminderPermission, restoreMealReminders } from '@/lib/reminders';
import { canDeliverReminders, getReminderPermission, type ReminderPermission } from '@/lib/notification-permissions';
import { mealSettingsRows } from '@/lib/settings-summaries';
import type { MealDefinition, MealNameEntry } from '@/lib/types';

const LABELS: Record<ReminderPermission, string> = { 'not-determined': 'Not requested', granted: 'Allowed', provisional: 'Quiet delivery', denied: 'Blocked in system settings', unavailable: 'Unavailable on this device' };
const CAPTIONS: Record<ReminderPermission, string> = {
  granted: 'BinoFit can send notifications',
  provisional: 'Reminders arrive quietly in Notification Center',
  'not-determined': 'Allow notifications to get the reminders you set',
  denied: 'Turn notifications on in system settings to get reminders',
  unavailable: 'This device can’t show notifications',
};

export default function NotificationsSettings() {
  const muted = useThemeColor({}, 'icon');
  const text = useThemeColor({}, 'text');
  const danger = useThemeColor({}, 'danger');
  const { restTimerEnabled } = usePreferences();
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [meals, setMeals] = useState<{ defs: MealDefinition[]; names: MealNameEntry[] } | null>(null);
  const requestingRef = useRef(false);
  const [requesting, setRequesting] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    async function refresh() {
      const next = await getReminderPermission();
      if (active) setPermission(next);
      try { const [defs, names] = await Promise.all([getMealDefinitions(), getMealNames()]); if (active) { setMeals({ defs, names }); setReadError(null); } }
      catch { if (active) { setMeals(null); setReadError('Could not read meal reminders. Return here to retry.'); } }
    }
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { active = false; subscription.remove(); };
  }, []));
  const rows = useMemo(() => meals ? mealSettingsRows(meals.defs, meals.names, format(new Date(), 'yyyy-MM-dd')) : [], [meals]);
  const configured = rows.some(row => row.reminder);
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
  const allowed = permission !== null && canDeliverReminders(permission);
  const openMeals = () => router.push({ pathname: '/(tabs)', params: { manageMeals: '1' } });
  return <SettingsPage title="Notifications">
    <ThemedText type="body" style={{ color: muted }}>Only the reminders you ask for. Nothing promotional, ever.</ThemedText>
    <Card padding="compact" style={styles.permission}>
      <IconTile icon={allowed ? 'checkmark' : 'bell.slash'} tone={allowed ? 'success' : 'neutral'} size={40} />
      <View style={styles.permissionCopy}>
        <ThemedText type="title">{permission ? LABELS[permission] : 'Checking'}</ThemedText>
        {permission ? <ThemedText type="caption">{CAPTIONS[permission]}</ThemedText> : null}
      </View>
      {permission === 'not-determined' ? <Button variant="soft" size="sm" label="Allow notifications" loading={requesting} onPress={() => { void allowNotifications(); }} /> : null}
      {permission === 'denied' || allowed ? <Button variant="ghost" size="sm" label="System settings" accessibilityLabel="Open system settings" onPress={() => { Linking.openSettings().catch(() => setError('Could not open system settings. Open your device Settings and choose BinoFit.')); }} /> : null}
    </Card>
    {permission && !canDeliverReminders(permission) && configured ? <ThemedText type="caption" style={styles.caption}>Configured reminders cannot be delivered until notifications are allowed.</ThemedText> : null}
    <ThemedText type="section" accessibilityRole="header">Meal reminders</ThemedText>
    <ListGroup>
      {rows.map(row => <ListRow key={row.id} title={row.name} trailing={<Text style={[styles.value, { color: row.reminder ? text : muted }]}>{row.reminder ?? 'Off'}</Text>} />)}
      <ListRow title="Manage meal reminders" onPress={openMeals} />
    </ListGroup>
    <ThemedText type="caption" style={styles.caption}>In Nutrition, tap Edit, then a meal, to choose its reminder time.</ThemedText>
    <ThemedText type="section" accessibilityRole="header">Workouts</ThemedText>
    <ListGroup>
      <ListRow title="Rest timer" subtitle="Alerts when rest is over, even with the app closed" trailing={restTimerEnabled ? 'On' : 'Off'} onPress={() => router.push('/settings/training')} />
    </ListGroup>
    {readError ? <Text style={{ color: danger }}>{readError}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text> : null}
  </SettingsPage>;
}

const styles = StyleSheet.create({
  permission: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  permissionCopy: { flex: 1, minWidth: 140, gap: 2 },
  caption: { paddingHorizontal: 4 },
  value: { fontSize: 15, fontVariant: ['tabular-nums'] },
});
