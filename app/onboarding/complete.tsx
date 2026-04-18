import { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { setOnboardingComplete } from '@/lib/storage';
import { getDatabase } from '@/lib/database';

export default function CompleteScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    // Initialize DB in background while user reads the screen
    getDatabase().catch(console.error);
  }, []);

  async function handleStart() {
    await setOnboardingComplete();
    router.replace('/(tabs)');
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
          <Text style={styles.buttonText}>Start Tracking</Text>
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
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
