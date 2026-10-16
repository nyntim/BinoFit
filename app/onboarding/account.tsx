import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { AuthForm, isAuthFormMode } from '@/components/auth/AuthForm';
import { useAccountModeGuard } from '@/components/auth/useAccountModeGuard';
import { applyAuthRoute } from '@/components/auth/applyAuthRoute';

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
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => router.back()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
        >
          <Text style={[styles.backText, { color: tint }]}>Back</Text>
        </TouchableOpacity>
      </View>
      <AuthForm initialMode={initialMode} context="onboarding" onRoute={applyAuthRoute} onBusyChange={setBusy} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  back: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  backText: { fontSize: 17 },
});
