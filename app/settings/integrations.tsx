import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconTile, type IconTileTone } from '@/components/ui/IconTile';
import type { IconSymbolName } from '@/components/ui/icon-symbol';
import { Tag, type TagTone } from '@/components/ui/Tag';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useHealthKit } from '@/hooks/use-health-kit';
import { useAuth } from '@/hooks/useAuth';
import { countUnsynced } from '@/lib/auth';
import { isSyncConfigured } from '@/lib/sync-status';
import { getLastSyncAt } from '@/lib/storage';
import { syncToSupabase } from '@/lib/sync';
import { useSpotifyConnection } from '@/hooks/useSpotifyConnection';
import { connectSpotify } from '@/lib/spotify/connect';
import { disconnectSpotify } from '@/lib/spotify/session-store';

export default function IntegrationsSettings() {
  const separator = useThemeColor({}, 'separator');
  const panel = useThemeColor({}, 'cardSecondary');
  const text = useThemeColor({}, 'text');
  const secondary = useThemeColor({}, 'icon');
  const { state } = useSyncStatus();
  const auth = useAuth();
  const health = useHealthKit();
  const spotify = useSpotifyConnection();
  const [lastCloud, setLastCloud] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const retryLock = useRef(false);
  const configured = isSyncConfigured();
  const refresh = useCallback(() => {
    let active = true;
    countUnsynced().then((n) => { if (active) setPending(n); }).catch(() => { if (active) setPending(null); });
    getLastSyncAt().then((at) => { if (active) setLastCloud(at ? Date.parse(at) : null); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useFocusEffect(refresh);
  useEffect(refresh, [refresh, state.status]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => { if (next === 'active') refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  const cloudStatus = !configured ? 'Not configured' : state.isOffline ? 'Offline' : state.status === 'syncing' ? 'Syncing' : auth.status === 'none' ? 'No session' : state.status === 'failed' ? 'Sync failed' : state.status === 'success' ? 'Up to date' : 'Ready to sync';
  const last = state.lastSuccessAt ?? lastCloud;

  function header(icon: IconSymbolName, tone: IconTileTone, title: string, caption: string, tag?: { label: string; tone: TagTone }) {
    return (
      <View style={styles.header}>
        <IconTile icon={icon} tone={tone} size={40} />
        <View style={styles.headerCopy}>
          <ThemedText type="title" accessibilityRole="header">{title}</ThemedText>
          <ThemedText type="caption">{caption}</ThemedText>
        </View>
        {tag ? <Tag label={tag.label} tone={tag.tone} /> : null}
      </View>
    );
  }
  const panelRow = (label: string, value: string, first = false) => (
    <View key={label} style={[styles.panelRow, !first && { borderTopColor: separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.panelLabel, { color: text }]}>{label}</Text>
      <Text style={[styles.panelValue, { color: secondary }]}>{value}</Text>
    </View>
  );
  const healthStatus = health.syncing ? 'Syncing' : health.initFailed ? 'Access request failed' : health.syncFailed ? 'Sync failed' : health.syncV1 ? 'Access requested' : 'Not connected';

  return (
    <SettingsPage title="Integrations">
      <Card style={styles.card}>
        {header('icloud.fill', 'tint', 'Cloud sync', 'Backs up your log to your account', { label: cloudStatus, tone: cloudStatus === 'Up to date' ? 'tint' : 'neutral' })}
        {auth.status === 'anonymous' ? <ThemedText type="caption">This device has an anonymous cloud session. Sign in to restore on another device.</ThemedText> : null}
        <View style={[styles.panel, { backgroundColor: panel }]}>
          {panelRow('Last successful sync', last === null ? 'Never' : new Date(last).toLocaleString(), true)}
          {panelRow('Pending changes', pending === null ? 'Unavailable' : String(pending))}
        </View>
        <ThemedText type="caption">Includes food, meals, goals, profile, weight, workouts, custom exercises and routines, including pending deletions.</ThemedText>
        <Button variant="soft" label={state.status === 'failed' ? 'Retry cloud sync' : 'Sync now'} loading={retrying} disabled={!configured || retrying || state.status === 'syncing' || state.isOffline || auth.status === 'none'} onPress={async () => {
          if (retryLock.current) return;
          retryLock.current = true;
          setRetrying(true);
          try { await syncToSupabase(); refresh(); }
          finally { retryLock.current = false; setRetrying(false); }
        }} />
      </Card>

      <Card style={styles.card}>
        {header('heart.fill', 'neutral', 'Apple Health', 'Weight, steps, nutrition and workouts', { label: health.available ? healthStatus : 'Unavailable on this device', tone: 'neutral' })}
        <View style={[styles.panel, { backgroundColor: panel }]}>
          {panelRow('Last Health sync', health.lastSyncedAt?.toLocaleString() ?? 'Never', true)}
        </View>
        <View style={styles.buttons}>
          <Button variant="soft" label={health.syncFailed ? 'Retry Health sync' : health.syncV1 ? 'Sync now' : 'Connect and sync Health'} loading={health.syncing} disabled={!health.available || health.syncing} onPress={() => { void health.runSync(); }} />
          <Button variant="secondary" label="Permissions" accessibilityLabel="Manage Health permissions" disabled={!health.available} onPress={() => { Linking.openSettings().catch(() => setMessage('Could not open Settings. Open Health permissions from device Settings.')); }} />
        </View>
        <ThemedText type="caption">Reads weight, steps and active energy. Writes weight, nutrition totals and finished workouts. Health controls access to each data type. BinoFit cannot confirm read permission, and an empty result may mean access was denied.</ThemedText>
        <ThemedText type="caption">Open Settings, then Health, Data Access &amp; Devices, BinoFit. Enable the data types you want to share. Previously exported records remain in Health after sign-out or account deletion.</ThemedText>
      </Card>

      <Card style={styles.card}>
        {header('music.note', 'neutral', 'Spotify', 'Shows what is playing during a live workout and saves the playlist with the finished workout.', spotify.status === 'unconfigured' ? { label: 'Unavailable in this build', tone: 'neutral' } : spotify.status === 'connected' ? { label: 'Connected', tone: 'tint' } : spotify.status === 'reconnect' ? { label: 'Access ended', tone: 'neutral' } : undefined)}
        <ThemedText type="caption">BinoFit only reads playback. It never plays, pauses or skips.</ThemedText>
        {spotify.status === 'unconfigured' ? null : spotify.status === 'connected' ? (
          <>
            <Button variant="secondary" label="Disconnect Spotify" onPress={() => {
              Alert.alert('Disconnect Spotify?', 'Playlists already saved on workouts stay.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Disconnect', style: 'destructive', onPress: () => { disconnectSpotify().catch(() => {}); } },
              ]);
            }} />
            <ThemedText type="caption">To remove BinoFit&apos;s access completely, open your Spotify account settings, Apps.</ThemedText>
          </>
        ) : (
          <Button variant="secondary" size="lg" label="Connect Spotify" loading={spotify.connecting} disabled={spotify.connecting || spotify.status === 'loading'} onPress={async () => {
            setMessage(null);
            const result = await connectSpotify();
            if (result === 'error') setMessage('Could not connect Spotify. Check your connection and try again.');
          }} />
        )}
      </Card>
      {message && <View accessibilityLiveRegion="polite"><ThemedText type="caption">{message}</ThemedText></View>}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  panel: { borderRadius: 14, paddingHorizontal: 14 },
  panelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 38, paddingVertical: 6 },
  panelLabel: { fontSize: 14, flexShrink: 1 },
  panelValue: { fontSize: 14, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
