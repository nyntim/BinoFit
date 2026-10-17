import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { ProgressRange } from '@/lib/progress';

const CHIPS: { id: ProgressRange; label: string }[] = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: 'all', label: 'All' },
];

type Props = {
  value: ProgressRange;
  onChange: (range: ProgressRange) => void;
};

export function RangeChips({ value, onChange }: Props) {
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const secondary = useThemeColor({}, 'cardSecondary');
  const text = useThemeColor({}, 'text');

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Range">
      {CHIPS.map((chip) => {
        const selected = chip.id === value;
        return (
          <TouchableOpacity
            key={chip.id}
            style={[styles.chip, { backgroundColor: selected ? tint : secondary }]}
            onPress={() => onChange(chip.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={chip.label}
          >
            <Text style={[styles.label, { color: selected ? background : text }]}>{chip.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    minWidth: 64,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '500' },
});
