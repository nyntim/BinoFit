import { StyleSheet, View } from 'react-native';
import { MacroBar } from '@/components/macro-bar';
import { ProgressCardHeader } from '@/components/progress/ProgressCardHeader';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { NutritionTotals } from '@/lib/nutrition-totals';
import type { UserGoals } from '@/lib/types';

type Props = {
  avg: NutritionTotals | null;
  goals: UserGoals | null;
};

export function AveragesCard({ avg, goals }: Props) {
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const track = useThemeColor({}, 'track');

  const rows = [
    { label: 'Protein', value: avg?.protein ?? 0, goal: goals?.protein_goal, color: MacroColors.protein },
    { label: 'Carbs', value: avg?.carbs ?? 0, goal: goals?.carb_goal, color: MacroColors.carbs },
    { label: 'Fat', value: avg?.fat ?? 0, goal: goals?.fat_goal, color: MacroColors.fat },
  ];

  return (
    <Card style={styles.card}>
      <ProgressCardHeader label="Macros, daily average" />
      {avg == null ? (
        <ThemedText type="label">Averages appear after a full logged day.</ThemedText>
      ) : (
        <View style={styles.rows}>
          {rows.map((r) => (
            <MacroBar
              key={r.label}
              label={r.label}
              consumed={r.value}
              goal={r.goal}
              color={r.color}
              trackColor={track}
              textColor={text}
              subTextColor={icon}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  rows: { gap: 4 },
});
