import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
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
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const card = useThemeColor({}, 'cardBackground');
  const onTint = useThemeColor({}, 'background');

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
    <View style={[styles.row, { backgroundColor: card }]}>
      <Text style={[styles.rowText, { color: icon }]} selectable>
        {`Auth: last error · ${devIssue ? `${devIssue.step}: ${devIssue.summary}` : 'none'}`}
      </Text>
    </View>
  ) : null;

  if (!isSyncConfigured() && !pendingDeletion) {
    return devRow ? (
      <View style={styles.section}>
        {showTitle && <Text style={[styles.sectionTitle, { color: text }]}>Account</Text>}
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

  return (
    <View style={styles.section}>
      {showTitle && <Text style={[styles.sectionTitle, { color: text }]}>Account</Text>}

      {pendingDeletion ? (
        <View style={[styles.row, { backgroundColor: card }]}>
          <Text style={[styles.hint, { color: text }]}>{pendingDeletion === 'confirmed' ? 'Cloud deletion is confirmed. Finish removing data from this device.' : 'Deletion has not been confirmed. Device data is kept and cloud sync is paused.'}</Text>
          <TouchableOpacity style={styles.ghostBtn} accessibilityRole="button" disabled={busy} onPress={() => { void finishPendingDeletion(); }}>
            <Text style={[styles.retryText, { color: tint }]}>Finish deletion</Text>
          </TouchableOpacity>
          {pendingDeletion === 'requested' && <TouchableOpacity style={styles.ghostBtn} accessibilityRole="button" disabled={busy} onPress={handleDeviceOnlyRemoval}>
            <Text style={[styles.retryText, { color: tint }]}>Remove device data only</Text>
          </TouchableOpacity>}
        </View>
      ) : status === 'signedIn' ? (
        <>
          <View style={[styles.row, { backgroundColor: card }]}>
            <Text style={[styles.rowText, { color: text }]}>
              {signedInLabel(method, email)}
            </Text>
          </View>
          {method === 'email' && (
            <TouchableOpacity
              style={[styles.row, styles.actionRow, { backgroundColor: card }]}
              onPress={() => openAccount('changePassword')}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={[styles.rowText, { color: tint }]}>Change password</Text>
            </TouchableOpacity>
          )}
          {restorePending && (
            <View style={[styles.row, styles.restoreRow, { backgroundColor: card }]}>
              <Text style={[styles.rowText, styles.restoreText, { color: text }]}>
                Your data has not been restored.
              </Text>
              <TouchableOpacity
                style={styles.retry}
                onPress={handleRetry}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={[styles.retryText, { color: tint }]}>Restore data</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={[styles.signOutBtn, { backgroundColor: card }]}
            onPress={handleSignOut}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={[styles.signOutText, { color: danger }]}>Sign Out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, { backgroundColor: card }]} disabled={busy || !deletionAvailable} onPress={handleDelete} accessibilityRole="button" accessibilityState={{ disabled: busy || !deletionAvailable }}>
            <Text style={[styles.rowText, { color: deletionAvailable ? tint : icon }]}>Delete account</Text>
            {!deletionAvailable && <Text style={[styles.hint, { color: icon }]}>Deletion is unavailable until the server capability is verified. Connect and retry.</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[styles.hint, { color: icon }]}>
            Sign in to back up your log and restore it on a new phone.
          </Text>
          {APPLE_SIGN_IN_SUPPORTED && (
            <View style={styles.apple}>
              <AppleSignInButton type="signIn" onPress={handleSignIn} disabled={busy} />
            </View>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: tint }]}
            onPress={() => openAccount('signUp')}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={[styles.actionBtnText, { color: onTint }]}>Sign up with email</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => openAccount('signIn')}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={[styles.retryText, { color: tint }]}>Sign in</Text>
          </TouchableOpacity>
        </>
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
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  hint: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  row: { borderRadius: 12, padding: 16, marginBottom: 8 },
  rowText: { fontSize: 15 },
  restoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  restoreText: { flex: 1 },
  apple: { marginBottom: 8 },
  actionRow: { minHeight: 44, justifyContent: 'center' },
  actionBtn: { minHeight: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  actionBtnText: { fontSize: 17, fontWeight: '600' },
  ghostBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  signOutBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', minHeight: 44 },
  signOutText: { fontSize: 17, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  statusText: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  retryText: { fontSize: 17, fontWeight: '600' },
});
