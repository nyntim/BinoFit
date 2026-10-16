import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { retryRestore, signInWithApple } from '@/lib/auth';
import { isSyncConfigured } from '@/lib/sync-status';
import { describeProgress, describeRestore, type RestoreProgress } from '@/lib/restore';
import { APPLE_SIGN_IN_SUPPORTED } from '@/components/settings/AppleSignInButton';

export default function WelcomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsRetry, setNeedsRetry] = useState(false);

  async function handleRestore() {
    setRestoring(true);
    setMessage(null);
    setProgress(null);
    // After a failed restore the user is already signed in, so retry only the restore.
    const outcome = needsRetry
      ? ({ status: 'signedIn', restore: await retryRestore(setProgress) } as const)
      : await signInWithApple(setProgress);
    setRestoring(false);
    if (outcome.status === 'cancelled') return;
    if (outcome.status === 'error') {
      setMessage(outcome.message);
      return;
    }
    const { restore } = outcome;
    setNeedsRetry(!restore.ok);
    if (!restore.ok) {
      setMessage('Signed in, but your data could not be restored.');
    } else if (restore.goalsRestored) {
      router.replace('/(tabs)');
    } else {
      setMessage(describeRestore(restore));
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.emoji]}>🏋️</Text>
        <Text style={[styles.title, { color: colors.text }]}>Science-Based{'\n'}Fitness</Text>
        <Text style={[styles.subtitle, { color: colors.icon }]}>
          Track your nutrition with precision.{'\n'}Built on what the research actually says.
        </Text>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPress={() => router.push('/onboarding/goals' as any)}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
        {APPLE_SIGN_IN_SUPPORTED && isSyncConfigured() && (
          <>
            <TouchableOpacity
              style={styles.secondary}
              onPress={handleRestore}
              disabled={restoring}
              accessibilityRole="button"
              accessibilityLabel={needsRetry ? 'Retry restore' : 'Already use BinoFit? Sign in to restore'}
            >
              <Text style={[styles.secondaryText, { color: colors.tint }]}>
                {needsRetry ? 'Retry restore' : 'Already use BinoFit? Sign in to restore'}
              </Text>
            </TouchableOpacity>
            {restoring && (
              <View style={styles.status} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.tint} />
                <Text style={[styles.statusText, { color: colors.icon }]}>
                  {describeProgress(progress)}
                </Text>
              </View>
            )}
            {!restoring && message && (
              <Text style={[styles.statusText, styles.message, { color: colors.icon }]} accessibilityLiveRegion="polite">
                {message}
              </Text>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
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
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
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
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
