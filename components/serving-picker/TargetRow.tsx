import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatNum } from '@/components/serving-picker/format';

/** Already eaten in the macro color, then this food as a pale segment. Over goal stays a full bar. */
export function TargetRow({
  label, eaten, add, goal, unit, color, tint,
}: {
  label: string;
  eaten: number;
  add: number;
  goal: number;
  unit: string;
  color: string;
  tint: string;
}) {
  const spokenUnit = unit === 'cal' ? 'calories' : 'grams';
  return (
    <View style={styles.targetBlock}>
      <View style={styles.targetTop}>
        <ThemedText type="label">{label}</ThemedText>
        <ThemedText type="label" style={styles.nums}>
          <ThemedText type="label" style={styles.bold}>{formatNum(eaten + add)}</ThemedText>
          {` / ${formatNum(goal)} ${unit}`}
        </ThemedText>
      </View>
      <ProgressBar
        value={eaten}
        max={Math.max(goal, 1)}
        preview={add}
        previewColor={tint}
        color={color}
        height={8}
        accessibilityLabel={`${label}, ${formatNum(eaten + add)} of ${formatNum(goal)} ${spokenUnit} after this food`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  targetBlock: { gap: 6 },
  targetTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
  nums: { fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '700' },
});
