import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ExportDataSheet } from '@/components/settings/ExportDataSheet';
import { DestinationRow } from '@/components/settings/DestinationRow';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { useThemeColor } from '@/hooks/use-theme-color';
import { countUnsynced } from '@/lib/auth';
import { isSyncConfigured } from '@/lib/sync-status';
import { resetOnboarding } from '@/lib/storage';

const COVERAGE: { label: string; backedUp: boolean }[] = [
  { label: 'Food logs, meals and custom foods', backedUp: true },
  { label: 'Goals, targets and profile', backedUp: true },
  { label: 'Finished workouts, routines and custom exercises', backedUp: true },
  { label: 'Weight history', backedUp: true },
  { label: 'Water logs, quick-add drinks and meal confirmations', backedUp: false },
  { label: 'Preferences, active workouts, drafts and Spotify', backedUp: false },
];

export default function DataPrivacySettings() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string>('…');
  const busy = useRef(false);
  const tint = useThemeColor({}, 'tint');
  const muted = useThemeColor({}, 'icon');
  const danger = useThemeColor({}, 'danger');
  const panel = useThemeColor({}, 'cardSecondary');
  const configured = isSyncConfigured();
  useFocusEffect(useCallback(() => {
    let active = true;
    countUnsynced().then((n) => { if (active) setPending(String(n)); }).catch(() => { if (active) setPending('Unavailable'); });
    return () => { active = false; };
  }, []));
  function restart() {
    Alert.alert('Restart setup?', 'Your account, history and saved goals will stay on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restart setup', onPress: async () => {
        if (busy.current) return;
        busy.current = true;
        try { await resetOnboarding(); router.push({ pathname: '/onboarding', params: { restart: '1' } }); }
        catch { setError('Could not restart setup. Try again.'); }
        finally { busy.current = false; }
      } },
    ]);
  }
  return <SettingsPage title="Data and privacy">
    <ThemedText type="body" style={{ color: muted }}>Your log lives on this phone first. Here&apos;s what&apos;s backed up and what stays put.</ThemedText>
    <ThemedText type="section" accessibilityRole="header">Backup coverage</ThemedText>
    <Card style={styles.card}>
      {COVERAGE.map(({ label, backedUp }) => {
        const state = backedUp ? (configured ? 'Backed up' : 'Not in this build') : 'This phone only';
        return <View key={label} accessible accessibilityLabel={`${label}, ${state.toLowerCase()}`} style={styles.coverage}>
          <IconSymbol name={backedUp && configured ? 'checkmark' : 'minus'} size={18} color={backedUp && configured ? tint : muted} />
          <View style={styles.coverageCopy}>
            <ThemedText type="body">{label}</ThemedText>
            <ThemedText type="caption">{state}</ThemedText>
          </View>
        </View>;
      })}
      <View style={[styles.panel, { backgroundColor: panel}]}>
        <ThemedText type="label" style={styles.panelLabel}>Unsynced changes</ThemedText>
        <ThemedText type="label" style={styles.panelValue}>{pending}</ThemedText>
      </View>
    </Card>
    <ThemedText type="caption" style={styles.caption}>An anonymous session is tied to this installation. Sign in to a durable account to recover synced data on another device.</ThemedText>
    <ThemedText type="caption" style={styles.caption}>Recent edits and deletions may still be waiting to sync. A CSV contains local saved records, including unsynced entries, but is not a restorable account backup. Check Integrations before removing the app or changing accounts.</ThemedText>
    <ListGroup>
      <ListRow title="Export data" subtitle="CSV of food, workouts and weight. Uses data saved on this device and works offline." onPress={() => setExporting(true)} />
      <ListRow title="Restart setup" subtitle="Review setup with your saved values. Keeps your account and history." onPress={restart} />
      <DestinationRow label="Privacy policy" destination="privacy" />
    </ListGroup>
    {error && <Text accessibilityRole="alert" style={{ color: danger }}>{error}</Text>}
    <ExportDataSheet visible={exporting} onClose={() => setExporting(false)} />
  </SettingsPage>;
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  coverage: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coverageCopy: { flex: 1, minWidth: 0 },
  caption: { paddingHorizontal: 4 },
  panel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 38, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  panelLabel: { flexShrink: 1 },
  panelValue: { fontVariant: ['tabular-nums'] },
});
