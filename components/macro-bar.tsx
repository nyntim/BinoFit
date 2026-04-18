import { View, Text, StyleSheet } from 'react-native';

type Props = {
  label: string;
  consumed: number;
  goal: number;
  color: string;
  textColor: string;
  subTextColor: string;
};

export function MacroBar({ label, consumed, goal, color, textColor, subTextColor }: Props) {
  const progress = Math.min(consumed / Math.max(goal, 1), 1);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        <Text style={[styles.values, { color: subTextColor }]}>
          {Math.round(consumed)}g / {goal}g
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: color + '33' }]}>
        <View style={[styles.fill, { backgroundColor: color, width: `${progress * 100}%` as `${number}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  label: { fontSize: 14, fontWeight: '600' },
  values: { fontSize: 13 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
