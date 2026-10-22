import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SettingsPage, SettingsRow } from '@/components/settings/SettingsPage';
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
  return (
    <SettingsPage title="Integrations">
      <Text style={[styles.heading, { color: text }]}>Cloud sync</Text>
      <SettingsRow label="Status" value={cloudStatus} description={auth.status === 'anonymous' ? 'This device has an anonymous cloud session. Sign in to restore on another device.' : undefined} />
      <SettingsRow label="Last successful sync" value={last === null ? 'Never' : new Date(last).toLocaleString()} />
      <SettingsRow label="Pending changes" value={pending === null ? 'Unavailable' : String(pending)} description="Includes food, meals, goals, profile, weight, workouts, custom exercises and routines, including pending deletions." />
      <SettingsRow label={state.status === 'failed' ? 'Retry cloud sync' : 'Sync now'} disabled={!configured || retrying || state.status === 'syncing' || state.isOffline || auth.status === 'none'} onPress={async () => {
        if (retryLock.current) return;
        retryLock.current = true;
        setRetrying(true);
        try { await syncToSupabase(); refresh(); }
        finally { retryLock.current = false; setRetrying(false); }
      }} />
      <Text style={[styles.heading, { color: text }]}>Apple Health</Text>
      <SettingsRow label="Availability" value={health.available ? 'Available' : 'Unavailable on this device'} />
      <Text style={[styles.body, { color: secondary }]}>Reads weight, steps and active energy. Writes weight, nutrition totals and finished workouts. Health controls access to each data type. BinoFit cannot confirm read permission, and an empty result may mean access was denied.</Text>
      <SettingsRow label="Health sync" value={health.syncing ? 'Syncing' : health.initFailed ? 'Access request failed' : health.syncFailed ? 'Sync failed' : health.syncV1 ? 'Access requested' : 'Not connected'} />
      <SettingsRow label="Last successful Health sync" value={health.lastSyncedAt?.toLocaleString() ?? 'Never'} />
      <SettingsRow label={health.syncFailed ? 'Retry Health sync' : 'Connect and sync Health'} disabled={!health.available || health.syncing} onPress={() => { void health.runSync(); }} />
      <SettingsRow label="Manage Health permissions" description="Open Settings, then Health, Data Access & Devices, BinoFit. Enable the data types you want to share. Previously exported records remain in Health after sign-out or account deletion." disabled={!health.available} onPress={() => { Linking.openSettings().catch(() => setMessage('Could not open Settings. Open Health permissions from device Settings.')); }} />
      <Text style={[styles.heading, { color: text }]}>Spotify</Text>
      <Text style={[styles.body, { color: secondary }]}>Shows what is playing during a live workout and saves the playlist with the finished workout. BinoFit only reads playback. It never plays, pauses or skips.</Text>
      {spotify.status === 'unconfigured' ? (
        <SettingsRow label="Spotify" value="Unavailable in this build" />
      ) : spotify.status === 'connected' ? (
        <>
          <SettingsRow label="Status" value="Connected" />
          <SettingsRow label="Disconnect Spotify" onPress={() => {
            Alert.alert('Disconnect Spotify?', 'Playlists already saved on workouts stay.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Disconnect', style: 'destructive', onPress: () => { disconnectSpotify().catch(() => {}); } },
            ]);
          }} />
          <Text style={[styles.body, { color: secondary }]}>To remove BinoFit&apos;s access completely, open your Spotify account settings, Apps.</Text>
        </>
      ) : (
        <>
          {spotify.status === 'reconnect' && <SettingsRow label="Status" value="Access ended" />}
          <SettingsRow label="Connect Spotify" disabled={spotify.connecting || spotify.status === 'loading'} onPress={async () => {
            setMessage(null);
            const result = await connectSpotify();
            if (result === 'error') setMessage('Could not connect Spotify. Check your connection and try again.');
          }} />
        </>
      )}
      {message && <View accessibilityLiveRegion="polite"><Text style={[styles.body, { color: secondary }]}>{message}</Text></View>}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  heading: { fontSize: 17, fontWeight: '600', marginTop: 24, marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 23, marginVertical: 8 },
});
