import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { SyncStatusPanel } from '@/components/settings/SyncStatusPanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ListGroup, ListRow } from '@/components/ui/ListGroup';
import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/hooks/useAuth';
import { isSyncConfigured } from '@/lib/sync-status';
import { getRestorePending } from '@/lib/storage';
import { getLastAuthIssue } from '@/lib/auth-debug';
import { canDeleteAccount, deleteAccountAndWipe, getPendingAccountDeletion, removePendingDeletionDeviceData, type PendingAccountDeletion, prepareSignOut, retryRestore, signInWithApple, signOutAndWipe } from '@/lib/auth';
import type { AuthMethod } from '@/lib/types';
import { describeProgress, describeRestore, type RestoreProgress } from '@/lib/restore';
import {
  APPLE_SIGN_IN_SUPPORTED,
  AppleSignInButton,
} from '@/components/settings/AppleSignInButton';

export const SIGN_OUT_TITLE = 'Sign out?';

export function signOutWarning(unsynced: number): string {
  const lines = [
    'This removes your food logs, meals, goals, profile, weight entries, workouts, routines and custom exercises from this device. Signing in again restores what is saved in your account.',
    "Water logs, active and draft workouts, meal confirmations and quick-add drinks aren't backed up and will be removed.",
  ];
  if (unsynced > 0) {
    lines.push(
      `${unsynced} ${unsynced === 1 ? 'item hasn\'t' : 'items haven\'t'} synced yet and won't be recoverable.`
    );
  }
  return lines.join('\n\n');
}

/** Row text for the signed-in account. */
export function signedInLabel(method: AuthMethod | null, email: string | null): string {
  if (method === 'apple') return email ? `Signed in with Apple · ${email}` : 'Signed in with Apple';
  return email ? `Signed in as ${email}` : 'Signed in';
}

type Mode = 'signIn' | 'restore' | 'signOut' | 'delete';

/** Busy label. The restore progress text is used only once restore has reported progress. */
export function busyLabel(mode: Mode, progress: RestoreProgress | null): string {
  if (progress) return describeProgress(progress);
  if (mode === 'signIn') return 'Signing in…';
  if (mode === 'delete') return 'Deleting account…';
  if (mode === 'signOut') return 'Signing out…';
  return describeProgress(null);
}

