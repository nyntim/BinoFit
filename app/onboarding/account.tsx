import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { AuthForm, isAuthFormMode } from '@/components/auth/AuthForm';
import { useAccountModeGuard } from '@/components/auth/useAccountModeGuard';
import { applyAuthRoute } from '@/components/auth/applyAuthRoute';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';

/** Onboarding sign-up / sign-in. `mode` is signUp (default) or signIn. */
export default function OnboardingAccountScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const initialMode = isAuthFormMode(mode) ? mode : 'signUp';
  const [busy, setBusy] = useState(false);
  const dismiss = useCallback(() => {
    applyAuthRoute({ to: 'back' });
  }, []);
  useAccountModeGuard(initialMode, dismiss);
  const background = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <OnboardingHeader step={1} onBack={() => router.back()} backDisabled={busy} />
      <AuthForm initialMode={initialMode} context="onboarding" onRoute={applyAuthRoute} onBusyChange={setBusy} />
      <View style={styles.footer}>
        <ThemedText type="caption" style={styles.footerText}>
          By continuing you agree to the{' '}
          <ThemedText
            type="caption"
            style={[styles.link, { color: tint }]}
            accessibilityRole="link"
            onPress={busy ? undefined : () => router.push('/settings/terms')}
          >
            Terms
          </ThemedText>{' '}
          and{' '}
          <ThemedText
            type="caption"
            style={[styles.link, { color: tint }]}
            accessibilityRole="link"
            onPress={busy ? undefined : () => router.push('/settings/privacy-policy')}
          >
            Privacy Policy
          </ThemedText>
          .
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  footer: { paddingHorizontal: 24, paddingVertical: 12 },
  footerText: { textAlign: 'center' },
  link: { fontWeight: '600' },
});
