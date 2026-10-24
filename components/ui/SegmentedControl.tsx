import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useShadow } from '@/hooks/useShadow';

type Option<T extends string> = { value: T; label: string; accessibilityLabel?: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Name of the radio group, read before the options. */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

/** Segmented radio group (bf.css `.seg`): equal segments on a nested track, the selected one raised. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel, style }: Props<T>) {
  const track = useThemeColor({}, 'cardSecondary');
  const raised = useThemeColor({}, 'raised');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const shadow = useShadow('segment');

  return (
    <View style={[styles.track, { backgroundColor: track }, style]} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected, checked: selected }}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: raised, boxShadow: shadow },
              pressed && !selected && styles.pressed,
            ]}
          >
            <Text style={[styles.label, { color: selected ? text : muted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14 },
  segment: { flex: 1, minHeight: 36, borderRadius: 10, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 6 },
  pressed: { opacity: 0.7 },
});
