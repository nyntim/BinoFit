import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** Compact segmented pill (radio group) used by Units and the effort scale. */
export function PillSwitch<T extends string>({ value, options, onChange, accessibilityLabel }: Props<T>) {
  const muted = useThemeColor({}, 'icon');
  const subtle = useThemeColor({}, 'cardSecondary');
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');

  return (
    <View
      style={[styles.switch, { backgroundColor: subtle }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segment, selected && { backgroundColor: tint }]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.segmentText, { color: selected ? background : muted }]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: '100%', borderRadius: 20, padding: 3 },
  segment: {
    maxWidth: '100%',
    flexShrink: 1,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentText: { fontSize: 13, fontWeight: '600' },
});
