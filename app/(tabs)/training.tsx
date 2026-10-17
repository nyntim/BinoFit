import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';

// Placeholder until the Training tab is built.
export default function TrainingScreen() {
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <Text style={[styles.title, { color: text }]} accessibilityRole="header">
        Training
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 28, fontWeight: '700' },
});
