import { Pressable, StyleSheet, Text } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 'radio' for single-choice rows (regions), 'checkbox' for multi-select (muscles). */
  role?: 'radio' | 'checkbox';
  /** Muscle chips are 36pt tall with 8/14 padding; region chips are 6/14. */
  size?: 'regular' | 'compact';
};

export function ChipToggle({ label, selected, onPress, role = 'checkbox', size = 'regular' }: Props) {
  const subtle = useThemeColor({}, 'cardSecondary');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');

  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      style={[
        styles.chip,
        size === 'compact' ? styles.compact : styles.regular,
        { backgroundColor: selected ? tint : subtle },
      ]}
    >
      <Text style={[styles.label, { color: selected ? background : muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 20, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  regular: { minHeight: 36, paddingVertical: 8 },
  compact: { minHeight: 32, paddingVertical: 6 },
  label: { fontSize: 13, fontWeight: '500' },
});
