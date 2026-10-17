import { StyleSheet, Text, View } from 'react-native';
import { MacroBar } from '@/components/macro-bar';
import { MacroColors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { NutritionTotals } from '@/lib/nutrition-totals';
import type { UserGoals } from '@/lib/types';

type Props = {
  avg: NutritionTotals | null;
  goals: UserGoals | null;
};

export function AveragesCard({ avg, goals }: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const icon = useThemeColor({}, 'icon');
  const track = useThemeColor({}, 'track');

  const hasGoals = goals != null;
  const rows = [
    { label: 'Protein', value: avg?.protein ?? 0, goal: goals?.protein_goal, color: MacroColors.protein },
    { label: 'Carbs', value: avg?.carbs ?? 0, goal: goals?.carb_goal, color: MacroColors.carbs },
    { label: 'Fat', value: avg?.fat ?? 0, goal: goals?.fat_goal, color: MacroColors.fat },
  ];

  return (
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Macro averages
        </Text>
        <Text style={[styles.subtitle, { color: icon }]}>
          {hasGoals ? 'Per logged day, against current goals' : 'Per logged day'}
        </Text>
      </View>
      {avg == null ? (
        <Text style={[styles.empty, { color: icon }]}>Averages appear after a full logged day.</Text>
      ) : (
        <View style={styles.rows}>
          {rows.map((r) => (
            <MacroBar
              key={r.label}
              label={r.label}
              consumed={avg ? r.value : 0}
              goal={r.goal}
              color={r.color}
              trackColor={track}
              textColor={text}
              subTextColor={icon}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 20, gap: 16 },
  head: { gap: 4 },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22 },
  subtitle: { fontSize: 12 },
  empty: { fontSize: 13, fontWeight: '500' },
  rows: { gap: 4 },
});
