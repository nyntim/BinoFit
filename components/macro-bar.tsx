import { View, Text, StyleSheet } from 'react-native';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useThemeColor } from '@/hooks/use-theme-color';

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
  /** Track fill; defaults to the theme `track`. */
  trackColor?: string;
};

export function MacroBar({ label, consumed, goal, color, textColor, subTextColor, trackColor, decimalPlaces = 0 }: Props) {
  const track = useThemeColor({}, 'track');
  const hasGoal = goal != null && goal > 0;
  const shown = Number(consumed.toFixed(decimalPlaces));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        <Text style={[styles.values, { color: textColor }]}>
          {shown}g
          {hasGoal && <Text style={{ color: subTextColor }}> / {goal}g</Text>}
        </Text>
      </View>
      {hasGoal && <ProgressBar value={consumed} max={goal} color={color} trackColor={trackColor ?? track} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 10, gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 12 },
  label: { fontSize: 13, fontWeight: '500' },
  values: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
});
