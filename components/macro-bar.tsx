import { View, Text, StyleSheet } from 'react-native';

type Props = {
  label: string;
  consumed: number;
  /** Omit to show grams only, with no target. */
  goal?: number;
  /** Display precision; existing consumers keep whole grams. */
  decimalPlaces?: number;
  color: string;
  textColor: string;
  subTextColor: string;
  /** Track fill; defaults to the macro color at 20% opacity. */
  trackColor?: string;
};

export function MacroBar({ label, consumed, goal, color, textColor, subTextColor, trackColor, decimalPlaces = 0 }: Props) {
  const hasGoal = goal != null && goal > 0;
  const progress = hasGoal ? Math.min(consumed / goal, 1) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        <Text style={[styles.values, { color: textColor }]}>
          {Number(consumed.toFixed(decimalPlaces))}g
          {hasGoal && <Text style={{ color: subTextColor }}> / {goal}g</Text>}
        </Text>
      </View>
      {hasGoal && (
        <View style={[styles.track, { backgroundColor: trackColor ?? color + '33' }]}>
          <View style={[styles.fill, { backgroundColor: color, width: `${progress * 100}%` as `${number}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  label: { fontSize: 14, fontWeight: '600' },
  values: { fontSize: 13, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
