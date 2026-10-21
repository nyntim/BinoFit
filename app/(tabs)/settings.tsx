import { useCallback, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { useAuth } from '@/hooks/useAuth';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useTabBarInset, useTabBarInsetMode } from '@/context/TabBarInsetContext';
import { getLastSyncAt, getUserGoals, getUserProfile } from '@/lib/storage';
import { getLatestWeightEntry } from '@/lib/weight';
import { formatWeightWithUnit } from '@/lib/units';
import { isSyncConfigured } from '@/lib/sync-status';
import { getMealDefinitions } from '@/lib/database';
import { parseReminderTime } from '@/lib/meals';
import { getReminderPermission, type ReminderPermission } from '@/lib/notification-permissions';
export default function SettingsScreen() {
  const background = useThemeColor({}, 'background'); const text = useThemeColor({}, 'text'); const muted = useThemeColor({}, 'icon');
  const { weightUnit, appearance, showRpe, defaultSetCount } = usePreferences();
  const auth = useAuth(); const { state: sync } = useSyncStatus();
  const bottom = useTabBarInset(); const automatic = useTabBarInsetMode() === 'automatic';
  const [profileSummary, setProfileSummary] = useState('Loading…'); const [nutritionSummary, setNutritionSummary] = useState('Loading…');
  useFocusEffect(useCallback(() => { let active = true; Promise.all([getUserProfile(), getLatestWeightEntry(), getUserGoals()]).then(([profile, entry, goals]) => { if (!active) return; const kg = entry?.weight_kg ?? profile?.weight; setProfileSummary(kg != null ? formatWeightWithUnit(kg, weightUnit) : 'Personal stats'); setNutritionSummary(goals ? `${goals.calorie_goal.toLocaleString()} cal daily` : 'Set daily goals'); }).catch(() => { if (active) { setProfileSummary('Summary unavailable'); setNutritionSummary('Summary unavailable'); } }); return () => { active = false; }; }, [weightUnit]));
  const [notificationSummary, setNotificationSummary] = useState('Checking permission…');
  const [persistedSyncAt, setPersistedSyncAt] = useState<number | null | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      const request = ++generation;
      void Promise.allSettled([getReminderPermission(), getMealDefinitions()]).then(([permissionResult, mealsResult]) => {
        if (!active || request !== generation) return;
        const labels: Record<ReminderPermission, string> = { 'not-determined': 'Not requested', granted: 'Allowed', provisional: 'Quiet delivery', denied: 'Blocked', unavailable: 'Unavailable' };
        const permission = permissionResult.status === 'fulfilled' ? labels[permissionResult.value] : 'Permission unknown';
        const count = mealsResult.status === 'fulfilled' ? mealsResult.value.filter(meal => parseReminderTime(meal.reminder_time)).length : null;
        setNotificationSummary(`${permission} · ${count === null ? 'Reminder count unknown' : `${count} configured`}`);
      });
      void getLastSyncAt().then(value => {
        if (!active || request !== generation) return;
        const parsed = value ? Date.parse(value) : null;
        setPersistedSyncAt(parsed === null || Number.isFinite(parsed) ? parsed : undefined);
      }).catch(() => { if (active && request === generation) setPersistedSyncAt(undefined); });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, []));
  const lastSyncAt = sync.lastSuccessAt ?? persistedSyncAt;
  const cloudSummary = !isSyncConfigured() ? 'Cloud unavailable'
    : sync.isOffline ? 'Cloud offline'
    : sync.status === 'syncing' ? 'Cloud syncing…'
    : sync.status === 'failed' ? 'Cloud sync failed'
    : auth.status === 'none' ? 'Cloud not connected'
    : lastSyncAt === undefined ? 'Cloud status unknown'
    : lastSyncAt === null ? 'Cloud never synced'
    : `Cloud synced ${new Date(lastSyncAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  const groups = [
    { title: 'You', rows: [{ label: 'Profile', route: 'profile', value: profileSummary }, { label: 'Nutrition', route: 'nutrition', value: nutritionSummary }, { label: 'Training', route: 'training', value: `${defaultSetCount} default sets · RPE ${showRpe ? 'on' : 'off'}` }] },
    { title: 'App', rows: [{ label: 'Preferences', route: 'preferences', value: `${appearance.charAt(0).toUpperCase() + appearance.slice(1)} · ${weightUnit === 'kg' ? 'Metric' : 'Imperial'}` }, { label: 'Notifications', route: 'notifications', value: notificationSummary }] },
    { title: 'Account and data', rows: [{ label: 'Account', route: 'account', value: auth.status === 'signedIn' ? auth.email ?? 'Signed in' : auth.status === 'anonymous' ? 'Guest account' : 'Not connected' }, { label: 'Integrations', route: 'integrations', value: cloudSummary }, { label: 'Data and Privacy', route: 'data-privacy', value: 'Export, backup and privacy' }] },
    { title: 'Help', rows: [{ label: 'About', route: 'about', value: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'Version unavailable' }, { label: 'Support', route: 'support', value: 'Problems and feedback' }] },
  ];
  return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: background }}><ScrollView contentInsetAdjustmentBehavior={automatic ? 'automatic' : undefined} contentContainerStyle={{ padding: 20, paddingBottom: bottom + 24, gap: 24 }}><Text accessibilityRole="header" style={{ color: text, fontSize: 28, fontWeight: '700' }}>Settings</Text>{groups.map(group => <View key={group.title} style={{ gap: 8 }}><Text accessibilityRole="header" style={{ color: muted, fontSize: 13, fontWeight: '500', marginBottom: 4 }}>{group.title}</Text>{group.rows.map(row => <SettingsRow key={row.route} label={row.label} value={row.value} onPress={() => router.push(`/settings/${row.route}` as Parameters<typeof router.push>[0])} />)}</View>)}</ScrollView></SafeAreaView>;
}
