import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { MacroColors } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { RestoreBackup } from '@/components/onboarding/RestoreBackup';
import { useAuth } from '@/hooks/useAuth';
import { retryRestore, signInWithApple } from '@/lib/auth';
import { routeAfterAuth } from '@/lib/auth-routing';
import { getLoggedDates } from '@/lib/database';
import { getRestorePending, getUserGoals } from '@/lib/storage';
import { isSyncConfigured } from '@/lib/sync-status';
import { describeProgress, type RestoreProgress } from '@/lib/restore';
import { APPLE_SIGN_IN_SUPPORTED, AppleSignInButton } from '@/components/settings/AppleSignInButton';
import { applyAuthRoute } from '@/components/auth/applyAuthRoute';

export default function WelcomeScreen() {
  const { restart } = useLocalSearchParams<{ restart?: string }>();
  const icon = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const chartBar = useThemeColor({}, 'chartBar');
  const tintSoft = useThemeColor({}, 'tintSoft');
  const background = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'cardBackground');
  const danger = useThemeColor({}, 'danger');
  const { status, email } = useAuth();
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
    router.push({ pathname: '/onboarding/goals', params: { restart } });
  }

  function goToAccount(mode: 'signUp' | 'signIn') {
    router.push({ pathname: '/onboarding/account', params: { mode } } as any);
  }

  /** Already signed in with nothing to restore: go on to the home tab if data exists. */
  async function handleContinueSignedIn() {
    const [goals, loggedDates] = await Promise.all([
      getUserGoals(),
      getLoggedDates().catch(() => [] as string[]),
    ]);
    await applyAuthRoute(goals || loggedDates.length > 0 ? { to: 'tabs', completeOnboarding: true } : { to: 'goals' });
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

  if (restart !== '1' && accountsAvailable && signedIn && restorePending) {
    return (
      <RestoreBackup
        email={email}
        busy={busy}
        statusText={describeProgress(progress)}
        message={message}
        onRestore={handleApple}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        <View style={[styles.circleLarge, { backgroundColor: tintSoft }]} />
        <View style={[styles.circleSmall, { backgroundColor: tintSoft }]} />
      </View>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
          <View style={styles.hero}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.dino}
              accessibilityRole="image"
              accessibilityLabel="BinoFit dinosaur"
            />
            <ThemedText type="heading" accessibilityRole="header" style={styles.headline}>
              Eat, train and watch it add up.
            </ThemedText>
            <ThemedText style={[styles.body, { color: icon }]}>
              Log a meal in seconds, run your workouts and see the weeks take shape. No account needed to start.
            </ThemedText>
            <View style={styles.chips}>
              <Chip label="Nutrition" dot={MacroColors.protein} surface="card" />
              <Chip label="Training" dot={tint} surface="card" />
              <Chip label="Progress" dot={chartBar} surface="card" />
            </View>
          </View>
          <View style={styles.spacer} />
          <View style={styles.actions}>
            {restart === '1' || !accountsAvailable ? (
              <Button label="Continue" size="lg" onPress={goToGoals} />
            ) : signedIn ? (
              <Button label="Continue" size="lg" onPress={handleContinueSignedIn} />
            ) : (
              <>
                {APPLE_SIGN_IN_SUPPORTED && <AppleSignInButton type="signUp" onPress={handleApple} disabled={busy} />}
                <Button
                  label="Sign up with email"
                  size="lg"
                  variant="secondary"
                  style={{ backgroundColor: cardBackground }}
                  onPress={() => goToAccount('signUp')}
                  disabled={busy}
                />
                <Button label="Continue without an account" size="lg" variant="ghost" onPress={goToGoals} disabled={busy} />
                <Pressable
                  style={styles.signIn}
                  onPress={() => goToAccount('signIn')}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Already have an account? Sign in"
                  accessibilityState={{ disabled: busy }}
                >
                  <Text style={[styles.signInText, { color: icon }]}>
                    Already have an account? <Text style={[styles.signInLink, { color: tint }]}>Sign in</Text>
                  </Text>
                </Pressable>
              </>
            )}
            {busy && (
              <View style={styles.status} accessibilityLiveRegion="polite">
                <ActivityIndicator color={tint} />
                <ThemedText type="label" style={{ color: icon }}>{describeProgress(progress)}</ThemedText>
              </View>
            )}
            {!busy && message && (
              <ThemedText type="label" style={[styles.message, { color: danger }]} accessibilityLiveRegion="polite">
                {message}
              </ThemedText>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  circleLarge: { position: 'absolute', top: -120, left: -80, width: 560, height: 560, borderRadius: 280, opacity: 0.7 },
  circleSmall: { position: 'absolute', top: 140, right: -140, width: 320, height: 320, borderRadius: 160 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24, gap: 28 },
  hero: { gap: 16 },
  dino: { width: 132, height: 132 },
  headline: { fontSize: 40, lineHeight: 43, letterSpacing: -0.8 },
  body: { fontSize: 17, lineHeight: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  spacer: { flex: 1 },
  actions: { gap: 10 },
  signIn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  signInText: { fontSize: 13, fontWeight: '500' },
  signInLink: { fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  message: { textAlign: 'center' },
});
