import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/hooks/useAuth';
import { isSyncConfigured } from '@/lib/sync-status';
import { getRestorePending } from '@/lib/storage';
import { prepareSignOut, retryRestore, signInWithApple, signOutAndWipe } from '@/lib/auth';
import { describeProgress, describeRestore, type RestoreProgress } from '@/lib/restore';
import {
  APPLE_SIGN_IN_SUPPORTED,
  AppleSignInButton,
} from '@/components/settings/AppleSignInButton';

export const SIGN_OUT_TITLE = 'Sign out of Apple?';

export function signOutWarning(unsynced: number): string {
  const lines = [
    'This removes your food log, meals, goals and profile from this device. Signing in again restores what is saved in your account.',
    "Water logs, meal confirmations and quick-add drinks aren't backed up and will be removed.",
  ];
  if (unsynced > 0) {
    lines.push(
      `${unsynced} ${unsynced === 1 ? 'item hasn\'t' : 'items haven\'t'} synced yet and won't be recoverable.`
    );
  }
  return lines.join('\n\n');
}

type Mode = 'signIn' | 'restore' | 'signOut';

/** Busy label. The restore progress text is used only once restore has reported progress. */
export function busyLabel(mode: Mode, progress: RestoreProgress | null): string {
  if (progress) return describeProgress(progress);
  if (mode === 'signIn') return 'Signing in…';
  if (mode === 'signOut') return 'Signing out…';
  return describeProgress(null);
}

/** Settings section for backing up to, and signing out of, an Apple account. */
export function AccountSection() {
  const { status, email } = useAuth();
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const danger = useThemeColor({}, 'danger');
  const card = useThemeColor({}, 'cardBackground');

  const [mode, setMode] = useState<Mode | null>(null);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [restorePending, setRestorePendingState] = useState(false);
  const busy = mode !== null;

  useEffect(() => {
    let active = true;
    getRestorePending().then((v) => {
      if (active) setRestorePendingState(v);
    });
    return () => {
      active = false;
    };
  }, [status, mode]);

  if (!isSyncConfigured()) return null;
  // Without Apple sign-in (Android, web) there is nothing to offer an anonymous user.
  if (status === 'none' || (status === 'anonymous' && !APPLE_SIGN_IN_SUPPORTED)) return null;

  async function handleSignIn() {
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
      setMode(null);
    }
  }

  async function handleRetry() {
    setMode('restore');
    setMessage(null);
    setProgress(null);
    try {
      const result = await retryRestore(setProgress);
      setMessage(result.ok ? describeRestore(result) : 'Could not restore your data.');
    } catch {
      setMessage('Could not restore your data.');
    } finally {
      setMode(null);
    }
  }

  async function handleSignOut() {
    setMode('signOut');
    setMessage(null);
    let unsynced = 0;
    try {
      unsynced = (await prepareSignOut()).unsynced;
    } catch {
      // Count unknown: continue with the generic warning.
    } finally {
      setMode(null);
    }
    Alert.alert(SIGN_OUT_TITLE, signOutWarning(unsynced), [
      { text: 'Cancel', style: 'cancel' },
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
            setMode(null);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: text }]}>Account</Text>

      {status === 'signedIn' ? (
        <>
          <View style={[styles.row, { backgroundColor: card }]}>
            <Text
              style={[styles.rowText, { color: text }]}
              accessibilityLabel={email ? `Signed in with Apple, ${email}` : 'Signed in with Apple'}
            >
              {email ? `Signed in with Apple · ${email}` : 'Signed in with Apple'}
            </Text>
          </View>
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
                accessibilityLabel="Restore data"
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
            accessibilityLabel="Sign out"
          >
            <Text style={[styles.signOutText, { color: danger }]}>Sign Out</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[styles.hint, { color: icon }]}>
            Sign in to back up your log and restore it on a new phone.
          </Text>
          <AppleSignInButton onPress={handleSignIn} disabled={busy} />
        </>
      )}

      {busy && mode && (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <ActivityIndicator color={tint} />
          <Text style={[styles.statusText, { color: icon }]}>{busyLabel(mode, progress)}</Text>
        </View>
      )}
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
  signOutBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', minHeight: 44 },
  signOutText: { fontSize: 16, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  statusText: { fontSize: 13, lineHeight: 18, flexShrink: 1 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  retryText: { fontSize: 15, fontWeight: '600' },
});
