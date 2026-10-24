import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { NutritionTotals } from '@/lib/nutrition-totals';
import type { UserGoals } from '@/lib/types';

type Props = {
  consumed: NutritionTotals;
  goals: Pick<UserGoals, 'protein_goal' | 'carb_goal' | 'fat_goal'>;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Protein, carbs and fat against their goals. Over goal stays a full bar in the macro color. */
export function MacroCard({ consumed, goals }: Props) {
  const muted = useThemeColor({}, 'icon');
  const rows = [
    { label: 'Protein', value: round1(consumed.protein), goal: goals.protein_goal, color: MacroColors.protein },
    { label: 'Carbs', value: round1(consumed.carbs), goal: goals.carb_goal, color: MacroColors.carbs },
    { label: 'Fat', value: round1(consumed.fat), goal: goals.fat_goal, color: MacroColors.fat },
  ];
  return (
    <Card padding="compact" style={styles.card}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <View style={styles.header}>
            <ThemedText type="label">{row.label}</ThemedText>
            <ThemedText type="label" style={styles.value}>
              <ThemedText type="label" style={styles.bold}>{row.value}</ThemedText>
              <ThemedText type="label" style={{ color: muted }}>{` / ${row.goal} g`}</ThemedText>
            </ThemedText>
          </View>
          <ProgressBar
            value={row.value}
            max={row.goal}
            color={row.color}
            height={8}
            accessibilityLabel={`${row.label}, ${row.value} of ${row.goal} grams`}
          />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  row: { gap: 6 },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
  value: { fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '700' },
});
