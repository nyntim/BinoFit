import { StyleSheet, Text, View } from 'react-native';

export function CalorieStat({
  label,
  value,
  textColor,
  subColor,
}: {
  label: string;
  value: number;
  textColor: string;
  subColor: string;
}) {
  return (
    <View>
      <Text style={[styles.calorieStatValue, { color: textColor }]}>{value.toLocaleString()}</Text>
      <Text style={[styles.calorieStatLabel, { color: subColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  calorieStatValue: { fontSize: 18, fontWeight: '700' },
  calorieStatLabel: { fontSize: 12, marginTop: 1 },
});
