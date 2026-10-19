import { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { setOnboardingComplete } from '@/lib/storage';
import { homeRouteFor } from '@/lib/tracking-mode';
import { getDatabase } from '@/lib/database';

export default function CompleteScreen() {
  const background = useThemeColor({}, 'background');
  const icon = useThemeColor({}, 'icon');
  const text = useThemeColor({}, 'text');
  const tint = useThemeColor({}, 'tint');
  const colors = { background, icon, text, tint };

  useEffect(() => {
    // Initialize DB in background while user reads the screen
    getDatabase().catch(console.error);
  }, []);

  async function handleStart() {
    await setOnboardingComplete();
    router.replace(homeRouteFor());
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={styles.emoji}>✅</Text>
        <Text style={[styles.title, { color: colors.text }]}>You&apos;re all set!</Text>
        <Text style={[styles.subtitle, { color: colors.icon }]}>
          Your goals have been saved. Start logging your food to track your progress.
        </Text>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={handleStart}
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>Start Tracking</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emoji: { fontSize: 72, marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  subtitle: { fontSize: 17, textAlign: 'center', lineHeight: 26 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
  button: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
