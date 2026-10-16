import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/hooks/useAuth';
import { retryRestore, signInWithApple } from '@/lib/auth';
import { routeAfterAuth } from '@/lib/auth-routing';
import { getRestorePending, getUserGoals } from '@/lib/storage';
import { isSyncConfigured } from '@/lib/sync-status';
import { describeProgress, type RestoreProgress } from '@/lib/restore';
import { APPLE_SIGN_IN_SUPPORTED, AppleSignInButton } from '@/components/settings/AppleSignInButton';
import { applyAuthRoute } from '@/components/auth/applyAuthRoute';

export default function WelcomeScreen() {
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const separator = useThemeColor({}, 'separator');
  const { status } = useAuth();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [restorePending, setRestorePending] = useState(false);
  const accountsAvailable = isSyncConfigured();
  const signedIn = status === 'signedIn';

  // Derived from storage so it survives leaving and returning to this screen.
  const refreshPending = useCallback(() => {
    getRestorePending().then(setRestorePending).catch(() => {});
  }, []);
  useEffect(() => {
    refreshPending();
  }, [refreshPending, status]);

  function show(next: string | null) {
    setMessage(next);
    if (next) AccessibilityInfo.announceForAccessibility(next);
  }

  function goToGoals() {
    router.push('/onboarding/goals' as any);
  }

  function goToAccount(mode: 'signUp' | 'signIn') {
    router.push({ pathname: '/onboarding/account', params: { mode } } as any);
  }

  /** Already signed in with nothing to restore: go on to the dashboard if goals exist. */
  async function handleContinueSignedIn() {
    const goals = await getUserGoals();
    await applyAuthRoute(goals ? { to: 'tabs', completeOnboarding: true } : { to: 'goals' });
  }

  async function handleApple() {
    if (busy) return;
    setBusy(true);
    show(null);
    setProgress(null);
    try {
      // After a failed restore the user is already signed in, so retry only the restore.
      const outcome =
        signedIn && restorePending
          ? ({ status: 'signedIn', restore: await retryRestore(setProgress) } as const)
          : await signInWithApple(setProgress);
      const route = routeAfterAuth(outcome, 'onboarding');
      if (route.to === 'stay') show(route.message ?? null);
      else await applyAuthRoute(route);
    } catch {
      show('Sign-in failed. Try again.');
    } finally {
      refreshPending();
      setBusy(false);
    }
  }

  const primary = [styles.button, { backgroundColor: tint }];
  const ghost = [styles.button, styles.ghost, { borderColor: separator }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={styles.content}>
          <Text style={[styles.emoji]}>🏋️</Text>
          <Text style={[styles.title, { color: text }]}>Science-Based{'\n'}Fitness</Text>
          <Text style={[styles.subtitle, { color: icon }]}>
            Track your nutrition with precision.{'\n'}Built on what the research actually says.
          </Text>
        </View>
        <View style={styles.footer}>
          {!accountsAvailable ? (
            <TouchableOpacity style={primary} onPress={goToGoals} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: background }]}>Continue</Text>
            </TouchableOpacity>
          ) : signedIn && restorePending ? (
            <TouchableOpacity style={primary} onPress={handleApple} disabled={busy} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: background }]}>Restore data</Text>
            </TouchableOpacity>
          ) : signedIn ? (
            <TouchableOpacity style={primary} onPress={handleContinueSignedIn} accessibilityRole="button">
              <Text style={[styles.buttonText, { color: background }]}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <>
              {APPLE_SIGN_IN_SUPPORTED && (
                <View style={styles.apple}>
                  <AppleSignInButton type="signUp" onPress={handleApple} disabled={busy} />
                </View>
              )}
              <TouchableOpacity
                style={primary}
                onPress={() => goToAccount('signUp')}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: background }]}>Sign up with email</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[...ghost, styles.gap]} onPress={goToGoals} disabled={busy} accessibilityRole="button">
                <Text style={[styles.ghostText, { color: text }]}>Continue without an account</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondary}
                onPress={() => goToAccount('signIn')}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryText, { color: tint }]}>Already have an account? Sign in</Text>
              </TouchableOpacity>
            </>
          )}
          {busy && (
            <View style={styles.status} accessibilityLiveRegion="polite">
              <ActivityIndicator color={tint} />
              <Text style={[styles.statusText, { color: icon }]}>{describeProgress(progress)}</Text>
            </View>
          )}
          {!busy && message && (
            <Text style={[styles.statusText, styles.message, { color: icon }]} accessibilityLiveRegion="polite">
              {message}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: { flexGrow: 1 },
  ghost: { borderWidth: 1 },
  ghostText: { fontSize: 17, fontWeight: '600' },
  gap: { marginTop: 8 },
  content: {
    flex: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emoji: {
    fontSize: 72,
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 44,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 26,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  button: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    minHeight: 44,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  statusText: { fontSize: 13, lineHeight: 18 },
  message: { textAlign: 'center', marginTop: 4 },
  apple: { marginBottom: 8 },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
