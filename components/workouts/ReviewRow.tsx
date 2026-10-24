import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';

type Props = {
  label: string;
  value: string;
  onPress: () => void;
};

/** One line of the builder review list (inside a `ListGroup`): label, value, chevron. Tapping jumps to that step. */
export function ReviewRow({ label, value, onPress }: Props) {
  const muted = useThemeColor({}, 'icon');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Change`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <ThemedText type="body" style={[styles.label, { color: muted }]}>{label}</ThemedText>
      <ThemedText type="body" style={styles.value}>{value}</ThemedText>
      <View>
        <IconSymbol name="chevron.right" size={16} color={muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 16, minHeight: 54 },
  label: { width: 112, flexShrink: 0 },
  value: { flex: 1, minWidth: 0, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
