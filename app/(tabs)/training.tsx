import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

// Placeholder until the Training tab is built (C8 replaces the Exercises and Log past workout entry rows).
export default function TrainingScreen() {
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const card = useThemeColor({}, 'cardBackground');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <Text style={[styles.title, { color: text }]} accessibilityRole="header">
        Training
      </Text>
      <Pressable
        onPress={() => router.push('/workout/exercises')}
        accessibilityRole="button"
        accessibilityLabel="Exercises"
        style={[styles.row, { backgroundColor: card }]}
      >
        <Text style={[styles.rowLabel, { color: text }]}>Exercises</Text>
        <IconSymbol name="chevron.right" size={20} color={muted} />
      </Pressable>
      <Pressable
        onPress={() => router.push('/workout/log')}
        accessibilityRole="button"
        accessibilityLabel="Log past workout"
        style={[styles.row, { backgroundColor: card }]}
      >
        <Text style={[styles.rowLabel, { color: text }]}>Log past workout</Text>
        <IconSymbol name="chevron.right" size={20} color={muted} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  row: {
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: { fontSize: 17, fontWeight: '600' },
});
