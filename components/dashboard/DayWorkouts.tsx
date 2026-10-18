import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { WorkoutHistoryRow } from '@/components/workouts/WorkoutHistoryRow';
import type { WorkoutSummary } from '@/lib/types';

type Props = { workouts: WorkoutSummary[] };

export function DayWorkouts({ workouts }: Props) {
  const router = useRouter();
  const cardBackground = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  if (workouts.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: cardBackground }]}>
      <Text style={[styles.title, { color: text }]}>Training</Text>
      {workouts.map((summary, index) => (
        <WorkoutHistoryRow
          key={summary.id}
          summary={summary}
          last={index === workouts.length - 1}
          onPress={() => router.push(`/workout/${summary.id}`)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 16, marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
});
