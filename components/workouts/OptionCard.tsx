import { Pressable, StyleSheet, Text } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
};

/** A full-width single-choice card with a 1.5px tint border when selected. */
export function OptionCard({ label, description, selected, onPress }: Props) {
  const card = useThemeColor({}, 'cardBackground');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'icon');
  const tint = useThemeColor({}, 'tint');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      style={[styles.card, { backgroundColor: card, borderColor: selected ? tint : 'transparent' }]}
    >
      <Text style={[styles.label, { color: text }]}>{label}</Text>
      {description ? <Text style={[styles.desc, { color: muted }]}>{description}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 2,
    justifyContent: 'center',
  },
  label: { fontSize: 17, fontWeight: '600' },
  desc: { fontSize: 13 },
});
