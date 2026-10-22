import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { SettingsPage, SettingsRow } from '@/components/settings/SettingsPage';
import { ExportDataSheet } from '@/components/settings/ExportDataSheet';
import { DestinationRow } from '@/components/settings/DestinationRow';
import { ThemedText } from '@/components/themed-text';
import { resetOnboarding } from '@/lib/storage';

export default function DataPrivacySettings() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
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
  return <SettingsPage title="Data and Privacy">
    <SettingsRow label="Export data" description="Food logs, finished workouts with exercises and sets, and weight history. CSV files use data saved on this device and work offline." onPress={() => setExporting(true)} />
    <SettingsRow label="Backup coverage" description="When cloud sync is available, food logs, custom foods, goals, profile, meals, weight history, finished workouts (including any saved Spotify playlist), custom exercises and routines can sync. An anonymous session is tied to this installation. Sign in to a durable account to recover synced data on another device." />
    <SettingsRow label="Device-only data" description="Water logs, meal Eaten/Planned confirmations, quick-add drinks, display and training preferences, active workouts, drafts and the Spotify connection stay on this device." />
    <SettingsRow label="Unsynced changes" description="Recent edits and deletions may still be waiting to sync. A CSV contains local saved records, including unsynced entries, but is not a restorable account backup. Check Integrations before removing the app or changing accounts." />
    <DestinationRow label="Privacy Policy" destination="privacy" />
    <SettingsRow label="Restart setup" description="Review setup with your saved values. Keeps your account and history." onPress={restart} />
    {error && <ThemedText>{error}</ThemedText>}
    <ExportDataSheet visible={exporting} onClose={() => setExporting(false)} />
  </SettingsPage>;
}
