import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { AuthForm, isAuthFormMode } from '@/components/auth/AuthForm';
import { useAccountModeGuard } from '@/components/auth/useAccountModeGuard';
import { applyAuthRoute } from '@/components/auth/applyAuthRoute';

/** Account modal opened from Settings. `mode` is signUp (default), signIn or changePassword. */
export default function AccountScreen() {
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
        <Pressable
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          onPress={() => router.back()}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityState={{ disabled: busy }}
        >
          <Text style={[styles.closeText, { color: tint }]}>Close</Text>
        </Pressable>
      </View>
      <AuthForm initialMode={initialMode} context="settings" onRoute={applyAuthRoute} onBusyChange={setBusy} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  close: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-start' },
  closeText: { fontSize: 17 },
  pressed: { opacity: 0.6 },
});
