import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { IconTile } from '@/components/ui/IconTile';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { WorkoutSummary } from '@/lib/types';

type Props = { workouts?: WorkoutSummary[] };

/** Completed workouts for the day as tappable cards; nothing when there are none. */
export function DayWorkouts({ workouts = [] }: Props) {
  const router = useRouter();
  const icon = useThemeColor({}, 'icon');
  if (workouts.length === 0) return null;
  return (
    <View style={styles.list}>
      {workouts.map((summary) => {
        const detail = [summary.durationLabel, summary.detailLabel].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={summary.id}
            onPress={() => router.push(`/workout/${summary.id}`)}
            accessibilityRole="button"
            accessibilityLabel={[summary.title, summary.durationLabel, summary.detailLabel].filter(Boolean).join('. ')}
          >
            <Card padding="compact" style={styles.row}>
              <IconTile icon="dumbbell.fill" size={40} />
              <View style={styles.copy}>
                <ThemedText type="title" numberOfLines={2}>{summary.title}</ThemedText>
                {detail ? <ThemedText type="caption">{detail}</ThemedText> : null}
              </View>
              <IconSymbol name="chevron.right" size={16} color={icon} />
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
});
