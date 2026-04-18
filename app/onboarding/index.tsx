import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function WelcomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

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
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
