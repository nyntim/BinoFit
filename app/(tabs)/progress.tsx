import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WeightCard } from '@/components/progress/WeightCard';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function ProgressScreen() {
  const background = useThemeColor({}, 'background');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.title}>Progress</ThemedText>
        <WeightCard />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 34, marginBottom: 24 },
});