/** Settings section for signing up, signing in and out, and changing the account password. */
export function AccountSection({ showTitle = true }: { showTitle?: boolean } = {}) {
  const { status, email, method } = useAuth();
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const tintSoft = useThemeColor({}, 'tintSoft');

  const [mode, setMode] = useState<Mode | null>(null);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [restorePending, setRestorePendingState] = useState(false);
  const busy = mode !== null;
  const actionLock = useRef(false);
  const [deletionAvailable, setDeletionAvailable] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<PendingAccountDeletion>(null);
  useEffect(() => {
    let active = true;
    getPendingAccountDeletion().then((phase) => { if (active) setPendingDeletion(phase); }).catch(() => setMessage('Could not check pending account deletion.'));
    return () => { active = false; };
  }, [status, mode]);
  useEffect(() => {
    let active = true;
    canDeleteAccount().then((ok) => { if (active) setDeletionAvailable(ok); });
    return () => { active = false; };
  }, [status, mode]);

  useEffect(() => {
    let active = true;
    getRestorePending().then((v) => {
      if (active) setRestorePendingState(v);
    });
    return () => {
      active = false;
    };
  }, [status, mode]);

  // accessibilityLiveRegion is Android-only; VoiceOver needs an explicit announcement.
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  const devIssue = __DEV__ ? getLastAuthIssue() : null;
  const devRow = __DEV__ ? (
    <Card padding="compact">
      <Text style={[styles.rowText, { color: icon }]} selectable>
        {`Auth: last error · ${devIssue ? `${devIssue.step}: ${devIssue.summary}` : 'none'}`}
      </Text>
    </Card>
  ) : null;

  if (!isSyncConfigured() && !pendingDeletion) {
    return devRow ? (
      <View style={styles.section}>
        {showTitle && <ThemedText type="title" accessibilityRole="header">Account</ThemedText>}
        {devRow}
      </View>
    ) : null;
  }

  function openAccount(mode: 'signUp' | 'signIn' | 'changePassword') {
    router.push({ pathname: '/account', params: { mode } } as never);
  }

  async function finishPendingDeletion(deviceOnly = false) {
    if (actionLock.current) return;
    actionLock.current = true;
    setMode('delete');
    setMessage(null);
    try {
      const result = await (deviceOnly ? removePendingDeletionDeviceData() : deleteAccountAndWipe());
      if (result.ok) router.replace('/onboarding');
      else setMessage(result.message);
    } finally { actionLock.current = false; setMode(null); }
  }

  function handleDeviceOnlyRemoval() {
    Alert.alert('Remove device data only?', 'Cloud account deletion has not been verified. This removes all food logs, meals, goals, profile, weight, workouts, routines, custom data and device-only data from this device. Your account and cloud data may still exist. Check the account separately. This cannot be undone on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove device data only', style: 'destructive', onPress: () => { void finishPendingDeletion(true); } },
    ]);
  }

  function handleDelete() {
    if (actionLock.current) return;
    actionLock.current = true;
    setMode('delete');
    Alert.alert('Delete account?', 'Permanently delete your account, cloud food logs, meals, goals, profile, weight entries, workouts, routines and custom foods and exercises. Device-only water logs, active and draft workouts, meal confirmations and quick-add drinks are also removed. Apple Health records already exported remain in Health. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel', onPress: () => { actionLock.current = false; setMode(null); } },
      { text: 'Delete account', style: 'destructive', onPress: async () => {
        try {
          const result = await deleteAccountAndWipe();
          if (result.ok) router.replace('/onboarding');
          else setMessage(result.message);
        } finally { actionLock.current = false; setMode(null); }
      } },
    ], { cancelable: false });
  }

  async function handleSignIn() {
    if (actionLock.current) return;
    actionLock.current = true;
    setMode('signIn');
    setMessage(null);
    setProgress(null);
    try {
      const outcome = await signInWithApple(setProgress);
      if (outcome.status === 'error') setMessage(outcome.message);
      if (outcome.status === 'signedIn') {
        setMessage(
          outcome.restore.ok
            ? describeRestore(outcome.restore)
            : 'Signed in, but your data could not be restored.'
        );
      }
    } catch {
      setMessage('Sign-in failed. Try again.');
    } finally {
      actionLock.current = false;
      setMode(null);
    }
  }

  async function handleRetry() {
    if (actionLock.current) return;
    actionLock.current = true;
    setMode('restore');
    setMessage(null);
    setProgress(null);
    try {
      const result = await retryRestore(setProgress);
      setMessage(result.ok ? describeRestore(result) : 'Could not restore your data.');
    } catch {
      setMessage('Could not restore your data.');
    } finally {
      actionLock.current = false;
      setMode(null);
    }
  }

  async function handleSignOut() {
    if (actionLock.current) return;
    actionLock.current = true;
    setMode('signOut');
    setMessage(null);
    let unsynced = 0;
    try {
      unsynced = (await prepareSignOut()).unsynced;
    } catch {
      // Count unknown: continue with the generic warning.
    }
    Alert.alert(SIGN_OUT_TITLE, signOutWarning(unsynced), [
      { text: 'Cancel', style: 'cancel', onPress: () => { actionLock.current = false; setMode(null); } },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setMode('signOut');
          try {
            const result = await signOutAndWipe();
            if (result.ok) router.replace('/onboarding');
            else setMessage(result.message);
          } catch {
            setMessage('Could not sign out. Try again.');
          } finally {
            actionLock.current = false;
            setMode(null);
          }
        },
      },
    ], { cancelable: false });
  }

  const initial = (email?.trim().charAt(0) || 'B').toUpperCase();
  const methodLabel = method === 'apple' ? 'Signed in with Apple' : method === 'email' ? 'Signed in with email' : 'Signed in';

  return (
    <View style={styles.section}>
      {showTitle && <ThemedText type="title" accessibilityRole="header">Account</ThemedText>}

      {pendingDeletion ? (
        <Card style={styles.card}>
          <ThemedText type="body">{pendingDeletion === 'confirmed' ? 'Cloud deletion is confirmed. Finish removing data from this device.' : 'Deletion has not been confirmed. Device data is kept and cloud sync is paused.'}</ThemedText>
          <Button variant="danger" label="Finish deletion" disabled={busy} onPress={() => { void finishPendingDeletion(); }} />
          {pendingDeletion === 'requested' && <Button variant="danger" label="Remove device data only" disabled={busy} onPress={handleDeviceOnlyRemoval} />}
        </Card>
      ) : status === 'signedIn' ? (
        <>
          <Card style={styles.card}>
            <View style={styles.identity}>
              <View style={[styles.avatar, { backgroundColor: tintSoft }]} accessible={false} importantForAccessibility="no-hide-descendants">
                <Text style={[styles.initial, { color: tint }]}>{initial}</Text>
              </View>
              <View style={styles.identityCopy}>
                <ThemedText type="title">{email ?? 'Signed in'}</ThemedText>
                <ThemedText type="caption">{methodLabel}</ThemedText>
              </View>
            </View>
            <SyncStatusPanel />
          </Card>
          <ListGroup>
            {restorePending && (
              <ListRow
                title="Your data has not been restored."
                trailing={<Button variant="soft" size="sm" label="Restore data" disabled={busy} onPress={handleRetry} />}
              />
            )}
            {method === 'email' && <ListRow title="Change password" disabled={busy} onPress={() => openAccount('changePassword')} />}
            <ListRow title="Sign out" chevron={false} disabled={busy} onPress={handleSignOut} />
          </ListGroup>
          <ThemedText type="caption" style={styles.caption}>Signing out removes your log from this phone. Your backup stays in your account.</ThemedText>
          <ThemedText type="section" accessibilityRole="header">Delete</ThemedText>
          <ListGroup>
            <ListRow
              title="Delete account and backup"
              subtitle={deletionAvailable ? undefined : 'Deletion is unavailable until the server capability is verified. Connect and retry.'}
              destructive
              chevron={false}
              disabled={busy || !deletionAvailable}
              onPress={handleDelete}
            />
          </ListGroup>
          <ThemedText type="caption" style={styles.caption}>Deleting is permanent. Export your data first from Data and privacy.</ThemedText>
        </>
      ) : (
        <Card style={styles.card}>
          <ThemedText type="title">Not signed in</ThemedText>
          <ThemedText type="body" style={{ color: icon }}>
            Sign in to back up your log and restore it on a new phone.
          </ThemedText>
          {APPLE_SIGN_IN_SUPPORTED && (
            <AppleSignInButton type="signIn" onPress={handleSignIn} disabled={busy} />
          )}
          <Button size="lg" label="Sign up with email" disabled={busy} onPress={() => openAccount('signUp')} />
          <Button variant="ghost" label="Sign in" fullWidth disabled={busy} onPress={() => openAccount('signIn')} />
        </Card>
      )}

      {busy && mode && (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <ActivityIndicator color={tint} />
          <Text style={[styles.statusText, { color: icon }]}>{busyLabel(mode, progress)}</Text>
        </View>
      )}
      {devRow}
      {!busy && message && (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <Text style={[styles.statusText, { color: icon }]}>{message}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  card: { gap: 12 },
  caption: { paddingHorizontal: 4 },
  rowText: { fontSize: 15 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityCopy: { flex: 1, minWidth: 0, gap: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: Fonts.rounded, fontSize: 18, fontWeight: '800' },
  status: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  statusText: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
});
