import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatNutrientValue } from '@/components/serving-picker/format';

export function MicroExpandRow({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  const icon = useThemeColor({}, 'icon');
  const hasValue = value != null;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={hasValue ? `${label}, ${value} ${unit}` : `${label}, no data`}
    >
      <ThemedText type="body" style={[styles.label, { color: icon }]}>{label}</ThemedText>
      <ThemedText type="body" style={[styles.value, hasValue ? styles.known : { color: icon }]}>
        {hasValue ? `${formatNutrientValue(value!)} ${unit}` : 'No Data'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 12, flexWrap: 'wrap', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { flexShrink: 1 },
  value: { fontVariant: ['tabular-nums'] },
  known: { fontWeight: '600' },
});
