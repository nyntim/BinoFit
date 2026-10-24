import { useCallback, useState } from 'react';
import { AppState, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { IconTile, type IconTileTone } from '@/components/ui/IconTile';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePreferences } from '@/hooks/usePreferences';
import { useAuth } from '@/hooks/useAuth';
import { useBackupStatus } from '@/hooks/useBackupStatus';
import { useSpotifyConnection } from '@/hooks/useSpotifyConnection';
import { useTabBarInset, useTabBarInsetMode } from '@/context/TabBarInsetContext';
import { getUserGoals, getUserProfile } from '@/lib/storage';
import { getLatestWeightEntry } from '@/lib/weight';
import { formatWeightWithUnit } from '@/lib/units';
import { getMealDefinitions } from '@/lib/database';
import { parseReminderTime } from '@/lib/meals';
import { HEALTH_KIT_SYNC_V1_KEY } from '@/lib/health-schedule';
import { getReminderPermission, type ReminderPermission } from '@/lib/notification-permissions';
import { formatIntegrationsSummary, formatNotificationSummary, formatTrainingSummary } from '@/lib/settings-summaries';

const dinosaur = require('@/assets/images/icon.png');

type Row = { label: string; route: string; icon: IconSymbolName; tone: IconTileTone; detail?: string };

export default function SettingsScreen() {
  const background = useThemeColor({}, 'background');
  const muted = useThemeColor({}, 'icon');
  const success = useThemeColor({}, 'success');
  const danger = useThemeColor({}, 'danger');
  const { weightUnit, showEffort, effortMetric } = usePreferences();
  const auth = useAuth();
  const backup = useBackupStatus();
  const spotify = useSpotifyConnection();
  const bottom = useTabBarInset(); const automatic = useTabBarInsetMode() === 'automatic';
  const [profileSummary, setProfileSummary] = useState('Loading…'); const [nutritionSummary, setNutritionSummary] = useState('Loading…');
  useFocusEffect(useCallback(() => { let active = true; Promise.all([getUserProfile(), getLatestWeightEntry(), getUserGoals()]).then(([profile, entry, goals]) => { if (!active) return; const kg = entry?.weight_kg ?? profile?.weight; setProfileSummary(kg != null ? formatWeightWithUnit(kg, weightUnit) : 'Personal stats'); setNutritionSummary(goals ? `${goals.calorie_goal.toLocaleString()} cal` : 'Set daily goals'); }).catch(() => { if (active) { setProfileSummary('Summary unavailable'); setNutritionSummary('Summary unavailable'); } }); return () => { active = false; }; }, [weightUnit]));
  const [notificationSummary, setNotificationSummary] = useState('Checking permission…');
  const [healthConnected, setHealthConnected] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      const request = ++generation;
      void Promise.allSettled([getReminderPermission(), getMealDefinitions()]).then(([permissionResult, mealsResult]) => {
        if (!active || request !== generation) return;
        const permission: ReminderPermission | null = permissionResult.status === 'fulfilled' ? permissionResult.value : null;
        const count = mealsResult.status === 'fulfilled' ? mealsResult.value.filter(meal => parseReminderTime(meal.reminder_time)).length : null;
        setNotificationSummary(formatNotificationSummary(permission, count));
      });
      // Read the flag only: mounting useHealthKit here would initialize HealthKit
      void (Platform.OS === 'ios' ? AsyncStorage.multiGet([HEALTH_KIT_SYNC_V1_KEY, 'healthKitInitialized']) : Promise.resolve(null)).then(values => {
        if (active && request === generation) setHealthConnected(!!values && values.some(([, value]) => value === 'true'));
      }).catch(() => { if (active && request === generation) setHealthConnected(false); });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, []));

  const accountTitle = auth.status === 'signedIn' ? auth.email ?? 'Signed in' : 'Not signed in';
  const dot = backup.tone === 'success' ? success : backup.tone === 'error' ? danger : muted;
  const groups: { title: string; rows: Row[] }[] = [
    { title: 'You', rows: [
      { label: 'Profile', route: 'profile', icon: 'person.fill', tone: 'tint', detail: profileSummary },
      { label: 'Nutrition', route: 'nutrition', icon: 'fork.knife', tone: 'tint', detail: nutritionSummary },
      { label: 'Training', route: 'training', icon: 'dumbbell.fill', tone: 'tint', detail: formatTrainingSummary(showEffort, effortMetric) },
    ] },
    { title: 'App', rows: [
      { label: 'Preferences', route: 'preferences', icon: 'slider.horizontal.3', tone: 'neutral', detail: weightUnit === 'kg' ? 'Metric' : 'Imperial' },
      { label: 'Notifications', route: 'notifications', icon: 'bell.fill', tone: 'tint', detail: notificationSummary },
      { label: 'Integrations', route: 'integrations', icon: 'link', tone: 'neutral', detail: formatIntegrationsSummary({ health: healthConnected, spotify: spotify.status === 'connected' }) },
    ] },
    { title: 'Account and data', rows: [
      { label: 'Account', route: 'account', icon: 'lock.shield', tone: 'neutral' },
      { label: 'Data and privacy', route: 'data-privacy', icon: 'cylinder.split.1x2', tone: 'neutral' },
    ] },
    { title: 'Help', rows: [
      { label: 'Support', route: 'support', icon: 'questionmark.circle', tone: 'neutral' },
      { label: 'About', route: 'about', icon: 'info.circle', tone: 'neutral' },
    ] },
  ];
  const open = (route: string) => router.push(`/settings/${route}` as Parameters<typeof router.push>[0]);
  return <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: background }]}>
    <ScrollView contentInsetAdjustmentBehavior={automatic ? 'automatic' : undefined} contentContainerStyle={[styles.content, { paddingBottom: bottom + 24 }]}>
      <ThemedText type="largeTitle" accessibilityRole="header">Settings</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel={`Account, ${accountTitle}, ${backup.text}`} onPress={() => open('account')} style={({ pressed }) => pressed && styles.pressed}>
        <Card padding="compact" style={styles.account}>
          <Image source={dinosaur} style={styles.avatar} accessible={false} accessibilityIgnoresInvertColors />
          <View style={styles.accountCopy}>
            <ThemedText type="title">{accountTitle}</ThemedText>
            <View style={styles.status}>
              <View style={[styles.dot, { backgroundColor: dot }]} />
              <ThemedText type="caption" style={styles.statusText}>{backup.text}</ThemedText>
            </View>
          </View>
          <IconSymbol name="chevron.right" size={16} color={muted} />
        </Card>
      </Pressable>
      {groups.map(group => <View key={group.title} style={styles.group}>
        <ThemedText type="section" accessibilityRole="header">{group.title}</ThemedText>
        <ListGroup>
          {group.rows.map(row => <ListRow key={row.route} title={row.label} trailing={row.detail} leading={<IconTile icon={row.icon} tone={row.tone} />} onPress={() => open(row.route)} />)}
        </ListGroup>
      </View>)}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  pressed: { opacity: 0.85 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 12 },
  accountCopy: { flex: 1, minWidth: 0, gap: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { flexShrink: 1 },
  group: { gap: 8 },
});
