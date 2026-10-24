import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useBackupStatus } from '@/hooks/useBackupStatus';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { syncToSupabase } from '@/lib/sync';
import { isSyncConfigured } from '@/lib/sync-status';

/** Backup status line with a Sync now button, on a nested panel inside the signed-in Account card. */
export function SyncStatusPanel() {
  const backup = useBackupStatus();
  const { state } = useSyncStatus();
  const panel = useThemeColor({}, 'cardSecondary');
  const success = useThemeColor({}, 'success');
  const danger = useThemeColor({}, 'danger');
  const muted = useThemeColor({}, 'icon');
  const dot = backup.tone === 'success' ? success : backup.tone === 'error' ? danger : muted;
  const disabled = state.status === 'syncing' || state.isOffline || !isSyncConfigured();

  return (
    <View style={[styles.panel, { backgroundColor: panel }]}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <ThemedText type="label" style={styles.text} accessibilityLiveRegion="polite">{backup.text}</ThemedText>
      <Button variant="ghost" size="sm" label="Sync now" disabled={disabled} onPress={() => { void syncToSupabase(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderRadius: 14, paddingVertical: 8, paddingLeft: 14, paddingRight: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, minWidth: 120 },
});
