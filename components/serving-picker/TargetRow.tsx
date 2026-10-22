import { StyleSheet, Text, View } from 'react-native';
import type { Colors } from '@/constants/theme';
import { formatNum, percent } from '@/components/serving-picker/format';

// Already eaten in the macro color, then this food as a pale segment
export function TargetRow({
  label, eaten, add, goal, unit, color, tint, colors,
}: {
  label: string;
  eaten: number;
  add: number;
  goal: number;
  unit: string;
  color: string;
  tint: string;
  colors: Pick<typeof Colors.light, 'text' | 'track'>;
}) {
  const g = Math.max(goal, 1);
  const eatenFrac = Math.min(eaten / g, 1);
  const addFrac = Math.max(Math.min((eaten + add) / g, 1) - eatenFrac, 0);
  const spokenUnit = unit === 'cal' ? 'calories' : 'grams';
  return (
    <View
      style={styles.targetBlock}
      accessible
      accessibilityLabel={`${label}, ${formatNum(eaten + add)} of ${formatNum(goal)} ${spokenUnit}`}
    >
      <View style={styles.targetTop}>
        <Text style={[styles.targetLabel, { color: colors.text }]}>{label}</Text>
        <View style={styles.targetNums}>
          <Text style={[styles.targetNum, styles.targetEaten, { color: colors.text }]}>{formatNum(eaten + add)}</Text>
          <Text style={[styles.targetNum, { color: colors.text }]}>/</Text>
          <Text style={[styles.targetNum, styles.targetGoal, { color: colors.text }]}>{formatNum(goal)}</Text>
          <Text style={[styles.targetNum, styles.targetUnit, { color: colors.text }]}>{unit}</Text>
        </View>
      </View>
      <View style={[styles.targetTrack, { backgroundColor: colors.track }]}>
        <View style={{ width: percent(eatenFrac), backgroundColor: color }} />
        <View style={{ width: percent(addFrac), backgroundColor: tint }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  targetBlock: { gap: 6 },
  targetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  targetLabel: { fontSize: 12, fontWeight: '600' },
  targetNums: { flexDirection: 'row', gap: 4 },
  targetNum: { fontSize: 12, fontVariant: ['tabular-nums'] },
  targetEaten: { minWidth: 36, textAlign: 'right' },
  targetGoal: { minWidth: 32, textAlign: 'right' },
  targetUnit: { minWidth: 22 },
  targetTrack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
});
