import { StyleSheet, Text, View } from 'react-native';
import type { Colors } from '@/constants/theme';
import { formatNutrientValue } from '@/components/serving-picker/format';

export function MicroExpandRow({
  label, value, unit, colors,
}: {
  label: string;
  value: number | null;
  unit: string;
  colors: Pick<typeof Colors.light, 'icon' | 'text'>;
}) {
  const hasValue = value != null;
  return (
    <View
      style={styles.microExpandRow}
      accessible
      accessibilityLabel={hasValue ? `${label}, ${value} ${unit}` : `${label}, no data`}
    >
      <Text style={{ fontSize: 14, color: colors.icon, flexShrink: 1 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: hasValue ? '600' : '400', color: hasValue ? colors.text : colors.icon, fontVariant: ['tabular-nums'] }}>
        {hasValue ? `${formatNutrientValue(value!)} ${unit}` : 'No Data'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Micro expand rows
  microExpandRow: {
    gap: 12,
    flexWrap: 'wrap',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
